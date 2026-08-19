# 地图核心引擎化与领域模块接入实施计划

> 状态：第 349 项已批准施工计划；当前按 [统一执行记录](./task-349-map-core-engine-execution.md) 逐阶段实施。
>
> 分支：只在 `codex/map-core-engine-architecture-plan` 与 `main` 并行推进，不得合入 `main`。
>
> 施工原则：先盘点与状态机、后契约与 facade；先影子审计、后垂直切片；先低风险领域、后复杂领域；不一次性重写现有 runtime、generator、renderer 和 UI。全阶段不执行浏览器验收，只在最终阶段形成并评估浏览器验收方案。

## 1. 为什么现在需要引擎化

最近的性能、渲染、Worker、重新生成和存档问题并不是互不相关的孤立缺陷，而是持续暴露出同一个架构问题：

```text
地图事实、派生数据、事务提交、Worker 副本、渲染缓存和 UI 状态
目前已经分别存在，但没有由统一的核心契约连接。
```

典型证据包括：

- 100k 视图切换曾把 presentation 状态送入整图 Worker / render preparation 链，真正瓶颈是地图输入和 CPU 几何准备，而不是 WebGL draw；
- GPU 常驻视图改造后，普通颜色 / 主题 / 海底 / 标签操作才恢复为局部 presentation 更新；
- 海洋陆色三角、平滑边界缺面和 surface owner 问题说明 canonical geometry、GPU resource owner、topology revision 和原子安装必须绑定；
- 城镇重生成的主要耗时曾来自数十万路线 picking 引用对象化回绑，而不是城镇生成算法；
- 省份 / 城镇重生成曾被旧省会镜像矛盾拒绝，说明锁、修复、重生成和业务一致性不能混成一个建议性判断；
- 高编号对象、holey 数组、保存回读问题说明对象身份、canonical 存档和导出抢救必须有统一 owner。

因此本计划的目标不是创造一个“大而全的超级类”，而是建立三层稳定边界：

```text
UI / Console API / Headless API
              │ command / query / presentation intent
              ▼
        MapCoreEngine
  canonical state / revision / transaction
              │ committed patch / invalidation intent
              ▼
      MapRuntimeCoordinator
  Worker replica / projection state / persistence
              │ owned snapshot / prepared projection
              ▼
         RenderEngine
  GPU resident data / topology cache / layers
  overlay / picking / export / context restore
```

## 2. 目标与非目标

### 2.1 目标

1. 建立唯一的地图 canonical owner。
2. 将 canonical、derived、presentation、cache 四类数据分开。
3. 用 canonical revision vector、operation binding、presentation revision 和 render resource binding 分别表示地图事实、运行令牌、显示意图和资源代际。
4. 将 edit、regenerate、import、undo、redo、adoption 统一为 commit envelope。
5. 将 field、derived system、index、render layer 和 query 的依赖关系注册化。
6. 让 Worker 成为计算和副本执行者，不绕过 core 正式提交。
7. 让纯视图切换不触发地图 Worker、整图 snapshot 或全量 render preparation，并让 headless 模式不依赖 renderer 才能提交 canonical 事务。
8. 让新增业务域按自身 capability 明确拥有或明确不需要 schema、Worker、重生成、查询、视图、图层、面板、编辑逻辑和存档迁移。
9. 保持旧 API、旧存档、撤销 / 重做、锁与非浏览器回归；picking、PNG、WebGL 视觉和性能门在本任务中形成待执行方案。
10. 让新增功能可以通过领域 Manifest 审计其完整接入面。

### 2.2 非目标

- 不迁移或修改 `source/`；
- 不首期把地图权威所有权迁到 Worker；
- 不一次性移动所有现有文件；
- 不使用全局 event bus、ECS 或不可追踪的隐式响应式状态替代事务；
- 不因引擎化改变生成算法、业务语义或视觉精度；
- 不用删图层、减标签、降 picking、隐藏预热或放宽 LongTask 阈值换取成绩；
- 不将 UI、相机、Loading 文案、Worker 会话所有权和 WebGL 资源管理塞进 MapCoreEngine；这些由 App shell、MapRuntimeCoordinator 和 RenderEngine 分别负责；
- 不在本分支合入或推送 `main`，不执行浏览器验收。

