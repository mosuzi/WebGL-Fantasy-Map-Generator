const EXIT_DELAY_MS = 280;
export const STARTUP_LOADING_MIN_VISIBLE_MS = 2500;
export const STARTUP_FAILURE_USER_MESSAGE = "启动失败：地图画卷未能打开，请刷新页面后重试。";

const lifecycleTimers = new WeakMap();

export function updateStartupLoadingStatus(documentRef, message) {
  const screen = documentRef.getElementById("app-loading-screen");
  if (!screen || screen.hidden || screen.dataset.state !== "loading") return false;
  const status = documentRef.getElementById("app-loading-status");
  if (status && message) status.textContent = message;
  return true;
}

export function completeStartupLoading(documentRef) {
  const screen = documentRef.getElementById("app-loading-screen");
  if (!screen || screen.hidden || screen.dataset.state !== "loading") return false;
  clearLifecycleTimers(screen);
  screen.dataset.state = "ready";
  updateText(documentRef, "地图已就绪");
  const view = documentRef.defaultView || globalThis;
  if (prefersReducedMotion(view)) {
    beginExit(screen, view);
    return true;
  }
  const remaining = remainingVisibleTime(view);
  if (!(remaining > 0)) {
    beginExit(screen, view);
    return true;
  }
  const active = {view, waitTimer: null, exitTimer: null};
  active.waitTimer = view.setTimeout(() => {
    active.waitTimer = null;
    if (screen.dataset.state !== "ready" || screen.hidden) {
      lifecycleTimers.delete(screen);
      return;
    }
    beginExit(screen, view, active);
  }, remaining);
  lifecycleTimers.set(screen, active);
  return true;
}

function beginExit(screen, view, active = {view, waitTimer: null, exitTimer: null}) {
  if (screen.dataset.state !== "ready" || screen.hidden) return;
  screen.classList.add("is-leaving");
  screen.setAttribute("aria-hidden", "true");
  active.exitTimer = view.setTimeout(() => {
    active.exitTimer = null;
    if (screen.dataset.state !== "ready") {
      lifecycleTimers.delete(screen);
      return;
    }
    screen.hidden = true;
    screen.classList.remove("is-leaving");
    lifecycleTimers.delete(screen);
  }, EXIT_DELAY_MS);
  lifecycleTimers.set(screen, active);
}

export function failStartupLoading(documentRef, error, options = {}) {
  const screen = documentRef.getElementById("app-loading-screen");
  if (!screen) return false;
  clearLifecycleTimers(screen);
  screen.hidden = false;
  screen.dataset.state = "error";
  screen.classList.remove("is-leaving");
  screen.removeAttribute("aria-hidden");
  updateText(documentRef, startupFailureMessage(error, options));
  return true;
}

export function startupFailureMessage(error, options = {}) {
  if (!options.debug) return STARTUP_FAILURE_USER_MESSAGE;
  const detail = error instanceof Error ? error.message : String(error || "未知错误");
  return `启动失败：${detail}`;
}

function updateText(documentRef, message) {
  const status = documentRef.getElementById("app-loading-status");
  if (status) status.textContent = message;
}

function clearLifecycleTimers(screen) {
  const active = lifecycleTimers.get(screen);
  if (!active) return;
  if (active.waitTimer !== null) active.view.clearTimeout(active.waitTimer);
  if (active.exitTimer !== null) active.view.clearTimeout(active.exitTimer);
  lifecycleTimers.delete(screen);
}

function prefersReducedMotion(view) {
  return view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function remainingVisibleTime(view) {
  const startedAt = Number(view.__webglGeneratorStartupLoadingStartedAt);
  const now = Number(view.performance?.now?.());
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || startedAt < 0 || now < startedAt) return 0;
  return Math.max(0, STARTUP_LOADING_MIN_VISIBLE_MS - (now - startedAt));
}
