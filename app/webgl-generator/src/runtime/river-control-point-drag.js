import {findRiverControlPointAtWorld, normalizeRiverControlPoints} from "./river-control-points.js";

export function bindRiverControlPointEditing(target, state, documentRef) {
  let drag = null;

  const onPointerDown = event => {
    if (!isActive(state) || event.button !== 0) return;
    const pick = state.renderer?.pickClientPoint?.(event.clientX, event.clientY) || {};
    const world = readWorldPoint(pick);
    if (!world) return;
    const river = activeRiver(state);
    const controls = readWorkingControls(state, river);
    const threshold = state.renderer?.pickThresholdWorld?.(11) || 11;
    const control = findRiverControlPointAtWorld(state.map, river, world[0], world[1], threshold, controls);
    const riverPick = Number(pick?.river?.id ?? (pick?.object?.kind === "river" ? pick.object.id : NaN));
    if (!control && riverPick !== Number(river.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (control) {
      drag = {pointerId: event.pointerId, controlPointId: control.id, before: state.riverEdit.session?.getWorkingState?.(), moved: false};
      capturePointer(target, event.pointerId);
      return;
    }
    stageAction(state, documentRef, {type: "add", point: world, packCell: pick.packCell});
  };

  const onPointerMove = event => {
    if (!drag || drag.pointerId !== event.pointerId || !isActive(state)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pick = state.renderer?.pickClientPoint?.(event.clientX, event.clientY) || {};
    const world = readWorldPoint(pick);
    if (!world) return;
    drag.moved = true;
    stageAction(state, documentRef, {type: "move", controlPointId: drag.controlPointId, point: world, packCell: pick.packCell});
  };

  const onPointerUp = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag;
    drag = null;
    releasePointer(target, event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!current.moved) state.riverEdit.session?.restoreWorking?.(current.before, "click-no-move");
  };

  const onPointerCancel = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag;
    drag = null;
    releasePointer(target, event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
    state.riverEdit.session?.restoreWorking?.(current.before, "pointercancel");
    state.panels.river?.setWaypointFeedback?.({tone: "idle", code: "pointercancel", message: "控制点拖动已取消，预览恢复。"});
  };

  const onDoubleClick = event => {
    if (!isActive(state) || event.button !== 0) return;
    const pick = state.renderer?.pickClientPoint?.(event.clientX, event.clientY) || {};
    const world = readWorldPoint(pick);
    if (!world) return;
    const river = activeRiver(state);
    const control = findRiverControlPointAtWorld(state.map, river, world[0], world[1], state.renderer?.pickThresholdWorld?.(13) || 13, readWorkingControls(state, river));
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (drag) {
      releasePointer(target, drag.pointerId);
      drag = null;
    }
    stageAction(state, documentRef, {type: "delete", controlPointId: control.id});
  };

  target.addEventListener("pointerdown", onPointerDown, true);
  target.addEventListener("pointermove", onPointerMove, true);
  target.addEventListener("pointerup", onPointerUp, true);
  target.addEventListener("pointercancel", onPointerCancel, true);
  target.addEventListener("dblclick", onDoubleClick, true);

  return {
    cancel(reason = "cancel") {
      if (!drag) return false;
      const current = drag;
      drag = null;
      releasePointer(target, current.pointerId);
      state.riverEdit.session?.restoreWorking?.(current.before, reason);
      return true;
    },
    dispose() {
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("pointermove", onPointerMove, true);
      target.removeEventListener("pointerup", onPointerUp, true);
      target.removeEventListener("pointercancel", onPointerCancel, true);
      target.removeEventListener("dblclick", onDoubleClick, true);
      drag = null;
    },
    getActiveDrag() {
      return drag ? {...drag} : null;
    }
  };
}

function isActive(state) {
  return Boolean(state.map && state.canvasToolModes?.isActive?.("river:edit-waypoint") && activeRiver(state));
}

function activeRiver(state) {
  const riverId = Number(state.riverEdit?.waypointRiverId);
  return (state.map?.rivers?.rivers || []).find(river => Number(river?.id ?? river?.i) === riverId) || null;
}

function readWorkingControls(state, river) {
  const working = state.riverEdit.session?.getWorkingState?.();
  return normalizeRiverControlPoints({...(river || {}), points: working?.points || river?.points, controlPoints: working?.controlPoints ?? river?.controlPoints}, state.map?.pack?.cells) || [];
}

function readWorldPoint(pick) {
  const x = Number(pick?.worldX);
  const y = Number(pick?.worldY);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function stageAction(state, documentRef, action) {
  const draft = state.riverEdit.session?.stageAction?.(state.map, action);
  if (!draft?.valid) {
    state.renderer?.setRiverWaypointPreview?.(draft);
    state.panels.river?.setWaypointFeedback?.({tone: "error", code: draft?.code || "invalid-action", message: draft?.reason || "控制点操作不可用。"});
    return draft;
  }
  state.panels.river?.setWaypointFeedback?.({tone: "valid", code: draft.action || "ok", message: action.type === "delete" ? "已预览删除控制点，尚未保存。" : action.type === "move" ? "已预览控制点移动，尚未保存。" : "已预览新增控制点，尚未保存。"});
  return draft;
}

function capturePointer(target, pointerId) {
  try { target.setPointerCapture?.(pointerId); } catch {}
}

function releasePointer(target, pointerId) {
  try { if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId); } catch {}
}
