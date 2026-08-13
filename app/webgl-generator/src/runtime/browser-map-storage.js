import {decompressGzipBase64Text} from "./map-file-io.js";

export const BROWSER_MAP_STORAGE_KEY = "webgl-generator-current-map-v1";
export const BROWSER_MAP_STORAGE_TYPE = "webgl-generator-local-map-storage";
export const BROWSER_MAP_STORAGE_VERSION = 1;
export const BROWSER_MAP_STORAGE_FALLBACK_DB = "webgl-generator-map-storage-v1";
export const BROWSER_MAP_STORAGE_FALLBACK_STORE = "maps";
export const BROWSER_MAP_STORAGE_FALLBACK_RECORD = "current";
export const BROWSER_MAP_STORAGE_BINARY_TYPE = "webgl-generator-browser-map-gzip";
export const BROWSER_MAP_STORAGE_BINARY_VERSION = 1;
export const BROWSER_MAP_STORAGE_DIRECT_BINARY_MIN_BYTES = 4 * 1024 * 1024;

export async function encodeBrowserMapStoragePayload(documentRef, text, map) {
  const startedAt = storageClock(documentRef);
  const compressed = await compressTextToBase64(documentRef, text);
  const encoded = compressed
    ? {encoding: "gzip-base64", data: compressed.base64, bytes: compressed.bytes}
    : {encoding: "plain", data: text, bytes: text.length};
  const envelope = createBrowserMapStorageEnvelope(text, map, encoded);
  Object.defineProperty(envelope, "__timings", {
    configurable: false,
    enumerable: false,
    value: {
      gzipMs: compressed?.gzipMs || 0,
      base64Ms: compressed?.base64Ms || 0,
      encodingMs: elapsedMs(storageClock(documentRef), startedAt)
    },
    writable: false
  });
  return envelope;
}

export async function encodeBrowserMapStorageBytesPayload(documentRef, bytes, map, metadata = {}) {
  const view = documentRef.defaultView || window;
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const base64StartedAt = storageClock(documentRef);
  const base64 = await blobToBase64(view, new view.Blob([source], {type: "application/gzip"}));
  const envelope = createBrowserMapStorageEnvelope("", map, {
    encoding: "gzip-base64",
    data: base64,
    bytes: source.byteLength,
    originalCharacters: metadata.originalCharacters
  });
  const base64Ms = elapsedMs(storageClock(documentRef), base64StartedAt);
  const gzipMs = Math.max(0, Number(metadata.gzipMs) || 0);
  Object.defineProperty(envelope, "__timings", {
    configurable: false,
    enumerable: false,
    value: {
      gzipMs,
      base64Ms,
      encodingMs: Number((gzipMs + base64Ms).toFixed(1))
    },
    writable: false
  });
  return envelope;
}

export async function decodeBrowserMapStoragePayload(documentRef, raw) {
  const envelope = parseBrowserMapStorageEnvelope(raw);
  if (envelope.legacy) return envelope.text;
  if (envelope.encoding === "gzip-base64") return decompressGzipBase64Text(documentRef, envelope.data);
  return envelope.data;
}

export async function writeBrowserMapStorage(documentRef, raw) {
  const view = documentRef.defaultView || window;
  const storage = safeLocalStorage(view);
  if (storage) {
    try {
      storage.setItem(BROWSER_MAP_STORAGE_KEY, raw);
      await deleteIndexedDbRecord(view).catch(() => {});
      return {backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY};
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      try {
        await putIndexedDbRecord(view, raw);
        return {backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true};
      } catch {
        throw error;
      }
    }
  }

  await putIndexedDbRecord(view, raw);
  return {backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true};
}

export function shouldWriteBrowserMapStorageBinary(bytes) {
  return Math.max(0, Number(bytes) || 0) >= BROWSER_MAP_STORAGE_DIRECT_BINARY_MIN_BYTES;
}

export function createBrowserMapStorageBinaryRecord(bytes, map, metadata = {}) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  return {
    type: BROWSER_MAP_STORAGE_BINARY_TYPE,
    version: BROWSER_MAP_STORAGE_BINARY_VERSION,
    savedAt: new Date().toISOString(),
    originalBytes: Math.max(0, Number(metadata.originalBytes) || 0),
    metadata: createBrowserMapStorageMetadata(map),
    encoding: "gzip",
    bytes: source.byteLength,
    data: source
  };
}

