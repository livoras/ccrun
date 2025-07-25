import ProcessorRegistry from '../processor-registry';
import jsonProcessor from './json';
import logProcessor from './log';
import addTagsProcessor from './addTags';
import removeTagsProcessor from './removeTags';
import promptProcessor from './prompt';
import agentProcessor from './agent';

/**
 * Register all built-in processors
 */
export function registerBuiltinProcessors() {
  // Simple processors that follow the standard (data, next, context) signature
  ProcessorRegistry.register({
    name: 'json',
    handler: jsonProcessor
  });
  
  ProcessorRegistry.register({
    name: 'log',
    handler: logProcessor
  });
  
  // Processors that require argument parsing and task context
  ProcessorRegistry.register({
    name: 'addTags',
    handler: addTagsProcessor,
    requiresTaskId: true,
    parseArgs: true
  });
  
  ProcessorRegistry.register({
    name: 'removeTags',
    handler: removeTagsProcessor,
    requiresTaskId: true,
    parseArgs: true
  });
  
  // Agent processors for CC/Claude interactions
  ProcessorRegistry.register({
    name: 'prompt',
    handler: promptProcessor,
    parseArgs: true
  });
  
  ProcessorRegistry.register({
    name: 'agent',
    handler: agentProcessor,
    parseArgs: true
  });
  
  console.log('[Processors] Registered built-in processors:', ProcessorRegistry.getNames().join(', '));
}