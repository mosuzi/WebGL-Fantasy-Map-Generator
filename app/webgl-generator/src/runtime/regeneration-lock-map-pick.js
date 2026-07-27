import {sampleOceanCurrent} from "../generator/ocean-currents.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {normalizeRegenerationLockReference} from "./regeneration-locks.js";

export function diplomacyRelationReferenceAtPoliticalPick(map, pick, subjectId) {
  const subject = Number(subjectId);
  if (!Number.isInteger(subject) || subject <= 0) return null;
  const directState = pick?.politicalObject?.kind === OBJECT_KIND.STATE ? Number(pick.politicalObject.id) : null;
  const packCell = Number(pick?.packCell);
  const cellState = Number.isInteger(packCell) && packCell >= 0 ? Number(map?.pack?.cells?.state?.[packCell]) : null;
  const objectId = Number.isInteger(directState) && directState > 0 ? directState : cellState;
  if (!Number.isInteger(objectId) || objectId <= 0 || objectId === subject) return null;
  return normalizeRegenerationLockReference({
    kind: OBJECT_KIND.DIPLOMACY_RELATION,
    subjectId: subject,
    objectId
  });
}

export function nearestOceanCurrentAtPoint(map, worldX, worldY) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;
  const threshold = Math.hypot(Number(map?.metadata?.graphWidth) || 1, Number(map?.metadata?.graphHeight) || 1) / 80;
  let nearest = null;
  let nearestDistance = threshold;
  for (const current of map?.oceanCurrents?.currents || []) {
    const sampled = sampleOceanCurrent(current, 16);
    const points = sampled.length
      ? sampled
      : Array.isArray(current.points) ? current.points : Array.isArray(current.path) ? current.path : [];
    for (let index = 1; index < points.length; index++) {
      const distance = pointSegmentDistance(worldX, worldY, points[index - 1], points[index]);
      if (distance >= nearestDistance) continue;
      nearest = current;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function pointSegmentDistance(x, y, from, to) {
  const x1 = Number(from?.[0]);
  const y1 = Number(from?.[1]);
  const x2 = Number(to?.[0]);
  const y2 = Number(to?.[1]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return Infinity;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(x - x1, y - y1);
  const ratio = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return Math.hypot(x - (x1 + ratio * dx), y - (y1 + ratio * dy));
}
