import {createGenerationSummary} from "../generator/index.js";
import {extractFeatures} from "../generator/features.js";
import {buildPack} from "../generator/pack.js";
import {
  GRID_STRUCTURE_SCHEMA,
  createGridStructureSnapshot,
  fingerprintGridStructure,
  gridFromStructureDocument,
  refineGridTopology,
  summarizeGridStructure,
  validateGridStructureDocument
} from "../generator/grid-refinement.js";
import {invalidateSettlementCellIndex, rebuildSettlementCellIndex} from "./settlement-cell-index.js";

export const GRID_TOPOLOGY_API_VERSION = "1.0.0";

export function getGridStructureSummary(map, revisionTracker = null) {
  assertMap(map);
  return {
    apiVersion: GRID_TOPOLOGY_API_VERSION,
    binding: currentBinding(map, revisionTracker),
    ...summarizeGridStructure(map.grid)
  };
}

export function getGridStructureSnapshot(map, revisionTracker = null) {
  assertMap(map);
  return createGridStructureSnapshot(map.grid, currentBinding(map, revisionTracker));
}

export function inspectGridStructureWrite(map, revisionTracker, document) {
  assertMap(map);
  const binding = currentBinding(map, revisionTracker);
  const validation = validateGridStructureDocument(document, binding);
  if (validation.valid && document.points.length !== map.grid.points.length) {
    validation.valid = false;
    validation.errors.push("受控结构写入不得改变 cell 数；扩展网格必须使用 grid.inspectRefinement / grid.refine");
    validation.summary = null;
  }
  const inspection = {
    action: "grid.applyWrite",
    valid: validation.valid,
    errors: validation.errors,
    binding,
    source: summarizeGridStructure(map.grid),
    target: validation.summary,
    schema: GRID_STRUCTURE_SCHEMA
  };
  inspection.inspectionToken = inspectionToken(inspection);
  return inspection;
}

export function inspectGridRefinement(map, revisionTracker, options = {}) {
  assertMap(map);
  const sourceCells = map.grid.points.length;
  const targetCells = normalizeTarget(options.targetCells ?? 100_000, sourceCells);
  const binding = currentBinding(map, revisionTracker);
  const inspection = {
    action: "grid.refine",
    valid: true,
    errors: [],
    binding,
    schema: GRID_STRUCTURE_SCHEMA,
    source: summarizeGridStructure(map.grid),
    target: {
      cells: targetCells,
      addedCells: targetCells - sourceCells,
      expectedChildrenPerMother: round(targetCells / sourceCells, 3),
      algorithm: "topology-preserving-cell-refinement"
    },
    invariants: [
      "保留全部旧 Grid Cell 编号与高度",
      "新邻接只连接同母或原邻接母 cell",
      "新高度不跨越母 cell 海陆符号",
      "feature / pack 重建并迁移对象引用"
    ]
  };
  inspection.inspectionToken = inspectionToken(inspection);
  return inspection;
}

export function prepareGridStructureWrite(map, revisionTracker, document, options = {}) {
  const inspection = inspectGridStructureWrite(map, revisionTracker, document);
  assertAuthorizedInspection(inspection, options, "grid.applyWrite");
  const oldGrid = map.grid;
  const grid = gridFromStructureDocument(document, oldGrid);
  preserveProjectedFields(oldGrid, grid);
  return prepareTopologyReplacement(map, grid, {
    action: "grid.applyWrite",
    sourceFingerprint: inspection.source.fingerprint,
    inspectionToken: inspection.inspectionToken
  });
}

export function prepareGridRefinement(map, revisionTracker, options = {}) {
  const inspection = inspectGridRefinement(map, revisionTracker, options);
  assertAuthorizedInspection(inspection, options, "grid.refine");
  const refined = refineGridTopology(map.grid, inspection.target.cells);
  return prepareTopologyReplacement(map, refined.grid, {
    action: "grid.refine",
    sourceFingerprint: inspection.source.fingerprint,
    inspectionToken: inspection.inspectionToken,
    refinement: refined.report
  });
}

