import {MapCamera} from "./camera.js";
import {createWebGlCells, createWebGpuCells} from "./webgpu-backends.js";
import {createHazePainter} from "./webgpu-haze.js";

const glCanvas = document.getElementById("webgl-canvas");
const gpuCanvas = document.getElementById("webgpu-canvas");
const glLabels = document.getElementById("webgl-labels");
const gpuLabels = document.getElementById("webgpu-labels");
const status = document.getElementById("demo-status");
const gpuStatus = document.getElementById("webgpu-status");
const buildResult = document.getElementById("build-result");
const sceneResult = document.getElementById("scene-result");
const glResult = document.getElementById("webgl-result");
const gpuResult = document.getElementById("webgpu-result");
const benchmarkResult = document.getElementById("benchmark-result");
const benchmarkTable = document.getElementById("benchmark-table");
const benchmarkButton = document.getElementById("run-benchmark");
const sceneButtons = [...document.querySelectorAll("[data-scene]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const smoothButton = document.getElementById("smooth-border");
const hazeButton = document.getElementById("border-haze");
const fitButton = document.getElementById("fit-view");
const controls = [...sceneButtons, ...modeButtons, smoothButton, hazeButton, fitButton];

let snapshot, geometry, glBackend, gpuBackend, glHaze, gpuHaze;
let scene = "complex", mode = "states", smoothing = true, haze = true;
let lastDraw = {webgl: null, webgpu: null};
let benchmark = null, benchmarking = false, initialized = false;
let startupTiming = null, renderPromise = null, renderPending = false;
const camera = new MapCamera(glCanvas, requestDraw);

window.__webgpuCellDemo = {
  getState: () => ({
    ready: initialized, webgpu: Boolean(gpuBackend), scene, mode, smoothing, haze,
    cells: geometry?.renderCellCount || 0, vertices: geometry?.vertexCount || 0,
    colors: geometry?.themeColors?.length || 0,
    layerCounts: geometry?.scene?.counts || null,
    labelCounts: geometry?.scene?.labels ? {states: geometry.scene.labels.states.length, burgs: geometry.scene.labels.burgs.length} : null,
    rawStateBorderSegments: geometry?.scene?.rawStateBorderSegments || 0,
    camera: {...camera.state},
    canvas: {width: glCanvas.width, height: glCanvas.height, gpuWidth: gpuCanvas.width, gpuHeight: gpuCanvas.height},
    lastDraw, benchmark, startupTiming,
    uploads: {
      webglMs: glBackend?.uploadMs ?? null, webgpuMs: gpuBackend?.uploadMs ?? null,
      webglSurfaceMs: glBackend?.surfaceUploadMs ?? null, webgpuSurfaceMs: gpuBackend?.surfaceUploadMs ?? null,
      webglSceneMs: glBackend?.sceneUploadMs ?? null, webgpuSceneMs: gpuBackend?.sceneUploadMs ?? null
    },
    environment: {userAgent: navigator.userAgent, dpr: window.devicePixelRatio || 1, webglRenderer: glBackend?.renderer ?? null, webgpuAdapter: gpuBackend?.adapterInfo ?? null},
    glError: glBackend?.error() ?? null
  }),
  setScene, setMode, setSmoothing, setHaze,
  fit: () => camera.fitToView(snapshot?.metadata),
  focusBorder: focusBorder,
  runBenchmark,
  waitForIdle: () => renderPromise || Promise.resolve(),
  waitForGpu: async () => { await (renderPromise || Promise.resolve()); await gpuBackend?.finish(); }
};

for (const button of sceneButtons) button.addEventListener("click", () => setScene(button.dataset.scene));
for (const button of modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode));
smoothButton.addEventListener("click", () => setSmoothing(!smoothing));
hazeButton.addEventListener("click", () => setHaze(!haze));
fitButton.addEventListener("click", () => camera.fitToView(snapshot?.metadata));
benchmarkButton.addEventListener("click", runBenchmark);
for (const canvas of [glCanvas, gpuCanvas]) installNavigation(canvas);
new ResizeObserver(() => resize()).observe(glCanvas);

try {
  const prepared = await loadFixedGeometry();
  snapshot = {metadata: prepared.metadata};
  geometry = {...prepared.geometry, themeColors: prepared.geometry.statesColors};
  startupTiming = {...prepared.timings, handoffReceivedAt: prepared.receivedAt, mainPhases: []};
  const glStart = performance.now();
  glBackend = createWebGlCells(glCanvas, geometry);
  startupTiming.mainPhases.push({name: "webgl-upload", start: glStart, durationMs: performance.now() - glStart});
  let deviceFailure = null;
  const gpuStart = performance.now();
  let candidate = await createWebGpuCells(gpuCanvas, geometry, reason => {
    deviceFailure = reason;
    showGpuFailure(reason);
  }).catch(error => ({reason: `WebGPU 初始化失败：${error.message || String(error)}`}));
  if (!candidate.reason) {
    const shaderErrors = await candidate.errors().catch(error => [error.message || String(error)]);
    if (shaderErrors.length) {
      candidate.dispose();
      candidate = {reason: `WebGPU 着色器不可用：${shaderErrors.join("；")}`};
    }
  }
  if (!candidate.reason && (deviceFailure || candidate.isLost())) {
    candidate.dispose();
    candidate = {reason: deviceFailure || "WebGPU 设备已断开"};
  }
  if (candidate.reason) showGpuFailure(candidate.reason);
  else {
    gpuBackend = candidate;
    gpuStatus.textContent = "WebGPU 已就绪";
  }
  startupTiming.mainPhases.push({name: "webgpu-setup", start: gpuStart, durationMs: performance.now() - gpuStart});
  const labelStart = performance.now();
  glHaze = createHazePainter(glCanvas, geometry.scene.rawStateBorders);
  if (gpuBackend) gpuHaze = createHazePainter(gpuBackend.hazeSourceCanvas, geometry.scene.rawStateBorders);
  installLabels(glLabels, geometry.scene.labels);
  installLabels(gpuLabels, geometry.scene.labels);
  startupTiming.mainPhases.push({name: "label-install", start: labelStart, durationMs: performance.now() - labelStart});
  buildResult.textContent = `${geometry.renderCellCount.toLocaleString()} 格 · ${geometry.vertexCount.toLocaleString()} 地表顶点 · 数据解析 ${formatMs(prepared.timings.parseMs)} · 图层准备 ${formatMs(prepared.timings.buildMs + prepared.timings.colorsMs + prepared.timings.sceneMs)}`;
  updateSceneDescription();
  status.textContent = gpuBackend ? "两侧正在绘制相同的复合地图。拖动或滚轮缩放会同步更新。" : "WebGL2 已就绪；此环境未能启用 WebGPU。";
  resize();
  const initialDrawStart = performance.now();
  await requestDraw();
  startupTiming.mainPhases.push({name: "initial-draw", start: initialDrawStart, durationMs: performance.now() - initialDrawStart});
  for (const button of controls) button.disabled = false;
  updateControls();
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
  requestDraw();
}

function setScene(next) {
  if (!initialized || benchmarking || !["cells", "complex"].includes(next)) return Promise.resolve();
  scene = next;
  updateControls();
  clearBenchmark();
  return requestDraw();
}

function setMode(next) {
  if (!initialized || benchmarking || !["height", "states"].includes(next)) return Promise.resolve();
  mode = next;
  geometry.themeColors = mode === "states" ? geometry.statesColors : geometry.heightColors;
  glBackend.updateColors(geometry.themeColors);
  gpuBackend?.updateColors(geometry.themeColors);
  updateControls();
  clearBenchmark();
  return requestDraw();
}

function setSmoothing(value) {
  if (!initialized || benchmarking) return Promise.resolve();
  smoothing = Boolean(value);
  updateControls();
  clearBenchmark();
  return requestDraw();
}

function setHaze(value) {
  if (!initialized || benchmarking) return Promise.resolve();
  haze = Boolean(value);
  updateControls();
  clearBenchmark();
  return requestDraw();
}

function focusBorder(scale = 9) {
  if (!initialized || benchmarking) return Promise.resolve();
  const positions = geometry.scene.rawStateBorders;
  const centerX = snapshot.metadata.graphWidth / 2, centerY = snapshot.metadata.graphHeight / 2;
  let selected = 0, best = Infinity;
  for (let index = 0; index + 3 < positions.length; index += 4) {
    const x = (positions[index] + positions[index + 2]) / 2;
    const y = (positions[index + 1] + positions[index + 3]) / 2;
    const score = (x - centerX) ** 2 + (y - centerY) ** 2;
    if (score < best) { best = score; selected = index; }
  }
  const x = (positions[selected] + positions[selected + 2]) / 2;
  const y = (positions[selected + 1] + positions[selected + 3]) / 2;
  camera.state.scale = scale;
  camera.state.x = glCanvas.width / 2 - x * scale;
  camera.state.y = glCanvas.height / 2 - y * scale;
  return requestDraw();
}

function updateControls() {
  for (const button of sceneButtons) setPressed(button, button.dataset.scene === scene);
  for (const button of modeButtons) setPressed(button, button.dataset.mode === mode);
  setPressed(smoothButton, smoothing);
  setPressed(hazeButton, haze);
  smoothButton.disabled = scene !== "complex" || benchmarking;
  hazeButton.disabled = scene !== "complex" || mode !== "states" || benchmarking;
  benchmarkButton.disabled = !gpuBackend || benchmarking;
  if (geometry) updateSceneDescription();
}

function updateSceneDescription() {
  sceneResult.textContent = scene === "cells"
    ? `控制组：${geometry.renderCellCount.toLocaleString()} 格地表色面，关闭全部线、图标、标签和晕染；仍沿用本页一次性准备和上传的数据，只比较逐帧绘制。`
    : `复合场景：湖泊、海岸、${geometry.scene.rawStateBorderSegments.toLocaleString()} 段国界、${(geometry.scene.counts.routes.hardVertices / 6).toLocaleString()} 段路线、${(geometry.scene.counts.rivers.hardVertices / 6).toLocaleString()} 段河流、城市图标与 ${geometry.scene.labels.burgs.length} 个候选城市标签。`;
}

function setPressed(button, active) {
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
}

function clearBenchmark() {
  benchmark = null;
  benchmarkTable.hidden = true;
  benchmarkResult.textContent = "场景已变化；点击“测量 60 帧”重新采样。";
}

function requestDraw() {
  if (!glBackend || benchmarking) return renderPromise || Promise.resolve();
  renderPending = true;
  if (renderPromise) return renderPromise;
  renderPromise = (async () => {
    while (renderPending) {
      renderPending = false;
      const view = {...camera.state};
      const options = currentOptions();
      const gl = await renderFrame(glBackend, glCanvas, glHaze, glLabels, view, options);
      lastDraw.webgl = gl;
      glResult.textContent = frameText(gl);
      if (gpuBackend) {
        const active = gpuBackend;
        try {
          const gpu = await renderFrame(active, gpuCanvas, gpuHaze, gpuLabels, view, options);
          if (gpuBackend === active) {
            lastDraw.webgpu = gpu;
            gpuResult.textContent = frameText(gpu);
          }
        } catch (error) {
          active.dispose();
          showGpuFailure(`WebGPU 绘制失败：${error.message || String(error)}`);
        }
      }
    }
  })().finally(() => { renderPromise = null; if (renderPending) requestDraw(); });
  return renderPromise;
}

async function renderFrame(backend, canvas, painter, labels, view, options) {
  if (backend.isLost?.()) throw new Error("设备已断开");
  const began = performance.now();
  const baseMs = backend.drawBase(view, options);
  let hazeMs = 0, readbackMs = 0, hazeSegments = 0, waitMs = 0, hazeCanvas = null;
  if (options.haze) {
    const waitStart = performance.now();
    await backend.finish();
    waitMs += performance.now() - waitStart;
    if (backend.syncHazeSource) {
      const readbackStart = performance.now();
      await backend.syncHazeSource();
      readbackMs = performance.now() - readbackStart;
    }
    const hazeResult = painter.render(view);
    hazeMs = hazeResult.ms + readbackMs;
    hazeSegments = hazeResult.segments;
    hazeCanvas = hazeResult.canvas;
  }
  const restMs = backend.drawRest(view, options, hazeCanvas);
  const waitStart = performance.now();
  await backend.finish();
  waitMs += performance.now() - waitStart;
  const labelStart = performance.now();
  const visibleLabels = updateLabels(labels, canvas, view, options.scene === "complex");
  const labelMs = performance.now() - labelStart;
  if (!Number.isFinite(baseMs + restMs) || backend.isLost?.()) throw new Error("绘制未完成");
  return {cpuSubmitMs: baseMs + restMs, hazeMs, readbackMs, waitMs, labelMs, wallMs: performance.now() - began, hazeSegments, visibleLabels};
}

function frameText(frame) {
  return `本帧 CPU 提交 ${formatMs(frame.cpuSubmitMs)} · 晕染 ${formatMs(frame.hazeMs)} · 绘制流程 ${formatMs(frame.wallMs)}`;
}

function currentOptions() {
  return {scene, smoothing, haze: scene === "complex" && mode === "states" && haze};
}

function showGpuFailure(reason) {
  gpuBackend = null;
  gpuCanvas.hidden = true;
  gpuLabels.hidden = true;
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
      if (event.data?.type === "ready") resolve({...event.data, receivedAt: performance.now()});
      else reject(new Error(event.data?.message || "固定地图数据准备失败"));
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || "固定地图数据准备失败"));
    };
    worker.postMessage({type: "load"});
  });
}