## 3. 当前模块到目标职责的映射

| 当前能力 | 当前主要位置 | 目标职责 |
| --- | --- | --- |
| 应用组装、面板、runtime action | `runtime/app.js` | App shell / legacy adapter / core composition root |
| canonical map | `state.map` 及各 map section | MapCore canonical owner |
| revision / history | `map-revision.js`、`edit-history.js` | Core revision / transaction / history adapter |
| domain patch | `domain-patch.js`、各领域 Worker task | Core patch validation / commit |
| map snapshot transaction | `map-snapshot-transaction.js` | Core replacement transaction |
| Worker session / ACK / checksum | `worker-task-coordinator.js`、`compute-worker.js` | Runtime coordinator worker boundary |
| field / transport / save registry | `canonical-map-field-registry.js` | Canonical schema / patch / persistence registry |
| render preparation | `render-preparation.js` | Render preparation adapter |
| prepared install / GPU owner | `prepared-render-installer.js` | RenderEngine resource transaction |
| surface / cell attribute / topology cache | `renderer/*` | Render cache and layer implementation |
| layer visibility / view mode / theme | renderer + app actions | Presentation state registry |
| API / schema / capability | `console-api.js`、`api-contract.js`、`api-schema-registry.js` | Core action / query adapters |
| panel callbacks | `runtime/app.js`、`ui/` | Panel registry + UI shell |

现有模块不需要立即移动。第一阶段先盘点真实 owner、事务和失败恢复，不创建 adapter；后续只增加薄 contract / adapter，避免出现第二份地图状态。

## 4. 四类数据模型

### 4.1 Canonical

地图事实和业务规则直接修改的来源，例如：

- grid / pack 拓扑与坐标；
- 高度、气候、feature、河流；
- 国家、省份、城市、路线、经济、外交、军事；
- markers、zones、notes、measurements 等持久用户对象。

canonical 数据进入地图 revision，具有明确的对象身份、引用和存档规则。

### 4.2 Derived

可以从 canonical 重建的业务结果，例如：

- 行政 / 社会镜像；
- route / city / object picking index；
- 贸易流、市场索引、影响范围；
- 派生 stale 状态和局部影响范围。

derived 数据可以选择持久化，但必须明确可重建方式、来源 revision 和失效条件。

### 4.3 Presentation

只影响当前显示，不改变地图事实，例如：

- color mode；
- theme；
- layer visibility；
- smooth / ocean-height / label budget；
- camera、viewport、selection、hover、highlight。

presentation 变化不推进 canonical map revision，不产生 undo，不发布地图 replica patch。

### 4.4 Cache / resource

运行时资源，例如：

- WebGL buffer、texture、program；
- surface base、cell attribute store、political topology cache；
- overlay DOM node、label layout、picking bucket；
- Worker retained session。

cache 必须绑定专用的 `RenderResourceBinding`，至少包含 `mapIdentity + sourceRevision + topologyRevision + renderGeneration`，不得把 operation token 或 lock fingerprint 伪装成 canonical revision。

## 5. MapCoreEngine 职责

### 5.1 核心接口

```text
core.execute(command)
core.inspect(command)
core.regenerate(request)
core.query(name, input)
core.snapshot(options)
core.presentation.set(intent)
core.history.undo()
core.history.redo()
core.persistence.export()
core.worker.status()
core.commit.last()
```

### 5.2 必须负责

- 只读 snapshot 和 query；
- command inspect / execute / revert；
- revision 推进；
- commit envelope 创建；
- write set / lock / checksum / binding 验证；
- dependency graph 失效计划；
- 为 runtime coordinator 产生 owned snapshot、committed patch 和 invalidation intent；
- canonical history、revision 和 commit identity 的原子一致性；
- publish 前 cancel / obsolete / failure / rollback 的一致性。

