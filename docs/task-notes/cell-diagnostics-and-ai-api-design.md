# Cells 诊断图层与 AI 可判定 API 设计

> 状态：权威任务第 195 项设计与实施权威编排；原设计于 2026-07-24 完成，2026-07-25 消费第 200 项真实能力矩阵后重写施工阶段，新智能体第三轮评审结论为 `RELEASE`；阶段 A 未提交实现尝试已通过专项与真实 Chrome 验收。

## 一、问题与目标

真实旧存档的“新增国家失灵”暴露了两个相互关联的问题：

1. 地图上缺少直接显示全部基础 cells 的诊断图层。视觉上出现异常区域时，用户和开发者很难迅速确认具体 `grid cell ID`、相邻单元、底层高度、feature 与 `pack` 映射。
2. 现有公共 API 虽然已经覆盖 `edit.states.add(gridCell)`，但 AI 或自动化在调用前无法通过稳定、无副作用的结构化接口判断“这个 cell 是否允许创建国家”。失败时主要依赖状态栏中文文案、画面和通用 `api_error`，不利于自动归因。

本方案把二者统一为一套“可见、可查询、可预检、可定位”的地图诊断体系：

- Cells 图层负责把底层 cell 边界和 ID 映射到画面。
- `api.cells` 负责查询 cell 快照、邻接、定位、扫描和动作预检。
- `api.edit.states.inspectCreateAtCell` 负责无副作用地判断是否允许创建国家。
- `api.edit.states.createAtCell` 负责在确认后执行真实创建。
- 既有 `api.edit.states.add(gridCell)` 保留为兼容别名，不能直接删除或改变旧调用语义。

## 二、现状证据

### 2.1 数据与渲染

- 基础渲染图使用 `grid.points + grid.cells.v + grid.vertices.p`；`grid cell ID` 是稳定的底层单元标识。
- `pack` 是业务语义图，`pack.cells.g` 把一个或多个 pack cells 映射回 grid cell。
- 国家创建入口接收 `gridCell`，随后选择对应的陆地 `packCell`，再创建国家、省份与首都。
- 现有悬停拾取已经可以返回 `gridCell / packCell`，但没有一个可持久开启、显示全部 cell 边界的正式图层。

### 2.2 图层系统

- `PlaceholderMapRenderer.layerVisibility` 已统一管理道路、河流、城市、标签、国界、省界、水陆线等图层。
- 控制面板“图层”页通过 `data-layer`、全局显示偏好和 `api.layers.setVisible(layer, visible)` 共用同一运行时链路。
- 新的 Cells 图层应沿用此链路，属于显示偏好，不修改地图数据，不进入 `EditHistory`。

### 2.3 API 系统

- 当前公共 API 根对象是 `window.webglGeneratorApi`，开发便利别名为 `window.api`。
- 当前未提交工作区基线为 `14` 个命名空间、`251` 个方法，其中 `135` 个编辑方法；根版本为 `1.0.0 / stable`。
- API 使用统一外层结果：

```js
{
  ok: true,
  data: {},
  metadata: {at: "ISO timestamp"}
}
```

- `api.edit.states.add(gridCell)` 已存在，并走 `createAddStateAtCellCommand()` 和统一编辑历史。
- 命令内部已有 `inspectStateCreation(map, gridCell)`，能产生：
  - `ok`
  - `grid-cell-invalid`
  - `grid-cell-water`
  - `pack-cell-missing`
  - `capital-province-protected`
- 但该预检没有作为公共 API 暴露；当 `states.add` 因业务条件成为 noop 时，现有 `editApiResult()` 也不会稳定返回预检 code。
- `api.info.capabilities()` 已有方法级副作用、撤销、异步和确认元数据，但还没有完整输入 schema、结果 schema、业务 code 枚举和示例。

## 三、设计原则

### 3.1 视觉与数据必须双向可定位

任何 API 返回的 cell ID，都应能被 Cells 图层或定位 API 在画面上找到；任何画面上悬停的 cell，都应能通过 API 获得结构化快照。

### 3.2 判断与写入严格分离

AI 判断“能否创建”时不能调用真实创建再撤销。标准流程必须是：

1. `inspectCreateAtCell`：只读预检。
2. 根据 `allowed / code / reasons` 决策。
3. 需要真实执行时，再调用 `createAtCell`。

### 3.3 `ok` 不等于业务允许

统一结果中的 `ok` 只表示 API 调用本身成功完成：

- `ok: false`：参数解析失败、方法不存在、运行时异常等 API 失败。
- `ok: true, data.allowed: false`：预检成功，但业务规则明确拒绝。
- `ok: true, data.executed: false`：写入 API 没有执行，必须带稳定 `code` 和预检快照。
- `ok: true, data.executed: true`：写入成功。

不能再把“业务不允许”伪装成通用异常，也不能只返回中文 message。

### 3.4 明确区分 grid 与 pack

公共 API 禁止用裸 `cellId` 暗示其空间。统一引用结构为：

```js
{space: "grid", id: 3387}
{space: "pack", id: 1264}
```

国家创建第一阶段只接受 `space: "grid"`。如果调用方传入 pack cell，应返回明确 `cell-space-not-supported`，并可在建议中给出其映射 grid cell。

为兼容既有脚本，`states.add(3387)` 和新方法直接传数字时仍解释为 grid cell。

### 3.5 所有结果可 JSON 序列化

