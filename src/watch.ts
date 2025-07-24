import { parse } from 'yaml';
import { readFile } from 'fs/promises';
import { get } from 'http';
import { resolve, dirname } from 'path';
import { pathToFileURL } from 'url';
import { runCC } from './cc-core';
import { ActionClient } from './action-client';

interface Config {
  sse: string;
  run: string[];
}

interface ProcessorFunction {
  (data: any, next: (data: any) => void, taskId?: string): void;
}

class Pipeline {
  private processors: Array<{ type: 'function' | 'command' | 'task', handler: ProcessorFunction | string }> = [];
  private configPath: string;
  private actionClient: ActionClient;
  private currentTaskId?: string;

  constructor(private config: Config, configPath: string) {
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
          // Extract content from function(...)
          const content = funcMatch![2].trim();
          const commandStr = `@{${content}}`;
          this.processors.push({ type: 'command', handler: commandStr });
        } else if (item.startsWith('@{') && item.endsWith('}')) {
          // Command processor (quoted @{} syntax)
          this.processors.push({ type: 'command', handler: item });
        } else {
          // JS/TS file processor
          const filePath = this.resolveFilePath(item);
          try {
            const fileUrl = pathToFileURL(filePath).href;
            const module = await import(fileUrl);
            const handler = module.default;
            
            if (typeof handler !== 'function') {
              throw new Error(`Default export from ${filePath} is not a function`);
            }
            
            this.processors.push({ type: 'function', handler });
          } catch (error) {
            console.error(`Failed to load processor ${item}:`, error);
            throw error;
          }
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
      try {
        // Check if file exists by attempting to access it
        require.resolve(fullPath);
        return fullPath;
      } catch {
        continue;
      }
    }
    
    // If no file found, return the original path and let the error bubble up
    return resolve(configDir, item);
  }

  async execute(data: any) {
    let currentData = data;
    
    for (let i = 0; i < this.processors.length; i++) {
      const processor = this.processors[i];
      
      if (processor.type === 'task') {
        // Task processor - create a new task
        console.log('[Pipeline] Creating new task...');
        try {
          const projectPath = dirname(this.configPath);
          
          // Parse task() arguments
          const taskCall = processor.handler as string;
          const match = taskCall.match(/^task\s*\((.*)\)$/);
          const argsStr = match ? match[1].trim() : '';
          
          let taskName = `Task ${new Date().toISOString()}`;
          let description = 'Auto-created task from watch pipeline';
          let tags: string[] = [];
          
          if (argsStr) {
            // Parse arguments using a simple parser
            const args = this.parseTaskArgs(argsStr, currentData);
            if (args.length > 0 && args[0] !== undefined) taskName = String(args[0]);
            if (args.length > 1 && args[1] !== undefined) description = String(args[1]);
            if (args.length > 2 && Array.isArray(args[2])) tags = args[2].map(String);
          }
          
          const result = await this.actionClient.createTask(
            taskName,
            description,
            tags,
            undefined,
            projectPath
          );
          this.currentTaskId = result.id.toString();
          console.log(`[Pipeline] Task created with ID: ${this.currentTaskId}, name: ${taskName}`);
        } catch (error) {
          console.error('[Pipeline] Failed to create task:', error);
          throw error;
        }
      } else if (processor.type === 'function') {
        // Function processor
        const handler = processor.handler as ProcessorFunction;
        let nextCalled = false;
        let nextData: any;
        
        await new Promise<void>((resolve) => {
          handler(currentData, (newData) => {
            nextCalled = true;
            nextData = newData;
            resolve();
          }, this.currentTaskId);
          
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
      } else {
        // Command processor
        const command = processor.handler as string;
        console.log(`[Pipeline] Executing command processor: ${command}`);
        try {
          currentData = await this.executeCommand(command, currentData);
          console.log(`[Pipeline] Command completed successfully`);
        } catch (error) {
          console.error(`[Pipeline] Command failed:`, error);
          throw error;
        }
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
    
    // Check if first part looks like a file (ends with .md, .txt, etc.)
    if (parts.length > 0 && parts[0].match(/\.\w+$/)) {
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
    
    try {
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
    } catch (error) {
      console.error('[Command] Error executing cc:', error);
      throw error;
    }
  }
  
  private parseTaskArgs(argsStr: string, data: any): any[] {
    try {
      // Simply use new Function to parse the entire arguments as JavaScript
      // This allows direct use of data.xxx without needing *data
      const func = new Function('data', `return [${argsStr}]`);
      return func(data);
    } catch (error) {
      console.error(`[Pipeline] Failed to parse task arguments: ${argsStr}`, error);
      return [];
    }
  }
  

  listenToSSE() {
    console.log(`Connecting to SSE: ${this.config.sse}`);
    
    get(this.config.sse, (res) => {
      console.log('SSE connection established');
      
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const message = line.slice(6).trim();
            if (message) {
              try {
                const data = JSON.parse(message);
                console.log('Received SSE data:', data);
                this.execute(data).catch(err => {
                  console.error('Pipeline execution error:', err);
                });
              } catch (err) {
                console.error('Failed to parse SSE message:', message, err);
              }
            }
          }
        }
      });
      
      res.on('error', (error) => {
        console.error('SSE error:', error);
      });
      
      res.on('end', () => {
        console.log('SSE connection closed');
        process.exit(0);
      });
    }).on('error', (error) => {
      console.error('Connection error:', error);
      process.exit(1);
    });
  }
}

async function main() {
  const configFile = process.argv[2];
  
  if (!configFile) {
    console.error('Usage: watch <config.yaml>');
    process.exit(1);
  }
  
  try {
    const configPath = resolve(process.cwd(), configFile);
    const configContent = await readFile(configPath, 'utf-8');
    const config = parse(configContent) as Config;
    
    if (!config.sse || !config.run || !Array.isArray(config.run)) {
      throw new Error('Invalid config format. Expected "sse" and "run" fields.');
    }
    
    const pipeline = new Pipeline(config, configPath);
    await pipeline.loadProcessors();
    
    console.log(`Loaded ${config.run.length} processors`);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      process.exit(0);
    });
    
    pipeline.listenToSSE();
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main();