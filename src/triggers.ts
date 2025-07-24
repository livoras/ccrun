import { get } from 'http';
import * as cron from 'node-cron';
import { Config, SSEConfig, CrontabConfig } from './types';

// Trigger callback type
export type TriggerCallback = (data: any) => Promise<void>;

// Base Trigger interface
export interface Trigger {
  name: string;
  description?: string;
  start(callback: TriggerCallback): void;
  stop(): void;
}

// SSE Trigger implementation
export class SSETrigger implements Trigger {
  private config: SSEConfig;
  private abortController?: AbortController;
  
  constructor(config: SSEConfig) {
    this.config = config;
  }
  
  get name() {
    return this.config.name;
  }
  
  get description() {
    return this.config.description;
  }
  
  start(callback: TriggerCallback): void {
    console.log(`[SSE] Starting SSE trigger: ${this.config.name}`);
    console.log(`[SSE] Connecting to: ${this.config.sse}`);
    
    this.abortController = new AbortController();
    
    get(this.config.sse, (res) => {
      console.log('[SSE] Connection established');
      
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
                console.log('[SSE] Received data:', data);
                callback(data).catch(err => {
                  console.error('[SSE] Callback error:', err);
                });
              } catch (err) {
                console.error('[SSE] Failed to parse message:', message, err);
              }
            }
          }
        }
      });
      
      res.on('error', (error) => {
        console.error('[SSE] Connection error:', error);
      });
      
      res.on('end', () => {
        console.log('[SSE] Connection closed');
      });
    }).on('error', (error) => {
      console.error('[SSE] Failed to connect:', error);
    });
  }
  
  stop(): void {
    console.log(`[SSE] Stopping SSE trigger: ${this.config.name}`);
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}

// Crontab Trigger implementation
export class CrontabTrigger implements Trigger {
  private config: CrontabConfig;
  private task?: cron.ScheduledTask;
  
  constructor(config: CrontabConfig) {
    this.config = config;
  }
  
  get name() {
    return this.config.name;
  }
  
  get description() {
    return this.config.description;
  }
  
  start(callback: TriggerCallback): void {
    console.log(`[Crontab] Starting crontab trigger: ${this.config.name}`);
    console.log(`[Crontab] Schedule: ${this.config.crontab}`);
    
    if (!cron.validate(this.config.crontab)) {
      throw new Error(`Invalid cron expression: ${this.config.crontab}`);
    }
    
    this.task = cron.schedule(this.config.crontab, async () => {
      const data = {
        timestamp: new Date().toISOString(),
        trigger: 'crontab',
        name: this.config.name
      };
      
      console.log(`[Crontab] Triggered at ${data.timestamp}`);
      
      try {
        await callback(data);
      } catch (err) {
        console.error('[Crontab] Callback error:', err);
      }
    });
    
    this.task.start();
  }
  
  stop(): void {
    console.log(`[Crontab] Stopping crontab trigger: ${this.config.name}`);
    if (this.task) {
      this.task.stop();
    }
  }
}


// Factory function to create triggers
export function createTrigger(config: Config): Trigger {
  switch (config.type) {
    case 'sse':
      return new SSETrigger(config);
    case 'crontab':
      return new CrontabTrigger(config);
    default:
      throw new Error(`Unknown trigger type: ${(config as any).type}`);
  }
}