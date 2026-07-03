<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="height-panel-summary" />

  <UiButton :variant="state.active ? 'primary' : 'secondary'" @click="setActive(!state.active)">
    {{ state.active ? "停止高度编辑" : "启用高度编辑" }}
  </UiButton>

  <UiSegmented class="height-action-group" label="高度编辑动作" :options="actions" :model-value="state.action" @select="setAction" />

  <UiSliderField label="半径" :model-value="state.radius" :min="6" :max="96" :step="2" @input="setRadius" />
  <UiSliderField label="强度" :model-value="state.strength" :min="1" :max="18" :step="1" @input="setStrength" />

  <UiSwitchField label="中心衰减" field-class="height-check-row" :checked="state.falloff" @change="setFalloff" />

  <div class="height-history-actions">
    <UiButton variant="secondary" @click="callbacks.onUndo?.()">撤销上次</UiButton>
    <UiButton variant="secondary" @click="callbacks.onRedo?.()">重做上次</UiButton>
  </div>

  <section class="heightmap-import-launcher" aria-labelledby="heightmap-import-title">
    <div>
      <h2 id="heightmap-import-title">高度图导入</h2>
      <p>在独立工作台预览灰度图，再应用到当前地图。</p>
    </div>
    <UiButton class="heightmap-workbench-open" variant="secondary" @click="openImportWorkbench">打开导入工作台</UiButton>
    <p id="heightmap-import-status" class="file-operation-status" aria-live="polite"></p>
  </section>

  <Teleport to="body">
    <section
      v-if="workbenchOpen"
      class="heightmap-import-workbench"
      :style="workbenchStyle"
      role="dialog"
      aria-labelledby="heightmap-workbench-title"
      @pointerdown.stop
      @wheel.stop
    >
      <header class="heightmap-workbench-header" @pointerdown="startWorkbenchDrag">
        <strong id="heightmap-workbench-title">高度图导入工作台</strong>
        <ElButton class="heightmap-workbench-close" text circle aria-label="关闭高度图导入工作台" @click="closeImportWorkbench">×</ElButton>
      </header>

      <div class="heightmap-workbench-body">
        <div class="heightmap-preview-card">
          <canvas ref="previewCanvas" class="heightmap-preview-canvas" :class="{empty: !previewStats}"></canvas>
          <div v-if="!previewStats" class="heightmap-preview-placeholder">选择本地图片后预览</div>
        </div>

        <UiMetricGrid :metrics="previewMetrics" class-name="heightmap-preview-metrics" />

        <div class="heightmap-import-fields">
          <UiSliderField
            label="最低高度"
            input-id="heightmap-import-min"
            output-id="heightmap-import-min-value"
            field-class="heightmap-import-field"
            value-tag="output"
            :model-value="heightmapImportMin"
            :min="0"
            :max="99"
            :step="1"
            @input="setHeightmapImportMin"
          />
          <UiSliderField
            label="最高高度"
            input-id="heightmap-import-max"
            output-id="heightmap-import-max-value"
            field-class="heightmap-import-field"
            value-tag="output"
            :model-value="heightmapImportMax"
            :min="1"
            :max="100"
            :step="1"
            @input="setHeightmapImportMax"
          />
          <UiSwitchField
            label="反转黑白"
            input-id="heightmap-import-invert"
            field-class="heightmap-import-check"
            :checked="heightmapImportInvert"
            @change="heightmapImportInvert = $event"
          />
          <UiSelectField
            label="适应方式"
            input-id="heightmap-import-fit"
            class-name="heightmap-import-select"
            :model-value="heightmapImportFit"
            :options="heightmapFitOptions"
            @update:model-value="heightmapImportFit = $event"
          />
          <UiSelectField
            label="色板上限"
            class-name="heightmap-import-select"
            :model-value="heightmapColorLimit"
            :options="heightmapColorLimitOptions"
            @update:model-value="setHeightmapColorLimit"
          />
          <UiSelectField
            label="映射模式"
            class-name="heightmap-import-select"
            :model-value="heightmapMappingMode"
            :options="heightmapMappingModeOptions"
            @update:model-value="setHeightmapMappingMode"
          />
        </div>

        <section class="heightmap-palette-section" aria-label="量化色板">
          <header class="heightmap-palette-header">
            <strong>量化色板</strong>
            <span>{{ paletteSummary }}</span>
          </header>
          <div v-if="previewPalette.length" class="heightmap-palette-grid">
            <button
              v-for="entry in previewPalette"
              :key="entry.key"
              type="button"
              class="heightmap-palette-swatch"
              :class="{active: selectedPaletteKey === entry.key}"
              :title="`${entry.hex} / ${entry.pixels} px / 高度 ${entry.height}${entry.manual ? ' / 手动' : ''}`"
              @click="selectPaletteEntry(entry.key)"
            >
              <i :style="{backgroundColor: entry.hex}"></i>
              <span>{{ entry.hex }}</span>
              <small>{{ entry.percent }} / h {{ entry.height }}{{ entry.manual ? " 手动" : "" }}</small>
            </button>
          </div>
          <p v-else class="heightmap-palette-empty">选择图片后生成采样色板。</p>
        </section>

        <section v-if="selectedPaletteEntry" class="heightmap-assignment-panel" aria-label="色块高度赋值">
          <header>
            <span class="heightmap-assignment-color" :style="{backgroundColor: selectedPaletteEntry.hex}"></span>
            <strong>{{ selectedPaletteEntry.hex }}</strong>
            <span>{{ selectedPaletteEntry.manual ? "手动高度" : `自动高度 ${selectedPaletteEntry.autoHeight}` }}</span>
          </header>
          <UiSliderField
            label="色块高度"
            field-class="heightmap-assignment-slider"
            :model-value="selectedPaletteEntry.height"
            :min="0"
            :max="100"
            :step="1"
            @input="setSelectedPaletteHeight"
          />
          <div class="heightmap-assignment-presets">
            <UiButton
              v-for="preset in heightAssignmentPresets"
              :key="preset.value"
              variant="secondary"
              @click="assignSelectedPaletteHeight(preset.value)"
            >
              {{ preset.label }}
            </UiButton>
            <UiButton variant="secondary" @click="clearSelectedPaletteHeight">恢复自动</UiButton>
          </div>
        </section>

        <div class="heightmap-workbench-actions">
          <UiButton class="file-import-action heightmap-import-action" variant="secondary" @click="triggerHeightmapFileInput">选择图片</UiButton>
          <UiButton class="heightmap-apply-action" variant="primary" :disabled="!selectedFile" @click="applyHeightmapImport">应用到地图</UiButton>
          <UiButton variant="secondary" @click="closeImportWorkbench">取消</UiButton>
          <input id="heightmap-image-file" ref="fileInput" type="file" accept="image/*" hidden @change="onHeightmapFileChange" />
        </div>

        <p class="heightmap-preview-status" aria-live="polite">{{ previewStatus }}</p>
      </div>
    </section>
  </Teleport>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";
