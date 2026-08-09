#!/usr/bin/env node
import assert from "node:assert/strict";
import {createEditRiverControlPointsCommand, inspectRiverControlPointAction} from "../app/webgl-generator/src/runtime/river-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRiverWaypointSession} from "../app/webgl-generator/src/runtime/river-waypoint-session.js";
import {buildSelectionMeshBundle} from "../app/webgl-generator/src/renderer/selection-layer.js";
import {pickRiverControlPoint} from "../app/webgl-generator/src/renderer/picking.js";

const map = createFixture();
const river = map.rivers.rivers[0];
const hydrologyBefore = structuredClone({cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge});

const first = inspectRiverControlPointAction(map, river.id, {type: "add", point: [5, 2], packCell: 2});
assert.equal(first.valid, true, first.reason);
assert.equal(first.visualCurve.kind, "centripetal-catmull-rom-cubic");
assert.equal(first.controlPoints.length, 1);
assert.equal(first.controlPoints[0].packCell, 2);

const second = inspectRiverControlPointAction(map, river.id, {type: "add", point: [5.5, 2.5], packCell: 2}, first);
assert.equal(second.valid, true, second.reason);
assert.equal(second.controlPoints.length, 2, "同一个 cell 必须允许两个独立控制点");
assert.notEqual(second.controlPoints[0].id, second.controlPoints[1].id);
assert.deepEqual(second.controlPoints.map(point => point.packCell), [2, 2]);
const sameCoordinate = inspectRiverControlPointAction(map, river.id, {type: "add", point: [5, 2], packCell: 2}, second);
assert.equal(sameCoordinate.valid, true, "同一世界坐标也必须允许独立控制点");
assert.equal(new Set(sameCoordinate.controlPoints.map(control => control.id)).size, 3);

const endpointBase = {points: river.points, controlPoints: [{id: "source", x: 0, y: 0, pointIndex: 0, packCell: 0}]};
assert.equal(inspectRiverControlPointAction(map, river.id, {type: "move", controlPointId: "source", point: [1, 1]}, endpointBase).code, "protected-endpoint");
assert.equal(inspectRiverControlPointAction(map, river.id, {type: "delete", controlPointId: "source"}, endpointBase).code, "protected-endpoint");

const moved = inspectRiverControlPointAction(map, river.id, {type: "move", controlPointId: second.controlPoints[0].id, point: [5, 3], packCell: 2}, second);
assert.equal(moved.valid, true, moved.reason);
assert.equal(moved.controlPoints[0].x, 5);
assert.equal(moved.controlPoints[0].y, 3);

const deleted = inspectRiverControlPointAction(map, river.id, {type: "delete", controlPointId: moved.controlPoints[1].id}, moved);
assert.equal(deleted.valid, true, deleted.reason);
assert.equal(deleted.controlPoints.length, 1);
assert.equal(deleted.points.length, river.points.length + 1);
const previewMesh = buildSelectionMeshBundle(map, {scale: 1, offsetX: 0, offsetY: 0}, {width: 1000, height: 700, clientWidth: 1000, clientHeight: 700}, null, null, [], second);
assert.ok(previewMesh.vertices.length > 0, "控制点集合预览必须生成选择层 mesh");
const pickedControl = pickRiverControlPoint(second, second.controlPoints[0].x, second.controlPoints[0].y, 0.1);
assert.equal(pickedControl.id, second.controlPoints[0].id, "控制点 picking 必须返回稳定 ID");

const session = createRiverWaypointSession();
session.begin(map, river.id);
const staged = session.stageAction(map, {type: "add", point: [5, 2], packCell: 2});
assert.equal(staged.valid, true);
const sessionSecond = session.stageAction(map, {type: "add", point: [5.5, 2.5], packCell: 2});
assert.equal(sessionSecond.valid, true);
assert.equal(sessionSecond.working.controlPoints.length, 2);
const movedSession = session.stageAction(map, {type: "move", controlPointId: sessionSecond.controlPoints[0].id, point: [6, 3], packCell: 2});
assert.equal(movedSession.changed, true);
const actionLocalRepeat = inspectRiverControlPointAction(map, river.id, {type: "move", controlPointId: movedSession.controlPoints[0].id, point: [6, 3], packCell: 2}, session.getWorkingState());
assert.equal(actionLocalRepeat.changed, false, "pointerup 末点与最后 RAF 相同时，本次动作本身应是 no-op");
const repeatedFinalMove = session.stageAction(map, {type: "move", controlPointId: movedSession.controlPoints[0].id, point: [6, 3], packCell: 2});
assert.equal(repeatedFinalMove.changed, true, "pointerup 末点与最后 RAF 相同仍须保留相对 baseline 的累计 dirty");
assert.equal(session.getPreview().changed, true, "拖动结束后的 renderer preview 必须继续标记为 changed");
const persistentMoveMesh = buildSelectionMeshBundle(map, {scale: 1, offsetX: 0, offsetY: 0}, {width: 1000, height: 700, clientWidth: 1000, clientHeight: 700}, null, null, [], repeatedFinalMove);
const handlesOnlyMoveMesh = buildSelectionMeshBundle(map, {scale: 1, offsetX: 0, offsetY: 0}, {width: 1000, height: 700, clientWidth: 1000, clientHeight: 700}, null, null, [], {...repeatedFinalMove, changed: false});
assert.ok(persistentMoveMesh.drawRanges.ordinary.count > handlesOnlyMoveMesh.drawRanges.ordinary.count, "拖动结束后必须继续绘制变化河道，而不只是控制点手柄");
const beforeCancel = session.getWorkingState();
session.clear("cancel");
assert.equal(session.getWorkingState().controlPoints.length, 0);

const history = new EditHistory();
history.execute(createEditRiverControlPointsCommand(river.id, beforeCancel), {map});
assert.equal(history.getStats().undo, 1);
assert.equal(river.controlPoints.length, 2);
assert.equal(river.visualCurve.kind, "centripetal-catmull-rom-cubic");
assert.deepEqual({cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge}, hydrologyBefore);
history.undo({map});
assert.equal(river.controlPoints, undefined);
assert.equal(river.visualCurve, undefined);
history.redo({map});
assert.equal(river.controlPoints.length, 2);
assert.equal(river.visualCurve.kind, "centripetal-catmull-rom-cubic");
const netZeroSession = createRiverWaypointSession();
netZeroSession.begin(map, river.id);
const originalControl = structuredClone(river.controlPoints[0]);
const movedAway = netZeroSession.stageAction(map, {type: "move", controlPointId: originalControl.id, point: [originalControl.x + 0.25, originalControl.y + 0.25], packCell: originalControl.packCell});
assert.equal(movedAway.changed, true);
const returnedToBaseline = netZeroSession.stageAction(map, {type: "move", controlPointId: originalControl.id, point: [originalControl.x, originalControl.y], packCell: originalControl.packCell});
assert.equal(returnedToBaseline.changed, false, "控制点净变化精确回到 begin baseline 时才应恢复未改状态");

console.log(JSON.stringify({ok: true, controlPoints: river.controlPoints.length, samePackCell: true, hydrologyPreserved: true, history: history.getStats()}, null, 2));

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
    pack: {cells: {p: [[0, 0], [10, 10], [5, 2]], h: [35, 32, 10]}},
    rivers: {rivers: [targetRiver], metadata: {maxFlux: 30}}
  };
}
