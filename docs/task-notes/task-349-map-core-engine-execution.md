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
| 349-10b | society / politics 与 pack mirror | mirror、行政引用、history、Worker 专项 | 不迁移城镇 / 路线 | ACCEPT |
| 349-10c0 | 分离领域 Worker binding id 与共享 transport task，按 result kind 唯一拥有 | disjoint result kind 可共享 task；重叠 owner 原子拒绝 | 不迁移任何业务领域 | ACCEPT |
| 349-10c | settlements / zones / labels / measurements | 身份槽、锁、旧数据、history、projection 专项 | 不迁移路线 / 经济 | ACCEPT |
| 349-10d | routes / rivers / features / resource markers | topology、引用、picking、Worker、history 专项 | 不迁移经济 / 军事 | ACCEPT |
| 349-10e | economy / diplomacy / military | 跨域引用、history、Worker、旧数据专项 | 不收口全图 adoption | ACCEPT |
| 349-10f | generation / import / adoption / export / headless profile 收口 | 新 session、rollback、旧档、checksum、无 DOM headless 专项 | 不删除未证明冗余的 legacy adapter | ACCEPT |
| 349-10g | legacy adapter、重复 revision / history 路径与影子审计收口 | 正式入口清单无双写、无第二 owner、非浏览器核心 / 领域回归 | 不扩大产品能力 | ACCEPT |
| 349-10g-a | markers 能力夹具契约同步 | Manifest、markers、地理网络资源专项 | 不回退现行 Manifest，不改产品能力 | 动态插入，ACCEPT |
| 349-11 | 非浏览器集成终验与浏览器验收方案 | build、typecheck、全量非浏览器回归、方案完整性评估 | 不执行浏览器方案 | 待评审 |

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
| 当前阶段 | `349-10e` economy / diplomacy / military blocker-only 修正待复审 |
| 冻结点 | `349-10d / 0.5.39` 已由同一评审智能体接受 |
| 允许文件 | 三域 Manifest / Worker pre-commit validator、军事事件归档、外交锁真实战争区域判定、专项与阶段文档 |
| 禁止文件 | generation / import / adoption / export / headless 收口、legacy 删除、`source/`、main、浏览器 |
| 必须保持 | 单一 canonical owner；三域 pack / politics 镜像、history、锁、旧数据和跨域引用语义不退化 |
| 首个廉价门 | 四类 Worker result owner、精确 / 动态写集和三域真实镜像已冻结并进入独立协议门 |
| 冻结门 | 三域协议、10k / 100k Worker、外交 / 军事锁和规则、economy、typecheck、build、评审 ACCEPT |
| 停止条件 | 任何共享 result owner 未登记，或需要先改 adoption 才能验证三域正式输出 |

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
- 协议：新增 shadow `society-politics` Manifest 与 TypeScript 输出 validator。真实 `regeneration.compute` 的 religions / states / provinces 在 commit 前统一校验 binding、精确写集、patch operations、社会 / 行政双镜像与首府引用；真实 history 覆盖提交、撤销、重做及九类协议拒绝。
- 依赖：Manifest 注册表为 `5 domains / 78 descriptors`，dependency 注册表为 `9 systems`；社会和行政写入分别失效 cell colors、政治边界、labels、object index 与 picking，并显式规划 full rebuild。
- 阶段外首败：完整 world constraint 现稳定在锁定 Feature 港口引用 `382 → 366` 处拒绝，删除项来自 `pack.burgs`。该 owner 属于 routes / features，已登记为原定 `349-10d` 首门；重新评估后未完成阶段顺序不变。
- 门禁：typecheck、Manifest、dependency、society / politics 组合专项、v1 migration、production build `1379 modules` 与 diff check 通过；完整 world constraint 的 10d 预期首败不冒充 10b 通过门。浏览器执行 `0`，`source/` 改动 `0`。
- 规模：产品代码 `6` 文件，工具代码 `6` 文件，文档 / 配置同步 `8` 文件；版本 `0.5.28 → 0.5.31`。
- 首轮评审：`2700d2b / 0.5.29` 为 `BLOCK`。P1 一是完整 writeSet 仍可把 18 个 operation 全部改成 `exists:false` 或 `value:undefined`，validator 会放行并由 patch 实际删除 canonical 路径；P1 二是国家 / 省份首府清零后保留 city / burg 标记可绕过仅正向引用检查。
- 最窄修复：executed patch 的每个精确路径必须 `exists:true` 且值满足布尔、数值、数组 / TypedArray 或记录结构契约；删除与 undefined 在 pre-commit 原子拒绝。行政门改为国家 / 省份 ↔ city ↔ burg 双向唯一引用；零首府只允许 source before-image 已为零且对应国家 / 省份受锁，普通清零和孤立 / 重复反向标记拒绝，锁国既有零省会正例保留。
- 第一轮修正版本：`0.5.29 → 0.5.30`。复审确认双向首府和受锁 zero before-image 已闭合，但继续 `BLOCK` 一项同类 P1：`ArrayBuffer.isView` 误接纳 DataView，通用记录判断也接纳 TypedArray、Map / Set / Date 等非 canonical 容器。
- 第二轮最窄修复：cell 路径只接纳 Array 或非 DataView TypedArray；记录路径只接纳 plain / null-prototype object，排除 ArrayBuffer view、Map、Set、Date 等原生容器。专项新增 DataView cell、TypedArray politics 和 Map settlements 三类 pre-commit 拒绝，版本 `0.5.30 → 0.5.31`，待同一智能体复审。
- 终验：同一只读评审智能体对第二轮修正 checkpoint `ACCEPT`；两轮 P1 全部闭合且无新增 P0 / P1。
- 下一步：进入 `349-10c`，先盘点 settlements / zones / labels / measurements 的真实 owner 与边界，不提前迁移 routes / economy。

