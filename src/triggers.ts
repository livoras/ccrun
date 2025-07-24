import { get, createServer, IncomingMessage, ServerResponse } from 'http';
import * as cron from 'node-cron';
import { Config, SSEConfig, CrontabConfig, WebhookConfig } from './types';

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


// Webhook Trigger implementation
export class WebhookTrigger implements Trigger {
  private config: WebhookConfig;
  private server?: any;
  
  constructor(config: WebhookConfig) {
    this.config = config;
  }
  
  get name() {
    return this.config.name;
  }
  
  get description() {
    return this.config.description;
  }
  
  start(callback: TriggerCallback): void {
    const path = this.config.path || '/webhook';
    
    console.log(`[Webhook] Starting webhook trigger: ${this.config.name}`);
    console.log(`[Webhook] Listening on port ${this.config.port} at path ${path}`);
    if (this.config.auth) {
      console.log(`[Webhook] Authentication enabled (Bearer token)`);
    }
    
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Only handle POST requests to the configured path
      if (req.method !== 'POST' || req.url !== path) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      
      // Check authentication if configured
      if (this.config.auth) {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${this.config.auth}`) {
          res.statusCode = 401;
          res.end('Unauthorized');
          return;
        }
      }
      
      // Collect request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          // Parse JSON body
          let data;
          try {
            data = JSON.parse(body);
          } catch (e) {
            // If not JSON, use raw body
            data = { body };
          }
          
          // Add webhook metadata
          const webhookData = {
            timestamp: new Date().toISOString(),
            trigger: 'webhook',
            name: this.config.name,
            method: req.method,
            path: req.url,
            headers: req.headers,
            ...data
          };
          
          console.log(`[Webhook] Received POST to ${path}`);
          
          // Trigger the callback
          await callback(webhookData);
          
          // Send success response
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, message: 'Webhook processed' }));
        } catch (err) {
          console.error('[Webhook] Error processing request:', err);
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });
    });
    
    this.server.listen(this.config.port, () => {
      console.log(`[Webhook] Server started on port ${this.config.port}`);
    });
    
    this.server.on('error', (err: any) => {
      console.error('[Webhook] Server error:', err);
    });
  }
  
  stop(): void {
    console.log(`[Webhook] Stopping webhook trigger: ${this.config.name}`);
    if (this.server) {
      this.server.close();
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
    case 'webhook':
      return new WebhookTrigger(config);
    default:
      throw new Error(`Unknown trigger type: ${(config as any).type}`);
  }
}