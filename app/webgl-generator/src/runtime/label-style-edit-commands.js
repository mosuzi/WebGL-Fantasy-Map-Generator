import {OBJECT_KIND} from "./object-kinds.js";
import {
  ensureLabelStyleStore,
  LABEL_STYLE_TYPES,
  patchLabelStyle,
  resetAllLabelStyles,
  resetLabelStyle
} from "./label-style-registry.js";

const LABEL_STYLE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: false,
  derived: Object.freeze(["labels"])
});

export function createPatchLabelStyleCommand(styleType, patch) {
  let previous = null;

  return {
    label: `修改${labelStyleTypeName(styleType)}样式`,
    domain: OBJECT_KIND.LABEL,
    effects: LABEL_STYLE_EFFECTS,
    apply(context) {
      previous ??= cloneStyleStore(ensureLabelStyleStore(context.map));
      patchLabelStyle(context.map, styleType, patch);
    },
    revert(context) {
      context.map.labels.styles = cloneStyleStore(previous);
    },
    isNoop() {
      return !patch || typeof patch !== "object" || !Object.keys(patch).length;
    }
  };
}

export function createResetLabelStyleCommand(styleType) {
  let previous = null;

  return {
    label: `重置${labelStyleTypeName(styleType)}样式`,
    domain: OBJECT_KIND.LABEL,
    effects: LABEL_STYLE_EFFECTS,
    apply(context) {
      previous ??= cloneStyleStore(ensureLabelStyleStore(context.map));
      resetLabelStyle(context.map, styleType);
    },
    revert(context) {
      context.map.labels.styles = cloneStyleStore(previous);
    },
    isNoop(context) {
      return !ensureLabelStyleStore(context.map).overrides[styleType];
    }
  };
}

export function createResetAllLabelStylesCommand() {
  let previous = null;

  return {
    label: "重置全部标签样式",
    domain: OBJECT_KIND.LABEL,
    effects: LABEL_STYLE_EFFECTS,
    apply(context) {
      previous ??= cloneStyleStore(ensureLabelStyleStore(context.map));
      resetAllLabelStyles(context.map);
    },
    revert(context) {
      context.map.labels.styles = cloneStyleStore(previous);
    },
    isNoop(context) {
      return !Object.keys(ensureLabelStyleStore(context.map).overrides).length;
    }
  };
}

function cloneStyleStore(store) {
  return {
    version: Number(store?.version) || 1,
    overrides: Object.fromEntries(Object.entries(store?.overrides || {}).map(([key, value]) => [key, {...value}]))
  };
}

function labelStyleTypeName(styleType) {
  const labels = {state: "国家名称", province: "省份名称", capital: "首都名称", city: "城市名称", custom: "手工标签"};
  if (!LABEL_STYLE_TYPES.includes(styleType)) throw new Error(`未知标签样式类型：${styleType}`);
  return labels[styleType];
}
