import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {ECONOMY_WORKER_WRITE_SET, economyManifest} from "./manifest.js";
import {DIPLOMACY_WORKER_WRITE_SET, diplomacyManifest} from "../diplomacy/manifest.js";
import {MILITARY_POLICY_WORKER_WRITE_SET, MILITARY_REGENERATION_WORKER_WRITE_SET, militaryManifest} from "../military/manifest.js";
import {validateZoneMirrors} from "../settlements/worker-runtime.js";
import {isActiveEnemyPair, resolveWarzoneStatePair} from "../../generator/war-consistency.js";

type UnknownRecord = Record<string, unknown>;
export type EconomyDiplomacyMilitaryWorkerKind = "economy" | "diplomacy" | "military" | "military-policy";

type LegacyBinding = Readonly<{
  mapIdentity: string;
  mapRevision: number;
  topologyRevision: number;
  generationToken: number;
  lockFingerprint: string;
  operationId: number;
  operationName: string;
}>;

const descriptorByKind = Object.freeze({
  economy: economyManifest.workerTasks[0],
  diplomacy: diplomacyManifest.workerTasks[0],
  military: militaryManifest.workerTasks[0],
  "military-policy": militaryManifest.workerTasks[1]
});
const writeSetByKind = Object.freeze({
  economy: ECONOMY_WORKER_WRITE_SET,
  diplomacy: DIPLOMACY_WORKER_WRITE_SET,
  military: MILITARY_REGENERATION_WORKER_WRITE_SET,
  "military-policy": MILITARY_POLICY_WORKER_WRITE_SET
});
const patchDomainByKind = Object.freeze({economy: "economy-mutation", diplomacy: "diplomacy", military: "military", "military-policy": "military-policy"});
const dynamicKinds = new Set<EconomyDiplomacyMilitaryWorkerKind>(["economy", "military-policy"]);
const optionalDeletePathsByKind = new Map<EconomyDiplomacyMilitaryWorkerKind, ReadonlySet<string>>([
  ["diplomacy", new Set(["metadata.derivedStale"])]
]);
const economyObjectFields = ["salesTax", "pollTax", "treasury", "resourcePower", "economicPower", "governmentEconomicModifier", "governmentTradeModifier", "populationPower", "territoryPower", "settlementPower", "powerScore", "militarySupply"] as const;
const cityEconomyFields = ["market", "production", "product", "treasury"] as const;
const burgEconomyFields = [...cityEconomyFields, "plaza"] as const;
const goodMutableFields = new Set(["name", "visible", "color", "icon", "label", "value", "distribution", "biomeOutput", "demandCoverage"]);
const marketMutableFields = new Set(["name", "color", "centerBurgId", "cell", "x", "y", "state", "goods", "resourceSupply", "resourceSupplySources", "demandSummary", "priceSummary"]);
const economyIndexedFields = new Map<string, ReadonlySet<string>>([
  ["pack.goods", goodMutableFields], ["economy.goods", goodMutableFields],
  ["pack.markets", marketMutableFields], ["economy.markets", marketMutableFields],
  ["pack.burgs", new Set(burgEconomyFields)], ["settlements.cities", new Set(cityEconomyFields)],
  ["pack.states", new Set(economyObjectFields)], ["politics.states", new Set(economyObjectFields)],
  ["pack.provinces", new Set(economyObjectFields)], ["politics.provinces", new Set(economyObjectFields)]
]);

