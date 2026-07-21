import {clamp, isWorldPoint} from "./geometry.js";
import {pushWorldVertex} from "./mesh-writer.js";

export const MILITARY_FRONT_BATTLE_POINT_LENGTH_FACTOR = 2.4;
export const MILITARY_FRONT_BATTLE_POINT_RADIUS_FACTOR = 0.2;
export const MILITARY_FRONT_BATTLE_POINT_CROSS_HALF_LENGTH_FACTOR = 1.12;

const BATTLE_POINT_COLORS = Object.freeze({
  circle: [0.08, 0.1, 0.12, 0.92],
  attack: [0.95, 0.24, 0.12, 0.98],
  defense: [0.2, 0.58, 1, 0.98]
});

export function pushMilitaryFrontLayer(vertices, context, map) {
  const span = Math.max(map.metadata.graphWidth, map.metadata.graphHeight);
  const widthWorld = clamp(span / 96, 12, 18);
  const plan = buildMilitaryFrontRenderPlan(map?.military?.fronts || [], widthWorld);
  for (const item of plan.arrows) pushMilitaryFrontArrow(vertices, context, item.front, item.points, widthWorld);
  for (const item of plan.battlePoints) pushMilitaryBattlePoint(vertices, context, item.center, widthWorld);
  return {
    arrowCount: plan.arrows.length,
    battlePointCount: plan.battlePoints.length,
    collapsedFrontCount: plan.collapsedFrontCount,
    widthWorld
  };
}

export function buildMilitaryFrontRenderPlan(fronts, widthWorld) {
  const safeWidth = Math.max(0.1, Number(widthWorld) || 0.1);
  const arrows = [];
  const battlePointGroups = new Map();
  let collapsedFrontCount = 0;

  for (const front of fronts || []) {
    const points = militaryFrontBoundaryPoints(front);
    if (points.length < 2) continue;
    const length = militaryFrontPathLength(points);
    if (length > safeWidth * MILITARY_FRONT_BATTLE_POINT_LENGTH_FACTOR) {
      arrows.push({front, points, length});
      continue;
    }

    collapsedFrontCount++;
    const center = militaryFrontPathMidpoint(points);
    const baseKey = militaryFrontBattlePointBaseKey(front);
    const groups = battlePointGroups.get(baseKey) || [];
    let group = groups.find(item => item.centers.some(point => worldPointDistance(point, center) <= safeWidth * 2));
    if (!group) {
      group = {key: `${baseKey}:${groups.length}`, fronts: [], centers: [], stances: new Set()};
      groups.push(group);
    }
    group.fronts.push(front);
    group.centers.push(center);
    if (front?.stance) group.stances.add(front.stance);
    battlePointGroups.set(baseKey, groups);
  }

  const battlePoints = Array.from(battlePointGroups.values()).flat().map(group => ({
    key: group.key,
    center: averageWorldPoints(group.centers),
    frontCount: group.fronts.length,
    frontIds: group.fronts.map(front => front?.id).filter(id => id !== undefined && id !== null),
    stances: Array.from(group.stances).sort()
  }));

  return {arrows, battlePoints, collapsedFrontCount};
}

export function militaryFrontBoundaryPoints(front) {
  if (!Array.isArray(front?.borderCellPairs) || !front.borderCellPairs.length) return [];
  const points = (front?.points || []).filter(isWorldPoint);
  if (points.length < 2) return [];
  const maxLength = Number(front.maxLength || 0);
  if (!Number.isFinite(maxLength) || maxLength <= 0) return points;
  return clipMilitaryFrontBoundaryPoints(points, maxLength);
}

export function militaryFrontPathLength(points = []) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    total += Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
  }
  return total;
}

export function militaryFrontPathMidpoint(points = []) {
  const totalLength = militaryFrontPathLength(points);
  if (points.length < 2 || totalLength <= 0.000001) return points[0] || [0, 0];
  const target = totalLength / 2;
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= 0.000001) continue;
    if (traversed + length >= target) return interpolateWorldPoint(start, end, (target - traversed) / length);
    traversed += length;
  }
  return points[points.length - 1];
}

function militaryFrontBattlePointBaseKey(front) {
  const id = String(front?.id ?? "");
  const normalizedId = id.replace(/:(?:attack|defense):/, ":battle:");
  if (normalizedId && normalizedId !== id) return `id:${normalizedId}`;

  const attacker = Number(front?.attacker);
  const defender = Number(front?.defender);
  const pair = Number.isFinite(attacker) && Number.isFinite(defender)
    ? [attacker, defender].sort((a, b) => a - b).join(":")
    : "unknown";
  return `legacy:${pair}:${String(front?.campaign || front?.cause || "front")}`;
}

function worldPointDistance(a, b) {
  return Math.hypot((a?.[0] || 0) - (b?.[0] || 0), (a?.[1] || 0) - (b?.[1] || 0));
}