export function commitPreparedGridTopology(map, prepared) {
  assertMap(map);
  if (!prepared?.map || prepared.sourceMap !== map) throw codedError("grid-preparation-invalid", "网格写入准备结果不属于当前地图");
  replaceMapContents(map, prepared.map);
  invalidateSettlementCellIndex(map);
  rebuildSettlementCellIndex(map, {syncLegacy: true});
  return prepared.result;
}

function prepareTopologyReplacement(map, nextGrid, context) {
  const startedAt = performance.now();
  const working = structuredClone(map);
  const oldGrid = working.grid;
  const oldPack = working.pack;
  const oldFeatures = working.features;
  working.grid = nextGrid;

  const features = extractFeatures(working.grid, {preserveHeights: true});
  transferFeatureMetadata(oldFeatures?.features, features.features, oldGrid, working.grid);
  working.features = features;

  const generatedPack = buildPack(working.grid, features);
  projectPackCellFields(oldGrid, oldPack, working.grid, generatedPack);
  transferPackFeatureMetadata(oldPack?.features, generatedPack.features, oldGrid, oldPack, working.grid, generatedPack);
  working.pack = {
    ...(oldPack || {}),
    ...generatedPack,
    metadata: {...(oldPack?.metadata || {}), ...generatedPack.metadata, topologyRefined: true}
  };

  const migration = migrateSpatialReferences(working, {oldGrid, oldPack, newGrid: working.grid, newPack: working.pack});
  rebuildSettlementCellIndex(working, {syncLegacy: true});
  working.options = {...(working.options || {}), cellsTarget: working.grid.points.length};
  refreshMapMetadataAndSummary(working);
  working.metadata.gridRefinement = {
    version: GRID_TOPOLOGY_API_VERSION,
    action: context.action,
    sourceFingerprint: context.sourceFingerprint,
    targetFingerprint: fingerprintGridStructure(working.grid),
    sourceCells: oldGrid.points.length,
    targetCells: working.grid.points.length,
    completedAt: new Date().toISOString()
  };
  const result = {
    executed: true,
    action: context.action,
    source: {cells: oldGrid.points.length, packCells: oldPack?.cells?.i?.length || 0, fingerprint: context.sourceFingerprint},
    target: {cells: working.grid.points.length, packCells: working.pack.cells.i.length, fingerprint: working.metadata.gridRefinement.targetFingerprint},
    refinement: context.refinement || null,
    migration,
    feature: {
      count: working.features.features.filter(Boolean).length,
      coastlineSegments: working.features.shore?.coastline?.length || 0,
      lakeShoreSegments: working.features.shore?.lakeShore?.length || 0
    },
    prepareMs: round(performance.now() - startedAt, 2),
    inspectionToken: context.inspectionToken
  };
  return {sourceMap: map, map: working, result};
}

function projectPackCellFields(oldGrid, oldPack, newGrid, newPack) {
  if (!oldPack?.cells) return;
  const reserved = new Set(["i", "c", "v", "p", "g", "h", "area", "f", "t", "type", "haven", "harbor", "state", "province", "region", "culture", "religion", "biome", "temp", "prec", "pop", "burg"]);
  const oldCount = oldPack.cells.i?.length || oldPack.cells.g?.length || 0;
  const mother = newGrid.refinement?.mother;
  for (const [key, values] of Object.entries(oldPack.cells)) {
    if (reserved.has(key) || !values || typeof values.length !== "number" || values.length !== oldCount || typeof values === "string") continue;
    const projected = new Array(newPack.cells.i.length);
    for (let packCell = 0; packCell < projected.length; packCell++) {
      const gridCell = newPack.cells.g[packCell];
      const oldGridCell = mother?.[gridCell] ?? Math.min(gridCell, oldGrid.points.length - 1);
      const oldPackCell = oldGrid.cells.pack?.[oldGridCell];
      projected[packCell] = oldPackCell >= 0 ? cloneValue(values[oldPackCell]) : defaultFieldValue(values);
    }
    newPack.cells[key] = projected;
  }
}

