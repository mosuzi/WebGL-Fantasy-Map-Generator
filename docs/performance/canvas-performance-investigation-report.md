# 正式画布性能实际调查报告

## 1. 结论摘要

本次调查确认，当前正式应用的连续缩放与平移瓶颈不在 WebGL `draw` 的 CPU 提交本身，而在每个输入事件都会重复执行的完整 DOM / SVG overlay 更新，标签布局又占 overlay CPU 的绝大部分。100k 完整图层三轮中位数里，连续缩放 / 平移的 frame p95 分别为 `176.6ms / 305.8ms`，renderer `draw` p95 都只有 `0.2ms`，但 overlay p95 为 `161.6ms / 122.7ms`，标签平均耗时占 overlay 平均耗时约 `93% / 94%`。

100k 消融总控进一步确认该结论：关闭全部 DOM overlay 图层后，缩放 frame p95 从三轮中位 `153.0ms` 降到 `6.0ms`，平移从 `188.3ms` 降到 `41.2ms`；overlay p95 分别从 `101.4ms / 79.6ms` 降到 `3.4ms / 2.5ms`。两轮只包含 `full / noDomOverlays` 的隔离复测也得到相同方向：缩放从 `129.5～135.3ms` 降到 `6.0ms`，平移从 `153.0～158.8ms` 降到 `35.2～41.3ms`。这不是“删除节点”或“跳过整个 overlay 函数”的测试：`3887` 个节点仍在，每个输入仍记录 overlay 事件，只是不可见图层令昂贵的可见定位和碰撞分支大多短路。因此它给出关闭可见 overlay 工作的因果上界，不能直接推导节点内存成本，也不是保持视觉连续的产品收益承诺。

调查同时确认四类次级问题：

1. 100k `loadMap()` 中，视觉 cell mesh 与水陆线缓存合计中位约 `9.66s`，约占 `loadMap()` 的 `80%`，是初次装载首要热点。
2. 颜色专题切换会重建约 `440.8` 万个 surface 顶点并全量上传；100k `height → states` 动作中位 `280.0ms`，其中 surface refresh `194.7ms`、WebGL buffer CPU 提交 `58.8ms`。
3. `fit-to-view` 会触发 viewport preview、`120ms` debounce、道路 / 河流屏幕 mesh、selection、两次 overlay 与最终 commit；三轮中位 `658.2ms`。Trace 的 `728.999ms` 动作窗口内，主线程热点包括 scripting `238.025ms`、style recalculation `121.690ms`、layout `38.880ms`、主线程 paint / composite preparation `78.589ms` 与 GC `17.885ms`。
4. `selection.locate` 不是单纯一次定位：它会产生重复 selection / draw 链，并运行约 `2.6s` 的产品闪烁动画。100k 三轮最终稳定中位 `2743.5ms`；动作开始到连续三个 clean frame 的 dirty-clean 检查点中位 `362.1ms`，此时 flash 仍 active。该检查点包含在最终稳定窗口内，不能相加；动画持续时间也不能直接命名为“卡顿”，但动画期间重复 geometry / upload / overlay 已形成真实长任务。

因此建议先做 viewport 交互快路径和 overlay / 标签批处理，再收敛 locate 与复合图层重复刷新；装载拓扑、surface 颜色 / 几何解耦和 route / river commit 属于下一优先级。本专题只调查和建议，没有实施任何优化，也没有改变渲染输出、地图数据、交互语义、默认图层、存档或公开 API。

## 2. 调查边界与审阅门禁

调查方案见 [`../task-notes/canvas-performance-investigation-plan.md`](../task-notes/canvas-performance-investigation-plan.md)。方案在实际采样前由同一独立智能体经过两轮 `BLOCK` 修正后得到 `ACCEPT`：

- 第一轮补齐冷 / 暖态边界、独立 Chrome 进程、预热、事件递增序号、CPU / GPU 边界、状态动作与 trace 协议。
- 第二轮修正国家专题真实 mode 为 `states`，并要求动作后断言 renderer `colorMode`。

诊断插桩和 profile harness 又分别经过独立审查。Overlay harness 首轮动态使用后因缺少 frame p50、idle 起点和恢复证明被阻断；第二轮又因 heavy fixture 物化、完整 variant 保持、baseline failed、瞬时 WebGL error 与 health 分类不完整被阻断。所有阻断修复并由原审查者 `ACCEPT` 后，受影响的完整图层、消融与 heavy 矩阵全部重新采样；旧结果和中途半轮不进入本报告正式统计。

本报告完成后再由同一方案审查智能体逐项核对正式 JSON、范围、波动、事件嵌套、建议边界和门禁。首轮 `BLOCK` 的八类问题全部修正，二轮只剩阈值观察分类名一处事实错误；修正为 main-thread-long-task `36`、未强制阈值观察 `193`、render-frame-gap `0`、health error `0` 后，最终结论为 `ACCEPT`。

允许的改动只有：

- renderer 只读性能事件和计时统计；
- 端到端、overlay、状态切换和 CDP trace 脚本；
- 本调查方案、原始生成报告与长期总结文档。

明确排除：直接优化、降低画质、修改碰撞 / picking / selection / 导出表现、改生成算法、改业务 API、改存档 schema、改 `source/`、提交或推送。

## 3. 环境、构建与采样协议

| 项目 | 实际值 |
|---|---|
| 分支 / 基线 | `codex/canvas-performance-optimization` / `62dbcdc1cbc20aeb56cfa9912195406fe1f544e4` |
| 操作系统 | Windows 11 `10.0.22631`，64 位 |
| CPU / 内存 | Intel Core i7-11700，8 核 16 线程；系统约 64GB；浏览器暴露 `deviceMemory=32GiB` |
| GPU | NVIDIA GeForce RTX 3060，ANGLE / D3D11 |
| Node / pnpm | `v24.14.0` / `10.0.0` |
| Chrome | 系统 Chrome `150.0.7871.187`，headless |
| 视口 | `1280×820 @ DPR 1` |
| 图幅 | `1440×960` |
| 暖态 seed / 模板 | `canvas-perf-266` / `continents` |
| 冷启动默认 seed | `stage-2-1` |

只执行一次生产构建，随后所有采样只读同一 `dist/webgl-generator`；没有让生产构建与浏览器回归并行读取 / 写入同一构建目录。`CI=true pnpm.cmd run build:app` 成功，Vite `8.1.0` 转换 `1295` 个模块，耗时约 `2.38s`；只有既有 chunk size 提示。

