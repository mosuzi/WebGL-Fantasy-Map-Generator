export const API_VERSION = "1.0.0";
export const API_STABILITY = "stable";
export const API_CAPABILITY_SCHEMA_VERSION = "1.0.0";
export const API_COMPATIBILITY_POLICY_VERSION = "1.0.0";

export const API_METHODS = Object.freeze({
  info: Object.freeze(["version", "capabilities", "describe", "mapSummary", "runtimeStats", "healthEvents"]),
  objects: Object.freeze(["types", "get", "list", "query"]),
  cells: Object.freeze(["get", "getAtPoint", "neighbors", "query", "locate", "scan", "actions", "inspectAction"]),
  regenerationLocks: Object.freeze(["list", "status", "inspect", "set", "setMany", "clearKind"]),
  generate: Object.freeze(["getOptions", "setOptions", "newMap", "rerollSeed", "regenerate"]),
  oceanCurrents: Object.freeze(["rename", "regenerate", "inspectWorldRebuild", "rebuildWorld", "cancelWorldRebuild"]),
  selection: Object.freeze(["get", "resolve", "select", "clear", "locate", "pick", "flash", "highlight", "clearHighlights", "startEditing", "stopEditing", "toggleEditing"]),
  layers: Object.freeze(["get", "listThemes", "setViewMode", "setVisible", "setTheme", "exportTheme", "importTheme", "createTheme", "updateTheme", "deleteTheme", "fitView", "setShowOceanHeight", "setSmoothCellBorders", "setShowHoverInfo", "setMaxCityLabels"]),
  units: Object.freeze(["get", "apply", "setDistanceUnit", "setAreaUnit", "setNumberAbbreviation", "setMapScale", "setPopulationScale", "setMilitaryScale", "setPrecipitationScale"]),
  climate: Object.freeze(["get", "getOptions", "getTemperature", "getPrecipitation", "getLatitude", "getAtmosphere", "getBiomes", "apply", "setLatitude", "setLatitudeRange", "setLongitudeRange", "setTemperature", "setPrecipitation", "setWind", "inspectDownstreamRebuild", "applyDownstreamRebuild"]),
  history: Object.freeze(["get", "stats", "peek", "undo", "redo"]),
  edit: Object.freeze([
    "notes.createStandalone", "notes.set", "notes.delete", "notes.import", "notes.deleteBatch",
    "measurements.save", "measurements.rename", "measurements.updatePoints", "measurements.delete", "measurements.import",
    "cities.add", "cities.inspectCreateAtCell", "cities.createAtCell", "cities.inspectDelete", "cities.delete", "cities.inspectMove", "cities.move", "cities.rename", "cities.setPopulation", "cities.inspectOwnerSync", "cities.syncOwner", "cities.setVisual", "cities.resetVisual",
    "provinces.add", "provinces.inspectCreateAtCell", "provinces.createAtCell", "provinces.inspectDelete", "provinces.delete", "provinces.rename", "provinces.setColor", "provinces.applyChanges",
    "states.add", "states.inspectCreateAtCell", "states.createAtCell", "states.inspectDelete", "states.delete", "states.inspectMerge", "states.merge", "states.inspectSplit", "states.split", "states.rename", "states.setColor", "states.setGovernment", "states.inspectCapitalChange", "states.setCapital", "states.setGovernmentBatch", "states.applyChanges",
    "height.inspectChanges", "height.applyChanges", "height.inspectGlobalTransform", "height.applyGlobalTransform", "height.inspectTerrainTemplate", "height.applyTerrainTemplate", "height.inspectTerrainProgram", "height.applyTerrainProgram", "height.inspectRangeTransform", "height.applyRangeTransform", "height.inspectSelectionSmoothing", "height.applySelectionSmoothing", "height.inspectSeafloorReset", "height.applySeafloorReset", "height.rebuildBaseDerived", "height.rebuildDownstreamDerived", "height.rebuildAllDerived", "biomes.inspectAssignment", "biomes.assignCells", "biomes.inspectSuitability", "biomes.applySuitability", "population.inspectAdjustment", "population.applyAdjustment", "population.inspectTransfer", "population.transfer", "diplomacy.inspectRelation", "diplomacy.setRelation",
    "economy.inspectAssignment", "economy.assignCells", "economy.rebuild", "economy.setGoodDisplay", "economy.setMarketDisplay",
    "military.inspectRatios", "military.setRatios", "military.inspectStatus", "military.setStatus", "military.setStatusBatch", "military.inspectMoveStation", "military.moveStation", "military.inspectBase", "military.setBase", "military.recordBattleEvent", "military.importBattleEvents", "military.clearBattleEvents", "military.rename",
    "zones.inspectCreate", "zones.create", "zones.inspectDelete", "zones.delete", "zones.setStyle",
    "cultures.inspectLifecycle", "cultures.add", "cultures.assignCells", "cultures.inspectExpansion", "cultures.applyExpansion", "cultures.delete", "cultures.rename", "cultures.setColor", "cultures.setParent",
    "religions.inspectLifecycle", "religions.add", "religions.assignCells", "religions.inspectExpansion", "religions.applyExpansion", "religions.delete", "religions.rename", "religions.setColor", "religions.setParent",
    "routes.create", "routes.inspectEdit", "routes.update", "routes.inspectDelete", "routes.delete", "routes.setNote", "rivers.inspectCreate", "rivers.create", "rivers.inspectDelete", "rivers.delete", "rivers.rename", "rivers.setWidthFactor", "rivers.setNote", "lakes.inspectCreate", "lakes.create", "lakes.inspectOutlet", "lakes.setOutlet", "lakes.inspectDelete", "lakes.delete", "lakes.rename", "features.inspectPatch", "features.applyPatch", "features.inspectTopology", "features.applyTopology",
    "labels.getStyles", "labels.setStyle", "labels.resetStyle", "labels.resetStyles", "labels.setLayout", "labels.setPositionLock", "labels.addCustom", "labels.delete", "labels.moveCustom", "labels.renameCustom", "labels.setNote", "labels.restore",
    "markers.add", "markers.delete", "markers.move", "markers.setNote", "markers.setVisual"
  ]),
  data: Object.freeze(["exportAll", "exportMap", "exportGEO", "exportFeatureGEO", "exportCompressedAll", "exportPNG", "exportNotes", "exportMeasurements", "exportImportDiagnostic", "saveBrowserMap", "restoreBrowserMap", "inspectCollectionImport", "importMap", "importGEO", "importHeightmap"]),
  namebases: Object.freeze(["list", "export", "import", "create", "copyBuiltin", "update", "delete", "clear", "bind", "renameObjects"]),
  debug: Object.freeze(["enable", "disable", "snapshot", "dumpState", "renderer", "health", "profileNextRender"])
});

