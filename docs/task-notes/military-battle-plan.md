# 军事系统、图层与管理面板设计

## 背景

当前 WebGL 版已经有 `app/webgl-generator/src/generator/military.js`，会在外交和经济阶段之后为国家生成简化军团数据，并在国家面板中显示军力摘要。但这套数据还停留在“国家下挂若干 regiment”的雏形，没有成为可见图层、可管理对象，也没有完整表达兵种比例、军队态势、驻扎适宜度、战争线和战争原因。

本轮目标不是实现实时战争模拟，而是把军事系统做成稳定的一层世界数据：

- 生成阶段能根据人口、经济、文化、城镇文明、资源和外交态势计算军队规模。
- 每个国家有可调整的兵种比例，默认比例由文化和城镇文明推导。
- 每支军队有兵种构成、图标、人数、状态、驻扎位置、地形/气候适宜度和移动速度字段。
- 战争中的国家能显示进攻/防守线，并能追溯结构化战争原因。
- 地图上有可开关的军事图层，管理 tab 有军事管理浮层。

## 原版参考

原版相关入口：

- `source/Fantasy-Map-Generator/public/modules/ui/regiments-overview.js`
- `source/Fantasy-Map-Generator/public/modules/ui/regiment-editor.js`
- `source/Fantasy-Map-Generator/public/modules/ui/battle-screen.js`

原版的价值主要在三个方面：

- 军团总览：按国家列出军团、兵种、人数、位置和导出。
- 军团编辑：支持改名、拆分、调整兵种、移动驻地和基地。
- 战斗事件：战斗类型会考虑地形、城市、河流、海军和登陆等语义，并把结果写入备注/事件链路。

WebGL 版暂不直接复刻战斗模拟，因为当前对象编辑、撤销、导入导出和备注事件链路还在逐步成形。第一阶段先把“军队作为地图对象”做稳。

## 数据模型

### 城镇文明类型

城镇新增 `civilizationType / civilizationLabel` 字段，和已有 `type / group` 分开：

| 类型 | 标签 | 典型来源 | 军事影响 |
|---|---|---|---|
| `nomadic` | 游牧 | 草原、干草原、低人口迁徙点、游牧文化 | 军队人口比例上限高，骑兵比例高，驻扎分散 |
| `agrarian` | 农耕 | 温带/湿润定居区，非港口主城 | 总人口基数高，步兵和弓兵稳定 |
| `hunting` | 渔猎 | 森林、苔原、湿地、低密度聚落 | 轻步兵/弓兵高，重器械低 |
| `marine` | 海洋 | 港口、海洋文化、岛屿/湖区港镇 | 舰队比例高，沿海防守线更强 |
| `merchant` | 商人 | 高人口、有市场/广场/贸易站、路线节点 | 经济支撑高，器械和雇佣军倾向高 |
| `highland` | 山地 | 高地、寨堡、山地文化 | 步兵/弓兵适应好，骑兵和大型军队受限 |
| `frontier` | 边地 | 小城镇、资源点附近、边境省份 | 驻防/巡逻倾向高，规模偏小 |

国家级文明画像由所属城镇加权汇总：

- 按城镇人口和首都/省会权重统计 `state.civilizationProfile`。
- 主导类型写入 `state.civilizationType / civilizationLabel`。
- 军队人口上限、默认兵种比例和军团状态都读取这个画像。

### 兵种定义

第一版兵种保持轻量，但字段应为后续扩展留口：

| id | 标签 | 类别 | 图标语义 | 默认用途 |
|---|---|---|---|---|
| `infantry` | 步兵 | `melee` | 盾/矛 | 主力驻防、攻防线 |
| `archers` | 弓兵 | `ranged` | 弓 | 林地、高地、防守 |
| `cavalry` | 骑兵 | `mounted` | 马 | 游牧、平原、快速移动 |
| `artillery` | 器械 | `machinery` | 投石/弩炮 | 城市、攻城、富裕国家 |
| `fleet` | 舰队 | `naval` | 船 | 港口、海洋国家、海路 |

每个兵种包含：

- `label`：中文显示名。
- `icon`：地图图标文本或后续 SVG sprite key。
- `category`：适应性和比例修正使用。
- `baseRatio`：默认比例。
- `speed`：静态移动速度评分，当前只作为状态字段。
- `terrainPreference`：平原、山地、湿地、寒冷、森林、海岸等适宜度。

### 国家军事策略

每个国家新增 `state.militaryPolicy`：

```js
{
  state: 1,
  troopCapRatio: 0.045,
  desiredTroops: 12340,
  finalTroops: 11800,
  alert: 1.35,
  unitRatios: {
    infantry: 0.46,
    archers: 0.22,
    cavalry: 0.18,
    artillery: 0.05,
    fleet: 0.09
  },
  dominantCivilization: "agrarian",
  civilizationProfile: {agrarian: 0.58, merchant: 0.24},
  posture: "guarded",
  diplomacyPressure: 1.18,
  resourcePressure: 1.08
}
```

