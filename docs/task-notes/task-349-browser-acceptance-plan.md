# 第 349 项浏览器验收方案（仅评估，不执行）

## 结论与边界

本方案具备可执行性，但不在第 349 项分支执行。当前阶段没有启动浏览器、接管标签页、运行 UI 自动化、采集截图或声称视觉通过；最终结论只能是“非浏览器契约已通过，浏览器方案已评估”。未来若单独获批，应从当时最新目标分支建立验收任务，不得把本并行分支合入 `main` 作为前置条件。

执行前必须先保存用户地图并核对目标环境。若使用用户已打开的页面，只能接管 URL、版本、地图 identity 均核对过的精确标签页；否则使用隔离 10k / 100k 固定种子页面，不以新建地图冒充现有地图修改。

## 环境与数据集

| 数据集 | 目的 | 前置与恢复 |
| --- | --- | --- |
| 固定 10k 新图 | command、history、query、view、layer、picking、普通 Worker | 记录 seed、document id、runtime session、revision；结束后导出并关闭隔离页 |
| 固定 100k 新图 | Worker input/output、patch、render install、保存恢复与性能 | 保存原始 `.webfmg`；每组破坏性动作后 undo 或重新导入基线 |
| v1 最小旧档 | identity 派生、migration、backfill、保存升级 | 输入只读，升级输出另存，不覆盖原文件 |
| holey / 高编号对象旧档 | 稠密化、对象引用、保存抢救、picking | 校验导入前后对象 id 与 checksum，恢复原始副本 |
| 故障注入隔离图 | stale、gap、cancel、session restart、install rollback | 禁止在用户地图执行；每例结束要求 session idle、Loading 清零 |

每次运行记录 branch、commit、package version、build id、浏览器版本、GPU、viewport、devicePixelRatio、seed、cells、document id、runtime session id、起始 revision 与 artifact 目录。

## 执行矩阵

### 候选自动化入口（当前未执行）

未来获批后先逐项静态核对，再按下列四组串行；这里列名不代表已经通过：

| 组 | 候选 package scripts | 主要证据 |
| --- | --- | --- |
| 10k 事务与领域 | `regress:map-transaction-browser`、`regress:worker-regeneration-browser`、`regress:population-worker-browser`、`regress:social-expansion-worker-browser`、`regress:economy-worker-browser` | commit/history、result owner、锁、回滚、面板反馈 |
| 10k/100k session 与结构 | `regress:worker-session-browser`、`regress:worker-session-100k-browser`、`regress:grid-topology-browser`、`regress:regeneration-lock-direct-domains-browser`、`regress:regeneration-lock-compound-browser` | ACK/invalidate、cross-task replica、topology、全领域锁 |
| renderer / picking / export | `regress:city-picking-browser`、`regress:overlay-pan-stability-browser`、`regress:viewport-line-preview-browser`、`regress:heightmap-export-browser`、`regress:png-crop-browser` | framebuffer、overlay、picking、PNG、视口裁切 |
| persistence / feedback | `regress:browser-storage-compatibility`、`regress:browser-storage-fallback`、`regress:browser-save-feedback`、`regress:loading-single-source-browser`、`regress:delayed-operation-feedback-browser` | v1/当前存档、保存回执、Loading、错误恢复 |

上述入口不能无脑组成一个长串：每组先运行一个 10k smoke，确认它使用隔离页且不会新建地图替代目标地图，再扩到本组。context loss / restore 暂无第 349 项专用单一 package gate，应复用已接受的 renderer debug hook 编排独立场景，并在执行前先登记为验收夹具，而不是临时改产品代码。

### 1. 启动、generation、import、restore

- 10k / 100k 各执行一次新图生成，核对 generation adoption 产生新 runtime session，document identity 与 render binding 不混用；正式安装后才出现可交互地图。
- plain JSON、gzip 与 `.webfmg v3` 各导入一次；v1 输入派生稳定 document id，保存升级不改原输入。
- 导出前后 source map checksum、revision 与 history 不变；导出 receipt 的 bytes、encoding、cell count、document checksum 与实际文件一致。
- 计划入口：generation adoption、map-file IO、map restore 与 save feedback 的既有 UI/自动化门；实际执行前先静态核对脚本不会重置用户标签页。

### 2. command、history 与低风险切片

- notes：新增、编辑、删除、导入、批删；每个成功 command 精确产生一次 core commit 与一次 legacy history 事实，invalid / no-op 不推进 revision。
- markers：显示、选择、hover、picking、Feature GeoJSON / PNG 可见性同源；presentation-only 操作不产生 core operation / map revision。
- 每个可撤销 command 执行 undo / redo，比较 canonical checksum、对象序列、selection、projection 与历史标签；发布后 UI 刷新失败只能进入 degraded / retry，不反向撤销已观察 history。

### 3. 各领域 Worker 与重生成

