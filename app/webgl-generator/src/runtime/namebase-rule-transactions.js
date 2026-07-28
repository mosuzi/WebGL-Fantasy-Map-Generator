import {createNamebaseImportPreview, getNamebaseBindings, NAMEBASE_BINDING_TARGETS} from "../generator/namebase-store.js";
import {getBuiltinNamebaseSummaries} from "../generator/names.js";
import {createRenameCitiesFromNamebaseCommand} from "./city-edit-commands.js";
import {applyNestedEditCommand, revertNestedEditCommand} from "./edit-history.js";
import {createRenameLakesFromNamebaseCommand} from "./lake-edit-commands.js";
import {
  createClearUserNamebasesCommand,
  createDeleteUserNamebaseCommand,
  createImportNamebasesCommand,
  createSetNamebaseBindingCommand
} from "./namebase-edit-commands.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {createRenameNamedObjectsFromNamebaseCommand} from "./object-edit-commands.js";
import {createRenameRiversFromNamebaseCommand} from "./river-edit-commands.js";
import {createRenameStatesFromNamebaseCommand} from "./state-edit-commands.js";

export const NAMEBASE_RULE_ACTION = Object.freeze({
  BIND_AND_RENAME: "society.bind-namebase-and-rename",
  REPLACE_OR_REMOVE: "society.replace-or-remove-namebase"
});

export const NAMEBASE_RULE_ACTIONS = Object.freeze(Object.values(NAMEBASE_RULE_ACTION));

const BINDING_TARGETS = new Set(NAMEBASE_BINDING_TARGETS.map(item => item.key));
const RENAME_KINDS_BY_TARGET = Object.freeze({
  stateRoot: Object.freeze([OBJECT_KIND.STATE]),
  place: Object.freeze([OBJECT_KIND.CITY, OBJECT_KIND.PROVINCE]),
  hydro: Object.freeze([OBJECT_KIND.RIVER, OBJECT_KIND.LAKE]),
  culture: Object.freeze([OBJECT_KIND.CULTURE]),
  religion: Object.freeze([OBJECT_KIND.RELIGION])
});
const BUILTIN_NAMEBASE_IDS = new Set(getBuiltinNamebaseSummaries({includeSource: false}).map(base => base.id));
const NOOP_CODES = new Set(["binding-unchanged", "rename-unchanged", "no-user-namebases"]);

export function inspectNamebaseRuleTransaction(map, actionId, input = {}) {
  if (actionId === NAMEBASE_RULE_ACTION.BIND_AND_RENAME) return inspectBindNamebaseAndRename(map, input);
  if (actionId === NAMEBASE_RULE_ACTION.REPLACE_OR_REMOVE) return inspectReplaceOrRemoveNamebase(map, input);
  return reject("unknown-action", "未知的名称库规则事务");
}

