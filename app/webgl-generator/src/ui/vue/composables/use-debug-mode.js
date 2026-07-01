import {onBeforeUnmount, onMounted, ref} from "vue";

export function useDebugMode() {
  const enabled = ref(readDebugEnabled());

  function sync(event) {
    enabled.value = typeof event?.detail?.enabled === "boolean"
      ? event.detail.enabled
      : readDebugEnabled();
  }

  onMounted(() => {
    sync();
    window.addEventListener("webgl-generator-debug-change", sync);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("webgl-generator-debug-change", sync);
  });

  return enabled;
}

function readDebugEnabled() {
  return Boolean(globalThis.window?.__webglGeneratorDebug?.enabled);
}
