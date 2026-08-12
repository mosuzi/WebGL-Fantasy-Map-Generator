export function createDevelopmentPanel(documentRef, manager) {
  const LOAD_TRACE_LIMIT = 80;
  const HEALTH_EVENT_LIMIT = 80;
  const control = documentRef.getElementById("open-development-panel");
  const record = manager.registerPanel("development-panel", {
    title: "开发模式",
    persistOpen: false,
    left: 24,
    top: 72,
    width: 760,
    minWidth: 680,
    maxWidth: 1100,
    onClose: () => {
      if (!enabled) return;
      collapsed = true;
      showControl(true);
    }
  });

  let gridInspection = null;
  const body = createDevelopmentPanelBody(documentRef, {
    onCollapse: () => collapse(),
    onInspectGrid: () => inspectGridRefinement(),
    onApplyGrid: () => applyGridRefinement()
  });
  record.body.replaceChildren(body);

  let enabled = false;
  let collapsed = false;
  let aiBridgeFactory = null;
  let aiBridgeController = null;
  let pendingBridgeRequest = null;
  const loadTrace = [];
  const healthEvents = [];

  bindAiBridgeControls();

  control?.addEventListener("click", () => {
    if (!enabled) setEnabled(true, {open: true});
    else if (collapsed || record.panel.classList.contains("hidden")) open();
    else collapse();
  });

  const api = {
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      setEnabled(Boolean(value), {open: Boolean(value)});
    },
    open: () => {
      setEnabled(true, {open: true});
    },
    close: () => {
      setEnabled(false);
    },
    collapse,
    toggle: () => {
      if (!enabled || collapsed || record.panel.classList.contains("hidden")) {
        setEnabled(true, {open: true});
      } else {
        collapse();
      }
    },
    get collapsed() {
      return collapsed;
    },
    recordLoadStage: event => {
      const item = normalizeLoadTraceEvent(event);
      loadTrace.push(item);
      if (loadTrace.length > LOAD_TRACE_LIMIT) loadTrace.splice(0, loadTrace.length - LOAD_TRACE_LIMIT);
      renderLoadTrace(documentRef, loadTrace);
    },
    clearLoadTrace: () => {
      loadTrace.length = 0;
      renderLoadTrace(documentRef, loadTrace);
    },
    get loadTrace() {
      return loadTrace.map(item => ({...item}));
    },
    recordHealthEvent: event => {
      const item = normalizeHealthEvent(event);
      healthEvents.push(item);
      if (healthEvents.length > HEALTH_EVENT_LIMIT) healthEvents.splice(0, healthEvents.length - HEALTH_EVENT_LIMIT);
      renderHealthEvents(documentRef, healthEvents);
    },
    clearHealthEvents: () => {
      healthEvents.length = 0;
      renderHealthEvents(documentRef, healthEvents);
    },
    get healthEvents() {
      return healthEvents.map(item => ({...item, detail: {...item.detail}}));
    },
    configureAiBridge: factory => {
      aiBridgeFactory = factory;
      restoreAiBridgeSession();
    },
    get aiBridge() {
      return {
        loaded: Boolean(aiBridgeController),
        connected: Boolean(aiBridgeController),
        writeEnabled: Boolean(aiBridgeController?.writeEnabled),
        pending: pendingBridgeRequest ? {method: pendingBridgeRequest.command?.method, requestId: pendingBridgeRequest.command?.requestId || null} : null
      };
    },
    panel: record.panel
  };

  documentRef.defaultView.__webglGeneratorDebug = api;
  const existingHealthEvents = documentRef.defaultView.__webglGeneratorHealth?.getEvents?.(HEALTH_EVENT_LIMIT) || [];
  for (const event of existingHealthEvents) api.recordHealthEvent(event);
  if (new URLSearchParams(documentRef.defaultView.location.search).get("debug") === "1") setEnabled(true, {open: true});
  else showControl(false);

  return api;

  function setEnabled(value, options = {}) {
    enabled = Boolean(value);
    collapsed = !enabled || collapsed;
    showControl(enabled);
    dispatchDebugChange();
    if (!enabled) {
      manager.close("development-panel");
      return;
    }
    if (options.open) open();
  }

  function open() {
    if (!enabled) enabled = true;
    collapsed = false;
    showControl(true);
    manager.open("development-panel");
    control?.classList.add("active");
    control?.setAttribute("aria-pressed", "true");
  }

  function collapse() {
    if (!enabled) return;
    collapsed = true;
    manager.close("development-panel");
    showControl(true);
    control?.classList.remove("active");
    control?.setAttribute("aria-pressed", "false");
  }

  function showControl(visible) {
    if (!control) return;
    control.hidden = !visible;
    control.textContent = collapsed ? "开发模式" : "调试信息";
    control.setAttribute("aria-pressed", !record.panel.classList.contains("hidden") ? "true" : "false");
  }

  function dispatchDebugChange() {
    documentRef.defaultView.dispatchEvent(new CustomEvent("webgl-generator-debug-change", {
      detail: {enabled, collapsed}
    }));
  }

  function bindAiBridgeControls() {
    documentRef.getElementById("ai-bridge-connect")?.addEventListener("click", () => void connectAiBridge());
    documentRef.getElementById("ai-bridge-write")?.addEventListener("click", () => {
      if (!aiBridgeController) return updateAiBridgeStatus("请先连接本地 AI 桥", "error");
      const enabled = aiBridgeController.setWriteEnabled(!aiBridgeController.writeEnabled);
      updateAiBridgeWriteButton(enabled);
      updateAiBridgeStatus(enabled ? "已连接·允许本次地图写入" : "已连接·只读", enabled ? "warning" : "success");
    });
    documentRef.getElementById("ai-bridge-disconnect")?.addEventListener("click", () => void disconnectAiBridge(true));
    documentRef.getElementById("ai-bridge-approve")?.addEventListener("click", () => void aiBridgeController?.approvePending());
    documentRef.getElementById("ai-bridge-reject")?.addEventListener("click", () => void aiBridgeController?.rejectPending());
  }

  async function connectAiBridge(options = {}) {
    if (aiBridgeController) return aiBridgeController;
    if (typeof aiBridgeFactory !== "function") return updateAiBridgeStatus("AI 桥启动器尚未就绪", "error");
    const tokenInput = documentRef.getElementById("ai-bridge-token");
    const autoInput = documentRef.getElementById("ai-bridge-auto-reconnect");
    const pairingToken = String(options.pairingToken || tokenInput?.value || "").trim();
    if (!pairingToken) return updateAiBridgeStatus("请输入本地桥显示的配对令牌", "error");
    if (tokenInput) tokenInput.value = pairingToken;
    updateAiBridgeStatus("正在懒加载 AI 桥…", "loading");
    try {
      aiBridgeController = await aiBridgeFactory({
        pairingToken,
        endpoint: "http://127.0.0.1:5412",
        onStatus: detail => handleAiBridgeStatus(detail),
        onPendingConfirmation: detail => handlePendingBridgeRequest(detail)
      });
      const autoReconnect = options.autoReconnect ?? Boolean(autoInput?.checked);
      if (autoReconnect) {
        documentRef.defaultView.sessionStorage.setItem("webgl-generator-ai-bridge", JSON.stringify({pairingToken, endpoint: "http://127.0.0.1:5412", autoReconnect: true}));
      } else {
        documentRef.defaultView.sessionStorage.removeItem("webgl-generator-ai-bridge");
      }
      updateAiBridgeWriteButton(false);
      return aiBridgeController;
    } catch (error) {
      aiBridgeController = null;
      updateAiBridgeStatus(`连接失败：${error?.message || error}`, "error");
      return null;
    }
  }

  async function disconnectAiBridge(forget = false) {
    const controller = aiBridgeController;
    aiBridgeController = null;
    pendingBridgeRequest = null;
    renderPendingBridgeRequest();
    if (controller) await controller.disconnect({forget});
    if (forget) documentRef.defaultView.sessionStorage.removeItem("webgl-generator-ai-bridge");
    const session = documentRef.getElementById("ai-bridge-session");
    if (session) session.textContent = "尚无页面会话";
    updateAiBridgeWriteButton(false);
    updateAiBridgeStatus("未连接；主桥接代码不会运行", "idle");
  }

  function restoreAiBridgeSession() {
    let saved = null;
    try {
      saved = JSON.parse(documentRef.defaultView.sessionStorage.getItem("webgl-generator-ai-bridge") || "null");
    } catch {}
    if (!saved?.autoReconnect || !saved.pairingToken) return;
    const tokenInput = documentRef.getElementById("ai-bridge-token");
    const autoInput = documentRef.getElementById("ai-bridge-auto-reconnect");
    if (tokenInput) tokenInput.value = saved.pairingToken;
    if (autoInput) autoInput.checked = true;
    void connectAiBridge({pairingToken: saved.pairingToken, autoReconnect: true});
  }

  function handleAiBridgeStatus(detail = {}) {
    if (detail.state === "connected") updateAiBridgeStatus(detail.writeEnabled ? "已连接·可写" : "已连接·只读", detail.writeEnabled ? "warning" : "success");
    else if (detail.state === "awaiting-confirmation") updateAiBridgeStatus(`等待确认：${detail.command?.method || "高风险操作"}`, "warning");
    else if (detail.state === "reconnecting") updateAiBridgeStatus("连接中断，正在重连…", "loading");
    else if (detail.state === "disconnected") updateAiBridgeStatus("已断开", "idle");
    const session = documentRef.getElementById("ai-bridge-session");
    if (session && detail.pageSessionId) session.textContent = `页面会话 ${detail.pageSessionId.slice(0, 8)}；刷新后写权限自动降级`;
  }

  function handlePendingBridgeRequest(detail) {
    pendingBridgeRequest = detail;
    renderPendingBridgeRequest();
  }

  function renderPendingBridgeRequest() {
    const box = documentRef.getElementById("ai-bridge-pending");
    const approve = documentRef.getElementById("ai-bridge-approve");
    const reject = documentRef.getElementById("ai-bridge-reject");
    const pending = Boolean(pendingBridgeRequest);
    if (box) box.textContent = pending ? `待批准：${pendingBridgeRequest.command?.method}（${pendingBridgeRequest.command?.requestId || "无 requestId"}）` : "暂无待批准操作";
    if (approve) approve.hidden = !pending;
    if (reject) reject.hidden = !pending;
  }

  function updateAiBridgeStatus(text, state) {
    const status = documentRef.getElementById("ai-bridge-status");
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
  }

  function updateAiBridgeWriteButton(value) {
    const button = documentRef.getElementById("ai-bridge-write");
    if (!button) return;
    button.textContent = value ? "恢复只读" : "允许本次地图写入";
    button.setAttribute("aria-pressed", value ? "true" : "false");
  }

  function inspectGridRefinement() {
    const api = documentRef.defaultView.webglGeneratorApi;
    const targetCells = Number(documentRef.getElementById("grid-refinement-target")?.value || 100000);
    const result = api?.grid?.inspectRefinement?.({targetCells});
    if (!result?.ok) {
      gridInspection = null;
      updateGridRefinementStatus(result?.error?.message || "网格细分预检失败", "error");
      updateGridRefinementButton(false);
      return;
    }
    gridInspection = result.data;
    updateGridRefinementStatus(`预检通过：${result.data.source.cells} → ${result.data.target.cells} cells`, "success");
    updateGridRefinementButton(true);
  }

  async function applyGridRefinement() {
    if (!gridInspection?.inspectionToken) return updateGridRefinementStatus("请先完成当前地图的网格细分预检", "error");
    updateGridRefinementButton(false);
    updateGridRefinementStatus("正在细分网格并重载地图…", "loading");
    const api = documentRef.defaultView.webglGeneratorApi;
    const result = await api.grid.refine({targetCells: gridInspection.target.cells, confirm: true, inspectionToken: gridInspection.inspectionToken});
    if (!result?.ok) {
      gridInspection = null;
      updateGridRefinementStatus(`细分失败：${result?.error?.message || "未知错误"}`, "error");
      return;
    }
    gridInspection = null;
    updateGridRefinementStatus(`已细分为 ${result.data.target.cells} cells；可使用撤销恢复`, "success");
  }

  function updateGridRefinementButton(enabled) {
    const button = documentRef.getElementById("grid-refinement-apply");
    if (button) button.disabled = !enabled;
  }

  function updateGridRefinementStatus(text, state) {
    const status = documentRef.getElementById("grid-refinement-status");
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
  }
}

