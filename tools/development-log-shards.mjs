import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, readFile, readdir, stat, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const logPath = join(repoRoot, "docs", "development-log.md");
const shardDirectory = join(repoRoot, "docs", "development-logs");
const shardIndexPath = join(shardDirectory, "README.md");
const manifestPath = join(shardDirectory, "migration-manifest.json");
const migrate = process.argv.includes("--migrate");
const refreshIndex = process.argv.includes("--refresh-index");

if (migrate) await migrateLog();
else if (refreshIndex) await refreshIndexes();
const result = await checkShards();
console.log(JSON.stringify(result, null, 2));

async function migrateLog() {
  const source = await readFile(logPath, "utf8");
  assert.ok(source.length > 100_000, "development-log.md 已是轻量索引或不满足迁移前提");
  const parsed = parseSections(source);
  assert.ok(parsed.sections.length > 100, "没有识别到足够的日期段落，拒绝迁移");
  const buckets = new Map();
  for (const section of parsed.sections) {
    const bucket = bucketForDate(section.date);
    if (!buckets.has(bucket.filename)) buckets.set(bucket.filename, {...bucket, sections: []});
    buckets.get(bucket.filename).sections.push(section);
  }

  await mkdir(shardDirectory, {recursive: true});
  const shardRows = [];
  for (const bucket of [...buckets.values()].sort((left, right) => left.filename.localeCompare(right.filename))) {
    const header = `# 开发日志：${bucket.start} 至 ${bucket.end}\n\n> 本卷由第 327 项从旧开发总日志机械分卷；正文保持迁移前原文和原有相对顺序，只在需要追溯时定向读取。\n\n`;
    const body = bucket.sections.map(section => section.text.trimEnd()).join("\n\n") + "\n";
    const output = header + body;
    await writeFile(join(shardDirectory, bucket.filename), output, "utf8");
    shardRows.push({...bucket, bytes: Buffer.byteLength(output), count: bucket.sections.length});
  }

  const manifest = {
    version: 1,
    migratedAt: new Date().toISOString(),
    sourceBytes: Buffer.byteLength(source),
    sourceSha256: digest(source),
    sectionCount: parsed.sections.length,
    sections: parsed.sections.map((section, order) => ({
      order,
      date: section.date,
      shard: bucketForDate(section.date).filename,
      sha256: digest(section.text.trimEnd())
    }))
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(shardIndexPath, renderShardIndex(shardRows, manifest), "utf8");
  await writeFile(logPath, renderDevelopmentLogIndex(shardRows), "utf8");
}

async function refreshIndexes() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const filenames = (await readdir(shardDirectory)).filter(name => /^20\d{2}-\d{2}-\d{2}-to-(?:\d{2}|end)\.md$/u.test(name)).sort();
  const rows = [];
  for (const filename of filenames) {
    const path = join(shardDirectory, filename);
    const text = await readFile(path, "utf8");
    const parsed = parseSections(text);
    assert.ok(parsed.sections.length > 0, `${filename} 不含日期段落`);
    const bucket = bucketForDate(parsed.sections[0].date);
    rows.push({...bucket, bytes: (await stat(path)).size, count: parsed.sections.length});
  }
  await writeFile(shardIndexPath, renderShardIndex(rows, manifest), "utf8");
  await writeFile(logPath, renderDevelopmentLogIndex(rows), "utf8");
}

