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
- 新增 `docs/performance-baseline.md`。
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
- 将 `docs/performance-baseline.md` 改写为中文。
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
- 使用 `--port 5300 --browser-channel chrome --cells 10000` 跑通烟测，生成 `docs/performance-baseline-smoke.json` 和 `docs/performance-baseline-smoke.md`。
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
  - `docs/performance-baseline-results.json`
  - `docs/performance-baseline-results.md`

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
- 新增 `docs/milestone-1-webgl-prototype.md` 记录实现说明、运行方式和当前边界。

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
- 更新 `docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md` 和 `AGENTS.md`。
- 新增 `docs/webgl-svg-performance-comparison.md`，记录 WebGL 原型与 SVG 基线的阶段性对照。

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
- 更新 `docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md` 和 `AGENTS.md`。

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
- 更新 `docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md`、`docs/webgl-svg-performance-comparison.md` 和 `AGENTS.md`。

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
  - `docs/webgl-prototype-profile-results.json`
  - `docs/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md` 和 `docs/webgl-svg-performance-comparison.md`。

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
  - `docs/webgl-prototype-profile-results.json`
  - `docs/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md` 和 `docs/webgl-svg-performance-comparison.md`。

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
  - `docs/webgl-prototype-profile-results.json`
  - `docs/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md` 和 `docs/webgl-svg-performance-comparison.md`。

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

按 `docs/gl-reimplementation-acceptance-plan.md` 的“步骤 1.1：demo 渲染器模块化”执行。本步只改 `prototype/webgl-cells/src/` 和项目中文文档，不修改 `source/`。

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

- 按 `docs/gl-reimplementation-acceptance-plan.md` 进入步骤 1.2：基础底图和 feature 图层。

## 2026-06-16：完成步骤 1.2 基础底图和 feature 图层

按 `docs/gl-reimplementation-acceptance-plan.md` 的“步骤 1.2：基础底图和 feature 图层”执行。本步只改 `tools/`、`prototype/webgl-cells/` 和中文文档，不修改 `source/`。

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

- 按 `docs/gl-reimplementation-acceptance-plan.md` 进入步骤 1.3：专题面图层。

## 2026-06-16：完成步骤 1.3 专题面图层

按 `docs/gl-reimplementation-acceptance-plan.md` 的“步骤 1.3：专题面图层”执行。本步只改 `tools/`、`prototype/webgl-cells/` 和中文文档，不修改 `source/`。

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

- 按 `docs/gl-reimplementation-acceptance-plan.md` 进入步骤 1.4：线图层。

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

- 按 `docs/gl-reimplementation-acceptance-plan.md` 进入步骤 1.5：点图层和高节点图层。
- 优先覆盖 `population`、`prec`、`burgIcons`、`markers` 等 SVG 节点压力较大的图层。

## 2026-06-16：步骤 1.5 点图层和高节点图层

本轮由“尚书”实施 `docs/gl-reimplementation-acceptance-plan.md` 的步骤 1.5。开工前执行 `git status --short`，确认工作区存在多人流水线既有未提交改动；本步没有回退或覆盖其他人的改动，也没有修改 `source/`。

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

- 按 `docs/gl-reimplementation-acceptance-plan.md` 进入步骤 1.6：文本和纹章 demo 策略。

## 2026-06-17：步骤 1.6 文本和纹章 demo 策略

本轮由“尚书”实施 `docs/gl-reimplementation-acceptance-plan.md` 的步骤 1.6。开工前执行 `git status --short`，确认工作区存在多人流水线既有未提交改动，且 `prototype/webgl-cells/data/sample-map.json` 仍有暂存区/工作区不一致状态；本步没有回退或覆盖其他人的改动，也没有修改 `source/`。

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
- `docs/current-plan.md`、`docs/milestone-1-webgl-prototype.md`、`docs/webgl-svg-performance-comparison.md`：
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
- `docs/gl-reimplementation-acceptance-plan.md`：重写为“WebGL 地图生成器复刻可验收计划”，删除接入源项目主视图、GL 模式替换原图层等旧路线。

下一步：

- 尚书从 `docs/gl-reimplementation-acceptance-plan.md` 的 **步骤 2.1：正式应用目录和运行时边界** 开始。
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
