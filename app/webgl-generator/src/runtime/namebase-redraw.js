import {createChineseNameGenerator} from "../generator/names.js";

export function createRenameGenerator(map, kind, drawSeed, options = {}) {
  const seed = `${map?.metadata?.seed || map?.options?.seed || "map"}|explicit-${kind}-rename|${map?.metadata?.checksum || ""}`;
  return createChineseNameGenerator(drawSeed ? `${seed}|${drawSeed}` : seed, {namebases: map?.namebases, ...options});
}

// 显式换名可重抽，规则批量应用仍沿用原来的确定性结果。
export function chooseRenameCandidate(current, drawSeed, generate) {
  for (let attempt = 0; attempt < (drawSeed ? 12 : 1); attempt++) {
    const candidate = generate();
    if (candidate && candidate !== current) return candidate;
  }
  return "";
}

export function collectRenameChanges(candidates) {
  return [...candidates].filter(Boolean);
}

export async function prepareRenameChanges(candidates, checkpoint) {
  const changes = [];
  for (const candidate of candidates) {
    if (candidate) changes.push(candidate);
    const wait = checkpoint();
    if (wait) await wait;
  }
  return changes;
}
