import vue from "@vitejs/plugin-vue";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import Components from "unplugin-vue-components/vite";
import {ElementPlusResolver} from "unplugin-vue-components/resolvers";
import {defineConfig} from "vite";
import {stagePrototypeDeployments} from "./tools/prototype-deployment.mjs";

const knownVueUseInvalidAnnotationLines = new Set([3362, 5780]);
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

function shouldSuppressKnownVueUseInvalidAnnotation(level, log) {
  if (level !== "warn" || log?.code !== "INVALID_ANNOTATION") return false;
  const file = normalizeBuildLogPath(log?.loc?.file || log?.id || log?.url || "");
  const line = Number(log?.loc?.line);
  return file.includes("/@vueuse/core/dist/index.js") && knownVueUseInvalidAnnotationLines.has(line);
}

function normalizeBuildLogPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function injectAppVersion() {
  return {
    name: "inject-app-version",
    transformIndexHtml(html) {
      return html.replaceAll("__FMG_APP_VERSION__", packageJson.version);
    }
  };
}

function deployPrototypes() {
  return {
    name: "deploy-prototypes",
    apply: "build",
    async closeBundle() {
      await stagePrototypeDeployments(
        path.join(projectRoot, "prototype"),
        path.join(projectRoot, "dist", "webgl-generator", "prototype")
      );
    }
  };
}

export default defineConfig({
  root: "app/webgl-generator",
  base: "./",
  plugins: [
    injectAppVersion(),
    deployPrototypes(),
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