export function inspectBindNamebaseAndRename(map, input = {}) {
  if (!map || typeof map !== "object") return reject("missing-map", "当前没有可预检的地图");
  if (!input || typeof input !== "object" || Array.isArray(input)) return reject("invalid-input", "绑定并重命名参数必须是对象");

  const scope = String(input.scope || "").trim().toLowerCase();
  if (!["global", "culture"].includes(scope)) return reject("invalid-scope", "scope 必须是 global 或 culture");
  const target = String(input.target || "").trim();
  if (!BINDING_TARGETS.has(target)) return reject("invalid-target", "名称库绑定目标无效");

  const cultureId = scope === "culture" ? positiveInteger(input.cultureId) : null;
  if (scope === "culture" && cultureId === null) return reject("invalid-culture", "文化 ID 必须是正整数");
  if (scope === "culture" && !findObject(map, OBJECT_KIND.CULTURE, cultureId)) {
    return reject("culture-not-found", `找不到文化 #${cultureId}`);
  }

  const baseId = String(input.baseId || "").trim();
  if (baseId && !findNamebase(map, baseId)) return reject("namebase-not-found", `找不到可用名称库 ${baseId}`);

  const renameResult = normalizeRenameRequest(map, input.rename, {target, scope, cultureId});
  if (!renameResult.allowed) return renameResult;
  const normalizedInput = {
    scope,
    cultureId: scope === "culture" ? cultureId : undefined,
    target,
    baseId,
    rename: renameResult.normalizedInput
  };
  if (!normalizedInput.rename) delete normalizedInput.rename;
  if (scope === "global") delete normalizedInput.cultureId;

  const bindings = getNamebaseBindings(map);
  const current = scope === "culture"
    ? bindings.cultures?.[String(cultureId)]?.[target]
    : bindings.global?.[target];
  if (!normalizedInput.rename && String(current || "").trim() === baseId) {
    return reject("binding-unchanged", "名称库绑定没有变化", [], false, normalizedInput);
  }
  if (normalizedInput.rename && String(current || "").trim() === baseId) {
    const renameCommand = createRenameCommand(normalizedInput.rename.kind, normalizedInput.rename.ids);
    if (renameCommand.isNoop({map})) {
      return reject("rename-unchanged", "名称库绑定及对象名称都没有变化", [], true, normalizedInput);
    }
  }

  const bindingId = `${scope === "culture" ? `culture:${cultureId}` : "global"}:${target}`;
  const affected = [
    {kind: "namebase-binding", id: bindingId},
    ...(normalizedInput.rename?.ids || []).map(id => ({kind: normalizedInput.rename.kind, id}))
  ];
  return allow(
    normalizedInput.rename
      ? `可先设置${scope === "culture" ? `文化 #${cultureId}` : "全局"}${target}绑定，再重命名 ${normalizedInput.rename.ids.length} 个对象`
      : `可设置${scope === "culture" ? `文化 #${cultureId}` : "全局"}${target}名称库绑定`,
    affected,
    Boolean(normalizedInput.rename),
    normalizedInput
  );
}

export function inspectReplaceOrRemoveNamebase(map, input = {}) {
  if (!map || typeof map !== "object") return reject("missing-map", "当前没有可预检的地图");
  if (!input || typeof input !== "object" || Array.isArray(input)) return reject("invalid-input", "名称库替换参数必须是对象");

  const operation = String(input.operation || "").trim().toLowerCase();
  if (!["delete", "clear", "replace"].includes(operation)) {
    return reject("invalid-operation", "operation 必须是 delete、clear 或 replace");
  }

  const userBases = currentUserNamebases(map);
  let removedIds = [];
  let preview = null;
  const baseId = String(input.baseId || "").trim();
  if (operation === "delete") {
    if (!baseId) return reject("invalid-base", "删除名称库时必须提供 baseId");
    const base = userBases.find(item => item.id === baseId);
    if (!base) return reject("user-namebase-not-found", `找不到可删除的用户名称库 ${baseId}`);
    removedIds = [baseId];
  } else {
    removedIds = userBases.map(base => base.id);
  }

  if (operation === "clear" && !removedIds.length) {
    return reject("no-user-namebases", "当前没有可清空的用户名称库", [], true, {
      operation,
      replacementBaseId: ""
    });
  }

  const filename = String(input.filename || "").trim();
  if (operation === "replace") {
    if (!input.document || typeof input.document !== "object" || Array.isArray(input.document) || !Array.isArray(input.document.bases)) {
      return reject("invalid-document", "替换名称库时必须提供包含 bases 的文档");
    }
    try {
      preview = createNamebaseImportPreview(map, input.document, {filename, mode: "replace"});
    } catch (error) {
      return reject("invalid-document", error?.message || "名称库替换文档无效");
    }
    if (preview.valid <= 0) return reject("empty-document", "替换文档没有可导入的名称库");
  }

  const replacementBaseId = String(input.replacementBaseId || "").trim();
  if (replacementBaseId) {
    const replacement = findNamebase(map, replacementBaseId);
    if (!replacement) return reject("replacement-not-found", `找不到替代名称库 ${replacementBaseId}`);
    if (removedIds.includes(replacementBaseId)) {
      return reject("replacement-will-be-removed", `替代名称库 ${replacementBaseId} 也会被本操作移除`);
    }
  }

  const migrations = collectBindingMigrations(map, new Set(removedIds), replacementBaseId);
  const normalizedInput = {
    operation,
    replacementBaseId,
    ...(operation === "delete" ? {baseId} : {}),
    ...(operation === "replace" ? {document: input.document, filename} : {})
  };
  const affected = [
    ...removedIds.map(id => ({kind: "namebase", id})),
    ...migrations.map(item => ({kind: "namebase-binding", id: bindingMigrationId(item)})),
    ...(operation === "replace" ? [{kind: "namebase", id: "imported"}] : [])
  ];
  const operationLabel = operation === "delete" ? `删除用户名称库 ${baseId}` : operation === "clear" ? "清空用户名称库" : "替换用户名称库";
  return allow(
    `${operationLabel}前将迁移 ${migrations.length} 个绑定${replacementBaseId ? `到 ${replacementBaseId}` : "到内置回退策略"}`,
    affected,
    true,
    normalizedInput,
    {removedIds, migrations, preview}
  );
}

