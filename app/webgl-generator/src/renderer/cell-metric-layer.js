import {createProgram} from "./gl-utils.js";

const INSTANCE_WORDS = 4;
const BUILD_SLICE_CELLS = 2048;

export function cellMetricInradius(center, vertexIds, vertexPoints) {
  if (!Array.isArray(center) || !Array.isArray(vertexIds) || vertexIds.length < 3) return 0;
  const [x, y] = center;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  let minimum = Infinity;
  let inside = false;
  for (let index = 0; index < vertexIds.length; index++) {
    const a = vertexPoints[vertexIds[index]];
    const b = vertexPoints[vertexIds[(index + 1) % vertexIds.length]];
    if (!a || !b || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return 0;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-12) continue;
    const along = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
    const nearestX = a[0] + along * dx;
    const nearestY = a[1] + along * dy;
    minimum = Math.min(minimum, Math.hypot(x - nearestX, y - nearestY));
    if ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * dx) / dy) inside = !inside;
  }
  return inside && Number.isFinite(minimum) ? minimum * 0.9 : 0;
}

export function createCellMetricDataBuilder(map) {
  const grid = map?.grid;
  const cells = grid?.cells;
  const count = cells?.i?.length || 0;
  const vertices = grid?.vertices?.p || [];
  const population = new Float32Array(count * INSTANCE_WORDS);
  const precipitation = new Float32Array(count * INSTANCE_WORDS);
  let nextCell = 0;
  let populationCount = 0;
  let precipitationCount = 0;
  let maxPopulation = 0;
  let maxPrecipitation = 0;

  return {
    step(limit = BUILD_SLICE_CELLS) {
      const end = Math.min(count, nextCell + Math.max(1, limit));
      for (; nextCell < end; nextCell++) {
        if (!(Number(cells.h?.[nextCell]) >= 20)) continue;
        const center = grid.points?.[cells.p?.[nextCell]];
        const radius = cellMetricInradius(center, cells.v?.[nextCell], vertices);
        if (radius <= 0) continue;
        const pop = Number(cells.pop?.[nextCell]);
        const prec = Number(cells.prec?.[nextCell]);
        if (Number.isFinite(pop) && pop > 0) {
          population.set([center[0], center[1], radius, pop], populationCount * INSTANCE_WORDS);
          populationCount++;
          maxPopulation = Math.max(maxPopulation, pop);
        }
        if (Number.isFinite(prec) && prec > 0) {
          precipitation.set([center[0], center[1], radius, prec], precipitationCount * INSTANCE_WORDS);
          precipitationCount++;
          maxPrecipitation = Math.max(maxPrecipitation, prec);
        }
      }
      return nextCell >= count;
    },
    finish() {
      if (nextCell < count) throw new Error("cell 数值图层尚未构建完成");
      return {
        population: population.subarray(0, populationCount * INSTANCE_WORDS),
        precipitation: precipitation.subarray(0, precipitationCount * INSTANCE_WORDS),
        populationCount,
        precipitationCount,
        maxPopulation,
        maxPrecipitation
      };
    }
  };
}

export function populationColumnHeight(radius, value, maximum) {
  if (!(radius > 0) || !(value > 0) || !(maximum > 0)) return 0;
  return radius * (0.22 + 0.78 * Math.log1p(Math.min(value, maximum)) / Math.log1p(maximum));
}

export function precipitationDotRadius(radius, value, maximum) {
  if (!(radius > 0) || !(value > 0) || !(maximum > 0)) return 0;
  return radius * (0.16 + 0.68 * Math.sqrt(Math.min(1, value / maximum)));
}

