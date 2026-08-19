export const RENDER_CACHE_SCHEMA_VERSION = 1;
const CELL_VISUAL_CHECKPOINT_INTERVAL = 32;

export function packCellVisualMesh(mesh, binding = {}) {
  const cells = (mesh?.cells || []).filter(Boolean);
  const cellPoints = packPointLists(cells.map(cell => cell.points || []));
  const cellTriangles = packFloatLists(cells.map(cell => cell.ndcTriangles || []), Float32Array);
  const edgeEntries = [...(mesh?.edgeCurves instanceof Map ? mesh.edgeCurves : new Map())].sort((a, b) => a[0].localeCompare(b[0]));
  const edgePoints = packPointLists(edgeEntries.map(([, points]) => points || []));
  const shoreEdges = [...(mesh?.shoreEdges instanceof Set ? mesh.shoreEdges : new Set())]
    .map(parseEdgeKey)
    .filter(Boolean)
    .sort(compareEdgePair);
  const summary = {};
  for (const [key, value] of Object.entries(mesh || {})) {
    if (["cells", "edgeCurves", "shoreEdges"].includes(key)) continue;
    summary[key] = structuredCloneSafe(value);
  }
  return {
    schemaVersion: RENDER_CACHE_SCHEMA_VERSION,
    binding: normalizeBinding(binding),
    cellIds: Int32Array.from(cells.map(cell => Number(cell.cell))),
    centers: Float64Array.from(cells.flatMap(cell => [Number(cell.center?.[0]) || 0, Number(cell.center?.[1]) || 0])),
    cellPointOffsets: cellPoints.offsets,
    cellPoints: cellPoints.values,
    triangleOffsets: cellTriangles.offsets,
    ndcTriangles: cellTriangles.values,
    triangleCounts: Uint32Array.from(cells.map(cell => Number(cell.triangleCount) || 0)),
    triangulationFallbacks: cells.map(cell => structuredCloneSafe(cell.triangulationFallback ?? null)),
    edgeCells: Int32Array.from(edgeEntries.flatMap(([key]) => parseEdgeKey(key) || [-1, -1])),
    edgePointOffsets: edgePoints.offsets,
    edgePoints: edgePoints.values,
    shoreEdges: Int32Array.from(shoreEdges.flat()),
    summary
  };
}

export function unpackCellVisualMesh(dto, expectedBinding = null) {
  assertCacheBinding(dto, expectedBinding, "cell-visual");
  validateOffsetSpecs(assertCellVisualMeshDtoShape(dto));
  validateCellTriangleSpans(dto);
  const cells = [];
  for (let index = 0; index < dto.cellIds.length; index++) {
    cells.push({
      cell: dto.cellIds[index],
      center: [dto.centers[index * 2], dto.centers[index * 2 + 1]],
      points: unpackPointList(dto.cellPoints, dto.cellPointOffsets, index),
      ndcTriangles: dto.ndcTriangles.slice(dto.triangleOffsets[index], dto.triangleOffsets[index + 1]),
      triangleCount: dto.triangleCounts[index],
      triangulationFallback: structuredCloneSafe(dto.triangulationFallbacks?.[index] ?? null)
    });
  }
  const edgeCurves = new Map();
  for (let index = 0; index < dto.edgePointOffsets.length - 1; index++) {
    const a = dto.edgeCells[index * 2];
    const b = dto.edgeCells[index * 2 + 1];
    edgeCurves.set(`${a}:${b}`, unpackPointList(dto.edgePoints, dto.edgePointOffsets, index));
  }
  const shoreEdges = new Set();
  for (let index = 0; index < dto.shoreEdges.length; index += 2) shoreEdges.add(`${dto.shoreEdges[index]}:${dto.shoreEdges[index + 1]}`);
  return {...structuredCloneSafe(dto.summary || {}), cells, edgeCurves, shoreEdges};
}

