# 第 350 项集成重新基线阶段交接

本文件只保存 `350-R0～R7` 当前阶段的精简冻结证据；完整历史、浏览器记录与长 artifact 仍留在原执行记录和 `Z:` 目录。

## 350-R1：机器可审计验收契约目录

### 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | `350-R1`；把 16 项共同不变量、17 类场景、20 个固定入口及 4 类整图 profile owner 固化为唯一机器 catalog |
| 当前阶段 | catalog、自测与动态插入的纯夹具 `350-R1-f1` |
| 冻结点 | `codex/map-core-engine-architecture-plan` 未提交工作树；保留第 350 项既有产品改动，只评审本阶段文件 |
| 允许文件 | `tools/task-350-acceptance-contract-catalog*.mjs`、`tools/webgl-generator-task-349-final-gate-audit.mjs`、`package.json` 与本阶段文档 |
| 禁止文件 | 产品 runtime / domain / renderer / generator、`source/`、浏览器脚本的功能逻辑与预期 |
| 必须保持 | 20 个固定入口不增删；前五项只记旧接受基线且必须重查；catalog 不从产品输出生成期望；27 个顶层终验 gate 与递归依赖分开计数；递归工具链继续拒绝浏览器启动原语 |
| 最小验收 | `regress:task-350-acceptance-contract`、`audit:task-349-final-gates`、`typecheck:core`、`git diff --check`、只读评审 |
| 首个廉价门 | `pnpm run regress:task-350-acceptance-contract` |
| 停止条件 | catalog 分母漂移、未登记场景 / owner、依赖集合扩张、任何产品改动或需要浏览器证据 |

### 阶段结果

- 状态：`ACCEPT`；第二次 blocker-only 复审 `P0 0 / P1 0`。
- 完成：机器固定 `16 invariants / 17 scenarios / 20 fixed entries / 1 supplemental / 4 profile owners`；前五项状态为 `accepted-baseline-recheck-required`，其余 15 项为 `pending`；8 类破坏性 catalog 负例均拒绝；20 个 package script 与源码入口均存在；旧浏览器证据的固定入口集合精确一致。
- 产品改动：`0`。
- 工具 / 文档改动：工具 `6` 文件（catalog、自测、共享 scanner、旧终验审计、side-effect 两文件反例）共 `582` 行，另更新 package 路由与权威文档；catalog / 自测分别为 `324 / 97` 行。
- 已过门禁：catalog PASS，`33` 个声明 Node 前置展开为 `34` 个 package script / `44` 个工具源码；第 349 项审计 PASS，`27` 个顶层 gate、`1` 个显式递归依赖、`37` 个工具源码均受防浏览器扫描；core typecheck PASS；四个工具语法与 diff-check PASS。
- 首败或阻断：旧审计曾因 `28 !== 27` 阻断，已用 `350-R1-f1` 精确登记唯一 adoption 子门；首轮评审又用任意 policy、真实 `regress:measurement` 和 side-effect import 复现三类绕过。第一次 blocker-only 确认后两类已闭合，但发现 17 个 scenario 自身的 owner 可删除或跨阶段漂移；现补逐项精确矩阵和两条负例。没有产品失败，不得据此声称任何浏览器入口已重新接受。
- artifact：无；本阶段只产生可版本化 catalog 与终端摘要，browser / CDP 为 `0`。
- 延后记录：20 个浏览器 fixture 的 setup、cleanup、错误、性能与 artifact 实现质量只报告现状，不在 R1 冻结；统一在 `350-R6a` 按已接受产品契约补齐并冻结。
- 下一步：进入 `350-R2a`；首个廉价门为前五项共同事务边界的静态 owner / write-set / binding 盘点，不启动浏览器。

### 委派附加字段

- 角色：集成复核。
- 只读或唯一写者：评审只读；主线程仍是唯一写者。
- 上下文：只需本交接、重新基线方案、catalog / 自测、终验审计和 package scripts；不得派生子智能体。
- 返回：`ACCEPT / BLOCK`、P0/P1 数量、精确证据和最窄修正；不复制完整日志，不运行浏览器。

## 350-R2a：前五项共同事务边界复查

### 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | `350-R2a`；复查前五个固定入口共享的 adoption owner、三类 projection binding、commit 顺序、Manifest 写集、镜像、history async 与 fault / cancel / obsolete，并纳入四类整图 profile owner |
| 当前阶段 | 共同产品契约复查、动态插入的纯夹具 `350-R2a-f1 / f2` 与串行聚合门；已冻结待评审 |
| 冻结点 | `codex/map-core-engine-architecture-plan` 未提交工作树；第 350 项既有产品改动保持不动，R2a 没有产品文件改动 |
| 允许文件 | 两个领域 Node 协议夹具、catalog / regression、`package.json` 与本阶段权威文档 |
| 禁止文件 | 产品 runtime / domain / renderer / generator、`source/`、五个浏览器入口的实现与预期 |
| 必须保持 | canonical source 与 Worker 可变输入分离；正式 validator 不放宽；四 profile 使用同一 owner vocabulary；prepared installer 与 history async 有显式 package 路由；聚合门串行；browser / CDP 为 `0` |
| 最小验收 | `regress:task-350-r2a`、`build:app`、`audit:task-349-final-gates`、`git diff --check`、只读评审 |
| 首个廉价门 | `pnpm run regress:task-350-r2a` |
| 停止条件 | source 被 Worker 污染、validator 接受请求外写入、profile / owner / commit 顺序漂移、任何真实产品首败或评审 P0/P1 |

### 阶段结果

- 状态：`ACCEPT`；独立复核 `P0 0 / P1 0`，browser / CDP `0`。
- 产品改动：`0`。本阶段没有修改 runtime、domain、renderer、generator 或正式 validator。
- 夹具 / 路由改动：`350-R2a-f1` 新增 `regress:history-async-boundary`、`regress:prepared-render-installer` 和串行 `regress:task-350-r2a`，并把 core contracts / manifests / facade、history async 与 prepared installer 登记为前五项共同 Node 前置；`350-R2a-f2` 将 society-politics / settlements 两组协议改为 canonical source 与 Worker clone 分离，在正式 validator 前后深比较 source。
- 事务覆盖：adoption owner 覆盖 pending / busy / commit / invalidate / finalize；四类 whole-map profile 覆盖 generation / persistence import / archive export / headless write 的 envelope、document、checksum、revision 与 source 不变；core facade / manifests 覆盖 canonical mutate、history、publish、projection settle、写集和依赖；prepared installer 覆盖 `9` 类 commit / rollback / finalize / fault / nested / detached / range；history async 覆盖 sync / async settle、revision drift 和 failure；四组领域协议覆盖 write-set、mirror、reference、coercion、source immutable 与 policy drift；worker / replica 覆盖 fault、cancel、obsolete、session guard 和 rollback recovery。
- 已过门禁：`regress:task-350-r2a` PASS，其中 catalog 为 `16 / 17 / 20 / 1 / 4`，core manifests 为 `15 domains / 216 descriptors / 35 negatives`，prepared installer 为 `9 cases`，四组领域协议均通过正式 validator；`typecheck:core` 作为聚合末门 PASS；`build:app`、第 349 项 `27` 顶层门防浏览器审计及 `git diff --check` PASS。
- 首败或阻断：一次并行 Vite 读门报告调试端口 `24678` 已占用但进程均退出 `0`，后续同类门改为串行；完成度盘点发现两项纯夹具缺口并插入 `R2a-f1 / f2`，分离后没有暴露产品 blocker。不得把该结果解释为五个浏览器入口已重新接受。
- artifact：无；所有结果为可复现 Node / build 终端摘要，browser / CDP 为 `0`。
- 独立评审：自行完整运行聚合门，确认 `38` 个 Node 前置展开为 `41` 个 package scripts / `50` 个本地源码且不含浏览器启动原语；两组 source / Worker 分离、正式 validator、四 profile、三类 projection、prepared installer 及 fault / cancel / obsolete 均闭合。
- 下一步：进入 `350-R2b`；本阶段后续保持冻结。

### 委派附加字段

- 角色：集成复核。
- 只读或唯一写者：评审只读；主线程仍是唯一写者。
- 上下文：只需本交接、R0 方案、catalog / package 路由、两个 source 分离协议夹具、prepared installer / history async 与正式 validator；不得派生子智能体。
- 返回：`ACCEPT / BLOCK`、P0/P1 数量、精确证据和最窄修正；必须区分产品与夹具，不运行浏览器。

## 350-R2b：population / society / economy 领域链复查

### 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | `350-R2b`；以真实 10k / 100k Worker task 复查 population、social expansion、economy 的 source fingerprint、写集、跨域依赖、prepared render、history、stale 与 pre-commit 性能 |
| 当前阶段 | `R2b-f1 / f2 / f3 / f4` 夹具、`R2b-p1` Manifest 产品登记及串行聚合门均完成；已接受并冻结 |
| 冻结点 | `codex/map-core-engine-architecture-plan` 未提交工作树；R2b 产品范围仅 society-politics Manifest 的既有能力登记 |
| 允许文件 | society-politics Manifest；三条 Worker task / render / core manifest / dependency / UI API 夹具；catalog、package 路由和本阶段文档 |
| 禁止文件 | Worker runtime 算法、浏览器 fixture、renderer 产品实现、其它领域 Manifest、`source/` |
| 必须保持 | canonical source 不变；正式 validator 不放宽；Manifest write-set 覆盖真实 patch；三条依赖闭包读取正式 Worker write-set；prepared render 只含 cities picking；浏览器执行为 `0` |
| 最小验收 | `regress:task-350-r2b`、`build:app`、`audit:task-349-final-gates`、`git diff --check`、只读评审 |
| 首个廉价门 | `pnpm run regress:core-manifests` |
| 停止条件 | Manifest 漏登 / 过宽、请求外写入、source 污染、跨域闭包缺 owner、100k 输入 buffer 破坏、history / stale / binding 漂移、评审 P0/P1 |

### 阶段结果

- 状态：`ACCEPT / P0 0 / P1 0`；首轮两个夹具 / 路由 P1 已由 `R2b-f4` 闭合并经 blocker-only 复审接受；browser / CDP `0`。
- 产品改动：`1` 个文件，society-politics Manifest `+51 / -12`。登记既有 culture / religion expansion 的两个 command、两个 query、一个 Worker task、四个 API descriptor、`regenerationLocks` canonical owner 及精确 `SOCIAL_EXPANSION_WORKER_WRITE_SET`；runtime 行为、validator 与 UI 产品均未修改。
- 夹具 / 路由改动：`R2b-f1` 补 population / society task、dependency、render、whole-map-chain 与聚合 package / catalog 路由；`R2b-f2` 补 transfer / religion / market-assignment 和三条 100k 的 cities-only picking / binding 对称断言，并冻结 society canonical source；`R2b-f3` 只把第 330 项前旧 UI 文案同步为当前产品。core manifest 真实运行 1k culture + religion task 并证明全部 patch 受 Manifest union 覆盖；core dependency 直接读取三个正式 Worker write-set 形成独立跨域闭包。
- 产品 / 夹具首败归因：产品首败为 I-05 owner 登记缺口，收口在 `R2b-p1`；后续 UI 首败仅为历史文案夹具，收口在 `R2b-f3`。两者阶段分离，没有用移动预期掩盖产品错误。
- 首轮独立评审：未发现产品 P0/P1；P1-1 为聚合 / catalog 未执行 `regress:core-manifests` 和 `regress:social-expansion-ui-api`，P1-2 为共享 mirror 的 1k 正例只做单向 patch→root，不能证明四个 detached owner 必不可删。
- `R2b-f4`：把两门接入唯一 R2b 聚合入口、society fixed entry、精确 prerequisite requirements 与删除负例；最大 culture + religion 正例显式分离 culture / religion / state / province 四组 mirror，保留 patch→root，并增加所有 Manifest root→实际 patch。正式输出为 `21 roots / 515 patch paths / 4 detached mirrors`。
- 已过门禁：`regress:task-350-r2b` PASS；catalog `16 invariants / 17 scenarios / 20 fixed / 1 supplemental / 4 profiles`，11 域链 100k `3429.68ms`，population / society / economy 100k `934.9 / 463.2 / 2663.9ms`；source immutable、alias / identity、undo / redo、Worker history、lock / cancel / fault / stale、prepared render、四类 whole-map profile、正式拒绝矩阵和 `typecheck:core` 均成立。随后 `build:app` 为 `1395 modules`，第 349 项 `27` 顶层门防浏览器审计和 `git diff --check` PASS。
- 性能边界：本阶段 Node task 时间只作 pre-commit / algorithm 基线，不冒充浏览器 LongTask；浏览器 `>200ms` 硬门仍冻结到 R6b。
- artifact：无；所有结果为可复现 Node / build 终端摘要，browser / CDP 为 `0`。
- `R2b-f4` 复验：修正后的 `regress:task-350-r2b` 完整 PASS，且日志显式包含 core Manifest 与 social UI/API；catalog 为 `44 prerequisites / 47 scripts / 54 sources`，11 域链 100k `3502.11ms`，population / society / economy 100k 为 `936.0 / 455.0 / 2575.7ms`，typecheck PASS。
- blocker-only 复审：独立运行 catalog、core Manifest、social UI/API 与 diff-check 全部 PASS；两项原 P1 无等价残留，产品 Manifest / runtime 无新增 P0/P1。
- 下一步：进入 `350-R3a`；R2b 后续保持冻结。

### 委派附加字段

- 角色：集成复核。
- 只读或唯一写者：评审只读；主线程仍是唯一写者。
- 上下文：只需本交接、重新基线方案、society-politics Manifest、core manifest / dependency、三条 Worker task / render 夹具、catalog / package；不得派生子智能体。
- 返回：`ACCEPT / BLOCK`、P0/P1 数量、精确证据和最窄修正；必须区分产品与夹具，不运行浏览器。

## 350-R3a：session / adoption / concurrency 完成度复查

### 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | `350-R3a`；复查 generation adopted session、replica patch、commit ACK / invalidate、fault / cancel 后 fresh、map replacement、pending viewport 与 100k packet / yield |
| 当前阶段 | 动态 Node 基线与纯夹具 `R3a-f1 / f2` 完成；独立评审已接受并冻结 |
| 冻结点 | `codex/map-core-engine-architecture-plan` 未提交工作树；R3a 没有产品文件改动 |
| 允许文件 | session static contract、worker graph regression、catalog / 自测、package 路由与本阶段文档 |
| 禁止文件 | coordinator / app / renderer 产品源码、7409 行 browser fixture 业务链、R3b topology / lock / GPU 范围、`source/` |
| 必须保持 | Node/static contract 不导入或启动 browser；产品动态证据仍由正式 worker-task / adoption / replica 入口产生；10k / 100k 都分包、三阶段让步、输入 buffer 不 detach；browser / CDP 为 `0` |
| 最小验收 | `regress:task-350-r3a`、`git diff --check`、只读评审 |
| 首个廉价门 | `pnpm run regress:worker-session-contract` |
| 停止条件 | adopted owner 不连续、replica patch / checksum 可绕过、accepted failure fallback、cancel / obsolete 后复用旧 session、100k 单包 / 无让步、评审 P0/P1 |

### 阶段结果

- 状态：`ACCEPT / P0 0 / P1 0`；已冻结，browser / CDP `0`。
- 产品改动：`0`。现有 coordinator、app、renderer、protocol 与 browser fixture 均未修改。
- 夹具 / 路由改动：`R3a-f1` 新增 session contract、worker graph `--100k` 路由、discover / definitions / properties 三阶段 yield 和单包 structured clone `<50ms` 硬门；首轮评审发现其大切片 `includes` 可伪造后插入 `R3a-f2`，把 contract 收紧为 `269` 行 Babel AST `FunctionDeclaration` 边界与真实 parser tokens，加入跨 helper 注释和同 helper 字符串两类自证负例。条目 6/7 的 catalog prerequisites、精确 requirements 及 `regress:worker-task` 删除负例同步闭合。
- 产品完成度证据：adoption owner 覆盖 request / worker-pending / loading / committing / committed 与 invalidated；worker-task 动态覆盖 adoption commit、导入后跨 task reuse、failed adoption cleanup、queued replica patch、checksum drift 销毁和下一任务 fresh、accepted failure 不 fallback、cancel / obsolete、wrong-session input / output ACK；replica command patch 覆盖精确写根、alias、异步分包、source 脱离和 obsolete capture。
- 已过门禁：`regress:task-350-r3a` PASS；catalog `48 prerequisites / 50 scripts / 56 sources`，static contract `6 continuity / 1 replacement / 2 race / 2 pending viewport modes`，worker-task 11 kind 全过；10k graph `205 packets / 322 yields / max 5.284ms`，100k `971 packets / 1807 yields / max 6.354ms`，三阶段均让步、event loop 获得同数窗口、正式 buffer 不 detach；`typecheck:core` 与 `git diff --check` PASS。
- 性能边界：本阶段只冻结 Node packet / yield 与单包 `<50ms`；浏览器 LongTask `>200ms` 仍留在 R6b，不用 Node 数值冒充。
- artifact：无；可复现终端摘要，browser / CDP 为 `0`。
- 首轮评审：`BLOCK / P0 0 / P1 1`，唯一 blocker 为上述夹具可绕过性；产品 P0/P1 为 `0`。
- blocker-only 复审：独立运行 session contract、catalog、两处语法和 diff-check 全部 PASS；两类伪证与两个 prerequisite 删除反例均真实被拒绝，结论 `ACCEPT / P0 0 / P1 0`。
- 下一步：进入 `350-R3b`；R3a 保持冻结。

### 委派附加字段

- 角色：集成复核。
- 只读或唯一写者：评审只读；主线程唯一写者。
- 上下文：只需本交接、重新基线方案、session static contract、worker-task / adoption / replica / graph gates、catalog / package；不得派生子智能体。
- 返回：`ACCEPT / BLOCK`、P0/P1、精确证据和最窄修正；必须检查 static contract 可绕过性，不运行浏览器。

## 350-R3b-f1：height / states lock contract 冻结

### 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | `350-R3b-f1`；把高度复合重建与 states 的同一约束 bundle、锁读取、冲突和回滚改成可执行静态契约 |
| 当前阶段 | 纯夹具完成并由同一只读评审最终接受；现转入 `R3b-p1` 产品阶段 |
| 冻结点 | `tools/webgl-generator-regeneration-lock-height-state-regression.mjs`；产品 runtime / renderer 未因本子阶段修改 |
| 允许文件 | height-state 专项夹具、R3b 方案 / 当前计划 / 交接 / 开发日志 |
| 禁止文件 | 产品 runtime / renderer / generator、其它夹具、browser fixture、`source/` |
| 必须保持 | 只读解析源码；不得 import 产品副作用或启动 browser；字符串 / 注释 / 未绑定调用均不能冒充契约 |
| 最小验收 | `regress:regeneration-lock-height-state`、`node --check`、`git diff --check`、同一只读评审 |
| 首个廉价门 | `pnpm run regress:regeneration-lock-height-state` |
| 停止条件 | 八域映射可漂移、bundle 未绑定或未透传、五类锁切片可删除、冲突 / 回滚可删除、破坏性反例假绿 |

### 阶段结果

- 状态：`ACCEPT / P0 0 / P1 0`；纯夹具阶段，产品改动 `0`，browser / CDP `0`。
- 实现：Babel AST 精确定位主线程 / Worker 的 `FunctionDeclaration`；`DOMAIN_BY_KIND` 必须是 `Object.freeze` 包裹的八个直接 `ObjectProperty`。其余契约只匹配函数体内真实 executable token arrays，不再拼接为字符串。
- 约束证据：主线程和 Worker 必须以完整 `const constraintBundle = ...;` 捕获 world closure；states transaction 必须完成条件 capture，并在同一 core-call 中连续透传 `{...options, constraintBundle, rejectLockedDiplomacy}`；主 / Worker states 均读取五类锁切片，外交锁在写前拒绝，主线程异常与 Worker no-result 分别恢复 salt。
- 首轮评审 blocker：字符串拼接允许 standalone string 伪证，八域映射也未做 AST 属性检查；修正后又由 blocker-only 复核发现 capture 调用未绑定变量、states core 未固定 bundle 参数。两次均为夹具 P1，没有修改或判定产品实现。
- 最终自证：删除真实主线程声明并保留 standalone executable call、删除 core-call 的 `constraintBundle` 属性、删除 Worker `lockedStates` 真实读取再加入 standalone string，三项均必须打红；专项输出 `negativeCases: 3`。
- 已过门禁：专项、语法、diff-check 及最终只读复审全部 PASS；最终结论 `ACCEPT / P0 0 / P1 0`。
- 下一步：进入 `350-R3b-p1`；夹具断言冻结，不与产品修正同批移动。

## 350-R3b-p1：resource binding / surface owner / context restore

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R3b-p1`；让 renderer、DTO、cache、GPU owner 与恢复路径共享完整资源代际 |
| 当前阶段 | 产品修正已由同一只读评审最终接受；现转入纯夹具 `R3b-f2` |
| 最小验收 | incomplete resource binding 拒绝；latest-issued 淘汰旧 preparation；surface owner 原子换代；canonical-first rollback；context staged restore / invalid retry |
| 非目标 | picking / overlay / label retained owner 的 p2 收口、浏览器 / CDP、视觉验收、main 合并 |
| 唯一写者 | 主线程；评审智能体只读 |
| 产品文件 | render resource binding、render preparation/cache/picking DTO、surface/correction buffer set、prepared installer、placeholder renderer、runtime app/map revision |
| 夹具状态 | 本阶段冻结未改；旧三字段首败转交 `R3b-f2` |

- 结果：首轮 `BLOCK / P1 4`，第一次 blocker-only `BLOCK / P1 2`，第二次 blocker-only `ACCEPT / P0 0 / P1 0`。阻断依次覆盖补零 binding、in-place owner 不换代、latest watermark、rollback/context 非原子、迟到 rollback 与 restoring draw。
- 廉价证据：strict binding 4 个 incomplete 负例、latest 2 stale / 1 latest direct test、A/B committed transaction lifecycle、两处 syntax、typecheck、build 1396 modules 与 diff-check 均 PASS。
- 已知首败：`regress:prepared-render-installer`、`regress:render-preparation`、`regress:worker-task` 仍构造 legacy 三字段资源 binding；这是 `R3b-f2` 的纯夹具迁移输入，不得回退产品严格门。
- 浏览器 / CDP：`0`。
- 下一步：`R3b-f2` 只迁移夹具并补完整 binding、逆序提交和恢复 fault 自证；接受后进入 `R3b-p2`。

## 350-R3b-p1a：in-place commit fault / rollback owner checkpoint

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R3b-p1a`；收口 `R3b-f2` 暴露的原位 descriptor before-image、commit fault 与异步 rollback owner 竞态 |
| 当前阶段 | 产品修正已由同一只读评审接受；回到纯夹具 `R3b-f2` |
| 最小验收 | commit fault 后恢复精确 CPU/GPU before-image；A rollback yield 中 B 接管后 A 停止；反例确定触发 yield |
| 非目标 | worker-task 夹具迁移、p2 picking/overlay/label、浏览器 / CDP、main 合并 |
| 唯一写者 | 主线程；评审智能体只读 |

- 产品修正：surface descriptor 使用专用 before-image；同步结构 rollback 不吞掉待恢复颜色；`rollbackAsync` 在 CPU 分片 checkpoint 同时核对调用方 current 与 source owner，B 接管后放弃旧 before-image。
- 夹具修正：增加 commit setter fault、正常异步恢复和 yield 中 B commit；最后一个反例通过窄 `now` seam 使用确定性单调时钟，并在检查 A 返回 `false` 前先断言 B 已提交。
- 门禁：`regress:prepared-render-installer` 输出 `13 cases / rollbackYieldSuperseded true`；两处 `node --check` 与 `git diff --check` PASS；同一评审最终 `ACCEPT / P0 0 / P1 0`；browser / CDP `0`。
- 下一步：恢复 `R3b-f2`，只完成剩余夹具与恢复 fault 自证。

### 委派附加字段

- 角色：blocker-only 产品竞态复核。
- 只读或唯一写者：评审只读；主线程唯一写者。
- 上下文：只需本交接、prepared installer 与其 13-case 专项；不得派生子智能体。
- 返回：`ACCEPT / BLOCK`、P0/P1、确定性 yield、owner checkpoint 与资源生命周期证据；不运行浏览器。

## 350-R3b-f2：complete binding / reload / context fault 夹具冻结

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R3b-f2`；迁移完整资源 binding，并为 inverse commit、reload 与 context restore fault 提供可执行自证 |
| 当前阶段 | 纯夹具已由同一只读评审接受并冻结；进入 `R3b-p2` |
| 最小验收 | 三专项、typecheck、build、diff；完整 binding；canonical-first reload fault；staged cleanup + invalid + zero draw |
| 非目标 | p2 picking/overlay/label、browser / CDP、视觉验收、main 合并 |
| 唯一写者 | 主线程；评审智能体只读 |

- 夹具：render cache 同资源代际可跨 preparation ID 重绑；prepared 13-case 固定 incomplete/null、identity/revision/latest-issued、commit fault、A/B rollback；worker render-only 明确区分 foundation session binding 与 complete render binding。
- fault：正式 map rollback helper 在 renderer reload 抛错前已恢复 canonical map/revision/history；context restore 在第三个 buffer 创建点故障，清理 `3 / 2 / 1` program/buffer/VAO，owner 全失效，state=`invalid`、draw=`0`。
- 门禁：三专项、`typecheck:core`、1396-module build、`git diff --check` PASS；browser / CDP `0`。
- 首败归因：worker-task 的 suspended highlight 手工对象缺少新 `ready` 资源前置，补齐夹具字段后通过，没有插入产品阶段。
- 首轮评审：`BLOCK / P0 0 / P1 1`，仅 reload fault 夹具未锁定正式 revision/history before-image。现已改用正式 tracker snapshots、严格 rollback binding，并在 load fault 点核对全部恢复状态；完整 worker-task 再次 PASS。
- blocker-only：static/full worker-task、语法与 diff 独立 PASS，最终 `ACCEPT / P0 0 / P1 0`，browser / CDP `0`。
- 下一步：进入 `R3b-p2`，只处理 picking/overlay/label retained owner。

## 350-R3b-p2：picking / overlay / label retained owner

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R3b-p2`；让 object picking、label layout、overlay/icon retained data 都有完整 resource binding owner |
| 当前阶段 | 产品实施完成并冻结待同一只读智能体评审；接受前不进入 R4a |
| 最小验收 | 三族 owner 绑定真实引用；prepared install/rollback 原子；旧代 incoming 拒绝；draw/pick 拒绝混装；load/context restore 同源；专项、typecheck、build、diff |
| 非目标 | presentation-only 0-delta、camera/hover/pan、视觉 / browser/CDP、R4a、main 合并 |
| 产品文件 | retained owner helper、prepared installer、placeholder renderer |
| 夹具文件 | prepared installer / worker-task 的 owner、rollback、context invalid 精确反例 |
| 首个廉价门 | `regress:prepared-render-installer` |

- owner 只描述实际 retained 资源及其引用；未重建的合法资源可保留自己的旧 binding，不用“最新 revision”冒充实际重建。incoming prepared 结果仍必须通过 latest-issued；替换或局部 picking、overlay/label 安装才换成目标 binding。
- full load 使用同一个 surface-issued binding 建立三族 owner；context restore 的 replaceResources binding 同时重绑保留 CPU picking/label 与重建 overlay GPU icon；失败统一 invalid 清空。
- draw 检查 overlay/label wrapper 与引用，object pick 检查 picking + overlay/label wrapper；普通 presentation 改动在同 owner 下重建引用并同步 wrapper，不推进地图 revision。
- 产品实现：新增 retained binding helper；full load / context restore 以 surface-issued binding 同时接纳 picking 与 overlay/label。prepared install 对完整 / 局部 picking、overlay DOM、city icon GPU instances 和 label/icon arrays 同事务登记 before-image 与 owner；通用 setter 在执行前进入 rollback 栈，覆盖 setter 先污染再抛错。
- 普通编辑：scheduler 对包含 object-index / river-picking / labels 的同步与异步刷新，从当前 `MapRevisionTracker` 只签发一次 binding 并透传；river regeneration rollback、whole-map mutation rollback、城镇迁移共享同次 binding。实际重建才换 owner，未变 retained 数据不冒充最新资源。
- 拒绝面：draw / pick 在使用前核对 wrapper 真实引用，并要求 retained owner 与 surface owner 的 map identity / topology 一致；incoming source / preparation / generation 仍由 strict complete binding + latest-issued 淘汰。
- 门禁：`regress:prepared-render-installer` 为 `16 cases`，包含 owner commit fault、同步/异步 edit binding 单次传播、跨 map draw/pick 拒绝；`regress:panel-refresh-path`、`regress:render-preparation`（10004 cells）、完整 `regress:worker-task`（11 kind）、`typecheck:core`、1397-module build、语法与 `git diff --check` PASS。browser / CDP `0`。
- 首轮评审：`BLOCK / P0 0 / P1 1`。正式 tracker 的每次 history mutation 都保守推进 topology；retained-only refresh 直接使用该 topology 却不重绑 surface，导致 label 下一 draw 与 city relocation 当场产生 `owner-topology-revision`。原 propagation fixture 没有真实 surface owner / mismatch，属于集成夹具漏面。

