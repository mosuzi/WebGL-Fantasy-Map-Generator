export function compareListValues(a, b, locale = "zh-CN") {
  if (Object.is(a, b)) return 0;
  const aNumber = numericSortValue(a);
  const bNumber = numericSortValue(b);
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  return String(a ?? "").localeCompare(String(b ?? ""), locale, {numeric: true});
}

// 保留显示值相同的行，让对象表的 v-memo 只更新本次编辑涉及的行。
export function reuseMetricRows(metrics, previous) {
  if (!previous) return metrics;
  const prior = new Map(previous.rows.map(row => [row.id, row]));
  metrics.rows = metrics.rows.map(row => {
    const old = prior.get(row.id);
    return old && Object.keys(row).every(key => Object.is(row[key], old[key])) ? old : row;
  });
  return metrics;
}

export function compareRowsByKey(a, b, key, direction = "asc", {fallbackKey = "id", locale = "zh-CN"} = {}) {
  const factor = direction === "asc" ? 1 : -1;
  const compared = compareListValues(a?.[key], b?.[key], locale);
  if (compared) return compared * factor;
  if (!fallbackKey) return 0;
  return compareListValues(a?.[fallbackKey], b?.[fallbackKey], locale);
}

function numericSortValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
