import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {
  createHeightTerrainTemplateDocument,
  getHeightTerrainTemplateProgramChanges,
  HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_TYPE,
  HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_VERSION,
  HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS,
  heightTerrainTemplateProgramUsesSeed,
  inspectHeightTerrainTemplateProgram,
  loadHeightTerrainTemplateDocument,
  parseHeightTerrainTemplateDocument,
  saveHeightTerrainTemplateDocument,
  SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY,
  stringifyHeightTerrainTemplateDocument
} from "../app/webgl-generator/src/runtime/height-terrain-template-programs.js";

const allCells = new Set(Array.from({length: 25}, (_, index) => index));
const program = HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS[0];
const map = createSquareMap(5, (x, y) => 35 + x * 3 + y * 2);
const options = {scope: "land", seed: 41, allowedCells: allCells};
const preview = inspectHeightTerrainTemplateProgram(map, program, options);
const changes = getHeightTerrainTemplateProgramChanges(map, program, options);
const repeated = getHeightTerrainTemplateProgramChanges(map, program, options);
const nextSeed = getHeightTerrainTemplateProgramChanges(map, program, {...options, seed: 42});

assert(preview.valid && preview.stepCount === 3 && preview.changeCount === changes.length, `多步骤预览异常：${JSON.stringify(preview)}`);
assert.match(preview.changeChecksum, /^[0-9a-f]{8}$/, "多步骤预览必须提供有界 changes 校验值");
assert(!Object.hasOwn(preview, "changes"), "公开多步骤预览不得暴露完整 changes");
assert.deepEqual(changes, repeated, "固定模板相同 seed 必须可复现");
assert.notDeepEqual(changes, nextSeed, "含破碎步骤的固定模板更换 seed 后应改变形态");
assert(heightTerrainTemplateProgramUsesSeed(program), "含破碎步骤的模板必须声明使用 seed");

const history = new EditHistory();
const before = Array.from(map.grid.cells.h);
history.execute(createApplyHeightBrushCommand(changes, {label: program.name}), {map});
assert.equal(history.getStats().undo, 1, "多步骤模板必须只形成一条历史");
assert.deepEqual(Array.from(map.grid.cells.h), changesApplied(before, changes), "实际应用结果必须与预览 changes 一致");
history.undo({map});
assert.deepEqual(Array.from(map.grid.cells.h), before, "撤销必须恢复多步骤模板前高度");
history.redo({map});
assert.deepEqual(Array.from(map.grid.cells.h), changesApplied(before, changes), "重做必须复现多步骤模板结果");

const userTemplate = {
  id: "user-test-template",
  name: "用户测试模板",
  description: "往返样本",
  steps: [
    {operation: "source-add", value: 5, range: "land"},
    {operation: "rugged", intensity: 0.35, amplitude: 6, seedOffset: 9},
    {operation: "source-smooth", factor: 2, iterations: 1}
  ]
};
const document = createHeightTerrainTemplateDocument([userTemplate]);
const serialized = stringifyHeightTerrainTemplateDocument(document.templates);
const parsed = parseHeightTerrainTemplateDocument(serialized);
assert.equal(parsed.documentType, HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_TYPE);
assert.equal(parsed.version, HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_VERSION);
assert.deepEqual(parsed, document, "用户模板导出再导入必须保持规范化结果一致");
const storageData = new Map();
const storage = {
  getItem: key => storageData.get(key) || null,
  setItem: (key, value) => storageData.set(key, value)
};
saveHeightTerrainTemplateDocument(storage, parsed.templates);
assert.deepEqual(loadHeightTerrainTemplateDocument(storage), parsed, "用户模板保存与恢复必须保持文档一致");

const roundtripMap = createSquareMap(5, (x, y) => 30 + x + y);
const roundtripOptions = {scope: "land", seed: 77, allowedCells: allCells};
assert.deepEqual(
  getHeightTerrainTemplateProgramChanges(roundtripMap, document.templates[0], roundtripOptions),
  getHeightTerrainTemplateProgramChanges(roundtripMap, parsed.templates[0], roundtripOptions),
  "用户模板往返前后执行结果必须一致"
);

