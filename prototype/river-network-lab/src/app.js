import {generatePlaceholderMap} from "../../../app/webgl-generator/src/generator/index.js";
import {FIXTURES, FIXTURE_BY_ID, SAFETY_FIXTURES} from "./fixtures.js";
import {auditRiverNetwork, snapshotGeneratedMap} from "./audit.js";
import {analyzeConfluences, analyzeHydrology, analyzeParentGraph, compareConfluenceCandidate, runConfluenceCandidate, runDAGCandidate, runHydrologyCandidate} from "./algorithms.js";

const GENERATED_CASES = [10000, 50000, 100000].map(cellsTarget => ({
  id: `generated-${cellsTarget}`,
  name: `${cellsTarget / 1000}k 固定生成快照`,
  category: "generated",
  description: `公开固定 seed 304-river-network-lab-${cellsTarget} 的只读河网快照。`,
  cellsTarget,
  seed: `304-river-network-lab-${cellsTarget}`
}));
const generatedExpectations = new Map([
  [10000, {dag: accepted(), confluence: accepted(), hydrology: accepted()}],
  [50000, {dag: accepted(), confluence: accepted(), hydrology: accepted()}],
  [100000, {dag: accepted(), confluence: accepted(), hydrology: accepted()}]
]);
const generatedCache = new Map();
const state = {caseId: FIXTURES[0].id, renderToken: 0, evidence: null};
const elements = Object.fromEntries([
  "status", "candidate-status", "fixture-list", "generated-list", "case-category", "case-name", "case-description", "case-metrics",
  "baseline-view", "candidate-view", "case-state", "issue-list", "algorithm-result", "confluence-result", "hydrology-result", "matrix", "matrix-summary", "run-all"
].map(id => [id, document.getElementById(id)]));

async function initialize() {
  elements["fixture-list"].innerHTML = FIXTURES.map((fixture, index) => caseButton(fixture, `${index + 1}. `)).join("");
  elements["generated-list"].innerHTML = GENERATED_CASES.map(item => caseButton(item)).join("");
  document.querySelectorAll("[data-case]").forEach(button => button.addEventListener("click", () => {
    state.caseId = button.dataset.case;
    render();
  }));
  elements["run-all"].addEventListener("click", renderMatrix);
  await render();
  renderMatrix();
  window.riverNetworkLab = Object.freeze({
    FIXTURES,
    FIXTURE_BY_ID,
    SAFETY_FIXTURES,
    GENERATED_CASES,
    auditRiverNetwork,
    analyzeConfluences,
    analyzeHydrology,
    analyzeParentGraph,
    compareConfluenceCandidate,
    runConfluenceCandidate,
    runDAGCandidate,
    runHydrologyCandidate,
    getEvidence: () => structuredClone(state.evidence)
  });
}

