# 画布性能调查方案

> 状态：已完成。第三轮独立方案审阅 `ACCEPT` 后才开始采样，最终实际报告也由同一审查智能体 `ACCEPT`；结论、原始产物索引和分级建议见 [`../performance/canvas-performance-investigation-report.md`](../performance/canvas-performance-investigation-report.md)。

## 1. 调查目标

本专题先回答“当前正式应用的画布性能时间花在哪里”，再给出按收益、风险和实施顺序分级的优化建议。调查必须把地图生成、renderer `loadMap()`、稳定帧绘制、交互中的临时降级、交互停止后的 idle commit，以及 DOM / SVG overlay 分开计量，不能把任一单项耗时直接当成整体体感。

本阶段交付物为：

1. 可复现的生产构建性能样本与原始 JSON / Markdown 报告；
2. 从用户动作追到 runtime、renderer、buffer / mesh、overlay 和浏览器主线程的调用链；
3. 实际调查报告，列出已证实瓶颈、已排除猜测、证据强度和剩余盲区；
4. 按优先级排列的优化建议及各自预期收益、风险、验证门禁。

本项不直接实施优化。若现有统计无法区分关键阶段，只允许补充诊断脚本、Performance API 标记或 renderer 只读 stats；不得借诊断改动渲染结果、交互语义、地图数据或默认图层。

## 2. 核心问题

调查逐项回答以下问题：

1. 冷启动与页面已就绪后的暖态重新生成分别需要多久？从点击生成到地图可操作时，纯生成、`loadMap()` 和未被子阶段覆盖的调度残差各占多少？其增长是否随 `10k / 50k / 100k` cells 近似线性？
2. `loadMap()` 当前最慢阶段是什么，是否存在重复几何构建、重复上传、默认不可见缓存的同步预建或意外的全量重建？
3. 连续缩放和平移期间，帧间隔、WebGL draw、screen-space route / river / selection mesh、DOM overlay 和浏览器样式 / 布局各占多少？
4. 交互停止后的 idle commit 是否造成明显卡顿；其时间主要来自哪些 dirty mesh、overlay 恢复或碰撞布局？
5. 颜色专题切换、图层开关、适配视图、对象定位和 selection / hover 等高频状态变化，哪些只更新 uniform / color buffer，哪些会重建 geometry 或扫描全部对象？
6. 已有“交互中降级、视口粗筛、overlay 暂停、按需政治 mesh”等优化是否仍实际生效，是否出现新的旁路或回退路径？
7. 瓶颈属于 CPU 计算、主线程布局、TypedArray / buffer 分配与 CPU 侧 WebGL 提交，还是测试 / 构建环境抖动？只有 GPU timer query 或 Chrome trace GPU track 提供证据时才判断 GPU 执行成本；否则明确保留为盲区。

## 3. 调查范围

### 3.1 纳入范围

- 正式应用 `app/webgl-generator` 的 WebGL canvas、renderer、runtime 视口调度和地图 DOM / SVG overlay。
- 生产构建上的初次生成与地图装载、连续滚轮缩放、中键平移、idle commit。
- 高度 / 政治等代表性颜色专题切换，路线、河流、标签、城市、Marker / 资源、军事等代表性图层开关。
- `fitToView()`、对象定位、selection / hover 更新，以及测量对象重场景和选中态重场景。
- `10k / 50k / 100k` 三档固定 seed；完整图层和必要的消融矩阵。
- 浏览器主线程长任务、console / page error、WebGL error 和测试结束后的相机 / overlay 恢复状态。

### 3.2 排除范围

- 不修改 `source/Fantasy-Map-Generator`。
- 不优化地图生成算法、编辑事务、存档、导入导出、云存储、管理面板或业务 API；生成耗时只作为端到端对照项。
- 不以调查名义降低画质、删除图层、改变碰撞、缩放、picking、选择或导出表现。
- 不把历史 prototype / SVG 基线当成当前正式应用结论；历史数据只用于解释指标设计。
- 不实施报告中的优化建议，不提交或推送。

## 4. 场景与指标矩阵

