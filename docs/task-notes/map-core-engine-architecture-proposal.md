# 地图核心引擎架构调查与新方案

> 状态：架构调查与方案评估，未授权实施。
>
> 工作分支：`codex/map-core-engine-architecture`。
>
> 基线：2026-08-18 的 `origin/main`，提交 `a360715c846f547ae3dff5853858e2ba2ecef4bf`。
>
> 范围：只研究正式 WebGL 地图生成器的地图核心、派生系统、Worker、事务、存档、API 与渲染接缝；不修改 `source/`，不修改用户地图，不在本方案中实施代码重构，不把本文的候选阶段自动加入 `docs/current-plan.md`。

## 1. 执行摘要

结论是：应当建立“地图核心引擎契约”，但不应立即进行一次性目录搬迁或重写。

当前项目已经拥有一个分散的引擎雏形：

- `runtime/app.js` 负责应用组装、页面状态、面板回调、地图替换、显示动作和大量领域入口；
- `EditHistory`、`MapRevisionTracker`、`domain-patch.js`、`map-snapshot-transaction.js` 负责不同类型的事务、版本、逆操作和恢复；
- `worker-task-coordinator.js`、`compute-worker.js`、地图副本 journal / patch、adoption handoff 负责 Worker 会话、流式传输、checksum、提交与失效；
- `canonical-map-field-registry.js` 已经开始统一 Worker 副本、增量 patch 和存档字段；
- `render-preparation.js`、`prepared-render-installer.js`、`placeholder-renderer.js` 负责渲染准备、GPU 资源所有权、原子安装、overlay、picking 和显示意图；
- `console-api.js`、`api-contract.js`、`api-schema-registry.js` 已经形成对外能力、稳定性和 schema 约束。

问题不是“没有架构”，而是这些边界尚未由一个稳定的核心契约统一表达。最近的性能和渲染问题反复跨越多个模块：视图切换把显示状态误送入地图计算链；渲染错误来自 canonical 几何、GPU owner 与版本提交之间的不一致；城镇重生成的瓶颈出现在路线 picking 派生索引，而不是城镇算法；保存洞和旧数据兼容问题又同时涉及对象身份、容器编码和恢复路径。

因此推荐的目标不是一个包揽一切的 `MapEngine` 超级类，而是三个有明确边界的层：

```text
应用 UI / Console API / Headless API
                  │ 命令、查询、显示意图
                  ▼
           MapCoreEngine
  canonical state / revisions / transactions
  dependency graph / derived systems / indexes
  worker sessions / patches / persistence boundary
                  │ immutable snapshot / delta patch
                  ▼
           RenderEngine
  GPU resident data / topology cache / layers
  overlay / labels / picking / export frame
                  │
                  ▼
             Canvas / WebGL2 / HTML-SVG overlay
```

首期只新增一个薄的核心 facade 和契约层，包装现有运行时；现有领域命令、Worker 任务和 renderer 逐步注册到契约中。任何阶段都必须保持当前地图行为、旧存档、撤销 / 重做、锁、picking、视觉精度和错误恢复。

## 2. 调查方法与实际边界

本次调查遵循仓库入口：

1. `AGENTS.md`；
2. `docs/README.md`；
3. `docs/current-plan.md`；
4. 当前任务索引和与性能 / 渲染直接相关的专题文档；
5. `app/webgl-generator/src/runtime`、`generator`、`renderer` 的实际导出、调用点和协议。

当前 `docs/current-plan.md` 没有活动权威任务，API 基线为 `18` 个命名空间、`328` 个公开方法、`179` 个编辑方法，完整能力矩阵为 `1228` 行且 gap 为 `0`。这意味着本方案必须面向已经存在的完整产品，而不是面向一个可以随意重塑的数据模型。

调查重点追踪了以下五条链：

| 链路 | 当前入口 | 调查目的 |
| --- | --- | --- |
| 权威地图 | `runtime/app.js` 的 `state.map`、生成 / 导入 / adoption | 确定谁能改变地图、何时改变 revision |
| 事务与历史 | `edit-history.js`、`domain-patch.js`、各领域 `*-edit-commands.js` | 确定预检、写入、回滚和派生声明是否统一 |
| Worker 副本 | `worker-task-coordinator.js`、`compute-worker.js`、replica patch / stream | 确定全量输入、session、ACK、checksum、失效边界 |
| 渲染 | `render-preparation.js`、`prepared-render-installer.js`、`placeholder-renderer.js` | 确定 snapshot、GPU owner、图层和 overlay 的所有权 |
| 持久化与 API | `canonical-map-field-registry.js`、`map-file-io.js`、API contract / schema | 确定新业务数据进入存档、迁移和公开能力的规则 |

## 3. 当前架构调查结果

### 3.1 应用组装层：功能完整，但责任过密

`runtime/app.js` 的 `createGeneratorApp()` 在初始化时创建 `MapRevisionTracker`、`EditHistory` 和大面积 `state`，并挂载 renderer、panel manager、Worker coordinator、operation feedback、selection、画笔状态、各领域编辑状态和 API。

当前状态同时包含：

- canonical 地图：`state.map`；
- 地图版本：`state.mapRevision`；
- 历史：`state.editHistory`；
- Worker / 计算状态：`mapWorkerCoordinator`、`workerTaskCoordinator`、`renderTaskCoordinator`；
- presentation 状态：renderer 的 color mode、layer visibility、theme、camera、smooth、label limit；
- UI 交互状态：面板、画笔、拖拽、创建 / 删除模式、Loading 和 selection。

这使 `app.js` 成为实际的组合根，但同时也让“地图业务逻辑”和“浏览器宿主逻辑”难以分离。新增领域通常需要同时修改命令模块、Worker task、app action、面板回调、renderer refresh、API schema 和存档字段。

