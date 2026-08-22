#!/usr/bin/env node

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {parse} from "@babel/parser";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = resolve(root, "app/webgl-generator/src/runtime/app.js");
const workerPath = resolve(root, "app/webgl-generator/src/runtime/height-derived-worker-task.js");
const regenerationWorkerPath = resolve(root, "app/webgl-generator/src/runtime/regeneration-worker-task.js");

const appSource = readFileSync(appPath, "utf8");
const workerSource = readFileSync(workerPath, "utf8");
const regenerationWorkerSource = readFileSync(regenerationWorkerPath, "utf8");

const evidence = validateSources(appSource, workerSource, regenerationWorkerSource);

const appWithUnboundCapture = replaceExactlyOnce(
  appSource,
  '  const constraintBundle = captureRegenerationConstraintBundle(state.map, {closure: ["world"]});',
  '  captureRegenerationConstraintBundle(state.map, {closure: ["world"]});'
);
assert.throws(
  () => validateSources(appWithUnboundCapture, workerSource, regenerationWorkerSource),
  /main bundle capture/,
  "standalone capture call must not replace the bound main bundle declaration"
);

const appWithoutCoreBundle = replaceExactlyOnce(
  appSource,
  "        constraintBundle,\n        rejectLockedDiplomacy: targetKind === \"states\" && !options.constraintBundle",
  "        rejectLockedDiplomacy: targetKind === \"states\" && !options.constraintBundle"
);
assert.throws(
  () => validateSources(appWithoutCoreBundle, workerSource, regenerationWorkerSource),
  /state transaction core call/,
  "states core call must receive the captured constraintBundle"
);

const workerWithoutRealLockedStates = replaceExactlyOnce(
  regenerationWorkerSource,
  "  const capturedStateLocks = constraintBundle ? {snapshots: constraintBundle.lockedStates} : captureLockedRegenerationObjects(map, OBJECT_KIND.STATE);",
  '  const capturedStateLocks = constraintBundle ? {snapshots: []} : captureLockedRegenerationObjects(map, OBJECT_KIND.STATE);\n  "constraintBundle.lockedStates";'
);
assert.throws(
  () => validateSources(appSource, workerSource, workerWithoutRealLockedStates),
  /worker state lockedStates/,
  "standalone string must not replace the real lockedStates read"
);

console.log("webgl generator regeneration lock height/state regression passed", {
  ...evidence,
  negativeCases: 3,
  browserRuns: 0
});

