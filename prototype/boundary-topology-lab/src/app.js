import {ALGORITHMS, DEFAULT_OPTIONS} from "./algorithms.js";
import {FIXTURES, FIXTURE_BY_ID} from "./fixtures.js";
import {composeRawRing} from "./topology.js";
import {validateFixture, runAllFixtures} from "./validation.js";
import {maximumDeviationZoomViewBox, mergeVisualDiagnostics, resolveComparisonPresentation} from "./visual-diagnostics.js";

const state = {
  fixtureId: "tri-state-junction",
  algorithmId: "recommended",
  options: {...DEFAULT_OPTIONS},
  layers: {raw: true, nodes: true, ids: false, error: true}
};

const elements = Object.fromEntries([
  "fixture-list", "algorithm-list", "threshold", "threshold-value", "smoothness", "smoothness-value",
  "max-displacement", "displacement-value", "show-raw", "show-nodes", "show-ids", "show-error",
  "run-all", "global-status", "case-category", "case-name", "case-description", "independent-view",
  "shared-view", "metrics", "result-grid", "result-summary", "independent-card", "independent-title",
  "independent-note", "shared-card", "shared-title", "shared-status", "current-issues"
].map(id => [id, document.getElementById(id)]));

initialize();

function initialize() {
  elements["fixture-list"].innerHTML = FIXTURES.map((fixture, index) => `<button class="fixture-button" data-fixture="${fixture.id}"><span>${fixture.name}</span><small>${String(index + 1).padStart(2, "0")}</small></button>`).join("");
  elements["algorithm-list"].innerHTML = ALGORITHMS.map(algorithm => `<button class="algorithm-button" data-algorithm="${algorithm.id}">${algorithm.name}</button>`).join("");
  elements["fixture-list"].addEventListener("click", event => {
    const button = event.target.closest("[data-fixture]");
    if (!button) return;
    state.fixtureId = button.dataset.fixture;
    render();
  });
  elements["algorithm-list"].addEventListener("click", event => {
    const button = event.target.closest("[data-algorithm]");
    if (!button) return;
    state.algorithmId = button.dataset.algorithm;
    render();
  });
  bindRange("threshold", "threshold", "threshold-value", value => value.toFixed(1));
  bindRange("smoothness", "smoothness", "smoothness-value", value => value.toFixed(2));
  bindRange("max-displacement", "maxDisplacement", "displacement-value", value => `${value.toFixed(1)} px`);
  bindLayer("show-raw", "raw");
  bindLayer("show-nodes", "nodes");
  bindLayer("show-ids", "ids");
  bindLayer("show-error", "error");
  elements["run-all"].addEventListener("click", renderAllResults);
  render();
  renderAllResults();
  window.boundaryTopologyLab = Object.freeze({FIXTURES, ALGORITHMS, validateFixture, runAllFixtures});
}

function bindRange(elementId, optionKey, outputId, format) {
  const input = elements[elementId];
  input.value = String(state.options[optionKey]);
  const update = () => {
    state.options[optionKey] = Number(input.value);
    elements[outputId].value = format(state.options[optionKey]);
    render();
  };
  input.addEventListener("input", update);
  elements[outputId].value = format(state.options[optionKey]);
}

function bindLayer(elementId, key) {
  elements[elementId].addEventListener("change", event => {
    state.layers[key] = event.target.checked;
    render();
  });
}

function render() {
  const fixture = FIXTURE_BY_ID.get(state.fixtureId);
  const result = validateFixture(fixture, state.algorithmId, state.options);
  const comparisonKind = fixture.id === "single-cell-seam-spike"
    ? "closed-seam"
    : fixture.stressComparison
    ? "stress"
    : fixture.cellFanComparison
    ? "cell-fan"
    : fixture.vertexCollapseComparison
      ? "vertex-collapse"
    : fixture.pixelParityComparison
      ? "pixel-parity"
    : fixture.bandTriangleComparison
      ? "band"
      : Boolean(fixture.surfaceComparison);
  const presentation = resolveComparisonPresentation(result.metrics.sharedArcCount, comparisonKind);
  document.querySelectorAll("[data-fixture]").forEach(button => button.classList.toggle("active", button.dataset.fixture === state.fixtureId));
  document.querySelectorAll("[data-algorithm]").forEach(button => button.classList.toggle("active", button.dataset.algorithm === state.algorithmId));
  elements["case-category"].textContent = `${fixture.category.toUpperCase()} · ${state.algorithmId}`;
  elements["case-name"].textContent = fixture.name;
  elements["case-description"].textContent = fixture.description;
  elements["independent-title"].textContent = presentation.firstTitle;
  elements["independent-note"].textContent = presentation.firstNote;
  elements["shared-title"].textContent = presentation.secondTitle;
  elements["shared-status"].textContent = result.ok ? "几何验收通过" : `几何验收失败 · ${result.issues.length}`;
  elements["shared-status"].className = `result-state ${result.ok ? "pass" : "fail"}`;
  elements["shared-card"].className = `map-card result-card ${result.ok ? "pass" : "fail"}`;
  const firstModel = presentation.kind === "shared"
    ? result.comparison
    : presentation.kind === "closed-seam"
      ? buildLegacyClosedAnchorModel(fixture, result.snapshot)
    : presentation.kind === "surface"
      ? {...result.snapshot, regions: buildRawModel(fixture).regions}
      : presentation.kind === "band"
        ? buildRawModel(fixture)
        : presentation.kind === "cell-fan"
          ? buildRawModel(fixture)
          : presentation.kind === "vertex-collapse"
            ? buildRawModel(fixture)
          : buildRawModel(fixture);
  elements["independent-view"].innerHTML = renderSvg(firstModel, fixture, presentation.firstMode, result);
  elements["shared-view"].innerHTML = renderSvg(result.snapshot, fixture, presentation.secondMode, result);
  elements["current-issues"].innerHTML = issuesMarkup(result, presentation);
  elements.metrics.innerHTML = metricsMarkup(result.metrics);
  setStatus(result.ok ? "当前用例通过" : `当前用例失败 · ${result.issues.length}`, result.ok);
}

function buildRawModel(fixture) {
  return {
    regions: fixture.regions.map(region => ({
      ...region,
      rings: region.rings.map(ring => composeRawRing(ring, fixture))
    }))
  };
}

