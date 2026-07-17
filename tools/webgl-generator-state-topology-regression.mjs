#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createRecordMilitaryBattleEventCommand} from "../app/webgl-generator/src/runtime/military-edit-commands.js";
import {
  createCompressedMapDocumentBlob,
  createMapDocument,
  parseMapDocument,
  parseMapDocumentPayload,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  createMergeStatesCommand,
  createSplitStateCommand,
  inspectStateMerge,
  inspectStateSplit
} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const baseOptions = {seed: "state-topology-regression", cellsTarget: 3000, heightmapTemplate: "continents"};
const report = {ok: true, merge: {}, split: {}, compatibility: {}, performance: {}};

await testMergeTransaction();
await testSplitTransaction();
testSplitBattleEventOwnerMapping();
testCapitalRankingTiebreaks();
testSplitMilitaryPreflightPaths();
testFaultRollback();
testDanglingMilitaryRollback();
testBattleEventIntegrityRollback();
testSplitBattleEventOwnerRollback();
testIndependentMirrors();
testOptionalDomainCompatibility();
testLegacyTombstones();
await testGeneratedPerformance();

console.log(JSON.stringify(report, null, 2));

async function testMergeTransaction() {
  const map = generatePlaceholderMap(baseOptions);
  assert.equal(map.politics.states, map.pack.states, "基准图必须覆盖共享国家镜像");
  assert.equal(map.politics.provinces, map.pack.provinces, "基准图必须覆盖共享省份镜像");
  const inspectionInput = findMergeInspection(map);
  const beforeInspect = topologyDigest(map);
  const inspected = inspectStateMerge(map, inspectionInput);
  assert.equal(inspected.valid, true);
  assert.deepEqual(topologyDigest(map), beforeInspect, "合并预检必须只读");

  const survivorCapital = map.politics.states[inspected.survivorStateId].capital;
  const oldProvinceIds = [...inspected.affectedOldProvinceIds];
  const farStateSnapshots = snapshotFarStates(map, [...inspected.resultStateIds, inspected.victimStateId, ...(inspected.boundaryStateIds || [])]);
  const survivor = map.politics.states[inspected.survivorStateId];
  const victim = map.politics.states[inspected.victimStateId];
  const third = map.politics.states.find(state => state?.i && !state.removed && ![inspected.survivorStateId, inspected.victimStateId].includes(state.i));
  const affectedTroopsBefore = regimentTroops(survivor.military) + regimentTroops(victim.military);
  survivor.diplomacy[third.i] = "Friendly";
  third.diplomacy[survivor.i] = "Friendly";
  victim.diplomacy[third.i] = "Enemy";
  third.diplomacy[victim.i] = "Enemy";
  const war = {name: "拓扑回归战争", attacker: victim.i, defender: third.i, start: 998};
  victim.campaigns = [...(victim.campaigns || []), clone(war)];
  third.campaigns = [...(third.campaigns || []), clone(war)];
  const victimRegiment = victim.military?.[0];
  let realBattleEventId = null;
  if (victimRegiment) {
    const battleCommand = createRecordMilitaryBattleEventCommand(
      {id: victimRegiment.id},
      {
        type: "raid",
        outcome: "draw",
        description: "国家合并真实战报回归",
        chainKey: `regiment:${victimRegiment.id}:front`,
        chainLabel: "国家合并真实战报链",
        chainSide: "attacker",
        attackerStateId: victim.i,
        defenderStateId: third.i,
        opponentStateId: third.i
      }
    );
    battleCommand.apply({map});
    realBattleEventId = victimRegiment.events.at(-1)?.id || null;
    victimRegiment.events = [...(victimRegiment.events || []), {stateId: victim.i, regimentId: victimRegiment.i, targetId: victimRegiment.id}];
    victimRegiment.opponent = {opponentStateId: victim.i, opponentRegimentId: victimRegiment.i, opponentRegimentObjectId: victimRegiment.id};
    victimRegiment.chain = [{attackerStateId: victim.i, attackerRegimentId: victimRegiment.i, attackerRegimentObjectId: victimRegiment.id}];
    if (!Array.isArray(map.military.events)) map.military.events = [];
    map.military.events.push({id: "topology-event", stateId: victim.i, regimentId: victimRegiment.i, targetId: victimRegiment.id});
    map.military.metadata.events = map.military.events.length;
  }
  map.notes ??= {notes: [], metadata: {notes: 0, formatVersion: 1}};
  map.notes.notes.push({id: `state:${victim.i}`, kind: "state", objectId: victim.i, body: "被合并国家原备注", format: "plain"});
  const victimNoteBefore = clone(map.notes.notes.at(-1));
  const before = topologyDigest(map);
  const untouched = findUntouchedProvinceRef(map, inspected);
  const routeGeometry = routeGeometryDigest(map);
  const marketIdentity = marketIdentityDigest(map);
  const command = createMergeStatesCommand(inspectionInput);
  const history = new EditHistory();
  history.execute(command, {map});
  const result = command.getResult();

  assert.equal(history.getStats().undo, 1, "一次合并只能写一条历史");
  assert.equal(history.getStats().redo, 0);
  assert.equal(map.politics.states[inspected.survivorStateId].capital, survivorCapital, "合并必须保留保留方首都");
  assert.equal(map.politics.states[inspected.victimStateId].removed, true, "被合并国家必须墓碑化");
  assert.ok(oldProvinceIds.every(id => map.politics.provinces[id]?.removed), "受影响旧省份必须全部墓碑化");
  assert.ok(result.provinceIds.every(id => id > Math.max(...oldProvinceIds)), "新省份编号必须全局追加");
  assert.equal(result.validation.valid, true);
  assertFarStatesUnchanged(map, farStateSnapshots);
  assert.equal(regimentTroops(map.politics.states[inspected.survivorStateId].military), affectedTroopsBefore, "被合并国家军团必须完整转入保留方");
  assert.equal(map.politics.states[third.i].diplomacy[inspected.survivorStateId], "Friendly", "保留方与第三国的外交关系必须胜出");
  assert.equal(map.politics.states[third.i].diplomacy[inspected.victimStateId], "x", "第三国对墓碑国家的关系槽必须清空但不能 splice");
  assert.ok(map.politics.states[third.i].campaigns.some(campaign => campaign.name === war.name && campaign.ended), "涉及被合并国家的活动战争必须关闭");
  if (victimRegiment) {
    const event = map.military.events.find(item => item.id === "topology-event");
    assert.equal(event.stateId, inspected.survivorStateId, "军团事件国家引用必须随合并改写");
    assert.ok(map.politics.states[event.stateId].military.some(regiment => regiment.i === event.regimentId && regiment.id === event.targetId), "军团事件对象链必须指向重编号后的军团");
    const moved = map.politics.states[event.stateId].military[event.regimentId];
    assert.equal(moved.events.find(item => item.targetId)?.targetId, moved.id, "军团内事件必须在完整映射建立后重写");
    assert.equal(moved.opponent.opponentRegimentObjectId, moved.id, "军团内对手引用必须重写");
    assert.equal(moved.chain[0].attackerRegimentObjectId, moved.id, "军团内链式引用必须重写");
    const remappedBattleEventId = realBattleEventId.replace(victimRegiment.id, moved.id);
    const regimentBattleEvent = moved.events.find(item => item.id === remappedBattleEventId);
    const globalBattleEvent = map.military.events.find(item => item.id === remappedBattleEventId);
    for (const battleEvent of [regimentBattleEvent, globalBattleEvent]) {
      assert.ok(battleEvent, "真实战报必须在军团内与全局根同步改写事件 ID");
      assert.equal(battleEvent.chainKey, `regiment:${moved.id}:front`, "真实战报 chainKey 必须改写完整旧军团对象 ID");
      assert.equal(battleEvent.stateId, inspected.survivorStateId);
      assert.equal(battleEvent.attackerStateId, inspected.survivorStateId, "真实战报进攻方国家不得保留墓碑国家 ID");
      assert.equal(battleEvent.defenderStateId, third.i);
      assert.equal(battleEvent.regimentObjectId, moved.id);
    }
  }
  assert.deepEqual(map.notes.notes.find(note => note.id === victimNoteBefore.id), victimNoteBefore, "被合并国家备注必须原样留作墓碑备注");
  assert.deepEqual(routeGeometryDigest(map), routeGeometry, "合并不能改路线端点或几何");
  assert.deepEqual(marketIdentityDigest(map), marketIdentity, "合并不能改市场 ID、中心或交易集合");
  if (untouched) assert.equal(map.politics.provinces[untouched.id], untouched.ref, "不相邻且不受影响的省份引用必须保持不变");
  assertStateTopologyConsistency(map, result.stateIds, result.provinceIds);
  assertMarketOwners(map);
  assertRouteMirrors(map);
  assertRegimentChains(map, result.stateIds);
  assert.ok((map.diplomacy?.chronicle || []).some(entry => String(entry?.[0]).includes("国家合并")), "外交纪事必须记录合并");

  const appliedDigest = topologyDigest(map);
  history.undo({map});
  assert.deepEqual(topologyDigest(map), before, "合并撤销必须完整恢复写集");
  history.redo({map});
  assert.deepEqual(topologyDigest(map), appliedDigest, "合并重做必须复用首次冻结计划");
  assert.deepEqual(command.getResult().provinceIds, result.provinceIds, "重做不能重新分配省份编号");

  const jsonDocument = createMapDocument(map, map.options);
  const parsed = parseMapDocument(stringifyMapDocument(jsonDocument));
  assert.equal(parsed.map.politics.states[inspected.victimStateId].removed, true, "JSON 往返必须保留国家墓碑");
  assert.deepEqual(parsed.map.politics.provinces.filter(Boolean).map(item => item.i), jsonDocument.map.politics.provinces.filter(Boolean).map(item => item.i));
  const compressed = await createCompressedMapDocumentBlob({defaultView: globalThis}, jsonDocument);
  const gzipParsed = await parseMapDocumentPayload({defaultView: globalThis}, compressed.blob);
  assert.equal(gzipParsed.map.politics.states[inspected.victimStateId].removed, true, "gzip 往返必须保留国家墓碑");
  const legacyDocument = clone(jsonDocument);
  legacyDocument.version = 1;
  delete legacyDocument.metadata.mapSchemaVersion;
  delete legacyDocument.map.metadata.schemaVersion;
  legacyDocument.map.notes = {notes: clone(legacyDocument.map.notes.notes)};
  delete legacyDocument.map.measurements;
  legacyDocument.map.labels = {
    custom: clone(legacyDocument.map.labels.custom || []),
    hidden: {
      state: clone(legacyDocument.map.labels.hidden.state || []),
      city: clone(legacyDocument.map.labels.hidden.city || [])
    }
  };
  delete legacyDocument.map.visualTheme;
  const migratedLegacy = parseMapDocument(JSON.stringify(legacyDocument));
  assert.equal(migratedLegacy.map.politics.states[inspected.victimStateId].removed, true, "v1 旧文档迁移往返必须保留拓扑结果");

  report.merge = {
    survivorStateId: inspected.survivorStateId,
    victimStateId: inspected.victimStateId,
    oldProvinces: oldProvinceIds.length,
    newProvinces: result.provinceIds.length,
    history: history.getStats(),
    compressedBytes: compressed.compressedBytes
  };
}

