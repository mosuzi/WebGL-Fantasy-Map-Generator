# 第 349-1 阶段：地图核心架构现状盘点与 ADR

> 状态：`ACCEPT`；只读评审智能体首轮指出三项事实偏差，最窄修正后复审通过。

> 范围：只记录现有实现、冻结后续契约方向和阶段依赖；本阶段产品代码与工具代码改动均为 `0`。本文不执行也不要求浏览器验收。

## 1. 结论

现有应用已经具备 revision、history、全图快照事务、Worker replica、prepared renderer transaction 和 headless write transaction，但它们分别生长在 runtime、Worker、renderer 和 headless API 内，还没有一个统一的 canonical commit 词汇和投影状态模型。

本次重构不应新建第二份地图状态。互动运行时的唯一 canonical owner 继续是 `createGeneratorApp` 闭包中的 `state.map`；每个 headless write session 在创建时 clone 一份隔离文档并在后续请求间持续持有，只是另一种运行 profile，不是互动地图的并行 owner。`MapCoreEngine` 先作为现有 owner 上的薄事务 facade，`MapRuntimeCoordinator` 负责 Worker、renderer、persistence 和 UI/API 投影。

盘点确认两项后续阶段的强制前置工作：

1. canonical field registry 未覆盖存档中已经存在并由 `map-file-io` 迁移的 `notes`、`measurements`、`labels`、`visualTheme`、`display`；在修复前，Manifest write-set、checksum 和 persistence 完整性不能被证明。
2. runtime session identity、尚待定义的普通 persisted document identity、render preparation identity 和已有的 headless document identity 语义不同；在统一 Worker binding 前必须以显式类型和 adapter 隔离，不能继续都称作 `mapIdentity`。

因此在 `349-3` 与 `349-4` 之间插入独立阶段 `349-3a`，先闭合字段注册表和身份 adapter，再建立 Manifest 影子审计。

## 2. 证据边界

本阶段定向读取以下正式入口，不把旧日志或生成报告当作当前实现：

- interactive owner / revision / history：`app/webgl-generator/src/runtime/app.js`、`map-revision.js`、`edit-history.js`；
- snapshot transaction / operation：`map-snapshot-transaction.js`、`runtime-operation.js`；
- Worker registry / protocol / replica：`worker-task-registry.js`、`worker-task-protocol.js`、`worker-task-coordinator.js`、`compute-worker.js`；
- canonical registry / checksum / journal：`canonical-map-field-registry.js`、`map-replica-checksum.js`、`map-replica-journal.js`；
- renderer transaction / owner：`prepared-render-installer.js`、`surface-base-buffer-set.js`、`render-preparation.js`；
- persistence / adoption：`map-file-io.js`、`map-file-io-worker-task.js`、`map-adoption-handoff.js`；
- headless：`headless-map-api.js`、`headless-write-api.js`；
- invalidation：`edit-refresh-scheduler.js` 及 `app.js` 的 derived stale / fresh 接线；
- first slices：`note-edit-commands.js`、`object-notes.js`、`marker-edit-commands.js`。

## 3. Owner 与运行 profile

| 状态 / 资源 | 当前 owner | 现有提交或替换入口 | 后续归属 | 结论 |
| --- | --- | --- | --- | --- |
| 互动 canonical map | `createGeneratorApp` 内 `state.map` | edit command、snapshot transaction、map replacement | `MapCoreEngine` facade 包裹现有引用 | 唯一 owner，不复制 |
| 互动 canonical revision | `MapRevisionTracker` | history mutation 后 `advance()`；换图时 `replaceMap()` | core revision contract | runtime session 级，不持久化 |
| undo / redo history | `EditHistory` | command apply / revert | core history adapter | 与 map mutation 必须同一事务边界 |
| 运行操作取消 / rollback | `RuntimeOperation` | `run` / `runSync` | coordinator operation adapter | operation id 不是 commit id |
| Worker replica | persistent `MapWorker` session | patch / ACK / resync / adoption commit | coordinator projection | 只是一份投影，不能成为 canonical owner |
| renderer resources | renderer + prepared installer transaction | prepare / commit / rollback / finalize | coordinator render projection | buffer owner 要与 binding 同时验证 |
| persistence bytes | export task / browser storage | serialize / compress / write | coordinator persistence projection | 当前没有统一 dirty / settled 状态 |
| read-only headless | normalized document/map | query only | core query profile | revision 当前固定为空 / `0` |
| write headless | 每 write session 隔离 document + `HeadlessHistory` | 请求间持续修改 `currentDocument`；每请求 before image rollback | core headless profile | 不与 interactive 同时拥有同一 map |
| live UI selection / panels | runtime state / panels | command 后刷新 | coordinator UI projection | 非 canonical map 内容 |
| live display intent | renderer / runtime display state | display action | presentation projection | 与持久化 display 配置区分 |

