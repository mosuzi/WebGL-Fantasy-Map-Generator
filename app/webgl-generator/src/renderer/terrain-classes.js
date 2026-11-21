const entries = [
  ["water", "水域", "#749bb7"],
  ["plain", "平原", "#a9c78c"],
  ["hills", "丘陵", "#8f9c63"],
  ["plateau", "高原", "#c89d84"],
  ["mountains", "山地", "#856e62"],
  ["canyon", "峡谷", "#ac674e"],
  ["desert", "沙漠", "#e7cb89"],
  ["marsh", "沼泽", "#689e95"],
  ["ice", "冰原", "#dcf3fc"]
];

export const TERRAIN_CLASSES = Object.freeze(entries.map(([key, label, hex], id) => {
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  return Object.freeze({key, label, id, color: Object.freeze([...rgb, 1])});
}));
export const TERRAIN_ID = Object.freeze(Object.fromEntries(TERRAIN_CLASSES.map(({key, id}) => [key, id])));
export const GLACIER_BIOME = 11;

export function terrainClassAt(grid, cell) {
  const cells = grid?.cells;
  const rawHeight = cells?.h?.[cell];
  if (!(rawHeight >= 20)) return TERRAIN_ID.water;
  const height = Math.round(rawHeight);
  const biome = cells.biome?.[cell];
  if (biome === GLACIER_BIOME) return TERRAIN_ID.ice;
  if (biome === 1 || biome === 2) return TERRAIN_ID.desert;
  if (biome === 12) return TERRAIN_ID.marsh;

  const neighbors = cells.c?.[cell] || [];
  let low = height, high = height, outlets = 0, walls = 0;
  for (const neighbor of neighbors) {
    if (!(cells.h[neighbor] >= 20)) continue;
    const h = Math.round(cells.h[neighbor]);
    low = Math.min(low, h);
    high = Math.max(high, h);
    if (h <= height + 2) outlets++;
    if (h >= height + 7) walls++;
  }
  // 同时要求谷底延伸和两侧谷壁，避免把单向坡面或封闭凹坑识别为峡谷。
  if (walls >= 2 && outlets >= 2 && hasOpposingWalls(grid, cell, neighbors, height + 7)) return TERRAIN_ID.canyon;
  const relief = high - low;
  if (height >= 58 && relief <= 10) return TERRAIN_ID.plateau;
  if (height >= 72 || relief >= 23) return TERRAIN_ID.mountains;
  if (height >= 43 || relief >= 9) return TERRAIN_ID.hills;
  return TERRAIN_ID.plain;
}

function hasOpposingWalls({points, cells}, cell, neighbors, minimum) {
  const center = points?.[cell];
  if (!center) return false;
  for (let i = 0; i < neighbors.length; i++) {
    const a = neighbors[i];
    if (Math.round(cells.h[a]) < minimum || !points[a]) continue;
    const ax = points[a][0] - center[0], ay = points[a][1] - center[1];
    for (let j = i + 1; j < neighbors.length; j++) {
      const b = neighbors[j];
      if (Math.round(cells.h[b]) < minimum || !points[b]) continue;
      const bx = points[b][0] - center[0], by = points[b][1] - center[1];
      const dot = ax * bx + ay * by;
      // 夹角至少 120°。
      if (dot < 0 && 4 * dot * dot >= (ax * ax + ay * ay) * (bx * bx + by * by)) return true;
    }
  }
  return false;
}
