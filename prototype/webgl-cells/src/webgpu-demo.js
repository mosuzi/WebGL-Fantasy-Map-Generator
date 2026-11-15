import {MapCamera} from "./camera.js";
import {createWebGlCells, createWebGpuCells} from "./webgpu-backends.js";

const glCanvas = document.getElementById("webgl-canvas");
const gpuCanvas = document.getElementById("webgpu-canvas");
const status = document.getElementById("demo-status");
const gpuStatus = document.getElementById("webgpu-status");
const buildResult = document.getElementById("build-result");
const glResult = document.getElementById("webgl-result");
const gpuResult = document.getElementById("webgpu-result");
const benchmarkResult = document.getElementById("benchmark-result");
const benchmarkButton = document.getElementById("run-benchmark");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const fitButton = document.getElementById("fit-view");

let snapshot;
let geometry;
let glBackend;
let gpuBackend;
let mode = "height";
let lastDraw = {webglMs: null, webgpuMs: null};
let benchmark = null;
let benchmarking = false;
let initialized = false;
let startupTiming = null;
const camera = new MapCamera(glCanvas, drawBoth);

window.__webgpuCellDemo = {
  getState: () => ({
    ready: initialized,
    webgpu: Boolean(gpuBackend),
    mode,
    cells: geometry?.renderCellCount || 0,
    vertices: geometry?.vertexCount || 0,
    colors: geometry?.themeColors?.length || 0,
    camera: {...camera.state},
    canvas: {width: glCanvas.width, height: glCanvas.height, gpuWidth: gpuCanvas.width, gpuHeight: gpuCanvas.height},
    lastDraw,
    benchmark,
    startupTiming,
    glError: glBackend?.error() ?? null
  }),
  setMode,
  fit: () => camera.fitToView(snapshot?.metadata),
  runBenchmark,
  waitForGpu: () => gpuBackend?.device.queue.onSubmittedWorkDone() ?? Promise.resolve()
};

for (const button of modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode));
fitButton.addEventListener("click", () => camera.fitToView(snapshot?.metadata));
benchmarkButton.addEventListener("click", runBenchmark);
for (const canvas of [glCanvas, gpuCanvas]) installNavigation(canvas);
const resizeObserver = new ResizeObserver(() => resize());
resizeObserver.observe(glCanvas);

try {
  const prepared = await loadFixedGeometry();
  snapshot = {metadata: prepared.metadata};
  geometry = {...prepared.geometry, themeColors: prepared.geometry.heightColors};
  startupTiming = prepared.timings;
  glBackend = createWebGlCells(glCanvas, geometry);
  let deviceFailure = null;
  let gpuResultValue = await createWebGpuCells(gpuCanvas, geometry, reason => {
    deviceFailure = reason;
    showGpuFailure(reason);
  }).catch(error => ({reason: `WebGPU 初始化失败：${error.message || String(error)}`}));
  if (!gpuResultValue.reason) {
    const shaderErrors = await gpuResultValue.errors().catch(error => [error.message || String(error)]);
    if (shaderErrors.length) {
      gpuResultValue.dispose();
      gpuResultValue = {reason: `WebGPU 着色器不可用：${shaderErrors.join("；")}`};
    }
  }
  if (!gpuResultValue.reason && (deviceFailure || gpuResultValue.isLost())) {
    gpuResultValue.dispose();
    gpuResultValue = {reason: deviceFailure || "WebGPU 设备已断开"};
  }
  if (gpuResultValue.reason) {
    gpuStatus.textContent = gpuResultValue.reason;
    gpuCanvas.hidden = true;
  } else {
    gpuBackend = gpuResultValue;
    gpuStatus.textContent = "WebGPU 已就绪";
  }
  buildResult.textContent = `${geometry.renderCellCount.toLocaleString()} 格 · ${geometry.vertexCount.toLocaleString()} 顶点 · 数据解析 ${formatMs(prepared.timings.parseMs)} · 地图数据准备 ${formatMs(prepared.timings.buildMs)}`;
  status.textContent = gpuBackend ? "两个画布使用同一份 cell 顶点与颜色。拖动画面或滚轮缩放，会同步更新两侧。" : "WebGL2 已就绪；此环境未能启用 WebGPU，对照测试不可用。";
  benchmarkButton.disabled = !gpuBackend;
  resize();
  drawBoth();
  if (gpuBackend) {
    const activeGpu = gpuBackend;
    try {
      await activeGpu.device.queue.onSubmittedWorkDone();
    } catch (error) {
      deviceFailure = `WebGPU 绘制未完成：${error.message || String(error)}`;
      activeGpu.dispose();
      showGpuFailure(deviceFailure);
    }
  }
  if (gpuBackend?.isLost()) {
    gpuBackend.dispose();
    showGpuFailure(deviceFailure || "WebGPU 设备已断开");
  }
  for (const button of modeButtons) button.disabled = false;
  fitButton.disabled = false;
  initialized = true;
} catch (error) {
  status.textContent = error.message || String(error);
  gpuStatus.textContent = "加载失败";
  benchmarkButton.disabled = true;
  console.error(error);
}

function resize() {
  if (!snapshot || !glBackend) return;
  const rect = glCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (glCanvas.width === width && glCanvas.height === height && gpuCanvas.width === width && gpuCanvas.height === height) return;
  glCanvas.width = gpuCanvas.width = width;
  glCanvas.height = gpuCanvas.height = height;
  gpuBackend?.resize();
  camera.fitToView(snapshot.metadata);
}