### 5.3 不负责

- DOM、面板布局、Loading 文案；
- canvas pointer event 和 camera 拖动；
- shader、buffer、texture 的具体实现；
- 领域算法本身；
- 某个 layer 的颜色、图形和视觉设计。

### 5.4 MapRuntimeCoordinator 职责

`MapCoreEngine` 只决定 canonical 事务是否接纳以及产生什么 commit / invalidation；`MapRuntimeCoordinator` 负责把已接纳事实投影到 Worker replica、renderer、persistence dirty state 和交互运行时。

- interactive、headless、worker-only 使用不同 projection profile；headless 没有 renderer 也能完成 canonical commit；
- 可失败投影尽量在 canonical publish 前 prepare；publish 后失败进入 `degraded / retry / resync`，不得悄悄反向改写已观察的 canonical history；
- Worker snapshot / patch 发布、replica ACK / resync、renderer invalidation / install 和 persistence dirty projection 只由 coordinator 负责；
- facade 只做组合入口，不成为 service locator，不拥有第二份 map、history 或 renderer state。

## 6. Revision vector 与提交协议

### 6.1 Revision vector

```js
{
  mapIdentity,
  mapRevision,
  topologyRevision,
  domainRevisions: {
    terrain,
    climate,
    politics,
    settlements,
    economy,
    tradePolicy
  }
}
```

规则：

- 换图改变 `mapIdentity`，不能伪装为普通 revision + 1；
- canonical 写入推进 `mapRevision`；
- grid / pack topology、坐标或身份变化推进 `topologyRevision`；
- 领域局部重建推进对应 `domainRevisions`；
- undo / redo 产生新的单调 `mapRevision`，不能把 canonical revision 倒回旧值；
- 纯显示状态使用独立 `PresentationRevision`；
- GPU context restore 或资源全量替换使用独立 `RenderResourceBinding.renderGeneration`；
- `generationToken` 和 `lockFingerprint` 属于 `OperationBinding`，不参与 canonical revision vector。

### 6.2 Commit envelope

所有正式地图变化都产生：

```js
{
  commitId,
  kind: "edit | regenerate | import | undo | redo | adoption",
  source: "ui | api | worker | storage",
  beforeRevision,
  afterRevision,
  beforeChecksum,
  afterChecksum,
  writeSet,
  affected,
  invalidatedSystems,
  rebuiltSystems,
  workerPatchIds,
  renderReuse,
  renderRebuild,
  historyPolicy,
  persistenceDirty,
  timings
}
```

commit envelope 不保存完整地图，也不内联无上限对象 / cell 清单；`affected` 使用有界摘要、范围或 artifact 引用。checksum 必须声明 canonical 字段范围和增量 / 完整计算策略。该对象不进入普通用户文案，只供 core、runtime coordinator、history、API 和 debug 共享。

## 7. Dependency Registry

### 7.1 描述格式

```js
{
  id: "trade-policy-effects",
  kind: "derived-domain",
  reads: ["tradePolicy.policies", "politics.states", "economy.markets"],
  writes: ["tradePolicy.effects", "economy.deals"],
  invalidatedBy: ["tradePolicy.policies", "politics.states", "economy.markets"],
  scope: "affected-objects | affected-cells | full-map",
  rebuild: "worker | main-thread | gpu-patch",
  reuseAcrossPresentation: true,
  verify: "verifyTradePolicyEffects"
}
```

### 7.2 依赖图必须提供

- 字段和系统唯一 ID；
- reads / writes 静态审计；
- 未声明依赖拒绝或默认 full rebuild；
- 从 write set 推导 invalidation plan；
- 从 affected objects / cells 推导局部范围；
- 明确 presentation-only 快路径；
- 输出 Loading 阶段、数量和耗时；
- 生成领域回归矩阵。

首期允许 `full-map`，但不能隐式 full-map；必须记录原因、数据规模和耗时，以便后续收窄。

