#!/usr/bin/env node
import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";

const root = new URL("../app/webgl-generator/src/", import.meta.url);
const componentRoot = new URL("ui/vue/components/", root);
const [
  controlSource,
  featureSource,
  markerSource,
  markerPanelSource,
  measurementSource,
  measurementReadoutSource,
  objectTableSource,
  actionDockSource,
  stateBannerSource,
  heightSource,
  heightPanelSource,
  appSource,
  notesSource,
  namebaseSource,
  styleSource
] = await Promise.all([
  readFile(new URL("ControlPanel.vue", componentRoot), "utf8"),
  readFile(new URL("FeaturePanel.vue", componentRoot), "utf8"),
  readFile(new URL("MarkerPanel.vue", componentRoot), "utf8"),
  readFile(new URL("ui/panels/marker-panel.js", root), "utf8"),
  readFile(new URL("MeasurementPanel.vue", componentRoot), "utf8"),
  readFile(new URL("MeasurementReadout.vue", componentRoot), "utf8"),
  readFile(new URL("base/UiObjectTable.vue", componentRoot), "utf8"),
  readFile(new URL("base/UiActionDock.vue", componentRoot), "utf8"),
  readFile(new URL("base/UiStateBanner.vue", componentRoot), "utf8"),
  readFile(new URL("HeightPanel.vue", componentRoot), "utf8"),
  readFile(new URL("ui/panels/height-panel.js", root), "utf8"),
  readFile(new URL("runtime/app.js", root), "utf8"),
  readFile(new URL("NotesPanel.vue", componentRoot), "utf8"),
  readFile(new URL("NamebasePanel.vue", componentRoot), "utf8"),
  readFile(new URL("styles.css", root), "utf8")
]);

const controlTemplate = templateOf(controlSource);
const featureTemplate = templateOf(featureSource);
const markerTemplate = templateOf(markerSource);
const measurementTemplate = templateOf(measurementSource);

for (const term of ["资源点与通用标记", "水体与地貌", "测量对象", "测量标注"]) {
  assert(controlSource.includes(term), `控制面板缺少统一术语：${term}`);
}
for (const term of ["地貌单元", "采样格"]) assert(featureSource.includes(term), `水体与地貌面板缺少 ${term}`);
assert(!featureTemplate.includes('empty-text="没有匹配的 feature"') && !featureSource.includes('{label: "feature"'), "水体与地貌面板仍向用户显示 feature");
for (const term of ["资源点", "通用标记", "资源点与通用标记列表操作"]) assert(markerTemplate.includes(term), `标记面板缺少 ${term}`);
for (const stale of ["资源点或标记", "资源与标记管理"]) {
  assert(!markerTemplate.includes(stale) && !markerPanelSource.includes(stale), `标记术语仍包含 ${stale}`);
}
assert(measurementTemplate.includes("测量对象列表操作"), "测量管理没有明确使用测量对象术语");
assert(measurementReadoutSource.includes('id="measurement-objects">测量对象'), "测量创建工具没有明确区分测量对象入口");

for (const signature of ["aria-selected", ":data-ui-state", 'data-ui-state="empty"']) assert(objectTableSource.includes(signature), `表格共享状态缺少 ${signature}`);
for (const signature of ["aria-pressed", 'data-ui-state="editing"', "编辑中", "关闭二级编辑面板", "useManagedOverlay"]) assert(actionDockSource.includes(signature), `编辑共享状态缺少 ${signature}`);
for (const label of ["已选中", "编辑中", "预览中", "待派生", "暂无数据", "操作失败", "孤儿对象"]) assert(stateBannerSource.includes(label), `状态横幅缺少 ${label}`);
assert(heightSource.includes('kind="preview"') && heightSource.includes("退出预览"), "高度预览没有共享状态和退出动作");
assert(heightPanelSource.includes("onPreviewCancel"), "高度面板桥接缺少退出预览");
assert(appSource.includes("onPreviewCancel") && appSource.includes("clearHeightTransformPreview(state)"), "高度运行时没有清理全部预览");
assert(namebaseSource.includes('data-ui-state="preview"'), "名称库导入预览没有共享预览状态");

assert(heightSource.includes('kind="stale"') && heightSource.includes("重建地貌与聚落") && heightSource.includes("重建世界内容"), "调试模式待派生状态缺少稳定分步恢复动作");
for (const signature of ['class="height-derived-banner"', 'title="地图内容待更新"', "完成后统一更新。", "完成编辑并更新地图"]) {
  assert(heightSource.includes(signature), `高度待更新提示缺少简化契约：${signature}`);
}
assert(!heightSource.includes("formatDerivedUpdateHint"), "高度待更新提示仍展开内部派生系统");
assert(styleSource.includes(".height-derived-banner .ui-state-banner-actions"), "高度待更新按钮缺少局部防重叠布局");
assert(styleSource.includes(".height-derived-banner .ui-state-token"), "高度待更新提示仍显示技术状态徽标");
assert(notesSource.includes('kind="orphan"') && notesSource.includes("删除这条孤儿备注"), "孤儿备注缺少明确恢复动作");
assert(controlTemplate.includes("file-operation-clear-error") && controlTemplate.includes("清除错误并重试"), "导入失败缺少恢复动作");
assert(appSource.includes("fileOperationFeedbackState") && appSource.includes('return "error"'), "文件操作没有稳定错误状态");
for (const signature of [".ui-state-banner", ".is-preview", ".is-stale", ".is-error", ".is-orphan", ".is-editing"]) {
  assert(styleSource.includes(signature), `共享状态样式缺少 ${signature}`);
}

const componentFiles = (await readdir(componentRoot)).filter(name => name.endsWith("Panel.vue"));
const filteredTables = [];
for (const name of componentFiles) {
  const source = await readFile(new URL(name, componentRoot), "utf8");
  if (!source.includes("<UiFilterInput") || !source.includes("<UiObjectTable")) continue;
  filteredTables.push(name);
  assert(source.includes(":empty-action="), `${name} 的筛选空态没有恢复动作`);
  assert(source.includes("clear-filter"), `${name} 的筛选空态没有清空筛选动作`);
}
assert(filteredTables.length >= 20, "筛选空态覆盖面不足");

console.log(JSON.stringify({
  ok: true,
  terminology: {
    marker: ["资源点", "通用标记"],
    terrain: ["水体与地貌", "湖泊", "地貌单元"],
    measurement: ["测量", "测量对象"]
  },
  states: ["selected", "editing", "preview", "stale", "empty", "error", "orphan"],
  filteredTableRecoveryPanels: filteredTables.length
}, null, 2));

function templateOf(source) {
  const end = source.lastIndexOf("</template>");
  assert(end >= 0, "Vue 组件缺少 template");
  return source.slice(0, end);
}
