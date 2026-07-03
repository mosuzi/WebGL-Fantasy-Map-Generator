import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";

const OBJECT_RESOLVERS = Object.freeze({
  [OBJECT_KIND.CITY]: resolveCity,
  [OBJECT_KIND.LABEL]: resolveLabel,
  [OBJECT_KIND.MARKER]: resolveMarker,
  [OBJECT_KIND.ROUTE]: resolveRoute,
  [OBJECT_KIND.RIVER]: resolveRiver,
  [OBJECT_KIND.MILITARY]: resolveMilitary,
  [OBJECT_KIND.STATE]: resolveState,
  [OBJECT_KIND.PROVINCE]: resolveProvince,
  [OBJECT_KIND.CULTURE]: resolveCulture,
  [OBJECT_KIND.RELIGION]: resolveReligion,
  [OBJECT_KIND.REGION]: resolveRegion
});

export function resolveObject(map, object) {
  if (!map || !object?.kind) return null;
  return OBJECT_RESOLVERS[object.kind]?.(map, object) || object;
}

function resolveCity(map, object) {
  const city = map.settlements.cities[object.id];
  if (!city) return null;
  return {
    ...object,
    kind: "city",
    id: city.id,
    name: city.name,
    type: city.capital ? "capital" : city.provincial ? "provincial" : city.port ? "port" : "city",
    population: city.population,
    stateId: city.state,
    state: map.politics.states[city.state]?.name || "none",
    provinceId: city.province,
    province: map.politics.provinces[city.province]?.name || "none"
  };
}

function resolveLabel(map, object) {
  if (object.targetKind === LABEL_TARGET_KIND.CUSTOM) {
    const label = (map.labels?.custom || []).find(item => item.id === (object.targetId ?? object.id));
    if (!label) return null;
    return {
      ...object,
      kind: OBJECT_KIND.LABEL,
      id: label.id,
      text: label.text,
      targetKind: LABEL_TARGET_KIND.CUSTOM,
      targetId: label.id,
      targetName: label.text,
      x: label.x,
      y: label.y,
      rank: object.rank ?? "custom"
    };
  }
  if (object.targetKind === LABEL_TARGET_KIND.STATE) {
    const state = map.politics.states[object.targetId ?? object.id];
    if (!state) return null;
    return {
      ...object,
      kind: OBJECT_KIND.LABEL,
      id: state.id ?? state.i ?? object.id,
      text: state.name,
      targetKind: LABEL_TARGET_KIND.STATE,
      targetId: state.id ?? state.i ?? object.id,
      targetName: state.name,
      rank: object.rank ?? "n/a"
    };
  }
  if (object.targetKind === LABEL_TARGET_KIND.CITY || object.id !== undefined) {
    const city = map.settlements.cities[object.id];
    if (!city) return null;
    return {
      ...object,
      kind: OBJECT_KIND.LABEL,
      id: city.id,
      text: city.name,
      targetKind: LABEL_TARGET_KIND.CITY,
      targetId: city.id,
      targetName: city.name,
      rank: object.rank ?? "n/a"
    };
  }
  return object;
}

function resolveMarker(map, object) {
  const marker = map.markers.markers[object.id];
  if (!marker) return null;
  return {
    ...object,
    kind: "marker",
    id: marker.id,
    type: marker.type,
    label: marker.label,
    icon: marker.icon,
    category: marker.category,
    categoryLabel: marker.categoryLabel,
    resourceKey: marker.resourceKey,
    resourceLabel: marker.resourceLabel,
    economicValue: marker.economicValue,
    name: marker.name,
    cell: marker.cell,
    packCell: marker.packCell,
    stateId: marker.data?.state ?? 0,
    state: map.politics.states[marker.data?.state]?.name || "none",
    provinceId: marker.data?.province ?? 0,
    province: map.politics.provinces[marker.data?.province]?.name || "none",
    data: marker.data,
    x: marker.x,
    y: marker.y
  };
}

function resolveRoute(map, object) {
  const route = map.settlements.routes.find(item => item.id === object.id);
  if (!route) return null;
  const from = map.settlements.cities[route.from];
  const to = map.settlements.cities[route.to];
  return {
    ...object,
    kind: "route",
    id: route.id,
    type: route.type,
    level: route.level || route.type,
    fromId: route.from,
    toId: route.to,
    from: from?.name || "unknown",
    to: to?.name || "unknown",
    length: routeLength(route),
    points: route.points
  };
}

function resolveRiver(map, object) {
  const river = map.rivers.rivers.find(item => item.id === object.id);
  if (!river) return null;
  return {
    ...object,
    kind: "river",
    id: river.id,
    name: river.name || `#${river.id}`,
    type: river.parent ? "支流" : "主河",
    parentId: river.parent || 0,
    flux: river.flux || river.discharge || river.width || 0,
    discharge: river.discharge || river.flux || 0,
    length: river.cells?.length ?? Math.max(0, (river.points?.length || 0) - 1),
    segments: Math.max(0, (river.points?.length || 0) - 1),
    widthFactor: Number.isFinite(river.widthFactor) ? river.widthFactor : 1,
    source: river.source,
    mouth: river.mouth,
    cells: river.cells,
    points: river.points
  };
}