function buildLegacyClosedAnchorModel(fixture, snapshot) {
  const arcs = new Map([...snapshot.arcs].map(([id, processed]) => {
    const raw = fixture.arcs.find(item => item.id === id);
    const points = processed.points.map(point => [...point]);
    if (raw?.closed && points.length) {
      points[0] = [...raw.points[0]];
      points[points.length - 1] = [...raw.points[0]];
    }
    return [id, {...processed, points}];
  }));
  return {
    arcs,
    regions: fixture.regions.map(region => ({
      ...region,
      rings: region.rings.map(ring => composeModelRing(ring, arcs))
    }))
  };
}

function composeModelRing(refs, arcs) {
  const ring = [];
  for (const arcRef of refs) {
    const points = arcRef.reversed ? arcs.get(arcRef.arcId).points.toReversed() : arcs.get(arcRef.arcId).points;
    ring.push(...(ring.length ? points.slice(1) : points).map(point => [...point]));
  }
  return ring;
}

function renderSvg(model, fixture, mode, result) {
  if (fixture.stressComparison) return stressComparisonSvg(fixture, mode === "raw" ? "destructive" : "final", result.metrics.stressAnalysis);
  const regions = model.regions.map(region => `<path class="region" fill="${region.fill}" fill-rule="evenodd" d="${region.rings.map(pathData).join(" ")}"><title>${region.name}</title></path>`).join("");
  const cellFanMode = mode === "legacy-cell-fan" || mode === "earcut-cell-surface";
  const vertexCollapseMode = mode === "collapsed-grid-surface" || mode === "resolved-grid-surface";
  const pixelParityMode = mode === "legacy-pixel-seams" || mode === "exact-pixel-parity";
  const raw = state.layers.raw && mode !== "raw" && !cellFanMode && !vertexCollapseMode && !pixelParityMode ? fixture.arcs.map(arc => `<path class="raw-line" d="${pathData(arc.points)}"/>`).join("") : "";
  const arcs = mode === "shared" || mode === "processed" || mode === "legacy-closed-anchor" || mode === "legacy-surface" || mode === "shared-surface"
    ? [...model.arcs.values()].map(arc => `<path class="arc-line ${arc.kind}" d="${pathData(arc.points)}"/>`).join("")
    : "";
  const closedSeam = mode === "legacy-closed-anchor"
    ? (() => {
        const anchor = fixture.arcs.find(arc => arc.id === "single-cell-coast")?.points?.[0];
        return anchor
          ? `<g class="closed-seam-defect"><circle cx="${anchor[0]}" cy="${anchor[1]}" r="5"/><path d="M ${anchor[0] - 12} ${anchor[1] - 9} L ${anchor[0] - 2} ${anchor[1] - 2}"/></g>`
          : "";
      })()
    : "";
  const legacyRepair = mode === "legacy-surface"
    ? [...model.arcs.values()].map(arc => `<path class="legacy-repair-band" d="${pathData(arc.points)}"/>`).join("")
    : "";
  const surfaceMismatch = mode === "legacy-surface" ? surfaceMismatchMarkup(result.metrics.surfaceClassification) : "";
  const bandTriangles = mode === "legacy-band" || mode === "exact-surface"
    ? bandTriangleMarkup(fixture, result.metrics.bandTriangleGeometry, mode)
    : "";
  const cellFan = cellFanMode
    ? cellFanMarkup(fixture, result.metrics.cellFanGeometry, mode)
    : "";
  const vertexCollapse = vertexCollapseMode
    ? vertexCollapseMarkup(fixture, result.metrics.vertexCollapseGeometry, mode)
    : "";
  const pixelParity = pixelParityMode
    ? pixelParityMarkup(fixture, result.metrics.pixelParityGeometry, mode)
    : "";
  const sides = mode === "independent" && state.layers.error
    ? [...model.usages.values()].flatMap(usages => usages.slice(0, 2).map((usage, index) => `<path class="usage-side side-${index ? "second" : "first"}" d="${pathData(usage.points)}"/>`)).join("")
    : "";
  const sameSource = mode === "shared" && state.layers.error
    ? [...result.comparison.usages.keys()].map(arcId => model.arcs.get(arcId)).filter(Boolean).map(arc => `<path class="same-source-line" d="${pathData(arc.points)}"/>`).join("")
    : "";
  const deviation = mode === "independent" && state.layers.error ? deviationMarkup(result.comparison) : "";
  const protectedObjects = protectedObjectsMarkup(fixture);
  const nodes = state.layers.nodes && !cellFanMode && !vertexCollapseMode && !pixelParityMode ? fixture.arcs.flatMap(arc => [arc.points[0], arc.points.at(-1)]).map(point => `<circle class="node" cx="${point[0]}" cy="${point[1]}" r="2.8"/>`).join("") : "";
  const ids = state.layers.ids ? fixture.arcs.map(arc => {
    const midpoint = arc.points[Math.floor((arc.points.length - 1) / 2)];
    return `<text class="arc-id" x="${midpoint[0] + 4}" y="${midpoint[1] - 4}">${arc.id}</text>`;
  }).join("") : "";
  const labels = {
    independent: "逐区域独立处理对照",
    shared: "共享弧线处理结果",
    raw: "原始轮廓",
    processed: "处理后轮廓",
    "legacy-closed-anchor": "旧算法闭环首点毛刺",
    "legacy-surface": "旧策略原始填色与局部修补",
    "shared-surface": "XOR 修补后三角面与描边",
    "legacy-band": "旧策略四三角过渡带翻面",
    "exact-surface": "最终 XOR 填色与共享描边",
    "legacy-cell-fan": "正式单元旧中心扇形越界",
    "earcut-cell-surface": "正式单元边界 Earcut 三角化",
    "collapsed-grid-surface": "正式旧数据零长度共享边",
    "resolved-grid-surface": "正式新 writer 精确共享边",
    "legacy-pixel-seams": "正式旧策略长针与浅色带",
    "exact-pixel-parity": "正式边缘覆盖与细海岸线"
  };
  return `<svg viewBox="-8 -8 336 236" role="img" aria-label="${labels[mode]}">${regions}${legacyRepair}${raw}${sides}${sameSource}${surfaceMismatch}${bandTriangles}${cellFan}${vertexCollapse}${pixelParity}${arcs}${closedSeam}${protectedObjects}${deviation}${nodes}${ids}</svg>`;
}

