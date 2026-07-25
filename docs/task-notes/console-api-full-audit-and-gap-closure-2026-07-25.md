# 第 200 项控制台 API 全量复审与缺口补齐执行说明

## 状态

- 权威来源：`docs/current-plan.md` 第 200 项。
- 当前阶段：已完成。
- 调查基线：2026-07-25 当前 checkout。
- 本文只解释第 200 项如何执行，不另建权威待办。

## 一、重新冻结真实分母

旧的 `11` 个命名空间、`208` 个公开方法、`110` 个编辑方法和 `41` 类能力只能作为起点。既有回归只验证 `API_METHODS`、方法元数据和真实 API 对象三方一致，不能证明 UI、runtime action、edit command 与公共 API 之间没有缺口。

第 200 项重新联合发现：

- `103` 个交互表面，其中纳入 `86`、有理由排除 `17`、未分类 `0`；
- `27` 个 Vue 领域面板；
- `28` 个已注册画布模式；
- 非注册直接操控路径；
- `runtimeActions`；
- edit command 与 inspector 导出；
- 生成、重算、图层、样式、单位、选择、导入导出、名称库、历史与诊断；
- 公共 API、方法元数据、schema、业务 code、确认策略和浏览器证据。

机器矩阵的状态只允许：

- `covered`：公共 API 已存在且与 UI 共路径；
- `excluded`：纯 UI 壳层或安全边界，必须有非空理由；
- `deferred-owned`：适合参数化，但已明确归属另一权威任务；
- `gap`：适合参数化且没有公共 API，必须在第 200 项关闭。

验收要求不是“没有任何 deferred”，而是 `unknown = 0`、`unclassified = 0`、`unownedParameterizableGap = 0`、`gap = 0`。Cell 查询、Grid Cells 诊断层和按 cell 动作 registry 统一登记为 `deferred-owned: 195`，不得伪装成安全排除，也不得被第 200 项提前实现后掏空第 195 项。

## 二、已确认的当前缺口

### 2.1 runtime action 已有、公共 API 缺失

当前确认八项：

1. `oceanCurrents.inspectWorldRebuild`
2. `oceanCurrents.rebuildWorld`
3. `oceanCurrents.cancelWorldRebuild`
4. `edit.height.rebuildAllDerived`
5. `edit.labels.getStyles`
6. `edit.labels.setStyle`
7. `edit.labels.resetStyle`
8. `edit.labels.resetStyles`

### 2.2 UI 已有、尚未收束为 runtime action

- 洋流重命名与普通重生成；
- 标签优先级与位置锁定；
- 海底重设预检与整链应用；
- 高度全局平滑、扰动、条件变换、选区平滑和模板 / 程序执行等语义工具。

高度语义工具不得仅以 `edit.height.applyChanges` 视为已覆盖。通用 changes 是底层写入口，但 AI 仍需要复用当前 inspector、算法和稳定业务结果，不能自行重写 UI 内部计算规则。

### 2.3 AI 发现契约缺失

- 调用方必须预先知道对象引用，才能使用 `selection.resolve`；
- 没有分页的对象列表、读取和查询入口；
- `info.capabilities()` 只有副作用摘要，没有按方法发现输入 / 结果结构、枚举值、稳定业务 code 和示例的入口；
- 没有统一的 JSON 可序列化引用 schema；
- 当前不实现 Cell 专项的 `mapRevision / inspectionToken`，但公共 schema 必须为第 195 项预留统一扩展位置，不能再建第二套描述系统。

## 三、封闭实施范围

### 3.1 机器能力矩阵

新增可重复生成的 JSON 与中文报告，至少包含：

- `capabilityId`
- UI 入口与源码
- runtime action
- command / inspector
- API 方法
- 输入空间
- 副作用
- 预检
- 稳定业务 code
- 确认
- 撤销 / 回滚
- 异步
- 旧图兼容
- 回归证据
- 状态
- 归属或排除理由

生成器必须对登记项与源码发现项做双向差集；合成未知 runtime action、command 或 parameterizable gap 时必须失败。

### 3.2 面向 AI 的描述层

- 新增 `info.describe(method)`；
- 建立版本化公共 schema registry；
- 每个公共方法都能返回输入、结果、枚举、引用空间、业务 code、分页与 JSON 序列化说明；
- 既有方法路径和既有结果字段只增不删；
- 新方法先使用现有同主版本兼容策略，不升级 API major；
- `capabilities()` 保持紧凑，完整描述按方法读取。

