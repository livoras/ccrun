export default function log(data: any, next: (data: any) => void) {
  console.log('[Log] Final data:', JSON.stringify(data, null, 2));
  
  // Pass data to next processor
  next(data);
}