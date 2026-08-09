import {pickGridCell} from "../renderer/picking.js";
import {burgIdsAtPackCell, cityIdsAtGridCell} from "./settlement-cell-index.js";

const CELL_SPACES = new Set(["grid", "pack"]);
const QUERY_FIELDS = new Set([
  "id",
  "space",
  "x",
  "y",
  "height",
  "land",
  "featureId",
  "featureType",
  "featureLand",
  "stateId",
  "provinceId",
  "cultureId",
  "religionId",
  "biomeId",
  "temperature",
  "precipitation",
  "population",
  "burgId",
  "gridCellId",
  "packCellId",
  "consistency"
]);
const FILTER_FIELDS = new Set([
  "land",
  "stateId",
  "provinceId",
  "cultureId",
  "religionId",
  "featureId",
  "biomeId",
  "consistency"
]);
const DEFAULT_QUERY_FIELDS = Object.freeze(["id", "height", "featureId", "stateId", "provinceId"]);
const DEFAULT_QUERY_LIMIT = 100;
const MAX_QUERY_LIMIT = 1000;
const SCAN_CHECKS = new Set(["terrain-consistency", "pack-mapping", "political-owner-range"]);
const DEFAULT_SCAN_CHECKS = Object.freeze([...SCAN_CHECKS]);
const DEFAULT_SCAN_LIMIT = 200;
const MAX_SCAN_LIMIT = 1000;

export function getCellSnapshot(map, reference, options = {}) {
  assertMap(map);
  const ref = normalizeCellRef(map, reference);
  const normalizedOptions = normalizeGetOptions(options);
  const mapping = buildCellMapping(map);
  return buildCellSnapshot(map, ref, normalizedOptions, mapping);
}

export function getCellAtPoint(map, point, options = {}, context = {}) {
  assertMap(map);
  const normalizedPoint = normalizePoint(point);
  const normalizedOptions = normalizeGetAtPointOptions(options);
  const world = normalizedPoint.coordinateSpace === "client"
    ? resolveClientPoint(normalizedPoint, context.screenToWorld)
    : {x: normalizedPoint.x, y: normalizedPoint.y};
  const picked = pickGridCell(map, world.x, world.y);
  if (!picked || picked.gridCell === null) {
    return {
      found: false,
      code: "cell-not-found",
      point: {
        coordinateSpace: normalizedPoint.coordinateSpace,
        x: normalizedPoint.x,
        y: normalizedPoint.y,
        worldX: world.x,
        worldY: world.y
      }
    };
  }

  const mapping = buildCellMapping(map);
  const requestedSpace = normalizedOptions.space;
  let ref;
  if (requestedSpace === "pack") {
    const packCell = primaryPackCell(mapping, picked.gridCell);
    if (packCell === null) {
      return {
        found: false,
        code: "pack-cell-not-found",
        point: {
          coordinateSpace: normalizedPoint.coordinateSpace,
          x: normalizedPoint.x,
          y: normalizedPoint.y,
          worldX: world.x,
          worldY: world.y
        },
        gridRef: {space: "grid", id: picked.gridCell}
      };
    }
    ref = {space: "pack", id: packCell};
  } else {
    ref = {space: "grid", id: picked.gridCell};
  }

  return {
    found: true,
    code: "cell-found",
    point: {
      coordinateSpace: normalizedPoint.coordinateSpace,
      x: normalizedPoint.x,
      y: normalizedPoint.y,
      worldX: world.x,
      worldY: world.y
    },
    cell: buildCellSnapshot(map, ref, normalizedOptions, mapping)
  };
}

export function getCellNeighbors(map, reference, options = {}) {
  assertMap(map);
  const ref = normalizeCellRef(map, reference);
  const depth = integerInRange(options.depth ?? 1, 1, 3, "depth");
  const limit = integerInRange(options.limit ?? 128, 1, 1000, "limit");
  assertOnlyKeys(options, ["depth", "limit"], "Cell 邻接选项");
  const cells = cellsForSpace(map, ref.space);
  const visited = new Set([ref.id]);
  let frontier = [ref.id];
  const levels = [];
  let truncated = false;

  for (let currentDepth = 1; currentDepth <= depth && frontier.length; currentDepth++) {
    const next = [];
    for (const cell of frontier) {
      for (const neighborValue of iterableValues(cells.c?.[cell])) {
        const neighbor = Number(neighborValue);
        if (!validCellId(map, ref.space, neighbor) || visited.has(neighbor)) continue;
        if (visited.size - 1 >= limit) {
          truncated = true;
          break;
        }
        visited.add(neighbor);
        next.push(neighbor);
      }
      if (truncated) break;
    }
    if (next.length) {
      next.sort((a, b) => a - b);
      levels.push({
        depth: currentDepth,
        cells: next.map(id => ({space: ref.space, id}))
      });
    }
    frontier = next;
    if (truncated) break;
  }

  return {
    ref,
    requestedDepth: depth,
    returned: visited.size - 1,
    truncated,
    levels
  };
}

