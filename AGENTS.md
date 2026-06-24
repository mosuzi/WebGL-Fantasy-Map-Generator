# Codex 接手说明

这个文件是后续 Codex 智能体进入本项目时必须先读的固定入口。用户已经明确要求：所有文档使用中文描写；代码只添加必要注释；所有计划和开发历史要及时写入文档，方便新智能体复用上下文并追溯决策。

## 项目目标

当前项目在 `source/Fantasy-Map-Generator` 中放置原 Fantasy Map Generator 源码。我们的目标不是修改原项目，而是基于原项目的功能、数据结构和视觉表现，复刻一个功能相似但由 WebGL 实现的独立地图生成器。

核心原则：

- `source/` 是参考实现、行为对照和性能基线来源，不是改造目标。
- 禁止修改 `source/` 原项目代码；只有为了安装依赖和运行参考项目而产生的锁文件例外，例如 `pnpm-lock.yaml`。
- 新增项目代码、工具、原型和文档默认放在当前项目根目录下，不要放进 `source/`。
- 可以阅读、运行、profile 和浏览器观察 `source/`，用来确认原项目行为、数据模型和视觉表现。

## 文档约定

- 所有手写文档必须使用中文。
- 计划、阶段进度、重要决策、风险和执行结果都要及时写入 `docs/`。
- 如果新增脚本会生成 Markdown 报告，生成内容也应为中文。
- 根目录关键文档：
  - `graphics-reimplementation-plan.md`：早期图形化重实现分析，已被新复刻计划取代，仅作参考。
  - `docs/gl-reimplementation-acceptance-plan.md`：独立 WebGL 地图生成器复刻可验收计划。
  - `docs/current-plan.md`：当前开发计划和下一步。
  - `docs/development-log.md`：开发历史与决策记录。
  - `docs/performance-baseline.md`：第 0 里程碑 profiling 工具说明。
  - `docs/performance-baseline-results.md`：当前可信性能基线报告。
  - `docs/milestone-1-webgl-prototype.md`：第 1 里程碑 WebGL cells 原型说明。
  - `docs/webgl-svg-performance-comparison.md`：WebGL 原型与 SVG 基线性能对照。
  - `docs/webgl-prototype-profile-results.md`：WebGL 原型当前性能采集结果。
  - `docs/source-generation-audit-and-rectification-plan.md`：source 生成算法重新审查和正式应用生成质量整改方案。

## 代码约定

- 写代码时只添加必要注释，注释应解释意图、约束或非显然逻辑。
- 不要为了注释而注释。
- 手动编辑文件使用 `apply_patch`。
- 不要向 `source/` 写入新项目代码，也不要修改原项目源码。
- 运行工具或测试前，先确认是否需要依赖、网络或权限。

## 当前技术路线

总方案改为“参考原项目，独立复刻 WebGL 地图生成器”的路线：

- 独立实现新的生成器应用，主视图使用 `canvas` + WebGL2，优先考虑轻量 WebGL2 封装或后续成熟渲染库。
- 原项目的生成流程、数据字段、图层顺序、编辑交互和导出行为作为参考对象，不直接接入或替换原项目代码。
- 文本、纹章、编辑手柄等复杂能力可以先用新项目自己的 HTML/SVG overlay 过渡，但 overlay 代码仍放在新项目目录。
- PNG/JPEG 导出最终从新应用 canvas 读取；SVG/数据导出在新项目中按能力重新实现，必要时参考原项目格式。

## 当前状态

已完成：

- 阅读 `source/Fantasy-Map-Generator` 核心结构。
- 编写图形化重实现总方案：`graphics-reimplementation-plan.md`。
- 完成第 0 里程碑外部性能基线工具：`tools/fmg-profile.mjs`。
- 编写第 0 里程碑说明：`docs/performance-baseline.md`。
- 跑出可信 `10000/50000/100000` 三档性能基线：
  - `docs/performance-baseline-results.json`
  - `docs/performance-baseline-results.md`