export async function unpackCellVisualMeshInChunks(dto, expectedBinding = null, options = {}) {
  assertCacheBinding(dto, expectedBinding, "cell-visual");
  const gate = createRenderChunkGate(options);
  await validateOffsetSpecsInChunks(assertCellVisualMeshDtoShape(dto), gate, "cell-visual-shape");
  await validateCellTriangleSpansInChunks(dto, gate);
  const cells = [];
  for (let index = 0; index < dto.cellIds.length; index++) {
    cells.push({
      cell: dto.cellIds[index],
      center: [dto.centers[index * 2], dto.centers[index * 2 + 1]],
      points: unpackPointList(dto.cellPoints, dto.cellPointOffsets, index),
      ndcTriangles: dto.ndcTriangles.slice(dto.triangleOffsets[index], dto.triangleOffsets[index + 1]),
      triangleCount: dto.triangleCounts[index],
      triangulationFallback: structuredCloneSafe(dto.triangulationFallbacks?.[index] ?? null)
    });
    if (isCellVisualCheckpoint(index + 1, dto.cellIds.length)) await gate.checkpoint("cells", index + 1, dto.cellIds.length);
  }
  const edgeCurves = new Map();
  for (let index = 0; index < dto.edgePointOffsets.length - 1; index++) {
    const a = dto.edgeCells[index * 2];
    const b = dto.edgeCells[index * 2 + 1];
    edgeCurves.set(`${a}:${b}`, unpackPointList(dto.edgePoints, dto.edgePointOffsets, index));
    if (isCellVisualCheckpoint(index + 1, dto.edgePointOffsets.length - 1)) await gate.checkpoint("edges", index + 1, dto.edgePointOffsets.length - 1);
  }
  const shoreEdges = new Set();
  for (let index = 0; index < dto.shoreEdges.length; index += 2) {
    shoreEdges.add(`${dto.shoreEdges[index]}:${dto.shoreEdges[index + 1]}`);
    if (isCellVisualCheckpoint(index / 2 + 1, dto.shoreEdges.length / 2)) await gate.checkpoint("shore-edges", index / 2 + 1, dto.shoreEdges.length / 2);
  }
  gate.assertCurrent();
  return {...structuredCloneSafe(dto.summary || {}), cells, edgeCurves, shoreEdges};
}

export function packShoreVisualPaths(paths, binding = {}) {
  return {
    schemaVersion: RENDER_CACHE_SCHEMA_VERSION,
    binding: normalizeBinding(binding),
    coastline: packShorePathGroup(paths?.coastline || []),
    lakeShore: packShorePathGroup(paths?.lakeShore || []),
    topology: structuredCloneSafe(paths?.topology || null)
  };
}

export function unpackShoreVisualPaths(dto, expectedBinding = null) {
  assertCacheBinding(dto, expectedBinding, "shore");
  validateOffsetSpecs(assertShoreVisualPathsDtoShape(dto));
  return {
    coastline: unpackShorePathGroup(dto.coastline),
    lakeShore: unpackShorePathGroup(dto.lakeShore),
    topology: structuredCloneSafe(dto.topology || null)
  };
}

export async function unpackShoreVisualPathsInChunks(dto, expectedBinding = null, options = {}) {
  assertCacheBinding(dto, expectedBinding, "shore");
  const gate = createRenderChunkGate(options);
  await validateOffsetSpecsInChunks(assertShoreVisualPathsDtoShape(dto), gate, "shore-shape");
  return {
    coastline: await unpackShorePathGroupInChunks(dto.coastline, gate, "coastline"),
    lakeShore: await unpackShorePathGroupInChunks(dto.lakeShore, gate, "lake-shore"),
    topology: structuredCloneSafe(dto.topology || null)
  };
}

export function packPoliticalVisualPaths(paths, binding = {}, field = "state") {
  const boundaries = paths?.boundaries || [];
  const points = packPointLists(boundaries.map(path => path.points || []));
  const sides = packPointLists(boundaries.map(path => (path.sideVectors || []).map(side => [side.x, side.y])));
  const valuesA = packIntLists(boundaries.map(path => path.valuesA || []));
  const valuesB = packIntLists(boundaries.map(path => path.valuesB || []));
  return {
    schemaVersion: RENDER_CACHE_SCHEMA_VERSION,
    binding: normalizeBinding(binding),
    field: String(field),
    pointOffsets: points.offsets,
    points: points.values,
    sideOffsets: sides.offsets,
    sideVectors: sides.values,
    valuesAOffsets: valuesA.offsets,
    valuesA: valuesA.values,
    valuesBOffsets: valuesB.offsets,
    valuesB: valuesB.values
  };
}

