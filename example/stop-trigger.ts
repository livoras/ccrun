export default function(data: any, next: any) {
  console.log('[Stop Trigger] Executing once and stopping...');
  
  // Pass data to next processor
  next(data);
  
  // Exit the process after a short delay to ensure processing completes
  setTimeout(() => {
    console.log('[Stop Trigger] Shutting down pipeline...');
    process.exit(0);
  }, 100);
}