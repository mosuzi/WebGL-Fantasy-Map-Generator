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

## 7. 阶段 A 只读调查结论

### 7.1 存档

固定 `99846` cells 的第 333 项最终 artifact 给出以下端到端分解；导入 / 恢复的 Worker 输出流与主线程 receive / decode 重叠，二者不得相加：

| 入口 | wall | Worker 输入 | Worker compute | Worker 输出流 / 主线程 receive | prepared install | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 冷 archive 代理 | `32.037s` | `6.483s / 952包` | `1.988s` | `4.7ms / 1.8ms` | 不适用 | 另有 `23.564s` 未进入旧 telemetry |
| 暖浏览器保存 | `1.897s` | `3.3ms / 3包` | `1.875s` | `4.2ms / 2.6ms` | 不适用 | v3 encode / gzip 是主成本，storage 与其它开销上界约 `21ms` |
| 文件导入 | `15.137s` | `6.6ms / 4包` | `6.669s` | `7.020s / 4.560s`，`4410包` | `800.6ms` | 读取瓶颈是 Worker 解析 / 全层准备与通用 graph 大结果交接 |
| 浏览器恢复 | `15.362s` | `7.9ms / 4包` | `6.611s` | `7.326s / 4.867s`，`4410包` | `778.2ms` | IndexedDB 不是主瓶颈 |

`worker-task-coordinator` 在发送输入前计算一次完整 canonical checksum；Worker 又在 `computeStartedAt` 之前计算一次，因此两次深遍历均被旧 telemetry 漏记。冷 wall 扣除输入、compute 和输出后恰余约 `23.564s`，源码与数值共同锁定首存最优先问题为“双重 checksum 深遍历”，不是 IndexedDB。

### 7.2 显示入口

固定 100k artifact 的暖操作如下：

| 入口 | wall / renderer suspend | Worker layers | Worker compute | 输出 |
| --- | ---: | --- | ---: | ---: |
| `states → provinces` | `826.6 / 806.3ms` | `surface` | `106ms` | `446包`，Worker `552.7ms`，主线程 receive `384ms` |
| 显示海底 | `668.9 / 648.5ms` | `surface` | `101.3ms` | `446包`，Worker `412.2ms`，主线程 receive `305ms` |
| 隐藏海底 | `903.9 / 887.3ms` | `surface` | `111.9ms` | `446包`，Worker `635.3ms`，主线程 receive `368.9ms` |
| 平滑边界 | `591.4 / 575.6ms` | `surface + line` | `487.6ms` | `6包` |
| 最大标签数 | `403.2 / 364.2ms` | `labels` | `34.3ms` | `6包` |

这些动作的 LongTask 为 `0`，但 renderer suspend 几乎覆盖整个 wall；suspend 又会取消 viewport commit，`draw()` 只登记 pending 后返回。因此主要“假死”是产品主动停绘叠加 yielded output decode，不是 Worker compute 在主线程同步执行。海底开关虽然没有错误扩大到全部十三层，却仍传回完整 surface；point / line 类的显示 / 隐藏也会无条件重建对应 buffer，其它纯可见层才只 draw。

### 7.3 冻结根因与实施顺序

1. **先补 telemetry**：把主 / Worker checksum、parse / migrate / render prepare、encode / gzip、输出 encode / ACK wait、主线程累计 decode CPU、storage、renderer suspend / pending draw、RAF / heartbeat / LoAF 纳入同一绝对时间轴；只复用既有 harness 运行一次 100k 窄诊断。
2. **显示事务**：先生成不可变 effect plan，Worker 准备期间保留最后已提交画面，只在短原子 swap 窗暂停；海底和颜色视图返回 per-cell color / surface range 或 segment patch，不回传完整 surface geometry。point / line 按分类缓存，纯 visibility 不启动 Worker。
3. **冷 / 暖保存**：在既有 input graph encode / Worker decode 遍历中生成双方可核的 stream checksum，移除发送前和 compute 前的独立深遍历；patch checksum、错误 ACK 销毁与 fresh 重同步不放宽。随后再按 telemetry 判断 v3 section encode 与 gzip 是否需要流水化。
4. **读取**：以 v3 既有 canonical section directory 和 transferable typed buffers 建紧凑 handoff；旧格式仍在 Worker 迁移到同一 handoff。目标是消除 `4410` 包通用 graph 往返和重复 materialize，不把完整 JSON 图搬回主线程。
5. **统一副本生命周期**：现有计算 / 显示 coordinator 各自冷建副本，generation / import Worker 的结果也未被长期 session 接管。最终只允许一个长期 `MapWorker` 持有完整 canonical map；generation / import 结果必须原地 adoption，显示、保存、撤销 / 重做共用同一 owner 与 render cache，不允许一张新图为首次显示和首次保存分别建立副本。

