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
  readCloudStorageConfig,
  normalizeGoogleDriveFolderPath,
  normalizeCloudFilename
} from "../app/webgl-generator/src/runtime/cloud-storage.js";
import {canSelectCloudStorageProvider, reconcileCloudStorageFileList} from "../app/webgl-generator/src/ui/panels/cloud-storage-panel.js";

const root = process.cwd();
const gzipBlob = new Blob(["fixture-gzip-map"], {type: "application/gzip"});
const DROPBOX_SESSION_KEY = "fmg-cloud-session:v1:dropbox";
const GOOGLE_SESSION_KEY = "fmg-cloud-session:v1:google-drive";

assert.equal(normalizeCloudFilename("云图"), `云图${CLOUD_MAP_EXTENSION}`);
assert.equal(normalizeCloudFilename("bad:/name.json.gz"), `bad-name${CLOUD_MAP_EXTENSION}`);

await verifyDropbox();
await verifyGoogleDrive();
await verifyRegistrySessionDispose();
await verifyGoogleDefaultPrompt();
await verifyGoogleFolderResolutionRace();
await verifyDropboxLateUnauthorizedRace();
await verifyGoogleLateUnauthorizedRace();
verifyRegistryAndUiContract();
verifyConfigurationPriority();
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
  const oauthPopup = {};
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
      return oauthPopup;
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
  const handshake = JSON.parse(session.getItem("fmg-cloud-oauth:dropbox"));

  const wrongSource = await provider.handleOAuthCallbackMessage({code: "fixture-code", state}, {});
  assert.equal(wrongSource.handled, false);
  assert.equal(calls.some(call => call.url.endsWith("/oauth2/token")), false);
  assert.ok(session.getItem("fmg-cloud-oauth:dropbox"), "错误窗口不得消耗授权握手");

  const callback = await provider.handleOAuthCallbackMessage({code: "fixture-code", state}, oauthPopup);
  assert.equal(callback.ok, true);
  assert.equal(provider.getState().connected, true);
  assert.equal(session.getItem("fmg-cloud-oauth:dropbox"), null);
  const tokenCall = calls.find(call => call.url.endsWith("/oauth2/token"));
  assert.equal(tokenCall.options.body.get("code_verifier"), handshake.verifier);
  assert.equal(tokenCall.options.body.get("redirect_uri"), "https://maps.test/callback");
  assert.equal(JSON.stringify(callback).includes("dropbox-secret-token"), false, "回调处理结果不得暴露 access token");
  const savedSession = JSON.parse(session.getItem(DROPBOX_SESSION_KEY));
  assert.equal(savedSession.provider, "dropbox");
  assert.equal(savedSession.accessToken, "dropbox-secret-token");
  assert.ok(savedSession.expiresAt > Date.now());
  assert.equal("refreshToken" in savedSession || "refresh_token" in savedSession, false);
  const restored = createDropboxProvider({view, fetchImpl, config: {appKey: "dropbox-app-key", redirectUri: "https://maps.test/callback"}});
  assert.equal(restored.getState().connected, true, "Dropbox provider 重建后应恢复仍有效的当前标签页连接");
  restored.dispose();
  assert.ok(session.getItem(DROPBOX_SESSION_KEY), "普通 provider dispose 不得清除当前标签页会话");
  const tokenCallCount = calls.filter(call => call.url.endsWith("/oauth2/token")).length;
  assert.equal((await provider.handleOAuthCallbackMessage({code: "replay", state}, oauthPopup)).handled, false);
  assert.equal(calls.filter(call => call.url.endsWith("/oauth2/token")).length, tokenCallCount, "重复回调不得再次换令牌");

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
  assert.equal(session.getItem(DROPBOX_SESSION_KEY), null, "Dropbox 主动断开必须清除当前标签页会话");
  assert.ok(calls.some(call => call.url.endsWith("/auth/token/revoke")));
  assert.equal(JSON.stringify(provider.getState()).includes("dropbox-secret-token"), false);

  const invalid = createDropboxProvider({view, fetchImpl, config: {appKey: "x", redirectUri: "https://other.test/callback"}});
  assert.equal(invalid.getState().configured, false);
  assert.match(invalid.getState().configurationError, /同源/);

  const strictStateView = createView({session: createMemoryStorage(), href: "https://maps.test/app"});
  const strictState = createDropboxProvider({view: strictStateView, fetchImpl, config: {appKey: "x", redirectUri: "https://maps.test/callback"}});
  assert.equal(strictState.acceptOAuthResult({ok: true, accessToken: "must-not-pass", expiresIn: 100}), false);
  assert.equal(strictState.getState().connected, false);

  await verifyDropboxSessionRejection(savedSession);

  await verifyRejectedDropboxCallback(fetchImpl);
  await verifyLegacyDropboxCallback(fetchImpl);
  await verifyConcurrentDropboxCallback();
}

