# 第 333 项：共享版本化 Worker 地图副本与紧凑二进制存档

> **执行状态（2026-08-14）**：阶段 A～C 已完成。canonical registry v1 覆盖 `24` 个顶层 section、`60` 个字段 / 形状描述；计算与显示 Worker 已保留跨 task 长期副本，并通过连续 revision patch、ACK 和串行队列同步。默认 `.webfmg` 已切换为 v3 紧凑分区容器，旧 JSON / gzip / base64 envelope 继续可读；当前只待阶段 D 真实集成、独立复核与最终验收。

## 1. 调查结论

用户观察到 Worker 化之后多种画布操作显著变慢，并怀疑每次都在向 Worker 全量传输 100k 地图；同时现有大图即使压缩后仍超过 `10MB`。只读源码与已有真实 100k artifact 给出的结论是：

1. **不是所有画布操作都传整图。** 平移、缩放、悬停和普通选择本身留在页面；同一 Worker task 的持久 session 仍有效时，后续调用只传 session payload，真实证据约为 `3` 个输入包和数毫秒输入时间。
2. **全量重传仍然过于频繁。** 计算协调器当前只保存一个 `persistentSession`，复用条件包含 task 名称；从 routes 切到 states、population 或其它 task 会令旧 session 失效。任何未被 Worker mutation guard 包住的地图 revision 又会同时失效计算与显示协调器，所以主线程编辑、撤销 / 重做、跨领域操作以及编辑后的视图更新，都会在下一次使用时重新建立完整地图镜像。
3. **100k 的首次传输是秒级主成本。** 已有门禁中 fresh 操作通常为约 `941～1053` 个输入包、约 `6～8s` input stream；同图同 session reuse 为 `3` 个输入包。第 331 项首次 100k 保存输入约 `953` 包、输入约 `6.84s`、总计约 `10.52s`；同 session 后续保存输入 `3` 包、总计约 `3.6～3.7s`。第 332 项首次 100k states 为 `1013` 包、约 `15.08s`，后续视图复用则为 `3` 包、约 `0.51～1.64s`。
4. **现有文件体积并非主要由 TypedArray 包装造成。** 固定 `99846` cells artifact 为约 `61.2MB` JSON、`14.2MB` gzip。额外只读审计将 TypedArray 全部替换成微型描述符后，结构 JSON 仍约 `56.2MB`；唯一底层 TypedArray buffer 合计仅约 `3.38MB`。因此仅把 TypedArray 从十进制 JSON 改成原始字节，未压缩文件仍会接近 `60MB`。

## 2. 当前机制与根因

### 2.1 Worker 副本生命周期

`worker-task-coordinator` 只有一个 task-specific persistent session，只有 task 和 binding 同时一致才复用 retained map；否则以 `binding-mismatch` 等原因销毁旧 session。`executeWorkerMapMutation` 首次把完整 `state.map` 作为 `map-mirror` 输入，复用时的 `sessionPayload` 才不含 map。

`EditHistory.onMutation` 在地图 revision 推进时会失效计算协调器和显示协调器；只有 Worker 原子提交期间的 guard 能暂时保住当前计算 session。因此问题不是编码器“每一帧都发图”，而是地图副本的生命周期错误地绑定在单个 task 和单个 revision 上，缺少把正式已提交变化同步给长期副本的协议。

显示 Worker 与计算 Worker 分开是合理的并发边界，不应为了少一份镜像而把所有任务串行塞到一个 Worker。需要解决的是两类副本如何消费同一提交日志，而不是把它们合并成一个阻塞队列。

### 2.2 存档结构膨胀

当前 `map-file-io` 以 `JSON.stringify` 写图，并把 TypedArray 转成 `{type, data:Array.from(...)}`。只读 100k 审计的主要顶层体积约为：

