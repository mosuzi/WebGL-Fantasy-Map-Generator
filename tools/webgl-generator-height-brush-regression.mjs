#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius, readBrushRadiusContract} from "../app/webgl-generator/src/runtime/brush-radius-contract.js";
import {getGlobalHeightChanges, getHeightBrushChanges, getHeightLineChanges, getHeightRangeTransformChanges, inspectGlobalHeightChanges, inspectHeightFillTarget, inspectHeightRangeTransform} from "../app/webgl-generator/src/runtime/height-brush.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {composeHeightCellSelection, createHeightCellSelection, createHeightCellSelectionFeather, createHeightCellSelectionSet, createHeightCellSelectionSnapshot, createHeightConnectedSelection, createHeightCursorRadiusSelection, createHeightPaintSelection, createHeightRectangleSelection, inspectHeightCellSelection, inspectHeightCellSelectionComposition, inspectHeightCellSelectionFeather, inspectHeightCellSelectionTransform, inspectHeightConnectedSelection, inspectHeightCursorRadiusSelection, inspectHeightPaintSelection, inspectHeightRectangleSelection, restoreHeightCellSelectionSnapshot, transformHeightCellSelection} from "../app/webgl-generator/src/runtime/height-cell-selection.js";
import {getHeightSelectionSmoothingChanges, inspectHeightSelectionSmoothing} from "../app/webgl-generator/src/runtime/height-selection-smoothing.js";
import {queryHeightCellsInRadius} from "../app/webgl-generator/src/runtime/height-cell-spatial-index.js";
import {getHeightTerrainTemplateChanges, HEIGHT_TERRAIN_TEMPLATE_PRESETS, heightTerrainTemplateUsesSeed, inspectHeightTerrainTemplate} from "../app/webgl-generator/src/runtime/height-terrain-templates.js";
import {buildHeightCellSelectionMesh, buildHeightTransformPreviewMesh} from "../app/webgl-generator/src/renderer/height-transform-preview-layer.js";

const heightRadiusContract = readBrushRadiusContract(BRUSH_RADIUS_ID.HEIGHT);
assert(heightRadiusContract.defaultValue === 28 && normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, -1) === 6 && normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, 999) === 96, "高度画笔半径契约异常");
const heightSelectionRadiusContract = readBrushRadiusContract(BRUSH_RADIUS_ID.HEIGHT_SELECTION);
assert(heightSelectionRadiusContract.defaultValue === 48 && normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT_SELECTION, -1) === 8 && normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT_SELECTION, 999) === 160, "高度选区半径契约异常");
const spatialMap = createSquareMap(5, () => 50);
const spatialBoundary = queryHeightCellsInRadius(spatialMap, {x: 0, y: 0}, 1);
assert(spatialBoundary.map(item => item.gridCell).join(",") === "0,1,5", `空间查询没有包含圆边界或保持升序：${JSON.stringify(spatialBoundary)}`);
assert(queryHeightCellsInRadius(spatialMap, {x: -1, y: -1}, Math.SQRT2).map(item => item.gridCell).join(",") === "0", "空间查询没有正确处理负坐标圆心");
const spatialOriginalPoints = spatialMap.grid.points;
spatialMap.grid.points = spatialOriginalPoints.map(([x, y]) => [x + 100, y]);
assert(queryHeightCellsInRadius(spatialMap, {x: 100, y: 0}, 0).map(item => item.gridCell).join(",") === "0", "替换 grid points 后空间缓存没有重建");
const protectedLandMap = createSquareMap(3, () => 20);
const protectedLandLower = getHeightBrushChanges(protectedLandMap, {x: 1, y: 1}, {action: "lower", scope: "land", preserveSurface: true, radius: 20, strength: 18, falloff: false}, {originals: new Map()});
assert(protectedLandLower.length === 0, "普通陆地下降跨越了海平面");
const compatibleLandLower = getHeightBrushChanges(protectedLandMap, {x: 1, y: 1}, {action: "lower", scope: "land", preserveSurface: false, radius: 20, strength: 18, falloff: false}, {originals: new Map()});
assert(compatibleLandLower.some(change => change.after === 2), "专家兼容入口不再允许原有跨海平面高度命令");
const seafloorRaiseMap = createSyntheticMap();
const seafloorRaise = getHeightBrushChanges(seafloorRaiseMap, {x: 0, y: 0}, {action: "raise", scope: "all", preserveSurface: false, radius: 6, strength: 12, falloff: false}, {originals: new Map()});
assertChanges(seafloorRaise, [{gridCell: 0, before: 10, after: 22}], "影响海底抬升");
const seafloorHistory = new EditHistory();
seafloorHistory.execute(createApplyHeightBrushCommand(seafloorRaise, {label: "填海造陆"}), {map: seafloorRaiseMap});
assert(seafloorRaiseMap.grid.cells.h[0] === 22 && seafloorRaiseMap.pack.cells.h[0] === 22, "影响海底抬升没有同步 grid / pack");
assert(seafloorRaiseMap.metadata.derivedStale?.systems?.includes("features"), "填海造陆没有标记高度派生内容待更新");
const seafloorLower = getHeightBrushChanges(createSyntheticMap(), {x: 0, y: 0}, {action: "lower", scope: "all", preserveSurface: false, radius: 6, strength: 4, falloff: false}, {originals: new Map()});
assertChanges(seafloorLower, [{gridCell: 0, before: 10, after: 6}], "影响海底降低");
const playerFalloffRaise = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "raise", scope: "all", radius: 20, strength: 10, falloff: true}, {originals: new Map()});
assert(playerFalloffRaise.map(change => `${change.gridCell}:${change.after - change.before}`).join(",") === "0:5,1:10,2:5", `普通抬升没有按中心距离单调衰减：${JSON.stringify(playerFalloffRaise)}`);
const compatibleUniformRaise = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "raise", scope: "all", radius: 20, strength: 10, falloff: false}, {originals: new Map()});
assert(compatibleUniformRaise.map(change => change.after - change.before).join(",") === "10,10,10,10", "专家关闭衰减后不再保持统一强度");
const radialFalloffMap = createSquareMap(13, () => 50);
const radialFalloffRaise = getHeightBrushChanges(radialFalloffMap, {x: 6, y: 6}, {action: "raise", scope: "all", radius: 6, strength: 12, falloff: true}, {originals: new Map()});
const radialFalloffDeltas = new Map(radialFalloffRaise.map(change => [change.gridCell, change.after - change.before]));
assert(radialFalloffDeltas.get(84) === 12 && radialFalloffDeltas.get(87) === 6 && radialFalloffDeltas.get(89) === 1, `柔和画笔没有形成中心 > 中段 > 外段的强度层级：${JSON.stringify([...radialFalloffDeltas])}`);
assert(!radialFalloffDeltas.has(90), "柔和画笔在半径边界仍产生了高度变化");
const radialUniformRaise = getHeightBrushChanges(createSquareMap(13, () => 50), {x: 6, y: 6}, {action: "raise", scope: "all", radius: 6, strength: 12, falloff: false}, {originals: new Map()});
const radialUniformDeltas = new Map(radialUniformRaise.map(change => [change.gridCell, change.after - change.before]));
assert([84, 87, 89, 90].every(gridCell => radialUniformDeltas.get(gridCell) === 12), "范围均匀模式没有在半径内保持等强度");

const smoothingMap = createSquareMap(5, (x, y) => {
  if (x === 0 && y === 1) return 10;
  if (x === 2 && y === 2) return 20;
  if (x >= 1 && x <= 3 && y >= 1 && y <= 3) return (x + y) % 2 ? 70 : 30;
  return 50;
});
const smoothingSelection = [6, 7, 8, 11, 12, 13, 16, 17, 18];
const smoothingLevels = [0, 0.5, 1].map(smoothness => ({
  smoothness,
  inspection: inspectHeightSelectionSmoothing(smoothingMap, {cellIds: smoothingSelection, smoothness}),
  changes: getHeightSelectionSmoothingChanges(smoothingMap, {cellIds: smoothingSelection, smoothness})
}));
assert(smoothingLevels.every(level => level.inspection.valid), `范围平滑预检异常：${JSON.stringify(smoothingLevels)}`);
assert(JSON.stringify(smoothingLevels[1].changes) === JSON.stringify(getHeightSelectionSmoothingChanges(smoothingMap, {cellIds: smoothingSelection, smoothness: 0.5})), "相同范围和平滑度没有得到确定结果");
assert(!smoothingLevels[0].changes.some(change => change.gridCell === 12), "平滑度 0 不应重塑选区内部深谷");
assert(smoothingLevels[2].changes.some(change => change.gridCell === 12 && change.after > change.before), "平滑度 1 没有抑制选区内部深谷");
const smoothingMagnitude = smoothingLevels.map(level => level.changes.reduce((sum, change) => sum + Math.abs(change.after - change.before), 0));
assert(smoothingMagnitude[0] <= smoothingMagnitude[1] && smoothingMagnitude[1] <= smoothingMagnitude[2], `平滑强度不单调：${smoothingMagnitude}`);
const smoothingAllowed = new Set(smoothingSelection.flatMap(cell => [cell, ...(smoothingMap.grid.cells.c[cell] || [])]));
assert(smoothingLevels.every(level => level.changes.every(change => smoothingAllowed.has(change.gridCell))), "范围平滑修改了选区及过渡环以外的 cell");
assert(smoothingLevels.every(level => level.changes.every(change => change.before >= 20 && change.after >= 20 && change.after <= 100)), "范围平滑跨越海陆或高度范围");
assert(smoothingLevels.every(level => level.changes.every(change => change.after >= 10 && change.after <= 70)), "范围平滑产生了新的全局极值");
const smoothingHistory = new EditHistory();
smoothingHistory.execute(createApplyHeightBrushCommand(smoothingLevels[2].changes, {label: "平滑所选范围"}), {map: smoothingMap});
assert(smoothingHistory.getStats().undo === 1, "一次范围平滑没有形成一条历史");
const smoothedSnapshot = Array.from(smoothingMap.grid.cells.h);
smoothingHistory.undo({map: smoothingMap});
assert(smoothingMap.grid.cells.h[12] === 20 && smoothingMap.grid.cells.h[5] === 10, "范围平滑撤销没有恢复高度或误改水域");
smoothingHistory.redo({map: smoothingMap});
assert(JSON.stringify(Array.from(smoothingMap.grid.cells.h)) === JSON.stringify(smoothedSnapshot), "范围平滑重做没有恢复结果");

