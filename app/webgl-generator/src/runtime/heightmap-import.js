import {createSampledHeightmap} from "../generator/heightmap.js";

const PALETTE_MAPPING_MODES = Object.freeze(["grayscale", "luminance", "hue", "fmg-scheme", "manual"]);
const UNASSIGNED_STRATEGIES = Object.freeze(["fixed-height", "nearest-palette", "mark-pending"]);
const FMG_HEIGHT_COLOR_STOPS = Object.freeze([
  {height: 8, color: [38, 92, 145]},
  {height: 18, color: [63, 126, 174]},
  {height: 24, color: [88, 142, 76]},
  {height: 42, color: [135, 157, 82]},
  {height: 58, color: [158, 127, 72]},
  {height: 76, color: [128, 118, 106]},
  {height: 92, color: [232, 228, 212]}
]);

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
  const fitMode = normalizeFitMode(settings.fitMode);
  drawImageToHeightmapCanvas(context, image, width, height, fitMode);
  const imageData = context.getImageData(0, 0, width, height);
  const brightness = new Float32Array(width * height);
  const stats = readBrightness(imageData.data, brightness);
  const minHeight = clampNumber(settings.minHeight, 0, 99, 0);
  const maxHeight = clampNumber(settings.maxHeight, minHeight + 1, 100, 100);
  const invert = Boolean(settings.invert);
  const brightnessRange = Math.max(1e-6, stats.max - stats.min);
  const sampledHeights = new Uint8Array(width * height);
  for (let pixel = 0; pixel < brightness.length; pixel += 1) {
    const base = (brightness[pixel] - stats.min) / brightnessRange;
    const normalized = invert ? 1 - base : base;
    sampledHeights[pixel] = clampInteger(Math.round(minHeight + clampNumber(normalized, 0, 1, 0) * (maxHeight - minHeight)), 0, 100);
  }

  const heightmap = createSampledHeightmap(options, {
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
    invert,
    fitMode,
    normalization: "image-min-max",
    sampleHeight: point => {
      const x = clampInteger(Math.round(point[0]), 0, width - 1);
      const y = clampInteger(Math.round(point[1]), 0, height - 1);
      return sampledHeights[y * width + x];
    }
  });
  attachSampledHeightmapPayload(heightmap, width, height, sampledHeights);
  return heightmap;
}

export async function createPaletteHeightmapFromImage(documentRef, file, options, settings = {}) {
  if (!file) throw new Error("请选择一张高度图");
  if (!isSupportedImageFile(file)) throw new Error("请选择浏览器可读取的图片文件");

  const width = Math.max(1, Number(options.graphWidth) || 1);
  const height = Math.max(1, Number(options.graphHeight) || 1);
  const image = await loadImage(file, documentRef);
  const canvas = documentRef.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("当前浏览器无法读取图片像素");
  const fitMode = normalizeFitMode(settings.fitMode);
  drawImageToHeightmapCanvas(context, image, width, height, fitMode);
  const imageData = context.getImageData(0, 0, width, height);
  const brightness = new Float32Array(width * height);
  const stats = readBrightness(imageData.data, brightness);
  const minHeight = clampNumber(settings.minHeight, 0, 99, 0);
  const maxHeight = clampNumber(settings.maxHeight, minHeight + 1, 100, 100);
  const invert = Boolean(settings.invert);
  const mappingMode = normalizeMappingMode(settings.mappingMode);
  const colorLimit = clampInteger(Number(settings.colorLimit) || 32, 1, 128);
  const unassignedHeight = clampInteger(Number(settings.unassignedHeight) || 0, 0, 100);
  const unassignedStrategy = normalizeUnassignedStrategy(settings.unassignedStrategy);
  const buckets = collectColorBuckets(imageData.data, invert);
  const bucketList = Array.from(buckets.values()).sort((a, b) => b.pixels - a.pixels);
  const topBuckets = bucketList.slice(0, colorLimit);
  const unassignedBuckets = Math.max(0, bucketList.length - topBuckets.length);
  const unassignedPixels = bucketList.slice(colorLimit).reduce((sum, bucket) => sum + bucket.pixels, 0);
  const heightByKey = new Map();
  const paletteBuckets = [];
  const manualAssignments = normalizeManualAssignments(settings.assignments);
  const brightnessRange = Math.max(1e-6, stats.max - stats.min);
  const assignments = topBuckets.map(bucket => {
    const color = averageBucketColor(bucket);
    const autoHeight = automaticPaletteHeight(color, {min: stats.min, max: stats.max}, brightnessRange, {
      mappingMode,
      minHeight,
      maxHeight
    });
    const manualHeight = manualAssignments.get(String(bucket.key));
    const manual = Number.isFinite(manualHeight);
    const heightValue = manual ? manualHeight : autoHeight;
    heightByKey.set(bucket.key, heightValue);
    paletteBuckets.push({key: bucket.key, color, height: heightValue});
    return {
      key: bucket.key,
      color: rgbToHex(color.red, color.green, color.blue),
      height: heightValue,
      autoHeight,
      pixels: bucket.pixels,
      manual
    };
  });
  const sampledHeights = buildPaletteSampledHeights(imageData.data, heightByKey, unassignedHeight, {
    strategy: unassignedStrategy,
    paletteBuckets
  });

  const heightmap = createSampledHeightmap(options, {
    template: "grayscale-import",
    name: "彩色高度图",
    kind: "image-palette",
    filename: file.name,
    width: image.width || image.naturalWidth || 0,
    height: image.height || image.naturalHeight || 0,
    brightnessMin: stats.min,
    brightnessMax: stats.max,
    heightMin: minHeight,
    heightMax: maxHeight,
    invert,
    fitMode,
    mappingMode,
    colorLimit,
    unassignedHeight,
    unassignedStrategy,
    unassignedBuckets,
    unassignedPixels,
    assignments,
    normalization: "palette-assignment",
    sampleHeight: point => {
      const x = clampInteger(Math.round(point[0]), 0, width - 1);
      const y = clampInteger(Math.round(point[1]), 0, height - 1);
      return sampledHeights[y * width + x];
    }
  });
  attachSampledHeightmapPayload(heightmap, width, height, sampledHeights);
  return heightmap;
}

