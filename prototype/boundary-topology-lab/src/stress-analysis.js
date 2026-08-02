const EPSILON = 1e-8;

export function analyzeFloat32DrawPacketPhaseMatrix({
  sourceRings,
  baseRings = sourceRings,
  renderRings,
  packet,
  basePacket = null,
  landInside = true,
  dprs = [1, 1.5, 2],
  zooms = [0.75, 1.5, 3],
  projection = {x: 1.37, y: 0.83},
  offsets = [[0.125, 0.125], [0.375, 0.625], [0.625, 0.375], [0.875, 0.875]],
  bounds = null,
  focusSegments = null,
  focusPixelRadius = 1.5,
  focusSide = null
}) {
  const matrix = [];
  for (const dpr of dprs) {
    for (const zoom of zooms) {
      for (const offset of offsets) {
        matrix.push(rasterDrawPacketPhase({
          sourceRings,
          baseRings,
          renderRings,
          packet,
          basePacket,
          landInside,
          dpr,
          zoom,
          projection,
          offset,
          bounds,
          focusSegments,
          focusPixelRadius,
          focusSide
        }));
      }
    }
  }
  return {
    phaseCount: matrix.length,
    dprs: [...dprs],
    zooms: [...zooms],
    projection: {...projection},
    offsetCount: offsets.length,
    wrongSidePixels: matrix.reduce((sum, item) => sum + item.wrongSidePixels, 0),
    longestNeedlePixels: Math.max(0, ...matrix.map(item => item.longestNeedlePixels)),
    conflictingPixels: matrix.reduce((sum, item) => sum + item.conflictingPixels, 0),
    duplicatePixels: matrix.reduce((sum, item) => sum + item.duplicatePixels, 0),
    seamPixels: matrix.reduce((sum, item) => sum + item.seamPixels, 0),
    worstPhase: [...matrix].sort((a, b) =>
      b.wrongSidePixels - a.wrongSidePixels
      || b.longestNeedlePixels - a.longestNeedlePixels
      || b.conflictingPixels - a.conflictingPixels
      || b.seamPixels - a.seamPixels
    )[0] || null,
    matrix
  };
}

