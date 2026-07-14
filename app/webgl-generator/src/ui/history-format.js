import {formatAffectedTargets} from "../runtime/edit-command-effects.js";

export {formatAffectedTargets};

export function formatHistoryStats(history) {
  if (!history) return "none";
  return `undo ${history.undo} / redo ${history.redo} / ${formatHistoryCommand(history)}`;
}

export function formatHistoryCommand(history) {
  if (!history) return "none";
  const domain = history.lastDomain && history.lastDomain !== "none" ? ` @${history.lastDomain}` : "";
  const affected = history.lastAffectedSummary && history.lastAffectedSummary !== "none"
    ? history.lastAffectedSummary
    : formatAffectedTargets(history.lastAffected);
  return `${history.lastLabel}${domain}${affected ? ` [${affected}]` : ""}`;
}
