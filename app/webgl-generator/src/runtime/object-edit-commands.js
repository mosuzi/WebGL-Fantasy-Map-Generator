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

function normalizeObjectTarget(object) {
  if (object?.kind === "label" && object.targetKind === "city") {
    return {kind: "city", id: object.targetId ?? object.id};
  }
  return {kind: object?.kind, id: object?.id};
}

function readObjectName(map, target) {
  if (target.kind === "state") {
    const state = map?.politics?.states?.[target.id];
    return state ? {name: state.name || "", fullName: state.fullName || ""} : null;
  }
  if (target.kind === "river") {
    const river = findRiver(map, target.id);
    return river ? {name: river.name || ""} : null;
  }
  if (target.kind === "city") {
    const city = map?.settlements?.cities?.[target.id];
    const burg = city ? findBurgForCity(map, city) : null;
    return city ? {name: city.name || "", burgName: burg?.name || ""} : null;
  }
  return null;
}

function writeObjectName(map, target, name) {
  if (target.kind === "state") return writeStateName(map, target.id, name);
  if (target.kind === "river") return writeRiverName(map, target.id, name);
  if (target.kind === "city") return writeCityName(map, target.id, name);
  throw new Error(`不支持重命名对象类型：${target.kind}`);
}

function restoreObjectName(map, target, previous) {
  if (target.kind === "state") {
    const state = map?.politics?.states?.[target.id];
    if (!state) throw new Error(`找不到国家 #${target.id}`);
    state.name = previous.name;
    state.fullName = previous.fullName;
    return;
  }
  if (target.kind === "river") return writeRiverName(map, target.id, previous.name);
  if (target.kind === "city") return writeCityName(map, target.id, previous.name, previous.burgName);
  throw new Error(`不支持恢复对象类型：${target.kind}`);
}

function writeStateName(map, stateId, name) {
  const state = map?.politics?.states?.[stateId];
  if (!state) throw new Error(`找不到国家 #${stateId}`);
  state.name = name;
  state.fullName = state.formName ? `${name}${state.formName}` : name;
}

function writeRiverName(map, riverId, name) {
  const river = findRiver(map, riverId);
  if (!river) throw new Error(`找不到河流 #${riverId}`);
  river.name = name;
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

function formatObjectKind(kind) {
  if (kind === "state") return "国家";
  if (kind === "river") return "河流";
  if (kind === "city") return "城市";
  return "对象";
}
