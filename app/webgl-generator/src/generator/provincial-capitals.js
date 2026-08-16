import {burgIdsAtPackCell, cityIdsAtGridCell} from "../runtime/settlement-cell-index.js";

const POPULATION_BAND_RATIO = 0.75;
const SCORE_WEIGHTS = Object.freeze({
  population: 0.6,
  centrality: 0.2,
  suitability: 0.1,
  resource: 0.05,
  access: 0.05
});

export function inspectProvincialCapitalReassessment(map, request = {}) {
  const normalized = normalizeRequest(request);
  const provinces = activeProvinces(map);
  const requestedIds = normalized.provinceIds ?? provinces.map(provinceId);
  const missing = requestedIds.filter(id => !provinces.some(province => provinceId(province) === id));
  if (missing.length) {
    return inspection(false, "province-not-found", `找不到省份：${missing.map(id => `#${id}`).join("、")}`, {
      request: normalized,
      changes: [],
      unchanged: [],
      protected: [],
      rejected: missing.map(id => ({provinceId: id, code: "province-not-found"}))
    }, map);
  }

  const lockKeys = regenerationLockKeys(map, normalized);
  const changes = [];
  const unchanged = [];
  const protectedItems = [];
  const rejected = [];
  const evaluations = [];

  for (const id of requestedIds) {
    const province = provinceFromMap(map, id);
    const evaluation = evaluateProvince(map, province, lockKeys, normalized);
    evaluations.push(evaluation);
    if (evaluation.status === "protected") protectedItems.push(evaluation);
    else if (evaluation.status === "rejected") rejected.push(evaluation);
    else if (evaluation.currentCityId === evaluation.nextCityId && !evaluation.needsSync) unchanged.push(evaluation);
    else changes.push(evaluation);
  }

  const payload = {
    request: normalized,
    changes,
    unchanged,
    protected: protectedItems,
    rejected,
    evaluations
  };
  const allowed = rejected.length === 0 && changes.length > 0;
  const code = rejected.length ? "rejected" : allowed ? "ok" : protectedItems.length ? "protected" : "no-op";
  const summary = rejected.length
    ? `请求包含 ${rejected.length} 个数据不一致的省份，全部省会重评均已拒绝。`
    : allowed
      ? `可重评 ${changes.length} 个省份的省会。`
      : protectedItems.length
        ? "目标省份或当前省会受到重生成锁保护。"
        : "当前省会已经符合确定性选择结果。";
  return inspection(allowed, code, summary, payload, map);
}

export function applyProvincialCapitalPlan(map, preview, {faultInjector = null} = {}) {
  if (!preview || !Array.isArray(preview.changes)) throw provincialCapitalError("preview-invalid", "省会重评预览无效");
  if (preview.rejected?.length) {
    throw provincialCapitalError("plan-rejected", preview.summary || "省会重评预览包含数据冲突");
  }
  const applied = [];
  for (const change of preview.changes) {
    applyProvinceCapital(map, change);
    applied.push({
      provinceId: change.provinceId,
      previousCityId: change.currentCityId,
      cityId: change.nextCityId,
      burgId: change.nextBurgId
    });
    faultInjector?.({stage: "after-province", change, applied: [...applied], map});
  }
  return {
    changed: applied.length,
    unchanged: preview.unchanged?.length || 0,
    protected: preview.protected?.length || 0,
    rejected: preview.rejected?.length || 0,
    applied
  };
}

export function reassessGeneratedProvincialCapitals(grid, pack, settlements, politics, options = {}) {
  const map = {
    grid,
    pack,
    settlements,
    politics,
    rivers: options.rivers || pack?.rivers || null,
    regenerationLocks: {
      version: 1,
      entries: generationLockEntries(options)
    }
  };
  const provinceIds = generationProvinceScope(options, politics);
  const preview = inspectProvincialCapitalReassessment(map, {
    provinceIds,
    repairInconsistentCurrent: options.repairInconsistentProvincialCapitals === true
  });
  if (preview.rejected.length) {
    throw provincialCapitalError(preview.rejected[0]?.code || "rejected", preview.summary, {
      rejected: preview.rejected.map(item => ({
        provinceId: item.provinceId,
        code: item.code,
        summary: item.summary
      }))
    });
  }
  if (preview.changes.length) applyProvincialCapitalPlan(map, preview);
  return preview;
}