async function render() {
  const token = ++state.renderToken;
  setLoadingState();
  const current = await loadCase(state.caseId);
  if (token !== state.renderToken) return;
  const result = auditRiverNetwork(current.snapshot);
  const dag = runDAGCandidate(current.snapshot);
  const confluenceAnalysis = analyzeConfluences(current.snapshot);
  const comparison = compareConfluenceCandidate(current.snapshot);
  const confluence = comparison.candidate;
  const hydrology = comparison.hydrologyCandidate;
  const evidence = evaluateEvidence(current, result, {dag, confluence, hydrology});
  const candidateRivers = hydrology.candidateRivers || confluence.candidateRivers || current.snapshot.rivers;
  document.querySelectorAll("[data-case]").forEach(button => button.classList.toggle("active", button.dataset.case === state.caseId));
  elements["case-category"].textContent = `${current.category.toUpperCase()} · ${current.kind === "fixture" ? "FIXTURE" : "FIXED SEED"}`;
  elements["case-name"].textContent = current.name;
  elements["case-description"].textContent = current.description;
  elements["case-metrics"].textContent = `${result.metrics.rivers} 条河流 · ${result.metrics.segments} 段 · ${result.metrics.crossings} 处交叉`;
  elements["case-state"].textContent = evidence.ok ? "证据通过" : "证据缺口";
  elements["case-state"].className = evidence.ok ? "pass" : "fail";
  elements["status"].textContent = evidence.ok ? "evidenceOk：true" : "evidenceOk：false";
  elements["status"].className = `status-pill ${evidence.ok ? "pass" : "fail"}`;
  elements["candidate-status"].textContent = `candidateDecision：${hydrology.status}`;
  elements["candidate-status"].className = `status-pill ${hydrology.accepted ? "pass" : "fail"}`;
  const baselineDraw = await renderMapAndObserveFrame(elements["baseline-view"], renderMap(current.snapshot.rivers, result, {label: `${current.name} baseline`}));
  if (token !== state.renderToken) return;
  const candidateDraw = await renderMapAndObserveFrame(elements["candidate-view"], renderMap(candidateRivers, result, {
    label: `${current.name} candidate`,
    candidate: true,
    rejectionIssues: confluence.accepted ? [] : confluenceAnalysis.issues
  }));
  if (token !== state.renderToken) return;
  const runtimeGates = runtimeGateEvidence();
  state.evidence = {
    caseId: current.id,
    evidenceOk: evidence.ok,
    candidateDecision: stageSummary(hydrology),
    stages: {dag: stageSummary(dag), confluence: stageSummary(confluence), hydrology: stageSummary(hydrology)},
    baselineRivers: current.snapshot.rivers.length,
    candidateRivers: candidateRivers.length,
    relations: confluence.relations.map(relation => ({childId: relation.childId, parentId: relation.parentId, status: relation.status, reason: relation.reason, attachmentSource: relation.attachmentSource, attachmentMode: relation.attachmentMode, distance: relation.distance, hydrologyDistance: relation.hydrologyDistance, tolerance: relation.tolerance.total, curvature: relation.curve?.curvature || 0, safety: relation.safety?.gates || null})),
    comparison: {
      ...comparison.evidence,
      draw: {
        method: "dom-commit-plus-double-request-animation-frame",
        paintOpportunityObserved: baselineDraw.paintOpportunityObserved && candidateDraw.paintOpportunityObserved,
        baseline: baselineDraw,
        candidate: candidateDraw,
        baselineMs: baselineDraw.frameReadyMs,
        candidateMs: candidateDraw.frameReadyMs,
        deltaMs: roundTiming(candidateDraw.frameReadyMs - baselineDraw.frameReadyMs)
      }
    },
    runtimeGates
  };
  elements["issue-list"].innerHTML = issueMarkup(result, current, evidence);
  elements["algorithm-result"].innerHTML = algorithmMarkup(dag);
  elements["confluence-result"].innerHTML = confluenceMarkup(confluence);
  elements["hydrology-result"].innerHTML = hydrologyMarkup(hydrology);
}

async function renderMapAndObserveFrame(element, markup) {
  const commitStarted = performance.now();
  element.innerHTML = markup;
  const domCommitMs = performance.now() - commitStarted;
  const frameStarted = performance.now();
  const frameTimestamps = await doubleAnimationFrame();
  const paintEntries = performance.getEntriesByType("paint").map(entry => ({name: entry.name, startTime: roundTiming(entry.startTime)}));
  return {
    domCommitMs: roundTiming(domCommitMs),
    frameReadyMs: roundTiming(performance.now() - frameStarted),
    rafCallbacks: frameTimestamps.length,
    frameTimestamps: frameTimestamps.map(roundTiming),
    paintOpportunityObserved: frameTimestamps.length === 2 && frameTimestamps[1] >= frameTimestamps[0],
    paintEntries
  };
}

function doubleAnimationFrame() {
  return new Promise(resolve => {
    requestAnimationFrame(first => requestAnimationFrame(second => resolve([first, second])));
  });
}

function runtimeGateEvidence() {
  const canvasCount = document.querySelectorAll("canvas").length;
  return {
    health: {applicable: false, reason: "standalone-lab-no-health-monitor", errors: 0},
    webgl: {applicable: false, reason: "standalone-svg-lab", canvasCount, contexts: 0},
    gpuUpload: {applicable: false, reason: "standalone-svg-lab", baselineMs: 0, candidateMs: 0, deltaMs: 0}
  };
}

async function loadCase(caseId) {
  const fixture = FIXTURE_BY_ID.get(caseId);
  if (fixture) return {id: fixture.id, name: fixture.name, category: fixture.category, description: fixture.description, kind: "fixture", snapshot: fixture, acceptance: fixture.acceptance};
  const descriptor = GENERATED_CASES.find(item => item.id === caseId) || GENERATED_CASES[0];
  if (!generatedCache.has(descriptor.id)) {
    await new Promise(resolve => setTimeout(resolve, 0));
    const map = generatePlaceholderMap({seed: descriptor.seed, cellsTarget: descriptor.cellsTarget, heightmapTemplate: "continents", riverNetworkCandidate: false});
    generatedCache.set(descriptor.id, snapshotGeneratedMap(map));
  }
  return {...descriptor, kind: "generated", snapshot: generatedCache.get(descriptor.id), acceptance: {stages: generatedExpectations.get(descriptor.cellsTarget)}};
}

