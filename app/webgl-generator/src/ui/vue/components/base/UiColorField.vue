<template>
  <ElPopover v-model:visible="open" trigger="click" placement="bottom-start" :width="300" :popper-options="placementOptions"
    :persistent="false" :disabled="disabled" :show-arrow="false" :hide-after="0" popper-class="ui-color-popover"
    @after-enter="focusPicker" @before-leave="onClose">
    <template #reference>
      <button ref="trigger" class="ui-color-trigger" type="button" :aria-label="triggerLabel || `编辑${label}`"
        :aria-controls="popupId" :aria-expanded="open" aria-haspopup="dialog" :disabled="disabled">
        <i :style="{backgroundColor: modelValue}" aria-hidden="true"></i><span>{{ modelValue }}</span>
      </button>
    </template>
    <div ref="picker" :id="popupId" :class="[className, 'ui-hsl-color-field']" role="dialog" aria-label="调色板">
      <div class="ui-hsl-color-header">
        <span>{{ label }}</span>
        <i class="ui-hsl-color-swatch" :style="{backgroundColor: value}"></i>
        <strong>{{ value }}</strong>
        <div class="ui-color-modes" role="group" aria-label="颜色模式">
          <button v-for="option in ['HSL', 'RGB']" :key="option" type="button"
            :aria-pressed="mode === option" @click="mode = option">{{ option }}</button>
        </div>
      </div>

      <UiColorPickerPanel v-if="mode === 'RGB'" :color="value" @preview="setColor" @apply="chooseColor" />

      <div class="ui-color-channels" :class="{'is-rgb': mode === 'RGB'}">
        <div v-for="channel in channels" :key="channel.key" class="ui-hsl-channel">
          <span :title="channel.name">{{ channel.short }}</span>
          <input v-if="mode === 'HSL'" type="range" min="0" :max="channel.max" step="1" :value="channel.value" :aria-label="channel.name + '滑块'"
            :style="{background: channel.gradient}" @input="setChannel(channel, $event.target.valueAsNumber)" @change="commitColor" />
          <input type="number" min="0" :max="channel.max" step="1" :value="channel.value" :aria-label="channel.name"
            @input="previewNumber(channel, $event.target)"
            @change="commitNumber(channel, $event.target)" @keydown.enter.prevent="commitNumber(channel, $event.target)" />
        </div>
      </div>

      <label class="ui-hsl-hex-field">
        <span>HEX</span>
        <input v-model="hexDraft" type="text" spellcheck="false" :class="{invalid: !hexDraftValid}" @input="lastEmittedColor = null" @blur="commitHexDraft" @keydown.enter.prevent="commitHexDraft" />
      </label>

      <div class="ui-hsl-predefined" aria-label="预设颜色">
        <button
          v-for="color in predefinedColors"
          :key="color"
          type="button"
          :class="{active: color.toLowerCase() === value.toLowerCase()}"
          :style="{backgroundColor: color}"
          :aria-label="`选择 ${color}`"
          @pointerdown.prevent
          @click="chooseColor(color)"
        ></button>
      </div>
    </div>
  </ElPopover>
</template>

<script>
import {ref} from "vue";

const mode = ref("HSL");
</script>

<script setup>
import {computed, reactive, useId, watch} from "vue";
import UiColorPickerPanel from "./UiColorPickerPanel.vue";

defineOptions({
  name: "UiColorField"
});

const props = defineProps({
  disabled: Boolean,
  triggerLabel: String,
  modelValue: {
    type: String,
    default: "#ffffff"
  },
  label: {
    type: String,
    default: "颜色"
  },
  className: {
    type: String,
    default: "object-color-editor"
  }
});

const emit = defineEmits(["apply", "close"]);

const open = ref(false), trigger = ref(null), picker = ref(null);
const popupId = useId();
const placementOptions = {
  strategy: "fixed",
  modifiers: [
    {name: "flip", options: {fallbackPlacements: ["top-start", "right-start", "left-start"], padding: 8}},
    {name: "preventOverflow", options: {altAxis: true, tether: false, padding: 8}}
  ]
};
function focusPicker() {
  if (open.value && document.activeElement === trigger.value) picker.value?.querySelector('[aria-pressed="true"]')?.focus({preventScroll: true});
}
function onClose() {
  if (picker.value?.contains(document.activeElement)) trigger.value?.focus({preventScroll: true});
  setColor(props.modelValue);
  emit("close");
}
function openPicker() {
  if (!props.disabled && !open.value) trigger.value?.click();
}
defineExpose({openPicker});
const rgbChannels = [
  {key: "red", short: "R", name: "红色"},
  {key: "green", short: "G", name: "绿色"},
  {key: "blue", short: "B", name: "蓝色"}
];
const value = ref(normalizeHexColor(props.modelValue) || "#ffffff");
const hexDraft = ref(value.value);
const hsl = reactive(hexToHsl(value.value));
const rgb = computed(() => hexToRgb(value.value));
let lastEmittedColor = null;
const predefinedColors = [
  "#c94c4c",
  "#d7a84f",
  "#6aa56a",
  "#4f9cc9",
  "#7f6cc7",
  "#c86e9f",
  "#8aa6b0",
  "#d8d0bd"
];

