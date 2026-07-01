<template>
  <UiTabs v-model="activeTab" :tabs="tabs" />

  <div class="control-panel-tab-panels">
    <div class="generation-panel-form" data-control-panel="generation" :hidden="activeTab !== 'generation'">
      <UiField label="Seed" input-id="seed-input" model-value="stage-2-1" :input-attrs="{autocomplete: 'off'}" />
      <UiField label="目标 cells" input-id="cells-input" type="number" :model-value="10000" :input-attrs="{min: 1000, max: 100000, step: 1000}" />
      <UiField label="宽度" input-id="width-input" type="number" :model-value="1440" :input-attrs="{min: 640, max: 4096, step: 80}" />
      <UiField label="高度" input-id="height-input" type="number" :model-value="960" :input-attrs="{min: 480, max: 4096, step: 80}" />
      <UiField label="地形" input-id="heightmap-template" type="select" model-value="continents" :options="terrainTemplates" />
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

      <section class="unit-settings" aria-labelledby="unit-settings-title">
        <h2 id="unit-settings-title">显示单位</h2>
        <div class="unit-select-grid">
          <UiSelectField
            label="距离"
            input-id="distance-unit"
            class-name="unit-select-field"
            :model-value="unitPreferences.distanceUnit"
            :options="distanceUnitOptions"
            @update:model-value="value => patchUnitPreference({distanceUnit: value})"
          />
          <UiSelectField
            label="面积"
            input-id="area-unit"
            class-name="unit-select-field"
            :model-value="unitPreferences.areaUnit"
            :options="areaUnitOptions"
            @update:model-value="value => patchUnitPreference({areaUnit: value})"
          />
        </div>
        <div class="unit-scale-readout">{{ scaleLabel }}</div>
        <UiSliderField
          label="1 cm"
          input-id="map-scale-km-per-cm"
          output-id="map-scale-km-per-cm-value"
          field-class="unit-scale-field"
          value-tag="output"
          :model-value="unitPreferences.mapScaleKmPerCm"
          :display-value="`${unitPreferences.mapScaleKmPerCm} km`"
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
          <span id="regeneration-status">待命</span>
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
import {computed, ref} from "vue";
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
  AREA_UNIT_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  UNIT_SCALE_LIMITS,
  formatScaleLabel,
  formatScaleMultiplier,
  normalizeUnitPreferences
} from "../../display-units.js";
import {useGlobalConfigStore} from "../stores/global-config-store.js";

defineOptions({
  name: "ControlPanel"
});

const config = useGlobalConfigStore();
const {preferences} = storeToRefs(config);
const activeTab = ref("generation");
const unitPreferences = computed(() => normalizeUnitPreferences(preferences.value.units));
const scaleLabel = computed(() => formatScaleLabel(unitPreferences.value));
const distanceUnitOptions = DISTANCE_UNIT_OPTIONS;
const areaUnitOptions = AREA_UNIT_OPTIONS;
const unitScaleLimits = UNIT_SCALE_LIMITS;

const tabs = Object.freeze([
  {id: "generation", label: "生成"},
  {id: "themes", label: "视图"},
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
  {kind: "markers", label: "资源点"}
]);

function isLayerVisible(layer) {
  return preferences.value.layers?.[layer] !== false;
}

function patchUnitPreference(patch) {
  config.patchPreferences({units: {...unitPreferences.value, ...patch}});
}
</script>