正式样本包括：冷启动 `3` 个新 Chrome 进程、暖态端到端 `10k / 50k / 100k × 3`、完整图层交互 `3 × 3`、100k 七变体消融 `3` 轮、100k 两个 heavy 变体 `3` 轮、100k 状态切换 `3` 轮、100k `full / noDomOverlays` 隔离复测 `2` 轮，以及 `fit-to-view` Trace `1` 份。除冷启动外，每个正式动作前执行同序列不计分预热；消融和 heavy 三轮轮换变体顺序。

计时解释遵守以下边界：

- `draw / mesh / refresh / bufferUpload` 是浏览器主线程 CPU 墙钟或 WebGL 调用 CPU 提交时间，不代表 GPU 硬件完成。
- `loadMap stages` 可能包含主动 yield、GC 和调度等待；stage sum 不能命名为纯 CPU。
- frame interval 包含浏览器调度、style、layout、paint 和可能的 GC，不等于 renderer 函数耗时。
- 插桩开销保留在样本中，没有事后扣除。
- 所有中位数基于三轮时，同时保留范围和波动说明；追加的两轮 isolation 只做敏感性分析，不混入主三轮。

全文出现的 `passed=true` 只表示对应脚本实际启用的错误、状态恢复与证据完整性门禁通过，不表示任何性能目标达标。9 份 E2E 关闭了 `2500ms / 1200ms` 旧观察线的强制失败，17 份最终 overlay 也关闭了既有 frame / overlay 绝对阈值；startup 和 state 本身没有性能阈值。所有超限仍保留为调查观察。

## 4. 初次启动与暖态端到端

### 4.1 冷启动

默认 10k 世界三轮冷启动均清空并禁用浏览器缓存，实际为 `10004 grid / 5968 pack` cells。

| 指标 | 三轮中位数 | 范围 |
|---|---:|---:|
| navigation → renderer stable | `6396.3ms` | `6079.9～6612.5ms` |
| DOMContentLoaded | `1099.1ms` | `1069.7～1243.7ms` |
| load event | `1128.5ms` | `1097.0～1273.4ms` |
| `loadMap()` | `3406.6ms` | `3222.6～3443.7ms` |
| long task 数 | `12` | `11～12` |
| long task 总时长 | `4387ms` | `4106～4529ms` |
| 最大单个 long task | `1128ms` | `1091～1130ms` |

冷启动报告没有单独序列化 generation total，不能用 navigation 减 `loadMap()` 粗算并命名为“生成耗时”。三轮 seed、cells、revision、顶点和 overlay 数量一致，但 checksum 分别不同，因此只能说结构规模一致，不能声称是逐字节同一世界。

### 4.2 暖态重新生成

表内均为 `三轮中位数（min～max）`。

| cells | 实际 grid / pack | 点击到 ready | generation | `loadMap()` | stage sum | `loadMap` 未覆盖差 | 调度残差 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10k | `10004 / 6124` | `7412.7 (5597.3～7549.8)ms` | `1468.0 (1108.7～1666.2)ms` | `5294.2 (4001.0～5314.9)ms` | `4903.3 (3649.8～4951.6)ms` | `351.2 (342.6～411.6)ms` | `589.4 (487.6～629.8)ms` |
| 50k | `50142 / 23940` | `9098.6 (8684.6～9694.2)ms` | `2739.6 (2452.4～2998.1)ms` | `5226.1 (5179.7～5579.6)ms` | `4869.1 (4868.7～5176.8)ms` | `357.4 (310.6～402.8)ms` | `1116.5 (1052.5～1132.9)ms` |
| 100k | `99846 / 54634` | `18804.7 (17643.0～20747.6)ms` | `4613.9 (4516.7～6043.4)ms` | `12085.7 (11138.0～12358.2)ms` | `11589.4 (10660.9～11817.4)ms` | `496.3 (477.1～540.8)ms` | `2105.1 (1988.3～2346.0)ms` |

按每轮比例取中位数，generation / `loadMap()` / 其余调度残差约为：10k `19.8% / 71.5% / 8.5%`，50k `30.1% / 57.6% / 12.1%`，100k `25.6% / 63.1% / 11.3%`。stage sum 覆盖 `loadMap()` 的约 `92%～96%`，但 stage 内也可能含调度等待，不能与调度残差一起再解释为纯 CPU。

### 4.3 `loadMap()` 阶段归因

表内均为 `三轮中位数（min～max）`。

| 阶段 | 10k | 50k | 100k |
|---|---:|---:|---:|
| 视觉 cell mesh | `502.8 (364.5～508.4)ms` | `1981.8 (1820.9～2040.8)ms` | `3534.0 (3106.4～3696.5)ms` |
| 水陆线缓存 | `1359.8 (956.8～1414.7)ms` | `1919.3 (1891.6～1936.5)ms` | `5961.4 (5856.3～6224.8)ms` |
| surface 顶点 | `2456.1 (1893.9～2520.1)ms` | `309.6 (274.7～312.0)ms` | `572.1 (529.6～658.9)ms` |
| 线层顶点 | `173.5 (145.8～185.6)ms` | `294.5 (275.5～335.5)ms` | `584.9 (520.5～632.8)ms` |
| 构建标签 | `135.2 (125.1～165.5)ms` | `208.5 (148.9～218.6)ms` | `228.1 (218.9～290.1)ms` |
| 道路屏幕 mesh | `54.9 (30.4～81.6)ms` | `85.2 (79.0～100.3)ms` | `132.8 (104.3～162.4)ms` |
| 河流屏幕 mesh | `20.5 (16.5～22.7)ms` | `24.2 (20.6～28.7)ms` | `57.8 (46.6～64.6)ms` |
| 刷新标签和图标 | `94.3 (85.8～114.2)ms` | `142.6 (118.6～185.4)ms` | `188.1 (186.5～221.7)ms` |
| 静态 GPU buffer CPU 提交 | `2.0 (1.8～2.4)ms` | `17.7 (13.6～18.5)ms` | `33.9 (28.1～38.7)ms` |

100k 视觉 cell mesh与水陆线缓存先在每轮相加，再取中位，得到 `9657.9 (8962.7～9758.8)ms`，约占同轮 `loadMap()` 的 `79.9%`，是明确的装载热点。这个 paired 口径不等于表中两个边际中位数直接相加。静态 buffer CPU 提交只有 `33.9ms`，不能解释 12 秒装载；但这不等于 GPU 硬件执行也只有 33.9ms。

