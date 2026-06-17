import {mixColor, parseHexColor, rgb} from "./colors.js";
import {clamp} from "./utils.js";

export const POINT_LAYER_IDS = ["precipitation", "population", "burgIcons", "markers"];

export function buildPointBuffers(snapshot) {
  const layers = createPointLayers();

  buildPrecipitationPoints(snapshot, layers.precipitation);
  buildPopulationPoints(snapshot, layers.population);
  buildBurgIconPoints(snapshot, layers.burgIcons);
  buildMarkerPoints(snapshot, layers.markers);

  for (const layer of Object.values(layers)) {
    layer.positions = new Float32Array(layer.positions);
    layer.colors = new Float32Array(layer.colors);
    layer.sizes = new Float32Array(layer.sizes);
    layer.instanceCount = layer.positions.length / 2;
  }

  return {
    layers,
    stats: {
      precipitationPoints: layers.precipitation.instanceCount,
      precipitationMax: layers.precipitation.maxValue,
      populationInstances: layers.population.instanceCount,
      ruralPopulationPoints: layers.population.ruralCount,
      urbanPopulationPoints: layers.population.urbanCount,
      burgIcons: layers.burgIcons.instanceCount,
      portIcons: layers.burgIcons.portCount,
      markerCount: layers.markers.instanceCount,
      markerGroups: layers.markers.groups
    }
  };
}

export function uploadPointBuffers(gl, pointBuffers) {
  for (const layer of Object.values(pointBuffers.layers)) {
    layer.positionBuffer = createBuffer(gl, layer.positions);
    layer.colorBuffer = createBuffer(gl, layer.colors);
    layer.sizeBuffer = createBuffer(gl, layer.sizes);
  }
}

export function disposePointBuffers(gl, pointBuffers) {
  if (!pointBuffers) return;
  for (const layer of Object.values(pointBuffers.layers || {})) {
    if (layer.positionBuffer) gl.deleteBuffer(layer.positionBuffer);
    if (layer.colorBuffer) gl.deleteBuffer(layer.colorBuffer);
    if (layer.sizeBuffer) gl.deleteBuffer(layer.sizeBuffer);
  }
}

function createPointLayers() {
  return {
    precipitation: createPointLayer({maxValue: 0}),
    population: createPointLayer({ruralCount: 0, urbanCount: 0}),
    burgIcons: createPointLayer({portCount: 0}),
    markers: createPointLayer({groups: {}})
  };
}

function createPointLayer(extra = {}) {
  return {
    positions: [],
    colors: [],
    sizes: [],
    instanceCount: 0,
    ...extra
  };
}

function buildPrecipitationPoints(snapshot, layer) {
  const gridCells = snapshot.grid?.cells;
  const points = gridCells?.p || [];
  const heights = gridCells?.h || [];
  const precipitation = gridCells?.prec || [];
  const cellsNumberModifier = (Number(snapshot.metadata?.cellsTarget || 10000) / 10000) ** 0.25;

  for (let cellId = 0; cellId < precipitation.length; cellId++) {
    const value = precipitation[cellId] || 0;
    if (!value || (heights[cellId] || 0) < 20) continue;

    const point = points[cellId];
    if (!isPoint(point)) continue;

    layer.maxValue = Math.max(layer.maxValue, value);
    pushPoint(layer, point, getPrecipitationColor(value), clamp(Math.sqrt(value / 4) / cellsNumberModifier, 1.2, 7));
  }
}

function buildPopulationPoints(snapshot, layer) {
  const cells = snapshot.cells || {};
  const population = cells.pop || [];
  const heights = cells.h || [];
  const cellPoints = cells.p || [];

  for (let cellId = 0; cellId < population.length; cellId++) {
    const value = population[cellId] || 0;
    if (!value || (heights[cellId] || 0) < 20) continue;

    const point = cellPoints[cellId];
    if (!isPoint(point)) continue;

    layer.ruralCount++;
    pushPoint(layer, point, rgb([227, 191, 92]), clamp(Math.sqrt(value) * 1.1, 1.2, 6));
  }

  for (const burg of getValidBurgs(snapshot)) {
    const point = [burg.x, burg.y];
    if (!isPoint(point)) continue;

    layer.urbanCount++;
    pushPoint(layer, point, rgb([236, 118, 71]), clamp(Math.sqrt(burg.population || 1) * 2.4, 2.5, 12));
  }
}

function buildBurgIconPoints(snapshot, layer) {
  for (const burg of getValidBurgs(snapshot)) {
    const point = [burg.x, burg.y];
    if (!isPoint(point)) continue;

    if (burg.port) layer.portCount++;
    const color = burg.capital ? rgb([244, 217, 94]) : burg.port ? rgb([88, 174, 214]) : rgb([238, 235, 220]);
    const size = burg.capital ? 10 : burg.port ? 8 : 6;
    pushPoint(layer, point, color, size);
  }
}

function buildMarkerPoints(snapshot, layer) {
  if (!Array.isArray(snapshot.markers)) return;

  for (const marker of snapshot.markers) {
    if (!marker) continue;

    const point = [marker.x, marker.y];
    if (!isPoint(point)) continue;

    const group = marker.type || marker.icon || "marker";
    layer.groups[group] = (layer.groups[group] || 0) + 1;
    const size = marker.size ? clamp(marker.size / 4, 5, 14) : 8;
    pushPoint(layer, point, getMarkerColor(marker), size);
  }
}

function getValidBurgs(snapshot) {
  if (!Array.isArray(snapshot.burgs)) return [];
  return snapshot.burgs.filter(burg => burg?.i && !burg.removed);
}

function getPrecipitationColor(value) {
  return mixColor([89, 168, 218], [218, 238, 255], clamp(value / 120, 0, 1));
}

function getMarkerColor(marker) {
  if (marker.fill) return parseHexColor(marker.fill);
  if (marker.stroke) return parseHexColor(marker.stroke);
  return rgb([245, 92, 86]);
}

function pushPoint(layer, point, color, size) {
  layer.positions.push(point[0], point[1]);
  layer.colors.push(color[0], color[1], color[2]);
  layer.sizes.push(size);
}

function isPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}
