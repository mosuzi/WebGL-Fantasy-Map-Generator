import {
  cloneMeasurementStore,
  createMeasurementFromPoints,
  ensureMeasurementStore,
  findMeasurement,
  normalizeMeasurementItem,
  normalizeMeasurementPoints,
  refreshMeasurementsMetadata,
  restoreMeasurementStore
} from "./measurement-objects.js";
import {normalizeMeasurementRouteFit} from "./measurement-route-fit.js";

const MEASUREMENT_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: false,
  derived: Object.freeze(["object-panels"])
});

export function createSaveMeasurementCommand(points, {name = "", routeFit = "none", label = "保存测量对象"} = {}) {
  let previous = null;
  let created = null;

  return {
    label,
    effects: {...MEASUREMENT_EFFECTS},
    apply(context) {
      previous ??= cloneMeasurementStore(ensureMeasurementStore(context.map));
      created ??= createMeasurementFromPoints(context.map, points, {name, routeFit});
      const store = ensureMeasurementStore(context.map);
      store.items.push(JSON.parse(JSON.stringify(created)));
      refreshMeasurementsMetadata(store);
      this.effects.affected = [{kind: "measurement", id: created.id}];
    },
    revert(context) {
      restoreMeasurementStore(context.map, previous);
    },
    isNoop(context) {
      return !context.map || !Array.isArray(points) || points.length < 2;
    },
    getMeasurement() {
      return created ? JSON.parse(JSON.stringify(created)) : null;
    }
  };
}

export function createRenameMeasurementCommand(measurementId, name, {label = "重命名测量对象"} = {}) {
  const normalizedName = normalizeMeasurementName(name);
  let previousName = null;

  return {
    label,
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: [{kind: "measurement", id: measurementId}]
    },
    apply(context) {
      const item = readMeasurement(context.map, measurementId);
      previousName ??= item.name || "";
      item.name = normalizedName || previousName || "未命名测量";
      item.updatedAt = new Date().toISOString();
      refreshMeasurementsMetadata(ensureMeasurementStore(context.map));
    },
    revert(context) {
      const item = readMeasurement(context.map, measurementId);
      item.name = previousName || "未命名测量";
      item.updatedAt = new Date().toISOString();
      refreshMeasurementsMetadata(ensureMeasurementStore(context.map));
    },
    isNoop(context) {
      const item = findMeasurement(context.map, measurementId);
      return !item || !normalizedName || item.name === normalizedName;
    }
  };
}

export function createUpdateMeasurementPointsCommand(measurementId, points, {routeFit = null, label = "更新测量对象"} = {}) {
  let previous = null;

  return {
    label,
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: [{kind: "measurement", id: measurementId}]
    },
    apply(context) {
      previous ??= cloneMeasurementStore(ensureMeasurementStore(context.map));
      const item = readMeasurement(context.map, measurementId);
      const normalizedPoints = normalizeMeasurementPoints(points, context.map);
      const type = normalizedPoints.length >= 3 ? "polygon" : "polyline";
      Object.assign(item, normalizeMeasurementItem({
        ...item,
        type,
        closed: type === "polygon",
        routeFit: routeFit === null ? item.routeFit : normalizeMeasurementRouteFit(routeFit),
        points: normalizedPoints,
        updatedAt: new Date().toISOString()
      }, context.map));
      refreshMeasurementsMetadata(ensureMeasurementStore(context.map));
    },
    revert(context) {
      restoreMeasurementStore(context.map, previous);
    },
    isNoop(context) {
      const item = findMeasurement(context.map, measurementId);
      if (!item) return true;
      const normalizedPoints = normalizeMeasurementPoints(points, context.map);
      return normalizedPoints.length < 2 || sameMeasurementPoints(item.points, normalizedPoints);
    }
  };
}

export function createDeleteMeasurementCommand(measurementId, {label = "删除测量对象"} = {}) {
  let previous = null;

  return {
    label,
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: [{kind: "measurement", id: measurementId}]
    },
    apply(context) {
      previous ??= cloneMeasurementStore(ensureMeasurementStore(context.map));
      const store = ensureMeasurementStore(context.map);
      store.items = store.items.filter(item => item?.id !== measurementId);
      refreshMeasurementsMetadata(store);
    },
    revert(context) {
      restoreMeasurementStore(context.map, previous);
    },
    isNoop(context) {
      return !findMeasurement(context.map, measurementId);
    }
  };
}

function readMeasurement(map, measurementId) {
  const item = findMeasurement(map, measurementId);
  if (!item) throw new Error(`找不到测量对象 ${measurementId}`);
  return item;
}

function normalizeMeasurementName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function sameMeasurementPoints(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((point, index) => point.x === b[index]?.x && point.y === b[index]?.y);
}
