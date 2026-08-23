# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-23）**：第 351 项的 binding 窄修、十二类 GPU 快切与 latest-revision 后台预热已完成；固定 10k / 100k 正式构建验收通过。唯一任务分支为 `codex/task-351-view-switch-repair`，仍不得合入 `main`；当前只剩推送任务分支并在用户精确预览标签页对应的新部署上完成最终受控复核。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`329` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 8 / 1`；`329 / 329` 方法可通过 `info.describe` 发现，`analysis` 保留地点解析、距离和方位三项只读入口，`debug` 新增本任务专用的实验性 context-loss 验收桥接，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1229` 行、`covered 1155 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 权威任务第 351 项：修复 100k 视图切换失败并完成全视图 GPU 快切与后台预热 `进行中`

- **来源与现场**：用户在精确 Chrome 标签页 `https://preview-fmg.mosuzi.top/` 的 100k 当前地图实测：高度 / 生物群系 / 人口 / 国家 / 省份五类视图首次切换仍出现约 `2～3s` Loading，其余七类视图不能正式切换。只读现场确认最终仍回滚到 `height`，health 两次记录 `operation-failed：surface 颜色补丁与正式资源 owner 不属于同一受控 revision`，并存在 `2099.9 / 2264.7 / 2488.5ms` frame gap。
- **最终目标**：修复 deferred display 把原位 `cell-colors` patch 错发为 replacement generation 的产品错误；十二类颜色视图全部通过 GPU 常驻 attribute / palette 快切；地图装载或正式数据提交后，以最新 `mapIdentity + sourceRevision + topologyRevision + renderGeneration` 为键在独立、可丢弃的 ComputeWorker 中低优先级预热仍需几何计算的共享缓存。新 revision 到来时清空未开始队列、协作取消或拒绝正在运行的旧结果，只为最新版本重算，不占用或终止长期 MapWorker。
- **硬不变量**：不得放宽 surface owner、binding、checksum、revision、topology 或 WebGL context 校验；不得让 Worker 直接接管正式 WebGL context；后台预热不得阻塞 map-ready、显示普通 Loading、重建 picking / overlay 或静默安装陈旧结果；用户前台显示、编辑、撤销 / 重做、生成、保存和导入优先于后台任务。
- **351-0——产品阻断窄修**：在决定 `replaceResources` 和发放 render binding 之前确定 deferred `surfacePatchScope`；原位颜色补丁保持同一 render generation，完整 surface replacement 才推进 generation。补真实 `display → cell-colors → prepared installer` 正例及 identity / revision / topology / generation 负例。
- **351-1——十二类 GPU 常驻快切**：保留现有高度 / 生物群系 / 人口 / 国家 / 省份路径；温度 / 降水读取 numeric texture，文化 / 宗教读取既有 identity + palette，区域使用整数 identity + palette，政体使用 state→government palette，外交使用当前 subject 对应的 state relation palette。普通颜色切换必须为 Worker input `0`、`render.prepare=0`、surface geometry rebuild `0`、picking rebuild `0`。
- **351-2——最新 revision 后台预热**：只预热岸线 correction、政治路径等仍需 CPU 几何的共享资源，不生成十二套完整 surface。队列单并发、前台抢占、尾随防抖；queued 旧项立即丢弃，running 旧项在安全 checkpoint 协作取消，无法即时中断时只允许算完后拒绝安装，不得终止并丢失长期 MapWorker 副本。
- **351-3——分级终验**：静态与专项 Node 通过后，依次运行小数据真实入口、固定 100k、快速 A→B→C、数据 revision 前进、撤销 / 重做、换图、Worker 重启与 context restore。最终必须在用户精确预览标签页对应正式构建上确认十二类逐项成功、控件 / renderer / 像素 / picking 同源、Loading / application / page / health error / WebGL error 为 `0`。
- **当前证据**：专项 scheduler 证明 running 旧 revision 被 abort、旧结果安装数 `0`、仅最新 revision 接纳，queued 前台抢占不启动；固定 `10004 / 99846` cells 的十二类 cold 分别为 `13.0～26.2ms / 15.5～29.1ms`，warm 为 `12.7～16.3ms / 15.4～19.2ms`。每项 Worker input/output、surface/line/picking/labels rebuild、LongTask、application/page/health/WebGL error 与 Loading 残留均为 `0`。本地门已完成，精确预览标签页复核待新部署。
- **性能门**：固定 100k 十二类普通颜色视图 cold `≤150ms`、warm `≤50ms`；单个主线程任务 `<50ms`、LongTask `0`。若现有硬件真实 draw 下限证明 cold `150ms` 不可达，首败即停并提交分段证据，不得先放宽阈值。后台预热不计入 map-ready，前台请求须在一个协作 checkpoint 内取得优先权。
- **非目标**：不修改地图生成算法、存档 schema、地图 canonical 数据、对象数量、视觉配色语义、`source/`、Wiki 或用户当前地图；不以删除平滑边界、图层、标签、picking、回滚或严格 owner 门换取性能。
- **阶段与证据**：详细冻结矩阵、根因、文件边界、门禁与 checkpoint 记录见 [`task-notes/task-351-view-switch-repair.md`](./task-notes/task-351-view-switch-repair.md)。主线程为唯一写者，不启用四级流程和子智能体。


## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
