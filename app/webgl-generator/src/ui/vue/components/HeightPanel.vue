<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="height-panel-summary" />

  <UiButton :variant="state.active ? 'primary' : 'secondary'" @click="setActive(!state.active)">
    {{ state.active ? "停止高度编辑" : "启用高度编辑" }}
  </UiButton>

  <UiSegmented class="height-action-group" label="高度编辑动作" :options="actions" :model-value="state.action" @select="setAction" />
  <p v-if="state.action === 'flatten'" class="height-action-help">以每次落笔起点高度为目标，拖动时逐步整平范围内地形。</p>

  <UiSliderField label="半径" :model-value="state.radius" :min="6" :max="96" :step="2" @input="setRadius" />
  <UiSliderField label="强度" :model-value="state.strength" :min="1" :max="18" :step="1" @input="setStrength" />

  <UiSwitchField label="中心衰减" field-class="height-check-row" :checked="state.falloff" @change="setFalloff" />

  <div class="height-history-actions">
    <UiButton variant="secondary" @click="callbacks.onUndo?.()">撤销上次</UiButton>
    <UiButton variant="secondary" @click="callbacks.onRedo?.()">重做上次</UiButton>
    <UiButton variant="secondary" @click="callbacks.onRegenerateRivers?.()">重算河流</UiButton>
    <UiButton variant="secondary" @click="callbacks.onRegenerateBase?.()">重算基础派生</UiButton>
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

        <section v-if="profileMatchStats" class="heightmap-profile-section" aria-label="导入配置匹配">
          <header>
            <strong>导入配置匹配</strong>
            <span>{{ profileMatchSummary }}</span>
          </header>
          <UiMetricGrid :metrics="profileMatchMetrics" class-name="heightmap-profile-metrics" />
          <div v-if="profileMismatchVisible" class="heightmap-profile-mismatch">
            <div v-if="profileMissingPreview.length" class="heightmap-profile-mismatch-group">
              <span>未匹配配置色</span>
              <div>
                <span v-for="entry in profileMissingPreview" :key="`missing-${entry.key}`" class="heightmap-profile-chip">
                  <i :style="{backgroundColor: entry.color}"></i>
                  {{ entry.color }}
                </span>
              </div>
            </div>
            <div v-if="profileCurrentOnlyPreview.length" class="heightmap-profile-mismatch-group">
              <span>当前额外色</span>
              <div>
                <span
                  v-for="entry in profileCurrentOnlyPreview"
                  :key="`extra-${entry.key}`"
                  class="heightmap-profile-extra-entry"
                >
                  <button
                    type="button"
                    class="heightmap-profile-chip heightmap-profile-chip-button"
                    @click="selectPaletteEntry(entry.key)"
                  >
                    <i :style="{backgroundColor: entry.hex}"></i>
                    {{ entry.hex }}
                  </button>
                  <UiButton variant="secondary" @click="addCurrentOnlyProfileEntry(entry)">加入</UiButton>
                </span>
              </div>
            </div>
          </div>
          <p v-if="profileExportSummary" class="heightmap-profile-export-summary">{{ profileExportSummary }}</p>
        </section>

        <section v-if="previewHistogram.length" class="heightmap-histogram-section" aria-label="亮度直方图">
          <header>
            <strong>亮度直方图</strong>
            <span>{{ histogramSummary }}</span>
          </header>
          <div class="heightmap-histogram-bars">
            <i
              v-for="bin in histogramBars"
              :key="bin.index"
              :style="{height: `${bin.height}%`}"
              :title="bin.title"
            ></i>
          </div>
          <div class="heightmap-histogram-axis">
            <span>暗</span>
            <span>亮</span>
          </div>
        </section>

        <section v-show="previewStats" class="heightmap-band-section" aria-label="采样格高度色带预览">
          <header>
            <strong>高度色带预览</strong>
            <span>{{ heightBandSummary }}</span>
          </header>
          <canvas ref="heightBandCanvas" class="heightmap-band-canvas"></canvas>
        </section>

        <section v-if="comparisonMetrics.length" class="heightmap-comparison-section" aria-label="应用前后对比">
          <header>
            <strong>应用前后对比</strong>
            <span>{{ comparisonSummary }}</span>
          </header>
          <UiMetricGrid :metrics="comparisonMetrics" class-name="heightmap-comparison-metrics" />
        </section>

        <section v-show="previewStats" class="heightmap-difference-section" aria-label="高度差值热力图">
          <header>
            <strong>差值热力图</strong>
            <span>{{ heightDifferenceSummary }}</span>
          </header>
          <canvas ref="heightDifferenceCanvas" class="heightmap-difference-canvas"></canvas>
        </section>

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
            input-id="heightmap-color-limit"
            class-name="heightmap-import-select"
            :model-value="heightmapColorLimit"
            :options="heightmapColorLimitOptions"
            @update:model-value="setHeightmapColorLimit"
          />
          <UiSelectField
            label="映射模式"
            input-id="heightmap-mapping-mode"
            class-name="heightmap-import-select"
            :model-value="heightmapMappingMode"
            :options="heightmapMappingModeOptions"
            @update:model-value="setHeightmapMappingMode"
          />
          <UiSliderField
            label="未分配高度"
            input-id="heightmap-unassigned-height"
            field-class="heightmap-import-field"
            :model-value="heightmapUnassignedHeight"
            :min="0"
            :max="100"
            :step="1"
            @input="setHeightmapUnassignedHeight"
          />
          <UiSelectField
            label="未分配颜色"
            input-id="heightmap-unassigned-strategy"
            class-name="heightmap-import-select"
            :model-value="heightmapUnassignedStrategy"
            :options="heightmapUnassignedStrategyOptions"
            @update:model-value="setHeightmapUnassignedStrategy"
          />
        </div>

        <section class="heightmap-palette-section" aria-label="量化色板">
          <header class="heightmap-palette-header">
            <strong>量化色板</strong>
            <span>{{ paletteSummary }}</span>
          </header>
          <div v-if="previewPalette.length" class="heightmap-palette-toolbar">
            <span>{{ batchPaletteSummary }}</span>
            <UiButton variant="secondary" @click="selectAllBatchPalette">全选</UiButton>
            <UiButton variant="secondary" :disabled="!batchPaletteKeys.length" @click="clearBatchPaletteSelection">清空</UiButton>
          </div>
          <div v-if="previewPalette.length" class="heightmap-palette-grid">
            <div
              v-for="entry in previewPalette"
              :key="entry.key"
              class="heightmap-palette-item"
              :class="{selected: isBatchPaletteSelected(entry.key)}"
            >
              <label class="heightmap-palette-checkbox">
                <input
                  type="checkbox"
                  :aria-label="`批量选择 ${entry.hex}`"
                  :checked="isBatchPaletteSelected(entry.key)"
                  @change="toggleBatchPaletteEntry(entry.key, $event.target.checked)"
                />
              </label>
              <button
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
          </div>
          <p v-else class="heightmap-palette-empty">选择图片后生成采样色板。</p>
        </section>

        <section v-if="batchSelectedEntries.length" class="heightmap-assignment-panel" aria-label="批量色块高度赋值">
          <header>
            <strong>批量赋高</strong>
            <span>{{ batchSelectedEntries.length }} 色</span>
          </header>
          <UiSliderField
            label="批量高度"
            field-class="heightmap-assignment-slider"
            :model-value="batchAssignmentHeight"
            :min="0"
            :max="100"
            :step="1"
            @input="setBatchPaletteHeight"
          />
          <div class="heightmap-assignment-presets">
            <UiButton
              v-for="preset in heightAssignmentPresets"
              :key="preset.value"
              variant="secondary"
              @click="assignBatchPaletteHeight(preset.value)"
            >
              {{ preset.label }}
            </UiButton>
            <UiButton variant="secondary" @click="clearBatchPaletteHeight">恢复自动</UiButton>
          </div>
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
          <div v-if="selectedPaletteInProfile" class="heightmap-profile-selected-actions">
            <UiButton variant="secondary" @click="removeSelectedProfileEntry">从配置移除</UiButton>
          </div>
        </section>

        <section v-if="pendingUnassignedBlocked && pendingPalette.length" class="heightmap-pending-section" aria-label="待处理颜色">
          <header class="heightmap-pending-header">
            <div>
              <strong>待处理颜色</strong>
              <span>{{ pendingPaletteSummary }}</span>
            </div>
            <div class="heightmap-pending-actions">
              <UiButton variant="secondary" :disabled="!canPagePendingPaletteBack" @click="changePendingPalettePage(-1)">上一页</UiButton>
              <UiButton variant="secondary" :disabled="!canPagePendingPaletteForward" @click="changePendingPalettePage(1)">下一页</UiButton>
              <UiButton variant="secondary" @click="promoteVisiblePendingPaletteEntries">加入显示色</UiButton>
              <UiButton v-if="canExpandColorLimit" variant="secondary" @click="expandHeightmapColorLimit">扩大色板</UiButton>
            </div>
          </header>
          <div class="heightmap-pending-grid">
            <div v-for="entry in pendingPalette" :key="entry.key" class="heightmap-pending-item">
              <i :style="{backgroundColor: entry.hex}"></i>
              <span>{{ entry.hex }}</span>
              <small>{{ entry.percent }} / {{ formatNumber(entry.pixels, unitPreferences) }} px</small>
              <UiButton variant="secondary" @click="promotePendingPaletteEntry(entry)">加入</UiButton>
            </div>
          </div>
        </section>

        <div class="heightmap-workbench-actions">
          <UiPanelIoActions
            class-name="heightmap-workbench-io-actions"
            label="高度图导入导出"
            :export-actions="heightmapWorkbenchExportActions"
            :import-actions="heightmapWorkbenchImportActions"
            @export="handleHeightmapWorkbenchExport"
            @import="handleHeightmapWorkbenchImport"
          />
          <UiButton class="heightmap-apply-action" variant="primary" :disabled="!canApplyHeightmap" @click="applyHeightmapImport">应用到地图</UiButton>
          <UiButton variant="secondary" @click="closeImportWorkbench">取消</UiButton>
        </div>

        <p v-if="pendingUnassignedWarning" class="heightmap-pending-warning">{{ pendingUnassignedWarning }}</p>
        <p class="heightmap-preview-status" aria-live="polite">{{ previewStatus }}</p>
      </div>
    </section>
  </Teleport>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";