function createDevelopmentPanelBody(documentRef, callbacks) {
  const root = documentRef.createElement("div");
  root.className = "development-panel-content";
  root.append(
    developmentToolbar(documentRef, callbacks),
    developmentSection(documentRef, "状态", [paragraph(documentRef, "app-status", "初始化中")]),
    developmentSection(documentRef, "健康监测", [healthEventList(documentRef)]),
    developmentSection(documentRef, "加载追踪", [loadTraceList(documentRef)]),
    developmentSection(documentRef, "运行时", [definitionList(documentRef, "runtime-stats")]),
    gridRefinementSection(documentRef, callbacks),
    aiBridgeSection(documentRef),
    developmentSection(documentRef, "选择", [definitionList(documentRef, "pick-stats")]),
    developmentSection(documentRef, "边界", [boundaryList(documentRef)])
  );
  return root;
}

function gridRefinementSection(documentRef, callbacks) {
  const wrapper = documentRef.createElement("div");
  wrapper.className = "grid-refinement-controls";
  const description = paragraph(documentRef, "grid-refinement-description", "仅用于现有地图的受控拓扑细分；先预检，再执行一条可撤销事务。");
  const target = documentRef.createElement("input");
  target.id = "grid-refinement-target";
  target.type = "number";
  target.min = "1";
  target.max = "100000";
  target.step = "1";
  target.value = "100000";
  target.setAttribute("aria-label", "网格细分目标 cells");
  const actions = documentRef.createElement("div");
  actions.className = "development-panel-toolbar";
  const inspect = actionButton(documentRef, "grid-refinement-inspect", "预检网格细分");
  const apply = actionButton(documentRef, "grid-refinement-apply", "执行可撤销细分");
  apply.disabled = true;
  inspect.addEventListener("click", callbacks.onInspectGrid);
  apply.addEventListener("click", callbacks.onApplyGrid);
  actions.append(inspect, apply);
  const status = paragraph(documentRef, "grid-refinement-status", "尚未预检");
  status.dataset.state = "idle";
  wrapper.append(description, target, actions, status);
  return developmentSection(documentRef, "网格拓扑", [wrapper]);
}

