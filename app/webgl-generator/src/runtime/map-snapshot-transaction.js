import {restoreMapSnapshot} from "./climate-downstream-rebuild.js";

export function captureMapMutationSnapshot(map, editHistory) {
  if (!map || !editHistory?.createSnapshot) throw new Error("地图事务缺少地图或编辑历史上下文");
  return {
    map: structuredClone(map),
    history: editHistory.createSnapshot(),
    optionsReference: map.options
  };
}

export function restoreMapMutationSnapshot(map, editHistory, snapshot) {
  if (!snapshot?.map || !snapshot?.history) throw new Error("地图事务快照无效");
  restoreMapSnapshot(map, snapshot.map);
  editHistory.restoreSnapshot(snapshot.history);
  preserveOptionsReference(map, snapshot.optionsReference);
}

export function executeMapSnapshotTransaction({
  map,
  editHistory,
  label,
  domain = "map-derived",
  effects = {},
  execute,
  executeCommand,
  isNoop = result => result?.executed === false,
  shouldRestoreOnError = () => true,
  commandFactory = createMapSnapshotCommand,
  onRestore
}) {
  if (typeof execute !== "function") throw new Error("地图事务缺少执行器");
  if (typeof executeCommand !== "function") throw new Error("地图事务缺少历史提交器");
  const snapshot = captureMapMutationSnapshot(map, editHistory);
  try {
    const result = execute();
    if (result && typeof result.then === "function") throw new Error("同步地图事务不能返回 Promise");
    preserveOptionsReference(map, snapshot.optionsReference);
    if (isNoop(result)) {
      restoreMapMutationSnapshot(map, editHistory, snapshot);
      onRestore?.("noop");
      return {executed: false, result, command: null};
    }

    const after = structuredClone(map);
    editHistory.restoreSnapshot(snapshot.history);
    const command = commandFactory({
      before: snapshot.map,
      after,
      optionsReference: snapshot.optionsReference,
      label,
      domain,
      effects,
      result
    });
    const commandExecution = executeCommand(command);
    if (commandExecution?.executed === false) {
      throw commandExecution.error || new Error("地图事务历史命令未执行");
    }
    preserveOptionsReference(map, snapshot.optionsReference);
    return {executed: true, result, command, commandExecution};
  } catch (error) {
    const restored = shouldRestoreOnError(error) !== false;
    if (restored) restoreMapMutationSnapshot(map, editHistory, snapshot);
    else {
      editHistory.restoreSnapshot(snapshot.history);
      preserveOptionsReference(map, snapshot.optionsReference);
    }
    onRestore?.("rollback", error, {restored});
    throw error;
  }
}

export function createMapSnapshotCommand({before, after, optionsReference, label, domain, effects, result}) {
  let initialApply = true;
  return {
    label: String(label || "地图派生事务"),
    domain: String(domain || "map-derived"),
    effects,
    apply(context) {
      if (initialApply) {
        initialApply = false;
        preserveOptionsReference(context.map, optionsReference);
        return;
      }
      restoreMapSnapshot(context.map, after);
      preserveOptionsReference(context.map, optionsReference);
    },
    revert(context) {
      restoreMapSnapshot(context.map, before);
      preserveOptionsReference(context.map, optionsReference);
    },
    getResult() {
      return result;
    }
  };
}

function preserveOptionsReference(map, optionsReference) {
  if (!map || !optionsReference || typeof optionsReference !== "object" || map.options === optionsReference) return;
  const replacement = map.options && typeof map.options === "object" ? map.options : {};
  for (const key of Object.keys(optionsReference)) delete optionsReference[key];
  Object.assign(optionsReference, replacement);
  map.options = optionsReference;
}
