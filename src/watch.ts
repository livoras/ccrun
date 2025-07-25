import { parse } from 'yaml';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { pathToFileURL } from 'url';
import { ActionClient } from './action-client';
import { Config, ProcessorFunction, ProcessorContext } from './types';
import { createTrigger, Trigger } from './triggers';
import ProcessorRegistry, { ProcessorRegistryContext } from './processor-registry';
import { registerBuiltinProcessors } from './processors/index';

class Pipeline {
  private processors: Array<{ type: 'function' | 'task' | 'builtin', handler: ProcessorFunction | string, processorName?: string }> = [];
  private configPath: string;
  private actionClient: ActionClient;
  private currentTaskId?: string;
  private currentTask: any = null;
  private config: Config;
  private trigger?: Trigger;
  private history: any[] = [];

  constructor(config: Config, configPath: string) {
    this.config = config;
    this.configPath = configPath;
    this.actionClient = new ActionClient();
  }

  private createTools() {
    const tools: any = {};
    const processorNames = ProcessorRegistry.getNames();
    
    for (const name of processorNames) {
      const definition = ProcessorRegistry.get(name)!;
      
      if (definition.parseArgs) {
        // For processors that accept arguments
        tools[name] = (...args: any[]) => {
          // Return a promise that will execute the processor
          return new Promise(async (resolve) => {
            const registryContext: ProcessorRegistryContext = {
              actionClient: this.actionClient,
              currentTaskId: this.currentTaskId,
              configPath: this.configPath,
              updateTask: async (taskId: number) => {
                this.currentTask = await this.actionClient.getTask(taskId);
              }
            };
            
            const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
            const currentData = this.history[this.history.length - 1];
            const result = await handler(args, currentData, registryContext);
            resolve(result);
          });
        };
      } else {
        // For simple processors (no arguments)
        tools[name] = () => {
          return new Promise((resolve) => {
            const handler = definition.handler as ProcessorFunction;
            const currentData = this.history[this.history.length - 1];
            const context: ProcessorContext = {
              history: [...this.history],
              taskId: this.currentTaskId,
              task: this.currentTask,
              tools: this.createTools()
            };
            
            handler(currentData, (newData) => {
              resolve(newData);
            }, context);
          });
        };
      }
    }
    
    return tools;
  }

  async loadProcessors() {
    for (const item of this.config.run) {
      if (typeof item === 'string') {
        // Check for task() function with or without arguments
        const taskMatch = item.match(/^task\s*\((.*)\)$/);
        if (taskMatch) {
          this.processors.push({ type: 'task', handler: item });
        } else {
          // Check if it's a built-in processor or a processor with arguments
          const funcMatch = item.match(/^(\w+)(?:\s*\((.*)\))?$/);
          if (funcMatch) {
            const processorName = funcMatch[1];
            const args = funcMatch[2];
            
            // Check if it's a registered processor
            if (ProcessorRegistry.has(processorName)) {
              const definition = ProcessorRegistry.get(processorName)!;
              
              if (args !== undefined && definition.parseArgs) {
                // Processor with arguments (like addTags, removeTags)
                this.processors.push({ 
                  type: 'builtin', 
                  handler: `${processorName}(${args})`,
                  processorName 
                });
              } else if (!args) {
                // Simple processor (like json, log)
                this.processors.push({ 
                  type: 'builtin', 
                  handler: definition.handler as ProcessorFunction,
                  processorName 
                });
              } else {
                throw new Error(`Processor ${processorName} does not accept arguments`);
              }
              continue;
            }
          }
          
          // Not a built-in processor, treat as file
          // JS/TS file processor
          const filePath = this.resolveFilePath(item);
          const fileUrl = pathToFileURL(filePath).href;
          const module = await import(fileUrl);
          const handler = module.default;
          
          if (typeof handler !== 'function') {
            throw new Error(`Default export from ${filePath} is not a function`);
          }
          
          this.processors.push({ type: 'function', handler });
        }
      }
    }
  }

