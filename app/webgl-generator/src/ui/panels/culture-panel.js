import {createDetailGrid} from "../components/detail-grid.js";
import {createFilterInput} from "../components/filter-input.js";
import {createHistoryActions} from "../components/history-actions.js";
import {createObjectTable} from "../components/object-table.js";
import {createSortBar} from "../components/sort-bar.js";
import {createSummaryGrid} from "../components/summary-grid.js";
import {readTableScrollTop, restoreTableScrollTop} from "../components/table-scroll.js";

export function createCulturePanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "cells",
    sortDir: "desc",
    selectedCultureId: null
  };

  const panelRecord = manager.registerPanel("culture-panel", {
    title: "文化管理",
    left: 492,
    top: 132,
    width: 580,
    maxWidth: 720,
    onClose: () => {
      panelState.open = false;
    }
  });

  function render({preserveTableScroll = true} = {}) {
    const tableScrollTop = preserveTableScroll ? readTableScrollTop(panelRecord.body) : 0;
    manager.setContent("culture-panel", renderCulturePanel(documentRef, panelState, {
      onFilter: value => {
        panelState.filter = value;
        render({preserveTableScroll: false});
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortDir = key === "id" || key === "name" || key === "type" ? "asc" : "desc";
          panelState.sortKey = key;
        }
        render({preserveTableScroll: false});
      },
      onSelect: row => {
        panelState.selectedCultureId = row.id;
        callbacks.onSelect?.(cultureObject(row));
      },
      onLocate: row => callbacks.onLocate?.(cultureObject(row)),
      onRename: (cultureId, name) => callbacks.onRename?.(cultureId, name),
      onColorChange: (cultureId, color) => callbacks.onColorChange?.(cultureId, color),
      onUndo: () => callbacks.onUndo?.(),
      onRedo: () => callbacks.onRedo?.()
    }));
    restoreTableScrollTop(panelRecord.body, tableScrollTop);
  }

  return {
    open(map, selection, history) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "culture") panelState.selectedCultureId = selection.object.id;
      if (!cultureExists(map, panelState.selectedCultureId)) panelState.selectedCultureId = firstCultureId(map);
      render();
      panelState.open = true;
      manager.open("culture-panel");
    },
    update(map, selection, history) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "culture") panelState.selectedCultureId = selection.object.id;
      if (!cultureExists(map, panelState.selectedCultureId)) panelState.selectedCultureId = firstCultureId(map);
      render();
    },
    setSelectedCultureId(cultureId) {
      if (cultureExists(panelState.map, cultureId)) panelState.selectedCultureId = cultureId;
      render();
    },
    isOpen() {
      return panelState.open;
    }
  };
}

function renderCulturePanel(documentRef, state, callbacks) {
  const metrics = buildCultureMetrics(state.map);
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);
  const selected = metrics.rows.find(row => row.id === state.selectedCultureId) || null;

  const summary = createSummaryGrid(documentRef, {
    className: "culture-panel-summary",
    items: [
      {label: "文化", value: metrics.total},
      {label: "筛选", value: visibleRows.length},
      {label: "覆盖 cells", value: metrics.cells},
      {label: "人口", value: formatNumber(metrics.population)},
      {label: "城市", value: metrics.cities}
    ]
  });

  const controls = documentRef.createElement("div");
  controls.className = "culture-panel-controls";
  const filter = createFilterInput(documentRef, {
    placeholder: "筛选名称 / id / 类型 / 国家",
    value: state.filter,
    onChange: callbacks.onFilter
  });
  controls.append(filter);

  const sort = createSortBar(documentRef, {
    className: "culture-panel-sort",
    options: [["cells", "cells"], ["population", "人口"], ["cities", "城市"], ["states", "国家"], ["id", "ID"]],
    activeKey: state.sortKey,
    direction: state.sortDir,
    onSort: callbacks.onSort
  });

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "name", label: "名称"},
      {key: "type", label: "类型"},
      {key: "cells", label: "cells", align: "right"},
      {key: "population", label: "人口", align: "right", format: value => formatNumber(value)},
      {key: "cities", label: "城市", align: "right"}
    ],
    rows: visibleRows,
    selectedId: state.selectedCultureId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的文化"
  });

  const details = createDetailGrid(documentRef, {
    className: "culture-panel-details",
    emptyText: "未选中文化",
    rows: selected ? [
      cultureNameEditor(documentRef, selected, callbacks),
      {label: "词根", value: selected.root},
      {label: "类型", value: selected.type},
      {label: "命名风格", value: selected.nameStyle},
      {label: "扩张", value: selected.expansionism},
      {label: "中心 pack cell", value: selected.centerCell},
      {label: "中心 grid cell", value: selected.gridCenterCell},
      {label: "覆盖 cells", value: selected.cells},
      {label: "面积", value: formatNumber(selected.area)},
      {label: "乡村人口", value: formatNumber(selected.rural)},
      {label: "城市人口", value: formatNumber(selected.urban)},
      {label: "城市", value: selected.cities},
      {label: "主要国家", value: selected.stateSummary},
      cultureColorField(documentRef, selected, callbacks)
    ] : []
  });

  const historyActions = createHistoryActions(documentRef, {
    className: "culture-history-actions",
    history: state.history,
    onUndo: callbacks.onUndo,
    onRedo: callbacks.onRedo
  });

  return [summary, controls, sort, table, details, historyActions];
}

