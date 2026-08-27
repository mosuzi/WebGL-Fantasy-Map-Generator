# 第 362 项：独立验收阻断闭合

## 权威输入与停止门

- 唯一真实存档：`C:\Users\mosuzi\Downloads\krichars (3).webfmg`。
- SHA-256：`CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 目标身份：`100000 grid / 43419 pack / 1251 cities / 442 routes / 7976 segments`。
- 当前分支：`codex/task-362-independent-acceptance-blockers`，顺序建立在第 361 项完成提交上；`main` 保持不动。
- 最终停止门：原第 359、360、361 项验收者分别重新采证并全部返回 `ACCEPT`；任一 `BLOCK` 即停止合入。

## 三阶段冻结矩阵

| 阶段 | 目标 | 最小验收 | 非目标 | 唯一写者 | 首个廉价门 |
| --- | --- | --- | --- | --- | --- |
| 362-A | 消除真实存档 ready 后后台期 `>200ms LongTask`，补齐 revision / 200ms 开发诊断 | 指定存档五轮冷导入及 ready 后观察窗无 `>200ms` 产品 LongTask；identity / revision 稳定 | 不缩短观察窗，不放宽阈值 | 主线程 | health / 导入调度专项 |
| 362-B | 恢复道路独立浏览器验收可执行性并消除历史动作阻塞 | 使用可用受支持浏览器从正式 UI 导入；两个入口、锁、undo / redo、错误面真实执行，目标动作窗无 `>200ms` 阻塞 | 不为单纯浏览器后端缺失改道路产品，不扩大到其它领域刷新 | 主线程 | 浏览器选择、正式导入入口与道路历史专项 |
| 362-C | 消除平滑开关 `>200ms LongTask` 并固定像素坐标 | smooth / hard 同态精确一致、异态可分；目标窗无 `>200ms` 产品 LongTask | 不以 canonical 代替像素，不放宽 shoreline | 主线程 | GPU resident 边界切换专项 |

## 已知独立阻断

1. 第 359 验收五次绝对加载门通过，但第 5 轮 ready 后约 `2.84s` 出现 `278ms` 产品 LongTask；验收环境不能排除 `201～249ms`，也没有直接回读 revision。
2. 第 360 验收静态门通过；首次 file chooser 失败后 blocker-only 复查被强制指定的 IAB 后端不可用，两个正式入口没有实际执行。
3. 第 361 验收已证明 smooth / hard 各自同态稳定，但截图坐标缩放漂移阻断首次 smooth 与 off→on 的直接等式；开关窗另有 `573.3ms` operation stall、`603.3 / 603.5ms` input stall 和 `603ms` LongTask。

## 验收约束

- 三名验收者不得复用实现期结论、旧截图或旧性能数字，只能复用唯一文件路径、哈希、正式 UI 入口和冻结门。
- 浏览器由 Browser 技能按当前可用后端选择；用户没有指定 IAB，不再人为锁死不可用后端。
- 像素证据固定 viewport、device scale、页面缩放和地图裁剪，在同一浏览器会话内以同一坐标系采集；发生坐标漂移即 `BLOCK`。
- 详细 trace、截图和长日志写入 `Z:\tmp\codex\2026-08-27\task-362-acceptance-blockers`，不得写入仓库。

## 第一轮原验收者复测归因

1. 第 359 验收者误用 Vite 开发服务器，五轮 `6334 / 6473 / 6600 / 6708 / 7067ms` 的实际中位数为 `6600ms`，虽然报告正文写了 `ACCEPT`，按冻结门必须判为 `BLOCK`；正式口径应为全新 production build / preview。
2. 第 360 验收者完整执行了指定存档正式 UI、锁和身份门，功能正确，但 undo / redo 各有约 `4～4.5s` LongTask，因此明确 `BLOCK`。
3. 第 361 验收者确认稳定后的 smooth / hard 视觉可分且各自同态稳定，但首次 smooth→hard 仍现场构建硬岸线，产生 `541.5ms` line build、约 `603ms` LongTask；另有 H1 截图后端超时和硬编码请求尺寸与实际页面尺寸不一致，故 `BLOCK`。

## 主线程冻结结果

### 362-A：加载与可观测性

- 产品 LongTask 门由 `250ms` 收紧为 `200ms`；开发模式运行时摘要直接显示 `地图版本` 与 `LongTask 门`，结构化运行时统计同步暴露 revision 与实际阈值，独立验收不再需要从间接绑定推断。
- `map-ready` 后不再后台导入尚未使用的 Vue 面板模块；这些面板保留按需加载，预加载账本明确记录 `on-demand`，避免 ready 后观察窗被无关模块解析污染。
- 主线程在最新 production build / preview 使用唯一真实存档从正式文件入口复验，应用内导入 trace 为 `4470ms`，身份恢复为 `100000 / 43419 / 1251 / 442 / 7976`，revision 为 `imported:1 / r0`，LongTask 门为 `200ms`。这只是送审前自检；五轮冷导入仍由原第 359 项验收者独立执行。

### 362-B：道路验收环境、历史刷新与共享边校验

- 复测简报改为由 Browser 技能选择当前可用受支持浏览器，必须使用 `控制面板 → 简介 → 导入` 的正式文件入口；file chooser 或某一浏览器后端不可用只允许切换到另一受支持后端，不得把静态夹具通过冒充道路 UI 验收。
- 第一轮独立复测证明路线重生成、锁、身份和 undo / redo 正确，但 undo / redo 各产生约 `4～4.5s` LongTask。根因是道路历史仍复用全领域刷新清单，并在输入事件返回前立即启动大写集地图副本捕获。
- 道路历史现只刷新 `route-mesh / route-picking / object-panels`；renderer 只重建路线拾取段，地图副本捕获延迟到下一事件循环开始。指定存档正式入口 `442 / 7976 → 273 / 3645`，撤销恢复 `442 / 7976`，重做回到 `273 / 3645`；两次历史动作健康列表均为“暂无健康事件”，mutation 为 `0.3ms`，revision 连续推进至 `r3`。
- 附加浏览器门发现两条锁定路线共享同一条边时，生成器会稳定沿用既有 owner，但 Worker 校验器错误地要求遍历末项为唯一 owner。校验现验证“owner 必须属于覆盖该边的锁定路线候选集合、双向镜像相等、cell / edge 集合完整”，不再破坏稳定 owner。目标浏览器复验通过：共享边 `route #0 / #1` 均保留、owner 保持 `0`、history `+1`，health / console / page error 均为 `0`。

