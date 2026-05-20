export class CellWebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {antialias: true});
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL2");

    this.mode = "height";
    this.camera = {scale: 1, x: 0, y: 0};
    this.buffers = null;
    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.locations = getLocations(this.gl, this.program);
  }

  setData(snapshot) {
    this.snapshot = snapshot;
    this.buffers = buildCellBuffers(snapshot);
    uploadBuffers(this.gl, this.buffers);
    this.fitToView();
  }

  setMode(mode) {
    this.mode = mode;
    this.draw();
  }

  fitToView() {
    const {graphWidth, graphHeight} = this.snapshot.metadata;
    const scale = Math.min(this.canvas.width / graphWidth, this.canvas.height / graphHeight) * 0.94;
    this.camera.scale = scale;
    this.camera.x = (this.canvas.width - graphWidth * scale) / 2;
    this.camera.y = (this.canvas.height - graphHeight * scale) / 2;
    this.draw();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.fitToView();
    } else {
      this.draw();
    }
  }

  pan(deltaX, deltaY) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.camera.x += deltaX * pixelRatio;
    this.camera.y += deltaY * pixelRatio;
    this.draw();
  }

  zoomAt(clientX, clientY, factor) {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const x = (clientX - rect.left) * pixelRatio;
    const y = (clientY - rect.top) * pixelRatio;
    const worldX = (x - this.camera.x) / this.camera.scale;
    const worldY = (y - this.camera.y) / this.camera.scale;

    this.camera.scale = clamp(this.camera.scale * factor, 0.15, 32);
    this.camera.x = x - worldX * this.camera.scale;
    this.camera.y = y - worldY * this.camera.scale;
    this.draw();
  }

  draw() {
    if (!this.buffers) return;

    const gl = this.gl;
    const errorBefore = gl.getError();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.055, 0.067, 0.086, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.translate, this.camera.x, this.camera.y);
    gl.uniform1i(this.locations.mode, this.mode === "height" ? 0 : 1);

    bindAttribute(gl, this.locations.position, this.buffers.positionBuffer, 2);
    bindAttribute(gl, this.locations.heightColor, this.buffers.heightColorBuffer, 3);
    bindAttribute(gl, this.locations.stateColor, this.buffers.stateColorBuffer, 3);

    gl.drawArrays(gl.TRIANGLES, 0, this.buffers.vertexCount);
    this.lastDraw = {
      camera: {...this.camera},
      canvas: {width: this.canvas.width, height: this.canvas.height},
      mode: this.mode,
      vertexCount: this.buffers.vertexCount,
      errorBefore,
      errorAfter: gl.getError()
    };
  }
}

export function installCanvasInteractions(renderer) {
  const canvas = renderer.canvas;
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
    if (!dragging) return;
    renderer.pan(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  });

  canvas.addEventListener("pointerup", event => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.001);
      renderer.zoomAt(event.clientX, event.clientY, factor);
    },
    {passive: false}
  );
}

function buildCellBuffers(snapshot) {
  const positions = [];
  const heightColors = [];
  const stateColors = [];
  const {cells, vertices, states} = snapshot;

  for (let index = 0; index < cells.i.length; index++) {
    const center = cells.p[index];
    const vertexIds = cells.v[index];
    if (!center || !vertexIds || vertexIds.length < 3) continue;

    const heightColor = getHeightColor(cells.h[index] || 0);
    const stateColor = getStateColor(cells.h[index] || 0, cells.state[index] || 0, states);

    for (let vertexIndex = 0; vertexIndex < vertexIds.length; vertexIndex++) {
      const a = vertices.p[vertexIds[vertexIndex]];
      const b = vertices.p[vertexIds[(vertexIndex + 1) % vertexIds.length]];
      if (!a || !b) continue;

      pushTriangle(positions, center, a, b);
      pushColorTriangle(heightColors, heightColor);
      pushColorTriangle(stateColors, stateColor);
    }
  }

  return {
    positions: new Float32Array(positions),
    heightColors: new Float32Array(heightColors),
    stateColors: new Float32Array(stateColors),
    vertexCount: positions.length / 2,
    samplePosition: positions.slice(0, 12),
    sampleHeightColor: heightColors.slice(0, 9),
    sampleStateColor: stateColors.slice(0, 9)
  };
}

function uploadBuffers(gl, buffers) {
  buffers.positionBuffer = createBuffer(gl, buffers.positions);
  buffers.heightColorBuffer = createBuffer(gl, buffers.heightColors);
  buffers.stateColorBuffer = createBuffer(gl, buffers.stateColors);
}

function pushTriangle(target, a, b, c) {
  target.push(a[0], a[1], b[0], b[1], c[0], c[1]);
}

function pushColorTriangle(target, color) {
  for (let index = 0; index < 3; index++) target.push(color[0], color[1], color[2]);
}

function getHeightColor(height) {
  if (height < 20) return mixColor([25, 78, 124], [70, 145, 190], height / 20);
  if (height < 35) return mixColor([88, 151, 83], [155, 184, 96], (height - 20) / 15);
  if (height < 65) return mixColor([174, 162, 100], [143, 117, 82], (height - 35) / 30);
  return mixColor([126, 118, 112], [230, 230, 222], (height - 65) / 35);
}

function getStateColor(height, stateId, states) {
  if (height < 20) return [0.1, 0.31, 0.5];
  const state = states[stateId];
  if (!state || state.removed) return [0.45, 0.5, 0.43];
  return parseHexColor(state.color);
}

function mixColor(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return a.map((value, index) => (value + (b[index] - value) * t) / 255);
}

function parseHexColor(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color || "");
  if (!match) return [0.55, 0.55, 0.55];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function bindAttribute(gl, location, buffer, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
  }
  return shader;
}

function getLocations(gl, program) {
  return {
    position: gl.getAttribLocation(program, "a_position"),
    heightColor: gl.getAttribLocation(program, "a_heightColor"),
    stateColor: gl.getAttribLocation(program, "a_stateColor"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    scale: gl.getUniformLocation(program, "u_scale"),
    translate: gl.getUniformLocation(program, "u_translate"),
    mode: gl.getUniformLocation(program, "u_mode")
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec3 a_heightColor;
in vec3 a_stateColor;

uniform vec2 u_resolution;
uniform float u_scale;
uniform vec2 u_translate;
uniform int u_mode;

out vec3 v_color;

void main() {
  vec2 screen = a_position * u_scale + u_translate;
  vec2 clip = vec2((screen.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y / u_resolution.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = u_mode == 0 ? a_heightColor : a_stateColor;
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 v_color;
out vec4 outColor;

void main() {
  outColor = vec4(v_color, 1.0);
}`;
