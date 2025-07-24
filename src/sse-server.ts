import { createServer, ServerResponse } from 'http';

const questions = [
  "黑洞是如何形成的？",
  "地球的内部结构是怎样的？",
  "什么是暗物质和暗能量？",
  "恒星是如何诞生和死亡的？",
  "板块构造理论是什么？",
  "宇宙大爆炸理论的主要证据有哪些？",
  "什么是引力波？",
  "火山喷发的原理是什么？",
  "银河系的结构是怎样的？",
  "地球磁场是如何产生的？",
  "什么是红移现象？",
  "地震是如何发生的？",
  "太阳系是如何形成的？",
  "什么是量子纠缠？",
  "地球的大气层是如何形成的？"
];

// Store all connected clients
const clients = new Set<ServerResponse>();

// Global timer to broadcast to all clients
setInterval(() => {
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  const data = {
    question: randomQuestion,
    timestamp: new Date().toISOString()
  };
  
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  // Broadcast to all connected clients
  clients.forEach(client => {
    client.write(message);
  });
  
  console.log(`Broadcasting to ${clients.size} clients: ${randomQuestion}`);
}, 30000);

const server = createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Add client to the set
    clients.add(res);
    console.log(`Client connected. Total clients: ${clients.size}`);

    req.on('close', () => {
      clients.delete(res);
      console.log(`Client disconnected. Total clients: ${clients.size}`);
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