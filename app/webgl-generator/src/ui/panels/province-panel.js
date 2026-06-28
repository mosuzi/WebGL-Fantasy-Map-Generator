import {createDetailGrid} from "../components/detail-grid.js";
import {createFilterInput} from "../components/filter-input.js";
import {createHistoryActions} from "../components/history-actions.js";
import {createObjectTable} from "../components/object-table.js";
import {createSortBar} from "../components/sort-bar.js";
import {createSummaryGrid} from "../components/summary-grid.js";
import {readTableScrollTop, restoreTableScrollTop} from "../components/table-scroll.js";

export function createProvincePanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    active: false,
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "area",
    sortDir: "desc",
    selectedProvinceId: null,
    radius: 28,
    lastAffected: 0,
    sourceProvinceId: null
  };

  const panelRecord = manager.registerPanel("province-panel", {
    title: "省份管理",
    left: 420,
    top: 92,
    width: 560,
    maxWidth: 680,
    onClose: () => {
      panelState.active = false;
      panelState.open = false;
      callbacks.onActiveChange?.(false);
      render();
    }
  });

  function render({preserveTableScroll = true} = {}) {
    const tableScrollTop = preserveTableScroll ? readTableScrollTop(panelRecord.body) : 0;
    manager.setContent("province-panel", renderProvincePanel(documentRef, panelState, {
      onFilter: value => {
        panelState.filter = value;
        render({preserveTableScroll: false});
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortDir = key === "id" || key === "name" || key === "stateName" ? "asc" : "desc";
          panelState.sortKey = key;
        }
        render({preserveTableScroll: false});
      },
      onSelect: row => {
        panelState.selectedProvinceId = row.id;
        callbacks.onSelect?.(provinceObject(row));
        render();
      },
      onLocate: row => callbacks.onLocate?.(provinceObject(row)),
      onEdit: row => {
        panelState.selectedProvinceId = row.id;
        panelState.active = true;
        callbacks.onActiveChange?.(true);
        callbacks.onEdit?.(provinceObject(row));
        render();
      },
      onActiveChange: active => {
        panelState.active = active;
        callbacks.onActiveChange?.(active);
        render();
      },
      onTargetProvinceId: provinceId => {
        panelState.selectedProvinceId = provinceId;
        render();
      },
      onRadius: radius => {
        panelState.radius = radius;
      },
      onSampleSelection: () => callbacks.onSampleSelection?.(),
      onSampleHover: () => callbacks.onSampleHover?.(),
      onRename: (provinceId, name) => callbacks.onRename?.(provinceId, name),
      onColorChange: (provinceId, color) => callbacks.onColorChange?.(provinceId, color),
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
      if (!panelState.active && selection?.object?.kind === "province") panelState.selectedProvinceId = selection.object.id;
      if (!provinceExists(map, panelState.selectedProvinceId)) panelState.selectedProvinceId = firstProvinceId(map);
      render();
      panelState.open = true;
      manager.open("province-panel");
    },
    update(map, selection, history, editState = {}) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      panelState.lastAffected = editState.lastAffected ?? panelState.lastAffected;
      panelState.sourceProvinceId = editState.sourceProvinceId ?? panelState.sourceProvinceId;
      if (!panelState.active && selection?.object?.kind === "province") panelState.selectedProvinceId = selection.object.id;
      if (!provinceExists(map, panelState.selectedProvinceId)) panelState.selectedProvinceId = firstProvinceId(map);
      render();
    },
    setSelectedProvinceId(provinceId) {
      if (provinceExists(panelState.map, provinceId)) panelState.selectedProvinceId = provinceId;
      render();
    },
    getBrush() {
      return {
        active: panelState.active,
        targetProvinceId: panelState.selectedProvinceId,
        radius: panelState.radius
      };
    },
    setActive(active) {
      panelState.active = active;
      render();
    },
    isOpen() {
      return panelState.open;
    }
  };
}