async function testSplitTransaction() {
  const map = generatePlaceholderMap(baseOptions);
  const splitInput = findSplitInspection(map, {preferCapitalProvince: true});
  const beforeInspect = topologyDigest(map);
  const inspected = inspectStateSplit(map, splitInput);
  assert.equal(inspected.valid, true);
  assert.deepEqual(topologyDigest(map), beforeInspect, "拆分预检必须只读");
  const before = topologyDigest(map);
  const oldMaxStateId = maxObjectId(map.politics.states);
  const oldMaxProvinceId = maxObjectId(map.politics.provinces);
  const sourceTroopsBefore = regimentTroops(map.politics.states[inspected.sourceStateId].military);
  const farStateSnapshots = snapshotFarStates(map, [...inspected.resultStateIds, ...(inspected.boundaryStateIds || [])]);
  const sourceCapitalMoved = inspected.selectedCityIds.includes(inspected.oldSourceCapitalCityId);
  const expectedReplacement = sourceCapitalMoved ? chooseExpectedReplacement(map, inspected.sourceStateId, new Set(inspected.selectedCityIds)) : inspected.oldSourceCapitalCityId;
  const routeGeometry = routeGeometryDigest(map);
  const marketIdentity = marketIdentityDigest(map);
  const history = new EditHistory();
  const command = createSplitStateCommand(splitInput);
  history.execute(command, {map});
  const result = command.getResult();

  assert.equal(history.getStats().undo, 1, "一次拆分只能写一条历史");
  assert.equal(inspected.newStateId, oldMaxStateId + 1, "新国家编号必须全局追加");
  assert.ok(result.provinceIds.every(id => id > oldMaxProvinceId), "拆分生成的省份编号必须全局追加");
  assert.equal(map.politics.states[inspected.newStateId].capital, findCity(map, inspected.newCapitalCityId).burgId, "新国家必须采用显式首都");
  if (sourceCapitalMoved) {
    assert.equal(stateCapitalCityId(map, inspected.sourceStateId), expectedReplacement, "旧首都划入新国家后必须按冻结排序自动补位");
    assert.equal(inspected.sourceCapitalCityId, expectedReplacement, "预检必须冻结自动补都结果");
    assert.equal(inspected.sourceCapitalRanking[0].cityId, expectedReplacement, "预检排名证据首项必须等于冻结首都");
  }
  assert.equal(result.validation.valid, true);
  assertFarStatesUnchanged(map, farStateSnapshots);
  assert.equal(result.stateIds.reduce((sum, stateId) => sum + regimentTroops(map.politics.states[stateId].military), 0), sourceTroopsBefore, "拆分必须按驻地转移军团且保持总兵力");
  assert.deepEqual(routeGeometryDigest(map), routeGeometry, "拆分不能改路线端点或几何");
  assert.deepEqual(marketIdentityDigest(map), marketIdentity, "拆分不能改市场 ID、中心或交易集合");
  assertStateTopologyConsistency(map, result.stateIds, result.provinceIds);
  assertMarketOwners(map);
  assertRouteMirrors(map);
  assertRegimentChains(map, result.stateIds);
  assert.ok((map.politics.states[inspected.newStateId].diplomacy || []).every((relation, id) => id === 0 || id === inspected.newStateId || !map.politics.states[id] || map.politics.states[id].removed || relation === "Neutral"), "新国家对有效第三国必须全部中立");
  assert.equal((map.politics.states[inspected.newStateId].campaigns || []).length, 0, "新国家不能继承战争");

  const appliedDigest = topologyDigest(map);
  history.undo({map});
  assert.deepEqual(topologyDigest(map), before, "拆分撤销必须完整恢复写集");
  history.redo({map});
  assert.deepEqual(topologyDigest(map), appliedDigest, "拆分重做必须复用首次冻结计划");
  assert.deepEqual(command.getResult().provinceIds, result.provinceIds);

  const json = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options)));
  assert.equal(json.map.politics.states[inspected.newStateId].name, inspected.newStateName, "拆分 JSON 往返必须保留确定性新国家档案");
  report.split = {
    sourceStateId: inspected.sourceStateId,
    newStateId: inspected.newStateId,
    selectedProvinceIds: inspected.selectedProvinceIds,
    sourceCapitalMoved,
    replacementCapitalCityId: expectedReplacement,
    newProvinces: result.provinceIds.length,
    history: history.getStats()
  };
}