async function checkShards() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const filenames = (await readdir(shardDirectory)).filter(name => /^20\d{2}-\d{2}-\d{2}-to-(?:\d{2}|end)\.md$/u.test(name)).sort();
  assert.ok(filenames.length > 0, "开发日志分卷为空");
  const availableHashes = new Map();
  let sectionCount = 0;
  let totalBytes = 0;
  for (const filename of filenames) {
    const path = join(shardDirectory, filename);
    const text = await readFile(path, "utf8");
    totalBytes += (await stat(path)).size;
    const parsed = parseSections(text);
    for (const section of parsed.sections) {
      assert.equal(bucketForDate(section.date).filename, filename, `${section.date} 被写入错误分卷 ${filename}`);
      const hash = digest(section.text.trimEnd());
      availableHashes.set(hash, (availableHashes.get(hash) || 0) + 1);
      sectionCount++;
    }
  }

  const requiredHashes = new Map();
  for (const section of manifest.sections) requiredHashes.set(section.sha256, (requiredHashes.get(section.sha256) || 0) + 1);
  for (const [hash, count] of requiredHashes) assert.ok((availableHashes.get(hash) || 0) >= count, `迁移正文缺失：${hash}`);
  const index = await readFile(logPath, "utf8");
  const shardIndex = await readFile(shardIndexPath, "utf8");
  for (const filename of filenames) {
    assert.ok(index.includes(`development-logs/${filename}`), `总入口缺少 ${filename}`);
    assert.ok(shardIndex.includes(`./${filename}`), `分卷索引缺少 ${filename}`);
  }
  assert.ok(Buffer.byteLength(index) <= 16 * 1024, "development-log.md 仍不是轻量入口");
  return {ok: true, shards: filenames.length, sections: sectionCount, migratedSections: manifest.sectionCount, totalBytes};
}

function parseSections(source) {
  const pattern = /^#{1,3} (20\d{2}-\d{2}-\d{2})[^\n]*$/gmu;
  const matches = [...source.matchAll(pattern)];
  const first = matches[0]?.index ?? source.length;
  const sections = matches.map((match, index) => ({
    date: match[1],
    text: source.slice(match.index, matches[index + 1]?.index ?? source.length)
  }));
  return {prologue: source.slice(0, first).trim(), sections};
}

function bucketForDate(date) {
  const [year, month, rawDay] = date.split("-");
  const day = Number(rawDay);
  const [startDay, endDay, fileEnd] = day <= 7 ? [1, 7, "07"] : day <= 14 ? [8, 14, "14"] : day <= 21 ? [15, 21, "21"] : [22, null, "end"];
  const start = `${year}-${month}-${String(startDay).padStart(2, "0")}`;
  const end = endDay ? `${year}-${month}-${String(endDay).padStart(2, "0")}` : `${year}-${month} 月末`;
  return {filename: `${year}-${month}-${String(startDay).padStart(2, "0")}-to-${fileEnd}.md`, start, end};
}

function renderDevelopmentLogIndex(rows) {
  const items = rows.slice().reverse().map(row => `- [${row.start} 至 ${row.end}](./development-logs/${row.filename})：${row.count} 个日期段落，${row.bytes}B。`).join("\n");
  return `# 开发历史\n\n本文档用于记录项目推进历史、关键决策和已完成工作。\n\n本文件现在只作为轻量入口。当前任务先读 [docs 索引](./README.md) 与 [当前权威计划](./current-plan.md)，仅在追溯历史时按日期或关键词读取下面的分卷；不得把全部分卷作为普通任务前置上下文。\n\n## 日期分卷\n\n${items}\n\n完整分卷元数据与检索方法见 [开发日志分卷索引](./development-logs/README.md)。\n`;
}

function renderShardIndex(rows, manifest) {
  const table = rows.map(row => `| ${row.start} 至 ${row.end} | ${row.count} | ${row.bytes} | [查看](./${row.filename}) |`).join("\n");
  return `# 开发日志分卷索引\n\n开发日志按每月四个固定日期片分卷，只在追溯决策、验收或历史缺陷时定向读取。新增记录写入当前日期对应分卷，并在本表更新计数；不要重新合并为单一大文件。\n\n| 日期范围 | 日期段落 | 字节 | 文件 |\n| --- | ---: | ---: | --- |\n${table}\n\n## 迁移完整性\n\n- 迁移前原文件：${manifest.sourceBytes}B。\n- 迁移日期段落：${manifest.sectionCount}。\n- 原文件 SHA-256：\`${manifest.sourceSha256}\`。\n- [\`migration-manifest.json\`](./migration-manifest.json) 保存每段原文摘要；\`node tools/development-log-shards.mjs\` 会拒绝迁移正文缺失、重复分卷或日期落错卷。\n\n## 定向检索\n\n\`\`\`powershell\nrg -n "关键词|第 327 项" .\\docs\\development-logs\nrg -n "2026-08-13" .\\docs\\development-logs\\2026-08-08-to-14.md\n\`\`\`\n`;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
