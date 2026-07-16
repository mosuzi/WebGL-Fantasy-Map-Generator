#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createApplyCultureAssignmentCommand, createDeleteCultureCommand} from "../app/webgl-generator/src/runtime/culture-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {objectNoteId, restoreObjectNote} from "../app/webgl-generator/src/runtime/object-notes.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {createApplyReligionAssignmentCommand, createDeleteReligionCommand} from "../app/webgl-generator/src/runtime/religion-edit-commands.js";
import {applySocialAssignmentPreview} from "../app/webgl-generator/src/runtime/social-ownership-edit-commands.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "../app/webgl-generator/src/runtime/brush-radius-contract.js";

assert.equal(normalizeBrushRadius(BRUSH_RADIUS_ID.CULTURE, -1), 4, "文化画笔半径下界异常");
assert.equal(normalizeBrushRadius(BRUSH_RADIUS_ID.RELIGION, 999), 120, "宗教画笔半径上界异常");

const map = generatePlaceholderMap({seed: "social-ownership-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const history = new EditHistory();

const culture = findOwnedObject(map.grid.cells.culture, map.society.cultures);
const religion = findOwnedObject(map.grid.cells.religion, map.society.religions);
assert.ok(culture && religion, "固定 seed 应生成有覆盖的文化与宗教");

verifyAssignment("culture", culture, createApplyCultureAssignmentCommand);
verifyAssignment("religion", religion, createApplyReligionAssignmentCommand);
verifyDeletion("culture", culture, createDeleteCultureCommand);
verifyDeletion("religion", religion, createDeleteReligionCommand);

assert.equal(createDeleteCultureCommand(0).isNoop({map}), true, "中立文化不可删除");
assert.equal(createDeleteReligionCommand(0).isNoop({map}), true, "中立宗教不可删除");

console.log(JSON.stringify({
  ok: true,
  cultureId: objectId(culture),
  religionId: objectId(religion),
  undoDepth: history.getStats().undo,
  staleSystems: map.metadata.derivedStale?.systems || []
}, null, 2));

function verifyAssignment(kind, source, createCommand) {
  const field = kind;
  const gridCell = findHeterogeneousGridCell(kind);
  assert.ok(gridCell >= 0, `${kind} 固定 seed 应包含 pack 归属异质的 grid cell`);
  const sourceId = Number(map.grid.cells[field][gridCell]);
  const target = activeObjects(kind).find(item => objectId(item) !== sourceId);
  assert.ok(target, `${kind} 应有第二个可用对象`);
  const targetId = objectId(target);
  const packCells = packCellsForGridCell(gridCell);
  assert.ok(new Set(packCells.map(cell => Number(map.pack.cells[field][cell]))).size > 1);
  const before = ownershipSnapshot(kind);
  const packBefore = packCells.map(packCell => ({packCell, before: Number(map.pack.cells[field][packCell]) || 0}));
  const changes = [{gridCell, before: sourceId, after: targetId, packBefore}];
  applySocialAssignmentPreview(map, kind, changes);
  const command = createCommand(changes);
  history.execute(command, {map});
  assert.equal(map.grid.cells[field][gridCell], targetId);
  assert.ok(packCells.every(cell => Number(map.pack.cells[field][cell]) === targetId), `${kind} pack 归属必须同步`);
  if (kind === "religion") assertReligionUrban();
  assert.ok(map.metadata.derivedStale.systems.length > 0);
  history.undo({map});
  assert.deepEqual(ownershipSnapshot(kind), before, `${kind} 归属撤销必须完整恢复`);
  history.redo({map});
  assert.equal(map.grid.cells[field][gridCell], targetId);
  history.undo({map});
}

function findHeterogeneousGridCell(kind) {
  for (let gridCell = 0; gridCell < map.grid.cells.p.length; gridCell++) {
    const packCells = packCellsForGridCell(gridCell);
    if (new Set(packCells.map(cell => Number(map.pack.cells[kind][cell]))).size > 1) return gridCell;
  }
  return -1;
}

function assertReligionUrban() {
  const expected = new Map();
  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const id = Number(map.pack.cells.religion[burg.cell]) || 0;
    expected.set(id, Math.round(((expected.get(id) || 0) + (Number(burg.population) || 0)) * 100) / 100);
  }
  for (const religion of activeObjects("religion")) {
    assert.equal(Number(religion.urban) || 0, expected.get(objectId(religion)) || 0, `宗教 #${objectId(religion)} urban 必须与 burg 归属一致`);
  }
}

function verifyDeletion(kind, object, createCommand) {
  const id = objectId(object);
  restoreObjectNote(map, {
    id: objectNoteId({kind, id}), kind, objectId: id, name: object.name || `${kind} #${id}`,
    body: `${kind} 完整删除回归备注`, format: "plain", pinned: false
  });
  if (kind === "culture") {
    map.namebases ??= {};
    map.namebases.bindings ??= {};
    map.namebases.bindings.cultures ??= {};
    map.namebases.bindings.cultures[id] = "builtin:0";
  }
  const before = fullSnapshot();
  const command = createCommand(id);
  assert.equal(Boolean(command.isNoop({map})), false, `${kind} 非空对象必须允许删除`);
  history.execute(command, {map});
  const field = kind;
  assert.equal(activeObjects(kind).some(item => objectId(item) === id), false);
  assert.ok(Array.from(map.grid.cells[field]).every(value => Number(value) !== id));
  assert.ok(Array.from(map.pack.cells[field]).every(value => Number(value) !== id));
  assertNoReference(kind, id);
  assert.equal(map.notes.notes.some(note => note.id === `${kind}:${id}`), false);
  if (kind === "culture") assert.equal(map.namebases.bindings.cultures[id], undefined);
  assert.equal(resolveObject(map, {kind, id}), null);
  assert.equal(createMapDocument(map, map.options).map.society[`${kind}s`][id].removed, true);
  history.undo({map});
  assert.deepEqual(fullSnapshot(), before, `${kind} 删除撤销必须完整恢复`);
  assert.ok(resolveObject(map, {kind, id}));
  history.redo({map});
  assert.equal(resolveObject(map, {kind, id}), null);
  history.undo({map});
}

function assertNoReference(kind, id) {
  const field = kind;
  for (const collection of [map.settlements?.cities, map.pack?.burgs, map.politics?.states, map.pack?.states, map.politics?.provinces, map.pack?.provinces]) {
    for (const item of collection || []) assert.notEqual(Number(item?.[field]), id, `${kind} 关联对象不得残留`);
  }
  const objects = activeObjects(kind);
  for (const item of objects) {
    assert.notEqual(Number(item.parent), id);
    assert.ok(!(item.origins || []).includes(id));
    assert.ok(!(item.children || []).includes(id));
    assert.ok(!(item.lineage || []).includes(id));
  }
  if (kind === "culture") {
    for (const item of map.society?.religions || []) assert.notEqual(Number(item?.culture), id);
    for (const item of map.rivers?.rivers || []) assert.notEqual(Number(item?.culture), id);
  }
}

function activeObjects(kind) {
  return (map.society?.[`${kind}s`] || map.pack?.[`${kind}s`] || []).filter(item => item && !item.removed && objectId(item) > 0);
}

function findOwnedObject(values, objects) {
  const counts = new Map();
  for (const value of values || []) if (Number(value) > 0) counts.set(Number(value), (counts.get(Number(value)) || 0) + 1);
  const id = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return objects?.[id] || null;
}

function packCellsForGridCell(gridCell) {
  const result = [];
  for (let cell = 0; cell < map.pack.cells.g.length; cell++) if (Number(map.pack.cells.g[cell]) === gridCell && map.pack.cells.h[cell] >= 20) result.push(cell);
  return result;
}

function ownershipSnapshot(kind) {
  return {
    grid: Array.from(map.grid.cells[kind]),
    pack: Array.from(map.pack.cells[kind]),
    society: JSON.parse(JSON.stringify(map.society[`${kind}s`])),
    packObjects: JSON.parse(JSON.stringify(map.pack[`${kind}s`])),
    settlements: JSON.parse(JSON.stringify(map.settlements)),
    politics: JSON.parse(JSON.stringify(map.politics)),
    stale: JSON.parse(JSON.stringify(map.metadata.derivedStale || null))
  };
}

function fullSnapshot() {
  return JSON.parse(JSON.stringify({
    gridCulture: Array.from(map.grid.cells.culture), gridReligion: Array.from(map.grid.cells.religion),
    packCulture: Array.from(map.pack.cells.culture), packReligion: Array.from(map.pack.cells.religion),
    society: map.society, packCultures: map.pack.cultures, packReligions: map.pack.religions,
    packBurgs: map.pack.burgs, packStates: map.pack.states, packProvinces: map.pack.provinces,
    settlements: map.settlements, politics: map.politics, rivers: map.rivers, notes: map.notes,
    namebases: map.namebases, stale: map.metadata.derivedStale
  }));
}

function objectId(object) {
  return Number(object?.i ?? object?.id ?? 0);
}
