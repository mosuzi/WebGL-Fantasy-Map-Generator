export function formatHistoryStats(history) {
  if (!history) return "none";
  return `undo ${history.undo} / redo ${history.redo} / ${formatHistoryCommand(history)}`;
}

export function formatHistoryCommand(history) {
  if (!history) return "none";
  const domain = history.lastDomain && history.lastDomain !== "none" ? ` @${history.lastDomain}` : "";
  const affected = formatAffectedTargets(history.lastAffected);
  return `${history.lastLabel}${domain}${affected ? ` [${affected}]` : ""}`;
}

export function formatAffectedTargets(affected, {limit = 3} = {}) {
  if (!Array.isArray(affected) || !affected.length) return "";
  const targets = affected
    .filter(target => target && typeof target.kind === "string" && ["string", "number"].includes(typeof target.id));
  if (!targets.length) return "";
  const visible = targets.slice(0, limit).map(target => `${target.kind}#${target.id}`);
  const overflow = targets.length - visible.length;
  return overflow > 0 ? `${visible.join(", ")} +${overflow}` : visible.join(", ");
}