const [heightPanelSource, heightPanelModelSource, appSource, rendererSource, refreshSchedulerSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/height-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/edit-refresh-scheduler.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);
assert(/useDebugMode/.test(heightPanelSource), "高度面板没有复用统一调试模式");
assert(/const playerActions = Object\.freeze\(\[\s*\{value: "raise", label: "抬升地形", icon: Top\},\s*\{value: "lower", label: "降低地形", icon: Bottom\},\s*\{value: "level", label: "等高地形", icon: Minus\}/.test(heightPanelSource), "普通高度动作没有收敛为抬升、降低与等高图标工具");
assert(/levelPerturbation: 0/.test(heightPanelModelSource), "等高扰动默认值不是 0");
assert(/panelState\.action === "level" \? panelState\.levelPerturbation : panelState\.strength/.test(heightPanelModelSource), "等高工具没有复用画笔参数槽并隔离普通强度");
assert(/:label="brushValueLabel"[^>]+:model-value="brushValue"[^>]+:min="brushValueMin"/.test(heightPanelSource), "高度画笔参数滑杆没有按工具切换标签、数值与下限");
assert(/const brushValueLabel = computed\(\(\) => isPlayerLevelAction\.value \? "扰动" : "强度"\)/.test(heightPanelSource), "等高工具没有把强度滑杆改名为扰动");
assert(/if \(isPlayerLevelAction\.value\) \{\s*props\.state\.levelPerturbation = Math\.max\(0, Math\.min\(18, Math\.round\(Number\(value\) \|\| 0\)\)\);/.test(heightPanelSource), "等高扰动没有保持独立的 0～18 整数状态");
assert(/props\.state\.action !== "raise" && props\.state\.action !== "lower" && props\.state\.action !== "level"/.test(heightPanelSource), "普通模式没有接受等高动作");
assert(/label="平滑度"[^>]+:min="0"[^>]+:max="1"[^>]+:step="0\.01"/.test(heightPanelSource), "范围平滑度契约异常");
assert(/<details v-if="debugEnabled" class="panel-advanced-section height-advanced-section">/.test(heightPanelSource), "专家地形程序仍在普通模式显示");
assert(/<section v-if="debugEnabled" class="heightmap-import-launcher"/.test(heightPanelSource), "高度图导入仍在普通模式显示");
assert(/scope: "land"/.test(heightPanelModelSource), "高度面板默认范围不是陆地");
assert(/strength: 6/.test(heightPanelModelSource), "受控节奏下的默认单次高度步长没有提高到 6");
assert(/affectSeafloor: false/.test(heightPanelModelSource), "影响海底没有保持会话级默认关闭");
assert(/label="影响海底"[^>]+compact-hit-area[^>]+:checked="state\.affectSeafloor"/.test(heightPanelSource), "影响海底开关没有启用只响应开关与标签的紧凑热区");
assert(/\.height-check-row\.compact-hit-area\s*\{[^}]*cursor:\s*default;/.test(stylesSource), "影响海底开关的行尾空白仍显示可点击光标");
assert(/props\.state\.scope = props\.state\.affectSeafloor \? "all" : "land";\s*props\.state\.preserveSurface = !props\.state\.affectSeafloor;/.test(heightPanelSource), "影响海底没有映射为 all / false 与 land / true");
assert(/:disabled="!state\.derivedStaleSystems\?\.length"[\s\S]+完成编辑并更新地图/.test(heightPanelSource), "普通地图更新入口没有永久保留并按待更新状态禁用");
assert(/class="height-player-rebuild-action"/.test(heightPanelSource) && /\.height-player-rebuild-action\.el-button\s*\{[^}]*margin-bottom:\s*10px;/.test(stylesSource), "普通地图更新按钮与高度编辑启停按钮之间仍缺少 10px 留白");
assert(/selectionSmoothness: 0/.test(heightPanelModelSource), "范围平滑度默认值不是 0");
assert(/onTerrainSelectionSmooth/.test(heightPanelModelSource), "高度面板 wrapper 缺少范围平滑入口");
assert(/createHeightSelectionSmoothingPlan\(state\.map, (?:options|normalized)\)/.test(appSource), "范围平滑没有复用单次分析计划");
assert(/applyHeightChangesViaApi\(state, documentRef, plan\.changes, \{label\}\)/.test(appSource) && /createApplyHeightBrushCommand\(normalized, \{label\}\)/.test(appSource), "范围平滑没有复用单条高度历史命令");
assert(/terrainSelectionPaintState/.test(heightPanelSource) && /:class="\{active: !isPlayerSmoothingSelection && state\.action === action\.value\}"/.test(heightPanelSource), "普通升降与范围涂选没有互斥高亮");
assert(/props\.callbacks\.onTerrainSelectionCancel\?\.\(\);[\s\S]+setAction/.test(heightPanelSource), "切回普通升降没有取消范围涂选");
assert(!/function selectHeightAction\([\s\S]+?props\.state\.falloff = true;[\s\S]+?function setAction/.test(heightPanelSource), "切换抬升或降低仍会偷偷重置画笔强度模式");
assert(heightPanelSource.includes("柔和渐弱") && heightPanelSource.includes("范围均匀"), "普通高度面板没有显式柔和 / 均匀模式");
assert(!heightPanelSource.includes("PLAYER_FALLOFF_MIN_RADIUS"), "普通柔和画笔仍保留额外的 24 最小半径");
assert(/<details class="height-player-smoothing height-seafloor-reset">/.test(heightPanelSource) && /<div v-if="debugEnabled" class="height-history-actions">/.test(heightPanelSource), "普通高度面板仍默认展开海底重设或重复显示底部历史按钮");
assert(/\.segmented\.height-player-falloff-mode\s*\{[^}]*gap:\s*10px;[^}]*margin:\s*10px 0;/.test(stylesSource), "普通高度模式按钮与启停按钮之间仍缺少明确留白");
assert(/\.height-player-tool-row\s*\{[^}]*gap:\s*10px;/.test(stylesSource) && /\.height-player-operation-toolbar\s*\{[^}]*gap:\s*10px;/.test(stylesSource), "普通高度图标按钮组仍过于拥挤");
assert(/scheduleHeightBrushAtEvent/.test(appSource) && /flushScheduledHeightBrush/.test(appSource), "高度画笔没有按动画帧合并并补刷末次落点");
assert(/flushScheduledHeightBrush\(state, documentRef, event(?:, \{draw: false\})?\)/.test(appSource) && /flushScheduledHeightSelectionPaint\(state, documentRef, event\)/.test(appSource), "高度画笔或范围涂选没有提交 pointerup 的真实末次坐标");
assert(/state\.pick = state\.renderer\.pickClientPoint\(event\.clientX, event\.clientY\);\s*const point = state\.renderer\.screenToWorld/.test(appSource), "高度画笔拖动时没有同步当前悬停落点");
assert(/if \(active\) releasePointer\(state\.renderer\?\.canvas, active\.pointerId\)/.test(appSource), "取消范围涂选时没有释放 pointer capture");
assert(/changedGridCells: changes\.map\(change => change\.gridCell\)/.test(appSource), "高度预览没有携带局部 cell 列表");
assert(/updateHeightPanel\(state, \{includeMapSummary: false\}\)/.test(appSource), "连续高度交互仍会逐帧统计整图摘要");
assert(/deferTerrainRefresh: true/.test(refreshSchedulerSource), "高度预览没有声明延后岸线 / 地形派生刷新");
assert(/refreshHeightCells\(changedGridCells, \{deferTopology: effects\.deferTerrainRefresh(?:, draw: [^}]+)?\}\)/.test(refreshSchedulerSource), "高度预览没有把地形派生刷新延后到提交阶段");
assert(/refreshHeightCells\(gridCells, \{draw = true, deferTopology = false\}/.test(rendererSource), "高度 surface 增量刷新没有提供延后拓扑重建参数");
assert(/changedGridCells: normalized\.map\(change => change\.gridCell\)/.test(await readFile(new URL("../app/webgl-generator/src/runtime/height-edit-commands.js", import.meta.url), "utf8")), "高度提交命令没有绑定实际变更 cell");
assert(/refreshHeightCells\(gridCells/.test(rendererSource) && /bufferSubData/.test(rendererSource), "renderer 缺少受影响 surface 颜色增量更新");
assert(/changedGridCells\.length && typeof state\.renderer\.refreshHeightCells/.test(refreshSchedulerSource), "刷新调度器没有优先使用高度局部 surface 更新");

const levelMap = createSyntheticMap();
const levelStroke = {originals: new Map(), seed: 23};
const levelFirst = getHeightBrushChanges(levelMap, {x: 10, y: 0}, {action: "level", scope: "all", radius: 12, strength: 0, falloff: false}, levelStroke);
assert(levelStroke.targetHeight === 20, `等高首个落点没有冻结目标高度：${levelStroke.targetHeight}`);
assertChanges(levelFirst, [
  {gridCell: 0, before: 10, after: 20},
  {gridCell: 2, before: 30, after: 20}
], "等高首次落笔");
applyHeightBrushPreview(levelMap, levelFirst);
const levelContinued = getHeightBrushChanges(levelMap, {x: 30, y: 0}, {action: "level", scope: "all", radius: 12, strength: 0, falloff: false}, levelStroke);
assert(levelStroke.targetHeight === 20, "等高拖动途中被后续落点改写目标高度");
assertChanges(levelContinued, [{gridCell: 3, before: 50, after: 20}], "等高持续拖动");
applyHeightBrushPreview(levelMap, levelContinued);
const levelFinalChanges = [...levelStroke.originals].map(([gridCell, before]) => ({gridCell, before, after: levelMap.grid.cells.h[gridCell]}));
const levelHistory = new EditHistory();
levelHistory.execute(createApplyHeightBrushCommand(levelFinalChanges, {label: "等高笔刷"}), {map: levelMap});
assert(levelHistory.getStats().undo === 1 && [...levelMap.grid.cells.h].join(",") === "20,20,20,20", "一笔等高没有形成单条历史或完整统一高度");
levelHistory.undo({map: levelMap});
assert([...levelMap.grid.cells.h].join(",") === "10,20,30,50", "撤销等高没有恢复整笔原始高度");
levelHistory.redo({map: levelMap});
assert([...levelMap.grid.cells.h].join(",") === "20,20,20,20", "重做等高没有恢复整笔结果");

const levelPerturbationMap = createSquareMap(7, () => 50);
const levelPerturbationStroke = {originals: new Map(), seed: 17};
const levelPerturbed = getHeightBrushChanges(levelPerturbationMap, {x: 3, y: 3}, {action: "level", scope: "all", radius: 20, strength: 8, falloff: false}, levelPerturbationStroke);
const levelPerturbedAgain = getHeightBrushChanges(createSquareMap(7, () => 50), {x: 3, y: 3}, {action: "level", scope: "all", radius: 20, strength: 8, falloff: false}, {originals: new Map(), seed: 17});
assert(JSON.stringify(levelPerturbed) === JSON.stringify(levelPerturbedAgain), "相同 seed 的等高扰动结果不可复现");
assert(levelPerturbed.some(change => change.after < 50) && levelPerturbed.some(change => change.after > 50), "等高扰动没有在目标高度两侧产生变化");
assert(levelPerturbed.every(change => Math.abs(change.after - 50) <= 8), "等高扰动超过滑杆指定幅度");
applyHeightBrushPreview(levelPerturbationMap, levelPerturbed);
const stableLevelRevisit = getHeightBrushChanges(levelPerturbationMap, {x: 3, y: 3}, {action: "level", scope: "all", radius: 20, strength: 8, falloff: false}, levelPerturbationStroke);
assert(stableLevelRevisit.length === 0, "等高扰动在同一笔重复经过时发生漂移");

const map = createSyntheticMap();
const stroke = {originals: new Map()};
const flatten = getHeightBrushChanges(map, {x: 10, y: 0}, {action: "flatten", radius: 25, strength: 4, falloff: false}, stroke);
assert(stroke.targetHeight === 20, `整平目标高度异常：${stroke.targetHeight}`);
assertChanges(flatten, [
  {gridCell: 0, before: 10, after: 14},
  {gridCell: 2, before: 30, after: 26},
  {gridCell: 3, before: 50, after: 46}
], "首次整平");

applyHeightBrushPreview(map, flatten);
const continued = getHeightBrushChanges(map, {x: 30, y: 0}, {action: "flatten", radius: 12, strength: 4, falloff: false}, stroke);
assert(stroke.targetHeight === 20, "拖动过程中整平目标被新的最近 cell 改写");
assert(continued.find(change => change.gridCell === 3)?.after === 42, "连续整平没有继续趋近落笔目标");

const history = new EditHistory();
const command = createApplyHeightBrushCommand(flatten, {label: "整平笔刷"});
history.execute(command, {map});
assert(history.getStats().lastDomain === "height", "整平没有复用高度命令领域");
assert(map.metadata.derivedStale?.systems?.includes("features"), "普通非跨海高度变化没有标记派生内容待更新");
history.undo({map});
assert([...map.grid.cells.h].join(",") === "10,20,30,50", `撤销整平没有恢复 grid：${[...map.grid.cells.h]}`);
assert([...map.pack.cells.h].join(",") === "10,20,30,50", `撤销整平没有恢复 pack：${[...map.pack.cells.h]}`);
history.redo({map});
assert([...map.grid.cells.h].join(",") === "14,20,26,46", `重做整平没有恢复结果：${[...map.grid.cells.h]}`);

const restoredMap = createSyntheticMap();
restoredMap.__heightEditorPackCellsByGrid = {};
const restoredCommand = createApplyHeightBrushCommand([{gridCell: 0, before: 10, after: 14}], {label: "旧地图高度"});
restoredCommand.apply({map: restoredMap});
assert(restoredMap.pack.cells.h[0] === 14, "旧地图保存出的普通对象缓存阻断了 pack 高度同步");
assert(restoredMap.__heightEditorPackCellsByGrid instanceof Map, "旧地图高度索引缓存没有重建为 Map");
assert(!Object.keys(restoredMap).includes("__heightEditorPackCellsByGrid"), "高度索引缓存不应再次写入地图存档");

const falloffStroke = {originals: new Map()};
const falloff = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "flatten", radius: 20, strength: 8, falloff: true}, falloffStroke);
assert(!falloff.some(change => change.gridCell === 3), "整平衰减为零的边缘仍被计入变化");

const raise = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "raise", radius: 10, strength: 4, falloff: false}, {originals: new Map()});
assert(raise.map(change => change.after).join(",") === "14,24,34", `抬升兼容结果异常：${raise.map(change => change.after)}`);
const smooth = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "smooth", radius: 10, strength: 4, falloff: true}, {originals: new Map()});
assert(smooth.map(change => change.after).join(",") === "14,26", `平滑兼容结果异常：${smooth.map(change => change.after)}`);

