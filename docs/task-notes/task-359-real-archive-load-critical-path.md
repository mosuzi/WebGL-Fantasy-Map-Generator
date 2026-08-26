# 第 359 项：真实存档加载关键路径重构

## 任务契约

- 唯一完成输入为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 目标是绝对缩短用户从选择文件到地图可交互的时间，不再用相对百分比或传输量下降代替体验验收。
- 主线程唯一写者；任务分支计划为 `codex/task-359-real-archive-load-critical-path`。第 360、361 项文件与产品修复均不进入本分支。
- 临时 trace、profile、截图与矩阵放入 `Z:\tmp\codex\2026-08-26\task-359-real-archive-load-critical-path`，不写入 `docs/` 根目录。

## 已知基线与因果假设

本地正式页面同存档导入约 `12.55s`。窄 Profile 为：解析约 `1.79s`、Worker 渲染准备约 `4.68s`、adoption handoff 编码约 `0.88s`、主线程 handoff 实体化约 `1.76s`、`loadMapIntoRuntime` 安装与面板刷新约 `2.94s`。渲染准备中的 shore 约 `2.56s`、surface 约 `1.34s`；交接约 `71.2MB / 150 buffers`。

当前首屏请求只排除了 `cell-visual` 和 `gpu-shore-surface`，仍一次准备 shore、国家 / 省份路径、政治网格、surface、line、picking、labels、route、river 和 point。Worker 已持有解析后的文档，却仍把主线程所需地图编码为 adoption handoff，再由主线程分片实体化。以下是待 359-A 证明或推翻的假设，不是预先决定的修复：

1. 当前高度视图首屏等待了非当前视图或非首个交互所需的政治 / 路径 /面板资源。
2. adoption handoff 的编码与实体化是双 owner 架构下的可避免投影，不应继续借用完整存档编码形态。
3. prepared installer 同时解包、上传、揭示 overlay 和刷新全部对象面板，关键交互状态没有和后台可取消工作分界。

## 阶段矩阵

| 阶段 | 单一目标 | 首个廉价门 | 冻结门 |
| --- | --- | --- | --- |
| 359-A | 给真实存档建立解析、投影、每个 prepared layer、GPU 上传、首绘、overlay、面板和 LongTask 的唯一时间 / byte 分母 | 现有 map-file / render profile 专项 | 一次生产构建真实存档 trace，所有阶段和首屏资源均可归账 |
| 359-B | 用直接结构投影 / transfer DTO 取代完整 adoption handoff 的重复编码与主线程再解析，同时保持 Worker 和主线程 owner 独立 | handoff roundtrip、旧档回读、owner binding 专项 | 同存档地图摘要逐字段一致，编码 + 实体化总耗时实质下降且回滚成立 |
| 359-C | 把首屏必需资源与 map-ready 后可取消资源拆开，后台工作不得改写当前像素 | prepared installer、picking、overlay 专项 | 首屏可见层 / 拾取 / 保存可用；惰性任务可取消且无像素变化 |
| 359-D | 冻结集成并执行绝对时限终验 | typecheck、scoped diff | 同生产构建五轮真实存档、build、health / console / WebGL、替换取消全部通过 |

## 设计约束

- 不以删除可见层、延迟必要拾取、减少对象、降低地图精度或延后“可交互”定义换取时间。
- map-ready 之前必须完成当前画面、当前可见 overlay、基础拾取、撤销 owner 和保存所需的正式接纳；未打开面板的视图模型可以 map-ready 后按需建立。
- 后台 prepared task 必须绑定 map identity / revision / render generation；新导入、撤销式地图替换或显示状态变化时可取消，迟到结果不得提交。
- Worker 与主线程不得共享可变 canonical owner；若使用 transferable DTO，必须明确哪个 owner 保留副本、哪个 buffer 被转移以及失败时如何回滚。
- 文件格式和 schema 保持不变；优化对象是运行时导入链，不重写存档兼容契约。

## 最终验收

