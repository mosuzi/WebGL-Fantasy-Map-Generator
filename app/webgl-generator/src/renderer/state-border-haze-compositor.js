import {createProgram} from "./gl-utils.js";

const LAB_DECAY_SOFTNESS = 0.65;
const MIN_DECAY_BLUR_PX = 0.75;
const MAX_DECAY_BLUR_RATIO = 0.42;
const MIN_COLOR_BLUR_RATIO = 0.08;
const MAX_COLOR_BLUR_RATIO = 0.58;
const MAX_COMPOSITOR_EDGE = 1024;

export function createStateBorderHazeCompositor(gl, sourceCanvas) {
  const ownerDocument = sourceCanvas?.ownerDocument;
  if (!ownerDocument?.createElement) throw new Error("国界晕染合成器缺少 canvas 文档环境");
  const program = createProgram(gl, fullscreenVertexShaderSource, textureFragmentShaderSource);
  const texture = gl.createTexture();
  const locations = {
    texture: gl.getUniformLocation(program, "u_texture"),
    strength: gl.getUniformLocation(program, "u_strength")
  };
  const canvases = Array.from({length: 4}, () => ownerDocument.createElement("canvas"));
  const contexts = canvases.map(canvas => canvas.getContext("2d"));
  if (contexts.some(context => !context)) throw new Error("当前浏览器不支持国界晕染所需的 2D canvas");
  let lastReceipt = emptyStateBorderHazeReceipt();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return Object.freeze({render, destroy, getLastReceipt: () => lastReceipt});

  function render({map, paths, camera, style}) {
    if (!map || !style?.enabled || !(style.strength > 0) || !(style.widthWorld > 0) || !paths?.boundaries?.length) {
      lastReceipt = emptyStateBorderHazeReceipt();
      return lastReceipt;
    }
    const startedAt = performance.now();
    const target = resolveCompositorSize(sourceCanvas.width, sourceCanvas.height);
    resizeCanvases(canvases, target.width, target.height);
    const profile = resolveStateBorderHazePixelProfile({
      widthWorld: style.widthWorld,
      map,
      camera,
      width: target.width,
      height: target.height
    });
    const [sourceContext, blurContext, maskContext, maskBlurContext] = contexts;
    resetContext(sourceContext, target);
    gl.flush();
    sourceContext.drawImage(sourceCanvas, 0, 0, target.width, target.height);

    resetContext(blurContext, target);
    blurContext.filter = `blur(${profile.colorBlurPx}px)`;
    blurContext.drawImage(canvases[0], 0, 0);
    blurContext.filter = "none";

    resetContext(maskContext, target);
    const segmentCount = strokeRawBoundaryMask(maskContext, paths.boundaries, map, camera, target, profile.coreWidthPx);

    resetContext(maskBlurContext, target);
    maskBlurContext.filter = `blur(${profile.maskBlurPx}px)`;
    maskBlurContext.drawImage(canvases[2], 0, 0);
    maskBlurContext.filter = "none";

    resetContext(sourceContext, target);
    sourceContext.drawImage(canvases[1], 0, 0);
    sourceContext.globalCompositeOperation = "destination-in";
    sourceContext.drawImage(canvases[3], 0, 0);
    sourceContext.globalCompositeOperation = "source-over";

    gl.useProgram(program);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvases[0]);
    gl.uniform1i(locations.texture, 0);
    gl.uniform1f(locations.strength, Math.max(0, Math.min(1, Number(style.strength) || 0)));
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, null);

    lastReceipt = Object.freeze({
      enabled: true,
      pipeline: "screen-raster-normalized",
      anchor: "raw-state-boundary",
      junction: "single-saturated-mask",
      widthWorld: style.widthWorld,
      strength: style.strength,
      targetWidth: target.width,
      targetHeight: target.height,
      segmentCount,
      composeMs: roundMetric(performance.now() - startedAt),
      ...profile
    });
    return lastReceipt;
  }

  function destroy() {
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
  }
}

