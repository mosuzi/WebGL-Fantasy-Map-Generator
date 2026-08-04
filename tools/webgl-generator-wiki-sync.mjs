#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join, posix, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {DEFAULT_LAYER_VISIBILITY} from "../app/webgl-generator/src/runtime/display-defaults.js";
import {HOVER_VIEW_MODES} from "../app/webgl-generator/src/ui/hover-overlay-content.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(rootDir, "docs", "wiki");
const manifestFile = "screenshot-manifest.json";
const manifestPath = join(source, manifestFile);
const publishedAssetBase = "https://raw.githubusercontent.com/wiki/mosuzi/WebGL-Fantasy-Map-Generator";
const publish = process.argv.includes("--publish");
const allFiles = listFiles(source);
const markdownFiles = allFiles.filter(name => name.endsWith(".md")).sort();
const markdownSet = new Set(markdownFiles);
const stems = new Set(markdownFiles.map(name => basename(name, ".md")));
const domainPages = ["地形水体与水文", "气候生态与人口", "政治社会与聚落", "路线经济外交与军事", "地区标注与测量"];
const required = [
  "Home", "_Sidebar", "安装与快速开始", "界面与基础操作", "地图生成与项目设置", "专题图层与视觉样式", "功能与领域总览",
  ...domainPages,
  "地图数据与区域分析", "编辑器与安全修改", "存档与导入导出", "API与自动化", "旧图兼容", "故障排查", "能力覆盖矩阵"
];
const failures = [];
const referencedAssets = new Set();
const controlPanelPath = join(rootDir, "app", "webgl-generator", "src", "ui", "vue", "components", "ControlPanel.vue");
const runtimeAppPath = join(rootDir, "app", "webgl-generator", "src", "runtime", "app.js");
const panelDirectory = join(rootDir, "app", "webgl-generator", "src", "ui", "panels");
const informationArchitectureRegressionPath = join(rootDir, "tools", "webgl-generator-control-information-architecture-regression.mjs");

let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  failures.push(`无法读取 ${manifestFile}：${error.message}`);
}
const manifestScenes = validateManifest(manifest, failures);
const manifestByFile = new Map(manifestScenes.map(scene => [scene.file, scene]));
const manifestAssets = new Set(manifestByFile.keys());

