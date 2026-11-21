import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regenerateSettlementsWithinPolitics} from "../app/webgl-generator/src/generator/settlements.js";
import {pickGridCell} from "../app/webgl-generator/src/renderer/picking.js";
import {createAddCityAtCellCommand, inspectCityCreation} from "../app/webgl-generator/src/runtime/city-edit-commands.js";
import {inspectCityMoveFast} from "../app/webgl-generator/src/runtime/city-relocation.js";
import {migrateMapDocument, createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {decodeWebfmgV3Document, encodeWebfmgV3Document} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";

const fixture = new URL("./fixtures/webgl-map-v4-coastal-cities-0.5.173.webfmg", import.meta.url);
const files = process.argv.slice(2);
if (!files.length) files.push(fixture);
for (const file of files) {
  const source = readFileSync(file);
  if (file === fixture) assert.equal(createHash("sha256").update(source).digest("hex"), "8341053ed850aaf302a9a76f982f8dbd062e99821eeb40fa09768223a96ea7a9");
  const doc = decodeWebfmgV3Document(gunzipSync(source));
  const before = doc.map, originals = before.settlements.cities.filter(Boolean);
  const offshore = new Set(originals.filter(city => waterAt(before, city)).map(city => city.id));
  assert.ok(offshore.size > 0);
  const map = migrateMapDocument(doc).map;
  const moved = new Map();
  for (const old of originals) {
    const city = map.settlements.cities[old.id];
    assert.ok(!waterAt(map, city), city.name);
    if (!offshore.has(city.id)) {
      assert.deepEqual(city, old);
      continue;
    }
    const burg = map.pack.burgs[city.burgId];
    assert.deepEqual([city.x, city.y], [burg.x, burg.y]);
    assert.deepEqual([city.name, city.population, city.cell, city.packCell, city.port, city.state, city.province],
      [old.name, old.population, old.cell, old.packCell, old.port, old.state, old.province]);
    moved.set(city.packCell, {old, city});
  }
  let changedRoadPoints = 0;
  for (const [oldRoutes, routes] of [[before.settlements.routes, map.settlements.routes], [before.pack.routes, map.pack.routes]]) {
    for (const [i, route] of routes.entries()) {
      if (!route) continue;
      const old = oldRoutes[i];
      for (const [j, point] of old.points.entries()) {
        const move = moved.get(old.packCells?.[j] ?? point[2]);
        const attached = move && move.old.x === point[0] && move.old.y === point[1];
        const expected = attached ? [move.city.x, move.city.y, ...point.slice(2)] : point;
        assert.deepEqual(route.points[j], expected);
        if (attached) changedRoadPoints++;
      }
    }
  }
  assert.ok(changedRoadPoints > 0);
  for (const store of [map.pack, map.economy]) for (const market of store?.markets || []) {
    const move = market && moved.get(market.cell);
    if (move && move.city.burgId === market.centerBurgId) assert.deepEqual([market.x, market.y], [move.city.x, move.city.y]);
  }
  if (file === fixture) {
    const coast = originals.find(city => offshore.has(city.id));
    const inland = originals.find(city => !city.port && city.id !== coast.id);
    const preview = inspectCityMoveFast(map, inland.id, {gridCell: coast.cell, packCell: coast.packCell, x: coast.x, y: coast.y});
    assert.ok(preview.valid, preview.summary);
    const [x, y] = preview.target.point;
    assert.equal(waterAt(map, {x, y}), false);
    const json = parseMapDocument(stringifyMapDocument(doc)).map;
    assert.deepEqual(json.settlements.cities, map.settlements.cities);
    const reopened = migrateMapDocument(decodeWebfmgV3Document(encodeWebfmgV3Document(createMapDocument(map)))).map;
    assert.deepEqual(reopened.settlements.cities, map.settlements.cities);
    assert.deepEqual(reopened.settlements.routes, map.settlements.routes);
  }
  assert.equal(originals.filter(city => waterAt(before, city)).length, offshore.size);
  console.log(JSON.stringify({towns: originals.length, repaired: offshore.size, changedRoadPoints}));
}
const generated = generatePlaceholderMap({cellsTarget: 1000, seed: "coastal-town", width: 640, height: 480, statesNumber: 7});
assertDry(generated);
const emptyCoast = generated.grid.cells.i.find(cell => inspectCityCreation(generated, cell).valid
  && generated.grid.cells.c[cell].some(neighbor => generated.grid.cells.h[neighbor] < 20));
const creation = inspectCityCreation(generated, emptyCoast);
assert.ok(creation.valid, creation.summary);
const water = generated.grid.cells.c[emptyCoast].find(cell => generated.grid.cells.h[cell] < 20);
const originalPackPoint = generated.pack.cells.p[creation.packCell];
generated.pack.cells.p[creation.packCell] = generated.grid.points[water];
const add = createAddCityAtCellCommand(emptyCoast);
add.apply({map: generated});
assert.equal(waterAt(generated, generated.settlements.cities[add.getResult().cityId]), false);
add.revert({map: generated});
generated.pack.cells.p[creation.packCell] = originalPackPoint;
regenerateSettlementsWithinPolitics(generated.grid, generated.features, generated.politics, generated.settlements, generated.pack, generated.options);
assertDry(generated);

function waterAt(map, city) {
  const cell = pickGridCell(map, city.x, city.y)?.gridCell;
  assert.ok(Number.isInteger(cell));
  return map.grid.cells.h[cell] < 20;
}
function assertDry(map) {
  const cities = map.settlements.cities.filter(Boolean);
  assert.ok(cities.some(city => city.port));
  assert.deepEqual(cities.filter(city => waterAt(map, city)).map(city => city.name), []);
}