import UiButton from "./base/UiButton.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
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
  {value: "smooth", label: "平滑"},
  {value: "flatten", label: "整平"}
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
const heightmapUnassignedStrategyOptions = Object.freeze([
  {value: "fixed-height", label: "固定高度"},
  {value: "nearest-palette", label: "合并最近色"},
  {value: "mark-pending", label: "标记待处理"}
]);
const heightAssignmentPresets = Object.freeze([
  {value: 8, label: "水域"},
  {value: 28, label: "低地"},
  {value: 45, label: "丘陵"},
  {value: 68, label: "山地"},
  {value: 92, label: "峰值"}
]);
const derivedSystemLabels = Object.freeze({
  rivers: "河流",
  routes: "路线",
  biomes: "生物群系",
  cities: "聚落",
  states: "国家",
  provinces: "省份",
  religions: "宗教",
  markers: "标记",
  zones: "地区",
  military: "军事",
  economy: "经济",
  diplomacy: "外交"
});
const heightmapProfileDocumentType = "webgl-generator-heightmap-import-profile";
const heightmapProfileDocumentVersion = 1;
const pendingPalettePageSize = 12;
const fmgHeightColorStops = Object.freeze([
  {height: 8, color: [38, 92, 145]},
  {height: 18, color: [63, 126, 174]},
  {height: 24, color: [88, 142, 76]},
  {height: 42, color: [135, 157, 82]},
  {height: 58, color: [158, 127, 72]},
  {height: 76, color: [128, 118, 106]},
  {height: 92, color: [232, 228, 212]}
]);
const heightPreviewStops = Object.freeze([
  {height: 0, color: [28, 65, 111]},
  {height: 18, color: [58, 117, 169]},
  {height: 22, color: [91, 139, 73]},
  {height: 45, color: [145, 158, 83]},
  {height: 65, color: [158, 127, 72]},
  {height: 82, color: [128, 118, 106]},
  {height: 100, color: [236, 232, 218]}
]);
const unitPreferences = useUnitPreferences();
const heightmapImportMin = ref(0);
const heightmapImportMax = ref(100);
const heightmapImportInvert = ref(false);
const heightmapImportFit = ref("stretch");
const heightmapColorLimit = ref(32);
const heightmapMappingMode = ref("grayscale");
const heightmapUnassignedHeight = ref(0);
const heightmapUnassignedStrategy = ref("fixed-height");
const workbenchOpen = ref(false);
const previewCanvas = ref(null);
const heightBandCanvas = ref(null);
const heightDifferenceCanvas = ref(null);
const previewImage = ref(null);
const selectedFile = ref(null);
const previewStats = ref(null);
const previewHistogram = ref([]);
const heightBandStats = ref(null);
const heightDifferenceStats = ref(null);
const previewPalette = ref([]);
const pendingPalette = ref([]);
const pendingPalettePage = ref(0);
const pendingPalettePageCount = ref(0);
const selectedPaletteKey = ref(null);
const batchPaletteKeys = ref([]);
const batchAssignmentHeight = ref(45);
const manualAssignments = ref({});
const importedProfileKeys = ref([]);
const importedProfileAssignments = ref([]);
const importedProfileName = ref("");
const profileMatchStats = ref(null);
const previewStatus = ref("尚未选择图片");
const workbenchPosition = ref({left: 760, top: 110});
let dragState = null;
let latestHeightBandSamples = null;