### 3.2 当前 canonical 地图并非单一对象，而是多层数据图

当前正式地图至少包含以下数据类别：

| 类别 | 代表字段 | 性质 |
| --- | --- | --- |
| 底层网格 | `grid.points`、`grid.cells.*`、`grid.vertices.*` | 拓扑和空间基础，决定 cell / vertex 身份与邻接 |
| 语义 pack 图 | `pack.cells.*`、`pack.vertices.*`、`pack.features` | 业务派生图，映射行政、社会和地理语义 |
| 世界系统 | `climate`、`heightmap`、`oceanCurrents`、`features`、`rivers` | 地形、水文、气候和自然要素 |
| 社会政治 | `society`、`politics`、`settlements`、`economy`、`diplomacy`、`military` | 业务对象与关系 |
| 用户扩展 | `markers`、`zones`、`notes`、`measurements`、labels、themes | 用户创建对象和展示配置 |
| 运行时派生 | route picking、object index、render cache、stale flags、prepared mesh | 不一定应进入存档，必须可重建 |

`canonical-map-field-registry.js` 当前登记了 `metadata`、`options`、`layers`、`heightmap`、`grid`、`climate`、`pack`、`politics`、`settlements`、`economy`、`diplomacy`、`military`、`zones` 等 section，并区分 `structured`、`dense`、`bitset`、`csr`、`coordinate-pairs`、`object-table` 等编码和 `replace`、`ranges`、`sparse-values`、`table-rows` 等 patch 模式。

优点是字段已经有统一描述的起点。缺点是该 registry 目前主要解决“如何传输 / 存档”，还没有完整表达：

- 字段是 canonical、derived、presentation 还是 cache；
- 谁写入它、谁读取它；
- 哪些 revision 变化会使它失效；
- 如何由局部写集得到局部重建范围；
- 对象身份和引用约束是什么；
- 哪些字段允许在事务内重建，哪些必须保持稳定。

### 3.3 事务与历史已经分层，但契约分布在各领域

当前有三种主要事务机制：

1. `EditHistory` 保存可撤销命令、统计和 mutation 回调；
2. `domain-patch.js` 用路径写集和 reverse patch 交换对象内容，适合 Worker 结果回写；
3. `map-snapshot-transaction.js` 对大范围地图替换使用 before / after 快照和恢复。

领域命令通常提供 `inspect`、`create...Command`、`apply` / `revert`，并通过 `effects` 标记 affected objects、derived systems、refresh 目标和 history domain。复杂领域还会持有局部 snapshot、锁定对象、mirror 字段和故障注入逻辑。

这套机制保护能力很强，尤其适合当前的安全编辑与重生成。但它存在结构性差异：不同领域对“写集”“派生”“失效”“snapshot”“镜像字段”的声明方式不完全一致，部分派生关系仍通过 `metadata.stale`、固定数组或命令内部约定表达。新增业务系统如果只复制一个旧领域的写法，很容易遗漏存档、Worker patch、renderer refresh 或 undo。

### 3.4 Worker 架构已经支持长期副本，但复用和提交语义较复杂

`worker-task-coordinator.js` 当前支持：

- 普通一次性 Worker；
- `map-mirror` 持久副本 session；
- `adopt-result-map` 结果地图接纳；
- 输入 / 输出 graph stream 与 ACK 窗口；
- `mapIdentity`、`mapRevision`、`generationToken`、`lockFingerprint`、`operationId` 等 binding；
- checksum 校验、连续 patch、session commit、session invalidate；
- Worker 不可用时按策略决定是否 fallback。

`compute-worker.js` 在结果流完成后保留 pending session，主线程确认正式提交后才把 session 置为 idle；增量 patch 必须满足 base revision、target revision、map identity、generation token 和 checksum 连续。这个设计已经解决了大量“旧 Promise 覆盖新状态”“Worker 副本与主线程不一致”的问题。

当前不足是：

- session 生命周期仍然由 coordinator 的 task / session 入口组织，领域依赖没有成为统一的核心对象；
- binding 字段分散在不同 task 的 payload 和 helper 中，容易出现同义但不完全一致的 token；
- Worker 任务可以同时承担领域计算、patch 构造和 render preparation，显示与地图写入的边界必须由调用方正确传参；
- journal、patch、adoption、render result 的“提交顺序”虽有局部门禁，但没有一个统一的 `MapCoreCommit` 记录把所有副作用串起来。

### 3.5 Renderer 已有 snapshot / transaction 思想，但仍以主类为中心

`render-preparation.js` 把地图和显示参数编译为多个 prepared layer：surface、shore、政治 mesh、cell visual、路线、河流、标签 / icon descriptors、picking 等。`prepared-render-installer.js` 再把 prepared 数据解码并创建 GPU buffer、texture、cell attribute store，最后由 prepared install transaction 原子提交或 rollback。

`cell-attribute-store.js` 已经把 cell identity、terrain、numeric 和 palette 分离，支持 GPU 常驻属性与局部 `texSubImage2D` patch。surface base、cell visual correction、政治 topology cache、city icon WebGL layer、overlay label layout 和 picking 也分别有缓存 / owner / identity 机制。

优点是渲染资源已经从“每次全量重编译”转向“稳定几何 + 属性 patch + 原子安装”。缺点是 `PlaceholderMapRenderer` 仍然承担大量职责：

- 地图引用与 render preparation；
- camera、viewport、view mode、theme、layer visibility；
- GPU 资源创建、释放、owner 和 context restore；
- overlay 节点 identity、标签布局、城市图标、军事图标；
- route / river buffer 的相机刷新；
- selection、highlight、hover、picking；
- export 和 debug stats。