export function unpackPoliticalVisualPaths(dto, expectedBinding = null) {
  assertCacheBinding(dto, expectedBinding, `${dto?.field || "political"}-paths`);
  validateOffsetSpecs(assertPoliticalVisualPathsDtoShape(dto));
  validatePoliticalParallelOffsets(dto);
  const boundaries = [];
  for (let index = 0; index < dto.pointOffsets.length - 1; index++) {
    boundaries.push({
      points: unpackPointList(dto.points, dto.pointOffsets, index),
      sideVectors: unpackPointList(dto.sideVectors, dto.sideOffsets, index).map(([x, y]) => ({x, y})),
      valuesA: Array.from(dto.valuesA.slice(dto.valuesAOffsets[index], dto.valuesAOffsets[index + 1])),
      valuesB: Array.from(dto.valuesB.slice(dto.valuesBOffsets[index], dto.valuesBOffsets[index + 1]))
    });
  }
  return {boundaries};
}

export async function unpackPoliticalVisualPathsInChunks(dto, expectedBinding = null, options = {}) {
  assertCacheBinding(dto, expectedBinding, `${dto?.field || "political"}-paths`);
  const gate = createRenderChunkGate(options);
  await validateOffsetSpecsInChunks(assertPoliticalVisualPathsDtoShape(dto), gate, `${dto.field}-path-shape`);
  await validatePoliticalParallelOffsetsInChunks(dto, gate);
  const boundaries = [];
  const total = dto.pointOffsets.length - 1;
  for (let index = 0; index < total; index++) {
    boundaries.push({
      points: unpackPointList(dto.points, dto.pointOffsets, index),
      sideVectors: unpackPointList(dto.sideVectors, dto.sideOffsets, index).map(([x, y]) => ({x, y})),
      valuesA: Array.from(dto.valuesA.slice(dto.valuesAOffsets[index], dto.valuesAOffsets[index + 1])),
      valuesB: Array.from(dto.valuesB.slice(dto.valuesBOffsets[index], dto.valuesBOffsets[index + 1]))
    });
    await gate.checkpoint("boundaries", index + 1, total);
  }
  gate.assertCurrent();
  return {boundaries};
}

export function assertCacheBinding(dto, expected, cacheKind = "render") {
  if (!dto || Number(dto.schemaVersion) !== RENDER_CACHE_SCHEMA_VERSION) throw cacheError("render-cache-version", `${cacheKind} cache 版本无效`);
  if (expected === null || expected === undefined) return dto;
  const actualBinding = normalizeBinding(dto.binding);
  const expectedBinding = normalizeBinding(expected);
  if (actualBinding.mapIdentity !== expectedBinding.mapIdentity || actualBinding.mapRevision !== expectedBinding.mapRevision || actualBinding.topologyRevision !== expectedBinding.topologyRevision) {
    throw cacheError("render-cache-stale", `${cacheKind} cache 不属于当前地图 revision`, {cacheKind, actual: actualBinding, expected: expectedBinding});
  }
  return dto;
}

