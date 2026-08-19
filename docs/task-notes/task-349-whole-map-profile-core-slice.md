# 第 349-10f 阶段：整图 profile 核心切片

## 冻结范围

本阶段只收口 generation、import、adoption handoff、persistence export 和隔离 headless write 的跨边界协议。既有 `state.map`、`MapRevisionTracker`、MapWorker adoption session、renderer prepared install 与 runtime operation rollback 仍是唯一正式 owner；本阶段不删除 legacy adapter，不改变生成算法、地图格式或产品语义。

## Owner 与事务终态

| profile | 真实 task / result | owner | 终态 |
| --- | --- | --- | --- |
| generation-adoption | `generation.compute / map-generation-adoption-result` | generation | 新 session |
| persistence-import | `map-file-io / map-file-import-result` | persistence | 新 session |
| persistence-export | `regeneration.compute / archive-export` | persistence | 只读 |
| headless-write | `headless-write / headless-write-commit` | headless | revision commit |

`task + resultKind` 全局唯一；四种 profile 不新增 canonical owner。interactive runtime session、persisted document、renderer preparation 与 headless document identity 继续保持不同命名空间。

## 实现契约

- TypeScript 新增整图 profile、owner、effect、adoption / export / headless 回执类型；完整 map 仍不做一次性严格类型化。
- generation / import 在 handoff 解包前校验 result kind、请求 binding、无完整 map / document 泄漏、handoff、timing 与临时 render binding；解包后再核对 persisted identity、checksum 与 grid / pack cell 计数。
- persistence export 返回原请求 binding，并在 MapWorker session commit 前核对 encoding、mime、结果类型、字节数、persisted identity、checksum 与 cell 计数；协议校验不改写源 map。
- headless write 在成功返回前核对 persisted identity 保持、隔离 document identity、revision 精确 `+1` 与已持久化 metadata；校验异常复用既有 catch 路径完整回滚文档、revision、幂等账本和 history。
- generation / import adoption 的 runtime operation snapshot / rollback、prepared renderer rollback 和未提交 Worker session invalidate 保持既有实现；本阶段没有创建第二套 rollback owner。

## 专项验收

- `regress:whole-map-profile-core-protocol`：4 个 owner、15 类协议负例、新生成 session、普通导入、v1 旧档 identity 派生、导出 source 不变、checksum / byte receipt 与真实 headless commit。
- `webgl-generator-map-file-io-worker-regression.mjs`：plain / gzip / webfmg-v3、损坏输入及轻量 100k 存档通过；夹具同步当前 `topologyRevision: 0` render binding。
- `webgl-generator-worker-task-regression.mjs`：generation / import adoption owner、archive export、session ACK / invalidate / rollback 与全领域 parity 通过。
- `regress:headless-write`、`regress:headless-api`、`regress:registry-document-identity`、`typecheck:core`、`build:app` 与 `git diff --check` 通过。
- 浏览器启动、操作和浏览器脚本执行均为 `0`；浏览器验收只在 349-11 形成方案。

## 阶段结论

首轮只读评审对 `10b442b / 0.5.46` 给出 `BLOCK`：preload / 校验失败可能遗留 pending Worker session，临时 renderer binding 未冻结 topology revision，解包文档的 checksum / cell count 仍可能只与自报 metadata 自洽。`0.5.47` 已做最窄修正：从 Worker 返回到 `loadMapIntoRuntime` 接管前的全部失败 / 提前返回路径立即 invalidate，临时 render binding 明确并校验 topology revision，cell count 从真实 identity 容器读取且核对已有 metadata，document / map checksum 必须一致；新增失败接纳后下一持久任务立即运行的真实 coordinator 回归。同一只读评审职责的干净复审智能体对 `6bcd0cf / 0.5.47` 给出 `ACCEPT`，无剩余 P0 / P1，浏览器执行 `0`。未完成顺序仍为 `349-10g → 349-11`。
