import vue from "@vitejs/plugin-vue";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import Components from "unplugin-vue-components/vite";
import {ElementPlusResolver} from "unplugin-vue-components/resolvers";
import {defineConfig, loadEnv} from "vite";
import {hasCloudProviderBuildInput, readCloudProviderBuildConfig, serializeCloudProviderConfig} from "./tools/cloud-provider-config.mjs";
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

function injectCloudProviderConfig() {
  return {
    name: "inject-cloud-provider-config",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return html.replace("<!-- __FMG_CLOUD_PROVIDER_CONFIG__ -->", '<script src="./cloud-provider-config.js"></script>');
      }
    }
  };
}

function serveDropboxOAuthCallback() {
  const route = "/oauth/dropbox/callback";
  const callbackFile = path.join(projectRoot, "app", "webgl-generator", "public", "oauth", "dropbox", "callback", "index.html");
  const middleware = (request, response, next) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname.replace(/\/$/, "");
    if (pathname !== route) return next();
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.end(readFileSync(callbackFile, "utf8"));
  };
  return {
    name: "serve-dropbox-oauth-callback",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
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

function emitCloudProviderConfig(env) {
  return {
    name: "emit-cloud-provider-config",
    apply: "build",
    closeBundle() {
      if (!hasCloudProviderBuildInput(env)) return;
      const outputDirectory = path.join(projectRoot, "dist", "webgl-generator");
      mkdirSync(outputDirectory, {recursive: true});
      writeFileSync(
        path.join(outputDirectory, "cloud-provider-config.js"),
        serializeCloudProviderConfig(readCloudProviderBuildConfig(env)),
        "utf8"
      );
    }
  };
}

export default defineConfig(({mode}) => {
  const deployEnv = {...loadEnv(mode, projectRoot, ""), ...process.env};
  return {
    root: "app/webgl-generator",
    envDir: projectRoot,
    base: "./",
    plugins: [
      serveDropboxOAuthCallback(),
      injectAppVersion(),
      injectCloudProviderConfig(),
      deployPrototypes(),
      emitCloudProviderConfig(deployEnv),
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
  };
});
