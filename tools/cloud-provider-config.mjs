const SENSITIVE_KEY = /(secret|token|authorization|bearer|password)/i;

export function emptyCloudProviderConfig() {
  return {
    version: 1,
    providers: {
      dropbox: {appKey: "", redirectUri: ""},
      googleDrive: {clientId: "", folderPath: "/webFMG"}
    }
  };
}

export function normalizeCloudProviderConfig(source = {}) {
  assertRecord(source, "Cloud Provider Config 必须是对象");
  rejectSensitiveKeys(source);
  const providers = source.providers ?? source;
  assertRecord(providers, "Cloud Provider Config providers 必须是对象");
  const dropbox = providers.dropbox ?? {};
  const googleDrive = providers.googleDrive ?? {};
  assertRecord(dropbox, "Cloud Provider Config dropbox 必须是对象");
  assertRecord(googleDrive, "Cloud Provider Config googleDrive 必须是对象");
  const googleClientId = clean(googleDrive.clientId);
  if (/^GOCSPX-/i.test(googleClientId)) throw new Error("Cloud Provider Config 检测到 Google client secret；请改用 OAuth Client ID");
  return {
    version: 1,
    providers: {
      dropbox: {
        appKey: clean(dropbox.appKey),
        redirectUri: clean(dropbox.redirectUri)
      },
      googleDrive: {
        clientId: googleClientId,
        folderPath: normalizeGoogleDriveFolderPath(googleDrive.folderPath)
      }
    }
  };
}

export function readCloudProviderBuildConfig(env = {}) {
  const unified = clean(env.FMG_CLOUD_PROVIDER_CONFIG);
  if (unified) {
    let parsed;
    try {
      parsed = JSON.parse(unified);
    } catch {
      throw new Error("FMG_CLOUD_PROVIDER_CONFIG 不是有效 JSON");
    }
    return normalizeCloudProviderConfig(parsed);
  }
  return normalizeCloudProviderConfig({
    dropbox: {
      appKey: first(env.FMG_DROPBOX_APP_KEY, env.VITE_FMG_DROPBOX_APP_KEY),
      redirectUri: first(env.FMG_DROPBOX_REDIRECT_URI, env.VITE_FMG_DROPBOX_REDIRECT_URI)
    },
    googleDrive: {
      clientId: first(env.FMG_GOOGLE_CLIENT_ID, env.VITE_FMG_GOOGLE_CLIENT_ID),
      folderPath: first(env.FMG_GOOGLE_FOLDER_PATH, env.VITE_FMG_GOOGLE_FOLDER_PATH, "/webFMG")
    }
  });
}

export function hasCloudProviderBuildInput(env = {}) {
  return [
    "FMG_CLOUD_PROVIDER_CONFIG",
    "FMG_DROPBOX_APP_KEY",
    "FMG_DROPBOX_REDIRECT_URI",
    "FMG_GOOGLE_CLIENT_ID",
    "FMG_GOOGLE_FOLDER_PATH",
    "VITE_FMG_DROPBOX_APP_KEY",
    "VITE_FMG_DROPBOX_REDIRECT_URI",
    "VITE_FMG_GOOGLE_CLIENT_ID",
    "VITE_FMG_GOOGLE_FOLDER_PATH"
  ].some(name => Boolean(clean(env[name])));
}

export function serializeCloudProviderConfig(config) {
  const json = JSON.stringify(normalizeCloudProviderConfig(config), null, 2).replaceAll("<", "\\u003c");
  return `globalThis.__FMG_CLOUD_PROVIDER_CONFIG__ = ${json};\n`;
}

export function normalizeGoogleDriveFolderPath(value = "/webFMG") {
  const source = clean(value) || "/webFMG";
  const segments = source.replace(/\\/g, "/").split("/").map(segment => segment.trim()).filter(Boolean);
  if (segments.length > 20) throw new Error("Google Drive folderPath 最多支持 20 级目录");
  for (const segment of segments) {
    if (segment === "." || segment === "..") throw new Error("Google Drive folderPath 不允许 . 或 .. 路径段");
    if (/[\u0000-\u001f]/.test(segment) || segment.length > 200) throw new Error("Google Drive folderPath 包含无效目录名");
  }
  return segments.length ? `/${segments.join("/")}` : "/";
}

function first(...values) {
  return values.map(clean).find(Boolean) || "";
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
}

function rejectSensitiveKeys(value) {
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`Cloud Provider Config 包含禁止字段：${key}`);
    if (nested && typeof nested === "object") rejectSensitiveKeys(nested);
  }
}
