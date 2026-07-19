const DEFAULT_LIMITS = Object.freeze({maxDepth: 3, maxEntries: 8, maxItems: 12, maxLength: 240});

export function normalizeObjectDetailRows(rows = []) {
  return rows.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const label = formatPlayerText(row.label, "");
    if (!label) return [];
    if ((row.value === null || row.value === undefined || row.value === "") && row.omitEmpty === true) return [];
    if (typeof row.value === "function" || typeof row.value === "symbol") return [];
    const structured = isStructuredValue(row.value);
    if (structured && row.structured !== true) return [];
    const value = structured
      ? formatStructuredDetailValue(row.value, row.summaryOptions)
      : formatPlayerText(row.value, row.fallback ?? "无");
    if (!value || value.includes("[object Object]")) return [];
    return [{...row, key: row.key ?? `${label}-${index}`, label, value}];
  });
}

export function formatPlayerText(value, fallback = "未知") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return value.includes("[object Object]") ? fallback : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "bigint" || typeof value === "boolean") return String(value);
  return fallback;
}

export function joinPlayerDetailValues(values, separator = " / ") {
  return values.map(value => formatPlayerText(value, "")).filter(Boolean).join(separator);
}

export function formatStructuredDetailValue(value, options = {}) {
  if (!isStructuredValue(value)) return formatPlayerText(value, options.fallback ?? "");
  const limits = {...DEFAULT_LIMITS, ...options};
  const normalized = normalizeStructuredValue(value, limits, 0, new WeakSet());
  if (normalized === undefined || normalized === null) return "";
  const text = JSON.stringify(normalized);
  if (!text || text === "{}" || text === "[]") return "";
  if (text.length <= limits.maxLength) return text;
  const truncated = JSON.stringify({preview: `${text.slice(0, Math.max(0, limits.maxLength - 40))}…`, truncated: true});
  return truncated.length <= limits.maxLength ? truncated : JSON.stringify({truncated: true});
}

function normalizeStructuredValue(value, limits, depth, seen) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (depth >= limits.maxDepth) return "…";
  if (seen.has(value)) return "[循环引用]";
  seen.add(value);

  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return normalizeList(Array.from(value), limits, depth, seen);
    }
    if (Array.isArray(value)) return normalizeList(value, limits, depth, seen);
    if (value instanceof Set) return normalizeList(Array.from(value), limits, depth, seen);
    if (value instanceof Map) return normalizeObjectEntries(Array.from(value.entries()).map(([key, item]) => [String(key), item]), limits, depth, seen);
    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      return normalizeObjectEntries(Object.entries(value), limits, depth, seen);
    }
    return undefined;
  } finally {
    seen.delete(value);
  }
}

function normalizeList(values, limits, depth, seen) {
  const items = values.slice(0, limits.maxItems)
    .map(item => normalizeStructuredValue(item, limits, depth + 1, seen))
    .filter(item => item !== undefined);
  if (values.length > limits.maxItems) items.push(`… +${values.length - limits.maxItems}`);
  return items;
}

function normalizeObjectEntries(entries, limits, depth, seen) {
  const result = {};
  let accepted = 0;
  for (const [key, value] of entries) {
    if (accepted >= limits.maxEntries) break;
    const normalized = normalizeStructuredValue(value, limits, depth + 1, seen);
    if (normalized === undefined) continue;
    result[String(key)] = normalized;
    accepted++;
  }
  const remaining = Math.max(0, entries.length - accepted);
  if (remaining) result._more = remaining;
  return result;
}

function isStructuredValue(value) {
  return Boolean(value && typeof value === "object");
}