function assertCellVisualMeshDtoShape(dto) {
  assertTypedArray(dto.cellIds, Int32Array, "cell-visual.cellIds");
  const cellCount = dto.cellIds.length;
  assertTypedArrayLength(dto.centers, Float64Array, cellCount * 2, "cell-visual.centers");
  assertTypedArray(dto.cellPoints, Float64Array, "cell-visual.cellPoints");
  assertEvenLength(dto.cellPoints, "cell-visual.cellPoints");
  assertTypedArray(dto.ndcTriangles, Float32Array, "cell-visual.ndcTriangles");
  assertTypedArrayLength(dto.triangleCounts, Uint32Array, cellCount, "cell-visual.triangleCounts");
  if (!Array.isArray(dto.triangulationFallbacks) || dto.triangulationFallbacks.length !== cellCount) {
    throw cacheShapeError("cell-visual.triangulationFallbacks", "cell visual triangulation fallback 数量无效");
  }
  assertTypedArray(dto.edgeCells, Int32Array, "cell-visual.edgeCells");
  assertEvenLength(dto.edgeCells, "cell-visual.edgeCells");
  assertTypedArray(dto.edgePoints, Float64Array, "cell-visual.edgePoints");
  assertEvenLength(dto.edgePoints, "cell-visual.edgePoints");
  assertTypedArray(dto.shoreEdges, Int32Array, "cell-visual.shoreEdges");
  assertEvenLength(dto.shoreEdges, "cell-visual.shoreEdges");
  return [
    assertOffsetSpec(dto.cellPointOffsets, cellCount, dto.cellPoints.length / 2, "cell-visual.cellPointOffsets"),
    assertOffsetSpec(dto.triangleOffsets, cellCount, dto.ndcTriangles.length, "cell-visual.triangleOffsets"),
    assertOffsetSpec(dto.edgePointOffsets, dto.edgeCells.length / 2, dto.edgePoints.length / 2, "cell-visual.edgePointOffsets")
  ];
}

function assertShoreVisualPathsDtoShape(dto) {
  if (!dto || typeof dto !== "object") throw cacheShapeError("shore", "shore cache 结构无效");
  return [
    ...assertShorePathGroupDtoShape(dto.coastline, "shore.coastline"),
    ...assertShorePathGroupDtoShape(dto.lakeShore, "shore.lakeShore")
  ];
}

function assertShorePathGroupDtoShape(group, label) {
  if (!group || typeof group !== "object") throw cacheShapeError(label, `${label} 结构无效`);
  const pathCount = Number(group.pathCount);
  if (!Number.isSafeInteger(pathCount) || pathCount < 0) throw cacheShapeError(`${label}.pathCount`, `${label} pathCount 无效`);
  const pointFields = [
    ["pointOffsets", "points"],
    ["sourcePointOffsets", "sourcePoints"],
    ["renderPointOffsets", "renderPoints"],
    ["sideOffsets", "sideVectors"]
  ];
  const intFields = [
    ["landCellOffsets", "landCells"],
    ["waterCellOffsets", "waterCells"],
    ["localFallbackOffsets", "localFallbackSegments"]
  ];
  const specs = [];
  for (const [offsetKey, valuesKey] of pointFields) {
    assertTypedArray(group[valuesKey], Float64Array, `${label}.${valuesKey}`);
    assertEvenLength(group[valuesKey], `${label}.${valuesKey}`);
    specs.push(assertOffsetSpec(group[offsetKey], pathCount, group[valuesKey].length / 2, `${label}.${offsetKey}`));
  }
  for (const [offsetKey, valuesKey] of intFields) {
    assertTypedArray(group[valuesKey], Int32Array, `${label}.${valuesKey}`);
    specs.push(assertOffsetSpec(group[offsetKey], pathCount, group[valuesKey].length, `${label}.${offsetKey}`));
  }
  assertTypedArray(group.edgePoints, Float64Array, `${label}.edgePoints`);
  assertTypedArray(group.edgeCells, Int32Array, `${label}.edgeCells`);
  assertTypedArray(group.edgeSides, Float64Array, `${label}.edgeSides`);
  if (group.edgePoints.length % 4 !== 0 || group.edgeCells.length % 2 !== 0 || group.edgeSides.length % 2 !== 0) {
    throw cacheShapeError(`${label}.edges`, `${label} edge 并行数组长度无效`);
  }
  const edgeCount = group.edgePoints.length / 4;
  if (group.edgeCells.length / 2 !== edgeCount || group.edgeSides.length / 2 !== edgeCount) {
    throw cacheShapeError(`${label}.edges`, `${label} edge 并行数组数量不一致`);
  }
  specs.push(assertOffsetSpec(group.edgeOffsets, pathCount, edgeCount, `${label}.edgeOffsets`));
  if (!Array.isArray(group.metadata) || group.metadata.length !== pathCount) {
    throw cacheShapeError(`${label}.metadata`, `${label} metadata 数量无效`);
  }
  return specs;
}

