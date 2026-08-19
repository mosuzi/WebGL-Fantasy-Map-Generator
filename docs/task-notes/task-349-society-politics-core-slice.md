# 第 349-10b 阶段：社会与行政核心协议切片

## 目标与边界

本阶段迁移 society / politics 与 pack mirror 的 Manifest、dependency 和真实 `regeneration.compute` 输出协议，并先闭合 349-10a 留下的行政引用首门。唯一 canonical owner、既有 Worker DTO 和业务生成器保持不变；不正式迁移 settlements / routes / economy / military，不执行浏览器验收。

## 首门归因

- ocean world 的省份 `110` 无候选和 `118` 省会不一致来自两处 `finalizeSettlements` 调用漏传既有 `repairInconsistentProvincialCapitals`，并非行政约束必须放宽。补齐修复模式后 10k / 50k / 100k 世界重建通过。
- 原“锁国无省会”夹具依赖生成器偶然产生空省会。现从真实有效省份构造 `burg = 0`、清理对应 provincial flag，再锁定所属国家，形成确定性反例。
- settlements 从空重建现在跳过锁定国家 / 省份的首都和省会再生成；锁对象及其 state / province / city 支撑包络保持逐字段不变。锁冲突诊断同时允许把合法 `undefined` 稳定表示为字符串，避免诊断路径自身抛错。

## 协议交付

- 新增耦合的 shadow `society-politics` Manifest。religions / states / provinces 共用真实 `regeneration.compute` task，因此由一份领域 Manifest 登记三个 result kind、三套精确写集及其 union，避免虚构三个重复 Worker owner。
- 正式主线程只对这三个 kind 启用 TypeScript 输出 validator：核对 request / output / prepared renderer binding、精确 policy、完整 patch writeSet / operations、religions 和 states / provinces 的双镜像，以及活动国家 / 省份的首府引用。
- 新增 social-assignment 与 administrative-mirror 两个 derived system；社会或行政写入显式规划 full rebuild，并失效 cell colors、政治边界、labels、object index 与 picking。
- 专项以真实生成器和 Worker task 取得三类结果，用真实 `EditHistory + MapRevisionTracker` 应用 states patch 并覆盖 undo / redo；stale binding、部分写集、删除值、undefined 值、三类原生容器冒充、宗教镜像、省份镜像、首都引用、首都清零和 policy 漂移十二类结果在 commit 前拒绝。

## 计划外发现与顺序复评

完整 world constraint 在通过本阶段的锁国无省会门后，稳定暴露锁定 Feature 的港口引用在 `cities-routes` 后从 `382` 减到 `366`，删除项均来自 `pack.burgs`。该问题的 owner 是 routes / features，原阶段链已经有 `349-10d`，因此不插入新的独立阶段，也不把引用集合从锁快照移除；把它登记为 10d 首门后，未完成顺序仍为 `10b → 10c → 10d → 10e → 10f → 10g → 11`。

## 非浏览器验收

- `pnpm typecheck:core`
- `pnpm regress:core-manifests`：`5` domains、`78` descriptors、`31` negative cases。
- `pnpm regress:core-dependencies`：`9` derived systems，社会 / 行政写入进入各自显式 full rebuild。
- `pnpm regress:society-politics-core-protocol`：三类真实 Worker 输出、十二类拒绝、社会锁、行政引用、预检、10k / 50k / 100k 世界重建、确定性锁国无省会包络。
- `pnpm regress:map-migration`：v1 → v2 社会 / 行政旧数据迁移及当前文档幂等。
- `pnpm build`：production build 通过，`1379` modules。
- `git diff --check`；`source/` 改动 `0`；浏览器启动、操作和验收 `0`。

`regress:ocean-current-world-constraint-bundle` 的完整模式当前预期在已登记的 10d Feature 引用问题处首败，不列为 10b 通过门；同一脚本的 `--society-politics-only` 窄门属于 10b 冻结门并已通过。

## 阶段交接

| 字段 | 内容 |
| --- | --- |
| 状态 | `ACCEPT`；同一评审智能体确认两轮 P1 全部闭合，无新增 P0 / P1 |
| 版本 | 首轮 `0.5.29`；两轮修正 `0.5.30 / 0.5.31` |
| 唯一写者 | 主线程 |
| 评审 | 复用同一只读评审智能体；`ACCEPT` 前不得进入 349-10c |
| 下一步 | 进入 settlements / zones / labels / measurements |

## 首轮评审与最窄修复

同一只读评审智能体对 `2700d2b / 0.5.29` 给出 `BLOCK`：完整 writeSet 仍能把 operation 全部改成删除或 undefined 并通过镜像门；国家 / 省份首府清零后保留 city / burg 标记也能绕过仅正向引用检查。

`0.5.30` 对 executed patch 的每个精确路径强制 `exists:true`，并按真实路径要求布尔、有限数值、数组 / TypedArray 或记录值；删除和 undefined 在 apply 前拒绝且 canonical source 不变。首府校验改为双向唯一引用：正向行政锚点、city 标记、burg 标记必须一一对应，孤立或重复反向引用拒绝。零首府仅在 before-image 已为零且省份自身或所属国家受锁时允许；专项同时覆盖普通首都清零拒绝和锁国既有零省会接受。

复审确认首府门已闭合，但指出通用容器分类仍会把 DataView 当 TypedArray，并把 TypedArray、Map 等非 plain object 当记录。`0.5.31` 将 cell 值收紧为 Array 或排除 DataView 的 TypedArray，将记录收紧为 plain / null-prototype object；DataView religion cells、Uint8Array politics 和 Map settlements 三类正式反例均在 commit 前拒绝。

同一只读评审智能体对 `0.5.31` 第二轮修正 checkpoint 给出 `ACCEPT`；两轮 P1 全部闭合，无新增 P0 / P1。
