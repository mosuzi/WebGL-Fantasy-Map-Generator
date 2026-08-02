export const SEMANTIC_LABEL_TEXT_CONTRACT = Object.freeze([
  semanticEntry("state", "state", "state-label", ".state-label", ".state-label.visible"),
  semanticEntry("province", "province", "province-label", ".province-label", ".province-label.visible"),
  semanticEntry("capital", "city", "city-label capital", ".city-label.capital", ".city-label.visible", {capital: true}),
  semanticEntry("city", "city", "city-label", ".city-label:not(.capital)", ".city-label.visible", {capital: false}),
  semanticEntry("custom", "custom", "custom-label", ".custom-label", ".custom-label.visible"),
  semanticEntry("zone", "zone", "zone-label", ".zone-label", ".zone-label.visible")
]);

export const SEMANTIC_LABEL_CSS_BASE_SELECTORS = Object.freeze(unique(SEMANTIC_LABEL_TEXT_CONTRACT.map(entry => entry.cssBaseSelector)));
export const PNG_SEMANTIC_LABEL_SELECTORS = Object.freeze(unique(SEMANTIC_LABEL_TEXT_CONTRACT.map(entry => entry.exportSelector)));

export const ANNOTATION_TEXT_EXPORT_CONTRACT = Object.freeze([
  annotationEntry("military-count", "military", ".military-map-icon-count", ".military-map-icon.visible"),
  annotationEntry("legend", "legend", "#map-legend", "map-legend"),
  annotationEntry("scale-bar", "scaleBar", "#map-scale-bar", "map-scale-bar")
]);

export const PNG_MILITARY_TEXT_SELECTOR = ANNOTATION_TEXT_EXPORT_CONTRACT.find(entry => entry.id === "military-count").exportSelector;
export const PNG_FIXED_TEXT_ELEMENT_IDS = Object.freeze(Object.fromEntries(
  ANNOTATION_TEXT_EXPORT_CONTRACT
    .filter(entry => entry.exportChannel !== "military")
    .map(entry => [entry.exportChannel, entry.exportSelector])
));

const DYNAMIC_CANVAS_TEXT_IDS = new Set([
  ...SEMANTIC_LABEL_TEXT_CONTRACT.map(entry => entry.id),
  "military-count",
  "grid-cell-id"
]);

export function semanticLabelClassName(targetKind, item = null) {
  const capital = targetKind === "city" ? Boolean(item?.capital) : null;
  const entry = SEMANTIC_LABEL_TEXT_CONTRACT.find(candidate => (
    candidate.targetKind === targetKind
    && (candidate.capital === null || candidate.capital === capital)
  ));
  if (!entry) throw new Error(`未知语义标签目标：${targetKind}`);
  return entry.className;
}

export function markDynamicCanvasTextNode(node, textId) {
  if (!node?.dataset) throw new Error("动态画布文字节点无效");
  if (!DYNAMIC_CANVAS_TEXT_IDS.has(textId)) throw new Error(`未登记动态画布文字：${textId}`);
  node.dataset.canvasTextId = textId;
  return node;
}

export function setDynamicCanvasTextContent(node, textId, text) {
  markDynamicCanvasTextNode(node, textId);
  node.textContent = String(text ?? "");
  return node;
}

function semanticEntry(id, targetKind, className, selector, exportSelector, options = {}) {
  return Object.freeze({
    id,
    targetKind,
    capital: options.capital ?? null,
    className,
    selector,
    cssBaseSelector: `.${className.split(" ")[0]}`,
    exportSelector
  });
}

function annotationEntry(id, exportChannel, selector, exportSelector) {
  return Object.freeze({id, exportChannel, selector, exportSelector});
}

function unique(values) {
  return [...new Set(values)];
}