export function createCellMetricLayer(gl) {
  const layer = {
    gl,
    map: null,
    token: 0,
    ready: false,
    pending: false,
    waiters: [],
    populationCount: 0,
    precipitationCount: 0,
    maxPopulation: 0,
    maxPrecipitation: 0,
    populationProgram: createProgram(gl, populationVertexSource, populationFragmentSource),
    precipitationProgram: createProgram(gl, precipitationVertexSource, precipitationFragmentSource),
    populationBuffer: gl.createBuffer(),
    precipitationBuffer: gl.createBuffer(),
    populationVao: gl.createVertexArray(),
    precipitationVao: gl.createVertexArray(),
    setMap(map) {
      if (this.map === map) return;
      this.map = map;
      this.invalidate();
    },
    invalidate() {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error("地图图层数据已更新，请重新导出"));
      this.token++;
      this.ready = false;
      this.pending = false;
      this.populationCount = 0;
      this.precipitationCount = 0;
    },
    ensureReady(onReady) {
      if (this.ready || this.pending || !this.map) return;
      const map = this.map;
      const token = this.token;
      const builder = createCellMetricDataBuilder(map);
      this.pending = true;
      const continueBuild = () => {
        if (token !== this.token || map !== this.map) return;
        try {
          if (!builder.step()) {
            setTimeout(continueBuild, 0);
            return;
          }
          const data = builder.finish();
          uploadMetricBuffer(gl, this.populationVao, this.populationBuffer, this.populationProgram, data.population);
          uploadMetricBuffer(gl, this.precipitationVao, this.precipitationBuffer, this.precipitationProgram, data.precipitation);
          this.populationCount = data.populationCount;
          this.precipitationCount = data.precipitationCount;
          this.maxPopulation = data.maxPopulation;
          this.maxPrecipitation = data.maxPrecipitation;
          this.pending = false;
          this.ready = true;
          for (const waiter of this.waiters.splice(0)) waiter.resolve();
          onReady?.();
        } catch (error) {
          this.pending = false;
          for (const waiter of this.waiters.splice(0)) waiter.reject(error);
        }
      };
      setTimeout(continueBuild, 0);
    },
    waitUntilReady() {
      if (this.ready || !this.map) return Promise.resolve();
      return new Promise((resolve, reject) => {
        this.waiters.push({resolve, reject});
        this.ensureReady();
      });
    },
    draw({map, camera, canvas, visibility, onReady}) {
      this.setMap(map);
      const populationVisible = visibility.populationColumns === true;
      const precipitationVisible = visibility.precipitationDots === true;
      if (!populationVisible && !precipitationVisible) return {population: 0, precipitation: 0};
      if (!this.ready) {
        this.ensureReady(onReady);
        return {population: 0, precipitation: 0};
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const mapSize = [map.metadata.graphWidth, map.metadata.graphHeight];
      if (populationVisible && this.populationCount) {
        gl.useProgram(this.populationProgram);
        bindMetricUniforms(gl, this.populationProgram, camera, mapSize, canvas, this.maxPopulation);
        gl.bindVertexArray(this.populationVao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 18, this.populationCount);
      }
      if (precipitationVisible && this.precipitationCount) {
        gl.useProgram(this.precipitationProgram);
        bindMetricUniforms(gl, this.precipitationProgram, camera, mapSize, canvas, this.maxPrecipitation);
        gl.bindVertexArray(this.precipitationVao);
        gl.drawArraysInstanced(gl.POINTS, 0, 1, this.precipitationCount);
      }
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      return {
        population: populationVisible ? this.populationCount : 0,
        precipitation: precipitationVisible ? this.precipitationCount : 0
      };
    },
    destroy() {
      this.invalidate();
      this.map = null;
      gl.deleteVertexArray(this.populationVao);
      gl.deleteVertexArray(this.precipitationVao);
      gl.deleteBuffer(this.populationBuffer);
      gl.deleteBuffer(this.precipitationBuffer);
      gl.deleteProgram(this.populationProgram);
      gl.deleteProgram(this.precipitationProgram);
    }
  };
  return layer;
}

function uploadMetricBuffer(gl, vao, buffer, program, values) {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
  const location = gl.getAttribLocation(program, "a_cell");
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 4, gl.FLOAT, false, INSTANCE_WORDS * Float32Array.BYTES_PER_ELEMENT, 0);
  gl.vertexAttribDivisor(location, 1);
  gl.bindVertexArray(null);
}

function bindMetricUniforms(gl, program, camera, mapSize, canvas, maximum) {
  gl.uniform2f(gl.getUniformLocation(program, "u_mapSize"), ...mapSize);
  gl.uniform2f(gl.getUniformLocation(program, "u_canvasSize"), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(program, "u_scale"), camera.scale);
  gl.uniform2f(gl.getUniformLocation(program, "u_offset"), camera.offsetX, camera.offsetY);
  gl.uniform1f(gl.getUniformLocation(program, "u_maximum"), Math.max(1, maximum));
}

