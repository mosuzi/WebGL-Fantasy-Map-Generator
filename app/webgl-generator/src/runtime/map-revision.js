let fallbackIdentitySequence = 0;

export class MapRevisionTracker {
  constructor({identityFactory = createOpaqueIdentity} = {}) {
    this.identityFactory = identityFactory;
    this.mapIdentity = null;
    this.mapRevision = 0;
    this.cursorSecret = createOpaqueIdentity();
  }

  replaceMap() {
    this.mapIdentity = String(this.identityFactory());
    this.mapRevision = 0;
    this.cursorSecret = createOpaqueIdentity();
    return this.getSnapshot();
  }

  advance() {
    if (!this.mapIdentity) this.replaceMap();
    this.mapRevision += 1;
    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      mapIdentity: this.mapIdentity,
      mapRevision: this.mapRevision
    };
  }

  createSnapshot() {
    return {
      ...this.getSnapshot(),
      cursorSecret: this.cursorSecret
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return this.getSnapshot();
    const identity = snapshot.mapIdentity;
    const revision = Number(snapshot.mapRevision);
    this.mapIdentity = identity === null || identity === undefined ? null : String(identity);
    this.mapRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
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
