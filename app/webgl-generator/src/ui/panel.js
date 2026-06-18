export function bindRuntimePanel(documentRef, handlers) {
  documentRef.getElementById("generate-map").addEventListener("click", handlers.onGenerate);
  documentRef.getElementById("random-seed").addEventListener("click", handlers.onRandomSeed);
  documentRef.getElementById("fit-view").addEventListener("click", handlers.onFitView);
  for (const button of documentRef.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => {
      documentRef.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item === button));
      handlers.onMode(button.dataset.mode);
    });
  }
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
    statRow(documentRef, "Voronoi 顶点", map.grid.metadata.vertexCount),
    statRow(documentRef, "cell 三角形", map.grid.metadata.triangles),
    statRow(documentRef, "grid 构建", `${map.grid.metadata.buildMs}ms`),
    statRow(documentRef, "feature 数", map.features.metadata.featureCount),
    statRow(documentRef, "海洋/陆地/湖泊", `${map.features.metadata.oceanFeatures} / ${map.features.metadata.landFeatures} / ${map.features.metadata.lakeFeatures}`),
    statRow(documentRef, "海岸线段", map.features.metadata.coastlineSegments),
    statRow(documentRef, "湖岸线段", map.features.metadata.lakeShoreSegments),
    statRow(documentRef, "温度范围", `${map.climate.metadata.temperatureMin} .. ${map.climate.metadata.temperatureMax}`),
    statRow(documentRef, "降水范围", `${map.climate.metadata.precipitationMin} .. ${map.climate.metadata.precipitationMax}`),
    statRow(documentRef, "biome 数", Object.keys(map.climate.metadata.biomeCounts).length),
    statRow(documentRef, "河流", `${map.rivers.metadata.rivers} / ${map.rivers.metadata.segments}`),
    statRow(documentRef, "文化/宗教", `${map.society.metadata.cultures} / ${map.society.metadata.religions}`),
    statRow(documentRef, "国家/省份/区域", `${map.politics.metadata.states} / ${map.politics.metadata.provinces} / ${map.politics.metadata.regions}`),
    statRow(documentRef, "城市/首都/港口", `${map.settlements.metadata.cities} / ${map.settlements.metadata.capitals} / ${map.settlements.metadata.ports}`),
    statRow(documentRef, "道路", `${map.settlements.metadata.routes} / ${map.settlements.metadata.routeSegments}`),
    statRow(documentRef, "人口点", `${map.settlements.metadata.ruralPopulationPoints} / ${map.settlements.metadata.populationCells}`),
    statRow(documentRef, "摘要校验", map.summary.checksum),
    statRow(documentRef, "随机预览", map.summary.randomPreview.join(", ")),
    statRow(documentRef, "专题", stats.colorMode),
    statRow(documentRef, "GPU 顶点", stats.vertexCount),
    statRow(documentRef, "道路三角形", stats.routeTriangleCount),
    statRow(documentRef, "道路 mesh", `${stats.routeWidthMode}, ${stats.routeBuildMs}ms`),
    statRow(documentRef, "线段顶点", stats.lineVertexCount),
    statRow(documentRef, "点顶点", stats.pointVertexCount),
    statRow(documentRef, "城市标签", `${stats.visibleLabelCount} / ${stats.labelCount}`),
    statRow(documentRef, "相机", `x ${stats.camera.scale.toFixed(2)}, ${stats.camera.offsetX.toFixed(2)}, ${stats.camera.offsetY.toFixed(2)}`),
    statRow(documentRef, "绘制耗时", `${stats.draw.drawMs}ms`),
    statRow(documentRef, "WebGL error", stats.draw.glError),
    statRow(documentRef, "source 依赖", map.status.sourceDependency ? "是" : "否"),
    statRow(documentRef, "快照依赖", map.status.snapshotDependency ? "是" : "否"),
    statRow(documentRef, "生成日志", map.generationLog.join(" / "))
  );
}

export function updatePickPanel(documentRef, state) {
  const pick = state.pick;
  const rows = pick?.gridCell === null || !pick
    ? [statRow(documentRef, "状态", "未命中")]
    : [
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
        statRow(documentRef, "路线", pick.route ? `${pick.route.from} -> ${pick.route.to}` : "none"),
        statRow(documentRef, "路线类型", pick.route ? `${pick.route.type} / ${pick.route.distance.toFixed(1)}` : "none"),
        statRow(documentRef, "人口", pick.population),
        statRow(documentRef, "坐标", `${pick.worldX}, ${pick.worldY}`),
        statRow(documentRef, "候选 cells", pick.candidates)
      ];
  documentRef.getElementById("pick-stats").replaceChildren(...rows);
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
