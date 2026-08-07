import {summarizeAffectedTargets} from "./edit-command-effects.js";

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
    run(commandOrEffects = null) {
      const sourceEffects = commandOrEffects?.effects || commandOrEffects;
      const effects = normalizeEditEffects(sourceEffects);
      const changedGridCells = normalizeChangedGridCells(sourceEffects?.changedGridCells);
      state.lastEditRefresh = summarizeEditRefresh(effects);
      invalidateRendererBuffers(state.renderer, effects);

      if (effects.derived.includes("visual-theme")) {
        applyVisualTheme?.(state.map?.visualTheme?.preset || "default");
      }

      if (effects.derived.includes("political-boundaries") && typeof state.renderer.refreshPoliticalVisualCaches === "function") {
        state.renderer.refreshPoliticalVisualCaches();
      }

      if (effects.derived.includes("terrain-caches") && typeof state.renderer.refreshTerrainCaches === "function") {
        state.renderer.refreshTerrainCaches({draw: false});
      }

      if ((effects.derived.includes("political-boundaries") || effects.derived.includes("line-layers")) && typeof state.renderer.refreshLineLayers === "function") {
        state.renderer.refreshLineLayers({draw: false});
      }

      if (effects.derived.includes("point-layers") && typeof state.renderer.refreshPointLayers === "function") {
        state.renderer.refreshPointLayers({draw: false});
      }

      if (effects.derived.includes("object-index") && typeof state.renderer.refreshObjectPickingIndex === "function") {
        state.renderer.refreshObjectPickingIndex();
      }

      if (effects.derived.includes("cell-colors") && changedGridCells.length && typeof state.renderer.refreshHeightCells === "function") {
        state.renderer.refreshHeightCells(changedGridCells, {deferTopology: effects.deferTerrainRefresh});
      } else if (effects.derived.includes("cell-colors") && typeof state.renderer.refreshCellSurface === "function") {
        state.renderer.refreshCellSurface();
      } else if (effects.render === "draw") {
        state.renderer.draw();
      }

      if (effects.derived.includes("labels") && typeof state.renderer.refreshLabels === "function") {
        state.renderer.refreshLabels();
      }

      if (effects.selection === "refresh") {
        state.selectionStore.refresh();
        return state.lastEditRefresh;
      }

      if (effects.runtimeStats) {
        updateRuntimePanel(documentRef, state);
      }
      if (effects.pickPanel) {
        updatePickPanel(documentRef, state);
      }

      return state.lastEditRefresh;
    }
  };
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
