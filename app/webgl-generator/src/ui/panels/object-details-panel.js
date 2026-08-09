import {createApp, shallowReactive} from "vue";
import ObjectDetailsPanel from "../vue/components/ObjectDetailsPanel.vue";
import {pinia} from "../vue/pinia.js";

export function createObjectDetailsPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    object: null,
    editingObject: null
  });
  let suppressNextViewOpenFor = null;

  const record = manager.registerPanel("object-details", {
    title: "对象详情",
    left: 24,
    top: 24,
    width: 320,
    role: "detail",
    persistOpen: false,
    onClose: () => {
      const closedObject = panelState.object;
      const wasEditing = panelState.editingObject;
      panelState.editingObject = null;
      if (!wasEditing) return;
      suppressNextViewOpenFor = closedObject;
      callbacks.onCancelEdit?.();
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-object-details-root";
  record.body.replaceChildren(root);
  const app = createApp(ObjectDetailsPanel, {
    state: panelState,
    callbacks: {
      onEdit: () => callbacks.onEdit?.(panelState.object),
      onCancelEdit: () => callbacks.onCancelEdit?.(),
      onLocate: () => callbacks.onLocate?.(panelState.object),
      onOpenCityPanel: () => callbacks.onOpenCityPanel?.(panelState.object),
      onRename: name => callbacks.onRename?.(panelState.object, name),
      onRenameFromNamebase: () => callbacks.onRenameFromNamebase?.(panelState.object)
    }
  });
  app.use(pinia);
  app.mount(root);

  return {
    show(selection, editingObject = null) {
      if (!selection?.object) {
        panelState.object = null;
        panelState.editingObject = null;
        suppressNextViewOpenFor = null;
        manager.close("object-details");
        return;
      }
      panelState.object = selection.object;
      panelState.editingObject = editingObject;
      if (!editingObject && isSameObject(selection.object, suppressNextViewOpenFor)) {
        suppressNextViewOpenFor = null;
        return;
      }
      suppressNextViewOpenFor = null;
      manager.open("object-details");
    },
    clear() {
      manager.close("object-details");
    },
    unmount() {
      app.unmount();
    }
  };
}

function isSameObject(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}
