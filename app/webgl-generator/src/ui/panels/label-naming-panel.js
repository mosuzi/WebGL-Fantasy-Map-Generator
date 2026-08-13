import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "../../runtime/object-kinds.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const LABEL_NAMING_PANEL_ID = "label-naming-panel";
const LABEL_NAMING_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  type: 76,
  name: 128,
  owner: 128,
  status: 76,
  priority: 72
});
const LABEL_NAMING_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: LABEL_NAMING_COLUMN_WIDTHS,
  sortKey: "priority",
  sortDir: "desc"
});

export function createLabelNamingPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, LABEL_NAMING_PANEL_ID, LABEL_NAMING_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedLabelKey: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, LABEL_NAMING_PANEL_ID, {filter: value}, LABEL_NAMING_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "type" || key === "name" || key === "id" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, LABEL_NAMING_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, LABEL_NAMING_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, LABEL_NAMING_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, LABEL_NAMING_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedLabelKey = row.key;
      callbacks.onSelect?.(labelObject(row));
    },
    onLocate: row => callbacks.onLocate?.(labelObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, labelObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onRename: (row, name) => callbacks.onRename?.(labelObject(row), name),
    onNoteChange: (row, body) => callbacks.onNoteChange?.(labelObject(row), body),
    onPriorityChange: (row, priority) => callbacks.onPriorityChange?.(labelObject(row), priority),
    onPriorityReset: row => callbacks.onPriorityReset?.(labelObject(row)),
    onPositionToggle: row => callbacks.onPositionToggle?.(labelObject(row)),
    onAdd: () => callbacks.onAdd?.(),
    onDelete: row => callbacks.onDelete?.(labelObject(row)),
    onRestore: row => callbacks.onRestore?.(labelObject(row)),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(LABEL_NAMING_PANEL_ID, {
    title: "标签管理",
    left: 496,
    top: 132,
    width: 580,
    maxWidth: 700,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      callbacks.onClose?.();
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-label-naming-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/LabelNamingPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "标签管理将在首次打开时加载。",
      loading: "正在打开标签管理，请稍候片刻。",
      failure: "标签管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === OBJECT_KIND.LABEL) panelState.selectedLabelKey = labelKeyForObject(selection.object);
      if (!labelExists(map, panelState.selectedLabelKey)) panelState.selectedLabelKey = firstLabelKey(map);
      panelState.open = true;
      panelState.version++;
      manager.open("label-naming-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === OBJECT_KIND.LABEL) panelState.selectedLabelKey = labelKeyForObject(selection.object);
      if (!labelExists(map, panelState.selectedLabelKey)) panelState.selectedLabelKey = firstLabelKey(map);
      panelState.version++;
    },
    setSelectedLabelKey(key) {
      if (labelExists(panelState.map, key)) {
        panelState.selectedLabelKey = key;
      }
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function labelObject(row) {
  return {
    kind: OBJECT_KIND.LABEL,
    id: row.targetId,
    text: row.name,
    targetKind: row.targetKind,
    targetId: row.targetId,
    targetName: row.name,
    rank: row.rank,
    x: row.x,
    y: row.y
  };
}

function labelKeyForObject(object) {
  if (!object?.kind) return null;
  return `${object.targetKind || LABEL_TARGET_KIND.CITY}:${object.targetId ?? object.id}`;
}

function labelExists(map, key) {
  if (!key) return false;
  const [kind, idText] = String(key).split(":");
  const id = Number(idText);
  if (!Number.isInteger(id)) return false;
  if (kind === LABEL_TARGET_KIND.CITY) return Boolean(map?.settlements?.cities?.[id]);
  if (kind === LABEL_TARGET_KIND.STATE) return Boolean(map?.politics?.states?.[id]);
  if (kind === LABEL_TARGET_KIND.PROVINCE) return Boolean(map?.politics?.provinces?.[id]);
  if (kind === LABEL_TARGET_KIND.CUSTOM) return Boolean(map?.labels?.custom?.some(label => label?.id === id));
  return false;
}

function firstLabelKey(map) {
  const custom = (map?.labels?.custom || []).find(item => item && Number.isInteger(item.id));
  if (custom) return `${LABEL_TARGET_KIND.CUSTOM}:${custom.id}`;
  const capital = (map?.settlements?.cities || []).find(city => city?.capital && Number.isInteger(city.id));
  if (capital) return `${LABEL_TARGET_KIND.CITY}:${capital.id}`;
  const city = (map?.settlements?.cities || []).find(item => item && Number.isInteger(item.id));
  if (city) return `${LABEL_TARGET_KIND.CITY}:${city.id}`;
  const state = (map?.politics?.states || []).find(item => item?.i || item?.id);
  if (state) return `${LABEL_TARGET_KIND.STATE}:${state.i ?? state.id}`;
  const province = (map?.politics?.provinces || []).find(item => item?.i || item?.id);
  return province ? `${LABEL_TARGET_KIND.PROVINCE}:${province.i ?? province.id}` : null;
}
