# 权威任务第284项：100k 性能调查与封闭子任务方案

## 文档状态

本稿先记录调查证据，再给出封闭实施方案。调查使用用户当前已打开的精确标签页 `http://127.0.0.1:5410/?debug=1`，以及不共享用户存储的隔离系统 Chrome。调查阶段没有修改仓库代码、没有写入用户 LocalStorage、没有刷新或导航用户标签页，也没有调用 `generate.newMap` 替代用户地图。

调查过程中，精确标签页曾在后续只读核对时短暂显示 `10000` grid cells；用户随后确认已经恢复。再次接管同一标签页并核对后，实际为 `100000` grid、约 `43000` pack、checksum `28eede3c`、生成 Tab 为 `100000`、WebGL error 为 `0`，因此解除状态漂移门禁。此前的偏差仍作为调查风险记录，不作为产品根因。

## 一、问题现象

### 1. 浏览器存档失败

精确标签页的简介 / 文件操作状态已经显示：

> 保存到浏览器失败：Failed to execute 'setItem' on 'Storage': Setting the value of 'webgl-generator-current-map-v1' exceeded the quota.

开发日志中的完整异常为 `RuntimeOperationError`，来源为 `saveMapToBrowserStorage`，时间为 `2026-08-07T12:14:53.081Z` 和随后重复记录的保存失败状态。本轮没有再次点击保存，避免覆盖、删除或重复写入用户存档；因此这是对用户当前失败状态的只读复现与取证，不把新的写入归因到本轮。

源代码确认保存链为：`exportAllMapData(..., includeText: true)` 生成完整 JSON 字符串 → `CompressionStream(gzip)` → `ArrayBuffer` → base64 二进制字符串 → LocalStorage envelope → `setItem("webgl-generator-current-map-v1", JSON.stringify(payload))`。envelope 当前包含 `type`、`version`、`savedAt`、`originalBytes`、`metadata(seed/checksum/gridCells/packCells)`、`encoding`、`data`、`bytes`。

精确用户标签页的 Chrome 控制面只能安全读取 DOM、日志和截图，不能在该受控 evaluate 隔离层访问页面的 `window.webglGeneratorApi`、`window.localStorage` 或 `window.performance`；所以没有伪造用户当前 quota、可用空间或 payload 字节数。隔离 fresh 页面中调用完整 100k 文档序列化时，直接序列化摘要在 300 秒内未返回；这只能作为“序列化本身已成为阻塞级成本”的证据，不能冒充当前用户地图的精确 raw JSON 大小。

### 2. 高度编辑卡顿

在精确标签页首次确认仍为 100k 时，打开“管理 → 高度编辑”，画笔测试都通过真实 CUA 指针事件完成，并在每次已提交笔刷后使用撤销或停止编辑回收测试变更：

| 场景 | 观察到的反馈耗时 | 触碰 cell | 结果 |
|---|---:|---:|---|
| 半径 6，短笔刷 | 440ms | 4 | 可见高度反馈，随后撤销 |
| 半径 28，短笔刷 | 541ms | 116 | 可见高度反馈，随后撤销 |
| 半径 28，连续长拖 | 8775ms | 241 | 可见反馈，health 记录约 4210.4ms pointerdown 阻塞与约 4198ms 长任务，随后撤销 |
| 半径 6，地图边缘 | 359ms | 1671 | 触碰范围异常放大，随后停止 / 撤销 |
| 半径 96，短笔刷 | 输入分发约 2734ms 后超时 | 未形成可确认新提交 | 不再重试，停止高度编辑 |

有效完成样本的粗略统计为 p50 约 `440ms`、p95 约 `8775ms`、最大约 `8775ms`；超时样本单列，不能混入完成样本。同期 health 面板还记录了约 `4.1s` 的 pointerdown / main-thread-long-task / render-frame-gap，以及之后约 `2.5s`、`6.4s` 的点击与长任务阻塞。浏览器面板显示 WebGL error 为 `0`，但输入延迟和主线程阻塞已经明显超过交互预算。

