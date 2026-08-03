# 正式画布性能优化实际报告

## 1. 结论

权威任务第 270～272 项已按封闭方案完成。优化解决了两个已经证实的主要问题：连续缩放 / 平移不再对每个输入完整重排 DOM / SVG overlay；100k 装载的 visual cell mesh 与 shore cache 热点明显下降。颜色专题、组合图层和 locate 的确定性重复事务也已收敛。

本批没有迁移标签渲染架构，没有改变地图数据、生成算法、默认图层、碰撞 / picking、海岸参数、存档、schema 或业务 API，也没有修改 `source/`。

## 2. 实施内容

### 2.1 连续视口与覆盖层

- wheel / pan 每次输入立即更新累计 camera 和 commit version，但 viewport preview 由 `requestAnimationFrame` 合并，每帧至多一次。
- preview 只用最新 camera 绘制 WebGL；标签、城市、Marker、军事和 measurement overlay 从“已提交 camera”到“当前 camera”应用同一根变换，不再逐输入重建 DOM / SVG，也不隐藏整层。
- idle commit 清除临时变换，重建路线 / 河流屏幕 mesh，并完整刷新一次最终 overlay；`onViewChange` 只有 commit 才刷新 runtime 面板与 measurement overlay。
- 组合图层通过 renderer / runtime 单一批事务更新；locate 只在约 `180ms` 闪烁相位变化时更新 selection geometry。

### 2.2 装载与颜色

- 已清理且严格凸的 visual cell 边界使用线性等价验证；非凸、退化、earcut 失败和回退路径继续使用原完整安全门禁。
- shore 构建只在本次调用内缓存完全相同的 side-safety 探针结果，不改变保护对象或拓扑判定。
- `height ↔ states` 复用 visual cell geometry 与已有 TypedArray，只更新颜色 / side，并重建确实随专题变化的岸线修正层。

## 3. 采样口径

- 环境、生产构建、Chrome channel、视口、seed 和三轮独立进程口径沿用第 269 项调查。
- 连续交互的主要对照使用合入 `origin/main` 后、实施前重采的三轮 100k 完整图层基线；装载对照使用第 269 项三轮 100k E2E 基线。
- 百分比只比较三轮中位数。绝对 frame / idle 指标仍受 GC、长任务和 Chrome 调度影响，不据三轮结果建立跨机器 SLA。

## 4. 实际结果

### 4.1 连续交互

| 100k 完整图层 | 优化前中位 | 优化后三轮 | 优化后中位 |
|---|---:|---:|---:|
| zoom frame p95 | `123.6ms` | `94.2 / 141.3 / 100.1ms` | `100.1ms` |
| pan frame p95 | `153.0ms` | `147.1 / 170.6 / 152.9ms` | `152.9ms` |
| zoom 交互 overlay | `18 次` | `0 / 0 / 0` | `0 次` |
| pan 交互 overlay | `47 次` | `0 / 0 / 0` | `0 次` |
| zoom overlay p95 | `79.2ms` | `0 / 0 / 0` | `0ms` |
| pan overlay p95 | `66.9ms` | `0 / 0 / 0` | `0ms` |
| zoom idle 总时长 | `416.5ms` | `391.8 / 469.5 / 451.5ms` | `451.5ms` |
| pan idle 总时长 | `380.4ms` | `564.5 / 498.8 / 460.0ms` | `498.8ms` |

结构性收益稳定：逐输入完整 overlay 从 zoom / pan `18 / 47` 清零，交互时所有采样都能观察到根变换。同步派发 `12` 个 wheel 的专门门禁得到 `1 preview / 1 draw / 0 overlay`，commit 与恢复通过。

zoom frame p95 中位下降约 `19.0%`；pan 的中位几乎不变，说明 Chrome pointermove / frame 调度仍占显著比例。最终一次 commit 集中路线、河流与 overlay 的真实重建，idle 总时长没有随 preview 同步下降，属于下一阶段可继续分析的低频尾延迟，而不是本批逐输入 overlay 修复失败。

