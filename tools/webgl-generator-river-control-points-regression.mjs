#!/usr/bin/env node
import assert from "node:assert/strict";
import {createEditRiverControlPointsCommand, inspectRiverControlPointAction} from "../app/webgl-generator/src/runtime/river-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRiverWaypointSession} from "../app/webgl-generator/src/runtime/river-waypoint-session.js";

const map = createFixture();
const river = map.rivers.rivers[0];
const hydrologyBefore = structuredClone({cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge});

const first = inspectRiverControlPointAction(map, river.id, {type: "add", point: [5, 2], packCell: 2});
assert.equal(first.valid, true, first.reason);
assert.equal(first.controlPoints.length, 1);
assert.equal(first.controlPoints[0].packCell, 2);

const second = inspectRiverControlPointAction(map, river.id, {type: "add", point: [5.5, 2.5], packCell: 2}, first);
assert.equal(second.valid, true, second.reason);
assert.equal(second.controlPoints.length, 2, "同一个 cell 必须允许两个独立控制点");
assert.notEqual(second.controlPoints[0].id, second.controlPoints[1].id);
assert.deepEqual(second.controlPoints.map(point => point.packCell), [2, 2]);

const moved = inspectRiverControlPointAction(map, river.id, {type: "move", controlPointId: second.controlPoints[0].id, point: [5, 3], packCell: 2}, second);
assert.equal(moved.valid, true, moved.reason);
assert.equal(moved.controlPoints[0].x, 5);
assert.equal(moved.controlPoints[0].y, 3);

const deleted = inspectRiverControlPointAction(map, river.id, {type: "delete", controlPointId: moved.controlPoints[1].id}, moved);
assert.equal(deleted.valid, true, deleted.reason);
assert.equal(deleted.controlPoints.length, 1);
assert.equal(deleted.points.length, river.points.length + 1);

const session = createRiverWaypointSession();
session.begin(map, river.id);
const staged = session.stageAction(map, {type: "add", point: [5, 2], packCell: 2});
assert.equal(staged.valid, true);
const sessionSecond = session.stageAction(map, {type: "add", point: [5.5, 2.5], packCell: 2});
assert.equal(sessionSecond.valid, true);
assert.equal(sessionSecond.working.controlPoints.length, 2);
const beforeCancel = session.getWorkingState();
session.clear("cancel");
assert.equal(session.getWorkingState().controlPoints.length, 0);

const history = new EditHistory();
history.execute(createEditRiverControlPointsCommand(river.id, beforeCancel), {map});
assert.equal(history.getStats().undo, 1);
assert.equal(river.controlPoints.length, 2);
assert.deepEqual({cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge}, hydrologyBefore);
history.undo({map});
assert.equal(river.controlPoints, undefined);
history.redo({map});
assert.equal(river.controlPoints.length, 2);

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
    pack: {cells: {p: [[0, 0], [10, 10], [5, 2]], h: [35, 32, 30]}},
    rivers: {rivers: [targetRiver], metadata: {maxFlux: 30}}
  };
}
