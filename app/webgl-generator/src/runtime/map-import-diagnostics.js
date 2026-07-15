import {MAP_DOCUMENT_TYPE, MAP_DOCUMENT_VERSION, MAP_SCHEMA_VERSION} from "./map-file-io.js";

export const MAP_IMPORT_DIAGNOSTIC_TYPE = "webgl-generator-map-import-diagnostic";
export const MAP_IMPORT_DIAGNOSTIC_VERSION = 2;

const IMPORT_KIND_LABELS = Object.freeze({
  map: "完整地图",
  geojson: "普通 GEO",
  "fmg-cells-geojson": "FMG Cells GEO",
  heightmap: "高度图"
});

export function createMapImportDiagnostic(error, file = null, options = {}) {
  return createImportDiagnostic({kind: "map", status: "failed", error, file, ...options});
}

export function createImportSuccessDiagnostic(kind, file = null, summary = {}, options = {}) {
  return createImportDiagnostic({kind, status: "success", file, summary, ...options});
}

export function createImportFailureDiagnostic(kind, error, file = null, summary = {}, options = {}) {
  return createImportDiagnostic({kind, status: "failed", error, file, summary, ...options});
}

export function createImportDiagnostic(options = {}) {
  const kind = IMPORT_KIND_LABELS[options.kind] ? options.kind : "map";
  const status = options.status === "success" ? "success" : "failed";
  const message = options.error instanceof Error ? options.error.message : String(options.error || "");
  const classification = status === "failed"
    ? options.error?.code
      ? classified(String(options.error.code), String(options.error.stage || "import-runtime"), String(options.error.suggestion || defaultSuggestion(kind)))
      : classifyImportError(kind, message)
    : null;
  const safeMessage = status === "failed" ? sanitizeDiagnosticErrorMessage(kind, message, classification) : "";
  return {
    type: MAP_IMPORT_DIAGNOSTIC_TYPE,
    version: MAP_IMPORT_DIAGNOSTIC_VERSION,
    occurredAt: options.occurredAt || new Date().toISOString(),
    source: options.source || "file",
    import: {kind, label: IMPORT_KIND_LABELS[kind], status},
    expected: {documentType: MAP_DOCUMENT_TYPE, documentVersion: MAP_DOCUMENT_VERSION, mapSchemaVersion: MAP_SCHEMA_VERSION},
    file: sanitizeImportFileSummary(options.file),
    summary: sanitizeDiagnosticSummary(options.summary),
    error: status === "failed" ? {
      name: options.error?.name || typeof options.error,
      message: safeMessage,
      ...classification
    } : null
  };
}

export function attachImportDiagnostic(error, diagnostic) {
  const target = error instanceof Error ? error : new Error(String(error));
  if (diagnostic?.error) {
    target.code = diagnostic.error.code;
    target.stage = diagnostic.error.stage;
    target.suggestion = diagnostic.error.suggestion;
  }
  target.importDiagnostic = diagnostic;
  return target;
}

