import {LABEL_TARGET_KIND, OBJECT_KIND, OBJECT_KIND_LABEL} from "./object-kinds.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {createChineseNameGenerator, getStateFullName} from "../generator/names.js";
import {namebaseRenameAffected, objectAffected} from "./edit-command-effects.js";

const OBJECT_NAME_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "labels", "object-panels"])
});

const STATE_CAPITAL_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["state-capital", "labels", "object-panels"])
});

const PROVINCE_COLOR_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["province-color", "cell-colors", "object-panels"])
});

const OBJECT_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

const OBJECT_NAME_READERS = Object.freeze({
  [OBJECT_KIND.STATE]: readStateName,
  [OBJECT_KIND.PROVINCE]: readProvinceName,
  [OBJECT_KIND.CULTURE]: readCultureName,
  [OBJECT_KIND.RELIGION]: readReligionName,
  [OBJECT_KIND.RIVER]: readRiverName,
  [OBJECT_KIND.LAKE]: readLakeName,
  [OBJECT_KIND.CITY]: readCityName,
  [OBJECT_KIND.MARKER]: readMarkerName,
  [OBJECT_KIND.NOTE]: readStandaloneNoteName
});

const OBJECT_NAME_WRITERS = Object.freeze({
  [OBJECT_KIND.STATE]: writeStateName,
  [OBJECT_KIND.PROVINCE]: writeProvinceName,
  [OBJECT_KIND.CULTURE]: writeCultureName,
  [OBJECT_KIND.RELIGION]: writeReligionName,
  [OBJECT_KIND.RIVER]: writeRiverName,
  [OBJECT_KIND.LAKE]: writeLakeName,
  [OBJECT_KIND.CITY]: writeCityName,
  [OBJECT_KIND.MARKER]: writeMarkerName,
  [OBJECT_KIND.NOTE]: writeStandaloneNoteName
});

const OBJECT_NAME_RESTORERS = Object.freeze({
  [OBJECT_KIND.STATE]: restoreStateName,
  [OBJECT_KIND.PROVINCE]: restoreProvinceName,
  [OBJECT_KIND.CULTURE]: restoreCultureName,
  [OBJECT_KIND.RELIGION]: (map, target, previous) => writeReligionName(map, target.id, previous.name),
  [OBJECT_KIND.RIVER]: (map, target, previous) => writeRiverName(map, target.id, previous.name),
  [OBJECT_KIND.LAKE]: (map, target, previous) => writeLakeName(map, target.id, previous.name),
  [OBJECT_KIND.CITY]: (map, target, previous) => writeCityName(map, target.id, previous.name, previous.burgName),
  [OBJECT_KIND.MARKER]: (map, target, previous) => writeMarkerName(map, target.id, previous.name),
  [OBJECT_KIND.NOTE]: (map, target, previous) => writeStandaloneNoteName(map, target.id, previous.name)
});

export function createRenameObjectCommand(object, nextName) {
  const target = normalizeObjectTarget(object);
  const normalizedName = normalizeName(nextName);
  let previous = null;

  return {
    label: `重命名${formatObjectKind(target.kind)} #${target.id}`,
    domain: target.kind,
    effects: {
      ...OBJECT_NAME_EFFECTS,
      affected: objectAffected(target.kind, target.id)
    },
    apply(context) {
      if (!normalizedName) throw new Error("名称不能为空");
      previous ??= readObjectName(context.map, target);
      writeObjectName(context.map, target, normalizedName);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的名称快照");
      restoreObjectName(context.map, target, previous);
    },
    isNoop(context) {
      if (!normalizedName) return true;
      const current = readObjectName(context.map, target);
      return !current || current.name === normalizedName;
    }
  };
}

