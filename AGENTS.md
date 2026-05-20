# Codex 接手说明

这个文件是后续 Codex 智能体进入本项目时必须先读的固定入口。用户已经明确要求：所有文档使用中文描写；代码只添加必要注释；所有计划和开发历史要及时写入文档，方便新智能体复用上下文并追溯决策。

## 项目目标

当前项目在 `source/Fantasy-Map-Generator` 中放置原 Fantasy Map Generator 源码。我们的目标是提升地图生成器性能，把当前基于 SVG/HTML 的地图渲染层逐步迁移为图形技术实现。

核心原则：

- 保留现有地图生成算法、数据模型、存档格式和编辑逻辑。
- 优先重写渲染层，而不是推翻原项目。
- 新增项目代码默认放在当前项目根目录下，不要在 `source/` 下新增文件，除非用户明确要求开始改原项目源码。
- `source/` 可以为了运行原项目而安装依赖，但不要把新工具、新原型、新文档放进去。

## 文档约定

- 所有手写文档必须使用中文。
- 计划、阶段进度、重要决策、风险和执行结果都要及时写入 `docs/`。
- 如果新增脚本会生成 Markdown 报告，生成内容也应为中文。
- 根目录关键文档：
  - `graphics-reimplementation-plan.md`：图形化重实现总方案。
  - `docs/current-plan.md`：当前开发计划和下一步。
  - `docs/development-log.md`：开发历史与决策记录。
  - `docs/performance-baseline.md`：第 0 里程碑 profiling 工具说明。
  - `docs/performance-baseline-results.md`：当前可信性能基线报告。
  - `docs/milestone-1-webgl-prototype.md`：第 1 里程碑 WebGL cells 原型说明。

## 代码约定

- 写代码时只添加必要注释，注释应解释意图、约束或非显然逻辑。
- 不要为了注释而注释。
- 手动编辑文件使用 `apply_patch`。
- 不要向 `source/` 写入新项目代码，除非用户后续明确授权。
- 运行工具或测试前，先确认是否需要依赖、网络或权限。

## 当前技术路线

总方案建议采用“生成逻辑不动，渲染器重写”的路线：

- 主渲染层迁移到 `canvas` + WebGL2，优先考虑 PixiJS v8 或轻量 WebGL2 封装。
- 文本、纹章、编辑手柄等复杂 SVG 能力初期可保留 overlay。
- 通过兼容层保留现有 `drawHeightmap()`、`drawStates()`、`drawRivers()`、`drawBurgIcons()` 等函数名，让 UI 和编辑器分阶段迁移。
- PNG/JPEG 导出最终从 canvas 读取；SVG 导出短期保留旧管线。

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
| 目标 cells | 10000 |
| 实际 pack cells | 7292 |
| Voronoi 顶点 | 14788 |
| 三角形 | 43740 |
| GPU 顶点 | 131220 |

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

然后根据用户最新指令继续。当前下一步建议是继续第 1 里程碑：增加 cell picking、国家边界线 pass 和原型性能计时。