const summaryMetrics = computed(() => {
  const current = props.state.currentHeightStats;
  return [
    {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
    {label: "影响", value: formatNumber(props.state.lastAffected, unitPreferences.value)},
    {label: "高度", value: formatHeightRange(props.state.lastHeight)},
    {label: "均变", value: formatSignedHeightDelta(props.state.lastDelta)},
    {label: "待派生", value: formatDerivedStaleSystems(props.state.derivedStaleSystems)},
    {label: "历史", value: props.state.history ? `undo ${props.state.history.undo} / redo ${props.state.history.redo}` : "none"},
    {label: "当前均高", value: current ? formatHeight(current.average, unitPreferences.value) : "-"},
    {label: "陆地", value: current ? formatPercent(current.land / current.total) : "-"},
    {label: "低地", value: current ? formatPercent(current.lowland / current.total) : "-"},
    {label: "山地", value: current ? formatPercent(current.mountain / current.total) : "-"},
    {label: "海平面带", value: current ? formatPercent(current.seaLevelBand / current.total) : "-"}
  ];
});

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
  {label: "未分配高度", value: heightmapUnassignedHeight.value},
  {label: "未分配颜色", value: unassignedStrategyLabel(heightmapUnassignedStrategy.value)},
  {label: "配置匹配", value: profileMatchStats.value ? `${profileMatchStats.value.matched}/${profileMatchStats.value.profileTotal}` : "-"},
  {label: "适应方式", value: heightmapImportFit.value === "crop" ? "保持比例裁剪" : "拉伸铺满"}
]);
const paletteSummary = computed(() => {
  if (!previewPalette.value.length) return "未生成";
  const selected = previewPalette.value.find(entry => entry.key === selectedPaletteKey.value);
  if (selected) return `${previewPalette.value.length} 色，已高亮 ${selected.hex}`;
  return `${previewPalette.value.length} 色，点击色块高亮区域`;
});
const selectedPaletteEntry = computed(() => previewPalette.value.find(entry => entry.key === selectedPaletteKey.value) || null);
const selectedPaletteInProfile = computed(() => (
  selectedPaletteKey.value !== null && importedProfileKeys.value.includes(String(selectedPaletteKey.value))
));
const usesPaletteImport = computed(() => heightmapMappingMode.value !== "grayscale" || previewPalette.value.some(entry => entry.manual));
const heightmapWorkbenchExportActions = computed(() => [
  {key: "profile", label: "导出配置", disabled: !previewPalette.value.length}
]);
const heightmapWorkbenchImportActions = Object.freeze([
  {key: "image", label: "选择图片", accept: "image/*"},
  {key: "profile", label: "导入配置", accept: ".heightmap-import-profile.json,.json,application/json"}
]);
const pendingUnassignedBlocked = computed(() => (
  usesPaletteImport.value &&
  heightmapUnassignedStrategy.value === "mark-pending" &&
  Number(previewStats.value?.unassignedPixels || 0) > 0
));
const canApplyHeightmap = computed(() => Boolean(selectedFile.value) && !pendingUnassignedBlocked.value);
const canExpandColorLimit = computed(() => nextColorLimit(heightmapColorLimit.value) > heightmapColorLimit.value);
const canPagePendingPaletteBack = computed(() => pendingPalettePage.value > 0);
const canPagePendingPaletteForward = computed(() => pendingPalettePage.value + 1 < pendingPalettePageCount.value);
const pendingUnassignedWarning = computed(() => {
  if (!pendingUnassignedBlocked.value) return "";
  const pixels = formatNumber(previewStats.value.unassignedPixels, unitPreferences.value);
  const buckets = formatNumber(previewStats.value.unassignedBuckets, unitPreferences.value);
  return `仍有 ${pixels} 个像素、${buckets} 个颜色桶待处理；请扩大色板上限、改为合并最近色，或切回固定高度后再应用。`;
});
const pendingPaletteSummary = computed(() => {
  const stats = previewStats.value;
  if (!stats) return "未生成";
  const shown = pendingPalette.value.length;
  if (pendingPalettePageCount.value > 1) {
    return `第 ${pendingPalettePage.value + 1}/${pendingPalettePageCount.value} 页，显示 ${shown} 色 / 共 ${formatNumber(stats.unassignedBuckets, unitPreferences.value)} 桶`;
  }
  return `显示 ${shown} 色 / 共 ${formatNumber(stats.unassignedBuckets, unitPreferences.value)} 桶`;
});
const batchSelectedEntries = computed(() => previewPalette.value.filter(entry => batchPaletteKeys.value.includes(entry.key)));
const batchPaletteSummary = computed(() => {
  if (!batchPaletteKeys.value.length) return "未选";
  return `已选 ${batchPaletteKeys.value.length} 色`;
});
const histogramBars = computed(() => {
  const counts = previewHistogram.value;
  const max = Math.max(...counts, 1);
  return counts.map((count, index) => ({
    index,
    height: Math.max(4, Math.round((count / max) * 100)),
    title: `${histogramBinLabel(index, counts.length)}：${formatPercent(count / histogramTotal(counts))}`
  }));
});
const histogramSummary = computed(() => {
  const counts = previewHistogram.value;
  if (!counts.length) return "未生成";
  const total = histogramTotal(counts);
  const third = Math.max(1, Math.floor(counts.length / 3));
  const low = sumHistogramRange(counts, 0, third);
  const middle = sumHistogramRange(counts, third, third * 2);
  const high = Math.max(0, total - low - middle);
  return `暗 ${formatPercent(low / total)} / 中 ${formatPercent(middle / total)} / 亮 ${formatPercent(high / total)}`;
});
const heightBandSummary = computed(() => {
  const stats = heightBandStats.value;
  if (!stats) return "未生成";
  return `高度 ${stats.min}-${stats.max} / 水域 ${formatPercent(stats.water / stats.total)}`;
});
const comparisonMetrics = computed(() => {
  const current = props.state.currentHeightStats;
  const next = heightBandStats.value;
  if (!current || !next) return [];
  return [
    {label: "当前高度", value: `${current.min}-${current.max}`},
    {label: "导入高度", value: `${next.min}-${next.max}`},
    {label: "当前水域", value: formatPercent(current.water / current.total)},
    {label: "导入水域", value: formatPercent(next.water / next.total)},
    {label: "平均变化", value: formatSignedNumber(next.average - current.average)},
    {label: "水域变化", value: formatSignedPercent(next.water / next.total - current.water / current.total)}
  ];
});
const comparisonSummary = computed(() => {
  const current = props.state.currentHeightStats;
  const next = heightBandStats.value;
  if (!current || !next) return "未生成";
  return `平均 ${formatSignedNumber(next.average - current.average)} / 水域 ${formatSignedPercent(next.water / next.total - current.water / current.total)}`;
});
const profileMatchMetrics = computed(() => {
  const stats = profileMatchStats.value;
  if (!stats) return [];
  return [
    {label: "配置色块", value: stats.profileTotal},
    {label: "已匹配", value: stats.matched},
    {label: "未匹配", value: stats.missing},
    {label: "当前额外", value: stats.currentOnly}
  ];
});
const profileMatchSummary = computed(() => {
  const stats = profileMatchStats.value;
  if (!stats) return "未导入";
  const name = stats.filename ? `${stats.filename} / ` : "";
  return `${name}匹配 ${stats.matched}/${stats.profileTotal}`;
});
const profileMismatchVisible = computed(() => Boolean(profileMissingPreview.value.length || profileCurrentOnlyPreview.value.length));
const profileMissingPreview = computed(() => profileMatchStats.value?.missingEntries?.slice(0, 8) || []);
const profileCurrentOnlyPreview = computed(() => profileMatchStats.value?.currentOnlyEntries?.slice(0, 8) || []);
const profileExportSummary = computed(() => {
  const stats = profileMatchStats.value;
  if (!stats || !importedProfileKeys.value.length) return "";
  return `导出配置将包含 ${stats.profileTotal} 色，保留 ${stats.missing} 个未匹配配置色，排除 ${stats.currentOnly} 个当前额外色。`;
});
const heightDifferenceSummary = computed(() => {
  const stats = heightDifferenceStats.value;
  if (!stats) return "未生成";
  return `升高 ${formatPercent(stats.raised / stats.total)} / 降低 ${formatPercent(stats.lowered / stats.total)} / 最大 ${formatSignedNumber(stats.maxDelta)}`;
});

