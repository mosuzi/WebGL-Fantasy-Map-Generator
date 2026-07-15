import {objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {resolveObject} from "./object-resolver.js";

export const NOTES_SUMMARY_TYPE = "webgl-generator-notes-summary";
export const NOTES_SUMMARY_VERSION = 1;

const NOTE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});
const IMPORTABLE_NOTE_KINDS = new Set(Object.values(OBJECT_KIND));

export function inspectNotesImport(input, map, {mode = "append"} = {}) {
  const importMode = mode === "replace" ? "replace" : "append";
  const parsed = parseNotesDocument(input);
  if (!parsed.ok) return invalidPreview(importMode, parsed.diagnostic);
  const document = parsed.document;
  if (document?.type !== NOTES_SUMMARY_TYPE) {
    return invalidPreview(importMode, diagnostic(-1, "", "invalid-type", `备注文档类型必须是 ${NOTES_SUMMARY_TYPE}`, "error"));
  }
  if (Number(document?.version) !== NOTES_SUMMARY_VERSION) {
    return invalidPreview(importMode, diagnostic(-1, "", "unsupported-version", `不支持备注文档版本 ${document?.version ?? "missing"}`, "error"));
  }
  if (!Array.isArray(document.notes)) {
    return invalidPreview(importMode, diagnostic(-1, "", "missing-notes", "备注文档缺少 notes 数组", "error"));
  }

  const diagnostics = [];
  const notes = [];
  const seen = new Set();
  const existingIds = new Set((map?.notes?.notes || []).map(note => String(note?.id || "")).filter(Boolean));
  let duplicateIds = 0;
  let missingObjects = 0;
  let existingConflicts = 0;
  for (const [index, source] of document.notes.entries()) {
    const record = normalizeImportedNote(source, index);
    if (!record.valid) {
      diagnostics.push(record.diagnostic);
      continue;
    }
    if (seen.has(record.note.id)) {
      duplicateIds += 1;
      diagnostics.push(diagnostic(index, record.note.id, "duplicate-id", `文件内备注 id 重复：${record.note.id}`));
      continue;
    }
    seen.add(record.note.id);
    if (existingIds.has(record.note.id)) existingConflicts += 1;
    const orphan = isImportedNoteOrphan(map, record.note);
    if (orphan) {
      missingObjects += 1;
      diagnostics.push(diagnostic(index, record.note.id, "missing-object", `备注对象不存在：${record.note.id}`, "warning"));
    }
    notes.push({...record.note, orphan});
  }

  const invalid = diagnostics.filter(item => item.severity === "error").length;
  return {
    validDocument: true,
    canImport: notes.length > 0 && invalid < document.notes.length,
    mode: importMode,
    total: document.notes.length,
    valid: notes.length,
    invalid,
    duplicateIds,
    missingObjects,
    existingConflicts,
    replaceCount: importMode === "replace" ? map?.notes?.notes?.length || 0 : 0,
    diagnostics,
    notes,
    metadata: document.metadata && typeof document.metadata === "object" ? {...document.metadata} : {}
  };
}

export function createImportNotesCommand(input, {mode = "append", label = "导入备注摘要"} = {}) {
  let previous = null;
  let captured = false;
  let result = null;
  const command = {
    label,
    domain: "note",
    effects: {...NOTE_EFFECTS, affected: objectAffected("note", "import")},
    apply(context) {
      const preview = requireImportablePreview(inspectNotesImport(input, context.map, {mode}));
      if (!captured) {
        previous = cloneStore(context.map.notes) ?? null;
        captured = true;
      }
      const nextNotes = buildImportedNotes(context.map, preview);
      context.map.notes = {notes: [], metadata: cloneStore(context.map.notes?.metadata) || {}};
      for (const note of nextNotes) restoreObjectNote(context.map, note);
      command.effects.affected = preview.notes.map(note => ({kind: "note", id: note.id}));
      result = {...preview, notes: preview.notes.map(stripPreviewFields)};
    },
    revert(context) {
      if (!captured) throw new Error("缺少可撤销的备注导入快照");
      if (previous === null) delete context.map.notes;
      else context.map.notes = cloneStore(previous);
    },
    isNoop(context) {
      const preview = requireImportablePreview(inspectNotesImport(input, context.map, {mode}));
      return sameNotes(buildImportedNotes(context.map, preview), context.map?.notes?.notes || []);
    },
    getResult() {
      return result ? cloneStore(result) : null;
    }
  };
  return command;
}

export function createDeleteNotesBatchCommand(noteIds, {label = "批量删除备注"} = {}) {
  const ids = [...new Set((Array.isArray(noteIds) ? noteIds : []).map(id => String(id || "").trim()).filter(Boolean))];
  let previousStore = null;
  let deletedCount = 0;
  let captured = false;
  return {
    label: `${label} ${ids.length} 条`,
    domain: "note",
    effects: {...NOTE_EFFECTS, affected: ids.map(id => ({kind: "note", id}))},
    apply(context) {
      if (!captured) {
        previousStore = cloneStore(context.map.notes) ?? null;
        deletedCount = ids.filter(id => (context.map?.notes?.notes || []).some(note => note?.id === id)).length;
        captured = true;
      }
      for (const id of ids) deleteObjectNote(context.map, id);
    },
    revert(context) {
      if (!captured) throw new Error("缺少可撤销的备注批量删除快照");
      if (previousStore === null) delete context.map.notes;
      else context.map.notes = cloneStore(previousStore);
    },
    isNoop(context) {
      return !ids.some(id => (context.map?.notes?.notes || []).some(note => note?.id === id));
    },
    getDeletedCount() {
      return deletedCount;
    }
  };
}

