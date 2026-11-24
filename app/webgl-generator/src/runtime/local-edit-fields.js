// 旧地图可能缺少整个可选分区。记录最早缺失的祖先，撤销时才能恢复原结构。
export function localFieldPaths(map, requested) {
  const paths = new Set();
  for (const path of requested) {
    let owner = map;
    const parts = [];
    for (const key of path.split(".")) {
      parts.push(key);
      if (owner?.[key] == null) break;
      owner = owner[key];
    }
    paths.add(parts.join("."));
  }
  return [...paths];
}

export function captureLocalFields(map, paths) {
  return paths.map(path => {
    const [owner, key] = fieldOwner(map, path);
    return {path, exists: Object.hasOwn(owner, key), value: structuredClone(owner[key])};
  });
}

export function restoreLocalFields(map, fields) {
  for (const {path, exists, value} of fields) {
    const [owner, key] = fieldOwner(map, path);
    if (exists) owner[key] = structuredClone(value);
    else delete owner[key];
  }
}

function fieldOwner(map, path) {
  const parts = path.split(".");
  const key = parts.pop();
  let owner = map;
  for (const part of parts) owner = owner[part];
  return [owner, key];
}