export function queryCells(map, query = {}, revision = null) {
  assertMap(map);
  if (!query || typeof query !== "object" || Array.isArray(query)) throw cellApiError("invalid_argument", "Cell 查询参数必须是对象");
  assertOnlyKeys(query, ["space", "filter", "fields", "limit", "cursor"], "Cell 查询");
  const space = normalizeSpace(query.space ?? "grid");
  const filter = normalizeFilter(query.filter);
  const fields = normalizeFields(query.fields);
  const limit = integerInRange(query.limit ?? DEFAULT_QUERY_LIMIT, 1, MAX_QUERY_LIMIT, "limit");
  const revisionSnapshot = normalizeRevision(revision);
  const signCursor = cursorSigner(revision);
  const contextSignature = fingerprint(stableStringify({
    mapIdentity: revisionSnapshot.mapIdentity,
    mapRevision: revisionSnapshot.mapRevision,
    space,
    filter,
    fields
  }));
  const ids = cellIds(map, space);
  const mapping = buildCellMapping(map);
  const matched = [];

  for (const id of ids) {
    const row = buildQueryRow(map, {space, id}, mapping);
    if (matchesFilter(row, filter)) matched.push(row);
  }

  const offset = decodeCursor(query.cursor, contextSignature, matched.length, signCursor);
  const page = matched.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page.map(row => projectRow(row, fields)),
    count: page.length,
    total: matched.length,
    limit,
    nextCursor: nextOffset < matched.length ? encodeCursor(nextOffset, contextSignature, signCursor) : null
  };
}

export async function scanCells(map, query = {}, revision = null, context = {}) {
  assertMap(map);
  if (!query || typeof query !== "object" || Array.isArray(query)) throw cellApiError("invalid_argument", "Cell 扫描参数必须是对象");
  assertOnlyKeys(query, ["space", "checks", "filter", "fields", "limit", "cursor", "signal"], "Cell 扫描");
  const space = normalizeSpace(query.space ?? "grid");
  const checks = normalizeScanChecks(query.checks);
  const filter = normalizeScanFilter(query.filter);
  const fields = normalizeFields(query.fields);
  const limit = integerInRange(query.limit ?? DEFAULT_SCAN_LIMIT, 1, MAX_SCAN_LIMIT, "limit");
  const revisionSnapshot = normalizeRevision(revision);
  const signCursor = cursorSigner(revision);
  const contextSignature = fingerprint(stableStringify({
    mapIdentity: revisionSnapshot.mapIdentity,
    mapRevision: revisionSnapshot.mapRevision,
    space,
    checks,
    filter,
    fields
  }));
  const ids = cellIds(map, space);
  const mapping = buildCellMapping(map);
  const viewportBounds = filter.viewport ? normalizeBounds(context.viewportBounds, "viewport") : null;
  const bounds = filter.bbox || viewportBounds;
  const signal = query.signal || context.signal;
  const yieldToBrowser = typeof context.yieldToBrowser === "function" ? context.yieldToBrowser : defaultYieldToBrowser;
  const sliceMs = Number.isFinite(Number(context.sliceMs)) && Number(context.sliceMs) > 0 ? Number(context.sliceMs) : 5;
  const hits = [];
  const counts = {};
  let sliceStartedAt = performanceNow();
  let maxSliceMs = 0;
  let scanned = 0;

  for (const id of ids) {
    if (signal?.aborted) {
      return {
        cancelled: true,
        code: "scan-cancelled",
        scanned,
        totalCandidates: ids.length,
        counts,
        samples: buildScanSamples(hits),
        items: [],
        count: 0,
        nextCursor: null,
        maxSliceMs: roundMs(performanceNow() - sliceStartedAt)
      };
    }
    const ref = {space, id};
    const row = buildQueryRow(map, ref, mapping);
    if (bounds && !pointInBounds(row, bounds)) continue;
    scanned++;
    const diagnostics = filterScanDiagnostics(buildDiagnostics(map, ref, mapping), checks);
    if (diagnostics.length) {
      for (const item of diagnostics) counts[item.code] = (counts[item.code] || 0) + 1;
      hits.push({
        ref,
        codes: [...new Set(diagnostics.map(item => item.code))],
        details: diagnostics.map(cloneJson),
        row
      });
    }
    const elapsed = performanceNow() - sliceStartedAt;
    if (elapsed >= sliceMs) {
      maxSliceMs = Math.max(maxSliceMs, elapsed);
      await yieldToBrowser();
      sliceStartedAt = performanceNow();
    }
  }

  maxSliceMs = Math.max(maxSliceMs, performanceNow() - sliceStartedAt);
  const offset = decodeScanCursor(query.cursor, contextSignature, hits.length, signCursor);
  const page = hits.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    cancelled: false,
    code: "scan-complete",
    scanned,
    totalCandidates: ids.length,
    totalHits: hits.length,
    counts,
    samples: buildScanSamples(hits),
    items: page.map(hit => ({
      ref: {...hit.ref},
      codes: [...hit.codes],
      details: cloneJson(hit.details),
      fields: projectRow(hit.row, fields)
    })),
    count: page.length,
    truncated: nextOffset < hits.length,
    nextCursor: nextOffset < hits.length ? encodeScanCursor(nextOffset, contextSignature, signCursor) : null,
    maxSliceMs: roundMs(maxSliceMs)
  };
}

