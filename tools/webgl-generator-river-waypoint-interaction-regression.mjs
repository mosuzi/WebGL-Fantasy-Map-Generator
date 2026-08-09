#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {buildSelectionMeshBundle, buildSelectionMeshVertices} from "../app/webgl-generator/src/renderer/selection-layer.js";
import {createCanvasToolModeManager} from "../app/webgl-generator/src/runtime/canvas-tool-mode-manager.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createAddRiverVisualWaypointCommand, inspectRiverVisualWaypoint} from "../app/webgl-generator/src/runtime/river-edit-commands.js";
import {createRiverWaypointSession, withRiverWaypointPreviewSuppressed} from "../app/webgl-generator/src/runtime/river-waypoint-session.js";

const map = createFixture();
const river = map.rivers.rivers[0];
const pointsBefore = structuredClone(river.points);
const hydrologyBefore = hydrologySnapshot(river);
const history = new EditHistory();

let draft = inspectRiverVisualWaypoint(map, river.id, 2);
assert.equal(draft.valid, true, draft.reason);
assert.equal(draft.insertIndex, 1);
assert.equal(draft.packCell, 2);
assert.ok(draft.distance > 0);
assert.equal(draft.points.length, pointsBefore.length + 1);
assert.deepEqual(river.points, pointsBefore, "候选预检不得修改正式河道");
assert.equal(history.getStats().undo, 0, "候选预检不得写历史");

const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 1000, height: 700, clientWidth: 1000, clientHeight: 700};
const previewVertices = buildSelectionMeshVertices(map, camera, canvas, null, null, [], draft);
assert.ok(previewVertices.length > 0, "候选折线与节点必须生成独立选择层 mesh");
assert.ok([...previewVertices].every(Number.isFinite), "候选预览 mesh 不得包含无效坐标");
const validPreviewBundle = buildSelectionMeshBundle(map, camera, canvas, null, null, [], draft);
assert.equal(validPreviewBundle.drawRanges.landMasked.count, 0);
assert.ok(validPreviewBundle.drawRanges.ordinary.count > 0, "自由控制点曲线与节点必须走不裁剪水域的可见层");
assert.equal(buildSelectionMeshVertices(map, camera, canvas, null, null, [], null).length, 0, "清除候选后选择层不得残留预览");

draft = inspectRiverVisualWaypoint(map, river.id, 3);
assert.equal(draft.valid, true, "再次拾取必须能替换候选");
assert.deepEqual(river.points, pointsBefore);
draft = null;
assert.deepEqual(river.points, pointsBefore, "重新选择或取消草稿不得写正式河道");
assert.equal(history.getStats().undo, 0);

const duplicate = inspectRiverVisualWaypoint(map, river.id, 0);
assert.equal(duplicate.valid, true, "同一位置也允许新增独立控制点");
const invalid = inspectRiverVisualWaypoint(map, river.id, 999);
assert.equal(invalid.valid, false);
assert.equal(invalid.code, "invalid-cell");
const far = inspectRiverVisualWaypoint(map, river.id, 4);
assert.equal(far.valid, true, "远离原河段的陆地点也必须允许");
history.execute(createAddRiverVisualWaypointCommand(river.id, 4), {map});
assert.equal(history.getStats().undo, 1, "远离原河段的候选也必须可以写历史");
history.undo({map});
assert.equal(history.getStats().undo, 0);
const farPreviewBundle = buildSelectionMeshBundle(map, camera, canvas, null, null, [], far);
assert.equal(farPreviewBundle.drawRanges.landMasked.count, 0);
assert.ok(farPreviewBundle.drawRanges.ordinary.count > 0, "远点候选也必须走不裁剪水域的可见层");
const water = inspectRiverVisualWaypoint(map, river.id, 5);
assert.equal(water.valid, true, "兼容 pack-cell 入口也不得恢复水域限制");
assert.equal(water.visualCurve.kind, "centripetal-catmull-rom-cubic");
const waterPreviewBundle = buildSelectionMeshBundle(map, camera, canvas, null, null, [], water);
assert.equal(waterPreviewBundle.drawRanges.landMasked.count, 0);
assert.ok(waterPreviewBundle.drawRanges.ordinary.count > 0, "水域控制点和预览曲线必须可见");
const crossingMap = createCrossingFixture();
const crossing = inspectRiverVisualWaypoint(crossingMap, river.id, 2);
assert.equal(crossing.valid, true, "只要控制点本身在陆地，河道走势可以自由穿过原有水域");
const legalMouth = inspectRiverVisualWaypoint(createLegalMouthFixture(), river.id, 2);
assert.equal(legalMouth.valid, true, legalMouth.reason || "只经过原有河口水域 cell 的候选必须合法");

