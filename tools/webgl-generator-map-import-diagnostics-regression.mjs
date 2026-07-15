#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  MAP_IMPORT_DIAGNOSTIC_TYPE,
  classifyMapImportError,
  createMapImportDiagnostic,
  formatMapImportDiagnosticLines,
  stringifyMapImportDiagnostic
} from "../app/webgl-generator/src/runtime/map-import-diagnostics.js";

const cases = [
  ["文件不是当前地图保存格式", "wrong-document-type", "validate-document"],
  ["暂不支持的地图格式版本：99", "unsupported-version", "migrate-document"],
  ["地图数据的 labels 隐藏表不完整", "invalid-schema", "validate-schema"],
  ["地图文件缺少 map 数据", "missing-map", "validate-document"],
  ["无法读取 typed array：MysteryArray", "unsupported-typed-array", "decode-map"],
  ["Unexpected token } in JSON at position 8", "invalid-json", "parse-json"],
  ["当前浏览器不支持读取压缩地图文件", "unsupported-decompression", "decompress"],
  ["incorrect header check", "invalid-gzip", "decompress"],
  ["renderer load failed", "unknown-import-error", "import-runtime"]
];

for (const [message, code, stage] of cases) {
  assert.deepEqual(classifyMapImportError(message), {
    code,
    stage,
    suggestion: classifyMapImportError(message).suggestion
  });
  assert.ok(classifyMapImportError(message).suggestion.length > 8);
}

const file = {name: "broken.webgl-map.json.gz", size: 4096, type: "application/gzip"};
const diagnostic = createMapImportDiagnostic(new SyntaxError("Unexpected token } in JSON"), file, {
  source: "file",
  occurredAt: "2026-07-14T00:00:00.000Z"
});
assert.equal(diagnostic.type, MAP_IMPORT_DIAGNOSTIC_TYPE);
assert.equal(diagnostic.version, 1);
assert.equal(diagnostic.expected.documentType, "webgl-generator-map");
assert.equal(diagnostic.expected.documentVersion, 2);
assert.equal(diagnostic.expected.mapSchemaVersion, 2);
assert.equal(diagnostic.file.inferredFormat, "gzip 压缩地图 JSON");
assert.equal(diagnostic.error.code, "invalid-json");
assert.ok(formatMapImportDiagnosticLines(diagnostic).some(line => line === "诊断代码：invalid-json"));
assert.ok(formatMapImportDiagnosticLines(diagnostic).at(-1).startsWith("建议："));
assert.equal(JSON.parse(stringifyMapImportDiagnostic(diagnostic)).file.size, 4096);

const [appSource, panelSource, controlPanelSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8")
]);
assert.match(appSource, /lastMapImportDiagnostic:\s*null/);
assert.match(appSource, /reportMapImportError\(state, documentRef, error,/);
assert.match(appSource, /const source = options\.source === "ui" \? "ui" : "api"/);
assert.match(appSource, /exportImportDiagnostic:/);
assert.match(appSource, /exportMapImportDiagnosticViaApi/);
assert.match(appSource, /downloadText\(documentRef, text, filename/);
assert.match(panelSource, /export-map-import-diagnostic/);
assert.match(controlPanelSource, /id="export-map-import-diagnostic"[^>]*hidden/);

console.log(JSON.stringify({
  ok: true,
  categories: cases.length,
  diagnosticType: diagnostic.type,
  documentVersion: diagnostic.expected.documentVersion,
  mapSchemaVersion: diagnostic.expected.mapSchemaVersion,
  exportWired: true
}, null, 2));
