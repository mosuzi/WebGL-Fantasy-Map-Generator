import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRenameOceanCurrentCommand} from "../app/webgl-generator/src/runtime/ocean-current-edit-commands.js";

const runtime = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8");

const modeBlock = runtime.match(/export const CANVAS_TOOL_MODE = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1] || "";
const modeKeys = [...modeBlock.matchAll(/^\s*([A-Z0-9_]+):\s*"([^"]+)",?$/gm)].map(match => match[1]).sort();
const feedbackBlock = runtime.match(/export const CANVAS_TOOL_MODE_FEEDBACK = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1] || "";
const feedbackRows = [...feedbackBlock.matchAll(/\[CANVAS_TOOL_MODE\.([A-Z0-9_]+)\]: canvasToolModeFeedback\("([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)"\),?/g)]
  .map(([, key, name, nextAction, category, cursor]) => ({key, name, nextAction, category, cursor}));
const expectedFeedbackSemantics = Object.freeze({
  HEIGHT_BRUSH: ["brush", "none"],
  STATE_BRUSH: ["brush", "none"],
  STATE_ADD: ["one-shot", "crosshair"],
  STATE_DELETE: ["one-shot", "crosshair"],
  PROVINCE_BRUSH: ["brush", "none"],
  PROVINCE_ADD: ["one-shot", "crosshair"],
  PROVINCE_DELETE: ["one-shot", "crosshair"],
  CITY_ADD: ["one-shot", "crosshair"],
  CITY_DELETE: ["one-shot", "crosshair"],
  CITY_MOVE: ["move", "grab"],
  CULTURE_ASSIGN: ["brush", "none"],
  RELIGION_ASSIGN: ["brush", "none"],
  CULTURE_CENTER: ["pick", "cell"],
  RELIGION_CENTER: ["pick", "cell"],
  BIOME_ASSIGN: ["brush", "none"],
  SUITABILITY_PAINT: ["brush", "none"],
  MARKET_ASSIGN: ["brush", "none"],
  MEASUREMENT_DRAW: ["persistent", "crosshair"],
  MARKER_ADD: ["one-shot", "crosshair"],
  MARKER_MOVE: ["move", "grab"],
  ROUTE_DRAW: ["one-shot", "crosshair"],
  ROUTE_EDIT_WAYPOINT: ["pick", "cell"],
  RIVER_ADD: ["one-shot", "crosshair"],
  LAKE_EXCAVATE: ["one-shot", "crosshair"],
  FEATURE_PATCH_SELECT: ["pick", "cell"],
  FEATURE_TOPOLOGY_SELECT: ["persistent", "cell"],
  ZONE_ADD: ["one-shot", "crosshair"],
  NOTE_ADD: ["one-shot", "crosshair"],
  REGENERATION_LOCK_SELECT: ["persistent", "cell"]
});

