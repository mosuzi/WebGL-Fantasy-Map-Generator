import {SCENE_LAYER_ORDER} from "./webgpu-scene.js";

const CLEAR = [0.075, 0.192, 0.298, 1];
const HAZE_STRENGTH = 0.25;
const BASE_LAYERS = new Set(["lakes", "lakeIslands"]);

export function createWebGlCells(canvas, geometry) {
  const gl = canvas.getContext("webgl2", {antialias: false, alpha: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error("当前浏览器不支持 WebGL2");
  const rendererExtension = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = rendererExtension ? gl.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const started = performance.now();
  const program = createGlProgram(gl, glVertex, glFragment);
  const hazeProgram = createGlProgram(gl, glFullscreenVertex, glHazeFragment);
  const surfaceUploadStart = performance.now();
  const surface = createGlMesh(gl, {positions: geometry.positions, colors: geometry.themeColors, vertexCount: geometry.vertexCount}, gl.DYNAMIC_DRAW);
  const surfaceUploadMs = performance.now() - surfaceUploadStart;
  const sceneUploadStart = performance.now();
  const layers = createLayerMeshes(geometry.scene.layers, mesh => createGlMesh(gl, mesh, gl.STATIC_DRAW));
  const sceneUploadMs = performance.now() - sceneUploadStart;
  const hazeTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, hazeTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const locations = {
    position: gl.getAttribLocation(program, "a_position"),
    color: gl.getAttribLocation(program, "a_color"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    scale: gl.getUniformLocation(program, "u_scale"),
    translate: gl.getUniformLocation(program, "u_translate"),
    hazeTexture: gl.getUniformLocation(hazeProgram, "u_texture"),
    hazeStrength: gl.getUniformLocation(hazeProgram, "u_strength")
  };

  function drawMesh(mesh) {
    if (!mesh?.vertexCount) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
    gl.enableVertexAttribArray(locations.color);
    gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
  }

  function useMapProgram(camera) {
    gl.useProgram(program);
    gl.uniform2f(locations.resolution, canvas.width, canvas.height);
    gl.uniform1f(locations.scale, camera.scale);
    gl.uniform2f(locations.translate, camera.x, camera.y);
  }

  return {
    name: "WebGL2",
    renderer,
    uploadMs: performance.now() - started,
    surfaceUploadMs,
    sceneUploadMs,
    updateColors(colors) {
      gl.bindBuffer(gl.ARRAY_BUFFER, surface.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    },
    drawBase(camera, options) {
      const begin = performance.now();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(...CLEAR);
      gl.clear(gl.COLOR_BUFFER_BIT);
      useMapProgram(camera);
      drawMesh(surface);
      if (options.scene === "complex") for (const id of BASE_LAYERS) drawMesh(layers[id]);
      return performance.now() - begin;
    },
    drawRest(camera, options, hazeCanvas) {
      const begin = performance.now();
      if (hazeCanvas) {
        gl.useProgram(hazeProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, hazeTexture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hazeCanvas);
        gl.uniform1i(locations.hazeTexture, 0);
        gl.uniform1f(locations.hazeStrength, HAZE_STRENGTH);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      if (options.scene === "complex") {
        useMapProgram(camera);
        for (const id of SCENE_LAYER_ORDER) {
          if (BASE_LAYERS.has(id)) continue;
          drawMesh(selectedLayer(layers[id], options.smoothing));
        }
      }
      return performance.now() - begin;
    },
    finish() {
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!fence) return Promise.reject(new Error("WebGL2 无法建立绘制完成栅栏"));
      gl.flush();
      return new Promise((resolve, reject) => {
        const poll = () => {
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.TIMEOUT_EXPIRED) { setTimeout(poll, 0); return; }
          gl.deleteSync(fence);
          if (status === gl.WAIT_FAILED) reject(new Error("WebGL2 绘制完成等待失败"));
          else resolve();
        };
        poll();
      });
    },
    error: () => gl.getError(),
    dispose() {
      destroyLayerMeshes(layers, mesh => destroyGlMesh(gl, mesh));
      destroyGlMesh(gl, surface);
      gl.deleteTexture(hazeTexture);
      gl.deleteProgram(program);
      gl.deleteProgram(hazeProgram);
    }
  };
}

export async function createWebGpuCells(canvas, geometry, onDeviceLost) {
  if (!navigator.gpu || !window.isSecureContext) return {reason: "此浏览器或当前地址未开放 WebGPU；请使用支持 WebGPU 的浏览器，并通过 HTTPS 或 localhost 打开。"};
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return {reason: "浏览器未找到可用的 WebGPU 适配器。"};
  const adapterInfo = Object.fromEntries(["vendor", "architecture", "device", "description"].map(key => [key, adapter.info?.[key] || ""]));
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) return {reason: "浏览器未能创建 WebGPU 画布。"};
  const format = navigator.gpu.getPreferredCanvasFormat();
  const configure = () => context.configure({device, format, alphaMode: "opaque"});
  configure();
  const started = performance.now();
  const hazeSourceCanvas = document.createElement("canvas");
  const hazeSourceContext = hazeSourceCanvas.getContext("2d");
  if (!hazeSourceContext) throw new Error("当前浏览器无法读取 WebGPU 晕染源");
  const surfaceUploadStart = performance.now();
  const surface = createGpuMesh(device, {positions: geometry.positions, colors: geometry.themeColors, vertexCount: geometry.vertexCount}, GPUBufferUsage.COPY_DST);
  const surfaceUploadMs = performance.now() - surfaceUploadStart;
  const sceneUploadStart = performance.now();
  const layers = createLayerMeshes(geometry.scene.layers, mesh => createGpuMesh(device, mesh));
  const sceneUploadMs = performance.now() - sceneUploadStart;
  const uniformBuffer = device.createBuffer({size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
  const shader = device.createShaderModule({code: wgslMap});
  const hazeShader = device.createShaderModule({code: wgslHaze});
  const presentShader = device.createShaderModule({code: wgslPresent});
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {module: shader, entryPoint: "vertexMain", buffers: [
      {arrayStride: 8, attributes: [{shaderLocation: 0, offset: 0, format: "float32x2"}]},
      {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]}
    ]},
    fragment: {module: shader, entryPoint: "fragmentMain", targets: [{format}]},
    primitive: {topology: "triangle-list"}
  });
  const hazePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {module: hazeShader, entryPoint: "vertexMain"},
    fragment: {module: hazeShader, entryPoint: "fragmentMain", targets: [{format, blend: {
      color: {srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add"},
      alpha: {srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add"}
    }}]},
    primitive: {topology: "triangle-list"}
  });
  const presentPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {module: presentShader, entryPoint: "vertexMain"},
    fragment: {module: presentShader, entryPoint: "fragmentMain", targets: [{format}]},
    primitive: {topology: "triangle-list"}
  });
  const bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: uniformBuffer}}]});
  const hazeSampler = device.createSampler({magFilter: "linear", minFilter: "linear"});
  let sceneTexture = null;
  let sceneBindGroup = null;
  let sceneWidth = 0, sceneHeight = 0;
  let readbackBuffer = null;
  let readbackBytesPerRow = 0;
  let hazeImage = null;
  let hazeTexture = null;
  let hazeBindGroup = null;
  let hazeWidth = 0, hazeHeight = 0;
  let lost = false, disposed = false;
  device.lost.then(info => {
    lost = true;
    if (!disposed) onDeviceLost?.(`WebGPU 设备已断开：${info.message || info.reason || "未知原因"}`);
  });

  function drawMesh(pass, mesh) {
    if (!mesh?.vertexCount) return;
    pass.setVertexBuffer(0, mesh.positionBuffer);
    pass.setVertexBuffer(1, mesh.colorBuffer);
    pass.draw(mesh.vertexCount);
  }

  function ensureHazeTexture(source) {
    if (hazeTexture && hazeWidth === source.width && hazeHeight === source.height) return;
    hazeTexture?.destroy();
    hazeWidth = source.width;
    hazeHeight = source.height;
    hazeTexture = device.createTexture({size: [hazeWidth, hazeHeight], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT});
    hazeBindGroup = device.createBindGroup({layout: hazePipeline.getBindGroupLayout(0), entries: [
      {binding: 0, resource: hazeTexture.createView()},
      {binding: 1, resource: hazeSampler}
    ]});
  }

  function ensureSceneTexture() {
    if (sceneTexture && sceneWidth === canvas.width && sceneHeight === canvas.height) return;
    sceneTexture?.destroy();
    readbackBuffer?.destroy();
    sceneWidth = canvas.width;
    sceneHeight = canvas.height;
    sceneTexture = device.createTexture({size: [sceneWidth, sceneHeight], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC});
    readbackBytesPerRow = Math.ceil(sceneWidth * 4 / 256) * 256;
    readbackBuffer = device.createBuffer({size: readbackBytesPerRow * sceneHeight, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
    hazeSourceCanvas.width = sceneWidth;
    hazeSourceCanvas.height = sceneHeight;
    hazeImage = hazeSourceContext.createImageData(sceneWidth, sceneHeight);
    sceneBindGroup = device.createBindGroup({layout: presentPipeline.getBindGroupLayout(0), entries: [
      {binding: 0, resource: sceneTexture.createView()}
    ]});
  }

  function present(encoder) {
    const pass = encoder.beginRenderPass({colorAttachments: [{view: context.getCurrentTexture().createView(), clearValue: {r: CLEAR[0], g: CLEAR[1], b: CLEAR[2], a: 1}, loadOp: "clear", storeOp: "store"}]});
    pass.setPipeline(presentPipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.draw(3);
    pass.end();
  }

  return {
    name: "WebGPU",
    device,
    adapterInfo,
    hazeSourceCanvas,
    uploadMs: performance.now() - started,
    surfaceUploadMs,
    sceneUploadMs,
    isLost: () => lost,
    resize: configure,
    updateColors(colors) { if (!lost) device.queue.writeBuffer(surface.colorBuffer, 0, colors); },
    drawBase(camera, options) {
      if (lost) return NaN;
      const begin = performance.now();
      ensureSceneTexture();
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
        canvas.width, canvas.height, camera.scale, 0, camera.x, camera.y, 0, 0
      ]));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({colorAttachments: [{view: sceneTexture.createView(), clearValue: {r: CLEAR[0], g: CLEAR[1], b: CLEAR[2], a: 1}, loadOp: "clear", storeOp: "store"}]});
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      drawMesh(pass, surface);
      if (options.scene === "complex") for (const id of BASE_LAYERS) drawMesh(pass, layers[id]);
      pass.end();
      if (options.haze) encoder.copyTextureToBuffer({texture: sceneTexture}, {buffer: readbackBuffer, bytesPerRow: readbackBytesPerRow, rowsPerImage: sceneHeight}, [sceneWidth, sceneHeight]);
      present(encoder);
      device.queue.submit([encoder.finish()]);
      return performance.now() - begin;
    },
    drawRest(camera, options, hazeCanvas) {
      if (lost) return NaN;
      const begin = performance.now();
      if (hazeCanvas) {
        ensureHazeTexture(hazeCanvas);
        device.queue.copyExternalImageToTexture({source: hazeCanvas}, {texture: hazeTexture}, [hazeWidth, hazeHeight]);
      }
      if (options.scene === "complex") {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({colorAttachments: [{view: sceneTexture.createView(), loadOp: "load", storeOp: "store"}]});
        if (hazeCanvas) {
          pass.setPipeline(hazePipeline);
          pass.setBindGroup(0, hazeBindGroup);
          pass.draw(3);
        }
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        for (const id of SCENE_LAYER_ORDER) {
          if (BASE_LAYERS.has(id)) continue;
          drawMesh(pass, selectedLayer(layers[id], options.smoothing));
        }
        pass.end();
        present(encoder);
        device.queue.submit([encoder.finish()]);
      }
      return performance.now() - begin;
    },
    finish: () => device.queue.onSubmittedWorkDone(),
    async syncHazeSource() {
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      try {
        const source = new Uint8Array(readbackBuffer.getMappedRange());
        const target = hazeImage.data;
        if (format.startsWith("bgra")) {
          for (let y = 0; y < sceneHeight; y++) {
            const row = y * readbackBytesPerRow;
            const output = y * sceneWidth * 4;
            for (let x = 0; x < sceneWidth; x++) {
              const from = row + x * 4, to = output + x * 4;
              target[to] = source[from + 2];
              target[to + 1] = source[from + 1];
              target[to + 2] = source[from];
              target[to + 3] = source[from + 3];
            }
          }
        } else {
          for (let y = 0; y < sceneHeight; y++) target.set(source.subarray(y * readbackBytesPerRow, y * readbackBytesPerRow + sceneWidth * 4), y * sceneWidth * 4);
        }
        hazeSourceContext.putImageData(hazeImage, 0, 0);
      } finally {
        readbackBuffer.unmap();
      }
    },
    async errors() {
      const messages = await Promise.all([shader.getCompilationInfo(), hazeShader.getCompilationInfo(), presentShader.getCompilationInfo()]);
      return messages.flatMap(info => info.messages.filter(item => item.type === "error").map(item => item.message));
    },
    dispose() {
      disposed = true;
      destroyLayerMeshes(layers, mesh => destroyGpuMesh(mesh));
      destroyGpuMesh(surface);
      sceneTexture?.destroy();
      readbackBuffer?.destroy();
      hazeTexture?.destroy();
      uniformBuffer.destroy();
      device.destroy();
    }
  };
}