for (const [metadata, expected] of [
  [{graphWidth: 100, graphHeight: 100}, true],
  [{graphWidth: 1e9, graphHeight: 1e9}, true],
  [{graphWidth: 1, graphHeight: 1}, false],
  [null, false],
  [{graphWidth: NaN, graphHeight: NaN}, false]
]) {
  const scaledMap = createFixture();
  scaledMap.metadata = metadata;
  const nearCandidate = inspectRiverVisualWaypoint(scaledMap, river.id, 2);
  const farCandidate = inspectRiverVisualWaypoint(scaledMap, river.id, 4);
  assert.equal(nearCandidate.valid, expected, `世界坐标边界判定不符合 metadata=${JSON.stringify(metadata)}`);
  assert.equal(farCandidate.valid, expected, `世界坐标边界判定不符合 metadata=${JSON.stringify(metadata)}`);
}

const draftChanges = [];
const session = createRiverWaypointSession({onDraftChange: (next, detail) => draftChanges.push({next, reason: detail.reason})});
const manager = createCanvasToolModeManager({declaredModeIds: ["river:edit-waypoint"]});
manager.register("river:edit-waypoint", {
  onEnter: () => session.begin(map, river.id),
  onCancel: ({reason}) => session.end(reason),
  onComplete: ({reason}) => session.end(reason)
});
manager.enter("river:edit-waypoint");
const stageAt = packCell => session.stageAction(map, {type: "add", point: map.pack.cells.p[packCell], packCell});
assert.equal(stageAt(2).valid, true);
assert.equal(session.getSnapshot().hasDraft, true);
assert.equal(stageAt(0).valid, true, "有效草稿后的同点候选也必须可以累加");
assert.equal(session.getSnapshot().hasDraft, true);
assert.equal(stageAt(2).valid, true);
assert.equal(session.stageAction(map, {type: "add", point: [-1, 50]}).code, "point-out-of-bounds");
assert.equal(session.getSnapshot().hasDraft, true, "无效操作不得清除此前有效的 working 草稿");
assert.equal(session.getDraft().action, "restore");
assert.equal(stageAt(2).valid, true);
assert.equal(stageAt(4).valid, true, "会跨出原河段的世界坐标也必须可以预览");
assert.equal(session.getSnapshot().hasDraft, true);
assert.equal(stageAt(2).valid, true);
manager.cancel("river:edit-waypoint", "escape");
assert.equal(session.getSnapshot().active, false);
assert.equal(session.getSnapshot().hasDraft, false, "Escape 必须清除草稿");
assert.equal(draftChanges.at(-1).reason, "escape");

manager.enter("river:edit-waypoint");
assert.equal(stageAt(2).valid, true);
river.length += 1;
const staleLength = session.validate(map);
assert.equal(staleLength.valid, false);
assert.equal(staleLength.code, "river-changed");
assert.equal(session.getSnapshot().hasDraft, false, "基线变化必须清除草稿");
river.length -= 1;
assert.equal(stageAt(2).valid, true);
const replacementMap = createFixture();
const staleMap = session.validate(replacementMap);
assert.equal(staleMap.code, "map-changed");
assert.equal(session.getSnapshot().hasDraft, false);
manager.cancel("river:edit-waypoint", "cancel");