const untouched = Array.from(roundtripMap.grid.cells.h);
assert.throws(
  () => parseHeightTerrainTemplateDocument({...document, version: 99}),
  /不支持地形模板文档版本/,
  "未来版本必须拒绝"
);
assert.throws(
  () => parseHeightTerrainTemplateDocument({...document, templates: [{...userTemplate, steps: [{operation: "unknown"}]}]}),
  /操作未知/,
  "未知步骤必须拒绝"
);
assert.deepEqual(Array.from(roundtripMap.grid.cells.h), untouched, "坏版本或坏步骤不得改变地图");

assert.deepEqual(SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY.exact, ["Add", "Multiply", "Smooth"]);
assert(SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY.converted.includes("Range") && SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY.unsupported.includes("Strait"));
const sourceProgram = HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS.find(item => item.id === "source-archipelago-converted");
assert(sourceProgram?.source?.templateId === "archipelago" && sourceProgram.source.unsupportedOperations.includes("Strait"), "Source 群岛转换样本元数据不完整");
const sourceMap = createSquareMap(5, () => 30);
const sourceChanges = getHeightTerrainTemplateProgramChanges(sourceMap, sourceProgram, {scope: "land", seed: 19, allowedCells: allCells});
assert(sourceChanges.length === 25 && sourceChanges.some(change => change.after !== 41), "Source 群岛转换样本没有执行完整转换程序");
assert.deepEqual(
  sourceChanges,
  getHeightTerrainTemplateProgramChanges(sourceMap, sourceProgram, {scope: "land", seed: 19, allowedCells: allCells}),
  "Source 转换样本必须可复现"
);

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../app/webgl-generator/src/ui/panels/height-panel.js", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8");
const programApplySource = sourceBetween(appSource, "onTerrainProgramApply:", "onConditionalTransformPreview:");
assert.match(appSource, /onTerrainProgramPreview:[\s\S]*?inspectHeightTerrainTemplateProgram[\s\S]*?setHeightTransformPreview/, "多步骤模板预览必须接入地图预览 mesh");
assert.match(programApplySource, /createApplyHeightBrushCommand\(changes, \{label: reserved\.program\.name\}\)/, "多步骤模板必须复用统一高度命令");
assert.equal((programApplySource.match(/executeEditCommand\(/g) || []).length, 1, "多步骤模板应用只能提交一次历史命令");
assert.match(panelSource, /loadHeightTerrainTemplateDocument[\s\S]*?saveHeightTerrainTemplateDocument/, "用户模板必须接入版本化 LocalStorage 文档");
assert.match(panelSource, /parseHeightTerrainTemplateDocument\(text\)[\s\S]*?persistUserTerrainPrograms/, "导入必须先完整校验再持久化");
assert.match(componentSource, /多步骤地形模板[\s\S]*?预览程序[\s\S]*?应用程序/, "高度面板必须提供多步骤预览与应用入口");
assert.match(componentSource, /加入当前步骤[\s\S]*?保存模板[\s\S]*?用户地形模板导入导出/, "高度面板必须提供编排、保存和交换入口");

console.log(JSON.stringify({
  presets: HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS.map(item => item.id),
  deterministicChanges: changes.length,
  previewMatchesChanges: preview.changeCount === changes.length,
  singleHistoryEntry: history.getStats().undo,
  roundtripTemplates: parsed.templates.length,
  sourceConvertedChanges: sourceChanges.length,
  sourceCompatibility: SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY
}, null, 2));

function changesApplied(heights, changes) {
  const result = [...heights];
  for (const change of changes) result[change.gridCell] = change.after;
  return result;
}

function createSquareMap(size, getHeight) {
  const points = [];
  const neighbors = [];
  const heights = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = y * size + x;
      points.push([x, y]);
      heights[cell] = getHeight(x, y);
      neighbors[cell] = [
        x > 0 ? cell - 1 : null,
        x < size - 1 ? cell + 1 : null,
        y > 0 ? cell - size : null,
        y < size - 1 ? cell + size : null
      ].filter(Number.isInteger);
    }
  }
  return {
    metadata: {},
    grid: {points, cells: {c: neighbors, h: heights}},
    pack: {cells: {g: Uint32Array.from(points, (_, index) => index), h: Uint8Array.from(heights)}}
  };
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
