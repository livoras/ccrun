import { ProcessorRegistryContext } from '../processor-registry';
import { runCC } from '../cc-core';
import { resolve } from 'path';

export default async function(args: any[], data: any, context: ProcessorRegistryContext) {
  if (!Array.isArray(args) || args.length !== 1) {
    throw new Error('prompt requires exactly one argument');
  }
  
  const prompt = args[0];
  if (typeof prompt !== 'string') {
    throw new Error('prompt argument must be a string');
  }
  
  console.log(`[prompt] Executing with prompt: ${prompt.substring(0, 50)}...`);
  
  // Always use the actual project root
  const packageRoot = resolve(__dirname, '../..');
  
  // Call runCC in direct prompt mode
  const response = await runCC({
    prompt,
    packageRoot,
    taskId: context.currentTaskId
  });
  
  // Return the agent's response if available, otherwise pass through data
  if (response) {
    return { output: response, input: data };
  }
  return data;
}