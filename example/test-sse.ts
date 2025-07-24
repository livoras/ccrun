import { listenToSSE } from '../src/sse';

console.log('Starting SSE client test...');
listenToSSE('http://localhost:8081/events');