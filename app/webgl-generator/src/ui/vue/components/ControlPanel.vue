<template>
  <UiTabs v-model="activeTab" :tabs="tabs" />

  <div class="control-panel-tab-panels">
    <div class="control-panel-section project-about-panel" data-control-panel="about" :hidden="activeTab !== 'about'">
      <section class="project-about-card" aria-labelledby="project-about-title">
        <h2 id="project-about-title">WebGL 地图生成器</h2>
        <p>
          这是一个参考 Azgaar/Fantasy-Map-Generator 的生成流程、数据结构和视觉经验，
          以 WebGL2 canvas 重新实现的独立地图生成器。
        </p>
        <p>
          当前已接入地形、气候、河流、文化、宗教、国家、省份、城镇、道路、资源点、外交、经济、军事和区域等系统，
          并提供 Vue 浮动面板用于查看、编辑和局部重新生成地图对象。
        </p>
        <a href="https://github.com/mosuzi/fmg-gl" target="_blank" rel="noreferrer">打开当前仓库</a>
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator" target="_blank" rel="noreferrer">查看原项目</a>
        <div class="project-file-actions" aria-label="本地文件操作">
          <UiButton id="export-map-image" variant="secondary">导出图片</UiButton>
          <UiButton id="export-map-data" variant="secondary">导出地图数据</UiButton>
          <UiButton id="export-map-geojson" variant="secondary">导出 GeoJSON</UiButton>
          <label class="secondary-action file-import-action" for="import-map-file">导入地图数据</label>
          <input id="import-map-file" type="file" accept=".json,application/json" hidden />
        </div>
        <p id="file-operation-status" class="file-operation-status" aria-live="polite"></p>
      </section>
    </div>

    <div class="generation-panel-form" data-control-panel="generation" :hidden="activeTab !== 'generation'">
      <UiField label="Seed" input-id="seed-input" model-value="stage-2-1" :input-attrs="{autocomplete: 'off'}" />
      <UiField label="目标 cells" input-id="cells-input" type="number" :model-value="10000" :input-attrs="{min: 1000, max: 100000, step: 1000}" />
      <UiField label="宽度" input-id="width-input" type="number" :model-value="1440" :input-attrs="{min: 640, max: 4096, step: 80}" />
      <UiField label="高度" input-id="height-input" type="number" :model-value="960" :input-attrs="{min: 480, max: 4096, step: 80}" />
      <UiField label="地形" input-id="heightmap-template" type="select" model-value="continents" :options="terrainTemplates" />
      <section class="generation-climate-section" aria-labelledby="generation-climate-title">
        <h2 id="generation-climate-title">气候</h2>
        <input id="climate-latitude-mode" type="hidden" :value="climateLatitudeMode" />
        <input id="climate-latitude-center" type="hidden" :value="climateLatitudeCenter" />
        <input id="climate-latitude-span" type="hidden" :value="climateLatitudeSpan" />
        <input id="atmosphere-direction" type="hidden" :value="atmosphereDirection" />
        <input id="atmosphere-winds" type="hidden" :value="windProfileValue" />

        <div class="earth-climate-grid">
          <div class="earth-projection" :class="{manual: climateLatitudeMode === 'custom'}">
            <div class="earth-projection-map">
              <svg class="earth-globe-svg" viewBox="0 0 120 120" aria-hidden="true">
                <circle class="earth-globe-fill" cx="60" cy="60" r="51" />
                <line
                  v-for="line in latitudeGuideLines"
                  :key="line.key"
                  class="earth-latitude-guide"
                  :class="{equator: line.lat === 0}"
                  :x1="line.x1"
                  :x2="line.x2"
                  :y1="line.y"
                  :y2="line.y"
                />
                <polygon class="earth-canvas-footprint" :points="canvasFootprintPoints" />
              </svg>
              <div class="wind-band-column" role="group" aria-label="大气风带">
                <button
                  v-for="(band, index) in windBandOptions"
                  :key="band.value"
                  type="button"
                  class="wind-band-button"
                  :data-wind-band="index"
                  :data-wind-angle="windBands[index]"
                  :aria-label="`${band.label} ${band.range}：${windDirectionLabel(windBands[index])}`"
                  :title="`${band.label} ${band.range}：${windDirectionLabel(windBands[index])}`"
                  @click="cycleWindBand(index)"
                >
                  <span class="wind-band-arrow" aria-hidden="true">{{ windDirectionArrow(windBands[index]) }}</span>
                </button>
              </div>
            </div>
            <div class="earth-projection-controls">
              <button
                id="climate-latitude-toggle"
                type="button"
                class="climate-mode-toggle"
                :aria-pressed="climateLatitudeMode === 'custom' ? 'true' : 'false'"
                @click="toggleLatitudeMode"
              >
                {{ climateLatitudeMode === "custom" ? "手动纬度" : "自动纬度" }}
              </button>
              <div class="earth-latitude-readout">{{ latitudeBandLabel }}</div>
            </div>
          </div>

          <div class="climate-temperature-fields">
            <UiSliderField
              label="赤道"
              input-id="temperature-equator"
              output-id="temperature-equator-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="temperatureEquator"
              :display-value="`${temperatureEquator}°C`"
              :min="20"
              :max="35"
              :step="1"
              @input="value => temperatureEquator = value"
            />
            <UiSliderField
              label="北极"
              input-id="temperature-north-pole"
              output-id="temperature-north-pole-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="temperatureNorthPole"
              :display-value="`${temperatureNorthPole}°C`"
              :min="-40"
              :max="10"
              :step="1"
              @input="value => temperatureNorthPole = value"
            />
            <UiSliderField
              label="南极"
              input-id="temperature-south-pole"
              output-id="temperature-south-pole-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="temperatureSouthPole"
              :display-value="`${temperatureSouthPole}°C`"
              :min="-40"
              :max="10"
              :step="1"
              @input="value => temperatureSouthPole = value"
            />
            <UiSliderField
              label="画布纬度"
              input-id="climate-latitude-center-slider"
              output-id="climate-latitude-center-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="climateLatitudeCenter"
              :display-value="formatLatitudeCenter(climateLatitudeCenter)"
              :min="-75"
              :max="75"
              :step="1"
              @input="setLatitudeCenter"
            />
          </div>
        </div>
      </section>
      <section class="generation-inheritance-section" aria-labelledby="generation-inheritance-title">
        <h2 id="generation-inheritance-title">继承结构</h2>
        <div class="generation-inheritance-grid">
          <UiSelectField
            label="文化"
            input-id="culture-inheritance-mode"
            class-name="generation-inheritance-select"
            :model-value="cultureInheritanceMode"
            :options="inheritanceModeOptions"
            @update:model-value="cultureInheritanceMode = $event"
          />
          <UiSelectField
            label="宗教"
            input-id="religion-inheritance-mode"
            class-name="generation-inheritance-select"
            :model-value="religionInheritanceMode"
            :options="inheritanceModeOptions"
            @update:model-value="religionInheritanceMode = $event"
          />
        </div>
      </section>
      <UiSwitchField label="生成时自动随机 seed" input-id="auto-random-seed" />

      <div class="generation-button-row">
        <UiButton id="generate-map" variant="primary">生成 grid 地图</UiButton>
        <UiButton id="random-seed" variant="secondary">换 seed</UiButton>
      </div>
    </div>

    <div class="control-panel-section" data-control-panel="themes" :hidden="activeTab !== 'themes'">
      <UiSegmented label="视图" :options="themes" :model-value="preferences.colorMode" data-mode />
      <div class="preference-toggle-grid">
        <UiSwitchField label="显示海底" input-id="show-ocean-height" :checked="preferences.showOceanHeight" button-style />
        <UiSwitchField label="平滑边界" input-id="smooth-cell-borders" :checked="preferences.smoothCellBorders" button-style />
      </div>
    </div>

    <div class="control-panel-section unit-control-panel" data-control-panel="units" :hidden="activeTab !== 'units'">
      <section class="unit-settings unit-settings-standalone" aria-labelledby="unit-settings-title">
        <h2 id="unit-settings-title">显示单位</h2>
        <input id="area-unit" type="hidden" :value="unitPreferences.areaUnit" />
        <div class="unit-config-list">
          <UiSelectField
            class-name="unit-select-field unit-config-row"
            label="数字缩写"
            input-id="number-abbreviation"
            :model-value="unitPreferences.numberAbbreviation"
            :options="numberAbbreviationOptions"
            @update:model-value="value => patchUnitPreference({numberAbbreviation: value})"
          />
          <UiSelectField
            label="距离单位"
            input-id="distance-unit"
            class-name="unit-select-field unit-config-row"
            :model-value="unitPreferences.distanceUnit"
            :options="distanceUnitOptions"
            @update:model-value="value => patchUnitPreference({distanceUnit: value})"
          />
          <div class="unit-derived-row">
            <span>面积单位</span>
            <strong>{{ areaUnitLabel }}</strong>
          </div>
          <div class="unit-scale-readout">{{ scaleLabel }}</div>
          <UiSliderField
            label="比例尺"
            input-id="map-scale-km-per-cm"
            output-id="map-scale-km-per-cm-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.mapScaleKmPerCm"
            :display-value="`${unitPreferences.mapScaleKmPerCm} km/cm`"
            :min="unitScaleLimits.mapScaleKmPerCm.min"
            :max="unitScaleLimits.mapScaleKmPerCm.max"
            :step="unitScaleLimits.mapScaleKmPerCm.step"
            @input="value => patchUnitPreference({mapScaleKmPerCm: value})"
          />
          <UiSliderField
            label="人口倍率"
            input-id="population-scale"
            output-id="population-scale-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.populationScale"
            :display-value="formatScaleMultiplier(unitPreferences.populationScale)"
            :min="unitScaleLimits.populationScale.min"
            :max="unitScaleLimits.populationScale.max"
            :step="unitScaleLimits.populationScale.step"
            @input="value => patchUnitPreference({populationScale: value})"
          />
          <UiSliderField
            label="降水倍率"
            input-id="precipitation-scale"
            output-id="precipitation-scale-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.precipitationScale"
            :display-value="formatScaleMultiplier(unitPreferences.precipitationScale)"
            :min="unitScaleLimits.precipitationScale.min"
            :max="unitScaleLimits.precipitationScale.max"
            :step="unitScaleLimits.precipitationScale.step"
            @input="value => patchUnitPreference({precipitationScale: value})"
          />
        </div>
      </section>
    </div>

    <div class="control-panel-section" data-control-panel="layers" :hidden="activeTab !== 'layers'">
      <div class="layer-toggle-grid">
        <UiLayerToggleButton
          v-for="layer in layers"
          :key="layer.id"
          :layer="layer.id"
          :label="layer.label"
          :pressed="isLayerVisible(layer.id)"
        />
        <button
          id="show-hover-info"
          type="button"
          class="layer-toggle-button"
          :class="{active: preferences.showHoverInfo !== false}"
          :aria-pressed="preferences.showHoverInfo !== false ? 'true' : 'false'"
        >
          <span class="layer-toggle-indicator"></span>
          <span>悬停信息</span>
        </button>
      </div>

      <UiSliderField
        label="城市标签上限"
        input-id="max-city-labels"
        output-id="max-city-labels-value"
        field-class="label-limit-field"
        value-tag="output"
        :model-value="preferences.maxCityLabels"
        :min="8"
        :max="5000"
      />
    </div>

    <div class="control-panel-section management-panel" data-control-panel="management" :hidden="activeTab !== 'management'">
      <div class="management-panel-actions">
        <UiButton v-for="action in actions" :id="action.id" :key="action.id" variant="secondary">
          {{ action.label }}
        </UiButton>
      </div>

      <div class="management-panel-divider" aria-hidden="true"></div>

      <section class="regeneration-section" aria-labelledby="regeneration-section-title">
        <div class="regeneration-section-header">
          <h2 id="regeneration-section-title">重新生成</h2>
          <span id="regeneration-status"></span>
        </div>

        <div class="regeneration-action-grid">
          <UiButton
            v-for="action in regenerationActions"
            :key="action.kind"
            variant="secondary"
            :data-regenerate-kind="action.kind"
          >
            {{ action.label }}
          </UiButton>
        </div>

        <p id="regeneration-constraint" class="regeneration-status-note">
          国家、省份、城镇、道路、河流和资源点会按各自生成约束逐步接入；marker / zone 的完整局部重算另行推进。
        </p>
      </section>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, ref} from "vue";
