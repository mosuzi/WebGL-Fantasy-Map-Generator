import {OBJECT_KIND} from "./object-kinds.js";
import {
  labelTargetKey,
  normalizeLabelLayoutStore,
  patchLabelLayout,
  readLabelLayoutOverride,
  restoreLabelLayoutOverride
} from "./label-layout-registry.js";
import {objectAffected} from "./edit-command-effects.js";

const LABEL_LAYOUT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["labels", "object-panels"])
});

export function createPatchLabelLayoutCommand(label, patch) {
  const target = normalizeTarget(label);
  let previous = null;

  return {
    label: `修改标签布局 ${labelTargetKey(target.targetKind, target.targetId)}`,
    domain: OBJECT_KIND.LABEL,
    effects: {...LABEL_LAYOUT_EFFECTS, affected: objectAffected(OBJECT_KIND.LABEL, target.targetId)},
    apply(context) {
      if (!labelTargetExists(context.map, target)) throw new Error(`找不到标签 ${labelTargetKey(target.targetKind, target.targetId)}`);
      previous ??= readLabelLayoutOverride(context.map, target.targetKind, target.targetId);
      patchLabelLayout(context.map, target.targetKind, target.targetId, patch);
    },
    revert(context) {
      restoreLabelLayoutOverride(context.map, target.targetKind, target.targetId, previous);
    },
    isNoop(context) {
      if (!labelTargetExists(context.map, target) || !patch || typeof patch !== "object") return true;
      const before = readLabelLayoutOverride(context.map, target.targetKind, target.targetId);
      const previewMap = {labels: {layout: structuredClone(normalizeLabelLayoutStore(context.map?.labels?.layout))}};
      const after = patchLabelLayout(previewMap, target.targetKind, target.targetId, patch);
      return JSON.stringify(before) === JSON.stringify(after);
    }
  };
}

function normalizeTarget(label) {
  return {
    targetKind: label?.targetKind,
    targetId: Number(label?.targetId ?? label?.id)
  };
}

function labelTargetExists(map, target) {
  const {targetKind, targetId} = target;
  if (targetKind === "custom") return Boolean(map?.labels?.custom?.some(label => label?.id === targetId));
  if (targetKind === "city") return Boolean(map?.settlements?.cities?.[targetId]);
  if (targetKind === "state") return Boolean(map?.politics?.states?.[targetId] && !map.politics.states[targetId].removed);
  if (targetKind === "province") return Boolean(map?.politics?.provinces?.[targetId] && !map.politics.provinces[targetId].removed);
  return false;
}
