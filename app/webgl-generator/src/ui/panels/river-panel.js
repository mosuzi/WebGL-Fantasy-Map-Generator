import {createObjectTable} from "../components/object-table.js";

export function createRiverPanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "flux",
    sortDir: "desc"
  };

  manager.registerPanel("river-panel", {
    title: "河流管理",
    left: 380,
    top: 56,
    width: 520,
    maxWidth: 620
  });

  function render() {
    manager.setContent("river-panel", renderRiverPanel(documentRef, panelState, {
      onFilter: value => {
        panelState.filter = value;
        render();
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortKey = key;
          panelState.sortDir = key === "id" ? "asc" : "desc";
        }
        render();
      },
      onSelect: row => callbacks.onSelect?.(riverObject(row)),
      onLocate: row => callbacks.onLocate?.(riverObject(row)),
      onEdit: row => callbacks.onEdit?.(riverObject(row)),
      onSetWidthFactor: (riverId, widthFactor) => callbacks.onSetWidthFactor?.(riverId, widthFactor),
      onUndo: () => callbacks.onUndo?.(),
      onRedo: () => callbacks.onRedo?.()
    }));
  }

  return {
    open(map, selection, history) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      render();
      manager.open("river-panel");
    },
    update(map, selection, history) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      render();
    }
  };
}

function renderRiverPanel(documentRef, state, callbacks) {
  const metrics = buildRiverMetrics(state.map);
  const selectedId = state.selection?.object?.kind === "river" ? state.selection.object.id : null;
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);

  const summary = documentRef.createElement("div");
  summary.className = "river-panel-summary";
  summary.append(
    summaryItem(documentRef, "河流", metrics.total),
    summaryItem(documentRef, "总长度", formatLength(metrics.totalLength)),
    summaryItem(documentRef, "最大流量", formatNumber(metrics.maxFlux)),
    summaryItem(documentRef, "筛选", visibleRows.length)
  );

  const controls = documentRef.createElement("div");
  controls.className = "river-panel-controls";
  const filter = documentRef.createElement("input");
  filter.type = "search";
  filter.placeholder = "筛选名称 / id / 类型";
  filter.value = state.filter;
  filter.addEventListener("input", event => callbacks.onFilter(event.target.value));
  controls.append(filter);

  const sort = documentRef.createElement("div");
  sort.className = "river-panel-sort";
  for (const [key, label] of [["flux", "流量"], ["length", "长度"], ["id", "ID"]]) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = state.sortKey === key ? "active" : "";
    button.textContent = state.sortKey === key ? `${label} ${state.sortDir === "asc" ? "↑" : "↓"}` : label;
    button.addEventListener("click", () => callbacks.onSort(key));
    sort.append(button);
  }

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "name", label: "名称"},
      {key: "type", label: "类型"},
      {key: "length", label: "长度", align: "right", format: value => formatLength(value)},
      {key: "flux", label: "流量", align: "right", format: value => formatNumber(value)}
    ],
    rows: visibleRows,
    selectedId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的河流"
  });

  const selected = selectedId === null ? null : metrics.rows.find(row => row.id === selectedId);
  const details = documentRef.createElement("div");
  details.className = "river-panel-details";
  if (selected) {
    details.append(
      detailLine(documentRef, "选中", `#${selected.id} / ${selected.type}`),
      detailLine(documentRef, "名称", selected.name),
      detailLine(documentRef, "长度", formatLength(selected.length)),
      detailLine(documentRef, "流量", formatNumber(selected.flux)),
      detailLine(documentRef, "河段", selected.segments),
      detailLine(documentRef, "宽度因子", selected.widthFactor.toFixed(2))
    );
    details.append(widthFactorEditor(documentRef, selected, state.history, callbacks));
    const edit = documentRef.createElement("button");
    edit.type = "button";
    edit.className = "secondary-action";
    edit.textContent = "进入河流编辑";
    edit.addEventListener("click", () => callbacks.onEdit(selected));
    details.append(edit);
  } else {
    details.textContent = "未选中河流";
  }

  return [summary, controls, sort, table, details];
}

function buildRiverMetrics(map) {
  const rivers = map?.rivers?.rivers || [];
  let totalLength = 0;
  let maxFlux = 0;
  const rows = rivers.map(river => {
    const length = riverLength(river);
    const flux = river.flux || river.discharge || river.width || 0;
    totalLength += length;
    maxFlux = Math.max(maxFlux, flux);
    return {
      id: river.id,
      name: river.name || `#${river.id}`,
      type: river.parent ? "支流" : "主河",
      length,
      flux,
      widthFactor: Number.isFinite(river.widthFactor) ? river.widthFactor : 1,
      segments: Math.max(0, (river.points?.length || 0) - 1)
    };
  });
  return {rows, total: rows.length, totalLength, maxFlux};
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row => String(row.id).includes(query) || row.name.toLowerCase().includes(query) || row.type.toLowerCase().includes(query));
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    return a[key] > b[key] ? factor : -factor;
  });
}

function riverLength(river) {
  const points = river.points || [];
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function riverObject(row) {
  return {
    kind: "river",
    id: row.id,
    name: row.name,
    type: row.type,
    flux: row.flux,
    length: Math.round(row.length),
    distance: 0
  };
}

function summaryItem(documentRef, label, value) {
  const item = documentRef.createElement("div");
  const term = documentRef.createElement("span");
  const desc = documentRef.createElement("strong");
  term.textContent = label;
  desc.textContent = String(value);
  item.append(term, desc);
  return item;
}

function detailLine(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("span");
  const desc = documentRef.createElement("strong");
  term.textContent = label;
  desc.textContent = String(value);
  row.append(term, desc);
  return row;
}

function widthFactorEditor(documentRef, selected, history, callbacks) {
  const editor = documentRef.createElement("div");
  editor.className = "river-width-editor";

  const label = documentRef.createElement("label");
  const labelText = documentRef.createElement("span");
  labelText.textContent = "宽度因子";
  const input = documentRef.createElement("input");
  input.type = "range";
  input.min = "0.2";
  input.max = "3";
  input.step = "0.05";
  input.value = String(selected.widthFactor);
  const value = documentRef.createElement("strong");
  value.textContent = selected.widthFactor.toFixed(2);
  input.addEventListener("input", () => {
    value.textContent = Number(input.value).toFixed(2);
  });
  label.append(labelText, input, value);

  const actions = documentRef.createElement("div");
  actions.className = "river-width-actions";
  const apply = documentRef.createElement("button");
  apply.type = "button";
  apply.className = "secondary-action";
  apply.textContent = "应用宽度";
  apply.addEventListener("click", () => callbacks.onSetWidthFactor(selected.id, Number(input.value)));
  const undo = documentRef.createElement("button");
  undo.type = "button";
  undo.className = "secondary-action";
  undo.textContent = "撤销上次";
  undo.addEventListener("click", callbacks.onUndo);
  const redo = documentRef.createElement("button");
  redo.type = "button";
  redo.className = "secondary-action";
  redo.textContent = "重做上次";
  redo.addEventListener("click", callbacks.onRedo);
  actions.append(apply, undo, redo);

  const historyLine = documentRef.createElement("div");
  historyLine.className = "river-history-note";
  historyLine.textContent = `最近命令：${history?.lastLabel || "none"}`;

  editor.append(label, actions, historyLine);
  return editor;
}

function formatLength(value) {
  if (!Number.isFinite(value)) return "0";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}k` : value.toFixed(0);
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "0";
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}
