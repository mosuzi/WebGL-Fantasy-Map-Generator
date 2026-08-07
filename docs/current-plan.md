# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-08）**：权威任务第 301 项进行中，用于纠正第 300 项未覆盖的 100k 高度笔刷“停手后整画布卡顿”问题。第 300 项的提交 trace 从末点补刷之后才开始，不能代表完整 pointerup 到下一帧链；本项已补齐完整生命周期证据，并完成默认“同水陆侧岸线笔刷”的局部颜色刷新。故意跨越海平面的拓扑变化仍单独保留为封闭后续边界，不接管或刷新用户当前 Chrome 标签页，不修改 `source/`、地图 schema 或存档语义。其余既有完成状态见归档索引。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`322` 个公开方法和 `179` 个编辑方法，稳定等级为 `314 / 7 / 1`；`322 / 322` 方法可通过 `info.describe` 发现，新增 `grid` 六个受控结构摘要、快照、预检与事务方法；`planner.listRecipes / getRecipe` 只读公开 `10` 个配方和 `43` 个顶层步骤，`objects` 覆盖 `20` 类对象，`cells` 已提供八个读取、定位、扫描与动作预检方法。完整能力矩阵为 `1213` 行、`covered 1139 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵为 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 第 301 项：100k 高度笔刷停手后完整主线程阻塞与最终绘制修复（进行中）

- 目标：解决用户实测的高度涂抹结束后约 `500～1000ms` 整画布卡顿，补齐 pointerdown、连续 pointermove、待执行 RAF、pointerup 末点补刷、历史提交、最终视觉帧和浏览器长任务的完整证据链。
- 初始证据：第 300 项 trace 在 `flushScheduledHeightBrush` 之后才创建，漏记末点补刷；当前精确 `http://127.0.0.1:5410/?debug=1` 标签页的真实长路径触发了 `input-delay`、`main-thread-long-task`、`render-frame-gap`，阻塞期间撤销按钮的 CDP 点击也超时。隔离 100k 生产页实际 `99846` cells 的普通提交 trace 仅 `13.9～18.6ms`，但真实岸线 cell 样本的 `pointerup` 为 `6969～7178ms`，`refreshHeightCells` 为 `6951.7～7161.8ms`，并触发 `6968～7177ms` 长任务和同等帧间隙；旧指标不能解释用户体感的根因已闭合为岸线 / 水陆拓扑刷新分支。
- 301-A：先记录完整 pointer 生命周期、首次索引构建、末点补刷、事务、draw、overlay、长任务、输入延迟、帧间隙和恢复时间；区分真实应用耗时与自动化拖动传输耗时。
- 301-B（已实现，待统一收尾）：为岸线 surface correction / cover 建立 cell → GPU buffer span 索引；同水陆侧变化只更新受影响的颜色 buffer，只有 `storedSide !== currentSide` 才进入完整拓扑刷新。隔离生产 Chrome 的 100k 岸线样本触碰 `58` 个 cells，停手墙钟约 `43.4ms`、提交约 `10.4ms`；10k / 100k 正式回归均断言不进入完整拓扑重建且通过。
- 301-C（明确边界，未实施）：故意将真实岸线陆地 cell 跨过海平面，`21` 个 cell 发生水陆侧变化时仍会触发约 `7207ms` pointerup，其中 `rebuildCellVisualMesh` 约 `2325ms`、`rebuildShoreVisualCache` 约 `4377ms`。该路径必须另行设计可取消且视觉正确的局部拓扑更新，不在 301-B 中静默使用陈旧几何。
- 301-D：若首次使用的 `height-cell-spatial-index` 或 `__heightEditorPackCellsByGrid` 构建达到卡顿门槛，单独预热或改为受控增量建立；不得把 100k 全图索引构建塞回 pointerup。
- 最小验收：当前用户标签页只读核对且测试改动可撤销；隔离 10k / 100k 的真实 pointer 操作记录完整停手 p50 / p95 / 最大值、长任务、输入延迟、帧间隙、heap、draw / overlay / surface 次数、checksum、撤销 / 重做、console、page、health 和 WebGL；普通样本停止后不再出现 `500ms+` 主线程阻塞。
- 回滚与影响：只回退第 301 项 telemetry / 调度优化；不修改地图数据、schema、存档格式、公开 API、生成算法、派生 stale 语义或 `source/`。

## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
