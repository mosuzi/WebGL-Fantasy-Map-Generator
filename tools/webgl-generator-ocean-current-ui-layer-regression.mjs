import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createRenderContext} from "../app/webgl-generator/src/renderer/render-context.js";
import {oceanCurrentBounds, oceanCurrentWidth, pushOceanCurrentLayer} from "../app/webgl-generator/src/renderer/ocean-current-layer.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRegenerateOceanCurrentsCommand, createRenameOceanCurrentCommand} from "../app/webgl-generator/src/runtime/ocean-current-edit-commands.js";

const map = generatePlaceholderMap({seed: "ocean-current-ui-layer", cellsTarget: 10000});
const currents = map.oceanCurrents?.currents || [];
assert.ok(currents.length > 0, "真实生成图没有可供面板和箭头图层使用的洋流");

const context = createRenderContext(map);
const visibleVertices = [];
const visibleStats = pushOceanCurrentLayer(visibleVertices, context, map, {oceanCurrents: true});
assert.equal(visibleStats.currents, currents.length, "可见洋流图层没有绘制全部主要洋流");
assert.equal(visibleStats.arrowheads, currents.length * 2, "每条主要洋流必须使用两个稀疏方向箭头");
assert.ok(visibleStats.vertexCount > 0 && visibleStats.maxWidth >= visibleStats.minWidth, "洋流箭头图层顶点或线宽统计异常");

const hiddenVertices = [1, 2, 3];
const hiddenStats = pushOceanCurrentLayer(hiddenVertices, context, map, {oceanCurrents: false});
assert.deepEqual(hiddenVertices, [1, 2, 3], "关闭洋流图层时仍写入了线层顶点");
assert.deepEqual(hiddenStats, {currents: 0, arrowheads: 0, highlighted: 0, vertexCount: 0, minWidth: 0, maxWidth: 0}, "关闭洋流图层后的统计未清空");

const weakWidth = oceanCurrentWidth(0.1);
const strongWidth = oceanCurrentWidth(0.9);
const highlightedWidth = oceanCurrentWidth(0.9, {highlighted: true});
assert.ok(weakWidth < strongWidth && strongWidth < highlightedWidth, "洋流线宽没有随强度与高亮状态递增");
const highlightedVertices = [];
const highlightedStats = pushOceanCurrentLayer(highlightedVertices, context, map, {oceanCurrents: true}, new Set([String(currents[0].id)]));
assert.equal(highlightedStats.highlighted, 1, "洋流高亮没有写入独立箭头图层");
const bounds = oceanCurrentBounds(currents[0]);
assert.ok(bounds && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, "洋流定位边界无效");

const history = new EditHistory();
const contextWithMap = {map};
const originalName = currents[0].name;
const renamedName = `${originalName}（校订）`;
const renameCommand = createRenameOceanCurrentCommand(currents[0].id, renamedName);
history.execute(renameCommand, contextWithMap);
assert.equal(map.oceanCurrents.currents[0].name, renamedName, "洋流改名命令未生效");
assert.deepEqual(renameCommand.effects.derived, ["line-layers"], "洋流改名没有声明局部线层刷新");
history.undo(contextWithMap);
assert.equal(map.oceanCurrents.currents[0].name, originalName, "撤销洋流改名没有恢复原名");
history.redo(contextWithMap);
assert.equal(map.oceanCurrents.currents[0].name, renamedName, "重做洋流改名没有恢复新名");

const beforeRegenerate = structuredClone(map.oceanCurrents);
const regenerateCommand = createRegenerateOceanCurrentsCommand(map, {seed: "ocean-current-ui-recalculate"});
history.execute(regenerateCommand, contextWithMap);
const afterRegenerate = structuredClone(map.oceanCurrents);
assert.notDeepEqual(afterRegenerate, beforeRegenerate, "重新计算洋流没有产生新模型");
assert.equal(history.getStats().undo, 2, "洋流改名和重算没有各自形成单条历史");
history.undo(contextWithMap);
assert.deepEqual(map.oceanCurrents, beforeRegenerate, "撤销洋流重算没有精确恢复原模型");
history.redo(contextWithMap);
assert.deepEqual(map.oceanCurrents, afterRegenerate, "重做洋流重算没有精确恢复新模型");

const [rendererSource, appSource, controlSource, panelSource, panelWrapperSource, pngSource, stylesSource] = await Promise.all([
  readSource("../app/webgl-generator/src/renderer/placeholder-renderer.js"),
  readSource("../app/webgl-generator/src/runtime/app.js"),
  readSource("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue"),
  readSource("../app/webgl-generator/src/ui/vue/components/OceanCurrentPanel.vue"),
  readSource("../app/webgl-generator/src/ui/panels/ocean-current-panel.js"),
  readSource("../app/webgl-generator/src/runtime/map-file-io.js"),
  readSource("../app/webgl-generator/src/styles.css")
]);
assert.match(controlSource, /\{id: "oceanCurrents", label: "洋流"\}/, "控制面板没有独立洋流图层开关");
assert.match(controlSource, /\["open-ocean-current-panel", "洋流管理"\]/, "控制面板没有洋流管理入口");
assert.match(appSource, /onOpenOceanCurrentPanel[\s\S]{0,220}?panels\.oceanCurrent\.open/, "洋流管理入口没有接到运行时");
assert.match(appSource, /createRenameOceanCurrentCommand[\s\S]{0,10000}?createRegenerateOceanCurrentsCommand/, "洋流面板没有接入改名和重算命令");
assert.match(rendererSource, /pushOceanCurrentLayer\([\s\S]{0,300}?oceanCurrentHighlights/, "实时渲染器没有接入洋流箭头与高亮");
assert.match(rendererSource, /setLayerVisible\([\s\S]{0,1400}?oceanCurrents/, "洋流图层没有独立刷新路径");
assert.match(panelSource, /empty-text="当前地图没有洋流"/, "洋流面板缺少旧地图空模型提示");
assert.match(panelSource, /surface-gyres-v1[\s\S]{0,180}?简化表层环流[\s\S]{0,180}?surface-gyres-v2[\s\S]{0,180}?增强表层环流/, "洋流面板没有同时提供新旧算法的玩家名称");
assert.doesNotMatch(panelSource, /control1|control2|path\.segments/, "洋流面板不得暴露路径控制点编辑");
assert.match(panelWrapperSource, /onClose:[\s\S]{0,180}?onHighlight\?\.\(\[\]\)/, "关闭洋流面板时没有清除高亮");
assert.match(pngSource, /copyWebglCanvasTo2d\([\s\S]{0,700}?renderer\.draw\(\)/, "PNG 没有复用实时 WebGL 画布语义");
assert.match(stylesSource, /@media \(max-width: 620px\)[\s\S]{0,220}?\.ocean-current-panel-controls/, "洋流面板缺少窄视口布局");

console.log(JSON.stringify({
  ok: true,
  currents: currents.length,
  arrows: visibleStats.arrowheads,
  vertices: visibleStats.vertexCount,
  width: {weak: weakWidth, strong: strongWidth, highlighted: highlightedWidth},
  history: history.getStats()
}, null, 2));

function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}