function testSplitBattleEventOwnerMapping() {
  const map = generatePlaceholderMap(baseOptions);
  const input = findSplitInspection(map, {preferCapitalProvince: true});
  const baseline = inspectStateSplit(map, input);
  const source = map.politics.states[baseline.sourceStateId];
  const regiments = source?.military?.slice(0, 2) || [];
  const opponent = map.politics.states.find(state => state?.i && !state.removed && state.i !== baseline.sourceStateId);
  assert.equal(regiments.length, 2, "拆分真实战报样本必须具备两个军团");
  assert.ok(opponent, "拆分真实战报样本必须具备真实对手国");
  const cases = [
    {side: "attacker", ownerKey: "attackerStateId", otherKey: "defenderStateId"},
    {side: "defender", ownerKey: "defenderStateId", otherKey: "attackerStateId"}
  ];
  const originals = [];
  cases.forEach((item, index) => {
    const regiment = regiments[index];
    const cell = baseline.packCells[index] ?? baseline.packCells[0];
    regiment.cell = cell;
    regiment.baseCell = cell;
    regiment.bcell = cell;
    const description = `国家拆分真实战报 ${item.side}`;
    createRecordMilitaryBattleEventCommand(
      {id: regiment.id},
      {
        type: "raid",
        outcome: "draw",
        description,
        chainKey: `regiment:${regiment.id}:${item.side}`,
        chainLabel: `国家拆分真实战报 ${item.side}`,
        chainSide: item.side,
        attackerStateId: item.side === "attacker" ? source.i : opponent.i,
        defenderStateId: item.side === "defender" ? source.i : opponent.i,
        opponentStateId: opponent.i
      }
    ).apply({map});
    originals.push(clone(regiment.events.find(event => event.description === description)));
  });
  const inspected = inspectStateSplit(map, input);
  assert.equal(inspected.valid, true);
  assert.ok(inspected.militaryAssignments.filter(item => regiments.some(regiment => regiment.i === item.oldRegimentId)).every(item => item.ownerStateId === inspected.newStateId));
  const command = createSplitStateCommand(input);
  command.apply({map});
  for (let index = 0; index < cases.length; index++) {
    const item = cases[index];
    const original = originals[index];
    const globalEvent = map.military.events.find(event => event.description === original.description);
    const movedRegiment = map.politics.states[inspected.newStateId].military.find(regiment => regiment.events?.some(event => event.description === original.description));
    const regimentEvent = movedRegiment?.events.find(event => event.description === original.description);
    assert.ok(globalEvent && regimentEvent && movedRegiment, `拆分 ${item.side} 真实战报必须保留军团内与全局两个落点`);
    assert.deepEqual(regimentEvent, globalEvent, `拆分 ${item.side} 真实战报两个落点必须所有字段一致`);
    assert.equal(globalEvent.stateId, inspected.newStateId);
    assert.equal(globalEvent.regimentId, movedRegiment.i);
    assert.equal(globalEvent.regimentObjectId, movedRegiment.id);
    assert.equal(globalEvent.id, `${movedRegiment.id}:battle:${original.sequence}`);
    assert.equal(globalEvent.chainKey, `regiment:${movedRegiment.id}:${item.side}`);
    assert.equal(globalEvent[item.ownerKey], inspected.newStateId, `拆分 ${item.side} 战报的 chainSide owner 必须同步为新国家`);
    assert.equal(globalEvent[item.otherKey], opponent.i, `拆分 ${item.side} 战报的真实对手方必须保持`);
    assert.equal(globalEvent.opponentStateId, opponent.i, `拆分 ${item.side} 战报不得把真实对手套用来源国映射`);
  }
  report.split.battleEventOwnerMapping = cases.map(item => item.side);
}

