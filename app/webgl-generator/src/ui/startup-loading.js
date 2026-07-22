const EXIT_DELAY_MS = 280;
const exitTimers = new WeakMap();

export function updateStartupLoadingStatus(documentRef, message) {
  const screen = documentRef.getElementById("app-loading-screen");
  if (!screen || screen.hidden || screen.dataset.state === "ready") return false;
  const status = documentRef.getElementById("app-loading-status");
  if (status && message) status.textContent = message;
  return true;
}

export function completeStartupLoading(documentRef) {
  const screen = documentRef.getElementById("app-loading-screen");
  if (!screen || screen.hidden || screen.dataset.state === "ready") return false;
  clearExitTimer(screen);
  screen.dataset.state = "ready";
  updateText(documentRef, "地图已就绪");
  screen.classList.add("is-leaving");
  screen.setAttribute("aria-hidden", "true");
  const view = documentRef.defaultView || globalThis;
  const timer = view.setTimeout(() => {
    screen.hidden = true;
    screen.classList.remove("is-leaving");
    exitTimers.delete(screen);
  }, EXIT_DELAY_MS);
  exitTimers.set(screen, {view, timer});
  return true;
}

export function failStartupLoading(documentRef, error) {
  const screen = documentRef.getElementById("app-loading-screen");
  if (!screen) return false;
  clearExitTimer(screen);
  const message = error instanceof Error ? error.message : String(error || "未知错误");
  screen.hidden = false;
  screen.dataset.state = "error";
  screen.classList.remove("is-leaving");
  screen.removeAttribute("aria-hidden");
  updateText(documentRef, `启动失败：${message}`);
  return true;
}

function updateText(documentRef, message) {
  const status = documentRef.getElementById("app-loading-status");
  if (status) status.textContent = message;
}

function clearExitTimer(screen) {
  const active = exitTimers.get(screen);
  if (!active) return;
  active.view.clearTimeout(active.timer);
  exitTimers.delete(screen);
}