import {storeToRefs} from "pinia";
import UiButton from "./base/UiButton.vue";
import UiField from "./base/UiField.vue";
import UiLayerToggleButton from "./base/UiLayerToggleButton.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSwitchField from "./base/UiSwitchField.vue";
import UiTabs from "./base/UiTabs.vue";
import {
  DISTANCE_UNIT_OPTIONS,
  NUMBER_ABBREVIATION_OPTIONS,
  UNIT_SCALE_LIMITS,
  areaUnitForDistanceUnit,
  areaUnitLabelForDistanceUnit,
  formatScaleLabel,
  formatScaleMultiplier,
  normalizeUnitPreferences
} from "../../display-units.js";
import {
  WIND_BAND_OPTIONS,
  WIND_DIRECTION_OPTIONS,
  defaultWindProfile,
  windDirectionLabelFromAngle,
  windDirectionValueFromAngle
} from "../../../generator/climate-options.js";
import {DEFAULT_INHERITANCE_MODE, INHERITANCE_MODE_OPTIONS} from "../../../generator/inheritance.js";
import {useGlobalConfigStore} from "../stores/global-config-store.js";

defineOptions({
  name: "ControlPanel"
});

const config = useGlobalConfigStore();
const {preferences} = storeToRefs(config);
const activeTab = ref("generation");
const climateLatitudeMode = ref("auto");
const climateLatitudeCenter = ref(0);
const climateLatitudeSpan = ref(45);
const atmosphereDirection = ref("customBands");
const windBands = ref(defaultWindProfile());
const temperatureEquator = ref(25);
const temperatureNorthPole = ref(-25);
const temperatureSouthPole = ref(-15);
const cultureInheritanceMode = ref(DEFAULT_INHERITANCE_MODE);
const religionInheritanceMode = ref(DEFAULT_INHERITANCE_MODE);
const unitPreferences = computed(() => normalizeUnitPreferences(preferences.value.units));
const scaleLabel = computed(() => formatScaleLabel(unitPreferences.value));
const areaUnitLabel = computed(() => areaUnitLabelForDistanceUnit(unitPreferences.value.distanceUnit));
const distanceUnitOptions = DISTANCE_UNIT_OPTIONS;
const numberAbbreviationOptions = NUMBER_ABBREVIATION_OPTIONS;
const unitScaleLimits = UNIT_SCALE_LIMITS;
const inheritanceModeOptions = INHERITANCE_MODE_OPTIONS;
const windBandOptions = WIND_BAND_OPTIONS;
const windProfileValue = computed(() => windBands.value.join(","));
const canvasFootprintPoints = computed(() => {
  const span = Number(climateLatitudeSpan.value) || 45;
  const center = Number(climateLatitudeCenter.value) || 0;
  const north = Math.min(90, center + span / 2);
  const south = Math.max(-90, center - span / 2);
  const northPair = latitudeCanvasPair(north);
  const southPair = latitudeCanvasPair(south);
  return [
    northPair.left,
    northPair.right,
    southPair.right,
    southPair.left
  ].map(point => point.map(roundSvg).join(",")).join(" ");
});
const latitudeGuideLines = computed(() => [-60, -30, 0, 30, 60].map(lat => ({
  key: `lat-${lat}`,
  lat,
  ...latitudeLine(lat)
})));
const latitudeBandLabel = computed(() => {
  const span = Number(climateLatitudeSpan.value) || 45;
  const center = Number(climateLatitudeCenter.value) || 0;
  const north = Math.min(90, center + span / 2);
  const south = Math.max(-90, center - span / 2);
  return climateLatitudeMode.value === "custom"
    ? `${formatLatitudeCenter(center)} / ${formatLatitudeCenter(south)} 至 ${formatLatitudeCenter(north)}`
    : "自动按地形选择纬度";
});

