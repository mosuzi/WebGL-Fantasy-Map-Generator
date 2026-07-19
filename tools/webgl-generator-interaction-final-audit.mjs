#!/usr/bin/env node
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = join(rootDir, "docs", "generated", "interaction-audit");
const outputJson = join(rootDir, "docs", "audits", "interaction-usability-audit-results.json");
const outputBrowserEvidence = join(rootDir, "docs", "audits", "interaction-usability-browser-evidence.json");
const outputAudit = join(rootDir, "docs", "audits", "interaction-usability-audit-results.md");
const outputCandidates = join(rootDir, "docs", "task-notes", "next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md");
const checkOnly = process.argv.includes("--check");

const sources = {
  surfaces: readJson("interaction-surfaces.json"),
  fixtures: readJson("fixture-manifest.json"),
  core: readJson("core-task-flows.json"),
  direct: readJson("canvas-and-direct-manipulation.json"),
  complex: readJson("complex-workspaces.json"),
  danger: readJson("danger-and-recovery.json"),
  visual: readJson("keyboard-focus-responsive-visual.json"),
  browser: readBrowserEvidence()
};

const mainEvidence = sources.browser.cases.find(item => item.suite === "main");
const visualEvidence = sources.browser.cases.filter(item => item.suite === "visual");
const mainCases = new Map((mainEvidence?.cases || []).map(item => [item.id, item]));
const issueEvidenceMap = buildIssueEvidenceMap();
const unknownResultBreakdown = buildUnknownResultBreakdown();
const findings = [
  ...normalizeFindings(sources.core.findings, "第 102 项"),
  ...normalizeFindings(sources.direct.findings, "第 103 项"),
  ...normalizeFindings(sources.complex.findings, "第 104 项"),
  ...normalizeFindings(sources.danger.findings, "第 105 项"),
  ...normalizeFindings(sources.visual.findings, "第 106 项"),
  newFinding({
    id: "IA-107-001",
    title: "720px 窄视口下高面板会撑高 document 并暴露表格越界内容",
    severity: "P1",
    confidence: "high",
    intB: false,
    recommendation: "让主面板高度受安全区约束、由面板 body 承担纵向滚动，并保持对象表格横向内容只在表格容器内滚动。",
    reproduction: "在 720×720 打开国家面板基线：面板 bottom=826.4px，document 出现纵向滚动，表格列按钮与数据行越出 720px 视口。",
    sourceTask: "第 107 项",
    sourceRefs: ["app/webgl-generator/src/ui/panel-manager.js", "app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue"],
    browserCaseIds: ["KV-106-narrow-baseline"],
    browserConclusion: "已复现"
  }),
  newFinding({
    id: "IA-107-002",
    title: "固定长中文会把常驻地图工具按钮横向撑出窄视口",
    severity: "P1",
    confidence: "high",
    intB: false,
    recommendation: "为常驻地图工具建立窄视口换行或收纳策略，并限制按钮长文本最大宽度；不能依赖 document 横向滚动兜底。",
    reproduction: "在 720×720 与 576×576 注入固定长中文，fit-view / toggle-measurement 的 right 分别达到 673.6px / 980.2px，document.scrollWidth 大于视口。",
    sourceTask: "第 107 项",
    sourceRefs: ["app/webgl-generator/src/ui/vue/components/MapToolbar.vue", "app/webgl-generator/src/styles.css"],
    browserCaseIds: ["KV-106-narrow-long-zh", "KV-106-css-stress-long-zh"],
    browserConclusion: "已复现"
  })
];

const candidates = buildCandidates();
const principles = [
  "一次输入只允许一个最高优先级消费者；Escape 按 popup → 二级浮层 → 主面板 → 画布编辑 → selection 逐级退出。",
  "危险操作先展示影响，再进入单一事务边界；失败、取消、撤销和重载恢复不得混用同一措辞。",
  "同一 host + action key 才是动作身份；动作元数据必须显式声明直接动作、画布模式或二级面板。",
  "面板与表格分别承担外层可达性和内部滚动，不能把窄视口压力泄漏为 document 滚动。",
  "焦点、选中、编辑、预览和运行中状态都必须可见且不只依赖颜色。",
  "精密拖柄、原生 checkbox 和行级代理单列命中规则；其它普通动作统一透明命中区下限。",
  "长文本、150% 字体和固定窄视口是共享组件契约，不由领域面板各自兜底。",
  "功能结果、历史、selection、mode、持久化或恢复语义变化一律标 INT-B，等待用户批准。"
];

