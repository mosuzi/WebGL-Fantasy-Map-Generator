import {readObjectNote, objectNoteId} from "./object-notes.js";
import {resolveObject} from "./object-resolver.js";
import {objectAffected} from "./edit-command-effects.js";

function resolved(map, ref) { try { return resolveObject(map, ref); } catch { return null; } }
export function inspectOrphanNote(map, noteId, target = null) {
  const note = readObjectNote(map, noteId);
  if (!note) throw new Error("原备注已不存在，请重新选择。");
  if (resolved(map, {kind: note.kind, id: note.objectId})) throw new Error("这条备注已有有效对象，无需抢救。");
  if (target) {
    if (!["state", "province", "city"].includes(target.kind) || !resolved(map, target)) throw new Error("目标对象已不存在，请重新选择。");
    if (readObjectNote(map, target)) throw new Error("目标已有备注，请先处理冲突；原备注保持不变。");
  }
  return note;
}

export function createRescueOrphanNoteCommand(expectedMap, noteId, {body, target = null} = {}) {
  let before, after;
  const check = context => {
    if (context.map !== expectedMap) throw new Error("地图已更换，请重新选择备注。");
    return inspectOrphanNote(context.map, noteId, target);
  };
  return {
    label: target ? "重新绑定孤儿备注" : "保存孤儿备注正文", domain: "note",
    effects: {render: "draw", selection: "refresh", runtimeStats: true, pickPanel: true, derived: ["object-panels"], affected: objectAffected("note", noteId)},
    isNoop(context) { const note = check(context); return !target && String(body ?? note.body) === note.body; },
    apply(context) {
      const note = check(context);
      if (!before) {
        before = structuredClone(context.map.notes);
        after = structuredClone(before);
        const index = after.notes.findIndex(item => item?.id === noteId);
        const next = {...note, body: body === undefined ? note.body : String(body), updatedAt: new Date().toISOString()};
        if (target) {
          Object.assign(next, {id: objectNoteId(target), kind: target.kind, objectId: target.id});
          delete next.standalone; delete next.packCell; delete next.x; delete next.y;
        }
        after.notes[index] = next;
      }
      context.map.notes = structuredClone(after);
    },
    revert(context) { if (context.map !== expectedMap || !before) throw new Error("无法在另一地图撤销备注修改。"); context.map.notes = structuredClone(before); }
  };
}
