# TypeScript 核心契约与领域接入渐进式引入计划

> 状态：第 349 项已批准施工计划；当前按 [统一执行记录](./task-349-map-core-engine-execution.md) 与引擎计划的唯一阶段链实施。
>
> 分支：只在 `codex/map-core-engine-architecture-plan` 与 `main` 并行推进，不得合入 `main`。
>
> 当前结论：引入 TypeScript，但只优先覆盖地图核心契约、Worker DTO、领域 Manifest、事务 / patch、Render layer contract 和迁移切片；不进行一次性全项目迁移。全阶段不执行浏览器验收，最终只形成并评估浏览器验收方案。

## 1. 背景与决策

当前正式应用以 JavaScript 为主，已有大量 runtime、generator、renderer、UI、Worker、API 和存档模块。引入 TypeScript 的目的不是重写现有代码，也不是让所有文件马上拥有完整类型，而是把已经确定的领域边界变成可检查的契约。

需要优先固化的边界包括：

- canonical map 与 derived data 的区别；
- `mapIdentity`、`mapRevision`、`topologyRevision` 与 presentation revision；
- Worker request / result / patch / checksum；
- command、regeneration plan、commit envelope、undo / redo；
- dependency registry；
- Render layer、overlay、picking 和 GPU resource owner；
- 新业务域的 schema、查询、API、面板和持久化迁移。

TypeScript 类型不能替代运行时 schema。JSON、旧存档、Worker structured clone、浏览器 storage 和用户输入仍必须经过现有 runtime validation、migration、checksum 和 preflight。

## 2. 目标与非目标

### 2.1 目标

1. 新增核心契约时，编译器能阻止 revision、patch、snapshot、Worker result 混用。
2. 新增业务领域时，必须明确 canonical、derived、Worker、regeneration、view、layer、panel、API、persistence 和测试入口。
3. Worker 协议在页面、计算 Worker、渲染准备 Worker 和存档 Worker 之间共享类型定义。
4. 让新的 renderer layer 通过 descriptor 注册，不依赖 `app.js` 中隐式 switch。
5. 让领域命令、重新生成、撤销 / 重做和 commit envelope 共用类型契约。
6. 保持现有 JS、Vite、旧存档、公开 API、视觉结果和性能基线兼容。
7. 让类型检查独立于 Vite 构建，不阻塞正常开发热更新。

### 2.2 非目标

- 不一次性把现有 300 多个 JS 文件改名为 `.ts`；
- 不首期给整个地图对象建立极端复杂的递归类型；
- 不以 TS 类型替代 `api-schema-registry`、map migration 或 Worker runtime assertions；
- 不在本计划中改变地图生成算法、业务规则和渲染算法；
- 不因类型迁移顺手重构 `app.js`、旧领域命令或 UI 面板；
- 不引入大型运行时类型框架作为首期前置条件；
- 不把类型安全当成浏览器、视觉、旧数据和性能验收的替代品。

## 3. 总体策略

采用“JS 与 TS 共存、契约先行、领域试点、逐步扩大”的策略：

```text
现有 JS 实现
      │ adapter / shadow audit，保持行为不变
      ▼
TS 核心契约与 DTO
      │ 编译期约束
      ▼
DomainModuleManifest
      │ 注册依赖、Worker、视图、图层、面板
      ▼
一个低风险业务域试点
      │ notes / markers / Worker 分离切片
      ▼
逐个迁移核心 Worker / renderer / domain
```

TypeScript 的第一批文件只描述边界，不直接重写内部算法。旧 JS 模块可以通过 adapter 返回符合 TS 类型的对象；新领域则直接使用 TS 实现。

## 4. 构建与类型检查策略

### 4.1 Vite 构建和 `tsc` 分工

```text
Vite / esbuild：负责 TS 转译、打包和开发热更新
tsc --noEmit：负责静态类型检查
runtime schema：负责运行时输入、旧数据和跨线程数据校验
```

生产构建不直接把 `tsc` 作为每个热更新的阻塞前置。CI 或提交门再运行类型检查。

### 4.2 初始 TypeScript 配置