export function validateEconomyDiplomacyMilitaryWorkerOutput(input: {
  readonly kind: EconomyDiplomacyMilitaryWorkerKind;
  readonly binding: unknown;
  readonly output: unknown;
  readonly policy: unknown;
  readonly sourceMap: unknown;
  readonly expectation?: Readonly<{stateId?: number}>;
}): Readonly<{binding: ComputeOperationBinding; kind: EconomyDiplomacyMilitaryWorkerKind; writeSet: readonly string[]}> {
  const descriptor = descriptorByKind[input.kind];
  const roots = writeSetByKind[input.kind];
  if (!descriptor || !roots || !descriptor.resultKinds.includes(input.kind as never)) throw protocolError("world-systems-worker-kind-invalid", `经济外交军事 Worker 不支持 ${String(input.kind || "(empty)")}`);
  const binding = validateLegacyBinding(input.binding, "world-systems.request.binding");
  const output = record(input.output, "world-systems.output");
  if (output.kind !== input.kind) throw protocolError("world-systems-worker-kind-mismatch", "经济外交军事 Worker 结果类型与请求不一致");
  assertSameBinding(output.binding, binding, "world-systems.output.binding");
  validatePreparedRender(output.preparedRender, binding);
  const result = record(output.result, "world-systems.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("world-systems-worker-result-invalid", "经济外交军事 Worker 缺少 executed 结果");
  const expectedStateId = validateExpectation(input.kind, input.expectation, result, output.plan);
  const patch = validatePatch(output.patch, input.kind, roots, input.policy, result.executed, expectedStateId);
  if (result.executed) validateDomain(input.kind, patch, input.sourceMap, expectedStateId);
  return Object.freeze({binding: adaptBinding(input.kind, binding), kind: input.kind, writeSet: Object.freeze([...patch.keys()])});
}

function validatePatch(value: unknown, kind: EconomyDiplomacyMilitaryWorkerKind, roots: readonly string[], policyValue: unknown, executed: boolean, expectedStateId?: number): Map<string, UnknownRecord> {
  const patch = record(value, "world-systems.patch");
  const policy = record(policyValue, "world-systems.policy");
  const domain = patchDomainByKind[kind];
  if (patch.version !== 1 || patch.domain !== domain || policy.domain !== domain) throw protocolError("world-systems-worker-patch-invalid", `${kind} patch 版本或领域无效`);
  const writeSet = stringArray(patch.writeSet, "world-systems.patch.writeSet", true);
  const allowedPaths = stringArray(policy.allowedPaths, "world-systems.policy.allowedPaths", true);
  const dynamic = dynamicKinds.has(kind);
  if (dynamic ? !sameStringSet(allowedPaths, writeSet) : !sameStringSet(allowedPaths, roots)) throw protocolError("world-systems-worker-policy-drift", `${kind} 主线程 policy 与 Manifest 写集漂移`);
  const exactPaths = effectiveExactPaths(roots);
  if (executed ? dynamic ? writeSet.some(path => !withinRoots(path, roots)) : !sameStringSet(writeSet, exactPaths) : writeSet.length !== 0) throw protocolError("world-systems-worker-write-set-incomplete", `${kind} patch 没有合法覆盖正式写集`);
  const operations = array(patch.operations, "world-systems.patch.operations");
  const rows = new Map<string, UnknownRecord>();
  for (let index = 0; index < operations.length; index++) {
    const row = record(operations[index], `world-systems.patch.operations.${index}`);
    const parts = stringArray(row.path, `world-systems.patch.operations.${index}.path`);
    if (row.exists !== true && row.exists !== false || parts.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) throw protocolError("world-systems-worker-operation-invalid", `${kind} patch operation 结构无效`);
    const path = parts.join(".");
    if (!withinRoots(path, roots) || rows.has(path) || (!dynamic && row.exists !== true && !optionalDeletePathsByKind.get(kind)?.has(path)) || !validDynamicPath(kind, path, expectedStateId) || !validOperationValue(kind, path, row.value, row.exists)) throw protocolError("world-systems-worker-operation-value-invalid", `${kind} patch 的 ${path} 值、存在性或容器无效`);
    rows.set(path, row);
  }
  if (!sameStringSet(writeSet, [...rows.keys()]) || rows.size !== writeSet.length) throw protocolError("world-systems-worker-write-set-mismatch", `${kind} patch writeSet 与 operations 不一致`);
  return rows;
}

function validateDomain(kind: EconomyDiplomacyMilitaryWorkerKind, patch: Map<string, UnknownRecord>, sourceMapValue: unknown, expectedStateId?: number): void {
  if (kind === "economy") return validateEconomy(patch, sourceMapValue);
  const values = new Map([...patch].map(([path, row]) => [path, row.value]));
  if (kind === "diplomacy") return validateDiplomacy(values, sourceMapValue);
  if (kind === "military") return validateMilitary(values.get("military"), values.get("pack.military"), values.get("politics.states"), values.get("pack.states"), sourceMapValue, true);
  validateMilitaryPolicy(patch, sourceMapValue, expectedStateId);
}

function validateEconomy(patch: Map<string, UnknownRecord>, sourceMapValue: unknown): void {
  const view = economyView(sourceMapValue);
  applyOperations(view, patch);
  const pack = record(view.pack, "economy.pack");
  const politics = record(view.politics, "economy.politics");
  const settlements = record(view.settlements, "economy.settlements");
  const economy = record(view.economy, "economy.document");
  assertDeepEqual(pack.goods, economy.goods, "economy-goods-mirror-invalid", "economy / pack goods 镜像不一致");
  assertDeepEqual(pack.markets, economy.markets, "economy-market-mirror-invalid", "economy / pack markets 镜像不一致");
  assertDeepEqual(pack.deals, economy.deals, "economy-deal-mirror-invalid", "economy / pack deals 镜像不一致");
  validateObjectFields(pack.states, politics.states, economyObjectFields, "economy-state-mirror-invalid");
  validateObjectFields(pack.provinces, politics.provinces, economyObjectFields, "economy-province-mirror-invalid");
  const burgs = indexedValues(pack.burgs, "economy.pack.burgs");
  const cities = indexedValues(settlements.cities, "economy.settlements.cities");
  for (const cityValue of cities) {
    if (!isPlainRecord(cityValue) || cityValue.removed) continue;
    const burgId = Number(cityValue.burgId);
    const burg = burgs[burgId];
    if (!Number.isSafeInteger(burgId) || !isPlainRecord(burg) || Number(burg.cityId) !== Number(cityValue.id)) throw protocolError("economy-city-identity-invalid", "经济 city / burg 身份不一致");
    for (const field of cityEconomyFields) assertDeepEqual(cityValue[field], burg[field], "economy-city-mirror-invalid", `经济 city / burg ${field} 镜像不一致`);
  }
  const markets = indexedValues(pack.markets, "economy.pack.markets");
  const goods = indexedValues(pack.goods, "economy.pack.goods");
  const deals = indexedValues(pack.deals, "economy.pack.deals");
  const cells = record(pack.cells, "economy.pack.cells");
  const cellIds = indexedValues(cells.i, "economy.pack.cells.i");
  const cellMarkets = indexedValues(cells.market, "economy.pack.cells.market").map(Number);
  const cellStates = indexedValues(cells.state, "economy.pack.cells.state").map(Number);
  const cellNeighbors = indexedValues(cells.c, "economy.pack.cells.c");
  const states = indexedValues(pack.states, "economy.pack.states");
  for (let goodId = 1; goodId < goods.length; goodId++) {
    const goodValue = goods[goodId];
    if (!goodValue) continue;
    const good = record(goodValue, `economy.good.${goodId}`);
    if (Number(good.i) !== goodId) throw protocolError("economy-good-identity-invalid", `商品槽 #${goodId} 身份无效`);
  }
  const centers = new Set<number>();
  for (let marketId = 1; marketId < markets.length; marketId++) {
    const marketValue = markets[marketId];
    if (!marketValue) continue;
    const market = record(marketValue, `economy.market.${marketId}`);
    const centerBurgId = Number(market.centerBurgId);
    const cell = Number(market.cell);
    const stateId = Number(market.state);
    const burg = burgs[centerBurgId];
    const state = states[stateId];
    if (Number(market.i) !== marketId || Number(market.id) !== marketId) throw protocolError("economy-market-identity-invalid", `市场槽 #${marketId} 身份无效`);
    if (!Number.isSafeInteger(centerBurgId) || centerBurgId <= 0 || centers.has(centerBurgId) || !isPlainRecord(burg) || burg.removed || Number(burg.i) !== centerBurgId || Number(burg.cell) !== cell) throw protocolError("economy-market-burg-reference-invalid", `市场 #${marketId} 中心城市引用无效`);
    if (!Number.isSafeInteger(cell) || cell < 0 || cell >= cellIds.length) throw protocolError("economy-market-cell-reference-invalid", `市场 #${marketId} 中心 cell 引用无效`);
    if (!Number.isSafeInteger(stateId) || stateId <= 0 || !isPlainRecord(state) || state.removed || Number(state.i) !== stateId || Number(burg.state) !== stateId || cellStates[cell] !== stateId) throw protocolError("economy-market-state-reference-invalid", `市场 #${marketId} 国家引用无效`);
    const inventory = record(market.goods, `economy.market.${marketId}.goods`);
    for (const [goodKey, itemValue] of Object.entries(inventory)) {
      const goodId = Number(goodKey);
      const item = record(itemValue, `economy.market.${marketId}.goods.${goodKey}`);
      if (!Number.isSafeInteger(goodId) || goodId <= 0 || !isPlainRecord(goods[goodId]) || Number(item.good) !== goodId) throw protocolError("economy-market-good-reference-invalid", `市场 #${marketId} 商品引用无效`);
    }
    centers.add(centerBurgId);
  }
  for (const marketId of cellMarkets) if (marketId && !isPlainRecord(markets[marketId])) throw protocolError("economy-market-cell-reference-invalid", `pack cell 指向不存在的市场 #${marketId}`);
  for (let dealId = 0; dealId < deals.length; dealId++) {
    const dealValue = deals[dealId];
    if (!dealValue) continue;
    const deal = record(dealValue, `economy.deal.${dealId}`);
    const goodId = Number(deal.good);
    if (Number(deal.i) !== dealId) throw protocolError("economy-deal-identity-invalid", `交易槽 #${dealId} 身份无效`);
    if (!Number.isSafeInteger(goodId) || goodId <= 0 || !isPlainRecord(goods[goodId])) throw protocolError("economy-deal-good-reference-invalid", `交易 #${dealId} 商品引用无效`);
    validateEconomyDealParty(deal.sellerType, deal.seller, markets, burgs, dealId, "seller");
    validateEconomyDealParty(deal.buyerType, deal.buyer, markets, burgs, dealId, "buyer");
    if (deal.path !== undefined && deal.path !== null) validateEconomyDealPath(deal.path, cellIds.length, cellNeighbors, dealId);
  }
}

function validateEconomyDealParty(typeValue: unknown, idValue: unknown, markets: unknown[], burgs: unknown[], dealId: number, side: string): void {
  const type = String(typeValue);
  const id = Number(idValue);
  const valid = type === "market"
    ? Number.isSafeInteger(id) && id > 0 && isPlainRecord(markets[id])
    : type === "burg" && Number.isSafeInteger(id) && id > 0 && isPlainRecord(burgs[id]) && !burgs[id].removed && isPlainRecord(markets[Number(burgs[id].market)]);
  if (!valid) throw protocolError("economy-deal-party-reference-invalid", `交易 #${dealId} ${side} 端点无效`);
}

function validateEconomyDealPath(pathValue: unknown, cellCount: number, neighbors: unknown[], dealId: number): void {
  const path = array(pathValue, `economy.deal.${dealId}.path`).map(Number);
  if (!path.length || path.some(cell => !Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount)) throw protocolError("economy-deal-path-invalid", `交易 #${dealId} 路径 cell 无效`);
  for (let index = 1; index < path.length; index++) {
    const previousNeighbors = indexedValues(neighbors[path[index - 1]], `economy.pack.cells.c.${path[index - 1]}`).map(Number);
    if (!previousNeighbors.includes(path[index])) throw protocolError("economy-deal-path-invalid", `交易 #${dealId} 路径不连续`);
  }
}

function validateDiplomacy(values: Map<string, unknown>, sourceMapValue: unknown): void {
  assertDeepEqual(values.get("diplomacy"), values.get("pack.diplomacy"), "diplomacy-pack-mirror-invalid", "diplomacy / pack 镜像不一致");
  assertDeepEqual(values.get("politics.states"), values.get("pack.states"), "diplomacy-state-mirror-invalid", "外交 politics / pack state 镜像不一致");
  assertDeepEqual(values.get("military"), values.get("pack.military"), "diplomacy-military-mirror-invalid", "外交 military / pack 镜像不一致");
  assertDeepEqual(record(values.get("zones"), "diplomacy.zones").zones, values.get("pack.zones"), "diplomacy-zone-mirror-invalid", "外交 zones / pack 镜像不一致");
  const states = indexedValues(values.get("pack.states"), "diplomacy.pack.states");
  validateDiplomacyRelations(states, values.get("diplomacy"));
  validateZoneMirrors(values, sourceMapValue);
  validateDiplomacyWarzones(record(values.get("zones"), "diplomacy.zones").zones, states, sourceMapValue);
  validateMilitary(values.get("military"), values.get("pack.military"), values.get("politics.states"), values.get("pack.states"), sourceMapValue);
}

function validateDiplomacyWarzones(zonesValue: unknown, states: unknown[], sourceMapValue: unknown): void {
  const sourceMap = record(sourceMapValue, "diplomacy.sourceMap");
  const sourcePack = record(sourceMap.pack, "diplomacy.sourceMap.pack");
  const pack = {states, cells: sourcePack.cells};
  for (const zoneValue of indexedValues(zonesValue, "diplomacy.zones.zones")) {
    if (!zoneValue) continue;
    const zone = record(zoneValue, "diplomacy.zone");
    if (zone.removed || zone.type !== "Warzone") continue;
    const pair = resolveWarzoneStatePair(pack, zone);
    if (!pair || !isActiveEnemyPair(states, pair.attacker, pair.defender)) throw protocolError("diplomacy-warzone-reference-invalid", "外交重生成产生了无效战争区域国家对");
  }
}

function validateDiplomacyRelations(states: unknown[], diplomacyValue: unknown): void {
  const inverse: Record<string, string> = {Vassal: "Suzerain", Suzerain: "Vassal"};
  const allowed = new Set(["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Enemy", "Vassal", "Suzerain", "Unknown", "x"]);
  for (let left = 1; left < states.length; left++) {
    const state = states[left];
    if (!isPlainRecord(state) || state.removed) continue;
    const relations = array(state.diplomacy, `diplomacy.state.${left}.relations`);
    if (relations.length !== states.length) throw protocolError("diplomacy-relation-length-invalid", `国家 #${left} 外交矩阵长度无效`);
    for (let right = left + 1; right < states.length; right++) {
      const other = states[right];
      if (!isPlainRecord(other) || other.removed) continue;
      const relation = String(relations[right]);
      const reverse = String(array(other.diplomacy, `diplomacy.state.${right}.relations`)[left]);
      if (!allowed.has(relation) || reverse !== (inverse[relation] || relation)) throw protocolError("diplomacy-relation-mirror-invalid", `国家 #${left} / #${right} 外交关系不互逆`);
    }
  }
  const diplomacy = record(diplomacyValue, "diplomacy.document");
  const neutral = isPlainRecord(states[0]) ? states[0] : {};
  assertDeepEqual(diplomacy.chronicle, neutral.diplomacy, "diplomacy-chronicle-mirror-invalid", "外交史与中立槽镜像不一致");
}

function validateMilitary(militaryValue: unknown, packMilitaryValue: unknown, politicsStatesValue: unknown, packStatesValue: unknown, sourceMapValue: unknown, requireArchivedEvents = false): void {
  assertDeepEqual(militaryValue, packMilitaryValue, "military-pack-mirror-invalid", "military / pack 镜像不一致");
  validateObjectFields(packStatesValue, politicsStatesValue, ["alert", "military", "militaryPolicy", "militaryDiagnostics"], "military-state-mirror-invalid");
  const sourceMap = record(sourceMapValue, "military.sourceMap");
  const sourcePack = record(sourceMap.pack, "military.sourceMap.pack");
  const cellCount = indexedLength(record(sourcePack.cells, "military.sourceMap.pack.cells").i, "military.sourceMap.pack.cells.i");
  const states = indexedValues(packStatesValue, "military.pack.states");
  const ids = new Set<string>();
  for (let stateId = 1; stateId < states.length; stateId++) {
    const state = states[stateId];
    if (!isPlainRecord(state) || state.removed) continue;
    if (Number(state.i) !== stateId) throw protocolError("military-state-identity-invalid", `军事国家槽 #${stateId} 身份无效`);
    for (const regimentValue of array(state.military, `military.state.${stateId}.regiments`)) {
      const regiment = record(regimentValue, "military.regiment");
      const id = String(regiment.id ?? `${stateId}:${String(regiment.i ?? "")}`);
      const cell = Number(regiment.cell);
      if (!id || ids.has(id) || Number(regiment.state ?? regiment.stateId) !== stateId || !Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount) throw protocolError("military-regiment-reference-invalid", `国家 #${stateId} 军团身份、归属或 cell 无效`);
      ids.add(id);
    }
  }
  const military = record(militaryValue, "military.document");
  const metadata = record(military.metadata, "military.metadata");
  if (Number(metadata.regiments) !== ids.size) throw protocolError("military-metadata-count-invalid", "军事 metadata.regiments 与军团集合不一致");
  const events = array(military.events ?? [], "military.events");
  if (Number(metadata.events || 0) !== events.length) throw protocolError("military-event-count-invalid", "军事 metadata.events 与战报集合不一致");
  if (requireArchivedEvents) {
    const sourceMilitary = isPlainRecord(sourceMap.military) ? sourceMap.military : {};
    const sourceEvents = array(sourceMilitary.events ?? [], "military.sourceMap.events");
    const sourceMetadata = isPlainRecord(sourceMilitary.metadata) ? sourceMilitary.metadata : {};
    const archiveGeneration = Number(sourceMetadata.eventArchiveGeneration || 0) + 1;
    const expectedEvents = sourceEvents.map((event, index) => ({...structuredClone(record(event, `military.sourceMap.events.${index}`)), archived: true, archiveReason: "military-regeneration", archiveGeneration}));
    if (!sameData(events, expectedEvents)) throw protocolError("military-event-archive-invalid", "军事重生成没有按原战报内容和顺序完整归档");
    if (Number(metadata.eventSequence || 0) !== Number(sourceMetadata.eventSequence || 0)) throw protocolError("military-event-sequence-invalid", "军事重生成改变了战报序号");
    if (Number(metadata.eventArchiveGeneration) !== archiveGeneration) throw protocolError("military-event-archive-generation-invalid", "军事重生成归档代次没有严格递增");
  }
}

function validateMilitaryPolicy(patch: Map<string, UnknownRecord>, sourceMapValue: unknown, expectedStateId?: number): void {
  if (!Number.isSafeInteger(expectedStateId) || Number(expectedStateId) <= 0) throw protocolError("military-policy-worker-expectation-invalid", "军事策略校验缺少目标国家");
  const source = record(sourceMapValue, "military-policy.sourceMap");
  const sourcePack = record(source.pack, "military-policy.sourceMap.pack");
  const sourcePolitics = record(source.politics, "military-policy.sourceMap.politics");
  const view = structuredClone({military: source.military, pack: {military: sourcePack.military, states: sourcePack.states}, politics: {states: sourcePolitics.states}});
  applyOperations(view, patch);
  validateMilitary(view.military, record(view.pack, "military-policy.pack").military, record(view.politics, "military-policy.politics").states, record(view.pack, "military-policy.pack").states, sourceMapValue);
}

function economyView(sourceMapValue: unknown): UnknownRecord {
  const source = record(sourceMapValue, "economy.sourceMap");
  const pack = record(source.pack, "economy.sourceMap.pack");
  const politics = record(source.politics, "economy.sourceMap.politics");
  const settlements = record(source.settlements, "economy.sourceMap.settlements");
  return {
    pack: {cells: structuredClone({
      i: record(pack.cells, "economy.sourceMap.pack.cells").i,
      c: record(pack.cells, "economy.sourceMap.pack.cells").c,
      state: record(pack.cells, "economy.sourceMap.pack.cells").state,
      market: record(pack.cells, "economy.sourceMap.pack.cells").market
    }), goods: structuredClone(pack.goods), markets: structuredClone(pack.markets), deals: structuredClone(pack.deals), burgs: structuredClone(pack.burgs), states: structuredClone(pack.states), provinces: structuredClone(pack.provinces)},
    politics: {states: structuredClone(politics.states), provinces: structuredClone(politics.provinces)},
    settlements: {cities: structuredClone(settlements.cities)},
    economy: structuredClone(source.economy)
  };
}

function applyOperations(target: UnknownRecord, operations: Map<string, UnknownRecord>): void {
  for (const [path, row] of operations) {
    const parts = path.split(".");
    let owner: UnknownRecord = target;
    for (let index = 0; index < parts.length - 1; index++) {
      const key = parts[index];
      if (!owner[key] || typeof owner[key] !== "object") owner[key] = {};
      owner = owner[key] as UnknownRecord;
    }
    const key = parts.at(-1) as string;
    if (row.exists === true) owner[key] = structuredClone(row.value);
    else delete owner[key];
  }
}

function validateObjectFields(leftValue: unknown, rightValue: unknown, fields: readonly string[], code: string): void {
  const left = indexedValues(leftValue, `${code}.left`);
  const right = indexedValues(rightValue, `${code}.right`);
  if (left.length !== right.length) throw protocolError(code, `${code} 长度不一致`);
  for (let index = 0; index < left.length; index++) {
    const a = left[index];
    const b = right[index];
    if (!a && !b) continue;
    if (!isPlainRecord(a) || !isPlainRecord(b)) throw protocolError(code, `${code} 槽 #${index} 无效`);
    for (const field of fields) assertDeepEqual(a[field], b[field], code, `${code} 的 ${field} 不一致`);
  }
}

function adaptBinding(kind: EconomyDiplomacyMilitaryWorkerKind, source: LegacyBinding): ComputeOperationBinding {
  const operationId = `${kind}:${source.operationId}`;
  return validateOperationBinding({bindingPhase: "pre-commit", bindingKind: "compute", operationId, transactionId: `${source.mapIdentity}:${operationId}:${source.mapRevision}:${source.topologyRevision}:${source.generationToken}`, operationName: source.operationName || `${kind}.compute`, sourceRevision: adaptLegacyInteractiveRevision({mapIdentity: source.mapIdentity, mapRevision: source.mapRevision, topologyRevision: source.topologyRevision, domainRevisions: {[kind]: source.mapRevision}}), generationToken: source.generationToken, lockFingerprint: source.lockFingerprint}, "world-systems.binding.core") as ComputeOperationBinding;
}

function validatePreparedRender(value: unknown, expected: LegacyBinding): void {
  if (value === null || value === undefined) return;
  const prepared = record(value, "world-systems.output.preparedRender");
  if (prepared.binding !== null && prepared.binding !== undefined) assertSameBinding(prepared.binding, expected, "world-systems.output.preparedRender.binding");
}

function validateExpectation(kind: EconomyDiplomacyMilitaryWorkerKind, expectation: Readonly<{stateId?: number}> | undefined, result: UnknownRecord, planValue: unknown): number | undefined {
  if (kind !== "military-policy") return undefined;
  const stateId = Number(expectation?.stateId);
  if (!Number.isSafeInteger(stateId) || stateId <= 0) throw protocolError("military-policy-worker-expectation-invalid", "军事策略校验缺少请求目标国家");
  const plan = record(planValue, "military-policy.output.plan");
  const request = record(plan.request, "military-policy.output.plan.request");
  if (Number(result.stateId) !== stateId || Number(request.stateId) !== stateId) throw protocolError("military-policy-worker-state-mismatch", `军事策略结果越过请求国家 #${stateId}`);
  return stateId;
}

function validateLegacyBinding(value: unknown, path: string): LegacyBinding {
  const binding = record(value, path);
  const result = {mapIdentity: String(binding.mapIdentity ?? ""), mapRevision: Number(binding.mapRevision), topologyRevision: Number(binding.topologyRevision), generationToken: Number(binding.generationToken), lockFingerprint: String(binding.lockFingerprint ?? ""), operationId: Number(binding.operationId), operationName: String(binding.operationName ?? "")};
  if (!result.mapIdentity || !Number.isSafeInteger(result.mapRevision) || result.mapRevision < 0 || !Number.isSafeInteger(result.topologyRevision) || result.topologyRevision < 0 || !Number.isSafeInteger(result.generationToken) || result.generationToken < 0 || !result.lockFingerprint || !Number.isSafeInteger(result.operationId) || result.operationId < 0 || !result.operationName) throw protocolError("world-systems-worker-binding-invalid", `${path} 不完整`);
  return Object.freeze(result);
}

function assertSameBinding(value: unknown, expected: LegacyBinding, path: string): void {
  const actual = validateLegacyBinding(value, path);
  for (const key of Object.keys(expected) as Array<keyof LegacyBinding>) if (String(actual[key]) !== String(expected[key])) throw protocolError("world-systems-worker-binding-stale", `${path}.${key} 已过期`);
}

function withinRoots(path: string, roots: readonly string[]): boolean {
  return roots.some(root => path === root || path.startsWith(`${root}.`));
}

function effectiveExactPaths(roots: readonly string[]): string[] {
  return roots.filter(path => !roots.some(parent => parent !== path && path.startsWith(`${parent}.`)));
}

function validDynamicPath(kind: EconomyDiplomacyMilitaryWorkerKind, path: string, expectedStateId?: number): boolean {
  if (kind === "diplomacy" || kind === "military") return true;
  if (kind === "military-policy") {
    if (path === "military" || path === "pack.military") return true;
    const match = /^(?:pack|politics)\.states\.(\d+)\.(?:alert|military|militaryPolicy|militaryDiagnostics)$/u.exec(path);
    return Boolean(match && Number(match[1]) === expectedStateId);
  }
  if (["pack.deals", "economy.deals", "economy.metadata"].includes(path) || economyIndexedFields.has(path)) return true;
  if (/^pack\.cells\.market\.\d+$/u.test(path)) return true;
  const match = /^(pack\.(?:goods|markets|burgs|states|provinces)|politics\.(?:states|provinces)|settlements\.cities|economy\.(?:goods|markets))\.(\d+)(?:\.([^.]+))?$/u.exec(path);
  if (!match) return false;
  if (!match[3]) return true;
  return economyIndexedFields.get(match[1])?.has(match[3]) === true;
}

function validCanonicalValue(value: unknown, exists: unknown): boolean {
  if (exists === false) return value === undefined;
  if (exists !== true || value === undefined) return false;
  return isCanonicalTree(value);
}

function validOperationValue(kind: EconomyDiplomacyMilitaryWorkerKind, path: string, value: unknown, exists: unknown): boolean {
  if (kind === "military-policy" && exists === true && value === undefined && /^(?:pack|politics)\.states\.\d+\.(?:alert|military|militaryPolicy|militaryDiagnostics)$/u.test(path)) return true;
  return validCanonicalValue(value, exists);
}

function record(value: unknown, path: string): UnknownRecord {
  if (!isPlainRecord(value)) throw protocolError("world-systems-worker-record-invalid", `${path} 必须是普通对象`);
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw protocolError("world-systems-worker-array-invalid", `${path} 必须是数组`);
  return value;
}

function stringArray(value: unknown, path: string, allowEmpty = false): string[] {
  const values = array(value, path);
  if ((!allowEmpty && !values.length) || values.some(item => typeof item !== "string" || !item)) throw protocolError("world-systems-worker-string-array-invalid", `${path} 必须是字符串数组`);
  return values as string[];
}

function indexedValues(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) && !isTypedArray(value)) throw protocolError("world-systems-worker-indexed-invalid", `${path} 必须是数组或 TypedArray`);
  return Array.from(value as ArrayLike<unknown>);
}