因此新增图层时，仍可能需要理解 renderer 内部状态和 `onViewChange` / deferred mutation / pending draw 等运行时细节，而不是只实现一个独立 layer。

### 3.6 API、存档和运行时查询已具备公共契约基础

`api-contract.js` 定义 namespace、稳定等级、读写、确认要求和兼容别名；`api-schema-registry.js` 为方法输入、输出、错误码、revision、引用空间和规则事务提供 schema；`console-api.js` 将这些能力绑定到 state / actions。

`map-file-io.js` 负责当前文档版本、迁移注册表、TypedArray 还原、旧 gzip / JSON 读取、GeoJSON、PNG 和高度图导出。`canonical-map-field-registry.js` 又承担 v3 紧凑容器、Worker stream 和 patch 的共同字段描述。

这为核心引擎提供了重要基础，但也说明“增加一种业务数据”不是只加一个对象数组：它必须同时考虑 canonical registry、旧文档迁移、Worker 传输、API 描述、查询 / picking、历史、导出和可能的渲染图层。

## 4. 近期问题说明了什么

| 已遇问题 | 实际根因 / 证据 | 架构含义 |
| --- | --- | --- |
| 100k 视图切换长期卡顿 | 第 332 项确认完整地图镜像输入约 `8.4s`，首次 surface / shore / political 几何约 `5.7s`；第 335 项将普通显示状态改为 GPU resident，主题 / 海底 / 标签最终约 `105.5 / 16.1 / 17.3ms` | presentation state 必须与 canonical map revision 分离；缓存失效必须由依赖声明驱动 |
| 海洋出现陆色三角、平滑边界缺面 | 非凸 cell 的旧 center fan 越出真实边界；安全三角化、surface owner 和零 range / fallback 语义相互影响 | geometry snapshot、owner、拓扑版本和安装事务必须是同一提交单位 |
| Worker adoption 被 watchdog 提前销毁 | 第 341 项确认普通 pending watchdog 误用于 `adopt-result-map`，主线程接收较慢时 owner 被错误销毁 | Worker 生命周期应由 core commit / invalidate 终态控制，不能由通用超时猜测所有 session 类型 |
| 省份 / 城镇重生成被旧省会拒绝 | 旧政治镜像与省会引用不一致，被建议性旧状态冒充锁冲突；第 343～345 项才把修复、完全重算和锁定对象语义拆开 | 业务规则、锁、修复性归一和重生成策略必须成为显式事务阶段 |
| 城镇重生成约 `9969ms` | 第 347 项账本显示领域计算仅约 `534.2ms`，路线 picking 引用对象化回绑约 `5661ms`；优化后用户真实入口约 `1886.3ms` | 派生索引必须拥有明确 owner、增量重建范围和可度量阶段，不能隐藏在某个领域 Worker 的尾部 |
| 保存后出现 holey identity / 派生关系问题 | 第 348 项涉及高编号锁定对象、cities / burgs / routes 稠密身份槽、旧 holey 数组导出抢救与保存回读 | 对象身份、稠密化、迁移和导出不能由 renderer 或单个保存函数临时修补 |

这些问题的共同缺口是“版本化的 canonical 状态 + 显式依赖图 + 原子提交记录”，而不是单纯缺少一个性能工具或一个 renderer 类。

## 5. 当前架构的优点

### 5.1 已经有正确的性能方向

- 基础地图与语义 pack 已经区分，renderer 的底层 surface 可以基于 grid，而业务 overlay / picking 使用 pack；
- GPU cell attribute、palette、稳定 surface geometry 和局部 patch 已经落地；
- 视图意图有 latest-wins、正式提交后控件生效和 build handshake；
- renderer install 具备 prepare / commit / rollback / finalize 生命周期；
- WebGL context restore 已有资源重建思路。

### 5.2 已经有较强的数据安全边界

- 显式 map identity、revision、generation token、lock fingerprint 和 checksum；
- Worker 结果不直接覆盖正式地图，必须经过绑定验证和正式 commit；
- 领域锁、保护对象、预检和回滚已经覆盖大量高风险编辑；
- 旧文档、旧浏览器存储和 v3 容器存在迁移与兼容入口；
- API 有稳定等级、确认要求、错误码和 schema 描述。

### 5.3 测试和证据体系成熟

项目已有 Node regression、Worker protocol、render preparation、prepared installer、10k / 50k / 100k 浏览器入口、PNG / 视觉、旧存档、撤销 / 重做、context restore 和错误面检查。

这意味着引擎化可以采用“薄 facade + 行为不变”的渐进路线，不需要从零建立验证体系。

## 6. 当前架构的缺点与结构性风险

### 6.1 应用总状态承担过多所有权

`state` 同时是地图容器、编辑会话、显示偏好、面板依赖、Worker bridge 和诊断账本。它使现有功能快速落地，但新领域的接入点难以枚举，导致隐式耦合。

### 6.2 “写集”与“派生依赖”没有成为一等公民

当前命令 effects、domain patch writeSet、stale flags、render layers、picking components 各自表达一部分依赖。缺少统一的关系：

```text
canonical field → derived system / index → render component / API query
```

因此一个修改可能需要人工记住：更新哪些镜像、重算哪些对象、刷新哪些 GPU 属性、保留哪些 overlay identity、重建哪些 picking bucket、清理哪些缓存。

### 6.3 task、领域和缓存的边界不完全一致

Worker task 有时是领域计算，有时是地图副本同步，有时还带 render-only preparation。task 名称、session 类型和缓存类型之间存在耦合；新增视图若走错入口，就会重新传整图或错误地触发 render preparation。

### 6.4 身份和引用约束分散

城市、路线、河流、feature、行政对象和镜像字段需要保持稳定身份或显式替换。当前这些约束分散在 regeneration lock、各领域命令、map-file normalization、renderer picking 和保存修复中，容易出现“内存看似正确、导出后不正确”的延迟故障。

