export const WORKER_TASK_PROTOCOL = "webgl-generator-worker-task";
export const WORKER_TASK_PROTOCOL_VERSION = 1;

export const WORKER_TASK_MESSAGE = Object.freeze({
  RUN: "run",
  READY: "ready",
  INPUT_PACKET: "input-packet",
  INPUT_ACK: "input-ack",
  INPUT_READY: "input-ready",
  EXECUTE: "execute",
  ACCEPTED: "accepted",
  PROGRESS: "progress",
  OUTPUT_PACKET: "output-packet",
  OUTPUT_ACK: "output-ack",
  RESULT: "result",
  COMMIT_SESSION: "commit-session",
  SESSION_COMMITTED: "session-committed",
  ERROR: "error"
});

export function createWorkerTaskRequest({requestId, task, binding, payload, sessionId = "", reuseSession = false, persistentSession = false}) {
  return {
    protocol: WORKER_TASK_PROTOCOL,
    version: WORKER_TASK_PROTOCOL_VERSION,
    type: WORKER_TASK_MESSAGE.RUN,
    requestId: String(requestId || ""),
    task: String(task || ""),
    binding: clonePlain(binding),
    sessionId: String(sessionId || ""),
    reuseSession: Boolean(reuseSession),
    persistentSession: Boolean(persistentSession),
    payload
  };
}

export function createWorkerTaskMessage(type, request, detail = {}) {
  return {
    protocol: WORKER_TASK_PROTOCOL,
    version: WORKER_TASK_PROTOCOL_VERSION,
    type,
    requestId: request.requestId,
    task: request.task,
    binding: clonePlain(request.binding),
    sessionId: String(request.sessionId || ""),
    ...detail
  };
}

export function createWorkerTaskExecution(request, inputStreamId) {
  return createWorkerTaskMessage(WORKER_TASK_MESSAGE.EXECUTE, request, {
    inputStreamId: String(inputStreamId || ""),
    reuseSession: Boolean(request.reuseSession),
    persistentSession: Boolean(request.persistentSession)
  });
}

export function createWorkerTaskStreamPacket(type, request, packet) {
  if (![WORKER_TASK_MESSAGE.INPUT_PACKET, WORKER_TASK_MESSAGE.OUTPUT_PACKET].includes(type)) {
    throw protocolError("worker_protocol_stream_type_invalid", "Worker 图数据包类型无效");
  }
  return createWorkerTaskMessage(type, request, {
    streamId: String(packet?.streamId || ""),
    sequence: packet?.sequence,
    packet
  });
}

export function createWorkerTaskStreamAck(type, request, {streamId, sequence} = {}) {
  if (![WORKER_TASK_MESSAGE.INPUT_ACK, WORKER_TASK_MESSAGE.OUTPUT_ACK].includes(type)) {
    throw protocolError("worker_protocol_stream_type_invalid", "Worker 图确认消息类型无效");
  }
  return createWorkerTaskMessage(type, request, {
    streamId: String(streamId || ""),
    sequence
  });
}

export function createWorkerTaskSessionCommit(request, binding) {
  return createWorkerTaskMessage(WORKER_TASK_MESSAGE.COMMIT_SESSION, request, {
    binding: clonePlain(binding)
  });
}

export function assertWorkerTaskRequest(value) {
  assertProtocolEnvelope(value);
  if (value.type !== WORKER_TASK_MESSAGE.RUN) throw protocolError("worker_protocol_message_invalid", "Worker 请求类型无效");
  if (!value.requestId || !value.task) throw protocolError("worker_protocol_request_invalid", "Worker 请求缺少 requestId 或 task");
  if (value.persistentSession && !value.sessionId) throw protocolError("worker_protocol_session_invalid", "持久 Worker 请求缺少 sessionId");
  return value;
}

export function assertWorkerTaskExecution(value) {
  assertProtocolEnvelope(value);
  if (value.type !== WORKER_TASK_MESSAGE.EXECUTE) throw protocolError("worker_protocol_message_invalid", "Worker 执行消息类型无效");
  if (!value.requestId || !value.task) throw protocolError("worker_protocol_request_invalid", "Worker 执行消息缺少 requestId 或 task");
  if (!value.inputStreamId) throw protocolError("worker_protocol_stream_invalid", "Worker 执行消息缺少输入流标识");
  if (value.persistentSession && !value.sessionId) throw protocolError("worker_protocol_session_invalid", "持久 Worker 执行消息缺少 sessionId");
  return value;
}

