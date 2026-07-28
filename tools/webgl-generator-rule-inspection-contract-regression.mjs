import assert from "node:assert/strict";
import {
  RULE_INSPECTION_CODE,
  RULE_INSPECTOR_SCHEMA_VERSION,
  createRuleInspectionResult,
  issueRuleInspectionToken,
  normalizeRuleInspectionInput,
  validateRuleInspectionToken
} from "../app/webgl-generator/src/runtime/rule-inspection-token.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";

const revision = new MapRevisionTracker({identityFactory: () => "map-rule-contract"});
revision.replaceMap();

const unorderedInput = {
  z: [{name: "边境", ids: [3, 1]}, true],
  a: {targetId: 7, amount: -0}
};
const normalizedInput = normalizeRuleInspectionInput(unorderedInput);
assert.deepEqual(Object.keys(normalizedInput), ["a", "z"], "输入键没有稳定排序");
assert.deepEqual(Object.keys(normalizedInput.a), ["amount", "targetId"], "嵌套输入键没有稳定排序");
assert.equal(Object.is(normalizedInput.a.amount, -0), false, "-0 没有归一化");
assert.notEqual(normalizedInput, unorderedInput, "规范化结果复用了调用方对象");

const equivalentInput = {
  a: {amount: 0, targetId: 7},
  z: [{ids: [3, 1], name: "边境"}, true]
};
const inspection = createRuleInspectionResult(revision, "states.transferProvince", unorderedInput, {
  summary: "可转移省份",
  affected: [{kind: "province", id: 7}, {kind: "state", id: 2}],
  requiresConfirm: true
});
assert.deepEqual(inspection, {
  allowed: true,
  code: RULE_INSPECTION_CODE.OK,
  summary: "可转移省份",
  normalizedInput,
  affected: [{id: 7, kind: "province"}, {id: 2, kind: "state"}],
  requiresConfirm: true,
  expectedRevision: {mapIdentity: "map-rule-contract", mapRevision: 0},
  inspectionToken: inspection.inspectionToken,
  inspectorSchemaVersion: RULE_INSPECTOR_SCHEMA_VERSION
});
assert.match(inspection.inspectionToken, /^rulei1\./, "没有签发独立规则事务令牌");
assert.deepEqual(
  validateRuleInspectionToken(
    revision,
    inspection.inspectionToken,
    "states.transferProvince",
    equivalentInput,
    inspection.expectedRevision
  ),
  {
    valid: true,
    code: RULE_INSPECTION_CODE.OK,
    summary: "预检令牌有效",
    snapshot: inspection.expectedRevision
  },
  "等价纯 JSON 输入没有通过令牌复核"
);

const rejected = createRuleInspectionResult(revision, "states.transferProvince", unorderedInput, {
  allowed: false,
  code: "province-owner-unchanged",
  summary: "省份已属于目标国家",
  affected: [{kind: "province", id: 7}]
});
assert.equal(rejected.inspectionToken, null, "业务拒绝不应签发可执行令牌");
assert.equal(rejected.allowed, false);
assert.equal(rejected.code, "province-owner-unchanged");

