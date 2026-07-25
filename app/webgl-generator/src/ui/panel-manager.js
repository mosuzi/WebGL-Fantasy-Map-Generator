import {formatHistoryCommand} from "./history-format.js";
import {getOverlayRegistry} from "./overlay-registry.js";

const PANEL_POSITION_AUTO = "auto";
const PANEL_POSITION_MANUAL = "manual";
const PANEL_INITIAL_PLACEMENT_LEFT = "left";
const PANEL_MARGIN = 8;
const PANEL_PAIR_GAP = 24;
const PANEL_HEADER_HEIGHT = 44;
const PANEL_MIN_VISIBLE_HEADER_WIDTH = 64;
const PANEL_FIRST_OPEN_TOP = 64;

export class PanelManager {
  constructor(documentRef, host) {
    this.documentRef = documentRef;
    this.host = host;
    this.panels = new Map();
    this.openSequence = 0;
    this.returnParentContext = null;
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
    const role = options.role === "detail" ? "detail" : "main";
    const optionDefaults = {left: finiteCoordinate(options.left, 24), top: finiteCoordinate(options.top, 24)};
    const savedState = this.readPanelState(id, optionDefaults);
    const registrationPosition = resolvePanelRegistrationPosition({
      role,
      persistOpen: options.persistOpen !== false,
      savedState,
      defaults: optionDefaults
    });
    const {defaultLeft, defaultTop, initialPlacement, ...positionState} = registrationPosition;
    const panel = this.documentRef.createElement("section");
    panel.className = "floating-panel hidden";
    panel.style.left = `${positionState.left}px`;
    panel.style.top = `${positionState.top}px`;
    panel.style.width = `${savedState?.width ?? options.width ?? 320}px`;
    if (options.maxWidth) panel.style.maxWidth = `min(${options.maxWidth}px, calc(100% - 16px))`;
    panel.dataset.panelId = id;
    panel.dataset.panelRole = role;
    if (initialPlacement) panel.dataset.initialPlacement = initialPlacement;

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
    close.className = "ui-close-button floating-panel-close";
    close.setAttribute("aria-label", "关闭面板");
    close.textContent = "×";
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
      positionMode: positionState.positionMode,
      preferredLeft: positionState.left,
      preferredTop: positionState.top,
      initialPlacement,
      defaultLeft,
      defaultTop,
      openSequence: 0,
      overlayId: `panel:${id}`,
      historyActions,
      headerButtons: {undo, redo},
      headerRefreshTimer: 0,
      headerStateKey: "",
      returnParentId: null,
      refreshHeaderActions: () => refreshHeaderActions(record)
    };
    const ResizeObserverCtor = this.documentRef.defaultView?.ResizeObserver;
    if (ResizeObserverCtor) {
      let resizeFrame = 0;
      record.resizeObserver = new ResizeObserverCtor(() => {
        if (record.panel.classList.contains("hidden") || resizeFrame) return;
        resizeFrame = this.documentRef.defaultView.requestAnimationFrame(() => {
          resizeFrame = 0;
          if (!record.panel.classList.contains("hidden")) this.reflowPanels();
        });
      });
      record.resizeObserver.observe(panel);
    }
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
      restoreManagedPanelViewportOrigin(this.documentRef?.defaultView);
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

  open(id, {returnFocus = this.documentRef.activeElement, focus = true} = {}) {
    const record = this.panels.get(id);
    if (!record) return;
    const wasOpen = !record.panel.classList.contains("hidden");
    if (!wasOpen) record.returnParentId = this.resolveReturnParentId(id, record);
    if (record.role === "main") this.closeOtherMainPanels(id);
    record.openSequence = ++this.openSequence;
    record.panel.classList.remove("hidden");
    this.applyPreferredPosition(record);
    this.resolvePanelCoexistence(id);
    this.overlayRegistry?.show(record.overlayId, {returnFocus, focus});
    restoreManagedPanelViewportOrigin(this.documentRef?.defaultView);
    this.startHeaderRefresh(record);
    this.savePanelState(id);
  }

  close(id, {restoreFocus = true, fromRegistry = false, restoreParent = true} = {}) {
    const record = this.panels.get(id);
    if (!record) return;
    const wasOpen = !record.panel.classList.contains("hidden");
    const returnParentId = wasOpen && restoreParent ? record.returnParentId : null;
    record.returnParentId = null;
    record.panel.classList.add("hidden");
    this.stopHeaderRefresh(record);
    this.savePanelState(id);
    if (wasOpen) record.onClose();
    if (returnParentId) this.restoreReturnParent(returnParentId, {focus: !fromRegistry});
    if (!fromRegistry) this.overlayRegistry?.hide(record.overlayId, {restoreFocus});
    this.reflowPanels();
  }

