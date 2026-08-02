import {ANNOTATION_TEXT_EXPORT_CONTRACT, SEMANTIC_LABEL_TEXT_CONTRACT} from "./canvas-text-contract.js";

export const CANVAS_TEXT_LAYER = Object.freeze({
  SEMANTIC: "semantic",
  ANNOTATION: "annotation",
  HUD: "hud",
  DIAGNOSTIC: "diagnostic",
  NOT_RENDERED: "not-rendered"
});

export const CANVAS_TEXT_STYLE_PERSISTENCE = Object.freeze({
  DIRECT_MAP: "direct-map",
  VISUAL_THEME: "visual-theme",
  RUNTIME_PALETTE: "runtime-palette",
  NONE: "none"
});

export const CANVAS_TEXT_EDITABILITY = Object.freeze({
  DIRECT: "direct",
  INDIRECT: "indirect",
  NONE: "none"
});

const SEMANTIC_LABELS = Object.freeze({
  state: "国家名称",
  province: "省份名称",
  capital: "首都名称",
  city: "城市名称",
  custom: "手工标签",
  zone: "地区名称"
});

const semanticEntries = SEMANTIC_LABEL_TEXT_CONTRACT.map(contract => textEntry({
  id: contract.id,
  label: SEMANTIC_LABELS[contract.id],
  layer: CANVAS_TEXT_LAYER.SEMANTIC,
  selector: contract.selector,
  styleSource: `labels.styles.${contract.id}`,
  stylePersistence: CANVAS_TEXT_STYLE_PERSISTENCE.DIRECT_MAP,
  editability: CANVAS_TEXT_EDITABILITY.DIRECT,
  exported: true,
  exportSelector: contract.exportSelector
}));

const annotationById = Object.fromEntries(ANNOTATION_TEXT_EXPORT_CONTRACT.map(contract => [contract.id, contract]));

export const CANVAS_TEXT_REGISTRY = Object.freeze([
  ...semanticEntries,

  textEntry({
    id: "military-count",
    label: "军事兵力数字",
    layer: CANVAS_TEXT_LAYER.ANNOTATION,
    selector: annotationById["military-count"].selector,
    styleSource: "state.color -> military-label-palette + CSS",
    stylePersistence: CANVAS_TEXT_STYLE_PERSISTENCE.RUNTIME_PALETTE,
    editability: CANVAS_TEXT_EDITABILITY.INDIRECT,
    exported: true,
    exportSelector: annotationById["military-count"].exportSelector
  }),
  textEntry({
    id: "legend",
    label: "图例文字",
    layer: CANVAS_TEXT_LAYER.ANNOTATION,
    selector: annotationById.legend.selector,
    styleSource: "visualTheme.legend + CSS",
    stylePersistence: CANVAS_TEXT_STYLE_PERSISTENCE.VISUAL_THEME,
    editability: CANVAS_TEXT_EDITABILITY.INDIRECT,
    exported: true,
    exportSelector: annotationById.legend.exportSelector
  }),
  textEntry({
    id: "scale-bar",
    label: "比例尺文字",
    layer: CANVAS_TEXT_LAYER.ANNOTATION,
    selector: annotationById["scale-bar"].selector,
    styleSource: "visualTheme.scaleBar + CSS",
    stylePersistence: CANVAS_TEXT_STYLE_PERSISTENCE.VISUAL_THEME,
    editability: CANVAS_TEXT_EDITABILITY.INDIRECT,
    exported: true,
    exportSelector: annotationById["scale-bar"].exportSelector
  }),

  textEntry({id: "map-badge", label: "地图尺寸", layer: CANVAS_TEXT_LAYER.HUD, selector: "#map-badge", styleSource: "HUD CSS"}),
  textEntry({id: "hover-details", label: "悬停详情", layer: CANVAS_TEXT_LAYER.HUD, selector: "#hover-overlay", styleSource: "HUD CSS"}),
  textEntry({id: "measurement-readout", label: "测量读数", layer: CANVAS_TEXT_LAYER.HUD, selector: "#measurement-readout", styleSource: "HUD CSS"}),
  textEntry({id: "tool-mode", label: "工具模式", layer: CANVAS_TEXT_LAYER.HUD, selector: "#canvas-tool-mode-feedback", styleSource: "HUD CSS"}),
  textEntry({id: "generation-status", label: "生成状态", layer: CANVAS_TEXT_LAYER.HUD, selector: "#generation-loading", styleSource: "HUD CSS"}),
  textEntry({id: "toast", label: "操作提示", layer: CANVAS_TEXT_LAYER.HUD, selector: "#map-toast", styleSource: "HUD CSS"}),
  textEntry({id: "shortcut-hint", label: "快捷提示", layer: CANVAS_TEXT_LAYER.HUD, selector: "#shortcut-toast", styleSource: "HUD CSS"}),
  textEntry({id: "toolbar", label: "地图工具栏", layer: CANVAS_TEXT_LAYER.HUD, selector: "#map-toolbar", styleSource: "HUD CSS"}),
  textEntry({id: "grid-cell-id", label: "Grid Cell ID", layer: CANVAS_TEXT_LAYER.DIAGNOSTIC, selector: ".grid-cell-diagnostic-label", styleSource: "diagnostic CSS"}),

  textEntry({
    id: "river-name",
    label: "河流名称",
    layer: CANVAS_TEXT_LAYER.NOT_RENDERED,
    rendered: false,
    styleSource: "none",
    evidence: ["WebGL line only", "hover river.name", "RiverPanel name editor"]
  }),
  textEntry({
    id: "route-name",
    label: "道路名称",
    layer: CANVAS_TEXT_LAYER.NOT_RENDERED,
    rendered: false,
    styleSource: "none",
    evidence: ["WebGL line only", "optional route.name is data only", "GeoJSON derives displayName"]
  }),
  textEntry({
    id: "marker-name",
    label: "标记名称",
    layer: CANVAS_TEXT_LAYER.NOT_RENDERED,
    rendered: false,
    styleSource: "title / aria / hover only",
    evidence: ["SVG icon only", "title and aria tooltip", "MarkerPanel name editor"]
  })
]);