function aiBridgeSection(documentRef) {
  const wrapper = documentRef.createElement("div");
  wrapper.className = "ai-bridge-controls";
  const description = paragraph(documentRef, "ai-bridge-description", "默认不加载主桥；视觉开启后只连接本机 127.0.0.1:5412。连接默认只读。");
  const token = documentRef.createElement("input");
  token.id = "ai-bridge-token";
  token.className = "ai-bridge-token";
  token.type = "text";
  token.autocomplete = "off";
  token.autocapitalize = "none";
  token.spellcheck = false;
  token.setAttribute("data-1p-ignore", "true");
  token.setAttribute("data-bwignore", "true");
  token.setAttribute("data-lpignore", "true");
  token.placeholder = "本地桥配对令牌";
  token.setAttribute("aria-label", "AI 桥配对令牌");
  const autoLabel = documentRef.createElement("label");
  const auto = documentRef.createElement("input");
  auto.id = "ai-bridge-auto-reconnect";
  auto.type = "checkbox";
  auto.checked = true;
  autoLabel.append(auto, " 本次浏览器会话刷新后自动恢复只读连接");
  const actions = documentRef.createElement("div");
  actions.className = "development-panel-toolbar";
  actions.append(
    actionButton(documentRef, "ai-bridge-connect", "开启 AI 调试"),
    actionButton(documentRef, "ai-bridge-write", "允许本次地图写入"),
    actionButton(documentRef, "ai-bridge-disconnect", "断开并忘记")
  );
  const status = paragraph(documentRef, "ai-bridge-status", "未连接；主桥接代码不会运行");
  status.dataset.state = "idle";
  const session = paragraph(documentRef, "ai-bridge-session", "尚无页面会话");
  const pending = paragraph(documentRef, "ai-bridge-pending", "暂无待批准操作");
  const confirmation = documentRef.createElement("div");
  confirmation.className = "development-panel-toolbar";
  const approve = actionButton(documentRef, "ai-bridge-approve", "批准本次操作");
  const reject = actionButton(documentRef, "ai-bridge-reject", "拒绝");
  approve.hidden = true;
  reject.hidden = true;
  confirmation.append(approve, reject);
  wrapper.append(description, token, autoLabel, actions, status, session, pending, confirmation);
  return developmentSection(documentRef, "AI 调试", [wrapper]);
}

