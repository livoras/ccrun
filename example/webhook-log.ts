import fs from 'fs';
import path from 'path';

export default function(data: any, next: any) {
  const timestamp = new Date().toISOString();
  const logPath = path.join(process.cwd(), 'example/webhook.log');
  
  // Extract relevant data
  const { trigger, name, method, path: reqPath, headers, ...payload } = data;
  
  const logEntry = {
    timestamp,
    trigger,
    name,
    request: {
      method,
      path: reqPath,
      contentType: headers['content-type'],
      userAgent: headers['user-agent']
    },
    payload
  };
  
  console.log('[Webhook Log]', JSON.stringify(logEntry, null, 2));
  
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  
  next(data);
}