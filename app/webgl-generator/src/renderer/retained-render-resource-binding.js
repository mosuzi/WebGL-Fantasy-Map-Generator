import {normalizeRenderResourceBinding, sameRenderResourceBinding} from "./render-resource-binding.js";

export function createObjectPickingResourceBindingEntries(renderer, binding) {
  if (!renderer?.objectPickingIndex) throw retainedResourceError("picking", "index-missing");
  const owner = normalizeRenderResourceBinding(binding, "renderer.objectPickingResourceOwner");
  return Object.freeze([
    Object.freeze(["objectPickingResourceOwner", owner]),
    Object.freeze(["objectPickingResourceBinding", Object.freeze({owner, index: renderer.objectPickingIndex})])
  ]);
}

export function createOverlayLabelResourceBindingEntries(renderer, binding) {
  assertOverlayReferences(renderer);
  const owner = normalizeRenderResourceBinding(binding, "renderer.overlayResourceOwner");
  return Object.freeze([
    Object.freeze(["labelLayoutResourceOwner", owner]),
    Object.freeze(["labelLayoutResourceBinding", Object.freeze({owner, labelItems: renderer.labelItems})]),
    Object.freeze(["overlayResourceOwner", owner]),
    Object.freeze(["overlayResourceBinding", Object.freeze({
      owner,
      overlay: renderer.overlay || null,
      labelItems: renderer.labelItems,
      cityIconItems: renderer.cityIconItems,
      cityIconItemsById: renderer.cityIconItemsById,
      markerIconItems: renderer.markerIconItems,
      militaryIconItems: renderer.militaryIconItems,
      cityIconLayer: renderer.cityIconLayer || null
    })])
  ]);
}

export function adoptObjectPickingResourceBinding(renderer, binding) {
  for (const [field, value] of createObjectPickingResourceBindingEntries(renderer, binding)) renderer[field] = value;
  return renderer.objectPickingResourceOwner;
}

export function adoptOverlayLabelResourceBinding(renderer, binding) {
  for (const [field, value] of createOverlayLabelResourceBindingEntries(renderer, binding)) renderer[field] = value;
  return renderer.overlayResourceOwner;
}

export function objectPickingResourceBindingMismatch(renderer, expected = null) {
  if (!renderer?.map) return "";
  if (!renderer.objectPickingIndex) return "index-missing";
  const owner = renderer.objectPickingResourceOwner;
  const wrapper = renderer.objectPickingResourceBinding;
  if (!owner) return "owner-missing";
  const compatibility = retainedOwnerSurfaceCompatibilityMismatch(renderer, owner);
  if (compatibility) return compatibility;
  if (expected && !sameRenderResourceBinding(owner, expected)) return "owner-binding";
  if (!wrapper || wrapper.owner !== owner) return "wrapper-owner";
  if (wrapper.index !== renderer.objectPickingIndex) return "index-reference";
  return "";
}

export function overlayLabelResourceBindingMismatch(renderer, expected = null) {
  if (!renderer?.map) return "";
  try {
    assertOverlayReferences(renderer);
  } catch (error) {
    return error?.reason || "references-missing";
  }
  const labelOwner = renderer.labelLayoutResourceOwner;
  const labelWrapper = renderer.labelLayoutResourceBinding;
  const overlayOwner = renderer.overlayResourceOwner;
  const overlayWrapper = renderer.overlayResourceBinding;
  if (!labelOwner) return "label-owner-missing";
  if (!overlayOwner) return "overlay-owner-missing";
  const compatibility = retainedOwnerSurfaceCompatibilityMismatch(renderer, labelOwner);
  if (compatibility) return compatibility;
  if (expected && !sameRenderResourceBinding(labelOwner, expected)) return "label-owner-binding";
  if (expected && !sameRenderResourceBinding(overlayOwner, expected)) return "overlay-owner-binding";
  if (!sameRenderResourceBinding(labelOwner, overlayOwner)) return "label-overlay-owner";
  if (!labelWrapper || labelWrapper.owner !== labelOwner) return "label-wrapper-owner";
  if (labelWrapper.labelItems !== renderer.labelItems) return "label-items-reference";
  if (!overlayWrapper || overlayWrapper.owner !== overlayOwner) return "overlay-wrapper-owner";
  for (const [field, value] of [
    ["overlay", renderer.overlay || null],
    ["labelItems", renderer.labelItems],
    ["cityIconItems", renderer.cityIconItems],
    ["cityIconItemsById", renderer.cityIconItemsById],
    ["markerIconItems", renderer.markerIconItems],
    ["militaryIconItems", renderer.militaryIconItems],
    ["cityIconLayer", renderer.cityIconLayer || null]
  ]) if (overlayWrapper[field] !== value) return `${field}-reference`;
  return "";
}

export function assertObjectPickingResourceBinding(renderer, expected = null) {
  const reason = objectPickingResourceBindingMismatch(renderer, expected);
  if (reason) throw retainedResourceError("picking", reason);
  return true;
}

export function assertOverlayLabelResourceBinding(renderer, expected = null) {
  const reason = overlayLabelResourceBindingMismatch(renderer, expected);
  if (reason) throw retainedResourceError("overlay-label", reason);
  return true;
}

function assertOverlayReferences(renderer) {
  for (const [field, Type] of [
    ["labelItems", Array],
    ["cityIconItems", Array],
    ["cityIconItemsById", Map],
    ["markerIconItems", Array],
    ["militaryIconItems", Array]
  ]) {
    if (!(renderer?.[field] instanceof Type)) throw retainedResourceError("overlay-label", `${field}-missing`);
  }
}

function retainedOwnerSurfaceCompatibilityMismatch(renderer, owner) {
  const surfaceOwner = renderer?.surfaceResourceOwner;
  if (!surfaceOwner) return "surface-owner-missing";
  if (String(owner.mapIdentity) !== String(surfaceOwner.mapIdentity)) return "owner-map-identity";
  if (Number(owner.topologyRevision) !== Number(surfaceOwner.topologyRevision)) return "owner-topology-revision";
  if (Number(owner.renderGeneration) !== Number(surfaceOwner.renderGeneration)) return "owner-render-generation";
  return "";
}

function retainedResourceError(family, reason) {
  const error = new Error(`retained ${family} resource owner 不一致：${reason}`);
  error.code = "render-retained-resource-owner-mismatch";
  error.family = family;
  error.reason = reason;
  return error;
}