export function rasterDrawPacketPhase({
  sourceRings,
  baseRings = sourceRings,
  renderRings,
  packet,
  basePacket = null,
  landInside,
  dpr,
  zoom,
  projection,
  offset,
  bounds = null,
  focusSegments = null,
  focusPixelRadius = 1.5,
  focusSide = null
}) {
  const points = [...sourceRings.flat(), ...baseRings.flat(), ...renderRings.flat()];
  const scaleX = dpr * zoom * projection.x;
  const scaleY = dpr * zoom * projection.y;
  const minX = bounds?.minX ?? Math.min(...points.map(point => point[0])) - 1;
  const minY = bounds?.minY ?? Math.min(...points.map(point => point[1])) - 1;
  const maxX = bounds?.maxX ?? Math.max(...points.map(point => point[0])) + 1;
  const maxY = bounds?.maxY ?? Math.max(...points.map(point => point[1])) + 1;
  const width = Math.max(1, Math.ceil((maxX - minX) * scaleX + 2));
  const height = Math.max(1, Math.ceil((maxY - minY) * scaleY + 2));
  const prepareCommand = command => {
    const positions = new Float32Array([
      (command.positions[0] - minX) * scaleX + offset[0],
      (command.positions[1] - minY) * scaleY + offset[1],
      (command.positions[2] - minX) * scaleX + offset[0],
      (command.positions[3] - minY) * scaleY + offset[1],
      (command.positions[4] - minX) * scaleX + offset[0],
      (command.positions[5] - minY) * scaleY + offset[1]
    ]);
    return {
      command,
      positions,
      minX: Math.min(positions[0], positions[2], positions[4]),
      maxX: Math.max(positions[0], positions[2], positions[4]),
      minY: Math.min(positions[1], positions[3], positions[5]),
      maxY: Math.max(positions[1], positions[3], positions[5])
    };
  };
  const baseCommands = basePacket?.commands?.length
    ? basePacket.commands.map(prepareCommand)
    : triangulateStressRegion(baseRings).map(points => prepareCommand({
      kind: "base-surface",
      side: landInside ? "land" : "water",
      positions: new Float32Array(points.flat())
    }));
  const commands = (packet.commands || []).map(prepareCommand);
  const orderedCommands = [
    ...commands.filter(item => item.command.kind === "correction" && item.command.side === "land"),
    ...commands.filter(item => item.command.kind === "correction" && item.command.side === "water"),
    ...commands.filter(item => item.command.kind === "boundary-cover" && item.command.side === "land"),
    ...commands.filter(item => item.command.kind === "boundary-cover" && item.command.side === "water"),
    ...commands.filter(item => item.command.kind !== "correction" && item.command.kind !== "boundary-cover")
  ];
  const wrongMask = new Uint8Array(width * height);
  const ownerMask = new Int32Array(width * height);
  ownerMask.fill(-1);
  const idealOwnerMask = new Int32Array(width * height);
  idealOwnerMask.fill(-1);
  const sideMask = new Uint8Array(width * height);
  let wrongSidePixels = 0;
  let conflictingPixels = 0;
  let duplicatePixels = 0;
  let seamPixels = 0;
  const wrongLocations = [];
  const seamLocations = [];
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const point = [
        minX + (px + 0.5 - offset[0]) / scaleX,
        minY + (py + 0.5 - offset[1]) / scaleY
      ];
      let inFocus = true;
      if (focusSegments?.length) {
        const focusDistance = Math.min(...focusSegments.map(segment => pointToPolylineDistance(point, segment)));
        const focusRadiusWorld = focusPixelRadius * Math.hypot(0.5 / scaleX, 0.5 / scaleY);
        inFocus = focusDistance <= focusRadiusWorld;
      }
      const devicePoint = [px + 0.5, py + 0.5];
      let land = basePacket?.outsideSide === "land" ? true : !landInside;
      let ownerCell = -1;
      let baseHitCount = 0;
      for (const prepared of baseCommands) {
        if (devicePoint[0] < prepared.minX || devicePoint[0] > prepared.maxX
          || devicePoint[1] < prepared.minY || devicePoint[1] > prepared.maxY) continue;
        if (pointInDeviceTriangleTopLeft(devicePoint, prepared.positions)) {
          baseHitCount++;
          land = prepared.command.side === "land";
          ownerCell = commandOwnerCell(prepared.command);
        }
      }
      let idealOwnerCell = ownerCell;
      let idealLand = land;
      let idealPatched = false;
      for (const prepared of orderedCommands) {
        if (prepared.command.kind !== "correction" && prepared.command.kind !== "boundary-cover") continue;
        if (devicePoint[0] < prepared.minX || devicePoint[0] > prepared.maxX
          || devicePoint[1] < prepared.minY || devicePoint[1] > prepared.maxY) continue;
        if (pointInDeviceTriangleClosed(devicePoint, prepared.positions)) {
          const commandLand = prepared.command.side === "land";
          if (idealPatched || commandLand === idealLand) continue;
          idealLand = commandLand;
          idealOwnerCell = commandOwnerCell(prepared.command);
          idealPatched = true;
        }
      }
      const hits = [];
      let patched = false;
      for (const prepared of orderedCommands) {
        if (devicePoint[0] < prepared.minX || devicePoint[0] > prepared.maxX
          || devicePoint[1] < prepared.minY || devicePoint[1] > prepared.maxY) continue;
        if (pointInDeviceTriangleTopLeft(devicePoint, prepared.positions)) {
          const commandLand = prepared.command.side === "land";
          const conditionalSurface = prepared.command.kind === "correction"
            || prepared.command.kind === "boundary-cover";
          if (conditionalSurface && (patched || commandLand === land)) continue;
          hits.push(prepared.command);
          land = commandLand;
          ownerCell = commandOwnerCell(prepared.command);
          if (conditionalSurface) patched = true;
        }
      }
      const pixelIndex = py * width + px;
      ownerMask[pixelIndex] = ownerCell;
      idealOwnerMask[pixelIndex] = idealOwnerCell;
      sideMask[pixelIndex] = land ? 1 : 2;
      if (!inFocus) continue;
      const expectedLand = pointInRegion(point, renderRings) === landInside;
      if (focusSide && (expectedLand ? "land" : "water") !== focusSide) continue;
      const wrong = land !== expectedLand;
      if (wrong) {
        wrongMask[pixelIndex] = 1;
        wrongSidePixels++;
        if (wrongLocations.length < 24) wrongLocations.push({point, pixel: [px, py]});
      }
      if (new Set(hits.map(command => command.side)).size > 1) conflictingPixels++;
      if (baseHitCount > 1 || hits.filter(command => command.kind === "correction").length > 1) duplicatePixels++;
      if (wrong) {
        const boundaryDistance = Math.min(
          ...[...sourceRings, ...renderRings].map(ring => pointToPolylineDistance(point, ring))
        );
        const pixelRadiusWorld = Math.hypot(0.5 / scaleX, 0.5 / scaleY);
        if (boundaryDistance <= pixelRadiusWorld) {
          seamPixels++;
          if (seamLocations.length < 24) seamLocations.push({point, pixel: [px, py]});
        }
      }
    }
  }
  return {
    dpr,
    zoom,
    projection: {...projection},
    offset: [...offset],
    width,
    height,
    wrongSidePixels,
    longestNeedlePixels: longestMaskRun(wrongMask, width, height),
    conflictingPixels,
    duplicatePixels,
    seamPixels,
    wrongLocations,
    seamLocations,
    baseTriangleCount: baseCommands.length,
    wrongMask,
    ownerMask,
    idealOwnerMask,
    sideMask
  };
}