  private resolveFilePath(item: string): string {
    const configDir = dirname(this.configPath);
    
    // Remove (.js) or (.ts) suffix and try both extensions
    const basePath = item.replace(/\(\.(js|ts)\)$/, '');
    const possibleExts = ['.ts', '.js'];
    
    for (const ext of possibleExts) {
      const fullPath = resolve(configDir, basePath + ext);
      // Check if file exists by attempting to access it
      try {
        require.resolve(fullPath);
        return fullPath;
      } catch {
        // File doesn't exist with this extension, try next
        continue;
      }
    }
    
    // If no file found, return the original path and let the error bubble up
    return resolve(configDir, item);
  }

  async execute(data: any) {
    let currentData = data;
    this.history = [data]; // Start with original data
    
    // Get task info if we have a task ID
    if (this.currentTaskId) {
      try {
        this.currentTask = await this.actionClient.getTask(parseInt(this.currentTaskId));
      } catch (error) {
        console.error('[Pipeline] Failed to get task info:', error);
      }
    }
    
    for (let i = 0; i < this.processors.length; i++) {
      const processor = this.processors[i];
      
      if (processor.type === 'task') {
        // Task processor - create a new task
        console.log('[Pipeline] Creating new task...');
        const projectPath = dirname(this.configPath);
        
        // Parse task() arguments
        const taskCall = processor.handler as string;
        const match = taskCall.match(/^task\s*\((.*)\)$/);
        const argsStr = match ? match[1].trim() : '';
        
        let taskName = `Task ${new Date().toISOString()}`;
        let description = 'Auto-created task from watch pipeline';
        let tags: string[] = [];
        let logo: string | undefined;
        
        if (argsStr) {
          // Parse arguments using a simple parser
          const args = this.parseTaskArgs(argsStr, currentData);
          if (args.length > 0 && args[0] !== undefined) taskName = String(args[0]);
          if (args.length > 1 && args[1] !== undefined) description = String(args[1]);
          if (args.length > 2 && Array.isArray(args[2])) tags = args[2].map(String);
          if (args.length > 3 && args[3] !== undefined) logo = String(args[3]);
        }
        
        const result = await this.actionClient.createTask(
          taskName,
          description,
          tags,
          logo,
          projectPath
        );
        this.currentTaskId = result.id.toString();
        console.log(`[Pipeline] Task created with ID: ${this.currentTaskId}, name: ${taskName}`);
        
        // Update currentTask with the newly created task
        this.currentTask = result;
      } else if (processor.type === 'function') {
        // Function processor
        const handler = processor.handler as ProcessorFunction;
        let nextCalled = false;
        let nextData: any;
        
        // Create context for this processor
        const context: ProcessorContext = {
          history: [...this.history], // Copy of history array
          taskId: this.currentTaskId,
          task: this.currentTask,
          tools: this.createTools()
        };
        
        await new Promise<void>((resolve) => {
          handler(currentData, (newData) => {
            nextCalled = true;
            nextData = newData;
            resolve();
          }, context);
          
          // If handler is sync and doesn't call next, resolve immediately
          setTimeout(() => {
            if (!nextCalled) {
              resolve();
            }
          }, 0);
        });
        
        if (!nextCalled) {
          // If next wasn't called, stop the pipeline
          break;
        }
        
        currentData = nextData;
        this.history.push(currentData); // Add to history after processing
      } else if (processor.type === 'builtin') {
        // Built-in processor from registry
        const definition = ProcessorRegistry.get(processor.processorName!);
        if (!definition) {
          throw new Error(`Built-in processor ${processor.processorName} not found in registry`);
        }
        
        if (definition.parseArgs) {
          // Processor with arguments (like addTags, removeTags)
          const match = (processor.handler as string).match(/^(\w+)\s*\((.*)\)$/);
          const argsStr = match ? match[2].trim() : '';
          
          // Parse arguments using new Function with data and context
          const parseContext = {
            history: [...this.history],
            taskId: this.currentTaskId,
            task: this.currentTask,
            tools: this.createTools()
          };
          const func = new Function('data', 'context', `return [${argsStr}]`);
          const parsedArgs = func(currentData, parseContext);
          
          // Create registry context
          const registryContext: ProcessorRegistryContext = {
            actionClient: this.actionClient,
            currentTaskId: this.currentTaskId,
            configPath: this.configPath,
            updateTask: async (taskId: number) => {
              this.currentTask = await this.actionClient.getTask(taskId);
            }
          };
          
          // Call the processor with parsed arguments
          const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
          currentData = await handler(parsedArgs, currentData, registryContext);
          this.history.push(currentData);
        } else {
          // Simple processor (like json, log)
          const handler = processor.handler as ProcessorFunction;
          let nextCalled = false;
          let nextData: any;
          
          // Create context for this processor
          const context: ProcessorContext = {
            history: [...this.history],
            taskId: this.currentTaskId,
            task: this.currentTask,
            tools: this.createTools()
          };
          
          await new Promise<void>((resolve) => {
            handler(currentData, (newData) => {
              nextCalled = true;
              nextData = newData;
              resolve();
            }, context);
            
            // If handler is sync and doesn't call next, resolve immediately
            setTimeout(() => {
              if (!nextCalled) {
                resolve();
              }
            }, 0);
          });
          
          if (!nextCalled) {
            // If next wasn't called, stop the pipeline
            break;
          }
          
          currentData = nextData;
          this.history.push(currentData);
        }
      }
    }
  }

  
  private parseTaskArgs(argsStr: string, data: any): any[] {
    // Use new Function to parse arguments with data and context
    const parseContext = {
      history: this.history,
      taskId: this.currentTaskId,
      task: this.currentTask,
      tools: this.createTools()
    };
    const func = new Function('data', 'context', `return [${argsStr}]`);
    return func(data, parseContext);
  }
  
  