| section | JSON 体积 |
| --- | ---: |
| `pack` | `26.05MB` |
| `grid` | `25.47MB` |
| `economy` | `6.27MB` |
| `settlements` | `1.20MB` |
| `features` | `0.84MB` |
| `rivers` | `0.53MB` |
| `politics` | `0.44MB` |

最大子结构是 `grid.cells`、`pack.cells`、`grid.vertices` 和 `pack.vertices`。其中 `c / v` 邻接和多边形索引被保存为大量变长 JS 数组，`p` 坐标为嵌套数值数组；economy 的 deals 也以对象数组重复键名和结构。JSON 的对象键、括号、逗号和十进制数字表示在 100k 规模下远大于实际信息量。

## 3. 冻结方案

### 3.1 一份 canonical 字段注册表

Worker 快照、增量 patch 和二进制存档必须共用同一字段注册表。每个字段记录：

- section、稳定 field ID、schema 版本和类型；
- 是否持久、可派生、只读缓存或运行时临时值；
- dense / sparse / ragged / object-table / string-dictionary 编码；
- 引用目标、空值 sentinel、别名和旧版本迁移；
- 允许的 patch 形式、inverse patch 和精确 round-trip 规则。

禁止分别维护“Worker 传输白名单”和“存档白名单”；任何字段增加、迁移或废弃都必须由同一 registry 驱动审计。

### 3.2 版本化地图副本与提交日志

计算与显示 Worker 各自保留长期 map replica，task 只决定本次执行逻辑，不决定副本生死。完整快照仅用于首次载入、地图替换或显式重同步；其后以提交日志推进：

```text
mapIdentity + baseRevision + targetRevision + patchId + section writes + checksum
```

- 主线程编辑提交、Worker 结果提交、撤销和重做都产生同源 patch / inverse patch；
- patch 只有在主线程事务正式提交后发布；取消、失败、rollback 和 obsolete 不发布；
- 每个副本 ACK 已应用 revision 与 checksum；缺包、顺序间隙、checksum 不符或 Worker 重启时只触发一次有原因的 full resync；
- journal 有界、支持相邻同字段 patch 合并、背压与 supersede；没有 ACK 前不得无限积压；
- Worker 结果提交后，产生结果的副本直接推进 revision，另一副本消费相同 patch，不重新结构化克隆整图；
- 平移、缩放、悬停、选择、纯画面参数不属于 map journal，必须保持页面本地或使用轻量 presentation 请求；
- 跨 task 必须复用同一 replica；不得用 task 名称作为 invalidation 原因。

首期仍以主线程地图为权威，避免一次性把地图所有权、历史和 UI 全迁入 Worker。待增量协议稳定后，才可另立任务评估真正的 Worker-authoritative map。

### 3.3 `.webfmg v3` 紧凑容器

建议容器结构：

```text
magic | containerVersion | schemaVersion | flags
sectionDirectory[]: id, codec, offset, storedLength, rawLength, checksum
section payloads
```

核心编码：

- dense 数值列使用 `Uint8/16/32`、`Int16/32`、`Float32/64` 与 bitset；是否允许 `Float32` 必须逐字段证明，不做全局降精度；
- cell / vertex 的变长邻接与多边形使用 CSR `offsets + values`，不再保存数组套数组；
- 坐标使用成对列或 interleaved 固定列；
- economy deals、markets、cities、routes、rivers 等对象表按字段列化，枚举和重复字符串进入字典；
- 用户备注、主题扩展和其它不适合列化的小型结构保存为独立 CBOR / 紧凑 JSON 区；
- section 独立 checksum、长度和可选压缩，允许损坏定位与分阶段解码；首期优先浏览器原生 gzip，避免先引入 zstd / WASM 的部署与兼容成本；
- 默认保存不再使用 base64 envelope。旧 JSON / gzip / base64、File / Blob、LocalStorage / IndexedDB 和云端格式继续可读；可读 JSON 作为兼容与调试导出保留。

固定 canonical `99846` cells 地图的硬目标：