function commandOwnerCell(command) {
  if (Number.isInteger(command.ownerCell)) return command.ownerCell;
  const semanticCell = command.side === "land" ? command.landCell : command.waterCell;
  return Number.isInteger(semanticCell) ? semanticCell : -1;
}

function pointInDeviceTriangleClosed(point, positions) {
  if (!positions || positions.length !== 6) return false;
  let a = [positions[0], positions[1]];
  let b = [positions[2], positions[3]];
  let c = [positions[4], positions[5]];
  if (cross(a, b, c) < 0) [b, c] = [c, b];
  return cross(a, b, point) >= -0.0000001
    && cross(b, c, point) >= -0.0000001
    && cross(c, a, point) >= -0.0000001;
}

export function analyzeMultiRingXorStress({
  sourceRings,
  baseRings = sourceRings,
  renderRings,
  correctionTriangles,
  packet,
  probes = []
}) {
  const phase = analyzeFloat32DrawPacketPhaseMatrix({sourceRings, baseRings, renderRings, packet});
  const probeResults = probes.map(probe => ({
    ...probe,
    sourceLand: pointInRegion(probe.point, sourceRings),
    renderLand: pointInRegion(probe.point, renderRings)
  }));
  return {
    correctionTriangleCount: correctionTriangles.length,
    correctionArea: correctionTriangles.reduce((sum, triangle) => sum + triangle.area, 0),
    wrongSidePixels: phase.wrongSidePixels,
    conflictingPixels: phase.conflictingPixels,
    duplicatePixels: phase.duplicatePixels,
    seamPixels: phase.seamPixels,
    longestNeedlePixels: phase.longestNeedlePixels,
    worstPhase: phase.worstPhase,
    matrix: phase.matrix,
    probeResults,
    holePreserved: probeResults.filter(probe => probe.kind === "hole").every(probe => !probe.renderLand),
    channelPreserved: probeResults.filter(probe => probe.kind === "channel").every(probe => !probe.renderLand),
    landConnected: rasterRegionConnected(renderRings)
  };
}

