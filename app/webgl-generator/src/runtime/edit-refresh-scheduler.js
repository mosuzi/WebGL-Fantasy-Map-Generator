import {summarizeAffectedTargets} from "./edit-command-effects.js";
import {recordHeightBrushCommitStage} from "./height-brush-performance.js";

const DEFAULT_EDIT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: ["render-mesh", "selection", "panels"]
});

export const EDIT_REFRESH_PRESETS = Object.freeze({
  RIVER_WIDTH_ONLY: Object.freeze({
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived: Object.freeze(["river-mesh", "river-width-stats", "object-panels"])
  }),
  HEIGHT_SURFACE_ONLY: Object.freeze({
    render: "draw",
    selection: "none",
    runtimeStats: true,
    pickPanel: true,
    derived: Object.freeze(["height-field", "cell-colors", "height-stats"])
  }),
  HEIGHT_BRUSH_PREVIEW: Object.freeze({
    render: "draw",
    selection: "none",
    runtimeStats: false,
    pickPanel: false,
    deferTerrainRefresh: true,
    derived: Object.freeze(["height-field", "cell-colors"])
  }),
  STATE_SURFACE_ONLY: Object.freeze({
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived: Object.freeze(["state-field", "cell-colors", "political-boundaries", "political-selection"])
  }),
  STATE_BRUSH_PREVIEW: Object.freeze({
    render: "draw",
    selection: "none",
    runtimeStats: false,
    pickPanel: false,
    derived: Object.freeze(["state-field", "cell-colors"])
  })
});