function parseNotesDocument(input) {
  if (typeof input === "string") {
    try {
      return {ok: true, document: JSON.parse(input)};
    } catch (error) {
      return {ok: false, diagnostic: diagnostic(-1, "", "invalid-json", `备注 JSON 无法解析：${error.message}`, "error")};
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {ok: false, diagnostic: diagnostic(-1, "", "invalid-document", "备注导入内容必须是 JSON 对象或字符串", "error")};
  }
  return {ok: true, document: input};
}

function normalizeImportedNote(source, index) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {valid: false, diagnostic: diagnostic(index, "", "invalid-record", "备注记录必须是对象")};
  }
  const id = String(source.id || "").trim();
  const kind = String(source.kind || "").trim();
  const objectId = source.objectId;
  if (!id) return {valid: false, diagnostic: diagnostic(index, "", "missing-id", "备注记录缺少 id")};
  if (!kind) return {valid: false, diagnostic: diagnostic(index, id, "missing-kind", "备注记录缺少 kind")};
  if (!IMPORTABLE_NOTE_KINDS.has(kind)) return {valid: false, diagnostic: diagnostic(index, id, "unknown-kind", `备注对象类型不受支持：${kind}`)};
  if (objectId === null || objectId === undefined || objectId === "") {
    return {valid: false, diagnostic: diagnostic(index, id, "missing-object-id", "备注记录缺少 objectId")};
  }
  if (id !== objectNoteId({kind, id: objectId})) {
    return {valid: false, diagnostic: diagnostic(index, id, "id-mismatch", `备注 id 与 kind/objectId 不一致：${id}`)};
  }
  if (source.format && source.format !== "plain") {
    return {valid: false, diagnostic: diagnostic(index, id, "unsupported-format", `备注格式仅支持 plain：${source.format}`)};
  }
  if (source.body !== undefined && typeof source.body !== "string") {
    return {valid: false, diagnostic: diagnostic(index, id, "invalid-body", "备注正文必须是字符串")};
  }
  const note = {
    id,
    kind,
    objectId,
    name: typeof source.name === "string" ? source.name : "",
    body: source.body || "",
    format: "plain",
    pinned: Boolean(source.pinned),
    createdAt: validDateText(source.createdAt),
    updatedAt: validDateText(source.updatedAt)
  };
  if (source.standalone === true || kind === "note") {
    note.standalone = true;
    note.packCell = Number.isInteger(Number(source.packCell)) ? Number(source.packCell) : -1;
    note.x = Number(source.x);
    note.y = Number(source.y);
  }
  return {valid: true, note};
}

function isImportedNoteOrphan(map, note) {
  if (note.standalone) {
    const width = Number(map?.metadata?.graphWidth);
    const height = Number(map?.metadata?.graphHeight);
    const cellCount = map?.pack?.cells?.i?.length || map?.pack?.cells?.p?.length || 0;
    return !Number.isInteger(note.packCell) || note.packCell < 0 || note.packCell >= cellCount ||
      !Number.isFinite(note.x) || !Number.isFinite(note.y) || note.x < 0 || note.y < 0 || note.x > width || note.y > height;
  }
  const object = objectFromImportedNote(note);
  return !object || !resolveObject(map, object);
}

function objectFromImportedNote(note) {
  if (note.kind === "label") {
    const [targetKind, rawTargetId] = String(note.objectId).split(":");
    if (!targetKind || rawTargetId === undefined) return null;
    return {kind: "label", id: parseObjectId(rawTargetId), targetKind, targetId: parseObjectId(rawTargetId), targetName: note.name || ""};
  }
  return {kind: note.kind, id: parseObjectId(note.objectId)};
}

function parseObjectId(value) {
  const text = String(value ?? "");
  return /^\d+$/.test(text) ? Number(text) : text;
}

function buildImportedNotes(map, preview) {
  const output = preview.mode === "replace" ? [] : (map?.notes?.notes || []).map(cloneObjectNote);
  const indexes = new Map(output.map((note, index) => [note.id, index]));
  for (const source of preview.notes) {
    const note = stripPreviewFields(source);
    const index = indexes.get(note.id);
    if (index === undefined) {
      indexes.set(note.id, output.length);
      output.push(note);
    } else {
      output[index] = note;
    }
  }
  return output;
}

function requireImportablePreview(preview) {
  if (preview.canImport) return preview;
  const first = preview.diagnostics?.[0];
  const error = new Error(first?.message || "备注文档没有可导入记录");
  error.code = first?.code || "notes-import-empty";
  error.preview = preview;
  throw error;
}

function invalidPreview(mode, item) {
  return {
    validDocument: false,
    canImport: false,
    mode,
    total: 0,
    valid: 0,
    invalid: 1,
    duplicateIds: 0,
    missingObjects: 0,
    existingConflicts: 0,
    replaceCount: 0,
    diagnostics: [item],
    notes: [],
    metadata: {}
  };
}

function diagnostic(index, id, code, message, severity = "error") {
  return {index, id, code, message, severity};
}

function stripPreviewFields(note) {
  const {orphan, ...persisted} = note;
  return cloneStore(persisted);
}

function validDateText(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return String(value);
}

function sameNotes(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneStore(value) {
  return value === undefined ? undefined : value === null ? null : JSON.parse(JSON.stringify(value));
}
