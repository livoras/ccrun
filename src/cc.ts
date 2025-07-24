import { runCC } from './cc-core';
import path from 'path';

async function main() {
  // 获取包根目录
  const packageRoot = path.resolve(__dirname, '..');
  
  // 解析参数
  const args = process.argv.slice(2);
  let prompt = '';
  let taskId = '';
  let filePath = '';
  let userInput = '';
  
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
    } else if (filePath && !userInput) {
      // 如果已经指定了文件，额外的参数作为用户输入
      userInput = args[i];
    }
  }
  
  if (!prompt && !filePath) {
    console.error('Usage: ccrun "<prompt>" [--taskId <taskId>]');
    console.error('   or: ccrun -f <filename> [--taskId <taskId>]');
    console.error('   or: ccrun -f <filename> "<user input>" [--taskId <taskId>]');
    process.exit(1);
  }
  
  try {
    await runCC({
      prompt,
      taskId,
      filePath,
      userInput,
      packageRoot
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

}

main();