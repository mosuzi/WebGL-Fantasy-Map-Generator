const registries = new WeakMap();

export function getOverlayRegistry(documentRef = globalThis.document) {
  if (!documentRef) return null;
  let registry = registries.get(documentRef);
  if (!registry) {
    registry = new OverlayRegistry(documentRef);
    registries.set(documentRef, registry);
  }
  return registry;
}

export class OverlayRegistry {
  constructor(documentRef) {
    this.documentRef = documentRef;
    this.entries = new Map();
    this.nextZIndex = 900;
    this.handleKeydown = event => this.closeTopmost(event);
    this.handleResize = () => this.reflowFixedOverlays();
    documentRef.addEventListener("keydown", this.handleKeydown, true);
    documentRef.defaultView?.addEventListener("resize", this.handleResize);
  }

  register(id, element, options = {}) {
    if (!id || !element) throw new Error("浮层注册需要 id 和 element");
    this.unregister(id, {restoreFocus: false});
    const kind = options.kind === "fixed" ? "fixed" : "panel";
    const role = String(options.role || kind);
    const pointerHandler = options.activateOnPointerDown === false ? null : () => this.activate(id);
    const entry = {
      id,
      element,
      kind,
      role,
      open: false,
      zIndex: 0,
      returnFocus: null,
      onRequestClose: typeof options.onRequestClose === "function" ? options.onRequestClose : null,
      pointerHandler
    };
    element.dataset.overlayId = id;
    element.dataset.overlayKind = kind;
    element.dataset.overlayRole = role;
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
    if (pointerHandler) element.addEventListener("pointerdown", pointerHandler);
    this.entries.set(id, entry);
    return {
      show: options => this.show(id, options),
      hide: options => this.hide(id, options),
      activate: () => this.activate(id),
      reflow: () => this.reflow(id),
      unregister: options => this.unregister(id, options)
    };
  }

  show(id, options = {}) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const returnFocus = options.returnFocus ?? this.documentRef.activeElement;
    if (entry.kind === "fixed") {
      for (const other of this.entries.values()) {
        if (other.id === id || other.kind !== "fixed" || !other.open) continue;
        this.requestClose(other.id, {restoreFocus: false});
      }
    }
    entry.returnFocus = isRestorableFocusTarget(returnFocus) ? returnFocus : null;
    entry.open = true;
    this.activate(id);
    this.reflow(id);
    if (options.focus !== false) this.focusEntry(entry);
    return true;
  }

  hide(id, {restoreFocus = true} = {}) {
    const entry = this.entries.get(id);
    if (!entry || !entry.open) return false;
    entry.open = false;
    if (restoreFocus) restoreFocusTarget(entry.returnFocus);
    entry.returnFocus = null;
    return true;
  }

  requestClose(id, {restoreFocus = true} = {}) {
    const entry = this.entries.get(id);
    if (!entry || !entry.open) return false;
    const returnFocus = entry.returnFocus;
    entry.open = false;
    entry.returnFocus = null;
    entry.onRequestClose?.();
    if (restoreFocus) restoreFocusTarget(returnFocus);
    return true;
  }

  activate(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.zIndex = this.nextZIndex++;
    entry.element.style.zIndex = String(entry.zIndex);
    entry.element.style.setProperty("--managed-overlay-z-index", String(entry.zIndex));
    return true;
  }

  reflow(id) {
    const entry = this.entries.get(id);
    if (!entry?.open || entry.kind !== "fixed") return false;
    placeFixedOverlay(entry.element, this.documentRef);
    return true;
  }

  reflowFixedOverlays() {
    for (const entry of this.entries.values()) {
      if (entry.open && entry.kind === "fixed") this.reflow(entry.id);
    }
  }

  unregister(id, {restoreFocus = true} = {}) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.open) this.hide(id, {restoreFocus});
    if (entry.pointerHandler) entry.element.removeEventListener("pointerdown", entry.pointerHandler);
    this.entries.delete(id);
    return true;
  }

  snapshot() {
    return [...this.entries.values()].map(entry => ({
      id: entry.id,
      kind: entry.kind,
      role: entry.role,
      open: entry.open,
      zIndex: entry.zIndex
    }));
  }

  closeTopmost(event) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const topmost = [...this.entries.values()]
      .filter(entry => entry.open)
      .sort((a, b) => b.zIndex - a.zIndex)[0];
    if (!topmost) return;
    event.preventDefault();
    event.stopPropagation();
    this.requestClose(topmost.id);
  }

  focusEntry(entry) {
    this.documentRef.defaultView?.requestAnimationFrame?.(() => {
      if (!entry.open || !entry.element.isConnected) return;
      entry.element.focus({preventScroll: true});
    });
  }
}

export function placeFixedOverlay(element, documentRef, safeArea = {}) {
  const view = documentRef?.defaultView;
  if (!element || !view) return null;
  const viewportWidth = Math.max(1, view.innerWidth || documentRef.documentElement?.clientWidth || 1);
  const viewportHeight = Math.max(1, view.innerHeight || documentRef.documentElement?.clientHeight || 1);
  const safe = {
    left: Number(safeArea.left ?? 12),
    top: Number(safeArea.top ?? 64),
    right: Number(safeArea.right ?? 12),
    bottom: Number(safeArea.bottom ?? 64),
    gap: Number(safeArea.gap ?? 12)
  };
  element.style.maxWidth = `calc(100vw - ${safe.left + safe.right}px)`;
  element.style.maxHeight = `calc(100vh - ${safe.top + safe.bottom}px)`;
  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width || element.offsetWidth || 320, viewportWidth - safe.left - safe.right);
  const height = Math.min(rect.height || element.offsetHeight || 220, viewportHeight - safe.top - safe.bottom);
  const mainPanel = documentRef.querySelector('.floating-panel[data-panel-role="main"]:not(.hidden)');
  const mainRect = mainPanel?.getBoundingClientRect?.();
  let left = clamp(Number.parseFloat(element.style.left), safe.left, viewportWidth - width - safe.right, (viewportWidth - width) / 2);
  if (mainRect) {
    const leftSpace = mainRect.left - safe.gap - safe.left;
    const rightSpace = viewportWidth - safe.right - mainRect.right - safe.gap;
    if (width <= leftSpace) left = safe.left;
    else if (width <= rightSpace) left = mainRect.right + safe.gap;
  }
  const top = clamp(Number.parseFloat(element.style.top), safe.top, viewportHeight - height - safe.bottom, safe.top);
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
  element.dataset.overlaySafeArea = `${safe.left},${safe.top},${safe.right},${safe.bottom}`;
  return {left, top, width, height, safe};
}

function clamp(value, min, max, fallback = min) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(Math.max(min, max), numeric));
}

function isRestorableFocusTarget(target) {
  return Boolean(target && typeof target.focus === "function" && target !== target.ownerDocument?.body);
}

function restoreFocusTarget(target) {
  if (!isRestorableFocusTarget(target) || target.isConnected === false) return;
  target.focus({preventScroll: true});
}