export function captureProvincialCapitalSnapshot(map, provinceIds) {
  const ids = new Set((provinceIds || []).map(Number));
  const cityIndexes = [];
  for (const [index, city] of (map?.settlements?.cities || []).entries()) {
    if (city && ids.has(Number(city.province))) cityIndexes.push(index);
  }
  const burgIndexes = [];
  for (const [index, burg] of (map?.pack?.burgs || []).entries()) {
    if (burg && ids.has(Number(burg.province))) burgIndexes.push(index);
  }
  return {
    provinces: captureCollectionEntries(uniqueCollections(map?.politics?.provinces, map?.pack?.provinces), ids),
    cities: captureCollectionEntries(uniqueCollections(map?.settlements?.cities), new Set(cityIndexes)),
    burgs: captureCollectionEntries(uniqueCollections(map?.pack?.burgs), new Set(burgIndexes)),
    routes: captureAllCollectionEntries(uniqueCollections(map?.settlements?.routes, map?.pack?.routes)),
    derivedStale: structuredClone(map?.metadata?.derivedStale || null)
  };
}

export function restoreProvincialCapitalSnapshot(map, snapshot) {
  if (!snapshot) throw provincialCapitalError("snapshot-missing", "缺少省会重评事务快照");
  restoreCollectionEntries(snapshot.provinces);
  restoreCollectionEntries(snapshot.cities);
  restoreCollectionEntries(snapshot.burgs);
  restoreCollectionEntries(snapshot.routes);
  if (snapshot.derivedStale === null) {
    if (map?.metadata) delete map.metadata.derivedStale;
  } else if (map?.metadata) {
    map.metadata.derivedStale = structuredClone(snapshot.derivedStale);
  }
}

export function markProvincialCapitalDerivedStale(map) {
  if (!map?.metadata) return;
  const stale = map.metadata.derivedStale && typeof map.metadata.derivedStale === "object"
    ? map.metadata.derivedStale
    : {systems: []};
  const systems = new Set(Array.isArray(stale.systems) ? stale.systems : []);
  for (const system of ["routes", "labels", "economy"]) systems.add(system);
  map.metadata.derivedStale = {...stale, systems: [...systems]};
}

