#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {listPrototypeDeployments} from "./prototype-deployment.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const [vercelSource, viteSource, packageSource] = await Promise.all([
  readFile(path.join(projectRoot, "vercel.json"), "utf8"),
  readFile(path.join(projectRoot, "vite.config.mjs"), "utf8"),
  readFile(path.join(projectRoot, "package.json"), "utf8")
]);
const vercel = JSON.parse(vercelSource);
const packageJson = JSON.parse(packageSource);
const deployments = await listPrototypeDeployments(path.join(projectRoot, "prototype"));

assert.equal(vercel.outputDirectory, "dist/webgl-generator", "Vercel 输出目录不再指向统一静态产物");
assert.equal(vercel.buildCommand, "pnpm run build:app", "Vercel 没有复用统一构建入口");
assert.deepEqual(vercel.redirects?.[0], {
  source: "/prototype/:prototype",
  destination: "/prototype/:prototype/",
  permanent: false
}, "prototype 无尾斜杠入口没有规范化");
assert.deepEqual(vercel.rewrites?.[0], {
  source: "/prototype/:prototype/",
  destination: "/prototype/:prototype/index.html"
}, "prototype 目录入口没有优先改写到自身 index.html");
assert.deepEqual(vercel.rewrites?.at(-1), {source: "/(.*)", destination: "/index.html"}, "正式应用 SPA fallback 不在路由末尾");
assert.match(viteSource, /stagePrototypeDeployments\([\s\S]*?"prototype"[\s\S]*?"dist", "webgl-generator", "prototype"/, "Vite 构建没有动态装配 prototype 目录");
assert.deepEqual(deployments.map(item => item.id), ["boundary-topology-lab", "loading-scroll-showcase", "webgl-cells"], "当前 prototype 分母漂移");

const outputRoot = path.join(projectRoot, vercel.outputDirectory);
let checkedBuildOutput = false;
try {
  await access(path.join(outputRoot, "index.html"));
  for (const deployment of deployments) {
    await access(path.join(outputRoot, "prototype", deployment.id, "index.html"));
  }
  await access(path.join(outputRoot, "prototype", "webgl-cells", "data", "sample-map.json"));
  await access(path.join(outputRoot, "prototype", "boundary-topology-lab", "src", "app.js"));
  await access(path.join(outputRoot, "prototype", "loading-scroll-showcase", "src", "app.js"));
  await access(path.join(outputRoot, "prototype", "loading-scroll-showcase", "src", "styles.css"));
  await access(path.join(outputRoot, "prototype", "loading-scroll-showcase", "assets", "mosuzi-seal.png"));
  const [builtIndex, builtSeal] = await Promise.all([
    readFile(path.join(outputRoot, "index.html"), "utf8"),
    readFile(path.join(outputRoot, "assets", "mosuzi-seal.png"))
  ]);
  assert(!builtIndex.includes("__FMG_APP_VERSION__"), "正式产物仍残留版本占位符");
  assert(builtIndex.includes(`v${packageJson.version}`), "正式产物版本号与根 package.json 不一致");
  assert(builtIndex.includes("/assets/mosuzi-seal.png"), "正式构建入口没有引用同源印章资源");
  assert.equal(createHash("sha256").update(builtSeal).digest("hex"), "367ad061211ee469f9fccb57e438edfc52221acdb8c501b5843bf14a3c9de725", "正式构建印章资源不是已确认的莫苏子印3版本");
  checkedBuildOutput = true;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(JSON.stringify({
  ok: true,
  outputDirectory: vercel.outputDirectory,
  prototypes: deployments.map(item => `/prototype/${item.id}/`),
  checkedBuildOutput
}, null, 2));
