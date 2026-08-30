const POINTER_MOUSE_THRESHOLD_CSS_PX = 5;
const POINTER_TOUCH_THRESHOLD_CSS_PX = 8;
const WHEEL_BURST_GAP_MS = 140;
const TRACKPAD_PIXEL_DELTA_THRESHOLD = 48;
const MIN_CAMERA_SCALE = 0.5;
const MAX_CAMERA_SCALE = 12;

export function classifyViewportWheelIntent(event) {
  if (event?.ctrlKey) return "zoom";
  if (Number(event?.deltaMode) !== 0) return "zoom";
  const deltaX = Math.abs(Number(event?.deltaX) || 0);
  const deltaY = Math.abs(Number(event?.deltaY) || 0);
  if (deltaX >= 0.5) return "pan";
  if (!deltaY) return "zoom";
  const fractional = Math.abs(deltaY - Math.round(deltaY)) > 0.001;
  return fractional || deltaY < TRACKPAD_PIXEL_DELTA_THRESHOLD ? "pan" : "zoom";
}

export function normalizeViewportWheelDelta(event, viewport = {}) {
  const height = Math.max(1, Number(viewport.height) || 1);
  const unit = Number(event?.deltaMode) === 1 ? 16 : Number(event?.deltaMode) === 2 ? height : 1;
  return {
    x: clampWheelDelta((Number(event?.deltaX) || 0) * unit),
    y: clampWheelDelta((Number(event?.deltaY) || 0) * unit)
  };
}