function testCapitalRankingTiebreaks() {
  const cases = ["provincial", "population", "suitability", "port", "burgId", "cityId"];
  const winners = {};
  for (const criterion of cases) {
    const map = generatePlaceholderMap(baseOptions);
    const input = findSplitInspection(map, {preferCapitalProvince: true});
    const baseline = inspectStateSplit(map, input);
    assert.equal(baseline.valid, true);
    assert.ok(baseline.remainderCityIds.length >= 2, `补都 ${criterion} 样本至少需要两个候选`);
    if (!map.pack.cells.s) map.pack.cells.s = new Float64Array(map.pack.cells.i.length);
    const candidates = baseline.remainderCityIds.map(id => findCity(map, id));
    for (const city of candidates) {
      city.provincial = false;
      city.population = -100;
      city.port = 0;
      city.burgId = 900000 + city.id;
      map.pack.cells.s[city.packCell] = -100;
    }
    const [left, right] = candidates;
    left.provincial = false;
    right.provincial = false;
    left.population = right.population = 10;
    left.port = right.port = 0;
    left.burgId = 20;
    right.burgId = 21;
    map.pack.cells.s[left.packCell] = map.pack.cells.s[right.packCell] = 10;
    let expected = left.id;
    if (criterion === "provincial") {
      left.provincial = true;
      right.population = 100;
      map.pack.cells.s[right.packCell] = 100;
      right.port = 1;
      right.burgId = 1;
    } else if (criterion === "population") {
      left.population = 11;
      map.pack.cells.s[right.packCell] = 100;
      right.port = 1;
      right.burgId = 1;
    } else if (criterion === "suitability") {
      map.pack.cells.s[left.packCell] = 11;
      right.port = 1;
      right.burgId = 1;
    } else if (criterion === "port") {
      left.port = 1;
      left.burgId = 30;
      right.burgId = 1;
    } else if (criterion === "burgId") {
      left.burgId = 1;
      right.burgId = 2;
      expected = left.id;
    } else {
      left.burgId = right.burgId = 1;
      expected = Math.min(left.id, right.id);
    }
    const inspected = inspectStateSplit(map, input);
    assert.equal(inspected.valid, true, `补都 ${criterion} 预检必须有效`);
    assert.equal(inspected.sourceCapitalRanking[0].cityId, expected, `补都排名必须按 ${criterion} 决胜`);
    assert.equal(inspected.sourceCapitalCityId, expected, `冻结补都必须采用 ${criterion} 胜者`);
    winners[criterion] = expected;
  }
  report.split.capitalRankingTiebreaks = winners;
}