export function createRenameNamedObjectsFromNamebaseCommand(kind, ids, {label = ""} = {}) {
  const targetKind = [OBJECT_KIND.PROVINCE, OBJECT_KIND.CULTURE, OBJECT_KIND.RELIGION].includes(kind) ? kind : "";
  const targets = [...new Set((ids || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
  let changes = null;
  const kindLabel = formatObjectKind(targetKind);

  return {
    label: `${label || `按名称库重命名${kindLabel}`} ${targets.length} 个`,
    domain: targetKind,
    effects: {
      ...OBJECT_NAME_EFFECTS,
      affected: namebaseRenameAffected(targetKind, targets)
    },
    apply(context) {
      if (!targetKind) throw new Error("当前对象类型不支持名称库批量重命名");
      changes ??= buildNamedObjectRenameChanges(context.map, targetKind, targets);
      if (!changes.length) throw new Error(`没有可重命名的${kindLabel}`);
      for (const change of changes) writeObjectName(context.map, change.target, change.afterName);
    },
    revert(context) {
      if (!changes) throw new Error(`缺少可撤销的${kindLabel}名称快照`);
      for (const change of changes) restoreObjectName(context.map, change.target, change.before);
    },
    isNoop(context) {
      return !targetKind || !targets.length || !buildNamedObjectRenameChanges(context.map, targetKind, targets).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: targets.length};
    }
  };
}

export function createSetObjectNoteCommand(object, body, {name = ""} = {}) {
  const target = normalizeObjectTarget(object);
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑${formatObjectKind(target.kind)}备注 #${target.id}` : `清空${formatObjectKind(target.kind)}备注 #${target.id}`,
    domain: target.kind,
    effects: {
      ...OBJECT_NOTE_EFFECTS,
      affected: objectAffected(target.kind, target.id)
    },
    apply(context) {
      const current = readObjectName(context.map, target);
      if (!current) throw new Error(`找不到${formatObjectKind(target.kind)} #${target.id}`);
      previous ??= cloneObjectNote(readObjectNote(context.map, target));
      if (!normalizedBody) {
        deleteObjectNote(context.map, target);
        return;
      }
      next ??= createObjectNoteSnapshot(target, normalizedBody, {
        name: name || current.fullName || current.name || `${formatObjectKind(target.kind)} #${target.id}`,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, target);
    },
    isNoop(context) {
      if (!readObjectName(context.map, target)) return true;
      const current = readObjectNote(context.map, target)?.body || "";
      return current === normalizedBody;
    }
  };
}

export function createSetStateCapitalCommand(stateId, nextBurgId) {
  const normalizedStateId = Number(stateId);
  const normalizedBurgId = Number(nextBurgId);
  let previous = null;

  return {
    label: `更换国家 #${normalizedStateId} 首都`,
    domain: OBJECT_KIND.STATE,
    effects: {
      ...STATE_CAPITAL_EFFECTS,
      affected: [
        ...objectAffected(OBJECT_KIND.STATE, normalizedStateId),
        ...objectAffected(OBJECT_KIND.CITY, normalizedBurgId)
      ]
    },
    apply(context) {
      previous ??= readStateCapitalSnapshot(context.map, normalizedStateId, normalizedBurgId);
      writeStateCapital(context.map, normalizedStateId, normalizedBurgId);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的首都快照");
      restoreStateCapital(context.map, previous);
    },
    isNoop(context) {
      const state = context.map?.politics?.states?.[normalizedStateId];
      const city = findCityByBurg(context.map, normalizedBurgId);
      return !state || !city || city.state !== normalizedStateId || Number(state.capital) === normalizedBurgId;
    }
  };
}

export function createSetProvinceColorCommand(provinceId, color, {beforeColor = null, label = "省份颜色"} = {}) {
  const normalizedProvinceId = Number(provinceId);
  const after = normalizeHexColor(color);
  let before = beforeColor;
  let hadBeforeColor = beforeColor !== null && beforeColor !== undefined;

  return {
    label: `${label} #${normalizedProvinceId}`,
    domain: OBJECT_KIND.PROVINCE,
    effects: {
      ...PROVINCE_COLOR_EFFECTS,
      affected: objectAffected(OBJECT_KIND.PROVINCE, normalizedProvinceId)
    },
    apply(context) {
      if (!after) throw new Error("省份颜色必须是 #rrggbb");
      if (before === null || before === undefined) {
        const province = context.map?.politics?.provinces?.[normalizedProvinceId] || context.map?.pack?.provinces?.[normalizedProvinceId];
        hadBeforeColor = Object.prototype.hasOwnProperty.call(province || {}, "color");
        before = province?.color ?? null;
      }
      setProvinceColor(context.map, normalizedProvinceId, after);
    },
    revert(context) {
      if (hadBeforeColor) setProvinceColor(context.map, normalizedProvinceId, before);
      else clearProvinceColor(context.map, normalizedProvinceId);
    },
    isNoop(context) {
      const province = context.map?.politics?.provinces?.[normalizedProvinceId] || context.map?.pack?.provinces?.[normalizedProvinceId];
      return !province || !after || province.color === after;
    }
  };
}

function normalizeObjectTarget(object) {
  if (object?.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.CITY) {
    return {kind: OBJECT_KIND.CITY, id: object.targetId ?? object.id};
  }
  if (object?.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.STATE) {
    return {kind: OBJECT_KIND.STATE, id: object.targetId ?? object.id};
  }
  if (object?.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.PROVINCE) {
    return {kind: OBJECT_KIND.PROVINCE, id: object.targetId ?? object.id};
  }
  return {kind: object?.kind, id: object?.id};
}

function readObjectName(map, target) {
  return OBJECT_NAME_READERS[target.kind]?.(map, target.id) || null;
}

function writeObjectName(map, target, name) {
  const writer = OBJECT_NAME_WRITERS[target.kind];
  if (writer) return writer(map, target.id, name);
  throw new Error(`不支持重命名对象类型：${target.kind}`);
}

function restoreObjectName(map, target, previous) {
  const restorer = OBJECT_NAME_RESTORERS[target.kind];
  if (restorer) return restorer(map, target, previous);
  throw new Error(`不支持恢复对象类型：${target.kind}`);
}

function buildNamedObjectRenameChanges(map, kind, ids) {
  const seed = `${map?.metadata?.seed || map?.options?.seed || "map"}|explicit-${kind}-rename|${map?.metadata?.checksum || ""}`;
  const generator = createChineseNameGenerator(seed, {namebases: map?.namebases});
  const changes = [];
  for (const id of ids) {
    const target = {kind, id};
    const before = readObjectName(map, target);
    if (!before) continue;
    const afterName = generateNamedObjectName(map, generator, target);
    if (!afterName || afterName === before.name) continue;
    changes.push({target, before, afterName});
  }
  return changes;
}

function generateNamedObjectName(map, generator, target) {
  if (target.kind === OBJECT_KIND.PROVINCE) {
    const province = map?.politics?.provinces?.[target.id] || map?.pack?.provinces?.[target.id];
    const cultureId = Number(province?.culture ?? map?.pack?.cells?.culture?.[province?.center] ?? 0) || 0;
    const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId];
    return generator.makeProvinceName({
      id: target.id,
      cell: province?.center,
      state: province?.state,
      culture: cultureId,
      cultureType: culture?.nameStyle || culture?.type,
      baseName: beforeStateName(map, province?.state)
    }).name;
  }
  if (target.kind === OBJECT_KIND.CULTURE) {
    const culture = map?.society?.cultures?.[target.id] || map?.pack?.cultures?.[target.id];
    return generator.makeCultureName({
      id: target.id,
      cell: culture?.center,
      culture: target.id,
      cultureType: culture?.nameStyle || culture?.type
    });
  }
  const religion = map?.society?.religions?.[target.id] || map?.pack?.religions?.[target.id];
  return generator.makeReligionName({
    id: target.id,
    cell: religion?.center,
    culture: religion?.culture,
    type: religion?.type,
    form: religion?.form
  });
}

function beforeStateName(map, stateId) {
  const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
  return state?.name || state?.fullName || "";
}

function readStateName(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  return state ? {name: state.name || "", fullName: state.fullName || ""} : null;
}

function readProvinceName(map, provinceId) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  return province ? {name: province.name || "", fullName: province.fullName || ""} : null;
}

