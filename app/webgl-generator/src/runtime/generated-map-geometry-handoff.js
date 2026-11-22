// 新图在运行时已经有完整的邻接表。直接传输它们，避免先为存档推导排列，再重建两次。
const rowColumns = [
  ["grid", "", "points", Float64Array], ["grid", "cells", "v", Int32Array],
  ["grid", "cells", "c", Int32Array], ["grid", "vertices", "p", Float64Array],
  ["grid", "vertices", "v", Int32Array], ["grid", "vertices", "c", Int32Array],
  ["pack", "cells", "p", Float64Array], ["pack", "cells", "v", Int32Array],
  ["pack", "cells", "c", Int32Array], ["pack", "vertices", "p", Float64Array],
  ["pack", "vertices", "v", Int32Array], ["pack", "vertices", "c", Int32Array]
];

const gridColumns = rowColumns.filter(([section]) => section === "grid");

export function packGeneratedGridRanges(ranges) {
  const ends = new Uint32Array(ranges.size);
  let cell = 0;
  let previousEnd = 0;
  for (const [id, {start, end}] of ranges) {
    if (id !== cell || start !== previousEnd || !Number.isSafeInteger(end) || end <= start || end > 0xffffffff) throw invalidGeometry();
    ends[cell++] = previousEnd = end;
  }
  return ends;
}

const scalarColumns = new Set("b i p h t f temp prec biome pack s pop culture religion burg state province region g area haven harbor fl r conf good goodSupply goodSource suitabilityBase suitabilityOverride market".split(" "));

export function detachGeneratedCellColumns(map) {
  const columns = [];
  for (const section of ["grid", "pack"]) {
    const cells = map[section].cells;
    for (const [key, column] of Object.entries(cells)) {
      if (!scalarColumns.has(key)) continue;
      const plain = Array.isArray(column);
      if (plain && column.length && typeof column[0] !== "number") continue;
      if (!plain && !ArrayBuffer.isView(column)) continue;
      const values = plain ? Float64Array.from(column) : column.slice();
      columns.push({section, key, plain, values});
      delete cells[key];
    }
  }
  return columns;
}

export function attachGeneratedCellColumns(map, columns) {
  if (!Array.isArray(columns)) throw invalidGeometry();
  for (const {section, key, plain, values} of columns) {
    if (!["grid", "pack"].includes(section) || !scalarColumns.has(key) || !ArrayBuffer.isView(values)
      || (plain && !(values instanceof Float64Array)) || Object.hasOwn(map[section].cells, key)) throw invalidGeometry();
    if (plain) {
      const column = new Array(values.length);
      for (let i = 0; i < values.length; i++) column[i] = values[i];
      map[section].cells[key] = column;
    } else map[section].cells[key] = values;
  }
}

export function detachGeneratedGeometry(document, gridOnly = false, previousGrid = null) {
  const map = {...document.map};
  for (const name of gridOnly ? ["grid"] : ["grid", "pack"]) {
    const section = map[name];
    map[name] = {...section, cells: {...section.cells}, vertices: {...section.vertices}};
  }
  const columns = (gridOnly ? gridColumns : rowColumns).map(([section, group, key, Type], index) => {
    const owner = group ? map[section][group] : map[section];
    const rows = owner[key];
    delete owner[key];
    if (section === "grid" && previousGrid &&
        rows === (group ? previousGrid.grid[group][key] : previousGrid.grid[key])) return previousGrid.columns[index];
    const ends = new Uint32Array(rows.length);
    let length = 0;
    for (let i = 0; i < rows.length; i++) {
      length += rows[i].length;
      ends[i] = length;
    }
    const values = new Type(length);
    let offset = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0; j < row.length; j++) values[offset++] = row[j];
    }
    return {ends, values};
  });
  return {document: {...document, map}, columns};
}

export async function attachGeneratedGeometry(map, columns, yieldToMain, gridOnly = false) {
  const spec = gridOnly ? gridColumns : rowColumns;
  if (!Array.isArray(columns) || columns.length !== spec.length) throw invalidGeometry();
  let deadline = performance.now() + 12;
  for (const [index, [section, group, key, Type]] of spec.entries()) {
    const owner = group ? map[section][group] : map[section];
    const {ends, values} = columns[index];
    if (!(ends instanceof Uint32Array) || !(values instanceof Type) ||
        (ends[ends.length - 1] || 0) !== values.length) throw invalidGeometry();
    const rows = new Array(ends.length);
    let start = 0;
    for (let i = 0; i < ends.length; i++) {
      const end = ends[i];
      if (end < start || end > values.length) throw invalidGeometry();
      const row = new Array(end - start);
      for (let j = 0; start < end; j++, start++) row[j] = values[start];
      rows[i] = row;
      if (yieldToMain && (i & 4095) === 4095 && performance.now() >= deadline) {
        await yieldToMain();
        deadline = performance.now() + 12;
      }
    }
    owner[key] = rows;
  }
}

function invalidGeometry() {
  return Object.assign(new Error("新地图几何列长度或类型无效"), {code: "map_adoption_geometry_invalid"});
}

export function restoreGeneratedWorkerColumns(map, source, cells) {
  for (const [section, group, key] of rowColumns) {
    const owner = group ? map[section][group] : map[section];
    const data = group ? source[section][group][key] : source[section][key];
    // pack 布点会借用 grid 的坐标对；两个可编辑的规范分区各自拥有其坐标。
    owner[key] = section === "pack" && group === "cells" && key === "p" ? data.map(point => [...point]) : data;
  }
  const seen = new Set();
  for (const {section, key} of cells) {
    const data = source[section].cells[key];
    map[section].cells[key] = seen.has(data) ? data.slice() : data;
    seen.add(data);
  }
}