function testSplitMilitaryPreflightPaths() {
  const map = generatePlaceholderMap(baseOptions);
  const input = findSplitInspection(map, {preferCapitalProvince: true});
  const baseline = inspectStateSplit(map, input);
  const regiment = map.politics.states[baseline.sourceStateId].military?.[0];
  assert.ok(regiment, "拆分军团归属样本必须有军团");
  regiment.cell = baseline.packCells[0];
  regiment.baseCell = baseline.sourcePackCells[0];
  regiment.bcell = regiment.baseCell;
  let inspected = inspectStateSplit(map, input);
  let assignment = inspected.militaryAssignments.find(item => item.oldRegimentId === regiment.i);
  assert.equal(assignment.reason, "current", "有效 current cell 必须优先于 base");
  assert.equal(assignment.ownerStateId, baseline.newStateId);

  regiment.cell = -1;
  regiment.baseCell = baseline.sourcePackCells[0];
  regiment.bcell = regiment.baseCell;
  inspected = inspectStateSplit(map, input);
  assignment = inspected.militaryAssignments.find(item => item.oldRegimentId === regiment.i);
  assert.equal(assignment.reason, "base", "current 无效时必须使用 base");
  assert.equal(assignment.ownerStateId, baseline.sourceStateId);

  regiment.cell = -1;
  regiment.baseCell = -1;
  regiment.bcell = -1;
  inspected = inspectStateSplit(map, input);
  assert.equal(inspected.valid, false, "current/base 都无效时必须在预检拒绝");
  assert.equal(inspected.code, "military-owner-unresolved");
  assert.ok(inspected.unresolvedMilitary.some(item => item.oldRegimentId === regiment.i));
  report.split.militaryPreflight = ["current", "base", "rejected"];
}

function testFaultRollback() {
  const stages = ["after-topology", "capital", "after-reprovince", "diplomacy", "military", "market", "route", "after-domains", "before-validate"];
  for (const stage of stages) {
    const map = generatePlaceholderMap(baseOptions);
    const input = findMergeInspection(map);
    const before = topologyDigest(map);
    const untouchedStateRefs = map.politics.states.slice();
    const history = new EditHistory();
    const command = createMergeStatesCommand({...input, faultInjector(currentStage) {
      if (currentStage === stage) throw new Error(`领域故障注入：${stage}`);
    }});
    assert.throws(() => history.execute(command, {map}), new RegExp(stage, "u"));
    assert.deepEqual(topologyDigest(map), before, `故障注入 ${stage} 必须事务内回滚`);
    assert.equal(history.getStats().undo, 0, `故障注入 ${stage} 不能写历史`);
    assert.ok(untouchedStateRefs.every((state, index) => map.politics.states[index] === state), `故障注入 ${stage} 后国家对象引用必须原样恢复`);
  }
  report.compatibility.faultStages = stages.length;
}

function testDanglingMilitaryRollback() {
  const map = generatePlaceholderMap(baseOptions);
  const input = findMergeInspection(map);
  const before = topologyDigest(map);
  const stateRefs = map.politics.states.slice();
  const history = new EditHistory();
  const command = createMergeStatesCommand({...input, faultInjector(stage, {map: currentMap, plan}) {
    if (stage !== "military") return;
    currentMap.politics.states[plan.survivorStateId].military[0].events = [{stateId: 999, regimentId: 999, targetId: "999:999"}];
  }});
  assert.throws(() => history.execute(command, {map}), /军团引用悬空/u, "最终校验必须拦截军团内悬空引用");
  assert.deepEqual(topologyDigest(map), before, "悬空军团引用校验失败必须完整回滚");
  assert.ok(stateRefs.every((state, index) => map.politics.states[index] === state), "悬空引用回滚必须恢复全部国家对象引用");
  assert.equal(history.getStats().undo, 0);
  report.compatibility.danglingMilitaryRejected = true;
}

function testBattleEventIntegrityRollback() {
  const map = generatePlaceholderMap(baseOptions);
  const input = findMergeInspection(map);
  const inspected = inspectStateMerge(map, input);
  const victim = map.politics.states[inspected.victimStateId];
  const victimRegiment = victim?.military?.[0];
  const third = map.politics.states.find(state => state?.i && !state.removed && ![inspected.survivorStateId, inspected.victimStateId].includes(state.i));
  assert.ok(victimRegiment && third, "真实战报回滚样本必须具备军团与第三国");
  const description = "国家合并真实战报故障回滚";
  createRecordMilitaryBattleEventCommand(
    {id: victimRegiment.id},
    {
      type: "raid",
      outcome: "draw",
      description,
      chainKey: `regiment:${victimRegiment.id}:rollback`,
      chainLabel: "国家合并真实战报故障链",
      chainSide: "attacker",
      attackerStateId: victim.i,
      defenderStateId: third.i,
      opponentStateId: third.i
    }
  ).apply({map});
  const originalEvent = clone(victimRegiment.events.find(event => event.description === description));
  const before = topologyDigest(map);
  const stateRefs = map.politics.states.slice();
  const history = new EditHistory();
  const command = createMergeStatesCommand({...input, faultInjector(stage, {map: currentMap, plan}) {
    if (stage !== "military") return;
    const globalEvent = currentMap.military.events.find(event => event.description === description);
    const regimentEvent = currentMap.politics.states[plan.survivorStateId].military
      .flatMap(regiment => regiment.events || [])
      .find(event => event.description === description);
    for (const event of [globalEvent, regimentEvent]) {
      event.id = originalEvent.id;
      event.chainKey = originalEvent.chainKey;
      event.attackerStateId = plan.victimStateId;
    }
  }});
  assert.throws(() => history.execute(command, {map}), /军团活动链无效/u, "最终校验必须拒绝真实战报中的墓碑国家与旧军团 owner ID");
  assert.deepEqual(topologyDigest(map), before, "真实战报活动链校验失败必须完整回滚");
  assert.ok(stateRefs.every((state, index) => map.politics.states[index] === state), "真实战报回滚必须恢复全部国家对象引用");
  assert.equal(history.getStats().undo, 0);
  report.compatibility.battleEventIntegrityRejected = true;
}