const tabs = Object.freeze([
  {id: "about", label: "简介"},
  {id: "generation", label: "生成"},
  {id: "themes", label: "视图"},
  {id: "units", label: "单位"},
  {id: "layers", label: "图层"},
  {id: "management", label: "管理"}
]);

const terrainTemplates = Object.freeze([
  {value: "continents", label: "大陆"},
  {value: "mediterranean", label: "地中海"},
  {value: "highIsland", label: "高山岛屿"},
  {value: "lowIsland", label: "平原岛屿"},
  {value: "peninsula", label: "一侧大陆"},
  {value: "pangea", label: "盘古大陆"},
  {value: "archipelago", label: "群岛"}
]);

const themes = Object.freeze([
  {value: "height", label: "高度"},
  {value: "temperature", label: "温度"},
  {value: "precipitation", label: "降水"},
  {value: "biomes", label: "生物群系"},
  {value: "cultures", label: "文化"},
  {value: "religions", label: "宗教"},
  {value: "diplomacy", label: "外交"},
  {value: "states", label: "国家"},
  {value: "provinces", label: "省份"},
  {value: "regions", label: "区域"},
  {value: "population", label: "人口"}
]);

const layers = Object.freeze([
  {id: "routes", label: "道路"},
  {id: "rivers", label: "河流"},
  {id: "cities", label: "城市"},
  {id: "resources", label: "资源点"},
  {id: "markers", label: "标记"},
  {id: "scaleBar", label: "比例尺"},
  {id: "labels", label: "城市标签"},
  {id: "stateLabels", label: "国家名称"},
  {id: "stateBorders", label: "国界"},
  {id: "provinceBorders", label: "省界"},
  {id: "coastline", label: "水陆线"}
]);

