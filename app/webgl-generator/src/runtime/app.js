import {generatePlaceholderMap} from "../generator/index.js";
import {DEFAULT_OPTIONS} from "../generator/options.js";
import {createRandomSeed} from "../generator/random.js";
import {PlaceholderMapRenderer} from "../renderer/placeholder-renderer.js";
import {PanelManager} from "../ui/panel-manager.js";
import {bindRuntimePanel, readOptionsFromPanel, setActiveModeButton, setEditingInteractionLock, setSeedInput, updatePickPanel, updateRuntimePanel} from "../ui/panel.js";
import {createHeightPanel} from "../ui/panels/height-panel.js";
import {createObjectDetailsPanel} from "../ui/panels/object-details-panel.js";
import {createRiverPanel} from "../ui/panels/river-panel.js";
import {createStatePanel} from "../ui/panels/state-panel.js";
import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {createEditRefreshScheduler} from "./edit-refresh-scheduler.js";
import {EditHistory} from "./edit-history.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "./height-edit-commands.js";
import {createRenameObjectCommand, createSetStateCapitalCommand} from "./object-edit-commands.js";
import {resolveObject} from "./object-resolver.js";
import {createSetRiverWidthFactorCommand} from "./river-edit-commands.js";
import {SelectionStore} from "./selection-store.js";
import {applyStateBrushPreview, createApplyStateBrushCommand, createSetStateColorCommand, STATE_BRUSH_PREVIEW_EFFECTS} from "./state-edit-commands.js";

export function createGeneratorApp(documentRef) {
  const canvas = documentRef.getElementById("map-canvas");
  const panelManager = new PanelManager(documentRef, documentRef.querySelector(".map-stage"));
  const state = {
    options: {...DEFAULT_OPTIONS},
    map: null,
    pick: null,
    selection: null,
    editingObject: null,
    editHistory: new EditHistory(),
    editRefreshScheduler: null,
    heightEdit: {
      activeStroke: null,
      lastAffected: 0,
      lastHeight: "none"
    },
    stateEdit: {
      activeStroke: null,
      lastAffected: 0,
      sourceStateId: null,
      lastPointer: null
    },
    lastEditRefresh: null,
    selectionStore: null,
    renderer: null,
    panels: {}
  };
  let selectionStore = null;
  let heightPanel = null;
  let statePanel = null;
  let riverPanel = null;
  const objectDetailsPanel = createObjectDetailsPanel(documentRef, panelManager, {
    onEdit: object => {
      selectionStore.startEditing(object);
    },
    onCancelEdit: () => {
      selectionStore.stopEditing();
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onOpenRiverPanel: () => {
      riverPanel.open(state.map, state.selection, state.editHistory.getStats());
    },
    onRename: (object, name) => {
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats());
      updateEditingInteractionLock(state, documentRef);
    }
  });
  state.panels.objectDetails = objectDetailsPanel;
  heightPanel = createHeightPanel(documentRef, panelManager, {
    onActiveChange: active => {
      if (active) {
        statePanel?.setActive(false);
        state.stateEdit.activeStroke = null;
        renderer.setColorMode("height");
        setActiveModeButton(documentRef, "height");
        updateEditingInteractionLock(state, documentRef);
        updateRuntimePanel(documentRef, state);
      } else {
        state.heightEdit.activeStroke = null;
        updateEditingInteractionLock(state, documentRef);
      }
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateHeightPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateHeightPanel(state);
    }
  });
  state.panels.height = heightPanel;
  statePanel = createStatePanel(documentRef, panelManager, {
    onActiveChange: active => {
      if (active) {
        heightPanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        renderer.setColorMode("states");
        setActiveModeButton(documentRef, "states");
        updateEditingInteractionLock(state, documentRef);
        updateRuntimePanel(documentRef, state);
      } else {
        state.stateEdit.activeStroke = null;
        updateEditingInteractionLock(state, documentRef);
      }
    },
    onSampleSelection: () => {
      setStatePanelTarget(state, getStateIdFromSelection(state));
    },
    onSampleHover: () => {
      setStatePanelTarget(state, getStateIdFromPick(state));
    },
    onColorChange: (stateId, color) => {
      const beforeColor = state.map?.politics?.states?.[stateId]?.color || null;
      const command = createSetStateColorCommand(stateId, color, {beforeColor});
      if (!command.isNoop({map: state.map})) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateStatePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onCapitalChange: (stateId, burgId) => {
      const context = {map: state.map};
      const command = createSetStateCapitalCommand(stateId, burgId);
      if (!command.isNoop(context)) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterStateEdit(state, command);
      updateStatePanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterStateEdit(state, command);
      updateStatePanel(state);
    }
  });
  state.panels.state = statePanel;
  riverPanel = createRiverPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      selectionStore.startEditing(object);
    },
    onSetWidthFactor: (riverId, widthFactor) => {
      const context = {map: state.map};
      const command = createSetRiverWidthFactorCommand(riverId, widthFactor);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
    }
  });
  state.panels.river = riverPanel;
  const renderer = new PlaceholderMapRenderer(canvas, () => {
    if (state.map) updateRuntimePanel(documentRef, state);
  }, pick => {
    state.pick = pick;
    updatePickPanel(documentRef, state);
    updateStatePanel(state);
    updateEditingInteractionLock(state, documentRef);
  }, selection => {
    selectionStore.setSelection(selection);
  });
  state.renderer = renderer;
  selectionStore = new SelectionStore(({selection, editingObject}) => {
    state.selection = selection;
    state.editingObject = editingObject;
    renderer.setSelection(selection?.object || null);
    state.panels.objectDetails.show(selection, editingObject);
    state.panels.river.update(state.map, selection, state.editHistory.getStats());
    updateStatePanel(state);
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    updatePickPanel(documentRef, state);
  }, object => resolveObject(state.map, object));
  state.selectionStore = selectionStore;
  state.editRefreshScheduler = createEditRefreshScheduler({state, documentRef, updateRuntimePanel, updatePickPanel});
  bindHeightEditing(canvas, state, documentRef);
  bindStateEditing(canvas, state, documentRef);
  bindEditingInteractionLock(canvas, state);

  bindRuntimePanel(documentRef, {
    onGenerate: () => generate(state, documentRef),
    onRandomSeed: () => {
      setSeedInput(documentRef, createRandomSeed());
      generate(state, documentRef);
    },
    onFitView: () => {
      renderer.fitToView();
      updateRuntimePanel(documentRef, state);
    },
    onShowOceanHeight: showOceanHeight => {
      renderer.setViewOptions({showOceanHeight});
      updateRuntimePanel(documentRef, state);
    },
    onOpenHeightPanel: () => {
      state.panels.height.open(state.editHistory.getStats());
    },
    onOpenStatePanel: () => {
      if (state.selection?.object?.kind === "state") {
        state.panels.state.setTargetStateId(state.selection.object.id);
      }
      state.panels.state.open(state.map, state.editHistory.getStats());
    },
    onOpenRiverPanel: () => {
      state.panels.river.open(state.map, state.selection, state.editHistory.getStats());
    },
    onMode: mode => {
      renderer.setColorMode(mode);
      updateRuntimePanel(documentRef, state);
    }
  });

  generate(state, documentRef);
  window.__webglGeneratorApp = state;
  return state;
}

