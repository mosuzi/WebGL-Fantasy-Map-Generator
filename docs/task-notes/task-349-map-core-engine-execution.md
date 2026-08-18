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
| 349-1 | 现有 owner、事务状态机、Worker / renderer / persistence 依赖盘点与 ADR | 全部现有任务和 owner 可归类；未知 owner 为阻断 | 不创建 facade、不迁移代码 | ACCEPT |
| 349-2 | 受限 TypeScript 工具链 | `typecheck:core`、build、既有静态门；运行产物除版本注入外不变 | 不启用全局 `checkJs` | ACCEPT |
| 349-3 | 身份、canonical revision、operation binding、snapshot ownership、commit lifecycle 类型与运行时校验 | 类型负例、validator、Node regression | 不接管旧 action | ACCEPT |
| 349-3a | canonical field registry、persisted / live presentation 分类、普通 document identity 定义 / 迁移与 identity adapters 闭合 | 五个遗漏字段、旧数据、checksum、patch、document identity 迁移和身份混用负例通过 | 不实现 Manifest、不接管 action | 待评审 |
| 349-4 | Capability-aware Domain Manifest、注册器与影子审计 | 不完整 manifest 拒绝；notes / markers / Worker 试点可登记 | 不改变运行路由 | 待执行 |
| 349-5 | 薄 `MapCoreEngine` 与 `MapRuntimeCoordinator` facade，影子产生 commit / projection 状态 | 旧 history / revision 行为不变；无第二 map owner | 不迁移复杂领域 | 待执行 |
| 349-6 | notes command / history / query / persistence / API 垂直切片 | 新增、编辑、删除、undo / redo、旧数据、save 回归 | 不伪造 Worker / regeneration / layer | 待执行 |
| 349-7 | markers presentation / layer / picking 垂直切片 | identity、draw、pick、export 的 Node / source 契约 | 不执行真实视觉浏览器门 | 待执行 |
| 349-8 | 一个真实 Worker task 的统一 binding / result / patch 切片 | checksum、stale、cancel、gap、restart 的专项回归 | 不批量迁移 Worker | 待执行 |
| 349-9 | dependency registry、projection 状态和局部失效接线 | declared read/write、full rebuild 显式化、projection recovery | 不迁移未登记领域 | 待执行 |
| 349-10a | terrain / grid / height-derived / climate / ocean / topology 基础域 | 旧数据、history、Worker、renderer source / Node 门 | 不迁移社会或行政域 | 待执行 |
| 349-10b | society / politics 与 pack mirror | mirror、行政引用、history、Worker 专项 | 不迁移城镇 / 路线 | 待执行 |
| 349-10c | settlements / zones / labels / measurements | 身份槽、锁、旧数据、history、projection 专项 | 不迁移路线 / 经济 | 待执行 |
| 349-10d | routes / rivers / features / resource markers | topology、引用、picking、Worker、history 专项 | 不迁移经济 / 军事 | 待执行 |
| 349-10e | economy / diplomacy / military | 跨域引用、history、Worker、旧数据专项 | 不收口全图 adoption | 待执行 |
| 349-10f | generation / import / adoption / export / headless profile 收口 | 新 session、rollback、旧档、checksum、无 DOM headless 专项 | 不删除未证明冗余的 legacy adapter | 待执行 |
| 349-10g | legacy adapter、重复 revision / history 路径与影子审计收口 | 正式入口清单无双写、无第二 owner、非浏览器全回归 | 不扩大产品能力 | 待执行 |
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
| 当前阶段 | `349-3a` canonical registry、普通 document identity 与 identity adapters 待评审 |
| 冻结点 | `349-3a` 实现与 Node / build 证据已冻结，版本 `0.5.9` checkpoint 待评审 |
| 允许文件 | canonical registry / checksum / patch 描述、map-file-io identity migration、core identity adapters、专项 Node、阶段文档 |
| 禁止文件 | Manifest、facade、旧 action 接管、领域迁移、`source/`、main、浏览器 |
| 必须保持 | 五个持久字段进入唯一 registry；普通 document identity 有默认 / 派生 / 迁移；各 identity 只能显式转换 |
| 首个廉价门 | 核对五字段默认 / migration / patch mode 与普通文档 metadata 现状，冻结 adapter 输入输出 |
| 冻结门 | registry / old-data / checksum / patch / identity migration / 混用负例、typecheck、build、评审 ACCEPT |
| 停止条件 | 字段无法归类 canonical / persisted presentation，或 identity 迁移会重写用户语义而非补充 metadata |

## 阶段结果

### 349-0 — ACCEPT

