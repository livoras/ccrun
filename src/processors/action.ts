import { ProcessorRegistryContext } from '../processor-registry';

export default async function(args: any[], data: any, context: ProcessorRegistryContext) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('action requires at least one argument (action ID)');
  }
  
  const actionId = String(args[0]);
  const input = args.length > 1 ? args[1] : data; // Use second arg as input, or current data
  const settings = args.length > 2 ? args[2] : undefined;
  
  console.log(`[action] Executing action: ${actionId}`);
  
  // Execute the action
  const result = await context.actionClient.executeAction(
    actionId,
    input,
    settings,
    context.currentTaskId ? parseInt(context.currentTaskId) : undefined
  );
  
  console.log(`[action] Action ${actionId} completed successfully`);
  
  // Return the action result
  return result;
}