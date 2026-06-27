export function bindRuntimePanel(documentRef, handlers) {
  documentRef.getElementById("generate-map").addEventListener("click", handlers.onGenerate);
  documentRef.getElementById("random-seed").addEventListener("click", handlers.onRandomSeed);
  documentRef.getElementById("fit-view").addEventListener("click", handlers.onFitView);
  documentRef.getElementById("show-ocean-height")?.addEventListener("change", event => handlers.onShowOceanHeight?.(event.target.checked));
  documentRef.getElementById("open-height-panel")?.addEventListener("click", handlers.onOpenHeightPanel);
  documentRef.getElementById("open-state-panel")?.addEventListener("click", handlers.onOpenStatePanel);
  documentRef.getElementById("open-river-panel")?.addEventListener("click", handlers.onOpenRiverPanel);
  for (const button of documentRef.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => {
      documentRef.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item === button));
      handlers.onMode(button.dataset.mode);
    });
  }
}

export function setActiveModeButton(documentRef, mode) {
  documentRef.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item.dataset.mode === mode));
}

export function setEditingInteractionLock(documentRef, locked, {allowedPanelIds = []} = {}) {
  documentRef.body.classList.toggle("editing-locked", locked);
  for (const control of editLockControls(documentRef)) {
    control.disabled = locked;
    control.dataset.editLockDisabled = locked ? "true" : "false";
  }
  for (const panel of documentRef.querySelectorAll(".floating-panel[data-panel-id]")) {
    const allowed = !locked || allowedPanelIds.includes(panel.dataset.panelId);
    panel.classList.toggle("editing-panel-disabled", !allowed);
    for (const control of panel.querySelectorAll("button, input, select, textarea")) {
      if (control.classList.contains("floating-panel-close")) continue;
      control.disabled = !allowed;
      control.dataset.editLockDisabled = !allowed ? "true" : "false";
    }
  }
}

function editLockControls(documentRef) {
  return documentRef.querySelectorAll([
    "#generate-map",
    "#random-seed",
    "#fit-view",
    "#open-height-panel",
    "#open-state-panel",
    "#open-river-panel",
    "#seed-input",
    "#cells-input",
    "#width-input",
    "#height-input",
    "#heightmap-template",
    "#auto-random-seed",
    "#show-ocean-height",
    "[data-mode]"
  ].join(", "));
}

export function readOptionsFromPanel(documentRef, previousOptions) {
  return {
    ...previousOptions,
    seed: documentRef.getElementById("seed-input").value,
    randomSeed: documentRef.getElementById("auto-random-seed").checked,
    heightmapTemplate: documentRef.getElementById("heightmap-template").value,
    cellsTarget: documentRef.getElementById("cells-input").value,
    graphWidth: documentRef.getElementById("width-input").value,
    graphHeight: documentRef.getElementById("height-input").value
  };
}

export function setSeedInput(documentRef, seed) {
  documentRef.getElementById("seed-input").value = seed;
}

