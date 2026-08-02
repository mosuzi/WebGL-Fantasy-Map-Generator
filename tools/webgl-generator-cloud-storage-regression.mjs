import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {
  CLOUD_MAP_EXTENSION,
  DROPBOX_SCOPES,
  GOOGLE_DRIVE_SCOPE,
  createCloudStorageRegistry,
  createDropboxProvider,
  createGoogleDriveProvider,
  normalizeCloudFilename
} from "../app/webgl-generator/src/runtime/cloud-storage.js";
import {canSelectCloudStorageProvider, reconcileCloudStorageFileList} from "../app/webgl-generator/src/ui/panels/cloud-storage-panel.js";

const root = process.cwd();
const gzipBlob = new Blob(["fixture-gzip-map"], {type: "application/gzip"});

assert.equal(normalizeCloudFilename("云图"), `云图${CLOUD_MAP_EXTENSION}`);
assert.equal(normalizeCloudFilename("bad:/name.json.gz"), `bad-name${CLOUD_MAP_EXTENSION}`);

await verifyDropbox();
await verifyGoogleDrive();
verifyRegistryAndUiContract();
verifyPanelRefreshAndBusyGuard();

console.log(JSON.stringify({
  passed: true,
  providers: ["dropbox", "google-drive"],
  oauth: {dropbox: "authorization-code-pkce", google: "gis-token-model"},
  liveProviderVerified: false
}, null, 2));

async function verifyDropbox() {
  const session = createMemoryStorage();
  const calls = [];
  let authorizationUrl = "";
  const view = createView({session, href: "https://maps.test/app"});
  view.open = url => {
    authorizationUrl = url;
    return {};
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (String(url).endsWith("/oauth2/token")) return jsonResponse({access_token: "dropbox-secret-token", expires_in: 7200});
    if (String(url).endsWith("/files/list_folder")) return jsonResponse({
      entries: [{".tag": "file", id: "dbid:1", name: `一号${CLOUD_MAP_EXTENSION}`, path_lower: `/一号${CLOUD_MAP_EXTENSION}`, rev: "r1", size: 11, server_modified: "2026-08-01T00:00:00Z"}],
      has_more: true,
      cursor: "cursor-1"
    });
    if (String(url).endsWith("/files/list_folder/continue")) return jsonResponse({
      entries: [{".tag": "folder", id: "folder"}, {".tag": "file", id: "dbid:2", name: "ignore.txt", path_lower: "/ignore.txt"}],
      has_more: false
    });
    if (String(url).endsWith("/files/upload")) {
      const apiArg = JSON.parse(options.headers["Dropbox-API-Arg"]);
      return jsonResponse({".tag": "file", id: "dbid:1", name: apiArg.path.slice(1), path_lower: apiArg.path, rev: apiArg.mode === "add" ? "r2" : "r3", size: 16, server_modified: "2026-08-02T00:00:00Z"});
    }
    if (String(url).endsWith("/files/download")) return new Response(gzipBlob, {status: 200});
    if (String(url).endsWith("/auth/token/revoke")) return new Response(null, {status: 200});
    throw new Error(`unexpected Dropbox URL ${url}`);
  };
  const provider = createDropboxProvider({
    view,
    fetchImpl,
    config: {appKey: "dropbox-app-key", redirectUri: "https://maps.test/callback"},
    oauth: {open: url => {
      authorizationUrl = url;
      return {};
    }}
  });

  assert.equal(provider.getState().configured, true);
  await provider.connect();
  const auth = new URL(authorizationUrl);
  assert.equal(auth.searchParams.get("response_type"), "code");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("token_access_type"), "online");
  assert.deepEqual(auth.searchParams.get("scope").split(" "), [...DROPBOX_SCOPES]);
  const state = auth.searchParams.get("state");
  assert.ok(state && auth.searchParams.get("code_challenge"));
  assert.ok(session.getItem("fmg-cloud-oauth:dropbox")?.includes(state));

  view.location.href = `https://maps.test/callback?code=fixture-code&state=${encodeURIComponent(state)}`;
  const callback = await provider.handleOAuthCallback();
  assert.equal(callback.ok, true);
  assert.equal(provider.getState().connected, true);
  assert.equal(session.getItem("fmg-cloud-oauth:dropbox"), null);

  const listed = await provider.listFiles();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].provider, "dropbox");
  assert.equal(listed[0].revision, "r1");
  const created = await provider.createFile({filename: "新地图", blob: gzipBlob});
  const createCall = calls.find(call => call.url.endsWith("/files/upload"));
  const createArg = JSON.parse(createCall.options.headers["Dropbox-API-Arg"]);
  assert.equal(createArg.autorename, false);
  assert.equal(createArg.mode, "add");
  assert.ok(created.name.endsWith(CLOUD_MAP_EXTENSION));
  await provider.overwriteFile(listed[0], {blob: gzipBlob});
  const overwriteArg = JSON.parse(calls.filter(call => call.url.endsWith("/files/upload"))[1].options.headers["Dropbox-API-Arg"]);
  assert.deepEqual(overwriteArg.mode, {".tag": "update", update: "r1"});
  assert.equal((await provider.downloadFile(listed[0])).size, gzipBlob.size);
  await provider.disconnect();
  assert.equal(provider.getState().connected, false);
  assert.ok(calls.some(call => call.url.endsWith("/auth/token/revoke")));
  assert.equal(JSON.stringify(provider.getState()).includes("dropbox-secret-token"), false);

  const invalid = createDropboxProvider({view, fetchImpl, config: {appKey: "x", redirectUri: "https://other.test/callback"}});
  assert.equal(invalid.getState().configured, false);
  assert.match(invalid.getState().configurationError, /同源/);

  const strictStateView = createView({session: createMemoryStorage(), href: "https://maps.test/app"});
  const strictState = createDropboxProvider({view: strictStateView, fetchImpl, config: {appKey: "x", redirectUri: "https://maps.test/callback"}});
  assert.equal(strictState.acceptOAuthResult({ok: true, accessToken: "must-not-pass", expiresIn: 100}), false);
  assert.equal(strictState.getState().connected, false);
}

