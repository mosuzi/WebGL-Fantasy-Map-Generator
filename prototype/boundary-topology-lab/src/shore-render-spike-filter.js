export const SHORE_RENDER_SPIKE_FILTER_DEFAULTS = Object.freeze({
  spikeAngleCos: 0.86,
  hardSpikeAngleCos: 0.94,
  spikeDisplacementWorld: 2.5
});

export function filterShoreRenderSpikes(entries, options = {}) {
  if (entries.length < 3) return entries;
  const settings = {...SHORE_RENDER_SPIKE_FILTER_DEFAULTS, ...options};
  const closed = entries.length > 3 && pointsNear(entries[0]?.point, entries.at(-1)?.point);
  let currentEntries = closed ? entries.slice(0, -1) : entries;
  for (let pass = 0; pass < 2; pass++) {
    const result = [];
    for (let index = 0; index < currentEntries.length; index++) {
      const previous = closed
        ? currentEntries[(index - 1 + currentEntries.length) % currentEntries.length]
        : currentEntries[index - 1];
      const current = currentEntries[index];
      const next = closed
        ? currentEntries[(index + 1) % currentEntries.length]
        : currentEntries[index + 1];
      if (previous && next && isShoreRenderSpike(previous, current, next, settings)) continue;
      result.push(current);
    }
    if (result.length === currentEntries.length) break;
    currentEntries = result;
  }
  if (!closed || currentEntries.length < 3) return currentEntries;
  return [...currentEntries, currentEntries[0]];
}

function isShoreRenderSpike(previous, current, next, settings) {
  const a = normalizeVector(previous.point[0] - current.point[0], previous.point[1] - current.point[1]);
  const b = normalizeVector(next.point[0] - current.point[0], next.point[1] - current.point[1]);
  const angleCos = a.x * b.x + a.y * b.y;
  const displacement = current.projected ? pointDistance(current.point, current.projected) : 0;
  return angleCos > settings.hardSpikeAngleCos ||
    (angleCos > settings.spikeAngleCos && displacement > settings.spikeDisplacementWorld);
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  return length > 1e-9 ? {x: x / length, y: y / length} : {x: 0, y: 0};
}

function pointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointsNear(a, b) {
  return Boolean(a && b && pointDistance(a, b) <= 0.001);
}
