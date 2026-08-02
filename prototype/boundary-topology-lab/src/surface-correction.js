import "../vendor/polygon-clipping.umd.min.mjs";
import "../vendor/earcut.min.mjs";

const EPSILON = 1e-9;

export function triangulateSimplePolygon(points) {
  const triangulate = globalThis.earcut?.default;
  if (typeof triangulate !== "function") throw new Error("surface-correction-runtime-unavailable");
  const vertices = points.flatMap(point => [point[0], point[1]]);
  return triangulate(vertices, null, 2);
}

export function buildExactSurfaceCorrectionTriangles(rawRings, processedRings) {
  const clipping = globalThis.polygonClipping;
  const triangulate = globalThis.earcut?.default;
  if (!clipping?.xor || typeof triangulate !== "function") throw new Error("surface-correction-runtime-unavailable");
  const difference = clipping.xor(rawRings, processedRings);
  const triangles = [];
  for (const polygon of difference || []) {
    const {vertices, holes} = flattenPolygon(polygon);
    const indices = triangulate(vertices, holes, 2);
    for (let index = 0; index < indices.length; index += 3) {
      const points = [indices[index], indices[index + 1], indices[index + 2]]
        .map(vertex => [vertices[vertex * 2], vertices[vertex * 2 + 1]]);
      const area = Math.abs(triangleArea(points));
      if (area <= EPSILON) continue;
      const center = [
        (points[0][0] + points[1][0] + points[2][0]) / 3,
        (points[0][1] + points[1][1] + points[2][1]) / 3
      ];
      const rawInside = pointInRegion(center, rawRings);
      const processedInside = pointInRegion(center, processedRings);
      if (rawInside === processedInside) continue;
      triangles.push({points, side: processedInside ? "land" : "water", area});
    }
  }
  return triangles;
}

function flattenPolygon(polygon) {
  const vertices = [];
  const holes = [];
  for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
    const ring = polygon[ringIndex];
    if (ringIndex) holes.push(vertices.length / 2);
    const limit = ring.length > 1 && samePoint(ring[0], ring.at(-1)) ? ring.length - 1 : ring.length;
    for (let index = 0; index < limit; index++) vertices.push(ring[index][0], ring[index][1]);
  }
  return {vertices, holes};
}

function pointInRegion(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some(ring => pointInRing(point, ring));
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function triangleArea(triangle) {
  return (
    triangle[0][0] * (triangle[1][1] - triangle[2][1])
    + triangle[1][0] * (triangle[2][1] - triangle[0][1])
    + triangle[2][0] * (triangle[0][1] - triangle[1][1])
  ) / 2;
}

function samePoint(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPSILON;
}