### 6.5 renderer 仍然是高耦合组合类

layer 已有独立文件，但主 renderer 仍了解各类 layer 的准备、缓存、overlay、picking 和相机副作用。这样会让“新增图层”不是注册一个 descriptor，而是修改主类的多个 switch / refresh / draw 路径。

### 6.6 缺少核心提交日志视角

目前有 edit history、map revision、replica patch、render install transaction、display intent ledger，但它们各自记录自己的事件。缺少一条统一的 commit envelope，能够回答：

- 哪个地图 revision 被谁提交；
- 写了哪些 canonical fields；
- 触发了哪些 derived systems；
- 发布了哪些 Worker patch；
- 哪些 renderer components 被复用 / 重建 / patch；
- history、save、API 和 UI 收到的是否是同一提交。

## 7. 方案目标与非目标

### 7.1 目标

1. 建立唯一的地图 canonical owner 和明确的读写边界。
2. 让 revision、topology revision、presentation revision、cache generation 可区分且可验证。
3. 把 canonical 字段、派生系统、索引和渲染组件的依赖关系注册化。
4. 让每次地图改变产生统一、可回滚、可同步、可观察的 commit envelope。
5. 让 Worker 负责计算和副本，但不绕过核心提交协议。
6. 让普通视图切换只改变 presentation / GPU state，不触发地图计算。
7. 让新增图层能够通过 layer descriptor 注册，不必理解 app.js 的所有副作用。
8. 让新增业务数据有完整的 schema、命令、迁移、patch、查询、历史和可选渲染适配器路径。
9. 保留现有公开 API、旧存档、旧地图行为和安全门禁。
10. 让每个性能阶段都能按 core、worker、render、UI 四段归因。

### 7.2 非目标

- 不把 `source/Fantasy-Map-Generator` 改造成核心引擎；
- 不一次性把所有现有文件移动到新目录；
- 不首期把地图权威所有权迁到 Worker；
- 不用 ECS、全局 event bus 或不可追踪的 reactive store 替代现有事务；
- 不为了抽象而改变生成算法、地图字段语义或视觉结果；
- 不把 UI 面板、Loading、相机交互和业务规则塞进 `MapCoreEngine`；
- 不允许用删图层、降采样、减少 picking 或放宽 LongTask 阈值换取引擎化指标；
- 不在本方案任务中实施任何业务功能。

## 8. 目标架构

### 8.1 四类数据必须分开

核心引擎应将地图相关数据分为四类，所有字段登记时必须选择一种：

| 类别 | 定义 | 是否存档 | 是否进入 map revision |
| --- | --- | --- | --- |
| canonical | 用户地图事实、对象身份、拓扑、业务规则直接修改的来源 | 是，除非明确临时 | 是 |
| derived | 可由 canonical 重建的业务数据、镜像和索引 | 按兼容策略可存但必须可重建 | 由其来源 revision 派生 |
| presentation | 当前视图模式、主题、图层显隐、相机、标签预算 | 部分存为用户偏好 | 不增加 map revision |
| cache/resource | GPU buffer、texture、mesh、layout、picking bucket、Worker session | 否，或仅保存诊断 | 由 identity / revision / generation 绑定 |

例如：

- `grid.cells.h` 是 canonical terrain source；
- `cellAttributeStore.numeric` 是 render cache；
- `politics.states` 是业务数据，是否 canonical 或 regeneration-derived 必须由领域 schema 明确；
- `route picking index` 是 derived cache，不应伪装成路线 canonical 数据；
- `colorMode` 是 presentation，不应让 Worker 重新接收地图。

### 8.2 核心引擎的最小职责

建议先实现一个薄的 `MapCoreEngine` facade，而不是让它直接替代全部模块：

```js
const core = createMapCoreEngine({
  mapOwner,
  history,
  revisionTracker,
  dependencyRegistry,
  workerCoordinator,
  persistenceRegistry,
  queryRegistry
});

await core.execute(command, {expectedRevision, signal});
const snapshot = core.snapshot({sections, purpose: "render"});
const query = core.query("cell.inspect", input);
const commit = core.lastCommit();
```

它必须负责：

- 暴露只读 snapshot / query，而不是让 UI 任意拿到可写 map；
- 执行预检、命令、领域 patch、结果验证和正式提交；
- 推进 revision 并创建 commit envelope；
- 触发 dependency graph 的失效和重建计划；
- 向 Worker 发布有序 snapshot / patch；
- 向 renderer 发布 canonical snapshot / render patch；
- 把 history、save、API、diagnostic 使用同一个 commit identity；
- 对取消、obsolete、失败、rollback 和 session invalidation 给出明确结果。

它不负责：

- DOM、面板、Loading 文案的具体展示；
- WebGL buffer、shader、canvas draw；
- camera 拖动和 pointer event；
- 具体领域算法的实现；
- 直接决定某个图层画什么颜色。

### 8.3 Revision vector

单一 `mapRevision` 仍需保留对外兼容，但内部建议引入不可变 revision vector：

```js
{
  mapIdentity: "...",
  mapRevision: 42,
  topologyRevision: 9,
  domainRevisions: {
    terrain: 7,
    climate: 4,
    politics: 12,
    settlements: 16,
    routes: 18
  },
  presentationRevision: 31,
  renderGeneration: 6,
  generationToken: 3,
  lockFingerprint: "..."
}
```

规则：

- canonical 写入推进 `mapRevision`；
- grid / pack topology 或坐标身份变化推进 `topologyRevision`；
- 可局部重算的领域推进对应 `domainRevisions`；
- 视图、主题、图层、相机变化只推进 `presentationRevision`；
- GPU 资源重建、context restore、session 替换推进 `renderGeneration`；
- `mapIdentity` 变化表示换图，不得用 revision + 1 伪装；
- 对外旧 API 继续输出 `mapRevision`，新增 debug / internal snapshot 输出完整 vector。