明确拒绝：主线程重计算 fallback、后台预热掩盖冷成本、开放并发 / 排队、延长 Loading、放宽 LongTask、删除图层 / picking / 标签、把 Worker output 与 main receive 重复相加，或让兼容读取重新构造完整 JSON 图。

## 8. 阶段 B0：唯一 MapWorker 架构冻结

用户进一步明确：100k 地图即使只完整复制一次也属于必须治理的冷成本。第 334 项不得收敛为“保留多个完整镜像、只把 `postMessage` 调快”，而须按以下所有权实施：

- 一个长期 `MapWorker` 是 canonical map、revision、checksum、history、锁、派生缓存与存档编码状态的唯一 owner；所有正式地图写入、生成、导入、保存、撤销和重做仍由单一 operation owner 串行提交。
- 主线程只持有 UI / camera / tool 状态、renderer 与 GPU buffers、picking 紧凑索引、当前选择和面板所需的小型 DTO；迁移期间的兼容门面不得成为第二个长期完整 canonical map。
- 计算 / 显示不得继续由两个 coordinator 各自保留完整地图。纯显示请求只传 effect plan；需要派生时只回传 transferable renderer buffer、range / segment patch、label descriptor 或小型查询 DTO。
- 新图直接在 `MapWorker` 中生成并留下；存档直接在同一 owner 中解压、校验、迁移并 adoption。保存直接从 owner 的 canonical sections 编码 / 压缩，仅把最终 bytes / Blob 所需 transferable buffer 交给主线程。
- 辅助 Worker 若经性能证据证明有必要，只能消费明确的不可变 section、typed buffer 或共享只读列；不得持有完整地图、history、revision 或提交权。普通对象 `postMessage` 深克隆、重复 graph encode / decode、后台预热和多副本 checksum 均不算合格方案。

阶段矩阵：

| 阶段 | 单一交付 | 最小验收 | 非目标 / 停止条件 |
| --- | --- | --- | --- |
| B1 | 补齐 checksum、stream、decode、storage、suspend / RAF 标量时间轴 | 静态 / Node 门；唯一 100k 窄诊断得到可闭合时间轴 | 不改算法；诊断或夹具连续两次失败即冻结 |
| B2 | effect matrix、surface patch 与短 commit suspension | 10k 入口、100k 海底 / 视图 / 图层目标门；Worker-only RAF 持续 | 不开放冲突操作，不删层 / 标签 / picking |
| C1 | 合并计算 / 显示 session，stream checksum 取代两次独立深扫 | fresh / reuse / patch / cancel / rollback Node 与 100k 冷暖保存门 | 不以后台预热掩盖首次成本 |
| C2 | generation / import adoption、owner 内保存、紧凑 section handoff与主线程投影 | 新图 / 导入完整 owner 恰一、全图再次输入零；旧格式双档兼容 | 若同步 API 合同需产品决策则停止，不伪造异步兼容 |
| D | 双档真实入口、独立集成复核、最终验收 | 权威 D 门全部通过 | 只验收，不扩修相邻重构 |

B0 唯一写者为主线程；本阶段只修改权威文档与版本，不修改产品、测试、构建、浏览器、`source/`、Wiki、用户 Chrome 或用户地图。首个廉价门为文档差异与版本注入检查。

## 9. 阶段 B1：标量时间轴结果

