export function buildApiMethodCoverage(methods, methodMetadata, runtimeApi) {
  const runtimeMethods = collectRuntimeApiMethods(runtimeApi);
  const namespaces = {};
  const missing = [];
  const extra = [];
  const runtimeMissing = [];
  const runtimeExtra = [];
  let methodCount = 0;
  let documentedCount = 0;
  let runtimeCount = 0;

  for (const [namespace, methodNames] of Object.entries(methods)) {
    const metadataNames = Object.keys(methodMetadata[namespace] || {});
    const runtimeNames = runtimeMethods[namespace] || [];
    const methodSet = new Set(methodNames);
    const namespaceMissing = methodNames.filter(method => !metadataNames.includes(method));
    const namespaceExtra = metadataNames.filter(method => !methodSet.has(method));
    const namespaceRuntimeMissing = methodNames.filter(method => !runtimeNames.includes(method));
    const namespaceRuntimeExtra = runtimeNames.filter(method => !methodSet.has(method));
    const namespaceDocumented = methodNames.length - namespaceMissing.length;
    methodCount += methodNames.length;
    documentedCount += namespaceDocumented;
    runtimeCount += runtimeNames.length;
    missing.push(...namespaceMissing.map(method => `${namespace}.${method}`));
    extra.push(...namespaceExtra.map(method => `${namespace}.${method}`));
    runtimeMissing.push(...namespaceRuntimeMissing.map(method => `${namespace}.${method}`));
    runtimeExtra.push(...namespaceRuntimeExtra.map(method => `${namespace}.${method}`));
    namespaces[namespace] = {
      complete: namespaceMissing.length === 0 && namespaceExtra.length === 0 && namespaceRuntimeMissing.length === 0 && namespaceRuntimeExtra.length === 0,
      methods: methodNames.length,
      documented: namespaceDocumented,
      metadata: metadataNames.length,
      runtime: runtimeNames.length,
      missing: namespaceMissing,
      extra: namespaceExtra,
      runtimeMissing: namespaceRuntimeMissing,
      runtimeExtra: namespaceRuntimeExtra
    };
  }

  for (const namespace of Object.keys(methodMetadata)) {
    if (Object.prototype.hasOwnProperty.call(methods, namespace)) continue;
    extra.push(...Object.keys(methodMetadata[namespace] || {}).map(method => `${namespace}.${method}`));
  }
  for (const namespace of Object.keys(runtimeMethods)) {
    if (Object.prototype.hasOwnProperty.call(methods, namespace)) continue;
    const names = runtimeMethods[namespace] || [];
    runtimeCount += names.length;
    runtimeExtra.push(...names.map(method => `${namespace}.${method}`));
  }

  return {
    complete: missing.length === 0 && extra.length === 0 && runtimeMissing.length === 0 && runtimeExtra.length === 0,
    methods: methodCount,
    documented: documentedCount,
    metadata: Object.values(methodMetadata).reduce((sum, namespaceMetadata) => sum + Object.keys(namespaceMetadata || {}).length, 0),
    runtime: runtimeCount,
    missing,
    extra,
    runtimeMissing,
    runtimeExtra,
    namespaces
  };
}

export function collectRuntimeApiMethods(api) {
  const methods = {};
  for (const [namespace, value] of Object.entries(api || {})) {
    if (!value || typeof value !== "object") continue;
    const names = collectCallablePaths(value);
    if (names.length) methods[namespace] = names;
  }
  return methods;
}

function collectCallablePaths(value, prefix = "") {
  const names = [];
  for (const [key, item] of Object.entries(value || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "function") names.push(path);
    else if (item && typeof item === "object" && !Array.isArray(item)) names.push(...collectCallablePaths(item, path));
  }
  return names.sort();
}
