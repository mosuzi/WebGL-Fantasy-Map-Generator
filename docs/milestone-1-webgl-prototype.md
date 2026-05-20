# 第 1 里程碑：最小 WebGL cells 原型

本文档记录第 1 里程碑当前实现：在不修改 `source/` 的前提下，建立一个可以消费原项目 `pack.cells` 数据的最小 WebGL2 渲染器原型。

## 目标

第 1 里程碑的目标不是一次性替换原项目渲染层，而是先验证最关键的数据路径：

1. 从原 Fantasy Map Generator 运行时导出真实 `pack` 快照。
2. 在独立原型中读取快照。
3. 将 `pack.cells` 的中心点和 Voronoi 顶点转换为三角形。
4. 上传到 GPU buffer。
5. 用 WebGL2 渲染高度图和国家填色两种模式。

这条路径跑通后，后续才能继续讨论图层兼容层、局部刷新、拾取、编辑交互和更复杂的样式系统。

## 新增文件

- `tools/fmg-export-snapshot.mjs`
  - 启动或连接原项目页面。
  - 设置目标 cells，并锁定 `lock_points`。
  - 调用原项目 `generate()`。
  - 导出 `pack.cells`、`pack.vertices` 和 `pack.states` 的最小快照。

- `tools/serve-prototype.mjs`
  - 无依赖静态服务器，用于运行原型页面。
  - 默认服务目录为 `prototype/webgl-cells`。

- `prototype/webgl-cells/index.html`
  - 原型入口页面。

- `prototype/webgl-cells/src/main.js`
  - 加载地图快照。
  - 初始化渲染器。
  - 绑定模式切换、视图适配和统计面板。

- `prototype/webgl-cells/src/renderer.js`
  - WebGL2 渲染器。
  - 将每个 cell 按中心点扇形三角化。
  - 构建位置、海拔颜色、国家颜色三个 buffer。
  - 支持平移、滚轮缩放、适配视图。

- `prototype/webgl-cells/src/styles.css`
  - 原型页面样式。

- `prototype/webgl-cells/data/sample-map.json`
  - 当前提交内置的一份 10k 目标 cells 真实 FMG 快照。

## 运行方式

导出新的地图快照：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 10000 --out .\prototype\webgl-cells\data\sample-map.json
```

启动原型：

```powershell
Set-Location D:\work\fmg
node .\tools\serve-prototype.mjs --port 5400
```

然后打开：

```text
http://127.0.0.1:5400
```

## 当前快照数据

当前 `sample-map.json` 来自一次 10k 目标 cells 的真实原项目运行时导出。

| 指标 | 数值 |
|---|---:|
| 目标 cells | 10000 |
| 实际 pack cells | 7292 |
| Voronoi 顶点 | 14788 |
| 三角形 | 43740 |
| GPU 顶点 | 131220 |
| 地图尺寸 | 1440 x 960 |

说明：实际 pack cells 会随随机地图生成结果变化，不一定等于目标 cells。第 1 里程碑关注的是数据转换和渲染路径，而不是地图生成算法本身。

## 已验证内容

- `node --check` 已通过：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/src/main.js`
  - `prototype/webgl-cells/src/renderer.js`
- 使用系统 Chrome 打开原型页面，确认：
  - WebGL2 上下文创建成功。
  - 地图快照成功加载。
  - canvas 实际显示高度图。
  - `国家` 模式按钮可以切换并激活。
  - 统计面板显示 GPU 顶点、三角形、地图尺寸等信息。

## 当前实现边界

- 目前只渲染 cell 面，不包含河流、道路、边界、标签、图标和纹章。
- cell 采用中心点扇形三角化，足够验证路径，但后续需要考虑更稳定的边界接缝、描边和 picking。
- 样式是原型级调色，不等同于原项目最终视觉。
- 当前原型使用原生 WebGL2，没有引入 PixiJS。这样可以先验证最底层数据路径；后续若进入更完整图层系统，可以再评估 PixiJS 或轻量封装。

## 下一步建议

第 1 里程碑下一段可以继续做：

1. 增加 cell picking：鼠标悬停时定位 cell id。
2. 增加边界线 pass：从相邻 cell 的 state 差异生成国家边界线。
3. 对比 SVG `cells` 或 `heightmap` 图层与 WebGL cell pass 的构建/绘制耗时。
4. 将渲染器接口整理成接近 `GraphicsMapRenderer` 的形态，为接入原项目 UI 做准备。
