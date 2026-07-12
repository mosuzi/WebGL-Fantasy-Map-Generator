import {clearUserNamebases, copyBuiltinNamebaseToUser, createNamebaseImportPreview, createUserNamebase, deleteUserNamebase, importNamebaseDocument, NAMEBASE_BINDING_TARGETS, renameUserNamebase, setNamebaseBinding, updateUserNamebaseOptions, updateUserNamebaseSource} from "../generator/namebase-store.js";
import {newObjectAffected, objectAffected, systemAffected} from "./edit-command-effects.js";

const NAMEBASE_EDIT_EFFECTS = Object.freeze({
  render: "none",
  selection: "none",
  runtimeStats: true,
  pickPanel: false,
  derived: Object.freeze(["object-panels"])
});

export function createImportNamebasesCommand(document, {filename = "", mode = "append", label = "导入名称库"} = {}) {
  return createNamebaseStoreCommand({
    label,
    affected: systemAffected("namebase-import", [{kind: "namebase", id: "all"}]),
    applyEdit(map) {
      return importNamebaseDocument(map, document, {filename, mode});
    },
    isNoop(map) {
      const preview = createNamebaseImportPreview(map, document, {filename, mode});
      return preview.valid === 0 && preview.replaceCount === 0;
    }
  });
}

export function createSetNamebaseBindingCommand(target, value, {cultureId = "", label = "设置名称库绑定"} = {}) {
  const targetKey = String(target || "").trim();
  const nextValue = String(value || "").trim();
  const cultureKey = String(cultureId || "").trim();
  const targetLabel = NAMEBASE_BINDING_TARGETS.find(item => item.key === targetKey)?.label || targetKey;
  const scopeLabel = cultureKey ? `文化 #${cultureKey}` : "全局";
  return createNamebaseStoreCommand({
    label: `${label} ${scopeLabel}${targetLabel}`,
    affected: systemAffected("namebase-binding", [{kind: "namebase-binding", id: `${cultureKey ? `culture:${cultureKey}` : "global"}:${targetKey}`}]),
    applyEdit(map) {
      return setNamebaseBinding(map, targetKey, nextValue, {cultureId: cultureKey});
    },
    isNoop(map) {
      const bindings = map?.namebases?.bindings || {};
      const current = cultureKey
        ? bindings.cultures?.[cultureKey]?.[targetKey]
        : bindings.global?.[targetKey];
      return String(current || "").trim() === nextValue;
    }
  });
}

export function createCopyBuiltinNamebaseCommand(id, {name = "", label = "复制名称库"} = {}) {
  return createNamebaseStoreCommand({
    label: `${label} ${name || id}`,
    affected: newObjectAffected("namebase"),
    resolveAffected: result => result?.id ? objectAffected("namebase", result.id) : null,
    applyEdit(map) {
      return copyBuiltinNamebaseToUser(map, id);
    },
    isNoop(map) {
      return !id || !map;
    }
  });
}

export function createCreateUserNamebaseCommand({label = "新建用户名称库", payload = null} = {}) {
  const normalizedPayload = normalizeUserNamebasePayload(payload, {allowEmpty: true});
  return createNamebaseStoreCommand({
    label,
    affected: newObjectAffected("namebase"),
    resolveAffected: result => result?.id ? objectAffected("namebase", result.id) : null,
    applyEdit(map) {
      const created = createUserNamebase(map);
      return applyUserNamebasePayload(map, created.id, normalizedPayload, {
        ...created,
        created: true
      });
    }
  });
}

export function createRenameUserNamebaseCommand(id, name, {label = "重命名名称库"} = {}) {
  const nextName = String(name || "").trim();
  return createNamebaseStoreCommand({
    label: `${label} ${nextName || id}`,
    affected: objectAffected("namebase", id),
    applyEdit(map) {
      return renameUserNamebase(map, id, nextName);
    },
    isNoop(map) {
      const base = findUserNamebase(map, id);
      return !base || String(base.name || base.id || "").trim() === nextName;
    }
  });
}

