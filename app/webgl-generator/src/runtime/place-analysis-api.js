import {convertMapDistance, formatDistance, normalizeUnitPreferences} from "../ui/display-units.js";

const PLACE_KINDS = Object.freeze(["state", "province", "city"]);
const PLACE_KIND_PRIORITY = new Map(PLACE_KINDS.map((kind, index) => [kind, index]));
const PRIORITY_RULE = "state>province>city;id:asc";
const DEFAULT_DIRECTION_EPSILON = 1e-9;

export function resolvePlace(map, reference, {revision = null} = {}) {
  assertMap(map);
  const binding = normalizeRevision(revision);
  if (typeof reference === "string") return resolvePlaceName(map, reference, binding);
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    throw placeError("invalid_place_reference", "地点引用必须是完整名称或 {kind, id}", reference);
  }
  const kind = String(reference.kind || "").trim();
  if (!PLACE_KIND_PRIORITY.has(kind)) throw placeError("invalid_place_kind", `不支持的地点类型：${kind || "空"}`, reference);
  const id = Number(reference.id);
  if (!Number.isInteger(id) || id <= 0) throw placeError("invalid_place_id", "地点 ID 必须是正整数", reference);
  const source = placeSourceById(map, kind, id);
  if (!source) throw placeError("place_not_found", `找不到 ${kind} #${id}`, reference);
  if (source.removed) throw placeError("place_removed", `${placeKindLabel(kind)} #${id} 已删除`, reference);
  const selected = placeCandidate(kind, source, "id");
  return {selected, candidates: [selected], candidateCount: 1, priorityRule: "exact-reference", matchedBy: "id", revision: binding};
}

export function measurePlaceDistance(map, from, to, options = {}) {
  assertMap(map);
  const revision = normalizeRevision(options.revision);
  const fromResolution = resolvePlace(map, from, {revision});
  const toResolution = resolvePlace(map, to, {revision});
  const fromAnchor = resolvePlaceAnchor(map, fromResolution.selected);
  const toAnchor = resolvePlaceAnchor(map, toResolution.selected);
  const distanceWorld = Math.hypot(toAnchor.x - fromAnchor.x, toAnchor.y - fromAnchor.y);
  const units = normalizeUnitPreferences(options.units || {});
  const converted = convertMapDistance(distanceWorld, units);
  const reasons = uniqueStrings([
    fromAnchor.reason,
    toAnchor.reason,
    fromAnchor.kind === "city" && toAnchor.kind === "city" ? null : "administrative-representative-anchor",
    options.unitSource === "defaulted" ? "missing-session-unit-preferences" : null,
    options.legacyCoordinatePrecision === true ? "legacy-coordinate-precision" : null
  ]);
  return {
    from: endpoint(fromResolution, fromAnchor, revision),
    to: endpoint(toResolution, toAnchor, revision),
    distanceWorld,
    distanceValue: converted.value,
    kilometers: converted.kilometers,
    unit: converted.unit,
    formatted: formatDistance(distanceWorld, units),
    unitSource: String(options.unitSource || "explicit"),
    precision: fromAnchor.kind === "city" && toAnchor.kind === "city" ? "coordinate" : "representative-anchor",
    approximate: reasons.length > 0,
    reason: reasons,
    revision
  };
}

export function getPlaceDirection(map, from, to, options = {}) {
  const distance = measurePlaceDistance(map, from, to, options);
  const dx = distance.to.x - distance.from.x;
  const dy = distance.to.y - distance.from.y;
  const epsilon = positiveFinite(options.epsilon, DEFAULT_DIRECTION_EPSILON);
  if (Math.hypot(dx, dy) <= epsilon) {
    return {from: distance.from, to: distance.to, dx, dy, bearingDegrees: null, direction: "重合", distance, revision: distance.revision};
  }
  const bearingDegrees = normalizeDegrees(Math.atan2(dx, -dy) * 180 / Math.PI);
  return {
    from: distance.from,
    to: distance.to,
    dx,
    dy,
    bearingDegrees,
    direction: directionLabel(bearingDegrees),
    distance,
    revision: distance.revision
  };
}

export function resolvePlaceAnchor(map, place) {
  const kind = String(place?.kind || "");
  const id = Number(place?.id);
  if (kind === "city") {
    const city = placeSourceById(map, kind, id);
    if (city && !city.removed && finitePoint(city)) return anchor(kind, city.x, city.y, "city-coordinate");
    throw anchorError(place, ["city-coordinate"]);
  }
  if (kind === "state") {
    const state = placeSourceById(map, kind, id);
    const capital = state && !state.removed ? map.pack?.burgs?.[Number(state.capital)] : null;
    if (capital && !capital.removed && finitePoint(capital)) return anchor(kind, capital.x, capital.y, "state-capital");
    const center = packCellPoint(map, state?.center);
    if (center) return anchor(kind, center[0], center[1], "state-center-cell", "state-center-fallback");
    throw anchorError(place, ["state-capital", "state-center-cell"]);
  }
  if (kind === "province") {
    const province = placeSourceById(map, kind, id);
    const capital = uniqueProvinceCapital(map, province);
    if (capital) return anchor(kind, capital.x, capital.y, "province-capital");
    if (finiteArrayPoint(province?.pole)) return anchor(kind, province.pole[0], province.pole[1], "province-pole", "province-pole-fallback");
    const center = packCellPoint(map, province?.center);
    if (center) return anchor(kind, center[0], center[1], "province-center-cell", "province-center-fallback");
    throw anchorError(place, ["province-capital", "province-pole", "province-center-cell"]);
  }
  throw placeError("invalid_place_kind", `不支持的地点类型：${kind || "空"}`, place);
}