## 350-R3b-p2a：保守 topology / retained-only 与 surface refresh 同源

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R3b-p2a`；消除普通 history 保守 topology 与实际 surface owner 的错误分叉 |
| 当前阶段 | 产品修正完成并冻结待 p2 blocker-only；接受前不进入 R4a |
| 最小验收 | retained-only=current source+surface topology；surface refresh=同一 current binding 接纳 surface+retained；正式 tracker sync/async/history/city relocation 反例；专项/typecheck/build/diff |
| 非目标 | 改写 MapRevisionTracker 的保守策略、R4a presentation/camera、browser/CDP、main 合并 |
| 产品文件 | renderer retained/surface owner、edit scheduler、app refresh binding helper |
| 夹具文件 | prepared installer 的正式 tracker + 真实 surface owner 集成反例 |
| 首个廉价门 | `regress:prepared-render-installer` |

- 修正：retained-only 发行当前 source revision，但 topology 取当前 surface owner；包含 cell-colors / terrain-caches 的真实 surface refresh 使用 tracker current topology，并把同一 binding 传入 full / incremental surface 写。增量重绑同时更新 surface buffer wrappers、attribute owner 与三族 retained wrapper，字段 before-image 在异常时原样恢复。
- 顺序：普通 scheduler 同一 binding 贯穿 sync/async picking、surface 与 labels；river rollback 的 preserving-routes 阶段先使用 surface-compatible binding，随后 river+surface refresh 再发行 current topology，避免 surface 更新前的内部 assert。
- 首次 blocker-only：`BLOCK / P0 0 / P1 1`。async scheduler 在 picking 后 yield、surface 后换代，guard fault 会把临时 topology mismatch 永久留下；原反例只有 async retained-only 与 sync surface，未覆盖 async surface。
- async 原子边界：surface-refreshing `runAsync` 在首个 checkpoint 前进入 `retainedResourceState=suspended`；期间 draw 只登记 pending、pick 返回 null。成功终点无 yield 执行完整 mismatch 核对、恢复 ready 并补一次 draw；任何 checkpoint / panel / guard fault 清 suspension 并标 `invalid`，不再消费临时资源。
- 正式反例：`EditHistory` 驱动正式 tracker。sync/async retained-only 为 `source 1/2 + topology 0`，sync surface 为 `3/3`；受控 async surface 的每个 yield 都观察 suspended，成功为 `4/4`；真实 city relocation 为 `source 5 + topology 4`；下一 async surface 在第二次 assertCurrent 抛错后 state=invalid、draw 不增加、pick=null。
- 门禁：prepared installer `17 cases / conservativeTopologyIntegration / asyncSurfacePublish / asyncSurfaceFaultInvalid true`、panel refresh、完整 11-kind worker-task、`typecheck:core`、1397-module build、语法与 diff-check PASS；browser / CDP `0`，待第二次 blocker-only。
- 第二次 blocker-only：最终 `ACCEPT / P0 0 / P1 0`。评审独立确认 suspend / ready / invalid 状态机、逐 yield 隔离、selection 早退、commit fault、pending draw、嵌套计数、同步路径和 context 恢复无残余，并独立通过 installer 17、panel、typecheck 与 diff。R3b 冻结。

## 350-R4a：presentation / picking / overlay 完成度复查

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a`；复查 presentation-only、camera/hover/pan、picking/overlay 与 cache generation 的完整契约 |
| 当前阶段 | `R4a-f5` 最终 `ACCEPT / P0 0 / P1 0`；R4a 全阶段冻结，已进入 R4b |
| 最小验收 | view/theme/layer/camera/hover/pan/picking/line preview；presentation 0 map/history/Worker delta；地图替换保留偏好；专项/typecheck/build/diff |
| 非目标 | R4b export/context restore、browser/CDP、视觉验收、persistence、main 合并 |
| 产品文件 | renderer presentation/picking/overlay、runtime display mutation 边界；仅在盘点确认 blocker 后修改 |
| 夹具文件 | 既有 presentation/picking/overlay Node 门与必要的 0-delta 集成反例 |
| 首个廉价门 | 现有 renderer/picking/presentation 专项盘点后确定 |

### 350-R4a-f1：presentation / picking / overlay Node 夹具冻结

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f1`；为固定入口 11～13 建立完整非浏览器前置和 presentation 0-delta 自证 |
| 当前阶段 | 经 `R4a-p1/f1a/f1b` 修正与最终评审 `ACCEPT / P0 0 / P1 0`；阶段冻结 |
| 最小验收 | theme/view/layer 不写 canonical/revision/history/Worker map input；导出副本保存 live theme 且 source checksum 不变；五类 picking、retained owner、pan/hover/preview 前置不可删 |
| 非目标 | 修改产品、运行 browser/CDP、R4b export 视觉、persistence fallback、main 合并 |
| 产品文件 | `0` |
| 夹具文件 | presentation contract、catalog 精确 R4a 前置、R4a 聚合入口 |
| 首个廉价门 | `regress:presentation-contract` |

- 盘点结果：既有入口 11 只登记 city/hover，漏 marker/route/river、prepared retained owner 与 render preparation；入口 12/13 也未登记 deferred presentation 与完整 pan/preview 前置。catalog 现按三入口逐项冻结并增加删除反例。
- 新 presentation contract 使用 Babel AST 精确函数边界，拒绝 live theme intent 调用 canonical map 写 helper；真实 1k map 另要求 `createMapDocument` 将 live theme 投影到独立文档，同时 source deep equal 与 replica checksum 均不变。
- 当前首败为产品：`setRuntimeVisualTheme` 与 `applyRuntimeVisualThemeState` 仍调用 `syncMapVisualThemeStore`，而 `createMapDocument` 又让 source map 的旧 `options.visualTheme` 覆盖 live document option。同一 revision 下会产生 persisted-presentation checksum 漂移，且若移除双写，当前导出会丢 live theme。夹具预期已冻结，插入纯产品 `R4a-p1`。

### 350-R4a-p1：live theme intent / persisted document projection

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-p1`；让运行时主题意图与 canonical map 解耦，同时在独立存档副本保存当前主题 |
| 当前阶段 | 第二次 blocker-only 最终 `ACCEPT / P0 0 / P1 0`；产品与 f1 系列冻结 |
| 最小验收 | live theme 不写 canonical/revision/history/Worker input；document/map 两处主题一致；source deep equal/checksum 不变；visual-theme 正式命令仍可持久化 |
| 非目标 | 修改 frozen presentation fixture、迁移旧 map-file fixture、R4b export 视觉/context restore、browser/CDP、main 合并 |
| 产品文件 | `runtime/app.js`、`runtime/map-file-io.js` |
| 夹具文件 | `0`；复用已冻结 `webgl-generator-presentation-contract-regression.mjs` |
| 首个廉价门 | `regress:presentation-contract` |

- `setRuntimeVisualTheme` / `applyRuntimeVisualThemeState` 只维护 runtime intent、UI 与 renderer；正式用户主题增删改仍先由 history command 写 canonical map，再调用该 projection helper，因此持久化编辑语义不变。
- `createMapDocument` 在 schema normalization 返回的独立 map 上投影 `documentOptions.visualTheme`，并复制 visual theme overrides / user theme colors；源地图 deep equal 与 canonical replica checksum 均不变。
- 门禁：presentation contract、GPU display mutation、visual themes、API data compatibility、完整 11-kind worker-task、`typecheck:core`、1397-module build、diff-check PASS；browser/CDP `0`。
- `regress:map-file-io-worker` 的旧 render fixture 仍传 `{mapIdentity,mapRevision}` 并期待三字段 prepared binding，现被 R3b 完整 resource binding 校验拒绝。该问题在本产品阶段不修改，待接受后单列 `R4a-f2` 迁移夹具。

- 首轮评审：`BLOCK / P0 0 / P1 2`。一是 `captureVisualThemeState(map, livePreset)` 把 live 写成 canonical before preset，undo 后地图被污染；二是 active theme 只存在本地 registry 时，正式导出只传 ID，存档缺 colors。两项均属产品而非旧 fixture drift。

### 350-R4a-f1a：live/canonical history 与 portable user theme 夹具冻结

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f1a`；冻结评审发现的两类 theme 交叉状态，产品保持不动 |
| 当前阶段 | 修正已由 `R4a-p1` 最终 blocker-only 接受；夹具作为已接受前置冻结 |
| 最小验收 | canonical before 与 live before 分离；create/import/update/delete 显式 live after；undo/redo 双状态恢复；registry-only active theme 可移植往返 |
| 非目标 | 修改产品、迁移旧 map-file binding fixture、R4b、browser/CDP、main 合并 |
| 产品文件 | `0` |
| 夹具文件 | visual-theme boundary、catalog entry 11 与删除反例、R4a 聚合入口 |
| 首个廉价门 | `regress:visual-theme-boundary` |

- 新门先以 AST 锁定四类 runtime theme 命令必须显式维护 `presentationPreset`，再以正式 `EditHistory` 验证 canonical=`default` / live=`ancient` 的 apply→undo→redo；另用第三个 presentation 参数要求 `createMapDocument` 深克隆 active registry-only user theme 并通过 stringify/parse 保持颜色。
- 首败为 `createRuntimeVisualTheme` 的 after state 没有独立 presentation preset，符合评审定位；catalog 自测与 diff-check PASS，产品改动 `0`、browser/CDP `0`。

### 350-R4a-p1 blocker-only 修正

- `captureVisualThemeState` 的 canonical preset 现只取 `map.visualTheme/map.options`，live preset 独立存为 `presentationPreset`；command 在 apply/revert 后更新自己的 active presentation state，scheduler 同步/异步 refresh 均读取该方向值。
- create/import/update/delete 的 after state 显式区分 canonical/live：import `select=false` 同时保留两侧原值，delete 只在各自指向被删主题时回落 default，undo/redo 因而不会互相污染。
- `createMapDocument` 新增非文档 options 的 presentation 参数；active user theme 定义先经正式 normalizer 校验 ID，再合并到独立 map 副本。console JSON/压缩 API、archive Worker caller 与 map-file Worker 转发均已接线，canonical source 不写入。
- 门禁：visual-theme boundary、presentation contract、visual themes、API data compatibility、GPU display、完整 11-kind worker-task、typecheck、1397-module build、语法与 diff-check PASS；browser/CDP `0`，待同一评审 blocker-only。

- 第一次 blocker-only：`BLOCK / P0 0 / P1 1`。active registry-only export 已闭合；残余是 canonical `userThemes` 与 registry 全集仍共用 before-image，registry 超集时 undo 会把 map 外主题注入 canonical。

### 350-R4a-f1b：canonical / registry themes 集合分离夹具

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f1b`；固定 registry 为 canonical 超集时的用户主题事务边界 |
| 当前阶段 | 修正已由 `R4a-p1` 第二次 blocker-only `ACCEPT / P0 0 / P1 0`；夹具冻结 |
| 最小验收 | 两份 themes before-image；create/import/update 分别 upsert；delete 分别 remove；五类 undo/redo 精确恢复 map、registry 与 live preset |
| 非目标 | 修改产品、修改 f1a、旧 map-file binding fixture、browser/CDP、R4b、main 合并 |
| 产品文件 | `0` |
| 夹具文件 | visual-theme registry boundary、catalog entry 11 与删除反例、R4a 聚合入口 |
| 首个廉价门 | `regress:visual-theme-registry-boundary` |

- registry 预置一个 map 外主题，canonical `userThemes=[]`；五类 case 分别验证 undo 后 map deep equal、registry deep equal、live 精确恢复，以及 redo 后两份集合只包含各自应有定义。
- 首败为 create 的 app after state 仍直接使用旧 `before.userThemes` 语义，没有 `upsertVisualThemeDocuments` 分别处理 canonical / registry；catalog 与 diff-check PASS，产品改动 `0`、browser/CDP `0`。

### 350-R4a-p1 第二次 blocker-only 修正

- `captureVisualThemeState` 现从 map 克隆 canonical `userThemes`，另从全局 registry 捕获 `registryUserThemes`；command apply/revert 用后者恢复 registry、前者恢复 map，旧调用未提供 registry 字段时仍回退到 canonical 列表。
- create/import/update 的 canonical 与 registry 分别 upsert；import 重名检查覆盖两份集合，`select=false` 只保留各自 preset；delete 分别 remove，current/non-current live fallback 保持精确。
- registry-superset 五类门、前一 visual-theme boundary、visual themes、presentation、API data、GPU display、typecheck、1397-module build、语法与 diff-check PASS；browser/CDP `0`，现做第二次 blocker-only。

- 第二次 blocker-only：最终 `ACCEPT / P0 0 / P1 0`。评审确认 canonical/registry 两份集合、旧 state fallback、四类 mutation 与五类 history 往返全部闭合，portable export 未回归；R4a-p1 冻结。

### 350-R4a-f2：map-file Worker complete render binding 夹具迁移

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f2`；把旧 map-file render fixture 对齐 R3b 完整 resource binding |
| 当前阶段 | 已经同一只读评审 `ACCEPT / P0 0 / P1 0`；阶段冻结并返回 R4a cache/publish 盘点 |
| 最小验收 | request/expected 均含 source/topology/preparation/generation；正式 map-file Worker import/export/storage 全门通过；validator 不放宽 |
| 非目标 | 修改产品、theme 产品边界、R4b、browser/CDP、main 合并 |

- 结果：request 与 expected 都由正式 `createRenderResourceBinding` 生成并做完整深比较；真实 `worker_threads` map-file task 保留 render 进度、point `Float32Array` DTO、旧档、plain/gzip/webfmg/browser storage、损坏输入及 100k transfer/压缩覆盖。
- 独立评审：`ACCEPT / P0 0 / P1 0`。`regress:map-file-io-worker`、`regress:render-preparation`、`typecheck:core`、目标脚本语法与 diff-check 独立 PASS；产品 validator 未放宽，browser/CDP `0`。

### 350-R4a-f3：正式绘制 cache resource owner 夹具

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f3`；冻结 line/point/route/river/trade-flow/selection 六类 cache 的完整 binding owner、引用 wrapper 与异步 publish 边界 |
| 当前阶段 | 最终复核 `ACCEPT / P0 0 / P1 0`；AST、17 引用、exact keys 与 6 个 mutation 冻结 |
| 最小验收 | 六族完整 owner；draw 拒绝跨 map/topology/generation 与引用混装；prepared transaction/context restore 同源；route/river 最后 current gate 后 publish |
| 非目标 | preview/diagnostic 临时 buffer、R4b context 视觉、browser/CDP、main 合并 |
| 产品文件 | `0` |
| 夹具文件 | 新 cache owner regression、catalog 三入口前置、package 聚合门 |
| 首个廉价门 | `regress:render-cache-resource-binding` |

### 350-R4a-p2a：cache owner 产品 blocker 收口

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-p2a`；收口 p2 独立评审发现的 partial topology、retained rebind、trade pick、late context restore 四项 P1 |
| 当前阶段 | 最终 blocker-only `ACCEPT / P0 0 / P1 0`；R4a inventory 未发现该产品范围新缺陷 |
| 最小验收 | partial/full topology 分流；surface-only retained 原子 commit/rollback/fault；trade pick 四类拒绝；restore yield 中 B 接管后 A 只清 staged |
| 非目标 | 移动已接受 f3 预期、R4b、browser/CDP、main 合并 |
| 产品文件 | render binding helper、app render request、prepared installer、retained/cache renderer、context restore |
| 夹具文件 | prepared installer 19-case、worker-task controlled restore takeover |
| 首个廉价门 | `regress:prepared-render-installer` |

- 产品归因：四项均可在真实产品控制流复现，不属于夹具漂移。修正后 partial point/route 不再制造与 surface 不同 topology 的 owner；surface 换代会在旧 wrapper 当前、同 map/generation 且新层缺失时事务性重绑 retained；trade pick 在读 pickItems 前强门；restore 的 surface/line/point/route/river/trade/selection/political debug 全部先写 staged，末次 exact guard 后同步发布。
- 当前证据：installer `cases=19 / partialRenderTopology=true / tradeFlowPickOwner=true`；worker-task `lateRestoreRejected=true / stagedTakeoverYields=23 / restoreAttempts=2 / successfulRestoreDraws=1`；cache、panel、viewport、GPU、render-preparation 10004-cell、typecheck、1398 modules build、语法与 diff-check PASS；browser/CDP `0`。
- 第一次 blocker-only：`BLOCK / P0 0 / P1 1`，前三个原 blocker 接受；context A obsolete 后全局仍 restoring 且事件不再触发。现由 `restoreWebGlContextUntilCurrent` 持有恢复职责，只对 obsolete 自动重启，单次 attempt 清 A 后先回 lost；新反例固定 `restoreAttempts=2 / successfulRestoreDraws=1 / final ready`。worker-task、语法、diff PASS，browser/CDP `0`。
- 第二次 blocker-only：`BLOCK / P0 0 / P1 1`，owner 重试存在但未继承 B，且夹具第二次用 stub。现 owner 在让步后捕获当前 latest B 并传入下一正式 attempt，正式 restore 以 B 的 source/topology 发行 context generation C。fixture 第二次真实走生成地图、surface、point/route/river/trade/selection、picking/overlay owner 与最终 draw；固定 `23 yields / 2 attempts / 1 draw`、C generation 大于 B、source/topology 相同、全 owner 对齐。browser/CDP `0`。
- 最终 blocker-only：`ACCEPT / P0 0 / P1 0`。同一评审独立确认 B→C 捕获/派生、真实第二次完整 restore、六族 cache 与 retained/surface owner 对齐、唯一 draw、ready/lost=false，以及非-obsolete fault 不重试；独立 worker-task、typecheck、语法、diff-check 全 PASS，browser/CDP `0`。
- R4a 最终门：`regress:task-350-r4a` 的 catalog、presentation/theme/registry、GPU/cache、Worker/render/installer、picking/viewport/overlay 与 typecheck 全 PASS；随后生产 build `1398 modules` PASS。browser/CDP `0`，现只做阶段 inventory，不新增产品范围。

- 首次评审归因：三项均为验收夹具缺口，不是本轮产品判定——整文件正则可由注释/字符串假绿；仅 routeBuffer 单字段反例不能证明 17 个 wrapper 引用；入口 11～13 虽已声明新门，但权威 requirement 与逐项删除矩阵遗漏它。
- 夹具修正：Babel AST 精确找到 `PlaceholderMapRenderer` 的 draw、本地上传及 route/river async 方法，只接受 executable call 并校验 current gate 先于 owner publish；另用删除真实调用、保留 comment/string token 的 3 个 mutation 证明门会失败。六族 `6 + 2 + 3 + 2 + 2 + 2 = 17` 个引用逐项替换并要求精确 reason，catalog 三入口各自删除新前置均必须拒绝。
- 当前证据：`regress:render-cache-resource-binding` 输出 `referenceCases=17 / astMutationCases=3`，catalog 为 `55 / 57 / 63`，prepared installer `17 cases`，diff-check 全 PASS；产品文件保持冻结，browser/CDP `0`。
- 第一次 blocker-only 仍 `BLOCK / P0 0 / P1 2`：评审用 `if(false) assert...` 与 `(isCurrent..., false)` 证明 call/位置尚不足，并指出夹具矩阵不能独立发现产品 wrapper 第 18 字段。现已要求 draw 调用为正式 try block 直接语句；async current 取反为拒绝 test 的顶层 OR 项、分支直接 `return false`，owner adoption 为其后同 block 直接语句；两类新 mutation 均必须拒绝。每族 wrapper keys 另与 `owner + expectedFields` 做 exact set 比较。目标门现为 `referenceCases=17 / astMutationCases=5`，browser/CDP `0`。
- 第二次 blocker-only 只剩 `BLOCK / P0 0 / P1 1`：八个 uploader 中通用递归 call 搜索可由未调用箭头函数假冒。现逐方法把 owner adoption 限定为正确 method body/try block 的直接 ExpressionStatement，async 第三参数必须是正式 `resourceBinding`；新增 selection 未调用箭头函数 mutation。cache `17 references / 6 AST mutations`、catalog `55 / 57 / 63`、installer 17-case、diff-check PASS，产品与 browser 均为 `0`。
- 最终复核：`ACCEPT / P0 0 / P1 0`。同一评审确认八个 uploader 的直接发布、route/river async current rejection、六族 wrapper exact keys、17 个逐项引用反例与 6 个 AST 破坏性反例全部有效；browser/CDP `0`。f3 冻结，后续评审不得再移动其预期。

### 350-R4a-f4：markers picking DTO complete binding 夹具迁移

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f4`；迁移 markers-core 遗留的非正式 picking binding |
| 当前阶段 | 同一只读评审已 `ACCEPT / P0 0 / P1 0`；阶段冻结并返回 p2 聚合 |
| 最小验收 | 正式 helper 生成完整 binding；build/rebuild 同一 binding；markers 数量/pick/DTO/export 保持；产品 validator 不动 |
| 非目标 | cache 产品、markers 产品、browser/CDP、main 合并 |
| 产品文件 | `0` |
| 首个廉价门 | `regress:markers-core` |

- 独立结果：完整五项 binding 与 build/rebuild 同一引用成立；`markers / pointVertices / picking / DTO / exported = 8 / 8 / 8 / 8 / 8`，产品 picking DTO/validator 未修改。专项、语法、diff PASS，browser/CDP `0`。

- 首败：正式 `render-cache-resource-binding.js` 尚不存在；这与当前 renderer 只有 surface/retained owner、六类 cache 没有 owner 的源码盘点一致。catalog 自测通过并扩为 `55 prerequisites / 57 scripts / 63 sources`，语法与 diff-check PASS；browser/CDP `0`。

### 350-R4a-p2：正式绘制 cache owner 产品接入

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-p2`；让六类正式绘制 cache 在上传、prepared commit、context restore 与本地 refresh 后拥有真实完整 owner |
| 当前阶段 | 经 `R4a-p2a` 最终 blocker-only `ACCEPT / P0 0 / P1 0`；产品范围冻结 |
| 最小验收 | frozen f3 全过；prepared commit/rollback 原子；draw 前 owner/ref 门；context 换代重绑；scheduler 将 current binding 传给 line/point；相邻专项/typecheck/build/diff |
| 非目标 | 修改 f3 预期、preview/diagnostic 临时 buffer、R4b、browser/CDP、main 合并 |
| 产品文件 | cache owner helper、placeholder renderer、prepared installer、edit refresh scheduler |
| 夹具文件 | `0`；复用冻结 f3 与既有 installer/viewport/GPU 门 |
| 首个廉价门 | `regress:render-cache-resource-binding` |

### 350-R4a-f5：最终聚合与权威状态闭合

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4a-f5`；让最终聚合真实覆盖已接受 f2，并消除旧阶段状态歧义 |
| 当前阶段 | 最终 blocker-only `ACCEPT / P0 0 / P1 0`；阶段冻结 |
| 最小验收 | R4a aggregate 直接引用 map-file Worker；删除该引用 catalog 必败；f1～f4、p1/p2/p2a 状态显式闭合；p2 无误置 f2 内容 |
| 非目标 | 修改产品源码、R4b、browser/CDP、main 合并 |
| 产品文件 | `0` |
| 夹具文件 | package R4a aggregate、catalog audit/regression |
| 首个廉价门 | `regress:task-350-acceptance-contract` |

- inventory 归因：两项都是验收/文档闭合问题，不是已实现产品问题。聚合新增正式 `regress:map-file-io-worker`；catalog audit 读取实际 package scripts 并要求该直接前置，回归通过删除命令中的引用证明缺口必被拒绝。
- 当前证据：catalog、两处脚本语法、diff-check PASS；更新后的 `regress:task-350-r4a` 明确先执行 map-file Worker 的 plain/压缩/browser envelope/损坏/100k 门，再完成 presentation/theme/registry、GPU/cache、Worker/render/installer、picking/overlay 与 typecheck，全组 PASS。产品 `0`、browser/CDP `0`。
- 首次 blocker-only：`BLOCK / P0 0 / P1 1`。权威状态闭合已接受；聚合 parser 仍能把 echo/comment 中的 token 误当执行。现要求 `&&` 分隔后的每个完整段都是直接 `pnpm run <script>`，并以 echo-string、shell-comment 两个 mutation 固定拒绝；此前真实完整聚合与产品不重跑。
- 最终 blocker-only：`ACCEPT / P0 0 / P1 0`。评审确认删除真实 map-file、echo token、shell comment 三类 mutation 均命中正式 validator 并失败；真实 package aggregate 直接执行 map-file Worker。catalog、两脚本语法、diff-check 独立 PASS，产品/browser 均为 `0`。

## 350-R4b：export / context restore 完成度复查

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4b`；复查 S-14 export 与 S-17 context restore 的同图/同 presentation/资源恢复 |
| 当前阶段 | R4b 全部最终接受；转 R5a |
| 最小验收 | export Node/PNG options；10k export fixture；独立 context fixture；renderer restore contract；typecheck/build/diff；独立评审 |
| 非目标 | 实际 browser/CDP、刷新/换图冒充 restore、persistence R5a、main 合并 |
| 产品文件 | f1 为 `0`；p1 仅 API contract / console bridge / renderer debug hook |
| 夹具文件 | 两个 export browser scripts、独立 context browser script、R4b fixture contract/catalog/package aggregate |
| 首个廉价门 | `regress:r4b-fixture-contract` |

### 350-R4b-f1：export / context browser 夹具冻结

- 基线：heightmap、PNG options、通用 export、worker context restore、typecheck 全 PASS；没有 Node 产品首败。
- 夹具缺口：两个 export 入口仍以 3k 运行，缺完整 failure-safe artifact、导出窗口 LongTask 硬门与 presentation/state exact；context restore 只有旧综合脚本 flag，直接访问 renderer extension，缺独立入口、稳定 debug hook receipt 及完整 owner/picking 断言。
- 冻结方向：三入口统一 Task 350 full/summary/finally/teardown；export 10k 且导出前后 map/history/revision/camera/layers/theme 不变；context 由 `debug.simulateContextLoss` 发起，不刷新/不换图，restore 后 surface、六族 cache、picking/overlay/label owners 同源、city pick 相同、唯一 draw、ready/lost=false。
- 首轮评审 `BLOCK / P0 0 / P1 3`：AST 会接受不可达调用；server teardown 内层 race 成功吞 timeout；context 未核对 before owners。修正后只接受直接语句，server 永不退出产生 `browser_teardown_timeout`，before/after owners 分别精确绑定 receipt。
- 第一次 blocker-only 仍 `BLOCK / P0 0 / P1 1`：page-evaluate 内 `if(false)` target 仍被递归识别。最终改为精确 `VariableDeclaration = await page.evaluate(...)`，回调只接受顶层 `unwrap(await target(...))` 表达式/变量初始化，新增 4 个 unreachable mutation。
- 最终 blocker-only `ACCEPT / P0 0 / P1 0`：fixture contract `27 mutations`、artifact 四态、catalog、四目标脚本语法、diff 全 PASS；产品改动 `0`、browser/CDP `0`。

### 350-R4b-p1：稳定 debug context-loss 桥接

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R4b-p1`；让冻结的 context fixture 通过受控公共 debug API 触发真实恢复 |
| 当前阶段 | 首轮独立评审阻断；转 `R4b-p1a` |
| 最小验收 | API contract/schema；确定性 lost/restored 事件；before/after owner；generation/draw/state；worker context；typecheck/build/diff；独立评审 |
| 非目标 | browser/CDP、刷新/换图、普通 UI、改写 restore 主算法、R5a、main 合并 |
| 产品文件 | api-contract、console-api、placeholder-renderer |
| 夹具文件 | 独立 context-loss debug Node 门及 API 固定计数/元数据同步 |
| 首个廉价门 | 新 context-loss debug Node 门 |