export function createEditRefreshScheduler({state, documentRef, updateRuntimePanel, updatePickPanel, applyVisualTheme}) {
  return {
    run(commandOrEffects = null, {binding = null} = {}) {
      const sourceEffects = commandOrEffects?.effects || commandOrEffects;
      const effects = normalizeEditEffects(sourceEffects);
      const retainedBinding = binding || issueRetainedRefreshBinding(state, effects);
      const changedGridCells = normalizeChangedGridCells(sourceEffects?.changedGridCells);
      const terrainCaches = effects.derived.includes("terrain-caches");
      state.lastEditRefresh = summarizeEditRefresh(effects);
      invalidateRendererBuffers(state.renderer, effects);

      if (effects.derived.includes("visual-theme")) {
        applyVisualTheme?.(presentationPresetForRefresh(commandOrEffects, state.map));
      }

      if (!terrainCaches && effects.derived.includes("political-boundaries") && typeof state.renderer.refreshPoliticalVisualCaches === "function") {
        state.renderer.refreshPoliticalVisualCaches();
      }

      if (terrainCaches && typeof state.renderer.refreshTerrainCaches === "function") {
        state.renderer.refreshTerrainCaches({draw: false, refreshSurface: false, refreshLines: false});
      }

      if ((terrainCaches || effects.derived.includes("political-boundaries") || effects.derived.includes("line-layers")) && typeof state.renderer.refreshLineLayers === "function") {
        state.renderer.refreshLineLayers({draw: false, binding: retainedBinding});
      }

      if (effects.derived.includes("point-layers") && typeof state.renderer.refreshPointLayers === "function") {
        state.renderer.refreshPointLayers({draw: false, binding: retainedBinding});
      }

      if (effects.derived.includes("object-index") && typeof state.renderer.refreshObjectPickingIndex === "function") {
        state.renderer.refreshObjectPickingIndex(retainedBinding);
      }
      if (effects.derived.includes("river-picking") && typeof state.renderer.refreshRiverPickingIndex === "function") {
        state.renderer.refreshRiverPickingIndex(retainedBinding);
      }
      if (effects.derived.includes("route-picking") && typeof state.renderer.refreshRoutePickingIndex === "function") {
        state.renderer.refreshRoutePickingIndex(retainedBinding);
      }

      if (effects.derived.includes("cell-colors") && changedGridCells.length && typeof state.renderer.refreshHeightCells === "function") {
        const trace = state.heightEdit?.activeCommitTrace;
        if (trace) {
          const startedAt = globalThis.performance?.now?.() ?? Date.now();
          const result = state.renderer.refreshHeightCells(changedGridCells, {deferTopology: effects.deferTerrainRefresh, draw: false, binding: retainedBinding});
          recordHeightBrushCommitStage(trace, "refreshHeightCells", startedAt, result || {});
          if (effects.render === "draw") {
            const drawStartedAt = globalThis.performance?.now?.() ?? Date.now();
            state.renderer.draw();
            recordHeightBrushCommitStage(trace, "heightBrushDraw", drawStartedAt);
          }
        } else {
          state.renderer.refreshHeightCells(changedGridCells, {deferTopology: effects.deferTerrainRefresh, draw: effects.render === "draw", binding: retainedBinding});
        }
      } else if ((terrainCaches || effects.derived.includes("cell-colors")) && typeof state.renderer.refreshCellSurface === "function") {
        state.renderer.refreshCellSurface({draw: effects.render === "draw", binding: retainedBinding});
      } else if (effects.render === "draw") {
        state.renderer.draw();
      }

      if (effects.derived.includes("labels") && typeof state.renderer.refreshLabels === "function") {
        state.renderer.refreshLabels(retainedBinding);
      }

      if (effects.selection === "refresh") {
        state.selectionStore.refresh();
        return state.lastEditRefresh;
      }

      if (effects.runtimeStats) {
        const trace = state.heightEdit?.activeCommitTrace;
        if (trace) {
          const startedAt = globalThis.performance?.now?.() ?? Date.now();
          updateRuntimePanel(documentRef, state);
          recordHeightBrushCommitStage(trace, "runtimePanel", startedAt);
        } else {
          updateRuntimePanel(documentRef, state);
        }
      }
      if (effects.pickPanel) {
        const trace = state.heightEdit?.activeCommitTrace;
        if (trace) {
          const startedAt = globalThis.performance?.now?.() ?? Date.now();
          updatePickPanel(documentRef, state);
          recordHeightBrushCommitStage(trace, "pickPanel", startedAt);
        } else {
          updatePickPanel(documentRef, state);
        }
      }

      return state.lastEditRefresh;
    },
    async runAsync(commandOrEffects = null, {yieldToMain = defaultYieldToMain, assertCurrent = null, binding = null} = {}) {
      const sourceEffects = commandOrEffects?.effects || commandOrEffects;
      const effects = normalizeEditEffects(sourceEffects);
      const retainedBinding = binding || issueRetainedRefreshBinding(state, effects);
      const changedGridCells = normalizeChangedGridCells(sourceEffects?.changedGridCells);
      const terrainCaches = effects.derived.includes("terrain-caches");
      const atomicSurfacePublish = Boolean(
        retainedBinding
        && (effects.derived.includes("cell-colors") || terrainCaches)
        && typeof state.renderer?.beginRetainedResourcePublish === "function"
      );
      state.lastEditRefresh = summarizeEditRefresh(effects);
      invalidateRendererBuffers(state.renderer, effects);

      const checkpoint = async () => {
        await yieldToMain();
        if (typeof assertCurrent === "function") assertCurrent();
      };
      const runStep = async task => {
        task();
        await checkpoint();
      };

      const commitAtomicSurfacePublish = () => {
        if (!atomicSurfacePublish) return false;
        const pendingDraw = state.renderer.commitRetainedResourcePublish();
        if (pendingDraw) state.renderer.draw();
        return true;
      };

      if (atomicSurfacePublish) state.renderer.beginRetainedResourcePublish();
      try {
      // 先让命令补丁结束当前任务，再逐段恢复 GPU / DOM 投影，避免完整历史刷新合并成一个 LongTask。
      await checkpoint();
      if (effects.derived.includes("visual-theme")) {
        await runStep(() => applyVisualTheme?.(presentationPresetForRefresh(commandOrEffects, state.map)));
      }
      if (!terrainCaches && effects.derived.includes("political-boundaries") && typeof state.renderer.refreshPoliticalVisualCaches === "function") {
        await runStep(() => state.renderer.refreshPoliticalVisualCaches());
      }
      if (terrainCaches && typeof state.renderer.refreshTerrainCaches === "function") {
        await runStep(() => state.renderer.refreshTerrainCaches({draw: false, refreshSurface: false, refreshLines: false}));
      }
      if ((terrainCaches || effects.derived.includes("political-boundaries") || effects.derived.includes("line-layers")) && typeof state.renderer.refreshLineLayers === "function") {
        await runStep(() => state.renderer.refreshLineLayers({draw: false, binding: retainedBinding}));
      }
      if (effects.derived.includes("point-layers") && typeof state.renderer.refreshPointLayers === "function") {
        await runStep(() => state.renderer.refreshPointLayers({draw: false, binding: retainedBinding}));
      }
      if (effects.derived.includes("object-index") && typeof state.renderer.refreshObjectPickingIndex === "function") {
        await runStep(() => state.renderer.refreshObjectPickingIndex(retainedBinding));
      }
      if (effects.derived.includes("river-picking") && typeof state.renderer.refreshRiverPickingIndex === "function") {
        await runStep(() => state.renderer.refreshRiverPickingIndex(retainedBinding));
      }
      if (effects.derived.includes("route-picking") && typeof state.renderer.refreshRoutePickingIndex === "function") {
        await runStep(() => state.renderer.refreshRoutePickingIndex(retainedBinding));
      }

      if (effects.derived.includes("cell-colors") && changedGridCells.length && typeof state.renderer.refreshHeightCells === "function") {
        await runStep(() => state.renderer.refreshHeightCells(changedGridCells, {deferTopology: effects.deferTerrainRefresh, draw: effects.render === "draw", binding: retainedBinding}));
      } else if ((terrainCaches || effects.derived.includes("cell-colors")) && typeof state.renderer.refreshCellSurface === "function") {
        await runStep(() => state.renderer.refreshCellSurface({draw: effects.render === "draw", binding: retainedBinding}));
      } else if (effects.render === "draw") {
        await runStep(() => state.renderer.draw());
      }
      if (effects.derived.includes("labels") && typeof state.renderer.refreshLabels === "function") {
        await runStep(() => state.renderer.refreshLabels(retainedBinding));
      }
      if (effects.selection === "refresh") {
        await runStep(() => state.selectionStore.refresh());
        commitAtomicSurfacePublish();
        return state.lastEditRefresh;
      }
      if (effects.runtimeStats) await runStep(() => updateRuntimePanel(documentRef, state));
      if (effects.pickPanel) await runStep(() => updatePickPanel(documentRef, state));
      commitAtomicSurfacePublish();
      return state.lastEditRefresh;
      } catch (error) {
        if (atomicSurfacePublish) state.renderer.invalidateRetainedResourcePublish?.(error);
        throw error;
      }
    }
  };
}

