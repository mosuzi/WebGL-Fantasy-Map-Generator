export const SHORTCUT_HINT_DELAY_MS = 850;
export const SHORTCUT_HINT_DURATION_MS = 2400;

const binding = (code, modifiers = {}) => Object.freeze({code, ...modifiers});
const shortcut = definition => Object.freeze({...definition, bindings: Object.freeze(definition.bindings)});

export const KEYBOARD_SHORTCUTS = Object.freeze([
  shortcut({id: "file.save-browser", group: "file", label: "保存到浏览器", scope: "global", when: "map-idle", selector: "#save-browser-storage", bindings: [binding("KeyS", {mod: true})], action: {type: "api", path: "data.saveBrowserMap", args: [{}], feedback: "已保存到浏览器"}}),
  shortcut({id: "file.export-png", group: "file", label: "导出 PNG", scope: "global", when: "map-idle", selector: "#export-map-image", bindings: [binding("KeyE", {mod: true, shift: true})], action: {type: "api", path: "data.exportPNG", args: [{download: true}], feedback: "PNG 导出成功"}}),
  shortcut({id: "history.undo", group: "history", label: "撤销", scope: "global", when: "undo", selector: ".floating-panel-history-undo", bindings: [binding("KeyZ", {mod: true})], action: {type: "api", path: "history.undo"}}),
  shortcut({id: "history.redo", group: "history", label: "重做", scope: "global", when: "redo", selector: ".floating-panel-history-redo", bindings: [binding("KeyZ", {mod: true, shift: true}), binding("KeyY", {mod: true})], action: {type: "api", path: "history.redo"}}),
  shortcut({id: "selection.cancel", group: "editing", label: "逐级退出当前操作", scope: "global", when: "selection-or-editing", bindings: [binding("Escape")], action: {type: "escape-level"}}),
  shortcut({id: "selection.fit-view", group: "selection", label: "适配地图视图", scope: "global", when: "map-idle", selector: "#fit-view", bindings: [binding("Home", {shift: true})], action: {type: "api", path: "layers.fitView"}}),
  shortcut({id: "view.height", group: "view", label: "高度视图", scope: "global", when: "map-idle", selector: ".view-mode-segmented .el-segmented__item:nth-child(1)", bindings: [binding("Digit1", {shift: true})], action: {type: "api", path: "layers.setViewMode", args: ["height"]}}),
  shortcut({id: "view.biomes", group: "view", label: "生物群系视图", scope: "global", when: "map-idle", selector: ".view-mode-segmented .el-segmented__item:nth-child(4)", bindings: [binding("Digit2", {shift: true})], action: {type: "api", path: "layers.setViewMode", args: ["biomes"]}}),
  shortcut({id: "view.diplomacy", group: "view", label: "外交视图", scope: "global", when: "map-idle", selector: ".view-mode-segmented .el-segmented__item:nth-child(7)", bindings: [binding("Digit3", {shift: true})], action: {type: "api", path: "layers.setViewMode", args: ["diplomacy"]}}),
  shortcut({id: "view.states", group: "view", label: "国家视图", scope: "global", when: "map-idle", selector: ".view-mode-segmented .el-segmented__item:nth-child(9)", bindings: [binding("Digit4", {shift: true})], action: {type: "api", path: "layers.setViewMode", args: ["states"]}}),
  shortcut({id: "layer.routes", group: "layers", label: "切换道路图层", scope: "global", when: "map-idle", selector: "[data-layer=\"routes\"]", bindings: [binding("Digit5", {shift: true})], action: {type: "toggle-layer", layer: "routes"}}),
  shortcut({id: "layer.rivers", group: "layers", label: "切换河流图层", scope: "global", when: "map-idle", selector: "[data-layer=\"rivers\"]", bindings: [binding("Digit6", {shift: true})], action: {type: "toggle-layer", layer: "rivers"}}),
  shortcut({id: "layer.cities", group: "layers", label: "切换城市图层", scope: "global", when: "map-idle", selector: "[data-layer=\"cities\"]", bindings: [binding("Digit7", {shift: true})], action: {type: "toggle-layer", layer: "cities"}}),
  shortcut({id: "panel.generation", group: "generation", label: "打开控制面板", scope: "global", selector: "#open-generation-panel", bindings: [binding("KeyG", {shift: true})], action: {type: "panel", handler: "onOpenGenerationPanel"}}),
  shortcut({id: "panel.height", group: "panels", label: "打开高度编辑", scope: "global", when: "map-idle", selector: "#open-height-panel", bindings: [binding("KeyH", {shift: true})], action: {type: "panel", handler: "onOpenHeightPanel"}}),
  shortcut({id: "panel.states", group: "panels", label: "打开国家编辑", scope: "global", when: "map-idle", selector: "#open-state-panel", bindings: [binding("KeyS", {shift: true})], action: {type: "panel", handler: "onOpenStatePanel"}}),
  shortcut({id: "panel.cities", group: "panels", label: "打开城市管理", scope: "global", when: "map-idle", selector: "#open-city-panel", bindings: [binding("KeyC", {shift: true})], action: {type: "panel", handler: "onOpenCityPanel"}}),
  shortcut({id: "panel.diplomacy", group: "panels", label: "打开外交管理", scope: "global", when: "map-idle", selector: "#open-diplomacy-panel", bindings: [binding("KeyD", {shift: true})], action: {type: "panel", handler: "onOpenDiplomacyPanel"}}),
  shortcut({id: "panel.military", group: "panels", label: "打开军事管理", scope: "global", when: "map-idle", selector: "#open-military-panel", bindings: [binding("KeyM", {shift: true})], action: {type: "panel", handler: "onOpenMilitaryPanel"}}),
  shortcut({id: "panel.rivers", group: "panels", label: "打开河流管理", scope: "global", when: "map-idle", selector: "#open-river-panel", bindings: [binding("KeyR", {shift: true})], action: {type: "panel", handler: "onOpenRiverPanel"}}),
  shortcut({id: "panel.labels", group: "panels", label: "打开标签管理", scope: "global", when: "map-idle", selector: "#open-label-naming-panel", bindings: [binding("KeyL", {shift: true})], action: {type: "panel", handler: "onOpenLabelNamingPanel"}}),
  shortcut({id: "panel.measurements", group: "panels", label: "打开测量对象", scope: "global", when: "map-idle", selector: "#open-measurement-panel", bindings: [binding("KeyQ", {shift: true})], action: {type: "panel", handler: "onOpenMeasurementPanel"}})
]);