10k surface 顶点阶段反常地比 50k / 100k 慢，且三轮均复现。由于相同 seed 的 checksum 仍不同，且当前没有对应装载 trace，本报告把它列为非单调异常，不据此拟合 cells 增长或直接提出定点优化。

## 5. 连续缩放、平移与 idle commit

### 5.1 完整图层三轮统计

表内均为 `三轮中位数（min～max）`；draw 的亚毫秒相对波动不作性能排序依据。

| cells | 动作 | frame p50 | frame p95 | frame max | draw p95 | overlay 平均 / p95 | 标签平均 | long task 数 / 总时长 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 10k | zoom | `11.8 (11.7～11.8)ms` | `94.1 (88.2～105.8)ms` | `135.1 (117.6～135.4)ms` | `0.2 (0.2～0.2)ms` | `29.55 (28.72～29.64) / 62.6 (58.0～72.7)ms` | `27.23 (26.53～27.32)ms` | `13 (12～14) / 1197 (1007～1208)ms` |
| 10k | pan | `17.6 (11.8～23.5)ms` | `117.7 (94.2～123.7)ms` | `176.5 (147.1～188.3)ms` | `0.2 (0.2～0.2)ms` | `34.05 (29.07～36.42) / 48.8 (42.0～49.4)ms` | `32.00 (26.26～34.16)ms` | `47 (47～47) / 4199 (3727～4552)ms` |
| 50k | zoom | `11.8 (11.7～17.6)ms` | `129.3 (111.8～170.6)ms` | `147.0 (141.2～276.5)ms` | `0.2 (0.2～0.2)ms` | `37.13 (33.94～49.89) / 77.7 (62.9～145.0)ms` | `33.97 (31.20～45.98)ms` | `13 (13～16) / 1388 (1303～2115)ms` |
| 50k | pan | `23.4 (17.6～47.0)ms` | `135.1 (117.7～217.6)ms` | `188.3 (123.5～247.0)ms` | `0.2 (0.2～0.2)ms` | `42.31 (38.53～67.88) / 57.2 (46.2～83.9)ms` | `39.06 (35.75～63.03)ms` | `47 (47～48) / 5348 (4890～9001)ms` |
| 100k | zoom | `17.7 (11.8～23.6)ms` | `176.6 (153.0～229.3)ms` | `276.5 (188.3～323.5)ms` | `0.2 (0.2～0.2)ms` | `59.19 (50.72～77.58) / 161.6 (115.1～173.0)ms` | `55.23 (46.89～72.06)ms` | `18 (17～18) / 2352 (2021～2889)ms` |
| 100k | pan | `158.7 (35.3～258.8)ms` | `305.8 (176.5～335.3)ms` | `341.1 (205.9～541.2)ms` | `0.2 (0.2～0.3)ms` | `89.11 (65.55～106.31) / 122.7 (84.1～127.1)ms` | `83.96 (61.64～100.24)ms` | `47 (47～47) / 10624 (7395～13270)ms` |

三档的 draw p95 都只有 `0.2ms`，而标签平均占 overlay 平均耗时约 `90%～94%`。完整图层所有正式动作都超过既有 frame p95 `80ms` 和 overlay p95 `35ms` 观察线；本次关闭阈值守门只是为了收集完整调查证据，`passed=true` 只表示状态、错误与证据完整性通过，不表示性能达标。

每个 zoom 固定 `18` 个 wheel 输入并得到 `18 draw / 18 overlay`；最终版 pan 序列有 `47` 个影响视口的 pointermove并得到 `47 draw / 47 overlay`。全部正式动作的 `overlay.suspendedSamples=0`。源码也显示 `suspendOverlayForInteraction()` 只有定义没有生产调用，`drawViewportPreview()` 反而先恢复 overlay。因此可以高置信度认定：当前没有实际生效的交互态 overlay 暂停或 rAF 合并，每个输入事件都会完整更新标签和图标。

### 5.2 Idle commit

表内均为 `三轮中位数（min～max）`。交互期与 idle 的 long-task 观察窗口有重叠，本报告不把二者相加。

| cells | 动作 | 最后输入 → clean | commit pending | commit running | idle frame p50 / p95 |
|---|---|---:|---:|---:|---:|
| 10k | zoom | `364.1 (264.5～368.9)ms` | `127.7 (122.0～134.5)ms` | `88.0 (58.8～138.4)ms` | `17.7 (17.6～29.3) / 105.9 (94.1～176.4)ms` |
| 10k | pan | `284.2 (233.0～313.6)ms` | `120.7 (120.4～125.9)ms` | `70.5 (57.2～83.8)ms` | `6.0 (5.9～11.7) / 58.8 (41.1～100.1)ms` |
| 50k | zoom | `536.7 (494.8～592.2)ms` | `125.9 (122.9～143.8)ms` | `321.6 (203.2～345.7)ms` | `17.7 (17.6～23.7) / 147.0 (111.8～176.5)ms` |
| 50k | pan | `348.8 (338.3～516.3)ms` | `122.5 (121.8～188.0)ms` | `144.1 (133.7～195.4)ms` | `11.9 (11.8～17.6) / 105.9 (88.1～182.5)ms` |
| 100k | zoom | `533.9 (496.0～885.2)ms` | `140.0 (137.5～175.2)ms` | `264.5 (204.7～441.2)ms` | `17.6 (17.6～23.5) / 194.1 (164.6～323.5)ms` |
| 100k | pan | `745.9 (483.3～754.5)ms` | `132.5 (130.7～137.6)ms` | `425.7 (223.7～426.5)ms` | `12.0 (11.8～17.7) / 282.3 (176.5～300.0)ms` |

新的 idle recorder 在最后一个影响 viewport 的输入 capture 时建立 baseline；pan 的 mouseup包含在窗口内。`pending` 与 `running` 来自 viewport commit 事件自身，不与嵌套 route / river / selection / overlay 时间相加。本节 full 样本最终都达到 commit 无 pending / running、overlay 恢复、三类 dirty 清零。`noRoutesRivers` 消融因为路线和河流层已禁用，会保留预期的惰性 `routesDirty / riversDirty=true`，但 idle completed 与 canonical restoration 均通过，不属于失败。

## 6. 100k 消融与重场景

### 6.1 `full / noDomOverlays` 总控

七变体三轮的共享会话统计如下，表内均为 `三轮中位数（min～max）`：