| 场景 | 固定输入 | 主要指标 | 目的 |
|---|---|---|---|
| 冷启动 | 全新 browser process / context、清空站点缓存、默认启动图 | navigation、脚本 / 资源、默认 generation、`loadMap`、首个稳定帧 | 量化真实冷路径 |
| 暖态重新生成 | 页面和默认图已就绪；`continents`、固定 seed、10k/50k/100k | click-to-ready、generation、`loadMap`、调度残差 | 分离生成与画布装载，不冒充冷启动 |
| 连续滚轮缩放 | 三档 cells，完整图层 | frame p50/p95/max、draw、overlay、long task | 观察交互态 |
| 连续中键平移 | 三档 cells，完整图层 | 同上 | 排查视口更新 |
| idle commit | 每轮缩放 / 平移之后 | commit 总耗时、帧 p95、dirty mesh 分项 | 排查停止交互后的卡顿 |
| 图层消融 | 100k；完整、关闭全部 DOM overlay、无标签、无城市、无 Marker / 资源、无军事、无路线 / 河流 | 帧、draw、overlay、对象数、筛掉数 | 量化总控与各层边际成本；各单层结果不相加 |
| 重 overlay | 100k；测量对象、选中态 | overlay / SVG 重建、帧、long task | 覆盖已有矩阵盲区 |
| 状态切换 | 100k；`height / states` 高度与国家专题、代表性图层、适配 / 定位、selection / hover | 动作到稳定帧、buffer / mesh rebuild、draw 次数 | 找出全量重建旁路 |

### 4.1 采样语义

- 现有 `renderer.getStats()` 中的 `lastDraw`、`lastOverlayUpdate` 等“最后一次值”不能在每个 rAF 被重复当作新样本。正式采样前必须为 draw、overlay、screen mesh build、buffer upload 增加只读递增序号或成对 Performance marks；序号未变化时只记录帧间隔，不重复收录旧工作耗时。
- 帧间隔、单次工作耗时和动作到稳定态耗时分别统计。`profile:e2e` 的 `elapsed - generation - loadMap` 只记作“调度残差”，不命名为首帧或 UI 独立耗时。
- `performance.now()` 包围 WebGL 调用得到的是 CPU 侧提交耗时和可能的同步等待，不等于 GPU 执行时间。GPU timer query / trace GPU track 不可用时，报告只能陈述 CPU 提交与 `gl.getError()`，不得推断 GPU 快慢。
- 图层消融先比较 `full` 与 `noDomOverlays` 总控，再观察各单层变体；因碰撞、样式和 dirty 路径会相互影响，各单层差值不做可加性推断。

### 4.2 固定输入与重复规则

- 暖态与交互固定 seed `canvas-perf-266`、模板 `continents`、地图尺寸 `1440×960`、浏览器视口 `1280×820`、DPR `1`、Chrome stable；冷启动无法由现有 CLI seed 控制，必须按实际默认启动 seed 记录，当前预期为 `stage-2-1`，不得伪称 `canvas-perf-266`。实际 Chrome 版本、CPU、内存、Node 和 pnpm 版本进入报告。
- 冷启动样本每次使用全新 browser process / context 并清空站点缓存，不预热，连续采三次。
- 暖态生成、交互和状态切换在同一 context 中先执行一次完全相同但不计入结果的预热，再执行正式动作；每个正式重复使用新的 browser process / context，避免上轮地图和堆内存累积。
- 暖态端到端每个 cells 档位独立启动脚本，不在同一页面固定按 `10k → 50k → 100k` 递增；三档各采三次。overlay 完整图层也逐档独立运行。
- 100k 消融与两个重场景复用同一页面时，三轮分别轮换变体顺序；每个变体执行前恢复相同相机、图层、selection、hover 和 overlay 状态。
- 每个动作型场景正式样本至少三次，报告给出原始值、中位数和波动范围。若最大值与最小值相差超过 `20%`，先隔离后台构建、服务竞争、首次 JIT / 字体加载、浏览器缓存和 GC，再决定是否追加样本。
- 生产构建只做一次；采样期间禁止任何任务写入或读取后覆盖同一 `dist`。每一轮使用独立端口和唯一 JSON / Markdown 路径，失败产物也保留。

## 5. 执行阶段

### 阶段 A：冻结环境与现有能力

