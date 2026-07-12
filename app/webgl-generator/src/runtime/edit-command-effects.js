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
  if (!Array.isArray(affected) || !affected.length) return "";
  const targets = affected.filter(target => target && typeof target.kind === "string" && ["string", "number"].includes(typeof target.id));
  if (!targets.length) return "";
  const visibleLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const visible = targets.slice(0, visibleLimit).map(target => `${target.kind}#${target.id}`);
  const overflow = targets.length - visible.length;
  return overflow > 0 ? `${visible.join(", ")}${visible.length ? " " : ""}+${overflow}` : visible.join(", ");
}

export function namebaseRenameAffected(kind, ids = []) {
  return systemAffected("namebase-rename", ids.map(id => ({kind, id})));
}
