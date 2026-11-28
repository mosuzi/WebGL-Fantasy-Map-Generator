// 几何列的元素是数值或数值行，可直接拆出传输数组，避免递归遍历每个顶点。
const geometryRows = new Set(["c", "v", "p"]);
const editableMaps = new WeakSet();

export function isEditableMap(map) {
  return editableMaps.has(map);
}

function plainNumbers(view, copies) {
  let values = copies.get(view);
  if (values) return values;
  values = new Array(view.length);
  for (let i = 0; i < view.length; i++) values[i] = view[i];
  copies.set(view, values);
  return values;
}

function numericRows(rows, copies) {
  if (ArrayBuffer.isView(rows)) return plainNumbers(rows, copies);
  if (!Array.isArray(rows)) return rows;
  for (let i = 0; i < rows.length; i++) {
    if (ArrayBuffer.isView(rows[i])) rows[i] = plainNumbers(rows[i], copies);
  }
  return rows;
}

export function materializeEditableValue(value, copies = new WeakMap()) {
  if (!value || typeof value !== "object") return value;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return plainNumbers(value, copies);
  if (copies.has(value)) return copies.get(value);
  copies.set(value, value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item && typeof item === "object") {
        const result = materializeEditableValue(item, copies);
        if (result !== item) value[i] = result;
      }
    }
  } else {
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item && typeof item === "object") {
        const result = materializeEditableValue(item, copies);
        if (result !== item) value[key] = result;
      }
    }
  }
  return value;
}

export function applyMainThreadMapProjection(map) {
  if (!map || editableMaps.has(map)) return map;
  const copies = new WeakMap();
  for (const section of [map.grid, map.pack]) {
    if (!section) continue;
    for (const table of [section.cells, section.vertices]) {
      if (!table) continue;
      copies.set(table, table);
      for (const [key, column] of Object.entries(table)) {
        const result = geometryRows.has(key) ? numericRows(column, copies) : materializeEditableValue(column, copies);
        if (result !== column) table[key] = result;
      }
    }
    for (const rows of [section.points, section.boundary]) {
      if (!Array.isArray(rows)) continue;
      numericRows(rows, copies);
      copies.set(rows, rows);
    }
  }
  materializeEditableValue(map, copies);
  editableMaps.add(map);
  return map;
}
