import {createDetailGrid} from "../components/detail-grid.js";
import {createFilterInput} from "../components/filter-input.js";
import {createHistoryActions} from "../components/history-actions.js";
import {createObjectTable} from "../components/object-table.js";
import {createSortBar} from "../components/sort-bar.js";
import {createSummaryGrid} from "../components/summary-grid.js";
import {readTableScrollTop, restoreTableScrollTop} from "../components/table-scroll.js";

export function createCityPanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "population",
    sortDir: "desc",
    selectedCityId: null
  };

  const panelRecord = manager.registerPanel("city-panel", {
    title: "城市管理",
    left: 456,
    top: 112,
    width: 600,
    maxWidth: 720,
    onClose: () => {
      panelState.open = false;
    }
  });

  function render({preserveTableScroll = true} = {}) {
    const tableScrollTop = preserveTableScroll ? readTableScrollTop(panelRecord.body) : 0;
    manager.setContent("city-panel", renderCityPanel(documentRef, panelState, {
      onFilter: value => {
        panelState.filter = value;
        render({preserveTableScroll: false});
      },
      onSort: key => {
        if (panelState.sortKey === key) {
          panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
        } else {
          panelState.sortDir = key === "id" || key === "name" || key === "stateName" || key === "provinceName" || key === "type" ? "asc" : "desc";
          panelState.sortKey = key;
        }
        render({preserveTableScroll: false});
      },
      onSelect: row => {
        panelState.selectedCityId = row.id;
        callbacks.onSelect?.(cityObject(row));
      },
      onLocate: row => callbacks.onLocate?.(cityObject(row)),
      onRename: (cityId, name) => callbacks.onRename?.(cityId, name),
      onPopulationChange: (cityId, population) => callbacks.onPopulationChange?.(cityId, population),
      onSyncOwnerToCell: cityId => callbacks.onSyncOwnerToCell?.(cityId),
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
      if (selection?.object?.kind === "city") panelState.selectedCityId = selection.object.id;
      if (!cityExists(map, panelState.selectedCityId)) panelState.selectedCityId = firstCityId(map);
      render();
      panelState.open = true;
      manager.open("city-panel");
    },
    update(map, selection, history) {
      panelState.map = map;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "city") panelState.selectedCityId = selection.object.id;
      if (!cityExists(map, panelState.selectedCityId)) panelState.selectedCityId = firstCityId(map);
      render();
    },
    setSelectedCityId(cityId) {
      if (cityExists(panelState.map, cityId)) panelState.selectedCityId = cityId;
      render();
    },
    isOpen() {
      return panelState.open;
    }
  };
}

function renderCityPanel(documentRef, state, callbacks) {
  const metrics = buildCityMetrics(state.map);
  const visibleRows = sortRows(filterRows(metrics.rows, state.filter), state.sortKey, state.sortDir);
  const selected = metrics.rows.find(row => row.id === state.selectedCityId) || null;

  const summary = createSummaryGrid(documentRef, {
    className: "city-panel-summary",
    items: [
      {label: "城市", value: metrics.total},
      {label: "首都", value: metrics.capitals},
      {label: "港口", value: metrics.ports},
      {label: "人口", value: formatNumber(metrics.totalPopulation)},
      {label: "筛选", value: visibleRows.length}
    ]
  });

  const controls = documentRef.createElement("div");
  controls.className = "city-panel-controls";
  const filter = createFilterInput(documentRef, {
    placeholder: "筛选名称 / id / 国家 / 省份",
    value: state.filter,
    onChange: callbacks.onFilter
  });
  controls.append(filter);

  const sort = createSortBar(documentRef, {
    className: "city-panel-sort",
    options: [["population", "人口"], ["type", "类型"], ["stateName", "国家"], ["provinceName", "省份"], ["id", "ID"]],
    activeKey: state.sortKey,
    direction: state.sortDir,
    onSort: callbacks.onSort
  });

  const table = createObjectTable(documentRef, {
    columns: [
      {key: "id", label: "ID", align: "right"},
      {key: "name", label: "名称"},
      {key: "type", label: "类型"},
      {key: "stateName", label: "国家"},
      {key: "provinceName", label: "省份"},
      {key: "population", label: "人口", align: "right", format: value => formatNumber(value)}
    ],
    rows: visibleRows,
    selectedId: state.selectedCityId,
    getRowId: row => row.id,
    onSelect: callbacks.onSelect,
    onLocate: callbacks.onLocate,
    emptyText: "没有匹配的城市"
  });

  const details = createDetailGrid(documentRef, {
    className: "city-panel-details",
    emptyText: "未选中城市",
    rows: selected ? [
      cityNameEditor(documentRef, selected, callbacks),
      {label: "类型", value: selected.type},
      {label: "标记", value: selected.flags},
      {label: "所属国家", value: selected.stateName},
      {label: "所属省份", value: selected.provinceName},
      cityPopulationEditor(documentRef, selected, callbacks),
      {label: "所在 cell 归属", value: selected.cellOwnerName},
      {label: "归属一致性", value: selected.ownerConsistency},
      {label: "落水检查", value: selected.waterStatus},
      cityOwnerSyncAction(documentRef, selected, callbacks),
      cityAnomalyNotice(documentRef, selected),
      {label: "grid cell", value: selected.cell},
      {label: "pack cell", value: selected.packCell},
      {label: "burg id", value: selected.burgId},
      {label: "文化", value: selected.culture},
      {label: "宗教", value: selected.religion}
    ] : []
  });

  const historyActions = createHistoryActions(documentRef, {
    className: "city-history-actions",
    history: state.history,
    onUndo: callbacks.onUndo,
    onRedo: callbacks.onRedo
  });

  return [summary, controls, sort, table, details, historyActions];
}