function indexedLength(value: unknown, path: string): number {
  if (!Array.isArray(value) && !isTypedArray(value)) throw protocolError("world-systems-worker-indexed-invalid", `${path} 必须是数组或 TypedArray`);
  return Number((value as ArrayLike<unknown>).length);
}

function isTypedArray(value: unknown): value is Exclude<ArrayBufferView, DataView> {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value));
}

function assertDeepEqual(left: unknown, right: unknown, code: string, message: string): void {
  if (!sameData(left, right)) throw protocolError(code, message);
}

function sameData(left: unknown, right: unknown): boolean {
  return sameDataPair(left, right, new WeakMap<object, object>());
}

function sameDataPair(left: unknown, right: unknown, seen: WeakMap<object, object>): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (left.constructor !== right.constructor) return false;
  if (isTypedArray(left) && isTypedArray(right)) return left.byteLength === right.byteLength && new Uint8Array(left.buffer, left.byteOffset, left.byteLength).every((value, index) => value === new Uint8Array(right.buffer, right.byteOffset, right.byteLength)[index]);
  if (seen.get(left) === right) return true;
  seen.set(left, right);
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameDataPair((left as UnknownRecord)[key], (right as UnknownRecord)[key], seen));
}

function isCanonicalTree(value: unknown, visiting = new WeakSet<object>(), done = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || value instanceof DataView || value instanceof Map || value instanceof Set || value instanceof Date) return false;
  if (isTypedArray(value)) return true;
  if (!Array.isArray(value) && !isPlainRecord(value)) return false;
  if (done.has(value)) return true;
  if (visiting.has(value)) return false;
  visiting.add(value);
  const valid = Object.entries(value).every(([key, child]) => !["__proto__", "prototype", "constructor"].includes(key) && child !== undefined && isCanonicalTree(child, visiting, done));
  visiting.delete(value);
  if (valid) done.add(value);
  return valid;
}

function protocolError(code: string, message: string): Error & {code: string} {
  const error = new Error(message) as Error & {code: string};
  error.code = code;
  return error;
}