function preserveProjectedFields(oldGrid, newGrid) {
  const count = oldGrid.points.length;
  if (newGrid.points.length !== count) return;
  const reserved = new Set(["i", "c", "v", "p", "h", "b", "pack", "t", "f"]);
  for (const [key, values] of Object.entries(oldGrid.cells)) {
    if (reserved.has(key) || !values || typeof values.length !== "number" || values.length !== count || typeof values === "string") continue;
    newGrid.cells[key] = Array.from(values, cloneValue);
  }
}

function transferFeatureMetadata(oldFeatures, newFeatures, oldGrid, newGrid) {
  if (!Array.isArray(oldFeatures) || !Array.isArray(newFeatures)) return;
  const mapped = new Map();
  for (let oldCell = 0; oldCell < oldGrid.points.length; oldCell++) {
    const oldId = Number(oldGrid.cells.f?.[oldCell]) || 0;
    const newId = Number(newGrid.cells.f?.[oldCell]) || 0;
    if (oldId && newId && !mapped.has(newId)) mapped.set(newId, oldId);
  }
  for (const [newId, oldId] of mapped) {
    const oldFeature = oldFeatures[oldId];
    const next = newFeatures[newId];
    if (!oldFeature || !next) continue;
    newFeatures[newId] = {...cloneValue(oldFeature), ...next, id: newId, i: newId, cells: next.cells};
  }
}

function transferPackFeatureMetadata(oldFeatures, newFeatures, oldGrid, oldPack, newGrid, newPack) {
  if (!Array.isArray(oldFeatures) || !Array.isArray(newFeatures) || !oldPack?.cells) return;
  const mapped = new Map();
  for (let oldCell = 0; oldCell < oldGrid.points.length; oldCell++) {
    const oldPackCell = oldGrid.cells.pack?.[oldCell];
    const newPackCell = newGrid.cells.pack?.[oldCell];
    if (!(oldPackCell >= 0) || !(newPackCell >= 0)) continue;
    const oldId = Number(oldPack.cells.f?.[oldPackCell]) || 0;
    const newId = Number(newPack.cells.f?.[newPackCell]) || 0;
    if (oldId && newId && !mapped.has(newId)) mapped.set(newId, oldId);
  }
  for (const [newId, oldId] of mapped) {
    const oldFeature = oldFeatures[oldId];
    const next = newFeatures[newId];
    if (!oldFeature || !next) continue;
    newFeatures[newId] = {...cloneValue(oldFeature), ...next, id: newId, i: newId, cells: next.cells};
  }
}

