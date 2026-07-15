import {cloneObjectNote, deleteObjectNote, ensureNotesStore, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {objectAffected} from "./edit-command-effects.js";
import {OBJECT_KIND} from "./object-kinds.js";

const NOTE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

export function inspectStandaloneNoteCreation(map, options = {}) {
  const name = normalizeText(options.name) || "独立备注";
  const body = normalizeBody(options.body);
  const point = resolveStandaloneNotePoint(map, options);
  if (!point.valid) return point;
  const requestedId = normalizeStandaloneNoteId(options.id);
  if (options.id !== undefined && !requestedId) return invalidStandaloneNote("invalid-id", "独立备注 id 不能为空或包含冒号");
  const objectId = requestedId || nextStandaloneNoteId(map);
  const id = objectNoteId({kind: OBJECT_KIND.NOTE, id: objectId});
  if (readObjectNote(map, id)) return invalidStandaloneNote("duplicate-id", `独立备注 ${id} 已存在`);
  return {valid: true, code: "ok", reason: "", id, objectId, name, body, ...point};
}

export function createStandaloneNoteCommand(options = {}) {
  let created = null;
  const command = {
    label: "新增独立备注",
    domain: OBJECT_KIND.NOTE,
    effects: {...NOTE_EFFECTS, affected: objectAffected(OBJECT_KIND.NOTE, "new")},
    apply(context) {
      const preview = inspectStandaloneNoteCreation(context.map, options);
      if (!preview.valid) throw standaloneNoteError(preview);
      const now = new Date().toISOString();
      created ??= {
        id: preview.id,
        kind: OBJECT_KIND.NOTE,
        objectId: preview.objectId,
        name: preview.name,
        body: preview.body,
        format: "plain",
        pinned: false,
        standalone: true,
        packCell: preview.packCell,
        x: preview.x,
        y: preview.y,
        createdAt: now,
        updatedAt: now
      };
      restoreObjectNote(context.map, created);
      command.effects.affected = objectAffected(OBJECT_KIND.NOTE, created.objectId);
    },
    revert(context) {
      if (!created) throw new Error("缺少可撤销的独立备注快照");
      deleteObjectNote(context.map, created.id);
    },
    isNoop(context) {
      const preview = inspectStandaloneNoteCreation(context.map, options);
      if (!preview.valid) throw standaloneNoteError(preview);
      return false;
    },
    getResult() {
      return created ? cloneObjectNote(created) : null;
    }
  };
  return command;
}

export function createDeleteNoteCommand(noteId, {name = ""} = {}) {
  const id = String(noteId || "").trim();
  let previous = null;
  return {
    label: `删除备注 ${name || id}`,
    domain: "note",
    effects: {
      ...NOTE_EFFECTS,
      affected: objectAffected("note", id)
    },
    apply(context) {
      if (!id) return;
      previous ??= cloneObjectNote(readObjectNote(context.map, id));
      deleteObjectNote(context.map, id);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
    },
    isNoop(context) {
      return !id || !readObjectNote(context.map, id);
    }
  };
}

function resolveStandaloneNotePoint(map, options) {
  const count = map?.pack?.cells?.i?.length || map?.pack?.cells?.p?.length || 0;
  if (options.packCell !== undefined && options.packCell !== null && options.packCell !== "") {
    const packCell = Number(options.packCell);
    if (!Number.isInteger(packCell) || packCell < 0 || packCell >= count) return invalidStandaloneNote("invalid-pack-cell", "独立备注 pack cell 无效");
    const point = map.pack.cells.p?.[packCell];
    if (!validPoint(point)) return invalidStandaloneNote("missing-cell-point", "目标 pack cell 缺少有效坐标");
    return {valid: true, packCell, x: Number(point[0]), y: Number(point[1])};
  }
  const x = Number(options.x);
  const y = Number(options.y);
  const width = Number(map?.metadata?.graphWidth);
  const height = Number(map?.metadata?.graphHeight);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) {
    return invalidStandaloneNote("invalid-coordinate", "独立备注坐标必须位于地图范围内");
  }
  let packCell = -1;
  let distance = Infinity;
  for (let cell = 0; cell < count; cell += 1) {
    const point = map.pack.cells.p?.[cell];
    if (!validPoint(point)) continue;
    const nextDistance = Math.hypot(Number(point[0]) - x, Number(point[1]) - y);
    if (nextDistance >= distance) continue;
    distance = nextDistance;
    packCell = cell;
  }
  if (packCell < 0) return invalidStandaloneNote("missing-pack-cell", "独立备注坐标无法映射到 pack cell");
  return {valid: true, packCell, x, y};
}

function nextStandaloneNoteId(map) {
  const used = new Set((ensureNotesStore(map).notes || [])
    .filter(note => note?.kind === OBJECT_KIND.NOTE)
    .map(note => String(note.objectId || "")));
  let serial = 1;
  while (used.has(String(serial))) serial += 1;
  return String(serial);
}

function normalizeStandaloneNoteId(value) {
  const id = normalizeText(value);
  return id && !id.includes(":") ? id : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeBody(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
}

function invalidStandaloneNote(code, reason) {
  return {valid: false, code, reason};
}

function standaloneNoteError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}
