const DEFAULT_ENDPOINT = "http://127.0.0.1:5412";
const READ_NAMESPACES = new Set(["info", "objects", "cells", "planner", "analysis"]);

export async function startAiBrowserBridge(options = {}) {
  const api = options.api;
  if (!api?.info?.mapSummary || !api?.info?.describe) throw bridgeError("bridge_api_unavailable", "页面公开 API 尚未就绪");
  const endpoint = normalizeEndpoint(options.endpoint || DEFAULT_ENDPOINT);
  const pairingToken = String(options.pairingToken || "").trim();
  if (!pairingToken) throw bridgeError("pairing_token_required", "请输入本地桥配对令牌");
  const pageSessionId = crypto.randomUUID();
  let active = true;
  let writeEnabled = false;
  let pending = null;
  let pollTimer = null;
  const emitStatus = detail => options.onStatus?.({pageSessionId, writeEnabled, ...detail});
  const mapIdentity = await readMapIdentity(api, {waitForReadyMs: 20000});
  const registration = await requestJson(endpoint, "/v1/register", pairingToken, {
    pageSessionId,
    documentId: mapIdentity.documentId,
    revision: mapIdentity.revision,
    checksum: mapIdentity.checksum,
    capabilities: {read: true, write: false}
  });
  const sessionId = registration.sessionId;
  emitStatus({state: "connected", sessionId, mapIdentity});
  schedulePoll(0);

  return Object.freeze({
    pageSessionId,
    sessionId,
    get writeEnabled() {
      return writeEnabled;
    },
    setWriteEnabled(value) {
      writeEnabled = Boolean(value);
      emitStatus({state: "connected", sessionId, mapIdentity, writeEnabled});
      return writeEnabled;
    },
    async approvePending() {
      if (!pending) return false;
      const command = pending;
      pending = null;
      options.onPendingConfirmation?.(null);
      await executeCommand(command, {approved: true});
      return true;
    },
    async rejectPending() {
      if (!pending) return false;
      const command = pending;
      pending = null;
      options.onPendingConfirmation?.(null);
      await postResult(command, failure("bridge_confirmation_rejected", "页面拒绝了高风险操作"));
      return true;
    },
    async disconnect({forget = false} = {}) {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (pending) await this.rejectPending();
      try {
        await requestJson(endpoint, "/v1/disconnect", pairingToken, {sessionId, pageSessionId});
      } catch {}
      emitStatus({state: "disconnected", sessionId});
    }
  });

  function schedulePoll(delay = 180) {
    if (!active) return;
    pollTimer = setTimeout(poll, delay);
  }

  async function poll() {
    if (!active || pending) return schedulePoll(250);
    try {
      const response = await fetch(`${endpoint}/v1/poll?sessionId=${encodeURIComponent(sessionId)}&pageSessionId=${encodeURIComponent(pageSessionId)}`, {
        headers: {Authorization: `Bearer ${pairingToken}`},
        cache: "no-store"
      });
      if (response.status === 204) return schedulePoll();
      if (!response.ok) throw bridgeError("bridge_poll_failed", `本地桥轮询失败：HTTP ${response.status}`);
      const command = await response.json();
      await handleCommand(command);
      schedulePoll(20);
    } catch (error) {
      emitStatus({state: "reconnecting", error: normalizeError(error)});
      schedulePoll(900);
    }
  }

  async function handleCommand(command) {
    if (!command || typeof command !== "object") return;
    const description = api.info.describe(command.method);
    if (!description?.ok) return postResult(command, description);
    const metadata = description.data?.metadata || {};
    const readonly = metadata.mutates === "none" && READ_NAMESPACES.has(String(command.method).split(".")[0]);
    if (!readonly && !writeEnabled) return postResult(command, failure("bridge_write_not_authorized", "当前 AI 桥仅有只读权限"));
    const identity = await readMapIdentity(api);
    if (command.documentId && command.documentId !== identity.documentId) return postResult(command, failure("bridge_document_mismatch", "请求绑定的地图与当前地图不同", {identity}));
    if (!readonly && command.expectedRevision !== undefined && Number(command.expectedRevision) !== Number(identity.revision)) {
      return postResult(command, failure("bridge_revision_mismatch", "地图 revision 已变化，请重新预检", {identity}));
    }
    if (!readonly && !String(command.requestId || "").trim()) return postResult(command, failure("bridge_request_id_required", "写请求必须提供 requestId"));
    if (metadata.requiresConfirm && !command.confirmedByPage) {
      pending = command;
      options.onPendingConfirmation?.({command, description: description.data, identity});
      emitStatus({state: "awaiting-confirmation", command: summarizeCommand(command)});
      return;
    }
    await executeCommand(command);
  }

  async function executeCommand(command, {approved = false} = {}) {
    try {
      const callable = resolveMethod(api, command.method);
      const args = Array.isArray(command.arguments) ? command.arguments : [];
      const result = await callable(...args);
      const after = await readMapIdentity(api);
      await postResult(command, result, {approved, after});
      emitStatus({state: "connected", lastCommand: summarizeCommand(command), lastResult: result?.ok ? "ok" : result?.error?.code || "error", mapIdentity: after});
    } catch (error) {
      await postResult(command, failure(error.code || "bridge_execution_failed", error.message || String(error)));
    }
  }

  async function postResult(command, result, metadata = {}) {
    await requestJson(endpoint, "/v1/result", pairingToken, {
      sessionId,
      pageSessionId,
      commandId: command.commandId,
      requestId: command.requestId || null,
      result,
      metadata
    });
  }
}

async function readMapIdentity(api, {waitForReadyMs = 0} = {}) {
  const deadline = Date.now() + waitForReadyMs;
  do {
    const summary = await api.info.mapSummary();
    if (summary?.ok && summary.data?.ready) {
      const data = summary.data;
      return {
        documentId: String(data.documentId || data.mapIdentity || `${data.seed || "map"}:${data.generatedAt || data.generatorStage || "legacy"}`),
        revision: Number(data.revision ?? data.mapRevision ?? data.currentRevision ?? 0),
        checksum: String(data.checksum || "")
      };
    }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 120));
  } while (true);
  throw bridgeError("map_not_ready", "当前地图尚未就绪");
}

function resolveMethod(api, qualifiedName) {
  const parts = String(qualifiedName || "").split(".");
  if (parts.length < 2 || parts.some(part => !/^[A-Za-z][A-Za-z0-9]*$/.test(part))) throw bridgeError("bridge_method_invalid", "API 方法名无效");
  let value = api;
  for (const part of parts) value = value?.[part];
  if (typeof value !== "function") throw bridgeError("bridge_method_not_found", `找不到公开 API 方法：${qualifiedName}`);
  return value;
}

async function requestJson(endpoint, path, token, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw bridgeError(data?.error?.code || "bridge_request_failed", data?.error?.message || `本地桥请求失败：HTTP ${response.status}`);
  return data;
}

function normalizeEndpoint(value) {
  const url = new URL(String(value || DEFAULT_ENDPOINT));
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5412") {
    throw bridgeError("bridge_endpoint_forbidden", "AI 桥只允许连接 http://127.0.0.1:5412");
  }
  return url.origin;
}

function failure(code, message, details = undefined) {
  return {ok: false, error: {code, name: "Error", message, ...(details ? {details} : {})}, metadata: {at: new Date().toISOString()}};
}

function summarizeCommand(command) {
  return {commandId: command.commandId, requestId: command.requestId || null, method: command.method};
}

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeError(error) {
  return {code: error?.code || "bridge_error", message: error?.message || String(error)};
}
