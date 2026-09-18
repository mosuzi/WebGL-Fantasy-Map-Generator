<template><section class="png-presets" aria-label="PNG 输出尺寸和预设">
  <label><input id="export-png-explicit-size" type="checkbox" @change="refreshSize" />指定像素尺寸（锁定比例）</label>
  <div class="png-preset-row"><label>宽 <input id="export-png-output-width" type="number" min="1" max="8192" value="2048" @input="refreshSize" /> px</label><span>{{ size }}</span></div>
  <div class="png-preset-row"><input v-model="name" maxlength="64" aria-label="PNG 预设名称" placeholder="预设名称" /><button @click="act('save')">保存预设</button></div>
  <div class="png-preset-row"><select v-model="selected" aria-label="PNG 已存预设"><option value="">选择预设</option><option v-for="item in presets" :key="item.name">{{ item.name }}</option></select><button :disabled="!selected" @click="act('apply')">应用</button><button :disabled="!selected" @click="act('delete')">删除</button></div>
  <p role="status">{{ message || '全幅与固定世界范围的输出尺寸独立于窗口；预设保存在此浏览器。' }}</p>
</section></template>
<script setup>
import {ref, onMounted, onBeforeUnmount} from "vue";
import {PNG_PRESET_EVENT} from "../../../runtime/png-export-presets.js";
const name=ref(""),selected=ref(""),presets=ref([]),message=ref(""),size=ref(""); let timer;
function request(payload) { document.dispatchEvent(new CustomEvent(PNG_PRESET_EVENT,{detail:{...payload,respond: response=>{if(response.presets)presets.value=response.presets; if(response.error)message.value=response.error; else if(response.message)message.value=response.message; if(response.height)size.value=`高 ${response.height} px`;}}})); }
function act(action){request({action,name:action==='save'?name.value:selected.value}); refreshSize();}
function refreshSize(){request({action:'size'});}
onMounted(()=>{request({action:'list'});timer=setInterval(refreshSize,1500);});onBeforeUnmount(()=>clearInterval(timer));
</script>
<style scoped>.png-presets{padding:10px;border: 1px solid var(--panel-border,var(--panel-border));border-radius:8px;margin:8px 0}.png-preset-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}.png-preset-row input,.png-preset-row select{min-width:0;max-width:100%;flex:1}.png-presets input[type=number]{width:90px}.png-presets button,.png-presets select,.png-presets input:not([type=checkbox]){min-height:30px}</style>