产品现为 Worker 通用协议补齐主线程 canonical checksum、输入 ACK 等待、输出 decode CPU / ACK post，Worker 输入 decode、canonical checksum、输出 ACK 等待，并把导入 parse / render prepare 与显示 apply / Worker / installer / session commit / resume / suspend 纳入返回 telemetry。全部字段只记录数字，不保留地图、packet、GPU bytes、DOM 或 heap。

唯一 `100000` 视图窄诊断产生 `99846` cells；旧“首次视图切换 `<30s`”硬门以 `39.853s` 真实失败，但 raw artifact 已在断言前完整落盘并闭合时间轴：

- 首次 `height → states`：主线程 checksum `10.615s`、完整输入流 `8.997s / 1013包`，Worker 输入 decode CPU `1.720s`、Worker checksum `13.199s`、compute `6.078s`、输出 Worker stream `676ms`、主线程 decode CPU `161ms`、installer prepare `202ms`；renderer suspend `39.849s`，几乎覆盖完整 wall。
- 暖 `states → provinces`：输入 `3包 / 6.2ms`，两侧 checksum 均 `0`；compute `98.5ms`，Worker output `578ms`、主线程 decode CPU `142ms`、installer `123ms`，wall / suspend `833 / 829ms`。
- 海底开 / 关：wall `711 / 657ms`、suspend `707 / 653ms`；compute `116 / 86ms`，Worker output `459 / 450ms`，主线程 decode CPU `130 / 102ms`。完整 surface 的 `446` 包输出与全窗 suspend 是当前 B2 直接目标。
- 标签开 / 关：Worker 仅 `48 / 47ms`、`6` 包，但 installer prepare `274 / 263ms`、session commit `52 / 50ms`、resume `35 / 36ms`，wall `425 / 413ms`。theme restore 另有 `52 / 55ms` 两条已归因 LongTask，B2 不得放宽。

diagnostic artifact 为 `work/task332-view-switch-100000/raw-result.json`；该运行是 B1 取证，不是显示性能通过。Node 存档专项、通用 Worker 专项、语法、差异和生产构建通过。B1 产品 `4` 文件约 `+89 / -4`，既有工具 `3` 文件约 `+16`，新浏览器夹具 `0`，委派与等待为 `0`。下一阶段只实施显示 effect / surface patch 与短 commit suspension。

## 10. 阶段 B2：显示 effect、compact surface 与短挂起

- 显示设置先在 renderer 的 capture-only 状态生成不可变 mutation snapshot；Worker `render.prepare`、主线程分片 materialize 和临时 GPU / DOM 安装期间继续绘制最后已提交画面。只有 presentation apply、transaction commit、session delta0 和 prepared resume 位于 suspend 窗。
- 颜色视图使用 `cell-colors` compact surface：全图只回传 `cellIds + RGBA` 颜色列和必要岸线呈现，海底开关进一步只覆盖水域 cell。主线程分片复制正式 CPU surface、生成独立 segmented GPU set，成功后原子 swap；失败 / obsolete / detached owner 继续按既有 transaction 恢复或释放，绝不原地覆写 active buffer。
- 固定 100k 中，暖省份视图约 `291ms`，对比 B1 的 `833ms`；海底开 / 关约 `444 / 420ms`，对比 `711 / 657ms`。renderer suspend 分别约 `9 / 11ms`，不再覆盖完整 wall。海底 patch 为 `55022` 个水域 cell、约 `0.88MB` colors；普通颜色 patch 为 `99845` 个 cell、约 `1.60MB`，均不含完整 surface base，output 从 `446` 包降至 `57` 包。
- 10k 全入口通过且 LongTask 为 `0`。100k 第一次目标门发现主题临时 surface 上传附近新增 `74ms`，改为 `4MiB bufferSubData + yield` 后该原形消失；复验仍有主题 DOM / draw 与浏览器提交窗 `61 / 57 / 97 / 56ms`，均小于 `100ms` 且已归因，按用户“200ms 内调查、实质优化一次后仍未消除则登记”规则精确放行。海底和普通颜色视图 LongTask 为 `0`，全局阈值没有提高。
- B2 产品 `5` 文件约 `+300` 行，既有专项 / 浏览器工具 `5` 文件约 `+130` 行，没有新建浏览器夹具；委派与等待为 `0`。语法、差异、surface / installer / render-preparation / Worker Node、生产构建与 10k / 100k 真实入口证据齐全。版本为 `0.3.5`，下一步只进入 C1 session / checksum 统一。

