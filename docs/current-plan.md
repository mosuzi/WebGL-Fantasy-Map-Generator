# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-15）**：当前唯一活动任务为第 335 项。当前固定顺序为 `335`。本项在独立分支 `codex/task-335-gpu-resident-views` 内按 335-A～J 分阶段实施；每个接受阶段各做一次本地中文 checkpoint 提交但不推送，全部阶段统一验收后才推送任务分支、合入并推送 `main`。第 53 项已移除，第 278 项已由第 279 项取代，其余既有完成状态见归档索引。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`328` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 7 / 1`；`328 / 328` 方法可通过 `info.describe` 发现，`analysis` 新增地点解析、距离和方位三项只读入口，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1228` 行、`covered 1154 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

- **权威任务第 335 项：GPU 常驻视图与零重编译切换。** `进行中；来源：用户要求根治 100k 视图切换端到端卡顿，不能再用 Worker 算法耗时冒充上屏性能`
  - **目标与边界**：坚持唯一长期 MapWorker canonical owner、单一地图写 operation owner、WebGL2 主画布和既有视觉 / picking / 回滚精度；普通颜色视图、主题、海底及不改变几何的图层切换不得再触发整图序列化、`regeneration.compute`、`render.prepare`、surface geometry 重建、全 overlay 替换或 picking 重绑。把当前烘焙为 `x/y/rgba` 的约 `105MB` 100k surface base 收敛为稳定几何、packed cell identity / side 与 GPU 常驻 cell attribute / palette；地图写入、撤销和重做只发布增量属性 / 拓扑失效。平滑边界保留独立几何语义，以边界 correction 或受控缓存切换，不能删图层、降精度、隐藏预热或放宽 LongTask 阈值。
  - **已知证据**：历史 100k fresh 路径总计约 `10.029s`，其中完整地图输入 `6.829s`、领域计算 `0.546s`、结果接收 `0.373s`、主线程渲染安装 `1.887s`；旧省份重生成 `9.529s` 中领域算法约 `1.346s`、Worker 渲染资料构建 `4.886s`、输出流 `1.073s`、主线程安装 `1.887s`。真正 WebGL draw 只约毫秒至几十毫秒，瓶颈是视图切换前的全图复制、CPU 渲染编译、解码、事务安装与 DOM 提交。第 334 项已让暖 100k 颜色视图约 `142～257ms`，但主题 / 平滑仍约 `0.59～1.16s`，cold / session 失效及旧开发服务混用没有被该热路径结果覆盖。
  - **阶段状态**：335-A～335-F 已接受并分别以 `0.3.17 / 0.3.18 / 0.3.19 / 0.3.20 / 0.3.21 / 0.3.22` 建立本地 checkpoint。固定 100k 暖普通颜色为 `101～186ms / 3` 输入包；revision 推进后的 cache 失效为 `5.02s`，session 丢失 cold 为 `21.07s / 1032` 包。B 已把正式 surface base 改为 `x/y/packed(cellId, side)` 的稳定 12-byte 几何；C 建立三张 cell texture 与五张 palette texture；D～E 让普通和政治颜色读取常驻纹理；F 让主题、海底、标签和缓存新鲜的路线等普通图层本地提交。固定 10k 的 F 响应为 `48.6 / 12.5 / 14.2 / 13.2ms`，同图 Worker / GPU framebuffer 逐像素差异为 `0`，四项 Worker、surface refresh、overlay replace、picking rebuild 与 LongTask 均为 `0`。当前唯一施工阶段为 335-G。
  - **实施阶段**：335-A 冻结 10k / 50k / 100k 的 cold、warm、revision 变化、session 丢失和快速切换分段账本；335-B 把 surface base 改为位置 + packed cellId / side 的稳定几何；335-C 建立 GPU cell attribute / palette store 与增量更新；335-D 把高度 / 生物群系 / 人口等普通颜色模式改为 shader 状态切换；335-E 把国家 / 省份颜色与政治 topology cache 解耦；335-F 把主题、海底和普通图层移出 Worker 渲染准备；335-G 收敛平滑边界 correction / cache；335-H 保持 overlay / city / picking identity，只按真实语义变化增量更新；335-I 实现 UI latest-wins、正式提交后高亮、页面 / Worker build handshake 与一次性会话自愈；335-J 完成冷热、故障、旧数据、视觉、真实用户标签页和 100k 统一终验。
  - **最小验收**：固定 100k 普通颜色视图 cold 首次 `≤150ms`、warm `≤50ms`，Worker 地图输入、`render.prepare`、surface geometry 构建、overlay replace 与 picking rebuild 均为 `0`；主题 `≤150ms`、海底 `≤100ms`、普通图层 `≤50ms`；平滑边界首次 `≤300ms`、重复 `≤100ms`。全部入口单个主线程任务 `<50ms` 且 LongTask `0`，不继承既有 `≤200ms` 登记。首次点击、A→B→C 快速切换、切换中及切换后平移缩放、revision 前进、Worker 重启、撤销 / 重做、保存 / 读取和 WebGL context restore 后，控件、renderer、实际像素、标签、城市、路线 / 河流、选择 / 高亮、picking、PNG 必须同源。
  - **非目标与交付**：不修改 `source/`，不改变持久存档 schema，不开放冲突地图写任务积压，不恢复主线程地图重计算 fallback，不用后台隐藏预热换取表面成绩。每阶段只在当前任务分支建立一次本地 checkpoint 并同步递增 patch 版本；阶段 checkpoint 不推送、不合入 `main`。这是明显架构阶段升级，最终集成交付评估升至 `0.4.0`，全部阶段统一验收后才推送、合并和归档。详细设计与阶段冻结见 [`task-notes/task-335-gpu-resident-view-switch.md`](./task-notes/task-335-gpu-resident-view-switch.md)。


## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
