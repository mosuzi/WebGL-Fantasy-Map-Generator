import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {startAiBrowserBridge} from "../app/webgl-generator/src/runtime/ai-browser-bridge.js";

const token = "bridge-regression-token";
const server = spawn(process.execPath, ["--no-warnings", "./tools/webgl-generator-ai-bridge-server.mjs", "--token", token, "--timeout-ms", "5000"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(server);
  const state = {documentId: "document-one", revision: 4, note: "原值", lowRiskCalls: 0, highRiskCalls: 0, readyChecks: 0};
  let pending = null;
  const api = createFakeApi(state);
  const controller = await startAiBrowserBridge({
    api,
    pairingToken: token,
    onPendingConfirmation: value => pending = value
  });

  const status = await bridgeRequest("GET", "/v1/status", token);
  assert.equal(status.sessions.length, 1);
  assert.equal(status.sessions[0].documentId, "document-one");
  assert.equal(status.sessions[0].revision, 4);

  const readonly = await bridgeRequest("POST", "/v1/request", token, {method: "objects.list", arguments: ["city"]});
  assert.equal(readonly.result.ok, true);
  assert.deepEqual(readonly.result.data, [{id: 1, name: "测试城"}]);

  const unauthorized = await bridgeRequest("POST", "/v1/request", token, {
    method: "edit.notes.set",
    arguments: [1, {name: "未授权"}],
    requestId: "write-before-enable",
    expectedRevision: 4
  });
  assert.equal(unauthorized.result.error.code, "bridge_write_not_authorized");
  assert.equal(state.lowRiskCalls, 0);

  controller.setWriteEnabled(true);
  const stale = await bridgeRequest("POST", "/v1/request", token, {
    method: "edit.notes.set",
    arguments: [1, {name: "过期"}],
    requestId: "stale-revision",
    expectedRevision: 3
  });
  assert.equal(stale.result.error.code, "bridge_revision_mismatch");

  const writeBody = {
    method: "edit.notes.set",
    arguments: [1, {name: "新值"}],
    requestId: "low-risk-write",
    expectedRevision: 4
  };
  const written = await bridgeRequest("POST", "/v1/request", token, writeBody);
  assert.equal(written.result.ok, true);
  assert.equal(state.note, "新值");
  assert.equal(state.lowRiskCalls, 1);
  assert.equal(written.session.revision, 5);

  const replay = await bridgeRequest("POST", "/v1/request", token, writeBody);
  assert.equal(replay.replayed, true);
  assert.equal(state.lowRiskCalls, 1);
  await assert.rejects(() => bridgeRequest("POST", "/v1/request", token, {...writeBody, arguments: [1, {name: "冲突值"}]}), /bridge_request_id_conflict/);

  const rejectedPromise = bridgeRequest("POST", "/v1/request", token, {
    method: "edit.states.delete",
    arguments: [2],
    requestId: "reject-danger",
    expectedRevision: 5
  });
  await waitUntil(() => pending?.command?.requestId === "reject-danger");
  assert.equal(state.highRiskCalls, 0);
  await controller.rejectPending();
  const rejected = await rejectedPromise;
  assert.equal(rejected.result.error.code, "bridge_confirmation_rejected");
  assert.equal(state.highRiskCalls, 0);

  const approvedPromise = bridgeRequest("POST", "/v1/request", token, {
    method: "edit.states.delete",
    arguments: [2],
    requestId: "approve-danger",
    expectedRevision: 5
  });
  await waitUntil(() => pending?.command?.requestId === "approve-danger");
  await controller.approvePending();
  const approved = await approvedPromise;
  assert.equal(approved.result.ok, true);
  assert.equal(approved.metadata.approved, true);
  assert.equal(state.highRiskCalls, 1);
  assert.equal(state.revision, 6);

  state.documentId = "document-two";
  const replacedMap = await bridgeRequest("POST", "/v1/request", token, {method: "objects.list", arguments: ["city"]});
  assert.equal(replacedMap.result.error.code, "bridge_document_mismatch");
  await controller.disconnect();

  pending = null;
  const reconnected = await startAiBrowserBridge({api, pairingToken: token, onPendingConfirmation: value => pending = value});
  assert.notEqual(reconnected.pageSessionId, controller.pageSessionId);
  assert.equal(reconnected.writeEnabled, false);
  const afterRefreshWrite = await bridgeRequest("POST", "/v1/request", token, {
    method: "edit.notes.set",
    arguments: [1, {name: "刷新后未授权"}],
    requestId: "refresh-readonly",
    expectedRevision: 6
  });
  assert.equal(afterRefreshWrite.result.error.code, "bridge_write_not_authorized");
  await reconnected.disconnect();

  await assert.rejects(() => bridgeRequest("GET", "/v1/status", "wrong-token"), /bridge_token_invalid/);
  await assert.rejects(() => bridgeRequest("GET", "/v1/status", token, undefined, {Origin: "https://example.com"}), /bridge_origin_forbidden/);

  const appSource = await readFile("./app/webgl-generator/src/runtime/app.js", "utf8");
  assert.match(appSource, /import\("\.\/ai-browser-bridge\.js"\)/);
  assert.doesNotMatch(appSource, /^import .*ai-browser-bridge/m);
  const builtIndex = await readFile("./dist/webgl-generator/index.html", "utf8");
  assert.doesNotMatch(builtIndex, /ai-browser-bridge/);

  process.stdout.write("浏览器 AI 受控桥回归通过：回环鉴权、只读、显式写授权、revision、幂等、页面确认、刷新降权、地图替换与懒加载均符合预期。\n");
} finally {
  server.kill();
}

function createFakeApi(state) {
  const descriptions = {
    "objects.list": {mutates: "none", requiresConfirm: false},
    "edit.notes.set": {mutates: "notes", requiresConfirm: false},
    "edit.states.delete": {mutates: "political-entities", requiresConfirm: true}
  };
  return {
    info: {
      mapSummary: async () => state.readyChecks++ === 0 ? success({ready: false}) : success({ready: true, mapIdentity: state.documentId, mapRevision: state.revision, checksum: `checksum-${state.revision}`}),
      describe: method => descriptions[method] ? success({qualifiedName: method, metadata: descriptions[method]}) : failure("api_method_not_found", "未知方法")
    },
    objects: {
      list: () => success([{id: 1, name: "测试城"}])
    },
    edit: {
      notes: {
        set: (_id, patch) => {
          state.lowRiskCalls += 1;
          state.note = patch.name;
          state.revision += 1;
          return success({name: state.note});
        }
      },
      states: {
        delete: id => {
          state.highRiskCalls += 1;
          state.revision += 1;
          return success({id, deleted: true});
        }
      }
    }
  };
}

async function bridgeRequest(method, path, pairingToken, body = undefined, extraHeaders = {}) {
  const response = await fetch(`http://127.0.0.1:5412${path}`, {
    method,
    headers: {Authorization: `Bearer ${pairingToken}`, ...extraHeaders, ...(body ? {"Content-Type": "application/json"} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${data?.error?.code || "bridge_error"}: ${data?.error?.message || response.status}`);
  return data;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.includes('"endpoint":"http://127.0.0.1:5412"')) resolve();
    });
    child.stderr.on("data", chunk => reject(new Error(chunk.toString())));
    child.once("exit", code => reject(new Error(`本地桥提前退出：${code}`)));
  });
}

async function waitUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("等待桥接状态超时");
    await delay(20);
  }
}

function success(data) {
  return {ok: true, data, metadata: {at: new Date().toISOString()}};
}

function failure(code, message) {
  return {ok: false, error: {code, message}, metadata: {at: new Date().toISOString()}};
}