## 8. Worker 架构

### 8.1 Worker 的三种角色

#### 业务计算 Worker

负责领域重生成、局部重算、修复和复杂派生计算。

#### 地图副本 Worker

负责保持 canonical replica、消费提交 patch、ACK revision / checksum 和在必要时 full resync。

#### 渲染准备 Worker

只在 topology、对象身份或 geometry 真正变化时准备 render bundle。纯 view mode、theme、palette、visibility 不得强行进入此链路。

### 8.2 统一 binding

```js
{
  mapIdentity,
  sourceRevision,
  operationId,
  operationName,
  generationToken,
  lockFingerprint,
  replicaId,
  taskId,
  sourceChecksum
}
```

Worker 计算阶段尚无正式 commit，统一 binding 不得要求 `commitId`。只有消费已提交 patch 的 replica projection 才携带 `commitId`。

### 8.3 统一 Worker result

```js
{
  binding,
  resultKind: "patch | replacement | render-prepared | query",
  patch,
  replacement,
  prepared,
  affected,
  checksum,
  timings,
  diagnostics
}
```

### 8.4 正式提交顺序

```text
core capture owned source snapshot
→ Worker compute
→ validate binding / lock / patch policy
→ build dependency invalidation plan
→ prepare required projections without publishing
→ core atomically commit canonical patch + history + revision
→ publish commit to UI / API / persistence
→ runtime coordinator settle replica / renderer projections
→ failed projection enters retry / resync without rewriting published history
```

提交生命周期固定为：

```text
planned → computed → validated → projections-prepared
→ canonical-committed → published → projections-settled
```

Worker 不得绕过 core 直接覆盖正式地图或 GPU 资源。

## 9. RenderEngine 与 layer contract

### 9.1 Layer descriptor

```js
{
  id: "trade-policy-flow",
  order: 220,
  source: ["tradePolicy.effects", "settlements.routes"],
  dependsOn: ["route-geometry", "topology"],
  presentation: ["theme", "visibility", "colorMode"],
  cacheKey,
  prepare,
  install,
  patch,
  draw,
  pick,
  export
}
```

### 9.2 强制规则

- layer 只能读取 snapshot；
- layer 不写 canonical map；
- layer 不自行调用业务 Worker；
- presentation-only 变化优先更新 uniform、palette、visibility；
- topology / identity 变化才允许重建 geometry / picking；
- resource 必须绑定 map identity、revision 和 render generation；
- install 必须有 prepare / commit / rollback / finalize；
- 单 layer 失败不能损坏其它已提交 layer；
- picking、视觉和 API 查询使用一致 identity / geometry version；
- overlay 节点使用稳定 key，不因普通视图切换全量替换。

## 10. DomainModuleManifest

### 10.1 目标

新业务域必须通过一个 Manifest 声明其完整 capability 面：需要的能力必须注册，不适用的 Worker、regeneration、view 或 layer 也必须显式声明 `not-required / unsupported`，避免新增功能只接了 UI 或只接了 Worker，也避免为了形式完整制造无业务意义的入口。

### 10.2 Manifest 内容

```js
{
  id: "trade-policy",
  version: 1,
  status: "shadow",
  canonicalSections: ["tradePolicy"],
  derivedSystems: ["trade-policy-effects", "trade-policy-index"],
  commands: ["trade-policy.set", "trade-policy.delete"],
  regeneration: ["trade-policy.regenerate"],
  workerTasks: ["trade-policy.compute"],
  queries: ["trade-policy.list", "trade-policy.get"],
  views: ["trade-policy"],
  layers: ["trade-policy-flow"],
  panels: ["trade-policy-panel"],
  persistence: ["tradePolicy"],
  api: ["tradePolicy.*"],
  locks: ["trade-policy-object"],
  regression: {
    gates: ["regress:trade-policy"],
    coverage: ["save", "undo", "worker", "regeneration", "view", "layer", "failure"]
  },
  capabilities: {
    worker: "required",
    regeneration: "required",
    view: "required",
    renderLayer: "required"
  },
  capabilityReasons: {}
}
```

