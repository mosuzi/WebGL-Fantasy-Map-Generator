import {inspectRiverControlPointAction} from "./river-edit-commands.js";
import {normalizeRiverVisualCurve} from "../geometry/cubic-path.js";
import {normalizeRiverControlPoints} from "./river-control-points.js";

export function createRiverWaypointSession({onDraftChange = () => {}} = {}) {
  let activeMap = null;
  let riverId = null;
  let draft = null;
  let baseline = null;
  let working = null;

  return {
    begin(map, nextRiverId) {
      activeMap = map || null;
      riverId = Number(nextRiverId);
      baseline = captureBaseline(map, riverId);
      working = baseline ? cloneWorkingState(baseline) : null;
      setDraft(null, "begin");
      return this.getSnapshot();
    },
    stageAction(map, action) {
      if (!activeMap || map !== activeMap) return invalidate("map-changed", "地图已变化，请重新开始选择");
      if (!baseline) return invalidate("river-missing", `找不到河流 #${riverId}`);
      const inspected = inspectRiverControlPointAction(map, riverId, action, working);
      if (!inspected.valid) {
        restoreWorkingDraft(inspected.code || "invalid-action");
        return inspected;
      }
      working = {points: clonePoints(inspected.points), controlPoints: cloneControls(inspected.controlPoints), visualCurve: cloneCurve(inspected.visualCurve), length: inspected.length};
      const changed = workingChanged(working, baseline);
      setDraft({...inspected, changed, baseline, working: cloneWorkingState(working)}, "action");
      return draft;
    },
    validate(map) {
      if (!draft?.valid) return invalid("missing-draft", "当前没有可应用的河道控制点预览");
      if (map !== activeMap || map !== draft.baseline.mapIdentity) return invalidate("map-changed", "地图已变化，请重新选择控制点");
      const baseline = captureBaseline(map, riverId);
      if (!baseline) return invalidate("river-missing", `河流 #${riverId} 已不存在`);
      if (baseline.pointsFingerprint !== draft.baseline.pointsFingerprint
        || baseline.lengthFingerprint !== draft.baseline.lengthFingerprint
        || baseline.controlPointsFingerprint !== draft.baseline.controlPointsFingerprint
        || baseline.visualCurveFingerprint !== draft.baseline.visualCurveFingerprint) {
        return invalidate("river-changed", `河流 #${riverId} 已变化，请重新选择控制点`);
      }
      return {valid: true, code: "ok", reason: "", draft, inspected: draft};
    },
    clear(reason = "clear") {
      working = baseline ? cloneWorkingState(baseline) : null;
      setDraft(null, reason);
      return this.getSnapshot();
    },
    end(reason = "end") {
      setDraft(null, reason);
      activeMap = null;
      riverId = null;
      baseline = null;
      working = null;
      return this.getSnapshot();
    },
    getDraft() {
      return draft;
    },
    getWorkingState() {
      return working ? cloneWorkingState(working) : null;
    },
    getPreview() {
      if (!working || !Number.isInteger(riverId)) return null;
      return {
        valid: true,
        code: "control-points",
        reason: "",
        riverId,
        points: clonePoints(working.points),
        controlPoints: cloneControls(working.controlPoints),
        visualCurve: cloneCurve(working.visualCurve),
        changed: workingChanged(working, baseline),
        length: working.length
      };
    },
    restoreWorking(previous, reason = "restore") {
      if (!previous) return this.clear(reason);
      working = cloneWorkingState(previous);
      restoreWorkingDraft(reason);
      return this.getSnapshot();
    },
    getSnapshot() {
      return {active: Boolean(activeMap && Number.isInteger(riverId)), riverId, hasDraft: Boolean(draft), draft};
    }
  };

  function invalidate(code, reason) {
    setDraft(null, code);
    return invalid(code, reason);
  }

  function restoreWorkingDraft(reason) {
    const changed = workingChanged(working, baseline);
    setDraft(changed ? {
      valid: true,
      changed: true,
      code: "ok",
      reason: "",
      action: "restore",
      riverId,
      points: clonePoints(working.points),
      controlPoints: cloneControls(working.controlPoints),
      visualCurve: cloneCurve(working.visualCurve),
      length: working.length,
      baseline,
      working: cloneWorkingState(working)
    } : null, reason);
  }

  function setDraft(nextDraft, reason) {
    draft = nextDraft || null;
    onDraftChange(draft, {reason});
  }
}

