class RemoteConsole {
  private baseUrl = 'http://localhost:3001/api';
  
  private async send(method: string, ...args: any[]) {
    try {
      await fetch(`${this.baseUrl}/console`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ method, args })
      });
    } catch (error) {
      // 静默失败，避免 console 系统本身出错
    }
  }
  
  log(...args: any[]) {
    console.log(...args);
    this.send('log', ...args);
  }
  
  warn(...args: any[]) {
    console.warn(...args);
    this.send('warn', ...args);
  }
  
  error(...args: any[]) {
    console.error(...args);
    this.send('error', ...args);
  }
  
  debug(...args: any[]) {
    console.debug(...args);
    this.send('debug', ...args);
  }
  
  info(...args: any[]) {
    console.info(...args);
    this.send('info', ...args);
  }
  
  dir(obj: any, options?: any) {
    console.dir(obj, options);
    this.send('dir', obj, options);
  }
  
  table(data: any) {
    console.table(data);
    this.send('table', data);
  }
}

export const remoteConsole = new RemoteConsole();