- 未压缩 v3 容器 `≤16MiB`；
- 浏览器原生 gzip 后 `≤8MiB`；
- 所有 canonical 字段、引用、别名、checksum、地图行为和渲染结果精确 round-trip。

用户可以添加无界备注或未来二进制资产，因此任意用户文件不能伪造统一硬上限；这些 section 必须单列 raw / stored bytes，并在超过基线时给出诚实诊断。

## 4. 分阶段实施

### A——字段注册表与基线

- 形成完整 field registry、旧格式映射和派生字段排除清单；
- 冻结 10k / 100k 操作矩阵：入口、task、session、fresh / reuse、传输包 / 字节 / 时间、revision 变化和 invalidation 原因；
- 冻结存档 section / path raw、stored 和 stringify / compress / write / read / parse 时间；
- 此阶段不改产品行为。

### B——共享 revision replica

- 建立 replica manager、patch codec、ACK / resync、journal / compaction；
- 主线程编辑、Worker 提交、撤销 / 重做接入 canonical patch；
- 计算 / 显示 Worker 跨 task 复用副本，保持各自并发与故障隔离；
- 锁定取消、rollback、obsolete、Worker 崩溃和缺包的原子行为。

### C——二进制容器

- 实现 registry 驱动的 column / CSR / dictionary codec 与 v3 section container；
- 新默认保存、浏览器存储、文件导出 / 导入和云端存档接入；
- 完成 v1 / v2 / v3 sniff、迁移、损坏拒绝和替换前原子校验；
- 保存和恢复阶段按 section 流式 / 分片执行，不制造主线程 LongTask。

### D——集成验收

- 10k / 100k 平移、缩放、悬停、选择不传 map；
- warm replica 下同域、跨域、撤销 / 重做、主线程编辑和后续视图切换不得 full snapshot；
- map replace 和明确 resync 恰一次 full snapshot；stale / missing / corrupt patch fail closed；
- v3 raw / gzip 体积达标，保存 / 恢复无 LongTask，数据、历史、renderer、GPU、picking 同源；
- 旧纯 JSON、gzip-base64、IndexedDB、File / Blob 和云端存档全部兼容；超限 / 损坏文件在替换前拒绝并保留当前图。

## 5. 阶段 B 实施结果

- Worker 持久 session 的复用条件不再包含 task 名称；同一 binding 下可从重生成直接切换到存档导出等其它 handler，热路径只发送 session payload。
- 协议新增 `apply-session-patch / session-patched`。首次完整副本由主线程和 Worker 分别对 canonical 24 分区计算双 32-bit checksum；后续 patch 携带连续的真实 `baseChecksum / targetChecksum`，Worker 按实际应用后的写集独立复算并 ACK。缺失、漂移或错误 ACK 会销毁副本，下一次请求只能完整重同步。
- 主线程编辑、撤销和重做从正式 command domain 或 Worker domain write set 生成同源 replace / range patch。普通 mutation 同步计算和显示副本；Worker 事务的计算副本已经包含新结果，因此只向显示副本发布，避免重复应用。
- 未登记 command、地图替换、revision 间隙、错误 ACK、超时或 Worker 故障均保守销毁对应副本；取消、失败和 rollback 不会进入 `EditHistory.onMutation`，因此不发布未提交 patch。
- 纯 Node journal、command patch 与完整 Worker 十一类回归通过；跨 task 只创建一个 Worker，后续输入显著少于 fresh，全量构建通过。阶段 B 未启动浏览器。

## 6. 非目标与停止条件

- 阶段 B 不提前实施格式迁移或浏览器复验；
- 不修改 `source/`、用户当前 Chrome、用户地图或 Wiki；
- 不把画面参数误做 map patch，不把两个 Worker 强行合并为单一串行 Worker；
- 不用换压缩算法掩盖 56MB 结构浪费，不把 base64 当新格式；
- 发现 registry 无法精确表达旧字段、某类 patch 无法可靠生成 inverse、v3 round-trip 改变地图语义，或连续两次真实浏览器阻断时必须冻结并请用户裁定。

