import {ensureMapArchiveExtension, isMapDocumentFilename, MAP_ARCHIVE_EXTENSION} from "./map-filename.js";

export const CLOUD_MAP_EXTENSION = MAP_ARCHIVE_EXTENSION;
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
const GOOGLE_FOLDER_PROPERTY = Object.freeze({key: "fmgWebglFolder", value: "true"});
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DROPBOX_HANDSHAKE_MAX_AGE = 10 * 60 * 1000;
const CLOUD_SESSION_TOKEN_VERSION = 1;
const CLOUD_SESSION_TOKEN_PREFIX = `fmg-cloud-session:v${CLOUD_SESSION_TOKEN_VERSION}`;
const CLOUD_TOKEN_EXPIRY_SKEW = 5000;

export function readCloudStorageConfig(env = import.meta.env || {}, runtimeConfig = globalThis.__FMG_CLOUD_PROVIDER_CONFIG__) {
  const providers = runtimeConfig?.providers && typeof runtimeConfig.providers === "object" ? runtimeConfig.providers : runtimeConfig || {};
  const dropbox = providers?.dropbox || {};
  const googleDrive = providers?.googleDrive || {};
  return Object.freeze({
    dropbox: Object.freeze({
      appKey: firstConfiguredValue(dropbox.appKey, env.VITE_FMG_DROPBOX_APP_KEY),
      redirectUri: firstConfiguredValue(dropbox.redirectUri, env.VITE_FMG_DROPBOX_REDIRECT_URI)
    }),
    googleDrive: Object.freeze({
      clientId: firstConfiguredValue(googleDrive.clientId, env.VITE_FMG_GOOGLE_CLIENT_ID),
      folderPath: firstConfiguredValue(googleDrive.folderPath, env.VITE_FMG_GOOGLE_FOLDER_PATH, "/webFMG")
    })
  });
}

export function createCloudStorageRegistry(options = {}) {
  const view = options.view || globalThis;
  const fetchImpl = options.fetchImpl || view.fetch?.bind(view);
  const runtimeConfig = options.runtimeConfig === undefined ? view.__FMG_CLOUD_PROVIDER_CONFIG__ : options.runtimeConfig;
  const config = options.config || readCloudStorageConfig(options.env, runtimeConfig);
  const providers = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener(listProviderStates()));
  const shared = {view, fetchImpl, notify};
  providers.set("dropbox", createDropboxProvider({...shared, config: config.dropbox, oauth: options.dropboxOauth}));
  providers.set("google-drive", createGoogleDriveProvider({...shared, config: config.googleDrive, oauth: options.googleOauth}));

  const messageHandler = event => {
    if (event.origin !== safeOrigin(view)) return;
    const payload = event.data;
    if (payload?.provider !== "dropbox") return;
    const provider = providers.get("dropbox");
    if (payload.type === "fmg-cloud-oauth-callback") {
      void provider?.handleOAuthCallbackMessage(payload, event.source);
    }
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
      for (const provider of providers.values()) provider.dispose();
    }
  };
  void api.handleOAuthCallback();
  return api;

  function listProviderStates() {
    return Array.from(providers.values(), provider => provider.getState());
  }
}

function firstConfiguredValue(...values) {
  return values.map(value => String(value || "").trim()).find(Boolean) || "";
}

