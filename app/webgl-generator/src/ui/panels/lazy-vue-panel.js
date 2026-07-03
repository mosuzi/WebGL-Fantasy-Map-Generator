import {createApp} from "vue";
import {pinia} from "../vue/pinia.js";

const lazyVuePanelEntries = new Set();

export function createLazyVuePanel(documentRef, root, loadComponent, props, messages = {}) {
  root.textContent = messages.initial || "";
  let app = null;
  let appPromise = null;
  let componentModule = null;
  let componentPromise = null;
  let disposed = false;
  let lastError = null;

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
      ensureApp().catch(error => {
        root.textContent = messages.failure || "面板加载失败，请检查开发模式日志。";
        documentRef.defaultView?.console.error?.(error);
      });
    },
    unmount() {
      disposed = true;
      lazyVuePanelEntries.delete(entry);
      app?.unmount();
      app = null;
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

  function ensureApp() {
    if (app) return Promise.resolve(app);
    if (appPromise) return appPromise;
    root.textContent = messages.loading || "正在加载面板...";
    appPromise = loadComponentModule().then(module => {
      if (disposed) return null;
      if (app) return app;
      root.textContent = "";
      app = createApp(module.default || module, props);
      app.use(pinia);
      app.mount(root);
      return app;
    }).catch(error => {
      appPromise = null;
      throw error;
    });
    return appPromise;
  }
}

export function scheduleLazyVuePanelPreload(documentRef, options = {}) {
  const view = documentRef.defaultView || window;
  if (view.__webglGeneratorLazyPreload?.started) return view.__webglGeneratorLazyPreload;

  const entries = Array.from(lazyVuePanelEntries).filter(entry => !entry.isDisposed());
  const queue = entries.filter(entry => shouldPreloadEntry(entry));
  const items = queue.map(entry => ({id: entry.id, status: "pending", ms: 0}));
  const state = {
    started: true,
    reason: options.reason || "map-ready",
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
    error: entry.lastError()?.message || ""
  }));
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