function actionButton(documentRef, id, text) {
  const button = documentRef.createElement("button");
  button.id = id;
  button.type = "button";
  button.className = "secondary-action";
  button.textContent = text;
  return button;
}

function developmentToolbar(documentRef, callbacks) {
  const toolbar = documentRef.createElement("div");
  toolbar.className = "development-panel-toolbar";
  const note = documentRef.createElement("span");
  note.textContent = "仅显示调试、性能和内部状态";
  const collapse = documentRef.createElement("button");
  collapse.type = "button";
  collapse.className = "secondary-action";
  collapse.textContent = "收起";
  collapse.addEventListener("click", callbacks.onCollapse);
  toolbar.append(note, collapse);
  return toolbar;
}

function developmentSection(documentRef, titleText, children) {
  const section = documentRef.createElement("section");
  section.className = "development-panel-section";
  const title = documentRef.createElement("h3");
  title.textContent = titleText;
  section.append(title, ...children);
  return section;
}

function paragraph(documentRef, id, text) {
  const item = documentRef.createElement("p");
  item.id = id;
  item.textContent = text;
  return item;
}

function definitionList(documentRef, id) {
  const list = documentRef.createElement("dl");
  list.id = id;
  list.className = "stats-list";
  return list;
}

function loadTraceList(documentRef) {
  const list = documentRef.createElement("ol");
  list.id = "development-load-trace";
  list.className = "development-load-trace";
  const empty = documentRef.createElement("li");
  empty.textContent = "暂无加载追踪";
  list.append(empty);
  return list;
}

