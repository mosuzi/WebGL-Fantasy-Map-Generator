import {normalizeAffectedLimit, summarizeAffectedTargets} from "./edit-command-effects.js";

export function buildHistoryPeek(state, options = {}) {
  const history = state?.editHistory;
  if (!history) return {ready: false};
  const affectedLimit = normalizeAffectedLimit(options, {label: "history.peek"});
  return {
    ready: true,
    stats: history.getStats?.({affectedLimit}) || null,
    affectedLimit,
    undo: summarizeHistoryCommand(history.undoStack?.at(-1), {affectedLimit}),
    redo: summarizeHistoryCommand(history.redoStack?.at(-1), {affectedLimit})
  };
}

function summarizeHistoryCommand(command, {affectedLimit}) {
  if (!command) return null;
  const affectedSummary = summarizeAffectedTargets(command.effects?.affected, {limit: affectedLimit});
  return {
    label: command.label || "未命名编辑",
    domain: command.domain || "none",
    affected: affectedSummary.preview,
    affectedCount: affectedSummary.count,
    affectedKinds: affectedSummary.kinds,
    affectedSummary: affectedSummary.text || "none",
    affectedTruncated: affectedSummary.count > affectedSummary.preview.length,
    renderEffect: command.effects?.render || "",
    selectionEffect: command.effects?.selection || "",
    derived: Array.isArray(command.effects?.derived) ? [...command.effects.derived] : [],
    hasNoopCheck: typeof command.isNoop === "function"
  };
}
