import {issueCellInspectionToken} from "./cell-inspection-token.js";

const ACTION_ROWS = Object.freeze([
  row("height.applyCells", "高度笔刷", "grid cell set + changes + range", "cells.inspectAction:height.applyCells", "edit.height.applyChanges", "height:brush"),
  row("states.assignCells", "国家归属笔刷", "grid cell set + changes", "cells.inspectAction:states.assignCells", "edit.states.applyChanges", "state:brush"),
  row("states.createAtCell", "新增国家", "grid CellRef", "edit.states.inspectCreateAtCell", "edit.states.createAtCell", "state:add", {legacy: "edit.states.add"}),
  row("states.delete", "删除国家", "state ref or picked CellRef", "cells.inspectAction:states.delete", "edit.states.delete", "state:delete", {requiresConfirm: true}),
  row("provinces.assignCells", "省份归属笔刷", "grid cell set + changes", "cells.inspectAction:provinces.assignCells", "edit.provinces.applyChanges", "province:brush"),
  row("provinces.createAtCell", "新增省份", "grid CellRef", "edit.provinces.inspectCreateAtCell", "edit.provinces.createAtCell", "province:add", {legacy: "edit.provinces.add"}),
  row("provinces.delete", "删除省份", "province ref or picked CellRef", "cells.inspectAction:provinces.delete", "edit.provinces.delete", "province:delete", {requiresConfirm: true}),
  row("cities.createAtCell", "新增城市", "grid CellRef", "edit.cities.inspectCreateAtCell", "edit.cities.createAtCell", "city:add", {legacy: "edit.cities.add"}),
  row("cities.delete", "删除城市", "city ref or picked CellRef", "cells.inspectAction:cities.delete", "edit.cities.delete", "city:delete", {requiresConfirm: true}),
  row("cities.move", "移动城市", "city ref + grid or pack CellRef", "edit.cities.inspectMove", "edit.cities.move", "city:move"),
  row("cultures.assignCells", "文化归属笔刷", "culture ref + grid cell set", "cells.inspectAction:cultures.assignCells", "edit.cultures.assignCells", "culture:assign"),
  row("religions.assignCells", "宗教归属笔刷", "religion ref + grid cell set", "cells.inspectAction:religions.assignCells", "edit.religions.assignCells", "religion:assign"),
  row("cultures.setCenter", "设置文化中心", "culture ref + pack CellRef", "edit.cultures.inspectExpansion", "edit.cultures.applyExpansion", "culture:center"),
  row("religions.setCenter", "设置宗教中心", "religion ref + pack CellRef", "edit.religions.inspectExpansion", "edit.religions.applyExpansion", "religion:center"),
  row("biomes.assignCells", "生物群系归属笔刷", "biome ref + grid cell set", "cells.inspectAction:biomes.assignCells", "edit.biomes.assignCells", "biome:assign"),
  row("biomes.applySuitability", "适居度笔刷", "grid cell set + changes", "edit.biomes.inspectSuitability", "edit.biomes.applySuitability", "biome:suitability"),
  row("economy.assignMarketCells", "市场归属笔刷", "market ref + pack cell set", "edit.economy.inspectAssignment", "edit.economy.assignCells", "economy:market-assign", {requiresConfirm: true}),
  row("measurements.savePath", "保存测量路径", "world point path", "cells.inspectAction:measurements.savePath", "edit.measurements.save", "measurement:draw"),
  row("markers.createAtCell", "新增标记", "pack CellRef + marker options", "cells.inspectAction:markers.createAtCell", "edit.markers.add", "marker:add"),
  row("markers.move", "移动标记", "marker ref + pack CellRef", "cells.inspectAction:markers.move", "edit.markers.move", "marker:move"),
  row("routes.createPath", "绘制路线", "pack-cell path or endpoint pair", "cells.inspectAction:routes.createPath", "edit.routes.create", "route:draw"),
  row("routes.editWaypoint", "编辑路线途经点", "route ref + pack CellRef", "edit.routes.inspectEdit", "edit.routes.update", "route:edit-waypoint"),
  row("rivers.createAtCell", "新增河流", "source pack CellRef", "cells.inspectAction:rivers.createAtCell", "edit.rivers.create", "river:add"),
  row("lakes.excavateAtCell", "开挖湖泊", "pack CellRef + radius", "cells.inspectAction:lakes.excavateAtCell", "edit.lakes.create", "lake:excavate"),
  row("features.applyPatch", "应用 Feature 补丁", "pack CellRef + radius + patch mode", "edit.features.inspectPatch", "edit.features.applyPatch", "feature:patch-select"),
  row("features.applyTopology", "应用 Feature 拓扑", "grid cell set + topology operation", "edit.features.inspectTopology", "edit.features.applyTopology", "feature:topology-select", {requiresConfirm: true}),
  row("zones.createAtCell", "新增地区", "center pack CellRef + radius", "cells.inspectAction:zones.createAtCell", "edit.zones.create", "zone:add"),
  row("notes.createAtCell", "新增备注", "pack CellRef or world point", "cells.inspectAction:notes.createAtCell", "edit.notes.createStandalone", "note:add"),
  row("labels.placeCustom", "放置手工标签", "world point + label options", "cells.inspectAction:labels.placeCustom", "edit.labels.addCustom + edit.labels.moveCustom", null, {directId: "DM-08"}),
  row("labels.moveCustom", "移动手工标签", "label ref + world point", "cells.inspectAction:labels.moveCustom", "edit.labels.moveCustom", null, {directId: "DM-09"}),
  row("measurements.movePoint", "移动测量控制点", "measurement ref + point index + world point", "cells.inspectAction:measurements.movePoint", "edit.measurements.updatePoints", null, {directId: "DM-10"}),
  row("measurements.deletePointByPointer", "指针删除测量控制点", "measurement ref + point index", "cells.inspectAction:measurements.deletePointByPointer", "edit.measurements.updatePoints", null, {directId: "DM-11"}),
  row("measurements.deletePointByKeyboard", "键盘删除测量控制点", "measurement ref + point index", "cells.inspectAction:measurements.deletePointByKeyboard", "edit.measurements.updatePoints", null, {directId: "DM-12"}),
  row("measurements.updatePath", "更新测量路径", "measurement ref + world point path", "cells.inspectAction:measurements.updatePath", "edit.measurements.updatePoints", null, {directId: "DM-13"})
]);