const disruptStroke = {originals: new Map(), seed: 17, iteration: 0};
const disrupt = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "disrupt", scope: "all", radius: 25, strength: 8, falloff: false}, disruptStroke);
const repeatedDisrupt = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "disrupt", scope: "all", radius: 25, strength: 8, falloff: false}, {originals: new Map(), seed: 17, iteration: 0});
assert(JSON.stringify(disrupt) === JSON.stringify(repeatedDisrupt), "相同 seed 的扰动结果不可复现");
assert(disruptStroke.iteration === 1, `扰动迭代没有推进：${disruptStroke.iteration}`);
assert(disrupt.some(change => change.after > change.before) && disrupt.some(change => change.after < change.before), "扰动没有同时产生局部抬升和降低");

const landScope = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "raise", scope: "land", radius: 25, strength: 4, falloff: false}, {originals: new Map()});
assert(landScope.map(change => change.gridCell).join(",") === "1,2,3", `仅陆地范围包含了水域：${landScope.map(change => change.gridCell)}`);
const waterScope = getHeightBrushChanges(createSyntheticMap(), {x: 10, y: 0}, {action: "lower", scope: "water", radius: 25, strength: 4, falloff: false}, {originals: new Map()});
assert(waterScope.map(change => change.gridCell).join(",") === "0", `仅水域范围包含了陆地：${waterScope.map(change => change.gridCell)}`);

const globalSmoothMap = createSquareMap(3, (x, y) => x === 1 && y === 1 ? 80 : Math.abs(x - 1) + Math.abs(y - 1) === 1 ? 20 : 10);
const globalSmooth = getGlobalHeightChanges(globalSmoothMap, {action: "smooth", scope: "land"});
const globalSmoothPreview = inspectGlobalHeightChanges(globalSmoothMap, {action: "smooth", scope: "land"});
assert(globalSmooth.find(change => change.gridCell === 4)?.after === 65, `全局平滑中心结果异常：${JSON.stringify(globalSmooth)}`);
assert(globalSmoothPreview.valid && globalSmoothPreview.selectedCount === 5 && globalSmoothPreview.changeCount === 5 && globalSmoothPreview.raisedCount === 4 && globalSmoothPreview.loweredCount === 1, `全局平滑预检异常：${JSON.stringify(globalSmoothPreview)}`);
assert(!Object.hasOwn(globalSmoothPreview, "changes"), "公开全局工具预检暴露了完整 changes");
assert([1, 3, 5, 7].every(gridCell => globalSmooth.find(change => change.gridCell === gridCell)?.after === 35), "全局平滑没有统一从修改前快照读取邻居");
assert(globalSmooth.every(change => change.before >= 20 && change.after >= 20), "仅陆地全局平滑跨越海平面或修改了水域");
applyHeightBrushPreview(globalSmoothMap, globalSmooth);
const globalHistory = new EditHistory();
globalHistory.execute(createApplyHeightBrushCommand(globalSmooth, {label: "全局平滑"}), {map: globalSmoothMap});
globalHistory.undo({map: globalSmoothMap});
assert(globalSmoothMap.grid.cells.h[4] === 80 && globalSmoothMap.pack.cells.h[4] === 80, "撤销全局平滑没有恢复 grid / pack");
globalHistory.redo({map: globalSmoothMap});
assert(globalSmoothMap.grid.cells.h[4] === 65 && globalSmoothMap.pack.cells.h[4] === 65, "重做全局平滑没有恢复 grid / pack");

const globalDisruptMap = createSquareMap(5, (x, y) => x === 0 && y === 0 ? 10 : 40);
const globalDisrupt = getGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 23});
const globalDisruptPreview = inspectGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 23});
const repeatedGlobalDisrupt = getGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 23});
const nextGlobalDisrupt = getGlobalHeightChanges(globalDisruptMap, {action: "disrupt", scope: "all", seed: 24});
assert(JSON.stringify(globalDisrupt) === JSON.stringify(repeatedGlobalDisrupt), "相同 seed 的全局扰动不可复现");
assert(globalDisruptPreview.valid && globalDisruptPreview.seed === 23 && globalDisruptPreview.changeCount === globalDisrupt.length, `全局扰动预检异常：${JSON.stringify(globalDisruptPreview)}`);
assert(JSON.stringify(globalDisrupt) !== JSON.stringify(nextGlobalDisrupt), "不同 seed 的全局扰动没有推进形态");
assert(!globalDisrupt.some(change => change.gridCell === 0), "全局扰动修改了低于 15 的深水 cell");
assert(getGlobalHeightChanges(globalDisruptMap, {action: "unknown", scope: "all"}).length === 0, "未知全局工具产生了高度变化");