公共 API 不返回内部 `Map`、`Set`、typed array 或可写对象引用。大型数组默认分页或摘要化，几何顶点必须显式请求。

### 3.6 旧图异常是可观测信息

旧存档中“高度低于海平面但 feature 标记陆地”“pack 映射缺失”“政治 ID 超出归属数组容量”等情况，应成为结构化 diagnostics / warnings，而不是等到写入时报一个无上下文异常。

## 四、Cells 图层设计

### 4.1 图层身份

首期只新增一个正式图层：

```text
内部 ID：gridCells
界面名称：网格单元
说明：显示全部 Grid Cells 边界；不是 Pack Cells
默认状态：关闭
持久化：跟随全局图层显示偏好
编辑历史：不进入
PNG 导出：首期默认排除
```

不建议直接命名为模糊的 `cells`，因为项目同时存在 grid cells 与 pack cells。界面可以显示“网格单元”，帮助信息必须明确“Grid Cells”。

Pack Cells 诊断层作为后续独立候选 `packCells`，没有获得实施批准前不与首期绑定。

### 4.2 视觉层级

推荐顺序：

```text
surface
ocean currents
routes / rivers / political boundaries
gridCells
selection / locate flash
DOM labels and panels
```

Cells 边界高于地图内容但低于选择与定位高亮，保证诊断线可见，又不会盖住用户当前锁定的目标。

默认样式：

- 线宽：设备像素约 `1px`，不随世界尺度变成粗带。
- 颜色：中性深墨色，低透明度；夜间主题使用浅灰蓝。
- 共享边只绘制一次，避免双重叠加导致局部边线更深。
- 海陆 cell 都显示，满足“展示所有 cells”的要求。
- 不用不同颜色暗示是否支持某项编辑，避免把单一动作规则误认为 cell 固有属性。

### 4.3 ID 与交互

- 图层开启后，悬停卡片固定增加：
  - `Grid Cell #3387`
  - 主映射 `Pack Cell #1264`
  - 映射 pack cells 数量
- Cell ID 文字默认不全量显示，避免 10k～100k 标签淹没地图。
- 当相机缩放达到可读阈值时，可显示当前视口内的 grid cell ID；默认上限受视口和标签预算约束。
- API 定位或问题扫描返回 cell 时，使用独立高亮：
  - 单 cell：强调描边并短暂闪烁。
  - 多 cells：填充低透明诊断色，边界仍由 `gridCells` 图层绘制。
- 点击普通 cell 仍沿用现有对象选择，不因打开诊断图层改变编辑模式。

### 4.4 渲染与性能

首期推荐使用独立静态边线 buffer：

1. 从 `grid.cells.v` 与 `grid.vertices.p` 收集 cell 多边形边。
2. 以规范化顶点对去重共享边。
3. 首次打开图层时异步分片构建，后续复用。
4. 地图替换、导入或网格拓扑改变时失效；高度、国家、省份、颜色编辑不重建。
5. 使用 `GL.LINES` 绘制约 `1px` 诊断线，避免把每条边扩成三角带造成过大的 GPU buffer。

性能门禁：

- 10k、50k、100k 三档记录构建时间、buffer 字节数、draw 时间和主线程最长切片。
- 图层关闭时不产生 draw call。
- 图层首次打开允许显示“正在构建网格诊断层”，但不能阻塞其它图层交互。
- 100k cells 下平移缩放不能因为 cell ID DOM 标签而失控；ID 只处理视口内且受预算限制。

### 4.5 图层 API

沿用既有接口：

```js
api.layers.setVisible("gridCells", true)
api.layers.get()
```

返回快照应包含：

```js
{
  layers: {
    gridCells: true
  },
  diagnostics: {
    gridCells: {
      ready: true,
      edges: 300312,
      buildMs: 18.4,
      bufferBytes: 14414976,
      visibleIds: 126
    }
  }
}
```

## 五、`api.cells` 命名空间

新增第 12 个公共命名空间 `cells`。它用于读 cell 和诊断动作，不直接修改地图归属。

### 5.1 `cells.get`

```js
api.cells.get({space: "grid", id: 3387}, {
  includeGeometry: false,
  includeNeighbors: true,
  includeDiagnostics: true
})
```

建议返回：

```js
{
  ok: true,
  data: {
    ref: {space: "grid", id: 3387},
    center: {x: 901.2, y: 421.8},
    geometry: {
      vertexCount: 6,
      vertices: null
    },
    terrain: {
      height: 50,
      heightLand: true,
      featureId: 2,
      featureType: "island",
      featureLand: true,
      consistency: "ok"
    },
    mapping: {
      primaryPackCell: 1264,
      packCells: [1264, 1265],
      packCellCount: 2
    },
    ownership: {
      stateId: 3586,
      provinceId: 131,
      cultureId: 7,
      religionId: 3
    },
    occupants: {
      burgIds: [],
      cityIds: [],
      capitalStateIds: []
    },
    neighbors: [3264, 3265, 3386, 3388, 3508, 3509],
    diagnostics: []
  },
  metadata: {
    action: "cells.get",
    readonly: true,
    mapRevision: "..."
  }
}
```

`includeGeometry: true` 时才返回顶点坐标，避免 AI 在普通诊断中获取大量无用数据。

### 5.2 `cells.getAtPoint`

```js
api.cells.getAtPoint({
  coordinateSpace: "client",
  x: 1740,
  y: 347
})
```

首期复用现有 `selection.pick` 的画布到世界坐标换算，但返回规范 cell 快照，不修改当前选择和 pick 面板。