export function analyzeFallbackSpliceStress(model) {
  const stitched = [...model.smoothSegment, ...model.rawFallbackSegment.slice(1)];
  const sharedEndpointDistance = distance(model.smoothSegment.at(-1), model.rawFallbackSegment[0]);
  let zeroLengthSegments = 0;
  let backtrackSegments = 0;
  for (let index = 1; index < stitched.length; index++) {
    if (distance(stitched[index - 1], stitched[index]) <= EPSILON) zeroLengthSegments++;
    if (index < stitched.length - 1) {
      const incoming = vector(stitched[index - 1], stitched[index]);
      const outgoing = vector(stitched[index], stitched[index + 1]);
      if (dot(incoming, outgoing) < -EPSILON) backtrackSegments++;
    }
  }
  const canonicalCellsPreserved = arraysEqual(model.sourceLandCells, model.stitchedLandCells)
    && arraysEqual(model.sourceWaterCells, model.stitchedWaterCells);
  const townProtected = model.protected.towns.every(town => pointToPolylineDistance(town, stitched) <= model.protectedDistance);
  const roadProtected = model.protected.roads.every(road => polylinesIntersect(road, stitched));
  const mouthProtected = model.protected.rivers.every(river => pointToPolylineDistance(river.at(-1), stitched) <= EPSILON);
  return {
    stitched,
    sharedEndpointDistance,
    zeroLengthSegments,
    backtrackSegments,
    canonicalCellsPreserved,
    townProtected,
    roadProtected,
    mouthProtected,
    passed: sharedEndpointDistance <= EPSILON
      && zeroLengthSegments === 0
      && backtrackSegments === 0
      && canonicalCellsPreserved
      && townProtected
      && roadProtected
      && mouthProtected
  };
}

export function buildFloat32PacketFromCorrectionTriangles(correctionTriangles, coverTriangles = []) {
  const commands = correctionTriangles.map(triangle => ({
    kind: "correction",
    side: triangle.side,
    positions: new Float32Array(triangle.points.flat())
  }));
  for (const triangle of coverTriangles) {
    commands.push({
      kind: "boundary-cover",
      side: triangle.side,
      positions: new Float32Array(triangle.points.flat())
    });
  }
  return {
    coordinateType: "float32-world",
    drawOrder: ["correction", "boundary-cover"],
    commands
  };
}

export function buildStressPacketWithBoundaryCovers(correctionTriangles, boundaryRings, targetRings, width = 0.18) {
  const covers = new Map();
  for (const triangle of correctionTriangles) {
    for (const edge of [
      [triangle.points[0], triangle.points[1]],
      [triangle.points[1], triangle.points[2]],
      [triangle.points[2], triangle.points[0]]
    ]) {
      if (!boundaryRings.some(ring => segmentLiesOnRing(edge, ring))) continue;
      const key = `${edge.map(point => point.map(value => value.toFixed(7)).join(":")).sort().join(">")}|${triangle.side}`;
      if (!covers.has(key)) covers.set(key, {
        edge,
        side: triangle.side,
        insidePoint: triangleCentroid(triangle.points)
      });
    }
  }
  const coverTriangles = [];
  for (const cover of covers.values()) {
    const [start, end] = cover.edge;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) continue;
    let nx = -dy / length;
    let ny = dx / length;
    const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const desiredLand = cover.side === "land";
    const positive = [middle[0] + nx * width * 0.75, middle[1] + ny * width * 0.75];
    const negative = [middle[0] - nx * width * 0.75, middle[1] - ny * width * 0.75];
    const positiveMatches = pointInRegion(positive, targetRings) === desiredLand;
    const negativeMatches = pointInRegion(negative, targetRings) === desiredLand;
    if (positiveMatches && negativeMatches) {
      if ((cover.insidePoint[0] - middle[0]) * nx + (cover.insidePoint[1] - middle[1]) * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
    } else if (!positiveMatches && negativeMatches) {
      nx = -nx;
      ny = -ny;
    }
    const tangent = [dx / length, dy / length];
    for (const candidateWidth of [width, width * 0.5, width * 0.25]) {
      const cap = Math.min(candidateWidth * 0.2, length * 0.05);
      const cappedStart = stressCoverPointMatchesTarget(start, nx, ny, candidateWidth, targetRings, desiredLand)
        ? start
        : [start[0] + tangent[0] * cap, start[1] + tangent[1] * cap];
      const cappedEnd = stressCoverPointMatchesTarget(end, nx, ny, candidateWidth, targetRings, desiredLand)
        ? end
        : [end[0] - tangent[0] * cap, end[1] - tangent[1] * cap];
      if (!stressCoverMatchesTarget(cappedStart, cappedEnd, nx, ny, candidateWidth, targetRings, desiredLand)) continue;
      const outerStart = [cappedStart[0] + nx * candidateWidth, cappedStart[1] + ny * candidateWidth];
      const outerEnd = [cappedEnd[0] + nx * candidateWidth, cappedEnd[1] + ny * candidateWidth];
      coverTriangles.push(
        {points: [cappedStart, cappedEnd, outerEnd], side: cover.side},
        {points: [cappedStart, outerEnd, outerStart], side: cover.side}
      );
      break;
    }
  }
  coverTriangles.push(...buildStressVertexCoverTriangles([...covers.values()], targetRings, width));
  return buildFloat32PacketFromCorrectionTriangles(correctionTriangles, coverTriangles);
}