function evaluateEvidence(current, result, stages) {
  const failures = [];
  if (current.kind === "fixture") {
    const expected = normalizeCounts(current.acceptance.issueCounts);
    const found = issueCounts(result);
    if (JSON.stringify(found) !== JSON.stringify(expected)) failures.push(`诊断不精确：${JSON.stringify(found)}`);
  }
  for (const [stage, expectation] of Object.entries(current.acceptance.stages)) {
    const actual = stages[stage];
    if (actual.status !== expectation.status || (actual.rejection?.reason || null) !== expectation.reason) failures.push(`${stage}=${actual.status}/${actual.rejection?.reason || "none"}`);
  }
  if (!stages.confluence.accepted && stages.hydrology.status === "accepted") failures.push("汇流失败后水文仍整体接受");
  return {ok: failures.length === 0, failures};
}

function renderMap(rivers, audit, {label, candidate = false, rejectionIssues = []} = {}) {
  const colors = new Map(audit.issues.flatMap(issue => issue.riverIds.map(id => [id, issue.severity === "info" ? "#d7ba72" : "#e47b72"])));
  const bounds = riverBounds(rivers);
  const paths = rivers.map(river => {
    const points = river.points.map(point => point.slice(0, 2).join(",")).join(" ");
    const color = candidate ? "#78d6a2" : colors.get(Number(river.id)) || "#69b7e8";
    const width = candidate ? Math.max(1.4, Math.min(6, 1.4 + Math.sqrt(Math.max(0, Number(river.width || 0))) * 4)) : 2.2;
    return `<polyline class="river-line ${candidate ? "candidate" : "baseline"}" points="${points}" stroke="${color}" stroke-width="${width}"><title>${river.name || "河流"} · #${river.id}</title></polyline><text class="river-label" x="${river.points[0][0] + 4}" y="${river.points[0][1] - 5}">#${river.id}</text>`;
  }).join("");
  const markers = candidate ? "" : audit.issues.flatMap(issue => (issue.points || []).map(point => `<circle class="issue-point ${issue.severity === "info" ? "info" : "error"}" cx="${point[0]}" cy="${point[1]}" r="4"><title>${issue.id}</title></circle>`)).join("");
  const rejected = rejectionIssues.filter(issue => issue.from && issue.to).map(issue => `<line class="rejected-link" x1="${issue.from[0]}" y1="${issue.from[1]}" x2="${issue.to[0]}" y2="${issue.to[1]}"><title>${issue.id} · ${Number(issue.distance).toFixed(3)}</title></line>`).join("");
  return `<svg viewBox="${bounds.join(" ")}" role="img" aria-label="${label}">${paths}${markers}${rejected}</svg>`;
}

function issueMarkup(result, current, evidence) {
  const expected = current.kind === "fixture" ? formatCounts(current.acceptance.issueCounts) : "逐阶段状态见固定 seed 门禁";
  const failure = evidence.failures.length ? `<p class="expected evidence-failure">证据缺口：${evidence.failures.join("；")}</p>` : "";
  if (!result.issues.length) return `${failure}<p class="expected">精确预期：${expected}</p><p class="empty">没有发现诊断项。</p>`;
  return `${failure}<p class="expected">精确预期：${expected}</p><ol>${result.issues.map(issue => `<li class="${issue.severity === "info" ? "info" : "error"}"><strong>${issue.id}</strong><span>${issue.message}</span><small>河流 ${issue.riverIds.join(", ") || "—"} · ${formatMetrics(issue.metrics)}</small></li>`).join("")}</ol>`;
}

function renderMatrix() {
  const results = FIXTURES.map(fixture => {
    const result = auditRiverNetwork(fixture);
    const hit = JSON.stringify(issueCounts(result)) === JSON.stringify(normalizeCounts(fixture.acceptance.issueCounts));
    return {fixture, result, hit};
  });
  const passed = results.filter(item => item.hit).length;
  elements["matrix-summary"].textContent = `${passed}/${results.length} 个夹具精确通过`;
  elements["matrix"].innerHTML = results.map(({fixture, result, hit}) => `<button class="matrix-item ${hit ? "pass" : "fail"}" data-case="${fixture.id}"><span>${fixture.name}</span><strong>${hit ? "精确通过" : "证据缺口"}</strong><small>${formatCounts(issueCounts(result))}</small></button>`).join("");
  elements["matrix"].querySelectorAll("[data-case]").forEach(button => button.addEventListener("click", () => { state.caseId = button.dataset.case; render(); }));
}

