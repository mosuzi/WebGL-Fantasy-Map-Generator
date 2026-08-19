import {createHash} from "node:crypto";
import {apiCall} from "./api-result.js";
import {createApplyHeightBrushCommand} from "./height-edit-commands.js";
import {createHeightSelectionSmoothingPlan} from "./height-selection-smoothing.js";
import {createHeadlessMapApi, loadHeadlessMapDocument} from "./headless-map-api.js";
import {parseMapDocument, stringifyMapDocument} from "./map-file-io.js";
import {createRenameObjectCommand} from "./object-edit-commands.js";
import {getObjectSnapshot} from "./object-query-api.js";
import {buildPopulationAdjustmentPlan, createApplyPopulationAdjustmentCommand, inspectPopulationAdjustment} from "./population-adjustment-commands.js";
import {captureWholeMapPersistedIdentity, validateHeadlessWriteCommit} from "./whole-map-profile-protocol.js";

export const HEADLESS_WRITE_VERSION = "1.0.0";
export const HEADLESS_WRITE_METHODS = Object.freeze([
  "edit.population.inspectAdjustment",
  "edit.population.applyAdjustment",
  "edit.height.inspectSelectionSmoothing",
  "edit.height.applySelectionSmoothing",
  "edit.objects.inspectRename",
  "edit.objects.applyRename"
]);

const REQUEST_LIMIT = 100;
const AUTHORIZATION_KEYS = new Set(["documentId", "expectedRevision", "inspectionToken", "requestId"]);
const RENAMEABLE_OBJECT_KINDS = new Set(["state", "province", "culture", "religion", "river", "lake", "city", "marker", "note"]);

export function createHeadlessWriteSession(document, options = {}) {
  let currentDocument = cloneDocument(document);
  const initialIdentity = readIdentity(currentDocument);
  const documentId = initialIdentity.documentId || `headless-${digest(stringifyMapDocument(currentDocument)).slice(0, 24)}`;
  let revision = initialIdentity.revision;
  const requestResults = loadRequestResults(currentDocument);
  const history = new HeadlessHistory({limit: options.historyLimit, baseStats: initialIdentity.history});
  const faultInjector = typeof options.faultInjector === "function" ? options.faultInjector : null;

  return Object.freeze({
    version: HEADLESS_WRITE_VERSION,
    runtime: "headless-write",
    get documentId() {
      return documentId;
    },
    get revision() {
      return revision;
    },
    history,
    getDocument: () => cloneDocument(currentDocument),
    getReadApi: () => createHeadlessMapApi(currentDocument),
    inspect: (method, args = []) => apiCall(() => inspectAction(method, args), metadata(method)),
    apply: (method, args = [], authorization = {}) => apiCall(() => applyAction(method, args, authorization), metadata(method)),
    invoke: (method, args = [], authorization = {}) => isInspectMethod(method)
      ? apiCall(() => inspectAction(method, args), metadata(method))
      : apiCall(() => applyAction(method, args, authorization), metadata(method))
  });

  function metadata(method) {
    return {runtime: "headless-write", method, documentId, revision};
  }

  function inspectAction(method, args) {
    const action = buildAction(currentDocument.map, method, args);
    if (!action.inspection.valid) return {...action.inspection, documentId, revision, executeMethod: action.executeMethod, inspectionToken: null};
    const inspectionToken = createInspectionToken(documentId, revision, action);
    return {...action.inspection, documentId, revision, executeMethod: action.executeMethod, inspectionToken};
  }

  function applyAction(method, args, authorization) {
    if (isInspectMethod(method)) throw codedError("headless_method_unsupported", `apply 只接受执行方法：${method}`);
    const executeMethod = normalizeExecuteMethod(method);
    if (!executeMethod) throw codedError("headless_method_unsupported", `无头写入不支持方法：${method}`);
    const auth = normalizeAuthorization(authorization);
    if (auth.documentId !== documentId) throw codedError("headless_document_mismatch", "请求绑定的地图文档不匹配", {documentId, revision});
    if (!auth.requestId) throw codedError("headless_request_id_required", "无头写请求必须提供 requestId");
    const requestSignature = digest(stableStringify({executeMethod, args, documentId, expectedRevision: auth.expectedRevision}));
    const cached = requestResults.get(auth.requestId);
    if (cached) {
      if (cached.signature !== requestSignature) throw codedError("headless_request_id_conflict", "同一 requestId 已用于不同请求");
      return {...clonePlain(cached.result), replayed: true};
    }
    if (auth.expectedRevision !== revision) throw codedError("headless_revision_mismatch", "地图 revision 已变化，请重新预检", {documentId, revision});
    const action = buildAction(currentDocument.map, executeMethod, args);
    const expectedToken = createInspectionToken(documentId, revision, action);
    if (!auth.inspectionToken) throw codedError("headless_inspection_required", "请先调用对应 inspect 方法并提供 inspectionToken");
    if (auth.inspectionToken !== expectedToken) throw codedError("headless_inspection_stale", "inspectionToken 已过期或与当前输入不匹配", {documentId, revision});
    if (!action.inspection.valid) throw codedError(action.inspection.code || "headless_inspection_invalid", action.inspection.reason || action.inspection.notice || "无头写入预检失败", action.inspection);

    const before = stringifyMapDocument(currentDocument);
    const beforeIdentity = captureWholeMapPersistedIdentity(currentDocument);
    const revisionBefore = revision;
    const historySizeBefore = history.entries.length;
    try {
      const context = {map: currentDocument.map};
      if (action.command.isNoop?.(context)) throw codedError("headless_noop", "该操作不会改变地图");
      action.command.apply(context);
      faultInjector?.("after-command", {method: executeMethod, documentId, revision});
      revision += 1;
      const result = {
        executed: true,
        replayed: false,
        method: executeMethod,
        documentId,
        revisionBefore,
        revisionAfter: revision,
        command: {
          label: action.command.label,
          domain: action.command.domain || "none",
          affected: clonePlain(action.command.effects?.affected || []),
          result: clonePlain(action.command.getResult?.() ?? null)
        },
        inspection: {...compactInspection(action.inspection), inspectionToken: expectedToken}
      };
      requestResults.set(auth.requestId, {signature: requestSignature, result: clonePlain(result)});
      persistHeadlessMetadata(currentDocument, {documentId, revision, requestResults, history});
      const after = stringifyMapDocument(currentDocument);
      history.record({before, after, result});
      persistHeadlessMetadata(currentDocument, {documentId, revision, requestResults, history});
      validateHeadlessWriteCommit({
        documentId,
        revisionBefore,
        revisionAfter: revision,
        beforeIdentity,
        afterDocument: currentDocument,
        result
      });
      return result;
    } catch (error) {
      currentDocument = parseMapDocument(before);
      revision = revisionBefore;
      requestResults.delete(auth.requestId);
      history.truncate(historySizeBefore);
      throw error;
    }
  }
}