export function inspectGeoImportSource(document) {
  let parsed;
  try {
    parsed = typeof document === "string" ? JSON.parse(document) : document;
  } catch (error) {
    throw diagnosticError(error, "invalid-json", "parse-json", "GEO 内容不是有效 JSON，请重新导出源文件。");
  }
  if (!parsed || typeof parsed !== "object" || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw diagnosticError(new Error("GEO 文档必须是包含 features 的 FeatureCollection"), "invalid-geo-document", "validate-document", "请提供标准 GeoJSON FeatureCollection。");
  }
  if (!parsed.features.length) throw diagnosticError(new Error("GEO 数据中没有 Feature"), "empty-feature-collection", "validate-features", "请确认导出时至少包含一个几何要素。");
  const geometryTypes = {};
  let coordinatePairs = 0;
  let invalidGeometries = 0;
  const bbox = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
  for (const feature of parsed.features) {
    const type = String(feature?.geometry?.type || "missing");
    geometryTypes[type] = (geometryTypes[type] || 0) + 1;
    if (!feature?.geometry?.coordinates) invalidGeometries += 1;
    forEachCoordinate(feature?.geometry?.coordinates, coordinate => {
      const x = Number(coordinate[0]);
      const y = Number(coordinate[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      coordinatePairs += 1;
      bbox.minX = Math.min(bbox.minX, x);
      bbox.minY = Math.min(bbox.minY, y);
      bbox.maxX = Math.max(bbox.maxX, x);
      bbox.maxY = Math.max(bbox.maxY, y);
    });
  }
  const cellsCandidate = looksLikeCellsCollection(parsed.features);
  if (cellsCandidate) validateCellsFields(parsed.features);
  if (!coordinatePairs || invalidGeometries === parsed.features.length) {
    throw diagnosticError(new Error("GEO 数据没有有效几何坐标"), "invalid-geometry", "validate-geometry", "请检查 geometry.type 与 coordinates 是否完整且为有限数值。");
  }
  return {
    kind: cellsCandidate ? "fmg-cells-geojson" : "geojson",
    summary: {
      sourceType: parsed.type,
      features: parsed.features.length,
      geometryTypes,
      invalidGeometries,
      coordinatePairs,
      bbox: Object.values(bbox).every(Number.isFinite) ? bbox : null,
      ...(cellsCandidate ? cellsFieldSummary(parsed.features) : {})
    }
  };
}

export function createHeightmapSourceSummary(file, settings = {}, source = {}) {
  return sanitizeDiagnosticSummary({
    image: {
      width: finiteNonNegative(source.width),
      height: finiteNonNegative(source.height),
      kind: source.kind || settings.kind || "image-grayscale",
      fitMode: source.fitMode || settings.fitMode || "stretch",
      mappingMode: source.mappingMode || settings.mappingMode || "grayscale",
      invert: Boolean(source.invert ?? settings.invert)
    }
  });
}

export function formatMapImportDiagnosticLines(diagnostic) {
  const lines = [
    `导入类型：${diagnostic.import?.label || "完整地图"}`,
    `结果：${diagnostic.import?.status === "success" ? "成功" : "失败"}`,
    `文件：${diagnostic.file.name || "未命名文件"}`,
    `大小：${formatBytes(diagnostic.file.size)}`,
    `MIME：${diagnostic.file.mimeType || "未提供"}`,
    `推断格式：${diagnostic.file.inferredFormat}`
  ];
  if (diagnostic.error) lines.push(
    `诊断代码：${diagnostic.error.code}`,
    `失败阶段：${diagnostic.error.stage}`,
    `错误类型：${diagnostic.error.name}`,
    `错误信息：${diagnostic.error.message}`,
    `建议：${diagnostic.error.suggestion}`
  );
  return lines;
}

export function stringifyMapImportDiagnostic(diagnostic) {
  return JSON.stringify(diagnostic, null, 2);
}

export function classifyMapImportError(message) {
  return classifyImportError("map", message);
}

export function classifyImportError(kind, message) {
  const text = String(message || "");
  if (/不是当前地图保存格式/.test(text)) return classified("wrong-document-type", "validate-document", "请确认文件来自“导出 / 地图数据”或“导出 / 压缩地图数据”。");
  if (/暂不支持的地图格式版本|未知未来版本/.test(text)) return classified("unsupported-version", "migrate-document", "请使用当前版本导出的文件，或先用支持该版本的生成器完成转换。");
  if (/schema 标记|存储不完整|隐藏表不完整|缺少 .*存储/.test(text)) return classified("invalid-schema", "validate-schema", "文件已声明为当前版本但字段不完整；请重新导出原文件或保留诊断交给开发者检查。");
  if (/缺少 map 数据/.test(text)) return classified("missing-map", "validate-document", "地图文档缺少 map 主体，请重新导出完整地图数据。");
  if (/无法读取 typed array/.test(text)) return classified("unsupported-typed-array", "decode-map", "文件包含当前环境无法恢复的 typed array 类型，请使用原导出环境重新保存。");
  if (/Unexpected|JSON|position|token/i.test(text)) return classified("invalid-json", "parse-json", kind === "map" ? "文件内容不是有效 JSON；若文件以 .gz 结尾，请确认它确实为 gzip 压缩文件。" : "导入内容不是有效 JSON，请重新导出源文件。");
  if (/不支持读取压缩地图文件|不支持.*DecompressionStream/i.test(text)) return classified("unsupported-decompression", "decompress", "当前浏览器缺少压缩流能力；请改用未压缩地图文件，或升级浏览器后重试。");
  if (/压缩|Decompression|gzip|incorrect header|unexpected end of file|invalid distance/i.test(text)) return classified("invalid-gzip", "decompress", "请确认压缩文件未损坏，并且浏览器支持 DecompressionStream。");
  if (kind === "heightmap") {
    if (/请选择|图片文件|格式/.test(text)) return classified("invalid-image-file", "validate-image", "请选择浏览器支持且未损坏的 PNG、JPEG、WebP 或 BMP 图片。");
    if (/图片读取失败|读取图片像素|无法读取图片像素/.test(text)) return classified("image-decode-failed", "decode-image", "请确认图片未损坏、尺寸有效且浏览器可以解码该格式。");
    return classified("heightmap-runtime-error", "import-runtime", defaultSuggestion(kind));
  }
  if (kind === "fmg-cells-geojson") {
    if (/字段|neighbors|height|biome|id/.test(text)) return classified("invalid-cells-fields", "validate-fields", "请从原版 FMG 重新导出 Cells GeoJSON，并保留 id、height、biome 与 neighbors 字段。");
    if (/几何|坐标|Polygon/.test(text)) return classified("invalid-geometry", "validate-geometry", "请确认每个 Cells Feature 都包含有效 Polygon 坐标。");
  }
  if (kind === "geojson") {
    if (/FeatureCollection|Feature/.test(text)) return classified("invalid-geo-document", "validate-document", "请提供至少包含一个 Feature 的标准 GeoJSON FeatureCollection。");
    if (/几何|坐标|转换为测量对象/.test(text)) return classified("invalid-geometry", "validate-geometry", "请检查 GeoJSON 几何类型和坐标是否可转换。");
  }
  return classified("unknown-import-error", "import-runtime", defaultSuggestion(kind));
}

function looksLikeCellsCollection(features) {
  const sample = features.slice(0, Math.min(80, features.length));
  if (features.length < 100) return false;
  const polygonRatio = sample.filter(feature => feature?.geometry?.type === "Polygon").length / Math.max(1, sample.length);
  const cellsHints = sample.filter(feature => "height" in (feature?.properties || {}) || "neighbors" in (feature?.properties || {}) || "biome" in (feature?.properties || {})).length;
  return polygonRatio >= 0.75 && cellsHints >= Math.max(10, sample.length * 0.5);
}

function validateCellsFields(features) {
  const summary = cellsFieldSummary(features);
  if (summary.validFieldRows < Math.max(100, Math.ceil(features.length * 0.75))) {
    throw diagnosticError(new Error("FMG Cells GEO 的 id、height、biome 或 neighbors 字段不完整"), "invalid-cells-fields", "validate-fields", "请从原版 FMG 重新导出 Cells GeoJSON，并保留 id、height、biome 与 neighbors 字段。");
  }
}

function cellsFieldSummary(features) {
  let validFieldRows = 0;
  let landCells = 0;
  let waterCells = 0;
  for (const feature of features) {
    const properties = feature?.properties || {};
    if (Number.isFinite(Number(properties.id)) && Number.isFinite(Number(properties.height)) && Number.isFinite(Number(properties.biome)) && Array.isArray(properties.neighbors)) validFieldRows += 1;
    const height = Number(properties.height);
    if (!Number.isFinite(height)) continue;
    if (height >= 20) landCells += 1;
    else waterCells += 1;
  }
  return {validFieldRows, landCells, waterCells};
}

function diagnosticError(error, code, stage, suggestion) {
  error.code = code;
  error.stage = stage;
  error.suggestion = suggestion;
  throw error;
}

function forEachCoordinate(value, callback) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    callback(value);
    return;
  }
  for (const item of value) forEachCoordinate(item, callback);
}