### 362-C：疆界切换

- 平滑边界切换不再调用默认全量 `draw()`，而以 `updateDynamicBuffers: false / updateOverlay: false` 只重绘已提交 GPU 内容，避免边界显示偏好牵连道路、河流和 overlay 动态缓冲。
- 指定存档导入在 `map-ready` 前一次准备 smooth / hard 两套岸线 resident 资源，首次关闭平滑不再把约 `541.5ms` 的硬岸线构建留给交互事件。
- 显示结果与开发摘要改用轻量 `getDisplayState()` 和四个定点 stat 锚点，不再因一次边界开关构造完整 renderer stats；开发模式在慢操作中显示 control / preferences / renderer / panel / result 及 surface / line / draw 分段。
- 最新 production build / preview 冷导入后的真实开关分段为 `surface 0.1ms / line 0.4ms / draw 0.9ms`，连续操作没有 `operation-stall`、`input-handler-stall` 或 `main-thread-long-task`，终态为 `hard / canonical`、edge fade 关闭、WebGL error `0`。像素等式与实际稳定坐标截图仍只由原第 361 项验收者裁决。

## 送审前门禁

- `pnpm run regress:independent-acceptance-blockers`
- `pnpm run regress:panel-load-recovery`
- `pnpm run regress:boundary-presentation`
- `pnpm run regress:render-preparation`
- `pnpm run regress:regeneration-lock-city-route`
- `pnpm run regress:settlement-route-identity`
- `pnpm run regress:regeneration-user-copy`
- `pnpm run regress:regeneration-lock-city-route-browser`
- `pnpm run typecheck:core`
- `pnpm run build:app`
- `git diff --check`

上述任务门均已通过；`regress:regeneration-lock-city-route-browser` 的首次首败为共享边 owner 校验漂移，完成最窄修复后的唯一目标复验通过。另行扩大尝试的 `regress:features-networks-resources-core-protocol` 在未触达本次路线断言前，停在既有 Feature 锁引用夹具的 `Missing expected exception`（脚本第 285 行）；本项未把该超范围夹具结果冒充通过。

## 第二轮独立复测与阻断

1. 第 359 验收者使用 fresh production build / preview 连续五轮，得到 `6868 / 6867 / 6680 / 6707 / 6557ms`，正确中位数 `6707ms` 超过 `6000ms`，故 `BLOCK`。单轮诊断把 `6598ms` 拆为主 Worker `3918.2ms`、prepared install `533ms`、overlay reveal `613.9ms`、panel refresh 约 `296ms`，另有约 `586.4ms` 未命名阶段交接；身份、revision、Loading、WebGL 和四类目标健康事件均通过。
2. 第 360 验收者确认无锁 `442 / 7976 → 273 / 3645`、加锁 `442 / 7976 → 83 / 1230` 及锁 owner、端点、城市、undo / redo、错误码和健康窗均正确，但 redo 后拾取桶仍残留已删除路线：无锁 `169 ids / 2055 bucket segments`，加锁 `359 ids / 4039 bucket segments`，故 `BLOCK`。
3. 第 361 验收者在实际 `2215×1073` 页面、`2492×1207` backing、DPR `1.125` 的统一坐标下证明 `F0 = F1` 与 `H0 = H1` 都为 `0` 像素差，smooth / hard 差异为 `263430 / 2376695`（`11.083879%`）；首次关闭平滑的产品分段为 `0.1 / 0.8 / 3.6ms`，健康、revision、edge fade 与 WebGL 门通过，结论 `ACCEPT`。

