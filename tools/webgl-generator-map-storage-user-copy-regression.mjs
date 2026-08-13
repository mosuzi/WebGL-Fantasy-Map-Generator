import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {browserMapSaveLoadingMessage} from "../app/webgl-generator/src/ui/map-storage-user-copy.js";

const expected = Object.freeze({
  initial: "正在收拢全图资料",
  normalize: "正在收拢全图资料",
  stringify: "正在收拢全图资料",
  compress: "正在压制存档体积",
  package: "正在整理存档内容",
  "result-stream-complete": "正在整理存档内容",
  "storage-write": "正在妥存至浏览器",
  complete: "地图存档已经妥善收好"
});

for (const [stage, message] of Object.entries(expected)) {
  assert.equal(browserMapSaveLoadingMessage(stage), message, `${stage} 保存文案错误`);
}

const forbidden = /Worker|worker|线程|会话|消息包|结构化克隆|picking|buffer|LocalStorage|IndexedDB|Blob|浏览器概念/i;
for (const message of Object.values(expected)) assert.doesNotMatch(message, forbidden, `保存普通文案泄漏技术词：${message}`);

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const saveAction = sliceBetween(appSource, "saveBrowserMap: (options = {})", "restoreBrowserMap: (options = {})");
const saveImplementation = sliceBetween(appSource, "async function saveMapToBrowserStorageViaApi", "async function exportCompressedAllMapDataViaWorker");
assert.match(saveAction, /browserMapSaveLoadingMessage\("collect"\)/, "保存入口没有使用收拢阶段文案");
assert.match(saveImplementation, /progressMessage: stage => browserMapSaveLoadingMessage\(stage\)/, "存档 Worker 阶段没有映射为用户文案");
assert.match(saveImplementation, /browserMapSaveLoadingMessage\("package"\)/, "保存缺少存档整理阶段");
assert.match(saveImplementation, /browserMapSaveLoadingMessage\("write-storage"\)/, "保存缺少浏览器妥存阶段");

console.log(JSON.stringify({ok: true, stages: expected, technicalLeaks: 0}, null, 2));

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法定位源码片段：${start} -> ${end}`);
  return source.slice(startIndex, endIndex);
}