1. 记录 commit、分支、Node、pnpm、Chrome 版本、操作系统、视口和 DPR。
2. 确认工作树差异、监听端口和并行构建；生产构建与读取同一 `dist` 的 profile 严格串行。
3. 阅读并画出 `runtime -> renderer -> draw / overlay` 调用链，核对 renderer stats 与现有脚本实际字段。
4. 给 draw、overlay、route / river / selection screen mesh 和 buffer upload 补只读递增序号或 Performance marks；profile 仅在序号变化时收工作耗时。记录现有字段为什么不能直接构成事件分布。
5. 新增有界状态切换调查脚本；所有 browser / context / CDP session / server 必须在 `finally` 中关闭。运行脚本语法检查，并证明诊断不改变地图 checksum、revision、相机、图层、selection、hover 或 WebGL 输出。

### 阶段 B：建立当前生产基线

1. 只构建一次当前分支生产产物。
2. 使用状态调查脚本在三个全新 browser process / context 中采冷启动；冷启动不与暖态重新生成混在同一汇总中。
3. 使用 `profile:e2e` 对 10k / 50k / 100k 分别运行三次；每个进程先做同档不计分预热，再采一次正式样本，分离 generation、`loadMap()`、调度残差和 `loadMap` stages。
4. 使用 `profile:overlay` 对三档完整图层分别运行三次；每个变体先做不计分的同序列缩放 / 平移预热，再采 frame interval、按递增序号去重后的 draw / overlay 事件和 idle commit。
5. 在 100k 上运行三轮消融，必须包含 `noDomOverlays`；另以 `measurement-fixture-count=180` 单独运行测量重场景，并以“陆地 cell 数最多、并列取最小 ID 的国家”作为 selection 重场景目标。
6. 每轮保留 seed、实际 grid / pack cells、对象 / overlay 数量、渲染图层、相机、GC / long task 和错误状态，防止不同世界或不同图层被误作性能对比。

### 阶段 C：状态变化与热点归因

1. 固定动作序列：`height → states（国家专题）→ height`；路线、河流、标签 + 国家 / 省份 / 地区标签、城市、Marker + 资源、军事分别执行 `开 → 关 → 开`；先用固定滚轮 / 拖动序列制造已知非全图相机，再执行 `fitToView()`；通过公开 `selection.select / locate` 路径选择并定位陆地 cell 数最多、并列取最小 ID 的国家；把 pointer 移到该国确定性中心 cell 的屏幕坐标触发 hover，清理时显式调用 renderer hover 回调并断言 `app.pick === null`，不把普通 pointer 移出误作清理保证。每次颜色动作后必须断言 `renderer.getStats().colorMode` 与预期 mode 完全相同，不匹配时保留失败样本并停止该轮归因。
2. 每个动作开始前记录 checksum、revision、camera、layers、colorMode、selection、hover 和所有事件序号。稳定态定义为：runtime map 与 renderer map 身份一致、加载层隐藏、视口交互已结束、overlay 已恢复、相关 dirty 标记全清，并连续三个 rAF 没有新的 draw / overlay / mesh / upload 序号；若 `10s` 内未稳定则保留失败样本。`selection.locate` 另报“dirty 已清但 2.6 秒产品闪烁仍在运行”和“闪烁结束后最终稳定”两个时点，不把动画时长直接命名为卡顿。
3. 每个动作在 `finally` 中恢复原 camera、layers、colorMode、selection 和 hover；动作结束后再次核对 checksum / revision，任何地图内容变化都判定为调查脚本失败。
4. 静态追踪每个动作触发的 dirty 标记、mesh / buffer 重建、上传、draw 和 overlay 更新；用运行时递增序号和 Performance marks 验证静态推断。
5. 只对无 trace 基线中最慢且三轮稳定复现的一个动作采 Chrome trace。使用 CDP `Tracing.start`，至少包含 `devtools.timeline`、`blink.user_timing`、`v8.execute`、frame 和 GPU service 类别；以 `canvas-perf-trace-start / end` User Timing mark 限定动作，输出 `docs/generated/reports/canvas-performance-trace-100k-<动作>.json`。
6. trace 只用于 scripting、style / layout、GC、WebGL CPU 调用和可用 GPU track 的归因，不与无 trace 基线直接比较耗时；GPU track 不可用时在报告中明确盲区。
7. 对候选瓶颈执行一次有界消融或现有图层开关对照。消融只能用于归因，不作为最终用户方案。