export function resolveStateBorderHazePixelProfile({widthWorld, map, camera, width, height}) {
  const graphWidth = Math.max(1, Number(map?.metadata?.graphWidth) || 1);
  const graphHeight = Math.max(1, Number(map?.metadata?.graphHeight) || 1);
  const scale = Math.max(0.0001, Number(camera?.scale) || 1);
  const pixelsPerWorld = scale * ((Math.max(1, width) / graphWidth + Math.max(1, height) / graphHeight) * 0.5);
  const widthPx = Math.max(1, (Number(widthWorld) || 0) * pixelsPerWorld);
  const easedSoftness = LAB_DECAY_SOFTNESS * LAB_DECAY_SOFTNESS * (3 - 2 * LAB_DECAY_SOFTNESS);
  const targetHalfExtentPx = widthPx * 0.85;
  const maximumMaskBlurPx = Math.max(MIN_DECAY_BLUR_PX, widthPx * MAX_DECAY_BLUR_RATIO);
  const maskBlurPx = MIN_DECAY_BLUR_PX + (maximumMaskBlurPx - MIN_DECAY_BLUR_PX) * easedSoftness;
  const colorBlurPx = widthPx * (MIN_COLOR_BLUR_RATIO + (MAX_COLOR_BLUR_RATIO - MIN_COLOR_BLUR_RATIO) * easedSoftness);
  const coreWidthPx = Math.max(1, (targetHalfExtentPx - maskBlurPx) * 2);
  return Object.freeze({
    pixelsPerWorld: roundMetric(pixelsPerWorld),
    widthPx: roundMetric(widthPx),
    coreWidthPx: roundMetric(coreWidthPx),
    maskBlurPx: roundMetric(maskBlurPx),
    colorBlurPx: roundMetric(colorBlurPx),
    effectiveHalfExtentPx: roundMetric(coreWidthPx * 0.5 + maskBlurPx)
  });
}

export function projectRawBoundaryPoint(point, map, camera, target) {
  const graphWidth = Math.max(1, Number(map?.metadata?.graphWidth) || 1);
  const graphHeight = Math.max(1, Number(map?.metadata?.graphHeight) || 1);
  const scale = Math.max(0.0001, Number(camera?.scale) || 1);
  const offsetX = Number(camera?.offsetX) || 0;
  const offsetY = Number(camera?.offsetY) || 0;
  const ndcX = ((point[0] / graphWidth) * 2 - 1) * scale + offsetX;
  const ndcY = (1 - (point[1] / graphHeight) * 2) * scale + offsetY;
  return [((ndcX + 1) * 0.5) * target.width, ((1 - ndcY) * 0.5) * target.height];
}

function strokeRawBoundaryMask(context, boundaries, map, camera, target, coreWidthPx) {
  let segmentCount = 0;
  context.save();
  context.strokeStyle = "#fff";
  context.lineWidth = coreWidthPx;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  for (const path of boundaries) {
    if (!Array.isArray(path?.points) || path.points.length < 2) continue;
    const first = projectRawBoundaryPoint(path.points[0], map, camera, target);
    context.moveTo(first[0], first[1]);
    for (let index = 1; index < path.points.length; index++) {
      const point = projectRawBoundaryPoint(path.points[index], map, camera, target);
      context.lineTo(point[0], point[1]);
      segmentCount++;
    }
  }
  context.stroke();
  context.restore();
  return segmentCount;
}

function resolveCompositorSize(width, height) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(1, MAX_COMPOSITOR_EDGE / Math.max(safeWidth, safeHeight));
  return {width: Math.max(1, Math.round(safeWidth * scale)), height: Math.max(1, Math.round(safeHeight * scale))};
}

function resizeCanvases(canvases, width, height) {
  for (const canvas of canvases) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
}

function resetContext(context, target) {
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, target.width, target.height);
}

function emptyStateBorderHazeReceipt() {
  return Object.freeze({enabled: false, pipeline: "screen-raster-normalized", anchor: "raw-state-boundary", junction: "single-saturated-mask"});
}

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

const fullscreenVertexShaderSource = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = gl_VertexID == 0 ? vec2(-1.0, -1.0) : gl_VertexID == 1 ? vec2(3.0, -1.0) : vec2(-1.0, 3.0);
  vec2 screenUv = position * 0.5 + 0.5;
  v_uv = vec2(screenUv.x, 1.0 - screenUv.y);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const textureFragmentShaderSource = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_strength;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 haze = texture(u_texture, v_uv);
  outColor = vec4(haze.rgb, haze.a * u_strength);
}`;
