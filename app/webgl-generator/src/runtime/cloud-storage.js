export const CLOUD_MAP_EXTENSION = ".webgl-map.json.gz";
export const DROPBOX_SCOPES = Object.freeze(["files.metadata.read", "files.content.read", "files.content.write"]);
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const DROPBOX_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_API_URL = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_URL = "https://content.dropboxapi.com/2";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_TOKEN_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_APP_PROPERTY = Object.freeze({key: "fmgWebglMap", value: "true"});

export function readCloudStorageConfig(env = import.meta.env || {}) {
  return Object.freeze({
    dropbox: Object.freeze({
      appKey: String(env.VITE_FMG_DROPBOX_APP_KEY || "").trim(),
      redirectUri: String(env.VITE_FMG_DROPBOX_REDIRECT_URI || "").trim()
    }),
    googleDrive: Object.freeze({
      clientId: String(env.VITE_FMG_GOOGLE_CLIENT_ID || "").trim()
    })
  });
}

export function createCloudStorageRegistry(options = {}) {
  const view = options.view || globalThis;
  const fetchImpl = options.fetchImpl || view.fetch?.bind(view);
  const config = options.config || readCloudStorageConfig(options.env);
  const providers = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener(listProviderStates()));
  const shared = {view, fetchImpl, notify};
  providers.set("dropbox", createDropboxProvider({...shared, config: config.dropbox, oauth: options.dropboxOauth}));
  providers.set("google-drive", createGoogleDriveProvider({...shared, config: config.googleDrive, oauth: options.googleOauth}));

  const messageHandler = event => {
    if (event.origin !== safeOrigin(view)) return;
    const payload = event.data;
    if (payload?.type !== "fmg-cloud-oauth-result" || payload.provider !== "dropbox") return;
    providers.get("dropbox")?.acceptOAuthResult(payload);
  };
  view.addEventListener?.("message", messageHandler);

  const api = {
    listProviderStates,
    provider(id) {
      const provider = providers.get(id);
      if (!provider) throw new Error("未知云存储服务");
      return provider;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async handleOAuthCallback() {
      return providers.get("dropbox").handleOAuthCallback();
    },
    dispose() {
      view.removeEventListener?.("message", messageHandler);
      listeners.clear();
      for (const provider of providers.values()) provider.disconnect({remote: false});
    }
  };
  void api.handleOAuthCallback();
  return api;

  function listProviderStates() {
    return Array.from(providers.values(), provider => provider.getState());
  }
}

