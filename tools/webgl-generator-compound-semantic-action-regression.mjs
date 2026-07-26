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

const territory = byId.get("politics.transfer-territory");
assert.equal(territory.status, "fragmented-needs-transaction");
assert.match(territory.inspect, /inspectTerritoryTransfer/u);
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