支持的坐标空间：

- `client`：浏览器 client 坐标。
- `world`：地图世界坐标。

未命中 cell 时返回 `ok: true`、`data.found: false` 和 `code: "cell-not-found"`。

### 5.3 `cells.neighbors`

```js
api.cells.neighbors({space: "grid", id: 3387}, {depth: 1, limit: 128})
```

返回按层级分组的只读 cell refs。`depth` 首期限制为 `1～3`，防止一次请求遍历整图。

### 5.4 `cells.query`

```js
api.cells.query({
  space: "grid",
  filter: {
    land: true,
    stateId: 3586,
    consistency: ["height-feature-mismatch"]
  },
  fields: ["id", "height", "featureId", "stateId", "provinceId"],
  limit: 200,
  cursor: null
})
```

约束：

- 默认 `limit=100`，硬上限 `1000`。
- 返回 opaque cursor，不允许 AI 假定底层数组布局。
- 不返回内部数组引用。
- 常用字段白名单化，未知字段明确失败。

### 5.5 `cells.locate`

```js
api.cells.locate({space: "grid", id: 3387}, {
  fit: true,
  flash: true,
  openLayer: true
})
```

该方法只修改相机、临时高亮和可选图层显示，不修改地图数据，不进入撤销栈。返回定位前后相机摘要和高亮状态。

### 5.6 `cells.inspectAction`

通用只读动作诊断：

```js
api.cells.inspectAction(
  "states.createAtCell",
  {cell: {space: "grid", id: 3387}},
  {}
)
```

它把 cell 查询与领域预检统一到一个 AI 易发现入口，内部委托给领域 inspector，不能复制另一套规则。

唯一规范签名冻结为 `cells.inspectAction(actionId, input, options = {})`。`actionId` 采用 `<domain>.<verb>` 或 `<domain>.<verb>AtCell`；`CANVAS_TOOL_MODE` 的 `modeId` 只作为 registry 映射元数据，不得直接充当公共 actionId。旧稿中只登记国家、省份、城市三类创建动作的范围已由本次 P0 重编排替代：registry 必须覆盖当前全部 `28` 个画布模式，以及机器矩阵纳入的标签、测量和基础选择入口。

没有 inspector 的动作返回 `action-not-inspectable`，不能猜测。

### 5.7 `cells.scan`

批量发现问题区域：

```js
api.cells.scan({
  space: "grid",
  checks: [
    "terrain-consistency",
    "pack-mapping",
    "political-owner-range",
    "states.createAtCell"
  ],
  filter: {viewport: true},
  limit: 500
})
```

返回：

- 各 code 数量。
- 代表性 cell IDs。
- 分页后的命中列表。
- `locate` 所需 refs。
- 是否截断和继续 cursor。

首期不要求扫描 100k cells 后直接生成 DOM 标签；结果只通过诊断高亮显示。

## 六、国家创建 API 设计

### 6.1 只读预检

规范方法：

```js
api.edit.states.inspectCreateAtCell({
  cell: {space: "grid", id: 3387}
})
```

为控制台便利，允许：

```js
api.edit.states.inspectCreateAtCell(3387)
```

返回示例：

```js
{
  ok: true,
  data: {
    allowed: false,
    code: "capital-province-protected",
    summary: "不能在滕联邦共和国首都所在的省份 #131 创建国家。",
    reasons: [{
      code: "capital-province-protected",
      blocking: true,
      subject: {kind: "state", id: 3586},
      details: {
        provinceId: 131,
        protectedStateId: 3586
      }
    }],
    cell: {
      ref: {space: "grid", id: 3387},
      primaryPackCell: 1264,
      stateId: 3586,
      provinceId: 131
    },
    predicted: null,
    warnings: [],
    inspectionToken: "opaque",
    mapRevision: "opaque"
  },
  metadata: {
    action: "edit.states.inspectCreateAtCell",
    readonly: true
  }
}
```

允许时：

```js
{
  allowed: true,
  code: "ok",
  predicted: {
    tentativeStateId: 4010,
    tentativeProvinceId: 236,
    seedGridCells: [3387, 3388],
    capitalMode: "reuse-burg-or-create"
  }
}
```

`predicted` 中的 ID 必须标为 tentative；真实写入前地图可能发生变化。

### 6.2 真实创建

规范方法：

```js
api.edit.states.createAtCell({
  cell: {space: "grid", id: 3387},
  inspectionToken: "opaque",
  expectedRevision: "opaque"
})
```

成功返回：

```js
{
  ok: true,
  data: {
    executed: true,
    noop: false,
    code: "created",
    created: {
      stateId: 4010,
      provinceId: 236,
      cityId: 812,
      burgId: 813,
      gridCells: [3387, 3388],
      gridCellCount: 2
    },
    affected: [
      {kind: "state", id: 4010},
      {kind: "province", id: 236},
      {kind: "city", id: 812}
    ],
    history: {},
    rollback: {
      available: true
    }
  },
  metadata: {
    action: "edit.states.createAtCell",
    mapRevisionBefore: "opaque",
    mapRevisionAfter: "opaque"
  }
}
```

如果调用时条件已经变化：

```js
{
  ok: true,
  data: {
    executed: false,
    noop: true,
    code: "inspection-stale",
    inspection: {},
    historyChanged: false
  }
}
```

未知异常才使用：