  withReturnParent(parentId, callback) {
    const previous = this.returnParentContext;
    this.returnParentContext = parentId || null;
    try {
      return callback?.();
    } finally {
      this.returnParentContext = previous;
    }
  }

  clearReturnParents() {
    this.returnParentContext = null;
    for (const record of this.panels.values()) record.returnParentId = null;
  }

  resolveReturnParentId(openedId, openedRecord) {
    const parentId = this.returnParentContext;
    const parent = parentId ? this.panels.get(parentId) : null;
    if (!parent || parentId === openedId || openedRecord.role !== "main" || parent.role !== "main") return null;
    return parent.panel.classList.contains("hidden") ? null : parentId;
  }

  restoreReturnParent(parentId, {focus = true} = {}) {
    const parent = this.panels.get(parentId);
    if (!parent || !parent.panel.classList.contains("hidden") || this.visiblePanelByRole("main")) return false;
    this.open(parentId, {returnFocus: this.documentRef.getElementById?.("open-generation-panel") || null, focus});
    return true;
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

  constrain(panel, {
    left = Number.parseFloat(panel.style.left),
    top = Number.parseFloat(panel.style.top),
    reachableOnly = false
  } = {}) {
    const hostRect = this.host.getBoundingClientRect();
    const header = panel.querySelector?.(".floating-panel-header");
    const hostWidth = this.host.clientWidth || hostRect.width;
    const hostHeight = this.host.clientHeight || hostRect.height;
    const width = panelWidth(panel);
    const height = panel.offsetHeight || 180;
    const position = reachableOnly
      ? constrainPanelRuntimePosition({
        left,
        top,
        hostWidth,
        hostHeight,
        panelWidth: width,
        headerHeight: header?.offsetHeight || PANEL_HEADER_HEIGHT
      })
      : {
        left: clamp(finiteCoordinate(left, 0), PANEL_MARGIN, Math.max(PANEL_MARGIN, hostWidth - width - PANEL_MARGIN)),
        top: clamp(finiteCoordinate(top, 0), PANEL_MARGIN, Math.max(PANEL_MARGIN, hostHeight - height - PANEL_MARGIN))
      };
    writePanelRuntimePosition(panel, position);
    return position;
  }

  applyPreferredPosition(record) {
    return this.constrain(record.panel, {
      left: record.preferredLeft,
      top: record.preferredTop,
      reachableOnly: record.positionMode === PANEL_POSITION_MANUAL
    });
  }

  commitManualPosition(id) {
    const record = this.panels.get(id);
    if (!record) return;
    const position = this.constrain(record.panel, {reachableOnly: true});
    record.positionMode = PANEL_POSITION_MANUAL;
    record.preferredLeft = Math.round(position.left);
    record.preferredTop = Math.round(position.top);
    this.applyPreferredPosition(record);
    this.savePanelState(id);
    this.reflowPanels();
  }

  savePanelState(id) {
    const record = this.panels.get(id);
    if (!record) return;
    const previous = this.readPanelState(id, {left: record.defaultLeft, top: record.defaultTop});
    const open = !record.panel.classList.contains("hidden");
    const state = {
      positionMode: record.positionMode,
      left: Math.round(record.preferredLeft),
      top: Math.round(record.preferredTop),
      width: Math.round(record.panel.offsetWidth || Number.parseFloat(record.panel.style.width) || 320),
      openedAt: open ? Date.now() : previous?.openedAt || 0
    };
    if (record.initialPlacement) state.initialPlacement = record.initialPlacement;
    if (record.persistOpen) state.open = open;
    this.writePanelState(id, state);
    if (record.role === "main" && record.persistOpen) {
      if (open) this.writeLastMainPanelId(id);
      else if (this.readLastMainPanelId() === id) this.writeLastMainPanelId(null);
    }
  }

  readPanelState(id, defaults = null) {
    try {
      const raw = this.host.ownerDocument.defaultView.localStorage.getItem(this.storagePrefix + id);
      if (!raw) return null;
      const state = JSON.parse(raw);
      const record = this.panels.get(id);
      return normalizePanelPositionState(state, defaults || {
        left: record?.defaultLeft ?? 24,
        top: record?.defaultTop ?? 24
      });
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
      this.close(id, {restoreFocus: false, restoreParent: false});
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
      if (opened.role === "detail") this.close(this.panelIdForRecord(main), {restoreFocus: false, restoreParent: false});
      else this.close(this.panelIdForRecord(detail), {restoreFocus: false, restoreParent: false});
      return;
    }
    this.dockPanelPair(main, detail);
  }

  reflowPanels() {
    restoreManagedPanelViewportOrigin(this.documentRef?.defaultView);
    const main = this.visiblePanelByRole("main");
    const detail = this.visiblePanelByRole("detail");
    if (main && detail) {
      if (panelsCanCoexist(this.host.clientWidth || this.host.getBoundingClientRect().width, panelWidth(main.panel), panelWidth(detail.panel))) {
        this.dockPanelPair(main, detail);
        return;
      }
      const keepRole = chooseLaterOpenedPanelRole(main.openSequence, detail.openSequence);
      const closed = keepRole === "main" ? detail : main;
      this.close(this.panelIdForRecord(closed), {restoreFocus: false, restoreParent: false});
      return;
    }
    if (main) this.keepPanelClearOfToolbar(main);
    if (detail) {
      if (detail.positionMode === PANEL_POSITION_MANUAL) this.applyPreferredPosition(detail);
      else this.constrain(detail.panel, {top: Math.max(64, Number.parseFloat(detail.panel.style.top) || 0)});
    }
  }

  dockPanelPair(main, detail) {
    const hostWidth = this.host.clientWidth || this.host.getBoundingClientRect().width;
    const mainManual = main.positionMode === PANEL_POSITION_MANUAL;
    const detailManual = detail.positionMode === PANEL_POSITION_MANUAL;
    if (!mainManual && !detailManual) {
      this.constrain(main.panel, {left: hostWidth - panelWidth(main.panel) - PANEL_MARGIN, top: PANEL_MARGIN});
      this.constrain(detail.panel, {left: PANEL_MARGIN, top: 64});
      return;
    }

    if (mainManual) this.applyPreferredPosition(main);
    if (detailManual) this.applyPreferredPosition(detail);
    if (mainManual && detailManual && !rectanglesOverlap(main.panel.getBoundingClientRect(), detail.panel.getBoundingClientRect())) return;

    const protectedRecord = mainManual ? main : detail;
    const movingRecord = mainManual ? detail : main;
    const protectedLeft = Number.parseFloat(protectedRecord.panel.style.left) || 0;
    const left = chooseRemainingPanelLeft({
      hostWidth,
      protectedLeft,
      protectedWidth: panelWidth(protectedRecord.panel),
      movingWidth: panelWidth(movingRecord.panel),
      prefer: movingRecord.role === "detail" ? "left" : "right"
    });
    const top = movingRecord.role === "detail"
      ? (detailManual ? detail.preferredTop : 64)
      : (mainManual ? main.preferredTop : PANEL_MARGIN);
    this.constrain(movingRecord.panel, {left, top, reachableOnly: movingRecord.positionMode === PANEL_POSITION_MANUAL});
  }

  keepPanelClearOfToolbar(record) {
    if (record.positionMode === PANEL_POSITION_MANUAL) {
      this.applyPreferredPosition(record);
      return;
    }
    if (record.initialPlacement === PANEL_INITIAL_PLACEMENT_LEFT) {
      this.constrain(record.panel, {
        left: record.preferredLeft,
        top: record.preferredTop,
        reachableOnly: true
      });
      return;
    }
    const {panel} = record;
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

export function restoreManagedPanelViewportOrigin(windowRef) {
  if (!windowRef || typeof windowRef.scrollTo !== "function") return false;
  const scrollX = Number(windowRef.scrollX) || 0;
  const scrollY = Number(windowRef.scrollY) || 0;
  if (scrollX === 0 && scrollY === 0) return false;
  windowRef.scrollTo(0, 0);
  return true;
}

export function chooseLaterOpenedPanelRole(mainSequence, detailSequence) {
  const main = Number.isFinite(mainSequence) ? mainSequence : 0;
  const detail = Number.isFinite(detailSequence) ? detailSequence : 0;
  return main > detail ? "main" : "detail";
}

export function normalizePanelPositionState(state, defaults = {}) {
  const defaultLeft = finiteCoordinate(defaults.left, 24);
  const defaultTop = finiteCoordinate(defaults.top, 24);
  const source = state && typeof state === "object" ? state : {};
  const hasCoordinates = Number.isFinite(source.left) && Number.isFinite(source.top);
  const legacyManual = !Object.hasOwn(source, "positionMode") && hasCoordinates;
  const manual = hasCoordinates && (source.positionMode === PANEL_POSITION_MANUAL || legacyManual);
  return {
    ...source,
    positionMode: manual ? PANEL_POSITION_MANUAL : PANEL_POSITION_AUTO,
    left: manual ? source.left : defaultLeft,
    top: manual ? source.top : defaultTop
  };
}

export function resolvePanelRegistrationPosition({role = "main", persistOpen = true, savedState = null, defaults = {}} = {}) {
  const hasSavedState = Boolean(savedState && typeof savedState === "object");
  const initialPlacement = role === "main" && persistOpen && (!hasSavedState || savedState.initialPlacement === PANEL_INITIAL_PLACEMENT_LEFT)
    ? PANEL_INITIAL_PLACEMENT_LEFT
    : null;
  const resolvedDefaults = initialPlacement === PANEL_INITIAL_PLACEMENT_LEFT
    ? {left: PANEL_MARGIN, top: PANEL_FIRST_OPEN_TOP}
    : {left: finiteCoordinate(defaults.left, 24), top: finiteCoordinate(defaults.top, 24)};
  return {
    ...normalizePanelPositionState(savedState, resolvedDefaults),
    defaultLeft: resolvedDefaults.left,
    defaultTop: resolvedDefaults.top,
    initialPlacement
  };
}

export function constrainPanelRuntimePosition({
  left,
  top,
  hostWidth,
  hostHeight,
  panelWidth: width,
  headerHeight = PANEL_HEADER_HEIGHT,
  margin = PANEL_MARGIN,
  minVisibleHeaderWidth = PANEL_MIN_VISIBLE_HEADER_WIDTH
}) {
  const safeWidth = Math.max(1, finiteCoordinate(width, 320));
  const safeHeaderHeight = Math.max(1, finiteCoordinate(headerHeight, PANEL_HEADER_HEIGHT));
  const safeHostWidth = Math.max(1, finiteCoordinate(hostWidth, safeWidth + margin * 2));
  const safeHostHeight = Math.max(1, finiteCoordinate(hostHeight, safeHeaderHeight + margin * 2));
  const minLeft = Math.min(margin, minVisibleHeaderWidth - safeWidth);
  const maxLeft = Math.max(minLeft, safeHostWidth - safeWidth - margin);
  const maxTop = Math.max(margin, safeHostHeight - safeHeaderHeight - margin);
  return {
    left: clamp(finiteCoordinate(left, margin), minLeft, maxLeft),
    top: clamp(finiteCoordinate(top, margin), margin, maxTop)
  };
}

export function chooseRemainingPanelLeft({
  hostWidth,
  protectedLeft,
  protectedWidth,
  movingWidth,
  margin = PANEL_MARGIN,
  gap = PANEL_PAIR_GAP,
  prefer = "left"
}) {
  const leftCandidate = margin;
  const rightCandidate = Math.max(margin, hostWidth - movingWidth - margin);
  const fitsLeft = leftCandidate + movingWidth + gap <= protectedLeft;
  const fitsRight = rightCandidate >= protectedLeft + protectedWidth + gap;
  if (fitsLeft && fitsRight) return prefer === "right" ? rightCandidate : leftCandidate;
  if (fitsLeft) return leftCandidate;
  if (fitsRight) return rightCandidate;
  const leftSpace = protectedLeft - gap - margin;
  const rightSpace = hostWidth - margin - (protectedLeft + protectedWidth + gap);
  return rightSpace > leftSpace ? rightCandidate : leftCandidate;
}

export function panelDragHasMoved(startLeft, startTop, endLeft, endTop, threshold = 0.5) {
  return Math.hypot(endLeft - startLeft, endTop - startTop) > threshold;
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
    manager.constrain(panel, {reachableOnly: true});
  });

  handle.addEventListener("pointerup", event => {
    if (!dragging) return;
    dragging = false;
    const endLeft = Number.parseFloat(panel.style.left) || 0;
    const endTop = Number.parseFloat(panel.style.top) || 0;
    if (panelDragHasMoved(startLeft, startTop, endLeft, endTop)) manager.commitManualPosition(panel.dataset.panelId);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  });

  handle.addEventListener("pointercancel", event => {
    if (dragging) manager.constrain(panel, {left: startLeft, top: startTop, reachableOnly: true});
    dragging = false;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    manager.reflowPanels();
  });
}

function writePanelRuntimePosition(panel, position) {
  const left = `${position.left}px`;
  const top = `${position.top}px`;
  if (panel.style.left !== left) panel.style.left = left;
  if (panel.style.top !== top) panel.style.top = top;
}

function finiteCoordinate(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
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
