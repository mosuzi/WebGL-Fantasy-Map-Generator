#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {buildSelectionMeshVertices} from "../app/webgl-generator/src/renderer/selection-layer.js";
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
assert.ok(draft.distance > 0 && draft.distance <= draft.maxDistance);
assert.equal(draft.points.length, pointsBefore.length + 1);
assert.deepEqual(river.points, pointsBefore, "候选预检不得修改正式河道");
assert.equal(history.getStats().undo, 0, "候选预检不得写历史");

const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 1000, height: 700, clientWidth: 1000, clientHeight: 700};
const previewVertices = buildSelectionMeshVertices(map, camera, canvas, null, null, [], draft);
assert.ok(previewVertices.length > 0, "候选折线与节点必须生成独立选择层 mesh");
assert.ok([...previewVertices].every(Number.isFinite), "候选预览 mesh 不得包含无效坐标");
assert.equal(buildSelectionMeshVertices(map, camera, canvas, null, null, [], null).length, 0, "清除候选后选择层不得残留预览");

draft = inspectRiverVisualWaypoint(map, river.id, 3);
assert.equal(draft.valid, true, "再次拾取必须能替换候选");
assert.deepEqual(river.points, pointsBefore);
draft = null;
assert.deepEqual(river.points, pointsBefore, "重新选择或取消草稿不得写正式河道");
assert.equal(history.getStats().undo, 0);

const duplicate = inspectRiverVisualWaypoint(map, river.id, 0);
assert.equal(duplicate.valid, false);
assert.equal(duplicate.code, "duplicate-waypoint");
const invalid = inspectRiverVisualWaypoint(map, river.id, 999);
assert.equal(invalid.valid, false);
assert.equal(invalid.code, "invalid-cell");
const far = inspectRiverVisualWaypoint(map, river.id, 4);
assert.equal(far.valid, false);
assert.equal(far.code, "waypoint-too-far");
assert.ok(far.distance > far.maxDistance);
assert.throws(() => history.execute(createAddRiverVisualWaypointCommand(river.id, 4), {map}), /超过允许/);
assert.equal(history.getStats().undo, 0, "无效或过远候选不得写历史");
const water = inspectRiverVisualWaypoint(map, river.id, 5);
assert.equal(water.valid, false);
assert.equal(water.code, "waypoint-water", "水域 pack cell 必须在距离计算前被拒绝");
const crossingMap = createCrossingFixture();
const crossing = inspectRiverVisualWaypoint(crossingMap, river.id, 2);
assert.equal(crossing.valid, false);
assert.equal(crossing.code, "waypoint-crosses-water", "候选总穿水长度相近但新增水域 cell 时必须拒绝");
assert.deepEqual(crossing.originalWaterCells, [1]);
assert.deepEqual(crossing.addedWaterCells, [6]);
const legalMouth = inspectRiverVisualWaypoint(createLegalMouthFixture(), river.id, 2);
assert.equal(legalMouth.valid, true, legalMouth.reason || "只经过原有河口水域 cell 的候选必须合法");

for (const metadata of [
  {graphWidth: 100, graphHeight: 100},
  {graphWidth: 1e9, graphHeight: 1e9},
  {graphWidth: 1, graphHeight: 1},
  null,
  {graphWidth: NaN, graphHeight: NaN}
]) {
  const scaledMap = createFixture();
  scaledMap.metadata = metadata;
  const nearCandidate = inspectRiverVisualWaypoint(scaledMap, river.id, 2);
  const farCandidate = inspectRiverVisualWaypoint(scaledMap, river.id, 4);
  assert.equal(nearCandidate.valid, true, `正常局部候选不得因 metadata=${JSON.stringify(metadata)} 被拒绝`);
  assert.equal(farCandidate.code, "waypoint-too-far", `远点不得因 metadata=${JSON.stringify(metadata)} 被放行`);
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
assert.equal(session.stage(map, 2).valid, true);
assert.equal(session.getSnapshot().hasDraft, true);
assert.equal(session.stage(map, 0).code, "duplicate-waypoint");
assert.equal(session.getSnapshot().hasDraft, false, "有效草稿后的重复候选必须清除旧草稿");
assert.equal(session.stage(map, 2).valid, true);
assert.equal(session.stage(map, 999).code, "invalid-cell");
assert.equal(session.getSnapshot().hasDraft, false, "有效草稿后的无效候选必须清除旧草稿");
assert.equal(session.stage(map, 2).valid, true);
assert.equal(session.stage(map, 4).code, "waypoint-too-far");
assert.equal(session.getSnapshot().hasDraft, false, "有效草稿后的过远候选必须清除旧草稿");
assert.equal(session.stage(map, 2).valid, true);
manager.cancel("river:edit-waypoint", "escape");
assert.equal(session.getSnapshot().active, false);
assert.equal(session.getSnapshot().hasDraft, false, "Escape 必须清除草稿");
assert.equal(draftChanges.at(-1).reason, "escape");

manager.enter("river:edit-waypoint");
assert.equal(session.stage(map, 2).valid, true);
river.length += 1;
const staleLength = session.validate(map);
assert.equal(staleLength.valid, false);
assert.equal(staleLength.code, "river-changed");
assert.equal(session.getSnapshot().hasDraft, false, "基线变化必须清除草稿");
river.length -= 1;
assert.equal(session.stage(map, 2).valid, true);
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
assert.match(appSource, /createRiverWaypointSession[\s\S]*onDraftChange[\s\S]*setRiverWaypointPreview/);
assert.match(appSource, /session\?\.stage\(state\.map, packCell\)/);
assert.match(appSource, /session\?\.validate\(state\.map\)/);
assert.match(appSource, /function applyRiverWaypointDraft[\s\S]*createAddRiverVisualWaypointCommand[\s\S]*completeCanvasToolMode/);
assert.match(appSource, /function clearRiverWaypointDraft[\s\S]*clearRiverWaypointPreview/);
assert.match(appSource, /target-switch|target-deleted|map-replace/);
assert.match(panelAdapterSource, /onApplyWaypoint[\s\S]*onReselectWaypoint[\s\S]*onCancelWaypoint/);
for (const label of ["控制点预览尚未保存", "应用控制点", "重新选择", "取消"]) assert.match(panelSource, new RegExp(label));
assert.match(panelSource, /●\+/);
assert.doesNotMatch(panelSource, /icon:\s*"⌁"/);
assert.match(rendererSource, /setRiverWaypointPreview[\s\S]*riverWaypointPreview/);

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