export class HeadlessHistory {
  constructor({limit = 20, baseStats = null} = {}) {
    this.limit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    this.entries = [];
    this.baseStats = {
      transactions: Number.isSafeInteger(Number(baseStats?.transactions)) ? Number(baseStats.transactions) : 0,
      lastLabel: String(baseStats?.lastLabel || "none"),
      lastDomain: String(baseStats?.lastDomain || "none"),
      lastRevision: Number.isSafeInteger(Number(baseStats?.lastRevision)) ? Number(baseStats.lastRevision) : null
    };
  }

  record({before, after, result}) {
    this.entries.push({before, after, result: clonePlain(result)});
    if (this.entries.length > this.limit) this.entries.shift();
  }

  getStats() {
    const last = this.entries.at(-1)?.result;
    return {
      transactions: this.baseStats.transactions + this.entries.length,
      limit: this.limit,
      lastLabel: last?.command?.label || this.baseStats.lastLabel,
      lastDomain: last?.command?.domain || this.baseStats.lastDomain,
      lastRevision: last?.revisionAfter ?? this.baseStats.lastRevision
    };
  }

  truncate(size) {
    this.entries.length = Math.max(0, Math.min(this.entries.length, Number(size) || 0));
  }
}

export function loadHeadlessWriteDocument(input) {
  return loadHeadlessMapDocument(input);
}

