import {findRiverControlPointAtWorld, normalizeRiverControlPoints} from "./river-control-points.js";
import {pickGridCell} from "../renderer/picking.js";

const DRAG_SLOP_PX = 4;
const DOUBLE_CLICK_MS = 360;
const DOUBLE_CLICK_DISTANCE_PX = 7;

export function bindRiverControlPointEditing(target, state, documentRef) {
  let drag = null;
  let suppressSelectPointerId = null;
  let pendingMove = null;
  let moveFrame = null;
  let lastControlClick = null;

  const onPointerDown = event => {
    if (!isActive(state) || event.button !== 0) return;
    let beforeAdd = null;
    try {
      const world = readWorldPoint(state, event);
      if (!world) return;
      const river = activeRiver(state);
      const controls = readWorkingControls(state, river);
      const threshold = state.renderer?.pickThresholdWorld?.(11) || 11;
      const control = findRiverControlPointAtWorld(state.map, river, world[0], world[1], threshold, controls);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (control) {
        drag = {
          pointerId: event.pointerId,
          controlPointId: control.id,
          before: state.riverEdit.session?.getWorkingState?.(),
          startClientX: event.clientX,
          startClientY: event.clientY,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          moved: false
        };
        capturePointer(target, event.pointerId);
        return;
      }
      beforeAdd = state.riverEdit.session?.getWorkingState?.();
      stageAction(state, documentRef, pointAction(state, "add", world));
      suppressSelectPointerId = event.pointerId;
      lastControlClick = null;
    } catch (error) {
      if (!drag && beforeAdd) {
        try { restoreWorking(beforeAdd, "pointerdown-error"); } catch {}
      }
      abortDrag(error, "pointerdown-error");
    }
  };

  const onPointerMove = event => {
    if (!drag || drag.pointerId !== event.pointerId || !isActive(state)) return;
    try {
      event.preventDefault();
      event.stopImmediatePropagation();
      const world = readWorldPoint(state, event);
      if (!world) return;
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < DRAG_SLOP_PX) return;
      drag.moved = true;
      pendingMove = {world, controlPointId: drag.controlPointId};
      scheduleMove();
    } catch (error) {
      abortDrag(error, "pointermove-error");
    }
  };

  const onPointerUp = event => {
    if (suppressSelectPointerId === event.pointerId) {
      suppressSelectPointerId = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag;
    try {
      if (current.moved) {
        const world = readWorldPoint(state, event);
        if (world) pendingMove = {world, controlPointId: current.controlPointId};
        cancelMoveFrame(false);
        flushMove();
      } else {
        registerControlClick(current, event);
      }
    } catch (error) {
      try { restoreWorking(current.before, "pointerup-error"); } catch {}
      reportInteractionError(error);
    } finally {
      drag = null;
      cancelMoveFrame();
      releasePointer(target, event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onPointerCancel = event => {
    if (suppressSelectPointerId === event.pointerId) suppressSelectPointerId = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag;
    try {
      restoreWorking(current.before, "pointercancel");
      state.panels.river?.setWaypointFeedback?.(null);
    } catch (error) {
      reportInteractionError(error);
    } finally {
      drag = null;
      cancelMoveFrame();
      lastControlClick = null;
      releasePointer(target, event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onDoubleClick = event => {
    if (!isActive(state) || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  target.addEventListener("pointerdown", onPointerDown, true);
  target.addEventListener("pointermove", onPointerMove, true);
  target.addEventListener("pointerup", onPointerUp, true);
  target.addEventListener("pointercancel", onPointerCancel, true);
  target.addEventListener("dblclick", onDoubleClick, true);

  return {
    cancel(reason = "cancel") {
      cancelMoveFrame();
      lastControlClick = null;
      suppressSelectPointerId = null;
      if (!drag) return false;
      const current = drag;
      try {
        restoreWorking(current.before, reason);
      } catch (error) {
        reportInteractionError(error);
      } finally {
        drag = null;
        releasePointer(target, current.pointerId);
      }
      return true;
    },
    dispose() {
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("pointermove", onPointerMove, true);
      target.removeEventListener("pointerup", onPointerUp, true);
      target.removeEventListener("pointercancel", onPointerCancel, true);
      target.removeEventListener("dblclick", onDoubleClick, true);
      const current = drag;
      try {
        if (current) restoreWorking(current.before, "dispose");
      } catch (error) {
        reportInteractionError(error);
      } finally {
        cancelMoveFrame();
        drag = null;
        if (current) releasePointer(target, current.pointerId);
      }
      suppressSelectPointerId = null;
      lastControlClick = null;
    },
    getActiveDrag() {
      return drag ? {...drag} : null;
    }
  };

  function scheduleMove() {
    if (moveFrame !== null) return;
    const view = documentRef?.defaultView;
    if (view?.requestAnimationFrame) {
      moveFrame = view.requestAnimationFrame(() => {
        moveFrame = null;
        try { flushMove(); } catch (error) { abortDrag(error, "pointermove-error"); }
      });
    } else if (view?.setTimeout) {
      moveFrame = view.setTimeout(() => {
        moveFrame = null;
        try { flushMove(); } catch (error) { abortDrag(error, "pointermove-error"); }
      }, 16);
    } else {
      flushMove();
    }
  }

  function flushMove() {
    const pending = pendingMove;
    pendingMove = null;
    if (!pending || !isActive(state)) return;
    stageAction(state, documentRef, {...pointAction(state, "move", pending.world), controlPointId: pending.controlPointId});
  }

  function cancelMoveFrame(clearPending = true) {
    const view = documentRef?.defaultView;
    if (moveFrame !== null) {
      try {
        if (view?.cancelAnimationFrame) view.cancelAnimationFrame(moveFrame);
        else view?.clearTimeout?.(moveFrame);
      } catch {}
    }
    moveFrame = null;
    if (clearPending) pendingMove = null;
  }

  function abortDrag(error, reason) {
    const current = drag;
    try {
      if (current) restoreWorking(current.before, reason);
    } catch {}
    finally {
      drag = null;
      cancelMoveFrame();
      lastControlClick = null;
      if (current) releasePointer(target, current.pointerId);
    }
    reportInteractionError(error);
  }

  function restoreWorking(before, reason) {
    state.riverEdit.session?.restoreWorking?.(before, reason);
  }

  function reportInteractionError() {
    try {
      state.panels.river?.setWaypointFeedback?.({tone: "error", code: "control-point-interaction-error", message: "河道控制点操作失败，已恢复修改前状态。"});
    } catch {}
  }

  function registerControlClick(current, event) {
    const click = {id: current.controlPointId, time: Number(event.timeStamp), x: event.clientX, y: event.clientY};
    const previous = lastControlClick;
    lastControlClick = click;
    if (!previous || previous.id !== click.id) return;
    if (click.time - previous.time > DOUBLE_CLICK_MS || Math.hypot(click.x - previous.x, click.y - previous.y) > DOUBLE_CLICK_DISTANCE_PX) return;
    lastControlClick = null;
    stageAction(state, documentRef, {type: "delete", controlPointId: click.id});
  }
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

function readWorldPoint(state, event) {
  const world = state.renderer?.screenToWorld?.(event.clientX, event.clientY);
  const x = Number(world?.x);
  const y = Number(world?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function pointAction(state, type, point) {
  let pick = null;
  try { pick = pickGridCell(state.map, point[0], point[1]); } catch {}
  return {type, point, packCell: Number.isInteger(pick?.packCell) ? pick.packCell : null};
}

function stageAction(state, documentRef, action) {
  const draft = state.riverEdit.session?.stageAction?.(state.map, action);
  if (!draft?.valid) {
    state.renderer?.setRiverWaypointPreview?.(state.riverEdit.session?.getPreview?.());
    state.panels.river?.setWaypointFeedback?.({tone: "error", code: draft?.code || "invalid-action", message: draft?.reason || "控制点操作不可用。"});
    return draft;
  }
  state.panels.river?.setWaypointFeedback?.(null);
  return draft;
}

function capturePointer(target, pointerId) {
  try { target.setPointerCapture?.(pointerId); } catch {}
}

function releasePointer(target, pointerId) {
  try { if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId); } catch {}
}
