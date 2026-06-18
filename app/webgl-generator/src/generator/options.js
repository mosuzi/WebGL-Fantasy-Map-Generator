export const DEFAULT_OPTIONS = {
  seed: "stage-2-1",
  randomSeed: false,
  heightmapTemplate: "continents",
  cellsTarget: 10000,
  graphWidth: 1440,
  graphHeight: 960
};

const HEIGHTMAP_TEMPLATES = new Set(["continents", "mediterranean", "highIsland", "lowIsland", "peninsula", "pangea", "archipelago"]);

export function normalizeOptions(input = {}) {
  return {
    seed: String(input.seed || DEFAULT_OPTIONS.seed).trim() || DEFAULT_OPTIONS.seed,
    randomSeed: Boolean(input.randomSeed),
    heightmapTemplate: HEIGHTMAP_TEMPLATES.has(input.heightmapTemplate) ? input.heightmapTemplate : DEFAULT_OPTIONS.heightmapTemplate,
    cellsTarget: clampInteger(input.cellsTarget, 1000, 100000, DEFAULT_OPTIONS.cellsTarget),
    graphWidth: clampInteger(input.graphWidth, 640, 4096, DEFAULT_OPTIONS.graphWidth),
    graphHeight: clampInteger(input.graphHeight, 480, 4096, DEFAULT_OPTIONS.graphHeight)
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
