export const API_VERSION = "1.0.0";
export const API_STABILITY = "stable";
export const API_CAPABILITY_SCHEMA_VERSION = "1.0.0";
export const API_COMPATIBILITY_POLICY_VERSION = "1.0.0";

export const API_METHODS = Object.freeze({
  info: Object.freeze(["version", "capabilities", "mapSummary", "runtimeStats", "healthEvents"]),
  generate: Object.freeze(["getOptions", "setOptions", "newMap", "rerollSeed", "regenerate"]),
  selection: Object.freeze(["get", "resolve", "select", "clear", "locate", "pick", "flash", "highlight", "clearHighlights", "startEditing", "stopEditing", "toggleEditing"]),
  layers: Object.freeze(["get", "listThemes", "setViewMode", "setVisible", "setTheme", "exportTheme", "importTheme", "createTheme", "updateTheme", "deleteTheme", "fitView", "setShowOceanHeight", "setSmoothCellBorders", "setShowHoverInfo", "setMaxCityLabels"]),
  units: Object.freeze(["get", "apply", "setDistanceUnit", "setAreaUnit", "setNumberAbbreviation", "setMapScale", "setPopulationScale", "setMilitaryScale", "setPrecipitationScale"]),
  climate: Object.freeze(["get", "getOptions", "getTemperature", "getPrecipitation", "getLatitude", "getAtmosphere", "getBiomes", "apply", "setLatitude", "setLatitudeRange", "setLongitudeRange", "setTemperature", "setPrecipitation", "setWind", "inspectDownstreamRebuild", "applyDownstreamRebuild"]),
  history: Object.freeze(["get", "stats", "peek", "undo", "redo"]),
  edit: Object.freeze([
    "notes.createStandalone", "notes.set", "notes.delete", "notes.import", "notes.deleteBatch",
    "measurements.save", "measurements.rename", "measurements.updatePoints", "measurements.delete", "measurements.import",
    "cities.add", "cities.delete", "cities.inspectMove", "cities.move", "cities.rename", "cities.setPopulation", "cities.syncOwner", "cities.setVisual", "cities.resetVisual",
    "provinces.add", "provinces.delete", "provinces.rename", "provinces.setColor", "provinces.applyChanges",
    "states.add", "states.delete", "states.inspectMerge", "states.merge", "states.inspectSplit", "states.split", "states.rename", "states.setColor", "states.setGovernment", "states.setCapital", "states.setGovernmentBatch", "states.applyChanges",
    "height.applyChanges", "height.rebuildBaseDerived", "height.rebuildDownstreamDerived", "biomes.assignCells", "diplomacy.setRelation",
    "economy.inspectAssignment", "economy.assignCells", "economy.rebuild",
    "military.setRatios", "military.setStatus", "military.setStatusBatch", "military.moveStation", "military.setBase", "military.recordBattleEvent", "military.importBattleEvents", "military.clearBattleEvents", "military.rename",
    "zones.create", "zones.delete", "zones.setStyle",
    "cultures.add", "cultures.assignCells", "cultures.delete", "cultures.rename", "cultures.setColor", "cultures.setParent",
    "religions.add", "religions.assignCells", "religions.delete", "religions.rename", "religions.setColor", "religions.setParent",
    "routes.create", "routes.inspectEdit", "routes.update", "routes.delete", "routes.setNote", "rivers.create", "rivers.delete", "rivers.rename", "rivers.setWidthFactor", "rivers.setNote", "lakes.create", "lakes.inspectOutlet", "lakes.setOutlet", "lakes.delete", "lakes.rename", "features.inspectPatch", "features.applyPatch",
    "labels.addCustom", "labels.delete", "labels.moveCustom", "labels.renameCustom", "labels.setNote", "labels.restore",
    "markers.add", "markers.delete", "markers.move", "markers.setNote", "markers.setVisual"
  ]),
  data: Object.freeze(["exportAll", "exportMap", "exportGEO", "exportFeatureGEO", "exportCompressedAll", "exportPNG", "exportNotes", "exportMeasurements", "exportImportDiagnostic", "saveBrowserMap", "restoreBrowserMap", "importMap", "importGEO", "importHeightmap"]),
  namebases: Object.freeze(["list", "export", "import", "create", "copyBuiltin", "update", "delete", "clear", "bind", "renameObjects"]),
  debug: Object.freeze(["enable", "disable", "snapshot", "dumpState", "renderer", "health", "profileNextRender"])
});

export const CONFIRM_REQUIRED_METHODS = Object.freeze([
  "generate.regenerate",
  "generate.newMap",
  "generate.rerollSeed",
  "data.importMap",
  "data.importGEO",
  "data.importHeightmap",
  "data.restoreBrowserMap",
  "namebases.clear",
  "namebases.renameObjects",
  "climate.applyDownstreamRebuild",
  "edit.height.rebuildBaseDerived",
  "edit.height.rebuildDownstreamDerived",
  "edit.economy.assignCells",
  "edit.economy.rebuild",
  "edit.states.merge",
  "edit.states.split"
]);

const STABILITY_LEVELS = Object.freeze({
  stable: "同一主版本内保持调用路径和既有语义兼容",
  experimental: "允许在小版本中调整，不应作为长期扩展依赖",
  deprecated: "继续兼容但不建议新调用，只允许在下一个主版本移除"
});

const CAPABILITY_GROUPS = Object.freeze({
  "runtime.read": {title: "运行时只读", access: "read"},
  "map.generate": {title: "地图生成", access: "write"},
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
  if (namespace === "generate") return "map.generate";
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