function setMode(nextMode) {
  if (!initialized || benchmarking || !["height", "states"].includes(nextMode)) return;
  mode = nextMode;
  geometry.themeColors = mode === "states" ? geometry.statesColors : geometry.heightColors;
  glBackend.updateColors(geometry.themeColors);
  gpuBackend?.updateColors(geometry.themeColors);
  for (const button of modeButtons) {
    button.classList.toggle("active", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  benchmark = null;
  benchmarkResult.textContent = "专题已切换；点击“测量 60 帧”重新采样。";
  drawBoth();
}

function drawBoth() {
  if (!glBackend) return;
  let webgpuMs = null;
  if (gpuBackend) {
    try {
      webgpuMs = gpuBackend.draw(camera.state);
    } catch (error) {
      const failed = gpuBackend;
      showGpuFailure(`WebGPU 绘制失败：${error.message || String(error)}`);
      failed.dispose();
    }
  }
  lastDraw = {
    webglMs: glBackend.draw(camera.state),
    webgpuMs
  };
  glResult.textContent = `最近一次 CPU 提交 ${formatMs(lastDraw.webglMs)}`;
  gpuResult.textContent = gpuBackend ? `最近一次 CPU 提交 ${formatMs(lastDraw.webgpuMs)}` : "无法测量";
}

function showGpuFailure(reason) {
  gpuBackend = null;
  gpuCanvas.hidden = true;
  gpuStatus.textContent = reason;
  gpuResult.textContent = "无法测量";
  benchmarkButton.disabled = true;
  status.textContent = "WebGL2 仍可查看；WebGPU 无法继续对照。";
}

function loadFixedGeometry() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./webgpu-data-worker.js", import.meta.url), {type: "module"});
    worker.onmessage = event => {
      worker.terminate();
      if (event.data?.type === "ready") resolve(event.data);
      else reject(new Error(event.data?.message || "固定地图数据准备失败"));
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || "固定地图数据准备失败"));
    };
    worker.postMessage({type: "load"});
  });
}

function installNavigation(canvas) {
  let pointer = null;
  canvas.addEventListener("pointerdown", event => {
    if (!glBackend) return;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id || benchmarking) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    camera.state.x += (event.clientX - pointer.x) * dpr;
    camera.state.y += (event.clientY - pointer.y) * dpr;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    drawBoth();
  });
  const end = event => {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    if (!glBackend || benchmarking) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    const worldX = (x - camera.state.x) / camera.state.scale;
    const worldY = (y - camera.state.y) / camera.state.scale;
    camera.state.scale = Math.max(0.15, Math.min(32, camera.state.scale * Math.exp(-event.deltaY * 0.001)));
    camera.state.x = x - worldX * camera.state.scale;
    camera.state.y = y - worldY * camera.state.scale;
    drawBoth();
  }, {passive: false});
}

async function runBenchmark() {
  if (!glBackend || !gpuBackend || benchmarking) return;
  benchmarking = true;
  benchmark = null;
  benchmarkButton.disabled = true;
  benchmarkResult.textContent = "正在依次测量两个后端…";
  const original = {...camera.state};
  const frames = Array.from({length: 60}, (_, index) => ({
    scale: original.scale * (1 + index / 300),
    x: original.x + Math.sin(index / 9) * 28,
    y: original.y + Math.cos(index / 11) * 18
  }));
  try {
    const gl = await sampleBackend(glBackend, frames);
    const gpu = await sampleBackend(gpuBackend, frames);
    benchmark = {samples: frames.length, webgl: gl, webgpu: gpu, mode, width: glCanvas.width, height: glCanvas.height};
    const cadence = gl.fallbacks || gpu.fallbacks ? "浏览器限制了动画帧，帧间隔不作对照。" : `帧间隔 p95：WebGL2 ${formatMs(gl.frameP95)}，WebGPU ${formatMs(gpu.frameP95)}。`;
    benchmarkResult.textContent = `WebGL2 CPU 提交 p50 / p95：${formatMs(gl.cpuP50)} / ${formatMs(gl.cpuP95)}；WebGPU：${formatMs(gpu.cpuP50)} / ${formatMs(gpu.cpuP95)}。${cadence}`;
  } catch (error) {
    benchmarkResult.textContent = `测量中断：${error.message || String(error)}`;
  } finally {
    Object.assign(camera.state, original);
    benchmarking = false;
    benchmarkButton.disabled = !gpuBackend;
    drawBoth();
  }
}

async function sampleBackend(backend, frames) {
  const cpu = [];
  const intervals = [];
  let fallbacks = 0;
  let previous = null;
  for (const frame of frames) {
    const {timestamp, fallback} = await nextFrame();
    if (fallback) fallbacks++;
    if (previous !== null) intervals.push(timestamp - previous);
    previous = timestamp;
    if (backend.isLost?.()) throw new Error("WebGPU 设备已断开");
    const drawMs = backend.draw(frame);
    if (!Number.isFinite(drawMs) || backend.isLost?.()) throw new Error("绘制未完成，测量已中断");
    cpu.push(drawMs);
  }
  return {cpuP50: percentile(cpu, 0.5), cpuP95: percentile(cpu, 0.95), frameP95: percentile(intervals, 0.95), fallbacks};
}

function nextFrame() {
  return new Promise(resolve => {
    const request = requestAnimationFrame(timestamp => {
      clearTimeout(timeout);
      resolve({timestamp, fallback: false});
    });
    const timeout = setTimeout(() => {
      cancelAnimationFrame(request);
      resolve({timestamp: performance.now(), fallback: true});
    }, 50);
  });
}

function percentile(values, fraction) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] ?? NaN;
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}