export function installViewportInputController({
  canvas,
  camera,
  onChange = () => {},
  onHover = () => {},
  onSelect = () => {},
  onInteractionStart = () => {},
  onInteractionEnd = () => {},
  getViewportSize = () => canvas.getBoundingClientRect()
}) {
  const pointers = new Map();
  const documentRef = canvas.ownerDocument;
  const view = documentRef?.defaultView || globalThis;
  let pointerOver = false;
  let spacePanActive = false;
  let interactionActive = false;
  let cancellingPointers = false;
  let touchGesture = null;
  let wheelBurst = null;

  const listeners = [
    [canvas, "pointerenter", handlePointerEnter],
    [canvas, "pointerleave", handlePointerLeave],
    [canvas, "pointerdown", handlePointerDown],
    [canvas, "pointermove", handlePointerMove],
    [canvas, "pointerup", handlePointerUp],
    [canvas, "pointercancel", handlePointerCancel],
    [canvas, "lostpointercapture", handleLostPointerCapture],
    [canvas, "contextmenu", suppressContextMenu],
    [canvas, "auxclick", suppressAuxClick],
    [canvas, "wheel", handleWheel, {passive: false}],
    [documentRef, "keydown", handleKeyDown],
    [documentRef, "keyup", handleKeyUp],
    [view, "blur", handleWindowBlur]
  ];
  for (const [target, name, handler, options] of listeners) target?.addEventListener?.(name, handler, options);
  syncCanvasState();

  return {
    destroy,
    isSpacePanActive: () => spacePanActive,
    snapshot: () => ({
      pointerCount: pointers.size,
      interactionActive,
      spacePanActive,
      wheelIntent: wheelBurst?.intent || null
    })
  };

  function handlePointerEnter() {
    pointerOver = true;
  }

  function handlePointerLeave() {
    pointerOver = false;
  }

  function handlePointerDown(event) {
    const pointerType = normalizedPointerType(event);
    const mode = pointerDownMode(event, pointerType, spacePanActive);
    if (!mode) return;
    const pointer = {
      id: event.pointerId,
      pointerType,
      mode,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY
    };
    pointers.set(pointer.id, pointer);
    capturePointer(pointer.id);

    if (pointerType === "touch" && touchPointers().length >= 2) {
      event.preventDefault();
      enterTouchGesture();
      return;
    }
    if (mode === "pan") {
      event.preventDefault();
      beginInteraction(pointer.id, pointerType === "touch" ? "touch-pan" : "pan");
    }
  }

  function handlePointerMove(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      if (normalizedPointerType(event) !== "touch") onHover(event);
      return;
    }
    const previousX = pointer.lastX;
    const previousY = pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;

    if (pointer.pointerType === "touch" && touchGesture && touchPointers().length >= 2) {
      event.preventDefault();
      applyTouchGesture();
      return;
    }

    if (pointer.mode === "select") {
      if (pointerDistance(pointer) <= pointerMoveThreshold(pointer.pointerType)) {
        if (pointer.pointerType !== "touch") onHover(event);
        return;
      }
      pointer.mode = "pan";
      pointer.moved = true;
      beginInteraction(pointer.id, pointer.pointerType === "touch" ? "touch-pan" : "pan");
    }

    if (pointer.mode !== "pan") return;
    event.preventDefault();
    pointer.moved ||= pointerDistance(pointer) > pointerMoveThreshold(pointer.pointerType);
    panCamera(event.clientX - previousX, event.clientY - previousY, getViewportSize());
  }

  function handlePointerUp(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const wasTouchGesture = Boolean(touchGesture);
    pointers.delete(event.pointerId);
    releasePointer(event.pointerId);

    if (pointer.pointerType === "touch" && wasTouchGesture) {
      event.preventDefault();
      const remaining = touchPointers();
      if (remaining.length === 1) {
        const survivor = remaining[0];
        survivor.mode = "pan";
        survivor.moved = true;
        survivor.startX = survivor.lastX;
        survivor.startY = survivor.lastY;
        touchGesture = null;
      } else if (!remaining.length) {
        touchGesture = null;
        endInteraction(event.pointerId, "touch-gesture");
      } else {
        touchGesture = touchGestureSnapshot(remaining);
      }
      return;
    }

    if (pointer.mode === "select" && !pointer.moved) onSelect(event);
    if (pointer.mode === "pan") {
      event.preventDefault();
      endInteraction(event.pointerId, pointer.pointerType === "touch" ? "touch-pan" : "pan");
      if (pointer.pointerType !== "touch") onHover(event);
    }
  }

  function handlePointerCancel(event) {
    if (!pointers.has(event.pointerId)) return;
    cancelAllPointers(event.pointerId, "pointercancel");
  }

  function handleLostPointerCapture(event) {
    if (cancellingPointers || !pointers.has(event.pointerId)) return;
    cancelAllPointers(event.pointerId, "lostpointercapture");
  }

  function suppressContextMenu(event) {
    event.preventDefault();
  }

  function suppressAuxClick(event) {
    if (event.button === 1 || event.button === 2) event.preventDefault();
  }

  function handleWheel(event) {
    event.preventDefault();
    const viewport = getViewportSize();
    const delta = normalizeViewportWheelDelta(event, viewport);
    if (!delta.x && !delta.y) return;
    const now = eventTimestamp(event, view);
    const classified = classifyViewportWheelIntent(event);
    const burstCompatible = wheelBurst
      && wheelBurst.ctrlKey === Boolean(event.ctrlKey)
      && now - wheelBurst.at <= WHEEL_BURST_GAP_MS;
    const intent = burstCompatible ? wheelBurst.intent : classified;
    wheelBurst = {intent, ctrlKey: Boolean(event.ctrlKey), at: now};
    if (intent === "pan") {
      panCamera(-delta.x, -delta.y, viewport, {wheel: true});
      return;
    }
    zoomCameraAtClientPoint(camera, canvas.getBoundingClientRect(), event.clientX, event.clientY, delta.y);
    onChange({kind: "zoom", source: event.ctrlKey ? "pinch" : "wheel"});
  }

  function handleKeyDown(event) {
    if (event.code !== "Space" || isEditableTarget(event.target)) return;
    spacePanActive = true;
    if (pointerOver) event.preventDefault();
    syncCanvasState();
  }

  function handleKeyUp(event) {
    if (event.code !== "Space") return;
    spacePanActive = false;
    syncCanvasState();
  }

  function handleWindowBlur() {
    spacePanActive = false;
    if (pointers.size) cancelAllPointers(null, "window-blur");
    syncCanvasState();
  }

  function enterTouchGesture() {
    const touches = touchPointers();
    if (touches.length < 2) return;
    for (const pointer of touches) {
      pointer.mode = "gesture";
      pointer.moved = true;
    }
    touchGesture = touchGestureSnapshot(touches);
    beginInteraction(touches[0].id, "touch-gesture");
  }

  function applyTouchGesture() {
    const touches = touchPointers();
    if (!touchGesture || touches.length < 2) return;
    const next = touchGestureSnapshot(touches);
    const previousScale = camera.scale;
    const scaleRatio = touchGesture.distance > 0 ? next.distance / touchGesture.distance : 1;
    const nextScale = clampScale(previousScale * scaleRatio);
    const previousPoint = clientPointToNdc(touchGesture.centerX, touchGesture.centerY, canvas.getBoundingClientRect());
    const nextPoint = clientPointToNdc(next.centerX, next.centerY, canvas.getBoundingClientRect());
    const worldX = (previousPoint.x - camera.offsetX) / previousScale;
    const worldY = (previousPoint.y - camera.offsetY) / previousScale;
    camera.scale = nextScale;
    camera.offsetX = nextPoint.x - worldX * nextScale;
    camera.offsetY = nextPoint.y - worldY * nextScale;
    touchGesture = next;
    onChange({kind: Math.abs(nextScale - previousScale) > 0.000001 ? "zoom" : "pan", source: "touch"});
  }

  function panCamera(dx, dy, viewport, {wheel = false} = {}) {
    const width = Math.max(1, Number(viewport.width) || 1);
    const height = Math.max(1, Number(viewport.height) || 1);
    camera.offsetX += (dx / width) * 2;
    camera.offsetY -= (dy / height) * 2;
    onChange({kind: "pan", source: wheel ? "wheel" : "pointer"});
  }

  function beginInteraction(pointerId, source) {
    if (interactionActive) return;
    interactionActive = true;
    canvas.classList?.add("map-canvas--navigation-active");
    onInteractionStart({kind: "pan", pointerId, source});
  }

  function endInteraction(pointerId, source) {
    if (!interactionActive) return;
    interactionActive = false;
    canvas.classList?.remove("map-canvas--navigation-active");
    onInteractionEnd({kind: "pan", pointerId, source});
  }

  function cancelAllPointers(pointerId, source) {
    if (cancellingPointers) return;
    cancellingPointers = true;
    for (const pointer of pointers.values()) releasePointer(pointer.id);
    pointers.clear();
    touchGesture = null;
    endInteraction(pointerId, source);
    cancellingPointers = false;
  }

  function touchPointers() {
    return [...pointers.values()].filter(pointer => pointer.pointerType === "touch");
  }

  function capturePointer(pointerId) {
    try {
      canvas.setPointerCapture?.(pointerId);
    } catch {
      // A browser may reject capture after a pointer is already cancelled.
    }
  }

  function releasePointer(pointerId) {
    try {
      if (!canvas.hasPointerCapture || canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture?.(pointerId);
    } catch {
      // Lost capture is handled by the same cleanup path.
    }
  }

  function syncCanvasState() {
    canvas.classList?.toggle("map-canvas--space-pan", spacePanActive);
  }

  function destroy() {
    cancelAllPointers(null, "destroy");
    for (const [target, name, handler, options] of listeners) target?.removeEventListener?.(name, handler, options);
  }
}