```js
{
  ok: false,
  error: {
    code: "state-create-failed",
    name: "TypeError",
    message: "...",
    stage: "preflight-or-apply"
  },
  metadata: {
    rollback: {
      attempted: true,
      complete: true
    }
  }
}
```

### 6.3 兼容策略

保留：

```js
api.edit.states.add(3387)
```

兼容行为：

- 内部委托给 `createAtCell`。
- 旧的数字参数继续有效。
- 返回结构保留现有 `executed / noop / result / affected / effects / history` 字段。
- 只做加法：新增 `code / inspection / rollback / mapRevision`，不能删除旧字段。
- `states.add` 标记为 `deprecated` 的时机不得早于 `createAtCell` 稳定并经过至少一个兼容周期；第一阶段可先保持 `draft` 并注明 alias。

## 七、稳定业务 code

首期复用现有 inspector code，避免无必要改名：

| code | 含义 | 阻断 |
|---|---|---:|
| `ok` | 允许创建 | 否 |
| `grid-cell-invalid` | grid cell ID 非法或越界 | 是 |
| `cell-space-not-supported` | 传入的不是支持的 grid 空间 | 是 |
| `grid-cell-water` | cell 不是可创建国家的陆地 | 是 |
| `pack-cell-missing` | 没有可用陆地 pack cell | 是 |
| `capital-province-protected` | 目标位于既有国家首都省份 | 是 |
| `inspection-stale` | 预检后地图 revision 已改变 | 是 |
| `political-id-capacity-exceeded` | 新 ID 超出可支持容量 | 是 |
| `state-create-failed` | 非预期创建异常 | 是 |

诊断 warning：

| code | 含义 |
|---|---|
| `height-feature-mismatch` | 高度水陆语义与 feature.land 不一致 |
| `pack-grid-owner-mismatch` | grid 与映射 pack 的政治归属不一致 |
| `runtime-cache-rebuilt` | 旧存档运行时缓存已被安全重建 |
| `sparse-political-ids` | 政治对象存在大范围稀疏 ID |

所有 code 必须进入 API 描述与回归，不允许只存在于中文 message。

## 八、能力发现与方法 schema

现有 `api.info.capabilities()` 继续提供紧凑方法清单和副作用元数据。新增：

```js
api.info.describe("edit.states.inspectCreateAtCell")
```

返回：

```js
{
  method: "edit.states.inspectCreateAtCell",
  stability: "draft",
  mutates: "none",
  undoable: false,
  async: false,
  requiresConfirm: false,
  inputSchema: {
    oneOf: [
      {type: "integer", minimum: 0},
      {$ref: "StateCreateAtCellInput@1"}
    ]
  },
  outputSchema: {$ref: "StateCreateInspection@1"},
  businessCodes: [
    "ok",
    "grid-cell-invalid",
    "cell-space-not-supported",
    "grid-cell-water",
    "pack-cell-missing",
    "capital-province-protected"
  ],
  examples: []
}
```

设计要求：

- `capabilities()` 保持轻量，不把所有大型 schema 每次全量返回。
- `describe(method)` 按需返回完整 schema、code、示例和副作用说明。
- schema 使用版本化名称，新增可选字段不破坏旧版；修改必填字段或含义时升级 schema 版本。
- AI 调用前先读取 `capabilities()` 与 `describe()`，不能从自然语言猜参数。

## 九、AI 工具调用流程

标准诊断流程：

```js
const capabilities = await api.info.capabilities();
const contract = await api.info.describe("edit.states.inspectCreateAtCell");

const picked = await api.cells.getAtPoint({
  coordinateSpace: "client",
  x: 1740,
  y: 347
});

const inspection = await api.edit.states.inspectCreateAtCell({
  cell: picked.data.ref
});

if (!inspection.ok) {
  // API 或运行时故障，按 error.code 处理
} else if (!inspection.data.allowed) {
  await api.cells.locate(inspection.data.cell.ref, {
    openLayer: true,
    flash: true
  });
  // 根据 inspection.data.code 报告业务原因
} else {
  // 只有用户授权真实修改后，才允许调用 createAtCell
}
```

用户授权写入后的流程：

```js
const created = await api.edit.states.createAtCell({
  cell: inspection.data.cell.ref,
  inspectionToken: inspection.data.inspectionToken,
  expectedRevision: inspection.data.mapRevision
});
```

AI 报告必须引用：

- grid cell ID。
- `allowed / executed`。
- 稳定 code。
- 关键 details。
- 地图 revision。
- 是否真实写入、是否进入历史、是否已回滚。

不能只说“看起来这里是陆地”或“按钮似乎没有反应”。

## 十、API 传输与 AI 接入边界

页面内 API 契约与 AI 使用的传输方式需要分开设计：

```text
业务命令 / inspector
        ↓
window.webglGeneratorApi
        ↓
ApiTransport 适配层
        ├─ 浏览器控制台
        ├─ Playwright / 回归脚本
        └─ 未来本地 MCP 或受控调试桥
```

第一阶段只要求页面 API 和自动化脚本可靠调用，不立即建设远程 HTTP 服务。

如果未来希望 AI 直接操作用户已经打开且包含私有存档的标签页，推荐本地、显式启用的受控桥：

- 默认只读。
- 暴露方法白名单和能力元数据。
- 写方法要求用户授权、`expectedRevision` 和 API 自身确认策略。
- 不允许读取浏览器其它标签、Cookie 或任意 localStorage。
- 不允许直接暴露内部 map 对象。
- 所有调用记录 `requestId / method / code / revision / affected`，不记录整份地图内容。