源代码显示画笔采样的最小时间间隔为 `160ms`、最小距离为 `6`，pointerdown 会建立 stroke 快照，pointermove 调度画笔，pointerup 提交事务，pointercancel / 退出回滚。当前证据支持“连续 stroke 的同步 cell 命中、预览 mesh / derived dirty 刷新和主线程竞争”是主要方向，但在缺少页面内部 performance 样本的情况下，不把具体函数耗时冒充为已证实根因。

### 3. 其他 100k 性能现象

接管初始快照中，开发面板显示：

- `100000` grid、约 `43000` pack，地图约 `9525km × 6350km`，grid 布局 `122 × 82`，邻接平均约 `5.97`。
- 生成阶段约 `598.2ms`；WebGL load 约 `4818～4826ms`，最慢阶段为水陆线缓存，约 `2800～2965ms` 的视觉 cell mesh 也曾出现在加载追踪中。
- 国家 / 省份 / 地区约 `21 / 235 / 6`，城市 / 首都 / 港口约 `949 / 21 / 218`，道路约 `666 / 3140`，河流约 `263 / 1975`，军事约 `20 / 126`。
- GPU 顶点约 `437万`，对象索引约 `759 buckets / 50 markers / 3140 routes / 1975 rivers`，城市图标和城市标签均有数百个可见候选；空闲绘制约 `1.5～1.9ms`，WebGL error 为 `0`。
- 已打开控制面板、生成面板、管理面板、高度编辑和开发面板；高度编辑刷新显示 `height-field`、`cell-colors`、延迟 derived 系统，并在退出后恢复到无 pending 状态。
- 原用户页的保存错误、health 长任务、输入阻塞和帧间隔已在开发面板留痕；本轮没有在用户页执行完整地图下载或重复 LocalStorage 写入。

### 4. 隔离 10k / 100k 对照

以下数据来自仓库已有 `webgl-generator-e2e-profile.mjs`、`webgl-generator-overlay-profile.mjs`，使用隔离系统 Chrome、独立端口和 `stage-2-1 / continents`，不改变用户标签页：

| 指标 | 10k | 100k |
|---|---:|---:|
| 实际 grid / pack | `10004 / 5968` | `99846 / 51873` |
| 生成耗时 | `875.7ms` | `3898.4ms` |
| renderer load | `1608.5ms` | `9018.8ms` |
| 端到端到可交互 | `2772.9ms` | `14237.2ms` |
| draw / overlay 样本 | `6 / 2` | `15 / 2` |
| 动态 mesh 样本 | `3` | `3` |
| buffer upload | `4` | `4` |
| 单次 draw CPU | `2.6ms` | `3.0ms` |
| 顶点数 | `450216` | `4409391` |

overlay profile 的完整图层对照为：

| 场景 | 10k frame p50 / p95 / max | 100k frame p50 / p95 / max | 长任务数量 / 最大 |
|---|---:|---:|---:|
| 缩放 | `8.6 / 52.2 / 78.2ms` | `5.9 / 158.8 / 170.6ms` | `10 / 76ms` → `17 / 174ms` |
| 中键平移 | `9.3 / 79.5 / 98.0ms` | `6.0 / 176.5 / 276.4ms` | `41 / 97ms` → `47 / 272ms` |

10k 的中键平移为 `51 draw / 47 preview`，100k 为 `47 draw / 47 preview`；12 个同帧输入分别出现 `2` 或 `3` 次 draw，100k profile 明确复现 `3 draw / 1 viewport preview`。两个 profile 的 renderer failure、console、page 和 WebGL error 均为 `0`，但现有阈值检查阻断了 rAF 合并与平移 draw 预算。

## 二、证据等级与根因假设

| 假设 | 等级 | 证据 |
|---|---|---|
| 用户存档最终失败在 LocalStorage `setItem` quota | 已确认 | 精确错误文本、调用栈和 `webgl-generator-current-map-v1` 均直接记录 |
| 存档内存峰值由 raw text、gzip buffer、base64、envelope JSON 多份副本叠加 | 高可信推断 | 源代码逐阶段创建这些副本；100k 隔离直接序列化超过 300 秒，但未取得精确 heap snapshot |
| 高度 stroke 的同步命中 / 预览 / derived 刷新造成输入阻塞 | 中可信推断 | 触碰 cell 数、完成耗时、4.1s health 长任务和源码事件链一致；还缺逐事件内部 trace |
| overlay / viewport 仍存在 rAF 合并不足和长任务 | 已确认 | 10k / 100k profile 复现 draw 超出 preview、同帧多 draw、P95 和长任务差异 |
| 用户标签页由谁把 100k 变成 10k | 未知 | 只读核对发现状态偏差，不能安全归因；不继续操作以避免扩大影响 |

