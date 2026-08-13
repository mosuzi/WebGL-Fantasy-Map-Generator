# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-13）**：当前未归档任务为无。当前没有可执行或暂缓的权威任务。第 53 项已移除，第 278 项已由第 279 项取代，其余既有完成状态见归档索引。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`328` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 7 / 1`；`328 / 328` 方法可通过 `info.describe` 发现，`analysis` 新增地点解析、距离和方位三项只读入口，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1228` 行、`covered 1154 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 331. 收敛 100k 重生成与存档耗时，并让 Loading 与真实阶段同源

- **状态**：进行中；独立只读调查与阶段 A～B 已完成，当前进入阶段 C。
- **用户目标**：100k 地图重新生成和保存到浏览器不能继续把十几秒耗时笼统显示为“正在计算 / 正在保存”；先以正式阶段计时锁定整图输入、领域计算、渲染安装、存档规范化、序列化、压缩和写入，再消除已经确认的重复工作。
- **阶段 A——阶段计时与用户文案**：普通 Loading 只显示“汇拢地图资料、推演新内容、收束结果、重整画面 / 收拢全图资料、压制存档、妥存至浏览器”等用户可理解阶段，不出现 Worker、线程、消息包、picking、IndexedDB、LocalStorage、buffer 或浏览器内部概念；调试模式和正式 operation / Worker telemetry 精确保留 input、domain compute、patch、render prepare、normalize、stringify、compress、package、output、storage 等标量时间，禁止伪进度。
- **阶段 B——保存链**：当前 live map 导出只做一次权威 JSON 序列化，gzip 直接消费同一文本或字节，不再在 normalize、正式 stringify 和压缩 helper 间重复遍历完整 100k 文档；浏览器大存档根据实际压缩体积直接以二进制写 IndexedDB，不先 base64、信封 stringify 或尝试注定超额的 LocalStorage。小存档仍可保持兼容路径，旧 plain / gzip-base64、LocalStorage、IndexedDB、`.webfmg`、JSON、旧 schema 和旧导出全部继续读取。
- **阶段 C——重生成链**：保持十一类领域计算、锁、取消、失败回滚、单历史、map / revision / generation token 和 prepared renderer 原子提交；优先复用同图 canonical map mirror，减少 fresh 操作的整图 graph 编码与近千包输入，随后按领域真实写集复用未变化的 picking / overlay / GPU 结果，禁止为提速删掉港口、城市、标签、路线、政治或交互语义。无法证明安全增量的图层必须回退到现有完整准备。
- **最小验收**：静态与专项 Node 必须覆盖单次序列化、压缩字节同源、二进制 IndexedDB、旧 base64 / LocalStorage / IndexedDB 往返、map mirror 陈旧拒绝和增量渲染 fail-safe；隔离 Chrome 真实验证 10k 与固定 100k 的重生成、连续保存、恢复、取消、故障、撤销 / 重做、Loading 时间线、LongTask、health、console、page、WebGL 和 Loading 清理。100k 保存报告必须分列 transport / normalize / stringify / compress / output / storage，重生成必须分列 fresh / reuse input、compute、render install，并与优化前 `16.3～18.8s` 保存和 `13.3s / 3.0s` fresh / reuse 代表基线对照。
- **非目标**：不修改地图生成结果、存档公开格式、API 数量、手工编辑、云端认证、PNG / GeoJSON 语义、用户当前 Chrome / 地图、`source/` 或 Wiki；不以提高 LongTask 阈值、假百分比、隐藏 health 或减少正式图层通过验收。
- **执行门**：使用独立分支 `codex-task-331-save-regeneration-performance`；前一轮只读调查计为本编号唯一中书舍人，主线程为唯一写者。内部按 `A → B → C → 集成冻结复核 → 最终真实入口验收` 推进，不为夹具、字段名或局部失败重复角色流程；浏览器首次失败后至多一次窄诊断和一次目标复验。


## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