function evaluateProvince(map, province, lockKeys, request) {
  const id = provinceId(province);
  const repairProvinceMirror = !provinceMirrorsConsistent(map, id);
  if (repairProvinceMirror && request.repairInconsistentCurrent !== true) {
    return evaluationBase(province, null, {
      status: "rejected",
      code: "province-mirror-inconsistent",
      summary: `省份 #${id} 的 politics / pack 中心镜像不一致，拒绝静默覆盖。`
    });
  }
  const currentBurgId = Number(province?.burg || 0);
  const currentCity = cityByBurg(map, currentBurgId);
  if (currentBurgId > 0 && !currentCity && request.repairInconsistentCurrent !== true) {
    return evaluationBase(province, null, {
      status: "rejected",
      code: "current-capital-inconsistent",
      summary: `省份 #${id} 的 province.burg 找不到对应城市，拒绝静默覆盖。`
    });
  }
  if (request.repairInconsistentCurrent === true
    && (lockKeys.has(`province:${id}`) || (currentCity && lockKeys.has(`city:${Number(currentCity.id)}`)))) {
    return evaluationBase(province, currentCity, {
      status: "protected",
      code: lockKeys.has(`province:${id}`) ? "province-locked" : "capital-city-locked",
      summary: `省份 #${id} 或当前省会受到锁保护，重生成将保留该对象并继续处理其余省份。`
    });
  }
  const lockedCapitalConflicts = (map?.settlements?.cities || []).filter(city => {
    if (!city || city.removed || Number(city.province) !== id || !lockKeys.has(`city:${Number(city.id)}`)) return false;
    if (Number(city.id) === Number(currentCity?.id)) return false;
    const burg = burgFromMap(map, Number(city.burgId));
    return Boolean(city.provincial || burg?.provincial);
  });
  if (lockedCapitalConflicts.length) {
    return evaluationBase(province, currentCity, {
      status: request.repairInconsistentCurrent === true ? "protected" : "rejected",
      code: "locked-capital-inconsistent",
      summary: `省份 #${id} 的非现任锁定城市仍带有省会标记，拒绝改写锁定对象。`
    });
  }
  const candidates = validProvinceCandidates(map, province);
  if (!candidates.length) {
    if (request.repairInconsistentCurrent === true) {
      return evaluationBase(province, currentCity, {
        status: "selected",
        code: "cleared-no-candidate",
        summary: `省份 #${id} 当前没有可用城市，重生成将清空悬空省会引用并继续。`,
        nextCityId: null,
        nextBurgId: 0,
        candidateCount: 0,
        needsSync: provinceCapitalClearNeedsSync(map, province),
        clearCapital: true,
        repairProvinceMirror
      });
    }
    return evaluationBase(province, currentCity, {
      status: "rejected",
      code: "no-valid-candidate",
      summary: `省份 #${id} 没有 city / burg / pack / politics 一致的陆地候选。`
    });
  }
  if (currentCity && !candidates.some(candidate => candidate.cityId === Number(currentCity.id))
    && request.repairInconsistentCurrent !== true) {
    return evaluationBase(province, currentCity, {
      status: "rejected",
      code: "current-capital-inconsistent",
      summary: `省份 #${id} 的当前省会镜像不一致，拒绝自动覆盖。`
    });
  }
  if (lockKeys.has(`province:${id}`) || (currentCity && lockKeys.has(`city:${Number(currentCity.id)}`))) {
    if (!lockedProvinceCapitalConsistent(map, province, currentCity)) {
      return evaluationBase(province, currentCity, {
        status: request.repairInconsistentCurrent === true ? "protected" : "rejected",
        code: "locked-capital-inconsistent",
        summary: `省份 #${id} 的锁定省会数据不一致，拒绝以保护状态掩盖冲突。`
      });
    }
    return evaluationBase(province, currentCity, {
      status: "protected",
      code: lockKeys.has(`province:${id}`) ? "province-locked" : "capital-city-locked",
      summary: `省份 #${id} 或当前省会受到锁保护。`
    });
  }

  const state = stateFromMap(map, Number(province.state));
  const nationalCapital = candidates.find(candidate => candidate.burgId === Number(state?.capital || 0));
  if (nationalCapital) {
    if (lockKeys.has(`city:${nationalCapital.cityId}`) && nationalCapital.cityId !== Number(currentCity?.id)) {
      return evaluationBase(province, currentCity, {
        status: request.repairInconsistentCurrent === true ? "protected" : "rejected",
        code: "national-capital-locked-conflict",
        summary: `国家首都城市 #${nationalCapital.cityId} 已锁定且不是当前省会。`
      });
    }
    return selectedEvaluation(province, currentCity, nationalCapital, candidates, {
      selectionReason: "national-capital",
      needsSync: repairProvinceMirror || provinceCapitalNeedsSync(map, province, nationalCapital),
      repairProvinceMirror
    });
  }

  const maxPopulation = Math.max(...candidates.map(candidate => candidate.population));
  const threshold = maxPopulation * POPULATION_BAND_RATIO;
  const band = candidates.filter(candidate => candidate.population + Number.EPSILON >= threshold);
  const lockedBandCandidates = band.filter(candidate => lockKeys.has(`city:${candidate.cityId}`) && candidate.cityId !== Number(currentCity?.id));
  const selectable = band.filter(candidate => !lockedBandCandidates.includes(candidate));
  if (!selectable.length) {
    return evaluationBase(province, currentCity, {
      status: request.repairInconsistentCurrent === true ? "protected" : "rejected",
      code: "candidate-locked-conflict",
      summary: `省份 #${id} 的前列候选均受到城市锁保护。`
    });
  }
  scoreCandidates(selectable);
  selectable.sort(compareCandidates);
  return selectedEvaluation(province, currentCity, selectable[0], candidates, {
    selectionReason: "deterministic-score",
    needsSync: repairProvinceMirror || provinceCapitalNeedsSync(map, province, selectable[0]),
    repairProvinceMirror,
    populationThreshold: round(threshold, 6),
    candidateBand: selectable.map(candidateSummary)
  });
}

