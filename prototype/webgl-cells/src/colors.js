import {clamp} from "./utils.js";

export function getHeightColor(height) {
  if (height < 20) return mixColor([25, 78, 124], [70, 145, 190], height / 20);
  if (height < 35) return mixColor([88, 151, 83], [155, 184, 96], (height - 20) / 15);
  if (height < 65) return mixColor([174, 162, 100], [143, 117, 82], (height - 35) / 30);
  return mixColor([126, 118, 112], [230, 230, 222], (height - 65) / 35);
}

export function getStateColor(height, stateId, states) {
  if (height < 20) return [0.1, 0.31, 0.5];
  const state = states[stateId];
  if (!state || state.removed) return [0.45, 0.5, 0.43];
  return parseHexColor(state.color);
}

export function getRiverColor(river) {
  const width = clamp((river.width || 0) / 8, 0, 1);
  return mixColor([53, 135, 188], [152, 210, 242], width);
}

export function getRouteColor(group) {
  const colors = {
    roads: [104, 54, 28],
    trails: [170, 121, 54],
    searoutes: [25, 102, 157]
  };
  return rgb(colors[group] || [92, 74, 58]);
}

export function getBoundaryColor(type) {
  if (type === "province") return rgb([118, 118, 112]);
  return rgb([12, 15, 18]);
}

export function getLandmassColor(group) {
  if (group === "lake_island") return rgb([131, 161, 94]);
  if (group === "isle") return rgb([122, 157, 91]);
  return rgb([118, 154, 87]);
}

export function getLakeColor(group) {
  const colors = {
    freshwater: [70, 147, 180],
    salt: [82, 129, 171],
    sinkhole: [45, 86, 113],
    frozen: [183, 217, 226],
    lava: [198, 80, 43],
    dry: [166, 151, 111]
  };
  return rgb(colors[group] || colors.freshwater);
}

export function getCoastlineColor(type, group) {
  if (type === "lake") {
    if (group === "lava") return rgb([119, 55, 43]);
    if (group === "dry") return rgb([119, 104, 75]);
    return rgb([31, 82, 112]);
  }
  return rgb([32, 44, 39]);
}

export function mixColor(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return a.map((value, index) => (value + (b[index] - value) * t) / 255);
}

export function rgb(color) {
  return color.map(value => value / 255);
}

export function parseHexColor(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color || "");
  if (!match) return [0.55, 0.55, 0.55];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
