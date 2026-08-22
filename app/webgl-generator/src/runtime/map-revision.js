let fallbackIdentitySequence = 0;

export class MapRevisionTracker {
  constructor({identityFactory = createOpaqueIdentity} = {}) {
    this.identityFactory = identityFactory;
    this.mapIdentity = null;
    this.mapRevision = 0;
    this.topologyRevision = 0;
    this.cursorSecret = createOpaqueIdentity();
  }

  replaceMap(mapIdentity = null) {
    this.mapIdentity = mapIdentity === null || mapIdentity === undefined
      ? String(this.identityFactory())
      : String(mapIdentity);
    if (!this.mapIdentity) throw new TypeError("map identity 不能为空");
    this.mapRevision = 0;
    this.topologyRevision = 0;
    this.cursorSecret = createOpaqueIdentity();
    return this.getSnapshot();
  }

  advance() {
    if (!this.mapIdentity) this.replaceMap();
    this.mapRevision += 1;
    // 旧 command 尚未提供精确 topology write set；迁移期随 canonical revision
    // 保守推进，确保任何真实 topology 变化都不会复用陈旧 renderer source。
    this.topologyRevision += 1;
    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      mapIdentity: this.mapIdentity,
      mapRevision: this.mapRevision
    };
  }

  getCoreSnapshot() {
    return {
      ...this.getSnapshot(),
      topologyRevision: this.topologyRevision
    };
  }

  createSnapshot() {
    return {
      ...this.getCoreSnapshot(),
      cursorSecret: this.cursorSecret
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return this.getSnapshot();
    const identity = snapshot.mapIdentity;
    const revision = Number(snapshot.mapRevision);
    const topologyRevision = Number(snapshot.topologyRevision);
    this.mapIdentity = identity === null || identity === undefined ? null : String(identity);
    this.mapRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
    this.topologyRevision = Number.isSafeInteger(topologyRevision) && topologyRevision >= 0 ? topologyRevision : 0;
    if (typeof snapshot.cursorSecret === "string" && snapshot.cursorSecret) this.cursorSecret = snapshot.cursorSecret;
    return this.getSnapshot();
  }

  signCursor(value) {
    return fingerprint(`${this.cursorSecret}:${String(value)}`);
  }
}

function createOpaqueIdentity() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackIdentitySequence += 1;
  const random = Math.random().toString(36).slice(2);
  return `map-${Date.now().toString(36)}-${fallbackIdentitySequence.toString(36)}-${random}`;
}

function fingerprint(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