### 8.4 Commit envelope

所有成功的 canonical 修改、Worker 结果接纳、撤销和重做都必须收敛为：

```js
{
  commitId,
  kind: "edit | regenerate | import | undo | redo | adoption",
  source: "ui | api | worker | storage",
  mapIdentity,
  beforeRevision,
  afterRevision,
  beforeChecksum,
  afterChecksum,
  writeSet: ["grid.cells.h", "pack.cells.h"],
  objectChanges: [{kind: "city", id: 17, action: "replace"}],
  topology: {changed: false, affectedCells: []},
  dependencies: {
    invalidated: ["cell-attributes", "city-picking"],
    rebuilt: ["city-picking"]
  },
  worker: {publishedPatchId, ackedReplicas: []},
  render: {reused: ["surface-base"], rebuilt: ["cell-attributes"]},
  history: {undoable: true, domain: "settlements"},
  persistence: {dirty: true},
  effects,
  timings
}
```

commit envelope 是诊断和协议对象，不是普通用户界面文案。它必须可序列化、可裁剪，不能保存完整地图或任意对象引用。

### 8.5 Dependency registry

在现有 canonical field registry 的基础上新增依赖描述。每个 domain / derived system / render component 至少声明：

```js
{
  id: "city-picking",
  kind: "derived-index",
  reads: ["settlements.cities", "grid.cells.p", "pack.cells.g"],
  writes: ["runtime.indexes.cityPicking"],
  invalidatedBy: ["settlements.cities", "grid.cells.p", "topology"],
  scope: "affected-objects | affected-cells | full-map",
  rebuild: "worker | main-thread | gpu-patch",
  canReuseAcrossPresentation: true,
  canReuseAcrossRevision: false,
  verify: "verifyCityPickingIndex"
}
```

依赖图必须支持：

- 静态校验读写路径和循环依赖；
- 从 write set 求最小失效集合；
- 从对象 / cell affected 集合求局部重建范围；
- 标记必须 full rebuild 的系统；
- 区分 presentation-only 更新；
- 输出 Loading / debug 的阶段名和数量；
- 生成测试矩阵，防止新增领域漏注册。

首期不要求所有领域立即完成精确局部化；允许 `scope: full-map`，但必须显式、可测量、可逐步收窄。

### 8.6 Worker boundary

Worker 继续是计算执行者和可复用副本持有者，不成为首期唯一权威 owner。

统一 Worker request binding：

```js
{
  mapIdentity,
  revisionVector,
  commitId,
  operationId,
  operationName,
  generationToken,
  lockFingerprint,
  replicaId,
  taskId,
  sourceChecksum
}
```

统一 Worker result：

```js
{
  binding,
  resultKind: "patch | replacement | render-prepared | query",
  patch,
  prepared,
  affected,
  checksum,
  timings,
  diagnostics
}
```

Worker 不得直接发布正式地图变化。顺序必须是：

```text
core capture source
→ worker compute
→ validate binding / locks / patch policy
→ core commit canonical patch
→ publish replica patch
→ prepare render delta
→ renderer atomic install
→ UI / API observe same commit
```

纯 display request 则走另一条链：

```text
presentation intent
→ validate latest intent
→ GPU uniform / palette / attribute patch
→ renderer commit
→ UI control becomes active
```

两条链不能因“都要更新画面”而重新合并。

### 8.7 RenderEngine 与 layer contract

Renderer 应保留 WebGL2 主画布、HTML / SVG overlay 和现有视觉精度，但将 layer 注册收敛为 descriptor：

```js
{
  id: "states",
  order: 140,
  source: ["politics.states", "grid.cells.state"],
  dependsOn: ["surface-base", "topology"],
  presentation: ["colorMode", "theme", "visibility"],
  cacheKey: ({mapIdentity, topologyRevision, smoothMode}) => ...,
  prepare({snapshot, previous, invalidation, signal}) {},
  install({prepared, transaction}) {},
  patch({commit, affected}) {},
  draw({camera, viewport}) {},
  pick({worldPoint, snapshot}) {},
  export({frame, options}) {}
}
```

layer contract 的强制规则：

- layer 只能读取 snapshot，不得写 canonical map；
- layer 不直接调领域 Worker；
- presentation-only 变化优先走 uniform / palette / visibility；
- topology 或对象身份变化才允许重建 geometry / picking；
- 每个资源必须绑定 `mapIdentity + revision / topologyRevision + renderGeneration`；
- install 必须支持 prepare / commit / rollback / finalize；
- layer 的失败不能销毁其它已提交 layer；
- picking 和视觉使用同一份 identity / geometry 版本；
- overlay 节点按稳定 key 保留 identity，不能因普通颜色切换全量替换。

### 8.8 UI 与 API shell

UI 通过 core command / query / presentation intent 工作：

- 面板不直接修改 `state.map`；
- 领域面板提交 typed command；
- display controls 调用 `core.presentation.set(...)` 或 renderer facade；
- Loading 只订阅 operation stage，不自己推测 Worker 阶段；
- API 继续保留现有 namespace 和 schema，由 core action adapter 提供实现；
- debug 面板可读取 commit ledger、dependency plan、renderer stats，普通 UI 不暴露内部术语。

## 9. 新增能力的标准接入方式

### 9.1 新增一个纯视图

例如新增“坡度专题”：

