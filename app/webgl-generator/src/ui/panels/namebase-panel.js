import {createApp, shallowReactive} from "vue";
import {getNamebaseSummariesForMap} from "../../generator/namebase-store.js";
import {pinia} from "../vue/pinia.js";
import NamebasePanel from "../vue/components/NamebasePanel.vue";

export function createNamebasePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    summaries: getNamebaseSummariesForMap(null, {includeSource: true}),
    filter: "",
    importMode: "append",
    sortKey: "category",
    sortDir: "asc",
    selectedNamebaseId: null,
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
        panelState.sortDir = key === "category" || key === "name" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedNamebaseId = row.id;
    },
    onExport: () => callbacks.onExport?.(),
    onImportMode: mode => {
      panelState.importMode = mode;
    },
    onImport: file => callbacks.onImport?.(file, panelState.importMode),
    onCopyBuiltin: row => callbacks.onCopyBuiltin?.(row),
    onRenameUser: (row, name) => callbacks.onRenameUser?.(row, name),
    onUpdateSource: (row, sourceText) => callbacks.onUpdateSource?.(row, sourceText),
    onDeleteUser: row => callbacks.onDeleteUser?.(row),
    onClearUser: () => callbacks.onClearUser?.()
  };

  const record = manager.registerPanel("namebase-panel", {
    title: "名称库总览",
    left: 548,
    top: 148,
    width: 760,
    maxWidth: 920,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-namebase-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(NamebasePanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map = null) {
      panelState.map = map;
      refreshSummaries(panelState);
      panelState.open = true;
      panelState.version++;
      manager.open("namebase-panel");
    },
    update(map = null) {
      panelState.map = map;
      refreshSummaries(panelState);
      panelState.version++;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      app.unmount();
    }
  };
}

function refreshSummaries(panelState) {
  panelState.summaries = getNamebaseSummariesForMap(panelState.map, {includeSource: true});
  if (!panelState.selectedNamebaseId || !panelState.summaries.some(row => row.id === panelState.selectedNamebaseId)) {
    panelState.selectedNamebaseId = panelState.summaries[0]?.id || null;
  }
}