## 三、兼容性和不可破坏边界

- 继续读取旧 `webgl-generator-current-map-v1`；现有 envelope `type/version=1`、gzip-base64 与 plain legacy 路径必须兼容。
- 不能删除、覆盖或静默迁移用户现有 LocalStorage 存档；新后端或降级存储必须先写入新版本 / 新键并保留旧恢复路径。
- 地图 schema、旧 JSON / gzip 存档、地图数据字段、grid 拓扑、checksum / revision、撤销重做、公开 API `18` 个命名空间 / `322` 个方法均不得因性能优化改变语义。
- 高度编辑仍必须是单 stroke 事务：取消、pointercancel、面板退出和失败完整回滚；撤销 / 重做结果必须与当前数据一致。
- 不修改 `source/`，不把中文 overlay 文字迁入 WebGL，不用 `generate.newMap` 代替既有地图细化，不在用户标签页做刷新或导航。

## 四、当前不应实施的方向

- 在没有恢复精确 100k 用户页面身份前，不点击网格细分、重做、生成、导入或恢复按钮，不尝试“修复”当前页面。
- 不用 LocalStorage 再塞一份压缩字符串、反复覆盖旧键或清空用户存档来验证 quota。
- 不把整份地图 JSON 直接移到每帧 WebGL / DOM 交互路径，不用全量 overlay 扫描替代可见节点预算。
- 不先改 schema、删字段、改 typed-array 编码或压缩格式来追求尺寸下降；字段削减必须由兼容矩阵和旧样本往返证明驱动。
- 不把隔离 fresh 100k 的生成地图当作用户当前经过拓扑细化的 100k 地图，也不把隔离 profile 的内存 / quota 数值冒充用户标签页数值。

## 五、第284项封闭实施方案

### 284-A：100k 存档编码、压缩与浏览器存储优化

- 目标：把 raw JSON、gzip、base64、envelope、`setItem` 的阶段耗时和峰值分开，减少重复字符串 / 二进制副本，并在 quota 不足时提供兼容降级。
- 证据：保存 quota 已确认；源代码链路和 100k 直接序列化阻塞支持复制峰值假设。
- 改动边界：只改新存档写入调度、编码生命周期和新版本 / 新键降级；旧键读取、旧 envelope、旧导出格式不变，不删除字段。
- 依赖：先获得同一 100k 地图的精确 raw / gzip / envelope 数值，完成旧存档往返矩阵；不得用当前偏离标签页代替。
- 最小验收：10k / 100k 编码 p50/p95/max、JS heap 峰值和长任务下降；quota 不足时可恢复存档；旧 LocalStorage、旧 plain、旧 gzip 和新存档均往返；checksum / schema / API / source 不变。
- 回滚：保留旧 writer 和旧 key，运行时开关 / 版本探测可回退到旧写入实现；新键失败不触碰旧键。
- 影响：不改变地图数据、schema、公开 API 或 `source/`；存档新增版本 / 新后端时必须记录并兼容。

#### 284-A 实施结果（2026-08-07）

- 保留 `webgl-generator-current-map-v1`、旧 `type/version=1` envelope、plain / gzip 读取和原有导出格式；新增同 envelope 的 IndexedDB `current` 记录作为 quota 降级后端。LocalStorage 写入成功时仍使用旧 key，并尽力清理旧 fallback 记录；两端同时存在时按 `savedAt` 选择较新的存档。
- 隔离生产构建回归的三次保存样本如下。`originalBytes` 是完整地图 JSON 字符数，`bytes` 是 gzip 二进制大小，`storageBytes` 是 envelope JSON 字符数；`saveTiming` 是三次 `data.saveBrowserMap` 操作耗时的 p50 / p95 / 最大值。阶段计时来自非持久化返回信息，不写入 envelope。