function renderProvincePanel(documentRef, state, callbacks) {
  const metrics = buildProvinceMetrics(state.map);
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);
  const selected = metrics.rows.find(row => row.id === state.selectedProvinceId) || null;

  const summary = createSummaryGrid(documentRef, {
    className: "province-panel-summary",
    items: [
      {label: "状态", value: state.active ? "编辑中" : "未启用"},
      {label: "省份", value: metrics.total},
      {label: "筛选", value: visibleRows.length},
      {label: "目标省份", value: formatProvinceName(state.map, state.selectedProvinceId)},
      {label: "影响", value: state.lastAffected}
    ]
  });

  const controls = documentRef.createElement("div");
  controls.className = "province-panel-controls";
  const filter = createFilterInput(documentRef, {
    placeholder: "筛选名称 / id / 国家",
    value: state.filter,
    onChange: callbacks.onFilter
  });
  controls.append(filter);

  const sort = createSortBar(documentRef, {
    className: "province-panel-sort",
    options: [["area", "面积"], ["cells", "cells"], ["stateName", "国家"], ["id", "ID"]],
    activeKey: state.sortKey,
    direction: state.sortDir,
    onSort: callbacks.onSort
  });

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "name", label: "名称"},
      {key: "stateName", label: "国家"},
      {key: "cells", label: "cells", align: "right"},
      {key: "area", label: "面积", align: "right", format: value => formatNumber(value)}
    ],
    rows: visibleRows,
    selectedId: state.selectedProvinceId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的省份"
  });

  let detailRows = [];
  if (selected) {
    detailRows = [
      provinceNameEditor(documentRef, selected, callbacks),
      {label: "全称", value: selected.fullName},
      {label: "所属国家", value: selected.stateName},
      {label: "中心 pack cell", value: selected.centerCell},
      {label: "中心 grid cell", value: selected.gridCenterCell},
      {label: "pole", value: selected.pole},
      {label: "面积", value: formatNumber(selected.area)},
      {label: "cells", value: selected.cells},
      {label: "邻接省份", value: selected.neighborCount},
      {label: "城市", value: selected.cityCount},
      {label: "文化", value: selected.culture},
      {label: "宗教", value: selected.religion},
      provinceColorField(documentRef, selected, callbacks)
    ];
    const edit = documentRef.createElement("button");
    edit.type = "button";
    edit.className = "secondary-action";
    edit.textContent = "编辑此省份";
    edit.addEventListener("click", () => callbacks.onEdit(selected));
    detailRows.push(edit);
  }
  const details = createDetailGrid(documentRef, {
    className: "province-panel-details",
    emptyText: "未选中省份",
    rows: detailRows
  });

  const active = documentRef.createElement("button");
  active.type = "button";
  active.className = state.active ? "primary-action" : "secondary-action";
  active.textContent = state.active ? "停止省份编辑" : "启用省份编辑";
  active.addEventListener("click", () => callbacks.onActiveChange(!state.active));

  const target = targetSelector(documentRef, state, callbacks);
  const sampleActions = documentRef.createElement("div");
  sampleActions.className = "province-sample-actions";
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
    className: "province-history-actions",
    history: state.history,
    onUndo: callbacks.onUndo,
    onRedo: callbacks.onRedo,
    noteText: `历史：${state.history ? `undo ${state.history.undo} / redo ${state.history.redo} / ${state.history.lastLabel}` : "none"}；来源：${formatProvinceName(state.map, state.sourceProvinceId)}`
  });

  return [summary, controls, sort, table, details, active, target, sampleActions, radius, historyActions];
}