function buildCultureMetrics(map) {
  const rows = cultureRows(map).map(culture => {
    const cities = cultureCities(map, culture.id);
    const stateStats = cultureStateStats(map, culture.id);
    const urban = cities.reduce((sum, city) => sum + (Number(city.population) || 0), 0);
    const rural = Number(culture.rural) || 0;
    return {
      id: culture.id,
      name: culture.name,
      rawName: culture.rawName,
      root: culture.root,
      type: culture.type,
      nameStyle: culture.nameStyle,
      expansionism: culture.expansionism,
      centerCell: culture.centerCell,
      gridCenterCell: culture.gridCenterCell,
      cells: culture.cells,
      area: culture.area,
      rural,
      urban,
      population: rural + urban,
      cities: cities.length,
      states: stateStats.length,
      stateSummary: stateStats.slice(0, 4).map(item => `${item.name} ${item.count}`).join(" / ") || "none",
      color: normalizeHexColor(culture.color) || fallbackCultureColor(culture.id)
    };
  });

  return {
    rows,
    total: rows.length,
    cells: rows.reduce((sum, row) => sum + row.cells, 0),
    population: rows.reduce((sum, row) => sum + row.population, 0),
    cities: rows.reduce((sum, row) => sum + row.cities, 0)
  };
}

function cultureRows(map) {
  return (map?.society?.cultures || map?.pack?.cultures || [])
    .filter(culture => culture && !culture.removed && Number.isInteger(culture.i ?? culture.id) && (culture.i ?? culture.id) > 0)
    .map(culture => ({
      id: culture.i ?? culture.id,
      name: culture.name || `文化 #${culture.i ?? culture.id}`,
      rawName: culture.name || `文化 #${culture.i ?? culture.id}`,
      root: culture.root || (culture.name || "").replace(/文化$/, "") || "none",
      type: culture.type || "Generic",
      nameStyle: culture.nameStyle || "default",
      expansionism: Number.isFinite(culture.expansionism) ? culture.expansionism : "none",
      centerCell: culture.center ?? "none",
      gridCenterCell: culture.gridCenter ?? "none",
      cells: Number(culture.cells) || 0,
      area: Number(culture.area) || 0,
      rural: Number(culture.rural) || 0,
      color: culture.color
    }));
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
    || row.nameStyle.toLowerCase().includes(query)
    || row.stateSummary.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function cultureObject(row) {
  return {
    kind: "culture",
    id: row.id,
    name: row.rawName,
    type: row.type,
    nameStyle: row.nameStyle,
    centerCell: row.centerCell,
    gridCenterCell: row.gridCenterCell,
    cells: row.cells,
    population: roundNumber(row.population),
    cities: row.cities,
    states: row.states
  };
}

function cultureNameEditor(documentRef, selected, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "culture-name-editor";
  const label = documentRef.createElement("label");
  const text = documentRef.createElement("span");
  text.textContent = "名称";
  const input = documentRef.createElement("input");
  input.type = "text";
  input.maxLength = 48;
  input.value = selected.rawName || "";
  label.append(text, input);

  const apply = documentRef.createElement("button");
  apply.type = "submit";
  apply.className = "secondary-action";
  apply.textContent = "应用名称";
  editor.addEventListener("submit", event => {
    event.preventDefault();
    callbacks.onRename(selected.id, input.value);
  });

  editor.append(label, apply);
  return editor;
}

function cultureColorField(documentRef, selected, callbacks) {
  const field = documentRef.createElement("label");
  field.className = "culture-color-field";
  const text = documentRef.createElement("span");
  text.textContent = "颜色";
  const input = documentRef.createElement("input");
  input.type = "color";
  input.value = selected.color;
  const value = documentRef.createElement("strong");
  value.textContent = selected.color;
  input.addEventListener("input", () => {
    value.textContent = input.value;
  });
  input.addEventListener("change", () => callbacks.onColorChange(selected.id, input.value));
  field.append(text, input, value);
  return field;
}

function cultureCities(map, cultureId) {
  return (map?.settlements?.cities || []).filter(city => Number(city?.culture) === cultureId);
}

function cultureStateStats(map, cultureId) {
  const counts = new Map();
  for (const city of cultureCities(map, cultureId)) {
    const stateId = Number(city.state) || 0;
    counts.set(stateId, (counts.get(stateId) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([stateId, count]) => ({
      stateId,
      count,
      name: map?.politics?.states?.[stateId]?.name || (stateId ? `#${stateId}` : "none")
    }))
    .sort((a, b) => b.count - a.count || a.stateId - b.stateId);
}

function cultureExists(map, cultureId) {
  return Boolean(Number.isInteger(cultureId) && (map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId]));
}

function firstCultureId(map) {
  return cultureRows(map)[0]?.id ?? null;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackCultureColor(cultureId) {
  const hue = ((Number(cultureId) || 0) * 0.61803398875 + 0.31) % 1;
  const [r, g, b] = hslToRgb(hue, 0.42, 0.56);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function toHex(channel) {
  return Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0");
}

function formatNumber(value) {
  return Number.isFinite(value) ? roundNumber(value).toLocaleString("zh-CN") : "0";
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