  start() {
    // Create and start the appropriate trigger
    this.trigger = createTrigger(this.config);
    
    console.log(`[Pipeline] Starting trigger: ${this.config.name}`);
    if (this.config.description) {
      console.log(`[Pipeline] Description: ${this.config.description}`);
    }
    
    // Start the trigger with our execute callback
    this.trigger.start(async (data) => {
      await this.execute(data).catch(err => {
        console.error('[Pipeline] Execution error:', err);
      });
    });
  }
  
  stop() {
    if (this.trigger) {
      console.log(`[Pipeline] Stopping trigger: ${this.config.name}`);
      this.trigger.stop();
    }
  }
}

async function main() {
  // Register built-in processors
  registerBuiltinProcessors();
  
  const configFile = process.argv[2];
  
  if (!configFile) {
    console.error('Usage: watch <config.yaml>');
    console.error('\nExample config formats:');
    console.error('  SSE mode:     type: sse, sse: <url>');
    console.error('  Crontab mode: type: crontab, crontab: "*/5 * * * *"');
    console.error('  Webhook mode: type: webhook, port: 3000, path: /webhook');
    process.exit(1);
  }
  
  const configPath = resolve(process.cwd(), configFile);
  const configContent = await readFile(configPath, 'utf-8');
  let config = parse(configContent) as any;
  
  // Add config file path to the config
  config.configPath = configPath;
  
  // Backward compatibility: if no type field, assume SSE mode
  if (!config.type && config.sse) {
    console.log('[Pipeline] No type specified, assuming SSE mode for backward compatibility');
    config.type = 'sse';
    // Set default name if not provided
    if (!config.name) {
      config.name = 'Legacy SSE Pipeline';
    }
  }
  
  // Validate required fields
  if (!config.run || !Array.isArray(config.run)) {
    throw new Error('Invalid config: "run" field must be an array');
  }
  
  if (!config.type) {
    throw new Error('Invalid config: "type" field is required (sse, crontab, or watch)');
  }
  
  if (!config.name) {
    throw new Error('Invalid config: "name" field is required');
  }
  
  // Type-specific validation
  switch (config.type) {
    case 'sse':
      if (!config.sse) {
        throw new Error('SSE config requires "sse" field with URL');
      }
      break;
    case 'crontab':
      if (!config.crontab) {
        throw new Error('Crontab config requires "crontab" field with cron expression');
      }
      break;
    case 'webhook':
      if (!config.port) {
        throw new Error('Webhook config requires "port" field');
      }
      break;
    default:
      throw new Error(`Unknown trigger type: ${config.type}`);
  }
  
  const pipeline = new Pipeline(config as Config, configPath);
  await pipeline.loadProcessors();
  
  console.log(`[Pipeline] Loaded ${config.run.length} processors`);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Pipeline] Shutting down...');
    pipeline.stop();
    process.exit(0);
  });
  
  // Start the pipeline with the configured trigger
  pipeline.start();
}

main().catch(error => {
  console.error('[Pipeline] Failed to start:', error);
  process.exit(1);
});