不建议使用远程公开 HTTP API直接承载浏览器内地图状态，也不建议用 DOM 文案或隐藏按钮模拟 API。

## 十一、旧存档与一致性诊断

### 11.1 Cell 快照一致性

`cells.get(..., {includeDiagnostics: true})` 至少检查：

- `heightLand` 与 `featureLand` 是否一致。
- grid cell 是否有合法 polygon。
- grid → pack 是否存在映射。
- 映射 pack cells 的 feature / state / province 是否一致。
- state / province / burg ID 是否能由当前数组类型准确表示。
- cell 指向的国家、省份、城市档案是否存在且未 removed。

### 11.2 不自动修复

只读 API 发现异常时不得静默改图。自动重建非持久运行时缓存可以作为加载兼容行为，但必须以 warning 形式可观测。

对于用户旧图中的幽灵国家、孤儿省份或无效城市，应先由 `cells.scan` / 后续政治一致性检查报告，再由独立、有撤销的修复命令处理；本方案不授权自动删除。

### 11.3 Revision

运行时建立不透明 `mapIdentity` 与单调 `mapRevision`，规则冻结如下：

- 每个新建或载入的地图生成新的 `mapIdentity`，其 revision 从 `0` 开始；换图后即使 revision 数值碰巧相同，旧 inspection token 也必须失效。
- 每个成功提交的地图数据事务恰好令 revision `+1`。既有公开编辑、导入、重生成、世界重算、气候链和其它成功 map write 全部纳入，不允许只有第 195 项新增方法才递增。
- 每次成功撤销或重做同样令 revision `+1`，因为当前地图状态已经改变；旧 token 随之失效。
- 业务拒绝、用户取消、no-op、运行时失败且完整回滚都不递增。相机、选择、临时高亮、预览和纯显示偏好也不递增。
- 异步或分片任务开始时捕获 identity + revision，提交前再次复核；任一不一致均返回陈旧 / 已作废结果，不得写入地图。
- inspector 返回 revision 与不透明 `inspectionToken`。token 在运行时 registry 中绑定 `mapIdentity + mapRevision + actionId + 规范化输入指纹 + inspector schema version`；成功地图写入、undo / redo 和换图均使旧 token 失效。
- 执行方法必须同时核对 token 与规范化后的真实输入，不能只比较 revision，也不能接受把同一 token 挪给另一 action 或另一 cell。

最小验收必须证明：任一既有成功 map write 会使旧 token 得到 `inspection-stale`；拒绝、取消和完整回滚不改变 revision；undo / redo 与地图替换一定使旧 token 失效；异步陈旧任务不会产生部分写入。

identity、revision 与 token 都不是保存格式字段，只存在运行时；旧 JSON、gzip、浏览器缓存和完整导出无需新增必填字段，持久完整性仍以地图 schema / checksum 为准。

## 十二、待评审的权威实施编排

以下阶段已登记在 `docs/current-plan.md`，并已由用户要求的新智能体第三轮评审为 `RELEASE`，现为第 195 项唯一权威实施顺序；不能绕过本节另建候选顺序。

### 前置 P-API：第 200 项已完成

第 200 项已经从当前 checkout 生成 `959` 行全量能力矩阵，关闭全部非 Cell 参数化缺口。当前公共 API 为 `13` 个命名空间、`237` 个方法、`129` 个编辑方法，`237 / 237` 方法已经接入统一 `info.describe` 与 schema registry，对象查询支持 `17` 类对象。

第 195 项只消费第 200 项留下的四类 `deferred-owned`：

1. `cell.read`
2. `cell.visual-diagnostics`
3. `cell.action-inspection`
4. `cell.controlled-write`

因此不得在第 195 项重复实现 `info.describe`、`objects.*`、洋流、标签、高度语义 API 或新的能力描述系统，也不建设 MCP / HTTP / 远程写入 bridge。

### 前置 P0：按 Cell / Point / Path / Range 动作矩阵重编排

P0 已在本次重编排中完成。机器权威产物为 `docs/audits/cell-action-replanning-matrix.json`，人读摘要为同目录 Markdown；生成器直接消费第 200 项全量能力矩阵、当前 `CANVAS_TOOL_MODE`、非注册直接操控审计和实际 Cell action registry，并以 `audit:cell-action-replan` / `regress:cell-action-replan` 固定双向差集。第 200 项四类能力已逐条归入 A、B、C、C+D 并全部转为 `covered`；当前结果为第 195 项能力 `4 / 4`、注册模式 `28 / 28`、非注册直接操控 `19 / 19`、展开宿主实例 `89 / 89`、planned / actual registry `34 / 34`、总计 `47` 行、差集 / 重复 actionId / 任一必填字段 / 空目标 / 空来源 `0`。每行均记录 actionId、输入空间、源码入口与引用、inspect / execute 目标、实施阶段、历史 / 回滚和旧兼容。

下表是机器产物的注册模式摘要；状态“已有写 API”只说明可参数化执行路径存在，不代表已具备统一只读 inspector、稳定业务 code 或 revision 防陈旧能力。