function testSplitBattleEventOwnerRollback() {
  const map = generatePlaceholderMap(baseOptions);
  const input = findSplitInspection(map, {preferCapitalProvince: true});
  const baseline = inspectStateSplit(map, input);
  const source = map.politics.states[baseline.sourceStateId];
  const regiments = source?.military?.slice(0, 2) || [];
  const opponent = map.politics.states.find(state => state?.i && !state.removed && state.i !== baseline.sourceStateId);
  assert.equal(regiments.length, 2, "拆分战报 owner 回滚样本必须具备两个军团");
  assert.ok(opponent, "拆分战报 owner 回滚样本必须具备真实对手国");
  const cases = [
    {side: "attacker", ownerKey: "attackerStateId"},
    {side: "defender", ownerKey: "defenderStateId"}
  ];
  cases.forEach((item, index) => {
    const regiment = regiments[index];
    const cell = baseline.packCells[index] ?? baseline.packCells[0];
    regiment.cell = cell;
    regiment.baseCell = cell;
    regiment.bcell = cell;
    createRecordMilitaryBattleEventCommand(
      {id: regiment.id},
      {
        type: "raid",
        outcome: "draw",
        description: `国家拆分真实战报 owner 回滚 ${item.side}`,
        chainKey: `regiment:${regiment.id}:owner-rollback-${item.side}`,
        chainLabel: `国家拆分真实战报 owner 回滚 ${item.side}`,
        chainSide: item.side,
        attackerStateId: item.side === "attacker" ? source.i : opponent.i,
        defenderStateId: item.side === "defender" ? source.i : opponent.i,
        opponentStateId: opponent.i
      }
    ).apply({map});
  });
  const before = topologyDigest(map);
  const stateRefs = map.politics.states.slice();
  const history = new EditHistory();
  const command = createSplitStateCommand({...input, faultInjector(stage, {map: currentMap, plan}) {
    if (stage !== "military") return;
    for (const item of cases) {
      const description = `国家拆分真实战报 owner 回滚 ${item.side}`;
      const globalEvent = currentMap.military.events.find(event => event.description === description);
      const regimentEvent = currentMap.politics.states[plan.newStateId].military
        .flatMap(regiment => regiment.events || [])
        .find(event => event.description === description);
      assert.ok(globalEvent && regimentEvent, `拆分 ${item.side} 故障注入前必须存在两个真实战报落点`);
      globalEvent[item.ownerKey] = plan.sourceStateId;
      regimentEvent[item.ownerKey] = plan.sourceStateId;
    }
  }});
  assert.throws(() => history.execute(command, {map}), /军团活动链无效/u, "最终校验必须拒绝已转移军团战报的 chainSide owner 与 event stateId 不一致");
  assert.deepEqual(topologyDigest(map), before, "拆分真实战报 owner 校验失败必须完整回滚");
  assert.ok(stateRefs.every((state, index) => map.politics.states[index] === state), "拆分真实战报 owner 回滚必须恢复全部国家对象引用");
  assert.equal(history.getStats().undo, 0);
  report.compatibility.splitBattleEventOwnerRejected = cases.map(item => item.side);
}

function testIndependentMirrors() {
  const map = generatePlaceholderMap(baseOptions);
  map.politics.states = map.pack.states.map(item => item ? clone(item) : item);
  map.politics.provinces = map.pack.provinces.map(item => item ? clone(item) : item);
  map.diplomacy = clone(map.pack.diplomacy);
  map.military = clone(map.pack.military);
  map.economy.markets = map.pack.markets.map(item => item ? clone(item) : item);
  assert.notEqual(map.politics.states, map.pack.states);
  assert.notEqual(map.politics.states[1], map.pack.states[1]);
  const input = findMergeInspection(map);
  const command = createMergeStatesCommand(input);
  command.apply({map});
  const result = command.getResult();
  for (const id of [...result.stateIds, result.removedStateId]) {
    assert.deepEqual(map.politics.states[id], map.pack.states[id], `独立国家镜像 #${id} 必须等值同步`);
    assert.notEqual(map.politics.states[id], map.pack.states[id], `独立国家镜像 #${id} 不应被强制共享引用`);
  }
  for (const id of [...result.tombstonedProvinceIds, ...result.provinceIds]) {
    assert.deepEqual(map.politics.provinces[id], map.pack.provinces[id], `独立省份镜像 #${id} 必须等值同步`);
  }
  assert.deepEqual(map.diplomacy, map.pack.diplomacy, "独立外交根镜像必须等值同步");
  assert.notEqual(map.diplomacy, map.pack.diplomacy);
  assert.deepEqual(map.military, map.pack.military, "独立军事根镜像必须等值同步");
  assert.notEqual(map.military, map.pack.military);
  assert.deepEqual(map.economy.markets, map.pack.markets, "独立市场镜像必须等值同步");
  report.compatibility.independentMirrors = true;
}

function testOptionalDomainCompatibility() {
  const map = generatePlaceholderMap(baseOptions);
  delete map.diplomacy;
  delete map.military;
  delete map.economy;
  delete map.notes;
  delete map.pack.diplomacy;
  delete map.pack.military;
  delete map.pack.markets;
  for (const state of map.politics.states || []) {
    if (!state) continue;
    delete state.diplomacy;
    delete state.campaigns;
    delete state.military;
  }
  const input = findMergeInspection(map);
  const command = createMergeStatesCommand(input);
  assert.doesNotThrow(() => command.apply({map}), "缺少可选旧域的旧图仍必须可执行拓扑事务");
  assert.equal(command.getResult().validation.valid, true);
  report.compatibility.missingOptionalDomains = true;
}