const rangeTransformMap = createSyntheticMap();
const multiplyPreview = inspectHeightRangeTransform(rangeTransformMap, {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0.5});
const multiplyChanges = getHeightRangeTransformChanges(rangeTransformMap, {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0.5});
assert(multiplyPreview.valid && multiplyPreview.selectedCount === 3 && multiplyPreview.changeCount === 2, `条件乘算预检异常：${JSON.stringify(multiplyPreview)}`);
assert(multiplyPreview.raisedCount === 0 && multiplyPreview.loweredCount === 2, `条件乘算升降统计异常：${JSON.stringify(multiplyPreview)}`);
assert(!Object.hasOwn(multiplyPreview, "changes"), "公开条件变换预检暴露了完整 changes");
assert(multiplyPreview.beforeRange.join(",") === "20,50" && multiplyPreview.afterRange.join(",") === "20,35" && multiplyPreview.averageDelta === -10, `条件乘算摘要异常：${JSON.stringify(multiplyPreview)}`);
assertChanges(multiplyChanges, [
  {gridCell: 2, before: 30, after: 25},
  {gridCell: 3, before: 50, after: 35}
], "条件乘算");
const addChanges = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "all", lower: 0, upper: 20, operator: "add", operand: 5});
assertChanges(addChanges, [
  {gridCell: 0, before: 10, after: 15},
  {gridCell: 1, before: 20, after: 25}
], "条件加高");
const subtractWater = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "water", lower: 0, upper: 19, operator: "subtract", operand: 20});
assertChanges(subtractWater, [{gridCell: 0, before: 10, after: 0}], "条件水域降低");
const divideLand = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 50, upper: 50, operator: "divide", operand: 2});
assertChanges(divideLand, [{gridCell: 3, before: 50, after: 35}], "条件除算");
const zeroMultiplyLand = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0});
assertChanges(zeroMultiplyLand, [
  {gridCell: 2, before: 30, after: 20},
  {gridCell: 3, before: 50, after: 20}
], "条件归零乘算");
const exponentLand = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 30, upper: 30, operator: "exponent", operand: 2});
assertChanges(exponentLand, [{gridCell: 2, before: 30, after: 100}], "条件指数变换");
const invalidDivide = inspectHeightRangeTransform(createSyntheticMap(), {scope: "all", lower: 0, upper: 100, operator: "divide", operand: 0});
assert(!invalidDivide.valid && invalidDivide.notice.includes("大于 0"), `零除数未被拒绝：${JSON.stringify(invalidDivide)}`);
const invalidRange = inspectHeightRangeTransform(createSyntheticMap(), {scope: "all", lower: 80, upper: 20, operator: "add", operand: 1});
assert(!invalidRange.valid && invalidRange.notice.includes("下限"), "倒置高度区间未被拒绝");
const noopTransform = inspectHeightRangeTransform(createSyntheticMap(), {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 1});
assert(!noopTransform.valid && noopTransform.selectedCount === 3 && noopTransform.changeCount === 0 && noopTransform.notice.includes("不会变化"), "无变化条件变换仍被标记为可执行");

const rangeHistory = new EditHistory();
rangeHistory.execute(createApplyHeightBrushCommand(multiplyChanges, {label: "条件乘算"}), {map: rangeTransformMap});
rangeHistory.undo({map: rangeTransformMap});
assert(rangeTransformMap.grid.cells.h[3] === 50 && rangeTransformMap.pack.cells.h[3] === 50, "撤销条件乘算没有恢复 grid / pack");
rangeHistory.redo({map: rangeTransformMap});
assert(rangeTransformMap.grid.cells.h[3] === 35 && rangeTransformMap.pack.cells.h[3] === 35, "重做条件乘算没有恢复 grid / pack");

const previewMesh = buildHeightTransformPreviewMesh(createTransformPreviewMap(), [
  {gridCell: 0, before: 20, after: 30},
  {gridCell: 1, before: 30, after: 25},
  {gridCell: 2, before: 10, after: 20},
  {gridCell: 0, before: 20, after: 31}
]);
assert(previewMesh.stats.cells === 2 && previewMesh.stats.raisedCells === 1 && previewMesh.stats.loweredCells === 1 && previewMesh.stats.skippedCells === 2, `空间预览 cell 统计异常：${JSON.stringify(previewMesh.stats)}`);
assert(previewMesh.stats.vertexCount === 24 && previewMesh.stats.triangleCount === 8, `空间预览三角化异常：${JSON.stringify(previewMesh.stats)}`);
assert(previewMesh.vertices[2] === 1 && previewMesh.vertices[4] < 0.1, "升高预览没有使用暖色");
assert(previewMesh.vertices[74] < 0.1 && previewMesh.vertices[76] === 1, "降低预览没有使用冷色");
assert(buildHeightTransformPreviewMesh({}, multiplyChanges).stats.vertexCount === 0, "坏地图仍生成了空间预览 mesh");

