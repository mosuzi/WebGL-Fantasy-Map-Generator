import {createWorkerGraphDecoder, encodeWorkerGraph} from "./worker-graph-stream.js";
import {
  assertWorkerTaskExecution,
  assertWorkerTaskRequest,
  assertWorkerTaskSessionCommit,
  assertWorkerTaskStreamAck,
  assertWorkerTaskStreamPacket,
  createWorkerTaskMessage,
  createWorkerTaskStreamAck,
  createWorkerTaskStreamPacket,
  serializeWorkerTaskError,
  WORKER_TASK_MESSAGE
} from "./worker-task-protocol.js";
import {getWorkerTaskHandler} from "./worker-task-registry.js";

const pendingRequests = new Map();
const activeRequests = new Map();
let retainedSession = null;
const OUTPUT_WINDOW = 4;
const OUTPUT_ACK_TIMEOUT_MS = 5000;

self.addEventListener("message", async event => {
  let request = event.data;
  try {
    if (request?.type === WORKER_TASK_MESSAGE.COMMIT_SESSION) {
      request = assertWorkerTaskSessionCommit(request);
      if (!retainedSession || retainedSession.id !== request.sessionId || retainedSession.status !== "pending" || retainedSession.requestId !== request.requestId) {
        throw workerStateError("worker_protocol_session_commit_invalid", "Worker session 不在可提交状态");
      }
      if (!isValidSessionCommitBinding(retainedSession.binding, request.binding)) {
        throw workerStateError("worker_protocol_session_commit_invalid", "Worker session 提交绑定不连续");
      }
      retainedSession.binding = request.binding;
      retainedSession.status = "idle";
      retainedSession.request = {...retainedSession.request, binding: request.binding, reuseSession: true};
      self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.SESSION_COMMITTED, retainedSession.request));
      return;
    }
    if (request?.type === WORKER_TASK_MESSAGE.RUN) {
      request = assertWorkerTaskRequest(request);
      getWorkerTaskHandler(request.task);
      if (pendingRequests.has(request.requestId) || activeRequests.has(request.requestId)) {
        throw workerStateError("worker_protocol_duplicate_run", "Worker 请求已初始化");
      }
      if (request.reuseSession) {
        if (!retainedSession || retainedSession.id !== request.sessionId || retainedSession.status !== "idle" || retainedSession.task !== request.task || !sameSessionBinding(retainedSession.binding, request.binding)) {
          throw workerStateError("worker_protocol_session_stale", "Worker session 镜像与请求绑定不一致");
        }
        retainedSession.status = "running";
      } else if (request.persistentSession && retainedSession) {
        throw workerStateError("worker_protocol_session_duplicate", "Worker 已持有另一地图 session");
      }
      pendingRequests.set(request.requestId, {
        request,
        decoder: null,
        inputStreamId: `${request.requestId}:input`,
        inputReady: false,
        payload: undefined,
        baseMap: request.reuseSession ? retainedSession.map : null,
        renderCache: request.reuseSession ? retainedSession.renderCache : Object.create(null)
      });
      self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.READY, request));
      return;
    }
    if (request?.type === WORKER_TASK_MESSAGE.INPUT_PACKET) {
      request = assertWorkerTaskStreamPacket(request, WORKER_TASK_MESSAGE.INPUT_PACKET);
      const state = getPendingState(request);
      if (state.inputReady || request.streamId !== state.inputStreamId) {
        throw workerStateError("worker_protocol_input_stream_invalid", "Worker 输入流标识或次序无效");
      }
      if (!state.decoder) state.decoder = createWorkerGraphDecoder({streamId: state.inputStreamId});
      const complete = state.decoder.push(request.packet);
      if (complete) {
        state.payload = state.decoder.finish();
        state.inputReady = true;
      }
      self.postMessage(createWorkerTaskStreamAck(WORKER_TASK_MESSAGE.INPUT_ACK, state.request, {
        streamId: state.inputStreamId,
        sequence: request.sequence
      }));
      if (complete) {
        self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.INPUT_READY, state.request, {
          streamId: state.inputStreamId
        }));
      }
      return;
    }
    if (request?.type === WORKER_TASK_MESSAGE.OUTPUT_ACK) {
      request = assertWorkerTaskStreamAck(request, WORKER_TASK_MESSAGE.OUTPUT_ACK);
      const state = getActiveState(request);
      if (request.streamId !== state.outputStreamId || !state.outputInflight.has(request.sequence)) {
        throw workerStateError("worker_protocol_output_ack_invalid", "Worker 结果流确认消息无效或重复");
      }
      state.outputInflight.delete(request.sequence);
      resolveOutputWaiters(state);
      return;
    }
    request = assertWorkerTaskExecution(request);
    const state = getPendingState(request);
    if (!state.inputReady || request.inputStreamId !== state.inputStreamId) {
      throw workerStateError("worker_protocol_not_ready", "Worker 输入流尚未完成组装");
    }
    pendingRequests.delete(request.requestId);
    state.outputStreamId = `${request.requestId}:output`;
    state.outputInflight = new Set();
    state.outputWaiters = new Set();
    activeRequests.set(request.requestId, state);
    self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ACCEPTED, state.request));
    const handler = getWorkerTaskHandler(request.task);
    if (!canReuseRenderCache(state.request.task, state.payload)) state.renderCache = Object.create(null);
    const context = createWorkerContext(state.request, state.renderCache);
    const handlerPayload = state.request.reuseSession
      ? {...state.payload, map: state.baseMap}
      : state.payload;
    const computeStartedAt = now();
    const result = await handler(handlerPayload, context);
    const computeMs = roundMs(now() - computeStartedAt);
    context.checkpoint();
    const outputTelemetry = await sendResultStream(state, result, context);
    if (state.request.persistentSession) {
      retainedSession = {
        id: state.request.sessionId,
        task: state.request.task,
        status: "pending",
        binding: state.request.binding,
        requestId: state.request.requestId,
        request: state.request,
        map: handlerPayload.map,
        renderCache: context.renderCache
      };
    }
    self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.RESULT, state.request, {
      resultStreamId: state.outputStreamId,
      telemetry: {computeMs, ...outputTelemetry}
    }));
    activeRequests.delete(request.requestId);
  } catch (error) {
    const fallbackRequest = resolveRequest(request);
    clearRequestState(fallbackRequest.requestId, error);
    self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ERROR, fallbackRequest, {
      error: serializeWorkerTaskError(error)
    }));
  }
});

