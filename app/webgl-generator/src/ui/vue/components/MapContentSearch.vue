<template>
  <UiButton id="open-map-search" class="map-search-open" variant="secondary" aria-label="搜索地图内容" @click="openSearch">搜索</UiButton>
  <dialog ref="dialog" class="map-search-dialog" aria-modal="true" aria-label="搜索地图内容" @close="stop" @keydown.esc="stop">
    <header><strong>搜索地图内容</strong><button aria-label="关闭搜索" title="关闭搜索" @click="dialog.close()">×</button></header>
    <div class="map-search-filters">
      <input ref="input" v-model="query" aria-label="地图搜索关键词" placeholder="名称、编号、标签或备注正文" @compositionstart="composing = true" @compositionend="composing = false; schedule()" @keydown="navigate" />
      <select v-model="type" aria-label="搜索内容类型"><option value="">全部类型</option><option v-for="item in SEARCH_TYPES" :key="item.type" :value="item.type">{{ item.label }}</option></select>
    </div>
    <p role="status">{{ error || (busy ? '正在查找…' : hasSearchCriteria ? `共 ${result.total} 项` : '输入关键词，或选择一种内容类型开始查找。') }}</p>
    <ul v-if="hasSearchCriteria" class="map-search-results" aria-label="搜索结果">
      <li v-for="(item, index) in result.items" :key="item.key">
        <button data-layout-multiline="搜索结果分别显示名称、类型和摘要" :class="{selected: index === selected}" @click="select(index)" @keydown="navigate"><strong>{{ item.name }}</strong><small>{{ item.label }}<span v-if="debugEnabled" data-debug-id> · #{{ item.ref.id }}</span></small><span>{{ item.snippet }}</span></button>
      </li>
    </ul>
    <div v-if="hasSearchCriteria && result.pages > 1" class="map-search-pages"><button :disabled="!result.page || busy" @click="page--; run()">上一页</button><span>{{ result.page + 1 }} / {{ result.pages }}</span><button :disabled="result.page + 1 >= result.pages || busy" @click="page++; run()">下一页</button></div>
    <section v-if="detail" class="map-search-detail" aria-label="搜索内容详情">
      <strong>{{ detail.item.name }}</strong><p>{{ detail.item.text }}</p><pre v-if="detail.item.body">{{ detail.item.body }}</pre>
      <button v-if="detail.locatable" @click="locateSelected">定位到地图</button><p v-else>此内容没有可用位置，可以在此阅读。</p>
    </section>
  </dialog>
</template>

<script setup>
import {ref, computed, watch, onBeforeUnmount, nextTick} from "vue";
import UiButton from "./base/UiButton.vue";
import {useDebugMode} from "../composables/use-debug-mode.js";
const debugEnabled = useDebugMode();
import {MAP_SEARCH_EVENT, SEARCH_TYPES} from "../../../runtime/map-content-search.js";
const dialog = ref(null), input = ref(null), query = ref(""), type = ref(""), page = ref(0), selected = ref(0), busy = ref(false), error = ref(""), detail = ref(null);
const result = ref({items: [], total: 0, page: 0, pages: 1});
const hasSearchCriteria = computed(() => !!query.value.trim() || !!type.value);
let composing = false, timer, refreshTimer, sequence = 0;
const request = payload => new Promise(respond => document.dispatchEvent(new CustomEvent(MAP_SEARCH_EVENT, {detail: {...payload, respond}})));
async function run() {
  if (!hasSearchCriteria.value) {
    ++sequence; busy.value = false; error.value = ""; detail.value = null;
    result.value = {items: [], total: 0, page: 0, pages: 1};
    return;
  }
  const ticket = ++sequence; busy.value = true;
  const response = await request({query: query.value, type: type.value, page: page.value});
  if (ticket !== sequence || !dialog.value?.open) return;
  busy.value = false; error.value = response.error || "";
  if (response.stale) return schedule();
  if (response.error) return;
  if (result.value.binding !== response.binding) detail.value = null;
  result.value = response; page.value = response.page; selected.value = Math.min(selected.value, Math.max(0, response.items.length - 1));
}
function schedule() { if (composing || !dialog.value?.open) return; clearTimeout(timer); timer = setTimeout(run, 180); }
watch([query, type], () => { page.value = 0; selected.value = 0; detail.value = null; schedule(); });
async function select(index) {
  selected.value = index;
  const item = result.value.items[index]; if (!item) return;
  const ticket = ++sequence;
  const response = await request({action: "view", key: item.key, binding: result.value.binding});
  if (ticket !== sequence) return;
  busy.value = false;
  if (response.stale) { detail.value = null; return run(); }
  error.value = response.error || ""; detail.value = response.item ? response : null;
}
async function locateSelected() {
  const response = await request({action: "locate", key: detail.value.item.key, binding: result.value.binding});
  if (response.stale || response.error) { detail.value = null; return run(); }
  dialog.value.close();
}
function navigate(event) {
  if (composing || event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); selected.value = Math.max(0, Math.min(result.value.items.length - 1, selected.value + (event.key === "ArrowDown" ? 1 : -1))); dialog.value.querySelectorAll('.map-search-results button')[selected.value]?.scrollIntoView({block: "nearest"}); }
  if (event.key === "Enter") { event.preventDefault(); select(selected.value); }
}
function openSearch() { dialog.value.showModal(); run(); refreshTimer = setInterval(() => { if (!busy.value && !composing) run(); }, 1500); nextTick(() => input.value.focus()); }
function stop() { ++sequence; clearTimeout(timer); clearInterval(refreshTimer); }
onBeforeUnmount(stop);
</script>

<style scoped>
.map-search-dialog{width:min(680px,calc(100vw - 32px));max-height:85vh;box-sizing:border-box;padding:16px;border: 1px solid var(--panel-border);border-radius:12px;color: var(--panel-text);background: var(--panel-surface);overflow:auto}
.map-search-dialog::backdrop{background:#172b4d55}
.map-search-dialog header,.map-search-filters,.map-search-pages{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.map-search-dialog header{justify-content:space-between;margin-bottom:12px}
.map-search-dialog input{flex:1;min-width:160px}.map-search-dialog :is(input,select,button){font:inherit;min-height:32px;border: 1px solid var(--panel-border);border-radius:6px;padding:5px 9px;background: var(--panel-surface);color:inherit}
.map-search-dialog button{cursor:pointer}.map-search-dialog button:disabled{opacity:.5;cursor:default}.map-search-dialog :is(button,input,select):focus-visible{outline: 2px solid var(--panel-accent);outline-offset:2px}
.map-search-results{list-style:none;padding:0;margin:8px 0;max-height:35vh;overflow:auto}.map-search-results button{display:flex;flex-direction:column;text-align:left;width:100%;gap:4px;margin-bottom:5px;overflow-wrap:anywhere}.map-search-results .selected{background: var(--panel-accent-soft);border-color:var(--panel-accent)}small{color:var(--panel-muted)}.map-search-detail{border-top: 1px solid var(--panel-border);margin-top:12px;padding-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:25vh;overflow:auto}
</style>