### 阶段 D：形成结论与建议

1. 每个结论必须列明场景、样本、指标、代码路径、消融结果和信心等级；没有运行时证据的静态猜测只能列为“待证假设”。
2. 建议按 `P0 / P1 / P2` 排序，并分别说明：预计改善的指标、影响路径、实现复杂度、兼容 / 视觉风险、需要新增的长期守门。
3. 优先推荐可保持画面和交互语义的工作，例如复用缓存、缩小 dirty 范围、避免重复扫描 / 分配、分块或跨帧提交；没有证据时不建议大规模迁移 renderer 技术栈。
4. 实际报告写入 `docs/performance/canvas-performance-investigation-report.md`；原始采样写入 `docs/generated/reports/canvas-performance-*`，不把大段机器输出塞入开发日志。

## 6. 命令与产物矩阵

### 6.1 固定构建

只在所有只读诊断字段和调查脚本完成后执行一次：

```powershell
$env:CI='true'
pnpm.cmd run build:app
```

构建结束后不得再启动会写同一 `dist/webgl-generator` 的命令。

### 6.2 暖态端到端

现有 `profile:e2e` 的 `--cells` 列表会在同一页面按给定顺序运行，因此正式调查改为每次只传一个档位。脚本先补“同档预热一次但不写入正式结果”的调查模式；该模式落地并通过语法检查前，以下命令不得执行。

```powershell
pnpm.cmd run profile:e2e -- --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup 1 --enforce-thresholds false --cells {cells} --seed canvas-perf-266 --template continents --width 1440 --height 960 --viewport 1280x820 --port {port} --out docs/generated/reports/canvas-performance-e2e-{size}-r{run}.json --markdown docs/generated/reports/canvas-performance-e2e-{size}-r{run}.md
```

| size | cells | run | port |
|---|---:|---:|---:|
| 10k | 10000 | 1 / 2 / 3 | 5460 / 5461 / 5462 |
| 50k | 50000 | 1 / 2 / 3 | 5463 / 5464 / 5465 |
| 100k | 100000 | 1 / 2 / 3 | 5466 / 5467 / 5468 |

### 6.3 完整图层交互

`profile:overlay` 只接受单个 `--cells`，因此按下表逐档、逐轮独立运行；正式脚本先执行不计分的同序列缩放 / 平移预热。

```powershell
pnpm.cmd run profile:overlay -- --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup 1 --enforce-thresholds false --cells {cells} --seed canvas-perf-266 --template continents --width 1440 --height 960 --viewport 1280x820 --variants full --port {port} --out docs/generated/reports/canvas-performance-overlay-{size}-full-r{run}.json --markdown docs/generated/reports/canvas-performance-overlay-{size}-full-r{run}.md
```

| size | cells | run | port |
|---|---:|---:|---:|
| 10k | 10000 | 1 / 2 / 3 | 5470 / 5471 / 5472 |
| 50k | 50000 | 1 / 2 / 3 | 5473 / 5474 / 5475 |
| 100k | 100000 | 1 / 2 / 3 | 5476 / 5477 / 5478 |

### 6.4 100k 消融与重场景

三轮消融顺序轮换如下，产物分别为 `canvas-performance-overlay-100k-ablation-r1..r3.json/.md`：

1. `full,noDomOverlays,noLabels,noCities,noMarkersResources,noMilitary,noRoutesRivers`
2. `noRoutesRivers,noMilitary,noMarkersResources,noCities,noLabels,noDomOverlays,full`
3. `noDomOverlays,noRoutesRivers,full,noMilitary,noLabels,noMarkersResources,noCities`

```powershell
pnpm.cmd run profile:overlay -- --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup 1 --enforce-thresholds false --cells 100000 --seed canvas-perf-266 --template continents --width 1440 --height 960 --viewport 1280x820 --variants {variantOrder} --port {5479|5480|5481} --out docs/generated/reports/canvas-performance-overlay-100k-ablation-r{run}.json --markdown docs/generated/reports/canvas-performance-overlay-100k-ablation-r{run}.md
```