function createLayerMeshes(layers, create) {
  return Object.fromEntries(Object.entries(layers).map(([id, layer]) => [id, layer.hard
    ? {hard: create(layer.hard), smooth: create(layer.smooth)}
    : create(layer)]));
}

function selectedLayer(layer, smoothing) {
  return layer?.hard ? layer[smoothing ? "smooth" : "hard"] : layer;
}

function destroyLayerMeshes(layers, destroy) {
  for (const layer of Object.values(layers)) {
    if (layer?.hard) { destroy(layer.hard); destroy(layer.smooth); }
    else destroy(layer);
  }
}

function createGlMesh(gl, mesh, colorUsage) {
  if (!mesh?.vertexCount) return null;
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, colorUsage);
  return {positionBuffer, colorBuffer, vertexCount: mesh.vertexCount};
}

function destroyGlMesh(gl, mesh) {
  if (!mesh) return;
  gl.deleteBuffer(mesh.positionBuffer);
  gl.deleteBuffer(mesh.colorBuffer);
}

function createGpuMesh(device, mesh, colorUsage = 0) {
  if (!mesh?.vertexCount) return null;
  return {
    positionBuffer: createGpuBuffer(device, mesh.positions, GPUBufferUsage.VERTEX),
    colorBuffer: createGpuBuffer(device, mesh.colors, GPUBufferUsage.VERTEX | colorUsage),
    vertexCount: mesh.vertexCount
  };
}