const report = {
  schemaVersion: 1,
  scope: "权威任务第 107 项统一浏览器验证与交互整改候选",
  sourceDigest: digestSources(),
  totals: {
    surfaces: sources.surfaces.totals.surfaces,
    includedSurfaces: sources.surfaces.totals.included,
    excludedSurfaces: sources.surfaces.totals.excluded,
    unclassifiedSurfaces: sources.surfaces.totals.unclassified,
    unknownResults: Object.values(unknownResultBreakdown).reduce((sum, count) => sum + count, 0),
    browserCases: sources.browser.totals.cases,
    browserPassed: sources.browser.totals.passed,
    browserFailed: sources.browser.totals.failed,
    mainEvidenceCases: mainEvidence?.totals?.cases || 0,
    normalEvidence: mainEvidence?.totals?.eS || 0,
    failureEvidence: mainEvidence?.totals?.eF || 0,
    notConstructibleEvidence: mainEvidence?.totals?.eN || 0,
    findings: findings.length,
    behaviorFindings: findings.filter(item => item.intB).length,
    uiFindings: findings.filter(item => !item.intB).length,
    candidates: candidates.length
  },
  browser: {
    url: mainEvidence?.url || "http://127.0.0.1:5410/",
    fixture: mainEvidence?.fixture,
    mainRuntime: mainEvidence?.runtime,
    mainCases: mainEvidence?.cases || [],
    viewports: sources.fixtures.viewports,
    visualCases: visualEvidence.map(item => ({caseId: item.caseId, variant: item.variant, viewport: item.viewport, ok: item.ok, checks: item.checks})),
    screenshots: [
      {caseId: "KV-106-desktop-font-and-states", viewport: "1280x720", bytes: 106266},
      {caseId: "KV-106-narrow-font-and-states", viewport: "720x720", bytes: 59878},
      {caseId: "KV-106-css-stress-font-and-states", viewport: "576x576", bytes: 43915}
    ],
    consoleEvidence: {
      collected: false,
      note: "未把控制台与 page error 作为结构化证据单独采集；故障注入期间允许出现预期 operation-failed 健康日志。"
    }
  },
  surfaceSummary: sources.surfaces.totals,
  flowSummary: sources.core.totals,
  directSummary: sources.direct.totals,
  complexSummary: sources.complex.totals,
  dangerSummary: sources.danger.totals,
  visualSummary: sources.visual.totals,
  unknownResultBreakdown,
  findings,
  principles,
  functionalChangeAppendix: findings.filter(item => item.intB).map(item => ({id: item.id, title: item.title, recommendation: item.recommendation, candidateIds: candidates.filter(candidate => candidate.findingIds.includes(item.id)).map(candidate => candidate.id)})),
  candidates,
  retainedDecisions: [
    "控制面板集中重生成与领域面板上下文重生成继续合理并存。",
    "高级能力保持渐进披露，不因低频直接删除。",
    "精密列宽拖柄与原生 checkbox 不按视觉尺寸直接判定为普通按钮。",
    "九类原地重生成中途失败继续保留 E-N；没有稳定 fault seam 前不伪造 E-F。",
    "第 28～52、54～100 项既有验收不重新执行，本报告只观察其当前交互链表现。"
  ]
};

const outputs = new Map([
  [outputBrowserEvidence, `${JSON.stringify(sources.browser, null, 2)}\n`],
  [outputJson, `${JSON.stringify(report, null, 2)}\n`],
  [outputAudit, renderAudit(report)],
  [outputCandidates, renderCandidates(report)]
]);

if (checkOnly) {
  const stale = [...outputs].filter(([path, content]) => safeRead(path) !== content).map(([path]) => path);
  if (stale.length) throw new Error(`交互最终审计产物已陈旧：\n${stale.map(path => `- ${path}`).join("\n")}`);
} else {
  for (const [path, content] of outputs) writeFileSync(path, content, "utf8");
}

console.log(JSON.stringify(report.totals, null, 2));

function readJson(name) {
  return JSON.parse(readFileSync(join(generatedDir, name), "utf8"));
}

function readBrowserEvidence() {
  const generated = join(generatedDir, "unified-browser-evidence.json");
  const source = safeRead(generated) || safeRead(outputBrowserEvidence);
  if (!source) throw new Error("缺少统一浏览器证据；先运行第 107 项同源浏览器夹具");
  return JSON.parse(source);
}

