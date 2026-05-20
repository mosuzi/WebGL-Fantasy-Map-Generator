# 当前开发计划

本文档用于追踪当前阶段计划。后续每次推进里程碑或改变路线，都应同步更新这里。

## 总目标

把 `source/Fantasy-Map-Generator` 中基于 SVG/HTML 的地图渲染层逐步迁移到更高性能的图形渲染方案，同时尽量保留原有生成算法、数据模型、存档格式和编辑逻辑。

## 当前阶段：第 1 里程碑，最小 WebGL cells 原型

第 0 里程碑性能基线已经完成。当前进入第 1 里程碑：验证原项目真实 `pack.cells` 数据能否转换为 GPU 可渲染的几何表达。

## 当前已完成

- 第 0 里程碑：
  - 新增 `tools/fmg-profile.mjs`。
  - 生成 `docs/performance-baseline-results.json` 和 `docs/performance-baseline-results.md`。
  - 建立中文协作文档和开发历史。
- 第 1 里程碑第一段：
  - 新增 `tools/fmg-export-snapshot.mjs`，从原项目运行时导出真实地图快照。
  - 新增 `tools/serve-prototype.mjs`，提供无依赖静态服务器。
  - 新增 `prototype/webgl-cells/` 原型。
  - 新增 `prototype/webgl-cells/data/sample-map.json`，作为当前原型默认数据。
  - 新增 `docs/milestone-1-webgl-prototype.md`。

## 第 1 里程碑当前结果

当前原型已经跑通：

- 读取真实 FMG 运行时快照。
- 将 `pack.cells.p`、`pack.cells.v` 和 `pack.vertices.p` 转换为三角形。
- 上传位置、海拔颜色、国家颜色到 WebGL buffer。
- 使用 WebGL2 渲染高度图和国家填色模式。
- 支持鼠标拖拽平移、滚轮缩放和视图适配。

当前默认快照摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 10000 |
| 实际 pack cells | 7292 |
| Voronoi 顶点 | 14788 |
| 三角形 | 43740 |
| GPU 顶点 | 131220 |
| 地图尺寸 | 1440 x 960 |

## 运行命令

导出快照：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 10000 --out .\prototype\webgl-cells\data\sample-map.json
```

启动原型：

```powershell
Set-Location D:\work\fmg
node .\tools\serve-prototype.mjs --port 5400
```

访问：

```text
http://127.0.0.1:5400
```

## 下一步

1. 增加 cell picking，验证鼠标坐标到 cell id 的反查路径。
2. 增加国家边界线 pass，从相邻 cell 的 state 差异生成线几何。
3. 增加原型级性能计时，对比 SVG 基线中的图层绘制耗时。
4. 把当前 `CellWebGLRenderer` 接口收敛到总方案中的 `GraphicsMapRenderer` 形态。

## 约束

- 新项目代码仍然放在根目录下，不放进 `source/`。
- 所有文档继续使用中文。
- 代码注释保持必要且克制。
