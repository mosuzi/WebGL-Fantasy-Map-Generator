export function systemAffected(system, targets = []) {
  return [{kind: "derived-system", id: system}, ...targets];
}

export function objectAffected(kind, id) {
  return [{kind, id}];
}

export function newObjectAffected(kind) {
  return [{kind, id: "new"}];
}

export function collectionAffected(kind, objects, {includeZero = true} = {}) {
  const seen = new Set();
  const targets = [];
  for (const object of Array.isArray(objects) ? objects : []) {
    if (!object || object.removed) continue;
    const id = object.id ?? object.i;
    if (!["string", "number"].includes(typeof id) || id === "" || (!includeZero && Number(id) === 0)) continue;
    const key = `${typeof id}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({kind, id});
  }
  return targets;
}

export function formatAffectedTargets(affected, {limit = 3} = {}) {
  return summarizeAffectedTargets(affected, {limit}).text;
}

export function summarizeAffectedTargets(affected, {limit = 3} = {}) {
  const targets = Array.isArray(affected)
    ? affected.filter(target => target && typeof target.kind === "string" && ["string", "number"].includes(typeof target.id))
    : [];
  const visibleLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const preview = targets.slice(0, visibleLimit).map(target => ({kind: target.kind, id: target.id}));
  const visible = preview.map(target => `${target.kind}#${target.id}`);
  const overflow = targets.length - preview.length;
  const counts = new Map();
  for (const target of targets) counts.set(target.kind, (counts.get(target.kind) || 0) + 1);
  return {
    text: overflow > 0 ? `${visible.join(", ")}${visible.length ? " " : ""}+${overflow}` : visible.join(", "),
    count: targets.length,
    preview,
    kinds: [...counts].map(([kind, count]) => ({kind, count}))
  };
}

export function normalizeAffectedLimit(options, {label = "affected", defaultLimit = 3, max = 50} = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error(`${label} options 必须是对象`);
  const value = options.affectedLimit ?? defaultLimit;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > max) throw new Error(`${label} affectedLimit 必须是 0 到 ${max} 的整数`);
  return limit;
}

export function namebaseRenameAffected(kind, ids = []) {
  return systemAffected("namebase-rename", ids.map(id => ({kind, id})));
}
