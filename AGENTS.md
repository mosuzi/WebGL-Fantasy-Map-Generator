# Codex 接手说明

这个文件是后续 Codex 智能体进入本项目时必须先读的固定入口。用户已经明确要求：所有文档使用中文描写；代码只添加必要注释；所有计划和开发历史要及时写入文档，方便新智能体复用上下文并追溯决策。

## Goal mode execution policy

- 已批准的编号计划视为封闭范围。
- 每项达到其最小验收条件后，必须立即转向下一项。
- 不影响当前验收的重构、精修和新发现，只记录，不实施。
- 不得自行扩展完成标准。
- 全部必需任务完成后必须停止，不得创造后续工作。
- 遇到范围歧义、需要产品决策或重复失败时，停止并询问用户。

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
- 关键文档：
  - `docs/README.md`：docs 目录结构和文档放置规则。
  - `graphics-reimplementation-plan.md`：早期图形化重实现分析，已被新复刻计划取代，仅作参考。
  - `docs/plans/gl-reimplementation-acceptance-plan.md`：独立 WebGL 地图生成器复刻可验收计划。
  - `docs/current-plan.md`：唯一权威任务清单、执行状态和最小验收口径；其它文档不得另建当前待办。
  - `docs/development-log.md`：开发历史与决策记录。
  - `docs/performance/performance-baseline.md`：第 0 里程碑 profiling 工具说明。
  - `docs/milestones/milestone-1-webgl-prototype.md`：第 1 里程碑 WebGL cells 原型说明。
  - `docs/performance/webgl-svg-performance-comparison.md`：WebGL 原型与 SVG 基线性能对照。
  - `docs/audits/source-generation-audit-and-rectification-plan.md`：source 生成算法重新审查和正式应用生成质量整改方案。
  - `docs/task-notes/README.md`：专题计划、评估记录和执行细则索引。
  - `docs/task-notes/editor-and-stat-panel-inventory.md`：正式版编辑器与统计面板清单，记录各领域面板职责、优先级和暂缓范围。
  - `docs/generated/` 下的报告、截图和 baseline 是本地可复现产物，默认不作为接手必读文件。

## 提交约定

- 后续所有 Git 提交记录必须使用中文，包括 commit 标题和正文；除非用户明确要求，否则不要再使用英文提交信息。

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

正式应用已经跨过早期占位原型阶段。权威任务第 28～52、54～218 项已完成，第 53 项按用户决定移除；当前没有活动权威任务。第 207～210 项已经闭环第 204 项冻结的 inspector、碎片事务、缺失游戏规则和 AI 配方；第 211～216 项已经完成 Q-28～Q-33 交互整改及管理 Tab 编辑弹框高度预算；第 217 项统一城市人口规模与行政角色表达，第 218 项在最终人口形成后确定性重评省会。当前公开 API 为 `16` 个命名空间、`305` 个方法和 `176` 个编辑方法，稳定等级为 `297 / 7 / 1`，逐方法描述为 `305 / 305`，对象查询覆盖 `20` 类。完整能力矩阵为 `1173` 行、`covered 1100 / excluded 73 / deferred 0 / gap 0`；复合语义矩阵为 `79` 个动作、`69` 个完整事务与 `10` 个玩法配方，`305` 个公开方法全部完成分类，结构缺口为 `0`。第 205 项锁仓分母继续保持 `14 / 15 / 22`、双向差集 `0`；第 218 项另覆盖城市 / burg / 省份范围锁、路线锁、手工行政标识与共享 grid 冲突的原子保护。正式加载页继续使用旧纸自卷画轴和指定 PNG 印面；独立 prototype 继续作为视觉基线。批准范围统一查看 `docs/current-plan.md` 的“权威任务清单”；README、专题文档中的“下一步”只作候选或历史语义，不能覆盖权威清单。

第 216 项代码、机器门禁、独立复核与第 211～216 项统一 Chrome 验收均已完成；复核提出的 `safeTop` 生命周期、异步内容重排、低位入口空白误算、共存布局、精确锚点与离屏锚点均已限修。普通 / 150% 字体六档矩阵 document 溢出为 `0`，管理主面板和二级弹框均在安全区内且正文可滚到底，焦点视觉一致，application console、page 与 WebGL error 为 `0`。