const terrainSelection = createHeightCellSelection(createSyntheticMap(), {scope: "land", lower: 20, upper: 30});
const terrainSelectionPreview = inspectHeightCellSelection(createSyntheticMap(), {scope: "land", lower: 20, upper: 30});
const terrainSelectionSet = createHeightCellSelectionSet(terrainSelection.cellIds);
assert(terrainSelection.summary.valid && [...terrainSelection.cellIds].join(",") === "1,2" && terrainSelection.summary.heightRange.join(",") === "20,30", `地形选区异常：${JSON.stringify(terrainSelection.summary)}`);
assert(!Object.hasOwn(terrainSelectionPreview, "cellIds") && terrainSelectionPreview.count === 2, "公开地形选区摘要暴露了 cellIds 或计数异常");
assert(!inspectHeightCellSelection(createSyntheticMap(), {scope: "water", lower: 15, upper: 19}).valid, "空水域选区未被拒绝");
assert(inspectHeightCellSelection(createSyntheticMap(), {scope: "all", lower: 80, upper: 20}).notice.includes("下限"), "倒置地形选区未被拒绝");
const selectedRangePreview = inspectHeightRangeTransform(createSyntheticMap(), {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0.5, allowedCells: terrainSelectionSet});
const selectedRangeChanges = getHeightRangeTransformChanges(createSyntheticMap(), {scope: "land", lower: 20, upper: 50, operator: "multiply", operand: 0.5, allowedCells: terrainSelectionSet});
assert(selectedRangePreview.selectionLimited && selectedRangePreview.selectedCount === 2 && selectedRangePreview.changeCount === 1, `条件变换没有受锁定选区约束：${JSON.stringify(selectedRangePreview)}`);
assertChanges(selectedRangeChanges, [{gridCell: 2, before: 30, after: 25}], "锁定选区条件乘算");
const selectedGlobalMap = createSquareMap(3, (x, y) => x === 1 && y === 1 ? 80 : Math.abs(x - 1) + Math.abs(y - 1) === 1 ? 20 : 10);
const selectedGlobalPreview = inspectGlobalHeightChanges(selectedGlobalMap, {action: "smooth", scope: "land", allowedCells: new Set([4])});
const selectedGlobalChanges = getGlobalHeightChanges(selectedGlobalMap, {action: "smooth", scope: "land", allowedCells: new Set([4])});
assert(selectedGlobalPreview.selectionLimited && selectedGlobalPreview.selectedCount === 1 && selectedGlobalPreview.changeCount === 1, `全局工具没有受锁定选区约束：${JSON.stringify(selectedGlobalPreview)}`);
assertChanges(selectedGlobalChanges, [{gridCell: 4, before: 80, after: 65}], "锁定选区全局平滑");
const terrainSelectionMesh = buildHeightCellSelectionMesh(createTransformPreviewMap(), [0, 1, 2, 0]);
assert(terrainSelectionMesh.stats.cells === 2 && terrainSelectionMesh.stats.skippedCells === 2 && terrainSelectionMesh.stats.vertexCount === 24 && terrainSelectionMesh.stats.triangleCount === 8, `地形选区 mesh 异常：${JSON.stringify(terrainSelectionMesh.stats)}`);
assert(terrainSelectionMesh.vertices[2] === 1 && terrainSelectionMesh.vertices[3] > 0.77 && terrainSelectionMesh.vertices[4] > 0.17, "地形选区没有使用黄色 overlay");
assert(terrainSelectionSet.has(1) && terrainSelectionSet.has(2), "地形选区 Set 丢失稳定 grid id");
const selectionMap = createSyntheticMap();
const replacedSelection = composeHeightCellSelection(selectionMap, null, {operation: "replace", scope: "land", lower: 20, upper: 30});
const unionSelection = composeHeightCellSelection(selectionMap, replacedSelection.cellIds, {operation: "union", scope: "water", lower: 0, upper: 19});
const intersectedSelection = composeHeightCellSelection(selectionMap, unionSelection.cellIds, {operation: "intersect", scope: "land", lower: 30, upper: 50});
const subtractedSelection = composeHeightCellSelection(selectionMap, replacedSelection.cellIds, {operation: "subtract", scope: "land", lower: 30, upper: 30});
const rejectedEmptySelection = composeHeightCellSelection(selectionMap, replacedSelection.cellIds, {operation: "subtract", scope: "land", lower: 20, upper: 30});
const normalizedUnionSelection = composeHeightCellSelection(selectionMap, [2, 2, -1, 99, 1], {operation: "union", scope: "water", lower: 10, upper: 10});
const compositionPreview = inspectHeightCellSelectionComposition(selectionMap, replacedSelection.cellIds, {operation: "union", scope: "water", lower: 10, upper: 10});
assert(replacedSelection.summary.valid && [...replacedSelection.cellIds].join(",") === "1,2" && replacedSelection.summary.addedCount === 2, `覆盖锁定异常：${JSON.stringify(replacedSelection.summary)}`);
assert(unionSelection.summary.valid && [...unionSelection.cellIds].join(",") === "0,1,2" && unionSelection.summary.addedCount === 1 && unionSelection.summary.removedCount === 0, `选区并入异常：${JSON.stringify(unionSelection.summary)}`);
assert(intersectedSelection.summary.valid && [...intersectedSelection.cellIds].join(",") === "2" && intersectedSelection.summary.removedCount === 2, `选区交集异常：${JSON.stringify(intersectedSelection.summary)}`);
assert(subtractedSelection.summary.valid && [...subtractedSelection.cellIds].join(",") === "1" && subtractedSelection.summary.removedCount === 1, `选区排除异常：${JSON.stringify(subtractedSelection.summary)}`);
assert(!rejectedEmptySelection.summary.valid && [...rejectedEmptySelection.cellIds].join(",") === "1,2" && rejectedEmptySelection.summary.notice.includes("保留原锁定选区"), `空结果没有保留旧选区：${JSON.stringify(rejectedEmptySelection.summary)}`);
assert([...normalizedUnionSelection.cellIds].join(",") === "0,1,2", `选区组合没有去重或过滤坏 id：${[...normalizedUnionSelection.cellIds]}`);
assert(!Object.hasOwn(compositionPreview, "cellIds") && compositionPreview.previousCount === 2 && compositionPreview.count === 3, "公开选区组合摘要暴露 ids 或计数异常");
const cursorCircleSelection = createHeightCursorRadiusSelection(selectionMap, 1, {scope: "all", radius: 11});
const landCursorCircleSelection = createHeightCursorRadiusSelection(selectionMap, 1, {scope: "land", radius: 11});
const waterCursorCircleSelection = createHeightCursorRadiusSelection(selectionMap, 1, {scope: "water", radius: 11});
const tightCursorCircleSelection = createHeightCursorRadiusSelection(selectionMap, 1, {scope: "all", radius: 1});
const invalidCursorCircleSelection = inspectHeightCursorRadiusSelection(selectionMap, null, {scope: "all", radius: 11});
const oversizedCursorCircleSelection = inspectHeightCursorRadiusSelection(createSquareMap(10, () => 30), 55, {scope: "land", radius: 256});
const cursorUnionSelection = composeHeightCellSelection(selectionMap, replacedSelection.cellIds, {operation: "union", source: "cursor-circle", scope: "all", centerCell: 3, radius: 11});
const cursorCompositionPreview = inspectHeightCellSelectionComposition(selectionMap, replacedSelection.cellIds, {operation: "union", source: "cursor-circle", scope: "all", centerCell: 3, radius: 11});
assert(cursorCircleSelection.summary.valid && [...cursorCircleSelection.cellIds].join(",") === "0,1,2" && cursorCircleSelection.summary.heightRange.join(",") === "10,30", `光标圆形选区异常：${JSON.stringify(cursorCircleSelection.summary)}`);
assert([...landCursorCircleSelection.cellIds].join(",") === "1,2" && [...waterCursorCircleSelection.cellIds].join(",") === "0", "光标圆形选区没有遵守陆水 scope");
assert([...tightCursorCircleSelection.cellIds].join(",") === "1", `光标圆形最小半径异常：${[...tightCursorCircleSelection.cellIds]}`);
assert(!invalidCursorCircleSelection.valid && invalidCursorCircleSelection.notice.includes("鼠标"), `坏光标没有被拒绝：${JSON.stringify(invalidCursorCircleSelection)}`);
assert(!oversizedCursorCircleSelection.valid && oversizedCursorCircleSelection.maxCells === 64 && oversizedCursorCircleSelection.notice.includes("安全上限"), `超大光标圆形没有被拒绝：${JSON.stringify(oversizedCursorCircleSelection)}`);
assert(cursorUnionSelection.summary.valid && [...cursorUnionSelection.cellIds].join(",") === "1,2,3" && cursorUnionSelection.summary.source === "cursor-circle" && cursorUnionSelection.summary.centerCell === 3 && cursorUnionSelection.summary.radius === 11, `空间候选并入异常：${JSON.stringify(cursorUnionSelection.summary)}`);
assert(!Object.hasOwn(cursorCompositionPreview, "cellIds") && cursorCompositionPreview.count === 3, "公开空间组合摘要暴露 ids 或计数异常");
const rectangleSelection = createHeightRectangleSelection(selectionMap, {x: 5, y: -1}, {x: 25, y: 1}, {scope: "all"});
const reversedRectangleSelection = createHeightRectangleSelection(selectionMap, {x: 25, y: 1}, {x: 5, y: -1}, {scope: "all"});
const landRectangleSelection = createHeightRectangleSelection(selectionMap, {x: 5, y: -1}, {x: 25, y: 1}, {scope: "land"});
const waterRectangleSelection = inspectHeightRectangleSelection(selectionMap, {x: 5, y: -1}, {x: 25, y: 1}, {scope: "water"});
const narrowRectangleSelection = inspectHeightRectangleSelection(selectionMap, {x: 5, y: 0}, {x: 25, y: 0}, {scope: "all"});
const invalidRectangleSelection = inspectHeightRectangleSelection(selectionMap, null, {x: 25, y: 1}, {scope: "all"});
const oversizedRectangleSelection = inspectHeightRectangleSelection(createSquareMap(10, () => 30), {x: -1, y: -1}, {x: 10, y: 10}, {scope: "land"});
const rectangleUnionSelection = composeHeightCellSelection(selectionMap, [0], {operation: "union", source: "rectangle", scope: "all", fromPoint: {x: 5, y: -1}, toPoint: {x: 25, y: 1}});
const rectangleCompositionPreview = inspectHeightCellSelectionComposition(selectionMap, [0], {operation: "union", source: "rectangle", scope: "all", fromPoint: {x: 5, y: -1}, toPoint: {x: 25, y: 1}});
assert(rectangleSelection.summary.valid && [...rectangleSelection.cellIds].join(",") === "1,2" && rectangleSelection.summary.width === 20 && rectangleSelection.summary.height === 2, `矩形选区异常：${JSON.stringify(rectangleSelection.summary)}`);
assert([...reversedRectangleSelection.cellIds].join(",") === "1,2" && JSON.stringify(reversedRectangleSelection.summary.bounds) === JSON.stringify(rectangleSelection.summary.bounds), "矩形选区依赖角点顺序");
assert([...landRectangleSelection.cellIds].join(",") === "1,2" && !waterRectangleSelection.valid, "矩形选区没有遵守陆水 scope");
assert(!narrowRectangleSelection.valid && narrowRectangleSelection.notice.includes("至少为 1"), `过窄矩形没有被拒绝：${JSON.stringify(narrowRectangleSelection)}`);
assert(!invalidRectangleSelection.valid && invalidRectangleSelection.notice.includes("两个有效角点"), `坏矩形角点没有被拒绝：${JSON.stringify(invalidRectangleSelection)}`);
assert(!oversizedRectangleSelection.valid && oversizedRectangleSelection.maxCells === 64 && oversizedRectangleSelection.notice.includes("安全上限"), `超大矩形没有被拒绝：${JSON.stringify(oversizedRectangleSelection)}`);
assert(rectangleUnionSelection.summary.valid && [...rectangleUnionSelection.cellIds].join(",") === "0,1,2" && rectangleUnionSelection.summary.source === "rectangle" && rectangleUnionSelection.summary.bounds.minX === 5, `矩形候选并入异常：${JSON.stringify(rectangleUnionSelection.summary)}`);
assert(!Object.hasOwn(rectangleCompositionPreview, "cellIds") && rectangleCompositionPreview.count === 3, "公开矩形组合摘要暴露 ids 或计数异常");
const connectedMap = createSquareMap(5, (x, y) => x >= 1 && x <= 3 && y >= 1 && y <= 3 ? (x === 2 && y === 2 ? 40 : 42) : 60);
const exactConnectedSelection = createHeightConnectedSelection(connectedMap, 12, {scope: "land", tolerance: 0});
const tolerantConnectedSelection = createHeightConnectedSelection(connectedMap, 12, {scope: "land", tolerance: 2});
const waterConnectedSelection = inspectHeightConnectedSelection(connectedMap, 12, {scope: "water", tolerance: 2});
const invalidConnectedSelection = inspectHeightConnectedSelection(connectedMap, null, {scope: "all", tolerance: 2});
const missingAdjacencySelection = inspectHeightConnectedSelection(selectionMap, 1, {scope: "land", tolerance: 2});
const oversizedConnectedSelection = inspectHeightConnectedSelection(createSquareMap(10, () => 30), 55, {scope: "land", tolerance: 0});
const connectedUnionSelection = composeHeightCellSelection(connectedMap, [0], {operation: "union", source: "connected-height", scope: "land", centerCell: 12, tolerance: 2});
const connectedCompositionPreview = inspectHeightCellSelectionComposition(connectedMap, [0], {operation: "union", source: "connected-height", scope: "land", centerCell: 12, tolerance: 2});
assert(exactConnectedSelection.summary.valid && [...exactConnectedSelection.cellIds].join(",") === "12" && exactConnectedSelection.summary.heightRange.join(",") === "40,40", `容差0连通选区异常：${JSON.stringify(exactConnectedSelection.summary)}`);
assert(tolerantConnectedSelection.summary.valid && tolerantConnectedSelection.cellIds.length === 9 && tolerantConnectedSelection.summary.heightRange.join(",") === "40,42", `正容差连通选区异常：${JSON.stringify(tolerantConnectedSelection.summary)}`);
assert(!waterConnectedSelection.valid && waterConnectedSelection.notice.includes("不属于当前作用范围"), `连通选区没有遵守scope：${JSON.stringify(waterConnectedSelection)}`);
assert(!invalidConnectedSelection.valid && invalidConnectedSelection.notice.includes("有效中心"), `坏连通中心没有被拒绝：${JSON.stringify(invalidConnectedSelection)}`);
assert(!missingAdjacencySelection.valid && missingAdjacencySelection.notice.includes("共享边邻接"), `缺邻接连通选区没有被拒绝：${JSON.stringify(missingAdjacencySelection)}`);
assert(!oversizedConnectedSelection.valid && oversizedConnectedSelection.maxCells === 64 && oversizedConnectedSelection.notice.includes("安全上限"), `超大连通选区没有被拒绝：${JSON.stringify(oversizedConnectedSelection)}`);
assert(connectedUnionSelection.summary.valid && connectedUnionSelection.cellIds.length === 10 && connectedUnionSelection.cellIds[0] === 0 && connectedUnionSelection.summary.source === "connected-height" && connectedUnionSelection.summary.startHeight === 40 && connectedUnionSelection.summary.tolerance === 2, `连通候选并入异常：${JSON.stringify(connectedUnionSelection.summary)}`);
assert(!Object.hasOwn(connectedCompositionPreview, "cellIds") && connectedCompositionPreview.count === 10, "公开连通组合摘要暴露 ids 或计数异常");
const paintSelection = createHeightPaintSelection(selectionMap, [0, 1, 1, 99, -1, 2], {scope: "all", radius: 12, stampCount: 3});
const landPaintSelection = createHeightPaintSelection(selectionMap, paintSelection.cellIds, {scope: "land", radius: 12, stampCount: 3});
const emptyPaintSelection = inspectHeightPaintSelection(selectionMap, [], {scope: "all", radius: 12, stampCount: 0});
const oversizedPaintSelection = inspectHeightPaintSelection(createSquareMap(10, () => 30), Array.from({length: 100}, (_, index) => index), {scope: "land", radius: 16, stampCount: 10});
const paintUnionSelection = composeHeightCellSelection(selectionMap, [3], {operation: "union", source: "paint", scope: "all", radius: 12, stampCount: 3, candidateCellIds: paintSelection.cellIds});
const paintCompositionPreview = inspectHeightCellSelectionComposition(selectionMap, [3], {operation: "union", source: "paint", scope: "all", radius: 12, stampCount: 3, candidateCellIds: paintSelection.cellIds});
assert(paintSelection.summary.valid && [...paintSelection.cellIds].join(",") === "0,1,2" && paintSelection.summary.heightRange.join(",") === "10,30" && paintSelection.summary.stampCount === 3, `画笔候选归一异常：${JSON.stringify(paintSelection.summary)}`);
assert([...landPaintSelection.cellIds].join(",") === "1,2", `画笔候选没有遵守scope：${[...landPaintSelection.cellIds]}`);
assert(!emptyPaintSelection.valid && emptyPaintSelection.notice.includes("没有命中"), `空画笔候选没有被拒绝：${JSON.stringify(emptyPaintSelection)}`);
assert(!oversizedPaintSelection.valid && oversizedPaintSelection.maxCells === 64 && oversizedPaintSelection.notice.includes("安全上限"), `超大画笔候选没有被拒绝：${JSON.stringify(oversizedPaintSelection)}`);
assert(paintUnionSelection.summary.valid && [...paintUnionSelection.cellIds].join(",") === "0,1,2,3" && paintUnionSelection.summary.source === "paint" && paintUnionSelection.summary.radius === 12 && paintUnionSelection.summary.stampCount === 3, `画笔候选并入异常：${JSON.stringify(paintUnionSelection.summary)}`);
assert(!Object.hasOwn(paintCompositionPreview, "cellIds") && paintCompositionPreview.count === 4, "公开画笔组合摘要暴露 ids 或计数异常");

