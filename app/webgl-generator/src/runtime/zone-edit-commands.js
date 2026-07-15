import {OBJECT_KIND} from "./object-kinds.js";
import {objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, readObjectNote, restoreObjectNote} from "./object-notes.js";

const ZONE_STYLE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["line-layers", "object-panels"])
});

const ZONE_PATTERNS = new Set(["diagonal", "cross", "dots"]);
const ZONE_TYPES = new Set(["Warzone", "Invasion", "Rebels", "Proselytism", "Crusade", "Disease", "Disaster", "Eruption", "Avalanche", "Fault", "Flood", "Tsunami"]);

const ZONE_COLLECTION_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["line-layers", "object-panels", "object-index"])
});

export const ZONE_CREATION_TYPE_OPTIONS = Object.freeze([...ZONE_TYPES].map(value => Object.freeze({value, label: zoneTypeLabel(value)})));

export function inspectZoneCreation(map, options = {}) {
  const cells = map?.pack?.cells;
  const count = cells?.i?.length || cells?.h?.length || 0;
  if (!count) return invalidZoneCreation("missing-map", "当前地图没有可用 pack cells");
  const type = ZONE_TYPES.has(options.type) ? options.type : "Disaster";
  const id = options.id === undefined ? nextZoneId(map) : Number(options.id);
  if (!Number.isInteger(id) || id < 0) return invalidZoneCreation("invalid-id", "地区 id 必须是非负整数");
  if (findZone(map, id)) return invalidZoneCreation("duplicate-id", `地区 #${id} 已存在`);
  const rawCells = Array.isArray(options.packCells)
    ? options.packCells.map(Number)
    : expandZoneCells(cells, Number(options.centerPackCell), Number(options.radius));
  if (!rawCells.length) return invalidZoneCreation("empty-cells", "地区必须至少包含一个 pack cell");
  if (new Set(rawCells).size !== rawCells.length) return invalidZoneCreation("duplicate-cell", "地区 cells 不能重复");
  if (rawCells.length > 256) return invalidZoneCreation("too-many-cells", "地区最多包含 256 个 pack cells");
  if (rawCells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= count)) return invalidZoneCreation("invalid-cell", "地区包含超出范围的 pack cell");
  if (!connectedZoneCells(cells, rawCells)) return invalidZoneCreation("disconnected-cells", "地区 cells 必须在 pack 邻接图上连通");
  const occupied = new Set((map?.zones?.zones || map?.pack?.zones || []).flatMap(zone => zone?.cells || []).map(Number));
  if (rawCells.some(cell => occupied.has(cell))) return invalidZoneCreation("occupied-cell", "地区 cells 与既有地区重叠");
  const name = normalizeZoneName(options.name) || `${zoneTypeLabel(type)} #${id}`;
  const pattern = normalizeZonePattern(options.pattern) || defaultZonePattern(type);
  const hexColor = normalizeHexColor(options.hexColor || options.color) || defaultZoneColor(type);
  return {valid: true, code: "ok", reason: "", id, type, name, pattern, hexColor, packCells: rawCells};
}

export function createAddZoneCommand(options = {}) {
  let snapshot = null;
  let created = null;
  const command = {
    label: "新增地区",
    domain: OBJECT_KIND.ZONE,
    effects: {...ZONE_COLLECTION_EFFECTS, affected: objectAffected(OBJECT_KIND.ZONE, "new")},
    apply(context) {
      const preview = inspectZoneCreation(context.map, options);
      if (!preview.valid) throw zoneCreationError(preview);
      snapshot ??= captureZoneSnapshot(context.map);
      created ??= {
        i: preview.id,
        id: preview.id,
        name: preview.name,
        type: preview.type,
        cells: [...preview.packCells],
        color: `url(#${patternHatch(preview.pattern)})`,
        pattern: preview.pattern,
        hexColor: preview.hexColor,
        hidden: false
      };
      writeZoneCollection(context.map, [...readZones(context.map), clone(created)]);
      command.effects.affected = objectAffected(OBJECT_KIND.ZONE, created.id);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的地区创建快照");
      restoreZoneSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const preview = inspectZoneCreation(context.map, options);
      if (!preview.valid) throw zoneCreationError(preview);
      return false;
    },
    getResult() {
      return created ? {zoneId: created.id, cells: created.cells.length, type: created.type, name: created.name} : null;
    }
  };
  return command;
}

