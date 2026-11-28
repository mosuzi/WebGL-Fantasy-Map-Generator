import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {applyMainThreadMapProjection} from "../app/webgl-generator/src/runtime/main-thread-map-projection.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {editedHeightPatchPolicy, reconcileEditedHeight} from "../app/webgl-generator/src/runtime/edited-height-impact.js";
import {colorForCell} from "../app/webgl-generator/src/renderer/color-modes.js";

const original = generatePlaceholderMap({seed: "height-impact-sample", cellsTarget: 1500});
for (const scenario of ["inland", "shore", "capital", "capital-no-space", "last-land"]) {
  const map = structuredClone(original);
  applyMainThreadMapProjection(map);
  const c = map.grid.cells, p = map.pack.cells, states = map.politics.states;
  const vacant = state => p.i.some(i => p.state[i] === state.i && !p.burg[i] && p.h[i] >= 20 && c.h[p.g[i]] >= 20 && p.g[i] !== p.g[map.pack.burgs[state.capital].cell]);
  const country = states.find(s => s?.capital && s.cells >= 4 && (scenario === "capital" ? vacant(s) : scenario === "capital-no-space" ? !vacant(s) : true));
  assert.ok(country, scenario);
  const owner = country.i, capital = country.capital;
  const capitalCity = map.settlements.cities[map.pack.burgs[capital].cityId];
  const grid = scenario === "last-land" ? [...new Set([...c.i.filter(i => c.state[i] === owner), ...p.i.filter(i => p.state[i] === owner).map(i => p.g[i])])]
    : scenario.startsWith("capital") ? [capitalCity.cell] : [c.i.find(i => c.h[i] >= 20 && c.h[i] < 90 && c.state[i] && c.burg[i] < 0 &&
      (scenario !== "shore" || c.c[i].some(n => c.h[n] < 20)))];
  assert.ok(grid.length && grid.every(Number.isInteger));
  const ids = new Set(grid);
  const identities = states.map(s => s && ({name: s.name, fullName: s.fullName, government: s.governmentKey, color: s.color, capital: s.capital}));
  const allHeights = c.h.slice(), initialStates = structuredClone(states);
  map.metadata.derivedStale = {systems: ["trades"], updatedAt: "existing"};
  const stroke = createApplyHeightBrushCommand(grid.map(i => ({gridCell: i, before: c.h[i], after: scenario === "inland" ? c.h[i] + 3 : 10})));
  stroke.apply({map});
  if (scenario !== "inland") for (const i of grid) assert.deepEqual(colorForCell(i, map, "states"), colorForCell(i, map, "height"));
  const oldOwners = c.state.slice();
  const stored = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
  assert.deepEqual(stored.metadata.derivedStale.heightEdits, map.metadata.derivedStale.heightEdits);
  const {patch, crossings} = reconcileEditedHeight(stored);
  const command = createDomainPatchCommand({patch, policy: editedHeightPatchPolicy(patch)});
  command.apply({map});
  for (const i of c.i) {
    if (!ids.has(i) || scenario === "inland") assert.equal(c.state[i], oldOwners[i]);
    else {
      assert.equal(c.state[i], 0);
      assert.equal(c.province[i], 0);
      assert.equal(map.features.features[c.f[i]].land, false);
    }
  }
  for (const state of states.filter(Boolean)) {
    const id = state.i ?? state.id, prior = identities[id];
    for (const [field, value] of Object.entries(prior)) {
      if (field === "capital" && ["last-land", "capital-no-space"].includes(scenario) && id === owner) continue;
      assert.deepEqual(state[field === "government" ? "governmentKey" : field], value, scenario + " " + id + " " + field);
    }
  }
  if (scenario.startsWith("capital")) {
    const city = map.settlements.cities[map.pack.burgs[states[owner].capital].cityId];
    if (scenario === "capital") assert.equal(city.name, capitalCity.name);
    else assert.ok(city.capital && city.burgId !== capital);
    assert.ok(!city.removed && c.h[city.cell] >= 20 && p.h[city.packCell] >= 20 && p.state[city.packCell] === owner);
  }
  if (scenario === "last-land") assert.ok(states[owner].removed && !states[owner].capital);
  for (const [cells, features] of [[c, map.features.features], [p, map.pack.features]]) {
    for (const cell of cells.i) {
      assert.equal(features[cells.f[cell]].land, cells.h[cell] >= 20);
      for (const n of cells.c[cell]) if ((cells.h[n] >= 20) === (cells.h[cell] >= 20)) assert.equal(cells.f[n], cells.f[cell]);
    }
  }
  assert.deepEqual(map.metadata.derivedStale.systems, ["trades"]);
  const after = structuredClone(states);
  command.revert({map});
  assert.deepEqual(states, initialStates);
  assert.deepEqual(c.state, oldOwners);
  command.apply({map});
  assert.deepEqual(states, after);
  command.revert({map});
  stroke.revert({map});
  assert.deepEqual(c.h, allHeights);
  assert.deepEqual(map.metadata.derivedStale, {systems: ["trades"], updatedAt: "existing"});
  console.log(JSON.stringify({scenario, cells: grid.length, crossings, writes: patch.writeSet.length}));
}