watch([heightmapImportMin, heightmapImportMax, heightmapImportInvert, heightmapImportFit, heightmapColorLimit, heightmapMappingMode, heightmapUnassignedStrategy], () => {
  drawPreview();
});

watch(() => props.state.currentHeightPreview, () => {
  drawHeightDifferencePreview(latestHeightBandSamples);
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
  pendingPalettePage.value = 0;
}

function setHeightmapMappingMode(value) {
  heightmapMappingMode.value = heightmapMappingModeOptions.some(option => option.value === value) ? value : "grayscale";
  pendingPalettePage.value = 0;
}

function setHeightmapUnassignedHeight(value) {
  heightmapUnassignedHeight.value = clamp(Math.round(Number(value) || 0), 0, 100);
}

function setHeightmapUnassignedStrategy(value) {
  heightmapUnassignedStrategy.value = heightmapUnassignedStrategyOptions.some(option => option.value === value) ? value : "fixed-height";
  pendingPalettePage.value = 0;
}

function expandHeightmapColorLimit() {
  setHeightmapColorLimit(nextColorLimit(heightmapColorLimit.value));
}

function changePendingPalettePage(offset) {
  const pageCount = Math.max(1, pendingPalettePageCount.value || 1);
  pendingPalettePage.value = clamp(pendingPalettePage.value + offset, 0, pageCount - 1);
  drawPreview();
}

function promotePendingPaletteEntry(entry) {
  manualAssignments.value = {
    ...manualAssignments.value,
    [String(entry.key)]: clamp(Math.round(Number(entry.autoHeight) || 0), 0, 100)
  };
  selectedPaletteKey.value = entry.key;
  drawPreview();
}

function promoteVisiblePendingPaletteEntries() {
  if (!pendingPalette.value.length) return;
  const entries = pendingPalette.value.slice();
  const next = {...manualAssignments.value};
  for (const entry of entries) {
    next[String(entry.key)] = clamp(Math.round(Number(entry.autoHeight) || 0), 0, 100);
  }
  manualAssignments.value = next;
  selectedPaletteKey.value = entries[0].key;
  drawPreview();
  previewStatus.value = `已加入显示的 ${entries.length} 个待处理色。`;
}

function openImportWorkbench() {
  workbenchOpen.value = true;
  nextTick(() => drawPreview());
}

function closeImportWorkbench() {
  workbenchOpen.value = false;
  removeDragListeners();
}

function handleHeightmapWorkbenchExport(key) {
  if (key === "profile") exportHeightmapProfile();
}

async function handleHeightmapWorkbenchImport({key, file}) {
  if (key === "image") await onHeightmapFileChange(file);
  if (key === "profile") await onHeightmapProfileFileChange(file);
}

async function onHeightmapFileChange(file) {
  if (!file) return;
  try {
    previewStatus.value = "正在读取图片...";
    selectedFile.value = file;
    previewImage.value = await loadPreviewImage(file);
    selectedPaletteKey.value = null;
    batchPaletteKeys.value = [];
    pendingPalettePage.value = 0;
    if (!importedProfileKeys.value.length) manualAssignments.value = {};
    await nextTick();
    drawPreview();
    previewStatus.value = importedProfileKeys.value.length
      ? `预览已更新，已套用配置匹配 ${profileMatchStats.value?.matched || 0} 个色块。`
      : "预览已更新，点击应用后才会重建地图。";
  } catch (error) {
    selectedFile.value = null;
    previewImage.value = null;
    previewStats.value = null;
    previewHistogram.value = [];
    heightBandStats.value = null;
    previewPalette.value = [];
    pendingPalette.value = [];
    pendingPalettePage.value = 0;
    pendingPalettePageCount.value = 0;
    selectedPaletteKey.value = null;
    batchPaletteKeys.value = [];
    manualAssignments.value = {};
    importedProfileKeys.value = [];
    importedProfileAssignments.value = [];
    importedProfileName.value = "";
    profileMatchStats.value = null;
    clearPreviewCanvas();
    previewStatus.value = `图片预览失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

function applyHeightmapImport() {
  if (!selectedFile.value) {
    previewStatus.value = "请先选择一张图片。";
    return;
  }
  if (pendingUnassignedBlocked.value) {
    previewStatus.value = pendingUnassignedWarning.value;
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

async function onHeightmapProfileFileChange(file) {
  if (!file) return;
  try {
    const profile = parseHeightmapProfile(await file.text());
    applyHeightmapProfile(profile, file.name);
    const stats = profileMatchStats.value;
    previewStatus.value = previewPalette.value.length
      ? `已导入配置：${file.name}，匹配 ${stats?.matched || 0}/${stats?.profileTotal || 0} 个色块。`
      : `已导入配置：${file.name}，选择图片后可预览。`;
  } catch (error) {
    previewStatus.value = `配置导入失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

function exportHeightmapProfile() {
  if (!previewPalette.value.length) {
    previewStatus.value = "请先选择图片并生成色板。";
    return;
  }
  const profile = createHeightmapProfileDocument();
  const filename = `${safeFilePart(selectedFile.value?.name || "heightmap")}.heightmap-import-profile.json`;
  downloadJsonText(filename, JSON.stringify(profile, null, 2));
  previewStatus.value = `配置已导出：${filename}，${profile.assignments.length} 个色块。`;
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
  return {
    kind: usesPaletteImport.value ? "image-palette" : "image-grayscale",
    minHeight: heightmapImportMin.value,
    maxHeight: heightmapImportMax.value,
    invert: heightmapImportInvert.value,
    fitMode: heightmapImportFit.value,
    colorLimit: heightmapColorLimit.value,
    mappingMode: heightmapMappingMode.value,
    unassignedHeight: heightmapUnassignedHeight.value,
    unassignedStrategy: heightmapUnassignedStrategy.value,
    assignments
  };
}

function createHeightmapProfileDocument() {
  return {
    type: heightmapProfileDocumentType,
    version: heightmapProfileDocumentVersion,
    exportedAt: new Date().toISOString(),
    app: "fmg-webgl-reimplementation",
    settings: {
      minHeight: heightmapImportMin.value,
      maxHeight: heightmapImportMax.value,
      invert: heightmapImportInvert.value,
      fitMode: heightmapImportFit.value,
      colorLimit: heightmapColorLimit.value,
      mappingMode: heightmapMappingMode.value,
      unassignedHeight: heightmapUnassignedHeight.value,
      unassignedStrategy: heightmapUnassignedStrategy.value
    },
    assignments: createHeightmapProfileAssignments()
  };
}

function createHeightmapProfileAssignments() {
  if (!importedProfileKeys.value.length) {
    return previewPalette.value.map(profileAssignmentFromPaletteEntry);
  }
  const currentByKey = new Map(previewPalette.value.map(entry => [String(entry.key), entry]));
  const storedByKey = new Map(importedProfileAssignments.value.map(entry => [String(entry.key), entry]));
  return importedProfileKeys.value
    .map(key => profileAssignmentForKey(String(key), currentByKey, storedByKey))
    .filter(Boolean);
}

function profileAssignmentFromPaletteEntry(entry) {
  return {
    key: entry.key,
    color: entry.hex,
    height: entry.height,
    autoHeight: entry.autoHeight,
    pixels: entry.pixels,
    manual: entry.manual
  };
}

function profileAssignmentForKey(key, currentByKey, storedByKey) {
  const current = currentByKey.get(key);
  if (current) return profileAssignmentFromPaletteEntry(current);
  const stored = storedByKey.get(key);
  if (!stored) return null;
  const height = clamp(Math.round(Number(stored.height) || 0), 0, 100);
  return {
    key,
    color: stored.color,
    height,
    autoHeight: Number.isFinite(Number(stored.autoHeight)) ? clamp(Math.round(Number(stored.autoHeight)), 0, 100) : height,
    pixels: Math.max(0, Math.round(Number(stored.pixels) || 0)),
    manual: stored.manual !== false
  };
}

function parseHeightmapProfile(text) {
  const profile = JSON.parse(text);
  if (profile?.type !== heightmapProfileDocumentType) throw new Error("文件不是高度图导入配置");
  if (profile.version !== heightmapProfileDocumentVersion) throw new Error(`暂不支持的配置版本：${profile.version}`);
  if (!profile.settings || typeof profile.settings !== "object") throw new Error("配置文件缺少 settings");
  if (!Array.isArray(profile.assignments)) throw new Error("配置文件缺少 assignments");
  return profile;
}

function applyHeightmapProfile(profile, filename = "") {
  const settings = profile.settings || {};
  const minHeight = clamp(Math.round(Number(settings.minHeight) || 0), 0, 99);
  const maxHeight = clamp(Math.round(Number(settings.maxHeight) || 100), minHeight + 1, 100);
  heightmapImportMin.value = minHeight;
  heightmapImportMax.value = maxHeight;
  heightmapImportInvert.value = Boolean(settings.invert);
  heightmapImportFit.value = settings.fitMode === "crop" ? "crop" : "stretch";
  setHeightmapColorLimit(settings.colorLimit);
  setHeightmapMappingMode(settings.mappingMode);
  setHeightmapUnassignedHeight(settings.unassignedHeight);
  setHeightmapUnassignedStrategy(settings.unassignedStrategy);
  const normalized = normalizeProfileAssignments(profile.assignments);
  manualAssignments.value = normalized;
  importedProfileKeys.value = Object.keys(normalized);
  importedProfileAssignments.value = normalizeProfileAssignmentList(profile.assignments);
  importedProfileName.value = filename;
  selectedPaletteKey.value = null;
  batchPaletteKeys.value = [];
  drawPreview();
  updateProfileMatchStats();
}

function addCurrentOnlyProfileEntry(entry) {
  const key = String(entry?.key ?? "");
  const color = normalizeHexColor(entry?.hex);
  const height = clamp(Math.round(Number(entry?.height ?? entry?.autoHeight) || 0), 0, 100);
  if (!key || !color) return;
  manualAssignments.value = {
    ...manualAssignments.value,
    [key]: height
  };
  if (!importedProfileKeys.value.includes(key)) importedProfileKeys.value = [...importedProfileKeys.value, key];
  importedProfileAssignments.value = upsertProfileAssignment(importedProfileAssignments.value, {key, color, height});
  selectedPaletteKey.value = entry.key;
  drawPreview();
  previewStatus.value = `已加入配置：${color}，高度 ${height}。`;
}

function removeSelectedProfileEntry() {
  if (selectedPaletteKey.value === null) return;
  const key = String(selectedPaletteKey.value);
  const entry = selectedPaletteEntry.value;
  const color = normalizeHexColor(entry?.hex) || normalizeHexColor(importedProfileAssignments.value.find(item => String(item.key) === key)?.color) || "该色块";
  importedProfileKeys.value = importedProfileKeys.value.filter(item => String(item) !== key);
  importedProfileAssignments.value = importedProfileAssignments.value.filter(item => String(item.key) !== key);
  const nextManualAssignments = {...manualAssignments.value};
  delete nextManualAssignments[key];
  manualAssignments.value = nextManualAssignments;
  selectedPaletteKey.value = entry?.key ?? null;
  drawPreview();
  previewStatus.value = `已从配置移除：${color}。`;
}

function normalizeProfileAssignments(assignments) {
  const normalized = {};
  for (const assignment of assignments || []) {
    const key = String(assignment?.key ?? "");
    const height = Number(assignment?.height);
    if (!key || !Number.isFinite(height)) continue;
    normalized[key] = clamp(Math.round(height), 0, 100);
  }
  return normalized;
}

function normalizeProfileAssignmentList(assignments) {
  return (assignments || [])
    .map(assignment => {
      const key = String(assignment?.key ?? "");
      const height = Number(assignment?.height);
      const color = normalizeHexColor(assignment?.color);
      if (!key || !Number.isFinite(height) || !color) return null;
      return {
        key,
        color,
        height: clamp(Math.round(height), 0, 100),
        autoHeight: Number.isFinite(Number(assignment?.autoHeight)) ? clamp(Math.round(Number(assignment.autoHeight)), 0, 100) : undefined,
        pixels: Math.max(0, Math.round(Number(assignment?.pixels) || 0)),
        manual: assignment?.manual !== false
      };
    })
    .filter(Boolean);
}

function upsertProfileAssignment(assignments, nextAssignment) {
  const next = [];
  let replaced = false;
  for (const assignment of assignments || []) {
    if (String(assignment.key) === String(nextAssignment.key)) {
      next.push(nextAssignment);
      replaced = true;
    } else {
      next.push(assignment);
    }
  }
  if (!replaced) next.push(nextAssignment);
  return next;
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
  previewHistogram.value = brightness.histogram;
  const palette = quantizePalette(imageData.data, heightmapColorLimit.value, brightness);
  previewPalette.value = palette.entries;
  pendingPalette.value = palette.pendingEntries;
  updateProfileMatchStats();
  drawHeightBandPreview(imageData, palette.entries, brightness);
  if (!previewPalette.value.some(entry => entry.key === selectedPaletteKey.value)) selectedPaletteKey.value = null;
  trimBatchPaletteSelection();
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
    paletteBuckets: palette.bucketCount,
    unassignedBuckets: palette.unassignedBuckets,
    unassignedPixels: palette.unassignedPixels
  };
}

function clearPreviewCanvas() {
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context?.clearRect(0, 0, canvas.width, canvas.height);
  previewHistogram.value = [];
  pendingPalette.value = [];
  pendingPalettePage.value = 0;
  pendingPalettePageCount.value = 0;
  if (!previewImage.value) profileMatchStats.value = null;
  clearHeightBandCanvas();
}

function updateProfileMatchStats() {
  if (!importedProfileKeys.value.length) {
    profileMatchStats.value = null;
    return;
  }
  const currentKeys = new Set(previewPalette.value.map(entry => String(entry.key)));
  const profileKeys = new Set(importedProfileKeys.value);
  const matched = importedProfileKeys.value.filter(key => currentKeys.has(key)).length;
  const missingEntries = importedProfileAssignments.value.filter(entry => !currentKeys.has(String(entry.key)));
  const currentOnlyEntries = previewPalette.value.filter(entry => !profileKeys.has(String(entry.key)));
  profileMatchStats.value = {
    filename: importedProfileName.value,
    profileTotal: importedProfileKeys.value.length,
    matched,
    missing: Math.max(0, importedProfileKeys.value.length - matched),
    currentOnly: Math.max(0, previewPalette.value.length - matched),
    missingEntries,
    currentOnlyEntries
  };
}

function clearHeightBandCanvas() {
  const canvas = heightBandCanvas.value;
  if (canvas) {
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }
  heightBandStats.value = null;
  latestHeightBandSamples = null;
  clearHeightDifferenceCanvas();
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
  const histogram = Array.from({length: 24}, () => 0);
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    const red = data[offset] * alpha + 255 * (1 - alpha);
    const green = data[offset + 1] * alpha + 255 * (1 - alpha);
    const blue = data[offset + 2] * alpha + 255 * (1 - alpha);
    const raw = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const value = invert ? 255 - raw : raw;
    min = Math.min(min, value);
    max = Math.max(max, value);
    histogram[clamp(Math.floor((value / 256) * histogram.length), 0, histogram.length - 1)] += 1;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {min: 0, max: 255, histogram};
  return {min, max, histogram};
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
  const bucketList = Array.from(buckets.values()).sort((a, b) => b.pixels - a.pixels);
  const promotedKeys = new Set(Object.keys(manualAssignments.value).map(key => Number(key)).filter(Number.isFinite));
  const selectedBuckets = bucketList.slice(0, maxEntries);
  const selectedKeys = new Set(selectedBuckets.map(bucket => bucket.key));
  for (const bucket of bucketList.slice(maxEntries)) {
    if (!promotedKeys.has(bucket.key) || selectedKeys.has(bucket.key)) continue;
    selectedBuckets.push(bucket);
    selectedKeys.add(bucket.key);
  }
  const entries = selectedBuckets.map(bucket => createPaletteEntry(bucket, brightnessStats, range, totalPixels));
  const unassigned = bucketList.filter(bucket => !selectedKeys.has(bucket.key));
  const pendingPageCount = Math.ceil(unassigned.length / pendingPalettePageSize);
  pendingPalettePageCount.value = pendingPageCount;
  if (!pendingPageCount) pendingPalettePage.value = 0;
  else if (pendingPalettePage.value >= pendingPageCount) pendingPalettePage.value = pendingPageCount - 1;
  const pendingStart = pendingPalettePage.value * pendingPalettePageSize;
  return {
    entries,
    bucketCount: buckets.size,
    unassignedBuckets: unassigned.length,
    unassignedPixels: unassigned.reduce((sum, bucket) => sum + bucket.pixels, 0),
    pendingEntries: unassigned
      .slice(pendingStart, pendingStart + pendingPalettePageSize)
      .map(bucket => createPendingPaletteEntry(bucket, brightnessStats, range, totalPixels))
  };
}

function createPaletteEntry(bucket, brightnessStats, range, totalPixels) {
  const color = averagePreviewBucketColor(bucket);
  const autoHeight = automaticHeightForColor(color, brightnessStats, range);
  const manualHeight = manualAssignments.value[String(bucket.key)];
  const manual = Number.isFinite(manualHeight);
  const height = manual ? manualHeight : autoHeight;
  return {
    key: bucket.key,
    pixels: bucket.pixels,
    percent: paletteBucketPercent(bucket.pixels, totalPixels),
    hex: rgbToHex(color.red, color.green, color.blue),
    autoHeight,
    height,
    manual
  };
}

function createPendingPaletteEntry(bucket, brightnessStats, range, totalPixels) {
  const color = averagePreviewBucketColor(bucket);
  return {
    key: bucket.key,
    pixels: bucket.pixels,
    percent: paletteBucketPercent(bucket.pixels, totalPixels),
    hex: rgbToHex(color.red, color.green, color.blue),
    autoHeight: automaticHeightForColor(color, brightnessStats, range)
  };
}

function averagePreviewBucketColor(bucket) {
  return {
    red: bucket.red / bucket.pixels,
    green: bucket.green / bucket.pixels,
    blue: bucket.blue / bucket.pixels,
    brightness: bucket.brightness / bucket.pixels
  };
}

function paletteBucketPercent(pixels, totalPixels) {
  const ratio = pixels / totalPixels;
  return `${(ratio * 100).toFixed(ratio > 0.1 ? 0 : 1)}%`;
}

function drawHeightBandPreview(imageData, paletteEntries, brightnessStats) {
  const canvas = heightBandCanvas.value;
  if (!canvas) return;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) return;
  const output = context.createImageData(imageData.width, imageData.height);
  const heightByKey = new Map(paletteEntries.map(entry => [entry.key, entry.height]));
  const nearestHeightCache = new Map();
  const usePalette = shouldUsePalettePreview(paletteEntries);
  const brightnessRange = Math.max(1e-6, brightnessStats.max - brightnessStats.min);
  const samples = new Uint8Array(imageData.width * imageData.height);
  let min = Infinity;
  let max = -Infinity;
  let water = 0;
  let sum = 0;

  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const color = compositedRgb(imageData.data, offset);
    const key = colorBucketKey(color.red, color.green, color.blue);
    const height = usePalette
      ? paletteHeightForColorKey(key, color, paletteEntries, heightByKey, nearestHeightCache)
      : automaticHeightForColor({
        ...color,
        brightness: heightmapImportInvert.value ? 255 - color.brightness : color.brightness
      }, brightnessStats, brightnessRange);
    samples[offset / 4] = clamp(Math.round(height), 0, 100);
    const ramp = heightPreviewColor(height);
    output.data[offset] = ramp[0];
    output.data[offset + 1] = ramp[1];
    output.data[offset + 2] = ramp[2];
    output.data[offset + 3] = 255;
    min = Math.min(min, height);
    max = Math.max(max, height);
    if (height < 20) water += 1;
    sum += height;
  }

  context.putImageData(output, 0, 0);
  const total = Math.max(1, imageData.data.length / 4);
  heightBandStats.value = {
    min: Number.isFinite(min) ? Math.round(min) : 0,
    max: Number.isFinite(max) ? Math.round(max) : 0,
    water,
    total,
    average: Math.round((sum / total) * 10) / 10
  };
  latestHeightBandSamples = {width: imageData.width, height: imageData.height, samples};
  drawHeightDifferencePreview(latestHeightBandSamples);
}