export function updateRuntimePanel(documentRef, state) {
  const {map, renderer} = state;
  const stats = renderer.getStats();
  documentRef.getElementById("app-status").textContent = `${map.status.message}，seed ${map.metadata.seed}`;
  documentRef.getElementById("map-badge").textContent = `${map.metadata.graphWidth} x ${map.metadata.graphHeight} / ${map.metadata.cellsTarget} cells`;
  updateMapLegend(documentRef, map, stats.colorMode);
  documentRef.getElementById("runtime-stats").replaceChildren(
    statRow(documentRef, "阶段", map.metadata.generatorStage),
    statRow(documentRef, "Seed", map.metadata.seed),
    statRow(documentRef, "自动随机", map.options.randomSeed ? "是" : "否"),
    statRow(documentRef, "地形模板", map.heightmap.name),
    statRow(documentRef, "目标 cells", map.metadata.cellsTarget),
    statRow(documentRef, "实际 grid cells", map.metadata.gridCells),
    statRow(documentRef, "pack cells", map.metadata.packCells),
    statRow(documentRef, "地图尺寸", `${map.metadata.graphWidth} x ${map.metadata.graphHeight}`),
    statRow(documentRef, "grid 布局", `${map.grid.metadata.columns} x ${map.grid.metadata.rows}`),
    statRow(documentRef, "grid 邻接", `${map.grid.metadata.neighborMode} / avg ${map.grid.metadata.averageNeighborDegree}`),
    statRow(documentRef, "Voronoi 顶点", map.grid.metadata.vertexCount),
    statRow(documentRef, "cell 三角形", map.grid.metadata.triangles),
    statRow(documentRef, "grid 构建", `${map.grid.metadata.buildMs}ms`),
    statRow(documentRef, "feature 数", map.features.metadata.featureCount),
    statRow(documentRef, "海洋/陆地/湖泊", `${map.features.metadata.oceanFeatures} / ${map.features.metadata.landFeatures} / ${map.features.metadata.lakeFeatures}`),
    statRow(documentRef, "海岸线段", map.features.metadata.coastlineSegments),
    statRow(documentRef, "湖岸线段", map.features.metadata.lakeShoreSegments),
    statRow(documentRef, "温度范围", `${map.climate.metadata.temperatureMin}°C .. ${map.climate.metadata.temperatureMax}°C`),
    statRow(documentRef, "降水范围", `${map.climate.metadata.precipitationMin} .. ${map.climate.metadata.precipitationMax}`),
    statRow(documentRef, "biome 数", Object.keys(map.climate.metadata.biomeCounts).length),
    statRow(documentRef, "河流", `${map.rivers.metadata.rivers} / ${map.rivers.metadata.segments}`),
    statRow(documentRef, "文化/宗教", `${map.society.metadata.cultures} / ${map.society.metadata.religions}`),
    statRow(documentRef, "国家/省份/区域", `${map.politics.metadata.states} / ${map.politics.metadata.provinces} / ${map.politics.metadata.regions}`),
    statRow(documentRef, "城市/首都/港口", `${map.settlements.metadata.cities} / ${map.settlements.metadata.capitals} / ${map.settlements.metadata.ports}`),
    statRow(documentRef, "道路", `${map.settlements.metadata.routes} / ${map.settlements.metadata.routeSegments}`),
    statRow(documentRef, "军事", `${map.military?.metadata?.statesWithMilitary || 0} / ${map.military?.metadata?.regiments || 0}`),
    statRow(documentRef, "人口点", `${map.settlements.metadata.ruralPopulationPoints} / ${map.settlements.metadata.populationCells}`),
    statRow(documentRef, "摘要校验", map.summary.checksum),
    statRow(documentRef, "随机预览", map.summary.randomPreview.join(", ")),
    statRow(documentRef, "专题", stats.colorMode),
    statRow(documentRef, "海底高度", stats.viewOptions?.showOceanHeight ? "显示" : "隐藏"),
    statRow(documentRef, "GPU 顶点", stats.vertexCount),
    statRow(documentRef, "道路三角形", stats.routeTriangleCount),
    statRow(documentRef, "道路 mesh", `${stats.routeWidthMode}, ${stats.routeBuildMs}ms`),
    statRow(documentRef, "道路样式", stats.routeStyleMode),
    statRow(documentRef, "河流三角形", stats.riverTriangleCount),
    statRow(documentRef, "河流 mesh", `${stats.riverWidthMode}, ${stats.riverBuildMs}ms`),
    statRow(documentRef, "河流宽度", `${stats.riverWidthStats.minWidthPx} - ${stats.riverWidthStats.maxWidthPx}px / ${stats.riverWidthStats.rivers} 条`),
    statRow(documentRef, "河流流量", `${stats.riverWidthStats.minFlux} - ${stats.riverWidthStats.maxFlux}`),
    statRow(documentRef, "选中高亮", `${stats.selectionHighlightMode}, ${stats.selectionTriangleCount} tris, ${stats.selectionBuildMs}ms`),
    statRow(documentRef, "定位状态", stats.locateStatus),
    statRow(documentRef, "编辑历史", formatEditHistory(state.editHistory?.getStats())),
    statRow(documentRef, "编辑刷新", formatEditRefresh(state.lastEditRefresh)),
    statRow(documentRef, "对象索引", stats.objectPickingIndex ? `${stats.objectPickingIndex.buckets} buckets / ${stats.objectPickingIndex.markers} markers / ${stats.objectPickingIndex.routeSegments} routes / ${stats.objectPickingIndex.riverSegments} rivers` : "none"),
    statRow(documentRef, "线段顶点", stats.lineVertexCount),
    statRow(documentRef, "点顶点", stats.pointVertexCount),
    statRow(documentRef, "marker", stats.markerCount),
    statRow(documentRef, "城市标签", `${stats.visibleLabelCount} / ${stats.labelCount}`),
    statRow(documentRef, "相机", `x ${stats.camera.scale.toFixed(2)}, ${stats.camera.offsetX.toFixed(2)}, ${stats.camera.offsetY.toFixed(2)}`),
    statRow(documentRef, "绘制耗时", `${stats.draw.drawMs}ms`),
    statRow(documentRef, "WebGL error", stats.draw.glError),
    statRow(documentRef, "source 依赖", map.status.sourceDependency ? "是" : "否"),
    statRow(documentRef, "快照依赖", map.status.snapshotDependency ? "是" : "否"),
    statRow(documentRef, "生成日志", map.generationLog.join(" / "))
  );
}