export function readHeightmapImportSettings(documentRef) {
  const minHeight = readNumberInput(documentRef, "heightmap-import-min", 0);
  const maxHeight = readNumberInput(documentRef, "heightmap-import-max", 100);
  const invert = Boolean(documentRef.getElementById("heightmap-import-invert")?.checked);
  const fitMode = documentRef.getElementById("heightmap-import-fit")?.value || "stretch";
  const unassignedHeight = readNumberInput(documentRef, "heightmap-unassigned-height", 0);
  const colorLimit = readNumberInput(documentRef, "heightmap-color-limit", 32);
  const mappingMode = documentRef.getElementById("heightmap-mapping-mode")?.value || "grayscale";
  const unassignedStrategy = documentRef.getElementById("heightmap-unassigned-strategy")?.value || "fixed-height";
  return {minHeight, maxHeight, invert, fitMode, colorLimit, mappingMode, unassignedHeight, unassignedStrategy};
}

export function normalizeHeightmapImportPayload(payload, documentRef) {
  if (typeof File !== "undefined" && payload instanceof File) return {file: payload, settings: readHeightmapImportSettings(documentRef)};
  const file = payload?.file || null;
  const settings = {...readHeightmapImportSettings(documentRef), ...(payload?.settings || {})};
  return {file, settings};
}

