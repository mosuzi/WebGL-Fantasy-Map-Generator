export function objectTableSelectionRange(rows, anchorKey, targetKey, getKey = String) {
  const source = Array.isArray(rows) ? rows : [];
  const anchorIndex = source.findIndex(row => getKey(row) === anchorKey);
  const targetIndex = source.findIndex(row => getKey(row) === targetKey);
  if (anchorIndex < 0 || targetIndex < 0) return null;
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return source.slice(start, end + 1);
}