function destroyGpuMesh(mesh) {
  mesh?.positionBuffer.destroy();
  mesh?.colorBuffer.destroy();
}

function createGpuBuffer(device, data, usage) {
  const buffer = device.createBuffer({size: Math.ceil(data.byteLength / 4) * 4, usage, mappedAtCreation: true});
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

function createGlProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileGlShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "WebGL2 着色器链接失败");
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function compileGlShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "WebGL2 着色器编译失败");
  return shader;
}

const glVertex = `#version 300 es
in vec2 a_position;
in vec3 a_color;
uniform vec2 u_resolution;
uniform float u_scale;
uniform vec2 u_translate;
out vec3 v_color;
void main() {
  vec2 screen = a_position * u_scale + u_translate;
  gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
  v_color = a_color;
}`;
const glFragment = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 out_color;
void main() { out_color = vec4(v_color, 1.0); }`;
const glFullscreenVertex = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 point = gl_VertexID == 0 ? vec2(-1.0, -1.0) : gl_VertexID == 1 ? vec2(3.0, -1.0) : vec2(-1.0, 3.0);
  v_uv = vec2((point.x + 1.0) * 0.5, (1.0 - point.y) * 0.5);
  gl_Position = vec4(point, 0.0, 1.0);
}`;
const glHazeFragment = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_strength;
in vec2 v_uv;
out vec4 out_color;
void main() {
  vec4 haze = texture(u_texture, v_uv);
  out_color = vec4(haze.rgb, haze.a * u_strength);
}`;

const wgslMap = `
struct Camera { view: vec4f, offset: vec4f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) color: vec3f }
@vertex fn vertexMain(@location(0) position: vec2f, @location(1) color: vec3f) -> VertexOutput {
  let screen = position * camera.view.z + camera.offset.xy;
  var output: VertexOutput;
  output.position = vec4f(screen.x / camera.view.x * 2.0 - 1.0, 1.0 - screen.y / camera.view.y * 2.0, 0.0, 1.0);
  output.color = color;
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}`;
const wgslHaze = `
@group(0) @binding(0) var hazeTexture: texture_2d<f32>;
@group(0) @binding(1) var hazeSampler: sampler;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let point = select(select(vec2f(-1.0, 3.0), vec2f(3.0, -1.0), index == 1u), vec2f(-1.0, -1.0), index == 0u);
  var output: VertexOutput;
  output.position = vec4f(point, 0.0, 1.0);
  output.uv = vec2f((point.x + 1.0) * 0.5, (1.0 - point.y) * 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let haze = textureSample(hazeTexture, hazeSampler, input.uv);
  return vec4f(haze.rgb, haze.a * 0.25);
}`;
const wgslPresent = `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let point = select(select(vec2f(-1.0, 3.0), vec2f(3.0, -1.0), index == 1u), vec2f(-1.0, -1.0), index == 0u);
  var output: VertexOutput;
  output.position = vec4f(point, 0.0, 1.0);
  output.uv = vec2f((point.x + 1.0) * 0.5, (1.0 - point.y) * 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureLoad(sceneTexture, vec2i(input.position.xy), 0);
}`;
