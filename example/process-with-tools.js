// Custom processor that uses tools from context
module.exports = async function(data, next, context) {
  console.log('[ProcessWithTools] Starting processing...');
  
  // Check if we have multiple items
  if (Array.isArray(data) && data.length > 3) {
    console.log('[ProcessWithTools] Multiple items detected, adding tags...');
    
    // Use tools to add tags
    if (context.tools && context.tools.addTags) {
      await context.tools.addTags("bulk-data", "processed");
      console.log('[ProcessWithTools] Tags added successfully');
    }
  }
  
  // Use tools to create a prompt
  if (context.tools && context.tools.prompt) {
    const result = await context.tools.prompt(`Summarize this data: ${JSON.stringify(data)}`);
    console.log('[ProcessWithTools] Got prompt result');
    
    // Pass the result to next processor
    next(result);
  } else {
    // No tools available, just pass data through
    next(data);
  }
};