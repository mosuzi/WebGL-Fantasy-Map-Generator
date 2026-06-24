export class PanelManager {
  constructor(documentRef, host) {
    this.documentRef = documentRef;
    this.host = host;
    this.panels = new Map();
    this.nextZIndex = 20;
    this.storagePrefix = "webgl-generator-panel:";
    this.layer = documentRef.createElement("div");
    this.layer.className = "floating-panel-layer";
    host.append(this.layer);
  }

  registerPanel(id, options) {
    const savedState = this.readPanelState(id);
    const panel = this.documentRef.createElement("section");
    panel.className = "floating-panel hidden";
    panel.style.left = `${savedState?.left ?? options.left ?? 24}px`;
    panel.style.top = `${savedState?.top ?? options.top ?? 24}px`;
    panel.style.width = `${savedState?.width ?? options.width ?? 320}px`;
    panel.dataset.panelId = id;

    const header = this.documentRef.createElement("header");
    header.className = "floating-panel-header";
    const title = this.documentRef.createElement("h2");
    title.textContent = options.title;
    const close = this.documentRef.createElement("button");
    close.type = "button";
    close.className = "floating-panel-close";
    close.setAttribute("aria-label", "关闭面板");
    close.textContent = "x";
    header.append(title, close);

    const body = this.documentRef.createElement("div");
    body.className = "floating-panel-body";
    panel.append(header, body);
    this.layer.append(panel);

    const record = {panel, body, onClose: options.onClose || (() => {})};
    this.panels.set(id, record);
    close.addEventListener("click", () => this.close(id));
    installDrag(this, panel, header);
    panel.addEventListener("pointerdown", event => {
      event.stopPropagation();
      this.activate(id);
    });
    panel.addEventListener("wheel", event => event.stopPropagation());
    return record;
  }

  setContent(id, nodes) {
    this.panels.get(id)?.body.replaceChildren(...nodes);
  }

  open(id) {
    const record = this.panels.get(id);
    if (!record) return;
    record.panel.classList.remove("hidden");
    this.constrain(record.panel);
    this.activate(id);
  }

  close(id) {
    const record = this.panels.get(id);
    if (!record) return;
    record.panel.classList.add("hidden");
    record.onClose();
  }

  activate(id) {
    const record = this.panels.get(id);
    if (!record) return;
    record.panel.style.zIndex = String(this.nextZIndex++);
  }

  constrain(panel) {
    const hostRect = this.host.getBoundingClientRect();
    const width = panel.offsetWidth || 320;
    const height = panel.offsetHeight || 180;
    const maxLeft = Math.max(8, hostRect.width - width - 8);
    const maxTop = Math.max(8, hostRect.height - height - 8);
    const left = clamp(Number.parseFloat(panel.style.left) || 0, 8, maxLeft);
    const top = clamp(Number.parseFloat(panel.style.top) || 0, 8, maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  savePanelState(id) {
    const record = this.panels.get(id);
    if (!record) return;
    const state = {
      left: Math.round(Number.parseFloat(record.panel.style.left) || 0),
      top: Math.round(Number.parseFloat(record.panel.style.top) || 0),
      width: Math.round(record.panel.offsetWidth || Number.parseFloat(record.panel.style.width) || 320)
    };
    try {
      this.host.ownerDocument.defaultView.localStorage.setItem(this.storagePrefix + id, JSON.stringify(state));
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  }

  readPanelState(id) {
    try {
      const raw = this.host.ownerDocument.defaultView.localStorage.getItem(this.storagePrefix + id);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!Number.isFinite(state.left) || !Number.isFinite(state.top)) return null;
      return state;
    } catch {
      return null;
    }
  }
}

function installDrag(manager, panel, handle) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = Number.parseFloat(panel.style.left) || 0;
    startTop = Number.parseFloat(panel.style.top) || 0;
    manager.activate(panel.dataset.panelId);
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", event => {
    if (!dragging) return;
    event.preventDefault();
    panel.style.left = `${startLeft + event.clientX - startX}px`;
    panel.style.top = `${startTop + event.clientY - startY}px`;
    manager.constrain(panel);
  });

  handle.addEventListener("pointerup", event => {
    if (!dragging) return;
    dragging = false;
    manager.savePanelState(panel.dataset.panelId);
    handle.releasePointerCapture(event.pointerId);
  });

  handle.addEventListener("pointercancel", event => {
    if (dragging) manager.savePanelState(panel.dataset.panelId);
    dragging = false;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
