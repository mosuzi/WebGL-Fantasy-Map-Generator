import {createSampledHeightmap} from "../generator/heightmap.js";

export async function createGrayscaleHeightmapFromImage(documentRef, file, options, settings = {}) {
  if (!file) throw new Error("请选择一张灰度图");
  if (!isSupportedImageFile(file)) throw new Error("请选择浏览器可读取的图片文件");

  const width = Math.max(1, Number(options.graphWidth) || 1);
  const height = Math.max(1, Number(options.graphHeight) || 1);
  const image = await loadImage(file, documentRef);
  const canvas = documentRef.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("当前浏览器无法读取图片像素");
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const brightness = new Float32Array(width * height);
  const stats = readBrightness(imageData.data, brightness);
  const minHeight = clampNumber(settings.minHeight, 0, 99, 0);
  const maxHeight = clampNumber(settings.maxHeight, minHeight + 1, 100, 100);
  const brightnessRange = Math.max(1e-6, stats.max - stats.min);

  return createSampledHeightmap(options, {
    template: "grayscale-import",
    name: "灰度高度图",
    kind: "image-grayscale",
    filename: file.name,
    width: image.width || image.naturalWidth || 0,
    height: image.height || image.naturalHeight || 0,
    brightnessMin: stats.min,
    brightnessMax: stats.max,
    heightMin: minHeight,
    heightMax: maxHeight,
    normalization: "image-min-max",
    sampleHeight: point => {
      const x = clampInteger(Math.round(point[0]), 0, width - 1);
      const y = clampInteger(Math.round(point[1]), 0, height - 1);
      const normalized = (brightness[y * width + x] - stats.min) / brightnessRange;
      return minHeight + clampNumber(normalized, 0, 1, 0) * (maxHeight - minHeight);
    }
  });
}

export function readHeightmapImportSettings(documentRef) {
  const minHeight = readNumberInput(documentRef, "heightmap-import-min", 0);
  const maxHeight = readNumberInput(documentRef, "heightmap-import-max", 100);
  return {minHeight, maxHeight};
}

async function loadImage(file, documentRef) {
  const view = documentRef.defaultView || window;
  if (typeof view.createImageBitmap === "function") {
    try {
      return await view.createImageBitmap(file);
    } catch {
      // Fall back to HTMLImageElement below for formats not supported by createImageBitmap.
    }
  }

  return new Promise((resolve, reject) => {
    const url = view.URL.createObjectURL(file);
    const image = new view.Image();
    image.onload = () => {
      view.URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      view.URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function readBrightness(data, target) {
  let min = Infinity;
  let max = -Infinity;
  for (let offset = 0, pixel = 0; offset < data.length; offset += 4, pixel += 1) {
    const alpha = data[offset + 3] / 255;
    const red = data[offset] * alpha + 255 * (1 - alpha);
    const green = data[offset + 1] * alpha + 255 * (1 - alpha);
    const blue = data[offset + 2] * alpha + 255 * (1 - alpha);
    const value = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    target[pixel] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {min: 0, max: 255};
  return {min, max};
}

function isSupportedImageFile(file) {
  if (file.type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name || "");
}

function readNumberInput(documentRef, id, fallback) {
  const value = Number(documentRef.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