export function createDeleteZoneCommand(zoneId) {
  const id = Number(zoneId);
  let snapshot = null;
  return {
    label: `删除地区 #${id}`,
    domain: OBJECT_KIND.ZONE,
    effects: {...ZONE_COLLECTION_EFFECTS, affected: objectAffected(OBJECT_KIND.ZONE, id)},
    apply(context) {
      if (!findZone(context.map, id)) throw new Error(`找不到地区 #${id}`);
      snapshot ??= captureZoneSnapshot(context.map);
      writeZoneCollection(context.map, readZones(context.map).filter(zone => Number(zone?.i ?? zone?.id) !== id));
      deleteObjectNote(context.map, {kind: OBJECT_KIND.ZONE, id});
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的地区删除快照");
      restoreZoneSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      return !Number.isInteger(id) || id < 0 || !findZone(context.map, id);
    }
  };
}

export function createSetZoneStyleCommand(zoneId, patch = {}) {
  const normalizedZoneId = Number(zoneId);
  const normalizedPatch = normalizeZoneStylePatch(patch);
  let previous = null;

  return {
    label: `调整地区样式 #${normalizedZoneId}`,
    domain: OBJECT_KIND.ZONE,
    effects: {
      ...ZONE_STYLE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.ZONE, normalizedZoneId)
    },
    apply(context) {
      const zone = readZone(context.map, normalizedZoneId);
      previous ??= snapshotZoneStyle(zone);
      if (normalizedPatch.pattern) zone.pattern = normalizedPatch.pattern;
      if (normalizedPatch.hexColor) zone.hexColor = normalizedPatch.hexColor;
    },
    revert(context) {
      const zone = readZone(context.map, normalizedZoneId);
      restoreZoneStyle(zone, previous);
    },
    isNoop(context) {
      const zone = findZone(context.map, normalizedZoneId);
      if (!zone || !Object.keys(normalizedPatch).length) return true;
      return Object.entries(normalizedPatch).every(([key, value]) => normalizeComparableStyleValue(key, zone[key]) === value);
    }
  };
}

function readZone(map, zoneId) {
  const zone = findZone(map, zoneId);
  if (!zone) throw new Error(`找不到地区 #${zoneId}`);
  return zone;
}

function findZone(map, zoneId) {
  return (map?.zones?.zones || map?.pack?.zones || []).find(zone => Number(zone?.i ?? zone?.id) === Number(zoneId)) || null;
}

function snapshotZoneStyle(zone) {
  return {
    pattern: zone.pattern,
    hexColor: zone.hexColor
  };
}

function restoreZoneStyle(zone, snapshot) {
  restoreOptionalField(zone, "pattern", snapshot?.pattern);
  restoreOptionalField(zone, "hexColor", snapshot?.hexColor);
}

function restoreOptionalField(target, key, value) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function normalizeZoneStylePatch(patch) {
  const normalized = {};
  const pattern = normalizeZonePattern(patch.pattern);
  const hexColor = normalizeHexColor(patch.hexColor || patch.color);
  if (pattern) normalized.pattern = pattern;
  if (hexColor) normalized.hexColor = hexColor;
  return normalized;
}

function normalizeComparableStyleValue(key, value) {
  if (key === "pattern") return normalizeZonePattern(value);
  if (key === "hexColor") return normalizeHexColor(value);
  return value;
}

