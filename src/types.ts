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

// Processor function type
export interface ProcessorFunction {
  (data: any, next: (data: any) => void, taskId?: string): void;
}