function stressComparisonSvg(fixture, variant, stress) {
  const model = fixture.stressComparison;
  if (model.kind === "triangle-island-fallback") {
    const currentCases = variant === "destructive" ? stress.destructive.cases : stress.final.cases;
    const projectors = new Map(model.cases.map((item, index) => {
      const points = [
        ...item.points,
        ...item.protectedObjects.towns,
        ...item.protectedObjects.roads.flat()
      ];
      const minX = Math.min(...points.map(point => point[0]));
      const maxX = Math.max(...points.map(point => point[0]));
      const minY = Math.min(...points.map(point => point[1]));
      const maxY = Math.max(...points.map(point => point[1]));
      const scale = Math.min(105 / Math.max(1, maxX - minX), 92 / Math.max(1, maxY - minY));
      const originX = index ? 190 : 34;
      const originY = 91;
      return [item.id, point => [
        originX + (point[0] - minX) * scale,
        originY + (point[1] - minY) * scale
      ]];
    }));
    const islands = currentCases.map(item =>
      `<path d="${pathData(item.points.map(projectors.get(item.id)))}" fill="#355b49" stroke="#b8d0ce" stroke-width="1.4" stroke-linejoin="round"/>`
    ).join("");
    const raw = variant === "final"
      ? model.cases.map(item => `<path d="${pathData(item.points.map(projectors.get(item.id)))}" fill="none" stroke="#d7a344" stroke-width="1" stroke-dasharray="4 3"/>`).join("")
      : "";
    const roads = model.cases.flatMap(item => (item.protectedObjects.roads || []).map(points => ({id: item.id, points})))
      .map(item => `<path d="${pathData(item.points.map(projectors.get(item.id)))}" fill="none" stroke="#80755f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
    const towns = model.cases.flatMap(item => (item.protectedObjects.towns || []).map(point => ({id: item.id, point})))
      .map(item => {
        const point = projectors.get(item.id)(item.point);
        return `<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="#c29b58" stroke="#4b4437" stroke-width="1.5"/>`;
      })
      .join("");
    const status = variant === "destructive"
      ? `整环回退 · ${currentCases.map(item => item.fallbackReason).join(" / ")}`
      : `自适应圆角 · 最大位移 ${Math.max(...currentCases.map(item => item.displacement)).toFixed(2)} / 18`;
    return `<svg class="stress-comparison stress-triangle-fallback-${variant}" viewBox="0 0 320 220" role="img" aria-label="${variant === "destructive" ? "三顶点孤岛整环回退" : "三顶点孤岛自适应平滑"}"><path d="${pathData(model.mainlandRing)}" fill="#536f51"/>${islands}${raw}${roads}${towns}<text class="stress-status ${variant}" x="22" y="208">${status}</text></svg>`;
  }
  if (model.kind === "closed-stroke-seam") {
    const current = variant === "destructive" ? stress.destructive.legacy : stress.final;
    const island = pathData(current.points);
    const mainland = pathData(model.mainlandRing);
    const roads = model.roads.map(points => `<path d="${pathData(points)}" fill="none" stroke="#80755f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    const spike = variant === "destructive"
      ? `<circle cx="${model.spikePoint[0]}" cy="${model.spikePoint[1]}" r="5" fill="none" stroke="#e2453f" stroke-width="2"/><path d="M ${model.spikePoint[0] - 14} ${model.spikePoint[1] - 10} L ${model.spikePoint[0] - 3} ${model.spikePoint[1] - 2}" stroke="#e2453f" stroke-width="2"/>`
      : "";
    return `<svg class="stress-comparison stress-closed-stroke-${variant}" viewBox="0 0 320 220" role="img" aria-label="${variant === "destructive" ? "旧水陆线闭环首点穿刺" : "闭环首点描边修复"}"><path d="${mainland}" fill="#536f51"/><path d="${island}" fill="#355b49" stroke="#b8d0ce" stroke-width="1.4" stroke-linejoin="round"/>${roads}<circle cx="${model.town[0]}" cy="${model.town[1]}" r="4" fill="#c29b58" stroke="#4b4437" stroke-width="1.5"/>${spike}<text class="stress-status ${variant}" x="22" y="208">${variant === "destructive" ? `闭环首点漏检 · 残针 ${current.needleCount}` : `闭环逐点检查 · 残针 ${current.needleCount} · ${current.closed ? "保持闭合" : "闭合失败"}`}</text></svg>`;
  }
  if (model.kind === "phase-matrix" || model.kind === "multi-ring") {
    const points = [...model.sourceRings.flat(), ...model.renderRings.flat()];
    const project = stressProjector(points);
    const sourcePaths = model.sourceRings.map(ring => pathData(ring.map(project))).join(" ");
    const renderPaths = model.renderRings.map(ring => pathData(ring.map(project))).join(" ");
    const destructive = stress.destructive.endpointQuantization;
    const locations = variant === "destructive"
      ? destructive.worstPhase?.wrongLocations || []
      : stress.final.worstPhase?.wrongLocations || [];
    const markers = locations.map((location, index) => {
      const [x, y] = project(location.point);
      return `<g class="stress-pixel-location"><circle cx="${round(x)}" cy="${round(y)}" r="3.4"/><text x="${round(x + 4)}" y="${round(y - 4)}">${index + 1}</text></g>`;
    }).join("");
    const probeMarkers = (model.probes || []).map(probe => {
      const [x, y] = project(probe.point);
      return `<g class="stress-probe"><circle cx="${round(x)}" cy="${round(y)}" r="3"/><text x="${round(x + 5)}" y="${round(y - 4)}">${probe.label}</text></g>`;
    }).join("");
    const status = variant === "destructive"
      ? `端点量化错侧 ${destructive.wrongSidePixels} · 最长针 ${destructive.longestNeedlePixels}`
      : `最终错侧 ${stress.final.wrongSidePixels} · 冲突 ${stress.final.conflictingPixels}`;
    return `<svg class="stress-comparison stress-${model.kind}-${variant}" viewBox="0 0 320 220" role="img" aria-label="${variant === "destructive" ? "破坏反例与像素针定位" : "最终零错侧海岸"}"><path d="${sourcePaths}" fill="rgba(191,71,64,.12)" fill-rule="evenodd" stroke="#b44b45" stroke-width="1.2" stroke-dasharray="4 3"/><path d="${renderPaths}" fill="rgba(63,133,112,.2)" fill-rule="evenodd" stroke="${variant === "destructive" ? "#3d6f91" : "#287a61"}" stroke-width="2"/>${markers}${probeMarkers}<text class="stress-status ${variant}" x="22" y="205">${status}</text></svg>`;
  }
  if (model.kind === "fallback-splice") {
    const final = stress.final;
    const current = variant === "destructive" ? stress.destructive.broken : final;
    const points = [
      ...current.stitched,
      ...model.protected.towns,
      ...model.protected.roads.flat(),
      ...model.protected.rivers.flat()
    ];
    const project = stressProjector(points);
    const line = pathData(current.stitched.map(project));
    const spliceA = project(model.smoothSegment.at(-1));
    const spliceB = project(variant === "destructive" ? [6, 2] : model.rawFallbackSegment[0]);
    const towns = model.protected.towns.map(point => {
      const [x, y] = project(point);
      return `<circle class="stress-town" cx="${round(x)}" cy="${round(y)}" r="4"><title>受保护城镇</title></circle>`;
    }).join("");
    const roads = model.protected.roads.map(road => `<path class="stress-road" d="${pathData(road.map(project))}"/>`).join("");
    const rivers = model.protected.rivers.map(river => `<path class="stress-river" d="${pathData(river.map(project))}"/>`).join("");
    return `<svg class="stress-comparison stress-fallback-${variant}" viewBox="0 0 320 220" role="img" aria-label="${variant === "destructive" ? "断裂回折拼接反例" : "连续拼接与沿岸对象保护"}"><path class="stress-splice-line ${variant}" d="${line}"/>${roads}${rivers}${towns}<line class="stress-splice-gap" x1="${round(spliceA[0])}" y1="${round(spliceA[1])}" x2="${round(spliceB[0])}" y2="${round(spliceB[1])}"/><circle class="stress-splice-end first" cx="${round(spliceA[0])}" cy="${round(spliceA[1])}" r="4"/><circle class="stress-splice-end second" cx="${round(spliceB[0])}" cy="${round(spliceB[1])}" r="4"/><text class="stress-status ${variant}" x="22" y="205">端点距离 ${current.sharedEndpointDistance.toFixed(2)} · 回折 ${current.backtrackSegments} · canonical ${current.canonicalCellsPreserved ? "保持" : "破坏"}</text></svg>`;
  }
  const final = stress.final;
  const points = [...model.concaveBoundary, ...model.irreparableBoundary, ...model.hardBoundary];
  const project = stressProjector(points);
  const boundary = model.concaveBoundary.map(project);
  let triangles = "";
  if (variant === "destructive") {
    const center = project(model.concaveLegacyCenter);
    triangles = boundary.map((point, index) => `<path class="stress-fan-triangle" d="${pathData([center, point, boundary[(index + 1) % boundary.length], center])}"/>`).join("");
  } else {
    triangles = Array.from({length: final.concaveIndices.length / 3}, (_, index) => {
      const triangle = [0, 1, 2].map(offset => boundary[final.concaveIndices[index * 3 + offset]]);
      return `<path class="stress-earcut-triangle" d="${pathData([...triangle, triangle[0]])}"/>`;
    }).join("");
  }
  const fallbackBoundary = (variant === "final" ? model.hardBoundary : model.irreparableBoundary).map(project);
  return `<svg class="stress-comparison stress-earcut-${variant}" viewBox="0 0 320 220" role="img" aria-label="${variant === "destructive" ? "旧中心扇越界反例" : "清洗 Earcut 与安全硬边界补面"}">${triangles}<path class="stress-cell-boundary" d="${pathData([...boundary, boundary[0]])}"/><path class="stress-safe-skip" d="${pathData([...fallbackBoundary, fallbackBoundary[0]])}"/><text class="stress-skip-label" x="190" y="42">${variant === "final" ? `${final.safeSkipReason} → ${final.safeFallback}` : "强制中心扇"}</text><text class="stress-status ${variant}" x="22" y="205">${variant === "destructive" ? `旧中心扇越界 ${final.legacyLeakCount}` : `Earcut 越界 ${final.concaveLeakCount} · 硬边补面 ${final.hardFallbackTriangleCount} · 缺面 ${final.unfilledCells}`}</text></svg>`;
}

function stressProjector(points) {
  const minX = Math.min(...points.map(point => point[0]));
  const maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1]));
  const maxY = Math.max(...points.map(point => point[1]));
  const scale = Math.min(270 / Math.max(1, maxX - minX), 155 / Math.max(1, maxY - minY));
  return point => [
    25 + (point[0] - minX) * scale,
    25 + (point[1] - minY) * scale
  ];
}

