import {reactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createHeightPanel(documentRef, manager, callbacks = {}) {
  const panelState = reactive({
    active: false,
    action: "raise",
    scope: "all",
    radius: 28,
    strength: 4,
    fillTolerance: 6,
    lineWidth: 12,
    linePower: 12,
    transformLower: 20,
    transformUpper: 100,
    transformOperator: "multiply",
    transformOperand: 0.9,
    transformPreview: null,
    globalToolPreview: null,
    terrainSelectionSource: "height-band",
    terrainSelectionRadius: 48,
    terrainSelectionTolerance: 6,
    terrainSelection: null,
    terrainSelectionSaved: null,
    useTerrainSelection: false,
    falloff: true,
    lastAffected: 0,
    lastHeight: "none",
    lastDelta: "none",
    lastNotice: "",
    fillPreview: null,
    graphWidth: 1440,
    graphHeight: 960,
    currentHeightStats: null,
    currentHeightPreview: null,
    derivedStaleSystems: [],
    history: null
  });
  const panelCallbacks = {
    onActiveChange: active => callbacks.onActiveChange?.(active),
    onActionChange: action => callbacks.onActionChange?.(action),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.(),
    onGlobalToolPreview: action => callbacks.onGlobalToolPreview?.(action),
    onGlobalToolApply: () => callbacks.onGlobalToolApply?.(),
    onConditionalTransformPreview: () => callbacks.onConditionalTransformPreview?.(),
    onConditionalTransformApply: () => callbacks.onConditionalTransformApply?.(),
    onConditionalTransformChange: () => callbacks.onConditionalTransformChange?.(),
    onTerrainSelectionLock: request => callbacks.onTerrainSelectionLock?.(request),
    onTerrainSelectionClear: () => callbacks.onTerrainSelectionClear?.(),
    onTerrainSelectionSave: () => callbacks.onTerrainSelectionSave?.(),
    onTerrainSelectionRestore: () => callbacks.onTerrainSelectionRestore?.(),
    onTerrainSelectionSavedClear: () => callbacks.onTerrainSelectionSavedClear?.(),
    onTerrainSelectionTransform: operation => callbacks.onTerrainSelectionTransform?.(operation),
    onTerrainSelectionCancel: () => callbacks.onTerrainSelectionCancel?.(),
    onTerrainSelectionUseChange: value => callbacks.onTerrainSelectionUseChange?.(value),
    onRegenerateRivers: () => callbacks.onRegenerateRivers?.(),
    onRegenerateBase: () => callbacks.onRegenerateBase?.(),
    onRegenerateDownstream: () => callbacks.onRegenerateDownstream?.()
  };

  const record = manager.registerPanel("height-panel", {
    title: "高度编辑",
    left: 360,
    top: 110,
    width: 360,
    maxWidth: 420,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-height-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/HeightPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "高度编辑将在首次打开时加载。",
      loading: "正在加载高度编辑...",
      failure: "高度编辑加载失败，请检查开发模式日志。"
    }
  );
  const getConditionalTransform = () => ({
    scope: panelState.scope,
    lower: panelState.transformLower,
    upper: panelState.transformUpper,
    operator: panelState.transformOperator,
    operand: panelState.transformOperand
  });
  const getTerrainSelectionRequest = operation => ({
    operation,
    source: panelState.terrainSelectionSource,
    scope: panelState.scope,
    lower: panelState.transformLower,
    upper: panelState.transformUpper,
    radius: panelState.terrainSelectionRadius,
    tolerance: panelState.terrainSelectionTolerance
  });

  return {
    open(history) {
      panelState.history = history;
      manager.open("height-panel");
      lazyPanel.load();
    },
    update({
      lastAffected = panelState.lastAffected,
      lastHeight = panelState.lastHeight,
      lastDelta = panelState.lastDelta,
      lastNotice = panelState.lastNotice,
      fillPreview = panelState.fillPreview,
      transformPreview = panelState.transformPreview,
      globalToolPreview = panelState.globalToolPreview,
      terrainSelection = panelState.terrainSelection,
      terrainSelectionSaved = panelState.terrainSelectionSaved,
      useTerrainSelection = panelState.useTerrainSelection,
      graphWidth = panelState.graphWidth,
      graphHeight = panelState.graphHeight,
      currentHeightStats = panelState.currentHeightStats,
      currentHeightPreview = panelState.currentHeightPreview,
      derivedStaleSystems = panelState.derivedStaleSystems,
      history = panelState.history
    } = {}) {
      panelState.lastAffected = lastAffected;
      panelState.lastHeight = lastHeight;
      panelState.lastDelta = lastDelta;
      panelState.lastNotice = lastNotice;
      panelState.fillPreview = fillPreview ? {...fillPreview} : null;
      panelState.transformPreview = cloneTransformPreview(transformPreview);
      panelState.globalToolPreview = cloneTransformPreview(globalToolPreview);
      panelState.terrainSelection = cloneTerrainSelection(terrainSelection);
      panelState.terrainSelectionSaved = cloneTerrainSelection(terrainSelectionSaved);
      panelState.useTerrainSelection = Boolean(useTerrainSelection && terrainSelection?.valid);
      panelState.graphWidth = graphWidth;
      panelState.graphHeight = graphHeight;
      panelState.currentHeightStats = currentHeightStats;
      panelState.currentHeightPreview = currentHeightPreview;
      panelState.derivedStaleSystems = Array.isArray(derivedStaleSystems) ? [...derivedStaleSystems] : [];
      panelState.history = history;
    },
    getBrush() {
      return {
        active: panelState.active,
        action: panelState.action,
        scope: panelState.scope,
        radius: panelState.radius,
        strength: panelState.strength,
        fillTolerance: panelState.fillTolerance,
        lineWidth: panelState.lineWidth,
        linePower: panelState.linePower,
        falloff: panelState.falloff
      };
    },
    getConditionalTransform() {
      return getConditionalTransform();
    },
    getConditionalTransformSnapshot() {
      return {
        ...getConditionalTransform(),
        preview: cloneTransformPreview(panelState.transformPreview)
      };
    },
    getGlobalToolPreview() {
      return cloneTransformPreview(panelState.globalToolPreview);
    },
    getTerrainSelectionSnapshot() {
      return {
        source: panelState.terrainSelectionSource,
        radius: panelState.terrainSelectionRadius,
        tolerance: panelState.terrainSelectionTolerance,
        selection: cloneTerrainSelection(panelState.terrainSelection),
        savedSelection: cloneTerrainSelection(panelState.terrainSelectionSaved),
        useForTools: Boolean(panelState.useTerrainSelection && panelState.terrainSelection?.valid)
      };
    },
    getTerrainSelectionRequest(operation = "replace") {
      return getTerrainSelectionRequest(operation);
    },
    updateFillPreview(fillPreview) {
      panelState.fillPreview = fillPreview ? {...fillPreview} : null;
    },
    updateConditionalTransformPreview(transformPreview) {
      panelState.transformPreview = cloneTransformPreview(transformPreview);
    },
    updateGlobalToolPreview(globalToolPreview) {
      panelState.globalToolPreview = cloneTransformPreview(globalToolPreview);
    },
    updateTerrainSelection(terrainSelection, useForTools = panelState.useTerrainSelection) {
      panelState.terrainSelection = cloneTerrainSelection(terrainSelection);
      panelState.useTerrainSelection = Boolean(useForTools && terrainSelection?.valid);
    },
    updateTerrainSelectionSaved(terrainSelectionSaved) {
      panelState.terrainSelectionSaved = cloneTerrainSelection(terrainSelectionSaved);
    },
    setActive(active) {
      panelState.active = active;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function cloneTransformPreview(preview) {
  if (!preview) return null;
  return {
    ...preview,
    rendererPreview: preview.rendererPreview ? {...preview.rendererPreview} : null
  };
}

function cloneTerrainSelection(selection) {
  if (!selection) return null;
  return {
    ...selection,
    heightRange: Array.isArray(selection.heightRange) ? [...selection.heightRange] : null,
    bounds: selection.bounds ? {...selection.bounds} : null,
    rendererSelection: selection.rendererSelection ? {...selection.rendererSelection} : null
  };
}