### 3.3 对象发现

新增只读对象能力，支持：

- 枚举可查询对象类型；
- 按规范对象引用读取；
- 按类型分页列出；
- 使用白名单字段、稳定 cursor 和 JSON 副本；
- 不返回内部 map、typed array、Map 或可写引用。

Cell、grid / pack 邻接与按 cell 业务诊断继续归属第 195 项。

### 3.4 非 Cell 地图能力补齐

- 关闭八项已确认 runtime action 差集；
- 洋流重命名、普通重生成、世界重算预检 / 应用 / 取消与 UI 共路径；
- 标签样式、优先级与位置锁定与 UI 共路径；
- 完整高度派生重建与 UI 共路径；
- 海底重设提供纯预检和确认后的整链应用；
- 其它新发现的可参数化非 Cell 缺口必须在机器矩阵中关闭或给出安全排除理由。

高度画笔、圈选、点选和范围工具的底层 cell 诊断与动作 registry 进入第 195 项；第 200 项只补不依赖 Cell 专项即可稳定表达的语义 action。

## 四、兼容与安全边界

- 旧 JSON、gzip、浏览器缓存和现有地图 schema 不新增必填字段；
- 既有 `208` 条调用路径继续可用；
- 新对象查询返回深复制、JSON 可序列化结果；
- 纯相机、图层和临时高亮不写地图历史；
- 写方法复用 EditHistory 或现有完整事务回滚；
- 调试故障注入、远程写入 bridge、面板拖动 / 焦点 / 列宽、原生文件选择器和纯动画继续排除；
- 不开放裸 map、typed array 或任意属性写入口。

## 五、验收

1. 机器矩阵与中文报告可重复生成，未知、未分类、未归属参数化缺口和真实 gap 均为 `0`。
2. 公共方法在声明、真实 API、方法元数据、schema、业务 code、能力组、确认策略与稳定性之间无差集。
3. 新写方法与 UI 共用 runtime action、command / inspector 和历史 / 回滚。
4. 旧 API 聚合回归全部通过，既有路径和兼容别名不退化。
5. 固定地图覆盖对象发现、只读查询、编辑、批量 changes、异步重算、取消、样式、图层、导入导出、历史往返与失败原子性。
6. 生产构建、`git diff --check` 和真实 Chrome 控制台代表矩阵通过。

## 六、第 195 项重编排输入

第 200 项完成后，第 195 项不再沿用旧 A～D。重编排必须消费：

- 第 200 项机器矩阵中的全部 `deferred-owned: 195`；
- 第 200 项公共 schema 与 `info.describe`；
- 当前 `28` 个画布模式和非注册 cell / point / path / range 入口；
- 国家、省份、城市创建同族同阶段的约束；
- 旧数字 `gridCell` 入参、旧图稀疏高 ID 与失败原子性要求。

## 七、执行结果

- 真实分母：`103` 个交互表面、`28` 个画布模式、`199` 个 runtime actions、`198` 个 API action bindings、`183` 个 command / inspector 导出、`237` 个公开方法。
- 机器矩阵：`959` 行，其中 `covered 884 / excluded 71 / deferred-owned 4 / gap 0 / unknown 0 / unclassified 0`；未归属参数化缺口为 `0`。
- API：由 `11 / 208 / 110` 扩展为 `13` 个命名空间、`237` 个方法、`129` 个编辑方法，稳定等级为 `229 / 7 / 1`。
- AI 发现：`237 / 237` 方法可由 `info.describe` 获取真实参数与 schema；`objects` 支持 `17` 类对象、字段投影、稳定 cursor 和 JSON 副本。
- 浏览器：`regress:api-suite` 为 `12 / 12 passed`，包含 `6` 个代码门和 `6` 个真实 Chrome 门；主 API 门覆盖声明、元数据、runtime、schema、UI / API 共路径和固定地图调用，全部浏览器门的 WebGL / application health / console / page error 均为 `0`。大图同步验收产生的长任务与帧间隔继续单列为性能遥测，不改阈值、不伪装为应用错误。
- 第 195 项只保留四类明确归属能力：Cell 读取、Grid Cells 视觉诊断、动作 inspector registry、受控写入；其它非 Cell 缺口已经在第 200 项关闭。
