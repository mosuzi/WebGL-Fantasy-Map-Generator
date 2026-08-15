export const DISPLAY_WORKER_PATH = Object.freeze({
  WARM: "warm",
  COLD: "cold",
  STALE_MAP: "stale-map",
  STALE_REVISION: "stale-revision",
  STALE_CONTEXT: "stale-context",
  BUSY_RESTART: "busy-restart",
  INCONSISTENT_REUSE: "inconsistent-reuse"
});

export function createDisplayWorkerLedger({sessionBefore = null, binding = null, worker = null} = {}) {
  const before = clonePlain(sessionBefore);
  const requested = clonePlain(binding);
  const reused = worker?.session?.reused === true;
  const path = classifyDisplayWorkerPath(before, requested, reused);
  return {
    path,
    reused,
    inputPackets: finiteNumber(worker?.telemetry?.inputPackets),
    inputStreamMs: finiteNumber(worker?.telemetry?.inputStreamMs),
    outputPackets: finiteNumber(worker?.telemetry?.outputPackets),
    outputReceiveMs: finiteNumber(worker?.telemetry?.outputReceiveMs),
    sessionBefore: before,
    requestedBinding: requested,
    frames: {firstAnimationFrameMs: null, presentedFrameMs: null}
  };
}

export function classifyDisplayWorkerPath(sessionBefore, binding, reused) {
  if (reused) return isReusableSession(sessionBefore, binding) ? DISPLAY_WORKER_PATH.WARM : DISPLAY_WORKER_PATH.INCONSISTENT_REUSE;
  if (!sessionBefore) return DISPLAY_WORKER_PATH.COLD;
  if (sessionBefore.status !== "idle") return DISPLAY_WORKER_PATH.BUSY_RESTART;
  if (sessionBefore.binding?.mapIdentity !== binding?.mapIdentity) return DISPLAY_WORKER_PATH.STALE_MAP;
  if (Number(sessionBefore.binding?.mapRevision) !== Number(binding?.mapRevision)) return DISPLAY_WORKER_PATH.STALE_REVISION;
  return DISPLAY_WORKER_PATH.STALE_CONTEXT;
}

export function scheduleDisplayWorkerFrames(ledger, startedAt, requestFrame = globalThis.requestAnimationFrame, readTime = () => performance.now()) {
  if (!ledger?.frames || typeof requestFrame !== "function") return false;
  requestFrame(() => {
    ledger.frames.firstAnimationFrameMs = roundMs(readTime() - startedAt);
    requestFrame(() => {
      ledger.frames.presentedFrameMs = roundMs(readTime() - startedAt);
    });
  });
  return true;
}

function isReusableSession(session, binding) {
  return session?.status === "idle"
    && session.binding?.mapIdentity === binding?.mapIdentity
    && Number(session.binding?.mapRevision) === Number(binding?.mapRevision)
    && Number(session.binding?.generationToken) === Number(binding?.generationToken)
    && String(session.binding?.lockFingerprint || "") === String(binding?.lockFingerprint || "");
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clonePlain(value) {
  return value === undefined ? undefined : value === null ? null : JSON.parse(JSON.stringify(value));
}