- 完成：计划纠正、权威登记、统一阶段链、无浏览器边界、动态插入与评审规则。
- 产品改动：`0`。
- 工具改动：`0`。
- 文档 / 配置改动：`8` 个文件；版本 `0.5.4 → 0.5.5`。
- 门禁：`git diff --check`、package 解析、阶段编号与边界静态检查通过；固定评审智能体首轮 `BLOCK` 后完成四项最窄纠正，复审 `ACCEPT`。
- 浏览器：未启动、未操作、未执行。
- 下一步：`349-1`，首门为定向盘点现有 owner 和真实提交 / 回滚状态机。

### 349-1 — ACCEPT

- 完成：互动 / headless / Worker / renderer / persistence owner 与五类事务状态机盘点，`13 / 13` Worker task、snapshot / buffer ownership、checksum 和失效路径归类；冻结九项 ADR。
- 计划调整：发现五个既有存档字段未进入 canonical registry，普通 persisted document identity 也尚无稳定契约，插入 `349-3a`；复杂域按依赖拆为 `349-10a`～`349-10g`。
- 产品改动：`0`；工具改动：`0`。
- 文档 / 配置改动：`9` 个文件；版本 `0.5.5 → 0.5.6`。
- 门禁：registry `60` 字段 / `24` section、Worker `13` task、阶段同步、禁区与 `git diff --check` 通过；只读评审首轮 `BLOCK` 三项事实措辞，最窄修正后复审 `ACCEPT`。
- 浏览器：未启动、未操作、未执行。
- 下一步：`349-2`，只接入受限 TypeScript 工具链，不迁移业务实现。

### 349-2 — ACCEPT

- 完成：TypeScript `7.0.2` 开发依赖、受限 `tsconfig.core.json`、`typecheck:core` 与未进入 runtime import graph 的最小 sentinel。
- 产品运行代码：`0`；工具代码：`0`；非运行时 sentinel：`1` 文件 / `2` 行。
- 配置 / lock：`package.json`、`pnpm-lock.yaml`、`tsconfig.core.json`；版本 `0.5.6 → 0.5.7`。
- 门禁：frozen lock、typecheck、showConfig 边界、production build 通过；工具链接入前后同版本 `0.5.6` 均为 `1360` modules / `98` files，aggregate SHA-256 精确相同。
- 评审：同一只读评审智能体首轮 `ACCEPT`。
- 浏览器：未启动、未操作、未执行。
- 下一步：`349-3`，只实现核心类型与 runtime validator，不接管旧 action。

### 349-3 — ACCEPT

- 完成：`10` 个 TypeScript contract 文件 / `635+` 行，覆盖品牌身份、双 revision profile、operation / projection binding、snapshot ownership、computed / committed patch、commit lifecycle、envelope 与 runtime error。
- 专项工具：`1` 文件；同一 TypeScript validator 编译后由 Node 执行，不维护第二份 JS validator。
- 产品接线：旧 runtime import `0`；旧 action / registry / facade / Manifest 改动 `0`。
- 门禁：typecheck 与类型负例、core contract Node regression、tool syntax、runtime import audit、production build `1360` modules、diff check 通过。
- 评审：首轮 `BLOCK` 五项类型 / validator / 覆盖一致性，逐项补负例后同一只读评审智能体复审 `ACCEPT`。
- 版本：`0.5.7 → 0.5.8`；浏览器未启动、未操作、未执行。
- 下一步：强制插入的 `349-3a`，先闭合 registry 与 identity adapter，再开始 Manifest。

### 349-3a — 待评审

- 完成：registry `60 → 65` 字段、`24 → 29` 顶层 section；补入 `notes / measurements / labels / visualTheme / display`，并把 `layers / visualTheme / display` 标成 `persisted-presentation`，live viewport / intent / pending render 继续留在 runtime projection。
- 兼容：五个新 section 追加在原 `24` 个顶层 section 之后，旧 `.webfmg v3` section id 不移动；缺失字段仍由既有 v2 migration 回填，五字段齐备的 v3 为 `29` section。
- identity：普通地图文档新增独立 `PersistedDocumentId` v1；旧图按稳定元数据确定性派生，既有合法 id 保留，document / map metadata 冲突或未知版本拒绝，导出不改写源 map。它不替代 runtime session、render preparation 或 `headlessWrite.documentId`。
- patch：replica write path 现在必须由同一 registry 的精确、通配或祖先 descriptor 覆盖；五字段 patch 的 target / applied checksum 已同源验证，未知顶层路径拒绝。
- TypeScript：新增普通文档 binding 及 legacy interactive、headless、presentation、render resource 的显式 identity adapters；类型和 runtime 负例禁止命名空间混用。
- 门禁：typecheck、core contracts、registry、五字段 / identity、migration、v3 container、replica journal / command patch、map-file Worker、production build 和 diff check；浏览器未启动、未操作、未执行。
- 版本：`0.5.8 → 0.5.9`。评审 `ACCEPT` 前不得进入 `349-4`。

阶段结果在每次 checkpoint 后更新，长日志只记录命令和 artifact 路径，不粘贴到本文。
