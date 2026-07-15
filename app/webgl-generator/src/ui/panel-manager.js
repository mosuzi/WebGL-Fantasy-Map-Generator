import {formatHistoryCommand} from "./history-format.js";
import {getOverlayRegistry} from "./overlay-registry.js";

export class PanelManager {
  constructor(documentRef, host) {
    this.documentRef = documentRef;
    this.host = host;
    this.panels = new Map();
    this.storagePrefix = "webgl-generator-panel:";
    this.lastMainStorageKey = `${this.storagePrefix}last-main`;
    this.overlayRegistry = getOverlayRegistry(documentRef);
    this.layer = documentRef.createElement("div");
    this.layer.className = "floating-panel-layer";
    host.append(this.layer);
    this.handleResize = () => this.reflowPanels();
    documentRef.defaultView?.addEventListener("resize", this.handleResize);
  }

  registerPanel(id, options) {
    const savedState = this.readPanelState(id);
    const panel = this.documentRef.createElement("section");
    panel.className = "floating-panel hidden";
    panel.style.left = `${savedState?.left ?? options.left ?? 24}px`;
    panel.style.top = `${savedState?.top ?? options.top ?? 24}px`;
    panel.style.width = `${savedState?.width ?? options.width ?? 320}px`;
    if (options.maxWidth) panel.style.maxWidth = `min(${options.maxWidth}px, calc(100% - 16px))`;
    panel.dataset.panelId = id;
    panel.dataset.panelRole = options.role === "detail" ? "detail" : "main";

    const header = this.documentRef.createElement("header");
    header.className = "floating-panel-header";
    const title = this.documentRef.createElement("h2");
    title.textContent = options.title;
    const headerActions = this.documentRef.createElement("div");
    headerActions.className = "floating-panel-header-actions";
    const undo = this.documentRef.createElement("button");
    undo.type = "button";
    undo.className = "floating-panel-history-button floating-panel-history-undo";
    undo.setAttribute("aria-label", "撤销");
    undo.textContent = "↶";
    const redo = this.documentRef.createElement("button");
    redo.type = "button";
    redo.className = "floating-panel-history-button floating-panel-history-redo";
    redo.setAttribute("aria-label", "重做");
    redo.textContent = "↷";
    const close = this.documentRef.createElement("button");
    close.type = "button";
    close.className = "floating-panel-close";
    close.setAttribute("aria-label", "关闭面板");
    close.textContent = "x";
    headerActions.append(undo, redo, close);
    header.append(title, headerActions);

    const body = this.documentRef.createElement("div");
    body.className = "floating-panel-body";
    panel.append(header, body);
    this.layer.append(panel);

    const historyActions = normalizeHistoryActions(options.historyActions);
    const record = {
      panel,
      body,
      onClose: options.onClose || (() => {}),
      persistOpen: options.persistOpen !== false,
      role: panel.dataset.panelRole,
      overlayId: `panel:${id}`,
      historyActions,
      headerButtons: {undo, redo},
      headerRefreshTimer: 0,
      headerStateKey: "",
      refreshHeaderActions: () => refreshHeaderActions(record)
    };
    this.panels.set(id, record);
    this.overlayRegistry?.register(record.overlayId, panel, {
      kind: "panel",
      role: record.role,
      activateOnPointerDown: false,
      onRequestClose: () => this.close(id, {fromRegistry: true})
    });
    close.addEventListener("click", () => this.close(id));
    undo.addEventListener("click", () => {
      refreshHeaderActions(record);
      if (undo.disabled) return;
      record.historyActions?.onUndo?.();
      refreshHeaderActions(record);
    });
    redo.addEventListener("click", () => {
      refreshHeaderActions(record);
      if (redo.disabled) return;
      record.historyActions?.onRedo?.();
      refreshHeaderActions(record);
    });
    refreshHeaderActions(record);
    installDrag(this, panel, header);
    panel.addEventListener("pointerdown", event => {
      event.stopPropagation();
      this.activate(id);
    });
    panel.addEventListener("wheel", event => event.stopPropagation());
    return record;
  }

  setContent(id, nodes) {
    const record = this.panels.get(id);
    if (!record) return;
    const focusState = captureFocusState(record.body);
    record.body.replaceChildren(...nodes);
    restoreFocusState(record.body, focusState);
  }

  open(id) {
    const record = this.panels.get(id);
    if (!record) return;
    const returnFocus = this.documentRef.activeElement;
    if (record.role === "main") this.closeOtherMainPanels(id);
    record.panel.classList.remove("hidden");
    this.constrain(record.panel);
    this.resolvePanelCoexistence(id);
    this.overlayRegistry?.show(record.overlayId, {returnFocus});
    this.startHeaderRefresh(record);
    this.savePanelState(id);
  }

  close(id, {restoreFocus = true, fromRegistry = false} = {}) {
    const record = this.panels.get(id);
    if (!record) return;
    const wasOpen = !record.panel.classList.contains("hidden");
    record.panel.classList.add("hidden");
    this.stopHeaderRefresh(record);
    if (!fromRegistry) this.overlayRegistry?.hide(record.overlayId, {restoreFocus});
    this.savePanelState(id);
    if (wasOpen) record.onClose();
    this.reflowPanels();
  }

