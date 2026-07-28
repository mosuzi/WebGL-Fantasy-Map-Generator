import {inspectBiomeAssignment} from "./biome-edit-commands.js";
import {inspectDeleteImpact} from "./delete-impact.js";
import {inspectLakeCreation} from "./lake-edit-commands.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {inspectRiverCreation} from "./river-edit-commands.js";
import {
  RULE_INSPECTION_CODE,
  createRuleInspectionResult,
  normalizeRuleInspectionInput,
  validateRuleInspectionToken
} from "./rule-inspection-token.js";
import {inspectZoneCreation} from "./zone-edit-commands.js";

export const EXISTING_RULE_ACTION = Object.freeze({
  HEIGHT_EDIT_REGION: "terrain.edit-height-region",
  RIVER_CREATE: "hydrology.create-river",
  RIVER_DELETE: "hydrology.delete-river",
  LAKE_EXCAVATE: "hydrology.excavate-lake",
  LAKE_DELETE: "hydrology.delete-lake",
  BIOME_ASSIGN: "ecology.assign-biome",
  STATE_DELETE: "politics.delete-state",
  PROVINCE_DELETE: "politics.delete-province",
  CITY_DELETE: "settlement.delete-city",
  ROUTE_DELETE: "infrastructure.delete-route",
  ZONE_MANAGE: "infrastructure.manage-zone"
});

const DELETE_KIND_BY_ACTION = Object.freeze({
  [EXISTING_RULE_ACTION.RIVER_DELETE]: OBJECT_KIND.RIVER,
  [EXISTING_RULE_ACTION.LAKE_DELETE]: OBJECT_KIND.LAKE,
  [EXISTING_RULE_ACTION.STATE_DELETE]: OBJECT_KIND.STATE,
  [EXISTING_RULE_ACTION.PROVINCE_DELETE]: OBJECT_KIND.PROVINCE,
  [EXISTING_RULE_ACTION.CITY_DELETE]: OBJECT_KIND.CITY,
  [EXISTING_RULE_ACTION.ROUTE_DELETE]: OBJECT_KIND.ROUTE
});

export function inspectExistingRuleAction(map, revision, actionId, input) {
  const normalizedInput = normalizeRuleInspectionInput(input);
  const evaluation = evaluateExistingRuleAction(map, actionId, normalizedInput);
  return createRuleInspectionResult(revision, actionId, normalizedInput, evaluation);
}

export function assertExistingRuleInspection(revision, actionId, input, options = {}) {
  const hasInspectionMetadata = options && typeof options === "object" && (
    Object.hasOwn(options, "inspectionToken")
    || Object.hasOwn(options, "expectedRevision")
    || Object.hasOwn(options, "inspectorSchemaVersion")
  );
  if (!hasInspectionMetadata) return {valid: true, code: "legacy-call", legacy: true};
  const validation = validateRuleInspectionToken(
    revision,
    options?.inspectionToken,
    actionId,
    input,
    options?.expectedRevision
  );
  if (!validation.valid) {
    const error = new Error(validation.summary || "规则事务预检无效");
    error.code = validation.code || RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID;
    error.details = {actionId, snapshot: validation.snapshot};
    throw error;
  }
  return {...validation, legacy: false};
}

export function stripRuleInspectionMetadata(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return options;
  const normalized = {...options};
  delete normalized.inspectionToken;
  delete normalized.expectedRevision;
  delete normalized.inspectorSchemaVersion;
  return normalized;
}

function evaluateExistingRuleAction(map, actionId, input) {
  if (actionId === EXISTING_RULE_ACTION.HEIGHT_EDIT_REGION) return inspectHeightChanges(map, input);
  if (actionId === EXISTING_RULE_ACTION.RIVER_CREATE) {
    return fromDomainInspection(inspectRiverCreation(map, input.options || {}), {
      fallbackSummary: "河流创建预检",
      affected: preview => (preview.path || []).map(id => ({kind: "pack-cell", id}))
    });
  }
  if (actionId === EXISTING_RULE_ACTION.LAKE_EXCAVATE) {
    return fromDomainInspection(inspectLakeCreation(map, input.options || {}), {
      fallbackSummary: "湖泊开挖预检",
      affected: preview => (preview.packCells || []).map(id => ({kind: "pack-cell", id}))
    });
  }
  if (actionId === EXISTING_RULE_ACTION.BIOME_ASSIGN) {
    return fromDomainInspection(
      inspectBiomeAssignment(map, input.biomeId, input.gridCellIds, input.options || {}),
      {
        fallbackSummary: "生物群系分配预检",
        affected: preview => (preview.gridCells || input.gridCellIds || []).map(id => ({kind: "grid-cell", id}))
      }
    );
  }
  if (actionId === EXISTING_RULE_ACTION.ZONE_MANAGE) return inspectZoneManagement(map, input);
  const deleteKind = DELETE_KIND_BY_ACTION[actionId];
  if (deleteKind) return inspectDeletion(map, deleteKind, input);
  throw inspectionError("action-not-inspectable", `未登记的已有规则动作：${actionId}`);
}

