# 当前开发计划

本文档用于追踪当前阶段计划。后续每次推进里程碑或改变路线，都应同步更新这里。

## 总目标

把 `source/Fantasy-Map-Generator` 中基于 SVG/HTML 的地图渲染层逐步迁移到更高性能的图形渲染方案，同时尽量保留原有生成算法、数据模型、存档格式和编辑逻辑。

## 当前阶段：第 0 里程碑，性能基线

第 0 里程碑目标：

- 建立可重复运行的性能 profiling 工具。
- 记录地图生成、图层绘制、缩放、导出序列化耗时。
- 统计每个 SVG 图层节点数量。
- 支持 `10000`、`50000`、`100000` 三档目标 cells。
- 输出 JSON 和 Markdown 基线报告。

## 当前已完成

- 新增 `tools/fmg-profile.mjs`，作为外部 profiling harness，不向 `source/` 写入新项目代码。
- 新增 `docs/performance-baseline.md`，说明第 0 里程碑工具的用途和运行方式。
- 新增 `docs/performance-baseline-results.json` 和 `docs/performance-baseline-results.md`，记录完整三档基线。
- 新增 `docs/performance-baseline-smoke.json` 和 `docs/performance-baseline-smoke.md`，保留 10k 烟测记录。
- 新增 `AGENTS.md`，作为后续 Codex 智能体接手入口。
- 新增 `docs/development-log.md`，记录开发历史。
- 将文档规范固定为中文，代码只添加必要注释。

## 已解决问题

- 原项目依赖已安装；曾损坏的 `@rolldown/binding-win32-x64-msvc` 已重新安装并验证可加载。
- Windows TCP 排除端口包含 `5109-5208`，所以 profiling 改用 `5300` 端口。
- Playwright 自带 Chromium 下载超时，profiling 工具已支持 `--browser-channel chrome|msedge` 复用系统浏览器。
- Windows 下 Vite/npm/cmd/node 子进程树不会自动完整回收，profiling 工具已使用 `taskkill /T /F` 清理。
- 原项目 `generate()` 会在 points 未锁定时由 `randomizeOptions()` 把点数重置回默认 10k；profiling 工具已在生成前调用原项目 `changeCellsDensity()` 并锁定 `lock_points`。

## 基线结论

当前可信基线命令：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-profile.mjs --port 5300 --browser-channel chrome --cells 10000,50000,100000 --out .\docs\performance-baseline-results.json --markdown .\docs\performance-baseline-results.md
```

本次基线摘要：

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 |
|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 |

结论：随网格规模上升，生成耗时增长明显；SVG 节点数在 100k 档达到约 7.8 万，后续图形化迁移应优先降低大量 DOM 节点带来的绘制、缩放和交互成本。

## 下一步

1. 阅读 `docs/performance-baseline-results.md` 中各图层节点统计，确认第 1 里程碑优先迁移对象。
2. 建立第 1 里程碑的最小图形渲染器原型，代码放在当前目录下，不放入 `source/`。
3. 优先验证 `pack.cells` 到 cell mesh 或批量几何的转换。
4. 以高度图、国家填色、人口点/降水点等高节点图层作为对比对象，度量 DOM 节点减少量和绘制耗时变化。

## 第 1 里程碑预期方向

第 1 里程碑暂定为最小图形渲染器原型：

- 在根目录或后续约定位置实现外部原型，除非用户明确允许修改 `source/`。
- 复用原项目生成后的 `grid`、`pack`、`options` 数据。
- 将至少一个高价值图层从 SVG DOM 表达转换为图形渲染表达。
- 保留 SVG/HTML UI 作为控制层，先验证渲染性能收益，再逐步扩大迁移范围。