export const CONFIRM_REQUIRED_METHODS = Object.freeze([
  "generate.regenerate",
  "generate.newMap",
  "generate.rerollSeed",
  "oceanCurrents.rebuildWorld",
  "data.importMap",
  "data.importGEO",
  "data.importHeightmap",
  "data.restoreBrowserMap",
  "namebases.delete",
  "namebases.clear",
  "namebases.renameObjects",
  "climate.applyDownstreamRebuild",
  "edit.height.rebuildBaseDerived",
  "edit.height.rebuildDownstreamDerived",
  "edit.height.rebuildAllDerived",
  "edit.height.applySeafloorReset",
  "edit.notes.deleteBatch",
  "edit.cities.delete",
  "edit.provinces.delete",
  "edit.states.delete",
  "edit.cultures.delete",
  "edit.religions.delete",
  "edit.rivers.delete",
  "edit.lakes.delete",
  "edit.military.clearBattleEvents",
  "edit.economy.assignCells",
  "edit.economy.rebuild",
  "edit.states.merge",
  "edit.states.split",
  "edit.features.applyTopology",
  "edit.population.transfer"
]);

const STABILITY_LEVELS = Object.freeze({
  stable: "同一主版本内保持调用路径和既有语义兼容",
  experimental: "允许在小版本中调整，不应作为长期扩展依赖",
  deprecated: "继续兼容但不建议新调用，只允许在下一个主版本移除"
});

const CAPABILITY_GROUPS = Object.freeze({
  "runtime.read": {title: "运行时只读", access: "read"},
  "objects.read": {title: "地图对象发现", access: "read"},
  "cells.read": {title: "地图单元只读", access: "read"},
  "regeneration-locks.control": {title: "重生成对象锁定", access: "write"},
  "map.generate": {title: "地图生成", access: "write"},
  "ocean-currents.control": {title: "洋流", access: "write"},
  "selection.control": {title: "选择与定位", access: "control"},
  "display.control": {title: "显示与单位", access: "control"},
  "climate.control": {title: "气候", access: "write"},
  "history.control": {title: "编辑历史", access: "write"},
  "map.edit": {title: "地图编辑", access: "write"},
  "data.export": {title: "数据导出", access: "export"},
  "data.import": {title: "数据导入", access: "import"},
  "namebases.read": {title: "名称库只读", access: "read"},
  "namebases.manage": {title: "名称库管理", access: "write"},
  "debug.inspect": {title: "调试只读", access: "read"},
  "debug.control": {title: "调试控制", access: "control"}
});

const COMPATIBILITY_ALIASES = Object.freeze([
  Object.freeze({
    alias: "window.api",
    target: "window.webglGeneratorApi",
    kind: "root",
    status: "deprecated",
    since: "0.1.0",
    removeNotBefore: "2.0.0",
    installCondition: "only-if-unoccupied"
  }),
  Object.freeze({
    alias: "data.exportAll",
    target: "data.exportMap",
    kind: "method",
    status: "deprecated",
    since: "0.1.0",
    removeNotBefore: "2.0.0"
  })
]);

const EXPERIMENTAL_NAMESPACES = new Set(["debug"]);
const READONLY_DEBUG_METHODS = new Set(["snapshot", "dumpState", "renderer", "health"]);
const READONLY_NAMEBASE_METHODS = new Set(["list", "export"]);

