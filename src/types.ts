// Base configuration interface
export interface BaseConfig {
  name: string;
  description?: string;
  type: 'sse' | 'crontab';
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

// Union type for all configs
export type Config = SSEConfig | CrontabConfig;

// Processor function type
export interface ProcessorFunction {
  (data: any, next: (data: any) => void, taskId?: string): void;
}