function generate(state, documentRef) {
  if (documentRef.getElementById("auto-random-seed").checked) {
    setSeedInput(documentRef, createRandomSeed());
  }
  state.options = readOptionsFromPanel(documentRef, state.options);
  state.map = generatePlaceholderMap(state.options);
  state.pick = null;
  state.editHistory.clear();
  state.heightEdit.activeStroke = null;
  state.heightEdit.lastAffected = 0;
  state.heightEdit.lastHeight = "none";
  state.stateEdit.activeStroke = null;
  state.stateEdit.lastAffected = 0;
  state.stateEdit.sourceStateId = null;
  state.stateEdit.lastPointer = null;
  state.lastEditRefresh = null;
  state.renderer.loadMap(state.map);
  state.selectionStore.clear();
  updateHeightPanel(state);
  updateStatePanel(state);
  updateEditingInteractionLock(state, documentRef);
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}

function locateObject(state, object, documentRef) {
  const located = object ? state.renderer.locateObject(object) : false;
  if (located) {
    state.selectionStore.setSelection({object});
  }
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}

function refreshAfterEdit(state, commandOrEffects) {
  state.editRefreshScheduler.run(commandOrEffects);
}

function refreshAfterStateEdit(state, commandOrEffects) {
  updateStatePickAtLastPointer(state);
  refreshAfterEdit(state, commandOrEffects);
}

function bindHeightEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.panels.height?.getBrush().active || !state.map) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.heightEdit.activeStroke = {
      pointerId: event.pointerId,
      originals: new Map()
    };
    capturePointer(canvas, event.pointerId);
    applyHeightBrushAtEvent(state, event, documentRef);
  }, true);

  canvas.addEventListener("pointermove", event => {
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyHeightBrushAtEvent(state, event, documentRef);
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishHeightStroke(state);
    releasePointer(canvas, event.pointerId);
    updateHeightPanel(state);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishHeightStroke(state);
    releasePointer(canvas, event.pointerId);
    updateHeightPanel(state);
  }, true);
}

function bindStateEditing(canvas, state) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.panels.state?.getBrush().active || !state.map) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const sourceStateId = getStateIdAtEvent(state, event);
    state.stateEdit.activeStroke = {
      pointerId: event.pointerId,
      originals: new Map(),
      sourceStateId
    };
    state.stateEdit.lastPointer = {clientX: event.clientX, clientY: event.clientY};
    state.stateEdit.sourceStateId = sourceStateId;
    capturePointer(canvas, event.pointerId);
    applyStateBrushAtEvent(state, event);
  }, true);

  canvas.addEventListener("pointermove", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyStateBrushAtEvent(state, event);
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishStateStroke(state);
    releasePointer(canvas, event.pointerId);
    updateStatePanel(state);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishStateStroke(state);
    releasePointer(canvas, event.pointerId);
    updateStatePanel(state);
  }, true);
}

function bindEditingInteractionLock(canvas, state) {
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"]) {
    canvas.addEventListener(eventName, event => {
      if (!isEditingInteractionLocked(state)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
}

function applyHeightBrushAtEvent(state, event) {
  const brush = state.panels.height.getBrush();
  const stroke = state.heightEdit.activeStroke;
  if (!brush.active || !stroke) return;

  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getHeightBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;

  applyHeightBrushPreview(state.map, changes);
  state.heightEdit.lastAffected = changes.length;
  state.heightEdit.lastHeight = summarizeChangedHeights(changes);
  state.editRefreshScheduler.run(EDIT_REFRESH_PRESETS.HEIGHT_BRUSH_PREVIEW);
  updateHeightPanel(state);
}

function applyStateBrushAtEvent(state, event) {
  const brush = state.panels.state.getBrush();
  const stroke = state.stateEdit.activeStroke;
  if (!brush.active || !stroke || brush.targetStateId <= 0) return;

  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  state.stateEdit.lastPointer = {clientX: event.clientX, clientY: event.clientY};
  const changes = getStateBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;

  applyStateBrushPreview(state.map, changes);
  state.stateEdit.lastAffected = changes.length;
  state.stateEdit.sourceStateId = stroke.sourceStateId;
  state.editRefreshScheduler.run(STATE_BRUSH_PREVIEW_EFFECTS);
  updateStatePanel(state);
}

function finishHeightStroke(state) {
  const stroke = state.heightEdit.activeStroke;
  state.heightEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;

  const changes = [];
  for (const [gridCell, before] of stroke.originals.entries()) {
    const after = state.map.grid.cells.h[gridCell];
    if (before !== after) changes.push({gridCell, before, after});
  }
  const command = createApplyHeightBrushCommand(changes);
  if (command.isNoop({map: state.map})) return;
  state.heightEdit.lastAffected = changes.length;
  state.heightEdit.lastHeight = summarizeChangedHeights(changes);
  refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
}

function finishStateStroke(state) {
  const stroke = state.stateEdit.activeStroke;
  state.stateEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;

  const changes = [];
  for (const [gridCell, before] of stroke.originals.entries()) {
    const after = state.map.grid.cells.state[gridCell];
    if (before !== after) changes.push({gridCell, before, after});
  }
  const command = createApplyStateBrushCommand(changes);
  if (command.isNoop({map: state.map})) return;
  state.stateEdit.lastAffected = changes.length;
  state.stateEdit.sourceStateId = stroke.sourceStateId;
  refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
}

function getHeightBrushChanges(map, point, brush, originals) {
  const radiusSq = brush.radius * brush.radius;
  const affected = [];
  const cells = map.grid.cells;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const cellPoint = map.grid.points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    const distance = Math.sqrt(distanceSq);
    const factor = brush.falloff && brush.action !== "smooth" ? brushFalloff(distance, brush.radius) : 1;
    affected.push({gridCell, factor});
  }

  if (!affected.length) return [];
  if (brush.action === "smooth") {
    const average = affected.reduce((sum, item) => sum + cells.h[item.gridCell], 0) / affected.length;
    return affected.map(({gridCell}) => heightChange(cells, originals, gridCell, cells.h[gridCell] * 0.62 + average * 0.38));
  }

  const delta = brush.action === "lower" ? -brush.strength : brush.strength;
  return affected.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + delta * factor));
}

