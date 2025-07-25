// Base configuration interface
export interface BaseConfig {
  name: string;
  description?: string;
  type: 'sse' | 'crontab' | 'webhook';
  run: string[];
  configPath?: string; // Path to the config file
}

// SSE specific config
export interface SSEConfig extends BaseConfig {
  type: 'sse';
  sse: string;
}

// Crontab specific config
export interface CrontabConfig extends BaseConfig {
  type: 'crontab';
  crontab: string;
}

// Webhook specific config
export interface WebhookConfig extends BaseConfig {
  type: 'webhook';
  port: number;
  path?: string;  // defaults to /webhook
  auth?: string;  // optional bearer token
}

// Union type for all configs
export type Config = SSEConfig | CrontabConfig | WebhookConfig;

// Processor context interface
export interface ProcessorContext {
  history: any[];    // Array of all data states through the pipeline
  taskId?: string;   // Current task ID if available
  task?: any;        // Full task object if available
}

// Processor function type
export interface ProcessorFunction {
  (data: any, next: (data: any) => void, context: ProcessorContext): void;
}