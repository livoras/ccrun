import { claude } from '@instantlyeasy/claude-code-sdk-ts';
import { remoteConsole } from './logger';
import path from 'path';
import fs from 'fs/promises';

// 发送日志到服务器
async function sendActionLog(taskId: string | null, log: any) {
  await fetch('http://localhost:3001/api/add-action-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId, log })
  });
}

async function main() {
  // 获取包根目录
  const packageRoot = path.resolve(__dirname, '..');
  
  // 解析参数
  const args = process.argv.slice(2);
  let prompt = '';
  let taskId = '';
  let filePath = '';
  
  // 查找 prompt、-f 和 --taskId 参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--taskId' && i + 1 < args.length) {
      taskId = args[i + 1];
      i++; // 跳过下一个参数
    } else if (args[i] === '-f' && i + 1 < args.length) {
      filePath = args[i + 1];
      i++; // 跳过下一个参数
    } else if (!prompt && !filePath) {
      prompt = args[i];
    }
  }
  
  // 如果指定了文件，从文件读取内容
  if (filePath) {
    try {
      prompt = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file: ${filePath}`, error);
      process.exit(1);
    }
  }
  
  if (!prompt) {
    console.error('Usage: cc "<prompt>" [--taskId <taskId>]');
    console.error('   or: cc -f <filename> [--taskId <taskId>]');
    process.exit(1);
  }
  
  // 如果有 taskId，构造包含任务上下文的完整 prompt
  if (taskId) {
    prompt = `${prompt}

--

注意，当前的 taskId 是 ${taskId}。如果

1. 需要用到 \`./ccc\` 命令的 Bash 命令，请传入 \`./ccc <xxx> --taskId ${taskId})\`。
2. 如果需要用到 mcp__flow__executeAction 请也使用 taskId`;
  }

  const abort = new AbortController()

  // 监听进程退出信号
  process.on('SIGINT', () => {
    console.log('\n正在中止请求...')
    abort.abort()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n正在中止请求...')
    abort.abort()
    process.exit(0)
  })

// Analyze tool usage
  const res = await claude().withConfigFile(path.join(packageRoot, 'scripts/config.yaml'))

  // 在开始流之前发送 prompt 日志
  await sendActionLog(taskId, {
    type: 'prompt',
    text: prompt,
    timestamp: Date.now()
  });
  
  res.withSignal(abort.signal)
    .skipPermissions()
    .query(prompt)
    .stream(async (m) => {
      if (m.type === 'assistant' && m.content) {
        remoteConsole.log('===============', prompt, '================')
        
        for (const content of m.content) {
          if (content.type === 'text') {
            remoteConsole.log(`\n${content.text}`);
            // 发送 text 日志
            await sendActionLog(taskId, {
              type: 'text',
              text: content.text,
              timestamp: Date.now()
            });
          } else if (content.type === 'tool_use') {
            remoteConsole.log(`\n\x1b[33m▶ ${content.name}\x1b[0m`);
            if (content.input && Object.keys(content.input).length > 0) {
              const input = JSON.stringify(content.input, null, 2)
                .split('\n')
                .map(line => `  ${line}`)
                .join('\n')
              remoteConsole.log(`\x1b[90m${input}\x1b[0m`);
            }
            // 发送 tool_use 日志
            await sendActionLog(taskId, {
              type: 'tool_use',
              toolName: content.name,
              toolInput: content.input,
              timestamp: Date.now()
            });
          } else if (content.type === 'tool_result') {
            const method = content.is_error ? 'error' : 'log'
            if (method !== 'error') {
              remoteConsole.log(`\x1b[32m✓ 完成\x1b[0m`);
            } else {
              remoteConsole.error('!!!!!!!!!!!!!失败!!!!!!!!!!')
            }
            if (content.content) {
              if (typeof content.content === 'string') {
                if (content.content.length > 1000) {
                  remoteConsole[method](`\x1b[90m${content.content.substring(0, 1000)}...\x1b[0m`);
                } else {
                  remoteConsole[method](`\x1b[90m${content.content}\x1b[0m`);
                }
              } else {
                const result = JSON.stringify(content.content, null, 2)
                if (result.length > 1000) {
                  remoteConsole[method](`\x1b[90m${result.substring(0, 1000)}...\x1b[0m`);
                } else {
                  remoteConsole[method](`\x1b[90m${result}\x1b[0m`);
                }
              }
            }
            // 发送 tool_result 日志
            await sendActionLog(taskId, {
              type: 'tool_result',
              isError: content.is_error,
              toolResult: content.content,
              timestamp: Date.now()
            });
          }
        }
      }
    })

}

main();