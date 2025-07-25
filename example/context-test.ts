export default function(data: any, next: any, context: any) {
  console.log('[Context Test] Current data:', data);
  console.log('[Context Test] History length:', context.history.length);
  console.log('[Context Test] Original data:', context.history[0]);
  console.log('[Context Test] Previous data:', context.history[context.history.length - 1]);
  console.log('[Context Test] Task ID:', context.taskId);
  console.log('[Context Test] Task info:', context.task);
  
  // Pass data along with a marker
  next({ ...data, contextTestProcessed: true });
}