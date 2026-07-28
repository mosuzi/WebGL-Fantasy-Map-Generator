import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {
  REMAINING_RULE_ACTION,
  REMAINING_RULE_ACTIONS,
  inspectRemainingRuleAction
} from "../app/webgl-generator/src/runtime/remaining-rule-inspectors.js";

const map = createFixture();
const before = JSON.stringify(map);

const cases = [
  [REMAINING_RULE_ACTION.CAPITAL_CHANGE, {stateId: 1, cityId: 2}, {allowed: true, reject: {stateId: 1, cityId: 3}, code: "city-state-mismatch"}],
  [REMAINING_RULE_ACTION.CITY_OWNER_SYNC, {cityId: 2}, {allowed: true, reject: {cityId: 1}, code: "owner-unchanged"}],
  [REMAINING_RULE_ACTION.CULTURE_LIFECYCLE, {operation: "create", name: "新文化"}, {allowed: true, reject: {operation: "delete", id: 0}, code: "invalid-culture"}],
  [REMAINING_RULE_ACTION.RELIGION_LIFECYCLE, {operation: "reparent", id: 2, parentId: 1}, {allowed: true, reject: {operation: "reparent", id: 1, parentId: 1}, code: "parent-cycle-or-missing"}],
  [REMAINING_RULE_ACTION.DIPLOMACY_RELATION, {subjectId: 1, objectId: 2, relation: "Enemy"}, {allowed: true, reject: {subjectId: 1, objectId: 1, relation: "Enemy"}, code: "same-state"}],
  [REMAINING_RULE_ACTION.MILITARY_RATIOS, {stateId: 1, ratios: {infantry: 0.7, archers: 0.3, cavalry: 0, artillery: 0, fleet: 0}}, {allowed: true, reject: {stateId: 1, ratios: {infantry: -1}}, code: "invalid-ratios"}],
  [REMAINING_RULE_ACTION.MILITARY_MOVE, {target: {stateId: 1, regimentId: 1}, destination: {packCell: 3}}, {allowed: true, reject: {target: {stateId: 1, regimentId: 1}, destination: {packCell: 99}}, code: "destination-not-found"}],
  [REMAINING_RULE_ACTION.MILITARY_BASE, {target: {stateId: 1, regimentId: 1}}, {allowed: true, reject: {target: {stateId: 1, regimentId: 99}}, code: "regiment-not-found"}],
  [REMAINING_RULE_ACTION.MILITARY_STATUS, {target: {stateId: 1, regimentId: 1}, status: "marching"}, {allowed: true, reject: {target: {stateId: 1, regimentId: 1}, status: "invalid"}, code: "invalid-status"}],
  [REMAINING_RULE_ACTION.COLLECTION_IMPORT, {
    kind: "measurements",
    items: [{name: "边界线", points: [{x: 0, y: 0}, {x: 10, y: 10}]}]
  }, {
    allowed: true,
    reject: {kind: "measurements", items: []},
    code: "empty-measurements"
  }]
];

assert.equal(REMAINING_RULE_ACTIONS.length, 10, "剩余 inspector 动作族分母必须是 10");
assert.equal(new Set(REMAINING_RULE_ACTIONS).size, 10, "剩余 inspector actionId 必须唯一");

for (const [actionId, input, expected] of cases) {
  const inspection = inspectRemainingRuleAction(map, actionId, input);
  assert.deepEqual(Object.keys(inspection), ["allowed", "code", "summary", "affected", "requiresConfirm"], `${actionId} 返回包络字段漂移`);
  assert.equal(inspection.allowed, expected.allowed, `${actionId} 合法输入被拒绝：${inspection.summary}`);
  assert.equal(inspection.code, "ok", `${actionId} 合法输入 code 异常`);
  assert(inspection.summary.length > 0, `${actionId} 缺少人类可读摘要`);
  assert(Array.isArray(inspection.affected), `${actionId} affected 不是数组`);

  const rejected = inspectRemainingRuleAction(map, actionId, expected.reject);
  assert.equal(rejected.allowed, false, `${actionId} 非法或 no-op 输入被放行`);
  assert.equal(rejected.code, expected.code, `${actionId} 稳定拒绝 code 漂移`);
}

