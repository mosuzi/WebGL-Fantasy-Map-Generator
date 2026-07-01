import {createApp} from "vue";
import {pinia} from "../vue/pinia.js";

export function createLazyVuePanel(documentRef, root, loadComponent, props, messages = {}) {
  root.textContent = messages.initial || "";
  let app = null;
  let appPromise = null;
  let disposed = false;

  return {
    load() {
      ensureApp().catch(error => {
        root.textContent = messages.failure || "面板加载失败，请检查开发模式日志。";
        documentRef.defaultView?.console.error?.(error);
      });
    },
    unmount() {
      disposed = true;
      app?.unmount();
      app = null;
    }
  };

  function ensureApp() {
    if (app) return Promise.resolve(app);
    if (appPromise) return appPromise;
    root.textContent = messages.loading || "正在加载面板...";
    appPromise = loadComponent().then(module => {
      if (disposed) return null;
      if (app) return app;
      root.textContent = "";
      app = createApp(module.default || module, props);
      app.use(pinia);
      app.mount(root);
      return app;
    });
    return appPromise;
  }
}
