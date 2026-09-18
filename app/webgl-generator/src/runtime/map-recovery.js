import {resolvePersistedDocumentIdentity} from "./persisted-document-identity.js";

const DATABASE = "webgl-generator-recovery-v1";
const PREFERENCE = "webgl-generator-auto-recovery";
export const RECOVERY_BUDGET_BYTES = 64 * 1024 * 1024;
export const RECOVERY_COMMAND = "webgl-generator-recovery-command";
export const RECOVERY_STATUS = "webgl-generator-recovery-status";

export function recoveryPruneIds(records, newest, budget = RECOVERY_BUDGET_BYTES) {
  if (newest.bytes > budget) throw new Error("recovery-budget");
  const ordered = records.filter(item => item.id !== newest.id).sort((a, b) => b.createdAt - a.createdAt);
  let bytes = newest.bytes;
  let branchCount = 1;
  const removed = [];
  for (const record of ordered) {
    const recordBytes = record.blob?.size ?? Math.max(0, Number(record.bytes) || 0);
    const sameBranch = record.documentId === newest.documentId && record.writerId === newest.writerId;
    if ((sameBranch && branchCount >= 3) || bytes + recordBytes > budget) removed.push(record.id);
    else { bytes += recordBytes; if (sameBranch) branchCount++; }
  }
  return removed;
}

function openDatabase(view) {
  return new Promise((resolve, reject) => {
    const request = view.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("points", {keyPath: "id"});
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRecords(view) {
  const db = await openDatabase(view);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("points", "readonly");
      const request = transaction.objectStore("points").getAll();
      transaction.oncomplete = () => resolve(request.result || []);
      transaction.onabort = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function writeRecord(view, record) {
  const db = await openDatabase(view);
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("points", "readwrite");
      const store = transaction.objectStore("points");
      const request = store.getAll();
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error("recovery-write-failed"));
      request.onsuccess = () => {
        try {
          const removed = recoveryPruneIds(request.result, record);
          store.put(record);
          for (const id of removed) store.delete(id);
        } catch { transaction.abort(); }
      };
    });
  } finally { db.close(); }
}

function validRecord(record) {
  return record?.type === "map-recovery-v1" && typeof record.id === "string" && Number.isFinite(record.createdAt)
    && record.blob instanceof Blob && record.bytes > 0 && record.bytes === record.blob.size;
}

export function installMapRecovery(documentRef, {getMap, getStatus, canRun, createPayload, restore}) {
  const view = documentRef.defaultView;
  const writer = view.crypto.randomUUID();
  let enabled = false;
  try { enabled = view.localStorage.getItem(PREFERENCE) === "true"; } catch { /* 恢复点仍可手动创建。 */ }
  let busy = false;
  let records = [];
  let message = "恢复点独立于手动存档；开启后每半分钟检查修改。";
  let lastContent = "";
  let disposed = false;
  const publish = () => documentRef.dispatchEvent(new view.CustomEvent(RECOVERY_STATUS, {detail: {
    enabled, busy, message, records: records.map(item => ({id: item.id, name: item.name || "未命名地图", createdAt: item.createdAt, bytes: item.bytes, valid: validRecord(item)}))
  }}));
  const refresh = async () => { records = (await readRecords(view)).sort((a, b) => b.createdAt - a.createdAt); publish(); };
  const save = async () => {
    const status = getStatus();
    if (!status.available || !canRun()) return;
    const {identity, position, presentation} = status.current;
    const content = JSON.stringify([identity, position, presentation]);
    if (content === lastContent) return;
    const documentId = resolvePersistedDocumentIdentity(getMap()).documentId;
    const name = getMap()?.metadata?.name || getMap()?.options?.mapName || "未命名地图";
    const payload = await createPayload();
    if (disposed || getStatus().current.identity !== identity) return;
    if (!payload.blob?.size) throw new Error("empty-recovery");
    const point = {type: "map-recovery-v1", id: view.crypto.randomUUID(), documentId,
      writerId: `${writer}:${identity}`, createdAt: Date.now(), name, blob: payload.blob, bytes: payload.blob.size};
    await writeRecord(view, point);
    lastContent = content;
    message = "恢复点已保存；手动存档未覆盖。";
    await refresh();
  };
  const run = async operation => {
    if (busy || disposed) return;
    busy = true; publish();
    try { await operation(); }
    catch { message = "恢复点操作未完成，旧记录已保留。可重试或使用手动地图存档。"; }
    finally { busy = false; publish(); }
  };
  const handler = event => {
    const request = event.detail || {};
    if (request.action === "enabled") {
      enabled = request.value === true;
      try { view.localStorage.setItem(PREFERENCE, String(enabled)); } catch { message = "本次设置生效，但未能记住偏好。"; }
      publish();
      if (enabled) void run(save);
    } else if (request.action === "refresh") void run(refresh);
    else if (request.action === "save") void run(save);
    else if (request.action === "restore") void run(async () => {
      if (!canRun()) return;
      const identity = getStatus().current.identity;
      const record = (await readRecords(view)).find(item => item.id === request.id);
      if (!validRecord(record)) throw new Error("invalid-recovery");
      if (identity !== getStatus().current.identity) return;
      if (!view.confirm(`恢复“${record.name}”将替换当前地图并清空撤销历史，是否继续？`)) return;
      await restore(record.blob);
      message = "已恢复所选地图。原恢复点保持，可继续编辑或另存。";
    });
  };
  documentRef.addEventListener(RECOVERY_COMMAND, handler);
  const timer = view.setInterval(() => { if (enabled) void run(save); }, 30000);
  void run(refresh);
  return {refresh: () => run(refresh), save: () => run(save), dispose() {
    disposed = true; view.clearInterval(timer); documentRef.removeEventListener(RECOVERY_COMMAND, handler);
  }};
}
