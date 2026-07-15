import {nextTick, onBeforeUnmount, watch} from "vue";
import {getOverlayRegistry} from "../../overlay-registry.js";

export function useManagedOverlay(elementRef, openSource, {id, onClose} = {}) {
  let handle = null;
  const readOpen = typeof openSource === "function" ? openSource : () => Boolean(openSource?.value);

  watch(readOpen, async open => {
    if (!open) {
      releaseHandle({restoreFocus: true});
      return;
    }
    await nextTick();
    const element = elementRef.value;
    if (!element) return;
    await waitForLayoutFrame(element.ownerDocument?.defaultView);
    if (!readOpen() || elementRef.value !== element) return;
    releaseHandle({restoreFocus: false});
    handle = getOverlayRegistry(element.ownerDocument)?.register(id, element, {
      kind: "fixed",
      role: "advanced",
      onRequestClose: () => onClose?.()
    }) || null;
    handle?.show();
  }, {flush: "post"});

  onBeforeUnmount(() => releaseHandle({restoreFocus: false}));

  function releaseHandle({restoreFocus}) {
    if (!handle) return;
    handle.hide({restoreFocus});
    handle.unregister({restoreFocus: false});
    handle = null;
  }

  return {
    activate: () => handle?.activate(),
    reflow: () => handle?.reflow()
  };
}

function waitForLayoutFrame(view) {
  if (typeof view?.requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise(resolve => view.requestAnimationFrame(() => resolve()));
}
