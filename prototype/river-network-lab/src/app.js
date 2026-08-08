import {FIXTURES, FIXTURE_BY_ID} from "./fixtures.js";
import {auditRiverNetwork} from "./audit.js";
import {analyzeConfluences, analyzeHydrology, analyzeParentGraph, runConfluenceCandidate, runDAGCandidate, runHydrologyCandidate} from "./algorithms.js";

const state = {fixtureId: FIXTURES[0].id};
const elements = Object.fromEntries([
  "status", "fixture-list", "case-category", "case-name", "case-description", "case-metrics",
  "map-view", "case-state", "issue-list", "algorithm-result", "confluence-result", "hydrology-result", "matrix", "matrix-summary", "run-all"
].map(id => [id, document.getElementById(id)]));

function initialize() {
  elements["fixture-list"].innerHTML = FIXTURES.map((fixture, index) => `<button class="fixture-button" data-fixture="${fixture.id}"><span>${index + 1}. ${fixture.name}</span><small>${fixture.category}</small></button>`).join("");
  elements["fixture-list"].addEventListener("click", event => {
    const button = event.target.closest("[data-fixture]");
    if (!button) return;
    state.fixtureId = button.dataset.fixture;
    render();
  });
  elements["run-all"].addEventListener("click", renderMatrix);
  render();
  renderMatrix();
  window.riverNetworkLab = Object.freeze({FIXTURES, FIXTURE_BY_ID, auditRiverNetwork, analyzeConfluences, analyzeHydrology, analyzeParentGraph, runConfluenceCandidate, runDAGCandidate, runHydrologyCandidate});
}

function render() {
  const fixture = FIXTURE_BY_ID.get(state.fixtureId);
  const result = auditRiverNetwork(fixture);
  const expected = new Set(fixture.expectedIssueIds || []);
  const found = new Set(result.issues.map(issue => issue.id));
  const expectedHit = [...expected].every(id => found.has(id));
  document.querySelectorAll("[data-fixture]").forEach(button => button.classList.toggle("active", button.dataset.fixture === state.fixtureId));
  elements["case-category"].textContent = `${fixture.category.toUpperCase()} · FIXTURE`;
  elements["case-name"].textContent = fixture.name;
  elements["case-description"].textContent = fixture.description;
  elements["case-metrics"].textContent = `${result.metrics.rivers} 条河流 · ${result.metrics.segments} 段 · ${result.metrics.crossings} 处交叉`;
  elements["case-state"].textContent = expectedHit ? "预期命中" : "夹具缺口";
  elements["case-state"].className = expectedHit ? "pass" : "fail";
  elements["status"].textContent = expectedHit ? "当前夹具已命中" : "当前夹具缺少证据";
  elements["status"].className = `status-pill ${expectedHit ? "pass" : "fail"}`;
  elements["map-view"].innerHTML = renderMap(fixture, result);
  elements["issue-list"].innerHTML = issueMarkup(result, fixture);
  elements["algorithm-result"].innerHTML = algorithmMarkup(runDAGCandidate(fixture));
  elements["confluence-result"].innerHTML = confluenceMarkup(runConfluenceCandidate(fixture));
  elements["hydrology-result"].innerHTML = hydrologyMarkup(runHydrologyCandidate(fixture));
}

function renderMap(fixture, result) {
  const colors = new Map(result.issues.flatMap(issue => issue.riverIds.map(id => [id, issue.severity === "info" ? "#d7ba72" : "#e47b72"])));
  const rivers = fixture.rivers.map(river => {
    const points = river.points.map(point => point.join(",")).join(" ");
    const color = colors.get(Number(river.id)) || "#69b7e8";
    return `<polyline class="river-line" points="${points}" stroke="${color}"><title>${river.name} · #${river.id}</title></polyline><text class="river-label" x="${river.points[0][0] + 4}" y="${river.points[0][1] - 5}">#${river.id}</text>`;
  }).join("");
  const markers = result.issues.flatMap(issue => (issue.points || []).map(point => `<circle class="issue-point ${issue.severity === "info" ? "info" : "error"}" cx="${point[0]}" cy="${point[1]}" r="4"><title>${issue.id}</title></circle>`)).join("");
  return `<svg viewBox="0 0 330 210" role="img" aria-label="${fixture.name}河流网络">${rivers}${markers}</svg>`;
}

