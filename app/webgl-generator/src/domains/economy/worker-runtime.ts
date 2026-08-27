import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {ECONOMY_WORKER_WRITE_SET, economyManifest} from "./manifest.js";
import {DIPLOMACY_WORKER_WRITE_SET, diplomacyManifest} from "../diplomacy/manifest.js";
import {MILITARY_POLICY_WORKER_WRITE_SET, MILITARY_REGENERATION_WORKER_WRITE_SET, militaryManifest} from "../military/manifest.js";
import {validateZoneMirrors} from "../settlements/worker-runtime.js";
import {isRegenerationLocked, regenerationLockedIds} from "../regeneration-validation-locks.js";
import {validatePreparedWorkerRenderBinding} from "../worker-render-binding.js";

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
const dealFields = new Set(["i", "good", "sellerType", "seller", "buyerType", "buyer", "units", "basePrice", "price", "distance", "distanceCost", "distanceMultiplier", "tax", "source", "path"]);
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
  readonly renderBinding?: unknown;
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
  validatePreparedWorkerRenderBinding(output.preparedRender, input.renderBinding, {
    path: "world-systems.output.preparedRender",
    schemaCode: "world-systems-render-schema-invalid",
    invalidCode: "world-systems-render-binding-invalid",
    staleCode: "world-systems-render-binding-stale",
    label: "经济外交军事"
  });
  const result = record(output.result, "world-systems.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("world-systems-worker-result-invalid", "经济外交军事 Worker 缺少 executed 结果");
  const expectedStateId = validateExpectation(input.kind, input.expectation, result, output.plan);
  const patch = validatePatch(output.patch, input.kind, roots, input.policy, result.executed, input.sourceMap, expectedStateId);
  if (result.executed) validateDomain(input.kind, patch, input.sourceMap, expectedStateId);
  return Object.freeze({binding: adaptBinding(input.kind, binding), kind: input.kind, writeSet: Object.freeze([...patch.keys()])});
}

function validatePatch(value: unknown, kind: EconomyDiplomacyMilitaryWorkerKind, roots: readonly string[], policyValue: unknown, executed: boolean, sourceMapValue: unknown, expectedStateId?: number): Map<string, UnknownRecord> {
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
  const descendantAncestors = new Set<string>();
  for (let index = 0; index < operations.length; index++) {
    const row = record(operations[index], `world-systems.patch.operations.${index}`);
    const parts = stringArray(row.path, `world-systems.patch.operations.${index}.path`);
    if (row.exists !== true && row.exists !== false || parts.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) throw protocolError("world-systems-worker-operation-invalid", `${kind} patch operation 结构无效`);
    const path = parts.join(".");
    const ancestors = pathAncestors(parts);
    const overlaps = ancestors.some(ancestor => rows.has(ancestor)) || descendantAncestors.has(path);
    if (!withinRoots(path, roots) || rows.has(path) || overlaps || (!dynamic && row.exists !== true && !optionalDeletePathsByKind.get(kind)?.has(path)) || !validDynamicPath(kind, path, expectedStateId) || !validOperationValue(kind, path, row.value, row.exists)) throw protocolError("world-systems-worker-operation-value-invalid", `${kind} patch 的 ${path} 值、存在性或容器无效`);
    rows.set(path, row);
    for (const ancestor of ancestors) descendantAncestors.add(ancestor);
  }
  if (!sameStringSet(writeSet, [...rows.keys()]) || rows.size !== writeSet.length) throw protocolError("world-systems-worker-write-set-mismatch", `${kind} patch writeSet 与 operations 不一致`);
  if (executed && !dynamic) validateExactPatchSemantics(kind, rows, sourceMapValue);
  return rows;
}

