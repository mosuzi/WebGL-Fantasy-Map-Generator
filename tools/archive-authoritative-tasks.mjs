import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const currentPlanPath = path.join(root, "docs", "current-plan.md");
const archiveDir = path.join(root, "docs", "task-archives");
const checkOnly = process.argv.includes("--check");
const dateArg = process.argv.find(argument => argument.startsWith("--date="))?.slice(7) ?? "";
const statusDate = dateArg || new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Shanghai"}).format(new Date());

const historicalPartitions = [
  {
    file: "2026-07-08-to-2026-07-19.md",
    title: "2026-07-08 至 2026-07-19 权威任务归档",
    range: "第 45～107 项",
    from: 45,
    to: 107,
    note: "第 45～63 项在迁移前的当前计划中只有合并完成门禁，没有逐项标准条目；第 53 项已移除。其余标准条目从第 64 项开始原文归档。",
  },
  {
    file: "2026-07-20-to-2026-07-25.md",
    title: "2026-07-20 至 2026-07-25 权威任务归档",
    range: "第 108～203 项",
    from: 108,
    to: 203,
  },
  {
    file: "2026-07-26-to-2026-07-31.md",
    title: "2026-07-26 至 2026-07-31 权威任务归档",
    range: "第 204～228 项",
    from: 204,
    to: 228,
  },
  {
    file: "2026-08-01-to-2026-08-07.md",
    title: "2026-08-01 至 2026-08-07 权威任务归档",
    range: "第 229～299 项中的已完成或已取代条目",
    from: 229,
    to: 299,
    note: "首轮归档时第 284、298 项仍为暂缓任务，未进入本卷；其后若完成，必须按实际完成日期进入新时间卷。",
  },
];

function parseTaskBlocks(markdown, source) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const tasks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^- \*\*权威任务第 (\d+) 项：(.+?)\*\* `([^`]+)`/);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() && !line.startsWith("  ")) break;
      end += 1;
    }
    tasks.push({
      number: Number(match[1]),
      title: match[2],
      status: match[3],
      block: lines.slice(index, end).join("\n").trimEnd(),
      source,
    });
    index = end - 1;
  }
  return tasks;
}

function isActive(task) {
  if (/已完成|Completed|完成统一验收|纠错完成|梳理完成|取代|移除/.test(task.status)) return false;
  return true;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("归档新完成任务时必须传入 --date=YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`无效日期：${value}`);
  }
  return {year, month, day};
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function rollingPartition(value) {
  const {year, month, day} = parseDate(value);
  const start = day <= 7 ? 1 : day <= 14 ? 8 : day <= 21 ? 15 : 22;
  const end = start === 22 ? daysInMonth(year, month) : start + 6;
  const from = formatDate(year, month, start);
  const to = formatDate(year, month, end);
  return {
    file: `${from}-to-${to}.md`,
    title: `${from} 至 ${to} 权威任务归档`,
    range: "本时间片内完成的权威任务",
    from: Number.POSITIVE_INFINITY,
    to: Number.POSITIVE_INFINITY,
  };
}

function partitionFor(task) {
  if (task.number === 284 || task.number === 298) return rollingPartition(dateArg);
  const historical = historicalPartitions.find(partition => task.number >= partition.from && task.number <= partition.to);
  if (historical) return historical;
  return rollingPartition(dateArg);
}

function readTasks(file) {
  if (!fs.existsSync(file)) return [];
  return parseTaskBlocks(fs.readFileSync(file, "utf8"), path.relative(root, file));
}

function renderArchive(partition, tasks) {
  const note = partition.note ? `\n- 特别说明：${partition.note}` : "";
  return `# ${partition.title}

本卷保存 ${partition.range} 的历史权威任务正文。当前可执行任务仍以 [当前开发计划](../current-plan.md) 为唯一权威来源。

- 归档条目数：${tasks.length}
- 排序方式：按权威任务编号升序
- 状态边界：只收录已完成、已移除或已由后续方案取代的条目；未完成与暂缓项不得进入归档。${note}

## 任务条目

${tasks.map(task => task.block).join("\n\n")}
`;
}

function renderIndex(partitionsWithTasks, activeTasks) {
  const rows = partitionsWithTasks
    .filter(({tasks}) => tasks.length)
    .map(({partition, tasks}) => `| ${partition.file.slice(0, 10)} 至 ${partition.file.slice(14, 24)} | ${partition.range} | ${tasks.length} | [查看](./${partition.file}) |`)
    .join("\n");
  const active = activeTasks.length
    ? activeTasks.map(task => `第 ${task.number} 项（${task.status}）`).join("、")
    : "无";
  return `# 权威任务归档索引

已完成的权威任务按时间分卷保存在本目录；[当前开发计划](../current-plan.md) 只保留未完成或暂缓任务。接手执行时先读当前计划，需要追溯决策时再按日期或编号进入归档。

## 分卷

| 时间范围 | 任务范围 | 标准条目数 | 文档 |
|---|---|---:|---|
${rows}

当前未归档任务：${active}。

## 查找方式

~~~powershell
rg -n "权威任务第 217 项" .\\docs\\task-archives
rg -n "省会|城镇图标" .\\docs\\task-archives
~~~

## 后续归档规则

