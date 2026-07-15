import {decompressGzipBase64Text} from "./map-file-io.js";

export const BROWSER_MAP_STORAGE_KEY = "webgl-generator-current-map-v1";
export const BROWSER_MAP_STORAGE_TYPE = "webgl-generator-local-map-storage";
export const BROWSER_MAP_STORAGE_VERSION = 1;

export async function encodeBrowserMapStoragePayload(documentRef, text, map) {
  const compressed = await compressTextToBase64(documentRef, text);
  const encoded = compressed
    ? {encoding: "gzip-base64", data: compressed.base64, bytes: compressed.bytes}
    : {encoding: "plain", data: text, bytes: text.length};
  return createBrowserMapStorageEnvelope(text, map, encoded);
}

export async function decodeBrowserMapStoragePayload(documentRef, raw) {
  const envelope = parseBrowserMapStorageEnvelope(raw);
  if (envelope.legacy) return envelope.text;
  if (envelope.encoding === "gzip-base64") return decompressGzipBase64Text(documentRef, envelope.data);
  return envelope.data;
}

export function createBrowserMapStorageEnvelope(text, map, encoded = {}) {
  const encoding = encoded.encoding === "gzip-base64" ? "gzip-base64" : "plain";
  const data = String(encoded.data ?? text ?? "");
  return {
    type: BROWSER_MAP_STORAGE_TYPE,
    version: BROWSER_MAP_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    originalBytes: String(text || "").length,
    metadata: {
      seed: map?.metadata?.seed || map?.options?.seed || "",
      checksum: map?.metadata?.checksum || map?.summary?.checksum || "",
      gridCells: map?.metadata?.gridCells || map?.grid?.metadata?.actualCells || 0,
      packCells: map?.metadata?.packCells || map?.pack?.metadata?.cells || 0
    },
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
  const stream = new view.Blob([text], {type: "application/json;charset=utf-8"}).stream().pipeThrough(new view.CompressionStream("gzip"));
  const buffer = await new view.Response(stream).arrayBuffer();
  return {base64: arrayBufferToBase64(view, buffer), bytes: buffer.byteLength};
}

function arrayBufferToBase64(view, buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return view.btoa(binary);
}