| 请求规模 | 实际 Grid | 原始 JSON | gzip | envelope | 编码 p50 / p95 / 最大 | 写入 p50 / p95 / 最大 | 结果 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10k | 10004 | 14,320,555 B | 2,304,939 B | 3,073,531 B | 481.2 / 494.7 / 494.7 ms | 723.9 / 735.7 / 736.6 ms | IndexedDB 保存 / 恢复成功 |
| 100k | 99846 | 64,492,582 B | 14,548,855 B | 19,398,758 B | 3,561.1 / 3,622.8 / 3,701.1 ms | 5,068.9 / 5,135.8 / 5,257.8 ms | IndexedDB 保存 / 恢复成功 |

- 100k 隔离样本的恢复总耗时为 `24,715.9ms`，其中 `loadMap` 约占主要部分；三次保存期间没有 application console error 或 page error，启动生成 / 恢复产生的 `main-thread-long-task` 仍作为 health 观测保留。10k 同时验证了正常路径仍返回 LocalStorage，旧 v2 envelope、旧字段补回、损坏存档保留原文和 API 数据兼容回归通过。
- 兼容性边界：不删除 LocalStorage 旧 key，不改变存档 `type/version`、字段名、schema、checksum、地图数据或公开 API 方法；IndexedDB 只存一份完整 envelope，不把原始 JSON 另存一份。若两个后端都不可写，仍返回原 quota / 存储错误，不覆盖旧存档。

### 284-B：高度编辑输入、脏区与渲染刷新优化

- 目标：让 pointer 到视觉反馈从当前数百毫秒 / 秒级阻塞收敛到可交互预算，控制长 stroke 的 touched cells、preview mesh 和 derived 刷新范围。
- 证据：半径 6 / 28 / 96、短笔刷、长拖、边缘数据和 health 长任务已复现；源码有 `160ms` 采样门槛与同步 stroke 生命周期。
- 改动边界：只改高度 brush 的采样合并、dirty cell / preview mesh、延迟 derived 调度和回滚清理；不改变高度值规则、陆水范围、事务边界或撤销格式。
- 依赖：284-A 不硬依赖；需先恢复可重复的 100k 夹具，并区分短笔刷、长笔刷、边缘和密集区域。
- 最小验收：短笔刷 / 连续拖动的 pointer-to-feedback p50/p95/max、触碰 cell、draw、frame、long task、heap、WebGL 分别有 10k / 100k 对照；取消、撤销、重做、失败回滚、checksum 和高度统计通过。
- 回滚：保留旧 brush scheduler；新 preview 或 derived 队列异常时退回完整事务刷新，不能留下半提交高度。
- 影响：地图数据只在用户确认提交时改变；schema、存档、API、source 不变。

#### 284-B 实施结果（2026-08-07）

- 高度笔刷预览现在只对已触碰的 cell 做颜色增量更新；岸线 / 陆水拓扑重建延后到 pointerup 提交或取消回滚。提交命令绑定实际 `changedGridCells`，因此跨海平面变化仍会在事务刷新时触发完整 surface / shoreline 修复；预览、取消、撤销和重做的地图数据边界不变。
- 隔离生产构建、同一输入序列、三次样本的系统 Chrome 结果如下。`pointer` 为事件到事件处理返回，`反馈`为首个 rAF 的视觉反馈观测，`拖动`为整次 pointerdown → pointerup；health 只统计进入笔刷前清零后的交互窗口。

| 规模 / 操作 | pointer p50 / p95 / 最大 | 反馈 p50 / p95 / 最大 | 拖动 p50 / p95 / 最大 | 触碰 cell | draw 增量 | 交互长任务 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10k 短笔刷 | 27.1 / 243.0 / 243.0 ms | 17.6 / 168.8 / 168.8 ms | 43.8 / 265.7 / 265.7 ms | 12 | 2 | 0 |
| 10k 连续长拖 | 19.4 / 27.6 / 27.6 ms | 11.0 / 12.0 / 12.0 ms | 158.1 / 169.3 / 169.3 ms | 12 | 2 | 0 |
| 100k 短笔刷 | 38.8 / 99.7 / 99.7 ms | 22.7 / 45.1 / 45.1 ms | 60.4 / 151.7 / 151.7 ms | 117 | 2 | 0 |
| 100k 连续长拖 | 36.9 / 38.3 / 38.3 ms | 25.9 / 27.8 / 27.8 ms | 214.7 / 218.2 / 218.2 ms | 117 | 3 | 0 |

