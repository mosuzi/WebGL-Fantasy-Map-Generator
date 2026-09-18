<template>
  <section class="city-update-guidance" aria-label="城市关联更新">
    <span v-if="!guidance.known">本次尚无关联更新记录；既有结果是否最新未知。</span>
    <template v-else-if="guidance.domains.length">
      <p>修改原因：{{ guidance.reasons.join('、') }}。所属人口统计已即时同步，其余结果需显式更新。</p>
      <div class="ui-action-icon-row">
        <UiButton v-for="domain in guidance.domains" :key="domain.id" @click="$emit('open', domain.id)">查看{{ domain.label }}操作</UiButton>
      </div>
      <small>重建道路或军事会替换未锁结果；存在相关锁时提示可能保留，请核对受保护对象。</small>
    </template>
    <span v-else>本次记录的关联修改已处理。</span>
  </section>
</template>
<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import UiButton from "./base/UiButton.vue";
import {CITY_GUIDANCE_EVENT} from "../../../runtime/city-update-guidance.js";
const props = defineProps({cityId: Number, read: Function});
defineEmits(["open"]);
const revision = ref(0);
const changed = () => revision.value++;
const guidance = computed(() => { revision.value; return props.read?.(props.cityId) || {known: false, reasons: [], domains: []}; });
onMounted(() => document.addEventListener(CITY_GUIDANCE_EVENT, changed));
onBeforeUnmount(() => document.removeEventListener(CITY_GUIDANCE_EVENT, changed));
</script>
<style scoped>
.city-update-guidance { margin-block: 10px; padding: 8px; border: 1px solid var(--el-border-color); border-radius: 6px; }
p { margin: 0 0 6px; }
small { display: block; margin-top: 6px; }
</style>
