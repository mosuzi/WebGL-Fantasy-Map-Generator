# Cells 诊断图层与 AI 可判定 API 设计

> 状态：权威任务第 195 项设计稿，2026-07-24 完成。本文只冻结产品语义、公共契约、分阶段施工边界和验收标准，不代表已批准或已完成代码实现。

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
- 当前基线为 11 个命名空间、208 个方法，其中 110 个编辑方法；根版本为 `1.0.0 / stable`。
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
  {space: "grid", id: 3387},
  "states.createAtCell",
  {}
)
```

它把 cell 查询与领域预检统一到一个 AI 易发现入口，内部委托给领域 inspector，不能复制另一套规则。

首期动作 registry 只登记：

```text
states.createAtCell
cities.createAtCell
provinces.createAtCell
```

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

建议引入单调 `mapRevision`：

- 地图数据写入成功后递增。
- 纯显示偏好、相机、临时高亮不递增。
- 导入 / 新图替换重置地图 identity 并生成新 revision 作用域。
- inspector 返回 revision。
- 写 API 可选接受 `expectedRevision`；AI 写入默认应提供。

revision 不是保存格式字段，可以只存在运行时；完整导出仍以地图 schema / checksum 为准。

## 十二、分阶段实施建议

以下仅是未来施工建议，不因本文完成而自动转为权威实现任务。

### 前置小任务 P-API：控制台 API 全量复审与 AI 操作缺口补齐

本小任务已于 2026-07-25 转为权威任务第 200 项，当前可以执行，但不等于阶段 A～D 已获批准。它必须从当前 checkout 重生成地图能力分母，把交互表面、对象与统计面板、动作坞、画布模式、直接操控、runtime action、edit command 和现有公共 API 双向映射，补齐所有适合参数化但尚无 API 的地图能力，并建立面向 AI 的输入 / 结果、业务 code、预检、revision、确认、撤销 / 回滚和异步契约。

P-API 不把面板拖动、焦点、列宽或原生文件选择器等 UI shell 操作强行伪装成地图 API，也不开放裸内部状态写入或远程 bridge。完成标准与实际排除项以 `docs/current-plan.md` 第 200 项为准。

### 前置小任务 P0：按 cell 动作矩阵审计与阶段重构

本小任务尚未执行。任何阶段 A～D 的代码实现开始前，必须同时完成权威任务第 200 项 P-API 和本 P0；下列现有阶段划分在两项前置完成前只能作为初稿，不能直接用作施工清单。

P0 必须：

1. 盘点国家、省份、城市及其它所有通过 cell 选点、圈选或落笔触发的只读预检与写操作。
2. 为每个动作记录现有 UI 入口、公开 API、内部命令 / inspector、输入空间、稳定业务 code、历史、回滚、旧图兼容和已有回归。
3. 建立完整的 `inspect...AtCell / create...AtCell` 或等价动作矩阵，明确哪些动作应共享同一阶段，哪些因语义不同必须拆开。
4. 重新评估 `states / provinces / cities` 的规范化写入顺序；不得只在阶段 B 实现 `api.edit.states.createAtCell`，却把 `api.edit.provinces.createAtCell`、`api.edit.cities.createAtCell` 等同类公共契约无依据地推迟到阶段 D。
5. 基于矩阵重写阶段 A～D、依赖关系和验收分母，交由用户确认后再转入权威实施任务。

P0 当前仍是第 195 项实施前置门禁：现在不调查、不实现 API、不修改正式应用代码，也不表示阶段 A～D 已获批准。P-API 与 P0 完成后，必须合并两份能力矩阵重写阶段 A～D，并再次交由用户确认。

### 阶段 A：只读诊断闭环

1. 新增 `gridCells` 图层、控制面板开关和 `layers.setVisible` 支持。
2. 新增 `api.cells.get / getAtPoint / neighbors / locate`。
3. 新增 `api.edit.states.inspectCreateAtCell`。
4. 让现有 `states.add` 的 noop 返回 inspection code。
5. 新增 `api.info.describe(method)` 和对应最小 schema。

阶段 A 不新增真实写入方法；既有 `states.add` 继续工作。

### 阶段 B：规范化写入

1. 新增 `api.edit.states.createAtCell`。
2. `states.add` 委托新方法并保持兼容。
3. 增加 `mapRevision / expectedRevision / inspectionToken`。
4. 统一创建结果、rollback 证据和 typed error code。

### 阶段 C：批量诊断与 AI 传输

1. 新增 `cells.query / inspectAction / scan`。
2. 建立 action inspector registry。
3. 评估本地只读 MCP / 调试桥。
4. 建立调用日志、权限白名单和用户授权写入流程。

### 阶段 D：扩展到其它编辑

按同一模式逐项覆盖：

- `cities.inspectCreateAtCell / createAtCell`
- `provinces.inspectCreateAtCell / createAtCell`
- 高度填海、feature 改造、文化 / 宗教扩张等复杂动作

每个动作必须先有纯 inspector，不能只暴露写入口。

## 十三、验收标准

### 13.1 Cells 图层

- 控制面板可以开启 / 关闭“网格单元”。
- 全部 grid cells 的共享边可见，海陆均覆盖。
- 任一 API 返回的 grid cell 可定位、闪烁并显示 ID。
- 图层关闭后无额外 draw call。
- 10k / 50k / 100k 性能门禁通过。
- 地图替换后缓存重建，普通政治 / 高度编辑不重建拓扑 buffer。

### 13.2 只读 API

- `cells.get`、`getAtPoint`、`neighbors` 和 `inspectCreateAtCell` 不修改 checksum、mapRevision、EditHistory、选择或相机。
- 所有结果可 JSON 序列化。
- 相同地图 revision 和输入返回相同 code 与关键 details。
- 旧存档普通对象缓存、稀疏高 ID、height / feature 不一致和 pack 映射缺失都有结构化结果。

### 13.3 写入 API

- `createAtCell` 成功时国家、省份、首都、grid / pack 归属和历史完整。
- 业务拒绝返回 `ok: true / executed: false / code`，不写历史。
- revision 不一致返回 `inspection-stale`，不写地图。
- 任一阶段异常完整回滚，并返回 `rollback.complete: true`。
- `states.add(gridCell)` 旧脚本继续可用。

### 13.4 AI 可用性

- AI 可以只根据 `capabilities + describe + ApiResult` 完成“定位 cell → 判断是否允许 → 解释 code”的流程，不依赖截图文字。
- AI 不需要读取内部 typed array、Map 或任意运行时对象。
- 所有写方法的副作用、确认要求和撤销能力可由能力表发现。
- 浏览器视觉与 API 指向同一 grid cell。

## 十四、明确不在本设计阶段实施的内容

- 不新增或修改正式应用代码。
- 不建设远程 HTTP 服务。
- 不自动删除旧图幽灵国家或孤儿对象。
- 不把 pack cells 与 grid cells 混成一个图层。
- 不开放内部 map 对象给 AI 直接写入。
- 不批准阶段 A～D 自动进入施工；每一阶段仍需单独进入权威任务清单。
