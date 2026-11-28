import {
  createMeasurementFromPoints,
  editableMeasurementStore,
  findMeasurement,
  normalizeMeasurementItem,
  normalizeMeasurementPoints
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
  const append = appendMeasurements(map => [createMeasurementFromPoints(map, points, {name, routeFit, drawMode, closed, smooth, sampling})]);
  return {
    ...append,
    label,
    domain: "measurement",
    effects: {...MEASUREMENT_EFFECTS, affected: newObjectAffected("measurement")},
    apply(context) {
      const [item] = append.apply(context);
      this.effects.affected = objectAffected("measurement", item.id);
    },
    isNoop(context) {
      return !context.map || !Array.isArray(points) || points.length < 2;
    },
    getResult() {
      return append.getItems()[0] || null;
    },
    getMeasurement() {
      return this.getResult();
    }
  };
}

export function createRenameMeasurementCommand(measurementId, name, {label = "重命名测量对象"} = {}) {
  const normalizedName = normalizeMeasurementName(name);
  let previous;
  let updatedAt;

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: objectAffected("measurement", measurementId)
    },
    apply(context) {
      const item = readMeasurement(context.map, measurementId);
      previous ??= {name: item.name, updatedAt: item.updatedAt};
      item.name = normalizedName;
      item.updatedAt = updatedAt ??= new Date().toISOString();
    },
    revert(context) {
      Object.assign(readMeasurement(context.map, measurementId), previous);
    },
    getReplicaFields(map) {
      const i = measurementIndex(map, measurementId);
      return ["name", "updatedAt"].map(key => `measurements.items.${i}.${key}`);
    },
    isNoop(context) {
      const item = findMeasurement(context.map, measurementId);
      return !item || !normalizedName || item.name === normalizedName;
    }
  };
}

export function createUpdateMeasurementPointsCommand(measurementId, points, {routeFit = null, drawMode = null, closed = null, smooth = null, sampling = null, label = "更新测量对象"} = {}) {
  let previous = null;
  let updatedAt;

  return {
    label,
    domain: "measurement",
    effects: {
      ...MEASUREMENT_EFFECTS,
      affected: objectAffected("measurement", measurementId)
    },
    apply(context) {
      const item = readMeasurement(context.map, measurementId);
      previous ??= structuredClone(item);
      const nextRouteFit = routeFit === null ? item.routeFit : normalizeMeasurementRouteFit(routeFit);
      Object.assign(item, normalizeMeasurementItem({
        ...item,
        drawMode: drawMode === null ? item.drawMode : drawMode,
        closed: closed === null ? item.closed : Boolean(closed),
        smooth: smooth === null ? item.smooth : Boolean(smooth),
        sampling: sampling === null ? item.sampling : sampling,
        routeFit: nextRouteFit,
        points,
        updatedAt: updatedAt ??= new Date().toISOString()
      }, context.map));
    },
    revert(context) {
      Object.assign(readMeasurement(context.map, measurementId), structuredClone(previous));
    },
    getReplicaRows(map) {
      return {"measurements.items": [measurementIndex(map, measurementId)]};
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
  let index, removed, splice;
  return {
    label,
    domain: "measurement",
    effects: {...MEASUREMENT_EFFECTS, affected: objectAffected("measurement", measurementId)},
    apply({map}) {
      const store = editableMeasurementStore(map);
      index = measurementIndex(map, measurementId);
      [removed] = store.items.splice(index, 1);
      store.metadata.measurements = store.items.length;
      splice = {path: "measurements.items", start: index, removed: 1, added: 0};
    },
    revert({map}) {
      const store = editableMeasurementStore(map);
      store.items.splice(index, 0, removed);
      store.metadata.measurements = store.items.length;
      splice = {path: "measurements.items", start: index, removed: 0, added: 1};
    },
    getReplicaSplices: () => [splice],
    getReplicaFields: () => ["measurements.metadata.measurements"],
    isNoop: ({map}) => !findMeasurement(map, measurementId)
  };
}

export function createImportMeasurementsCommand(measurements, {label = "导入测量对象"} = {}) {
  const append = appendMeasurements((map, firstId) => {
    const items = [];
    for (const source of measurements || []) {
      const now = new Date().toISOString();
      const item = normalizeMeasurementItem({
        ...source, id: `measurement-${firstId + items.length}`,
        createdAt: source.createdAt || now, updatedAt: source.updatedAt || source.createdAt || now
      }, map);
      if (item.points.length) items.push(item);
    }
    return items;
  });
  return {
    ...append,
    label,
    domain: "measurement",
    effects: {...MEASUREMENT_EFFECTS, affected: systemAffected("measurements-import", newObjectAffected("measurement"))},
    apply(context) {
      const items = append.apply(context);
      this.effects.affected = systemAffected("measurements-import", items.flatMap(item => objectAffected("measurement", item.id)));
    },
    isNoop(context) {
      return !context.map || !Array.isArray(measurements) || !measurements.some(item => Array.isArray(item?.points) && item.points.length);
    },
    getResult: append.getItems,
    getImported: append.getItems
  };
}

function appendMeasurements(createItems) {
  let start, firstId, items, splice;
  return {
    apply({map}) {
      const store = editableMeasurementStore(map);
      start = store.items.length;
      firstId = store.metadata.nextId;
      items ??= createItems(map, firstId);
      for (const item of items) store.items.push(structuredClone(item));
      store.metadata.measurements = store.items.length;
      store.metadata.nextId = firstId + items.length;
      splice = {path: "measurements.items", start, removed: 0, added: items.length};
      return items;
    },
    revert({map}) {
      const store = editableMeasurementStore(map);
      store.items.splice(start, items.length);
      store.metadata.measurements = store.items.length;
      store.metadata.nextId = firstId;
      splice = {path: "measurements.items", start, removed: items.length, added: 0};
    },
    getReplicaSplices: () => [splice],
    getReplicaFields: () => ["measurements.metadata.measurements", "measurements.metadata.nextId"],
    getItems: () => structuredClone(items || [])
  };
}

function measurementIndex(map, id) {
  const index = editableMeasurementStore(map).items.findIndex(item => item?.id === id);
  if (index < 0) throw new Error(`找不到测量对象 ${id}`);
  return index;
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
