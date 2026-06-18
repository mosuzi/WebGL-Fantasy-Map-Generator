import {pickGridCell, pickRoute} from "./picking.js";

export class PlaceholderMapRenderer {
  constructor(canvas, onViewChange = () => {}, onHover = () => {}) {
    this.canvas = canvas;
    this.overlay = canvas.parentElement?.querySelector("#map-overlay") || null;
    this.onViewChange = onViewChange;
    this.onHover = onHover;
    this.gl = canvas.getContext("webgl2", {antialias: true});
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL2");

    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.locations = {
      position: this.gl.getAttribLocation(this.program, "a_position"),
      color: this.gl.getAttribLocation(this.program, "a_color"),
      scale: this.gl.getUniformLocation(this.program, "u_scale"),
      offset: this.gl.getUniformLocation(this.program, "u_offset")
    };
    this.vertexBuffer = this.gl.createBuffer();
    this.routeBuffer = this.gl.createBuffer();
    this.lineBuffer = this.gl.createBuffer();
    this.pointBuffer = this.gl.createBuffer();
    this.vertexCount = 0;
    this.routeVertexCount = 0;
    this.lineVertexCount = 0;
    this.pointVertexCount = 0;
    this.labelCount = 0;
    this.visibleLabelCount = 0;
    this.labelItems = [];
    this.routeBuildMs = 0;
    this.routeWidthMode = "screen-space";
    this.colorMode = "height";
    this.camera = {scale: 1, offsetX: 0, offsetY: 0};
    this.lastDraw = {drawMs: 0};
    installCanvasInteractions(this.canvas, this.camera, () => {
      this.draw();
      this.onViewChange();
    }, event => {
      this.onHover(this.pickClientPoint(event.clientX, event.clientY));
    });
    window.addEventListener("resize", () => this.draw());
  }

  loadMap(map) {
    this.map = map;
    const vertices = buildPlaceholderVertices(map, this.colorMode);
    const lineVertices = buildLineVertices(map);
    const pointVertices = buildPointVertices(map);
    this.vertexCount = vertices.length / 6;
    this.routeVertexCount = 0;
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
    this.buildCityLabels(map);
    this.fitToView();
  }

  fitToView() {
    this.camera.scale = 1;
    this.camera.offsetX = 0;
    this.camera.offsetY = 0;
    this.draw();
    this.onViewChange();
  }

  setColorMode(mode) {
    this.colorMode = mode;
    if (!this.map) return;
    const vertices = buildPlaceholderVertices(this.map, this.colorMode);
    this.vertexCount = vertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.draw();
  }

