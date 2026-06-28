import {defineStore} from "pinia";

export const useEditorStore = defineStore("editor", {
  state: () => ({
    activeEditor: null,
    interactionLocked: false,
    allowedPanelIds: [],
    editingObject: null,
    height: {active: false, lastAffected: 0, lastHeight: "none"},
    stateBrush: {active: false, targetStateId: null, lastAffected: 0, sourceStateId: null},
    provinceBrush: {active: false, targetProvinceId: null, lastAffected: 0, sourceProvinceId: null},
    history: {undo: 0, redo: 0, lastLabel: "none"},
    lastEditRefresh: null
  }),
  actions: {
    setSnapshot(snapshot = {}) {
      this.activeEditor = snapshot.activeEditor || null;
      this.interactionLocked = Boolean(snapshot.interactionLocked);
      this.allowedPanelIds = Array.isArray(snapshot.allowedPanelIds) ? snapshot.allowedPanelIds.slice() : [];
      this.editingObject = snapshot.editingObject || null;
      this.height = {...this.height, ...(snapshot.height || {})};
      this.stateBrush = {...this.stateBrush, ...(snapshot.stateBrush || {})};
      this.provinceBrush = {...this.provinceBrush, ...(snapshot.provinceBrush || {})};
      this.history = {...this.history, ...(snapshot.history || {})};
      this.lastEditRefresh = snapshot.lastEditRefresh || null;
    }
  }
});
