const DEFAULT_MARGIN = 8;
const DEFAULT_ROW_GAP = 8;

export function captureControlPanelLaunchGeometry(documentRef, trigger, margin = DEFAULT_MARGIN, rowGap = DEFAULT_ROW_GAP) {
  const toolbarTrigger = documentRef?.getElementById?.("open-generation-panel");
  const toolbarRow = visibleRowUnion(toolbarTrigger?.closest?.(".map-toolbar-actions"), toolbarTrigger);
  const tabsHeader = trigger?.closest?.(".floating-panel")?.querySelector?.(".control-panel-tabs .el-tabs__header");
  const tabRow = visibleRect(tabsHeader);
  const managementRow = visibleRowUnion(trigger?.closest?.(".management-panel-actions"), trigger);
  const rows = [toolbarRow, tabRow, managementRow].filter(Boolean);
  const union = unionRects(rows);
  if (!union || rows.length !== 3) return null;
  const occupiedHeight = rows.reduce((sum, row) => sum + row.height, 0) + rowGap * (rows.length - 1) + margin;
  return Object.freeze({
    safeTop: Math.ceil(toolbarRow.top + occupiedHeight),
    occupiedHeight,
    rowGap,
    rows: Object.freeze(rows.map(freezeRect)),
    union: freezeRect(union)
  });
}

export function visibleRowUnion(container, reference, tolerance = 1) {
  const referenceRect = visibleRect(reference);
  if (!container || !referenceRect) return null;
  const rects = [...container.children]
    .map(visibleRect)
    .filter(rect => rect && rect.top < referenceRect.bottom + tolerance && rect.bottom > referenceRect.top - tolerance);
  return unionRects(rects);
}

export function unionRects(rects) {
  const valid = (rects || []).filter(Boolean);
  if (!valid.length) return null;
  const left = Math.min(...valid.map(rect => rect.left));
  const top = Math.min(...valid.map(rect => rect.top));
  const right = Math.max(...valid.map(rect => rect.right));
  const bottom = Math.max(...valid.map(rect => rect.bottom));
  return {left, top, right, bottom, width: right - left, height: bottom - top};
}

function visibleRect(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return freezeRect(rect);
}

function freezeRect(rect) {
  return Object.freeze({
    left: Number(rect.left),
    top: Number(rect.top),
    right: Number(rect.right),
    bottom: Number(rect.bottom),
    width: Number(rect.width),
    height: Number(rect.height)
  });
}