## 第二轮阻断修复

- 路线 redo 不再拿“当前路线 ID”做局部删除；`rebuildRoutesInPickingIndex` 会先清空全部 bucket route segments，再只从当前路线全集重建。专项 Node 反例从 `3` 条旧路线缩减到 `1` 条后，全部 bucket 只允许 route `#0`；浏览器道路门新增 after / undo / redo 三态拾取审计，结果分别为 `95 / 715 / 0`、`134 / 1009 / 0`、`95 / 715 / 0`（routes / bucket segments / stale segments）。
- 导入安装继续在每个短阶段让出主线程，但后台标签页的 fallback 从通用 `120ms` 收敛为导入专用 `24ms`，避免 fit、overlay 和分批 reveal 每次空等 `120ms`。硬边界常驻构建直接复用已经封存的 `sourceEdges`，旧档缺少边源时才回退整图邻接扫描。
- 主线程在 fresh production build / preview 对唯一真实存档走三轮正式文件选择器预检，得到 `4759 / 4910 / 5086ms`，中位数 `4910ms`、最大 `5086ms`；三轮均为 `100000 / 43419 / 1251 / 442 / 7976`、`imported:1 / r0`，健康窗无 LongTask / operation / input / frame 告警。首轮应用 trace 为 `4700ms`，其中 Worker prepare `4140.2ms`，Worker 后约 `540ms`，overlay reveal `104.7ms`。
- 最终 `1406 modules` build 后另做一次不计入上述三轮的冷导入复核：文件选择器墙钟 `4820ms`、应用 trace `4783ms`，身份与 revision 同上，健康窗仍只有 `map-ready`。
- 同一指定档经正式 `控制面板 → 视图 → 平滑边界` 执行 off→on，产品终态 `smooth / canonical`、revision `imported:1 / r0`，边界刷新为 `surface 0ms / line 0.4ms / draw 0.8ms`，健康窗无新增告警。

扩大的旧 `regress:shoreline` 仍以历史固定 `lineTriangleCount >= 30000 / 25000` 判定当前六态 `11448` 为失败；该脚本六态 WebGL error 均为 `0`、切换为 `7.2～218.1ms`，且失败计数对 smooth / hard 完全相同，未触达本项新增的同态像素门。本项记录该首败，但不拿它替代第 361 验收者的实际坐标像素裁决。

本次代码变化使第 361 项上一份 `ACCEPT` 失效。原第 359、360、361 项验收者必须在新冻结候选上全部重新返回 `ACCEPT`；此前本项仍为进行中，且不得合入 `main`。

## 第三轮原验收者终验

1. 第 359 验收者 `ACCEPT`：fresh production 五轮为 `5392 / 5654 / 7056 / 5789 / 5343ms`，排序后中位 `5654ms`、最大 `7056ms`；五轮 identity / revision / Loading / WebGL 正确，导入窗和 ready 后观察窗 LongTask / operation / input / frame 健康事件均为 `0`。证据位于 `Z:\tmp\codex\2026-08-27\task-362-acceptance-blockers\359-retest-3`。
2. 第 360 验收者 `ACCEPT`：中央 / 专用 × 无锁 / 加锁四种组合全部实际提交并精确 undo / redo；十二个 after / undo / redo 相位逐一遍历 picking buckets，current routes 外 ID、stale segment、missing segment、wrong route reference 均为 `0`，bucket 唯一段数与当前 routes 和 index 摘要完全相等。锁 route / pack / endpoint / city 联合摘要不变，共享边 owner 保持 `0`，健康、console、WebGL 与错误码门通过。证据位于 `Z:\tmp\codex\2026-08-27\task-362-acceptance-blockers\360-retest-3`。
3. 第 361 验收者 `ACCEPT`：实际 `2215×1073` 统一坐标下 F0=F1、H0=H1 均为 `0` 像素差，smooth / hard 仍有 `263430` 像素（`11.083879%`）差异；sourceEdges hard 的海岸 / 湖岸段均为 `6328 / 190`，无丢边、重复描边或语义改变。首次关闭平滑为 `0 / 0.6 / 4.6ms`，目标窗四类健康事件、console 与 WebGL 均为 `0`。证据位于 `Z:\tmp\codex\2026-08-27\task-362-acceptance-blockers\361-retest-3`。

三份终验均复核同一冻结 manifest `5736B2132905237C482CDE9BCBE7EBE5D70741D1DB95F6406B0E37A4D15BF866`，首个产品阻断均为“无”。第 362 项达到停止门，可以归档、提交任务分支并 fast-forward 合入 `main`。
