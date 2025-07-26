import { ProcessorRegistryContext } from '../processor-registry';
import { runCC } from '../cc-core';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function(args: any[], data: any, context: ProcessorRegistryContext) {
  if (!Array.isArray(args) || args.length !== 1) {
    throw new Error('prompt requires exactly one argument');
  }
  
  const prompt = typeof args[0] === 'object' ? JSON.stringify(args[0]) : String(args[0]);
  
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