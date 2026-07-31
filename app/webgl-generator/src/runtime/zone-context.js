const ZONE_REQUIRED_ROLES = Object.freeze({
  Warzone: Object.freeze(["attacker", "defender"]),
  Invasion: Object.freeze(["invader", "defender"]),
  Rebels: Object.freeze(["rebel", "ruler"]),
  Proselytism: Object.freeze(["source-religion", "target-religion"]),
  Crusade: Object.freeze(["initiator-religion", "target-religion"])
});

const ZONE_STATUS = new Set(["active", "planned", "resolved", "incomplete", "invalid"]);
const PARTICIPANT_ROLES = new Set([
  "attacker", "defender", "invader", "rebel", "ruler",
  "source-religion", "target-religion", "initiator-religion",
  "origin", "affected"
]);
const PARTICIPANT_KINDS = new Set(["state", "religion", "culture", "province", "city", "burg", "marker", "river", "feature", "faction", "region"]);

export function normalizeZoneMap(map) {
  if (!map || typeof map !== "object") return map;
  const source = map.zones?.zones || map.pack?.zones;
  if (!Array.isArray(source)) return map;
  const zones = source.map(zone => normalizeZoneRecord(map, zone));
  map.zones ||= {zones: [], metadata: {}};
  map.zones.zones = zones;
  if (map.pack) map.pack.zones = zones;
  return map;
}

export function normalizeZoneRecord(map, zone) {
  if (!zone || typeof zone !== "object") return zone;
  const typedZone = normalizeZoneTypeRecord(zone);
  const context = normalizeZoneContext(zone.context);
  backfillReliableLegacyParticipants(context.participants, zone);
  const required = ZONE_REQUIRED_ROLES[typedZone.type] || [];
  const complete = required.every(role => context.participants.some(participant => participant.role === role));
  return {
    ...typedZone,
    context: {
      status: complete ? context.status : "incomplete",
      participants: context.participants
    }
  };
}

