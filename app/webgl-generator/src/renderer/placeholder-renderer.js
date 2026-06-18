import {pickGridCell} from "./picking.js";

export class PlaceholderMapRenderer {
  constructor(canvas, onViewChange = () => {}, onHover = () => {}) {
    this.canvas = canvas;
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
    this.lineBuffer = this.gl.createBuffer();
    this.pointBuffer = this.gl.createBuffer();
    this.vertexCount = 0;
    this.lineVertexCount = 0;
    this.pointVertexCount = 0;
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
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
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
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.POINTS, 0, this.pointVertexCount);

    this.lastDraw = {
      drawMs: roundMs(performance.now() - startedAt),
      glError: gl.getError()
    };
  }

  getStats() {
    return {
      metadata: this.map?.metadata,
      grid: this.map?.grid?.metadata,
      pack: this.map?.pack?.metadata,
      features: this.map?.features?.metadata,
      vertexCount: this.vertexCount,
      lineVertexCount: this.lineVertexCount,
      pointVertexCount: this.pointVertexCount,
      colorMode: this.colorMode,
      camera: {...this.camera},
      draw: this.lastDraw,
      webgl2: true
    };
  }

  pickClientPoint(clientX, clientY) {
    const world = this.screenToWorld(clientX, clientY);
    const result = pickGridCell(this.map, world.x, world.y);
    return result ? {...result, worldX: roundValue(result.worldX), worldY: roundValue(result.worldY)} : null;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const mapX = (((ndcX - this.camera.offsetX) / this.camera.scale + 1) / 2) * this.map.metadata.graphWidth;
    const mapY = ((1 - (ndcY - this.camera.offsetY) / this.camera.scale) / 2) * this.map.metadata.graphHeight;
    return {x: mapX, y: mapY};
  }
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
  for (const route of map.settlements.routes) {
    const color = route.type === "road" ? [0.56, 0.43, 0.24, 1] : [0.44, 0.36, 0.24, 0.95];
    for (let index = 0; index < route.points.length - 1; index++) {
      pushWorldLine(vertices, [route.points[index], route.points[index + 1]], map, color);
    }
  }
  for (const river of map.rivers.rivers) {
    for (let index = 0; index < river.points.length - 1; index++) {
      pushWorldLine(vertices, [river.points[index], river.points[index + 1]], map, [0.22, 0.48, 0.82, 1]);
    }
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

function pushVertex(vertices, x, y, color) {
  vertices.push(x, y, color[0], color[1], color[2], color[3]);
}

function pushWorldVertex(vertices, point, map, color) {
  const x = (point[0] / map.metadata.graphWidth) * 2 - 1;
  const y = 1 - (point[1] / map.metadata.graphHeight) * 2;
  pushVertex(vertices, x, y, color);
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