import UiButton from "./base/UiButton.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSwitchField from "./base/UiSwitchField.vue";
import {formatHeight, formatNumber} from "../../display-units.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "HeightPanel"
});

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  callbacks: {
    type: Object,
    default: () => ({})
  }
});

const actions = Object.freeze([
  {value: "raise", label: "抬升"},
  {value: "lower", label: "降低"},
  {value: "smooth", label: "平滑"}
]);
const heightmapFitOptions = Object.freeze([
  {value: "stretch", label: "拉伸铺满"},
  {value: "crop", label: "保持比例裁剪"}
]);
const heightmapColorLimitOptions = Object.freeze([
  {value: 16, label: "16 色"},
  {value: 32, label: "32 色"},
  {value: 64, label: "64 色"},
  {value: 128, label: "128 色"}
]);
const heightmapMappingModeOptions = Object.freeze([
  {value: "grayscale", label: "灰度"},
  {value: "luminance", label: "亮度"},
  {value: "hue", label: "色相"},
  {value: "fmg-scheme", label: "FMG 色带"},
  {value: "manual", label: "手动"}
]);
const heightAssignmentPresets = Object.freeze([
  {value: 8, label: "水域"},
  {value: 28, label: "低地"},
  {value: 45, label: "丘陵"},
  {value: 68, label: "山地"},
  {value: 92, label: "峰值"}
]);
const fmgHeightColorStops = Object.freeze([
  {height: 8, color: [38, 92, 145]},
  {height: 18, color: [63, 126, 174]},
  {height: 24, color: [88, 142, 76]},
  {height: 42, color: [135, 157, 82]},
  {height: 58, color: [158, 127, 72]},
  {height: 76, color: [128, 118, 106]},
  {height: 92, color: [232, 228, 212]}
]);
const unitPreferences = useUnitPreferences();
const heightmapImportMin = ref(0);
const heightmapImportMax = ref(100);
const heightmapImportInvert = ref(false);
const heightmapImportFit = ref("stretch");
const heightmapColorLimit = ref(32);
const heightmapMappingMode = ref("grayscale");
const workbenchOpen = ref(false);
const fileInput = ref(null);
const previewCanvas = ref(null);
const previewImage = ref(null);
const selectedFile = ref(null);
const previewStats = ref(null);
const previewPalette = ref([]);
const selectedPaletteKey = ref(null);
const manualAssignments = ref({});
const previewStatus = ref("尚未选择图片");
const workbenchPosition = ref({left: 760, top: 110});
let dragState = null;