function presentationPresetForRefresh(commandOrEffects, map) {
  return commandOrEffects?.getPresentationPreset?.()
    || map?.visualTheme?.preset
    || map?.options?.visualTheme
    || "default";
}

function issueRetainedRefreshBinding(state, effects) {
  if (!state?.map || !state.renderer?.issueRenderResourceBinding || !state.mapRevision?.getCoreSnapshot) return null;
  const refreshesSurface = effects.derived.includes("cell-colors") || effects.derived.includes("terrain-caches");
  if (!refreshesSurface && !effects.derived.some(item => item === "object-index" || item === "river-picking" || item === "route-picking" || item === "labels")) return null;
  const source = state.mapRevision.getCoreSnapshot();
  const topologyRevision = refreshesSurface
    ? source.topologyRevision
    : state.renderer.surfaceResourceOwner?.topologyRevision ?? source.topologyRevision;
  return state.renderer.issueRenderResourceBinding({...source, topologyRevision});
}

function defaultYieldToMain() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function normalizeChangedGridCells(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter(cell => Number.isInteger(cell) && cell >= 0))].sort((a, b) => a - b);
}

function invalidateRendererBuffers(renderer, effects) {
  if (typeof renderer?.invalidateDynamicBuffers !== "function") return;
  renderer.invalidateDynamicBuffers({
    routes: effects.derived.includes("route-mesh") || effects.derived.includes("render-mesh"),
    rivers: effects.derived.includes("river-mesh") || effects.derived.includes("river-width-stats") || effects.derived.includes("render-mesh"),
    selection: effects.selection === "refresh" || effects.derived.includes("selection") || effects.derived.includes("political-selection")
  });
}

export function normalizeEditEffects(effects = {}) {
  return {
    render: effects.render || DEFAULT_EDIT_EFFECTS.render,
    selection: effects.selection || DEFAULT_EDIT_EFFECTS.selection,
    runtimeStats: effects.runtimeStats ?? DEFAULT_EDIT_EFFECTS.runtimeStats,
    pickPanel: effects.pickPanel ?? DEFAULT_EDIT_EFFECTS.pickPanel,
    deferTerrainRefresh: effects.deferTerrainRefresh === true,
    derived: Array.isArray(effects.derived) && effects.derived.length ? [...effects.derived] : [...DEFAULT_EDIT_EFFECTS.derived],
    affected: Array.isArray(effects.affected) ? [...effects.affected] : []
  };
}

function summarizeEditRefresh(effects) {
  const affectedSummary = summarizeAffectedTargets(effects.affected);
  const pendingDerived = effects.derived.filter(item => item.startsWith("defer:")).map(item => item.slice("defer:".length));
  return {
    render: effects.render,
    selection: effects.selection,
    derived: effects.derived.join(", "),
    pendingDerived: pendingDerived.join(", ") || "none",
    affected: affectedSummary.text || "none",
    affectedCount: affectedSummary.count,
    affectedPreview: affectedSummary.preview,
    affectedKinds: affectedSummary.kinds
  };
}