function lockedProvinceCapitalConsistent(map, province, currentCity) {
  if (!currentCity || !currentCity.provincial) return false;
  const id = provinceId(province);
  const currentBurg = burgFromMap(map, Number(currentCity.burgId));
  if (!currentBurg?.provincial) return false;
  const packCell = Number.isInteger(currentCity.packCell) ? currentCity.packCell : Number(currentBurg.cell);
  const gridCell = Number.isInteger(currentCity.cell) ? currentCity.cell : Number(map?.pack?.cells?.g?.[packCell]);
  const provincialCities = (map?.settlements?.cities || [])
    .filter(city => city && !city.removed && Number(city.province) === id && city.provincial);
  const provincialBurgs = (map?.pack?.burgs || [])
    .filter(burg => burg && !burg.removed && Number(burg.province) === id && burg.provincial);
  return Number(province?.burg) === Number(currentCity.burgId)
    && Number(province?.center) === packCell
    && Number(province?.gridCenter) === gridCell
    && provincialCities.length === 1
    && Number(provincialCities[0].id) === Number(currentCity.id)
    && provincialBurgs.length === 1
    && Number(provincialBurgs[0].i ?? provincialBurgs[0].id) === Number(currentCity.burgId);
}

function provinceCapitalNeedsSync(map, province, selected) {
  const id = provinceId(province);
  const provinceCities = (map?.settlements?.cities || []).filter(city => city && !city.removed && Number(city.province) === id);
  const provinceBurgs = (map?.pack?.burgs || []).filter(burg => burg && !burg.removed && Number(burg.province) === id);
  const selectedCity = provinceCities.find(city => Number(city.id) === selected.cityId);
  const selectedBurg = burgFromMap(map, selected.burgId);
  return Number(province?.burg) !== selected.burgId
    || Number(province?.center) !== selected.packCell
    || Number(province?.gridCenter) !== selected.gridCell
    || !selectedCity?.provincial
    || !selectedBurg?.provincial
    || provinceCities.some(city => Number(city.id) !== selected.cityId && city.provincial)
    || provinceBurgs.some(burg => Number(burg.i ?? burg.id) !== selected.burgId && burg.provincial);
}

function provinceCapitalClearNeedsSync(map, province) {
  const id = provinceId(province);
  if (!provinceMirrorsConsistent(map, id) || Number(province?.burg || 0) !== 0) return true;
  return (map?.settlements?.cities || []).some(city => city && !city.removed && Number(city.province) === id && city.provincial)
    || (map?.pack?.burgs || []).some(burg => burg && !burg.removed && Number(burg.province) === id && burg.provincial);
}

