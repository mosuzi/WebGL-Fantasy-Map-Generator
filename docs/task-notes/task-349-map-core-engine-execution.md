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
| 349-3a | canonical field registry、persisted / live presentation 分类、普通 document identity 定义 / 迁移与 identity adapters 闭合 | 五个遗漏字段、旧数据、checksum、patch、document identity 迁移和身份混用负例通过 | 不实现 Manifest、不接管 action | ACCEPT |
| 349-4 | Capability-aware Domain Manifest、注册器与影子审计 | 不完整 manifest 拒绝；notes / markers / Worker 试点可登记 | 不改变运行路由 | ACCEPT |
| 349-5 | 薄 `MapCoreEngine` 与 `MapRuntimeCoordinator` facade，影子产生 commit / projection 状态 | 旧 history / revision 行为不变；无第二 map owner | 不迁移复杂领域 | ACCEPT |
| 349-6 | notes command / history / query / persistence / API 垂直切片 | 新增、编辑、删除、undo / redo、旧数据、save 回归 | 不伪造 Worker / regeneration / layer | ACCEPT |
| 349-7 | markers presentation / layer / picking 垂直切片 | identity、draw、pick、export 的 Node / source 契约 | 不执行真实视觉浏览器门 | ACCEPT |
| 349-8 | 一个真实 Worker task 的统一 binding / result / patch 切片 | checksum、stale、cancel、gap、restart 的专项回归 | 不批量迁移 Worker | ACCEPT |
| 349-9 | dependency registry、projection 状态和局部失效接线 | declared read/write、full rebuild 显式化、projection recovery | 不迁移未登记领域 | ACCEPT |
| 349-10a | terrain / grid / height-derived / climate / ocean / topology 基础域 | 旧数据、history、Worker、renderer source / Node 门 | 不迁移社会或行政域 | ACCEPT |
| 349-10b | society / politics 与 pack mirror | mirror、行政引用、history、Worker 专项 | 不迁移城镇 / 路线 | CHECKPOINT 待评审 |
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
| 当前阶段 | `349-10b` society / politics 与 pack mirror；`0.5.29` checkpoint 待评审 |
| 冻结点 | `349-10a / 0.5.28` 已接受；`349-10b / 0.5.29` 待同一评审智能体确认 |
| 允许文件 | society / politics Manifest / adapter、行政引用与 pack mirror 契约、相关 Worker / history 专项、阶段文档 |
| 禁止文件 | settlements / routes / economy / military 正式迁移、业务算法无关改写、`source/`、main、浏览器 |
| 必须保持 | 单一 canonical owner；society / politics 与 pack mirror 原子一致；旧档与锁语义不退化；未知依赖显式 full rebuild |
| 首个廉价门 | 已完成：110 / 118 为世界重建漏开既有修复模式；锁国无省会为偶然夹具加越锁补首府，现有确定性反例闭合 |
| 冻结门 | society / politics Manifest、mirror / 行政引用、history、Worker、旧数据、failure rollback、typecheck、build、评审 ACCEPT |
| 停止条件 | 归因证明必须先迁移 settlements 身份 owner，或现有行政约束无法在不改变产品语义下形成确定契约 |

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

### 349-3a — ACCEPT

