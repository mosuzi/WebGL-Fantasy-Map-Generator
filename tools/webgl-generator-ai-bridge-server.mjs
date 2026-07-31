import {createServer} from "node:http";
import {randomBytes, randomUUID, timingSafeEqual} from "node:crypto";

const options = parseArguments(process.argv.slice(2));
const token = options.token || randomBytes(24).toString("base64url");
const sessions = new Map();
const commands = new Map();
const requestResults = new Map();
const allowedOrigins = new Set(["http://127.0.0.1:5410", "http://localhost:5410", "http://127.0.0.1:5411", "http://localhost:5411"]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${options.port}`);
    applyCors(request, response);
    if (request.method === "OPTIONS") return end(response, 204);
    if (!authorized(request, token)) return json(response, 401, failure("bridge_token_invalid", "配对令牌无效"));
    if (request.headers.origin && !allowedOrigins.has(request.headers.origin)) return json(response, 403, failure("bridge_origin_forbidden", "只允许本地地图页面连接"));

    if (request.method === "POST" && url.pathname === "/v1/register") {
      const body = await readJson(request);
      const sessionId = randomUUID();
      replaceActiveSession();
      sessions.set(sessionId, {sessionId, ...body, registeredAt: Date.now(), lastSeenAt: Date.now()});
      return json(response, 200, {ok: true, sessionId, expiresInMs: 30 * 60 * 1000});
    }
    if (request.method === "GET" && url.pathname === "/v1/poll") {
      const session = requireSession(url.searchParams.get("sessionId"), url.searchParams.get("pageSessionId"));
      session.lastSeenAt = Date.now();
      const command = [...commands.values()].find(item => item.sessionId === session.sessionId && item.state === "queued");
      if (!command) return end(response, 204);
      command.state = "delivered";
      command.deliveredAt = Date.now();
      return json(response, 200, publicCommand(command));
    }
    if (request.method === "POST" && url.pathname === "/v1/result") {
      const body = await readJson(request);
      const session = requireSession(body.sessionId, body.pageSessionId);
      const command = commands.get(String(body.commandId || ""));
      if (!command || command.sessionId !== session.sessionId) throw httpError(404, "bridge_command_not_found", "找不到待完成命令");
      command.state = "completed";
      command.completedAt = Date.now();
      command.response = {result: body.result, metadata: body.metadata || {}, session: publicSession(session)};
      if (body.metadata?.after) {
        session.documentId = body.metadata.after.documentId || session.documentId;
        session.revision = body.metadata.after.revision ?? session.revision;
        session.checksum = body.metadata.after.checksum || session.checksum;
        command.response.session = publicSession(session);
      }
      if (command.requestKey) requestResults.set(command.requestKey, {signature: command.signature, response: command.response});
      command.resolve?.(command.response);
      return json(response, 200, {ok: true});
    }
    if (request.method === "POST" && url.pathname === "/v1/request") {
      const body = await readJson(request);
      const session = selectSession(body.sessionId);
      const requestId = String(body.requestId || "").trim();
      const requestKey = requestId ? `${body.documentId || session.documentId}:${requestId}` : null;
      const signature = commandSignature(body);
      const cached = requestKey ? requestResults.get(requestKey) : null;
      if (cached && cached.signature !== signature) throw httpError(409, "bridge_request_id_conflict", "同一地图的 requestId 已用于不同请求");
      if (cached) return json(response, 200, {ok: true, replayed: true, ...cached.response});
      const existing = requestKey ? [...commands.values()].find(item => item.requestKey === requestKey && item.state !== "completed") : null;
      if (existing && existing.signature !== signature) throw httpError(409, "bridge_request_id_conflict", "同一地图的 requestId 已用于不同请求");
      const command = existing || createCommand(session, body);
      commands.set(command.commandId, command);
      const result = await waitForCommand(command, options.timeoutMs);
      return json(response, 200, {ok: true, commandId: command.commandId, replayed: Boolean(existing), ...result});
    }
    if (request.method === "GET" && url.pathname === "/v1/status") {
      return json(response, 200, {ok: true, sessions: [...sessions.values()].map(publicSession), queued: [...commands.values()].filter(item => item.state !== "completed").map(publicCommand)});
    }
    if (request.method === "POST" && url.pathname === "/v1/disconnect") {
      const body = await readJson(request);
      const session = sessions.get(String(body.sessionId || ""));
      if (session?.pageSessionId === body.pageSessionId) sessions.delete(session.sessionId);
      return json(response, 200, {ok: true});
    }
    return json(response, 404, failure("bridge_route_not_found", "未知本地桥路由"));
  } catch (error) {
    return json(response, error.status || 400, failure(error.code || "bridge_server_error", error.message || String(error)));
  }
});

server.listen(options.port, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ok: true, endpoint: `http://127.0.0.1:${options.port}`, pairingToken: token, pid: process.pid})}\n`);
});

