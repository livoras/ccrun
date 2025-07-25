import ccrun from '../src/ccrun';

// 新的 ctx 模式示例
ccrun()
  .watch({
    type: 'crontab',
    crontab: '*/10 * * * * *',  // 每 10 秒
    name: 'Context API Demo'
  })
  .then(async (ctx, next) => {
    // 使用 state 存储临时数据
    ctx.state.startTime = Date.now();
    ctx.state.counter = (ctx.state.counter || 0) + 1;
    
    // 创建任务
    await ctx.task('Demo Task', `Testing context API - Run #${ctx.state.counter}`);
    
    // 根据历史记录动态生成提示
    if (ctx.history.length === 1) {
      ctx.data = await ctx.prompt('Generate a random programming tip');
    } else {
      ctx.data = await ctx.prompt(`Previous data was: ${JSON.stringify(ctx.history[ctx.history.length - 1])}`);
    }

    await ctx.action('report', { markdown: 'OJBK' + ctx.state.counter })
    
    next();
  })
  .then(async (ctx, next) => {
    // 尝试解析 JSON
    try {
      ctx.data = await ctx.json();
      await ctx.addTags('json-parsed');
    } catch (e) {
      console.log('Not valid JSON, keeping as string');
      await ctx.addTags('raw-text');
    }
    
    // 计算处理时间
    ctx.state.processingTime = Date.now() - ctx.state.startTime;
    
    next();
  })
  .then(async (ctx, next) => {
    // 条件性添加标签
    if (ctx.state.processingTime > 1000) {
      await ctx.addTags('slow-processing');
    } else {
      await ctx.addTags('fast-processing');
    }
    
    // 记录
    console.log(`[Run #${ctx.state.counter}] Processing took ${ctx.state.processingTime}ms`);
    ctx.log();
    
    // 根据条件决定是否继续
    if (ctx.state.counter < 3) {
      next();
    } else {
      console.log('Stopping after 3 runs');
    }
  })
  .start();

console.log('Context API demo started. Will run every 10 seconds...');