function validProvinceCandidates(map, province) {
  const id = provinceId(province);
  const stateId = Number(province?.state || 0);
  const candidates = [];
  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed || Number(city.province) !== id || Number(city.state) !== stateId) continue;
    const burg = burgFromMap(map, Number(city.burgId));
    if (!burg || burg.removed || Number(burg.cityId) !== Number(city.id)) continue;
    const packCell = Number.isInteger(city.packCell) ? city.packCell : Number(burg.cell);
    const gridCell = Number.isInteger(city.cell) ? city.cell : Number(map?.pack?.cells?.g?.[packCell]);
    if (!Number.isInteger(packCell) || packCell < 0 || Number(burg.cell) !== packCell) continue;
    if (Number(map?.pack?.cells?.h?.[packCell]) < 20) continue;
    const packBurgIds = burgIdsAtPackCell(map, packCell);
    if (!packBurgIds.includes(Number(city.burgId)) || Number(map?.pack?.cells?.burg?.[packCell]) !== packBurgIds[0]) continue;
    if (Number(map?.pack?.cells?.province?.[packCell]) !== id || Number(map?.pack?.cells?.state?.[packCell]) !== stateId) continue;
    if (Number(burg.province) !== id || Number(burg.state) !== stateId) continue;
    if (!Number.isInteger(gridCell) || gridCell < 0 || Number(map?.grid?.cells?.h?.[gridCell]) < 20) continue;
    if (Number(map?.pack?.cells?.g?.[packCell]) !== gridCell) continue;
    const gridCityIds = cityIdsAtGridCell(map, gridCell);
    if (!gridCityIds.includes(Number(city.id)) || Number(map?.grid?.cells?.burg?.[gridCell]) !== gridCityIds[0]) continue;
    candidates.push(candidateFromCity(map, city, burg, province, packCell, gridCell));
  }
  return candidates;
}

function candidateFromCity(map, city, burg, province, packCell, gridCell) {
  const point = map?.pack?.cells?.p?.[packCell] || [Number(city.x) || 0, Number(city.y) || 0];
  const pole = Array.isArray(province?.pole)
    ? province.pole
    : map?.pack?.cells?.p?.[Number(province?.center)] || point;
  const dx = Number(point[0] || 0) - Number(pole[0] || 0);
  const dy = Number(point[1] || 0) - Number(pole[1] || 0);
  const river = Boolean(map?.pack?.cells?.r?.[packCell] || city.port || burg.port);
  return {
    cityId: Number(city.id),
    burgId: Number(city.burgId),
    packCell,
    gridCell,
    population: Math.max(0, Number(city.population ?? burg.population) || 0),
    poleDistance: Math.sqrt(dx * dx + dy * dy),
    suitability: Math.max(0, Number(map?.pack?.cells?.s?.[packCell]) || 0),
    resource: Math.max(0, Number(city.resourceScore ?? burg.resourceScore ?? map?.pack?.cells?.resourcePotential?.[packCell]) || 0),
    access: river ? 1 : 0,
    score: 0,
    components: null
  };
}

function scoreCandidates(candidates) {
  const maxPopulation = Math.max(1e-9, ...candidates.map(candidate => candidate.population));
  const maxDistance = Math.max(1e-9, ...candidates.map(candidate => candidate.poleDistance));
  const minDistance = Math.min(...candidates.map(candidate => candidate.poleDistance));
  const distanceRange = Math.max(1e-9, maxDistance - minDistance);
  const maxSuitability = Math.max(1e-9, ...candidates.map(candidate => candidate.suitability));
  const maxResource = Math.max(1e-9, ...candidates.map(candidate => candidate.resource));
  for (const candidate of candidates) {
    const components = {
      population: candidate.population / maxPopulation,
      centrality: candidates.length === 1 ? 1 : 1 - (candidate.poleDistance - minDistance) / distanceRange,
      suitability: candidate.suitability / maxSuitability,
      resource: candidate.resource / maxResource,
      access: candidate.access
    };
    candidate.components = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value, 6)]));
    candidate.score = round(Object.entries(SCORE_WEIGHTS)
      .reduce((sum, [key, weight]) => sum + components[key] * weight, 0), 9);
  }
}