function assertPoliticalVisualPathsDtoShape(dto) {
  if (!dto || !["state", "province"].includes(dto.field)) {
    throw cacheShapeError("political.field", "political cache field 无效");
  }
  assertTypedArray(dto.points, Float64Array, `${dto.field}.points`);
  assertTypedArray(dto.sideVectors, Float64Array, `${dto.field}.sideVectors`);
  assertEvenLength(dto.points, `${dto.field}.points`);
  assertEvenLength(dto.sideVectors, `${dto.field}.sideVectors`);
  assertTypedArray(dto.valuesA, Int32Array, `${dto.field}.valuesA`);
  assertTypedArray(dto.valuesB, Int32Array, `${dto.field}.valuesB`);
  assertTypedArray(dto.pointOffsets, Uint32Array, `${dto.field}.pointOffsets`);
  if (!dto.pointOffsets.length) throw cacheShapeError(`${dto.field}.pointOffsets`, `${dto.field} path offset 为空`);
  const pathCount = dto.pointOffsets.length - 1;
  return [
    assertOffsetSpec(dto.pointOffsets, pathCount, dto.points.length / 2, `${dto.field}.pointOffsets`),
    assertOffsetSpec(dto.sideOffsets, pathCount, dto.sideVectors.length / 2, `${dto.field}.sideOffsets`),
    assertOffsetSpec(dto.valuesAOffsets, pathCount, dto.valuesA.length, `${dto.field}.valuesAOffsets`),
    assertOffsetSpec(dto.valuesBOffsets, pathCount, dto.valuesB.length, `${dto.field}.valuesBOffsets`)
  ];
}

function validatePoliticalParallelOffsets(dto) {
  for (let index = 0; index < dto.pointOffsets.length; index++) assertPoliticalParallelOffset(dto, index);
}

async function validatePoliticalParallelOffsetsInChunks(dto, gate) {
  for (let index = 0; index < dto.pointOffsets.length; index++) {
    assertPoliticalParallelOffset(dto, index);
    await gate.checkpoint(`${dto.field}-parallel-shape`, index + 1, dto.pointOffsets.length);
  }
}

function assertPoliticalParallelOffset(dto, index) {
  const expected = dto.pointOffsets[index];
  if (dto.sideOffsets[index] !== expected || dto.valuesAOffsets[index] !== expected || dto.valuesBOffsets[index] !== expected) {
    throw cacheShapeError(`${dto.field}.parallelOffsets`, `${dto.field} path 并行数组 offset 不一致`, {index});
  }
}

function validateCellTriangleSpans(dto) {
  for (let index = 0; index < dto.cellIds.length; index++) assertCellTriangleSpan(dto, index);
}

async function validateCellTriangleSpansInChunks(dto, gate) {
  for (let index = 0; index < dto.cellIds.length; index++) {
    assertCellTriangleSpan(dto, index);
    if (isCellVisualCheckpoint(index + 1, dto.cellIds.length)) await gate.checkpoint("cell-visual-triangle-shape", index + 1, dto.cellIds.length);
  }
}

function assertCellTriangleSpan(dto, index) {
  const span = dto.triangleOffsets[index + 1] - dto.triangleOffsets[index];
  if (span % 6 !== 0 || dto.triangleCounts[index] !== span / 6) {
    throw cacheShapeError("cell-visual.triangleCounts", "cell visual triangle span 与 triangleCount 不一致", {
      index,
      span,
      triangleCount: dto.triangleCounts[index]
    });
  }
}

function assertOffsetSpec(offsets, itemCount, expectedLast, label) {
  assertTypedArrayLength(offsets, Uint32Array, itemCount + 1, label);
  if (offsets[0] !== 0 || offsets[offsets.length - 1] !== expectedLast) {
    throw cacheShapeError(label, `${label} 起止 offset 无效`, {expectedLast, actualLast: offsets[offsets.length - 1]});
  }
  return {offsets, label};
}

function validateOffsetSpecs(specs) {
  for (const spec of specs) {
    let previous = spec.offsets[0];
    for (let index = 1; index < spec.offsets.length; index++) {
      const current = spec.offsets[index];
      if (current < previous) throw cacheShapeError(spec.label, `${spec.label} offset 非单调`, {index, previous, current});
      previous = current;
    }
  }
}