async function verifyDropboxSessionRejection(savedSession) {
  for (const mode of ["expired", "damaged", "configuration", "origin", "unauthorized"]) {
    const session = createMemoryStorage();
    session.setItem(DROPBOX_SESSION_KEY, mode === "damaged"
      ? "{not-json"
      : JSON.stringify(mode === "expired" ? {...savedSession, expiresAt: Date.now() - 1} : savedSession));
    const view = createView({session, href: mode === "origin" ? "https://other-maps.test/app" : "https://maps.test/app"});
    const config = mode === "configuration"
      ? {appKey: "different-dropbox-app-key", redirectUri: "https://maps.test/callback"}
      : {appKey: "dropbox-app-key", redirectUri: "https://maps.test/callback"};
    const provider = createDropboxProvider({
      view,
      config,
      fetchImpl: async () => new Response(null, {status: mode === "unauthorized" ? 401 : 500})
    });
    if (mode === "unauthorized") {
      assert.equal(provider.getState().connected, true);
      await assert.rejects(() => provider.listFiles(), /HTTP 401/);
      assert.equal(provider.getState().connected, false, "Dropbox 401 后必须立即失效");
    } else {
      assert.equal(provider.getState().connected, false, `Dropbox ${mode} 会话不得恢复`);
    }
    assert.equal(session.getItem(DROPBOX_SESSION_KEY), null, `Dropbox ${mode} 会话必须清除`);
  }
}

async function verifyRejectedDropboxCallback(fetchImpl) {
  for (const mode of ["state", "expired", "expired-error"]) {
    const session = createMemoryStorage();
    const view = createView({session, href: "https://maps.test/app"});
    const popup = {};
    let tokenRequests = 0;
    const provider = createDropboxProvider({
      view,
      fetchImpl: async (...args) => {
        tokenRequests++;
        return fetchImpl(...args);
      },
      config: {appKey: "dropbox-app-key", redirectUri: "https://maps.test/callback"},
      oauth: {createState: () => "expected-state", createVerifier: () => "fixture-verifier", createChallenge: async () => "fixture-challenge", open: () => popup}
    });
    await provider.connect();
    if (mode.startsWith("expired")) {
      const handshake = JSON.parse(session.getItem("fmg-cloud-oauth:dropbox"));
      session.setItem("fmg-cloud-oauth:dropbox", JSON.stringify({...handshake, createdAt: Date.now() - 11 * 60 * 1000}));
    }
    const result = await provider.handleOAuthCallbackMessage({
      code: mode === "expired-error" ? "" : "fixture-code",
      state: mode === "state" ? "wrong-state" : "expected-state",
      error: mode === "expired-error" ? "access_denied" : ""
    }, popup);
    assert.equal(result.ok, false);
    assert.equal(provider.getState().connected, false);
    assert.match(provider.getState().authorizationError, /状态校验失败/);
    assert.equal(tokenRequests, 0, `${mode} 拒绝不得请求 token endpoint`);
    assert.equal(session.getItem("fmg-cloud-oauth:dropbox"), null);
  }
}

async function verifyLegacyDropboxCallback(fetchImpl) {
  const openerSession = createMemoryStorage();
  const openerView = createView({session: openerSession, href: "https://maps.test/app"});
  const popupView = createView({session: createMemoryStorage(), href: "https://maps.test/legacy-callback?code=legacy-code&state=legacy-state"});
  let relayed = null;
  let popupTokenRequests = 0;
  popupView.opener = {
    postMessage(payload, origin) {
      relayed = {payload, origin};
    }
  };
  popupView.close = () => {
    popupView.closed = true;
  };
  const openerProvider = createDropboxProvider({
    view: openerView,
    fetchImpl,
    config: {appKey: "dropbox-app-key", redirectUri: "https://maps.test/legacy-callback"},
    oauth: {createState: () => "legacy-state", createVerifier: () => "legacy-verifier", createChallenge: async () => "legacy-challenge", open: () => popupView}
  });
  await openerProvider.connect();
  const popupProvider = createDropboxProvider({
    view: popupView,
    fetchImpl: async () => {
      popupTokenRequests++;
      throw new Error("旧回调弹窗不得请求 token endpoint");
    },
    config: {appKey: "", redirectUri: ""}
  });
  const relayedResult = await popupProvider.handleOAuthCallback();
  assert.deepEqual(relayedResult, {handled: true, relayed: true, ok: true});
  assert.equal(popupTokenRequests, 0);
  assert.equal(popupView.closed, true);
  assert.equal(relayed.origin, "https://maps.test");
  assert.deepEqual(Object.keys(relayed.payload).sort(), ["code", "error", "provider", "state", "type"]);
  assert.equal(JSON.stringify(relayed.payload).includes("accessToken"), false);
  const openerResult = await openerProvider.handleOAuthCallbackMessage(relayed.payload, popupView);
  assert.equal(openerResult.ok, true, "旧整页回调必须由 opener 完成令牌交换");
  assert.equal(openerProvider.getState().connected, true);
}

