const TRACE_VERSION = 1;

export function createHeightBrushCommitTrace(details = {}) {
  return {
    version: TRACE_VERSION,
    kind: "height-brush-commit",
    startedAt: now(),
    changedCells: 0,
    stages: {},
    stageOrder: [],
    ...details
  };
}

export function measureHeightBrushCommitStage(trace, name, task, details = {}) {
  if (!trace) return task();
  const startedAt = now();
  try {
    const result = task();
    recordHeightBrushCommitStage(trace, name, startedAt, details);
    return result;
  } catch (error) {
    recordHeightBrushCommitStage(trace, name, startedAt, {
      ...details,
      status: "error",
      error: error?.message || String(error)
    });
    throw error;
  }
}

export function recordHeightBrushCommitStage(trace, name, startedAt, details = {}) {
  if (!trace) return null;
  const baseName = String(name || "unknown");
  let stageName = baseName;
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(trace.stages, stageName)) {
    stageName = `${baseName}#${suffix}`;
    suffix += 1;
  }
  trace.stages[stageName] = {
    ms: roundMs(now() - startedAt),
    ...details
  };
  trace.stageOrder.push(stageName);
  return stageName;
}

export function finishHeightBrushCommitTrace(trace, details = {}) {
  if (!trace) return null;
  const finishedAt = now();
  return {
    version: trace.version,
    kind: trace.kind,
    startedAt: trace.startedAt,
    finishedAt,
    totalMs: roundMs(finishedAt - trace.startedAt),
    changedCells: trace.changedCells,
    stageOrder: [...trace.stageOrder],
    stages: Object.fromEntries(trace.stageOrder.map(name => [name, {...trace.stages[name]}])),
    ...details
  };
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
