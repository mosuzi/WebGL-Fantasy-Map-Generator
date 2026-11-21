<template>
  <span class="ui-inline-field" :class="editor.className" :data-inline-label="label">
    <label v-if="editor.type === 'select'" class="ui-inline-choice" :class="{'is-disabled': editor.disabled}">
      <span>{{ display }}</span>
      <select :aria-label="accessibleLabel" :value="editor.value" :disabled="editor.disabled" @focus="choosing = true" @pointerdown="choosing = true" @blur="choosing = false" @change="choose">
        <option v-for="option in visibleOptions" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option>
      </select>
    </label>
    <div v-else-if="editing && editor.type === 'color'" class="ui-inline-color" @keydown.esc.stop.prevent="close(true)"
      @focusout="event => {if (!event.currentTarget.contains(event.relatedTarget)) close(false);}">
      <UiColorField :model-value="editor.value" :label="label" @apply="apply" />
    </div>
    <template v-else-if="editing">
      <component :is="editor.type === 'note' ? 'textarea' : 'input'" ref="input" :value="draft" @input="draft = $event.target.value" class="ui-inline-input"
        :type="editor.type === 'number' ? 'number' : 'text'" :aria-label="accessibleLabel" :maxlength="editor.maxLength"
        :min="editor.min" :max="editor.max" :step="editor.step" :required="editor.type !== 'note' && !editor.allowEmpty"
        @keydown="keyDown" @blur="finish(false)" @compositionstart="composing = true" @compositionend="compositionEnded" />
    </template>
    <button v-else ref="trigger" type="button" class="ui-inline-trigger" data-layout-multiline="对象名称和备注可换行"
      :title="accessibleLabel" :aria-label="accessibleLabel" :disabled="editor.disabled" @click="start"><i v-if="editor.type === 'color'" class="ui-inline-swatch" :style="{backgroundColor: editor.value}" />{{ display }}</button>
    <button v-if="editor.reset" type="button" class="ui-inline-reset" :aria-label="editor.resetLabel" :title="editor.resetLabel"
      :disabled="editor.disabled" @click="editor.reset()">↺</button>
    <small v-if="error" role="alert">{{ error }}</small>
  </span>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiColorField from "./UiColorField.vue";
const props = defineProps({label: String, display: [String, Number], editor: {type: Object, required: true}});
const emit = defineEmits(["end"]);
const accessibleLabel = computed(() => props.editor.label || `编辑${props.label}`);
const editing = ref(false), draft = ref(""), composing = ref(false), error = ref("");
const input = ref(null), trigger = ref(null);
const choosing = ref(false);
const visibleOptions = computed(() => choosing.value || props.editor.options?.length <= 100
  ? props.editor.options : [{value: props.editor.value, label: props.display}]);
let initial = "";
let pending = false;
function start() {
  if (props.editor.disabled || editing.value) return;
  if (props.editor.type === "action") {apply(props.editor.value); return;}
  initial = String(props.editor.value ?? "");
  draft.value = initial;
  error.value = "";
  editing.value = true;
  const field = trigger.value?.parentElement;
  nextTick(() => {
    if (props.editor.type === "color") field?.querySelector("input")?.focus();
    else {input.value?.focus(); input.value?.select();}
  });
}
function close(returnFocus) {
  editing.value = false;
  composing.value = false;
  if (returnFocus) nextTick(() => trigger.value?.focus());
  emit("end");
}
function compositionEnded() {
  composing.value = false;
  nextTick(() => {if (input.value && input.value !== document.activeElement) finish(false);});
}
async function finish(returnFocus) {
  if (!editing.value || composing.value || pending) return;
  const field = props.editor;
  const value = String(draft.value);
  if (value === initial || field.disabled) {close(returnFocus); return;}
  if (!input.value?.validity.valid || (field.type !== "note" && !field.allowEmpty && !value.trim())) {
    error.value = field.invalid || "请输入有效值。";
    if (!returnFocus) close(false);
    return;
  }
  error.value = "";
  pending = true;
  try {
    const accepted = await apply(field.type === "number" ? Number(value) : value);
    await nextTick();
    if (!editing.value) return;
    if (accepted && (field.type || field.allowEmpty || String(props.editor.value ?? "") !== initial || value.trim() === initial.trim())) {
      close(returnFocus && input.value === document.activeElement);
    } else {
      error.value ||= "修改未生效，请核对后重试。";
    }
  } finally {pending = false;}
}
async function apply(value) {
  error.value = "";
  try {
    const result = await props.editor.apply(value);
    if (result?.error || result?.ok === false) {error.value = "修改未生效，请核对后重试。"; return false;}
    return true;
  } catch {error.value = "修改未生效，请核对后重试。"; return false;}
}
function keyDown(event) {
  if (composing.value || event.isComposing || event.keyCode === 229) {event.stopPropagation(); return;}
  if (event.key === "Escape") {event.preventDefault(); event.stopPropagation(); error.value = ""; close(true);}
  if (event.key === "Enter" && !(props.editor.type === "note" && event.shiftKey)) {
    event.preventDefault(); event.stopPropagation(); finish(true);
  }
}
function choose(event) {
  const option = props.editor.options.find(item => String(item.value) === event.target.value);
  if (option && !option.disabled && String(option.value) !== String(props.editor.value)) {
    const select = event.target;
    apply(option.value).finally(() => { select.value = props.editor.value; });
  }
}
watch(() => props.editor.disabled, disabled => {if (disabled && editing.value && !pending) close(false);});
defineExpose({start});
</script>

<style scoped>
.ui-inline-field { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 0 .35em; max-width: 100%; min-width: 0; }
.ui-inline-field .ui-inline-trigger, .ui-inline-choice, .ui-inline-field .ui-inline-reset {
  appearance: none; position: relative; font: inherit; line-height: inherit; color: inherit; text-align: start;
  background: transparent; border: 0; padding: 0; min-height: 24px; min-width: 0; max-width: 100%; cursor: pointer;
  text-decoration: underline dotted; text-underline-offset: .23em; text-decoration-color: var(--ui-border, #b7a88a);
}
.ui-inline-field .ui-inline-trigger, .ui-inline-choice { white-space: pre-wrap; overflow-wrap: anywhere; }
.ui-inline-choice { display: inline-block; }
.ui-inline-color { width: 100%; min-width: 0; font-weight: normal; }
.ui-inline-swatch { display: inline-block; width: .85em; height: .85em; margin-right: .4em; border: 1px solid var(--panel-border); }
.ui-inline-choice select, .ui-inline-choice input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.ui-inline-field .ui-inline-trigger:hover, .ui-inline-choice:hover { text-decoration-style: solid; }
.ui-inline-field :focus-visible, .ui-inline-choice:focus-within { outline: 2px solid var(--ui-accent, #34666a); outline-offset: 2px; }
.ui-inline-field .ui-inline-reset { text-decoration: none; width: 24px; text-align: center; }
.ui-inline-field :disabled, .ui-inline-choice.is-disabled { cursor: default; text-decoration: none; }
.ui-inline-field .ui-inline-input { min-width: 0; width: 100%; box-sizing: border-box; font: inherit; }
.ui-inline-field small { flex-basis: 100%; font-weight: normal; }
</style>
