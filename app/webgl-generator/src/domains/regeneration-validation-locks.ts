type UnknownRecord = Record<string, unknown>;

/**
 * Worker 结果校验只能把显式锁用于“跳过本次生成硬门”。锁记录和锁对象本身
 * 都可能损坏，因此这里故意不调用运行时锁解析器，也不验证对象内部字段。
 */
export function regenerationLockedIds(sourceMapValue: unknown, kind: string): ReadonlySet<string> {
  if (!isPlainRecord(sourceMapValue) || !isPlainRecord(sourceMapValue.regenerationLocks)) return new Set();
  const entries = Array.isArray(sourceMapValue.regenerationLocks.entries) ? sourceMapValue.regenerationLocks.entries : [];
  const ids = new Set<string>();
  for (const value of entries) {
    if (!isPlainRecord(value) || value.kind !== kind) continue;
    const id = value.id;
    if (typeof id === "string" && id.length || typeof id === "number" && Number.isFinite(id)) ids.add(String(id));
  }
  return ids;
}

export function isRegenerationLocked(ids: ReadonlySet<string>, ...candidates: unknown[]): boolean {
  return candidates.some(candidate => candidate !== undefined && candidate !== null && ids.has(String(candidate)));
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
