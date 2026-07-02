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

  <section class="heightmap-import-section height-panel-import-section" aria-labelledby="heightmap-import-title">
    <h2 id="heightmap-import-title">灰度高度图</h2>
    <div class="heightmap-import-fields">
      <UiSliderField
        label="最低高度"
        input-id="heightmap-import-min"
        output-id="heightmap-import-min-value"
        field-class="heightmap-import-field"
        value-tag="output"
        :model-value="heightmapImportMin"
        :display-value="heightmapImportMin"
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
        :display-value="heightmapImportMax"
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
      <UiButton class="file-import-action heightmap-import-action" variant="secondary" @click="triggerHeightmapFileInput">导入灰度图</UiButton>
      <input id="heightmap-image-file" type="file" accept="image/*" hidden />
    </div>
    <p id="heightmap-import-status" class="file-operation-status" aria-live="polite"></p>
  </section>
</template>

<script setup>
import {computed, ref} from "vue";
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
const unitPreferences = useUnitPreferences();
const heightmapImportMin = ref(0);
const heightmapImportMax = ref(100);
const heightmapImportInvert = ref(false);
const heightmapImportFit = ref("stretch");

const summaryMetrics = computed(() => [
  {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
  {label: "影响", value: formatNumber(props.state.lastAffected, unitPreferences.value)},
  {label: "高度", value: formatHeightRange(props.state.lastHeight)},
  {label: "历史", value: props.state.history ? `undo ${props.state.history.undo} / redo ${props.state.history.redo}` : "none"}
]);

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

function triggerHeightmapFileInput() {
  const input = document.getElementById("heightmap-image-file");
  if (!input) return;
  input.value = "";
  input.click();
}

function formatHeightRange(value) {
  if (typeof value !== "string" || value === "none") return value || "none";
  const parts = value.split("..").map(part => Number(part));
  if (parts.length !== 2 || parts.some(part => !Number.isFinite(part))) return value;
  return `${formatHeight(parts[0], unitPreferences.value)} .. ${formatHeight(parts[1], unitPreferences.value)}`;
}
</script>
