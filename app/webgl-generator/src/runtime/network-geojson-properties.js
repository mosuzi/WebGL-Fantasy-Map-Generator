export const NETWORK_GEOJSON_PROPERTY_SCHEMA_ID = "fmg-network-properties-v1";
export const NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION = 1;

export const NETWORK_GEOJSON_FIELD_DICTIONARY = deepFreeze({
  route: {
    legacy: {
      id: "integer", type: "string", level: "string", state: "integer", province: "integer", from: "integer", to: "integer",
      cells: "integer", resourceCells: "integer", markerResourceCells: "integer", resourceGoodIds: "integer[]", distance: "number",
      hasNote: "boolean", note: "string"
    },
    stableV1: {
      networkSchema: "string", networkSchemaVersion: "integer", name: "string", displayName: "string", typeCode: "string", typeLabel: "string",
      levelCode: "string", levelLabel: "string", fromName: "string|null", toName: "string|null", stateName: "string|null",
      provinceName: "string|null", lengthWorld: "number", lengthUnit: "string", segmentCount: "integer", gridCellCount: "integer",
      packCellCount: "integer"
    }
  },
  river: {
    legacy: {
      id: "integer", name: "string", type: "string", source: "integer", mouth: "integer", parent: "integer", basin: "integer",
      flux: "number", length: "number", width: "number", widthFactor: "number", catchmentArea: "number", catchmentCells: "integer",
      averagePrecipitation: "number", hydrologyMethod: "string", hasNote: "boolean", note: "string"
    },
    stableV1: {
      networkSchema: "string", networkSchemaVersion: "integer", displayName: "string", typeCode: "string", typeLabel: "string",
      levelCode: "string", levelLabel: "string", lengthWorld: "number", lengthUnit: "string", segmentCount: "integer",
      gridCellCount: "integer", packCellCount: "integer", discharge: "number"
    }
  }
});

const ROUTE_TYPE_LABELS = Object.freeze({road: "道路", trail: "小径", searoute: "海路"});
const ROUTE_LEVEL_LABELS = Object.freeze({primary: "主要", secondary: "次要", minor: "支线", trail: "小径"});

export function serializeRouteGeoJsonProperties(map, route) {
  const from = findById(map?.settlements?.cities, route?.from, "id");
  const to = findById(map?.settlements?.cities, route?.to, "id");
  const state = findById(map?.politics?.states, route?.state, "i");
  const province = findById(map?.politics?.provinces, route?.province, "i");
  const typeCode = Object.hasOwn(ROUTE_TYPE_LABELS, route?.type) ? route.type : "unknown";
  const levelCode = Object.hasOwn(ROUTE_LEVEL_LABELS, route?.level) ? route.level : "unclassified";
  const typeLabel = ROUTE_TYPE_LABELS[typeCode] || "未知路线";
  const levelLabel = ROUTE_LEVEL_LABELS[levelCode] || "未分级";
  const fromName = objectName(from);
  const toName = objectName(to);
  const displayName = nonEmptyText(route?.name)
    || (fromName && toName ? `${fromName}—${toName}` : fromName || toName ? `${fromName || toName}${typeLabel}` : `${typeLabel} #${integerOrZero(route?.id)}`);
  return {
    networkSchema: NETWORK_GEOJSON_PROPERTY_SCHEMA_ID,
    networkSchemaVersion: NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION,
    name: displayName,
    displayName,
    typeCode,
    typeLabel,
    levelCode,
    levelLabel,
    fromName,
    toName,
    stateName: objectName(state),
    provinceName: objectName(province),
    lengthWorld: lineLength(route?.points),
    lengthUnit: "map-world-unit",
    segmentCount: segmentCount(route?.points),
    gridCellCount: collectionLength(route?.cells),
    packCellCount: collectionLength(route?.packCells)
  };
}

export function serializeRiverGeoJsonProperties(_map, river) {
  const typeCode = riverTypeCode(river);
  const typeLabel = typeCode === "branch" ? "支流" : typeCode === "river" ? "河流" : "未知河流";
  const levelCode = typeCode === "branch" ? "tributary" : typeCode === "river" ? "mainstem" : "unclassified";
  const levelLabel = levelCode === "tributary" ? "支流" : levelCode === "mainstem" ? "干流" : "未分级";
  const computedLength = lineLength(river?.points);
  const storedLength = finiteNonNegative(river?.length);
  const lengthWorld = storedLength === null || storedLength === 0 && computedLength > 0 ? computedLength : storedLength;
  return {
    networkSchema: NETWORK_GEOJSON_PROPERTY_SCHEMA_ID,
    networkSchemaVersion: NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION,
    displayName: nonEmptyText(river?.name) || `${typeLabel} #${integerOrZero(river?.id ?? river?.i)}`,
    typeCode,
    typeLabel,
    levelCode,
    levelLabel,
    lengthWorld,
    lengthUnit: "map-world-unit",
    segmentCount: segmentCount(river?.points),
    gridCellCount: collectionLength(river?.gridCells),
    packCellCount: collectionLength(river?.cells),
    discharge: finiteNonNegative(river?.flux || river?.discharge || 0) ?? 0
  };
}

function riverTypeCode(river) {
  const raw = String(river?.type || "").trim().toLowerCase();
  if (integerOrZero(river?.parent) > 0 || raw === "branch" || raw === "tributary") return "branch";
  if (raw === "river" || raw === "mainstem" || raw === "main") return "river";
  return "unknown";
}

function findById(items, value, primaryKey) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0 || !Array.isArray(items)) return null;
  const direct = items[id];
  if (direct && Number(direct[primaryKey] ?? direct.id) === id) return direct;
  return items.find(item => item && Number(item[primaryKey] ?? item.id) === id) || null;
}

function objectName(object) {
  return nonEmptyText(object?.fullName) || nonEmptyText(object?.name) || null;
}

function nonEmptyText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function lineLength(points) {
  let length = 0;
  for (let index = 1; index < collectionLength(points); index++) {
    const left = points[index - 1];
    const right = points[index];
    if (!finitePoint(left) || !finitePoint(right)) continue;
    length += Math.hypot(Number(right[0]) - Number(left[0]), Number(right[1]) - Number(left[1]));
  }
  return round(length);
}

function segmentCount(points) {
  let count = 0;
  for (let index = 1; index < collectionLength(points); index++) if (finitePoint(points[index - 1]) && finitePoint(points[index])) count++;
  return count;
}

function finitePoint(point) {
  return Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1]));
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? round(number) : null;
}

function collectionLength(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value) ? value.length : 0;
}

function integerOrZero(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 1e6) / 1e6;
}

function deepFreeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === "object" && !Object.isFrozen(item)) deepFreeze(item);
  return Object.freeze(value);
}