function buildCityMetrics(map) {
  const rows = cityRows(map).map(city => {
    const burg = findBurgForCity(map, city);
    const stateId = numberOrFallback(city.state, burg?.state, 0);
    const provinceId = numberOrFallback(city.province, null, 0);
    const packCell = numberOrFallback(city.packCell, burg?.cell, null);
    const gridCell = numberOrFallback(city.cell, map?.pack?.cells?.g?.[packCell], null);
    const cultureId = numberOrFallback(city.culture, burg?.culture, map?.pack?.cells?.culture?.[packCell]);
    const religionId = numberOrFallback(city.religion, burg?.religion, map?.pack?.cells?.religion?.[packCell]);
    const population = Number(city.population ?? burg?.population ?? 0) || 0;
    const flags = cityFlags(city, burg);
    const owner = cityOwnerInfo(map, city, burg, {stateId, provinceId, packCell, gridCell});
    return {
      id: city.id,
      burgId: city.burgId ?? burg?.i ?? "none",
      name: city.name || burg?.name || `城市 #${city.id}`,
      rawName: city.name || burg?.name || `城市 #${city.id}`,
      type: formatCityType(city, burg, population),
      flags: flags.join(" / ") || "普通",
      population,
      stateId,
      stateName: indexedName(map?.politics?.states, stateId),
      provinceId,
      provinceName: indexedName(map?.politics?.provinces || map?.pack?.provinces, provinceId),
      cellOwnerName: owner.cellOwnerName,
      ownerConsistency: owner.ownerConsistency,
      waterStatus: owner.waterStatus,
      ownerWarnings: owner.warnings,
      canSyncOwner: owner.canSyncOwner,
      cell: gridCell ?? "none",
      packCell: packCell ?? "none",
      culture: indexedName(map?.society?.cultures, cultureId),
      religion: indexedName(map?.society?.religions, religionId),
      capital: Boolean(city.capital || burg?.capital),
      provincial: Boolean(city.provincial),
      port: Boolean(city.port || burg?.port)
    };
  });
  return {
    rows,
    total: rows.length,
    capitals: rows.filter(row => row.capital).length,
    ports: rows.filter(row => row.port).length,
    totalPopulation: rows.reduce((sum, row) => sum + row.population, 0)
  };
}