export function createDropboxProvider({view = globalThis, fetchImpl = view.fetch?.bind(view), config = {}, notify = () => {}, oauth = {}} = {}) {
  let accessToken = "";
  let expiresAt = 0;
  let pendingState = "";
  const configurationError = validateDropboxConfiguration(config, view);
  const configured = !configurationError;
  const sessionKey = "fmg-cloud-oauth:dropbox";

  return {
    id: "dropbox",
    label: "Dropbox",
    getState,
    connect,
    disconnect,
    listFiles,
    createFile,
    overwriteFile,
    downloadFile,
    handleOAuthCallback,
    acceptOAuthResult
  };

  function getState() {
    return publicProviderState("dropbox", "Dropbox", configured, tokenValid(), configFields(config, ["appKey", "redirectUri"]), configurationError);
  }

  async function connect() {
    assertConfigured(configured, "Dropbox");
    const verifier = oauth.createVerifier?.() || createRandomUrlToken(view, 64);
    const state = oauth.createState?.() || createRandomUrlToken(view, 32);
    pendingState = state;
    const handshake = JSON.stringify({verifier, state, createdAt: Date.now()});
    sessionStorageRef(view)?.setItem(sessionKey, handshake);
    const popup = oauth.open || oauth.navigate === false ? null : view.open?.("about:blank", "fmg-dropbox-oauth", "popup,width=520,height=720");
    let challenge;
    try {
      challenge = oauth.createChallenge ? await oauth.createChallenge(verifier) : await createPkceChallenge(view, verifier);
    } catch (error) {
      popup?.close?.();
      clearPendingHandshake();
      pendingState = "";
      throw error;
    }
    const params = new URLSearchParams({
      client_id: config.appKey,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      token_access_type: "online",
      redirect_uri: config.redirectUri,
      state,
      scope: DROPBOX_SCOPES.join(" ")
    });
    const url = `${DROPBOX_AUTH_URL}?${params}`;
    const oauthPopup = oauth.open ? oauth.open(url, {handshake, sessionKey}) : popup;
    if (oauthPopup && !oauth.open) {
      try {
        oauthPopup.sessionStorage?.setItem?.(sessionKey, handshake);
        oauthPopup.location?.replace?.(url);
      } catch {
        oauthPopup.close?.();
        view.location?.assign?.(url);
        return {started: true, popup: false, authorizationUrl: url};
      }
    }
    if (!oauthPopup && oauth.navigate !== false) view.location?.assign?.(url);
    return {started: true, popup: Boolean(oauthPopup), authorizationUrl: url};
  }

  async function handleOAuthCallback() {
    if (!configured) return {handled: false};
    const url = new URL(String(view.location?.href || config.redirectUri));
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (!code && !error) return {handled: false};
    const pending = readPendingHandshake();
    if (pending?.state) pendingState = String(pending.state);
    clearPendingHandshake();
    cleanOAuthQuery(view, url);
    if (error) return finishCallback({ok: false, state: returnedState, error: safeRemoteMessage(error)});
    if (!pending?.verifier || !pending?.state || pending.state !== returnedState) {
      return finishCallback({ok: false, state: returnedState, error: "Dropbox 授权状态校验失败，请重新连接。"});
    }
    try {
      const response = await requireFetch(fetchImpl)(DROPBOX_TOKEN_URL, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: config.appKey,
          redirect_uri: config.redirectUri,
          code_verifier: pending.verifier
        })
      });
      const payload = await readJsonResponse(response, "Dropbox 授权");
      return finishCallback({ok: true, state: returnedState, accessToken: payload.access_token, expiresIn: payload.expires_in});
    } catch (callbackError) {
      return finishCallback({ok: false, state: returnedState, error: safeRemoteMessage(callbackError?.message)});
    }
  }

  function finishCallback(payload) {
    if (view.opener && view.opener !== view) {
      view.opener.postMessage?.({type: "fmg-cloud-oauth-result", provider: "dropbox", ...payload}, safeOrigin(view));
      view.close?.();
      return {handled: true, relayed: true, ok: payload.ok};
    }
    acceptOAuthResult({provider: "dropbox", ...payload});
    return {handled: true, relayed: false, ok: payload.ok};
  }

  function acceptOAuthResult(payload) {
    if (!payload.state || !pendingState || payload.state !== pendingState) return false;
    pendingState = "";
    if (!payload.ok || !payload.accessToken) {
      notify();
      return false;
    }
    accessToken = String(payload.accessToken);
    expiresAt = Date.now() + Math.max(60, Number(payload.expiresIn) || 14_400) * 1000;
    notify();
    return true;
  }

  async function disconnect({remote = true} = {}) {
    const token = accessToken;
    accessToken = "";
    expiresAt = 0;
    pendingState = "";
    clearPendingHandshake();
    notify();
    if (remote && token) {
      await requireFetch(fetchImpl)(`${DROPBOX_API_URL}/auth/token/revoke`, {method: "POST", headers: {Authorization: `Bearer ${token}`}}).catch(() => null);
    }
    return {disconnected: true};
  }

  async function listFiles() {
    const token = requireToken();
    const files = [];
    let cursor = "";
    do {
      const endpoint = cursor ? "files/list_folder/continue" : "files/list_folder";
      const body = cursor ? {cursor} : {path: "", recursive: false, include_deleted: false, limit: 200};
      const response = await requireFetch(fetchImpl)(`${DROPBOX_API_URL}/${endpoint}`, dropboxJsonRequest(token, body));
      const payload = await readJsonResponse(response, "读取 Dropbox 文件");
      files.push(...(payload.entries || []).filter(entry => entry[".tag"] === "file" && isCloudMapFilename(entry.name)).map(normalizeDropboxFile));
      cursor = payload.has_more ? String(payload.cursor || "") : "";
    } while (cursor);
    return files.sort(sortRemoteFiles);
  }

  async function createFile({filename, blob}) {
    const token = requireToken();
    const normalizedName = normalizeCloudFilename(filename);
    const response = await requireFetch(fetchImpl)(`${DROPBOX_CONTENT_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({path: `/${normalizedName}`, mode: "add", autorename: false, mute: false, strict_conflict: true})
      },
      body: blob
    });
    return normalizeDropboxFile(await readJsonResponse(response, "保存到 Dropbox"));
  }

  async function overwriteFile(file, {blob}) {
    const token = requireToken();
    if (!file?.path || !file?.rev) throw new Error("覆盖 Dropbox 文件需要明确的文件路径和版本");
    const response = await requireFetch(fetchImpl)(`${DROPBOX_CONTENT_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({path: file.path, mode: {".tag": "update", update: file.rev}, autorename: false, mute: false, strict_conflict: true})
      },
      body: blob
    });
    return normalizeDropboxFile(await readJsonResponse(response, "覆盖 Dropbox 文件"));
  }

  async function downloadFile(file) {
    const token = requireToken();
    if (!file?.path) throw new Error("载入 Dropbox 文件需要明确的文件路径");
    const response = await requireFetch(fetchImpl)(`${DROPBOX_CONTENT_URL}/files/download`, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({path: file.path})}
    });
    await assertOk(response, "下载 Dropbox 文件");
    return response.blob();
  }

  function requireToken() {
    if (!tokenValid()) throw new Error("Dropbox 连接已失效，请重新连接。 ");
    return accessToken;
  }

  function tokenValid() {
    return Boolean(accessToken && expiresAt > Date.now() + 5000);
  }

  function readPendingHandshake() {
    try {
      return JSON.parse(sessionStorageRef(view)?.getItem(sessionKey) || "null");
    } catch {
      return null;
    }
  }

  function clearPendingHandshake() {
    sessionStorageRef(view)?.removeItem(sessionKey);
  }
}