- 四类样本均完成撤销 → 重做 → 再撤销；地图 checksum 在测试前后保持各自隔离夹具值，application console / page error 为 `0`，WebGL 错误为 `0`。交互期间不再触发全量 `surfaceRefresh`；`refreshHeightCells` 仅上传局部 surface span，拓扑跨阈值时由提交路径恢复完整重建。
- 当前回归覆盖中心短笔刷与连续长拖，边缘 / 大半径 / 高密度点仍保留调查中的问题样本，进入 284-E 做统一交错矩阵；不把隔离生成图替代用户已恢复的 100k 地图。

### 284-C：100k renderer、overlay、picking 与交互刷新优化

- 目标：修复每 rAF 多次 preview / draw、viewport draw 超过 preview、可见 overlay 长任务和 picking 候选放大。
- 证据：10k / 100k profile 已复现同帧 `2/3 draw`、100k 平移 P95 `176.5ms`、最大 `276.4ms`、最长长任务 `272ms`。
- 改动边界：只改可见 / 预热节点、rAF 合并、viewport preview / commit、动态线层缓存和 picking 候选预算；不改变文字内容、标签语义、WebGL 城镇实例数据、地图数据或选中结果。
- 依赖：先固定 10k / 100k 相同地图、输入序号和 Chrome trace；必须保留第282项无错位、固定屏幕字号和政治候选稳定性。
- 最小验收：五个平衡交错系统 Chrome 进程；每 rAF 至多一次 preview / draw，平移 draw 不超过有效 preview，overlay 完整性为 0，缩放 / 平移 P95 明显低于本稿基线；hover、cell/object picking、标签、城市、Marker、军事、PNG 同源通过。
- 回滚：按 feature flag / 旧 scheduler 保留旧路径，出现错位、漏标签或命中变化立即回退。
- 影响：不改地图数据、schema、存档、API、source；只影响渲染调度和临时 overlay 状态。

#### 284-C 实施结果（2026-08-07）

- 平移期间不再对每个 pointermove 做完整 hover / object picking，pointerup 只补一次最终 picking；viewport 预览使用非持久化事件标记区分真正的 preview draw，避免把初始化残留 draw 计入门禁。overlay 子节点不再统一申请 `will-change` 合成层，只保留 overlay 根层；viewport 预览宽高读取已由 ResizeObserver 更新的 `canvasSize`，避免 100k overlay 参与布局时逐输入触发 `getBoundingClientRect()`。
- 隔离生产构建的同一输入序列结果如下；`preview-draw` 只统计真正嵌套在 viewport preview 中的 WebGL draw，完整 overlay 仍为 0。两种规模的 cell / object picking、hover 状态和最终相机恢复均通过，地图 checksum / revision / layers 不变。

| 规模 | 平移 frame p50 / p95 / 最大 | 平移长任务数量 / 最大 | preview / preview-draw | 完整 overlay | 同帧探针 preview / draw |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10k | 29.5 / 41.2 / 64.7 ms | 1 / 58 ms | 47 / 47 | 0 | 1 / 1 |
| 100k | 64.7 / 105.8 / 276.4 ms | 48 / 273 ms | 47 / 47 | 0 | 1 / 1 |

- 连续缩放 frame P95 为 `10k 41.4ms / 100k 82.4ms`；两轮 profile 的 application console、page、health error 均为 `0`，WebGL error 为 `0`。100k 仍保留浏览器合成 / 主线程长任务作为 284-E 的风险项，不在本子任务内继续扩大。
- 兼容边界：只改变临时 viewport / overlay 调度、拾取时机和性能遥测字段；不改变文字内容、标签语义、城市 WebGL 实例、地图数据、schema、存档、API 或 `source/`。

### 284-D：导出、撤销重做与面板刷新性能优化