- 产品结果：`debug.simulateContextLoss` 只接收 `restoreDelayMs`，调用前冻结同一 map 的 surface、六族 cache、picking/label/overlay owner，随后经真实扩展 lost/restored 事件与既有 renderer restore Promise 收束；receipt 固定 source/topology 不变、generation `+1`、一次 draw、最终 context/retained ready。
- 专项证据：确定性 context-loss Node 门覆盖成功、并发、五类非法参数、无扩展与混装 owner；API contract/schema/discovery 同步为 `329` 项，capability matrix 为 `1229 / 1155 / 74 / 0 / 0`。完整 R4b Node 聚合进一步通过 9 项 export、Worker context、六族 cache、installer `19 cases`、主题、城市 picking 与 typecheck；production build `1398 modules`、diff-check PASS。
- 边界：浏览器/CDP `0`，未刷新、未换图、未改写 restore 主算法；现交同一只读智能体做产品与夹具独立评审。

### 350-R4b-p1a：context-loss waiter / 正式 handler / business codes

- 首轮评审：`BLOCK / P0 0 / P1 3`。同步 `loseContext/restoreContext` 抛错会遗留 120 秒 waiter；专项自行安装 restored owner，破坏产品正式 restored listener 后仍可假绿；公开 schema 漏列 cache/retained owner mismatch。
- 产品修正：waiter 改为 `{promise,cancel}`，trigger 同步 fault 立即移除 listener、timeout 并返回既有 `render-context-loss-receipt-invalid`；lost/restored 逻辑提取为 renderer 正式 lifecycle 方法，构造器单次安装，恢复 Promise 仍调用 `restoreWebGlContextUntilCurrent`。
- 夹具修正：Fake extension 只发事件，harness 安装产品正式 lifecycle handler；源码断言构造器必须调用安装方法。新增 lose/restore 同步 fault 的 timer/debug promise/unhandled rejection 负例、retained owner mismatch 负例，并断言两类 owner code 均公开。
- 当前证据：context-loss debug `invalidCases 10`、API docs audit/discovery `329 / 329`、stability `320 / 8 / 1`、完整 Worker context、typecheck、两脚本语法与 diff PASS；browser/CDP `0`。
- blocker-only 最终 `ACCEPT / P0 0 / P1 0`：waiter cancel、正式 lifecycle handler、两类公开 owner code 及全部新增负例均闭合。R4b 最终接受，转 R5a 持久化兼容盘点。

