export function createDevelopmentPanel(documentRef, manager) {
  const LOAD_TRACE_LIMIT = 80;
  const HEALTH_EVENT_LIMIT = 80;
  const control = documentRef.getElementById("open-development-panel");
  const record = manager.registerPanel("development-panel", {
    title: "开发模式",
    persistOpen: false,
    left: 24,
    top: 72,
    width: 420,
    maxWidth: 560,
    onClose: () => {
      if (!enabled) return;
      collapsed = true;
      showControl(true);
    }
  });

  const body = createDevelopmentPanelBody(documentRef, {
    onCollapse: () => collapse()
  });
  record.body.replaceChildren(body);

  let enabled = false;
  let collapsed = false;
  const loadTrace = [];
  const healthEvents = [];

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
    developmentSection(documentRef, "选择", [definitionList(documentRef, "pick-stats")]),
    developmentSection(documentRef, "边界", [boundaryList(documentRef)])
  );
  return root;
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