function issueMarkup(result, fixture) {
  const expected = new Set(fixture.expectedIssueIds || []);
  if (!result.issues.length) return "<p class=\"empty\">没有发现诊断项。</p>";
  return `<p class="expected">预期：${[...expected].join("、") || "无"}</p><ol>${result.issues.map(issue => `<li class="${issue.severity === "info" ? "info" : "error"}"><strong>${issue.id}</strong><span>${issue.message}</span><small>河流 ${issue.riverIds.join(", ") || "—"} · ${formatMetrics(issue.metrics)}</small></li>`).join("")}</ol>`;
}

function renderMatrix() {
  const results = FIXTURES.map(fixture => {
    const result = auditRiverNetwork(fixture);
    const found = new Set(result.issues.map(issue => issue.id));
    const hit = (fixture.expectedIssueIds || []).every(id => found.has(id));
    return {fixture, result, hit};
  });
  const passed = results.filter(item => item.hit).length;
  elements["matrix-summary"].textContent = `${passed}/${results.length} 个夹具命中预期`;
  elements["matrix"].innerHTML = results.map(({fixture, result, hit}) => `<button class="matrix-item ${hit ? "pass" : "fail"}" data-fixture="${fixture.id}"><span>${fixture.name}</span><strong>${hit ? "命中" : "缺口"}</strong><small>${result.issues.map(issue => issue.id).join(" · ") || "无诊断"}</small></button>`).join("");
  elements["matrix"].querySelectorAll("[data-fixture]").forEach(button => button.addEventListener("click", () => { state.fixtureId = button.dataset.fixture; render(); }));
}

function algorithmMarkup(candidate) {
  const graph = analyzeParentGraph({rivers: candidate.candidateRivers || []});
  const source = candidate.accepted ? `确定性拓扑序：${candidate.topologicalOrder.join(" → ") || "空"}` : `拒绝原因：${candidate.rejection.reason}`;
  return `<div class="algorithm-box ${candidate.accepted ? "pass" : "fail"}"><strong>304-B 父子 DAG 候选：${candidate.accepted ? "接受" : "拒绝"}</strong><span>${source}</span><small>visited ${candidate.metrics.visited}/${candidate.metrics.rivers} · cycles ${candidate.metrics.cycles} · missing ${candidate.metrics.missingParents} · self ${candidate.metrics.selfParents} · 重算 ${graph.metrics.rivers} 条</small></div>`;
}

function confluenceMarkup(candidate) {
  const detail = candidate.accepted ? `锚点 ${candidate.metrics.attached} 个 · 改写末端 ${candidate.metrics.changedPoints} 个` : `候选拒绝：${candidate.rejection.reason}`;
  return `<div class="algorithm-box ${candidate.accepted ? "pass" : "fail"}"><strong>304-C 汇流锚点候选：${candidate.accepted ? "接受" : "拒绝"}</strong><span>${detail}</span><small>关系 ${candidate.metrics.relations} · 未贴合 ${candidate.metrics.unattached} · 保护出口 ${candidate.metrics.protectedOutlets} · 最大距离 ${candidate.metrics.maxDistance}</small></div>`;
}

function hydrologyMarkup(candidate) {
  const detail = candidate.accepted ? `流量越级 ${candidate.metrics.dischargeAfter} · 宽度越级 ${candidate.metrics.widthAfter}` : `候选拒绝：${candidate.rejection.reason}`;
  return `<div class="algorithm-box ${candidate.accepted ? "pass" : "fail"}"><strong>304-D 流量 / 宽度候选：${candidate.accepted ? "可验收" : "拒绝"}</strong><span>${detail}</span><small>隐藏视觉碎片 ${candidate.metrics.hiddenFragments} · 保护出口 ${candidate.metrics.preservedProtected} · 保留锚点延长 ${candidate.metrics.extendedToConfluence}</small></div>`;
}

function formatMetrics(metrics = {}) {
  return Object.entries(metrics).map(([key, value]) => `${key}=${typeof value === "number" ? Number(value.toFixed(2)) : value}`).join("，");
}

initialize();
