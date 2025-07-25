import { ProcessorFunction } from './types';
import { ActionClient } from './action-client';

export interface ProcessorDefinition {
  name: string;
  handler: ProcessorFunction | ((args: any[], data: any, context: ProcessorRegistryContext) => Promise<any>);
  requiresTaskId?: boolean;
  parseArgs?: boolean; // Whether to parse arguments with new Function
}

export interface ProcessorRegistryContext {
  actionClient: ActionClient;
  currentTaskId?: string;
  updateTask: (taskId: number) => Promise<void>;
  configPath: string;  // Path to the YAML config file
}

class ProcessorRegistry {
  private static processors = new Map<string, ProcessorDefinition>();
  
  /**
   * Register a processor
   */
  static register(definition: ProcessorDefinition) {
    this.processors.set(definition.name, definition);
    console.log(`[ProcessorRegistry] Registered processor: ${definition.name}`);
  }
  
  /**
   * Check if a processor is registered
   */
  static has(name: string): boolean {
    return this.processors.has(name);
  }
  
  /**
   * Get a processor definition
   */
  static get(name: string): ProcessorDefinition | undefined {
    return this.processors.get(name);
  }
  
  /**
   * Get all registered processor names
   */
  static getNames(): string[] {
    return Array.from(this.processors.keys());
  }
  
  /**
   * Clear all processors (useful for testing)
   */
  static clear() {
    this.processors.clear();
  }
}

export default ProcessorRegistry;