### 349-10c0 — CHECKPOINT 待评审

- 插入原因：10c 首门确认 `WorkerTaskDescriptor.id` 同时承担领域 descriptor identity 与真实 task registry key；`regeneration.compute` 已由 society-politics 登记后，cities / zones 即使 result kind 不重叠也无法由独立领域如实登记。
- 契约：新增必填 `task` 绑定真实 Worker transport，`id` 只表示领域 descriptor；唯一 result owner key 改为 `task + resultKind`。disjoint result kind 可共享 transport，跨领域或单 Manifest 重叠均在注册前原子拒绝。
- 兼容：foundation / population 显式声明同名 task；society-politics 使用领域专属 descriptor id 绑定既有 `regeneration.compute`。正式 Worker registry、wire DTO、业务入口与 canonical owner 改动 `0`。
- 门禁：typecheck、Manifest 正式 `5 domains / 78 descriptors`、共享 transport 正例和 `35` 类负例、既有三类 Worker protocol、build、diff check；`source/` 与浏览器执行 `0`。
- 版本：`0.5.31 → 0.5.32`；下一步只读评审本 checkpoint，`ACCEPT` 后返回 349-10c。
- 终验：同一只读评审智能体首轮 `ACCEPT`；共享正例、重叠拒绝、兼容边界和阶段文档无 P0 / P1 偏差。
- 下一步：返回 `349-10c`，继续 settlements / zones / labels / measurements。

### 349-10c — ACCEPT

- 完成：新增 settlements / zones / labels / measurements 四份 shadow Manifest；正式 cities / zones Worker commit 前统一校验 binding、policy / patch、容器、city↔burg / route / politics 与 zone↔pack 身份镜像。
- 依赖：注册表增至 `9 domains / 135 descriptors`、dependency 为 `13 systems`；四类 projection 均进入统一传播，labels / measurements 不虚报 Worker 或独立重生成。
- 兼容：真实 2k cities / zones、history commit / undo / redo、标签备注、测量保存 / 纯 Node 导入、v1 migration 通过；旧 v1 夹具只补当前安全读取必需的 grid / pack / settlement 空身份结构。
- 夹具：校准 harbor `0/1`、地区 from-empty、`repairProtectedDerived`、共享 PNG selector 与生成种子不再保证每图跨海国家等已接受语义；确定性手工跨海夹具继续保留。
- 浏览器：误触一次实际启动 Playwright 的 `regress:measurement` 后立即终止，不计验收、不使用结果；有效浏览器验收仍为 `0`。Manifest 改用纯 Node measurement gates，最终方案须加入浏览器脚本静态识别。
- 门禁：typecheck、Manifest、dependency、新领域协议、map migration、四域代表性 Node 专项与 build `1382 modules` 通过；`source/` 改动 `0`。
- 版本：`0.5.32 → 0.5.33`；专题记录 `docs/task-notes/task-349-settlements-zones-annotations-core-slice.md`。
- 首轮评审：`BLOCK`；发现行政首府引用、grid / pack burg cell 镜像、zone cell 源拓扑边界三个 P1。`0.5.34` 复用既有行政 validator 并接入 before-image sourceMap，新增 dangling / 清零 / 重复 claim、双 cell 镜像与 zone 越界反例；core typecheck、新领域协议与 society-politics 全专项通过，浏览器运行 `0`。
- 终验：同一只读评审智能体 blocker-only 复审 `ACCEPT`；三个 P1 均已闭合，无新增 P0 / P1。
- 下一步：进入 349-10d，并先复现锁定 Feature 港口引用 `382 → 366`。

