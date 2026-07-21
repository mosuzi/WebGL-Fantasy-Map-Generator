import {ALGORITHMS, DEFAULT_OPTIONS} from "./algorithms.js";
import {FIXTURES, FIXTURE_BY_ID} from "./fixtures.js";
import {validateFixture, runAllFixtures} from "./validation.js";

const state = {
  fixtureId: FIXTURES[0].id,
  algorithmId: "recommended",
  options: {...DEFAULT_OPTIONS},
  layers: {raw: true, nodes: true, ids: false, error: true}
};

const elements = Object.fromEntries([
  "fixture-list", "algorithm-list", "threshold", "threshold-value", "smoothness", "smoothness-value",
  "max-displacement", "displacement-value", "show-raw", "show-nodes", "show-ids", "show-error",
  "run-all", "global-status", "case-category", "case-name", "case-description", "independent-view",
  "shared-view", "metrics", "result-grid", "result-summary"
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
  document.querySelectorAll("[data-fixture]").forEach(button => button.classList.toggle("active", button.dataset.fixture === state.fixtureId));
  document.querySelectorAll("[data-algorithm]").forEach(button => button.classList.toggle("active", button.dataset.algorithm === state.algorithmId));
  elements["case-category"].textContent = `${fixture.category.toUpperCase()} · ${state.algorithmId}`;
  elements["case-name"].textContent = fixture.name;
  elements["case-description"].textContent = fixture.description;
  elements["independent-view"].innerHTML = renderSvg(result.comparison, fixture, false);
  elements["shared-view"].innerHTML = renderSvg(result.snapshot, fixture, true);
  elements.metrics.innerHTML = metricsMarkup(result.metrics);
  setStatus(result.ok ? "当前用例通过" : `当前用例失败 · ${result.issues.length}`, result.ok);
}

function renderSvg(model, fixture, shared) {
  const regions = model.regions.map(region => `<path class="region" fill="${region.fill}" fill-rule="evenodd" d="${region.rings.map(pathData).join(" ")}"><title>${region.name}</title></path>`).join("");
  const raw = state.layers.raw ? fixture.arcs.map(arc => `<path class="raw-line" d="${pathData(arc.points)}"/>`).join("") : "";
  const arcs = shared ? [...model.arcs.values()].map(arc => `<path class="arc-line ${arc.kind}" d="${pathData(arc.points)}"/>`).join("") : "";
  const errors = !shared && state.layers.error ? [...model.usages.entries()].flatMap(([, usages]) => usages.length > 1 ? usages.map(usage => `<path class="error-line" d="${pathData(usage.points)}"/>`) : []).join("") : "";
  const safe = shared && state.layers.error ? [...model.arcs.values()].filter(arc => arc.kind === "state" || arc.kind === "province").map(arc => `<path class="safe-band" d="${pathData(arc.points)}"/>`).join("") : "";
  const nodes = state.layers.nodes ? fixture.arcs.flatMap(arc => [arc.points[0], arc.points.at(-1)]).map(point => `<circle class="node" cx="${point[0]}" cy="${point[1]}" r="2.8"/>`).join("") : "";
  const ids = state.layers.ids ? fixture.arcs.map(arc => {
    const midpoint = arc.points[Math.floor((arc.points.length - 1) / 2)];
    return `<text class="arc-id" x="${midpoint[0] + 4}" y="${midpoint[1] - 4}">${arc.id}</text>`;
  }).join("") : "";
  return `<svg viewBox="-8 -8 336 236" role="img" aria-label="${shared ? "共享 ArcRef 快照" : "独立 polygon 失败对照"}">${regions}${raw}${errors}${safe}${arcs}${nodes}${ids}</svg>`;
}

function pathData(points) {
  if (!points.length) return "";
  return `M${points.map((point, index) => `${index ? "L" : ""}${round(point[0])},${round(point[1])}`).join("")}`;
}

function metricsMarkup(metrics) {
  const constraintsPassed = metrics.caseConstraints.filter(item => item.pass).length;
  const p95 = Object.entries(metrics.areaP95).map(([kind, value]) => `${kind} ${value.toFixed(3)}%`).join(" · ");
  const values = [
    ["共享 arc", metrics.sharedArcCount, ""],
    ["独立处理误差", `${metrics.independentError.toFixed(2)} px`, metrics.independentError > 0 ? "bad" : ""],
    ["共享缝隙", `${metrics.seamGap.toFixed(2)} px`, "good"],
    ["coverage overlap", metrics.coverageOverlap, metrics.coverageOverlap ? "bad" : "good"],
    ["区域新增交叉", metrics.regionCrossings, metrics.regionCrossings ? "bad" : "good"],
    ["面积相对误差 P95", p95 || "0%", metrics.maxAreaError > 1 ? "bad" : "good"],
    ["双向 Hausdorff / 门槛", `${metrics.hausdorff.toFixed(2)} / ${metrics.hausdorffLimit.toFixed(0)} px`, metrics.hausdorff > metrics.hausdorffLimit ? "bad" : "good"],
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