function drawImageToHeightmapCanvas(context, image, width, height, fitMode) {
  if (fitMode !== "crop") {
    context.drawImage(image, 0, 0, width, height);
    return;
  }
  const imageWidth = Math.max(1, image.width || image.naturalWidth || width);
  const imageHeight = Math.max(1, image.height || image.naturalHeight || height);
  const targetRatio = width / height;
  const imageRatio = imageWidth / imageHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = imageWidth;
  let sourceHeight = imageHeight;
  if (imageRatio > targetRatio) {
    sourceWidth = imageHeight * targetRatio;
    sourceX = (imageWidth - sourceWidth) / 2;
  } else if (imageRatio < targetRatio) {
    sourceHeight = imageWidth / targetRatio;
    sourceY = (imageHeight - sourceHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function normalizeFitMode(value) {
  return value === "crop" ? "crop" : "stretch";
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

function collectColorBuckets(data, invert) {
  const buckets = new Map();
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = compositedRgb(data, offset);
    const key = colorBucketKey(color.red, color.green, color.blue);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {key, pixels: 0, red: 0, green: 0, blue: 0, brightness: 0};
      buckets.set(key, bucket);
    }
    bucket.pixels += 1;
    bucket.red += color.red;
    bucket.green += color.green;
    bucket.blue += color.blue;
    bucket.brightness += invert ? 255 - color.brightness : color.brightness;
  }
  return buckets;
}

function averageBucketColor(bucket) {
  const pixels = Math.max(1, bucket.pixels);
  return {
    red: bucket.red / pixels,
    green: bucket.green / pixels,
    blue: bucket.blue / pixels,
    brightness: bucket.brightness / pixels
  };
}

function buildPaletteSampledHeights(data, heightByKey, unassignedHeight, options = {}) {
  const heights = new Uint8Array(data.length / 4);
  const nearestHeightByKey = new Map();
  for (let offset = 0, pixel = 0; offset < data.length; offset += 4, pixel += 1) {
    const color = compositedRgb(data, offset);
    const key = colorBucketKey(color.red, color.green, color.blue);
    heights[pixel] = heightByKey.get(key) ?? fallbackPaletteHeight(key, color, unassignedHeight, options, nearestHeightByKey);
  }
  return heights;
}

function fallbackPaletteHeight(key, color, unassignedHeight, options, nearestHeightByKey) {
  if (options.strategy === "nearest-palette" && options.paletteBuckets?.length) {
    if (!nearestHeightByKey.has(key)) {
      nearestHeightByKey.set(key, nearestPaletteBucketHeight(color, options.paletteBuckets, unassignedHeight));
    }
    return nearestHeightByKey.get(key);
  }
  return unassignedHeight;
}

function nearestPaletteBucketHeight(color, paletteBuckets, fallback) {
  let best = null;
  let bestDistance = Infinity;
  for (const bucket of paletteBuckets) {
    const distance = colorDistance(color, bucket.color);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = bucket;
    }
  }
  return best?.height ?? fallback;
}

function automaticPaletteHeight(color, brightnessStats, brightnessRange, settings) {
  if (settings.mappingMode === "manual") return 0;
  if (settings.mappingMode === "hue") return hueMappedHeight(color, settings);
  if (settings.mappingMode === "fmg-scheme") return nearestFmgHeight(color, settings);
  const normalized = clampNumber((color.brightness - brightnessStats.min) / brightnessRange, 0, 1, 0);
  if (settings.mappingMode === "luminance") {
    const adjusted = normalized < 0.18 ? normalized * 0.7 : 0.2 + Math.pow((normalized - 0.18) / 0.82, 0.92) * 0.8;
    return scaledHeight(adjusted, settings);
  }
  return scaledHeight(normalized, settings);
}

function scaledHeight(normalized, settings) {
  return Math.round(settings.minHeight + clampNumber(normalized, 0, 1, 0) * (settings.maxHeight - settings.minHeight));
}

function hueMappedHeight(color, settings) {
  const hsl = rgbToHsl(color.red, color.green, color.blue);
  if (hsl.saturation < 0.12) return scaledHeight(Math.pow(hsl.lightness, 1.25), settings);
  const hue = hsl.hue;
  if (hue >= 185 && hue <= 255) return scaledHeight(0.04 + clampNumber((hsl.lightness - 0.18) / 0.7, 0, 1, 0) * 0.16, settings);
  if (hue >= 70 && hue < 185) return scaledHeight(0.24 + clampNumber(hsl.lightness, 0, 1, 0) * 0.32, settings);
  if (hue >= 25 && hue < 70) return scaledHeight(0.42 + clampNumber(hsl.lightness, 0, 1, 0) * 0.3, settings);
  return scaledHeight(0.52 + clampNumber(hsl.lightness, 0, 1, 0) * 0.42, settings);
}

function nearestFmgHeight(color, settings) {
  let best = FMG_HEIGHT_COLOR_STOPS[0];
  let bestDistance = Infinity;
  for (const stop of FMG_HEIGHT_COLOR_STOPS) {
    const distance = colorDistance(color, stop.color);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stop;
    }
  }
  return clampInteger(Math.round(best.height), settings.minHeight, settings.maxHeight);
}

function normalizeManualAssignments(assignments) {
  const manualAssignments = new Map();
  if (!Array.isArray(assignments)) return manualAssignments;
  for (const assignment of assignments) {
    if (!assignment?.manual) continue;
    const key = String(assignment.key);
    const height = Number(assignment.height);
    if (key && Number.isFinite(height)) manualAssignments.set(key, clampInteger(Math.round(height), 0, 100));
  }
  return manualAssignments;
}

function normalizeMappingMode(value) {
  return PALETTE_MAPPING_MODES.includes(value) ? value : "grayscale";
}

function normalizeUnassignedStrategy(value) {
  return UNASSIGNED_STRATEGIES.includes(value) ? value : "fixed-height";
}

function compositedRgb(data, offset) {
  const alpha = data[offset + 3] / 255;
  const red = Math.round(data[offset] * alpha + 255 * (1 - alpha));
  const green = Math.round(data[offset + 1] * alpha + 255 * (1 - alpha));
  const blue = Math.round(data[offset + 2] * alpha + 255 * (1 - alpha));
  return {
    red,
    green,
    blue,
    brightness: red * 0.2126 + green * 0.7152 + blue * 0.0722
  };
}

function colorBucketKey(red, green, blue) {
  return ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
}

function rgbToHex(red, green, blue) {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}

function rgbToHsl(red, green, blue) {
  const r = clampNumber(red, 0, 255, 0) / 255;
  const g = clampNumber(green, 0, 255, 0) / 255;
  const b = clampNumber(blue, 0, 255, 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  return {hue: hue < 0 ? hue + 360 : hue, saturation, lightness};
}

function colorDistance(color, target) {
  const targetRed = target.red ?? target[0];
  const targetGreen = target.green ?? target[1];
  const targetBlue = target.blue ?? target[2];
  const dr = color.red - targetRed;
  const dg = color.green - targetGreen;
  const db = color.blue - targetBlue;
  return dr * dr * 0.3 + dg * dg * 0.5 + db * db * 0.2;
}

function hexByte(value) {
  return clampInteger(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function attachSampledHeightmapPayload(heightmap, sampleWidth, sampleHeight, samples) {
  Object.defineProperty(heightmap, "workerPayload", {
    value: {
      source: heightmap.source,
      sampleWidth,
      sampleHeight,
      samples
    },
    enumerable: false
  });
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
