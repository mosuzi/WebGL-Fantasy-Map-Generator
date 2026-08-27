import {createApp} from "vue";
import {pinia} from "../vue/pinia.js";

const lazyVuePanelEntries = new Set();
const LAZY_PANEL_ERROR_MESSAGE_LIMIT = 240;
export const DEFAULT_LAZY_PANEL_LOADING_DELAY_MS = 180;

export const LAZY_PANEL_ERROR_KIND = Object.freeze({
  MODULE_FETCH: "module-fetch",
  COMPONENT: "component"
});

export function createLazyVuePanel(documentRef, root, loadComponent, props, messages = {}, runtime = {}) {
  root.textContent = messages.initial || "";
  const createVueApp = runtime.createApp || createApp;
  let app = null;
  let appPromise = null;
  let componentModule = null;
  let componentPromise = null;
  let disposed = false;
  let lastError = null;
  let loadingTimer = 0;
  const view = documentRef.defaultView || globalThis;
  const setTimer = runtime.setTimeout || view.setTimeout?.bind(view) || globalThis.setTimeout;
  const clearTimer = runtime.clearTimeout || view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const loadingDelayMs = Math.max(0, Number(runtime.loadingDelayMs ?? DEFAULT_LAZY_PANEL_LOADING_DELAY_MS));

  const entry = {
    id: resolveLazyPanelId(root, messages),
    preload,
    isMounted: () => Boolean(app),
    isResolved: () => Boolean(componentModule),
    isPending: () => Boolean((componentPromise && !componentModule) || (appPromise && !app)),
    isDisposed: () => disposed,
    lastError: () => lastError
  };
  lazyVuePanelEntries.add(entry);

  return {
    load() {
      return ensureApp().catch(error => {
        renderLoadFailure(error);
        documentRef.defaultView?.console.error?.(error);
        return null;
      });
    },
    unmount() {
      disposed = true;
      lazyVuePanelEntries.delete(entry);
      clearLoadingTimer();
      safelyUnmountApp();
    },
    preload() {
      return preload();
    }
  };

  function preload() {
    if (disposed) return Promise.resolve(null);
    return loadComponentModule().catch(error => {
      documentRef.defaultView?.console.warn?.(`异步面板预热失败：${entry.id}`, error);
      return null;
    });
  }

  function loadComponentModule() {
    if (componentModule) return Promise.resolve(componentModule);
    if (componentPromise) return componentPromise;
    lastError = null;
    componentPromise = Promise.resolve().then(loadComponent).then(module => {
      componentModule = module;
      componentPromise = null;
      return module;
    }).catch(error => {
      componentPromise = null;
      lastError = error;
      throw error;
    });
    return componentPromise;
  }

  function retry() {
    if (disposed) return;
    clearLoadingTimer();
    safelyUnmountApp();
    lastError = null;
    componentModule = null;
    componentPromise = null;
    appPromise = null;
    void ensureApp().catch(error => {
      renderLoadFailure(error);
      documentRef.defaultView?.console.error?.(error);
    });
  }

  function renderLoadFailure(error) {
    clearLoadingTimer();
    delete root.dataset.lazyPanelLoading;
    const failure = classifyLazyVuePanelError(error);
    root.replaceChildren?.();
    const container = documentRef.createElement("div");
    container.className = "lazy-panel-recovery";
    container.dataset.errorKind = failure.kind;

    const title = documentRef.createElement("strong");
    title.textContent = messages.failure || "面板加载失败，请检查开发模式日志。";
    container.append(title);

    if (failure.kind === LAZY_PANEL_ERROR_KIND.MODULE_FETCH) {
      const explanation = documentRef.createElement("p");
      explanation.textContent = "页面版本可能已经更新，当前页面无法取得原版本的面板资源。请先保存尚未保存的地图，再刷新页面。";
      container.append(explanation);
    }

    const detail = documentRef.createElement("p");
    detail.className = "lazy-panel-recovery-detail";
    detail.textContent = failure.message;
    container.append(detail);

    const actions = documentRef.createElement("div");
    actions.className = "lazy-panel-recovery-actions";
    if (failure.kind === LAZY_PANEL_ERROR_KIND.MODULE_FETCH) {
      actions.append(createRecoveryButton(documentRef, "刷新页面", () => documentRef.defaultView?.location?.reload?.()));
    } else actions.append(createRecoveryButton(documentRef, "重试加载", retry));
    container.append(actions);
    root.append(container);
  }

  function ensureApp() {
    if (app) return Promise.resolve(app);
    if (appPromise) return appPromise;
    root.textContent = "";
    root.dataset.lazyPanelLoading = "pending";
    scheduleLoadingMessage();
    appPromise = loadComponentModule().then(module => {
      if (disposed) return null;
      if (app) return app;
      clearLoadingTimer();
      delete root.dataset.lazyPanelLoading;
      root.textContent = "";
      app = createVueApp(module.default || module, props);
      app.use(pinia);
      app.mount(root);
      return app;
    }).catch(error => {
      appPromise = null;
      lastError = error;
      safelyUnmountApp();
      throw error;
    });
    return appPromise;
  }

  function safelyUnmountApp() {
    clearLoadingTimer();
    delete root.dataset.lazyPanelLoading;
    const mountedApp = app;
    app = null;
    if (!mountedApp) return;
    try {
      mountedApp.unmount();
    } catch {
      // 半初始化组件的清理失败不能阻断错误恢复或再次挂载。
    }
  }

  function scheduleLoadingMessage() {
    clearLoadingTimer();
    loadingTimer = setTimer(() => {
      loadingTimer = 0;
      if (disposed || app || !appPromise) return;
      root.dataset.lazyPanelLoading = "visible";
      root.textContent = lazyPanelLoadingMessage(messages.loading);
    }, loadingDelayMs);
  }

  function clearLoadingTimer() {
    if (!loadingTimer) return;
    clearTimer(loadingTimer);
    loadingTimer = 0;
  }
}