export function createDropboxProvider({view = globalThis, fetchImpl = view.fetch?.bind(view), config = {}, notify = () => {}, oauth = {}} = {}) {
  let pendingState = "";
  let pendingPopup = null;
  let callbackInFlight = false;
  let authorizationError = "";
  const configurationError = validateDropboxConfiguration(config, view);
  const configured = !configurationError;
  const sessionKey = "fmg-cloud-oauth:dropbox";
  const tokenSession = createCloudTokenSession({
    view,
    provider: "dropbox",
    configured,
    fingerprint: cloudTokenFingerprint(view, "dropbox", [config.appKey, config.redirectUri, ...DROPBOX_SCOPES]),
    notify
  });

  return {
    id: "dropbox",
    label: "Dropbox",
    getState,
    connect,
    disconnect,
    dispose: tokenSession.dispose,
    listFiles,
    createFile,
    overwriteFile,
    downloadFile,
    handleOAuthCallback,
    handleOAuthCallbackMessage,
    acceptOAuthResult
  };

  function getState() {
    return publicProviderState("dropbox", "Dropbox", configured, tokenValid(), configFields(config, ["appKey", "redirectUri"]), configurationError, authorizationError);
  }

  async function connect() {
    assertConfigured(configured, "Dropbox");
    if (callbackInFlight) throw new Error("正在完成 Dropbox 授权，请稍候。");
    const verifier = oauth.createVerifier?.() || createRandomUrlToken(view, 64);
    const state = oauth.createState?.() || createRandomUrlToken(view, 32);
    authorizationError = "";
    callbackInFlight = false;
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
      pendingPopup = null;
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
    pendingPopup = oauthPopup || null;
    if (oauthPopup && !oauth.open) {
      try {
        oauthPopup.sessionStorage?.setItem?.(sessionKey, handshake);
        oauthPopup.location?.replace?.(url);
      } catch {
        oauthPopup.close?.();
        clearPendingHandshake();
        pendingState = "";
        pendingPopup = null;
        throw new Error("Dropbox 授权窗口无法打开，请允许此站点弹出窗口后重试。");
      }
    }
    if (!oauthPopup && oauth.navigate !== false) {
      clearPendingHandshake();
      pendingState = "";
      throw new Error("Dropbox 授权窗口被浏览器拦截，请允许此站点弹出窗口后重试。");
    }
    return {started: true, popup: Boolean(oauthPopup), authorizationUrl: url};
  }

  async function handleOAuthCallback() {
    const url = new URL(String(view.location?.href || config.redirectUri));
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (!code && !error) return {handled: false};
    cleanOAuthQuery(view, url);
    if (view.opener && view.opener !== view) {
      view.opener.postMessage?.({type: "fmg-cloud-oauth-callback", provider: "dropbox", code: String(code || ""), state: String(returnedState || ""), error: safeRemoteMessage(error)}, safeOrigin(view));
      view.close?.();
      return {handled: true, relayed: true, ok: !error};
    }
    if (!configured || callbackInFlight) return {handled: false};
    callbackInFlight = true;
    try {
      const payload = await exchangeAuthorizationCode({code, state: returnedState, error});
      const ok = acceptOAuthResult({provider: "dropbox", ...payload});
      return {handled: true, relayed: false, ok};
    } finally {
      callbackInFlight = false;
    }
  }

  async function handleOAuthCallbackMessage(payload, source) {
    if (!configured) return {handled: false};
    if (!pendingPopup || source !== pendingPopup) return {handled: false, ok: false};
    if (callbackInFlight) return {handled: false, ok: false, reason: "in-flight"};
    callbackInFlight = true;
    try {
      const result = await exchangeAuthorizationCode({
        code: payload?.code,
        state: payload?.state,
        error: payload?.error
      });
      const ok = acceptOAuthResult({provider: "dropbox", ...result});
      return {handled: true, relayed: false, ok};
    } finally {
      callbackInFlight = false;
    }
  }

  async function exchangeAuthorizationCode({code, state, error}) {
    const returnedState = String(state || "");
    const pending = readPendingHandshake();
    if (pending?.state) pendingState = String(pending.state);
    clearPendingHandshake();
    const createdAt = Number(pending?.createdAt);
    const expired = !Number.isFinite(createdAt) || createdAt > Date.now() + 60_000 || Date.now() - createdAt > DROPBOX_HANDSHAKE_MAX_AGE;
    if (!pending?.verifier || !pending?.state || pending.state !== returnedState || expired) {
      return {ok: false, state: returnedState, error: "Dropbox 授权状态校验失败，请重新连接。"};
    }
    if (error) return {ok: false, state: returnedState, error: safeRemoteMessage(error)};
    if (!code) return {ok: false, state: returnedState, error: "Dropbox 未返回授权码，请重新连接。"};
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
      return {ok: true, state: returnedState, accessToken: payload.access_token, expiresIn: payload.expires_in};
    } catch (callbackError) {
      return {ok: false, state: returnedState, error: safeRemoteMessage(callbackError?.message)};
    }
  }

  function acceptOAuthResult(payload) {
    const stateMatches = Boolean(payload.state && pendingState && payload.state === pendingState);
    pendingState = "";
    pendingPopup = null;
    callbackInFlight = false;
    if (!stateMatches || !payload.ok || !payload.accessToken) {
      authorizationError = stateMatches ? safeRemoteMessage(payload.error || "Dropbox 授权未完成，请重新连接。") : "Dropbox 授权状态校验失败，请重新连接。";
      notify();
      return false;
    }
    authorizationError = "";
    tokenSession.set(payload.accessToken, Date.now() + Math.max(60, Number(payload.expiresIn) || 14_400) * 1000);
    notify();
    return true;
  }

  async function disconnect({remote = true} = {}) {
    const token = tokenSession.peek();
    tokenSession.clear();
    pendingState = "";
    pendingPopup = null;
    callbackInFlight = false;
    authorizationError = "";
    clearPendingHandshake();
    notify();
    if (remote && token) {
      await requireFetch(fetchImpl)(`${DROPBOX_API_URL}/auth/token/revoke`, {method: "POST", headers: {Authorization: `Bearer ${token}`}}).catch(() => null);
    }
    return {disconnected: true};
  }

  async function listFiles() {
    const session = requireTokenSession();
    const token = session.token;
    const files = [];
    let cursor = "";
    do {
      const endpoint = cursor ? "files/list_folder/continue" : "files/list_folder";
      const body = cursor ? {cursor} : {path: "", recursive: false, include_deleted: false, limit: 200};
      const response = await authenticatedFetch(`${DROPBOX_API_URL}/${endpoint}`, dropboxJsonRequest(token, body), session);
      const payload = await readJsonResponse(response, "读取 Dropbox 文件");
      files.push(...(payload.entries || []).filter(entry => entry[".tag"] === "file" && isCloudMapFilename(entry.name)).map(normalizeDropboxFile));
      cursor = payload.has_more ? String(payload.cursor || "") : "";
    } while (cursor);
    return files.sort(sortRemoteFiles);
  }

  async function createFile({filename, blob}) {
    const session = requireTokenSession();
    const token = session.token;
    const normalizedName = normalizeCloudFilename(filename);
    const response = await authenticatedFetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({path: `/${normalizedName}`, mode: "add", autorename: false, mute: false, strict_conflict: true})
      },
      body: blob
    }, session);
    return normalizeDropboxFile(await readJsonResponse(response, "保存到 Dropbox"));
  }

  async function overwriteFile(file, {blob}) {
    const session = requireTokenSession();
    const token = session.token;
    if (!file?.path || !file?.rev) throw new Error("覆盖 Dropbox 文件需要明确的文件路径和版本");
    const response = await authenticatedFetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({path: file.path, mode: {".tag": "update", update: file.rev}, autorename: false, mute: false, strict_conflict: true})
      },
      body: blob
    }, session);
    return normalizeDropboxFile(await readJsonResponse(response, "覆盖 Dropbox 文件"));
  }

  async function downloadFile(file) {
    const session = requireTokenSession();
    const token = session.token;
    if (!file?.path) throw new Error("载入 Dropbox 文件需要明确的文件路径");
    const response = await authenticatedFetch(`${DROPBOX_CONTENT_URL}/files/download`, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({path: file.path})}
    }, session);
    await assertOk(response, "下载 Dropbox 文件");
    return response.blob();
  }

  function requireTokenSession() {
    if (!tokenValid()) throw new Error("Dropbox 连接已失效，请重新连接。 ");
    return tokenSession.capture();
  }

  function tokenValid() {
    return tokenSession.valid();
  }

  async function authenticatedFetch(url, options, session) {
    const response = await requireFetch(fetchImpl)(url, options);
    if (response?.status === 401 && tokenSession.isCurrent(session)) tokenSession.clear({notifyState: true});
    return response;
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
  let resolvedFolderId = "";
  let folderResolution = null;
  const clientId = String(config.clientId || "").trim();
  let folderPath = "/webFMG";
  let folderPathError = "";
  try {
    folderPath = normalizeGoogleDriveFolderPath(config.folderPath);
  } catch (error) {
    folderPathError = String(error?.message || error);
  }
  const configurationError = !clientId
    ? "缺少 Google OAuth client ID"
    : /^GOCSPX-/i.test(clientId)
      ? "检测到 Google client secret；请改用 OAuth Client ID"
      : folderPathError;
  const configured = !configurationError;
  const tokenSession = createCloudTokenSession({
    view,
    provider: "google-drive",
    configured,
    fingerprint: cloudTokenFingerprint(view, "google-drive", [clientId, folderPath, GOOGLE_DRIVE_SCOPE]),
    notify,
    onClear: () => {
      resolvedFolderId = "";
      folderResolution = null;
    }
  });

  return {
    id: "google-drive",
    label: "Google Drive",
    getState: () => publicProviderState("google-drive", "Google Drive", configured, tokenValid(), configFields({clientId, folderPath}, ["clientId", "folderPath"]), configurationError),
    connect,
    disconnect,
    dispose: tokenSession.dispose,
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
    tokenSession.set(tokenResponse.access_token, Date.now() + Math.max(60, Number(tokenResponse.expires_in) || 3600) * 1000);
    notify();
    return {connected: true};
  }

  async function disconnect({remote = true} = {}) {
    const token = tokenSession.peek();
    tokenSession.clear();
    resolvedFolderId = "";
    folderResolution = null;
    notify();
    if (remote && token) await revokeGoogleToken(view, oauth, token).catch(() => null);
    return {disconnected: true};
  }

  async function listFiles() {
    const session = requireTokenSession();
    const folderId = await resolveConfiguredFolder(session, {create: false});
    const parentIds = folderId && folderId !== "root" ? [folderId, "root"] : ["root"];
    const groups = await Promise.all(parentIds.map(parentId => listFilesInParent(session, parentId)));
    return groups.flat().sort(sortRemoteFiles);
  }

  async function listFilesInParent(session, parentId) {
    const token = session.token;
    const files = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        q: `trashed = false and '${escapeGoogleDriveQuery(parentId)}' in parents and appProperties has { key='${GOOGLE_APP_PROPERTY.key}' and value='${GOOGLE_APP_PROPERTY.value}' }`,
        spaces: "drive",
        pageSize: "100",
        fields: "nextPageToken,files(id,name,size,modifiedTime,version,parents,appProperties)"
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await authenticatedFetch(`${GOOGLE_DRIVE_API_URL}/files?${params}`, googleRequest(token), session);
      const payload = await readJsonResponse(response, "读取 Google Drive 文件");
      files.push(...(payload.files || []).filter(file => isCloudMapFilename(file.name)).map(normalizeGoogleFile));
      pageToken = String(payload.nextPageToken || "");
    } while (pageToken);
    return files;
  }

  async function createFile({filename, blob}) {
    const session = requireTokenSession();
    const token = session.token;
    const folderId = await resolveConfiguredFolder(session, {create: true});
    const boundary = `fmg-${createRandomUrlToken(view, 18)}`;
    const metadata = {
      name: normalizeCloudFilename(filename),
      parents: [folderId],
      appProperties: {[GOOGLE_APP_PROPERTY.key]: GOOGLE_APP_PROPERTY.value}
    };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ]);
    const response = await authenticatedFetch(`${GOOGLE_DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,size,modifiedTime,version,parents,appProperties`, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}`},
      body
    }, session);
    return normalizeGoogleFile(await readJsonResponse(response, "保存到 Google Drive"));
  }

  async function overwriteFile(file, {blob}) {
    const session = requireTokenSession();
    const token = session.token;
    const fileId = requireGoogleFileId(file);
    const metadataResponse = await authenticatedFetch(`${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,size,modifiedTime,version,appProperties`, googleRequest(token), session);
    const current = normalizeGoogleFile(await readJsonResponse(metadataResponse, "检查 Google Drive 文件版本"));
    if ((file.version && current.version !== file.version) || (file.modifiedAt && current.modifiedAt !== file.modifiedAt)) {
      throw new Error("Google Drive 文件已在其它位置更新。请刷新列表并重新选择，当前操作未覆盖远端文件。");
    }
    const response = await authenticatedFetch(`${GOOGLE_DRIVE_UPLOAD_URL}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,size,modifiedTime,version,appProperties`, {
      method: "PATCH",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/gzip"},
      body: blob
    }, session);
    return normalizeGoogleFile(await readJsonResponse(response, "覆盖 Google Drive 文件"));
  }

  async function downloadFile(file) {
    const session = requireTokenSession();
    const token = session.token;
    const fileId = requireGoogleFileId(file);
    const response = await authenticatedFetch(`${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`, googleRequest(token), session);
    await assertOk(response, "下载 Google Drive 文件");
    return response.blob();
  }

  function requireTokenSession() {
    if (!tokenValid()) throw new Error("Google Drive 连接已失效，请重新连接。");
    return tokenSession.capture();
  }

  function tokenValid() {
    return tokenSession.valid();
  }

  async function resolveConfiguredFolder(session, {create}) {
    const token = session.token;
    if (folderPath === "/") return "root";
    if (resolvedFolderId) return resolvedFolderId;
    const sessionGeneration = session.generation;
    if (folderResolution?.token === token && folderResolution.generation === sessionGeneration) {
      const pendingFolderId = await folderResolution.promise;
      if (!tokenSession.matches(token, sessionGeneration)) throw new Error("Google Drive 连接已失效，请重新连接。");
      if (pendingFolderId || !create) return pendingFolderId;
    }
    const resolution = {
      token,
      generation: sessionGeneration,
      promise: resolveFolderPath(session, create)
    };
    folderResolution = resolution;
    try {
      const folderId = await resolution.promise;
      if (!tokenSession.matches(token, sessionGeneration)) throw new Error("Google Drive 连接已失效，请重新连接。");
      if (folderResolution === resolution && folderId) resolvedFolderId = folderId;
      return folderId;
    } finally {
      if (folderResolution === resolution) folderResolution = null;
    }
  }

  async function resolveFolderPath(session, create) {
    let parentId = "root";
    for (const segment of folderPath.slice(1).split("/")) {
      const existing = await findGoogleFolder(session, parentId, segment);
      if (existing) {
        parentId = existing.id;
        continue;
      }
      if (!create) return "";
      parentId = (await createGoogleFolder(session, parentId, segment)).id;
    }
    return parentId;
  }

  async function findGoogleFolder(session, parentId, name) {
    const token = session.token;
    const params = new URLSearchParams({
      q: `trashed = false and mimeType = '${GOOGLE_FOLDER_MIME}' and name = '${escapeGoogleDriveQuery(name)}' and '${escapeGoogleDriveQuery(parentId)}' in parents`,
      spaces: "drive",
      pageSize: "20",
      fields: "files(id,name,parents,appProperties)"
    });
    const response = await authenticatedFetch(`${GOOGLE_DRIVE_API_URL}/files?${params}`, googleRequest(token), session);
    const payload = await readJsonResponse(response, "查找 Google Drive 存档目录");
    const folders = Array.isArray(payload.files) ? payload.files : [];
    return folders.find(folder => folder.appProperties?.[GOOGLE_FOLDER_PROPERTY.key] === GOOGLE_FOLDER_PROPERTY.value) || folders[0] || null;
  }

  async function createGoogleFolder(session, parentId, name) {
    const token = session.token;
    const response = await authenticatedFetch(`${GOOGLE_DRIVE_API_URL}/files?fields=id,name,parents,appProperties`, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8"},
      body: JSON.stringify({
        name,
        mimeType: GOOGLE_FOLDER_MIME,
        parents: [parentId],
        appProperties: {[GOOGLE_FOLDER_PROPERTY.key]: GOOGLE_FOLDER_PROPERTY.value}
      })
    }, session);
    const folder = await readJsonResponse(response, "创建 Google Drive 存档目录");
    if (!folder.id) throw new Error("Google Drive 未返回新建目录 ID");
    return folder;
  }

  async function authenticatedFetch(url, options, session) {
    const response = await requireFetch(fetchImpl)(url, options);
    if (response?.status === 401 && tokenSession.isCurrent(session)) tokenSession.clear({notifyState: true});
    return response;
  }
}

export function normalizeCloudFilename(filename) {
  return ensureMapArchiveExtension(filename);
}

export function normalizeGoogleDriveFolderPath(value = "/webFMG") {
  const source = String(value || "").trim() || "/webFMG";
  const segments = source.replace(/\\/g, "/").split("/").map(segment => segment.trim()).filter(Boolean);
  if (segments.length > 20) throw new Error("Google Drive folderPath 最多支持 20 级目录");
  for (const segment of segments) {
    if (segment === "." || segment === "..") throw new Error("Google Drive folderPath 不允许 . 或 .. 路径段");
    if (/[\u0000-\u001f]/.test(segment) || segment.length > 200) throw new Error("Google Drive folderPath 包含无效目录名");
  }
  return segments.length ? `/${segments.join("/")}` : "/";
}

function publicProviderState(id, label, configured, connected, fields, configurationError = "", authorizationError = "") {
  return Object.freeze({id, label, configured, connected, configuration: fields, configurationError, authorizationError});
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
  return Object.freeze({provider: "google-drive", id: String(file.id || ""), name: String(file.name || ""), version, revision: version, parents: Object.freeze((file.parents || []).map(String)), size: Number(file.size) || 0, modifiedAt: String(file.modifiedTime || "")});
}

function escapeGoogleDriveQuery(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sortRemoteFiles(a, b) {
  return String(b.modifiedAt).localeCompare(String(a.modifiedAt)) || a.name.localeCompare(b.name, "zh-CN");
}

function isCloudMapFilename(name) {
  return isMapDocumentFilename(name);
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

function cloudTokenFingerprint(view, provider, fields) {
  return JSON.stringify([CLOUD_SESSION_TOKEN_VERSION, provider, safeOrigin(view), ...fields.map(value => String(value || ""))]);
}

function createCloudTokenSession({view, provider, configured, fingerprint, notify, onClear = () => {}}) {
  const storage = sessionStorageRef(view);
  const key = `${CLOUD_SESSION_TOKEN_PREFIX}:${provider}`;
  let accessToken = "";
  let expiresAt = 0;
  let expiryTimer = null;
  let generation = 0;
  restore();

  return {
    set,
    clear,
    dispose,
    peek: () => accessToken,
    capture: () => ({token: accessToken, generation}),
    isCurrent: session => Boolean(session)
      && session.token === accessToken
      && session.generation === generation,
    generation: () => generation,
    matches: (token, expectedGeneration) => token === accessToken
      && expectedGeneration === generation
      && expiresAt > Date.now() + CLOUD_TOKEN_EXPIRY_SKEW,
    valid
  };

  function set(token, absoluteExpiry) {
    const nextToken = String(token || "");
    const nextExpiry = Number(absoluteExpiry);
    if (!nextToken || !Number.isFinite(nextExpiry) || nextExpiry <= Date.now() + CLOUD_TOKEN_EXPIRY_SKEW) {
      clear();
      return false;
    }
    clearTimer();
    generation++;
    onClear();
    accessToken = nextToken;
    expiresAt = nextExpiry;
    try {
      storage?.setItem(key, JSON.stringify({
        version: CLOUD_SESSION_TOKEN_VERSION,
        provider,
        fingerprint,
        accessToken,
        expiresAt
      }));
    } catch {
      // sessionStorage 不可用时仍保留当前页面内存连接。
    }
    scheduleExpiry();
    return true;
  }

  function clear({notifyState = false} = {}) {
    const changed = Boolean(accessToken || expiresAt);
    clearTimer();
    generation++;
    accessToken = "";
    expiresAt = 0;
    onClear();
    try {
      storage?.removeItem(key);
    } catch {
      // 存储清理失败不应阻断内存令牌失效。
    }
    if (changed && notifyState) notify();
  }

  function dispose() {
    clearTimer();
    generation++;
    accessToken = "";
    expiresAt = 0;
    onClear();
  }

  function valid() {
    if (!accessToken) return false;
    if (expiresAt <= Date.now() + CLOUD_TOKEN_EXPIRY_SKEW) {
      clear();
      return false;
    }
    return true;
  }

  function restore() {
    let record = null;
    try {
      record = JSON.parse(storage?.getItem(key) || "null");
    } catch {
      record = null;
    }
    const recordExpiry = Number(record?.expiresAt);
    const accepted = configured
      && record?.version === CLOUD_SESSION_TOKEN_VERSION
      && record?.provider === provider
      && record?.fingerprint === fingerprint
      && Boolean(String(record?.accessToken || ""))
      && Number.isFinite(recordExpiry)
      && recordExpiry > Date.now() + CLOUD_TOKEN_EXPIRY_SKEW;
    if (!accepted) {
      try {
        storage?.removeItem(key);
      } catch {
        // 损坏或不匹配记录在内存中仍视为无连接。
      }
      return;
    }
    accessToken = String(record.accessToken);
    expiresAt = recordExpiry;
    generation++;
    scheduleExpiry();
  }

  function scheduleExpiry() {
    if (typeof view.setTimeout !== "function") return;
    const remaining = Math.max(0, expiresAt - Date.now() - CLOUD_TOKEN_EXPIRY_SKEW);
    expiryTimer = view.setTimeout(() => {
      expiryTimer = null;
      if (expiresAt > Date.now() + CLOUD_TOKEN_EXPIRY_SKEW) {
        scheduleExpiry();
        return;
      }
      clear({notifyState: true});
    }, Math.min(remaining, 2_147_483_647));
  }

  function clearTimer() {
    if (expiryTimer === null) return;
    view.clearTimeout?.(expiryTimer);
    expiryTimer = null;
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
    client.requestAccessToken();
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
