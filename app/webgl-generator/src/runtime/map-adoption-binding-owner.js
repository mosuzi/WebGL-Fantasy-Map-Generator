const ACTIVE_STATUSES = new Set(["request", "worker-pending", "loading", "committing"]);
const TARGET_IDENTITY_PATTERNS = Object.freeze({
  generation: /^generated:[1-9]\d*$/,
  import: /^imported:[1-9]\d*$/
});
const BINDING_KEYS = Object.freeze([
  "mapIdentity",
  "mapRevision",
  "topologyRevision",
  "generationToken",
  "lockFingerprint",
  "operationId",
  "operationName",
  "sourceFingerprint"
]);

export function createMapAdoptionBindingOwner({kind, targetMapIdentity, requestBinding, operationId}) {
  const ownerKind = String(kind || "");
  const targetIdentity = String(targetMapIdentity || "");
  const expectedPattern = TARGET_IDENTITY_PATTERNS[ownerKind];
  if (!expectedPattern?.test(targetIdentity)) {
    throw ownerError("map_adoption_target_identity_invalid", "地图接纳临时 identity 无效");
  }
  const request = normalizeBinding(requestBinding, "request");
  const ownerOperationId = normalizeNonNegativeInteger(operationId, "operationId");
  if (request.operationId !== ownerOperationId) {
    throw ownerError("map_adoption_operation_mismatch", "地图接纳 operation 与请求 binding 不一致");
  }

  let status = "request";
  let workerSessionId = "";
  let committedBinding = null;
  let terminalReason = "";

  return Object.freeze({
    currentBinding(candidateOperationId = null) {
      if (!ACTIVE_STATUSES.has(status)) return null;
      if (candidateOperationId !== null && candidateOperationId !== undefined
        && Number(candidateOperationId) !== ownerOperationId) return null;
      return committedBinding || request;
    },

    acceptWorkerResult({sessionId, binding, targetMapIdentity: resultTargetIdentity}) {
      assertStatus(status, "request", "worker-result");
      const session = nonEmptyString(sessionId, "sessionId");
      const returned = normalizeBinding(binding, "worker.binding");
      if (!sameBinding(returned, request)) {
        throw ownerError("map_adoption_worker_binding_mismatch", "地图接纳 Worker binding 与请求不一致");
      }
      if (String(resultTargetIdentity || "") !== targetIdentity) {
        throw ownerError("map_adoption_render_identity_mismatch", "地图接纳 renderer identity 与目标不一致");
      }
      workerSessionId = session;
      status = "worker-pending";
      return snapshot();
    },

    beginLoad({sessionId, targetMapIdentity: loadTargetIdentity}) {
      assertStatus(status, "worker-pending", "load");
      if (String(sessionId || "") !== workerSessionId) {
        throw ownerError("map_adoption_session_mismatch", "地图接纳 load session 与 Worker 不一致");
      }
      if (String(loadTargetIdentity || "") !== targetIdentity) {
        throw ownerError("map_adoption_render_identity_mismatch", "地图接纳 load identity 与目标不一致");
      }
      status = "loading";
      return snapshot();
    },

    beginCommit(binding) {
      assertStatus(status, "loading", "commit");
      const committed = normalizeBinding(binding, "commit.binding");
      if (committed.operationId !== ownerOperationId || committed.operationName !== request.operationName) {
        throw ownerError("map_adoption_operation_mismatch", "地图接纳 commit operation 与请求不一致");
      }
      if (committed.generationToken !== request.generationToken) {
        throw ownerError("map_adoption_generation_token_mismatch", "地图接纳 commit generation token 与请求不一致");
      }
      if (committed.mapRevision !== 0 || committed.topologyRevision !== 0) {
        throw ownerError("map_adoption_commit_revision_invalid", "地图接纳正式 binding 必须从 revision 0 开始");
      }
      committedBinding = committed;
      status = "committing";
      return snapshot();
    },

    commit() {
      assertStatus(status, "committing", "committed");
      status = "committed";
      terminalReason = "committed";
      return snapshot();
    },

    invalidate(reason = "invalidated") {
      if (!ACTIVE_STATUSES.has(status)) return snapshot();
      status = "invalidated";
      terminalReason = String(reason || "invalidated");
      return snapshot();
    },

    invalidateForOperation(candidateOperationId, reason = "invalidated") {
      const candidate = normalizeNonNegativeInteger(candidateOperationId, "candidateOperationId");
      if (candidate !== ownerOperationId) return snapshot();
      if (!ACTIVE_STATUSES.has(status)) return snapshot();
      status = "invalidated";
      terminalReason = String(reason || "invalidated");
      return snapshot();
    },

    snapshot
  });

  function snapshot() {
    return Object.freeze({
      kind: ownerKind,
      targetMapIdentity: targetIdentity,
      operationId: ownerOperationId,
      status,
      workerSessionId,
      requestBinding: request,
      committedBinding,
      terminalReason
    });
  }
}

export function finalizeCommittedMapAdoptionInstall(preparedInstall) {
  const finalize = preparedInstall?.finalize;
  if (typeof finalize !== "function") return Object.freeze({finalized: false, skipped: true, error: null});
  try {
    finalize.call(preparedInstall);
    return Object.freeze({finalized: true, skipped: false, error: null});
  } catch (error) {
    return Object.freeze({finalized: false, skipped: false, error});
  }
}

function normalizeBinding(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw ownerError("map_adoption_binding_invalid", `${path} 必须是 binding 对象`);
  }
  const binding = {
    mapIdentity: nonEmptyString(value.mapIdentity, `${path}.mapIdentity`),
    mapRevision: normalizeNonNegativeInteger(value.mapRevision, `${path}.mapRevision`),
    topologyRevision: normalizeNonNegativeInteger(value.topologyRevision, `${path}.topologyRevision`),
    generationToken: normalizeNonNegativeInteger(value.generationToken, `${path}.generationToken`),
    lockFingerprint: nonEmptyString(value.lockFingerprint, `${path}.lockFingerprint`),
    operationId: normalizeNonNegativeInteger(value.operationId, `${path}.operationId`),
    operationName: String(value.operationName || "")
  };
  if (typeof value.sourceFingerprint === "string" && value.sourceFingerprint) {
    binding.sourceFingerprint = value.sourceFingerprint;
  }
  return Object.freeze(binding);
}

function sameBinding(left, right) {
  return BINDING_KEYS.every(key => (left[key] ?? "") === (right[key] ?? ""));
}

function assertStatus(actual, expected, action) {
  if (actual !== expected) {
    throw ownerError("map_adoption_lifecycle_invalid", `地图接纳不能从 ${actual} 进入 ${action}`);
  }
}

function normalizeNonNegativeInteger(value, path) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw ownerError("map_adoption_binding_invalid", `${path} 必须是非负安全整数`);
  }
  return number;
}

function nonEmptyString(value, path) {
  const text = String(value || "");
  if (!text) throw ownerError("map_adoption_binding_invalid", `${path} 不能为空`);
  return text;
}

function ownerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