export function normalizeZoneContext(value) {
  const participants = [];
  const seen = new Set();
  for (const participant of Array.isArray(value?.participants) ? value.participants : []) {
    const normalized = normalizeZoneParticipant(participant);
    if (!normalized) continue;
    const key = `${normalized.role}:${normalized.ref.kind}:${normalized.ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    participants.push(normalized);
  }
  const status = ZONE_STATUS.has(value?.status) ? value.status : "active";
  return {status, participants};
}

export function normalizeZoneContextPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("地区语义必须是对象");
  if (value.status !== undefined && !ZONE_STATUS.has(value.status)) throw new Error("地区状态必须是 active、planned、resolved 或 incomplete");
  if (value.participants !== undefined && !Array.isArray(value.participants)) throw new Error("地区参与方必须是数组");
  const context = normalizeZoneContext(value);
  if (value.participants?.length && context.participants.length !== value.participants.length) throw new Error("地区参与方包含无效或重复引用");
  return context;
}

export function resolveZoneContext(map, zone) {
  const normalized = normalizeZoneRecord(map, zone);
  const participants = normalized.context.participants.map(participant => {
    const resolved = resolveParticipantReference(map, participant.ref);
    return {...participant, name: resolved.name || participant.ref.nameSnapshot || fallbackParticipantName(participant.ref), available: resolved.available};
  });
  const missingRoles = (ZONE_REQUIRED_ROLES[normalized.type] || []).filter(role => !participants.some(participant => participant.role === role));
  const invalidParticipants = participants.filter(participant => participant.available === false);
  const status = invalidParticipants.length ? "invalid" : missingRoles.length ? "incomplete" : normalized.context.status;
  const summary = normalized.category === "event"
    ? zoneContextSummary(normalized.type, participants, status)
    : normalized.description || (normalized.category === "natural" ? "自然地区" : `${normalized.customTypeName || "自定义"}地区`);
  return {
    status,
    statusLabel: zoneStatusLabel(status),
    participants,
    missingRoles,
    invalidParticipants,
    complete: missingRoles.length === 0 && invalidParticipants.length === 0,
    summary
  };
}

export function zoneParticipant(role, kind, id, nameSnapshot = "") {
  return normalizeZoneParticipant({role, ref: {kind, id, nameSnapshot}});
}

export function zoneStatusLabel(status) {
  return ({active: "进行中", planned: "筹备中", resolved: "已结束", incomplete: "参与方待补充", invalid: "参与方引用已失效"})[status] || "参与方待补充";
}

export function zoneRoleLabel(role) {
  return ({
    attacker: "进攻方", defender: "防守方", invader: "入侵方", rebel: "叛乱方", ruler: "统治方",
    "source-religion": "传播宗教", "target-religion": "目标宗教", "initiator-religion": "发起宗教",
    origin: "来源", affected: "受影响对象"
  })[role] || role;
}

function normalizeZoneParticipant(value) {
  const role = String(value?.role || "").trim();
  const kind = String(value?.ref?.kind || "").trim();
  const rawId = value?.ref?.id;
  const id = typeof rawId === "number" ? rawId : String(rawId ?? "").trim();
  if (!PARTICIPANT_ROLES.has(role) || !PARTICIPANT_KINDS.has(kind) || id === "" || typeof id === "number" && !Number.isFinite(id)) return null;
  return {
    role,
    ref: {
      kind,
      id,
      ...(normalizeSnapshot(value.ref.nameSnapshot) ? {nameSnapshot: normalizeSnapshot(value.ref.nameSnapshot)} : {})
    }
  };
}

function backfillReliableLegacyParticipants(participants, zone) {
  if (zone.type !== "Warzone" && zone.type !== "Invasion") return;
  const attacker = positiveInteger(zone.attacker);
  const defender = positiveInteger(zone.defender);
  if (!attacker || !defender) return;
  const attackerRole = zone.type === "Invasion" ? "invader" : "attacker";
  appendParticipant(participants, zoneParticipant(attackerRole, "state", attacker));
  appendParticipant(participants, zoneParticipant("defender", "state", defender));
}

function appendParticipant(participants, participant) {
  if (!participant) return;
  if (!participants.some(item => item.role === participant.role && item.ref.kind === participant.ref.kind && String(item.ref.id) === String(participant.ref.id))) participants.push(participant);
}

function zoneContextSummary(type, participants, status) {
  const name = role => participants.find(participant => participant.role === role)?.name;
  const affected = participants.filter(participant => participant.role === "affected").map(participant => participant.name).slice(0, 3);
  if (status === "incomplete") return "参与方信息待补充";
  if (status === "invalid") return "参与方引用已失效，请重新指定";
  if (type === "Warzone") return `${name("attacker")}与${name("defender")}交战`;
  if (type === "Invasion") return `${name("invader")}正在入侵${name("defender")}`;
  if (type === "Rebels") return `${name("rebel")}反抗${name("ruler")}`;
  if (type === "Proselytism") return `${name("source-religion")}正向${name("target-religion")}信仰区传教`;
  if (type === "Crusade") return `${name("initiator-religion")}发起针对${name("target-religion")}的圣战`;
  const origin = name("origin");
  const affectedText = affected.length ? `，影响${affected.join("、")}${participants.filter(item => item.role === "affected").length > 3 ? "等" : ""}` : "";
  if (type === "Disease") return `${origin || "未知来源"}爆发疫病${affectedText}`;
  if (type === "Flood") return `${origin || "未知水系"}发生洪灾${affectedText}`;
  if (type === "Eruption") return `${origin || "未知火山"}喷发${affectedText}`;
  if (type === "Avalanche") return `${origin || "高地区域"}发生雪崩${affectedText}`;
  if (type === "Fault") return `${origin || "地质断层"}活动${affectedText}`;
  if (type === "Tsunami") return `${origin || "近海区域"}发生海啸${affectedText}`;
  return `${origin || "当地"}发生灾害${affectedText}`;
}

function resolveParticipantReference(map, ref) {
  const id = ref.id;
  if (ref.kind === "faction" || ref.kind === "region" && String(id).startsWith("cell:")) return {name: ref.nameSnapshot, available: true};
  const values = {
    state: map?.politics?.states || map?.pack?.states,
    religion: map?.society?.religions || map?.pack?.religions,
    culture: map?.society?.cultures || map?.pack?.cultures,
    province: map?.politics?.provinces || map?.pack?.provinces,
    city: map?.settlements?.cities,
    burg: map?.pack?.burgs,
    marker: map?.markers?.markers || map?.pack?.markers,
    river: map?.rivers?.rivers || map?.pack?.rivers,
    feature: map?.pack?.features,
    region: map?.politics?.regions
  }[ref.kind];
  const item = findById(values, id);
  return {name: item?.fullName || item?.name, available: Boolean(item)};
}

function findById(values, id) {
  return (values || []).find((item, index) => item && String(item.id ?? item.i ?? index) === String(id) && !item.removed);
}

function fallbackParticipantName(ref) {
  return `${ref.kind} #${ref.id}`;
}

function normalizeSnapshot(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 96) : "";
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}
import {normalizeZoneTypeRecord} from "./zone-types.js";