| 场景 | 动作 | frame p50 / p95 | overlay 平均 / p95 | 标签平均 | long task 数 |
|---|---|---:|---:|---:|---:|
| full | zoom | `17.5 (11.8～17.6) / 153.0 (147.0～158.9)ms` | `48.49 (47.95～51.34) / 101.4 (96.4～115.6)ms` | `45.12 (44.74～47.84)ms` | `16 (15～18)` |
| no DOM overlays | zoom | `5.9 (5.9～5.9) / 6.0 (6.0～11.8)ms` | `1.99 (1.93～4.09) / 3.4 (2.3～5.5)ms` | `1.09 (1.04～2.29)ms` | `0 (0～0)` |
| full | pan | `123.7 (117.6～135.3) / 188.3 (170.6～194.1)ms` | `67.82 (62.80～69.09) / 79.6 (72.5～84.3)ms` | `63.99 (59.14～65.11)ms` | `47 (47～47)` |
| no DOM overlays | pan | `5.9 (5.9～5.9) / 41.2 (41.2～59.0)ms` | `2.01 (1.83～3.03) / 2.5 (2.2～4.9)ms` | `1.09 (0.99～1.70)ms` | `3 (2～34)` |

隔离复测：

| 轮次 | full zoom / pan p95 | no DOM zoom / pan p95 | full long task | no DOM long task |
|---|---:|---:|---:|---:|
| isolation r1 | `129.5 / 153.0ms` | `6.0 / 41.3ms` | `13 / 47` | `0 / 4` |
| isolation r2 | `135.3 / 158.8ms` | `6.0 / 35.2ms` | `13 / 47` | `0 / 0` |

总控方向跨顺序和隔离复测一致，证明 DOM overlay 是连续交互的主瓶颈。平移关闭 DOM 后仍有 `35～41ms` p95，但其余量尚未完全归因：两轮仍各有 `47 draw / overlay / viewportPreview`，route / river / selection / upload 都为 0；viewportPreview 平均 `5.0 / 4.5ms`、p95 `7.0 / 5.5ms`，pointermove dispatch p95 都是 `0.1ms`，event → next frame p95 为 `53.7 / 35.3ms`，脚本每次 move 另有固定 `24ms` 输入节拍。当前只能确认约 `5ms` 的应用侧 preview 工作，其余属于浏览器 / 驱动 / 固定节拍与未插桩工作的混合墙钟，需要页面内输入或专门 trace 才能继续拆分；不能提前归给 hover、runtime 或 compositor。

### 6.2 单层方向性证据

`noLabels` 是最强单层信号：三轮 zoom / pan frame p95 为 `47.1 (41.2～64.8) / 82.4 (70.7～94.2)ms`，overlay p95 为 `7.5 (6.0～7.9) / 6.4 (5.4～7.5)ms`。完整态中标签平均占 overlay 平均约 `94%`。但关闭标签会释放碰撞空间，使可见城市数明显上升，因此 `full - noLabels` 不是保持其它对象不变的纯标签差值。

七变体的 frame p95 原始值如下，均按 `r1 / r2 / r3`：

| 变体 | zoom | pan |
|---|---:|---:|
| full | `153.0 / 147.0 / 158.9` | `188.3 / 170.6 / 194.1` |
| no DOM overlays | `11.8 / 6.0 / 6.0` | `59.0 / 41.2 / 41.2` |
| no labels | `41.2 / 47.1 / 64.8` | `82.4 / 70.7 / 94.2` |
| no cities | `135.3 / 135.4 / 141.1` | `247.0 / 152.9 / 205.9` |
| no Marker / resources | `200.0 / 141.1 / 199.9` | `182.3 / 164.6 / 223.6` |
| no military | `153.0 / 135.2 / 164.9` | `164.7 / 170.6 / 205.8` |
| no routes / rivers | `135.4 / 141.1 / 164.8` | `176.4 / 158.9 / 176.5` |

关闭城市、Marker / 资源、军事或路线 / 河流都没有得到与 `noLabels` 同等级的改善。完整相机下 Marker 和军事可见数经常为 0，相关消融更多衡量隐藏对象遍历，不能代表其高密度近景成本。`noRoutesRivers` 对 zoom 的连续 frame p95 只是小幅且单轮跨零；对 pan 三轮方向稳定，但仅改善 `6.3%～9.1%`，远弱于 no DOM / no labels。道路 / 河流的主要成本因此在 idle commit / fit 等动态 mesh 阶段，不在每次 preview draw。

同轮 paired 结果也支持这一区分：`noRoutesRivers` 对 zoom / pan 的连续 frame p95 中位只改善约 `4% / 7%`，但 commit running 分别改善约 `83% / 80%`，三轮方向稳定。道路 / 河流因此应优化 idle commit，而不是被误列为连续 preview 的首要瓶颈。

### 6.3 Measurement 与 selection heavy

Measurement fixture 三轮都实际物化 `180` 个 measurement path，其中 `60` 个多边形另有 area，唯一测量对象仍为 `180`，overlay 可见。Selection fixture 三轮都确定性选择国家 `#16`，覆盖 `5425` 个陆地 cells，生成 `97647` 个 selection 顶点，fixture build 约 `48～55ms`，highlight mode 为 `state translucent cells`。

| 场景 | 动作 | frame p50 / p95 | overlay 平均 / p95 | long task 数 |
|---|---|---:|---:|---:|
| 180 measurements | zoom | `11.9 (11.8～29.4) / 141.2 (135.2～223.5)ms` | `43.77 (41.11～69.97) / 98.8 (92.0～115.1)ms` | `17 (14～17)` |
| 180 measurements | pan | `111.8 (64.8～158.9) / 217.6 (182.3～270.6)ms` | `63.37 (55.13～81.33) / 83.4 (79.1～104.8)ms` | `47 (47～47)` |
| largest-state selection | zoom | `17.6 (17.5～17.8) / 129.4 (123.6～147.1)ms` | `44.57 (40.68～49.86) / 84.6 (81.8～95.0)ms` | `17 (15～17)` |
| largest-state selection | pan | `29.5 (23.6～99.8) / 158.9 (141.3～164.6)ms` | `55.33 (54.16～56.61) / 69.9 (65.1～74.4)ms` | `47 (47～47)` |

Measurement heavy 在三轮中的大多数 zoom / pan 样本慢于 selection heavy，但变异较大，且 measurement SVG 更新不在 renderer `overlay` 分项内，不能把差值全部解释为测量 SVG。静态调用链显示每次 `onViewChange` 会重建测量 overlay，这与方向一致，仍需在实际优化时为 measurement overlay 增加独立计时。