self.addEventListener("messageerror", event => {
  const state = pendingRequests.values().next().value || activeRequests.values().next().value;
  const request = state?.request || {requestId: "unknown", task: "unknown", binding: null};
  const error = workerStateError("worker_protocol_deserialize_failed", event?.message || "Worker 无法反序列化输入消息");
  for (const current of activeRequests.values()) rejectOutputWaiters(current, error);
  pendingRequests.clear();
  activeRequests.clear();
  retainedSession = null;
  self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ERROR, request, {
    error: serializeWorkerTaskError(error)
  }));
});

async function sendResultStream(state, result, context) {
  const startedAt = now();
  let packets = 0;
  let postMaxMs = 0;
  for await (const packet of encodeWorkerGraph(result, {
    streamId: state.outputStreamId,
    packetUnits: 1024,
    recordUnits: 128,
    numericBatchValues: 32 * 1024,
    sliceBytes: 128 * 1024,
    budgetMs: 4,
    onProgress(stage, detail) {
      context.report(`result-stream-${stage}`, detail);
    }
  })) {
    while (state.outputInflight.size >= OUTPUT_WINDOW) await waitForOutputAck(state);
    const postStartedAt = now();
    self.postMessage(
      createWorkerTaskStreamPacket(WORKER_TASK_MESSAGE.OUTPUT_PACKET, state.request, packet.message),
      packet.transferables
    );
    postMaxMs = Math.max(postMaxMs, roundMs(now() - postStartedAt));
    packets += 1;
    state.outputInflight.add(packet.message.sequence);
  }
  while (state.outputInflight.size) await waitForOutputAck(state);
  return {outputWorkerPackets: packets, outputWorkerPostMaxMs: postMaxMs, outputWorkerStreamMs: roundMs(now() - startedAt)};
}

