export function createLatestPrewarmScheduler({run, isCurrent, onAccepted, onDiscarded = null, delayMs = 350, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  if (typeof run !== "function" || typeof isCurrent !== "function" || typeof onAccepted !== "function") {
    throw new TypeError("latest prewarm scheduler 缺少 run / isCurrent / onAccepted");
  }
  let sequence = 0;
  let timer = null;
  let controller = null;
  let snapshot = Object.freeze({status: "idle", sequence: 0, key: "", reason: ""});

  return Object.freeze({schedule, cancel, getSnapshot: () => snapshot});

  function schedule(task) {
    if (!task) {
      if (snapshot.status === "idle" || snapshot.status === "ready") return snapshot.sequence;
    } else {
      const requestedKey = String(task.key || "");
      if (requestedKey && snapshot.key === requestedKey && ["queued", "running", "ready"].includes(snapshot.status)) return snapshot.sequence;
    }
    const currentSequence = ++sequence;
    cancelPending("superseded", {advance: false});
    if (!task) {
      snapshot = Object.freeze({status: "idle", sequence: currentSequence, key: "", reason: "empty"});
      return currentSequence;
    }
    const key = String(task.key || currentSequence);
    snapshot = Object.freeze({status: "queued", sequence: currentSequence, key, reason: ""});
    timer = setTimer(() => {
      timer = null;
      if (currentSequence !== sequence || !isCurrent(task)) return discard(task, currentSequence, "obsolete-before-run");
      const activeController = new AbortController();
      controller = activeController;
      snapshot = Object.freeze({status: "running", sequence: currentSequence, key, reason: ""});
      void Promise.resolve(run(task, activeController.signal)).then(result => {
        if (currentSequence !== sequence || activeController.signal.aborted || !isCurrent(task)) return discard(task, currentSequence, "obsolete-result");
        onAccepted(result, task);
        snapshot = Object.freeze({status: "ready", sequence: currentSequence, key, reason: ""});
        if (controller === activeController) controller = null;
      }, error => {
        const aborted = activeController.signal.aborted || error?.name === "AbortError";
        if (controller === activeController) controller = null;
        if (aborted || currentSequence !== sequence) return discard(task, currentSequence, "cancelled");
        snapshot = Object.freeze({status: "failed", sequence: currentSequence, key, reason: error?.message || String(error)});
      });
    }, Math.max(0, Number(delayMs) || 0));
    return currentSequence;
  }

  function cancel(reason = "cancelled") {
    if (timer === null && controller === null && ["idle", "ready", "failed"].includes(snapshot.status)) return snapshot.sequence;
    const currentSequence = ++sequence;
    cancelPending(reason, {advance: false});
    snapshot = Object.freeze({status: "idle", sequence: currentSequence, key: "", reason: String(reason)});
    return currentSequence;
  }

  function cancelPending(reason, {advance = true} = {}) {
    if (advance) sequence++;
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (controller && !controller.signal.aborted) controller.abort(reason);
    controller = null;
  }

  function discard(task, taskSequence, reason) {
    onDiscarded?.(task, reason);
    if (taskSequence === sequence) snapshot = Object.freeze({status: "idle", sequence: taskSequence, key: "", reason});
  }
}
