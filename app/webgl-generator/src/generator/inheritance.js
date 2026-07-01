export const DEFAULT_INHERITANCE_MODE = "branching";

export const INHERITANCE_MODE_OPTIONS = Object.freeze([
  {value: "flat", label: "平铺"},
  {value: "regional", label: "区域浅树"},
  {value: "branching", label: "分支树"}
]);

const INHERITANCE_MODES = new Set(INHERITANCE_MODE_OPTIONS.map(option => option.value));

export function normalizeInheritanceMode(mode, fallback = DEFAULT_INHERITANCE_MODE) {
  return INHERITANCE_MODES.has(mode) ? mode : fallback;
}

export function summarizeInheritanceTree(items, rootId = 0) {
  const nodes = activeInheritanceItems(items);
  let roots = 0;
  let derived = 0;
  let maxDepth = 0;

  for (const item of nodes) {
    const id = item.i ?? item.id;
    if (id === rootId) continue;
    if ((Number(item.parent) || rootId) === rootId) roots++;
    else derived++;
    maxDepth = Math.max(maxDepth, Number(item.depth) || 0);
  }

  return {roots, derived, maxDepth};
}

export function rebuildInheritanceTree(items, {rootId = 0, defaultParent = rootId} = {}) {
  const itemMap = new Map(activeInheritanceItems(items).map(item => [item.i ?? item.id, item]));
  const root = itemMap.get(rootId) || null;

  for (const item of itemMap.values()) {
    item.children = [];
    item.parent = normalizeParentId(itemMap, item.i ?? item.id, item.parent ?? defaultParent, rootId);
  }

  if (root) root.parent = null;

  for (const item of itemMap.values()) {
    const id = item.i ?? item.id;
    if (id === rootId) continue;
    if (createsInheritanceCycle(itemMap, id, item.parent, rootId)) item.parent = rootId;
    itemMap.get(item.parent)?.children?.push(id);
  }

  const resolving = new Set();
  const resolved = new Set();
  const resolveNode = item => {
    const id = item.i ?? item.id;
    if (resolved.has(id)) return item.depth || 0;
    if (resolving.has(id)) {
      item.parent = rootId;
      item.lineage = root ? [rootId] : [];
      item.depth = id === rootId ? 0 : 1;
      resolved.add(id);
      return item.depth;
    }

    resolving.add(id);
    if (id === rootId || item.parent === null || item.parent === undefined) {
      item.lineage = [];
      item.depth = 0;
      item.origins = [null];
    } else {
      const parent = itemMap.get(item.parent);
      if (!parent || parent === item) item.parent = rootId;
      const effectiveParent = itemMap.get(item.parent);
      if (effectiveParent) resolveNode(effectiveParent);
      item.lineage = effectiveParent ? [...(effectiveParent.lineage || []), item.parent] : [];
      item.depth = item.lineage.length;
      item.origins = item.lineage.length ? [...item.lineage] : [rootId];
    }
    resolving.delete(id);
    resolved.add(id);
    return item.depth;
  };

  for (const item of itemMap.values()) resolveNode(item);
  for (const item of itemMap.values()) item.children.sort((a, b) => a - b);
  return items;
}

export function canAssignInheritanceParent(items, itemId, parentId, {rootId = 0} = {}) {
  const itemMap = new Map(activeInheritanceItems(items).map(item => [item.i ?? item.id, item]));
  const normalizedItemId = Number(itemId);
  const normalizedParentId = normalizeParentId(itemMap, normalizedItemId, parentId, rootId);
  if (!itemMap.has(normalizedItemId) || normalizedItemId === rootId) return false;
  return !createsInheritanceCycle(itemMap, normalizedItemId, normalizedParentId, rootId);
}

export function setInheritanceParent(items, itemId, parentId, {rootId = 0} = {}) {
  const itemMap = new Map(activeInheritanceItems(items).map(item => [item.i ?? item.id, item]));
  const normalizedItemId = Number(itemId);
  const item = itemMap.get(normalizedItemId);
  if (!item || normalizedItemId === rootId) return false;

  const normalizedParentId = normalizeParentId(itemMap, normalizedItemId, parentId, rootId);
  if (createsInheritanceCycle(itemMap, normalizedItemId, normalizedParentId, rootId)) return false;
  item.parent = normalizedParentId;
  rebuildInheritanceTree(items, {rootId});
  return true;
}

function activeInheritanceItems(items = []) {
  return (items || []).filter(item => item && !item.removed && Number.isInteger(item.i ?? item.id));
}

function normalizeParentId(itemMap, itemId, parentId, rootId) {
  const parsed = Number(parentId);
  if (!Number.isInteger(parsed) || parsed === itemId || !itemMap.has(parsed)) return rootId;
  return parsed;
}

function createsInheritanceCycle(itemMap, itemId, parentId, rootId) {
  if (itemId === rootId) return false;
  let current = parentId;
  const visited = new Set([itemId]);

  while (Number.isInteger(current) && current !== rootId) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = Number(itemMap.get(current)?.parent);
  }

  return false;
}