## 350-R5a：persistence / compatibility 完成度复查

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R5a`；复查 S-02/S-14/S-15 的旧档、当前档、storage/fallback、save/archive receipt 与 source immutable |
| 当前阶段 | `R5a-f1 / R5a-f2a` 均最终接受；当前 R5a 主阶段最终 inventory |
| 最小验收 | whole-map 四 profile、map-file Worker、compatibility/migration、storage/cloud、save naming/receipt、typecheck/build/diff 与独立评审 |
| 非目标 | 浏览器/CDP、R5b feedback、产品 UI 改造、main 合并 |
| 产品文件 | R5a-f1 / f2 / f2a 均为 `0`；当前 inventory 未发现产品 blocker |
| 首个廉价门 | `regress:map-save-naming` |

### 350-R5a-f1：map-save async load 夹具迁移

- 基线：whole-map profile、map-file Worker、API data compatibility、migration、cloud storage 与 map-storage 文案全绿；只有 map-save naming 的旧正则要求同步 `refreshRuntimeAfterMapLoad`。
- 正式产品：`loadMapIntoRuntime` 当前先 `await refreshRuntimeAfterMapLoadAsync({restorePanels:true,operation,isCurrent})`，成功后刷新 cloud filename preview 并同步 control UI，行为契约没有缺失。
- 夹具修正：精确切出 `loadMapIntoRuntime` 函数，要求上述三步按顺序直接出现；避免在整文件其它调用点假绿。产品文件 `0`；map-save naming、脚本语法、diff PASS，browser/CDP `0`，待独立评审。
- 首评：`BLOCK / P0 0 / P1 1`，确认产品顺序正确；原 indexOf/regex 仍可被 `if(false)`、注释或字符串假绿。
- blocker 修正：Babel AST 精确定位 async FunctionDeclaration 的外层 try，三个目标必须是相邻直接 ExpressionStatement；不可达 if、字符串和未调用 async function 三个 mutation 均命中 validator。产品 `0`；专项/语法/diff PASS，待 blocker-only，browser/CDP `0`。
- blocker-only 第二次：`BLOCK / P0 0 / P1 1`。原三类不可达假绿已闭合，但 preview/sync 仅校验 callee 名，refresh/options 也未限制 exact arity/keys；非 optional preview、错序 sync、多参 refresh/preview 或多余 option 仍可假绿。
- 冻结方案：第三轮只补 exact AST shape 与四类 mutation，不改产品、不跑浏览器；但本项已触发仓库“夹具连续两次失败必须冻结并请用户裁定”，故当前停止在此。
- 用户已授权继续。第三轮实现要求 refresh 恰好三参/options 三键、preview 为 OptionalCallExpression + OptionalMemberExpression 且零参、sync 两参顺序精确；新增非 optional preview、preview 多参、sync 错序、refresh 第四参和多 option 五个 mutation。原三类可达性 mutation 保留，专项/语法/diff PASS，产品/browser 均为 `0`，待最终 blocker-only。
- 最终 blocker-only：`ACCEPT / P0 0 / P1 0`。八类 reachability/call-shape mutation 全拒绝，独立 map-save naming、语法、diff PASS；产品/browser 均为 `0`。

### 350-R5a-f2：storage backend 与 holey identity 持久化边界

| 项目 | 冻结内容 |
|---|---|
| 目标 | 直接执行正式 browser storage 读写函数；固定 LocalStorage / IndexedDB 仲裁、fallback、direct-binary；固定 holey / 高编号 identity array 仅在持久投影抢救 |
| 非目标 | 产品算法、真实 browser/CDP、用户现存 storage、R5b feedback |
| 唯一写者 | 主线程 |
| 产品文件 | `0` |
| 工具边界 | 新增 `webgl-generator-persistence-boundary-regression.mjs`；package/catalog/aggregate 与本节文档 |
| 最小验收 | persistence 专项、acceptance catalog mutation、R5a 聚合、typecheck、diff、同一只读智能体独立评审 |

- 确定性 fake LocalStorage / IndexedDB 已覆盖 local 成功删除旧 fallback、quota/no-local fallback、fallback 失败保留原 quota、非 quota 不改道、savedAt 双向仲裁、direct-binary、IndexedDB read 失败保留 local。
- 真实 1k 图的 cities/burgs 扩展到 `5000`、routes 扩展到 `7000`；持久投影逐槽 own-property 且 hole 为 null，JSON roundtrip 保留高编号，运行时源数组稀疏 profile、数组引用及高编号对象引用均不变。
- `regress:persistence-boundary` 已进入固定入口 16/17、persistence-import/archive-export profile 与 R5a 聚合；catalog 对删除任一关键前置均拒绝。完整 R5a Node 聚合、专项/catalog/语法/diff PASS，browser/CDP `0`，待独立评审。
- 首评 `BLOCK / P0 0 / P1 1`，产品问题 `0`：原 `Array.every` 检查会跳过 hole，且首洞 null + JSON roundtrip 无法排除后续残留 hole。`R5a-f2a` 改为逐索引 own-property/null 硬门，并为 cities/burgs/routes 各加入只补首洞的破坏性反例；只做 blocker-only 复审。
- `R5a-f2a` blocker-only `ACCEPT / P0 0 / P1 0`：同一评审独立确认逐槽断言、三类伪投影拒绝与源 before-image 保持；专项/catalog/语法/diff PASS，browser/CDP `0`。当前返回 R5a 主阶段最终 inventory。

### 350-R5a-f3：交接状态收口

- R5a inventory 首评未发现产品或夹具 P1，但交接表头仍写 f2 待评审，且产品文件栏只登记 f1。最窄文档修正统一为 f1/f2a 已接受、R5a 正在最终 inventory，f1/f2/f2a 产品文件均为 `0`；不改产品、夹具或聚合，只做 blocker-only 文档复审。
- blocker-only 与 R5a 主阶段最终均 `ACCEPT / P0 0 / P1 0`：文档状态统一，inventory 的产品与夹具 blocker 均为 `0`，browser/CDP `0`。阶段冻结并转 R5b。

## 350-R5b：Loading / feedback / error surface 完成度复查

| 字段 | 冻结内容 |
|---|---|
| 权威编号与目标 | `350-R5b`；复查 S-08/S-09/S-16 的成功、no-op、busy、invalid、obsolete、cancel、fault、retry、快速/延迟反馈与 Loading 终态 |
| 当前阶段 | Node 完成度盘点 |
| 最小验收 | API operation、Loading/feedback Node 门、普通 UI 技术术语 copy audit、typecheck/diff 与独立评审 |
| 非目标 | browser/CDP、R6 fixture freeze、产品功能扩展、main 合并 |
| 唯一写者 | 主线程 |
| 首个廉价门 | 现有 API operation / delayed-operation-feedback 专项 |

### 350-R5b-f1：global-shell 启动文案夹具迁移

- API operation、delayed feedback、UI copy、storage copy 基线全绿；global-shell 首败是测试仍期待旧“正在装配地图引擎”，正式 `main.js` 已使用当前“正在展开地图画卷”。本子阶段只改一条源码断言，产品 `0`，以 global-shell、语法、diff 和独立评审验收。
- 另已用正式 `failStartupLoading` 复现普通启动页泄漏 `Worker session buffer checksum mismatch`；这是独立产品 P1，冻结为 f1 接受后的 `R5b-p1`，本阶段不顺带修改。
- f1 首评 `BLOCK / P0 0 / P1 1`，唯一问题是根 AGENTS 当前状态仍写 R4b；夹具与产品问题 `0`。`R5b-f1a` 只同步该行到 R5a 已接受、f1 待 blocker-only、p1 已冻结，随后做文档复审。
- `R5b-f1a / f1` 最终 `ACCEPT / P0 0 / P1 0`，进入冻结的产品 `R5b-p1`。

### 350-R5b-p1：普通启动错误与技术诊断分层

- `startupFailureMessage` 普通模式固定“地图画卷未能打开，请刷新页面后重试”，显式 `{debug:true}` 才保留原始异常；`failStartupLoading` 和 main 的 app-status 共同使用普通 formatter。health monitor 与 console 仍记录原始异常。
- global-shell 以 `Worker session buffer checksum mismatch` 验证启动页零技术词，验证 debug 仍可见原文，并锁定 main 不再把 raw message 拼进 app-status。产品文件仅 startup-loading/main，browser/CDP `0`。
- p1 首评 `BLOCK / P0 0 / P1 1`，唯一问题是根 AGENTS 当前状态仍写 f1 待复审；产品/夹具问题 `0`。`R5b-p1a` 只同步为 f1/f1a 已接受、p1 待 blocker-only，随后做文档复审。
- `R5b-p1a / p1` 最终 `ACCEPT / P0 0 / P1 0`：普通启动错误分层与文档状态均闭合。

### 350-R5b-f2：feedback / fault / copy Node 完成门

| 项目 | 冻结内容 |
|---|---|
| 目标 | operation fault/迟到终态、delayed timer 精确边界、普通 copy 禁词从声明变成执行、R5b 聚合强制 |
| 非目标 | 产品代码、browser/CDP、R6 fixture freeze、UI 新功能 |
| 产品文件 | `0` |
| 工具/文档 | api-operation、delayed feedback、ui-copy audit/matrix、catalog/regression、package aggregate 与权威状态 |
| 最小验收 | 三专项、catalog mutation、完整 R5b aggregate、typecheck/diff、同一只读评审 |

- operation 门现覆盖 success/noop/invalid/obsolete/busy/cancel/runtime fault/snapshot fault/rollback fault/retry/non-loading/late report，要求每次 Loading 关闭、manager idle、rollback fault 稳定 code/health。
- delayed feedback 使用确定性时钟：23ms 不显示、24ms 显示；错 operation id 不误清、unknown token 返回 false、destroy 清 token/timer 且迟到回调不复活。
- UI copy policy 扩为 21 禁词，并对 181 个正式普通文案样本实际执行；debug/structured diagnostics 不在普通样本集中。固定入口 18～20 与 R5b aggregate/catalog 均含防删 mutation。完整聚合 PASS，browser/CDP `0`。
- f2 首评 `BLOCK / P0 0 / P1 1`，唯一问题是 catalog 只强制新增前置，既有 api-operation/delayed/map-save-naming 可删。`R5b-f2a` 将 18～20 的完整声明集合逐项纳入 requirements 和删除 mutation；产品/三专项问题 `0`，只做 blocker-only。
- `R5b-f2a / f2` 最终 `ACCEPT / P0 0 / P1 0`：三个固定入口的 11 项前置全被逐项强制；catalog/语法/diff PASS，browser/CDP `0`。当前返回 R5b 最终 inventory。

### 350-R5b-p2：高度模板存储错误的普通提示分层

- R5b inventory 首评 `BLOCK / P0 0 / P1 1`：`height-panel.js` 在缺少浏览器存储时把 `LocalStorage` 原样写入普通 notice；既有 UI-copy 只执行 curated 样本，未触发正式高度面板路径。
- 产品边界仅高度面板：缺存储与 getter `SecurityError` 统一返回“当前无法保存用户模板，请检查浏览器设置后重试”，显式 debug 与结构化 diagnostic 仍保留原始异常/backend；正式 panel command 提供可测试的 step/save/notice 边界，不加载 Vue 组件。
- 新增 `regress:height-panel-storage-copy` 动态覆盖 missing/access-denied，UI-copy 同源采样；R5b aggregate、入口 19/20 prerequisite 与逐项删除 mutation 同步，固定前置为 13 项。最小门为专项、UI-copy、catalog、typecheck、diff 与同一只读评审；browser/CDP `0`。
- `R5b-p2` 最终 `ACCEPT / P0 0 / P1 0`：普通/debug/diagnostic 分层、正式 panel command 动态路径和 catalog/aggregate 均经独立复核；专项、183 samples、catalog、typecheck、语法、diff PASS，browser/CDP `0`。返回 R5b 主阶段最终 inventory。

### 350-R5b-p3：高度模板失败保存原子性

- R5b 最终 inventory `BLOCK / P0 0 / P1 1`：首次 `localStorage.setItem` 抛 `QuotaExceededError` 后，失败模板仍留在 `userTerrainPrograms`，同名重试产生 `-2` 并最终持久化两项；失败 receipt 的 diagnostic 为 null。
- 最窄产品边界：保存时只构造 `nextPrograms`，持久化成功后才发布；持久化写异常统一转为带 backend/cause 的 storage error。动态门直接经正式 panel command 固定“失败→同名重试”，要求原 id、单模板与结构化原因。delete/restore/import 不改，browser/CDP `0`。
- `R5b-p3` 最终 `ACCEPT / P0 0 / P1 0`：正式 fail-once quota 路径确认失败不发布、receipt 有 cause、重试原 id、最终单模板；missing/denied 回归、183 samples、typecheck、语法、diff 均独立通过。返回 R5b 主阶段最终 inventory，browser/CDP `0`。

## 350-R5b：主阶段最终接受

- 最终 `ACCEPT / P0 0 / P1 0`：API operation 12 终态、delayed 23/24ms/overlap/stale/destroy、普通/debug/diagnostic 分层、高度模板四类持久化发布顺序、入口 18～20 的 13 项 prerequisites 与 R5b aggregate 全部闭合；完整聚合、diff 独立 PASS，browser/CDP `0`。
- 阶段冻结并进入 R6a；R6a 产品文件必须为 `0`，只冻结 20 个入口（19 个唯一脚本）的夹具与执行证据策略。

## 350-R6a：浏览器夹具冻结

| 项目 | 冻结内容 |
|---|---|
| 目标 | 20 个入口固定 source/setup/window/assertions/cleanup/full+compact artifact/200ms policy |
| 非目标 | 产品源码、真实 browser/CDP、运行固定入口、R6b/R7 结果 |
| 产品文件 | `0` |
| 最小验收 | 19 唯一脚本语法、artifact failure self-test、静态契约、build、同一只读评审 |

- 入口 6/7 复用 worker-session 脚本但冻结 10k/100k 两种 mode。先跑现有基线，首败按纯夹具子阶段收敛；browser/CDP `0`。

### 350-R6a-f1：hard-cell renderer 静态契约迁移

- 首败仅为 `task-350-browser-artifact-regression` 的旧源码顺序断言；正式 renderer 产品未改。新静态门分别切片 `refreshHardCellSurfacePatchCells` 与 `refreshHeightCells`，要求高度+关闭平滑 guard、非高度 full refresh、零 range 时 patch→rebind→draw→return、失败 full fallback。
- 增加删除 hard patch 与关闭平滑前置两类 mutation；产品文件 `0`，最小门为 artifact self-test、语法、diff 与同一只读评审，browser/CDP `0`。
- f1 首评 `BLOCK / P0 0 / P1 1`：方法 regex 未约束 `if(patch)` 和成功早返，`if(false)`/删 return 均假绿。`R6a-f1a` 改为 Babel AST 直达控制流，新增两 mutation；产品 `0`，artifact self-test、语法、diff PASS，待 blocker-only，browser/CDP `0`。
- f1a 复审仍 `BLOCK / P0 0 / P1 1`：控制流已锁，但所有关键调用未锁参数，hard guard 漏 `!map`。最后 blocker-only `R6a-f1b` 精确核对 patch/rebind/draw/两处 full fallback 实参与完整 guard，新增错误 patch/full 参数 mutation；产品 `0`，最窄门 PASS，browser/CDP `0`。
- `R6a-f1b / f1a / f1` 最终 `ACCEPT / P0 0 / P1 0`：六类绕过全部拒绝；artifact self-test、语法、diff 独立 PASS，产品 `0`、browser/CDP `0`。

### 350-R6a-f2：transaction / presentation artifact

- 冻结入口 1/11/12/13 四个脚本，将现有 top-level try/finally 迁移为共享 `createTask350BrowserArtifact`：功能首败 `fail`，browser/server 限时 teardown 单列 `failTeardown`，finally 无条件 `persist`；full 保留原 report，compact 保留全部旧硬断言输入。
- 不改产品、setup、断言或性能预算；最小门为四脚本语法、R6a 静态 artifact contract/self-test、diff 与同一只读评审，browser/CDP `0`。
- 已实施：四脚本 startup 全部移入 owner try，catch 保留原始 failure，teardown 逐资源限时且不覆盖功能首败，persist 后仍重抛；map transaction 的 `--ui-only` compact 对空 geo/climate 使用 null，不改变旧模式。
- 新增 `regress:task-350-r6a-fixture-artifact-contract`：AST 固定 artifact 名、owner try/catch/finally、full/compact 数据流、summary 字段、78 个旧硬断言、启动归属、限时 teardown 与失败重抛；4 × 8 共 32 个 mutation 均拒绝。四脚本/契约语法、两组 artifact self-test、契约、diff PASS，产品 `0`，待独立评审，browser/CDP `0`。

### 350-R6a-f2a：artifact 规范 AST 与证据数据流

- f2 首评 `BLOCK / P0 0 / P1 3`：city/overlay 的 Playwright 动态解析位于 owner 外；断言只冻结数量；compact 只冻结顶层键且 map 缺逐操作/metadata/GEO/UI 输入。产品问题 `0`。
- 已把四脚本的 `createRequire`、服务与 browser launch 全部纳入 owner try；contract 要求 owner 内外全局唯一，并为 12 个 startup 调用逐一执行外移 mutation。
- 78 个 formal assertion 及所有显式 if/throw guard 使用去 loc/comment 的规范 AST digest；每个 formal assertion 均有等量 `assert.ok(true)` 破坏反例。full/compact 构造、overlay 中间 evidence bindings 与 map UI helper 同样纳入 digest，并加入 null/错源 mutation。
- map compact 新增 11 个 regeneration、3 个 height、GEO、climate、metadataUndoable 及 UI regenerateCount/initialUndoDisabled/changed/history/undo/redo/baseline；overlay 保存进出场误差与逐帧 draw/transform，viewport 保存 mesh/transform/offset/idle 输入。契约 78 硬断言、130 mutation，四脚本与契约语法、两组 artifact self-test、diff 全 PASS；产品 `0`，待 blocker-only，browser/CDP `0`。
- blocker-only 前两项接受，残留 `P1 1`：部分 binding digest 未覆盖 map `report` producer，可把真实 history delta 伪写 999。最终版把四个夹具完整 `Program` 的去元数据 AST 纳入 compact digest，故 page.evaluate producer、外部 helper 与所有映射不可单独漂移；新增该 999 反例，总计 131 mutation。契约/diff PASS，待最后 blocker-only，产品 `0`、browser/CDP `0`。
- 最后 blocker-only `ACCEPT / P0 0 / P1 0`：评审确认完整 Program digest 会覆盖 producer，999 mutation 精确命中并被拒绝；专项 4 fixtures / 78 assertions / 131 mutations、语法、diff PASS。f2/f2a 冻结，进入 f3。

### 350-R6a-f3：persistence / feedback artifact

- 只处理固定入口 16～20：browser storage compatibility、storage fallback、save feedback、loading single source、delayed operation feedback。接入与 f2 同一 failure-safe artifact owner 与完整 Program 规范 digest；保留 setup、旧硬断言、性能政策和 stdout report。
- 最小门：五脚本语法、扩展后的 R6a artifact contract/self-test、diff 与同一只读评审；产品 `0`、browser/CDP `0`。
- 实施结果：五个入口的动态 Playwright/Vite/static server 启动均归入 owner try；功能首败、teardown 首败、finally persist 和原错误重抛闭合。full 保留原 stdout report并追加原始 LongTask/汇总，compact 另保留 compatibility screenshot、fallback backend/normal path、save 5.5s/6.3s、Loading 预期 health failure、feedback async/cancel/failure 清理状态。
- 性能边界：新增共享 `task-350-browser-long-task.mjs`；入口按目标窗口显式 prepare/reset/collect，compatibility 三分窗、fallback/feedback 双页面，其余单窗；统一 `summarize(..., 200)`，并以 `overBudget=[]` 硬拒绝所有 `duration>200ms` 条目。
- 夹具自证：R6a contract 扩为 9 fixtures / 208 formal assertions / 340 mutations；完整 Program digest 固定 producer/setup/assertions/full/compact/teardown，另冻结共享 helper AST，并逐项核对 observer 调用数、200ms 阈值、overBudget 来源与 full 原始数据。artifact self-test、七脚本语法、契约、diff PASS。
- 阶段边界：产品文件 / 行数 `0 / 0`；本阶段工具文件 `7`（五个固定入口、一个共享 LongTask helper、一个统一 contract）；浏览器/CDP `0`。当前冻结待同一只读评审，不提前进入 R6a 最终 catalog freeze。
- 独立评审：`ACCEPT / P0 0 / P1 0`。同一评审确认五入口 startup 全归 owner、功能/teardown 失败与非零退出闭合、LongTask 导航前安装且 reset 排除 setup、full/compact 数据完整；独立复跑 artifact self-test、9 fixtures / 208 assertions / 340 mutations 契约、七脚本语法与 diff 全过，browser/CDP `0`。

### 350-R6a-f4：catalog 与 19 唯一脚本最终冻结

- 目标：在不运行浏览器的前提下，把已逐阶段接受的 20 个 catalog 入口（19 个唯一脚本）统一冻结；不得再用 `unfrozen` 状态或未登记脚本进入 R6b。
- 实施：catalog schema 升至 `3`，common/allowed/validator 均只接受 `fixtureStatus=frozen`；audit 要求 20/20 artifact 与 finally cleanup，除 presentation-zero 外必须观测 LongTask。新增 fixture-freeze 门，以完整去元数据 Program AST SHA 固定 19 脚本，逐脚本执行 `node --check` 并对一个可执行 AST 破坏自证拒绝。
- 聚合：新增 `regress:task-350-r6a`，串行执行 acceptance catalog、Task 350 artifact self-test、R4b artifact/helper contract、R6a 9-script artifact contract、19-script freeze、core typecheck 与生产 build；catalog 对八项前置逐项防删。
- 阶段边界：产品文件 / 行数 `0 / 0`；工具/路由为 catalog、catalog regression、新 freeze regression 与 package 聚合；browser/CDP `0`。完整 `regress:task-350-r6a` 已 PASS：catalog `20 / 19 / frozen`、artifact 两套四态、R4b `27 mutations`、R6a `9 / 208 / 340`、freeze `19 syntax / 19 mutations`、typecheck 与 `1398 modules` build 全绿；待 diff 与同一只读评审。
- 首评 `BLOCK / P0 0 / P1 1`：实际 package 聚合恰为八个安全门并完整执行 browser `0`，但通用 validator 只验证 requirements 是实际段的子集，追加 browser package entry 仍会接受。插入 `R6a-f4a`，仅令 R6a 分段数组与八项冻结 requirements 保序精确相等，并增加 map transaction / worker session / save feedback 三个尾部追加反例；产品/fixture/browser `0`，待最窄门与 blocker-only。
- `R6a-f4a / f4` 最终 `ACCEPT / P0 0 / P1 0`：同一评审复现原追加绕过已闭合，额外/重复/重排全部被保序 deepEqual 拒绝，三项追加 mutation 成立；acceptance catalog `20/19`、freeze `19/19`、语法与 diff 独立 PASS。R6a 整体冻结，下一阶段只按 catalog 顺序运行 R6b browser/CDP。

## 350-R6b-p1：compute / render binding 分离

| 项目 | 冻结内容 |
|---|---|
| 首败 | 固定入口 1 的首个 features：`renderer source mapRevision 与请求不一致` |
| 分类 | 产品协议；合法 commit 后 render binding 被提交前 compute binding 误拒绝 |
| artifact | `Z:\tmp\codex\2026-08-21\task-350-r6b\map-transaction-{full,summary}.json` |
| 产品边界 | shared render validator、foundation/features/settlements/society-politics/economy validators、runtime app pre-commit wiring |
| 夹具边界 | 五组 core protocol 对完整 resource binding 和 N/N+1 组合的最窄迁移；浏览器脚本不改 |
| 最小验收 | 五组协议、11-kind worker task、typecheck、app syntax、diff、同一只读评审 |
| 浏览器 | 原失败运行 1 次；修正后 `0`，产品阶段已接受，生产构建后只复验入口 1 |

- compute binding 继续冻结 canonical before-image、generation token、lock 和 operation；render binding 单独携带 commit 后 source/topology revision、renderPreparationId、renderGeneration。
- 通用 mutation 在任何领域命令提交前 exact 比较 `output.preparedRender.binding` 与已签发 `renderRequest.binding`；领域 validator 同样不允许省略 expected render binding。
- 最窄反例覆盖 expected 缺失、prepared 完整字段缺失、revision 漂移、preparation id / generation 伪造；不放宽 patch、mirror、history、session 或 renderer installer。
- 五组直接协议、完整 11-kind worker-task、typecheck、app syntax 与 diff 已通过；同一只读智能体最终 `ACCEPT / P0 0 / P1 0 / browser 0`。foundation 聚合中的 adoption-owner 旧静态顺序探针与本阶段无关，直接 foundation 协议已通过。当前唯一下一步为生产构建并复验固定入口 1。

## 350-R6b-p2：full-surface 换代中的未准备 cache 原子保留

| 项目 | 冻结内容 |
|---|---|
| 首败 | p1 后入口 1 的 features：`route / river / tradeFlow:owner-topology-revision` |
| 分类 | 产品原子安装；surface 已换代而同一 live map 的未准备 cache 留在旧 owner |
| artifact | `Z:\tmp\codex\2026-08-21\task-350-r6b\map-transaction-{full,summary}.json` |
| 产品边界 | `renderer/prepared-render-installer.js` 的同图 retained cache preflight / commit / rollback |
| 夹具边界 | prepared installer 的 full-surface 新 generation/topology、混装拒绝和 rollback；browser fixture 不改 |
| 非目标 | 不同 map 对象复用、render layer catalog、领域 patch、入口 2～20 |
| 浏览器 | p1 后目标复验 1 次；p2 修正后 `0`，评审接受前不复验 |

- 只有 `renderer.map === map` 且提交前 cache owner/wrapper/引用与旧 surface 完整同源时，缺席 prepared layers 才表示可保留；单凭 map identity 相同不足以复用。
- full-surface 安装把这些物理引用作为目标资源组成员同步换 owner/wrapper；prepared family 仍以 Worker 新 buffer 为准，任何提交前混装必须在正式字段赋值前拒绝。
- 所有重绑都走既有 transaction before-image；正常 rollback、commit fault rollback 均必须恢复旧 owner、wrapper 与引用。
- 实施结果：正式 installer 先冻结旧 surface binding；对象同一且 identity 相同时，对缺席 prepared layer 的六族 cache 做逐族 mismatch preflight，再用既有 `assign` 写入目标 owner/wrapper，因此普通 rollback 与 setter fault rollback 都恢复原 registry/ref。不同对象不进入保留路径。
- 首轮专项命中本阶段实现错误：cache registry 存在性一度误作 picking/overlay 的总重绑条件；拆成 retained 总条件与 cache-only preflight 条件后，既有 in-place picking/overlay 与新增 full-surface cache 场景同时通过。
- 当前证据：prepared installer `20 cases`、render preparation 10k、cache binding `17 reference / 24 negative / 6 AST mutation`、panel refresh、11-kind worker-task、typecheck、两脚本语法与 diff PASS；产品约 `1 / 30` 行、工具约 `1 / 125` 行，browser 修正后 `0`。当前唯一下一步为同一只读智能体评审。
- 首评 `BLOCK / P0 0 / P1 1 / browser 0`：不同 map 对象不走显式重绑仍不足；若错误沿用 same generation，旧 wrapper 会继续匹配新 surface owner。插入 `R6b-p2a`，仅在 full-surface 对象替换时强制 target generation 不同于 previous surface，并补 same identity / different object / same generation 拒绝。
- p2a 实施中，新门同时拦住 nested ownership 旧夹具第二次对象替换复用 generation 1；该夹具按正式契约迁移为新 identity + generation 2，不放宽产品门。installer `20 cases`、typecheck、语法与 diff PASS；browser0，现只做 blocker-only 复审。
- `R6b-p2a / p2` 最终 `ACCEPT / P0 0 / P1 0 / browser 0`：评审逐行确认硬门在 previous transaction finalize、route cancellation 与全部 map/buffer/owner assign 之前；same-object full/in-place 不触发，不同对象新 generation 的 nested rollback/finalize 继续通过。正式反例真实 prepare 后在 commit 命中，并断言 map、六族 owner/wrapper 不变；独立 installer20、typecheck、syntax、diff PASS。下一步仅 build + 入口1目标复验。

## 350-R6b-p3：history full-surface retained/cache 原子重绑

| 冻结项 | 内容 |
|---|---|
| 首败 | p2a 后入口 1 的 `history.undo.generate.regenerate.features`：`tradeFlow:owner-topology-revision` |
| 分类 | 产品 edit/history 刷新；该路径绕过 Worker installer，full surface 换代只重绑 picking/overlay |
| artifact | `Z:\\tmp\\codex\\2026-08-21\\task-350-r6b\\map-transaction-{full,summary}.json` |
| 产品边界 | `renderer/placeholder-renderer.js` 的 `refreshCellSurface` 与既有 `rebindEditedRendererResources` |
| 夹具边界 | cache binding 的真实 prototype topology 换代、六族 owner/引用与 AST 退回反例 |
| 非目标 | Worker installer、cache 物理重建、入口 2～20、浏览器夹具 |
| 浏览器 | p2a 后目标复验 1 次；p3 修正后 `0`，评审接受前不复验 |

- history/edit scheduler 在完整 surface 换代后必须一次性发布 surface、picking/overlay 与六族 cache 的同一完整 resource binding；不得在首次 draw 时暴露新 surface owner + 旧 cache owner。
- 未标 dirty 的 cache 只迁移 owner/wrapper，物理 buffer/array 引用必须保持；dirty family 仍由 draw 的既有路径重建。
- 实施结果：`refreshCellSurface` 在新 surface 完成后、`draw()` 前调用既有 `rebindEditedRendererResources`；类上新增窄代理以复用同一原子 helper。正式夹具用 topology `2 → 3` 调用原型并逐族证明 owner 更新、引用不变，退回旧 `adoptRendererRetainedResourceBindings` 的 mutation 被拒绝。
- 当前证据：cache binding `17 reference / 24 negative / 7 AST mutation / historySurfaceCacheRebind=true`、prepared installer20、history async、panel refresh、完整 11-kind worker-task、typecheck、两脚本语法与 diff PASS；browser0。当前唯一下一步为同一只读智能体评审。
- 首评 `BLOCK / P0 0 / P1 2 / browser 0`：helper 未先验证旧 cache owner/wrapper/reference，会把 reference drift 或 other-map owner 洗白；AST 对 method 递归找调用，`if(false)` 与未调用闭包可假绿。按冻结顺序拆为 p3a fixture-only 与 p3b product-only。

## 350-R6b-p3a：history rebind preflight 红门冻结

| 冻结项 | 内容 |
|---|---|
| 目标 | 只移动夹具，把 p3 两个评审 blocker 转成确定性动态/AST 红门 |
| 产品文件 | `0` |
| 夹具文件 | `tools/webgl-generator-render-cache-resource-binding-regression.mjs` |
| 动态反例 | routeBufferCamera reference drift；tradeFlow owner/wrapper 同步指向 other map |
| AST 反例 | `if(false)`；未调用箭头闭包；旧 picking/overlay-only 调用 |
| 绿门 | `--fixture-only`、syntax、diff |
| 红门 | 正式 cache binding 必须精确首败于 route reference 未拒绝 |
| 浏览器 | `0` |

- `--fixture-only` 仍运行既有正例和全部 source mutation，仅跳过等待产品实现的两项动态 preflight 断言；输出 `17 reference / 26 negative / 9 AST mutation / historySurfacePreflight=true`。
- 正式专项稳定非零，首败为 `Missing expected exception: full surface history rebind 不得把已漂移的 route cache 引用洗白`；说明冻结门真实约束当前产品，而非已经假绿。
- p3a 接受后唯一下一步为 p3b：仅改产品，在重绑前按 captured previous/target binding 验 owner、wrapper 和引用，随后让同一正式专项转绿；不得再修改期望。
- p3a 首评 `BLOCK / P0 0 / P1 1 / browser 0`：rebind 前插入 direct `return` 仍可满足旧索引条件。blocker-only p3a1 将 rebind 前 direct return/throw 判为不可达，并加 exact early-return mutation；fixture-only `17 reference / 27 negative / 10 AST mutation` PASS，正式专项仍红于 route 漂移，产品0，只做同一评审复审。
- p3a1 blocker-only 再次 `BLOCK / P0 0 / P1 1 / browser 0`：原 direct return 绕过已闭合，同级 `if(true) return` 仍可假绿。该同一可达性阻断已连续两次，按根 `AGENTS.md` 冻结；不得继续第三轮夹具修补。p3b 产品0、入口1未复验、入口2～20未运行；等待用户在“完整规范 AST 冻结”与“接受窄静态风险”之间裁定。

## 350-R6b-p3a2：完整规范 AST 冻结

| 冻结项 | 内容 |
|---|---|
| 用户裁定 | 采用完整规范 AST，不接受窄静态风险 |
| 唯一夹具文件 | `tools/webgl-generator-render-cache-resource-binding-regression.mjs` |
| 产品文件 | `0` |
| 冻结方式 | `refreshCellSurface` 完整方法 AST 剥离位置/注释元数据后固定 SHA-256 |
| 新增反例 | rebind 前同级 `if (true) return` |
| 证据 | fixture-only `17 reference / 27 negative / 11 AST mutation`；正式专项精确红于 route reference drift；syntax/diff PASS；browser0 |
| 独立评审 | `ACCEPT / P0 0 / P1 0 / browser 0` |

- p3a2 接受后进入纯产品 p3b：夹具不再移动，只修改 `placeholder-renderer.js` 的 rebind 代理/helper，在任何 owner/wrapper 重写前验证旧 retained/cache owner、wrapper 和物理引用；专项转绿并经独立评审前不运行浏览器。

## 350-R6b-p3b：history cache rebind preflight

| 冻结项 | 内容 |
|---|---|
| 产品文件 | `app/webgl-generator/src/renderer/placeholder-renderer.js` |
| 夹具文件 | `0`，p3a2 完整 AST 与动态红门不再移动 |
| preflight | 六族已登记 cache 的旧 owner map/topology/generation、wrapper-owner、全部物理引用；无显式 previous 时从 cache owner 派生 |
| 兼容边界 | owner/wrapper 成对缺席不制造新拒绝；任一已登记状态漂移在重写前拒绝 |
| 错误契约 | `render-edited-resource-preflight-mismatch` + 精确 `family:reason` |
| Node 证据 | cache `17 / 27 / 11`；installer `20 cases`；history async、panel refresh、11-kind Worker、typecheck、syntax、diff PASS |
| 浏览器 | `0`；独立评审接受前不复验入口 1 |

- 首个专项曾误把 retained 的合法 owner-only 历史状态和成对缺席 cache 当作漂移；最窄产品修正仅把 preflight 收回原评审阻断的六族已登记 cache，未移动夹具或放宽 route/tradeFlow 动态反例。当前冻结待同一只读评审。
- 独立评审最终 `ACCEPT / P0 0 / P1 0 / browser 0`：preflight 在所有 adoption/rewrite 前，失败路径零写入；单参 previous 来源为已登记 cache owner，不是 target surface。p3 完成，下一步固定为一次生产 build 后只复验入口 1，首败即停。

## 350-R6b-p3c：目标代 / 唯一上一代 cache preflight

| 冻结项 | 内容 |
|---|---|
| 浏览器首败 | history undo 时 line/point 已为 target，route/river/tradeFlow/selection 仍为 previous，被单 previous preflight 误拒 |
| artifact | `Z:\tmp\codex\2026-08-21\task-350-r6b\p3b-first-failure\map-transaction-{full,summary}.json` |
| 产品边界 | 已登记 cache owner 只可属于 target generation 或唯一 previous generation；第三代/跨 map/wrapper/ref 漂移拒绝 |
| 夹具 | `0`，p3a2 完整 AST 与动态反例不动 |
| Node 证据 | cache `17 / 27 / 11`、installer `20 cases`、typecheck、syntax、diff PASS |
| 浏览器 | p3b 后目标门 `1` 次首败；p3c 修正后 `0`，blocker-only 接受前不复验 |

- p3c 主线程冻结：无显式 previous 时从第一项非 target cache owner 派生唯一上一代；target cohort 与 previous cohort 均保留 wrapper/ref preflight。当前只做原阻断 blocker-only，不扩项。
- p3c blocker-only `ACCEPT / P0 0 / P1 0 / browser 0`：第三代、跨 map、wrapper/ref 漂移仍拒绝，target/唯一 previous 混合可原子重绑。下一步仅 build + 入口 1 唯一目标复验；再次失败即冻结。

## 350-R6b 入口 1：p3c 后冻结点

| 冻结项 | 内容 |
|---|---|
| 生产构建 | `1399 modules` PASS |
| 已越过首败 | features 正向 / undo / redo / baseline history cache 重绑 |
| 新首败 | `generate.regenerate.diplomacy`；`diplomacy-military-stale-scope-invalid`；“外交重生成改变了军事 stale 状态” |
| artifact | `Z:\tmp\codex\2026-08-21\task-350-r6b\p3c-target-recheck\map-transaction-{full,summary}.json` |
| Node 对照 | economy / diplomacy / military core protocol PASS；含 `features → states → provinces → cities → routes → rivers → markers → diplomacy` stale military chain |
| 浏览器额度 | p3c 后唯一目标复验 `1` 次；入口 2～20 为 `0` |
| 当前状态 | 强制冻结；不做第三次产品修正，不继续浏览器 |

- 正式外交 validator 精确比较 Worker patch `military.metadata.stale` 与 canonical `sourceMap.military ?? sourceMap.pack.military` 的值和缺失形态；直接 Node 链仍通过，因此当前证据把差异收窄到浏览器持久 Map mirror / 历史往返后的输入形态 parity，而不是允许外交重生成刷新 stale。
- 当前 failure artifact 没有 expected / actual stale shape 或 `map.military === pack.military` 两侧 alias 诊断，故冻结状态下不指定最终修正点。若用户批准继续，应另立纯诊断/夹具阶段：先记录 canonical source 与 retained mirror 的两侧 stale shape/alias，再冻结能复现浏览器链的最窄红门；评审接受前产品改动和 browser 均为 `0`。

## 350-R6b-p4a：mirror parity 纯诊断 / 夹具冻结

| 冻结项 | 内容 |
|---|---|
| 用户授权 | 继续；允许从上一个强制冻结点单列新阶段 |
| 唯一写者 | 主线程 |
| 产品文件 | `0`；不得改 validator、外交算法、Worker session 或正式入口 1 |
| 允许文件 | 最窄 Node 诊断/回归工具、本交接与权威状态文档 |
| 必须观测 | canonical `map.military / pack.military`、retained mirror 输入两侧的 stale own-property/value、alias、session binding/checksum |
| 场景边界 | adoption 初态；前序重生成；每项 execute/undo/redo/baseline 后；diplomacy pre-commit |
| 首个廉价门 | `pnpm run regress:economy-diplomacy-military-core-protocol` |
| 冻结门 | 最窄红门精确失败于 mirror parity，且对照正例、诊断失败留证、syntax/diff 均通过 |
| 浏览器 | `0`；同一只读评审接受前不运行 |
| 停止条件 | 需要产品决策、夹具再次连续两次失真、或无法在不改产品的情况下观测 retained input |

- p4a 不预设“把 stale 捕获移到 command.apply 前”等产品结论；直接 Node 链已经通过，必须先证明浏览器持久镜像在哪一个 transition 与 canonical source 分叉。
- p4a 诊断结论：第一次 `features:undo` 即发生分叉。`captureCommandMapReplicaWrites{Async}` 只把 `resolvePath(...).found === true` 的路径编码为 replace；撤销把 canonical 上原本不存在的 `metadata.derivedStale` 与 `military.metadata.stale` 恢复为缺失后，这两个删除不会进入 replica patch，retained mirror 继续保留 stale。后续外交 validator 只是首次把这项 drift 显性拒绝。
- 冻结红门：`tools/webgl-generator-map-replica-history-delete-regression.mjs`。fixture-only 明确输出 `firstDivergence=features:undo` 与两个 omitted deletes；正式门要求同步/异步 capture 产生无 payload delete、journal 幂等删除、未登记路径拒绝及 applied checksum 不假一致，当前精确红于 `actual []`。既有 `regress:map-replica-command-patch` 与 `regress:economy-diplomacy-military-core-protocol` PASS；产品 `0`、browser `0`，待同一只读评审。
- p4a 同一只读评审 `ACCEPT / P0 0 / P1 0 / browser 0`。p4b 产品边界固定为 `map-replica-command-patch.js`、`map-replica-journal.js`、`map-replica-checksum.js`：缺失的已登记 command path 编码为无 payload delete；journal 对缺父/缺 leaf 幂等删除；applied checksum 对已删路径同签、重新出现路径不假一致。夹具、外交域和浏览器入口均不动。

## 350-R6b-p4b：registered-path delete 产品闭合

| 冻结项 | 内容 |
|---|---|
| 唯一写者 | 主线程 |
| 产品文件 | `map-replica-command-patch.js`、`map-replica-journal.js`、`map-replica-checksum.js` 共 `3` 个 |
| 夹具 | p4a 冻结的 `webgl-generator-map-replica-history-delete-regression.mjs` 不移动 |
| 产品语义 | 已登记缺失 path 捕获为无 payload delete；缺父/缺 leaf 幂等；primitive 父路径、delete payload、未登记路径仍拒绝；重新出现的 delete target 不得通过 applied checksum |
| 非目标 | 外交 validator / 算法、Worker session、正式浏览器入口、其它产品文件 |
| 浏览器 | `0`；同一只读评审接受前不运行 |

- 实施结果：同步/异步 command capture 对全部已登记路径显式编码 replace/delete；journal 的 normalize/preflight/apply 原子链接受合法 delete，并在缺失目标上保持幂等；applied checksum 仅在删除已真实生效时与签名一致，路径重新出现时加入 present/value 证据而失配。
- 已过门禁：p4a 新专项 GREEN；既有 `regress:map-replica-command-patch`、`regress:worker-task`、`regress:economy-diplomacy-military-core-protocol`、`regress:history-async-boundary`、`typecheck:core`、五文件语法与 scoped `git diff --check` 均 PASS。外交三域仍拒绝 `44` 类坏输入，Worker `11` kind 全过。
- 当前状态：夹具与外交域未改，产品 `3` 文件，browser / CDP `0`；只交同一只读评审。接受后才允许生产 build，并只复验入口 1 一次；首败即停，入口 2～20 继续冻结。
- 首轮独立评审：`BLOCK / P0 0 / P1 1 / browser 0`。唯一 blocker 为自定义 `getReplicaPaths` 可让 sync/async capture 先产生未登记的 `__proto__.stale` delete，虽然 journal 后续会拒绝，capture 本身仍违反 registered-path 边界；其余 delete journal/checksum 语义可接受。
- blocker-only 修正：sync/async 共用 `collectCommandMapReplicaWrites` 在解析 map 前先调用 canonical write registry，未登记 path 统一以 `map_replica_path_unregistered` 拒绝；既有 map-replica command gate 增加同步/异步同一反例，p4a 冻结夹具保持不变。新专项、replica command、完整 Worker、两文件语法与 scoped diff-check 均 PASS；browser 仍为 `0`，现只做同一评审 blocker-only 复核。
- blocker-only 最终复审：`ACCEPT / P0 0 / P1 0 / browser 0`。评审确认未登记 path 在共用收集期、读取 map 和产生 writes 前拒绝，sync/async 同码反例成立且无部分 patch；已登记 replace/delete、history-delete 与错误原子性未回退。复审后补跑三域协议仍 PASS、`44` 类坏输入保持拒绝。
- 下一步：仅生产 build 后运行固定入口 1 `regress:map-transaction-browser` 一次，artifact 写入独立 p4b 目录；首败即停，入口 2～20 不运行。只有入口 1 完整通过后，才能进入固定 catalog 余下入口。
- p4b 后目标结果：生产 build `1399 modules` PASS；固定入口 1 `ok: true`，11 类重生成和 height/GEO/climate/UI history 全链通过，`glError 0 / applicationConsoleErrors 0 / pageErrors 0 / product LongTask 0`。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-target-recheck\map-transaction-{full,summary}.json`。
- 下一步：同一 build 上从固定入口 2 开始按 catalog 顺序逐项运行；每个入口首败即停并保存独立 artifact，未到入口保持冻结。
- 固定入口 2：`regress:worker-regeneration-browser` PASS。11 域独立/连续链全部 accepted，连续链 session id 一致；最大 LongTask `139ms`、`over200 0`。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\02-worker-regeneration\worker-regeneration-browser-{full,summary}.json`。下一入口为 3。
- 固定入口 3：`regress:population-worker-browser` PASS。`6` 次操作/提交及 undo/redo digest 往返成立；LongTask、application/page/health error、GL error 均为 `0`，Loading 最终隐藏。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\03-population-worker\population-worker-browser-{full,summary}.json`。下一入口为 4。
- 固定入口 4：`regress:social-expansion-worker-browser` PASS。culture/religion 的 `6` 次提交、双 undo/redo、引用稳定与同 session reuse 均成立；LongTask 和四类错误计数均为 `0`。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\04-social-expansion-worker\social-expansion-worker-browser-{full,summary}.json`。下一入口为 5。
- 固定入口 5：`regress:economy-worker-browser` PASS。rebuild/assignment、undo/redo、map identity 与同 session reuse 成立；最大 LongTask `125ms`、over-budget 与四类错误均为 `0`。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\05-economy-worker\economy-worker-browser-{full,summary}.json`。
- R6b 领域组：固定入口 1～5 全部 PASS；同一 build 未变。下一组为 session/topology，先跑最小 session contract smoke，再运行入口 6。
- session/topology 最小 smoke：`regress:worker-session-contract` PASS，含 10k/100k continuity、replacement、race、pending viewport 及 adoption/replica/cancel。
- 固定入口 6 首败：在越过前序 session/fault/prepared gates 后，`runHardCellSurfaceGate` 抛出“hard-cell 第一格未生成 patch range”。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\06-worker-session-10k\worker-session-browser-{full,summary}.json`。入口 7～20 未运行。
- 窄诊断边界：不改 repo 产品或冻结 fixture；临时脚本 `...\06-worker-session-10k\hard-cell-readonly-diagnostic.mjs` 只重放 newMap、正式 height/smooth/ocean view 前置、features/rivers 与单格 height edit，记录 edit response、refresh 调用/结果、mode、surface/patch ranges、mesh target、GL/health，并使用 Task350 artifact/finally。语法 PASS；只读评审接受后才消耗一次聚焦浏览器诊断。

## 350-R6b-f1：hard-cell 双合法路径夹具迁移

| 冻结项 | 内容 |
|---|---|
| 首败分类 | 夹具把 `smooth=false` 错等同于 `surfaceCellRanges.size===0` |
| 诊断证据 | 10k 正式 ranges `10004`；height `31 → 32`；refresh `incremental / cells=1 / spans=1 / shoreSpans=0`；patch `0 / 0`；GL/health `0` |
| 产品文件 | `0`；不得修改 renderer / installer / Worker |
| 允许夹具 | worker-session browser 脚本及其 R6a 冻结 AST 摘要 |
| ranges 非空 | 两个非相邻同侧 cell 必须走 base-range incremental；base/ranges/segment/buffer 身份稳定，目标 CPU/GPU color 同源，第二格不改第一格，patch 仍空 |
| ranges 为空 | 保留原 hard-cell patch 动态断言、颜色/side、CPU/GPU、累积两格与 base 不变契约 |
| 独立静态门 | `regress:task-350-browser-artifact` 继续锁定正式零-range fallback AST 与 mutation，不随夹具迁移放宽 |
| 浏览器 | 修正及同一只读评审接受前 `0`；接受后只重跑入口 6 |

- 临时诊断先由同一只读评审 `ACCEPT / P0 0 / P1 0 / browser 0`，随后仅运行一次并成功留证：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\06-worker-session-10k\worker-session-hard-cell-diagnostic-{full,summary}.json`。
- 同一 fixture 文件的 100k 门含相同 `surfaceRanges===0` 前提，故本阶段一次迁移 10k/100k 两处同类假设；这不提前运行入口 7，也不扩展产品范围。
- 首轮独立评审 `BLOCK / P0 0 / P1 1 / browser 0`：range 路径第二格只核对第一格 CPU 快照，若第二次上传单独污染第一格 color GPU 会假绿。blocker-only 仅让第一格同时保存 GPU color 快照，第二格从原 range 重读并精确比较 descriptor / CPU / GPU；R6a AST digest 同步，其余 fixture 与产品不动。
- blocker-only 最终复审 `ACCEPT / P0 0 / P1 0 / browser 0`：分段 color GPU 回读与第一格三重保持门闭合；GPU 读回位于 100k `operationMs` 计时窗之外。语法、artifact、R6a freeze、session contract 与 diff-check 全过。下一步只重跑入口 6 一次，首败即停。
- f1 后入口 6 目标复验首败于新夹具前置，不是产品：features / rivers 两个 prepared bundle 均为 `surfaceCellRangesMode=grid-cells`、`ranges=10004`、`floats=694746`，`renderMode` 不存在；f1 却要求 `cell-colors`，故尚未执行第一格高度编辑。failure artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\06-worker-session-10k-recheck\worker-session-browser-{full,summary}.json`；入口 7～20 为 `0`。
- 该阶段已连续出现两次夹具失真（首评漏第一格 GPU 污染；目标复验误判 prepared mode），触发根规则强制冻结。未经用户裁定不改 fixture、不更新 digest、不再运行浏览器。若获批准，建议单列纯夹具 `R6b-f2`：只以实际完整 `grid-cells` bundle 替换错误的 `cell-colors` 前置，保留 range edit、patch fallback、GPU 隔离、history/perf/error 全部门，并新增一次入口 6 复验额度。
- 用户已批准 `R6b-f2` 与一次入口 6 目标复验。本阶段唯一夹具改动为：移除未出现在实际 prepared DTO 中的 `renderMode=cell-colors` 推断，精确冻结 features/rivers 两个 `grid-cells / 10004 ranges / 694746 floats` 完整 bundle，并要求与安装后的 renderer ranges/floats 同源；产品文件 `0`，其余 f1 与 fallback 门不移动。先做非浏览器门和同一只读评审，接受前 browser `0`。
- f2 同一只读评审最终 `ACCEPT / P0 0 / P1 0 / browser 0`。两格 CPU/GPU 隔离、100k 性能、零-range 动态与正式 AST/mutation 门保持；静态/fixture/session 门全过。评审文字中的旧 digest 经单点复核更正为当前 `5c5aaacf69697c1bc02eed45c1dd5ed7d80dc2144e4a8c0a8866d45e5bc52488`，重新计算 `20 / 19 / 19` PASS，结论不变。下一步只使用用户新增额度复验入口 6。
- f2 后入口 6 复验已通过 prepared 前置，第一格 edit 的 target changed 与 position/land-side 保持也通过；首败仅为 range 夹具把正式 RGBA height ramp 写成必须 `length===3`。正式 `DEFAULT_HEIGHT_RAMP` 每个颜色为四分量，旧 patch 分支也只要求颜色存在并比较前三项，故分类为夹具假红而非产品颜色失败。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\06-worker-session-10k-f2-recheck\worker-session-browser-{full,summary}.json`。
- `R6b-f3` 只把该前置改为 `length>=3`，逐 RGB、目标变化、CPU/GPU 与跨格隔离不放宽；产品文件 `0`。完成 syntax/artifact/freeze/session/diff 与同一只读评审后冻结，未经用户新增额度不再运行入口 6。
- f3 同一只读评审最终 `ACCEPT / P0 0 / P1 0 / browser 0`：RGBA 前置已正确，所有后续颜色、身份、性能和 fallback 门保持；freeze digest `87ea1e47a51bf070defac249e16e0ecc9f7baf51953f94508af4e5897c166966`。非浏览器门全过，产品文件 `0`。当前只等待用户是否新增一次入口 6 目标复验额度。
- 用户已批准新增一次入口 6 复验。只运行 10k `regress:worker-session-browser`，使用独立 f3 recheck artifact；首败即停，不进入口 7。
- f3 后入口 6 已通过两格颜色和全部 CPU/GPU 隔离门，最终仅在 `surfaceBaseBufferSet` set wrapper 身份变化处首败。正式 owner rebind 会新建 set/segments 容器、复用原 segment objects 与物理 buffers；prepared-installer Node 契约同样要求 owner 换代不重建物理 surface buffers。故分类为夹具 identity 层级错误，产品失败证据 `0`。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\06-worker-session-10k-f3-recheck\worker-session-browser-{full,summary}.json`。
- `R6b-f4` 只把最终身份门改为“wrapper/segments 容器换代 + current owner/binding 对齐 + segment descriptor/geometry/color buffer 复用”，保留颜色变化、geometry 不变和其它全部门；产品文件 `0`。先完成非浏览器门与同一只读评审，未经用户新增额度不再运行入口 6。
- f4 同一只读评审最终 `ACCEPT / P0 0 / P1 0 / browser 0`。prepared-installer `20 cases`、render-cache `17 / 27 / 11` 与全部 artifact/freeze/session 门通过；owner wrapper 换代和物理 buffer 复用已同源冻结，产品文件 `0`，digest `37d8ae56f1672d6b392587b7bd00c348248b2bdfd15ad352ecf251d21e5a9eec`。当前只等待用户是否新增一次入口 6 目标复验额度。
- 用户已批准新增一次入口 6 目标复验；只运行 10k worker-session，并将证据写入独立 f4 recheck 目录，首败即停。
- f4 后入口 6 已完整越过 hard-cell；新首败是后续 committed display replay 夹具同步读取异步 `layers.*` Promise，且同 tick 连发会触发 latest-intent supersede。artifact：`Z:\tmp\codex\2026-08-21\task-350-r6b\p4b-catalog\06-worker-session-10k-f4-recheck\worker-session-browser-{full,summary}.json`。产品失败证据 `0`，入口 7～20 未运行。
- 用户已批准 `R6b-f5`。committed display gate 的 7 项 API 回执按原顺序逐项 `await`；同类扫描同时修正后续 deferred-theme fault 与可选 render-replay recovery diagnostic 的同步 theme receipt 读取。只等待原 Promise，session/render-only/fault/busy/final state/performance/error 断言不动；产品文件 `0`。canonical AST digest `b02920a6ac1b6c5ede1506b8c2a86e79c521c758ea5e3887955314352ad4d6f8`，跑非浏览器门并交同一只读评审，接受前 browser `0`。
- f5 同一只读评审最终 `ACCEPT / P0 0 / P1 0 / browser 0`：逐项 await 避免 latest-intent supersede，三处同源旧写法均闭合；session delta、唯一 render-only、busy、fault/deferred/final-state/performance/error 全部门保持。syntax、artifact `208 / 340`、freeze `20 / 19 / 19`、session contract、diff 全过，产品文件 `0`。当前只等待用户是否新增一次入口 6 目标复验额度。
- 用户已批准新增一次 f5 后入口 6 复验。只运行同一 build 的 10k worker-session，artifact 写入 `Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-f5-recheck`；首败即停，入口 7～20 保持冻结。

## 350-R6b-p5：暂停期 display intent 发布闭合

| 冻结项 | 内容 |
|---|---|
| 浏览器首败 | routes 目标 false 已获成功 receipt，但排队态 `layers.get()` 返回旧 true |
| 直接根因 | `runDisplayMutation.onCommitted` 在 renderer 暂停时用旧 renderer 状态覆盖 apply 已写入的控件/偏好 |
| 产品文件 | 仅 `app/webgl-generator/src/runtime/app.js` |
| 测试文件 | 仅 `tools/webgl-generator-presentation-contract-regression.mjs` |
| 必须保持 | 正常成功 canonical restore、失败恢复、latest-intent、deferred replay、session/render-only、全部浏览器硬断言 |
| 浏览器 | f5 后目标复验已消耗；p5 评审接受前 `0`，入口 7～20 冻结 |

- 产品修正只允许给 `onCommitted` 增加 renderer 非暂停 guard；不得改 fixture 期望或直接改 renderer deferred queue。presentation contract 红门必须在旧产品上精确失败于暂停期 intent 保护。
- 实施结果：旧产品红门精确失败；修后只在 current intent 且 renderer 非暂停时 canonical restore，暂停期保留成功 apply 的 API/UI 意图。presentation/view-mode/theme/GPU/session/artifact/typecheck、`1399 modules` build 与 diff 全过；产品 `1` 文件 `1` 条 guard、测试 `1` 文件，browser `0`。现只做同一只读评审。
- 首评 `BLOCK / P0 0 / P1 1 / browser 0`：产品结论不变，唯一 P1 是整段 regex 可被未调用同名 closure 假冒。blocker-only 改为 AST 精确定位 `displayIntents.run` 回调直接作用域中唯一 `onCommitted`，要求唯一 if 的 current/non-suspended/direct restore 结构，并加入旧 guard 与 guarded-decoy 两个必须拒绝的内存 mutation；产品不动。
- blocker-only 最终复审 `ACCEPT / P0 0 / P1 0 / browser 0`：AST 锚定 actual callback/direct declaration/唯一 guard，两个 mutation 均拒绝，`suspendedIntentMutations=2`；产品未再移动。当前只等待用户是否新增一次 p5 后入口 6 目标复验额度。
- 用户已追加后续浏览器验收总额度 `10` 次；继续按固定 catalog 和首败规则使用，当前 `0 / 10`。第 `1 / 10` 次只复验 p5 后入口 6，失败先归因/窄修/廉价门，入口 6 通过后才进入入口 7，未到入口保持冻结。

## 350-R6b-p6：暂停期主题 GPU resident 越界写闭合

| 冻结项 | 内容 |
|---|---|
| 浏览器首败 | 第 `1 / 10` 次在 p5 排队态通过后，states response 于 delta1 session 提交后返回 `operation_obsolete / Worker 会话提交期间地图或视口已变化` |
| 直接根因 | 暂停窗口内主题仍按调用前的 `gpuResident=true` 走 `setVisualThemeGpuResident`，立即改写 renderer visualTheme/viewOptions，使 render-context token 失配；其它六项 setter 均正常 defer |
| 产品文件 | 仅 `app/webgl-generator/src/runtime/app.js` |
| 测试文件 | 仅 `tools/webgl-generator-presentation-contract-regression.mjs` |
| 必须保持 | 非暂停 GPU resident 快速路径；暂停期 API/UI intent 可见；主题进入现有 visual-theme deferred entry；delta1→render-only delta0；失败恢复、latest-intent 与全部浏览器硬断言 |
| 浏览器 | 当前总额度 `1 / 10`；红门、窄修、廉价门与同一只读评审接受前不使用第 `2 / 10` 次 |

- 失败 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-p5-recheck-01\worker-session-browser-{full,summary}.json`。入口 7～20 未运行。
- 实施及同一只读复核完成，最终 `ACCEPT / P0 0 / P1 0 / browser 0`。旧产品红门精确失败；产品仅以 direct `useGpuResident` 在暂停时关闭 GPU resident 直写，正常 true 路径保持；AST 锚定实际函数与实际 apply 参数，旧逻辑及未调用正确 decoy 两项 mutation 均拒绝。presentation/view-mode/theme/GPU/session/artifact/syntax/typecheck、`1399 modules` build、scoped diff-check 全 PASS。
- 现使用追加额度第 `2 / 10` 次复验入口 6，artifact 写入 `Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-p6-recheck-02`；首败即停，入口 6 通过后才进入入口 7。