const notesInspection = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.COLLECTION_IMPORT, {
  kind: "notes",
  document: {
    type: "webgl-generator-notes-summary",
    version: 1,
    notes: [{id: "state:1", kind: "state", objectId: 1, name: "国家备注", body: "正文"}]
  },
  options: {mode: "append"}
});
assert.equal(notesInspection.allowed, true, notesInspection.summary);

const namebaseInspection = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.COLLECTION_IMPORT, {
  kind: "namebases",
  document: {bases: [{id: "import-a", name: "导入库", source: ["甲", "乙"]}], metadata: {format: "webgl-json"}},
  options: {filename: "fixture.json"}
});
assert.equal(namebaseInspection.allowed, true, namebaseInspection.summary);

const militaryImport = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.COLLECTION_IMPORT, {
  kind: "military-events",
  document: {events: [{stateId: 1, regimentId: 1, type: "skirmish", outcome: "victory"}]}
});
assert.equal(militaryImport.allowed, true, militaryImport.summary);

const cultureAssign = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.CULTURE_LIFECYCLE, {
  operation: "assign",
  id: 2,
  gridCellIds: [1]
});
assert.equal(cultureAssign.allowed, true, cultureAssign.summary);

const religionExpandRejected = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.RELIGION_LIFECYCLE, {
  operation: "expand",
  id: 99,
  options: {mode: "save", center: 1, expansionism: 1}
});
assert.equal(religionExpandRejected.allowed, false, "不存在宗教的扩张必须稳定拒绝");

const crossStateMap = createFixture();
crossStateMap.settlements.cities[2].packCell = 2;
crossStateMap.settlements.cities[2].cell = 2;
const crossStateOwner = inspectRemainingRuleAction(crossStateMap, REMAINING_RULE_ACTION.CITY_OWNER_SYNC, {cityId: 2});
assert.equal(crossStateOwner.allowed, true, crossStateOwner.summary);
assert.equal(crossStateOwner.requiresConfirm, true, "跨国家同步城市归属必须要求确认");

assert.equal(
  inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.DIPLOMACY_RELATION, {
    subjectId: 1,
    objectId: 2,
    relation: "Enemy"
  }).requiresConfirm,
  true,
  "进入敌对关系必须要求确认"
);
assert.equal(
  inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.MILITARY_RATIOS, {
    stateId: 1,
    ratios: {infantry: 0.7, archers: 0.3}
  }).requiresConfirm,
  true,
  "军队重配必须要求确认"
);
assert.equal(
  inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.COLLECTION_IMPORT, {
    kind: "notes",
    document: {
      type: "webgl-generator-notes-summary",
      version: 1,
      notes: [{id: "state:1", kind: "state", objectId: 1, name: "替换备注", body: "正文"}]
    },
    options: {mode: "replace"}
  }).requiresConfirm,
  true,
  "备注替换导入必须要求确认"
);
assert.equal(
  inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.COLLECTION_IMPORT, {
    kind: "namebases",
    document: {bases: [{id: "import-a", name: "导入库", source: ["甲", "乙"]}], metadata: {format: "webgl-json"}},
    options: {filename: "fixture.json", mode: "replace"}
  }).requiresConfirm,
  true,
  "名称库替换导入必须要求确认"
);

