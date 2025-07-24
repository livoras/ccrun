/**
 * 替换 @{} 标记为 Bash 命令
 * 支持的格式：
 * - @{"command"} 或 @{'command'} -> Bash(ccrun 'command' [--taskId xxx])
 * - @{filename} -> Bash(ccrun -f filename [--taskId xxx])
 * - @{filename "user input"} 或 @{filename 'user input'} -> Bash(ccrun -f filename 'user input' [--taskId xxx])
 */

export interface ReplaceOptions {
  taskId?: string;
}

/**
 * 替换 prompt 中的 @{} 标记
 * @param prompt 原始 prompt 字符串
 * @param options 替换选项
 * @returns 替换后的字符串
 */
export function replaceAtMarks(prompt: string, options: ReplaceOptions = {}): string {
  const { taskId } = options;
  
  // 使用一个更强大的正则表达式来处理所有情况
  // 这个正则使用前瞻和后顾来正确匹配引号
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
      return taskId
        ? `Bash(ccrun -f ${filename} '${escapeForShell(input)}' --taskId ${taskId})`
        : `Bash(ccrun -f ${filename} '${escapeForShell(input)}')`;
    } else if (filename) {
      // @{filename} 格式 - 仅文件名
      return taskId
        ? `Bash(ccrun -f ${filename} --taskId ${taskId})`
        : `Bash(ccrun -f ${filename})`;
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