# 第 334 项：100k Worker 端到端延迟与画布假死调查

## 1. 问题边界

第 333 项证明同一长期副本上的暖任务无需再次全量输入地图，也把固定 100k 的 `.webfmg v3` 收敛到约 `12.61MB raw / 7.29MB gzip`。这并不等于端到端体验已经合格：用户实际观察到保存 / 读取仍慢，“显示海底”、颜色视图和图层开关响应极慢，Worker 计算期间画布也像主线程阻塞一样停止响应。

本项坚持 Worker 化。地图写入、重生成和依赖同一 renderer transaction 的冲突操作仍只允许一个 owner，不允许用户连续点击形成并行 Worker 或无界队列；需要解决的是不必要的工作、输入 / 输出协议、主线程安装和 renderer suspension，而不是用开放冲突操作掩盖等待。

## 2. 已知证据与待证假设

- 同图暖存档输入约 `3` 包，说明“所有操作每次全量传图”并不成立；首次副本建立仍约 `952` 包，必须单独计量。
- 既有 100k 读取 artifact 的 Worker 输入很小，但输出约 `4410` 包，主线程 decode / receive 约数秒；读取瓶颈更像“大结果回传 + materialize + prepared install”，不是再次输入全图。
- 当前 `runDisplayMutation` 把多种显示选项统一交给 `applyRuntimeDisplayMutationViaWorker`。该路径先 suspend renderer，再按 effect 请求 `render.prepare`，最后原子安装和 resume；应验证“显示海底”等动作是否被错误扩大为完整 surface 或更多层的重准备。
- renderer suspension 会取消 / 延后 viewport commit 与 draw。即使浏览器事件循环没有连续长任务，最后已提交画面也可能因产品主动挂起而呈现“假死”；需要用 RAF / heartbeat、LongTask / LoAF 和 renderer 状态共同判断。

以上只是调查起点。不得在无 trace / 标量证据时直接把全部延迟归因于 Worker 计算、全图传输、GPU、DOM 或浏览器 GC。

## 3. 阶段 A：端到端证据冻结

固定 10k / 100k，对首次 / 暖保存、文件导入、浏览器恢复、显示海底开关、颜色视图和代表性图层开关分别记录：

1. operation start / fulfilled / stable end；Worker session 是否复用、输入 / 输出 packets 与 bytes、stream / post / decode 最大同步片段；
2. Worker compute / encode / compress / decode / render prepare；主线程 command / history、result materialize、prepared install / commit、DOM style / layout、draw；
3. LongTask、LoAF、RAF 间隔和独立 event-loop heartbeat；renderer suspended / pending draw / deferred mutation 与 operation queue 长度；
4. 地图 revision / checksum、renderer binding、Loading、health、console / page、WebGL 与清理状态。

诊断只记录标量与小型阶段数组，不在操作窗读取大 GPU buffer、序列化整图、采 heap dump 或开启全量 trace。只有低侵入证据无法定位单段时，才允许对唯一失败动作增加一次窄 trace。

## 4. 阶段 B：显示 effect 与 renderer suspension

建立公开动作到最小 effect 的机器矩阵：

- 纯 uniform / visibility：不得启动 Worker `render.prepare`，不得重建 CPU / GPU geometry；
- surface 局部呈现：Worker 只生成受影响 ranges / segments 或颜色 patch，主线程原子替换；
- line / point / label / political / route / picking：只有对应数据或显示语义变化时才请求；
- “显示海底”：只影响海域呈现，陆地、岸线以外图层和对象 overlay 不得重建；
- 需要完整派生的复杂视图继续使用长期 Worker cache，不回退主线程。

Worker-only 计算期间冲突控件可以保持禁用，但浏览器 RAF / Loading 动画和最后已提交画面必须继续呈现。产品不得把相机或编辑输入缓存成稍后批量执行；用户操作要么明确拒绝，要么在当前 operation 结束后由用户重新触发。

## 5. 阶段 C：存档输出与读取 transport

- 保存：首次建立 canonical 副本、v3 encode、gzip 和 IndexedDB / File 写入分别计量；暖保存只提交 revision / patch，不为隐藏首轮成本做自动后台预热。
- 读取：保持 Worker 解压、校验、迁移和重准备；以 v3 section / transferable buffers 传回紧凑列，减少通用 graph codec 的数千小包、数值数组复制和重复结构。主线程只 materialize 运行时真正需要的 canonical 对象和直接安装 Worker 已准备的数据。
- 兼容：v1 / v2、JSON、gzip、gzip-base64、LocalStorage / IndexedDB、File / Blob、云端存档继续可读；错误必须在替换当前地图前 fail-closed。

## 6. 最小验收与非目标

- 两档地图、历史、选择 / 高亮、相机、政治 / 水文 / 路线、renderer / picking / overlay / GPU、旧存档和失败回滚同源；
- 100k 代表动作给出相对第 333 项基线的阶段和总耗时改善，且不存在未归因 LongTask；Worker-only 窗 RAF / heartbeat 持续，冲突操作仍被拒绝且任务队列不增长；
- 非性能 health、应用 console / page、WebGL、Loading 残留为 `0`；
- 不修改 `source/`、Wiki、用户 Chrome 或用户地图；不采用 main-thread fallback、降低地图 / 标签 / picking 精度、删除图层、放宽阈值或只修改夹具。