1. 确认数据来源是已有 `height` / `grid`，不新增 canonical 字段；
2. 在 presentation registry 注册 `slope` mode；
3. 声明读取 `grid.cells.h` 和邻接 topology；
4. 若可在 shader 计算，增加 attribute / uniform，不触发 Worker map input；
5. 注册 layer palette 和 legend；
6. 增加颜色、picking、PNG、context restore、10k / 100k 性能门；
7. API 若公开，增加 `layers.setViewMode` schema enum 和能力矩阵行。

验收重点是 `mapRevision` 不变、输入包为 `0`、render preparation 为 `0`、surface geometry 为 `0`，且视觉与 picking 同源。

### 9.2 新增一个几何图层

例如新增“贸易路线热力带”：

1. 登记 canonical / derived 依赖：`economy.deals`、`settlements.routes`、route geometry；
2. 声明全量 / 局部 rebuild 范围；
3. 将路线几何和热力属性分离，优先稳定 geometry + GPU attribute；
4. 注册 layer order、visibility、cache key、picking policy 和 export policy；
5. 为经济 patch、路线重生成、撤销 / 重做、保存恢复和 Worker 重启增加 invalidation 矩阵；
6. 不把热力数据写到路线 canonical 对象中，除非业务规则明确要求持久化。

### 9.3 新增一个业务数据域

例如新增“贸易政策”：

1. 定义 `domain schema`、稳定对象 ID、引用空间、默认值和迁移版本；
2. 在 canonical registry 登记持久字段和编码；
3. 在 dependency registry 声明读取和影响的经济、外交、军事、图层、查询；
4. 实现 `inspect / createCommand / execute / revert`；
5. 选择局部 patch 或 map replacement，并实现 patch policy；
6. 注册 Worker task 或复用已有领域 task，但不能把 task 名称当副本身份；
7. 注册 API namespace / schema / capability / error codes；
8. 注册存档迁移、旧数据 backfill、导出和旧样本回读；
9. 若需要展示，再添加独立 Render layer；
10. 加入 locks、history、selection、picking、PNG 和 failure injection 矩阵。

### 9.4 新增一个查询或分析能力

查询必须是 read-only：

- 通过 core query registry 声明读取字段和索引；
- 绑定 `mapIdentity + revisionVector`，不在异步返回时读取已经变化的 live map；
- 大结果使用分页 / bounded output；
- 不触发地图 revision、history、renderer 或 Worker mirror patch；
- API schema 明确引用空间和 stale result 行为。

## 10. 分阶段实施方案

本节是后续实施施工图，不是当前已批准任务。每阶段必须单独登记、冻结和验收。

### 阶段 A：契约盘点与只读审计

**目标**：建立字段—命令—派生—图层—API—存档的完整映射。

**工作**：

- 从 canonical registry 生成字段分类表；
- 为每个现有 Worker task 记录 source、write set、result kind、session mode、render effect；
- 为每个 edit command 记录 inspect、execute、revert、effects、history domain、lock；
- 为每个 renderer layer 记录 source、cache key、rebuild / patch / draw / pick；
- 标出 `metadata.stale`、镜像字段、固定 refresh 和隐式引用；
- 形成现有行为基线，不改代码。

**最小验证**：静态 registry 审计；API 矩阵仍 gap `0`；当前 Node / production build 不变。

**停止条件**：发现某个字段的权威来源无法判定，先记录决策点，不继续实现。

### 阶段 B：Revision vector 与 commit envelope

**目标**：不改变行为地把 map revision、topology、domain、presentation、render generation 统一建模。

**工作**：

- 新增只读 `RevisionVector`；
- 将现有 `MapRevisionTracker`、operation binding、render binding 适配到它；
- 为 edit、Worker result、undo、redo、adoption 生成 commit envelope；
- 只记录诊断和内部协议，旧 API 输出兼容字段；
- 完成 commit ledger 的 bounded snapshot。

**最小验证**：所有现有编辑命令 undo / redo；换图、导入、生成、Worker 失败、取消、obsolete；map identity / checksum 不变；旧 API schema 不变。

### 阶段 C：薄 MapCore facade

**目标**：建立唯一调用入口，不移动领域实现。

**工作**：

- `createMapCoreEngine` 包装现有 state、history、revision、coordinators；
- 将一条低风险命令链迁移为 adapter；
- 将只读 query 从 live map 改为 snapshot / query facade；
- 逐步禁止 UI 新代码直接写 `state.map`；
- 旧 runtime actions 继续作为兼容适配器。

**最小验证**：迁移一条领域前后结果、history、affected、API、renderer 和存档字节 / 语义相同；失败可回退到旧 action。

### 阶段 D：依赖图与派生索引注册

**目标**：把 stale、render refresh、picking rebuild 和 Worker patch policy 收敛到同一依赖图。

**工作**：

- 先注册 route picking、city picking、cell attribute、political topology、labels、overlay object index；
- 每个系统声明 reads / writes / invalidatedBy / scope / rebuild / verify；
- 从 commit writeSet 自动生成 invalidation plan；
- 对不能局部化的系统先标 full-map，不隐藏成本；
- 给第 347 项的路线引用回绑建立独立 index owner 和分片 / 局部更新。

**最小验证**：固定 10k / 100k 的领域写入只重建预期系统；无关 layer identity 不变；首个热点有独立耗时；错误时完整回退。

### 阶段 E：Worker replica 与 core commit 对接

**目标**：让所有 Worker task 消费同源 revision / patch，而不是由 task 名称决定副本生死。

**工作**：

- 统一 Worker binding 和 result envelope；
- 将 `map-replica-journal`、`map-replica-command-patch` 接入 commit envelope；
- 将 compute、render-only、adoption、save / load 区分成不同 result kind；
- 明确 pending / idle / committed / invalidated 状态；
- 将超时变成按 session 类型的保护策略；
- 处理缺包、checksum mismatch、Worker crash、主线程后台停顿和一次性 resync。