const ACTION_REGISTRY = new Map(ACTION_ROWS.map(item => [item.actionId, Object.freeze(item)]));

export function listCellActions() {
  return ACTION_ROWS.map(action => cloneJson(action));
}

export function getCellAction(actionId) {
  const action = ACTION_REGISTRY.get(String(actionId || "").trim());
  return action ? cloneJson(action) : null;
}

export function inspectCellAction(map, revision, actionId, input, options = {}, context = {}) {
  const action = ACTION_REGISTRY.get(String(actionId || "").trim());
  if (!action) return refusal("action-not-inspectable", "动作没有登记在 Cell inspector registry。", {actionId: String(actionId || "")});
  const normalizedInput = cloneJson(input ?? {});
  const structural = inspectSpatialInput(map, normalizedInput);
  if (!structural.allowed) return {...structural, action: cloneJson(action), normalizedInput};
  const actionSpecific = inspectActionSpecificStructure(action.actionId, normalizedInput, structural.details);
  if (!actionSpecific.allowed) return {...actionSpecific, action: cloneJson(action), normalizedInput};

  const delegated = typeof context.delegate === "function"
    ? context.delegate(action, normalizedInput, cloneJson(options || {}))
    : null;
  const inspection = delegated ? normalizeDelegatedInspection(delegated) : {
    allowed: true,
    code: "ok",
    summary: "空间输入结构有效；执行时仍由登记的领域命令复核业务规则。",
    details: {spatialRefs: structural.details.spatialRefs},
    warnings: action.inspectTarget.startsWith("cells.inspectAction:")
      ? []
      : [{code: "delegated-domain-inspector", target: action.inspectTarget}]
  };
  const token = issueCellInspectionToken(revision, action.actionId, normalizedInput);
  return {
    ...inspection,
    action: cloneJson(action),
    normalizedInput,
    inspectionLevel: action.inspectTarget.startsWith("cells.inspectAction:") ? "spatial-input" : "delegated-domain",
    semanticLayer: "editor-primitive",
    compoundRulesCovered: false,
    ...token
  };
}