function bandTriangleMarkup(fixture, geometry, mode) {
  const model = fixture.bandTriangleComparison;
  if (!model || !geometry) return "";
  const centerline = `<path class="band-centerline" d="${pathData([model.centerA, model.centerB])}"/>`;
  const endpoints = [model.centerA, model.centerB].map(point =>
    `<circle class="band-centerpoint" cx="${round(point[0])}" cy="${round(point[1])}" r="3"/>`
  ).join("");
  if (mode === "exact-surface") {
    return `<g class="band-final" aria-label="精确填色不再提交冗余过渡带">${centerline}${endpoints}<text x="170" y="92">0 个过渡带三角面</text><text x="170" y="106">XOR 填色与描边同源</text></g>`;
  }
  const nonZero = geometry.legacySignedAreas.filter(area => Math.abs(area) > 1e-6);
  const winding = Math.sign(nonZero[0] || 0);
  const triangles = geometry.legacyTriangles.map((points, index) => {
    const opposite = Math.abs(geometry.legacySignedAreas[index]) > 1e-6 && Math.sign(geometry.legacySignedAreas[index]) !== winding;
    return `<path class="band-triangle ${opposite ? "flipped" : "normal"}" d="${pathData([...points, points[0]])}"><title>${opposite ? "反向三角面" : "同向三角面"} · 有向面积 ${geometry.legacySignedAreas[index].toFixed(2)}</title></path>`;
  }).join("");
  return `<g aria-label="旧四三角过渡带">${triangles}${centerline}${endpoints}</g>`;
}