export function listCellQueryFields() {
  return [...QUERY_FIELDS];
}

function buildCellSnapshot(map, ref, options, mapping) {
  const cells = cellsForSpace(map, ref.space);
  const center = cellCenter(map, ref);
  const vertexIds = iterableValues(cells.v?.[ref.id]).map(Number).filter(Number.isInteger);
  const vertices = options.includeGeometry
    ? vertexIds.map(vertexId => cellVerticesForSpace(map, ref.space)?.[vertexId]).filter(Boolean).map(point => ({x: finiteNumber(point[0]), y: finiteNumber(point[1])}))
    : null;
  const diagnostics = buildDiagnostics(map, ref, mapping, vertexIds);
  const row = buildQueryRow(map, ref, mapping, diagnostics);
  const neighborIds = options.includeNeighbors
    ? iterableValues(cells.c?.[ref.id]).map(Number).filter(id => validCellId(map, ref.space, id)).sort((a, b) => a - b)
    : null;
  const mapped = mappingForRef(mapping, ref);
  const occupants = cellOccupants(map, ref, mapped);

  return {
    ref: {...ref},
    center,
    geometry: {
      vertexCount: vertexIds.length,
      vertices
    },
    terrain: {
      height: row.height,
      heightLand: row.height >= 20,
      featureId: row.featureId,
      featureType: row.featureType,
      featureLand: row.featureLand,
      consistency: diagnostics.length ? diagnostics[0].code : "ok"
    },
    mapping: mapped,
    ownership: {
      stateId: row.stateId,
      provinceId: row.provinceId,
      cultureId: row.cultureId,
      religionId: row.religionId
    },
    climate: {
      biomeId: row.biomeId,
      temperature: row.temperature,
      precipitation: row.precipitation
    },
    occupants,
    neighbors: neighborIds,
    diagnostics: options.includeDiagnostics ? diagnostics : []
  };
}

function buildQueryRow(map, ref, mapping, diagnostics = null) {
  const cells = cellsForSpace(map, ref.space);
  const center = cellCenter(map, ref);
  const mapped = mappingForRef(mapping, ref);
  const featureId = optionalInteger(cells.f?.[ref.id]);
  const feature = featureForCell(map, ref.space, featureId);
  const cellDiagnostics = diagnostics || buildDiagnostics(map, ref, mapping);
  const burgId = optionalInteger(cells.burg?.[ref.id]);
  return {
    id: ref.id,
    space: ref.space,
    x: center.x,
    y: center.y,
    height: finiteNumber(cells.h?.[ref.id]),
    land: Boolean(feature?.land),
    featureId,
    featureType: String(feature?.type || "unknown"),
    featureLand: Boolean(feature?.land),
    stateId: optionalInteger(cells.state?.[ref.id]),
    provinceId: optionalInteger(cells.province?.[ref.id]),
    cultureId: optionalInteger(cells.culture?.[ref.id]),
    religionId: optionalInteger(cells.religion?.[ref.id]),
    biomeId: optionalInteger(cells.biome?.[ref.id]),
    temperature: optionalNumber(cells.temp?.[ref.id]),
    precipitation: optionalNumber(cells.prec?.[ref.id]),
    population: finiteNumber(cells.pop?.[ref.id]),
    burgId,
    gridCellId: ref.space === "grid" ? ref.id : mapped.gridCell,
    packCellId: ref.space === "pack" ? ref.id : mapped.primaryPackCell,
    consistency: cellDiagnostics.length ? cellDiagnostics.map(item => item.code) : ["ok"]
  };
}