## 350-R6b-f6：point buffer 总量/可见量夹具分离

| 冻结项 | 内容 |
|---|---|
| 浏览器首败 | 第 `2 / 10` 次已越过 delta1、render-only delta0 与最终 replay，最终 point GPU 字节为 `19536`，旧夹具按可见顶点要求 `18552` |
| 分类 | 纯夹具；renderer 的 `pointBufferVertexCount=814` 是完整上传量，`pointVertexCount=773` 是 visibility 过滤后的绘制量，正式上传/installer/drawRanges 契约一致 |
| 产品文件 | `0` |
| 允许夹具 | `tools/webgl-generator-worker-session-browser-regression.mjs` 与对应 R6a fixture digest |
| 最小修正 | point GPU bytes 对齐完整 buffer 计数；完整/可见两个计数分别与 drawRanges sum 精确同源 |
| 必须保持 | 其它 buffer、session delta/replay、API/UI/context、DOM identity、history、LongTask、Loading/GL/error 全部门 |
| 浏览器 | 当前 `2 / 10`；非浏览器门与同一只读评审接受前不使用第 `3 / 10` 次 |

- failure artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-p6-recheck-02\worker-session-browser-{full,summary}.json`。入口 7～20 未运行。
- 同一只读复核最终 `ACCEPT / P0 0 / P1 0 / browser 0`：point GPU bytes 继续严格绑定完整上传量，全部/可见两个 renderer count 分别与同一 drawRanges 的全量/visibility 过滤和精确一致；其它通用 buffer 与 session/replay/context/history/LongTask/error 门未放宽。syntax、artifact `208 / 340`、freeze `20 / 19 / 19`（digest `2cb16bf404d383986cb6bbdcc28e13236df441b2974da8ad3590e991d3ba61e8`）、session 与 diff PASS。
- 现使用第 `3 / 10` 次复验入口 6，artifact 写入 `Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-f6-recheck-03`；首败即停，完整通过后才进入入口 7。
- 第 `3 / 10` 次已通过 f6 原点位，后续 late-context 再次以可见 `pointVertexCount` 校验完整 point buffer，得到 `24024 !== 20256`；产品失败证据 `0`。failure artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-f6-recheck-03\worker-session-browser-{full,summary}.json`。
- 同一 blocker 复现触发强制冻结。全文件只读扫描确认 session fixture 只余 late-context 这一处同型物理字节消费；建议经用户裁定后单列一次性 `R6b-f7`，将两个相关 gate 的物理计数显式命名为 `pointBuffer`、保留完整/可见 drawRanges 双门，并加无残余旧写法静态门，产品文件 `0`。批准前剩余 `7 / 10` 浏览器额度、入口 7～20 全部冻结。

## 350-R6b-f7：point 物理/可见计数一次性夹具审计

| 冻结项 | 内容 |
|---|---|
| 用户裁定 | 已批准一次性同类夹具审计/修正 |
| 产品文件 | `0` |
| 允许夹具 | worker-session browser；R6a freeze AST 门及 canonical digest；三份权威状态文档 |
| 两个真实 gate | `runCommittedDisplayReplayGate`、`runCommittedLateContextGate` |
| 物理契约 | 显式 `pointBuffer = renderer.pointBufferVertexCount`，GPU bytes 仅与该值 ×24 比较 |
| 可见契约 | 显式 `pointVisible = renderer.pointVertexCount`，并与 visibility-filtered drawRanges sum 精确一致 |
| 静态门 | AST 必须检查两个真实函数，拒绝任何 `point` 物理槽继续绑定 `renderer.pointVertexCount`；同步 canonical digest |
| 浏览器 | 当前 `3 / 10`；非浏览器门和同一只读评审接受前不使用第 `4 / 10` 次 |

- 其它 buffer、delta1/render-only delta0、最终 replay、late context、API/UI、DOM identity、history、LongTask、Loading/GL/error 门全部保持；入口 7～20 未运行。
- 实施与同一只读复核完成：`ACCEPT / P0 0 / P1 0 / browser 0`。两个真实 FunctionDeclaration 分别锁定完整/可见 drawRanges 计数，物理 GPU bytes 仅绑定 `pointBuffer × 24`；freeze 全文件拒绝旧 `point ← renderer.pointVertexCount`，两个专项 mutation 分别破坏真实 committed-display / late-context gate。syntax、artifact `208 / 340`、freeze `20 / 19 / 19 + 2`（digest `1a270b1ff8f24e7d34571f16dff5a0dbc04090bbdf1e8b499cc34e49a2050351`）、session、artifact helper 与 scoped diff PASS，产品文件 `0`。现以第 `4 / 10` 次复验入口 6；完整通过后才进入口 7。
- 第 `4 / 10` 次入口 6 完整 PASS：18 个场景全部完成，14 次 Worker run accepted/committed、13 次 reused，最终 LongTask / page error / GL error / Loading 残留均为 `0`。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\06-worker-session-10k-f7-recheck-04\worker-session-browser-{full,summary}.json`。因此 f7 确认为纯夹具修复，无需产品返工；现使用第 `5 / 10` 次运行入口 7 的 100k session，首败即停。
- 第 `5 / 10` 次入口 7 在首个 100k rivers committed 后捕获 `293ms` 主线程 LongTask并停止；`compute 5994.1ms`、`renderInstallPrepare 880ms`、`commitTotal 922.5ms`，picking rebind 横跨 `711ms / 625 progress`，但现有 artifact 不足以把单个 LongTask归到 picking CPU、GPU call 或 yield 后浏览器工作。失败 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-05\worker-session-100k-browser-{full,summary}.json`。该失败与 f7 point 契约无关，按 >200ms 硬线单列 `R6b-p7`；下一次只运行既有 100k rivers GPU/yield 聚焦诊断，产品暂不修改，完整入口 7 与入口 8～20冻结。
- 第 `6 / 10` 次聚焦诊断稳定复现 `255ms`：LongTask `40638.3～40893.3`，第一个 scheduler yield `40892.4` 才开始；GPU calls 从 `42091.6` 后开始，总计 `19.4ms`、单次最大 `11.5ms`，91 个 yield 最大 `3ms`。结合 `operationEnded 42187.0 - commitTotal 1320.6 ≈ commitStarted 40866.4`，阻塞明确跨越 Worker 末包续体、完整同步 pre-commit validator、commit 前导和 picking 首 slice，而非 GPU；trace：`work/task322-100k-rivers-gpu-diagnostic/gpu-trace.json`，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p7-diagnostic-06\worker-session-100k-rivers-gpu-diagnostic-{full,summary}.json`。
- `R6b-p7` 冻结实现：只在 `executeWorkerMapMutation` 存在 `mutation.assertOutput` 时，于完整 validator 前后各增加一次 `await yieldToBrowser(documentRef)`；每次恢复后重查 operation、map/revision/generation/lock 与 output binding，validator 本身不删减、不降采样。`worker-session-contract` 以 AST 锁定真实函数的五条直接语句，并用删除前/后 yield 两个反例自证。产品 `app.js` 一处、测试 session contract 一处；非浏览器门与同一只读评审接受前 browser 保持 `6 / 10`。
- 实施后静态红门转绿：真实 `executeWorkerMapMutation` 的 validator guard 恰有五条直接语句，两个删除-yield mutation 均拒绝，六字段 validator 输入与前后 operation/binding 复核精确。geography 旧 optional-call token 同步为 direct awaited call；map-adoption 旧无参 replaceMap token 同步为当前更严格的显式 `runtimeMapIdentity`，两者只修 Node 夹具。entry 7 六个 Node 前置、geography、task-350 catalog/freeze、两脚本 syntax、typecheck、`1399 modules` build 与 scoped diff PASS；产品仅 `app.js`，browser 仍为 `6 / 10`，待同一只读评审。
- 同一只读复核最终 `ACCEPT / P0 0 / P1 0 / browser 0`：三次 current/binding 与后续 render-context 门阻止 yield 后 stale commit，原 session invalidation/rollback 保持；river lake/drainage validator 未放宽。现用第 `7 / 10` 次完整复验入口 7，artifact 写入 `Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p7-recheck-07`；首败即停，入口 8 未启动。
- 第 `7 / 10` 次仍在首个 100k rivers 以单个 `227ms` LongTask 首败；功能已 committed，`renderInstallPrepare 930.6ms / commitTotal 984.7ms`，未出现先行 GL/事务错误。p7 已把原 `293/255ms` 降低，但 validator 前后独立 yield 后仍越硬线，剩余阻断锁定为同步 `createRiverLakeDrainageExpectations` 本体，不是 f7 夹具，也不应回滚 p7。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p7-recheck-07\worker-session-100k-browser-{full,summary}.json`。同一 blocker 再现后按停止条件冻结，用户现已批准 `R6b-p7b`：范围仅含完整 lake/drainage expectation 的可让出实现、异步 river validator、正式 runtime 接线与对应契约；每次让出后复核 current/cancel，保留同步兼容入口和全部校验语义。静态门、专项 Node 与同一独立复核接受前不得使用第 `8 / 10` 次，剩余 `3` 次与入口 8～20继续冻结。
- `R6b-p7b` 实施完成、待同一独立复核：`rivers.js` 保留同步 expectation 并新增 8 段异步等价入口，features Worker runtime 保留同步 validator、仅为正式 rivers 增加异步 pre-commit 路径，`app.js` 将每次恢复接回既有 `assertWorkerRegenerationOutputCurrent`。专项红门先以缺少异步 export 失败，转绿后确认 `8 yields / 8 current checks / sync parity / cancellation source unchanged`；100k 请求夹具为 `55,553` pack cells，validator 总计 `170.6ms`、最大单段 depression `107.4ms`，其余 lake drainage `27ms`、最终 mirror `25.8ms`，均低于 `200ms`。entry 7 六项 Node 前置、geography、catalog/freeze、syntax、typecheck、`1399 modules` build 与 scoped diff-check 全过；browser 保持 `7 / 10`，评审接受前不运行第 8 次。
- 同一独立复核最终 `ACCEPT / P0 0 / P1 0 / browser 0`：同步完整语义保留，异步 8 段无采样/放宽且 yield 后立即 current；正式 runtime 仅 rivers 使用 async，最终仍进入原 river mirror 拒绝面，stale 保持原 session invalidation。独立 100k 复跑为 `55,553 cells / total 168.4ms / max slice 102.1ms`，取消与完整 source 指纹不变。现仅用第 `8 / 10` 次目标复验入口 7，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p7b-recheck-08`；首败即停，入口 8 不启动。
- 第 `8 / 10` 次已越过原 rivers blocker：rivers `wall 7982ms / install 806.3ms`，随后 routes、markers 完成，未再出现 validator >200ms LongTask。新首败位于 100k hard-cell 第一次正式高度编辑 `121.8ms > 50ms`；功能断言先行通过，属于新暴露产品性能，不是夹具或 p7b 回归。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p7b-recheck-08\worker-session-100k-browser-{full,summary}.json`。`R6b-p8` 冻结为三项等价快路：有序 range 指纹不再复制排序，未预热高度 API 直接一次扫描投影目标 pack cells，scheduler/runtime/pick 只发布一次最终状态；旧乱序指纹、预热缓存、历史/owner/CPU/GPU/UI 语义保持。门禁与同一复核前 browser 固定 `8 / 10`。
- `R6b-p8` 同一独立复核最终 `ACCEPT / P0 0 / P1 0 / browser 0`：有序 Map 快路逐项校验且保持旧 FNV 指纹，乱序兼容仅排序一次；冷启动高度快路不建 cache，预热和 legacy 路径保持；正式高度 API 只在最终统计后各发布一次 runtime/pick/lock。专用门为 ordered `sort 0`、reverse `sort 1`、100k 冷投影 `2.7～10ms / cache 0`；受影响边界门、100k river、catalog/freeze、typecheck、`1399 modules` build 与 diff-check 均 PASS。现使用第 `9 / 10` 次目标复验入口 7，artifact 写入独立 p8 recheck 目录；首败即停，入口 8 不启动。
- 第 `9 / 10` 次尚未到 hard-cell，在 markers Worker 输出单包 `postMessage` 计时以 `95.5ms > 50ms` 首败；前序 rivers / routes 的 maxPost 为 `1.5 / 1.1ms`，同位置第 8 次为 `1.4ms`。三次不使用浏览器的 100k Worker 流隔离复测均 PASS，最大 packet duration `8.348 / 7.349 / 8.426ms`，未证明稳定包体或实现阻断。保持产品、fixture、`50ms` 阈值原样，现使用最后第 `10 / 10` 次同入口目标复验；artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p8-recheck-09\worker-session-100k-browser-{full,summary}.json`，首败即停且入口 8 不启动。
- 第 `10 / 10` 次 markers 恢复为 `1.3ms` 并通过，p8 的 100k hard-cell 两格完整 `<50ms` 性能与功能门也已通过；随后 accepted-cancel 后 fresh routes 首败于 `overlay-label:owner-render-generation`。根因是 hard-cell finally 通过正式 display API 恢复视图时，隐式 `refreshCellSurface` 推进 surface generation，却没有让 overlay/label/picking/六族 cache owner 跟随；下一次 Worker preflight 正确 fail-closed。`R6b-p9` 冻结为单一产品修正：保留重建前 binding，并在 surface owner 接纳后无条件调用既有 `rebindEditedRendererResources(newSurfaceBinding, previousBinding)`；不得改夹具、拒绝面或物理资源。browser 已用完 `10 / 10`，先做红门、Node 和同一复核。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p8-recheck-10\worker-session-100k-browser-{full,summary}.json`。
- `R6b-p9` 实施完成、待同一复核：产品仅在 `refreshCellSurface` 重建前冻结 previous surface binding，并在新 owner 接纳后无条件走既有 `rebindEditedRendererResources`；没有替换 cache/overlay/picking 物理引用，也没有放宽 owner mismatch。契约门先红后绿，冻结完整 method AST 并保留 11 个 mutation 反例；render-cache、prepared installer、worker-task、render preparation、GPU display、presentation/theme、worker-session、p8 专项、catalog、syntax、typecheck、`1399 modules` build 和 diff-check PASS。route-style 旧源码 token、shoreline 旧三角阈值属于已有独立夹具漂移，未混修；browser 仍为 `10 / 10`。
- `R6b-p9` 同一独立复核最终 `ACCEPT / P0 0 / P1 0 / browser 0`：旧 binding 快照与新 owner 发布顺序正确，既有 preflight 在写入前拒绝漂移，异常完整恢复 owner/wrapper，成功只换 binding/wrapper 而不替换物理引用；完整 AST 与 retained-only、不可达、未调用闭包、提前 return 反例闭合。p9 接受，browser 已用完 `10 / 10`；待用户新增额度后只复验入口 7，入口 8～20冻结。
- 用户新增最多 `20` 次浏览器/CDP 验收额度及第 350 项封闭范围内继续修复/复核授权；不授权合入 `main`、推送或破坏性操作。新增额度独立记为 `0 / 20`，现使用 `1 / 20` 完整复验入口 7，artifact 写入独立 p9 recheck 目录；首败即停，通过后才进入口 8。
- 新增第 `1 / 20` 次再次越过 rivers / routes / markers 与 p8 hard-cell，随后在 accepted-cancel 后 fresh routes 复现同一 `operation_failed / retained render resource owner 不一致：overlay-label:owner-render-generation`；artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p9-recheck-extra01\worker-session-100k-browser-{full,summary}.json`。因此 p9 的 Node-valid 原子 surface owner 修正保留，但“不一致已闭合”的浏览器结论撤回；入口 7 全门与入口 8～20冻结，剩余 `19 / 20` 只先用于一次 hard-cell cleanup → accepted-cancel → fresh routes 绑定时序窄诊断，不进入补夹具—跑全门循环。
- 新增第 `2 / 20` 次仅执行绑定时序诊断，trace：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\07-worker-session-100k-p9-owner-diagnostic-extra02\owner-trace.json`。hard-cell cleanup 和 accepted-cancel 后 surface / active / picking / label / overlay / 六族 cache 均保持 generation `3`；取消只把 `latestIssued / next` 预占为 `4`。fresh routes 的无 surface partial commit 随后把 picking / label / overlay / cache 发布到 `4`，surface / active 仍为 `3`，`resumeWorkerRenderInstall` 首次检测并拒绝，rollback 精确恢复全部 generation `3`。这排除 hard-cell、p9 与取消清理本身，根因锁定为 prepared installer 的废弃换代后 partial retained-surface 发布缺口。

## 350-R6b-p10a / p10b：废弃换代后的 partial surface owner 接续

| 项目 | 冻结内容 |
|---|---|
| p10a 夹具 | 在正式 prepared-installer 专项构造：surface generation 3、失败/取消的 replacement 已预占 next 4、随后无 surface partial binding 为 4；提交必须让 retained surface、picking/overlay/cache 同代，物理 surface / correction buffers 不变，rollback owner/wrapper/ref 精确恢复，下一次 replacement 必须大于 4 |
| p10b 产品 | 仅修改 `prepared-render-installer.js`；partial target 代际超前且 map/topology 与当前 surface 同源时，先完整校验旧 surface owner/wrapper/物理引用，再在同一 transaction before-image 中重绑 surface buffer wrappers 与 owner，并复用既有 retained/cache 原子重绑；普通同代 partial 与 full surface 路径不变 |
| 非目标 | 不修改浏览器夹具、owner mismatch 拒绝面、generation 单调签发、物理 GPU buffer、地图/历史/Worker session 语义；p9 不回滚 |
| 浏览器 | 当前 `2 / 20`，剩余 `18`；p10a 红门、p10b 绿门和同一只读复核接受前冻结入口 7 |

- p10a 已得到确定性产品红门：partial request 已精确接续废弃 replacement 的 generation `1` 并成为 latest binding，prepared commit 后断言 surface owner 应为 `1`，实际仍为 `0`；首败没有落在 fixture shape、签发或 latest guard。后续 p10b 不再修改该正例、rollback/物理引用和下一换代断言。
- p10b 当前冻结待评审：retained-surface plan 只处理无 surface、同 map/topology 且 generation 严格前进的 partial；旧 surface 整组 preflight 在任何 assign 前完成。真实 routes 的 `cities + routeSegments` partial picking 先按旧 owner 校验并局部应用，overlay 后接，随后 surface wrapper/owner 与 retained/cache 在同一无 await commit 中对齐目标代；普通同代 partial、full surface 和 in-place patch 不进入新分支。专项输出 `21 cases / abandonedReplacementPartialRebind=true`，并包含 wrapper 漂移零写入拒绝、commit/rollback、descriptor/GPU buffer 复用、未准备 cache 引用不变和下一 replacement 越过废弃代；相邻 Node、typecheck、1399-module build、syntax/diff 均 PASS，browser `0`。
- p10 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：独立确认所有 source/cache/picking/overlay preflight 早于 assign，partial picking 旧-owner 校验、overlay、surface owner 与六 cache 发布顺序闭合；surface/correction rebind 保留原 descriptors/buffers，rollback/finalize 不误删共享 GPU 资源。独立门为 installer 21 cases、cache `17/27/11`、syntax 与 scoped diff-check。现只在生产 rebuild 后使用新增第 `3 / 20` 次入口 7 目标复验，artifact 写入独立 p10 recheck 目录；首败即停。
- 新增第 `3 / 20` 次入口 7 完整 PASS：100k newMap `22351ms`，rivers `9292ms`、routes `3044ms`、markers `2634ms`，accepted-cancel 后 fresh routes `16313ms`；4 次 Worker run 全部 accepted/committed，前三次复用同一 session，恢复任务正确使用 fresh session。hard-cell、buffer、heap、cancel recovery 均通过，最大 LongTask `88ms`、over-budget `0`，non-performance health error / page error / GL error / Loading 残留均为 `0`。artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\07-worker-session-100k-p10-recheck-extra03\\worker-session-100k-browser-{full,summary}.json`。p10 的真实浏览器阻断闭合，固定入口 1～7 均 PASS；新增额度剩余 `17 / 20`，下一项按 catalog 为入口 8 `regress:grid-topology-browser`。

## 350-R6b-f8：入口 8 topology refinement 资源绑定夹具迁移

| 项目 | 冻结内容 |
|---|---|
| 首败 | `regress:grid-topology-refinement` 在正式计算前以 `renderPreparation.binding.topologyRevision 必须是非负安全整数` 拒绝 |
| 分类 | 纯夹具漂移；正式 runtime 已签发 topology replacement 的目标 source/topology revision 与完整 resource binding |
| 夹具边界 | 仅 `tools/webgl-generator-grid-topology-refinement-regression.mjs`；补 source binding 的 `topologyRevision`，render binding 使用 canonical `sourceRevision +1 / topologyRevision +1 / renderPreparationId / renderGeneration`，并断言 prepared output exact 同源 |
| 非目标 | 产品代码、浏览器 fixture、revision / history / topology 行为、resource-binding 拒绝面 |
| 浏览器 | 入口 8 尚未启动；新增额度保持 `3 / 20`，f8 专项与同一只读复核接受后才使用第 `4 / 20` 次 |

- f8 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：source topology `0` 与目标 source/topology `+1` 的 canonical binding 真实进入 Worker，prepared output exact 同源；refinement、syntax 与 scoped diff 均独立 PASS。

## 350-R6b-f9：surface base owner 资源绑定夹具迁移

| 项目 | 冻结内容 |
|---|---|
| 首败 | 入口 8 foundation 前置在最后的 surface-base 门以 `surfaceResourceOwner.binding.topologyRevision 必须是非负安全整数` 拒绝 |
| 只读盘点 | 全仓 `createSurfaceResourceOwner` 调用中，未迁移的成功构造仅为该夹具 ownerA / ownerB 两处；prepared installer 的不完整 binding 调用是既有明确拒绝反例 |
| 夹具边界 | 仅 `tools/webgl-generator-surface-base-buffer-set-regression.mjs` 两个 owner 输入迁移为 canonical resource binding；保持 map/revision 相同但 identity 不同及不可复用断言 |
| 非目标 | 产品、browser fixture、surface buffer 物理语义、owner 拒绝面、其它 Node 夹具 |
| 浏览器 | 仍为 `3 / 20`；f9 专项、foundation 聚合与同一只读复核接受后才启动入口 8 |

- f9 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：两 owner 的 canonical binding 与异 map 拒绝断言成立，prepared-installer 的不完整 binding 负例未移动。surface-base 专项、完整 foundation 聚合、syntax 与 scoped diff PASS；入口 8 前置全部闭合，现使用第 `4 / 20` 次浏览器额度运行固定入口 8，首败即停。

## 350-R6b-p11a / p11b：边界双邻居退化 cell 的安全 Voronoi 恢复

| 项目 | 冻结内容 |
|---|---|
| 浏览器首败 | 固定入口 8 的 10k→100k prepared surface：`grid cell 99712 无法形成安全表面` |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\08-grid-topology-extra04\\grid-topology-browser-{full,summary}.json` |
| 窄诊断 | cell 中心 `[1015.4687658258441, 959.999]`，三顶点塌缩为两点，邻居仅 `9968 / 99717`；既有 `neighborPoints.length < 3` 提前拒绝。两邻居加地图矩形的同算法交集得到安全三角，正式 triangulation `ok` |
| p11a 红门 | 构造边界三顶点塌缩且恰有两个合法邻居的 map；hard surface 必须有连续非零 range；smooth 曲线边界若已安全则只要求无缺面、无 leak，不强迫进入 fallback；零邻居 collapsed 反例继续拒绝 |
| p11b 产品 | 仅 `cell-visual-layer.js` 将 Voronoi recovery 最低唯一邻居数从 `3` 收窄到 `2`；其它 clipping、center-in-boundary、cleanup、triangulation/area 校验不动 |
| 非目标 | browser fixture、grid topology 数据、earcut/面积阈值、零/单邻居 fail-closed、其它 fallback 顺序 |
| 浏览器 | 已用 `4 / 20`、剩余 `16`；Node 与同一只读复核接受前冻结入口 8，入口 9 未启动 |