function surfaceMismatchMarkup(comparison) {
  if (!comparison?.legacyMismatchPoints?.length) return "";
  const size = Math.max(2.4, comparison.sampleStep);
  const centroid = comparison.legacyMismatchPoints.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
    .map(value => value / comparison.legacyMismatchPoints.length);
  return `<g class="surface-mismatch" aria-label="旧策略外露楔形">${comparison.legacyMismatchPoints.map(point =>
    `<rect x="${round(point[0] - size / 2)}" y="${round(point[1] - size / 2)}" width="${size}" height="${size}"/>`
  ).join("")}<text x="${round(centroid[0] + 8)}" y="${round(centroid[1] - 8)}">外露楔形 × ${comparison.legacyMismatchPoints.length}</text></g>`;
}

function cellFanMarkup(fixture, geometry, mode) {
  const model = fixture.cellFanComparison;
  if (!model || !geometry) return "";
  const frames = [
    {x: 16, y: 26, width: 136, height: 164},
    {x: 168, y: 26, width: 136, height: 164}
  ];
  const scenes = geometry.cases.map((item, caseIndex) => {
    const frame = frames[caseIndex];
    const transform = fitPointsToFrame(item.points, frame);
    const triangles = mode === "legacy-cell-fan" ? item.legacyTriangles : item.finalTriangles;
    const leakIndices = new Set(mode === "legacy-cell-fan" ? item.legacyLeakIndices : item.finalLeakIndices);
    const fill = item.side === "land" ? "#bde7ef" : "#5e8fc2";
    const background = item.side === "land" ? "#5e8fc2" : "#bde7ef";
    const triangleMarkup = triangles.map((triangle, index) => {
      const points = triangle.map(transform);
      return `<path class="cell-fan-triangle ${item.side} ${leakIndices.has(index) ? "leaked" : ""}" d="${pathData([...points, points[0]])}"><title>triangle ${index}${leakIndices.has(index) ? " · 越界" : ""}</title></path>`;
    }).join("");
    const boundary = item.points.map(transform);
    const center = transform(item.center);
    const leakCount = mode === "legacy-cell-fan" ? item.legacyLeakCount : item.finalLeakCount;
    const sideLabel = item.side === "land" ? "陆单元" : "水单元";
    const status = mode === "legacy-cell-fan" ? `越界 ${leakCount}` : `越界 ${leakCount}`;
    return `<g><rect class="cell-fan-scene" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3" fill="${background}"/><g style="--cell-fill:${fill}">${triangleMarkup}<path class="cell-fan-boundary" d="${pathData([...boundary, boundary[0]])}"/>${mode === "legacy-cell-fan" ? `<circle class="cell-fan-center" cx="${round(center[0])}" cy="${round(center[1])}" r="2.2"/>` : ""}</g><rect class="cell-fan-frame" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3"/><text class="cell-fan-title" x="${frame.x + 5}" y="${frame.y + 12}">cell #${item.cell} · h${item.height} · ${sideLabel}</text><text class="cell-fan-status ${leakCount ? "fail" : "pass"}" x="${frame.x + 5}" y="${frame.y + frame.height - 7}">${status} · 邻高 ${item.neighborHeights.join("/")}</text></g>`;
  }).join("");
  const leakCount = mode === "legacy-cell-fan" ? geometry.legacyLeakCount : geometry.finalLeakCount;
  return `<g class="cell-fan-comparison ${mode}" aria-label="stage-2-1 / 10k 正式单元，越界 ${leakCount}">${scenes}</g>`;
}

function vertexCollapseMarkup(fixture, geometry, mode) {
  const model = fixture.vertexCollapseComparison;
  if (!model || !geometry) return "";
  const edge = mode === "collapsed-grid-surface" ? model.storedEdge : model.resolvedEdge;
  const frame = {x: 42, y: 22, width: 236, height: 176};
  const focus = [
    (model.resolvedEdge[0][0] + model.resolvedEdge[1][0]) / 2,
    (model.resolvedEdge[0][1] + model.resolvedEdge[1][1]) / 2
  ];
  const projectionScale = 0.9;
  const transform = point => [
    frame.x + frame.width / 2 + (point[0] - focus[0]) * model.projection.xCssPerWorld * projectionScale,
    frame.y + frame.height / 2 + (point[1] - focus[1]) * model.projection.yCssPerWorld * projectionScale
  ];
  const start = transform(edge[0]);
  const end = transform(edge[1]);
  const cells = model.cells.map(cell => {
    const precisePoints = cell.storedPoints.map((point, index) => {
      if (mode === "collapsed-grid-surface") return point;
      if (cell.vertexIds[index] === 5331) return model.resolvedEdge[0];
      if (cell.vertexIds[index] === 5519) return model.resolvedEdge[1];
      return point;
    });
    const points = precisePoints.map(transform);
    return `<path class="vertex-collapse-cell ${cell.side}" d="${pathData([...points, points[0]])}"><title>cell #${cell.cell} · h${cell.height}</title></path>`;
  }).join("");
  const endpointMarkup = [start, end].map((point, index) =>
    `<circle class="vertex-collapse-endpoint ${mode === "collapsed-grid-surface" ? "collapsed" : "resolved"}" cx="${round(point[0])}" cy="${round(point[1])}" r="${mode === "collapsed-grid-surface" ? 4.2 : 3}"><title>${index ? "v5519" : "v5331"}</title></circle>`
  ).join("");
  const cssLength = geometry.projectedCssLength.toFixed(2);
  const label = mode === "collapsed-grid-surface"
    ? "v5331 = v5519 · 水面仅单点相接"
    : `精确共享边 · 当前现场 ${cssLength} CSS px`;
  const clipId = `vertex-collapse-clip-${mode}`;
  return `<g class="vertex-collapse-comparison ${mode}"><defs><clipPath id="${clipId}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3"/></clipPath></defs><rect class="vertex-collapse-scene" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3"/><g clip-path="url(#${clipId})">${cells}<path class="vertex-collapse-edge" d="${pathData([start, end])}"/>${endpointMarkup}</g><rect class="vertex-collapse-frame" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3"/><text class="vertex-collapse-label" x="${frame.x + 8}" y="${frame.y + 14}">${label}</text><text class="vertex-collapse-source" x="${frame.x + 8}" y="${frame.y + frame.height - 8}">stage-2-1 / 10k · cell #6255 + #6378</text></g>`;
}