Selection heavy 的连续 preview 主要复用既有 selection mesh；明显成本出现在 fixture / 状态切换和 locate 闪烁，而不是每次 preview 都重建。所有 heavy 交互结束后 fixture 状态保持，variant 结束后恢复空 selection、零 measurements 和 canonical layers / camera。

## 7. 状态切换与重复工作

100k 状态切换三轮共 `54` 个正式动作，全部 checksum / revision 不变，camera、layers、colorMode、selection、rendererSelection 和 hover 都恢复。以下均为 `三轮中位数（min～max）`；主要事件也是各自三轮的边际统计，不能与动作总时长直接相加：

| 动作 | 动作到稳定 | 主要事件 |
|---|---:|---|
| `height → states` | `280.0 (267.0～360.8)ms` | surface refresh `194.7 (178.4～238.6)ms`；其内 buffer CPU submit `58.8 (45.8～59.6)ms`；overlay `36.5 (35.5～57.2)ms` |
| `states → height` | `243.4 (224.7～289.1)ms` | surface refresh `158.7 (149.9～183.5)ms`；其内 buffer CPU submit `29.8 (29.5～32.1)ms`；overlay `38.1 (35.1～50.1)ms` |
| labels 组合关闭 | `316.1 (307.5～485.2)ms` | 每轮固定 `4 draw / 5 overlay`；overlay 合计 `109.8 (101.2～170.7)ms` |
| labels 组合开启 | `390.2 (369.7～474.2)ms` | 每轮固定 `4 draw / 5 overlay`；overlay 合计 `166.9 (161.1～209.2)ms` |
| fit-to-view | `658.2 (635.9～791.0)ms` | route `190.2 (153.8～261.5)ms`；river `89.0 (73.9～90.9)ms`；2 overlay 合计 `155.9 (152.2～178.2)ms` |
| select 最大国家 | `228.5 (228.4～239.4)ms` | selection mesh `73.5 (72.7～87.5)ms`，被 draw 包含；overlay `50.2 (48.2～53.3)ms` |
| locate 最大国家 | `2743.5 (2716.5～2781.4)ms` | 产品 flash 约 `2.6s`；动作开始 → 连续三个 clean frame `362.1 (340.3～386.4)ms`，此时 flash 仍 active |

单独城市、Marker / 资源和军事开关的 point refresh 多数只有约 `1～2ms`，当前 aggregate point buffer 虽然静态上会整组重建，但不是本轮最优先热点。标签组合开关的 `4 draw / 5 overlay` 是确定的重复工作；地区五成员组合在全部成员都改变时，源码还会产生更多 line refresh / draw / overlay，适合先做低风险批事务。

事件边界必须按父子关系解释：`bufferUpload` 包含在 `surfaceRefresh` 内，`selectionMesh` 包含在对应 `draw` 内；route / river 的 async 事件包含主动 yield；viewport preview / commit 又包围 draw、mesh 和 overlay。`locate` 的 `362.1ms` 检查点从动作 dispatch 起算，只证明相关 dirty 已清并观察到三个 clean frame，不是“clean 后再静默 362.1ms”，也不是最终稳定时长之外的附加成本。

## 8. Trace 归因

Trace 对象按三轮状态结果选择 `fit-to-view`，而不是固定约 2.6 秒的 locate 动画。User Timing `canvas-perf-trace-start / end` 与动作计时吻合，窗口为 `728.999ms`；窗口包含动作 dispatch、preview、`120ms` debounce、异步 route / river、overlay 与最终稳定确认，不是单个函数耗时。

同线程 `ph=X` complete event 经过嵌套树去重，以 exclusive / self time 聚合：

| 主线程桶 | exclusive wall span | 占窗口 |
|---|---:|---:|
| scripting | `238.025ms` | `32.7%` |
| 未细分 RunTask residual | `127.194ms` | `17.4%` |
| style recalculation | `121.690ms` | `16.7%` |
| layout | `38.880ms` | `5.3%` |
| hit test | `18.816ms` | `2.6%` |
| paint / composite preparation | `78.589ms` | `10.8%` |
| GC | `17.885ms` | `2.5%` |

这些 exclusive 桶的 wall span 合计 `641.079ms`，窗口空隙 `87.920ms`；User Timing mark 的 thread timestamp 差为 `612.386ms`。二者计量含义不同，不能互相替代。最大 self-time 名称为 `RunMicrotasks 74.633ms`，其次是一个 `RunTask residual 68.375ms` 和 `RunMicrotasks 50.351ms`。Trace 没有 JS stack sample，不能把 `RunMicrotasks` 继续精确归到某个业务函数。

Renderer 插桩与 trace 相互印证：本轮 route mesh `270.4ms`、river `70.4ms`、两次 overlay 合计 `168.2ms`，bufferData CPU submit 仅 `0.7ms`，draw CPU 合计 `0.2ms`。Preview / commit 是包围事件，不与这些叶子项相加。

Trace 中存在 GPU Process / CrGpuMain 和 `disabled-by-default-gpu.service` 轨道，但只有 GPU service 线程命令处理，没有 GPU hardware timestamp、timer query、`gpu_cmd_queue` 或 `viz.gpu_composite_time`。`gpuTrackAvailable=true` 只表示轨道存在，不能量化显卡执行时间；GPU 硬件成本仍是盲区。

## 9. 源码调用链证据

### 9.1 Viewport 热路径

- Pan 每次 pointermove 更新 camera 后立即调用 `onChange()`；wheel 每个事件也立即调用：`app/webgl-generator/src/renderer/placeholder-renderer.js:3415-3469`。
- Constructor 把 `onChange` 直接接到 `drawViewportPreview()`；preview 会恢复 overlay、标脏动态 buffer、draw、完整 overlay、`onViewChange`，再安排 commit：同文件 `319`、`1722-1733`。
- `suspendOverlayForInteraction()` 只有定义，生产代码无调用；preview 反而主动 resume：同文件 `1728`、`1740`。
- Overlay 遍历全部标签、城市、Marker、军事和 selection：同文件 `2094`、`2175-2190`、`2309`、`2354`、`2400`。
- `onViewChange` 还会同步运行统计面板、再次读取 stats、条件重建 measurement SVG：`runtime/app.js:2473-2478`、`ui/panel.js:657-672`、`runtime/app.js:12127-12138`。
- Idle commit 固定 debounce `120ms`，随后重建 route / river / selection，再 draw、overlay 和 `onViewChange`：renderer `1754-1834`。

### 9.2 Locate

