const HEALTH_EVENT_NAME = "webgl-generator-health-event";
const STORAGE_KEY = "webgl-generator-health-events-v1";
const EVENT_LIMIT = 180;
const INPUT_EVENTS = Object.freeze(["pointerdown", "click", "keydown", "input", "change"]);

const DEFAULT_THRESHOLDS = Object.freeze({
  longTaskMs: 250,
  frameGapMs: 2000,
  inputDelayMs: 120,
  inputHandlerMs: 250,
  operationMs: 250,
  loadingMs: 12000,
  mapReadyMs: 20000
});

export function installWebglGeneratorHealthMonitor(documentRef, options = {}) {
  const view = documentRef.defaultView || window;
  if (readBooleanSearchParam(view, "healthClear")) clearStoredHealthEvents(view);
  if (view.__webglGeneratorHealth) return view.__webglGeneratorHealth;

  const monitor = createHealthMonitor(documentRef, view, options);
  view.__webglGeneratorHealth = monitor;
  monitor.record("app-script-start", {url: view.location?.href || ""}, "info");
  monitor.start();
  return monitor;
}

export function getWebglGeneratorHealthMonitor(documentRef) {
  return (documentRef.defaultView || window).__webglGeneratorHealth || null;
}

export function recordStartupFailure(documentRef, error) {
  const monitor = installWebglGeneratorHealthMonitor(documentRef);
  monitor.record("startup-error", errorDetail(error), "error");
}

function createHealthMonitor(documentRef, view, options) {
  const thresholds = {...DEFAULT_THRESHOLDS, ...options.thresholds};
  const operationStack = [];
  let started = false;
  let mapReady = false;
  let loading = null;
  let frameId = 0;
  let longTaskObserver = null;
  let inputHandlers = [];

  const api = {
    get storageKey() {
      return STORAGE_KEY;
    },
    get thresholds() {
      return {...thresholds};
    },
    start() {
      if (started) return;
      started = true;
      scheduleMapReadyTimeout();
      installFrameGapMonitor();
      installLongTaskObserver();
      installInputMonitor();
    },
    dispose() {
      if (frameId) view.cancelAnimationFrame?.(frameId);
      if (longTaskObserver) longTaskObserver.disconnect();
      for (const item of inputHandlers) {
        documentRef.removeEventListener(item.eventName, item.handler, item.options);
      }
      inputHandlers = [];
      started = false;
    },
    record(type, detail = {}, severity = "info") {
      const event = normalizeHealthEvent(view, type, detail, severity);
      persistHealthEvent(view, event);
      view.__webglGeneratorDebug?.recordHealthEvent?.(event);
      if (typeof view.CustomEvent === "function") {
        view.dispatchEvent(new view.CustomEvent(HEALTH_EVENT_NAME, {detail: event}));
      }
      if (severity === "error") view.console?.error?.("[FMG health]", type, event);
      else if (severity === "warn") view.console?.warn?.("[FMG health]", type, event);
      else view.console?.debug?.("[FMG health]", type, event);
      return event;
    },
    getEvents(limit = EVENT_LIMIT) {
      return readHealthEvents(view).slice(-limit);
    },
    clear() {
      clearStoredHealthEvents(view);
    },
    beginOperation(name, detail = {}) {
      const operation = {
        name,
        detail,
        startedAt: now(view)
      };
      operationStack.push(operation);
      return {
        end: result => {
          const index = operationStack.lastIndexOf(operation);
          if (index >= 0) operationStack.splice(index, 1);
          const durationMs = roundMs(now(view) - operation.startedAt);
          if (durationMs >= thresholds.operationMs) {
            api.record("operation-stall", {operation: name, durationMs, ...detail, result}, severityForDuration(durationMs, thresholds.operationMs));
          }
          return durationMs;
        }
      };
    },
    measureSyncOperation(name, detail, task) {
      const operation = api.beginOperation(name, detail);
      try {
        return task();
      } finally {
        operation.end();
      }
    },
    markLoading(visible, message = "") {
      if (!visible) {
        if (loading) {
          const durationMs = roundMs(now(view) - loading.startedAt);
          if (durationMs >= thresholds.loadingMs) {
            api.record("loading-slow-complete", {message: loading.message, durationMs}, "warn");
          }
        }
        loading = null;
        return;
      }
      const token = Symbol("loading");
      loading = {token, message, startedAt: now(view)};
      view.setTimeout(() => {
        if (!loading || loading.token !== token) return;
        api.record("loading-stuck", {
          message,
          durationMs: roundMs(now(view) - loading.startedAt),
          appReady: Boolean(view.__webglGeneratorApp),
          documentVisibility: documentRef.visibilityState || "unknown"
        }, "warn");
      }, thresholds.loadingMs);
    },
    markMapReady(detail = {}) {
      mapReady = true;
      api.record("map-ready", detail, "info");
    },
    markLoadStage(stage = {}) {
      const severity = stage.phase === "error" ? "error" : "info";
      api.record("load-stage", stage, severity);
    },
    get currentOperation() {
      return operationStack[operationStack.length - 1] || null;
    }
  };

  return api;

  function scheduleMapReadyTimeout() {
    view.setTimeout(() => {
      if (mapReady) return;
      const loadingText = documentRef.getElementById("generation-loading-text")?.textContent?.trim() || "";
      api.record("page-load-timeout", {
        timeoutMs: thresholds.mapReadyMs,
        appReady: Boolean(view.__webglGeneratorApp),
        loadingText,
        documentVisibility: documentRef.visibilityState || "unknown"
      }, "error");
    }, thresholds.mapReadyMs);
  }

  function installFrameGapMonitor() {
    if (typeof view.requestAnimationFrame !== "function") return;
    let lastFrameAt = now(view);
    const resetFrameClock = () => {
      lastFrameAt = now(view);
    };
    documentRef.addEventListener("visibilitychange", resetFrameClock);
    const tick = timestamp => {
      const frameNow = Number.isFinite(timestamp) ? timestamp : now(view);
      const gapMs = frameNow - lastFrameAt;
      if (documentRef.visibilityState !== "hidden" && gapMs >= thresholds.frameGapMs) {
        const current = api.currentOperation;
        const loadingElement = documentRef.getElementById("generation-loading");
        const loadingVisible = Boolean(loadingElement && !loadingElement.hidden);
        api.record("render-frame-gap", {
          gapMs: roundMs(gapMs),
          loadingText: loadingVisible ? documentRef.getElementById("generation-loading-text")?.textContent?.trim() || "" : "",
          operation: current?.name || null,
          documentVisibility: documentRef.visibilityState || "unknown"
        }, severityForDuration(gapMs, thresholds.frameGapMs));
      }
      lastFrameAt = frameNow;
      frameId = view.requestAnimationFrame(tick);
    };
    frameId = view.requestAnimationFrame(tick);
  }

  function installLongTaskObserver() {
    const Observer = view.PerformanceObserver;
    if (typeof Observer !== "function") return;
    const supported = Array.isArray(Observer.supportedEntryTypes) ? Observer.supportedEntryTypes : [];
    if (!supported.includes("longtask")) return;
    try {
      longTaskObserver = new Observer(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration < thresholds.longTaskMs) continue;
          const current = api.currentOperation;
          api.record("main-thread-long-task", {
            durationMs: roundMs(entry.duration),
            startTime: roundMs(entry.startTime),
            name: entry.name || "longtask",
            operation: current?.name || null
          }, severityForDuration(entry.duration, thresholds.longTaskMs));
        }
      });
      longTaskObserver.observe({type: "longtask", buffered: true});
    } catch {
      longTaskObserver = null;
    }
  }

  function installInputMonitor() {
    const options = {capture: true, passive: true};
    for (const eventName of INPUT_EVENTS) {
      const handler = event => {
        const receivedAt = now(view);
        const delayMs = receivedAt - normalizeEventTimestamp(view, event.timeStamp);
        if (delayMs >= thresholds.inputDelayMs) {
          api.record("input-delay", {
            eventName,
            delayMs: roundMs(delayMs),
            target: summarizeTarget(event.target)
          }, severityForDuration(delayMs, thresholds.inputDelayMs));
        }
        view.setTimeout(() => {
          const handlerMs = now(view) - receivedAt;
          if (handlerMs < thresholds.inputHandlerMs) return;
          api.record("input-handler-stall", {
            eventName,
            durationMs: roundMs(handlerMs),
            target: summarizeTarget(event.target)
          }, severityForDuration(handlerMs, thresholds.inputHandlerMs));
        }, 0);
      };
      documentRef.addEventListener(eventName, handler, options);
      inputHandlers.push({eventName, handler, options});
    }
  }
}

