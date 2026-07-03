import {createGeneratorApp} from "./runtime/app.js";
import {installWebglGeneratorHealthMonitor, recordStartupFailure} from "./runtime/health-monitor.js";
import {initializeVueStateBridge} from "./ui/vue/state-bridge.js";

const healthMonitor = installWebglGeneratorHealthMonitor(document);

try {
  initializeVueStateBridge(document);
  createGeneratorApp(document, {healthMonitor});
} catch (error) {
  recordStartupFailure(document, error);
  const message = error instanceof Error ? error.message : String(error);
  const status = document.getElementById("app-status");
  if (status) status.textContent = `启动失败：${message}`;
  const loading = document.getElementById("generation-loading");
  const loadingText = document.getElementById("generation-loading-text");
  if (loadingText) loadingText.textContent = "星图失序";
  if (loading) loading.hidden = false;
  console.error(error);
}