assert.equal(modeKeys.length, 29, "画布模式分母必须保持 29 项");
assert.deepEqual(feedbackRows.map(row => row.key).sort(), modeKeys, "画布模式提示字典与运行时模式键双向差集必须为零");
assert.ok(feedbackRows.every(row => row.name && row.nextAction && row.category && row.cursor), "每项提示必须包含模式名、下一步、类别和光标");
assert.deepEqual(
  Object.fromEntries(feedbackRows.map(row => [row.key, [row.category, row.cursor]])),
  expectedFeedbackSemantics,
  "29 个模式必须逐项符合持续、两阶段一次性、创建、移动与拾取的原始语义"
);
assert.match(feedbackRows.find(row => row.key === "ROUTE_DRAW")?.nextAction || "", /起点和终点.*退出/, "路线绘制必须表达两阶段一次性语义");
assert.match(feedbackRows.find(row => row.key === "FEATURE_TOPOLOGY_SELECT")?.nextAction || "", /持续选区/, "feature 拓扑选择必须表达持续模式语义");
assert.match(feedbackRows.find(row => row.key === "MARKER_ADD")?.name || "", /新增标记/, "标记新增必须保持创建语义");
assert.ok(["CULTURE_CENTER", "RELIGION_CENTER"].every(key => feedbackRows.find(row => row.key === key)?.name.startsWith("拾取")), "文化与宗教中心必须保持拾取语义");
assert.equal(feedbackRows.filter(row => row.category === "brush").length, 8, "八个连续笔刷必须使用 brush 类别");
assert.equal(feedbackRows.filter(row => row.category === "persistent").length, 3, "非笔刷持续模式必须保持三项");
assert.equal(feedbackRows.filter(row => row.category === "one-shot").length, 12, "单次创建 / 删除模式必须保持十二项");
assert.equal(feedbackRows.filter(row => row.category === "move").length, 2, "移动模式必须保持两项");
assert.equal(feedbackRows.filter(row => row.category === "pick").length, 4, "拾取模式必须保持四项");
assert.ok(feedbackRows.filter(row => row.category === "brush").every(row => row.cursor === "none"), "连续笔刷必须让 brush overlay 接管光标");
assert.equal(feedbackRows.find(row => row.key === "MEASUREMENT_DRAW")?.cursor, "crosshair", "测量模式必须使用 crosshair");
assert.ok(feedbackRows.filter(row => row.category !== "brush").every(row => !["", "auto", "default", "none"].includes(row.cursor)), "非笔刷模式不得回落默认光标");

assert.match(html, /id="canvas-tool-mode-feedback" role="status" aria-live="polite" hidden/, "地图舞台必须提供持久 role=status 提示层");
assert.match(styles, /\.canvas-tool-mode-feedback\[hidden\]\s*\{\s*display: none;/, "模式提示层必须可即时隐藏");
assert.match(runtime, /onEnter: payload => \{[\s\S]*showCanvasToolModeFeedback\(state, documentRef, modeId\)/, "进入模式必须显示统一提示");
assert.match(runtime, /const exit = payload => \{[\s\S]*clearCanvasToolModeFeedback\(state, documentRef\)/, "取消与完成必须经统一出口清理提示");
assert.match(runtime, /state\.canvasToolModes\.reset\("map-replace"\);\s*clearCanvasToolModeFeedback\(state, documentRef\);/, "换图必须立即清理提示");
assert.match(runtime, /style\.setProperty\("cursor", contract\.cursor\)/, "模式契约必须驱动画布光标");
assert.match(runtime, /style\.removeProperty\("cursor"\)/, "退出模式必须恢复画布光标");

assert.match(runtime, /const locateAndSelectObject[\s\S]*?无法定位\$\{kindLabel\}[\s\S]*?refreshRuntimeAndPickPanels/, "共享定位失败必须显示领域可读反馈");
assert.match(runtime, /onLocate: row => \{[\s\S]*?关联对象不存在、已删除或已成为孤儿/, "孤儿备注定位必须显示显式反馈");
assert.match(runtime, /onLocate: current => \{[\s\S]*?无法定位洋流[\s\S]*?locateBounds[\s\S]*?无法定位洋流/, "洋流定位的无边界与定位失败路径都必须反馈");
assert.match(runtime, /const noopStatus = options\.noopStatus \|\| renameCommandNoopStatus\(command\)/, "重命名 no-op 必须有共享回退反馈");
assert.match(runtime, /if \(!label\.startsWith\("重命名"\)\) return "";/, "共享 no-op 回退只能识别明确的重命名命令");

const oceanMap = {oceanCurrents: {currents: [{id: "c1", name: "暖流"}]}};
assert.equal(createRenameOceanCurrentCommand("c1", "  ").isNoop({map: oceanMap}), true, "洋流空名称必须进入可反馈的 no-op，而不是在命令构造时抛错");
assert.equal(createRenameOceanCurrentCommand("c1", "暖流").isNoop({map: oceanMap}), true, "洋流同名必须保持 no-op");

console.log(JSON.stringify({
  modes: modeKeys.length,
  categories: Object.fromEntries(["brush", "persistent", "one-shot", "move", "pick"].map(category => [category, feedbackRows.filter(row => row.category === category).length])),
  locateFeedback: true,
  renameNoopFeedback: true
}, null, 2));
