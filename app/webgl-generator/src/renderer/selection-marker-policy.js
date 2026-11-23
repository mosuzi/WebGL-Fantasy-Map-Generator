import {LABEL_TARGET_KIND, OBJECT_KIND, isPointObjectKind} from "../runtime/object-kinds.js";

export function matchesLabelTarget(selection, targetKind, targetId) {
  if (!selection) return false;
  if (selection.kind === targetKind) return sameObjectId(selection.id, targetId);
  if (selection.kind !== OBJECT_KIND.LABEL) return false;
  return (selection.targetKind || LABEL_TARGET_KIND.CITY) === targetKind && sameObjectId(selection.targetId ?? selection.id, targetId);
}

export function isLabelTargetHighlighted(selection, highlights, targetKind, targetId) {
  return matchesLabelTarget(selection, targetKind, targetId) || highlights.some(item => matchesLabelTarget(item, targetKind, targetId));
}

export function shouldShowDefaultSelectionMarker(selection, items = {}) {
  if (!isPointObjectKind(selection?.kind)) return false;
  if (selection.kind === OBJECT_KIND.NOTE) return true;

  if (selection.kind === OBJECT_KIND.CITY || selection.kind === OBJECT_KIND.LABEL) {
    return !hasVisibleItem(items.labels, item => matchesLabelTarget(selection, item.targetKind, item.targetId));
  }
  if (selection.kind === OBJECT_KIND.MARKER) {
    return !hasVisibleItem(items.markers, item => sameObjectId(selection.id, item.id));
  }
  if (selection.kind === OBJECT_KIND.MILITARY) {
    return !hasVisibleItem(items.military, item => sameObjectId(selection.id, item.id));
  }
  return true;
}

function hasVisibleItem(items, matches) {
  return Array.isArray(items) && items.some(item => item?.visible === true && matches(item));
}

function sameObjectId(left, right) {
  return left !== undefined && left !== null && right !== undefined && right !== null && String(left) === String(right);
}