### 3.1 唯一 owner 不变量

- interactive 模式下，所有新 facade 都接收现有 `state.map` 的 getter / transaction adapter，不长期缓存第二份 map。
- headless 模式可以拥有隔离 document，因为它没有挂接 interactive runtime；提交结果是新 document revision，不反写任何活动页面。
- Worker、renderer、persistence、UI 都只能消费 canonical snapshot / patch / commit，不得以本地成功状态反向定义 canonical history。
- `read-only-map-core.js` 保留为 query helper；它不是新的 `MapCoreEngine`，后续不得借同名概念把 summary helper 扩成 owner。

## 4. 身份与 revision 命名空间

| 命名空间 | 当前来源 | 生命周期 | 当前风险 | 冻结名称 |
| --- | --- | --- | --- | --- |
| interactive map identity | `MapRevisionTracker` 随 `replaceMap()` 生成 | 一次 runtime map session | 未写入文档，但 Worker binding 称作 `mapIdentity` | `RuntimeMapSessionId` |
| canonical revision | `MapRevisionTracker.revision` | 同一 runtime session 内单调递增 | 与 presentation revision、headless revision 混称 | `CanonicalRevision` |
| persisted document identity | 普通 `createMapDocument` 尚无稳定 id；仅 headless metadata 明确持久化 `documentId` | 普通存档待定义；headless 可跨请求 / 保存 | 可选 metadata fallback 不能冒充既有稳定文档身份 | `PersistedDocumentId`（`349-3a` 定义、派生并迁移） |
| headless document revision | `metadata.headlessWrite.revision` | headless 文档写序列 | 与 interactive revision 无共同时间线 | `HeadlessDocumentRevision` |
| render preparation identity | generated/imported/operation binding | 一次 prepared resource transaction | 暂态值可能伪装成 canonical identity | `RenderPreparationId` |
| presentation revision | live display / viewport intent | 页面显示序列 | 当前未形成独立统一字段 | `PresentationRevision` |
| operation id | `RuntimeOperation` / Worker operation binding | 一次尝试，可取消或失败 | 计算阶段误用 commit 语义 | `OperationId` |
| commit id | 尚无统一 core commit id | 成功 canonical commit | 不得在 Worker compute 前生成 | `CommitId` |

冻结规则：类型层禁止这些标量结构兼容；JS adapter 必须显式构造。`ComputedDomainPatch` 只携带 operation binding 和 base revision；`CommittedDomainPatch` 只有在 canonical 接纳后才获得 `commitId` 与 target revision。

## 5. 现有事务状态机

### 5.1 普通同步 command

```text
capture before → command.apply(state.map) → history push
→ revision.advance → replica patch queued → domain refresh / panels
```

现状：canonical mutation 与 history/revision 已绑定，但 command 后 UI / renderer 刷新没有统一 projection 状态。后续 facade 必须先影子记录，不改动既有 command 行为。

### 5.2 全图 snapshot mutation

```text
structuredClone(map) + history snapshot
→ mutate live map → capture after
→ restore history → install whole-map history command
failure → restore whole map + history
```

现状：安全但成本高；快照属于 `exclusive-clone`。在 declared write-set 未稳定前保留该路径，不把全图 clone 立即替换成 patch。

### 5.3 Worker map mutation

```text
capture binding / render request
→ Worker compute in persistent map-mirror session
→ validate binding / result / stale state
→ command + history canonical mutation under guard
→ prepared renderer commit + UI refresh
→ Worker session commit / ACK
failure before return
→ renderer rollback + command/history rollback + UI restore + session invalidate
```

现状：这是当前最强的跨投影原子路径。`349-5` 先按现状把对外可观察点影子映射到统一 lifecycle，不在没有专项证据时提前移动 publish boundary。

### 5.4 map replacement / import / generation adoption

```text
capture old map/options/revision/history/selection
→ prepare worker result / renderer install
→ assign state.map + reset runtime state
→ install renderer + refresh UI
→ MapRevisionTracker.replaceMap()
→ commit Worker adoption → ready
failure → restore old map/reference/options/revision/history/renderer/UI
```

