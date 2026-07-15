const FIELD_BY_KIND = Object.freeze({
  height: "h",
  state: "state",
  province: "province",
  culture: "culture",
  religion: "religion",
  biome: "biome"
});

export function restoreCanvasToolStrokePreview(map, kind, stroke) {
  const field = FIELD_BY_KIND[kind];
  const gridValues = map?.grid?.cells?.[field];
  const packValues = map?.pack?.cells?.[field];
  if (!field || !gridValues || !stroke?.originals?.size) return {restoredGridCells: 0, restoredPackCells: 0};

  let restoredGridCells = 0;
  let restoredPackCells = 0;
  for (const [gridCell, original] of stroke.originals) {
    if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= gridValues.length) continue;
    const before = kind === "culture" || kind === "religion" || kind === "biome" ? Number(original?.gridBefore) || 0 : Number(original) || 0;
    gridValues[gridCell] = before;
    restoredGridCells++;

    if (Array.isArray(original?.packBefore)) {
      for (const entry of original.packBefore) {
        if (!Number.isInteger(entry?.packCell) || entry.packCell < 0 || entry.packCell >= (packValues?.length || 0)) continue;
        packValues[entry.packCell] = Number(entry.before) || 0;
        restoredPackCells++;
      }
      continue;
    }
    if (!packValues) continue;
    for (let packCell = 0; packCell < (map.pack?.cells?.g?.length || 0); packCell++) {
      if (Number(map.pack.cells.g[packCell]) !== gridCell) continue;
      if (kind !== "height" && kind !== "biome" && Number(map.pack.cells.h?.[packCell]) < 20) continue;
      packValues[packCell] = before;
      restoredPackCells++;
    }
  }
  return {restoredGridCells, restoredPackCells};
}