function resolveMilitary(map, object) {
  const {regiment, state} = findRegiment(map, object);
  if (!regiment) return null;
  return {
    ...object,
    kind: OBJECT_KIND.MILITARY,
    id: regiment.id ?? `${regiment.state}:${regiment.i}`,
    regimentId: regiment.i,
    stateId: regiment.state,
    name: regiment.name || `军团 #${regiment.i}`,
    state: state?.name || "none",
    type: regiment.type,
    status: regiment.status,
    statusLabel: regiment.statusLabel,
    dominantUnit: regiment.dominantUnit,
    dominantUnitLabel: regiment.dominantUnitLabel,
    troops: regiment.a,
    units: regiment.u,
    icon: regiment.icon,
    iconVariant: regiment.iconVariant,
    iconLabel: regiment.iconLabel,
    x: regiment.x,
    y: regiment.y,
    cell: regiment.cell,
    suitability: regiment.suitability,
    movementSpeed: regiment.movementSpeed
  };
}

function resolveState(map, object) {
  const state = map.politics.states[object.id];
  if (!state) return null;
  if ((state.id ?? state.i ?? object.id) === 0) {
    return {
      ...object,
      kind: "state",
      id: 0,
      name: "中立",
      fullName: "中立",
      capitalId: 0,
      capitalName: "无",
      cultureId: 0,
      culture: "混合",
      religionId: 0,
      religion: "混合",
      centerCell: 0
    };
  }
  const capital = map.pack?.burgs?.[state.capital];
  return {
    ...object,
    kind: "state",
    id: state.id ?? state.i ?? object.id,
    name: state.name,
    fullName: state.fullName,
    formName: state.formName,
    governmentKey: state.governmentKey,
    government: state.governmentLabel || state.governmentKey || "unknown",
    capitalId: state.capital,
    capitalName: capital?.name || "unknown",
    cultureId: state.culture,
    culture: map.society.cultures[state.culture]?.name || "unknown",
    religionId: state.religion,
    religion: map.society.religions[state.religion]?.name || "unknown",
    centerCell: state.center
  };
}

function findRegiment(map, object) {
  const stateId = Number(object.stateId ?? object.state ?? String(object.id || "").split(":")[0]);
  const regimentId = Number(object.regimentId ?? object.i ?? String(object.id || "").split(":")[1]);
  const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
  const regiment = (state?.military || []).find(item => item.i === regimentId || item.id === object.id) || null;
  return {state, regiment};
}

function resolveProvince(map, object) {
  if (object.id === 0) {
    return {
      ...object,
      kind: "province",
      id: 0,
      name: "中立",
      state: "无所属国家",
      stateId: 0,
      centerCell: 0,
      pole: null
    };
  }
  const province = map.politics.provinces[object.id];
  if (!province) return null;
  const state = map.politics.states[province.state];
  return {
    ...object,
    kind: "province",
    id: province.id ?? province.i ?? object.id,
    name: province.name,
    state: state?.name || "none",
    stateId: province.state,
    centerCell: province.center,
    pole: province.pole
  };
}

function resolveCulture(map, object) {
  const culture = map.society.cultures[object.id];
  if (!culture || !culture.i) return null;
  const urban = (map.settlements?.cities || []).reduce((sum, city) => sum + (Number(city?.culture) === object.id ? Number(city.population) || 0 : 0), 0);
  return {
    ...object,
    kind: "culture",
    id: culture.id ?? culture.i ?? object.id,
    name: culture.name,
    type: culture.type || "Generic",
    nameStyle: culture.nameStyle || "default",
    centerCell: culture.center,
    gridCenterCell: culture.gridCenter,
    cells: culture.cells || 0,
    population: (culture.rural || 0) + urban
  };
}

function resolveReligion(map, object) {
  const religion = map.society.religions[object.id];
  if (!religion || !religion.i) return null;
  const urban = (map.settlements?.cities || []).reduce((sum, city) => sum + (Number(city?.religion) === object.id ? Number(city.population) || 0 : 0), 0);
  return {
    ...object,
    kind: "religion",
    id: religion.id ?? religion.i ?? object.id,
    name: religion.name,
    type: religion.type || "Generic",
    form: religion.form || "none",
    cultureId: religion.culture,
    culture: map.society.cultures[religion.culture]?.name || "unknown",
    centerCell: religion.center,
    gridCenterCell: religion.gridCenter,
    cells: religion.cells || 0,
    population: (religion.rural || 0) + urban
  };
}

function resolveRegion(map, object) {
  const region = map.politics.regions[object.id];
  if (!region) return null;
  return {
    ...object,
    kind: "region",
    id: region.id ?? region.i ?? object.id,
    name: region.name,
    type: region.type || "region"
  };
}

function routeLength(route) {
  let length = 0;
  const points = route.points || [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}
