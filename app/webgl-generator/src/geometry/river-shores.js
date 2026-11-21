function sharedShore(grid, land, water, target) {
  const ring = grid?.cells?.v?.[land], adjacent = grid?.cells?.v?.[water];
  const site = grid?.points?.[water];
  if (!site || !ring || !adjacent || !(grid.cells.h?.[land] >= 20 && grid.cells.h[water] < 20)) return null;
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (!adjacent.includes(a) || !adjacent.includes(b)) continue;
    const p = grid.vertices?.p?.[a], q = grid.vertices?.p?.[b];
    if (!p || !q || (p[0] === q[0] && p[1] === q[1])) continue;
    const x = (p[0] + q[0]) / 2, y = (p[1] + q[1]) / 2;
    const distance = Math.hypot(x - target[0], y - target[1]);
    if (best && distance >= best.distance) continue;
    // End just inside the receiving water polygon. The land mask cuts the
    // channel precisely at the displayed shoreline.
    best = {distance, point: [x + (site[0] - x) * 0.12, y + (site[1] - y) * 0.12, ...target.slice(2)]};
  }
  return best;
}

export function lakeOutletBank(map, river) {
  const pack = map?.pack, source = river.cells?.[0];
  if (!river.points?.[0] || !pack?.cells?.g) return null;
  let best = null;
  for (const n of pack?.cells?.c?.[source] || []) {
    const lake = pack.features?.[pack.cells.f[n]];
    if (lake?.type !== "lake" || lake.outlet == null || Number(lake.outlet) !== Number(river.id ?? river.i)) continue;
    const shore = sharedShore(map.grid, pack.cells.g[source], pack.cells.g[n], river.points[0]);
    if (shore && (!best || shore.distance < best.distance)) best = shore;
  }
  return best?.point ?? null;
}

export function riverShorePoints(map, river, points = river.points, lakeBank = undefined) {
  if (!map || !points?.length || river.visualCurve || river.controlPoints?.length || river.hydrology?.method === "manual-downhill") return points;
  const source = lakeBank === undefined ? lakeOutletBank(map, river) : lakeBank;
  const cells = river.cells;
  let mouth;
  if (cells?.length >= 2 && ["ocean", "lake"].includes(river.outletKind)) {
    const gridIds = map.pack?.cells?.g;
    mouth = sharedShore(map.grid, gridIds?.[cells[cells.length - 2]], gridIds?.[cells[cells.length - 1]], points[points.length - 1]);
  }
  if (!source && !mouth) return points;
  const adjusted = points.slice();
  if (source) adjusted[0] = source;
  if (mouth) adjusted[adjusted.length - 1] = mouth.point;
  return adjusted;
}