const summaryMetrics = computed(() => [
  {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
  {label: "影响", value: formatNumber(props.state.lastAffected, unitPreferences.value)},
  {label: "高度", value: formatHeightRange(props.state.lastHeight)},
  {label: "历史", value: props.state.history ? `undo ${props.state.history.undo} / redo ${props.state.history.redo}` : "none"}
]);

const targetSizeLabel = computed(() => `${Number(props.state.graphWidth) || 1440} x ${Number(props.state.graphHeight) || 960}`);
const workbenchStyle = computed(() => ({
  left: `${workbenchPosition.value.left}px`,
  top: `${workbenchPosition.value.top}px`,
  maxHeight: `calc(100vh - ${workbenchPosition.value.top + 8}px)`
}));
const previewMetrics = computed(() => [
  {label: "图片", value: previewStats.value?.filename || "未选择"},
  {label: "图片尺寸", value: previewStats.value ? `${previewStats.value.imageWidth} x ${previewStats.value.imageHeight}` : "-"},
  {label: "目标图幅", value: targetSizeLabel.value},
  {label: "亮度范围", value: previewStats.value ? `${previewStats.value.brightnessMin} - ${previewStats.value.brightnessMax}` : "-"},
  {label: "色板", value: previewStats.value ? `${previewStats.value.paletteColors} / ${previewStats.value.paletteBuckets}` : "-"},
  {label: "映射模式", value: mappingModeLabel(heightmapMappingMode.value)},
  {label: "高度映射", value: `${heightmapImportMin.value} - ${heightmapImportMax.value}`},
  {label: "适应方式", value: heightmapImportFit.value === "crop" ? "保持比例裁剪" : "拉伸铺满"}
]);
const paletteSummary = computed(() => {
  if (!previewPalette.value.length) return "未生成";
  const selected = previewPalette.value.find(entry => entry.key === selectedPaletteKey.value);
  if (selected) return `${previewPalette.value.length} 色，已高亮 ${selected.hex}`;
  return `${previewPalette.value.length} 色，点击色块高亮区域`;
});
const selectedPaletteEntry = computed(() => previewPalette.value.find(entry => entry.key === selectedPaletteKey.value) || null);

watch([heightmapImportMin, heightmapImportMax, heightmapImportInvert, heightmapImportFit, heightmapColorLimit, heightmapMappingMode], () => {
  drawPreview();
});

onBeforeUnmount(() => {
  removeDragListeners();
});

function setActive(active) {
  props.state.active = active;
  props.callbacks.onActiveChange?.(active);
}

function setAction(action) {
  props.state.action = action;
}

function setRadius(radius) {
  props.state.radius = radius;
}

function setStrength(strength) {
  props.state.strength = strength;
}

function setFalloff(falloff) {
  props.state.falloff = falloff;
}

function setHeightmapImportMin(value) {
  heightmapImportMin.value = Math.min(Number(value) || 0, heightmapImportMax.value - 1);
}

function setHeightmapImportMax(value) {
  heightmapImportMax.value = Math.max(Number(value) || 100, heightmapImportMin.value + 1);
}

function setHeightmapColorLimit(value) {
  const next = Number(value);
  heightmapColorLimit.value = [16, 32, 64, 128].includes(next) ? next : 32;
}

function setHeightmapMappingMode(value) {
  heightmapMappingMode.value = heightmapMappingModeOptions.some(option => option.value === value) ? value : "grayscale";
}

function openImportWorkbench() {
  workbenchOpen.value = true;
  nextTick(() => drawPreview());
}

function closeImportWorkbench() {
  workbenchOpen.value = false;
  removeDragListeners();
}

function triggerHeightmapFileInput() {
  if (!fileInput.value) return;
  fileInput.value.value = "";
  fileInput.value.click();
}

async function onHeightmapFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    previewStatus.value = "正在读取图片...";
    selectedFile.value = file;
    previewImage.value = await loadPreviewImage(file);
    selectedPaletteKey.value = null;
    manualAssignments.value = {};
    await nextTick();
    drawPreview();
    previewStatus.value = "预览已更新，点击应用后才会重建地图。";
  } catch (error) {
    selectedFile.value = null;
    previewImage.value = null;
    previewStats.value = null;
    previewPalette.value = [];
    selectedPaletteKey.value = null;
    manualAssignments.value = {};
    clearPreviewCanvas();
    previewStatus.value = `图片预览失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

function applyHeightmapImport() {
  if (!selectedFile.value) {
    previewStatus.value = "请先选择一张图片。";
    return;
  }
  document.dispatchEvent(new CustomEvent("heightmap-import-apply", {
    detail: {
      file: selectedFile.value,
      settings: createHeightmapImportSettings()
    }
  }));
  previewStatus.value = "已提交导入任务。";
  closeImportWorkbench();
}

function createHeightmapImportSettings() {
  const assignments = previewPalette.value.map(entry => ({
    key: entry.key,
    color: entry.hex,
    height: entry.height,
    autoHeight: entry.autoHeight,
    pixels: entry.pixels,
    manual: entry.manual
  }));
  const hasManualAssignments = assignments.some(entry => entry.manual);
  const shouldUsePalette = heightmapMappingMode.value !== "grayscale" || hasManualAssignments;
  return {
    kind: shouldUsePalette ? "image-palette" : "image-grayscale",
    minHeight: heightmapImportMin.value,
    maxHeight: heightmapImportMax.value,
    invert: heightmapImportInvert.value,
    fitMode: heightmapImportFit.value,
    colorLimit: heightmapColorLimit.value,
    mappingMode: heightmapMappingMode.value,
    unassignedHeight: 0,
    assignments
  };
}

function drawPreview() {
  const image = previewImage.value;
  const canvas = previewCanvas.value;
  if (!image || !canvas) {
    clearPreviewCanvas();
    return;
  }
  const size = previewSize();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) return;
  context.clearRect(0, 0, size.width, size.height);
  drawImageToCanvas(context, image, size.width, size.height, heightmapImportFit.value);
  const imageData = context.getImageData(0, 0, size.width, size.height);
  const brightness = readBrightnessStats(imageData.data, heightmapImportInvert.value);
  const palette = quantizePalette(imageData.data, heightmapColorLimit.value, brightness);
  previewPalette.value = palette.entries;
  if (!previewPalette.value.some(entry => entry.key === selectedPaletteKey.value)) selectedPaletteKey.value = null;
  if (selectedPaletteKey.value !== null) {
    applyPaletteHighlight(imageData.data, selectedPaletteKey.value);
    context.putImageData(imageData, 0, 0);
  }
  previewStats.value = {
    filename: selectedFile.value?.name || "本地图片",
    imageWidth: image.naturalWidth || image.width || 0,
    imageHeight: image.naturalHeight || image.height || 0,
    brightnessMin: Math.round(brightness.min),
    brightnessMax: Math.round(brightness.max),
    paletteColors: palette.entries.length,
    paletteBuckets: palette.bucketCount
  };
}

function clearPreviewCanvas() {
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

function previewSize() {
  const ratio = Math.max(0.1, (Number(props.state.graphWidth) || 1440) / (Number(props.state.graphHeight) || 960));
  let width = 380;
  let height = Math.round(width / ratio);
  if (height > 230) {
    height = 230;
    width = Math.round(height * ratio);
  }
  return {width: Math.max(160, width), height: Math.max(120, height)};
}

function drawImageToCanvas(context, image, width, height, fitMode) {
  if (fitMode !== "crop") {
    context.drawImage(image, 0, 0, width, height);
    return;
  }
  const imageWidth = Math.max(1, image.naturalWidth || image.width || width);
  const imageHeight = Math.max(1, image.naturalHeight || image.height || height);
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

function readBrightnessStats(data, invert) {
  let min = Infinity;
  let max = -Infinity;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    const red = data[offset] * alpha + 255 * (1 - alpha);
    const green = data[offset + 1] * alpha + 255 * (1 - alpha);
    const blue = data[offset + 2] * alpha + 255 * (1 - alpha);
    const raw = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const value = invert ? 255 - raw : raw;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {min: 0, max: 255};
  return {min, max};
}

function quantizePalette(data, limit, brightnessStats) {
  const buckets = new Map();
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = compositedRgb(data, offset);
    const key = colorBucketKey(color.red, color.green, color.blue);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {key, pixels: 0, red: 0, green: 0, blue: 0, brightness: 0};
      buckets.set(key, bucket);
    }
    const brightness = heightmapImportInvert.value ? 255 - color.brightness : color.brightness;
    bucket.pixels += 1;
    bucket.red += color.red;
    bucket.green += color.green;
    bucket.blue += color.blue;
    bucket.brightness += brightness;
  }

  const totalPixels = Math.max(1, data.length / 4);
  const range = Math.max(1e-6, brightnessStats.max - brightnessStats.min);
  const maxEntries = clamp(Number(limit) || 32, 1, 128);
  const entries = Array.from(buckets.values())
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, maxEntries)
    .map(bucket => {
      const color = {
        red: bucket.red / bucket.pixels,
        green: bucket.green / bucket.pixels,
        blue: bucket.blue / bucket.pixels,
        brightness: bucket.brightness / bucket.pixels
      };
      const autoHeight = automaticHeightForColor(color, brightnessStats, range);
      const manualHeight = manualAssignments.value[String(bucket.key)];
      const manual = Number.isFinite(manualHeight);
      const height = manual ? manualHeight : autoHeight;
      return {
        key: bucket.key,
        pixels: bucket.pixels,
        percent: `${((bucket.pixels / totalPixels) * 100).toFixed(bucket.pixels / totalPixels > 0.1 ? 0 : 1)}%`,
        hex: rgbToHex(color.red, color.green, color.blue),
        autoHeight,
        height,
        manual
      };
    });
  return {entries, bucketCount: buckets.size};
}

function automaticHeightForColor(color, brightnessStats, brightnessRange) {
  if (heightmapMappingMode.value === "manual") return 0;
  if (heightmapMappingMode.value === "hue") return hueMappedHeight(color);
  if (heightmapMappingMode.value === "fmg-scheme") return nearestFmgHeight(color);
  const normalized = clamp((color.brightness - brightnessStats.min) / brightnessRange, 0, 1);
  if (heightmapMappingMode.value === "luminance") {
    const adjusted = normalized < 0.18 ? normalized * 0.7 : 0.2 + Math.pow((normalized - 0.18) / 0.82, 0.92) * 0.8;
    return scaledHeight(adjusted);
  }
  return scaledHeight(normalized);
}

function scaledHeight(normalized) {
  return Math.round(heightmapImportMin.value + clamp(normalized, 0, 1) * (heightmapImportMax.value - heightmapImportMin.value));
}

function hueMappedHeight(color) {
  const hsl = rgbToHsl(color.red, color.green, color.blue);
  if (hsl.saturation < 0.12) return scaledHeight(Math.pow(hsl.lightness, 1.25));
  const hue = hsl.hue;
  if (hue >= 185 && hue <= 255) return scaledHeight(0.04 + clamp((hsl.lightness - 0.18) / 0.7, 0, 1) * 0.16);
  if (hue >= 70 && hue < 185) return scaledHeight(0.24 + clamp(hsl.lightness, 0, 1) * 0.32);
  if (hue >= 25 && hue < 70) return scaledHeight(0.42 + clamp(hsl.lightness, 0, 1) * 0.3);
  return scaledHeight(0.52 + clamp(hsl.lightness, 0, 1) * 0.42);
}

function nearestFmgHeight(color) {
  let best = fmgHeightColorStops[0];
  let bestDistance = Infinity;
  for (const stop of fmgHeightColorStops) {
    const distance = colorDistance(color, stop.color);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stop;
    }
  }
  return clamp(Math.round(best.height), heightmapImportMin.value, heightmapImportMax.value);
}

function selectPaletteEntry(key) {
  selectedPaletteKey.value = selectedPaletteKey.value === key ? null : key;
  drawPreview();
}

function setSelectedPaletteHeight(value) {
  assignSelectedPaletteHeight(value);
}

function assignSelectedPaletteHeight(value) {
  if (selectedPaletteKey.value === null) return;
  const height = clamp(Math.round(Number(value) || 0), 0, 100);
  manualAssignments.value = {
    ...manualAssignments.value,
    [String(selectedPaletteKey.value)]: height
  };
  drawPreview();
}

function clearSelectedPaletteHeight() {
  if (selectedPaletteKey.value === null) return;
  const next = {...manualAssignments.value};
  delete next[String(selectedPaletteKey.value)];
  manualAssignments.value = next;
  drawPreview();
}

function applyPaletteHighlight(data, selectedKey) {
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = compositedRgb(data, offset);
    const matched = colorBucketKey(color.red, color.green, color.blue) === selectedKey;
    if (matched) {
      data[offset] = clamp(data[offset] * 1.08 + 18, 0, 255);
      data[offset + 1] = clamp(data[offset + 1] * 1.08 + 18, 0, 255);
      data[offset + 2] = clamp(data[offset + 2] * 1.08 + 18, 0, 255);
    } else {
      data[offset] = data[offset] * 0.34 + 5;
      data[offset + 1] = data[offset + 1] * 0.34 + 9;
      data[offset + 2] = data[offset + 2] * 0.34 + 11;
    }
  }
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
  const r = clamp(red, 0, 255) / 255;
  const g = clamp(green, 0, 255) / 255;
  const b = clamp(blue, 0, 255) / 255;
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
  const dr = color.red - target[0];
  const dg = color.green - target[1];
  const db = color.blue - target[2];
  return dr * dr * 0.3 + dg * dg * 0.5 + db * db * 0.2;
}

function mappingModeLabel(value) {
  return heightmapMappingModeOptions.find(option => option.value === value)?.label || "灰度";
}

function hexByte(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function loadPreviewImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function startWorkbenchDrag(event) {
  if (event.button !== 0 || event.target.closest("button")) return;
  event.preventDefault();
  const view = document.defaultView || window;
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    startLeft: workbenchPosition.value.left,
    startTop: workbenchPosition.value.top
  };
  view.addEventListener("pointermove", onWorkbenchDrag);
  view.addEventListener("pointerup", stopWorkbenchDrag);
  view.addEventListener("pointercancel", stopWorkbenchDrag);
}

function onWorkbenchDrag(event) {
  if (!dragState) return;
  const view = document.defaultView || window;
  const nextLeft = dragState.startLeft + event.clientX - dragState.startX;
  const nextTop = dragState.startTop + event.clientY - dragState.startY;
  workbenchPosition.value = {
    left: clamp(nextLeft, 8, Math.max(8, (view.innerWidth || 1024) - 468)),
    top: clamp(nextTop, 8, Math.max(8, (view.innerHeight || 768) - 260))
  };
}

function stopWorkbenchDrag() {
  dragState = null;
  removeDragListeners();
}

function removeDragListeners() {
  const view = document.defaultView || window;
  view.removeEventListener("pointermove", onWorkbenchDrag);
  view.removeEventListener("pointerup", stopWorkbenchDrag);
  view.removeEventListener("pointercancel", stopWorkbenchDrag);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatHeightRange(value) {
  if (typeof value !== "string" || value === "none") return value || "none";
  const parts = value.split("..").map(part => Number(part));
  if (parts.length !== 2 || parts.some(part => !Number.isFinite(part))) return value;
  return `${formatHeight(parts[0], unitPreferences.value)} .. ${formatHeight(parts[1], unitPreferences.value)}`;
}
</script>
