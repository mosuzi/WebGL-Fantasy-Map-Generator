#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildObjectPickingIndex, rebuildRoutesInPickingIndex} from "../app/webgl-generator/src/renderer/picking.js";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [app, consoleApi, health, renderer, picking, shoreLayer, scheduler, panel, developmentPanel, geographyWorkerRuntime] = await Promise.all([
  read("app/webgl-generator/src/runtime/app.js"),
  read("app/webgl-generator/src/runtime/console-api.js"),
  read("app/webgl-generator/src/runtime/health-monitor.js"),
  read("app/webgl-generator/src/renderer/placeholder-renderer.js"),
  read("app/webgl-generator/src/renderer/picking.js"),
  read("app/webgl-generator/src/renderer/shore-layer.js"),
  read("app/webgl-generator/src/runtime/edit-refresh-scheduler.js"),
  read("app/webgl-generator/src/ui/panel.js"),
  read("app/webgl-generator/src/ui/panels/development-panel.js"),
  read("app/webgl-generator/src/domains/features/worker-runtime.ts")
]);

assert.match(health, /longTaskMs:\s*200/u, "产品健康监测没有覆盖 201～249ms LongTask");
assert.match(consoleApi, /revision:\s*state\?\.mapRevision\?\.getSnapshot/u, "运行时诊断没有直接暴露 map revision");
assert.match(consoleApi, /thresholds:\s*state\?\.healthMonitor\?\.thresholds/u, "运行时诊断没有暴露实际 LongTask 阈值");
assert.match(app, /scheduleLazyVuePanelPreload\(documentRef, \{reason: "map-ready", execute: false\}\)/u, "map-ready 后仍可能主动执行动态面板模块");
assert.match(app, /updateRuntimeDisplayPreferenceStats\(documentRef, state, key\)/u, "平滑边界仍刷新完整运行时面板");
assert.match(app, /state\.renderer\?\.getDisplayState\?\.\(\)/u, "显示动作结果仍依赖完整 renderer stats");
assert.match(renderer, /getDisplayState\(\) \{/u, "renderer 缺少轻量显示状态快照");
assert.match(renderer, /refreshGpuResidentSmoothCellBorders\(\)[\s\S]*?this\.draw\(\{updateDynamicBuffers: false, updateOverlay: false\}\);/u, "平滑边界切换仍重建无关动态缓冲或 overlay");
assert.match(app, /lineResidentMode:\s*"smooth-hard-pair"/u, "存档导入没有在 map-ready 前准备平滑与硬边界两套岸线");
assert.match(app, /MAP_LOAD_YIELD_FALLBACK_MS = 24/u, "存档安装阶段仍可能在后台标签页每次空等 120ms");
assert.match(shoreLayer, /pushSourceEdgeShoreLines\(vertices, context, paths/u, "硬边界仍重复扫描整张 grid 求共享边");
assert.match(app, /ROUTE_REGENERATION_TRANSACTION_EFFECTS[\s\S]*?"route-mesh"[\s\S]*?"route-picking"[\s\S]*?"object-panels"/u, "道路重生成历史没有使用路线领域刷新清单");
assert.match(app, /new Promise\(resolve => globalThis\.setTimeout\(resolve, 0\)\)\.then\(\(\) => captureCommandMapReplicaWritesAsync/u, "历史命令仍会在输入事件返回前同步启动大范围地图副本捕获");
assert.match(scheduler, /effects\.derived\.includes\("route-picking"\)[\s\S]*?refreshRoutePickingIndex/u, "异步历史刷新不支持路线拾取局部重建");
assert.match(renderer, /refreshRoutePickingIndex\(binding = null\)/u, "renderer 缺少路线拾取局部重建入口");
assert.match(renderer, /rebuildRoutesInPickingIndex\(this\.objectPickingIndex, routes\)/u, "路线历史刷新没有从当前路线全集重建拾取桶");
assert.match(picking, /for \(const bucket of index\.buckets\.values\(\)\) bucket\.routeSegments = \[\];/u, "路线拾取重建没有先清除已删除路线段");
assert.match(geographyWorkerRuntime, /expectedOwners = new Map<string, Set<number>>\(\)[\s\S]*?owners\?\.has\(owner\)/u, "道路 Worker 校验仍把共享边误判为只能由遍历末项持有");
assert.match(panel, /statRow\(documentRef, "地图版本",/u, "开发摘要没有直接显示地图 revision");
assert.match(panel, /statRow\(documentRef, "LongTask 门",/u, "开发摘要没有直接显示 LongTask 门槛");
assert.match(panel, /statRow\(documentRef, "边界刷新",/u, "开发摘要没有直接显示边界刷新分段");
assert.match(developmentPanel, /detail\.timings/u, "健康事件没有显示慢操作分段");
for (const key of ["cell-surface-mode", "map-edge-fade", "boundary-line-mode", "boundary-resource"]) {
  assert.match(panel, new RegExp(`statKey: "${key}"`, "u"), `开发摘要缺少 ${key} 定点更新锚点`);
}

const oldRoutes = [
  {id: 0, points: [[5, 5], [35, 5]]},
  {id: 1, points: [[5, 20], [35, 20]]},
  {id: 2, points: [[5, 35], [35, 35]]}
];
const currentRoutes = [
  {id: 0, points: [[5, 5], [35, 5]]}
];
const routeMap = {
  metadata: {graphWidth: 100, graphHeight: 100},
  settlements: {cities: [], routes: oldRoutes},
  markers: {markers: []},
  military: {regiments: []},
  rivers: {rivers: []}
};
const routePicking = buildObjectPickingIndex(routeMap);
assert(rebuildRoutesInPickingIndex(routePicking, currentRoutes), "路线拾取全集重建失败");
const rebuiltSegments = [...routePicking.buckets.values()].flatMap(bucket => bucket.routeSegments);
assert(rebuiltSegments.length > 0, "路线拾取全集重建没有写入当前路线");
assert.deepEqual([...new Set(rebuiltSegments.map(segment => segment.route.id))], [0], "路线拾取全集重建遗留已删除路线 id");
assert.equal(routePicking.routeSegmentCount, 1, "路线拾取全集重建统计没有对应当前路线");

console.log(JSON.stringify({
  ok: true,
  longTaskThresholdMs: 200,
  lazyPanels: "on-demand",
  displayStats: "targeted",
  revision: "direct"
}, null, 2));