  draw() {
    if (!this.map || !this.vertexCount) return;
    const startedAt = performance.now();
    resizeCanvasToDisplaySize(this.canvas);
    this.updateRouteBuffer();

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...this.map.layers.background);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeBuffer);
    gl.uniform1f(this.locations.scale, 1);
    gl.uniform2f(this.locations.offset, 0, 0);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.TRIANGLES, 0, this.routeVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.POINTS, 0, this.pointVertexCount);

    this.lastDraw = {
      drawMs: roundMs(performance.now() - startedAt),
      glError: gl.getError()
    };
    this.updateCityLabels();
  }

  getStats() {
    return {
      metadata: this.map?.metadata,
      grid: this.map?.grid?.metadata,
      pack: this.map?.pack?.metadata,
      features: this.map?.features?.metadata,
      vertexCount: this.vertexCount,
      routeVertexCount: this.routeVertexCount,
      routeTriangleCount: this.routeVertexCount / 3,
      routeBuildMs: this.routeBuildMs,
      routeWidthMode: this.routeWidthMode,
      lineVertexCount: this.lineVertexCount,
      pointVertexCount: this.pointVertexCount,
      labelCount: this.labelCount,
      visibleLabelCount: this.visibleLabelCount,
      colorMode: this.colorMode,
      camera: {...this.camera},
      draw: this.lastDraw,
      webgl2: true
    };
  }

  pickClientPoint(clientX, clientY) {
    const world = this.screenToWorld(clientX, clientY);
    const result = pickGridCell(this.map, world.x, world.y);
    const route = pickRoute(this.map, world.x, world.y, this.routePickThresholdWorld());
    return result ? {...result, route, worldX: roundValue(result.worldX), worldY: roundValue(result.worldY)} : null;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const mapX = (((ndcX - this.camera.offsetX) / this.camera.scale + 1) / 2) * this.map.metadata.graphWidth;
    const mapY = ((1 - (ndcY - this.camera.offsetY) / this.camera.scale) / 2) * this.map.metadata.graphHeight;
    return {x: mapX, y: mapY};
  }

  updateRouteBuffer() {
    const startedAt = performance.now();
    const routeVertices = buildRouteMeshVertices(this.map, this.camera, this.canvas);
    this.routeVertexCount = routeVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, routeVertices, this.gl.DYNAMIC_DRAW);
    this.routeBuildMs = roundMs(performance.now() - startedAt);
  }

  routePickThresholdWorld() {
    const rect = this.canvas.getBoundingClientRect();
    const worldPerPixelX = this.map.metadata.graphWidth / Math.max(1, rect.width * this.camera.scale);
    const worldPerPixelY = this.map.metadata.graphHeight / Math.max(1, rect.height * this.camera.scale);
    return Math.max(worldPerPixelX, worldPerPixelY) * 7;
  }

  buildCityLabels(map) {
    if (!this.overlay) {
      this.labelItems = [];
      this.labelCount = 0;
      this.visibleLabelCount = 0;
      return;
    }
    this.overlay.replaceChildren();
    this.labelItems = getLabelCities(map).map(item => {
      const node = document.createElement("span");
      const city = item.city;
      node.className = `city-label${city.capital ? " capital" : ""}${city.port ? " port" : ""}`;
      node.textContent = city.name;
      this.overlay.append(node);
      return {...item, node};
    });
    this.labelCount = this.labelItems.length;
    this.visibleLabelCount = 0;
  }

  updateCityLabels() {
    if (!this.overlay || !this.map || !this.labelItems.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const occupied = [];
    let visible = 0;
    const scale = this.camera.scale;
    const maxVisible = labelLimitForScale(scale);
    const padding = labelPaddingForScale(scale);

    for (const item of this.labelItems) {
      const screen = this.worldToScreen(item.city.x, item.city.y, rect);
      const box = labelBoxForItem(item, screen);
      const onScreen = box.right > 8 && box.bottom > 8 && box.left < rect.width - 8 && box.top < rect.height - 8;
      const blocked = occupied.some(other => boxesOverlap(box, other, padding));
      const shouldShow = visible < maxVisible && scale >= item.minScale && onScreen && !blocked;
      item.node.style.display = shouldShow ? "block" : "none";
      if (!shouldShow) continue;
      item.node.style.left = `${screen.x}px`;
      item.node.style.top = `${screen.y - 6}px`;
      occupied.push(box);
      visible++;
    }

    this.visibleLabelCount = visible;
  }

  worldToScreen(x, y, rect) {
    const ndcX = ((x / this.map.metadata.graphWidth) * 2 - 1) * this.camera.scale + this.camera.offsetX;
    const ndcY = (1 - (y / this.map.metadata.graphHeight) * 2) * this.camera.scale + this.camera.offsetY;
    return {
      x: ((ndcX + 1) / 2) * rect.width,
      y: ((1 - ndcY) / 2) * rect.height
    };
  }
}

function getLabelCities(map) {
  return [...map.settlements.cities]
    .map(city => ({city, priority: scoreCityLabel(city)}))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 48)
    .map((item, rank) => ({
      ...item,
      rank,
      minScale: minLabelScale(item.city, rank)
    }));
}

function installCanvasInteractions(canvas, camera, onChange, onHover) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", event => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!dragging) {
      onHover(event);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    camera.offsetX += (dx / rect.width) * 2;
    camera.offsetY -= (dy / rect.height) * 2;
    onChange();
    onHover(event);
  });

  canvas.addEventListener("pointerup", event => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const cursorY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      const previousScale = camera.scale;
      const nextScale = Math.max(0.5, Math.min(12, previousScale * Math.exp(-event.deltaY * 0.001)));
      const worldX = (cursorX - camera.offsetX) / previousScale;
      const worldY = (cursorY - camera.offsetY) / previousScale;
      camera.scale = nextScale;
      camera.offsetX = cursorX - worldX * nextScale;
      camera.offsetY = cursorY - worldY * nextScale;
      onChange();
    },
    {passive: false}
  );
}