const savedSelection = createHeightCellSelectionSnapshot(selectionMap, [2, 1, 2, -1, 99], {useForTools: true, featherRings: 3});
const restoredSelection = restoreHeightCellSelectionSnapshot(selectionMap, savedSelection);
const staleRestoredSelection = restoreHeightCellSelectionSnapshot(createSyntheticMap(), savedSelection);
const emptySavedSelection = createHeightCellSelectionSnapshot(selectionMap, []);
assert(savedSelection.summary.valid && [...savedSelection.cellIds].join(",") === "1,2" && savedSelection.summary.heightRange.join(",") === "20,30" && savedSelection.useForTools && savedSelection.featherRings === 3, `选区暂存异常：${JSON.stringify(savedSelection.summary)}`);
assert(restoredSelection.summary.valid && [...restoredSelection.cellIds].join(",") === "1,2" && restoredSelection.useForTools && restoredSelection.featherRings === 3, `选区恢复异常：${JSON.stringify(restoredSelection.summary)}`);
assert(!staleRestoredSelection.summary.valid && staleRestoredSelection.summary.notice.includes("不属于当前 grid"), `跨 grid 暂存选区没有被拒绝：${JSON.stringify(staleRestoredSelection.summary)}`);
assert(!emptySavedSelection.summary.valid && emptySavedSelection.summary.notice.includes("没有可暂存"), `空选区仍可暂存：${JSON.stringify(emptySavedSelection.summary)}`);

const morphologyMap = createSquareMap(3, () => 30);
const grownSelection = transformHeightCellSelection(morphologyMap, [4], {operation: "grow", scope: "land", steps: 1});
const grownTwiceSelection = transformHeightCellSelection(morphologyMap, [4], {operation: "grow", scope: "land", steps: 2});
const shrunkSelection = transformHeightCellSelection(morphologyMap, grownSelection.cellIds, {operation: "shrink", scope: "land", steps: 1});
const rejectedEmptyShrink = transformHeightCellSelection(morphologyMap, [4], {operation: "shrink", scope: "land", steps: 1});
const morphologyPreview = inspectHeightCellSelectionTransform(morphologyMap, [4], {operation: "grow", scope: "land", steps: 1});
const scopedMorphologyMap = createSquareMap(3, (x, y) => x === 0 && y === 1 ? 10 : 30);
const landGrownSelection = transformHeightCellSelection(scopedMorphologyMap, [4], {operation: "grow", scope: "land", steps: 1});
assert(grownSelection.summary.valid && [...grownSelection.cellIds].join(",") === "1,3,4,5,7" && grownSelection.summary.addedCount === 4, `选区扩展异常：${JSON.stringify(grownSelection.summary)}`);
assert(grownTwiceSelection.summary.valid && grownTwiceSelection.cellIds.length === 9 && grownTwiceSelection.summary.steps === 2, `选区多圈扩展异常：${JSON.stringify(grownTwiceSelection.summary)}`);
assert(shrunkSelection.summary.valid && [...shrunkSelection.cellIds].join(",") === "4" && shrunkSelection.summary.removedCount === 4, `选区收缩异常：${JSON.stringify(shrunkSelection.summary)}`);
assert(!rejectedEmptyShrink.summary.valid && [...rejectedEmptyShrink.cellIds].join(",") === "4" && rejectedEmptyShrink.summary.notice.includes("保留原锁定选区"), `收缩空结果没有保留旧选区：${JSON.stringify(rejectedEmptyShrink.summary)}`);
assert([...landGrownSelection.cellIds].join(",") === "1,4,5,7", `选区扩展跨越当前陆水 scope：${[...landGrownSelection.cellIds]}`);
assert(!Object.hasOwn(morphologyPreview, "cellIds") && morphologyPreview.count === 5, "公开边界调整摘要暴露 ids 或计数异常");

const featherMap = createSquareMap(5, () => 40);
const featherIds = Uint32Array.from([6, 7, 8, 11, 12, 13, 16, 17, 18]);
const hardFeather = createHeightCellSelectionFeather(featherMap, featherIds, {rings: 0});
const oneRingFeather = createHeightCellSelectionFeather(featherMap, featherIds, {rings: 1});
const twoRingFeather = createHeightCellSelectionFeather(featherMap, featherIds, {rings: 2});
const featherPreview = inspectHeightCellSelectionFeather(featherMap, featherIds, {rings: 2});
assert(hardFeather.summary.valid && hardFeather.summary.featheredCount === 0 && [...hardFeather.weights.values()].every(weight => weight === 1), `硬边权重异常：${JSON.stringify(hardFeather.summary)}`);
assert(oneRingFeather.summary.boundaryCount === 8 && oneRingFeather.summary.featheredCount === 8 && oneRingFeather.summary.coreCount === 1 && oneRingFeather.weights.get(6) === 0.5 && oneRingFeather.weights.get(12) === 1, `一圈羽化异常：${JSON.stringify(oneRingFeather.summary)}`);
assert(twoRingFeather.summary.boundaryCount === 8 && twoRingFeather.summary.featheredCount === 9 && twoRingFeather.summary.coreCount === 0 && twoRingFeather.weights.get(6) === 1 / 3 && twoRingFeather.weights.get(12) === 2 / 3, `两圈羽化异常：${JSON.stringify(twoRingFeather.summary)}`);
assert(!Object.hasOwn(featherPreview, "weights") && featherPreview.weightRange.join(",") === "0.333,0.667", "公开羽化摘要暴露 weights 或权重范围异常");

const featheredRangePreview = inspectHeightRangeTransform(featherMap, {scope: "land", lower: 40, upper: 40, operator: "add", operand: 12, allowedCells: oneRingFeather.weights});
const featheredRangeChanges = getHeightRangeTransformChanges(featherMap, {scope: "land", lower: 40, upper: 40, operator: "add", operand: 12, allowedCells: oneRingFeather.weights});
assert(featheredRangePreview.selectionLimited && featheredRangePreview.selectionFeathered && featheredRangePreview.selectionWeightRange.join(",") === "0.5,1", `条件变换未暴露羽化摘要：${JSON.stringify(featheredRangePreview)}`);
assert(featheredRangeChanges.find(change => change.gridCell === 6)?.after === 46 && featheredRangeChanges.find(change => change.gridCell === 12)?.after === 52, `条件变换未按羽化权重缩放：${JSON.stringify(featheredRangeChanges)}`);

const featherSmoothMap = createSquareMap(5, (x, y) => x === 2 && y === 2 ? 80 : x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 20 : 10);
const featheredGlobalPreview = inspectGlobalHeightChanges(featherSmoothMap, {action: "smooth", scope: "land", allowedCells: twoRingFeather.weights});
const featheredGlobalChanges = getGlobalHeightChanges(featherSmoothMap, {action: "smooth", scope: "land", allowedCells: twoRingFeather.weights});
assert(featheredGlobalPreview.selectionLimited && featheredGlobalPreview.selectionFeathered, `全局工具未识别羽化选区：${JSON.stringify(featheredGlobalPreview)}`);
assert(featheredGlobalChanges.find(change => change.gridCell === 12)?.after === 70, `全局平滑未按中心 2/3 权重缩放：${JSON.stringify(featheredGlobalChanges)}`);

const featherSelectionMesh = buildHeightCellSelectionMesh(createTransformPreviewMap(), [0, 1], new Map([[0, 0.25], [1, 1]]));
assert(featherSelectionMesh.stats.featheredCells === 1 && featherSelectionMesh.stats.minWeight === 0.25, `黄色 overlay 羽化统计异常：${JSON.stringify(featherSelectionMesh.stats)}`);
assert(featherSelectionMesh.vertices[5] < featherSelectionMesh.vertices[77], "黄色 overlay 没有按羽化权重降低边缘透明度");

