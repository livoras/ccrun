import { ActionClient } from '../action-client';

interface ProcessorContext {
  actionClient: ActionClient;
  currentTaskId?: string;
}

export default async function(args: any[], data: any, context: ProcessorContext) {
  if (!context.currentTaskId) {
    throw new Error('removeTags requires an active task. Use task() first.');
  }
  
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('removeTags requires at least one tag argument');
  }
  
  // Convert all tags to strings
  const stringTags = args.map(tag => String(tag));
  
  const taskId = parseInt(context.currentTaskId);
  console.log(`[removeTags] Removing tags: ${stringTags.join(', ')}`);
  
  await context.actionClient.removeTaskTags(taskId, stringTags);
  
  return data; // Pass through unchanged
}