function installLabels(layer, data) {
  const fragment = document.createDocumentFragment();
  for (const item of [...data.states.map(label => ({...label, kind: "state"})), ...data.burgs.map(label => ({...label, kind: label.capital ? "capital" : "burg"}))]) {
    const element = document.createElement("span");
    element.className = `map-label ${item.kind}`;
    element.textContent = item.name;
    element.dataset.x = item.x;
    element.dataset.y = item.y;
    fragment.append(element);
  }
  layer.replaceChildren(fragment);
}

function updateLabels(layer, canvas, view, visible) {
  layer.hidden = !visible;
  if (!visible) return 0;
  const ratioX = canvas.clientWidth / canvas.width;
  const ratioY = canvas.clientHeight / canvas.height;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const occupied = [];
  let count = 0;
  for (const item of layer.children) {
    const x = (Number(item.dataset.x) * view.scale + view.x) * ratioX;
    const y = (Number(item.dataset.y) * view.scale + view.y) * ratioY;
    const state = item.classList.contains("state");
    const capital = item.classList.contains("capital");
    const halfWidth = Math.min(115, item.textContent.length * (state ? 5.4 : capital ? 3.9 : 3.5) + 4);
    const halfHeight = state ? 11 : 8;
    const box = {left: x - halfWidth, top: y - halfHeight, right: x + halfWidth, bottom: y + halfHeight};
    const outside = box.right < 0 || box.left > width || box.bottom < 0 || box.top > height;
    const overlap = occupied.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    item.hidden = outside || overlap;
    if (!item.hidden) {
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      occupied.push(box);
      count++;
    }
  }
  return count;
}

