<template>
  <form :class="[className, 'ui-hsl-color-field']" @submit.prevent="applyColor">
    <div class="ui-hsl-color-header">
      <span>{{ label }}</span>
      <i class="ui-hsl-color-swatch" :style="{backgroundColor: value}"></i>
      <strong>{{ value }}</strong>
    </div>

    <label class="ui-hsl-channel ui-hsl-channel-hue">
      <span>H</span>
      <input type="range" min="0" max="360" step="1" :value="hsl.hue" @input="event => setChannel('hue', event.target.value)" />
      <input type="number" min="0" max="360" step="1" :value="hsl.hue" @input="event => setChannel('hue', event.target.value)" />
    </label>

    <label class="ui-hsl-channel">
      <span>S</span>
      <input type="range" min="0" max="100" step="1" :value="hsl.saturation" :style="{background: saturationGradient}" @input="event => setChannel('saturation', event.target.value)" />
      <input type="number" min="0" max="100" step="1" :value="hsl.saturation" @input="event => setChannel('saturation', event.target.value)" />
    </label>

    <label class="ui-hsl-channel">
      <span>L</span>
      <input type="range" min="0" max="100" step="1" :value="hsl.lightness" :style="{background: lightnessGradient}" @input="event => setChannel('lightness', event.target.value)" />
      <input type="number" min="0" max="100" step="1" :value="hsl.lightness" @input="event => setChannel('lightness', event.target.value)" />
    </label>

    <label class="ui-hsl-hex-field">
      <span>HEX</span>
      <input v-model="hexDraft" type="text" spellcheck="false" :class="{invalid: !hexDraftValid}" @blur="commitHexDraft" @keydown.enter.prevent="commitHexDraft" />
    </label>

    <div class="ui-hsl-predefined" aria-label="预设颜色">
      <button
        v-for="color in predefinedColors"
        :key="color"
        type="button"
        :class="{active: color.toLowerCase() === value.toLowerCase()}"
        :style="{backgroundColor: color}"
        :aria-label="`选择 ${color}`"
        @click="setColor(color)"
      ></button>
    </div>

    <UiButton variant="secondary" button-type="submit">{{ actionLabel }}</UiButton>
  </form>
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import UiButton from "./UiButton.vue";

defineOptions({
  name: "UiColorField"
});

const props = defineProps({
  modelValue: {
    type: String,
    default: "#ffffff"
  },
  label: {
    type: String,
    default: "颜色"
  },
  actionLabel: {
    type: String,
    default: "应用颜色"
  },
  className: {
    type: String,
    default: "object-color-editor"
  }
});

const emit = defineEmits(["apply"]);

const value = ref(normalizeHexColor(props.modelValue) || "#ffffff");
const hexDraft = ref(value.value);
const hsl = reactive(hexToHsl(value.value));
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

watch(() => props.modelValue, next => {
  setColor(next || "#ffffff");
});

function setChannel(channel, rawValue) {
  const limits = channel === "hue" ? [0, 360] : [0, 100];
  hsl[channel] = clamp(Math.round(Number(rawValue) || 0), limits[0], limits[1]);
  value.value = hslToHex(hsl.hue, hsl.saturation, hsl.lightness);
  hexDraft.value = value.value;
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
}

function applyColor() {
  commitHexDraft();
  emit("apply", value.value);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const normalized = color.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(normalized);
  if (short) return `#${short[1].split("").map(char => char + char).join("")}`.toLowerCase();
  const full = /^#?([0-9a-f]{6})$/i.exec(normalized);
  return full ? `#${full[1].toLowerCase()}` : null;
}

function hexToHsl(color) {
  const normalized = normalizeHexColor(color) || "#ffffff";
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
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