计算原则：

- 基础人口来自 `state.rural + state.urban`，保持内部 FMG 千人单位，换算军队人数时再乘系数。
- 经济读取 `economicPower / resourcePotential / militarySupply / powerScore`。
- 文化读取 `state.type` 和文化对象类型。
- 城镇文明读取 `state.civilizationProfile`。
- 外交读取邻国关系、强邻、恶邻、战争和宿敌。
- 资源压力读取与邻国的 `resourcePotential / resourceTypes` 重合度。
- 最终兵力不得超过 `population * troopCapRatio`。

### 军团对象

现有 `state.military[]` 继续保留，但字段补齐：

```js
{
  i: 0,
  state: 1,
  id: "1:0",
  name: "1（东原）军团",
  type: "regiment",
  dominantUnit: "infantry",
  icon: "盾",
  a: 3200,
  u: {infantry: 1500, archers: 720, cavalry: 580, artillery: 160, fleet: 0},
  status: "patrolling",
  statusLabel: "巡逻中",
  order: {kind: "patrol", targetCell: 1234, targetName: "东原"},
  cell: 1234,
  x: 300,
  y: 240,
  bx: 300,
  by: 240,
  suitability: {
    total: 0.82,
    terrain: 0.88,
    climate: 0.76,
    biome: 0.81,
    capacity: 0.84
  },
  movementSpeed: 0.92,
  pressure: {front: 0.4, supply: 0.85}
}
```

状态第一版只做静态枚举：

| id | 标签 | 触发倾向 |
|---|---|---|
| `patrolling` | 巡逻中 | 边境、资源点、非战争但有宿敌 |
| `marching` | 行军中 | 战争状态、进攻线附近 |
| `resting` | 修整中 | 大城镇、低适宜度、远离边境 |
| `mustering` | 集结中 | 战争初期、首都/省会、强敌邻近 |
| `routed` | 败逃中 | 当前先用低随机概率和战争压力触发，后续由战斗结果写入 |
| `garrisoned` | 驻防中 | 首都、省会、要塞和边防城市 |

### 战争线与战争原因

外交阶段的 `campaign` 必须补结构化战争原因：

```js
{
  name: "晋-楚之战",
  start: 996,
  attacker: 1,
  defender: 4,
  cause: "resource",
  causeLabel: "资源争夺",
  causeDetail: "双方争夺矿产与盐路，边境关系恶化。",
  resourceKeys: ["ore", "salt"],
  front: {kind: "attack", fromState: 1, toState: 4}
}
```

战争原因枚举：

- `resource`：资源争夺。
- `border`：边境冲突。
- `rivalry`：宿敌旧怨。
- `power`：强权扩张。
- `culture`：文化/宗教矛盾。
- `trade`：贸易路线争端。

军事阶段根据 `Enemy` 关系和 `campaigns` 生成 `map.military.fronts[]`：

- `attack`：攻击方首都或主力军团指向防守方边境/首都。
- `defense`：防守方主力城市或边境指向攻击来源。
- 每条线包含 `from / to / attacker / defender / cause / label / stance`。
- 第一版只画静态线，不做实时推进。

## 生成算法

### 总兵力

基础公式：

```text
人口基数 = (state.rural + state.urban) * 1000
文化上限 = culture/civilization troopCapRatio
理论上限 = 人口基数 * 文化上限
需求兵力 = 人口基数 * 基础征募率 * 经济修正 * 资源修正 * 外交压力
最终兵力 = min(需求兵力, 理论上限)
```

修正项：

- 游牧、边地文明提高征募率和上限；商人、海洋文明提高经济供给而不是无限提高人口占比。
- 强邻/恶邻、宿敌、战争提高 `diplomacyPressure`。
- 资源竞争提高 `resourcePressure`，但保留随机性，不必所有资源邻国都开战。
- 贫瘠高山、寒冷、丛林和湿地降低大军驻扎容量；适合小型军团或特定兵种。

### 兵种比例

默认比例来自三层叠加：

1. 全局基础比例。
2. 国家文化类型和城镇文明画像修正。
3. 资源与地形修正，例如草原加骑兵、港口加舰队、高地加弓兵/步兵、富裕城市加器械。

用户在军事面板修改比例后写入 `state.militaryPolicy.unitRatios`，后续重算军事时应优先使用用户比例。第一版先支持“调整比例后重建本国军团”，不必接入跨系统全量重生成。

### 驻扎适宜度

军团位置评分由候选 cell 计算：

- `terrain`：高度、坡度、是否山地/湿地/海岸。
- `climate`：温度极端、寒冷惩罚、过热惩罚。
- `biome`：森林、丛林、草原、沙漠、苔原等。
- `capacity`：当地人口、城镇、道路、港口和补给。
- `unitMatch`：兵种与地形匹配。