function updateMapLegend(documentRef, map, colorMode) {
  const legend = documentRef.getElementById("map-legend");
  if (!legend) return;

  if (colorMode === "temperature") {
    legend.hidden = false;
    legend.replaceChildren(
      legendTitle(documentRef, "温度"),
      legendBar(documentRef, "temperature"),
      legendTicks(documentRef, `${map.climate.metadata.temperatureMin}°C`, "0°C", `${map.climate.metadata.temperatureMax}°C`)
    );
    return;
  }

  if (colorMode === "precipitation") {
    legend.hidden = false;
    legend.replaceChildren(
      legendTitle(documentRef, "降水"),
      legendBar(documentRef, "precipitation"),
      legendTicks(documentRef, `${map.climate.metadata.precipitationMin}`, "50", `${map.climate.metadata.precipitationMax}`)
    );
    return;
  }

  legend.hidden = true;
  legend.replaceChildren();
}

function legendTitle(documentRef, text) {
  const title = documentRef.createElement("div");
  title.className = "legend-title";
  title.textContent = text;
  return title;
}

function legendBar(documentRef, type) {
  const bar = documentRef.createElement("div");
  bar.className = `legend-bar ${type}`;
  return bar;
}

function legendTicks(documentRef, min, mid, max) {
  const ticks = documentRef.createElement("div");
  ticks.className = "legend-ticks";
  for (const value of [min, mid, max]) {
    const item = documentRef.createElement("span");
    item.textContent = value;
    ticks.append(item);
  }
  return ticks;
}