### 10.3 注册器必须审计

- canonical section 是否进入 field registry；
- command 是否有 write set、history、revert；
- regeneration 是否有 source revision、lock policy、replacement policy；
- Worker 是否有 binding 和 patch policy；
- derived system 是否有 reads / writes / invalidation；
- layer 是否只读取声明字段；
- panel 是否只调用注册 command / query；
- persistence 是否有 migration、backfill、旧样本；
- API 是否绑定已注册 command / query / regeneration，并进入 schema、capability、错误码和文档矩阵；
- regression 是否覆盖 save、undo、worker、view、layer 和 failure。

## 11. 新业务域完整接入流程

本节描述 capability 的全集，不要求每个领域全部实现。注册器只对 Manifest 声明为 `required / optional` 的能力执行对应审计；`not-required / unsupported` 必须附理由并由专项回归证明没有隐藏调用点。

以下以新增“贸易政策”为例。

### 11.1 定义 canonical 与 derived

```text
tradePolicy.policies  canonical，持久化
tradePolicy.effects   derived，可由 policies 重建
tradePolicy.index     derived index，运行时缓存
tradePolicy.view      presentation
GPU / picking         cache / resource
```

首先定义对象 ID、引用空间、默认值、空值、持久化版本和迁移方式。

### 11.2 实现编辑命令

```text
inspectSetTradePolicy
→ createSetTradePolicyCommand
→ core.execute
→ validate locks / references / write set
→ canonical commit
→ history / replica / dependency / render
```

每个 command 必须声明：

- domain；
- write set；
- affected objects / cells；
- derived systems；
- history domain；
- undo / redo；
- lock policy；
- expected revision；
- failure / rollback behavior。

### 11.3 实现独有重新生成

业务域不能只复用一个泛化“重新生成”按钮，而要实现独有的 regeneration plan：

```js
{
  domain: "trade-policy",
  mode: "from-empty | repair | localized | preserve-locked",
  sourceRevision,
  seed,
  affectedStates,
  protectedObjects,
  lockedObjects,
  writeSet,
  replacementPolicy,
  identityPolicy,
  downstreamSystems
}
```

执行过程：

1. core 根据当前 snapshot、锁、对象引用和业务输入生成 plan；
2. Worker 只读取 plan 指定的 snapshot；
3. Worker 计算新政策、影响范围和派生结果；
4. Worker 返回 patch 或 replacement，不修改正式地图；
5. core 校验 binding、checksum、锁和 write set；
6. core 原子提交并生成 history；
7. replica 消费同一个 commit patch；
8. dependency graph 只失效命中的 derived / layer；
9. renderer 进行局部或完整的原子安装；
10. panel、API、Loading 和 debug 观察同一 commit。

至少测试 from-empty、repair、localized、preserve-locked、取消、过期、冲突、Worker restart、undo / redo 和旧数据。

### 11.4 实现独有视图

如果只是 cell 着色：

- 注册 view mode；
- 读取既有 canonical / derived attribute；
- 使用 GPU palette / uniform；
- 不传整图、不启动业务 Worker、不重建 surface geometry。

如果需要新几何：

- 注册独立 layer；
- 声明 geometry source、cache key、topology 依赖；
- 支持 prepare / install / patch / draw / pick / export；
- 为业务 commit 提供 invalidation；
- 保留普通 view 的快路径。

### 11.5 实现独有编辑面板

Manifest 声明：

- panel id；
- selection kind；
- query；
- command；
- regeneration action；
- refreshOn commit domain；
- Loading / error / stale 处理。

面板自己负责业务布局和交互，但不能直接修改 `state.map`，不能自己管理 Worker，也不能自己拼接历史记录。

### 11.6 实现查询与 API

查询必须：

- 只读；
- 绑定 map identity 和 revision vector；
- 对异步 stale 结果明确拒绝或标记；
- 大结果分页或限制上限；
- 不推进 revision、history、renderer 或 replica patch。