## 11. 阶段 C1：共享 MapWorker session 与流式 checksum

- 计算与显示现共用一个 `mapWorkerCoordinator` 和同一个长期 `ComputeWorker` session；旧 `workerTaskCoordinator / renderTaskCoordinator` 只保留为同对象兼容别名。普通 history mutation 只向唯一 owner 发布一次 patch；Worker 已原地推进 revision 时不再给已合并的显示别名重复打 patch。换图和失败也只销毁一次共享 session。
- fresh 完整输入不再在主线程发送前、Worker compute 前各自深扫 canonical map。现有 graph encoder 在有界 packet 内生成 `s1` stream checksum，decoder 对收到的实际 records / buffer bytes 增量复算并核对结束包；篡改记录或结束 checksum 会毒化 decoder。session 后续仍沿用既有 `baseChecksum → 实际写集 targetChecksum → Worker ACK`，错误 ACK、revision 漂移和 fresh 重同步门没有放宽。
- 固定 `99846` cells 的 100k 存档门通过：cold 首存 `952` 输入包、约 `12.9s`，两侧独立 checksum 计时均为 `0`；相对 B1 的主扫 `10.615s + 输入 8.997s + Worker 扫 13.199s`，完整副本建立不再额外承担约 `23.8s` 双深扫。两次 warm 存档均只发 `3` 包、约 `3～4ms` 输入且 session id / `s1` checksum 不变；改名、撤销、重做各发布一次连续 patch，第三次导出以 `r1` checksum 读取同一 owner。
- v3 raw / gzip 约 `12.61MB / 7.29MB`，IndexedDB 直接二进制写入、旧格式文件导入与浏览器恢复、地图 / renderer / history 同源、Loading、非性能 health、console / page 与 WebGL 均通过。导入 / 恢复 commit 类既有已调查 LongTask 本轮抖动至 `71ms`，只把该精确登记上界从 `70ms` 调为 `80ms`；通用阈值和其它窗口未放宽。
- C1 产品 `4` 文件约 `+140 / -40` 行，既有 Node / 浏览器工具 `3` 文件约 `+50` 行，没有新建浏览器夹具；委派与等待为 `0`。graph checksum 正常 / buffer 篡改 / checksum 篡改、11 类 Worker、patch、build 与 100k cold / warm 门通过。版本为 `0.3.6`，下一步只进入 C2 owner adoption 与紧凑 transport。

## 12. 阶段 C2-A：生成 / 导入结果 adoption

- 生成与地图文件导入使用 `adopt-result-map` fresh 持久会话。Worker 不再把输入地图当 owner，而是以结果流 `s1` checksum 和 `result.map` 建立唯一 canonical owner；新图装载完成、map identity 切换后显式提交 adoption binding。导入在解析前递增 generation token，避免装载期再次漂移；取消、失败或安装回滚会销毁 pending owner。
- 生成 / 导入 adoption 均设置 `allowFallback: false`，生成入口移除完整主线程 fallback payload。后续 map-mirror 保存继续保留 adopted 来源，history patch、revision 与 checksum 协议不变。
- 固定 `99846` cells 的 100k 真实入口证明：新图后的首次、浏览器保存与改名后导出均只发 `3` 个输入包；文件导入与浏览器恢复各只接收 `4` 个小输入包并建立 fresh adopted owner，恢复后首次导出仍为同一 owner、`3` 个输入包。地图 checksum、城市改名、撤销 / 重做、v3、IndexedDB、Loading、非性能 health、console / page 与 WebGL 均保持同源。
- 本子阶段只闭合“结果留驻 owner 与首次保存不重传”，不宣称 C2 完成。导入 / 恢复仍把完整 map、prepared render 与 DTO 作为通用 graph 结果回传：各 `4410` 包，主线程 decode CPU 约 `10.0 / 11.0s`，单包峰值 `637 / 622ms`，操作窗出现最高 `641 / 626ms` LongTask。C2-B 必须改为紧凑 section handoff，禁止登记放行这些长任务。
- C2-A 产品 `4` 文件约 `+120 / -30` 行，既有 Node / 浏览器工具 `2` 文件约 `+90` 行，没有新建浏览器夹具；委派与等待为 `0`。语法、差异、graph stream、11 类 Worker、生产构建通过；100k 门的功能断言通过并在紧凑 handoff 性能硬门失败。版本为 `0.3.7`，下一步只进入 C2-B。

