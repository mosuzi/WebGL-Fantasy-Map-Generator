import {createDetailGrid} from "../components/detail-grid.js";
import {createFilterInput} from "../components/filter-input.js";
import {createHistoryActions} from "../components/history-actions.js";
import {createObjectTable} from "../components/object-table.js";
import {createSortBar} from "../components/sort-bar.js";
import {createSummaryGrid} from "../components/summary-grid.js";
import {readTableScrollTop, restoreTableScrollTop} from "../components/table-scroll.js";

export function createStatePanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    active: false,
    map: null,
    targetStateId: null,
    sourceStateId: null,
    filter: "",
    sortKey: "population",
    sortDir: "desc",
    radius: 28,
    lastAffected: 0,
    history: null
  };

  const panelRecord = manager.registerPanel("state-panel", {
    title: "国家编辑",
    left: 400,
    top: 128,
    width: 560,
    maxWidth: 680,
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
      render();
    }
  });

  function render({preserveTableScroll = true} = {}) {
    const tableScrollTop = preserveTableScroll ? readTableScrollTop(panelRecord.body) : 0;
    manager.setContent("state-panel", renderStatePanel(documentRef, panelState, {
      onActiveChange: active => {
        panelState.active = active;
        callbacks.onActiveChange?.(active);
        render();
      },
      onTargetStateId: stateId => {
        panelState.targetStateId = stateId;
        render();
      },
      onFilter: value => {
        panelState.filter = value;
        render({preserveTableScroll: false});
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortKey = key;
          panelState.sortDir = key === "id" || key === "name" ? "asc" : "desc";
        }
        render({preserveTableScroll: false});
      },
      onSelect: row => {
        panelState.targetStateId = row.id;
        callbacks.onSelect?.(stateObject(row));
        render();
      },
      onLocate: row => callbacks.onLocate?.(stateObject(row)),
      onEdit: row => {
        panelState.targetStateId = row.id;
        panelState.active = true;
        callbacks.onActiveChange?.(true);
        callbacks.onEdit?.(stateObject(row));
        render();
      },
      onRename: (stateId, name) => {
        callbacks.onRename?.(stateId, name);
        render();
      },
      onRadius: radius => {
        panelState.radius = radius;
      },
      onColorChange: color => callbacks.onColorChange?.(panelState.targetStateId, color),
      onCapitalChange: burgId => callbacks.onCapitalChange?.(panelState.targetStateId, burgId),
      onSampleSelection: () => callbacks.onSampleSelection?.(),
      onSampleHover: () => callbacks.onSampleHover?.(),
      onUndo: () => callbacks.onUndo?.(),
      onRedo: () => callbacks.onRedo?.()
    }));
    restoreTableScrollTop(panelRecord.body, tableScrollTop);
  }

  return {
    open(map, history) {
      panelState.map = map;
      panelState.history = history;
      if (panelState.targetStateId === null) panelState.targetStateId = firstStateId(map);
      render();
      manager.open("state-panel");
    },
    update({map = panelState.map, sourceStateId = panelState.sourceStateId, lastAffected = panelState.lastAffected, history = panelState.history} = {}) {
      panelState.map = map;
      panelState.sourceStateId = sourceStateId;
      panelState.lastAffected = lastAffected;
      panelState.history = history;
      if (!stateExists(map, panelState.targetStateId)) panelState.targetStateId = firstStateId(map);
      render();
    },
    getBrush() {
      return {
        active: panelState.active,
        targetStateId: panelState.targetStateId,
        radius: panelState.radius
      };
    },
    setTargetStateId(stateId) {
      panelState.targetStateId = stateExists(panelState.map, stateId) ? stateId : panelState.targetStateId;
      render();
    },
    setActive(active) {
      panelState.active = active;
      render();
    }
  };
}

