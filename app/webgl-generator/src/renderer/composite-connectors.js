import {diplomacyStatePoint, parseDiplomacyRelationIdentity} from "../runtime/diplomacy-relations.js";
import {OBJECT_KIND} from "../runtime/object-kinds.js";
import {isWorldPoint} from "./geometry.js";

export function compositeConnectorPoints(map, object) {
  if (isWorldPoint(object?.from) && isWorldPoint(object?.to)) return [object.from, object.to];
  if (object?.kind === OBJECT_KIND.TRADE_FLOW) return tradeFlowPoints(map, object.id);
  if (object?.kind === OBJECT_KIND.DIPLOMACY_RELATION) return diplomacyRelationPoints(map, object);
  return null;
}

export function pickCompositeConnector(map, objects, worldX, worldY, maxDistance) {
  const targets = uniqueConnectors(objects);
  let best = null;
  let candidateCount = 0;
  for (const target of targets) {
    const points = compositeConnectorPoints(map, target);
    if (!points) continue;
    candidateCount++;
    const distance = distanceToSegment(worldX, worldY, points[0], points[1]);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    best = {...target, from: points[0], to: points[1], distance, candidateCount};
  }
  if (best) best.candidateCount = candidateCount;
  return best;
}

export function compositeConnectorSelectionColor(object) {
  if (object?.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    return rgbaFromHex(object.relationColor, 0.96) || [1, 0.72, 0.22, 0.96];
  }
  if (object?.kind === OBJECT_KIND.TRADE_FLOW) return [0.32, 0.9, 0.72, 0.98];
  return null;
}

function diplomacyRelationPoints(map, object) {
  const identity = parseDiplomacyRelationIdentity(object);
  if (!identity) return null;
  const from = diplomacyStatePoint(map, identity.subjectId);
  const to = diplomacyStatePoint(map, identity.objectId);
  return from && to ? [from, to] : null;
}

function tradeFlowPoints(map, dealId) {
  const deal = (map?.pack?.deals || []).find(item => Number(item?.i) === Number(dealId));
  if (!deal) return null;
  const from = tradePartyPoint(map, deal.sellerType, deal.seller);
  const to = tradePartyPoint(map, deal.buyerType, deal.buyer);
  return from && to ? [from, to] : null;
}

function tradePartyPoint(map, type, id) {
  if (type === "burg") {
    const burg = map?.pack?.burgs?.[id] || map?.settlements?.cities?.find(city => city?.burgId === id || city?.id === id);
    return Number.isFinite(burg?.x) && Number.isFinite(burg?.y) ? [burg.x, burg.y] : null;
  }
  const market = map?.pack?.markets?.[id];
  const center = map?.pack?.burgs?.[market?.centerBurgId];
  const point = [Number.isFinite(market?.x) ? market.x : center?.x, Number.isFinite(market?.y) ? market.y : center?.y];
  return isWorldPoint(point) ? point : null;
}

function uniqueConnectors(objects) {
  const seen = new Set();
  return (Array.isArray(objects) ? objects : []).filter(object => {
    if (object?.kind !== OBJECT_KIND.TRADE_FLOW && object?.kind !== OBJECT_KIND.DIPLOMACY_RELATION) return false;
    const key = `${object.kind}:${object.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return Math.hypot(x - a[0], y - a[1]);
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

function rgbaFromHex(value, alpha) {
  const hex = String(value || "").trim().replace(/^#/, "");
  const normalized = hex.length === 3 ? hex.split("").map(part => `${part}${part}`).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    alpha
  ];
}