export function createUpdateUserNamebaseSourceCommand(id, sourceText, {label = "编辑名称库样本"} = {}) {
  const nextSource = normalizeSourceText(sourceText);
  return createNamebaseStoreCommand({
    label: `${label} ${id}`,
    affected: objectAffected("namebase", id),
    applyEdit(map) {
      return updateUserNamebaseSource(map, id, sourceText);
    },
    isNoop(map) {
      const base = findUserNamebase(map, id);
      return !base || normalizeSourceText(base.source || []).join("\n") === nextSource.join("\n");
    }
  });
}

export function createUpdateUserNamebaseOptionsCommand(id, options, {label = "编辑名称库参数"} = {}) {
  const normalizedOptions = normalizeOptionsSnapshot(options);
  return createNamebaseStoreCommand({
    label: `${label} ${id}`,
    affected: objectAffected("namebase", id),
    applyEdit(map) {
      return updateUserNamebaseOptions(map, id, normalizedOptions);
    },
    isNoop(map) {
      const base = findUserNamebase(map, id);
      if (!base) return true;
      return optionsSnapshotKey(normalizeOptionsSnapshot(base)) === optionsSnapshotKey(normalizedOptions);
    }
  });
}

export function createUpdateUserNamebaseCommand(id, patch, {label = "更新名称库"} = {}) {
  const normalizedPatch = normalizeUserNamebasePayload(patch, {allowEmpty: false});
  return createNamebaseStoreCommand({
    label: `${label} ${id}`,
    affected: objectAffected("namebase", id),
    applyEdit(map) {
      return applyUserNamebasePayload(map, id, normalizedPatch, {
        id,
        updated: true
      });
    },
    isNoop(map) {
      const base = findUserNamebase(map, id);
      if (!base) return true;
      if (normalizedPatch.name !== null && String(base.name || base.id || "").trim() !== normalizedPatch.name) return false;
      if (normalizedPatch.source !== null && normalizeSourceText(base.source || []).join("\n") !== normalizedPatch.source.join("\n")) return false;
      if (normalizedPatch.options !== null && optionsSnapshotKey(normalizeOptionsSnapshot(base)) !== optionsSnapshotKey(normalizedPatch.options)) return false;
      return true;
    }
  });
}

export function createClearUserNamebasesCommand({label = "清空用户名称库"} = {}) {
  return createNamebaseStoreCommand({
    label,
    affected: systemAffected("namebase-clear", [{kind: "namebase", id: "all"}]),
    applyEdit(map) {
      return clearUserNamebases(map);
    },
    isNoop(map) {
      return !(map?.namebases?.bases || []).some(base => base?.builtin !== true);
    }
  });
}

export function createDeleteUserNamebaseCommand(id, {name = "", label = "删除名称库"} = {}) {
  return createNamebaseStoreCommand({
    label: `${label} ${name || id}`,
    affected: objectAffected("namebase", id),
    applyEdit(map) {
      return deleteUserNamebase(map, id);
    },
    isNoop(map) {
      return !findUserNamebase(map, id);
    }
  });
}

function createNamebaseStoreCommand({label, affected, resolveAffected = null, applyEdit, isNoop = () => false}) {
  let before = null;
  let after = null;
  let hasBefore = false;
  let result = null;

  return {
    label,
    domain: "namebase",
    effects: {
      ...NAMEBASE_EDIT_EFFECTS,
      affected: Array.isArray(affected) ? affected : systemAffected("namebase-store")
    },
    apply(context) {
      const map = context.map;
      if (!map) throw new Error("当前没有可编辑名称库的地图");
      if (after) {
        restoreNamebases(map, after);
        return;
      }
      before = snapshotNamebases(map);
      hasBefore = true;
      result = applyEdit(map);
      after = snapshotNamebases(map);
      const resolvedAffected = resolveAffected?.(result);
      if (Array.isArray(resolvedAffected) && resolvedAffected.length) this.effects.affected = resolvedAffected;
    },
    revert(context) {
      if (!hasBefore) throw new Error("缺少可撤销的名称库快照");
      restoreNamebases(context.map, before);
    },
    isNoop(context) {
      return isNoop(context.map);
    },
    getResult() {
      return result;
    }
  };
}