function healthEventList(documentRef) {
  const list = documentRef.createElement("ol");
  list.id = "development-health-events";
  list.className = "development-health-events";
  const empty = documentRef.createElement("li");
  empty.textContent = "暂无健康事件";
  list.append(empty);
  return list;
}

function boundaryList(documentRef) {
  const list = definitionList(documentRef, "development-boundary-stats");
  list.append(
    statRow(documentRef, "正式应用", "app/webgl-generator"),
    statRow(documentRef, "快照 demo", "prototype/webgl-cells"),
    statRow(documentRef, "source", "只读参考")
  );
  return list;
}

function statRow(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("dt");
  const detail = documentRef.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function normalizeLoadTraceEvent(event = {}) {
  return {
    phase: event.phase || "stage",
    id: String(event.id || "unknown"),
    label: event.label || "",
    message: event.message || "",
    ms: Number.isFinite(event.ms) ? event.ms : null,
    at: Number.isFinite(event.at) ? event.at : null,
    delayMs: Number.isFinite(event.delayMs) ? event.delayMs : null
  };
}

function renderLoadTrace(documentRef, trace) {
  const list = documentRef.getElementById("development-load-trace");
  if (!list) return;
  if (!trace.length) {
    const empty = documentRef.createElement("li");
    empty.textContent = "暂无加载追踪";
    list.replaceChildren(empty);
    return;
  }

  const items = trace.slice(-14).reverse().map(event => {
    const item = documentRef.createElement("li");
    item.textContent = formatLoadTraceEvent(event);
    return item;
  });
  list.replaceChildren(...items);
}

function formatLoadTraceEvent(event) {
  const phaseLabel = {
    request: "请求",
    start: "开始",
    end: "结束",
    complete: "完成",
    delay: "等待",
    error: "错误"
  }[event.phase] || event.phase;
  const elapsed = Number.isFinite(event.at) ? `+${Math.round(event.at)}ms` : "";
  const cost = Number.isFinite(event.ms) ? `，耗时 ${event.ms}ms` : "";
  const delay = Number.isFinite(event.delayMs) && event.delayMs > 0 ? `，间隔 ${event.delayMs}ms` : "";
  const text = event.message || event.label || event.id;
  return `${elapsed} ${phaseLabel} ${event.id}：${text}${cost}${delay}`.trim();
}

function normalizeHealthEvent(event = {}) {
  return {
    type: String(event.type || "unknown"),
    severity: String(event.severity || "info"),
    at: event.at || "",
    pageTimeMs: Number.isFinite(event.pageTimeMs) ? event.pageTimeMs : null,
    detail: event.detail && typeof event.detail === "object" ? event.detail : {}
  };
}

function renderHealthEvents(documentRef, events) {
  const list = documentRef.getElementById("development-health-events");
  if (!list) return;
  const visibleEvents = events.filter(event => event.severity !== "info" || event.type === "map-ready").slice(-12).reverse();
  if (!visibleEvents.length) {
    const empty = documentRef.createElement("li");
    empty.textContent = "暂无健康事件";
    list.replaceChildren(empty);
    return;
  }

  const items = visibleEvents.map(event => {
    const item = documentRef.createElement("li");
    item.className = `health-event health-event--${event.severity}`;
    item.textContent = formatHealthEvent(event);
    return item;
  });
  list.replaceChildren(...items);
}

function formatHealthEvent(event) {
  const pageTime = Number.isFinite(event.pageTimeMs) ? `+${Math.round(event.pageTimeMs)}ms` : "";
  const detail = event.detail || {};
  const duration = Number.isFinite(detail.durationMs) ? `，${detail.durationMs}ms` : "";
  const gap = Number.isFinite(detail.gapMs) ? `，间隔 ${detail.gapMs}ms` : "";
  const message = detail.message || detail.loadingText || detail.operation || detail.eventName || detail.seed || "";
  const suffix = message ? `：${message}` : "";
  return `${pageTime} ${event.severity.toUpperCase()} ${event.type}${suffix}${duration}${gap}`.trim();
}