async function verifyConcurrentDropboxCallback() {
  const session = createMemoryStorage();
  const view = createView({session, href: "https://maps.test/app"});
  const popup = {};
  let releaseTokenRequest;
  let tokenRequests = 0;
  const provider = createDropboxProvider({
    view,
    fetchImpl: async url => {
      assert.match(String(url), /oauth2\/token$/);
      tokenRequests++;
      await new Promise(resolve => {
        releaseTokenRequest = resolve;
      });
      return jsonResponse({access_token: "concurrent-secret-token", expires_in: 7200});
    },
    config: {appKey: "dropbox-app-key", redirectUri: "https://maps.test/callback"},
    oauth: {createState: () => "concurrent-state", createVerifier: () => "concurrent-verifier", createChallenge: async () => "concurrent-challenge", open: () => popup}
  });
  await provider.connect();
  const first = provider.handleOAuthCallbackMessage({code: "first-code", state: "concurrent-state"}, popup);
  while (!releaseTokenRequest) await new Promise(resolve => setTimeout(resolve, 0));
  const duplicate = await provider.handleOAuthCallbackMessage({code: "duplicate-code", state: "concurrent-state"}, popup);
  assert.deepEqual(duplicate, {handled: false, ok: false, reason: "in-flight"});
  assert.equal(tokenRequests, 1);
  releaseTokenRequest();
  assert.equal((await first).ok, true);
  assert.equal(provider.getState().connected, true, "重复消息不得破坏首个合法回调");
}

