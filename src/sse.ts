import { get } from 'http';

export function listenToSSE(url: string): void {
  console.log('Connecting to SSE endpoint:', url);
  
  get(url, (res) => {
    console.log('SSE connection opened');
    
    res.on('data', (chunk) => {
      const data = chunk.toString();
      const lines = data.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const message = line.slice(6);
          if (message.trim()) {
            console.log('SSE message received:', message);
          }
        }
      }
    });
    
    res.on('error', (error) => {
      console.log('SSE error:', error);
    });
    
    res.on('end', () => {
      console.log('SSE connection closed');
    });
  }).on('error', (error) => {
    console.log('Connection error:', error);
  });
  
  // Handle connection close
  process.on('SIGINT', () => {
    console.log('SSE connection interrupted');
    process.exit(0);
  });
}