首期新增一个受限 `tsconfig.core.json`，只包含新建的核心契约和试点领域：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true
  },
  "include": [
    "app/webgl-generator/src/core/**/*.ts",
    "app/webgl-generator/src/domains/<pilot>/**/*.ts"
  ]
}
```

`allowJs: true / checkJs: false` 只允许新 TS adapter 解析既有 JS 依赖，不把旧 JS 纳入类型整改；核心 adapter 必须使用显式 `.d.ts`、JSDoc 边界或 runtime validator 收窄 `unknown`，不得长期依赖隐式 `any`。后续若需要检查旧 JS，再单独增加受控配置，不首期全局打开 `checkJs`。

### 4.3 依赖和脚本

首期只需要：

- `typescript` 开发依赖；
- `tsc --noEmit` 静态门；
- Vite 原有 TS 转译能力；
- 现有 Node regression，以及只在 `349-11` 盘点而不执行的 browser regression 方案。

建议新增脚本：

```json
{
  "typecheck:core": "tsc -p tsconfig.core.json --noEmit",
  "audit:core-contracts": "node ./tools/webgl-generator-core-contract-audit.mjs"
}
```

不要首期引入运行时反射、装饰器或复杂自动 schema 生成。类型和 runtime schema 可以先通过明确的 DTO 映射保持一致。

## 5. 建议目录结构

第一阶段不移动旧文件，只新增边界目录：

```text
app/webgl-generator/src/
├─ core/
│  ├─ contracts/
│  │  ├─ map-identity.ts
│  │  ├─ revision.ts
│  │  ├─ snapshot.ts
│  │  ├─ patch.ts
│  │  ├─ commit.ts
│  │  ├─ worker.ts
│  │  ├─ dependency.ts
│  │  ├─ domain-module.ts
│  │  ├─ render-layer.ts
│  │  └─ panel.ts
│  ├─ adapters/
│  │  ├─ legacy-runtime-adapter.ts
│  │  ├─ legacy-api-adapter.ts
│  │  └─ legacy-renderer-adapter.ts
│  └─ index.ts
├─ domains/
│  └─ <pilot-domain>/
│     ├─ manifest.ts
│     ├─ schema.ts
│     ├─ commands.ts
│     ├─ regeneration.ts
│     ├─ worker-task.ts
│     ├─ queries.ts
│     ├─ migration.ts
│     ├─ api.ts
│     ├─ panel.ts
│     ├─ view.ts
│     ├─ render-layer.ts
│     └─ regression.ts
```

旧的 `runtime/`、`generator/`、`renderer/`、`ui/` 保持原位置，由 adapter 逐步接入；不能因为引入 TS 同时进行大规模目录迁移。

## 6. 首批核心类型契约

### 6.1 身份和 revision

需要使用品牌化类型或封装对象，避免普通 `string` / `number` 互换：

```ts
type MapIdentity = string & {readonly __brand: "MapIdentity"};
type CommitId = string & {readonly __brand: "CommitId"};
type OperationId = string & {readonly __brand: "OperationId"};
type MapRevision = number & {readonly __brand: "MapRevision"};

interface RevisionVector {
  mapIdentity: MapIdentity;
  mapRevision: MapRevision;
  topologyRevision: number;
  domainRevisions: Readonly<Record<string, number>>;
}

interface OperationBinding {
  readonly operationId: OperationId;
  readonly sourceRevision: RevisionVector;
  readonly generationToken: number;
  readonly lockFingerprint: string;
}

interface RenderResourceBinding {
  readonly mapIdentity: MapIdentity;
  readonly sourceRevision: MapRevision;
  readonly topologyRevision: number;
  readonly renderGeneration: number;
}
```

要求：

- map identity 变化不能伪装成 revision 增长；
- presentation revision 和 render generation 使用独立类型，不得被当作 canonical revision；
- topology revision 变化必须触发正确的几何 / picking 失效；
- 对外兼容 API 可以返回旧的 `mapRevision`，内部使用完整 vector。

### 6.2 Snapshot

Snapshot 不应暴露任意可写的完整地图对象：

```ts
type SnapshotPurpose = "worker" | "query" | "render" | "persistence";
type SnapshotOwnership = "borrowed" | "cloned" | "transferable" | "shared-readonly";