第 217～218 项代码、专项、兼容矩阵、生产构建、两组独立复核与系统 Chrome 验收均已完成。省会重评在新图道路 / 标签 / 经济派生前自动运行，旧图只允许“预览 → 指纹确认”的显式单事务；`#150 / #284` 固定反例选择 `#284`，`10k / 50k / 100k` 与共享 grid 冲突样本通过，真实 Chrome 全量预览为变更 `0`、不变 `229`，主面板完整位于视口安全区且 application console error 为 `0`。

2026-07-30 发布前按用户要求由全新智能体再次验收。首轮动态复现发现区域人口增减 / 转移有 `6` 个城市规模差异、国家合并有 `28` 个差异，并补出新建国家改变 P90 后既有城市未刷新的写入面；现已集中到共享规模 / 自动视觉刷新及字段存在性快照，角色字段不再覆盖人口规模。原样复跑差异均为 `0`，新建国家、手工视觉、撤销 / 重做、故障回滚、旧图缺字段、生产构建、完整能力矩阵和复合语义均通过，两路终轮复核为 `ACCEPT`。系统 Chrome 5410 的既有旧图预览为变更 `214`、拒绝 `21`，有拒绝项时确认禁用，取消后清空，application console、page 与 WebGL error 为 `0`。

2026-07-30 用户截图纠正了 debug 工具栏验收口径，并进一步明确四个文字入口都不得内部折行：整条 `.map-toolbar-actions` 必须单排，“控制面板 / 适配视图 / 测量 / 开发模式”也必须各自完整单行。当前四项均按内容宽度分配，`294px` 以下仅按视口比例收紧字号、间距与内边距，不使用负字距、隐藏、裁剪或横向滚动；系统 Chrome 在 `480 / 390 / 320px` 普通与 150% 页面缩放六档中测得五个控件 top 差均为 `0px`、工具栏与 document 横向溢出均为 `0`。控制面板顶部七个 Tab 继续固定在正文滚动区之外，管理正文可滚到底且 Tab 位移为 `0px`，工具栏收展、开发入口和错误面均正常；最终独立验收为 `ACCEPT`。

以下内容是仍有参考价值的早期里程碑记录，不代表当前待办：

- 阅读 `source/Fantasy-Map-Generator` 核心结构。
- 编写图形化重实现总方案：`graphics-reimplementation-plan.md`。
- 完成第 0 里程碑外部性能基线工具：`tools/fmg-profile.mjs`。
- 编写第 0 里程碑说明：`docs/performance/performance-baseline.md`。
- 跑出可信 `10000/50000/100000` 三档性能基线：
  - `docs/generated/reports/performance-baseline-results.json`
  - `docs/generated/reports/performance-baseline-results.md`
- 开始并跑通第 1 里程碑最小 WebGL cells 原型：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/`
  - `docs/milestones/milestone-1-webgl-prototype.md`
- 整理第 1 里程碑 WebGL 原型与第 0 里程碑 SVG 基线对照：
  - `docs/performance/webgl-svg-performance-comparison.md`
- 将 WebGL 原型主接口收敛为 `GraphicsMapRenderer`：
  - `prototype/webgl-cells/src/renderer.js`
  - 保留 `CellWebGLRenderer` 兼容别名。
- 新增正式 WebGL 原型性能采集脚本：
  - `tools/webgl-prototype-profile.mjs`
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
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

第 1 里程碑历史原型摘要：

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

第 1 里程碑历史 WebGL 性能采集摘要：

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
2. `docs/README.md`
3. `docs/current-plan.md`
4. `docs/development-log.md`
5. `graphics-reimplementation-plan.md`
6. `docs/performance/performance-baseline.md`
7. `docs/milestones/milestone-1-webgl-prototype.md`
8. `docs/performance/webgl-svg-performance-comparison.md`
9. `docs/audits/source-generation-audit-and-rectification-plan.md`
10. `docs/task-notes/README.md`
11. `docs/task-notes/editor-and-stat-panel-inventory.md`

然后只按 `docs/current-plan.md` 的活动权威任务继续。第 217～218 项已完整收口，当前没有活动权威任务；不得从历史里程碑、README、FOLLOWUPS、矩阵缺口或专题文档的“下一步”自行创造实施任务。第 204 项全部缺口已经按第 207～210 项封闭顺序完成。规则事务继续遵守既有分层：`cells.inspectAction` 只负责空间 / 原子输入预检，领域 `inspect + execute` 才负责单事务游戏规则，AI planner 只编排多个已授权规则事务。第 195 项继续复用第 200 项现有 `info.describe`、schema registry 与 `objects.*`；独立 prototype 继续作为视觉基线。