async function validateOffsetSpecsInChunks(specs, gate, stage) {
  let completed = 0;
  const total = specs.reduce((sum, spec) => sum + Math.max(0, spec.offsets.length - 1), 0);
  for (const spec of specs) {
    let previous = spec.offsets[0];
    for (let index = 1; index < spec.offsets.length; index++) {
      const current = spec.offsets[index];
      if (current < previous) throw cacheShapeError(spec.label, `${spec.label} offset 非单调`, {index, previous, current});
      previous = current;
      completed++;
      if (isCellVisualCheckpoint(completed, total)) await gate.checkpoint(stage, completed, total);
    }
  }
  gate.assertCurrent();
}

function assertTypedArray(value, Type, label) {
  if (!(value instanceof Type)) throw cacheShapeError(label, `${label} 必须为 ${Type.name}`);
}

function isCellVisualCheckpoint(completed, total) {
  return completed >= total || completed % CELL_VISUAL_CHECKPOINT_INTERVAL === 0;
}

function assertTypedArrayLength(value, Type, length, label) {
  assertTypedArray(value, Type, label);
  if (value.length !== length) throw cacheShapeError(label, `${label} 长度无效`, {expected: length, actual: value.length});
}

function assertEvenLength(value, label) {
  if (value.length % 2 !== 0) throw cacheShapeError(label, `${label} 长度必须为偶数`, {length: value.length});
}

function cacheShapeError(field, message, details = {}) {
  return cacheError("render-cache-shape", message, {field, ...details});
}

function packShorePathGroup(paths) {
  const points = packPointLists(paths.map(path => path.points || []));
  const sourcePoints = packPointLists(paths.map(path => path.sourcePoints || []));
  const renderPoints = packPointLists(paths.map(path => path.renderPoints || []));
  const sides = packPointLists(paths.map(path => (path.sideVectors || []).map(side => [side.x, side.y])));
  const landCells = packIntLists(paths.map(path => path.landCells || []));
  const waterCells = packIntLists(paths.map(path => path.waterCells || []));
  const localFallback = packIntLists(paths.map(path => path.topologyLocalFallbackSegments || []));
  const sourceEdges = paths.map(path => path.sourceEdges || []);
  const edgeOffsets = offsetsForLengths(sourceEdges.map(edges => edges.length));
  const edgePoints = new Float64Array(edgeOffsets.at(-1) * 4);
  const edgeCells = new Int32Array(edgeOffsets.at(-1) * 2);
  const edgeSides = new Float64Array(edgeOffsets.at(-1) * 2);
  let edgeIndex = 0;
  for (const edges of sourceEdges) {
    for (const edge of edges) {
      edgePoints.set([Number(edge.a?.[0]) || 0, Number(edge.a?.[1]) || 0, Number(edge.b?.[0]) || 0, Number(edge.b?.[1]) || 0], edgeIndex * 4);
      edgeCells.set([Number(edge.landCell) || 0, Number(edge.waterCell) || 0], edgeIndex * 2);
      edgeSides.set([Number(edge.side?.x) || 0, Number(edge.side?.y) || 0], edgeIndex * 2);
      edgeIndex++;
    }
  }
  return {
    pathCount: paths.length,
    pointOffsets: points.offsets,
    points: points.values,
    sourcePointOffsets: sourcePoints.offsets,
    sourcePoints: sourcePoints.values,
    renderPointOffsets: renderPoints.offsets,
    renderPoints: renderPoints.values,
    sideOffsets: sides.offsets,
    sideVectors: sides.values,
    landCellOffsets: landCells.offsets,
    landCells: landCells.values,
    waterCellOffsets: waterCells.offsets,
    waterCells: waterCells.values,
    edgeOffsets,
    edgePoints,
    edgeCells,
    edgeSides,
    localFallbackOffsets: localFallback.offsets,
    localFallbackSegments: localFallback.values,
    metadata: paths.map(path => ({
      closed: Boolean(path.closed),
      topologyFallbackReason: path.topologyFallbackReason ?? null,
      topologyLocalFallbackReasons: structuredCloneSafe(path.topologyLocalFallbackReasons || {})
    }))
  };
}