assert.equal(
  validateRuleInspectionToken(
    revision,
    inspection.inspectionToken,
    "states.mergeProvinces",
    equivalentInput,
    inspection.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_ACTION_MISMATCH,
  "跨动作令牌没有稳定拒绝"
);
assert.equal(
  validateRuleInspectionToken(
    revision,
    inspection.inspectionToken,
    "states.transferProvince",
    {...equivalentInput, a: {...equivalentInput.a, targetId: 8}},
    inspection.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_INPUT_MISMATCH,
  "输入错配没有稳定拒绝"
);
assert.equal(
  validateRuleInspectionToken(
    revision,
    null,
    "states.transferProvince",
    equivalentInput,
    inspection.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_REQUIRED,
  "缺少令牌没有稳定拒绝"
);

revision.advance();
assert.equal(
  validateRuleInspectionToken(
    revision,
    inspection.inspectionToken,
    "states.transferProvince",
    equivalentInput,
    inspection.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_STALE,
  "陈旧 revision 没有稳定拒绝"
);

const fresh = issueRuleInspectionToken(revision, "states.transferProvince", equivalentInput);
assert.equal(
  validateRuleInspectionToken(
    revision,
    fresh.inspectionToken,
    "states.transferProvince",
    equivalentInput,
    fresh.expectedRevision,
    {schemaVersion: RULE_INSPECTOR_SCHEMA_VERSION + 1}
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_SCHEMA_MISMATCH,
  "跨 inspector schema 令牌没有稳定拒绝"
);

const tampered = `${fresh.inspectionToken.slice(0, -1)}${fresh.inspectionToken.endsWith("0") ? "1" : "0"}`;
assert.equal(
  validateRuleInspectionToken(
    revision,
    tampered,
    "states.transferProvince",
    equivalentInput,
    fresh.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID,
  "篡改签名没有稳定拒绝"
);

const otherMap = new MapRevisionTracker({identityFactory: () => "map-rule-contract-other"});
otherMap.replaceMap();
assert.equal(
  validateRuleInspectionToken(
    otherMap,
    fresh.inspectionToken,
    "states.transferProvince",
    equivalentInput,
    fresh.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_STALE,
  "跨地图 identity 没有稳定拒绝"
);

for (const invalid of [
  {value: {bad: undefined}, label: "undefined"},
  {value: {bad: Number.NaN}, label: "NaN"},
  {value: {bad: new Date()}, label: "Date"},
  {value: [, 1], label: "稀疏数组"}
]) {
  assert.throws(
    () => normalizeRuleInspectionInput(invalid.value),
    error => error?.code === RULE_INSPECTION_CODE.INVALID_ARGUMENT,
    `${invalid.label} 没有被纯 JSON 契约拒绝`
  );
}
const circular = {};
circular.self = circular;
assert.throws(
  () => normalizeRuleInspectionInput(circular),
  error => error?.code === RULE_INSPECTION_CODE.INVALID_ARGUMENT,
  "循环引用没有被纯 JSON 契约拒绝"
);
let getterReads = 0;
const accessorInput = {};
Object.defineProperty(accessorInput, "danger", {
  enumerable: true,
  get() {
    getterReads += 1;
    return 1;
  }
});
assert.throws(
  () => normalizeRuleInspectionInput(accessorInput),
  error => error?.code === RULE_INSPECTION_CODE.INVALID_ARGUMENT,
  "访问器字段没有被纯 JSON 契约拒绝"
);
assert.equal(getterReads, 0, "规范化错误触发了调用方 getter");
const hiddenInput = {};
Object.defineProperty(hiddenInput, "hidden", {value: 1, enumerable: false});
assert.throws(
  () => normalizeRuleInspectionInput(hiddenInput),
  error => error?.code === RULE_INSPECTION_CODE.INVALID_ARGUMENT,
  "不可枚举字段没有被纯 JSON 契约拒绝"
);
let arrayGetterReads = 0;
const arrayAccessorInput = [1];
Object.defineProperty(arrayAccessorInput, "0", {
  enumerable: true,
  get() {
    arrayGetterReads += 1;
    return 1;
  }
});
assert.throws(
  () => normalizeRuleInspectionInput(arrayAccessorInput),
  error => error?.code === RULE_INSPECTION_CODE.INVALID_ARGUMENT,
  "数组访问器没有被纯 JSON 契约拒绝"
);
assert.equal(arrayGetterReads, 0, "规范化错误触发了数组 getter");

const collisionLeft = {probe: 579599};
const collisionRight = {probe: 762382};
assert.equal(
  testFingerprint(JSON.stringify(collisionLeft)),
  testFingerprint(JSON.stringify(collisionRight)),
  "碰撞夹具不再产生相同短指纹"
);
const collisionToken = issueRuleInspectionToken(revision, "states.transferProvince", collisionLeft);
assert.equal(
  validateRuleInspectionToken(
    revision,
    collisionToken.inspectionToken,
    "states.transferProvince",
    collisionRight,
    collisionToken.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID,
  "短输入指纹碰撞错误复用了规则令牌"
);
const collisionActionLeft = "states.a1y89ovz";
const collisionActionRight = "states.a18lizkw";
assert.equal(
  testFingerprint(collisionActionLeft),
  testFingerprint(collisionActionRight),
  "动作碰撞夹具不再产生相同短指纹"
);
const collisionActionToken = issueRuleInspectionToken(revision, collisionActionLeft, {});
assert.equal(
  validateRuleInspectionToken(
    revision,
    collisionActionToken.inspectionToken,
    collisionActionRight,
    {},
    collisionActionToken.expectedRevision
  ).code,
  RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID,
  "短动作指纹碰撞错误复用了规则令牌"
);

assert.throws(
  () => issueRuleInspectionToken({mapIdentity: "unsigned", mapRevision: 0}, "states.transferProvince", {}),
  /签名器/,
  "缺少 signer 时仍签发了可伪造令牌"
);

assert.throws(
  () => createRuleInspectionResult(revision, "states.transferProvince", {}, {allowed: false, code: "ok"}),
  /必须提供非 ok/,
  "业务拒绝错误使用 ok code 未被拒绝"
);
assert.throws(
  () => createRuleInspectionResult(revision, "execute", {}, {}),
  /actionId/,
  "通用 arbitrary execute 标识未被契约拒绝"
);

console.log(JSON.stringify({
  passed: true,
  tokenVersion: "rulei1",
  schemaVersion: RULE_INSPECTOR_SCHEMA_VERSION,
  stableCodes: Object.values(RULE_INSPECTION_CODE).length,
  arbitraryExecuteExposed: false
}, null, 2));

function testFingerprint(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
