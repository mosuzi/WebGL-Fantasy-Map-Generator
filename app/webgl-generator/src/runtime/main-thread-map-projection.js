// 几何列的元素是数值或数值行，可直接拆出传输数组，避免递归遍历每个顶点。
const geometryRows = new Set(["c", "v", "p"]);
const editableMaps = new WeakSet();

export function isEditableMap(map) {
  return editableMaps.has(map);
}

function* plainNumbers(view, copies, work) {
  let values = copies.get(view);
  if (values) return values;
  values = new Array(view.length);
  for (let i = 0; i < view.length; i++) {
    values[i] = view[i];
    if (!(++work.entries & 4095)) yield;
  }
  copies.set(view, values);
  return values;
}

function* numericRows(rows, copies, work) {
  if (ArrayBuffer.isView(rows)) return yield* plainNumbers(rows, copies, work);
  if (!Array.isArray(rows)) return rows;
  for (let i = 0; i < rows.length; i++) {
    if (ArrayBuffer.isView(rows[i])) rows[i] = yield* plainNumbers(rows[i], copies, work);
    if (!(++work.entries & 4095)) yield;
  }
  return rows;
}

export function materializeEditableValue(value, copies = new WeakMap()) {
  return finishProjection(materializeValue(value, copies, {entries: 0}));
}

function* materializeValue(value, copies, work) {
  if (!value || typeof value !== "object") return value;
  if (isNumericView(value)) return yield* plainNumbers(value, copies, work);
  if (copies.has(value)) return copies.get(value);
  copies.set(value, value);
  const stack = [projectionFrame(value)];
  while (stack.length) {
    const frame = stack.at(-1);
    const {owner, keys, length} = frame;
    let index = frame.index;
    for (; index < length;) {
      const key = keys ? keys[index] : index;
      index++;
      const item = owner[key];
      if (!(++work.entries & 4095)) yield;
      if (!item || typeof item !== "object") continue;
      if (isNumericView(item)) {
        owner[key] = yield* plainNumbers(item, copies, work);
      } else if (!copies.has(item)) {
        copies.set(item, item);
        frame.index = index;
        stack.push(projectionFrame(item));
        break;
      }
    }
    if (stack.at(-1) === frame) stack.pop();
  }
  return value;
}

function isNumericView(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function projectionFrame(owner) {
  const keys = Array.isArray(owner) ? null : Object.keys(owner);
  return {owner, keys, length: keys ? keys.length : owner.length, index: 0};
}

export function applyMainThreadMapProjection(map) {
  return finishProjection(projectMap(map));
}

export async function applyMainThreadMapProjectionAsync(map, {yieldToMain, budgetMs = 4, signal} = {}) {
  signal?.throwIfAborted();
  let deadline = performance.now() + budgetMs;
  const projection = projectMap(map);
  let next = projection.next();
  while (!next.done) {
    if (performance.now() >= deadline) {
      await yieldToMain();
      signal?.throwIfAborted();
      deadline = performance.now() + budgetMs;
    }
    next = projection.next();
  }
  return next.value;
}

function finishProjection(projection) {
  let next = projection.next();
  while (!next.done) next = projection.next();
  return next.value;
}

function* projectMap(map) {
  if (!map || editableMaps.has(map)) return map;
  const copies = new WeakMap();
  const work = {entries: 0};
  for (const section of [map.grid, map.pack]) {
    if (!section) continue;
    for (const table of [section.cells, section.vertices]) {
      if (!table) continue;
      copies.set(table, table);
      for (const [key, column] of Object.entries(table)) {
        const result = geometryRows.has(key)
          ? yield* numericRows(column, copies, work)
          : yield* materializeValue(column, copies, work);
        if (result !== column) table[key] = result;
      }
    }
    for (const rows of [section.points, section.boundary]) {
      if (!Array.isArray(rows)) continue;
      yield* numericRows(rows, copies, work);
      copies.set(rows, rows);
    }
  }
  yield* materializeValue(map, copies, work);
  editableMaps.add(map);
  return map;
}