function readCultureName(map, cultureId) {
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId];
  return culture ? {name: culture.name || "", root: culture.root || ""} : null;
}

function readReligionName(map, religionId) {
  const religion = map?.society?.religions?.[religionId] || map?.pack?.religions?.[religionId];
  return religion ? {name: religion.name || ""} : null;
}

function readRiverName(map, riverId) {
  const river = findRiver(map, riverId);
  return river ? {name: river.name || ""} : null;
}

function readLakeName(map, lakeId) {
  const lake = findLake(map, lakeId);
  return lake ? {name: lake.name || ""} : null;
}

function readMarkerName(map, markerId) {
  const marker = (map?.markers?.markers || []).find(item => Number(item?.id) === Number(markerId));
  return marker ? {name: marker.name || ""} : null;
}

function readStandaloneNoteName(map, noteId) {
  const note = (map?.notes?.notes || []).find(item => item?.kind === OBJECT_KIND.NOTE && String(item.objectId) === String(noteId));
  return note ? {name: note.name || ""} : null;
}

function readCityName(map, cityId) {
  const city = map?.settlements?.cities?.[cityId];
  const burg = city ? findBurgForCity(map, city) : null;
  return city ? {name: city.name || "", burgName: burg?.name || ""} : null;
}

function writeStateName(map, stateId, name) {
  const state = map?.politics?.states?.[stateId];
  if (!state) throw new Error(`找不到国家 #${stateId}`);
  state.name = name;
  state.fullName = getStateFullName(name, state.formName);
}