function resolvePlaceName(map, reference, revision) {
  const name = reference.trim();
  if (!name) throw placeError("invalid_place_reference", "地点名称不能为空", reference);
  const candidates = [];
  let removedMatches = 0;
  for (const kind of PLACE_KINDS) {
    for (const source of placeSources(map, kind)) {
      const matchedBy = matchedNameField(kind, source, name);
      if (!matchedBy) continue;
      if (source.removed) {
        removedMatches++;
        continue;
      }
      const id = placeId(source);
      if (id <= 0) continue;
      candidates.push(placeCandidate(kind, source, matchedBy));
    }
  }
  candidates.sort(compareCandidates);
  if (!candidates.length) {
    if (removedMatches) throw placeError("place_removed", `名称“${name}”只匹配到已删除地点`, reference);
    throw placeError("place_not_found", `找不到名称为“${name}”的地点`, reference);
  }
  return {
    selected: candidates[0],
    candidates,
    candidateCount: candidates.length,
    priorityRule: PRIORITY_RULE,
    matchedBy: candidates[0].matchedBy,
    revision
  };
}

function placeSources(map, kind) {
  if (kind === "state") return map.politics?.states || map.pack?.states || [];
  if (kind === "province") return map.politics?.provinces || map.pack?.provinces || [];
  return map.settlements?.cities || [];
}

function placeSourceById(map, kind, id) {
  return placeSources(map, kind).find(source => source && placeId(source) === id) || null;
}

function placeId(source) {
  const id = Number(source?.id ?? source?.i);
  return Number.isInteger(id) ? id : -1;
}

function matchedNameField(kind, source, name) {
  if (String(source?.name || "") === name) return "name";
  if (kind === "state" && String(source?.fullName || "") === name) return "fullName";
  return null;
}

function placeCandidate(kind, source, matchedBy) {
  return {
    kind,
    id: placeId(source),
    name: String(source?.name || source?.fullName || ""),
    ...(kind === "state" && source?.fullName ? {fullName: String(source.fullName)} : {}),
    matchedBy
  };
}

function compareCandidates(left, right) {
  return PLACE_KIND_PRIORITY.get(left.kind) - PLACE_KIND_PRIORITY.get(right.kind) || left.id - right.id;
}

function uniqueProvinceCapital(map, province) {
  if (!province || province.removed) return null;
  const provinceId = placeId(province);
  const cities = (map.settlements?.cities || []).filter(city => city && !city.removed && city.provincial && Number(city.province) === provinceId && finitePoint(city));
  const burgs = (map.pack?.burgs || []).filter(burg => burg && !burg.removed && burg.provincial && Number(burg.province) === provinceId && finitePoint(burg));
  if (cities.length !== 1 || burgs.length !== 1) return null;
  const city = cities[0];
  const burg = burgs[0];
  const burgId = placeId(burg);
  if (Number(province.burg) !== burgId || Number(city.burgId) !== burgId) return null;
  return city;
}

function packCellPoint(map, cell) {
  const id = Number(cell);
  if (!Number.isInteger(id) || id < 0) return null;
  const point = map.pack?.cells?.p?.[id];
  return finiteArrayPoint(point) ? point : null;
}

function endpoint(resolution, placeAnchor, revision) {
  return {
    ...resolution.selected,
    x: placeAnchor.x,
    y: placeAnchor.y,
    anchorSource: placeAnchor.anchorSource,
    mapRevision: revision.mapRevision
  };
}

function anchor(kind, x, y, anchorSource, reason = null) {
  return {kind, x: Number(x), y: Number(y), anchorSource, reason};
}

function anchorError(place, attemptedSources) {
  const error = placeError("place_anchor_invalid", `${placeKindLabel(place?.kind)} #${place?.id} 缺少有效代表点`, place);
  error.details.attemptedSources = attemptedSources;
  return error;
}

function placeError(code, message, reference) {
  const error = new Error(message);
  error.code = code;
  error.details = {reference: cloneReference(reference)};
  return error;
}

function cloneReference(reference) {
  if (!reference || typeof reference !== "object") return reference;
  return {kind: reference.kind, id: reference.id};
}

function normalizeRevision(value) {
  const mapIdentity = value?.mapIdentity === null || value?.mapIdentity === undefined ? null : String(value.mapIdentity);
  const mapRevision = Number(value?.mapRevision);
  return {mapIdentity, mapRevision: Number.isSafeInteger(mapRevision) && mapRevision >= 0 ? mapRevision : 0};
}

function finitePoint(value) {
  return Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y));
}

function finiteArrayPoint(value) {
  return Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function positiveFinite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeDegrees(value) {
  const normalized = value % 360;
  const positive = normalized < 0 ? normalized + 360 : normalized;
  return Math.round(positive * 1e12) / 1e12;
}

function directionLabel(bearing) {
  return ["北", "东北", "东", "东南", "南", "西南", "西", "西北"][Math.floor((bearing + 22.5) / 45) % 8];
}

function placeKindLabel(kind) {
  return {state: "国家", province: "省份", city: "城镇"}[kind] || "地点";
}

function assertMap(map) {
  if (!map || typeof map !== "object") throw placeError("invalid_place_reference", "当前没有可分析的地图", null);
}
