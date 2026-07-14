import {MAP_DOCUMENT_TYPE, MAP_DOCUMENT_VERSION, MAP_SCHEMA_VERSION} from "./map-file-io.js";

export const MAP_IMPORT_DIAGNOSTIC_TYPE = "webgl-generator-map-import-diagnostic";
export const MAP_IMPORT_DIAGNOSTIC_VERSION = 1;

export function createMapImportDiagnostic(error, file = null, options = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const classification = classifyMapImportError(message);
  return {
    type: MAP_IMPORT_DIAGNOSTIC_TYPE,
    version: MAP_IMPORT_DIAGNOSTIC_VERSION,
    occurredAt: options.occurredAt || new Date().toISOString(),
    source: options.source || "file",
    expected: {documentType: MAP_DOCUMENT_TYPE, documentVersion: MAP_DOCUMENT_VERSION, mapSchemaVersion: MAP_SCHEMA_VERSION},
    file: {
      name: file?.name || "",
      size: Math.max(0, Number(file?.size) || 0),
      mimeType: file?.type || "",
      inferredFormat: inferMapImportFileKind(file)
    },
    error: {
      name: error?.name || typeof error,
      message,
      ...classification
    }
  };
}

export function formatMapImportDiagnosticLines(diagnostic) {
  return [
    `诊断代码：${diagnostic.error.code}`,
    `失败阶段：${diagnostic.error.stage}`,
    `文件：${diagnostic.file.name || "未命名文件"}`,
    `大小：${formatBytes(diagnostic.file.size)}`,
    `MIME：${diagnostic.file.mimeType || "未提供"}`,
    `推断格式：${diagnostic.file.inferredFormat}`,
    `错误类型：${diagnostic.error.name}`,
    `错误信息：${diagnostic.error.message}`,
    `建议：${diagnostic.error.suggestion}`
  ];
}

export function stringifyMapImportDiagnostic(diagnostic) {
  return JSON.stringify(diagnostic, null, 2);
}

export function classifyMapImportError(message) {
  const text = String(message || "");
  if (/不是当前地图保存格式/.test(text)) return classified("wrong-document-type", "validate-document", "请确认文件来自“导出 / 地图数据”或“导出 / 压缩地图数据”。");
  if (/暂不支持的地图格式版本/.test(text)) return classified("unsupported-version", "migrate-document", "请使用当前版本导出的地图文件，或先用支持该版本的生成器完成转换。");
  if (/schema 标记|存储不完整|隐藏表不完整|缺少 .*存储/.test(text)) return classified("invalid-schema", "validate-schema", "文件已声明为当前版本但字段不完整；请重新导出原文件或保留诊断交给开发者检查。");
  if (/缺少 map 数据/.test(text)) return classified("missing-map", "validate-document", "地图文档缺少 map 主体，请重新导出完整地图数据。");
  if (/无法读取 typed array/.test(text)) return classified("unsupported-typed-array", "decode-map", "文件包含当前环境无法恢复的 typed array 类型，请使用原导出环境重新保存。");
  if (/Unexpected|JSON|position|token/i.test(text)) return classified("invalid-json", "parse-json", "文件内容不是有效 JSON；若文件以 .gz 结尾，请确认它确实为 gzip 压缩文件。");
  if (/不支持读取压缩地图文件|不支持.*DecompressionStream/i.test(text)) return classified("unsupported-decompression", "decompress", "当前浏览器缺少压缩流能力；请改用未压缩 .webgl-map.json，或升级浏览器后重试。");
  if (/压缩|Decompression|gzip|incorrect header|unexpected end of file|invalid distance/i.test(text)) return classified("invalid-gzip", "decompress", "请确认压缩文件未损坏，并且浏览器支持 DecompressionStream。");
  return classified("unknown-import-error", "import-runtime", "请保留并导出此诊断，再尝试重新导入原始 .webgl-map.json 或 .webgl-map.json.gz 文件。");
}

function classified(code, stage, suggestion) {
  return {code, stage, suggestion};
}

function inferMapImportFileKind(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (name.endsWith(".gz") || type.includes("gzip") || type === "application/x-gzip") return "gzip 压缩地图 JSON";
  if (!name && !type) return "API 地图文档";
  return "地图 JSON";
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${Math.round(value)}B`;
}