function restoreStateName(map, target, previous) {
  const state = map?.politics?.states?.[target.id];
  if (!state) throw new Error(`找不到国家 #${target.id}`);
  state.name = previous.name;
  state.fullName = previous.fullName;
}

function writeProvinceName(map, provinceId, name) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  if (!province) throw new Error(`找不到省份 #${provinceId}`);
  province.name = name;
  province.fullName = province.formName ? `${name}${province.formName}` : name;
}

function restoreProvinceName(map, target, previous) {
  const province = map?.politics?.provinces?.[target.id] || map?.pack?.provinces?.[target.id];
  if (!province) throw new Error(`找不到省份 #${target.id}`);
  province.name = previous.name;
  province.fullName = previous.fullName;
}

function writeCultureName(map, cultureId, name) {
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId];
  if (!culture) throw new Error(`找不到文化 #${cultureId}`);
  culture.name = name;
  culture.root = name.endsWith("文化") ? name.slice(0, name.length - "文化".length) : name;
}

function restoreCultureName(map, target, previous) {
  const culture = map?.society?.cultures?.[target.id] || map?.pack?.cultures?.[target.id];
  if (!culture) throw new Error(`找不到文化 #${target.id}`);
  culture.name = previous.name;
  culture.root = previous.root;
}

function writeReligionName(map, religionId, name) {
  const religion = map?.society?.religions?.[religionId] || map?.pack?.religions?.[religionId];
  if (!religion) throw new Error(`找不到宗教 #${religionId}`);
  religion.name = name;
}

function setProvinceColor(map, provinceId, color) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  if (!province) throw new Error(`找不到省份 #${provinceId}`);
  province.color = color;
}

function clearProvinceColor(map, provinceId) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  if (!province) throw new Error(`找不到省份 #${provinceId}`);
  delete province.color;
}

function writeRiverName(map, riverId, name) {
  const river = findRiver(map, riverId);
  if (!river) throw new Error(`找不到河流 #${riverId}`);
  river.name = name;
}

function writeLakeName(map, lakeId, name) {
  const lake = findLake(map, lakeId);
  if (!lake) throw new Error(`找不到湖泊 #${lakeId}`);
  lake.name = name;
}

function writeMarkerName(map, markerId, name) {
  const marker = (map?.markers?.markers || []).find(item => Number(item?.id) === Number(markerId));
  if (!marker) throw new Error(`找不到标记 #${markerId}`);
  marker.name = name;
}

function writeStandaloneNoteName(map, noteId, name) {
  const note = (map?.notes?.notes || []).find(item => item?.kind === OBJECT_KIND.NOTE && String(item.objectId) === String(noteId));
  if (!note) throw new Error(`找不到独立备注 #${noteId}`);
  note.name = name;
  note.updatedAt = new Date().toISOString();
}

function writeCityName(map, cityId, name, burgName = name) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) throw new Error(`找不到城市 #${cityId}`);
  city.name = name;
  const burg = findBurgForCity(map, city);
  if (burg) burg.name = burgName;
}

