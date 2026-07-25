const DEFAULT_SUGGESTIONS = Object.freeze({
  operation_busy: "等待当前任务结束后重试。",
  operation_cancelled: "当前请求已取消，可在确认地图状态后重试。",
  operation_obsolete: "地图已被替换，请在当前地图上重新发起请求。",
  operation_invalid_input: "检查参数或导入内容后重试。",
  operation_failed: "保留当前地图并查看错误详情后重试。",
  operation_rollback_failed: "运行时回滚失败，请重新载入当前地图。"
});

export class RuntimeOperationError extends Error {
  constructor(code, message, options = {}) {
    super(String(message || "运行时任务失败"), options.cause ? {cause: options.cause} : undefined);
    this.name = "RuntimeOperationError";
    this.code = String(code || "operation_failed");
    this.stage = String(options.stage || "run");
    this.suggestion = String(options.suggestion || DEFAULT_SUGGESTIONS[this.code] || DEFAULT_SUGGESTIONS.operation_failed);
    this.expected = Boolean(options.expected);
  }
}

export function createRuntimeOperationError(code, message, options = {}) {
  return new RuntimeOperationError(code, message, options);
}

export function createRuntimeOperationManager(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => globalThis.performance?.now?.() ?? Date.now();
  let sequence = 0;
  let current = null;
  let last = null;

  const manager = {
    getSnapshot,
    run,
    runSync,
    cancelCurrent
  };
  publish();
  return manager;

  async function run(name, task, config = {}) {
    const operation = begin(name, config);
    let transactionSnapshot;
    try {
      transactionSnapshot = await config.snapshot?.(operation.context);
      const result = await task(operation.context);
      const status = config.isNoop?.(result) ? "noop" : "success";
      const summary = finish(operation, status, result);
      return attachOperationSummary(result, summary);
    } catch (rawError) {
      let error = normalizeRuntimeOperationError(rawError, operation.context.stage);
      if (config.rollback && transactionSnapshot !== undefined) {
        try {
          await config.rollback(transactionSnapshot, error, operation.context);
        } catch (rollbackError) {
          error = new RuntimeOperationError("operation_rollback_failed", `任务失败且回滚失败：${error.message}`, {
            stage: "rollback",
            cause: rollbackError,
            suggestion: DEFAULT_SUGGESTIONS.operation_rollback_failed
          });
        }
      }
      finish(operation, "failure", null, error);
      throw error;
    }
  }

  function runSync(name, task, config = {}) {
    const operation = begin(name, config);
    let transactionSnapshot;
    try {
      transactionSnapshot = config.snapshot?.(operation.context);
      if (isPromiseLike(transactionSnapshot)) throw new Error("同步任务的 snapshot 不能返回 Promise");
      const result = task(operation.context);
      if (isPromiseLike(result)) throw new Error("同步任务不能返回 Promise");
      const status = config.isNoop?.(result) ? "noop" : "success";
      const summary = finish(operation, status, result);
      return attachOperationSummary(result, summary);
    } catch (rawError) {
      let error = normalizeRuntimeOperationError(rawError, operation.context.stage);
      if (config.rollback && transactionSnapshot !== undefined) {
        try {
          const rollbackResult = config.rollback(transactionSnapshot, error, operation.context);
          if (isPromiseLike(rollbackResult)) throw new Error("同步任务的 rollback 不能返回 Promise");
        } catch (rollbackError) {
          error = new RuntimeOperationError("operation_rollback_failed", `任务失败且回滚失败：${error.message}`, {
            stage: "rollback",
            cause: rollbackError,
            suggestion: DEFAULT_SUGGESTIONS.operation_rollback_failed
          });
        }
      }
      finish(operation, "failure", null, error);
      throw error;
    }
  }

  function begin(name, config) {
    const operationName = String(name || "runtime-operation");
    if (current) {
      const error = new RuntimeOperationError("operation_busy", `当前正在执行 ${current.name}，不能同时启动 ${operationName}`, {
        stage: "start",
        expected: true
      });
      options.recordHealth?.("operation-rejected", {name: operationName, active: current.name, code: error.code}, "info");
      throw error;
    }
    const startedAt = now();
    const operation = {
      id: ++sequence,
      name: operationName,
      stage: String(config.initialStage || "start"),
      message: String(config.message || ""),
      startedAt,
      loading: config.loading !== false,
      stages: [],
      abortController: new AbortController()
    };
    const context = {
      id: operation.id,
      name: operation.name,
      signal: operation.abortController.signal,
      get stage() {
        return operation.stage;
      },
      report: (stage, detail = {}) => report(operation, stage, detail),
      isCurrent: () => current === operation && !operation.abortController.signal.aborted,
      throwIfCancelled: () => {
        if (operation.abortController.signal.aborted) throw new DOMException(operation.abortController.signal.reason || "运行时任务已取消", "AbortError");
      }
    };
    operation.context = context;
    operation.health = operation.loading ? null : options.beginHealthOperation?.(operation.name, {operationId: operation.id}) || null;
    current = operation;
    if (operation.loading) options.setLoading?.(true, operation.message, snapshotOperation(operation));
    publish();
    return operation;
  }

  function report(operation, stage, detail = {}) {
    if (current !== operation) return false;
    operation.stage = String(stage || operation.stage || "run");
    operation.message = String(detail.message || operation.message || "");
    operation.stages.push({stage: operation.stage, message: operation.message, atMs: roundMs(now() - operation.startedAt)});
    if (operation.stages.length > 24) operation.stages.shift();
    if (operation.loading && detail.loading !== false) options.setLoading?.(true, operation.message, snapshotOperation(operation));
    options.recordHealth?.("operation-stage", {name: operation.name, operationId: operation.id, stage: operation.stage}, "info");
    publish();
    return true;
  }

  function finish(operation, status, result = null, error = null) {
    const completedAt = now();
    const summary = {
      id: operation.id,
      name: operation.name,
      status,
      stage: operation.stage,
      durationMs: roundMs(completedAt - operation.startedAt),
      stages: operation.stages.map(item => ({...item})),
      error: error ? operationErrorSnapshot(error) : null
    };
    operation.health?.end?.({status, code: error?.code || ""});
    if (operation.loading) options.setLoading?.(false, "", summary);
    current = null;
    last = summary;
    if (status === "failure") {
      const expected = Boolean(error?.expected);
      options.recordHealth?.(expected ? "operation-rejected" : "operation-failed", {
        name: operation.name,
        operationId: operation.id,
        code: error?.code || "operation_failed",
        stage: error?.stage || operation.stage,
        message: error?.message || ""
      }, expected ? "info" : "error");
    } else {
      options.recordHealth?.(status === "noop" ? "operation-noop" : "operation-success", {
        name: operation.name,
        operationId: operation.id,
        durationMs: summary.durationMs
      }, "info");
    }
    publish();
    return summary;
  }

  function getSnapshot() {
    return {
      busy: Boolean(current),
      current: current ? snapshotOperation(current) : null,
      last: last ? cloneSnapshot(last) : null
    };
  }

  function cancelCurrent(reason = "用户取消") {
    if (!current || current.abortController.signal.aborted) return false;
    current.abortController.abort(String(reason || "用户取消"));
    options.recordHealth?.("operation-cancel-requested", {name: current.name, operationId: current.id}, "info");
    publish();
    return true;
  }

  function publish() {
    options.onStateChange?.(getSnapshot());
  }
}

