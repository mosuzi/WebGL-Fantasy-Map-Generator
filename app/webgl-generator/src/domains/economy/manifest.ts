import type {DomainModuleManifest} from "../../core/contracts/domain-module.js";

export const ECONOMY_WORKER_WRITE_SET = Object.freeze([
  "pack.cells.market", "pack.goods", "pack.markets", "pack.deals", "pack.burgs", "pack.states", "pack.provinces",
  "politics.states", "politics.provinces", "settlements.cities", "economy.goods", "economy.markets", "economy.deals", "economy.metadata"
] as const);

const VERIFY = "regress:economy-diplomacy-military-core-protocol";
const commands = ["assignCells", "rebuild", "setGoodDisplay", "setMarketDisplay"] as const;

export const economyManifest = {
  id: "economy",
  version: 1,
  status: "shadow",
  canonicalSections: ["economy", "pack", "politics", "settlements", "metadata"],
  derivedSystems: [{id: "economy.market-projection", reads: ["economy", "pack.goods", "pack.markets", "pack.deals", "pack.cells.market", "settlements.cities"], writes: [], invalidatedBy: ["economy", "pack.goods", "pack.markets", "pack.deals", "pack.cells.market", "settlements.cities"], invalidates: ["economy-demand", "point-layers", "line-layers", "labels", "picking", "object-panels", "object-index"], scope: "full-map", rebuild: "worker", reuseAcrossPresentation: true, verify: VERIFY}],
  commands: commands.map(id => ({id: `economy.${id}`, writeSet: id.startsWith("set") ? ["economy", "pack"] : ["economy", "pack", "politics", "settlements"], undoPolicy: "required" as const, profiles: ["interactive" as const]})),
  workerTasks: [{id: "economy.mutation-worker", task: "economy.compute", resultKinds: ["economy"], writeSet: ECONOMY_WORKER_WRITE_SET, bindingPolicy: "pre-commit", patchPolicy: "domain-policy-required"}],
  queries: [
    {id: "economy.inspectAssignment", reads: ["economy", "pack.markets", "pack.cells.market"], profiles: ["interactive", "headless"]},
    {id: "economy.tradeQuery", reads: ["economy", "pack.goods", "pack.markets", "pack.deals"], profiles: ["interactive", "headless"]}
  ],
  views: [{id: "economy.market-view", reads: ["economy", "pack.markets", "pack.cells.market"], presentationOnly: true}],
  layers: [{id: "economy.trade-layer", reads: ["economy.deals", "pack.deals", "pack.markets"], geometrySource: "derived", picking: true, export: true}],
  panels: [{id: "economy.panel", commands: commands.map(id => `economy.${id}`), queries: ["economy.inspectAssignment", "economy.tradeQuery"], selectionKind: "economy-market"}],
  persistence: {schemaVersion: 2, migration: "map-document-v1-v2", backfill: "economy-pack-mirror", oldSample: "tools/fixtures/webgl-map-v1-minimal.json"},
  locks: {kinds: ["economy-market", "trade-flow", "state", "province", "city"], policy: "regeneration-lock-protection"},
  regression: {gates: [VERIFY, "regress:economy-worker-task", "regress:economy-display-edit", "regress:economy-trade-query", "regress:regeneration-lock-economy"], coverage: ["save", "undo", "worker", "view", "layer", "failure"]},
  capabilities: {worker: "required", regeneration: "unsupported", view: "required", renderLayer: "required"},
  capabilityReasons: {regeneration: "经济链由 economy.rebuild 命令和资源重生成共同驱动，不是 generate.regenerate 的独立 result kind。"}
} as const satisfies DomainModuleManifest;
