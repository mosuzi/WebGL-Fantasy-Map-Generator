# TypeScript 核心契约与领域接入渐进式引入计划

> 状态：候选施工计划，当前仅记录方案，不代表已批准实施。
>
> 用途：由当前项目整理后手动转移到 `D:\work\fmg-parallel`，作为后续架构施工的输入。
>
> 当前结论：引入 TypeScript，但只优先覆盖地图核心契约、Worker DTO、领域 Manifest、事务 / patch、Render layer contract 和新业务领域；不进行一次性全项目迁移。

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
      │ 保持行为不变
      ▼
TS 核心契约与 DTO
      │ 编译期约束
      ▼
DomainModuleManifest
      │ 注册依赖、Worker、视图、图层、面板
      ▼
一个低风险业务域试点
      │ 证明接入成本和验收方式
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
    "allowJs": false,
    "skipLibCheck": true
  },
  "include": [
    "app/webgl-generator/src/core/**/*.ts",
    "app/webgl-generator/src/domains/<pilot>/**/*.ts"
  ]
}
```

后续如果需要检查旧 JS，再单独增加受控配置，不首期全局打开 `checkJs`。

### 4.3 依赖和脚本

首期只需要：

- `typescript` 开发依赖；
- `tsc --noEmit` 静态门；
- Vite 原有 TS 转译能力；
- 现有 Node / browser regression。

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
  presentationRevision: number;
  renderGeneration: number;
  generationToken: number;
  lockFingerprint: string;
}
```

要求：

- map identity 变化不能伪装成 revision 增长；
- presentation revision 不得被当作 canonical revision；
- topology revision 变化必须触发正确的几何 / picking 失效；
- 对外兼容 API 可以返回旧的 `mapRevision`，内部使用完整 vector。

### 6.2 Snapshot

Snapshot 不应暴露任意可写的完整地图对象：

```ts
type SnapshotPurpose = "worker" | "query" | "render" | "persistence";

interface MapSnapshot<Sections = unknown> {
  readonly purpose: SnapshotPurpose;
  readonly identity: RevisionVector;
  readonly checksum: string;
  readonly sections: Readonly<Sections>;
}
```

实际实现应支持按 section、字段和 purpose 取快照，避免纯显示操作传输整张地图。

### 6.3 Patch

```ts
type PatchMode = "replace" | "ranges" | "sparse-values" | "table-rows";

interface DomainPatch<WriteSet extends string = string> {
  readonly patchId: string;
  readonly mapIdentity: MapIdentity;
  readonly baseRevision: MapRevision;
  readonly targetRevision: MapRevision;
  readonly domain: string;
  readonly writeSet: readonly WriteSet[];
  readonly mode: PatchMode;
  readonly forward: unknown;
  readonly inverse?: unknown;
  readonly baseChecksum: string;
  readonly targetChecksum: string;
}
```

