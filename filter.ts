export default function filter(data: any, next: (data: any) => void) {
  console.log('[Filter] Received:', data);
  
  // Example: filter out questions containing "TypeScript"
  if (data.question && data.question.includes('How')) {
    console.log('[Filter] Filtering out TypeScript question');
    return; // Don't call next, stop the pipeline
  }
  
  // Pass data to next processor
  next({
    ...data,
    filtered: true,
    processedAt: new Date().toISOString()
  });
}