重场景固定测量对象 `180` 个；selection fixture 选陆地 cell 数最多、并列取最小 ID 的国家。三轮变体顺序为 `measurement-heavy,selection-heavy`、`selection-heavy,measurement-heavy`、`measurement-heavy,selection-heavy`，端口 `5482 / 5483 / 5484`，产物为 `canvas-performance-overlay-100k-heavy-r1..r3.json/.md`。

```powershell
pnpm.cmd run profile:overlay -- --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup 1 --enforce-thresholds false --cells 100000 --seed canvas-perf-266 --template continents --width 1440 --height 960 --viewport 1280x820 --measurement-fixture-count 180 --variants {variantOrder} --port {port} --out docs/generated/reports/canvas-performance-overlay-100k-heavy-r{run}.json --markdown docs/generated/reports/canvas-performance-overlay-100k-heavy-r{run}.md
```

### 6.5 冷启动、状态切换与 trace

现有入口不覆盖这些动作，因此新增 `tools/webgl-generator-canvas-state-profile.mjs` 和 `profile:canvas-state`。脚本固定第 5 节动作、稳定判据、前后快照与恢复契约；支持 `startup / transitions / trace` 三种 scenario，并在 `finally` 中释放全部资源。

```powershell
pnpm.cmd run profile:canvas-state -- --scenario startup --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup false --viewport 1280x820 --port {5485|5486|5487} --out docs/generated/reports/canvas-performance-startup-r{run}.json --markdown docs/generated/reports/canvas-performance-startup-r{run}.md
pnpm.cmd run profile:canvas-state -- --scenario transitions --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup true --cells 100000 --seed canvas-perf-266 --template continents --width 1440 --height 960 --viewport 1280x820 --port {5488|5489|5490} --out docs/generated/reports/canvas-performance-state-100k-r{run}.json --markdown docs/generated/reports/canvas-performance-state-100k-r{run}.md
pnpm.cmd run profile:canvas-state -- --scenario trace --action {slowestAction} --browser-channel chrome --playwright-dir D:\work\fmg\source\Fantasy-Map-Generator --warmup true --cells 100000 --seed canvas-perf-266 --template continents --width 1440 --height 960 --viewport 1280x820 --port 5491 --out docs/generated/reports/canvas-performance-trace-100k-{slowestAction}.json
```

当前工作树根目录不安装 Playwright，因此所有命令显式复用 `D:\work\fmg\source\Fantasy-Map-Generator` 已安装的 Playwright；脚本不得硬编码兄弟 checkout。`noDomOverlays` 必须同时关闭 labels、state / province / zone labels、城市、Marker / 资源、军事和 measurements，才可称为 DOM overlay 总控消融。

所有命令都使用 `window.__webglGeneratorApp.renderer.getStats()`、按需读取的递增事件历史与浏览器 Performance API。新增脚本和新增参数必须先进入实际源码、完成 `node --check`，才可按本节模板执行；失败时保留对应唯一产物，不复用别轮结果。

## 7. 调查完成门禁

- 调查方案先由独立智能体审阅为 `ACCEPT`；任何 `BLOCK` 必须修正并复审，之后才运行性能采样。
- 10k / 50k / 100k 生产基线、100k 图层消融、测量重场景、选中态重场景和状态切换均有可复现结果或明确失败证据。
- 性能结论能够区分 generation、`loadMap`、按序号去重的 CPU draw / mesh / upload、idle commit、overlay、浏览器 layout / style 和长任务；没有 GPU timer / trace 证据时明确声明 GPU 执行成本未知。
- 报告同时保留通过项、失败项、抖动、既有阈值是否仍适用，以及不能归因的剩余风险。
- 诊断前后地图 checksum、revision、相机恢复、图层终态、console / page / WebGL error 均受检查。
- 若补充诊断代码，执行相关语法检查、生产构建和 `git diff --check`；不运行与调查无关的全量业务回归。
- 最终报告再交同一审查智能体核对证据与建议是否相符；本项只在报告、索引、权威计划和开发日志同步后标记完成。