function createCommand(session, body) {
  const method = String(body.method || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(method)) throw httpError(400, "bridge_method_invalid", "method 格式无效");
  if (!Array.isArray(body.arguments || [])) throw httpError(400, "bridge_arguments_invalid", "arguments 必须是数组");
  const requestId = String(body.requestId || "").trim() || null;
  return {
    commandId: randomUUID(),
    sessionId: session.sessionId,
    requestId,
    requestKey: requestId ? `${body.documentId || session.documentId}:${requestId}` : null,
    signature: commandSignature(body),
    method,
    arguments: body.arguments || [],
    documentId: body.documentId || session.documentId,
    expectedRevision: body.expectedRevision,
    confirmedByPage: false,
    state: "queued",
    createdAt: Date.now()
  };
}

function replaceActiveSession() {
  const replaced = new Set(sessions.keys());
  sessions.clear();
  for (const command of commands.values()) {
    if (!replaced.has(command.sessionId) || command.state === "completed") continue;
    command.state = "cancelled";
    command.response = {result: failure("bridge_session_replaced", "页面已刷新或由新页面接管，请重新提交请求"), metadata: {}, session: null};
    command.resolve?.(command.response);
  }
}

function commandSignature(body) {
  return JSON.stringify({method: String(body.method || "").trim(), arguments: body.arguments || [], documentId: body.documentId || null, expectedRevision: body.expectedRevision ?? null});
}

function waitForCommand(command, timeoutMs) {
  if (command.response) return Promise.resolve(command.response);
  return new Promise((resolve, reject) => {
    command.resolve = resolve;
    const timer = setTimeout(() => reject(httpError(504, "bridge_request_timeout", "等待页面执行超时")), timeoutMs);
    const originalResolve = command.resolve;
    command.resolve = value => {
      clearTimeout(timer);
      originalResolve(value);
    };
  });
}

function requireSession(sessionId, pageSessionId) {
  const session = sessions.get(String(sessionId || ""));
  if (!session || session.pageSessionId !== pageSessionId) throw httpError(409, "bridge_session_invalid", "页面会话已失效，请重新连接");
  return session;
}

function selectSession(sessionId) {
  if (sessionId) {
    const session = sessions.get(String(sessionId));
    if (!session) throw httpError(409, "bridge_session_invalid", "指定页面会话不存在");
    return session;
  }
  if (sessions.size !== 1) throw httpError(409, "bridge_session_ambiguous", "需要且只能存在一个活动地图页面");
  return [...sessions.values()][0];
}

function publicSession(session) {
  return {sessionId: session.sessionId, pageSessionId: session.pageSessionId, documentId: session.documentId, revision: session.revision, checksum: session.checksum, lastSeenAt: session.lastSeenAt};
}

function publicCommand(command) {
  return {commandId: command.commandId, requestId: command.requestId, method: command.method, arguments: command.arguments, documentId: command.documentId, expectedRevision: command.expectedRevision, confirmedByPage: command.confirmedByPage};
}

function authorized(request, expected) {
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw httpError(413, "bridge_payload_too_large", "请求体超过 1 MiB");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "bridge_json_invalid", "请求体不是有效 JSON");
  }
}

function json(response, status, value) {
  const text = JSON.stringify(value);
  response.writeHead(status, {"Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text)});
  response.end(text);
}

function end(response, status) {
  response.writeHead(status);
  response.end();
}

function failure(code, message) {
  return {ok: false, error: {code, message}};
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function parseArguments(args) {
  const result = {port: 5412, token: "", timeoutMs: 30000};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--token") result.token = String(args[++index] || "");
    else if (args[index] === "--port") result.port = Number(args[++index]);
    else if (args[index] === "--timeout-ms") result.timeoutMs = Number(args[++index]);
  }
  if (result.port !== 5412) throw new Error("AI 桥固定只允许监听 127.0.0.1:5412");
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 1000 || result.timeoutMs > 120000) throw new Error("timeout-ms 必须在 1000～120000 之间");
  return result;
}
