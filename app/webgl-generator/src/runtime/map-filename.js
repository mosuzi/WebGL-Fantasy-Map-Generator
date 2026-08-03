export const DEFAULT_MAP_NAME = "未命名地图";
export const DEFAULT_MAP_FILENAME_TEMPLATE = "{name}-{date}-{time}.{ext}";
export const MAP_ARCHIVE_EXTENSION = ".webfmg";
export const MAP_ARCHIVE_EXTENSION_TOKEN = "webfmg";
export const LEGACY_MAP_EXTENSIONS = Object.freeze([".webgl-map.json.gz", ".json.gz", ".gz", ".json"]);
export const MAP_FILENAME_TEMPLATE_TOKENS = Object.freeze(["name", "date", "time", "seed", "checksum", "ext"]);

const MAP_FILENAME_MAX_LENGTH = 180;
const TEMPLATE_TOKEN_PATTERN = /\{([^{}]+)\}/g;
const INVALID_FILENAME_PATTERN = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function normalizeMapName(value, fallback = DEFAULT_MAP_NAME) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized) return normalized.slice(0, 120);
  const normalizedFallback = String(fallback ?? "").trim().replace(/\s+/g, " ");
  return (normalizedFallback || DEFAULT_MAP_NAME).slice(0, 120);
}

export function synchronizeMapName(map, documentOptions = {}, {legacyFallback = false} = {}) {
  if (!map || typeof map !== "object") return map;
  const seed = String(map.metadata?.seed || map.options?.seed || documentOptions?.seed || "").trim();
  const explicitName = map.metadata?.name ?? map.options?.mapName ?? documentOptions?.mapName;
  const name = normalizeMapName(explicitName, legacyFallback && seed ? seed : DEFAULT_MAP_NAME);
  map.metadata = {...(map.metadata || {}), name};
  map.options = {...(map.options || {}), mapName: name};
  return map;
}

export function mapBaseFilename(map) {
  const name = normalizeMapName(map?.metadata?.name ?? map?.options?.mapName, map?.metadata?.seed || map?.options?.seed || DEFAULT_MAP_NAME);
  return sanitizeFilenamePart(name) || "map";
}

export function createMapArchiveFilename(map, options = {}) {
  return renderMapFilenameTemplate(options.template, {
    name: map?.metadata?.name ?? map?.options?.mapName,
    seed: map?.metadata?.seed ?? map?.options?.seed,
    checksum: map?.metadata?.checksum ?? map?.summary?.checksum,
    now: options.now
  });
}

export function renderMapFilenameTemplate(template, context = {}) {
  const source = String(template ?? "").trim() || DEFAULT_MAP_FILENAME_TEMPLATE;
  const unknownTokens = [...source.matchAll(TEMPLATE_TOKEN_PATTERN)]
    .map(match => match[1])
    .filter(token => !MAP_FILENAME_TEMPLATE_TOKENS.includes(token));
  if (unknownTokens.length) throw new Error(`未知的文件名模板变量：${[...new Set(unknownTokens)].map(token => `{${token}}`).join("、")}`);

  const now = validDate(context.now) ? context.now : new Date();
  const values = {
    name: normalizeMapName(context.name, context.seed || DEFAULT_MAP_NAME),
    date: localDateToken(now),
    time: localTimeToken(now),
    seed: String(context.seed || "").trim() || "seed",
    checksum: String(context.checksum || "").trim() || "checksum",
    ext: MAP_ARCHIVE_EXTENSION_TOKEN
  };
  const rendered = source.replace(TEMPLATE_TOKEN_PATTERN, (_match, token) => values[token]);
  return ensureMapArchiveExtension(sanitizeFilename(rendered));
}

export function ensureMapArchiveExtension(filename) {
  const base = sanitizeFilename(stripMapDocumentExtension(String(filename || ""))) || "map";
  const maxBaseLength = MAP_FILENAME_MAX_LENGTH - MAP_ARCHIVE_EXTENSION.length;
  return `${base.slice(0, maxBaseLength).replace(/[. ]+$/g, "") || "map"}${MAP_ARCHIVE_EXTENSION}`;
}

export function isMapDocumentFilename(filename) {
  const value = String(filename || "").trim().toLowerCase();
  return value.endsWith(MAP_ARCHIVE_EXTENSION) || LEGACY_MAP_EXTENSIONS.some(extension => value.endsWith(extension));
}

export function isCompressedMapDocumentFilename(filename) {
  const value = String(filename || "").trim().toLowerCase();
  return value.endsWith(MAP_ARCHIVE_EXTENSION) || value.endsWith(".gz");
}

export function stripMapDocumentExtension(filename) {
  const source = String(filename || "").trim();
  const lower = source.toLowerCase();
  for (const extension of [MAP_ARCHIVE_EXTENSION, ...LEGACY_MAP_EXTENSIONS]) {
    if (lower.endsWith(extension)) return source.slice(0, -extension.length);
  }
  return source;
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(INVALID_FILENAME_PATTERN, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[. ]+|[. ]+$/g, "") || "map";
}

function sanitizeFilenamePart(value) {
  return stripMapDocumentExtension(sanitizeFilename(value)).slice(0, MAP_FILENAME_MAX_LENGTH).replace(/[. ]+$/g, "");
}

function localDateToken(date) {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function localTimeToken(date) {
  return [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join("-");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function validDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}