- 完成：registry `60 → 66` descriptor、`24 → 29` 顶层 section；补入 `notes / measurements / labels / visualTheme / display` 及 `options.visualTheme` 的精确分类 descriptor，并把 `layers / visualTheme / display / options.visualTheme` 标成 `persisted-presentation`，live viewport / intent / pending render 继续留在 runtime projection。
- 兼容：五个新 section 追加在原 `24` 个顶层 section 之后，旧 `.webfmg v3` section id 不移动；缺失字段仍由既有 v2 migration 回填，五字段齐备的 v3 为 `29` section。
- identity：普通地图文档新增独立 `PersistedDocumentId` v1；旧图按稳定元数据确定性派生，既有合法 id 保留，document / map metadata 冲突或未知版本拒绝，导出不改写源 map。它不替代 runtime session、render preparation 或 `headlessWrite.documentId`。
- patch：replica write path 现在必须由同一 registry 的精确、通配或祖先 descriptor 覆盖；五字段 patch 的 target / applied checksum 已同源验证，未知顶层路径拒绝。
- TypeScript：新增普通文档 binding 及 legacy interactive、headless、presentation、render resource 的显式 identity adapters；类型和 runtime 负例禁止命名空间混用。
- 门禁：typecheck、core contracts、registry、五字段 / identity、migration、v3 container、replica journal / command patch、map-file Worker、production build 和 diff check；浏览器未启动、未操作、未执行。
- 版本：首轮 checkpoint `0.5.8 → 0.5.9`，评审修正 checkpoint `0.5.9 → 0.5.10`。
- 评审：首轮 `BLOCK` 四项身份 / checksum P1；加入对应反例并完成最窄修正后，同一只读评审智能体复审 `ACCEPT`。
- 下一步：`349-4` 只建立 capability-aware Manifest、注册器与影子审计，不改变运行路由。

### 349-4 — ACCEPT

- 完成：TypeScript `DomainModuleManifest`、runtime validator / registry、notes / markers / population 三份 shadow Manifest；后者绑定真实 `population.compute` Worker task。
- 审计：canonical read / write、command undo、regeneration revision / binding / lock / replacement、Worker result / binding / patch、panel 引用、persistence、API target / schema / capability / errors / documentation、regression gate / coverage 与 capability reason。
- 专项：登记 `3` 个领域、`45` 个分类 descriptor、`28` 类拒绝 / 原子失败负例；公开 API 对照真实 schema description / capability metadata / business codes，runtime route import `0`，Manifest 不成为第二 owner。
- 版本：首轮 `0.5.10 → 0.5.11`，评审修正候选 `0.5.11 → 0.5.12`；浏览器未启动、未操作、未执行。
- 评审：首轮 `BLOCK` 四项 P1：可缺省 resolver、API 自填矩阵、Marker delete / headless profile 事实漂移、regeneration 未进入唯一性账本。四项最窄修正与反例完成后，同一只读评审智能体 blocker-only 复审 `ACCEPT`。
- 下一步：`349-5` 只建立薄 facade 和不改变旧行为的 commit / projection 影子记录。

### 349-5 — ACCEPT

- 完成：getter-only `MapCoreEngine`、`MapRuntimeCoordinator`、facade contract 与专项 Node；只观察 legacy owner 已发生的 revision / history 事实，不执行 command 或保存 map。
- lifecycle：七步严格推进；`commitId` 只在真实 canonical commit 后分配；publish 再核 owner；publish 前 rollback 和 publish 后 degraded / retry / resync 分离。
- 不变量：legacy revision / history 写入 `0`、map cache `0`、runtime import `0`；projection 集合不可漂移，settled 只接受 ready / degraded；interactive、headless 与 adoption profile 均由既有 revision validator 约束。
- 门禁：core typecheck / contracts / manifests / facade 和 production build 通过，构建保持 `1361 modules`；`source/` 零改动。
- 版本：首轮 `0.5.12 → 0.5.13`，首轮修正 `0.5.13 → 0.5.14`，用户授权的最终最窄修正 `0.5.14 → 0.5.15`；浏览器未启动、未操作、未执行。
- 评审：首轮 `BLOCK` 四项 P1：嵌套 borrow 可写/逃逸、同一 legacy 转换可重复认领、rollback 后 operation 可复活、公开 projection update 可绕过 coordinator；另有根 `AGENTS.md` 当前状态滞后。`0.5.14` 首次 blocker-only 复审确认后三项和文档已闭合，但继续发现原生 callback、accessor descriptor 与 backing store 三条同类 borrow 绕过；用户按停止条件授权最后一次最窄修正，最终修正版本 `0.5.15` 已闭合三条复现。
- 终验：最终 blocker-only 复审 `ACCEPT`；`typecheck:core`、`regress:core-facade`、`regress:core-contracts` 与 production build 通过，构建为 `1361 modules`，runtime import / source 改动 / 浏览器执行均为 `0`。
- 下一步：`349-6` 只迁移 notes 的 command / history / query / persistence / API 垂直切片，不伪造 Worker、regeneration 或 render layer。