function buildDiagnostics(map, ref, mapping, knownVertexIds = null) {
  const cells = cellsForSpace(map, ref.space);
  const vertexIds = knownVertexIds || iterableValues(cells.v?.[ref.id]).map(Number).filter(Number.isInteger);
  const diagnostics = [];
  if (vertexIds.length < 3 || vertexIds.some(vertexId => !cellVerticesForSpace(map, ref.space)?.[vertexId])) {
    diagnostics.push(diagnostic("invalid-polygon", "Cell 缺少合法多边形。"));
  }
  const heightLand = finiteNumber(cells.h?.[ref.id]) >= 20;
  const featureId = optionalInteger(cells.f?.[ref.id]);
  const feature = featureForCell(map, ref.space, featureId);
  if (!feature || feature.removed) diagnostics.push(diagnostic("feature-missing", `Cell 指向的 Feature #${featureId ?? "?"} 不存在。`));
  else if (heightLand !== Boolean(feature.land)) diagnostics.push(diagnostic("height-feature-mismatch", "高度水陆与 Feature 水陆语义不一致。"));

  const mapped = mappingForRef(mapping, ref);
  if (ref.space === "grid" && mapped.packCellCount === 0) {
    diagnostics.push(diagnostic("grid-pack-mapping-missing", "Grid cell 没有可用的 Pack 映射。"));
  }
  if (ref.space === "pack" && mapped.gridCell === null) {
    diagnostics.push(diagnostic("pack-grid-mapping-missing", "Pack cell 没有可用的 Grid 映射。"));
  }

  const stateId = optionalInteger(cells.state?.[ref.id]);
  const provinceId = optionalInteger(cells.province?.[ref.id]);
  const burgId = optionalInteger(cells.burg?.[ref.id]);
  if (positiveId(stateId) && !activeRecord(map.politics?.states?.[stateId])) diagnostics.push(diagnostic("state-missing", `Cell 指向的国家 #${stateId} 不存在或已移除。`));
  if (positiveId(provinceId) && !activeRecord(map.politics?.provinces?.[provinceId])) diagnostics.push(diagnostic("province-missing", `Cell 指向的省份 #${provinceId} 不存在或已移除。`));
  if (positiveId(burgId) && !burgRecord(map, ref.space, burgId)) diagnostics.push(diagnostic("burg-missing", `Cell 指向的城镇 #${burgId} 不存在或已移除。`));

  for (const packCell of mapped.packCells || []) {
    const packCells = map.pack?.cells;
    if (!packCells) break;
    const packFeature = featureForCell(map, "pack", optionalInteger(packCells.f?.[packCell]));
    compareMappedFeature(diagnostics, feature, packFeature);
    compareMappedValue(diagnostics, "pack-state-mismatch", "国家", stateId, optionalInteger(packCells.state?.[packCell]));
    compareMappedValue(diagnostics, "pack-province-mismatch", "省份", provinceId, optionalInteger(packCells.province?.[packCell]));
  }
  if (ref.space === "pack" && mapped.gridCell !== null) {
    const gridCells = map.grid?.cells;
    const gridFeature = featureForCell(map, "grid", optionalInteger(gridCells?.f?.[mapped.gridCell]));
    compareMappedFeature(diagnostics, gridFeature, feature);
    compareMappedValue(diagnostics, "pack-state-mismatch", "国家", optionalInteger(gridCells?.state?.[mapped.gridCell]), stateId);
    compareMappedValue(diagnostics, "pack-province-mismatch", "省份", optionalInteger(gridCells?.province?.[mapped.gridCell]), provinceId);
  }
  return diagnostics;
}

function compareMappedFeature(diagnostics, gridFeature, packFeature) {
  if (!gridFeature || !packFeature) return;
  if (Boolean(gridFeature.land) === Boolean(packFeature.land) && String(gridFeature.type || "") === String(packFeature.type || "")) return;
  diagnostics.push(diagnostic("pack-feature-mismatch", "Feature 的 Grid / Pack 映射语义不一致。", {
    grid: {type: String(gridFeature.type || "unknown"), land: Boolean(gridFeature.land)},
    pack: {type: String(packFeature.type || "unknown"), land: Boolean(packFeature.land)}
  }));
}

function compareMappedValue(diagnostics, code, label, expected, actual) {
  if (expected === null || actual === null || expected === actual) return;
  diagnostics.push(diagnostic(code, `${label}的 Grid / Pack 映射不一致。`, {expected, actual}));
}

