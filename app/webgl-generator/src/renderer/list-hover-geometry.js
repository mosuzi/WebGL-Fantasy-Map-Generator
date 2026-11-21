import {sampleOceanCurrent} from "../generator/ocean-currents.js";
import {isSharedCubicCurve, sampleCentripetalCatmullRom} from "../geometry/cubic-path.js";
import {measurementDisplayPoints} from "../runtime/measurement-objects.js";
import {POLITICAL_OBJECT_FIELD} from "../runtime/object-kinds.js";
import {compositeConnectorPoints} from "./composite-connectors.js";
import {smoothWorldPath} from "./geometry.js";
import {riverShorePoints} from "../geometry/river-shores.js";
import {resolveStateCapitalPackCell} from "./state-label-territory.js";

// Trace each connected component independently so rings that touch at one vertex
// never join two islands. Shared cell edges cancel; holes remain separate paths.
export function territoryRings(mesh, memberCells, homeCell) {
  const remaining = new Set(memberCells);
  const components = [];
  const vertices = mesh.vertices.p;
  for (const seed of remaining) {
    remaining.delete(seed);
    const cells = [seed];
    const edges = new Map();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      for (const neighbor of mesh.cells.c[cell] || []) {
        if (remaining.delete(neighbor)) cells.push(neighbor);
      }
      const polygon = mesh.cells.v[cell];
      if (!polygon?.length) continue;
      let a = polygon[polygon.length - 1];
      for (const b of polygon) {
        const key = Math.min(a, b) * vertices.length + Math.max(a, b);
        if (a !== b && !edges.delete(key)) edges.set(key, [a, b]);
        a = b;
      }
    }
    const adjacent = new Map();
    for (const [a, b] of edges.values()) {
      if (!adjacent.has(a)) adjacent.set(a, new Set());
      if (!adjacent.has(b)) adjacent.set(b, new Set());
      adjacent.get(a).add(b);
      adjacent.get(b).add(a);
    }
    const rings = [];
    for (const start of adjacent.keys()) {
      let vertex = start;
      const points = [vertices[start]];
      do {
        const next = adjacent.get(vertex)?.values().next().value;
        if (next === undefined) break;
        for (const [from, to] of [[vertex, next], [next, vertex]]) {
          const neighbors = adjacent.get(from);
          neighbors.delete(to);
          if (!neighbors.size) adjacent.delete(from);
        }
        vertex = next;
        if (vertex !== start) points.push(vertices[vertex]);
      } while (vertex !== start);
      if (vertex === start && points.length >= 3) {
        let twiceArea = 0;
        let previous = points.at(-1);
        for (const p of points) {
          twiceArea += previous[0] * p[1] - p[0] * previous[1];
          previous = p;
        }
        rings.push({points, closed: true, area: Math.abs(twiceArea) / 2});
      }
    }
    rings.sort((a, b) => b.area - a.area);
    if (rings.length) components.push({rings, home: cells.includes(homeCell), area: rings[0].area - rings.slice(1).reduce((sum, r) => sum + r.area, 0)});
  }
  components.sort((a, b) => Number(b.home) - Number(a.home) || b.area - a.area);
  return components.flatMap(component => component.rings);
}

export function listHoverGeometry(map, object, pointForObject) {
  if (!object || !map) return [];
  const {kind, id} = object;
  const political = POLITICAL_OBJECT_FIELD[kind];
  const field = political || {lake: "f", feature: "f", "economy-market": "market"}[kind];
  if (field || kind === "zone") {
    if (political && Number(id) <= 0) return [];
    const mesh = political && map.grid?.cells?.[field] ? map.grid : map.pack;
    if (!mesh?.cells?.v || !mesh.vertices?.p) return [];
    let members;
    if (kind === "zone") {
      members = (map.zones?.zones || map.pack.zones || []).find(zone => Number(zone.i ?? zone.id) === Number(id))?.cells || [];
    } else {
      members = [];
      const values = mesh.cells[field];
      for (let i = 0; i < (values?.length || 0); i++) {
        if (values[i] !== Number(id)) continue;
        if ((political && mesh.cells.h[i] < 20) || (kind === "lake" && mesh.cells.h[i] >= 20)) continue;
        members.push(i);
      }
    }
    const capital = kind === "state" ? resolveStateCapitalPackCell(map, map.politics.states[id]) : null;
    const home = capital != null && mesh === map.grid ? map.pack.cells.g[capital] : capital;
    return territoryRings(mesh, members, home);
  }
  let points;
  let closed = false;
  if (kind === "trade-flow" || kind === "diplomacy-relation") points = compositeConnectorPoints(map, object);
  else if (kind === "river") {
    const river = map.rivers.rivers.find(item => item.id === id);
    if (river) points = isSharedCubicCurve(river.visualCurve) ? sampleCentripetalCatmullRom(river.points).points : smoothWorldPath(riverShorePoints(map, river), {iterations: 1, factor: 0.2});
  } else if (kind === "route") {
    const route = map.settlements.routes.find(item => item.id === id);
    if (route) points = smoothWorldPath(route.points, {iterations: 1, factor: 0.16});
  } else if (kind === "ocean-current") {
    const current = map.oceanCurrents?.currents?.find(item => String(item.id) === String(id));
    if (current) {
      const sampled = sampleOceanCurrent(current, 20);
      points = sampled.length ? sampled : Array.isArray(current.points) ? current.points : current.path;
    }
  } else if (kind === "measurement") {
    const item = map.measurements?.items?.find(item => String(item.id) === String(id));
    if (item) {
      points = measurementDisplayPoints(item, map).map(p => [p.x, p.y]);
      closed = Boolean(item.closed);
    }
  } else {
    const point = pointForObject(map, object);
    if (point) return [{center: [point.x, point.y], closed: true}];
  }
  return points?.length >= 2 ? [{points, closed}] : [];
}