export function listCanvasTextEntries({layer = null, rendered = null} = {}) {
  return CANVAS_TEXT_REGISTRY
    .filter(entry => !layer || entry.layer === layer)
    .filter(entry => rendered === null || entry.rendered === rendered)
    .map(entry => ({...entry, evidence: [...entry.evidence]}));
}

export function validateCanvasTextRegistry(entries = CANVAS_TEXT_REGISTRY) {
  const ids = new Set();
  const layers = new Set(Object.values(CANVAS_TEXT_LAYER));
  const persistenceValues = new Set(Object.values(CANVAS_TEXT_STYLE_PERSISTENCE));
  const editabilityValues = new Set(Object.values(CANVAS_TEXT_EDITABILITY));
  for (const entry of entries) {
    if (!entry?.id || ids.has(entry.id)) throw new Error(`画布文字目录 ID 缺失或重复：${entry?.id || "(empty)"}`);
    ids.add(entry.id);
    if (!layers.has(entry.layer)) throw new Error(`画布文字目录层级无效：${entry.id}`);
    if (!entry.label || !entry.styleSource) throw new Error(`画布文字目录来源缺失：${entry.id}`);
    if (typeof entry.rendered !== "boolean" || typeof entry.exported !== "boolean") throw new Error(`画布文字目录布尔字段无效：${entry.id}`);
    if (!persistenceValues.has(entry.stylePersistence)) throw new Error(`画布文字目录样式持久化语义无效：${entry.id}`);
    if (!editabilityValues.has(entry.editability)) throw new Error(`画布文字目录编辑语义无效：${entry.id}`);
    if (entry.rendered && !entry.selector) throw new Error(`已渲染文字缺少 selector：${entry.id}`);
    if (entry.exported && !entry.exportSelector) throw new Error(`已导出文字缺少 exportSelector：${entry.id}`);
    if (!entry.rendered && (entry.stylePersistence !== CANVAS_TEXT_STYLE_PERSISTENCE.NONE || entry.exported || entry.editability !== CANVAS_TEXT_EDITABILITY.NONE)) {
      throw new Error(`未渲染文字错误声明了样式能力：${entry.id}`);
    }
    if (!entry.rendered && !entry.evidence.length) throw new Error(`未渲染文字缺少真实证据：${entry.id}`);
  }
  return true;
}

function textEntry({
  id,
  label,
  layer,
  selector = "",
  styleSource,
  stylePersistence = CANVAS_TEXT_STYLE_PERSISTENCE.NONE,
  editability = CANVAS_TEXT_EDITABILITY.NONE,
  rendered = true,
  exported = false,
  exportSelector = "",
  evidence = []
}) {
  return Object.freeze({
    id,
    label,
    layer,
    rendered,
    selector,
    styleSource,
    stylePersistence,
    editability,
    exported,
    exportSelector,
    evidence: Object.freeze([...evidence])
  });
}
