export function chooseSecondaryPanelPlacement({
  anchorRect,
  panelHeight,
  viewportHeight,
  safeTop = 8,
  bottomMargin = 8,
  gap = 8
}) {
  const height = Math.max(0, finite(panelHeight, 0));
  const viewportTop = finite(safeTop, 8);
  const viewportBottom = Math.max(viewportTop, finite(viewportHeight, 0) - bottomMargin);
  const belowTop = clamp(finite(anchorRect?.bottom, viewportTop) + gap, viewportTop, viewportBottom);
  const aboveBottom = clamp(finite(anchorRect?.top, viewportTop) - gap, viewportTop, viewportBottom);
  const belowAvailable = Math.max(0, viewportBottom - belowTop);
  const aboveAvailable = Math.max(0, aboveBottom - viewportTop);
  const side = belowAvailable >= height ? "below" : aboveAvailable >= height ? "above" : aboveAvailable > belowAvailable ? "above" : "below";
  const available = side === "above" ? aboveAvailable : belowAvailable;
  const top = side === "above"
    ? Math.max(viewportTop, aboveBottom - Math.min(height, available))
    : belowTop;
  return {side, available, top, aboveAvailable, belowAvailable};
}

export function findSecondaryActionAnchor(root, actionId) {
  if (!root) return null;
  if (!actionId) return root;
  const actions = root.querySelectorAll?.(".ui-icon-action[data-action-id]") || [];
  return [...actions].find(action => action.dataset?.actionId === actionId) || root;
}

export function constrainUserSecondaryPanelPosition({
  rect,
  viewportWidth,
  viewportHeight,
  safeTop = 8,
  headerHeight = 34,
  margin = 10
}) {
  const width = Math.min(Math.max(0, finite(rect?.width, 0)), Math.max(0, viewportWidth - margin * 2));
  const left = Math.min(Math.max(margin, finite(rect?.left, margin)), Math.max(margin, viewportWidth - width - margin));
  const top = Math.min(
    Math.max(safeTop, finite(rect?.top, safeTop)),
    Math.max(safeTop, viewportHeight - headerHeight - margin)
  );
  return {left, top, width, maxHeight: Math.max(0, viewportHeight - margin - top), side: "user"};
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
