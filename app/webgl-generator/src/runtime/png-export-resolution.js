import {assertPngBudget} from "./png-export-size.js";

// Own only the temporary drawing resolution; the caller owns crop/camera and must restore both.
export function preparePngDrawingResolution(canvas, renderer, sourceRect, size) {
  if (!renderer?.gl || !renderer.canvasSize) throw new Error("明确像素尺寸需要可用的地图渲染器。");
  const previous = {width: canvas.width, height: canvas.height, size: renderer.canvasSize};
  const factor = Math.max(size.width / sourceRect.width, size.height / sourceRect.height);
  const width = Math.ceil(canvas.width * factor), height = Math.ceil(canvas.height * factor);
  const gl = renderer.gl;
  const gpuLimit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  assertPngBudget(width, height, gpuLimit);
  const restore = () => {
    canvas.width = previous.width; canvas.height = previous.height;
    renderer.canvasSize = previous.size;
    renderer.markViewportBuffersDirty?.();
  };
  try {
    canvas.width = width; canvas.height = height;
    renderer.canvasSize = {...previous.size, width, height, pixelRatio: width / previous.size.cssWidth};
    renderer.markViewportBuffersDirty?.(); renderer.draw({updateDynamicBuffers: true, updateOverlay: true});
  } catch (error) { restore(); throw error; }
  return restore;
}