function mappingForRef(mapping, ref) {
  if (ref.space === "grid") {
    const packCells = [...(mapping.gridToPack.get(ref.id) || [])].sort((a, b) => a - b);
    const primary = primaryPackCell(mapping, ref.id);
    return {
      primaryPackCell: primary,
      packCells,
      packCellCount: packCells.length
    };
  }
  const gridCell = mapping.packToGrid.get(ref.id);
  return {
    gridCell: Number.isInteger(gridCell) ? gridCell : null,
    gridRef: Number.isInteger(gridCell) ? {space: "grid", id: gridCell} : null
  };
}

function buildCellMapping(map) {
  const gridToPack = new Map();
  const packToGrid = new Map();
  const primaryByGrid = new Map();
  for (const packCell of cellIds(map, "pack")) {
    const gridCell = optionalInteger(map.pack?.cells?.g?.[packCell]);
    if (!validCellId(map, "grid", gridCell)) continue;
    packToGrid.set(packCell, gridCell);
    const packCells = gridToPack.get(gridCell) || [];
    packCells.push(packCell);
    gridToPack.set(gridCell, packCells);
  }
  for (const gridCell of cellIds(map, "grid")) {
    const primary = optionalInteger(map.grid?.cells?.pack?.[gridCell]);
    if (!validCellId(map, "pack", primary)) continue;
    primaryByGrid.set(gridCell, primary);
    const packCells = gridToPack.get(gridCell) || [];
    if (!packCells.includes(primary)) packCells.push(primary);
    gridToPack.set(gridCell, packCells);
    if (!packToGrid.has(primary)) packToGrid.set(primary, gridCell);
  }
  return {gridToPack, packToGrid, primaryByGrid};
}

function primaryPackCell(mapping, gridCell) {
  const primary = mapping.primaryByGrid.get(gridCell);
  if (Number.isInteger(primary)) return primary;
  const values = mapping.gridToPack.get(gridCell) || [];
  return values.length ? Math.min(...values) : null;
}

function cellOccupants(map, ref, mapped) {
  const packCells = ref.space === "pack" ? [ref.id] : mapped.packCells || [];
  const gridCells = ref.space === "grid" ? [ref.id] : mapped.gridCell === null ? [] : [mapped.gridCell];
  const burgIds = new Set();
  const cityIds = new Set();
  for (const gridCell of gridCells) {
    for (const cityId of cityIdsAtGridCell(map, gridCell)) cityIds.add(cityId);
  }
  for (const packCell of packCells) {
    for (const burgId of burgIdsAtPackCell(map, packCell)) burgIds.add(burgId);
  }
  const capitalStateIds = [];
  for (const city of map.settlements?.cities || []) {
    if (!activeRecord(city)) continue;
    const matchesGrid = gridCells.includes(optionalInteger(city.cell));
    const matchesPack = packCells.includes(optionalInteger(city.packCell));
    const matchesIndex = cityIds.has(optionalInteger(city.id ?? city.i)) || burgIds.has(optionalInteger(city.burgId));
    if (!matchesGrid && !matchesPack && !matchesIndex) continue;
    const cityId = optionalInteger(city.id ?? city.i);
    if (cityId !== null) cityIds.add(cityId);
    addPositiveId(burgIds, city.burgId);
    if (city.capital && positiveId(city.state)) capitalStateIds.push(Number(city.state));
  }
  return {
    burgIds: [...burgIds].sort((a, b) => a - b),
    cityIds: [...cityIds].sort((a, b) => a - b),
    capitalStateIds: [...new Set(capitalStateIds)].sort((a, b) => a - b)
  };
}

function normalizeCellRef(map, reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    throw cellApiError("invalid_argument", "Cell 引用必须显式提供 {space, id}");
  }
  assertOnlyKeys(reference, ["space", "id"], "Cell 引用");
  const space = normalizeSpace(reference.space);
  const id = Number(reference.id);
  if (!Number.isSafeInteger(id) || id < 0) throw cellApiError("invalid_argument", "Cell id 必须是非负安全整数");
  if (!validCellId(map, space, id)) throw cellApiError("not_found", `找不到 ${space} cell #${id}`);
  return {space, id};
}

function normalizeSpace(space) {
  const normalized = String(space || "").trim();
  if (!CELL_SPACES.has(normalized)) throw cellApiError("invalid_argument", `未知 Cell 空间：${normalized || "(empty)"}`);
  return normalized;
}

function normalizePoint(point) {
  if (!point || typeof point !== "object" || Array.isArray(point)) throw cellApiError("invalid_argument", "点参数必须是对象");
  assertOnlyKeys(point, ["coordinateSpace", "x", "y"], "点参数");
  const coordinateSpace = String(point.coordinateSpace || "").trim();
  if (coordinateSpace !== "client" && coordinateSpace !== "world") {
    throw cellApiError("invalid_argument", `未知坐标空间：${coordinateSpace || "(empty)"}`);
  }
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw cellApiError("invalid_argument", "点坐标 x / y 必须是有限数");
  return {coordinateSpace, x, y};
}