export async function withRiverWaypointPreviewSuppressed(renderer, task) {
  const preview = renderer?.riverWaypointPreview || null;
  if (!preview || typeof renderer?.setRiverWaypointPreview !== "function") return task();
  renderer.setRiverWaypointPreview(null, {draw: true});
  const suppressedRevision = Number(renderer.riverWaypointPreviewRevision);
  try {
    return await task();
  } finally {
    const revisionUnchanged = Number.isFinite(suppressedRevision)
      ? Number(renderer.riverWaypointPreviewRevision) === suppressedRevision
      : !renderer.riverWaypointPreview;
    if (revisionUnchanged && !renderer.riverWaypointPreview) {
      renderer.setRiverWaypointPreview(preview, {draw: true});
    }
  }
}

function captureBaseline(map, riverId) {
  const river = (map?.rivers?.rivers || map?.pack?.rivers || []).find(item => Number(item?.id ?? item?.i) === Number(riverId));
  if (!river) return null;
  return {
    mapIdentity: map,
    riverId: Number(riverId),
    points: clonePoints(river.points),
    controlPoints: cloneControls(normalizeRiverControlPoints(river, map?.pack?.cells)),
    visualCurve: cloneCurve(normalizeRiverVisualCurve(river.visualCurve)),
    length: finiteFingerprint(river.length) === "null" ? null : Number(river.length),
    pointsFingerprint: pointsFingerprint(river.points),
    controlPointsFingerprint: controlPointsFingerprint(river.controlPoints, river, map?.pack?.cells),
    visualCurveFingerprint: JSON.stringify(normalizeRiverVisualCurve(river.visualCurve)),
    lengthFingerprint: finiteFingerprint(river.length)
  };
}

function cloneWorkingState(state) {
  return {
    points: clonePoints(state.points),
    controlPoints: cloneControls(state.controlPoints),
    visualCurve: cloneCurve(state.visualCurve),
    length: finiteFingerprint(state.length) === "null" ? null : Number(state.length)
  };
}

function clonePoints(points) {
  return (points || []).map(point => Array.isArray(point) ? [...point] : point);
}

function cloneControls(controls) {
  return Array.isArray(controls) ? controls.map(control => ({...control})) : [];
}

function cloneCurve(curve) {
  return curve && typeof curve === "object" ? {...curve} : null;
}

function pointsFingerprint(points) {
  return (points || []).map(point => `${finiteFingerprint(point?.[0])},${finiteFingerprint(point?.[1])},${finiteFingerprint(point?.[2])}`).join(";");
}

function controlPointsFingerprint(rawControls, river, packCells) {
  return cloneControls(normalizeRiverControlPoints({...river, controlPoints: rawControls}, packCells))
    .map(control => `${control.id}:${control.pointIndex}:${control.x},${control.y}:${control.packCell ?? "null"}`)
    .join(";");
}

function finiteFingerprint(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "null";
}

function workingChanged(working, baseline) {
  if (!working || !baseline) return false;
  return JSON.stringify({
    points: working.points,
    controlPoints: working.controlPoints,
    visualCurve: working.visualCurve,
    length: finiteFingerprint(working.length)
  }) !== JSON.stringify({
    points: baseline.points,
    controlPoints: baseline.controlPoints,
    visualCurve: baseline.visualCurve,
    length: finiteFingerprint(baseline.length)
  });
}

function invalid(code, reason) {
  return {valid: false, changed: false, code, reason};
}
