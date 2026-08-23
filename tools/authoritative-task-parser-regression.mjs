import assert from "node:assert/strict";
import {parseTaskBlocks} from "./authoritative-task-parser.mjs";

const bullet = parseTaskBlocks(`## 任务条目

- **权威任务第 350 项：旧格式** \`已完成\`
  - **证据**：通过。
`, "bullet");
assert.equal(bullet.length, 1);
assert.equal(bullet[0].number, 350);
assert.equal(bullet[0].status, "已完成");

const heading = parseTaskBlocks(`## 权威任务清单

### 第 351 项：新格式 \`进行中\`

- **目标**：继续执行。

## 执行规则
`, "heading");
assert.equal(heading.length, 1);
assert.equal(heading[0].number, 351);
assert.equal(heading[0].status, "进行中");
assert.match(heading[0].archiveBlock, /^- \*\*权威任务第 351 项：新格式\*\* `进行中`/);
assert.match(heading[0].archiveBlock, /^  - \*\*目标\*\*/m);

assert.throws(() => parseTaskBlocks(`### 权威任务第 352 项：缺少状态\n`, "malformed"), /未识别任务标题/);

console.log(JSON.stringify({ok: true, bullet: bullet[0].number, heading: heading[0].number, failClosed: true}));
