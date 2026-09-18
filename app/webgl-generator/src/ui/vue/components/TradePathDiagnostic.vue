<template><section class="trade-path-diagnostic"><button :disabled="busy" @click="inspect">{{ busy ? '正在检查…' : '检查现有路网' }}</button><p role="status">{{ result?.message || '按需检查交易两端的道路、支路和海路，不改变交易或运费。' }}</p></section></template>
<script setup>
import {ref, watch, onBeforeUnmount} from "vue";
import {diagnoseTradePath} from "../../../runtime/trade-path-diagnostics.js";
const props = defineProps({map: Object, dealId: [String, Number], version: Number});
const busy = ref(false), result = ref(null); let sequence = 0;
function invalidate() { ++sequence; busy.value = false; result.value = null; }
watch(() => [props.map, props.dealId, props.version], invalidate);
onBeforeUnmount(invalidate);
async function inspect() { const ticket = ++sequence; busy.value = true;
  try { const response = await diagnoseTradePath(props.map, props.dealId, () => ticket === sequence); if (ticket === sequence && !response.stale) result.value = response; }
  catch { if (ticket === sequence) result.value = {message: "道路资料无法读取，暂不能判断。"}; }
  finally { if (ticket === sequence) busy.value = false; }
}
</script>
<style scoped>.trade-path-diagnostic{padding:10px;border:1px solid var(--panel-border,#ced8e0);border-radius:8px;margin:8px 0}.trade-path-diagnostic p{margin:8px 0 0;line-height:1.5}.trade-path-diagnostic button{min-height:32px}</style>