function inspectHeightChanges(map, input) {
  const changes = input?.changes;
  if (!Array.isArray(changes) || !changes.length) {
    return rejected("height-changes-empty", "高度编辑至少需要一个变更");
  }
  const count = map?.grid?.cells?.h?.length || 0;
  const seen = new Set();
  const normalized = [];
  for (const change of changes) {
    const gridCell = Number(change?.gridCell ?? change?.cell);
    const after = Number(change?.after ?? change?.height);
    if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= count) {
      return rejected("height-cell-invalid", "高度编辑包含无效 grid cell");
    }
    if (!Number.isFinite(after) || after < 0 || after > 100) {
      return rejected("height-value-invalid", "高度必须是 0～100 的有限数字");
    }
    if (seen.has(gridCell)) return rejected("height-cell-duplicate", "高度编辑不能重复包含同一 grid cell");
    seen.add(gridCell);
    normalized.push({gridCell, after});
  }
  const changed = normalized.filter(item => Number(map.grid.cells.h[item.gridCell]) !== item.after);
  if (!changed.length) return rejected("height-no-change", "目标高度与当前地图一致");
  return {
    allowed: true,
    code: "ok",
    summary: `可更新 ${changed.length} 个 grid cells 的高度`,
    affected: changed.map(item => ({kind: "grid-cell", id: item.gridCell})),
    requiresConfirm: false
  };
}

function inspectDeletion(map, kind, input) {
  const id = Number(input?.id);
  const preview = inspectDeleteImpact(map, kind, [id]);
  if (!preview.valid) {
    const first = preview.skipped?.[0];
    return rejected(`delete-${first?.code || "not-allowed"}`, first?.reason || preview.summary || "对象不可删除");
  }
  return {
    allowed: true,
    code: "ok",
    summary: preview.summary,
    affected: preview.deleteIds.map(targetId => ({kind, id: targetId})),
    requiresConfirm: Boolean(preview.requiresConfirm)
  };
}

function inspectZoneManagement(map, input) {
  if (input?.operation === "create") {
    return fromDomainInspection(inspectZoneCreation(map, input.options || {}), {
      fallbackSummary: "地区创建预检",
      affected: preview => (preview.packCells || []).map(id => ({kind: "pack-cell", id}))
    });
  }
  if (input?.operation === "delete") {
    const preview = inspectDeleteImpact(map, OBJECT_KIND.ZONE, [Number(input.id)]);
    if (!preview.valid) {
      const first = preview.skipped?.[0];
      return rejected(`delete-${first?.code || "not-allowed"}`, first?.reason || "地区不可删除");
    }
    return {
      allowed: true,
      code: "ok",
      summary: preview.summary,
      affected: preview.deleteIds.map(id => ({kind: OBJECT_KIND.ZONE, id})),
      requiresConfirm: Boolean(preview.requiresConfirm)
    };
  }
  return rejected("zone-operation-invalid", "地区管理 operation 必须是 create 或 delete");
}

function fromDomainInspection(preview, {fallbackSummary, affected}) {
  const allowed = preview?.valid === true;
  if (!allowed) return rejected(normalizeDomainCode(preview?.code), preview?.reason || preview?.summary || fallbackSummary);
  return {
    allowed: true,
    code: "ok",
    summary: preview?.summary || preview?.reason || fallbackSummary,
    affected: affected(preview || {}),
    requiresConfirm: false
  };
}

function rejected(code, summary) {
  return {
    allowed: false,
    code: normalizeDomainCode(code),
    summary,
    affected: [],
    requiresConfirm: false
  };
}

function normalizeDomainCode(code) {
  const normalized = String(code || "rule-rejected").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return /^[a-z]/.test(normalized) ? normalized : `rule-${normalized || "rejected"}`;
}

function inspectionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