function compareCandidates(left, right) {
  return right.score - left.score
    || right.population - left.population
    || left.burgId - right.burgId
    || left.cityId - right.cityId;
}

function selectedEvaluation(province, currentCity, selected, allCandidates, details = {}) {
  return {
    provinceId: provinceId(province),
    provinceName: province.fullName || province.name || `省份 #${provinceId(province)}`,
    stateId: Number(province.state || 0),
    status: "selected",
    code: "ok",
    currentCityId: currentCity ? Number(currentCity.id) : null,
    currentBurgId: Number(province.burg || 0),
    nextCityId: selected.cityId,
    nextBurgId: selected.burgId,
    nextPackCell: selected.packCell,
    nextGridCell: selected.gridCell,
    candidateCount: allCandidates.length,
    selected: candidateSummary(selected),
    ...details
  };
}

function evaluationBase(province, currentCity, details) {
  return {
    provinceId: provinceId(province),
    provinceName: province?.fullName || province?.name || `省份 #${provinceId(province)}`,
    stateId: Number(province?.state || 0),
    currentCityId: currentCity ? Number(currentCity.id) : null,
    currentBurgId: Number(province?.burg || 0),
    nextCityId: currentCity ? Number(currentCity.id) : null,
    nextBurgId: Number(province?.burg || 0),
    ...details
  };
}

function candidateSummary(candidate) {
  return {
    cityId: candidate.cityId,
    burgId: candidate.burgId,
    packCell: candidate.packCell,
    gridCell: candidate.gridCell,
    population: round(candidate.population, 6),
    score: round(candidate.score, 9),
    components: candidate.components ? {...candidate.components} : null
  };
}

function applyProvinceCapital(map, change) {
  if (change.repairProvinceMirror) repairProvinceMirrorCollections(map, change.provinceId);
  const province = provinceFromMap(map, change.provinceId);
  if (change.clearCapital) {
    if (!province) throw provincialCapitalError("mirror-missing", `省份 #${change.provinceId} 的省份镜像已失效`);
    clearProvinceCapital(map, province, change);
    return;
  }
  const selectedCity = cityFromMap(map, change.nextCityId);
  const selectedBurg = burgFromMap(map, change.nextBurgId);
  if (!province || !selectedCity || !selectedBurg) {
    throw provincialCapitalError("mirror-missing", `省份 #${change.provinceId} 的目标省会镜像已失效`);
  }

  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed || Number(city.province) !== change.provinceId) continue;
    const isSelected = Number(city.id) === change.nextCityId;
    city.provincial = isSelected;
    const burg = burgFromMap(map, Number(city.burgId));
    if (burg) {
      burg.provincial = isSelected;
      if (isSelected) {
        city.state = Number(province.state);
        city.province = change.provinceId;
        burg.state = Number(province.state);
        burg.province = change.provinceId;
      }
    }
  }
  for (const burg of map?.pack?.burgs || []) {
    if (!burg || burg.removed || Number(burg.province) !== change.provinceId) continue;
    burg.provincial = Number(burg.i ?? burg.id) === change.nextBurgId;
  }

  for (const collection of uniqueCollections(map?.politics?.provinces, map?.pack?.provinces)) {
    const target = collection[change.provinceId];
    if (!target) continue;
    target.state = Number(province.state);
    target.burg = change.nextBurgId;
    target.center = change.nextPackCell;
    target.gridCenter = change.nextGridCell;
  }
}

function clearProvinceCapital(map, province, change) {
  const provinceId = Number(change.provinceId);
  const currentBurgId = Number(change.currentBurgId || 0);
  const currentCityId = Number(change.currentCityId || 0);
  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed) continue;
    if (Number(city.province) === provinceId || currentCityId > 0 && Number(city.id) === currentCityId) city.provincial = false;
  }
  for (const burg of map?.pack?.burgs || []) {
    if (!burg || burg.removed) continue;
    if (Number(burg.province) === provinceId || currentBurgId > 0 && Number(burg.i ?? burg.id) === currentBurgId) burg.provincial = false;
  }
  const center = Number(province.center || 0);
  const gridCenter = Number(province.gridCenter || 0);
  const state = Number(province.state || 0);
  for (const collection of uniqueCollections(map?.politics?.provinces, map?.pack?.provinces)) {
    const target = collection[provinceId];
    if (!target) continue;
    target.state = state;
    target.burg = 0;
    target.center = center;
    target.gridCenter = gridCenter;
  }
}