async function verifyGoogleDrive() {
  const calls = [];
  let revoked = "";
  let metadataVersion = "7";
  let uploadedMetadata = null;
  const session = createMemoryStorage();
  const view = createView({session, href: "https://maps.test/app"});
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
    const query = parsed.searchParams.get("q") || "";
    if (parsed.pathname === "/drive/v3/files" && options.method === "POST") {
      const metadata = JSON.parse(options.body);
      assert.equal(metadata.name, "webFMG");
      assert.equal(metadata.mimeType, "application/vnd.google-apps.folder");
      assert.deepEqual(metadata.parents, ["root"]);
      assert.equal(metadata.appProperties.fmgWebglFolder, "true");
      return jsonResponse({id: "folder-webfmg", ...metadata});
    }
    if (parsed.pathname === "/drive/v3/files" && query.includes("mimeType")) {
      assert.match(query, /name = 'webFMG'/);
      assert.match(query, /'root' in parents/);
      return jsonResponse({files: []});
    }
    if (parsed.pathname === "/drive/v3/files" && !parsed.searchParams.get("pageToken")) {
      assert.match(query, /appProperties has/);
      assert.match(query, /'root' in parents/);
      return jsonResponse({files: [{id: "g1", name: `远端${CLOUD_MAP_EXTENSION}`, parents: ["root"], size: "22", modifiedTime: "2026-08-01T00:00:00Z", version: "7", appProperties: {fmgWebglMap: "true"}}], nextPageToken: "next"});
    }
    if (parsed.pathname === "/drive/v3/files" && parsed.searchParams.get("pageToken") === "next") return jsonResponse({files: []});
    if (parsed.pathname === "/upload/drive/v3/files" && options.method === "POST") {
      assert.equal(parsed.searchParams.get("uploadType"), "multipart");
      uploadedMetadata = await readMultipartMetadata(options.body);
      assert.deepEqual(uploadedMetadata.parents, ["folder-webfmg"]);
      return jsonResponse({id: "g2", ...uploadedMetadata, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "1"});
    }
    if (parsed.pathname === "/drive/v3/files/g1" && !parsed.searchParams.has("alt")) {
      return jsonResponse({id: "g1", name: `远端${CLOUD_MAP_EXTENSION}`, parents: ["root"], size: "22", modifiedTime: metadataVersion === "7" ? "2026-08-01T00:00:00Z" : "2026-08-03T00:00:00Z", version: metadataVersion, appProperties: {fmgWebglMap: "true"}});
    }
    if (parsed.pathname === "/upload/drive/v3/files/g1" && options.method === "PATCH") {
      assert.equal(parsed.searchParams.get("uploadType"), "media");
      return jsonResponse({id: "g1", name: `远端${CLOUD_MAP_EXTENSION}`, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "8", appProperties: {fmgWebglMap: "true"}});
    }
    if (parsed.pathname === "/drive/v3/files/g1" && parsed.searchParams.get("alt") === "media") return new Response(gzipBlob, {status: 200});
    throw new Error(`unexpected Google URL ${url}`);
  };
  const provider = createGoogleDriveProvider({view, fetchImpl, config: {clientId: "google-client-id", folderPath: "/webFMG"}, oauth});
  await provider.connect();
  assert.equal(provider.getState().connected, true);
  const savedSession = JSON.parse(session.getItem(GOOGLE_SESSION_KEY));
  assert.equal(savedSession.provider, "google-drive");
  assert.equal(savedSession.accessToken, "google-secret-token");
  assert.ok(savedSession.expiresAt > Date.now());
  assert.equal("refreshToken" in savedSession || "refresh_token" in savedSession, false);
  const restored = createGoogleDriveProvider({view, fetchImpl, config: {clientId: "google-client-id", folderPath: "/webFMG"}, oauth});
  assert.equal(restored.getState().connected, true, "Google Drive provider 重建后应恢复仍有效的当前标签页连接");
  restored.dispose();
  assert.ok(session.getItem(GOOGLE_SESSION_KEY), "普通 provider dispose 不得清除 Google Drive 当前标签页会话");
  const files = await provider.listFiles();
  assert.equal(files.length, 1);
  assert.equal(files[0].provider, "google-drive");
  assert.equal(files[0].version, "7");
  assert.deepEqual(files[0].parents, ["root"], "升级后必须继续列出旧根目录存档");
  assert.equal(calls.filter(call => call.options.method === "POST").length, 0, "连接与列表不得创建空目录");
  await provider.createFile({filename: "新建", blob: gzipBlob});
  assert.deepEqual(uploadedMetadata.parents, ["folder-webfmg"]);
  await provider.overwriteFile(files[0], {blob: gzipBlob});
  assert.equal((await provider.downloadFile(files[0])).size, gzipBlob.size);
  metadataVersion = "9";
  await assert.rejects(() => provider.overwriteFile(files[0], {blob: gzipBlob}), /其它位置更新/);
  assert.equal(calls.filter(call => call.options.method === "PATCH").length, 1);
  await provider.disconnect();
  assert.equal(revoked, "google-secret-token");
  assert.equal(session.getItem(GOOGLE_SESSION_KEY), null, "Google Drive 主动断开必须清除当前标签页会话");
  assert.equal(JSON.stringify(provider.getState()).includes("google-secret-token"), false);

  await verifyGoogleSessionRejection(savedSession);

  const badScope = createGoogleDriveProvider({
    view,
    fetchImpl,
    config: {clientId: "google-client-id"},
    oauth: {requestToken: async () => ({access_token: "x", expires_in: 3600, scope: "openid"})}
  });
  await assert.rejects(() => badScope.connect(), /drive.file/);

  const clientSecret = createGoogleDriveProvider({view, fetchImpl, config: {clientId: "GOCSPX-fixture-not-a-client-id"}, oauth});
  assert.equal(clientSecret.getState().configured, false);
  assert.match(clientSecret.getState().configurationError, /client secret/);

  assert.equal(normalizeGoogleDriveFolderPath(" worlds\\campaign/webFMG "), "/worlds/campaign/webFMG");
  assert.throws(() => normalizeGoogleDriveFolderPath("/worlds/../secret"), /不允许/);
  await verifyGoogleDriveFolderPaths(oauth);
}

async function verifyGoogleSessionRejection(savedSession) {
  for (const mode of ["expired", "damaged", "configuration", "origin", "unauthorized"]) {
    const session = createMemoryStorage();
    session.setItem(GOOGLE_SESSION_KEY, mode === "damaged"
      ? "{not-json"
      : JSON.stringify(mode === "expired" ? {...savedSession, expiresAt: Date.now() - 1} : savedSession));
    const view = createView({session, href: mode === "origin" ? "https://other-maps.test/app" : "https://maps.test/app"});
    const config = mode === "configuration"
      ? {clientId: "different-google-client-id", folderPath: "/webFMG"}
      : {clientId: "google-client-id", folderPath: "/webFMG"};
    const provider = createGoogleDriveProvider({
      view,
      config,
      fetchImpl: async () => new Response(null, {status: mode === "unauthorized" ? 401 : 500})
    });
    if (mode === "unauthorized") {
      assert.equal(provider.getState().connected, true);
      await assert.rejects(() => provider.listFiles(), /HTTP 401/);
      assert.equal(provider.getState().connected, false, "Google Drive 401 后必须立即失效");
    } else {
      assert.equal(provider.getState().connected, false, `Google Drive ${mode} 会话不得恢复`);
    }
    assert.equal(session.getItem(GOOGLE_SESSION_KEY), null, `Google Drive ${mode} 会话必须清除`);
  }
}