function installNavigation(canvas) {
  let pointer = null;
  canvas.addEventListener("pointerdown", event => {
    if (!glBackend || benchmarking) return;
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
    requestDraw();
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
    const x = (event.clientX - rect.left) * dpr, y = (event.clientY - rect.top) * dpr;
    const worldX = (x - camera.state.x) / camera.state.scale;
    const worldY = (y - camera.state.y) / camera.state.scale;
    camera.state.scale = Math.max(0.15, Math.min(32, camera.state.scale * Math.exp(-event.deltaY * 0.001)));
    camera.state.x = x - worldX * camera.state.scale;
    camera.state.y = y - worldY * camera.state.scale;
    requestDraw();
  }, {passive: false});
}

async function runBenchmark() {
  if (!initialized || !glBackend || !gpuBackend || benchmarking) return;
  await (renderPromise || Promise.resolve());
  benchmarking = true;
  benchmark = null;
  for (const button of controls) button.disabled = true;
  benchmarkButton.disabled = true;
  benchmarkResult.textContent = "正在交替测量两侧的完整画面…";
  const original = {...camera.state};
  const options = currentOptions();
  const frames = Array.from({length: 65}, (_, index) => ({
    scale: original.scale * (1 + index / 320),
    x: original.x + Math.sin(index / 9) * 28,
    y: original.y + Math.cos(index / 11) * 18
  }));
  const samples = {webgl: [], webgpu: []};
  let frameFallbacks = 0;
  try {
    for (let index = 0; index < frames.length; index++) {
      const {fallback} = await nextFrame();
      if (fallback) frameFallbacks++;
      const order = index % 2 ? ["webgpu", "webgl"] : ["webgl", "webgpu"];
      for (const id of order) {
        const result = id === "webgl"
          ? await renderFrame(glBackend, glCanvas, glHaze, glLabels, frames[index], options)
          : await renderFrame(gpuBackend, gpuCanvas, gpuHaze, gpuLabels, frames[index], options);
        if (index >= 5) samples[id].push(result);
      }
    }
    benchmark = {
      samples: 60, warmup: 5, scene, mode, smoothing: options.smoothing, haze: options.haze,
      webgl: summarizeFrames(samples.webgl), webgpu: summarizeFrames(samples.webgpu),
      width: glCanvas.width, height: glCanvas.height, frameFallbacks
    };
    benchmarkResult.textContent = `60 帧完成。CPU 提交 p95：WebGL2 ${formatMs(benchmark.webgl.cpuSubmitP95)}，WebGPU ${formatMs(benchmark.webgpu.cpuSubmitP95)}；绘制流程 p95：${formatMs(benchmark.webgl.wallP95)} / ${formatMs(benchmark.webgpu.wallP95)}。晕染与标签耗时见下表。`;
    showBenchmarkTable(benchmark);
  } catch (error) {
    benchmarkResult.textContent = `测量中断：${error.message || String(error)}`;
  } finally {
    Object.assign(camera.state, original);
    benchmarking = false;
    for (const button of controls) button.disabled = false;
    updateControls();
    await requestDraw();
  }
}

