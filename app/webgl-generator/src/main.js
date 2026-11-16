import {installWebglGeneratorHealthMonitor, recordStartupFailure} from "./runtime/health-monitor.js";
import {initializeVueStateBridge} from "./ui/vue/state-bridge.js";
import {failStartupLoading, startupFailureMessage, updateStartupLoadingStatus} from "./ui/startup-loading.js";
import {loadUserVisualThemes} from "./runtime/visual-theme-storage.js";
import "./styles.css";
import "./panel-theme.css";

const healthMonitor = installWebglGeneratorHealthMonitor(document);

async function startGenerator() {
  try {
    updateStartupLoadingStatus(document, "正在展开地图画卷");
    loadUserVisualThemes(window.localStorage);
    await new Promise(resolve => setTimeout(resolve, 0));
    initializeVueStateBridge(document);
    await new Promise(resolve => setTimeout(resolve, 0));
    // 大型编辑运行时在独立任务求值，避免与入口和 Vue 桥接连续占用主线程。
    let createGeneratorApp;
    try {
      ({createGeneratorApp} = await import("./runtime/app.js"));
    } catch (error) {
      const message = String(error?.message || "");
      window.__webglGeneratorModuleFailure ||= {
        source: message.match(/https?:\/\/\S+/)?.[0] || "app-runtime",
        reason: /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(message)
          ? "module-load" : "module-execution",
        errorName: error?.name || "Error"
      };
      throw error;
    }
    await createGeneratorApp(document, {healthMonitor});
  } catch (error) {
    const moduleFailureMessage = window.__webglGeneratorModuleFailure
      ? window.__webglGeneratorReportModuleFailure?.()
      : null;
    if (!moduleFailureMessage) {
      recordStartupFailure(document, error);
      failStartupLoading(document, error);
    }
    const status = document.getElementById("app-status");
    if (status) status.textContent = moduleFailureMessage || startupFailureMessage(error);
    const loading = document.getElementById("generation-loading");
    const loadingText = document.getElementById("generation-loading-text");
    if (loadingText) loadingText.textContent = "星图失序";
    if (loading) loading.hidden = false;
    console.error(error);
  }
}

void startGenerator();
