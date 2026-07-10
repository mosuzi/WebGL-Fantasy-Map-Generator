import {cloneObjectNote, deleteObjectNote, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {objectAffected} from "./edit-command-effects.js";

const NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

export function createDeleteNoteCommand(noteId, {name = ""} = {}) {
  const id = String(noteId || "").trim();
  let previous = null;
  return {
    label: `删除备注 ${name || id}`,
    domain: "note",
    effects: {
      ...NOTE_EFFECTS,
      affected: objectAffected("note", id)
    },
    apply(context) {
      if (!id) return;
      previous ??= cloneObjectNote(readObjectNote(context.map, id));
      deleteObjectNote(context.map, id);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
    },
    isNoop(context) {
      return !id || !readObjectNote(context.map, id);
    }
  };
}
