const SMOOTH_FACTOR = 0.18;
const ICON_SIDES = 8;

export const SCENE_LAYER_ORDER = Object.freeze([
  "lakes", "lakeIslands", "routes", "rivers", "coastline", "lakeShore",
  "stateBorders", "provinceBorders", "burgIcons", "markers"
]);

export function buildComplexScene(snapshot, buffers) {
  const lines = buffers.lineBuffers.layers;
  const points = buffers.pointBuffers.layers;
  const layers = {
    lakes: mesh(buffers.lakePositions, buffers.lakeColors),
    lakeIslands: mesh(buffers.lakeIslandPositions, buffers.lakeIslandColors),
    routes: mesh(lines.routes.positions, lines.routes.colors),
    rivers: mesh(lines.rivers.positions, lines.rivers.colors),
    coastline: lineVariants(buffers.coastlinePositions, buffers.coastlineColors, 0.5),
    lakeShore: lineVariants(buffers.lakeShorePositions, buffers.lakeShoreColors, 0.42),
    stateBorders: lineVariants(lines.stateBorders.positions, lines.stateBorders.colors, 0.52),
    provinceBorders: lineVariants(lines.provinceBorders.positions, lines.provinceBorders.colors, 0.34, {dash: 2, gap: 2}),
    burgIcons: pointMesh(points.burgIcons, 0.95),
    markers: pointMesh(points.markers, 1.1)
  };
  const labels = {
    states: (snapshot.labels?.states || []).filter(item => item?.name && Number.isFinite(item.x) && Number.isFinite(item.y)).map(item => ({name: item.name, x: item.x, y: item.y})),
    burgs: (snapshot.labels?.burgs || [])
      .filter(item => item?.name && Number.isFinite(item.x) && Number.isFinite(item.y))
      .sort((a, b) => Number(Boolean(b.capital)) - Number(Boolean(a.capital)) || Number(b.population || 0) - Number(a.population || 0))
      .slice(0, 128)
      .map(item => ({name: item.name, x: item.x, y: item.y, capital: Boolean(item.capital)}))
  };
  const counts = Object.fromEntries(SCENE_LAYER_ORDER.map(id => [id, {
    hardVertices: layers[id].hard?.vertexCount ?? layers[id].vertexCount,
    smoothVertices: layers[id].smooth?.vertexCount ?? layers[id].vertexCount
  }]));
  return {layers, labels, counts, rawStateBorders: lines.stateBorders.positions, rawStateBorderSegments: lines.stateBorders.positions.length / 4};
}

function mesh(positions, colors) {
  return {positions, colors, vertexCount: positions.length / 2};
}

function lineVariants(rawPositions, rawColors, width, dash = null) {
  const paths = stitchSegments(rawPositions);
  const color = [rawColors[0] ?? 0.5, rawColors[1] ?? 0.5, rawColors[2] ?? 0.5];
  return {
    hard: strokePaths(paths, width, color, dash),
    smooth: strokePaths(paths.map(path => smoothPath(path)), width, color, dash),
    pathCount: paths.length,
    sourceSegments: rawPositions.length / 4
  };
}

function stitchSegments(raw) {
  const edges = [];
  const nodes = new Map();
  const key = (x, y) => `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
  const node = (x, y) => {
    const id = key(x, y);
    if (!nodes.has(id)) nodes.set(id, {point: [x, y], edges: []});
    return id;
  };
  for (let index = 0; index + 3 < raw.length; index += 4) {
    const a = node(raw[index], raw[index + 1]);
    const b = node(raw[index + 2], raw[index + 3]);
    if (a === b) continue;
    const edge = edges.length;
    edges.push({a, b});
    nodes.get(a).edges.push(edge);
    nodes.get(b).edges.push(edge);
  }
  const visited = new Uint8Array(edges.length);
  const paths = [];
  const walk = (start, first) => {
    const path = [nodes.get(start).point];
    let current = start;
    let edgeId = first;
    while (edgeId !== undefined && !visited[edgeId]) {
      visited[edgeId] = 1;
      const edge = edges[edgeId];
      current = edge.a === current ? edge.b : edge.a;
      const next = nodes.get(current);
      path.push(next.point);
      if (next.edges.length !== 2 || current === start) break;
      edgeId = next.edges.find(candidate => !visited[candidate]);
    }
    if (path.length > 1) paths.push(path);
  };
  for (const [id, entry] of nodes) {
    if (entry.edges.length === 2) continue;
    for (const edge of entry.edges) if (!visited[edge]) walk(id, edge);
  }
  for (let index = 0; index < edges.length; index++) if (!visited[index]) walk(edges[index].a, index);
  return paths;
}

function smoothPath(points) {
  if (points.length < 3) return points;
  const closed = points[0] === points.at(-1);
  const source = closed ? points.slice(0, -1) : points;
  if (source.length < 3) return points;
  const result = closed ? [] : [source[0]];
  const segments = closed ? source.length : source.length - 1;
  for (let index = 0; index < segments; index++) {
    const a = source[index], b = source[(index + 1) % source.length];
    result.push(interpolate(a, b, SMOOTH_FACTOR), interpolate(a, b, 1 - SMOOTH_FACTOR));
  }
  if (closed) result.push(result[0]);
  else result.push(source.at(-1));
  return result;
}

function interpolate(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function strokePaths(paths, width, color, dash) {
  const positions = [];
  const colors = [];
  for (const points of paths) {
    let distance = 0;
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index], b = points[index + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-6) continue;
      if (!dash) pushStrokeSegment(positions, colors, a, b, width, color);
      else {
        let traveled = 0;
        const period = dash.dash + dash.gap;
        while (traveled < length - 1e-6) {
          const phase = (distance + traveled) % period;
          const step = Math.min(length - traveled, (phase < dash.dash ? dash.dash : period) - phase);
          if (phase < dash.dash && step > 1e-6) {
            pushStrokeSegment(positions, colors, interpolate(a, b, traveled / length), interpolate(a, b, (traveled + step) / length), width, color);
          }
          traveled += Math.max(step, 1e-6);
        }
      }
      distance += length;
    }
  }
  return mesh(new Float32Array(positions), new Float32Array(colors));
}

function pushStrokeSegment(positions, colors, a, b, width, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const nx = -dy / length * width / 2, ny = dx / length * width / 2;
  const quad = [
    a[0] + nx, a[1] + ny, a[0] - nx, a[1] - ny, b[0] - nx, b[1] - ny,
    a[0] + nx, a[1] + ny, b[0] - nx, b[1] - ny, b[0] + nx, b[1] + ny
  ];
  positions.push(...quad);
  for (let index = 0; index < 6; index++) colors.push(...color);
}

function pointMesh(layer, scale) {
  const positions = [];
  const colors = [];
  for (let index = 0; index < layer.instanceCount; index++) {
    const x = layer.positions[index * 2], y = layer.positions[index * 2 + 1];
    const radius = Math.max(1.8, layer.sizes[index] * scale);
    const color = Array.from(layer.colors.subarray(index * 3, index * 3 + 3));
    for (let side = 0; side < ICON_SIDES; side++) {
      const first = side * Math.PI * 2 / ICON_SIDES;
      const second = (side + 1) * Math.PI * 2 / ICON_SIDES;
      positions.push(x, y, x + Math.cos(first) * radius, y + Math.sin(first) * radius, x + Math.cos(second) * radius, y + Math.sin(second) * radius);
      colors.push(...color, ...color, ...color);
    }
  }
  return mesh(new Float32Array(positions), new Float32Array(colors));
}
