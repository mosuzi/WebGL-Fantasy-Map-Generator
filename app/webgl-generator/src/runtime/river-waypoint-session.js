import {inspectRiverControlPointAction, inspectRiverVisualWaypoint} from "./river-edit-commands.js";
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
    stage(map, packCell) {
      if (!activeMap || map !== activeMap) return invalidate("map-changed", "地图已变化，请重新开始选择");
      const inspected = inspectRiverVisualWaypoint(map, riverId, packCell);
      if (!inspected.valid) {
        setDraft(null, inspected.code || "invalid-candidate");
        return inspected;
      }
      const baseline = captureBaseline(map, riverId);
      if (!baseline) return invalidate("river-missing", `找不到河流 #${riverId}`);
      setDraft({...inspected, baseline}, "stage");
      return draft;
    },
    stageAction(map, action) {
      if (!activeMap || map !== activeMap) return invalidate("map-changed", "地图已变化，请重新开始选择");
      if (!baseline) return invalidate("river-missing", `找不到河流 #${riverId}`);
      const inspected = inspectRiverControlPointAction(map, riverId, action, working);
      if (!inspected.valid) {
        setDraft(null, inspected.code || "invalid-action");
        return inspected;
      }
      working = {points: clonePoints(inspected.points), controlPoints: cloneControls(inspected.controlPoints), length: inspected.length};
      setDraft({...inspected, baseline, working: cloneWorkingState(working)}, "action");
      return draft;
    },
    validate(map) {
      if (!draft?.valid) return invalid("missing-draft", "当前没有可应用的河道控制点预览");
      if (map !== activeMap || map !== draft.baseline.mapIdentity) return invalidate("map-changed", "地图已变化，请重新选择控制点");
      const baseline = captureBaseline(map, riverId);
      if (!baseline) return invalidate("river-missing", `河流 #${riverId} 已不存在`);
      if (baseline.pointsFingerprint !== draft.baseline.pointsFingerprint
        || baseline.lengthFingerprint !== draft.baseline.lengthFingerprint
        || baseline.controlPointsFingerprint !== draft.baseline.controlPointsFingerprint) {
        return invalidate("river-changed", `河流 #${riverId} 已变化，请重新选择控制点`);
      }
      if (draft.action && draft.working) return {valid: true, code: "ok", reason: "", draft, inspected: draft};
      const inspected = inspectRiverVisualWaypoint(map, riverId, draft.packCell);
      if (!inspected.valid || pointsFingerprint(inspected.points) !== pointsFingerprint(draft.points)) {
        return invalidate(inspected.code || "preview-changed", inspected.reason || "河道预览已失效，请重新选择控制点");
      }
      return {valid: true, code: "ok", reason: "", draft, inspected};
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
    restoreWorking(previous, reason = "restore") {
      if (!previous) return this.clear(reason);
      working = cloneWorkingState(previous);
      setDraft(null, reason);
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
    pointsFingerprint: pointsFingerprint(river.points),
    controlPointsFingerprint: controlPointsFingerprint(river.controlPoints, river, map?.pack?.cells),
    lengthFingerprint: finiteFingerprint(river.length)
  };
}

function cloneWorkingState(state) {
  return {
    points: clonePoints(state.points),
    controlPoints: cloneControls(state.controlPoints),
    length: finiteFingerprint(state.length) === "null" ? null : Number(state.length)
  };
}

function clonePoints(points) {
  return (points || []).map(point => Array.isArray(point) ? [...point] : point);
}

function cloneControls(controls) {
  return Array.isArray(controls) ? controls.map(control => ({...control})) : [];
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

function invalid(code, reason) {
  return {valid: false, changed: false, code, reason};
}