function pixelParityMarkup(fixture, geometry, mode) {
  const model = fixture.pixelParityComparison;
  if (!model || !geometry) return "";
  const legacy = mode === "legacy-pixel-seams";
  const lakeFrame = {x: 18, y: 30, width: 132, height: 154};
  const coastFrame = {x: 170, y: 30, width: 132, height: 154};
  const coastTransform = fitPointsToFrame(model.coastStroke.segment, coastFrame);
  const coastSegment = model.coastStroke.segment.map(coastTransform);
  const strokeWidth = legacy
    ? Math.max(1, geometry.legacyProjectedStrokeCss)
    : Math.max(1, geometry.finalProjectedStrokeCss);
  const driftMarkup = geometry.baseBoundaryDrift.map((item, index) => {
    const frame = {x: lakeFrame.x, y: lakeFrame.y + index * 77, width: lakeFrame.width, height: 72};
    const transform = fitPointsToFrame(
      [...item.sourceEdge, ...item.legacyBaseCurve, ...item.correctionTriangle],
      frame
    );
    const sourceEdge = item.sourceEdge.map(transform);
    const baseEdge = (legacy ? item.legacyBaseCurve : item.sourceEdge).map(transform);
    const correction = item.correctionTriangle.map(transform);
    const status = legacy
      ? `基线偏移 ${item.maximumLegacyDriftCss.toFixed(2)}px`
      : "直岸同源 · 残针 0";
    return `<g>
      <rect class="pixel-parity-water" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3"/>
      <path class="pixel-parity-correction-triangle" d="${pathData([...correction, correction[0]])}"/>
      <path class="pixel-parity-source-edge" d="${pathData(sourceEdge)}"/>
      <path class="pixel-parity-base-curve ${legacy ? "fail" : "pass"}" d="${pathData(baseEdge)}"/>
      <rect class="pixel-parity-frame" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="3"/>
      <text class="pixel-parity-title" x="${frame.x + 5}" y="${frame.y + 12}">${item.label}</text>
      <text class="pixel-parity-status ${legacy ? "fail" : "pass"}" x="${frame.x + 5}" y="${frame.y + frame.height - 6}">${status}</text>
    </g>`;
  }).join("");
  const coastLabel = legacy
    ? `海岸浅带 ${geometry.legacyProjectedStrokeCss.toFixed(2)}px`
    : `海岸细线 ${geometry.finalProjectedStrokeCss.toFixed(2)}px`;
  return `<g class="pixel-parity-comparison ${mode}">
    ${driftMarkup}
    <rect class="pixel-parity-land-bg" x="${coastFrame.x}" y="${coastFrame.y}" width="${coastFrame.width / 2}" height="${coastFrame.height}" rx="3"/>
    <rect class="pixel-parity-water" x="${coastFrame.x + coastFrame.width / 2}" y="${coastFrame.y}" width="${coastFrame.width / 2}" height="${coastFrame.height}" rx="3"/>
    <path class="pixel-parity-coastline" d="${pathData(coastSegment)}" style="stroke-width:${round(strokeWidth)}"/>
    <rect class="pixel-parity-frame" x="${coastFrame.x}" y="${coastFrame.y}" width="${coastFrame.width}" height="${coastFrame.height}" rx="3"/>
    <text class="pixel-parity-title" x="${coastFrame.x + 5}" y="${coastFrame.y + 13}">海岸 #6377 / #6378</text>
    <text class="pixel-parity-status ${legacy ? "fail" : "pass"}" x="${coastFrame.x + 5}" y="${coastFrame.y + coastFrame.height - 8}">${coastLabel}</text>
  </g>`;
}

