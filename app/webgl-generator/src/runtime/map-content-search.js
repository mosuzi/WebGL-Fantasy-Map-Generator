import {collectObjectReferences, listObjectTypes} from "./object-query-api.js";
import {resolveObject, resolveTradeFlow} from "./object-resolver.js";

export const MAP_SEARCH_EVENT = "webfmg-map-search";
export const SEARCH_TYPES = listObjectTypes().map(({type, label}) => ({type, label: type === "note" ? "备注" : label}));
const TEXT_FIELDS = ["name", "fullName", "text", "label", "targetName", "state", "province", "from", "to", "sellerName", "buyerName", "goodName", "centerBurg", "subjectName", "objectName", "description", "statusLabel", "relationLabel", "categoryLabel", "resourceLabel"];
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const normalized = value => String(value ?? "").trim().toLocaleLowerCase();
const compareNames = new Intl.Collator("zh-CN").compare;

export async function buildSearchIndex(map, isCurrent = () => true) {
  await pause();
  if (!isCurrent()) return null;
  const result = [];
  // 搜索逐条读取大量交易时复用 ID 索引，避免反复从交易列表头扫描。
  const deals = new Map();
  for (const deal of map?.pack?.deals || []) if (deal && !deals.has(Number(deal.i))) deals.set(Number(deal.i), deal);
  let deadline = performance.now() + 8;
  for (const {type, label} of SEARCH_TYPES) {
    if (type === "note") continue;
    for (const ref of collectObjectReferences(map, type)) {
      if (performance.now() >= deadline) {
        await pause();
        if (!isCurrent()) return null;
        deadline = performance.now() + 8;
      }
      let value;
      try { value = type === "trade-flow" ? resolveTradeFlow(map, ref, deals.get(Number(ref.id))) : resolveObject(map, ref); } catch { continue; }
      if (!value || value.removed) continue;
      const text = TEXT_FIELDS.map(field => value[field]).filter(item => typeof item === "string" && item);
      const name = value.fullName || value.name || value.text || value.label || text.join(" · ") || `${label} #${ref.id}`;
      result.push({key: JSON.stringify(ref), type, label, ref, name, text: text.join(" · "), body: "", names: [name, value.name, value.fullName, value.text, value.label, String(ref.id)].filter(item => item != null).map(normalized)});
    }
  }
  for (const note of map?.notes?.notes || []) {
    if (!note) continue;
    const ref = {kind: note.kind, id: note.objectId};
    result.push({key: `note:${note.id}`, type: "note", label: "备注", ref, noteId: note.id,
      name: note.name || `备注 ${note.id}`, text: note.standalone ? "独立备注" : `绑定对象 #${note.objectId}`,
      body: String(note.body || ""), names: [note.name, note.id].map(normalized)});
  }
  return isCurrent() ? result : null;
}

export function searchIndex(index, {query = "", type = "", page = 0, limit = 50} = {}) {
  const needle = normalized(query);
  const matches = [];
  for (const item of index) {
    if (type && item.type !== type) continue;
    const rank = !needle || item.names.some(name => name === needle) ? 0 : item.names.some(name => name.startsWith(needle)) ? 1
      : item.names.some(name => name.includes(needle)) ? 2 : normalized(item.text).includes(needle) ? 3 : normalized(item.body).includes(needle) ? 4 : -1;
    if (rank < 0) continue;
    const at = Math.max(0, normalized(item.body).indexOf(needle) - 40);
    matches.push({...item, rank, snippet: item.body ? item.body.slice(at, at + 200) : item.text});
  }
  matches.sort((a, b) => a.rank - b.rank || compareNames(a.name, b.name) || a.key.localeCompare(b.key));
  const last = Math.max(0, Math.ceil(matches.length / limit) - 1);
  page = Math.min(last, Math.max(0, page));
  return {total: matches.length, page, pages: last + 1, items: matches.slice(page * limit, (page + 1) * limit)};
}

export function installMapContentSearch(documentRef, {getMap, getBinding, canLocate, locate, view}) {
  let cache = null;
  let building = null;
  const signature = () => JSON.stringify(getBinding());
  const onRequest = async event => {
    const {action = "search", respond, ...request} = event.detail || {};
    if (typeof respond !== "function") return;
    const binding = signature();
    try {
      if (action === "search") {
        if (!getMap()) return respond({items: [], total: 0, pages: 1, page: 0, binding});
        if (cache?.binding !== binding) {
          if (building?.binding !== binding) building = {binding, promise: buildSearchIndex(getMap(), () => signature() === binding)};
          const items = await building.promise;
          if (!items || signature() !== binding) return respond({stale: true});
          cache = {binding, items};
        }
        respond({...searchIndex(cache.items, request), binding});
      } else {
        if (request.binding !== binding || cache?.binding !== binding) return respond({stale: true});
        const item = cache.items.find(item => item.key === request.key);
        if (!item) return respond({stale: true});
        const resolved = resolveObject(getMap(), item.ref);
        const locatable = Boolean(resolved && canLocate(item.ref));
        if (action === "locate" && locatable) locate(item.ref);
        if (action === "view" && resolved) view(item.ref);
        respond({item, locatable, orphan: !resolved});
      }
    } catch { respond({error: "暂时无法读取此内容，请刷新搜索结果后重试。"}); }
  };
  documentRef.addEventListener(MAP_SEARCH_EVENT, onRequest);
  return {dispose: () => documentRef.removeEventListener(MAP_SEARCH_EVENT, onRequest)};
}