export function shortcutPlatform(navigatorRef = globalThis.navigator) {
  const platform = String(navigatorRef?.userAgentData?.platform || navigatorRef?.platform || "");
  return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "default";
}

export function shortcutBindingSignature(item, platform = "default") {
  const modifiers = resolvedModifiers(item, platform);
  return [modifiers.ctrl ? "ctrl" : "", modifiers.meta ? "meta" : "", modifiers.alt ? "alt" : "", modifiers.shift ? "shift" : "", item.code].filter(Boolean).join("+");
}

export function shortcutBindingLabel(item, platform = "default") {
  const modifiers = resolvedModifiers(item, platform);
  const key = keyLabel(item.code);
  if (platform === "mac") return `${modifiers.ctrl ? "⌃" : ""}${modifiers.alt ? "⌥" : ""}${modifiers.shift ? "⇧" : ""}${modifiers.meta ? "⌘" : ""}${key}`;
  return [modifiers.ctrl ? "Ctrl" : "", modifiers.alt ? "Alt" : "", modifiers.shift ? "Shift" : "", modifiers.meta ? "Meta" : "", key].filter(Boolean).join("+");
}

export function shortcutAriaLabel(item, platform = "default") {
  const modifiers = resolvedModifiers(item, platform);
  return [modifiers.ctrl ? "Control" : "", modifiers.alt ? "Alt" : "", modifiers.shift ? "Shift" : "", modifiers.meta ? "Meta" : "", keyLabel(item.code)].filter(Boolean).join("+");
}

export function validateShortcutRegistry(registry = KEYBOARD_SHORTCUTS, platforms = ["default", "mac"]) {
  const ids = new Set();
  const conflicts = [];
  for (const item of registry) {
    if (!item?.id || ids.has(item.id)) throw new Error(`快捷键 id 重复或为空：${item?.id || "未知"}`);
    ids.add(item.id);
    if (!item.label || !item.group || !item.scope || !item.action || !item.bindings?.length) throw new Error(`快捷键 ${item.id} 定义不完整`);
  }
  for (const platform of platforms) {
    const signatures = new Map();
    for (const item of registry) {
      for (const itemBinding of item.bindings) {
        const key = `${item.scope}|${shortcutBindingSignature(itemBinding, platform)}`;
        const previous = signatures.get(key);
        if (previous && previous !== item.id) conflicts.push({platform, signature: key, ids: [previous, item.id]});
        else signatures.set(key, item.id);
      }
    }
  }
  if (conflicts.length) throw new Error(`快捷键冲突：${conflicts.map(item => `${item.platform}:${item.signature}=${item.ids.join("/")}`).join(", ")}`);
  return {shortcuts: registry.length, bindings: registry.reduce((total, item) => total + item.bindings.length, 0), conflicts};
}

