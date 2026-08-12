import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {access, readFile, stat, writeFile} from "node:fs/promises";
import {constants} from "node:fs";
import {homedir} from "node:os";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const rootBudget = 16 * 1024;
const pathBudget = 24 * 1024;
const skillMainBudget = 6 * 1024;
const targetPaths = [
  ".",
  "app/webgl-generator/src/runtime",
  "app/webgl-generator/src/renderer",
  "tools"
];
const skillRoot = resolve(args.skillsRoot || args["skills-root"] || join(process.env.CODEX_HOME || join(homedir(), ".codex"), "skills"));

const paths = await Promise.all(targetPaths.map(inspectInstructionPath));
const rootInstructions = paths[0].files[0];
const skills = await Promise.all([
  inspectSkill("run-lean-staged-delivery"),
  inspectSkill("four-officials-flow")
]);
const docs = await inspectDocuments();
const report = {
  generatedAt: new Date().toISOString(),
  mode: args.baseline ? "baseline" : "current",
  budgets: {rootBytes: rootBudget, pathBytes: pathBudget, skillMainBytes: skillMainBudget},
  paths,
  skills,
  docs
};

if (!args.baseline) verify(report);
if (args.report) await writeFile(resolve(repoRoot, args.report), renderMarkdown(report), "utf8");
console.log(JSON.stringify(report, null, 2));

async function inspectInstructionPath(relativeTarget) {
  const target = resolve(repoRoot, relativeTarget);
  assert.ok(target === repoRoot || target.startsWith(`${repoRoot}${sep}`), `目标路径越出仓库：${relativeTarget}`);
  const files = [];
  let current = target;
  while (current === repoRoot || current.startsWith(`${repoRoot}${sep}`)) {
    const candidate = join(current, "AGENTS.md");
    if (await exists(candidate)) files.push(await inspectTextFile(candidate));
    if (current === repoRoot) break;
    current = dirname(current);
  }
  files.reverse();
  return {
    target: normalizeRelative(target),
    files,
    cumulativeBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    cumulativeEstimatedTokens: files.reduce((sum, file) => sum + file.estimatedTokens, 0)
  };
}

async function inspectSkill(name) {
  const mainPath = join(skillRoot, name, "SKILL.md");
  const main = await inspectTextFile(mainPath, skillRoot);
  const text = await readFile(mainPath, "utf8");
  const referenceMatches = [...text.matchAll(/references\/[A-Za-z0-9._/-]+\.md/gu)].map(match => match[0]);
  const uniqueReferences = [...new Set(referenceMatches)];
  const references = [];
  for (const reference of uniqueReferences) references.push(await inspectTextFile(join(skillRoot, name, reference), skillRoot));
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u)?.[1] || "";
  return {
    name,
    main,
    references,
    frontmatterValid: new RegExp(`(?:^|\\n)name: ${escapeRegExp(name)}(?:\\n|$)`, "u").test(frontmatter) && /(?:^|\n)description: .+(?:\n|$)/u.test(frontmatter),
    referenceLinksValid: references.length === uniqueReferences.length
  };
}

async function inspectDocuments() {
  const routesPath = join(repoRoot, "docs", "README.md");
  const currentPlanPath = join(repoRoot, "docs", "current-plan.md");
  const currentArchivePath = join(repoRoot, "docs", "task-archives", "2026-08-08-to-2026-08-14.md");
  const developmentLogPath = join(repoRoot, "docs", "development-log.md");
  const shardIndexPath = join(repoRoot, "docs", "development-logs", "README.md");
  const handoffPath = join(repoRoot, "docs", "task-notes", "lean-stage-handoff-template.md");
  const taskNotesIndexPath = join(repoRoot, "docs", "task-notes", "README.md");
  const dryRunPath = join(repoRoot, "docs", "task-notes", "task-327-flow-dry-run.md");
  const routes = await readFile(routesPath, "utf8");
  const currentPlan = await readFile(currentPlanPath, "utf8");
  const currentArchive = await readFile(currentArchivePath, "utf8");
  const developmentIndex = await inspectTextFile(join(repoRoot, "docs", "development-log.md"));
  const linkedFiles = [join(repoRoot, "AGENTS.md"), routesPath, currentPlanPath, developmentLogPath, shardIndexPath, taskNotesIndexPath, handoffPath, dryRunPath];
  return {
    defaultRouteDeclared: routes.includes("AGENTS.md → docs/README.md → docs/current-plan.md → 定向 rg / 行段读取"),
    currentOrderDeclared: currentPlan.includes("323 → 324 → 326 → 328"),
    task327Archived: /权威任务第 327 项[^\n]+已完成/u.test(currentArchive),
    task322AbsentFromCurrent: !/权威任务第 322 项/u.test(currentPlan),
    developmentIndex,
    developmentShardIndexExists: await exists(shardIndexPath),
    handoffTemplateExists: await exists(handoffPath),
    relativeLinksValid: await validateRelativeLinks(linkedFiles)
  };
}