function safeRead(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function normalizeFindings(items, sourceTask) {
  return (items || []).map(item => {
    const id = item.findingId || item.id;
    const evidence = issueEvidenceMap[id] || {caseIds: [], conclusion: "浏览器上下文通过，静态问题保留"};
    return newFinding({
      id,
      title: item.title,
      severity: item.severity,
      confidence: normalizeConfidence(item.confidence),
      intB: Boolean(item.intB),
      recommendation: item.recommendation || "等待后续整改候选批准。",
      reproduction: reproductionFor(id, item),
      sourceTask,
      sourceRefs: sourceRefs(item, sourceTask),
      codeObservation: item.observed || item.behavior || item.evidence || item.impact || "见来源任务的确定性代码审计记录。",
      browserCaseIds: evidence.caseIds,
      browserConclusion: evidence.conclusion
    });
  });
}

function newFinding(value) {
  return {
    ...value,
    codeObservation: value.codeObservation || value.reproduction || "见来源任务的确定性代码审计记录。",
    changeClass: value.intB ? "INT-B" : "UI-only",
    codeEvidence: "E-C",
    browserEvidence: value.browserConclusion === "已复现" ? "E-F" : "E-S-context"
  };
}

function sourceRefs(item, sourceTask) {
  const candidates = [
    ...(item.sourceFiles || []),
    ...(item.sourceRefs || []).map(ref => typeof ref === "string" ? ref : ref.path || ref.file),
    ...(item.evidence?.sourceRefs || []).map(ref => typeof ref === "string" ? ref : ref.path || ref.file)
  ].filter(Boolean);
  const fallbackByTask = {
    "第 102 项": "tools/webgl-generator-interaction-core-flow-audit.mjs",
    "第 103 项": "tools/webgl-generator-interaction-direct-manipulation-audit.mjs",
    "第 104 项": "tools/webgl-generator-interaction-complex-workspace-audit.mjs",
    "第 105 项": "tools/webgl-generator-interaction-danger-recovery-audit.mjs",
    "第 106 项": "tools/webgl-generator-interaction-keyboard-visual-audit.mjs"
  };
  if (!candidates.length && fallbackByTask[sourceTask]) candidates.push(fallbackByTask[sourceTask]);
  return [...new Set(candidates)].slice(0, 6);
}

function buildUnknownResultBreakdown() {
  return {
    coreUnknownResults: Number(sources.core.totals?.unknownResults || 0),
    coreUnresolvedSurfaceRefs: Number(sources.core.totals?.unresolvedSurfaceRefs || 0),
    directMissingClassifications: Number(sources.direct.totals?.missingDirectClassifications || 0),
    directUnresolvedSurfaceRefs: Number(sources.direct.totals?.unresolvedSurfaceRefs || 0),
    complexUnknownFields: Number(sources.complex.totals?.unknownFields || 0),
    complexUnresolvedTables: Number(sources.complex.totals?.unresolvedTables || 0),
    complexUnresolvedActions: Number(sources.complex.totals?.unresolvedActions || 0),
    dangerUnresolved: Number(sources.danger.totals?.unresolved || 0),
    visualUnresolved: Number(sources.visual.totals?.unresolved || 0)
  };
}

function normalizeConfidence(value) {
  if (value === "代码确认" || value === "high") return "高";
  if (value === "medium") return "中";
  return value === "待验证" ? "中" : String(value || "高");
}

function reproductionFor(id, item) {
  const prefixes = {
    "IA-102": "在 F1 / F6 依次执行定位、重命名、空态和历史操作，观察结果反馈与 history 变化。",
    "IA-103": "在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。",
    "IA-104": "在 F1 / F2 打开对应复杂工作区，执行动作坞、筛选、表格滚动或双击，比较视觉状态、aria、selection 与行几何。",
    "IA-105": "从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。",
    "IA-106": "在三档视口的对应 KV-106 变体执行焦点、Escape、长文本、字体和目标尺寸检查。"
  };
  const prefix = Object.keys(prefixes).find(value => id.startsWith(value));
  return prefixes[prefix] || item.behavior || "按问题绑定的浏览器 case 重现并比较 DOM 与运行时证据。";
}

function buildIssueEvidenceMap() {
  return {
    "IA-102-001": {caseIds: ["HF-12-14", "DR-105-F6-NEUTRAL"], conclusion: "浏览器上下文通过，静态反馈风险保留"},
    "IA-102-002": {caseIds: ["HF-12-14"], conclusion: "正常重命名通过，no-op 反馈风险保留"},
    "IA-103-001": {caseIds: ["DM-103-MODES"], conclusion: "浏览器确认运行时注册 28 项"},
    "IA-103-002": {caseIds: ["KV-106-ESCAPE"], conclusion: "Escape 双消费已复现，模式统一退出仍待整改"},
    "IA-103-003": {caseIds: ["DM-103-MODES"], conclusion: "浏览器上下文通过，切图取消风险保留"},
    "IA-103-004": {caseIds: ["DM-103-MODES"], conclusion: "浏览器上下文通过，pointercancel 语义风险保留"},
    "IA-103-005": {caseIds: ["DM-103-MODES"], conclusion: "浏览器上下文通过，缺失消费者由 E-C 确认"},
    "IA-103-006": {caseIds: ["CW-104-PANELS"], conclusion: "多类浮层可达，取消语义差异保留"},
    "IA-103-007": {caseIds: ["DM-103-MODES"], conclusion: "28 模式可达，默认光标问题保留"},
    "IA-104-001": {caseIds: ["CW-104-PANELS"], conclusion: "动作坞可达，aria 与视觉不同源由 E-C 确认"},
    "IA-104-002": {caseIds: ["CW-104-PANELS"], conclusion: "面板入口通过，动作元数据偏差保留"},
    "IA-104-003": {caseIds: ["KV-106-narrow-baseline"], conclusion: "窄视口表格几何偏差已观察"},
    "IA-104-004": {caseIds: ["HF-12-14"], conclusion: "选择与编辑链通过，重复派发风险保留"},
    "IA-104-005": {caseIds: ["CW-104-PANELS"], conclusion: "浏览器确认多宿主动作可达"},
    "IA-105-001": {caseIds: ["DR-105-F5-DELETE-CANCEL"], conclusion: "取消路径保持指纹，绕过入口由 E-C 确认"},
    "IA-105-002": {caseIds: ["DR-105-F5-GEO-APPLY-FAIL"], conclusion: "已复现"},
    "IA-105-003": {caseIds: ["DR-105-F5-CLIMATE-LATE-RESULT"], conclusion: "已复现"},
    "IA-105-004": {caseIds: ["DR-105-F5-REGENERATE", "DR-105-F5-REGENERATE-MID-FAIL"], conclusion: "正常撤销通过；九类中途失败保留 E-N"},
    "IA-105-005": {caseIds: ["DR-105-F5-HEIGHT-CHAIN-FAIL"], conclusion: "已复现"},
    "IA-105-006": {caseIds: ["DR-105-F5-DELETE-CANCEL", "DR-105-F5-DELETE-UNDO"], conclusion: "取消与失败回滚通过，跨入口表达仍不一致"},
    "IA-105-007": {caseIds: ["DR-105-F5-DELETE-CANCEL"], conclusion: "恢复缺口由 E-C 确认"},
    "IA-105-008": {caseIds: ["DR-105-F5-DELETE-CANCEL"], conclusion: "跨入口确认偏差由 E-C 确认"},
    "IA-106-001": {caseIds: ["KV-106-ESCAPE"], conclusion: "已复现"},
    "IA-106-002": {caseIds: visualCaseIds("expanded-options"), conclusion: "三档焦点上下文通过，popup 优先级风险保留"},
    "IA-106-003": {caseIds: visualCaseIds("font-and-states"), conclusion: "三档焦点可达，表达不一致保留"},
    "IA-106-004": {caseIds: ["KV-106-narrow-baseline"], conclusion: "8px 拖柄、14px checkbox 与紧凑按钮已实测"},
    "IA-106-005": {caseIds: ["KV-106-ESCAPE", ...visualCaseIds("expanded-options")], conclusion: "全局快捷键排他性缺口保留"}
  };
}

function visualCaseIds(variant) {
  return ["desktop", "narrow", "css-stress"].map(viewportId => `KV-106-${viewportId}-${variant}`);
}

function buildCandidates() {
  return [
    candidate("Q-25", "P0", "统一 Escape、焦点与浮层键盘仲裁", ["IA-103-002", "IA-106-001", "IA-106-002", "IA-106-005"], true),
    candidate("Q-26", "P0", "为 GEO、气候、高度与重生成建立事务和旧结果保护", ["IA-105-002", "IA-105-003", "IA-105-004", "IA-105-005"], true),
    candidate("Q-27", "P0", "统一危险删除、清空和资源删除的预检确认与恢复", ["IA-105-001", "IA-105-006", "IA-105-007", "IA-105-008"], true),
    candidate("Q-28", "P1", "统一直接操控的 pointercancel、lostpointercapture 与切图清理", ["IA-103-003", "IA-103-004", "IA-103-005", "IA-103-006"], true),
    candidate("Q-29", "P1", "收敛对象表格行高、面板安全区与窄视口滚动", ["IA-104-003", "IA-106-004", "IA-107-001"], false),
    candidate("Q-30", "P1", "统一动作坞结果元数据、激活 aria 与双击选择", ["IA-104-001", "IA-104-002", "IA-104-004", "IA-104-005"], true),
    candidate("Q-31", "P1", "补齐定位、重命名 no-op 与画布模式可发现反馈", ["IA-102-001", "IA-102-002", "IA-103-007"], true),
    candidate("Q-32", "P1", "统一焦点视觉和常驻工具长文本响应式策略", ["IA-106-003", "IA-107-002"], false),
    candidate("Q-33", "P2", "让画布模式回归从运行时清单派生", ["IA-103-001"], false)
  ];
}

function candidate(id, priority, title, findingIds, intB) {
  return {id, priority, title, findingIds, intB, status: "准权威；待用户批准", acceptance: candidateAcceptance(id)};
}

function candidateAcceptance(id) {
  const values = {
    "Q-25": "一次 Escape 只推进一级退出；输入、popup、dialog、主面板和画布编辑均有浏览器优先级回归。",
    "Q-26": "所有已声明异常路径均保持完整指纹或明确拒绝旧结果；无部分变更和无历史残留。",
    "Q-27": "同影响等级入口共享预检、确认、可撤销性和失败恢复文案；UI / API 契约一致。",
    "Q-28": "pointerup、pointercancel、lostpointercapture、关面板和切图均有按交互类型冻结的结果。",
    "Q-29": "三档视口无 document 溢出；表格虚拟行高与 CSS 几何一致；精密目标单列命中策略。",
    "Q-30": "视觉 active、aria-pressed、resultClass 和 host+key 身份一致；双击不重复派发无效选择。",
    "Q-31": "失败/no-op 有稳定反馈，十九个默认光标模式至少有一致的下一步提示。",
    "Q-32": "长中文和 150% 字体下常驻工具可达且不横向撑开文档；共享 focus-visible token 一致。",
    "Q-33": "回归分母与运行时注册清单双向差集为 0，新增模式无需手工改固定数字。"
  };
  return values[id];
}

function digestSources() {
  const text = Object.entries(sources).map(([key, value]) => `${key}:${JSON.stringify(value)}`).join("\n");
  return createHash("sha256").update(text).digest("hex");
}

function renderAudit(value) {
  const typeRows = Object.entries(value.surfaceSummary.bySourceType).map(([type, count]) => `| ${type} | ${count} |`).join("\n");
  const issueRows = value.findings.map(item => `| ${item.id} | ${item.severity} | ${item.title} | ${item.browserConclusion} | ${item.changeClass} |`).join("\n");
  const details = value.findings.map(item => [
    `### ${item.id}：${item.title}`,
    "",
    `- 严重度 / 信心：\`${item.severity}\` / ${item.confidence}`,
    `- 复现：${item.reproduction}`,
    `- 代码证据：\`${item.codeEvidence}\`；${item.sourceRefs.length ? item.sourceRefs.map(path => `\`${path}\``).join("、") : "见来源任务生成报告"}。`,
    `- 代码观察：${item.codeObservation}`,
    `- 浏览器证据：${item.browserCaseIds.map(id => `\`${id}\``).join("、") || "主套件上下文"}；结论：${item.browserConclusion}。`,
    `- 整改建议：${item.recommendation}`,
    `- 边界：\`${item.changeClass}\`。`,
    ""
  ].join("\n")).join("\n");
  return `# 全功能交互与可用性统一审计结果

## 文档状态

本文是权威任务第 107 项的最终审计交付物。它汇总第 101～106 项的代码证据与本项统一浏览器证据，只提出整改候选，不修改正式应用，也不把候选自动写入权威任务清单。

## 验证结论

- 交互表面：${value.totals.surfaces}，included ${value.totals.includedSurfaces}，excluded ${value.totals.excludedSurfaces}，未分类 ${value.totals.unclassifiedSurfaces}，未知结果 ${value.totals.unknownResults}。
- 浏览器：${value.totals.browserCases} 组（主套件 1 + 视觉 12），通过 ${value.totals.browserPassed}，失败 ${value.totals.browserFailed}；主套件含 ${value.totals.normalEvidence} 条 E-S、${value.totals.failureEvidence} 条 E-F、${value.totals.notConstructibleEvidence} 条 E-N。
- 最终运行状态：结构化证据确认 WebGL error 0、health error 0、operation idle、loading hidden；主套件结束后 history 与 selection 均已复位。控制台与 page error 未单独采集，故障注入期间允许出现预期 operation-failed 健康日志，因此不声明其数量为 0。
- 三档视口复用同一浏览器标签页：1280×720、720×720、576×576 CSS 压力档；每档覆盖 baseline、long-zh、expanded-options、font-and-states。
- 截图快照大小分别为 106266、59878、43915 bytes；截图与 DOM 几何只作视觉证据，问题结论仍同时依赖 E-C 作用链。

## 交互总表

| 来源类型 | 表面数 |
|---|---:|
${typeRows}

| 审计域 | 代码分母 | 浏览器收口 |
|---|---:|---|
| 高频任务闭环 | ${value.flowSummary.flows} 条 / ${value.flowSummary.visibleActions} 个可见动作 | HF 主套件 E-S |
| 画布模式与直接操控 | ${value.directSummary.runtimeModes} 模式 / ${value.directSummary.directManipulations} 直接实例 | DM 主套件 + Escape |
| 复杂面板 | ${value.complexSummary.panelProfiles} 面板 / ${value.complexSummary.complexWorkspaceFields} 字段 / ${value.complexSummary.tableInstances} 表格 / ${value.complexSummary.actionDockActions} 动作 | CW 主套件 + 三档几何 |
| 危险与恢复 | ${value.dangerSummary.destructiveUiActions} 入口 / ${value.dangerSummary.browserScenarios} 场景 | 13 E-F/E-S + 1 E-N |
| 键盘与视觉 | ${value.visualSummary.shortcuts} 快捷动作 / ${value.visualSummary.managedOverlayInstances} 浮层 / ${value.visualSummary.browserCases} case | 12/12 完成 |

## 合理保留

${value.retainedDecisions.map(item => `- ${item}`).join("\n")}

## 问题证据账本

| 编号 | 严重度 | 问题 | 浏览器结论 | 边界 |
|---|---|---|---|---|
${issueRows}

${details}## 跨系统整改原则

${value.principles.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## 功能变更附录

以下 ${value.functionalChangeAppendix.length} 项涉及 callback、command、history、selection、mode、持久化或恢复语义，必须先批准对应准权威候选：

${value.functionalChangeAppendix.map(item => `- ${item.id} ${item.title} → ${item.candidateIds.join("、") || "待产品裁决"}`).join("\n")}

## 后续入口

下一批准权威整改候选见 [next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md](../task-notes/next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md)。用户批准前不得实施。
`;
}

