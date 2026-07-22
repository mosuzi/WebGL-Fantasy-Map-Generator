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
  const presentation = resolveComparisonPresentation(result.metrics.sharedArcCount);
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
  const firstModel = presentation.kind === "shared" ? result.comparison : buildRawModel(fixture);
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

function renderSvg(model, fixture, mode, result) {
  const regions = model.regions.map(region => `<path class="region" fill="${region.fill}" fill-rule="evenodd" d="${region.rings.map(pathData).join(" ")}"><title>${region.name}</title></path>`).join("");
  const raw = state.layers.raw && mode !== "raw" ? fixture.arcs.map(arc => `<path class="raw-line" d="${pathData(arc.points)}"/>`).join("") : "";
  const arcs = mode === "shared" || mode === "processed" ? [...model.arcs.values()].map(arc => `<path class="arc-line ${arc.kind}" d="${pathData(arc.points)}"/>`).join("") : "";
  const sides = mode === "independent" && state.layers.error
    ? [...model.usages.values()].flatMap(usages => usages.slice(0, 2).map((usage, index) => `<path class="usage-side side-${index ? "second" : "first"}" d="${pathData(usage.points)}"/>`)).join("")
    : "";
  const sameSource = mode === "shared" && state.layers.error
    ? [...result.comparison.usages.keys()].map(arcId => model.arcs.get(arcId)).filter(Boolean).map(arc => `<path class="same-source-line" d="${pathData(arc.points)}"/>`).join("")
    : "";
  const deviation = mode === "independent" && state.layers.error ? deviationMarkup(result.comparison) : "";
  const protectedObjects = protectedObjectsMarkup(fixture);
  const nodes = state.layers.nodes ? fixture.arcs.flatMap(arc => [arc.points[0], arc.points.at(-1)]).map(point => `<circle class="node" cx="${point[0]}" cy="${point[1]}" r="2.8"/>`).join("") : "";
  const ids = state.layers.ids ? fixture.arcs.map(arc => {
    const midpoint = arc.points[Math.floor((arc.points.length - 1) / 2)];
    return `<text class="arc-id" x="${midpoint[0] + 4}" y="${midpoint[1] - 4}">${arc.id}</text>`;
  }).join("") : "";
  const labels = {
    independent: "逐区域独立处理对照",
    shared: "共享弧线处理结果",
    raw: "原始轮廓",
    processed: "处理后轮廓"
  };
  return `<svg viewBox="-8 -8 336 236" role="img" aria-label="${labels[mode]}">${regions}${raw}${sides}${sameSource}${arcs}${protectedObjects}${deviation}${nodes}${ids}</svg>`;
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