**最小验证**：十一类 Worker、session reuse、revision patch、撤销 / 重做、取消、失败、重启、adoption、旧存档恢复；输入包、checksum、revision、session 状态全一致。

### 阶段 F：RenderEngine / layer registry 适配

**目标**：让图层成为可注册模块，保留现有 renderer 兼容入口。

**工作**：

- 把现有 layer 的 source、cache、prepare、install、patch、draw、pick 逐个登记；
- 先迁移普通颜色 / palette / cell attribute，再迁移政治 topology，再迁移 overlay / icon / labels；
- 将 `PlaceholderMapRenderer` 保留为宿主，但把 layer-specific 分支移到 descriptor adapter；
- 统一 resource owner、render generation、context restore 和 atomic install；
- 保留 `draw`、`setColorMode`、`setLayerVisible` 等兼容 API。

**最小验证**：10k / 50k / 100k 视图矩阵、快速切换、平移缩放、selection / highlight / picking、PNG、context loss / restore、WebGL error `0`。

### 阶段 G：新业务域试点

**目标**：用一个真实但边界清楚的新数据域验证接入成本。

**推荐试点顺序**：先选独立的 notes / measurement / marker 扩展，之后再选 economy / diplomacy 等强依赖领域；不要一开始拿政治拓扑或城市重生成作为试点。

**最小验收**：从 schema 到 command、history、save、old-data migration、API、query、可选 layer 的完整闭环；不修改现有领域的语义。

### 阶段 H：迁移收口与旧路径下线决策

**目标**：只在证据充分时减少旧入口。

**工作**：

- 对旧 runtime actions 标记 compatibility adapter；
- 检查所有 UI / API / headless / Worker 入口是否经过 core；
- 删除重复 patch / stale / binding 逻辑前先保留审计期；
- 对无法迁移的历史路径记录边界，不强行统一。

**最小验证**：完整 API capability matrix、旧文档和浏览器存储、真实 10k / 50k / 100k、保存读取、导出、撤销 / 重做和最终视觉矩阵。

## 11. 验证策略

### 11.1 静态与契约门

- 所有 canonical field、domain、derived system、render layer 有唯一 ID；
- reads / writes / invalidation 不含未登记路径；
- 依赖图无未允许循环；
- 所有 Worker task 有 result kind、binding、patch policy；
- 所有命令有 inspect / execute / revert 或明确不可撤销理由；
- API method、schema、错误码、capability matrix 同步；
- 旧 API method 数量和稳定性不得意外下降；
- `source/` 零改动；
- `git diff --check`、生产构建、模块语法检查通过。

### 11.2 Node / 纯逻辑门

覆盖：

- revision vector 单调性、换图 identity、presentation 不推进 map revision；
- commit envelope before / after、write set、checksum、inverse；
- patch apply / rollback / duplicate / gap / wrong base；
- dependency plan 的 full / local / presentation-only 分类；
- object identity 稠密化、holey legacy 输入、旧字段 backfill；
- layer cache key、topology invalidation、context restore snapshot；
- 锁定对象、失败注入、取消和 obsolete。

### 11.3 小数据真实入口

固定 10k 地图，覆盖：

- fresh generation、import、browser restore；
- height、states、provinces、biomes、population、theme、smooth、labels；
- city / route / river / feature / zone / marker 编辑；
- undo / redo、save / load、PNG、GeoJSON；
- 快速 A → B → C 显示意图；
- Worker restart、context loss / restore；
- console、page、health、WebGL error、Loading 清理。

### 11.4 代表性大数据

固定 `99846` grid cells 的 100k 地图，使用同一 checksum 和旧存档样本。必须分别测量：

- cold mirror、warm mirror、跨 task reuse、revision patch、full resync；
- display-only、topology change、object identity change；
- render preparation、decode、GPU install、overlay、picking、UI refresh；
- 100k 城市 / 省份 / 路线重生成；
- save / restore、v2 / v3、holey legacy；
- 取消、后台停顿、Worker 重启、context restore。

### 11.5 视觉与语义门

逐项确认：

- 高度、水陆、国家、省份、文化、宗教、生物群系、人口和主题像素与基线一致；
- 平滑开 / 关、岸线、湖岸、政治边界无越界三角、缺面、接缝和错误颜色；
- 城市、路线、河流、港口、标签、军事、markers、zones 的 identity / placement / picking 正确；
- selection、highlight、hover 与 API 查询同源；
- PNG 导出与画面一致；
- 旧地图字段和保存回读不改变 canonical checksum，除非迁移明确声明且有 round-trip 证据。

## 12. 性能验收口径

引擎化不能用“多了抽象层”作为性能豁免。首期目标沿用已验证的产品门，并增加来源归因：

| 场景 | 目标 |
| --- | --- |
| 100k 暖态普通颜色 / presentation view | 继续保持当前约十几至百毫秒级结果，不得退回秒级全量准备 |
| 普通显示切换 | Worker map input `0`、`render.prepare=0`、surface geometry rebuild `0`，除非依赖图明确标记 topology change |
| GPU attribute / palette patch | 仅上传受影响 cell / palette 范围 |
| presentation revision | 不推进 canonical map revision，不产生 history，不发送 map replica patch |
| 局部业务编辑 | 只有依赖图命中的系统重建；不能局部化时记录 full-map 原因和耗时 |
| 主线程交互 | 现有 LongTask 硬门继续有效；不能用提高阈值或隐藏后台工作替代优化 |
| 100k 城镇 / 省份重生成 | 单独报告领域计算、patch、index、render install、UI refresh，不把尾部派生时间归入算法 |

任何指标都必须同时记录：map identity、before / after revision、session fresh / reuse、输入 / 输出包、checksum、affected count、cache reuse / rebuild、首个 frame、正式 commit 和错误面。