interface MapSnapshot<Sections = unknown> {
  readonly purpose: SnapshotPurpose;
  readonly ownership: SnapshotOwnership;
  readonly revision: RevisionVector;
  readonly checksum: string;
  readonly sections: Readonly<Sections>;
}
```

`Readonly<Sections>` 只是编译期浅只读，不能阻止嵌套对象或 TypedArray 修改，也不能表达 ArrayBuffer transfer / detach。实际实现必须同时用 runtime ownership validator 约束 borrowed、clone、transfer 和 shared buffer，并支持按 section、字段和 purpose 取快照，避免纯显示操作传输整张地图。

### 6.3 Patch

```ts
type PatchMode = "replace" | "ranges" | "sparse-values" | "table-rows";

interface ComputedDomainPatch<WriteSet extends string = string> {
  readonly patchId: string;
  readonly mapIdentity: MapIdentity;
  readonly baseRevision: MapRevision;
  readonly domain: string;
  readonly writeSet: readonly WriteSet[];
  readonly mode: PatchMode;
  readonly forward: unknown;
  readonly inverse?: unknown;
  readonly baseChecksum: string;
  readonly targetChecksum: string;
}

interface CommittedDomainPatch<WriteSet extends string = string>
  extends ComputedDomainPatch<WriteSet> {
  readonly commitId: CommitId;
  readonly targetRevision: MapRevision;
}
```

Worker 只能返回 `ComputedDomainPatch`，不得提前宣称 canonical `targetRevision`。core 在校验并接纳时分配 revision 和 commit identity，形成 `CommittedDomainPatch`。类型只保证结构，具体 path、范围、对象身份和 checksum 仍由 runtime patch policy 验证。

### 6.4 Commit envelope

```ts
interface CommitEnvelope {
  readonly commitId: CommitId;
  readonly kind: "edit" | "regenerate" | "import" | "undo" | "redo" | "adoption";
  readonly source: "ui" | "api" | "worker" | "storage";
  readonly before: RevisionVector;
  readonly after: RevisionVector;
  readonly writeSet: readonly string[];
  readonly affected: Readonly<AffectedSet>;
  readonly invalidated: readonly string[];
  readonly rebuilt: readonly string[];
  readonly timings: Readonly<Record<string, number>>;
}
```

Commit envelope 是核心内部协议和诊断对象，不直接进入普通 UI 文案。

## 7. Worker 类型边界

### 7.1 统一 binding

```ts
interface WorkerBinding {
  readonly mapIdentity: MapIdentity;
  readonly sourceRevision: RevisionVector;
  readonly operationId: OperationId;
  readonly operationName: string;
  readonly generationToken: number;
  readonly lockFingerprint: string;
  readonly replicaId: string;
  readonly taskId: string;
  readonly sourceChecksum: string;
}
```

页面、计算 Worker、渲染准备 Worker 和存档 Worker 共享 operation binding vocabulary，但用判别字段表达各自 profile。计算阶段不得要求尚未产生的 `commitId`；只有已提交 replica patch 的 projection binding 携带 `commitId`。

### 7.2 统一 Worker result

```ts
type WorkerResult<TPatch, TReplacement, TPrepared, TQuery> =
  | {resultKind: "patch"; binding: WorkerBinding; patch: TPatch; affected: AffectedSet}
  | {resultKind: "replacement"; binding: WorkerBinding; replacement: TReplacement; affected: AffectedSet}
  | {resultKind: "render-prepared"; binding: WorkerBinding; prepared: TPrepared}
  | {resultKind: "query"; binding: WorkerBinding; data: TQuery};