function resolveClientPoint(point, screenToWorld) {
  if (typeof screenToWorld !== "function") throw cellApiError("api_error", "当前 renderer 不支持 client 坐标换算");
  const world = screenToWorld(point.x, point.y);
  const x = Number(world?.x);
  const y = Number(world?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw cellApiError("api_error", "client 坐标换算没有返回合法世界点");
  return {x, y};
}

function normalizeGetOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw cellApiError("invalid_argument", "Cell 查询选项必须是对象");
  assertOnlyKeys(options, ["includeGeometry", "includeNeighbors", "includeDiagnostics"], "Cell 查询选项");
  return {
    includeGeometry: booleanOption(options.includeGeometry, false, "includeGeometry"),
    includeNeighbors: booleanOption(options.includeNeighbors, true, "includeNeighbors"),
    includeDiagnostics: booleanOption(options.includeDiagnostics, false, "includeDiagnostics")
  };
}

function normalizeGetAtPointOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw cellApiError("invalid_argument", "点查询选项必须是对象");
  assertOnlyKeys(options, ["space", "includeGeometry", "includeNeighbors", "includeDiagnostics"], "点查询选项");
  return {
    ...normalizeGetOptions({
      includeGeometry: options.includeGeometry,
      includeNeighbors: options.includeNeighbors,
      includeDiagnostics: options.includeDiagnostics
    }),
    space: normalizeSpace(options.space ?? "grid")
  };
}

function normalizeFilter(filter = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw cellApiError("invalid_argument", "Cell filter 必须是对象");
  assertOnlyKeys(filter, FILTER_FIELDS, "Cell filter");
  const normalized = {};
  if (filter.land !== undefined) {
    if (typeof filter.land !== "boolean") throw cellApiError("invalid_argument", "filter.land 必须是布尔值");
    normalized.land = filter.land;
  }
  for (const key of ["stateId", "provinceId", "cultureId", "religionId", "featureId", "biomeId"]) {
    if (filter[key] === undefined) continue;
    normalized[key] = integerInRange(filter[key], 0, Number.MAX_SAFE_INTEGER, `filter.${key}`);
  }
  if (filter.consistency !== undefined) {
    const values = Array.isArray(filter.consistency) ? filter.consistency : [filter.consistency];
    if (!values.length || values.some(value => typeof value !== "string" || !value.trim())) {
      throw cellApiError("invalid_argument", "filter.consistency 必须是非空字符串或字符串数组");
    }
    normalized.consistency = [...new Set(values.map(value => value.trim()))].sort();
  }
  return normalized;
}

function normalizeScanChecks(checks) {
  if (checks === undefined) return [...DEFAULT_SCAN_CHECKS];
  if (!Array.isArray(checks) || !checks.length) throw cellApiError("invalid_argument", "checks 必须是非空字符串数组");
  const normalized = [...new Set(checks.map(value => String(value || "").trim()))].sort();
  const unknown = normalized.filter(value => !SCAN_CHECKS.has(value));
  if (unknown.length) throw cellApiError("action-not-inspectable", `当前阶段不支持以下 Cell 扫描检查：${unknown.join("、")}`);
  return normalized;
}

function normalizeScanFilter(filter = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw cellApiError("invalid_argument", "Cell 扫描 filter 必须是对象");
  assertOnlyKeys(filter, ["viewport", "bbox"], "Cell 扫描 filter");
  return {
    viewport: booleanOption(filter.viewport, false, "filter.viewport"),
    bbox: filter.bbox === undefined ? null : normalizeBounds(filter.bbox, "filter.bbox")
  };
}

function normalizeBounds(bounds, name) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) throw cellApiError("invalid_argument", `${name} 必须是 bbox 对象`);
  assertOnlyKeys(bounds, ["minX", "minY", "maxX", "maxY"], name);
  const normalized = Object.fromEntries(["minX", "minY", "maxX", "maxY"].map(key => [key, Number(bounds[key])]));
  if (Object.values(normalized).some(value => !Number.isFinite(value))) throw cellApiError("invalid_argument", `${name} 必须包含有限的 minX / minY / maxX / maxY`);
  if (normalized.minX > normalized.maxX || normalized.minY > normalized.maxY) throw cellApiError("invalid_argument", `${name} 的最小值不能大于最大值`);
  return normalized;
}

function pointInBounds(row, bounds) {
  return row.x >= bounds.minX && row.x <= bounds.maxX && row.y >= bounds.minY && row.y <= bounds.maxY;
}