function getStateBrushChanges(map, point, brush, originals) {
  const radiusSq = brush.radius * brush.radius;
  const affected = [];
  const cells = map.grid.cells;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    if (!isGridLandCell(map, gridCell)) continue;
    const cellPoint = map.grid.points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    if (dx * dx + dy * dy > radiusSq) continue;
    if (cells.state[gridCell] === brush.targetStateId) continue;
    affected.push(stateChange(cells, originals, gridCell, brush.targetStateId));
  }

  return affected;
}

function heightChange(cells, originals, gridCell, nextValue) {
  if (!originals.has(gridCell)) originals.set(gridCell, cells.h[gridCell]);
  return {
    gridCell,
    before: originals.get(gridCell),
    after: clampHeight(nextValue)
  };
}

function stateChange(cells, originals, gridCell, nextValue) {
  if (!originals.has(gridCell)) originals.set(gridCell, cells.state[gridCell] || 0);
  return {
    gridCell,
    before: originals.get(gridCell),
    after: nextValue
  };
}

function updateHeightPanel(state) {
  state.panels.height?.update({
    lastAffected: state.heightEdit.lastAffected,
    lastHeight: state.heightEdit.lastHeight,
    history: state.editHistory.getStats()
  });
}

function updateStatePanel(state) {
  state.panels.state?.update({
    map: state.map,
    lastAffected: state.stateEdit.lastAffected,
    sourceStateId: state.stateEdit.sourceStateId,
    history: state.editHistory.getStats()
  });
}

function setStatePanelTarget(state, stateId) {
  if (!Number.isInteger(stateId) || stateId <= 0) return;
  state.panels.state?.setTargetStateId(stateId);
  updateStatePanel(state);
}

function getStateIdFromSelection(state) {
  const object = state.selection?.object;
  if (object?.kind === "state") return object.id;
  if (Number.isInteger(object?.stateId)) return object.stateId;
  return null;
}

function getStateIdFromPick(state) {
  if (Number.isInteger(state.pick?.gridCell)) return state.map.grid.cells.state[state.pick.gridCell] || null;
  if (state.pick?.politicalObject?.kind === "state") return state.pick.politicalObject.id;
  return null;
}

function getStateIdAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  if (Number.isInteger(pick?.gridCell) && pick.gridCell >= 0) {
    return state.map.grid.cells.state[pick.gridCell] || null;
  }
  return null;
}

function updateStatePickAtLastPointer(state) {
  const pointer = state.stateEdit.lastPointer;
  if (!pointer) return;
  state.pick = state.renderer.pickClientPoint(pointer.clientX, pointer.clientY);
}

function updateEditingInteractionLock(state, documentRef) {
  setEditingInteractionLock(documentRef, isEditingInteractionLocked(state), {allowedPanelIds: getAllowedEditingPanelIds(state)});
}

function isEditingInteractionLocked(state) {
  return Boolean(state.panels.height?.getBrush().active || state.panels.state?.getBrush().active || state.editingObject);
}

function getAllowedEditingPanelIds(state) {
  if (state.panels.height?.getBrush().active) return ["height-panel"];
  if (state.panels.state?.getBrush().active) return ["state-panel"];
  if (state.editingObject?.kind === "river") return ["object-details", "river-panel"];
  if (state.editingObject) return ["object-details"];
  return [];
}

function isGridLandCell(map, gridCell) {
  if (map.grid.cells.h?.[gridCell] < 20) return false;
  const featureId = map.grid.cells.f?.[gridCell];
  const feature = map.features.features?.[featureId];
  return feature ? Boolean(feature.land) : true;
}

function summarizeChangedHeights(changes) {
  if (!changes.length) return "none";
  const values = changes.map(change => change.after);
  return `${Math.min(...values)}..${Math.max(...values)}`;
}

function brushFalloff(distance, radius) {
  const t = Math.max(0, Math.min(1, 1 - distance / Math.max(1, radius)));
  return t * t * (3 - 2 * t);
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and some browser paths may not allow capture.
  }
}

function releasePointer(element, pointerId) {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already be gone after cancel/up.
  }
}