export function resolveShortcut(event, registry = KEYBOARD_SHORTCUTS, options = {}) {
  const platform = options.platform || "default";
  const scopes = new Set(options.scopes || ["global"]);
  const matches = [];
  for (let index = 0; index < registry.length; index += 1) {
    const item = registry[index];
    if (!scopes.has(item.scope)) continue;
    if (!item.bindings.some(itemBinding => shortcutEventMatches(event, itemBinding, platform))) continue;
    matches.push({item, index, priority: Number(item.priority) || 0});
  }
  matches.sort((left, right) => right.priority - left.priority || left.index - right.index);
  return matches[0]?.item || null;
}

export function isEditableShortcutTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName || "").toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return true;
  if (target.isContentEditable) return true;
  return typeof target.closest === "function" && Boolean(target.closest("[contenteditable]:not([contenteditable=\"false\"]), [data-shortcut-input=\"true\"]"));
}

const FRAMEWORK_POPUP_SELECTOR = [
  ".el-select__popper",
  ".el-dropdown__popper",
  ".el-picker__popper",
  ".el-cascader__dropdown",
  ".el-autocomplete-suggestion"
].join(", ");

export function hasOpenFrameworkPopup(documentRef) {
  if (typeof documentRef?.querySelectorAll !== "function") return false;
  return [...documentRef.querySelectorAll(FRAMEWORK_POPUP_SELECTOR)].some(element => {
    if (element.hidden || element.getAttribute?.("aria-hidden") === "true" || element.style?.display === "none") return false;
    const style = documentRef.defaultView?.getComputedStyle?.(element);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    if (typeof element.getClientRects === "function") return element.getClientRects().length > 0;
    return element.isConnected !== false;
  });
}