function filterScanDiagnostics(diagnostics, checks) {
  const enabled = new Set(checks);
  return diagnostics.filter(item => {
    if (enabled.has("terrain-consistency") && ["invalid-polygon", "feature-missing", "height-feature-mismatch"].includes(item.code)) return true;
    if (enabled.has("pack-mapping") && ["grid-pack-mapping-missing", "pack-grid-mapping-missing", "pack-feature-mismatch", "pack-state-mismatch", "pack-province-mismatch"].includes(item.code)) return true;
    if (enabled.has("political-owner-range") && ["state-missing", "province-missing", "burg-missing"].includes(item.code)) return true;
    return false;
  });
}

function buildScanSamples(hits) {
  const samples = {};
  for (const hit of hits) {
    for (const code of hit.codes) {
      const list = samples[code] || [];
      if (list.length < 12) list.push({...hit.ref});
      samples[code] = list;
    }
  }
  return samples;
}

function normalizeFields(fields) {
  if (fields === undefined) return [...DEFAULT_QUERY_FIELDS];
  if (!Array.isArray(fields) || !fields.length) throw cellApiError("invalid_argument", "fields 必须是非空字段数组");
  const normalized = [...new Set(fields.map(field => String(field || "").trim()))];
  const unknown = normalized.filter(field => !QUERY_FIELDS.has(field));
  if (unknown.length) throw cellApiError("invalid_argument", `未知 Cell 查询字段：${unknown.join("、")}`);
  return normalized;
}

function matchesFilter(row, filter) {
  if (filter.land !== undefined && row.land !== filter.land) return false;
  for (const key of ["stateId", "provinceId", "cultureId", "religionId", "featureId", "biomeId"]) {
    if (filter[key] !== undefined && row[key] !== filter[key]) return false;
  }
  if (filter.consistency && !filter.consistency.every(code => row.consistency.includes(code))) return false;
  return true;
}

function projectRow(row, fields) {
  return Object.fromEntries(fields.map(field => [field, cloneJson(row[field])]));
}

function encodeCursor(offset, contextSignature, signCursor) {
  const encodedOffset = offset.toString(36);
  const check = signCursor(`${contextSignature}:${encodedOffset}`);
  return `cellq1.${encodedOffset}.${contextSignature}.${check}`;
}

function decodeCursor(cursor, contextSignature, total, signCursor) {
  if (cursor === null || cursor === undefined || cursor === "") return 0;
  if (typeof cursor !== "string") throw cellApiError("invalid_argument", "cursor 必须是字符串或 null");
  const match = /^cellq1\.([0-9a-z]+)\.([0-9a-f]{8})\.([0-9a-f]{8})$/.exec(cursor);
  if (!match) throw cellApiError("cursor-invalid", "Cell 查询 cursor 格式无效");
  const [, encodedOffset, encodedContext, encodedCheck] = match;
  if (signCursor(`${encodedContext}:${encodedOffset}`) !== encodedCheck) throw cellApiError("cursor-invalid", "Cell 查询 cursor 已被篡改");
  if (encodedContext !== contextSignature) throw cellApiError("cursor-stale", "Cell 查询 cursor 不属于当前地图 revision 或查询条件");
  const offset = Number.parseInt(encodedOffset, 36);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) throw cellApiError("cursor-invalid", "Cell 查询 cursor 偏移无效");
  return offset;
}

function encodeScanCursor(offset, contextSignature, signCursor) {
  const encodedOffset = offset.toString(36);
  const check = signCursor(`${contextSignature}:${encodedOffset}`);
  return `cells1.${encodedOffset}.${contextSignature}.${check}`;
}

function decodeScanCursor(cursor, contextSignature, total, signCursor) {
  if (cursor === null || cursor === undefined || cursor === "") return 0;
  if (typeof cursor !== "string") throw cellApiError("invalid_argument", "cursor 必须是字符串或 null");
  const match = /^cells1\.([0-9a-z]+)\.([0-9a-f]{8})\.([0-9a-f]{8})$/.exec(cursor);
  if (!match) throw cellApiError("cursor-invalid", "Cell 扫描 cursor 格式无效");
  const [, encodedOffset, encodedContext, encodedCheck] = match;
  if (signCursor(`${encodedContext}:${encodedOffset}`) !== encodedCheck) throw cellApiError("cursor-invalid", "Cell 扫描 cursor 已被篡改");
  if (encodedContext !== contextSignature) throw cellApiError("cursor-stale", "Cell 扫描 cursor 不属于当前地图 revision 或扫描条件");
  const offset = Number.parseInt(encodedOffset, 36);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) throw cellApiError("cursor-invalid", "Cell 扫描 cursor 偏移无效");
  return offset;
}