现状：换图不是普通 revision `+1`，而是新 runtime map session。adoption 的暂态 render identity 不得持久化为 runtime session identity。

### 5.5 headless write

```text
create session 时 clone input document
→ 每请求保存 serialized before image → build existing JS command
→ apply to session document → increment headless revision
→ persist headless metadata + history
failure → parse before bytes → restore revision/history
```

现状：事务语义和 interactive 重复但运行环境不同。先共享 contract / validator，再在 `349-10f` 收口 adapter；不要求 renderer、DOM 或 Worker。

### 5.6 export / persistence

```text
snapshot current canonical map
→ normalize / serialize / compress
→ return bytes → optional browser storage write
```

现状：export 读取 canonical map，但没有统一的 persistence projection revision / dirty / failed 状态。`archive-export` 还复用了 regeneration Worker 的 persistent session；后续必须分类为 persistence capability，不能仅按 task 文件名推断语义。

## 6. 统一 lifecycle 与当前路径的映射

目标 lifecycle 保持：

```text
planned → computed → validated → projections-prepared
→ canonical-committed → published → projections-settled
```

| 状态 | 当前可观察事实 | 初期 adapter 行为 |
| --- | --- | --- |
| planned | runtime operation / command 已创建 | 分配 operation / transaction id |
| computed | command input 或 Worker result 已产生 | 不分配 commit id |
| validated | binding、result、domain invariant 通过 | 记录 base canonical revision |
| projections-prepared | renderer transaction / persistence payload 已准备 | 无该能力的 domain 显式跳过 |
| canonical-committed | command/history/revision 已成功变更 | 分配 commit id / target revision |
| published | UI/API/history 可观察新状态 | 此后不得因投影失败改写 canonical history |
| projections-settled | Worker/renderer/persistence/UI 对目标 commit settled | 可为 ready / degraded / resyncing |

在 `349-5` 影子阶段，adapter 必须如实记录当前 publish 点；不得为了迁就目标图而假报已经发布。允许后续领域切片逐步把投影失败从回滚改为 degraded，但每次必须有独立验收和 recovery 证据。

## 7. Worker 任务清单

现有 registry 共 `13` 项，全部已经归类，没有未知 task owner。

| Task | 主要职责 | session / map 关系 | 后续 capability 分类 |
| --- | --- | --- | --- |
| `regeneration.compute` | 多领域重生成及 archive export 模式 | persistent map-mirror | domain compute；archive 模式另列 persistence |
| `map-file-io` | import / normalize / export | adoption 或 snapshot | persistence / migration |
| `render.prepare` | prepared renderer payload | persistent map-mirror；任务内校验 snapshot / binding | render projection |
| `height-derived.compute` | 高度派生 | map-mirror | terrain dependency compute |
| `climate-downstream.compute` | 气候下游派生 | map-mirror | climate dependency compute |
| `ocean-current-world.compute` | 洋流世界计算 | map-mirror | climate / ocean compute |
| `grid-topology.prepare` | grid topology 准备 | persistent map-mirror；任务内校验 snapshot / binding | topology projection preparation |
| `social-expansion.compute` | 社会扩张 | map-mirror | society compute |
| `economy.compute` | 经济 | map-mirror | economy compute |
| `population.compute` | 人口 | map-mirror | society compute，`349-8` 首选 pilot |
| `route-path.compute` | 路线寻路 | map-mirror | routes compute |
| `military-policy.compute` | 军事政策 | map-mirror | military compute |
| `generation.compute` | 全图生成 | adoption result map | generation / adoption |

`population.compute` 被选为 `349-8` 默认 pilot：它已有真实 binding、patch、history 和专项 Node regression，且比 route path / regeneration 少一个 renderer picking 或多领域锁链。若 `349-8` 前的契约证据证明它不能独立迁移，必须把替换理由登记为阶段调整，不能静默换 task。

## 8. Snapshot 与 buffer ownership

| 对象 | 当前实现 | 冻结 ownership kind | 验收要求 |
| --- | --- | --- | --- |
| full map rollback snapshot | `structuredClone(map)` | `exclusive-clone` | rollback 后引用和 history 一致 |
| Worker staged snapshot | graph clone + 每个 ArrayBuffer 新副本后 transfer | `cloned-transferable` | canonical buffer 永不 detach |
| Worker graph stream chunk | slice / copy；拒绝 SharedArrayBuffer | `cloned-transferable` | chunk transfer 后源仍可读 |
| adoption handoff chunk | bytes copy | `cloned-transferable` | adoption 失败可丢弃 |
| prepared renderer resources | prepared transaction 持有，commit 后 renderer 接管 | `prepared-exclusive` | rollback 恢复旧资源，finalize 只删 detached old buffers |
| retained renderer CPU data | renderer 持有用于恢复 | `projection-retained` | owner binding 不匹配时拒绝复用 |
| read-only core query view | 现有 map 引用 | `borrowed-readonly` | query 不写入、不 transfer |