### 349-10d — CHECKPOINT 待评审

- 首门：完整 world constraint 稳定复现 cities-routes 后锁定 Feature 直接引用 `382 → 366`，16 条删除项均为携 `port: 1` 的历史 city / burg tombstone；from-empty 城镇重建复用其数值槽时没有保留直接引用墓碑。现先冻结引用墓碑及 counterpart ID，再生成活动城市，完整门恢复为 `11 stages / 15 locked kinds`。
- 第二个真实缺口：主动 Feature 重建会给原本只携 `port` 的锁定引用对象补写 `feature` 字段。Feature topology 重建现捕获锁定 Feature 的 city / burg / route / marker / port diagnostics 直接引用字段并在最终锁断言前原样恢复；独立 pre-commit validator 同时验证锁定 Feature 对象、grid / pack cell 归属与直接引用集合。
- 协议：新增 features / routes / rivers 三份 shadow Manifest，并把 markers 的真实 regeneration Worker 能力补齐；`regeneration.compute` 的 features / routes / rivers / markers 与 `route-path.compute` 进入独立 result ownership。正式主线程 commit 前统一校验 binding、精确写集、合法容器、Feature 镜像与锁包络、route city / market / adjacency、river parent / cell、marker cell 与 economy / politics 镜像。
- 依赖：总注册表从 `9 domains / 135 descriptors` 增至 `12 domains / 175 descriptors`，dependency 从 `13` 增至 `16 systems`；Feature topology、路线 line projection、河流水文 projection 进入传播规划，markers resource economy 保持原系统。
- 必需插入维护：路线面板门同步当前“路线修改影响”权威文案；Feature topology 夹具改用已接受的 city / burg ID 直接槽，并同步当前高度编辑保守失效语义；route quality 主动城镇重建显式开启既有省会镜像修复。另修复生成器与湖泊编辑器的真实兼容缺口：自然出口河流可从与湖直接相邻的岸上 spill cell 起步，不再被错误判为 invalid outlet。
- 门禁：`typecheck:core`、core Manifest、core dependency、新地理网络资源协议、route edit / connectivity / quality / locked、river network / delete / locked / control points、Feature topology / patch / locked、marker resource economy、v1 migration、完整 world constraint、production build `1387 modules` 与 diff check 通过；浏览器执行 `0`，`source/` 改动 `0`。
- 版本：`0.5.35 → 0.5.36`；专题记录 `docs/task-notes/task-349-features-networks-resources-core-slice.md`。下一步冻结 checkpoint，交同一只读评审智能体审查；仅 `ACCEPT` 后进入 `349-10e`。
- 首轮评审：`9228dbd / 0.5.36` 为 `BLOCK`。P1 为 route-path Manifest 宽写集与真实 history roots 漂移、Feature 普通 route / city / marker 镜像及引用未闭合、route cell links 未消费、river path 邻接与 cell mirror 未闭合、岸上湖泊出口兼容会误接受入湖方向。
- blocker-only 修正：route-path 改为两类真实 history roots 的 `21` 路径精确并集并由 Manifest 门静态对照；Feature 复用完整 route mirror，新增 city↔burg、marker↔pack 与全部普通直接 Feature 引用验证；routes 从 route.packCells 重建并核对 `pack.cells.routes`；rivers 校验相邻序列、末尾哨兵、正向 cell ref 与每条河流反向归属；岸上 outlet 必须不再进入该湖且匹配已有 overflow spill cell。专项拒绝集由 `16` 增至 `21` 类，既有 route-path 10k / 100k、路线 / 河流 / Feature / 完整约束门通过，版本 `0.5.36 → 0.5.37`，待同一评审智能体复审。
- 第二轮复审：`9e54ef2 / 0.5.37` 继续 `BLOCK` 两项 P1。Feature Worker 未把 city / burg / marker 身份位置与 source before-image 绑定；river mirror 只要求每条河至少一个 claim，部分清空仍可通过。
- 第二轮最窄修正：Feature 输出的活动 city / burg 身份与 grid / pack cell 列表必须和 sourceMap 完全一致，marker 另校验唯一 ID、grid / pack cell 边界及 source identity；river 每个非终端陆格必须由自身或合法汇入子河占有，水域尾段允许零 owner，末端父河 / 同父汇流显式例外，保留每河至少一个 claim。专项新增 city move、marker 越界、部分 river owner 清空反例并增加 3 个 10k 河网 owner 正例，拒绝集增至 `23` 类；版本 `0.5.37 → 0.5.38`，待同一评审智能体复审。
- 第三轮复审：`85bafdc / 0.5.38` 继续 `BLOCK` 一项 P1。水域零 owner 例外没有要求水域必须构成路径尾缀，会接受“陆地→水域→陆地”；子河 owner 例外也没有限制在子河终点，会接受子河越过真实汇流点后继续重叠父河。
- 第三轮最窄修正：river validator 在逐段 owner 检查前冻结水域尾缀状态，进入水域后再出现陆格即拒绝；父河接纳 child owner 与同父支流接纳 sibling owner 时，均要求该 cell 是贡献河流的最后一个真实 cell。专项新增 land-water-land 与 child-overlap 两类反例，拒绝集增至 `25` 类；3 个额外 10k 河网 owner 正例继续通过，版本 `0.5.38 → 0.5.39`，待同一评审智能体复审。
- 终验：同一只读评审智能体对 `65ea8b2 / 0.5.39` 给出 `ACCEPT`；最后一项 P1 已闭合且无新增 P0 / P1。下一步进入 349-10e。