function fingerprint(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRevision(revision) {
  const snapshot = typeof revision?.getSnapshot === "function" ? revision.getSnapshot() : revision || {};
  return {
    mapIdentity: snapshot.mapIdentity === null || snapshot.mapIdentity === undefined ? null : String(snapshot.mapIdentity),
    mapRevision: Number.isSafeInteger(Number(snapshot.mapRevision)) && Number(snapshot.mapRevision) >= 0 ? Number(snapshot.mapRevision) : 0
  };
}

function cursorSigner(revision) {
  return typeof revision?.signCursor === "function"
    ? value => revision.signCursor(value)
    : value => fingerprint(`cell-query-fallback:${value}`);
}

function cellIds(map, space) {
  const cells = cellsForSpace(map, space);
  const source = iterableValues(cells.i).map(Number).filter(id => Number.isSafeInteger(id) && id >= 0);
  if (source.length) return [...new Set(source)].sort((a, b) => a - b);
  const count = inferCellCount(cells);
  return Array.from({length: count}, (_, id) => id);
}

function validCellId(map, space, id) {
  if (!Number.isSafeInteger(id) || id < 0) return false;
  const cells = cellsForSpace(map, space);
  const ids = cells.i;
  if (ids && typeof ids.length === "number" && ids.length) {
    if (id >= ids.length) return false;
    const stored = Number(ids[id]);
    if (stored === id) return true;
    if (typeof ids.includes === "function") return ids.includes(id);
  }
  return id < inferCellCount(cells);
}

function inferCellCount(cells) {
  return Math.max(
    Number(cells.i?.length || 0),
    Number(cells.p?.length || 0),
    Number(cells.h?.length || 0),
    Number(cells.v?.length || 0)
  );
}

function cellsForSpace(map, space) {
  return space === "grid" ? map.grid?.cells || {} : map.pack?.cells || {};
}

function cellVerticesForSpace(map, space) {
  return space === "grid" ? map.grid?.vertices?.p : map.pack?.vertices?.p;
}

function cellCenter(map, ref) {
  if (ref.space === "pack") {
    const point = map.pack?.cells?.p?.[ref.id];
    return {x: finiteNumber(point?.[0]), y: finiteNumber(point?.[1])};
  }
  const pointIndex = map.grid?.cells?.p?.[ref.id];
  const point = Number.isInteger(Number(pointIndex)) ? map.grid?.points?.[Number(pointIndex)] : map.grid?.cells?.p?.[ref.id];
  return {x: finiteNumber(point?.[0]), y: finiteNumber(point?.[1])};
}

function featureForCell(map, space, featureId) {
  return space === "grid"
    ? map.features?.features?.[featureId] || map.grid?.features?.[featureId]
    : map.pack?.features?.[featureId];
}

function burgRecord(map, space, burgId) {
  if (space === "pack") return activeRecord(map.pack?.burgs?.[burgId]) || activeRecord(map.settlements?.cities?.[burgId]);
  return activeRecord(map.settlements?.cities?.[burgId]) || activeRecord(map.pack?.burgs?.[burgId]);
}

function diagnostic(code, message, details = undefined) {
  return {
    code,
    message,
    ...(details === undefined ? {} : {details})
  };
}

function activeRecord(record) {
  return Boolean(record && record.removed !== true);
}

function addPositiveId(target, value) {
  const id = optionalInteger(value);
  if (positiveId(id)) target.add(id);
}

function positiveId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function iterableValues(value) {
  if (!value || typeof value[Symbol.iterator] !== "function") return [];
  return Array.from(value);
}

function booleanOption(value, fallback, name) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw cellApiError("invalid_argument", `${name} 必须是布尔值`);
  return value;
}

function integerInRange(value, minimum, maximum, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw cellApiError("invalid_argument", `${name} 必须是 ${minimum}～${maximum} 的整数`);
  }
  return number;
}

function assertOnlyKeys(value, allowedKeys, name) {
  const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys);
  const unknown = Object.keys(value || {}).filter(key => !allowed.has(key));
  if (unknown.length) throw cellApiError("invalid_argument", `${name}包含未知字段：${unknown.join("、")}`);
}

function assertMap(map) {
  if (!map?.grid?.cells || !map?.pack?.cells) throw cellApiError("not_found", "当前没有可查询的地图");
}

function cellApiError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function defaultYieldToBrowser() {
  return new Promise(resolve => {
    const view = globalThis.window || globalThis;
    if (typeof view.requestAnimationFrame === "function") view.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(Number(value) * 10) / 10;
}
