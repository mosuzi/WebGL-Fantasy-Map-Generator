import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";

const RIVER_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

export function createSetRiverWidthFactorCommand(riverId, nextValue) {
  const nextWidthFactor = normalizeWidthFactor(nextValue);
  let previousWidthFactor = null;
  let hadPreviousWidthFactor = false;
  let capturedPrevious = false;

  return {
    label: `调整河流 #${riverId} 宽度因子`,
    effects: {
      ...EDIT_REFRESH_PRESETS.RIVER_WIDTH_ONLY,
      affected: [{kind: "river", id: riverId}]
    },
    apply(context) {
      const river = findRiver(context.map, riverId);
      if (!river) throw new Error(`找不到河流 #${riverId}`);
      if (!capturedPrevious) {
        hadPreviousWidthFactor = Object.prototype.hasOwnProperty.call(river, "widthFactor");
        previousWidthFactor = river.widthFactor;
        capturedPrevious = true;
      }
      river.widthFactor = nextWidthFactor;
    },
    revert(context) {
      const river = findRiver(context.map, riverId);
      if (!river) throw new Error(`找不到河流 #${riverId}`);
      if (hadPreviousWidthFactor) {
        river.widthFactor = previousWidthFactor;
      } else {
        delete river.widthFactor;
      }
    },
    isNoop(context) {
      const river = findRiver(context.map, riverId);
      return river ? normalizeWidthFactor(river.widthFactor) === nextWidthFactor : true;
    }
  };
}

export function createSetRiverNoteCommand(riverId, body, {name = ""} = {}) {
  const normalizedRiverId = Number(riverId);
  const target = {kind: OBJECT_KIND.RIVER, id: normalizedRiverId};
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑河流备注 #${normalizedRiverId}` : `清空河流备注 #${normalizedRiverId}`,
    effects: {
      ...RIVER_NOTE_EFFECTS,
      affected: [{kind: OBJECT_KIND.RIVER, id: normalizedRiverId}]
    },
    apply(context) {
      const river = findRiver(context.map, normalizedRiverId);
      if (!river) throw new Error(`找不到河流 #${normalizedRiverId}`);
      previous ??= cloneObjectNote(readObjectNote(context.map, target));
      if (!normalizedBody) {
        deleteObjectNote(context.map, target);
        return;
      }
      next ??= createRiverNoteSnapshot(target, normalizedBody, {
        name: name || river.name || `河流 #${normalizedRiverId}`,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, target);
    },
    isNoop(context) {
      const river = findRiver(context.map, normalizedRiverId);
      if (!river) return true;
      const current = readObjectNote(context.map, target)?.body || "";
      return current === normalizedBody;
    }
  };
}

function findRiver(map, riverId) {
  return map?.rivers?.rivers?.find(river => river.id === riverId) || null;
}

function normalizeWidthFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.2, Math.min(3, numeric));
}

function createRiverNoteSnapshot(target, body, {name, previous = null} = {}) {
  const now = new Date().toISOString();
  return {
    id: objectNoteId(target),
    kind: target.kind,
    objectId: target.id,
    name,
    body,
    format: "plain",
    pinned: previous?.pinned || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}