export function installKeyboardShortcuts(documentRef, options = {}) {
  const registry = options.registry || KEYBOARD_SHORTCUTS;
  const platform = options.platform || shortcutPlatform(documentRef.defaultView?.navigator);
  validateShortcutRegistry(registry, [platform]);
  const view = documentRef.defaultView || window;
  const hint = documentRef.getElementById("shortcut-toast");
  let hintDelayTimer = null;
  let hintHideTimer = null;
  let hoveredElement = null;
  let hoveredItem = null;
  let refreshQueued = false;

  const hideHint = () => {
    if (hintDelayTimer) view.clearTimeout(hintDelayTimer);
    if (hintHideTimer) view.clearTimeout(hintHideTimer);
    hintDelayTimer = null;
    hintHideTimer = null;
    hoveredElement = null;
    hoveredItem = null;
    if (!hint) return;
    hint.hidden = true;
    hint.textContent = "";
    delete hint.dataset.shortcutId;
  };

  const showHint = item => {
    const mapToast = documentRef.getElementById("map-toast");
    if (!hint || (mapToast && !mapToast.hidden)) return;
    hint.textContent = `${item.label} · ${item.bindings.map(itemBinding => shortcutBindingLabel(itemBinding, platform)).join(" / ")}`;
    hint.dataset.shortcutId = item.id;
    hint.hidden = false;
    if (hintHideTimer) view.clearTimeout(hintHideTimer);
    hintHideTimer = view.setTimeout(hideHint, Number(options.hintDurationMs) || SHORTCUT_HINT_DURATION_MS);
  };

  const scheduleHint = (item, element) => {
    hideHint();
    if (!item || !element || isDisabledShortcutElement(element) || options.canExecute?.(item) === false) return;
    hoveredElement = element;
    hoveredItem = item;
    hintDelayTimer = view.setTimeout(() => {
      hintDelayTimer = null;
      if (hoveredElement === element && element.isConnected !== false && !isDisabledShortcutElement(element) && options.canExecute?.(item) !== false) showHint(item);
    }, Number(options.hintDelayMs) || SHORTCUT_HINT_DELAY_MS);
  };

  const refreshBindings = () => {
    refreshQueued = false;
    for (const item of registry) {
      if (!item.selector) continue;
      for (const element of documentRef.querySelectorAll(item.selector)) {
        element.dataset.shortcutId = item.id;
        element.setAttribute("aria-keyshortcuts", item.bindings.map(itemBinding => shortcutAriaLabel(itemBinding, platform)).join(" "));
      }
    }
    if (hoveredElement && (hoveredElement.isConnected === false || isDisabledShortcutElement(hoveredElement))) hideHint();
  };

  const scheduleRefreshBindings = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    if (typeof view.queueMicrotask === "function") view.queueMicrotask(refreshBindings);
    else Promise.resolve().then(refreshBindings);
  };

  const onKeydown = event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || hasOpenFrameworkPopup(documentRef) || hasExclusiveKeyboardModal(documentRef)) return;
    const item = resolveShortcut(event, registry, {platform, scopes: options.getActiveScopes?.(event) || ["global"]});
    if (!item || (item.id !== "selection.cancel" && isEditableShortcutTarget(event.target))) return;
    event.preventDefault();
    event.stopPropagation();
    hideHint();
    if (options.canExecute?.(item) === false) {
      options.onDisabled?.(item);
      return;
    }
    Promise.resolve(options.execute?.(item)).catch(error => options.onError?.(error, item));
  };

  const onPointerOver = event => {
    const match = shortcutForElement(event.target, registry);
    if (!match || match.element.contains?.(event.relatedTarget)) return;
    scheduleHint(match.item, match.element);
  };
  const onPointerOut = event => {
    if (!hoveredElement || hoveredElement.contains?.(event.relatedTarget)) return;
    hideHint();
  };
  const onClick = () => hideHint();
  const onMapToastChange = event => {
    if (event.detail?.visible) hideHint();
  };

  documentRef.addEventListener("keydown", onKeydown, true);
  documentRef.addEventListener("pointerover", onPointerOver, true);
  documentRef.addEventListener("pointerout", onPointerOut, true);
  documentRef.addEventListener("click", onClick, true);
  documentRef.addEventListener("webgl-generator-map-toast-change", onMapToastChange);
  const observer = typeof view.MutationObserver === "function"
    ? new view.MutationObserver(scheduleRefreshBindings)
    : null;
  observer?.observe(documentRef.body, {subtree: true, childList: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "hidden"]});
  refreshBindings();

  return {
    registry,
    platform,
    hideHint,
    refreshBindings,
    refreshAvailability() {
      if (hoveredItem && options.canExecute?.(hoveredItem) === false) hideHint();
    },
    destroy() {
      hideHint();
      observer?.disconnect();
      documentRef.removeEventListener("keydown", onKeydown, true);
      documentRef.removeEventListener("pointerover", onPointerOver, true);
      documentRef.removeEventListener("pointerout", onPointerOut, true);
      documentRef.removeEventListener("click", onClick, true);
      documentRef.removeEventListener("webgl-generator-map-toast-change", onMapToastChange);
    }
  };
}

function shortcutEventMatches(event, item, platform) {
  if (event.code !== item.code) return false;
  const expected = resolvedModifiers(item, platform);
  return Boolean(event.ctrlKey) === expected.ctrl
    && Boolean(event.metaKey) === expected.meta
    && Boolean(event.altKey) === expected.alt
    && Boolean(event.shiftKey) === expected.shift;
}

function resolvedModifiers(item, platform) {
  return {
    ctrl: Boolean(item.ctrl || (item.mod && platform !== "mac")),
    meta: Boolean(item.meta || (item.mod && platform === "mac")),
    alt: Boolean(item.alt),
    shift: Boolean(item.shift)
  };
}

function keyLabel(code) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Escape") return "Esc";
  if (code === "Home") return "Home";
  return code;
}

function shortcutForElement(target, registry) {
  if (!target || typeof target.closest !== "function") return null;
  const tagged = target.closest("[data-shortcut-id]");
  if (tagged) {
    const item = registry.find(candidate => candidate.id === tagged.dataset.shortcutId);
    if (item) return {item, element: tagged};
  }
  for (const item of registry) {
    if (!item.selector) continue;
    const element = target.closest(item.selector);
    if (element) return {item, element};
  }
  return null;
}

function isDisabledShortcutElement(element) {
  return Boolean(element?.disabled || element?.getAttribute?.("aria-disabled") === "true" || element?.hidden);
}

function hasExclusiveKeyboardModal(documentRef) {
  const view = documentRef.defaultView || window;
  const candidates = documentRef.querySelectorAll('[aria-modal="true"], [data-keyboard-exclusive="true"][data-overlay-open="true"]');
  return [...candidates].some(element => {
    if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const style = typeof view.getComputedStyle === "function" ? view.getComputedStyle(element) : null;
    return style?.display !== "none" && style?.visibility !== "hidden";
  });
}