function waitForOutputAck(state) {
  if (!state.outputInflight.size) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const waiter = {resolve, reject, timer: null};
    waiter.timer = setTimeout(() => {
      state.outputWaiters.delete(waiter);
      reject(workerStateError("worker_output_ack_timeout", "Worker 结果流确认超时"));
    }, OUTPUT_ACK_TIMEOUT_MS);
    state.outputWaiters.add(waiter);
  });
}

function resolveOutputWaiters(state) {
  for (const waiter of state.outputWaiters) {
    clearTimeout(waiter.timer);
    waiter.resolve();
  }
  state.outputWaiters.clear();
}

function rejectOutputWaiters(state, error) {
  for (const waiter of state.outputWaiters || []) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  state.outputWaiters?.clear();
}

function getPendingState(request) {
  const state = pendingRequests.get(request.requestId);
  if (!state
    || state.request.task !== request.task
    || String(state.request.sessionId || "") !== String(request.sessionId || "")
    || !sameBinding(state.request.binding, request.binding)) {
    throw workerStateError("worker_protocol_not_ready", "Worker 请求尚未完成初始化或绑定已变化");
  }
  return state;
}

function getActiveState(request) {
  const state = activeRequests.get(request.requestId);
  if (!state
    || state.request.task !== request.task
    || String(state.request.sessionId || "") !== String(request.sessionId || "")
    || !sameBinding(state.request.binding, request.binding)) {
    throw workerStateError("worker_protocol_not_active", "Worker 请求尚未接受或绑定已变化");
  }
  return state;
}

function resolveRequest(request) {
  if (request?.requestId) {
    return pendingRequests.get(request.requestId)?.request
      || activeRequests.get(request.requestId)?.request
      || request;
  }
  return {requestId: "unknown", task: "unknown", binding: null};
}

function clearRequestState(requestId, error) {
  const pending = pendingRequests.get(requestId);
  const active = activeRequests.get(requestId);
  if (active) rejectOutputWaiters(active, error);
  if (pending?.request?.persistentSession || active?.request?.persistentSession) retainedSession = null;
  pendingRequests.delete(requestId);
  activeRequests.delete(requestId);
}

function workerStateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createWorkerContext(request, renderCache = Object.create(null)) {
  return Object.freeze({
    binding: request.binding,
    renderCache,
    signal: null,
    report(stage, detail = {}) {
      self.postMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.PROGRESS, request, {
        stage: String(stage || "run"),
        detail: clonePlain(detail)
      }));
    },
    checkpoint() {
      return true;
    }
  });
}

function canReuseRenderCache(task, payload) {
  return task === "render.prepare" || (task === "regeneration.compute" && payload?.mode === "render-only");
}

function sameBinding(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function sameSessionBinding(left, right) {
  return left?.mapIdentity === right?.mapIdentity
    && Number(left?.mapRevision) === Number(right?.mapRevision)
    && Number(left?.generationToken) === Number(right?.generationToken)
    && String(left?.lockFingerprint || "") === String(right?.lockFingerprint || "");
}

function isValidSessionCommitBinding(previous, next) {
  if (previous?.mapIdentity !== next?.mapIdentity
    || Number(previous?.generationToken) !== Number(next?.generationToken)
    || String(previous?.lockFingerprint || "") !== String(next?.lockFingerprint || "")
    || Number(previous?.operationId) !== Number(next?.operationId)
    || String(previous?.operationName || "") !== String(next?.operationName || "")) return false;
  const revisionDelta = Number(next?.mapRevision) - Number(previous?.mapRevision);
  return revisionDelta === 0 || revisionDelta === 1;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
