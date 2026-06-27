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
    derived: Object.freeze(["height-field", "cell-colors"])
  }),
  STATE_SURFACE_ONLY: Object.freeze({
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived: Object.freeze(["state-field", "cell-colors", "political-selection"])
  }),
  STATE_BRUSH_PREVIEW: Object.freeze({
    render: "draw",
    selection: "none",
    runtimeStats: false,
    pickPanel: false,
    derived: Object.freeze(["state-field", "cell-colors"])
  })
});

export function createEditRefreshScheduler({state, documentRef, updateRuntimePanel, updatePickPanel}) {
  return {
    run(commandOrEffects = null) {
      const effects = normalizeEditEffects(commandOrEffects?.effects || commandOrEffects);
      state.lastEditRefresh = summarizeEditRefresh(effects);

      if (effects.derived.includes("cell-colors") && typeof state.renderer.refreshCellSurface === "function") {
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

export function normalizeEditEffects(effects = {}) {
  return {
    render: effects.render || DEFAULT_EDIT_EFFECTS.render,
    selection: effects.selection || DEFAULT_EDIT_EFFECTS.selection,
    runtimeStats: effects.runtimeStats ?? DEFAULT_EDIT_EFFECTS.runtimeStats,
    pickPanel: effects.pickPanel ?? DEFAULT_EDIT_EFFECTS.pickPanel,
    derived: Array.isArray(effects.derived) && effects.derived.length ? [...effects.derived] : [...DEFAULT_EDIT_EFFECTS.derived],
    affected: Array.isArray(effects.affected) ? [...effects.affected] : []
  };
}

function summarizeEditRefresh(effects) {
  const affected = effects.affected.map(item => `${item.kind}#${item.id}`).join(", ") || "none";
  return {
    render: effects.render,
    selection: effects.selection,
    derived: effects.derived.join(", "),
    affected
  };
}