### 349-10e — ACCEPT

- 冻结目标：为 economy / diplomacy / military 建立真实 Manifest、依赖描述与既有 Worker 结果 pre-commit 契约，覆盖三域跨国家 / 城市 / 路线引用、history 与旧数据；不收口 generation / import / adoption / export / headless profile。
- 首个廉价门：盘点三域真实 command、regeneration result kind、canonical / mirror 写集和现有 Node 专项；任何未登记共享 result owner 或必须先改 adoption 的发现均先登记并重排。
- checkpoint：三域 Manifest、`economy / diplomacy / military / military-policy` 四个 result owner 与正式 pre-commit validator 已接线，registry 为 `15 domains / 216 descriptors`、dependency 为 `15 domains / 19 systems`。首轮协议拒绝 `12` 类 binding / 写集 / 镜像 / 引用 / 事件负例；10k / 100k Worker、三域规则 / 锁 / 显示与构建门通过。
- 必需维护：恢复军事主动重生成的旧战报归档与 sequence，外交锁仅将 `Warzone` 视为战争派生，并更新已不再生成战线的固定样本种子。三项均直接阻断本阶段门，不扩大产品能力；未完成顺序复评仍为 `349-10f → 349-10g → 349-11`。
- 首轮评审：`90f13ff / 0.5.41` 为 `BLOCK`。五项 P1 分别为精确写集任意删除、经济 identity / reference 缺口、military-policy 跨请求国家写入、外交 Warzone 引用缺口和军事事件归档 before-image / generation 缺口。
- blocker-only 修正：完整重生成除真实可选 `metadata.derivedStale` 外均要求 `exists:true`；经济限制动态字段并校验 good / market / deal 槽与 market / cell / burg / state / deal 端点；外交复用正式 zone 身份 / cell 门并核对 Warzone 敌对国家对；军事事件逐项核对原内容、顺序与归档代次。军事比例命令冻结全部非目标国家，policy / validator 同时绑定请求 `stateId`，patch 从跨多个国家收敛为目标国家与必要军事镜像。协议负例增至 `23` 类，版本 `0.5.41 → 0.5.42`，待同一智能体复审；未完成顺序仍为 `349-10f → 349-10g → 349-11`。
- 后续复审：`0.5.42` 的精确结果形状、经济整对象、全局军事根与第三国 Warzone cell 四类 P1 在 `0.5.43` 收紧；再由 `0.5.44` 冻结不涉及目标国家的 campaign / front，并从提交后军团重算军事汇总。协议负例最终为 `38` 类，10k / 100k 与全套静态 / Node 门通过。
- 终验：同一只读评审智能体对 `9bfe682 / 0.5.44` 给出 `ACCEPT`；无剩余 P0 / P1，浏览器执行 `0`。下一步进入 349-10f。

### 349-10f — 已接受