const hexDraftValid = computed(() => Boolean(normalizeHexColor(hexDraft.value)));
const saturationGradient = computed(() => {
  const gray = hslToHex(hsl.hue, 0, hsl.lightness);
  const full = hslToHex(hsl.hue, 100, hsl.lightness);
  return `linear-gradient(to right, ${gray}, ${full})`;
});
const lightnessGradient = computed(() => {
  const middle = hslToHex(hsl.hue, hsl.saturation, 50);
  return `linear-gradient(to right, #000000, ${middle}, #ffffff)`;
});

const channels = computed(() => {
  if (mode.value === "HSL") return [
    {key: "hue", short: "H", name: "色相", max: 360, value: hsl.hue,
      gradient: "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)"},
    {key: "saturation", short: "S", name: "饱和度", max: 100, value: hsl.saturation, gradient: saturationGradient.value},
    {key: "lightness", short: "L", name: "亮度", max: 100, value: hsl.lightness, gradient: lightnessGradient.value}
  ];
  return rgbChannels.map(channel => ({...channel, max: 255, value: rgb.value[channel.key]}));
});

watch(() => props.modelValue, next => {
  if (normalizeHexColor(next) !== value.value) setColor(next);
  lastEmittedColor = null;
});

function setChannel(channel, next) {
  if (next === channel.value) return;
  if (mode.value === "RGB") {
    setColor(rgbToHex({...rgb.value, [channel.key]: next}));
    return;
  }
  hsl[channel.key] = next;
  value.value = hslToHex(hsl.hue, hsl.saturation, hsl.lightness);
  hexDraft.value = value.value;
  lastEmittedColor = null;
}

function previewNumber(channel, input) {
  if (input.validity.valid && Number.isFinite(input.valueAsNumber)) setChannel(channel, input.valueAsNumber);
}

function commitNumber(channel, input) {
  if (Number.isFinite(input.valueAsNumber)) {
    const next = clamp(Math.round(input.valueAsNumber), 0, channel.max);
    input.value = String(next);
    setChannel(channel, next);
    commitColor();
  } else {
    setColor(props.modelValue);
    input.value = String(channels.value.find(item => item.key === channel.key).value);
  }
}

function setColor(color) {
  const normalized = normalizeHexColor(color) || "#ffffff";
  value.value = normalized;
  hexDraft.value = normalized;
  const next = hexToHsl(normalized);
  hsl.hue = next.hue;
  hsl.saturation = next.saturation;
  hsl.lightness = next.lightness;
}

function commitHexDraft() {
  const normalized = normalizeHexColor(hexDraft.value);
  if (!normalized) {
    hexDraft.value = value.value;
    return;
  }
  setColor(normalized);
  commitColor();
}

function chooseColor(color) {
  setColor(color);
  lastEmittedColor = null;
  commitColor();
}

function commitColor() {
  const color = normalizeHexColor(value.value);
  if (!color || color === normalizeHexColor(props.modelValue) || color === lastEmittedColor) return;
  lastEmittedColor = color;
  setTimeout(() => {
    if (lastEmittedColor === color) lastEmittedColor = null;
  }, 0);
  emit("apply", color);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const normalized = color.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(normalized);
  if (short) return `#${short[1].split("").map(char => char + char).join("")}`.toLowerCase();
  const full = /^#?([0-9a-f]{6})$/i.exec(normalized);
  return full ? `#${full[1].toLowerCase()}` : null;
}

function hexToRgb(color) {
  return {red: parseInt(color.slice(1, 3), 16), green: parseInt(color.slice(3, 5), 16), blue: parseInt(color.slice(5), 16)};
}

function rgbToHex({red, green, blue}) {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}

function hexToHsl(color) {
  const bytes = hexToRgb(color);
  const red = bytes.red / 255, green = bytes.green / 255, blue = bytes.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return {hue: 0, saturation: 0, lightness: Math.round(lightness * 100)};
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (max === green) hue = 60 * ((blue - red) / delta + 2);
  else hue = 60 * ((red - green) / delta + 4);
  return {
    hue: Math.round((hue + 360) % 360),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100)
  };
}

function hslToHex(hue, saturation, lightness) {
  const h = ((Number(hue) % 360) + 360) % 360;
  const s = clamp(Number(saturation) || 0, 0, 100) / 100;
  const l = clamp(Number(lightness) || 0, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (h < 60) [red, green, blue] = [c, x, 0];
  else if (h < 120) [red, green, blue] = [x, c, 0];
  else if (h < 180) [red, green, blue] = [0, c, x];
  else if (h < 240) [red, green, blue] = [0, x, c];
  else if (h < 300) [red, green, blue] = [x, 0, c];
  else [red, green, blue] = [c, 0, x];
  return `#${hexByte((red + m) * 255)}${hexByte((green + m) * 255)}${hexByte((blue + m) * 255)}`;
}

function hexByte(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
</script>
