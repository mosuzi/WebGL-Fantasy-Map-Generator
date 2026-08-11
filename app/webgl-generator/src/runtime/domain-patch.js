export const DOMAIN_PATCH_VERSION = 1;

export function createDomainPatch(domain, writeSet, source) {
  const operations = normalizeWriteSet(writeSet).map(path => {
    const captured = readPath(source, path);
    return {path, exists: captured.exists, value: captured.value};
  });
  return {version: DOMAIN_PATCH_VERSION, domain: String(domain || ""), writeSet: operations.map(item => item.path.join(".")), operations};
}

export function createDomainPatchCommand({patch, policy, label, historyDomain, effects, result}) {
  assertDomainPatch(patch);
  assertDomainPatchPolicy(patch, policy);
  let applied = false;
  let reverse = null;
  return {
    label: String(label || `应用 ${patch.domain} Worker 补丁`),
    domain: String(historyDomain || `worker-${patch.domain}`),
    effects,
    apply(context) {
      reverse = swapPatch(context.map, patch, reverse);
      applied = true;
    },
    revert(context) {
      if (!applied || !reverse) throw new Error("Worker 补丁缺少可撤销状态");
      reverse = swapPatch(context.map, reverse, patch);
    },
    isNoop() {
      return patch.operations.length === 0;
    },
    getResult() {
      return result;
    }
  };
}

export function assertDomainPatch(patch) {
  if (!patch || patch.version !== DOMAIN_PATCH_VERSION || !patch.domain || !Array.isArray(patch.writeSet) || !Array.isArray(patch.operations)) {
    throw patchError("worker_patch_invalid", "Worker 领域补丁无效");
  }
  const seen = new Set();
  for (const operation of patch.operations) {
    if (Object.prototype.hasOwnProperty.call(operation || {}, "prune")) {
      throw patchError("worker_patch_invalid", "Worker 补丁不得携带内部 prune 状态");
    }
    if (!Array.isArray(operation?.path) || !operation.path.length || operation.path.some(part => typeof part !== "string" || !part || part.includes("."))) {
      throw patchError("worker_patch_invalid", "Worker 补丁路径无效");
    }
    if (typeof operation.exists !== "boolean") throw patchError("worker_patch_invalid", "Worker 补丁 exists 必须为布尔值");
    if (operation.path.some(part => ["__proto__", "prototype", "constructor"].includes(part))) {
      throw patchError("worker_patch_invalid", "Worker 补丁路径包含禁止的原型字段");
    }
    const key = operation.path.join(".");
    if (seen.has(key)) throw patchError("worker_patch_invalid", `Worker 补丁路径重复：${key}`);
    seen.add(key);
  }
  const sortedPaths = [...seen].sort();
  for (let index = 1; index < sortedPaths.length; index++) {
    if (sortedPaths[index].startsWith(`${sortedPaths[index - 1]}.`)) {
      throw patchError("worker_patch_invalid", `Worker 补丁路径相互覆盖：${sortedPaths[index]}`);
    }
  }
  if (patch.writeSet.length !== seen.size
    || patch.writeSet.some(path => typeof path !== "string" || !seen.has(path))
    || new Set(patch.writeSet).size !== patch.writeSet.length) {
    throw patchError("worker_patch_invalid", "Worker 补丁 writeSet 与 operations 不一致");
  }
  return patch;
}

export function assertDomainPatchPolicy(patch, policy) {
  if (!policy || policy.domain !== patch.domain || !Array.isArray(policy.allowedPaths)) {
    throw patchError("worker_patch_policy_missing", `Worker 补丁缺少 ${patch.domain} 主线程写集策略`);
  }
  const allowed = new Set(policy.allowedPaths.map(normalizePolicyPath));
  const forbidden = (policy.forbiddenPaths || []).map(normalizePolicyPath);
  for (const operation of patch.operations) {
    const key = operation.path.join(".");
    const permitted = allowed.has(key);
    if (!permitted) throw patchError("worker_patch_write_set_violation", `Worker 补丁越过 ${patch.domain} 写集：${key}`);
    const denied = forbidden.find(root => key === root || key.startsWith(`${root}.`) || root.startsWith(`${key}.`));
    if (denied) throw patchError("worker_patch_write_set_violation", `Worker 补丁触碰 ${patch.domain} 禁区：${key} -> ${denied}`);
  }
  return true;
}

function swapPatch(map, forward, priorReverse) {
  for (const operation of forward.operations) preflightWritePath(map, operation);
  const reverseOperations = forward.operations.map(operation => {
    const current = readPath(map, operation.path);
    return {path: operation.path, exists: current.exists, value: current.value, prune: []};
  });
  let applied = 0;
  try {
    for (let index = 0; index < forward.operations.length; index++) {
      reverseOperations[index].prune = writePath(map, forward.operations[index]);
      applied = index + 1;
    }
    pruneEmptyPaths(map, forward.operations.flatMap(operation => operation.prune || []));
  } catch (error) {
    try {
      for (let index = applied - 1; index >= 0; index--) writePath(map, reverseOperations[index]);
    } catch (rollbackError) {
      const combined = patchError("worker_patch_rollback_failed", `Worker 补丁应用失败且回滚失败：${error?.message || error}`);
      combined.cause = rollbackError;
      throw combined;
    }
    throw error;
  }
  return {
    version: DOMAIN_PATCH_VERSION,
    domain: forward.domain,
    writeSet: reverseOperations.map(item => item.path.join(".")),
    operations: reverseOperations
  };
}