const invalidBatch = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.MILITARY_STATUS, {
  targets: [{stateId: 1, regimentId: 1}, {stateId: 1, regimentId: 99}],
  status: "marching"
});
assert.equal(invalidBatch.allowed, false, "军团批量态势不得部分执行");
assert.equal(invalidBatch.code, "regiment-not-found");
const malformedBatch = inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.MILITARY_STATUS, {
  targets: [{stateId: 1, regimentId: 1}, {}],
  status: "marching"
});
assert.equal(malformedBatch.allowed, false, "军团批量态势不得静默过滤畸形目标后部分执行");
assert.equal(malformedBatch.code, "invalid-target");
assert.equal(
  inspectRemainingRuleAction(map, REMAINING_RULE_ACTION.MILITARY_MOVE, {
    target: {stateId: 1, regimentId: 1},
    destination: {packCell: 2}
  }).code,
  "foreign-territory",
  "军团不得移动到外国领土"
);
const waterMoveMap = createFixture();
waterMoveMap.pack.cells.h[3] = 10;
assert.equal(
  inspectRemainingRuleAction(waterMoveMap, REMAINING_RULE_ACTION.MILITARY_MOVE, {
    target: {stateId: 1, regimentId: 1},
    destination: {packCell: 3}
  }).code,
  "terrain-mismatch",
  "陆军不得移动到水域"
);

assert.equal(JSON.stringify(map), before, "全部领域 inspector 必须纯读");
assert.equal(inspectRemainingRuleAction(map, "execute", {}).code, "unknown-action", "不能接受通用执行 actionId");