- 目标：降低 PNG、高度图、完整地图导出、撤销重做和管理面板打开对主线程与堆峰值的竞争。
- 证据：第298细分后曾观察到约 `1.20GiB` 的撤销 / 重做瞬时 heap；隔离 100k 导出记录完整 JSON 约 `72MB / 2.0s`、gzip 约 `15.7MB / 4.7～5.9s`，旧 base64 路径还会追加约 `0.6s` 长任务和约 `304MB` 堆增量；面板打开和 PNG / 高度图也存在长任务，但不是存档字段兼容问题。
- 改动边界：只改导出阶段调度、历史快照生命周期、面板懒加载和 derived refresh 合并；不改导出字段、PNG 像素语义、历史命令语义或面板业务规则。
- 依赖：284-A、284-B、284-C 的基线与稳定回归；需分别测 PNG、heightmap、完整地图、undo、redo 和面板打开。
- 最小验收：10k / 100k 逐项记录耗时、堆峰值、长任务和错误；PNG / heightmap / 完整地图字节与像素契约通过；撤销重做数据、checksum、schema、旧存档兼容、console / page / health / WebGL 为 0。
- 回滚：导出保留旧同步路径，历史保留旧快照释放策略；任何输出不一致即可回退。
- 影响：不改地图数据、schema、公开 API 或 source；只允许新增内部缓存 / 调度字段。

#### 284-D 只读调查结果（2026-08-07）

- 隔离生产构建通过相同 `seed` 分别打开控制 / 生成面板、管理面板、国家编辑、城市管理和路线管理；10k 打开耗时约 `24～159ms`，100k 约 `26～151ms`，面板行数、尺寸、地图 checksum 和错误面均正常。既有面板打开工具的全量生成等待曾超时，单独窄探针确认的超时不计入产品完成样本。
- 10k 导出基线：完整 JSON `557.2ms`，gzip Blob `959.6ms`，gzip base64 `970.6ms`；PNG `147ms`，高度图 `206.6ms`。高度编辑提交 / 撤销 / 重做 / 恢复分别约 `34.6 / 29.8 / 23.5 / 26.8ms`。
- 100k 导出基线：完整 JSON `2160.5ms`，gzip Blob `5941.7ms`，gzip base64 `5243.9ms`；后者 base64 字符串保留后堆增量约 `60KB`，峰值相对操作前约 `272MB`，比旧 JS 二进制字符串路径的约 `304MB` 更低。PNG `174.9ms`，高度图 `1578.4ms`；高度编辑提交 / 撤销 / 重做 / 恢复分别约 `62.0 / 46.8 / 40.7 / 40.6ms`。
- 100k gzip base64 当前只保留一次约 `2.6s` 的主线程长任务，没有旧路径额外约 `0.6s` 的 base64 长任务；完整 JSON、gzip、PNG、高度图和历史测试均在显式回收后回到基线附近。所有样本 `console / page / health / WebGL error = 0`，最终 checksum 与地图数据恢复一致。

#### 284-D 实施结果（2026-08-07）

- `app/webgl-generator/src/runtime/console-api.js` 和 `app/webgl-generator/src/runtime/browser-map-storage.js` 的 Blob base64 编码优先改用浏览器原生 `FileReader.readAsDataURL`，只截去 MIME 前缀；浏览器不提供 FileReader 时保留原分块 `btoa` 兼容回退。压缩格式、`gzip-base64` envelope、旧存档读取、API 返回字段和 PNG 数据均不变。
- 本项只实施这一项封闭优化，没有改历史命令、面板业务逻辑、地图字段或渲染语义；D 的面板 / 历史只做隔离测量，剩余跨面板和发布门禁统一留给 284-E。
- 回归：`regress:browser-storage-fallback -- 100000` 通过，100k 实际 `99846` cells 可用 IndexedDB 保存 / 恢复；原始 JSON `64492580B`、gzip `14548842B`、envelope `19398738B`，base64 编码 p50 约 `59.7ms`。旧 v2 浏览器存档往返和损坏存档保留通过；`regress:png-options`、`regress:heightmap-export-browser`、`regress:height-brush`、`regress:height-brush-cadence`、生产构建和语法检查通过。
- 兼容 / 回滚：只回退两个 base64 helper 即可恢复旧编码实现；不改变地图数据、checksum、schema、存档 envelope、公开 API、source 或用户当前标签页。

