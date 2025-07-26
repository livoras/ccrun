import { Config } from './types';
import { ActionClient } from './action-client';
import { createTrigger, Trigger } from './triggers';
import promptProcessor from './processors/prompt';
import agentProcessor from './processors/agent';
import actionProcessor from './processors/action';
import addTagsProcessor from './processors/addTags';
import removeTagsProcessor from './processors/removeTags';

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
        return await promptProcessor([prompt], ctx.data, {
          actionClient: this.actionClient,
          currentTaskId: executionContext.taskId
        });
      },
      
      // Agent processor
      agent: async (file: string, input?: string | any) => {
        const args = input !== undefined ? [file, input] : [file];
        return await agentProcessor(args, ctx.data, {
          actionClient: this.actionClient,
          currentTaskId: executionContext.taskId
        });
      },
      
      // Action processor
      action: async (actionId: string, input?: any, settings?: any) => {
        const args = [actionId];
        if (input !== undefined) args.push(input);
        if (settings !== undefined) args.push(settings);
        return await actionProcessor(args, ctx.data, {
          actionClient: this.actionClient,
          currentTaskId: executionContext.taskId
        });
      },
      
      // JSON processor - extracts and parses JSON from text
      json: async () => {
        let textToParse: string;
        
        // Determine what text to parse
        if (typeof ctx.data === 'object' && ctx.data !== null && 'output' in ctx.data) {
          textToParse = String(ctx.data.output);
        } else if (typeof ctx.data === 'string') {
          textToParse = ctx.data;
        } else {
          throw new Error('json processor requires string or object with output field');
        }
        
        // Extract JSON from ```json blocks
        const jsonCodeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/;
        const match = textToParse.match(jsonCodeBlockRegex);
        
        if (match) {
          return JSON.parse(match[1].trim());
        }
        
        // Parse the entire text as JSON
        return JSON.parse(textToParse.trim());
      },
      
      // Log processor
      log: () => {
        console.log('[data]', ctx.data);
      },
      
      // Tag management
      addTags: async (...tags: string[]) => {
        if (!executionContext.taskId) {
          throw new Error('addTags requires an active task. Use ctx.task() first.');
        }
        
        await addTagsProcessor(tags, ctx.data, {
          actionClient: this.actionClient,
          currentTaskId: executionContext.taskId
        });
        
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
        
        await removeTagsProcessor(tags, ctx.data, {
          actionClient: this.actionClient,
          currentTaskId: executionContext.taskId
        });
        
        // Update current task
        if (executionContext.taskId) {
          executionContext.task = await this.actionClient.getTask(parseInt(executionContext.taskId));
          ctx.taskData = executionContext.task;
        }
      }
    };
    
    return ctx;
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
      await this.execute(data);
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