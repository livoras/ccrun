import { describe, test, expect } from 'vitest';
import { replaceAtMarks } from './replaceAtMarks';

describe('replaceAtMarks', () => {
  describe('直接命令格式', () => {
    test('双引号包裹的命令', () => {
      expect(replaceAtMarks('@{"echo hello"}')).toBe("Bash(cc 'echo hello')");
      expect(replaceAtMarks('@{"echo hello"}', { taskId: '123' })).toBe("Bash(cc 'echo hello' --taskId 123)");
    });

    test('单引号包裹的命令', () => {
      expect(replaceAtMarks("@{'echo hello'}")).toBe("Bash(cc 'echo hello')");
      expect(replaceAtMarks("@{'echo hello'}", { taskId: '123' })).toBe("Bash(cc 'echo hello' --taskId 123)");
    });

    test('包含空格的命令', () => {
      expect(replaceAtMarks('@{"echo hello world"}')).toBe("Bash(cc 'echo hello world')");
    });

    test('双引号内包含单引号', () => {
      expect(replaceAtMarks('@{"echo \'hello\'"}')).toBe("Bash(cc 'echo '\\''hello'\\''')");
    });

    test('单引号内包含双引号', () => {
      expect(replaceAtMarks('@{\'echo "hello"\'}')).toBe('Bash(cc \'echo "hello"\')');
    });

    test('包含转义的双引号', () => {
      expect(replaceAtMarks('@{"echo \\"hello\\""}')).toBe('Bash(cc \'echo "hello"\')');
    });

    test('包含转义的单引号', () => {
      expect(replaceAtMarks("@{'echo \\'hello\\''}")).toBe("Bash(cc 'echo '\\''hello'\\''')");
    });

    test('空命令', () => {
      expect(replaceAtMarks('@{""}')).toBe("Bash(cc '')");
      expect(replaceAtMarks("@{''}")).toBe("Bash(cc '')");
    });
  });

  describe('文件名格式', () => {
    test('简单文件名', () => {
      expect(replaceAtMarks('@{file.txt}')).toBe('Bash(cc -f file.txt)');
      expect(replaceAtMarks('@{file.txt}', { taskId: '123' })).toBe('Bash(cc -f file.txt --taskId 123)');
    });

    test('包含路径的文件名', () => {
      expect(replaceAtMarks('@{path/to/file.txt}')).toBe('Bash(cc -f path/to/file.txt)');
    });

    test('包含连字符的文件名', () => {
      expect(replaceAtMarks('@{file-with-dash.txt}')).toBe('Bash(cc -f file-with-dash.txt)');
    });

    test('包含下划线的文件名', () => {
      expect(replaceAtMarks('@{file_with_underscore.txt}')).toBe('Bash(cc -f file_with_underscore.txt)');
    });

    test('包含多个点的文件名', () => {
      expect(replaceAtMarks('@{file.multiple.dots.txt}')).toBe('Bash(cc -f file.multiple.dots.txt)');
    });

    test('包含中文的文件名', () => {
      expect(replaceAtMarks('@{中文文件.txt}')).toBe('Bash(cc -f 中文文件.txt)');
    });
  });

  describe('文件名 + 用户输入格式', () => {
    test('双引号用户输入', () => {
      expect(replaceAtMarks('@{file.txt "user input"}')).toBe("Bash(cc -f file.txt 'user input')");
      expect(replaceAtMarks('@{file.txt "user input"}', { taskId: '123' })).toBe("Bash(cc -f file.txt 'user input' --taskId 123)");
    });

    test('单引号用户输入', () => {
      expect(replaceAtMarks("@{file.txt 'user input'}")).toBe("Bash(cc -f file.txt 'user input')");
      expect(replaceAtMarks("@{file.txt 'user input'}", { taskId: '123' })).toBe("Bash(cc -f file.txt 'user input' --taskId 123)");
    });

    test('用户输入包含空格', () => {
      expect(replaceAtMarks('@{file.txt "hello world test"}')).toBe("Bash(cc -f file.txt 'hello world test')");
    });

    test('用户输入的双引号内包含单引号', () => {
      expect(replaceAtMarks('@{file.txt "don\'t do this"}')).toBe("Bash(cc -f file.txt 'don'\\''t do this')");
    });

    test('用户输入的单引号内包含双引号', () => {
      expect(replaceAtMarks('@{file.txt \'say "hello"\'}').toString()).toBe('Bash(cc -f file.txt \'say "hello"\')');
    });

    test('用户输入包含转义', () => {
      expect(replaceAtMarks('@{file.txt "say \\"hello\\""}')).toBe('Bash(cc -f file.txt \'say "hello"\')');
    });

    test('路径文件 + 用户输入', () => {
      expect(replaceAtMarks('@{path/to/file.txt "analyze this"}')).toBe("Bash(cc -f path/to/file.txt 'analyze this')");
    });

    test('空用户输入', () => {
      expect(replaceAtMarks('@{file.txt ""}')).toBe("Bash(cc -f file.txt '')");
      expect(replaceAtMarks("@{file.txt ''}")).toBe("Bash(cc -f file.txt '')");
    });
  });

  describe('边界情况', () => {
    test('空内容', () => {
      expect(replaceAtMarks('@{}')).toBe('@{}');
    });

    test('只有空格', () => {
      expect(replaceAtMarks('@{  }')).toBe('@{  }');
    });

    test('后面紧跟其他字符', () => {
      expect(replaceAtMarks('@{file.txt}extra')).toBe('Bash(cc -f file.txt)extra');
    });

    test('前面紧跟其他字符', () => {
      expect(replaceAtMarks('extra@{file.txt}')).toBe('extraBash(cc -f file.txt)');
    });

    test('多个标记', () => {
      const input = '@{file1.txt} and @{file2.txt}';
      const expected = 'Bash(cc -f file1.txt) and Bash(cc -f file2.txt)';
      expect(replaceAtMarks(input)).toBe(expected);
    });

    test('混合不同格式', () => {
      const input = 'Run @{"echo test"}, read @{file.txt} and @{doc.txt "analyze"}';
      const expected = "Run Bash(cc 'echo test'), read Bash(cc -f file.txt) and Bash(cc -f doc.txt 'analyze')";
      expect(replaceAtMarks(input)).toBe(expected);
    });
  });

  describe('嵌套和复杂情况', () => {
    test('用户输入中包含 @{}', () => {
      expect(replaceAtMarks('@{file.txt "check @{nested}"}')).toBe("Bash(cc -f file.txt 'check @{nested}')");
    });

    test('命令中包含 @{}', () => {
      expect(replaceAtMarks('@{"echo @{nested}"}')).toBe("Bash(cc 'echo @{nested}')");
    });

    test('包含换行符', () => {
      const input = 'Line 1\n@{file.txt}\nLine 3';
      const expected = 'Line 1\nBash(cc -f file.txt)\nLine 3';
      expect(replaceAtMarks(input)).toBe(expected);
    });

    test('超长文件名', () => {
      const longFilename = 'a'.repeat(100) + '.txt';
      expect(replaceAtMarks(`@{${longFilename}}`)).toBe(`Bash(cc -f ${longFilename})`);
    });

    test('在句子中的多个标记', () => {
      const input = '请先执行 @{"ls -la"}，然后查看 @{README.md}，最后运行 @{script.sh "with params"}。';
      const expected = "请先执行 Bash(cc 'ls -la')，然后查看 Bash(cc -f README.md)，最后运行 Bash(cc -f script.sh 'with params')。";
      expect(replaceAtMarks(input)).toBe(expected);
    });
  });

  describe('不应该匹配的情况', () => {
    test('缺少花括号', () => {
      expect(replaceAtMarks('@file.txt')).toBe('@file.txt');
    });

    test('缺少 @', () => {
      expect(replaceAtMarks('{file.txt}')).toBe('{file.txt}');
    });

    test('使用方括号', () => {
      expect(replaceAtMarks('@[file.txt]')).toBe('@[file.txt]');
    });

    test('缺少结束花括号', () => {
      expect(replaceAtMarks('@{file.txt')).toBe('@{file.txt');
    });

    test('缺少开始花括号', () => {
      expect(replaceAtMarks('@file.txt}')).toBe('@file.txt}');
    });

    test('引号不匹配', () => {
      expect(replaceAtMarks('@{"hello\'}')).toBe('@{"hello\'}');
      expect(replaceAtMarks('@{\'hello"}')).toBe('@{\'hello"}');
    });
  });

  describe('特殊字符处理', () => {
    test('文件名包含特殊字符', () => {
      expect(replaceAtMarks('@{file$.txt}')).toBe('Bash(cc -f file$.txt)');
      expect(replaceAtMarks('@{file#.txt}')).toBe('Bash(cc -f file#.txt)');
      expect(replaceAtMarks('@{file@.txt}')).toBe('Bash(cc -f file@.txt)');
    });

    test('命令包含单引号需要正确转义', () => {
      expect(replaceAtMarks('@{"echo \'test\'"}')).toBe("Bash(cc 'echo '\\''test'\\''')");
      expect(replaceAtMarks('@{"it\'s working"}')).toBe("Bash(cc 'it'\\''s working')");
    });

    test('复杂的混合引号情况', () => {
      expect(replaceAtMarks('@{"echo \'hello "world"\'"}')).toBe("Bash(cc 'echo '\\''hello \"world\"'\\''')");
    });
  });

  describe('实际使用场景', () => {
    test('中文提示词', () => {
      const input = '请执行 @{"echo 你好"} 并查看 @{测试.md "分析内容"}';
      const expected = "请执行 Bash(cc 'echo 你好') 并查看 Bash(cc -f 测试.md '分析内容')";
      expect(replaceAtMarks(input)).toBe(expected);
    });

    test('任务上下文', () => {
      const input = '完成以下任务：\n1. @{task1.md}\n2. @{task2.md "详细分析"}\n3. @{"git status"}';
      const expected = "完成以下任务：\n1. Bash(cc -f task1.md)\n2. Bash(cc -f task2.md '详细分析')\n3. Bash(cc 'git status')";
      expect(replaceAtMarks(input)).toBe(expected);
    });

    test('带 taskId 的完整场景', () => {
      const input = '任务 @{config.yaml} 需要 @{"npm install"} 然后 @{test.js "运行测试"}';
      const expected = "任务 Bash(cc -f config.yaml --taskId abc123) 需要 Bash(cc 'npm install' --taskId abc123) 然后 Bash(cc -f test.js '运行测试' --taskId abc123)";
      expect(replaceAtMarks(input, { taskId: 'abc123' })).toBe(expected);
    });
  });
});