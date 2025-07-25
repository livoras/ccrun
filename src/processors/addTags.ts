import { ProcessorRegistryContext } from '../processor-registry';

export default async function(args: any[], data: any, context: ProcessorRegistryContext) {
  if (!context.currentTaskId) {
    throw new Error('addTags requires an active task. Use task() first.');
  }
  
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('addTags requires at least one tag argument');
  }
  
  // Convert all tags to strings
  const stringTags = args.map(tag => String(tag));
  
  const taskId = parseInt(context.currentTaskId);
  console.log(`[addTags] Adding tags: ${stringTags.join(', ')}`);
  
  await context.actionClient.addTaskTags(taskId, stringTags);
  await context.updateTask(taskId);
  
  return data; // Pass through unchanged
}