function readStateCapitalSnapshot(map, stateId, nextBurgId) {
  const state = map?.politics?.states?.[stateId];
  if (!state) throw new Error(`找不到国家 #${stateId}`);
  const nextCity = findCityByBurg(map, nextBurgId);
  if (!nextCity || nextCity.state !== stateId) throw new Error(`城市 #${nextBurgId} 不属于国家 #${stateId}`);
  const previousBurgId = Number(state.capital) || 0;
  const previousCity = findCityByBurg(map, previousBurgId);
  return {
    stateId,
    previousBurgId,
    nextBurgId,
    state: {
      capital: state.capital,
      center: state.center,
      gridCenter: state.gridCenter,
      religion: state.religion
    },
    previousCity: snapshotCityAndBurg(map, previousCity),
    nextCity: snapshotCityAndBurg(map, nextCity)
  };
}

function writeStateCapital(map, stateId, nextBurgId) {
  const state = map?.politics?.states?.[stateId];
  const nextCity = findCityByBurg(map, nextBurgId);
  if (!state || !nextCity) throw new Error(`无法更换国家 #${stateId} 首都`);
  const previousBurg = map.pack?.burgs?.[state.capital];
  const previousCity = findCityByBurg(map, state.capital);
  const nextBurg = findBurgForCity(map, nextCity);
  if (!nextBurg) throw new Error(`找不到城市对应 burg #${nextBurgId}`);

  if (previousBurg) {
    previousBurg.capital = 0;
    previousBurg.group = previousBurg.port ? "city" : "town";
  }
  if (previousCity) {
    previousCity.capital = false;
    previousCity.group = previousCity.port ? "city" : previousCity.provincial ? "town" : "town";
  }

  nextBurg.capital = 1;
  nextBurg.group = "capital";
  nextCity.capital = true;
  nextCity.group = "capital";
  state.capital = nextBurg.i;
  state.center = nextBurg.cell;
  state.gridCenter = map.pack?.cells?.g?.[nextBurg.cell] ?? nextCity.cell;
  state.religion = map.pack?.cells?.religion?.[nextBurg.cell] ?? state.religion;
}

function restoreStateCapital(map, snapshot) {
  const state = map?.politics?.states?.[snapshot.stateId];
  if (!state) throw new Error(`找不到国家 #${snapshot.stateId}`);
  Object.assign(state, snapshot.state);
  restoreCityAndBurg(map, snapshot.previousCity);
  restoreCityAndBurg(map, snapshot.nextCity);
}

function snapshotCityAndBurg(map, city) {
  if (!city) return null;
  const burg = findBurgForCity(map, city);
  return {
    cityId: city.id,
    burgId: city.burgId,
    city: {
      capital: city.capital,
      group: city.group,
      provincial: city.provincial
    },
    burg: burg ? {
      capital: burg.capital,
      group: burg.group,
      state: burg.state
    } : null
  };
}

function restoreCityAndBurg(map, snapshot) {
  if (!snapshot) return;
  const city = map?.settlements?.cities?.[snapshot.cityId];
  if (city) Object.assign(city, snapshot.city);
  const burg = map?.pack?.burgs?.[snapshot.burgId];
  if (burg && snapshot.burg) Object.assign(burg, snapshot.burg);
}

function findRiver(map, riverId) {
  return map?.rivers?.rivers?.find(river => river.id === riverId) || null;
}

function findLake(map, lakeId) {
  const id = Number(lakeId);
  return (map?.pack?.features || []).find(feature => feature?.type === "lake" && Number(feature.i ?? feature.id) === id) || null;
}

function findCityByBurg(map, burgId) {
  return (map?.settlements?.cities || []).find(city => city?.burgId === burgId) || null;
}

function findBurgForCity(map, city) {
  return map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city.id) || null;
}

function normalizeName(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

function createObjectNoteSnapshot(target, body, {name, previous = null} = {}) {
  const now = new Date().toISOString();
  const snapshot = {
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
  if (previous?.standalone === true && target.kind === OBJECT_KIND.NOTE) {
    snapshot.standalone = true;
    snapshot.packCell = previous.packCell;
    snapshot.x = previous.x;
    snapshot.y = previous.y;
  }
  return snapshot;
}

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function formatObjectKind(kind) {
  return OBJECT_KIND_LABEL[kind] || "对象";
}
