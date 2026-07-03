import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import {ElementPlusResolver} from "unplugin-vue-components/resolvers";
import {defineConfig} from "vite";

const knownVueUseInvalidAnnotationLines = new Set([3362, 5780]);

function shouldSuppressKnownVueUseInvalidAnnotation(level, log) {
  if (level !== "warn" || log?.code !== "INVALID_ANNOTATION") return false;
  const file = normalizeBuildLogPath(log?.loc?.file || log?.id || log?.url || "");
  const line = Number(log?.loc?.line);
  return file.includes("/@vueuse/core/dist/index.js") && knownVueUseInvalidAnnotationLines.has(line);
}

function normalizeBuildLogPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

export default defineConfig({
  root: "app/webgl-generator",
  base: "./",
  plugins: [
    vue(),
    Components({
      dts: false,
      resolvers: [ElementPlusResolver({importStyle: "css"})]
    })
  ],
  server: {
    host: "127.0.0.1",
    port: 5410,
    strictPort: false
  },
  preview: {
    host: "127.0.0.1",
    port: 5410,
    strictPort: false
  },
  worker: {
    format: "es"
  },
  build: {
    outDir: "../../dist/webgl-generator",
    emptyOutDir: true,
    rolldownOptions: {
      onLog(level, log, handler) {
        if (shouldSuppressKnownVueUseInvalidAnnotation(level, log)) return;
        handler(level, log);
      }
    }
  }
});
