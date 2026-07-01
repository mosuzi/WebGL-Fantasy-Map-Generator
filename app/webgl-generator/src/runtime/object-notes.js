export const OBJECT_NOTES_VERSION = 1;

export function objectNoteId(target) {
  const kind = String(target?.kind || "").trim();
  const id = target?.id ?? target?.objectId;
  if (!kind || id === null || id === undefined || id === "") return "";
  return `${kind}:${id}`;
}

export function readObjectNote(map, target) {
  const id = typeof target === "string" ? target : objectNoteId(target);
  if (!id) return null;
  return (map?.notes?.notes || []).find(note => note?.id === id) || null;
}

export function restoreObjectNote(map, note) {
  if (!note?.id) return null;
  const store = ensureNotesStore(map);
  const normalized = normalizeNote(note);
  const index = store.notes.findIndex(item => item?.id === normalized.id);
  if (index >= 0) store.notes[index] = normalized;
  else store.notes.push(normalized);
  refreshNotesMetadata(store);
  return normalized;
}

export function deleteObjectNote(map, target) {
  const id = typeof target === "string" ? target : objectNoteId(target);
  if (!id || !map?.notes?.notes) return;
  map.notes.notes = map.notes.notes.filter(note => note?.id !== id);
  refreshNotesMetadata(map.notes);
}

export function ensureNotesStore(map) {
  if (!map.notes || typeof map.notes !== "object") {
    map.notes = {
      notes: [],
      metadata: {
        notes: 0,
        formatVersion: OBJECT_NOTES_VERSION
      }
    };
  }
  if (!Array.isArray(map.notes.notes)) map.notes.notes = [];
  if (!map.notes.metadata || typeof map.notes.metadata !== "object") map.notes.metadata = {};
  map.notes.metadata.formatVersion = OBJECT_NOTES_VERSION;
  refreshNotesMetadata(map.notes);
  return map.notes;
}

export function cloneObjectNote(note) {
  return note ? JSON.parse(JSON.stringify(note)) : null;
}

function normalizeNote(note) {
  const now = new Date().toISOString();
  return {
    id: String(note.id),
    kind: String(note.kind || ""),
    objectId: note.objectId,
    name: String(note.name || ""),
    body: String(note.body || ""),
    format: note.format || "plain",
    pinned: Boolean(note.pinned),
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now
  };
}

function refreshNotesMetadata(store) {
  store.metadata = {
    ...store.metadata,
    notes: store.notes.length,
    formatVersion: OBJECT_NOTES_VERSION
  };
}