- 开始并跑通第 1 里程碑最小 WebGL cells 原型：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/`
  - `docs/milestone-1-webgl-prototype.md`
- 整理第 1 里程碑 WebGL 原型与第 0 里程碑 SVG 基线对照：
  - `docs/webgl-svg-performance-comparison.md`
- 将 WebGL 原型主接口收敛为 `GraphicsMapRenderer`：
  - `prototype/webgl-cells/src/renderer.js`
  - 保留 `CellWebGLRenderer` 兼容别名。
- 新增正式 WebGL 原型性能采集脚本：
  - `tools/webgl-prototype-profile.mjs`
  - `docs/webgl-prototype-profile-results.json`
  - `docs/webgl-prototype-profile-results.md`
- 修正底层 mesh 数据源：
  - 基础 cell mesh 使用 `grid.points`、`grid.cells.v`、`grid.vertices.p`。
  - `pack.cells` 只用于国家、边界、河流、picking 等业务语义。
  - 不要再把 `pack.cells` 当作均匀底层网格，否则水域/边界 pack cell 会出现巨型多边形。
- 修正原型级河流折线河口处理：
  - 当前没有复刻原版 `Rivers.getRiverPath()` 的变宽河道。
  - fallback 河流折线遇到第一个水域 cell 会插入近似河口点并停止，避免河流画到海里。
- 正式应用已完成第一轮 source 生成算法整改：
  - `grid.cells.c` 改为共享边邻接，并用于高度、feature、河流、路线和语义扩张。
  - 高度末端不再使用全局百分位重排，改为海平面校准、连续 relief 拉伸和坡脚平滑。
  - 路线改为 A* 成本寻路，失败时不再画直连。
  - 河流改为动态河源上限和更低 flux 阈值。
  - 文化、宗教、国家、省份和区域改为邻接成本扩张。
- 更新当前计划和开发历史：
  - `docs/current-plan.md`
  - `docs/development-log.md`

第 0 里程碑可信基线摘要：

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 |
|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 |

注意事项：

- Windows 端口 `5109-5208` 在当前机器上被 TCP 排除，Vite profiling 使用 `5300`。
- Playwright 自带 Chromium 下载曾超时，当前可用 `--browser-channel chrome` 复用系统 Chrome。
- 原项目 `generate()` 会在 points 未锁定时把点数重置为默认 10k；profiling 工具已经在生成前设置点数并锁定 `lock_points`。

第 1 里程碑当前原型摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 grid cells | 99846 |
| 实际 pack cells | 58251 |
| 渲染来源 | grid |
| grid Voronoi 顶点 | 200338 |
| pack Voronoi 顶点 | 117148 |
| 三角形 | 598519 |
| GPU 顶点 | 1795557 |
| 国家边界线段 | 1404 |
| 河流数量 | 1021 |
| 河流线段 | 5641 |
| picking 索引桶 | 39204 |
| 平均候选 cells | 5.9 |
| 最大候选 cells | 17 |

第 1 里程碑当前 WebGL 性能采集摘要：

| 指标 | 数值 |
|---|---:|
| buffer 构建 | 336.5ms |
| buffer 上传 | 36.6ms |
| draw 平均值 | 0.27ms |
| draw 最大值 | 1.3ms |
| picking 平均值 | 0.01ms |
| picking 最大值 | 0.1ms |

运行原型：

```powershell
node .\tools\serve-prototype.mjs --port 5400
```

然后访问 `http://127.0.0.1:5400`。

## 接手建议

新智能体接手时，按顺序阅读：

1. `AGENTS.md`
2. `docs/current-plan.md`
3. `docs/development-log.md`
4. `graphics-reimplementation-plan.md`
5. `docs/performance-baseline.md`
6. `docs/performance-baseline-results.md`
7. `docs/milestone-1-webgl-prototype.md`
8. `docs/webgl-svg-performance-comparison.md`
9. `docs/webgl-prototype-profile-results.md`
10. `docs/source-generation-audit-and-rectification-plan.md`

然后根据用户最新指令继续。当前下一步建议是先修正计划文档，明确 `source/` 只读参考边界，然后进入独立 WebGL 地图生成器的生成内核和正式应用骨架设计。
