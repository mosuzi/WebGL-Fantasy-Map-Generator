import {normalizeRenderResourceBinding} from "./render-resource-binding.js";

export const RENDER_CACHE_RESOURCE_FAMILIES = Object.freeze([
  "line", "point", "route", "river", "tradeFlow", "selection"
]);

const FAMILY_REFERENCES = Object.freeze({
  line: Object.freeze(["lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "lineVertices", "shoreLineVertices", "oceanCurrentVertices"]),
  point: Object.freeze(["pointBuffer", "pointDrawRanges"]),
  route: Object.freeze(["routeBuffer", "routeDrawRanges", "routeBufferCamera"]),
  river: Object.freeze(["riverBuffer", "riverBufferCamera"]),
  tradeFlow: Object.freeze(["tradeFlowBuffer", "tradeFlowPickItems"]),
  selection: Object.freeze(["selectionBuffer", "selectionDrawRanges"])
});

export function createRenderCacheResourceBindingEntries(renderer, family, binding) {
  assertFamily(family);
  const owner = normalizeRenderResourceBinding(binding, `renderer.renderCacheResourceOwners.${family}`);
  const wrapper = {owner};
  for (const field of FAMILY_REFERENCES[family]) wrapper[field] = renderer?.[field];
  return Object.freeze([
    Object.freeze(["renderCacheResourceOwners", Object.freeze({...renderer?.renderCacheResourceOwners, [family]: owner})]),
    Object.freeze(["renderCacheResourceBindings", Object.freeze({...renderer?.renderCacheResourceBindings, [family]: Object.freeze(wrapper)})])
  ]);
}

export function adoptRenderCacheResourceBinding(renderer, family, binding) {
  for (const [field, value] of createRenderCacheResourceBindingEntries(renderer, family, binding)) renderer[field] = value;
  return renderer.renderCacheResourceOwners[family];
}

export function invalidateRenderCacheResourceBindings(renderer) {
  renderer.renderCacheResourceOwners = Object.freeze({});
  renderer.renderCacheResourceBindings = Object.freeze({});
}

export function renderCacheResourceBindingMismatch(renderer, family) {
  assertFamily(family);
  const owner = renderer?.renderCacheResourceOwners?.[family];
  const wrapper = renderer?.renderCacheResourceBindings?.[family];
  if (!owner) return "owner-missing";
  const surfaceOwner = renderer?.surfaceResourceOwner;
  if (!surfaceOwner) return "surface-owner-missing";
  if (String(owner.mapIdentity) !== String(surfaceOwner.mapIdentity)) return "owner-map-identity";
  if (Number(owner.topologyRevision) !== Number(surfaceOwner.topologyRevision)) return "owner-topology-revision";
  if (Number(owner.renderGeneration) !== Number(surfaceOwner.renderGeneration)) return "owner-render-generation";
  if (!wrapper || wrapper.owner !== owner) return "wrapper-owner";
  for (const field of FAMILY_REFERENCES[family]) {
    if (wrapper[field] !== renderer?.[field]) return `${field}-reference`;
  }
  return "";
}

export function assertRenderCacheResourceBindings(renderer, families = RENDER_CACHE_RESOURCE_FAMILIES) {
  const mismatches = [];
  for (const family of families) {
    const reason = renderCacheResourceBindingMismatch(renderer, family);
    if (reason) mismatches.push(`${family}:${reason}`);
  }
  if (!mismatches.length) return true;
  const error = new Error(`render cache resource owner 不一致：${mismatches.join(", ")}`);
  error.code = "render-cache-resource-owner-mismatch";
  error.mismatches = mismatches;
  throw error;
}

function assertFamily(family) {
  if (!Object.prototype.hasOwnProperty.call(FAMILY_REFERENCES, family)) {
    throw new Error(`未知 render cache resource family：${String(family)}`);
  }
}