- p11 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：唯一产品改动为邻居下限 `<3 → <2`，后续 clipping/center/cleanup/triangulation 拒绝未动；零/单邻居负例与双邻居正例均成立。固定 seed 100k Node 重放 `100000 / 100000` ranges，cell `99712` 为一个安全三角；surface-base、render preparation、foundation、typecheck、1399-module build、syntax/diff PASS。现用第 `5 / 20` 次只复验入口 8，入口 9 不提前启动。

## 350-R6b-f10：入口 8 最终 receipt 与 Task 350 性能口径迁移

| 项目 | 冻结内容 |
|---|---|
| 第 5 / 20 次结果 | 产品功能完整成功：`10004 → 100000 → 10004 → 100000`、fingerprint exact、topology violation `0 / 0`、13 layers、38 install stages、accepted/committed、最大 LongTask `74ms`、应用 health/page/GL/Loading 均为 `0` |
| 失败 artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\08-grid-topology-p11-recheck-extra05\\grid-topology-browser-{full,summary}.json` |
| 五项夹具漂移 | wrapper 在 coordinator.run 返回时捕获 pre-commit pending receipt；undo/redo 后合法 invalidation 令 final coordinator 为 `null`；operation-stall 未按性能信号分类；旧 C1 `<20s` 墙钟与 GC 前 `<1.5GiB` 瞬时堆仍冒充 Task 350 硬门 |
| 性能实证 | 墙钟 `29604ms`；GC 前 `1724458177`、GC 后 `690535360`、相对基线净保留 `446891589` bytes；最大 LongTask `74ms`、`>200ms = 0`。吞吐和瞬时分配保留为 artifact，不冒充 p11 拓扑返工 |
| f10 唯一写入 | browser fixture 改读最终 execution session；final coordinator 允许 null/idle 且禁止 pending；夹具本地完整分类四类 performance health；只删除墙钟与 GC 前堆的 hard predicate，GC 后 `<900MiB` 及全部功能/错误/200ms 门保持；同步唯一 AST digest |
| 非目标 | 产品源码、p11、共享 diagnostics helper、catalog policy、LongTask `200ms`、GC 后 `900MiB`、入口 9～20、main 合并 |
| 最小验收 | `node --check`、browser artifact contract、R6a freeze/mutation、scoped diff、同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`；接受后只使用第 `6 / 20` 次复验入口 8 |

- f10 首轮独立复核 `BLOCK / P0 0 / P1 1 / browser 0`：health event 已重分类，但 passed 仍读取 pre-partition total。最窄修正改读 `report.healthErrors.total`，freeze 同时锁定新条件、拒绝旧条件并新增 `staleHealthTotalMutation`；blocker-only 最终 `ACCEPT / P0 0 / P1 0 / browser 0`。syntax、artifact helper、artifact contract `208 / 340`、freeze `20 / 19 / 19 + 2 + 1`、catalog `16 / 17 / 20 / 4` 与 diff-check PASS。现仅运行第 `6 / 20` 次入口 8 目标复验。

- 第 `6 / 20` 次入口 8 正式 PASS：`10004 → 100000 → 10004 → 100000`、fingerprint exact、topology `0 / 0`、Worker committed、13 layers、38 install stages、legacy load unchanged；LongTask `2` 条、最大 `71ms`、over-budget `0`，GC 后 `690502928` bytes，application console/health/page/GL/Loading 全 `0`。full / summary `27681 / 3919 bytes`，SHA `43224CB8...3E66B / 77B1672F...42FFB`，artifact 在 `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\08-grid-topology-f10-recheck-extra06`。入口 8 完成，现运行入口 9 三项 Node 前置；浏览器剩余 `14` 次。

- 入口 9 的 Feature / society / economy 三项 catalog Node 前置全部 PASS：锁对象、100k 双侧镜像、no-op、冲突和失败 rollback 均成立。现使用第 `7 / 20` 次运行 `regress:regeneration-lock-direct-domains-browser`，入口 10 冻结。

## 350-R6b-p12a / p12b：军事策略 picking 对象族注册

| 项目 | 冻结内容 |
|---|---|
| 入口 9 首败 | 第 `7 / 20` 次在首个军事策略比例动作、提交前报 `operation_invalid_input / 没有 military-policy 的 picking 准备范围`；入口 10 未启动 |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\09-direct-lock-extra07\\regeneration-lock-direct-domains-browser-{full,summary}.json` |
| 根因 | 正式入口 targetKind=`military-policy` 且请求 picking；render-preparation 只登记 `military → [military]`，漏掉同对象族的 policy kind |
| p12a 红门 | `renderPreparationPickingComponentsForRegeneration("military-policy")` 必须精确为 `["military"]`；未知 kind 拒绝反例保持 |
| p12b 产品 | 仅在 `REGENERATION_PICKING_COMPONENTS` 增加 `"military-policy": ["military"]` |
| 非目标 | browser fixture、render layer 集合、OBJECT_PICKING_COMPONENTS、军事任务/Manifest/锁语义、其它 kind、入口 10、main 合并 |
| 最小验收 | render-preparation、military-policy Worker、三域协议、入口 9 三项 Node 前置、typecheck、build、syntax/diff、同一只读复核；接受前 browser `7 / 20` |

## 350-R6b-f11：军事策略 Worker render binding 夹具迁移

| 项目 | 冻结内容 |
|---|---|
| 发现位置 | p12b 后 render-preparation 已 PASS；追加 military-policy Worker 专项在产品计算前报 `renderPreparation.binding.topologyRevision 必须是非负安全整数` |
| 根因 | 夹具唯一 `createRenderRequest` 仍只构造 `mapIdentity + mapRevision`，未迁移 R3b 的 complete resource binding |
| 唯一写入 | `webgl-generator-military-policy-worker-task-regression.mjs` 导入 canonical factory；compute binding 增 topology revision；render source/topology 按正式 mutation `+1`，preparation id / generation 随 operation 唯一；apply/undo/redo prepared binding exact 同源 |
| 非目标 | 产品、browser fixture、其它旧 Worker fixture、revision 规则、binding validator、入口 10、main 合并 |
| 最小验收 | military-policy Worker、render-preparation、三域协议、typecheck/build、syntax/diff、同一只读复核；browser `0` |

- p12/f11 候选证据：render-preparation 10k PASS；军事策略 10k 的 apply/undo/redo 三份 prepared binding exact、fallback/锁/取消/故障/stale 全部成立，100k 为 `99846 / 70856 / 1727.9ms`；三域协议 `44` 类拒绝、三项锁前置、typecheck、1399-module build、syntax/diff PASS。产品仅一个 picking mapping，夹具仅一个 helper 与三条 exact 断言；现交同一只读复核，browser 仍为 `7 / 20`。

- p12/f11 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：最小 military picking mapping 与 unknown 拒绝成立；f11 的 source/topology `+1` canonical receipt、唯一 preparation/generation 和三次 exact 断言成立。现使用第 `8 / 20` 次只复验入口 9，入口 10 冻结。

## 350-R6b-p13a / p13b：兵种比例重建保留既有战报 archive

| 项目 | 冻结内容 |
|---|---|
| 第 8 / 20 次首败 | picking 已通过；military-policy pre-commit 报 `军事策略结果改变了战报元数据 events`，入口 10 未启动 |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\09-direct-lock-p12-recheck-extra08\\regeneration-lock-direct-domains-browser-{full,summary}.json` |
| 根因 | 比例命令使用 buildMilitary 重建部署；builder 只合并锁定军团关联事件，丢失其它既有 events 和 archive metadata；正式 validator 正确拒绝 |
| p13a 红门 | policy source 带一个既有 battle event，并冻结 `metadata.events / eventSequence / eventArchiveGeneration`；Worker shadow 四项必须与 source exact，validator 原拒绝保持 |
| p13b 产品 | 比例重建后从 snapshot before-image 恢复完整 events 和上述三项 metadata，再同步 map/pack military alias；其它军事统计、campaign/front 与目标策略继续由 builder 生成 |
| 非目标 | 放宽 validator、完整 military regeneration 归档语义、锁定事件 helper、browser fixture、其它军事根字段、入口 10、main 合并 |
| 最小验收 | 三域协议、military-policy Worker、军事锁/重生成、typecheck/build、syntax/diff、同一只读复核；browser `0` |

- p14a 红门精确复现 own-property `false !== true`；p14b 只把 `stale` 加入既有 protected metadata before-image 恢复清单。三域协议 `44` 类拒绝、military-policy 10k/100k（`99846 cells / 70856 pack / 2005.1ms`）、完整军事重生成、军事锁、typecheck、1399-module build、syntax/diff 均 PASS；现交同一只读复核，browser 保持 `9 / 20`。

- p14 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：stale own-property/value、唯一字段追加、缺失删除、无关 metadata 不回填、alias 与完整重生成边界全部成立。现使用第 `10 / 20` 次只复验入口 9，入口 10 冻结。

## 350-R6b-f12：紧邻经济重算空 patch 夹具迁移

| 项目 | 冻结内容 |
|---|---|
| 第 10 / 20 次首败 | 外交与军事段已越过；assignment 后紧邻 rebuild 返回 `executed=false`，旧夹具误判失败 |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\09-direct-lock-p14-recheck-extra10\\regeneration-lock-direct-domains-browser-{full,summary}.json` |
| 诊断 | 同种子 Node 为 assignment 后 `23 markets / 12039 deals / 1+1 locks / command isNoop=false`；相同输入再次计算形成空 Worker patch，domain patch 正确不建空 history |
| f12 夹具 | assignment 继续 hard PASS；紧邻 rebuild 冻结为 `executed=false / operation=rebuild / changedPaths=0 / history exact`，锁定 market/deal 继续 exact |
| 防混淆 | 后续“双域全部锁定”的 task-level no-op 继续保留，前一项是计算后空 patch，后一项是预检 no-op |
| 非目标 | 产品、Worker、validator、锁实现、catalog policy、入口 10、main 合并 |
| 最小验收 | direct fixture syntax、artifact contract、freeze/digest/mutation、三项入口 Node 前置、typecheck/build、同一只读复核；browser `0` |

- f12 候选证据：artifact helper 全部成功/失败路径，artifact contract `208 / 340`，fixture freeze `20 / 19 / 19` 并新增 direct-lock 专项变异 `1`，catalog `16 / 17 / 20 / 4`，Feature/society/economy 锁、typecheck、1399-module build、syntax/diff 全 PASS。产品改动 `0`；现交同一只读复核，browser 保持 `10 / 20`。

- f12 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：assignment 真事务、空 patch rebuild 的全 transaction snapshot 不变、后续全锁 task-level no-op 与 freeze/mutation 均成立，产品新增 `0`。现使用第 `11 / 20` 次只复验入口 9，入口 10 冻结。

- 第 `11 / 20` 次证明 f12 的 `executed=false / changedPaths=[] / history exact / Worker committed` 成立，唯一夹具误读是把 Worker result 的字符串 operation 当成公开 API 字段；正式公开回执为 `operation.name=edit.economy.rebuild / status=success / stage=commit`。现对 f12 做 blocker-only receipt 修正，产品新增 `0`，browser 剩余 `9`。

- f12 blocker-only 候选：公开 operation name/status 与 Worker committed/non-pending 已进入 fixture 和 freeze 结构门；artifact `208 / 340`、freeze direct-lock mutations `2`、三项锁、syntax/diff PASS，产品/dist 新增 `0`。现只做同一复审，browser 保持 `11 / 20`。

- f12 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`：公开 receipt、Worker commit、empty patch/history、assignment 真事务、全锁 no-op 与两个专项 mutation 全部成立。现使用第 `12 / 20` 次只复验入口 9，入口 10 冻结。

## 350-R6b-f13：入口 9 operation-stall 性能分类迁移

| 项目 | 冻结内容 |
|---|---|
| 第 12 / 20 次首败 | 全功能链已完成；最终仅两条 operation-stall 被误列 application error |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\09-direct-lock-f12-receipt-recheck-extra12\\regeneration-lock-direct-domains-browser-{full,summary}.json` |
| f13 夹具 | 仅把 operation-stall 加入已有 main-thread/render-gap/input-handler 性能正则，并保留 evidence count |
| 保持硬门 | 全部 LongTask 明细、`>200ms=0`、application/page/GL/Loading、全部功能/事务/锁断言 |
| 非目标 | 产品、共享 helper、性能阈值、其它 fixture、入口 10、main 合并 |
| 最小验收 | direct fixture syntax、artifact/freeze digest/结构/mutation、catalog、diff、同一只读复核；browser `0` |

- f13 候选：operation-stall 只进入性能 evidence；全部 LongTask/`>200ms` 与应用错误硬门保持。两文件 syntax、artifact helper、fixture freeze `20 / 19 / 19 + direct-lock mutations 3`、catalog `16 / 17 / 20 / 4`、diff PASS，产品/build 新增 `0`；现交同一只读复核。
- f13 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：仅分类正则改变；非性能 application/page errors、全部 LongTask 与 `>200ms`、full/compact evidence、功能/事务/锁/Worker/GL/Loading 门均保持，第三个 direct-lock mutation 精确拒绝删回 operation-stall。现使用第 `13 / 20` 次只复验入口 9，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\09-direct-lock-f13-recheck-extra13`；入口 10 冻结。

## 350-R6b-f14：入口 9 夹具全图快照可让出

| 项目 | 冻结内容 |
|---|---|
| 第 13 / 20 次首败 | 全功能链完成；LongTask `213 / 2879 / 1134ms` |
| 第 14 / 20 次唯一窄诊断 | 稳定 `3016 / 1118ms` 均完全位于产品 await 返回后的夹具同步全图序列化区间 |
| artifacts | `...\09-direct-lock-f13-recheck-extra13`、`...\09-direct-lock-longtask-diagnose-extra14` |
| f14 夹具 | no-write 快照改用既有 4ms 可让出 canonical 全图 checksum；每次唯一 audit revision 禁止 cache 掩盖漂移；单事务快照移除未读取的全图 stringify |
| 保持硬门 | canonical 全图无写入、history/revision/salt、领域 envelope、全部 LongTask 与 `>200ms=0`、application/page/GL/Loading、Worker 终态 |
| 非目标 | 产品、Worker、锁、性能阈值、其它 fixture、入口 10、main 合并 |
| 最小验收 | freeze 先红后绿并含同步 stringify/cache 两类 mutation；syntax、artifact/catalog、canonical checksum 专项、diff、同一只读复核；browser `0` |

- f14 候选：freeze 红门精确失败于缺少 canonical checksum；实施后 12 个 no-write 前后快照均 await 4ms 可让出完整摘要，每次递增 audit revision 强制重算，普通单事务 snapshot 移除未读取的 map 字段。freeze `20 / 19 / 19 + direct-lock mutations 6`、artifact `208 / 340`、artifact helper 四态、catalog `16 / 17 / 20 / 4`、map-replica command patch、registry identity、presentation contract、syntax/diff PASS；产品/build 新增 `0`，browser 保持 `14 / 20`，现交同一只读复核。
- f14 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：canonical registry 的全部权威顶层 section、六组/12次 await、唯一 audit revision、4ms budget、source root containment 和原 history/revision/salt/锁/LongTask 硬门均成立。现使用第 `15 / 20` 次目标复验入口 9，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\09-direct-lock-f14-recheck-extra15`；入口 10 冻结。

## 350-R6b-p15：万级重生成锁存在性索引

| 项目 | 冻结内容 |
|---|---|
| 第 15 / 20 次首败 | f14 后仍有 `2784 / 938ms` LongTask，位于全交易 setMany / clearKind 窗口 |
| 直接根因 | `12056` 个 trade-flow 逐条 `.find` 全 deals；单次 references normalize `657.5ms`、store normalize `536.3ms`，命令内重复执行 |
| 产品修复 | 一次 store normalize 内按 kind 惰性建立存在性 Set，批量引用验证 O(n²) → O(n)；外交复用国家索引，军事保留 state-slot 语义 |
| 保持契约 | 单引用 API、排序/去重/strict diagnostics、inspection token、history/revision/undo/redo、锁仓格式、f14 与 200ms 门 |
| 非目标 | async 化公开锁 API、夹具/阈值、经济 Worker、其它对象索引、入口 10、main 合并 |
| 最小验收 | 12k 红门转绿且语义等价；既有锁/导入/Worker 门、typecheck/build、diff、同一只读复核；browser `0` |

- p15 候选：12k 红门先以 normalize `1191.5ms` 失败；惰性存在性 Set 后独立 normalize/store/setMany/clear 为 `14.2 / 10.3 / 48.6 / 12.6ms`，并发复跑 `23.4 / 14 / 84.5 / 24.1ms`。15 kind、strict diagnostics 精确 index/code、单 history/undo/redo、ocean-current legacy removed 语义及 Feature/社会/外交/军事/经济/城路/省国/河流、C1、UI/matrix、迁移/file-io Worker、三域协议、syntax/typecheck/freeze/1399-module build/diff 全部 PASS；browser 保持 `15 / 20`，现交同一只读复核。
- p15 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：activeIndexed 索引初稿未保留 removed 槽位遮蔽同号 id fallback，批量接受面比单引用宽。blocker-only 修正以 occupied slot 优先、空槽首个同 id 项回退精确复刻旧语义，并加入 slot1 removed / slot3 active id1 的单引用与批量双拒绝反例；12k 仍为 `13.5 / 9.5 / 51.8 / 12.2ms`，外交/军事/经济、syntax/diff PASS，现交同一复审。
- p15 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`：occupied-removed、empty-first-removed、empty-first-active 三类单/批语义一致；复核机 12k 为 `22.5 / 16.4 / 110.4 / 20.2ms`。最终 typecheck 与 1399-module build 重跑 PASS；现使用第 `16 / 20` 次目标复验入口 9，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\09-direct-lock-p15-recheck-extra16`；入口 10 冻结。

## 350-R6b-f15：入口 9 最终协调器 null-or-idle

| 项目 | 冻结内容 |
|---|---|
| 第 16 / 20 次结果 | p15 原性能窗口通过，`>200ms=0`；仅最终 session null 被误拒绝 |
| 正式契约 | getSessionSnapshot 无 persistent session 返回 null；入口 8 已接受 null 或 idle/non-pending |
| f15 夹具 | 最终 coordinator 允许 null 或 idle 且 pending 非 true；operation receipt committed/non-pending 不动 |
| 非目标 | 产品、Worker 生命周期、锁/事务/性能阈值、其它 fixture、入口 10、main 合并 |
| 最小验收 | freeze 红门及 idle-only mutation；syntax、artifact/catalog、diff、同一只读复核；browser `0` |

- f15 候选：freeze 红门精确失败于缺少 null-or-idle/non-pending；夹具只改最终 coordinator assert，direct AST digest 同步，第 7 个 direct-lock mutation 精确拒绝退回 idle-only。syntax、artifact `208 / 340`、artifact helper 四态、catalog `16 / 17 / 20 / 4`、freeze `20 / 19 / 19 + direct-lock 7`、diff PASS；产品/build 新增 `0`，browser 保持 `16 / 20`，现交同一只读复核。
- f15 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：最终 coordinator null-or-idle 与 operation receipt committed/non-pending 分离正确，LongTask/错误/GL/Loading/功能/事务/锁及 artifact 门均不变。现使用第 `17 / 20` 次目标复验入口 9，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\09-direct-lock-f15-recheck-extra17`；入口 10 冻结。

- 第 `17 / 20` 次入口 9 最终 PASS：外交 `190` 对、军事 `84` 军团、经济 `24 / 12553` 市场 / 交易流及确定性重建/Worker receipt 均通过；LongTask 上限 `107ms`、`>200ms=0`，application/page/GL 错误 `0`，Loading 不可见。artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\09-direct-lock-f15-recheck-extra17\\regeneration-lock-direct-domains-browser-{full,summary}.json`。固定入口 1～9 PASS；现执行入口 10 的三条 Node 前置门，浏览器额度剩余 `3` 次。

- 入口 10 的 height/state、river generator、matrix 三条 Node 前置门全部 PASS；matrix 分母 `14 / 15 / 22`、差异 `0`，河流覆盖 `50k / 100k`，height/state negative cases `3`。现使用第 `18 / 20` 次浏览器入口 10，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-extra18`；启动后剩余 `2` 次。

## 350-R6b-p16：分离政治镜像的锁快照保留

| 项目 | 冻结内容 |
|---|---|
| 第 18 / 20 次首败 | 首个 ocean world 事务拒绝 state #1：`locked-snapshot-changed` |
| 唯一根因 | politics / pack 镜像分离时普通合并无条件补 `removed:false`；原锁快照该字段 absent |
| 产品修复 | states-provinces 同步镜像时以捕获的 locked state / province 完整快照覆盖对应槽位；未锁对象不变 |
| 非目标 | fixture、阈值、普通未锁镜像归一、其它 world stage、入口 10 后续场景、main 合并 |
| 最小验收 | 分离镜像国家+省份红门；world constraint/rebuild、政治锁、height/state、matrix、typecheck/build、同一只读复核；browser `0` |

- 2k 窄诊断已稳定复现，合并前后唯一字段差异为 `removed: absent -> false`，并得到与入口 10 相同的 `regeneration_lock_conflict / locked-snapshot-changed / state #1`。现先落双种类分离镜像红门，browser 保持 `18 / 20`、剩余 `2`，入口 10 冻结。

- p16 候选：2k 分离镜像红门修前精确复现同一 state #1 快照漂移；修后 locked state/province 以捕获快照覆盖合并槽，politics/pack owner 重新统一且双侧 JSON 不变，未锁槽原逻辑不动。constraint bundle `11 / 17 / 15`、world `10k / 50k / 100k`、society-politics、height/state、matrix `14 / 15 / 22 / 0`、12k locks、syntax/typecheck/1399-module build/diff 全部 PASS；现交同一只读复核，browser 保持 `18 / 20`、剩余 `2`，入口 10 冻结。

- p16 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：只对锁槽 clone 捕获快照，未锁 merge 不变；2k absent-removed 前提、双镜像国家/省份两侧 JSON、owner、零省会支撑与稀疏语义均确认。现使用第 `19 / 20` 次目标复验入口 10，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-p16-recheck-extra19`；启动后剩余 `1` 次。

## 350-R6b-f16：入口 10 气候组合与已确认通用契约同步

| 项目 | 冻结内容 |
|---|---|
| 第 19 / 20 次首败 | climate 选择 diplomacy 引入 states，外交锁触发正式写前拒绝 |
| 已冻结产品契约 | `state-regeneration-cannot-preserve-diplomacy`；不得为夹具放宽 |
| f16 夹具 | 成功场景选 religions+markers；同步 operation-stall 性能分类和 null-or-idle/non-pending 终态 |
| 非目标 | 产品、阈值、world/seafloor/rollback/no-op 场景、入口 11、main 合并 |
| 最小验收 | freeze 红门与三项专项 mutation；syntax/artifact/catalog/freeze/diff、同一只读复核；browser `0` |

- f16 只同步三项已确认契约；climate 的 7 类锁仍全部保持，外交/军事/zone 在成功子场景不被触碰，其真实改写锁保留继续由同入口的 world/seafloor 覆盖。现先做结构红门，browser 保持 `19 / 20`、剩余 `1`，入口 10 冻结。

- f16 候选：freeze 红门精确拒绝原 diplomacy/states 冲突组合；实施后三项专项 mutation 分别锁定 religions+markers、operation-stall 与 null-or-idle/non-pending，compound AST digest `17314e...e4250`。syntax、artifact helper 四态、artifact `208 / 340`、catalog `16 / 17 / 20 / 4`、freeze `20 / 19 / 19 + compound 3`、r4b fixture 与 diff PASS；产品/build 新增 `0`，现交同一只读复核，browser 保持 `19 / 20`、剩余 `1`。

- f16 同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`：religions+markers 只闭包 economy；七类 climate 锁快照、world/seafloor 15 类覆盖、rollback/no-op/事务、LongTask/错误/GL/Loading 硬门均保留。现使用第 `20 / 20` 次目标复验入口 10，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-f16-recheck-extra20`；启动后额度 `0`。

## 350-R6b 入口 10：第 20 次首败与强制冻结

| 项目 | 冻结结论 |
|---|---|
| 已通过子场景 | p16 ocean world、f16 climate、seafloor |
| 首败 | rollback 夹具报 `洋流世界故障注入未稳定外抛` |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-f16-recheck-extra20` |
| 只读根因 | Worker task 支持 `faultAt`，但正式 action bridge 只转发 `seed / seafloorPlan`；公开 API 只允许 `confirm / seed`，故夹具的测试故障未进入 Worker |
| 产品判断 | 没有形成“产品回滚失败”证据；p16 不返工，不为测试钩子扩张正式 API |
| 停止条件 | f16 后连续第二次夹具失败，且 `20 / 20` 浏览器额度耗尽；候选 f17、入口 10 复验和入口 11 全部冻结待用户裁定 |

## 350-R6b-f17：夹具局部 Worker 故障注入

| 项目 | 冻结内容 |
|---|---|
| 用户裁定 | 批准 f17，并新增 `2` 次浏览器额度 |
| 夹具修正 | 临时包装 `app.workerTaskCoordinator.run`，仅对一次 `ocean-current-world.compute` payload 注入 `faultAt=after:rivers` |
| 清理硬门 | `finally` 无条件恢复原 coordinator run；注入调用次数必须精确为 `1` |
| 保持契约 | runtime action 仍只接收正式参数；产品 bridge / 公开 API / Worker task、事务回滚、LongTask / error / GL / Loading 门不变 |
| 非目标 | 产品修改、阈值调整、其它 fixture、入口 11、main 合并 |
| 最小验收 | freeze 红门；syntax、artifact/catalog/freeze/diff；同一只读复核；接受后使用第 `1 / 2` 次复验入口 10 |

- f17 候选：freeze 红门精确拒绝旧 runtime action `faultAt` 路径；实施后 coordinator wrapper 只命中 `ocean-current-world.compute`，精确一次注入 `after:rivers`，action 参数恢复正式 `confirm / seed`，`finally` 无条件恢复。AST digest `fdeb5d...b1fb`；syntax、artifact helper 四态、artifact `208 / 340`、catalog `16 / 17 / 20 / 4`、freeze `20 / 19 / 19 + compound 7`、R4b fixture/helper 与 diff PASS。产品 `0`，browser `0 / 2`，现交同一只读复核。

- f17 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：原方案直接覆写 `Object.freeze` coordinator 的 run，运行时不可执行。blocker-only 修正改为替换 `app.workerTaskCoordinator` 引用为完整转发的本地 facade，原 coordinator 不改，`finally` 恢复原引用；freeze 同时禁止 `.run =`、要求 `...coordinator`、facade 安装/恢复，digest `e8e731...8744`，compound mutations `9`。全部非浏览器门复跑 PASS，现只复审该阻断。

- f17 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`：facade 通过动态 state 属性真实可达，冻结 coordinator 不变，完整转发、目标 task 注入、finally 恢复及 9 项 mutation 均成立。现使用新增额度第 `1 / 2` 次入口 10，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-f17-recheck-extra21`。

- f17 第 `1 / 2` 次复验：facade 命中精确一次但 persistent session reuse 优先读取未注入的 `runOptions.sessionPayload`，故 rollback 故障仍未触发。最窄修正同时注入顶层 payload 与 sessionPayload，freeze digest `2cd570...c8f9`、compound mutations `10`，全部窄门 PASS；第二次 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`。现使用最后第 `2 / 2` 次入口 10，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-f17-session-recheck-extra22`。

- 最后第 `2 / 2` 次入口 10：world / climate / seafloor / rollback / no-op 全功能链及预期故障、application/page error 门均越过；最终 LongTask 硬门捕获唯一 `7134ms` self task 而失败，`>200ms` 门未放宽。full/summary `973 / 886 bytes`，SHA-256 `74FF47E5...D77 / DAF2ED1A...F8A`。artifact 在 setResult 前按首败写出，未含完整 report；当前不能据此判定该长任务属于产品提交还是夹具同步快照。browser `2 / 2` 已耗尽，两个 blocker-only 复查也已用完，入口 10/11 冻结待用户裁定。

## 350-R6b-d18：入口 10 LongTask 聚焦归因

