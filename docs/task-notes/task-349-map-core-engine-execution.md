# 第 349 项地图核心引擎化与 TypeScript 渐进迁移执行记录

## 最终任务

在 `codex/map-core-engine-architecture-plan` 并行分支建立唯一 canonical owner、可审计事务与 revision、snapshot ownership、Domain Manifest、Worker / dependency / render layer 契约，并以既有低风险领域垂直切片验证后逐域收口旧路径。不得合入 `main`；不得执行浏览器验收，最终只交付浏览器验收方案。

## 固定执行规则

- 主线程是唯一写者；评审智能体只读，默认复用同一个智能体，不得派生。
- 每阶段只实现冻结范围，先过静态与专项 Node 门，再建立 Git checkpoint。
- checkpoint 冻结后交给评审智能体；`ACCEPT` 才能进入下一阶段，`BLOCK` 只做最窄修复并重新冻结。
- 计划外发现只有在阻断当前验收或证明设计不安全时才插入阶段；插入后必须更新本表和两份专题计划，并重新排序全部未完成阶段。
- 不启动、不操作、不执行任何浏览器门；浏览器用例、环境、数据、截图和阈值只在 `349-11` 形成方案。
- 每个 checkpoint 按仓库规则递增 `package.json` 版本，显式暂存授权文件，使用中文提交；不合入或推送 `main`。

## 阶段矩阵

| 阶段 | 单一交付 | 最小验收 | 非目标 / 保护边界 | 状态 |
| --- | --- | --- | --- | --- |
| 349-0 | 校正两份计划、登记权威任务、冻结阶段链 | 文档引用、编号、版本、diff check；只读评审 ACCEPT | 不改产品代码 | ACCEPT |
| 349-1 | 现有 owner、事务状态机、Worker / renderer / persistence 依赖盘点与 ADR | 全部现有任务和 owner 可归类；未知 owner 为阻断 | 不创建 facade、不迁移代码 | 进行中 |
| 349-2 | 受限 TypeScript 工具链 | `typecheck:core`、build、既有静态门；运行产物除版本注入外不变 | 不启用全局 `checkJs` | 待执行 |
| 349-3 | 身份、canonical revision、operation binding、snapshot ownership、commit lifecycle 类型与运行时校验 | 类型负例、validator、Node regression | 不接管旧 action | 待执行 |
| 349-4 | Capability-aware Domain Manifest、注册器与影子审计 | 不完整 manifest 拒绝；notes / markers / Worker 试点可登记 | 不改变运行路由 | 待执行 |
| 349-5 | 薄 `MapCoreEngine` 与 `MapRuntimeCoordinator` facade，影子产生 commit / projection 状态 | 旧 history / revision 行为不变；无第二 map owner | 不迁移复杂领域 | 待执行 |
| 349-6 | notes command / history / query / persistence / API 垂直切片 | 新增、编辑、删除、undo / redo、旧数据、save 回归 | 不伪造 Worker / regeneration / layer | 待执行 |
| 349-7 | markers presentation / layer / picking 垂直切片 | identity、draw、pick、export 的 Node / source 契约 | 不执行真实视觉浏览器门 | 待执行 |
| 349-8 | 一个真实 Worker task 的统一 binding / result / patch 切片 | checksum、stale、cancel、gap、restart 的专项回归 | 不批量迁移 Worker | 待执行 |
| 349-9 | dependency registry、projection 状态和局部失效接线 | declared read/write、full rebuild 显式化、projection recovery | 不迁移未登记领域 | 待执行 |
| 349-10.x | 按 349-1 盘点逐域迁移复杂领域并收口 legacy adapter | 每个子阶段独立旧数据、history、Worker、renderer source / Node 门 | 不把多个高风险域塞进一个 checkpoint | 待盘点拆分 |
| 349-11 | 非浏览器集成终验与浏览器验收方案 | build、typecheck、全量非浏览器回归、方案完整性评估 | 不执行浏览器方案 | 待执行 |

## 提交与投影状态机冻结目标

```text
planned → computed → validated → projections-prepared
→ canonical-committed → published → projections-settled
```

- 计算阶段使用 `operationId / transactionId`，不得假装已有正式 `commitId`。
- canonical commit 一旦被 UI、API 或 persistence 观察，不因 renderer / replica 投影失败反向改写历史；投影失败进入 degraded / retry / resync。
- interactive、headless 和 worker-only 运行形态共享 canonical commit，但允许不同的 projection profile。

## 当前阶段交接

| 字段 | 内容 |
| --- | --- |
| 当前阶段 | `349-1` 现状盘点与 ADR 冻结 |
| 冻结点 | `349-0` checkpoint（版本 `0.5.5`，待提交） |
| 允许文件 | 新增盘点 / ADR 文档、本记录、current-plan、AGENTS、开发日志、package.json；必要时只读工具输出进入本地产物 |
| 禁止文件 | `app/`、`tools/`、`source/`、main |
| 必须保持 | 不创建 facade；所有 owner、提交状态、buffer ownership、checksum 和 headless 差异有证据来源 |
| 首个廉价门 | 定向 `rg` 现有 revision / history / Worker / renderer / persistence 入口 |
| 冻结门 | owner / dependency / state-machine 表无未解释空项；专项文档审计；评审智能体 ACCEPT |
| 停止条件 | 出现无法归属的 canonical owner、现有状态机相互矛盾、必须先改产品代码才能完成盘点 |

## 阶段结果

### 349-0 — ACCEPT

- 完成：计划纠正、权威登记、统一阶段链、无浏览器边界、动态插入与评审规则。
- 产品改动：`0`。
- 工具改动：`0`。
- 文档 / 配置改动：`8` 个文件；版本 `0.5.4 → 0.5.5`。
- 门禁：`git diff --check`、package 解析、阶段编号与边界静态检查通过；固定评审智能体首轮 `BLOCK` 后完成四项最窄纠正，复审 `ACCEPT`。
- 浏览器：未启动、未操作、未执行。
- 下一步：`349-1`，首门为定向盘点现有 owner 和真实提交 / 回滚状态机。

阶段结果在每次 checkpoint 后更新，长日志只记录命令和 artifact 路径，不粘贴到本文。