function renderStatePanel(documentRef, state, callbacks) {
  const metrics = buildStateMetrics(state.map);
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);
  const selected = metrics.rows.find(row => row.id === state.targetStateId) || null;

  const summary = createSummaryGrid(documentRef, {
    className: "state-panel-summary",
    items: [
      {label: "状态", value: state.active ? "编辑中" : "未启用"},
      {label: "国家", value: metrics.total},
      {label: "筛选", value: visibleRows.length},
      {label: "目标国家", value: formatStateName(state.map, state.targetStateId)},
      {label: "影响", value: state.lastAffected}
    ]
  });

  const controls = documentRef.createElement("div");
  controls.className = "state-panel-controls";
  const filter = createFilterInput(documentRef, {
    placeholder: "筛选名称 / id / 首都",
    value: state.filter,
    onChange: callbacks.onFilter
  });
  controls.append(filter);

  const sort = createSortBar(documentRef, {
    className: "state-panel-sort",
    options: [["population", "人口"], ["burgs", "城镇"], ["area", "面积"], ["id", "ID"]],
    activeKey: state.sortKey,
    direction: state.sortDir,
    onSort: callbacks.onSort
  });

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "name", label: "名称"},
      {key: "capitalName", label: "首都"},
      {key: "burgs", label: "城镇", align: "right"},
      {key: "population", label: "人口", align: "right", format: value => formatNumber(value)}
    ],
    rows: visibleRows,
    selectedId: state.targetStateId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的国家"
  });

  let detailRows = [];
  if (selected) {
    detailRows = [
      stateNameEditor(documentRef, selected, callbacks),
      {label: "全称", value: selected.fullName},
      {label: "首都", value: selected.capitalName},
      {label: "文化", value: selected.culture},
      {label: "宗教", value: selected.religion},
      {label: "中心 cell", value: selected.centerCell},
      {label: "面积", value: formatNumber(selected.area)},
      {label: "城镇", value: selected.burgs},
      {label: "人口", value: formatNumber(selected.population)},
      {label: "邻国", value: selected.neighborCount}
    ];
    const edit = documentRef.createElement("button");
    edit.type = "button";
    edit.className = "secondary-action";
    edit.textContent = "编辑此国家";
    edit.addEventListener("click", () => callbacks.onEdit(selected));
    detailRows.push(edit);
  }
  const details = createDetailGrid(documentRef, {
    className: "state-panel-details",
    emptyText: "未选中国家",
    rows: detailRows
  });

  const active = documentRef.createElement("button");
  active.type = "button";
  active.className = state.active ? "primary-action" : "secondary-action";
  active.textContent = state.active ? "停止国家编辑" : "启用国家编辑";
  active.addEventListener("click", () => callbacks.onActiveChange(!state.active));

  const target = targetSelector(documentRef, state, callbacks);
  const color = colorField(documentRef, state, callbacks);
  const capital = capitalField(documentRef, state, callbacks);
  const sampleActions = documentRef.createElement("div");
  sampleActions.className = "state-sample-actions";
  const sampleSelection = documentRef.createElement("button");
  sampleSelection.type = "button";
  sampleSelection.className = "secondary-action";
  sampleSelection.textContent = "取选中";
  sampleSelection.addEventListener("click", callbacks.onSampleSelection);
  const sampleHover = documentRef.createElement("button");
  sampleHover.type = "button";
  sampleHover.className = "secondary-action";
  sampleHover.textContent = "取悬停";
  sampleHover.addEventListener("click", callbacks.onSampleHover);
  sampleActions.append(sampleSelection, sampleHover);

  const radius = rangeField(documentRef, "半径", state.radius, 4, 120, 2, value => callbacks.onRadius(value));

  const historyActions = createHistoryActions(documentRef, {
    className: "state-history-actions",
    history: state.history,
    onUndo: callbacks.onUndo,
    onRedo: callbacks.onRedo,
    noteText: `历史：${state.history ? `undo ${state.history.undo} / redo ${state.history.redo} / ${state.history.lastLabel}` : "none"}；来源：${formatStateName(state.map, state.sourceStateId)}`
  });

  return [summary, controls, sort, table, details, active, target, color, capital, sampleActions, radius, historyActions];
}

function targetSelector(documentRef, state, callbacks) {
  const field = documentRef.createElement("label");
  field.className = "state-select-field";
  const text = documentRef.createElement("span");
  text.textContent = "目标";
  const select = documentRef.createElement("select");
  for (const item of stateRows(state.map)) {
    const option = documentRef.createElement("option");
    option.value = String(item.id);
    option.textContent = item.name;
    option.selected = item.id === state.targetStateId;
    select.append(option);
  }
  select.addEventListener("change", () => callbacks.onTargetStateId(Number(select.value)));
  field.append(text, select);
  return field;
}