function testLegacyTombstones() {
  const map = generatePlaceholderMap(baseOptions);
  const stateTombstoneId = maxObjectId(map.politics.states) + 5;
  const provinceTombstoneId = maxObjectId(map.politics.provinces) + 7;
  const stateTombstone = {i: stateTombstoneId, id: stateTombstoneId, name: "旧国墓碑", removed: true, coa: {shield: "legacy"}, userData: {kept: true}, diplomacy: []};
  const provinceTombstone = {i: provinceTombstoneId, id: provinceTombstoneId, state: stateTombstoneId, name: "旧省墓碑", removed: true, coa: {shield: "legacy"}, notes: ["保留"], userData: {kept: true}};
  map.politics.states[stateTombstoneId] = stateTombstone;
  map.politics.provinces[provinceTombstoneId] = provinceTombstone;
  map.notes ??= {notes: [], metadata: {notes: 0, formatVersion: 1}};
  map.notes.notes.push({id: `state:${stateTombstoneId}`, kind: "state", objectId: stateTombstoneId, body: "旧墓碑备注"});
  const stateValue = clone(stateTombstone);
  const provinceValue = clone(provinceTombstone);
  const noteValue = clone(map.notes.notes.at(-1));
  const input = findSplitInspection(map, {preferCapitalProvince: true});
  const inspected = inspectStateSplit(map, input);
  assert.ok(inspected.newStateId > stateTombstoneId, "新国家 ID 不能复用旧 tombstone 或空洞");
  assert.ok(inspected.newProvinceIds.every(id => id > provinceTombstoneId), "新省份 ID 不能复用旧 tombstone 或空洞");
  const command = createSplitStateCommand(input);
  command.apply({map});
  assert.equal(map.politics.states[stateTombstoneId], stateTombstone, "旧国家 tombstone 引用必须保持");
  assert.equal(map.politics.provinces[provinceTombstoneId], provinceTombstone, "旧省份 tombstone 引用必须保持");
  assert.deepEqual(stateTombstone, stateValue);
  assert.deepEqual(provinceTombstone, provinceValue);
  assert.deepEqual(map.notes.notes.find(note => note.id === noteValue.id), noteValue);
  const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options)));
  assert.deepEqual(roundtrip.map.politics.states[stateTombstoneId], stateValue, "完整地图往返必须保留旧国家 tombstone");
  assert.deepEqual(roundtrip.map.politics.provinces[provinceTombstoneId], provinceValue, "完整地图往返必须保留旧省份 tombstone");
  report.compatibility.legacyTombstones = {stateTombstoneId, provinceTombstoneId};
}

async function testGeneratedPerformance() {
  const map = generatePlaceholderMap({...baseOptions, seed: "state-topology-performance", cellsTarget: 10000});
  const input = findMergeInspection(map);
  const startedAt = performance.now();
  const command = createMergeStatesCommand(input);
  command.apply({map});
  const durationMs = performance.now() - startedAt;
  assert.equal(command.getResult().validation.valid, true);
  assert.ok(durationMs < 500, `10000 cells 真实生成图事务耗时超过 500ms 回归门槛：${durationMs.toFixed(1)}ms`);
  report.performance = {cellsTarget: 10000, actualPackCells: map.pack.cells.i.length, durationMs: Math.round(durationMs * 100) / 100};
}

function findMergeInspection(map) {
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    for (const neighbor of state.neighbors || []) {
      const input = {survivorStateId: state.i, victimStateId: Number(neighbor)};
      if (inspectStateMerge(map, input).valid) return input;
    }
  }
  throw new Error("固定生成图找不到可合并的相邻国家");
}

function findSplitInspection(map, {preferCapitalProvince = false} = {}) {
  for (const state of map.politics.states || []) {
    if (!state?.i || state.removed) continue;
    const capitalCity = (map.settlements.cities || []).find(city => city?.burgId === state.capital);
    const provinces = (map.politics.provinces || []).filter(province => province && !province.removed && Number(province.state) === state.i);
    if (preferCapitalProvince) provinces.sort((a, b) => Number(b.i === capitalCity?.province) - Number(a.i === capitalCity?.province));
    for (const province of provinces) {
      const cities = (map.settlements.cities || []).filter(city => city && Number(city.state) === state.i && Number(city.province) === Number(province.i));
      for (const city of cities) {
        const input = {sourceStateId: state.i, selectedProvinceIds: [province.i], newCapitalCityId: city.id};
        if (inspectStateSplit(map, input).valid) return input;
      }
    }
  }
  throw new Error("固定生成图找不到符合完整旧省和双侧连通规则的拆分样本");
}

function findUntouchedProvinceRef(map, inspection) {
  const affectedCells = new Set(inspection.packCells);
  for (const province of map.politics.provinces || []) {
    if (!province?.i || province.removed || inspection.affectedOldProvinceIds.includes(province.i)) continue;
    const cells = map.pack.cells.i.filter(cell => Number(map.pack.cells.province[cell]) === province.i);
    const touches = cells.some(cell => (map.pack.cells.c[cell] || []).some(neighbor => affectedCells.has(neighbor)));
    if (!touches) return {id: province.i, ref: province};
  }
  return null;
}

function assertStateTopologyConsistency(map, stateIds, provinceIds) {
  for (const stateId of stateIds) {
    const cells = map.pack.cells.i.filter(cell => map.pack.cells.h[cell] >= 20 && Number(map.pack.cells.state[cell]) === stateId);
    assert.ok(cells.length, `国家 #${stateId} 必须有陆地`);
    assertConnected(map.pack.cells, cells, `国家 #${stateId}`);
    const state = map.politics.states[stateId];
    assert.equal(state.cells, cells.length);
    assert.ok(state.provinces.every(id => provinceIds.includes(id)));
  }
  for (const provinceId of provinceIds) {
    assert.ok(provinceId <= 65535);
    const province = map.politics.provinces[provinceId];
    const cells = map.pack.cells.i.filter(cell => map.pack.cells.h[cell] >= 20 && Number(map.pack.cells.province[cell]) === provinceId);
    assert.ok(cells.includes(province.center), `省份 #${provinceId} 必须包含省会`);
    assertConnected(map.pack.cells, cells, `省份 #${provinceId}`);
  }
  for (const city of map.settlements.cities || []) {
    if (!city || !stateIds.includes(Number(city.state))) continue;
    assert.equal(Number(city.province), Number(map.pack.cells.province[city.packCell]));
    const burg = map.pack.burgs[city.burgId];
    assert.equal(Number(burg.state), Number(city.state));
    assert.equal(Number(burg.province), Number(city.province));
  }
}