- 冻结目标：收口全图 generation、JSON / compressed import、adoption handoff、export persistence 与隔离 headless write profile，使新 session / revision、rollback、旧档 identity、checksum 与 projection 状态使用既有 core vocabulary；不删除未证明冗余的 legacy adapter。
- 首个廉价门：盘点 generation.compute、map-file-io、map-adoption-handoff、archive export 与 headless-write 的真实 owner、binding、事务终态和现有 Node 专项；任何共享 result owner 未登记或必须改 canonical owner 的发现先登记并重排。
- 禁止项：不执行浏览器脚本，不修改 `source/`，不接管第二 canonical owner，不提前做 349-10g legacy 删除或最终全门。
- 实现：登记 generation / persistence import / persistence export / headless write 四个唯一 profile owner；新增 TypeScript receipt 契约和统一 runtime validator。生成 / 导入在 handoff 前后双门校验，导出在 Worker session commit 前校验 identity / checksum / byte receipt，headless 成功返回前校验 persisted identity 保持与 revision 精确 `+1`，失败沿既有事务回滚。
- 门禁：专项覆盖 `4` 个 owner、`15` 类负例、新 session、v1 旧档、source 不变、checksum、真实 headless commit；map-file 100k、Worker adoption / archive、headless write / read、document identity、typecheck、build 和 diff check 通过。既有 map-file 夹具的 render binding 单行同步 `topologyRevision: 0`；浏览器执行 `0`。
- 首轮评审：`10b442b / 0.5.46` 为 `BLOCK`，三个 P1 分别是 preload 失败未立即释放 pending session、临时 renderer binding 未核对 topology revision、解包文档的 checksum / cell count 可只与自报 metadata 自洽。`0.5.47` 已覆盖从 Worker 返回到 load 接管前的全部 cleanup，冻结 topology revision，并从真实 cell identity 容器及 document / map 双侧 checksum 核对回执；真实 coordinator 证明失败接纳后下一持久任务可立即运行。
- 终验：同一只读评审职责的干净复审智能体对 `6bcd0cf / 0.5.47` 给出 `ACCEPT`；三个 P1 全部闭合，无剩余 P0 / P1，浏览器执行 `0`。
- 详细证据：[整图 profile 核心切片](./task-349-whole-map-profile-core-slice.md)。下一步进入 349-10g。

### 349-10g — 已接受

- 冻结目标：只移除已有调用证据、唯一 owner / revision / history 门和专项回归共同证明冗余的 legacy adapter、重复 revision / history 路径或影子双写；不按命名或代码年代推断可删除性。
- 首个廉价门：对 identity adapters、MapRevisionTracker / EditHistory、MapCoreEngine shadow facade、领域 runtime、Worker pre-commit validators 与 legacy action 入口建立“定义—引用—正式 owner—测试”矩阵；零引用不自动等于可删除，未知 owner 立即停止该候选。
- 禁止项：不改变算法、wire DTO、公开 API、地图格式或 canonical owner，不批量改名，不执行浏览器脚本，不修改 `source/`，不提前做 349-11 最终全门。
- 实现：定义—引用—正式 owner—测试矩阵只证明 `revisionProfile` 同时为 `0 / 0` 引用且无独立协议职责，已删除该函数及其无用类型导入。四个零产品引用的 headless / persisted / presentation / render-resource adapter 仍承担跨 profile 类型与 runtime 负例，明确保留。新增静态审计固定唯一 `state.map`、单一 revision / history owner、getter-only facade、`1 active / 14 shadow` Manifest、八个 pre-commit validator 与 map-file receipt 无重复实现。
- 门禁：静态审计、core contracts / manifests / facade / dependencies、六组领域协议、notes、whole-map profile、headless write、typecheck 与 production build `1392 modules` 通过；浏览器执行 `0`，`source/` 改动 `0`。
- 动态插入：`regress:markers-core` 连续两次暴露起点夹具漂移——349-10d 的正式 Manifest 已为 `worker / regeneration = required / required`，349-7 夹具仍断言 `not-required / optional`。现行产品契约由 Manifest 与地理网络资源协议门通过，不回退；新增独立阶段 `349-10g-a` 同步夹具。未完成顺序复评为 `349-10g -> 349-10g-a -> 349-11`。
- 首轮评审：`911b0aa / 0.5.49` 为 `BLOCK`。删除 / 保留结论成立，但审计脚本只在 app.js 统计 owner、未实际断言 canonical map、允许 Manifest 分母少一项，并只按旧 helper 名排除重复 metadata；文档还把 markers 正式契约来源误记为 349-8。`0.5.50` 已改为全产品源码 owner 统计、精确两个 `state.map` 赋值点、精确 `15 / 1 / 14` Manifest、map-file 三个结果点共用唯一 metadata builder，并统一更正为 349-10d，待 blocker-only 复审。
- 终验：同一只读评审智能体对 `e628f17 / 0.5.50` 给出 `ACCEPT`；两项 P1 均闭合，删除 / 保留结论成立，无新增 P0 / P1，浏览器执行 `0`。