function fitPointsToFrame(points, frame) {
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paddingX = 10;
  const paddingTop = 20;
  const paddingBottom = 22;
  const scale = Math.min(
    (frame.width - paddingX * 2) / Math.max(1e-6, maxX - minX),
    (frame.height - paddingTop - paddingBottom) / Math.max(1e-6, maxY - minY)
  );
  const offsetX = frame.x + (frame.width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = frame.y + paddingTop + (frame.height - paddingTop - paddingBottom - (maxY - minY) * scale) / 2 - minY * scale;
  return point => [point[0] * scale + offsetX, point[1] * scale + offsetY];
}

function protectedObjectsMarkup(fixture) {
  const protectedObjects = fixture.protectedObjects || {};
  const roads = (protectedObjects.roads || []).map(road => `<g><path class="protected-road-casing" d="${pathData(road.points)}"/><path class="protected-road" d="${pathData(road.points)}"><title>${road.name}</title></path></g>`).join("");
  const rivers = (protectedObjects.rivers || []).map(river => {
    const mouth = river.points.at(-1);
    return `<g><path class="protected-river" d="${pathData(river.points)}"><title>${river.name}</title></path><circle class="protected-mouth" cx="${round(mouth[0])}" cy="${round(mouth[1])}" r="3"><title>${river.name}河口</title></circle></g>`;
  }).join("");
  const towns = (protectedObjects.towns || []).map(town => `<g class="protected-town" transform="translate(${round(town.point[0])} ${round(town.point[1])})"><circle r="4.2"/><circle class="town-core" r="1.45"/><title>${town.name}</title></g>`).join("");
  return `${roads}${rivers}${towns}`;
}

function deviationMarkup(comparison) {
  const maximum = comparison.maximumDeviation;
  const zoom = maximumDeviationZoomViewBox(maximum);
  if (!zoom || zoom.distance <= 1e-6) return "";
  const first = maximum.first.point;
  const second = maximum.second.point;
  const records = comparison.usages.get(maximum.arcId) || [];
  const zoomSides = records.slice(0, 2).map((usage, index) => `<path class="usage-side side-${index ? "second" : "first"}" d="${pathData(usage.points)}"/>`).join("");
  const connector = deviationConnector(first, second);
  return `${connector}<g class="zoom-callout"><rect class="zoom-shell" x="210" y="4" width="118" height="96" rx="4"/><text class="zoom-label" x="218" y="17">最大偏差 ${zoom.distance.toFixed(2)} px</text><svg x="216" y="23" width="106" height="70" viewBox="${[zoom.minX, zoom.minY, zoom.width, zoom.height].map(round).join(" ")}" preserveAspectRatio="xMidYMid meet"><rect class="zoom-background" x="${round(zoom.minX)}" y="${round(zoom.minY)}" width="${round(zoom.width)}" height="${round(zoom.height)}"/>${zoomSides}${connector}</svg></g>`;
}

function deviationConnector(first, second) {
  return `<line class="deviation-connector" x1="${round(first[0])}" y1="${round(first[1])}" x2="${round(second[0])}" y2="${round(second[1])}"/><circle class="deviation-point first" cx="${round(first[0])}" cy="${round(first[1])}" r="2.3"/><circle class="deviation-point second" cx="${round(second[0])}" cy="${round(second[1])}" r="2.3"/>`;
}

function issuesMarkup(result, presentation) {
  const maximum = result.comparison.maximumDeviation;
  const zoom = maximumDeviationZoomViewBox(maximum);
  let deviation = `<p class="deviation-readout">最大独立偏差：<strong>不适用</strong> · 当前案例没有共享 arc</p>`;
  if (presentation.kind === "shared" && zoom) {
    deviation = `<p class="deviation-readout">最大独立偏差：<strong>${zoom.distance.toFixed(2)} px</strong> · ${maximum.arcId} · ${maximum.first.regionId} ↔ ${maximum.second.regionId}</p>`;
  } else if (presentation.kind === "shared") {
    deviation = `<p class="deviation-readout">最大独立偏差：<strong>不可用</strong> · 偏差坐标无效</p>`;
  }
  const diagnostics = mergeVisualDiagnostics(result);
  const issues = diagnostics.length
    ? `<ol>${diagnostics.map(item => `<li class="${item.source}">${item.message}</li>`).join("")}</ol>`
    : "<p class=\"no-issues\">当前没有几何验收问题。</p>";
  return `<header><h2>当前验收与形状诊断</h2><span class="issue-status ${result.ok ? "pass" : "fail"}">${result.ok ? "验收通过" : `${result.issues.length} 项验收失败`}</span></header>${deviation}${issues}`;
}

function pathData(points) {
  if (!points.length) return "";
  return `M${points.map((point, index) => `${index ? "L" : ""}${round(point[0])},${round(point[1])}`).join("")}`;
}

function metricsMarkup(metrics) {
  const constraintsPassed = metrics.caseConstraints.filter(item => item.pass).length;
  const p95 = Object.entries(metrics.areaP95).map(([kind, value]) => `${kind} ${value.toFixed(3)}%`).join(" · ");
  const coastNotice = metrics.shapePolicy === "notice";
  const values = [
    ["共享 arc", metrics.sharedArcCount, ""],
    ["独立处理误差", `${metrics.independentError.toFixed(2)} px`, metrics.independentError > 0 ? "bad" : ""],
    ["共享缝隙", `${metrics.seamGap.toFixed(2)} px`, "good"],
    ["coverage overlap", metrics.coverageOverlap, metrics.coverageOverlap ? "bad" : "good"],
    ["区域新增交叉", metrics.regionCrossings, metrics.regionCrossings ? "bad" : "good"],
    [coastNotice ? "面积相对误差 P95（仅提示）" : "面积相对误差 P95", p95 || "0%", coastNotice ? "notice" : metrics.maxAreaError > 1 ? "bad" : "good"],
    [coastNotice ? "双向 Hausdorff（仅提示）" : "双向 Hausdorff / 门槛", coastNotice ? `${metrics.hausdorff.toFixed(2)} px` : `${metrics.hausdorff.toFixed(2)} / ${metrics.hausdorffLimit.toFixed(0)} px`, coastNotice ? "notice" : metrics.hausdorff > metrics.hausdorffLimit ? "bad" : "good"],
    ["最大位移", `${metrics.maxDisplacement.toFixed(2)} px`, ""],
    ["案例约束", `${constraintsPassed}/${metrics.caseConstraints.length}`, constraintsPassed === metrics.caseConstraints.length ? "good" : "bad"],
    ["自交 / 非法环", `${metrics.selfIntersections} / ${metrics.validRings ? 0 : 1}`, metrics.selfIntersections || !metrics.validRings ? "bad" : "good"]
  ];
  if (metrics.surfaceClassification) {
    values.push(
      ["raw XOR processed", `${metrics.surfaceClassification.xorSamples} 点 / ${metrics.surfaceClassification.xorArea.toFixed(0)} px²`, "notice"],
      ["旧策略未覆盖", `${metrics.surfaceClassification.legacyMismatchSamples} 点`, metrics.surfaceClassification.legacyMismatchSamples ? "bad" : "good"],
      ["XOR 修补三角形", `${metrics.surfaceClassification.correctionTriangleCount} 个`, metrics.surfaceClassification.correctionDegenerateTriangles ? "bad" : "good"],
      ["修补后错分", `${metrics.surfaceClassification.sharedMismatchSamples} 点`, metrics.surfaceClassification.sharedMismatchSamples ? "bad" : "good"]
    );
  }
  if (metrics.bandTriangleGeometry) {
    values.push(
      ["旧带反向三角面", metrics.bandTriangleGeometry.legacyOppositeWindingCount, metrics.bandTriangleGeometry.legacyOppositeWindingCount ? "bad" : "good"],
      ["最终冗余过渡面", metrics.bandTriangleGeometry.finalTriangleCount, metrics.bandTriangleGeometry.finalTriangleCount ? "bad" : "good"]
    );
  }
  if (metrics.cellFanGeometry) {
    values.push(
      ["正式来源", `${metrics.cellFanGeometry.source.seed} / ${metrics.cellFanGeometry.source.cellsTarget}`, "notice"],
      ["正式原始 cell", metrics.cellFanGeometry.cases.map(item => `#${item.cell}`).join(" / "), "notice"],
      ["旧中心扇越界", `${metrics.cellFanGeometry.legacyLeakCount} 个`, metrics.cellFanGeometry.legacyLeakCount ? "bad" : "good"],
      ["旧 0.1 世界单位异侧采样", `${metrics.cellFanGeometry.legacyRasterLeakSamples} 点`, metrics.cellFanGeometry.legacyRasterLeakSamples ? "bad" : "good"],
      ["Earcut 最终越界", `${metrics.cellFanGeometry.finalLeakCount} 个 / ${metrics.cellFanGeometry.finalRasterLeakSamples} 点`, metrics.cellFanGeometry.finalLeakCount || metrics.cellFanGeometry.finalRasterLeakSamples ? "bad" : "good"]
    );
  }
  if (metrics.pixelParityGeometry) {
    values.push(
      ["正式来源", `${metrics.pixelParityGeometry.source.seed} / ${metrics.pixelParityGeometry.source.cellsTarget}`, "notice"],
      ["底面 / XOR 基线漂移", `${metrics.pixelParityGeometry.legacyBaseDriftCases} → ${metrics.pixelParityGeometry.finalBaseDriftCases}`, metrics.pixelParityGeometry.finalBaseDriftCases ? "bad" : "good"],
      ["旧底面最大偏移", `${metrics.pixelParityGeometry.maximumLegacyBaseDriftCss.toFixed(2)} CSS px`, metrics.pixelParityGeometry.maximumLegacyBaseDriftCss >= 1 ? "notice" : "good"],
      ["裸露边缘", `${metrics.pixelParityGeometry.legacyUncoveredBoundaryEdges} → ${metrics.pixelParityGeometry.finalUncoveredBoundaryEdges}`, metrics.pixelParityGeometry.finalUncoveredBoundaryEdges ? "bad" : "good"],
      ["海岸截图投影线宽", `${metrics.pixelParityGeometry.legacyProjectedStrokeCss.toFixed(2)} → ${metrics.pixelParityGeometry.finalProjectedStrokeCss.toFixed(2)} CSS px`, metrics.pixelParityGeometry.finalProjectedStrokeCss > metrics.pixelParityGeometry.maximumFinalCssWidth ? "bad" : "good"]
    );
  }
  if (metrics.stressAnalysis) {
    const stress = metrics.stressAnalysis;
    const final = stress.final;
    values.push(
      ["高风险类型", stress.kind, "notice"],
      ["最终错侧像素", final.wrongSidePixels ?? 0, final.wrongSidePixels ? "bad" : "good"],
      ["最终最长像素针", final.longestNeedlePixels ?? 0, final.longestNeedlePixels ? "bad" : "good"],
      ["最终冲突覆盖", final.conflictingPixels ?? 0, final.conflictingPixels ? "bad" : "good"]
    );
    if (final.worstPhase) {
      values.push(["最坏相位定位", `DPR ${final.worstPhase.dpr} / zoom ${final.worstPhase.zoom} / offset ${final.worstPhase.offset.join(",")}`, "notice"]);
    }
    if (stress.destructive?.deleteCover) {
      values.push(["删封口 framebuffer 缝隙", `${final.seamPixels ?? 0} → ${stress.destructive.deleteCover.seamPixels ?? 0}`, "bad"]);
    }
    if (stress.destructive?.wrongDirection) {
      values.push(["反向语义错侧像素", stress.destructive.wrongDirection.wrongSidePixels ?? 0, "bad"]);
    }
    if (stress.destructive?.endpointQuantization) {
      values.push(["端点量化错侧像素", stress.destructive.endpointQuantization.wrongSidePixels ?? 0, "bad"]);
    }
    if (stress.kind === "multi-ring") {
      values.push(
        ["湖洞 / 水道 / 陆地连通", `${final.holePreserved ? "是" : "否"} / ${final.channelPreserved ? "是" : "否"} / ${final.landConnected ? "是" : "否"}`, final.holePreserved && final.channelPreserved && final.landConnected ? "good" : "bad"],
        ["XOR / Earcut 三角形", stress.correctionTriangleCount, "notice"]
      );
    }
    if (stress.kind === "fallback-splice") {
      values.push(
        ["拼接端点距离", final.sharedEndpointDistance, final.sharedEndpointDistance ? "bad" : "good"],
        ["零长 / 回折段", `${final.zeroLengthSegments} / ${final.backtrackSegments}`, final.zeroLengthSegments || final.backtrackSegments ? "bad" : "good"],
        ["canonical / 城镇 / 道路 / 河口", `${final.canonicalCellsPreserved ? "是" : "否"} / ${final.townProtected ? "是" : "否"} / ${final.roadProtected ? "是" : "否"} / ${final.mouthProtected ? "是" : "否"}`, final.passed ? "good" : "bad"],
        ["破坏端点距离", stress.destructive.broken.sharedEndpointDistance, "bad"]
      );
    }
    if (stress.kind === "earcut-safe-failure") {
      values.push(
        ["清洗点数", `${final.sourcePointCount} → ${final.cleanedPointCount}`, "good"],
        ["强凹 Earcut / 越界", `${final.concaveTriangleCount} / ${final.concaveLeakCount}`, final.concaveLeakCount ? "bad" : "good"],
        ["平滑失败 / 安全兜底", `${final.safeSkipReason} → ${final.safeFallback}`, final.unfilledCells ? "bad" : "good"],
        ["硬边三角 / 越界 / 缺面", `${final.hardFallbackTriangleCount} / ${final.hardFallbackLeaks} / ${final.unfilledCells}`, final.hardFallbackLeaks || final.unfilledCells ? "bad" : "good"],
        ["旧中心扇越界", final.legacyLeakCount, final.legacyLeakCount ? "bad" : "good"]
      );
    }
  }
  const cards = values.map(([label, value, className]) => `<div class="metric ${className}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  const constraints = metrics.caseConstraints.map(item => `<div class="constraint ${item.pass ? "pass" : "fail"}"><span>${item.label}</span><strong>${formatConstraintValue(item.value)}</strong></div>`).join("");
  return `${cards}<div class="constraint-strip">${constraints}</div>`;
}

function formatConstraintValue(value) {
  if (typeof value !== "number") return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function renderAllResults() {
  const report = runAllFixtures(FIXTURES, state.algorithmId, state.options);
  elements["result-grid"].innerHTML = report.results.map(result => `<div class="result-item ${result.ok ? "pass" : "fail"}"><span>${result.fixtureName}</span><strong>${result.ok ? "通过" : "失败"}</strong></div>`).join("");
  elements["result-summary"].textContent = `${report.summary.passed}/${report.summary.fixtures} 通过 · ${report.summary.sharedArcs} 条共享 arc · ${report.summary.selfIntersections} 处自交`;
  setStatus(report.ok ? `全部 ${report.summary.fixtures} 个用例通过` : `${report.summary.failed} 个用例失败`, report.ok);
}

function setStatus(text, passed) {
  elements["global-status"].textContent = text;
  elements["global-status"].className = `status-pill ${passed ? "pass" : "fail"}`;
}

function round(value) {
  return Number(value.toFixed(2));
}
