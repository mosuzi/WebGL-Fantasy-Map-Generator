# 第 300 项：100k 高度笔刷提交耗时分段与增量优化

## 当前状态

已完成。300-A 分段 telemetry 已完成，300-B 已按已证实的重复绘制热点完成最小优化；没有接管、刷新或写入用户当前 `http://127.0.0.1:5410/?debug=1` 标签页。

## 问题与初始证据

- 高度笔刷预览阶段已经使用 `refreshHeightCells(..., {deferTopology: true})`，主要写入被触碰的 grid / pack cell，并对 surface buffer 做局部更新。
- pointerup 会建立单条高度编辑命令，提交后标记 `features`、`rivers`、`routes`、`biomes`、`cities`、`states`、`provinces`、`religions`、`markers`、`zones`、`military`、`economy`、`diplomacy` 为 stale；这一步不是派生全链重算。
- 现有收尾路径还会默认更新高度面板；`summarizeCurrentHeightStats` 与 `buildCurrentHeightPreview` 都遍历全量高度数组。若触及岸线或跨过高度阈值 `20`，`refreshHeightCells` 会重建 cell visual mesh、shore cache 和完整 surface。
- 现有 renderer telemetry 能观察 `surfaceRefresh`、`lineRefresh`、`draw`、`bufferUpload`，但还没有把高度提交、面板统计、缩略图和拓扑分支分段记录，因此不能把某个具体函数的耗时当作最终事实。

## 300-A 实测结果

- 使用隔离生产构建和独立 Chrome 上下文，实际网格为 `10004`（10k）与 `99846`（100k）；用户当前 5410 标签页未刷新、未写入、未接管。
- 中心陆地短拖与连续长拖的提交样本均走 `refreshHeightCells` 增量路径，`incremental=true`，`surfaceRefreshDelta=0`，console、page、health 和 WebGL 错误均为 `0`。因此普通陆地笔刷抬手并没有遍历全图或执行高度派生全链。
- 100k 连续长拖的提交 trace 约为：`refreshHeightCells 0.7～0.9ms`、最终 `draw 3.9～4.7ms`、运行时面板刷新 `1.5～1.8ms`、拾取面板 `0.3～0.4ms`、高度统计 `0.5～0.6ms`、高度预览 `2.4～2.8ms`；命令收集、构造和历史执行接近 `0ms`。主要热点是最终绘制，其次是高度预览和面板收尾，不是 cell 单独写入或 Map 查找。
- 优化后的提交 trace：10k 长拖约 `6.2～6.4ms`，100k 长拖约 `10.2～11.0ms`；短拖包含首轮冷启动样本，100k 最大值 `26ms`。每次提交绘制次数固定为 `2`（预览期间绘制一次，提交后最终绘制一次），普通样本没有 surface / shore 拓扑重建。
- 独立高度派生横幅回归另观察到首次加载 10k 地图时约 `5.3s` 页面时间的一条 `main-thread-long-task`。这是加载阶段性能遥测，不属于高度 pointerup 提交；回归脚本已把应用错误与性能遥测分列，长任务仍会输出而不会被吞掉。

## 300-A：分段 telemetry 与隔离基线

### 目标

增加低开销、可查询的高度提交阶段计时，并在隔离系统 Chrome 中对照 10k / 100k，区分稳定热点和偶发 GC / 长任务。

### 允许改动

- 高度笔刷提交路径的内部性能记录。
- 现有 renderer performance event 汇总或对应的专用测试读取入口。
- 中文专项回归脚本和本专题报告。

### 禁止改动

- 不接管或操作用户当前标签页，不刷新、重生成或覆盖其地图。
- 不执行高度派生全链重建替代笔刷提交。
- 不修改 `source/`、地图字段、schema、存档、公开 API、历史事务语义或派生 stale 规则。

### 最小验收

每个样本记录：命令构造、grid / pack 写入、局部高度刷新、岸线 / mesh 分支、高度统计、高度缩略图、面板 DOM 更新、draw 的 p50 / p95 / 最大耗时；同时记录 pointerup 总耗时、长任务、heap、surface / mesh / draw 次数、checksum、撤销 / 重做和四类错误。

## 300-B：证据驱动的提交收尾优化

### 目标

只优化 300-A 明确占主导的阶段。优先消除 pointerup 路径的重复绘制；只有证实岸线 / mesh 分支占主导时，才另行设计局部拓扑更新。

### 最小验收

普通陆地笔刷不触发全量 surface / shore rebuild；跨海平面样本仍正确重建；10k / 100k pointerup p95、长任务和反馈延迟不回退；高度面板、预览、撤销 / 重做、地图 checksum、schema、存档兼容、console、page、health、WebGL 和真实视觉均通过。

## 300-B 已实施的封闭优化

- pointerup 先完成最后一批高度变更的局部 surface 更新，但禁止这次预览刷新立即 draw；高度编辑命令提交、历史执行和面板收尾完成后只执行一次最终 draw，消除 pointerup 路径的重复绘制。
- 改动只涉及内部计时、刷新调度和回归读取；grid / pack 高度写入、单事务历史、撤销 / 重做、派生 stale 标记、地图 checksum、schema、存档和公开 API 均未改变。
- 300-A 没有证明普通陆地样本的 shore / mesh 拓扑分支为热点，因此本项不实施局部拓扑重构；跨海平面与岸线分支保留原有安全路径，后续如需优化必须另立证据闭合的子任务。

### 回滚与影响

回退本项新增的 telemetry 与收尾刷新优化即可。不得改变地图数据、派生链顺序、schema、存档、API 或 `source/`。