const exportDraft = inspectRiverVisualWaypoint(map, river.id, 2);
const selection = {kind: "river", id: river.id};
const highlights = [{kind: "river", id: river.id}];
const exportRenderer = {
  riverWaypointPreview: exportDraft,
  riverWaypointPreviewRevision: 1,
  selection,
  objectHighlights: highlights,
  framebuffer: null,
  setRiverWaypointPreview(next) {
    this.riverWaypointPreview = next;
    this.riverWaypointPreviewRevision++;
    this.draw();
  },
  draw() {
    this.framebuffer = buildSelectionMeshVertices(map, camera, canvas, this.selection, null, this.objectHighlights, this.riverWaypointPreview);
  }
};
exportRenderer.draw();
const previewFrameVertices = exportRenderer.framebuffer.length;
const exportedFrameVertices = await withRiverWaypointPreviewSuppressed(exportRenderer, async () => {
  assert.equal(exportRenderer.riverWaypointPreview, null);
  assert.equal(exportRenderer.selection, selection, "PNG 抑制不得改变普通 selection");
  assert.equal(exportRenderer.objectHighlights, highlights, "PNG 抑制不得改变普通 highlights");
  return exportRenderer.framebuffer.length;
});
assert.ok(exportedFrameVertices < previewFrameVertices, "PNG 导出帧必须排除未保存控制点预览");
assert.equal(exportRenderer.riverWaypointPreview, exportDraft, "PNG 完成后必须恢复候选预览");
assert.equal(exportRenderer.framebuffer.length, previewFrameVertices, "PNG 完成后必须重绘恢复预览");
await assert.rejects(withRiverWaypointPreviewSuppressed(exportRenderer, async () => { throw new Error("export-failed"); }), /export-failed/);
assert.equal(exportRenderer.riverWaypointPreview, exportDraft, "PNG 失败也必须在 finally 恢复预览");
await withRiverWaypointPreviewSuppressed(exportRenderer, async () => {
  exportRenderer.setRiverWaypointPreview(null);
});
assert.equal(exportRenderer.riverWaypointPreview, null, "导出期间用户取消时不得复活旧预览");
exportRenderer.setRiverWaypointPreview(exportDraft);
const newerDraft = {...exportDraft, packCell: 3};
await assert.rejects(withRiverWaypointPreviewSuppressed(exportRenderer, async () => {
  exportRenderer.setRiverWaypointPreview(newerDraft);
  throw new Error("export-failed-after-new-preview");
}), /export-failed-after-new-preview/);
assert.equal(exportRenderer.riverWaypointPreview, newerDraft, "导出失败后不得覆盖期间产生的新预览");

const rejectedExportRenderer = {
  ...exportRenderer,
  riverWaypointPreview: far,
  riverWaypointPreviewRevision: 1,
  selection: null,
  objectHighlights: []
};
rejectedExportRenderer.draw();
assert.ok(rejectedExportRenderer.framebuffer.length > 0, "拒绝诊断必须有可见预览");
await withRiverWaypointPreviewSuppressed(rejectedExportRenderer, async () => {
  assert.equal(rejectedExportRenderer.riverWaypointPreview, null, "PNG 导出必须抑制拒绝诊断红点");
  assert.equal(rejectedExportRenderer.framebuffer.length, 0);
});
assert.equal(rejectedExportRenderer.riverWaypointPreview, far, "PNG 导出后必须恢复拒绝诊断预览");

const appliedDraft = inspectRiverVisualWaypoint(map, river.id, 2);
history.execute(createAddRiverVisualWaypointCommand(river.id, appliedDraft.packCell), {map});
assert.equal(history.getStats().undo, 1, "面板应用必须只写一条历史");
assert.deepEqual(hydrologySnapshot(river), hydrologyBefore, "视觉控制点不得改写 canonical 水文数据");
const appliedPoints = structuredClone(river.points);
history.undo({map});
assert.deepEqual(river.points, pointsBefore);
assert.deepEqual(hydrologySnapshot(river), hydrologyBefore);
history.redo({map});
assert.deepEqual(river.points, appliedPoints);
assert.deepEqual(hydrologySnapshot(river), hydrologyBefore);