- Runtime locate 先调用 renderer locate，成功后又写 SelectionStore：`runtime/app.js:634-639`。
- Renderer locate 已设置 selection、启动 flash 并执行 preview draw；SelectionStore 即使相同 selection 也 emit，回调再次 `renderer.setSelection()` 并默认 draw：renderer `1846-1874`、`1633-1645`，`runtime/selection-store.js:12-20`，`runtime/app.js:2487-2491`。
- Flash 持续 `2600ms`，逐帧 draw；政治 selection mesh 每次扫描 grid cells，颜色实际只按约 `180ms` 相位变化：renderer `1904-1932`、`1607-1619`，`renderer/selection-layer.js:211-239`。

### 9.3 Surface 与 aggregate buffer

- Color mode 改变会 `refreshCellSurface({draw:false})` 后再 draw，不是只切 palette：renderer `602-674`。
- 平滑 surface 两遍遍历 visual cells并分配新数组：`renderer/cell-visual-layer.js:157-179`。
- 任一 point layer 开关会重建聚合 point buffer；任一 line layer 开关会重建聚合 line / ocean-current buffer：renderer `795-839`、`916-937`、`3615-3629`、`4306-4331`。
- `zoneLabels` 当前会显式 `updateLabels()`，随后 draw 又更新 overlay；组合图层由 UI 逐成员调用而非批事务：renderer `936-937`，`ui/panel.js:189-197`，`ui/vue/components/ControlPanel.vue:904-909`。

## 10. 已证实、已排除与尚未证明

### 10.1 已证实

- 连续 viewport 交互的主要已测 CPU 热点是 DOM overlay，标签占 overlay 约九成以上。
- 当前每个 wheel / pointermove 都执行完整 overlay；交互暂停机制没有生产调用。
- Browser style / layout / paint preparation 是 renderer 函数计时以外的显著成本。
- 100k 装载由 shore cache 与 visual cell mesh 主导。
- Color mode 会整图重建 surface 和全量上传。
- 标签组合、地区组合和 locate 存在可直接由事件数与源码确认的重复工作。
- 过期 viewport work 取消机制实际生效；连续输入中的 canceled commit / route 属于 supersede，不是失败。

### 10.2 已排除或降级

- “WebGL draw CPU 提交是连续交互主瓶颈”被排除：正式样本 p95 约 `0.2ms`。
- “关闭道路 / 河流即可解决连续交互”被降级：`noRoutesRivers` 没有稳定接近 `noDomOverlays` 的收益。
- “point aggregate buffer 应先优化”被降级：本轮实际 point refresh 约 `1～2ms`。
- 历史政治 mesh 热点不能直接复用为当前结论；当前主要 load / interaction 路径已经变化。

### 10.3 盲区与波动

- 没有 GPU timer query，GPU 硬件执行未知。
- Headless 系统 Chrome 与可见窗口、集成显卡、低端设备、触控板和移动端调度可能不同。
- 相同 seed / cells 的跨进程 checksum 不同，范围同时含地图内容差异与浏览器 / 系统抖动；每轮内部身份和 checksum 保持通过。
- Measurement overlay 尚无独立事件通道；heavy 差值不能全部归给 measurement SVG。
- Trace 无 JS stack sample，不能继续拆 `RunMicrotasks`；也没有完整 heap / allocation profile。
- Marker / 军事在全图相机下可见数低，单层消融不能代表密集近景。

按方案冻结的审计口径，以 `(max - min) / min > 20%` 检查正文使用的三轮绝对毫秒指标。冷启动关键耗时没有越线；Trace 只有一份，不参加跨轮波动审计。其余越线项完整列在下表，具体原始三轮值见附录 A：

| 场景 | 超过 20% 的指标 |
|---|---|
| 暖态 E2E | 10k：点击到 ready、generation、`loadMap`、stage sum、`loadMap` 未覆盖差、调度残差；50k：generation、未覆盖差；100k：generation |
| `loadMap` 子阶段 | 10k：视觉 mesh、shore cache、surface、line、labels、route、river、刷新标签图标、buffer submit；50k：line、labels、route、river、刷新标签图标、buffer submit；100k：surface、line、labels、route、river、buffer submit |
| 完整图层 zoom | 10k：overlay p95；50k：frame p50/p95/max、overlay avg/p95、labels avg、long-task 总时长；100k：frame p50/p95/max、overlay avg/p95、labels avg、long-task 总时长 |
| 完整图层 pan | 10k：frame p50/p95/max、overlay avg、labels avg、long-task 总时长；50k 与 100k：frame p50/p95/max、overlay avg/p95、labels avg、long-task 总时长 |
| Idle commit | 10k zoom：最后输入到 clean、commit running、idle frame p50/p95；10k pan：最后输入到 clean、running、idle p50/p95；50k zoom：running、idle p50/p95；50k pan：最后输入到 clean、pending、running、idle p50/p95；100k zoom：最后输入到 clean、pending、running、idle p50/p95；100k pan：最后输入到 clean、running、idle p50/p95 |
| 总控消融 | `full` 的关键 zoom / pan p95 在该三轮内相对稳定；`noDomOverlays` 的低绝对值 frame / overlay 比例波动较大，pan long-task 数为 `2～34`。因此收益判断使用同轮 paired 比率并由两轮 isolation 复核，不把低毫秒百分比当 SLA |
| 单层消融 | `noLabels` 保持最强单层方向；`noCities`、`noMarkersResources`、`noMilitary` 多项跨轮高波动或相对 full 差值跨零，不作收益排序；`noRoutesRivers` 的连续 zoom 单轮跨零、pan 改善仅 `6.3%～9.1%`，但同轮 commit running 改善方向稳定 |
| Heavy | measurement zoom 的 frame p50/p95、overlay avg/p95，measurement pan 的 frame p50/p95、overlay avg/p95；selection zoom 的 overlay avg，以及 selection pan 的 frame p50 |
| 状态动作 | `color-states`、`color-height`、routes off/on、rivers on、labels off/on、cities off、markers off/on、fit-to-view；select、hover、locate 本身未越线 |

最明显的是 100k 独立 full：zoom / pan frame p95 分别为 `153.0～229.3ms / 176.5～335.3ms`。因此三轮中位只能作为调查基线，不能作为稳定 SLA。高置信度结论依赖同轮总控比例、确定的重复事件数、跨顺序方向和 isolation；绝对毫秒门禁需要更严格的固定快照与更多独立进程样本，见 P2 长期门禁。

## 11. 优化建议

### P0：先治理连续交互与确定性重复工作

