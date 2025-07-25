import { runCC } from '../cc-core';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ActionClient } from '../action-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ProcessorContext {
  actionClient: ActionClient;
  currentTaskId?: string;
}

export default async function(args: any[], data: any, context: ProcessorContext) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('agent requires at least one argument (file path)');
  }
  
  const filePath = String(args[0]);
  const userInput = args.length > 1 ? 
    (typeof args[1] === 'object' ? JSON.stringify(args[1]) : String(args[1])) : 
    undefined;
  
  console.log(`[agent] Executing file: ${filePath}${userInput ? ` with input: ${userInput.substring(0, 50)}...` : ''}`);
  
  // Resolve file path relative to current directory
  const fullFilePath = resolve(process.cwd(), filePath);
  
  // Always use the actual project root
  const packageRoot = resolve(__dirname, '../..');
  
  // Call runCC in file mode
  const response = await runCC({
    filePath: fullFilePath,
    userInput,
    packageRoot,
    taskId: context.currentTaskId
  });
  
  // Return the agent's response if available, otherwise pass through data
  if (response) {
    return { output: response, input: data };
  }
  return data;
}