10k 单轮交互 frame p95 为 zoom / pan `47.1 / 64.8ms`，但 idle commit 帧 p95 `141.1 / 112.0ms` 超过旧脚本 `80ms` 观察线；50k 结构门禁与报告通过。该绝对阈值没有被放宽或删除，结果作为主线程长任务波动保留。

### 4.2 100k 装载

| 指标 | 优化前三轮中位 | 优化后三轮 | 优化后中位 | 变化 |
|---|---:|---:|---:|---:|
| 点击到出图 | `18804.7ms` | `13633.1 / 14076.0 / 13622.8ms` | `13633.1ms` | `-27.5%` |
| generation | `4613.9ms` | `3725.4 / 3860.3 / 3775.5ms` | `3775.5ms` | 环境伴随变化，不归因于 renderer |
| `loadMap` | `12085.7ms` | `8656.2 / 8934.5 / 8587.1ms` | `8656.2ms` | `-28.4%` |
| visual cell mesh | `3534.0ms` | `2761.0 / 2840.9 / 2660.1ms` | `2761.0ms` | `-21.9%` |
| shore cache | `5961.4ms` | `4308.4 / 4415.6 / 4265.4ms` | `4308.4ms` | `-27.7%` |
| cell + shore paired | `9657.9ms` | `7069.4 / 7256.5 / 6925.5ms` | `7069.4ms` | `-26.8%` |

三轮最终地图 grid / pack 规模、渲染模式与 WebGL error 均正常；paired 指标下降且三个独立样本方向一致。

### 4.3 状态动作

- `states / height`：`139.2 / 138.0ms`，各 `1 surface refresh / 1 draw / 1 overlay`，并断言 `geometryReused=true`。
- labels 组合开 / 关：`1 draw / 1 overlay`；markers/resources：`1 point refresh / 1 draw / 1 overlay`；zones 五成员组合：`1 line refresh / 1 draw / 1 overlay`。
- locate：`2664.6ms`，`16 draw / 15 selection mesh / 1 overlay`；产品闪烁时长保持，最终 selection 与状态恢复通过。
- measurement-heavy：zoom / pan 均为交互期 `0 overlay`，measurement 可见采样分别 `42 / 137`，其中变换采样 `40 / 135`；首尾非变换样本对应状态进入 / 提交边界。

## 5. 验收

- 生产构建通过，仅保留既有 Vite 大 chunk 警告。
- `regress:viewport-line-preview` 与浏览器版本、`regress:label-layout`、`regress:selection-highlight`、`regress:png-options`、`regress:measurement` 通过。
- `regress:shoreline -- --pure` 与完整浏览器回归通过；正式 10k / 50k 错侧像素、最长针、冲突、重复和 seam 均为 `0`，无 unfilled cell。
- 系统 Chrome 串行完成 10k / 50k / 100k 完整图层、100k measurement-heavy、100k 状态动作、三轮 100k E2E；最终 checksum / revision、camera / layers / selection 恢复和 WebGL error 门禁通过。
- 可见浏览器检查确认连续缩放时标签、图标、线路和覆盖层持续显示，提交后位置正确，“适配视图”恢复正常。
- 测量回归中 `[FMG health] main-thread-long-task` 作为性能健康事件单独报告；普通 console error、page error 仍会失败。

## 6. 建议

1. 近期把事件数量门禁作为稳定主门禁：同步输入 coalescing、交互 overlay `0`、组合图层单事务、locate 相位上限和状态恢复比单轮毫秒更可靠。
2. 若继续优化，应优先拆解最终 commit 尾延迟，分别控制路线、河流、标签碰撞与浏览器 style / layout；保持版本取消和最终一致性，不回退到交互期逐输入重建。
3. visual cell / shore 仍是 100k `loadMap` 最大项。后续 worker、持久缓存或更深算法改动必须另立高风险任务，并继续以海岸像素、保护对象和旧图兼容为硬门禁。
4. 标签 WebGL / Canvas 化、字体 atlas 与 GPU timestamp 仍是长期架构候选；没有固定硬件、至少五个独立进程和平衡顺序前，不把当前绝对毫秒写成跨机器 SLA。
