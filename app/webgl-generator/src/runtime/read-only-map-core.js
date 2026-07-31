export function buildMapSummary(map, context = {}) {
  if (!map) return {ready: false};
  return {
    ready: true,
    ...(context.revision || {}),
    seed: map.metadata?.seed || map.options?.seed || context.seed || "",
    checksum: map.metadata?.checksum || map.summary?.checksum || "",
    generatedAt: map.metadata?.generatedAt || "",
    generatorStage: map.metadata?.generatorStage || "",
    graphWidth: finite(map.metadata?.graphWidth ?? map.options?.graphWidth),
    graphHeight: finite(map.metadata?.graphHeight ?? map.options?.graphHeight),
    gridCells: finite(map.metadata?.gridCells ?? map.grid?.metadata?.actualCells ?? lengthOf(map.grid?.cells?.i ?? map.grid?.cells?.h)),
    packCells: finite(map.metadata?.packCells ?? map.pack?.metadata?.cells ?? lengthOf(map.pack?.cells?.i ?? map.pack?.cells?.h)),
    features: finite(map.features?.metadata?.features ?? arrayCount(map.features?.features)),
    states: politicalCount(map.politics?.states),
    provinces: politicalCount(map.politics?.provinces),
    cities: finite(map.settlements?.metadata?.cities ?? arrayCount(map.settlements?.burgs)),
    routes: finite(map.settlements?.metadata?.routes ?? arrayCount(map.settlements?.routes)),
    rivers: finite(map.rivers?.metadata?.rivers ?? arrayCount(map.rivers?.rivers)),
    lakes: finite(map.features?.metadata?.lakes),
    cultures: arrayCount(map.society?.cultures),
    religions: arrayCount(map.society?.religions),
    markers: finite(map.markers?.metadata?.markers ?? arrayCount(map.markers?.markers)),
    zones: finite(map.zones?.metadata?.zones ?? arrayCount(map.zones?.zones)),
    regiments: finite(map.military?.metadata?.regiments ?? arrayCount(map.military?.regiments)),
    measurements: finite(map.measurements?.metadata?.measurements ?? arrayCount(map.measurements?.items)),
    notes: finite(map.notes?.metadata?.notes ?? arrayCount(map.notes?.notes)),
    visualTheme: map.visualTheme?.preset || map.options?.visualTheme || context.visualTheme || "default",
    staleSystems: [...(map.metadata?.derivedStale?.systems || [])]
  };
}

function politicalCount(source) {
  if (!Array.isArray(source)) return 0;
  return source.filter(item => item && !item.removed && finite(item.i ?? item.id) > 0).length;
}

function arrayCount(source) {
  return Array.isArray(source) ? source.filter(Boolean).length : 0;
}

function lengthOf(source) {
  return Number(source?.length) || 0;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