function validateSources(currentAppSource, currentWorkerSource, currentRegenerationWorkerSource) {
  const appAst = parseModule(currentAppSource);
  const workerAst = parseModule(currentWorkerSource);
  const regenerationWorkerAst = parseModule(currentRegenerationWorkerSource);

  const heightEntry = functionTokens(currentAppSource, appAst, "rebuildHeightDerivedViaAction");
  const mainCapture = [
    "const", "constraintBundle", "=", "captureRegenerationConstraintBundle", "(", "state", ".", "map", ",", "{",
    "closure", ":", "[", '"world"', "]", "}", ")", ";"
  ];
  assertSequenceCount(heightEntry, mainCapture, 1, "main bundle capture");
  assertSequenceCount(
    heightEntry,
    ["executeWorkerMapMutation", "(", "state", ",", "documentRef", ",", "{"],
    1,
    "main worker mutation"
  );
  assertSequenceCount(
    heightEntry,
    [
      "assertCommitted", ":", "(", ")", "=>", "constraintBundle", ".", "assertDomain", "(",
      "state", ".", "map", ",", '"world"', ",", '"after"', ")"
    ],
    1,
    "main committed world assertion"
  );
  assertBefore(
    heightEntry,
    mainCapture,
    ["executeWorkerMapMutation", "(", "state", ",", "documentRef", ",", "{"],
    "main capture must precede worker dispatch"
  );

  const heightWorker = functionTokens(currentWorkerSource, workerAst, "runHeightDerivedWorkerTask");
  const workerCapture = [
    "const", "constraintBundle", "=", "captureRegenerationConstraintBundle", "(", "map", ",", "{", "closure", ":", "[",
    '"world"', "]", "}", ")", ";"
  ];
  const domainLookup = ["DOMAIN_BY_KIND", "[", "kind", "]"];
  const beforeAssertion = ["constraintBundle", ".", "assertDomain", "(", "map", ",", "domain", ",", '"before"', ")"];
  const fullyLockedCheck = ["constraintBundle", ".", "isDomainFullyLocked", "(", "domain", ")"];
  const actualRegeneration = [
    "regenerateMapAttributeForWorker", "(", "map", ",", "kind", ",", "{",
    "scope", ":", '"all"', ",", "constraintBundle", ",", "rejectLockedDiplomacy", ":",
    "kind", "===", '"states"', "}", ")"
  ];
  assertSequenceCount(heightWorker, workerCapture, 1, "worker bundle capture");
  assertSequenceCount(heightWorker, domainLookup, 1, "worker domain mapping read");
  assertSequenceCount(heightWorker, beforeAssertion, 1, "worker before assertion");
  assertSequenceCount(heightWorker, fullyLockedCheck, 1, "worker fully locked check");
  assertSequenceCount(heightWorker, actualRegeneration, 1, "worker constrained regeneration call");
  assertSequenceCount(
    heightWorker,
    ["constraintBundle", ".", "assertDomain", "(", "map", ",", '"world"', ",", '"after"', ")"],
    1,
    "worker final world assertion"
  );
  assertBefore(heightWorker, domainLookup, beforeAssertion, "worker domain mapping must precede validation");
  assertBefore(heightWorker, beforeAssertion, fullyLockedCheck, "worker validation must precede locked skip");
  assertBefore(heightWorker, fullyLockedCheck, actualRegeneration, "worker locked skip must precede writes");
  assertDomainMapping(workerAst);

  const stateTransaction = functionTokens(currentAppSource, appAst, "regenerateMapAttributeViaApi");
  const transactionCapture = [
    "const", "constraintBundle", "=", "targetKind", "===", '"states"', "?",
    "captureRegenerationConstraintBundle", "(", "state", ".", "map", ",", "{",
    "closure", ":", "[", '"world"', "]", "}", ")", ":", "options", ".", "constraintBundle", "||", "null", ";"
  ];
  const transactionCore = [
    "regenerateMapAttributeCoreViaApi", "(", "state", ",", "documentRef", ",", "targetKind", ",", "{",
    "...", "options", ",", "constraintBundle", ",", "rejectLockedDiplomacy", ":",
    "targetKind", "===", '"states"', "&&", "!", "options", ".", "constraintBundle", "}", ")"
  ];
  assertSequenceCount(stateTransaction, transactionCapture, 1, "state transaction bundle capture");
  assertSequenceCount(stateTransaction, transactionCore, 1, "state transaction core call");
  assertSequenceCount(
    stateTransaction,
    ["constraintBundle", ".", "assertDomain", "(", "state", ".", "map", ",", '"world"', ",", '"after"', ")"],
    1,
    "state transaction world assertion"
  );
  assertBefore(stateTransaction, transactionCapture, transactionCore, "state capture must precede core mutation");

  const mainState = functionTokens(currentAppSource, appAst, "regenerateStates");
  const workerState = functionTokens(currentRegenerationWorkerSource, regenerationWorkerAst, "regenerateStates");
  for (const [label, tokens] of [["main", mainState], ["worker", workerState]]) {
    for (const field of ["lockedStates", "lockedProvinces", "lockedCities", "lockedRoutes", "lockedDiplomacyRelations"]) {
      assertSequenceCount(tokens, ["constraintBundle", ".", field], 1, `${label} state ${field}`);
    }
    assertSequenceCount(
      tokens,
      [
        "regenerationLockConflict", "(", "OBJECT_KIND", ".", "DIPLOMACY_RELATION", ",", "{",
        "kind", ":", "OBJECT_KIND", ".", "DIPLOMACY_RELATION", ",", "id", ":"
      ],
      1,
      `${label} state diplomacy conflict`
    );
  }
  assertSequenceCount(
    mainState,
    ["restoreRegenerationSalt", "(", "map", ",", "previousSalt", ")", ";", "throw", "error", ";"],
    1,
    "main state rollback"
  );
  assertSequenceCount(
    workerState,
    ["restoreRegenerationSalt", "(", "map", ",", "previousSalt", ")", ";", "return", "regenerationResult", "("],
    1,
    "worker state no-result rollback"
  );

  return {
    height: {
      mainBundleCaptures: countSequence(heightEntry, mainCapture),
      workerBundleCaptures: countSequence(heightWorker, workerCapture),
      domains: 8,
      finalClosure: "world"
    },
    state: {
      bundleCaptures: countSequence(stateTransaction, transactionCapture),
      protectedSlices: 5,
      prewriteConflict: "state-regeneration-cannot-preserve-diplomacy",
      rollback: "salt"
    }
  };
}