## 13. 风险与应对

| 风险 | 表现 | 应对 |
| --- | --- | --- |
| 形成第二套状态系统 | core facade 与 `state` 双向同步，出现两个真相 | 首期 facade 只包装现有 owner；禁止新 canonical store，迁移阶段明确单向数据流 |
| 抽象过早 | 为了通用化制造复杂接口，实际没有减少接入成本 | 先用真实领域和真实图层试点；每个契约必须对应已有故障或新接入需求 |
| 依赖图不完整 | 漏刷新、旧 picking、错误标签或陈旧 GPU 资源 | registry 静态审计 + commit ledger + 受控故障注入；未知依赖默认 full rebuild，不静默复用 |
| patch 语义错误 | checksum / revision 连续但字段引用错 | patch policy 限定允许路径；写入前 preflight；旧样本和 round-trip；失败完整 invalidation |
| Worker 与 core 提交竞态 | 新旧结果交错、adoption 丢失、后台停顿误销毁 | 统一 binding / commit envelope；session 状态机按类型处理；所有 commit ACK 需匹配 commitId |
| 性能退化 | facade 造成额外 clone、序列化或全量 snapshot | snapshot 按 section / purpose；禁止 presentation-only 传 map；以 10k / 100k paired profile 作为每阶段门 |
| 目录重排导致大 diff | 难以复核、回滚困难、混入行为变化 | 先 adapter、后移动；每阶段小提交；不在同一阶段改 schema 和视觉算法 |
| 旧数据兼容被忽略 | 老 JSON、浏览器存储或 holey identity 读取失败 | 每个新 canonical section 同时提供 migrator、backfill、old-sample、export / import round-trip |
| API 与内部契约漂移 | 文档、schema、实现和能力矩阵不一致 | API registry 从 core capability metadata 生成；静态 coverage 继续 gap `0` |
| renderer layer 过度泛化 | layer 接口无法表达特殊拓扑 / overlay / picking | descriptor 允许 capability flags 和 escape hatch，但 escape 必须有明确 owner / version / test |
| 试点选择过难 | 一开始改政治拓扑或城市重生成，无法区分架构问题和领域问题 | 先 notes / markers / measurements，再选经济或外交，最后才迁移拓扑型领域 |

## 14. 回滚与故障处理

每个实施阶段必须能单独回滚：

- facade 可通过 feature adapter 回到旧 runtime action；
- dependency plan 出错时默认 full rebuild，而不是使用不可信的局部结果；
- Worker patch gap / checksum 错误时销毁 session 并做一次 full resync；
- render install 失败时保留上一帧和上一组 GPU owner；
- commit 失败时 canonical、history、replica、renderer 必须回到 before 状态；
- 新存档字段迁移失败时保留原始输入，不覆盖正式地图或用户文件；
- 试点业务域必须可关闭其 layer 和 API adapter，而不影响核心地图与既有域。

任何“继续运行但数据可能混合”的状态都必须视为阻断，不得用 Loading 完成或背景色遮掩。

## 15. 交付物清单

架构评估批准后，至少应形成以下文档和工具：

1. `architecture/map-core-contract.md`：核心对象、版本、提交和所有权契约；
2. `architecture/map-dependency-registry.md`：字段—派生—渲染—查询依赖关系；
3. `task-notes/task-<id>-map-core-engine.md`：权威施工计划、阶段门和非目标；
4. registry / dependency / layer 静态审计工具；
5. commit ledger 和 bounded debug snapshot；
6. 10k / 100k core transaction regression；
7. Worker binding / patch / resync regression；
8. renderer layer reuse / invalidation / context restore regression；
9. 新业务域试点及旧数据迁移样本；
10. 最终 API、存档、视觉、性能和错误面验收报告。

## 16. 建议的决策门

建议按以下顺序做产品与技术决策：

### 决策门一：是否接受核心 owner 边界

接受：主线程 core 在首期仍是 canonical owner；Worker 是计算 / replica owner；renderer 是 GPU resource owner；UI 不直接写 map。

不接受则不能进入契约实现，因为所有后续 revision、patch 和 rollback 结论都会变化。

### 决策门二：是否接受四类数据分类

必须明确哪些数据是 canonical、derived、presentation、cache。特别是 politics / settlements / route / feature 的身份和镜像不能继续使用模糊的“既是结果又是来源”。

### 决策门三：是否接受显式 full rebuild

不能局部化的依赖可以暂时 full rebuild，但必须写在 registry 并有耗时账本；不能为了接入速度把不确定的复用隐藏起来。

### 决策门四：选择第一个试点领域

推荐 `markers`、`notes` 或 `measurements`；不推荐首期用城市、政治拓扑、河流或路线重生成作为架构试点。

## 17. 最终建议

这项工作值得进入正式架构路线，原因不是“类名更好看”，而是当前项目已经有足够多的地图域、Worker、GPU layer、存档格式和公开 API，继续靠 `app.js` 回调、领域内 stale 标记和局部 refresh 约定扩展，边际成本会持续升高。

但实施必须遵守三条原则：

1. **先契约，后搬迁**：先记录真实所有权、写集、依赖和提交，不先重排目录。
2. **先薄 facade，后统一实现**：让已有模块接入同一核心入口，不复制一套新的 map store。
3. **先试点，后推广**：用一个低风险业务域证明“新增数据 / API / 存档 / history / Worker / layer”确实变简单，再决定是否迁移复杂政治和城市系统。

本方案完成后，新增视图、图层和业务数据的标准就不再是“找到几个合适的文件并手工接线”，而是必须提交一份可审计的能力声明：它读取什么、写入什么、依赖什么、如何失效、如何保存、如何撤销、如何渲染、如何验证。这样才真正具备地图核心引擎的可持续扩展能力。