for (const page of required) if (!stems.has(page)) failures.push(`缺少页面 ${page}`);
for (const name of markdownFiles) {
  const content = readWikiFile(name);
  if (!/^# /m.test(content) && basename(name) !== "_Sidebar.md") failures.push(`${name} 缺少一级标题`);
  auditInternalLinks(name, content, markdownSet, failures);
  auditImages(name, content, referencedAssets, failures, manifestByFile);
  auditPublishedImages(name, createPublishedMarkdown(name, content), failures);
}

const matrixPath = join(source, "能力覆盖矩阵.md");
if (existsSync(matrixPath)) {
  const matrix = readFileSync(matrixPath, "utf8");
  for (const [namespace, methods] of Object.entries(API_METHODS)) {
    if (!new RegExp(`\\| ${escapeRegExp(namespace)} \\| ${methods.length} \\|`).test(matrix)) failures.push(`能力矩阵缺少或方法数不符：${namespace}=${methods.length}`);
  }
  auditUiCoverage(matrix, failures);
}
auditDomainNavigation(failures);

const diskAssets = new Set(allFiles.filter(name => /^assets\/.*\.png$/iu.test(name)));
auditSetDifference("manifest 有但 Markdown 未引用", manifestAssets, referencedAssets, failures);
auditSetDifference("Markdown 引用了但 manifest 未登记", referencedAssets, manifestAssets, failures);
auditSetDifference("manifest 有但磁盘缺少", manifestAssets, diskAssets, failures);
auditSetDifference("磁盘有但 manifest 未登记", diskAssets, manifestAssets, failures);

const expectedWidth = Number(manifest?.capture?.viewport?.width);
const expectedHeight = Number(manifest?.capture?.viewport?.height);
for (const asset of diskAssets) {
  const filePath = join(source, ...asset.split("/"));
  const details = inspectPng(filePath, failures);
  if (!details) continue;
  if (details.bytes <= 10000) failures.push(`${asset} 内容过小：${details.bytes} bytes`);
  const scene = manifestByFile.get(asset);
  const assetWidth = scene?.clip?.width || expectedWidth;
  const assetHeight = scene?.clip?.height || expectedHeight;
  if (details.width !== assetWidth || details.height !== assetHeight) {
    failures.push(`${asset} 尺寸错误：${details.width}×${details.height}，应为 ${assetWidth}×${assetHeight}`);
  }
}

if (failures.length) throw new Error(`Wiki 源稿检查失败：\n- ${failures.join("\n- ")}`);

const published = publish ? publishWiki([...markdownFiles, manifestFile, ...diskAssets].sort()) : false;
console.log(`Wiki 源稿检查通过：${markdownFiles.length} 个页面、${manifestScenes.length} 张长期截图、${Object.keys(API_METHODS).length} 个 API 命名空间；内部链接、图片图注和三方资产集合无缺失。${publish ? (published ? "已推送远端。" : "远端内容无变化。") : ""}`);

function validateManifest(document, errors) {
  if (!document || typeof document !== "object") return [];
  if (document.schemaVersion !== 1) errors.push(`${manifestFile} schemaVersion 必须为 1`);
  if (document.capture?.seed !== "mountains-and-seas") errors.push(`${manifestFile} seed 必须为 mountains-and-seas`);
  if (document.capture?.cellsTarget !== 10000) errors.push(`${manifestFile} cellsTarget 必须为 10000`);
  if (document.capture?.heightmapTemplate !== "continents") errors.push(`${manifestFile} heightmapTemplate 必须为 continents`);
  if (document.capture?.browser !== "isolated-system-chrome") errors.push(`${manifestFile} 必须声明隔离系统 Chrome`);
  if (document.capture?.source !== "production-dist") errors.push(`${manifestFile} 必须声明 production dist`);
  const viewport = document.capture?.viewport;
  if (viewport?.width !== 1440 || viewport?.height !== 960 || viewport?.deviceScaleFactor !== 1) {
    errors.push(`${manifestFile} viewport 必须为 1440×960 @ DPR 1`);
  }
  if (!Array.isArray(document.scenes) || document.scenes.length < 10) {
    errors.push(`${manifestFile} 至少需要 10 个场景`);
    return [];
  }
  const ids = new Set();
  const files = new Set();
  const scenes = [];
  for (const scene of document.scenes) {
    const id = String(scene?.id || "").trim();
    const file = normalizeAssetPath(scene?.file);
    const alt = String(scene?.alt || "").trim();
    const caption = String(scene?.caption || "").trim();
    if (!/^wiki-\d{2}$/u.test(id)) errors.push(`${manifestFile} 场景 id 不稳定：${id || "(empty)"}`);
    if (ids.has(id)) errors.push(`${manifestFile} 场景 id 重复：${id}`);
    ids.add(id);
    if (!/^assets\/[^/]+\.png$/iu.test(file)) errors.push(`${manifestFile} 图片必须直接位于 assets/：${scene?.file || "(empty)"}`);
    if (files.has(file)) errors.push(`${manifestFile} 图片重复：${file}`);
    files.add(file);
    if (alt.length < 8 || /^(?:截图|图片|示意图)$/u.test(alt)) errors.push(`${id} 缺少描述性 alt`);
    if (!/^图：\S/u.test(caption)) errors.push(`${id} 图注必须以“图：”开头`);
    if (!String(scene?.title || "").trim()) errors.push(`${id} 缺少场景标题`);
    if (!String(scene?.viewMode || "").trim()) errors.push(`${id} 缺少专题视图`);
    if (!Array.isArray(scene?.visibleLayers)) errors.push(`${id} 缺少图层清单`);
    if (scene?.clip) {
      for (const key of ["x", "y", "width", "height"]) {
        const minimum = key === "width" || key === "height" ? 1 : 0;
        if (!Number.isInteger(scene.clip[key]) || scene.clip[key] < minimum) errors.push(`${id} clip.${key} 无效`);
      }
      if (scene.clip.x + scene.clip.width > viewport.width || scene.clip.y + scene.clip.height > viewport.height) errors.push(`${id} clip 超出 viewport`);
    }
    scenes.push({...scene, id, file, alt, caption});
  }
  return scenes;
}

function auditImages(markdownFile, content, references, errors, scenesByFile) {
  const lines = content.split(/\r?\n/u);
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const matches = [...line.matchAll(imagePattern)];
    for (const match of matches) {
      if (line.trim() !== match[0]) errors.push(`${markdownFile}:${index + 1} 图片必须独占一行`);
      const alt = String(match[1] || "").trim();
      const target = normalizeImageReference(markdownFile, match[2], errors, index + 1);
      if (!target) continue;
      references.add(target);
      if (alt.length < 8 || /^(?:截图|图片|示意图)$/u.test(alt)) errors.push(`${markdownFile}:${index + 1} 图片缺少描述性 alt`);

      let captionIndex = index + 1;
      if (!String(lines[captionIndex] || "").trim()) captionIndex += 1;
      const captionLine = lines[captionIndex] || "";
      const captionMatch = captionLine.match(/^\s*(?:\*([^*]+)\*|_([^_]+)_)\s*$/u);
      const caption = String(captionMatch?.[1] || captionMatch?.[2] || "").trim();
      if (!caption || captionIndex > index + 2) errors.push(`${markdownFile}:${index + 1} 图片后必须紧邻斜体图注`);
      else if (caption.length < 8) errors.push(`${markdownFile}:${captionIndex + 1} 图注过于简略`);
      const scene = scenesByFile.get(target);
      if (scene && alt !== scene.alt) errors.push(`${markdownFile}:${index + 1} 图片 alt 与 manifest 不一致：${target}`);
      if (scene && caption && caption !== scene.caption) errors.push(`${markdownFile}:${captionIndex + 1} 图片图注与 manifest 不一致：${target}`);
    }
  }
}