function cityRows(map) {
  return (map?.settlements?.cities || [])
    .filter(city => city && Number.isInteger(city.id));
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
    || row.provinceName.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
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

function cityObject(row) {
  return {
    kind: "city",
    id: row.id,
    name: row.rawName,
    type: row.type,
    population: roundNumber(row.population),
    state: row.stateName,
    stateId: row.stateId,
    province: row.provinceName,
    provinceId: row.provinceId,
    cell: row.cell,
    packCell: row.packCell,
    burgId: row.burgId
  };
}

function cityNameEditor(documentRef, selected, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "city-name-editor";
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

function cityPopulationEditor(documentRef, selected, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "city-name-editor city-population-editor";
  const label = documentRef.createElement("label");
  const text = documentRef.createElement("span");
  text.textContent = "人口";
  const input = documentRef.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.001";
  input.required = true;
  input.value = String(selected.population);
  label.append(text, input);

  const apply = documentRef.createElement("button");
  apply.type = "submit";
  apply.className = "secondary-action";
  apply.textContent = "应用人口";
  editor.addEventListener("submit", event => {
    event.preventDefault();
    if (!input.reportValidity()) return;
    callbacks.onPopulationChange(selected.id, input.value);
  });

  editor.append(label, apply);
  return editor;
}

function cityOwnerSyncAction(documentRef, selected, callbacks) {
  const action = documentRef.createElement("div");
  action.className = "city-owner-sync";
  const label = documentRef.createElement("span");
  label.textContent = "归属操作";
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "secondary-action";
  button.textContent = "同步归属到所在 cell";
  button.disabled = !selected.canSyncOwner;
  button.addEventListener("click", () => callbacks.onSyncOwnerToCell(selected.id));
  action.append(label, button);
  return action;
}

function cityAnomalyNotice(documentRef, selected) {
  const row = documentRef.createElement("div");
  row.className = "city-anomaly-notice";
  const label = documentRef.createElement("span");
  label.textContent = "异常提示";
  const value = documentRef.createElement("strong");
  value.textContent = selected.ownerWarnings.length ? selected.ownerWarnings.join("；") : "none";
  row.append(label, value);
  return row;
}

function formatCityType(city, burg, population) {
  if (city.capital || burg?.capital) return "首都";
  if (city.provincial) return "省会";
  if (city.port || burg?.port) return "港口";
  if (city.group === "hamlet" || burg?.group === "hamlet") return "村镇";
  if (population >= 5 || city.group === "city" || burg?.group === "city") return "城市";
  return "城镇";
}

function cityFlags(city, burg) {
  const flags = [];
  if (city.capital || burg?.capital) flags.push("首都");
  if (city.provincial) flags.push("省会");
  if (city.port || burg?.port) flags.push("港口");
  if (city.citadel || burg?.citadel) flags.push("堡垒");
  if (city.walls || burg?.walls) flags.push("城墙");
  if (city.plaza || burg?.plaza) flags.push("广场");
  if (city.temple || burg?.temple) flags.push("神庙");
  return flags;
}

function cityOwnerInfo(map, city, burg, {stateId, provinceId, packCell, gridCell}) {
  const cellStateId = normalizeOwnerId(numberOrFallback(map?.pack?.cells?.state?.[packCell], map?.grid?.cells?.state?.[gridCell], 0));
  const cellProvinceId = normalizeOwnerId(numberOrFallback(map?.pack?.cells?.province?.[packCell], map?.grid?.cells?.province?.[gridCell], 0));
  const normalizedStateId = normalizeOwnerId(stateId);
  const normalizedProvinceId = normalizeOwnerId(provinceId);
  const burgStateId = normalizeOwnerId(burg?.state);
  const burgProvinceId = hasOwn(burg, "province") ? normalizeOwnerId(burg.province) : null;
  const warnings = [];

  if (normalizedStateId !== cellStateId) warnings.push(`国家不一致：城市 #${normalizedStateId} / cell #${cellStateId}`);
  if (burg && burgStateId !== cellStateId) warnings.push(`burg 国家不一致：burg #${burgStateId} / cell #${cellStateId}`);
  if (normalizedProvinceId !== cellProvinceId) warnings.push(`省份不一致：城市 #${normalizedProvinceId} / cell #${cellProvinceId}`);
  if (burgProvinceId !== null && burgProvinceId !== cellProvinceId) warnings.push(`burg 省份不一致：burg #${burgProvinceId} / cell #${cellProvinceId}`);

  const waterStatus = cityWaterStatus(map, packCell, gridCell);
  if (waterStatus !== "正常" && waterStatus !== "未知") warnings.push(waterStatus);

  return {
    cellOwnerName: `${indexedName(map?.politics?.states, cellStateId)} / ${indexedName(map?.politics?.provinces || map?.pack?.provinces, cellProvinceId)}`,
    ownerConsistency: warnings.some(item => item.includes("不一致")) ? "不一致" : "一致",
    waterStatus,
    warnings,
    canSyncOwner: Number.isInteger(packCell) && warnings.some(item => item.includes("不一致"))
  };
}

function cityWaterStatus(map, packCell, gridCell) {
  if (Number.isInteger(packCell)) {
    const height = map?.pack?.cells?.h?.[packCell];
    if (Number.isFinite(height) && height < 20) return `落水：pack cell #${packCell} 高度 ${height}`;
    const featureId = map?.pack?.cells?.f?.[packCell];
    const feature = map?.pack?.features?.[featureId] || map?.features?.features?.[featureId];
    if (feature && feature.land === false) return `落水：pack cell #${packCell} 位于水体 feature #${featureId}`;
    return "正常";
  }
  if (Number.isInteger(gridCell)) {
    const height = map?.grid?.cells?.h?.[gridCell];
    if (Number.isFinite(height) && height < 20) return `落水：grid cell #${gridCell} 高度 ${height}`;
    return "正常";
  }
  return "未知";
}

function findBurgForCity(map, city) {
  return map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city.id) || null;
}

function cityExists(map, cityId) {
  return Boolean(Number.isInteger(cityId) && map?.settlements?.cities?.[cityId]);
}

function firstCityId(map) {
  return cityRows(map)[0]?.id ?? null;
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.fullName || item?.name || (id === undefined || id === null || id === 0 ? "none" : `#${id}`);
}

function numberOrFallback(...values) {
  for (const value of values) {
    if (Number.isInteger(value)) return value;
  }
  return null;
}

function normalizeOwnerId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function formatNumber(value) {
  return Number.isFinite(value) ? roundNumber(value).toLocaleString("zh-CN") : "0";
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
