const MAX_EDGE = 1024;
const SOFTNESS = 0.65 * 0.65 * (3 - 2 * 0.65);

// 与正式国界晕染相同的屏幕空间步骤：源图模糊、原始国界单一蒙版、蒙版模糊、裁切。
export function createHazePainter(sourceCanvas, rawSegments) {
  const canvases = Array.from({length: 4}, () => document.createElement("canvas"));
  const contexts = canvases.map(canvas => canvas.getContext("2d"));
  if (contexts.some(context => !context)) throw new Error("当前浏览器不支持国界晕染所需的画布");

  return {render};

  function render(camera, widthWorld = 7) {
    const started = performance.now();
    const scale = Math.min(1, MAX_EDGE / Math.max(sourceCanvas.width, sourceCanvas.height));
    const width = Math.max(1, Math.round(sourceCanvas.width * scale));
    const height = Math.max(1, Math.round(sourceCanvas.height * scale));
    for (const canvas of canvases) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    const ratioX = width / sourceCanvas.width;
    const ratioY = height / sourceCanvas.height;
    const widthPx = Math.max(1, widthWorld * camera.scale * (ratioX + ratioY) * 0.5);
    const maskBlurPx = 0.75 + (Math.max(0.75, widthPx * 0.42) - 0.75) * SOFTNESS;
    const colorBlurPx = widthPx * (0.08 + (0.58 - 0.08) * SOFTNESS);
    const coreWidthPx = Math.max(1, (widthPx * 0.85 - maskBlurPx) * 2);
    const [source, blurred, mask, maskBlurred] = contexts;

    reset(source, width, height);
    source.drawImage(sourceCanvas, 0, 0, width, height);
    reset(blurred, width, height);
    blurred.filter = `blur(${colorBlurPx}px)`;
    blurred.drawImage(canvases[0], 0, 0);
    blurred.filter = "none";

    reset(mask, width, height);
    mask.strokeStyle = "#fff";
    mask.lineWidth = coreWidthPx;
    mask.lineCap = "round";
    mask.lineJoin = "round";
    mask.beginPath();
    for (let index = 0; index + 3 < rawSegments.length; index += 4) {
      mask.moveTo((rawSegments[index] * camera.scale + camera.x) * ratioX, (rawSegments[index + 1] * camera.scale + camera.y) * ratioY);
      mask.lineTo((rawSegments[index + 2] * camera.scale + camera.x) * ratioX, (rawSegments[index + 3] * camera.scale + camera.y) * ratioY);
    }
    mask.stroke();

    reset(maskBlurred, width, height);
    maskBlurred.filter = `blur(${maskBlurPx}px)`;
    maskBlurred.drawImage(canvases[2], 0, 0);
    maskBlurred.filter = "none";

    reset(source, width, height);
    source.drawImage(canvases[1], 0, 0);
    source.globalCompositeOperation = "destination-in";
    source.drawImage(canvases[3], 0, 0);
    source.globalCompositeOperation = "source-over";
    return {canvas: canvases[0], ms: performance.now() - started, segments: rawSegments.length / 4, width, height};
  }
}

function reset(context, width, height) {
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
}