function clearHeightDifferenceCanvas() {
  const canvas = heightDifferenceCanvas.value;
  if (canvas) {
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }
  heightDifferenceStats.value = null;
}

function drawHeightDifferencePreview(nextPreview) {
  const canvas = heightDifferenceCanvas.value;
  const current = props.state.currentHeightPreview;
  if (!canvas || !nextPreview?.samples?.length || !current?.samples?.length) {
    clearHeightDifferenceCanvas();
    return;
  }
  canvas.width = nextPreview.width;
  canvas.height = nextPreview.height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) return;
  const output = context.createImageData(nextPreview.width, nextPreview.height);
  let raised = 0;
  let lowered = 0;
  let unchanged = 0;
  let maxAbs = 0;
  let maxDelta = 0;
  let sumAbs = 0;

  for (let y = 0; y < nextPreview.height; y += 1) {
    const currentY = clamp(Math.floor((y / nextPreview.height) * current.height), 0, current.height - 1);
    for (let x = 0; x < nextPreview.width; x += 1) {
      const currentX = clamp(Math.floor((x / nextPreview.width) * current.width), 0, current.width - 1);
      const nextIndex = y * nextPreview.width + x;
      const currentHeight = Number(current.samples[currentY * current.width + currentX]) || 0;
      const nextHeight = Number(nextPreview.samples[nextIndex]) || 0;
      const delta = nextHeight - currentHeight;
      const abs = Math.abs(delta);
      if (abs < 2) unchanged += 1;
      else if (delta > 0) raised += 1;
      else lowered += 1;
      if (abs > maxAbs) {
        maxAbs = abs;
        maxDelta = delta;
      }
      sumAbs += abs;
      const color = differenceHeatColor(delta);
      const offset = nextIndex * 4;
      output.data[offset] = color[0];
      output.data[offset + 1] = color[1];
      output.data[offset + 2] = color[2];
      output.data[offset + 3] = 255;
    }
  }

  context.putImageData(output, 0, 0);
  const total = Math.max(1, nextPreview.samples.length);
  heightDifferenceStats.value = {
    raised,
    lowered,
    unchanged,
    total,
    maxDelta,
    averageAbs: Math.round((sumAbs / total) * 10) / 10
  };
}