function unpackShorePathGroup(group) {
  const paths = [];
  for (let index = 0; index < Number(group?.pathCount || 0); index++) {
    const edges = [];
    for (let edgeIndex = group.edgeOffsets[index]; edgeIndex < group.edgeOffsets[index + 1]; edgeIndex++) {
      edges.push({
        a: [group.edgePoints[edgeIndex * 4], group.edgePoints[edgeIndex * 4 + 1]],
        b: [group.edgePoints[edgeIndex * 4 + 2], group.edgePoints[edgeIndex * 4 + 3]],
        landCell: group.edgeCells[edgeIndex * 2],
        waterCell: group.edgeCells[edgeIndex * 2 + 1],
        side: {x: group.edgeSides[edgeIndex * 2], y: group.edgeSides[edgeIndex * 2 + 1]}
      });
    }
    const meta = group.metadata?.[index] || {};
    paths.push({
      points: unpackPointList(group.points, group.pointOffsets, index),
      sourcePoints: unpackPointList(group.sourcePoints, group.sourcePointOffsets, index),
      renderPoints: unpackPointList(group.renderPoints, group.renderPointOffsets, index),
      sideVectors: unpackPointList(group.sideVectors, group.sideOffsets, index).map(([x, y]) => ({x, y})),
      landCells: Array.from(group.landCells.slice(group.landCellOffsets[index], group.landCellOffsets[index + 1])),
      waterCells: Array.from(group.waterCells.slice(group.waterCellOffsets[index], group.waterCellOffsets[index + 1])),
      sourceEdges: edges,
      closed: Boolean(meta.closed),
      topologyFallbackReason: meta.topologyFallbackReason ?? null,
      topologyLocalFallbackSegments: Array.from(group.localFallbackSegments.slice(group.localFallbackOffsets[index], group.localFallbackOffsets[index + 1])),
      topologyLocalFallbackReasons: structuredCloneSafe(meta.topologyLocalFallbackReasons || {})
    });
  }
  return paths;
}

async function unpackShorePathGroupInChunks(group, gate, stage) {
  const paths = [];
  const total = Number(group?.pathCount || 0);
  for (let index = 0; index < total; index++) {
    const edges = [];
    for (let edgeIndex = group.edgeOffsets[index]; edgeIndex < group.edgeOffsets[index + 1]; edgeIndex++) {
      edges.push({
        a: [group.edgePoints[edgeIndex * 4], group.edgePoints[edgeIndex * 4 + 1]],
        b: [group.edgePoints[edgeIndex * 4 + 2], group.edgePoints[edgeIndex * 4 + 3]],
        landCell: group.edgeCells[edgeIndex * 2],
        waterCell: group.edgeCells[edgeIndex * 2 + 1],
        side: {x: group.edgeSides[edgeIndex * 2], y: group.edgeSides[edgeIndex * 2 + 1]}
      });
      if (((edgeIndex - group.edgeOffsets[index]) & 255) === 255) {
        await gate.checkpoint(`${stage}-edges`, edgeIndex - group.edgeOffsets[index] + 1, group.edgeOffsets[index + 1] - group.edgeOffsets[index]);
      }
    }
    const meta = group.metadata?.[index] || {};
    paths.push({
      points: unpackPointList(group.points, group.pointOffsets, index),
      sourcePoints: unpackPointList(group.sourcePoints, group.sourcePointOffsets, index),
      renderPoints: unpackPointList(group.renderPoints, group.renderPointOffsets, index),
      sideVectors: unpackPointList(group.sideVectors, group.sideOffsets, index).map(([x, y]) => ({x, y})),
      landCells: Array.from(group.landCells.slice(group.landCellOffsets[index], group.landCellOffsets[index + 1])),
      waterCells: Array.from(group.waterCells.slice(group.waterCellOffsets[index], group.waterCellOffsets[index + 1])),
      sourceEdges: edges,
      closed: Boolean(meta.closed),
      topologyFallbackReason: meta.topologyFallbackReason ?? null,
      topologyLocalFallbackSegments: Array.from(group.localFallbackSegments.slice(group.localFallbackOffsets[index], group.localFallbackOffsets[index + 1])),
      topologyLocalFallbackReasons: structuredCloneSafe(meta.topologyLocalFallbackReasons || {})
    });
    await gate.checkpoint(stage, index + 1, total);
  }
  return paths;
}

