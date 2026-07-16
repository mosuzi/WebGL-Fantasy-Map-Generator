import {OBJECT_KIND} from "./object-kinds.js";

export const SELECTION_PANEL_ROUTE = Object.freeze({
  SOURCE_PANEL: "source-panel",
  UPDATE_OPEN_PANEL: "update-open-panel",
  OBJECT_DETAILS: "object-details"
});

export const SELECTION_PANEL_BINDINGS = Object.freeze({
  [OBJECT_KIND.STATE]: binding("state-panel", ["government-panel"]),
  [OBJECT_KIND.CITY]: binding("city-panel"),
  [OBJECT_KIND.PROVINCE]: binding("province-panel"),
  [OBJECT_KIND.CULTURE]: binding("culture-panel"),
  [OBJECT_KIND.RELIGION]: binding("religion-panel"),
  [OBJECT_KIND.RIVER]: binding("river-panel"),
  [OBJECT_KIND.LAKE]: binding("lake-panel"),
  [OBJECT_KIND.ZONE]: binding("zone-panel"),
  [OBJECT_KIND.ROUTE]: binding("route-panel"),
  [OBJECT_KIND.TRADE_FLOW]: binding("economy-panel"),
  [OBJECT_KIND.DIPLOMACY_RELATION]: binding("diplomacy-panel"),
  [OBJECT_KIND.MARKER]: binding("marker-panel"),
  [OBJECT_KIND.LABEL]: binding("label-naming-panel"),
  [OBJECT_KIND.NOTE]: binding("notes-panel"),
  [OBJECT_KIND.MEASUREMENT]: binding("measurement-panel"),
  [OBJECT_KIND.MILITARY]: binding("military-panel")
});

export function decideSelectionPanelRoute({binding: panelBinding, sourcePanelId = null, panelOpen = false} = {}) {
  if (!panelBinding) return SELECTION_PANEL_ROUTE.OBJECT_DETAILS;
  if (sourcePanelId && panelBinding.sourcePanelIds.includes(sourcePanelId)) return SELECTION_PANEL_ROUTE.SOURCE_PANEL;
  return panelOpen ? SELECTION_PANEL_ROUTE.UPDATE_OPEN_PANEL : SELECTION_PANEL_ROUTE.OBJECT_DETAILS;
}

function binding(panelId, additionalSourcePanelIds = []) {
  return Object.freeze({
    panelId,
    sourcePanelIds: Object.freeze([panelId, ...additionalSourcePanelIds])
  });
}