| # | 模式 | 输入空间 | 现有公共 API | 重编排处理 |
|---:|---|---|---|---|
| 1 | `height:brush` | grid cells / changes / range | `edit.height.applyChanges` 与第 200 项高度语义 API | C 登记 inspector；不复制高度算法 |
| 2 | `state:brush` | grid cells / changes | `edit.states.applyChanges` | C 登记 inspector |
| 3 | `state:add` | grid cell | `edit.states.add` | C 同族新增 inspect / create |
| 4 | `state:delete` | object / picked cell | `edit.states.delete` 与危险动作预检 | C 登记现有预检 |
| 5 | `province:brush` | grid cells / changes | `edit.provinces.applyChanges` | C 登记 inspector |
| 6 | `province:add` | grid cell | `edit.provinces.add` | C 同族新增 inspect / create |
| 7 | `province:delete` | object / picked cell | `edit.provinces.delete` 与危险动作预检 | C 登记现有预检 |
| 8 | `city:add` | grid cell | `edit.cities.add` | C 同族新增 inspect / create |
| 9 | `city:delete` | object / picked cell | `edit.cities.delete` 与危险动作预检 | C 登记现有预检 |
| 10 | `city:move` | city ref + grid / pack cell | `edit.cities.inspectMove / move` | C 复用现有 inspector |
| 11 | `culture:assign` | grid cells | `edit.cultures.assignCells` | C 登记 inspector |
| 12 | `religion:assign` | grid cells | `edit.religions.assignCells` | C 登记 inspector |
| 13 | `culture:center` | culture ref + pack cell | `edit.cultures.inspectExpansion / applyExpansion` | C 把中心输入登记到扩张 inspector |
| 14 | `religion:center` | religion ref + pack cell | `edit.religions.inspectExpansion / applyExpansion` | C 把中心输入登记到扩张 inspector |
| 15 | `biome:assign` | grid cells | `edit.biomes.assignCells` | C 登记 inspector |
| 16 | `biome:suitability` | grid cells / changes | `edit.biomes.inspectSuitability / applySuitability` | C 复用现有 inspector |
| 17 | `economy:market-assign` | pack cells | `edit.economy.inspectAssignment / assignCells` | C 复用现有 inspector |
| 18 | `measurement:draw` | world point list | `edit.measurements.save / updatePoints` | C 登记 path inspector |
| 19 | `marker:add` | pack cell | `edit.markers.add` | C 登记 inspector |
| 20 | `marker:move` | marker ref + pack cell | `edit.markers.move` | C 登记 inspector |
| 21 | `route:draw` | pack-cell path / endpoints | `edit.routes.create` | C 登记 path inspector |
| 22 | `route:edit-waypoint` | route ref + pack cell | `edit.routes.inspectEdit / update` | C 复用现有 inspector |
| 23 | `river:add` | source pack cell | `edit.rivers.create` | C 登记 inspector |
| 24 | `lake:excavate` | pack cell + radius | `edit.lakes.create` | C 登记 inspector |
| 25 | `feature:patch-select` | pack cell + radius / mode | `edit.features.inspectPatch / applyPatch` | C 复用现有 inspector |
| 26 | `feature:topology-select` | grid-cell set / operation | `edit.features.inspectTopology / applyTopology` | C 复用现有 inspector |
| 27 | `zone:add` | center pack cell + radius | `edit.zones.create` | C 登记 inspector |
| 28 | `note:add` | pack cell / world point | `edit.notes.createStandalone` | C 登记 inspector |

非注册直接操控同时由机器矩阵逐行分类：

- 基础 pick / select / locate 已由第 200 项 `selection.*` 覆盖，只作为 Cell 空间映射输入，不重复建写 API。
- 自定义标签拖动已由 `edit.labels.moveCustom` 覆盖；测量控制点拖动已由 `edit.measurements.updatePoints` 覆盖，二者进入 C 的关联动作 registry。
- 画布平移 / 缩放属于相机控制，面板 / 浮层拖动、焦点、表格列宽和原生文件选择器属于 UI shell，继续按第 200 项理由排除。

P0 完成标准冻结为：第 200 项 `deferred-owned:195` 必须全部消费并稳定归入 A～D；注册模式 `28 / 28`、非注册直接操控 `19 / 19` 及全部宿主实例、补充 point / path 入口全部有分类；未知、未分类、无归属、重复 actionId、任一必填字段、空 inspect / execute 目标和空源码引用均为 `0`。施工中若当前 checkout 新增 deferred、模式或入口，矩阵陈旧门禁必须先失败，再明确归入 A～D，不能静默忽略。

### 新前置 P-SEM：第 204 项复合语义规则审计已完成

阶段 A 完成后，用户明确指出“国家占领 Cell”只是一个样例，不能把 AI API 继续理解为按钮或画布动作的一一映射。第 204 项已从 `963` 行能力矩阵、`241` 个公开方法和 `47` 行 Cell 动作中冻结：

- 事实与原子原语；
- `68` 个单事务规则动作；
- `10` 个 AI 规划器玩法配方。

其中已有完整事务 `33`、已有写命令但缺 inspector `24`、多 API 碎片 `5`、缺失游戏规则 `6`。机器产物为 `docs/audits/compound-semantic-action-matrix.json / .md`。

第 195 项后续边界因此调整为：

- `cells.inspectAction` 只负责 Grid/Pack/point/path/range 等空间输入和画布原子动作预检；
- 国家灭亡、领土转移、整省转移、战争结算等必须由领域 `inspect + execute` 规则事务承接；
- 殖民、战争和行政改革等配方由 AI planner 逐步调用已授权规则事务，不能进入 `cells.execute(arbitraryPayload)`；
- 第 204 项矩阵中的 `5` 个碎片事务、`6` 个缺失规则和 `10` 个配方没有随审计自动获得实现授权。