function renderCandidates(value) {
  const rows = value.candidates.map(item => `| ${item.id} | ${item.priority} | ${item.title} | ${item.findingIds.join("、")} | ${item.intB ? "是" : "否"} |`).join("\n");
  const details = value.candidates.map(item => `### ${item.id}：${item.title}\n\n- 状态：${item.status}\n- 来源问题：${item.findingIds.map(id => `\`${id}\``).join("、")}\n- 是否含功能语义变化：${item.intB ? "是，实施前需重新冻结兼容与历史边界" : "否，原则上只改 UI / 门禁"}\n- 最小验收：${item.acceptance}\n`).join("\n");
  return `# 下一批交互整改准权威任务候选池

## 状态与边界

本候选池由权威任务第 107 项审计结果生成，共 ${value.candidates.length} 项。全部候选均未写入 \`docs/current-plan.md\`，用户批准前不得实施，也不得从优先级推断为活动任务。

涉及 \`INT-B\` 的候选必须保持旧地图、浏览器缓存、导入导出、历史与公开 API 兼容；纯 UI 候选不得顺带改变点击、键盘、selection 或提交结果。

## 建议顺序

| 候选 | 优先级 | 任务 | 来源 | INT-B |
|---|---|---|---|---|
${rows}

## 候选详情

${details}
## 明确不进入候选

- 不重做第 28～52、54～100 项既有验收。
- 不顺手修复 \`FOLLOWUPS.md\` 中与本专题无关的旧数据迁移、分母漂移或生成性能问题。
- 不删除现有功能，不把“高级 / 低频”直接等同于“无用”。
- 不在没有稳定 fault seam 时宣称九类原地重生成已经具备失败回滚。
`;
}