const actions = Object.freeze([
  {id: "fit-view", label: "适配视图"},
  {id: "open-height-panel", label: "高度编辑"},
  {id: "open-state-panel", label: "国家编辑"},
  {id: "open-province-panel", label: "省份管理"},
  {id: "open-city-panel", label: "城市管理"},
  {id: "open-culture-panel", label: "文化管理"},
  {id: "open-religion-panel", label: "宗教管理"},
  {id: "open-diplomacy-panel", label: "外交管理"},
  {id: "open-route-panel", label: "路线管理"},
  {id: "open-river-panel", label: "河流管理"},
  {id: "open-marker-panel", label: "资源标记"},
  {id: "open-label-naming-panel", label: "标签管理"}
]);

const regenerationActions = Object.freeze([
  {kind: "states", label: "国家"},
  {kind: "provinces", label: "省份"},
  {kind: "cities", label: "城镇"},
  {kind: "routes", label: "道路"},
  {kind: "rivers", label: "河流"},
  {kind: "markers", label: "资源点"},
  {kind: "diplomacy", label: "外交"}
]);

function isLayerVisible(layer) {
  return preferences.value.layers?.[layer] !== false;
}

function patchUnitPreference(patch) {
  const next = normalizeUnitPreferences({...unitPreferences.value, ...patch});
  if (patch.distanceUnit) next.areaUnit = areaUnitForDistanceUnit(patch.distanceUnit);
  config.patchPreferences({units: next});
}

