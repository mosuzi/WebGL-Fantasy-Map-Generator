<template>
  <div ref="root" :class="['ui-select-field', className, {'is-disabled': disabled, 'is-open': open}]">
    <span :id="labelId" class="ui-select-label">{{ label }}</span>
    <span class="ui-select-shell">
      <select
        :id="inputId || null"
        class="ui-select-native"
        :value="stringValue(currentValue)"
        :disabled="disabled"
        tabindex="-1"
        aria-hidden="true"
        @change="onNativeChange"
      >
        <option
          v-for="option in options"
          :key="stringValue(optionValue(option))"
          :value="stringValue(optionValue(option))"
        >
          {{ optionLabel(option) }}
        </option>
      </select>

      <button
        type="button"
        class="ui-select-trigger"
        :disabled="disabled"
        :aria-labelledby="labelId"
        aria-haspopup="listbox"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="menuId"
        @click="toggleOpen"
        @keydown="onTriggerKeydown"
      >
        <span>{{ selectedLabel }}</span>
      </button>
      <i class="ui-select-arrow" aria-hidden="true"></i>

      <Teleport to="body">
        <div
          v-if="open"
          :id="menuId"
          ref="menu"
          class="ui-select-menu"
          role="listbox"
          :aria-labelledby="labelId"
          :style="menuStyle"
        >
          <button
            v-for="option in options"
            :key="stringValue(optionValue(option))"
            ref="optionButtons"
            type="button"
            class="ui-select-option"
            :class="{active: stringValue(optionValue(option)) === stringValue(currentValue)}"
            role="option"
            :aria-selected="stringValue(optionValue(option)) === stringValue(currentValue) ? 'true' : 'false'"
            @click="selectOption(option)"
            @keydown="onOptionKeydown"
          >
            {{ optionLabel(option) }}
          </button>
        </div>
      </Teleport>
    </span>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";

defineOptions({
  name: "UiSelectField"
});

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  inputId: {
    type: String,
    default: ""
  },
  modelValue: {
    type: [String, Number, Boolean],
    default: ""
  },
  options: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  },
  className: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["update:modelValue", "change"]);

const root = ref(null);
const menu = ref(null);
const optionButtons = ref([]);
const open = ref(false);
const currentValue = ref(props.modelValue);
const menuStyle = ref({});
const instanceId = `ui-select-${Math.random().toString(36).slice(2, 10)}`;
const labelId = `${instanceId}-label`;
const menuId = `${instanceId}-menu`;
const selectedOption = computed(() => props.options.find(option => stringValue(optionValue(option)) === stringValue(currentValue.value)));
const selectedLabel = computed(() => selectedOption.value ? optionLabel(selectedOption.value) : "请选择");

watch(() => props.modelValue, next => {
  currentValue.value = next;
});

watch(open, isOpen => {
  if (isOpen) {
    nextTick(() => {
      updateMenuPosition();
      focusSelectedOption();
      addMenuPositionListeners();
    });
    return;
  }
  removeMenuPositionListeners();
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  removeMenuPositionListeners();
});

function onNativeChange(event) {
  const selected = props.options.find(option => stringValue(optionValue(option)) === event.target.value);
  const value = selected ? optionValue(selected) : event.target.value;
  if (stringValue(value) === stringValue(currentValue.value)) return;
  commitValue(value, {dispatchNative: false});
}

function toggleOpen() {
  if (props.disabled) return;
  open.value = !open.value;
}

function selectOption(option) {
  commitValue(optionValue(option));
  open.value = false;
}

function commitValue(value, {dispatchNative = true} = {}) {
  currentValue.value = value;
  emit("update:modelValue", value);
  emit("change", value);
  if (!dispatchNative || !props.inputId) return;
  nextTick(() => {
    const select = root.value?.querySelector("select");
    if (!select) return;
    select.value = stringValue(value);
    select.dispatchEvent(new Event("change", {bubbles: true}));
  });
}

function onTriggerKeydown(event) {
  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open.value = true;
    focusSelectedOption();
  }
}

function onOptionKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    open.value = false;
    root.value?.querySelector(".ui-select-trigger")?.focus();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const buttons = optionButtons.value.filter(Boolean);
  const index = buttons.indexOf(event.currentTarget);
  const delta = event.key === "ArrowDown" ? 1 : -1;
  buttons[(index + delta + buttons.length) % buttons.length]?.focus();
}

function focusSelectedOption() {
  nextTick(() => {
    const buttons = optionButtons.value.filter(Boolean);
    const index = Math.max(0, props.options.findIndex(option => stringValue(optionValue(option)) === stringValue(currentValue.value)));
    buttons[index]?.focus();
  });
}

function onDocumentPointerDown(event) {
  if (!open.value || root.value?.contains(event.target) || menu.value?.contains(event.target)) return;
  open.value = false;
}

function addMenuPositionListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.addEventListener("resize", updateMenuPosition);
  view.addEventListener("scroll", updateMenuPosition, true);
}

function removeMenuPositionListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.removeEventListener("resize", updateMenuPosition);
  view.removeEventListener("scroll", updateMenuPosition, true);
}

function updateMenuPosition() {
  const trigger = root.value?.querySelector(".ui-select-trigger");
  const view = root.value?.ownerDocument?.defaultView || window;
  if (!trigger || !view) return;
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = view.innerWidth || 1024;
  const viewportHeight = view.innerHeight || 768;
  const margin = 8;
  const maxHeight = Math.min(260, Math.max(140, viewportHeight * 0.48));
  const longestLabel = props.options.reduce((max, option) => Math.max(max, optionLabel(option).length), 0);
  const preferredWidth = Math.max(rect.width, Math.min(360, 190 + longestLabel * 8), 260);
  const width = Math.min(preferredWidth, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
  const below = viewportHeight - rect.bottom - margin;
  const above = rect.top - margin;
  const openBelow = below >= Math.min(maxHeight, 180) || below >= above;
  const top = openBelow ? rect.bottom + 5 : Math.max(margin, rect.top - maxHeight - 5);

  menuStyle.value = {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`
  };
}

function optionValue(option) {
  return option?.value ?? option?.id ?? option?.burgId ?? option?.key ?? "";
}

function optionLabel(option) {
  return option?.label ?? option?.name ?? String(optionValue(option));
}

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value);
}
</script>
