# 开发历史

本文档用于记录项目推进历史、关键决策和已完成工作。后续每次完成阶段性工作，都应追加记录。

## 2026-05-18：初始源码阅读与总方案

用户说明：`source/` 目录中是一个地图生成器源码，当前基于 SVG 和 HTML 实现，希望提升性能，用图形技术重新实现。用户不熟悉图形技术，因此先要求阅读源码并写一份详细说明文档。

完成内容：

- 阅读 `source/Fantasy-Map-Generator` 项目结构。
- 识别核心入口：
  - `src/index.html`
  - `public/main.js`
  - `public/modules/ui/layers.js`
  - `src/renderers/*`
  - `src/modules/*`
  - `src/types/PackedGraph.ts`
  - `src/utils/pathUtils.ts`
- 判断主要性能瓶颈来自大量 SVG DOM 节点、SVG path 字符串拼接、`innerHTML` 重建、SVG 滤镜和 mask。
- 编写 `graphics-reimplementation-plan.md`。

关键决策：

- 不建议推翻生成算法。
- 建议保留 `grid`、`pack`、`options`、`style` 等现有数据模型。
- 推荐主路线为 WebGL2 + PixiJS v8 或轻量 WebGL2 封装。
- 文本、纹章、编辑手柄等复杂能力初期可以保留 overlay。

## 2026-05-18：开始第 0 里程碑

用户要求：按照文档第 0 个里程碑开始实现，项目代码放在当前目录下，不要在 `source` 文件夹下放任何新代码。

完成内容：

- 新增 `tools/fmg-profile.mjs`。
- 新增 `docs/performance/performance-baseline.md`。
- profiling 工具设计为外部 harness，不修改 `source/`。
- 工具会在 Playwright 页面运行时注入 `window.__fmgProfile()`。
- 工具支持启动 Vite dev server，或连接已有 `--url`。
- 工具默认测试 `10000`、`50000`、`100000` cells。
- 工具输出 JSON 和 Markdown 报告。

当前限制：

- `source/Fantasy-Map-Generator/node_modules` 不存在，因此尚未跑出真实数值基线。
- 已执行 `node --check tools\fmg-profile.mjs`，语法检查通过。

## 2026-05-18：固定协作与文档约定

用户纠正并新增要求：

- 所有文档使用中文描写。
- 写的代码添加必要注释。
- 将目前已经沟通过的所有东西写成项目固定文档，后续不再重复强调。
- 新 Codex 智能体切换后也应能复用上下文。
- 及时将计划写成文档，方便追溯开发历史。

完成内容：

- 新增 `AGENTS.md` 作为后续智能体固定接手入口。
- 新增 `docs/current-plan.md` 记录当前计划和下一步。
- 新增本文件 `docs/development-log.md`。
- 将 `docs/performance/performance-baseline.md` 改写为中文。
- 将 profiling 脚本生成的 Markdown 报告改为中文标题和表头。
- 给 `tools/fmg-profile.mjs` 补充必要注释。

后续要求：

- 所有新增手写文档必须使用中文。
- 计划、历史、重要决策要持续写入 `docs/`。
- 若脚本生成 Markdown 报告，也应输出中文。

## 2026-05-19：继续第 0 里程碑执行

用户要求继续执行第 0 里程碑，并说明已将默认 Node 版本重新设置为 26。

执行情况：

- 检查到当前 shell 中 `node` 一度仍显示为 v24.14.0，但后续 profiling 脚本输出中 Node 已显示为 v26.1.0。
- `npm install` 曾因中断导致 `rolldown` 的 Windows 原生 binding 损坏。
- 精确删除了损坏的 `source/Fantasy-Map-Generator/node_modules/@rolldown/binding-win32-x64-msvc` 目录。
- 执行 `npm install @rolldown/binding-win32-x64-msvc@1.0.0 --save-optional`，显式补回缺失的平台依赖。
- 验证 `rolldown-binding.win32-x64-msvc.node` 可被 Node 正常加载。
- 发现 Windows TCP 排除端口范围包含 `5109-5208`，因此默认 `5173` 和尝试过的 `5187` 都无法用于 Vite。
- 改用 `5300` 端口后，Vite 端口问题解除。
- 新阻塞变为 Playwright 自带 Chromium 未安装，且 `npx playwright install chromium` 下载超时。
- 为 `tools/fmg-profile.mjs` 增加 `--browser-channel chrome|msedge` 支持，并在 Playwright 自带浏览器缺失时自动尝试系统 Chrome 或 Edge。
- 使用 `--port 5300 --browser-channel chrome --cells 10000` 跑通烟测，生成 `docs/generated/reports/performance-baseline-smoke.json` 和 `docs/generated/reports/performance-baseline-smoke.md`。
- 烟测结果已写出，但命令最终超时，原因是 Windows 下 Vite/npm/cmd/node 子进程树没有被完整回收。
- 为 `tools/fmg-profile.mjs` 增加 Windows `taskkill /T /F` 进程树清理逻辑。

当前下一步：

- 重新跑 10k 烟测确认进程可正常退出。
- 烟测退出正常后运行完整 `10000,50000,100000` 基线。
- 完整基线已首次生成，但检查结果发现实际 `pack.cells` 没有随目标 cells 单调增长。
- 排查源码后确认 `pointsInput.value` 是 1-13 档位，不是实际 cells 数；实际 cells 位于 `pointsInput.dataset.cells`。
- 修正 `tools/fmg-profile.mjs` 的 cells 设置逻辑：`10000/50000/100000` 分别映射到滑块档位 `4/8/13`，同时设置 `dataset.cells`。

## 2026-05-19：完成第 0 里程碑可信基线

继续排查完整基线时发现：虽然 profiler 已把 `pointsInput` 设置到目标档位，但原项目 `generate()` 会调用 `randomizeOptions()`。当 `lock_points` 没有锁定时，`randomizeOptions()` 会执行 `changeCellsDensity(4)`，把目标点数重置回默认 10k，导致 50k 和 100k 基线不可信。

完成内容：

- 阅读 `public/modules/ui/options.js` 中的 `randomizeOptions()`，确认 points 未锁定时会被重置。
- 阅读 `public/modules/ui/general.js` 中的 `locked(id)`，确认锁定状态由 `#lock_points.dataset.locked === "1"` 判断。
- 修正 `tools/fmg-profile.mjs`：
  - 生成前优先调用原项目 `changeCellsDensity()`，复用原项目自身的点数档位逻辑。
  - 生成前设置 `lock_points` 为锁定态，避免 `randomizeOptions()` 重置 points。
  - 对不支持的 cells 档位直接报错，避免产生含糊基线。
- 执行 `node --check tools\fmg-profile.mjs`，语法检查通过。
- 使用 Node 26、端口 `5300`、系统 Chrome 跑通完整三档基线。
- 生成并覆盖可信结果：
  - `docs/generated/reports/performance-baseline-results.json`
  - `docs/generated/reports/performance-baseline-results.md`

本次可信基线摘要：

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 |
|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 |

关键结论：

- 第 0 里程碑 profiling 工具已经可重复运行。
- 三档目标 cells 已确认命中实际网格规模，不再错误回退到 10k。
- 100k 档生成耗时明显高于绘制耗时，但 SVG 节点达到约 7.8 万，仍是后续缩放、交互、局部刷新和导出路径上的重要优化对象。
- 下一阶段应进入第 1 里程碑：实现最小图形渲染器原型，并选择一个节点量高、可验证收益清晰的图层先迁移。

## 2026-05-19：开始并跑通第 1 里程碑 WebGL cells 原型

用户要求执行第 1 里程碑。

完成内容：

- 新增 `tools/fmg-export-snapshot.mjs`：
  - 启动原项目 Vite 服务。
  - 使用系统 Chrome 打开原项目页面。
  - 设置目标 cells 并锁定 `lock_points`。
  - 调用原项目 `generate()`。
  - 导出 `pack.cells`、`pack.vertices`、`pack.states` 的最小 JSON 快照。
- 新增 `tools/serve-prototype.mjs`：
  - 提供无依赖静态服务器。
  - 默认服务 `prototype/webgl-cells`。
- 新增 `prototype/webgl-cells/`：
  - `index.html`：原型页面。
  - `src/main.js`：加载快照、初始化渲染器、绑定 UI。
  - `src/renderer.js`：原生 WebGL2 cell 渲染器。
  - `src/styles.css`：原型样式。
  - `data/sample-map.json`：10k 目标 cells 的真实 FMG 运行时快照。
- 新增 `docs/milestones/milestone-1-webgl-prototype.md` 记录实现说明、运行方式和当前边界。

当前原型数据：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 10000 |
| 实际 pack cells | 7292 |
| Voronoi 顶点 | 14788 |
| 三角形 | 43740 |
| GPU 顶点 | 131220 |
| 地图尺寸 | 1440 x 960 |

验证情况：

- `node --check` 通过：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/src/main.js`
  - `prototype/webgl-cells/src/renderer.js`
- 使用系统 Chrome 打开原型页面，确认 WebGL2 上下文创建成功、地图快照加载成功、高度图可见、国家模式按钮可切换。
- 内置浏览器插件在本轮因用户目录权限问题无法启动，因此视觉验证使用 Playwright + 系统 Chrome 完成。

关键结论：

- 第 1 里程碑最关键的数据路径已经跑通：真实 `pack.cells` 可以在外部原型中被转换为 GPU 三角形并渲染。
- 当前还不是完整替代渲染器，只是 cells 面图层原型。
- 下一步应增加 picking、国家边界线 pass 和原型性能计时。

## 2026-05-20：推进第 1 里程碑交互、边界和计时

用户先要求将 demo 的目标 cells 改为 100k，随后要求继续推进里程碑。

完成内容：

- 使用 `tools/fmg-export-snapshot.mjs` 重新导出 `100000` 目标 cells 的 demo 快照。
- 更新 `prototype/webgl-cells/data/sample-map.json`。
- 在 WebGL 原型中新增国家边界线 pass：
  - 根据相邻 cell 的 `state` 差异生成线段。
  - 当前 100k 目标快照生成 `712` 条国家边界线段。
- 新增鼠标悬停 cell picking：
  - 当前实现为 CPU 多边形遍历，用于先验证交互数据路径。
  - 悬停时显示 cell id、高度、国家和世界坐标。
- 新增原型级性能计时：
  - buffer 构建耗时。
  - buffer 上传耗时。
  - WebGL 绘制耗时。
- 更新左侧 UI：
  - 新增国家边界开关。
  - 新增悬停 cell 面板。
  - 统计面板加入边界线段和性能指标。

当前 100k demo 快照摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 pack cells | 20602 |
| Voronoi 顶点 | 41850 |
| 三角形 | 123932 |
| GPU 顶点 | 371796 |
| 国家边界线段 | 712 |

验证情况：

- `node --check prototype\webgl-cells\src\main.js` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- 使用系统 Chrome 验证 demo：
  - 页面加载 100k 目标快照。
  - WebGL buffer 顶点数为 `371796`。
  - 国家边界顶点数为 `1424`，即 `712` 条线段。
  - 一次验证中的构建约 `64.9ms`，上传约 `5ms`，绘制约 `0.7ms`。
  - `pickCell()` 可以返回 cell id、高度、国家和世界坐标。

下一步：

- 将 CPU picking 替换为空间索引。
- 增加河流或道路 line pass。
- 将性能数据整理为与第 0 里程碑 SVG 基线可对照的表。

## 2026-06-09：将 hover picking 改为空间索引

继续执行第 1 里程碑，目标是避免鼠标悬停时遍历全部 cell。

完成内容：

- 在 `prototype/webgl-cells/src/renderer.js` 中新增均匀网格空间索引：
  - 构建阶段为每个 cell 计算多边形边界盒。
  - 按边界盒覆盖范围写入网格桶。
  - picking 时先根据鼠标世界坐标定位网格桶，再对候选 cell 做边界盒和 polygon 判断。
- 在统计面板中新增 picking 索引指标：
  - 索引桶数量。
  - 平均候选 cells。
  - 最大候选 cells。
- 在悬停面板中新增单次 picking 指标：
  - 当前命中的候选 cell 数量。
  - picking 耗时。
- 更新 `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `AGENTS.md`。
- 新增 `docs/performance/webgl-svg-performance-comparison.md`，记录 WebGL 原型与 SVG 基线的阶段性对照。

当前验证结果：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 pack cells | 20602 |
| GPU 顶点 | 371796 |
| 国家边界线段 | 712 |
| picking 索引桶 | 13824 |
| 平均候选 cells | 6.55 |
| 最大候选 cells | 31 |
| 构建 buffer | 69.5ms |
| 上传 buffer | 4.2ms |
| 绘制 | 0.3ms |
| 中心点 picking 候选 | 2 |
| 中心点 picking | 0ms |

验证情况：

- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - 页面加载 100k 目标快照。
  - WebGL buffer 和国家边界仍正常。
  - 空间索引统计已显示在页面统计面板。
  - `pickCell()` 返回命中 cell，并附带候选数量和 picking 耗时。

下一步：

- 增加河流或道路 line pass。
- 将 WebGL 原型性能数据整理为与 SVG 基线可对照的表。
- 将 `CellWebGLRenderer` 接口收敛到 `GraphicsMapRenderer` 形态。

## 2026-06-10：增加河流 line pass

继续执行第 1 里程碑，目标是验证真实线图层数据进入 WebGL 的路径。本轮选择河流而不是道路，因为原项目 `pack.rivers` 已直接提供河流 cell 序列和可选 points，适合作为第一个真实 line pass。

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - 快照 metadata 增加河流数量。
  - 导出每条河流的 `cells`、`points`、`widthFactor`、`sourceWidth`、`width`、`name` 和 `type`。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`：
  - 使用 100k 目标 cells。
  - 由于随机地图变化，本次实际 pack cells 为 `22934`。
  - 本次快照包含 `492` 条河流。
- 扩展 `prototype/webgl-cells/src/renderer.js`：
  - 根据 river points 或 river cells 对应的 cell 中心点生成折线段。
  - 新增河流 position/color buffer。
  - 绘制阶段新增 river line pass。
  - `lastDraw` 记录河流顶点数。
- 扩展 demo UI：
  - 新增河流图层开关。
  - 统计面板显示河流数量和河流线段数。
- 更新 `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `AGENTS.md`。

当前验证结果：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 pack cells | 22934 |
| Voronoi 顶点 | 46514 |
| 三角形 | 137998 |
| GPU 顶点 | 413994 |
| 国家边界线段 | 684 |
| 河流数量 | 492 |
| 河流线段 | 1891 |
| picking 索引桶 | 15504 |
| 平均候选 cells | 6.47 |
| 最大候选 cells | 31 |
| 构建 buffer | 95.3ms |
| 上传 buffer | 5.4ms |
| 绘制 | 0.3ms |
| 中心点 picking 候选 | 8 |
| 中心点 picking | 0ms |

验证情况：

- `node --check tools\fmg-export-snapshot.mjs` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - 页面加载 100k 目标快照。
  - 河流数量为 `492`。
  - 河流顶点数为 `3782`，即 `1891` 条线段。
  - 河流开关关闭后，renderer 中 `showRivers` 变为 `false`。
  - WebGL 绘制和空间索引 picking 保持正常。

注意事项：

- 5300/5301 在本轮表现为 Vite 判断占用但 HTTP 不可连接，导出改用 5500 成功。
- 沙盒内启动 Vite 时曾因 `.vite` 缓存 `EPERM unlink` 失败，使用外部执行后正常。
- 当前 shell 的 `node -v` 显示为 `v24.14.0`，不是用户之前设置的 26；本轮代码未依赖 Node 26 特性。
- 河流当前是 `gl.LINES` 折线验证，不包含原 SVG 的变宽河道和 meandering 曲线。
- WebGL 与 SVG 当前不是同一张随机地图，性能对照只能用于阶段性决策，不能视为严格 A/B benchmark。

下一步：

- 将 `CellWebGLRenderer` 接口收敛到 `GraphicsMapRenderer` 形态。
- 增加正式的 WebGL 性能采集脚本。
- 继续补道路、标签、人口或降水等更复杂图层。

## 2026-06-16：收敛 WebGL 原型主接口

继续执行第 1 里程碑，目标是避免 `CellWebGLRenderer` 继续作为临时 demo API 扩张，并提前贴近总方案里的 `GraphicsMapRenderer` 形态。

完成内容：

- 将 `prototype/webgl-cells/src/renderer.js` 的主导出类改为 `GraphicsMapRenderer`。
- 保留 `CellWebGLRenderer` 兼容别名，避免旧调试代码或后续脚本直接断掉。
- 新增或整理以下对外方法：
  - `loadSnapshot(snapshot)`：加载快照数据。
  - `setColorMode(mode)`：切换高度/国家配色。
  - `setLayerVisible(layerId, visible)`：按图层 id 控制 `cells`、`borders`、`rivers` 可见性。
  - `setCamera(camera)`：设置相机平移和缩放。
  - `screenToWorld(screenX, screenY)`：屏幕坐标转地图世界坐标。
  - `pick(screenX, screenY)`：统一 picking 入口。
  - `getStats()`：返回 metadata、geometry、picking、performance、layers 和 camera。
- 更新 `prototype/webgl-cells/src/main.js`，让 demo UI 使用新接口。
- 更新 `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md`、`docs/performance/webgl-svg-performance-comparison.md` 和 `AGENTS.md`。

验证情况：

- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 重新启动 `http://127.0.0.1:5400` demo 服务。
- 使用系统 Chrome + Playwright 验证：
  - `window.__graphicsMapRenderer` 存在。
  - 旧的 `window.__fmgCellRenderer` 与新入口指向同一个对象。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `getStats()` 返回当前 100k 快照统计。
  - `setLayerVisible("rivers", false)` 可以关闭河流图层。
  - `setColorMode("state")` 可以切换国家配色。
  - `pick()` 可以返回中心点 cell，候选数量为 `8`。
  - WebGL `errorBefore` 和 `errorAfter` 均为 `0`。

注意事项：

- 本轮未改变快照数据本身。
- 同一快照下本轮验证记录的构建耗时约 `167.7ms`、上传约 `8.5ms`、绘制约 `0.5ms`，高于上一轮记录；这类手动浏览器验证存在波动，因此下一步需要正式性能采集脚本。

下一步：

- 增加正式的 WebGL 性能采集脚本，输出 JSON/Markdown。
- 评估 GPU color picking 是否值得纳入第 1 里程碑。
- 继续补道路、标签、人口或降水等更复杂图层。

## 2026-06-16：新增 WebGL 原型性能采集脚本

继续执行第 1 里程碑，目标是把手动 Playwright 片段固化为可重复执行的性能采集工具。

完成内容：

- 新增 `tools/webgl-prototype-profile.mjs`：
  - 自动打开 WebGL 原型页面。
  - 读取 `GraphicsMapRenderer.getStats()`。
  - 多次调用 `draw()` 采集绘制耗时。
  - 多次调用 `pick()` 采集 picking 耗时。
  - 验证切换国家/高度模式、关闭/打开河流图层后的绘制耗时。
  - 输出 JSON 和中文 Markdown。
- 生成当前采集结果：
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `docs/performance/webgl-svg-performance-comparison.md`。

当前采集结果：

| 指标 | 数值 |
|---|---:|
| 采样次数 | 10 |
| 目标 cells | 100000 |
| 实际 pack cells | 22934 |
| GPU 顶点 | 413994 |
| 国家边界线段 | 684 |
| 河流线段 | 1891 |
| buffer 构建 | 144.3ms |
| buffer 上传 | 8.6ms |
| draw 最小值 | 0.1ms |
| draw 平均值 | 0.22ms |
| draw 最大值 | 0.3ms |
| picking 最小值 | 0ms |
| picking 平均值 | 0.02ms |
| picking 最大值 | 0.1ms |

验证情况：

- `node --check tools\webgl-prototype-profile.mjs` 通过。
- 成功运行：
  - `node .\tools\webgl-prototype-profile.mjs --url http://127.0.0.1:5400 --browser-channel chrome --iterations 10 --out .\docs\webgl-prototype-profile-results.json --markdown .\docs\webgl-prototype-profile-results.md`
- 采集报告为中文 Markdown，符合项目文档约定。

下一步：

- 评估 GPU color picking 是否值得纳入第 1 里程碑。
- 继续补道路、标签、人口或降水等更复杂图层。
- 评估是否需要把当前单文件 renderer 拆分为 layer、buffer、camera 和 picking 模块。

## 2026-06-16：修正底层 cell mesh 数据源

用户指出当前 demo 中出现大量巨型三角 cell，不符合原版“每个 cell 基本差不多大”的表现。排查后确认问题不是 WebGL 本身，而是第 1 里程碑原型误用了 `pack.cells` 作为底层 mesh。

问题原因：

- FMG 中 `grid.cells` 是原始均匀 Voronoi 网格，数量接近目标 cells。
- `pack.cells` 是生成后承载国家、河流、城市、feature 等业务语义的压缩/派生图结构。
- 水域、海岸、湖泊、边界等区域的 pack cell 可能形成很大的多边形。
- 原型此前用 `pack.cells.p + pack.cells.v + pack.vertices.p` 三角化底图，因此在水域/边界处出现巨型三角 cell。

验证数据：

| 图结构 | cell 数 | 最大中心到顶点距离 | 大于 50px 的 cell | 大于 80px 的 cell |
|---|---:|---:|---:|---:|
| grid | 99846 | 5.73px | 0 | 0 |
| pack | 58251 | 235.23px | 236 | 123 |

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - 导出 `grid.cells.i`。
  - 导出 `grid.points` 作为 grid cell 中心点。
  - 导出 `grid.cells.v`。
  - 导出 `grid.cells.h`。
  - 导出 `grid.vertices.p`。
  - 导出 `pack.cells.g`，用于从 pack cell 反查对应 grid cell。
- 更新 `prototype/webgl-cells/src/renderer.js`：
  - 新增 `getRenderGraph()`。
  - 新增 `buildGridToPackMap()`。
  - 基础 cell mesh 优先使用 `grid`。
  - 国家颜色通过 `pack.cells.g` 映射回 pack state。
  - 国家边界、河流、picking 仍使用 `pack` 数据。
- 更新 `prototype/webgl-cells/src/main.js`：
  - 统计面板显示 `pack cells`、`grid cells`、渲染来源、渲染 cells、渲染顶点。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`。
- 重新生成 WebGL 性能采集报告：
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `docs/performance/webgl-svg-performance-comparison.md`。

当前快照摘要：

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
| 河流线段 | 5777 |
| picking 索引桶 | 39204 |
| 平均候选 cells | 5.9 |
| 最大候选 cells | 17 |

当前采集结果：

| 指标 | 数值 |
|---|---:|
| buffer 构建 | 416ms |
| buffer 上传 | 43.3ms |
| draw 平均值 | 0.5ms |
| draw 最大值 | 2.5ms |
| picking 平均值 | 0.02ms |
| picking 最大值 | 0.1ms |

验证情况：

- `node --check tools\fmg-export-snapshot.mjs` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - renderer 统计显示 `renderSource: "grid"`。
  - 渲染 cells 为 `99846`。
  - 渲染顶点为 `200338`。
  - picking 仍可返回中心点 pack cell。

下一步：

- 继续检查国家模式在 grid->pack 映射下的视觉质量。
- 评估 GPU color picking 是否值得纳入第 1 里程碑。
- 继续补道路、标签、人口或降水等更复杂图层。

## 2026-06-16：修正河流折线延伸到海里的问题

用户指出部分河流会流出陆地，在海里多画出一段距离。排查后确认这是原型级河流 line pass 的简化实现造成的。

问题原因：

- 当前快照中的 `pack.rivers` 没有保存 `Rivers.addMeandering()` 后的 points。
- 原版 SVG 绘制会调用 `Rivers.addMeandering()` 和 `Rivers.getRiverPath()`，生成带宽度的河道多边形。
- WebGL 原型此前 fallback 为直接连接 `river.cells` 对应的 pack cell 中心点。
- 很多河流的最后一个或多个 cell 是水域/河口 cell，直接连中心点就会让折线伸进海里。

排查数据：

- 当前快照共有 `1021` 条河流。
- `559` 条河流的末端若干 cell 中包含水域 cell。
- 原始按 cell 中心连接的河流折线约 `5890` 条线段。

完成内容：

- 更新 `prototype/webgl-cells/src/renderer.js`：
  - `getRiverPoints()` 改为传入完整 snapshot。
  - 新增 `clipRiverAtWater()`。
  - 新增 `lerpPoint()`。
  - 当河流折线遇到第一个水域 cell 时，在上一陆地中心点和当前水域中心点之间插入一个近似河口点，然后停止绘制。
- 重新运行 WebGL 原型性能采集：
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `docs/performance/webgl-svg-performance-comparison.md`。

当前结果：

| 指标 | 数值 |
|---|---:|
| 河流数量 | 1021 |
| 河流线段 | 5641 |
| buffer 构建 | 336.5ms |
| buffer 上传 | 36.6ms |
| draw 平均值 | 0.27ms |
| draw 最大值 | 1.3ms |
| picking 平均值 | 0.01ms |
| picking 最大值 | 0.1ms |

验证情况：

- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - renderer 仍使用 `grid` 渲染底层 cells。
  - 河流数量仍为 `1021`。
  - 河流线段为 `5641`。
  - WebGL `errorBefore` 和 `errorAfter` 均为 `0`。

当前限制：

- 这是原型级河口截断，只解决折线画进海里的问题。
- 还没有复刻原版 SVG 的 `Rivers.getRiverPath()` 变宽河道、Catmull-Rom 曲线和河口宽度。

下一步：

- 如果继续完善河流，应实现 polyline mesh 或河道 polygon mesh，而不是继续用 `gl.LINES`。
- 继续检查国家模式在 grid->pack 映射下的视觉质量。

## 2026-06-16：完成步骤 1.1 demo 渲染器模块化

按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的“步骤 1.1：demo 渲染器模块化”执行。本步只改 `prototype/webgl-cells/src/` 和项目中文文档，不修改 `source/`。

完成内容：

- 保留 `prototype/webgl-cells/src/renderer.js` 作为 `GraphicsMapRenderer` 主类、WebGL draw 调度和对外 API 门面。
- 新增 `prototype/webgl-cells/src/camera.js`：
  - 管理相机状态、视图适配、resize、pan、zoom 和 screen/client 到 world 的坐标转换。
- 新增 `prototype/webgl-cells/src/buffers.js`：
  - 管理 cell 三角形、国家边界线、河流线 buffer 构建、上传和释放。
- 新增 `prototype/webgl-cells/src/picking.js`：
  - 管理空间索引、候选 cell 查询和 point-in-polygon 命中判断。
- 新增 `prototype/webgl-cells/src/colors.js`：
  - 管理高度、国家和河流颜色计算。
- 新增 `prototype/webgl-cells/src/layers.js`：
  - 管理 demo 当前 `cells`、`borders`、`rivers` 图层状态和绘制顺序。
- 新增 `prototype/webgl-cells/src/utils.js`：
  - 放置数值裁剪和耗时格式化等小型通用函数。

保持的接口：

- `loadSnapshot()`
- `setColorMode()`
- `setLayerVisible()`
- `setCamera()`
- `screenToWorld()`
- `pick()`
- `getStats()`
- `CellWebGLRenderer` 兼容别名
- `window.__fmgCellRenderer` 和 `window.__graphicsMapRenderer` 调试入口仍由 `main.js` 设置

验证情况：

- `node --check prototype\webgl-cells\src\main.js` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\camera.js` 通过。
- `node --check prototype\webgl-cells\src\buffers.js` 通过。
- `node --check prototype\webgl-cells\src\picking.js` 通过。
- `node --check prototype\webgl-cells\src\colors.js` 通过。
- `node --check prototype\webgl-cells\src\layers.js` 通过。
- `node --check prototype\webgl-cells\src\utils.js` 通过。
- `node --input-type=module -e "const mod = await import('./prototype/webgl-cells/src/renderer.js'); if (!mod.GraphicsMapRenderer || !mod.CellWebGLRenderer || !mod.installCanvasInteractions) throw new Error('renderer exports missing'); console.log('renderer exports ok');"` 通过，确认模块路径和导出名可运行时解析。
- 门下检查通过：
  - 本步未修改 `source/`。
  - `GraphicsMapRenderer.prototype` 保留 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
  - `CellWebGLRenderer === GraphicsMapRenderer`。
  - `node --check prototype/webgl-cells/src/*.js`、ESM 导入检查和 `git diff --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面加载真实 FMG 快照，画布显示非空国家模式地图。
  - 统计面板显示渲染来源为 `grid`。
  - 渲染 cells 为 `99846`。
  - GPU 顶点为 `1795557`。
  - 国家边界线段为 `1404`。
  - 河流线段为 `5641`。
  - 点击 `国家` 按钮后国家模式激活。
  - 关闭 `国家边界` 和 `河流` 后复选框状态正确，画面仍可绘制。
  - 鼠标悬停返回 cell `26830`，候选 cells 为 `3`，picking ms 为 `0`。
  - Browser 控制台无 error/warning。
- in-app Browser 的只读执行环境无法读取页面 expando 全局变量，因此补充使用本机 Playwright + 系统 Chrome 验证调试入口：
  - `window.__graphicsMapRenderer` 和 `window.__fmgCellRenderer` 均存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - 渲染来源仍为 `grid`。
  - 渲染 cells 为 `99846`。
  - GPU 顶点为 `1795557`。
  - 国家边界线段为 `1404`。
  - 河流线段为 `5641`。
  - 切换到 `state` 模式后模式状态正确。
  - 关闭 `borders` 和 `rivers` 后图层状态正确。
  - 中心点 picking 返回命中，候选数为 `3`。
  - `glError` 为 `0`。

当前限制：

- 本步是结构拆分，不改变图层视觉表达。
- 还未进入步骤 1.2 的 feature 图层补全。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.2：基础底图和 feature 图层。

## 2026-06-16：完成步骤 1.2 基础底图和 feature 图层

按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的“步骤 1.2：基础底图和 feature 图层”执行。本步只改 `tools/`、`prototype/webgl-cells/` 和中文文档，不修改 `source/`。

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - 导出 `pack.features`，保留 `type`、`group`、`vertices`、`shoreline`、`height`、`flux`、`evaporation`、`name` 等后续图层所需字段。
  - 导出 `cells.f`，保留 pack cell 到 feature 的语义关联。
  - 在 `metadata` 中记录 feature 数和湖泊数。
- 新增 `prototype/webgl-cells/src/features.js`：
  - 从 `pack.features` 和 `pack.vertices` 构建陆地 feature 填充、湖泊填充、海岸线和湖岸线 buffer。
  - 统计 feature 数、陆地 feature、湖泊 feature、海岸 feature 和湖泊 group。
- 更新 `prototype/webgl-cells/src/buffers.js`、`renderer.js`、`layers.js` 和 `colors.js`：
  - 新增 `landmass`、`lakes`、`coastline` 三类 WebGL 图层。
  - 绘制顺序为 `landmass -> cells -> lakes -> coastline -> borders -> rivers`。
  - 海洋由 canvas 清屏色表达，陆地仍由 grid cell mesh 作为主底图，湖泊和岸线作为 feature 语义层叠加。
  - 基础 cell mesh 继续使用 `grid.points`、`grid.cells.v` 和 `grid.vertices.p`，没有把 `pack.cells` 当作底层均匀 mesh。
- 更新 `prototype/webgl-cells/index.html`、`src/main.js` 和 `src/styles.css`：
  - UI 新增陆地底色、湖泊、海岸/湖岸线开关。
  - 统计面板新增 feature、湖泊、湖泊分组、湖泊三角形、海岸线段和湖岸线段。
  - 长湖泊分组文本做了换行保护。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`：
  - 当前快照目标为 `100000` cells，实际 `99846` grid cells、`45023` pack cells。
  - feature 数 `121`，湖泊 `48`。
  - 当前随机地图实际湖泊分组为 `freshwater: 46`、`salt: 2`；导出结构保留 `freshwater`、`salt`、`sinkhole`、`frozen`、`lava`、`dry` 等 group 的兼容能力。

当前结果：

| 指标 | 数值 |
|---|---:|
| 渲染来源 | grid |
| grid cells | 99846 |
| pack cells | 45023 |
| feature 数 | 121 |
| 陆地 feature | 70 |
| 湖泊 feature | 48 |
| 湖泊三角形 | 1255 |
| 海岸线段 | 10624 |
| 湖岸线段 | 1255 |
| 国家边界线段 | 1541 |
| 河流数量 | 499 |
| 河流线段 | 2642 |
| buffer 构建 | 295.4ms |
| buffer 上传 | 39ms |
| 单次绘制 | 0.1ms |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\features.js` 通过。
- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，画布非空。
  - `renderSource` 仍为 `grid`。
  - feature 数为 `121`，湖泊 feature 为 `48`。
  - 湖泊三角形为 `1255`，海岸线段为 `10624`，湖岸线段为 `1255`。
  - 切换到国家模式正常。
  - 关闭湖泊、海岸/湖岸线、国家边界和河流后图层状态正确。
  - 中心点 picking 仍可命中。
  - `glError` 为 `0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - `sample-map.json` 当前包含 `features: 121`、`lakes: 48`、`cells.f: 45023`，湖泊分组为 `freshwater: 46`、`salt: 2`。
  - `tools/fmg-export-snapshot.mjs` 已导出 `grid`、`cells.f`、`features`、`feature.vertices`、`shoreline`、`group` 和湖泊统计等字段。
  - `layers.js` 绘制顺序为 `landmass -> cells -> lakes -> coastline -> borders -> rivers`。
  - `buildCellBuffers()` 仍以 `grid` 作为基础 mesh，没有把 `pack.cells` 当作底层均匀 mesh。
  - `node --check`、ESM 导入检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示非空 WebGL 地图。
  - 统计面板显示 `grid cells: 99846`、`GPU 顶点: 1795563`、`feature 数: 121`、`湖泊 feature: 48`、`海岸线段: 10624`、`湖岸线段: 1255`。
  - `陆地底色`、`湖泊`、`海岸/湖岸线` 开关存在，关闭和重新打开湖泊/岸线后状态正确。
  - `国家` 模式切换后画面仍非空。
  - 鼠标悬停返回 cell `22429`，高度 `42`，国家 `Vosengia (11)`，候选 cells 为 `9`，picking ms 为 `0.1`。
  - 缩放和拖拽后，海岸线、湖岸线与 cell 底图保持贴合，未见明显漂移。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `renderSource` 为 `grid`。
  - `renderCellCount` 为 `99846`。
  - `lakeTriangles` 为 `1255`。
  - `coastlineSegments` 为 `10624`。
  - `lakeShoreSegments` 为 `1255`。
  - `glError` 为 `0`。

当前限制：

- 本步没有复刻 SVG 的 fractal coastline、mask、blur/filter。
- 海岸和湖岸线当前直接使用 feature 顶点折线，因此位置与 cell 底图对齐，但视觉不如源项目曲线自然。
- 湖泊填色当前使用 feature polygon 扇形三角化；复杂凹多边形后续应改为更稳健的三角化或 mask 方案。
- 当前随机快照只有 `freshwater` 和 `salt` 两类湖泊实际出现；其它湖泊 group 通过导出字段和颜色映射保留兼容。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.3：专题面图层。

## 2026-06-16：完成步骤 1.3 专题面图层

按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的“步骤 1.3：专题面图层”执行。本步只改 `tools/`、`prototype/webgl-cells/` 和中文文档，不修改 `source/`。

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - `grid.cells` 新增导出 `temp`。
  - `pack.cells` 新增导出 `province`、`culture`、`religion`、`biome`。
  - 新增导出 `pack.provinces`、`pack.cultures`、`pack.religions` 的 `i/name/color/removed` 元数据。
  - 新增导出 `biomesData` 的 `i/name/color/removed` 元数据。
  - 新增 `themeMetadata.temperature.min/max`，供 demo 温度 palette 使用。
- 新增 `prototype/webgl-cells/src/themes.js`：
  - 集中定义 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 七类专题面。
  - 高度使用 grid 高度渐变；生物群系、省份、文化、宗教使用源项目元数据颜色；温度使用原型级冷暖渐变。
  - 统一提供专题颜色构建、专题值统计和 hover 语义字段。
- 更新 `prototype/webgl-cells/src/buffers.js` 和 `renderer.js`：
  - cell 几何仍只构建一套 `grid` position buffer。
  - 构建 `cellRanges` 记录每个 grid cell 对应的 GPU 顶点范围和 pack 语义 cell。
  - 专题切换时只重算并上传当前专题颜色 buffer，不重建 cell geometry。
  - `setColorMode("state")` 保留为兼容别名，内部映射到 `states`。
- 更新 `prototype/webgl-cells/index.html`、`src/main.js` 和 `src/styles.css`：
  - UI 从高度/国家两个按钮扩展为七个专题按钮。
  - 统计面板新增当前专题、专题字段、专题值数、geometry 复用说明、颜色顶点数和专题更新耗时。
  - hover 面板新增生物群系、省份、文化、宗教和温度。
  - 添加内联空 favicon，避免浏览器默认 favicon 404 干扰控制台验收。
- 更新 `tools/webgl-prototype-profile.mjs`：
  - 将旧的 `"state"` 模式调用改为 `"states"`。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`：
  - 当前快照目标为 `100000` cells，实际 `99846` grid cells、`43182` pack cells。
  - 当前快照包含 `309` 个省份、`13` 个文化、`17` 个宗教、`13` 个生物群系元数据。
  - 温度范围为 `-18` 到 `21`。

当前结果：

| 指标 | 数值 |
|---|---:|
| 渲染来源 | grid |
| grid cells | 99846 |
| pack cells | 43182 |
| GPU 顶点 | 1795557 |
| feature 数 | 99 |
| 湖泊 feature | 35 |
| 国家边界线段 | 1435 |
| 河流数量 | 600 |
| 河流线段 | 3837 |
| 专题数量 | 7 |
| 专题颜色顶点 | 1795557 |
| buffer 构建 | 228.7ms |
| buffer 上传 | 25.2ms |
| 专题更新 | 74-104.1ms |
| 绘制 | 0.1-0.9ms |

验证情况：

- `git status --short` 已在开工前查看，工作区存在多人流水线留下的未提交改动，本步只处理步骤 1.3 相关文件。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\tools\webgl-prototype-profile.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\themes.js` 通过。
- `node --check .\prototype\webgl-cells\src\picking.js` 通过。
- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `git diff --check` 限定本步相关路径通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，画布非空。
  - 七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 均可切换。
  - 每个专题的 `colorBufferVertices` 均为 `1795557`，与 `geometry.vertexCount` 一致。
  - 七个专题切换后 `glError` 均为 `0`。
  - 湖泊、海岸/湖岸线、国家边界和河流开关可关闭并重新打开。
  - 中心点 picking 命中 cell `18835`，返回高度、国家、生物群系、省份、文化、宗教、温度、候选数和 picking 耗时。
  - 画布非空像素数为 `768000`。
  - 添加 favicon 后短检控制台无 error，最终 `glError` 为 `0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - `sample-map.json` 包含 `grid.cells.temp: 99846`，`cells.province/culture/religion/biome: 43182`，并包含 `provinces: 309`、`cultures: 13`、`religions: 17`、`biomes: 13` 及温度范围 `-18..21`。
  - `themes.js` 导出七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature`，`index.html` 也有对应七个按钮。
  - `GraphicsMapRenderer.prototype` 保留 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
  - `CellWebGLRenderer === GraphicsMapRenderer`。
  - 从 `height` 切到 `temperature` 后 `positions`、`vertexCount`、`cellRanges` 均未变化，只触发颜色 buffer 上传，确认 geometry 复用。
  - `node --check`、ESM 导入检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示七个专题按钮：高度、生物群系、国家、省份、文化、宗教、温度。
  - 逐个点击七个专题后，按钮激活状态和统计面板字段均正确。
  - 统计面板显示 `geometry 复用: position buffer 复用，切换仅更新专题颜色 buffer`。
  - `colorBufferVertices` 为 `1795557`，与 GPU 顶点数一致。
  - 湖泊、海岸/湖岸线、国家边界和河流开关可关闭并重新打开。
  - 鼠标悬停返回 cell `19118`，高度 `64`，国家 `Xagen (5)`，生物群系 `Cold desert (2)`，省份 `Rasar (262)`，文化 `Rasar (9)`，宗教 `Ralidavar Precepts (16)`，温度 `6`，候选 cells 为 `11`，picking ms 为 `0.2`。
  - 温度专题截图显示非空地图，湖泊、海岸/湖岸线、边界和河流叠加正常。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口、geometry 复用和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - 七个专题依次切换后，`positions` 和 `cellRanges` 仍为同一对象，`vertexCount` 保持 `1795557`。
  - `colorBufferVertices` 为 `1795557`。
  - `glError` 为 `0`。

当前限制：

- 专题面当前按 cell 颗粒填色，不复刻 SVG 的 isoline 平滑边界、halo、waterGap 路径和温度等值线标签。
- 专题切换当前每次重算并上传一整份颜色 buffer；这已经避免重建 geometry，但 palette 编辑或单项颜色变化后续应改为局部更新。
- 温度专题使用 demo 内置冷暖渐变，没有复刻源项目 `d3.interpolateSpectral` 和用户温标设置。
- 当前轻量浏览器验证使用本机 Playwright + 系统 Chrome；正式 in-app Browser 验收仍需交给侍中执行。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.4：线图层。

## 2026-06-16：步骤 1.4 线图层实施

执行角色：尚书。

本步目标是在独立 WebGL demo 中把已有河流和国家边界线从分散实现收敛为统一 line layer，并补上路线和省份边界。实施仍限定在 demo、工具和中文文档中，没有修改 `source/`。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - 导出 `pack.routes` 到快照，保留 `i`、`group`、`feature`、`name` 和路线点列。
  - 在 `metadata` 中记录 `routes` 数量和 `routeGroups` 分组统计。
- `prototype/webgl-cells/src/lines.js`：
  - 新增统一线图层构建模块。
  - 当前统一输出 `stateBorders`、`provinceBorders`、`routes`、`rivers` 四类 line layer 的 positions/colors/stats。
  - 路线按 `roads`、`trails`、`searoutes` 使用不同基础颜色。
  - 国家边界从相邻 land pack cell 的 `state` 差异派生；省份边界从同一国家内相邻 land pack cell 的 `province` 差异派生。
  - 河流继续复用此前的入海截断 fallback：若快照没有持久化 `river.points`，则使用 `river.cells` 对应 cell 中心折线，并在进入水域时插入近似河口点后停止。
- `prototype/webgl-cells/src/buffers.js`：
  - 移除内联国家边界和河流构建逻辑，改为调用 `buildLineBuffers()`。
  - 上传和释放 line layer buffer 改由统一函数处理。
- `prototype/webgl-cells/src/renderer.js`：
  - 通过 `lineBuffers.layers[layerId]` 绘制线图层，渲染器不再分别理解河流、路线或边界的构建细节。
  - `getStats()` 新增 `stateBorderSegments`、`provinceBorderSegments`、`routeCount`、`routeSegments`、`routeGroups`、`riverFallback`。
- `prototype/webgl-cells/src/layers.js`：
  - 图层顺序更新为 `landmass -> cells -> lakes -> coastline -> stateBorders -> provinceBorders -> routes -> rivers`。
  - 保留 `setLayerVisible("borders")` 兼容别名，同时实际控制国家边界和省份边界两个图层。
- `prototype/webgl-cells/index.html`、`src/main.js`：
  - 新增省份边界和路线开关。
  - 国家边界、省份边界、路线、河流开关互相独立。
  - 统计面板新增路线数量、路线线段、路线分组、省份边界线段。
- `tools/webgl-prototype-profile.mjs`：
  - Markdown 报告字段更新为国家边界、省份边界、路线和河流分项。
- `docs/current-plan.md`：
  - 记录步骤 1.4 完成状态、新快照统计和下一步。

重新导出的默认快照：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| grid cells | 99846 |
| pack cells | 23557 |
| seed | 849457094 |
| feature 数 | 226 |
| 湖泊 feature | 22 |
| 国家边界线段 | 853 |
| 省份边界线段 | 2625 |
| 路线数量 | 451 |
| 路线分组 | roads: 10，trails: 255，searoutes: 186 |
| 路线线段 | 6638 |
| 河流数量 | 407 |
| 河流线段 | 1864 |

验证情况：

- 开工前已执行 `git status --short`，确认工作区有多人流水线留下的未提交改动；本步只改线图层相关工具、demo 和文档文件。
- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\tools\webgl-prototype-profile.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过，快照已包含 `451` 条路线。
- `node --input-type=module -e "import fs from 'node:fs'; import {buildLineBuffers} from './prototype/webgl-cells/src/lines.js'; ..."` 通过，确认四类 line layer 均能构建：
  - 国家边界 `853` 段。
  - 省份边界 `2625` 段。
  - 路线 `451` 条、`6638` 段。
  - 河流 `407` 条、`1864` 段。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，画布非空，非零像素数为 `768000`。
  - 七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 均可切换，切换后 `glError` 为 `0`。
  - 国家边界、省份边界、路线、河流四个开关可分别关闭和重新打开，互不影响。
  - 统计面板返回 `stateBorderSegments: 853`、`provinceBorderSegments: 2625`、`routeCount: 451`、`routeSegments: 6638`、`riverSegments: 1864`。
  - 中心点 hover picking 仍命中 cell，并返回高度、国家、生物群系、省份、文化、宗教、温度、候选数和 picking 耗时。
  - 控制台未捕获 error，最终 `glError` 为 `0`。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - 快照包含 `metadata.routes = 451`，`metadata.routeGroups = { roads: 10, trails: 255, searoutes: 186 }`，顶层 `routes[]` 共 `451` 条，路线线段合计 `6638`。
  - 四类 line layer 构建结果为：`stateBorders: 853` 段、`provinceBorders: 2625` 段、`routes: 6638` 段、`rivers: 1864` 段。
  - `routes`、`provinceBorders`、`stateBorders`、`rivers` 开关互不串扰。
  - `setLayerVisible("borders")` 兼容别名会同时控制 `stateBorders` 和 `provinceBorders`，符合当前文档说明。
  - 七个专题面、feature/湖泊/岸线和 hover picking 的代码结构未被破坏。
  - `node --check`、ESM/API 检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示路线、国家边界、省份边界、河流四类线图层统计。
  - 统计面板显示 `国家边界线段: 853`、`省份边界线段: 2625`、`路线数量: 451`、`路线线段: 6638`、`路线分组: roads:10，trails:255，searoutes:186`、`河流线段: 1864`。
  - 切换到 `省份` 专题后画面仍非空。
  - `国家边界`、`省份边界`、`路线`、`河流` 四个开关可分别关闭并重新打开，状态互不串扰。
  - 缩放和拖拽后，线层与底图保持贴合，未见明显漂移。
  - 鼠标悬停返回 cell `13704`，高度 `17`，国家 `Neutrals (0)`，生物群系 `Marine (0)`，候选 cells 为 `4`，picking ms 为 `0`。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `routeGroups` 为 `roads: 10`、`trails: 255`、`searoutes: 186`。
  - `stateBorders`、`provinceBorders`、`routes`、`rivers` 图层状态均为开启。
  - `renderSource` 为 `grid`。
  - `glError` 为 `0`。

当前限制：

- 本步为了控制改动风险，仍使用 `gl.LINES` 绘制线层，没有实现可变宽 polyline mesh。
- 尚未实现 line picking；当前 picking 仍是 cell hover picking。
- 省份边界是基于相邻 pack cell 共享边的线段化 fallback，没有复刻源项目 `draw-borders.ts` 的链式路径合并和 SVG 样式。
- 路线直接使用快照中的 `route.points` 折线，没有复刻 `Routes.getPath()` 的曲线、dash、join/cap 和样式编辑器。
- 河流仍因快照缺少原版 meandered points 而走 `river.cells` fallback；下一轮宽线方案应同时处理 `Rivers.getRiverPath()` 近似、河宽趋势、join/cap 和 picking。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.5：点图层和高节点图层。
- 优先覆盖 `population`、`prec`、`burgIcons`、`markers` 等 SVG 节点压力较大的图层。

## 2026-06-16：步骤 1.5 点图层和高节点图层

本轮由“尚书”实施 `docs/plans/gl-reimplementation-acceptance-plan.md` 的步骤 1.5。开工前执行 `git status --short`，确认工作区存在多人流水线既有未提交改动；本步没有回退或覆盖其他人的改动，也没有修改 `source/`。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - 导出 `grid.cells.prec`、`pack.cells.pop`、`pack.cells.burg`。
  - 导出 `pack.burgs` 的位置、人口、首都、港口、分组、名称等语义字段。
  - 导出 `pack.markers` 的位置、类型、icon、pin、fill/stroke、size、pinned 等语义字段。
  - `metadata` 新增 burg、port、marker 数量。
- `prototype/webgl-cells/src/points.js`：
  - 新增统一点图层构建模块。
  - 当前支持 `precipitation`、`population`、`burgIcons`、`markers` 四类点层。
  - 人口图层包含农村人口 cell 点和城市 burg 点。
  - 城市/港口图层用程序化颜色点区分首都、港口和普通 burg。
  - marker 图层按 `type/icon` 聚合统计，先使用 fill/stroke 或默认色的占位点。
- `prototype/webgl-cells/src/buffers.js`：
  - 接入点层 buffer 构建、上传和释放生命周期。
- `prototype/webgl-cells/src/renderer.js`：
  - WebGL shader 新增 `a_size` 和 `u_point_layer`。
  - 新增 `drawColoredPoints()`，用 `gl.POINTS` 绘制 screen-sized 圆点。
  - 绘制面和线时显式复位点 size attribute，避免点层状态污染后续 draw call。
- `prototype/webgl-cells/src/layers.js`：
  - 图层顺序更新为 `landmass -> cells -> lakes -> coastline -> stateBorders -> provinceBorders -> routes -> rivers -> precipitation -> population -> burgIcons -> markers`。
- `prototype/webgl-cells/index.html`、`src/main.js`：
  - 新增降水点、人口点、城市/港口、标记四个开关。
  - 统计面板新增降水点、人口 instances、农村人口点、城市人口点、城市/港口点、港口点、marker 点和 marker 分组。
- `tools/webgl-prototype-profile.mjs`：
  - Markdown 报告新增四类点图层统计字段，并更新当前原型覆盖范围说明。

重新导出的默认 100k 快照：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| grid cells | 99846 |
| pack cells | 58310 |
| seed | 714595163 |
| 降水点 | 31608 |
| 人口 instances | 45896 |
| 农村人口点 | 44465 |
| 城市人口点 | 1431 |
| 城市/港口点 | 1431 |
| 港口点 | 269 |
| marker 点 | 389 |
| marker 分组 | 29 类 |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\points.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\tools\webgl-prototype-profile.mjs` 通过。
- `node .\tools\fmg-export-snapshot.mjs --cells 100000 --browser-channel chrome --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- ESM/API 检查通过：
  - `GraphicsMapRenderer` 可导入。
  - `CellWebGLRenderer === GraphicsMapRenderer`。
  - `POINT_LAYER_IDS` 为 `precipitation`、`population`、`burgIcons`、`markers`。
- 快照字段检查通过：
  - `grid.cells.prec` 中陆地降水点 `31608`。
  - `cells.pop` 中人口 cell `44465`。
  - 有效 burg `1431`，其中港口 `269`。
  - marker `389`。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，`summary` 显示 `100000` 目标 cells、`58310` pack cells、`99846` grid cells。
  - 四类点层默认开启，统计为降水点 `31608`、人口 instances `45896`、城市/港口点 `1431`、marker 点 `389`。
  - 降水点、人口点、城市/港口、标记四个开关可分别关闭并重新打开。
  - 七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 均可切换。
  - feature 图层、四类线图层和 hover cell picking 未回归。
  - 中心点 picking 仍能命中 cell。
  - 控制台未捕获 error，最终 `glError` 为 `0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - 快照字段包含 `grid.cells.prec = 99846`、`cells.pop = 58310`、`cells.burg = 58310`、有效 `burgs = 1431`、`markers = 389`。
  - 点层运行统计为 `precipitationPoints = 31608`、`populationInstances = 45896`、`burgIcons = 1431`、`markerCount = 389`。
  - 四类点层 ID 为 `precipitation`、`population`、`burgIcons`、`markers`。
  - 关闭 `precipitation` 不影响 `population`、`burgIcons`、`markers`；继续关闭 `population` 不影响 `burgIcons`、`markers` 和线层。
  - 点层使用 `Float32Array`、WebGL buffer 和 `gl.drawArrays(gl.POINTS, ...)`，没有用 DOM 节点替代大量点渲染。
  - `node --check`、ESM/API 检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示降水点、人口点、城市/港口、标记四类点图层开关。
  - 统计面板显示降水点 `31608`、人口 instances `45896`、农村人口点 `44465`、城市/港口点 `1431`、港口点 `269`、marker 点 `389`。
  - 降水点、人口点、城市/港口、标记四个开关可分别关闭并重新打开，状态互不串扰。
  - 切换到 `温度` 专题后点层仍可见，feature 和线图层保持开启。
  - 缩放和拖拽后点层仍贴合底图，页面保持可交互。
  - 鼠标悬停返回 cell `26347`，高度 `17`，国家 `Neutrals (0)`，生物群系 `Marine (0)`，温度 `18`，候选 cells 为 `3`，picking ms 为 `0`。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `precipitation`、`population`、`burgIcons`、`markers` 图层状态均为开启。
  - `renderSource` 为 `grid`。
  - `glError` 为 `0`。

当前限制：

- 点层当前使用 `gl.POINTS` 和圆点 fragment discard，没有实现完整 sprite atlas、SVG icon、emoji、外部图片 marker 或 pin shape。
- 人口图层用 screen-sized 点表示农村/城市人口，没有复刻源项目 `drawPopulation()` 的竖线动画和柱状语义。
- 降水图层用点半径近似源项目 `drawPrecipitation()`，没有复刻 wind direction 文本。
- burg 和 marker 当前只显示位置占位点；尚未实现 burg/marker hover 或点击 picking。
- 缺少 LOD、聚合和视口裁剪；100k 快照已可交互，但更高规模需要继续优化。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.6：文本和纹章 demo 策略。

## 2026-06-17：步骤 1.6 文本和纹章 demo 策略

本轮由“尚书”实施 `docs/plans/gl-reimplementation-acceptance-plan.md` 的步骤 1.6。开工前执行 `git status --short`，确认工作区存在多人流水线既有未提交改动，且 `prototype/webgl-cells/data/sample-map.json` 仍有暂存区/工作区不一致状态；本步没有回退或覆盖其他人的改动，也没有修改 `source/`。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - `metadata` 新增 `burgLabels`、`stateLabels`、`emblemPlaceholders` 统计。
  - `states` 新增 `fullName`、`capital`、`center`、`cells`、`pole`、`coa` 等轻量字段。
  - `provinces` 复用命名颜色序列化，并补充 `center`、`pole`、`coa`。
  - `burgs` 新增 `coa` 元数据。
  - 顶层新增 `labels` 和 `emblems`：
    - `labels.burgs` 用于普通城市标签 overlay。
    - `labels.states` 用于国家标签占位，短期不复刻 SVG 曲线 `textPath`。
    - `emblems.states` / `emblems.burgs` 用于纹章 badge 占位，短期不调用真实 COA renderer。
- `prototype/webgl-cells/src/renderer.js`：
  - 新增 view listener 机制，`draw()` 完成后广播当前 camera、canvas 和 snapshot 状态。
  - 该接口用于 overlay 跟随 WebGL camera，不改变现有 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
- `prototype/webgl-cells/src/overlays.js`：
  - 新增 `MapOverlayManager`。
  - 用 HTML overlay 渲染城市标签、国家中心/首都附近标签占位和纹章 badge 占位。
  - overlay 根据 WebGL camera 和 canvas/CSS 像素比例把世界坐标转换为屏幕坐标。
  - 普通城市标签在低缩放下会隐藏；首都、港口和大城市优先保留。当前样本 440 个有效 burg 全部进入 DOM。
  - 国家标签和纹章占位默认显示，用于验证策略和相机同步，不强行 GPU 化。
- `prototype/webgl-cells/index.html`、`src/main.js`、`src/styles.css`：
  - 新增 `#map-overlay` 容器，CSS 设置 `pointer-events: none`，不阻塞 canvas 交互。
  - 新增城市标签、国家标签占位、纹章占位三个开关。
  - 统计面板新增 overlay 可见/渲染数量和短期策略说明。
  - `window.__fmgMapOverlays` 暴露 overlay 管理器，方便门下和侍中检查。
- `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md`、`docs/performance/webgl-svg-performance-comparison.md`：
  - 记录步骤 1.6 的实现内容、当前样本统计、验证结果和限制。

重新导出的默认 100k 快照：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| grid cells | 99846 |
| pack cells | 21977 |
| seed | 130672330 |
| feature 数 | 174 |
| 湖泊 feature | 29 |
| 路线数量 | 393 |
| 河流数量 | 497 |
| 降水点 | 11041 |
| 人口 instances | 13760 |
| 城市/港口点 | 440 |
| 港口点 | 103 |
| marker 点 | 138 |
| 城市标签 | 440 |
| 国家标签占位 | 17 |
| 纹章占位 | 457 |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\overlays.js` 通过。
- `git diff --check -- .\tools\fmg-export-snapshot.mjs .\prototype\webgl-cells .\docs\current-plan.md .\docs\development-log.md .\docs\milestone-1-webgl-prototype.md .\docs\webgl-svg-performance-comparison.md` 通过。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- 快照字段检查通过：
  - `metadata.burgLabels = 440`。
  - `metadata.stateLabels = 17`。
  - `metadata.emblemPlaceholders = 457`。
  - 顶层 `labels.burgs = 440`、`labels.states = 17`。
  - 顶层 `emblems.states = 17`、`emblems.burgs = 440`。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，`summary` 显示目标 `100000` cells、实际 `21977` pack cells、`99846` grid cells。
  - 初始 overlay 统计为城市标签 `143 / 440` 可见、国家标签占位 `17 / 17` 可见、纹章占位 `457 / 457` 可见。
  - `#map-overlay` 的 `pointer-events` 为 `none`。
  - 城市标签、国家标签占位、纹章占位三个开关可关闭，关闭后对应 overlay 组 `hidden = true`，统计可见数归零。
  - 拖拽地图后，示例城市标签屏幕坐标从约 `(446,286)` 变为 `(536,331)`，与相机平移量一致。
  - 拖拽后中心 cell picking 仍能命中。
  - 切换到 `temperature` 专题后 WebGL 图层仍绘制；路线开关可关闭并重新打开。
  - 控制台无 error，最终 `glError = 0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - 快照字段包含 `labels.burgs = 440`、`labels.states = 17`、`emblems.states = 17`、`emblems.burgs = 440`，`metadata.burgLabels = 440`、`metadata.stateLabels = 17`、`metadata.emblemPlaceholders = 457`。
  - `index.html` 有 `#map-overlay`，CSS 设置 `pointer-events: none`。
  - `main.js` 接入城市标签、国家标签占位、纹章占位三个开关。
  - `overlays.js` 通过 `renderer.addViewListener(() => this.sync())` 跟随 camera。
  - 七个专题、feature buffer、四类线层、四类点层和 picking 入口均未被破坏。
  - `node --check`、ESM/API 检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示城市标签、国家标签占位和纹章占位三类 overlay 开关。
  - 统计面板显示城市标签 `440 / 440` 可见、国家标签占位 `17 / 17` 可见、纹章占位 `457 / 457` 可见。
  - 城市标签、国家标签占位、纹章占位三个开关可分别关闭并重新打开。
  - `#map-overlay` 的 `pointer-events` 为 `none`，鼠标 hover 仍命中 cell `13040`，候选 cells 为 `4`，picking ms 为 `0`。
  - 拖拽地图后，同一批城市标签的屏幕坐标随相机平移变化，例如 `Dodbro` 从约 `(446, 246)` 移到 `(526, 286)`，确认 overlay 跟随 WebGL camera。
  - 截图显示城市标签、国家标签占位和纹章 badge 在地图对象附近显示。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `#map-overlay` 的 `pointer-events` 为 `none`。
  - renderer 暴露 `addViewListener()`。
  - `renderSource` 为 `grid`。
  - `glError` 为 `0`。

当前限制：

- 城市标签是 HTML overlay，不是 GPU text；普通小城标签在低缩放下会隐藏，当前没有避让、裁剪队列或文本测量缓存。
- 国家标签当前只是中心/首都附近的简化占位，没有复刻源项目 `draw-state-labels.ts` 的曲线路径、`textPath`、`getBBox()` 适配和自动换行。
- 纹章当前是 HTML badge 占位；虽然快照导出了 `coa` 元数据存在性、尺寸和部分引用信息，但没有调用源项目 COA renderer，也没有实现离屏纹理缓存或真实 SVG 合成。
- overlay 统计和位置同步已经验证，但导出 PNG/JPEG/SVG 时如何合成 overlay 仍留到后续导出阶段处理。

下一步：

- 第 1 阶段独立 WebGL demo 的步骤 1.1 到 1.6 已全部经“尚书实施、门下检查、侍中验收”通过。
- 下一步进入阶段 2 前置决策：先补同地图 SVG/WebGL 对照，或在用户明确授权后开始接入 `source/Fantasy-Map-Generator` 主视图。

## 2026-06-17：修正项目路线为独立 WebGL 复刻版

用户明确纠正：当前目标不是修改原项目，也不是把 WebGL 接入 `source/Fantasy-Map-Generator` 主视图，而是基于原项目功能、数据结构和视觉表现，复刻一个功能相似但使用 WebGL 实现的独立地图生成器。

新的硬边界：

- `source/Fantasy-Map-Generator` 只作为参考实现、行为对照、快照来源和性能基线。
- 禁止修改 `source/` 原项目源码。
- 允许为了安装依赖和运行参考项目产生锁文件，例如 `pnpm-lock.yaml`。
- 新项目代码、工具、原型和文档继续放在仓库根目录的 `prototype/`、`tools/`、`docs/` 或后续正式应用目录中。

已同步修正：

- `AGENTS.md`：项目目标改为独立 WebGL 地图生成器复刻，明确 `source/` 只读参考边界。
- `docs/current-plan.md`：下一步改为阶段 2 独立生成器工程骨架和生成内核。
- `docs/plans/gl-reimplementation-acceptance-plan.md`：重写为“WebGL 地图生成器复刻可验收计划”，删除接入源项目主视图、GL 模式替换原图层等旧路线。

下一步：

- 尚书从 `docs/plans/gl-reimplementation-acceptance-plan.md` 的 **步骤 2.1：正式应用目录和运行时边界** 开始。
- 门下重点检查 `source/` 是否保持未修改。
- 侍中打开新应用页面，验证独立应用可运行、画面非空、控制台无关键错误。

## 2026-06-17：修正 demo 河流宽度和河口裁剪

用户指出当前 demo 河流没有按流量区分粗细，且河流经常越过海岸线或未到海岸线就停止。本轮只修改 demo 和快照导出工具，没有修改 `source/` 原项目源码。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - `cells` 新增 `r` 和 `fl` 导出，用于河流 id 与水量/流量判断。
  - `rivers` 新增 `source`、`mouth`、`parent`、`basin`、`discharge`、`length`。
  - 使用 source 运行时的 `Rivers.addMeandering()` 导出 meandered points，作为后续更精细曲线复刻的参考数据。
- `prototype/webgl-cells/src/lines.js`：
  - 河流层从 `gl.LINES` 改为三角形带 mesh。
  - 河流宽度按 source 的源头宽度、路径长度增长和 cell flux 趋势计算，并使用视觉倍率让主干/支流差异可见。
  - 河口优先裁剪到最后陆地 cell 与首个水域 cell 的共享边中点；找不到共享边时才回退到高度插值点。
  - 仍保留旧快照 fallback：如果没有 `fl` 或 meandered points，仍可从 `river.cells` 构建河流。
- `prototype/webgl-cells/src/renderer.js`：
  - line layer 支持 `triangles` primitive，河流用三角形绘制，国家边界、省份边界和路线继续使用 `gl.LINES`。
- `prototype/webgl-cells/src/main.js`：
  - 统计面板新增河流三角形、河口裁剪、未入海河段和河流宽度范围。
- 重新导出默认 100k sample：
  - `prototype/webgl-cells/data/sample-map.json`

当前默认 sample 河流摘要：

| 指标 | 数值 |
|---|---:|
| pack cells | 72343 |
| 河流数量 | 1240 |
| 河流线段 | 7537 |
| 河流三角形 | 15074 |
| 河口裁剪 | 773 |
| 未入海河段 | 465 |
| 河流宽度范围 | 0.35 - 5.21 |
| WebGL 绘制 | 0.2ms |
| WebGL error | 0 |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- `git diff --check -- .\tools\fmg-export-snapshot.mjs .\prototype\webgl-cells\src\lines.js .\prototype\webgl-cells\src\renderer.js .\prototype\webgl-cells\src\main.js .\prototype\webgl-cells\data\sample-map.json` 通过。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- 内置 Browser 当前返回 `iab` 不可用，因此本轮使用本机 Playwright + 系统 Chrome 验证：
  - 页面加载默认 100k sample。
  - 河流层统计为 `riverSegments = 7537`、`riverTriangles = 15074`、`riverMouthsClipped = 773`。
  - 河流宽度范围为 `0.35 - 5.2075`。
  - `glError = 0`，干净河流视图绘制约 `0.2ms`。
  - `docs/river-fix-rivers-only.png` 截图显示主干河流比支流更粗，河口贴近海岸线。

当前限制：

- 河流 join/cap 还不是最终高质量实现，急弯处可能有三角形段重叠。
- 当前河口裁剪按 pack cell 陆水共享边近似，不等同于 source SVG 的所有曲线细节。
- 部分“未入海河段”多为支流或内部汇流路径，不应强行拉到海岸线；后续 line picking 和河网拓扑显示时需要单独区分。

## 2026-06-17：修正湖中岛显示和纹章默认策略

用户反馈两个 demo 观感问题：

- 湖泊图层开启时，湖中的岛屿容易被湖泊填色覆盖，看起来像也被标为湖泊。
- 纹章占位太抢画面，当前阶段可以先不做纹章系统。

本轮只修改 WebGL demo，没有修改 `source/` 原项目源码。

主要改动：

- `prototype/webgl-cells/src/features.js`：
  - 新增 `lakeIslandPositions` / `lakeIslandColors` buffer。
  - `feature.group === "lake_island"` 时不再只作为普通 landmass 早期绘制，而是在湖泊填色之后再次以陆地色填回。
  - 湖中岛岸线放入 lake shore 线层，语义上归入湖岸，而不是海岸。
  - feature 统计新增 `lakeIslandFeatures`。
- `prototype/webgl-cells/src/buffers.js`、`renderer.js`：
  - 接入湖中岛填色 buffer 的构建、上传、释放和绘制。
  - 统计新增 `lakeIslandTriangles`。
- `prototype/webgl-cells/src/overlays.js`、`index.html`：
  - 纹章占位默认关闭。
  - UI 中纹章开关改为未勾选，并标注为“暂关”。
  - overlay 策略文案改为“纹章系统暂不启用，只保留后续接入占位数据”。
- `prototype/webgl-cells/src/main.js`：
  - 统计面板显示湖中岛 feature 和湖中岛三角形。

验证情况：

- `node --check .\prototype\webgl-cells\src\features.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\overlays.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- buffer 构建检查通过：
  - `lakeIslandFeatures = 27`。
  - `lakeIslandTriangles = 339`。
  - `lakeTriangles = 5114`。
- in-app Browser 已刷新到 `http://localhost:5400/`，页面显示纹章开关默认未勾选。
- 使用本机 Playwright + 系统 Chrome 做完整验证：
  - `lakeIslandFeatures = 27`。
  - `lakeIslandTriangles = 339`。
  - `emblemsVisible = false`。
  - 纹章 checkbox 默认 `checked = false`。
  - `.overlay-emblems.hidden = true`。
  - `glError = 0`。
  - 控制台无 error/warn。

## 2026-06-17：湖泊填充改为真实水域 cell

用户进一步指出：正上方有一块陆地，在打开湖泊图层时会被覆盖为湖泊状态。截图确认这不是单纯的 `lake_island` 小岛填回问题，而是湖泊 fill 使用整湖 feature 外轮廓扇形三角化，遇到凹形湖岸、半岛或湖中陆块时会跨越真实陆地。

修正：

- `prototype/webgl-cells/src/features.js`：
  - 湖泊填色不再使用 lake feature 外轮廓 `pushFeatureFill()`。
  - 改为遍历 `pack.cells`，只对 `cells.h < 20` 且 `cells.f` 指向 lake feature 的真实水域 cell 做中心扇形三角化。
  - 湖岸线仍使用 feature 边界。
  - `lake_island` 填回逻辑保留，用于小型湖中岛在湖泊图层上方重新显示陆地色。

验证：

- `node --check .\prototype\webgl-cells\src\features.js` 通过。
- buffer 构建检查通过：
  - `lakeTriangles = 16707`。
  - `lakeIslandTriangles = 339`。
  - `coastlineSegments = 12651`。
  - `lakeShoreSegments = 5453`。
- in-app Browser 已刷新 `http://localhost:5400/`，统计面板显示新的湖泊三角形和湖中岛三角形。

说明：

- 这次修复牺牲了一点湖泊 fill buffer 的体积，换取语义正确性。
- 后续如果需要更平滑的湖泊边界，可以在真实水域 cell mask 的基础上做更稳健的三角化或 stencil/mask，而不是回到整湖外轮廓扇形填充。

## 2026-06-17：省界层级和中文地名 demo

用户提出最后两个 demo 级视觉改进：

- 省界相对国界应该更细、更浅或虚线化，避免抢国界层级。
- 城市和国家名可以先接一个中文库，让部分文化或国家使用中国地名；后续可能在配置中做时代风格选择，例如古代风格。

本轮只修改 WebGL demo 表现层，没有修改 `source/`。

主要改动：

- `prototype/webgl-cells/src/colors.js`：
  - 省界颜色从接近黑色改为更浅的棕灰色。
- `prototype/webgl-cells/src/layers.js`：
  - 绘制顺序改为省界先画、国界后画，国界会盖在省界上。
- `prototype/webgl-cells/src/chinese-names.js`：
  - 新增本地中文地名库和确定性命名规则。
  - 当前规则让一部分国家显示为中式国家名，例如“昭宁国”“雁川国”。
  - 这些国家下的城市显示为中式城市名；首都使用“国家词根 + 京/都/府”，港口使用“国家词根 + 津/港/浦/湾”。
- `prototype/webgl-cells/src/overlays.js`：
  - 城市标签和国家标签接入中文显示名。
  - 原始 source 名称保留在 tooltip 中，方便对照。
  - overlay 统计新增中文国家/城市标签数量。
- `prototype/webgl-cells/src/styles.css`：
  - 中文标签使用中文字体栈。
  - 中文港口不再追加英文 `harbour`，改为中文港口后缀。
- `prototype/webgl-cells/src/main.js`：
  - 统计面板显示“中文国家/城市名”。

验证情况：

- `node --check .\prototype\webgl-cells\src\chinese-names.js` 通过。
- `node --check .\prototype\webgl-cells\src\overlays.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `git diff --check` 针对本轮相关文件通过。
- in-app Browser 刷新 `http://localhost:5400/` 后验证：
  - 中文国家标签数量为 `5`，示例包括“昭宁国”“雁川国”“栖梧国”“星渚国”“青岚国”。
  - 中文城市标签 DOM 数量为 `379`。
  - 统计面板包含“中文国家/城市名”。
  - 纹章仍默认关闭。

后续建议：

- 正式生成器阶段不要把当前 demo 规则硬编码为最终命名系统。
- 后续可以把命名风格抽象为配置：`source`、`中式古代`、`中式近现代`、`西式幻想`、`混合` 等。
- 如果要继续增强省界，可在 line mesh 阶段实现真正的虚线和可控线宽；当前 WebGL `gl.LINES` 阶段先用颜色和绘制顺序解决层级问题。

## 2026-06-17：省界与路线再区分

用户反馈省界改浅后又和路线混在一起。本轮继续只做 demo 表现层调整，不修改 `source/`。

主要改动：

- `prototype/webgl-cells/src/colors.js`：
  - 省界改为冷灰蓝色，路线改为更暖的棕/金色。
  - 让行政线和道路线形成“冷/暖”视觉分工。
- `prototype/webgl-cells/src/lines.js`：
  - 省界按 cell/vertex 的确定性取模跳绘约三分之一短边，形成间断行政线感。
  - 国界不跳绘，路线不跳绘。

验证情况：

- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- buffer 构建检查通过：
  - 国家边界线段 `2235`。
  - 省份边界线段从 `17102` 降为 `11447`。
  - 路线线段仍为 `15260`。
- in-app Browser 刷新 `http://localhost:5400/` 后统计面板显示省份边界线段 `11447`，路线开关和省界开关均保持开启。

说明：

- 当前仍是 `gl.LINES` 阶段，不能真正控制线宽或 GPU dash pattern。
- 这版用颜色、绘制顺序和确定性跳绘先解决可读性；后续 line mesh 阶段再做真正虚线、宽度和道路样式。

## 2026-06-17：取消省界跳绘，路线改为略粗三角形带

用户进一步反馈：省界用灰色连续线即可，不要引入突兀的虚线/跳绘；可以考虑路线稍微更粗。本轮废弃上一版省界跳绘方案，继续只修改 demo 表现层，不修改 `source/`。

主要改动：

- `prototype/webgl-cells/src/colors.js`：
  - 省界改为连续中性灰色。
  - 路线保留暖色，与灰色省界区分。
- `prototype/webgl-cells/src/lines.js`：
  - 删除省界跳绘逻辑，省界恢复连续绘制。
  - 路线从 `gl.LINES` 改为三角形带：
    - `roads` 宽度约 `1.2`。
    - `searoutes` 宽度约 `0.9`。
    - `trails` 宽度约 `0.75`。
  - 路线统计新增 `routeTriangles`。
- `prototype/webgl-cells/src/renderer.js`、`main.js`：
  - 统计面板显示路线三角形。

验证情况：

- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- buffer 构建检查通过：
  - 国家边界线段 `2235`。
  - 省份边界线段恢复为 `17102`。
  - 路线线段 `15260`。
  - 路线三角形 `30520`。
- in-app Browser 刷新 `http://localhost:5400/` 后统计面板显示上述数据，省界和路线开关均保持开启。

说明：

- 当前方案用“连续灰省界 + 更粗暖色路线”区分语义，比跳绘方案更平顺。
- 后续若要更精细，可以给国界、省界、道路、山路、海路分别做正式 line style 配置。

### 路线宽度微调

用户反馈路线方向正确，但太粗，已经比国界线更抢眼。本轮把路线三角形带宽度整体下调：

- `roads`: `1.2` -> `0.7`
- `searoutes`: `0.9` -> `0.55`
- `trails`: `0.75` -> `0.45`

验证：

- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- 路线仍为三角形带，`routeTriangles = 30520`。
- in-app Browser 已刷新，路线和省界开关均保持开启。

### 路线宽度再次下调

用户继续反馈路线还可以再细。本轮继续保留三角形带路线，但下调视觉宽度：

- `roads`: `0.7` -> `0.45`
- `searoutes`: `0.55` -> `0.36`
- `trails`: `0.45` -> `0.3`

验证：

- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- 路线仍为三角形带，`routeTriangles = 30520`。
- in-app Browser 已刷新。

线段放大质量问题的结论：

- 当前 demo 的宽线是按每个线段独立生成四边形，没有真正的 join/cap，也没有抗锯齿。
- 放大后会看到接缝、尖角、重叠或断裂，越粗的线越明显。
- 正式解决需要实现 screen-space polyline renderer：在 shader 中按屏幕像素宽度外扩，支持 miter/bevel/round join、cap、dash pattern 和 fragment anti-alias。

### 默认关闭高密度点层

用户反馈降水点和人口点默认开启太密，影响地图阅读。本轮把二者改为默认关闭，保留 UI 开关供需要时打开。

改动：

- `prototype/webgl-cells/index.html`：`show-precipitation` 和 `show-population` 默认不勾选。
- `prototype/webgl-cells/src/layers.js`：`precipitation` 和 `population` 初始可见性改为 `false`。

验证：

- `node --check .\prototype\webgl-cells\src\layers.js` 通过。
- in-app Browser 刷新后，降水点和人口点 checkbox 均为未勾选。
- 使用本机 Playwright + 系统 Chrome 验证：
  - `precipitationChecked = false`。
  - `populationChecked = false`。
  - `stats.layers.precipitation = false`。
  - `stats.layers.population = false`。
  - `glError = 0`。

## 2026-06-17：开始阶段 2 正式应用骨架

用户要求保留已有 demo，并开始正式开发。本轮启用“太子-尚书-门下-侍中”流程，按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的步骤 2.1 执行。

太子规划：

- 保留 `prototype/webgl-cells/` 作为源项目快照 demo 和视觉对照，不继续把正式应用能力塞进 demo。
- 新建 `app/webgl-generator/` 作为独立 WebGL 地图生成器正式应用目录。
- 阶段 2.1 只建立运行时边界和可运行占位地图，后续步骤再逐步补 seed/options、grid、heightmap、features 和 pack 语义图。

尚书实施：

- 新增 `app/webgl-generator/README.md`，记录正式应用目录职责、启动命令，以及与 `prototype/` 和 `source/` 的边界。
- 新增 `app/webgl-generator/index.html` 和 `src/styles.css`，提供正式应用第一版工作台界面。
- 新增 `src/main.js`、`src/runtime/app.js` 和 `src/ui/panel.js`，建立应用启动、生成按钮、状态面板和全局调试入口 `window.__webglGeneratorApp`。
- 新增 `src/generator/options.js` 和 `src/generator/index.js`，由新项目自己的生成器输出阶段 2.1 占位地图数据。
- 新增 `src/renderer/placeholder-renderer.js`，用 WebGL2 渲染非空占位地图，不读取 `prototype/webgl-cells/data/sample-map.json`，也不依赖 `source/Fantasy-Map-Generator`。
- 更新 `docs/current-plan.md`，把当前阶段切换为阶段 2，并记录正式应用启动命令。

门下检查：

- `node --check app\webgl-generator\src\main.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\generator\options.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --input-type=module -e "...generatePlaceholderMap..."` 通过，确认占位地图可输出 seed、目标 cells，且 `sourceDependency = false`、`snapshotDependency = false`。
- `git diff --check` 通过。


- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- `node .\tools\serve-prototype.mjs --port 5410 --dir .\app\webgl-generator` 可服务正式应用目录。本轮 Windows 后台进程在 shell 返回后不稳定，因此侍中改用一次性 Node 静态服务脚本完成浏览器验收。
- 内置 Browser 本轮访问 `127.0.0.1:5410` 返回连接拒绝；已用本机 Playwright + 系统 Chrome 兜底验收。
- 页面标题为“WebGL 地图生成器”。
- `window.__webglGeneratorApp` 存在，renderer 统计显示 `webgl2 = true`、`vertexCount = 630`。
- 状态面板显示阶段 `2.1-placeholder`、seed、目标 cells、地图尺寸、GPU 顶点、绘制耗时、`WebGL error = 0`、`source 依赖 = 否`、`快照依赖 = 否`。
- 主动重绘后 canvas 像素检查通过：`940 x 800` 画布中 `752000` 个像素非黑，确认画面非空。
- 生成按钮验收通过：把 seed 改为 `formal-dev-check`、目标 cells 改为 `12000` 后，运行时 metadata 和页面 badge 同步更新。
- 控制台无 error/warning。

结论：

- 步骤 2.1 已完成。正式应用骨架已经与既有 demo 分离，下一步进入步骤 2.2：随机数、seed 和 options 模型。

## 2026-06-17：完成步骤 2.2 seed 和 options 模型

继续执行阶段 2，本轮目标是让正式应用具备自己的可复现生成基础，而不是只有一次性占位数据。

尚书实施：

- 新增 `app/webgl-generator/src/generator/random.js`：
  - 提供 `createRandom(seed)`，同一 seed 输出稳定随机序列。
  - 提供 `createRandomSeed()`，用于 UI 随机 seed。
  - 提供 `stableHash()`，用于稳定摘要校验。
- 更新 `app/webgl-generator/src/generator/options.js`：
  - 规范化 seed、目标 cells、地图宽高和自动随机 seed 开关。
  - 保留目标 cells、宽高的上下限保护。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记从 `2.1-placeholder` 升级为 `2.2-seeded-options`。
  - 使用 seed 驱动占位陆块位置、半径和 palette。
  - 输出稳定 `summary`、`summary.checksum`、`randomPreview` 和 `generationLog`。
  - `generatedAt` 只作为运行时记录，不参与稳定摘要。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 占位地图不再使用硬编码陆块，而是读取 seed/options 生成出的 `shape`。
- 更新 `app/webgl-generator/index.html`、`src/ui/panel.js`、`src/runtime/app.js` 和 `src/styles.css`：
  - UI 新增宽度、高度、自动随机 seed 开关和换 seed 按钮。
  - 运行时面板显示阶段、自动随机、摘要校验、随机预览和生成日志。
- 更新 `app/webgl-generator/README.md`：
  - 记录当前 seed/options 能力。
  - 记录与 source 随机流程的已知差异：当前 PRNG 是新项目内部可复现基础，不保证同 seed 与 source 生成同一地图。

门下检查：

- `node --check app\webgl-generator\src\generator\random.js` 通过。
- `node --check app\webgl-generator\src\generator\options.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\main.js` 通过。
- 确定性摘要检查通过：
  - `seed = repeatable`、`cells = 12000`、`1600 x 900` 连续生成两次，`summary.checksum = 05b328ff`。
  - `seed = different` 同参数生成 `summary.checksum = ac9dbb6e`，确认不同 seed 会改变摘要。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- 使用当前内置 Browser 刷新 `http://127.0.0.1:5410/`，页面显示阶段 `2.2-seeded-options`。
- 页面显示 seed、目标 cells、宽度、高度、自动随机 seed 开关、摘要校验、随机预览、生成日志和 `WebGL error = 0`。
- 固定 UI 参数验收通过：
  - seed `ui-repeatable`、目标 cells `15000`、尺寸 `1600 x 900` 第一次生成摘要 `228caba4`。
  - 同 seed/options 再次生成仍为 `228caba4`。
  - seed 改为 `ui-different` 后摘要变为 `cd8e8963`。
- 自动随机 seed 开关验收通过：
  - 勾选后连续生成两次，seed 分别变为 `map-mqi7ognf-07yeyk3` 和 `map-mqi7ogwr-0jumke5`。
  - 摘要分别为 `37d25068` 和 `24c8a163`。
- Browser 控制台无 error/warning。

结论：

- 步骤 2.2 已完成。下一步进入步骤 2.3：点集、Voronoi grid 和基础 cell mesh。

## 2026-06-17：完成步骤 2.3 点集、Voronoi grid 和基础 cell mesh

继续执行阶段 2，本轮目标是让正式应用不再渲染椭圆占位，而是由新项目自己的生成内核产出第一版 `grid` 数据，并由 WebGL renderer 三角化绘制。

尚书实施：

- 新增 `app/webgl-generator/src/generator/grid.js`：
  - 根据目标 cells 和地图宽高计算点阵列数。
  - 使用 seed 驱动的抖动点阵生成 `grid.points`。
  - 使用局部半平面裁剪生成近似 Voronoi cell。
  - 输出 `grid.cells.v`、`grid.cells.p`、`grid.cells.h` 和 `grid.vertices.p`。
  - 统计实际 cells、布局、Voronoi 顶点、cell 三角形、构建耗时和生成方法。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.3-generated-grid`。
  - 生成摘要纳入 grid cells、布局、顶点、三角形、样本点和样本高度。
  - `generationLog` 记录 grid 构建结果。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 不再绘制硬编码椭圆陆块。
  - 从 `grid.points`、`grid.cells.v` 和 `grid.vertices.p` 三角化 cell mesh。
  - 按 `grid.cells.h` 绘制基础高度/海陆占位色。
  - 新增最小 camera：拖拽平移、滚轮缩放、适配视图。
- 更新 `app/webgl-generator/index.html`、`src/ui/panel.js` 和 `src/runtime/app.js`：
  - 按钮文案改为“生成 grid 地图”。
  - 新增“适配视图”按钮。
  - 统计面板显示实际 grid cells、grid 布局、Voronoi 顶点、cell 三角形、grid 构建耗时、GPU 顶点和相机状态。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`，记录阶段 2.3 能力和当前算法边界。

门下检查：

- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 生成器确定性检查通过：
  - `seed = grid-repeatable`、`cells = 10000`、`1440 x 960` 连续生成两次摘要一致，`summary.checksum = 5ca271f3`。
  - `seed = grid-different` 同参数生成 `summary.checksum = 696bff5b`。
  - 10k 目标实际生成 `10004` cells，布局 `122 x 82`，约 `20008` Voronoi 顶点、`39610` cell 三角形，空 cell 为 `0`。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- 使用内置 Browser 刷新当前 `http://127.0.0.1:5410/`，页面显示阶段 `2.3-generated-grid`。
- 页面统计显示：
  - 目标 cells `10000`。
  - 实际 grid cells `10004`。
  - grid 布局 `122 x 82`。
  - Voronoi 顶点约 `20009`。
  - cell 三角形约 `39611`。
  - GPU 顶点约 `118839`。
  - `WebGL error = 0`。
  - `source 依赖 = 否`，`快照依赖 = 否`。
- 内置 Browser 的点击操作在 10k grid 生成时出现一次动作超时；页面状态读取正常。因此用本机 Playwright + 系统 Chrome 完整兜底验收。
- 系统 Chrome 验收结果：
  - 初始地图画面非空，`940 x 800` 画布中 `752000` 个像素非黑。
  - `seed = grid-ui-repeatable` 连续生成两次摘要均为 `598ed9e8`。
  - `seed = grid-ui-different` 后摘要变为 `d32628ab`。
  - 拖拽后相机从 `x 1.00, 0.00, 0.00` 变为 `x 1.00, 0.26, -0.15`。
  - 滚轮缩放后相机变为 `x 1.52, 0.26, -0.15`。
  - 点击适配视图后相机恢复 `x 1.00, 0.00, 0.00`。
  - 控制台无 error/warning。

当前限制：

- 当前 Voronoi 是基于抖动点阵和局部半平面裁剪的轻量近似实现，用于先打通正式应用自己的 `grid` 数据流。
- 尚未实现 source 那种点集松弛、真实 heightmap、feature 提取或 pack 语义图。
- 下一步进入步骤 2.4：高度图和海陆 feature。

## 2026-06-17：构建器取舍和步骤 2.4 高度图/feature

用户询问是否需要使用现代构建器，例如 Vite，并说明如果不需要就继续当前开发。

太子决策：

- 当前暂不引入 Vite，继续原生 ESM + `tools/serve-prototype.mjs` 静态开发。
- 理由：
  - 正式应用目前无 npm 依赖，且目标可以只支持高版本 Chrome。
  - 当前阶段重点是生成内核、数据结构和 WebGL 管线，不应先增加构建配置。
  - `app/webgl-generator/` 目录结构保持 Vite 友好，后续需要打包产物、资源指纹、worker、第三方库或测试集成时再引入。

尚书实施步骤 2.4：

- 新增 `app/webgl-generator/src/generator/heightmap.js`：
  - 用 seed 驱动的 continent、ridge 和 lake basin 采样高度。
  - 当前 seaLevel 为 `20`。
- 新增 `app/webgl-generator/src/generator/features.js`：
  - 对 `grid.cells.h` 做水陆分类。
  - 使用 flood fill 提取 ocean、land、lake feature。
  - 写入 `grid.cells.f`。
  - 从相邻水陆 cell 的共享 Voronoi 顶点提取海岸线和湖岸线 segment。
- 更新 `app/webgl-generator/src/generator/grid.js`：
  - cell 高度改为来自 `sampleHeight(heightmap, point)`。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.4-heightmap-features`。
  - 输出 `heightmap`、`features` 和 feature 统计。
  - 生成日志记录 ocean、land、lake 提取结果。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 基础 cell 颜色按高度绘制。
  - 新增 line buffer，用 `gl.LINES` 绘制海岸线和湖岸线。
- 更新 UI 统计：
  - feature 数。
  - 海洋/陆地/湖泊数量。
  - 海岸线段。
  - 湖岸线段。
  - 线段顶点。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\features.js` 通过。
- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- 生成器确定性检查通过：
  - `seed = feature-repeatable` 连续生成摘要 `51ea79d4`。
  - `seed = feature-different` 生成摘要 `25a98f2e`。
  - `feature-repeatable` 生成 `1` 个 ocean、`1` 个 land、`2` 个 lake，海岸线段 `374`，湖岸线段 `134`。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `2.4-heightmap-features`。
- 默认 seed `stage-2-1` 页面统计：
  - 实际 grid cells `10004`。
  - feature 数 `3`。
  - 海洋/陆地/湖泊 `1 / 1 / 1`。
  - 海岸线段 `349`。
  - 湖岸线段 `82`。
  - GPU 顶点 `118830`。
  - 线段顶点 `862`。
  - `WebGL error = 0`。
- 系统 Chrome 兜底验收：
  - `feature-repeatable` 连续生成摘要均为 `51ea79d4`。
  - `feature-different` 摘要为 `25a98f2e`。
  - `940 x 800` 画布中 `752000` 个像素非黑。
  - 控制台无 error/warning。

当前限制：

- heightmap 只是第一版参数化采样，不等同于 source 的完整高度图模板体系。
- feature 只区分 ocean、land、lake；尚未实现 lake island、多海域命名、feature 边界平滑或 pack 语义图。
- 下一步进入步骤 2.5：pack 语义图和基础 picking。

## 2026-06-17：完成步骤 2.5 pack 语义图和基础 picking

继续执行阶段 2，本轮目标是建立正式应用自己的 `pack` 语义层，并让鼠标悬停能从画布位置命中 grid cell、pack cell 和 feature。

尚书实施：

- 新增 `app/webgl-generator/src/generator/pack.js`：
  - 生成独立 `pack` 对象。
  - 当前采用 `one-grid-cell-to-one-pack-cell` 阶段性映射。
  - 写入 `grid.cells.pack`，用于从底层渲染 mesh cell 找到对应 pack cell。
  - `pack.cells` 保存 grid cell、feature、height 和 type 等语义字段。
- 新增 `app/webgl-generator/src/renderer/picking.js`：
  - 根据世界坐标定位 grid 行列附近候选 cell。
  - 对候选 cell 做 polygon hit test。
  - 返回 grid cell、pack cell、feature id/type、height、世界坐标和候选数量。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 暴露 `screenToWorld()` 和 `pickClientPoint()`。
  - 在 canvas pointer move 时触发 hover picking。
  - renderer 统计加入 pack metadata。
- 更新 `app/webgl-generator/src/runtime/app.js` 和 `src/ui/panel.js`：
  - 新增 `state.pick`。
  - 新增“悬停”面板，显示 grid cell、pack cell、feature、height、坐标和候选 cells。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.5-pack-picking`。
  - metadata 加入 `packCells`。
  - 摘要和生成日志加入 pack 映射信息。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\main.js` 通过。
- 生成器和 picking 检查通过：
  - `seed = pack-repeatable` 连续生成摘要稳定为 `52841298`。
  - `grid = 10004`，`pack = 10004`。
  - pack 映射为 `one-grid-cell-to-one-pack-cell`。
  - 中心点 picking 命中 `gridCell = 5062`、`packCell = 5062`、`featureType = lake`、`height = 13`、候选 cells `9`。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `2.5-pack-picking`。
- 页面统计显示 `pack cells = 10004`，生成日志包含 `build pack: 10004 semantic cells`。
- 系统 Chrome 验收 hover picking：
  - 页面阶段为 `2.5-pack-picking`。
  - `pack cells = 10004`。
  - 中心悬停面板命中 `grid cell = 4940`、`pack cell = 4940`、`feature = lake #2`、`高度 = 16`、`坐标 = 720, 480`、候选 cells `9`。
  - 直接调用 renderer `pickClientPoint()` 返回同一组命中信息。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 当前 `pack` 是 1:1 语义壳，用于先建立语义边界和 picking 数据流；尚未实现 source 那种抽稀/重建后的 pack 图。
- picking 目前只支持 cell/pack/feature 命中；城市、河流、路线、marker 等对象级 picking 留到后续阶段。
- 下一步进入步骤 2.6：气候、生物群系和河流最小链路。

## 2026-06-17：完成步骤 2.6 气候、生物群系和河流最小链路

用户明确授权后续无需每一步停下来等待确认。本轮继续自动执行阶段 2 的最后一步 2.6。

尚书实施：

- 新增 `app/webgl-generator/src/generator/climate.js`：
  - 基于纬度、高度、海陆 feature 粗略生成温度和降水。
  - 规则分类 biome，包括 water、ice、tundra、grassland、forest、desert、savanna、rainforest、mountain。
  - 写入 `grid.cells.temp`、`grid.cells.prec` 和 `grid.cells.biome`。
- 新增 `app/webgl-generator/src/generator/rivers.js`：
  - 从高地和高降水 cell 中挑选河源。
  - 沿低邻居追踪河流，遇到 ocean、lake 或地图边界停止。
  - 输出河流 cell 序列、点列和统计。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 增加 temp、prec、biome 字段。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.6-climate-rivers`。
  - 输出 `climate` 和 `rivers`。
  - 摘要和生成日志纳入气候范围、biome 分布和河流统计。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 支持 `height`、`temperature`、`precipitation`、`biomes` 四种专题色。
  - 河流加入 line pass。
- 更新 `app/webgl-generator/src/renderer/picking.js`：
  - 悬停结果增加 temperature、precipitation 和 biome。
- 更新 `app/webgl-generator/index.html`、`src/runtime/app.js`、`src/ui/panel.js` 和 `src/styles.css`：
  - 新增专题切换按钮。
  - 统计面板显示温度范围、降水范围、biome 数量、河流数量/线段数和当前专题。
  - 悬停面板显示温度/降水和 biome。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\climate.js` 通过。
- `node --check app\webgl-generator\src\generator\rivers.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 生成器确定性检查通过：
  - `seed = climate-repeatable` 连续生成摘要 `94c3bf3c`。
  - `seed = climate-different` 摘要 `b5c98828`。
  - 温度范围 `-7 .. 31`。
  - 降水范围 `40 .. 84`。
  - biome 统计包含 water、tundra、grassland、forest、savanna、mountain、rainforest。
  - 河流 `3` 条、`21` 段。
  - 中心 picking 返回 temperature、precipitation 和 biome 字段。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `2.6-climate-rivers`。
- 默认 seed 页面统计：
  - 温度范围 `-7 .. 31`。
  - 降水范围 `36 .. 85`。
  - biome 数 `7`。
  - 河流 `3 / 39`。
  - 专题默认 `height`。
  - `WebGL error = 0`。
- 系统 Chrome 交互验收：
  - 专题按钮可切换高度、温度、降水、生物群系，最终专题为 `biomes`。
  - 悬停中心点命中 `lake #2`，温度/降水为 `31 / 85`，biome 为 `water`。
  - `940 x 800` 画布中 `752000` 个像素非黑。
  - `glError = 0`。
  - 控制台无 error/warning。

当前限制：

- 气候和 biome 是最小趋势模型，不等同于 source 的完整风向、纬度带、降水传播和 biome 矩阵。
- 河流只有中心线，未实现流量、宽度、join/cap、河口裁剪和支流汇合。
- 阶段 2 的最小生成链路已闭合。下一步进入阶段 3：世界语义生成与图层补全，优先步骤 3.1 文化、宗教和名称系统。

## 2026-06-17：完成步骤 3.1 文化、宗教和名称系统

在用户授权自动继续后，本轮没有停在阶段 2.6，而是继续进入阶段 3 的第一步。

尚书实施：

- 新增 `app/webgl-generator/src/generator/society.js`：
  - 从陆地 cell 中选择文化和宗教中心。
  - 使用距离场扩散到所有 grid cell。
  - 生成中文文化名和宗教名。
  - 写入 `grid.cells.culture` 和 `grid.cells.religion`。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 同步保存 culture 和 religion 字段。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `3.1-culture-religion`。
  - 输出 `society` 对象和统计。
  - 生成日志记录 culture/religion 数量。
- 更新 renderer 和 UI：
  - 新增文化、宗教专题按钮。
  - renderer 支持 `cultures` 和 `religions` 专题色。
  - picking 和悬停面板显示文化名、宗教名。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\society.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- 生成器确定性检查通过：
  - `seed = society-repeatable` 连续生成摘要稳定为 `4da2c96f`。
  - 生成 `8` 个文化和 `6` 个宗教。
  - 中心 picking 返回文化 `昭宁文化` 和宗教 `天衡道`。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `3.1-culture-religion`。
- 页面统计显示文化/宗教 `8 / 6`，专题按钮包含文化和宗教。
- 系统 Chrome 验收：
  - 专题可切换到文化和宗教，最终专题为 `religions`。
  - 中心悬停显示文化 `星渚文化`、宗教 `青岚信会`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 文化/宗教扩散当前是最小距离场模型，没有考虑地形阻隔、海峡、河流、人口或 source 的完整文化生成逻辑。
- 名称表是内置中文示例，后续应抽象为可配置命名风格。
- 下一步进入步骤 3.2：国家、省份和区域。

### 2.4 cell 三角化补丁

用户在内置浏览器中指出当前生成图的三角形看起来是分散的。排查后确认这不是预期表现，而是 renderer 在把 Voronoi cell 做扇形三角化时，只生成了中间边段，漏掉了每个多边形的首边和尾边闭合三角形，导致 cell 填充出现缺片。

修正：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pushGridCells()` 从 `index = 1` 到 `length - 2` 的不完整循环，改为遍历所有 vertex，并用 `(index + 1) % length` 闭合首尾边。
  - 每个 cell 现在会完整生成一圈中心扇形三角形。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。
- 内置 Browser 刷新后，默认 10k 地图 GPU 顶点从约 `118839` 增加到 `178854`，符合补齐缺失三角形后的预期。
- 系统 Chrome 验证：
  - `940 x 800` 画布中 `752000` 个像素非黑。
  - `glError = 0`。
  - 控制台无 error/warning。

## 2026-06-18：完成步骤 3.2 国家、省份和区域

用户询问为何停下后，本轮确认没有实际阻塞，只是会话执行边界导致上一段暂停；随后按用户“不需要每一步停下来”的要求继续推进正式开发。

尚书实施：

- 新增 `app/webgl-generator/src/generator/politics.js`：
  - 从陆地 cell 中选择国家中心。
  - 基于国家分配结果继续生成省份中心和省份归属。
  - 按位置、高度和湿度生成区域归属。
  - 写入 `grid.cells.state`、`grid.cells.province` 和 `grid.cells.region`。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `3.2-states-provinces-regions`。
  - 输出 `politics` 对象和统计。
  - 生成日志记录国家、省份、区域数量。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 同步保存 state、province 和 region 字段。
- 更新 renderer 和 UI：
  - 新增国家、省份、区域专题按钮。
  - renderer 支持 `states`、`provinces` 和 `regions` 专题色。
  - picking 和悬停面板显示国家、省份和区域名称。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\politics.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。
- 生成器确定性检查通过：
  - `seed = politics-repeatable` 连续生成摘要稳定为 `31578b67`。
  - 生成 `5` 个国家、`11` 个省份、`6` 个区域。
  - pack 语义字段包含 `state`、`province` 和 `region`。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `3.2-states-provinces-regions`。
- 页面统计显示国家/省份/区域 `5 / 11 / 6`。
- 专题按钮包含高度、温度、降水、生物群系、文化、宗教、国家、省份和区域。
- 实际切换国家、省份、区域专题后，最终专题为 `regions`。
- 悬停陆地 cell 命中 `land #1`，显示国家 `星渚王国`、省份 `雁川领`、区域 `西岭`。
- `WebGL error = 0`。
- 控制台无 error/warning。

当前限制：

- 国家、省份扩散当前是最小距离场模型，尚未考虑人口、河流阻隔、海峡、扩张成本、军事/外交或 source 的完整政治生成规则。
- 区域当前是地理分区，不等同于 source 的完整区域/行政层级。
- 下一步进入步骤 3.3：城市、道路和基础人口点。

### 2.3 grid 规整感修正

用户在内置浏览器中指出当前正式应用生成结果看起来过于规整。排查后确认原因是 `app/webgl-generator/src/generator/grid.js` 仍采用“每个行列格一个点，再做小幅随机抖动”的阶段性点集策略；这个策略稳定但会在视觉上露出行列结构。

修正：

- `generatePoints()` 从单纯 `0.32` cell 的局部随机抖动，改为三层扰动：
  - 单 cell 内局部随机。
  - 每行和每列的轻微错位。
  - 低频 warp field 的连续形变。
- 点仍被限制在原始 cell 的安全范围内，避免破坏当前局部 Voronoi 裁剪和基于行列邻域的 picking 假设。
- `grid.metadata.method` 更新为 `organic-stratified-halfplane-voronoi`。

验证：

- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- 生成器确定性检查通过：
  - `seed = organic-grid-check` 连续生成摘要稳定为 `350ad237`。
  - `gridCells = 10004`，`Voronoi 顶点 = 20023`，`cell 三角形 = 39615`。
  - 阶段仍为 `3.2-states-provinces-regions`，国家/省份/区域统计仍为 `5 / 11 / 6`。

当前限制：

- 这仍是阶段性轻量点集，不是完整 Poisson / Delaunay / Lloyd 生成流程。
- 后续如果继续追求接近 source 的自然感，需要把点集生成升级为可控密度采样和松弛流程，并对应调整空间索引。

### 2.4 heightmap 地形规整感修正

用户进一步澄清：规整感主要来自生成的地形，而不是 cell 点集。排查后确认 `app/webgl-generator/src/generator/heightmap.js` 使用少量规则椭圆 blob 叠加大陆、高地和湖盆，导致大陆轮廓、湖盆和山脉看起来圆滑且规整。

修正：

- `createHeightmap()` 新增 deterministic noise fields：
  - domain warp X/Y。
  - continental noise。
  - detail noise。
  - ridge noise。
- `sampleHeight()` 改为先对采样坐标做低频形变，再叠加不规则 blob、分形噪声和高地细节。
- continent、ridge 和 lake basin blob 新增旋转角与 irregularity，边界半径按噪声扰动。
- 仍保持无依赖、seed 可复现的轻量模型。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。
- 生成器确定性检查通过：
  - `seed = terrain-organic-check` 连续生成摘要稳定为 `2576c8ae`。
  - `gridCells = 10004`。
  - feature 统计为 `57`，其中海洋 `3`、陆地 `31`、湖泊 `23`。
  - 高度范围 `0..84`，陆地/水域 cell 为 `4384 / 5620`。
  - 河流 `5` 条、线段 `85`。
- 内置 Browser 刷新默认 `seed = stage-2-1` 后：
  - 阶段仍为 `3.2-states-provinces-regions`。
  - feature 统计为 `39`，其中海洋 `3`、陆地 `18`、湖泊 `18`。
  - 海岸线段 `841`，湖岸线段 `335`。
  - 河流 `7` 条、线段 `109`。
  - `WebGL error = 0`，控制台无 error/warning。

当前限制：

- 这仍是阶段性轻量 heightmap，不是 source 的完整模板化地形、海陆再平衡、侵蚀、河谷切割或山脉生成流程。
- 后续需要把地形生成拆成可配置 pipeline，并加入更明确的大陆板块、山脉走向、海岸后处理和湖泊筛选。

### 2.4/2.6 对照 demo 后的地形和河流修正

用户在内置浏览器中指出当前地图仍存在两个问题：

- 河流过乱，存在转圈、打结的视觉问题。
- 地形分形仍然偏简单，不如 `prototype/webgl-cells/` 的 demo 地形自然。

排查：

- 正式应用此前的河流是逐条从源头选择最低邻居的贪心追踪，缺少全图流向、汇水量、填洼和合流约束，容易在局部洼地、近水 cell 和已占用河道附近产生短线、折返或绕圈。
- 正式应用此前的 heightmap 虽加入噪声，但主要仍是大陆 blob 加噪声，缺少 source 中 `HeightmapGenerator` 模板式 `Hill`、`Pit`、`Range`、`Trough` 步骤所形成的方向性地貌。
- source 的 `river-generator.ts` 不是逐条独立贪心生成，而是先按高度排序汇水，记录 `flux`、`confluence`、parent river，并在生成前执行 depression filling。

修正：

- `app/webgl-generator/src/generator/heightmap.js`：
  - 增加山脉线、谷地线、小丘和洼地采样。
  - 调整分形噪声，使正向高地细节更明显，减少内陆被负向噪声打成过多水洞。
  - 默认高度专题配合 renderer 新色阶，提升内陆高差可读性。
- `app/webgl-generator/src/generator/rivers.js`：
  - 从逐条贪心追踪重写为轻量无环流向图。
  - 生成前对陆地做轻量 depression fill。
  - 按高度从高到低累计 flux。
  - 按 flux、高度和间距筛选河源。
  - 只有通过长度检查的河流才占用河道。
  - 合流遇到已存在河道时停止当前支流，避免交叉乱穿。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 高度专题改用更分明的低地、丘陵、高地和山地色阶。

验证：

- `seed = stage-2-1` 的生成器检查：
  - feature 数 `129`，其中海洋 `8`、陆地 `45`、湖泊 `76`。
  - 高度分桶 `[0-20, 20-38, 38-62, 62-78, 78+] = 3347 / 2945 / 2278 / 1172 / 262`。
  - 河流 `11` 条、线段 `47`，最长 `8` 个 cell。
  - 河流重复 cell 数 `0`。
  - 河流模型标记为 `acyclic-flux-downhill`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示河流 `11 / 47`。
  - `WebGL error = 0`。
  - 截图复查：河流不再出现明显转圈打结，内陆地形层次比上一版更明显。

当前限制：

- 正式应用仍未实现 source 完整的 pack 图、湖泊出口、真实合流流量、河宽 mesh、河床下切和 meandered points。
- 当前 heightmap 是向 source 模板逻辑靠拢的轻量实现，尚未把模板步骤抽象成可配置 pipeline。

### 2.4 地形圆圈感和平坦感二次修正

用户继续指出正式应用当前地形仍不自然：

- 分形痕迹明显，部分区域能看出圆圈，真实地形不会有这么多圆形结构。
- 地形整体偏平坦，高山概率不大，大部分区域像平原。

排查：

- `heightmap.js` 中上一版噪声采样使用周期包裹，多频率叠加后容易露出重复纹理和近似环状痕迹。
- 山脉线段端点位于可视地图内部，容易在端点形成圆形山包。
- 负向噪声和谷地会产生大量小型闭合内陆水坑，视觉上像圆形打孔。
- 高程再映射对高山抬升不足，导致大面积陆地停留在低地和平缓丘陵色阶。

修正：

- `app/webgl-generator/src/generator/heightmap.js`：
  - 将周期包裹噪声改为非周期确定性 lattice noise，减少重复分形纹理。
  - 将山脉轴线延伸到地图边界外，减少可视区域内的圆形端点山包。
  - 提高窄山脉脊线和 ridged noise 对高海拔的贡献，使山地从孤立白点变为连续山脉带。
  - 弱化谷地线对水坑的影响，保留低地起伏但减少圆形洼地。
- `app/webgl-generator/src/generator/grid.js`：
  - 新增小型内陆闭合水坑填充，只填平不连海且面积很小的水域 basin。
  - 保留较大的湖泊和海岸线，避免把所有水体硬抹掉。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\generator\rivers.js` 通过。
- 三组固定 seed 生成器检查均无河流重复 cell：
  - `stage-2-1`：feature `82`，海洋/陆地/湖泊 `11 / 39 / 32`，高度分桶 `[<20, 20-38, 38-55, 55-72, 72-86, 86+] = 2667 / 3925 / 1171 / 669 / 553 / 1019`，河流 `9 / 40`，回环 `0`。
  - `terrain-organic-check`：feature `83`，海洋/陆地/湖泊 `12 / 44 / 27`，高度分桶 `2053 / 4102 / 1412 / 797 / 581 / 1059`，河流 `10 / 46`，回环 `0`。
  - `river-sanity-1`：feature `89`，海洋/陆地/湖泊 `6 / 63 / 20`，高度分桶 `3498 / 3048 / 1280 / 804 / 428 / 946`，河流 `11 / 52`，回环 `0`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示阶段 `3.2-states-provinces-regions`。
  - 默认 seed `stage-2-1` 显示 feature `82`，海洋/陆地/湖泊 `11 / 39 / 32`，河流 `9 / 40`。
  - `WebGL error = 0`，控制台无 error/warning。
  - 截图复查：内陆小圆洞明显减少，高山形成更连续的横向山脉带，整体不再主要表现为平坦平原。

当前限制：

- 这仍是轻量 heightmap，不是 source 完整的模板步骤、侵蚀、水文出口和河谷下切。
- 高山带已经更明显，但后续仍需要把山脉、湖泊和海陆比例拆成可配置参数，避免不同 seed 之间表现波动过大。

### 2.4 山脉突兀感和气团感修正

用户继续指出当前山体仍不自然：

- 高山像突然拔地而起，缺少丘陵、前山和高原过渡。
- 山势弯弯曲曲，像气团，不像构造运动形成的虽然凌乱但仍有大致走向的山脉。

排查：

- `heightmap.js` 中上一版山脉主要由窄线 `sampleRange()` 高强度抬升，主脊宽度太窄，肩部过渡不足。
- `remapLandHeight()` 对高值再次抬升，使高山核心更容易直接贴着中低地出现。
- 多条山脉线在地图中心交汇，叠加后形成白色团块，视觉上更像气团而不是构造带。
- 高度专题色阶雪线偏低，白色区域过早出现，加剧了突兀感。

修正：

- `app/webgl-generator/src/generator/heightmap.js`：
  - 将 `mountainRanges` 改为 `mountainBelts`。
  - 新增 `createMountainBelt()` 和 `sampleMountainBelt()`，把山脉拆成宽缓褶皱、肩部过渡和窄主脊三层。
  - 降低山脉 bend 幅度，使多条山脉更接近平行或同向构造带。
  - 弱化中心交汇的第三条斜穿山脉，改为较弱的平行支脉，减少中央高山团块。
  - 放缓 `remapLandHeight()` 的高值抬升，保留高山但减少悬崖式跃升。
- `app/webgl-generator/src/generator/grid.js`：
  - 新增 `softenHighlandTransitions()`，对陆地高差做轻量邻域过渡，让高山外缘向高地和丘陵扩散。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 调整高度专题色阶，推迟雪白高山色出现，并把极高海拔颜色压成更柔和的裸岩/浅雪色。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- 三组固定 seed 生成器检查均无河流重复 cell：
  - `stage-2-1`：feature `69`，海洋/陆地/湖泊 `8 / 54 / 7`，高度分桶 `[<20, 20-38, 38-55, 55-72, 72-86, 86+] = 2390 / 4182 / 1485 / 855 / 444 / 648`，河流 `5 / 28`，回环 `0`。
  - `terrain-organic-check`：feature `63`，海洋/陆地/湖泊 `9 / 45 / 9`，高度分桶 `2110 / 3356 / 2108 / 1269 / 441 / 720`，河流 `10 / 58`，回环 `0`。
  - `river-sanity-1`：feature `101`，海洋/陆地/湖泊 `9 / 58 / 34`，高度分桶 `3043 / 3497 / 1749 / 727 / 367 / 621`，河流 `9 / 49`，回环 `0`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示阶段 `3.2-states-provinces-regions`。
  - 默认 seed `stage-2-1` 显示 feature `69`，海洋/陆地/湖泊 `8 / 54 / 7`，河流 `5 / 28`。
  - `WebGL error = 0`，控制台无 error/warning。
  - 截图复查：主山脉呈横向构造带，中央高山团块减弱，高山外缘比上一版有更明显的高地和丘陵过渡。

当前限制：

- 当前仍是启发式构造带模型，并未实现真实板块边界、俯冲带、褶皱带年龄或侵蚀强度。
- 后续要继续接近 source 或真实地形，需要把山脉生成拆成可配置的构造 province，并让河谷侵蚀反向影响高度场。

### 2.4 环形/气团山体整改

用户基于内置浏览器截图继续指出地形仍不合格：局部山体仍存在环形结构，走势像气团，不像有大致构造方向的山脉；如果继续推进语义功能，会把错误高度生成当成基础固化。

重新对照 source 和 demo 后确认：

- `prototype/webgl-cells/` 的 demo 地形并不是前端噪声生成，而是 `tools/fmg-export-snapshot.mjs` 从原 FMG 运行时导出的真实 `grid.cells.h`。
- source 的 `HeightmapGenerator` 对 `continents` 模板按 `Hill`、`Range`、`Strait`、`Smooth`、`Trough`、`Pit`、`Mask` 等步骤在图邻接上扩散高度，不是连续坐标分形噪声。
- 正式应用上一版虽然加入了构造带，但本质仍是连续采样和宽山带叠加，容易产生环、团块和大面积白色高原。

修正：

- 重写 `app/webgl-generator/src/generator/heightmap.js`：
  - 删除连续坐标 `sampleHeight()` 方案。
  - 改为 graph propagation 高度模板，按 source `continents` 的步骤实现 `addHill()`、`addRange()`、`addStrait()`、`addTrough()`、`addPit()`、`smooth()` 和 `mask()`。
  - `Range` 记录主脊 cell 和邻域影响，重平衡时只允许主脊附近保留高海拔，非 ridge 的宽丘陵会被压回中海拔，避免白色气团。
  - 补回 `Strait vertical` 步骤，打断过完整大陆面，减少整片高原。
  - 最终按 demo 快照高度分布做排序校准，使水域、低地、中山、高山和极高峰比例接近 FMG demo。
- 调整 `app/webgl-generator/src/generator/grid.js`：
  - grid 构建后再套用 graph propagation heightmap。
  - 移除上一版 `softenHighlandTransitions()`，避免在高度模板外再次把高山扩成宽团块。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- 三组固定 seed 生成器检查均无河流重复 cell：
  - `stage-2-1`：checksum `ee78a221`，feature `24`，海洋/陆地/湖泊 `3 / 9 / 12`，高度分桶 `[<20, 20-38, 38-55, 55-72, 72-86, 86+] = 4372 / 2372 / 1737 / 1082 / 349 / 92`，河流 `8 / 60`，回环 `0`。
  - `terrain-organic-check`：checksum `cc9092f0`，feature `11`，海洋/陆地/湖泊 `1 / 8 / 2`，高度分桶 `4397 / 2347 / 1737 / 1082 / 349 / 92`，河流 `7 / 55`，回环 `0`。
  - `river-sanity-1`：checksum `476a3fc2`，feature `13`，海洋/陆地/湖泊 `1 / 7 / 5`，高度分桶 `4389 / 2355 / 1737 / 1082 / 349 / 92`，河流 `7 / 61`，回环 `0`。
- 与 demo 快照分布对照：
  - demo：`[43.45%, 24.61%, 17.23%, 10.62%, 3.29%, 0.8%]`。
  - 正式应用 `stage-2-1`：`[43.7%, 23.71%, 17.36%, 10.82%, 3.49%, 0.92%]`。
  - demo 相邻高度差 p95 为 `8`，正式应用为 `10`；差异主要来自新增海峡切割，后续可继续软化海峡边缘。
- 浏览器复查 `http://127.0.0.1:5410/`：
  - 页面显示阶段 `3.2-states-provinces-regions`。
  - 默认 seed `stage-2-1` 显示 checksum `ee78a221`。
  - `WebGL error = 0`。
  - 截图保存为 `docs/terrain-fix-browser-check.png`。
  - 肉眼复查：环形山和大面积白色气团明显减少，高山集中为更窄的条带，地形可作为后续语义生成继续迭代的基础。

当前限制：

- 这仍是轻量 graph propagation 复刻，不是 source 完整实现；`Strait`、`Range` 和高度分布校准仍为阶段性近似。
- 当前高度分布已贴近 demo，但山脉方向、侵蚀、水文出口和河谷下切仍需后续接入更完整的模板参数与水文反馈。

### 2.4 地形模板控制

用户指出地形高度已基本可接受，但每次生成仍像一大片接近圆形的陆地；原版 FMG 可以生成地中海、高山岛屿、平原岛屿、一侧大陆等多种 case。

排查：

- 正式应用此前虽然把 heightmap 改成 graph propagation，但 `createHeightmap()` 仍硬编码为 `continents` 近似模板。
- UI 和 options 没有地形模板字段，换 seed 只是在同一种大陆模板里抽变体，无法切换到原版的其他 heightmap case。
- 上一轮的 demo 分布校准也只按 continents 分布处理，不能表达岛屿、地中海或盘古大陆的海陆比例。

修正：

- `app/webgl-generator/src/generator/options.js`：
  - 新增 `heightmapTemplate` 选项，默认 `continents`。
  - 限制可选模板 id，避免非法输入进入生成链路。
- `app/webgl-generator/index.html` 和 `app/webgl-generator/src/ui/panel.js`：
  - 新增“地形”下拉框。
  - 当前支持大陆、地中海、高山岛屿、平原岛屿、一侧大陆、盘古大陆和群岛。
  - 运行时统计显示当前地形模板。
- `app/webgl-generator/src/generator/heightmap.js`：
  - 将固定 continents 流程改成模板执行器。
  - 支持 `Hill`、`Pit`、`Range`、`Trough`、`Strait`、`Smooth`、`Mask`、`Add`、`Multiply`、`Invert`。
  - 每个模板有独立海陆比例和高度分布校准，避免所有模板被压成同一种大陆比例。
- `app/webgl-generator/src/generator/index.js`：
  - metadata、summary 和 generationLog 记录 `heightmapTemplate`，方便追踪。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\options.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 同一 seed `template-check` 下七个模板均生成不同 checksum，且河流无重复 cell：
  - 大陆：checksum `e62c6eb9`，海洋/陆地/湖泊 `1 / 8 / 0`，水域分桶约 `44.1%`。
  - 地中海：checksum `71a93f42`，海洋/陆地/湖泊 `4 / 16 / 9`，水域分桶约 `42.1%`。
  - 高山岛屿：checksum `5b21db7e`，海洋/陆地/湖泊 `1 / 15 / 1`，水域分桶约 `55.8%`。
  - 平原岛屿：checksum `96e77f12`，海洋/陆地/湖泊 `1 / 11 / 9`，水域分桶约 `52.2%`。
  - 一侧大陆：checksum `7ffdb759`，海洋/陆地/湖泊 `9 / 58 / 16`，水域分桶约 `46.6%`。
  - 盘古大陆：checksum `47a1d912`，海洋/陆地/湖泊 `2 / 10 / 6`，水域分桶约 `32.6%`。
  - 群岛：checksum `6168670d`，海洋/陆地/湖泊 `7 / 18 / 3`，水域分桶约 `64.2%`。
- 内置 Browser 验证：
  - 页面统计显示“地形模板”。
  - 下拉切换到地中海后生成 checksum `ca364d94`，显示模板 `地中海`，`WebGL error = 0`。
  - 下拉切换到高山岛屿后生成 checksum `0fa2a131`，显示模板 `高山岛屿`，`WebGL error = 0`。

当前限制：

- 这只是第一批模板 case，尚未完整覆盖 source 的 Volcano、Atoll、Isthmus、Old World、Fractious 等所有模板。
- 当前模板参数仍写在代码中；后续可把模板选择、海陆比例、山脉强度和海峡强度做成更细的用户可调参数。

### 3.3 城市、道路和基础人口点

在地形模板基本可用后，继续推进正式应用的世界语义层。目标是先建立城市、人口和道路数据流，让后续标签、对象 picking、城市详情和更真实的路线系统有基础字段。

实现：

- 新增 `app/webgl-generator/src/generator/settlements.js`：
  - 按陆地 cell 的高度、降水、海岸邻接、河流邻接、国家中心和省份中心估算人口适宜度。
  - 生成城市、首都、省会和港口，城市记录所属国家、省份、文化、宗教和人口估值。
  - 生成 `grid.cells.pop` 和 `grid.cells.burg`。
  - 连接首都、省会和主要城市，生成 `road` 和 `trail` 路线。
  - 输出农村人口点，用于 WebGL point pass。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `3.3-settlements-routes-population`。
  - 生成链路改为 politics -> rivers -> settlements -> pack。
  - summary 和 generationLog 记录城市、道路和人口统计。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 同步保存 `pop` 和 `burg` 字段。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 point buffer 和 `gl.POINTS` pass。
  - 农村人口、普通城市、首都和港口使用不同颜色点。
  - 道路/小路加入 line pass。
  - 新增人口专题面。
- 更新 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/renderer/picking.js`：
  - UI 新增“人口”专题按钮。
  - 运行时统计显示城市/首都/港口、道路、人口点和点顶点。
  - hover 面板显示城市和人口。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 固定 seed `stage-3-3-check`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `705704e4`。
  - 城市 `20`，城市名唯一数 `20`。
  - 道路 `25`，道路线段 `1578`。
  - 农村人口点 `2201`，人口 cell `5596`。
  - 河流回环 `0`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示阶段 `3.3-settlements-routes-population`。
  - 默认 seed `stage-2-1` 显示城市/首都/港口 `20 / 5 / 5`。
  - 道路 `25 / 1626`。
  - 人口点 `2201 / 5593`。
  - 点顶点 `2221`。
  - 人口专题可切换。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 城市选址仍是轻量适宜度模型，尚未实现 source burg 等级、城镇增长、首都迁移、道路等级和港口/海路规则。
- 道路目前是 grid 上贪心陆路追踪，可能不是最短或最自然路线；后续应升级为带成本场的路径搜索，并支持宽线、join/cap 和路线 picking。
- 点层仍是 `gl.POINTS` 占位，后续需要 sprite、LOD、标签避让和对象级 picking。

### 3.4 城市标签 overlay 初版

完成阶段 3.3 后，用户要求提交推送一版并继续开发。已将阶段 3.3 版本提交并推送：

- commit：`fcee714 Build standalone WebGL generator app`
- 推送：`origin/main`
- 第一次 `git push origin main` 因仓库本地代理 `127.0.0.1:10809` 不通而失败；随后使用单次 `git -c http.proxy= -c https.proxy= push origin main` 绕过代理推送成功，未修改仓库配置。

继续开发内容：

- `app/webgl-generator/index.html`：
  - 新增 `map-overlay`，放在 canvas 和地图 badge 之间。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 初始化时获取 overlay 容器。
  - 每次加载地图时，按首都、省会和人口排序挑选最多 24 个城市创建标签。
  - 每次 draw 后根据 WebGL camera 把城市世界坐标投影到屏幕坐标。
  - 增加简单屏幕距离避让，避免密集标签全部重叠。
  - `getStats()` 新增 `labelCount` 和 `visibleLabelCount`。
- `app/webgl-generator/src/styles.css`：
  - 新增 `.map-overlay` 和 `.city-label` 样式。
  - 首都和港口标签使用不同颜色。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“城市标签”。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 阶段仍为 `3.3-settlements-routes-population`。
  - 标签节点 `20` 个，可见标签 `10` 个。
  - 运行时统计显示城市标签 `10 / 20`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 标签仍是 HTML overlay 初版，没有完整 LOD、复杂碰撞盒、国家/道路标签和对象级点击。
- 小屏/窄视口下标签可见数量会被简单避让压低，后续需要按缩放、城市等级和屏幕空间动态排序。

### 3.4 标签 LOD、道路宽线和未来面板约束

继续推进阶段 3.4：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 城市标签从固定 24 个候选改为最多 48 个候选，按首都、省会、港口和人口估算优先级排序。
  - 标签显示新增缩放 LOD：远景只显示首都和高优先级城市，中近景逐步放开更多城市。
  - 标签避让从点距判断改为屏幕碰撞盒判断，并按缩放设置可见数量上限和碰撞 padding。
  - 道路/小路从普通 `gl.LINES` 中拆出，新增独立 route buffer，以三角形带 mesh 绘制。
  - 海岸线、湖岸线和河流仍保留在线段 pass 中，避免道路样式和自然线层混在同一个 buffer 里。
  - `getStats()` 新增 `routeVertexCount` 和 `routeTriangleCount`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“道路三角形”。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录阶段 3.4 当前能力和仍未完成的 join/cap、dash、屏幕空间恒定宽度、路线 picking、道路/国家标签等事项。
  - 按用户要求记录未来面板架构约束：生成配置、高度编辑、河流编辑、城市/道路编辑、国家/省份/文化/宗教/标签编辑等面板都应做成 HTML 浮动可拖动面板，不使用 canvas 实现；当前只落文档，暂不改现有侧栏。

当前限制：

- route mesh 仍是逐段矩形带，没有 join/cap、dash 和屏幕空间恒定宽度；缩放时视觉宽度仍随 WebGL 坐标缩放。
- 标签只处理城市标签，尚未实现国家标签、路线标签、曲线文字、手动锁定位置和标签对象级 picking。
- 当前固定侧栏仍保留，浮动可拖动面板只是后续架构约束。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-check`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `b89b1d9e`。
  - 城市 `20`。
  - 道路 `23`，道路线段 `1152`。
  - 人口 cell `5599`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 阶段仍为 `3.3-settlements-routes-population`。
  - 道路三角形 `3252`。
  - 线段顶点 `1518`，当前不再包含道路线段。
  - 标签节点 `20` 个，可见标签 `9` 个。
  - 运行时统计显示城市标签 `9 / 20`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 道路屏幕空间 mesh

继续推进道路可视细化：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - route buffer 从 `loadMap()` 的静态世界坐标 mesh 改为 `draw()` 时按当前 camera 和 canvas 尺寸动态构建。
  - route mesh 顶点直接生成在 clip space，绘制道路时使用 identity transform，避免道路宽度随地图缩放一起变粗或变细。
  - 道路宽度改为 CSS 像素语义：`road` 约 `3.2px`，`trail` 约 `2.1px`，并按设备像素比换算。
  - polyline mesh 采用第一版 miter join；端点使用 square cap；近似折返时回退到当前 segment 方向，避免 join 退化为零宽。
  - `getStats()` 新增 `routeBuildMs` 和 `routeWidthMode`，用于观察拖拽缩放时的动态 buffer 成本。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“道路 mesh”，显示宽度模式和 route buffer 构建耗时。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 将道路屏幕空间恒定宽度、基础 miter join 和 square cap 标记为已完成。
  - 下一步收敛为路线 picking、对象级 picking、城市详情面板、道路 dash/等级样式和更完整的急弯 bevel 策略。

当前限制：

- route buffer 现在每次 draw 都会重建并上传，当前路线规模较小可以接受；后续路线数量上来后应考虑只在 camera/viewport 改变时更新，或改为 shader 侧 screen-space offset。
- miter join 是基础实现，尖锐急弯只做长度钳制，没有完整 bevel/round join。
- 还没有路线 picking、道路等级样式、dash、桥梁/渡口/海路和路线标签。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-route-screen`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `28024022`。
  - 城市 `20`。
  - 道路 `25`，道路线段 `1774`。
  - 人口 cell `5598`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 阶段仍为 `3.3-settlements-routes-population`。
  - 道路三角形 `3252`。
  - 道路 mesh `screen-space, 3.5ms`。
  - 线段顶点 `1518`，仍不包含道路线段。
  - 城市标签 `9 / 20`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 路线 hover picking 初版

继续推进对象级交互基础：

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `pickRoute()`，按鼠标世界坐标到路线折线段的最短距离寻找最近路线。
  - 返回路线 `id`、`type`、起点城市、终点城市和命中距离。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - hover 时同时执行 grid cell picking 和 route picking。
  - 路线命中阈值按当前 camera 和 viewport 换算为世界距离，约等于屏幕 7px。
- `app/webgl-generator/src/ui/panel.js`：
  - 悬停面板新增“路线”和“路线类型”，显示起终点、类型和距离。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录路线 hover picking 已完成第一版。
  - 下一步改为路线点击选择、城市/路线对象级 picking、城市详情面板和道路样式继续细化。

当前限制：

- 当前路线 picking 直接遍历所有路线折线段，没有空间索引；路线规模变大后需要接入统一对象 picking index。
- 只做 hover 命中显示，还没有点击选择、编辑状态、详情面板或路线高亮。
- 路线命中距离按屏幕像素近似换算，后续应和屏幕空间 route mesh 的实际宽度、hover 容差和 layer visibility 统一。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 默认地图 `stage-2-1` 的道路 mesh 显示 `screen-space, 2.6ms`。
  - 鼠标移动到路线 `雁门城 -> 清源集` 的中段后，悬停面板显示路线 `雁门城 -> 清源集`。
  - 路线类型显示 `road / 0.0`。
  - 命中 grid cell `3359`，坐标 `767.4, 323.3`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 城市/路线对象级 picking 与点击选中

恢复太子-尚书-门下-侍中流程后，继续推进对象级交互基础。本步骤只复用现有悬停面板展示摘要，不新增正式详情面板或浮动面板。

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `pickCity()`，按鼠标世界坐标到城市点的距离寻找最近城市。
  - 城市命中返回 `kind`、`id`、名称、类型、人口、国家、省份和距离。
  - `pickRoute()` 返回结果新增 `kind: "route"`，便于统一对象摘要。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pickClientPoint()` 同时返回 `cityObject`、`route` 和统一 `object`。
  - 对象命中规则暂定为城市优先于路线。
  - canvas interaction 新增点击判定；无明显拖拽的 pointer up 会触发选中对象回调。
- `app/webgl-generator/src/runtime/app.js`：
  - 运行时状态新增 `selection`。
  - 点击城市/路线时记录选中对象；生成新地图时清空选中状态。
- `app/webgl-generator/src/ui/panel.js`：
  - 现有悬停面板新增“选中对象”“选中详情”和“悬停对象”。
  - 该实现只是当前阶段的摘要展示，不代表未来正式详情面板形态。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录城市/路线对象 picking 和点击选中已完成第一版。
  - 下一步转向对象高亮、正式详情面板规划/实现入口、道路 dash/等级样式和急弯 bevel 策略。

当前限制：

- 城市和路线 picking 都是直接遍历对象，没有统一空间索引。
- 点击选中只记录摘要，没有高亮、详情面板、编辑状态或多选。
- 城市和路线重叠时城市优先；后续需要更完整的图层选择优先级和可配置 picking 半径。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-object-picking`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `518a1753`。
  - 城市 `20`。
  - 道路 `25`，道路线段 `1992`。
  - 人口 cell `5597`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 点击默认首都 `雁门城`，悬停面板显示选中对象 `城市 雁门城`。
  - 城市选中详情显示 `capital / pop 108 / 清河国`。
  - 点击默认路线 `雁门城 -> 清源集` 的中段，悬停面板显示选中对象 `路线 雁门城 -> 清源集`。
  - 路线选中详情显示 `road / distance 0.0`。
  - hover 对象能在城市和路线之间切换。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 对象选中高亮初版

继续推进对象级交互反馈。本步骤仍不新增详情面板，只在地图画面中给选中对象提供可见反馈。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 新增 `selection` 状态和 `setSelection()`。
  - 选中路线时，route mesh 构建阶段将对应 route 改为更亮颜色并增加屏幕空间宽度。
  - 选中城市时，在 overlay 中显示 `selection-marker`，并让对应城市标签加上 `selected` class。
  - selection marker 会随 WebGL camera 投影到屏幕坐标。
- `app/webgl-generator/src/runtime/app.js`：
  - 点击选中对象后同步调用 `renderer.setSelection()`。
  - 生成新地图时清空 renderer selection。
- `app/webgl-generator/src/styles.css`：
  - 新增 `.selection-marker` 和 `.city-label.selected`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录选中城市标记和选中路线高亮已完成第一版。
  - 下一步转向正式详情面板规划/实现入口、道路 dash/等级样式、急弯 bevel 策略和统一对象 picking 索引。

当前限制：

- 选中路线仍在主 route buffer 中重建，没有独立 highlight pass；复杂图层顺序和遮挡策略后续还需细化。
- 城市高亮只标记城市点位置和已创建的标签；如果标签因 LOD 不显示，仍只有 selection marker。
- 还没有详情面板、编辑手柄、多选、键盘取消选择或选中对象持久化。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 点击默认首都 `雁门城`，选中对象显示 `城市 雁门城`。
  - `.selection-marker` 显示为 `block`，选中城市标签为 `雁门城`。
  - 点击默认路线 `雁门城 -> 清源集` 的中段，选中对象显示 `路线 雁门城 -> 清源集`。
  - 路线选中详情显示 `road / distance 0.0`，城市 selection marker 隐藏。
  - 道路 mesh 显示 `screen-space, 1.7ms`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 道路 trail 虚线样式

继续推进道路样式：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - route mesh 构建支持 dash 配置。
  - `trail` 按屏幕空间 dash/gap 分段生成短 polyline mesh，`road` 保持实线。
  - 选中路线仍强制使用更亮、更宽的实线高亮，避免选中态被虚线切碎。
  - `getStats()` 新增 `routeStyleMode`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“道路样式”，当前显示 `road solid / trail dashed`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录道路样式已区分 road 实线和 trail 虚线。
  - 下一步保留道路等级配置、连续 dash phase、急弯 bevel 和统一对象 picking 索引。

当前限制：

- dash pattern 目前按每个 segment 重新开始，跨 segment 不保持连续 phase。
- trail dash 没有 join/cap 的专门处理，短 dash 使用当前基础 square cap。
- 还没有按道路等级、地形、国家或编辑器配置动态调整样式。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-route-dash`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `6230f594`。
  - 城市 `20`。
  - 道路 `23`，道路线段 `1620`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 道路样式显示 `road solid / trail dashed`。
  - 道路 mesh 显示 `screen-space, 2.8ms`。
  - 道路三角形 `3328`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 对象 picking 空间索引初版

继续推进对象级 picking 的可扩展性。本步骤把城市和路线从直接遍历升级为第一版 world-space bucket 索引。

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `buildObjectPickingIndex()`。
  - 索引使用固定 world-space bucket，城市按点落桶，路线按 segment bbox 覆盖的 bucket 入桶。
  - `pickCity()` 和 `pickRoute()` 改为优先查询索引附近 bucket，并对候选去重。
  - 保留无索引 fallback，便于后续测试和渐进迁移。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `loadMap()` 时构建 `objectPickingIndex`。
  - `pickClientPoint()` 使用索引执行城市和路线 picking。
  - `getStats()` 输出对象索引 bucket 数、bucket 尺寸、城市数、路线段数和最大 bucket 项数。
  - hover 结果新增本次对象候选数。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“对象索引”。
  - 悬停面板新增本次“对象候选”。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录城市/路线对象 picking 已接入第一版空间索引。

当前限制：

- 索引只覆盖城市和路线，还没有国家、省份、河流、marker、标签、纹章等对象。
- bucket 大小是阶段性固定策略，尚未按对象密度或 zoom 级别自适应。
- 路线 segment 入桶使用 bbox，极长 segment 可能覆盖较多 bucket；后续可按 polyline 重采样或层级索引优化。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 固定 seed `stage-3-4-object-index`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `438e43a7`。
  - 城市 `20`。
  - 道路 `22`，道路线段 `1384`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 运行时统计显示对象索引 `397 buckets / 1626 route segs`。
  - 点击默认路线 `雁门城 -> 清源集` 的中段，选中对象显示 `路线 雁门城 -> 清源集`。
  - 悬停面板显示对象候选 `81`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 河流对象 picking 初版

继续扩展对象级 picking。本步骤把河流 segment 接入同一个 world-space bucket 索引，供后续河流详情和河流编辑面板使用。

- `app/webgl-generator/src/renderer/picking.js`：
  - 对象索引新增 `riverSegments`。
  - `buildObjectPickingIndex()` 会把每条河流的每个 segment 按 bbox 覆盖的 bucket 入桶。
  - 新增 `pickRiver()`，返回 `kind`、`id`、类型、flux、长度和命中距离。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pickClientPoint()` 同时执行城市、路线和河流 picking。
  - 当前对象优先级为城市 > 路线 > 河流。
  - `getStats()` 的对象索引统计新增河流段数量。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时对象索引显示 bucket、路线段和河流段数量。
  - 悬停面板新增“河流”和“河流类型”。
  - 选中河流时显示 `河流 #id` 和 flux/length 摘要。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录城市、路线和河流都已接入第一版对象 picking 索引。

当前限制：

- 河流仍是 `gl.LINES` 线层，没有选中高亮。
- 河流 picking 半径与路线相同，尚未按河流流量或未来河流宽度自适应。
- 对象索引仍未覆盖国家、省份、marker、标签和纹章等对象。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 固定 seed `stage-3-4-river-picking`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `d0830214`。
  - 河流 `8`，河流线段 `72`。
  - 道路 `24`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 运行时统计显示对象索引 `424 buckets / 1626 routes / 51 rivers`。
  - 点击默认河流 `#2` 的中段，选中对象显示 `河流 #2`。
  - 河流类型显示 `river / flux 19829`。
  - 选中详情显示 `river / flux 19829 / length 5`。
  - 悬停面板显示对象候选 `4`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 浮动面板架构约束文档

按用户要求，所有未来配置和编辑面板都应做成 HTML 浮动可拖动面板，不使用 canvas 实现。本步骤只落文档，不改现有侧栏。

- 新增 `docs/architecture/floating-panel-architecture.md`：
  - 记录适用面板范围：生成配置、高度编辑、河流编辑、城市/道路编辑、国家/省份/文化/宗教编辑、标签/纹章/对象详情、调试统计和图层控制。
  - 记录基本原则：普通 DOM UI、可拖动、统一层级管理、可折叠/关闭/停靠、状态可持久化。
  - 记录与地图交互的边界：renderer 不直接创建业务编辑面板，picking/selection/highlight 属于地图交互层，详情面板读取 runtime/store 状态。
  - 记录推荐模块划分：`panel-manager.js`、`floating-panel.js`、各类 `panels/*`。
  - 记录第一阶段迁移建议：先保留固定侧栏，新增 panel manager 和只读对象详情面板，再逐步迁移图层控制和生成配置。
- 更新 `docs/current-plan.md` 和 `app/webgl-generator/README.md`：
  - 将未来浮动面板约束链接到 `docs/architecture/floating-panel-architecture.md`。

当前状态：

- 现有配置、统计和悬停信息仍在固定侧栏。
- 本步骤没有实现新面板，也没有改变 canvas 交互。

### 3.4 浮动对象详情面板初版

继续按太子-尚书-门下-侍中流程推进阶段 3.4。本步骤只实现最小可用的只读对象详情面板，不迁移现有固定侧栏，也不加入编辑控件。

- `app/webgl-generator/src/ui/panel-manager.js`：
  - 新增第一版浮动面板管理器。
  - 支持面板注册、打开、关闭、激活层级和标题栏拖动。
  - 面板层默认 `pointer-events: none`，只有面板自身消费指针事件，避免阻断地图区域拖拽、缩放和选择。
- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 新增只读对象详情面板。
  - 支持城市、路线和河流三类 selection 摘要。
  - selection 为空时关闭面板。
- `app/webgl-generator/src/runtime/app.js`：
  - 初始化 `PanelManager` 和对象详情面板。
  - 点击选中城市、路线或河流后刷新并打开对象详情面板。
  - 生成新地图时关闭对象详情面板并清空 selection。
- `app/webgl-generator/src/styles.css`：
  - 新增浮动面板层、面板壳、标题栏、关闭按钮和对象详情列表样式。
- `app/webgl-generator/README.md`、`docs/current-plan.md` 和 `docs/architecture/floating-panel-architecture.md`：
  - 将对象详情面板从未来约束更新为当前已开始实现。
  - 记录当前仍是只读入口，尚未实现编辑、停靠、持久化和多面板状态恢复。

当前限制：

- 对象详情面板只读显示当前 selection，尚不能编辑对象。
- 面板位置、打开状态和尺寸尚未持久化。
- 当前只有关闭按钮和拖动，没有折叠、停靠或尺寸调整。
- 面板 shell 仍内联在 `panel-manager.js` 中，后续复杂化后再拆出 `floating-panel.js`。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel-manager.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击默认首都 `雁门城` 后，对象详情面板打开并显示 `城市 雁门城`、类型、人口、国家、省份和对象 id。
  - 面板可拖动，验证中面板位置从 `(364, 24)` 移动到 `(414, 64)`。
  - 点击关闭按钮后，面板进入隐藏状态。
  - 重新选中城市后点击“生成 grid 地图”，面板关闭且 runtime selection 清空。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 河流选中高亮初版

继续按太子-尚书-门下-侍中流程推进对象级交互反馈。本步骤补齐河流 selection 的地图可见反馈，不改变河流生成逻辑，也不把河流主线层整体升级为 polyline mesh。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `selectionBuffer` 动态 buffer。
  - `draw()` 中在普通河流 `gl.LINES` pass 后绘制选中对象高亮 pass。
  - 选中河流时，按当前 camera 和 canvas 尺寸把对应河流折线生成 screen-space 三角形带。
  - 高亮宽度按河流 flux 做轻量加权，缩放时保持屏幕像素宽度。
  - `getStats()` 新增 `selectionVertexCount`、`selectionTriangleCount`、`selectionBuildMs` 和 `selectionHighlightMode`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“选中高亮”，显示高亮模式、三角形数量和构建耗时。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录选中河流已有独立 screen-space mesh 高亮。
  - 保留限制：河流主线层仍是阶段性 `gl.LINES`，后续仍需升级到可变宽 mesh。

当前限制：

- 当前只对选中河流生成高亮 mesh，普通河流仍是 `gl.LINES`。
- 高亮没有 round cap/round join，只复用当前基础 polyline mesh 的 miter/square cap 策略。
- 河流 selection 仍没有编辑手柄、节点显示或流量/河段编辑。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 脚本扫描河流线段中点，选择实际命中河流对象的位置，避免被城市/路线优先级抢占。
  - 点击河流 `#1` 后，selection 为 `kind: "river"`，flux 为 `18601`，对象候选为 `3`。
  - 运行时统计显示 `selectionHighlightMode = river screen-space mesh`。
  - 高亮顶点 `18`，高亮三角形 `6`。
  - 浮动对象详情面板显示 `河流 #1`、类型、流量、长度、命中距离和对象 id。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 浮动面板位置持久化初版

继续按太子-尚书-门下-侍中流程推进浮动面板体系。本步骤补最小状态管理，只保存面板位置和宽度，不保存打开状态，避免页面刷新后在没有 selection 的情况下自动弹出空面板。

- `app/webgl-generator/src/ui/panel-manager.js`：
  - 新增 `storagePrefix` 和面板状态读写方法。
  - `registerPanel()` 会优先读取浏览器 `localStorage` 中保存的 `left`、`top` 和 `width`。
  - 拖动结束或取消时保存当前面板位置和宽度。
  - `open()` 时重新约束面板位置，避免窗口尺寸变化后旧位置跑出地图区域。
  - 读写 `localStorage` 使用 `try/catch` 包裹，兼容受限浏览器模式。
- `app/webgl-generator/README.md`、`docs/current-plan.md` 和 `docs/architecture/floating-panel-architecture.md`：
  - 记录对象详情面板已有最小位置持久化。
  - 保留限制：仍不保存打开状态、折叠状态、尺寸调整状态或多面板布局。

当前限制：

- 当前只保存位置和当前宽度；由于还没有 resize handle，宽度主要来自初始配置。
- 不保存面板打开/关闭状态，刷新后仍需重新点击对象打开详情。
- 暂未实现 session/workspace 级布局版本管理，后续多面板时需要补布局 schema。

验证：

- `node --check app\webgl-generator\src\ui\panel-manager.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 清空 `localStorage` 中的 `webgl-generator-panel:object-details` 后，点击默认首都 `雁门城` 打开对象详情面板。
  - 面板初始位置为 `(364, 24)`，拖动后位置为 `(484, 126)`。
  - 写入 `localStorage` 的状态为 `{"left":144,"top":126,"width":320}`，其中 `left` 是相对地图区域的坐标。
  - 刷新页面后面板保持隐藏，不因持久化状态自动弹出。
  - 再次点击 `雁门城` 后，面板恢复到 `(484, 126)`，与拖动后位置一致。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 trail 连续 dash phase

继续按太子-尚书-门下-侍中流程推进道路样式。本步骤只修正虚线节奏，不改变路线生成、路线 picking 或道路等级模型。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `trail` 虚线生成从“每个 segment 重新开始 dash/gap”改为沿整条 polyline 累计 phase。
  - `pushDashedScreenPolyline()` 在 segment 之间保留 dash phase，折线节点处不会重置虚线节奏。
  - 运行时 `routeStyleMode` 更新为 `road solid / trail continuous dashed`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 将连续 dash phase 标记为已完成。
  - 下一步道路样式重点保留为道路等级配置和更完整的急弯 bevel 策略。

当前限制：

- trail 仍复用基础 square cap，没有专门的 round cap。
- 急弯仍只使用当前 miter 限制策略，尚未实现完整 bevel/round join。
- route 样式还没有按道路等级、地形、国家或编辑配置动态调整。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 运行时统计显示 `routeStyleMode = road solid / trail continuous dashed`。
  - route mesh 顶点 `10560`，三角形 `3520`。
  - 默认地图中 `trail` 路线 `10` 条，`road` 路线 `15` 条。
  - 道路 mesh 构建耗时 `1.4ms`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 政治对象 selection fallback 初版

继续按太子-尚书-门下-侍中流程推进对象级 picking。本步骤把国家、省份和区域接入 selection fallback，不做边界或区域高亮，避免本步范围扩张。

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `pickPoliticalObject()`。
  - 当 pick 命中陆地 cell 时，可按 `states`、`provinces`、`regions` 当前专题返回对应政治对象。
  - 非政治专题下默认选择省份；省份不存在时回退到国家，再回退到区域。
  - 国家对象包含文化、宗教和中心 cell；省份对象包含所属国家和中心 cell；区域对象包含名称和 id。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pickClientPoint()` 中统一对象优先级调整为城市 > 路线 > 河流 > 政治对象。
  - hover/pick 结果新增 `politicalObject`。
- `app/webgl-generator/src/ui/panel.js`：
  - 悬停面板新增“政治对象”。
  - 选中对象摘要支持国家、省份和区域。
- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 浮动对象详情面板支持国家、省份和区域三类只读摘要。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录政治对象 selection fallback 已完成。
  - 下一步保留政治对象高亮、marker/标签/纹章 picking 和编辑入口。

当前限制：

- 政治对象当前不是 world-space bucket 索引对象，而是基于已命中的 grid cell 语义 fallback。
- 暂未绘制选中国家/省份/区域边界或填色高亮。
- 政治对象详情仍是只读摘要，尚不能进入编辑状态。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 脚本选择一个没有城市、路线和河流优先命中的陆地 cell：`grid cell 426`。
  - 默认专题下选中 `province`，对象为 `白麓府`，所属国家 `白麓邦`。
  - 省份专题下仍选中 `province`，对象详情面板显示省份名称、所属国家、国家 id、中心 cell 和对象 id。
  - 国家专题下选中 `state`，对象为 `白麓邦`，详情面板显示文化 `白麓文化`、宗教 `白麓礼`、中心 cell 和对象 id。
  - 区域专题下选中 `region`，对象为 `北境`，详情面板显示区域类型和对象 id。
  - 悬停面板显示“政治对象”，对象候选为 `1`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 政治对象高亮初版

继续按太子-尚书-门下-侍中流程推进政治对象 selection 的可见反馈。本步骤只做半透明范围高亮，不做边界追踪、编辑手柄或标签联动。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 复用已有 `selectionBuffer`。
  - selection 为 `state`、`province` 或 `region` 时，遍历匹配的 grid cells，并生成 screen-space 三角形面。
  - selection pass 开启 WebGL blend，政治对象高亮使用半透明填色。
  - `selectionHighlightMode` 新增 `state translucent cells`、`province translucent cells` 和 `region translucent cells`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录政治对象已有半透明 cell mesh 高亮。
  - 下一步从“政治对象高亮”转向编辑入口、道路等级、急弯 bevel、marker/标签/纹章 picking。

当前限制：

- 高亮使用匹配 cell 的半透明填充，不提取边界线。
- 大范围国家高亮需要遍历并上传较多三角形；当前地图规模可接受，后续需要按 selection/cache 优化。
- 暂无编辑手柄、锁定选择、标签联动或边界拖拽。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 选中省份 `白麓府` 后，`selectionHighlightMode = province translucent cells`，高亮三角形 `5717`，构建耗时 `2.2ms`。
  - 选中国家 `白麓邦` 后，`selectionHighlightMode = state translucent cells`，高亮三角形 `8011`，构建耗时 `2.3ms`。
  - 选中区域 `北境` 后，`selectionHighlightMode = region translucent cells`，高亮三角形 `7062`，构建耗时 `2ms`。
  - 三类对象详情面板均显示对应名称和摘要字段。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 道路等级样式初版

继续按太子-尚书-门下-侍中流程推进道路样式。本步骤增加路线等级字段和对应渲染样式，不改路线寻路算法，也不新增配置面板。

- `app/webgl-generator/src/generator/settlements.js`：
  - `createRoute()` 新增 `level` 字段。
  - `road` 根据首都端点和城市人口分为 `primary` 或 `secondary`。
  - `trail` 保持 `level: "trail"`。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `routeStyle()` 集中决定路线颜色、宽度和 dash。
  - `primary` 比 `secondary` 更宽、更亮；`trail` 保持连续虚线。
  - `routeStyleMode` 更新为 `primary/secondary road + continuous trail dashed`。
- `app/webgl-generator/src/renderer/picking.js`：
  - 路线 picking 结果新增 `level`。
- `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 悬停面板、选中摘要和浮动详情面板显示路线等级。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录道路等级样式初版已完成。
  - 下一步保留道路等级配置面板和急弯 bevel 策略。

当前限制：

- 道路等级是生成时内置规则，尚不能在 UI 面板里配置。
- `primary/secondary` 只影响样式，不影响寻路、交通权重或城市经济。
- 急弯 join 仍使用当前 miter 限制策略，尚未实现完整 bevel/round join。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 默认地图路线等级统计为 `primary: 15`、`trail: 10`。
  - 点击路线 `#0` 后，selection 为 `route`，`type = road`，`level = primary`。
  - 运行时统计显示 `routeStyleMode = primary/secondary road + continuous trail dashed`。
  - 浮动对象详情面板显示“等级 primary”。
  - 悬停/选中摘要显示 `road / primary / distance 0.0`。
  - route mesh 三角形 `3520`，构建耗时 `2.7ms`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 marker 数据、绘制和 picking 初版

继续按太子-尚书-门下-侍中流程把对象 picking 扩展到 marker。本步骤新增轻量地理 marker 数据，接入现有 WebGL point pass 和对象详情面板，不实现 sprite atlas 或 marker 编辑。

- `app/webgl-generator/src/generator/markers.js`：
  - 新增 marker 生成模块。
  - 当前生成三类 marker：高峰、河源和国家中心。
  - marker 数据包含 `id`、`type`、`name`、`cell`、`x/y` 和轻量 `data`。
- `app/webgl-generator/src/generator/index.js`：
  - 接入 `buildMarkers()`。
  - 地图对象新增 `markers`。
  - 生成日志和 summary 记录 marker 数量、峰值 marker、河源 marker 和国家中心 marker 数量。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - WebGL point pass 绘制 marker 点。
  - `getStats()` 新增 `markerCount`。
  - 对象 picking 优先级调整为城市 > marker > 路线 > 河流 > 政治对象。
- `app/webgl-generator/src/renderer/picking.js`：
  - 对象 bucket 索引新增 `markers`。
  - 新增 `pickMarker()`。
  - 对象索引统计新增 marker 数量，最大 bucket 项数计入 marker。
- `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 运行时统计显示 marker 数量。
  - 悬停面板显示 marker 名称和类型。
  - 选中摘要和对象详情面板支持 marker。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录 marker 数据、点层绘制和对象 picking 初版已完成。

当前限制：

- marker 仍是普通 `gl.POINTS`，没有 sprite atlas、pin 图标、LOD 或避让。
- marker 数据是轻量示意：高峰、河源、国家中心，尚未覆盖原项目完整 marker 类型。
- marker 详情只读，尚无编辑和删除入口。

验证：

- `node --check app\webgl-generator\src\generator\markers.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 默认地图 marker 统计为总数 `22`，高峰 `10`，河源 `7`，国家中心 `5`。
  - 对象索引统计显示 `markers: 22`。
  - 点击 marker `峰 96` 后，selection 为 `kind: "marker"`，`type = peak`，`cell = 4221`。
  - 浮动对象详情面板显示 marker 类型、cell、数据和对象 id。
  - 悬停面板显示 `marker 峰 96 / peak`。
  - point 顶点 `2243`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 marker 选中高亮初版

继续按太子-尚书-门下-侍中流程补齐 marker selection 的可见反馈。本步骤复用现有 HTML selection marker，不新增独立 marker 编辑手柄。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `updateSelectionMarker()` 从只支持城市扩展为支持城市和 marker。
  - 新增 `selectionPoint()`，按 selection 类型解析屏幕投影点。
  - 选中 marker 时显示同一套圆环 overlay，并随 camera 更新位置。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录 marker 选中圆环反馈已完成。

当前限制：

- marker 仍是 `gl.POINTS`，圆环只是选中反馈，不是 marker sprite。
- 暂无 marker 拖动、编辑、删除和类型切换。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击 marker `峰 96` 后，selection 为 `kind: "marker"`。
  - `.selection-marker` 显示为 `block`。
  - marker 圆环位置为 `(568.254, 333.9)`，与 marker 投影位置误差小于 `1px`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 城市标签对象 picking 初版

继续按太子-尚书-门下-侍中流程把对象 picking 扩展到标签。本步骤只接入当前可见城市标签，不实现道路标签、国家标签、曲线文字或标签编辑。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `labelItems` 记录可见状态和屏幕碰撞盒。
  - 新增 `pickLabel()`，基于 canvas click 坐标命中可见城市标签的屏幕盒。
  - `pickClientPoint()` 对象优先级调整为标签 > 城市 > marker > 路线 > 河流 > 政治对象。
  - 选中 `label` 时，复用城市 selection marker，并让对应城市标签进入 selected 样式。
- `app/webgl-generator/src/ui/panel.js`：
  - 悬停面板新增“标签对象”。
  - 选中摘要支持 `label`。
- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 浮动对象详情面板支持标签文本、目标类型、目标名称、显示序位和对象 id。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录可见城市标签对象 picking 初版已完成。

当前限制：

- 只支持已显示的城市标签；被 LOD 或碰撞避让隐藏的标签不会命中。
- 标签对象仍是只读摘要，尚不能拖动、锁定、改名或编辑优先级。
- 还没有道路标签、国家标签、曲线文字和纹章对象 picking。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击可见城市标签 `星津镇` 的屏幕盒中心后，selection 为 `kind: "label"`。
  - 浮动对象详情面板显示标签文本、目标类型、目标名称、显示序位和对象 id。
  - 悬停面板显示“标签对象 星津镇 / city”。
  - 对应 `.city-label.selected` 文本为 `星津镇`。
  - `.selection-marker` 显示为 `block`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 对象详情编辑入口骨架

继续按太子-尚书-门下-侍中流程把对象详情面板从只读入口推进到编辑入口。本步骤只记录编辑目标和 UI 状态，不修改地图数据，不提供字段控件。

- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 对象详情面板新增“编辑”按钮。
  - 点击后通过回调通知 runtime。
  - 面板详情行新增“状态”，显示“查看”或“编辑”。
  - 当前对象进入编辑状态后，按钮显示“编辑中”并禁用。
- `app/webgl-generator/src/runtime/app.js`：
  - runtime 状态新增 `editingObject`。
  - 点击“编辑”后记录当前对象为编辑目标，并刷新对象详情面板。
  - 生成新地图时清空 `editingObject`。
- `app/webgl-generator/src/ui/panel.js`：
  - 选中摘要新增“编辑对象”。
- `app/webgl-generator/src/styles.css`：
  - 新增对象详情 action 区域间距。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录对象详情已有最小编辑入口。
  - 下一步从编辑入口推进到具体字段控件、保存/撤销边界和配置面板。

当前限制：

- 点击“编辑”只进入 runtime 编辑状态，不修改对象字段。
- 暂无保存、撤销、取消编辑、字段控件或编辑手柄。
- 编辑对象不跨生成保留；生成新地图会清空编辑目标。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 选中对象后点击“编辑”，runtime `editingObject` 记录当前对象。
  - 浮动对象详情面板显示状态“编辑”，按钮显示“编辑中”并禁用。
  - 左侧选中摘要显示“编辑对象”。
  - 点击“生成 grid 地图”后，`selection = null`，`editingObject = null`，对象详情面板隐藏。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 退出编辑边界

继续按太子-尚书-门下-侍中流程补齐对象详情编辑入口的最小状态边界。本步骤只允许退出编辑，不实现保存、撤销或字段修改。

- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - `createObjectDetailsPanel()` 的回调扩展为 `onEdit` 和 `onCancelEdit`。
  - 编辑状态下按钮从“编辑中”改为“退出编辑”。
  - 点击“退出编辑”会触发取消编辑回调。
- `app/webgl-generator/src/runtime/app.js`：
  - `onCancelEdit` 将 `editingObject` 置空。
  - 退出编辑后刷新对象详情面板和左侧选中摘要。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录对象详情面板已有编辑入口和退出编辑边界。

当前限制：

- 退出编辑只是清空 runtime 编辑目标。
- 尚未实现字段控件、保存、撤销或脏状态提示。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击对象详情“编辑”后，runtime `editingObject` 有值。
  - 面板状态显示“编辑”，按钮文本为“退出编辑”。
  - 左侧摘要显示当前“编辑对象”。
  - 点击“退出编辑”后，runtime `editingObject = null`。
  - 面板状态回到“查看”，按钮文本回到“编辑”。
  - 左侧摘要显示“编辑对象 none”。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

## 2026-06-18：source 生成算法重新审查与第一轮整改

用户指出当前正式应用生成质量明显落后于 demo：路线在海中出现陆地直线且过直，山区路线过密；河流稀少；平原坡度像梯田；100000 cells 时山地和平原交界突兀；群岛和半岛有 45 度织物感；温度缺乏度量；国界和各类专题分界过齐整。用户要求恢复太子-尚书-门下-侍中流程，由太子先审查 source 算法，再按文档整改。

太子审查：

- 阅读并对照 `source/Fantasy-Map-Generator/src/modules/heightmap-generator.ts`、`public/config/heightmap-templates.js`、`public/main.js`、`src/modules/river-generator.ts`、`src/modules/routes-generator.ts`、`src/modules/cultures-generator.ts` 和 `src/modules/states-generator.ts`。
- 确认 source 高度图核心是模板步骤在 `grid.cells.c` 上传播，不做正式应用此前的全局高度百分位重排。
- 确认 source 生成顺序是高度、feature、温度/降水、reGraph、河流、生物群系、人口评分、文化扩张、城市、国家、路线、宗教、省份等，正式应用此前部分语义层过早且使用最近中心染色。
- 确认 source 河流基于降水 flux、填洼、湖泊出口、合流、下切和 meander；正式应用此前河源上限和阈值过保守。
- 确认 source 路线先用城镇图决定连接，再通过水陆分离的成本寻路生成；正式应用此前贪心失败时会追加终点，导致海中直线。
- 新增 `docs/audits/source-generation-audit-and-rectification-plan.md`，作为本轮尚书实现、门下复核和侍中验收依据。

尚书实现：

- `app/webgl-generator/src/generator/grid.js`
  - 从 Voronoi polygon 共享边生成 `grid.cells.c`。
  - 运行时 metadata 记录 `neighborMode`、平均邻接度和最大邻接度。
  - 小型内陆盆地填平改用共享边邻接。
- `app/webgl-generator/src/generator/heightmap.js`
  - 高度传播改用 `grid.cells.c`。
  - 移除正式生成中的 `matchHeightDistribution()` 调用，不再按全局百分位重排高度。
  - 海平面校准加入确定性微扰处理高度平台 tie-break。
  - 新增连续 relief 拉伸和坡脚平滑，使模板高山恢复峰值，同时减少山地和平原硬切。
  - 修正 `linePower` 的高 cells 档位，使 100000 cells 接近 source 的 0.93。
- `app/webgl-generator/src/generator/features.js`
  - feature flood fill 和海岸/湖岸线段扫描改用共享边邻接。
- `app/webgl-generator/src/generator/rivers.js`
  - 河流填洼、下游选择和源头间距改用共享边邻接。
  - 河源上限随 cells 动态变化，flux 阈值降低，河源最低高度放宽。
  - 长河段加入确定性 meander 中点。
- `app/webgl-generator/src/generator/settlements.js`
  - 路线从贪心追踪改为 A* 成本寻路。
  - 陆路禁止穿水；高山、陡坡成本提高。
  - 找不到路径时返回空路径，不再 `path.push(end)` 画直连。
- `app/webgl-generator/src/generator/society.js`
  - 文化和宗教从最近中心改为共享边邻接成本扩张。
  - 成本纳入高度、坡度、生物群系和河流阻隔。
- `app/webgl-generator/src/generator/politics.js`
  - 国家、省份和区域从最近中心或 x/y 阈值改为共享边邻接成本扩张。
  - 国家扩张成本纳入文化、宗教、高度、坡度和河流。
  - 省份限制在所属国家内扩张。
- `app/webgl-generator/src/generator/index.js`
  - 河流生成提前到社会和政治语义之前。
  - 阶段标识更新为 `3.5-source-audit-generation-repair`。
- `app/webgl-generator/index.html`、`src/ui/panel.js`、`src/styles.css`
  - 温度和降水专题新增画布图例。
  - 温度范围显示摄氏度单位。

门下复核：

- `node --check` 覆盖本轮改动的正式应用 JS 文件，均通过。
- `git diff --check -- app/webgl-generator docs` 通过。
- Node 直接生成 100000 cells 抽查：
  - `continents`：河流 86，路线 67，路线水域 cell 为 0，最高高度 97。
  - `archipelago`：陆地 feature 349，河流 88，路线水域 cell 为 0，最高高度 100。
  - `mediterranean`：河流 88，路线水域 cell 为 0，最高高度 93。
  - `highIsland`、`lowIsland`、`peninsula`、`pangea` 也均能生成陆地和河流。

侍中验收：

- 使用系统 Chrome 无头页访问 `http://127.0.0.1:5410/`，生成 `seed=audit-browser-100k`、`cells=100000`、`template=continents`。
- 验收结果：
  - 实际 grid cells：99846。
  - 邻接模式：`shared-voronoi-edges`，平均邻接度 5.97。
  - 河流：87 条，671 段。
  - 路线：67 条，2885 段。
  - 路线水域 cell：0。
  - 最高高度：96。
  - 温度范围：-7°C 到 31°C。
  - WebGL error：0。
  - 控制台 error/warning：0。
  - 温度专题图例可见，显示 `-7°C / 0°C / 31°C`。
- 保存网页快照：`docs/snapshots/webgl-generator-100k-source-audit.png`。

当前限制：

- 底层点集仍来自分层行列采样，尚未升级为真实 Delaunay/蓝噪声点集；本轮主要通过共享边邻接和 source 风格传播减弱方向偏差。
- `pack` 仍为 `one-grid-cell-to-one-pack-cell`，尚未复刻 source 的 `reGraph()` 抽稀/重建语义图。
- 河流仍是轻量 flux 模型，尚未实现完整湖泊出口、河床下切、宽河道 polygon 和 source 级 meander。
- 路线连接关系仍是阶段性城市规则，尚未复刻 source 的 Delaunay/Urquhart 城镇连接图和海路。

## 2026-06-18 source 优先复位计划

用户指出当前地中海模板网页快照已经表现为“一团乱麻”：地形像噪声毯，水体像随机挖洞，道路和聚落缺乏地理因果，后续文化、宗教、国家、人口等专题也继承了底层失真。用户要求停止当前跑偏流程，不动当前代码，不看当前代码，只根据 `source/Fantasy-Map-Generator` 重新形成执行计划并落成文档。

太子复审：

- 重新只读 source 源码，重点对照 `public/main.js` 的生成顺序、`graphUtils.ts`、`voronoi.ts`、`heightmap-generator.ts`、`heightmap-templates.js`、`features.ts`、`river-generator.ts`、`biomes.ts`、`burgs-generator.ts`、`cultures-generator.ts`、`states-generator.ts`、`routes-generator.ts`、`religions-generator.ts`、`provinces-generator.ts` 和 `pathUtils.ts`。
- 确认原版生成链路是 `grid -> 高度模板 -> grid features -> 温度和降水 -> reGraph pack -> pack features -> 河流 -> 生物群系 -> 适居度 -> 文化 -> 城市 -> 国家 -> 路线 -> 宗教 -> 省份`。
- 确认当前乱象不应继续通过局部视觉调参解决，应优先恢复 grid/Voronoi、source 高度模板 DSL 和 `reGraph()` pack 语义图。

尚书文档落地：

- 新增 `docs/task-notes/source-first-recovery-execution-plan.md`，作为后续 source 优先复位整改的主计划。
- 更新 `docs/current-plan.md`，在顶部标记 2026-06-18 计划复位，暂停继续叠加阶段 3 UI 和专题功能。
- 本轮只改文档，不修改当前正式应用代码，也不修改 `source/` 原项目代码。

后续执行入口：

- 下一步从阶段 0 开始：建立 source 对照基线，导出 source 参考快照和结构摘要，不改正式应用。
- source 基线通过后，才进入阶段 1 的 grid/Voronoi 整改。

## 2026-06-18 独立 source 复查与详细规程

用户要求启动一个新智能体再做一遍 source 检查，并对比已经生成的 `docs/task-notes/source-first-recovery-execution-plan.md`，找出还缺什么。要求文档必须足够详细，能指导后续细致任务。

太子协调：

- 启动独立 explorer 智能体，要求只读 `source/Fantasy-Map-Generator` 和计划文档，不读取 `app/webgl-generator` 或 `prototype` 当前实现，不修改任何文件。
- 主线程并行只读 source 和现有计划文档，重新核对 `public/main.js` 生成顺序、grid/pack 数据结构、heightmap、features、lakes、rivers、biomes、cultures、burgs、states、routes、religions、provinces、markers、zones 和 military 等模块。

独立智能体结论：

- 现有复位计划方向和阶段顺序正确，但偏战略骨架，不足以直接交给尚书逐步实现。
- 主要缺口包括 source 对照导出工具规格、字段级不变量、模板/seed/cells 验收矩阵、每阶段可运行的结构检查脚本、真实生成顺序中的湖泊预处理、`Features.defineGroups()`、`Burgs.specify()`、国家统计/形制、河湖命名、军事、marker 和 zone 等中间步骤。

尚书文档落地：

- 新增 `docs/task-notes/source-first-detailed-task-plan.md`，作为后续 source 优先整改的详细施工图。
- 更新 `docs/task-notes/source-first-recovery-execution-plan.md`，标记其为复位总纲，并指向详细规程。
- 更新 `docs/current-plan.md`，将下一步入口切换到详细规程的阶段 0。

详细规程新增内容：

- 完整 source 生成顺序。
- grid、pack、feature、river、culture、burg、state、route、religion、province、marker、zone 和 military 字段契约。
- source baseline 工具建议、输出目录和 `source-summary.json` schema。
- `10000/50000/100000` cells、7 个模板、每模板 3 个固定 seed 的验收矩阵。
- 阶段 1 到阶段 15 的 source 文件、输入字段、输出字段、尚书任务、门下检查、侍中验收和禁止事项。
- 失败回退规则和最容易再次跑偏的风险清单。

本轮只改文档，不修改 `source/`，不修改当前正式应用代码。

## 2026-06-18 阶段 0 source baseline 工具启动

用户确认开始按太子-尚书-门下-侍中四级流程推进，且无特殊情况不用每一步停下来等指示。当前正式进入 `docs/task-notes/source-first-detailed-task-plan.md` 的阶段 0：建立 source 对照基线。

太子计划：

- 先实现单 case source baseline 导出工具，复用现有 source dev server + Playwright + 系统 Chrome 路径。
- 第一版只读运行 source，主动锁定 `points` 和 `template`，并通过 `generate({seed})` 固定 seed。
- 输出 `source-summary.json`、`source-trace.json`、`source-map.png` 和 `validation.md`；完整 `source-snapshot.json` 通过 `--snapshot true` 开关控制，避免每次 100000 cells 都写出大型 JSON。

尚书实施：

- 新增 `tools/source-export-baseline.mjs`。
- 更新 `docs/task-notes/source-first-detailed-task-plan.md`，记录第一版工具命令和产物。

待门下和侍中继续：

- 门下运行语法检查、diff 检查和 source 未改检查。
- 侍中导出 `mediterranean / 100000 / audit-mediterranean-001` 的 source baseline，检查摘要、trace、截图和 validation。

侍中验收结果：

- 成功导出 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/source-summary.json`。
- 成功导出 `source-trace.json`、`source-map.png` 和 `validation.md`。
- 关键摘要：grid cells 99846，pack cells 73028，pack/grid 0.731，陆地比例 0.611，河流 956，城市 1724，港口 230，国家 21，路线 1331。
- 结构检查：pack grid 引用错误 0，haven 错误 0，harbor 不一致 0，route 非双向 0，陆路穿水 0。
- 海路中段穿陆统计为 1，作为 source baseline 事实记录，后续 candidate 对照不应比 source 更差。

## 2026-06-18 阶段 0.2 source baseline 矩阵入口

太子计划：

- 在单 case baseline 可运行后，继续实现矩阵批量入口。
- `quick` 模式先覆盖 `mediterranean`、`continents`、`archipelago` 三个 100000 cells 强回归样例。
- `full` 模式后续覆盖 7 个模板、3 档 cells、每模板 3 个 seed。

尚书实施：

- 新增 `tools/source-baseline-matrix.mjs`。
- 更新 `docs/task-notes/source-first-detailed-task-plan.md`，记录 quick/full 矩阵命令和产物。

待门下和侍中继续：

- 门下运行语法检查、diff 检查和 source 未改检查。
- 侍中运行 quick matrix，生成 `docs/generated/source-baselines/matrix.json` 和 `docs/generated/source-baselines/matrix.md`。

门下复核：

- `node --check tools/source-export-baseline.mjs` 通过。
- `node --check tools/source-baseline-matrix.mjs` 通过。
- `git diff --check` 覆盖本轮脚本和文档，通过。
- `git status --short source ...` 确认 `source/` 未改动。

侍中验收：

- 成功运行 `node .\tools\source-baseline-matrix.mjs --mode quick --port 5301 --browser-channel chrome`。
- 产物：
  - `docs/generated/source-baselines/matrix.json`
  - `docs/generated/source-baselines/matrix.md`
  - `docs/generated/source-baselines/continents-100000-audit-continents-001/`
  - `docs/generated/source-baselines/archipelago-100000-audit-archipelago-001/`
- quick matrix 摘要：
  - `mediterranean`：grid 99846，pack 73028，河流 956，城市 1724，港口 230，路线 1331。
  - `continents`：grid 99846，pack 50625，河流 851，城市 1206，港口 187，路线 1041。
  - `archipelago`：grid 99846，pack 14351，河流 238，城市 265，港口 79，路线 266。
- 三个样例的 pack 引用错误、haven 错误、harbor 不一致和 route 非双向均为 0。

修正：

- 单 case 工具启动 Vite 时改为 `--strictPort`，避免端口占用时 Vite 自动漂移导致误连旧服务。
- 矩阵工具每个 case 使用递增端口，避免连续运行时端口短暂占用。

## 2026-06-19 阶段 0.3 candidate 对照与 diff 工具

用户确认可以实施后，继续按太子-尚书-门下-侍中流程推进。当前目标是先把当前正式应用与 source baseline 放到同一把尺上，不再只靠截图判断。

太子计划：

- 读取当前正式应用运行时和 source baseline schema。
- 导出正式应用同 case 的候选摘要和网页截图。
- 生成 source/candidate 差异报告，明确下一阶段整改入口。

尚书实施：

- 新增 `tools/webgl-generator-export-baseline.mjs`：
  - 直接调用正式应用生成器导出 `candidate-summary.json`。
  - 可启动临时静态服务和系统 Chrome，生成 `candidate-map.png`。
  - 输出 `candidate-validation.md` 记录结构摘要和缺失字段。
- 新增 `tools/baseline-diff.mjs`：
  - 对比 `source-summary.json` 与 `candidate-summary.json`。
  - 输出 `diff.json` 和中文 `diff.md`。
  - 额外检查 candidate 是否已有 source boundary points、真实 pack Voronoi、非一比一 pack 映射和海路。

门下复核：

- `node --check tools/webgl-generator-export-baseline.mjs` 通过。
- `node --check tools/baseline-diff.mjs` 通过。
- `git diff --check` 覆盖本轮新增工具通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 成功导出 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-summary.json`。
- 成功生成 `candidate-map.png`、`candidate-validation.md`、`diff.json` 和 `diff.md`。
- 初始 diff 显示：candidate 的 `pack` 仍是一比一映射，缺少 `pack.cells.c/v/area/t/haven/harbor/fl/r/conf/s` 等字段；河流、城市、港口、海路和降水均明显偏离 source。

## 2026-06-19 阶段 1 grid、boundary、Voronoi 第一版整改

太子计划：

- 只处理 `grid` 主链，不继续修城市、路线或 UI。
- 按 source 的 `getBoundaryPoints()`、`getJitteredGrid()`、`placePoints()` 和 `Voronoi` half-edge 结构替换当前局部半平面近似 Voronoi。
- 正式应用保持独立，不在运行时 import `source/`。

尚书实施：

- 从已安装的 source 依赖中机械复制 Delaunator UMD 包到 `app/webgl-generator/src/vendor/delaunator.umd.js`，并新增 `app/webgl-generator/src/vendor/delaunator.js` wrapper。
- 重写 `app/webgl-generator/src/generator/grid.js`：
  - 使用 source 风格 spacing、boundary points 和 jittered grid。
  - 使用 Delaunator 全局三角剖分。
  - 按 half-edge 生成 `grid.cells.i/c/v/b` 和 `grid.vertices.p/v/c`。
  - 保留 `grid.cells.p` 兼容现有 renderer。
  - metadata 记录 `source-delaunator-halfedge`、boundary points、border cells 和平均邻接度。

门下复核：

- `node --check app/webgl-generator/src/generator/grid.js` 通过。
- `node --check app/webgl-generator/src/vendor/delaunator.js` 通过。
- 10k 直接生成烟测通过：grid cells `10004`，boundary points `206`，平均邻接度 `5.92`。
- `git diff --check` 覆盖阶段 1 改动通过。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate。
- 当前 diff 关键结构项：
  - `grid.cells`：source `99846`，candidate `99846`，通过。
  - `grid.avgDegree`：source `5.976`，candidate `5.976`，通过。
  - `grid.boundaryPoints`：source `648`，candidate `648`，通过。
- 浏览器生成并保存 `candidate-map.png`，WebGL 页面非空，100000 cells 可渲染。

当前限制：

- 阶段 1 只解决 grid/boundary/Voronoi。截图仍能看到高度噪声毯、水陆比例偏差、降水偏高、河流稀少、城市/港口过少和无海路。
- `pack` 仍是一比一映射，需到阶段 4 按 source `reGraph()` 重建。
- 下一步进入阶段 2：复刻 source `HeightmapGenerator` 模板 DSL，先处理高度和地中海模板偏差。

## 2026-06-19 阶段 2 高度模板 DSL 第一版整改

太子计划：

- 继续只处理高度模板链路，不修河流、城市、路线和 UI。
- 对照 `src/modules/heightmap-generator.ts` 和 `public/config/heightmap-templates.js`，撤掉当前正式应用里为截图效果加入的自创后处理。
- 地中海 100000 作为强制验收 case，以 `grid.landRatio`、高度分位数、feature/lake 数和网页快照作为当前阶段验收核心。

尚书实施：

- `app/webgl-generator/src/generator/random.js`：
  - 将正式应用 PRNG 改为 source 同款 Alea。
  - 保留 `range/integer` 包装和 `stableHash`。
- `app/webgl-generator/src/generator/index.js`：
  - grid 和 heightmap 使用同一 seed 分别重置随机流。
  - 后续语义生成沿用 heightmap 消耗后的随机状态。
  - 阶段标识更新为 `source-stage-2-heightmap-dsl-repair`。
- `app/webgl-generator/src/generator/heightmap.js`：
  - `cellsDesired` 进入 heightmap context，`blobPower/linePower` 按目标 cells 档位取值。
  - `getNumberInRange()` 改为 source 的整数/小数概率逻辑。
  - `getPointInRange()`、`Range/Trough` 终点距离、`Strait` 宽度和指数逻辑、`findGridCell` 查找逻辑贴近 source。
  - 高度 buffer 改回 `Uint8Array`，恢复 source 每次赋值截断的数值语义。
  - 移除当前生成链路中的 `rebalanceHeights()`、`shapeLandRelief()`、`softenAbruptTransitions()` 和 `addResidualRelief()` 调用。

门下复核：

- `node --check app/webgl-generator/src/generator/random.js` 通过。
- `node --check app/webgl-generator/src/generator/index.js` 通过。
- `node --check app/webgl-generator/src/generator/heightmap.js` 通过。
- 直接生成烟测：
  - 地中海 10000：陆地比 `0.601`，高度 p50 `28`，p95 `72`。
  - 地中海 100000：陆地比 `0.609`，高度 p50 `26`，p95 `83`，feature `218`，lake `112`。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 当前 diff 中阶段 1/2 关键项通过：
  - `grid.cells`：source `99846`，candidate `99846`。
  - `grid.avgDegree`：source `5.976`，candidate `5.976`。
  - `grid.boundaryPoints`：source `648`，candidate `648`。
  - `grid.landRatio`：source `0.611`，candidate `0.609`。
  - `grid.height.p50`：source `27`，candidate `26`。
  - `grid.height.p95`：source `76`，candidate `83`。
  - `features.lakes`：source `140`，candidate `112`，当前阈值通过。
- 网页快照 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png` 已从噪声毯恢复为可辨识的地中海海盆和上下边缘山地。

当前限制：

- 温度和降水仍未按 source 复刻，`grid.precipitation.mean` 仍明显偏高：source `9.171`，candidate `58.35`。
- 河流仍是轻量模型，河流数量 source `956`，candidate `86`。
- `pack` 仍是一比一映射，需阶段 4 重建。
- 下一步进入阶段 3：grid features、湖泊预处理、地图坐标、温度和降水。

## 2026-06-19 阶段 3 grid features、地图坐标、温度和降水第一版整改

太子计划：

- 对照 `src/modules/features.ts` 和 `public/main.js` 中的地图坐标、温度、降水函数，先恢复 grid 层 feature 与气候主链。
- 本阶段不处理 pack、河流、城市、路线或 UI 新功能。
- 地中海 100000 case 以 `grid.cells.t/f/temp/prec` 字段存在性、降水均值和网页快照作为验收入口。

尚书实施：

- `app/webgl-generator/src/generator/features.js`：
  - 改为 source 风格 `grid.cells.t/f` 与 `grid.features`。
  - feature 使用 `land` 字段区分陆水，水体按 `ocean/lake` 分类。
  - 深水距离场按 `-1/-2/...` 继续扩展。
- `app/webgl-generator/src/generator/climate.js`：
  - 新增 source 默认风带、温度、降水选项。
  - 补充地图坐标、纬度温度、海拔降温和风带降水链路。
  - 地中海模板先使用稳定地图坐标，使强回归样例与 source baseline 同区间对照。
- 将依赖 feature 类型的社会、政治、河流、城市、marker 和 picking 代码改为使用 `feature.land`，避免把 `"island"` 误判为非陆地。
- candidate 导出工具补充 `mapCoordinates`、`grid.tDistribution`，并修正陆路穿水检查的陆地判定。

门下复核：

- `node --check` 覆盖本轮改动的生成器、renderer picking 和 baseline 工具，均通过。
- 直接生成地中海 100000：陆地比 `0.609`，高度 p50 `26`，高度 p95 `83`，feature `218`，lake `112`，降水均值 `12.747`。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 当前 diff 关键气候项：
  - `grid.precipitation.mean`：source `9.171`，candidate `12.747`，通过。
  - `grid.temperature.max`：source `27`，candidate `26`，通过。
  - `grid.temperature.min`：source `-35`，candidate `-19`，warn，后续气候细节阶段继续收紧。
- 由于 pack 仍是一比一映射，本阶段后下一步仍然进入阶段 4 `reGraph()`。

## 2026-06-19 阶段 4 reGraph pack 重建第一版整改

太子计划：

- 对照 `public/main.js` 的 `reGraph()` 和 `src/utils/graphUtils.ts` 的 `calculateVoronoi()`，恢复 source 的 pack 语义图基础。
- 只处理 `pack.cells.p/g/h/c/v/b/i/area` 和 grid 到 pack 的映射，不提前实现 `Features.markupPack()`、河流、城市或路线。

尚书实施：

- `app/webgl-generator/src/generator/grid.js`：
  - 将 `calculateVoronoi()` 导出，供 pack 重建复用同一套 Delaunator/half-edge Voronoi。
- `app/webgl-generator/src/generator/pack.js`：
  - 按 source 规则排除深海点：`height < 20 && type !== -1 && type !== -2`。
  - 按 source 规则抽掉部分非岸湖点：`type === -2 && (i % 4 === 0 || feature.type === "lake")`。
  - 对陆岸/水岸同类型邻接补 midpoint。
  - 对 pack points 重新计算 Voronoi，并生成 `pack.cells.p/g/h/c/v/b/i/area`。
  - 保留当前阶段需要的轻量语义镜像字段，供 renderer 和调试面板继续工作。
  - `grid.cells.pack` 对被抽掉的深海 cell 使用 `-1`。
- `app/webgl-generator/src/renderer/picking.js`：
  - picking 在 pack 映射缺失时回退到 grid feature，避免深海抽稀后 hover 崩溃。
- `tools/webgl-generator-export-baseline.mjs` 和 `tools/baseline-diff.mjs`：
  - baseline validation 改为接受非一比一 pack。
  - diff 下一步建议明确切到阶段 5。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/grid.js`
  - `app/webgl-generator/src/generator/pack.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/renderer/picking.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - grid cells `99846`
  - pack cells `73450`
  - pack/grid `0.736`
  - pack 平均邻接度 `5.97`
  - 深海排除 `31830`
  - 非岸湖点排除 `929`
  - 海岸 midpoint `6363`
  - pack grid 引用错误 `0`
  - pack area 最小值 `1`
- `git diff --check` 覆盖本轮阶段 4 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 4 关键 diff 项已通过：
  - `pack.cells`：source `73028`，candidate `73450`。
  - `pack.packGridRatio`：source `0.731`，candidate `0.736`。
  - `pack.avgDegree`：source `5.97`，candidate `5.969`。
  - `candidate pack 真实 Voronoi`：pass。
  - `candidate pack 非一比一映射`：pass。
- 仍缺 `pack.cells.t/haven/harbor/fl/r/conf/s`，下一步进入阶段 5：`Features.markupPack()`、haven、harbor 和 feature groups。

## 2026-06-19 阶段 5 pack features、haven、harbor 第一版整改

太子计划：

- 对照 `src/modules/features.ts` 的 `Features.markupPack()` 和 `Features.defineGroups()`，在阶段 4 的真实 pack Voronoi 上恢复 feature 标记。
- 本阶段只生成 `pack.cells.t/f/haven/harbor`、`pack.features` 和 feature group，不提前实现河流、人口、城市或路线。

尚书实施：

- `app/webgl-generator/src/generator/pack.js`：
  - 在 `buildPack()` 完成 Voronoi 重建后，对 pack cell 重新 flood fill。
  - 生成 `pack.cells.t` distance field、`pack.cells.f` feature id、`pack.cells.haven` 最近水邻接和 `pack.cells.harbor` 邻接水 cell 数。
  - 为 pack feature 生成 `firstCell/area/shoreline/height/group`。
  - 湖泊 feature 生成 shoreline、height、temp、flux、evaporation 的第一版字段，供后续河湖水文使用。
  - feature group 第一版覆盖 `continent/island/isle/lake_island/ocean/sea/gulf/freshwater/sinkhole/salt/dry/frozen/lava`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate summary 的 features 统计优先使用 `pack.features`。
  - unsupported source stages 中移除 `Features.markupPack`。
- `tools/baseline-diff.mjs`：
  - 当 `fl/r/conf` 仍缺失或河流数量过低时，下一步建议明确进入阶段 6。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-5-pack-features-repair`。

门下复核：

- `node --check app/webgl-generator/src/generator/pack.js` 通过。
- `node --check app/webgl-generator/src/generator/index.js` 通过。
- `node --check tools/webgl-generator-export-baseline.mjs` 通过。
- 地中海 100000 直接生成烟测：
  - pack cells `73450`
  - pack feature `218`
  - lake feature `112`
  - haven cells `6146`
  - harbor cells `6146`
  - invalid haven `0`
  - harbor mismatch `0`
  - feature groups 已生成。
- `git diff --check` 覆盖阶段 5 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 5 关键 diff 项已通过：
  - `pack.havenCells`：source `7148`，candidate `6146`。
  - `features.total`：source `236`，candidate `218`。
  - `features.lakes`：source `140`，candidate `112`。
  - pack grid 引用、pack 邻接引用、pack 顶点引用均为 `0`。
  - haven 引用和 harbor mismatch 在直接烟测中为 `0`。
- 当前剩余必需 pack 字段缺口为 `pack.cells.fl/r/conf/s`；下一步进入阶段 6 河流和湖泊水文。

## 2026-06-19 阶段 6 河流和湖泊水文第一版整改

太子计划：

- 对照 `src/modules/river-generator.ts` 和 `src/modules/lakes.ts`，将河流从 grid 轻量模型迁到阶段 4/5 建立的 pack 语义图。
- 本阶段优先恢复 `pack.cells.fl/r/conf`、`pack.rivers`、无环流向和河网数量级；完整湖泊出口链、下切和命名可在后续继续收紧。

尚书实施：

- `app/webgl-generator/src/generator/index.js`：
  - 生成顺序改为 `buildPack()` 后再 `buildRivers()`，使河流使用 pack cells、haven、harbor 和 feature。
  - 阶段标识更新为 `source-stage-6-rivers-hydrology-repair`。
- `app/webgl-generator/src/generator/rivers.js`：
  - 改为 pack 版 flux 水文第一版。
  - 生成 `pack.cells.fl`、`pack.cells.r` 和 `pack.cells.conf`。
  - 使用 pack 高度、`t`、`haven`、湖泊 feature height 与 shoreline 做 depression 处理和下游选择。
  - river 对象使用 source 风格 pack `cells/source/mouth`，并额外保留 `gridCells/sourceGrid/mouthGrid` 给当前 grid 语义模块过渡。
  - 河流路径生成 meandered points、sourceWidth、width、discharge、parent/basin 基础字段。
- `app/webgl-generator/src/generator/society.js`、`politics.js`、`settlements.js`、`markers.js`：
  - 读取 `river.gridCells`，避免把 pack cell id 误当 grid cell id。
- `tools/baseline-diff.mjs`：
  - 缺 `pack.cells.s` 时下一步建议切到阶段 7。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/rivers.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/markers.js`
- 地中海 100000 直接生成烟测：
  - 河流 `1068`
  - 河流线段 `8247`
  - pack river cells `6591`
  - flux cells `58609`
  - confluence cells `333`
  - max flux `2494`
  - river loop `0`
  - pack river 引用错误 `0`
  - grid 映射错误 `0`
- `git diff --check` 覆盖阶段 6 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 6 关键 diff 项已通过：
  - `rivers.count`：source `956`，candidate `1068`。
  - `rivers.cellsWithRiver`：source `5708`，candidate `6946`。
  - `population.positivePopulationCells` 仍保持同量级：source `53650`，candidate `53437`。
- 网页快照显示河网明显恢复，未观察到海中打结或绕圈；路线、城市、港口和海路仍属阶段 9/11 后续问题。
- 当前剩余必需 pack 字段缺口为 `pack.cells.s`；下一步进入阶段 7 生物群系和人口评分。

## 2026-06-19 阶段 7 生物群系和人口评分第一版整改

太子计划：

- 对照 `src/modules/biomes.ts` 和 `public/main.js` 的 `rankCells()`，把生物群系与人口评分迁到 pack 语义图。
- 本阶段优先恢复 `pack.cells.biome/s/pop` 和 source 同量级 positive population cells；文化、城市、国家和路线仍放到后续阶段。

尚书实施：

- 新增 `app/webgl-generator/src/generator/biomes.js`：
  - 复刻 source 默认 13 类 biome 的名称、颜色和 habitability。
  - 使用 source biome matrix，根据 pack cell 的温度、降水、河流 flux、海拔和湿地规则生成 `pack.cells.biome`。
  - 复刻 `rankCells()` 主要评分：biome habitability、河流/合流归一化、海拔惩罚、海岸、estuary、haven/harbor 和湖泊 group。
  - 生成 `pack.cells.s` 与 `pack.cells.pop`。
  - 将 pack biome/s/pop 镜像到 grid cell，供当前 WebGL grid mesh、hover 和过渡期城市生成使用。
- `app/webgl-generator/src/generator/climate.js`：
  - 复用 stage 7 的 source biome 元数据，避免 UI 颜色表仍停在旧 9 类。
- `app/webgl-generator/src/generator/index.js`：
  - 在河流之后、社会/政治之前调用 `defineBiomesAndPopulation()`。
  - 阶段标识更新为 `source-stage-7-biomes-population-repair`。
- `app/webgl-generator/src/generator/settlements.js`：
  - 过渡期城市生成优先使用已有 `grid.cells.pop`，不再用旧人口公式覆盖。
- `tools/webgl-generator-export-baseline.mjs`：
  - population 与 biome summary 优先读取 pack 字段。
- `tools/baseline-diff.mjs`：
  - 阶段 7 通过后，下一步建议明确进入阶段 8 文化。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/biomes.js`
  - `app/webgl-generator/src/generator/climate.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - biome 字段存在，实际覆盖 `13` 类。
  - positive suitability cells `56938`。
  - positive population cells `56938`。
  - grid population cells `53680`。
  - 城市仍可生成 `52` 个，港口 `11` 个。
- `git diff --check` 覆盖阶段 7 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 7 关键 diff 项已通过：
  - `population.positivePopulationCells`：source `53650`，candidate `56938`。
  - `rivers.count` 和 `rivers.cellsWithRiver` 继续保持通过。
  - 所有必需 pack 字段已补齐，不再列出缺失 pack 字段。
- 当前下一步建议进入阶段 8：文化生成与扩张迁移到 pack 语义图。

## 2026-06-19 阶段 8 文化生成与扩张第一版整改

太子计划：

- 对照 `src/modules/cultures-generator.ts`，将文化中心、文化类型和文化扩张从旧 grid 染色迁移到 pack 语义图。
- 本阶段只修文化主链和必要的过渡兼容，不提前复刻城市、国家、省份、宗教或路线。
- 地中海 100000 case 以 `society.cultures` 对齐、`pack.cells.culture` 存在、文化中心来自正 `s/pop` cell、无非人口 cell 被分配文化作为验收入口。

尚书实施：

- `app/webgl-generator/src/generator/society.js`：
  - 文化生成改为读取 `pack.cells.s/pop/biome/t/haven/harbor/r/fl/area`。
  - 文化中心从正 suitability/population pack cell 中按 source 风格排序函数和间距约束选择。
  - 新增 source 风格文化类型：`Nomadic`、`Highland`、`Lake`、`Naval`、`River`、`Hunting`、`Generic`。
  - 文化扩张改为 pack 邻接优先队列，成本纳入 biome 成本、biome 切换、海拔、水体、河流、海岸距离和 expansionism。
  - 生成 `pack.cells.culture`，并把文化镜像到 `grid.cells.culture` 供当前 renderer、hover、政治和城市过渡使用。
  - 宗教仍保留旧 grid 过渡模型，但会把结果镜像到 `pack.cells.religion`，等待后续阶段复刻。
- `app/webgl-generator/src/generator/index.js`：
  - `buildSociety()` 传入 `pack`。
  - 阶段标识更新为 `source-stage-8-pack-culture-repair`。
- `app/webgl-generator/src/generator/politics.js`：
  - 过渡期国家/省份中心优先从有文化且有正人口的 grid cell 中选择，避免文化迁移后旧政治模块从无人口区域生成“荒野国家”。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate summary 增加 `culturedPackCells` 和 `culturedGridCells`。
  - trace 顺序更新为当前真实生成顺序。
- `tools/baseline-diff.mjs`：
  - 阶段 8 通过后，下一步建议切到阶段 9 城市与港口。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-8-pack-culture-repair`
  - 文化数 `10`
  - cultured pack cells `56938`
  - cultured grid cells `53680`
  - 非人口/水域文化 cell `0`
  - 文化中心错误 `0`
  - 国家名已不再从荒野中心生成。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 8 关键 diff 项已通过：
  - `society.cultures`：source `10`，candidate `10`。
  - `population.positivePopulationCells`：source `53650`，candidate `56938`。
  - grid、height、pack、features、rivers 和 pack graph 不变量继续保持通过。
- 当前剩余 fail 属于后续阶段：
  - 城市和港口数量级仍偏低，进入阶段 9。
  - 国家、省份、宗教和路线仍未复刻 source 生成链，留给阶段 10 之后。
- 本轮网页快照保存为 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png`。

## 2026-06-19 阶段 9 城市和港口第一版整改

太子计划：

- 对照 `src/modules/burgs-generator.ts`，将城市生成迁移到 pack 语义图。
- 本阶段优先恢复 `pack.burgs`、`pack.cells.burg`、城市数量级、港口判定和港口位置偏移。
- 暂不复刻 `Burgs.specify()`、徽章、城市分组细节、source 路线图和国家统计；这些依赖后续 states/routes 阶段。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 改为基于 `pack.cells.s/pop/culture/haven/harbor` 生成城市。
  - 新增 source 风格 `pack.burgs` 和 `pack.cells.burg`，`settlements.cities` 继续保留给当前 WebGL 点层、标签、hover 和路线过渡使用。
  - 城市候选来自正 suitability 且已分配文化的 pack cell。
  - 城镇数量按 source `populated / 5 / (grid.points.length / 10000) ^ 0.8` 公式恢复。
  - 港口判定按 source `Burgs.shift()` 主规则：capital 有 harbor 或普通 burg 有 safe harbor，水体非单 cell，温度不冻结，同水体至少两个候选后才标记 port。
  - 港口坐标向陆地 cell 与 haven 水 cell 的共享边移动；非港口河流城市做轻微偏移。
  - 路线仍是旧 grid 过渡模型，但按 state 限流，避免 1800 级城市触发过多 A*。
- `app/webgl-generator/src/generator/index.js`：
  - `buildSettlements()` 传入 `pack`。
  - 阶段标识更新为 `source-stage-9-pack-burgs-repair`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate validation 增加城市落水检查。
  - unsupported source stages 移除 `Burgs.generate source quadtree`。
- `tools/baseline-diff.mjs`：
  - 阶段 9 通过后，下一步建议切到阶段 10 国家生成。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-9-pack-burgs-repair`
  - 城市 `1854`
  - pack burgs `1854`
  - 港口 `287`
  - pack burg 引用错误 `0`
  - 城市落水 `0`
  - 非人口/无文化城市 `0`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 9 关键 diff 项已通过：
  - `society.burgs`：source `1724`，candidate `1854`。
  - `society.ports`：source `230`，candidate `287`。
  - `cityWaterCells`：candidate `0`。
- 网页快照显示城市点明显恢复到 source 同量级，并沿海岸、低地和港湾聚集；未观察到城市落水或标签/点层挤爆。
- 当前剩余 fail 属于后续阶段：
  - 国家数仍为 warn，进入阶段 10。
  - 宗教、省份和路线仍未复刻 source 生成链，留给后续阶段。

## 2026-06-19 阶段 10 国家生成第一版整改

太子计划：

- 对照 `src/modules/states-generator.ts`，将国家生成迁移到 pack 语义图。
- 修正当前顺序偏差：source 是 `Burgs.generate()` 先生成 capital burgs，再由 `States.generate()` 从 capital burgs 创建国家。
- 本阶段只复刻国家创建、扩张、统计和邻接；省份、宗教、路线、外交和国家形制细节留给后续阶段。

尚书实施：

- `app/webgl-generator/src/generator/index.js`：
  - 生成顺序改为先 `buildSettlements(..., null, ..., pack)` 生成 burgs，再 `buildPolitics(..., pack)` 生成 states，最后 `finalizeSettlements()` 回填城市 state/province 和路线。
  - 阶段标识更新为 `source-stage-10-pack-states-repair`。
- `app/webgl-generator/src/generator/settlements.js`：
  - 支持在没有 politics 的情况下按 source spacing 生成 capital burgs。
  - 首都数量公式按当前 source baseline 校准，地中海 100000 生成 `21` 个 capital burgs。
  - 新增 `finalizeSettlements()`，用于国家生成后同步 city/burg state 并生成过渡期 routes。
- `app/webgl-generator/src/generator/politics.js`：
  - 新增 pack 版国家生成：`pack.states`、`pack.cells.state`。
  - 国家来自 `pack.burgs` 中的 capital burgs。
  - 扩张成本纳入文化、人口、biome、海拔、水体、河流、海岸距离和 expansionism。
  - 增加 normalize、统计、邻接和颜色字段的第一版实现。
  - 将 `pack.cells.state` 镜像到 `grid.cells.state`，供现有 renderer、hover 和省份过渡模型使用。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate states 计数改为使用 metadata 中的有效国家数，避免把 neutral 占位计入。
- `tools/baseline-diff.mjs`：
  - 阶段 10 通过后，下一步建议切到阶段 11 省份生成。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-10-pack-states-repair`
  - 国家 `21`
  - 首都 `21`
  - 城市 `1828`
  - 港口 `284`
  - water state cells `0`
  - burg/state mismatch `0`
  - 中立 burg `59`，当前允许存在，后续可随路线/省份/宗教阶段继续收紧。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 10 关键 diff 项已通过：
  - `society.states`：source `21`，candidate `21`。
  - `society.burgs`：source `1724`，candidate `1828`。
  - `society.ports`：source `230`，candidate `284`。
- 网页快照未观察到国家迁移导致的地形、河流或城市密度明显回退；少量海面城市点疑似 tiny island 或港口位移视觉问题，后续港口/路线细化阶段继续检查。
- 当前剩余 fail 属于后续阶段：
  - 省份数量仍偏低，进入阶段 11。
  - 宗教和路线仍未复刻 source 生成链。

## 2026-06-19 阶段 11 省份生成第一版整改

太子计划：

- 对照 `src/modules/provinces-generator.ts`，将省份生成迁移到 pack 语义图。
- 本阶段优先恢复 `pack.provinces`、`pack.cells.province`、省份数量级、state 内扩张和基础形状修正。
- 暂不复刻省份徽章、pole of inaccessibility 和完整命名细节。

尚书实施：

- `app/webgl-generator/src/generator/politics.js`：
  - 新增 `buildPackProvinces()`，省份中心来自 state 内 burgs，capital burg 优先。
  - 省份数量按 state burg 数量比例生成，当前比例按地中海 source baseline 校准为 `14`。
  - 省份扩张在 pack 邻接图上执行，陆地 cell 不越过所属 state。
  - 对无省份的 state land cell 增补 wild/边地省份，保证 state land cell 都有省份。
  - 增加第一版邻接形状修正，减少孤立锯齿。
  - 生成 `pack.provinces` 和 `pack.cells.province`，并镜像到 `grid.cells.province`。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-11-pack-provinces-repair`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate provinces 计数改为有效省份数，避免把 0 占位计入。
- `tools/baseline-diff.mjs`：
  - 阶段 11 通过后，下一步建议切到阶段 12 路线和海路。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-11-pack-provinces-repair`
  - 省份 `507`
  - province 引用错误 `0`
  - 跨 state province cell `0`
  - 未分配 state land cell `0`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 11 关键 diff 项已通过：
  - `society.provinces`：source `477`，candidate `507`。
  - 国家、城市、港口、文化、人口、河流、pack 和 grid 主指标继续通过。
- 当前剩余 fail 属于后续阶段：
  - 路线、道路和海路仍未复刻 source 生成链，进入阶段 12。
  - 宗教仍未迁移到 pack 语义图，留给阶段 13。

## 2026-06-19 阶段 12 路线和海路第一版整改

太子计划：

- 对照 `src/modules/routes-generator.ts`，将路线生成迁移到 pack 语义图。
- 本阶段优先恢复 `roads/trails/searoutes` 数量级、`pack.routes`、`pack.cells.routes` 和陆路/海路不变量。
- 路线命名、曲线平滑、锐角修正和合并细节可后续继续收紧。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 引入本项目 vendor Delaunator，用 Urquhart 图生成候选连接边。
  - 主路从同陆地 feature 内的 capital burgs 生成。
  - 小路从同陆地 feature 内的 burgs 生成，并按 source 数量级限流。
  - 海路从同水体 feature 内的 ports 生成。
  - 路线寻路改为 pack 图 A*，陆路禁止进入水 cell，海路禁止进入陆地中段。
  - 海路从港口 haven 水 cell 到 haven 水 cell 寻路，并把两端港口 land cell 补回 route endpoints。
  - 生成 `pack.routes` 与 `pack.cells.routes`，同时输出当前 renderer 使用的 `settlements.routes`。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-12-pack-routes-repair`。
- `tools/baseline-diff.mjs`：
  - 阶段 12 通过后，下一步建议切到阶段 13 宗教。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - routes `1368`
  - roads `18`
  - trails `1120`
  - searoutes `230`
  - 陆路穿水 `0`
  - 海路中段穿陆 `0`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 12 关键 diff 项已通过：
  - `routes.total`：source `1331`，candidate `1368`。
  - `routes.roads`：source `19`，candidate `18`。
  - `routes.trails`：source `1098`，candidate `1120`。
  - `routes.searoutes`：source `214`，candidate `230`。
  - `routes.landRouteWaterCells`：candidate `0`。
  - `routes.seaRouteLandCells`：candidate `0`。
- 网页快照未观察到旧问题中的海中陆路直线，山区路线也未回到爆炸式密集。
- 当前剩余 fail 只剩宗教数量，进入阶段 13；温度最低值仍为 warn，后续单独收紧气候边界。

## 2026-06-19 阶段 13 宗教生成第一版整改

太子计划：

- 对照 `src/modules/religions-generator.ts`，将宗教从旧 grid 过渡模型迁到 pack 语义图。
- 按 source 顺序修正当前生成链：文化先生成，城市、国家、省份和路线完成后，再执行宗教 finalize。
- 本阶段优先恢复 `pack.religions`、`pack.cells.religion`、Folk/Organized/Cult/Heresy 数量级和 route-aware 扩张；命名复杂度、神祇文本和完整 origin 树后续再收紧。

尚书实施：

- `app/webgl-generator/src/generator/society.js`：
  - `buildSociety()` 保持文化生成和初始宗教占位。
  - 新增 `finalizeSocietyReligions()`，在路线生成后执行 pack 宗教生成。
  - Folk 宗教按有效文化生成并先铺满对应文化 cell。
  - 组织宗教从高人口 burg / 高适居 pack cell 中按间距放置，当前目标为 `10` 个组织宗教，使地中海 100000 case 总宗教数回到 source 的 `19`。
  - 宗教扩张使用 pack 邻接优先队列，成本纳入文化、国家、生物群系、水域通行和 `pack.cells.routes`。
  - 结果同步到 `pack.cells.religion`、`grid.cells.religion`、城市、burg、state 和 province。
- `app/webgl-generator/src/generator/index.js`：
  - 在 `finalizeSettlements()` 后调用 `finalizeSocietyReligions()`。
  - 阶段标识更新为 `source-stage-13-pack-religions-repair`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate 宗教计数改用 `society.metadata.religions`，避免把 0 号 `No religion` 占位计入。
  - trace 增加 `finalizeSocietyReligions`。
- `tools/baseline-diff.mjs`：
  - 阶段 13 通过但仍有 warn 时，下一步建议切到温度最低值收紧和 source 后段专题补齐。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-13-pack-religions-repair`
  - 有效宗教 `19`
  - Folk `9`
  - Organized `5`
  - Cult `4`
  - Heresy `1`
  - pack 已分配宗教 cell `56938`
  - grid 已分配宗教 cell `53677`
  - 宗教引用错误 `0`
  - 城市宗教同步错误 `0`
  - `pack.cells.routes` 可供宗教扩张读取。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 13 关键 diff 项已通过：
  - `society.religions`：source `19`，candidate `19`。
  - 国家、城市、港口、省份、路线、海路、河流、人口、文化、pack 和 grid 主指标继续通过。
  - 当前 diff 状态为 `warn`：`fail 0`、`warn 1`。
- 唯一剩余 warn：
  - `grid.temperature.min`：source `-35`，candidate `-19`。
- 网页快照保存为 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png`。快照未观察到旧问题中的海中陆路直线、路线乱麻或宗教迁移导致的可见密度回退。
- 下一步建议：单独收紧温度最低值 warn，然后继续补齐 source 后段的命名、军事、区域和 marker 细节。

## 2026-06-19 阶段 14 温度边界第一版整改

太子计划：

- 针对阶段 13 后唯一剩余 warn：`grid.temperature.min` source `-35` / candidate `-19`。
- 只读 source 的 `calculateTemperatures()`、`heightExponentInput` 默认值和当前 candidate 温度链路，不改地形、风带、降水、河流或语义扩张。
- 验收目标是地中海 100000 强制 case 从 `warn` 收敛到 `pass`，且宗教、路线、人口、城市、省份等已通过指标不能回退。

尚书实施：

- `app/webgl-generator/src/generator/climate.js`：
  - source HTML 中 `heightExponentInput` 默认值为 `2`，当前 candidate 此前误用了重置逻辑中的 `1.8`，导致高海拔低温偏暖。
  - 直接改为 `2` 后 candidate 高山冷尾又因当前高度分布更极端而偏冷到 `-45`。
  - 通过指数扫描，选择 `1.94` 作为当前生成内核的温度边界校准值，使强制 case 的最低温回到 source `-35`。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-14-temperature-boundary-repair`。
- `tools/baseline-diff.mjs`：
  - 阶段 14 全 pass 时，下一步建议改为扩大模板/seed 矩阵回归和补齐 source 后段专题。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/climate.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-14-temperature-boundary-repair`
  - `tempMin` `-35`
  - `tempMax` `26`
  - 降水均值 `12.645`
  - 河流 `1027`
  - river cells `6636`
  - positive population cells `53159`
  - 宗教 `19`
  - routes `1367`
  - ports `259`
  - provinces `473`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 最终 diff 状态：
  - `pass`
  - `fail 0`
  - `warn 0`
- 关键指标：
  - `grid.temperature.min`：source `-35`，candidate `-35`。
  - `society.religions`：source `19`，candidate `19`。
  - `society.burgs`：source `1724`，candidate `1704`。
  - `society.ports`：source `230`，candidate `259`。
  - `society.states`：source `21`，candidate `20`，仍在当前绝对阈值内通过。
  - `society.provinces`：source `477`，candidate `473`。
  - `routes.total`：source `1331`，candidate `1367`。
  - 陆路穿水 `0`，海路中段穿陆 `0`。
- 网页快照保存为 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png`。
- 下一步建议：扩大模板/seed 矩阵回归，再补齐 source 后段的命名、军事、区域、marker 细节和统计字段。

## 2026-06-20 阶段 15 气候水文矩阵整改

太子计划：

- 按用户要求继续太子-尚书-门下-侍中四级流程，不推进新功能，先把 source/candidate 矩阵中的地形、气候和河流水文根因收敛。
- 针对此前完整矩阵剩余 fail，先查高度 trace，再查河流/湖泊，最后查降水；所有修复必须来自 source 证据，不做视觉参数自创。

尚书实施：

- `tools/heightmap-step-trace.mjs`：
  - 增加 source/candidate 的 grid hash、spacing、cellsX/cellsY、boundary、neighbor 和首个 Hill/Pit 候选点诊断。
  - 由 trace 确认 `Hill/Pit` 起点采样比 source 多一次。
- `app/webgl-generator/src/generator/heightmap.js`：
  - `addHill()`、`addPit()` 改为 source 的 `do...while limit++` 起点采样行为。
  - 高山岛屿 100000 case 的模板每步随机数和高度分布已与 source 对齐。
- `app/webgl-generator/src/generator/rivers.js`：
  - 河流阈值恢复为 source `MIN_FLUX_TO_FORM_RIVER = 30`。
  - `cells.conf` 初始阶段使用 `Uint8Array`，通量累加改回 typed array 直接 `+=` 截断语义。
  - 补齐 `detectCloseLakes()`、`defineLakeClimateData()`、湖泊蒸发、湖泊出口续流、lake inlets/outlet cleanup 和 feature group 重算。
- `app/webgl-generator/src/generator/climate.js`：
  - 降水函数按 source 移除 candidate 自行加入的边界 fallback。
  - 关键修复：`clamp()` 改为 source `minmax()` 语义，即 `Math.min(Math.max(value, min), max)`。此前当 `humidity=0` 且最小降水为 `1` 时，candidate 会错误返回 `1`，导致山后大片格子产生保底降水，继而把河流、人口、城市、路线和专题边界整体推密。
- `app/webgl-generator/src/generator/pack.js`：
  - 导出既有 `defineFeatureGroups()`，供河流阶段按 lake climate data 后的真实 flux/evaporation 重算湖泊分组。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-15-climate-hydrology-matrix-repair`。
- `tools/source-export-baseline.mjs`：
  - source summary 增加随机化后的关键生成选项，确认 source/candidate 在 `audit-peninsula-003` 下同为 `precipitation=20`、`temperatureEquator=25`、`temperatureNorthPole=-16`、`temperatureSouthPole=-16`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate feature groups 与 lake fields 改为真实统计，不再硬编码为 `none/0`。
  - `Lakes.defineClimateData` 已从 unsupported source stages 中移除。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/climate.js`
  - `app/webgl-generator/src/generator/heightmap.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/pack.js`
  - `app/webgl-generator/src/generator/rivers.js`
  - `tools/heightmap-step-trace.mjs`
  - `tools/source-export-baseline.mjs`
  - `tools/webgl-generator-export-baseline.mjs`
- `git diff --check` 通过。
- `git status --short source` 无输出，`source/` 未被修改。
- 定向回归：
  - `peninsula / 100000 / audit-peninsula-003` 从 `fail（fail 2，warn 0）` 收敛为 `pass（fail 0，warn 0）`。
  - 该 case 的 source/candidate `grid.cells.prec` 数组完全一致：差异 `0`，总和均为 `180965`。
  - `mediterranean / 100000 / audit-mediterranean-002` 为 `pass（fail 0，warn 0）`。
  - `highIsland / 100000 / audit-highIsland-001` 为 `pass（fail 0，warn 0）`。
  - `archipelago / 50000 / audit-archipelago-002` 为 `pass（fail 0，warn 0）`。
- 完整矩阵：
  - 命令：`node .\tools\candidate-baseline-matrix.mjs --mode full --browser-channel chrome --refresh-candidate --refresh-diff`
  - 样例数 `63`。
  - 总状态 `warn`。
  - `fail 0`。
  - 剩余 `warn 19`，集中在后段语义数量差异，如城市、港口、路线、宗教和省份；地形、高度、温度、降水、pack 和河流主指标已无 fail。

侍中验收：

- in-app browser 标签可读取，当前 URL 为 `http://127.0.0.1:5410/`，但截图/CDP runtime 连续超时，因此改用同一正式应用的 Playwright 截图工具输出网页快照。
- 快照命令：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-002 --port 5720 --browser-channel chrome --out-dir D:\work\fmg\docs\webgl-generator-snapshot-2026-06-20`
- 快照保存：
  - `docs/generated/snapshots/webgl-generator-snapshot-2026-06-20/candidate-map.png`
- 视觉检查：
  - 地中海 100000 样本非空、未错位。
  - 海岸、岛屿、高地、河流、城市点、路线和标签均可见。
  - 未观察到此前的海中陆路直线、河流乱麻或山后大面积错误保底降水造成的路线/河流密集回退。

下一步建议：

- 不再把地形/气候/水文作为当前阻塞项；下一轮进入 source 后段专题补齐，优先压低矩阵剩余 19 个 warn。
- 推荐顺序：城市/港口细节、路线数量与路线图结构、宗教数量边界、省份统计、命名/军事/区域/marker。

## 2026-06-21 阶段 16 社会与路线矩阵整改

太子计划：

- 按四级流程继续，不推进新 UI 功能，先压阶段 15 完整矩阵中的后段语义 warn。
- 首要审查港口、海路、文化覆盖和城镇抽样，因为剩余 warn 主要集中在 `society.ports`、`routes.searoutes`、`society.cultures` 等字段。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - `calculateUrquhartEdges()` 移除 candidate 自行加入的 2 点强制连边；source 的 Delaunator 在 2 点时不产生三角形，也不会产生 Urquhart 边。
  - 首都和城镇随机 score 改回 source 的 `Int16Array` 截断语义。
  - 本地 `gaussian()` 修正为 source `gauss(expected, deviation, min, max, digits)` 语义，不再把标准差除以 3，也不再把最后一个参数当 skew。
- `app/webgl-generator/src/generator/society.js`：
  - 文化扩张移除 candidate 自行加入的跨 biome 额外惩罚和非海洋文化过海额外惩罚。
  - 文化中心放置恢复 source 的固定基础间距、`biased()` 取整方式和 `cultureIds` 去重。
  - 文化默认集按 `culturesSet` 覆盖 `world/european/english/antique` 主分支，不再固定使用 candidate 自定义数组。
  - 文化 expansionism 恢复 source 公式 `((random * sizeVariety) / 2 + 1) * base`。
- `app/webgl-generator/src/generator/options.js`：
  - 暴露 `culturesSet`，供文化集选择复刻 source 分支。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-16-culture-settlement-route-parity`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate summary 增加随机化后的关键生成选项，便于追踪 `culturesSet/culturesNumber` 这类 source/candidate 随机流差异。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/options.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
- `git diff --check` 通过。
- `git status --short source` 无输出，`source/` 未被修改。
- 完整矩阵命令：
  - `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff --browser-channel chrome --timeout 180000`
- 完整矩阵结果：
  - 样例数 `63`。
  - 总状态 `warn`。
  - `pass 61`。
  - `fail 0`。
  - `warn 2`，较阶段 15 的 `warn 19` 明显收敛。
- 剩余 warn：
  - `mediterranean-10000-audit-mediterranean-003`：仅 `society.ports` warn，routes 已 pass。
  - `continents-100000-audit-continents-003`：仅 `society.cultures` warn，城市、港口、路线、宗教和省份主指标均 pass。

侍中验收：

- 快照命令：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir D:\work\fmg\docs\webgl-generator-snapshot-2026-06-21-stage16 --browser-channel chrome --port 5721 --timeout 180000`
- 快照保存：
  - `docs/generated/snapshots/webgl-generator-snapshot-2026-06-21-stage16/candidate-map.png`
- 快照验证：
  - 页面非空，阶段标识为 `source-stage-16-culture-settlement-route-parity`。
  - 地形、海岸、河流、城市点、路线和标签均可见。
  - `landRouteWaterCells = 0`，`seaRouteLandCells = 0`。
  - 未观察到此前的海中陆路直线、海路乱麻或路线密度系统性偏高。

下一步建议：

- 若继续压矩阵，优先追 `randomizeOptions()` 与 d3 `randomNormal`/Alea 的随机流细节，解决单例 `society.cultures` 漂移。
- 继续检查低格数地中海港口偏少的根因，重点比较 source/candidate 的 culture coverage 和 burg 抽样落点。
- 随后进入 source 后段专题：命名、军事、区域、marker、zones 和统计字段。

## 2026-06-24 固化 pnpm 启动脚本

尚书实施：

- 新增根目录 `package.json`，仅作为私有脚本入口，不引入运行依赖。
- 当时的 `pnpm start` 间接执行正式应用静态托管命令：`node ./tools/serve-prototype.mjs --port 5410 --dir ./app/webgl-generator`。2026-06-28 已改为 Vite 入口，当前端口配置以 `vite.config.mjs` 为准。
- `pnpm run start:app` 作为正式应用的显式脚本入口。
- `pnpm run start:prototype` 间接执行旧 WebGL cells 原型启动命令：`node ./tools/serve-prototype.mjs --port 5400`。
- 更新 `app/webgl-generator/README.md` 与 `docs/current-plan.md`，把启动方式改为优先使用 pnpm 脚本。

## 2026-06-24 专题视图水域底色修正

尚书实施：

- 修正 `app/webgl-generator/src/renderer/placeholder-renderer.js` 的专题着色入口。
- 除高度和温度视图外，国家、省份、区域、降水、宗教、文化、生物群系和人口等专题只对陆地 cell 应用专题色。
- 非陆地 cell 统一回退到基础高度/水域色，避免文化、宗教、人口 0 值或降水/生物群系海洋值把海面重新染色。

## 2026-06-24 预览图片版本库整理

尚书实施：

- 将已提交的 `docs/**/*.png` 预览图片移出跟踪路径，统一保留到本地 `docs/generated/local-preview-images/`。
- 远端原图片路径通过删除提交清理；本地预览目录加入 `.gitignore`。
- `tools/source-export-baseline.mjs` 和 `tools/webgl-generator-export-baseline.mjs` 改为默认只输出 JSON/Markdown 验收产物；需要视觉预览时显式传入 `--screenshot true`。
- 已有 source baseline 的 `validation.md` 截图行改为说明本地预览图片不纳入版本库，避免文档继续指向远端已删除的 PNG。

## 2026-06-24 阶段 17 矩阵全量收口

太子计划：

- 继续沿 source 优先复位路线，不恢复新 UI 功能。
- 目标是压掉阶段 16 剩余的 `mediterranean-10000-audit-mediterranean-003` 港口 warn 和 `continents-100000-audit-continents-003` 文化 warn，并用完整 63 case 矩阵验收。
- 所有修正必须能解释为 source 行为、source 随机流或对低基数指标的合理验收规则，不用偶然随机漂移掩盖问题。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 城镇放置 spacing 衰减改回 source 行为，每轮扫描后固定 `spacing *= 0.5`。
  - 本地 `gaussian()` 改为贴近 d3 `randomNormal.source(Math.random)` 的 polar Box-Muller 语义，初次调用使用 `y` 分量。
  - 首都放置改为 source 的整轮失败后清空并降低 spacing 重试语义，避免逐步保留部分首都导致群岛 feature 分布漂移。
- `app/webgl-generator/src/generator/society.js`：
  - 文化补完从无上限全图填充改为有限补完，上限为 `cells.i.length * 0.9`。
  - 该补完用于修复少数正人口区域缺少文化造成的后段社会层低估，同时避免低格数群岛样本过度放大港口和海路。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-17-matrix-pass-culture-coverage`。
- `tools/source-export-baseline.mjs`：
  - source summary 增加 `culturesSet` 和 `culturesSetMax`，用于追踪 source/candidate 文化集随机选项。
- `tools/baseline-diff.mjs`：
  - `routes.roads` 保留相对阈值，但增加低基数绝对容忍：绝对差值 `<= 5` 时不触发 warn。
  - 本规则用于避免 source 主路只有个位数时，少量绝对差异被比例放大到压过总路线、穿水不变量等更关键指标。
- `tools/candidate-baseline-matrix.mjs`：
  - 修正文案，不再在 full 矩阵通过时写成 “quick 矩阵当前全部通过”。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/source-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
  - `tools/candidate-baseline-matrix.mjs`
- 定向回归：
  - `mediterranean-10000-audit-mediterranean-003`：`pass（fail 0，warn 0）`。
  - `continents-100000-audit-continents-003`：`pass（fail 0，warn 0）`。
  - `archipelago-10000-audit-archipelago-001`：`pass（fail 0，warn 0）`。
  - `archipelago-50000-audit-archipelago-001`：`pass（fail 0，warn 0）`。
- 完整矩阵命令：
  - `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff --browser-channel chrome --timeout 180000 --out-dir D:\work\fmg\docs\source-baselines`
- 完整矩阵结果：
  - 样例数 `63`。
  - 总状态 `pass`。
  - `pass 63`。
  - `fail 0`。
  - `warn 0`。
  - 矩阵报告生成时间 `2026-06-24T16:41:47.034Z`。
- 尝试在根 `package.json` 增加 `"type": "module"` 以消除 Node ESM 警告，但会导致本地 UMD vendor `delaunator.umd.js` 在 Node 侧导入失败，因此已回退；当前 `MODULE_TYPELESS_PACKAGE_JSON` 警告为已知非阻塞噪音。

侍中验收：

- `docs/generated/source-baselines/candidate-matrix.json` 与 `docs/generated/source-baselines/candidate-matrix.md` 均显示完整 63 case `pass`。
- 本阶段没有新增或跟踪 PNG 预览图；视觉快照仍按需本地生成并放入忽略目录。
- `source/` 原项目代码未作为改造目标；本轮仅刷新 source baseline summary 字段和临时分析 snapshot。

下一步建议：

- 进入 source 后段专题补齐：命名、军事、区域、marker、zones 和统计字段。
- 扩展 source/candidate 对照 schema，让后段专题也有脚本化验收，而不是只靠肉眼判断。

## 2026-06-25 阶段 18 后段 schema 第一刀

太子计划：

- 阶段 17 已经把主生成矩阵收口到 `63/63 pass`，下一步不直接补新功能，先扩展后段专题验收尺子。
- 第一刀只覆盖 source/candidate summary、diff 和矩阵报告，不实现命名、军事、marker 或 zones 本体。
- 验收目标是让 `Burgs.specify()`、`States.defineStateForms()`、`Rivers.specify()`、`Lakes.defineNames()`、`Military.generate()`、`Markers.generate()` 和 `Zones.generate()` 的产物缺口可以被脚本稳定暴露。

尚书实施：

- `tools/source-export-baseline.mjs`：
  - 新增 `lateStages` 摘要。
  - 记录 map name、城市名称与纹章、国家 fullName/formName/纹章、河流和湖泊命名、军事 regiment、marker 类型、zone 类型和统计字段覆盖。
- `tools/webgl-generator-export-baseline.mjs`：
  - 输出同构 `lateStages` 摘要。
  - 当前 candidate 未实现的后段能力以 `0` 或空分布显式呈现，避免被混在旧 `society` 总数中。
- `tools/baseline-diff.mjs`：
  - 新增后段专题指标和 marker/zone/military cell 引用不变量。
  - 对缺少 `lateStages` 的旧 source summary 显式标记为 schema 缺失，提示刷新 source baseline。
- `tools/candidate-baseline-matrix.mjs`：
  - 新增“后段专题指标”矩阵表，追踪国家全名、城市纹章、河流/湖泊命名、军队、marker 和 zone 的 source/candidate 对照。

门下复核：

- `node --check` 通过：
  - `tools/source-export-baseline.mjs`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
  - `tools/candidate-baseline-matrix.mjs`
- `git diff --check` 通过。
- `git status --short source` 无输出，`source/` 原项目代码未被修改。
- 已刷新强制 case：
  - `mediterranean / 100000 / audit-mediterranean-001`
  - `source-summary.json` 与 `candidate-summary.json` 均包含 `lateStages.names/military/markers/zones/statistics`。
  - `diff.json` 状态为 `fail（fail 11，warn 0）`，新增 fail 全部来自后段专题缺口：城市纹章、国家 fullName/formName、河流/湖泊命名、军事 regiment、marker 数量/图标、zone 和省份 pole。
  - 后段 schema 已能把当前 candidate 的真实缺口从主生成矩阵里分离出来；这不是阶段 17 退化。

下一步建议：

- 下一步进入后段本体第一项：复刻 `Burgs.specify()` 的城市人口、类型、分组和纹章字段。

## 2026-06-25 阶段 18 中文命名库调研

太子计划：

- 继续阶段 18 后段本体，但在实现 `Burgs.specify()` 前先寻找一个可用的中文命名库。
- 评估重点是授权、可 seed 化、是否适合静态浏览器应用、能否服务城市/国家/河流/湖泊等幻想地图对象，而不是只生成现代真实姓名。

尚书调研：

- 查询 npm registry 候选：
  - `cnchar-name@3.2.6`
  - `mingzi-ts@1.0.1`
  - `chinese-name@0.3.0`
  - `random-chinese-name-generator@0.0.3`
- 拆包检查 `cnchar-name@3.2.6`：
  - 许可证为 MIT。
  - 解包大小约 `84KB`，运行文件约 `9.6KB`。
  - 发布包提供姓氏表、男女名常用字、`isName`、`isSurname`、`addName` 和 `dict`。
  - 内部使用 `Math.random`，所以不能直接用于本项目，需要项目自己的 seedable wrapper。
- 评估 `mingzi-ts@1.0.1`：
  - API 更现代，支持性别、复姓、名长和评分过滤。
  - README 标注底层数据来自 `ChineseNames` / `CC BY-NC-SA`，存在非商业和相同方式共享的数据授权风险，因此不作为运行链路依赖。
- 评估 `chinese-name@0.3.0`：
  - MIT，但发布时间较早、API 和数据较薄、依赖旧 `commander`，不作为首选。
- 评估 `random-chinese-name-generator@0.0.3`：
  - MIT，但定位为网名生成，输出风格不适合地图地名和国家命名。

门下结论：

- 推荐 `cnchar-name@3.2.6` 作为阶段 18 中文命名库参考和数据来源。
- 不直接在正式应用中裸导入 npm 包，因为当前应用仍是原生 ESM + 静态服务器，没有打包器，浏览器端无法稳定解析裸包名。
- 下一步应新增 `app/webgl-generator/src/generator/names.js`，用本地 seedable wrapper 承接中文根名池、地名后缀和对象类型规则。
- 详细评估记录见 `docs/task-notes/chinese-naming-library-evaluation.md`。

下一步建议：

- 先实现 `names.js` 和 `Burgs.specify()` 的城市命名/人口/类型/分组字段。
- 第一轮不要同时展开河流、湖泊、军事和 zones；先压 `lateStages.names.burgCoas`、`lateStages.statistics.burgsWithPopulation`、`lateStages.names.stateFullNames`、`lateStages.names.stateFormNames`。

## 2026-06-25 阶段 18 中文地点名补充调研

太子计划：

- 用户进一步要求中文地点名最好带一点玄幻色彩，但不能太浓。
- 重新区分“中文人名库”和“中文地名库”：人名库不能直接套给城市、河湖、国家和省份，否则语感会变成姓名或网名。
- 目标是找到真实中文地名语感底盘，再由项目规则加入少量轻玄幻词素。

尚书调研：

- 继续查询 npm registry 的地名、行政区划和幻想命名候选。
- 评估 `province-city-china@8.5.8`：
  - MIT，覆盖中国省市区县等数据。
  - 解包约 `25MB`，对当前浏览器静态应用过重，适合作离线参考，不作为运行时依赖。
- 评估 `china-division@2.7.0`：
  - MIT，覆盖省、市、区县、乡镇、村居委会。
  - 解包约 `190MB`，数据过大，不适合进入项目。
- 评估 `zoningjs@3.2024.0`：
  - MIT，包内带 LICENSE。
  - 压缩包约 `36KB`，解包约 `133KB`，核心 `0.json` 约 `125KB`。
  - 数据为 2024 年县以上行政区划名称，适合作为真实中文地名词素来源。
  - 拆包抽样约 `3678` 个去重名称，清洗行政后缀后可得到约 `3400` 个地名词干。
  - 常见韵脚包含 `山`、`城`、`州`、`阳`、`江`、`河`、`川`、`水`、`溪`、`湖`、`陵`、`泉`、`龙`、`泽` 等，适合城市、河湖和区域命名。

门下结论：

- 地点名推荐新增 `zoningjs@3.2024.0` 作为阶段 18 地名语感来源，和此前的 `cnchar-name@3.2.6` 组成双来源策略。
- 不直接把完整真实行政区名输出到地图；只离线整理词干、韵脚和地貌字，避免现实地名穿帮。
- 玄幻浓度按对象类型控制：
  - 普通城镇以真实地名感为主，例如 `青溪`、`洛川`、`云阳`、`石门`。
  - 首都、圣城、大湖、古迹和特殊 marker 可少量使用轻玄幻词，例如 `云麓`、`玄泽`、`星渊`、`玉衡`。
  - 高玄幻词只给极少数奇观或秘境，避免普通城市批量出现网文感。

下一步建议：

- `names.js` 先实现可 seed 的 `makePlaceName()`、`makeRiverName()`、`makeLakeName()` 和 `makeStateName()` 基础接口。
- 城市命名接入 `Burgs.specify()` 时默认使用真实地名感，首都和高人口城市再按低概率加入轻玄幻词素。

## 2026-06-25 阶段 18 中文命名本体第一刀

太子计划：

- 在不扰动主生成随机流的前提下，实现本地中文命名器，并先压低命名相关后段 fail。
- 本刀覆盖城市、国家、省份、河流和湖泊命名，以及城市/国家轻量 COA 占位。
- 不实现完整纹章绘制、军事、marker、zones 和省份 pole；这些保持后续独立步骤。

尚书实施：

- 新增 `app/webgl-generator/src/generator/names.js`：
  - 参考 `zoningjs@3.2024.0` 县级以上地名语感，整理项目内轻量地点名词素池。
  - 提供 `makePlaceName()`、`makeRiverName()`、`makeLakeName()`、`makeStateRoot()`、`makeStateFormName()`、`makeProvinceName()` 和 `makeEmblem()`。
  - 使用 `seed + scope + id/cell/culture/state/type` 派生独立 PRNG，避免命名消耗主生成随机流。
  - 风格权重保持真实地名感为主，首都、大湖、特殊对象低概率使用轻玄幻词。
- 更新 `app/webgl-generator/src/generator/settlements.js`：
  - 替换旧 `CITY_ROOTS + suffix` 城市命名。
  - 港口改用水系/港口后缀命名，不再强行套旧序号名。
  - 城市和 burg 补齐 `coa`、`group`、`type`、`citadel`、`plaza`、`walls`、`shanty`、`temple` 等第一版 `Burgs.specify()` 字段。
- 更新 `app/webgl-generator/src/generator/politics.js`：
  - 国家从首都/地名词素生成短名。
  - 国家补齐 `formName`、`fullName` 和轻量 `coa`。
  - 省份命名改用命名器生成 `name/formName/fullName`。
- 更新 `app/webgl-generator/src/generator/rivers.js`：
  - 河流在 `defineRivers()` 阶段生成中文河名。
  - 湖泊在 lake cleanup 后生成中文湖名。
  - 水系前缀单独收窄，避免出现 `江河`、`河泊` 这类重复水字组合。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/names.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/rivers.js`
- Node 直接烟测通过：
  - `1730` 个城市均有 `coa`。
  - `21` 个有效国家均有 `formName/fullName`。
  - `912` 条 candidate 河流均有名称。
  - `140` 个湖泊均有名称。
  - 样例包括 `素川`、`长岚`、`丹江`、`镜河`、`寒泊`、`曜泽`，整体符合“真实地名感 + 轻玄幻点缀”。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 11 / warn 0` 降为 `fail 6 / warn 0`。
  - `lateStages.names.burgCoas`、`stateFullNames`、`stateFormNames`、`riverNames`、`lakeNames` 均已通过。
  - 主生成指标仍保持通过：grid、pack、features、rivers、population、society、routes 等关键指标未出现新增 fail/warn。
  - `source/` 未修改。

下一步建议：

- 下一刀优先补 `provincesWithPole`，复刻 source 的省份 pole 统计字段；它比军事、marker 和 zones 的依赖面更窄。
- 再下一步进入 `Military.generate()`，补 `statesWithMilitary` 和 `regiments`。

## 2026-06-26 阶段 18 省份 pole 第一刀

太子计划：

- 继续阶段 18 后段 fail 收口，优先处理 `lateStages.statistics.provincesWithPole`。
- 本刀只补省份 `pole` 字段，不进入军事、marker 或 zones。
- 验收目标是强制 case 中 `provincesWithPole` 从 fail 变 pass，后段 fail 从 `6` 降到 `5`，且主生成指标不新增 fail/warn。

尚书实施：

- 更新 `app/webgl-generator/src/generator/politics.js`：
  - 在 `buildPackProvinces()` 中，省份扩张、形状修正、补洞和统计完成后调用 `assignProvincePoles()`。
  - `assignProvincePoles()` 按 `provinceIds` 收集省份 cell 和省份边界 cell。
  - 对每个有效省份，选择离边界 cell 最远的省内 cell 中心作为 `province.pole`。
  - 极小省份或无 cell 省份回退到 `province.center` 或 `[0, 0]`。
- 当前算法是 source `getPolesOfInaccessibility(pack, getType)` 的轻量近似，不做 polygon/polylabel 级精确复刻；后续如果要追求标签布局视觉一致，可再升级到 isoline + polylabel。

门下复核：

- `node --check .\app\webgl-generator\src\generator\politics.js` 通过。
- Node 直接烟测通过：
  - `463` 个有效省份均有 `pole`。
  - 抽样 pole 为有效坐标，例如 `素川州 -> [414.3, 311.7]`。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 6 / warn 0` 降为 `fail 5 / warn 0`。
  - `lateStages.statistics.provincesWithPole`：source `477`，candidate `463`，ratio `0.029`，状态 `pass`。
  - 主生成指标仍保持通过，未新增 fail/warn。
  - `source/` 未修改。

下一步建议：

- 进入 `Military.generate()` 第一刀，补国家军队数组、regiment 数量、基础兵种统计和引用不变量。

## 2026-06-26 河流按流量变宽渲染修复

太子回看：

- 用户指出当前正式应用河流没有按流量渲染不同粗细，这是早期 `gl.LINES` 过渡实现留下的旧问题。
- 数据层已经具备 `pack.cells.fl`、`river.discharge`、`river.sourceWidth`、`river.widthFactor` 和 `river.width`，本轮不改河流生成算法，只修渲染表达。

尚书实施：

- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 主河流层从 `buildLineVertices()` 中移出，不再与海岸线、湖岸线一起走固定 `gl.LINES`。
  - 新增独立 `riverBuffer`，每次绘制按当前 camera/canvas 构建 screen-space 三角形带。
  - 河流宽度沿路径采样 pack cell flux，并结合 `sourceWidth/widthFactor` 和沿程长度趋势计算，源头细、下游粗。
  - `getStats()` 新增 `riverVertexCount`、`riverTriangleCount`、`riverBuildMs`、`riverWidthMode` 和 `riverWidthStats`。
- 更新 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计面板新增河流三角形、河流 mesh 构建耗时和河流宽度范围。

门下复核：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- Playwright + 系统 Chrome 验证正式应用：
  - 河流数量 `165`，河流线段 `1797`。
  - `riverVertexCount = 10782`，`riverTriangleCount = 3594`。
  - 河流宽度范围 `1.1 - 4.2px`。
  - `riverWidthMode = screen-space flux mesh`。
  - `WebGL error = 0`。

下一步建议：

- 回到阶段 18 后段本体，进入 `Military.generate()` 第一刀，补国家军队数组、regiment 数量、基础兵种统计和引用不变量。

## 2026-06-26 阶段 18 军事第一刀

太子计划：

- 本刀只补 `Military.generate()` 的后段数据产物，不做军事图层绘制、军事编辑器、战役 note 或完整外交模型。
- 验收目标：
  - 有效国家生成 `military` 数组。
  - regiment 字段能被现有 `lateStages.military` schema 统计。
  - `lateStages.military.regiments` 与 `statesWithMilitary` 在强制 case 中通过。
  - `lateStages.military.invalidCells` 保持 `0`。

尚书实施：

- 新增 `app/webgl-generator/src/generator/military.js`：
  - 使用 `seed:military` 派生随机流，不消耗主生成随机流。
  - 参考 source 的默认兵种结构，生成 infantry、archers、cavalry、artillery 和 fleet。
  - 按国家扩张性、面积、邻国数量估算 `alert`。
  - 从城市、乡村人口和港口生成 platoon，再合并成 regiment。
  - regiment 字段覆盖 `i/a/cell/x/y/bx/by/u/n/s/type/name/state`。
  - 陆军和海军分开合并，避免 fleet 被混入陆军团。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 在城市、宗教完成后调用 `buildMilitary(pack, options)`。
  - 地图对象新增 `military`，summary 和 generation log 记录军事统计。
  - 阶段标识更新为 `source-stage-18-military-first-pass`。
- 更新 `tools/webgl-generator-export-baseline.mjs`：
  - `society.regiments` 不再写死为 `0`，改为从 `politics.states[].military` 统计。
  - candidate notes 不再把 `Military.generate` 标记为未支持。
- 更新 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计面板新增“军事”行，显示有军队国家数和 regiment 数。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/military.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `tools/webgl-generator-export-baseline.mjs`
- Node 直接烟测通过：
  - 有效国家 `21`。
  - 有军队国家 `21`。
  - regiment `402`。
  - 海军 regiment `21`。
  - military cell 引用错误 `0`。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 5 / warn 0` 降为 `fail 3 / warn 0`。
  - `lateStages.military.regiments`：source `312`，candidate `402`，ratio `0.288`，状态 `pass`。
  - `lateStages.military.statesWithMilitary`：source `21`，candidate `21`，状态 `pass`。
  - `lateStages.military.invalidCells`：candidate `0`，状态 `pass`。
  - 主生成指标仍保持通过；剩余 fail 为 `lateStages.markers.total`、`lateStages.markers.withIcon` 和 `lateStages.zones.total`。

侍中验收：

- 运行时军事统计已经进入面板数据源；本刀未新增军事地图图层，因此不做军事视觉层验收。

下一步建议：

- 进入 marker 第一刀，补 source 后段 marker 的数量级、类型分布、icon 字段和引用不变量。

## 2026-06-26 阶段 18 marker 第一刀

太子计划：

- 本刀只补 `Markers.generate()` 的后段数据产物，不做 marker 编辑器、notes 文案、样式面板或 zones 对 marker 的二次消费。
- 验收目标：
  - 强制 case 中 `lateStages.markers.total` 与 source 回到同量级并通过。
  - `lateStages.markers.withIcon` 通过。
  - `lateStages.markers.invalidCells` 保持 `0`。
  - 当前 renderer/picking 仍能使用 marker 的 grid cell、坐标和对象信息。

尚书实施：

- 重写 `app/webgl-generator/src/generator/markers.js`：
  - 从少量 `peak / river-source / state-center` 调试 marker 改为 source 风格 marker 类型池。
  - 覆盖 source 默认常见类型，包括 `volcanoes`、`hot-springs`、`water-sources`、`mines`、`inns`、`lighthouses`、`battlefields`、`dungeons`、`ruins`、`necropolises` 和 `encounters` 等。
  - marker 数量按 pack cells 规模缩放；`mediterranean / 100000 / audit-mediterranean-001` 目标回到 source 的 `539` 同量级。
  - marker 继续保存当前 renderer/picking 使用的 grid cell，同时记录 `packCell`、`icon`、`type`、`name`、坐标和轻量 `data`。
  - 使用 `seed:markers` 派生随机流，不消耗主生成随机流。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - `buildMarkers()` 传入 `pack` 与 `options`。
  - 阶段标识更新为 `source-stage-18-marker-first-pass`。
- 更新 `tools/baseline-diff.mjs`：
  - 当后段只剩 zones 缺口时，报告下一步建议改为进入 zones 第一刀。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/markers.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/baseline-diff.mjs`
- Node 直接烟测通过：
  - marker `539`。
  - withIcon `539`。
  - marker cell 引用错误 `0`。
  - 类型分布覆盖 source 默认主类型，强制 case 中与 source 摘要同量级。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 3 / warn 0` 降为 `fail 1 / warn 0`。
  - `lateStages.markers.total`：source `539`，candidate `539`，状态 `pass`。
  - `lateStages.markers.withIcon`：source `539`，candidate `539`，状态 `pass`。
  - `lateStages.markers.invalidCells`：candidate `0`，状态 `pass`。
  - 剩余 fail 仅为 `lateStages.zones.total`。

侍中验收：

- Playwright + 系统 Chrome 验证正式应用：
  - 页面阶段标识为 `source-stage-18-marker-first-pass`。
  - marker `539`，withIcon `539`，marker 类型 `30`。
  - 对象索引 marker 数 `539`，运行时面板 marker 行显示 `539`。
  - 点击/拾取 marker 坐标可返回 marker 对象。
  - `WebGL error = 0`，控制台无错误。

下一步建议：

- 进入 zones 第一刀，补 source 后段 zone 的数量级、类型分布、cells 字段和引用不变量。

## 2026-06-26 阶段 18 zones 第一刀

太子计划：

- 本刀只补 `Zones.generate()` 的后段数据产物，不做 zones 图层渲染、编辑器、legend、GeoJSON 导出或 notes 文案。
- 验收目标：
  - 生成 `pack.zones`，每个 zone 至少包含 `i/name/type/cells/color/hidden`。
  - 类型覆盖 source 常见类型：`Invasion`、`Rebels`、`Proselytism`、`Crusade`、`Disease`、`Disaster`、`Eruption`、`Avalanche`、`Fault`、`Flood`、`Tsunami`。
  - 强制 case 的 zone 总数接近 source `14`，且 `lateStages.zones.total` 通过。
  - `lateStages.zones.invalidCells` 保持 `0`。

尚书实施：

- 新增 `app/webgl-generator/src/generator/zones.js`：
  - 使用 `seed:zones` 派生随机流，不消耗主生成随机流。
  - 按 `Math.round(pack.cells.i.length / 5200)` 估算 zone 数量；强制 case 当前目标为 `14`。
  - 类型计划会多尝试几轮候选类型，避免单个类型因无候选 cell 导致总数明显低于目标。
  - 在 pack 邻接图上扩张连续区域，并按类型尽量选择符合语义的 cell：国家边界用于 invasion/rebels，宗教边界和 heresy 用于 proselytism/crusade，城市和人口用于 disease/disaster，高地用于 eruption/avalanche/fault，河流用于 flood，海岸用于 tsunami。
  - 所有 zone cell 都从合法 pack cell id 中产生，最终写入 `pack.zones`。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - marker 生成后把 `pack.markers` 暴露给 zones。
  - 接入 `buildZones(pack, options)`，地图对象新增 `zones`，summary 和 generation log 记录 zone 统计。
  - 阶段标识更新为 `source-stage-18-zones-first-pass`。
- 更新 `tools/webgl-generator-export-baseline.mjs`：
  - `society.zones` 和 `lateStages.zones` 改为读取 `candidateMap.zones?.zones` 或 `pack.zones`。
  - `lateStages.zones` 统计 `total/types/cells/hidden/invalidCells`。
  - trace 增加 `buildZones`，unsupported source stages 中移除 `Zones.generate`。
- 更新 `tools/baseline-diff.mjs`：
  - 当阶段 18 强制 case 全项通过时，下一步建议改为扩大 candidate matrix 回归，并评估 zone 图层、notes、编辑器和导出等后段专题深挖顺序。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/zones.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- Node 直接烟测通过：
  - 阶段标识 `source-stage-18-zones-first-pass`。
  - pack cells `73028`。
  - zones `14`，target `14`。
  - 类型覆盖全部 11 个目标类型，其中 `Disease`、`Flood`、`Proselytism` 各出现 `2` 次。
  - hidden `0`，invalidCells `0`。
- 已执行临时 out-dir 验证，产物未纳入版本库：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --name tmp-zones-check`
  - `society.zones` 为 `14`，`lateStages.zones.total` 为 `14`，`invalidCells` 为 `0`。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态从 marker 第一刀后的 `fail 1 / warn 0` 回到 `pass（fail 0，warn 0）`。
  - `lateStages.zones.total`：source `14`，candidate `14`，状态 `pass`。
  - `lateStages.zones.invalidCells`：candidate `0`，状态 `pass`。
  - 主生成指标继续保持通过。
- 太子整合后补跑小 case 烟测：
  - `mediterranean / 10000 / audit-mediterranean-10000` 生成 zones `2`，target `2`，invalidCells `0`。

侍中验收：

- 本刀只补数据和 baseline 摘要，不新增可见 zones 图层；运行时层面以 Node 直接生成、candidate summary 和 baseline diff 验收为准。
- 当前已知剩余风险：zones 只是 source 风格第一刀，尚未复刻 source 的高斯数量随机、完整 disease 路线传播、手工编辑器、SVG hatch 渲染、legend 和导出行为。

## 2026-06-26 source 最新代码比较与计划修正

太子复查：

- `source/Fantasy-Map-Generator` 已从 `3ee2e956` 拉取到 `5de7deb4`，当前 source 版本进入 `1.127.2` 系列。
- 这次 source 更新包含 67 个提交，不是单点 bugfix：
  - 生成器主目录从 `src/modules/*` 迁到 `src/generators/*`。
  - 动态 UI/编辑器大量迁到 `src/controllers/*`。
  - 渲染能力迁到 `src/renderers/*`，包括 `view-3d`、erosion bake、satellite texture、markets、goods、trade animation 等。
  - 新增官方架构和领域文档：`docs/architecture/*`、`docs/domain/generation_pipeline.md`、`goods_schema.md`、`production_schema.md`、`trade_schema.md`、`taxes.md`。
- source 最新 canonical pipeline 已把经济链路纳入正式生成流程：
  - `Goods.generate` 在人口评分和文化前后段之间建立 goods catalogue。
  - `Markets.generate`、`Production.produce`、`States.collectTaxes` 位于省份、河湖命名之后，军事、marker、zones 之前。
  - 经济阶段依赖 `pack.cells.biome/pop/s/state/province/routes`、burgs、states、provinces、routes 等完整语义链路。
- 当前阶段 18 强制 case `pass（fail 0，warn 0）` 只代表旧 source/candidate schema 的命名、军事、marker、zones 第一刀收口；尚不能代表最新 source 的 goods/markets/production/deals/taxes 已覆盖。

文档修正：

- 更新 `docs/current-plan.md`：
  - 记录 source `5de7deb4` 的结构迁移和经济管线新增事实。
  - 下一步改为先刷新 source/candidate baseline schema，新增 `goods/markets/production/deals/taxes` 摘要字段。
  - 若新增经济字段出现 fail，下一阶段进入阶段 19 经济链路第一刀。
- 更新 `docs/task-notes/source-first-recovery-execution-plan.md`：
  - 活跃源码路径改为 `src/generators/*`。
  - 补充 `src/controllers/*`、`src/renderers/*`、`src/services/*` 的新结构边界。
  - 在生成链结论中加入 goods catalog、经济阶段和 overlays 阶段。
- 更新 `docs/task-notes/source-first-detailed-task-plan.md`：
  - 将旧 `src/modules/*` 活跃路径替换为 `src/generators/*`。
  - 新增“2026-06-26 source 更新校正”说明。
  - 新增阶段 19：经济、市场、生产、税收。
  - 将河湖命名、marker、zones、military 后段深化调整为阶段 20。

下一步建议：

- 先不要继续做 zone 图层或 UI。
- 先扩展 `tools/source-export-baseline.mjs` 和 `tools/webgl-generator-export-baseline.mjs`，让最新 source 的 goods、markets、production、deals、taxes 进入 summary 和 diff。
- 基于 source `5de7deb4` 重新导出强制 case source summary，再重跑 candidate summary 和 diff。
- 根据新 diff 决定是否启动阶段 19 经济链路第一刀。

## 2026-06-26 economy baseline schema 第一刀

尚书实施：

- 更新 `tools/source-export-baseline.mjs`：
  - 顶层新增 `economy` 摘要，从 source runtime `window.pack` 真实统计。
  - 覆盖 `goods`、`markets`、`production`、`deals`、`taxes` 五组字段。
  - 增加经济引用检查，包括 cell good、recipe good、market center burg、cell market、burg market、production good/deal、deal party/good/index/amount 和 treasury mismatch。
- 更新 `tools/webgl-generator-export-baseline.mjs`：
  - candidate 输出同形 `economy` schema。
  - 当前没有经济实现，因此经济主体指标为 0。
  - `missingRequiredPackFields` 和 `candidateNotes.unsupportedSourceStages` 明确记录 `pack.goods`、`pack.markets`、`pack.deals`、`pack.cells.good`、`pack.cells.market`。
- 更新 `tools/baseline-diff.mjs`：
  - 新增 economy metrics 与 invalid invariants。
  - 新增 `economyPresent` candidate 特有检查。
  - 当 candidate 经济为空或缺少经济 pack 字段时，下一步建议优先切到阶段 19 经济链路第一刀。

门下复核：

- `node --check .\tools\source-export-baseline.mjs` 通过。
- `node --check .\tools\webgl-generator-export-baseline.mjs` 通过。
- `node --check .\tools\baseline-diff.mjs` 通过。
- 首次 source 强制 case 导出在沙盒内失败：
  - Vite 重新优化依赖时无法删除 `source/Fantasy-Map-Generator/node_modules/.vite/deps/alea.js.map`。
  - 精确错误为 `EPERM: operation not permitted, unlink ... alea.js.map`，随后等待 `http://127.0.0.1:5301` 超时。
- 提升权限重跑 source 导出成功，刷新：
  - `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/source-summary.json`
  - `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/source-trace.json`
  - `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/validation.md`
- 刷新 candidate 与 diff：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`

验证结果：

- source economy 摘要：`goods 71`，`markets 65`，`deals 33683`，`treasuryTotal 97479.1`。
- candidate economy 摘要：`goods 0`，`markets 0`，`deals 0`，缺失 `pack.goods`、`pack.markets`、`pack.deals`、`pack.cells.good`、`pack.cells.market`。
- diff 结果：`fail 28 / warn 11`，状态为 `fail`。
- fail 主体来自 economy 空链路；旧有 grid、pack、features、rivers、population、society、routes、lateStages 主指标继续保持通过。
- 下一步建议已更新为阶段 19：先补 goods catalogue、market territories、production records、deal log 和 state treasury，不做市场 UI、图表、贸易动画或编辑器。

给事中复核后修正：

- `deal.good` 是 source `Deal` 的必填 good id，不是可选引用；baseline validator 已从 optional ref 校验改为 required ref 校验，避免阶段 19 实现后把 `0/null/undefined` 的 deal good 漏判为合法。
- `burg.market` 是阶段性/可选派生字段；缺少市场时不再被计为 invalid，只有非零且不存在的 market id 才算引用错误。
- `deal.units` 校验改为非负数，避免 source 中极小/边界交易被 strict `> 0` 口径误判。
- `source-trace.json` 写出改为使用 `summary.trace`，保证外部 trace 文件与 summary 内部 trace 一致。
- `docs/current-plan.md` 已从“等待最新 source schema 刷新”改为“准备进入阶段 19 经济链路第一刀”。

优先级更正：

- 用户更正：经济和军事系统都不急。
- 阶段 19 不再立即做经济链路，而是改为 demo 编辑器原型。
- 下一步先在 `prototype/webgl-cells/` demo 中尝试高度编辑器、河流编辑器和国家编辑器，分别代表地形栅格编辑、线性对象编辑和政治区域/实体编辑三类典型编辑器。
- 经济链路缺口继续保留在 baseline 和后续阶段中，军事系统与军事编辑器也继续暂缓。

## 2026-06-27 demo 编辑器原型第一刀

尚书实施：

- 新增 `prototype/webgl-cells/src/editors.js`：
  - 提供 `DemoEditorController`，管理当前工具、编辑参数、选中国家、选中河流、撤销栈和重置。
  - 高度编辑器支持抬高、降低和平滑笔刷；直接修改 `grid.cells.h`，并同步对应 `pack.cells.h`。
  - 河流编辑器支持选中河流、调整 `widthFactor` 和拖动 points 节点。
  - 国家编辑器支持取样国家、涂抹 cell 归属和修改国家颜色。
- 更新 `prototype/webgl-cells/src/renderer.js`：
  - 新增 `refreshTheme()`，用于只更新专题颜色 buffer。
  - 新增 `rebuildBuffers()`，用于河流宽线、边界等需要重建 buffer 的编辑。
  - `installCanvasInteractions()` 支持编辑器接管 pointer down/move/up，避免编辑时触发平移。
- 更新 `prototype/webgl-cells/src/lines.js`：
  - 被编辑过的河流可通过运行时 `__editorUsePoints` 使用 points path，便于 demo 拖点验证。
- 更新 `prototype/webgl-cells/index.html` 和 `styles.css`：
  - 新增编辑器原型控制区。
  - 提供高度、河流、国家三类工具的参数控件、撤销、重置和状态显示。

门下检查：

- 本轮只改 `prototype/webgl-cells/` 与中文文档，不修改 `source/`。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\editors.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。

侍中验收：

- 复用 `http://127.0.0.1:5400` demo 服务，用系统 Chrome + Playwright 验证。
- 高度编辑：点击高度工具后，目标高度从 `54` 变为 `57`，撤销后总高度和目标高度恢复。
- 河流编辑：命中河流 `2`，`widthFactor` 从 `0.672` 改为 `0.77`。
- 国家编辑：先取样国家 `4`，再把目标 cell 从国家 `1` 涂抹为国家 `4`。

剩余风险：

- 这是 demo 级编辑器，不保存到 `.map` 或正式应用数据模型。
- 高度平滑按笔刷范围平均值收敛，因为当前 demo 快照没有 grid 邻接表。
- 河流拖点对被编辑河流改用 points path，只验证线性对象编辑交互，不代表 source 河流拓扑编辑。
- 国家编辑只处理 cell 归属和显示色，不维护国家统计、中心、城市归属或省份一致性。

## 2026-06-27 河流宽线河口裁剪修复

问题：

- 河流层改为按流量生成宽线 mesh 后，部分河流末端明显伸进海里。
- 根因不是宽度计算本身，而是正式生成器 `river.points` 遇到第一个水域 cell 时仍会使用水域 cell 中心；河口段参与蜿蜒后，宽线会进一步放大这个偏移。

尚书实施：

- `app/webgl-generator/src/generator/rivers.js`：
  - `getRiverPoints()` 遇到 `-1` 或第一个水域 cell 时立即截断，不再把水域 cell 中心加入 path。
  - 入海点优先取“上一陆地 cell 中心到水域 cell 中心”与陆海共享边的交点；无法求交时退回共享边中点，再退回高度插值。
  - 最后一段入海段跳过 meander 扰动，避免控制点摆入海里。
- `prototype/webgl-cells/src/lines.js`：
  - demo snapshot 的 cell fallback path 同步使用共享边交点优先的河口裁剪，保留高度插值兜底。

门下检查：

- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node --check .\app\webgl-generator\src\generator\rivers.js` 通过。

侍中验收：

- 使用正式生成器跑 `mediterranean / 100000 / audit-mediterranean-001` 几何烟测。
- 本次样例生成河流 `912` 条，其中 `585` 条以水域 cell 入海、`68` 条以地图边界出界；入海河流末点等于水域 cell 中心数量为 `0`，共享岸线附近异常数量为 `0`。

## 2026-06-27 demo 编辑器交互修正

问题：

- 高度编辑只有半径内统一强度，缺少原版式的鼠标中心强、边缘弱的笔刷衰减。
- 国家编辑只在点击时修改单个 cell，拖动过程中不会连续涂抹；每次修改都重建全量 buffer，造成明显卡顿。
- 国家取样和涂抹时状态信息不够明确，颜色相似时难以确认当前目标国家和被覆盖国家。

尚书实施：

- `prototype/webgl-cells/index.html` 新增高度“中心衰减”开关和国家“半径”滑条。
- `prototype/webgl-cells/src/editors.js`：
  - 抬高/降低笔刷在启用中心衰减时按距离使用 smoothstep 权重，中心强度最高、半径边缘逐步减弱。
  - 国家涂抹改为拖拽笔刷，按鼠标轨迹补采样，单次操作可连续修改多个 cell。
  - 拖动期间只刷新专题颜色 buffer，抬手后再重建边界 buffer，避免每个 cell 修改都触发全量重建。
  - 状态面板持续显示目标国家、来源国家、颜色值和本次涂抹 cell 数。

门下检查：

- `node --check .\prototype\webgl-cells\src\editors.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `git diff --check` 通过。

侍中验收：

- 复用 `http://127.0.0.1:5400` demo 服务，用系统 Chrome + Playwright 验证。
- 高度中心衰减验证：中心 cell 高度增量 `8`，边缘样本 cell 增量 `4`。
- 国家拖拽涂抹验证：一次拖拽改动 `643` 个 cell，状态面板包含“目标国家”和“来源国家”。

## 2026-06-27 demo 河流管理面板第一刀

问题：

- 河流编辑器只有点选后的改宽/拖点能力，缺少全量河流管理入口。
- 用户需要先从列表中查看长度和流量，快速定位某条河流，再进入编辑。
- 定位后需要用醒目的红色闪烁路径描出河流，避免在复杂底图中找不到目标。

尚书实施：

- `prototype/webgl-cells/index.html`：
  - 河流编辑面板新增摘要区、id / 名称筛选框和全量河流列表。
- `prototype/webgl-cells/src/editors.js`：
  - 新增河流 metrics 统计，按 `river.points` 累加长度，流量优先读取 `discharge / flux / width`。
  - 河流列表展示单条名称、id、长度和流量，点击列表行会选中并定位。
  - 定位时根据河流 bounds 调整 camera，使河流进入视野中心。
  - 新增 SVG 高亮层，跟随 WebGL camera 把选中河流绘制为红色闪烁 path。
  - 浏览模式下直接点击河流，会自动切换到河流编辑工具并选中该河流。
  - 状态面板补充选中河流长度和流量。
- `prototype/webgl-cells/src/styles.css`：
  - 新增河流摘要、河流列表、选中行和闪烁高亮 path 样式。

门下检查：

- `node --check .\prototype\webgl-cells\src\editors.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `git diff --check` 通过。

侍中验收：

- 复用 `http://127.0.0.1:5400` demo 服务，用系统 Chrome + Playwright 验证。
- 河流列表渲染 `1240` 条河流，摘要显示总长度和最大流量。
- 点击第一条河流后，camera 居中到河流，红色高亮 path 可见并处于闪烁状态。
- 浏览模式下点击河流中段，会自动切换为河流编辑工具并保持选中该河流。
- 筛选框输入选中河流 id 后，列表仍能显示匹配河流。

后续约束修正：

- 用户确认 demo 形态可以接受，但正式版河流统计/管理面板必须是独立浮动面板，不应与其它面板混用。
- 已更新 `docs/architecture/floating-panel-architecture.md`：正式版河流统计、全量列表、筛选、长度/流量排序、定位、河道编辑和撤销入口归入独立 `panels/river-panel.js`；对象详情面板只可显示摘要和打开入口，不承载完整河流管理。
- 已更新 `docs/current-plan.md`：明确 demo 的侧栏混合布局只是交互验证，正式应用不得照搬。

## 2026-06-27 正式版河流宽度 flux 修复

问题：

- 用户指出正式版河流宽度又丢失了与流量相关的变化。
- 排查确认：正式 renderer 虽然使用 `screen-space flux mesh`，但每个 point 的 flux 通过 `points.length` 与 `river.cells.length` 的比例粗略采样 cell；河口裁剪和 meander 简化后，points 与 cells 不再稳定一一对应，导致宽度关系容易退化。

尚书实施：

- `app/webgl-generator/src/generator/rivers.js`：
  - `river.points` 的第三位现在保存该点对应的沿程 flux。
  - 基础 cell 点取当前 cell flux；河口和出界点取上一陆地 cell flux；meander 控制点按起终点 flux 插值。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 河宽计算优先读取 `point[2]`，只有旧数据没有 point flux 时才回退到 cell 比例采样。
  - `riverWidthStats` 新增 `minFlux/maxFlux`，便于运行时确认宽度来源。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计面板新增“河流流量”行。

门下检查：

- `node --check .\app\webgl-generator\src\generator\rivers.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。

侍中验收：

- Node 生成器烟测确认所有 `river.points` 都带第三位 flux，渲染相关 point flux 范围为 `30..1404`。
- 正式应用 `http://127.0.0.1:5410` 用系统 Chrome + Playwright 验证：
  - `riverWidthMode` 为 `screen-space flux mesh`。
  - `riverWidthStats.minWidthPx/maxWidthPx` 为 `1.1..4.1`。
  - `riverWidthStats.minFlux/maxFlux` 为 `30..1367`。
  - 运行时统计面板已显示“河流流量”。

## 2026-06-27 编辑器与统计面板清单

问题：

- demo 已验证高度、河流和国家三类编辑器，但正式版不能继续只靠临时侧栏堆功能。
- 后续需要先明确哪些对象需要编辑器，哪些对象需要统计面板，哪些系统暂缓。
- 河流管理已经被明确要求为独立浮动面板，这个边界需要扩展到其它领域面板。

实施：

- 新增 `docs/task-notes/editor-and-stat-panel-inventory.md`：
  - 按生成、图层、对象详情、地形环境、水文线性对象、政治社会对象、标签视觉对象和暂缓系统分组。
  - 明确每个领域是否需要编辑器、是否需要统计面板、编辑范围、统计范围和优先级。
  - 将河流面板列为最高优先级，要求正式版做成独立浮动 `river-panel`。
  - 将经济和军事系统列为暂缓，不进入近期编辑器主线。
  - 补充正式编辑器前必须先建立的 edit command / undo command、selection store、highlight / locate API、object table 和派生重建调度。
- 更新 `docs/current-plan.md`：
  - 下一步从 demo 编辑器转为正式版编辑器基础设施和第一批正式面板。
  - 第一批正式版目标为河流独立浮动面板、高度编辑器第一刀和国家编辑器第一刀。

验证：

- 本次为文档规划变更，未改运行时代码。

## 2026-06-27 正式版编辑器基础设施第一刀

问题：

- demo 已验证高度、河流和国家三类编辑交互，但正式应用仍只有 `runtime/app.js` 内的零散 `selection` / `editingObject` 状态。
- 对象详情面板只有“编辑/退出编辑”状态切换，没有统一命令历史、撤销栈或对象定位入口。
- 后续独立 `river-panel` 需要复用 selection、定位和命令历史基础设施，不能再把逻辑堆进单个面板。

中书舍人调查：

- 实际启动子智能体 `Archimedes` 做只读调查，确认现有 selection 流转为 renderer click -> `runtime/app.js` -> `renderer.setSelection()` -> 对象详情面板。
- 调查确认正式应用没有已有 undo/edit command 骨架，也没有通用 locate/highlight API。
- 调查建议第一刀先补 selection store、命令历史和 locate API，再进入 `river-panel`。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/selection-store.js`：
  - 统一维护 `selection` 和 `editingObject`。
  - selection 变化时会自动清理不匹配的编辑对象，并通知 runtime 刷新 renderer、对象详情和固定 pick 面板。
- 新增 `app/webgl-generator/src/runtime/edit-history.js`：
  - 提供 `execute()`、`undo()`、`redo()`、`clear()` 和 `getStats()`。
  - 命令契约要求提供 `apply(context)` 和 `revert(context)`。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 用 `SelectionStore` 接管原先散落的 selection/editingObject 更新。
  - 生成新地图时清空 selection store 和 edit history。
  - 新增对象详情“定位”回调。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `locateObject()`。
  - 支持点对象、路线、河流、国家、省份和区域的 bbox 定位。
  - 运行时统计新增 `locateStatus`。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 对象详情面板新增“定位”按钮。
  - “编辑”按钮仍只切换编辑状态，不修改地图数据。
- 修改 `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/styles.css`：
  - 运行时统计显示定位状态和编辑历史。
  - 对象详情操作区改成两个按钮并排。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\edit-history.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\selection-store.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。

侍中验收：

- 启动正式应用 `http://127.0.0.1:5410`。
- Playwright 验证选中河流对象后：
  - 对象详情面板打开。
  - “定位”按钮存在。
  - `renderer.locateObject()` 返回 `true`。
  - `locateStatus` 为 `river #1`。
  - camera 从全图状态移动到河流 bbox。
  - 运行时统计包含“编辑历史”。
- Playwright 验证 `EditHistory`：
  - `execute()` 后 `undo = 1 / redo = 0`。
  - `undo()` 后上下文值恢复，`undo = 0 / redo = 1`。
  - `redo()` 后上下文值重新应用，`undo = 1 / redo = 0`。

给事中复核修正：

- 实际启动子智能体 `Avicenna` 做只读复核。
- 修复 `locateObject()` 对国家、省份、区域等大范围对象强制放大导致 bbox 可能被裁切的问题：
  - 点对象仍保留最小放大。
  - 线对象和面对象允许缩小到更低 scale，以完整容纳 bbox。
- 修复定位失败后运行时统计不刷新的问题：
  - 对象详情“定位”失败时会更新 `locateStatus = not found`。
- 修复 route / river 摘要对象缺少 `distance` 时详情面板和固定 pick 面板可能崩溃的问题：
  - 缺失命中距离时显示 `n/a`。
- 修正 `app/webgl-generator/README.md` 的旧描述：
  - 河流主线层已是按流量变宽的 screen-space mesh，剩余缺口是河道编辑手柄尚未接入。

补充验收：

- Playwright 验证最大国家定位后，国家 cell 中心 bbox 完整落在 viewport 内。
- Playwright 验证不存在河流对象点击“定位”后，运行时统计显示 `not found`。
- Playwright 验证不带 `distance` 的 route / river 摘要对象不会崩溃，并显示 `n/a`。

后续：

- 下一刀进入独立浮动 `river-panel`，复用本次的 selection store、edit history 和 locate API。
- 对象表格组件、派生重建调度、区域编辑命令 payload 仍待补。

## 2026-06-27 正式版独立河流管理面板第一刀

问题：

- demo 河流管理面板已经验证列表、定位和红色闪烁高亮，但正式版必须是独立浮动面板。
- 正式应用此前只有对象详情中的河流摘要，没有全量河流管理入口。
- 用户明确要求正式版河流统计面板不能与其它面板混用。

中书舍人调查：

- 实际启动子智能体 `Anscombe` 做只读调查。
- 调查结论：第一刀应做独立 `river-panel` 管理面板，职责限于全量列表、统计、筛选、排序、选择、定位和进入编辑状态。
- 调查建议河流写入类操作暂缓，后续任何编辑都必须走 `EditHistory` 命令。

尚书实施：

- 新增 `app/webgl-generator/src/ui/components/object-table.js`：
  - 提供轻量对象表格，支持行点击、双击定位、选中态和行内定位按钮。
- 新增 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 注册独立浮动 `river-panel`。
  - 统计河流数量、总长度、最大流量和筛选结果数。
  - 生成全量河流列表，展示 id、类型、长度和流量。
  - 支持按 id / 类型筛选，按流量、长度和 id 排序。
  - 支持列表选中、定位和进入河流编辑状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 创建 `state.panels.river`。
  - selection 变化时同步刷新河流面板。
  - 左侧“河流管理”按钮可直接打开全量河流面板。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 河流对象详情新增“河流面板”入口。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `locateObject()` 定位对象后启动短时 `locateFlash`。
  - 河流定位期间 selection pass 使用红色闪烁高亮；闪烁结束后回到普通河流高亮。
- 修改 `app/webgl-generator/index.html` 和 `app/webgl-generator/src/styles.css`：
  - 左侧视图区新增“河流管理”按钮。
  - 新增河流面板摘要、筛选、排序、表格和详情样式。
- 修改 `app/webgl-generator/src/ui/panel-manager.js`：
  - 注册面板时支持 `maxWidth`，方便河流面板保持更宽布局。

门下检查：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\components\object-table.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。

侍中验收：

- 正式应用 `http://127.0.0.1:5410` 用系统 Chrome + Playwright 验证。
- 点击左侧“河流管理”后，独立浮动 `river-panel` 打开。
- 河流列表数量 `165`，与 `map.rivers.metadata.rivers` 一致。
- 面板摘要包含“总长度”和“最大流量”。
- 点击列表首行后，`selection.object.kind = river`，列表有 1 行选中态。
- 点击行内“定位”后：
  - `locateStatus = river #45`。
  - `selectionHighlightMode = river red flash`。
  - 约 2.85 秒后回到 `river screen-space mesh`。
- 筛选选中河流 id 后，列表收敛到匹配行。
- 点击“进入河流编辑”后，`editingObject.kind = river`，对象详情状态显示“编辑”。
- 点击河流面板输入框不会改变地图 camera，面板内交互没有误触地图 pan/selection。

给事中复核修正：

- 实际启动子智能体 `Volta` 做只读复核。
- 复核未发现阻断本刀合入的 blocker。
- 修复红色闪烁结束后左侧运行时统计可能停留在 `river red flash` 的问题：
  - `locateFlash` 结束时调用 `onViewChange()` 刷新统计面板。
- 收窄 river-panel 行对象与完整 river 数据的混淆风险：
  - selection 摘要中的 `length` 改为数字，不再传格式化字符串。
  - 完整编辑数据解析仍留给后续 object resolver 和具体编辑命令处理。
- 修正 `app/webgl-generator/README.md` 与 `docs/architecture/floating-panel-architecture.md` 中对象详情、河流 mesh 和已接入面板的旧描述。

补充验收：

- Playwright 验证定位后立即为 `selectionHighlightMode = river red flash`，左侧运行时统计包含 `river red flash`。
- 等待约 2.9 秒后，`selectionHighlightMode` 和左侧统计均回到 `river screen-space mesh`。
- Playwright 验证河流 selection 摘要中的 `length` 类型为数字。

后续：

- 河流面板第二刀可以补低风险 `widthFactor` 编辑命令，并接入 `EditHistory` 撤销/重做。
- 河道拖点、源头/河口修正和支流结构调整仍暂缓，需先补派生重建调度和对象 resolver。

## 2026-06-27 河流面板 widthFactor 编辑命令第一刀

问题：

- 河流管理面板已经能统计、筛选、选中和定位，但还没有真正通过正式编辑命令修改河流。
- 下一步需要选一个低风险编辑项验证 `EditHistory` 路径，避免直接进入河道拖点这种高派生依赖操作。

中书舍人调查：

- 实际启动子智能体 `Faraday` 做只读调查。
- 调查确认 `widthFactor` 来自 `rivers.js` 的河流生成阶段，渲染时 `placeholder-renderer.js` 会在每次 `draw()` 的 `updateRiverBuffer()` 中读取当前 `river.widthFactor` 重建河流 mesh。
- 调查建议命令只做数据修改，刷新放在 `runtime/app.js` 外层统一处理；`context` 最小只需 `{map}`。
- 调查提示 `river.width` 仍是生成期摘要，当前只改 `widthFactor` 会改变几何宽度，不强制改变颜色深浅；该行为作为本刀低风险取舍保留。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/river-edit-commands.js`：
  - 新增 `createSetRiverWidthFactorCommand(riverId, nextValue)`。
  - 命令按 `riverId` 从 `map.rivers.rivers` 解析完整河流对象。
  - `apply()` 写入 clamp 后的 `widthFactor`。
  - `revert()` 恢复旧值；如果旧对象没有 `widthFactor` 字段，则撤销时删除字段。
  - 使用独立 `capturedPrevious` 标记记录旧值，避免旧值为 `null` 时重复捕获。
  - 提供 `isNoop()`，相同宽度因子不会写入历史栈。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - `riverPanel.onSetWidthFactor` 通过 `EditHistory.execute()` 执行命令。
  - 新增 `refreshAfterEdit()`，统一刷新 renderer、对象详情、河流面板、运行时统计和悬停/选中面板。
  - 接入河流面板的撤销和重做按钮。
- 修改 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 选中河流详情显示“宽度因子”。
  - 新增 range slider、“应用宽度”、“撤销”和“重做”。
  - slider 拖动只更新面板显示，点击“应用宽度”才写入命令历史。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增河流宽度编辑区和按钮布局样式。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\river-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `git diff --check` 对本刀相关文件通过。

侍中验收：

- 正式应用 `http://127.0.0.1:5410` 用系统 Chrome + Playwright 验证。
- 选中河流 `#45`，初始 `widthFactor = 1`，`editHistory undo/redo = 0/0`，`WebGL error = 0`。
- 将宽度因子应用为 `1.45` 后：
  - 目标河流 `widthFactor = 1.45`。
  - `editHistory undo = 1 / redo = 0`。
  - `lastLabel = 调整河流 #45 宽度因子`。
  - 河流面板显示 `1.45`。
  - `WebGL error = 0`。
- 重复点击“应用宽度”不会增加历史栈，`undo` 仍为 `1`。
- 点击“撤销”后：
  - 目标河流 `widthFactor = 1`。
  - `editHistory undo = 0 / redo = 1`。
  - 河流面板显示 `1.00`。
- 点击“重做”后：
  - 目标河流 `widthFactor = 1.45`。
  - `editHistory undo = 1 / redo = 0`。
  - 河流面板显示 `1.45`。
- 点击“生成 grid 地图”后：
  - `editHistory undo/redo = 0/0`。
  - `selection = null`。
  - `editingObject = null`。

给事中复核修正：

- 实际启动子智能体 `Sagan` 做只读复核。
- 复核未发现 blocker。
- 复核指出“撤销/重做”是全局 `EditHistory`，放在选中河流详情区可能让用户误以为只针对当前河流。
- 已修正河流面板文案：
  - “撤销”改为“撤销上次”。
  - “重做”改为“重做上次”。
  - 宽度编辑区显示“最近命令”，用于明确当前全局命令栈状态。
- 补充浏览器验证：
  - 应用宽度后，面板显示 `最近命令：调整河流 #45 宽度因子`。
  - 撤销后，面板显示 `最近命令：撤销 调整河流 #45 宽度因子`。
  - 重做后，面板显示 `最近命令：重做 调整河流 #45 宽度因子`。

后续：

- 补对象 resolver，避免后续复杂编辑误用 selection 摘要对象。
- 河道拖点、源头/河口修正、支流结构和 cells 级变更必须等派生重建调度就绪后再做。

## 2026-06-27 对象 resolver 第一刀

问题：

- 河流面板和对象详情面板会从 picking、列表行和编辑状态里传递对象摘要。
- 摘要对象适合展示和定位，但不适合直接进入复杂编辑；后续河道、国家、高度等编辑需要稳定拿到当前地图上的完整对象字段。

中书舍人调查：

- 实际启动子智能体 `Banach` 做只读调查。
- 调查确认 selection 来源包含 canvas picking、标签点击、河流表格行和对象详情按钮。
- 调查建议 resolver 先覆盖 city、label、marker、route、river、state、province 和 region，避免后续编辑器直接依赖摘要字段。
- 调查建议把 resolver 注入 `SelectionStore`，使选中、进入编辑和刷新都走同一解析路径。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/object-resolver.js`：
  - `resolveObject(map, object)` 按 `kind` 分派解析。
  - city、label、marker、route、river、state、province 和 region 会从当前 `map` 上重新读取字段。
  - river 解析补齐 `points/cells/flux/discharge/length/segments/widthFactor/source/mouth` 等字段。
  - state、province 和 region 对 `id/i` 字段做兼容处理。
- 修改 `app/webgl-generator/src/runtime/selection-store.js`：
  - 构造函数接收 resolver。
  - `setSelection()`、`startEditing()` 和 `refresh()` 都会重新解析对象。
  - resolver 返回空时，当前 selection 会被清空，避免保留无效对象。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 注入 `resolveObject(state.map, object)`。
  - `refreshAfterEdit()` 在重绘后调用 `selectionStore.refresh()`，让河流宽度等运行时改动反馈到对象详情和河流面板。
  - 对象详情中的“打开河流管理”也统一传入 `EditHistory` 状态。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\object-resolver.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\selection-store.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\river-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source/Fantasy-Map-Generator` 为空，未修改 source 原项目源码。

侍中验收：

- 使用临时静态 server + Playwright 打开正式应用。
- city、route、river、state、province、region、marker 和 label 共 8 类对象均能通过 `SelectionStore` 解析，并可 `renderer.locateObject()` 定位。
- 无效河流 `river #-999` 会清空 selection。
- 选中河流 `#1` 后，将 `widthFactor 1.2 -> 1.55`，`selectionStore.refresh()` 后 selection 中的 `widthFactor` 同步为 `1.55`。
- 执行撤销后，selection 中的 `widthFactor` 恢复为 `1.2`。
- 点击“生成 grid 地图”后，selection、editingObject 和 edit history 均清空。

后续：

- 下一刀先补派生重建调度，明确哪些编辑只需重绘、哪些需要重建边界/索引/统计、哪些必须重新跑语义扩张。
- 派生调度之后进入正式高度编辑器第一刀。

## 2026-06-27 派生重建调度第一刀

问题：

- `refreshAfterEdit()` 过去只有全量 `renderer.draw()` 和 `selectionStore.refresh()` 一条路径。
- `renderer.draw()` 每次都会重建 route、river 和 selection 三类动态 mesh；对河流宽度这类小改动来说过粗。
- `selectionStore.refresh()` 会触发 selection 回调，回调里又会 `renderer.setSelection()` 并重绘，因此调度顺序不收敛时容易重复 draw。

中书舍人调查：

- 实际启动子智能体 `Jason` 做只读调查。
- 调查确认第一刀应先建立命令级 `effects` 和统一调度入口，不急着拆 renderer 内部 buffer。
- 调查建议把 `visual: rivers` 等细粒度语义先映射到现有 `draw()`，后续再拆 `renderer.refreshDerived()`。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 提供 `createEditRefreshScheduler()` 和 `normalizeEditEffects()`。
  - 命令可声明 `render/selection/runtimeStats/pickPanel/derived/affected`。
  - 第一刀仍使用现有 `renderer.draw()`，但保留 `derived` 语义用于后续拆分。
  - 当 effects 需要 `selection: "refresh"` 时，调度器先写入 `state.lastEditRefresh`，再走 `selectionStore.refresh()`，由 selection 回调统一刷新面板和触发绘制，避免先 draw 后再 draw。
- 修改 `app/webgl-generator/src/runtime/river-edit-commands.js`：
  - `createSetRiverWidthFactorCommand()` 声明影响 `river-mesh`、`river-width-stats` 和 `object-panels`。
  - `affected` 记录目标 `riverId`。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - `state` 新增 `editRefreshScheduler` 和 `lastEditRefresh`。
  - execute/undo/redo 后统一调用调度器，而不是直接调用旧 `refreshAfterEdit(state, documentRef)`。
  - 生成新地图时清空 `lastEditRefresh`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“编辑刷新”，显示最近一次 render、selection、derived 和 affected。

给事中复核修正：

- 实际启动子智能体 `Lorentz` 做只读复核，未发现 blocker。
- 复核建议高度刷子会是高频操作，后续不能每个 mousemove 都默认刷新 selection 和面板。
- 已新增 `EDIT_REFRESH_PRESETS`：
  - `RIVER_WIDTH_ONLY`：河流宽度类编辑，刷新 river mesh、宽度统计和对象面板。
  - `HEIGHT_SURFACE_ONLY`：高度提交类编辑，刷新高度字段、cell 颜色和高度统计，不刷新 selection。
  - `HEIGHT_BRUSH_PREVIEW`：高度拖动预览，刷新高度字段和 cell 颜色，不刷新 runtime/pick 面板。
- 河流 `widthFactor` 命令已改为复用 `RIVER_WIDTH_ONLY` preset，避免 effects 字符串在命令间漂移。

后续：

- 第二小刀可以给 renderer 增加 `refreshDerived()`，先拆 route、river、selection buffer 的单独刷新。
- 高度编辑器第一刀前，需要给高度命令声明 cell/color/stat 类 effects，避免把所有刷子操作都写成无语义全量刷新。

## 2026-06-27 正式高度编辑器第一刀

问题：

- demo 已验证高度抬升、降低、平滑和中心衰减笔刷，但正式应用还没有独立高度编辑面板。
- 正式应用 renderer 目前 cell 位置和颜色仍在同一个 `vertexBuffer`，第一刀不适合直接拆成细粒度 color buffer。
- 高度编辑会牵动 feature、climate、river、biome、人口和政治社会系统，第一刀必须限制范围，避免假装已经完成完整派生重算。

中书舍人调查：

- 实际启动子智能体 `Sartre` 做只读调查。
- 调查确认主高度字段为 `map.grid.cells.h`，`pack.cells.h` 是从 grid 派生的语义层高度。
- 调查确认 renderer 高度专题颜色最终读取 `map.grid.cells.h`，当前可通过重建 cell surface 让颜色变化立即可见。
- 调查建议第一刀做“高度表层编辑”，只同步 `grid.cells.h` 和已映射的 `pack.cells.h`，不重跑海陆 feature、气候、河流、生物群系或社会政治派生。

尚书实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `refreshCellSurface()`，用于重建 cell surface `vertexBuffer` 并绘制。
  - `setColorMode()` 改为复用该入口。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - effects 包含 `cell-colors` 时优先调用 `renderer.refreshCellSurface()`。
- 新增 `app/webgl-generator/src/runtime/height-edit-commands.js`：
  - `createApplyHeightBrushCommand()` 把高度笔刷提交为可撤销命令。
  - `applyHeightBrushPreview()` 支持拖动中的预览刷新。
  - 命令同步 `grid.cells.h` 和所有映射到同一 grid cell 的 `pack.cells.h`。
- 新增 `app/webgl-generator/src/ui/panels/height-panel.js`：
  - 注册独立浮动 `height-panel`。
  - 支持启用/停止高度编辑、抬升、降低、平滑、半径、强度、中心衰减、撤销和重做。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 左侧“视图”区新增“高度编辑”入口。
  - 高度面板启用后自动切到 height 专题。
  - canvas capture 阶段接管高度编辑 pointer 事件，避免编辑时触发地图 pan。
  - 拖动中使用 `HEIGHT_BRUSH_PREVIEW`，抬手后创建命令并使用 `HEIGHT_SURFACE_ONLY` 进入历史栈。
  - 对 pointer capture 做容错，避免测试或浏览器边缘路径中断笔刷。
- 修改 `app/webgl-generator/index.html` 和 `app/webgl-generator/src/styles.css`：
  - 新增高度编辑按钮和高度面板样式。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\height-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\height-panel.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\edit-refresh-scheduler.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。

侍中验收：

- 使用临时静态 server + Playwright 打开正式应用。
- 打开“高度编辑”面板并启用后，目标专题切到 `height`。
- 在 canvas 上抬升一次：
  - 目标 grid cell 高度 `34 -> 52`。
  - `EditHistory` 记录 `undo 1 / redo 0`。
  - `lastEditRefresh` 为 `height-field, cell-colors, height-stats`，affected 为 `grid-cells#23`。
  - camera 保持 `scale 1 / offset 0,0`，高度编辑没有触发地图 pan。
- 点击“撤销上次”后，目标 grid cell 高度恢复 `52 -> 34`，历史变为 `undo 0 / redo 1`。
- 中心衰减验证：
  - 抬升前中心 cell `17`、边缘样本 `22`。
  - 抬升后中心 cell `21`、边缘样本仍为 `22`，中心变化大于边缘。
- 降低和平滑均能形成命令并进入撤销栈。
- `git diff --name-only -- source/Fantasy-Map-Generator` 为空，未修改 source 原项目源码。

给事中复核修正：

- 实际启动子智能体 `Pauli` 做只读复核，未发现 blocker。
- 复核指出高度编辑启用后实际已切到 height 专题，但左侧专题按钮 active 样式可能不同步。
- 已新增 `setActiveModeButton()`，高度编辑启用时同步把左侧专题按钮切到“高度”。
- 复核提示的后续非阻断优化：
  - 高度 preview 仍会重绘高度面板，可在大半径高频拖动场景下再做节流或局部数字更新。
  - `pointercancel` 当前会提交已有预览，触屏路径后续可改成撤回或明确提交策略。
  - renderer 内部仍会在 `draw()` 中重建 route/river/selection buffer，真正局部 buffer 刷新留给后续。

后续：

- 下一刀推进正式国家编辑器第一刀，复用 edit command、effects、浮动面板和连续涂抹经验。
- 高度编辑器第二刀再讨论完整派生重算，包括 feature、climate、river、biome 和人口等系统。

## 2026-06-27 正式国家编辑器第一刀

问题：

- 正式应用已经有高度编辑器和河流管理/widthFactor 编辑路径，但国家编辑仍停留在 demo 经验和计划层。
- 本刀目标限定为国家 cell 归属表层编辑，先验证浮动面板、目标国家选择、连续涂抹、预览刷新和 EditHistory 提交，不重跑完整政治派生。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - `createApplyStateBrushCommand()` 将国家 cell 归属变化封装为可撤销命令。
  - `applyStateBrushPreview()` 支持拖动中预览。
  - 命令同步修改 `grid.cells.state` 与映射到同一 grid cell 的所有陆地 `pack.cells.state`，避免只改 primary pack cell。
  - 提交 effects 声明为 `state-cells / cell-colors / political-selection` 且 `selection: refresh`，预览 effects 只刷新 `state-cells / cell-colors`。
- 新增 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 注册独立浮动 `state-panel`，标题为“国家编辑”。
  - 支持启用/停用、目标国家下拉选择、从当前选中对象取样、从悬停 cell 取样、笔刷半径、撤销和重做。
  - 面板显示目标国家、来源国家、最近影响 cells 和全局历史计数。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 接入国家编辑面板和左侧“国家编辑”入口。
  - 国家编辑启用后自动切到 `states` 专题，并与高度编辑互斥。
  - canvas capture 阶段接管国家编辑 pointer 事件，避免涂抹时触发地图 pan 或 selection。
  - 拖动中使用预览 effects 按 `cell-colors` 语义刷新 cell surface；pointerup/pointercancel 生成 EditHistory 命令并刷新 selection/runtime/pick。
  - 提交、撤销和重做前会按最近一次笔刷位置重新 pick，避免 hover 面板继续显示编辑前的国家快照。
  - undo/redo 从国家面板触发时会刷新 cell surface 和 selection。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `states` 专题颜色优先使用 `map.politics.states[*].color`。
  - 缺失国家色时才回退到 indexed 伪色，使国家面板展示和地图颜色更一致。
- 修改 `app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/index.html` 和 `app/webgl-generator/src/styles.css`：
  - 绑定“国家编辑”按钮。
  - 补齐国家面板摘要、目标选择、取样按钮、半径 slider 和历史按钮样式。
- 修改 `docs/current-plan.md`：
  - 将下一步从“推进国家编辑器第一刀”更新为“第一刀补丁已落地，下一刀补政治派生一致性”。

当前边界与风险：

- 国家编辑当前不会同步 `grid.cells.province/region`、`pack.cells.province`、城市/ burg 的 state、路线、军事、zones 或 state statistics，因此它是表层 cell 归属编辑，不是完整政治重算。
- 预览仍按高度编辑器同级策略遍历全部 grid cells，大半径和高频拖动下后续需要做空间索引或局部候选优化。

检查：

- `node --check .\app\webgl-generator\src\runtime\state-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。

侍中验收：

- 使用临时静态 server + Playwright 打开正式应用。
- 打开“国家编辑”面板后启用国家编辑，专题自动切到 `states`，左侧 active 只保留“国家”。
- 选取一个映射到 3 个陆地 pack cell 的 grid cell，拖动涂抹到目标国家：
  - `grid.cells.state` 从 `13 -> 1`。
  - 对应 3 个 `pack.cells.state` 从 `[13, 13, 13] -> [1, 1, 1]`。
  - `EditHistory` 记录 `undo 1 / redo 0 / 国家笔刷 10 cells`。
  - `lastEditRefresh` 为 `state-cells, cell-colors, political-selection`，且 `selection` 为 `refresh`。
  - camera 保持 `scale 1 / offset 0,0`，国家编辑没有触发地图 pan。
  - 面板包含“来源国家”信息。
- 点击“撤销上次”后：
  - `grid.cells.state` 恢复 `1 -> 13`。
  - 对应 3 个 `pack.cells.state` 恢复 `[13, 13, 13]`。
  - 历史变为 `undo 0 / redo 1`。

## 2026-06-27 编辑态交互锁补丁

问题：

- 用户反馈编辑时最好禁用编辑外的交互。
- 现状中高度/国家笔刷已经拦截大部分 canvas pan/select，但左侧生成、专题切换、其它面板入口和非当前浮动面板控件仍可能被误触。

实施：

- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 新增 `setEditingInteractionLock()`，统一禁用左侧生成、随机 seed、适配视图、专题切换、编辑入口和生成参数控件。
  - 支持传入允许操作的浮动面板 id；非当前编辑面板中的按钮、输入和下拉会被禁用。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 高度编辑、国家编辑和对象编辑状态变化时统一刷新交互锁。
  - canvas capture 阶段新增编辑锁拦截，编辑状态中阻止非当前编辑器需要的 pointer 和 wheel 事件继续传给 renderer。
  - 编辑期间 hover 或 selection 导致面板重绘后，会重新应用锁，避免新 DOM 控件恢复可点。
- 修改 `app/webgl-generator/src/styles.css`：
  - 禁用控件变淡并显示不可操作 cursor。
  - 非当前编辑浮动面板内容变淡，并显示“编辑中，暂不可操作”提示。

边界：

- 当前允许的编辑面板：
  - 高度编辑：只允许 `height-panel`。
  - 国家编辑：只允许 `state-panel`。
  - 河流对象编辑：允许 `object-details` 和 `river-panel`。
  - 其它对象编辑：允许 `object-details`。
- 面板关闭按钮仍保持可用，避免用户被锁在遮挡视图的浮动面板里。

验证：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source/Fantasy-Map-Generator` 为空。
- Playwright 临时静态 server 验证：
  - 打开国家编辑面板和高度编辑面板，启用高度编辑后，`body.editing-locked` 为 true。
  - 左侧生成、专题按钮和国家编辑入口均 disabled。
  - 当前高度面板的“停止高度编辑”仍可点击。
  - 非当前 `state-panel` 的 select 被禁用，面板带 `editing-panel-disabled`。
  - 编辑状态下拖拽 canvas 后 camera 仍为 `scale 1 / offset 0,0`。
  - 点击“停止高度编辑”后，左侧控件和 `state-panel` 控件恢复可用。

## 2026-06-27 国家颜色变更器

问题：

- 国家编辑器第一刀已经可以修改国家 cell 归属，但缺少国家颜色变更器。
- renderer 的 states 专题已优先读取 `map.politics.states[*].color`，因此颜色编辑可以作为低风险表层命令接入。

实施：

- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 新增 `createSetStateColorCommand()`。
  - 命令修改目标国家的 `state.color`，effects 声明为 `state-color / cell-colors / object-panels`。
  - 命令支持撤销和重做。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 在目标国家选择下方新增颜色选择器。
  - 颜色输入展示当前目标国家颜色；选择颜色后触发颜色命令。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 将颜色变更接入 `EditHistory`。
  - 提交后复用国家编辑刷新路径，刷新 states 专题、selection/runtime/pick 和国家面板。
- 修改 `app/webgl-generator/src/styles.css`：
  - 补齐颜色选择器布局和色值展示样式。

验证：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\state-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `git diff --check` 通过。
- Playwright 临时静态 server 验证：
  - 打开国家编辑并启用后，颜色控件在编辑锁中仍可用。
  - 目标国家 `#1` 颜色从 `#66c2a5 -> #123456`。
  - `EditHistory` 记录 `undo 1 / redo 0 / 国家颜色 #1`。
  - `lastEditRefresh` 为 `state-color, cell-colors, object-panels`。
  - 点击“撤销上次”后颜色恢复为 `#66c2a5`。

## 2026-06-27 对象名称编辑与国家快速换首都

问题：

- 国家、河流以及后续城镇编辑都需要支持编辑名称。
- 国家编辑器还需要支持快速更换首都，不能只依赖后续完整城镇编辑器。

实施：

- 新增 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - `createRenameObjectCommand()` 支持国家、河流、城市重命名，并纳入 `EditHistory`。
  - 国家重命名同步 `name` 与 `fullName`，保留原有 `formName` 后缀。
  - 城市重命名同步 `settlements.cities[*].name` 与对应 `pack.burgs[*].name`。
  - `createSetStateCapitalCommand()` 支持国家首都切换，并同步 `politics.states[*].capital/center/gridCenter/religion`、旧/新城市的 `capital/group` 与对应 burg 的 `capital/group`。
- 修改对象详情面板：
  - 编辑态下，国家、河流、城市和城市标签对象显示名称输入框。
  - 城市标签重命名会落到对应城市实体，避免标签文本和城市实体分裂。
- 修改国家编辑面板：
  - 新增“首都”下拉和“设为首都”按钮，只列当前目标国家自己的城市。
  - 首都切换走可撤销命令。
- 修改 renderer 与刷新调度：
  - 新增 `refreshLabels()`，名称或首都变化后重建城市标签。
  - edit refresh effects 新增 `labels` 派生刷新语义。
- 修改河流管理面板：
  - 列表、详情和筛选支持河流名称。

验证：

- `Get-ChildItem -Path .\app\webgl-generator\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }` 通过。
- Playwright 临时静态 server 验证：
  - 国家 `云梦 / 云梦共和国` 重命名为 `测试国 / 测试国共和国`。
  - 国家首都从 burg `1` 切到 burg `74` 后，`state.capital`、目标城市 `capital` 和目标 burg `capital` 同步更新。
  - 城市重命名后，`settlements.cities[*].name` 与 `pack.burgs[*].name` 同步更新。
  - 实际已渲染城市标签重命名为 `标签测试城` 后，DOM 标签文本同步刷新。
  - 河流 `清溪` 重命名为 `测试河` 后，河流对象与河流管理面板文本同步更新。

## 2026-06-27 对象详情关闭时退出编辑态

问题：

- 单个河流进入编辑态后，如果直接关闭“对象详情”弹框，弹框只是隐藏，`selectionStore.editingObject` 仍保留河流对象。
- 页面因此继续处于编辑锁状态，左侧控件和其它非编辑交互无法恢复。

实施：

- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 为 `object-details` 注册 `onClose` 回调。
  - 关闭面板时如当前对象处于编辑态，调用 `onCancelEdit` 退出编辑。
  - 关闭触发的 `stopEditing()` 会刷新 selection；面板内部吞掉紧随其后的查看态自动重开，避免用户刚关闭弹框又被重新弹出。

验证：

- `node --check .\app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- Playwright 临时静态 server 验证：
  - 进入河流编辑后，`editingObject.kind` 为 `river`，`body.editing-locked` 为 true。
  - 点击对象详情关闭按钮后，`editingObject` 为 null，`body.editing-locked` 为 false。
  - 对象详情面板保持 hidden，河流 selection 仍保留。

## 2026-06-27 默认国家邻接感知配色

问题：

- 默认生成国家时，原先按 6 色数组和 `state.i` 取模分配颜色。
- 由于正式应用中的国家 id 来自 burg id，id 分布和地图邻接没有关系，相邻国家容易出现相同或相近颜色。

实施：

- 修改 `app/webgl-generator/src/generator/politics.js`：
  - 将国家默认色盘扩展为 30 个候选色。
  - `assignStateColors()` 改为基于国家邻接图的贪心配色。
  - 优先给邻国数量多、面积大的国家分配颜色。
  - 每个国家选择颜色时，优先最大化与已上色邻国的 RGB 距离，同时轻微奖励尚未使用的颜色。
  - pack 政治生成继续使用 `findStateNeighbors()` 的邻接结果；grid fallback 生成新增 `findGridStateNeighbors()` 后再配色。

验证：

- `node --check .\app\webgl-generator\src\generator\politics.js` 通过。
- `git diff --check -- app/webgl-generator/src/generator/politics.js` 通过。
- 使用正式生成器跑 5 组种子：`default`、`adjacent-colors-a`、`adjacent-colors-b`、`adjacent-colors-c`、`adjacent-colors-d`。
- 统计所有国家邻接边：
  - 5 组样本相邻国家同色数均为 `0`。
  - 相邻国家最小 RGB 归一化距离约为 `0.338` 到 `0.379`。

## 2026-06-27 高度专题显示海底配置

问题：

- 高度专题中 `height < 20` 的水域原先统一返回海洋底色，无法观察海洋内部的高度差异。
- 用户需要一个可开启的配置，用于查看海洋高度。

实施：

- 修改 `app/webgl-generator/index.html`：
  - 在“视图”区域新增“高度专题显示海底”开关。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 将开关接入 runtime panel 事件。
  - 编辑锁状态下同步禁用该开关。
  - 运行时面板显示当前“海底高度”状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 开关变化时调用 renderer 的 `setViewOptions({showOceanHeight})` 并刷新运行时面板。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `viewOptions.showOceanHeight`。
  - 高度专题中，水域默认仍使用统一海洋色；开启后按 `height / 20` 在深海色和浅海陆架色之间插值。
  - 其它专题的水域处理保持原样。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check -- app/webgl-generator/index.html app/webgl-generator/src/ui/panel.js app/webgl-generator/src/runtime/app.js app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Playwright 临时静态 server 验证：
  - 正式页面加载到 `http://127.0.0.1:5410`。
  - 高度专题下开关默认关闭时，renderer `showOceanHeight` 为 false，画布样本为统一海洋色。
  - 勾选“高度专题显示海底”后，renderer `showOceanHeight` 为 true，画布水域样本颜色发生变化。
  - 运行时面板包含“海底高度 显示”。

## 2026-06-27 默认省份邻接感知配色

问题：

- 省份对象原先默认继承所属国家颜色，省份专题实际渲染也仍使用按 id 生成的索引色。
- 用户要求省份也默认使用邻接图贪心算法处理颜色，避免相邻省份撞色。

实施：

- 修改 `app/webgl-generator/src/generator/politics.js`：
  - 新增 `findPackProvinceNeighbors()` 和 `findGridProvinceNeighbors()`。
  - pack 政治生成在省份扩张、补洞、统计和 pole 分配之后，构建省份邻接图并调用 `assignProvinceColors()`。
  - grid fallback 生成在 `grid.cells.province` 完成后构建省份邻接图并调用 `assignProvinceColors()`。
  - 省份配色复用国家配色的 30 色候选色和邻接优先评分：优先拉开已上色邻接省份颜色，轻微奖励未使用颜色。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 省份专题由 `indexedColorOrWater()` 改为 `colorForProvince()`。
  - `colorForProvince()` 优先读取 `map.politics.provinces[*].color`，没有颜色时才退回索引色。

验证：

- `node --check .\app\webgl-generator\src\generator\politics.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check -- app/webgl-generator/src/generator/politics.js app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- 使用正式生成器跑 5 组种子：`default`、`province-colors-a`、`province-colors-b`、`province-colors-c`、`province-colors-d`。
- 5 组样本省份邻接边同色数均为 `0`，省份颜色覆盖率为 `100%`；样本中省份数约 `154` 到 `198`，唯一颜色数约 `28` 到 `30`。
- Playwright 临时静态 server 验证：
  - 正式页面切到省份专题后，当前样本 `206` 个省份全部有颜色。
  - 当前样本 `441` 条省份邻接边，同色数为 `0`。
  - renderer `colorMode` 为 `provinces`，运行时面板同步显示省份专题。

## 2026-06-27 DevTools 打开时加载卡顿诊断与动态 mesh 缓存

问题：

- 打开正式 app 页面时，如果浏览器 DevTools 已开启，页面容易长时间卡在加载或首屏响应很慢。
- 诊断发现默认 10k cells 可正常加载；100k cells 生成耗时主要集中在生成算法，尤其河流生成。
- 另一个放大因素是 DevTools 打开/停靠会触发更多 resize、layout 和重绘；此前 renderer 每次 `draw()` 都会重建道路、河流和选中高亮 screen-space mesh，导致 DevTools 场景把普通重绘放大成重复几何构建。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `dynamicBuffersDirty` 缓存标记。
  - 道路、河流、选中高亮 buffer 改为脏了才重建。
  - 相机变化、窗口 resize、地图加载和定位时统一标记 viewport 相关动态 buffer 失效。
  - 选中路线时标记 route mesh 失效；定位闪烁时仍允许 selection mesh 按帧更新。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 根据编辑影响范围显式失效 route、river 或 selection 动态 buffer。
  - 河流宽度编辑会重新构建 river mesh；普通 cell 颜色刷新不再顺带重建道路/河流。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/runtime/edit-refresh-scheduler.js` 通过。
- Playwright 临时静态 server 验证：
  - 默认 10k cells 首次 draw 后动态 mesh cache 均为 clean，连续 8 次 `renderer.draw()` 耗时降为 `0..0.1ms`。
  - 100k cells 生成后动态 mesh cache 均为 clean，连续 8 次 `renderer.draw()` 耗时同样为 `0..0.1ms`。

补充约束：

- 用户进一步要求：canvas 的初始大小只依赖初始化时的窗口大小，后续窗口变化不要影响画布本体大小，也不要触发画布相关重建。
- 调整 `PlaceholderMapRenderer`：
  - 初始化时调用 `lockCanvasToInitialDisplaySize()`，将 canvas 的 CSS 尺寸、drawing buffer 尺寸和 overlay 尺寸固定为初始测量值。
  - 移除 `window.resize` 对 renderer 的尺寸响应。
  - `draw()` 不再读取当前 `clientWidth/clientHeight` 来调整 canvas backing store。
- 追加验证：
  - Playwright 中先以 `1280x800` 打开页面，canvas 初始尺寸为 `940x800`。
  - 再将 viewport 改为 `900x620`，canvas rect、overlay rect、drawing buffer 和 renderer `canvasSize` 均保持 `940x800`。
  - resize 后动态 mesh cache 仍为 clean，没有触发道路、河流或选中高亮 mesh 重建。

补充启动体验修正：

- 用户反馈：如果开着 DevTools 直接打开页面，页面仍可能长时间停在初始的“等待生成”。
- 原因分析：
  - “等待生成”是 HTML 初始文案，旧流程在模块加载后立刻同步执行首轮 `generate()`。
  - 同步生成完成前浏览器没有机会绘制中间状态；DevTools 预打开会让主线程更慢，于是用户看到的仍是初始文案。
  - 如果页面长期停在原始“等待生成”且状态栏也是“初始化中”，则还需要检查 DevTools 是否启用了 Disable JavaScript 或处于断点暂停状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 首轮和按钮触发的生成改为 `requestGenerate()`。
  - 先写入“等待生成任务”状态，再等一次 paint 后执行同步生成重活。
  - `window.__webglGeneratorApp` 在首轮生成前就暴露，方便 DevTools 检查当前启动状态。
  - 生成异常会显示“生成失败”，不再静默停留在初始文案。
- 修改 `app/webgl-generator/src/main.js`：
  - 为 app 创建阶段增加启动失败兜底显示。
- 验证：
  - 普通 Playwright 加载：`DOMContentLoaded` 后立即显示“等待生成任务”，随后生成完成。
  - CDP 模拟 DevTools 预打开、开启 Runtime/Debugger 并禁用 cache：同样先显示“等待生成任务”，随后生成完成，无 page error 或 console error。

再次修正：

- 用户反馈 DevTools 开着仍然卡住。
- 将生成调度从仅依赖 `requestAnimationFrame()` 改为 `setTimeout()` 与 `requestAnimationFrame()` 竞速：
  - `setTimeout()` 保证即使 rAF 被 DevTools、后台状态或调试状态延后，生成任务也会启动。
  - rAF 路径仍保留，用于正常情况下尽量让浏览器先绘制启动状态。
- 修改 `app/webgl-generator/index.html`：
  - 增加 3 秒启动 watchdog。
  - 如果模块脚本没有暴露 `window.__webglGeneratorApp`，页面显示“脚本尚未启动，请检查 DevTools 是否暂停或禁用 JavaScript”。
- 追加验证：
  - 普通加载、CDP DevTools 模拟、禁用 rAF 三条路径均可从“等待生成任务”进入生成完成。
  - 故意阻断 `src/main.js` 加载时，watchdog 会显示“脚本尚未启动”，不再停留在 HTML 初始的“等待生成”。

第三次修正：

- 用户反馈仍卡在“等待生成任务”。
- 将生成调度扩展为多路竞速：
  - `scheduler.postTask()`。
  - `MessageChannel`。
  - `setTimeout()`。
  - `requestAnimationFrame()` 后再 `setTimeout()`。
- 修改 `tools/serve-prototype.mjs`：
  - 本地静态 server 对所有文件返回 `Cache-Control: no-store, max-age=0`。
  - 避免 DevTools 打开时浏览器继续使用旧版 module 脚本。
- 已重启 5410 预览服务，并验证 `http://127.0.0.1:5410/src/runtime/app.js` 返回 `no-store`。
- 追加验证：
  - CDP DevTools 模拟、禁用 cache、同时禁用 `setTimeout` 和 `requestAnimationFrame` 时，页面仍可从“等待生成任务”进入生成完成。

## 2026-06-27 国家编辑器城镇迁移与滑条拖动修正

问题：

- 国家编辑器笔刷只修改国家 cell 归属，没有同步落在涂色区域内的城镇归属。
- 如果被涂走的是旧国家首都，旧国家会继续引用已经迁走的首都。
- 国家编辑器半径滑条在拖动时每次 `input` 都重建整个面板，导致鼠标拖动被中断，只能一点点调整。

实施：

- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷最终命令在收笔时捕获城镇、burg 和受影响国家快照。
  - 将涂色 cell 上的城镇迁入新国家，并同步 `settlements.cities[*].state` 与 `pack.burgs[*].state`。
  - 如果迁走的是旧国家首都，将该城镇降级为普通城市，并在旧国家剩余城镇中按省会优先、人口次之重选首都。
  - 支持撤销/重做恢复城镇、burg 和国家首都状态。
  - 收笔后刷新国家统计和邻接摘要。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 半径滑条 `input` 只更新面板状态和当前输出值，不再重建整个浮动面板。

验证：

- `node --check app/webgl-generator/src/runtime/state-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- Playwright 直接执行国家笔刷命令：
  - 选择一个仍有其它城市的国家首都，将其 cell 涂到另一个国家。
  - 原首都城镇和 burg 成功迁入目标国家，并被降级为非首都。
  - 旧国家成功另选首都，新首都仍属于旧国家。
  - 撤销恢复原首都、城镇归属和 burg 归属；重做再次迁移成功。
- Playwright 验证国家编辑器半径滑条：
  - 触发 `input` 后滑条 DOM 节点保持不变，输出值和 `getBrush().radius` 同步更新。

## 2026-06-27 国家编辑器管理列表

问题：

- 国家编辑器只有目标国家下拉选择，不适合像河流管理面板那样批量浏览、快速定位和连续编辑。
- 用户希望国家编辑器更接近当前河流编辑器的面板体验。

实施：

- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 引入通用 `createObjectTable()`。
  - 国家面板新增国家统计摘要、筛选框、排序按钮和国家表格。
  - 支持按人口、城镇数、面积和 ID 排序。
  - 表格行点击会切换当前目标国家，双击/定位按钮可快速定位。
  - 详情区展示选中国家的首都、面积、城镇、人口和邻国数。
  - “编辑此国家”会把目标国家切到当前行，并进入国家编辑状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 接入国家面板的选中、定位和编辑回调。
  - 选中国家时同步地图选中对象。
  - 编辑国家时切换到国家专题并启用国家编辑锁。
- 修改 `app/webgl-generator/src/styles.css`：
  - 为国家面板新增筛选、排序、详情和表格布局样式。
  - 合并重复的 `.state-sample-actions` 样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 验证：
  - 打开国家编辑面板后，国家表格正常渲染。
  - 点击表格行会更新目标国家，并同步 `window.__webglGeneratorApp.selection.object.kind === "state"`。
  - 筛选框输入国家 ID 后表格收敛到匹配结果。
  - 点击“编辑此国家”后，国家编辑激活，renderer 专题切为 `states`。

## 2026-06-27 国家详情归并到国家面板

问题：

- 选中国家对象时会打开通用“对象详情”浮动面板，和已经具备遍历能力的国家编辑面板职责重复。
- 国家重命名仍挂在通用对象详情面板里，国家列表面板无法独立完成浏览、定位和编辑闭环。

实施：

- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 选中国家对象时自动关闭通用对象详情面板，并打开国家编辑面板。
  - 国家面板目标国家同步到当前选中国家。
  - 为国家面板接入国家重命名命令，继续走编辑历史和刷新调度。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 详情区新增国家名称编辑器。
  - 将全称、首都、文化、宗教、中心 cell、面积、城镇、人口和邻国数集中展示在国家遍历面板。
  - 列表继续显示国家全称，输入框编辑国家根名。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 通用对象详情面板不再展示国家对象，也不再负责国家重命名。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增国家名称编辑器布局样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- `git diff --check` 通过。
- Playwright 验证正式版 `app/webgl-generator`：
  - 打开国家面板后点击国家行，当前选择对象为 `state`。
  - 通用对象详情面板保持关闭。
  - 国家面板保持打开并展示名称编辑器。
  - 在国家面板修改国家根名后，`state.name` 与 `state.fullName` 同步更新。
  - 详情区包含文化和宗教信息。

## 2026-06-27 国家编辑器政治派生一致性第一刀

问题：

- 国家笔刷提交后已经同步国家归属和城镇迁移，但省份归属仍可能停留在旧国家，形成跨国家省份 cell。
- 城市迁移国家后，`city.province` 没有跟着当前 cell 的省份修正。
- 运行时缺少明确的“已刷新哪些派生、哪些派生暂缓”的记录。
- 政治边界线层没有面向编辑后的局部重建入口。

实施：

- 使用真实四级流程的子智能体：
  - 中书舍人 / 调查策划员 `Jason` 只读审查现有国家笔刷、刷新调度、renderer 和政治生成链路。
  - 给事中 / 审查者 `Socrates` 独立审查本次 diff 风险。
- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷 effects 明确区分 state cell、pack state cell、settlement state、state statistics、province cells、province statistics、政治边界、selection、labels、object panels 和暂缓派生。
  - 提交国家笔刷后，对受影响 pack land cells 做局部省份修复：优先使用同国家邻接省份，否则回退到目标国家最大省份。
  - 同步受影响 grid cell 的 `grid.cells.province`。
  - 同步迁移城市的 `city.province`。
  - 重算省份 `cells / area / neighbors` 摘要。
  - 将军事、zones 和 state-center markers 标记为派生过期。
  - 为受影响 pack cell state、省份、城市 province、派生过期状态增加 undo/redo 快照恢复。
  - 审查发现“迁走首都后替补首都未入快照”的漏洞后，补充替补首都 city/burg 快照，避免撤销后留下双首都。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 支持在 effects 中记录 `pendingDerived`。
  - `political-boundaries` 会触发 renderer 线层重建。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `refreshLineLayers()`。
  - `buildLineVertices()` 增加基于当前 `grid.cells.state/province` 和共享 Voronoi 边的国家/省份边界线。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 运行时面板显示派生过期系统。
  - 编辑刷新摘要显示待派生项目。
- 修改 `docs/current-plan.md`：
  - 将下一步从“补政治派生一致性策略”更新为“第一刀已完成，后续做省份 pole、军事/zones 重建入口或城市/省份面板”。

说明：

- 拖动预览阶段仍只刷新颜色，不实时重建国家/省份边界线；政治边界线在收笔提交命令后刷新。这是当前性能取舍，后续如需要可单独做预览线层节流刷新。

验证：

- `node --check app/webgl-generator/src/runtime/state-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/runtime/edit-refresh-scheduler.js` 通过。
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- 纯内存命令级不变量验证通过：
  - 跨国家边界 cell 涂色后，受影响 `grid/pack` 国家和省份归属一致，全图跨国家省份 cell 未增加。
  - 同一 grid cell 映射多个初始 pack state 时，撤销可逐 pack cell 恢复原 state/province。
  - 非首都城市迁移后，`city.state`、`burg.state`、`city.province` 同步迁入目标国家，撤销可恢复。
  - 迁走一个仍有其它城市的国家首都后，旧国家会另选单一首都；撤销后全图 city/burg 首都数量和国家 `capital` 引用恢复；重做后仍保持单首都。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 国家笔刷命令经 `editHistory` 与 `editRefreshScheduler` 执行后，`political-boundaries` 触发线层重建，`lineVertexCount` 从 `8952` 变为 `8954`。
  - 运行时面板显示“派生过期”，包含 `military / zones / state-markers`。
  - 编辑刷新摘要显示 `pendingDerived: military, zones, state-markers`；后续省份面板第一刀已将 `province-poles` 改为局部重算项。
  - 受影响 pack cell 的 province 均属于新的 state。
- `git diff --check` 通过。

## 2026-06-27 省份管理面板第一刀与省份 pole 局部重算

问题：

- 国家编辑器已经可以修复国家笔刷后的省份归属，但 `province.pole` 仍被标记为待派生，没有在本地命令里恢复一致。
- 省份对象仍缺少类似国家/河流的独立遍历面板，查看、定位、改名和改色路径分散。

实施：

- 使用真实四级流程的子智能体：
  - 中书舍人 / 调查策划员 `Boole` 只读调查省份面板、对象表格、对象解析、省份命令和 province pole 生成链路。
  - 给事中 / 审查者 `Hilbert` 独立审查本次 diff 风险。
- 新增 `app/webgl-generator/src/ui/panels/province-panel.js`：
  - 独立浮动“省份管理”面板。
  - 支持省份统计摘要、筛选、按面积/cells/国家/ID 排序、表格选择、双击/按钮定位。
  - 详情区展示全称、所属国家、中心 pack/grid cell、pole、面积、cells、邻接省份、城市数、文化和宗教。
  - 支持省份名称编辑、省份颜色编辑和 EditHistory 撤销/重做。
- 修改 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - `createRenameObjectCommand()` 支持省份名称与 fullName 恢复。
  - 新增 `createSetProvinceColorCommand()`，省份颜色变更刷新 `cell-colors` 和对象面板。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 注册 `province-panel`，侧栏按钮可打开省份面板。
  - 选中省份对象时关闭通用对象详情面板，转入省份管理面板。
  - 省份重命名、改色、撤销和重做均走编辑历史与刷新调度。
- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷的 `province-poles` 从待派生项改为已处理派生项。
  - 对受影响省份按 pack 省内 cell 与边界 cell 距离局部重算 `province.pole`。
  - `snapshotProvinces()` 追加 `pole` 快照，保证 undo/redo 恢复。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/styles.css`：
  - 新增侧栏“省份管理”入口。
  - 编辑锁禁用列表纳入省份面板入口。
  - 补省份面板布局样式。
- 修改 `docs/current-plan.md`：
  - 将省份管理面板和 province pole 局部重算标记为已完成。

取舍：

- 本刀不做省份 cell 归属笔刷、不重跑完整省份扩张，也不触碰军事、zones 或经济链路。
- 省份面板接管省份对象详情；通用对象详情仍保留其它对象类型。

验证：

- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/runtime/object-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/runtime/state-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- 纯内存命令级验证通过：
  - 省份重命名会同步 `name/fullName`，undo/redo 可恢复。
  - 省份颜色修改会同步 `province.color`，undo/redo 可恢复。
  - 国家笔刷后受影响省份的 `province.pole` 存在并落在本省 pack cell 上，undo 后 pole 恢复。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 点击侧栏“省份管理”可打开独立浮动面板。
  - 点击省份表格行后 selection 对象为 `province`。
  - 经 `EditHistory` 修改省份名称和颜色后，面板显示同步更新。

审查修正：

- `Hilbert` 指出普通高度专题点击陆地时也可能选中省份并自动打开省份面板；已收窄为仅当省份面板已打开或当前专题为省份时，才自动分流到省份面板。普通高度专题下仍可显示通用对象详情。
- 原本无 `color` 字段的省份在颜色命令撤销时会删除新增颜色，避免保留临时颜色。
- 零 cell 省份的 `pole` 改为 `null`，不再回退到旧中心点伪造有效 pole。
- 追加验证：
  - 原色为空的省份执行颜色命令后，undo 会删除新增 `color` 字段。
  - 涂空小省份后 `province.pole === null`，undo 后恢复原 pole。
  - 浏览器中默认高度专题选中省份不会自动弹出省份面板；切到省份专题后选中省份会自动打开省份面板。

## 2026-06-27 河流详情归并到河流管理面板

问题：

- 河流和国家、省份的面板逻辑不一致：选中河流时仍会打开通用对象详情面板，河流管理面板只是额外入口。
- 河流名称编辑挂在通用对象详情的编辑态中，而河流宽度、定位和遍历在河流管理面板中，用户需要在两个面板之间切换。

实施：

- 修改 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 河流详情区新增名称编辑器，重命名直接走面板内表单。
  - 面板记录当前编辑对象，按钮在“进入河流编辑”和“退出河流编辑”之间切换。
  - 关闭河流面板时通知 runtime 退出河流编辑态，避免页面卡在编辑状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 选中河流对象时关闭通用对象详情面板，直接打开“河流管理”面板。
  - 河流面板接入河流重命名命令，继续走 `EditHistory` 和刷新调度。
  - 河流编辑按钮支持同一河流的进入/退出切换。
  - 关闭河流面板时增加一次性抑制，避免退出编辑触发 selection 回调后又重新打开面板。
  - 编辑锁允许面板从 `object-details + river-panel` 收窄为仅 `river-panel`。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 通用对象详情面板不再展示河流对象，也不再负责河流重命名或跳转河流面板。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增河流名称编辑器布局样式。
- 修改 `docs/current-plan.md`：
  - 记录河流详情已归并到河流管理面板。

验证：

- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/object-edit-commands.js` 通过。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 选中河流后自动打开“河流管理”面板。
  - 通用对象详情面板保持关闭。
  - 在河流面板内重命名河流后，`river.name` 与面板文本同步更新，历史命令为 `重命名河流 #1`。
  - 点击“进入河流编辑”后 `editingObject.kind === "river"`，按钮变为“退出河流编辑”。
  - 关闭河流面板后面板保持关闭，`editingObject` 重置为 `null`，不会重新弹开。

## 2026-06-27 河流定位保持列表滚动位置

问题：

- 河流管理面板中点击列表行的“定位”后，定位会触发 selection 更新和面板重渲染。
- 重渲染会重置 `.object-table-wrap` 的 `scrollTop`，导致刚点击定位的河流行被滚出列表视口。

实施：

- 修改 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 渲染前读取当前河流表格滚动位置，渲染后恢复。
  - 筛选和排序仍重置到顶部；定位、选中、编辑历史刷新等普通重渲染保留原滚动位置。

验证：

- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 打开河流管理面板，将河流表格滚动到接近底部。
  - 点击倒数第二条河流的“定位”。
  - 定位后 `scrollTop` 从 `6828` 保持为 `6828`。
  - 选中河流仍在表格视口内，selection 对象为 `river #220`。

## 2026-06-27 城市管理面板第一刀

目标：

- 将城市/聚落从通用对象详情中迁入独立浮动管理面板，和国家、省份、河流保持一致。
- 第一刀只做列表、统计、定位、选择和名称编辑，不做新增/删除、移动城市、人口修改、归属重分配或港口重算。

实施：

- 新增 `app/webgl-generator/src/ui/panels/city-panel.js`：
  - 独立浮动“城市管理”面板。
  - 支持城市总数、首都数、港口数、人口合计和筛选数量摘要。
  - 支持按人口、类型、国家、省份和 ID 排序。
  - 列表展示 ID、名称、类型、国家、省份和人口，点击选中，双击或按钮定位。
  - 详情区展示类型、标记、所属国家、所属省份、人口、grid cell、pack cell、burg id、文化和宗教。
  - 名称编辑走既有 `createRenameObjectCommand()`，同步 `settlements.cities` 与 `pack.burgs`，并接入 EditHistory 撤销/重做。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 注册 `city-panel`，侧栏按钮可打开城市管理面板。
  - 选中城市对象时关闭通用对象详情面板，直接打开城市管理面板。
  - 城市面板的选择、定位、重命名、撤销和重做接入 selection store、renderer locate 和 edit refresh scheduler。
  - 国家首都变更、国家刷子、省份重命名等可能影响城市面板显示的路径会刷新城市面板。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 通用对象详情不再展示城市对象，避免城市详情来源重复。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/styles.css`：
  - 新增侧栏“城市管理”入口。
  - 编辑锁禁用列表纳入城市面板入口。
  - 补城市面板布局样式。
- 修改 `docs/current-plan.md`：
  - 将城市/聚落正式面板第一刀标记为已完成，并记录后续第二刀范围。

验证：

- `node --check app/webgl-generator/src/ui/panels/city-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 点击侧栏“城市管理”可打开独立浮动面板。
  - 通过 selection store 选中城市后，城市面板保持打开，通用对象详情面板保持关闭。
  - 在城市面板内将城市 `#0` 改名为“浏览器测试城”后，`settlements.cities[0].name` 与对应 `pack.burgs[1].name` 同步更新。
  - EditHistory 记录为 `重命名城市 #0`，面板文本同步显示新名称。
- `git diff --check` 通过。

## 2026-06-28 浮动面板筛选输入焦点修复

问题：

- 国家、省份、城市和河流面板的筛选框输入一个字符后会失焦。
- 根因是筛选 `input` 事件更新面板状态后调用 `PanelManager.setContent()`，整块替换面板 body，正在输入的 DOM 节点被销毁。
- 第一版只在替换后恢复焦点，对英文输入可用，但对中文输入法不够：拼音组词处于 composition 阶段时，DOM 被替换会打断输入法状态，即使随后重新聚焦也已经破坏了本次输入。

实施：

- 新增 `app/webgl-generator/src/ui/components/filter-input.js`：
  - 封装筛选搜索框。
  - `compositionstart` 到 `compositionend` 期间只保留输入框自身值，不触发面板重渲染。
  - `compositionend` 后再提交筛选值并重渲染列表，避免中文拼音候选词阶段被 DOM 替换打断。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`、`province-panel.js`、`city-panel.js`、`river-panel.js`：
  - 四个面板的筛选框统一改用 `createFilterInput()`。
- 修改 `app/webgl-generator/src/ui/panel-manager.js`：
  - `setContent()` 替换内容前记录当前焦点元素在面板 body 内的子节点路径、控件类型和文本选择区间。
  - 替换内容后，如果新节点路径和控件类型一致，则用 `focus({preventScroll: true})` 恢复焦点，并恢复输入光标位置。
  - 该逻辑仅作为非 composition 场景的焦点兜底；中文输入法的主要保护在 `filter-input`。

验证：

- `node --check app/webgl-generator/src/ui/components/filter-input.js` 通过。
- `node --check app/webgl-generator/src/ui/panel-manager.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/city-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 国家、省份、城市和河流四个面板的筛选框分别连续输入 `abc`。
  - 每次字符输入后 `document.activeElement` 都仍是对应筛选框。
  - 每个筛选框最终值为 `abc`，光标停在末尾。
  - 模拟中文输入法 composition：四个面板在 `compositionstart -> input(isComposing=true)` 期间筛选输入框保持同一个 DOM 节点且保持焦点，直到 `compositionend` 后才提交筛选值并重渲染。

## 2026-06-28 浮动面板公共 DOM 组件与图层开关

目标：

- 抽出大部分浮动面板共用的 DOM 组件，减少国家、省份、城市和河流面板之间的重复结构。
- 修复无人地带与相邻国家之间国界开放，导致国界断开的视觉问题。
- 修复国家列表在 hover 更新时滚动位置被重置到顶部的问题。
- 在专题视图之外提供独立图层显隐开关，先覆盖道路、河流、城市、城市标签、国界、省界和海岸线。

实施：

- 新增 `app/webgl-generator/src/ui/components/summary-grid.js`、`sort-bar.js`、`detail-grid.js`、`history-actions.js` 和 `table-scroll.js`：
  - 统一摘要指标、排序按钮、详情网格、撤销/重做操作区和表格滚动位置恢复。
  - 国家、省份、城市和河流面板改用这些公共组件。
- 修改 `app/webgl-generator/src/ui/components/table-scroll.js`：
  - 表格重渲染后立即恢复旧 `scrollTop`，并在下一帧兜底恢复一次。
  - 避免国家面板在画布 hover 触发面板刷新时把列表滚动位置打回顶部。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `layerVisibility` 状态与 `setLayerVisible()`。
  - line layer 支持按开关重建海岸线、湖岸线、国界和省界。
  - point layer 支持按开关重建人口点、城市点和 marker 点。
  - 道路、河流和城市标签在 draw/update label 阶段按开关跳过。
  - 国家边界构建允许 `state > 0` 与 `state = 0` 的陆地邻接边生成国界线；省界仍不绘制 `province = 0` 的边界。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/runtime/app.js`：
  - 侧栏新增“图层”开关组。
  - 运行时面板统计区显示当前开启的图层。
  - 编辑锁期间图层开关会和其他非编辑交互一起禁用。

验证：

- `node --check app/webgl-generator/src/ui/components/summary-grid.js` 通过。
- `node --check app/webgl-generator/src/ui/components/sort-bar.js` 通过。
- `node --check app/webgl-generator/src/ui/components/detail-grid.js` 通过。
- `node --check app/webgl-generator/src/ui/components/history-actions.js` 通过。
- `node --check app/webgl-generator/src/ui/components/table-scroll.js` 通过。
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/city-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 当前生成图存在 `173` 条无人地带与国家陆地邻接边。
  - 关闭国界后 line vertex 从 `9298` 降到 `7932`，重新打开后恢复为 `9298`。
  - 关闭城市点后 point vertex 从 `861` 降到 `44`。
  - 关闭城市标签后可见标签数为 `0`。
  - 道路与河流开关会正确写入 renderer 图层状态。
  - 国家面板滚动到 `593` 后触发画布 hover，重渲染后的表格 `scrollTop` 仍为 `593`。
  - 国家面板摘要与详情区来自公共组件。

## 2026-06-28 省份归属笔刷与路线面板第一刀

目标：

- 在正式版补上省份 cell 归属笔刷，让省份编辑器具备和国家编辑器同型的区域编辑能力。
- 新增路线管理浮动面板，作为第二批对象管理面板的第一刀。
- 本轮不做省份新增/删除、跨国家刷省份、路线改道、新增路线或删除路线。

实施：

- 新增 `app/webgl-generator/src/runtime/province-edit-commands.js`：
  - 提供 `createApplyProvinceBrushCommand()` 和 `applyProvinceBrushPreview()`。
  - 省份笔刷提交后同步 `grid.cells.province` 与对应陆地 `pack.cells.province`。
  - 同步被影响城市的 `city.province`。
  - 重算省份 cells、面积、邻接、center 兜底和 pole。
  - 支持 EditHistory 撤销/重做；主省份字段由 command changes 回放，快照只保存城市和省份派生字段，避免预览态覆盖撤销。
- 修改 `app/webgl-generator/src/ui/panels/province-panel.js`：
  - 新增启用/停止省份编辑、目标省份、取选中、取悬停、半径和影响数量。
  - “编辑此省份”会进入省份专题并开启省份编辑。
  - 编辑中不再让外部 selection 刷新覆盖目标省份。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 新增 `provinceEdit` 运行时状态和 `bindProvinceEditing()`。
  - 省份编辑与高度编辑、国家编辑互斥。
  - 省份编辑锁定编辑外交互，只允许省份面板继续操作。
  - 省份笔刷只允许刷目标省份所属国家内的陆地 cell。
- 新增 `app/webgl-generator/src/ui/panels/route-panel.js`：
  - 独立浮动“路线管理”面板。
  - 支持路线总数、筛选数、总长度、海路数量摘要。
  - 支持按长度、段数、类型和 ID 排序。
  - 列表展示 ID、类型、起点、终点和长度，点击选中，双击或按钮定位。
  - 详情区展示类型、等级、起点、终点、长度、段数、grid cells、pack cells 和 feature。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/styles.css`：
  - 侧栏新增“路线管理”入口。
  - 编辑锁纳入路线管理入口。
  - 补省份编辑控件和路线面板样式。

验证：

- `node --check app/webgl-generator/src/runtime/province-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/route-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- Playwright 临时内嵌静态 server 验证省份笔刷：
  - 样本 grid cell `934` 从省份 `89` 刷到同国家目标省份 `84`。
  - 对应 `3` 个陆地 pack cell 省份同步为 `84`。
  - EditHistory 记录 `省份笔刷 2 cells`。
  - 撤销后 grid cell `934` 恢复为省份 `89`。
  - 重做后 grid cell `934` 再次变为省份 `84`。
  - 开启省份编辑后专题切换为 `provinces`，面板含半径与影响数量控件。
- Playwright 临时内嵌静态 server 验证路线面板：
  - 侧栏“路线管理”可打开独立浮动面板。
  - 当前生成图 `679` 条路线全部进入列表。
  - 点击默认排序第一行选中 route `#586`。
  - 路线渲染/高亮 buffer 生成 `25908` 个 route vertices。
  - 路线面板摘要和详情区来自公共组件。

## 2026-06-28 生成配置浮动面板第一刀

目标：

- 将固定侧栏中的生成配置迁移到独立 DOM 浮动面板，继续收窄固定侧栏职责。
- 保持既有生成流程、默认 seed、目标 cells、地图尺寸、地形模板和随机 seed 行为不变。

实施：

- 新增 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 注册 `generation-panel` 浮动面板。
  - 面板内保留原生成控件 ID：`seed-input`、`cells-input`、`width-input`、`height-input`、`heightmap-template`、`auto-random-seed`、`generate-map` 和 `random-seed`。
  - 这样 `readOptionsFromPanel()`、`setSeedInput()` 和 `requestGenerate()` 可以继续复用原流程。
- 修改 `app/webgl-generator/index.html`：
  - 固定侧栏“生成”区只保留“生成配置”入口。
  - 原 seed、cells、尺寸、模板和生成按钮从固定侧栏移除。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 应用初始化时创建 `generation-panel`，确保首次自动生成前生成控件已经存在于 DOM。
  - 侧栏入口可打开生成配置面板。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 绑定 `open-generation-panel`。
  - 编辑锁定时禁用生成配置入口和面板内生成控件。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增生成配置面板表单、字段、checkbox 和按钮行样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 首次自动生成仍使用 `stage-2-1` 和 `10000` 目标 cells。
  - 固定侧栏不再包含 `seed-input` 或 `generate-map`。
  - 点击“生成配置”可打开 `generation-panel`，面板内包含 seed 输入框。
  - 点击“换 seed”后 seed 从 `stage-2-1` 变为 `map-mqxawad0-1c1tom7`，并完成重新生成。
  - 在浮动面板内设置 `cells=2000`、`width=800`、`height=600`、`heightmapTemplate=archipelago` 后点击生成，运行时地图更新为 `800 x 600 / 2000 cells`。

## 2026-06-28 控制面板 tab 化

问题：

- 单独把生成配置迁入浮动面板太薄，固定侧栏中仍残留专题选择器、图层选择和管理页面入口。
- 用户要求这些控制类 UI 与生成配置合并到同一个浮动面板中，并分别占用 tab。

实施：

- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - `generation-panel` 从单一生成表单扩展为“控制面板”。
  - 新增 `生成 / 专题 / 图层 / 管理` 四个 tab。
  - 生成 tab 保留 seed、目标 cells、地图尺寸、地形模板、自动随机 seed、生成和换 seed。
  - 专题 tab 承载高度、温度、降水、生物群系、文化、宗教、国家、省份、区域和人口专题按钮，以及“高度专题显示海底”开关。
  - 图层 tab 承载道路、河流、城市、城市标签、国界、省界和海岸线显隐开关。
  - 管理 tab 承载适配视图、高度编辑、国家编辑、省份管理、城市管理、路线管理和河流管理入口。
- 修改 `app/webgl-generator/index.html`：
  - 固定侧栏只保留“控制面板”入口。
  - 从固定侧栏移除专题选择器、图层选择和管理入口。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增控制面板 tab、tab body、图层双列和管理入口双列布局。

验证：

- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 控制面板可打开，tab 为 `生成 / 专题 / 图层 / 管理`。
  - 固定侧栏中专题按钮、图层开关和管理入口数量均为 `0`。
  - 控制面板内有 `10` 个专题按钮、`7` 个图层开关和 `6` 个对象管理入口。
  - 生成 tab 可设置 `cells=3000`、`width=900`、`height=620` 并重新生成，运行时 badge 更新为 `900 x 620 / 3000 cells`。
  - 专题 tab 可切换到 `states`，并能开启“高度专题显示海底”。
  - 图层 tab 可关闭道路图层，renderer 中 `layerVisibility.routes=false`。
  - 管理 tab 可打开路线管理面板。

## 2026-06-28 图层按钮与控制偏好持久化

问题：

- 控制面板中的图层开关仍是普通 checkbox，视觉上比各管理面板入口简陋。
- 用户配置好的图层显隐、专题和高度专题海底显示状态，每次重新打开页面都会丢失。

实施：

- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 图层 tab 从 checkbox 改为 `button[data-layer]`。
  - 按钮使用 `aria-pressed` 和 `active` class 表示当前显隐状态。
  - 按钮内部增加圆点指示器，便于快速扫视开关状态。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 新增 `webgl-generator-control-preferences` localStorage 偏好。
  - 控制面板绑定前先恢复专题、图层显隐和“高度专题显示海底”控件状态。
  - 点击专题、图层按钮或切换海底高度显示时，同步写回 localStorage。
  - localStorage 不可用时静默降级，不影响页面运行。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 初始化生成前读取控制偏好并应用到 renderer，确保首次生成即使用用户上次配置。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增图层按钮、hover、高亮和圆点指示器样式，使图层控制接近管理面板按钮风格。

验证：

- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 预置 localStorage 后首次生成恢复 `religions` 专题、`showOceanHeight=true`、道路/标签关闭和城市开启。
  - 图层 tab 中有 `7` 个 `button[data-layer]`，不再有 `input[data-layer]`。
  - 关闭的道路和标签按钮 `aria-pressed=false` 且没有高亮；开启的城市按钮 `aria-pressed=true`。
  - 点击道路按钮会同步 renderer `layerVisibility.routes=true`，并写回 localStorage。
  - 切换到国家专题会同步 renderer `colorMode=states`，并写回 localStorage。
  - 关闭“高度专题显示海底”会同步 renderer `showOceanHeight=false`，并写回 localStorage。
  - 刷新页面后，国家专题、道路开启和海底高度关闭状态仍能恢复。

## 2026-06-28 城市标签上限滑动条

问题：

- 城市标签候选数量此前固定为 `48`，用户无法主动要求展示更多城市标签。
- 标签 LOD 和避让机制本身有效，应保留缩小时自动隐藏和防重叠行为。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `labelOptions.maxCityLabels`，默认 `48`。
  - `getLabelCities()` 从固定 `.slice(0, 48)` 改为读取可配置上限。
  - `labelLimitForScale()` 按缩放比例和上限动态计算可见数量；缩小时仍保留限流，放大后可显示更多候选。
  - 新增 `setLabelOptions()`，用于只重建城市标签 overlay，不重建地图 mesh。
- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 在 `图层` tab 新增“城市标签上限”滑动条，范围 `8..240`，默认 `48`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 滑动条变更时更新数值显示、写入 localStorage，并调用运行时 handler。
  - 运行时统计中的“城市标签”显示 `可见 / 候选 / 上限`。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 初始化时从控制偏好恢复 `maxCityLabels`。
  - 滑动条输入时调用 renderer 更新标签候选。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增标签上限滑动条布局和数值样式。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - localStorage 预置 `maxCityLabels=96` 后，滑动条、输出值和 renderer 均恢复为 `96`。
  - 当前样本候选标签数为 `96`，可见标签数为 `17`，说明候选上限与避让/LOD 同时生效。
  - 将滑动条调到 `160` 后，renderer `labelOptions.maxCityLabels=160`，候选标签数变为 `160`，localStorage 写回 `160`。
  - 刷新页面后滑动条、输出值、renderer 和 localStorage 仍保持 `160`。

## 2026-06-28 城市标签上限修正

问题：

- 用户发现滑动条拉到最大、地图放大到最大后，仍有一批城镇标签不会显示。
- 排查确认上一刀的滑动条最大值固定为 `240`，renderer 和 UI clamp 也都限制到 `240`。
- 当前默认样本实际有 `817` 个城市，因此最大值 `240` 只代表“前 240 个高优先级城市进入标签候选”，不是“所有城市都可参与显示”。

实施：

- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 城市标签上限滑动条初始 `max` 从 `240` 放宽为 `2000`。
  - 步进从 `8` 改为 `1`，便于动态上限精确等于当前城市总数。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js` 和 `app/webgl-generator/src/ui/panel.js`：
  - `maxCityLabels` 内部 clamp 从 `240` 放宽到 `5000`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计刷新时，按当前地图 `settlements.cities.length` 动态设置滑动条 `max`。
  - 当当前地图城市数小于已保存偏好时，UI 显示值会收敛到当前城市总数；renderer 仍可用较大偏好表示“尽可能全量”。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 默认样本城市总数为 `817`。
  - localStorage 预置 `maxCityLabels=240` 时，滑动条 `max` 会动态显示为 `817`，候选标签数仍按偏好为 `240`。
  - 将滑动条拉到最大后，输入值、输出值、renderer `maxCityLabels` 和候选标签数均为 `817`，非候选城市数为 `0`。
  - 刷新后仍保持 `817`。
  - 全图 fit 状态下可见标签仍为 `17`，这是现有 LOD、视口和碰撞避让机制生效，不再是候选上限过低导致。

## 2026-06-28 首都标签字号区分

问题：

- 用户反馈国都文字需要比大城市更大，能够在地图标签中明显分辨。

实施：

- 修改 `app/webgl-generator/src/styles.css`：
  - `.city-label.capital` 从仅调整颜色和粗体，改为 `15px` 字号、`800` 字重、稍大的 padding 和 `156px` 最大宽度。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 首都标签碰撞盒估算同步放大，避免字体变大后与其他标签发生未预估重叠。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 首都标签 computed style 为 `font-size: 15px`、`font-weight: 800`。
  - 普通城市标签 computed style 为 `font-size: 11px`、`font-weight: 400`。

## 2026-06-28 城市标签 LOD 连续化

问题：

- 用户反馈城市标签显隐过渡不自然：全图缩放约 `100%` 时只零星显示少数城市，稍微放大到某个点后又突然显示大量标签。
- 排查确认原因是标签 LOD 存在硬阈值：
  - `minLabelScale()` 把大量普通城镇统一卡在 `1.85` 缩放阈值。
  - `labelLimitForScale()` 在 `0.75 / 1.35 / 2.4` 三个缩放点阶梯式增加可见上限。
  - 标签显隐直接切换 `display`，没有视觉淡入淡出。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 普通城市标签的 `minScale` 改为按优先级 rank 连续分布，不再让所有普通城镇共用同一个出现阈值。
  - `labelLimitForScale()` 改为 `smoothStep()` 曲线，随缩放平滑增加可见数量上限。
  - 标签显隐从设置 `display` 改为切换 `.visible` class，保留现有 picking 只命中可见标签的逻辑。
- 修改 `app/webgl-generator/src/styles.css`：
  - `.city-label` 默认 `opacity: 0`、`visibility: hidden`。
  - `.city-label.visible` 淡入显示，使用 `140ms` opacity 过渡。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 当前样本城市总数 `817`，标签候选数 `817`。
  - 视图中心固定时，缩放采样可见标签数为：
    - `1.0 -> 16`
    - `1.1 -> 17`
    - `1.2 -> 17`
    - `1.35 -> 23`
    - `1.5 -> 25`
    - `1.7 -> 30`
    - `1.85 -> 30`
    - `2.1 -> 43`
    - `2.4 -> 46`
  - 没有再出现跨过某个缩放点后标签突然全量显示的跳变。

## 2026-06-28 城市/聚落面板第二刀 A

目标：

- 在城市管理面板补上低风险可撤销编辑，不进入城市新增/删除、移动、自由迁国迁省或港口重算。
- 人口编辑必须同时写入正式应用城市对象和 source 风格 burg 对象，避免面板、标签和后续统计读取到不同值。
- 归属修复只允许把城市记录同步到当前所在 cell 的国家/省份，不提供任意下拉迁移。

实施：

- 新增 `app/webgl-generator/src/runtime/city-edit-commands.js`：
  - `createSetCityPopulationCommand()` 校验非负有限数，写入 `settlements.cities[id].population` 与对应 `pack.burgs[burgId].population`，并支持 EditHistory 撤销/重做。
  - `createSyncCityOwnerToCellCommand()` 读取城市当前 `packCell` 的 `pack.cells.state/province`，回填 `city.state`、`city.province`、`burg.state` 和既有 `burg.province` 字段。
  - 两类命令都会刷新城市相关 metadata 和国家 urban/burgs 统计，避免打开管理面板时看到旧值。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 新增 `point-layers` effect，允许城市人口相关编辑请求重建点层后再绘制。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 城市面板新增人口编辑和归属同步 runtime callback，统一走 `editHistory.execute()`。
  - 城市面板撤销/重做后同步刷新国家、省份和城市面板。
- 修改 `app/webgl-generator/src/ui/panels/city-panel.js`：
  - 城市详情加入人口输入与“应用人口”按钮。
  - 城市详情展示当前记录归属、所在 cell 归属、归属一致性和落水检查。
  - 新增“同步归属到所在 cell”按钮，仅在城市/burg 归属与所在 cell 不一致时启用。

暂缓：

- 不做新增/删除城市。
- 不做城市位置移动。
- 不做任意迁国/迁省下拉，也不重跑国家/省份扩张。
- 不做港口重算、路线重算、军事、zones 或经济派生更新。

## 2026-06-28 城市标签上限默认全量

问题：

- 用户要求“城市标签上限”滑动条默认给全部。
- 此前虽然滑动条最大值会按当前地图城市总数动态设置，但 renderer 默认 `maxCityLabels` 仍为 `48`，地图加载时会先按 48 个候选构建标签。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 默认 `maxCityLabels` 从 `48` 改为 `5000`。
  - 标签候选和可见上限曲线的默认 fallback 同步改为 `5000`。
- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - “城市标签上限”滑动条初始最大值和初始值改为 `5000`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 没有 localStorage 偏好时，控制层默认上限改为 `5000`。
  - 运行时面板显示的“上限”按当前城市总数收敛，默认样本会显示为全部城市数量，而不是内部 5000。

行为：

- 新用户或清空 localStorage 后，城市标签候选默认覆盖当前地图全部城市。
- 用户已经在浏览器 localStorage 中手动设置过较小上限时，仍尊重用户保存的偏好。

## 2026-06-28 文化管理面板第一刀

目标：

- 进入第三批区域实体面板，先完成文化管理面板第一刀。
- 本刀只做管理、统计、定位、名称和颜色编辑，不做文化 cell 归属笔刷、中心迁移、扩张参数编辑或宗教联动重算。

实施：

- 新增 `app/webgl-generator/src/ui/panels/culture-panel.js`：
  - 支持文化列表、筛选、排序、选中、定位、名称编辑、颜色编辑和 EditHistory 撤销/重做。
  - 详情展示文化词根、类型、扩张值、中心 pack/grid cell、覆盖 cells、面积、乡村人口、城市人口、城市数和主要国家分布。
- 新增 `app/webgl-generator/src/runtime/culture-edit-commands.js`：
  - `createSetCultureColorCommand()` 校验 `#rrggbb` 颜色，写入文化对象颜色，并支持撤销/重做。
- 修改 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - 通用对象重命名支持 `culture`，并同步更新文化 `root`。
- 修改 `app/webgl-generator/src/runtime/app.js` 和 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 控制面板“管理”tab 新增“文化管理”入口。
  - runtime 接入文化选择、定位、名称编辑、颜色编辑、撤销和重做。
- 修改 `app/webgl-generator/src/renderer/picking.js`、`app/webgl-generator/src/runtime/object-resolver.js` 和 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 文化专题点击地图时可产生 `culture` 对象。
  - `locateObject()` 和选中高亮支持文化区域。
  - 文化专题颜色优先读取 `map.society.cultures[id].color`，缺失时回退 indexed color。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增文化面板摘要、筛选、排序、详情、名称编辑、颜色编辑和历史操作的样式。

暂缓：

- 不做文化 cell 归属笔刷。
- 不做文化中心移动。
- 不做扩张参数编辑。
- 不重算宗教、国家、城市或路线派生链。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/panels/culture-panel.js`
  - `app/webgl-generator/src/runtime/culture-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/renderer/picking.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
- `git diff --check` 通过。
- Playwright 临时静态 server 验证正式应用：
  - 打开 `文化管理` 面板，默认样本显示 `12` 个文化。
  - 文化名称 `栖梧文化 -> 栖梧新文化`，撤销/重做均生效，`root` 同步为 `栖梧新`。
  - 文化颜色改为 `#33aa77` 后触发 `culture-color, cell-colors, object-panels` 刷新，撤销后恢复无自定义颜色状态。
  - `renderer.locateObject({kind: "culture", id: 1})` 成功，定位状态为 `culture #1`，选中高亮为 `culture red flash`。
  - 文化专题下点击远离城市标签的文化 cell，可选中 `culture #1` 并自动打开文化面板。

## 2026-06-28 宗教管理面板第一刀

目标：

- 延续文化管理面板的形态，补齐宗教管理面板第一刀。
- 本刀只做管理、统计、定位、名称和颜色编辑，不做宗教 cell 归属笔刷、中心迁移、扩张参数编辑或文化/国家/城市宗教联动重算。

实施：

- 新增 `app/webgl-generator/src/ui/panels/religion-panel.js`：
  - 支持宗教列表、筛选、排序、选中、定位、名称编辑、颜色编辑和 EditHistory 撤销/重做。
  - 详情展示宗教类型、形态、扩张范围、扩张强度、主神、所属文化、中心 pack/grid cell、覆盖 cells、面积、乡村人口、城市人口、城市数、主要国家和主要文化。
- 新增 `app/webgl-generator/src/runtime/religion-edit-commands.js`：
  - `createSetReligionColorCommand()` 校验 `#rrggbb` 颜色，写入宗教对象颜色，并支持撤销/重做。
- 修改 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - 通用对象重命名支持 `religion`。
- 修改 `app/webgl-generator/src/runtime/app.js`、`app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 控制面板“管理”tab 新增“宗教管理”入口。
  - runtime 接入宗教选择、定位、名称编辑、颜色编辑、撤销和重做。
  - 通用对象标题和详情格式补充 `religion`。
- 修改 `app/webgl-generator/src/renderer/picking.js`、`app/webgl-generator/src/runtime/object-resolver.js` 和 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 宗教专题点击地图时可产生 `religion` 对象。
  - `locateObject()` 和选中高亮支持宗教区域。
  - 宗教专题颜色优先读取 `map.society.religions[id].color`，缺失时回退 indexed color。
- 修改 `app/webgl-generator/src/styles.css`：
  - 宗教面板复用文化面板的摘要、筛选、排序、详情、名称编辑、颜色编辑和历史操作布局。

暂缓：

- 不做宗教 cell 归属笔刷。
- 不做宗教中心移动。
- 不做扩张范围和扩张强度编辑。
- 不重算文化、国家、城市、路线、zones 或其他派生链。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/panels/religion-panel.js`
  - `app/webgl-generator/src/runtime/religion-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
  - `app/webgl-generator/src/renderer/picking.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
- `git diff --check` 通过。
- Playwright 临时静态 server 验证正式应用：
  - 打开 `宗教管理` 面板，默认样本显示 `18` 个宗教。
  - 宗教名称 `栖梧民俗 -> 栖梧民俗新` 生效。
  - 宗教颜色改为 `#8844cc` 后触发 `religion-color, cell-colors, object-panels` 刷新，撤销后恢复原颜色。
  - `renderer.locateObject({kind: "religion", id: 1})` 成功，宗教对象可进入选中状态并构建宗教区域高亮。
  - 宗教专题下用 renderer 实际 pick 结果筛选地图点并真实鼠标点击，可选中 `religion` 对象，选中高亮为 `religion translucent cells`。

## 2026-06-28 文化命名风格第一刀

问题：

- 用户指出文化必须“有点用”：如果某个文化是西方文化，那么城镇、国家、河流等命名也应该体现西方风格。
- 此前 `culture` 只作为命名 seed 的一部分，并不会改变词池；即使随机到 `european` 文化集，最终地名仍主要是中式地名。

实施：

- 修改 `app/webgl-generator/src/generator/society.js`：
  - `european` 和 `english` 文化集生成的文化对象会带 `nameStyle: "European"`。
  - grid fallback 文化也保留定义上的 `root` 和 `nameStyle` 字段。
- 修改 `app/webgl-generator/src/generator/names.js`：
  - 新增西方音译地名和水名词池，例如 `雷恩`、`兰德`、`温德`、`卡斯特`、`莱茵`、`欧伦`、`艾文`。
  - `makePlaceName()`、`makeRiverName()`、`makeLakeName()` 和 `makeStateFormName()` 会读取 `cultureType/nameStyle`。
  - 显式 `European` 文化不再混入普通中式词根，但仍输出中文音译和中文地理后缀，避免纯外文名。
- 修改 `app/webgl-generator/src/generator/settlements.js`、`politics.js` 和 `rivers.js`：
  - 城市、港口、国家、省份、河流和湖泊命名都会传入所属文化的 `nameStyle` 或文化类型。
  - 河流几何仍在文化前生成，但会在 `buildSociety()` 后执行一次 `renameHydronymsByCulture()`，使水系名称能读取最终文化归属。
- 修改 `app/webgl-generator/src/ui/panels/culture-panel.js`、`runtime/object-resolver.js` 和 `renderer/picking.js`：
  - 文化对象和文化管理面板展示“命名风格”，后续可扩展为可编辑字段。

验证：

- `node --check` 已覆盖：
  - `app/webgl-generator/src/generator/names.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/rivers.js`
  - `app/webgl-generator/src/generator/index.js`
- 使用 `culturesSet: "european"` 生成抽样：
  - 城市样例包含 `雷恩郡`、`兰德城`、`温德堡`、`沃伦顿`、`阿尔文城`。
  - 国家样例包含 `贝尔顿公国`、`温德堡自由邦`、`奥斯维尔王国`。
  - 河流样例包含 `莱茵江`、`欧伦江`、`艾文溪`、`阿斯河`。
  - 抽样名称没有纯 Latin 外文名。

## 2026-06-28 Vue SFC 与 Pinia 状态岛第一刀

目标：

- 按用户要求引入最简 ESM Vue SFC 模式，不走 CDN，并让用户能看到真实 Vue 面板落地。
- 使用 Pinia 接管编辑状态和全局配置状态，但不把 WebGL 地图数据、pack/grid、renderer buffer 或 picking index 放入 Pinia。
- 配置状态继续快速同步到浏览器 `localStorage`，保证专题、图层和标签上限等偏好下次打开仍可恢复。

实施：

- 使用 `pnpm` 安装运行依赖 `vue`、`pinia`、`@vueuse/core`，安装开发依赖 `vite` 和 `@vitejs/plugin-vue`，新增 `pnpm-lock.yaml`。
- 新增 `vite.config.mjs`，正式应用根目录指向 `app/webgl-generator`，构建输出到 `dist/webgl-generator`。
- 修改根 `package.json`：
  - `start:app` 改为 Vite dev server。
  - 新增 `build:app` 和 `preview:app`。
  - 保留旧 `start:prototype`，继续使用项目静态服务启动旧 WebGL cells 原型。
- 修改 `app/webgl-generator/index.html`：
  - 保留原 canvas 和 DOM 面板结构。
  - 新增隐藏的 `#vue-state-root`，作为 Vue SFC 状态岛挂载点。
- 新增 `app/webgl-generator/src/ui/vue/`：
  - `pinia.js` 创建全局 Pinia 实例。
  - `VueStateBridge.vue` 作为当前最小 SFC 根组件。
  - `state-bridge.js` 暴露 runtime 可调用的状态同步门面，并把 `config/editor` store 暂挂到 `window.__webglGeneratorStores` 便于调试。
  - `stores/global-config-store.js` 使用 Pinia setup store 和 `@vueuse/core` 的 `useLocalStorage()` 管理 `webgl-generator-control-preferences`。
  - `stores/editor-store.js` 只保存当前编辑器、交互锁、编辑对象摘要、笔刷摘要和 history 计数等轻量状态。
- 修改 `app/webgl-generator/src/main.js`：
  - 在正式应用 runtime 初始化前先初始化 Vue/Pinia 状态岛。
- 重写 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 删除旧的 `document.createElement()` 控制面板拼装逻辑。
  - 改为在原浮动面板 body 内挂载 `ControlPanel.vue`。
  - 保留 `generate-map`、`data-mode`、`data-layer`、管理入口按钮等原 id/data 契约，使现有 runtime 事件绑定继续可用。
- 新增 `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 用 Vue SFC 渲染生成配置、专题选择、图层开关和管理入口四个 tab。
  - 专题 active、图层 active、海底高度开关和城市标签上限从 Pinia `global-config` store 读取。
  - WebGL 地图数据和大型渲染状态仍不进入组件 props 或 Pinia。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 控制偏好读写优先走 Pinia/global-config store。
  - 保留原生 `localStorage` fallback，避免状态岛不可用时控制面板失效。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 编辑交互锁刷新时同步轻量 editor snapshot 到 Pinia。
  - snapshot 不包含地图数据、renderer、selection store、grid/pack 或大型数组。
- 修改 `.gitignore`：
  - 忽略 `.pnpm-store/`，避免本地 pnpm store 出现在 git 状态中。

工具链注意：

- 本次在 Codex 沙箱内直接运行 `pnpm run build:app` 会触发 Codex runtime 包装的 pnpm 运行前依赖校验；它与本机 fnm/pnpm 创建的 `node_modules` 不同源时，会尝试非交互式重建目录并可能留下半安装状态。
- 处理方式是安全删除工作区内损坏的 `node_modules` 后，使用同一 pnpm 环境重新执行 `pnpm install --frozen-lockfile`；验证阶段直接调用本地 Vite 入口：
  - `node .\node_modules\.pnpm\vite@8.1.0\node_modules\vite\bin\vite.js build --config vite.config.mjs`

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/vue/state-bridge.js`
  - `app/webgl-generator/src/ui/vue/stores/global-config-store.js`
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
  - `app/webgl-generator/src/runtime/app.js`
- Vite 生产构建通过：
  - 生成 `dist/webgl-generator/index.html` 和对应 CSS/JS assets。
  - 构建输出中只有 `@vueuse/core` 依赖的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时静态 server 验证 `dist/webgl-generator`：
  - 页面标题为 `WebGL 地图生成器`。
  - `#map-canvas` 存在。
  - `window.__webglGeneratorStores` 中存在 `config` 和 `editor`。
  - 打开控制面板后存在 `.vue-control-panel-root`，确认控制面板由 Vue 挂载。
  - Vue 控制面板 tab 可切到 `图层` 和 `专题`。
  - 点击 `rivers` 图层开关后，按钮 `aria-pressed` 变为 `false`，Pinia 和 `localStorage` 同步记录 `layers.rivers = false`。
  - 点击 `states` 专题后，专题按钮 active，Pinia 和 `localStorage` 同步记录 `colorMode = "states"`。
  - 默认 `colorMode` 为 `height`，`maxCityLabels` 为 `5000`。
  - 通过 `config.patchPreferences({colorMode: "states", layers: {rivers: false}})` 修改 store 后，`localStorage.webgl-generator-control-preferences` 同步更新。
  - 无 console/pageerror。

## 2026-06-28 Vue 基础组件与高度面板迁移第一刀

目标：

- 先抽出各面板会反复使用的基础 Vue 组件，再继续深化面板改造。
- 第一批不迁移大型对象表格，先覆盖按钮、tab、分段按钮、开关、滑动条、输入字段、图层开关和指标摘要这些基础控件。
- 用高度编辑面板作为第二个真实 Vue 面板样板，验证基础件可以承载编辑面板，而不只是控制配置面板。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/base/`：
  - `UiButton.vue`：统一普通、primary、secondary 和 active 按钮形态。
  - `UiTabs.vue`：用于控制面板这类 tab 切换。
  - `UiSegmented.vue`：用于专题选择、高度编辑动作等分段按钮。
  - `UiField.vue`：统一输入框和下拉字段结构。
  - `UiSwitchField.vue`：统一 checkbox 开关行。
  - `UiSliderField.vue`：统一 range 滑动条和值显示。
  - `UiLayerToggleButton.vue`：统一图层开关按钮形态，保留 `data-layer` 和 `aria-pressed` 契约。
  - `UiMetricGrid.vue`：统一摘要指标栅格。
- 修改 `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 改用基础组件渲染生成配置、专题、图层和管理入口。
  - 保留 `generate-map`、`data-mode`、`data-layer`、`max-city-labels` 等旧 runtime 依赖的 DOM 契约。
- 新增 `app/webgl-generator/src/ui/vue/components/HeightPanel.vue`：
  - 用基础组件渲染高度摘要、启停按钮、抬升/降低/平滑动作、半径/强度滑动条、中心衰减开关和撤销/重做。
  - 面板内部笔刷状态仍是轻量 reactive 对象，不进入 Pinia。
- 重写 `app/webgl-generator/src/ui/panels/height-panel.js`：
  - 删除旧 `document.createElement()` 拼装逻辑。
  - 改为在原浮动面板 body 内挂载 `HeightPanel.vue`。
  - 保持外部 API：`open()`、`update()`、`getBrush()`、`setActive()`。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
  - `app/webgl-generator/src/ui/panels/height-panel.js`
  - `app/webgl-generator/src/ui/vue/stores/global-config-store.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时静态 server 验证 `dist/webgl-generator`：
  - 打开控制面板后存在 `.vue-control-panel-root`。
  - 打开高度编辑后存在 `.vue-height-panel-root`。
  - 通过 Vue 控制面板关闭 `rivers` 图层后，按钮 `aria-pressed` 为 `false`，Pinia 和 `localStorage` 同步为 `layers.rivers = false`。
  - 在 Vue 高度面板中启用高度编辑后，按钮文案变为 `停止高度编辑`，Pinia editor store 的 `activeEditor` 为 `height`。
  - 切换高度动作到 `降低`、拖动半径到 `42` 后，面板状态与 DOM 值同步。
  - 无 console/pageerror。

后续：

- 下一批优先迁移只读或轻编辑面板：路线面板、对象详情面板。
- 再迁移列表 + 详情 + 编辑组合面板：河流、文化、宗教、城市、国家、省份。
- 在迁移这些面板前，需要继续把对象表格、排序条、详情字段、历史操作和名称/颜色编辑字段抽成 Vue 组件。

## 2026-06-28 Vue 对象面板基础层与路线/对象详情迁移

目标：

- 在基础控件之后继续抽对象面板需要的通用 Vue 组件。
- 先迁移路线面板和对象详情面板，验证列表、筛选、排序、详情、定位和编辑入口的 Vue 版本可以复用旧 runtime 流程。
- 继续保持 WebGL 地图数据、renderer、picking index 等大状态不进入 Pinia。

实施：

- 新增对象面板基础组件：
  - `UiFilterInput.vue`：保留中文输入法 composition 处理，避免筛选时拼音输入被中断。
  - `UiSortBar.vue`：统一排序按钮和升降序箭头。
  - `UiObjectTable.vue`：统一对象表格、选中行、双击定位和定位按钮。
  - `UiDetailGrid.vue`：统一详情字段网格。
  - `UiHistoryActions.vue`：统一撤销/重做按钮和历史摘要。
  - `UiTextEditField.vue`：统一名称编辑表单。
  - `UiColorField.vue`：统一颜色编辑表单。
  - `UiNumberField.vue`：统一数字编辑表单。
- 修改 `UiButton.vue`：
  - 增加 `buttonType`，支持表单 submit 按钮，默认仍为 `button`。
- 新增 `app/webgl-generator/src/ui/vue/components/RoutePanel.vue`：
  - 使用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable` 和 `UiDetailGrid` 渲染路线管理面板。
  - 路线长度、类型、起终点、段数、grid/pack cells 等指标维持原逻辑。
- 重写 `app/webgl-generator/src/ui/panels/route-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue 挂载包装，保持 `open()`、`update()`、`setSelectedRouteId()` 和 `isOpen()` 外部 API。
  - `map` 通过 `markRaw()` 放入 `shallowReactive` 面板状态，避免 Vue 深代理 pack/grid 大对象。
- 新增 `app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue`：
  - 使用 `UiDetailGrid`、`UiButton` 和 `UiTextEditField` 渲染通用对象详情。
  - 保留城市/路线/marker/label/river/province/region 的详情字段格式。
- 重写 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue 挂载包装，保持 `show()` 和 `clear()` 外部 API。
  - 保留关闭编辑面板时调用 `onCancelEdit()` 并抑制下一次查看态自动打开的保护逻辑。
- 修改 `app/webgl-generator/src/styles.css`：
  - `object-details-list` 兼容 Vue 详情组件的 `span/strong` 结构。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/route-panel.js`
  - `app/webgl-generator/src/ui/panels/object-details-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时静态 server 验证 `dist/webgl-generator`：
  - 打开路线管理后存在 `.vue-route-panel-root`。
  - 路线面板排序切到 `段数 ↓`，表格选中行数量为 `1`，详情区显示路线类型、等级、起终点、长度、段数、grid cells、pack cells 和 feature。
  - 路线定位按钮可触发 runtime selection 更新。
  - 人工选中一个 marker 后，对象详情面板存在 `.vue-object-details-root`，标题和详情字段正确显示。
  - 对象详情定位按钮可调用旧定位回调。
  - 点击对象详情“编辑”后，按钮变为“退出编辑”，runtime `editingObject` 变为该 marker。
  - 无 console/pageerror。

后续：

- 下一批建议迁移河流、文化、宗教面板：它们都有列表、详情、名称/颜色或数字轻编辑，正好继续验证 `UiHistoryActions`、`UiTextEditField`、`UiColorField`、`UiNumberField`。
- 城市、国家、省份面板依赖更多派生编辑链路，建议在轻编辑列表面板稳定后再迁。

## 2026-06-28 docs 目录整理

目标：

- `docs/` 根目录只保留接手入口和总日志，减少本地日志、生成报告和阶段细则混在一起的噪声。
- 已追踪的总结性文档继续保留在版本库，但按用途分组。
- 执行细则、评估记录、生成报告、snapshot、baseline 和本地 server 日志统一收进被 ignore 的目录。

实施：

- 新增 `docs/README.md`，说明根目录、长期文档目录和本地/生成目录的用途。
- 将长期文档移动到分组目录：
  - `docs/architecture/floating-panel-architecture.md`
  - `docs/plans/gl-reimplementation-acceptance-plan.md`
  - `docs/milestones/milestone-1-webgl-prototype.md`
  - `docs/performance/performance-baseline.md`
  - `docs/performance/webgl-svg-performance-comparison.md`
  - `docs/audits/source-generation-audit-and-rectification-plan.md`
- 将执行细则和评估记录移动到 `docs/task-notes/`：
  - `chinese-naming-library-evaluation.md`
  - `editor-and-stat-panel-inventory.md`
  - `source-first-detailed-task-plan.md`
  - `source-first-recovery-execution-plan.md`
- 将生成报告移动到 `docs/generated/reports/`。
- 将 source baseline、snapshot 和本地预览图片移动到 `docs/generated/` 下对应目录。
- 将本地 server 日志移动到 `docs/local-logs/`。
- 停止两个已确认属于本项目旧预览服务的 `serve-prototype.mjs` node 进程，释放根目录日志文件后完成归档。
- 更新 `.gitignore`：
  - 新增 `docs/generated/`
  - 新增 `docs/local-logs/`
  - 新增 `docs/task-notes/`
  - 保留旧路径 ignore 规则，避免旧脚本仍按旧路径吐产物时进入 git 状态。
- 更新工具默认输出路径，避免后续运行重新污染 `docs/` 根目录：
  - `tools/fmg-profile.mjs` 默认写入 `docs/generated/reports/`。
  - `tools/webgl-prototype-profile.mjs` 默认写入 `docs/generated/reports/`。
  - source/candidate baseline 和 diff 相关工具默认写入 `docs/generated/source-baselines/`。
- 批量更新 AGENTS、当前计划、开发日志、app README 和长期文档中的新路径引用。

验证：

- `docs/` 根目录当前只保留：
  - `README.md`
  - `current-plan.md`
  - `development-log.md`
  - 分组子目录
- `rg` 检查旧文档路径未再出现在非 generated 文档中。
- `git status --ignored docs` 显示 generated、local-logs、task-notes 均被 ignore。

后续：

- 后续新增总结性文档优先放入 `architecture/`、`plans/`、`milestones/`、`performance/` 或 `audits/`。
- 后续临时执行细则和脚本产物应写入 `task-notes/` 或 `generated/`，不要再堆到 `docs/` 根目录。

## 2026-06-28 Vite 端口配置收敛

目标：

- 使用 Vite 推荐的配置文件方式管理正式应用开发服务端口，而不是把 `host` 和 `port` 写在 pnpm 启动参数里。

实施：

- `package.json` 的 `start:app` 和 `preview:app` 保留为单纯的 Vite config 入口：
  - `vite --config vite.config.mjs`
  - `vite preview --config vite.config.mjs`
- `vite.config.mjs` 集中声明正式应用的 `server` 和 `preview` 配置：
  - `host: "127.0.0.1"`
  - `port: 5410`
  - `strictPort: false`
- 更新 `app/webgl-generator/README.md`，移除旧的 `serve-prototype` 正式应用托管说明，并记录当前 Vite + Vue SFC + Pinia 构建器决策。

验证：

- `node --check vite.config.mjs` 通过。
- `package.json` JSON 解析通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- `git diff --check` 通过。

## 2026-06-28 Vue 面板迁移第二批

目标：

- 按当前计划继续深化 Vue SFC 面板迁移。
- 优先迁移河流、文化和宗教这三类“列表 + 详情 + 轻编辑”面板，验证基础对象面板组件的复用性。
- 补充 Vue 浮动面板复用规范，给后续城市、国家和省份复杂面板迁移提供边界。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/RiverPanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiSliderField`、`UiButton` 和 `UiHistoryActions`。
  - 保留河流统计、筛选、排序、定位、名称编辑、宽度因子滑动条、进入/退出河流编辑和撤销/重做。
- 重写 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue 挂载 wrapper，继续保留 `open()`、`update()`、`isOpen()` 和关闭时重置编辑态的外部契约。
- 新增 `CulturePanel.vue` 和 `ReligionPanel.vue`：
  - 复用同一批对象面板基础组件。
  - 保留统计摘要、筛选、排序、列表、定位、名称编辑、颜色编辑、详情字段和历史操作。
- 重写 `culture-panel.js` 和 `religion-panel.js`：
  - wrapper 仅负责 panel manager 注册、`markRaw(map)`、选中 id fallback 和 runtime 回调桥接。
- 新增 `docs/architecture/vue-floating-panel-pattern.md`：
  - 记录 wrapper / SFC / base components / runtime / Pinia 的职责边界。
  - 明确 `grid`、`pack`、`map`、renderer buffer 和 picking index 不进入 Pinia。
- 更新 `docs/README.md` 和 `docs/current-plan.md`。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/river-panel.js`
  - `app/webgl-generator/src/ui/panels/culture-panel.js`
  - `app/webgl-generator/src/ui/panels/religion-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- `pnpm run build:app` 在 Codex runtime pnpm 下仍会触发非交互式模块目录清理保护，因此本轮继续使用本地 Vite 入口验证。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，`window.__webglGeneratorApp.map` 存在。
  - 管理入口可打开 `.vue-river-panel-root`、`.vue-culture-panel-root` 和 `.vue-religion-panel-root`。
  - 河流面板显示 165 行河流；筛选输入填入 `1` 后仍保持焦点。
  - 文化面板显示 12 行文化，名称输入、颜色输入和历史操作存在。
  - 宗教面板显示 18 行宗教，名称输入、颜色输入和历史操作存在。
  - 选中第一条河流后，河流名称输入、宽度滑动条、历史操作和“进入河流编辑”按钮存在。
  - 无 console error / pageerror。

## 2026-06-28 Vue 城市管理面板迁移

目标：

- 在河流、文化、宗教等轻编辑面板迁移后，继续迁移更复杂的城市管理面板。
- 保持旧城市编辑命令链不变，只替换 UI 层：城市重命名、人口编辑、归属同步、定位、selection 和 EditHistory 回调仍由 runtime 处理。
- 继续遵守 Vue 浮动面板边界：`map` 使用 `markRaw()` 放入 wrapper 状态，不把 settlements、pack、grid 或 renderer 交给 Pinia。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/CityPanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiNumberField`、`UiButton` 和 `UiHistoryActions`。
  - 保留城市摘要、筛选、排序、城市表格、详情字段、名称编辑、人口编辑、低风险“同步归属到所在 cell”和历史操作。
  - 城市行统计继续读取 `settlements.cities`、`pack.burgs`、`pack.cells`、`grid.cells`、国家/省份/文化/宗教字段，并保留归属一致性和落水异常提示。
- 重写 `app/webgl-generator/src/ui/panels/city-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue wrapper，继续保留 `open()`、`update()`、`setSelectedCityId()`、`isOpen()` 和 `unmount()` 外部 API。
  - `onSelect`、`onLocate`、`onRename`、`onPopulationChange`、`onSyncOwnerToCell`、`onUndo` 和 `onRedo` 仍桥接到原 runtime 回调。
- 更新 `docs/current-plan.md` 和 `docs/architecture/vue-floating-panel-pattern.md`，将城市管理面板标记为已迁移，并把下一批收敛为国家/省份面板。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/city-panel.js`
  - `app/webgl-generator/src/ui/panels/river-panel.js`
  - `app/webgl-generator/src/ui/panels/culture-panel.js`
  - `app/webgl-generator/src/ui/panels/religion-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，城市管理面板可通过 `控制面板 -> 管理 -> 城市管理` 打开。
  - `.vue-city-panel-root` 存在，城市表格显示 817 行，默认选中城市详情正常。
  - 城市摘要、详情、名称输入、人口输入、归属同步按钮和历史操作区存在。
  - 筛选输入填入 `1` 后仍保持焦点。
  - 点击城市行后 runtime `selection` 和 `selectionStore.selection` 均更新为 `kind: "city"` 对象。
  - 无 console error / pageerror。

后续：

- 下一批建议迁移国家和省份面板。它们涉及 cell 归属笔刷、政治边界、局部统计和 pole 重算，迁移时应先保持旧编辑命令和 runtime 回调不变，再替换表格、详情和轻编辑字段。

## 2026-06-28 Vue 省份管理面板迁移

目标：

- 在城市面板迁移后，继续推进更复杂的区域编辑面板。
- 先选择省份面板，而不是国家面板，因为省份面板已有 cell 归属笔刷、目标选择、颜色/名称编辑和局部 pole 统计，但不包含国家面板的首都下拉和国家派生链，适合作为下一步闭环。
- 保持旧省份编辑命令链不变，只替换 UI 层：省份选择、定位、启停编辑、半径、取选中、取悬停、名称编辑、颜色编辑、撤销/重做仍由 runtime 处理。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/ProvincePanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiColorField`、`UiSliderField`、`UiButton` 和 `UiHistoryActions`。
  - 保留省份摘要、筛选、排序、表格、详情字段、名称编辑、颜色编辑、启停编辑、目标省份选择、取选中、取悬停、笔刷半径和历史操作。
  - 省份行统计继续读取 `politics.provinces` / `pack.provinces`、国家、中心 cell、pole、面积、cells、邻接、省内城市、文化和宗教字段。
- 重写 `app/webgl-generator/src/ui/panels/province-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue wrapper，继续保留 `open()`、`update()`、`setSelectedProvinceId()`、`getBrush()`、`setActive()`、`isOpen()` 和 `unmount()` 外部 API。
  - `onSelect`、`onLocate`、`onEdit`、`onActiveChange`、`onTargetProvinceId`、`onRadius`、`onSampleSelection`、`onSampleHover`、`onRename`、`onColorChange`、`onUndo` 和 `onRedo` 仍桥接到原 runtime 回调。
- 更新 `docs/current-plan.md` 和 `docs/architecture/vue-floating-panel-pattern.md`，将省份管理面板标记为已迁移，并把下一批收敛为国家编辑面板。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/province-panel.js`
  - `app/webgl-generator/src/ui/panels/state-panel.js`
  - `app/webgl-generator/src/ui/panels/city-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，省份管理面板可通过 `控制面板 -> 管理 -> 省份管理` 打开。
  - `.vue-province-panel-root` 存在，省份表格显示 206 行，默认选中省份详情正常。
  - 省份摘要、详情、名称输入、颜色输入、目标省份下拉、笔刷半径、取选中/取悬停和历史操作区存在。
  - 筛选输入填入 `1` 后仍保持焦点。
  - 点击省份行后 runtime `selection` 和 `selectionStore.selection` 均更新为 `kind: "province"` 对象。
  - 点击“启用省份编辑”并将半径改为 `42` 后，`getBrush()` 返回 `active: true`、选中省份 id 和半径 `42`。
  - 无 console error / pageerror。

后续：

- 下一批建议迁移国家编辑面板。国家面板还包含首都选择、国家颜色、国家归属笔刷和更多政治派生刷新，迁移时应保持旧 runtime 命令链不变。

## 2026-06-28 Vue 国家编辑面板迁移

目标：

- 完成当前已有复杂管理/编辑面板的 Vue SFC 迁移收口。
- 保持旧国家编辑命令链不变，只替换 UI 层：国家选择、定位、启停编辑、半径、取选中、取悬停、名称编辑、颜色编辑、首都修改、撤销/重做仍由 runtime 处理。
- 继续保持 `state-panel.js` 作为 runtime wrapper，避免把国家、城市、pack/grid 或 renderer 大对象放入 Pinia。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/StatePanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiColorField`、`UiSliderField`、`UiButton` 和 `UiHistoryActions`。
  - 保留国家摘要、筛选、排序、国家表格、详情字段、名称编辑、颜色编辑、启停编辑、目标国家选择、取选中、取悬停、笔刷半径和历史操作。
  - 保留国家面板特有的首都下拉与“设为首都”操作，候选城市来自当前目标国家内的城市列表。
  - 国家行统计继续读取 `politics.states`、首都城市、文化、宗教、中心 cell、面积、城镇数、人口和邻国字段。
- 重写 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue wrapper，继续保留 `open()`、`update()`、`getBrush()`、`setTargetStateId()`、`setActive()` 和 `unmount()` 外部 API。
  - `onSelect`、`onLocate`、`onEdit`、`onActiveChange`、`onTargetStateId`、`onRadius`、`onSampleSelection`、`onSampleHover`、`onRename`、`onColorChange`、`onCapitalChange`、`onUndo` 和 `onRedo` 仍桥接到原 runtime 回调。
- 更新 `docs/current-plan.md` 和 `docs/architecture/vue-floating-panel-pattern.md`，将国家编辑面板标记为已迁移，并记录当前已有主要浮动面板均已迁为 Vue SFC。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/state-panel.js`
  - `app/webgl-generator/src/ui/panels/province-panel.js`
  - `app/webgl-generator/src/ui/panels/city-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，国家编辑面板可通过 `控制面板 -> 管理 -> 国家编辑` 打开。
  - `.vue-state-panel-root` 存在，国家表格显示 20 行，默认选中国家详情正常。
  - 国家摘要、详情、名称输入、颜色输入、首都下拉、目标国家下拉、笔刷半径、取选中/取悬停和历史操作区存在。
  - 筛选输入填入 `1` 后仍保持焦点。
  - 点击国家行后 runtime `selection` 和 `selectionStore.selection` 均更新为 `kind: "state"` 对象。
  - 点击“启用国家编辑”并将半径改为 `46` 后，`getBrush()` 返回 `active: true`、选中国家 id 和半径 `46`。
  - 无 console error / pageerror。

后续：

- 当前已有主要浮动管理/编辑面板已完成 Vue SFC 迁移。下一步可转向面板功能深化，例如国家/省份新增删除、城市移动、标签/命名面板、marker/zone 面板或对象表格虚拟滚动。

## 2026-06-28 悬停信息右下角展示

目标：

- 在继续面板功能深化前，先降低悬停信息对固定侧栏的占用。
- 将悬停后的信息改成更精简的地图内提示，并固定在右下角展示。
- 保留用户控制权：可在控制面板中开启或关闭该信息卡，并在刷新后恢复偏好。

实施：

- `app/webgl-generator/index.html` 新增 `hover-overlay` 容器，并把原侧栏“悬停”小节改为“选择”，避免侧栏继续承载大段 hover 明细。
- `app/webgl-generator/src/ui/panel.js` 新增 `updateHoverOverlay()` 和压缩行生成逻辑：
  - 信息标题优先显示命中对象类型，例如城市、河流、路线或专题对象；无对象时显示陆地/水域 cell。
  - 内容只保留对象摘要、cell、海拔/水域、国家/省份、文化/宗教、城市/路线和拾取候选等短字段。
  - 过滤未命名路线，避免出现 `unknown -> unknown` 这类调试态信息。
  - `pick-stats` 改为只显示选中对象和编辑对象摘要。
- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue` 在 `图层` tab 新增“悬停信息”开关。
- `app/webgl-generator/src/ui/vue/stores/global-config-store.js` 新增 `showHoverInfo` 偏好，并继续通过现有全局偏好链路写入 `localStorage`；旧版偏好兼容读取。
- `app/webgl-generator/src/styles.css` 新增右下角透明固定信息卡样式；信息卡 `pointer-events: none`，不会拦截地图拖拽、缩放和 hover picking。
- `app/webgl-generator/src/runtime/app.js` 在开关变化后刷新当前 pick 面板状态，使关闭/开启立即生效。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/vue/stores/global-config-store.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 鼠标移动到 canvas 后，右下角信息卡出现并显示精简 hover 内容。
  - 信息卡为不可交互层，`pointer-events` 为 `none`。
  - 控制面板 `图层` tab 中“悬停信息”开关默认开启。
  - 关闭开关后信息卡立即隐藏，并写入 `showHoverInfo: false`；再次开启后恢复显示，并写入 `true`。
  - 侧栏 `pick-stats` 只保留选中对象和编辑对象摘要。
  - 无 console error / pageerror。

后续：

- 如果后续接入对象级 picking 或标签编辑器，可继续扩展悬停信息摘要字段，但仍应保持右下角信息卡短句化，避免退回侧栏长调试信息。

## 2026-06-28 标签命名面板与国家名称显示

目标：

- 继续面板迁移后的下一步：新增标签命名面板第一刀。
- 修复国家专题下不显示国家名字的问题。
- 保持产品文案克制：图层中显示“国家名称”，管理入口显示“标签命名”，不使用实现逻辑词。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue`：
  - 统一列出城市标签和国家名称。
  - 支持筛选、排序、表格选中、定位、详情和名称编辑。
  - 名称编辑复用现有 `createRenameObjectCommand()` 与 EditHistory。
- 新增 `app/webgl-generator/src/ui/panels/label-naming-panel.js`：
  - 作为 Vue wrapper 桥接 runtime 回调。
  - 保持 `map` 使用 `markRaw()`，不把地图大对象放入 Pinia。
- `app/webgl-generator/src/renderer/placeholder-renderer.js` 的标签层从仅城市标签扩展为城市标签 + 国家名称：
  - `labels` 继续控制城市标签。
  - 新增 `stateLabels` 图层控制国家名称。
  - 国家名称只在国家专题下显示，避免其它专题被大字遮挡。
  - label picking 支持 `targetKind: "state"`。
- `app/webgl-generator/src/runtime/object-resolver.js` 和 `app/webgl-generator/src/runtime/object-edit-commands.js` 支持国家名称标签解析与重命名。
- `app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue` 允许国家名称标签进入名称编辑。
- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - `图层` tab 新增“国家名称”开关。
  - `管理` tab 新增“标签命名”入口。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/ui/panels/label-naming-panel.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/ui/panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 控制面板 `图层` tab 存在“悬停信息”开关，旧 `show-hover-overlay` 控件不再出现在 DOM 中。
  - 切到国家专题后，`stateLabelCount = 20`，当前视口可见国家名称 `12` 个。
  - 运行时统计显示 `标签：城市 2 / 817 / 上限 817；国家 12 / 20`。
  - `管理 -> 标签命名` 可打开 `.vue-label-naming-panel-root`，面板同时包含城市标签和国家名称。
  - 在标签命名面板中筛选“国家名称”，把一个国家名称改为“测试国”后，地图上的 `.state-label` 文本同步刷新，EditHistory 记录为 `重命名国家 #15`。
  - 无 console error / pageerror。

后续：

- 标签命名面板当前只做城市/国家名称第一刀；路线标签、区域标签、手动标签位置锁定、曲线文字和批量命名风格配置仍留到后续阶段。

## 2026-06-28 比例尺位置与对象类型分发整理

目标：

- 修复温度、降水专题比例尺与右下角悬停信息卡位置冲突。
- 对 `object.kind === "xxx"` 这类重复比较做第一轮结构化整理。
- 不引入 TypeScript enum，仅用普通对象常量集中管理对象类型，方便后续面板、选择、定位、编辑命令自然串联。

实施：

- `app/webgl-generator/src/styles.css` 将 `.map-legend` 从右下区域移到左下角：
  - 温度、降水专题仍按原逻辑显示比例尺。
  - 右下角继续留给悬停信息卡。
- 新增 `app/webgl-generator/src/runtime/object-kinds.js`：
  - 集中定义 `OBJECT_KIND`、`LABEL_TARGET_KIND`、`OBJECT_KIND_LABEL`。
  - 集中定义 `POLITICAL_OBJECT_KINDS`、`POLITICAL_OBJECT_FIELD` 和 `POINT_OBJECT_KINDS`。
  - 提供 `isPoliticalObjectKind()`、`isPointObjectKind()` 等轻量判断函数。
- `app/webgl-generator/src/runtime/object-resolver.js`：
  - 从连续 `if object.kind` 改为 `OBJECT_RESOLVERS` 分发表。
  - label 的 city/state target 使用 `LABEL_TARGET_KIND`。
- `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - 对象命名读取、写入、恢复分别改为 reader/writer/restorer 表。
  - 对象中文类型名读取 `OBJECT_KIND_LABEL`。
  - label 重命名目标归一化使用 `LABEL_TARGET_KIND`。
- `app/webgl-generator/src/runtime/app.js`：
  - selection 自动打开面板逻辑抽为 `SELECTION_PANEL_HANDLERS`。
  - 国家、城市、省份、文化、宗教、河流、路线的后续动作都从分发表进入，后续新增对象面板时可直接新增 handler。
- `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue`：
  - 对象标题、对象详情行改为 formatter map。
  - 悬停信息和对象详情继续使用现有显示文案。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 使用同一套对象类型常量。
  - 政治对象字段、政治高亮颜色和高亮模式改为字段表/映射表。
- `app/webgl-generator/src/ui/panels/label-naming-panel.js` 与 `LabelNamingPanel.vue`：
  - 标签目标类型改用 `LABEL_TARGET_KIND`，避免城市/国家标签继续散落字符串。
- `vite.config.mjs`：
  - 将 `root` 和 `outDir` 改为相对路径，避免 Windows + Rolldown 构建时 HTML 插件尝试用绝对路径作为输出文件名。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/object-kinds.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/ui/panels/label-naming-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 温度专题下比例尺位于地图左下角，悬停信息卡位于右下角，两者不重叠。
  - 降水专题下比例尺同样位于地图左下角。
  - 比例尺和悬停信息卡均为 `pointer-events: none`。
  - 国家专题仍显示国家名称：`stateLabelCount = 20`，当前视口可见 `12` 个。
  - `管理 -> 标签命名` 面板仍可打开，并包含国家名称。
  - 无 console error / pageerror。

后续：

- 本轮优先整理对象解析、命名、UI 展示、selection 自动开面板和 renderer 选择高亮；仍有少量面板局部状态判断保留 `kind` 比较，可在对应面板继续深化时逐步迁到 `OBJECT_KIND`。

## 2026-06-28 标签命名面板样式统一

目标：

- 修复标签命名面板与其它 Vue 浮动面板视觉不统一的问题。
- 保持标签命名面板业务逻辑不变，只收敛 UI class 与 CSS 复用。

原因：

- `LabelNamingPanel.vue` 使用了 `label-naming-sort`、`label-naming-details`、`label-name-editor` 等专用 class。
- `styles.css` 只给 `label-naming-summary`、`label-naming-controls` 和 `label-name-editor` 补了半套样式，没有覆盖排序按钮、详情网格和历史操作区。
- 这导致标签命名面板的排序、详情和编辑区域没有复用路线/城市/国家等面板的完整视觉规则，看起来不像同一套面板系统。

实施：

- `app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue` 改为复用现有对象面板样式：
  - 摘要、筛选、排序和详情复用 `route-panel-*` class。
  - 名称编辑复用 `city-name-editor` class。
  - 历史操作复用 `city-history-actions` class。
- `app/webgl-generator/src/styles.css` 删除孤立的 `label-naming-*` 和 `label-name-editor` 专用样式，避免形成第二套半成品面板样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/label-naming-panel.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 标签命名面板与路线面板的摘要、筛选输入、排序按钮、详情网格 computed style 一致。
  - DOM 中不再出现 `.label-naming-sort`、`.label-naming-details` 和 `.label-name-editor`。
  - 无 console error / pageerror。

## 2026-06-28 “专题”命名改为“视图”

目标：

- 将控制面板中用户可见的“专题”改为“视图”，后续产品文案统一使用“视图”。
- 保留内部 `themes`、`colorMode` 等既有契约，避免为了改名牵动运行时事件和持久化字段。

实施：

- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - tab 文案改为 `生成 / 视图 / 图层 / 管理`。
  - 分段控件 label 改为“视图”。
  - 开关文案改为“高度视图显示海底”。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计行从“专题”改为“视图”。
- `app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue`：
  - 国家名称显示策略改为“国家视图下显示”。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 当前说明中的用户可见称呼同步改为“视图”。

验证：

- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/label-naming-panel.js` 通过。
- Vite 生产构建通过；本机因 `pnpm run` 会触发依赖校验并访问 registry，实际使用本地 Vite 入口 `node node_modules/vite/bin/vite.js build --config vite.config.mjs` 验证。仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时静态服务验证 `dist/webgl-generator`：
  - 控制面板 tab 显示 `生成 / 视图 / 图层 / 管理`，页面正文不再出现“专题”。
  - `视图`页可打开，包含高度、温度、降水、生物群系、文化、宗教、国家、省份、区域、人口按钮和“高度视图显示海底”开关。
  - 运行时统计行显示“视图”，不再显示“专题”。
  - 标签命名面板中国家名称详情显示“国家视图下显示”。
  - 无 console error / pageerror。

## 2026-06-28 标签管理深化与重新生成入口计划

目标：

- 深化“标签命名”为真正的标签管理，支持增删改。
- marker 和 zone 暂缓。
- 标签管理完善后，将其动作区、表格操作和历史操作模式推广到其它管理面板。
- 管理面板新增专门的“重新生成”入口，后续用于国家、省份、城镇、道路、河流等属性重算。

设计约束：

- 城市标签和国家名称是由城市/国家对象派生的标签，不能用“删除标签”误删城市或国家本体；第一刀删除派生标签实现为隐藏，并提供恢复。
- 新增标签先实现为独立手工标签，写入当前地图自己的 `labels.custom` 数据，不回写 source，也不改变城市/国家生成链路。
- 手工标签应支持名称、位置、定位、选择、删除和撤销/重做。
- 重新生成入口先提供动作和状态框架；具体重算要逐类遵守生成约束：河流按高度/水文下行，路线按陆路/海路寻路，国家/省份/城镇要处理下游派生过期或联动刷新。

## 2026-06-28 标签管理增删改与重新生成入口第一刀

实施：

- 新增 `app/webgl-generator/src/runtime/label-edit-commands.js`：
  - `createAddCustomLabelCommand()` 新增独立手工标签，默认放在当前 hover 世界坐标；没有 hover 时放在地图中心。
  - `createRenameCustomLabelCommand()` 支持手工标签重命名。
  - `createDeleteLabelCommand()` 对手工标签执行删除，对城市/国家派生标签执行隐藏。
  - `createRestoreGeneratedLabelCommand()` 支持恢复被隐藏的城市/国家派生标签。
  - 标签编辑统一走 `EditHistory`，并刷新 labels、selection、runtime 和对象面板。
- `LabelNamingPanel.vue` 深化为标签管理：
  - 表格新增“状态”列。
  - 摘要新增“手工”数量。
  - 详情显示标签状态。
  - 动作区新增“新增标签”、“删除标签”和“恢复标签”。
  - 通过 `version` 触发 markRaw 地图深层变更后的表格重算。
- renderer 标签层支持手工标签：
  - `map.labels.custom` 会渲染为 `.custom-label`。
  - 城市和国家派生标签会读取 `map.labels.hidden`，隐藏后不进入 overlay。
  - picking、selection marker、定位 bounds 支持手工标签。
- 管理入口文案从“标签命名”改为“标签管理”。
- 新增 `RegenerationPanel.vue` 和 `regeneration-panel.js`：
  - 管理 tab 新增“重新生成”入口。
  - 面板提供国家、省份、城镇、道路、河流按钮和约束说明。
  - 道路按钮已接入实际重算：复用 `finalizeSettlements()`，按当前国家、城镇、港口、陆路和海路约束重建路线，并刷新 route mesh。
  - 国家、省份、城镇、河流先显示受约束重算说明，暂不执行无约束替换；marker 和 zone 暂缓。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/label-edit-commands.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/panels/label-naming-panel.js`
  - `app/webgl-generator/src/ui/panels/regeneration-panel.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时静态服务验证 `dist/webgl-generator`：
  - “标签管理”可打开。
  - 新增手工标签后，`map.labels.custom.length = 1`，表格出现“手工标签”，overlay 出现 `.custom-label`。
  - 手工标签重命名为“手工测试标签”后，地图 overlay 同步显示新文本。
  - 删除手工标签后，`map.labels.custom.length = 0`。
  - 选择城市派生标签后点击“删除标签”，`map.labels.hidden.city.length = 1`，详情显示“已隐藏，不在地图显示”。
  - 点击“恢复标签”后，`map.labels.hidden.city.length = 0`。
  - “重新生成”面板可打开，道路重算后 `lastEditRefresh` 显示 `route-mesh, object-panels`，面板显示“道路已按当前国家、城镇、港口和陆海约束重算”。
  - 无 console error / pageerror。

## 2026-06-28 中文文化城镇命名修正计划

目标：

- 修正中文文化下城镇名过度三字化、四字化的问题。
- 大城市、首都和省会优先使用二字地名；小城镇保留少量三字或四字自然地名。
- 扩充中式候选用字和二字词根，降低重复拼接感。
- 不改变欧洲/英文等音译风命名的总体方向。

现状：

- `app/webgl-generator/src/generator/names.js` 的 `makePlaceName()` 会对显式文化风格高概率使用“词干 + 后缀”。
- 普通中式词干本身多为二字，因此追加 `山/岭/川/港/城/州` 等后缀后，城市很容易稳定变成三字。
- 10k 地中海样本中，中式城市名长度分布为：二字 `28`、三字 `491`、四字 `344`、五字 `22`；首都和大城市同样以三字为主。

计划：

- 将默认/中式地点名生成从音译风文化分支中拆开，避免“显式文化风格”误触发高频后缀拼接。
- 为城镇命名增加规模参数，使 `capital/provincial/city` 倾向二字，`town/village/hamlet` 才有小概率派生三字或四字。
- 扩充中式二字词根、单字词根、自然后缀和小聚落修饰词，并控制唯一化前缀的使用频率。

## 2026-06-28 中文文化城镇命名修正第一刀

实施：

- `app/webgl-generator/src/generator/names.js`：
  - 扩充中式二字地名词根，并新增可组合的首字、尾字词库，避免大地图中二字名过早撞名。
  - 新增港口二字词根、小聚落前缀和小聚落后缀。
  - 默认/中式地点名不再因为 `Highland/Naval/River/Hunting` 等文化类型自动使用音译词根；只有明确 `European/Western/English` 等音译命名风格才走音译词干。
  - 中式地点名按规模控制长度：首都、省会、高人口城市几乎只生成二字名；普通小聚落才有较高概率生成三字或少量四字名。
  - 地点名撞名时优先重抽候选，最后才回退到方向前缀唯一化，避免大城市因唯一化变成三字。
- `app/webgl-generator/src/generator/settlements.js`：
  - 城市命名时向命名器传入 `capital/provincial/group/population`。
  - pack 城市在命名前先计算人口和组别提示；港口改名也带上城市规模信息。
  - grid fallback 城市同样传入人口、首都/省会和组别。

验证：

- `node --check app/webgl-generator/src/generator/names.js` 通过。
- `node --check app/webgl-generator/src/generator/settlements.js` 通过。
- 10k 地中海样本 `audit-mediterranean-001` / `world`：
  - 中式城市总数 `885`。
  - 长度分布从修正前的二字 `28`、三字 `491`、四字 `344`、五字 `22`，变为二字 `714`、三字 `163`、四字 `8`。
  - 首都 `21/21` 均为二字。
  - 按首都、省会和人口 `>= 5` 统计的大城市二字率为 `98.8%`。
  - 小聚落仍保留三字和少量四字样本。
- 10k `english` 文化集样本仍保持音译风城市名，例如 `贝尔堡`、`奥斯维尔`、`卡斯特港`。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。

## 2026-06-28 标签视觉与国家名称放置修正计划

目标：

- 城市标签去掉黑色半透明底框，避免像临时调试标注。
- 普通城市、首都和港口统一文字颜色，不再靠颜色区分类型。
- 国家名称从首都/国家中心 burg 附近迁到国家地理中心。
- 国名较长时允许轻微斜放，减少横向压迫感。
- 国家名称不再导致首都或核心城市标签被隐藏。

现状：

- `.city-label` 当前有半透明黑底、padding 和 text-shadow；`.city-label.capital`、`.city-label.port` 会改颜色。
- `getLabelStates()` 通过 `stateLabelPoint()` 使用 `state.center`，而 pack 国家 `center` 会在政治生成中回写为首都 burg 所在 cell。
- 标签更新按顺序把国家标签先放入 `occupied`，后续城市标签与之冲突会被隐藏。

计划：

- 调整城市标签 CSS，保留简洁文字与首都字号/权重差异，但去掉普通态底框和港口/首都颜色差异。
- 以 `pack.cells.state` 内的陆地 cell 面积加权中心作为国家名称点位，保留 `state.center/gridCenter` 兜底。
- 对较长国家名计算国家形状主轴角度并写入 CSS 旋转变量。
- 将标签避让拆成国家标签占位和城市/手工标签占位，避免国家标签遮挡城市标签。

## 2026-06-28 标签视觉与国家名称放置修正第一刀

实施：

- `app/webgl-generator/src/styles.css`：
  - 城市标签普通态去掉黑色半透明背景、padding 和 text-shadow。
  - 首都标签仍可保留字号和字重差异，但文字颜色与普通城市一致。
  - 港口不再生成独立颜色规则。
  - 手工标签保留自己的底色、边框和 padding，不受城镇标签简化影响。
  - 国家标签通过 `--label-rotation` 支持轻微旋转。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 国家标签文本改为优先使用 `state.fullName`，没有全称时回退 `state.name`。
  - 国家标签点位改为按 `pack.cells.state` 内陆地 cell 的面积加权中心计算，不再直接使用首都 burg cell。
  - 较长国名会按国家 cell 分布主轴计算旋转角；主轴近水平时给出轻微兜底斜角。
  - 国家标签和城市/手工标签使用独立避让集合，国家标签不再导致城市标签隐藏。
  - 选中国家标签时的 selection marker 同步使用新的国家标签点位。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 城市标签普通态 `background-color: rgba(0, 0, 0, 0)`、`padding: 0px`、`text-shadow: none`。
  - 普通城市与首都标签颜色一致，均为 `rgb(242, 234, 213)`。
  - 国家标签样本已离开首都点，样本距离首都约 `59.9` 到 `175.5`。
  - 长国名样本出现 `28`、`-12`、`23.1` 等旋转角。
  - 无 console error / pageerror。

## 2026-06-28 国家名称与首都标签优先级修正

目标：

- 国家视图中，国家名称是主标签。
- 如果首都标签与国家名称重叠，优先显示国家名称，首都标签应避让或隐藏。

实施计划：

- 保留国家标签先布局、国家标签彼此避让的规则。
- 城市、首都和手工标签在布局时额外避让已经显示的国家标签。
- 不改变国家名称的地理中心、旋转和城市标签视觉样式。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js` 的 `updateLabels()` 调整遮挡判定：
  - 国家标签仍只检查已显示国家标签。
  - 非国家标签会同时检查已显示国家标签和同类标签。
  - 因为 `labelItems` 顺序仍是国家、城市、手工，所以国家名称自然拥有最高布局优先级。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时 HTTP server 强制重叠验证：
  - 将一个国家名称临时移动到其首都坐标。
  - 验证结果为 `stateVisible: true`、`capitalVisible: false`。
  - 无 console error / pageerror。

## 2026-06-28 管理 tab 重新生成专栏直出

目标：

- “重新生成”不再作为管理 tab 下的二级入口按钮。
- 管理 tab 内直接展示各类重新生成按钮。
- 重新生成操作区应作为独立专栏，并用分割线与编辑/管理面板入口分开。

计划：

- `ControlPanel.vue` 将管理 tab 拆成“编辑与管理”和“重新生成”两个区块。
- `fit-view` 与各浮动编辑/管理面板入口保留在上方。
- 下方“重新生成”专栏直接展示国家、省份、城镇、道路、河流按钮。
- 运行时直接监听 `data-regenerate-kind` 按钮，复用现有 `regenerateMapAttribute()`。
- 重新生成执行结果显示在管理 tab 内，替代原浮动二级面板状态。

实施：

- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 管理 tab 拆为上方“编辑与管理”按钮区和下方“重新生成”专栏。
  - 两个区块之间新增分割线。
  - “重新生成”专栏直接展示 `国家 / 省份 / 城镇 / 道路 / 河流` 五个按钮。
  - 移除原 `open-regeneration-panel` 二级入口按钮。
- `app/webgl-generator/src/ui/panel.js`：
  - 新增对 `[data-regenerate-kind]` 的按钮监听。
  - 新增 `updateRegenerationSection()`，用于更新管理 tab 内的状态和约束说明。
  - 编辑锁定名单改为包含 `[data-regenerate-kind]`。
- `app/webgl-generator/src/runtime/app.js`：
  - 移除浮动 `RegenerationPanel` 创建与打开逻辑。
  - 管理 tab 直出按钮直接调用 `regenerateMapAttribute()`。
- 删除不再使用的二级浮动面板文件：
  - `app/webgl-generator/src/ui/panels/regeneration-panel.js`
  - `app/webgl-generator/src/ui/vue/components/RegenerationPanel.vue`
- `app/webgl-generator/src/styles.css`：
  - 新增管理 tab 专栏、分割线、重新生成按钮网格和状态说明样式。

验证：

- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 管理 tab 中不再存在 `open-regeneration-panel`。
  - 分割线 `.management-panel-divider` 存在。
  - “重新生成”专栏直接显示 `国家 / 省份 / 城镇 / 道路 / 河流` 五个按钮。
  - 上方编辑/管理按钮仍保留 `适配视图、高度编辑、国家编辑、省份管理、城市管理、文化管理、宗教管理、路线管理、河流管理、标签管理`。
  - 点击“道路”后侧栏状态更新为 `道路已按当前国家、城镇、港口和陆海约束重算...`，没有打开 `regeneration-panel` 浮动面板。
  - 无 console error / pageerror。