function toggleLatitudeMode() {
  climateLatitudeMode.value = climateLatitudeMode.value === "custom" ? "auto" : "custom";
  emitClimateControlsChange();
}

function setLatitudeCenter(value) {
  climateLatitudeMode.value = "custom";
  climateLatitudeCenter.value = value;
  emitClimateControlsChange();
}

function cycleWindBand(index) {
  const currentValue = windDirectionValueFromAngle(windBands.value[index]);
  const currentIndex = Math.max(0, WIND_DIRECTION_OPTIONS.findIndex(option => option.value === currentValue));
  const next = WIND_DIRECTION_OPTIONS[(currentIndex + 1) % WIND_DIRECTION_OPTIONS.length];
  windBands.value = windBands.value.map((angle, bandIndex) => bandIndex === index ? next.angle : angle);
  atmosphereDirection.value = "customBands";
  emitClimateControlsChange();
}

function windDirectionLabel(angle) {
  return windDirectionLabelFromAngle(angle);
}

function windDirectionArrow(angle) {
  const value = windDirectionValueFromAngle(angle);
  return WIND_DIRECTION_OPTIONS.find(option => option.value === value)?.arrow || "→";
}

function formatLatitudeCenter(value) {
  const numeric = Number(value) || 0;
  if (numeric > 0) return `北纬 ${numeric}°`;
  if (numeric < 0) return `南纬 ${Math.abs(numeric)}°`;
  return "赤道 0°";
}

function latitudeCanvasPair(latitude) {
  const line = latitudeLine(latitude);
  const halfWidth = Math.max(3, line.halfWidth * 0.82);
  return {
    left: [60 - halfWidth, line.y],
    right: [60 + halfWidth, line.y]
  };
}

function latitudeLine(latitude) {
  const lat = Math.max(-89.5, Math.min(89.5, Number(latitude) || 0));
  const radians = Math.abs(lat) * Math.PI / 180;
  const halfWidth = Math.max(2.4, 47 * Math.cos(radians));
  const y = 60 - (lat / 90) * 47;
  return {
    y: roundSvg(y),
    x1: roundSvg(60 - halfWidth),
    x2: roundSvg(60 + halfWidth),
    halfWidth: roundSvg(halfWidth)
  };
}

function roundSvg(value) {
  return Math.round(value * 10) / 10;
}

function emitClimateControlsChange() {
  nextTick(() => {
    const target = document.getElementById("climate-latitude-mode") || document.getElementById("atmosphere-winds");
    target?.dispatchEvent(new CustomEvent("climate-controls-change", {bubbles: true}));
    target?.dispatchEvent(new Event("change", {bubbles: true}));
  });
}
</script>