async function verifyGoogleDriveFolderPaths(oauth) {
  const folderCreates = [];
  let uploadMetadata = null;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q") || "";
    if (parsed.pathname === "/drive/v3/files" && options.method === "POST") {
      const metadata = JSON.parse(options.body);
      folderCreates.push(metadata);
      return jsonResponse({id: `folder-${folderCreates.length}`, ...metadata});
    }
    if (parsed.pathname === "/drive/v3/files" && query.includes("mimeType")) return jsonResponse({files: []});
    if (parsed.pathname === "/upload/drive/v3/files" && options.method === "POST") {
      uploadMetadata = await readMultipartMetadata(options.body);
      return jsonResponse({id: "nested-map", ...uploadMetadata, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "1"});
    }
    throw new Error(`unexpected folder-path Google URL ${url}`);
  };
  const provider = createGoogleDriveProvider({
    view: createView({session: createMemoryStorage(), href: "https://maps.test/app"}),
    fetchImpl,
    config: {clientId: "google-client-id", folderPath: "/worlds/campaign/webFMG"},
    oauth
  });
  await provider.connect();
  await provider.createFile({filename: "多级路径", blob: gzipBlob});
  assert.deepEqual(folderCreates.map(folder => [folder.name, folder.parents[0]]), [
    ["worlds", "root"],
    ["campaign", "folder-1"],
    ["webFMG", "folder-2"]
  ]);
  assert.deepEqual(uploadMetadata.parents, ["folder-3"]);

  let reusedUploadMetadata = null;
  let reusedFolderCreateCount = 0;
  const reusedProvider = createGoogleDriveProvider({
    view: createView({session: createMemoryStorage(), href: "https://maps.test/app"}),
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(String(url));
      const query = parsed.searchParams.get("q") || "";
      if (parsed.pathname === "/drive/v3/files" && query.includes("mimeType")) {
        return jsonResponse({files: [{id: "existing-webfmg", name: "webFMG", parents: ["root"], appProperties: {fmgWebglFolder: "true"}}]});
      }
      if (parsed.pathname === "/drive/v3/files" && options.method === "POST") {
        reusedFolderCreateCount++;
        throw new Error("已有配置目录时不得重复创建");
      }
      if (parsed.pathname === "/upload/drive/v3/files" && options.method === "POST") {
        reusedUploadMetadata = await readMultipartMetadata(options.body);
        return jsonResponse({id: "reused-map", ...reusedUploadMetadata, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "1"});
      }
      throw new Error(`unexpected existing-folder Google URL ${url}`);
    },
    config: {clientId: "google-client-id", folderPath: "/webFMG"},
    oauth
  });
  await reusedProvider.connect();
  await reusedProvider.createFile({filename: "复用目录", blob: gzipBlob});
  assert.deepEqual(reusedUploadMetadata.parents, ["existing-webfmg"]);
  assert.equal(reusedFolderCreateCount, 0);

  let rootUploadMetadata = null;
  let folderRequestCount = 0;
  const rootProvider = createGoogleDriveProvider({
    view: createView({session: createMemoryStorage(), href: "https://maps.test/app"}),
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/upload/drive/v3/files" && options.method === "POST") {
        rootUploadMetadata = await readMultipartMetadata(options.body);
        return jsonResponse({id: "root-map", ...rootUploadMetadata, size: "16", modifiedTime: "2026-08-02T00:00:00Z", version: "1"});
      }
      folderRequestCount++;
      throw new Error(`根目录配置不应请求目录 API：${url}`);
    },
    config: {clientId: "google-client-id", folderPath: "/"},
    oauth
  });
  await rootProvider.connect();
  await rootProvider.createFile({filename: "根目录", blob: gzipBlob});
  assert.deepEqual(rootUploadMetadata.parents, ["root"]);
  assert.equal(folderRequestCount, 0);
}

async function verifyRegistrySessionDispose() {
  const session = createMemoryStorage();
  const view = createView({session, href: "https://maps.test/app"});
  const config = {
    dropbox: {appKey: "", redirectUri: ""},
    googleDrive: {clientId: "google-client-id", folderPath: "/webFMG"}
  };
  const googleOauth = {
    requestToken: async () => ({access_token: "registry-google-token", expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE})
  };
  const registry = createCloudStorageRegistry({view, config, googleOauth, fetchImpl: async () => new Response(null, {status: 500})});
  await registry.provider("google-drive").connect();
  const saved = session.getItem(GOOGLE_SESSION_KEY);
  assert.ok(saved);
  registry.dispose();
  assert.equal(session.getItem(GOOGLE_SESSION_KEY), saved, "registry dispose 必须保留有效的当前标签页会话");

  const restored = createCloudStorageRegistry({view, config, googleOauth, fetchImpl: async () => new Response(null, {status: 500})});
  assert.equal(restored.provider("google-drive").getState().connected, true);
  await restored.provider("google-drive").disconnect({remote: false});
  assert.equal(session.getItem(GOOGLE_SESSION_KEY), null);
  restored.dispose();
}

