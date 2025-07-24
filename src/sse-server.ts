import { createServer } from 'http';

const questions = [
  "What's your favorite programming language?",
  "How do you handle errors in async code?",
  "What's the difference between let and const?",
  "How does event loop work in Node.js?",
  "What's your preferred testing framework?",
  "How do you optimize React performance?",
  "What's the purpose of TypeScript?",
  "How do you handle state management?",
  "What's your favorite design pattern?",
  "How do you debug production issues?"
];

const server = createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const interval = setInterval(() => {
      const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
      const data = {
        question: randomQuestion,
      };
      
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 10000);

    // Send initial message
    res.write(`data: ${JSON.stringify({ 
      question: questions[0],
    })}\n\n`);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 8081;
server.listen(PORT, () => {
  console.log(`SSE server running on http://localhost:${PORT}/events`);
});