const templateIds = HEIGHT_TERRAIN_TEMPLATE_PRESETS.map(template => template.id).join(",");
assert(templateIds === "plateau,basin,terraces,rugged" && heightTerrainTemplateUsesSeed("rugged") && !heightTerrainTemplateUsesSeed("plateau"), `模板预设注册异常：${templateIds}`);
const missingTemplateSelection = inspectHeightTerrainTemplate(createSquareMap(3, () => 40), {templateId: "plateau", scope: "land", targetHeight: 80, intensity: 1});
assert(!missingTemplateSelection.valid && missingTemplateSelection.notice.includes("锁定"), `无选区模板未被拒绝：${JSON.stringify(missingTemplateSelection)}`);
const plateauMap = createSquareMap(3, () => 40);
const plateauPreview = inspectHeightTerrainTemplate(plateauMap, {templateId: "plateau", scope: "land", targetHeight: 80, intensity: 1, allowedCells: new Set([4])});
const plateauChanges = getHeightTerrainTemplateChanges(plateauMap, {templateId: "plateau", scope: "land", targetHeight: 80, intensity: 1, allowedCells: new Set([4])});
assert(plateauPreview.valid && plateauPreview.changeCount === 1 && plateauChanges[0]?.after === 69, `高原模板异常：${JSON.stringify(plateauPreview)}`);
assert(!Object.hasOwn(plateauPreview, "changes"), "公开模板预检暴露完整 changes");
const featheredPlateau = getHeightTerrainTemplateChanges(plateauMap, {templateId: "plateau", scope: "land", targetHeight: 80, intensity: 1, allowedCells: new Map([[4, 0.5]])});
assert(featheredPlateau[0]?.after === 55, `高原模板未消费选区羽化：${JSON.stringify(featheredPlateau)}`);
const basinChanges = getHeightTerrainTemplateChanges(createSquareMap(3, () => 60), {templateId: "basin", scope: "land", targetHeight: 20, intensity: 1, allowedCells: new Set([4])});
assert(basinChanges[0]?.after === 34, `盆地模板异常：${JSON.stringify(basinChanges)}`);
const terraceMap = createSquareMap(3, () => 43);
const terraceChanges = getHeightTerrainTemplateChanges(terraceMap, {templateId: "terraces", scope: "land", terraceStep: 10, intensity: 1, allowedCells: new Set([4])});
assert(terraceChanges[0]?.after === 40, `阶地模板异常：${JSON.stringify(terraceChanges)}`);
const ruggedMap = createSquareMap(3, () => 50);
const ruggedOptions = {templateId: "rugged", scope: "land", amplitude: 20, intensity: 1, seed: 17, allowedCells: new Set(Array.from({length: 9}, (_, index) => index))};
const ruggedChanges = getHeightTerrainTemplateChanges(ruggedMap, ruggedOptions);
const repeatedRugged = getHeightTerrainTemplateChanges(ruggedMap, ruggedOptions);
const nextRugged = getHeightTerrainTemplateChanges(ruggedMap, {...ruggedOptions, seed: 18});
assert(ruggedChanges.length > 0 && JSON.stringify(ruggedChanges) === JSON.stringify(repeatedRugged), "破碎模板相同 seed 不可复现");
assert(JSON.stringify(ruggedChanges) !== JSON.stringify(nextRugged), "破碎模板不同 seed 没有改变形态");
const templateHistory = new EditHistory();
templateHistory.execute(createApplyHeightBrushCommand(plateauChanges, {label: "高原塑形"}), {map: plateauMap});
assert(plateauMap.grid.cells.h[4] === 69 && templateHistory.getStats().lastDomain === "height", "模板应用没有进入高度命令历史");
templateHistory.undo({map: plateauMap});
assert(plateauMap.grid.cells.h[4] === 40 && plateauMap.pack.cells.h[4] === 40, "撤销模板没有恢复 grid / pack");
templateHistory.redo({map: plateauMap});
assert(plateauMap.grid.cells.h[4] === 69 && plateauMap.pack.cells.h[4] === 69, "重做模板没有恢复 grid / pack");

const stableScopeMap = createSyntheticMap();
const stableScopeStroke = {originals: new Map()};
const crossSeaLevel = getHeightBrushChanges(stableScopeMap, {x: 10, y: 0}, {action: "lower", scope: "land", radius: 1, strength: 4, falloff: false}, stableScopeStroke);
applyHeightBrushPreview(stableScopeMap, crossSeaLevel);
const continuedBelowSeaLevel = getHeightBrushChanges(stableScopeMap, {x: 10, y: 0}, {action: "lower", scope: "land", radius: 1, strength: 4, falloff: false}, stableScopeStroke);
assert(continuedBelowSeaLevel[0]?.gridCell === 1 && continuedBelowSeaLevel[0]?.after === 12, "陆地 cell 跨海平面后没有按首次修改前高度继续 stroke");

const enclosedWaterMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
const enclosedWaterPreview = inspectHeightFillTarget(enclosedWaterMap, 12, {scope: "water", fillTolerance: 6});
assert(enclosedWaterPreview.valid && enclosedWaterPreview.selectionCount === 9 && enclosedWaterPreview.notice.includes("可填充 9"), `封闭水域预检异常：${JSON.stringify(enclosedWaterPreview)}`);
const enclosedWaterStroke = {originals: new Map()};
const enclosedWaterFill = getHeightBrushChanges(enclosedWaterMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, enclosedWaterStroke);
assert(enclosedWaterFill.length === 9, `封闭水域填充数量异常：${enclosedWaterFill.length}`);
assert(enclosedWaterFill.find(change => change.gridCell === 12)?.after === 32, "封闭水域中心没有形成峰值");
assert(enclosedWaterFill.find(change => change.gridCell === 6)?.after === 21, "封闭水域边缘没有保持低坡脚");
assert(enclosedWaterStroke.notice === "已锥形填充 9 cells。", `封闭水域提示异常：${enclosedWaterStroke.notice}`);
assert(getHeightBrushChanges(enclosedWaterMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, enclosedWaterStroke).length === 0, "同一 stroke 重复执行了填充");

applyHeightBrushPreview(enclosedWaterMap, enclosedWaterFill);
const fillHistory = new EditHistory();
fillHistory.execute(createApplyHeightBrushCommand(enclosedWaterFill, {label: "锥形填充"}), {map: enclosedWaterMap});
fillHistory.undo({map: enclosedWaterMap});
assert(enclosedWaterMap.grid.cells.h[12] === 10 && enclosedWaterMap.pack.cells.h[12] === 10, "撤销锥形填充没有恢复 grid / pack 中心高度");
fillHistory.redo({map: enclosedWaterMap});
assert(enclosedWaterMap.grid.cells.h[12] === 32 && enclosedWaterMap.pack.cells.h[12] === 32, "重做锥形填充没有恢复 grid / pack 中心高度");

const openWaterStroke = {originals: new Map()};
const openWaterMap = createSquareMap(5, () => 10);
const openWaterPreview = inspectHeightFillTarget(openWaterMap, 12, {scope: "water", fillTolerance: 6});
assert(!openWaterPreview.valid && openWaterPreview.selectionCount === 25 && openWaterPreview.notice.includes("开放海域"), `开放水域预检异常：${JSON.stringify(openWaterPreview)}`);
const openWaterFill = getHeightBrushChanges(openWaterMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, openWaterStroke);
assert(openWaterFill.length === 0 && openWaterStroke.notice.includes("开放海域"), `开放水域未被拒绝：${openWaterStroke.notice}`);

const missingBorderMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
delete missingBorderMap.grid.cells.b;
const missingBorderStroke = {originals: new Map()};
const missingBorderFill = getHeightBrushChanges(missingBorderMap, {x: 2, y: 2}, {action: "fill", scope: "water", strength: 4}, missingBorderStroke);
assert(missingBorderFill.length === 0 && missingBorderStroke.notice.includes("边界标记"), "缺少边界标记时仍执行了水域填充");

const landPlateauMap = createSquareMap(5, (x, y) => {
  if (x === 2 && y === 1) return 39;
  return (x === 2 && y === 2) || Math.abs(x - 2) + Math.abs(y - 2) === 1 ? 40 : 30;
});
const landFill = getHeightBrushChanges(landPlateauMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4, fillTolerance: 1}, {originals: new Map()});
assert(landFill.length === 5, `等高陆地填充数量异常：${landFill.length}`);
assert(landFill.find(change => change.gridCell === 12)?.after === 52, "等高陆地中心没有形成峰值");
assert(landFill.filter(change => change.gridCell !== 12).every(change => change.after === 41), "等高陆地坡脚高度异常");
assert(landFill.find(change => change.gridCell === 7)?.before === 39, "陆地 ±1 高度带没有纳入相邻近似等高 cell");

const defaultToleranceMap = createSquareMap(5, (x, y) => (x === 2 && y === 2) || Math.abs(x - 2) + Math.abs(y - 2) === 1 ? (x === 2 && y === 2 ? 40 : 35) : 20);
const defaultToleranceFill = getHeightBrushChanges(defaultToleranceMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4}, {originals: new Map()});
assert(defaultToleranceFill.length === 5, `默认高度容差 6 没有纳入差值 5 的邻接 cells：${defaultToleranceFill.length}`);
const defaultTolerancePreview = inspectHeightFillTarget(defaultToleranceMap, 12, {scope: "land"});
assert(defaultTolerancePreview.valid && defaultTolerancePreview.tolerance === 6 && defaultTolerancePreview.selectionCount === 5, `默认高度容差预检异常：${JSON.stringify(defaultTolerancePreview)}`);

const highBandMap = createSquareMap(5, (x, y) => {
  if (x === 2 && y === 1) return 46;
  return (x === 2 && y === 2) || Math.abs(x - 2) + Math.abs(y - 2) === 1 ? 40 : 20;
});
const highBandFill = getHeightBrushChanges(highBandMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4, fillTolerance: 6}, {originals: new Map()});
assert(!highBandFill.some(change => change.gridCell === 7), "锥形填充降低了容差带内原本更高的 cell");