const populationVertexSource = `#version 300 es
precision highp float;
in vec4 a_cell;
uniform vec2 u_mapSize;
uniform vec2 u_canvasSize;
uniform float u_scale;
uniform vec2 u_offset;
uniform float u_maximum;
out float v_face;
out float v_strength;

vec2 corner(int face, int index, float halfWidth, float depth, float lift) {
  if (face == 0) {
    if (index == 0) return vec2(-halfWidth, 0.0);
    if (index == 1) return vec2(0.0, depth);
    if (index == 2) return vec2(0.0, depth - lift);
    return vec2(-halfWidth, -lift);
  }
  if (face == 1) {
    if (index == 0) return vec2(0.0, depth);
    if (index == 1) return vec2(halfWidth, 0.0);
    if (index == 2) return vec2(halfWidth, -lift);
    return vec2(0.0, depth - lift);
  }
  if (index == 0) return vec2(0.0, -depth - lift);
  if (index == 1) return vec2(halfWidth, -lift);
  if (index == 2) return vec2(0.0, depth - lift);
  return vec2(-halfWidth, -lift);
}

void main() {
  float pixelRadius = a_cell.z * u_scale * min(u_canvasSize.x / u_mapSize.x, u_canvasSize.y / u_mapSize.y);
  if (pixelRadius < 1.2) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  v_strength = clamp(log(1.0 + a_cell.w) / log(1.0 + u_maximum), 0.0, 1.0);
  float lift = a_cell.z * (0.22 + 0.78 * v_strength);
  int face = gl_VertexID / 6;
  int vertex = gl_VertexID - face * 6;
  int index = vertex == 0 || vertex == 3 ? 0 : vertex == 1 ? 1 : vertex == 2 || vertex == 4 ? 2 : 3;
  vec2 local = corner(face, index, a_cell.z * 0.34, a_cell.z * 0.18, lift);
  vec2 world = a_cell.xy + local;
  vec2 ndc = vec2(world.x / u_mapSize.x * 2.0 - 1.0, 1.0 - world.y / u_mapSize.y * 2.0);
  gl_Position = vec4(ndc * u_scale + u_offset, 0.0, 1.0);
  v_face = float(face);
}`;

const populationFragmentSource = `#version 300 es
precision highp float;
in float v_face;
in float v_strength;
out vec4 outColor;
void main() {
  vec3 base = mix(vec3(0.61, 0.40, 0.17), vec3(0.86, 0.57, 0.22), v_strength);
  float light = v_face < 0.5 ? 0.64 : v_face < 1.5 ? 0.82 : 1.22;
  outColor = vec4(min(base * light, vec3(1.0)), 0.96);
}`;

const precipitationVertexSource = `#version 300 es
precision highp float;
in vec4 a_cell;
uniform vec2 u_mapSize;
uniform vec2 u_canvasSize;
uniform float u_scale;
uniform vec2 u_offset;
uniform float u_maximum;
out float v_strength;
void main() {
  v_strength = sqrt(clamp(a_cell.w / u_maximum, 0.0, 1.0));
  float radius = a_cell.z * (0.16 + 0.68 * v_strength);
  float pixelRadius = radius * u_scale * min(u_canvasSize.x / u_mapSize.x, u_canvasSize.y / u_mapSize.y);
  if (pixelRadius < 1.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    return;
  }
  vec2 ndc = vec2(a_cell.x / u_mapSize.x * 2.0 - 1.0, 1.0 - a_cell.y / u_mapSize.y * 2.0);
  gl_Position = vec4(ndc * u_scale + u_offset, 0.0, 1.0);
  gl_PointSize = pixelRadius * 2.0;
}`;

const precipitationFragmentSource = `#version 300 es
precision highp float;
in float v_strength;
out vec4 outColor;
void main() {
  vec2 fromCenter = gl_PointCoord - vec2(0.5);
  float distance = length(fromCenter);
  if (distance > 0.5) discard;
  vec3 color = mix(vec3(0.34, 0.64, 0.78), vec3(0.12, 0.45, 0.77), v_strength);
  color *= mix(1.12, 0.68, smoothstep(0.23, 0.5, distance));
  outColor = vec4(color, 0.88 * (1.0 - smoothstep(0.42, 0.5, distance)));
}`;