### 349-6 — CHECKPOINT 待评审

- 完成：新增 TypeScript notes runtime adapter；五条 Manifest command 进入 active 路由，复用既有 command、`EditHistory`、`MapRevisionTracker` 和唯一 `state.map`，不复制业务算法或建立第二 owner。
- 入口：独立备注新增 / 重命名、对象备注正文、单条 / 批量删除、摘要导入、undo / redo、备注面板查询与备注摘要导出均经同一 adapter；全图压缩保存仍按 `349-10f` 保留既有路径。
- 契约：成功提交产生七步 lifecycle 和 persistence / UI settled projection；history 已提交后的 UI 失败仍记录 canonical commit 并把 UI projection 标为 degraded，不再冒充 no-op / rollback；invalid / no-op 保持 notes、revision、history 与 commit sequence 不变；query / persistence 返回冻结的 detached snapshot。
- 兼容：当前 save round-trip 与 v1 旧备注保留通过；notes 不伪造 Worker、regeneration、view 或 render layer。既有 `regress:note-import` 的标题断言与 HEAD 文案漂移，已只修正测试期待，产品文案未改。
- 首轮评审：`BLOCK` 一项 P1——legacy history 已提交后 UI 刷新异常会被 adapter 误判为提交前拒绝，留下 map / revision / history 已前进而 core commit 为 `0`。最窄修正按 revision + history 双事实识别已提交转换，普通 command 返回真实 `executed:true`，undo / redo 可继续抛刷新异常但 commit / persistence 保留、UI degraded。
- 首次 blocker-only 复审：`BLOCK` 一项同类 P1——抛异常型 post-commit command 虽已有 commit / degraded，却被外层 catch 删除 notes command 归属，使后续 undo 绕过 adapter。最终窄修只在没有 canonical transition 时删除 binding，并补“原异常保持、binding 保留、undo 仍产生 notes commit”专项。
- 门禁：最终修正后 `regress:notes-core` 为 `13` 次单调 revision / commit，覆盖返回 error、undo 抛错、command 直接抛错与其后 undo；`typecheck:core` 通过。完整兼容门与 build 在 `0.5.18` checkpoint 重跑；浏览器执行 `0`。
- 版本：首轮 `0.5.15 → 0.5.16`，首次修正 `0.5.16 → 0.5.17`，最终修正 `0.5.17 → 0.5.18`。
- 终验：同一只读评审智能体最后一次 blocker-only 复审 `ACCEPT`；`source/` 零改动，浏览器启动 / 操作 / 验收均为 `0`。
- 下一步：`349-7` 只迁移 markers presentation / layer / picking 垂直切片；先冻结 identity / draw / pick / export 真实入口，不伪造 Worker 或重生成能力。

### 349-7 — CHECKPOINT 待评审

