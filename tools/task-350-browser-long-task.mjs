export async function prepareTask350LongTaskObserver(page) {
  if (!page || typeof page.addInitScript !== "function") throw new TypeError("page.addInitScript 必须可用");
  await page.addInitScript(() => {
    window.__task350FixtureLongTasks = [];
    window.__task350FixtureLongTaskStartedAt = performance.now();
    window.__task350FixtureLongTaskObserver?.disconnect?.();
    window.__task350FixtureLongTaskObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        window.__task350FixtureLongTasks.push({name: entry.name, startTime: entry.startTime, duration: entry.duration});
      }
    });
    window.__task350FixtureLongTaskObserver.observe({type: "longtask", buffered: false});
  });
}

export async function resetTask350LongTaskWindow(page) {
  return page.evaluate(() => {
    const observer = window.__task350FixtureLongTaskObserver;
    if (!observer) throw new Error("Task 350 LongTask observer 未安装");
    observer.takeRecords();
    window.__task350FixtureLongTasks = [];
    window.__task350FixtureLongTaskStartedAt = performance.now();
    return window.__task350FixtureLongTaskStartedAt;
  });
}

export async function collectTask350LongTaskWindow(page, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(labelValue => {
    const observer = window.__task350FixtureLongTaskObserver;
    if (!observer) throw new Error("Task 350 LongTask observer 未安装");
    for (const entry of observer.takeRecords()) {
      window.__task350FixtureLongTasks.push({name: entry.name, startTime: entry.startTime, duration: entry.duration});
    }
    const startedAt = Number(window.__task350FixtureLongTaskStartedAt || 0);
    const tasks = (window.__task350FixtureLongTasks || [])
      .filter(task => Number(task.startTime) >= startedAt)
      .map(task => ({
        label: labelValue,
        name: task.name,
        startTime: Number(task.startTime),
        duration: Number(task.duration)
      }));
    window.__task350FixtureLongTasks = [];
    window.__task350FixtureLongTaskStartedAt = performance.now();
    return tasks;
  }, label);
}

export function summarizeTask350LongTasks(longTasks, budgetMs = 200) {
  const normalized = Array.isArray(longTasks) ? longTasks : [];
  return {
    longTaskCount: normalized.length,
    maxLongTaskMs: Math.max(0, ...normalized.map(task => Number(task.duration) || 0)),
    overBudget: normalized.filter(task => Number(task.duration) > budgetMs)
  };
}

export function partitionTask350StartupLongTasks(baselineTasks, targetTasks, toleranceMs = 50) {
  const tolerance = Number(toleranceMs);
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new TypeError("LongTask 启动匹配容差必须是非负有限数");
  const remainingBaseline = (Array.isArray(baselineTasks) ? baselineTasks : []).map(task => ({task}));
  const sharedStartup = [];
  const active = [];
  for (const target of Array.isArray(targetTasks) ? targetTasks : []) {
    let best = null;
    for (let index = 0; index < remainingBaseline.length; index++) {
      const baseline = remainingBaseline[index].task;
      const startDeltaMs = Math.abs(Number(target.startTime) - Number(baseline.startTime));
      const durationDeltaMs = Math.abs(Number(target.duration) - Number(baseline.duration));
      if (startDeltaMs > tolerance || durationDeltaMs > tolerance) continue;
      const score = startDeltaMs + durationDeltaMs;
      if (!best || score < best.score) best = {index, baseline, startDeltaMs, durationDeltaMs, score};
    }
    if (!best) {
      active.push(target);
      continue;
    }
    remainingBaseline.splice(best.index, 1);
    sharedStartup.push({target, baseline: best.baseline, startDeltaMs: best.startDeltaMs, durationDeltaMs: best.durationDeltaMs});
  }
  return {sharedStartup, active};
}