function algorithmMarkup(candidate) {
  const source = candidate.accepted ? `确定性拓扑序：${candidate.topologicalOrder.join(" → ") || "空"}` : `拒绝原因：${candidate.rejection.reason}`;
  return candidateMarkup("304-B 父子 DAG", candidate, source, `visited ${candidate.metrics.visited}/${candidate.metrics.rivers} · cycles ${candidate.metrics.cycles} · missing ${candidate.metrics.missingParents} · self ${candidate.metrics.selfParents}`);
}

function confluenceMarkup(candidate) {
  const detail = candidate.accepted ? `接受 ${candidate.metrics.acceptedRelations} 条 · 三次曲线 ${candidate.metrics.cubicRelations} 条` : `候选 ${candidate.status}：${candidate.rejection.reason}`;
  const relations = (candidate.relations || []).filter(relation => relation.status !== "protected").slice(0, 8).map(relation => `<li><code>#${relation.childId} → #${relation.parentId}</code><span>${relation.status} · ${relation.attachmentSource} · gap ${relation.hydrologyDistance}/${relation.tolerance.total}</span></li>`).join("");
  return `${candidateMarkup("304-G 水文汇流曲线", candidate, detail, `关系 ${candidate.metrics.relations} · 拒绝 ${candidate.metrics.rejectedRelations} · 采样 ${candidate.metrics.sampledPoints} · 河口漂移 ${candidate.metrics.protectedMouthDrift}`)}<ol class="relation-list">${relations}</ol>`;
}

function hydrologyMarkup(candidate) {
  const detail = candidate.accepted ? `流量越级 ${candidate.metrics.dischargeAfter} · 宽度越级 ${candidate.metrics.widthAfter}` : `候选拒绝：${candidate.rejection.reason}`;
  return candidateMarkup("304-D 流量 / 宽度", candidate, detail, `隐藏视觉碎片 ${candidate.metrics.hiddenFragments} · 保护出口 ${candidate.metrics.preservedProtected} · 保留锚点延长 ${candidate.metrics.extendedToConfluence}`);
}

function candidateMarkup(name, candidate, detail, metrics) {
  return `<div class="algorithm-box ${candidate.accepted ? "pass" : "fail"}"><strong>${name}：${candidate.status}</strong><span>${detail}</span><small>${metrics}</small></div>`;
}

function setLoadingState() {
  elements["status"].textContent = "正在构建只读证据";
  elements["status"].className = "status-pill";
}

function caseButton(item, prefix = "") {
  return `<button class="fixture-button" data-case="${item.id}"><span>${prefix}${item.name}</span><small>${item.category}</small></button>`;
}

function riverBounds(rivers) {
  const points = rivers.flatMap(river => river.points || []).filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (!points.length) return [0, 0, 330, 210];
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const pad = Math.max(8, Math.max(width, height) * 0.04);
  return [minX - pad, minY - pad, width + pad * 2, height + pad * 2].map(value => Number(value.toFixed(3)));
}

function issueCounts(result) {
  return normalizeCounts(Object.fromEntries(Object.entries(result.byIssue).map(([id, values]) => [id, values.length])));
}

function normalizeCounts(counts) {
  return Object.fromEntries(Object.entries(counts || {}).sort(([left], [right]) => left.localeCompare(right)));
}

function formatCounts(counts) {
  return Object.entries(normalizeCounts(counts)).map(([id, count]) => `${id}×${count}`).join(" · ") || "无";
}

function stageSummary(candidate) {
  return {status: candidate.status, accepted: candidate.accepted, reason: candidate.rejection?.reason || null};
}

function accepted() {
  return {status: "accepted", reason: null};
}

function rejected(reason) {
  return {status: "rejected", reason};
}

function formatMetrics(metrics = {}) {
  return Object.entries(metrics || {}).map(([key, value]) => `${key}=${typeof value === "number" ? Number(value.toFixed(2)) : value}`).join("，");
}

function roundTiming(value) {
  return Number(Number(value || 0).toFixed(4));
}

initialize().catch(error => {
  console.error(error);
  elements["status"].textContent = "实验室加载失败";
  elements["status"].className = "status-pill fail";
});