function validateExactPatchSemantics(kind: EconomyDiplomacyMilitaryWorkerKind, rows: Map<string, UnknownRecord>, sourceMapValue: unknown): void {
  const sourceMap = record(sourceMapValue, `${kind}.sourceMap`);
  for (const [path, row] of rows) {
    if (row.exists === false) continue;
    const value = row.value;
    if (path === "generationLog") {
      const next = stringArray(value, `${kind}.generationLog`, true);
      const previous = sourceMap.generationLog === undefined ? [] : stringArray(sourceMap.generationLog, `${kind}.sourceMap.generationLog`, true);
      if (next.length !== previous.length + 1 || !previous.every((item, index) => item === next[index])) throw protocolError("world-systems-worker-generation-log-invalid", `${kind} generationLog 没有保留来源前缀并只追加一项`);
      continue;
    }
    if (path === `metadata.regeneration.${kind}`) {
      const previous = Number(readNestedPath(sourceMap, path) || 0);
      if (!Number.isSafeInteger(value) || Number(value) !== previous + 1) throw protocolError("world-systems-worker-generation-counter-invalid", `${kind} ${path} 没有严格递增`);
      continue;
    }
    if (path.endsWith(".metadata.stale")) {
      if (typeof value !== "boolean") throw protocolError("world-systems-worker-stale-shape-invalid", `${kind} ${path} 必须是布尔值`);
      continue;
    }
    if (path === "metadata.derivedStale") {
      const stale = record(value, `${kind}.metadata.derivedStale`);
      stringArray(stale.systems, `${kind}.metadata.derivedStale.systems`, true);
      if (typeof stale.updatedAt !== "string" || !stale.updatedAt) throw protocolError("world-systems-worker-derived-stale-shape-invalid", `${kind} metadata.derivedStale 结构无效`);
      continue;
    }
    if (["pack.states", "politics.states", "pack.zones"].includes(path)) {
      array(value, `${kind}.${path}`);
      continue;
    }
    if (["diplomacy", "pack.diplomacy", "military", "pack.military", "zones"].includes(path)) record(value, `${kind}.${path}`);
  }
}

function validateDomain(kind: EconomyDiplomacyMilitaryWorkerKind, patch: Map<string, UnknownRecord>, sourceMapValue: unknown, expectedStateId?: number): void {
  if (kind === "economy") return validateEconomy(patch, sourceMapValue);
  const values = new Map([...patch].map(([path, row]) => [path, row.value]));
  if (kind === "diplomacy") return validateDiplomacy(values, sourceMapValue);
  if (kind === "military") return validateMilitary(values.get("military"), values.get("pack.states"), sourceMapValue);
  validateMilitaryPolicy(patch, sourceMapValue, expectedStateId);
}

