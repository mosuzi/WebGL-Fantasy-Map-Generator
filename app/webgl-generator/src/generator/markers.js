export function buildMarkers(grid, features, politics, rivers) {
  const markers = [];
  addPeakMarkers(markers, grid, features);
  addRiverSourceMarkers(markers, grid, rivers);
  addStateCenterMarkers(markers, grid, politics);

  return {
    markers,
    metadata: {
      markers: markers.length,
      peaks: markers.filter(marker => marker.type === "peak").length,
      riverSources: markers.filter(marker => marker.type === "river-source").length,
      stateCenters: markers.filter(marker => marker.type === "state-center").length
    }
  };
}

function addPeakMarkers(markers, grid, features) {
  const peaks = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell]}))
    .filter(item => item.height >= 72 && features.features[grid.cells.f[item.cell]]?.land)
    .sort((a, b) => b.height - a.height)
    .slice(0, 10);

  for (const peak of peaks) {
    markers.push(createMarker(markers.length, "peak", `峰 ${Math.round(peak.height)}`, peak.cell, peak.point, {height: peak.height}));
  }
}

function addRiverSourceMarkers(markers, grid, rivers) {
  for (const river of rivers.rivers.slice(0, 8)) {
    const gridCell = river.sourceGrid ?? river.gridCells?.[0] ?? river.source;
    const point = grid.points[gridCell];
    markers.push(createMarker(markers.length, "river-source", `河源 #${river.id}`, gridCell, point, {river: river.id, flux: river.flux}));
  }
}

function addStateCenterMarkers(markers, grid, politics) {
  for (const state of politics.states) {
    const point = grid.points[state.center];
    markers.push(createMarker(markers.length, "state-center", `${state.name}中心`, state.center, point, {state: state.id}));
  }
}

function createMarker(id, type, name, cell, point, data) {
  return {
    id,
    type,
    name,
    cell,
    x: point[0],
    y: point[1],
    data
  };
}