async function verifyGoogleDrive() {
  const calls = [];
  let revoked = "";
  let metadataVersion = "7";
  const view = createView({session: createMemoryStorage(), href: "https://maps.test/app"});
  const oauth = {
    requestToken: async request => {
      assert.equal(request.clientId, "google-client-id");
      assert.equal(request.scope, GOOGLE_DRIVE_SCOPE);
      return {access_token: "google-secret-token", expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE};
    },
    revoke: token => {
      revoked = token;
    }
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    const parsed = new URL(String(url));
    if (parsed.pathname === "/drive/v3/files" && !parsed.searchParams.get("pageToken")) {
      assert.match(parsed.searchParams.get("q"), /appProperties has/);
      return jsonResponse({files: [{id: "g1", name: `远端${CLOUD_MAP_EXTENSION}`, size: "22", modifiedTime: "2026-08-01T00:00:00Z", version: "7", appProperties: {fmgWebglMap: "true"}}], nextPageToken: "next"});
    }
    if (parsed.pathname === "/drive/v3/files" && parsed.searchParams.get("pageToken") === "next") return jsonResponse({files: []});
    if (parsed.pathname === "/upload/drive/v3/files" && options.method === "POST") {
      assert.equal(parsed.searchParams.get("uploadType"), "multipart");
      return jsonResponse({id: "g2", name: `新建${CLOUD_MAP_EXTENSION}`, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "1", appProperties: {fmgWebglMap: "true"}});
    }
    if (parsed.pathname === "/drive/v3/files/g1" && !parsed.searchParams.has("alt")) {
      return jsonResponse({id: "g1", name: `远端${CLOUD_MAP_EXTENSION}`, size: "22", modifiedTime: metadataVersion === "7" ? "2026-08-01T00:00:00Z" : "2026-08-03T00:00:00Z", version: metadataVersion, appProperties: {fmgWebglMap: "true"}});
    }
    if (parsed.pathname === "/upload/drive/v3/files/g1" && options.method === "PATCH") {
      assert.equal(parsed.searchParams.get("uploadType"), "media");
      return jsonResponse({id: "g1", name: `远端${CLOUD_MAP_EXTENSION}`, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "8", appProperties: {fmgWebglMap: "true"}});
    }
    if (parsed.pathname === "/drive/v3/files/g1" && parsed.searchParams.get("alt") === "media") return new Response(gzipBlob, {status: 200});
    throw new Error(`unexpected Google URL ${url}`);
  };
  const provider = createGoogleDriveProvider({view, fetchImpl, config: {clientId: "google-client-id"}, oauth});
  await provider.connect();
  assert.equal(provider.getState().connected, true);
  const files = await provider.listFiles();
  assert.equal(files.length, 1);
  assert.equal(files[0].provider, "google-drive");
  assert.equal(files[0].version, "7");
  await provider.createFile({filename: "新建", blob: gzipBlob});
  await provider.overwriteFile(files[0], {blob: gzipBlob});
  assert.equal((await provider.downloadFile(files[0])).size, gzipBlob.size);
  metadataVersion = "9";
  await assert.rejects(() => provider.overwriteFile(files[0], {blob: gzipBlob}), /其它位置更新/);
  assert.equal(calls.filter(call => call.options.method === "PATCH").length, 1);
  await provider.disconnect();
  assert.equal(revoked, "google-secret-token");
  assert.equal(JSON.stringify(provider.getState()).includes("google-secret-token"), false);

  const badScope = createGoogleDriveProvider({
    view,
    fetchImpl,
    config: {clientId: "google-client-id"},
    oauth: {requestToken: async () => ({access_token: "x", expires_in: 3600, scope: "openid"})}
  });
  await assert.rejects(() => badScope.connect(), /drive.file/);
}