function migrateSpatialReferences(map, {oldGrid, oldPack, newGrid, newPack}) {
  const report = {cities: 0, burgs: 0, markers: 0, stateCenters: 0, provinceCenters: 0, routes: 0, rivers: 0, zones: 0, invalid: []};
  const toGrid = packCell => {
    const cell = Number(packCell);
    return Number.isInteger(cell) && cell >= 0 && cell < (oldPack?.cells?.g?.length || 0) ? Number(oldPack.cells.g[cell]) : -1;
  };
  const toPack = gridCell => {
    const cell = Number(gridCell);
    const direct = Number.isInteger(cell) ? Number(newGrid.cells.pack?.[cell]) : -1;
    if (direct >= 0) return direct;
    return nearestPackCell(newPack, pointForGridCell(newGrid, cell));
  };
  const remapObject = (object, kind) => {
    if (!object || object.removed) return;
    const gridCell = Number.isInteger(Number(object.cell)) && Number(object.cell) < oldGrid.points.length ? Number(object.cell) : toGrid(object.packCell);
    if (gridCell >= 0) {
      if (Object.prototype.hasOwnProperty.call(object, "cell")) object.cell = gridCell;
      if (Object.prototype.hasOwnProperty.call(object, "packCell")) object.packCell = toPack(gridCell);
      if (object.data && Object.prototype.hasOwnProperty.call(object.data, "packCell")) object.data.packCell = toPack(gridCell);
      report[kind]++;
    }
  };

  const remapBurg = burg => {
    if (!burg || burg.removed) return;
    const oldPackCell = Number(burg.cell ?? burg.packCell);
    const gridCell = toGrid(oldPackCell);
    if (gridCell < 0) return;
    const packCell = toPack(gridCell);
    burg.cell = packCell;
    if (Object.prototype.hasOwnProperty.call(burg, "packCell")) burg.packCell = packCell;
    report.burgs++;
  };

  for (const city of map.settlements?.cities || []) remapObject(city, "cities");
  for (const burg of new Set([...(map.settlements?.burgs || []), ...(map.pack?.burgs || [])])) remapBurg(burg);
  for (const marker of map.markers?.markers || []) remapObject(marker, "markers");
  for (const state of map.politics?.states || []) remapCenter(state, "stateCenters", toGrid, toPack, report);
  for (const province of map.politics?.provinces || []) remapCenter(province, "provinceCenters", toGrid, toPack, report);

  for (const route of map.settlements?.routes || map.routes?.routes || []) {
    const oldPath = normalizeGridPath(route.cells, oldPack, oldGrid);
    if (!oldPath.length) continue;
    route.cells = expandRefinedPath(oldPath, oldGrid, newGrid);
    route.packCells = compact(route.cells.map(toPack).filter(cell => cell >= 0));
    report.routes++;
  }
  for (const river of map.rivers?.rivers || []) {
    const oldPath = normalizeGridPath(river.gridCells?.length ? river.gridCells : river.cells, oldPack, oldGrid, Boolean(river.gridCells?.length));
    if (!oldPath.length) continue;
    river.gridCells = expandRefinedPath(oldPath, oldGrid, newGrid);
    river.cells = compact(river.gridCells.map(toPack).filter(cell => cell >= 0));
    river.sourceGrid = river.gridCells[0];
    river.mouthGrid = river.gridCells.at(-1);
    river.source = river.cells[0];
    river.mouth = river.cells.at(-1);
    report.rivers++;
  }
  for (const zone of map.zones?.zones || []) {
    if (!Array.isArray(zone?.cells)) continue;
    zone.cells = compact(zone.cells.map(toGrid).map(toPack).filter(cell => cell >= 0));
    report.zones++;
  }
  return report;
}

function remapCenter(object, key, toGrid, toPack, report) {
  if (!object || object.removed) return;
  const gridCell = Number.isInteger(Number(object.gridCenter)) ? Number(object.gridCenter) : toGrid(object.center);
  if (gridCell < 0) return;
  object.gridCenter = gridCell;
  object.center = toPack(gridCell);
  report[key]++;
}

function normalizeGridPath(path, oldPack, oldGrid, alreadyGrid = true) {
  if (!Array.isArray(path)) return [];
  const result = [];
  for (const value of path) {
    const cell = Number(value);
    const gridCell = alreadyGrid ? cell : Number(oldPack?.cells?.g?.[cell]);
    if (Number.isInteger(gridCell) && gridCell >= 0 && gridCell < oldGrid.points.length && result.at(-1) !== gridCell) result.push(gridCell);
  }
  return result;
}

function expandRefinedPath(path, sourceGrid, grid) {
  if (!grid.refinement?.mother || path.length < 2) return [...path];
  const sourcePath = completeSourcePath(path, sourceGrid);
  const result = [sourcePath[0]];
  for (let index = 1; index < sourcePath.length; index++) {
    const segment = constrainedShortestPath(grid, result.at(-1), sourcePath[index]);
    if (segment.length) result.push(...segment.slice(1));
    else if (result.at(-1) !== sourcePath[index]) result.push(sourcePath[index]);
  }
  return compact(result);
}

function completeSourcePath(path, grid) {
  const result = [path[0]];
  for (let index = 1; index < path.length; index++) {
    const start = result.at(-1);
    const end = path[index];
    if (start === end) continue;
    if (grid.cells.c[start]?.includes(end)) {
      result.push(end);
      continue;
    }
    const segment = shortestGridPath(grid, start, end);
    if (segment.length) result.push(...segment.slice(1));
    else result.push(end);
  }
  return compact(result);
}

