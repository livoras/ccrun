import { Config, ProcessorFunction, ProcessorContext } from './types';
import { ActionClient } from './action-client';
import { createTrigger, Trigger } from './triggers';
import ProcessorRegistry, { ProcessorRegistryContext } from './processor-registry';
import { registerBuiltinProcessors } from './processors/index';
import { resolve as resolvePath } from 'path';

// Ensure processors are registered
registerBuiltinProcessors();

type WatchConfig = {
  type: 'sse' | 'crontab' | 'webhook';
  name: string;
  description?: string;
  sse?: string;
  crontab?: string;
  port?: number;
  path?: string;
  auth?: string;
};

// Context passed to middleware functions
interface CCRunContext {
  data: any;
  state: any;
  history: any[];
  taskId?: string;
  taskData?: any;  // Current task data
  // Built-in functions
  task: (name: string, description?: string, tags?: string[], logo?: string) => Promise<void>;
  prompt: (prompt: string | any) => Promise<any>;
  agent: (file: string, input?: string | any) => Promise<any>;
  action: (actionId: string, input?: any, settings?: any) => Promise<any>;
  json: () => Promise<any>;
  log: () => void;
  addTags: (...tags: string[]) => Promise<void>;
  removeTags: (...tags: string[]) => Promise<void>;
}

type MiddlewareFunction = (ctx: CCRunContext, next: () => void | Promise<void>) => void | Promise<void>;

export class CCRun {
  private config?: Config;
  private middlewares: MiddlewareFunction[] = [];
  private actionClient: ActionClient;
  private trigger?: Trigger;

  constructor() {
    this.actionClient = new ActionClient();
  }

  watch(config: WatchConfig): this {
    // Convert to internal Config type
    this.config = {
      ...config,
      run: [] // Not used in chain mode
    } as Config;
    return this;
  }

  then(middleware: MiddlewareFunction): this {
    this.middlewares.push(middleware);
    return this;
  }