function buildAction(map, method, args) {
  if (!Array.isArray(args)) throw codedError("invalid_argument", "无头写入 arguments 必须是数组");
  const executeMethod = normalizeExecuteMethod(method);
  if (!executeMethod) throw codedError("headless_method_unsupported", `无头写入不支持方法：${method}`);
  if (executeMethod === "edit.population.applyAdjustment") {
    const [target, rawOptions = {}] = args;
    const options = semanticOptions(rawOptions);
    const inspection = inspectPopulationAdjustment(map, target, options);
    const plan = inspection.valid ? buildPopulationAdjustmentPlan(map, target, options) : null;
    return {executeMethod, semanticInput: {target, options}, inspection, plan, command: plan ? createApplyPopulationAdjustmentCommand(plan, {label: options.label || "无头区域人口增减"}) : null};
  }
  if (executeMethod === "edit.height.applySelectionSmoothing") {
    const [rawOptions = {}] = args;
    const options = semanticOptions(rawOptions);
    const plan = createHeightSelectionSmoothingPlan(map, options);
    const inspection = {
      ...plan.inspection,
      code: plan.inspection.valid ? "ok" : "headless_height_inspection_invalid",
      reason: plan.inspection.valid ? "" : plan.inspection.notice
    };
    return {executeMethod, semanticInput: options, inspection, plan: plan.changes, command: inspection.valid ? createApplyHeightBrushCommand(plan.changes, {label: options.label || "无头高度选区平滑"}) : null};
  }
  const [reference, rawName, rawOptions = {}] = args;
  const options = semanticOptions(rawOptions);
  const name = String(rawName || "").trim();
  let object = null;
  try {
    object = getObjectSnapshot(map, reference);
  } catch (error) {
    const inspection = {valid: false, code: error.code || "object_not_found", reason: error.message, reference: clonePlain(reference)};
    return {executeMethod, semanticInput: {reference, name, options}, inspection, plan: null, command: null};
  }
  const valid = Boolean(name) && object.name !== name;
  const supported = RENAMEABLE_OBJECT_KINDS.has(object.kind);
  const inspection = {
    valid: supported && valid,
    code: supported ? valid ? "ok" : name ? "headless_noop" : "invalid_name" : "headless_object_kind_unsupported",
    reason: supported ? valid ? "" : name ? "对象名称没有变化" : "名称不能为空" : `对象类型 ${object.kind} 不支持重命名`,
    reference: {kind: object.kind, id: object.id},
    before: object.name,
    after: name
  };
  return {executeMethod, semanticInput: {reference: inspection.reference, name, options}, inspection, plan: null, command: inspection.valid ? createRenameObjectCommand(inspection.reference, name) : null};
}

function normalizeExecuteMethod(method) {
  const value = String(method || "");
  const mapping = {
    "edit.population.inspectAdjustment": "edit.population.applyAdjustment",
    "edit.population.applyAdjustment": "edit.population.applyAdjustment",
    "edit.height.inspectSelectionSmoothing": "edit.height.applySelectionSmoothing",
    "edit.height.applySelectionSmoothing": "edit.height.applySelectionSmoothing",
    "edit.objects.inspectRename": "edit.objects.applyRename",
    "edit.objects.applyRename": "edit.objects.applyRename"
  };
  return mapping[value] || "";
}

function isInspectMethod(method) {
  return String(method || "").includes(".inspect");
}

function createInspectionToken(documentId, revision, action) {
  return `headless-v1-${digest(stableStringify({documentId, revision, method: action.executeMethod, input: action.semanticInput, inspection: action.inspection, plan: action.plan})).slice(0, 32)}`;
}

function normalizeAuthorization(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw codedError("headless_authorization_required", "无头写入必须提供授权元数据");
  const expectedRevision = Number(value.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw codedError("headless_revision_required", "expectedRevision 必须是非负整数");
  return {
    documentId: String(value.documentId || ""),
    expectedRevision,
    inspectionToken: String(value.inspectionToken || ""),
    requestId: String(value.requestId || "").trim()
  };
}

function semanticOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !AUTHORIZATION_KEYS.has(key)));
}

function readIdentity(document) {
  const metadata = document?.metadata?.headlessWrite;
  const revision = Number(metadata?.revision);
  return {
    documentId: typeof metadata?.documentId === "string" ? metadata.documentId : "",
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    history: metadata?.history || null
  };
}

function loadRequestResults(document) {
  const result = new Map();
  for (const entry of document?.metadata?.headlessWrite?.requests || []) {
    if (!entry?.requestId || !entry?.signature || !entry?.result) continue;
    result.set(String(entry.requestId), {signature: String(entry.signature), result: clonePlain(entry.result)});
  }
  return result;
}

function persistHeadlessMetadata(document, {documentId, revision, requestResults, history}) {
  document.metadata ||= {};
  document.metadata.headlessWrite = {
    version: 1,
    documentId,
    revision,
    updatedAt: new Date().toISOString(),
    history: history.getStats(),
    requests: [...requestResults.entries()].slice(-REQUEST_LIMIT).map(([requestId, entry]) => ({requestId, signature: entry.signature, result: clonePlain(entry.result)}))
  };
  document.exportedAt = new Date().toISOString();
}

function cloneDocument(document) {
  if (!document || typeof document !== "object") throw codedError("invalid_document", "必须提供地图文档对象");
  return parseMapDocument(stringifyMapDocument(document));
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function compactInspection(inspection) {
  const result = clonePlain(inspection);
  for (const key of ["packCells", "cityIds", "changedPackCells", "changedCityIds", "changes"]) delete result?.[key];
  return result;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function codedError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}
