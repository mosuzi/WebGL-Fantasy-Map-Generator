export const RULE_INSPECTOR_SCHEMA_VERSION = 1;

export const RULE_INSPECTION_CODE = Object.freeze({
  OK: "ok",
  INVALID_ARGUMENT: "invalid-argument",
  INSPECTION_REQUIRED: "inspection-required",
  INSPECTION_STALE: "inspection-stale",
  INSPECTION_TOKEN_INVALID: "inspection-token-invalid",
  INSPECTION_ACTION_MISMATCH: "inspection-action-mismatch",
  INSPECTION_INPUT_MISMATCH: "inspection-input-mismatch",
  INSPECTION_SCHEMA_MISMATCH: "inspection-schema-mismatch"
});

const TOKEN_VERSION = "rulei1";
const TOKEN_PATTERN = /^rulei1\.([0-9a-z]+)\.([0-9a-f]{8})\.([0-9a-f]{8})\.([0-9a-z]+)\.([0-9a-f]{8})$/;
const ACTION_ID_PATTERN = /^[a-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)*$/;
const BUSINESS_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const GENERIC_ACTION_IDS = new Set(["execute", "run", "dispatch", "invoke"]);

export function createRuleInspectionResult(revision, actionId, input, options = {}) {
  const normalizedActionId = normalizeActionId(actionId);
  const normalizedInput = normalizeRuleInspectionInput(input);
  const allowed = options.allowed !== false;
  const code = normalizeRuleBusinessCode(options.code ?? (allowed ? RULE_INSPECTION_CODE.OK : "rule-rejected"));
  if (allowed && code !== RULE_INSPECTION_CODE.OK) {
    throw contractError("允许执行的预检结果必须使用 ok code");
  }
  if (!allowed && code === RULE_INSPECTION_CODE.OK) {
    throw contractError("拒绝执行的预检结果必须提供非 ok 业务 code");
  }

  const summary = normalizeSummary(options.summary, allowed ? "规则事务预检通过" : "规则事务不允许执行");
  const affected = normalizeRuleInspectionInput(options.affected ?? []);
  const requiresConfirm = options.requiresConfirm === true;
  const schemaVersion = normalizeSchemaVersion(options.schemaVersion);
  const issued = issueRuleInspectionToken(revision, normalizedActionId, normalizedInput, {schemaVersion});

  return {
    allowed,
    code,
    summary,
    normalizedInput,
    affected,
    requiresConfirm,
    expectedRevision: issued.expectedRevision,
    inspectionToken: allowed ? issued.inspectionToken : null,
    inspectorSchemaVersion: schemaVersion
  };
}

export function issueRuleInspectionToken(revision, actionId, input, options = {}) {
  const snapshot = revisionSnapshot(revision);
  const normalizedActionId = normalizeActionId(actionId);
  const normalizedInput = normalizeRuleInspectionInput(input);
  const schemaVersion = normalizeSchemaVersion(options.schemaVersion);
  const actionHash = fingerprint(normalizedActionId);
  const inputHash = fingerprint(JSON.stringify(normalizedInput));
  const context = tokenContext(snapshot, schemaVersion, normalizedActionId, normalizedInput);
  const signature = sign(revision, context);
  return {
    inspectionToken: `${TOKEN_VERSION}.${schemaVersion.toString(36)}.${actionHash}.${inputHash}.${snapshot.mapRevision.toString(36)}.${signature}`,
    expectedRevision: snapshot,
    inspectorSchemaVersion: schemaVersion
  };
}

export function validateRuleInspectionToken(revision, token, actionId, input, expectedRevision, options = {}) {
  const snapshot = revisionSnapshot(revision);
  const expected = normalizeExpectedRevision(expectedRevision);
  if (!expected || expected.mapIdentity !== snapshot.mapIdentity || expected.mapRevision !== snapshot.mapRevision) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_STALE, "地图版本已变化，请重新预检", snapshot);
  }
  if (typeof token !== "string" || token.length === 0) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_REQUIRED, "必须先完成规则事务预检", snapshot);
  }

  const match = TOKEN_PATTERN.exec(token);
  if (!match) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID, "预检令牌格式无效", snapshot);
  }

  const [, schemaText, actionHash, inputHash, revisionText, signature] = match;
  const tokenSchemaVersion = Number.parseInt(schemaText, 36);
  const expectedSchemaVersion = normalizeSchemaVersion(options.schemaVersion);
  if (tokenSchemaVersion !== expectedSchemaVersion) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_SCHEMA_MISMATCH, "预检契约版本不匹配，请重新预检", snapshot);
  }

  let normalizedActionId;
  let normalizedInput;
  try {
    normalizedActionId = normalizeActionId(actionId);
    normalizedInput = normalizeRuleInspectionInput(input);
  } catch (error) {
    return rejection(error?.code || RULE_INSPECTION_CODE.INVALID_ARGUMENT, error?.message || "规则事务输入无效", snapshot);
  }

  if (actionHash !== fingerprint(normalizedActionId)) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_ACTION_MISMATCH, "预检令牌不属于当前规则动作", snapshot);
  }
  if (inputHash !== fingerprint(JSON.stringify(normalizedInput))) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_INPUT_MISMATCH, "规则事务输入与预检不一致", snapshot);
  }
  if (Number.parseInt(revisionText, 36) !== snapshot.mapRevision) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_STALE, "地图版本已变化，请重新预检", snapshot);
  }

  const context = tokenContext(snapshot, tokenSchemaVersion, normalizedActionId, normalizedInput);
  let expectedSignature;
  try {
    expectedSignature = sign(revision, context);
  } catch {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID, "运行时缺少规则预检签名器", snapshot);
  }
  if (expectedSignature !== signature) {
    return rejection(RULE_INSPECTION_CODE.INSPECTION_TOKEN_INVALID, "预检令牌签名无效", snapshot);
  }
  return {
    valid: true,
    code: RULE_INSPECTION_CODE.OK,
    summary: "预检令牌有效",
    snapshot
  };
}