- foundation、population、society-politics、settlements、zones、features、routes、rivers、resource markers、economy、diplomacy、military 逐项执行已登记能力；不为 `unsupported / not-required` capability 人工制造入口。
- 每项记录 request binding、source revision、result kind、write set、checksum、ACK、commit revision、invalidated projections 与安装结果。
- 锁定对象、mirror、引用、from-empty / repair / localized policy 均用一条正例和一条拒绝例；拒绝时 map / revision / history / renderer owner 必须完全不变。
- shared `regeneration.compute` 以 `task + resultKind` 识别 owner；不同领域同 transport 不得串 result kind 或复用 pending session。

### 4. view、layer、renderer 与 picking

- 高度、生物群系、人口、国家、省份、文化、宗教、主题、海底及普通图层各切换两轮；presentation-only 必须 `map input = 0`、`render.prepare = 0`、revision / history 不变。
- topology 变化单独验证完整 geometry prepare / atomic install；失败保留上一帧和旧 GPU owner，成功后 surface、overlay、picking 与正式 binding 同源。
- 强制 WebGL context loss / restore 后比较 framebuffer、对象拾取、labels、routes、rivers、points 与城市实例；不得通过刷新或生成新图掩盖恢复失败。
- PNG 与当前 canvas 的尺寸、主题、图层可见性一致；截图不能替代像素 / picking 断言。

### 5. 故障与恢复

- stale revision、checksum mismatch、operation gap、重复 patch、未知写路径、cancel、Worker restart、build mismatch、pending adoption preload failure、prepared install fault 各一例。
- publish 前失败：canonical、revision、history、session、prepared resources 全回滚；publish 后 projection 失败：canonical commit 保留，projection 标为 degraded，并通过 retry / resync 收敛。
- 每例结束要求持久 Worker 可立即接受下一任务，pending session 为 0，Loading 隐藏，health / console / page / WebGL error 无新增未解释项。

## 性能与阻断阈值

性能按以下分段采集，不把 build、typecheck、后台预热或 Loading 文案当作产品耗时：

```text
core inspect -> snapshot/patch encode -> Worker input -> domain compute
-> Worker output -> validate/commit -> derived index
-> render prepare/install -> GPU draw -> UI refresh
```

- presentation-only：Worker input `0`、render prepare `0`、surface / overlay / picking owner 保持；产品 LongTask `0`。
- 10k command / view：任一单段超过 `200ms` 为阻断；`50～200ms` 必须记录入口、数量、最大值并给出一次目标调查。
- 100k full rebuild：与同 commit 的既有 legacy / accepted baseline 做配对；语义等价前提下总墙钟或任一主要阶段退化超过 `10%` 且超过 `100ms` 为阻断。不得通过降 cells、少算领域或提前结束 Loading 达标。
- 100k 保存 / 恢复：receipt 与实际 bytes / checksum 一致，输入只序列化一次；任何主线程单段超过 `200ms` 为阻断。
- 所有规模：应用 error、page error、WebGL error、未解释 console error、残留 Loading、pending session 与资源 owner 泄漏均为 `0`。

## 截图与结构化 artifact

每档至少保存：初始地图、一次 canonical commit、undo 恢复、presentation-only 切换、topology commit、context restore、旧档导入与最终恢复八张截图。结构化结果另存 JSON，包含上述身份、revision、history、checksum、Worker、projection、renderer、性能、错误面与截图路径；完整 trace 不写入手写文档。

## 恢复、清理与停止条件

1. 先导出当前地图并记录 checksum；破坏性操作只在隔离副本执行。
2. 每组动作后 undo / redo 或重新导入基线，并核对对象数量、id 序列、revision 与 checksum。
3. 关闭故障注入会话，确认 Worker idle、pending session 0、Loading 0、GPU owner 无泄漏。
4. 用户精确标签页若被接管，最终恢复原地图、原视图、原选择与原缩放；无法证明恢复时立即停止，不继续下一组。
5. 同一夹具连续两次失败、出现产品决策歧义或首个 `>200ms` 未归因 LongTask 时冻结验收，不以重复全门替代诊断。

## 可执行性评估

- 契约与入口：高。核心、领域、整图、headless、migration 与 renderer 已有 Node 门和多数既有 UI 回归入口，可复用固定 seed / 100k / v1 夹具。
- 身份与恢复证据：高。document、runtime、operation、projection、render binding 与 receipt 已可结构化读取。
- 视觉与性能证据：中高。既有 framebuffer、picking、LongTask、health 与截图基础可用，但应先统一 artifact schema，避免多脚本各自解释时间分段。
- 主要风险：既有 UI 脚本命名与是否真实启动浏览器并不总一致，历史上发生过误触；未来执行必须先做脚本静态清单和精确标签页核对。100k 全矩阵成本较高，建议按“10k 功能 -> 100k 性能 -> 旧档 -> 故障恢复”四组串行，预计 2～3 小时，并在每组首败即停。
- 当前判定：方案完整、依赖可获得、阻断规则明确，具备单独获批后执行的条件；本任务不执行，浏览器通过状态保持“未验证”。