- 完成：新增共享 `markerPresentationRecords`，WebGL point layer / DOM marker icon、direct picking、picking DTO 回绑和 Feature GeoJSON 导出不再各自枚举 marker；TypeScript 只读 runtime 通过 getter-only core 提供 detached `list / get`，marker panel 改读 snapshot。
- identity：同一顺序与 marker id 在 draw count、direct / DTO picking 和 Feature GeoJSON 中对齐；presentation query 不产生 core operation / commit，不推进 map revision。
- 边界：既有 marker command / history、资源经济、资源重生成和 Worker 编排均未迁移；Manifest 保持 `shadow`，`worker=not-required / regeneration=optional / renderLayer=required`，不虚报整域 active。
- 门禁：markers core、typecheck、Manifest、marker panel icon、selection marker policy、render preparation、辅助对象创建与 production build 通过；固定 1k 为 `8 / 8 / 8 / 8` draw / picking / DTO / export，build `1370 modules`。
- 浏览器边界：误执行一次命名未标出浏览器依赖的 `regress:api-exports`，因既有 operation-stall 健康告警首败停止；该结果不计入验收，未作浏览器诊断或复跑。有效浏览器验收 `0`，后续继续禁用。
- 版本：`0.5.18 → 0.5.19`；下一步只读评审本 checkpoint，未获 `ACCEPT` 不进入 `349-8`。
- 终验：同一只读评审智能体首轮 `ACCEPT`；共享 source 的空槽、顺序、identity 与 Manifest shadow 边界无 P0 / P1 偏差。
- 下一步：`349-8` 只迁移一个真实 `population.compute` Worker task 的 binding / result / patch，不批量迁移 Worker。

### 349-8 — CHECKPOINT 待评审

- 完成：新增 TypeScript population Worker protocol adapter；正式主线程在发送请求前计算既有 population source fingerprint，commit 前统一验证 request / output / plan binding、result kind、请求类型、来源指纹、patch writeSet / operations 与 Manifest 根写集。
- binding：legacy 数字 operation id 保留在 wire DTO，并显式适配为核心 `compute / pre-commit` binding；不把 legacy DTO 假装成核心契约，不建立第二 Worker session 或 canonical owner。
- patch：普通结果和 history 输入都过同一写集门；legacy v1 patch 缺少 base / target checksum 与 revision，故不伪造 `ComputedDomainPatch`，后续 wire format 升级仍留在逐域迁移阶段。
- 原子性：专项拒绝 generation、stale revision、operation gap、source checksum、错误 result kind、未知 / 重复写路径；apply 后取消验证来源指纹完全恢复。通用 Worker 门继续覆盖 ACK、late reject、cancel terminate、rollback / recovery 与 restart / resync owner。
- 首轮评审：`BLOCK` 一项 P1——原 source fingerprint 未覆盖 settlement routes、grid points / burg / feature、Feature 及独立 mirror 等真实读取依赖，同 revision 的漂移 Worker mirror 可绕过 checksum 并覆盖 `settlements.metadata`。
- 最窄修正：来源指纹改为覆盖全部 population 可写根及算法额外读取集；专项逐项漂移 route、grid、Feature、pack-grid、politics / society mirror、economy / stale metadata，并以真实携旧指纹 task 验证 apply 前拒绝。
- 首次 blocker-only 复审：`BLOCK` 同类 P1——旧数据在 `pack.goods` 缺失时读取 `economy.goods`，首轮修正只覆盖前者；漂移 fallback goods 仍可改变 demand patch。最终窄修同时指纹化两份存在性和 effective goods，并补真实携旧指纹 task 拒绝。
- 门禁：最终修正后 population core protocol、typecheck、Manifest、人口 10k / 100k Worker、通用 Worker registry 与 production build `1373 modules` 通过；100k 为约 `983.7ms / 1560 patch paths`。
- 既有首败：`regress:population-adjustment-ui-api` 在未改动的 HEAD 面板文案上仍期待“预检转移”，实际为“查看转移影响”；本阶段不改产品文案，未声称该门通过。
- 版本：首轮 `0.5.19 → 0.5.20`，首次评审修正 `0.5.20 → 0.5.21`，最终修正 `0.5.21 → 0.5.22`；浏览器未启动、未操作、未执行。
- 终验：同一只读评审智能体最后一次 blocker-only 复审 `ACCEPT`；真实读取集、旧数据 goods fallback、binding / result / patch 与 coordinator owner 无 P0 / P1 偏差。
- 下一步：`349-9` 只接 dependency registry、projection 状态与局部失效，不迁移未登记领域。

### 349-9 — ACCEPT