## 7. 阶段 C 实施结果

- `.webfmg v3` 使用固定 magic、容器 / schema 版本、分区目录、offset / length 和逐 section FNV checksum；紧凑 value codec 覆盖窄整数、稀疏列、定点小数、定长 tuple、ragged CSR、对象表、字符串字典和 TypedArray。Grid / Pack 的 vertex-cell 与 vertex-neighbor 冗余拓扑由 cell polygon 确定性重建，并以排列码和例外行精确保留原顺序。
- 默认本地文件、浏览器存储和公开压缩导出均写 v3 gzip；plain JSON 与旧 gzip 仍可显式导出，既有纯 JSON、旧 gzip、gzip-base64 envelope、File / Blob、LocalStorage / IndexedDB 二进制记录均保持读取兼容。v3 导入在迁移和校验成功前不替换当前地图，分区损坏会以目录或 checksum 错误拒绝。
- 固定 `100000` 目标实际 `99846` cells 的 v3 为 raw `13,197,127B`、gzip `7,410,044B`，分别低于 `16MiB / 8MiB` 硬门；encode 约 `1.90s`，完整 encode / gzip / decode / migrate / deep round-trip 约 `10.78s`，全部发生在存档 Worker 内。10k 为 raw `2,496,659B`、gzip `1,172,083B`。
- v3 100k 精确 round-trip、四类 vertex 拓扑顺序、alias、损坏拒绝、Worker / fallback 文件 I/O、旧浏览器存档兼容和 100k transfer 门通过。误调用的旧浏览器存档兼容脚本启动了隔离测试浏览器并通过，但不计作阶段 D 正式浏览器验收；用户 Chrome、用户地图、`source/` 与 Wiki 未改。

## 8. 阶段 D 实施结果

- 10k / 100k 的首个存档请求分别发送约 `200 / 952` 个输入包；同一版本化副本上的浏览器保存和编辑后再次导出都只发送 `3` 个输入包，且 session id 保持不变。城市改名、撤销和重做分别只发布一条精确对象行写入，三次 checksum 与 revision ACK 连续推进 `0 → 1 → 2 → 3`；导出的 v3 包含重做后的名称。平移、缩放、悬停和选择窗口触发的 Worker 地图任务为 `0`。
- 浏览器默认保存统一写入 IndexedDB 直接二进制记录，不再让较小 v3 回退到 gzip-base64 / LocalStorage；旧 LocalStorage、gzip-base64 envelope 和 plain JSON 继续只读兼容。固定 100k 浏览器实值为 raw `12,612,324B`、gzip `7,287,937B`，低于 `16MiB / 8MiB`。
- 初版城市 patch 仍克隆八个整表，100k 在编辑后出现约 `628ms` 主线程冻结；正式重命名命令现只声明目标 city / burg 行，浏览器实测每次 patch 精确写入 city / burg 两行，三次 ACK 后仍复用三包存档。修复后 100k warm 导出起始窗先后观测到一至两次 `55～57ms`，按既定“200ms 内调查修复一次，仍无有效优化则登记放行”规则登记为最多两次、单次 `≤70ms` 的精确例外。100k v3 导入与浏览器恢复从 outer prepare 结束至 renderer load 结束的 commit / reveal 窗各最多一次 `≤70ms`，同属既有失败优化对照后的精确登记；阈值未全局提高，10k 与其它存档阶段仍保持零容忍。
- 两次失败优化不留产品复杂度；最终产品只保留城市 canonical patch 缺口修复与默认直接二进制浏览器存储。用户 Chrome、用户地图、`source/` 与 Wiki 未改。

第 333 项属于跨协议、存储和运行时的复杂能力；正式完成提交应评估从 `0.2.x` 递增 minor，而不是在本次登记中提前改版本。