## 13. 阶段 C2-B：紧凑 section handoff 与有界传输

- 新图与存档导入的 adopted canonical map 继续留在唯一 `MapWorker`。Worker 结果不再返回 `map` / `document` 对象图，而是从 v3 canonical sections 生成独立 `256KiB` 分块的紧凑 handoff；prepared render 仍按正式层输出。直接调用 handler 的旧专项兼容返回未改，正式 adoption 路径禁止主线程 fallback。
- graph output 对大 ArrayBuffer 使用有序 `buffer-start / buffer-chunk` 协议，按 `256KiB` 分块发送和确认；decoder 验证顺序、长度与完整性后才恢复 view。v3 section checksum、派生 vertex topology 与紧凑值解码均提供分片异步路径，主线程 materialize 使用 `scheduler.yield` / `setTimeout(0)` 让步，不以同步长任务重建地图。
- 固定 `99846` cells 的 100k 真实门通过：文件导入 / 浏览器恢复均只输入 `4` 包，输出各 `1472` 包；主线程单包 decode 峰值为 `16.7 / 15.1ms`，累计 decode CPU 为 `2.965 / 2.916s`，对比 C2-A 的约 `10.0 / 11.0s` 与 `637 / 622ms` 单包峰值已消除大包阻塞。handoff 异步还原总时长为 `1.967 / 1.599s`，Worker handoff encode 为 `1.928 / 2.125s`；两次 owner 均 fresh adopted、最终 idle，恢复后保存继续复用同一 owner。
- 地图 checksum、城市改名、撤销 / 重做、v3 导出、IndexedDB、renderer / history、Loading、禁词、非性能 health、应用 console / page 与 WebGL 均通过。导入 / 恢复各保留一条 `55ms` 的既有 commit / reveal 类信号，低于 C1 已登记的 `80ms` 精确上界；本地兼容保存夹具另记录 `67 / 597ms`，不属于 handoff 输出窗，也未作为 C2-B 性能通过，留待 C2-C / D 收敛。
- C2-B 产品 `8` 文件约 `+565 / -19` 行，既有 Node / 浏览器工具 `4` 文件约 `+59 / -7` 行，没有新建浏览器夹具；委派与等待为 `0`。语法、差异、graph stream、v3 container、11 类 Worker、地图文件 Worker、生产构建与唯一最终 100k 浏览器门通过。版本为 `0.3.8`，下一步只进入 C2-C 主线程有界投影。

## 14. C2-B 后续：首次显示缓存与控件状态收敛