function averageWorldPoints(points) {
  if (!points.length) return [0, 0];
  const sum = points.reduce((value, point) => [value[0] + point[0], value[1] + point[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function pushMilitaryFrontArrow(vertices, context, front, source, widthWorld) {
  const direction = militaryFrontRawDirection(source, front);
  const palette = militaryFrontArrowPalette(front?.stance);
  pushMilitaryFrontBoundaryBand(vertices, context, source, direction, widthWorld * 1.22, palette.halo);
  pushMilitaryFrontBoundaryHead(vertices, context, source, direction, widthWorld * 1.22, palette.halo);
  pushMilitaryFrontBoundaryBand(vertices, context, source, direction, widthWorld, palette);
  pushMilitaryFrontBoundaryHead(vertices, context, source, direction, widthWorld, palette);
}

function pushMilitaryBattlePoint(vertices, context, center, widthWorld) {
  const radius = widthWorld * MILITARY_FRONT_BATTLE_POINT_RADIUS_FACTOR;
  pushWorldRing(vertices, context, center, radius, radius * 0.76, BATTLE_POINT_COLORS.circle, 18);
  pushBattleCrossArm(vertices, context, center, radius, -Math.PI / 4, BATTLE_POINT_COLORS.attack);
  pushBattleCrossArm(vertices, context, center, radius, Math.PI / 4, BATTLE_POINT_COLORS.defense);
}

function pushBattleCrossArm(vertices, context, center, radius, angle, color) {
  const direction = [Math.cos(angle), Math.sin(angle)];
  const normal = [-direction[1], direction[0]];
  const halfLength = radius * MILITARY_FRONT_BATTLE_POINT_CROSS_HALF_LENGTH_FACTOR;
  const start = [center[0] - direction[0] * halfLength, center[1] - direction[1] * halfLength];
  const end = [center[0] + direction[0] * halfLength, center[1] + direction[1] * halfLength];
  const halfWidth = radius * 0.14;
  const a = [start[0] + normal[0] * halfWidth, start[1] + normal[1] * halfWidth];
  const b = [end[0] + normal[0] * halfWidth, end[1] + normal[1] * halfWidth];
  const c = [end[0] - normal[0] * halfWidth, end[1] - normal[1] * halfWidth];
  const d = [start[0] - normal[0] * halfWidth, start[1] - normal[1] * halfWidth];
  pushWorldQuad(vertices, context, a, b, c, d, color);
}

function pushWorldRing(vertices, context, center, outerRadius, innerRadius, color, segments) {
  const count = Math.max(6, Math.round(segments));
  for (let index = 0; index < count; index++) {
    const startAngle = (index / count) * Math.PI * 2;
    const endAngle = ((index + 1) / count) * Math.PI * 2;
    const outerStart = [center[0] + Math.cos(startAngle) * outerRadius, center[1] + Math.sin(startAngle) * outerRadius];
    const outerEnd = [center[0] + Math.cos(endAngle) * outerRadius, center[1] + Math.sin(endAngle) * outerRadius];
    const innerStart = [center[0] + Math.cos(startAngle) * innerRadius, center[1] + Math.sin(startAngle) * innerRadius];
    const innerEnd = [center[0] + Math.cos(endAngle) * innerRadius, center[1] + Math.sin(endAngle) * innerRadius];
    pushWorldQuad(vertices, context, outerStart, outerEnd, innerEnd, innerStart, color);
  }
}

function pushWorldQuad(vertices, context, a, b, c, d, color) {
  pushWorldTriangle(vertices, context, a, b, c, color);
  pushWorldTriangle(vertices, context, a, c, d, color);
}

function pushWorldTriangle(vertices, context, a, b, c, color) {
  pushWorldVertex(vertices, context, a, color);
  pushWorldVertex(vertices, context, b, color);
  pushWorldVertex(vertices, context, c, color);
}

function clipMilitaryFrontBoundaryPoints(points, maxLength) {
  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= 0.000001) continue;
    segments.push({start, end, length, from: totalLength});
    totalLength += length;
  }
  if (!segments.length || totalLength <= maxLength) return points;
  const begin = (totalLength - maxLength) / 2;
  const finish = begin + maxLength;
  const clipped = [];
  for (const segment of segments) {
    const segmentBegin = segment.from;
    const segmentFinish = segment.from + segment.length;
    if (segmentFinish < begin || segmentBegin > finish) continue;
    const a = clamp((Math.max(begin, segmentBegin) - segmentBegin) / segment.length, 0, 1);
    const b = clamp((Math.min(finish, segmentFinish) - segmentBegin) / segment.length, 0, 1);
    const start = interpolateWorldPoint(segment.start, segment.end, a);
    const end = interpolateWorldPoint(segment.start, segment.end, b);
    if (!clipped.length || !pointsNearWorld(clipped[clipped.length - 1], start)) clipped.push(start);
    if (!pointsNearWorld(clipped[clipped.length - 1], end)) clipped.push(end);
  }
  return clipped.length >= 2 ? clipped : points.slice(0, 2);
}

function interpolateWorldPoint(start, end, ratio) {
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio
  ];
}

function pointsNearWorld(a, b) {
  return Math.hypot((a?.[0] || 0) - (b?.[0] || 0), (a?.[1] || 0) - (b?.[1] || 0)) <= 0.0001;
}

function pushMilitaryFrontBoundaryBand(vertices, context, points, direction, widthWorld, palette) {
  const halfWidth = Math.max(1, widthWorld / 2);
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length <= 0.000001) continue;
    const normal = militaryFrontSegmentNormal(dx, dy, direction);
    const tailStart = [start[0] - normal.x * halfWidth, start[1] - normal.y * halfWidth];
    const headStart = [start[0] + normal.x * halfWidth, start[1] + normal.y * halfWidth];
    const tailEnd = [end[0] - normal.x * halfWidth, end[1] - normal.y * halfWidth];
    const headEnd = [end[0] + normal.x * halfWidth, end[1] + normal.y * halfWidth];
    pushWorldTriangleWithColors(vertices, context, tailStart, headStart, headEnd, palette.tail, palette.head, palette.head);
    pushWorldTriangleWithColors(vertices, context, tailStart, headEnd, tailEnd, palette.tail, palette.head, palette.tail);
  }
}

