const LAYER_ORDER = [
  "landmass",
  "cells",
  "lakes",
  "coastline",
  "provinceBorders",
  "stateBorders",
  "routes",
  "rivers",
  "precipitation",
  "population",
  "burgIcons",
  "markers"
];

export function createLayerState() {
  return {
    landmass: true,
    cells: true,
    lakes: true,
    coastline: true,
    stateBorders: true,
    provinceBorders: true,
    routes: true,
    rivers: true,
    precipitation: false,
    population: false,
    burgIcons: true,
    markers: true
  };
}

export function setLayerVisible(layers, layerId, visible) {
  if (layerId === "borders") {
    layers.stateBorders = visible;
    layers.provinceBorders = visible;
    return;
  }
  if (!(layerId in layers)) throw new Error(`未知图层: ${layerId}`);
  layers[layerId] = visible;
}

export function getLayerVisibility(layers) {
  return {
    ...layers,
    borders: Boolean(layers.stateBorders && layers.provinceBorders)
  };
}

export function getDrawableLayers(layers) {
  return LAYER_ORDER.filter(layerId => layers[layerId]);
}