const mismatchedFillStroke = {originals: new Map()};
const mismatchedFillMap = createSquareMap(5, (x, y) => x > 0 && x < 4 && y > 0 && y < 4 ? 10 : 30);
const mismatchedFill = getHeightBrushChanges(mismatchedFillMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4}, mismatchedFillStroke);
assert(mismatchedFill.length === 0 && mismatchedFillStroke.notice.includes("作用范围"), "陆地范围没有拒绝水域落点");

const tinyFillStroke = {originals: new Map()};
const tinyFillMap = createSquareMap(5, (x, y) => x === 2 && y === 2 ? 50 : 30);
const tinyFill = getHeightBrushChanges(tinyFillMap, {x: 2, y: 2}, {action: "fill", scope: "land", strength: 4}, tinyFillStroke);
assert(tinyFill.length === 0 && tinyFillStroke.notice.includes("少于 3"), `过小连通域未被拒绝：${tinyFillStroke.notice}`);

const oversizedFillStroke = {originals: new Map()};
const oversizedFill = getHeightBrushChanges(createSquareMap(20, () => 40), {x: 10, y: 10}, {action: "fill", scope: "land", strength: 4, fillTolerance: 6}, oversizedFillStroke);
assert(oversizedFill.length === 0 && oversizedFillStroke.notice.includes("安全上限 80"), `过大连通域未被拒绝：${oversizedFillStroke.notice}`);

const lineMap = createSquareMap(5, () => 40);
const lineStroke = {originals: new Map()};
const ridgeLine = getHeightLineChanges(lineMap, {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 10, lineWidth: 0.4, scope: "land", falloff: false}, lineStroke);
assert(ridgeLine.length === 5 && ridgeLine.every(change => change.after === 50), `正 power 山脊结果异常：${JSON.stringify(ridgeLine)}`);
assert(lineStroke.notice === "已生成线段地形 5 cells。", `山脊提示异常：${lineStroke.notice}`);

applyHeightBrushPreview(lineMap, ridgeLine);
const lineHistory = new EditHistory();
lineHistory.execute(createApplyHeightBrushCommand(ridgeLine, {label: "线段山脊"}), {map: lineMap});
lineHistory.undo({map: lineMap});
assert(lineMap.grid.cells.h[12] === 40 && lineMap.pack.cells.h[12] === 40, "撤销线段山脊没有恢复 grid / pack");
lineHistory.redo({map: lineMap});
assert(lineMap.grid.cells.h[12] === 50 && lineMap.pack.cells.h[12] === 50, "重做线段山脊没有恢复 grid / pack");

const troughLine = getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: -8, lineWidth: 0.4, scope: "land", falloff: false}, {originals: new Map()});
assert(troughLine.length === 5 && troughLine.every(change => change.after === 32), "负 power 沟槽没有按 signed power 降低高度");

const falloffLine = getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 10, lineWidth: 2, scope: "land", falloff: true}, {originals: new Map()});
assert(falloffLine.length === 15, `线宽衰减命中数量异常：${falloffLine.length}`);
assert(falloffLine.find(change => change.gridCell === 12)?.after === 50, "线段中心没有应用完整 power");
assert(falloffLine.find(change => change.gridCell === 7)?.after === 45, "线段侧缘没有应用横向衰减");

const zeroLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 0, lineWidth: 1, scope: "all"}, zeroLineStroke).length === 0 && zeroLineStroke.notice.includes("不能为 0"), "零 power 线段未被拒绝");
const shortLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(5, () => 40), {x: 2, y: 2}, {x: 2.2, y: 2.2}, {linePower: 10, lineWidth: 1, scope: "all"}, shortLineStroke).length === 0 && shortLineStroke.notice.includes("过近"), "同 cell 短线段未被拒绝");
const scopeLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(5, () => 40), {x: 0, y: 2}, {x: 4, y: 2}, {linePower: 10, lineWidth: 1, scope: "water"}, scopeLineStroke).length === 0 && scopeLineStroke.notice.includes("没有命中"), "线段没有遵守陆水范围");
const oversizedLineStroke = {originals: new Map()};
assert(getHeightLineChanges(createSquareMap(20, () => 40), {x: 0, y: 10}, {x: 19, y: 10}, {linePower: 10, lineWidth: 100, scope: "all"}, oversizedLineStroke).length === 0 && oversizedLineStroke.notice.includes("安全上限 80"), "过大线段选区未被拒绝");

console.log(JSON.stringify({
  ok: true,
  targetHeight: stroke.targetHeight,
  flattenAfter: flatten.map(change => change.after),
  continuedCell3: continued.find(change => change.gridCell === 3)?.after,
  falloffEdgeChanged: falloff.some(change => change.gridCell === 3),
  raiseAfter: raise.map(change => change.after),
  smoothAfter: smooth.map(change => change.after),
  disruptAfter: disrupt.map(change => change.after),
  landScope: landScope.map(change => change.gridCell),
  waterScope: waterScope.map(change => change.gridCell),
  selectionSmoothing: {magnitude: smoothingMagnitude, history: smoothingHistory.getStats()},
  globalSmooth: {cells: globalSmooth.length, center: globalSmooth.find(change => change.gridCell === 4)?.after},
  globalSmoothPreview,
  globalDisrupt: {cells: globalDisrupt.length, first: globalDisrupt[0]?.after},
  globalDisruptPreview,
  globalHistory: globalHistory.getStats(),
  multiplyPreview,
  invalidDivideNotice: invalidDivide.notice,
  rangeHistory: rangeHistory.getStats(),
  previewMesh: previewMesh.stats,
  terrainSelection: terrainSelection.summary,
  selectedRangePreview,
  selectedGlobalPreview,
  terrainSelectionMesh: terrainSelectionMesh.stats,
  selectionComposition: {
    replace: replacedSelection.summary,
    union: unionSelection.summary,
    intersect: intersectedSelection.summary,
    subtract: subtractedSelection.summary,
    rejectedEmpty: rejectedEmptySelection.summary
  },
  cursorCircleSelection: cursorCircleSelection.summary,
  cursorUnionSelection: cursorUnionSelection.summary,
  rectangleSelection: rectangleSelection.summary,
  rectangleUnionSelection: rectangleUnionSelection.summary,
  exactConnectedSelection: exactConnectedSelection.summary,
  tolerantConnectedSelection: tolerantConnectedSelection.summary,
  connectedUnionSelection: connectedUnionSelection.summary,
  paintSelection: paintSelection.summary,
  paintUnionSelection: paintUnionSelection.summary,
  savedSelection: savedSelection.summary,
  restoredSelection: restoredSelection.summary,
  grownSelection: grownSelection.summary,
  shrunkSelection: shrunkSelection.summary,
  oneRingFeather: oneRingFeather.summary,
  twoRingFeather: twoRingFeather.summary,
  featheredRangePreview,
  featheredGlobalPreview,
  featherSelectionMesh: featherSelectionMesh.stats,
  plateauPreview,
  featheredPlateau: featheredPlateau[0],
  basinChange: basinChanges[0],
  terraceChange: terraceChanges[0],
  ruggedCells: ruggedChanges.length,
  templateHistory: templateHistory.getStats(),
  continuedBelowSeaLevel: continuedBelowSeaLevel[0]?.after,
  enclosedWaterFill: {cells: enclosedWaterFill.length, edge: enclosedWaterFill.find(change => change.gridCell === 6)?.after, center: enclosedWaterFill.find(change => change.gridCell === 12)?.after},
  enclosedWaterPreview,
  openWaterNotice: openWaterStroke.notice,
  openWaterPreview,
  missingBorderNotice: missingBorderStroke.notice,
  tinyFillNotice: tinyFillStroke.notice,
  oversizedFillNotice: oversizedFillStroke.notice,
  landFill: {cells: landFill.length, center: landFill.find(change => change.gridCell === 12)?.after},
  defaultToleranceCells: defaultToleranceFill.length,
  defaultTolerancePreview,
  preservedHighBandCell: !highBandFill.some(change => change.gridCell === 7),
  fillHistory: fillHistory.getStats(),
  ridgeLine: {cells: ridgeLine.length, center: ridgeLine.find(change => change.gridCell === 12)?.after},
  troughLine: {cells: troughLine.length, center: troughLine.find(change => change.gridCell === 12)?.after},
  falloffLine: {cells: falloffLine.length, center: falloffLine.find(change => change.gridCell === 12)?.after, side: falloffLine.find(change => change.gridCell === 7)?.after},
  oversizedLineNotice: oversizedLineStroke.notice,
  lineHistory: lineHistory.getStats(),
  history: history.getStats()
}, null, 2));

function createSyntheticMap() {
  return {
    metadata: {},
    grid: {
      points: [[0, 0], [10, 0], [20, 0], [30, 0]],
      cells: {
        p: Uint32Array.from([0, 1, 2, 3]),
        h: Uint8Array.from([10, 20, 30, 50])
      }
    },
    pack: {
      cells: {
        g: Uint32Array.from([0, 1, 2, 3]),
        h: Uint8Array.from([10, 20, 30, 50])
      }
    }
  };
}

function createSquareMap(size, getHeight) {
  const points = [];
  const neighbors = [];
  const borders = new Uint8Array(size * size);
  const heights = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = y * size + x;
      points.push([x, y]);
      heights[cell] = getHeight(x, y);
      borders[cell] = x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 1 : 0;
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
    grid: {
      points,
      cells: {
        i: Uint32Array.from(points, (_, index) => index),
        p: Uint32Array.from(points, (_, index) => index),
        c: neighbors,
        b: borders,
        h: heights
      }
    },
    pack: {
      cells: {
        g: Uint32Array.from(points, (_, index) => index),
        h: Uint8Array.from(heights)
      }
    }
  };
}

function createTransformPreviewMap() {
  return {
    metadata: {graphWidth: 2, graphHeight: 1},
    grid: {
      points: [[0.5, 0.5], [1.5, 0.5]],
      cells: {
        p: Uint32Array.from([0, 1]),
        v: [[0, 1, 2, 3], [1, 4, 5, 2]]
      },
      vertices: {
        p: [[0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1]]
      }
    }
  };
}

function assertChanges(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}变化异常：${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
