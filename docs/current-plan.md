# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-14）**：当前唯一未归档任务为第 334 项，独立分支为 `codex-task-334-worker-end-to-end-latency`。B1、B2、C1、C2-A adoption 与 C2-B 紧凑 handoff 已闭合；C2-C 首个 checkpoint 已移除主线程 materialize 前的整容器连续拼接副本，并按 section 解码、逐步释放 handoff chunks，但主线程最终完整兼容地图尚未移除。下一步仍只实施 C2-C：收敛为 UI / renderer / GPU 与有界查询投影。最终架构只允许一个长期 `MapWorker` 持有完整 canonical map；其它辅助 Worker 不得持有完整地图或提交状态。不得以回退主线程、开放冲突操作或降低地图 / 渲染质量换取表面提速。当前固定顺序为 `334`。第 53 项已移除，第 278 项已由第 279 项取代，其余既有完成状态见归档索引。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`328` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 7 / 1`；`328 / 328` 方法可通过 `info.describe` 发现，`analysis` 新增地点解析、距离和方位三项只读入口，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1228` 行、`covered 1154 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 权威任务第 334 项：收敛 100k Worker 端到端延迟与画布假死

- **状态**：进行中。第 333 项已经解决跨任务全图重复输入和存档体积，但没有证明 100k 保存、读取与显示操作达到可用响应；用户实测“显示海底”、切换视图 / 图层、保存 / 读取仍慢，Worker 计算期间画布也呈冻结观感。本项坚持 Worker 化，不恢复重计算主线程路径；冲突地图操作继续由单一 operation owner 拒绝或串行化，不允许积压多个写任务。
- **A——证据与交互边界**：固定 10k / 100k，分别测首次 / 暖保存、文件导入、浏览器恢复、显示海底开关、颜色视图和代表性图层开关。必须按绝对时间拆出 Worker 输入、计算、输出、主线程 decode、prepared install、DOM style / layout、draw、RAF / event-loop heartbeat、LongTask / LoAF、包数与字节；区分“冲突控件被锁”与“页面事件循环 / 最后已提交画面停止刷新”。没有证据不得把问题统称为 Worker 慢或全图传输。
- **B——显示事务最小化**：为显示选项、颜色视图和图层开关建立精确 effect / layer 矩阵。纯 uniform / visibility 动作不得启动完整 `render.prepare`；局部颜色变化只准备受影响的 surface ranges / segments；`显示海底` 只更新海域相关呈现，不重建无关 surface、line、point、label、political、route 或 picking。确需 Worker 的派生仍在唯一长期 `MapWorker` 完成，主线程只作有界 decode 与原子安装。Worker 运行时可以继续呈现最后一次已提交画面和 Loading 帧，但不得接受冲突地图写入、相机 / 编辑队列或并行重生成。
- **C——唯一 canonical owner 与存档链**：计算、显示、生成、导入、保存、撤销与重做共用一个长期 `MapWorker` owner；不得让计算 / 显示 coordinator 各自保留完整地图，也不得在新图或导入后为首次显示、首次保存重新建立副本。新图直接在 owner 中生成，导入直接在 owner 中解析并 adoption；主线程只保留 UI / renderer / GPU、选择与面板所需的有界投影。保存由 owner 直接对 canonical section 编码 / 压缩，仅回传最终 transferable bytes；读取只回传紧凑 section handoff、渲染 buffers、picking 索引与小型 DTO，不回传或兼容重建完整 JSON 对象图。其它辅助 Worker 只能处理明确的不可变 section / buffer，不得持有完整地图、revision、history 或提交权。旧 v1 / v2、JSON、gzip、base64、LocalStorage / IndexedDB、File / Blob 和云端存档继续兼容，错误在替换当前地图前 fail-closed。
- **D——一致性与性能验收**：10k / 100k 的地图 checksum、history、selection / highlight、camera、renderer map / revision、surface / point / line / route / picking / overlay、旧存档和失败回滚必须同源。新图 / 导入完成后的完整 canonical map 长期 owner 必须恰为 `1`，完整地图再次输入为 `0`；旧格式迁移期只允许 owner 内部一次 materialize，生命周期结束前不得留下第二个长期镜像。代表性 100k 显示动作和存档链须给出相对第 333 项冻结基线的分段与总耗时改善；Worker-only 计算与 yielded transport 窗不得出现未归因 `LongTask`，RAF / heartbeat 必须持续，冲突操作仍明确拒绝且队列不增长。非性能 health、应用 console / page、WebGL、Loading 残留为 `0`。
- **阶段与非目标**：内部阶段固定为 `A 证据冻结 → B1 标量诊断 → B2 显示 effect / renderer suspension → C1 session / checksum 统一 → C2 生成 / 导入 / 保存 adoption 与紧凑 transport → D 双档真实验收`。不修改 `source/`、Wiki、用户 Chrome 或用户地图；不开放 Worker 期间的冲突编辑 / 重生成，不以 main-thread fallback、阈值放宽、延迟 Loading、删图层、降低标签 / picking / GPU 精度、普通 `postMessage` 全图克隆或只优化测试夹具冒充完成。



## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
