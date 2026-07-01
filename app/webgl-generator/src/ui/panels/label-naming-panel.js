import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "../../runtime/object-kinds.js";

export function createLabelNamingPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "priority",
    sortDir: "desc",
    selectedLabelKey: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "type" || key === "name" || key === "id" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedLabelKey = row.key;
      callbacks.onSelect?.(labelObject(row));
    },
    onLocate: row => callbacks.onLocate?.(labelObject(row)),
    onRename: (row, name) => callbacks.onRename?.(labelObject(row), name),
    onNoteChange: (row, body) => callbacks.onNoteChange?.(labelObject(row), body),
    onAdd: () => callbacks.onAdd?.(),
    onDelete: row => callbacks.onDelete?.(labelObject(row)),
    onRestore: row => callbacks.onRestore?.(labelObject(row)),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("label-naming-panel", {
    title: "标签管理",
    left: 496,
    top: 132,
    width: 580,
    maxWidth: 700,
    onClose: () => {
      panelState.open = false;
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
      loading: "正在加载标签管理...",
      failure: "标签管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
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
      if (selection?.object?.kind === OBJECT_KIND.LABEL) panelState.selectedLabelKey = labelKeyForObject(selection.object);
      if (!labelExists(map, panelState.selectedLabelKey)) panelState.selectedLabelKey = firstLabelKey(map);
      panelState.version++;
    },
    setSelectedLabelKey(key) {
      if (labelExists(panelState.map, key)) {
        panelState.selectedLabelKey = key;
        panelState.version++;
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
    rank: row.rank
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
  return state ? `${LABEL_TARGET_KIND.STATE}:${state.i ?? state.id}` : null;
}