function buildPlaceholderVertices(map, colorMode) {
  const vertices = [];

  pushGridCells(vertices, map, colorMode);

  return new Float32Array(vertices);
}

function buildLineVertices(map) {
  const vertices = [];
  for (const segment of map.features.shore.coastline) pushWorldLine(vertices, segment, map, [0.9, 0.86, 0.68, 1]);
  for (const segment of map.features.shore.lakeShore) pushWorldLine(vertices, segment, map, [0.64, 0.82, 0.92, 1]);
  for (const river of map.rivers.rivers) {
    for (let index = 0; index < river.points.length - 1; index++) {
      pushWorldLine(vertices, [river.points[index], river.points[index + 1]], map, [0.22, 0.48, 0.82, 1]);
    }
  }
  return new Float32Array(vertices);
}

function buildRouteMeshVertices(map, camera, canvas) {
  const vertices = [];
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  for (const route of map.settlements.routes) {
    const color = route.type === "road" ? [0.62, 0.45, 0.24, 1] : [0.45, 0.35, 0.22, 0.94];
    const widthPx = (route.type === "road" ? 3.2 : 2.1) * pixelRatio;
    pushScreenPolyline(vertices, route.points, map, camera, canvas, color, widthPx);
  }
  return new Float32Array(vertices);
}

function buildPointVertices(map) {
  const vertices = [];
  for (const point of map.settlements.populationPoints) {
    const alpha = Math.min(0.8, 0.25 + point.population / Math.max(1, map.settlements.metadata.maxPopulation));
    pushWorldVertex(vertices, point.point, map, [0.25, 0.42, 0.24, alpha]);
  }
  for (const city of map.settlements.cities) {
    const color = city.capital ? [0.98, 0.82, 0.32, 1] : city.port ? [0.35, 0.72, 0.95, 1] : [0.92, 0.72, 0.38, 1];
    pushWorldVertex(vertices, [city.x, city.y], map, color);
  }
  return new Float32Array(vertices);
}

function pushRect(vertices, left, bottom, right, top, color) {
  pushVertex(vertices, left, bottom, color);
  pushVertex(vertices, right, bottom, color);
  pushVertex(vertices, right, top, color);
  pushVertex(vertices, left, bottom, color);
  pushVertex(vertices, right, top, color);
  pushVertex(vertices, left, top, color);
}

function pushGridCells(vertices, map, colorMode) {
  const grid = map.grid;
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
    const vertexIds = grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const center = grid.points[grid.cells.p[cellIndex]];
    const color = colorForCell(cellIndex, map, colorMode);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushWorldVertex(vertices, center, map, color);
      pushWorldVertex(vertices, grid.vertices.p[vertexIds[index]], map, color);
      pushWorldVertex(vertices, grid.vertices.p[vertexIds[nextIndex]], map, color);
    }
  }
}

function pushWorldLine(vertices, segment, map, color) {
  pushWorldVertex(vertices, segment[0], map, color);
  pushWorldVertex(vertices, segment[1], map, color);
}

