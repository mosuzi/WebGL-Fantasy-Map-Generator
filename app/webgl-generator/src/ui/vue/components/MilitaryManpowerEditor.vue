<template>
  <details class="manpower-editor" :open="open" @toggle="toggle">
    <summary>调整兵种人数</summary>
    <form v-if="open && context" novalidate @submit.prevent="submit">
      <p>全国基础人口 {{ number(context.population) }} 人，动员上限 {{ number(context.limits.total) }} 人。</p>
      <div class="manpower-fields">
        <label v-for="unit in context.editable" :key="unit.name">
          <span>{{ unit.label }}人数</span>
          <input :value="draft[unit.name] ?? context.current[unit.name] ?? 0" inputmode="numeric"
            :aria-label="unit.label + '人数'" :aria-describedby="'manpower-limit-' + unit.name"
            @input="edit(unit.name, $event.target.value)" />
          <small :id="'manpower-limit-' + unit.name">本团限额 {{ number(Math.max(0, context.limits[unit.name] - (context.others[unit.name] || 0))) }}</small>
        </label>
      </div>
      <p v-if="fitness" class="manpower-preview" aria-live="polite">
        全国兵力 <b>{{ number(proposal.nationalTotal) }}</b> · 本团兵力 <b>{{ number(proposal.total) }}</b> · 预计适宜 <b>{{ Math.round(fitness.suitability.total * 100) }}%</b>
      </p>
      <p>各军团共用全国额度。兵种名额取决于城乡人口的文化与宗教构成，征募越接近上限，适宜度越低。</p>
      <p v-if="error || proposal.error" class="manpower-error" role="alert">{{ error || proposal.error }}</p>
      <UiButton button-type="submit" variant="primary" :disabled="!!proposal.error || !proposal.changed">应用人数</UiButton>
    </form>
  </details>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {inspectManpower, manpowerContext, manpowerFitness} from "../../../generator/military-manpower.js";
import UiButton from "./base/UiButton.vue";

const props = defineProps({map: Object, version: Number, target: Object, apply: Function});
const open = ref(false);
const draft = ref({});
const error = ref("");
const state = computed(() => {
  props.version;
  return props.map?.pack?.states?.[props.target.stateId];
});
const regiment = computed(() => {
  props.version;
  return state.value?.military?.find(r => r.i === props.target.regimentId);
});
const context = computed(() => {
  props.version;
  return open.value && regiment.value ? manpowerContext(props.map.pack, state.value, regiment.value) : null;
});
const proposal = computed(() => context.value && inspectManpower(context.value, draft.value));
const fitness = computed(() => proposal.value?.units && manpowerFitness(props.map.pack, regiment.value, proposal.value.units,
  context.value.limits, proposal.value.national, proposal.value.nationalTotal));
const number = value => value.toLocaleString("zh-CN");

watch(() => props.map, () => { open.value = false; });
function toggle(event) {
  open.value = event.target.open;
  draft.value = {};
  error.value = "";
}
function edit(key, value) {
  draft.value[key] = value;
  error.value = "";
}
function submit() {
  if (!proposal.value?.changed || proposal.value.error) return;
  const result = props.apply(props.target, draft.value);
  if (result?.executed || result?.noop) open.value = false;
  else error.value = result?.error?.message || "未能应用人数，请重新核对。";
}
</script>

<style scoped>
.manpower-editor summary { cursor: pointer; font-weight: 600; }
.manpower-editor form { display: grid; justify-items: start; gap: 8px; padding-block: 8px 2px; }
.manpower-editor p { margin: 0; font-size: 12px; }
.manpower-fields { display: grid; width: 100%; grid-template-columns: repeat(auto-fit, minmax(min(115px, 100%), 1fr)); gap: 8px 12px; }
.manpower-fields label { display: grid; gap: 3px; min-width: 0; font-size: 12px; }
.manpower-fields input { box-sizing: border-box; width: 100%; min-width: 0; padding: 4px 6px; border: 1px solid var(--panel-border); border-radius: 4px; background: var(--panel-field); color: var(--panel-text); font: inherit; font-variant-numeric: tabular-nums; }
.manpower-fields small { color: var(--panel-muted); }
.manpower-error { color: var(--panel-danger); }
</style>