function packPointLists(lists) {
  const offsets = offsetsForLengths(lists.map(list => list.length));
  const values = new Float64Array(offsets.at(-1) * 2);
  let offset = 0;
  for (const list of lists) {
    for (const point of list) {
      values[offset++] = Number(point?.[0]) || 0;
      values[offset++] = Number(point?.[1]) || 0;
    }
  }
  return {offsets, values};
}

function packFloatLists(lists, Type) {
  const offsets = offsetsForLengths(lists.map(list => list.length));
  const values = new Type(offsets.at(-1));
  let offset = 0;
  for (const list of lists) {
    values.set(list, offset);
    offset += list.length;
  }
  return {offsets, values};
}

function packIntLists(lists) {
  const offsets = offsetsForLengths(lists.map(list => list.length));
  const values = new Int32Array(offsets.at(-1));
  let offset = 0;
  for (const list of lists) {
    values.set(list.map(Number), offset);
    offset += list.length;
  }
  return {offsets, values};
}

function unpackPointList(values, offsets, index) {
  const result = [];
  for (let point = offsets[index]; point < offsets[index + 1]; point++) result.push([values[point * 2], values[point * 2 + 1]]);
  return result;
}

function offsetsForLengths(lengths) {
  const offsets = new Uint32Array(lengths.length + 1);
  for (let index = 0; index < lengths.length; index++) offsets[index + 1] = offsets[index] + Math.max(0, Number(lengths[index]) || 0);
  return offsets;
}

function parseEdgeKey(value) {
  const match = String(value).match(/^(-?\d+):(-?\d+)$/u);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function compareEdgePair(left, right) {
  return left[0] - right[0] || left[1] - right[1];
}

function normalizeBinding(value = {}) {
  const mapIdentity = value.mapIdentity === null || value.mapIdentity === undefined ? null : String(value.mapIdentity);
  const mapRevision = Number(value.mapRevision);
  const topologyRevision = Number(value.topologyRevision);
  return {
    mapIdentity,
    mapRevision: Number.isSafeInteger(mapRevision) && mapRevision >= 0 ? mapRevision : 0,
    topologyRevision: Number.isSafeInteger(topologyRevision) && topologyRevision >= 0 ? topologyRevision : 0
  };
}

function structuredCloneSafe(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createRenderChunkGate(options = {}) {
  const signal = options.signal || null;
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const requestedChunkUnits = Number(options.chunkUnits);
  const chunkUnits = Number.isFinite(requestedChunkUnits) && requestedChunkUnits > 0
    ? Math.max(1, Math.floor(requestedChunkUnits))
    : Number.POSITIVE_INFINITY;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultRenderYield;
  let units = 0;
  let deadline = renderNow() + budgetMs;
  return {
    async checkpoint(stage, completed, total) {
      assertCurrent();
      units++;
      const current = renderNow();
      const finished = Number(total) > 0 && Number(completed) >= Number(total);
      const chunkBoundary = units >= chunkUnits;
      const report = finished || chunkBoundary || current >= deadline;
      if (report) options.onProgress?.(stage, {completed, total});
      if (chunkBoundary) {
        units = 0;
        await yieldToMain();
        assertCurrent();
        deadline = renderNow() + budgetMs;
        return;
      }
      if (current < deadline) {
        return;
      }
      units = 0;
      await yieldToMain();
      assertCurrent();
      deadline = renderNow() + budgetMs;
    },
    assertCurrent
  };

  function assertCurrent() {
    if (!signal?.aborted && (!isCurrent || isCurrent() === true)) return true;
    const error = new Error(signal?.aborted ? "渲染缓存解包已取消" : "渲染缓存解包结果已过期");
    error.name = signal?.aborted ? "AbortError" : "Error";
    error.code = signal?.aborted ? "render-cache-unpack-aborted" : "render-cache-unpack-obsolete";
    throw error;
  }
}

function defaultRenderYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function renderNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function cacheError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