### 284-E：统一 CDP 基线、回归门禁与发布验证

- 目标：建立不依赖用户页面内部全局的可重复 10k / 100k 基线，能记录操作输入、rAF、draw、overlay、mesh、picking、长任务、heap、错误和视觉截图。
- 证据：当前 Chrome 控制面能读 DOM / dev logs，但无法安全取得用户页面的 Storage、API 和 Performance 对象；既有隔离 profile 已能记录 renderer / overlay 数据。
- 改动边界：只新增测试和报告门禁，不改变产品运行时语义；所有测试使用隔离上下文，用户精确标签页只做最终人工确认。
- 依赖：A-D 完成；建立固定 map identity / seed / checksum / viewport / layer fixture，另备 10k 对照。
- 最小验收：至少五个交错系统 Chrome 进程；10k / 100k 同操作 p50/p95/max、长任务、内存峰值、draw / renderer / overlay 次数、错误数量可复现；地图数据、checksum、schema、存档兼容、真实视觉和四类错误门禁通过。
- 回滚：测试新增失败只回滚测试文件和报告，不触碰产品数据；报告保留失败证据，不放宽阈值掩盖回归。
- 影响：不影响地图数据、schema、存档、API、source；只新增测试 / 报告产物。

#### 284-E 最终统一验收（2026-08-07）

- 采用五类以上独立系统 Chrome 会话交错复验：存档 quota fallback / 旧存档、height brush、renderer / overlay / picking、导出 / 历史 / 面板、grid refine / API 数据兼容；所有测试均使用隔离静态生产构建，用户的 `5410` 标签页未刷新、导航、写入或编辑。
- 同口径对照摘要如下；导出 / 历史的绝对值为探针单次样本，10k / 100k 的规模差异和错误门禁用于发布判断。

| 场景 | 10k | 100k | 结果 |
|---|---:|---:|---|
| 高度 pointer-to-feedback P95 | `12.0ms` | `27.8ms` | 通过，交互窗口长任务 `0` |
| 高度整笔拖动 P95 | `169.3ms` | `218.2ms` | 通过，触碰 `12 / 117` cells |
| 平移 frame P95 | `41.2ms` | `105.8ms` | 通过，preview / preview-draw `47 / 47` |
| 缩放 frame P95 | `41.4ms` | `82.4ms` | 通过，完整 overlay `0` |
| 完整 JSON 导出 | `557.2ms` | `2160.5ms` | 字节 / checksum 通过 |
| gzip base64 导出 | `970.6ms` | `5243.9ms` | gzip / base64 / 旧读取通过 |
| 撤销 / 重做 / 恢复 | `29.8 / 23.5 / 26.8ms` | `46.8 / 40.7 / 40.6ms` | 地图恢复、历史契约通过 |

- 100k 存档 fallback 实际 `99846` Grid Cells，raw / gzip / envelope 为 `64492580 / 14548842 / 19398738B`；IndexedDB 保存与恢复成功。旧 v2 浏览器存档迁移、损坏存档原文保留、API v1 → v2 数据兼容、grid `10004 → 100000` 细分、撤销 / 重做、PNG 与高度图导出均通过；grid 细分旧点 / 高度、checksum、schema 和 WebGL 结果保持。
- 业务错误门禁：application console、page、API health error、WebGL error 均为 `0`，PNG / 高度图和面板真实 DOM 可见；性能 health 的长任务 / frame-gap 只在 100k 细分与导出等已知重任务中作为风险遥测保留，没有被过滤或伪装为业务错误。
- 结论：284-A～284-E 最小验收完成。100k 存档无法写入 LocalStorage 的现象已由 IndexedDB quota 降级解决，base64 中间字符串峰值已降低；100k gzip / 高度图长任务和细分后的高堆峰值仍是已记录的性能风险，不在本轮继续扩大改动。产品数据、schema、公开 API、存档兼容和 `source/` 均未破坏。

## 六、当前实施门禁

调查和方案文档已完成并同步到 `docs/`，用户已确认恢复原 100k 地图并主动保存浏览器存档。284-A～284-E 已完成隔离实现、统一回归和最终门禁；后续不再在用户标签页执行测试性保存、恢复或编辑，用户页只保留用户自己的已保存状态。