export function analyzeEarcutSafeFailureStress(model) {
  const triangulate = globalThis.earcut?.default;
  if (typeof triangulate !== "function") throw new Error("earcut-stress-runtime-unavailable");
  const cleaned = cleanStressBoundary(model.duplicateMicroBoundary);
  const cleanedIndices = triangulate(cleaned.flat(), null, 2);
  const concaveIndices = triangulate(model.concaveBoundary.flat(), null, 2);
  const legacyLeakCount = countStressFanLeaks(model.concaveLegacyCenter, model.concaveBoundary);
  const irreparableSelfIntersections = countStressSelfIntersections(model.irreparableBoundary);
  const hardFallbackIndices = triangulate(model.hardBoundary.flat(), null, 2);
  const hardFallbackLeaks = countStressTriangulationLeaks(model.hardBoundary, hardFallbackIndices);
  const hardFallbackFilled = hardFallbackIndices.length >= 3 && hardFallbackLeaks === 0;
  return {
    sourcePointCount: model.duplicateMicroBoundary.length,
    cleanedPointCount: cleaned.length,
    retryTriangulated: cleanedIndices.length >= 3,
    concaveTriangleCount: concaveIndices.length / 3,
    concaveLeakCount: countStressTriangulationLeaks(model.concaveBoundary, concaveIndices),
    irreparableSelfIntersections,
    safeSkipReason: irreparableSelfIntersections ? "self-intersecting-boundary" : null,
    safeFallback: hardFallbackFilled ? "hard-boundary-earcut" : null,
    hardFallbackTriangleCount: hardFallbackIndices.length / 3,
    hardFallbackLeaks,
    unfilledCells: hardFallbackFilled ? 0 : 1,
    legacyLeakCount,
    cleanedBoundary: cleaned,
    concaveIndices,
    passed: cleaned.length < model.duplicateMicroBoundary.length
      && cleanedIndices.length >= 3
      && concaveIndices.length >= 3
      && countStressTriangulationLeaks(model.concaveBoundary, concaveIndices) === 0
      && irreparableSelfIntersections > 0
      && hardFallbackFilled
      && legacyLeakCount > 0
  };
}

export function mutateDrawPacket(packet, kind) {
  const clone = {
    ...packet,
    drawOrder: [...(packet.drawOrder || [])],
    commands: (packet.commands || []).map(command => ({
      ...command,
      positions: new Float32Array(command.positions)
    }))
  };
  if (kind === "delete-cover") clone.commands = clone.commands.filter(command => command.kind !== "boundary-cover");
  if (kind === "wrong-direction") {
    for (const command of clone.commands) command.side = command.side === "land" ? "water" : "land";
  }
  if (kind === "wrong-order") clone.commands.reverse();
  if (kind === "endpoint-quantization") {
    for (const command of clone.commands) {
      for (let index = 0; index < command.positions.length; index++) {
        command.positions[index] = Math.round(command.positions[index] * 2) / 2;
      }
    }
  }
  return clone;
}