1. 新任务先登记在 docs/current-plan.md，完成前不得进入本目录。
2. 完成后把完整任务条目移入完成日期所在的时间卷，并从当前计划移除；默认按每月 1～7、8～14、15～21、22～月末分卷，绝不跨月。
3. 某一时间卷明显过大时，可在不打乱任务时间顺序的前提下继续按自然周或执行批次拆分，不得把所有历史重新合成一个总文件。
4. 每次归档必须更新本索引、当前计划执行门禁、docs/development-log.md 和接手说明，并运行归档检查与 git diff --check。
5. 第 45～63 项在本次结构化迁移前只有合并门禁；其更早的逐步执行记录继续从 docs/development-log.md、Git 历史和 docs/plan-backups/2026-07-08-reset-current-plan/ 追溯，不补造不存在的标准条目。

## 检查命令

~~~powershell
node .\\tools\\archive-authoritative-tasks.mjs --check
~~~
`;
}

function renderCurrentPlan(activeTasks, apiBaseline) {
  const activeSummary = activeTasks.map(task => `第 ${task.number} 项`).join("、") || "无";
  const activeBoundary = activeTasks.length
    ? `${activeTasks.map(task => `第 ${task.number} 项保持其条目所列授权边界`).join("；")}。`
    : "当前没有可执行或暂缓的权威任务。";
  return `# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（${statusDate}）**：当前未归档任务为${activeSummary}。${activeBoundary}第 53 项已移除，第 278 项已由第 279 项取代，其余既有完成状态见归档索引。

${apiBaseline}

## 权威任务清单

${activeTasks.map(task => task.block).join("\n\n")}

## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
`;
}

const currentMarkdown = fs.readFileSync(currentPlanPath, "utf8");
const currentTasks = parseTaskBlocks(currentMarkdown, "docs/current-plan.md");
const activeTasks = currentTasks.filter(isActive).sort((left, right) => left.number - right.number);
const completedTasks = currentTasks.filter(task => !isActive(task));
const apiBaseline = currentMarkdown
  .replaceAll("\r\n", "\n")
  .split("\n")
  .find(line => line.startsWith("当前 API 基线为："));
if (!apiBaseline) throw new Error("当前计划缺少 API 基线，拒绝归档");

const partitionMap = new Map();
for (const partition of historicalPartitions) partitionMap.set(partition.file, {partition, tasks: readTasks(path.join(archiveDir, partition.file))});
if (fs.existsSync(archiveDir)) {
  for (const file of fs.readdirSync(archiveDir).filter(name => /^\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.md$/.test(name))) {
    if (partitionMap.has(file)) continue;
    const from = file.slice(0, 10);
    const to = file.slice(14, 24);
    const partition = {
      file,
      title: `${from} 至 ${to} 权威任务归档`,
      range: "本时间片内完成的权威任务",
      from: Number.POSITIVE_INFINITY,
      to: Number.POSITIVE_INFINITY,
    };
    partitionMap.set(file, {partition, tasks: readTasks(path.join(archiveDir, file))});
  }
}
for (const task of completedTasks) {
  const partition = partitionFor(task);
  if (!partitionMap.has(partition.file)) {
    partitionMap.set(partition.file, {partition, tasks: readTasks(path.join(archiveDir, partition.file))});
  }
  const entry = partitionMap.get(partition.file);
  entry.tasks = entry.tasks.filter(existing => existing.number !== task.number);
  entry.tasks.push(task);
}

const partitionsWithTasks = [...partitionMap.values()]
  .map(entry => ({...entry, tasks: entry.tasks.sort((left, right) => left.number - right.number)}))
  .filter(entry => entry.tasks.length);

const allTasks = [...activeTasks, ...partitionsWithTasks.flatMap(entry => entry.tasks)];
const duplicates = allTasks.filter((task, index) => allTasks.findIndex(candidate => candidate.number === task.number) !== index);
const activeInArchives = partitionsWithTasks.flatMap(entry => entry.tasks).filter(isActive);
if (duplicates.length) throw new Error(`任务编号重复：${[...new Set(duplicates.map(task => task.number))].join(", ")}`);
if (activeInArchives.length) throw new Error(`归档含未完成任务：${activeInArchives.map(task => task.number).join(", ")}`);
if (currentTasks.length && !activeTasks.length && !completedTasks.length) throw new Error("没有识别到可处理任务");

if (!checkOnly) {
  fs.mkdirSync(archiveDir, {recursive: true});
  for (const {partition, tasks} of partitionsWithTasks) {
    fs.writeFileSync(path.join(archiveDir, partition.file), renderArchive(partition, tasks), "utf8");
  }
  fs.writeFileSync(path.join(archiveDir, "README.md"), renderIndex(partitionsWithTasks, activeTasks), "utf8");
  fs.writeFileSync(currentPlanPath, renderCurrentPlan(activeTasks, apiBaseline), "utf8");
}

console.log(JSON.stringify({
  mode: checkOnly ? "check" : "archive",
  currentTasks: activeTasks.map(task => task.number),
  archivedTasks: partitionsWithTasks.reduce((total, entry) => total + entry.tasks.length, 0),
  archiveFiles: partitionsWithTasks.map(entry => entry.partition.file),
  duplicates: 0,
  activeInArchives: 0,
}, null, 2));