公开 API 还需登记输入 schema、输出 schema、错误码、确认策略、能力矩阵和 AI / headless 文档。

### 11.7 实现存档和旧数据

- canonical field registry；
- map document migration；
- old sample backfill；
- 新旧格式 round-trip；
- JSON / gzip / v3 容器；
- 导出、导入、损坏定位；
- holey identity、旧缺字段和旧引用修复。

新增领域没有旧数据时，也要先定义缺失字段默认值和迁移版本，不能让旧地图读取依赖“字段肯定存在”。

## 12. 统一分阶段施工顺序

唯一阶段权威见 [第 349 项执行记录](./task-349-map-core-engine-execution.md)。两份专题不得再维护相互冲突的独立顺序。

1. `349-0`：校正计划、登记权威任务、冻结无浏览器与评审规则。
2. `349-1`：只读盘点 owner、现有事务状态机、snapshot / buffer ownership、checksum 成本、interactive / headless 差异；未确定 owner 为阻断。
3. `349-2`：引入受限 TS 工具链；不迁移业务实现。
4. `349-3`：实现 identity、revision、operation、snapshot ownership、commit lifecycle 类型与 runtime validator；不接管旧 action。
5. `349-3a`：补全 canonical field registry，分离 persisted / live presentation，定义普通 persisted document identity 的派生 / 默认值 / 迁移，并建立 runtime session、document、render preparation 与 headless identity adapter；不实现 Manifest。
6. `349-4`：实现 capability-aware Manifest、注册器和影子审计；不改变运行路由。
7. `349-5`：实现薄 `MapCoreEngine + MapRuntimeCoordinator` facade，在影子模式产生 commit / projection 记录。
8. `349-6`：迁移 notes 的 command / history / query / persistence / API 切片，明确声明无需 Worker、regeneration 和 render layer。
9. `349-7`：迁移 markers 的 presentation / layer / picking 切片，不伪造重生成能力。
10. `349-8`：以 `population.compute` 为默认真实 Worker task，迁移 binding / result / patch / ACK / resync；替换 pilot 必须重新登记理由。
11. `349-9`：接入 dependency registry、projection 状态和局部失效；未知依赖显式 full rebuild。
12. `349-10a`：迁移 terrain / grid / height-derived / climate / ocean / topology 基础域。
13. `349-10b`：迁移 society / politics 与 pack mirror。
14. `349-10c0`：动态插入；分离领域内 Worker binding descriptor id 与真实共享 transport task id，以 `task + resultKind` 作为唯一 owner key，不改 wire DTO 或 runtime registry。
15. `349-10c`：迁移 settlements / zones / labels / measurements。
16. `349-10d`：迁移 routes / rivers / features / resource markers；首门固定复现并修复锁定 Feature 的港口引用在 `cities-routes` 后从 `382 → 366` 的引用丢失，不得把引用集合从锁保护中删除。
17. `349-10e`：迁移 economy / diplomacy / military。
18. `349-10f`：收口 generation / import / adoption / export / headless profile。
19. `349-10g`：移除已证明冗余的 legacy adapter、重复 revision / history 路径和影子双写。
20. `349-11`：执行 build、typecheck 和非浏览器回归终验，形成完整浏览器验收方案但不执行。

`349-1` 的现状证据、ADR、身份命名空间、`13` 个 Worker task 分类和阶段插入依据见 [核心架构盘点](./task-349-core-architecture-inventory.md)。

每阶段主线程唯一写入，静态 / 专项 Node 门通过并 checkpoint 后，由同一只读评审智能体给出 `ACCEPT / BLOCK`。计划外必需项插入新的 `349-x` 子阶段，并重新排序全部未完成阶段。

## 13. 验证矩阵

### 13.1 静态门