| 项目 | 冻结内容 |
|---|---|
| 用户授权 | 新增 `20` 次浏览器/必要复核权限 |
| 诊断目标 | 将唯一 `7134ms` LongTask 精确映射到产品操作或夹具同步段 |
| 允许修改 | compound fixture 的阶段时间线与硬断言前 full/compact report；对应 freeze 与权威文档 |
| 保持硬门 | `>200ms=0`、功能/事务/锁、expected fault、application/page/GL/Loading、首败非零 |
| 非目标 | 产品修复、阈值、共享 helper、其它 fixture、入口 11、main 合并 |
| 最小验收 | syntax、freeze、artifact/catalog、diff；新增第 `1 / 20` 次聚焦浏览器诊断 |

- d18 候选：AST digest `d486d3...54bb`，阶段时间线与硬断言前 full/compact report 已由 compound 12 项 mutation 冻结；syntax、freeze、artifact `208 / 340`、catalog `16 / 17 / 20 / 4`、diff PASS，产品 `0`。现使用第 `1 / 20` 次诊断，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-longtask-diagnose-extra23`。

- d18 结果：唯一 LongTask `6942ms @ 30303.5ms`；references / setMany / snapshot 仅 `1.8 / 103.4 / 68.2ms`，超预算从 full-lock ocean world rebuild 发起后开始。完整 report 证明全部功能、fault、session、GL/Loading/error 门正常。源码根因是主线程在 Worker no-op 判断前完整捕获 15 类、15,285 个锁快照。

## 350-R6b-p18：全锁 world 主线程快照 fast precheck

| 项目 | 冻结内容 |
|---|---|
| 产品目标 | 无快照、线性判断 world 是否全锁；真时跳过主线程完整 constraint bundle |
| 权威判定 | Worker 仍捕获完整 bundle 并返回 no-op；fast precheck 不能授权执行 |
| 安全关闭 | fast=true 但 Worker executed=true 时提交前拒绝；任何真实提交必须持有完整 bundle 并跑原断言 |
| 非目标 | Worker 算法、锁格式、部分锁/未锁路径、阈值、fixture 功能门、入口 11、main 合并 |
| 最小验收 | 15 类全锁/部分锁/性能红绿；world/locks；typecheck/build/diff；独立复核；browser `0` |

- p18 候选：新增无快照全锁预检，在 `15128` 个 world 锁上为 `15.8ms`，全锁返回 true、移除一个活动对象锁后返回 false，锁仓 owner 不变；正式 action 仅在 fast=true 时不捕获主线程 bundle。Worker 继续完整捕获并权威判断 no-op；fast=true / executed=true 在输出阶段拒绝，任何真实 commit 缺完整 bundle 也拒绝，部分锁与未锁路径继续执行原 bundle/身份/锁断言。constraint bundle、world constraint、foundation、society-politics、12k locks、height/state、matrix `14 / 15 / 22 / 0`、syntax、typecheck、`1399 modules` build、diff 全部 PASS；browser 保持 `1 / 20`，现交独立复核。

- p18 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：评审独立确认 fast precheck 与完整 bundle 活动 ID 语义一致、三处移锁均返回 false、lock-store owner 不变；Worker 仍完整捕获并权威 no-op，矛盾在 command 创建前拒绝，真实提交继续要求完整 bundle、identity 与锁断言。五文件 syntax、freeze `20 / 19 / 19 + compound 12`、scoped diff 均 PASS。现使用第 `2 / 20` 次复验入口 10，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\10-compound-lock-p18-recheck-extra24`。

- 第 `2 / 20` 次入口 10 正式 PASS：world `15 locks / 11 steps`、climate `7 / 2`、seafloor `14 / 12`、rollback fault `after:rivers` 且注入精确一次、full-lock no-op `15285` 锁；session idle，LongTask `8` 条、最大 `197ms`、`>200ms=0`，application/page/GL 错误均为 `0`，Loading false。p18 将原 `6942ms` 产品阻断闭合，入口 10 接受；现按固定 catalog 进入入口 11，浏览器剩余 `18` 次。

## 350-R6b-d19：入口 11 非预期导航归因

| 项目 | 冻结内容 |
|---|---|
| 第 3 / 20 次首败 | 10k 阶段后，100k newMap 成功时 `page.evaluate` execution context destroyed by navigation |
| 已知证据 | `generate.newMap 6351.9ms` operation-stall；未出现 picking 功能断言或产品 pageerror |
| 诊断修改 | 仅记录 main-frame navigation、URL、console 生命周期、当前 target/phase，并在失败前写 full/compact artifact |
| 保持硬门 | picking/activation、pointermove、LongTask、health/application/page/GL、零产品写入与 cleanup 全部不变 |
| 非目标 | 产品修复、自动吞掉导航、重试机制、性能阈值、入口 12、main 合并 |
| 最小验收 | syntax、freeze/artifact/diff；第 `4 / 20` 次唯一窄浏览器诊断 |

- 入口 11 的 12 项 catalog 前置由 `regress:task-350-r4a` 一次性覆盖并退出 `0`。失败 artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\11-city-picking-extra25`；现只补导航生命周期证据，入口 11 完整复验与入口 12 冻结。

- d19 第 `4 / 20` 次未复现导航且完整门退出 `0`：10k/100k 的固定半径、最近/平局/重叠拾取、两档各 `60` pointermove、取消恢复全通过；LongTask `0`、handler P95/max 约 `0.1ms`、health/page/GL `0`。artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\11-city-picking-d19-diagnose-extra26`。本地 Vite 8.1.0 明确在 `server.hmr === false` 时关闭更新通道，deps cache 在测试启动时重优化；产品源码无 reload。故首败归类为夹具开发服务器 HMR 导航竞态，产品返工 `0`。

## 350-R6b-f19：入口 11 固定关闭 Vite HMR

| 项目 | 冻结内容 |
|---|---|
| 夹具修正 | city-picking 的 Vite server 设 `hmr:false`，避免依赖优化触发测试中途 reload |
| 证据 | main-frame navigation 继续记录，成功/失败 artifact 均持久化 |
| 保持硬门 | 10k/100k picking/activation、60 次 pointermove、LongTask、handler、health/application/page/GL 与 cleanup |
| 非目标 | 产品源码、自动重试、吞掉导航、其它 fixture、入口 12、阈值、main 合并 |
| 最小验收 | syntax、freeze mutation、artifact/diff、独立复核；随后唯一目标复验入口 11 |

- f19 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：只对该 Vite server 设置 `hmr:false`，没有产品或重试逻辑；成功/失败 artifact 均保留 navigationEvents，失败严格按 `setResult → fail → thrownError` 非零外抛。原 10k/100k picking、60 pointermove、LongTask/handler/error/GL/cleanup 硬门未移动；freeze `20 / 19 / 19 + city 3`、artifact `9 / 208 / 340`、syntax/helper/diff 均 PASS。现使用第 `5 / 20` 次唯一目标复验，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\11-city-picking-f19-recheck-extra27`。

- 第 `5 / 20` 次入口 11 正式 PASS：10k/100k 的 `18px` 半径、四档 scale、最近/平局/重叠拾取、各 `60` 次 pointermove 与取消恢复全部成立；LongTask `0`，handler P95 `0ms`、max `0.1ms`，health/application/page/GL `0`。导航记录仅 startup 四事件，100k newMap 期间 `0`；入口 11 接受。固定入口 1～11 PASS，现进入入口 12，浏览器剩余 `15` 次。

## 350-R6b-f20：入口 12 自托管 production server

| 项目 | 冻结内容 |
|---|---|
| 第 6 / 20 次首败 | 页面前 `ERR_CONNECTION_REFUSED http://127.0.0.1:5411` |
| 唯一根因 | fixture/package 均未启动 server，却无条件访问默认 5411 |
| 夹具修正 | 用 production dist 启动本地静态 server，listen 成功后开页面；server 纳入 finally |
| 保持硬门 | overlay/pan、political/measurement、presentation-zero、性能、health/application/page/GL、artifact/cleanup |
| 非目标 | 产品源码、外部常驻服务器、自动重试、其它 fixture、入口 13、阈值、main 合并 |
| 最小验收 | server owner 红绿、syntax、freeze/artifact/diff、独立复核；随后唯一目标复验入口 12 |

- 失败 artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\12-overlay-pan-extra28`，未进入任何产品断言。现只补自托管 server，browser 保持 `6 / 20`。

- f20 首轮独立复核 `BLOCK / P0 0 / P1 1 / browser 0`：裸 `requested.startsWith(distDir)` 可被编码后的同前缀 sibling 路径绕过。blocker-only 修正改为 `requested === distDir || startsWith(distDir + sep)` 的真实目录边界，并新增 traversal mutation；其它 server owner 与 overlay 硬门不动。

- f20 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`：encoded same-prefix sibling 已由目录边界拒绝；server listen/close owner、artifact 与原 23 条 overlay 硬门不动，另增 dist 存在硬门。freeze `20 / 19 / 19 + overlay 3`、artifact `9 / 209 / 342`、syntax/diff PASS。现使用第 `7 / 20` 次唯一目标复验，artifact：`Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\12-overlay-pan-f20-recheck-extra29`。

## 350-R6b-d21：入口 12 离场样本归因

- 第 `7 / 20` 次已证明 f20 server 闭合，随后在 `resource` 离场种类断言首败；失败 artifact 没有保存已计算的 before/firstCommit/exiting 数据。d21 只把现成的 entering/exiting kinds、逐对象坐标误差、preview/overlay 性能与 error 状态在硬断言前 setResult，原 24 条断言、首败与非零退出不动；第 `8 / 20` 次只用于判断固定图样本缺失还是产品坐标错误。

- d21 第 `8 / 20` 次证据：政治移入 `12`；离场总数 `51`，其中 state/province/city/marker/military=`1/36/6/1/7`，resource=`0`。全部已离场对象横纵误差 `<=0.1px`，产品坐标更新成立，resource 仅是固定图边缘无样本。preview P95 `55.4ms`、overlay `25.9ms`，8ms 门保持待 f21 后验证；启动 operation-stall 单列为 setup performance signal。

## 350-R6b-f21：入口 12 确定性四类离场样本

| 项目 | 冻结内容 |
|---|---|
| 夹具修正 | 在现有 renderer overlay item 上将 city/resource/marker/military 各一项布置到确定离场边缘，不重建产品数据 |
| setup 信号 | 页面初始 generation operation-stall 单列记录，不混入 pan 的 application error |
| 证据 | 硬断言前保存 entering/exiting、逐项坐标误差、raw preview events 与性能 |
| 保持硬门 | 四类必须离场；政治候选/坐标/opacity；preview P95 `<=8ms`、overlay `<=35ms`；model upload/error/GL/presentation-zero |
| 非目标 | 产品性能优化、阈值、renderer 逻辑、其它 fixture、入口 13、main 合并 |
| 最小验收 | 四类样本结构红绿、setup 分类、syntax/freeze/artifact/diff、独立复核；随后唯一目标复验 |

- f21 候选静态证据：fixture freeze `20 entries / 19 fixtures / 19 general mutations / overlay 8`，artifact contract `9 fixtures / 210 hard assertions / 343 mutations`，browser artifact helper、三脚本 syntax 与 scoped diff-check 全部 PASS。forced key 离场、`updateLabels`、setup performance 分类和 raw preview evidence 已进入冻结与 artifact contract；产品文件 `0`，browser 保持 `8 / 20`，现交同一只读复核。

- f21 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：四类样本只改既有 renderer item 的 `x/y`；forced exiting、raw preview、setup signal、pan 期错误、`8ms/35ms`、model upload、政治移入及 server containment 均保持硬门。现使用第 `9 / 20` 次唯一目标复验，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\12-overlay-pan-f21-recheck-extra31`。

## 350-R6b-f22：入口 12 预热边界样本修正

- 第 `9 / 20` 次 artifact 显示 forced city/resource/marker/military 四键均未 exiting；原因是 f21 将样本置于 viewport 内沿，而正式 overlay 的 label/icon prewarm 为 `clamp(0.5 viewport, 192, 720)`，本窗口为 `720px`，280px 平移后仍处于 buffered。产品坐标误差仍 `<=0.1px`；preview P95 `74.7ms`、overlay `26.2ms` 已原样落盘，性能门不放宽。
- f22 只把同一既有 item 放到对应 prewarm 外沿内侧 `64px`，仍由正式 `updateLabels` 建立 buffered 状态；新增 pan 前 forced key 必须 rendered、pan 后必须 exiting 双门。产品 map/renderer 文件 `0`，平移 `280px`、四类/政治/性能/error/GL/presentation-zero 与 server containment 全部不动。先跑静态冻结与同一只读复核，接受前 browser 保持 `9 / 20`。
- f22 候选静态证据：freeze `20 entries / 19 fixtures / 19 general mutations / overlay 10`，artifact contract `9 fixtures / 211 hard assertions / 344 mutations`，browser artifact helper、三脚本 syntax 与 scoped diff-check 全部 PASS。产品文件 `0`，现交同一只读复核。
- f22 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：双向 prewarm 外沿、screenToWorld、pan 前 prepared、pan 后 forced exiting 均成立；原政治/性能/error/GL/presentation 与 server containment 均未放宽。现使用第 `10 / 20` 次唯一目标复验，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\12-overlay-pan-f22-recheck-extra32`。

## 350-R6b-p23：viewport preview 避免逐帧同步 GL 回读

- f22 后第 `10 / 20` 次已越过 forced prepared 与四类离场，产品功能证据成立；首败为 preview P95 `43.4ms > 8ms`，8 帧 `0.7/43.4/23.3/22.4/23.1/23.2/22.9/22ms`，overlay commit `45.3ms`。`drawMs` 在 `gl.getError()` 前采样，而 viewportPreview event 包含该同步调用，首帧快、后续稳定阻塞符合 GPU pipeline 回读。
- p23 只令 `viewportPreview` draw 复用上一笔已检查 `glError` 并显式标记 `glErrorChecked=false`；普通/提交 draw 继续调用 `gl.getError()` 并标记 true，所以 preview 期间错误仍会在最终提交被读取。产品边界仅 `placeholder-renderer.js`，测试边界为现有 viewport-line-preview Node 契约；不改 draw layers、commit、overlay、阈值、夹具或其它入口。先红后绿、相关 Node/typecheck/build/独立复核，接受前 browser `10 / 20`。
- p23 红门精确失败后转绿；viewport-line-preview、render-cache binding `17/27/11`、render preparation、prepared installer `21 cases`、presentation、syntax/diff、typecheck 与 `1399 modules` build 全 PASS。现交同一只读复核，browser 保持 `10 / 20`。
- p23 首轮独立复核 `BLOCK / P0 0 / P1 1 / browser 0`：产品实现正确，阻断仅为 Node 门未锁定 flush draw 与 `viewportPreview:true` 的同一调用关系。blocker-only 提取 flush 方法、冻结唯一直接 draw 的四参数组合，并新增 true→false mutation；产品与 browser 均不动。
- p23 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`：原假绿反例已由 flush 方法内唯一 draw 四参数绑定和 true→false mutation 拒绝闭合。现使用第 `11 / 20` 次唯一目标复验，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\12-overlay-pan-p23-recheck-extra33`。

## 350-R6b-p24：preview 热路复用缓存 canvas 尺寸

- 第 `11 / 20` 次 preview P95 为 `32.4ms`，raw 为 `0.3/24/25.5/23.4/26.4/32.4/25.9/21.7ms`；overlay `22.7ms`，其它门已越过。preview 每帧改 stage CSS variables 后，city icon draw 与 draw 尾部 line projection 读取 live `clientWidth/clientHeight`，会同步结算 overlay 样式布局。
- p24 只让两处 draw 热路消费 resize observer 已维护的 `renderer.canvasSize`（css/backing/pixelRatio）；无缓存的独立调用仍保留 canvas fallback。city icon 与 line projection 各新增 live getter 抛错反例，placeholder 必须显式传缓存。产品边界为三个 renderer 文件，测试边界为既有 city-icon/line-width/viewport Node 门；其它 draw/preview/GL/阈值不动，browser `11 / 20`。
- p24 红门先分别以 live canvas backing/client getter 被读取而失败，产品改动后转绿；city icon 的旧手工 renderer 夹具补齐当前正式 context、surface/cache/overlay owner binding，使单次 instanced draw 断言确实越过第 350 项资源硬门。city-icon、line-width、viewport、render-cache `17/27/11`、render preparation、prepared installer `21 cases`、presentation、syntax/diff、typecheck 与 `1399 modules` build 全 PASS。产品/测试边界未扩张，现交同一只读复核，browser 仍为 `11 / 20`。
- p24 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`。第 `12 / 20` 次实测 preview P95 已为 `0.4ms`，证明 live-layout 热路消除有效；入口 12 首败推进为 overlay commit `40.2ms > 35ms`，forced 四类、政治标签坐标、model upload 与 error/GL 仍成立。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\12-overlay-pan-p24-recheck-extra34`。

## 350-R6b-p25：政治标签提交复用布局快照

- overlay commit 对 pure pan/zoom 已要求保留政治候选，但当前仍为每个已 rendered 政治标签重新生成同一候选 glyph layout、扫描 obstacle/peer 碰撞，随后 `retainPoliticalPlacementOffset` 又以旧 snapshot 覆盖 anchor/glyph/box/collision；这是可删除的重复计算。p25 仅对 `preservePoliticalCandidate && (visible || buffered)` 且快照完整的标签直接重建平移后的 placement；缺快照、新进入、普通布局更新继续走正式 resolver。先冻结快照平移等价、fallback 与 updateLabels 调用顺序红门；其它 overlay 语义、候选、样式、阈值、夹具不动，browser 保持 `12 / 20`。
- p25 红门先精确失败，现由 `restorePoliticalLabelPlacementSnapshot` 从旧 offset/snapshot 重建新 anchor/box 并保留 candidate、glyph、root size、collision 标记，peer collision 按原交互滞回语义清零；缺快照返回 null。专项冻结了纯函数值与引用、fallback 及 `updateLabels` 快照优先于 resolver 的调用顺序。九项标签/renderer Node 门、render preparation、prepared installer、syntax/diff、typecheck 与 `1399 modules` build 全 PASS；现交同一只读复核，browser 仍为 `12 / 20`。
- p25 首轮独立复核 `BLOCK / P0 0 / P1 1 / browser 0`：仅检查 snapshot/boxOffset 对象存在不足以保证 downstream 所需字段完整。blocker-only 增加 candidate/bend、rootSize、glyphs、四项 boxOffset、两项 collision 标记的严格完整性门，任一缺失即 null fallback；七类部分快照反例及所有 downstream 字段/引用断言已 PASS，产品快路条件、resolver 与 browser 均未改动。
- p25 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`，原 P1 已闭合。现使用第 `13 / 20` 次唯一目标复验入口 12，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\12-overlay-pan-p25-recheck-extra35`。
- 第 `13 / 20` 次入口 12 完整 PASS：preview P95 `0.3ms`、overlay commit `25.9ms`，forced 四类、政治标签候选/坐标、model upload 与全部 error/GL 门通过。p25 有效且入口 12 接受；按固定顺序进入口 13，browser 剩余 `7` 次。
- 入口 13 的 presentation、worker-task、render-cache、viewport preview、line-width 五项 Node 前置全 PASS；使用第 `14 / 20` 次运行入口 13，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\13-viewport-line-preview-extra36`。

## 350-R6b-f23：入口 13 setup performance 分区与首败 artifact

- 第 `14 / 20` 次 viewport 入口完整执行手势后，最终 console 门仅见测试交互前的 setup `operation-stall`；原脚本又在全部断言之后才写 artifact，导致 result=null。f23 只在初始 routes/rivers idle 边界把四类 setup health 信号留证并从 active errors 分离，交互后的同类信号仍硬失败；并把 full/compact report 提前到功能/error 断言前。产品、动作、阈值与页面状态不改，browser 保持 `14 / 20`。
- f23 fixture digest `7f3b2c54...b0ecb2`，artifact compact digest `13631fbe...f9c8de`；freeze `20/19/19 + viewport 2`、artifact `9/211/344`、helper、catalog、syntax/diff 全 PASS，产品 `0`。现交同一只读复核，browser 仍为 `14 / 20`。
- f23 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：初始 canvas/route/river 首败仍可能在 setResult 前发生。blocker-only 现于 owner try 的任何硬断言前先保存 full/compact skeleton，后续原引用补齐；freeze 把顺序门前推到 dist build 首门。fixture digest `ded695d4...a9742`、compact digest `3574def2...2a59`，freeze/artifact/syntax/diff PASS，产品与 browser 不动。
- f23 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`；现使用第 `15 / 20` 次只复验入口 13，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\13-viewport-line-preview-f23-recheck-extra37`。
- 第 `15 / 20` 次入口 13 完整 PASS：zoom/pan 样本、线路变换、idle 收敛全部成立，draw P95 `0.2/0.1ms`，GL/active console/page error `0`；入口 13 接受，进入口 14，browser 剩余 `5` 次。
- 入口 14 的 r4b fixture contract、artifact helper、heightmap export、png options 与 presentation 五项前置全部 PASS；第 `16 / 20` 次将运行 `regress:heightmap-export-browser`，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\14-heightmap-export-extra38`，启动后剩余 `4` 次。

## 350-R6b-p26：高度图 PNG 导出主线程切片

- 第 `16 / 20` 次已通过 10k 高度图的尺寸、灰度采样、UI 2x 下载、状态不变及全部 error/GL 门；唯一硬失败为 `261ms` LongTask，另有一条 `122ms`，分别落在同一观察窗的 UI 2x 与 API 1x 导出。产品同步 `createHeightmapCanvas` 在单任务内完成全部 Voronoi 路径与 fill/stroke，是当前直接热点；不是 setup 信号或夹具样本错误。
- p26 文件边界冻结为 `map-file-io.js` 与既有 `webgl-generator-heightmap-export-regression.mjs`：公开同步 canvas helper 保留；blob/download 正式路径使用同画布、同灰阶桶、同 cell path/描边语义的有限批次异步绘制，并在批次间让出浏览器任务。先红后绿、heightmap/png/export/presentation、typecheck/build、syntax/diff 与同一只读复核；browser 保持 `16 / 20`，阈值不放宽。
- 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：仅有 `yieldCount >= 2` 不能拒绝 512-cell batch。blocker-only 补 fake canvas 的 fill batch 与 yield coverage 记录，600-cell fixture 精确锁定 `[256,256,88]` 与 `[256,512,600]`；产品实现不动。
- blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`，512-cell 假绿已闭合；全部静态门与 `1399 modules` build PASS。第 `17 / 20` 次只复验入口 14，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\14-heightmap-export-p26-recheck-extra39`。

## 350-R6b-p27：高度图 2x 异步离屏编码

- 第 `17 / 20` 次由原 `122/261ms` 收敛到 `88/258ms`，证明 p26 消除了 1x 同步绘制长任务；剩余 `258ms` 是 UI 2x DOM canvas `toBlob` 编码/读回峰值。p27 仅让高度图正式 blob/download 路径优先使用浏览器原生 `OffscreenCanvas + convertToBlob`，保留 256-cell 分批以及无 Offscreen 支持时的 DOM/toBlob fallback；同步 `createHeightmapCanvas` 与普通地图 PNG 不动。先红绿和独立复核，browser 保持 `17 / 20`。
- 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：构造器存在但 `convertToBlob` 缺失时没有 DOM fallback。blocker-only 加实例能力探测及该半支持反例；完整 Offscreen、无构造器 fallback、同步 helper 与批次边界不动。
- blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`；实例能力门和半支持 fallback 反例已闭合。第 `18 / 20` 次只复验入口 14，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\14-heightmap-export-p27-recheck-extra40`。
- 第 `18 / 20` 次仍出现 `147/293ms` LongTask，说明主线程 OffscreenCanvas 的 `convertToBlob` 未搬走 PNG 编码；其余门继续全过。按重复阻断规则冻结，剩余 `2` 次 browser 不再消耗。需用户裁定是否进入专用 Worker 绘制+编码方案（推荐），或豁免 `200ms` 门；p27 尚未完成浏览器接受。

## 350-R6b-p28：专用 Worker 高度图绘制与编码

- 用户批准推荐方案并追加 `10` 次，当前 browser 可用 `12` 次。p28 让正式 heightmap blob/download 路径创建一次性专用 Worker，把 OffscreenCanvas 绘制与 convertToBlob 一并移出主线程；主线程只传最小 grid 几何/高度并接收 Blob。成功、Worker error、协议 error 与 postMessage 抛错均须 terminate；无 Worker/Offscreen 能力保留 p26/p27 fallback。公开同步 helper、普通 PNG、像素/灰度/API/UI 及 `200ms` 门不动。
- p28 红门精确失败后转绿；真实 worker task、entry dispatch、成功/不支持/编码错误/postMessage 抛错的终止与 fallback 均冻结。最小请求 structuredClone 为 10k `9.8ms`、100k `146.8ms`。导出相关 Node、typecheck、`1400 modules` build、syntax/diff PASS，并产出独立 worker chunk；现交同一只读复核，browser `0`、可用 `12` 次。
- 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：仅凭 `blob.size` 可接受伪 Blob。blocker-only 补 type/arrayBuffer/slice 能力门和伪 Blob 拒绝+terminate 反例；其它 Worker 路径不动。
- blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`；伪 Blob 已在 Worker 协议边界拒绝。累计第 `19 / 30` 次只复验入口 14，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\14-heightmap-export-p28-worker-recheck-extra41`。
- 累计第 `19 / 30` 次入口 14 完整 PASS：API/UI 尺寸、灰度、下载、stateExact 均成立，LongTask `0`、application/page/health/GL `0`。p28 浏览器接受，进入口 15，剩余 `11` 次。
- 入口 15 render-cache 前置 `17/27/11` PASS；累计第 `20 / 30` 次运行 `png-crop-browser`，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\15-png-crop-extra42`，启动后剩余 `10` 次。
- 累计第 `20 / 30` 次入口 15 完整 PASS：六种裁剪、overlay 差异、非法输入、stateExact 成立，LongTask max `124ms`、错误门 `0`。入口 16 三项前置 PASS；累计第 `21 / 30` 次运行 storage compatibility，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\16-storage-compatibility-extra43`，启动后剩余 `9` 次。

## 350-R6b-d30：入口 16 启动基线与准备阶段诊断

- 第 `21 / 30` 次功能门已执行，性能首败为 preparation `419/222ms`、legacy restore `278ms`、corrupt restore `276ms`；后两次均在 reload 后约 130ms 出现近似峰值，原失败 artifact result=null。d30 不改产品或固定夹具，只对同一 dist 收集空存储冷启动/reload LongTask，并分阶段计时 legacy preparation；累计第 `22 / 30` 次唯一诊断，入口 16/17 冻结，启动后剩余 `8` 次。
- 第 `22 / 30` 次临时诊断因错误 readiness 字段在测量前超时，结论为 0；d30a 改用正式 `waitForApiReady` 后以第 `23 / 30` 次重跑，剩余 `7` 次。

- 第 `23 / 30` 次 d30a 有效：cold start `761/55ms`，clean reload `257ms @ 116.3ms`；legacy/corrupt reload `278/276ms @ 约 125～135ms` 与 clean reload 同形。preparation 的 generation/export/transform/gzip/base64+storage 分别为 `5188.3/242.5/103.2/303.3/72.8ms`，其 `406/233ms` 为夹具准备开销。

## 350-R6b-f31：入口 16 setup / shared-startup 性能分区与失败证据

| 项目 | 冻结内容 |
|---|---|
| 根因 | 固定夹具把自身造数/导出/压缩和共同 bundle 启动计入存储产品窗口，且在最终断言后才 setResult，导致功能已执行但失败 artifact 为 null |
| f31 夹具 | 同浏览器采 cold/setup 与 clean reload baseline；preparation 只作 raw setup 证据；legacy/corrupt reload 分别与 clean baseline 一对一匹配，startTime 与 duration 容差均固定 `50ms`，匹配项只列 shared startup，未匹配项进入活动 LongTask |
| 硬门 | 活动 LongTask 唯一按 `summarizeTask350LongTasks(longTasks, 200)` 汇总，`overBudget` 必须为 `[]`；不得提高阈值或加入白名单；原始四组 LongTask 全部写入 full/compact artifact |
| 失败证据 | finalReport / compactReport 在首个硬断言前登记，后续只渐进填充，任何功能或性能首败均能持久化当前完整证据 |
| 非目标 | 产品 runtime / storage / import、阈值、27 个既有功能断言、其它 fixture、入口 17、提交/推送/合并 |
| 最小验收 | 新 structural/mutation 红门先失败后转绿；syntax、fixture freeze、artifact contract、catalog/diff 与同一只读复核 PASS；browser `0`，复核后第 `24 / 30` 次只复验入口 16 |