禁止新增隐式 ownership。所有跨 Worker / renderer adapter 都必须声明 kind、owner binding、可否 transfer、commit 后归属和 rollback 处置。

## 9. Canonical 字段、checksum 与 patch

`canonical-map-field-registry.js` 当前登记 `60` 个字段、`24` 个顶层 section：

`metadata`、`options`、`layers`、`heightmap`、`grid`、`climate`、`oceanCurrents`、`mapCoordinates`、`society`、`politics`、`settlements`、`economy`、`diplomacy`、`military`、`markers`、`zones`、`pack`、`features`、`rivers`、`regenerationLocks`、`namebases`、`summary`、`generationLog`、`status`。

`map-file-io.js` 还正式校验、默认化或迁移以下持久字段，但 registry 未登记：

- `notes`；
- `measurements`；
- `labels`；
- `visualTheme`；
- `display`。

这些不是可忽略的未来字段，而是现有存档契约。因此 `349-3a` 必须完成：

1. 为五个字段定义 canonical / persisted-presentation 分类、默认值、write path 和 migration 关系；
2. 让 registry、checksum、replica patch 和 Manifest audit 使用同一描述；
3. 用旧数据、缺失字段和 patch checksum 专项 Node 门证明无遗漏；
4. 明确 persisted `layers/display/visualTheme` 与 live presentation intent 的边界。

当前 checksum 使用 section hash 与 revision-keyed cache；incremental patch 通过 base checksum + writes 得出 target checksum，Worker applied checksum按写路径复算。后续不得在每次 commit 强制 full-map hash；全量 checksum 仅用于 adoption、resync 或专项审计。

## 10. Domain 与依赖盘点

| 领域组 | canonical 主体 | 主要派生 / 投影 | 复杂度结论 |
| --- | --- | --- | --- |
| notes | `map.notes` | panel、API、persistence | 最低风险 core slice；无 Worker / regeneration / render layer |
| markers | `map.markers` | point layer、picking、panel、API；部分 marker 参与资源重生成 | `349-7` 只迁 CRUD / presentation / layer / picking，资源重生成后置 |
| terrain / grid | heightmap、grid、features | topology、surface、cell attributes、picking | renderer owner 和 topology binding 高耦合 |
| climate / ocean | climate、oceanCurrents | colors、统计、下游社会生成 | 依赖 terrain / coordinates |
| society / politics | society、politics、pack mirrors | boundaries、labels、panels、下游 settlement | 存在镜像与行政锚点 |
| settlements / zones | settlements、zones | city layer、labels、picking、routes、panels | 身份槽、锁定和旧数据兼容要求高 |
| routes / rivers / resources | routes/pack、rivers、features/markers | line/point layer、picking、waypoint、economy | topology 与多领域重建耦合 |
| economy / diplomacy / military | 对应顶层 section 与 pack mirrors | panels、统计、路线/城镇引用 | 依赖 politics / settlements / routes |
| generation / import / adoption | whole document | 全部 projections | 新 runtime session，不是普通 patch commit |
| persisted presentation | layers、display、visualTheme、labels、measurements | renderer/UI 初始化 | 必须与 live viewport/display revision 分离 |

当前失效机制由 `edit-refresh-scheduler` 的效果字符串和 `metadata.derivedStale.systems` 共同承担，还不是 declared read/write graph。未知依赖可以显式 `full rebuild`，但不得无声使用默认全刷并宣称已局部化。

## 11. ADR

### ADR-349-1-01：互动地图保持单一 canonical owner

接受。`state.map` 是唯一互动 owner；facade 只包裹现有引用和事务入口。禁止新 store、EventBus 或第二份长期 map。

### ADR-349-1-02：身份命名空间结构隔离

接受。runtime session、普通 persisted document、render preparation、headless document、operation、presentation 和 commit identity 使用不同 branded type / validator；JS 侧显式 adapter。普通 persisted document identity 当前尚不存在稳定契约，由 `349-3a` 定义其派生、默认值与迁移，不能把 metadata fallback 当成既有身份。

