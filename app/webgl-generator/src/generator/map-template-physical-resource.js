const RESOURCE_MAGIC = "FMGPT02\0";
const RESOURCE_HEADER_BYTES = 16;
const cache = new Map();

export async function loadMapTemplatePhysicalResource(resourceId, options = {}) {
  const id = String(resourceId || "").trim();
  if (!id) throw new Error("地图模板缺少物理资源 ID");
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

export function parseMapTemplatePhysicalResource(metadata, buffer) {
  const source = buffer instanceof ArrayBuffer ? buffer : buffer?.buffer;
  if (!(source instanceof ArrayBuffer)) throw new TypeError("地图模板物理资源必须是 ArrayBuffer");
  const view = new DataView(source, buffer?.byteOffset || 0, buffer?.byteLength || source.byteLength);
  let magic = "";
  for (let index = 0; index < 8; index++) magic += String.fromCharCode(view.getUint8(index));
  if (magic !== RESOURCE_MAGIC) throw new Error("地图模板物理资源签名无效");
  const width = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  if (width !== metadata.width || height !== metadata.height) throw new Error("地图模板物理资源尺寸与 manifest 不一致");
  const cells = width * height;
  const expectedBytes = RESOURCE_HEADER_BYTES + cells * 4;
  if (view.byteLength !== expectedBytes || metadata.byteLength !== expectedBytes) throw new Error("地图模板物理资源长度无效");
  const elevations = new Int16Array(cells);
  const landMask = new Uint8Array(cells);
  const hydrologyMask = new Uint8Array(cells);
  for (let index = 0; index < cells; index++) elevations[index] = view.getInt16(RESOURCE_HEADER_BYTES + index * 2, true);
  const maskOffset = RESOURCE_HEADER_BYTES + cells * 2;
  for (let index = 0; index < cells; index++) landMask[index] = view.getUint8(maskOffset + index);
  const hydrologyOffset = maskOffset + cells;
  for (let index = 0; index < cells; index++) hydrologyMask[index] = view.getUint8(hydrologyOffset + index);
  return Object.freeze({id: metadata.id, metadata: Object.freeze({...metadata}), width, height, elevations, landMask, hydrologyMask});
}

export async function verifyMapTemplatePhysicalResourceChecksum(metadata, buffer, subtle = globalThis.crypto?.subtle) {
  if (!/^[0-9a-f]{64}$/u.test(metadata?.sha256 || "")) throw new Error("地图模板物理资源缺少有效校验和");
  if (!subtle?.digest) throw new Error("当前环境无法校验地图模板物理资源");
  const bytes = buffer instanceof ArrayBuffer
    ? buffer
    : buffer?.buffer?.slice(buffer.byteOffset || 0, (buffer.byteOffset || 0) + buffer.byteLength);
  if (!(bytes instanceof ArrayBuffer)) throw new TypeError("地图模板物理资源必须是 ArrayBuffer");
  const digest = await subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== metadata.sha256) throw new Error("地图模板物理资源校验失败");
  return actual;
}

export function sampleMapTemplatePhysicalResource(resource, longitude, latitude) {
  const x = wrapIndex(Math.floor((normalizeLongitude(longitude) + 180) / 360 * resource.width), resource.width);
  const y = clampIndex(Math.floor((90 - Number(latitude)) / 180 * resource.height), resource.height);
  const index = y * resource.width + x;
  return {elevation: resource.elevations[index], land: resource.landMask[index] === 1, x, y};
}

export function clearMapTemplatePhysicalResourceCache() {
  cache.clear();
}

async function loadResource(cacheKey, fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("当前环境不支持地图模板资源加载");
  const [metadataResponse, binaryResponse] = await Promise.all([
    fetchImpl(`${cacheKey}.json`),
    fetchImpl(`${cacheKey}.bin`)
  ]);
  if (!metadataResponse.ok) throw new Error(`地图模板 metadata 加载失败：${metadataResponse.status}`);
  if (!binaryResponse.ok) throw new Error(`地图模板物理资源加载失败：${binaryResponse.status}`);
  const metadata = await metadataResponse.json();
  const buffer = await binaryResponse.arrayBuffer();
  await verifyMapTemplatePhysicalResourceChecksum(metadata, buffer);
  return parseMapTemplatePhysicalResource(metadata, buffer);
}

function normalizeLongitude(value) {
  const longitude = Number(value);
  if (!Number.isFinite(longitude)) return 0;
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function wrapIndex(value, length) {
  return ((value % length) + length) % length;
}

function clampIndex(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}
