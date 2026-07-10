export function systemAffected(system, targets = []) {
  return [{kind: "derived-system", id: system}, ...targets];
}

export function objectAffected(kind, id) {
  return [{kind, id}];
}

export function newObjectAffected(kind) {
  return [{kind, id: "new"}];
}

export function namebaseRenameAffected(kind, ids = []) {
  return systemAffected("namebase-rename", ids.map(id => ({kind, id})));
}
