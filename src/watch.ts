import { parse } from 'yaml';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { pathToFileURL } from 'url';
import { runCC } from './cc-core';
import { ActionClient } from './action-client';
import { Config, ProcessorFunction, ProcessorContext } from './types';
import { createTrigger, Trigger } from './triggers';

class Pipeline {
  private processors: Array<{ type: 'function' | 'command' | 'task', handler: ProcessorFunction | string }> = [];
  private configPath: string;
  private actionClient: ActionClient;
  private currentTaskId?: string;
  private config: Config;
  private trigger?: Trigger;

  constructor(config: Config, configPath: string) {
    this.config = config;
    this.configPath = configPath;
    this.actionClient = new ActionClient();
  }

  async loadProcessors() {
    for (const item of this.config.run) {
      if (typeof item === 'string') {
        // Check for task() function with or without arguments
        const taskMatch = item.match(/^task\s*\((.*)\)$/);
        if (taskMatch) {
          this.processors.push({ type: 'task', handler: item });
        }
        // Check for agent(), ccrun(), or cc() function syntax
        else if (item.match(/^(agent|ccrun|cc)\s*\((.*)\)$/)) {
          const funcMatch = item.match(/^(agent|ccrun|cc)\s*\((.*)\)$/);
          const funcName = funcMatch![1];
          // Extract content from function(...)
          const content = funcMatch![2].trim();
          
          // Validate that arguments are provided
          if (!content) {
            throw new Error(`${funcName}() requires at least one argument`);
          }
          
          // Parse comma-separated arguments
          const args = this.parseCommandArgs(content);
          const commandStr = this.buildCommandString(args);
          this.processors.push({ type: 'command', handler: commandStr });
        } else if (item.startsWith('@{') && item.endsWith('}')) {
          // Command processor (quoted @{} syntax)
          this.processors.push({ type: 'command', handler: item });
        } else if (item === 'json') {
          // Built-in json processor
          const jsonProcessorPath = resolve(__dirname, 'processors/json.js');
          try {
            const fileUrl = pathToFileURL(jsonProcessorPath).href;
            const module = await import(fileUrl);
            const handler = module.default;
            this.processors.push({ type: 'function', handler });
            console.log('[Pipeline] Loaded built-in json processor');
          } catch (error) {
            console.error(`Failed to load built-in json processor:`, error);
            throw error;
          }
        } else {
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
    const history: any[] = [data]; // Start with original data
    
    // Get task info if we have a task ID
    let currentTask: any = null;
    if (this.currentTaskId) {
      // Get task info - if it fails, just log and continue without task info
      currentTask = await this.actionClient.getTask(parseInt(this.currentTaskId)).catch(error => {
        console.error('[Pipeline] Failed to get task info:', error);
        return null;
      });
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
        currentTask = result;
      } else if (processor.type === 'function') {
        // Function processor
        const handler = processor.handler as ProcessorFunction;
        let nextCalled = false;
        let nextData: any;
        
        // Create context for this processor
        const context: ProcessorContext = {
          history: [...history], // Copy of history array
          taskId: this.currentTaskId,
          task: currentTask
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
        history.push(currentData); // Add to history after processing
      } else {
        // Command processor
        const command = processor.handler as string;
        console.log(`[Pipeline] Executing command processor: ${command}`);
        currentData = await this.executeCommand(command, currentData);
        console.log(`[Pipeline] Command completed successfully`);
        history.push(currentData); // Add to history after processing
      }
    }
  }

  private async executeCommand(command: string, data: any): Promise<any> {
    console.log(`[Command] Executing: ${command}`);
    
    // Parse @{process.md *data} format
    const match = command.match(/@\{([^}]+)\}/);
    if (!match) {
      console.log('[Command] No match found for command format');
      return data;
    }
    
    const content = match[1];
    // Split by spaces but respect quoted strings
    const parts: string[] = [];
    const regex = /[^\s"]+|"([^"]*)"/gi;
    let match2;
    while ((match2 = regex.exec(content))) {
      parts.push(match2[1] || match2[0]);
    }
    
    // Determine if first part is a file or direct prompt
    let isFile = false;
    let cmdFile = '';
    let cmdArgs = parts;
    
    // Check if the entire content is quoted (direct command mode)
    // If not quoted, treat first part as file
    if (parts.length > 0 && !content.startsWith('"') && !content.startsWith("'")) {
      isFile = true;
      cmdFile = parts[0];
      cmdArgs = parts.slice(1);
    }
    
    const processedArgs = cmdArgs.map(arg => {
      // Only replace *data when it's exactly *data, not part of a string
      if (arg === '*data') {
        // If data is already a string, pass it directly
        // Otherwise, stringify it
        return typeof data === 'string' ? data : JSON.stringify(data);
      }
      // Replace *data within strings
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      return arg.replace(/\*data/g, dataStr);
    });
    
    console.log(`[Command] Mode: ${isFile ? 'file' : 'direct'}, File: ${cmdFile}, Args:`, processedArgs);
    
    // Always use the actual project root, not relative to config file
    const packageRoot = resolve(__dirname, '..');
    
    // Call runCC directly
    let response: string | void;
    
    if (isFile) {
      // File mode
      const cmdFilePath = resolve(dirname(this.configPath), cmdFile);
      if (processedArgs.length > 0) {
        response = await runCC({
          filePath: cmdFilePath,
          userInput: processedArgs.join(' '),
          packageRoot,
          taskId: this.currentTaskId
        });
      } else {
        response = await runCC({
          filePath: cmdFilePath,
          packageRoot,
          taskId: this.currentTaskId
        });
      }
    } else {
      // Direct prompt mode
      const prompt = processedArgs.join(' ');
      response = await runCC({
        prompt,
        packageRoot,
        taskId: this.currentTaskId
      });
    }
    
    console.log(`[Command] cc execution completed`);
    
    // Return the agent's response if available, otherwise pass through data
    if (response) {
      return { output: response, input: data };
    }
    return data;
  }
  
  private parseTaskArgs(argsStr: string, data: any): any[] {
    // Simply use new Function to parse the entire arguments as JavaScript
    // This allows direct use of data.xxx without needing *data
    const func = new Function('data', `return [${argsStr}]`);
    return func(data);
  }
  
  private parseCommandArgs(argsStr: string): string[] {
    // Simple parsing for command arguments - split by comma but respect quotes
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    
    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      
      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
        current += char;
      } else if (inQuote && char === quoteChar && argsStr[i-1] !== '\\') {
        inQuote = false;
        current += char;
      } else if (!inQuote && char === ',') {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  }
  
  private buildCommandString(args: string[]): string {
    if (args.length === 0) {
      throw new Error('Command requires at least one argument');
    }
    
    // Remove quotes from arguments if present
    const cleanArgs = args.map(arg => {
      if ((arg.startsWith('"') && arg.endsWith('"')) || 
          (arg.startsWith("'") && arg.endsWith("'"))) {
        return arg.slice(1, -1);
      }
      return arg;
    });
    
    if (cleanArgs.length === 1) {
      // Check if it's a filename (has extension) or a direct command
      if (cleanArgs[0].match(/\.\w+$/)) {
        // Single filename
        return `@{${cleanArgs[0]}}`;
      } else {
        // Direct command
        return `@{"${cleanArgs[0]}"}`;
      }
    } else if (cleanArgs.length === 2) {
      // File + user input
      return `@{${cleanArgs[0]} "${cleanArgs[1]}"}`;
    }
    
    // Shouldn't happen, but fallback
    return `@{${args.join(' ')}}`;
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