| 建议 | 目标指标 | 主要路径 | 复杂度 / 风险 | 验收重点 |
|---|---|---|---|---|
| 建立 viewport rAF 调度器，合并同一帧 wheel / pan，只保留最新 camera | draw / overlay 次数从“每输入一次”收敛到“每帧至多一次” | input handler → `drawViewportPreview` | 中；必须保持滚轮累计、拖拽手感和 hover 正确 | 固定输入序列的最终 camera 完全一致；frame p95、事件数、picking 回归 |
| 真正启用 interaction overlay 快路径 | 以 no-DOM 仅作“可见 overlay 工作全部短路”的诊断收益上界；产品目标须由保留视觉连续的原型另行建立 | `suspendOverlayForInteraction`、overlay root transform、`onViewChange` | 中高；标签消失 / 跳动、SVG 测量、selection 与图标同步风险 | 交互中用整体 transform 或缓存位置保持视觉连续；commit 后碰撞与最终像素一致，不承诺复现 no-DOM 数字 |
| 分离 runtime panel / measurement overlay 的 preview 与 commit | 避免每 pointermove 重建统计 DOM 和 measurement SVG | runtime `onViewChange`、panel sync、measurement overlay | 中；面板短暂延迟和测量编辑反馈 | 重场景单独事件计时；measurement 拖拽、编辑手柄和最终几何不变 |
| 收敛 label / zone 组合图层为批事务 | labels 组合从 `4 draw / 5 overlay` 收敛为 `≤1 / ≤1` | layer visibility action、`zoneLabels`、ControlPanel group | 低中；图层终态和回调顺序 | 各成员开关、组合开关、历史 / API 状态一致；一次 runtime 同步 |
| 收敛 locate transaction 与 flash | 去掉重复 SelectionStore draw；flash 不再逐帧重建相同 mesh / overlay | runtime locate、SelectionStore、selection layer | 中；selection 面板、路线对象、动画节奏 | dirty-clean 与最终动画时点分报；按 180ms 相位或 uniform 变色；视觉时长可保持 2.6s |

不建议把“交互时直接隐藏所有标签”作为最终方案。消融证明它有效，但正式实现必须保持用户可接受的视觉连续性；优先评估 overlay root 的相机 transform、位置缓存、rAF 批写和 commit 后一次碰撞重算。

### P1：治理装载和低频大事务

| 建议 | 目标指标 | 复杂度 / 风险 | 验收重点 |
|---|---|---|---|
| 重新审计 shore cache 与 visual cell mesh 的遍历、分配和可复用拓扑 | 100k `loadMap()` 首先降低当前约 `9.66s` 主热点 | 高；海岸拓扑、保护对象、内存峰值 | 同一 map identity 的 geometry / checksum / layer order；10k/50k/100k stage 与峰值内存 |
| Surface 几何与 color mode 解耦，比较独立 color buffer、palette / uniform 或按 mode 缓存 | 100k color switch 不再重建 440.8 万顶点；把 `~200ms` surface refresh 降为颜色更新 | 高；平滑插值、shore 颜色、GPU 内存 | height / states 等全部 mode 像素、旧图、导出；buffer bytes、GC、显存占用 |
| Route / river commit 继续只在 idle 构建，并研究 worker / chunk / shader extrusion | 降低 fit / idle commit 的 `route 190ms + river 89ms` 与长任务 | 中高；线宽、相机、取消和拾取 | viewport cancellation、最终顶点、路线 / 河流宽度、fit / locate / 导出 |
| 为 measurement overlay 增加独立计时并缓存静态 path | 先量化再优化 180 对象 heavy 的残余 | 中；测量编辑态与手柄 | 编辑中实时性、最终 SVG、选中 / hover、导出 |

10k surface 顶点非单调异常应先采装载 trace / allocation profile，不建议仅凭当前阶段名直接改代码。

### P2：长期架构与门禁

| 建议 | 目的 | 风险 / 说明 |
|---|---|---|
| 评估标签空间索引、增量碰撞、DOM 虚拟化，必要时再评估 WebGL / Canvas 文本 | 降低标签 O(N) 更新和 browser style/layout | 高风险；字体、描边、编辑、可访问性、PNG / DOM 同源都要重验 |
| 按实测决定是否拆 line / point aggregate buffer | 减少单层开关全量 build / upload | 会增加 draw call；当前 point refresh 很小，不应抢占 P0 / P1 |
| 接入 `EXT_disjoint_timer_query_webgl2` 或可验证 GPU timestamp | 补 GPU 硬件执行盲区 | 必须处理 disjoint、浏览器支持和异步读回，不能阻塞交互 |
| 建立重复样本性能门禁 | 防止 P0 修复回退 | 绝对毫秒波动大；事件计数和同轮 paired 比率可先用三轮，绝对毫秒必须使用固定快照和更多独立进程 |

建议的长期门禁至少包括：

- 为绝对毫秒门禁保存并加载同一份序列化 100k 地图快照，逐轮断言 identity / checksum 完全相同；不能再只依赖会跨进程生成不同 checksum 的固定 seed。
- 绝对毫秒门禁至少使用 `5` 个独立 Chrome process / context，随机或平衡交错 baseline / candidate 顺序，并报告中位数、范围和 MAD / IQR；另在可见系统 Chrome 或目标浏览器做独立复核。当前三轮只足以建立调查基线。
- 事件数上限和同轮 `full / variant` paired 比率可先采用三轮，但失败仍须在隔离进程重跑，不能与绝对 SLA 混为一类。
- 固定动作报告 frame p50 / p95 / max、long task 总时长、overlay / labels 与 idle commit；环境、后台构建和浏览器版本必须冻结。
- 每个 rAF 至多一次 viewport preview；交互阶段 overlay 次数有明确预算。
- `full / noDomOverlays` 比率作为诊断哨兵，不作为删除 overlay 的产品目标。
- labels / zones 组合开关最多一次 line / point refresh、一次 draw、一次 overlay、一次 runtime 同步。
- locate 分开守 dirty-clean 与产品动画完成；动画期间 selection geometry rebuild 次数受限。
- `loadMap()` 固定报告 visual mesh、shore cache、surface、line、labels 和 GPU CPU submit；性能失败先隔离重跑，再判功能回归。
- 每次采样仍检查 checksum、revision、camera、layers、colorMode、selection、hover、renderer failed、WebGL、console / page error。

## 12. 证据完整性与原始产物

正式 32 份非 trace JSON（startup `3`、E2E `9`、最终 overlay `17`、state `3`）全部 `passed=true`，失败数组与真实 console / page error 均为 0。这里仍只表示各脚本实际启用的完整性、恢复和错误门禁通过：E2E 与 overlay 的旧绝对性能阈值已明确关闭，startup / state 也没有性能通过线，不能把 `passed` 解读为性能验收。