function militaryFrontSegmentNormal(dx, dy, direction) {
  const length = Math.hypot(dx, dy);
  let normal = {x: -dy / length, y: dx / length};
  if (normal.x * direction.x + normal.y * direction.y < 0) normal = {x: -normal.x, y: -normal.y};
  return normal;
}

function pushMilitaryFrontBoundaryHead(vertices, context, points, direction, widthWorld, palette) {
  const anchor = militaryFrontHeadAnchor(points, direction);
  if (!anchor) return;
  const halfWidth = Math.max(1, widthWorld / 2);
  const baseHalf = Math.min(anchor.totalLength * 0.42, widthWorld * 0.62);
  if (baseHalf <= 0.000001) return;
  const baseCenter = [anchor.center[0] - anchor.normal.x * halfWidth * 0.18, anchor.center[1] - anchor.normal.y * halfWidth * 0.18];
  const tip = [anchor.center[0] + anchor.normal.x * halfWidth * 0.88, anchor.center[1] + anchor.normal.y * halfWidth * 0.88];
  const left = [baseCenter[0] - anchor.tangent.x * baseHalf, baseCenter[1] - anchor.tangent.y * baseHalf];
  const right = [baseCenter[0] + anchor.tangent.x * baseHalf, baseCenter[1] + anchor.tangent.y * baseHalf];
  pushWorldTriangleWithColors(vertices, context, left, tip, right, palette.body, palette.head, palette.body);
}

function militaryFrontHeadAnchor(points, direction) {
  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length <= 0.000001) continue;
    segments.push({start, end, dx, dy, length, from: totalLength});
    totalLength += length;
  }
  if (!segments.length) return null;
  const target = totalLength / 2;
  const segment = segments.find(item => target >= item.from && target <= item.from + item.length) || segments[Math.floor(segments.length / 2)];
  const local = clamp((target - segment.from) / segment.length, 0.12, 0.88);
  const tangent = {x: segment.dx / segment.length, y: segment.dy / segment.length};
  return {
    center: [segment.start[0] + segment.dx * local, segment.start[1] + segment.dy * local],
    tangent,
    normal: militaryFrontSegmentNormal(segment.dx, segment.dy, direction),
    totalLength
  };
}

function militaryFrontRawDirection(points, front) {
  if (Number.isFinite(front?.direction?.x) && Number.isFinite(front?.direction?.y)) {
    const length = Math.hypot(front.direction.x, front.direction.y);
    if (length > 0.000001) return {x: front.direction.x / length, y: front.direction.y / length};
  }
  const mid = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]).map(value => value / points.length);
  const target = front?.to || front;
  if (!isFinitePointObject(target)) return {x: 0, y: -1};
  const raw = {x: target.x - mid[0], y: target.y - mid[1]};
  const length = Math.hypot(raw.x, raw.y);
  return length > 0.000001 ? {x: raw.x / length, y: raw.y / length} : {x: 0, y: -1};
}

function isFinitePointObject(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function pushWorldTriangleWithColors(vertices, context, a, b, c, colorA, colorB, colorC) {
  pushWorldVertex(vertices, context, a, colorA);
  pushWorldVertex(vertices, context, b, colorB);
  pushWorldVertex(vertices, context, c, colorC);
}

function militaryFrontArrowPalette(stance) {
  if (stance === "defense") {
    return {
      tail: [0.06, 0.2, 0.7, 0.34],
      body: [0.2, 0.58, 1, 0.9],
      head: [0.82, 0.96, 1, 1],
      halo: {
        tail: [0.02, 0.06, 0.18, 0.16],
        body: [0.02, 0.09, 0.28, 0.24],
        head: [0.09, 0.23, 0.48, 0.3]
      }
    };
  }
  return {
    tail: [0.66, 0.08, 0.04, 0.34],
    body: [1, 0.23, 0.07, 0.92],
    head: [1, 0.78, 0.24, 1],
    halo: {
      tail: [0.22, 0.02, 0.02, 0.14],
      body: [0.34, 0.05, 0.02, 0.24],
      head: [0.58, 0.16, 0.03, 0.32]
    }
  };
}