### 349-10g-a — 已接受

- 插入依据：349-7 的 `regress:markers-core` 仍断言 `worker / regeneration = not-required / optional`，但 349-10d 已为真实 marker regeneration Worker 登记 `required / required`；旧夹具连续两次阻断非浏览器回归。
- 冻结目标：只把该专项的两项 capability 断言同步为已接受的正式 Manifest，不修改 Manifest、领域 runtime、算法、wire、API 或地图格式。
- 首个廉价门：`regress:markers-core`；随后只补 `regress:core-manifests`、`regress:features-networks-resources-core-protocol`、typecheck 与 build。
- 禁止项：不扩大到 marker 行为或展示修正，不执行浏览器脚本，不修改 `source/`，不提前做 349-11 全量终验。
- 实现：专项仍断言 Manifest 为 `shadow`，但把 Worker / regeneration capability 从旧 `not-required / optional` 同步为正式 `required / required`；状态说明改为“command owner 未完整接管前不得虚报 active”。产品 Manifest 与 runtime 改动均为 `0`。
- 门禁：markers presentation 为 `8` 个 canonical / point / picking / DTO / GeoJSON 同源对象，core operations `0`；core Manifest `15 domains / 216 descriptors / 35 negative cases`、地理网络资源协议、typecheck 与 production build `1392 modules` 通过。浏览器执行 `0`，`source/` 改动 `0`，待只读评审。
- 终验：同一只读评审智能体对 `a084d4a / 0.5.52` 给出 `ACCEPT`；产品代码差异为 `0`，范围、契约与文档一致，无 P0 / P1，浏览器执行 `0`。

### 349-11 — 待评审

- 冻结目标：对第 349 项执行最终静态、TypeScript、核心、领域、整图、headless、旧档与 production build 非浏览器终验；形成浏览器验收方案并评估可执行性，但绝不执行该方案。
- 首个廉价门：静态枚举所有拟纳入的命令，拒绝脚本名或命令体含 `browser`、Playwright、Chrome、CDP、Puppeteer、Selenium 或 UI 自动化启动入口；只有通过防误触审计的命令才可执行。
- 方案内容：环境与精确标签页接管、10k / 100k / v1 旧档样本、identity / revision / history / Worker / projection / render / persistence 断言、性能分段、截图、错误面、恢复与清理步骤、预计成本及阻断条件。
- 禁止项：不启动浏览器，不执行任何浏览器命名或实际 UI 门，不修改产品语义，不修改 `source/`，不合入或推送 `main`。
- 实现：新增终验防误触审计，固定 27 个 package gate / 36 个 Node 入口并拒绝浏览器、驱动、Chrome-CDP 与 Vite dev-preview 命令；为 10f 已接受的 map-file IO 与通用 Worker task 补正式 package script。浏览器方案覆盖 10k / 100k / v1 / holey / fault 五类数据，列出候选自动化入口、identity / revision / history / Worker / projection / renderer / persistence 断言、性能阈值、截图、恢复、停止条件和可执行性评估。
- 门禁：27 个非浏览器 gate 全部通过；核心为 `66 fields / 29 sections / 15 domains / 216 descriptors / 19 derived systems`，整图为 `4 owners / 15 negatives`，map-file 100k、通用 Worker 11 result kinds、economy / military-policy 10k / 100k、headless、v1 migration、API data compatibility、typecheck `1077.6ms` 与 build `1392 modules / 1.64s` 通过。完整工具墙钟约 4 分钟；浏览器执行 `0`，`source/` 改动 `0`。
- 详细证据：[最终非浏览器验收](./task-349-final-non-browser-acceptance.md) 与 [浏览器验收方案](./task-349-browser-acceptance-plan.md)。当前冻结 checkpoint，待最终只读评审。
- 详细证据：[旧核心路径收口](./task-349-legacy-core-path-closure.md)。当前冻结 checkpoint，待只读评审。

阶段结果在每次 checkpoint 后更新，长日志只记录命令和 artifact 路径，不粘贴到本文。