```

Worker 不得直接写正式地图。必须经过：

```text
capture snapshot
→ Worker compute
→ validate binding / lock / patch policy
→ prepare required projections without publishing
→ core commit canonical + history + revision
→ publish commit to UI / API / persistence
→ coordinator settle replica ACK / renderer install
→ projection failure enters degraded / retry / resync
```

publish 前失败可以回滚 canonical / history 和释放 prepared projection；publish 后不得因为 replica 或 renderer 失败反向改写已观察的 canonical history。

纯 view / palette / visibility 操作不创建业务 Worker result。

## 8. DomainModuleManifest

### 8.1 领域模块的最低注册要求

```ts
interface DomainModuleManifest {
  readonly id: string;
  readonly version: number;
  readonly canonicalSections: readonly string[];
  readonly derivedSystems: readonly DerivedSystemDescriptor[];
  readonly commands: readonly CommandDescriptor[];
  readonly regeneration?: RegenerationDescriptor;
  readonly workerTasks?: readonly WorkerTaskDescriptor[];
  readonly queries?: readonly QueryDescriptor[];
  readonly views?: readonly ViewDescriptor[];
  readonly layers?: readonly RenderLayerDescriptor[];
  readonly panels?: readonly PanelDescriptor[];
  readonly persistence: PersistenceDescriptor;
  readonly api?: ApiDescriptor;
  readonly locks?: LockDescriptor;
  readonly capabilities: Readonly<{
    worker: "required" | "optional" | "not-required";
    regeneration: "required" | "optional" | "unsupported";
    view: "required" | "optional" | "not-required";
    renderLayer: "required" | "optional" | "not-required";
  }>;
}
```

注册审计必须拒绝以下情况：

- canonical field 未在 field registry 登记；
- command 没有 write set 或 undo 策略；
- regeneration 没有 source revision / binding / replacement policy；
- Worker task 没有 result kind 和 patch policy；
- layer 读取了未声明的字段；
- panel 调用了未注册的 command；
- persistence 没有 migration / backfill / old-sample；
- API 方法未进入 schema 和能力矩阵。

### 8.2 新业务域示例

以 `trade-policy` 为例：

```text
domains/trade-policy/
├─ manifest.ts             # 汇总注册
├─ schema.ts               # canonical 与 derived 类型
├─ commands.ts             # inspect / execute / revert
├─ regeneration.ts         # from-empty / repair / localized
├─ worker-task.ts           # Worker DTO 与计算入口
├─ queries.ts               # read-only 查询
├─ migration.ts             # 旧图 backfill / 迁移
├─ api.ts                   # API adapter / schema metadata
├─ view.ts                  # view mode / palette
├─ render-layer.ts          # geometry / overlay / picking
├─ panel.ts                 # 面板生命周期和领域控件
└─ regression.ts            # Node / old-data matrix 与 browser 待执行方案元数据
```

面板可以是自定义 Vue / DOM 实现，但生命周期、查询、命令、Loading、history 和 stale revision 必须通过 core adapter。

## 9. 统一实施顺序

TypeScript 不再维护一套与引擎计划冲突的独立阶段。唯一顺序为：

1. `349-0` 计划与权威冻结；
2. `349-1` 只读盘点真实 owner、事务、buffer ownership 和构建边界；
3. `349-2` 受限 TS 工具链，运行行为和构建产物除版本注入外不变；
4. `349-3` 核心契约与 runtime validator，不接管旧 action；
5. `349-3a` canonical field registry、persisted / live presentation、普通 document identity 定义 / 迁移和 identity adapter 闭合；
6. `349-4` capability-aware Manifest 与影子审计；
7. `349-5` 薄 facade 与 commit / projection 影子记录；
8. `349-6` notes 事务 / 存档切片；
9. `349-7` markers layer / picking 切片；
10. `349-8` 以 `population.compute` 为默认真实 Worker task 的协议切片；
11. `349-9` dependency / projection 接线；
12. `349-10a` terrain / grid / height-derived / climate / ocean / topology；
13. `349-10b` society / politics 与 pack mirror；
14. `349-10c` settlements / zones / labels / measurements；
15. `349-10d` routes / rivers / features / resource markers；
16. `349-10e` economy / diplomacy / military；
17. `349-10f` generation / import / adoption / export / headless profile；
18. `349-10g` legacy adapter、重复 revision / history 和影子双写收口；
19. `349-11` build、typecheck、非浏览器终验和浏览器验收方案评估。

`349-3a` 不是扩张 TypeScript 范围：它修复 `349-1` 证实的现有存档字段注册遗漏，定义普通 persisted document identity 的派生 / 默认值 / 迁移，并强制各类 identity 通过显式 adapter 转换；完整证据与 ADR 见 [核心架构盘点](./task-349-core-architecture-inventory.md)。

每阶段都有独立 checkpoint 和只读智能体评审。不得为了满足 Manifest 人工制造无业务意义的 Worker、regeneration、view 或 layer；缺失能力必须通过 `capabilities` 显式声明。

## 10. 编辑、重生成、视图和面板的验收矩阵

| 能力 | 必须验证 |
| --- | --- |
| 新增对象 | ID 分配、默认值、canonical write set、history、save |
| 编辑对象 | inspect、非法输入、锁、command、undo / redo |
| 删除对象 | 引用清理、派生失效、picking、恢复 |
| 全量重生成 | from-empty、source revision、Worker、replacement、identity policy |
| 修复重生成 | repair、保留合法数据、锁定对象、冲突诊断 |
| 局部重生成 | affected scope、局部 patch、未影响对象 identity 保持 |
| 普通视图 | map revision 不变、Worker input `0`、GPU patch / palette |
| 几何图层 | cache key、topology invalidation、atomic install、rollback |
| 面板 | query、command、Loading、stale、selection、错误恢复 |
| API | discover、schema、确认、错误码、capability matrix |
| 存档 | 新格式、旧格式、migration、backfill、round-trip、损坏定位 |
| Worker | binding、checksum、ACK、cancel、restart、resync |

## 11. 构建与性能验收

需要同时记录四种时间：

- Vite 转译 / 打包时间；
- `tsc --noEmit` 类型检查时间；
- Node regression 总时间；
- `349-11` 浏览器方案中预定记录的 map / Worker / render / UI 时间分段与采样方法；本任务不执行采样。

不能把类型检查时间误报成产品运行时性能，也不能把“浏览器方案已评估”误报成“真实浏览器门已通过”。

阶段性目标：

- 首批 core 类型检查只覆盖新增目录；
- 热更新不强制全项目类型检查；
- 类型检查增量化，避免每个测试重复执行；
- 生产 bundle 不因类型声明产生额外运行时体积；
- 新领域的普通视图不增加地图输入和 render preparation；
- 新领域重生成的领域计算、patch、索引和渲染安装必须分别计时。

## 12. 风险和回滚

### 风险

- JS / TS 共存导致 import 类型和运行时值混淆；
- 类型定义与 runtime schema 漂移；
- 地图对象、TypedArray、稀疏数组和旧存档类型过于复杂；
- 新领域 Manifest 变成形式审查，实际依赖仍隐藏在代码里；
- `tsc` 纳入范围扩大后构建或 CI 变慢；
- 类型迁移与业务修复混在一起，难以定位回归。

### 应对

- 使用 `import type`、`verbatimModuleSyntax` 和明确 DTO；
- 每个跨边界类型同时拥有 runtime validator；
- 首期不严格类型化完整 map，只类型化 snapshot / DTO / patch；
- 注册器静态审计 + 运行时 failure injection；
- 分项目、分领域启用 tsconfig；
- 每阶段只改一个边界，保留 JS adapter；
- 新类型失败时回退到旧 action，不影响正式地图。

## 13. 最终交付物

第 349 项完成时应产出：

1. `tsconfig.core.json`；
2. `typecheck:core` 脚本；
3. `src/core/contracts` 类型契约；
4. `DomainModuleManifest` 和注册器；
5. Worker binding / result / patch 类型；
6. dependency / layer / panel descriptor 类型；
7. 一个低风险领域完整试点；
8. core contract audit；
9. 类型检查时间、Vite build 时间和非浏览器性能对照报告；
10. 旧 JS、旧存档、API、Worker、renderer 的非浏览器回归报告；
11. 未执行但经过可行性评估的浏览器验收方案。

## 14. 停止条件

出现以下任意情况时冻结，不继续扩大 TS 范围：

- 需要修改业务规则才能通过类型检查；
- 需要批量改名旧模块才能建立首个契约；
- runtime schema 与 TS 类型无法确定谁是权威来源；
- 类型检查开始遮蔽旧数据失败，或计划文本把未执行的浏览器方案误报为已通过；
- Vite / Worker 构建出现无法归因的行为变化；
- 试点领域无法在不改既有语义的前提下完成完整回归；
- 同一个构建或类型阻断连续两次出现。

## 15. 推荐落点

最稳妥的第一步不是“把项目改成 TS”，而是：

> 先完成 `349-1` 的真实 owner 与状态机盘点，再在本分支新建 `src/core/contracts`，用 TypeScript 分别定义 canonical revision、operation binding、snapshot ownership、commit lifecycle、Worker DTO 和 capability-aware Manifest；随后以 notes、markers 和一个真实 Worker task 三个独立切片验证。

只有三个切片分别证明事务 / 持久化、renderer / picking 和 Worker 协议可接入，且没有第二 canonical owner，才继续扩大 TS 覆盖面。
