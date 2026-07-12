export function getHeightBrushChanges(map, point, brush, stroke) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const originals = stroke?.originals;
  if (!cells?.p || !cells?.h || !Array.isArray(points) || !(originals instanceof Map)) return [];

  const radius = Math.max(1, Number(brush?.radius) || 1);
  const radiusSq = radius * radius;
  const affected = [];
  let nearest = null;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    const distance = Math.sqrt(distanceSq);
    const factor = brush.falloff && brush.action !== "smooth" ? brushFalloff(distance, radius) : 1;
    const item = {gridCell, factor, distanceSq};
    affected.push(item);
    if (!nearest || distanceSq < nearest.distanceSq) nearest = item;
  }

  if (!affected.length) return [];
  if (brush.action === "smooth") {
    const average = affected.reduce((sum, item) => sum + cells.h[item.gridCell], 0) / affected.length;
    return affected.map(({gridCell}) => heightChange(cells, originals, gridCell, cells.h[gridCell] * 0.62 + average * 0.38)).filter(Boolean);
  }
  if (brush.action === "flatten") {
    if (!Number.isFinite(stroke.targetHeight)) stroke.targetHeight = cells.h[nearest.gridCell];
    const targetHeight = clampHeight(stroke.targetHeight);
    const strength = Math.max(1, Number(brush.strength) || 1);
    return affected.map(({gridCell, factor}) => {
      const current = cells.h[gridCell];
      const difference = targetHeight - current;
      const step = Math.sign(difference) * Math.min(Math.abs(difference), strength * factor);
      return heightChange(cells, originals, gridCell, current + step);
    }).filter(Boolean);
  }

  const strength = Math.max(1, Number(brush.strength) || 1);
  const delta = brush.action === "lower" ? -strength : strength;
  return affected.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + delta * factor)).filter(Boolean);
}

function heightChange(cells, originals, gridCell, nextValue) {
  const after = clampHeight(nextValue);
  if (after === cells.h[gridCell]) return null;
  if (!originals.has(gridCell)) originals.set(gridCell, cells.h[gridCell]);
  return {
    gridCell,
    before: originals.get(gridCell),
    after
  };
}

function brushFalloff(distance, radius) {
  const t = Math.max(0, Math.min(1, 1 - distance / Math.max(1, radius)));
  return t * t * (3 - 2 * t);
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
