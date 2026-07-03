import {LABEL_TARGET_KIND, OBJECT_KIND, OBJECT_KIND_LABEL} from "./object-kinds.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {getStateFullName} from "../generator/names.js";

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
  [OBJECT_KIND.CITY]: readCityName,
  [OBJECT_KIND.MARKER]: readMarkerName
});

const OBJECT_NAME_WRITERS = Object.freeze({
  [OBJECT_KIND.STATE]: writeStateName,
  [OBJECT_KIND.PROVINCE]: writeProvinceName,
  [OBJECT_KIND.CULTURE]: writeCultureName,
  [OBJECT_KIND.RELIGION]: writeReligionName,
  [OBJECT_KIND.RIVER]: writeRiverName,
  [OBJECT_KIND.CITY]: writeCityName,
  [OBJECT_KIND.MARKER]: writeMarkerName
});

const OBJECT_NAME_RESTORERS = Object.freeze({
  [OBJECT_KIND.STATE]: restoreStateName,
  [OBJECT_KIND.PROVINCE]: restoreProvinceName,
  [OBJECT_KIND.CULTURE]: restoreCultureName,
  [OBJECT_KIND.RELIGION]: (map, target, previous) => writeReligionName(map, target.id, previous.name),
  [OBJECT_KIND.RIVER]: (map, target, previous) => writeRiverName(map, target.id, previous.name),
  [OBJECT_KIND.CITY]: (map, target, previous) => writeCityName(map, target.id, previous.name, previous.burgName),
  [OBJECT_KIND.MARKER]: (map, target, previous) => writeMarkerName(map, target.id, previous.name)
});

export function createRenameObjectCommand(object, nextName) {
  const target = normalizeObjectTarget(object);
  const normalizedName = normalizeName(nextName);
  let previous = null;

  return {
    label: `重命名${formatObjectKind(target.kind)} #${target.id}`,
    effects: {
      ...OBJECT_NAME_EFFECTS,
      affected: [{kind: target.kind, id: target.id}]
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

export function createSetObjectNoteCommand(object, body, {name = ""} = {}) {
  const target = normalizeObjectTarget(object);
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑${formatObjectKind(target.kind)}备注 #${target.id}` : `清空${formatObjectKind(target.kind)}备注 #${target.id}`,
    effects: {
      ...OBJECT_NOTE_EFFECTS,
      affected: [{kind: target.kind, id: target.id}]
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
    effects: {
      ...STATE_CAPITAL_EFFECTS,
      affected: [{kind: "state", id: normalizedStateId}, {kind: "city", id: normalizedBurgId}]
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
    effects: {
      ...PROVINCE_COLOR_EFFECTS,
      affected: [{kind: "province", id: normalizedProvinceId}]
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

function readMarkerName(map, markerId) {
  const marker = map?.markers?.markers?.[markerId];
  return marker ? {name: marker.name || ""} : null;
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

function writeMarkerName(map, markerId, name) {
  const marker = map?.markers?.markers?.[markerId];
  if (!marker) throw new Error(`找不到标记 #${markerId}`);
  marker.name = name;
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

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function formatObjectKind(kind) {
  return OBJECT_KIND_LABEL[kind] || "对象";
}