function validateEconomy(patch: Map<string, UnknownRecord>, sourceMapValue: unknown): void {
  const view = economyView(sourceMapValue);
  applyOperations(view, patch);
  const pack = record(view.pack, "economy.pack");
  const burgs = indexedValues(pack.burgs, "economy.pack.burgs");
  const markets = indexedValues(pack.markets, "economy.pack.markets");
  const goods = indexedValues(pack.goods, "economy.pack.goods");
  const deals = indexedValues(pack.deals, "economy.pack.deals");
  const cells = record(pack.cells, "economy.pack.cells");
  const cellIds = indexedValues(cells.i, "economy.pack.cells.i");
  const cellNeighbors = indexedValues(cells.c, "economy.pack.cells.c");
  const lockedMarketIds = regenerationLockedIds(sourceMapValue, "economy-market");
  const lockedDealIds = regenerationLockedIds(sourceMapValue, "trade-flow");
  for (let goodId = 1; goodId < goods.length; goodId++) {
    const goodValue = goods[goodId];
    if (!goodValue || !patchTouchesIndexedRow(patch, "pack.goods", goodId)) continue;
    const good = record(goodValue, `economy.good.${goodId}`);
    if (Number(good.i) !== goodId) throw protocolError("economy-good-identity-invalid", `商品槽 #${goodId} 身份无效`);
  }
  for (let marketId = 1; marketId < markets.length; marketId++) {
    const marketValue = markets[marketId];
    if (!marketValue || !patchTouchesIndexedRow(patch, "pack.markets", marketId)) continue;
    const market = record(marketValue, `economy.market.${marketId}`);
    if (isRegenerationLocked(lockedMarketIds, marketId, market.i, market.id)) continue;
    const centerBurgId = Number(market.centerBurgId);
    const cell = Number(market.cell);
    const x = Number(market.x);
    const y = Number(market.y);
    const burg = burgs[centerBurgId];
    if (Number(market.i) !== marketId || Number(market.id) !== marketId) throw protocolError("economy-market-identity-invalid", `市场槽 #${marketId} 身份无效`);
    if (centerBurgId !== 0 && (!Number.isSafeInteger(centerBurgId) || centerBurgId < 0 || !isPlainRecord(burg) || burg.removed || Number(burg.i) !== centerBurgId)) throw protocolError("economy-market-burg-reference-invalid", `市场 #${marketId} 中心城市引用无效`);
    if (!Number.isSafeInteger(cell) || cell < 0 || cell >= cellIds.length) throw protocolError("economy-market-cell-reference-invalid", `市场 #${marketId} 中心 cell 引用无效`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw protocolError("regeneration-geometry-invalid", `新生成市场 #${marketId} 坐标无效`);
    const inventory = record(market.goods, `economy.market.${marketId}.goods`);
    for (const [goodKey, itemValue] of Object.entries(inventory)) {
      const goodId = Number(goodKey);
      const item = record(itemValue, `economy.market.${marketId}.goods.${goodKey}`);
      if (!Number.isSafeInteger(goodId) || goodId <= 0 || !isPlainRecord(goods[goodId]) || Number(item.good) !== goodId) throw protocolError("economy-market-good-reference-invalid", `市场 #${marketId} 商品引用无效`);
    }
  }
  for (let dealId = 0; dealId < deals.length; dealId++) {
    const dealValue = deals[dealId];
    if (!dealValue || !patchTouchesIndexedRow(patch, "pack.deals", dealId)) continue;
    const deal = record(dealValue, `economy.deal.${dealId}`);
    if (isRegenerationLocked(lockedDealIds, dealId, deal.i, deal.id)) continue;
    const goodId = Number(deal.good);
    if (Number(deal.i) !== dealId) throw protocolError("economy-deal-identity-invalid", `交易槽 #${dealId} 身份无效`);
    if (!Number.isSafeInteger(goodId) || goodId <= 0 || !isPlainRecord(goods[goodId])) throw protocolError("economy-deal-good-reference-invalid", `交易 #${dealId} 商品引用无效`);
    validateEconomyDealParty(deal.sellerType, deal.seller, markets, burgs, dealId, "seller");
    validateEconomyDealParty(deal.buyerType, deal.buyer, markets, burgs, dealId, "buyer");
    if (deal.path !== undefined && deal.path !== null) validateEconomyDealPath(deal.path, cellIds.length, cellNeighbors, dealId);
  }
}

function patchTouchesIndexedRow(patch: Map<string, UnknownRecord>, root: string, index: number): boolean {
  if (patch.has(root)) return true;
  const prefix = `${root}.${index}`;
  for (const path of patch.keys()) if (path === prefix || path.startsWith(`${prefix}.`)) return true;
  return false;
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
  record(values.get("diplomacy"), "diplomacy.document");
  record(values.get("pack.diplomacy"), "diplomacy.pack.document");
  record(values.get("military"), "diplomacy.military");
  record(values.get("pack.military"), "diplomacy.pack.military");
  record(values.get("zones"), "diplomacy.zones");
  const states = indexedValues(values.get("pack.states"), "diplomacy.pack.states");
  validateDiplomacyRelations(states, values.get("diplomacy"), sourceMapValue);
  validateZoneMirrors(values, sourceMapValue);
}

function validateDiplomacyRelations(states: unknown[], diplomacyValue: unknown, sourceMapValue: unknown): void {
  const allowed = new Set(["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Enemy", "Vassal", "Suzerain", "Unknown", "x"]);
  const lockedStateIds = regenerationLockedIds(sourceMapValue, "state");
  const lockedPairIds = regenerationLockedIds(sourceMapValue, "diplomacy-relation");
  for (let left = 1; left < states.length; left++) {
    const state = states[left];
    if (!isPlainRecord(state) || state.removed) continue;
    if (isRegenerationLocked(lockedStateIds, left, state.i, state.id)) continue;
    const relations = array(state.diplomacy, `diplomacy.state.${left}.relations`);
    if (relations.length !== states.length) throw protocolError("diplomacy-relation-length-invalid", `国家 #${left} 外交矩阵长度无效`);
    for (let right = 1; right < states.length; right++) {
      const other = states[right];
      if (!isPlainRecord(other) || other.removed) continue;
      const pairId = left < right ? `${left}:${right}` : `${right}:${left}`;
      if (isRegenerationLocked(lockedStateIds, right, other.i, other.id) || isRegenerationLocked(lockedPairIds, pairId)) continue;
      const relation = String(relations[right]);
      if (!allowed.has(relation)) throw protocolError("diplomacy-relation-invalid", `国家 #${left} / #${right} 外交关系值无效`);
    }
  }
  record(diplomacyValue, "diplomacy.document");
}

function validateMilitary(militaryValue: unknown, packStatesValue: unknown, sourceMapValue: unknown): void {
  const sourceMap = record(sourceMapValue, "military.sourceMap");
  const sourcePack = record(sourceMap.pack, "military.sourceMap.pack");
  const cellCount = indexedLength(record(sourcePack.cells, "military.sourceMap.pack.cells").i, "military.sourceMap.pack.cells.i");
  const states = indexedValues(packStatesValue, "military.pack.states");
  record(militaryValue, "military.document");
  const ids = new Set<string>();
  const lockedStateIds = regenerationLockedIds(sourceMapValue, "state");
  const lockedRegimentIds = regenerationLockedIds(sourceMapValue, "military");
  for (let stateId = 1; stateId < states.length; stateId++) {
    const state = states[stateId];
    if (!isPlainRecord(state) || state.removed) continue;
    if (isRegenerationLocked(lockedStateIds, stateId, state.i, state.id)) continue;
    const regiments = Array.isArray(state.military) ? state.military : [];
    for (const regimentValue of regiments) {
      const regiment = record(regimentValue, "military.regiment");
      const id = String(regiment.id ?? `${stateId}:${String(regiment.i ?? "")}`);
      if (isRegenerationLocked(lockedRegimentIds, id, `${stateId}:${String(regiment.i ?? "")}`)) continue;
      const cell = Number(regiment.cell);
      const x = Number(regiment.x);
      const y = Number(regiment.y);
      if (!id || ids.has(id) || Number(regiment.state ?? regiment.stateId) !== stateId || !Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount) throw protocolError("military-regiment-reference-invalid", `国家 #${stateId} 军团身份、归属或 cell 无效`);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw protocolError("regeneration-geometry-invalid", `国家 #${stateId} 新生成军团 ${id} 坐标无效`);
      ids.add(id);
    }
  }
}

function validateMilitaryPolicy(patch: Map<string, UnknownRecord>, sourceMapValue: unknown, expectedStateId?: number): void {
  if (!Number.isSafeInteger(expectedStateId) || Number(expectedStateId) <= 0) throw protocolError("military-policy-worker-expectation-invalid", "军事策略校验缺少目标国家");
  const stateId = Number(expectedStateId);
  const source = record(sourceMapValue, "military-policy.sourceMap");
  const sourcePack = record(source.pack, "military-policy.sourceMap.pack");
  const sourcePolitics = record(source.politics, "military-policy.sourceMap.politics");
  const view = structuredClone({military: source.military, pack: {military: sourcePack.military, states: sourcePack.states}, politics: {states: sourcePolitics.states}});
  applyOperations(view, patch);
  validateMilitary(view.military, record(view.pack, "military-policy.pack").states, sourceMapValue);
  const nextMilitary = record(view.military, "military-policy.military");
  const sourceMilitary = record(source.military, "military-policy.sourceMap.military");
  assertDeepEqual(nextMilitary.events ?? [], sourceMilitary.events ?? [], "military-policy-events-invalid", "军事策略结果改变了请求外战报");
  const nextMetadata = record(nextMilitary.metadata, "military-policy.military.metadata");
  const sourceMetadata = record(sourceMilitary.metadata, "military-policy.sourceMap.military.metadata");
  for (const field of ["events", "eventSequence", "eventArchiveGeneration"]) assertDeepEqual(nextMetadata[field], sourceMetadata[field], "military-policy-events-invalid", `军事策略结果改变了战报元数据 ${field}`);
  assertDeepEqual(unrelatedMilitaryRecords(nextMilitary.campaigns, stateId, "military-policy.campaigns"), unrelatedMilitaryRecords(sourceMilitary.campaigns, stateId, "military-policy.sourceMap.campaigns"), "military-policy-campaign-scope-invalid", "军事策略结果改变了请求国家之外的战役");
  assertDeepEqual(unrelatedMilitaryRecords(nextMilitary.fronts, stateId, "military-policy.fronts"), unrelatedMilitaryRecords(sourceMilitary.fronts, stateId, "military-policy.sourceMap.fronts"), "military-policy-front-scope-invalid", "军事策略结果改变了请求国家之外的战线");
  for (const field of new Set([...Object.keys(sourceMilitary), ...Object.keys(nextMilitary)])) {
    if (!["campaigns", "fronts", "metadata", "events"].includes(field)) assertDeepEqual(nextMilitary[field], sourceMilitary[field], "military-policy-root-scope-invalid", `军事策略结果改变了请求外军事字段 ${field}`);
  }
  const mutableMetadata = new Set(["statesWithMilitary", "regiments", "troops", "navalRegiments", "campaigns", "fronts", "statuses", "buildMs"]);
  for (const field of new Set([...Object.keys(sourceMetadata), ...Object.keys(nextMetadata)])) {
    if (!mutableMetadata.has(field)) assertDeepEqual(nextMetadata[field], sourceMetadata[field], "military-policy-root-scope-invalid", `军事策略结果改变了请求外军事 metadata ${field}`);
  }
}

function unrelatedMilitaryRecords(value: unknown, stateId: number, path: string): unknown[] {
  return array(value ?? [], path).filter((item, index) => {
    const row = record(item, `${path}.${index}`);
    return Number(row.attacker) !== stateId && Number(row.defender) !== stateId;
  });
}

function economyView(sourceMapValue: unknown): UnknownRecord {
  const source = record(sourceMapValue, "economy.sourceMap");
  const pack = record(source.pack, "economy.sourceMap.pack");
  const politics = record(source.politics, "economy.sourceMap.politics");
  const settlements = record(source.settlements, "economy.sourceMap.settlements");
  return {
    pack: {cells: {
      i: record(pack.cells, "economy.sourceMap.pack.cells").i,
      c: record(pack.cells, "economy.sourceMap.pack.cells").c,
      state: record(pack.cells, "economy.sourceMap.pack.cells").state,
      market: record(pack.cells, "economy.sourceMap.pack.cells").market
    }, goods: pack.goods, markets: pack.markets, deals: pack.deals, burgs: pack.burgs, states: pack.states, provinces: pack.provinces},
    politics: {states: politics.states, provinces: politics.provinces},
    settlements: {cities: settlements.cities},
    economy: source.economy
  };
}

function applyOperations(target: UnknownRecord, operations: Map<string, UnknownRecord>): void {
  const owned = new WeakSet<object>([target]);
  for (const [path, row] of operations) {
    const parts = path.split(".");
    let owner: UnknownRecord = target;
    for (let index = 0; index < parts.length - 1; index++) {
      const key = parts[index];
      const value = owner[key];
      if (!value || typeof value !== "object") {
        const created = {};
        owner[key] = created;
        owned.add(created);
        owner = created;
        continue;
      }
      if (owned.has(value)) {
        owner = value as UnknownRecord;
        continue;
      }
      const copy = cloneContainer(value);
      owner[key] = copy;
      owned.add(copy);
      owner = copy as UnknownRecord;
    }
    const key = parts.at(-1) as string;
    if (row.exists === true) owner[key] = row.value;
    else delete owner[key];
  }
}

function cloneContainer(value: object): object {
  if (Array.isArray(value)) return [...value];
  if (isTypedArray(value)) return structuredClone(value);
  if (isPlainRecord(value)) return {...value};
  return {};
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

function assertAllowedKeys(value: UnknownRecord, allowed: ReadonlySet<string>, code: string, message: string): void {
  if (Object.keys(value).some(key => !allowed.has(key))) throw protocolError(code, message);
}

function adaptBinding(kind: EconomyDiplomacyMilitaryWorkerKind, source: LegacyBinding): ComputeOperationBinding {
  const operationId = `${kind}:${source.operationId}`;
  return validateOperationBinding({bindingPhase: "pre-commit", bindingKind: "compute", operationId, transactionId: `${source.mapIdentity}:${operationId}:${source.mapRevision}:${source.topologyRevision}:${source.generationToken}`, operationName: source.operationName || `${kind}.compute`, sourceRevision: adaptLegacyInteractiveRevision({mapIdentity: source.mapIdentity, mapRevision: source.mapRevision, topologyRevision: source.topologyRevision, domainRevisions: {[kind]: source.mapRevision}}), generationToken: source.generationToken, lockFingerprint: source.lockFingerprint}, "world-systems.binding.core") as ComputeOperationBinding;
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
  if (["pack.deals", "economy.deals", "economy.metadata"].includes(path)) return true;
  if (/^pack\.cells\.market\.\d+$/u.test(path)) return true;
  const match = /^(pack\.(?:goods|markets|burgs|states|provinces)|politics\.(?:states|provinces)|settlements\.cities|economy\.(?:goods|markets))\.(\d+)(?:\.([^.]+))?$/u.exec(path);
  if (!match) return false;
  return Boolean(match[3] && economyIndexedFields.get(match[1])?.has(match[3]) === true);
}

function readNestedPath(root: UnknownRecord, path: string): unknown {
  let value: unknown = root;
  for (const part of path.split(".")) {
    if (!isPlainRecord(value) || !Object.prototype.hasOwnProperty.call(value, part)) return undefined;
    value = value[part];
  }
  return value;
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
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === left.length && rightSet.size === right.length && left.every(value => rightSet.has(value));
}

function pathAncestors(parts: readonly string[]): string[] {
  const result: string[] = [];
  let path = "";
  for (let index = 0; index < parts.length - 1; index++) {
    path = path ? `${path}.${parts[index]}` : parts[index];
    result.push(path);
  }
  return result;
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
  if (isTypedArray(left) && isTypedArray(right)) {
    if (left.byteLength !== right.byteLength) return false;
    const leftBytes = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
    const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
    return leftBytes.every((value, index) => value === rightBytes[index]);
  }
  if (seen.get(left) === right) return true;
  seen.set(left, right);
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameDataPair((left as UnknownRecord)[key], (right as UnknownRecord)[key], seen));
}

function isCanonicalTree(value: unknown, visiting = new WeakSet<object>(), done = new WeakSet<object>()): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (!value || typeof value !== "object" || value instanceof DataView || value instanceof Map || value instanceof Set || value instanceof Date) return false;
  if (isTypedArray(value)) return true;
  if (!Array.isArray(value) && !isPlainRecord(value)) return false;
  if (done.has(value)) return true;
  if (visiting.has(value)) return false;
  visiting.add(value);
  const valid = Object.entries(value).every(([key, child]) => !["__proto__", "prototype", "constructor"].includes(key) && isCanonicalTree(child, visiting, done));
  visiting.delete(value);
  if (valid) done.add(value);
  return valid;
}

function protocolError(code: string, message: string): Error & {code: string} {
  const error = new Error(message) as Error & {code: string};
  error.code = code;
  return error;
}
