import {createGeneratorApp} from "./runtime/app.js";

try {
  createGeneratorApp(document);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  document.getElementById("app-status").textContent = `启动失败：${message}`;
  document.getElementById("map-badge").textContent = "启动失败，查看 Console";
  console.error(error);
}