function normalizeZonePattern(pattern) {
  const value = typeof pattern === "string" ? pattern.trim() : "";
  return ZONE_PATTERNS.has(value) ? value : null;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function readZones(map) {
  return (map?.zones?.zones || map?.pack?.zones || []).filter(Boolean);
}

function writeZoneCollection(map, zones) {
  const normalized = zones.map(clone);
  map.zones ||= {zones: [], metadata: {}};
  map.zones.zones = normalized;
  map.zones.metadata = refreshZoneMetadata(map.zones.metadata, normalized, map.pack?.cells);
  if (map.pack) map.pack.zones = normalized;
}

function captureZoneSnapshot(map) {
  return {
    zones: readZones(map).map(clone),
    metadata: clone(map?.zones?.metadata || {}),
    notes: readZones(map).map(zone => cloneObjectNote(readObjectNote(map, {kind: OBJECT_KIND.ZONE, id: Number(zone.i ?? zone.id)}))).filter(Boolean)
  };
}

function restoreZoneSnapshot(map, snapshot) {
  writeZoneCollection(map, snapshot.zones || []);
  map.zones.metadata = clone(snapshot.metadata || {});
  for (const note of [...(map?.notes?.notes || [])]) {
    if (note?.kind === OBJECT_KIND.ZONE) deleteObjectNote(map, note.id);
  }
  for (const note of snapshot.notes || []) restoreObjectNote(map, note);
}

function refreshZoneMetadata(previous, zones, cells) {
  const types = {};
  let cellCount = 0;
  let invalidCells = 0;
  for (const zone of zones) {
    types[zone.type] = (types[zone.type] || 0) + 1;
    cellCount += zone.cells?.length || 0;
    for (const cell of zone.cells || []) if (!Number.isInteger(cell) || cell < 0 || cell >= (cells?.i?.length || 0)) invalidCells += 1;
  }
  return {...(previous || {}), zones: zones.length, types, cells: cellCount, hidden: zones.filter(zone => zone.hidden).length, invalidCells};
}

function expandZoneCells(cells, center, radiusValue) {
  const count = cells?.i?.length || cells?.h?.length || 0;
  if (!Number.isInteger(center) || center < 0 || center >= count) return [];
  const radius = Math.max(0, Math.min(6, Math.floor(Number.isFinite(radiusValue) ? radiusValue : 1)));
  const visited = new Set([center]);
  let frontier = [center];
  for (let distance = 0; distance < radius; distance += 1) {
    const next = [];
    for (const cell of frontier) {
      for (const neighbor of cells.c?.[cell] || []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return [...visited];
}

function connectedZoneCells(cells, selected) {
  const allowed = new Set(selected);
  const visited = new Set([selected[0]]);
  const queue = [selected[0]];
  while (queue.length) {
    const cell = queue.shift();
    for (const neighbor of cells.c?.[cell] || []) {
      if (!allowed.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited.size === selected.length;
}

function nextZoneId(map) {
  return readZones(map).reduce((max, zone) => Math.max(max, Number(zone?.i ?? zone?.id) || 0), -1) + 1;
}

function normalizeZoneName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 64) : "";
}

function zoneTypeLabel(type) {
  return ({Warzone: "战区", Invasion: "入侵区", Rebels: "叛乱区", Proselytism: "传教区", Crusade: "圣战区", Disease: "疫病区", Disaster: "灾害区", Eruption: "喷发区", Avalanche: "雪崩区", Fault: "断层区", Flood: "洪水区", Tsunami: "海啸区"})[type] || type;
}

function defaultZonePattern(type) {
  if (["Warzone", "Rebels", "Crusade", "Eruption", "Tsunami"].includes(type)) return "cross";
  if (["Proselytism", "Disease", "Flood"].includes(type)) return "dots";
  return "diagonal";
}

function defaultZoneColor(type) {
  return ({Warzone: "#d65a42", Invasion: "#d98238", Rebels: "#c79735", Proselytism: "#9b76d6", Crusade: "#b48be2", Disease: "#668f5a", Disaster: "#b26852", Eruption: "#c85b38", Avalanche: "#c4ced2", Fault: "#8d7d70", Flood: "#4e9ac9", Tsunami: "#4a9dbe"})[type] || "#b26852";
}

function patternHatch(pattern) {
  return pattern === "cross" ? "hatch3" : pattern === "dots" ? "hatch12" : "hatch5";
}

function invalidZoneCreation(code, reason) {
  return {valid: false, code, reason, packCells: []};
}

function zoneCreationError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
