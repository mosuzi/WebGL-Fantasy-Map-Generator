#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {API_METHODS, CONFIRM_REQUIRED_METHODS, buildApiContract} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {listCellActions} from "../app/webgl-generator/src/runtime/cell-action-inspector-registry.js";
import {
  getPlannerRecipe,
  listPlannerRecipes,
  validatePlannerRecipeRegistry
} from "../app/webgl-generator/src/runtime/planner-recipe-registry.js";
import {
  PLANNER_RECIPE_DOC_PATH,
  buildPlannerRecipeDocSyncReport
} from "./webgl-generator-planner-recipe-doc-sync.mjs";

const EXPECTED_RECIPE_IDS = [
  "scenario.colonize-region",
  "scenario.invasion-and-annexation",
  "scenario.administrative-reform",
  "scenario.population-resettlement",
  "scenario.cultural-assimilation",
  "scenario.infrastructure-development",
  "scenario.coastline-engineering",
  "scenario.climate-disaster",
  "scenario.state-reformation",
  "scenario.publish-map"
];
const EXPECTED_STEP_COUNTS = [5, 5, 5, 5, 3, 4, 4, 4, 4, 4];
const publicMethods = Object.entries(API_METHODS)
  .flatMap(([namespace, methods]) => methods.map(method => `${namespace}.${method}`));
const validation = validatePlannerRecipeRegistry(publicMethods);

assert.equal(validation.valid, true);
assert.equal(validation.recipeCount, 10);
assert.equal(validation.stepCount, 43);
assert.deepEqual(validation.recipeIds, EXPECTED_RECIPE_IDS);
for (const field of [
  "rawDuplicateRecipeIds",
  "rawDuplicateStepIds",
  "invalidFields",
  "placeholderMethods",
  "unknownMethods"
]) {
  assert.deepEqual(validation[field], [], `${field} 必须为空`);
}

const summaries = listPlannerRecipes();
assert.deepEqual(summaries.map(recipe => recipe.recipeId), EXPECTED_RECIPE_IDS);
assert.deepEqual(summaries.map(recipe => recipe.stepCount), EXPECTED_STEP_COUNTS);
const recipes = EXPECTED_RECIPE_IDS.map(getPlannerRecipe);
const publishLayers = getPlannerRecipe("scenario.publish-map").steps.find(step => step.stepId === "layers-and-themes");
assert.deepEqual(publishLayers.executeMethods, ["layers.setViewMode", "layers.setVisible", "layers.setTheme"]);
assert.equal(publishLayers.compensation.mode, "restore-display-preferences");
assert.deepEqual(publishLayers.compensation.methods, publishLayers.executeMethods);
assert.match(publishLayers.successCriteria.join("\n"), /不增加 map revision/u);

for (const [index, recipe] of recipes.entries()) {
  assert.equal(recipe.steps.length, EXPECTED_STEP_COUNTS[index]);
  assert.match(recipe.historyPolicy, /不承诺跨步骤原子性/u);
  assert.match(recipe.compatibilityPolicy, /稳定公开方法/u);
  assert.ok(recipe.preconditions.length && recipe.successCriteria.length);
  assert.equal(new Set(recipe.steps.map(step => step.stepId)).size, recipe.steps.length);
  for (const step of recipe.steps) {
    assert.ok(["rule", "service", "fact"].includes(step.kind));
    assert.equal(step.kind === "rule", Boolean(step.actionId));
    assert.ok(step.facts.length);
    assert.ok(step.inspection.methods.length);
    assert.ok(step.executeMethods.length);
    assert.ok(step.inputTemplate && typeof step.inputTemplate === "object");
    assert.ok(step.preconditions.length);
    assert.equal(step.authorization.mode, "per-method-policy");
    assert.ok(step.authorization.policy);
    assert.ok(step.successCriteria.length);
    assert.ok(
      step.successCriteria.some(item => step.facts.some(method => item.includes(method))),
      `${recipe.recipeId}:${step.stepId} 成功条件缺少可重读事实`
    );
    assert.equal(
      step.successCriteria.some(item => /公开调用返回成功包络|提交后重新读取事实与 revision/u.test(item)),
      false,
      `${recipe.recipeId}:${step.stepId} 仍使用占位成功条件`
    );
    assert.ok(step.failurePolicy.rejected);
    assert.ok(step.failurePolicy.stale);
    assert.match(step.failurePolicy.partial, /不把已提交步骤伪装成整体回滚/u);
    assert.ok(step.compensation.mode);
    assert.ok(step.compensation.guard);
    if (step.compensation.method || step.compensation.methods?.length) {
      assert.match(step.compensation.guard, new RegExp(`stepId 精确等于 ${step.stepId}`, "u"));
      assert.match(step.compensation.guard, /当前 revision 精确等于 ledger\.afterRevision/u);
    }
    if (step.compensation.method) {
      assert.equal(step.compensation.method, "history.undo");
      assert.match(step.compensation.guard, /最新一条历史/u);
      assert.match(step.compensation.guard, /明确授权/u);
    }
    assert.deepEqual(step.revisionCheckpoints, [
      "before-facts",
      "after-inspection",
      "before-execution",
      "after-each-commit"
    ]);
  }
}

