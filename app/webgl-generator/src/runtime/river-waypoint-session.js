import {inspectRiverVisualWaypoint} from "./river-edit-commands.js";

export function createRiverWaypointSession({onDraftChange = () => {}} = {}) {
  let activeMap = null;
  let riverId = null;
  let draft = null;

  return {
    begin(map, nextRiverId) {
      activeMap = map || null;
      riverId = Number(nextRiverId);
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
    validate(map) {
      if (!draft?.valid) return invalid("missing-draft", "当前没有可应用的河道控制点预览");
      if (map !== activeMap || map !== draft.baseline.mapIdentity) return invalidate("map-changed", "地图已变化，请重新选择控制点");
      const baseline = captureBaseline(map, riverId);
      if (!baseline) return invalidate("river-missing", `河流 #${riverId} 已不存在`);
      if (baseline.pointsFingerprint !== draft.baseline.pointsFingerprint || baseline.lengthFingerprint !== draft.baseline.lengthFingerprint) {
        return invalidate("river-changed", `河流 #${riverId} 已变化，请重新选择控制点`);
      }
      const inspected = inspectRiverVisualWaypoint(map, riverId, draft.packCell);
      if (!inspected.valid || pointsFingerprint(inspected.points) !== pointsFingerprint(draft.points)) {
        return invalidate(inspected.code || "preview-changed", inspected.reason || "河道预览已失效，请重新选择控制点");
      }
      return {valid: true, code: "ok", reason: "", draft, inspected};
    },
    clear(reason = "clear") {
      setDraft(null, reason);
      return this.getSnapshot();
    },
    end(reason = "end") {
      setDraft(null, reason);
      activeMap = null;
      riverId = null;
      return this.getSnapshot();
    },
    getDraft() {
      return draft;
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
    pointsFingerprint: pointsFingerprint(river.points),
    lengthFingerprint: finiteFingerprint(river.length)
  };
}

function pointsFingerprint(points) {
  return (points || []).map(point => `${finiteFingerprint(point?.[0])},${finiteFingerprint(point?.[1])},${finiteFingerprint(point?.[2])}`).join(";");
}

function finiteFingerprint(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "null";
}

function invalid(code, reason) {
  return {valid: false, changed: false, code, reason};
}
