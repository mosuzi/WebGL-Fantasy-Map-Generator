<template>
  <section class="orphan-rescue">
    <UiNoteField :key="note.id" :model-value="note.body" @apply="body => rescue({body})" @clear="rescue({body: ''})" />
    <div class="orphan-rescue-target">
      <select v-model="kind" aria-label="重新绑定对象类型"><option value="state">国家</option><option value="province">省份</option><option value="city">城市</option></select>
      <input v-model="query" placeholder="筛选目标名称或编号" aria-label="筛选重新绑定目标" />
      <select v-model="targetId" aria-label="重新绑定目标"><option value="">选择目标</option><option v-for="item in targets" :key="item.id" :value="item.id">{{ item.name }}{{ debugEnabled ? ` · #${item.id}` : '' }}</option></select>
      <button :disabled="targetId === ''" @click="rescue({target: {kind, id: targetId}})">重新绑定</button>
    </div><p>正文和标题保留；目标已有备注时不会覆盖。保存正文后再重新绑定。</p>
  </section>
</template>
<script setup>
import {ref, computed, watch} from "vue";
import {useDebugMode} from "../composables/use-debug-mode.js";
const debugEnabled = useDebugMode();
import UiNoteField from "./base/UiNoteField.vue";
const props = defineProps({map: Object, note: Object, version: Number, onRescue: Function});
const kind = ref("city"), query = ref(""), targetId = ref("");
const targets = computed(() => { void props.version; const values = kind.value === "city" ? props.map?.settlements?.cities : props.map?.politics?.[kind.value === "state" ? "states" : "provinces"];
  return (values || []).filter(item => item && !item.removed).map(item => ({id: item.id ?? item.i, name: item.fullName || item.name || "未命名"})).filter(item => `${item.name} ${item.id}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())); });
watch([kind, () => props.map, () => props.note.id], () => { targetId.value = ""; });
function rescue(patch) { props.onRescue?.(props.note, patch, props.map); }
</script>
<style scoped>.orphan-rescue{border-top: 1px solid var(--panel-border,var(--panel-border));padding-top:10px}.orphan-rescue-target{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.orphan-rescue-target>*{min-height:32px;max-width:100%}.orphan-rescue-target input{flex:1;min-width:140px}</style>
