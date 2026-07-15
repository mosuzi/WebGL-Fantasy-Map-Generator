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
import {newObjectAffected, objectAffected, systemAffected} from "./edit-command-effects.js";

const MEASUREMENT_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: false,
  derived: Object.freeze(["object-panels"])
});

export function createSaveMeasurementCommand(points, {name = "", routeFit = "none", drawMode, closed, smooth, sampling, label = "保存测量对象"} = {}) {
  let previous = null;
  let created = null;

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: newObjectAffected("measurement")
    },
    apply(context) {
      previous ??= cloneMeasurementStore(ensureMeasurementStore(context.map));
      created ??= createMeasurementFromPoints(context.map, points, {name, routeFit, drawMode, closed, smooth, sampling});
      const store = ensureMeasurementStore(context.map);
      store.items.push(JSON.parse(JSON.stringify(created)));
      refreshMeasurementsMetadata(store);
      this.effects.affected = objectAffected("measurement", created.id);
    },
    revert(context) {
      restoreMeasurementStore(context.map, previous);
    },
    isNoop(context) {
      return !context.map || !Array.isArray(points) || points.length < 2;
    },
    getResult() {
      return created ? JSON.parse(JSON.stringify(created)) : null;
    },
    getMeasurement() {
      return this.getResult();
    }
  };
}

export function createRenameMeasurementCommand(measurementId, name, {label = "重命名测量对象"} = {}) {
  const normalizedName = normalizeMeasurementName(name);
  let previousName = null;

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: objectAffected("measurement", measurementId)
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

export function createUpdateMeasurementPointsCommand(measurementId, points, {routeFit = null, drawMode = null, closed = null, smooth = null, sampling = null, label = "更新测量对象"} = {}) {
  let previous = null;

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: objectAffected("measurement", measurementId)
    },
    apply(context) {
      previous ??= cloneMeasurementStore(ensureMeasurementStore(context.map));
      const item = readMeasurement(context.map, measurementId);
      const nextRouteFit = routeFit === null ? item.routeFit : normalizeMeasurementRouteFit(routeFit);
      Object.assign(item, normalizeMeasurementItem({
        ...item,
        drawMode: drawMode === null ? item.drawMode : drawMode,
        closed: closed === null ? item.closed : Boolean(closed),
        smooth: smooth === null ? item.smooth : Boolean(smooth),
        sampling: sampling === null ? item.sampling : sampling,
        routeFit: nextRouteFit,
        points,
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
      const nextRouteFit = routeFit === null ? item.routeFit : normalizeMeasurementRouteFit(routeFit);
      const candidate = normalizeMeasurementItem({
        ...item,
        drawMode: drawMode === null ? item.drawMode : drawMode,
        closed: closed === null ? item.closed : Boolean(closed),
        smooth: smooth === null ? item.smooth : Boolean(smooth),
        sampling: sampling === null ? item.sampling : sampling,
        routeFit: nextRouteFit,
        points
      }, context.map);
      return normalizedPoints.length < 1
        || (
          sameMeasurementPoints(item.points, candidate.points) &&
          item.routeFit === candidate.routeFit &&
          item.drawMode === candidate.drawMode &&
          item.closed === candidate.closed &&
          item.smooth === candidate.smooth &&
          JSON.stringify(item.sampling || null) === JSON.stringify(candidate.sampling || null) &&
          sameMeasurementCellStops(item.cellStops, candidate.cellStops)
        );
    }
  };
}

export function createDeleteMeasurementCommand(measurementId, {label = "删除测量对象"} = {}) {
  let previous = null;

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: objectAffected("measurement", measurementId)
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

export function createImportMeasurementsCommand(measurements, {label = "导入测量对象"} = {}) {
  let previous = null;
  let imported = [];

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: systemAffected("measurements-import", newObjectAffected("measurement"))
    },
    apply(context) {
      previous ??= cloneMeasurementStore(ensureMeasurementStore(context.map));
      const store = ensureMeasurementStore(context.map);
      imported = [];
      for (const source of measurements || []) {
        const idNumber = nextAvailableImportedMeasurementId(store);
        const item = normalizeMeasurementItem({
          ...source,
          id: `measurement-${idNumber}`,
          createdAt: source.createdAt || new Date().toISOString(),
          updatedAt: source.updatedAt || source.createdAt || new Date().toISOString()
        }, context.map);
        if (!item.points.length) continue;
        store.items.push(JSON.parse(JSON.stringify(item)));
        imported.push(item);
        refreshMeasurementsMetadata(store);
      }
      refreshMeasurementsMetadata(store);
      this.effects.affected = systemAffected("measurements-import", imported.flatMap(item => objectAffected("measurement", item.id)));
    },
    revert(context) {
      restoreMeasurementStore(context.map, previous);
    },
    isNoop(context) {
      return !context.map || !Array.isArray(measurements) || !measurements.some(item => Array.isArray(item?.points) && item.points.length);
    },
    getResult() {
      return imported.map(item => JSON.parse(JSON.stringify(item)));
    },
    getImported() {
      return this.getResult();
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

function sameMeasurementCellStops(a = [], b = []) {
  if ((a || []).length !== (b || []).length) return false;
  return (a || []).every((stop, index) => JSON.stringify(stop || null) === JSON.stringify(b[index] || null));
}

function nextAvailableImportedMeasurementId(store) {
  refreshMeasurementsMetadata(store);
  return Math.max(1, Number(store.metadata?.nextId) || 1);
}