export function createBindNamebaseAndRenameCommand(input, {label = "绑定名称库并重命名", faultInjector = null} = {}) {
  let inspection = null;
  let children = null;
  let applied = [];
  let result = null;

  return {
    label,
    domain: "namebase-rule",
    effects: compositeEffects(Boolean(input?.rename)),
    apply(context) {
      inspection = inspectBindNamebaseAndRename(context.map, input);
      if (!inspection.allowed) throw inspectionError(inspection);
      children ??= createBindChildren(inspection.normalizedInput);
      this.effects = {
        ...compositeEffects(Boolean(inspection.normalizedInput.rename)),
        affected: inspection.affected.map(item => ({...item}))
      };
      applied = [];
      try {
        for (let index = 0; index < children.length; index += 1) {
          const command = children[index];
          if (command.isNoop?.(context)) continue;
          applyNestedEditCommand(command, context);
          applied.push(command);
          invokeFault(faultInjector, index === 0 ? "after-binding" : "after-rename", {
            map: context.map,
            inspection,
            command,
            index
          });
        }
        if (inspection.normalizedInput.rename) {
          assertRenamedNamesUnique(context.map, inspection.normalizedInput.rename);
        }
        result = {
          binding: children[0].getResult?.() || null,
          rename: children[1]?.getResult?.() || null
        };
      } catch (error) {
        rollbackApplied(applied, context, error);
        applied = [];
        throw error;
      }
    },
    revert(context) {
      if (!children || !applied.length) throw new Error("缺少可撤销的名称库绑定事务");
      rollbackApplied(applied, context);
      applied = [];
    },
    isNoop(context) {
      const current = inspectBindNamebaseAndRename(context.map, input);
      return !current.allowed && NOOP_CODES.has(current.code);
    },
    getInspection() {
      return inspection ? cloneInspection(inspection) : null;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

export function createReplaceOrRemoveNamebaseCommand(input, {label = "替换或移除名称库", faultInjector = null} = {}) {
  let inspection = null;
  let children = null;
  let applied = [];
  let result = null;

  return {
    label,
    domain: "namebase-rule",
    effects: compositeEffects(false),
    apply(context) {
      inspection = inspectReplaceOrRemoveNamebase(context.map, input);
      if (!inspection.allowed) throw inspectionError(inspection);
      children ??= createReplacementChildren(inspection.normalizedInput, inspection.details?.migrations || []);
      this.effects = {
        ...compositeEffects(false),
        affected: inspection.affected.map(item => ({...item}))
      };
      applied = [];
      try {
        const migrationCount = inspection.details?.migrations?.length || 0;
        for (let index = 0; index < children.length; index += 1) {
          const command = children[index];
          applyNestedEditCommand(command, context);
          applied.push(command);
          const stage = index < migrationCount ? "after-binding" : "after-operation";
          invokeFault(faultInjector, stage, {map: context.map, inspection, command, index});
          if (index + 1 === migrationCount) {
            invokeFault(faultInjector, "after-migrations", {map: context.map, inspection, command, index});
          }
        }
        assertNoRemovedBindingReferences(context.map, new Set(inspection.details?.removedIds || []));
        result = {
          operation: inspection.normalizedInput.operation,
          migrated: migrationCount,
          replacementBaseId: inspection.normalizedInput.replacementBaseId,
          store: children.at(-1)?.getResult?.() || null
        };
      } catch (error) {
        rollbackApplied(applied, context, error);
        applied = [];
        throw error;
      }
    },
    revert(context) {
      if (!children || !applied.length) throw new Error("缺少可撤销的名称库替换事务");
      rollbackApplied(applied, context);
      applied = [];
    },
    isNoop(context) {
      const current = inspectReplaceOrRemoveNamebase(context.map, input);
      return !current.allowed && NOOP_CODES.has(current.code);
    },
    getInspection() {
      return inspection ? cloneInspection(inspection) : null;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

function normalizeRenameRequest(map, rename, {target, scope, cultureId}) {
  if (rename === undefined || rename === null) return allow("", [], false, null);
  if (typeof rename !== "object" || Array.isArray(rename)) return reject("invalid-rename", "rename 必须是对象");
  const kind = String(rename.kind || "").trim().toLowerCase();
  const compatibleKinds = RENAME_KINDS_BY_TARGET[target] || [];
  if (!compatibleKinds.includes(kind)) {
    return reject("target-kind-mismatch", `${target} 绑定不能用于重命名 ${kind || "未知类型"}`);
  }
  if (!Array.isArray(rename.ids)) return reject("invalid-rename-ids", "rename.ids 必须是数组");
  const ids = [...new Set(rename.ids.map(value => normalizeRenameId(kind, value)).filter(id => id !== null))];
  if (!ids.length || ids.length !== rename.ids.length) {
    return reject("invalid-rename-ids", "rename.ids 必须是互不重复的正整数");
  }
  for (const id of ids) {
    const object = findObject(map, kind, id);
    if (!object) return reject("rename-object-not-found", `找不到${kind} #${id}`);
    if (scope === "culture" && objectCultureId(map, kind, object, id) !== cultureId) {
      return reject("rename-culture-mismatch", `${kind} #${id} 不属于文化 #${cultureId}`);
    }
  }
  return allow("", ids.map(id => ({kind, id})), true, {kind, ids});
}

function createBindChildren(input) {
  const children = [
    createSetNamebaseBindingCommand(input.target, input.baseId, {
      cultureId: input.scope === "culture" ? String(input.cultureId) : "",
      label: "规则事务设置名称库绑定"
    })
  ];
  if (input.rename) children.push(createRenameCommand(input.rename.kind, input.rename.ids));
  return children;
}

function createReplacementChildren(input, migrations) {
  const children = migrations.map(migration => createSetNamebaseBindingCommand(
    migration.target,
    migration.replacementBaseId,
    {
      cultureId: migration.scope === "culture" ? migration.cultureId : "",
      label: "规则事务迁移名称库绑定"
    }
  ));
  if (input.operation === "delete") {
    children.push(createDeleteUserNamebaseCommand(input.baseId, {label: "规则事务删除名称库"}));
  } else if (input.operation === "clear") {
    children.push(createClearUserNamebasesCommand({label: "规则事务清空用户名称库"}));
  } else {
    children.push(createImportNamebasesCommand(input.document, {
      filename: input.filename,
      mode: "replace",
      label: "规则事务替换名称库"
    }));
  }
  return children;
}

function createRenameCommand(kind, ids) {
  if (kind === OBJECT_KIND.STATE) return createRenameStatesFromNamebaseCommand(ids, {label: "规则事务重命名国家"});
  if (kind === OBJECT_KIND.CITY) return createRenameCitiesFromNamebaseCommand(ids, {label: "规则事务重命名城市"});
  if (kind === OBJECT_KIND.RIVER) return createRenameRiversFromNamebaseCommand(ids, {label: "规则事务重命名河流"});
  if (kind === OBJECT_KIND.LAKE) return createRenameLakesFromNamebaseCommand(ids, {label: "规则事务重命名湖泊"});
  return createRenameNamedObjectsFromNamebaseCommand(kind, ids, {label: "规则事务按名称库重命名"});
}

function collectBindingMigrations(map, removedIds, replacementBaseId) {
  const bindings = getNamebaseBindings(map);
  const migrations = [];
  for (const target of NAMEBASE_BINDING_TARGETS) {
    if (removedIds.has(String(bindings.global?.[target.key] || "").trim())) {
      migrations.push({scope: "global", target: target.key, replacementBaseId});
    }
  }
  for (const [cultureId, cultureBindings] of Object.entries(bindings.cultures || {})) {
    for (const target of BINDING_TARGETS) {
      if (removedIds.has(String(cultureBindings?.[target] || "").trim())) {
        migrations.push({scope: "culture", cultureId, target, replacementBaseId});
      }
    }
  }
  return migrations;
}

function assertNoRemovedBindingReferences(map, removedIds) {
  if (!removedIds.size) return;
  const bindings = getNamebaseBindings(map);
  for (const target of NAMEBASE_BINDING_TARGETS) {
    if (removedIds.has(String(bindings.global?.[target.key] || "").trim())) {
      throw new Error(`名称库事务留下悬空全局绑定：${target.key}`);
    }
  }
  for (const [cultureId, cultureBindings] of Object.entries(bindings.cultures || {})) {
    for (const target of BINDING_TARGETS) {
      if (removedIds.has(String(cultureBindings?.[target] || "").trim())) {
        throw new Error(`名称库事务留下悬空文化绑定：${cultureId}:${target}`);
      }
    }
  }
}

function findNamebase(map, id) {
  if (BUILTIN_NAMEBASE_IDS.has(id)) return {id, builtin: true};
  return currentUserNamebases(map).find(base => base.id === id) || null;
}

function currentUserNamebases(map) {
  return (map?.namebases?.bases || [])
    .filter(base => base && base.builtin !== true && base.removed !== true && String(base.id || "").trim())
    .map(base => ({...base, id: String(base.id).trim()}));
}

function findObject(map, kind, id) {
  let object = null;
  if (kind === OBJECT_KIND.STATE) object = (map?.politics?.states || map?.pack?.states || [])[id];
  else if (kind === OBJECT_KIND.PROVINCE) object = (map?.politics?.provinces || map?.pack?.provinces || [])[id];
  else if (kind === OBJECT_KIND.CITY) object = map?.settlements?.cities?.[id];
  else if (kind === OBJECT_KIND.RIVER) object = (map?.rivers?.rivers || []).find(item => Number(item?.id) === id);
  else if (kind === OBJECT_KIND.LAKE) object = (map?.pack?.features || []).find(item => item?.type === "lake" && Number(item.i ?? item.id) === id);
  else if (kind === OBJECT_KIND.CULTURE) object = (map?.society?.cultures || map?.pack?.cultures || [])[id];
  else if (kind === OBJECT_KIND.RELIGION) object = (map?.society?.religions || map?.pack?.religions || [])[id];
  return object && object.removed !== true ? object : null;
}

function objectCultureId(map, kind, object, id) {
  if (kind === OBJECT_KIND.STATE) return integerOrZero(object.culture);
  if (kind === OBJECT_KIND.PROVINCE) {
    return integerOrZero(object.culture ?? map?.pack?.cells?.culture?.[object.center]);
  }
  if (kind === OBJECT_KIND.CITY) {
    const burg = map?.pack?.burgs?.[object.burgId] || (map?.pack?.burgs || []).find(item => item?.cityId === id);
    return integerOrZero(object.culture ?? burg?.culture);
  }
  if (kind === OBJECT_KIND.RIVER) {
    const source = Number.isInteger(object.source) ? object.source : object.cells?.[0];
    return integerOrZero(map?.pack?.cells?.culture?.[source]);
  }
  if (kind === OBJECT_KIND.LAKE) return integerOrZero(map?.pack?.cells?.culture?.[object.firstCell]);
  if (kind === OBJECT_KIND.CULTURE) return id;
  if (kind === OBJECT_KIND.RELIGION) return integerOrZero(object.culture);
  return 0;
}

function assertRenamedNamesUnique(map, rename) {
  const renamedIds = new Set(rename.ids);
  const seen = new Map();
  for (const object of namedObjects(map, rename.kind)) {
    const id = Number(object.id ?? object.i);
    const name = normalizedObjectName(rename.kind, object);
    if (!name) continue;
    const previousId = seen.get(name);
    if (previousId !== undefined && (renamedIds.has(id) || renamedIds.has(previousId))) {
      const error = new Error(`${rename.kind} #${previousId} 与 #${id} 重命名后名称冲突：${name}`);
      error.code = "name-conflict";
      throw error;
    }
    seen.set(name, id);
  }
}

function namedObjects(map, kind) {
  if (kind === OBJECT_KIND.STATE) return (map?.politics?.states || map?.pack?.states || []).filter(item => item && !item.removed);
  if (kind === OBJECT_KIND.PROVINCE) return (map?.politics?.provinces || map?.pack?.provinces || []).filter(item => item && !item.removed);
  if (kind === OBJECT_KIND.CITY) return (map?.settlements?.cities || []).filter(item => item && !item.removed);
  if (kind === OBJECT_KIND.RIVER) return (map?.rivers?.rivers || []).filter(item => item && !item.removed);
  if (kind === OBJECT_KIND.LAKE) return (map?.pack?.features || []).filter(item => item?.type === "lake" && !item.removed);
  if (kind === OBJECT_KIND.CULTURE) return (map?.society?.cultures || map?.pack?.cultures || []).filter(item => item && !item.removed);
  if (kind === OBJECT_KIND.RELIGION) return (map?.society?.religions || map?.pack?.religions || []).filter(item => item && !item.removed);
  return [];
}

function normalizedObjectName(kind, object) {
  const raw = kind === OBJECT_KIND.STATE ? object.name || object.fullName : object.name;
  return String(raw || "").trim().replace(/\s+/gu, " ");
}

function compositeEffects(draw) {
  return {
    render: draw ? "draw" : "none",
    selection: draw ? "refresh" : "none",
    runtimeStats: true,
    pickPanel: draw,
    derived: ["namebases", "object-panels", ...(draw ? ["object-name", "labels"] : [])],
    affected: [{kind: "derived-system", id: "namebase-rule"}]
  };
}

function rollbackApplied(commands, context, originalError = null) {
  let rollbackError = null;
  for (const command of [...commands].reverse()) {
    try {
      revertNestedEditCommand(command, context);
    } catch (error) {
      rollbackError ||= error;
    }
  }
  if (rollbackError && originalError) originalError.rollbackError = rollbackError;
  if (rollbackError && !originalError) throw rollbackError;
}

function invokeFault(faultInjector, stage, detail) {
  if (typeof faultInjector === "function") faultInjector(stage, detail);
}

function inspectionError(inspection) {
  const error = new Error(inspection.summary);
  error.code = inspection.code;
  error.inspection = cloneInspection(inspection);
  return error;
}

function bindingMigrationId(migration) {
  return `${migration.scope === "culture" ? `culture:${migration.cultureId}` : "global"}:${migration.target}`;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeRenameId(kind, value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return [OBJECT_KIND.CITY, OBJECT_KIND.RIVER, OBJECT_KIND.LAKE].includes(kind)
    ? (number >= 0 ? number : null)
    : (number > 0 ? number : null);
}

function integerOrZero(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function allow(summary, affected = [], requiresConfirm = false, normalizedInput = null, details = null) {
  return {
    allowed: true,
    code: "ok",
    summary,
    normalizedInput,
    affected: affected.map(item => ({...item})),
    requiresConfirm: Boolean(requiresConfirm),
    ...(details ? {details} : {})
  };
}

function reject(code, summary, affected = [], requiresConfirm = false, normalizedInput = null) {
  return {
    allowed: false,
    code,
    summary,
    normalizedInput,
    affected: affected.map(item => ({...item})),
    requiresConfirm: Boolean(requiresConfirm)
  };
}

function cloneInspection(inspection) {
  return {
    ...inspection,
    normalizedInput: inspection.normalizedInput ? clonePlain(inspection.normalizedInput) : inspection.normalizedInput,
    affected: inspection.affected.map(item => ({...item})),
    ...(inspection.details ? {details: clonePlain(inspection.details)} : {})
  };
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
