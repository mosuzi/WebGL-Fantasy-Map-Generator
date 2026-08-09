import {LABEL_TARGET_KIND, OBJECT_KIND, isPointObjectKind} from "../runtime/object-kinds.js";

export function isSelectionForLabelItem(selection, item) {
  if (!selection || !item) return false;
  if (selection.suppressLabelSelection && selection.kind === OBJECT_KIND.CITY) return false;
  if (selection.kind === item.targetKind && sameObjectId(selection.id, item.targetId)) return true;
  if (selection.kind !== OBJECT_KIND.LABEL) return false;
  const targetKind = selection.targetKind || LABEL_TARGET_KIND.CITY;
  const targetId = selection.targetId ?? selection.id;
  return targetKind === item.targetKind && sameObjectId(targetId, item.targetId);
}

export function shouldShowDefaultSelectionMarker(selection, items = {}) {
  if (!isPointObjectKind(selection?.kind)) return false;
  if (selection.kind === OBJECT_KIND.NOTE) return true;

  if (selection.kind === OBJECT_KIND.CITY) {
    const cityVisible = hasVisibleItem(items.cities, item => sameObjectId(selection.id, item.id));
    const labelVisible = hasVisibleItem(items.labels, item => isSelectionForLabelItem(selection, item));
    return !cityVisible && !labelVisible;
  }
  if (selection.kind === OBJECT_KIND.LABEL) {
    return !hasVisibleItem(items.labels, item => isSelectionForLabelItem(selection, item));
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