function verify(value) {
  assert.ok(rootInstructions.bytes <= rootBudget, `根 AGENTS.md 超过 ${rootBudget}B：${rootInstructions.bytes}B`);
  for (const entry of value.paths) assert.ok(entry.cumulativeBytes <= pathBudget, `${entry.target} 累计项目说明超过 ${pathBudget}B：${entry.cumulativeBytes}B`);
  for (const skill of value.skills) {
    assert.ok(skill.main.bytes <= skillMainBudget, `${skill.name}/SKILL.md 超过 ${skillMainBudget}B：${skill.main.bytes}B`);
    assert.ok(skill.references.length > 0, `${skill.name} 缺少按需 reference 路由`);
    assert.equal(skill.frontmatterValid, true, `${skill.name} frontmatter 无效`);
    assert.equal(skill.referenceLinksValid, true, `${skill.name} reference 链接无效`);
  }
  assert.equal(value.docs.defaultRouteDeclared, true, "docs/README.md 未声明默认定向读取链");
  assert.equal(value.docs.currentOrderDeclared, true, "docs/current-plan.md 未声明当前固定顺序");
  assert.equal(value.docs.task327Archived, true, "第 327 项未进入完成归档");
  assert.equal(value.docs.task322AbsentFromCurrent, true, "已完成第 322 项仍留在当前计划");
  assert.equal(value.docs.developmentShardIndexExists, true, "开发日志分卷索引不存在");
  assert.equal(value.docs.handoffTemplateExists, true, "精简阶段 handoff 模板不存在");
  assert.equal(value.docs.relativeLinksValid, true, "上下文治理入口存在失效相对链接");
  assert.ok(value.docs.developmentIndex.bytes <= rootBudget, `开发日志入口仍过大：${value.docs.developmentIndex.bytes}B`);
}

async function inspectTextFile(path, displayRoot = repoRoot) {
  const text = await readFile(path, "utf8");
  const info = await stat(path);
  return {
    path: normalizeRelative(path, displayRoot),
    bytes: info.size,
    characters: [...text].length,
    estimatedTokens: estimateTokens(text),
    sha256: createHash("sha256").update(text).digest("hex")
  };
}

function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) cjk++;
    else if (!/\s/u.test(character)) other++;
  }
  return cjk + Math.ceil(other / 4);
}

function renderMarkdown(value) {
  const rows = value.paths.map(entry => `| \`${entry.target}\` | ${entry.files.map(file => `\`${file.path}\``).join(" + ")} | ${entry.cumulativeBytes} | ${entry.cumulativeEstimatedTokens} |`).join("\n");
  const skillRows = value.skills.map(skill => `| \`${skill.name}\` | ${skill.main.bytes} | ${skill.main.estimatedTokens} | ${skill.references.length} | \`${skill.main.sha256.slice(0, 12)}\` |`).join("\n");
  return `# 第 327 项上下文预算${value.mode === "baseline" ? "改造前" : "改造后"}报告\n\n` +
    `生成时间：${value.generatedAt}\n\n` +
    `估算口径：中日韩字符按 1 token，其它非空白字符按 4 字符约 1 token；硬门以 UTF-8 字节数为准。\n\n` +
    `## 项目说明自动注入\n\n| 任务路径 | 自动注入文件 | 累计字节 | 估算 token |\n| --- | --- | ---: | ---: |\n${rows}\n\n` +
    `硬门：根说明不超过 ${value.budgets.rootBytes}B，普通路径累计不超过 ${value.budgets.pathBytes}B。\n\n` +
    `## 通用 Skill\n\n| Skill | 主入口字节 | 估算 token | 按需 reference 数 | SHA-256 前缀 |\n| --- | ---: | ---: | ---: | --- |\n${skillRows}\n\n` +
    `## 文档入口\n\n- 默认读取链：${value.docs.defaultRouteDeclared ? "已声明" : "未声明"}\n` +
    `- 当前固定顺序：${value.docs.currentOrderDeclared ? "已声明" : "未声明"}\n` +
    `- 第 327 项已归档 / 第 322 项已离开当前清单：${value.docs.task327Archived && value.docs.task322AbsentFromCurrent ? "是" : "否"}\n` +
    `- 开发日志入口：${value.docs.developmentIndex.bytes}B\n` +
    `- 开发日志分卷索引：${value.docs.developmentShardIndexExists ? "存在" : "不存在"}\n` +
    `- 阶段 handoff 模板：${value.docs.handoffTemplateExists ? "存在" : "不存在"}\n` +
    `- 入口相对链接：${value.docs.relativeLinksValid ? "有效" : "失效"}\n`;
}

function normalizeRelative(path, base = repoRoot) {
  const value = relative(base, path).replaceAll("\\", "/");
  return value || ".";
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function validateRelativeLinks(paths) {
  for (const path of paths) {
    if (!(await exists(path))) return false;
    const text = await readFile(path, "utf8");
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1].trim().replace(/^<|>$/gu, "").split("#", 1)[0];
      if (!target || /^(?:[a-z]+:|\/)/iu.test(target)) continue;
      if (!(await exists(resolve(dirname(path), decodeURIComponent(target))))) return false;
    }
  }
  return true;
}

function parseArgs(values) {
  const parsed = {};
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const [key, raw = "true"] = value.slice(2).split("=", 2);
    parsed[key] = raw === "true" ? true : raw;
  }
  return parsed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
