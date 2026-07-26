import assert from "node:assert/strict";
import {buildFixtureManifest, buildInteractionInventory, SOURCE_TYPES} from "./webgl-generator-interaction-surface-inventory.mjs";

const inventory = buildInteractionInventory();
const manifest = buildFixtureManifest();

assert.equal(inventory.totals.unclassified, 0, "所有交互表面必须进入七类来源之一");
assert.equal(inventory.totals.missingExclusionReason, 0, "所有 excluded 表面必须给出排除理由");
assert.equal(inventory.rows.length, new Set(inventory.rows.map(row => row.surfaceId)).size, "surfaceId 必须唯一");
assert.deepEqual(Object.keys(inventory.totals.bySourceType), SOURCE_TYPES, "来源类型顺序必须稳定");
assert.ok(SOURCE_TYPES.every(type => inventory.totals.bySourceType[type] > 0), "七类来源都必须有发现项");

const includedPanelRows = inventory.rows.filter(row => row.included && ["vue-panel-detail", "non-vue-panel"].includes(row.sourceType));
assert.equal(includedPanelRows.length, 28, "当前 PanelManager 分母应为 27 个 Vue 面板加 1 个非 Vue 开发面板");
assert.ok(includedPanelRows.every(row => row.panelIdentity?.role && typeof row.panelIdentity.persistOpen === "boolean" && row.panelIdentity.closeBehavior && row.panelIdentity.stateSource && row.panelIdentity.mainState.length), "每个面板必须冻结 role、persistOpen、关闭行为、状态来源和主要状态");
assert.equal(inventory.rows.filter(row => row.surfaceId.startsWith("fixed-overlay:action-dock:")).length, 18, "动作坞必须按 18 个宿主上下文展开");
assert.equal(inventory.rows.filter(row => row.surfaceId.startsWith("fixed-overlay:tree:")).length, 2, "树状浮层必须按文化和宗教两个宿主展开");
assert.ok(inventory.rows.some(row => row.surfaceId === "canvas:map-canvas"), "基础画布手势必须单列");
assert.ok(inventory.rows.some(row => row.surfaceId === "canvas:measurement-overlay"), "测量 SVG 控制点必须单列");
assert.ok(inventory.rows.some(row => row.surfaceId === "resident:measurement-readout"), "测量读数条必须单列");
assert.ok(inventory.rows.some(row => row.surfaceId === "global:worker-generation" && !row.included && row.exclusionReason), "worker 内部事件必须保留 excluded 记录与理由");
assert.ok(inventory.rows.filter(row => row.sourceType === "global-event" && row.included).every(row => row.eventOrCallback), "全局监听必须按当前 checkout 自动发现并分类");

assert.deepEqual(manifest.fixtures.map(item => item.id), ["F0", "F1", "F2", "F3", "F4", "F5", "F6"], "固定场景必须完整且有序");
assert.ok(manifest.fixtures.every(item => item.staticReady && item.browserPrepared && !item.browserVerified && item.stableKey.length === 64), "固定场景必须具备静态证据与浏览器步骤，但第 101 项不能提前声明浏览器已验证");
assert.ok(manifest.fixtures.every(item => item.evidence.length > 0 && item.evidence.every(file => file.exists)), "固定场景声明必须由现有证据文件支撑");
assert.ok(manifest.fixtures.every(item => item.browserSteps.length > 0), "固定场景必须提供精确浏览器构造步骤");
assert.deepEqual(manifest.viewports.map(item => item.id), ["desktop", "narrow", "css-stress"], "必须冻结三档视口");
assert.deepEqual(Object.keys(manifest.evidenceLevels), ["E-C", "E-S", "E-F", "E-N"], "证据等级必须完整");
assert.equal(manifest.resetContract.length, 6, "状态复位契约必须覆盖六个步骤");

console.log(JSON.stringify({
  surfaces: inventory.totals,
  panelManagerSurfaces: includedPanelRows.length,
  actionDockHosts: 18,
  treeHosts: 2,
  fixtures: manifest.fixtures.map(item => item.id),
  browserVerified: manifest.fixtures.filter(item => item.browserVerified).length,
  viewports: manifest.viewports.map(item => item.id)
}, null, 2));