export function pointInRegion(point, rings) {
  if (!rings?.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some(ring => pointInRing(point, ring));
}

function triangulateStressRegion(rings) {
  const triangulate = globalThis.earcut?.default;
  if (typeof triangulate !== "function" || !rings?.length) throw new Error("base-surface-runtime-unavailable");
  const vertices = [];
  const holes = [];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    if (ringIndex) holes.push(vertices.length / 2);
    const limit = ring.length > 1 && distance(ring[0], ring.at(-1)) <= EPSILON ? ring.length - 1 : ring.length;
    for (let index = 0; index < limit; index++) vertices.push(ring[index][0], ring[index][1]);
  }
  const indices = triangulate(vertices, holes, 2);
  const triangles = [];
  for (let index = 0; index < indices.length; index += 3) {
    triangles.push([indices[index], indices[index + 1], indices[index + 2]]
      .map(vertex => [vertices[vertex * 2], vertices[vertex * 2 + 1]]));
  }
  return triangles;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function stressCoverMatchesTarget(start, end, nx, ny, width, targetRings, desiredLand) {
  for (const along of [0.08, 0.25, 0.5, 0.75, 0.92]) {
    const edgePoint = [
      start[0] + (end[0] - start[0]) * along,
      start[1] + (end[1] - start[1]) * along
    ];
    for (const outward of [0.2, 0.5, 0.8]) {
      const sample = [edgePoint[0] + nx * width * outward, edgePoint[1] + ny * width * outward];
      if (pointInRegion(sample, targetRings) !== desiredLand) return false;
    }
  }
  return true;
}

function stressCoverPointMatchesTarget(point, nx, ny, width, targetRings, desiredLand) {
  for (const outward of [0.2, 0.5, 0.8]) {
    const sample = [point[0] + nx * width * outward, point[1] + ny * width * outward];
    if (pointInRegion(sample, targetRings) !== desiredLand) return false;
  }
  return true;
}

function buildStressVertexCoverTriangles(covers, targetRings, width) {
  const groups = new Map();
  for (const cover of covers) {
    for (const [vertex, other] of [[cover.edge[0], cover.edge[1]], [cover.edge[1], cover.edge[0]]]) {
      const key = `${vertex[0].toFixed(7)}:${vertex[1].toFixed(7)}|${cover.side}`;
      const length = distance(vertex, other);
      if (length <= EPSILON) continue;
      const entries = groups.get(key) || [];
      entries.push({
        vertex,
        cover,
        direction: [(other[0] - vertex[0]) / length, (other[1] - vertex[1]) / length]
      });
      groups.set(key, entries);
    }
  }
  const triangles = [];
  for (const entries of groups.values()) {
    let best = null;
    for (let first = 0; first < entries.length; first++) {
      for (let second = first + 1; second < entries.length; second++) {
        const turn = Math.abs(cross([0, 0], entries[first].direction, entries[second].direction));
        if (!best || turn > best.turn) best = {first: entries[first], second: entries[second], turn};
      }
    }
    if (!best || best.turn <= EPSILON) continue;
    const vertex = best.first.vertex;
    const points = [
      vertex,
      [vertex[0] + best.first.direction[0] * width, vertex[1] + best.first.direction[1] * width],
      [vertex[0] + best.second.direction[0] * width, vertex[1] + best.second.direction[1] * width]
    ];
    if (pointInRegion(triangleCentroid(points), targetRings) !== (best.first.cover.side === "land")) continue;
    triangles.push({points, side: best.first.cover.side});
  }
  return triangles;
}

function segmentLiesOnRing(edge, ring) {
  const middle = [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2];
  return [edge[0], middle, edge[1]].every(point => pointToPolylineDistance(point, ring) <= 0.000001);
}

function triangleCentroid(points) {
  return [
    (points[0][0] + points[1][0] + points[2][0]) / 3,
    (points[0][1] + points[1][1] + points[2][1]) / 3
  ];
}

function cleanStressBoundary(points) {
  const result = [];
  for (const point of points) {
    if (!result.length || distance(result.at(-1), point) > 0.0000001) result.push([...point]);
  }
  if (result.length > 1 && distance(result[0], result.at(-1)) <= 0.0000001) result.pop();
  return result;
}

function countStressFanLeaks(center, points) {
  let leaks = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    const centroid = [
      (center[0] + points[index][0] + next[0]) / 3,
      (center[1] + points[index][1] + next[1]) / 3
    ];
    if (!pointInRing(centroid, points)) leaks++;
  }
  return leaks;
}

