import {createDetailGrid} from "../components/detail-grid.js";
import {createFilterInput} from "../components/filter-input.js";
import {createHistoryActions} from "../components/history-actions.js";
import {createObjectTable} from "../components/object-table.js";
import {createSortBar} from "../components/sort-bar.js";
import {createSummaryGrid} from "../components/summary-grid.js";
import {readTableScrollTop, restoreTableScrollTop} from "../components/table-scroll.js";

export function createReligionPanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "cells",
    sortDir: "desc",
    selectedReligionId: null
  };

  const panelRecord = manager.registerPanel("religion-panel", {
    title: "宗教管理",
    left: 524,
    top: 164,
    width: 600,
    maxWidth: 740,
    onClose: () => {
      panelState.open = false;
    }
  });

  function render({preserveTableScroll = true} = {}) {
    const tableScrollTop = preserveTableScroll ? readTableScrollTop(panelRecord.body) : 0;
    manager.setContent("religion-panel", renderReligionPanel(documentRef, panelState, {
      onFilter: value => {
        panelState.filter = value;
        render({preserveTableScroll: false});
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortDir = key === "id" || key === "name" || key === "type" || key === "form" ? "asc" : "desc";
          panelState.sortKey = key;
        }
        render({preserveTableScroll: false});
      },
      onSelect: row => {
        panelState.selectedReligionId = row.id;
        callbacks.onSelect?.(religionObject(row));
      },
      onLocate: row => callbacks.onLocate?.(religionObject(row)),
      onRename: (religionId, name) => callbacks.onRename?.(religionId, name),
      onColorChange: (religionId, color) => callbacks.onColorChange?.(religionId, color),
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
      if (selection?.object?.kind === "religion") panelState.selectedReligionId = selection.object.id;
      if (!religionExists(map, panelState.selectedReligionId)) panelState.selectedReligionId = firstReligionId(map);
      render();
      panelState.open = true;
      manager.open("religion-panel");
    },
    update(map, selection, history) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "religion") panelState.selectedReligionId = selection.object.id;
      if (!religionExists(map, panelState.selectedReligionId)) panelState.selectedReligionId = firstReligionId(map);
      render();
    },
    setSelectedReligionId(religionId) {
      if (religionExists(panelState.map, religionId)) panelState.selectedReligionId = religionId;
      render();
    },
    isOpen() {
      return panelState.open;
    }
  };
}

function renderReligionPanel(documentRef, state, callbacks) {
  const metrics = buildReligionMetrics(state.map);
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);
  const selected = metrics.rows.find(row => row.id === state.selectedReligionId) || null;

  const summary = createSummaryGrid(documentRef, {
    className: "religion-panel-summary",
    items: [
      {label: "宗教", value: metrics.total},
      {label: "筛选", value: visibleRows.length},
      {label: "覆盖 cells", value: metrics.cells},
      {label: "人口", value: formatNumber(metrics.population)},
      {label: "城市", value: metrics.cities}
    ]
  });

  const controls = documentRef.createElement("div");
  controls.className = "religion-panel-controls";
  controls.append(createFilterInput(documentRef, {
    placeholder: "筛选名称 / id / 类型 / 文化 / 国家",
    value: state.filter,
    onChange: callbacks.onFilter
  }));

  const sort = createSortBar(documentRef, {
    className: "religion-panel-sort",
    options: [["cells", "cells"], ["population", "人口"], ["cities", "城市"], ["cultures", "文化"], ["states", "国家"], ["id", "ID"]],
    activeKey: state.sortKey,
    direction: state.sortDir,
    onSort: callbacks.onSort
  });

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "name", label: "名称"},
      {key: "type", label: "类型"},
      {key: "form", label: "形态"},
      {key: "cells", label: "cells", align: "right"},
      {key: "population", label: "人口", align: "right", format: value => formatNumber(value)}
    ],
    rows: visibleRows,
    selectedId: state.selectedReligionId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的宗教"
  });

  const details = createDetailGrid(documentRef, {
    className: "religion-panel-details",
    emptyText: "未选中宗教",
    rows: selected ? [
      religionNameEditor(documentRef, selected, callbacks),
      {label: "类型", value: selected.type},
      {label: "形态", value: selected.form},
      {label: "扩张范围", value: selected.expansion},
      {label: "扩张强度", value: selected.expansionism},
      {label: "主神", value: selected.deity},
      {label: "所属文化", value: selected.cultureName},
      {label: "中心 pack cell", value: selected.centerCell},
      {label: "中心 grid cell", value: selected.gridCenterCell},
      {label: "覆盖 cells", value: selected.cells},
      {label: "面积", value: formatNumber(selected.area)},
      {label: "乡村人口", value: formatNumber(selected.rural)},
      {label: "城市人口", value: formatNumber(selected.urban)},
      {label: "城市", value: selected.cities},
      {label: "主要国家", value: selected.stateSummary},
      {label: "主要文化", value: selected.cultureSummary},
      religionColorField(documentRef, selected, callbacks)
    ] : []
  });

  const historyActions = createHistoryActions(documentRef, {
    className: "religion-history-actions",
    history: state.history,
    onUndo: callbacks.onUndo,
    onRedo: callbacks.onRedo
  });

  return [summary, controls, sort, table, details, historyActions];
}

