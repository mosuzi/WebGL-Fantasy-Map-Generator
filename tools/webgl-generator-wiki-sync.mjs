import {cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, join, resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";

const source = resolve("docs/wiki");
const publish = process.argv.includes("--publish");
const files = readdirSync(source).filter(name => name.endsWith(".md")).sort();
const stems = new Set(files.map(name => basename(name, ".md")));
const required = ["Home", "_Sidebar", "能力覆盖矩阵", "地图数据与区域分析", "编辑器与安全修改", "存档与导入导出"];
const failures = [];

for (const page of required) if (!stems.has(page)) failures.push(`缺少页面 ${page}`);
for (const name of files) {
  const content = readFileSync(join(source, name), "utf8");
  if (!/^# /m.test(content) && name !== "_Sidebar.md") failures.push(`${name} 缺少一级标题`);
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = decodeURIComponent(match[1].split("#")[0]);
    if (!target || /^(https?:|mailto:)/.test(target) || target.includes("/")) continue;
    if (!stems.has(target.replace(/\.md$/, ""))) failures.push(`${name} 指向不存在页面 ${target}`);
  }
}

const matrix = readFileSync(join(source, "能力覆盖矩阵.md"), "utf8");
for (const [namespace, methods] of Object.entries(API_METHODS)) {
  if (!new RegExp(`\\| ${escapeRegExp(namespace)} \\| ${methods.length} \\|`).test(matrix)) failures.push(`能力矩阵缺少或方法数不符：${namespace}=${methods.length}`);
}
if (failures.length) throw new Error(`Wiki 源稿检查失败：\n- ${failures.join("\n- ")}`);

if (publish) publishWiki();
console.log(`Wiki 源稿检查通过：${files.length} 个页面、${Object.keys(API_METHODS).length} 个 API 命名空间，内部链接无缺失。${publish ? "已推送远端。" : ""}`);

function publishWiki() {
  const remote = "https://github.com/mosuzi/fmg-gl.wiki.git";
  const work = mkdtempSync(join(tmpdir(), "fmg-wiki-"));
  try {
    execFileSync("git", ["clone", remote, work], {stdio: "inherit"});
    for (const existing of readdirSync(work)) {
      if (existing === ".git") continue;
      rmSync(join(work, existing), {recursive: true, force: true});
    }
    for (const name of files) cpSync(join(source, name), join(work, name));
    execFileSync("git", ["add", "--", "*.md"], {cwd: work, stdio: "inherit"});
    const changed = execFileSync("git", ["status", "--porcelain"], {cwd: work, encoding: "utf8"}).trim();
    if (!changed) return;
    execFileSync("git", ["-c", "user.name=mosuzi", "-c", "user.email=mosuzi@users.noreply.github.com", "commit", "-m", "发布中文项目 Wiki"], {cwd: work, stdio: "inherit"});
    execFileSync("git", ["push", "origin", "HEAD:master"], {cwd: work, stdio: "inherit"});
  } finally {
    if (existsSync(work)) rmSync(work, {recursive: true, force: true});
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