最终重采的 17 份 overlay 报告还对 setup、fixture、interaction、restoration、renderer failed 绝对值与 delta、历史截断、瞬时 draw `glError`、最终 WebGL error 和 health hard error实行硬门禁；共 40 个 variant、80 次 setup attempt、80 个正式交互和 40 次 restoration 全部通过。分类后共有 `36` 条允许的 `[FMG health] main-thread-long-task` 性能事件、`193` 条未强制执行的阈值观察，`render-frame-gap` 事件为 `0`，health error 为 `0`；这些性能观察不触发本次调查失败，其它 health error 会硬失败。较早完成且不受 overlay harness 修正影响的 E2E、startup 和 state 报告也保留 health 性能观察，但不能倒推为使用了后来新增的同一 health 分类字段。

主要原始产物：

- 冷启动：`docs/generated/reports/canvas-performance-startup-r1..r3.{json,md}`
- 暖态端到端：`canvas-performance-e2e-{10k,50k,100k}-r1..r3.{json,md}`
- 完整图层：`canvas-performance-overlay-{10k,50k,100k}-full-r1..r3.{json,md}`
- 消融：`canvas-performance-overlay-100k-ablation-r1..r3.{json,md}`
- Heavy：`canvas-performance-overlay-100k-heavy-r1..r3.{json,md}`
- 隔离复测：`canvas-performance-overlay-100k-isolation-r1..r2.{json,md}`
- 状态切换：`canvas-performance-state-100k-r1..r3.{json,md}`
- Trace：`canvas-performance-trace-fit-to-view.json`、`canvas-performance-trace-fit-to-view-summary.json`、`canvas-performance-trace-fit-to-view.md`

生成产物位于 `docs/generated/`，用于本地复现，不替代本长期总结。最终建议的收益数字是调查基线和方向，不是尚未实施的优化承诺；任何后续优化都应另行登记权威任务，并逐项复验视觉、交互、旧数据、导出和性能门禁。

## 附录 A：核心三轮原始值

本附录按 `r1 / r2 / r3` 顺序保留正文关键结论的原始毫秒值；更细事件、对象数、失败数组和环境快照以第 12 节 JSON 为准。

### A.0 冷启动

| 指标 | r1 / r2 / r3 |
|---|---:|
| navigation → stable | `6396.3 / 6612.5 / 6079.9` |
| DOMContentLoaded | `1099.1 / 1243.7 / 1069.7` |
| load event | `1128.5 / 1273.4 / 1097.0` |
| `loadMap()` | `3406.6 / 3443.7 / 3222.6` |

### A.1 暖态端到端

| cells | 点击到 ready（r1 / r2 / r3） | generation | `loadMap()` |
|---|---:|---:|---:|
| 10k | `7412.7 / 5597.3 / 7549.8` | `1468.0 / 1108.7 / 1666.2` | `5314.9 / 4001.0 / 5294.2` |
| 50k | `9098.6 / 8684.6 / 9694.2` | `2739.6 / 2452.4 / 2998.1` | `5226.1 / 5179.7 / 5579.6` |
| 100k | `20747.6 / 18804.7 / 17643.0` | `6043.4 / 4613.9 / 4516.7` | `12358.2 / 12085.7 / 11138.0` |

### A.2 完整图层交互

每格依次为 `frame p95 / overlay p95 / 最后输入到 clean`。

| cells | 轮次 | zoom | pan |
|---|---|---:|---:|
| 10k | r1 | `88.2 / 72.7 / 368.9` | `94.2 / 42.0 / 233.0` |
| 10k | r2 | `94.1 / 62.6 / 264.5` | `117.7 / 48.8 / 313.6` |
| 10k | r3 | `105.8 / 58.0 / 364.1` | `123.7 / 49.4 / 284.2` |
| 50k | r1 | `170.6 / 145.0 / 494.8` | `217.6 / 83.9 / 516.3` |
| 50k | r2 | `129.3 / 77.7 / 592.2` | `135.1 / 57.2 / 338.3` |
| 50k | r3 | `111.8 / 62.9 / 536.7` | `117.7 / 46.2 / 348.8` |
| 100k | r1 | `153.0 / 115.1 / 533.9` | `176.5 / 84.1 / 483.3` |
| 100k | r2 | `176.6 / 161.6 / 496.0` | `305.8 / 122.7 / 754.5` |
| 100k | r3 | `229.3 / 173.0 / 885.2` | `335.3 / 127.1 / 745.9` |

### A.3 100k 总控与 heavy frame p95

| 场景 | r1 zoom / pan | r2 zoom / pan | r3 zoom / pan |
|---|---:|---:|---:|
| ablation full | `153.0 / 188.3` | `147.0 / 170.6` | `158.9 / 194.1` |
| ablation no DOM | `11.8 / 59.0` | `6.0 / 41.2` | `6.0 / 41.2` |
| 180 measurements | `223.5 / 270.6` | `135.2 / 182.3` | `141.2 / 217.6` |
| largest-state selection | `129.4 / 164.6` | `147.1 / 141.3` | `123.6 / 158.9` |

### A.4 100k 状态动作总时长

| 动作 | r1 / r2 / r3 |
|---|---:|
| `height → states` | `360.8 / 267.0 / 280.0` |
| `states → height` | `289.1 / 243.4 / 224.7` |
| routes off | `120.6 / 77.2 / 81.3` |
| routes on | `135.0 / 103.1 / 100.3` |
| rivers off | `114.4 / 95.8 / 96.8` |
| rivers on | `123.1 / 81.8 / 91.3` |
| labels 组合关闭 | `485.2 / 307.5 / 316.1` |
| labels 组合开启 | `474.2 / 390.2 / 369.7` |
| cities off | `171.5 / 190.1 / 146.8` |
| cities on | `155.3 / 153.9 / 152.2` |
| Marker / resources off | `137.5 / 120.0 / 176.1` |
| Marker / resources on | `115.9 / 140.5 / 138.4` |
| military off | `86.9 / 96.7 / 94.7` |
| military on | `111.4 / 123.6 / 108.4` |
| fit-to-view | `658.2 / 791.0 / 635.9` |
| select 最大国家 | `228.4 / 239.4 / 228.5` |
| hover 最大国家 | `89.6 / 104.2 / 100.2` |
| locate 最大国家 | `2716.5 / 2781.4 / 2743.5` |