function pushScreenPolyline(vertices, points, map, camera, canvas, color, widthPx) {
  const screenPoints = points
    .map(point => worldToScreenPixel(point, map, camera, canvas))
    .filter((point, index, list) => index === 0 || Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) > 0.5);
  if (screenPoints.length < 2) return;

  const half = widthPx / 2;
  const left = [];
  const right = [];

  for (let index = 0; index < screenPoints.length; index++) {
    const previous = screenPoints[Math.max(0, index - 1)];
    const current = screenPoints[index];
    const next = screenPoints[Math.min(screenPoints.length - 1, index + 1)];
    const before = normalizeScreenVector(current.x - previous.x, current.y - previous.y);
    const after = normalizeScreenVector(next.x - current.x, next.y - current.y);
    const blended = normalizeScreenVector(before.x + after.x, before.y + after.y);
    const tangent = index === 0 ? after : index === screenPoints.length - 1 ? before : (blended.x || blended.y ? blended : after);
    const normalBefore = normalForVector(before.x || after.x, before.y || after.y);
    const normalAfter = normalForVector(after.x || before.x, after.y || before.y);
    const miter = normalForVector(tangent.x, tangent.y);
    const dot = Math.max(0.3, Math.abs(miter.x * normalAfter.x + miter.y * normalAfter.y));
    const length = Math.min(half / dot, half * 2.6);
    const capShift = index === 0 ? -half : index === screenPoints.length - 1 ? half : 0;
    const capBase = {
      x: current.x + tangent.x * capShift,
      y: current.y + tangent.y * capShift
    };
    const normal = index === 0 ? normalAfter : index === screenPoints.length - 1 ? normalBefore : miter;
    left.push({x: capBase.x + normal.x * length, y: capBase.y + normal.y * length});
    right.push({x: capBase.x - normal.x * length, y: capBase.y - normal.y * length});
  }

  for (let index = 0; index < left.length - 1; index++) {
    pushScreenTriangle(vertices, left[index], left[index + 1], right[index + 1], canvas, color);
    pushScreenTriangle(vertices, left[index], right[index + 1], right[index], canvas, color);
  }
}

function pushScreenTriangle(vertices, a, b, c, canvas, color) {
  pushScreenVertex(vertices, a, canvas, color);
  pushScreenVertex(vertices, b, canvas, color);
  pushScreenVertex(vertices, c, canvas, color);
}

function pushScreenVertex(vertices, point, canvas, color) {
  const clip = screenPixelToClip(point, canvas);
  pushVertex(vertices, clip[0], clip[1], color);
}

function worldToScreenPixel(point, map, camera, canvas) {
  const [x, y] = worldToNdcPoint(point, map);
  const clipX = x * camera.scale + camera.offsetX;
  const clipY = y * camera.scale + camera.offsetY;
  return {
    x: ((clipX + 1) / 2) * canvas.width,
    y: ((1 - clipY) / 2) * canvas.height
  };
}

function screenPixelToClip(point, canvas) {
  return [(point.x / canvas.width) * 2 - 1, 1 - (point.y / canvas.height) * 2];
}

function normalizeScreenVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.000001) return {x: 0, y: 0};
  return {x: x / length, y: y / length};
}

function normalForVector(x, y) {
  const vector = normalizeScreenVector(x, y);
  return {x: -vector.y, y: vector.x};
}

function pushVertex(vertices, x, y, color) {
  vertices.push(x, y, color[0], color[1], color[2], color[3]);
}

function pushWorldVertex(vertices, point, map, color) {
  const [x, y] = worldToNdcPoint(point, map);
  pushVertex(vertices, x, y, color);
}

function worldToNdcPoint(point, map) {
  const x = (point[0] / map.metadata.graphWidth) * 2 - 1;
  const y = 1 - (point[1] / map.metadata.graphHeight) * 2;
  return [x, y];
}

function colorForCell(cellIndex, map, colorMode) {
  if (colorMode === "temperature") return colorForTemperature(map.grid.cells.temp[cellIndex]);
  if (colorMode === "precipitation") return colorForPrecipitation(map.grid.cells.prec[cellIndex]);
  if (colorMode === "biomes") return colorForBiome(map.grid.cells.biome[cellIndex], map);
  if (colorMode === "cultures") return indexedColor(map.grid.cells.culture[cellIndex], 0.31);
  if (colorMode === "religions") return indexedColor(map.grid.cells.religion[cellIndex], 0.63);
  if (colorMode === "states") return indexedColorOrWater(map.grid.cells.state[cellIndex], 0.12, map.layers.ocean);
  if (colorMode === "provinces") return indexedColorOrWater(map.grid.cells.province[cellIndex], 0.46, map.layers.ocean);
  if (colorMode === "regions") return indexedColorOrWater(map.grid.cells.region[cellIndex], 0.77, map.layers.ocean);
  if (colorMode === "population") return colorForPopulation(map.grid.cells.pop[cellIndex], map);
  return colorForHeight(map.grid.cells.h[cellIndex], map.layers);
}