类型只保证结构，具体 path、范围、对象身份和 checksum 仍由 runtime patch policy 验证。

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
  readonly revision: RevisionVector;
  readonly commitId: CommitId;
  readonly operationId: OperationId;
  readonly operationName: string;
  readonly generationToken: number;
  readonly lockFingerprint: string;
  readonly replicaId: string;
  readonly taskId: string;
  readonly sourceChecksum: string;
}
```

页面、计算 Worker、渲染准备 Worker 和存档 Worker 只能使用这一类 binding 适配自己的 task，不再各自发明相似字段。

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
→ core commit
→ replica patch ACK
→ render invalidation / install
```

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
└─ regression.ts            # Node / browser / old-data matrix
```

面板可以是自定义 Vue / DOM 实现，但生命周期、查询、命令、Loading、history 和 stale revision 必须通过 core adapter。

## 9. 新领域的实施顺序

### 阶段 0：准备与基线

**目标**：只引入 TS 工具链，不改变产品。

**动作**：

- 新增 `typescript` 开发依赖；
- 新增受限 `tsconfig.core.json`；
- 新增 `typecheck:core`；
- 验证 Vite build、现有 Node regression 和现有浏览器入口；
- 记录 clean build / incremental build 时间基线。

**门禁**：JS 代码行为、构建产物、版本和 `source/` 不变。

### 阶段 1：核心契约

**目标**：建立身份、revision、snapshot、patch、commit、Worker binding 类型。

**动作**：

- 创建 `src/core/contracts`；
- 为旧 JS runtime 写只读 adapter；
- 不迁移现有命令和算法；
- 增加契约构造和非法组合的 Node regression。

**门禁**：`tsc --noEmit`、package build、旧 API / save / history 回归通过。

### 阶段 2：依赖图与 Manifest

**目标**：使新领域的接入面可枚举、可审计。

**动作**：

- 定义 `DomainModuleManifest`；
- 定义 field / derived / layer / panel / API descriptor；
- 建立注册器和静态审计工具；
- 先注册一个空的试点领域，不改变地图行为；
- 校验未声明读写、未注册 command、缺迁移等错误。

**门禁**：注册器能拒绝不完整领域；现有 API capability matrix 不下降。

### 阶段 3：低风险领域试点

**推荐领域**：markers、notes 或 measurements。

**不推荐首期**：政治拓扑、城市、路线、河流、地形和大规模重生成。

**试点必须完成**：

- canonical schema；
- object identity；
- field registry；
- command / inspect / revert；
- history / undo / redo；
- Worker task 或明确声明无需 Worker；
- regeneration 或明确声明不可重生成；
- query / API；
- panel；
- view / layer；
- old-data migration；
- save / load / export；
- Node、浏览器和 failure injection。

**门禁**：新领域独立接入后，既有领域、旧存档、GPU / picking、Loading 和错误面不受影响。

### 阶段 4：Worker 协议迁移

**目标**：将新领域 Worker 接入统一 binding、patch 和 commit。

**动作**：

- Worker 只消费 typed snapshot / DTO；
- 结果必须是 typed patch / replacement / query；
- core 验证 revision、checksum、lock、write set；
- replica 只消费已提交 patch；
- 取消、obsolete、Worker restart 和 gap 触发明确失效 / resync。

**门禁**：10k、100k、快速重复操作、旧数据和 Worker 重启通过；无陈旧结果覆盖新 revision。

### 阶段 5：真实 renderer layer 迁移

**目标**：验证新领域能独立提供视图和图层。

**动作**：

- 新领域 layer 只读 snapshot；
- 纯 view 走 palette / uniform / visibility；
- 几何变化走 prepare / install / rollback；
- picking 使用同一 identity / geometry version；
- context restore 从 snapshot 重建资源；
- PNG / overlay / label 行为明确声明。

**门禁**：普通 view 不触发地图 Worker；业务修改只失效依赖图命中的 layer；WebGL error 为 `0`。

### 阶段 6：扩大范围

只有低风险试点通过后，才考虑迁移 economy、diplomacy、military、settlements 等复杂领域。每次只迁移一个领域，保留旧 JS adapter 和回滚开关，不能批量改名或批量重写。

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
- 浏览器真正的 map / Worker / render / UI 时间。

不能把类型检查时间误报成产品运行时性能，也不能为了构建速度取消真实浏览器门。

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

手动转移到 `fmg-parallel` 后，计划阶段应产出：

1. `tsconfig.core.json`；
2. `typecheck:core` 脚本；
3. `src/core/contracts` 类型契约；
4. `DomainModuleManifest` 和注册器；
5. Worker binding / result / patch 类型；
6. dependency / layer / panel descriptor 类型；
7. 一个低风险领域完整试点；
8. core contract audit；
9. 类型检查时间、Vite build 时间和浏览器性能对照报告；
10. 旧 JS、旧存档、API、Worker、renderer 和浏览器回归报告。

## 14. 停止条件

出现以下任意情况时冻结，不继续扩大 TS 范围：

- 需要修改业务规则才能通过类型检查；
- 需要批量改名旧模块才能建立首个契约；
- runtime schema 与 TS 类型无法确定谁是权威来源；
- 类型检查开始遮蔽真实浏览器或旧数据失败；
- Vite / Worker 构建出现无法归因的行为变化；
- 试点领域无法在不改既有语义的前提下完成完整回归；
- 同一个构建或类型阻断连续两次出现。

## 15. 推荐落点

最稳妥的第一步不是“把项目改成 TS”，而是：

> 在 `fmg-parallel` 新建 `src/core/contracts`，用 TypeScript 定义 `RevisionVector`、`MapSnapshot`、`DomainPatch`、`CommitEnvelope`、`WorkerBinding` 和 `DomainModuleManifest`，再用 markers / notes / measurements 之一做完整接入试点。

如果这一步能证明新增领域的 Worker、重生成、视图、图层、面板、编辑、API、存档和验收都能通过统一 Manifest 接入，才继续扩大 TS 覆盖面。
