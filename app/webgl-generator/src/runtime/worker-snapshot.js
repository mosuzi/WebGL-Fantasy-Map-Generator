export async function createStagedWorkerSnapshot(value, options = {}) {
  const signal = options.signal || null;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const sliceBytes = Math.max(16 * 1024, Number(options.sliceBytes) || 256 * 1024);
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const seen = new Map();
  const transferables = new Set();
  let deadline = now() + budgetMs;

  const checkpoint = async (force = false) => {
    if (signal?.aborted) throw new DOMException(String(signal.reason || "Worker 快照已取消"), "AbortError");
    if (!force && now() < deadline) return;
    await yieldToMain();
    if (signal?.aborted) throw new DOMException(String(signal.reason || "Worker 快照已取消"), "AbortError");
    deadline = now() + budgetMs;
  };

  const clone = async source => {
    if (source === null || typeof source !== "object") return source;
    if (seen.has(source)) return seen.get(source);
    await checkpoint();

    if (ArrayBuffer.isView(source)) {
      const buffer = await clone(source.buffer);
      if (source instanceof DataView) {
        const view = new DataView(buffer, source.byteOffset, source.byteLength);
        seen.set(source, view);
        return view;
      }
      const output = new source.constructor(buffer, source.byteOffset, source.length);
      seen.set(source, output);
      return output;
    }
    if (source instanceof ArrayBuffer) {
      const output = await cloneBuffer(source, sliceBytes, checkpoint);
      seen.set(source, output);
      transferables.add(output);
      return output;
    }
    if (source instanceof Date) {
      const output = new Date(source.getTime());
      seen.set(source, output);
      return output;
    }
    if (source instanceof Map) {
      const output = new Map();
      seen.set(source, output);
      for (const [key, item] of source) output.set(await clone(key), await clone(item));
      return output;
    }
    if (source instanceof Set) {
      const output = new Set();
      seen.set(source, output);
      for (const item of source) output.add(await clone(item));
      return output;
    }

    const output = Array.isArray(source) ? new Array(source.length) : {};
    seen.set(source, output);
    for (const key of Object.keys(source)) {
      output[key] = await clone(source[key]);
      await checkpoint();
    }
    return output;
  };

  const snapshot = await clone(value);
  await checkpoint(true);
  return {snapshot, transferables: [...transferables]};
}

export function collectWorkerTransferables(value) {
  const buffers = new Set();
  const seen = new WeakSet();
  visit(value);
  return [...buffers];

  function visit(item) {
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (item instanceof ArrayBuffer) {
      buffers.add(item);
      return;
    }
    if (ArrayBuffer.isView(item)) {
      buffers.add(item.buffer);
      return;
    }
    if (item instanceof Map) {
      for (const [key, value] of item) {
        visit(key);
        visit(value);
      }
      return;
    }
    if (item instanceof Set) {
      for (const value of item) visit(value);
      return;
    }
    for (const value of Object.values(item)) visit(value);
  }
}

async function cloneBuffer(source, sliceBytes, checkpoint) {
  const output = new ArrayBuffer(source.byteLength);
  const sourceBytes = new Uint8Array(source);
  const outputBytes = new Uint8Array(output);
  for (let offset = 0; offset < sourceBytes.length; offset += sliceBytes) {
    outputBytes.set(sourceBytes.subarray(offset, Math.min(sourceBytes.length, offset + sliceBytes)), offset);
    await checkpoint();
  }
  return output;
}

function defaultYield() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