function auditDomainNavigation(errors) {
  const sidebar = readWikiFile("_Sidebar.md");
  const home = readWikiFile("Home.md");
  const overview = readWikiFile("功能与领域总览.md");
  const matrix = readWikiFile("能力覆盖矩阵.md");
  for (const page of domainPages) {
    const linkPattern = `\\]\\(${escapeRegExp(page)}\\)`;
    if (countMatches(sidebar, new RegExp(linkPattern, "gu")) !== 1) errors.push(`侧栏核心领域页入口不是唯一一个：${page}`);
    if (!new RegExp(linkPattern, "u").test(home)) errors.push(`首页缺少核心领域页入口：${page}`);
    if (!new RegExp(linkPattern, "u").test(overview)) errors.push(`功能总览缺少核心领域页入口：${page}`);
    if (!new RegExp(linkPattern, "u").test(matrix)) errors.push(`能力矩阵缺少核心领域页入口：${page}`);
  }
  if (/\]\(气候与降水\)/u.test(sidebar) || /\]\(气候与降水\)/u.test(home)) {
    errors.push("兼容重定向页“气候与降水”不得占用侧栏或首页主导航");
  }
}

function auditUiCoverage(matrix, errors) {
  let controlPanelSource = "";
  let runtimeAppSource = "";
  try {
    controlPanelSource = readFileSync(controlPanelPath, "utf8");
    runtimeAppSource = readFileSync(runtimeAppPath, "utf8");
  } catch (error) {
    errors.push(`无法读取 UI 分母来源：${error.message}`);
    return;
  }

  const tabSource = sliceBetween(controlPanelSource, "const tabs", "const terrainTemplates");
  const tabIdSource = sliceBetween(controlPanelSource, "const CONTROL_PANEL_TAB_IDS", "const activeTab");
  const themeSource = sliceBetween(controlPanelSource, "const themes", "const layerGroups");
  const layerSource = sliceBetween(controlPanelSource, "const layerGroups", "const layers");
  const managementSource = sliceBetween(controlPanelSource, "const managementGroups", "function managementGroup");
  const tabs = [...tabSource.matchAll(/\{id:\s*"([^"]+)",\s*label:\s*"([^"]+)"\}/gu)].map(match => ({id: match[1], label: match[2]}));
  const tabIds = [...tabIdSource.matchAll(/"([^"]+)"/gu)].map(match => match[1]);
  const themes = [...themeSource.matchAll(/\{value:\s*"([^"]+)",\s*label:\s*"([^"]+)"\}/gu)].map(match => ({id: match[1], label: match[2]}));
  const layerGroups = [...layerSource.matchAll(/layerGroup\("([^"]+)",\s*"([^"]+)",\s*\[/gu)].map(match => ({id: match[1], label: match[2]}));
  const layerToggles = [...layerSource.matchAll(/\{id:\s*"([^"]+)",\s*label:\s*"([^"]+)"(?:,\s*layers:\s*\[([^\]]+)\])?/gu)].map(match => ({
    id: match[1],
    label: match[2],
    members: match[3] ? [...match[3].matchAll(/"([^"]+)"/gu)].map(member => member[1]) : [match[1]]
  }));
  const managementGroups = [...managementSource.matchAll(/managementGroup\("([^"]+)",\s*"([^"]+)"/gu)].map(match => ({id: match[1], label: match[2]}));
  const managementActions = [...managementSource.matchAll(/\["(open-[^"]+)",\s*"([^"]+)"\]/gu)].map(match => ({id: match[1], label: match[2]}));
  const registeredPanels = readRegisteredPanels(errors);
  const uiCounts = {
    tabs: tabs.length,
    themes: themes.length,
    layerGroups: layerGroups.length,
    layerToggles: layerToggles.length,
    managementGroups: managementGroups.length,
    managementActions: managementActions.length,
    registeredPanels: registeredPanels.ids.size
  };
  const expected = {tabs: 7, themes: 12, layerGroups: 5, layerToggles: 22, managementGroups: 5, managementActions: 24, registeredPanels: 29};
  for (const [key, value] of Object.entries(expected)) {
    if (uiCounts[key] !== value) errors.push(`当前 UI 分母漂移：${key}=${uiCounts[key]}，应为 ${value}`);
  }
  auditUniqueIds("控制面板页签", tabs.map(item => item.id), errors);
  if (!sameOrderedValues(tabs.map(item => item.id), tabIds)) errors.push("控制面板页签定义与 CONTROL_PANEL_TAB_IDS 不一致");
  auditUniqueIds("专题视图", themes.map(item => item.id), errors);
  if (!sameOrderedValues(themes.map(item => item.id), [...HOVER_VIEW_MODES])) errors.push("专题视图与悬停信息专题分母不一致");
  auditUniqueIds("图层组", layerGroups.map(item => item.id), errors);
  auditUniqueIds("可见图层开关", layerToggles.map(item => item.id), errors);
  const layerMembers = new Set(layerToggles.flatMap(item => item.members));
  for (const layer of layerMembers) if (!Object.hasOwn(DEFAULT_LAYER_VISIBILITY, layer)) errors.push(`可见图层缺少默认状态：${layer}`);
  const compatibilityOnlyLayers = Object.keys(DEFAULT_LAYER_VISIBILITY).filter(layer => !layerMembers.has(layer)).sort();
  if (!sameOrderedValues(compatibilityOnlyLayers, ["lakeShore", "population", "tradeFlows"])) errors.push(`图层默认状态与 22 个可见开关的差集漂移：${compatibilityOnlyLayers.join("、")}`);
  auditUniqueIds("管理组", managementGroups.map(item => item.id), errors);
  auditUniqueIds("管理入口", managementActions.map(item => item.id), errors);
  const managementPanelIds = new Set(managementActions.map(item => item.id.slice("open-".length)));
  for (const id of managementPanelIds) if (!registeredPanels.ids.has(id)) errors.push(`管理入口没有对应注册面板：${id}`);
  const additionalPanelIds = [...registeredPanels.ids].filter(id => !managementPanelIds.has(id)).sort();
  if (!sameOrderedValues(additionalPanelIds, ["cloud-storage-panel", "development-panel", "emblem-panel", "generation-panel", "object-details"])) {
    errors.push(`普通管理入口外的注册面板集合漂移：${additionalPanelIds.join("、")}`);
  }
  const runtimeFactories = new Set([...runtimeAppSource.matchAll(/\b(create[A-Z][A-Za-z]+Panel)\(/gu)].map(match => match[1]));
  const missingFactories = [...registeredPanels.factories].filter(name => !runtimeFactories.has(name)).sort();
  if (missingFactories.length) errors.push(`注册面板未在运行时实例化：${missingFactories.join("、")}`);
  auditManagementDomainHeadings(managementActions, errors);

  const matrixRows = [
    ["控制面板顶层页签", `${uiCounts.tabs}`],
    ["专题视图", `${uiCounts.themes}`],
    ["图层组 / 可见开关", `${uiCounts.layerGroups} / ${uiCounts.layerToggles}`],
    ["管理组 / 普通用户入口", `${uiCounts.managementGroups} / ${uiCounts.managementActions}`],
    ["注册浮动面板", `${uiCounts.registeredPanels}`]
  ];
  for (const [label, count] of matrixRows) {
    if (!new RegExp(`\\| ${escapeRegExp(label)} \\| ${escapeRegExp(count)} \\|`).test(matrix)) errors.push(`能力矩阵 UI 分母不符：${label}=${count}`);
  }

  try {
    execFileSync(process.execPath, [informationArchitectureRegressionPath], {cwd: rootDir, stdio: "pipe"});
  } catch (error) {
    const detail = String(error.stderr || error.message || "").trim();
    errors.push(`控制面板信息架构回归失败：${detail || "未知错误"}`);
  }
}

function readRegisteredPanels(errors) {
  const ids = new Set();
  const factories = new Set();
  for (const entry of readdirSync(panelDirectory, {withFileTypes: true})) {
    if (!entry.isFile() || !entry.name.endsWith("-panel.js")) continue;
    const content = readFileSync(join(panelDirectory, entry.name), "utf8");
    const call = content.match(/manager\.registerPanel\(\s*(?:["']([^"']+)["']|([A-Z][A-Z0-9_]*))/u);
    if (!call) continue;
    let id = call[1] || "";
    if (!id && call[2]) {
      const declaration = content.match(new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(call[2])}\\s*=\\s*["']([^"']+)["']`, "u"));
      id = declaration?.[1] || "";
    }
    if (!id) {
      errors.push(`${entry.name} 无法解析 registerPanel id`);
      continue;
    }
    if (ids.has(id)) errors.push(`注册面板 id 重复：${id}`);
    ids.add(id);
    const factory = content.match(/export\s+(?:async\s+)?function\s+(create[A-Z][A-Za-z]+Panel)\s*\(/u)?.[1];
    if (!factory) errors.push(`${entry.name} 无法解析面板工厂`);
    else factories.add(factory);
  }
  return {ids, factories};
}

function auditManagementDomainHeadings(actions, errors) {
  const pages = domainPages.map(page => ({
    page,
    headings: [...readWikiFile(`${page}.md`).matchAll(/^##\s+(.+)$/gmu)].map(match => match[1].trim())
  }));
  for (const action of actions) {
    const matches = pages.filter(page => page.headings.some(heading => heading.includes(action.label)));
    if (matches.length !== 1) errors.push(`管理入口“${action.label}”没有唯一核心领域章节：${matches.map(item => item.page).join("、") || "无"}`);
  }
}

function auditUniqueIds(label, values, errors) {
  const unique = new Set(values);
  if (unique.size !== values.length) errors.push(`${label}存在重复 id`);
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeImageReference(markdownFile, rawTarget, errors, line) {
  const decoded = decodeTarget(rawTarget, markdownFile, line, errors);
  if (!decoded) return null;
  if (/^(?:https?:|data:|mailto:)/iu.test(decoded)) {
    errors.push(`${markdownFile}:${line} Wiki 图片必须使用本地 assets/ 相对路径`);
    return null;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(markdownFile), decoded.replace(/^\.\//u, "")));
  if (resolved.startsWith("../") || !resolved.startsWith("assets/") || !resolved.toLowerCase().endsWith(".png")) {
    errors.push(`${markdownFile}:${line} 图片必须指向 Wiki 的 assets/*.png：${decoded}`);
    return null;
  }
  return resolved;
}

function createPublishedMarkdown(markdownFile, content) {
  return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, (match, alt, rawTarget, offset) => {
    const localErrors = [];
    const line = content.slice(0, offset).split(/\r?\n/u).length;
    const asset = normalizeImageReference(markdownFile, rawTarget, localErrors, line);
    if (!asset || localErrors.length) return match;
    return `![${alt}](${publishedAssetBase}/${encodeURI(asset)})`;
  });
}

function auditPublishedImages(markdownFile, content, errors) {
  for (const match of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = String(match[1] || "").trim().replace(/^<|>$/gu, "");
    const line = content.slice(0, match.index).split(/\r?\n/u).length;
    if (!target.startsWith(`${publishedAssetBase}/assets/`) || !target.toLowerCase().endsWith(".png")) {
      errors.push(`${markdownFile}:${line} 发布态图片未转换为 Wiki raw 地址：${target}`);
    }
  }
}

function auditInternalLinks(markdownFile, content, files, errors) {
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    if (match.index > 0 && content[match.index - 1] === "!") continue;
    const target = decodeTarget(match[1], markdownFile, content.slice(0, match.index).split(/\r?\n/u).length, errors);
    if (!target || /^(?:https?:|mailto:)/iu.test(target) || target.startsWith("#")) continue;
    const withoutAnchor = target.split("#")[0].split("?")[0];
    if (!withoutAnchor) continue;
    const withExtension = withoutAnchor.endsWith(".md") ? withoutAnchor : `${withoutAnchor}.md`;
    const relative = posix.normalize(posix.join(posix.dirname(markdownFile), withExtension.replace(/^\.\//u, "")));
    if (relative.startsWith("../") || !files.has(relative)) errors.push(`${markdownFile} 指向不存在页面 ${withoutAnchor}`);
  }
}

function decodeTarget(rawTarget, markdownFile, line, errors) {
  const stripped = String(rawTarget || "").trim().replace(/^<|>$/gu, "");
  try {
    return decodeURIComponent(stripped).replace(/\\/gu, "/");
  } catch {
    errors.push(`${markdownFile}:${line} 包含无法解码的链接：${stripped}`);
    return "";
  }
}

function normalizeAssetPath(value) {
  return posix.normalize(String(value || "").trim().replace(/^\.\//u, "").replace(/\\/gu, "/"));
}

function auditSetDifference(label, left, right, errors) {
  const difference = [...left].filter(item => !right.has(item)).sort();
  if (difference.length) errors.push(`${label}：${difference.join("、")}`);
}

function inspectPng(path, errors) {
  const bytes = readFileSync(path);
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    errors.push(`${relativeWikiPath(path)} 不是有效 PNG`);
    return null;
  }
  return {bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

function listFiles(root, prefix = "") {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function readWikiFile(relative) {
  return readFileSync(join(source, ...relative.split("/")), "utf8");
}

function relativeWikiPath(path) {
  return path.slice(source.length + 1).replace(/\\/gu, "/");
}

function publishWiki(files) {
  const remote = "https://github.com/mosuzi/WebGL-Fantasy-Map-Generator.wiki.git";
  const work = mkdtempSync(join(tmpdir(), "fmg-wiki-"));
  try {
    execFileSync("git", ["clone", remote, work], {stdio: "inherit"});
    for (const existing of readdirSync(work)) {
      if (existing === ".git") continue;
      const target = join(work, existing);
      if (!resolve(target).startsWith(`${resolve(work)}${sep}`) && resolve(target) !== resolve(work)) throw new Error(`拒绝清理临时 Wiki 以外：${target}`);
      rmSync(target, {recursive: true, force: true});
    }
    for (const name of files) {
      const from = join(source, ...name.split("/"));
      const to = join(work, ...name.split("/"));
      mkdirSync(dirname(to), {recursive: true});
      if (name.endsWith(".md")) writeFileSync(to, createPublishedMarkdown(name, readFileSync(from, "utf8")), "utf8");
      else cpSync(from, to, {recursive: false});
    }
    execFileSync("git", ["add", "--all"], {cwd: work, stdio: "inherit"});
    const changed = execFileSync("git", ["status", "--porcelain"], {cwd: work, encoding: "utf8"}).trim();
    if (!changed) return false;
    execFileSync("git", ["-c", "user.name=mosuzi", "-c", "user.email=mosuzi@users.noreply.github.com", "commit", "-m", "发布中文项目 Wiki"], {cwd: work, stdio: "inherit"});
    execFileSync("git", ["push", "origin", "HEAD:master"], {cwd: work, stdio: "inherit"});
    return true;
  } finally {
    if (existsSync(work)) rmSync(work, {recursive: true, force: true});
  }
}

function sliceBetween(content, startToken, endToken) {
  const start = content.indexOf(startToken);
  const end = content.indexOf(endToken, start + startToken.length);
  return start >= 0 && end > start ? content.slice(start, end) : "";
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
