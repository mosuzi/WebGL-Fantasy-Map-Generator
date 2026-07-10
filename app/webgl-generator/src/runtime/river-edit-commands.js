import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {namebaseRenameAffected, objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {createChineseNameGenerator} from "../generator/names.js";

const RIVER_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

const RIVER_NAME_BATCH_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "labels", "object-panels"])
});

export function createSetRiverWidthFactorCommand(riverId, nextValue) {
  const nextWidthFactor = normalizeWidthFactor(nextValue);
  let previousWidthFactor = null;
  let hadPreviousWidthFactor = false;
  let capturedPrevious = false;

  return {
    label: `调整河流 #${riverId} 宽度因子`,
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...EDIT_REFRESH_PRESETS.RIVER_WIDTH_ONLY,
      affected: objectAffected(OBJECT_KIND.RIVER, riverId)
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
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...RIVER_NOTE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.RIVER, normalizedRiverId)
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

export function createRenameRiversFromNamebaseCommand(riverIds, {label = "按名称库重命名河流"} = {}) {
  const targets = uniqueRiverIds(riverIds);
  let changes = null;

  return {
    label: `${label} ${targets.length} 条`,
    domain: OBJECT_KIND.RIVER,
    effects: {
      ...RIVER_NAME_BATCH_EFFECTS,
      affected: namebaseRenameAffected(OBJECT_KIND.RIVER, targets)
    },
    apply(context) {
      changes ??= buildRiverRenameChanges(context.map, targets);
      if (!changes.length) throw new Error("没有可重命名的河流");
      for (const change of changes) writeRiverName(context.map, change.id, change.afterName);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的河流名称快照");
      for (const change of changes) writeRiverName(context.map, change.id, change.beforeName);
    },
    isNoop(context) {
      return !targets.length || !buildRiverRenameChanges(context.map, targets).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: targets.length};
    }
  };
}

function findRiver(map, riverId) {
  return map?.rivers?.rivers?.find(river => river.id === riverId) || null;
}

function buildRiverRenameChanges(map, riverIds) {
  const rivers = map?.rivers?.rivers || [];
  if (!rivers.length) return [];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|explicit-river-rename|${map.metadata?.checksum || ""}`, {namebases: map.namebases});
  const changes = [];
  for (const id of riverIds) {
    const river = findRiver(map, id);
    if (!river) continue;
    const afterName = generator.makeRiverName(riverNameOptions(map, river));
    const beforeName = river.name || "";
    if (!afterName || afterName === beforeName) continue;
    changes.push({id, beforeName, afterName});
  }
  return changes;
}

function riverNameOptions(map, river) {
  const source = Number.isInteger(river.source) ? river.source : river.cells?.[0];
  const cultureId = Number.isInteger(source) ? map?.pack?.cells?.culture?.[source] || 0 : 0;
  const culture = map?.pack?.cultures?.[cultureId] || map?.society?.cultures?.[cultureId];
  return {
    id: river.id,
    cell: source,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    flux: river.discharge || river.flux,
    type: river.parent ? "branch" : "river"
  };
}

function writeRiverName(map, riverId, name) {
  const river = findRiver(map, riverId);
  if (!river) throw new Error(`找不到河流 #${riverId}`);
  river.name = name;
}

function uniqueRiverIds(riverIds) {
  return [...new Set((riverIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
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
