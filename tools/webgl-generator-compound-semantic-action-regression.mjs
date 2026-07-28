#!/usr/bin/env node
import assert from "node:assert/strict";

import {buildCompoundSemanticActionAudit} from "./webgl-generator-compound-semantic-action-audit.mjs";

const report = buildCompoundSemanticActionAudit();
const byId = new Map(report.actions.map(action => [action.id, action]));

assert.equal(report.totals.structuralGaps, 0);
assert.equal(report.denominator.classifiedApiMethods, report.denominator.publicApiMethods);
assert.equal(report.denominator.classifiedCellActionRows, report.denominator.cellActionRows);
assert.equal(report.denominator.fullCapabilityGaps, 0);
assert.ok(report.totals.ruleTransactions >= 50);
assert.ok(report.totals.plannerRecipes >= 10);
assert.equal(report.totals.statuses["existing-transaction"], 59);
assert.equal(report.totals.statuses["existing-needs-inspector"] || 0, 0);
assert.equal(report.totals.statuses["fragmented-needs-transaction"], 3);

for (const [id, inspect, execute] of [
  ["politics.create-state", "edit.states.inspectCreateAtCell", "edit.states.createAtCell"],
  ["politics.create-province", "edit.provinces.inspectCreateAtCell", "edit.provinces.createAtCell"],
  ["settlement.found-city", "edit.cities.inspectCreateAtCell", "edit.cities.createAtCell"]
]) {
  const action = byId.get(id);
  assert.equal(action?.status, "existing-transaction", `${id} 没有按第 195 项真实实现重新归类`);
  assert.equal(action?.inspect, inspect);
  assert.equal(action?.execute, execute);
  assert.ok(action?.api.includes(inspect));
  assert.ok(action?.api.includes(execute));
}

for (const [id, inspect, execute] of [
  ["terrain.edit-height-region", "edit.height.inspectChanges", "edit.height.applyChanges"],
  ["hydrology.create-river", "edit.rivers.inspectCreate", "edit.rivers.create"],
  ["hydrology.delete-river", "edit.rivers.inspectDelete", "edit.rivers.delete"],
  ["hydrology.excavate-lake", "edit.lakes.inspectCreate", "edit.lakes.create"],
  ["hydrology.delete-lake", "edit.lakes.inspectDelete", "edit.lakes.delete"],
  ["ecology.assign-biome", "edit.biomes.inspectAssignment", "edit.biomes.assignCells"],
  ["politics.delete-state", "edit.states.inspectDelete", "edit.states.delete"],
  ["politics.delete-province", "edit.provinces.inspectDelete", "edit.provinces.delete"],
  ["settlement.delete-city", "edit.cities.inspectDelete", "edit.cities.delete"],
  ["infrastructure.delete-route", "edit.routes.inspectDelete", "edit.routes.delete"]
]) {
  const action = byId.get(id);
  assert.equal(action?.status, "existing-transaction", `${id} 尚未闭合为完整规则事务`);
  if (id === "terrain.edit-height-region") assert.match(action?.inspect || "", /edit\.height\.inspectChanges/u);
  else assert.equal(action?.inspect, inspect);
  if (id === "terrain.edit-height-region") assert.match(action?.execute || "", /edit\.height\.applyChanges/u);
  else assert.equal(action?.execute, execute);
  assert.ok(action?.api.includes(inspect));
  assert.ok(action?.api.includes(execute));
}

const zoneManagement = byId.get("infrastructure.manage-zone");
assert.equal(zoneManagement?.status, "existing-transaction");
assert.match(zoneManagement?.inspect || "", /edit\.zones\.inspectCreate/u);
assert.match(zoneManagement?.inspect || "", /edit\.zones\.inspectDelete/u);

const territory = byId.get("politics.transfer-territory");
assert.equal(territory.status, "fragmented-needs-transaction");
assert.match(territory.inspect, /inspectTerritoryTransfer/u);

for (const [id, inspect, execute] of [
  ["society.bind-namebase-and-rename", "namebases.inspectBindAndRename", "namebases.bindAndRename"],
  ["society.replace-or-remove-namebase", "namebases.inspectReplacement", "namebases.replace"]
]) {
  const action = byId.get(id);
  assert.equal(action?.status, "existing-transaction", `${id} 尚未闭合为原子规则事务`);
  assert.equal(action?.inspect, inspect);
  assert.equal(action?.execute, execute);
  assert.ok(action?.api.includes(inspect));
  assert.ok(action?.api.includes(execute));
}
assert.match(territory.execute, /transferTerritory/u);
assert.ok(territory.branches.some(item => item.includes("最后领土")));
assert.ok(territory.api.includes("edit.states.applyChanges"));
assert.ok(territory.api.includes("edit.states.merge"));

const province = byId.get("politics.ensure-province-assignment");
assert.equal(province.status, "fragmented-needs-transaction");
assert.ok(province.variants.includes("ensure"));

for (const id of [
  "diplomacy.declare-war",
  "diplomacy.make-peace",
  "diplomacy.change-overlord",
  "military.resolve-battle",
  "politics.merge-provinces",
  "politics.split-province"
]) {
  assert.equal(byId.get(id)?.status, "missing-game-rule", `${id} 没有登记为缺失游戏规则`);
}

for (const action of report.actions.filter(item => item.tier === "planner-recipe")) {
  assert.equal(action.status, "recipe-only");
  assert.ok(action.steps.length >= 3);
}

console.log(JSON.stringify({
  actions: report.totals.actions,
  ruleTransactions: report.totals.ruleTransactions,
  plannerRecipes: report.totals.plannerRecipes,
  statuses: report.totals.statuses,
  publicApiMethods: report.denominator.publicApiMethods,
  cellActionRows: report.denominator.cellActionRows,
  structuralGaps: report.totals.structuralGaps
}, null, 2));