const cellActions = new Map(listCellActions().map(action => [action.actionId, action]));
const spatialSteps = recipes.flatMap(recipe => recipe.steps.filter(step => step.spatialActionId));
assert.equal(spatialSteps.length, 3);
for (const step of spatialSteps) {
  assert.equal(step.spatialActionId, "routes.createPath");
  assert.equal(step.inputTemplate.actionId, step.spatialActionId);
  const action = cellActions.get(step.spatialActionId);
  assert.ok(action);
  assert.equal(action.inspectTarget, `cells.inspectAction:${step.spatialActionId}`);
  assert.ok(step.executeMethods.includes(action.executeTarget));
}

const docSync = buildPlannerRecipeDocSyncReport();
assert.equal(docSync.complete, true);
assert.equal(docSync.recipeCount, 10);
assert.equal(docSync.stepCount, 43);
for (const field of ["machineOnly", "docsOnly", "fieldMismatch", "methodMismatch"]) {
  assert.deepEqual(docSync[field], [], `玩法文档双向差集 ${field} 必须为空`);
}
const documentSource = readFileSync(PLANNER_RECIPE_DOC_PATH, "utf8");
const staleDocument = documentSource.replace("`objects.get<br>cells.get`", "`objects.get`");
const staleDocReport = buildPlannerRecipeDocSyncReport(staleDocument);
assert.equal(staleDocReport.complete, false);
assert.ok(staleDocReport.methodMismatch.length > 0, "文档方法漂移没有被双向检查发现");

const listClone = listPlannerRecipes();
listClone[0].title = "被外部修改";
listClone[0].stepIds.push("foreign-step");
assert.notEqual(listPlannerRecipes()[0].title, "被外部修改");
assert.equal(listPlannerRecipes()[0].stepIds.includes("foreign-step"), false);
const recipeClone = getPlannerRecipe(EXPECTED_RECIPE_IDS[0]);
recipeClone.steps[0].facts.push("foreign.method");
recipeClone.failurePolicy.rejected = "被外部修改";
const freshRecipe = getPlannerRecipe(EXPECTED_RECIPE_IDS[0]);
assert.equal(freshRecipe.steps[0].facts.includes("foreign.method"), false);
assert.notEqual(freshRecipe.failurePolicy.rejected, "被外部修改");

assert.throws(
  () => getPlannerRecipe("scenario.unknown"),
  error => error?.code === "recipe-not-found" && /未知 AI 规划器配方/u.test(error.message)
);

const syntheticMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [
  namespace,
  Object.fromEntries(methods.map(method => {
    const qualified = `${namespace}.${method}`;
    return [method, {
      stable: "draft",
      mutates: "none",
      undoable: false,
      async: false,
      requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(qualified)
    }];
  }))
]));
const apiContract = buildApiContract(API_METHODS, syntheticMetadata);
const descriptions = buildApiMethodDescriptionRegistry(API_METHODS, apiContract.methodMetadata);
assert.equal(descriptions["planner.listRecipes"].metadata.mutates, "none");
assert.equal(descriptions["planner.getRecipe"].metadata.mutates, "none");
assert.equal(descriptions["planner.getRecipe"].businessCodes.includes("recipe-not-found"), true);
for (const method of validation.methodRefs) {
  assert.ok(descriptions[method], `配方精确方法缺少 info.describe：${method}`);
}

