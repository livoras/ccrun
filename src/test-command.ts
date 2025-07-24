import { runCC } from './cc-core';
import { resolve, dirname } from 'path';

async function testExecuteCommand(command: string, data: any) {
  console.log(`[Test] Testing command: ${command}`);
  console.log(`[Test] Input data:`, JSON.stringify(data, null, 2));
  
  // Parse @{process.md *data} format
  const match = command.match(/@\{([^}]+)\}/);
  if (!match) {
    console.log('[Test] No match found for command format');
    return data;
  }
  
  const [cmdFile, ...args] = match[1].split(/\s+/);
  const processedArgs = args.map(arg => {
    if (arg === '*data') {
      return JSON.stringify(data);
    }
    return arg;
  });
  
  console.log(`[Test] Command file: ${cmdFile}`);
  console.log(`[Test] Processed args:`, processedArgs);
  
  const configPath = resolve(process.cwd(), 'test.yaml');
  const cmdFilePath = resolve(dirname(configPath), cmdFile);
  const packageRoot = resolve(dirname(configPath));
  
  console.log(`[Test] Config path: ${configPath}`);
  console.log(`[Test] Command file path: ${cmdFilePath}`);
  console.log(`[Test] Package root: ${packageRoot}`);
  
  try {
    // Call runCC directly
    console.log(`[Test] Calling runCC...`);
    await runCC({
      filePath: cmdFilePath,
      userInput: processedArgs.join(' '),
      packageRoot
    });
    
    console.log(`[Test] runCC completed successfully`);
    return data;
  } catch (error) {
    console.error('[Test] Error executing cc:', error);
    throw error;
  }
}

// Test with sample data
async function main() {
  const testData = {
    question: "What's your favorite programming language?",
    filtered: true,
    processedAt: new Date().toISOString()
  };
  
  const command = '@{process.md *data}';
  
  try {
    await testExecuteCommand(command, testData);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main();