const appSource = readSource("../app/webgl-generator/src/runtime/app.js");
const panelSource = readSource("../app/webgl-generator/src/ui/vue/components/RiverPanel.vue");
const panelAdapterSource = readSource("../app/webgl-generator/src/ui/panels/river-panel.js");
const rendererSource = readSource("../app/webgl-generator/src/renderer/placeholder-renderer.js");
const sessionSource = readSource("../app/webgl-generator/src/runtime/river-waypoint-session.js");
assert.match(appSource, /createRiverWaypointSession[\s\S]*onDraftChange[\s\S]*setRiverWaypointPreview/);
assert.doesNotMatch(appSource, /session\?\.stage\(state\.map, packCell\)/);
assert.match(appSource, /session\?\.validate\(state\.map\)/);
assert.match(appSource, /function applyRiverWaypointDraft[\s\S]*createEditRiverControlPointsCommand[\s\S]*completeCanvasToolMode/);
assert.match(appSource, /function clearRiverWaypointDraft[\s\S]*clearRiverWaypointPreview/);
assert.match(appSource, /onExit: \(\{reason\}\) => \{[\s\S]*controlPointDrag\?\.cancel\(reason \|\| "mode-exit"\)[\s\S]*session\?\.end/);
assert.match(appSource, /target-switch|target-deleted|map-replace/);
assert.match(panelAdapterSource, /onApplyWaypoint[\s\S]*onReselectWaypoint[\s\S]*onCancelWaypoint/);
for (const label of ["调整河道折线", "单击河流非控制点处新增", "双击已有控制点删除", "同一 cell 可放置多个点", "应用控制点", "重新选择", "退出模式"]) assert.match(panelSource, new RegExp(label));
assert.equal((panelSource.match(/\{key: "path"/g) || []).length, 1, "河流面板只能保留一个河道折线入口");
assert.match(panelSource, /icon:\s*"折"/);
assert.match(panelSource, /position:\s*sticky/);
assert.match(panelSource, /waypointErrorMessage \? 'assertive' : 'polite'/);
assert.match(panelSource, /feedback\?\.tone === "error" \? feedback\.message/);
assert.doesNotMatch(panelSource, /feedback\?\.code === "waypoint-water"/);
assert.match(panelSource, /世界坐标 \(\$\{formatNumber\(point\[0\]\)\}, \$\{formatNumber\(point\[1\]\)\}\)/);
assert.doesNotMatch(panelSource, /pack cell #\$\{draft\.packCell\}/);
assert.match(panelAdapterSource, /waypointFeedback:[\s\S]*setWaypointFeedback/);
assert.match(appSource, /setRiverWaypointPreview\?\.\(state\.riverEdit\.session\?\.getPreview\?\.\(\)\)/);
assert.match(appSource, /session\?\.clear\("apply-failed"\)[\s\S]*tone: "error"/);
assert.match(rendererSource, /preview\?\.valid \|\|[\s\S]*candidate/);
assert.match(rendererSource, /setRiverWaypointPreview[\s\S]*riverWaypointPreview/);
assert.match(sessionSource, /const changed = workingChanged\(working, baseline\);[\s\S]*setDraft\(\{\.\.\.inspected, changed, baseline/, "stageAction 必须以 working 相对 baseline 的累计变化覆盖单次动作 changed");

console.log(JSON.stringify({
  ok: true,
  preview: {packCell: appliedDraft.packCell, insertIndex: appliedDraft.insertIndex, distance: appliedDraft.distance, maxDistance: appliedDraft.maxDistance},
  history: history.getStats(),
  hydrologyPreserved: true,
  previewVertices: previewVertices.length / 6
}, null, 2));

function createFixture() {
  const targetRiver = {
    id: 7,
    name: "测试河",
    points: [[0, 0, 10], [10, 10, 30]],
    cells: [0, 1],
    parent: 3,
    basin: 2,
    flux: 30,
    discharge: 30,
    length: Math.hypot(10, 10)
  };
  return {
    metadata: {graphWidth: 100, graphHeight: 100},
    pack: {cells: {p: [[0, 0], [10, 10], [5, 2], [7, 10], [80, 80], [6, 4]], h: [35, 32, 30, 30, 30, 10]}, rivers: [targetRiver]},
    rivers: {rivers: [targetRiver], metadata: {maxFlux: 30}}
  };
}

function createCrossingFixture() {
  const targetRiver = {
    id: 7,
    name: "穿水测试河",
    points: [[0, 0, 10], [10, 0, 30]],
    cells: [0, 1],
    parent: 0,
    basin: 7,
    flux: 30,
    discharge: 30,
    length: 10
  };
  return {
    metadata: {graphWidth: 10, graphHeight: 5},
    pack: {
      cells: {
        p: [[0, 0], [10, 0], [5, 0.8], [2.5, 0], [5, 0], [7.5, 0], [3.5, 0.9]],
        h: [30, 10, 30, 30, 30, 30, 10]
      },
      rivers: [targetRiver]
    },
    rivers: {rivers: [targetRiver], metadata: {maxFlux: 30}}
  };
}

function createLegalMouthFixture() {
  const targetRiver = {
    id: 7,
    name: "合法河口测试河",
    points: [[0, 0, 10], [10, 0, 30]],
    cells: [0, 1],
    parent: 0,
    basin: 7,
    flux: 30,
    discharge: 30,
    length: 10
  };
  return {
    metadata: {graphWidth: 10, graphHeight: 5},
    pack: {
      cells: {
        p: [[0, 0], [10, 0], [5, 0.4], [2.5, 0], [5, 0], [7.5, 0]],
        h: [30, 10, 30, 30, 30, 30]
      },
      rivers: [targetRiver]
    },
    rivers: {rivers: [targetRiver], metadata: {maxFlux: 30}}
  };
}

function hydrologySnapshot(river) {
  return structuredClone({cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge});
}

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}