async function verifyGoogleDefaultPrompt() {
  const session = createMemoryStorage();
  const view = createView({session, href: "https://maps.test/app"});
  let requestArguments = null;
  view.google = {
    accounts: {
      oauth2: {
        initTokenClient(options) {
          return {
            requestAccessToken(...args) {
              requestArguments = args;
              options.callback({access_token: "default-prompt-token", expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE});
            }
          };
        }
      }
    }
  };
  const provider = createGoogleDriveProvider({
    view,
    fetchImpl: async () => new Response(null, {status: 500}),
    config: {clientId: "google-client-id", folderPath: "/webFMG"}
  });
  await provider.connect();
  assert.deepEqual(requestArguments, [], "Google 取令牌不得强制 prompt=consent");
  await provider.disconnect({remote: false});
}

async function verifyGoogleFolderResolutionRace() {
  const session = createMemoryStorage();
  const view = createView({session, href: "https://maps.test/app"});
  const oldFolderResponse = createDeferred();
  const newFolderResponse = createDeferred();
  const listParentQueries = [];
  let tokenSequence = 0;
  const provider = createGoogleDriveProvider({
    view,
    config: {clientId: "google-client-id", folderPath: "/webFMG"},
    oauth: {
      requestToken: async () => ({
        access_token: tokenSequence++ === 0 ? "old-account-token" : "new-account-token",
        expires_in: 3600,
        scope: GOOGLE_DRIVE_SCOPE
      })
    },
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(String(url));
      const query = parsed.searchParams.get("q") || "";
      const authorization = options.headers?.Authorization || "";
      if (query.includes("mimeType")) {
        if (authorization === "Bearer old-account-token") return oldFolderResponse.promise;
        if (authorization === "Bearer new-account-token") return newFolderResponse.promise;
      }
      listParentQueries.push({authorization, query});
      return jsonResponse({files: []});
    }
  });

  await provider.connect();
  const oldList = provider.listFiles();
  await provider.disconnect({remote: false});
  await provider.connect();
  const newList = provider.listFiles();

  oldFolderResponse.resolve(jsonResponse({files: [{id: "old-account-folder", name: "webFMG", appProperties: {fmgWebglFolder: "true"}}]}));
  await assert.rejects(oldList, /连接已失效/);
  newFolderResponse.resolve(jsonResponse({files: [{id: "new-account-folder", name: "webFMG", appProperties: {fmgWebglFolder: "true"}}]}));
  assert.deepEqual(await newList, []);
  const newQueries = listParentQueries.filter(entry => entry.authorization === "Bearer new-account-token").map(entry => entry.query);
  assert.ok(newQueries.some(query => query.includes("'new-account-folder' in parents")), "新会话必须使用新账号目录");
  assert.equal(newQueries.some(query => query.includes("old-account-folder")), false, "旧目录解析不得污染新会话");
  await provider.disconnect({remote: false});
}

async function verifyDropboxLateUnauthorizedRace() {
  const config = {appKey: "dropbox-app-key", redirectUri: "https://maps.test/callback"};
  const fingerprint = JSON.stringify([1, "dropbox", "https://maps.test", config.appKey, config.redirectUri, ...DROPBOX_SCOPES]);
  const record = token => JSON.stringify({
    version: 1,
    provider: "dropbox",
    fingerprint,
    accessToken: token,
    expiresAt: Date.now() + 60 * 60 * 1000
  });

  {
    const session = createMemoryStorage();
    session.setItem(DROPBOX_SESSION_KEY, record("old-dropbox-token"));
    const pending = createDeferred();
    let authorizationUrl = "";
    const provider = createDropboxProvider({
      view: createView({session, href: "https://maps.test/app"}),
      config,
      fetchImpl: async () => pending.promise,
      oauth: {open: url => {
        authorizationUrl = String(url);
        return {};
      }}
    });
    const oldList = provider.listFiles();
    await provider.disconnect({remote: false});
    await provider.connect();
    const state = new URL(authorizationUrl).searchParams.get("state");
    assert.equal(provider.acceptOAuthResult({ok: true, state, accessToken: "new-dropbox-token", expiresIn: 3600}), true);
    pending.resolve(new Response(null, {status: 401}));
    await assert.rejects(oldList, /HTTP 401/);
    assert.equal(provider.getState().connected, true, "Dropbox 旧请求晚到的 401 不得断开同一 provider 的新连接");
    assert.equal(JSON.parse(session.getItem(DROPBOX_SESSION_KEY)).accessToken, "new-dropbox-token");
    await provider.disconnect({remote: false});
  }

  {
    const session = createMemoryStorage();
    session.setItem(DROPBOX_SESSION_KEY, record("old-dropbox-token"));
    const pending = createDeferred();
    const oldProvider = createDropboxProvider({
      view: createView({session, href: "https://maps.test/app"}),
      config,
      fetchImpl: async () => pending.promise
    });
    const oldList = oldProvider.listFiles();
    oldProvider.dispose();
    session.setItem(DROPBOX_SESSION_KEY, record("new-dropbox-token"));
    const newProvider = createDropboxProvider({
      view: createView({session, href: "https://maps.test/app"}),
      config,
      fetchImpl: async () => jsonResponse({entries: [], has_more: false})
    });
    pending.resolve(new Response(null, {status: 401}));
    await assert.rejects(oldList, /HTTP 401/);
    assert.equal(newProvider.getState().connected, true, "Dropbox 已销毁 provider 的 401 不得断开重建后的连接");
    assert.equal(JSON.parse(session.getItem(DROPBOX_SESSION_KEY)).accessToken, "new-dropbox-token");
    newProvider.dispose();
  }
}

