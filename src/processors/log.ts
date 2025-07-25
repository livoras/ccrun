import { ProcessorContext } from '../types';

export default function(data: any, next: (data: any) => void, _context: ProcessorContext) {
  console.log('[Log] Final data:', JSON.stringify(data, null, 2));
  next(data);
}