  private createContext(data: any, executionContext: { taskId?: string; task?: any; history: any[] }): CCRunContext {
    const ctx: CCRunContext = {
      data,
      state: {},
      history: [...executionContext.history],
      taskId: executionContext.taskId,
      taskData: executionContext.task,
      
      // Task creation
      task: async (name: string, description?: string, tags?: string[], logo?: string) => {
        const projectPath = process.cwd();
        const result = await this.actionClient.createTask(
          name,
          description,
          tags,
          logo,
          projectPath
        );
        executionContext.taskId = result.id.toString();
        executionContext.task = result;
        ctx.taskId = executionContext.taskId;
        ctx.taskData = result;
        console.log(`[CCRun] Task created with ID: ${executionContext.taskId}, name: ${name}`);
      },
      
      // Prompt processor
      prompt: async (prompt: string | any) => {
        const definition = ProcessorRegistry.get('prompt');
        if (!definition) throw new Error('prompt processor not found');
        
        const registryContext = this.createRegistryContext(executionContext);
        const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
        return await handler([prompt], ctx.data, registryContext);
      },
      
      // Agent processor
      agent: async (file: string, input?: string | any) => {
        const definition = ProcessorRegistry.get('agent');
        if (!definition) throw new Error('agent processor not found');
        
        const registryContext = this.createRegistryContext(executionContext);
        const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
        const args = input !== undefined ? [file, input] : [file];
        return await handler(args, ctx.data, registryContext);
      },
      
      // Action processor
      action: async (actionId: string, input?: any, settings?: any) => {
        const definition = ProcessorRegistry.get('action');
        if (!definition) throw new Error('action processor not found');
        
        const registryContext = this.createRegistryContext(executionContext);
        const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
        const args = [actionId];
        if (input !== undefined) args.push(input);
        if (settings !== undefined) args.push(settings);
        return await handler(args, ctx.data, registryContext);
      },
      
      // JSON processor
      json: async () => {
        const definition = ProcessorRegistry.get('json');
        if (!definition) throw new Error('json processor not found');
        
        return new Promise((resolve) => {
          const handler = definition.handler as ProcessorFunction;
          const processorContext: ProcessorContext = {
            history: [...executionContext.history],
            taskId: executionContext.taskId,
            task: executionContext.task
          };
          
          handler(ctx.data, (newData) => {
            resolve(newData);
          }, processorContext);
        });
      },
      
      // Log processor
      log: () => {
        const definition = ProcessorRegistry.get('log');
        if (!definition) return;
        
        const handler = definition.handler as ProcessorFunction;
        const processorContext: ProcessorContext = {
          history: [...executionContext.history],
          taskId: executionContext.taskId,
          task: executionContext.task
        };
        
        handler(ctx.data, () => {}, processorContext);
      },
      
      // Tag management
      addTags: async (...tags: string[]) => {
        if (!executionContext.taskId) {
          throw new Error('addTags requires an active task. Use ctx.task() first.');
        }
        
        const definition = ProcessorRegistry.get('addTags');
        if (!definition) throw new Error('addTags processor not found');
        
        const registryContext = this.createRegistryContext(executionContext);
        const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
        await handler(tags, ctx.data, registryContext);
        
        // Update current task
        if (executionContext.taskId) {
          executionContext.task = await this.actionClient.getTask(parseInt(executionContext.taskId));
          ctx.taskData = executionContext.task;
        }
      },
      
      removeTags: async (...tags: string[]) => {
        if (!executionContext.taskId) {
          throw new Error('removeTags requires an active task. Use ctx.task() first.');
        }
        
        const definition = ProcessorRegistry.get('removeTags');
        if (!definition) throw new Error('removeTags processor not found');
        
        const registryContext = this.createRegistryContext(executionContext);
        const handler = definition.handler as (args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>;
        await handler(tags, ctx.data, registryContext);
        
        // Update current task
        if (executionContext.taskId) {
          executionContext.task = await this.actionClient.getTask(parseInt(executionContext.taskId));
          ctx.taskData = executionContext.task;
        }
      }
    };
    
    return ctx;
  }

  private createRegistryContext(executionContext: { taskId?: string; task?: any }): ProcessorRegistryContext {
    return {
      actionClient: this.actionClient,
      currentTaskId: executionContext.taskId,
      configPath: resolvePath(process.cwd(), 'ccrun.js'), // Virtual path
      updateTask: async (taskId: number) => {
        executionContext.task = await this.actionClient.getTask(taskId);
      }
    };
  }

  private async execute(initialData: any) {
    // Create execution context for this event
    const executionContext = {
      taskId: undefined as string | undefined,
      task: undefined as any,
      history: [initialData]
    };
    
    let currentData = initialData;

    // Execute middleware chain
    let index = 0;
    
    const runNext = async () => {
      if (index >= this.middlewares.length) return;
      
      const middleware = this.middlewares[index++];
      const ctx = this.createContext(currentData, executionContext);
      
      // Set up next function
      let nextCalled = false;
      const next = async () => {
        if (nextCalled) {
          throw new Error('next() called multiple times');
        }
        nextCalled = true;
        
        // Update current data from context
        currentData = ctx.data;
        executionContext.history.push(currentData);
        
        // Continue to next middleware
        await runNext();
      };
      
      // Execute middleware
      await middleware(ctx, next);
      
      // If next wasn't called, stop here
      if (!nextCalled) {
        console.log('[CCRun] Middleware chain stopped (next not called)');
      }
    };
    
    await runNext();
  }

  start(): void {
    if (!this.config) {
      throw new Error('No watch configuration provided. Call watch() first.');
    }

    this.trigger = createTrigger(this.config);
    
    console.log(`[CCRun] Starting trigger: ${this.config.name}`);
    if (this.config.description) {
      console.log(`[CCRun] Description: ${this.config.description}`);
    }
    
    this.trigger.start(async (data) => {
      await this.execute(data).catch(err => {
        console.error('[CCRun] Execution error:', err);
      });
    });
  }

  stop(): void {
    if (this.trigger) {
      console.log(`[CCRun] Stopping trigger: ${this.config?.name}`);
      this.trigger.stop();
    }
  }
}

// Factory function
export default function ccrun(): CCRun {
  return new CCRun();
}