function pointerDownMode(event, pointerType, spacePanActive) {
  if (pointerType === "mouse" || pointerType === "pen") {
    if (event.button === 0) return spacePanActive ? "pan" : "select";
    if (event.button === 1 || event.button === 2) return "pan";
    return null;
  }
  return event.button === 0 ? "select" : null;
}

function normalizedPointerType(event) {
  return ["mouse", "pen", "touch"].includes(event?.pointerType) ? event.pointerType : "mouse";
}

function pointerMoveThreshold(pointerType) {
  return pointerType === "touch" ? POINTER_TOUCH_THRESHOLD_CSS_PX : POINTER_MOUSE_THRESHOLD_CSS_PX;
}

function pointerDistance(pointer) {
  return Math.hypot(pointer.lastX - pointer.startX, pointer.lastY - pointer.startY);
}

function touchGestureSnapshot(touches) {
  const [first, second] = touches;
  return {
    centerX: (first.lastX + second.lastX) / 2,
    centerY: (first.lastY + second.lastY) / 2,
    distance: Math.max(1, Math.hypot(second.lastX - first.lastX, second.lastY - first.lastY))
  };
}

function zoomCameraAtClientPoint(camera, rect, clientX, clientY, deltaY) {
  const point = clientPointToNdc(clientX, clientY, rect);
  const previousScale = camera.scale;
  const nextScale = clampScale(previousScale * Math.exp(-deltaY * 0.001));
  const worldX = (point.x - camera.offsetX) / previousScale;
  const worldY = (point.y - camera.offsetY) / previousScale;
  camera.scale = nextScale;
  camera.offsetX = point.x - worldX * nextScale;
  camera.offsetY = point.y - worldY * nextScale;
}

function clientPointToNdc(clientX, clientY, rect) {
  const width = Math.max(1, Number(rect.width) || 1);
  const height = Math.max(1, Number(rect.height) || 1);
  return {
    x: ((clientX - rect.left) / width) * 2 - 1,
    y: 1 - ((clientY - rect.top) / height) * 2
  };
}

function clampScale(value) {
  return Math.max(MIN_CAMERA_SCALE, Math.min(MAX_CAMERA_SCALE, value));
}

function clampWheelDelta(value) {
  return Math.max(-1200, Math.min(1200, value));
}

function eventTimestamp(event, view) {
  const value = Number(event?.timeStamp);
  if (Number.isFinite(value) && value >= 0) return value;
  return typeof view.performance?.now === "function" ? view.performance.now() : Date.now();
}

function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  const tagName = String(target.tagName || "").toLowerCase();
  return ["input", "textarea", "select", "button"].includes(tagName);
}