export function normalizeRuleInspectionInput(value) {
  return normalizeJsonValue(value, "$", new Set());
}

export function normalizeRuleBusinessCode(value) {
  const code = String(value ?? "").trim();
  if (!BUSINESS_CODE_PATTERN.test(code)) {
    throw contractError("业务 code 必须是稳定的小写字母、数字、连字符或下划线组合");
  }
  return code;
}

function normalizeJsonValue(value, path, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw contractError(`${path} 必须是有限 JSON 数字`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw contractError(`${path} 不是纯 JSON 值`);
  if (ancestors.has(value)) throw contractError(`${path} 包含循环引用`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const propertyNames = Object.getOwnPropertyNames(value);
      const unexpected = propertyNames.filter(key => key !== "length" && !isArrayIndex(key, value.length));
      if (unexpected.length) throw contractError(`${path} 不能包含非索引数组字段`);
      const normalized = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
          throw contractError(`${path}[${index}] 必须是可枚举的数据字段`);
        }
        normalized.push(normalizeJsonValue(descriptor.value, `${path}[${index}]`, ancestors));
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw contractError(`${path} 必须是普通 JSON 对象`);
    if (Object.getOwnPropertySymbols(value).length > 0) throw contractError(`${path} 不能包含 Symbol 字段`);

    const normalized = {};
    for (const key of Object.getOwnPropertyNames(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
        throw contractError(`${path}.${key} 必须是可枚举的数据字段`);
      }
      Object.defineProperty(normalized, key, {
        value: normalizeJsonValue(descriptor.value, `${path}.${key}`, ancestors),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeActionId(value) {
  const actionId = String(value ?? "").trim();
  if (!ACTION_ID_PATTERN.test(actionId)) throw contractError("actionId 必须是稳定的领域语义标识");
  if (GENERIC_ACTION_IDS.has(actionId)) throw contractError("actionId 必须指向领域动作，不能使用通用执行入口");
  return actionId;
}

function normalizeSummary(value, fallback) {
  const summary = String(value ?? fallback).trim();
  if (!summary) throw contractError("预检 summary 不能为空");
  return summary;
}

function normalizeSchemaVersion(value) {
  const schemaVersion = value === undefined ? RULE_INSPECTOR_SCHEMA_VERSION : Number(value);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw contractError("inspector schema version 必须是正安全整数");
  return schemaVersion;
}

function normalizeExpectedRevision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mapIdentity = value.mapIdentity === null || value.mapIdentity === undefined ? null : String(value.mapIdentity);
  const mapRevision = Number(value.mapRevision);
  if (!Number.isSafeInteger(mapRevision) || mapRevision < 0) return null;
  return {mapIdentity, mapRevision};
}

function revisionSnapshot(revision) {
  const snapshot = typeof revision?.getSnapshot === "function" ? revision.getSnapshot() : revision || {};
  return {
    mapIdentity: snapshot.mapIdentity === null || snapshot.mapIdentity === undefined ? null : String(snapshot.mapIdentity),
    mapRevision: Number.isSafeInteger(Number(snapshot.mapRevision)) && Number(snapshot.mapRevision) >= 0 ? Number(snapshot.mapRevision) : 0
  };
}

function tokenContext(snapshot, schemaVersion, actionId, normalizedInput) {
  return JSON.stringify({
    actionId,
    input: normalizedInput,
    mapIdentity: snapshot.mapIdentity,
    mapRevision: snapshot.mapRevision,
    schemaVersion
  });
}

function sign(revision, value) {
  if (typeof revision?.signCursor !== "function") throw contractError("缺少规则预检签名器");
  return revision.signCursor(`rule-inspection:${value}`);
}

function isArrayIndex(key, length) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function fingerprint(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function rejection(code, summary, snapshot) {
  return {valid: false, code, summary, snapshot};
}

function contractError(message) {
  const error = new Error(message);
  error.code = RULE_INSPECTION_CODE.INVALID_ARGUMENT;
  return error;
}