function inspectSpatialInput(map, input) {
  if (input === null || typeof input !== "object") return refusal("invalid-input", "动作输入必须是 JSON 对象。");
  const refs = [];
  collectCellRefs(input, refs);
  for (const ref of refs) {
    const count = ref.space === "grid"
      ? Math.max(Number(map?.grid?.cells?.i?.length || 0), Number(map?.grid?.cells?.v?.length || 0))
      : Math.max(Number(map?.pack?.cells?.i?.length || 0), Number(map?.pack?.cells?.v?.length || 0));
    if (ref.id < 0 || ref.id >= count) return refusal("cell-not-found", `找不到 ${ref.space} cell #${ref.id}。`, {ref});
  }
  const points = [];
  collectWorldPoints(input, points);
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return refusal("point-invalid", "动作包含无效世界坐标。");
  return {allowed: true, code: "ok", summary: "空间输入结构有效。", details: {spatialRefs: refs, worldPoints: points.length}};
}

function inspectActionSpecificStructure(actionId, input, spatial) {
  const refs = spatial.spatialRefs || [];
  const worldPoints = Number(spatial.worldPoints) || 0;
  const nonEmpty = key => Array.isArray(input[key]) && input[key].length > 0;
  const hasId = keys => keys.some(key => {
    const direct = input[key];
    if (Number.isSafeInteger(Number(direct)) && Number(direct) >= 0) return true;
    const object = input[key.replace(/Id$/u, "")];
    return object && Number.isSafeInteger(Number(object.id)) && Number(object.id) >= 0;
  });
  const gridRefs = refs.filter(ref => ref.space === "grid");
  const packRefs = refs.filter(ref => ref.space === "pack");

  if (["height.applyCells", "states.assignCells", "provinces.assignCells", "cultures.assignCells", "religions.assignCells", "biomes.assignCells", "biomes.applySuitability"].includes(actionId)) {
    if (!gridRefs.length && !nonEmpty("cells") && !nonEmpty("changes")) return refusal("invalid-input", "动作缺少非空 Grid Cell 集合或 changes。");
  } else if (actionId === "economy.assignMarketCells") {
    if ((!packRefs.length && !nonEmpty("cells") && !nonEmpty("changes")) || !hasId(["marketId", "market"])) return refusal("invalid-input", "市场归属动作缺少市场和 Pack Cell 集合。");
  } else if (["states.createAtCell", "provinces.createAtCell", "cities.createAtCell"].includes(actionId)) {
    if (!gridRefs.length) return refusal("invalid-input", "createAtCell 必须提供 Grid CellRef。");
  } else if (["states.delete", "provinces.delete", "cities.delete"].includes(actionId)) {
    const domain = actionId.split(".")[0].replace(/s$/u, "");
    if (!refs.length && !hasId([`${domain}Id`, "id"])) return refusal("invalid-input", "删除动作缺少对象引用或 CellRef。");
  } else if (["cultures.setCenter", "religions.setCenter"].includes(actionId)) {
    if (!packRefs.length || !hasId([`${actionId.split(".")[0].replace(/s$/u, "")}Id`, "id"])) return refusal("invalid-input", "中心动作缺少对象 ID 或 Pack CellRef。");
  } else if (actionId === "cities.move") {
    if (!refs.length || !hasId(["cityId", "id"])) return refusal("invalid-input", "城市移动缺少城市 ID 或目标 CellRef。");
  } else if (["measurements.savePath", "routes.createPath"].includes(actionId)) {
    if (refs.length < 2 && worldPoints < 2 && !hasPath(input)) return refusal("invalid-input", "路径动作至少需要两个点或 CellRef。");
  } else if (["markers.createAtCell", "rivers.createAtCell", "lakes.excavateAtCell", "zones.createAtCell"].includes(actionId)) {
    if (!packRefs.length) return refusal("invalid-input", "动作必须提供 Pack CellRef。");
  } else if (actionId === "notes.createAtCell") {
    if (!packRefs.length && worldPoints < 1) return refusal("invalid-input", "备注动作必须提供 Pack CellRef 或世界点。");
  } else if (["markers.move", "routes.editWaypoint", "features.applyPatch"].includes(actionId)) {
    if (!packRefs.length || !hasId(["markerId", "routeId", "featureId", "id"])) return refusal("invalid-input", "动作缺少对象 ID 或 Pack CellRef。");
  } else if (actionId === "features.applyTopology") {
    if (!gridRefs.length && !nonEmpty("cells") && !nonEmpty("changes")) return refusal("invalid-input", "Feature 拓扑动作缺少 Grid Cell 集合。");
  } else if (["labels.placeCustom", "labels.moveCustom"].includes(actionId)) {
    if (worldPoints < 1) return refusal("invalid-input", "标签动作必须提供世界点。");
    if (actionId === "labels.moveCustom" && !hasId(["labelId", "id"])) return refusal("invalid-input", "标签移动缺少标签 ID。");
  } else if (["measurements.movePoint", "measurements.deletePointByPointer", "measurements.deletePointByKeyboard"].includes(actionId)) {
    if (!hasId(["measurementId", "id"]) || !hasId(["pointIndex", "index"])) return refusal("invalid-input", "测量控制点动作缺少测量 ID 或点索引。");
    if (actionId === "measurements.movePoint" && worldPoints < 1) return refusal("invalid-input", "测量点移动缺少世界点。");
  } else if (actionId === "measurements.updatePath") {
    if (!hasId(["measurementId", "id"]) || (worldPoints < 2 && !hasPath(input))) return refusal("invalid-input", "测量路径更新缺少测量 ID 或有效路径。");
  }
  return {allowed: true, code: "ok", summary: "动作输入结构有效。", details: spatial};
}