function colorForHeight(height, layers) {
  if (height < 20) return layers.ocean;
  if (height < 36) return mix([0.33, 0.52, 0.32, 1], [0.52, 0.61, 0.38, 1], (height - 20) / 16);
  if (height < 56) return mix([0.52, 0.61, 0.38, 1], [0.64, 0.6, 0.43, 1], (height - 36) / 20);
  if (height < 76) return mix([0.64, 0.6, 0.43, 1], [0.7, 0.66, 0.54, 1], (height - 56) / 20);
  if (height < 92) return mix([0.7, 0.66, 0.54, 1], [0.77, 0.75, 0.68, 1], (height - 76) / 16);
  return mix([0.77, 0.75, 0.68, 1], [0.83, 0.82, 0.78, 1], Math.min(1, (height - 92) / 8));
}

function colorForTemperature(temp) {
  const t = Math.max(0, Math.min(1, (temp + 18) / 54));
  return mix([0.2, 0.38, 0.72, 1], [0.82, 0.32, 0.2, 1], t);
}

function colorForPrecipitation(prec) {
  const t = Math.max(0, Math.min(1, prec / 100));
  return mix([0.72, 0.62, 0.36, 1], [0.16, 0.48, 0.68, 1], t);
}

function colorForBiome(biomeId, map) {
  return map.climate.biomes[biomeId]?.color || [0.5, 0.5, 0.5, 1];
}

function colorForPopulation(population, map) {
  if (!population) return mix(map.layers.ocean, [0.06, 0.1, 0.08, 1], 0.4);
  const t = Math.min(1, population / Math.max(1, map.settlements.metadata.maxPopulation));
  return mix([0.2, 0.36, 0.24, 1], [0.92, 0.72, 0.34, 1], Math.sqrt(t));
}

function indexedColor(index, offset) {
  const hue = (index * 0.61803398875 + offset) % 1;
  return hslToRgb(hue, 0.42, 0.56);
}

function indexedColorOrWater(index, offset, waterColor) {
  if (index < 0) return mix(waterColor, [0.05, 0.08, 0.1, 1], 0.3);
  return indexedColor(index, offset);
}

function scoreCityLabel(city) {
  return (city.capital ? 320 : 0) + (city.provincial ? 150 : 0) + (city.port ? 28 : 0) + city.population;
}

function minLabelScale(city, rank) {
  if (city.capital) return 0.45;
  if (city.provincial || rank < 12) return 0.75;
  if (rank < 26 || city.population >= 72) return 1.15;
  return 1.85;
}

function labelLimitForScale(scale) {
  if (scale < 0.75) return 8;
  if (scale < 1.35) return 16;
  if (scale < 2.4) return 28;
  return 42;
}

function labelPaddingForScale(scale) {
  if (scale < 0.85) return 14;
  if (scale < 1.6) return 9;
  return 5;
}

function labelBoxForItem(item, screen) {
  const estimatedWidth = Math.max(34, Math.min(132, 14 + item.city.name.length * 13));
  const estimatedHeight = item.city.capital ? 21 : 18;
  return {
    left: screen.x - estimatedWidth / 2,
    right: screen.x + estimatedWidth / 2,
    top: screen.y - estimatedHeight - 8,
    bottom: screen.y + 2
  };
}

function boxesOverlap(a, b, padding) {
  return a.left - padding < b.right && a.right + padding > b.left && a.top - padding < b.bottom && a.bottom + padding > b.top;
}

function hslToRgb(h, s, l) {
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3), 1];
}

function bindVertexBuffer(gl, locations) {
  const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.color);
  gl.vertexAttribPointer(locations.color, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    1
  ];
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
  }
  return shader;
}

function resizeCanvasToDisplaySize(canvas) {
  const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
  const height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function roundValue(value) {
  return Math.round(value * 10) / 10;
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec4 a_color;
uniform float u_scale;
uniform vec2 u_offset;
out vec4 v_color;

void main() {
  v_color = a_color;
  gl_PointSize = 4.0;
  gl_Position = vec4(a_position * u_scale + u_offset, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}`;