async function verifyGoogleLateUnauthorizedRace() {
  const config = {clientId: "google-client-id", folderPath: "/"};
  const fingerprint = JSON.stringify([1, "google-drive", "https://maps.test", config.clientId, config.folderPath, GOOGLE_DRIVE_SCOPE]);
  const record = token => JSON.stringify({
    version: 1,
    provider: "google-drive",
    fingerprint,
    accessToken: token,
    expiresAt: Date.now() + 60 * 60 * 1000
  });

  {
    const session = createMemoryStorage();
    const pending = createDeferred();
    let tokenSequence = 0;
    const provider = createGoogleDriveProvider({
      view: createView({session, href: "https://maps.test/app"}),
      config,
      fetchImpl: async () => pending.promise,
      oauth: {requestToken: async () => ({
        access_token: tokenSequence++ === 0 ? "old-google-token" : "new-google-token",
        expires_in: 3600,
        scope: GOOGLE_DRIVE_SCOPE
      })}
    });
    await provider.connect();
    const oldList = provider.listFiles();
    await provider.disconnect({remote: false});
    await provider.connect();
    pending.resolve(new Response(null, {status: 401}));
    await assert.rejects(oldList, /HTTP 401/);
    assert.equal(provider.getState().connected, true, "Google 旧请求晚到的 401 不得断开同一 provider 的新连接");
    assert.equal(JSON.parse(session.getItem(GOOGLE_SESSION_KEY)).accessToken, "new-google-token");
    await provider.disconnect({remote: false});
  }

  {
    const session = createMemoryStorage();
    session.setItem(GOOGLE_SESSION_KEY, record("old-google-token"));
    const pending = createDeferred();
    const oldProvider = createGoogleDriveProvider({
      view: createView({session, href: "https://maps.test/app"}),
      config,
      fetchImpl: async () => pending.promise
    });
    const oldList = oldProvider.listFiles();
    oldProvider.dispose();
    session.setItem(GOOGLE_SESSION_KEY, record("new-google-token"));
    const newProvider = createGoogleDriveProvider({
      view: createView({session, href: "https://maps.test/app"}),
      config,
      fetchImpl: async () => jsonResponse({files: []})
    });
    pending.resolve(new Response(null, {status: 401}));
    await assert.rejects(oldList, /HTTP 401/);
    assert.equal(newProvider.getState().connected, true, "Google 已销毁 provider 的 401 不得断开重建后的连接");
    assert.equal(JSON.parse(session.getItem(GOOGLE_SESSION_KEY)).accessToken, "new-google-token");
    newProvider.dispose();
  }
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
  const uiPanel = read("app/webgl-generator/src/ui/panel.js");
  const apiContract = read("app/webgl-generator/src/runtime/api-contract.js");
  assert.match(control, /id="open-cloud-storage"[\s\S]*云端存储/);
  assert.match(control, /id="open-cloud-import"[\s\S]*从云端导入…/);
  assert.match(control, /target: "cloud-storage", mode: "import"/);
  assert.match(control, /target, mode: "save"/);
  assert.match(control, /id="import-map-file" type="file" accept="\.webfmg,\.json,\.gz,\.webgl-map\.json,\.webgl-map\.json\.gz,application\/json,application\/gzip,application\/x-gzip"/);
  assert.match(panel, /data-cloud-state="unconfigured"/);
  assert.match(panel, /真实账号联调完成/);
  assert.match(panel, /保存到云端/);
  assert.match(panel, /从云端导入/);
  assert.match(panel, /覆盖所选文件/);
  assert.match(panel, /从云端导入所选地图/);
  assert.match(panel, /class="\['cloud-storage-file'[\s\S]*:disabled="state\.busy"/);
  assert.match(panel, /:disabled="state\.busy"[\s\S]*role="tab"|role="tab"[\s\S]*:disabled="state\.busy"/);
  assert.match(panelController, /await refreshFilesForProvider\(provider, \{quiet: true, selectId: created\.id, operation\}\)/);
  assert.match(panelController, /await refreshFilesForProvider\(provider, \{quiet: true, selectId: updated\.id \|\| file\.id, operation\}\)/);
  assert.match(panelController, /result\.connected === true[\s\S]*已连接 \$\{provider\.getState\(\)\.label\}[\s\S]*await refreshFilesForProvider\(provider, \{quiet: true, operation\}\)/);
  assert.doesNotMatch(panelController, /await refreshFiles\(\{quiet: true/);
  assert.match(panelController, /operationEpoch === epoch && panelState\.selectedProviderId === providerId/);
  assert.match(panelController, /panelState\.mode === mode/);
  assert.match(panelController, /if \(panelState\.busy\) return;[\s\S]*panelState\.selectedFileId/);
  assert.match(panelController, /downloadFile\(file\)[\s\S]*if \(!operation\.isCurrent\(\)\) return null;[\s\S]*createCloudMapFile/);
  assert.match(panelController, /new FileCtor\(\[blob\], name,[\s\S]*isCompressedMapDocumentFilename\(name\) \? "application\/gzip" : "application\/json"/);
  assert.match(panelController, /onLoadPayload\?\.\(sourceFile, sourceFile\)/);
  assert.match(panelController, /if \(!panelState\.busy\) panelState\.mode = mode/);
  assert.doesNotMatch(panelController, /operationEpoch\+\+[\s\S]*panelState\.busy = false/);
  assert.match(panelController, /未保存更改不会与云端地图合并/);
  assert.match(uiPanel, /onOpenCloudStorage\?\.\(event\.detail\?\.mode === "import" \? "import" : "save"\)/);
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
  assert.match(app, /onLoadPayload: \(payload, sourceFile\) => runtimeActions\.data\.importMap\(payload, \{confirm: true, source: "ui", sourceFile, toast: true\}\)/);
  assert.match(app, /onOpenCloudStorage: mode =>[\s\S]*cloudStorage\.open\(\{mode\}\)/);
  assert.match(app, /mapRevision: state\.mapRevision\.createSnapshot\(\)/);
  assert.match(app, /state\.mapRevision\.restoreSnapshot\(snapshot\.mapRevision\)/);
  assert.match(app, /activeMode\?\.id === snapshotMode\.id && activeMode\.context === snapshotMode\.context/);
  assert.doesNotMatch(app, /if \(snapshot\.canvasToolMode\?\.id\) enterCanvasToolMode/);
  assert.doesNotMatch(apiContract, /cloud|dropbox|google/i, "云存储不应增加公开 API 方法或分母");
}

function verifyConfigurationPriority() {
  const config = readCloudStorageConfig(
    {
      VITE_FMG_DROPBOX_APP_KEY: "fixture-legacy-dropbox",
      VITE_FMG_DROPBOX_REDIRECT_URI: "https://fixture.test/legacy-callback",
      VITE_FMG_GOOGLE_CLIENT_ID: "fixture-legacy-google.apps.googleusercontent.com",
      VITE_FMG_GOOGLE_FOLDER_PATH: "/legacy/maps"
    },
    {
      version: 1,
      providers: {
        dropbox: {appKey: "fixture-runtime-dropbox", redirectUri: ""},
        googleDrive: {clientId: "fixture-runtime-google.apps.googleusercontent.com", folderPath: "/runtime/maps"}
      }
    }
  );
  assert.deepEqual(config, {
    dropbox: {appKey: "fixture-runtime-dropbox", redirectUri: "https://fixture.test/legacy-callback"},
    googleDrive: {clientId: "fixture-runtime-google.apps.googleusercontent.com", folderPath: "/runtime/maps"}
  });

  const view = createView({session: createMemoryStorage(), href: "https://fixture.test/app"});
  view.__FMG_CLOUD_PROVIDER_CONFIG__ = {
    version: 1,
    providers: {
      dropbox: {appKey: "fixture-runtime-dropbox", redirectUri: "https://fixture.test/callback"},
      googleDrive: {clientId: "fixture-runtime-google.apps.googleusercontent.com", folderPath: "/runtime/maps"}
    }
  };
  const registry = createCloudStorageRegistry({view, fetchImpl: async () => new Response(null, {status: 500})});
  const states = registry.listProviderStates();
  assert.deepEqual(states.map(state => [state.id, state.configured]), [["dropbox", true], ["google-drive", true]]);
  assert.equal(JSON.stringify(states).includes("fixture-runtime"), false, "provider state 不得回显 client identifier");
  registry.dispose();
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});
}

async function readMultipartMetadata(body) {
  const text = await body.text();
  const match = text.match(/Content-Type: application\/json; charset=UTF-8\r\n\r\n(\{.*?\})\r\n--/s);
  assert(match, "Google Drive multipart 请求缺少 metadata");
  return JSON.parse(match[1]);
}

function read(file) {
  return readFileSync(join(root, file), "utf8");
}