function summarizeFrames(frames) {
  const metric = key => ({p50: percentile(frames.map(frame => frame[key]), 0.5), p95: percentile(frames.map(frame => frame[key]), 0.95), max: Math.max(...frames.map(frame => frame[key]))});
  return {
    cpuSubmitP50: metric("cpuSubmitMs").p50, cpuSubmitP95: metric("cpuSubmitMs").p95,
    wallP50: metric("wallMs").p50, wallP95: metric("wallMs").p95,
    waitP95: metric("waitMs").p95, hazeP95: metric("hazeMs").p95,
    readbackP95: metric("readbackMs").p95, labelsP95: metric("labelMs").p95, wallMax: metric("wallMs").max
  };
}

function showBenchmarkTable(result) {
  const rows = [
    ["一次性地表上传", glBackend.surfaceUploadMs, gpuBackend.surfaceUploadMs],
    ["一次性复合图层上传", glBackend.sceneUploadMs, gpuBackend.sceneUploadMs],
    ["CPU 提交 p95", result.webgl.cpuSubmitP95, result.webgpu.cpuSubmitP95],
    ["完成等待 p95", result.webgl.waitP95, result.webgpu.waitP95],
    ["晕染总成本 p95", result.webgl.hazeP95, result.webgpu.hazeP95],
    ["其中 GPU 源图回读 p95", result.webgl.readbackP95, result.webgpu.readbackP95],
    ["标签更新 p95", result.webgl.labelsP95, result.webgpu.labelsP95],
    ["绘制流程 p50", result.webgl.wallP50, result.webgpu.wallP50],
    ["绘制流程 p95", result.webgl.wallP95, result.webgpu.wallP95]
  ];
  benchmarkTable.tBodies[0].replaceChildren(...rows.map(([name, gl, gpu]) => {
    const row = document.createElement("tr");
    for (const value of [name, formatMs(gl), formatMs(gpu)]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
  benchmarkTable.hidden = false;
}

function nextFrame() {
  return new Promise(resolve => {
    const request = requestAnimationFrame(() => { clearTimeout(timeout); resolve({fallback: false}); });
    const timeout = setTimeout(() => { cancelAnimationFrame(request); resolve({fallback: true}); }, 50);
  });
}

function percentile(values, fraction) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] ?? NaN;
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}