function normalizeHealthEvent(view, type, detail, severity) {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity,
    at: new Date().toISOString(),
    pageTimeMs: roundMs(now(view)),
    url: view.location?.href || "",
    detail: sanitizeDetail(detail)
  };
}

function persistHealthEvent(view, event) {
  const events = readHealthEvents(view);
  events.push(event);
  const trimmed = events.length > EVENT_LIMIT ? events.slice(events.length - EVENT_LIMIT) : events;
  try {
    view.localStorage?.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Losing local diagnostics is acceptable when storage is unavailable.
  }
}

function readHealthEvents(view) {
  try {
    const raw = view.localStorage?.getItem(STORAGE_KEY);
    const events = raw ? JSON.parse(raw) : [];
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

function clearStoredHealthEvents(view) {
  try {
    view.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be blocked in restrictive browser modes.
  }
}

function readBooleanSearchParam(view, key) {
  try {
    const params = new URLSearchParams(view.location?.search || "");
    if (!params.has(key)) return false;
    const value = params.get(key);
    if (value === "" || value === null) return true;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
  } catch {
    return false;
  }
}

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== "object") return {};
  const result = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value instanceof Error) {
      result[key] = errorDetail(value);
    } else if (typeof value === "function") {
      continue;
    } else if (value && typeof value === "object") {
      try {
        result[key] = JSON.parse(JSON.stringify(value));
      } catch {
        result[key] = String(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function errorDetail(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || ""
    };
  }
  return {message: String(error)};
}

function summarizeTarget(target) {
  if (!target || target.nodeType !== 1) return "";
  const element = target;
  const parts = [element.tagName.toLowerCase()];
  if (element.id) parts.push(`#${element.id}`);
  const dataMode = element.getAttribute("data-mode");
  const dataPanel = element.getAttribute("data-panel-id");
  const aria = element.getAttribute("aria-label");
  if (dataMode) parts.push(`[data-mode=${dataMode}]`);
  if (dataPanel) parts.push(`[data-panel-id=${dataPanel}]`);
  if (aria) parts.push(`[aria-label=${aria.slice(0, 40)}]`);
  return parts.join("");
}

function normalizeEventTimestamp(view, timestamp) {
  if (!Number.isFinite(timestamp)) return now(view);
  if (timestamp > 1000000000000) {
    return now(view) - Math.max(0, Date.now() - timestamp);
  }
  return timestamp;
}

function severityForDuration(durationMs, thresholdMs) {
  if (durationMs >= thresholdMs * 4) return "error";
  return "warn";
}

function now(view) {
  return typeof view.performance?.now === "function" ? view.performance.now() : Date.now();
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
