export const DEFAULT_DELAYED_OPERATION_MESSAGE = "山河正徐徐推演，请稍候片刻。";
export const DEFAULT_DELAYED_OPERATION_MS = 420;

export function createDelayedOperationFeedback(documentRef, options = {}) {
  const bubble = documentRef.getElementById("operation-loading");
  const text = documentRef.getElementById("operation-loading-text");
  const view = documentRef.defaultView || globalThis;
  const delayMs = Math.max(0, Number(options.delayMs ?? DEFAULT_DELAYED_OPERATION_MS));
  const setTimer = options.setTimeout || view.setTimeout?.bind(view) || globalThis.setTimeout;
  const clearTimer = options.clearTimeout || view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const tokens = new Map();
  let sequence = 0;
  let revealTimer = 0;
  let shown = false;

  return {begin, finish, setRuntimeOperation, getSnapshot, destroy};

  function begin(message = DEFAULT_DELAYED_OPERATION_MESSAGE, metadata = {}) {
    const id = String(metadata.id || `operation-feedback-${++sequence}`);
    const wasEmpty = tokens.size === 0;
    tokens.set(id, {id, message: normalizeMessage(message), source: metadata.source || "operation"});
    if (wasEmpty) prepareReveal();
    else renderMessage();
    return id;
  }

  function finish(id) {
    if (!id || !tokens.delete(String(id))) return false;
    if (tokens.size) renderMessage();
    else resetReveal();
    return true;
  }

  function setRuntimeOperation(visible, message, operation = {}) {
    const id = `runtime-operation-${Number(operation?.id) || "active"}`;
    if (visible) {
      if (tokens.has(id)) {
        tokens.get(id).message = normalizeMessage(message);
        renderMessage();
      } else begin(message, {id, source: "runtime"});
      return;
    }
    finish(id);
  }

  function prepareReveal() {
    if (!bubble) return;
    shown = false;
    bubble.hidden = true;
    bubble.setAttribute("aria-hidden", "true");
    bubble.classList.remove("operation-loading-active");
    renderMessage();
    clearRevealTimer();
    revealTimer = setTimer(() => {
      revealTimer = 0;
      if (!tokens.size || !bubble) return;
      shown = true;
      bubble.hidden = false;
      bubble.classList.add("operation-loading-active");
      bubble.setAttribute("aria-hidden", "false");
    }, delayMs);
  }

  function renderMessage() {
    const latest = [...tokens.values()].at(-1);
    if (text) text.textContent = latest?.message || DEFAULT_DELAYED_OPERATION_MESSAGE;
  }

  function resetReveal() {
    clearRevealTimer();
    shown = false;
    if (!bubble) return;
    bubble.hidden = true;
    bubble.classList.remove("operation-loading-active");
    bubble.setAttribute("aria-hidden", "true");
  }

  function clearRevealTimer() {
    if (!revealTimer) return;
    clearTimer(revealTimer);
    revealTimer = 0;
  }

  function getSnapshot() {
    return {
      active: tokens.size,
      shown,
      hidden: Boolean(bubble?.hidden ?? true),
      message: text?.textContent || "",
      sources: [...tokens.values()].map(token => token.source)
    };
  }

  function destroy() {
    tokens.clear();
    resetReveal();
  }
}

function normalizeMessage(message) {
  const value = String(message || "").trim();
  if (!value) return DEFAULT_DELAYED_OPERATION_MESSAGE;
  if (/请稍候|片刻/.test(value)) return value;
  if (/^正在/.test(value)) return `${value.replace(/[。！!，,]+$/u, "")}，请稍候片刻。`;
  return value;
}