### ADR-349-1-03：core 与 runtime projection 分工

接受。`MapCoreEngine` 负责 canonical transaction、revision、commit、history intent；`MapRuntimeCoordinator` 负责 Worker、renderer、persistence、UI/API projection 状态和恢复。

### ADR-349-1-04：先影子映射现有强事务

接受。Worker map mutation 和 map replacement 当前在 publish 前实施强 rollback；`349-5` 不提前削弱。只有领域切片明确划出 published 边界并具备 degraded / retry / resync 证据后，才允许 canonical commit 不等待某类投影 settled。

### ADR-349-1-05：ownership 是运行时契约

接受。TypeScript 类型不能替代 detach / owner / rollback 校验；所有 snapshot 和 buffer handoff 同时提供 runtime validator。

### ADR-349-1-06：canonical registry 先于 Manifest

接受。现有五个持久字段遗漏使 Manifest 完整性不可证明，新增 `349-3a` 先闭合 registry、checksum 和 identity adapter。

### ADR-349-1-07：patch chain 优先，full checksum 有界使用

接受。普通 commit 沿用增量 checksum / journal；full checksum 只用于 adoption、resync、调试审计和专门验收。

### ADR-349-1-08：持久化 presentation 与 live presentation 分层

接受。`layers/display/visualTheme/labels/measurements` 可含存档 canonical 配置；viewport、当前 display intent、pending render request 和 presentation revision 是 runtime projection，不进入同一 revision 语义。

### ADR-349-1-09：逐 profile 收口，不要求虚假能力

接受。interactive、headless、worker-only 共享 contract vocabulary，但 capabilities 不同。notes 不制造 Worker / layer；headless 不制造 renderer / DOM；read-only query 不制造 history。

## 12. 阶段插入与顺序重评

### 12.1 新增强制阶段

在 `349-3` 后插入：

| 阶段 | 交付 | 为什么不能并入其它阶段 | 独立验收 |
| --- | --- | --- | --- |
| `349-3a` | canonical field registry 补全、persisted/live presentation 分类，定义普通 persisted document identity 的派生 / 默认值 / 迁移并建立 identity adapters | `349-4` Manifest 依赖完整字段集合；混入 Manifest 会让底层数据描述与审计框架无法分别回滚 | 五字段旧数据 / 缺失字段 / checksum / patch / document identity 迁移 / 身份混用负例专项通过 |

### 12.2 复杂域迁移固定顺序

`349-10.x` 根据真实依赖先冻结为以下可独立验收子阶段；每项仍可在开始前因新的强制依赖进一步细拆，但不得合并成一个 checkpoint：

1. `349-10a`：terrain / grid / height-derived / climate / ocean / topology 基础域；
2. `349-10b`：society / politics 与 pack mirror；
3. `349-10c`：settlements / zones / labels / measurements；
4. `349-10d`：routes / rivers / features / resource markers；
5. `349-10e`：economy / diplomacy / military；
6. `349-10f`：generation / import / adoption / export / headless profile 收口；
7. `349-10g`：legacy adapter、重复 revision/history 路径和影子审计收口。

排序依据：地形和 topology 是社会、行政、城镇和路线的基础；economy / diplomacy / military 依赖 politics、settlements 和 routes；全图 adoption 与 headless 收口最后消费已验证的领域 contract；legacy adapter 只在所有正式入口已迁移后移除。

### 12.3 重评后的完整顺序

```text
349-0 → 349-1 → 349-2 → 349-3 → 349-3a → 349-4 → 349-5
→ 349-6 → 349-7 → 349-8 → 349-9
→ 349-10a → 349-10b → 349-10c → 349-10d → 349-10e → 349-10f → 349-10g
→ 349-11
```

## 13. 349-1 验收口径

- interactive、headless、Worker、renderer、persistence、UI owner 均有唯一归类；未知 owner 为 `0`。
- `13 / 13` Worker task 已分类。
- 五类事务状态机和 export projection 有明确的 commit / rollback 边界。
- snapshot / buffer ownership 无未说明的 transfer 路径。
- checksum 与 canonical registry 的现有遗漏已登记为独立强制阶段，而非本阶段顺手改代码。
- `349-3a` 与 `349-10a`～`349-10g` 已同步回权威执行记录和两份专题计划。
- 产品代码改动 `0`，工具代码改动 `0`，浏览器启动 / 操作 / 验收 `0`。