const source = readFileSync(new URL("../app/webgl-generator/src/runtime/remaining-rule-inspectors.js", import.meta.url), "utf8");
assert(!/export\s+(?:async\s+)?function\s+(?:execute|run|dispatch|invoke)/.test(source), "核心模块不得暴露通用 executor");
assert(!/\.apply\s*\(\s*\{\s*map/.test(source), "核心模块不得调用命令 apply");

const syntheticMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [
  namespace,
  Object.fromEntries(methods.map(method => [method, {
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`)
  }]))
]));
const descriptions = buildApiMethodDescriptionRegistry(API_METHODS, syntheticMetadata);
const inspectorCodes = {
  "edit.states.inspectCapitalChange": "city-state-mismatch",
  "edit.cities.inspectOwnerSync": "capital-owner-conflict",
  "edit.cultures.inspectLifecycle": "parent-cycle-or-missing",
  "edit.religions.inspectLifecycle": "parent-cycle-or-missing",
  "edit.diplomacy.inspectRelation": "same-state",
  "edit.military.inspectRatios": "invalid-ratios",
  "edit.military.inspectMoveStation": "foreign-territory",
  "edit.military.inspectBase": "base-unchanged",
  "edit.military.inspectStatus": "invalid-status",
  "data.inspectCollectionImport": "invalid-collection-kind"
};
for (const [method, actionCode] of Object.entries(inspectorCodes)) {
  const description = descriptions[method];
  const required = description?.resultSchema?.properties?.data?.required || [];
  for (const field of [
    "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
    "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
  ]) {
    assert.ok(required.includes(field), `${method} 的 info.describe 缺少 ${field}`);
  }
  assert.ok(description.businessCodes.includes(actionCode), `${method} 缺少 action-specific code ${actionCode}`);
  assert.ok(description.businessCodes.includes("invalid-argument"), `${method} 缺少规则规范化错误码 invalid-argument`);
}
for (const method of ["edit.cultures.inspectLifecycle", "edit.religions.inspectLifecycle"]) {
  for (const code of [
    "culture-store-missing", "religion-store-missing", "invalid-culture", "invalid-religion",
    "culture-not-found", "religion-not-found", "invalid-mode", "missing-object", "regeneration_locked_noop"
  ]) {
    assert.ok(descriptions[method].businessCodes.includes(code), `${method} 缺少真实生命周期 code ${code}`);
  }
}
assert.ok(descriptions["edit.military.inspectStatus"].businessCodes.includes("invalid-target"), "军团态势预检缺少 invalid-target");

const executorMethods = [
  "edit.states.setCapital", "edit.cities.syncOwner",
  "edit.cultures.add", "edit.cultures.assignCells", "edit.cultures.applyExpansion",
  "edit.cultures.delete", "edit.cultures.setParent",
  "edit.religions.add", "edit.religions.assignCells", "edit.religions.applyExpansion",
  "edit.religions.delete", "edit.religions.setParent",
  "edit.diplomacy.setRelation", "edit.military.setRatios", "edit.military.moveStation",
  "edit.military.setBase", "edit.military.setStatus", "edit.military.setStatusBatch",
  "edit.notes.import", "edit.measurements.import", "namebases.import", "edit.military.importBattleEvents"
];
for (const method of executorMethods) {
  const options = descriptions[method]?.inputSchema?.prefixItems?.find(item => item.title === "options");
  assert.ok(options?.properties?.inspectionToken, `${method} 没有描述 inspectionToken`);
  assert.ok(options?.properties?.expectedRevision, `${method} 没有描述 expectedRevision`);
}

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const consoleApiSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
for (const method of Object.keys(inspectorCodes)) {
  assert.ok(consoleApiSource.includes(`"${method}"`), `${method} 没有穿过公开 console API`);
}
for (const [functionName, actionId] of [
  ["setStateCapitalViaApi", "CAPITAL_CHANGE"],
  ["syncCityOwnerViaApi", "CITY_OWNER_SYNC"],
  ["setDiplomacyRelationViaApi", "DIPLOMACY_RELATION"],
  ["setMilitaryRatiosViaApi", "MILITARY_RATIOS"],
  ["setMilitaryStatusViaApi", "MILITARY_STATUS"],
  ["setMilitaryStatusBatchViaApi", "MILITARY_STATUS"],
  ["moveMilitaryStationViaApi", "MILITARY_MOVE"],
  ["setMilitaryBaseViaApi", "MILITARY_BASE"],
  ["addCultureViaApi", "CULTURE_LIFECYCLE"],
  ["deleteCultureViaApi", "CULTURE_LIFECYCLE"],
  ["setCultureParentViaApi", "CULTURE_LIFECYCLE"],
  ["addReligionViaApi", "RELIGION_LIFECYCLE"],
  ["deleteReligionViaApi", "RELIGION_LIFECYCLE"],
  ["setReligionParentViaApi", "RELIGION_LIFECYCLE"],
  ["importNamebaseDocumentViaApi", "COLLECTION_IMPORT"],
  ["importNotesViaApi", "COLLECTION_IMPORT"],
  ["importMeasurementsViaApi", "COLLECTION_IMPORT"],
  ["importMilitaryBattleEventsViaApi", "COLLECTION_IMPORT"]
]) {
  const body = functionSource(appSource, functionName);
  assert.match(body, new RegExp(`assertRemainingRuleExecution\\(\\s*state,\\s*REMAINING_RULE_ACTION\\.${actionId}`, "u"), `${functionName} 没有消费对应预检`);
}
for (const functionName of ["assignSocialCellsViaApi", "applySocialExpansionViaApi"]) {
  const body = functionSource(appSource, functionName);
  assert.ok(body.includes("REMAINING_RULE_ACTION.CULTURE_LIFECYCLE"), `${functionName} 缺少文化预检`);
  assert.ok(body.includes("REMAINING_RULE_ACTION.RELIGION_LIFECYCLE"), `${functionName} 缺少宗教预检`);
  assert.ok(body.includes("assertRemainingRuleExecution(state, actionId"), `${functionName} 没有消费领域预检`);
}

console.log(JSON.stringify({
  passed: true,
  actionFamilies: REMAINING_RULE_ACTIONS.length,
  collectionVariants: 4,
  publicInspectors: Object.keys(inspectorCodes).length,
  describedExecutors: executorMethods.length,
  readonly: true,
  arbitraryExecutor: false
}, null, 2));

function createFixture() {
  const states = [
    {i: 0, id: 0, name: "中立"},
    {
      i: 1,
      id: 1,
      name: "甲国",
      capital: 1,
      diplomacy: ["x", "x", "Neutral"],
      militaryPolicy: {unitRatios: {infantry: 0.46, archers: 0.22, cavalry: 0.16, artillery: 0.06, fleet: 0.1}},
      military: [{
        i: 1,
        id: "1:1",
        name: "甲军",
        cell: 1,
        x: 10,
        y: 10,
        bx: 0,
        by: 0,
        baseCell: 0,
        bcell: 0,
        status: "resting",
        events: []
      }]
    },
    {i: 2, id: 2, name: "乙国", capital: 3, diplomacy: ["x", "Neutral", "x"], military: []}
  ];
  const cultures = [
    {i: 0, id: 0, name: "无文化", parent: 0},
    {i: 1, id: 1, name: "甲文化", parent: 0, center: 1, expansionism: 1, type: "Generic"},
    {i: 2, id: 2, name: "乙文化", parent: 0, center: 2, expansionism: 1, type: "Generic"}
  ];
  const religions = [
    {i: 0, id: 0, name: "无宗教", parent: 0},
    {i: 1, id: 1, name: "甲宗教", parent: 0, center: 1, expansionism: 1, type: "Folk", form: "Animism"},
    {i: 2, id: 2, name: "乙宗教", parent: 0, center: 2, expansionism: 1, type: "Organized", form: "Monotheism"}
  ];
  return {
    metadata: {seed: "remaining-rule-inspectors"},
    options: {seed: "remaining-rule-inspectors"},
    grid: {
      cells: {
        i: [0, 1, 2],
        state: [0, 1, 2],
        province: [0, 1, 2],
        culture: [0, 1, 1],
        religion: [0, 1, 2],
        h: [10, 30, 35]
      }
    },
    pack: {
      cells: {
        i: [0, 1, 2, 3],
        p: [[0, 0], [10, 10], [20, 20], [30, 20]],
        g: [0, 1, 2, 1],
        state: [0, 1, 2, 1],
        province: [0, 1, 2, 1],
        culture: [0, 1, 1, 1],
        religion: [0, 1, 2, 1],
        h: [10, 30, 35, 30]
      },
      states,
      burgs: [
        {i: 0, id: 0},
        {i: 1, id: 1, cityId: 1, name: "甲京", cell: 1, state: 1, province: 1},
        {i: 2, id: 2, cityId: 2, name: "甲城", cell: 1, state: 1, province: 2},
        {i: 3, id: 3, cityId: 3, name: "乙京", cell: 2, state: 2, province: 2}
      ],
      cultures,
      religions,
      military: {events: [], metadata: {eventSequence: 0}}
    },
    politics: {
      states,
      provinces: [
        {i: 0, id: 0, name: "中立"},
        {i: 1, id: 1, name: "甲省", state: 1},
        {i: 2, id: 2, name: "乙省", state: 2}
      ]
    },
    settlements: {
      cities: [
        null,
        {id: 1, burgId: 1, name: "甲京", cell: 1, packCell: 1, state: 1, province: 1},
        {id: 2, burgId: 2, name: "甲城", cell: 1, packCell: 1, state: 1, province: 2},
        {id: 3, burgId: 3, name: "乙京", cell: 2, packCell: 2, state: 2, province: 2}
      ],
      routes: []
    },
    society: {cultures, religions},
    climate: {},
    military: {events: [], metadata: {eventSequence: 0}},
    notes: {notes: [], metadata: {notes: 0}},
    measurements: {items: [], metadata: {}},
    namebases: {bases: [], bindings: {global: {}, cultures: {}}, metadata: {}},
    zones: {zones: []}
  };
}

function functionSource(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `找不到 ${name}`);
  const next = sourceText.indexOf("\nfunction ", start + 1);
  return sourceText.slice(start, next < 0 ? sourceText.length : next);
}
