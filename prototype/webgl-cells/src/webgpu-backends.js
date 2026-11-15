const CLEAR = [0.075, 0.192, 0.298, 1];

export function createWebGlCells(canvas, geometry) {
  const gl = canvas.getContext("webgl2", {antialias: false, alpha: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error("当前浏览器不支持 WebGL2");
  const program = createGlProgram(gl);
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.themeColors, gl.DYNAMIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  const color = gl.getAttribLocation(program, "a_color");
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const scale = gl.getUniformLocation(program, "u_scale");
  const translate = gl.getUniformLocation(program, "u_translate");

  return {
    name: "WebGL2",
    updateColors(colors) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    },
    draw(camera) {
      const started = performance.now();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(...CLEAR);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(scale, camera.scale);
      gl.uniform2f(translate, camera.x, camera.y);
      bindGlAttribute(gl, position, positionBuffer, 2);
      bindGlAttribute(gl, color, colorBuffer, 3);
      gl.drawArrays(gl.TRIANGLES, 0, geometry.vertexCount);
      return performance.now() - started;
    },
    error: () => gl.getError(),
    dispose() {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteProgram(program);
    }
  };
}

export async function createWebGpuCells(canvas, geometry, onDeviceLost) {
  if (!navigator.gpu || !window.isSecureContext) return {reason: "此浏览器或当前地址未开放 WebGPU；请使用支持 WebGPU 的浏览器，并通过 HTTPS 或 localhost 打开。"};
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return {reason: "浏览器未找到可用的 WebGPU 适配器。"};
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) return {reason: "浏览器未能创建 WebGPU 画布。"};
  const format = navigator.gpu.getPreferredCanvasFormat();
  const configure = () => context.configure({device, format, alphaMode: "opaque"});
  configure();

  const positionBuffer = createGpuBuffer(device, geometry.positions, GPUBufferUsage.VERTEX);
  const colorBuffer = createGpuBuffer(device, geometry.themeColors, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const uniformBuffer = device.createBuffer({size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
  const shader = device.createShaderModule({code: wgsl});
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vertexMain",
      buffers: [
        {arrayStride: 8, attributes: [{shaderLocation: 0, offset: 0, format: "float32x2"}]},
        {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]}
      ]
    },
    fragment: {module: shader, entryPoint: "fragmentMain", targets: [{format}]},
    primitive: {topology: "triangle-list"}
  });
  const bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: uniformBuffer}}]});
  let lost = false;
  let disposed = false;
  device.lost.then(info => {
    lost = true;
    if (disposed) return;
    onDeviceLost?.(`WebGPU 设备已断开：${info.message || info.reason || "未知原因"}`);
  });

  return {
    name: "WebGPU",
    device,
    isLost: () => lost,
    resize: configure,
    updateColors(colors) {
      if (lost) return;
      device.queue.writeBuffer(colorBuffer, 0, colors);
    },
    draw(camera) {
      if (lost) return NaN;
      const started = performance.now();
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
        canvas.width, canvas.height, camera.scale, 0,
        camera.x, camera.y, 0, 0
      ]));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: {r: CLEAR[0], g: CLEAR[1], b: CLEAR[2], a: 1},
        loadOp: "clear",
        storeOp: "store"
      }]});
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, positionBuffer);
      pass.setVertexBuffer(1, colorBuffer);
      pass.draw(geometry.vertexCount);
      pass.end();
      device.queue.submit([encoder.finish()]);
      return performance.now() - started;
    },
    async errors() {
      const messages = await shader.getCompilationInfo();
      return messages.messages.filter(item => item.type === "error").map(item => item.message);
    },
    dispose() {
      disposed = true;
      positionBuffer.destroy();
      colorBuffer.destroy();
      uniformBuffer.destroy();
      device.destroy();
    }
  };
}

function createGpuBuffer(device, data, usage) {
  const buffer = device.createBuffer({size: Math.ceil(data.byteLength / 4) * 4, usage, mappedAtCreation: true});
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

function bindGlAttribute(gl, location, buffer, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

function createGlProgram(gl) {
  const vertex = compileGlShader(gl, gl.VERTEX_SHADER, `#version 300 es
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
}`);
  const fragment = compileGlShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 out_color;
void main() { out_color = vec4(v_color, 1.0); }`);
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

const wgsl = `
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
