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
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiSegmented from "./base/UiSegmented.vue";
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
const unitPreferences = useUnitPreferences();

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

function formatHeightRange(value) {
  if (typeof value !== "string" || value === "none") return value || "none";
  const parts = value.split("..").map(part => Number(part));
  if (parts.length !== 2 || parts.some(part => !Number.isFinite(part))) return value;
  return `${formatHeight(parts[0], unitPreferences.value)} .. ${formatHeight(parts[1], unitPreferences.value)}`;
}
</script>