- 完成：Manifest derived system 补齐 `invalidatedBy / scope / rebuild / reuseAcrossPresentation / verify`；新增冻结 descriptor snapshot 的 dependency registry / planner，沿 reads / writes 传播下游失效。
- 分类：notes 带 affected object 为 `local`；无派生消费者的已知写入为 `exact`；theme / visibility 为 `presentation-only` 且只触发 renderer / UI；宽依赖、未知写、缺 affected scope 或缺 projection target 显式为 `full-rebuild` 并记录原因。
- 接线：active notes runtime 的 projection 与 invalidated IDs 改由 planner 提供；commit `rebuilt` 不提前记录尚未完成的 UI projection。markers / population 只进入统一规划测试，未扩大 active 路由。
- 恢复：coordinator 新增 degraded → retrying / resyncing → ready 的受控执行；失败带原因回到 degraded，已发布 revision / history 不回滚。首轮评审发现非法 runtime mode 可在清理边界外占锁、空错误消息可能滞留中间态，现已将模式校验与首转换纳入清理边界，并保证失败原因非空。
- verifier：首轮评审发现 derived system 的 `verify` 只是未解析名称，现强制它属于本领域 `regression.gates`，而所有 gate 继续由 package script 注册门校验，notes / markers / population 均绑定真实专项门。
- 资源 verifier：第二轮评审发现 markers resource-economy 误指向只覆盖普通 marker 的 auxiliary 门。现新增组合专项：真实资源点生成必须写入 `pack` resource cell、`economy` 资源供给 / 交易 / demand，dependency plan 必须包含 `economy-demand / object-index`，中途故障必须原子恢复四域。
- 门禁：修正后 markers resource economy core、core dependencies、Manifest `31` 类负例、facade recovery、notes core `13` commit / revision、markers core、population core protocol、typecheck 与 production build `1375 modules` 通过。
- 版本：初始 checkpoint `0.5.22 → 0.5.23`，首轮评审修正 `0.5.23 → 0.5.24`，第二轮评审修正 `0.5.24 → 0.5.25`；`source/` 与浏览器执行均为 `0`。
- 终验：同一只读评审智能体最后一次 blocker-only 复审 `ACCEPT`，三项 P1 均闭合且无新增 P0 / P1。
- 下一步：`349-10a` 只迁移 terrain / grid / height-derived / climate / ocean / topology 基础域，不迁移社会或行政域。

### 349-10a — ACCEPT

