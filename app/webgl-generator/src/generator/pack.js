export function buildPack(grid, features) {
  const gridToPack = [];
  const cells = {
    g: [],
    f: [],
    h: [],
    temp: [],
    prec: [],
    biome: [],
    culture: [],
    religion: [],
    state: [],
    province: [],
    region: [],
    pop: [],
    burg: [],
    type: []
  };

  for (let gridCell = 0; gridCell < grid.points.length; gridCell++) {
    const packCell = cells.g.length;
    const featureId = grid.cells.f[gridCell] ?? -1;
    const feature = features.features[featureId];
    gridToPack[gridCell] = packCell;
    cells.g.push(gridCell);
    cells.f.push(featureId);
    cells.h.push(grid.cells.h[gridCell]);
    cells.temp.push(grid.cells.temp?.[gridCell] ?? 0);
    cells.prec.push(grid.cells.prec?.[gridCell] ?? 0);
    cells.biome.push(grid.cells.biome?.[gridCell] ?? 0);
    cells.culture.push(grid.cells.culture?.[gridCell] ?? 0);
    cells.religion.push(grid.cells.religion?.[gridCell] ?? 0);
    cells.state.push(grid.cells.state?.[gridCell] ?? -1);
    cells.province.push(grid.cells.province?.[gridCell] ?? -1);
    cells.region.push(grid.cells.region?.[gridCell] ?? -1);
    cells.pop.push(grid.cells.pop?.[gridCell] ?? 0);
    cells.burg.push(grid.cells.burg?.[gridCell] ?? -1);
    cells.type.push(feature?.type || "unknown");
  }

  grid.cells.pack = gridToPack;

  return {
    cells,
    vertices: {
      p: grid.vertices.p
    },
    metadata: {
      cells: cells.g.length,
      vertices: grid.vertices.p.length,
      mapping: "one-grid-cell-to-one-pack-cell",
      semanticFields: ["gridCell", "feature", "height", "type", "culture", "religion", "state", "province", "region", "population", "burg"]
    }
  };
}