function shortestGridPath(grid, start, end) {
  const queue = [start];
  const previous = new Map([[start, -1]]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    for (const neighbor of grid.cells.c[cell] || []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, cell);
      if (neighbor === end) return reconstructPath(previous, end);
      queue.push(neighbor);
    }
  }
  return [];
}

function constrainedShortestPath(grid, start, end) {
  if (start === end) return [start];
  const mother = grid.refinement.mother;
  const allowedMothers = new Set([mother[start], mother[end]]);
  const queue = [start];
  const previous = new Map([[start, -1]]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    for (const neighbor of grid.cells.c[cell] || []) {
      if (previous.has(neighbor) || !allowedMothers.has(mother[neighbor])) continue;
      previous.set(neighbor, cell);
      if (neighbor === end) return reconstructPath(previous, end);
      queue.push(neighbor);
    }
  }
  return [];
}

function reconstructPath(previous, end) {
  const path = [];
  for (let cell = end; cell !== -1; cell = previous.get(cell)) path.push(cell);
  return path.reverse();
}

function refreshMapMetadataAndSummary(map) {
  map.metadata = map.metadata || {};
  map.metadata.cellsTarget = map.grid.points.length;
  map.metadata.gridCells = map.grid.points.length;
  map.metadata.packCells = map.pack.cells.i.length;
  map.metadata.featureCount = map.features.features.filter(Boolean).length;
  map.summary = createGenerationSummary(map.options, map.grid, map.features, map.climate, map.society, map.politics, map.settlements, map.markers, map.pack, map.rivers, map.layers, map.military, map.zones, map.economy, map.diplomacy);
  map.metadata.checksum = map.summary.checksum;
}

function currentBinding(map, revisionTracker) {
  const revision = revisionTracker?.getSnapshot?.() || {};
  return {
    mapIdentity: revision.mapIdentity ?? null,
    mapRevision: Number(revision.mapRevision) || 0,
    sourceFingerprint: fingerprintGridStructure(map.grid)
  };
}

function assertAuthorizedInspection(inspection, options, action) {
  if (!inspection.valid) throw codedError("grid-structure-invalid", inspection.errors.slice(0, 3).join("；"), inspection);
  if (options?.confirm !== true) throw codedError("confirmation_required", `${action} 需要 options.confirm === true`);
  if (!options?.inspectionToken) throw codedError("inspection_required", `${action} 需要最新预检令牌`);
  if (options.inspectionToken !== inspection.inspectionToken) throw codedError("inspection_stale", `${action} 预检令牌已过期`);
}

function inspectionToken(inspection) {
  const input = `${inspection.action}|${inspection.binding.mapIdentity}|${inspection.binding.mapRevision}|${inspection.binding.sourceFingerprint}|${inspection.target?.cells || 0}|${inspection.target?.vertices || 0}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `grid-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function replaceMapContents(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function nearestPackCell(pack, point) {
  if (!point || !pack?.cells?.p?.length) return -1;
  let best = -1;
  let distance = Infinity;
  for (let cell = 0; cell < pack.cells.p.length; cell++) {
    const candidate = pack.cells.p[cell];
    const next = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
    if (next < distance) {
      best = cell;
      distance = next;
    }
  }
  return best;
}

function pointForGridCell(grid, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < grid.points.length ? grid.points[cell] : null;
}

function defaultFieldValue(values) {
  return ArrayBuffer.isView(values) ? 0 : null;
}

function compact(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function normalizeTarget(value, sourceCells) {
  const target = Number(value);
  if (!Number.isInteger(target) || target <= sourceCells || target > 200_000) throw codedError("invalid-target", `targetCells 必须是 ${sourceCells + 1}～200000 的整数`);
  return target;
}

function assertMap(map) {
  if (!map?.grid?.points || !map?.pack?.cells) throw codedError("map-not-ready", "当前地图尚未准备好");
}

function cloneValue(value) {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function codedError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}
