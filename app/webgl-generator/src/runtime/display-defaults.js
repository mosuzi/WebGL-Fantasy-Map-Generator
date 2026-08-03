export const DEFAULT_MAX_CITY_LABELS = 128;

export const DEFAULT_LAYER_VISIBILITY = Object.freeze({
  routes: true,
  tradeFlows: false,
  rivers: true,
  oceanCurrents: false,
  cities: true,
  labels: true,
  stateLabels: true,
  provinceLabels: false,
  population: true,
  markers: false,
  resources: false,
  military: false,
  warFronts: false,
  zones: false,
  zoneEvents: false,
  zoneNatural: false,
  zoneWilderness: false,
  zoneLabels: false,
  measurements: false,
  scaleBar: true,
  mapBadge: false,
  coastline: true,
  lakeShore: true,
  stateBorders: true,
  provinceBorders: false,
  gridCells: false
});

export function createDefaultLayerVisibility() {
  return {...DEFAULT_LAYER_VISIBILITY};
}