function lazyPanelLoadingMessage(message) {
  const subject = String(message || "面板")
    .replace(/^正在(?:加载|打开)/u, "")
    .replace(/(?:，?请稍候片刻)?[.。…！!，,]*$/u, "")
    .trim() || "面板";
  return `正在打开${subject}，请稍候片刻。`;
}

export function classifyLazyVuePanelError(error) {
  const name = String(error?.name || "");
  const code = String(error?.code || "");
  const message = boundedLazyPanelErrorMessage(error);
  const moduleFetch = name === "ChunkLoadError"
    || code === "ERR_MODULE_NOT_FOUND"
    || /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [^ ]+ failed|chunkloaderror/i.test(`${name} ${code} ${message}`);
  return Object.freeze({
    kind: moduleFetch ? LAZY_PANEL_ERROR_KIND.MODULE_FETCH : LAZY_PANEL_ERROR_KIND.COMPONENT,
    message
  });
}

export function scheduleLazyVuePanelPreload(documentRef, options = {}) {
  const view = documentRef.defaultView || window;
  if (view.__webglGeneratorLazyPreload?.started) return view.__webglGeneratorLazyPreload;
  const inputTracker = ensureLazyPreloadInputTracker(view);

  const entries = Array.from(lazyVuePanelEntries).filter(entry => !entry.isDisposed());
  const execute = options.execute !== false;
  const queue = execute ? entries.filter(entry => shouldPreloadEntry(entry)) : [];
  const items = execute
    ? queue.map(entry => ({id: entry.id, status: "pending", ms: 0}))
    : entries.filter(entry => shouldPreloadEntry(entry)).map(entry => ({id: entry.id, status: "on-demand", ms: 0}));
  const state = {
    started: true,
    reason: options.reason || "map-ready",
    mode: execute ? "background" : "on-demand",
    startedAt: currentTime(view),
    finishedAt: 0,
    total: queue.length,
    pending: queue.length,
    completed: 0,
    failed: 0,
    skipped: entries.length - queue.length,
    activeId: "",
    items,
    getStats() {
      return {
        started: this.started,
        reason: this.reason,
        mode: this.mode,
        startedAt: this.startedAt,
        finishedAt: this.finishedAt,
        total: this.total,
        pending: this.pending,
        completed: this.completed,
        failed: this.failed,
        skipped: this.skipped,
        activeId: this.activeId,
        items: this.items.map(item => ({...item}))
      };
    }
  };
  view.__webglGeneratorLazyPreload = state;

  if (!queue.length) {
    state.finishedAt = currentTime(view);
    return state;
  }

  const runNext = () => {
    if (!hasQuietInputWindow(view, inputTracker, options.quietInputMs ?? 1400)) {
      scheduleLazyPreloadIdle(view, runNext, {...options, delayMs: options.quietRetryMs ?? 900});
      return;
    }
    const entry = queue.shift();
    const item = items[state.total - queue.length - 1];
    state.pending = queue.length + (entry ? 1 : 0);
    if (!entry) {
      finishLazyPreload(state, view);
      return;
    }
    if (!shouldPreloadEntry(entry)) {
      state.skipped += 1;
      item.status = "skipped";
      scheduleLazyPreloadIdle(view, runNext, options);
      return;
    }
    const startedAt = currentTime(view);
    state.activeId = entry.id;
    item.status = "loading";
    entry.preload().then(() => {
      item.ms = roundPreloadMs(currentTime(view) - startedAt);
      if (entry.isResolved()) {
        state.completed += 1;
        item.status = "loaded";
        return;
      }
      state.failed += 1;
      item.status = "failed";
    }).catch(() => {
      state.failed += 1;
      item.status = "failed";
      item.ms = roundPreloadMs(currentTime(view) - startedAt);
    }).finally(() => {
      state.activeId = "";
      state.pending = queue.length;
      if (queue.length) {
        scheduleLazyPreloadIdle(view, runNext, options);
        return;
      }
      finishLazyPreload(state, view);
    });
  };

  scheduleLazyPreloadIdle(view, runNext, {...options, delayMs: options.firstDelayMs ?? 360});
  return state;
}