- field、domain、derived、layer、panel、API ID 唯一；
- dependency reads / writes 完整；
- Worker result kind、binding、patch policy 完整；
- command 有 inspect / execute / revert 或明确不可撤销原因；
- 新领域 Manifest 不缺必填入口；
- API schema / capability / documentation 同步；
- `source/` 零改动；
- build、syntax、diff check 通过。

### 13.2 Node 门

- revision vector 单调性；
- identity 换图规则；
- patch apply / inverse / rollback；
- checksum mismatch / gap / duplicate；
- lock conflict；
- dependency plan；
- full / local / presentation-only 分类；
- layer cache key；
- old-data migration；
- identity 稠密化和 holey legacy；
- failure injection。

### 13.3 浏览器小数据方案（本任务只设计，不执行）

固定 10k 地图覆盖：

- generation、import、restore；
- 新领域新增 / 修改 / 删除；
- 全量、修复、局部重生成；
- view mode、layer、selection、hover、picking；
- panel、API、undo / redo；
- save / load、PNG、旧格式；
- Worker restart、context loss / restore；
- Loading、health、console、page、WebGL error。

### 13.4 浏览器大数据方案（本任务只设计，不执行）

固定 100k 地图覆盖：

- cold / warm / cross-task replica；
- patch bytes、checksum、ACK；
- 100k 重生成尾部索引耗时；
- view input `0` 和 render preparation `0` 的纯展示门；
- topology change 的完整几何门；
- save / restore、旧档、holey identity；
- cancel、background stall、Worker restart；
- visual / PNG / picking 同源。

## 14. 性能验收口径

新增引擎层不能成为性能免责理由。每个动作至少分成：

```text
core inspect
→ snapshot / patch encode
→ Worker input
→ domain compute
→ Worker output
→ patch validate / commit
→ derived index
→ render prepare / install
→ GPU draw
→ UI refresh
```

必须区分：

- presentation-only 是否 `map input = 0`；
- 是否 `render.prepare = 0`；
- surface geometry 是否复用；
- overlay / picking 是否复用；
- 派生索引是否局部；
- 首次、暖态、revision 变化和 session 失效。

不得把类型检查、构建时间或后台预热伪装成产品交互时间，也不得把 Loading 完成提前到正式提交之前。

## 15. 风险与处理

| 风险 | 处理 |
| --- | --- |
| 产生第二份 map store | facade 只包装现有 canonical owner，禁止第二权威状态 |
| Dependency registry 漏项 | 未知依赖默认 full rebuild，并要求静态审计和故障注入 |
| Worker 新旧结果竞态 | 统一 operation binding + source revision + checksum；过期结果拒绝提交，正式接纳后才产生 commitId |
| Render layer 失败污染上一帧 | prepared install 双缓冲、owner 引用计数、rollback 保留上一资源 |
| 新业务数据保存不兼容 | registry、migration、backfill、old sample、round-trip 同步完成 |
| 新领域只注册了 UI | Manifest 按 capability 审计 schema / history / persistence / regression；只有声明需要时才强制 Worker / regeneration / layer |
| 迁移范围失控 | 每阶段只迁移一个边界，保留 legacy adapter |
| 复杂领域试点失败 | 先使用 markers / notes / measurements，不首期改政治拓扑 |
| 性能退化 | 每阶段 paired profile，纯 display 和 full rebuild 分开验收 |

## 16. 回滚策略

- core facade 可以切回 legacy runtime action；
- dependency plan 不确定时使用完整重建，禁止不可信局部复用；
- Worker patch gap / checksum 错误时销毁 session 并一次 full resync；
- renderer install 失败保留上一帧和上一组 GPU owner；
- publish 前 canonical commit 或 prepared projection 失败时恢复 canonical / history 并释放未发布投影；publish 后 replica / renderer 失败只进入 degraded / retry / resync，不反向恢复已观察的 canonical history；
- 新领域 layer / panel / API adapter 可独立关闭，不影响既有地图；
- 新存档字段迁移失败保留原始输入，不覆盖用户地图。

## 17. 与 TypeScript 计划的关系

