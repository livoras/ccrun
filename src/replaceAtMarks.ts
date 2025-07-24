/**
 * 替换 @{} 和 @[] 标记为 Bash 命令
 * 
 * @{} 格式（调用 ccrun）：
 * - @{"command"} 或 @{'command'} -> Bash(ccrun 'command' [--taskId xxx])
 * - @{filename} -> Bash(ccrun -f filename [--taskId xxx])
 * - @{filename "user input"} 或 @{filename 'user input'} -> Bash(ccrun -f filename 'user input' [--taskId xxx])
 * 
 * @[] 格式（直接执行）：
 * - @[script.ts --arg "value"] -> Bash(npx tsx /absolute/path/script.ts --arg "value")
 * - @[script.js --arg "value"] -> Bash(node /absolute/path/script.js --arg "value")
 * - @[script.py --arg "value"] -> Bash(python3 /absolute/path/script.py --arg "value")
 * - @[echo "hello"] -> Bash(echo "hello")
 */

import * as path from 'path';

export interface ReplaceOptions {
  taskId?: string;
  currentFilePath?: string; // The absolute path of the current file being processed
}

/**
 * 替换 prompt 中的 @{} 标记
 * @param prompt 原始 prompt 字符串
 * @param options 替换选项
 * @returns 替换后的字符串
 */
export function replaceAtMarks(prompt: string, options: ReplaceOptions = {}): string {
  const { taskId, currentFilePath } = options;
  
  // First replace @[] syntax
  prompt = replaceSquareBrackets(prompt, currentFilePath);
  
  // Then replace @{} syntax
  const regex = /@\{(?:(?:(["'])([^]*?)\1)|([^}\s"']+)(?:\s+(["'])([^]*?)\4)?)\}/g;
  
  return prompt.replace(regex, (match, _quote1, directCmd, filename, _quote2, userInput) => {
    if (directCmd !== undefined) {
      // @{"xxx"} 或 @{'xxx'} 格式 - 直接命令
      const command = unescapeQuotes(directCmd);
      return taskId 
        ? `Bash(ccrun '${escapeForShell(command)}' --taskId ${taskId})`
        : `Bash(ccrun '${escapeForShell(command)}')`;
    } else if (filename && userInput !== undefined) {
      // @{filename "xxx"} 或 @{filename 'xxx'} 格式 - 文件名 + 用户输入
      const input = unescapeQuotes(userInput);
      const absolutePath = resolveFilePath(filename, currentFilePath);
      return taskId
        ? `Bash(ccrun -f ${absolutePath} '${escapeForShell(input)}' --taskId ${taskId})`
        : `Bash(ccrun -f ${absolutePath} '${escapeForShell(input)}')`;
    } else if (filename) {
      // @{filename} 格式 - 仅文件名
      const absolutePath = resolveFilePath(filename, currentFilePath);
      return taskId
        ? `Bash(ccrun -f ${absolutePath} --taskId ${taskId})`
        : `Bash(ccrun -f ${absolutePath})`;
    }
    
    // 不应该到达这里，但保险起见返回原匹配
    return match;
  });
}

/**
 * 移除转义的引号
 * @param str 包含转义引号的字符串
 * @returns 移除转义后的字符串
 */
function unescapeQuotes(str: string): string {
  return str.replace(/\\(["'])/g, '$1');
}

/**
 * 为 shell 命令转义单引号
 * @param str 需要转义的字符串
 * @returns 转义后的字符串
 */
function escapeForShell(str: string): string {
  // 将单引号替换为 '\''
  return str.replace(/'/g, "'\\''");
}

/**
 * 解析文件路径为绝对路径
 * @param filename 文件名（可能是相对路径）
 * @param currentFilePath 当前文件的绝对路径
 * @returns 解析后的绝对路径
 */
function resolveFilePath(filename: string, currentFilePath?: string): string {
  // 如果已经是绝对路径，直接返回
  if (path.isAbsolute(filename)) {
    return filename;
  }
  
  // 如果有当前文件路径，相对于当前文件目录解析
  if (currentFilePath) {
    const currentDir = path.dirname(currentFilePath);
    return path.resolve(currentDir, filename);
  }
  
  // 否则相对于当前工作目录解析
  return path.resolve(process.cwd(), filename);
}

/**
 * 替换 @[] 标记为 Bash 命令
 * @param prompt 原始字符串
 * @param currentFilePath 当前文件路径
 * @returns 替换后的字符串
 */
function replaceSquareBrackets(prompt: string, currentFilePath?: string): string {
  const regex = /@\[([^\]]+)\]/g;
  
  return prompt.replace(regex, (match, content) => {
    // Parse the command content
    const trimmed = content.trim();
    
    // Extract the first part (could be a file or command)
    const firstSpaceIndex = trimmed.indexOf(' ');
    const firstPart = firstSpaceIndex === -1 ? trimmed : trimmed.substring(0, firstSpaceIndex);
    const restPart = firstSpaceIndex === -1 ? '' : trimmed.substring(firstSpaceIndex + 1);
    
    // Check if first part is a script file
    if (firstPart.match(/\.\w+$/)) {
      const ext = path.extname(firstPart).toLowerCase();
      const absolutePath = resolveFilePath(firstPart, currentFilePath);
      
      switch (ext) {
        case '.ts':
          return `Bash(npx tsx ${absolutePath}${restPart ? ' ' + restPart : ''})`;
        case '.js':
          return `Bash(node ${absolutePath}${restPart ? ' ' + restPart : ''})`;
        case '.py':
          return `Bash(python3 ${absolutePath}${restPart ? ' ' + restPart : ''})`;
        default:
          // Unknown extension, treat as shell script
          return `Bash(${absolutePath}${restPart ? ' ' + restPart : ''})`;
      }
    } else {
      // Not a file, treat as direct command
      return `Bash(${trimmed})`;
    }
  });
}