const simulations = {};
for (const recipe of recipes) {
  const first = simulateRecipe(recipe);
  assert.deepEqual(first, simulateRecipe(recipe), `${recipe.recipeId} 模拟序列不确定`);
  assert.equal(first.success.outcome, "success");
  assert.equal(first.reject.outcome, "rejected");
  assert.equal(first.stale.outcome, "success-after-stale");
  assert.equal(first.compensation.outcome, "compensated-or-preserved");
  assert.ok(first.success.calls.length > first.reject.calls.length);
  assert.ok(first.stale.calls.includes("checkpoint:stale-detected"));
  assert.ok(first.stale.calls.includes("checkpoint:refresh-facts"));
  const firstCompensable = recipe.steps.find(step =>
    step.compensation.method || step.compensation.methods?.length
  );
  if (firstCompensable?.compensation.method) {
    assert.equal(first.compensation.calls.at(-1), `compensate:${firstCompensable.compensation.method}`);
  } else if (firstCompensable?.compensation.methods?.length) {
    assert.deepEqual(
      first.compensation.calls.slice(-firstCompensable.compensation.methods.length),
      firstCompensable.compensation.methods.map(method => `compensate:${method}`)
    );
  } else {
    assert.equal(first.compensation.calls.at(-1), "compensate:none");
  }
  simulations[recipe.recipeId] = {
    successCalls: first.success.calls.length,
    rejectCalls: first.reject.calls.length,
    staleCalls: first.stale.calls.length,
    compensationCalls: first.compensation.calls.length
  };
}

console.log(JSON.stringify({
  recipes: validation.recipeCount,
  steps: validation.stepCount,
  methodRefs: validation.methodRefs.length,
  duplicateRecipeIds: validation.rawDuplicateRecipeIds,
  duplicateStepIds: validation.rawDuplicateStepIds,
  placeholderMethods: validation.placeholderMethods,
  unknownMethods: validation.unknownMethods,
  documentSync: {
    canonicalDigest: docSync.canonicalDigest,
    machineOnly: docSync.machineOnly,
    docsOnly: docSync.docsOnly,
    fieldMismatch: docSync.fieldMismatch,
    methodMismatch: docSync.methodMismatch
  },
  simulations
}, null, 2));

function simulateRecipe(recipe) {
  return {
    success: simulate(recipe, "success"),
    reject: simulate(recipe, "reject"),
    stale: simulate(recipe, "stale"),
    compensation: simulate(recipe, "compensation")
  };
}

function simulate(recipe, mode) {
  const calls = [];
  let revision = 100;
  for (const step of recipe.steps) {
    calls.push(`step:${step.stepId}`, `checkpoint:${step.revisionCheckpoints[0]}`);
    for (const method of step.facts) calls.push(`fact:${method}@${revision}`);
    for (const method of step.inspection.methods) calls.push(`inspect:${method}@${revision}`);
    calls.push(`checkpoint:${step.revisionCheckpoints[1]}`);

    if (mode === "reject") return {outcome: "rejected", revision, calls: [...calls, "decision:stop-and-replan"]};
    if (mode === "stale") {
      revision += 1;
      calls.push("checkpoint:stale-detected", "checkpoint:refresh-facts");
      for (const method of step.facts) calls.push(`fact:${method}@${revision}`);
      for (const method of step.inspection.methods) calls.push(`inspect:${method}@${revision}`);
      mode = "success-after-stale";
    }

    calls.push(`checkpoint:${step.revisionCheckpoints[2]}`);
    const selectedMethod = step.executeMethods[0];
    calls.push(`execute:${selectedMethod}@${revision}`);
    if (step.kind === "rule") {
      revision += 1;
    }
    calls.push(`checkpoint:${step.revisionCheckpoints[3]}@${revision}`);

    if (mode === "compensation") {
      const compensationMethods = [
        ...(step.compensation.method ? [step.compensation.method] : []),
        ...(step.compensation.methods || [])
      ];
      if (compensationMethods.length) {
        calls.push(`guard:${step.compensation.guard}`);
        for (const method of compensationMethods) calls.push(`compensate:${method}`);
        return {outcome: "compensated-or-preserved", revision, calls};
      }
    }
  }
  if (mode === "compensation") return {outcome: "compensated-or-preserved", revision, calls: [...calls, "compensate:none"]};
  return {outcome: mode === "success-after-stale" ? mode : "success", revision, calls};
}
