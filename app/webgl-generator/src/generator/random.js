export function createRandom(seed) {
  let state = hashSeed(seed);

  return {
    seed,
    next() {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) {
      return min + this.next() * (max - min);
    },
    integer(min, max) {
      return Math.floor(this.range(min, max + 1));
    }
  };
}

export function createRandomSeed(prefix = "map") {
  const timestamp = Date.now().toString(36);
  const entropy = Math.floor(Math.random() * 0xffffffff).toString(36).padStart(7, "0");
  return `${prefix}-${timestamp}-${entropy}`;
}

export function stableHash(input) {
  return hashSeed(input).toString(16).padStart(8, "0");
}

function hashSeed(seed) {
  const text = String(seed || "seed");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