export function createGoogleDriveProvider({view = globalThis, fetchImpl = view.fetch?.bind(view), config = {}, notify = () => {}, oauth = null} = {}) {
  let accessToken = "";
  let expiresAt = 0;
  const configured = Boolean(config.clientId);

  return {
    id: "google-drive",
    label: "Google Drive",
    getState: () => publicProviderState("google-drive", "Google Drive", configured, tokenValid(), configFields(config, ["clientId"]), configured ? "" : "缺少 Google OAuth client ID"),
    connect,
    disconnect,
    listFiles,
    createFile,
    overwriteFile,
    downloadFile
  };

  async function connect() {
    assertConfigured(configured, "Google Drive");
    const tokenResponse = oauth?.requestToken
      ? await oauth.requestToken({clientId: config.clientId, scope: GOOGLE_DRIVE_SCOPE})
      : await requestGoogleToken(view, {clientId: config.clientId, scope: GOOGLE_DRIVE_SCOPE});
    const scopes = String(tokenResponse.scope || "").split(/\s+/).filter(Boolean);
    if (!scopes.includes(GOOGLE_DRIVE_SCOPE)) throw new Error("Google 授权未包含 drive.file 权限，请重新连接并允许所需权限。");
    if (!tokenResponse.access_token) throw new Error("Google 授权未返回访问令牌");
    accessToken = String(tokenResponse.access_token);
    expiresAt = Date.now() + Math.max(60, Number(tokenResponse.expires_in) || 3600) * 1000;
    notify();
    return {connected: true};
  }

  async function disconnect({remote = true} = {}) {
    const token = accessToken;
    accessToken = "";
    expiresAt = 0;
    notify();
    if (remote && token) await revokeGoogleToken(view, oauth, token).catch(() => null);
    return {disconnected: true};
  }

  async function listFiles() {
    const token = requireToken();
    const files = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        q: `trashed = false and appProperties has { key='${GOOGLE_APP_PROPERTY.key}' and value='${GOOGLE_APP_PROPERTY.value}' }`,
        spaces: "drive",
        pageSize: "100",
        fields: "nextPageToken,files(id,name,size,modifiedTime,version,appProperties)"
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await requireFetch(fetchImpl)(`${GOOGLE_DRIVE_API_URL}/files?${params}`, googleRequest(token));
      const payload = await readJsonResponse(response, "读取 Google Drive 文件");
      files.push(...(payload.files || []).filter(file => isCloudMapFilename(file.name)).map(normalizeGoogleFile));
      pageToken = String(payload.nextPageToken || "");
    } while (pageToken);
    return files.sort(sortRemoteFiles);
  }

  async function createFile({filename, blob}) {
    const token = requireToken();
    const boundary = `fmg-${createRandomUrlToken(view, 18)}`;
    const metadata = {name: normalizeCloudFilename(filename), appProperties: {[GOOGLE_APP_PROPERTY.key]: GOOGLE_APP_PROPERTY.value}};
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ]);
    const response = await requireFetch(fetchImpl)(`${GOOGLE_DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,size,modifiedTime,version,appProperties`, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}`},
      body
    });
    return normalizeGoogleFile(await readJsonResponse(response, "保存到 Google Drive"));
  }

  async function overwriteFile(file, {blob}) {
    const token = requireToken();
    const fileId = requireGoogleFileId(file);
    const metadataResponse = await requireFetch(fetchImpl)(`${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,size,modifiedTime,version,appProperties`, googleRequest(token));
    const current = normalizeGoogleFile(await readJsonResponse(metadataResponse, "检查 Google Drive 文件版本"));
    if ((file.version && current.version !== file.version) || (file.modifiedAt && current.modifiedAt !== file.modifiedAt)) {
      throw new Error("Google Drive 文件已在其它位置更新。请刷新列表并重新选择，当前操作未覆盖远端文件。");
    }
    const response = await requireFetch(fetchImpl)(`${GOOGLE_DRIVE_UPLOAD_URL}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,size,modifiedTime,version,appProperties`, {
      method: "PATCH",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/gzip"},
      body: blob
    });
    return normalizeGoogleFile(await readJsonResponse(response, "覆盖 Google Drive 文件"));
  }

  async function downloadFile(file) {
    const token = requireToken();
    const fileId = requireGoogleFileId(file);
    const response = await requireFetch(fetchImpl)(`${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`, googleRequest(token));
    await assertOk(response, "下载 Google Drive 文件");
    return response.blob();
  }

  function requireToken() {
    if (!tokenValid()) throw new Error("Google Drive 连接已失效，请重新连接。");
    return accessToken;
  }

  function tokenValid() {
    return Boolean(accessToken && expiresAt > Date.now() + 5000);
  }
}

export function normalizeCloudFilename(filename) {
  const base = String(filename || "map").trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").slice(0, 180) || "map";
  return base.endsWith(CLOUD_MAP_EXTENSION) ? base : `${base.replace(/(?:\.json(?:\.gz)?|\.gz)$/i, "")}${CLOUD_MAP_EXTENSION}`;
}

function publicProviderState(id, label, configured, connected, fields, configurationError = "") {
  return Object.freeze({id, label, configured, connected, configuration: fields, configurationError});
}

function configFields(config, fields) {
  return Object.freeze(Object.fromEntries(fields.map(field => [field, Boolean(String(config?.[field] || "").trim())])));
}

function normalizeDropboxFile(entry) {
  const rev = String(entry.rev || "");
  return Object.freeze({provider: "dropbox", id: String(entry.id || entry.path_lower || ""), name: String(entry.name || ""), path: String(entry.path_lower || entry.path_display || ""), rev, revision: rev, size: Number(entry.size) || 0, modifiedAt: String(entry.server_modified || "")});
}

function normalizeGoogleFile(file) {
  const version = String(file.version || "");
  return Object.freeze({provider: "google-drive", id: String(file.id || ""), name: String(file.name || ""), version, revision: version, size: Number(file.size) || 0, modifiedAt: String(file.modifiedTime || "")});
}

function sortRemoteFiles(a, b) {
  return String(b.modifiedAt).localeCompare(String(a.modifiedAt)) || a.name.localeCompare(b.name, "zh-CN");
}

function isCloudMapFilename(name) {
  return String(name || "").toLowerCase().endsWith(CLOUD_MAP_EXTENSION);
}

function dropboxJsonRequest(token, body) {
  return {method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"}, body: JSON.stringify(body)};
}

function googleRequest(token, options = {}) {
  return {...options, headers: {...(options.headers || {}), Authorization: `Bearer ${token}`}};
}

function requireGoogleFileId(file) {
  const fileId = String(file?.id || "");
  if (!fileId) throw new Error("Google Drive 操作需要明确的 fileId");
  return fileId;
}

function assertConfigured(configured, label) {
  if (!configured) throw new Error(`${label} 尚未配置，请先完成自部署 OAuth 配置。`);
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("当前环境不支持云存储网络请求");
  return fetchImpl;
}

async function readJsonResponse(response, action) {
  await assertOk(response, action);
  return response.json();
}

async function assertOk(response, action) {
  if (response?.ok) return;
  let message = "";
  try {
    const payload = await response.clone().json();
    message = payload.error_summary || payload.error?.message || payload.error_description || "";
  } catch {
    message = "";
  }
  throw new Error(`${action}失败（HTTP ${Number(response?.status) || 0}）${message ? `：${safeRemoteMessage(message)}` : ""}`);
}

function safeRemoteMessage(value) {
  return String(value || "").replace(/(access[_ -]?token|refresh[_ -]?token|authorization|bearer)\s*[:=]?\s*[^\s,;]+/gi, "$1 [已隐藏]").slice(0, 240);
}

function sessionStorageRef(view) {
  try {
    return view.sessionStorage || null;
  } catch {
    return null;
  }
}

function safeOrigin(view) {
  return String(view.location?.origin || "");
}

function cleanOAuthQuery(view, url) {
  for (const key of ["code", "state", "error", "error_description"]) url.searchParams.delete(key);
  view.history?.replaceState?.(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function createRandomUrlToken(view, bytes) {
  const values = new Uint8Array(bytes);
  if (typeof view.crypto?.getRandomValues !== "function") throw new Error("当前浏览器缺少安全随机数能力，无法开始 OAuth 授权");
  view.crypto.getRandomValues(values);
  return base64Url(view, values);
}

function validateDropboxConfiguration(config, view) {
  if (!String(config?.appKey || "").trim()) return "缺少 Dropbox app key";
  if (!String(config?.redirectUri || "").trim()) return "缺少 Dropbox redirect URI";
  try {
    const redirect = new URL(config.redirectUri);
    if (!/^https?:$/.test(redirect.protocol)) return "Dropbox redirect URI 必须是 HTTP(S) 绝对地址";
    const origin = safeOrigin(view);
    if (origin && redirect.origin !== origin) return "Dropbox redirect URI 必须与当前应用同源";
  } catch {
    return "Dropbox redirect URI 必须是有效的绝对地址";
  }
  return "";
}

function revokeGoogleToken(view, oauth, token) {
  if (typeof oauth?.revoke === "function") return Promise.resolve(oauth.revoke(token));
  return new Promise(resolve => {
    const revoke = view.google?.accounts?.oauth2?.revoke;
    if (typeof revoke !== "function") {
      resolve();
      return;
    }
    revoke(token, () => resolve());
  });
}

async function createPkceChallenge(view, verifier) {
  if (!view.crypto?.subtle) throw new Error("当前浏览器不支持 Dropbox PKCE 授权");
  const bytes = new TextEncoder().encode(verifier);
  return base64Url(view, new Uint8Array(await view.crypto.subtle.digest("SHA-256", bytes)));
}

function base64Url(view, bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = view.btoa ? view.btoa(binary) : Buffer.from(bytes).toString("base64");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function requestGoogleToken(view, options) {
  await loadGoogleIdentityScript(view);
  return new Promise((resolve, reject) => {
    const client = view.google?.accounts?.oauth2?.initTokenClient?.({
      client_id: options.clientId,
      scope: options.scope,
      callback: response => response?.error ? reject(new Error(`Google 授权失败：${safeRemoteMessage(response.error)}`)) : resolve(response),
      error_callback: error => reject(new Error(`Google 授权窗口失败：${safeRemoteMessage(error?.type || error)}`))
    });
    if (!client) {
      reject(new Error("Google Identity Services 未能初始化"));
      return;
    }
    client.requestAccessToken({prompt: "consent"});
  });
}

function loadGoogleIdentityScript(view) {
  if (view.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const documentRef = view.document;
    const existing = documentRef?.querySelector?.(`script[src="${GOOGLE_TOKEN_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, {once: true});
      existing.addEventListener("error", () => reject(new Error("Google Identity Services 加载失败")), {once: true});
      return;
    }
    const script = documentRef?.createElement?.("script");
    if (!script) {
      reject(new Error("当前环境无法加载 Google Identity Services"));
      return;
    }
    script.src = GOOGLE_TOKEN_SCRIPT;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", resolve, {once: true});
    script.addEventListener("error", () => reject(new Error("Google Identity Services 加载失败")), {once: true});
    documentRef.head.append(script);
  });
}