function readPath(root, path) {
  let owner = root;
  for (let index = 0; index < path.length - 1; index++) {
    if (!owner || !Object.prototype.hasOwnProperty.call(owner, path[index])) return {exists: false, value: undefined};
    owner = owner[path[index]];
  }
  const key = path.at(-1);
  return {
    exists: Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key)),
    value: owner?.[key]
  };
}

function writePath(root, operation) {
  let owner = root;
  const createdPaths = [];
  try {
    for (let index = 0; index < operation.path.length - 1; index++) {
      const key = operation.path[index];
      if (!Object.prototype.hasOwnProperty.call(owner, key)) {
        if (!operation.exists) return [];
        defineOwnValue(owner, key, {});
        createdPaths.push(operation.path.slice(0, index + 1));
      } else if (!owner[key] || typeof owner[key] !== "object") {
        throw patchError("worker_patch_parent_invalid", `Worker 补丁父路径不是对象：${operation.path.slice(0, index + 1).join(".")}`);
      }
      owner = owner[key];
    }
    const key = operation.path.at(-1);
    if (operation.exists) defineOwnValue(owner, key, operation.value);
    else delete owner[key];
    pruneEmptyPaths(root, operation.prune);
    return createdPaths;
  } catch (error) {
    pruneEmptyPaths(root, createdPaths);
    throw error;
  }
}

function preflightWritePath(root, operation) {
  let owner = root;
  for (let index = 0; index < operation.path.length - 1; index++) {
    const key = operation.path[index];
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (!descriptor) {
      if (!operation.exists) return true;
      if (!Object.isExtensible(owner)) throw patchError("worker_patch_target_unsafe", `Worker 补丁父路径不可扩展：${operation.path.slice(0, index).join(".") || "<root>"}`);
      owner = {};
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      throw patchError("worker_patch_target_unsafe", `Worker 补丁拒绝访问器父路径：${operation.path.slice(0, index + 1).join(".")}`);
    }
    owner = descriptor.value;
    if (!owner || typeof owner !== "object") {
      throw patchError("worker_patch_parent_invalid", `Worker 补丁父路径不是对象：${operation.path.slice(0, index + 1).join(".")}`);
    }
  }
  const key = operation.path.at(-1);
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (!descriptor) {
    if (operation.exists && !Object.isExtensible(owner)) {
      throw patchError("worker_patch_target_unsafe", `Worker 补丁目标不可扩展：${operation.path.join(".")}`);
    }
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw patchError("worker_patch_target_unsafe", `Worker 补丁拒绝访问器目标：${operation.path.join(".")}`);
  }
  if (operation.exists && descriptor.writable === false) {
    throw patchError("worker_patch_target_unsafe", `Worker 补丁目标只读：${operation.path.join(".")}`);
  }
  if (!operation.exists && descriptor.configurable === false) {
    throw patchError("worker_patch_target_unsafe", `Worker 补丁目标不可删除：${operation.path.join(".")}`);
  }
  return true;
}

function defineOwnValue(owner, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (descriptor) {
    Object.defineProperty(owner, key, {...descriptor, value});
    return;
  }
  Object.defineProperty(owner, key, {value, writable: true, enumerable: true, configurable: true});
}

function pruneEmptyPaths(root, paths = []) {
  for (const path of [...paths].sort((left, right) => right.length - left.length)) {
    let owner = root;
    for (let index = 0; index < path.length - 1; index++) owner = owner?.[path[index]];
    const key = path.at(-1);
    const value = owner?.[key];
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) delete owner[key];
  }
}

function normalizeWriteSet(writeSet) {
  const paths = (writeSet || []).map(path => Array.isArray(path) ? [...path] : String(path || "").split(".").filter(Boolean));
  paths.sort((left, right) => left.join(".").localeCompare(right.join(".")));
  const accepted = new Set();
  const result = [];
  for (const path of paths) {
    const key = path.join(".");
    if (accepted.has(key)) continue;
    let parent = "";
    let covered = false;
    for (let index = 0; index < path.length - 1; index++) {
      parent = parent ? `${parent}.${path[index]}` : path[index];
      if (accepted.has(parent)) {
        covered = true;
        break;
      }
    }
    if (covered) continue;
    accepted.add(key);
    result.push(path);
  }
  return result;
}

function patchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePolicyPath(path) {
  const key = Array.isArray(path) ? path.join(".") : String(path || "").trim();
  if (!key) throw patchError("worker_patch_policy_invalid", "Worker 补丁策略包含空路径");
  return key;
}