- 完成：新增 shadow foundation Manifest 与 TypeScript Worker adapter；高度派生、气候下游、洋流世界、网格拓扑四个正式入口在 canonical commit 前统一校验 legacy binding、result kind、patch / replacement 和 renderer source。
- renderer：render preparation、render cache、picking DTO 与 surface owner 全链补入 `topologyRevision`；同 map revision 的 stale topology 结果拒绝，topology 改变会重建 retained cache。
- owner 边界：`FOUNDATION_DOCUMENT_WRITE_SET` 只是既有整图 replacement / 跨域 patch 的保守事务包络，不成为第二 canonical owner；Manifest 保持 shadow，业务算法、旧 wire DTO 与唯一 `state.map` 不变。
- 门禁：typecheck、Manifest `4 domains / 67 descriptors / 31 negative`、dependency、foundation protocol 组合、高度 brush history、grid `10004 → 100000` refinement、production build `1377 modules` 通过；浏览器执行 `0`。
- 阶段外首败：既有 ocean world 完整夹具稳定拒绝省份 `110` 无合法省会候选和省份 `118` 省会不一致；约束 bundle 另缺一个锁国无省会样本。未改夹具、未放宽门、未声称通过；按依赖顺序把最小复现与归因放到紧邻 `349-10b` 首门。
- 产品改动：`8` 文件，约 `+327 / -7` 行；工具改动：`5` 文件，约 `+156 / -12` 行；版本 `0.5.25 → 0.5.26`。
- 专题记录：`docs/task-notes/task-349-foundation-core-slice.md`。
- 首轮评审：`7669915 / 0.5.26` 为 `BLOCK`。P1 一是正式 binding factory 未从 revision owner 取得 topology revision；P1 二是 replacement 只校验五个基础 section，可能把残缺整图交给 swap。
- 最窄修复：内部 core revision snapshot 产生并保守单调推进 topology revision，失败快照同步回滚；正式 renderer request 保留该字段。replacement 改从唯一 canonical registry 要求全部非 optional 顶层 section 及关键集合结构；ocean / grid 残缺 replacement 在 pre-commit 拒绝且 canonical / history / revision 不变。
- 第一轮修正版本：`0.5.26 → 0.5.27`；`88ecc40 / 0.5.27` 第二轮复审仍为 `BLOCK`。P1 一是正式 commit 后只手工给 `mapRevision + 1`，实际 owner 同时推进 topology，renderer install 会立即判 stale；P1 二是顶层 section 虽齐全但 economy / diplomacy / military / markers / zones / heightmap / climate / ocean 等域可被替换成空对象。
- 第二轮最窄修复：canonical history commit 后从唯一 revision owner 读取实际 core snapshot，统一 helper 要求 identity 稳定且 map / topology revision 各推进一次，renderer install、grid fingerprint 与 UI settle 共用该 binding；整图 replacement 除全部必需顶层 section 外，逐域校验数组、记录、数值和字符串结构锚点，ocean / grid 的顶层存在但内容清空结果在 pre-commit 原子拒绝。
- 修正版本：`0.5.27 → 0.5.28`；下一步冻结修正 checkpoint，交同一只读评审智能体 blocker-only 复审；仅 `ACCEPT` 后进入 `349-10b` society / politics 与 pack mirror。
- 终验：同一只读评审智能体对 `704a955 / 0.5.28` blocker-only 复审 `ACCEPT`，两项 P1 闭合且无新增 P0 / P1。
- 下一步：进入 `349-10b`；先执行已冻结的行政引用最小复现与归因，不先放宽门或修改产品算法。

### 349-10b — CHECKPOINT 待评审

- 首门归因：省份 `110 / 118` 的世界重建拒绝来自两处调用漏开既有行政修复模式；补齐后 10k / 50k / 100k 世界重建通过。锁国无省会改为从真实有效省份构造确定性反例，重建跳过锁定国家 / 省份的首府再生成，完整支撑包络保持不变；行政约束没有放宽。
- 协议：新增 shadow `society-politics` Manifest 与 TypeScript 输出 validator。真实 `regeneration.compute` 的 religions / states / provinces 在 commit 前统一校验 binding、精确写集、patch operations、社会 / 行政双镜像与首府引用；真实 history 覆盖提交、撤销、重做及六类协议拒绝。
- 依赖：Manifest 注册表为 `5 domains / 78 descriptors`，dependency 注册表为 `9 systems`；社会和行政写入分别失效 cell colors、政治边界、labels、object index 与 picking，并显式规划 full rebuild。
- 阶段外首败：完整 world constraint 现稳定在锁定 Feature 港口引用 `382 → 366` 处拒绝，删除项来自 `pack.burgs`。该 owner 属于 routes / features，已登记为原定 `349-10d` 首门；重新评估后未完成阶段顺序不变。
- 门禁：typecheck、Manifest、dependency、society / politics 组合专项、v1 migration、production build `1379 modules` 与 diff check 通过；完整 world constraint 的 10d 预期首败不冒充 10b 通过门。浏览器执行 `0`，`source/` 改动 `0`。
- 规模：产品代码 `6` 文件，约 `+349 / -3` 行；工具代码 `6` 文件，约 `+244 / -36` 行；文档 / 配置同步 `8` 文件；版本 `0.5.28 → 0.5.29`。
- 下一步：冻结 checkpoint 并交同一只读评审智能体；仅 `ACCEPT` 后进入 `349-10c`。

阶段结果在每次 checkpoint 后更新，长日志只记录命令和 artifact 路径，不粘贴到本文。
