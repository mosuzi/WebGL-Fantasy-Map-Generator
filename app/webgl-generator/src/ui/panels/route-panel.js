import {createDetailGrid} from "../components/detail-grid.js";
import {createFilterInput} from "../components/filter-input.js";
import {createObjectTable} from "../components/object-table.js";
import {createSortBar} from "../components/sort-bar.js";
import {createSummaryGrid} from "../components/summary-grid.js";
import {readTableScrollTop, restoreTableScrollTop} from "../components/table-scroll.js";

export function createRoutePanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    open: false,
    map: null,
    selection: null,
    filter: "",
    sortKey: "length",
    sortDir: "desc",
    selectedRouteId: null
  };

  const panelRecord = manager.registerPanel("route-panel", {
    title: "路线管理",
    left: 460,
    top: 116,
    width: 560,
    maxWidth: 680,
    onClose: () => {
      panelState.open = false;
    }
  });

  function render({preserveTableScroll = true} = {}) {
    const tableScrollTop = preserveTableScroll ? readTableScrollTop(panelRecord.body) : 0;
    manager.setContent("route-panel", renderRoutePanel(documentRef, panelState, {
      onFilter: value => {
        panelState.filter = value;
        render({preserveTableScroll: false});
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortKey = key;
          panelState.sortDir = key === "id" || key === "type" || key === "fromName" ? "asc" : "desc";
        }
        render({preserveTableScroll: false});
      },
      onSelect: row => {
        panelState.selectedRouteId = row.id;
        callbacks.onSelect?.(routeObject(row));
        render();
      },
      onLocate: row => callbacks.onLocate?.(routeObject(row))
    }));
    restoreTableScrollTop(panelRecord.body, tableScrollTop);
  }

  return {
    open(map, selection) {
      panelState.map = map;
      panelState.selection = selection;
      if (selection?.object?.kind === "route") panelState.selectedRouteId = selection.object.id;
      if (!routeExists(map, panelState.selectedRouteId)) panelState.selectedRouteId = firstRouteId(map);
      render();
      panelState.open = true;
      manager.open("route-panel");
    },
    update(map, selection) {
      panelState.map = map;
      panelState.selection = selection;
      if (selection?.object?.kind === "route") panelState.selectedRouteId = selection.object.id;
      if (!routeExists(map, panelState.selectedRouteId)) panelState.selectedRouteId = firstRouteId(map);
      render();
    },
    setSelectedRouteId(routeId) {
      if (routeExists(panelState.map, routeId)) panelState.selectedRouteId = routeId;
      render();
    },
    isOpen() {
      return panelState.open;
    }
  };
}

function renderRoutePanel(documentRef, state, callbacks) {
  const metrics = buildRouteMetrics(state.map);
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);
  const selected = metrics.rows.find(row => row.id === state.selectedRouteId) || null;

  const summary = createSummaryGrid(documentRef, {
    className: "route-panel-summary",
    items: [
      {label: "路线", value: metrics.total},
      {label: "筛选", value: visibleRows.length},
      {label: "总长度", value: formatNumber(metrics.totalLength)},
      {label: "海路", value: metrics.seaRoutes}
    ]
  });

  const controls = documentRef.createElement("div");
  controls.className = "route-panel-controls";
  const filter = createFilterInput(documentRef, {
    placeholder: "筛选类型 / id / 起点 / 终点",
    value: state.filter,
    onChange: callbacks.onFilter
  });
  controls.append(filter);

  const sort = createSortBar(documentRef, {
    className: "route-panel-sort",
    options: [["length", "长度"], ["segments", "段数"], ["type", "类型"], ["id", "ID"]],
    activeKey: state.sortKey,
    direction: state.sortDir,
    onSort: callbacks.onSort
  });

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "typeLabel", label: "类型"},
      {key: "fromName", label: "起点"},
      {key: "toName", label: "终点"},
      {key: "length", label: "长度", align: "right", format: value => formatNumber(value)}
    ],
    rows: visibleRows,
    selectedId: state.selectedRouteId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的路线"
  });

  const details = createDetailGrid(documentRef, {
    className: "route-panel-details",
    emptyText: "未选中路线",
    rows: selected ? [
      {label: "类型", value: selected.typeLabel},
      {label: "等级", value: selected.level},
      {label: "起点", value: selected.fromName},
      {label: "终点", value: selected.toName},
      {label: "长度", value: formatNumber(selected.length)},
      {label: "段数", value: selected.segments},
      {label: "grid cells", value: selected.cellCount},
      {label: "pack cells", value: selected.packCellCount},
      {label: "feature", value: selected.feature}
    ] : []
  });

  return [summary, controls, sort, table, details];
}

function buildRouteMetrics(map) {
  const rows = routeRows(map);
  return {
    rows,
    total: rows.length,
    totalLength: rows.reduce((sum, row) => sum + row.length, 0),
    seaRoutes: rows.filter(row => row.type === "searoute").length
  };
}

function routeRows(map) {
  return (map?.settlements?.routes || []).map(route => {
    const from = map?.settlements?.cities?.[route.from];
    const to = map?.settlements?.cities?.[route.to];
    return {
      id: route.id,
      type: route.type || "route",
      typeLabel: routeTypeLabel(route.type),
      level: route.level || route.type || "none",
      fromId: route.from,
      toId: route.to,
      fromName: from?.name || (route.from >= 0 ? `#${route.from}` : "unknown"),
      toName: to?.name || (route.to >= 0 ? `#${route.to}` : "unknown"),
      length: routeLength(route),
      segments: Math.max(0, (route.points || []).length - 1),
      cellCount: route.cells?.length || 0,
      packCellCount: route.packCells?.length || 0,
      feature: route.feature ?? "none"
    };
  });
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.typeLabel.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
    || row.fromName.toLowerCase().includes(query)
    || row.toName.toLowerCase().includes(query)
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

function routeObject(row) {
  return {
    kind: "route",
    id: row.id,
    type: row.type,
    level: row.level,
    fromId: row.fromId,
    toId: row.toId,
    from: row.fromName,
    to: row.toName,
    length: roundNumber(row.length),
    segments: row.segments
  };
}

function routeExists(map, routeId) {
  return Boolean(Number.isInteger(routeId) && (map?.settlements?.routes || []).some(route => route.id === routeId));
}

function firstRouteId(map) {
  return map?.settlements?.routes?.[0]?.id ?? null;
}

function routeLength(route) {
  let length = 0;
  const points = route.points || [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}

function routeTypeLabel(type) {
  if (type === "road") return "道路";
  if (type === "trail") return "小径";
  if (type === "searoute") return "海路";
  return type || "路线";
}

function formatNumber(value) {
  return Number.isFinite(value) ? roundNumber(value).toLocaleString("zh-CN") : "0";
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