function repairProvinceMirrorCollections(map, id) {
  const politics = map?.politics?.provinces;
  const pack = map?.pack?.provinces;
  const canonical = politics?.[id] || pack?.[id];
  if (!canonical) return;
  if (politics && !politics[id]) politics[id] = structuredClone(canonical);
  if (pack && !pack[id]) pack[id] = structuredClone(canonical);
}

function inspection(allowed, code, summary, payload, map) {
  const fingerprintInput = {
    request: payload.request,
    changes: payload.changes,
    unchanged: payload.unchanged,
    protected: payload.protected,
    rejected: payload.rejected,
    relevant: relevantFingerprintState(map, payload.evaluations || [])
  };
  return {
    allowed,
    code,
    summary,
    fingerprint: stableFingerprint(fingerprintInput),
    ...payload
  };
}

function relevantFingerprintState(map, evaluations) {
  const provinceIds = new Set(evaluations.map(item => Number(item.provinceId)));
  return {
    provinces: [...provinceIds].sort((a, b) => a - b).map(id => {
      const province = provinceFromMap(map, id);
      return province ? {
        id,
        state: province.state,
        burg: province.burg,
        center: province.center,
        gridCenter: province.gridCenter,
        pole: province.pole
      } : {id, missing: true};
    }),
    cities: (map?.settlements?.cities || [])
      .filter(city => city && provinceIds.has(Number(city.province)))
      .map(city => ({
        id: city.id,
        burgId: city.burgId,
        state: city.state,
        province: city.province,
        population: city.population,
        packCell: city.packCell,
        cell: city.cell,
        provincial: city.provincial,
        port: city.port,
        resourceScore: city.resourceScore
      }))
      .sort((a, b) => Number(a.id) - Number(b.id)),
    locks: [...regenerationLockKeys(map, {})].sort()
  };
}

function normalizeRequest(request) {
  if (request == null) return {provinceIds: null, repairInconsistentCurrent: false};
  if (typeof request === "number") return {provinceIds: [normalizeProvinceId(request)], repairInconsistentCurrent: false};
  if (typeof request !== "object" || Array.isArray(request)) {
    throw provincialCapitalError("invalid-request", "省会重评请求必须是省份 ID 或参数对象");
  }
  const repairInconsistentCurrent = request.repairInconsistentCurrent === true;
  if (request.all === true || request.provinceIds == null && request.provinceId == null) return {provinceIds: null, repairInconsistentCurrent};
  const source = request.provinceIds ?? [request.provinceId];
  if (!Array.isArray(source) || !source.length) throw provincialCapitalError("invalid-request", "省会重评省份列表不能为空");
  const ids = [...new Set(source.map(normalizeProvinceId))].sort((a, b) => a - b);
  return {provinceIds: ids, repairInconsistentCurrent};
}

function normalizeProvinceId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw provincialCapitalError("invalid-province-id", "省份 ID 必须是正整数");
  return id;
}

function regenerationLockKeys(map, options) {
  const keys = new Set();
  for (const entry of map?.regenerationLocks?.entries || []) {
    if ((entry?.kind === "province" || entry?.kind === "city") && Number.isInteger(Number(entry.id))) {
      keys.add(`${entry.kind}:${Number(entry.id)}`);
    }
  }
  for (const id of options?.protectedProvinceIds || []) keys.add(`province:${Number(id)}`);
  for (const id of options?.protectedCityIds || []) keys.add(`city:${Number(id)}`);
  return keys;
}

