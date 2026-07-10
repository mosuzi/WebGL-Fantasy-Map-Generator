import {formatHistoryStats} from "../history-format.js";

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
  note.textContent = noteText ?? `${label}：${formatHistoryStats(history)}`;
  actions.append(undo, redo, note);
  return actions;
}