export function buildApiVersionContract() {
  return {
    apiVersion: API_VERSION,
    stability: API_STABILITY,
    capabilitySchemaVersion: API_CAPABILITY_SCHEMA_VERSION,
    compatibilityPolicyVersion: API_COMPATIBILITY_POLICY_VERSION
  };
}

export function buildApiContract(methods, rawMetadata) {
  validateRawMetadata(methods, rawMetadata);
  const methodMetadata = {};
  const stabilitySummary = {stable: 0, experimental: 0, deprecated: 0};

  for (const [namespace, methodNames] of Object.entries(methods || {})) {
    methodMetadata[namespace] = {};
    for (const method of methodNames) {
      const qualifiedName = `${namespace}.${method}`;
      const metadata = rawMetadata[namespace][method];
      const alias = COMPATIBILITY_ALIASES.find(item => item.kind === "method" && item.alias === qualifiedName);
      const stability = alias ? "deprecated" : EXPERIMENTAL_NAMESPACES.has(namespace) ? "experimental" : "stable";
      const enriched = {
        ...metadata,
        stable: stability,
        stability,
        since: stability === "stable" ? API_VERSION : metadata.since || "0.1.0",
        capabilityGroup: resolveCapabilityGroup(namespace, method)
      };
      if (alias) {
        enriched.deprecated = {
          replacement: alias.target,
          removeNotBefore: alias.removeNotBefore
        };
      }
      methodMetadata[namespace][method] = enriched;
      stabilitySummary[stability] += 1;
    }
  }

  return {
    contract: {
      ...buildApiVersionContract(),
      stabilityLevels: {...STABILITY_LEVELS},
      stableCompatibility: "same-major",
      deprecatedRemoval: "next-major-only"
    },
    capabilityGroups: cloneRecord(CAPABILITY_GROUPS),
    compatibility: {
      aliases: COMPATIBILITY_ALIASES.map(alias => ({...alias})),
      stableCompatibility: "same-major",
      deprecatedRemoval: "next-major-only"
    },
    methodMetadata,
    stabilitySummary
  };
}

export function groupQualifiedMethodNames(methods) {
  return methods.reduce((groups, qualifiedName) => {
    const [namespace, ...parts] = qualifiedName.split(".");
    const method = parts.join(".");
    if (!namespace || !method) return groups;
    groups[namespace] ||= [];
    groups[namespace].push(method);
    return groups;
  }, {});
}

function validateRawMetadata(methods, rawMetadata) {
  const requiredFields = ["stable", "mutates", "undoable", "async", "requiresConfirm"];
  for (const [namespace, methodNames] of Object.entries(methods || {})) {
    const namespaceMetadata = rawMetadata?.[namespace];
    if (!namespaceMetadata) throw new Error(`API 命名空间缺少原始元数据：${namespace}`);
    const declared = new Set(methodNames);
    for (const method of methodNames) {
      const metadata = namespaceMetadata[method];
      if (!metadata) throw new Error(`API 方法缺少原始元数据：${namespace}.${method}`);
      for (const field of requiredFields) {
        if (!Object.prototype.hasOwnProperty.call(metadata, field)) throw new Error(`API 方法元数据缺少 ${field}：${namespace}.${method}`);
      }
      const requiresConfirm = CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`);
      if (Boolean(metadata.requiresConfirm) !== requiresConfirm) throw new Error(`API 方法确认策略不一致：${namespace}.${method}`);
    }
    for (const method of Object.keys(namespaceMetadata)) {
      if (!declared.has(method)) throw new Error(`API 原始元数据存在未声明方法：${namespace}.${method}`);
    }
  }
  for (const namespace of Object.keys(rawMetadata || {})) {
    if (!Object.prototype.hasOwnProperty.call(methods || {}, namespace)) throw new Error(`API 原始元数据存在未声明命名空间：${namespace}`);
  }
}

function resolveCapabilityGroup(namespace, method) {
  if (namespace === "info") return "runtime.read";
  if (namespace === "objects") return "objects.read";
  if (namespace === "cells") return "cells.read";
  if (namespace === "regenerationLocks") return "regeneration-locks.control";
  if (namespace === "generate") return "map.generate";
  if (namespace === "oceanCurrents") return "ocean-currents.control";
  if (namespace === "selection") return "selection.control";
  if (namespace === "layers" || namespace === "units") return "display.control";
  if (namespace === "climate") return "climate.control";
  if (namespace === "history") return "history.control";
  if (namespace === "edit") return "map.edit";
  if (namespace === "data") return /^(import|restore)/.test(method) ? "data.import" : "data.export";
  if (namespace === "namebases") return READONLY_NAMEBASE_METHODS.has(method) ? "namebases.read" : "namebases.manage";
  if (namespace === "debug") return READONLY_DEBUG_METHODS.has(method) ? "debug.inspect" : "debug.control";
  throw new Error(`API 方法缺少能力分组：${namespace}.${method}`);
}

function cloneRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, {...value}]));
}
