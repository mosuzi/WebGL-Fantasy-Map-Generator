export function createRandom(seed) {
  const alea = createAlea(seed);

  return {
    seed,
    next() {
      return alea();
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

function createAlea(seed) {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let c = 1;
  let mash = createMash();
  const args = [seed || +new Date()];

  s0 = mash(" ");
  s1 = mash(" ");
  s2 = mash(" ");

  for (const arg of args) {
    s0 -= mash(arg);
    if (s0 < 0) s0 += 1;
    s1 -= mash(arg);
    if (s1 < 0) s1 += 1;
    s2 -= mash(arg);
    if (s2 < 0) s2 += 1;
  }

  mash = null;

  return function random() {
    const t = 2091639 * s0 + c * 2.3283064365386963e-10;
    s0 = s1;
    s1 = s2;
    s2 = t - (c = t | 0);
    return s2;
  };
}

function createMash() {
  let n = 0xefc8249d;
  return data => {
    const text = data.toString();
    for (let index = 0; index < text.length; index++) {
      n += text.charCodeAt(index);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    return (n >>> 0) * 2.3283064365386963e-10;
  };
}