export function updatePickPanel(documentRef, state) {
  const pick = state.pick;
  const selectionRows = state.selection?.object
    ? [
        statRow(documentRef, "选中对象", formatObjectTitle(state.selection.object)),
        statRow(documentRef, "选中详情", formatObjectDetails(state.selection.object)),
        statRow(documentRef, "编辑对象", state.editingObject ? formatObjectTitle(state.editingObject) : "none")
      ]
    : [statRow(documentRef, "选中对象", "none"), statRow(documentRef, "编辑对象", state.editingObject ? formatObjectTitle(state.editingObject) : "none")];
  const hoverRows = pick?.gridCell === null || !pick
    ? [statRow(documentRef, "状态", "未命中")]
    : [
        statRow(documentRef, "悬停对象", pick.object ? formatObjectTitle(pick.object) : "none"),
        statRow(documentRef, "标签对象", pick.label ? `${pick.label.text} / ${pick.label.targetKind}` : "none"),
        statRow(documentRef, "政治对象", pick.politicalObject ? formatObjectTitle(pick.politicalObject) : "none"),
        statRow(documentRef, "grid cell", pick.gridCell),
        statRow(documentRef, "pack cell", pick.packCell),
        statRow(documentRef, "feature", `${pick.featureType} #${pick.featureId}`),
        statRow(documentRef, "高度", pick.height),
        statRow(documentRef, "温度/降水", `${pick.temperature} / ${pick.precipitation}`),
        statRow(documentRef, "biome", pick.biome),
        statRow(documentRef, "文化", pick.culture),
        statRow(documentRef, "宗教", pick.religion),
        statRow(documentRef, "国家", pick.state),
        statRow(documentRef, "省份", pick.province),
        statRow(documentRef, "区域", pick.region),
        statRow(documentRef, "城市", pick.city),
        statRow(documentRef, "marker", pick.marker ? `${pick.marker.name} / ${pick.marker.type}` : "none"),
        statRow(documentRef, "路线", pick.route ? `${pick.route.from} -> ${pick.route.to}` : "none"),
        statRow(documentRef, "路线类型", pick.route ? `${pick.route.type} / ${pick.route.level} / ${pick.route.distance.toFixed(1)}` : "none"),
        statRow(documentRef, "河流", pick.river ? `#${pick.river.id}` : "none"),
        statRow(documentRef, "河流类型", pick.river ? `${pick.river.type} / flux ${pick.river.flux}` : "none"),
        statRow(documentRef, "人口", pick.population),
        statRow(documentRef, "坐标", `${pick.worldX}, ${pick.worldY}`),
        statRow(documentRef, "候选 cells", pick.candidates),
        statRow(documentRef, "对象候选", pick.objectCandidates)
      ];
  documentRef.getElementById("pick-stats").replaceChildren(...selectionRows, ...hoverRows);
}

function formatObjectTitle(object) {
  if (object.kind === "city") return `城市 ${object.name}`;
  if (object.kind === "label") return `标签 ${object.text}`;
  if (object.kind === "marker") return `标记 ${object.name}`;
  if (object.kind === "route") return `路线 ${object.from} -> ${object.to}`;
  if (object.kind === "river") return `河流 #${object.id}`;
  if (object.kind === "state") return `国家 ${object.name}`;
  if (object.kind === "province") return `省份 ${object.name}`;
  if (object.kind === "region") return `区域 ${object.name}`;
  return "unknown";
}

function formatObjectDetails(object) {
  if (object.kind === "city") return `${object.type} / pop ${object.population} / ${object.state}`;
  if (object.kind === "label") return `${object.targetKind} / ${object.targetName}`;
  if (object.kind === "marker") return `${object.type} / cell ${object.cell}`;
  if (object.kind === "route") return `${object.type} / ${object.level} / distance ${formatDistance(object.distance)}`;
  if (object.kind === "river") return `${object.type} / flux ${object.flux} / length ${object.length}`;
  if (object.kind === "state") return `${object.culture} / ${object.religion}`;
  if (object.kind === "province") return `${object.state}`;
  if (object.kind === "region") return `region #${object.id}`;
  return "unknown";
}

function formatEditHistory(stats) {
  if (!stats) return "none";
  return `undo ${stats.undo} / redo ${stats.redo} / ${stats.lastLabel}`;
}

function formatEditRefresh(refresh) {
  if (!refresh) return "none";
  return `${refresh.render} / ${refresh.selection} / ${refresh.derived} / ${refresh.affected}`;
}

function formatDistance(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}

function statRow(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("dt");
  const desc = documentRef.createElement("dd");
  term.textContent = label;
  desc.textContent = String(value);
  row.append(term, desc);
  return row;
}
