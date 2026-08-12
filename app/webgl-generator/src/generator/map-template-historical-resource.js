const MAGIC = "FMGPH01\0";
const HEADER_BYTES = 16;
const cache = new Map();

export async function loadMapTemplateHistoricalResource(resourceId, options = {}) {
  const id = String(resourceId || "").trim();
  if (!id) throw new Error("历史地图模板缺少政治资源 ID");
  const cacheKey = `${options.baseUrl || "/assets/map-templates"}/${id}`;
  if (!options.reload && cache.has(cacheKey)) return cache.get(cacheKey);
  const loading = loadResource(cacheKey, options.fetch || globalThis.fetch);
  if (!options.reload) cache.set(cacheKey, loading);
  try {
    return await loading;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

export function parseMapTemplateHistoricalResource(metadata, buffer) {
  const source = buffer instanceof ArrayBuffer ? buffer : buffer?.buffer;
  if (!(source instanceof ArrayBuffer)) throw new TypeError("历史地图模板资源必须是 ArrayBuffer");
  const view = new DataView(source, buffer?.byteOffset || 0, buffer?.byteLength || source.byteLength);
  let magic = "";
  for (let index = 0; index < 8; index++) magic += String.fromCharCode(view.getUint8(index));
  if (magic !== MAGIC) throw new Error("历史地图模板资源签名无效");
  const width = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  if (width !== metadata.width || height !== metadata.height || view.byteLength !== HEADER_BYTES + width * height) {
    throw new Error("历史地图模板资源尺寸无效");
  }
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++) mask[index] = view.getUint8(HEADER_BYTES + index);
  return Object.freeze({id: metadata.id, metadata: Object.freeze({...metadata}), width, height, mask});
}

export async function verifyMapTemplateHistoricalResourceChecksum(metadata, buffer, subtle = globalThis.crypto?.subtle) {
  if (!/^[0-9a-f]{64}$/u.test(metadata?.sha256 || "")) throw new Error("历史地图模板资源缺少有效校验和");
  const bytes = buffer instanceof ArrayBuffer
    ? buffer
    : buffer?.buffer?.slice(buffer.byteOffset || 0, (buffer.byteOffset || 0) + buffer.byteLength);
  if (!(bytes instanceof ArrayBuffer) || !subtle?.digest) throw new Error("当前环境无法校验历史地图模板资源");
  const digest = await subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== metadata.sha256) throw new Error("历史地图模板资源校验失败");
  return actual;
}

export function sampleMapTemplateHistoricalResource(resource, longitude, latitude) {
  const bounds = resource.metadata.sourceBounds;
  const x = clamp(Math.floor((longitude - bounds.west) / (bounds.east - bounds.west) * resource.width), 0, resource.width - 1);
  const y = clamp(Math.floor((bounds.north - latitude) / (bounds.north - bounds.south) * resource.height), 0, resource.height - 1);
  return resource.mask[y * resource.width + x];
}

async function loadResource(cacheKey, fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("当前环境不支持历史地图模板资源加载");
  const [metadataResponse, binaryResponse] = await Promise.all([fetchImpl(`${cacheKey}.json`), fetchImpl(`${cacheKey}.bin`)]);
  if (!metadataResponse.ok || !binaryResponse.ok) throw new Error("历史地图模板资源加载失败");
  const metadata = await metadataResponse.json();
  const buffer = await binaryResponse.arrayBuffer();
  await verifyMapTemplateHistoricalResourceChecksum(metadata, buffer);
  return parseMapTemplateHistoricalResource(metadata, buffer);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