TypeScript 不是独立重构目标，而是核心契约的实现手段。推荐并行关系：

```text
引擎化计划：决定 owner、revision、事务、依赖、Worker、layer、panel 的边界
TypeScript 计划：把这些边界变成可检查的类型和 Manifest
```

先冻结引擎契约，再在 `src/core/contracts` 中用 TS 表达：

- `RevisionVector`；
- `MapSnapshot`；
- `DomainPatch`；
- `CommitEnvelope`；
- `WorkerBinding` / `WorkerResult`；
- `DomainModuleManifest`；
- `RenderLayerDescriptor`；
- `PanelDescriptor`。

不能先做大规模 TS 改名，再反过来猜领域边界。

## 18. 推荐首个试点

不再要求一个“全能试点”同时证明所有能力，改为两个独立垂直切片：

- `notes`：验证 command、history、query、panel、API、persistence 和旧数据；明确声明无需 Worker、regeneration、view 和 layer；
- `markers`：验证 canonical identity、presentation、layer、picking、export 和 context-restore source contract；不伪造独有 Worker 或重生成。

另在 `349-8` 选择一个真实现有 Worker task 独立验证 Worker 协议。这样可以区分核心事务、渲染和跨线程问题，不把框架失败与业务复杂度混在一起。

选择这些切片的原因是：

- 业务边界相对独立；
- 对底层拓扑依赖较少；
- 可以完整覆盖创建、编辑、删除、查询、面板、存档和 undo / redo；
- 可以验证 Worker 是否必要；
- 可以验证一个简单 view / layer；
- 失败时不会影响政治、城市、路线和地形主链。

不建议首个试点使用城市、路线、河流、政治拓扑或地形，因为这些领域同时承担复杂身份、几何、锁、派生和高数据量压力，无法快速区分框架问题与业务问题。

## 19. 完成标准

本架构计划不以“文件夹建出来”作为完成，而以以下结果为完成：

1. 核心 owner、revision、commit、dependency、Worker、render layer 边界可被静态审计；
2. notes、markers 和一个真实 Worker task 三个切片合计通过 Manifest 覆盖事务 / persistence、renderer / picking 和 Worker 协议；
3. 每个领域只实现其 `capabilities` 声明的能力，不为完整表面人工制造无业务意义的 command、regeneration、Worker、view 或 layer；
4. 纯 view 不触发地图计算；
5. 业务 commit 能正确驱动 replica、derived、renderer、history 和 UI；
6. 旧地图、旧存档、旧 API、撤销 / 重做通过非浏览器回归；真实浏览器行为只形成待执行方案；
7. 10k / 100k 性能、视觉、picking、PNG、Worker restart、context restore 和错误面形成完整浏览器验收方案并通过可执行性评估，本任务不实际运行；
8. 复杂领域仍可在不破坏既有领域的前提下逐个迁移。

## 20. 分支与验收约束

1. 本计划只在 `codex/map-core-engine-architecture-plan` 实施并保留独立 checkpoint；
2. 不合入或推送 `main`；
3. 不执行真实浏览器、视觉或 WebGL 门；
4. 浏览器验收所需入口、数据、断言、性能阈值、截图与恢复步骤在 `349-11` 写入文档并评估可执行性；
5. 每个实现阶段冻结后必须先通过只读评审智能体，才能开始下一阶段；
6. 计划外必需项必须显式插入阶段记录，不能以“顺手修复”混入当前 checkpoint。

## 21. 最终建议

应该引擎化，也应该引入 TypeScript，但二者的先后关系是：

```text
先明确引擎边界
→ 用 TS 固化核心契约
→ 用 Domain Manifest 约束新领域
→ 用低风险领域试点证明接入方式
→ 再逐个迁移 Worker、renderer 和复杂业务域
```

最重要的成果不是增加一个 `MapEngine` 类，而是让未来新增一种业务数据时，能够按照统一清单快速接入，并且不会再次漏掉 Worker、重生成、视图、图层、面板、编辑、历史、存档和验收中的某一环。