  activate(id) {
    const record = this.panels.get(id);
    if (!record) return;
    this.overlayRegistry?.activate(record.overlayId);
    refreshHeaderActions(record);
  }

  startHeaderRefresh(record) {
    if (!record.historyActions || record.headerRefreshTimer) return;
    refreshHeaderActions(record);
    record.headerRefreshTimer = this.documentRef.defaultView.setInterval(() => {
      if (record.panel.classList.contains("hidden")) {
        this.stopHeaderRefresh(record);
        return;
      }
      refreshHeaderActions(record);
    }, 250);
  }

  stopHeaderRefresh(record) {
    if (!record.headerRefreshTimer) return;
    this.documentRef.defaultView.clearInterval(record.headerRefreshTimer);
    record.headerRefreshTimer = 0;
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
    const previous = this.readPanelState(id);
    const open = !record.panel.classList.contains("hidden");
    const state = {
      left: Math.round(Number.parseFloat(record.panel.style.left) || 0),
      top: Math.round(Number.parseFloat(record.panel.style.top) || 0),
      width: Math.round(record.panel.offsetWidth || Number.parseFloat(record.panel.style.width) || 320),
      openedAt: open ? Date.now() : previous?.openedAt || 0
    };
    if (record.persistOpen) state.open = open;
    this.writePanelState(id, state);
    if (record.role === "main" && record.persistOpen) {
      if (open) this.writeLastMainPanelId(id);
      else if (this.readLastMainPanelId() === id) this.writeLastMainPanelId(null);
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

  getSavedOpenPanelIds() {
    const mainCandidates = [];
    const auxiliary = [];
    for (const [id, record] of this.panels) {
      if (!record.persistOpen) continue;
      const state = this.readPanelState(id);
      if (state?.open !== true) continue;
      if (record.role === "main") mainCandidates.push({id, openedAt: Number(state.openedAt) || 0});
      else auxiliary.push(id);
    }
    const chosenMain = chooseLastOpenMainPanel(mainCandidates, this.readLastMainPanelId());
    for (const candidate of mainCandidates) {
      if (candidate.id === chosenMain) continue;
      const state = this.readPanelState(candidate.id);
      if (state) this.writePanelState(candidate.id, {...state, open: false});
    }
    if (chosenMain) this.writeLastMainPanelId(chosenMain);
    else this.writeLastMainPanelId(null);
    return [...auxiliary, ...(chosenMain ? [chosenMain] : [])];
  }

  closeOtherMainPanels(exceptId) {
    for (const [id, record] of this.panels) {
      if (id === exceptId || record.role !== "main" || record.panel.classList.contains("hidden")) continue;
      this.close(id, {restoreFocus: false});
    }
  }

  resolvePanelCoexistence(openedId) {
    const opened = this.panels.get(openedId);
    if (!opened) return;
    const main = this.visiblePanelByRole("main");
    const detail = this.visiblePanelByRole("detail");
    if (!main || !detail) {
      this.reflowPanels();
      return;
    }
    if (!panelsCanCoexist(this.host.clientWidth || this.host.getBoundingClientRect().width, panelWidth(main.panel), panelWidth(detail.panel))) {
      if (opened.role === "detail") this.close(this.panelIdForRecord(main), {restoreFocus: false});
      else this.close(this.panelIdForRecord(detail), {restoreFocus: false});
      return;
    }
    this.dockPanelPair(main.panel, detail.panel);
  }

  reflowPanels() {
    const main = this.visiblePanelByRole("main");
    const detail = this.visiblePanelByRole("detail");
    if (main && detail && panelsCanCoexist(this.host.clientWidth || this.host.getBoundingClientRect().width, panelWidth(main.panel), panelWidth(detail.panel))) {
      this.dockPanelPair(main.panel, detail.panel);
      return;
    }
    if (main) this.keepPanelClearOfToolbar(main.panel);
    if (detail) {
      detail.panel.style.top = `${Math.max(64, Number.parseFloat(detail.panel.style.top) || 0)}px`;
      this.constrain(detail.panel);
    }
  }

  dockPanelPair(mainPanel, detailPanel) {
    const hostWidth = this.host.clientWidth || this.host.getBoundingClientRect().width;
    mainPanel.style.left = `${Math.max(8, hostWidth - panelWidth(mainPanel) - 8)}px`;
    mainPanel.style.top = "8px";
    detailPanel.style.left = "8px";
    detailPanel.style.top = "64px";
    this.constrain(mainPanel);
    this.constrain(detailPanel);
  }

  keepPanelClearOfToolbar(panel) {
    this.constrain(panel);
    const toolbar = this.documentRef.querySelector(".map-toolbar");
    if (!toolbar || !rectanglesOverlap(panel.getBoundingClientRect(), toolbar.getBoundingClientRect())) return;
    const hostWidth = this.host.clientWidth || this.host.getBoundingClientRect().width;
    panel.style.left = `${Math.max(8, hostWidth - panelWidth(panel) - 8)}px`;
    panel.style.top = "8px";
    this.constrain(panel);
  }

  visiblePanelByRole(role) {
    for (const record of this.panels.values()) {
      if (record.role === role && !record.panel.classList.contains("hidden")) return record;
    }
    return null;
  }

  panelIdForRecord(target) {
    for (const [id, record] of this.panels) if (record === target) return id;
    return null;
  }

  writePanelState(id, state) {
    try {
      this.host.ownerDocument.defaultView.localStorage.setItem(this.storagePrefix + id, JSON.stringify(state));
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  }

  readLastMainPanelId() {
    try {
      return this.host.ownerDocument.defaultView.localStorage.getItem(this.lastMainStorageKey) || null;
    } catch {
      return null;
    }
  }

  writeLastMainPanelId(id) {
    try {
      const storage = this.host.ownerDocument.defaultView.localStorage;
      if (id) storage.setItem(this.lastMainStorageKey, id);
      else storage.removeItem(this.lastMainStorageKey);
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  }
}

export function panelsCanCoexist(hostWidth, mainWidth, detailWidth, gap = 24) {
  return Number(hostWidth) >= Number(mainWidth) + Number(detailWidth) + Number(gap);
}

export function chooseLastOpenMainPanel(candidates, preferredId = null) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  if (preferredId && candidates.some(candidate => candidate.id === preferredId)) return preferredId;
  return [...candidates].sort((a, b) => (Number(a.openedAt) || 0) - (Number(b.openedAt) || 0)).at(-1)?.id || null;
}

function normalizeHistoryActions(actions) {
  if (!actions || typeof actions !== "object") return null;
  if (typeof actions.onUndo !== "function" && typeof actions.onRedo !== "function") return null;
  const getHistory = typeof actions.getHistory === "function" ? actions.getHistory : () => null;
  return {
    getHistory,
    onUndo: typeof actions.onUndo === "function" ? actions.onUndo : null,
    onRedo: typeof actions.onRedo === "function" ? actions.onRedo : null
  };
}

function refreshHeaderActions(record) {
  const {undo, redo} = record.headerButtons || {};
  if (!undo || !redo) return;
  const actions = record.historyActions;
  if (!actions) {
    const stateKey = "hidden";
    if (record.headerStateKey === stateKey) return;
    record.headerStateKey = stateKey;
    undo.hidden = true;
    redo.hidden = true;
    return;
  }
  const history = actions.getHistory?.() || null;
  const undoCount = Math.max(0, Number(history?.undo) || 0);
  const redoCount = Math.max(0, Number(history?.redo) || 0);
  const commandSummary = history ? formatHistoryCommand(history) : "none";
  const label = commandSummary && commandSummary !== "none" ? `：${commandSummary}` : "";
  const undoDisabled = !actions.onUndo || undoCount <= 0;
  const redoDisabled = !actions.onRedo || redoCount <= 0;
  const undoTitle = undoDisabled ? "没有可撤销操作" : `撤销${label}`;
  const redoTitle = redoDisabled ? "没有可重做操作" : `重做${label}`;
  const stateKey = `visible|${undoDisabled}|${redoDisabled}|${undoTitle}|${redoTitle}`;
  if (
    record.headerStateKey === stateKey &&
    undo.hidden === false &&
    redo.hidden === false &&
    undo.disabled === undoDisabled &&
    redo.disabled === redoDisabled &&
    undo.title === undoTitle &&
    redo.title === redoTitle
  ) {
    return;
  }
  record.headerStateKey = stateKey;
  undo.hidden = false;
  redo.hidden = false;
  undo.disabled = undoDisabled;
  redo.disabled = redoDisabled;
  undo.title = undoTitle;
  redo.title = redoTitle;
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

function panelWidth(panel) {
  return panel?.offsetWidth || panel?.getBoundingClientRect?.().width || Number.parseFloat(panel?.style?.width) || 320;
}

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function captureFocusState(root) {
  const active = root.ownerDocument.activeElement;
  if (!active || !root.contains(active)) return null;
  return {
    path: childPath(root, active),
    tagName: active.tagName,
    type: active.getAttribute("type"),
    selectionStart: Number.isInteger(active.selectionStart) ? active.selectionStart : null,
    selectionEnd: Number.isInteger(active.selectionEnd) ? active.selectionEnd : null
  };
}

function restoreFocusState(root, state) {
  if (!state) return;
  const target = nodeFromPath(root, state.path);
  if (!target || target.tagName !== state.tagName || target.getAttribute("type") !== state.type) return;
  target.focus({preventScroll: true});
  if (state.selectionStart === null || typeof target.setSelectionRange !== "function") return;
  try {
    target.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart);
  } catch {
    // Some focusable controls do not allow text selection ranges.
  }
}

function childPath(root, node) {
  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return path;
}

function nodeFromPath(root, path) {
  let current = root;
  for (const index of path) {
    current = current?.children?.[index];
    if (!current) return null;
  }
  return current;
}
