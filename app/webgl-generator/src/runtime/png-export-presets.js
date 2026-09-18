import {resolvePersistedDocumentIdentity} from "./persisted-document-identity.js";
import {pngOutputSize} from "./png-export-size.js";
const STORAGE_KEY = "webgl-generator-png-presets-v1";
export const PNG_PRESET_EVENT = "webfmg-png-preset";
const IDS = ["scale", "crop-mode", "crop-x", "crop-y", "crop-width", "crop-height", "overlays", "transparent", "overlay-labels", "overlay-city-icons", "overlay-markers", "overlay-military", "overlay-measurements", "overlay-legend", "overlay-scale-bar", "explicit-size", "output-width"];
export function installPngPresets(documentRef, getMap) {
  const element = key => documentRef.getElementById(`export-png-${key}`);
  const read = () => { try { const values = JSON.parse(documentRef.defaultView.localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(values) ? values.filter(item => item?.name && item.controls).slice(0,20) : []; } catch { return []; } };
  const write = values => documentRef.defaultView.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  const context = () => {
    const map = getMap(); if (!map) throw new Error("请先打开地图。");
    const mode = element("crop-mode")?.value;
    const rect = mode === "map" ? {width: map.metadata.graphWidth, height: map.metadata.graphHeight} : ["pixel", "world"].includes(mode) ? {width: Number(element("crop-width").value), height: Number(element("crop-height").value)} : documentRef.getElementById("map-canvas").getBoundingClientRect();
    return {map, mode, size: pngOutputSize(Number(element("output-width")?.value || 2048), null, rect.width / rect.height)};
  };
  const listener = event => {
    const {action, name, respond} = event.detail || {}; if (typeof respond !== "function") return;
    try {
      if (action === "list") return respond({presets: read()});
      if (action === "size") return respond(context().size);
      const presets = read();
      if (action === "save") {
        const label = String(name || "").trim().slice(0,64); if (!label) throw new Error("请输入预设名称。");
        const {map, mode} = context();
        const controls = Object.fromEntries(IDS.map(id => {const node = element(id); return [id, node?.type === "checkbox" ? node.checked : node?.value];}));
        const item = {name: label, controls, documentId: mode === "world" ? resolvePersistedDocumentIdentity(map).documentId : null};
        const next = presets.filter(item => item.name !== label); if (next.length >= 20) throw new Error("最多保留 20 个预设，请先删除旧预设。");
        write([...next, item]);
      } else if (action === "delete") write(presets.filter(item => item.name !== name));
      else if (action === "apply") {
        const preset = presets.find(item => item.name === name); if (!preset) throw new Error("预设已不存在。");
        if (preset.controls["crop-mode"] === "world" && preset.documentId !== resolvePersistedDocumentIdentity(getMap()).documentId) throw new Error("固定世界范围属于另一份地图，请在原图使用，或重新设置范围。");
        for (const id of IDS) { const node = element(id); if (!node || preset.controls[id] == null) continue;
          if (node.type === "checkbox") { if (node.checked !== Boolean(preset.controls[id])) node.click(); }
          else { node.value = String(preset.controls[id]); node.dispatchEvent(new Event("input", {bubbles: true})); node.dispatchEvent(new Event("change", {bubbles: true})); }
        }
      }
      respond({presets: read(), message: "预设已更新。"});
    } catch (error) { respond({error: error.message || "预设无法保存，请检查浏览器可用空间。"}); }
  };
  documentRef.addEventListener(PNG_PRESET_EVENT, listener);
  return {dispose: () => documentRef.removeEventListener(PNG_PRESET_EVENT, listener)};
}