export function getLazyVuePanelPreloadStats() {
  return Array.from(lazyVuePanelEntries).map(entry => ({
    id: entry.id,
    mounted: entry.isMounted(),
    resolved: entry.isResolved(),
    pending: entry.isPending(),
    disposed: entry.isDisposed(),
    errorKind: entry.lastError() ? classifyLazyVuePanelError(entry.lastError()).kind : "",
    error: entry.lastError() ? classifyLazyVuePanelError(entry.lastError()).message : ""
  }));
}

function boundedLazyPanelErrorMessage(error) {
  const value = String(error?.message || error || "未知加载错误").replace(/\s+/g, " ").trim() || "未知加载错误";
  return value.slice(0, LAZY_PANEL_ERROR_MESSAGE_LIMIT);
}

function createRecoveryButton(documentRef, label, onClick) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "el-button el-button--small";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function resolveLazyPanelId(root, messages) {
  return messages.id || root?.dataset?.panelId || root?.id || String(root?.className || messages.loading || "lazy-vue-panel").trim() || "lazy-vue-panel";
}

function shouldPreloadEntry(entry) {
  return !entry.isDisposed() && !entry.isMounted() && !entry.isResolved();
}

function scheduleLazyPreloadIdle(view, callback, options = {}) {
  const delayMs = Math.max(0, Number(options.delayMs ?? options.gapMs ?? 90) || 0);
  const timeout = Math.max(400, Number(options.timeoutMs ?? 1400) || 1400);
  const run = () => {
    if (typeof view.requestIdleCallback === "function") {
      view.requestIdleCallback(callback, {timeout});
      return;
    }
    view.setTimeout(callback, 0);
  };
  if (delayMs > 0) {
    view.setTimeout(run, delayMs);
    return;
  }
  run();
}

function ensureLazyPreloadInputTracker(view) {
  if (view.__webglGeneratorLazyPreloadInput) return view.__webglGeneratorLazyPreloadInput;
  const tracker = {lastInputAt: 0};
  const markInput = () => {
    tracker.lastInputAt = currentTime(view);
  };
  for (const eventName of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    view.addEventListener?.(eventName, markInput, {capture: true, passive: true});
  }
  view.__webglGeneratorLazyPreloadInput = tracker;
  return tracker;
}

function hasQuietInputWindow(view, tracker, quietMs) {
  if (!tracker.lastInputAt) return true;
  return currentTime(view) - tracker.lastInputAt >= quietMs;
}

function finishLazyPreload(state, view) {
  state.pending = 0;
  state.activeId = "";
  state.finishedAt = state.finishedAt || currentTime(view);
}

function currentTime(view) {
  return typeof view.performance?.now === "function" ? view.performance.now() : Date.now();
}

function roundPreloadMs(value) {
  return Math.round(value * 10) / 10;
}