function countStressTriangulationLeaks(points, indices) {
  let leaks = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [points[indices[index]], points[indices[index + 1]], points[indices[index + 2]]];
    if (!pointInRing(triangleCentroid(triangle), points)) leaks++;
  }
  return leaks;
}

function countStressSelfIntersections(points) {
  let count = 0;
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      const a = cross(points[first], points[firstNext], points[second]);
      const b = cross(points[first], points[firstNext], points[secondNext]);
      const c = cross(points[second], points[secondNext], points[first]);
      const d = cross(points[second], points[secondNext], points[firstNext]);
      if (a * b < -EPSILON && c * d < -EPSILON) count++;
    }
  }
  return count;
}

function pointInDeviceTriangleTopLeft(point, positions) {
  if (!positions || positions.length !== 6) return false;
  let a = [positions[0], positions[1]];
  let b = [positions[2], positions[3]];
  let c = [positions[4], positions[5]];
  if (cross(a, b, c) < 0) [b, c] = [c, b];
  return deviceEdgeOwned(a, b, point)
    && deviceEdgeOwned(b, c, point)
    && deviceEdgeOwned(c, a, point);
}

function deviceEdgeOwned(a, b, point) {
  const value = cross(a, b, point);
  if (value > 0.0000001) return true;
  if (value < -0.0000001) return false;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return dy > 0 || (Math.abs(dy) <= 0.0000001 && dx < 0);
}

function longestMaskRun(mask, width, height) {
  let longest = 0;
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      run = mask[y * width + x] ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  for (let x = 0; x < width; x++) {
    let run = 0;
    for (let y = 0; y < height; y++) {
      run = mask[y * width + x] ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

function rasterRegionConnected(rings) {
  const outer = rings?.[0] || [];
  if (!outer.length) return false;
  const minX = Math.floor(Math.min(...outer.map(point => point[0])));
  const maxX = Math.ceil(Math.max(...outer.map(point => point[0])));
  const minY = Math.floor(Math.min(...outer.map(point => point[1])));
  const maxY = Math.ceil(Math.max(...outer.map(point => point[1])));
  const points = [];
  const land = new Set();
  for (let y = minY; y <= maxY; y += 0.5) {
    for (let x = minX; x <= maxX; x += 0.5) {
      if (!pointInRegion([x, y], rings)) continue;
      const key = `${Math.round((x - minX) * 2)}:${Math.round((y - minY) * 2)}`;
      land.add(key);
      points.push(key);
    }
  }
  if (!points.length) return false;
  const visited = new Set([points[0]]);
  const queue = [points[0]];
  while (queue.length) {
    const [x, y] = queue.shift().split(":").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx}:${y + dy}`;
      if (land.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push(key);
      }
    }
  }
  return visited.size === land.size;
}

function arraysEqual(a, b) {
  return a?.length === b?.length && a.every((value, index) => value === b[index]);
}

function vector(a, b) {
  return [b[0] - a[0], b[1] - a[1]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointToPolylineDistance(point, line) {
  let minimum = Infinity;
  for (let index = 0; index < line.length - 1; index++) {
    minimum = Math.min(minimum, pointSegmentDistance(point, line[index], line[index + 1]));
  }
  return minimum;
}

function pointSegmentDistance(point, a, b) {
  const ab = vector(a, b);
  const lengthSquared = dot(ab, ab);
  if (lengthSquared <= EPSILON) return distance(point, a);
  const t = Math.max(0, Math.min(1, dot(vector(a, point), ab) / lengthSquared));
  return distance(point, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
}

function polylinesIntersect(first, second) {
  for (let a = 0; a < first.length - 1; a++) {
    for (let b = 0; b < second.length - 1; b++) {
      const abC = cross(first[a], first[a + 1], second[b]);
      const abD = cross(first[a], first[a + 1], second[b + 1]);
      const cdA = cross(second[b], second[b + 1], first[a]);
      const cdB = cross(second[b], second[b + 1], first[a + 1]);
      if (abC * abD <= EPSILON && cdA * cdB <= EPSILON) return true;
    }
  }
  return false;
}