function sanitizeImportFileSummary(file) {
  const name = String(file?.name || "");
  const mimeType = String(file?.type || file?.mimeType || "");
  return {
    name,
    size: Math.max(0, Number(file?.size) || 0),
    mimeType,
    inferredFormat: inferMapImportFileKind({name, type: mimeType})
  };
}

function sanitizeDiagnosticSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
  return JSON.parse(JSON.stringify(summary, (_key, value) => typeof value === "string" && value.length > 240 ? `${value.slice(0, 240)}…` : value));
}

function sanitizeDiagnosticErrorMessage(kind, message, classification) {
  if (classification?.code === "invalid-json") return `${IMPORT_KIND_LABELS[kind]}内容不是有效 JSON`;
  const text = String(message || "导入失败").replace(/[\r\n\t]+/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function classified(code, stage, suggestion) {
  return {code, stage, suggestion};
}

function defaultSuggestion(kind) {
  if (kind === "heightmap") return "请保留并导出此诊断，再尝试使用未损坏的本地图片重新导入。";
  if (kind === "geojson" || kind === "fmg-cells-geojson") return "请保留并导出此诊断，再检查 GeoJSON 类型、字段和几何后重试。";
  return "请保留并导出此诊断，再尝试重新导入原始地图文件。";
}

function inferMapImportFileKind(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (name.endsWith(".gz") || type.includes("gzip") || type === "application/x-gzip") return "gzip 压缩地图 JSON";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(name)) return "高度图图片";
  if (/\.(geo)?json$/i.test(name) || type.includes("geo+json")) return "GeoJSON";
  if (!name && !type) return "API 文档";
  return "地图 JSON";
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${Math.round(value)}B`;
}