评分写入军团 `suitability`，并影响状态：

- 低适宜度的大军更可能 `marching / resting`，少驻扎。
- 首都/省会/港口更容易 `garrisoned / mustering`。
- 战争前线更容易 `marching / patrolling`。

## UI 设计

### 图层

控制面板“图层”tab 新增：

- `军事`：显示军队图标和人数。
- `战线`：显示战争进攻/防守线，可与军事图层一起开关。若第一版为了简洁，也可以先让战线跟随军事图层显示。

地图表现：

- 军队图标采用 HTML overlay 或 WebGL 点层 + overlay 标签混合方案。
- 图标按主导兵种显示，旁边显示精简人数，例如 `盾 1.2万`。
- 点击区域必须覆盖整个图标底牌，而不是只点中像素。
- 关闭军事图层后不显示图标，也不参与拾取。

战争线表现：

- 进攻线用暖色实线或箭头线。
- 防守线用冷色虚线。
- 鼠标悬停显示双方、战争原因和战争名称。

### 军事管理面板

管理 tab 新增“军事管理”。

第一版包含：

- 摘要指标：国家数、军团数、总兵力、战争数、舰队数。
- 国家筛选和文本筛选。
- 军团表格：国家、军团、状态、兵力、主兵种、适宜度、速度。
- 详情：兵种构成、驻扎地、文明画像、外交压力、资源压力、战争原因。
- 定位：跳转到军团位置。
- 导出 CSV/JSON。
- 二级操作：兵种比例调整。

比例调整：

- 选择国家后显示该国当前 `unitRatios`。
- 每个兵种用带数字输入的滑条调整。
- 应用时归一化比例，写入 `state.militaryPolicy.unitRatios`。
- 第一版应用后重建该国军团，并刷新军事图层、对象索引和面板统计。

## 与其他系统协调

- 经济：军事只读取 `economicPower / resourcePotential / militarySupply / powerScore`，不在第一版反向消耗经济。
- 外交：外交负责生成关系和战争原因；军事读取 `Enemy / Rival / campaigns` 生成战线和警戒。
- 城镇：城镇文明类型是军事上限和兵种比例的重要输入，也可供后续经济/名称/文化系统复用。
- 资源：资源竞争既影响外交关系，也影响战争原因和军事警戒，但保留随机性。
- 导入导出：完整地图数据导出应自然包含新增字段；GeoJSON 暂不强制导出军团，后续可作为点图层补充。
- 开发模式：军事诊断、公式中间值和 stale 信息只在 debug 面板或开发详情中显示，普通 UI 只展示用户可理解的数据。

## 分期实施

### 阶段 1：数据契约与生成链路

- 增加城镇 `civilizationType / civilizationLabel`。
- 国家汇总 `civilizationProfile / civilizationType`。
- 升级 `military.js`：兵种中文定义、默认比例、兵力上限、外交压力、资源压力、驻扎适宜度、状态和移动速度。
- 升级 `diplomacy.js`：战争 campaign 必须有 `cause / causeLabel / causeDetail`。
- 生成 `map.military.fronts` 和扩展 metadata。

验收：

- 生成后每个非中立国家有 `militaryPolicy`。
- 有战争时 campaign 有结构化原因，军事数据有 fronts。
- 军团有主兵种、状态、适宜度、速度和图标。

### 阶段 2：军事图层与拾取

- 渲染军事点层/overlay。
- 渲染战争线。
- 拾取索引新增 `military` 对象。
- `locateObject()` 支持军团边界。

验收：

- 图层开关能隐藏/显示军队和战线。
- 点击军队图标能选中军团。
- 军事图层关闭后军团不参与拾取。

### 阶段 3：军事管理面板

- 新增懒加载军事管理面板。
- 管理 tab 新增入口。
- 支持筛选、排序、定位、导出、详情和兵种比例调整。
- 兵种比例调整后可重建本国军团。

验收：

- 面板打开不影响地图 checksum，除非用户主动应用比例调整。
- 调整比例后该国军团构成变化，图层和统计刷新。
- 构建产物仍保持懒加载，不把面板大块塞回主入口。

### 阶段 4：轻量军团编辑

- 重命名军团。
- 手动调整状态。
- 移动驻地/基地。
- 接入撤销/重做和完整地图导入导出。

### 阶段 5：战斗事件与模拟

- 先做战斗事件记录，再做完整战斗模拟。
- 战斗结果写入军团兵力、事件、备注和历史命令。
- 取消模拟不得改变地图数据。

## 本轮实现边界

本轮优先完成阶段 1 到阶段 3 的第一版：

- 有军事图层。
- 有军事管理面板。
- 有可调整兵种比例。
- 有城镇文明类型。
- 有战争原因和战争线。

战斗事件、可撤销军团移动和实时演算暂缓。