function differenceHeatColor(delta) {
  const value = clamp(Math.round(delta), -100, 100);
  const strength = clamp(Math.abs(value) / 55, 0, 1);
  if (Math.abs(value) < 2) return [42, 48, 50];
  if (value > 0) {
    return [
      Math.round(79 + 176 * strength),
      Math.round(66 + 78 * strength),
      Math.round(42 - 22 * strength)
    ];
  }
  return [
    Math.round(35 - 10 * strength),
    Math.round(80 + 112 * strength),
    Math.round(126 + 112 * strength)
  ];
}

function shouldUsePalettePreview(paletteEntries) {
  return heightmapMappingMode.value !== "grayscale" || paletteEntries.some(entry => entry.manual);
}

function paletteHeightForColorKey(key, color, paletteEntries, heightByKey, nearestHeightCache) {
  const direct = heightByKey.get(key);
  if (Number.isFinite(direct)) return direct;
  if (heightmapUnassignedStrategy.value === "nearest-palette" && paletteEntries.length) {
    if (!nearestHeightCache.has(key)) nearestHeightCache.set(key, nearestPaletteHeight(color, paletteEntries));
    return nearestHeightCache.get(key);
  }
  return heightmapUnassignedHeight.value;
}

function nearestPaletteHeight(color, paletteEntries) {
  let best = paletteEntries[0];
  let bestDistance = Infinity;
  for (const entry of paletteEntries) {
    const target = hexToRgb(entry.hex);
    const distance = colorDistance(color, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best?.height ?? heightmapUnassignedHeight.value;
}

function unassignedStrategyLabel(value) {
  return heightmapUnassignedStrategyOptions.find(option => option.value === value)?.label ?? "固定高度";
}

function heightPreviewColor(height) {
  const value = clamp(Math.round(height), 0, 100);
  for (let index = 1; index < heightPreviewStops.length; index += 1) {
    const previous = heightPreviewStops[index - 1];
    const next = heightPreviewStops[index];
    if (value > next.height) continue;
    const t = clamp((value - previous.height) / Math.max(1, next.height - previous.height), 0, 1);
    return [
      Math.round(previous.color[0] + (next.color[0] - previous.color[0]) * t),
      Math.round(previous.color[1] + (next.color[1] - previous.color[1]) * t),
      Math.round(previous.color[2] + (next.color[2] - previous.color[2]) * t)
    ];
  }
  return heightPreviewStops[heightPreviewStops.length - 1].color;
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

function isBatchPaletteSelected(key) {
  return batchPaletteKeys.value.includes(key);
}

function toggleBatchPaletteEntry(key, checked) {
  if (checked) {
    if (!batchPaletteKeys.value.includes(key)) batchPaletteKeys.value = [...batchPaletteKeys.value, key];
    return;
  }
  batchPaletteKeys.value = batchPaletteKeys.value.filter(item => item !== key);
}

function selectAllBatchPalette() {
  batchPaletteKeys.value = previewPalette.value.map(entry => entry.key);
}

function clearBatchPaletteSelection() {
  batchPaletteKeys.value = [];
}

function setBatchPaletteHeight(value) {
  batchAssignmentHeight.value = clamp(Math.round(Number(value) || 0), 0, 100);
  assignBatchPaletteHeight(batchAssignmentHeight.value);
}

function assignBatchPaletteHeight(value) {
  if (!batchPaletteKeys.value.length) return;
  const height = clamp(Math.round(Number(value) || 0), 0, 100);
  batchAssignmentHeight.value = height;
  const next = {...manualAssignments.value};
  for (const key of batchPaletteKeys.value) next[String(key)] = height;
  manualAssignments.value = next;
  drawPreview();
}

function clearBatchPaletteHeight() {
  if (!batchPaletteKeys.value.length) return;
  const next = {...manualAssignments.value};
  for (const key of batchPaletteKeys.value) delete next[String(key)];
  manualAssignments.value = next;
  drawPreview();
}

function trimBatchPaletteSelection() {
  if (!batchPaletteKeys.value.length) return;
  const available = new Set(previewPalette.value.map(entry => entry.key));
  batchPaletteKeys.value = batchPaletteKeys.value.filter(key => available.has(key));
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

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[\da-f]{6}$/i.test(normalized)) return [0, 0, 0];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function normalizeHexColor(hex) {
  const normalized = String(hex || "").trim().replace("#", "");
  return /^[\da-f]{6}$/i.test(normalized) ? `#${normalized.toLowerCase()}` : "";
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

function histogramTotal(counts) {
  return Math.max(1, counts.reduce((sum, count) => sum + count, 0));
}

function sumHistogramRange(counts, start, end) {
  return counts.slice(start, end).reduce((sum, count) => sum + count, 0);
}

function histogramBinLabel(index, totalBins) {
  const start = Math.round((index / totalBins) * 255);
  const end = Math.round(((index + 1) / totalBins) * 255);
  return `${start}-${end}`;
}

function formatPercent(value) {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function formatSignedNumber(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function formatSignedPercent(value) {
  const rounded = Math.round((Number(value) || 0) * 100);
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function nextColorLimit(value) {
  const current = Number(value) || 32;
  return heightmapColorLimitOptions.find(option => option.value > current)?.value ?? current;
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

function downloadJsonText(filename, text) {
  const blob = new Blob([text], {type: "application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilePart(value) {
  return String(value || "heightmap")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "heightmap";
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

function formatSignedHeightDelta(value) {
  if (typeof value !== "string" || value === "none") return value || "none";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const formatted = formatHeight(Math.abs(numeric), unitPreferences.value, {abs: true});
  return numeric > 0 ? `+${formatted}` : numeric < 0 ? `-${formatted}` : formatted;
}

function formatDerivedStaleSystems(systems) {
  if (!Array.isArray(systems) || !systems.length) return "无";
  const preview = systems.slice(0, 3).map(system => derivedSystemLabels[system] || system).join("、");
  return `${systems.length} 项：${preview}${systems.length > 3 ? "等" : ""}`;
}
</script>
