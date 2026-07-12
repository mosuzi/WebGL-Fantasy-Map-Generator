#!/usr/bin/env node
import {measurementHighlightObject, measurementHighlightState, measurementShapeClass} from "../app/webgl-generator/src/runtime/measurement-highlights.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";

const measurement = {
  id: "measurement-7",
  name: "港湾测线",
  type: "polyline",
  points: [{x: 10, y: 20}, {x: 40, y: 55}],
  summary: {displayPointCount: 2, distanceMapUnits: 46.1, areaMapUnits: 0}
};
const map = {measurements: {items: [measurement]}};
const resolved = resolveObject(map, {kind: OBJECT_KIND.MEASUREMENT, id: measurement.id});

assert(resolved !== measurement, "测量 resolver 应返回独立对象摘要");
assert(resolved.kind === OBJECT_KIND.MEASUREMENT && resolved.id === measurement.id, "测量 resolver 没有保留稳定 kind / id");
assert(resolved.name === measurement.name && resolved.pointCount === 2 && resolved.displayPointCount === 2, "测量 resolver 摘要不完整");

const highlight = measurementHighlightObject(measurement);
assert(highlight?.kind === OBJECT_KIND.MEASUREMENT && highlight.id === measurement.id, "测量高亮对象映射错误");

const objectHighlights = [highlight];
const persistentState = measurementHighlightState(objectHighlights, null, measurement.id, 100);
assert(persistentState.highlighted && !persistentState.flashing, "测量持久高亮状态错误");
assert(measurementShapeClass("measurement-object-path", objectHighlights, null, measurement.id, 100) === "measurement-object-path highlighted", "测量持久高亮 class 错误");

const locateFlash = {kind: OBJECT_KIND.MEASUREMENT, id: measurement.id, until: 150};
const flashState = measurementHighlightState([], locateFlash, measurement.id, 100);
assert(!flashState.highlighted && flashState.flashing, "测量临时高亮状态错误");
assert(measurementShapeClass("measurement-object-point", [], locateFlash, measurement.id, 100) === "measurement-object-point locate-flash", "测量临时高亮 class 错误");
assert(!measurementHighlightState([], locateFlash, measurement.id, 151).flashing, "过期测量临时高亮没有清理");

console.log(JSON.stringify({
  ok: true,
  kind: resolved.kind,
  id: resolved.id,
  persistentClass: measurementShapeClass("measurement-object-path", objectHighlights, null, measurement.id, 100),
  flashClass: measurementShapeClass("measurement-object-point", [], locateFlash, measurement.id, 100)
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
