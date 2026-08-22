export function normalizeRenderSourceBinding(value = {}, path = "renderSourceBinding") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bindingError(path, "render source binding 必须是对象");
  }
  if (value.mapIdentity !== undefined && value.runtimeMapSessionId !== undefined
    && value.mapIdentity !== value.runtimeMapSessionId) {
    throw bindingError(`${path}.mapIdentity`, "render resource binding 的 identity alias 不一致");
  }
  if (value.sourceRevision !== undefined && value.mapRevision !== undefined
    && value.sourceRevision !== value.mapRevision) {
    throw bindingError(`${path}.sourceRevision`, "render resource binding 的 revision alias 不一致");
  }
  const mapIdentity = nonEmptyString(value.mapIdentity ?? value.runtimeMapSessionId, `${path}.mapIdentity`);
  const sourceRevision = nonNegativeInteger(value.sourceRevision ?? value.mapRevision, `${path}.sourceRevision`);
  const topologyRevision = nonNegativeInteger(value.topologyRevision, `${path}.topologyRevision`);
  return Object.freeze({
    mapIdentity,
    mapRevision: sourceRevision,
    sourceRevision,
    topologyRevision
  });
}

export function normalizeRenderResourceBinding(value = {}, path = "renderResourceBinding") {
  const source = normalizeRenderSourceBinding(value, path);
  const renderPreparationId = nonEmptyString(value.renderPreparationId, `${path}.renderPreparationId`);
  const renderGeneration = nonNegativeInteger(value.renderGeneration, `${path}.renderGeneration`);
  return Object.freeze({...source, renderPreparationId, renderGeneration});
}

export function createRenderResourceBinding(source, {renderPreparationId, renderGeneration} = {}) {
  return normalizeRenderResourceBinding({
    ...source,
    ...(renderPreparationId === undefined ? {} : {renderPreparationId}),
    ...(renderGeneration === undefined ? {} : {renderGeneration})
  });
}

export function createRenderRequestSourceBinding(source, {
  sourceRevisionDelta = 0,
  topologyRevisionDelta = 0,
  replacesSurface = false,
  surfaceOwner = null
} = {}) {
  const normalized = normalizeRenderSourceBinding(source, "renderRequest.source");
  const sourceRevision = normalized.sourceRevision + nonNegativeInteger(sourceRevisionDelta, "renderRequest.sourceRevisionDelta");
  const requestedTopologyRevision = normalized.topologyRevision
    + nonNegativeInteger(topologyRevisionDelta, "renderRequest.topologyRevisionDelta");
  let topologyRevision = requestedTopologyRevision;
  if (!replacesSurface && surfaceOwner) {
    const surface = normalizeRenderResourceBinding(surfaceOwner, "renderRequest.surfaceOwner");
    if (surface.mapIdentity !== normalized.mapIdentity) {
      throw bindingError("renderRequest.surfaceOwner.mapIdentity", "局部 render request 与当前 surface identity 不一致");
    }
    topologyRevision = surface.topologyRevision;
  }
  return normalizeRenderSourceBinding({
    mapIdentity: normalized.mapIdentity,
    sourceRevision,
    topologyRevision
  }, "renderRequest.target");
}

export function sameRenderResourceGeneration(left, right) {
  try {
    const actual = normalizeRenderResourceBinding(left, "actualRenderResourceBinding");
    const expected = normalizeRenderResourceBinding(right, "expectedRenderResourceBinding");
    return actual.mapIdentity === expected.mapIdentity
      && actual.sourceRevision === expected.sourceRevision
      && actual.topologyRevision === expected.topologyRevision
      && actual.renderGeneration === expected.renderGeneration;
  } catch {
    return false;
  }
}

export function sameRenderResourceBinding(left, right) {
  try {
    const actual = normalizeRenderResourceBinding(left, "actualRenderResourceBinding");
    const expected = normalizeRenderResourceBinding(right, "expectedRenderResourceBinding");
    return actual.mapIdentity === expected.mapIdentity
      && actual.sourceRevision === expected.sourceRevision
      && actual.topologyRevision === expected.topologyRevision
      && actual.renderPreparationId === expected.renderPreparationId
      && actual.renderGeneration === expected.renderGeneration;
  } catch {
    return false;
  }
}

export function renderResourceBindingFromOwner(owner) {
  return normalizeRenderResourceBinding(owner, "surfaceResourceOwner");
}

function nonEmptyString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw bindingError(path, `${path} 必须是非空字符串`);
  return value;
}

function nonNegativeInteger(value, path) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw bindingError(path, `${path} 必须是非负安全整数`);
  }
  return value;
}

function bindingError(path, message) {
  const error = new TypeError(message);
  error.code = "render-resource-binding-invalid";
  error.path = path;
  return error;
}