export async function writeBrowserMapStorageBinary(documentRef, bytes, map, metadata = {}) {
  const view = documentRef.defaultView || window;
  const record = createBrowserMapStorageBinaryRecord(bytes, map, metadata);
  await putIndexedDbRecord(view, record);
  try {
    safeLocalStorage(view)?.removeItem(BROWSER_MAP_STORAGE_KEY);
  } catch {
    // IndexedDB 已是本次权威存档；受限环境中清理旧 LocalStorage 失败不应损坏新存档。
  }
  return {
    backend: "indexedDB",
    storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD,
    directBinary: true,
    record
  };
}

export async function readBrowserMapStorage(documentRef) {
  const view = documentRef.defaultView || window;
  const localRaw = safeLocalStorage(view)?.getItem(BROWSER_MAP_STORAGE_KEY) || "";
  const fallbackRaw = await getIndexedDbRecord(view).catch(() => "");
  if (!localRaw && !fallbackRaw) return null;
  if (!localRaw) return createIndexedDbReadResult(fallbackRaw);
  if (!fallbackRaw) return {raw: localRaw, backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY};

  const localSavedAt = savedAtFromStoredValue(localRaw);
  const fallbackSavedAt = savedAtFromStoredValue(fallbackRaw);
  if (fallbackSavedAt && (!localSavedAt || fallbackSavedAt >= localSavedAt)) {
    return createIndexedDbReadResult(fallbackRaw);
  }
  return {raw: localRaw, backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY};
}

export function createBrowserMapStorageEnvelope(text, map, encoded = {}) {
  const encoding = encoded.encoding === "gzip-base64" ? "gzip-base64" : "plain";
  const data = String(encoded.data ?? text ?? "");
  const originalCharacters = Number.isFinite(Number(encoded.originalCharacters))
    ? Math.max(0, Number(encoded.originalCharacters))
    : String(text || "").length;
  return {
    type: BROWSER_MAP_STORAGE_TYPE,
    version: BROWSER_MAP_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    originalBytes: originalCharacters,
    metadata: createBrowserMapStorageMetadata(map),
    encoding,
    data,
    bytes: Math.max(0, Number(encoded.bytes) || data.length)
  };
}

export function parseBrowserMapStorageEnvelope(raw) {
  const text = String(raw || "");
  const payload = JSON.parse(text);
  if (payload?.type !== BROWSER_MAP_STORAGE_TYPE) return {legacy: true, text};
  if (payload.version !== BROWSER_MAP_STORAGE_VERSION) throw new Error(`暂不支持的浏览器存档版本：${payload.version}`);
  if (!["plain", "gzip-base64"].includes(payload.encoding)) throw new Error(`暂不支持的浏览器存档编码：${payload.encoding || "未知"}`);
  return {
    legacy: false,
    encoding: payload.encoding,
    data: String(payload.data || ""),
    metadata: {...(payload.metadata || {})},
    savedAt: payload.savedAt || "",
    originalBytes: Math.max(0, Number(payload.originalBytes) || 0),
    bytes: Math.max(0, Number(payload.bytes) || 0)
  };
}

async function compressTextToBase64(documentRef, text) {
  const view = documentRef.defaultView || window;
  if (typeof view.CompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") return null;
  const gzipStartedAt = storageClock(documentRef);
  const stream = new view.Blob([text], {type: "application/json;charset=utf-8"}).stream().pipeThrough(new view.CompressionStream("gzip"));
  const buffer = await new view.Response(stream).arrayBuffer();
  const gzipMs = elapsedMs(storageClock(documentRef), gzipStartedAt);
  const base64StartedAt = storageClock(documentRef);
  const base64 = await blobToBase64(view, new view.Blob([buffer], {type: "application/gzip"}));
  return {base64, bytes: buffer.byteLength, gzipMs, base64Ms: elapsedMs(storageClock(documentRef), base64StartedAt)};
}

function blobToBase64(view, blob) {
  if (typeof view.FileReader === "function") {
    return new Promise((resolve, reject) => {
      const reader = new view.FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = String(reader.result || "");
        const separator = dataUrl.indexOf(",");
        resolve(separator < 0 ? dataUrl : dataUrl.slice(separator + 1));
      }, {once: true});
      reader.addEventListener("error", () => reject(reader.error || new Error("浏览器存档 base64 编码失败")), {once: true});
      reader.readAsDataURL(blob);
    });
  }
  return arrayBufferToBase64(view, blob.arrayBuffer());
}