function buildReligionMetrics(map) {
  const rows = religionRows(map).map(religion => {
    const cities = religionCities(map, religion.id);
    const stateStats = religionStateStats(map, cities);
    const cultureStats = religionCultureStats(map, cities);
    const urban = cities.reduce((sum, city) => sum + (Number(city.population) || 0), 0);
    const rural = Number(religion.rural) || 0;
    return {
      id: religion.id,
      name: religion.name,
      rawName: religion.rawName,
      type: religion.type,
      form: religion.form,
      expansion: religion.expansion,
      expansionism: religion.expansionism,
      deity: religion.deity,
      cultureId: religion.cultureId,
      cultureName: indexedName(map?.society?.cultures || map?.pack?.cultures, religion.cultureId),
      centerCell: religion.centerCell,
      gridCenterCell: religion.gridCenterCell,
      cells: religion.cells,
      area: religion.area,
      rural,
      urban,
      population: rural + urban,
      cities: cities.length,
      states: stateStats.length,
      cultures: cultureStats.length,
      stateSummary: stateStats.slice(0, 4).map(item => `${item.name} ${item.count}`).join(" / ") || "none",
      cultureSummary: cultureStats.slice(0, 4).map(item => `${item.name} ${item.count}`).join(" / ") || "none",
      color: normalizeHexColor(religion.color) || fallbackReligionColor(religion.id)
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

function religionRows(map) {
  return (map?.society?.religions || map?.pack?.religions || [])
    .filter(religion => religion && !religion.removed && Number.isInteger(religion.i ?? religion.id) && (religion.i ?? religion.id) > 0)
    .map(religion => ({
      id: religion.i ?? religion.id,
      name: religion.name || `宗教 #${religion.i ?? religion.id}`,
      rawName: religion.name || `宗教 #${religion.i ?? religion.id}`,
      type: religion.type || "Generic",
      form: religion.form || "none",
      expansion: religion.expansion || "none",
      expansionism: Number.isFinite(religion.expansionism) ? religion.expansionism : "none",
      deity: religion.deity || "none",
      cultureId: Number(religion.culture) || 0,
      centerCell: religion.center ?? "none",
      gridCenterCell: religion.gridCenter ?? "none",
      cells: Number(religion.cells) || 0,
      area: Number(religion.area) || 0,
      rural: Number(religion.rural) || 0,
      color: religion.color
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
    || row.form.toLowerCase().includes(query)
    || row.cultureName.toLowerCase().includes(query)
    || row.stateSummary.toLowerCase().includes(query)
    || row.cultureSummary.toLowerCase().includes(query)
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

function religionObject(row) {
  return {
    kind: "religion",
    id: row.id,
    name: row.rawName,
    type: row.type,
    form: row.form,
    culture: row.cultureName,
    centerCell: row.centerCell,
    gridCenterCell: row.gridCenterCell,
    cells: row.cells,
    population: roundNumber(row.population),
    cities: row.cities,
    states: row.states
  };
}

function religionNameEditor(documentRef, selected, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "religion-name-editor";
  const label = documentRef.createElement("label");
  const text = documentRef.createElement("span");
  text.textContent = "名称";
  const input = documentRef.createElement("input");
  input.type = "text";
  input.maxLength = 64;
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

function religionColorField(documentRef, selected, callbacks) {
  const field = documentRef.createElement("label");
  field.className = "religion-color-field";
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

function religionCities(map, religionId) {
  return (map?.settlements?.cities || []).filter(city => Number(city?.religion) === religionId);
}

function religionStateStats(map, cities) {
  return countBy(cities, city => Number(city.state) || 0)
    .map(([stateId, count]) => ({
      stateId,
      count,
      name: indexedName(map?.politics?.states, stateId)
    }))
    .sort((a, b) => b.count - a.count || a.stateId - b.stateId);
}

function religionCultureStats(map, cities) {
  return countBy(cities, city => Number(city.culture) || 0)
    .map(([cultureId, count]) => ({
      cultureId,
      count,
      name: indexedName(map?.society?.cultures || map?.pack?.cultures, cultureId)
    }))
    .sort((a, b) => b.count - a.count || a.cultureId - b.cultureId);
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()];
}

function indexedName(items, id) {
  return items?.[id]?.name || (id ? `#${id}` : "none");
}

function religionExists(map, religionId) {
  return Boolean(Number.isInteger(religionId) && (map?.society?.religions?.[religionId] || map?.pack?.religions?.[religionId]));
}

function firstReligionId(map) {
  return religionRows(map)[0]?.id ?? null;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackReligionColor(religionId) {
  const hue = ((Number(religionId) || 0) * 0.61803398875 + 0.63) % 1;
  const [r, g, b] = hslToRgb(hue, 0.5, 0.58);
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