function snapshotNamebases(map) {
  return map.namebases ? JSON.parse(JSON.stringify(map.namebases)) : null;
}

function restoreNamebases(map, snapshot) {
  if (!map) return;
  if (!snapshot) {
    delete map.namebases;
    return;
  }
  map.namebases = JSON.parse(JSON.stringify(snapshot));
}

function findUserNamebase(map, id) {
  return (map?.namebases?.bases || []).find(base => base?.id === id && base?.builtin !== true) || null;
}

function normalizeSourceText(source) {
  return Array.isArray(source)
    ? source.map(value => String(value || "").trim()).filter(Boolean)
    : String(source || "").split(/[,，\n\r]+/gu).map(value => value.trim()).filter(Boolean);
}

function normalizeOptionsSnapshot(options = {}) {
  const minLength = Math.max(1, Math.min(12, Math.floor(Number(options.minLength ?? options.min ?? 1) || 1)));
  const maxLength = Math.max(minLength, Math.min(12, Math.floor(Number(options.maxLength ?? options.max ?? minLength) || minLength)));
  const duplicateChars = [...new Set(Array.from(String(options.duplicateChars ?? options.d ?? "").replace(/\s+/gu, "")))].slice(0, 24).join("");
  return {minLength, maxLength, duplicateChars};
}

function optionsSnapshotKey(options) {
  return `${options.minLength}|${options.maxLength}|${options.duplicateChars}`;
}

function normalizeUserNamebasePayload(payload, {allowEmpty}) {
  if (payload === null || payload === undefined) {
    if (allowEmpty) return {name: null, source: null, options: null};
    throw new Error("名称库更新参数不能为空");
  }
  if (typeof payload !== "object" || Array.isArray(payload)) throw new Error("名称库参数必须是对象");
  const name = payload.name === undefined ? null : String(payload.name || "").trim();
  if (name !== null && !name) throw new Error("名称库名称不能为空");
  const source = payload.source === undefined && payload.sourceText === undefined ? null : normalizeSourceText(payload.source ?? payload.sourceText);
  if (source !== null && !source.length) throw new Error("名称库至少需要一个样本");
  const hasOptions = ["minLength", "min", "maxLength", "max", "duplicateChars", "d"].some(key => payload[key] !== undefined) || payload.options !== undefined;
  const optionSource = payload.options && typeof payload.options === "object"
    ? {...payload.options, ...Object.fromEntries(["minLength", "min", "maxLength", "max", "duplicateChars", "d"].filter(key => payload[key] !== undefined).map(key => [key, payload[key]]))}
    : payload;
  const options = hasOptions ? normalizeOptionsSnapshot(optionSource) : null;
  if (!allowEmpty && name === null && source === null && options === null) throw new Error("名称库更新参数不能为空");
  return {name, source, options};
}

function applyUserNamebasePayload(map, id, payload, initialResult) {
  let result = {...initialResult};
  if (payload.name !== null) {
    const renamed = renameUserNamebase(map, id, payload.name);
    result = {...result, ...renamed, id, name: renamed.name || result.name || id};
  }
  if (payload.source !== null) {
    const updatedSource = updateUserNamebaseSource(map, id, payload.source);
    result = {...result, ...updatedSource, id, samples: updatedSource.samples};
  }
  if (payload.options !== null) {
    const updatedOptions = updateUserNamebaseOptions(map, id, payload.options);
    result = {
      ...result,
      ...updatedOptions,
      id,
      minLength: updatedOptions.minLength,
      maxLength: updatedOptions.maxLength,
      duplicateChars: updatedOptions.duplicateChars
    };
  }
  return result;
}