async function arrayBufferToBase64(view, bufferPromise) {
  const buffer = await bufferPromise;
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return view.btoa(binary);
}

function safeLocalStorage(view) {
  try {
    return view?.localStorage || null;
  } catch {
    return null;
  }
}

function isQuotaError(error) {
  return error?.name === "QuotaExceededError"
    || error?.code === 22
    || /quota/i.test(String(error?.message || ""));
}

function savedAtFromRaw(raw) {
  try {
    const payload = parseBrowserMapStorageEnvelope(raw);
    return payload.legacy ? "" : String(payload.savedAt || "");
  } catch {
    return "";
  }
}

function savedAtFromStoredValue(value) {
  if (isBrowserMapStorageBinaryRecord(value)) return String(value.savedAt || "");
  return savedAtFromRaw(value);
}

function createIndexedDbReadResult(value) {
  if (isBrowserMapStorageBinaryRecord(value)) {
    return {
      raw: createBrowserMapStorageBinaryImportSource(value),
      backend: "indexedDB",
      storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD,
      directBinary: true,
      metadata: {...(value.metadata || {})}
    };
  }
  return {raw: String(value || ""), backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true};
}

export function createBrowserMapStorageBinaryImportSource(record) {
  if (!isBrowserMapStorageBinaryRecord(record)) throw new Error("浏览器二进制存档记录无效");
  return {
    kind: "bytes",
    bytes: record.data,
    mimeType: "application/gzip",
    filename: "browser-storage.webfmg"
  };
}

export function isBrowserMapStorageBinaryRecord(value) {
  return value?.type === BROWSER_MAP_STORAGE_BINARY_TYPE
    && value?.version === BROWSER_MAP_STORAGE_BINARY_VERSION
    && value?.encoding === "gzip"
    && value?.data instanceof Uint8Array
    && value.data.byteLength === Number(value.bytes);
}

function createBrowserMapStorageMetadata(map) {
  return {
    seed: map?.metadata?.seed || map?.options?.seed || "",
    checksum: map?.metadata?.checksum || map?.summary?.checksum || "",
    gridCells: map?.metadata?.gridCells || map?.grid?.metadata?.actualCells || 0,
    packCells: map?.metadata?.packCells || map?.pack?.metadata?.cells || 0
  };
}

function storageClock(documentRef) {
  return typeof documentRef?.defaultView?.performance?.now === "function"
    ? documentRef.defaultView.performance.now()
    : Date.now();
}

function elapsedMs(now, startedAt) {
  return Math.max(0, Number((now - startedAt).toFixed(1)));
}

function openIndexedDb(view) {
  const indexedDB = view?.indexedDB;
  if (!indexedDB) return Promise.reject(new Error("当前浏览器不支持 IndexedDB"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BROWSER_MAP_STORAGE_FALLBACK_DB, 1);
    request.onerror = () => reject(request.error || new Error("打开 IndexedDB 存档失败"));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BROWSER_MAP_STORAGE_FALLBACK_STORE)) {
        request.result.createObjectStore(BROWSER_MAP_STORAGE_FALLBACK_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function putIndexedDbRecord(view, raw) {
  return withIndexedDbStore(view, "readwrite", store => store.put({raw, savedAt: savedAtFromStoredValue(raw), updatedAt: Date.now()}, BROWSER_MAP_STORAGE_FALLBACK_RECORD));
}

function getIndexedDbRecord(view) {
  return withIndexedDbStore(view, "readonly", store => store.get(BROWSER_MAP_STORAGE_FALLBACK_RECORD))
    .then(record => record?.raw || "");
}

function deleteIndexedDbRecord(view) {
  return withIndexedDbStore(view, "readwrite", store => store.delete(BROWSER_MAP_STORAGE_FALLBACK_RECORD));
}

function withIndexedDbStore(view, mode, action) {
  return openIndexedDb(view).then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(BROWSER_MAP_STORAGE_FALLBACK_STORE, mode);
    const request = action(transaction.objectStore(BROWSER_MAP_STORAGE_FALLBACK_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 存档操作失败"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 存档事务失败"));
    transaction.oncomplete = () => db.close();
  }));
}