function hasPath(input) {
  const path = input.path || input.points || input.waypoints;
  return Array.isArray(path) && path.length >= 2;
}

function collectCellRefs(value, output, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value) && (value.space === "grid" || value.space === "pack") && Number.isSafeInteger(Number(value.id))) {
    output.push({space: value.space, id: Number(value.id)});
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectCellRefs(child, output, seen);
}

function collectWorldPoints(value, output, key = "", seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value) && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && (!key || /(point|position|center|start|end|path)/i.test(key))) {
    output.push({x: Number(value.x), y: Number(value.y)});
  }
  for (const [childKey, child] of Object.entries(value)) collectWorldPoints(child, output, Array.isArray(value) ? key : childKey, seen);
}

function normalizeDelegatedInspection(value) {
  const source = value && typeof value === "object" ? cloneJson(value) : {};
  const allowed = source.allowed ?? source.valid ?? source.executable ?? source.canApply ?? false;
  return {
    ...source,
    allowed: Boolean(allowed),
    code: String(source.code || (allowed ? "ok" : "business-rule-rejected")),
    summary: String(source.summary || source.message || (allowed ? "允许执行。" : "领域规则拒绝执行。")),
    details: source.details || {}
  };
}

function refusal(code, summary, details = {}) {
  return {allowed: false, code, summary, details, warnings: []};
}

function row(actionId, title, inputSpace, inspectTarget, executeTarget, modeId = null, options = {}) {
  return {
    actionId,
    title,
    inputSpace,
    inspectTarget,
    executeTarget,
    modeId,
    directId: options.directId || null,
    businessCodes: ["ok", "invalid-input", "cell-not-found", "point-invalid", "business-rule-rejected"],
    mutates: "map",
    requiresConfirm: Boolean(options.requiresConfirm),
    undoable: true,
    rollback: "snapshot-or-command-revert",
    async: false,
    requiresRevision: true,
    legacy: options.legacy || null,
    semanticLayer: "editor-primitive",
    compoundRulesCovered: false
  };
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}
