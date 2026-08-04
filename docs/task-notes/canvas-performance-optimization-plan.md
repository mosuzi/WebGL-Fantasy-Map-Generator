# 画布性能优化实施方案

> 状态：已完成。来源为权威任务第 269 项已经审定的实际调查报告；本批只实现已有证据支持的优化，不把未量化的新方向扩入范围。实际结果见 [`../performance/canvas-performance-optimization-report.md`](../performance/canvas-performance-optimization-report.md)。

## 1. 合并后基线

本批先快进合入 `origin/main`，再用生产构建、系统 Chrome、`100k / continents / states` 和三轮独立进程刷新完整图层基线。合并后的 zoom `frame p95 / overlay p95` 为 `117.8～123.6ms / 71.4～80.1ms`，pan 为 `152.9～158.7ms / 60.9～69.7ms`；每轮仍固定出现 zoom `18 draw / 18 overlay`、pan `47 / 47`。主线默认标签预算的变化改善了绝对值，但没有改变“每个输入事件都完整刷新 overlay”的根因。

## 2. 封闭实施顺序

### 第 270 项：连续视口与重复事务

- 将 wheel / pan 的 camera 变化合并为每个 rAF 至多一次 viewport preview；每个输入仍立即更新累计 camera，并立即使旧 idle commit 失效。
- 交互期间不重排全部标签、图标和测量 SVG，而是按已提交 camera 对 overlay 根节点应用同一相机变换；commit 后清除临时变换并完整重算碰撞与最终位置。
- `onViewChange` 区分 `preview / commit`；preview 只刷新必须实时跟随的画笔游标，runtime 统计面板和 measurement overlay 延后到 commit。
- 组合图层通过单一批事务同步偏好、控件、renderer、runtime panel 和 measurement overlay；一次组合动作最多一次 point / line refresh、draw 与 overlay。
- locate selection 去重；闪烁仅在约 `180ms` 相位变化时重建 selection mesh，不再每个动画帧完整 draw + overlay。

### 第 271 项：装载、颜色与低频大事务

- 保持现有海岸拓扑、保护对象、像素结果和回退语义，对岸线安全检查中同一次构建的相同探针结果做局部复用。
- 对视觉 cell triangulation 的严格凸边界使用等价的线性安全验证，非凸、退化和失败边界继续走原完整自交、覆盖与硬边界回退。
- 颜色专题切换复用现有 cell 几何和 surface TypedArray，只改颜色/side 数据并独立重建确实随专题变化的岸线修正层，避免重复写入 440 万顶点的位置。
- route / river 继续只在 idle 异步构建并保留版本取消；本批不改线宽、三角形、picking 或导出语义。

### 第 272 项：门禁与收口

- 扩展现有性能脚本，直接断言 viewport preview 每 rAF 至多一次、交互态 overlay 使用临时相机变换、组合图层一次事务和 locate geometry rebuild 上限。
- 生产构建后依次运行静态/专项回归，再用隔离系统 Chrome 覆盖 `10k / 50k / 100k` 完整图层、状态动作和至少一轮可见浏览器检查；禁止与构建并发读取同一 `dist`。
- 报告优化前后事件数、frame / overlay、`loadMap` 分项、颜色切换、fit / locate、checksum / revision、camera / layers / selection 恢复，以及 console / page / WebGL / health error。

## 3. 最小验收

1. 固定输入后的最终 camera 与优化前数学结果一致；连续输入每个 rAF 至多一次 preview，commit 后 overlay 临时变换清零，标签碰撞、picking、selection、测量与导出结果正常。
2. 100k 完整图层 zoom / pan 的交互期完整 overlay 次数从 `18 / 47` 收敛为 `0`，只在最终 commit 完整刷新；交互期间标签、城市、Marker、军事和测量仍连续跟随 camera，不允许整层消失。
3. labels / zones 组合开关各自最多一次 renderer batch、line / point refresh、draw、overlay 和 runtime 同步；单成员 UI 与公开 `layers.setVisible` 兼容不变。
4. locate 产品时长保持约 `2.6s`，但 selection mesh rebuild 不超过闪烁相位数加首尾提交，动画帧不触发 DOM overlay 全量重排。
5. 10k / 50k / 100k 的 cell mesh、岸线拓扑统计、顶点数和浏览器画面保持；100k `cell-visual-mesh + shore-cache` 与颜色切换均需相对合并后基线下降，并报告实际比例，不预设会受机器波动影响的绝对 SLA。
6. 生产构建、专项回归、系统 Chrome 性能与功能门禁、`git diff --check`、`source/` 零改动通过；最终只提交本专题和合入 main 的结果，并推送当前分支。

## 4. 排除边界

- 不改变地图生成算法、地图数据、schema、旧图迁移、业务 API、默认图层、标签预算、碰撞规则、图形画质或导出格式。
- 不把标签迁移到 WebGL / Canvas，不新增字体 atlas，不拆所有 aggregate buffer，不把 GPU timer 支持伪装为本机 GPU SLA；这些仍是第 269 项报告中的长期架构候选。
- 不修改 `source/`，不顺手修复无关测试或历史问题，不从本批发现自动创建新任务。

## 5. 完成摘要

- 第 270 项完成：交互期完整 overlay 次数由 zoom / pan `18 / 47` 降为 `0 / 0`，同步 `12` 次 wheel 合并为 `1` 次 preview / draw；覆盖层通过根相机变换保持可见，最终 commit 只重排一次。
- 第 271 项完成：100k 三轮 `cell-visual-mesh + shore-cache` 中位由 `9657.9ms` 降至 `7069.4ms`，颜色切换复用 surface geometry；海岸拓扑、像素与回退门禁通过。
- 第 272 项完成：三档生产性能、100k 状态与测量重场景、真实可见浏览器和专项回归均已串行验收；绝对帧波动与长期建议如实保留在优化报告中。
