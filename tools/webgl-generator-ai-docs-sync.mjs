import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {API_METHODS, API_VERSION, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {HEADLESS_WRITE_METHODS, HEADLESS_WRITE_VERSION} from "../app/webgl-generator/src/runtime/headless-write-api.js";
import {getPlannerRecipe, listPlannerRecipes, PLANNER_RECIPE_SCHEMA_VERSION} from "../app/webgl-generator/src/runtime/planner-recipe-registry.js";

const check = process.argv.includes("--check");
const outputDirectory = resolve("docs/generated/ai");
const recipes = listPlannerRecipes().map(item => getPlannerRecipe(item.recipeId));
const domainRoutes = buildDomainRoutes();
const catalog = Object.entries(API_METHODS).flatMap(([namespace, methods]) => methods.map(name => buildBrowserCatalogRow(namespace, name)));
const headlessCatalog = [
  "info.mapSummary", "info.document", "objects.types", "objects.get", "objects.list", "objects.query",
  "cells.get", "cells.getAtPoint", "cells.neighbors", "cells.query", "cells.scan", "climate.get", "terrain.get", "population.get",
  "planner.listRecipes", "planner.getRecipe", "analysis.defineRegion", "analysis.describeRegion", "analysis.compareRegions",
  "analysis.explainPrecipitation", "analysis.diagnosePopulation", "analysis.comparePower", "analysis.diagnoseTerrain"
].map(method => ({method, runtime: "headless", mutates: "none", handbook: routeForMethod(method)}));
const headlessWriteCatalog = HEADLESS_WRITE_METHODS.map(method => ({
  method,
  runtime: "headless-write",
  mutates: method.includes(".inspect") ? "none" : "map-document-copy",
  requires: method.includes(".inspect") ? [] : ["documentId", "expectedRevision", "inspectionToken", "requestId"],
  handbook: "docs/ai/safe-change-boundaries.md"
}));
const manifest = {
  generatedAt: "由 sync 脚本生成；时间不参与一致性比较",
  apiVersion: API_VERSION,
  plannerRecipeSchemaVersion: PLANNER_RECIPE_SCHEMA_VERSION,
  browserMethods: catalog.length,
  headlessMethods: headlessCatalog.length,
  headlessWriteVersion: HEADLESS_WRITE_VERSION,
  headlessWriteMethods: headlessWriteCatalog.length,
  recipes: recipes.length,
  runtimeProfiles: ["browser", "headless-readonly", "headless-write"],
  entry: "docs/ai/README.md"
};
const files = {
  "manifest.json": manifest,
  "api-catalog.json": {manifest, browser: catalog, headless: headlessCatalog, headlessWrite: headlessWriteCatalog},
  "recipe-catalog.json": {schemaVersion: PLANNER_RECIPE_SCHEMA_VERSION, recipes},
  "domain-capability-map.json": {domains: domainRoutes},
  "api-catalog.md": renderMarkdown(catalog, headlessCatalog, headlessWriteCatalog, recipes)
};

const referencedDocuments = new Set([
  ...catalog.map(item => item.handbook),
  ...headlessCatalog.map(item => item.handbook),
  ...headlessWriteCatalog.map(item => item.handbook),
  ...domainRoutes.flatMap(item => [item.aiHandbook, item.wikiPage])
]);
const missingDocuments = [...referencedDocuments].filter(path => !existsSync(resolve(path)));
if (missingDocuments.length) throw new Error(`AI / Wiki 路由指向不存在文档：${missingDocuments.join("、")}`);

mkdirSync(outputDirectory, {recursive: true});
const mismatches = [];
for (const [name, value] of Object.entries(files)) {
  const path = resolve(outputDirectory, name);
  const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (check) {
    let actual = "";
    try { actual = readFileSync(path, "utf8"); } catch {}
    if (actual !== content) mismatches.push(name);
  } else writeFileSync(path, content);
}
if (mismatches.length) throw new Error(`AI 机器目录陈旧或缺失：${mismatches.join("、")}`);
console.log(check ? `AI 文档机器目录一致：浏览器 ${catalog.length} 方法、无头只读 ${headlessCatalog.length} 方法、无头写入 ${headlessWriteCatalog.length} 方法、${recipes.length} 配方。` : `已生成 AI 文档机器目录：${outputDirectory}`);

function buildDomainRoutes() {
  return Object.keys(API_METHODS).map(namespace => ({
    namespace,
    methodCount: API_METHODS[namespace].length,
    aiHandbook: namespace === "climate" || namespace === "cells" || namespace === "objects" ? "docs/ai/regional-analysis.md" : namespace === "edit" || namespace === "history" || namespace === "regenerationLocks" ? "docs/ai/safe-change-boundaries.md" : "docs/ai/README.md",
    wikiPage: wikiPage(namespace)
  }));
}

function buildBrowserCatalogRow(namespace, name) {
  const method = `${namespace}.${name}`;
  const readonly = ["info", "objects", "cells", "planner"].includes(namespace) || /^(get|list|query|inspect|export|snapshot|dump|health|renderer|peek|stats|types|actions|version|capabilities|describe)/.test(name);
  return {
    method,
    stability: namespace === "debug" ? "experimental" : method === "data.exportAll" ? "deprecated" : "stable",
    mutates: readonly ? "none-or-export-result" : namespace === "selection" || namespace === "layers" || namespace === "debug" ? "runtime-or-ui-state" : "map-or-persistent-state",
    undoable: namespace === "edit",
    async: /^(data\.(exportPNG|exportHeightmapPNG|exportCompressedAll|import)|generate\.)/.test(method),
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(method),
    capabilityGroup: namespace,
    schemaDiscovery: `window.webglGeneratorApi.info.describe("${method}")`,
    handbook: routeForMethod(method)
  };
}

function routeForMethod(method) {
  if (method.startsWith("analysis.")) return "docs/ai/regional-analysis.md";
  if (/^(edit|history|regenerationLocks)\./.test(method)) return "docs/ai/safe-change-boundaries.md";
  if (/^(cells|objects|terrain|population)\./.test(method)) return "docs/ai/map-data-model.md";
  return "docs/ai/runtime-and-loading.md";
}

function wikiPage(namespace) {
  const map = {climate: "气候与降水", cells: "地图数据与区域分析", objects: "地图数据与区域分析", edit: "编辑器与安全修改", history: "编辑器与安全修改", regenerationLocks: "编辑器与安全修改", data: "存档与导入导出", debug: "API与自动化"};
  return `docs/wiki/${map[namespace] || "功能与领域总览"}.md`;
}

function renderMarkdown(browser, headless, headlessWrite, recipes) {
  const rows = browser.map(item => `| \`${item.method}\` | ${item.stability} | ${item.mutates} | ${item.requiresConfirm ? "是" : "否"} | \`${item.handbook}\` |`).join("\n");
  const headlessRows = headless.map(item => `| \`${item.method}\` | \`${item.handbook}\` |`).join("\n");
  const headlessWriteRows = headlessWrite.map(item => `| \`${item.method}\` | ${item.mutates} | ${item.requires.length ? item.requires.join(" / ") : "无"} | \`${item.handbook}\` |`).join("\n");
  return `# AI API 机器目录\n\n> 由 \`pnpm run sync:ai-docs\` 生成，请勿手工修改。\n\n## 浏览器 API（${browser.length}）\n\n| 方法 | 稳定性 | 副作用 | 确认 | AI 手册 |\n|---|---|---|---|---|\n${rows}\n\n## 无头只读 API（${headless.length}）\n\n| 方法 | AI 手册 |\n|---|---|\n${headlessRows}\n\n## 无头写入 API（${headlessWrite.length}）\n\n| 方法 | 副作用 | 必需授权字段 | AI 手册 |\n|---|---|---|---|\n${headlessWriteRows}\n\n## Planner 配方（${recipes.length}）\n\n${recipes.map(recipe => `- \`${recipe.recipeId}\`：${recipe.title}（${recipe.steps.length} 步）`).join("\n")}\n`;
}