function targetSelector(documentRef, state, callbacks) {
  const field = documentRef.createElement("label");
  field.className = "province-select-field";
  const text = documentRef.createElement("span");
  text.textContent = "目标";
  const select = documentRef.createElement("select");
  for (const item of provinceRows(state.map)) {
    const option = documentRef.createElement("option");
    option.value = String(item.id);
    option.textContent = item.name;
    option.selected = item.id === state.selectedProvinceId;
    select.append(option);
  }
  select.addEventListener("change", () => callbacks.onTargetProvinceId(Number(select.value)));
  field.append(text, select);
  return field;
}

function rangeField(documentRef, label, value, min, max, step, onChange) {
  const field = documentRef.createElement("label");
  field.className = "province-range-field";
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
    output.textContent = input.value;
    onChange(Number(input.value));
  });
  field.append(text, input, output);
  return field;
}

function buildProvinceMetrics(map) {
  const rows = provinceRows(map).map(row => {
    const province = getProvince(map, row.id);
    const state = map?.politics?.states?.[province?.state];
    const centerCell = province?.center ?? 0;
    const cultureId = map?.pack?.cells?.culture?.[centerCell];
    const religionId = province?.religion ?? map?.pack?.cells?.religion?.[centerCell];
    const cityCount = (map?.settlements?.cities || []).filter(city => city?.province === row.id).length;
    return {
      id: row.id,
      name: province?.fullName || province?.name || row.name,
      rawName: province?.name || row.name,
      fullName: province?.fullName || province?.name || row.name,
      stateId: province?.state || 0,
      stateName: state?.fullName || state?.name || (province?.state ? `#${province.state}` : "none"),
      centerCell,
      gridCenterCell: province?.gridCenter ?? map?.pack?.cells?.g?.[centerCell] ?? "none",
      pole: formatPole(province?.pole),
      area: province?.area || 0,
      cells: province?.cells || 0,
      neighborCount: province?.neighbors?.length || 0,
      cityCount,
      culture: indexedName(map?.society?.cultures, cultureId),
      religion: indexedName(map?.society?.religions, religionId),
      color: normalizeHexColor(province?.color) || normalizeHexColor(state?.color) || fallbackProvinceColor(row.id)
    };
  });
  const totalArea = rows.reduce((sum, row) => sum + row.area, 0);
  const maxArea = rows.reduce((max, row) => Math.max(max, row.area), 0);
  return {rows, total: rows.length, totalArea, maxArea};
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
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

function provinceRows(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || [])
    .filter(province => province && !province.removed && Number.isInteger(province.i ?? province.id))
    .map(province => ({
      id: province.i ?? province.id,
      name: province.fullName || province.name || `省份 #${province.i ?? province.id}`
    }));
}

function provinceObject(row) {
  return {
    kind: "province",
    id: row.id,
    name: row.rawName,
    fullName: row.fullName,
    state: row.stateName,
    stateId: row.stateId,
    centerCell: row.centerCell,
    pole: row.pole,
    area: roundNumber(row.area),
    cells: row.cells
  };
}

function provinceNameEditor(documentRef, selected, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "province-name-editor";
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

function provinceColorField(documentRef, selected, callbacks) {
  const field = documentRef.createElement("label");
  field.className = "province-color-field";
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

function getProvince(map, provinceId) {
  return map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId] || null;
}

function provinceExists(map, provinceId) {
  return Boolean(Number.isInteger(provinceId) && getProvince(map, provinceId));
}

function firstProvinceId(map) {
  return provinceRows(map)[0]?.id ?? null;
}

function formatProvinceName(map, provinceId) {
  const province = getProvince(map, provinceId);
  return province?.fullName || province?.name || (provinceId ? `#${provinceId}` : "none");
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id === undefined || id === null ? "none" : String(id));
}

function formatPole(pole) {
  return Array.isArray(pole) ? pole.map(value => roundNumber(value)).join(", ") : "none";
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackProvinceColor(provinceId) {
  const hue = ((Number(provinceId) || 0) * 0.61803398875 + 0.3) % 1;
  const [r, g, b] = hslToRgb(hue, 0.38, 0.58);
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