function colorField(documentRef, state, callbacks) {
  const target = state.map?.politics?.states?.[state.targetStateId];
  const field = documentRef.createElement("label");
  field.className = "state-color-field";
  const text = documentRef.createElement("span");
  text.textContent = "颜色";
  const input = documentRef.createElement("input");
  input.type = "color";
  input.value = normalizeHexColor(target?.color) || fallbackStateColor(state.targetStateId);
  const value = documentRef.createElement("strong");
  value.textContent = input.value;
  input.addEventListener("input", () => {
    value.textContent = input.value;
  });
  input.addEventListener("change", () => callbacks.onColorChange(input.value));
  field.append(text, input, value);
  return field;
}

function capitalField(documentRef, state, callbacks) {
  const target = state.map?.politics?.states?.[state.targetStateId];
  const cities = stateCities(state.map, state.targetStateId);
  const field = documentRef.createElement("div");
  field.className = "state-capital-field";
  const label = documentRef.createElement("label");
  const text = documentRef.createElement("span");
  text.textContent = "首都";
  const select = documentRef.createElement("select");
  select.disabled = !cities.length;
  for (const city of cities) {
    const option = documentRef.createElement("option");
    option.value = String(city.burgId);
    option.textContent = city.name;
    option.selected = city.burgId === target?.capital;
    select.append(option);
  }
  label.append(text, select);

  const apply = documentRef.createElement("button");
  apply.type = "button";
  apply.className = "secondary-action";
  apply.textContent = "设为首都";
  apply.disabled = !cities.length;
  apply.addEventListener("click", () => callbacks.onCapitalChange(Number(select.value)));
  field.append(label, apply);
  return field;
}

function rangeField(documentRef, label, value, min, max, step, onInput) {
  const field = documentRef.createElement("label");
  field.className = "state-range-field";
  const text = documentRef.createElement("span");
  text.textContent = label;
  const input = documentRef.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const output = documentRef.createElement("strong");
  output.textContent = String(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    output.textContent = String(next);
    onInput(next);
  });
  field.append(text, input, output);
  return field;
}

function buildStateMetrics(map) {
  const rows = stateRows(map).map(row => {
    const state = map.politics.states[row.id];
    const capitalCity = findCapitalCity(map, state?.capital);
    const population = (state?.urban || 0) + (state?.rural || 0);
    return {
      id: row.id,
      name: state?.fullName || state?.name || row.name,
      rawName: state?.name || row.name,
      fullName: state?.fullName || state?.name || row.name,
      capitalName: capitalCity?.name || "none",
      culture: indexedName(map?.society?.cultures, state?.culture),
      religion: indexedName(map?.society?.religions, state?.religion),
      centerCell: state?.center ?? state?.gridCenter ?? "none",
      area: state?.area || state?.cells || 0,
      burgs: state?.burgs || stateCities(map, row.id).length,
      population,
      neighborCount: state?.neighbors?.length || 0
    };
  });
  return {rows, total: rows.length};
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.capitalName.toLowerCase().includes(query)
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

function stateObject(row) {
  return {
    kind: "state",
    id: row.id,
    name: row.rawName,
    fullName: row.fullName,
    capitalName: row.capitalName,
    culture: row.culture,
    religion: row.religion,
    centerCell: row.centerCell,
    population: roundNumber(row.population),
    burgs: row.burgs,
    area: roundNumber(row.area)
  };
}

function stateNameEditor(documentRef, selected, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "state-name-editor";
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

function stateRows(map) {
  return (map?.politics?.states || []).filter(state => state?.i || state?.id).map(state => ({
    id: state.id ?? state.i,
    name: state.fullName || state.name || `国家 #${state.id ?? state.i}`
  }));
}

function stateCities(map, stateId) {
  return (map?.settlements?.cities || [])
    .filter(city => city?.burgId && city.state === stateId)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population || a.id - b.id);
}

function findCapitalCity(map, burgId) {
  return (map?.settlements?.cities || []).find(city => city?.burgId === burgId) || null;
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id === undefined || id === null ? "none" : String(id));
}

function firstStateId(map) {
  return stateRows(map)[0]?.id ?? null;
}

function stateExists(map, stateId) {
  if (stateId === null || stateId === undefined) return false;
  return Boolean(map?.politics?.states?.[stateId]);
}

function formatStateName(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  if (!state) return "none";
  return state.fullName || state.name || `#${stateId}`;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackStateColor(stateId) {
  const hue = ((Number(stateId) || 0) * 0.61803398875 + 0.12) % 1;
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