function assertConnected(cells, input, label) {
  const allowed = new Set(input);
  const visited = new Set(input.length ? [input[0]] : []);
  const queue = input.length ? [input[0]] : [];
  for (let index = 0; index < queue.length; index++) {
    for (const neighbor of cells.c[queue[index]] || []) {
      if (!allowed.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  assert.equal(visited.size, input.length, `${label} 必须连通`);
}

function assertMarketOwners(map) {
  for (const market of map.pack.markets || []) {
    if (!market) continue;
    assert.equal(Number(market.state), Number(map.pack.burgs[market.centerBurgId]?.state || 0));
  }
}

function assertRouteMirrors(map) {
  for (const route of map.settlements.routes || []) {
    const mirror = map.pack.routes?.[route.id];
    if (!mirror) continue;
    assert.equal(Number(mirror.state), Number(route.state));
    assert.equal(Number(mirror.province), Number(route.province));
  }
}

function assertRegimentChains(map, stateIds) {
  for (const stateId of stateIds) {
    const state = map.politics.states[stateId];
    for (let index = 0; index < (state.military || []).length; index++) {
      const regiment = state.military[index];
      assert.equal(regiment.i, index);
      assert.equal(regiment.id, `${stateId}:${index}`);
      assert.equal(regiment.state, stateId);
    }
  }
}

function chooseExpectedReplacement(map, stateId, excludedIds) {
  return (map.settlements.cities || [])
    .filter(city => city && Number(city.state) === stateId && !excludedIds.has(Number(city.id)))
    .sort((a, b) => Number(b.provincial) - Number(a.provincial)
      || Number(b.population || 0) - Number(a.population || 0)
      || suitability(map, b) - suitability(map, a)
      || Number(Boolean(b.port)) - Number(Boolean(a.port))
      || Number(a.burgId) - Number(b.burgId)
      || Number(a.id) - Number(b.id))[0]?.id ?? null;
}

function suitability(map, city) {
  return Number(map.pack.cells.s?.[city.packCell] ?? map.pack.cells.suitability?.[city.packCell] ?? 0);
}

function stateCapitalCityId(map, stateId) {
  const capital = map.politics.states[stateId]?.capital;
  return (map.settlements.cities || []).find(city => city?.burgId === capital)?.id ?? null;
}

function findCity(map, cityId) {
  return (map.settlements.cities || []).find(city => city?.id === cityId);
}

function maxObjectId(items) {
  return (items || []).reduce((max, item, index) => Math.max(max, index, Number(item?.i ?? item?.id ?? 0)), 0);
}

function regimentTroops(regiments) {
  return (regiments || []).reduce((sum, regiment) => sum + Number(regiment?.a || 0), 0);
}

function snapshotFarStates(map, excludedIds) {
  const excluded = new Set(excludedIds);
  return (map.politics.states || [])
    .filter(state => state?.i && !state.removed && !excluded.has(state.i))
    .map(state => ({id: state.i, ref: state, core: stateCoreDigest(state)}));
}

function assertFarStatesUnchanged(map, snapshots) {
  for (const snapshot of snapshots) {
    assert.equal(map.politics.states[snapshot.id], snapshot.ref, `远端国家 #${snapshot.id} 对象引用必须保持`);
    assert.deepEqual(stateCoreDigest(map.politics.states[snapshot.id]), snapshot.core, `远端国家 #${snapshot.id} 核心值必须保持`);
  }
}

function stateCoreDigest(state) {
  const value = clone(state);
  delete value.diplomacy;
  delete value.diplomacySummary;
  delete value.campaigns;
  return value;
}

function topologyDigest(map) {
  return clone({
    gridState: map.grid.cells.state,
    gridProvince: map.grid.cells.province,
    packState: map.pack.cells.state,
    packProvince: map.pack.cells.province,
    states: map.politics.states,
    packStates: map.pack.states,
    provinces: map.politics.provinces,
    packProvinces: map.pack.provinces,
    cities: map.settlements.cities,
    burgs: map.pack.burgs,
    routes: map.settlements.routes,
    packRoutes: map.pack.routes,
    markets: map.pack.markets,
    economyMarkets: map.economy?.markets,
    diplomacy: map.diplomacy,
    packDiplomacy: map.pack.diplomacy,
    military: map.military,
    packMilitary: map.pack.military,
    notes: map.notes,
    stale: map.metadata.derivedStale,
    politicsMetadata: map.politics.metadata,
    packPoliticsMetadata: map.pack.politicsMetadata,
    settlementMetadata: map.settlements.metadata
  });
}

function routeGeometryDigest(map) {
  return (map.settlements.routes || []).map(route => ({id: route.id, from: route.from, to: route.to, cells: route.cells, packCells: route.packCells, points: route.points}));
}

function marketIdentityDigest(map) {
  return {
    markets: (map.pack.markets || []).map(market => market ? {i: market.i, id: market.id, centerBurgId: market.centerBurgId, coverage: market.coverage, deals: market.deals, salesTax: market.salesTax, pollTax: market.pollTax} : market),
    deals: map.pack.deals
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