function verifyRegistryAndUiContract() {
  const view = createView({session: createMemoryStorage(), href: "https://maps.test/app"});
  const registry = createCloudStorageRegistry({
    view,
    fetchImpl: async () => new Response(null, {status: 500}),
    config: {dropbox: {appKey: "", redirectUri: ""}, googleDrive: {clientId: ""}}
  });
  const states = registry.listProviderStates();
  assert.deepEqual(states.map(state => [state.id, state.configured]), [["dropbox", false], ["google-drive", false]]);
  registry.dispose();

  const control = read("app/webgl-generator/src/ui/vue/components/ControlPanel.vue");
  const panel = read("app/webgl-generator/src/ui/vue/components/CloudStoragePanel.vue");
  const panelController = read("app/webgl-generator/src/ui/panels/cloud-storage-panel.js");
  const styles = read("app/webgl-generator/src/styles.css");
  const app = read("app/webgl-generator/src/runtime/app.js");
  const apiContract = read("app/webgl-generator/src/runtime/api-contract.js");
  assert.match(control, /id="open-cloud-storage"[\s\S]*云端存储/);
  assert.match(panel, /data-cloud-state="unconfigured"/);
  assert.match(panel, /真实账号联调完成/);
  assert.match(panel, /覆盖所选文件/);
  assert.match(panel, /载入所选地图/);
  assert.match(panel, /:disabled="state\.busy"[\s\S]*role="tab"|role="tab"[\s\S]*:disabled="state\.busy"/);
  assert.match(panelController, /await refreshFilesForProvider\(provider, \{quiet: true, selectId: created\.id, operation\}\)/);
  assert.match(panelController, /await refreshFilesForProvider\(provider, \{quiet: true, selectId: updated\.id \|\| file\.id, operation\}\)/);
  assert.match(panelController, /result\.connected === true[\s\S]*已连接 \$\{provider\.getState\(\)\.label\}[\s\S]*await refreshFilesForProvider\(provider, \{quiet: true, operation\}\)/);
  assert.doesNotMatch(panelController, /await refreshFiles\(\{quiet: true/);
  assert.match(panelController, /operationEpoch === epoch && panelState\.selectedProviderId === providerId/);
  const cloudStyleStart = styles.indexOf(".cloud-storage-panel");
  const cloudStyleEnd = styles.indexOf("@media (max-width: 560px)", cloudStyleStart);
  assert.ok(cloudStyleStart >= 0 && cloudStyleEnd > cloudStyleStart, "必须存在完整的云存储样式区段");
  const cloudStyles = styles.slice(cloudStyleStart, cloudStyleEnd);
  assert.doesNotMatch(cloudStyles, /rgba\(255,\s*250,\s*235|rgba\(255,\s*255,\s*255/, "云存储面板不得回退到浅色纸张卡片");
  assert.match(cloudStyles, /background:\s*var\(--el-fill-color-light,\s*#10171b\)/);
  assert.match(cloudStyles, /color:\s*var\(--el-text-color-secondary,\s*#9fb0ba\)/);
  assert.match(cloudStyles, /\.cloud-storage-configuration code[\s\S]*background:\s*var\(--el-fill-color,\s*#172127\)/);
  assert.match(cloudStyles, /\.cloud-storage-file[\s\S]*background:\s*var\(--el-bg-color-overlay,\s*#0f1519\)/);
  assert.match(cloudStyles, /\.cloud-storage-file\.selected[\s\S]*border-color:\s*var\(--el-color-primary,\s*#d7a84f\)/);
  assert.match(cloudStyles, /\.cloud-storage-status[\s\S]*var\(--el-color-success,\s*#7fbf8d\)/);
  assert.match(cloudStyles, /\.cloud-storage-error[\s\S]*var\(--el-color-danger,\s*#d7796f\)/);
  assert.match(app, /includeBase64: false, includeBlob: true/);
  assert.match(app, /importMap\(blob, \{confirm: true, source: "ui"/);
  assert.doesNotMatch(apiContract, /cloud|dropbox|google/i, "云存储不应增加公开 API 方法或分母");
}

function verifyPanelRefreshAndBusyGuard() {
  const state = {
    busy: true,
    selectedProviderId: "dropbox",
    selectedFileId: "dbid:1",
    files: [{id: "dbid:1", revision: "r1", modifiedAt: "2026-08-01T00:00:00Z"}]
  };
  assert.equal(canSelectCloudStorageProvider(state), false, "云操作期间必须拒绝 provider 切换");
  assert.equal(reconcileCloudStorageFileList(state, [{id: "dbid:1", revision: "r2", modifiedAt: "2026-08-02T00:00:00Z"}], {
    selectId: "dbid:1",
    isCurrent: () => true
  }), true);
  assert.equal(state.files[0].revision, "r2", "新建后的远端列表必须替换旧 descriptor");
  assert.equal(state.selectedFileId, "dbid:1");
  assert.equal(reconcileCloudStorageFileList(state, [{id: "dbid:1", revision: "r3", modifiedAt: "2026-08-03T00:00:00Z"}], {
    selectId: "dbid:1",
    isCurrent: () => true
  }), true);
  assert.equal(state.files[0].revision, "r3", "覆盖后的远端列表必须刷新 rev/version");
  const staleFiles = state.files;
  assert.equal(reconcileCloudStorageFileList(state, [{id: "g1", version: "9"}], {isCurrent: () => false}), false);
  assert.equal(state.files, staleFiles, "陈旧 provider 操作不得写入当前视图");
}

function createView({session, href}) {
  const listeners = new Map();
  const location = {
    href,
    origin: new URL(href).origin,
    assign(next) {
      this.href = String(next);
    }
  };
  return {
    crypto: webcrypto,
    Blob,
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    location,
    history: {replaceState() {}},
    sessionStorage: session,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    close() {}
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});
}

function read(file) {
  return readFileSync(join(root, file), "utf8");
}
