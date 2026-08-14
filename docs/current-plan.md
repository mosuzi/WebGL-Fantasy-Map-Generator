# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-14）**：当前唯一未归档任务为第 334 项，独立分支为 `codex-task-334-worker-end-to-end-latency`。当前固定顺序为 `334`；本项先冻结 100k 端到端证据，再按“显示事务 → 存档输出 → 存档读取”的顺序实施，不得以回退主线程、开放冲突操作或降低地图 / 渲染质量换取表面提速。第 53 项已移除，第 278 项已由第 279 项取代，其余既有完成状态见归档索引。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`328` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 7 / 1`；`328 / 328` 方法可通过 `info.describe` 发现，`analysis` 新增地点解析、距离和方位三项只读入口，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1228` 行、`covered 1154 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 权威任务第 334 项：收敛 100k Worker 端到端延迟与画布假死

- **状态**：进行中。第 333 项已经解决跨任务全图重复输入和存档体积，但没有证明 100k 保存、读取与显示操作达到可用响应；用户实测“显示海底”、切换视图 / 图层、保存 / 读取仍慢，Worker 计算期间画布也呈冻结观感。本项坚持 Worker 化，不恢复重计算主线程路径；冲突地图操作继续由单一 operation owner 拒绝或串行化，不允许积压多个写任务。
- **A——证据与交互边界**：固定 10k / 100k，分别测首次 / 暖保存、文件导入、浏览器恢复、显示海底开关、颜色视图和代表性图层开关。必须按绝对时间拆出 Worker 输入、计算、输出、主线程 decode、prepared install、DOM style / layout、draw、RAF / event-loop heartbeat、LongTask / LoAF、包数与字节；区分“冲突控件被锁”与“页面事件循环 / 最后已提交画面停止刷新”。没有证据不得把问题统称为 Worker 慢或全图传输。
- **B——显示事务最小化**：为显示选项、颜色视图和图层开关建立精确 effect / layer 矩阵。纯 uniform / visibility 动作不得启动完整 `render.prepare`；局部颜色变化只准备受影响的 surface ranges / segments；`显示海底` 只更新海域相关呈现，不重建无关 surface、line、point、label、political、route 或 picking。确需 Worker 的派生仍在 Worker 完成，主线程只作有界 decode 与原子安装。Worker 运行时可以继续呈现最后一次已提交画面和 Loading 帧，但不得接受冲突地图写入、相机 / 编辑队列或并行重生成。
- **C——保存与读取链**：首次保存可建立一次长期 canonical 副本，暖保存继续只传版本 / patch；不得用后台预热隐藏首轮成本。`.webfmg v3` 保存分离 snapshot、encode、compress、storage，读取分离 storage、decompress、decode / migrate、canonical handoff、render prepare、主线程 materialize / install。优先减少读取结果中重复图结构和数千小包，使用现有分区与 transferable buffer 传递紧凑列；不得借兼容层再次构造完整 JSON 图，也不得放弃旧 v1 / v2、JSON、gzip、base64、LocalStorage / IndexedDB、File / Blob 和云端存档兼容。
- **D——一致性与性能验收**：10k / 100k 的地图 checksum、history、selection / highlight、camera、renderer map / revision、surface / point / line / route / picking / overlay、旧存档和失败回滚必须同源。代表性 100k 显示动作和存档链须给出相对第 333 项冻结基线的分段与总耗时改善；Worker-only 计算与 yielded transport 窗不得出现未归因 `LongTask`，RAF / heartbeat 必须持续，冲突操作仍明确拒绝且队列不增长。非性能 health、应用 console / page、WebGL、Loading 残留为 `0`。
- **阶段与非目标**：内部阶段固定为 `A 证据冻结 → B 显示 effect / renderer suspension 收敛 → C 存档输出 / 读取 transport 收敛 → D 双档真实验收`。不修改 `source/`、Wiki、用户 Chrome 或用户地图；不开放 Worker 期间的冲突编辑 / 重生成，不以 main-thread fallback、阈值放宽、延迟 Loading、删图层、降低标签 / picking / GPU 精度或只优化测试夹具冒充完成。



## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