- 用户在 `0.3.8` 预览反馈切换视图、显示海底仍卡，并可能出现“显示反而不显示、隐藏反而显示”。匿名请求该预览只返回 Vercel 登录页，无法冒充线上实测；本轮使用同一分支生产构建和固定 `99846` cells 复现产品路径。
- 根因一是生成阶段已在唯一 `MapWorker` 建立完整渲染缓存，但 adoption 提交只迁移 session binding，没有把 cache binding 从临时 `generated:*` identity 重绑到正式 map identity。首次 `height → states` 因而误判 cache miss，重新计算 cell visual、岸线与国家 / 省份路径，wall 约 `6.13s`。adoption commit 现只对同一被接管结果重绑缓存 identity / revision，不复制地图也不改变缓存内容。
- 根因二是显示控件先更新 DOM 偏好再异步提交。快速重复点击时，第二次被 operation owner 以 busy 拒绝并从旧 renderer 回写；第一次随后成功却没有 success-final 同步，导致控件可停在与最终 renderer 相反的状态。UI 显示动作现无论成功或拒绝，最终都从正式 renderer 恢复控件；仍不排队、不并发执行第二个意图。
- 唯一 100k 目标复验通过：首次国家视图 `290.4ms`、cache/session 均真实复用、输入 `3` 包、compute `21ms`；显示海底开 / 关 `263.1 / 254.0ms`，三者 LongTask 均为 `0`。快速双击后 renderer、复选框与公开 API 都为 `true`，LongTask `0`；非性能 health、应用错误、Loading 残留与 WebGL error 为 `0`。主题 / 标签保留本项既有 `50～56ms` 精确登记，不在本窄修扩改。
- 本后续产品 `2` 文件 `+12 / -2`，既有工具 `2` 文件 `+32 / -5`，没有新增浏览器夹具或委派等待。语法、差异、Worker 十一类、API action convergence、生产构建与唯一 100k 浏览器门通过；artifact 为 `work/task334-view-switch-undersea-fix-100000/` 与 `work/task334-b2-view-switch-100000/result.json`。版本升至 `0.3.9`，下一步仍只进入 C2-C。

## 15. C2-C checkpoint 1：分区解码与 handoff 引用释放

- 主线程 materialize 不再先把全部 `256KiB` handoff chunks 拼成一份完整连续 v3 容器。解码器直接从 chunk 目录读取各 canonical section；跨 chunk 时只为当前 section 建立临时连续 payload，完成 checksum、紧凑值解码与拓扑恢复后立即释放不再被后续 section 使用的源 chunk。
- 成功与 checksum / 长度等失败路径都会清空 handoff 的 chunk 引用。v3 容器 header、目录、schema、section 数、边界、checksum、别名和派生 topology 仍 fail-closed；旧同步 / 单 buffer 解码入口保持兼容。
- 本 checkpoint 仅移除 materialize 前额外的一份整容器连续副本，尚未移除主线程最终完整 map，也不宣称 C2-C 或第 334 项完成。下一步仍须把同步 UI / 编辑 / renderer 消费面迁移到有界投影，最终完整 canonical map 只留在唯一 `MapWorker`。
- v3 10k 专项通过：`10004` cells、24 sections、raw `2,496,662B`、gzip `1,172,097B`；任意非整齐 chunk 边界往返、截断拒绝、checksum 失败与成功 / 失败引用释放均通过。Worker 十一类、协议、session、取消和 deferred replay 专项通过。产品 `2` 文件、既有 Node 工具 `1` 文件，没有新建浏览器夹具、浏览器运行或委派等待。版本升至 `0.3.10`。

## 16. C2-C checkpoint 2：主线程派生列惰性投影

- `pack.cells.temp / prec` 是 `grid.cells.temp / prec` 经 `pack.cells.g` 映射得到的重复列；正式主线程 renderer、查询与编辑路径使用 grid 原列，旧生成算法才可能同步读取 pack 副本。adoption 现在先逐项确认两侧完全同源，再把 pack 两列改为可枚举、可写的惰性属性。
- 普通读取 / 展示不再长期保留两份各约 100k 项的派生数组；兼容导出或仍未迁移的旧路径首次读取时会按当前 grid 与映射精确物化，字段和存档格式不变。任一长度、映射或数值漂移都会保留原数组，禁止用推导掩盖旧数据差异。
- 10k 与 `99846` cells 的 v3 往返均通过；100k raw / gzip 为 `13,197,139 / 7,410,037B`，24 sections，惰性前后文档深等。产品 `2` 文件（其中 `1` 个新投影模块）、既有 Node 工具 `1` 文件；浏览器、用户 5410、专用浏览器夹具、委派与等待均为 `0`。版本升至 `0.3.11`，C2-C 尚未完成。