1. 生产构建、同一机器、同一文件，预热一次后五次独立冷导入：中位数 `≤ 6.0s`，最大值 `≤ 7.5s`。
2. 导入窗口没有 `>200ms` 产品 LongTask、health error、console error / warn 或 WebGL error；不得通过放宽 monitor 阈值消除记录。
3. 每次均回读 `100000 / 43419 / 1251 / 442 / 7976`，文件身份和地图摘要稳定；加载后立即执行拾取、打开路线面板和导出完整存档均成功。
4. 首屏后台任务期间截图、当前 renderer 资源摘要和 map revision 不变；开始第二次导入会取消第一次所有未提交惰性任务。
5. 随机图、小图、Node 夹具和 percent 改善只能作前置门，不得写入完成结论。

## 完成记录（2026-08-27）

### 根因与实现

- 第 358 项保留的 adoption handoff 仍使同一 v3 正式文档经历 Worker 解析、完整再编码和主线程再解码。现由主线程与渲染 Worker 并行读取同一解压结果，正式 v3 导入不再为接纳 owner 重编码；旧格式继续保留原 handoff 兼容路径，Worker / 主线程 canonical owner 仍相互独立。
- 渲染准备拆为主、辅两个可并行的 ComputeWorker：主任务准备当前岸线与首屏岸线资源，辅任务准备 core surface、路径、线、标签、路线、河流和点。map-ready 后的预热 Worker 由二实例池复用，并绑定当前 map / revision；下一次地图替换会取消未提交任务。
- 首屏 surface 改为三字 geometry（位置与 packed identity），颜色由既有 GPU 属性纹理提供；prepared installer 从已提交地图直接建立 picking，不再把数十万拾取引用对象化回绑。overlay 分批与空面板刷新只在超过协作预算时让步。
- 导入事务的总墙钟已由独立 load-stage / LongTask 监测，因此地图接纳不再重复登记通用 async operation-stall；监测阈值没有放宽。紧凑 surface 首次实现暴露的重复导入 `WebGL INVALID_OPERATION 1282` 已归因到删除旧 color buffer 后仍恢复其 attribute pointer，现由每条实际绘制路径绑定自己的有效颜色来源，重复导入保持 `WebGL error 0`。

### 真实存档终验

- 唯一输入：`C:\Users\mosuzi\Downloads\krichars (3).webfmg`，`9,642,587 bytes`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 同一 `v0.5.68` production preview 预热一次后，五次独立冷导入墙钟为 `4324 / 4274 / 4725 / 4970 / 5150ms`，中位 `4725ms`、最大 `5150ms`；应用 load trace 为 `4287 / 4240 / 4638 / 4929 / 5103ms`，中位 `4638ms`、最大 `5103ms`。
- 五轮均精确回读 `100000 grid / 43419 pack / 1251 active cities / 442 routes / 7976 route segments`；每个导入窗口的产品 `>200ms LongTask`、health error、console error / warn 和 WebGL error 均为 `0`。
- 导入后用真实 CUA 点击地图立即选中城市 `嘉禾 #20`，对象详情正确显示城市、首都、人口、国家和省份；路线管理面板立即打开并显示 `442` 条路线；“完整地图数据”导出成功反馈为“地图数据已导出”。
- 连续真实导入覆盖了前一地图尚未提交的延迟预热；无遮挡 canvas 区域在 map-ready 后立即与 `5s` 后像素哈希同为 `cada9b22`，命中元素均为 `#map-canvas`，同期 revision / renderer 摘要稳定、health 仅新增 `map-ready`、`WebGL error 0`。整页截图曾因导入成功提示消退而变化，不能误作地图像素变化。

### 门禁与交付

- `typecheck:core`、map-file Worker、whole-map profile protocol、render preparation、prepared installer、API operation、surface base buffer set 专项和 `1404 modules` production build 通过。
- 完成版本为 `0.5.68`；任务分支 `codex/task-359-real-archive-load-critical-path` 只推送自身，不合入 `main`。第 360 项从本完成提交继续建立独立分支。