function assertDomainMapping(ast) {
  const declaration = findNode(ast, node => node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === "DOMAIN_BY_KIND");
  assert.ok(declaration, "DOMAIN_BY_KIND declaration must exist");
  assert.equal(declaration.init?.type, "CallExpression", "DOMAIN_BY_KIND must be created by a call");
  assert.equal(declaration.init?.callee?.type, "MemberExpression", "DOMAIN_BY_KIND must call Object.freeze");
  assert.equal(declaration.init.callee.object?.name, "Object", "DOMAIN_BY_KIND owner must be Object");
  assert.equal(declaration.init.callee.property?.name, "freeze", "DOMAIN_BY_KIND must be frozen");
  const object = declaration.init.arguments?.[0];
  assert.equal(object?.type, "ObjectExpression", "DOMAIN_BY_KIND must freeze an object literal");
  const entries = object.properties.map(property => {
    assert.equal(property.type, "ObjectProperty", "DOMAIN_BY_KIND may only contain direct object properties");
    assert.equal(property.computed, false, "DOMAIN_BY_KIND keys must be static");
    assert.equal(property.value?.type, "StringLiteral", "DOMAIN_BY_KIND values must be string literals");
    const key = property.key.type === "Identifier" ? property.key.name : property.key.value;
    return [key, property.value.value];
  });
  assert.deepEqual(Object.fromEntries(entries), {
    features: "features",
    rivers: "rivers",
    states: "states-provinces",
    religions: "religions",
    markers: "markers-economy",
    diplomacy: "diplomacy",
    military: "military",
    zones: "zones"
  }, "DOMAIN_BY_KIND must retain the exact eight-domain closure mapping");
}

function parseModule(source) {
  return parse(source, {sourceType: "module", tokens: true});
}

function functionTokens(source, ast, name) {
  const node = findNode(ast, candidate => candidate.type === "FunctionDeclaration" && candidate.id?.name === name);
  assert.ok(node, `function ${name} must exist`);
  return ast.tokens
    .filter(token => token.start >= node.start && token.end <= node.end && typeof token.type?.label === "string" && token.type.label !== "eof")
    .map(token => source.slice(token.start, token.end));
}

function findNode(rootNode, predicate) {
  const queue = [rootNode];
  const visited = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || visited.has(node)) continue;
    visited.add(node);
    if (predicate(node)) return node;
    for (const [key, value] of Object.entries(node)) {
      if (["tokens", "comments", "loc", "extra"].includes(key)) continue;
      if (Array.isArray(value)) queue.push(...value);
      else if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

function assertSequenceCount(tokens, expected, count, label) {
  assert.equal(
    countSequence(tokens, expected),
    count,
    `${label}: expected exact executable token sequence ${JSON.stringify(expected)} ${count} time(s)`
  );
}

function assertBefore(tokens, first, second, label) {
  const firstIndex = indexOfSequence(tokens, first);
  const secondIndex = indexOfSequence(tokens, second);
  assert.ok(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex, label);
}

function countSequence(tokens, expected) {
  let count = 0;
  for (let index = 0; index <= tokens.length - expected.length; index++) {
    if (expected.every((token, offset) => tokens[index + offset] === token)) count++;
  }
  return count;
}

function indexOfSequence(tokens, expected) {
  for (let index = 0; index <= tokens.length - expected.length; index++) {
    if (expected.every((token, offset) => tokens[index + offset] === token)) return index;
  }
  return -1;
}

function replaceExactlyOnce(source, target, replacement) {
  assert.equal(source.split(target).length - 1, 1, `negative fixture target must occur exactly once: ${target}`);
  return source.replace(target, replacement);
}