function generationLockEntries(options) {
  const entries = [];
  for (const province of options.lockedProvinces || []) {
    const id = Number(province?.i ?? province?.id);
    if (Number.isInteger(id) && id > 0) entries.push({kind: "province", id});
  }
  for (const city of options.lockedCities || options.preservedCities || []) {
    const id = Number(city?.id ?? city?.i);
    if (Number.isInteger(id) && id >= 0) entries.push({kind: "city", id});
  }
  return entries;
}

function generationProvinceScope(options, politics) {
  const scope = options.settlementScope;
  if (!scope || typeof scope !== "object") return null;
  const kind = String(scope.kind || scope.type || "");
  const id = Number(scope.id);
  if (kind === "province" && Number.isInteger(id) && id > 0) return [id];
  if (kind === "state" && Number.isInteger(id) && id > 0) {
    return (politics?.provinces || [])
      .filter(province => province && !province.removed && Number(province.state) === id)
      .map(provinceId);
  }
  return null;
}

function activeProvinces(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || [])
    .filter(province => province && !province.removed && provinceId(province) > 0);
}

function provinceFromMap(map, id) {
  return map?.politics?.provinces?.[id] || map?.pack?.provinces?.[id] || null;
}

function provinceMirrorsConsistent(map, id) {
  const politicsProvince = map?.politics?.provinces?.[id] || null;
  const packProvince = map?.pack?.provinces?.[id] || null;
  if (!politicsProvince || !packProvince) return false;
  return ["state", "burg", "center", "gridCenter"]
    .every(key => Number(politicsProvince[key] ?? 0) === Number(packProvince[key] ?? 0));
}

function stateFromMap(map, id) {
  return map?.politics?.states?.[id] || map?.pack?.states?.[id] || null;
}

function cityFromMap(map, id) {
  return (map?.settlements?.cities || []).find(city => city && Number(city.id) === Number(id)) || null;
}

function cityByBurg(map, burgId) {
  return (map?.settlements?.cities || []).find(city => city && !city.removed && Number(city.burgId) === Number(burgId)) || null;
}

function burgFromMap(map, id) {
  return map?.pack?.burgs?.[id] || (map?.pack?.burgs || []).find(burg => burg && Number(burg.i ?? burg.id) === Number(id)) || null;
}

function provinceId(province) {
  return Number(province?.i ?? province?.id ?? 0);
}

function uniqueCollections(...collections) {
  return [...new Set(collections.filter(Array.isArray))];
}

function captureCollectionEntries(collections, indexes) {
  return collections.map(collection => ({
    collection,
    entries: [...indexes].map(index => [index, structuredClone(collection[index])])
  }));
}

function captureAllCollectionEntries(collections) {
  return collections.map(collection => ({
    collection,
    entries: collection.map((value, index) => [index, structuredClone(value)])
  }));
}

function restoreCollectionEntries(snapshots) {
  for (const snapshot of snapshots || []) {
    for (const [index, value] of snapshot.entries || []) {
      const current = snapshot.collection[index];
      if (isRestorableObject(current) && isRestorableObject(value)) restoreValueInPlace(current, value);
      else snapshot.collection[index] = structuredClone(value);
    }
  }
}

function restoreValueInPlace(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    target.length = source.length;
    for (let index = 0; index < source.length; index++) {
      if (isRestorableObject(target[index]) && isRestorableObject(source[index])) restoreValueInPlace(target[index], source[index]);
      else target[index] = structuredClone(source[index]);
    }
    return target;
  }
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if (isRestorableObject(target[key]) && isRestorableObject(value)) restoreValueInPlace(target[key], value);
    else target[key] = structuredClone(value);
  }
  return target;
}

function isRestorableObject(value) {
  return Boolean(value && typeof value === "object"
    && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype));
}

function stableFingerprint(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pcap-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function provincialCapitalError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}
