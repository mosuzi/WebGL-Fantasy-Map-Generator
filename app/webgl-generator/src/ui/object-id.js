export function objectIdKey(value) {
  if (value === null || value === undefined) return "";
  if (Number.isInteger(value)) return `n:${value}`;
  const text = String(value).trim();
  if (!text) return "";
  if (/^-?\d+$/.test(text)) return `n:${Number(text)}`;
  return `s:${text}`;
}

export function sameObjectId(a, b) {
  const key = objectIdKey(a);
  return Boolean(key && key === objectIdKey(b));
}

export function findByObjectId(rows, id, key = "id") {
  const target = objectIdKey(id);
  if (!target) return null;
  return rows.find(row => objectIdKey(row?.[key]) === target) || null;
}

export function toIntegerId(value) {
  if (Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number(text);
}