export function assertWorkerTaskStreamPacket(value, expectedType) {
  assertProtocolEnvelope(value);
  if (value.type !== expectedType || !value.requestId || !value.task) {
    throw protocolError("worker_protocol_message_invalid", "Worker 图数据包消息无效");
  }
  if (!value.streamId || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !value.packet || typeof value.packet !== "object") {
    throw protocolError("worker_protocol_stream_invalid", "Worker 图数据包字段无效");
  }
  if (value.packet.streamId !== value.streamId || value.packet.sequence !== value.sequence) {
    throw protocolError("worker_protocol_stream_binding_invalid", "Worker 图数据包内外流绑定不一致");
  }
  return value;
}

export function assertWorkerTaskStreamAck(value, expectedType) {
  assertProtocolEnvelope(value);
  if (value.type !== expectedType || !value.requestId || !value.task) {
    throw protocolError("worker_protocol_message_invalid", "Worker 图确认消息无效");
  }
  if (!value.streamId || !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    throw protocolError("worker_protocol_stream_invalid", "Worker 图确认消息字段无效");
  }
  return value;
}

export function assertWorkerTaskSessionCommit(value) {
  assertProtocolEnvelope(value);
  if (value.type !== WORKER_TASK_MESSAGE.COMMIT_SESSION || !value.requestId || !value.task || !value.sessionId || !value.binding) {
    throw protocolError("worker_protocol_session_invalid", "Worker session 提交消息无效");
  }
  return value;
}

export function assertWorkerTaskResponse(value, request) {
  assertProtocolEnvelope(value);
  if (value.requestId !== request.requestId || value.task !== request.task || String(value.sessionId || "") !== String(request.sessionId || "")) {
    throw protocolError("worker_protocol_binding_invalid", "Worker 响应与请求不匹配");
  }
  if (![
    WORKER_TASK_MESSAGE.READY,
    WORKER_TASK_MESSAGE.INPUT_ACK,
    WORKER_TASK_MESSAGE.INPUT_READY,
    WORKER_TASK_MESSAGE.ACCEPTED,
    WORKER_TASK_MESSAGE.PROGRESS,
    WORKER_TASK_MESSAGE.OUTPUT_PACKET,
    WORKER_TASK_MESSAGE.RESULT,
    WORKER_TASK_MESSAGE.SESSION_COMMITTED,
    WORKER_TASK_MESSAGE.ERROR
  ].includes(value.type)) {
    throw protocolError("worker_protocol_message_invalid", "Worker 响应类型无效");
  }
  return value;
}

export function serializeWorkerTaskError(error) {
  return {
    name: String(error?.name || "Error"),
    code: String(error?.code || "worker_task_failed"),
    message: String(error?.message || error || "Worker 任务失败"),
    stack: String(error?.stack || ""),
    ...(error?.stage ? {stage: String(error.stage)} : {}),
    ...(error?.suggestion ? {suggestion: String(error.suggestion)} : {}),
    details: clonePlain(error?.details)
  };
}

export function restoreWorkerTaskError(snapshot) {
  const error = new Error(String(snapshot?.message || "Worker 任务失败"));
  error.name = String(snapshot?.name || "Error");
  error.code = String(snapshot?.code || "worker_task_failed");
  if (snapshot?.stack) error.stack = String(snapshot.stack);
  if (snapshot?.stage) error.stage = String(snapshot.stage);
  if (snapshot?.suggestion) error.suggestion = String(snapshot.suggestion);
  if (snapshot?.details !== undefined) error.details = snapshot.details;
  return error;
}

function assertProtocolEnvelope(value) {
  if (!value || typeof value !== "object") throw protocolError("worker_protocol_message_invalid", "Worker 消息必须是对象");
  if (value.protocol !== WORKER_TASK_PROTOCOL || value.version !== WORKER_TASK_PROTOCOL_VERSION) {
    throw protocolError("worker_protocol_version_mismatch", "Worker 协议版本不匹配");
  }
}

function protocolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