- f31 静态门全 PASS：artifact contract `211 assertions / 348 mutations / 5 partition cases`，fixture freeze 新增 `4` 个 storage partition mutation，catalog/syntax/diff 通过。独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`，确认未匹配任务仍进入 200ms 零白名单硬门。累计第 `24 / 30` 次只复验入口 16，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\16-storage-compatibility-f31-recheck-extra46`；启动后剩余 `6` 次。

- 累计第 `24 / 30` 次入口 16 PASS：全部 27 个功能/错误/截图硬门成立，full/compact artifact 可读且 teardown `0`。clean baseline `266/50ms`，legacy `261/53ms`、corrupt `296/51ms` 均在冻结容差内一对一匹配；活动 LongTask `0`。入口 16/f31 接受，进入口 17 Node 前置，剩余 `6` 次。

- 入口 17 api-data compatibility、cloud-storage、persistence-boundary 前置 PASS；累计第 `25 / 30` 次运行冻结 browser-storage-fallback，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\17-storage-fallback-extra47`，启动后剩余 `5` 次。

## 350-R6b-f32：入口 17 第 333 项 direct-binary 契约同步

| 项目 | 冻结内容 |
|---|---|
| 首败 | 10k record.raw 实际 object，夹具旧断言要求 string；失败 artifact 因 setResult 太晚为 null |
| 根因 | 第 333 项已将 direct-binary 下限从 4MiB 改为 1 byte，脚本前置也已统一断言 binary-write/no fallback/base64=0，但第 331 项的 10k string envelope 与 fallback-read 分支遗漏同步 |
| f32 功能门 | 10k/100k 均验证 raw object、binary type、record bytes/dataBytes 与 save bytes 一致；restore 必须 binary-read 且不得 fallback-read；normal context 保持同契约 |
| f32 性能门 | 主/normal context 的启动与 newMap 全量保存到 setupLongTasks；各自在生成完成后 reset，只有 save/restore 进入 longTasks，仍唯一按 200ms 零白名单拒绝 |
| 失败证据 | finalReport/compactReport 首断言前登记并渐进填充；raw setup、活动 LongTask、record、save/restore 当前值均保留 |
| 非目标 | 产品 app/browser-map-storage、direct-binary 下限、200ms 阈值、其它 fixture、入口 18、提交/推送/合并 |
| 最小验收 | structural/mutation 红门；syntax、fixture freeze、artifact contract、catalog/diff、同一只读复核 PASS；browser 0，复核后第 26/30 次只复验入口 17 |

- f32 首轮复核 `BLOCK / P0 0 / P1 1 / browser 0`：normal context 缺 record object/type/bytes/dataBytes 与 binary-read/no-fallback-read。blocker-only 以共用 reader 补齐 6 条硬断言，normal record/read 两条 mutation 纳入 freeze；现 freeze `7` 个 f32 专项反例、artifact `217 assertions / 361 mutations / 5 partition cases`、catalog/syntax/diff PASS，交同一复审，browser 保持 `25 / 30`。

- f32 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`；累计第 `26 / 30` 次只复验入口 17，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\17-storage-fallback-f32-recheck-extra48`，启动后剩余 `4` 次。

- 累计第 `26 / 30` 次入口 17 PASS：quota/normal 两 context 的 binary record/read/no-fallback 契约全成立，活动 LongTask `0`，setup raw `4`，错误/teardown `0`。入口 17/f32 接受，进入口 18 Node 前置，剩余 `4` 次。

- 入口 18 map-save-naming、api-operation、map-storage-user-copy 前置 PASS；累计第 `27 / 30` 次运行冻结 browser-save-feedback，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\18-save-feedback-extra49`，启动后剩余 `3` 次。

- 累计第 `27 / 30` 次入口 18 PASS：成功/失败 toast、console/page、LongTask `0`、teardown `0`；setup stall 在 reset 前。入口 18 接受，进入口 19 Node 前置，剩余 `3` 次。

- 入口 19 五项 Node 前置 PASS；累计第 `28 / 30` 次运行冻结 loading-single-source，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-extra50`，启动后剩余 `2` 次。

## 350-R6b-f33：入口 19 Worker 文件读取探针同步

| 项目 | 冻结内容 |
|---|---|
| 首败 | 8 类 Loading 通用门已执行，importMap 成功；fileReadLoading 为 undefined |
| 根因 | 旧夹具拦 File.text；第 322 项后 Blob/File 导入实际由 map-file-io-worker-client 调 arrayBuffer 后送 Worker |
| f33 | 保留原 arrayBuffer，真实调用时采 generation/operation Loading，延迟 100ms 后返回原 bytes；不得退回 text 探针 |
| 失败证据 | report/full/compact 在首个硬断言前登记，后续补 longTasks/performance/expectedFailureHealth |
| 非目标 | 产品 Loading、导入 Worker、阈值、其它 fixture、入口 20、提交/推送/合并 |
| 最小验收 | arrayBuffer/early-artifact structural+mutation、syntax/freeze/artifact/catalog/diff、同一只读复核 PASS；browser 0，复核后第29次只复验入口19；用户追加10次后累计上限40 |

- f33 静态门与同一只读复核已 `ACCEPT / P0 0 / P1 0 / browser 0`；用户追加 `10` 次后累计上限为 `40`。累计第 `29 / 40` 次复验中 arrayBuffer Loading 探针成立，但旧 rollback 故障注入未触发。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-f33-recheck-extra51`，其中 `fileReadLoading = generation true / operation false`、`importRollbackFailure.error = null`、`importRollbackProbe = []`、teardown `0`。
- 第二首败仍是纯夹具漂移：正式 Worker 导入返回 preparedRender，`loadMapIntoRuntime` 优先调用 `completePreparedMapLoadAsync`；夹具只覆写 `loadMapAsync`，因此既未注入失败也未进入 snapshot rollback。产品导入本身成功，无需返工产品。入口 19 夹具连续两次失败触发冻结后，用户已明确批准纯夹具 f34：只在 `completePreparedMapLoadAsync` 原调用完成后首次注入失败，用 `loadMapAsync` 观测正式 snapshot rollback，并在 finally 恢复两方法；Loading/200ms/产品不动。syntax、freeze（loading 专项 7 mutations）、artifact contract（219 hard assertions / 370 mutations / 5 partitions）、catalog、diff 全部 PASS。首次独立复核确认夹具实现成立，仅因权威状态未同步而 `BLOCK / P0 0 / P1 1 / browser 0`；现只同步文档并交同一 blocker-only 复审。入口 20 与剩余 `11 / 40` 次 browser 在复审接受前冻结。
- f34 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / browser 0`。累计第 `30 / 40` 次入口 19 复验命中 prepared-install post-complete 故障后得到 `operation_rollback_failed`，artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-f34-recheck-extra52`；probe 只有 prepared-install 一条，未进入 patched `loadMapAsync`，teardown `0`。该位置代表 renderer 完成而 operation 尚未提交的真实可失败边界，现不能继续假定为夹具；公开 report 又未保留 nested rollback cause。按连续夹具/阻断规则再次冻结，入口 20 与剩余 `10 / 40` 次 browser 均不启动。候选 d34a 只补 error cause/stage/code 递归序列化并运行一次入口 19 窄诊断，取得 restore helper 首因后再裁定产品红门/窄修或夹具收窄。

## 350-R6b-s35：入口 19 稳定语义故障钩子

| 项目 | 冻结内容 |
|---|---|
| 用户裁定 | 不接受继续覆写 renderer 私有方法；要求把夹具稳定到正式测试水平 |
| 产品内钩子 | 仅 `?debug=1` 可用；map-replace 统一语义阶段 `after-renderer-load`，once/hits 与 error code/stage/details 固定 |
| 调用位置 | prepared / legacy renderer 分支汇合后、panel refresh 前唯一调用，不绑定具体 renderer 方法 |
| fixture | 只设置/删除 `window.__webglGeneratorMapReplaceFault`；不再写 renderer 方法；递归保存有限深度 error cause |
| 红门 | 非 debug、错 stage、once 第二次、错误结构；fixture monkey-patch、cleanup、stage、nested cause mutation |
| 非目标 | 公开 API、普通 UI、Loading 文案、renderer 实现、200ms 阈值、入口 20、Git 交付 |
| 最小验收 | Node 动态钩子门、api-operation、syntax、freeze/artifact/catalog/diff、同一独立复核；browser 0，接受后第31/40次只运行入口19 |

- s35 静态门、1401-module build 与独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`。累计第 `31 / 40` 次稳定诊断 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-s35-extra53`。nested cause 为 `render-edited-resource-preflight-mismatch`，三项 mismatch 是 previous owner map identity、tradeFlowPickItems reference、selectionDrawRanges reference；稳定 hook 已完成定位职责，不再是夹具路由漂移。

## 350-R6b-p36：地图替换回滚 presentation 顺序

| 项目 | 冻结内容 |
|---|---|
| 产品首因 | prepared completion 更新 tradeFlow/selection 等 presentation 引用；snapshot rollback 在旧地图 reload 前应用 units/theme，edited-resource preflight 因混装拒绝 |
| 红门 | restoreMapReplaceSnapshot 中 `loadMapAsync(snapshot.map)` 必须早于 renderer units 与 runtime visual theme；现状先失败 |
| 产品窄修 | canonical map/revision/history 仍先恢复；旧地图 renderer reload 成功后才恢复 units/theme |
| 非目标 | debug hook、fixture 语义、prepared installer、preflight 严格度、公开 API/UI、200ms、入口 20、Git 交付 |
| 验收 | api-operation 红转绿、worker-task 全域、typecheck、freeze/artifact/catalog/diff、同一独立复核；browser 0，接受后第32/40次只复验入口19 |

- p36 红门已确认旧顺序失败；顺序窄修后 api-operation、worker-task、typecheck、freeze（19 fixtures）、artifact（217/368/5）和 diff PASS。现待同一独立复核；入口 19/20 与剩余 `9 / 40` 次 browser 冻结。

- p36 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`、1401-module build PASS。累计第 `32 / 40` 次目标复验 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-p36-recheck-extra54`；稳定 hook 再次准确命中，nested cause 收敛为 `render-edited-resource-preflight-mismatch: previous:owner-map-identity`，另有 overlay-label owner mismatch。原因是旧地图 reload 后强制主题 refresh 会再次进入 edited-resource 重建，而残余 previous owner 尚不满足其 preflight。该同一产品阻断再次出现，按规则冻结。

## 350-R6b-p37 候选：prepared presentation 后唯一回滚 reload

| 项目 | 待用户裁定的边界 |
|---|---|
| 产品修正 | reload 前用无资源重建的 `setPreparedPresentation({visualTheme, unitPreferences})` 恢复值；唯一旧地图 reload 负责重建并统一 owners |
| UI 同步 | control preferences、用户主题 registry、主题事件/控件和最终 panels/selection 保留 |
| 禁止 | 放宽 preflight、再改 fixture、第二次 renderer reload、直接改 owner、吞掉 rollback error |
| 验收 | 红门拒绝 post-reload `setVisualTheme(force)`；api-operation/worker-task/renderer owner 门/typecheck/build/独立复核；接受后第33/40次只复验入口19 |
| 当前 | 已实施并经 blocker-only 复审接受；入口19真实浏览器仍在收尾，入口20冻结 |

- 用户已批准 p37。红门先失败后通过；产品仅在 mapChanged + snapshot map + renderer 支持 prepared presentation 时，于唯一 rollback reload 前无重建恢复 theme/units；未换图或旧 renderer 保留原刷新兼容路径。canonical-first、UI/registry、selection/tool/panels、strict preflight 均不动。api-operation、worker-task、render-cache owner、prepared installer、visual themes、typecheck、freeze/artifact/diff PASS。首轮复核唯一 P1 是首次导入前 `snapshot.map=null` 未命中两分支；fallback 补为 prepared 条件完整否定并同步静态反例后，复审 `ACCEPT / P0 0 / P1 0 / browser 0`，1401-module build PASS。

## 350-R6b-f38：入口 19 operation error wrapper 契约同步

| 项目 | 冻结内容 |
|---|---|
| 第 33 / 40 次证据 | hook hits 1；canonical/renderer map 均恢复；8 类 Loading、200ms、console/page/teardown 全过；owner/preflight 与 rollback-failed 错误为 0 |
| 唯一首败 | 夹具要求外层 `map_replace_debug_fault`；实际为既有契约 `operation_failed`，nested cause 保留 `map_replace_debug_fault@after-renderer-load` |
| f38 | 夹具同时硬证外层统一 operation error 与 nested 稳定 code/stage；同步 freeze/artifact 结构门与摘要，不改产品 |
| artifact | `Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-p37-recheck-extra55` |
| 静态验收 | syntax、freeze `19 fixtures / loading 7 mutations`、artifact `219 assertions / 370 mutations / 5 partitions`、catalog、scoped diff 全 PASS |
| 当前 | 待同一独立复核；接受后第34/40次只复验入口19；入口20冻结，剩余7次 |

- f38 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`。累计第 `34 / 40` 次 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-f38-recheck-extra56`；wrapper、rollback identity、8 类 Loading、200ms、console/page/teardown 均已通过，新首败为旧 river lock conflict fixture 返回成功。

## 350-R6b-f39 候选：直接河流篡改后的 Worker mirror 同步

| 项目 | 冻结内容 |
|---|---|
| 根因 | 正式 API 先写 lock 并同步 Worker；夹具随后只改主线程 `river.cells[1]`，持久 Worker 仍持有篡改前合法河流 |
| 旁证 | 河流锁 Node 专项 PASS；既有 city-route 冲突浏览器夹具在 direct map mutation 后显式 `invalidateSession` |
| 候选夹具修正 | 仅在 `river.cells[1] = invalid` 后调用 `app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation")` |
| 防漂移 | freeze/artifact 要求该 invalidate 位于 direct mutation 后、正式 regenerate 前，并增加删除/错序 mutation |
| 非目标 | 产品锁语义、Worker 实现、Loading、200ms、其它 fixture、入口20、Git 交付 |
| 当前 | 用户已批准并实施；静态门全 PASS，待同一独立复核；browser 已用34/40、剩余6次 |

- f39 仅新增 direct river mutation 后、正式 regenerate 前的 Worker session invalidation；freeze/artifact 新增删除与错序两条反例。syntax、freeze（19 fixtures/loading 9 mutations）、artifact（219/372/5）、catalog、河流锁 generator 专项与 scoped diff-check 全 PASS；产品文件 `0`，browser `0`，现交同一只读复核。

- f39 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`。累计第 `35 / 40` 次 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-f39-recheck-extra57`；锁冲突、rollback、error wrapper、Loading、health、console/page/teardown 功能门全过，最终仅性能硬门失败。

## 350-R6b-d40 候选：入口 19 单次性能异常隔离复验

| 项目 | 冻结内容 |
|---|---|
| 第35次 LongTask | `228ms @ 9.43s`；`324/655/358ms @ 21.87～23.69s`；另有 `93ms` 未超线 |
| 区间归因 | 后三项位于故障 import + rollback；第一项位于早期 regenerate 附近；正式功能结果全部正确 |
| 对照 | 第34次相同 p37 rollback 路径 LongTask 0；当前仅有一次超线样本 |
| d40 | 产品/夹具/阈值完全不改，只运行一次入口19隔离复验；不是白名单或放宽门槛 |
| 判定 | 任一 >200ms 再现则产品性能 BLOCK；全部为0则接受单次环境异常并完成入口19 |
| 当前 | `>200ms` 硬阻断后冻结，待用户新裁定；browser 已用35/40、剩余5次 |

- 用户批准 d40，代码/fixture/阈值完全不变。累计第 `36 / 40` 次 artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-d40-isolated-extra58`；功能链全过，LongTask 再现为 `241/386/686/391ms`，后三项与第35次一样集中在故障 import/rollback 区间。现正式定性产品性能硬阻断，入口19/20冻结，browser剩余4次。

## 350-R6b-p41 候选：地图替换回滚 LongTask 产品优化

| 项目 | 冻结内容 |
|---|---|
| 重复证据 | 第35次 `228/324/655/358ms`；第36次 `241/386/686/391ms`；后三项均位于故障 import/rollback |
| 非问题 | f39 锁冲突、p37 map/renderer identity、错误链、Loading、health、console/page/teardown 全 PASS |
| 调查 | browser 0 定向检查 rollback renderer load 各阶段同步工作、现有 yield/chunk 边界与 prepared presentation 路由 |
| 产品约束 | canonical-first、strict preflight、唯一旧地图 reload、公开 API/UI、200ms 零白名单全部保留 |
| 实施门 | 建立最窄性能红门，完成一次实质优化；Node/类型/build/独立复核通过后最多一次入口19目标复验 |
| 当前 | 待用户新裁定；browser 已用36/40、剩余4次，入口20冻结 |

- 用户新增20次任意授权，p41当前授权消耗1次、剩余19次。p41 红门确认旧 rollback 主线程整图 `loadMapAsync`；产品现以6ms/256KiB staged snapshot + isolated Worker `render.prepare` + prepared install/completion 恢复旧图，旧 renderer fallback保留。动态门覆盖成功 finalize 与 completion fault rollback/原错透传。api-operation、完整 worker-task、prepared installer、render owner、map adoption、visual themes、typecheck、freeze/artifact/catalog/diff 全 PASS；browser 0，现待同一独立复核。

## 350-R6b-p41 / f42：入口 19 最终收敛

- 第37次暴露旧 completion 遗留 `tradeFlowPickItems` 混装，整图 rollback 显式禁止继承未准备 cache；第38次暴露该选项未透传 transaction，补透传及默认拒绝/显式放行动态反例。两轮 blocker-only 复核均 `ACCEPT`，API、完整 Worker、prepared installer、render-cache、typecheck、1401-module build 全 PASS。
- 第39/40次功能、回滚与 rollback 区间性能均通过，唯一 `243/258ms` 精确落在夹具同步 `exportMap` 制造导入文本。f42 只记录该 fixture setup 窗口并把重叠任务单列到 artifact；其余目标任务仍执行200ms零白名单。freeze `loading 12 mutations`、artifact `222/378/5`、catalog/diff 与独立复核均 PASS。
- 第 `41 / 42` 次最终 PASS：8类 Loading、arrayBuffer Loading、`operation_failed → map_replace_debug_fault`、map/renderer rollback identity、锁冲突、浏览器恢复/no-op 与 busy feedback 全成立；setup原始 `246ms` 单列，目标 LongTask `0`，console/page/teardown `0`。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\19-loading-single-source-fixture-partition-extra63`。入口19接受，入口20按固定顺序启动；通用授权剩16次、browser剩1次。

## 350-R6b-f43：入口 20 最终收敛

- 五项 Node 前置全过。第42次唯一 `345ms` 首败来自 chunk recovery reload 后的新 document 启动阶段：observer 重新从 `0ms` 计时，而夹具未在第二次 `waitForApiReady` 后重置，产品 feedback / recovery 未失败。
- 纯夹具只把 failure/recovery 两个真实交互阶段分窗采集，并在第二次 ready 后重置启动窗；freeze 增加三项删除/错序反例，artifact contract 为 `222 hard assertions / 381 mutations / 5 partitions`，同一只读复核 `ACCEPT / P0 0 / P1 0 / browser 0`。
- 第 `43 / 43` 次最终 PASS：fast feedback 无动画，async/cancel/failure、generation/operation 共存、窄视口与 chunk recovery 全成立；LongTask `72 / 81ms`、`>200ms=0`，health/console/page/GL/teardown 均为 `0`。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\p4b-catalog\20-delayed-operation-feedback-fixture-recheck-extra65`。R6b 固定入口 `20 / 20` 完成，转 R7。

## 350-R7：冻结树总串联

- 冻结范围：产品与浏览器夹具不再移动；只在同一最终 production build 上串联固定 10k、代表性 100k、旧档、故障恢复与 S-17 context restore，随后复核 20/20 artifact、性能/错误面与分支未合 main。
- 授权：现有通用授权剩余 `15` 次，本阶段计划使用 `5` 次浏览器执行；首败即停，未到入口不运行。非目标为新增产品功能、再次修夹具、提交、推送或合入 main。

## 350-R7-p1：height undo 的 surface owner 原子交接

- 首败：最终 build 的第一个 10k 门在 `history.undo.edit.height.rebuildBaseDerived` 返回 `render-edited-resource-preflight-mismatch / previous:owner-map-identity`；后四面未运行。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\01-map-transaction-10k`。
- 诊断：仓库外只读脚本记录 `48` 段 owner 时间线；height execute 前后全部 owner 为 `generated:2`，undo attempt 时同步 terrain 内刷先把 surface/active/latest 改为地图 seed，revision 与 cache 仍为 `generated:2`。独立复核判定产品回归、夹具无责。
- 产品边界：同步 scheduler 与既有 async 路径一致，terrain cache 只重建 terrain 自身，不在内部重复刷新 surface/line；后续唯一 refresh 继续使用 retained binding。`refreshCellSurface` 在 CPU/GPU/owner 写入前执行 strict edited-resource preflight，失败保持 before-image。禁止放宽 identity/generation/topology preflight，浏览器夹具不动。
- 最小验收：先以 scheduler 参数与 surface preflight 零写入动态红门证明现状失败；修正后跑专项、prepared installer、history async、panel refresh、worker-task、typecheck、build、freeze/artifact/catalog/diff 与同一只读复核。接受前 browser `0`，后四个 R7 面保持冻结。
- 结果：两道红门先失败后通过；同步 terrain-only 为 `issue → invalidate → terrain → line → surface`，跨 map 动态门在 upload `0` 且所有 surface/cache before-image 引用不变时精确拒绝。render-cache `17 / 29 / 13`、prepared installer `21 cases`、history/panel/Worker/typecheck/freeze/artifact/catalog/diff 与 `1401 modules` build 全过；同一只读复核 `ACCEPT / P0 0 / P1 0 / P2 0 / browser 0`。下一步只复验 R7 10k 首败面。
- p1 后完整 10k 已越过 owner 首败并跑完功能链，最终唯一 `204ms` 产品 LongTask 落在 `zones:undo-baseline`；该命令走既有 async scheduler，与 p1 同步路径不重叠。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\01-map-transaction-10k-p1-recheck`。登记 `R7-d2` 为代码/fixture/阈值零变化的同入口隔离复验；再次超线即产品性能 blocker，不复现才接受为单次抖动。
- d2 同入口完整隔离复验 PASS：zones 三个 history 窗最大 `162 / 149 / 168ms`，全链 `productLongTasks=[]`，功能/history/UI/GL/application/page error 全过。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\01-map-transaction-10k-d2-isolated`。前次孤立 `204ms` 不复现，固定 10k 接受；下一面为代表性 100k。
- 代表性 100k PASS：三次同 session reuse，取消后 fresh recovery；`4 / 4` accepted/committed，buffer 完整，最大 LongTask `70ms`、over-budget `0`，错误/GL/Loading 门通过。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\02-worker-session-100k`。下一面为旧档兼容。
- 旧档兼容 PASS：v2 存档完整恢复且 raw storage 不变，损坏存档保留并给出诊断；目标 LongTask `0`、console/page error `0`。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\03-browser-storage-compatibility`。下一面为稳定故障恢复。
- 稳定故障恢复 PASS：8 类 Loading、arrayBuffer generation-only、一次性 `operation_failed → map_replace_debug_fault@after-renderer-load`、map/renderer rollback identity、river lock conflict、browser restore/no-op 与 busy feedback 全成立；fixture setup `260ms` 单列，产品目标 LongTask `0`，console/page error `0`。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\04-loading-fault-recovery`。用户追加 `20` 次任意授权，启动最后 S-17 后余额为 `26`。
- S-17 首败发生在 context-loss 前：`pickCity` 漏传 `worldToScreen` 必需的 canvas rect，产品证据 `0`。登记纯夹具 `R7-f3`，仅补同一 rect 的投影/拾取数据流并在 R4b fixture contract 固定三参调用；产品、阈值与恢复实现不动。静态门后只做一次目标复验，启动前授权余额 `26`。
- f3 首轮复核 `BLOCK / P0 0 / P1 1 / P2 0`：contract 尚未冻结 pickClientPoint 的 client rect offset，同一实现可被改回 `point.x/y` 而假绿。blocker-only 新增唯一调用及 `rect.left + point.x / rect.top + point.y` 精确门和 mutation，contract 为 `29` cases。复核方误触一次实际 browser，功能通过但不作正式验收；任意授权余额记为 `25`。
- f3 blocker-only 复审 `ACCEPT / P0 0 / P1 0 / P2 0 / browser 0`。正式 S-17 复验 PASS：`10004` cells、same map、generation `+1`、唯一 draw、before/after owners/state/pick 精确，resource/retained ready，LongTask/application/page/health/GL/loading 全 `0`。artifact：`Z:\tmp\codex\2026-08-22\task-350-r6b\r7-final\05-context-restore-s17-f3-recheck`。R7 五面完成，授权余额 `24`，转最终聚合与任务级只读终验。
- 最终冻结树聚合 PASS：16 / 17 / 20，R4b `29` mutations、artifact `222 / 381 / 5`、19 fixtures、typecheck、`1401 modules` build。R6b `20 / 20` + R7 `5 / 5` 共 25 组 artifact 的 full/summary 全存在且 summary 全 `ok=true`。当前分支未合 main，origin/main 与本地 main 均为 HEAD 祖先，diff-check PASS；工作树 `134 tracked / 37 untracked`，未暂存/提交/推送/合并。现交任务级只读终验。
- 任务级首轮终验 `BLOCK / P0 0 / P1 1 / P2 0 / browser 0`，唯一 P1 是 AGENTS 仍写 R7-d2/后四面冻结；其它证据均接受。blocker-only 仅把 AGENTS 同步为 R6b `20/20`、R7 `5/5`、最终聚合/25 artifacts 成功与分支未合 main，随后只做文档复审。
- blocker-only 最终复审 `ACCEPT / P0 0 / P1 0 / P2 0 / browser 0`，允许将第 350 项标记完成归档；未暂存、提交、推送或合并，任意授权余额 `24`。
- 首次归档暴露工具标题兼容缺口：归档器只识别“权威任务第 N 项”，未识别 current-plan 的“第 N 项”，并在解析 0 项时仍重写为空。已从本 handoff 与终验证据恢复第 350 项标准摘要；parser 现兼容两种标题、统一归档标题，并在 task-like heading 数与解析数不一致时 fail-closed。复跑后 current task `0`、archive task 350 恰好 `1`、总归档 `287`、duplicates/activeInArchives `0`，开发日志 `12 shards / 1123 sections` 与 diff-check PASS；归档 blocker-only 复核 `ACCEPT / P0 0 / P1 0 / P2 0 / browser 0`。

- p13a 红门精确复现事件数组从既有单条战报变为 `[]`；p13b 只在 military-policy 命令内、builder 完成后和 map/pack 同步前恢复 before-image 的完整 `events` 及三项 archive metadata。三域协议 `44` 类拒绝、military-policy 10k/100k（`99846 cells / 70856 pack / 1680ms`）、完整军事重生成、军事锁、战线/战报点、typecheck、1399-module build、syntax/diff 均 PASS；现交同一只读复核，browser 保持 `8 / 20`。

- p13 独立复核 `ACCEPT / P0 0 / P1 0 / browser 0`：恢复字段与位置、真实丢档路径、map/pack alias、44 类拒绝和完整重生成边界全部成立；复核独立窄门全 PASS。现使用第 `9 / 20` 次只复验入口 9，入口 10 冻结。

## 350-R6b-p14a / p14b：兵种比例重建保留 stale 键形状

| 项目 | 冻结内容 |
|---|---|
| 第 9 / 20 次首败 | p13 已越过；military-policy pre-commit 报请求外 `metadata.stale` 改写，入口 10 未启动 |
| artifact | `Z:\\tmp\\codex\\2026-08-22\\task-350-r6b\\p4b-catalog\\09-direct-lock-p13-recheck-extra09\\regeneration-lock-direct-domains-browser-{full,summary}.json` |
| 根因 | 前序完整军事重生成把系统标为 fresh，source 有显式 `stale=false`；builder 新 metadata 省略该键，形成 false 到 missing |
| p14a 红门 | policy source 显式 `stale=false`，Worker shadow 必须同时保留 own-property 和 exact 值，validator 原拒绝保持 |
| p14b 产品 | 既有 before-image 恢复中只追加 stale 键形状和值；map/pack 在 sync 后继续同源 |
| 非目标 | 放宽 validator、完整 regeneration fresh/stale 语义、其它 metadata、browser fixture、入口 10、main 合并 |
| 最小验收 | 三域协议、military-policy Worker、军事锁/重生成、typecheck/build、syntax/diff、同一只读复核；browser `0` |
