# 性能基线：第 0 里程碑

本文档记录第 0 个里程碑的实现方式：为当前 SVG/HTML 版 Fantasy Map Generator 建立可重复运行的性能基线工具。所有新增项目代码都放在当前项目根目录下，不向 `source/` 目录写入新项目代码。

## 已新增内容

- `tools/fmg-profile.mjs`
  - 从 `source/Fantasy-Map-Generator` 启动现有 Vite 开发服务器，或连接到一个已经运行的 URL。
  - 使用 Playwright 打开地图生成器页面。
  - 在浏览器页面运行时注入 `window.__fmgProfile()`。
  - 测量地图生成、图层预设应用、完整图层绘制、单个 `draw*` 函数、缩放/复位、SVG 序列化等耗时。
  - 按图层统计 SVG 子节点数量，并按 `path`、`use`、`text`、`circle`、`line`、`image` 等类型拆分。
  - 默认按 `10000`、`50000`、`100000` 三档目标 cells 运行。
  - 在 `docs/` 下输出 JSON 和 Markdown 结果文件。

这个工具是包在原项目外部的 profiling harness，不会修改 `source/Fantasy-Map-Generator` 的源码。

## 运行方式

当前机器建议使用端口 `5300` 和系统 Chrome：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-profile.mjs --port 5300 --browser-channel chrome --cells 10000,50000,100000 --out .\docs\performance-baseline-results.json --markdown .\docs\performance-baseline-results.md
```

默认输出：

- `docs/performance-baseline-results.json`
- `docs/performance-baseline-results.md`

如果地图生成器已经在本地运行，可以传入 `--url`，脚本就不会再启动 Vite：

```powershell
node .\tools\fmg-profile.mjs --url http://127.0.0.1:5300
```

常用参数示例：

```powershell
node .\tools\fmg-profile.mjs --cells 10000,50000 --preset physical
node .\tools\fmg-profile.mjs --headful
node .\tools\fmg-profile.mjs --browser-channel chrome
node .\tools\fmg-profile.mjs --browser-channel msedge
node .\tools\fmg-profile.mjs --out .\docs\baseline.json --markdown .\docs\baseline.md
node .\tools\fmg-profile.mjs --export=false
```

## 当前环境注意事项

- 原项目依赖已经安装在 `source/Fantasy-Map-Generator/node_modules`。
- 曾损坏的 `@rolldown/binding-win32-x64-msvc` 已重新安装并验证可加载。
- 当前 Windows TCP 排除端口包含 `5109-5208`，不要使用默认 Vite 端口 `5173`；建议使用 `5300`。
- Playwright 自带 Chromium 曾下载超时；可用 `--browser-channel chrome` 或 `--browser-channel msedge` 复用系统浏览器。
- Windows 下 Vite/npm/cmd/node 子进程树不会总是自动完整退出，工具已使用 `taskkill /T /F` 清理。

## 注入的调试函数

脚本会在打开的页面中注入如下运行时 API：

```js
await window.__fmgProfile({
  cells: 50000,
  preset: "political",
  includeExport: true
});
```

返回结果包含：

- `timings.generate`：`generate()` 耗时。
- `timings.applyLayersPreset`：应用图层预设耗时。
- `timings.drawLayers`：完整 `drawLayers()` 绘制耗时。
- `layerTimings`：单个绘制函数耗时，例如 `drawStates`、`drawRivers`、`drawLabels`、`drawMarkers`。
- `nodeCounts`：各 SVG 图层的节点统计。
- `totals`：整个 `#map` 下的 SVG 总节点统计。
- `map`：生成地图的对象数量和尺寸信息。
- `errors`：单个绘制函数 profiling 时出现的非致命错误。

这个函数只在 Playwright 打开的页面中临时存在，不会写入 `source/` 源码。

## 点数设置细节

原项目的 `pointsInput.value` 不是实际 cells 数量，而是 1-13 的滑块档位；实际目标 cells 存在 `pointsInput.dataset.cells`。同时，`generate()` 会调用 `randomizeOptions()`，如果 `lock_points` 未锁定，它会把 points 重置回默认 10k。

因此 profiler 在生成前会：

- 将 `10000/50000/100000` 映射到原项目滑块档位 `4/8/13`。
- 优先调用原项目 `changeCellsDensity()`。
- 设置 `lock_points.dataset.locked = "1"`，避免生成流程重置点数。
- 对不支持的 cells 档位直接报错。

## 当前可信基线

当前完整结果位于：

- `docs/performance-baseline-results.json`
- `docs/performance-baseline-results.md`

摘要：

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 |
|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 |

## 需要持续追踪的指标

| 指标 | 作用 |
|---|---|
| `generate` 耗时 | 区分地图生成算法成本和渲染成本。 |
| `drawLayers` 耗时 | 衡量完整 SVG 重建成本。 |
| 单个 `draw*` 耗时 | 找出最值得优先迁移的图层。 |
| SVG 总子节点数 | 衡量 DOM 压力。 |
| 各图层 `path/use/text` 数量 | 判断哪类 SVG primitive 占比最高。 |
| 缩放和复位耗时 | 衡量当前相机交互开销。 |
| SVG 序列化耗时 | 给导出路径建立基线。 |

## 下一阶段对照重点

第 1 个图形渲染原型需要与这些基线结果对比，尤其关注：

- `drawStates`、`drawProvinces`、`drawBiomes`、`drawHeightmap`
- `drawRivers`、`drawRoutes`、`drawBorders`
- `drawBurgIcons`、`drawMarkers`、`drawLabels`
- 总 `path`、`use`、`text`、`circle`、`line` 节点数量

这些成本最有可能在后续迁移中被 GPU buffer、sprite batch 和缓存化 overlay 替代。