### 阶段 A：Cell 只读基础

当前实现状态：阶段 A～D 已全部落入未提交工作区。八个 `cells` 方法、运行时 identity / revision、schema、稳定 cursor、Grid Cells 图层、定位扫描、34 条动作 registry 与三族受控创建均通过专项、三档规模和真实 Chrome 代表矩阵；第 200 项四条 `deferred-owned:195` 已全部转为 `covered`。本批尚未暂存、提交或推送。

1. 新增统一 `cells` 命名空间：`get / getAtPoint / neighbors / query`。
2. Cell 引用必须显式区分 `{space: "grid", id}` 与 `{space: "pack", id}`；旧数字参数只在旧 `.add(gridCell)` 兼容路径解释为 Grid。
3. 查询使用字段白名单、稳定 cursor、分页上限和 JSON 深复制；默认不返回 typed array、Map、内部对象或无限邻接。
4. `getAtPoint` 支持世界点；client point 先经既有 `selection.pick` 转换，不重复实现相机投影。
5. 建立运行时地图 identity / revision 读取基础。只读调用不得改 checksum、revision、EditHistory、选择或相机。
6. 复用第 200 项 schema registry，把 CellRef、Point、Cursor 与结果 code 加入 `info.describe`，不建立第二套描述入口。

阶段 A 最小验收：

- Grid / Pack 双向映射、陆海 cell、边界 cell、无映射旧图和非法引用均有稳定结果。
- `get / getAtPoint / neighbors / query` 重复调用确定、可序列化；分页 cursor 稳定且篡改会拒绝。
- 旧 JSON、gzip、浏览器缓存无需新增必填字段。

### 阶段 B：Grid Cells 诊断图层、定位与扫描

1. 新增默认关闭的 `gridCells` 图层并接入 `layers.setVisible`；使用 Grid Voronoi 共享边去重，不混用 Pack cell。
2. 边线使用静态 GPU buffer；普通高度 / 政治编辑不重建拓扑，地图替换才重建。
3. Cell ID 只在缩放阈值与视口数量预算允许时显示，禁止 100k 全量 DOM 标签。
4. 新增 `cells.locate / scan`：定位可以选择、闪烁并打开诊断摘要；扫描支持 bbox、字段投影、limit / cursor 和可取消分片。
5. 图层关闭时不得增加 draw call；诊断高亮和普通 selection 分层，清理后不残留状态。

阶段 B 最小验收：

- 任一 A 阶段返回的 Grid / Pack 引用都可定位到同一视觉 cell。
- 10k / 50k / 100k 固定图覆盖 buffer 构建、上传、draw、ID LOD、扫描分页、取消和地图替换。
- 图层关闭零额外 draw；开启后 WebGL error、application console / page error 为 `0`。

### 阶段 C：全动作 Inspector Registry 与创建同族

1. 新增可枚举的只读 action registry 与唯一签名 `cells.inspectAction(actionId, input, options = {})`；至少覆盖机器矩阵的 `28` 个模式及标签 / 测量补充入口。
2. 每个 actionId 必须链接第 204 项的规则动作或明确标记为原子编辑器原语；registry 不得声称自己覆盖国家灭亡、战争、整省转移等领域复合规则。
3. registry 每项必须声明 input space、现有 inspect / execute API、业务 code、是否写地图、确认、撤销 / 回滚、异步、revision 要求和旧兼容入口。
4. 同一阶段一次性新增：
   - `edit.states.inspectCreateAtCell / createAtCell`
   - `edit.provinces.inspectCreateAtCell / createAtCell`
   - `edit.cities.inspectCreateAtCell / createAtCell`
5. 三族共用 `expectedRevision / inspectionToken`、稳定 `allowed + code + details`、单条历史和故障快照回滚；不得再把省份或城市无依据地推迟到后续阶段。
6. 旧 `states.add / provinces.add / cities.add` 路径继续可用，并委托规范入口或保持严格等价；既有调用的成功返回字段只增不删。
7. 已有 inspector 的路线改线、Feature、适居度、市场、城市移动、文化 / 宗教扩张和危险删除只注册引用，不复制算法。

阶段 C 最小验收：

- action registry 覆盖机器矩阵全部 `planned-registry` 行，当前为 `34 / 34`，双向差集为 `0`；`existing-api 1 / 1`、`excluded 12 / 12` 也必须保持；合成未知模式、非注册入口或陈旧 API 引用会失败。
- 所有 inspector 纯只读；业务拒绝使用 `ok: true / allowed: false / code`，运行时错误才使用失败包络。
- 三类创建在合法、拒绝、revision 陈旧和注入异常下分别证明单历史、零历史或完整回滚。
- 真实旧存档的普通对象缓存、稀疏高 ID、height / feature 不一致和 pack 映射缺失均有结构化结果。

### 阶段 D：受控写缺口关闭与统一验收

1. 依据阶段 C registry 重新生成“有 UI / inspector 但无规范写 API”的差集。
2. 同时与第 204 项矩阵交叉检查：本阶段只关闭第 195 项已授权的 Cell / point / path / range 受控写缺口，不得顺带实现未获授权的领域复合事务或玩法配方。
3. 只对白名单中的真实差集增加薄适配；已有 `edit.*` 方法直接登记为 execute target，不增加同义重复方法。
4. 禁止通用 `cells.execute(action, arbitraryPayload)`、任意属性写、裸 command 执行器和远程写入入口。
5. 每个新增适配必须先有纯 inspector，复用现有 command / transaction，并声明确认、撤销、失败回滚和旧图兼容。
6. 更新第 200 项全量矩阵：四类 `deferred-owned: 195` 转为 covered；非 Cell 分母、排除理由和既有 `237` 条调用路径不得退化。