export function normalizeRuntimeOperationError(error, stage = "run") {
  if (error instanceof RuntimeOperationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (error?.code && error?.stage && error?.suggestion) {
    return new RuntimeOperationError(String(error.code), message, {
      stage: String(error.stage),
      suggestion: String(error.suggestion),
      cause: error,
      expected: true
    });
  }
  if (error?.name === "AbortError" || /取消|取代|cancel|abort/i.test(message)) {
    return new RuntimeOperationError("operation_cancelled", message, {stage, cause: error, expected: true});
  }
  if (error instanceof SyntaxError || /confirm|必须|缺少|未知|无效|不支持|找不到|当前没有|不能为空|范围/i.test(message)) {
    return new RuntimeOperationError("operation_invalid_input", message, {stage, cause: error, expected: true});
  }
  return new RuntimeOperationError("operation_failed", message, {stage, cause: error});
}

function attachOperationSummary(result, summary) {
  if (result && typeof result === "object" && !Array.isArray(result)) return {...result, operation: summary};
  return {result, operation: summary};
}

function snapshotOperation(operation) {
  return {
    id: operation.id,
    name: operation.name,
    stage: operation.stage,
    message: operation.message,
    startedAt: operation.startedAt,
    stages: operation.stages.map(item => ({...item}))
  };
}

function operationErrorSnapshot(error) {
  return {
    code: error.code || "operation_failed",
    name: error.name || "Error",
    message: error.message || String(error),
    stage: error.stage || "run",
    suggestion: error.suggestion || DEFAULT_SUGGESTIONS.operation_failed
  };
}

function cloneSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}
