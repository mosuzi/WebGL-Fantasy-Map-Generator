export function createHistoryActions(documentRef, {className, history, onUndo, onRedo, label = "历史", noteText = null} = {}) {
  const actions = documentRef.createElement("div");
  actions.className = className;
  const undo = documentRef.createElement("button");
  undo.type = "button";
  undo.className = "secondary-action";
  undo.textContent = "撤销上次";
  undo.addEventListener("click", onUndo);
  const redo = documentRef.createElement("button");
  redo.type = "button";
  redo.className = "secondary-action";
  redo.textContent = "重做上次";
  redo.addEventListener("click", onRedo);
  const note = documentRef.createElement("span");
  const domain = history?.lastDomain && history.lastDomain !== "none" ? ` @${history.lastDomain}` : "";
  note.textContent = noteText ?? `${label}：${history ? `undo ${history.undo} / redo ${history.redo} / ${history.lastLabel}${domain}` : "none"}`;
  actions.append(undo, redo, note);
  return actions;
}