阶段 D 最小验收：

- action registry 中无 inspector 的业务拒绝、无 execute target 的参数化写入口、未知、未分类、无归属和真实 gap 均为 `0`。
- API 声明、runtime、元数据、schema、业务 code、稳定性和确认策略双向一致。
- API 聚合、旧数据、失败原子性、10k / 50k / 100k、生产构建和真实 Chrome 代表矩阵通过；性能遥测与应用错误继续分列。

### 阶段 A～D 实施结果

- API：`14` 个命名空间、`251` 个公开方法、`135` 个编辑方法，稳定等级 `243 / 7 / 1`，`251 / 251` 可描述且声明 / 元数据 / runtime 三向一致。
- 图层：Grid Voronoi 共享边去重后写入独立 `GL.LINES` 静态 buffer；地图替换才失效，普通编辑复用；诊断高亮使用独立动态 buffer，ID 受缩放阈值与 `240` 个视口预算约束。
- 三档规模：10k / 50k / 100k 的实际 Grid Cells 为 `9933 / 49824 / 99960`，边数 `30004 / 149933 / 300533`，buffer `1,440,192 / 7,196,784 / 14,425,584` bytes，构建 `33.8 / 489.7 / 1509.6ms`，最长切片 `2.7 / 6.3 / 9.9ms`。
- Registry：planned / actual 均为 `34 / 34`；空输入、非法 CellRef、未知 actionId 均稳定拒绝，所有条目明确为 `editor-primitive / compoundRulesCovered=false`。第 204 项规则事务和 planner recipe 分层保持不变。
- 创建：国家、省份、城市 inspector 首次调用不修改地图或挂载缓存；合法执行恰好一条历史和 revision `+1`，陈旧 token 拒绝，命令注入异常恢复完整集合快照且 revision / undo 均不变。
- 矩阵：全量能力矩阵 `987` 行，`covered 916 / excluded 71 / deferred-owned 0 / gap 0 / unknown 0 / unclassified 0`；复合语义审计仍为 `68` 个规则事务、`10` 个玩法配方和结构缺口 `0`。
- 浏览器：系统 Chrome 中 Grid / Pack 引用定位到同一视觉 cell；控制面板和 API 都可开关“网格单元”，关闭时额外 draw 为 `0`、开启为 `1`，强制目标 ID 可见；扫描、34 条登记、三族创建、陈旧 token 与撤销均通过，WebGL / application health / console / page error 为 `0`。

## 十三、验收标准

### 13.1 Cells 图层

- 控制面板可以开启 / 关闭“网格单元”。
- 全部 grid cells 的共享边可见，海陆均覆盖。
- 任一 API 返回的 grid cell 可定位、闪烁并显示 ID。
- 图层关闭后无额外 draw call。
- 10k / 50k / 100k 性能门禁通过。
- 地图替换后缓存重建，普通政治 / 高度编辑不重建拓扑 buffer。

### 13.2 只读 API

- `cells.get`、`getAtPoint`、`neighbors`、`query`、`scan` 和全部 action inspector 不修改 checksum、mapRevision、EditHistory、选择或相机；`locate` 只改变选择 / 相机 / 诊断高亮。
- 所有结果可 JSON 序列化。
- 相同地图 revision 和输入返回相同 code 与关键 details。
- 旧存档普通对象缓存、稀疏高 ID、height / feature 不一致和 pack 映射缺失都有结构化结果。
- action registry 与当前 `28` 个画布模式及补充 point / path 入口双向差集为 `0`。

### 13.3 写入 API

- 国家、省份、城市三族 `createAtCell` 同阶段完成；成功时对象、必要锚点、grid / pack 归属和历史完整。
- 业务拒绝返回 `ok: true / executed: false / code`，不写历史。
- revision 不一致返回 `inspection-stale`，不写地图。
- 任一阶段异常完整回滚，并返回 `rollback.complete: true`。
- `states.add / provinces.add / cities.add` 旧脚本继续可用。
- 阶段 D 只补 registry 证明真实缺失的白名单写入口，不新增通用任意写执行器。

### 13.4 AI 可用性

- AI 可以只根据 `capabilities + describe + ApiResult` 完成“定位 cell → 判断是否允许 → 解释 code”的流程，不依赖截图文字。
- AI 不需要读取内部 typed array、Map 或任意运行时对象。
- 所有写方法的副作用、确认要求和撤销能力可由能力表发现。
- 浏览器视觉与 API 指向同一 grid cell。

## 十四、重编排明确不实施的内容

- 不建设远程 HTTP 服务。
- 不建设本地 MCP / AI bridge 或远程写入授权流程。
- 不自动删除旧图幽灵国家或孤儿对象。
- 不把 pack cells 与 grid cells 混成一个图层。
- 不开放内部 map 对象给 AI 直接写入。
- 不重复建设第 200 项已经完成的 `info.describe`、对象查询、洋流、标签或高度语义 API。
- 不开放通用 `execute(action, arbitraryPayload)`、裸 command 执行器或任意属性写。
- 不把 UI shell、面板拖动、焦点、表格列宽、原生文件选择器和纯视觉过渡伪装成地图 API。
