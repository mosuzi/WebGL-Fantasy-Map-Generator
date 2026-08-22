# 第 350 项地图核心引擎集成重新基线与整体修补方案

> 状态：2026-08-20 经用户批准，替代“继续用完整浏览器门逐个发现基础缺口”的执行方式。第 349 项架构边界保留，不推倒重写；第 350 项从 `350-R0` 重新基线。
>
> 分支：`codex/map-core-engine-architecture-plan`。本分支不得合入 `main`。主线程是唯一写者；每个阶段冻结后复用同一只读智能体评审，只有 `ACCEPT` 才进入下一阶段。
>
> 浏览器边界：`350-R0～R6a` 的 browser/CDP 为 `0`；用户已为 `350-R6b` 明确授权全量 CDP 与追加重试，必须按 catalog 顺序首败即停，修正经独立接受后仅复验首败入口。

## 1. 为什么重新规划

前五个固定浏览器入口虽然最终全部接受，但共经历 `27` 个有编号返工阶段：`19` 个主要属于产品开发或集成缺口，`7` 个属于夹具、等待或证据缺口，`1` 个同时包含产品性能与夹具阈值问题。主要模式不是单一缺陷，而是：

1. owner、binding、revision、checksum、commit 和 adoption 在不同入口使用了不完全相同的状态机假设；
2. Manifest 写集、双镜像、prepared render、picking component 和 stale derived 边界在单领域正例中成立，在连续领域链中才暴露缺口；
3. history、panel、renderer 与 source fingerprint 的异步边界没有在开发完成门中统一冻结；
4. 浏览器脚本同时承担产品发现、夹具调试、性能归因和最终证据，导致一次首败只能推进很短距离；
5. 夹具契约常在浏览器运行后才校准，无法证明产品和验收预期没有相互迁就。

因此不能继续把“产品与夹具互相逼近”当作验收方法。新的顺序固定为：

```text
冻结产品契约
→ 冻结典型场景和夹具前置
→ 静态 / Node 开发完成度审计
→ 修补共同产品边界
→ 独立评审
→ 聚焦浏览器 smoke
→ 固定入口
→ 冻结提交总串联
```

## 2. 目标与非目标

### 2.1 目标

1. 前五个已接受入口重新纳入典型场景矩阵，不因旧 artifact 通过而免除开发完成度复查。
2. 二十个固定浏览器入口在运行前都有明确的产品契约、夹具前置、Node 前置门、错误面和恢复条件。
3. 相同的 owner / binding / revision / history / projection / performance 不变量只定义一次，由各入口引用，不再各自解释。
4. 先修补会同时影响多个入口的共同产品边界，再运行浏览器；不得为某个脚本增加只对固定 seed 成立的产品例外。
5. 失败必须分类为产品、夹具、环境、性能或未判定；夹具调整和产品调整不得混在同一阶段。
6. 最终在同一冻结产品树上完成 20 个入口、直接 CDP 场景、10k / 100k 总串联和独立终验。

### 2.2 非目标

1. 不推倒第 349 项 `MapCoreEngine`、`DomainModuleManifest`、Worker binding、prepared render 或渐进 TypeScript 架构。
2. 不把旧 JS 全量迁移到 TypeScript，不移动现有目录，不扩展产品功能。
3. 不用新的超长万能浏览器脚本替代二十个固定入口。
4. 不以提高 LongTask 阈值、跳过 validator、减少 cells、刷新页面或重建新图掩盖失败。
5. 不在当前分支合入 `main`，不操作用户已有地图标签页。

## 3. 统一产品不变量

以下不变量适用于所有场景；单个入口只能增加约束，不能放宽：

| 编号 | 不变量 | 必须证明 |
| --- | --- | --- |
| I-01 | canonical owner 唯一 | 主线程正式地图、Worker replica、history before-image 不出现无主或双主状态 |
| I-02 | binding profile 明确 | foundation、operation、interactive projection、worker-only projection、prepared render、persistence export、headless write 只要求自身 profile 的字段，原始类型严格 |
| I-03 | revision 单调且分域 | canonical commit 才推进 map revision；topology / presentation 按自身契约变化 |
| I-04 | commit 原子 | `validate → projections prepare → canonical patch + history + revision atomic commit → publish → projection settle` 顺序固定；publish 前失败回滚，publish 后 projection 失败只能 degraded / retry / resync，不得重写已发布 history |
| I-05 | 写集真实 | Manifest、patch、镜像、undo/redo before-image 与实际写入一致，未知路径拒绝 |
| I-06 | 来源不可变 | Worker 计算和 validator 不改 source map；输出只能修改授权写集 |
| I-07 | 双镜像显式 | politics / pack、economy / pack、military / pack 等不依赖共享引用偶合 |
| I-08 | derived 新鲜度由来源授权 | stale / fresh、dependency closure、锁保护和请求外根不能由 Worker 输出自报决定 |
| I-09 | prepared render 同源 | layer、picking components、binding、map/topology revision 与被提交结果一致 |
| I-10 | history 精确 | execute / undo / redo / baseline-undo 均等待 settle，值、引用、revision、session 和面板状态可复核 |
| I-11 | presentation 不改图 | view、theme、pan、hover、overlay、preview 不推进 map revision/history，不触发业务 Worker |
| I-12 | cache / resource owner 可恢复 | topology cache、surface / cell attributes、GPU geometry / color、picking、overlay、label layout、Worker retained session 与 context restore 均绑定 `RenderResourceBinding(mapIdentity + sourceRevision + topologyRevision + renderGeneration)`；旧代拒绝、失败回滚、成功原子安装，无泄漏或跨 owner 混装 |
| I-13 | 持久化 canonical | generation、import、restore、save、Worker retained map 使用同一 v3 projection / normalizer；旧档只迁移副本 |
| I-14 | 异步竞态拒绝 | map/revision/token/viewport 变化使旧结果 obsolete；busy/cancel/fault 后 session、Loading、owner 可继续工作 |
| I-15 | 性能证据分层 | 测试 fingerprint 与产品阶段分开；10k 产品单段 `>200ms` 阻断，100k 与同树基线配对 |
| I-16 | 错误与证据完整 | application / page / health / GL / Loading 清零；成功失败都持久化 full 与 compact artifact |

## 4. 典型场景目录

### 4.1 跨入口场景

| 场景 | 典型动作 | 主要风险 | 最低开发完成度证据 |
| --- | --- | --- | --- |
| S-01 冷启动 generation | 无现有地图生成 10k / 100k 并接纳 | pending owner、foundation binding、commit 中间窗 | owner 状态机、generation Worker、adoption Node 链 |
| S-02 import / restore / headless adoption | v3、v1 最小档、holey 高编号档导入及隔离 headless write | canonical bytes、migration、interactive / headless / worker-only profile、prepared render、旧输入改写 | map-file、whole-map profile、真实 headless commit、旧档 roundtrip |
| S-03 单领域 command | notes / markers /人口 / 经济等一次编辑 | 写集、source 不变、单 history、局部 render | Manifest、patch、history、prepared installer |
| S-04 单领域 regeneration | 十一领域分别从 canonical map 重生成 | salt、lock、result policy、镜像、picking | 每域协议正负例和真实 task 入口 |
| S-05 正式十一领域连续依赖链 | `features → states → provinces → cities → routes → rivers → markers → diplomacy → religions → military → zones`；population / society / economy 另作 R2b 独立跨域链 | stale derived、跨域引用、请求外根、session lineage | 固定 10k 十一项 chain、dependency closure、source-only validator；不得把独立经济链混入该入口预期 |
| S-06 history roundtrip | execute→undo→redo→baseline-undo | Promise settle、revision、before-image、panel/renderer 重复刷新 | async history boundary、canonical fingerprint、引用 profile |
| S-07 no-op / locked operation | 全锁、局部锁、无变化重生成 | 不得假 commit；session 可复用；render 身份不变 | lock snapshot、no-op renderer exact、history delta 0 |
| S-08 fault / cancel / obsolete | compute、validate、prepared install、refresh、ACK 各点故障 | 回滚、owner/session 失效、下一任务恢复 | 逐边界 fault injection、pending 0、Loading 0 |
| S-09 concurrency / map replace | pending Worker 时 undo、锁变化、换图、viewport 变化 | stale binding、busy owner、旧结果覆盖新图 | replica patch continuity、replacement owner、latest-wins |
| S-10 100k 分包与性能 | generation、Worker、history、topology、save/restore | 同步长任务、包序、buffer owner、内存峰值 | 真实 100k task、yield / packet、分阶段 profile |
| S-11 topology commit | grid refine、height topology、shore / lake / route / river | topology revision、完整 geometry、锁引用 | topology Node、prepared atomic install、undo/redo |
| S-12 presentation-only | view mode、theme、layer、pan、hover、preview | map/history 漂移、旧 mode 污染后续夹具 | presentation receipt、revision 0 delta、偏好保存恢复 |
| S-13 picking / overlay | city、marker、route、river、labels 的命中与平移 | 对象引用陈旧、DPR/viewport、overlay camera | picking DTO、stable refs、framebuffer / hit identity |
| S-14 visual / archive export | heightmap、PNG crop、可见图层导出、archive Worker export | canvas 尺寸、主题、裁切、export owner/profile、receipt/checksum、source 或内存地图被改写 | visual bytes / dimensions、archive receipt / checksum、source 不变、revision/history 0 delta |
| S-15 persistence fallback | IndexedDB / localStorage、旧档、保存回执和 fallback | 数据丢失、旧 key、后端切换、错误反馈 | compatibility matrix、roundtrip、原始输入不变 |
| S-16 Loading / feedback | 长操作、快速操作、失败、延迟提示 | 多来源竞争、泄漏内部术语、失败不清理 | single-source state machine、最终隐藏、错误码/文案 |
| S-17 WebGL context restore | 强制 context loss / restore 后继续显示和拾取 | GPU owner 丢失、只恢复部分 layer、假刷新 | 同 map / revision 下 framebuffer、picking、所有 layer 恢复 |

### 4.2 二十个固定入口的重新覆盖

| # | 固定入口 | 风险组 / 规模 | 必须覆盖的典型场景 | 精确 owner stage |
| --- | --- | --- | --- | --- |
| 1 | `regress:map-transaction-browser` | transaction-core / 10k | S-01、S-03、S-04、S-06、S-08、S-15、S-16 | R2a；旧通过结果只作基线 |
| 2 | `regress:worker-regeneration-browser` | domain-regeneration-chain / 10k | S-04、S-05、S-06、S-07、S-08 | R2a/R2b |
| 3 | `regress:population-worker-browser` | population-domain / 10k | S-03、S-06、S-08、S-10、S-13 | R2b |
| 4 | `regress:social-expansion-worker-browser` | society-domain / 10k | S-03、S-05、S-06、S-08、S-13 | R2b |
| 5 | `regress:economy-worker-browser` | economy-domain / 10k-100k | S-03、S-05、S-06、S-08、S-10、S-13 | R2b |
| 6 | `regress:worker-session-browser` | session-concurrency-10k / 10k | S-01、S-04～S-09、S-11～S-13 | R3a/R3b |
| 7 | `regress:worker-session-100k-browser` | session-concurrency-100k / 100k | S-05～S-11、S-13 | R3a/R3b |
| 8 | `regress:grid-topology-browser` | topology / 10k-100k | S-06、S-08、S-10、S-11 | R3b |
| 9 | `regress:regeneration-lock-direct-domains-browser` | direct-lock / 10k | S-04、S-07、S-08 | R3b |
| 10 | `regress:regeneration-lock-compound-browser` | compound-lock / 10k-100k | S-05、S-07、S-08、S-11 | R3b |
| 11 | `regress:city-picking-browser` | picking / 10k | S-03、S-12、S-13 | R4a |
| 12 | `regress:overlay-pan-stability-browser` | overlay / fixture | S-12、S-13 | R4a |
| 13 | `regress:viewport-line-preview-browser` | viewport-preview / fixture | S-12、S-13 | R4a |
| 14 | `regress:heightmap-export-browser` | heightmap-export / 10k | S-12、S-14 | R4b |
| 15 | `regress:png-crop-browser` | png-crop-export / 10k | S-12、S-14 | R4b |
| 16 | `regress:browser-storage-compatibility` | storage-compatibility / legacy-fixtures | S-02、S-15 | R5a |
| 17 | `regress:browser-storage-fallback` | storage-fallback / legacy-fixtures | S-02、S-08、S-15 | R5a |
| 18 | `regress:browser-save-feedback` | save-feedback / 10k | S-14～S-16 | R5a/R5b |
| 19 | `regress:loading-single-source-browser` | loading-state / fixture | S-08、S-09、S-16 | R5b |
| 20 | `regress:delayed-operation-feedback-browser` | delayed-feedback / fixture | S-08、S-16 | R5b |

直接 CDP 的 `S-17` 不冒充固定入口；必须在 R4b 冻结独立夹具，再在 R6b 运行。

## 5. 重新分阶段实施

唯一实施顺序为：`350-R0 → R1 → R2a → R2b → R3a → R3b → R4a → R4b → R5a → R5b → R6a → R6b → R7`。动态插入的产品 / 夹具子阶段完成后必须回到该主链，不得建立第二套顺序。

### 350-R0：重新基线与场景冻结

- 产出本方案、当前计划路由和第一版场景分母。
- 明确前五项旧通过结果仅作为回归基线，不等于免复查。
- 最小验收：文档引用、阶段顺序、20 入口和 17 场景无遗漏；只读评审 `ACCEPT`。
- 产品 / 工具改动：`0 / 0`。

### 350-R1：机器可审计的验收契约目录

- 新增唯一场景 catalog 与 regression，锁定 20 个 package 入口、脚本路径、风险组、规模、场景引用、Node 前置、artifact 和浏览器状态。
- 静态读取 package scripts 与入口源码；拒绝入口缺失、重复、脚本错绑、场景无 owner、未声明 setup / cleanup / error / performance policy。
- catalog 只描述验收契约，不依据产品当前输出自动生成期望值。
- 动态插入 `350-R1-f1`：第 349 项终验防误触审计必须区分 `27` 个顶层 gate 与显式登记的递归依赖；当前唯一允许的子门为 foundation 所需的 `regress:map-adoption-binding-owner`。递归入口仍全部进入浏览器启动原语扫描，禁止以放宽计数掩盖未登记扩张。
- 动态插入 `350-R1-f2`：首轮只读评审发现 owner / risk / scale / policy 仍可填任意字符串，Node 前置未递归扫描源码，防误触 scanner 漏掉 side-effect import。修正必须用权威矩阵与封闭 policy 集逐字段拒绝漂移，让 33 个声明前置及其 package 子门 / tools 导入链进入同一源码扫描，并以 `regress:measurement` 与 side-effect import 两类真实反例证明不能绕过。
- 最小验收：catalog regression、task-349 final-gate audit、typecheck、diff-check；浏览器 `0`。

### 350-R2a：前五项共同事务边界复查

- 复查 S-01～S-09：adoption owner、interactive / headless / worker-only binding profile、commit 顺序、Manifest 写集、镜像、history async、fault/cancel/obsolete。
- 把 generation、persistence import、archive export、headless write 四个第 349 项 profile owner 纳入同一完成度门；archive / headless 不新增浏览器入口，但必须有真实 receipt / checksum / source 不变 / revision 结果。
- 把前五项已出现的每类产品缺陷固化为 Node 负例；不得只匹配修复后的文案或固定 seed ID。
- 先跑共同门，再修产品；夹具问题另插 `R2a-f*`，产品问题另插 `R2a-p*`。
- 动态插入 `350-R2a-f1`：现有纯 Node prepared-installer 已覆盖未提交清理、commit fault、commit 后 rollback/finalize、嵌套 owner、detached rollback、surface / point 范围，但没有 package 入口且前五项 catalog 未引用；history async 也缺少以职责命名的组合门。新增两个显式 package gate，并把它们与 core contracts / facade / manifests 登记为前五项共同 Node 前置；另建串行 `regress:task-350-r2a` 作为本阶段单一复验入口，不修改产品和断言期望。
- 动态插入 `350-R2a-f2`：society-politics 与 settlements 旧协议夹具把同一地图既作为 Worker 可变输入又作为 pre-commit source，无法证明 canonical source 不变并可能掩盖请求外写入。两组改为 canonical source / Worker clone 分离，校验前后深比较 source，领域输出仍必须通过原正式 validator；若暴露产品拒绝，另插 `R2a-p*`，不得在同阶段改 validator。
- 最小验收：foundation、worker task、map replica、三组领域协议、history boundary、prepared installer、独立评审。

### 350-R2b：population / society / economy 领域链复查

- 复查 S-03～S-06、S-08、S-10、S-13：source fingerprint、picking components、stale derived、正式十一领域连续依赖，以及 population / society / economy 三条独立跨域链、pre-commit 性能。
- 固定 10k 与代表性 100k Node task；来源不可变、write-set、alias、history、prepared render 与动态 patch 性能必须同时成立。
- 动态插入 `350-R2b-f1`：population / society 已有真实 10k / 100k Worker task regression，但没有 package 入口且 catalog 只引用较窄 protocol；补显式 task、render-preparation、dependency 与正式十一领域链路由，并用 catalog 删除反例冻结 R2b 必需前置。
- 动态插入 `350-R2b-f2`：三条 task 的 prepared-render 正例只覆盖 adjustment / culture / rebuild 的 10k 首操作；补 transfer、religion、market-assignment 及三条 100k task 的 cities-only picking / binding 对称断言，另固定社会扩张 canonical source 不变，不修改产品或 validator。
- 动态插入 `350-R2b-p1`：`social-expansion.compute`、文化 / 宗教扩张命令和公开 inspector / apply API 已在正式运行时使用，但 society-politics TypeScript Manifest 未登记这些职责，既有 core-manifest 绿灯无法证明其写集和 owner。补现有能力的 command / query / worker / API descriptor 与精确 union 写集，并让 core manifest 从真实 runtime 源核对；不改变运行时行为，不扩展产品功能。
- 动态插入 `350-R2b-f3`：p1 把既有社会扩张 UI/API 门登记进 Manifest 后，该门仍要求第 330 项前的“只读预检 / 同事务联动宗教”旧文案；只把静态断言对齐当前“查看影响范围 / 同时更新宗教分布”，保留动态 Worker、API、history、确认和回滚断言。
- 最小验收：三域任务和协议、whole-map profile、render preparation、typecheck、build、独立评审。

### 350-R3a：session / adoption / concurrency 完成度复查

- 复查 S-01、S-05～S-10：generation adopted session、replica patch、ACK/invalidate、fault/cancel 后 fresh、map replace、pending viewport。
- 将 7400 行 session 浏览器脚本中的前置与产品断言拆成可单独运行的 Node/static contract；不复制浏览器业务链。
- 动态插入 `350-R3a-f1`：补职责命名的 session static contract、10k / 100k graph packet/yield 门、catalog prerequisites 与串行聚合路由；产品源码不动。
- 动态插入 `350-R3a-f2`：首轮评审确认大切片字符串包含可被跨 helper 注释或同 helper 字符串伪造；改用 Babel AST 的精确函数边界与真实 parser tokens，加入两类自证负例，并补条目 6/7 的 worker-task prerequisite 删除反例。
- 最小验收：worker coordinator、adoption owner、replica patch、session contract、100k packet/yield、独立评审。

### 350-R3b：topology / locks / GPU owner 完成度复查

- 复查 S-07、S-08、S-10～S-13、S-17：direct / compound lock、grid topology、prepared atomic install、geometry/color 双 buffer、hard/smooth surface、picking owner。
- 所有 topology / GPU / picking / overlay / label / Worker retained cache 必须具有四字段 `RenderResourceBinding`；source / topology / renderGeneration 任一代次过期都拒绝安装，publish 前失败回滚旧资源，publish 后失败进入 degraded / retry / resync。
- 所有视图偏好由夹具显式保存 / 固定 / 恢复，不依赖前一场景残留。
- 动态插入 `350-R3b-f1`：既有 height / states 锁门仍按旧主线程控制流切片且可被字符串伪证绕过；现改为 Babel AST 对 `DOMAIN_BY_KIND` 八个属性做结构校验，并用完整可执行 token 序列冻结同一 `constraintBundle` 的声明、Worker / states core 透传、五类锁读取、外交冲突与 salt 回滚。三个破坏性反例必须拒绝，产品源码不动。
- 动态插入 `350-R3b-p1`：运行时 renderer / render DTO 仍只有 `mapIdentity + mapRevision + topologyRevision`，context restore 还会复用旧 surface owner；先建立正式四字段资源 binding 和单调 render generation，再沿 prepared installer、cache / picking 与 restore 收口旧代拒绝，不移动夹具预期。
- `350-R3b-p1` 已接受：运行时区分严格三字段 source binding 与完整 resource binding，资源结果必须携带 preparation id / generation；latest-issued、surface owner 原子换代、canonical-first rollback 与 staged context restore 均闭合。
- 动态插入 `350-R3b-f2`：把旧 prepared / render / worker task 夹具从三字段 foundation binding 迁到完整 resource binding，并增加 incomplete/null、跨 identity、full/in-place 逆序提交、迟到 rollback、renderer reload fault 与 context restore fault 自证；产品文件冻结。首轮唯一夹具 blocker 已改用正式 revision/history snapshot 与严格 rollback binding，blocker-only 最终 `ACCEPT / P0 0 / P1 0`。
- 动态插入 `350-R3b-p1a`：`R3b-f2` 首批 in-place 反例发现 descriptor before-image、commit fault 后颜色恢复及 rollback yield 中 owner 接管三项产品残留。单列产品修正，使用专用 before-image、结构回滚与异步颜色恢复分离、每个分片的 current + source owner checkpoint；正式竞态反例用窄 clock seam 确定触发 yield，不依赖机器负载。该阶段接受后回到 `R3b-f2`，不得借机进入 p2。
- 动态插入 `350-R3b-p2`：为 object picking、overlay DOM/city icon bundle 与 label retained data 建立完整 resource owner；prepared transaction 必须同 binding 原子安装/回滚，install/pick/draw 任一旧 map/source/topology/generation 都拒绝。只处理资源同源，不提前吞并 R4a 的 presentation-only、camera/hover/pan 与视觉验收。
- `350-R3b-p2` 已实施待评审：三族 retained wrapper 绑定真实引用并与 surface 校验 map/topology；prepared install、setter fault、rollback、full load 与 context restore 均保持同源。普通 edit/history/regeneration refresh 只为实际变更的 retained 资源签发当前 revision binding，同批 picking / labels 共用同一发行值；incoming 的完整 latest-issued 比较继续承担 source/preparation/generation 淘汰。16-case installer、完整 worker-task、typecheck 与 build 已通过，browser / CDP `0`。
- 动态插入 `350-R3b-p2a`：首轮评审证明 history 的保守 `topologyRevision +1` 不能直接作为 retained-only owner topology，否则与未重建 surface 分叉。retained-only binding 组合当前 sourceRevision 与实际 surface topology；只有 surface 数据真实刷新时才使用 current topology，并在 draw 前让 surface / picking / labels 共享该 binding。必须用正式 `MapRevisionTracker.advance()`、真实 surface owner 和同步/异步/history/city relocation 路径证明 mismatch 为空；fake call recording 不再足够。
- `350-R3b-p2a` 首次 blocker-only 又发现 async picking→surface 分块 yield 可观察临时 topology 混装，且 guard fault 无恢复。当前实现为 surface-refreshing async batch 增加显式 retained publish suspension；中间每个 yield 的 draw/pick 都被 suspension 隔离，成功在无 yield 终点统一 ready，失败明确 invalid。17-case 现含 async surface success 与第二 checkpoint guard fault，连同完整 worker-task、typecheck 和 1397-module build 均通过，待第二次 blocker-only。
- `350-R3b-p2a` 第二次 blocker-only 最终 `ACCEPT / P0 0 / P1 0`；R3b 的 topology / locks / GPU + retained owner 范围全部冻结，进入 R4a。
- 最小验收：grid topology、lock bundles、renderer owner、context-loss 静态可执行性、100k Node 门、独立评审。

### 350-R4a：presentation / picking / overlay 完成度复查

- 复查 S-11～S-13：view / theme / layer、camera、hover、city/marker/route/river picking、overlay pan、line preview，以及 presentation cache 的 `renderGeneration` 代际。
- presentation-only 可复用 cache 也必须按 `RenderResourceBinding` 校验 map / source / topology / render generation；不得以引用仍存活代替代际同源。
- presentation-only 必须证明 map revision/history/Worker input 为 0 delta；地图替换保留偏好与隔离夹具显式前置同时成立。
- 动态插入 `350-R4a-f1`：固定入口 11～13 的 Node 前置扩为 presentation contract、GPU display、prepared retained owner、五类 picking、deferred replay、pan/hover/preview，并用逐项删除反例锁定；新 1k contract 证明 live theme 不写 canonical owner，存档只在独立 document 投影主题且 source checksum 不变。
- `R4a-f1` 首败暴露产品 blocker：普通 `layers.setTheme` 在 revision/history 不变时仍改写 `map.visualTheme / map.options`，造成同 revision Worker replica checksum 漂移；反向直接删除写入又会因 `createMapDocument` 的 source precedence 丢失当前主题。现插入纯产品 `350-R4a-p1`，先分离 live intent 与 export projection，再返回冻结夹具。
- `350-R4a-p1` 已按冻结契约实施：runtime theme intent 不再写 canonical map，存档仅在独立 normalized document 上投影当前 theme，并保留 overrides / user themes。presentation、GPU display、visual themes、API data compatibility、完整 Worker、typecheck、build 与 diff 均过，现待同一只读评审；既有 map-file Worker 夹具仍使用两字段 binding 的失败单列为后续纯夹具 `R4a-f2`，不得反向放宽产品 binding。
- `R4a-p1` 首轮评审发现两个同边界产品残留：history before-image 仍混用 live/canonical preset，active registry-only user theme 导出只有 ID 没有定义。动态插入纯夹具 `R4a-f1a`，固定四类命令的独立 presentation state、`live != canonical` undo/redo 和 portable user-theme 往返；首败已落在 create 命令缺少显式 live state，随后只在 `R4a-p1` 修产品并做 blocker-only。
- `R4a-p1` blocker-only 修正已冻结：theme command 的 canonical/presentation 状态分离，scheduler 使用 command 当前方向的 presentation preset；所有正式 export caller 显式携 active registry-only user theme 文档，map-file projection 只改独立副本。新增边界门与既有 presentation/visual-theme/API/Worker/typecheck/build 全过，待同一评审接受后再处理独立 `R4a-f2`。
- 第一次 blocker-only 确认 portable export 已闭合，但 canonical/registry 的 `userThemes` 集合仍共用 before-image。动态插入纯夹具 `R4a-f1b`，覆盖 registry 超集下 create/import/update/delete current/non-current 五类 history 往返；首败已固定，随后在 `R4a-p1` 分别保存、应用两份集合，并使用第二次 blocker-only 作最终收口。
- `R4a-p1` 最终产品修正已完成：两份 themes 集合各自 capture/apply/revert，四类命令分别 upsert/remove；五类 registry-superset 门与所有相邻主题/显示/类型/构建门通过，待第二次 blocker-only 接受。
- `R4a-p1` 第二次 blocker-only 最终 `ACCEPT / P0 0 / P1 0`，theme live/canonical/registry 与 portable export 范围冻结。现进入纯夹具 `R4a-f2`，迁移 map-file Worker 的旧 incomplete render binding 后再返回 R4a 聚合门。
- `R4a-f2` 已用正式 complete binding 同步 request/expected，map-file Worker 全套含 100k、render-preparation 10k、typecheck 与 diff 通过；产品改动 `0`，待同一评审接受。
- `R4a-f2` 独立评审 `ACCEPT / P0 0 / P1 0`：完整 binding 五项、正式 Worker/DTO/progress、旧档/压缩/损坏/100k 与产品 validator 冻结均成立。阶段接受，返回 R4a 对 presentation cache generation、异步 publish 和 stale owner 的源码级完成度审计。
- 动态插入 `350-R4a-f3`：盘点确认 line / point / route / river / trade-flow / selection 六类真实 WebGL cache 没有 binding owner/wrapper，draw 也不检查其 map/topology/renderGeneration 和实际引用。纯夹具固定六族集合、source revision 可不同但 map/topology/generation 必须兼容、引用混装拒绝、prepared before-image 事务、context restore 与 route/river 最后 current gate 后 publish；首败为 helper module 缺失，产品改动 `0`，后续单列 `R4a-p2` 实施。
- `R4a-p2` 聚合首次在 `markers-core` 的旧 picking DTO binding 首败；插入纯夹具 `R4a-f4`，用正式 `createRenderResourceBinding` 固定 map/source/topology/preparation/generation，build/rebuild 使用同一对象，产品 validator 不动。接受后从首败点继续 p2。
- `R4a-f4` 独立 `ACCEPT / P0 0 / P1 0`：五项 binding、同源 DTO 往返、8 个 marker 的 point/pick/DTO/export 与产品 validator 冻结均闭合；返回 p2 聚合。
- `R4a-f3` 第一次独立评审为 `BLOCK / P0 0 / P1 3`，归因均是夹具而非产品：正则源码断言可由注释/字符串假冒、引用反例未穷举六族全部字段、catalog 删除矩阵遗漏新前置。阶段重新冻结为 AST executable call + route/river current-before-publish 顺序、17 个引用字段逐项变异、入口 11～13 各自删除新前置必须失败，并加入 3 个 comment/string mutation 自反例；`R4a-p2` 产品不动，待 f3 blocker-only 接受后才评审产品。
- `R4a-f3` 第一次 blocker-only 为 `BLOCK / P0 0 / P1 2`，仍属夹具语义不足：`if(false)` draw 与 `(call,false)` async gate 可通过，产品新增 wrapper 字段也不在夹具自有矩阵中。第二次修正冻结 draw 直接 try-block 语句、route/river 的 negated current call 必须直接参与拒绝 OR 且该分支 return false、publish 在拒绝分支后；再以 wrapper exact keys 对称锁住产品矩阵。破坏性 AST 自测由 3 增至 5，产品继续冻结。
- `R4a-f3` 第二次 blocker-only 为 `BLOCK / P0 0 / P1 1`：同步 uploader 仍使用递归 call 搜索，未调用箭头函数可以冒充 adopt。最窄收口为八个上传方法逐一要求正确 method body/try block 的直接 adopt，route/river async 还固定第三参数；selection 的真实调用替换为未调用箭头函数必须失败。AST mutation 增至 6，产品继续冻结。
- `R4a-f3` 最终复核 `ACCEPT / P0 0 / P1 0`：八条正式 uploader、async current rejection、exact wrapper key set、17 个引用变异和 6 个 AST mutation 均成立。阶段冻结，进入独立 `R4a-p2` 产品评审。
- `R4a-p2` 产品评审 `BLOCK / P0 0 / P1 4`，插入 `R4a-p2a`：partial prepared topology 必须与实际 surface 同源；same-generation surface commit 必须事务性重绑 retained picking/label/overlay；trade-flow pick 必须校验 cache owner/ref；context restore 必须 staged 且受 latest-issued/map guard，迟到结果不得覆盖或清理新 owner。
- `R4a-p2a` 已以四组正式反例收口：partial request `source +1 / topology=surface` 与 full replacement topology 前进；in-place surface commit/rollback retained exact owner/wrapper；trade pick reference/map/topology/generation 拒绝；restore 受控 yield 中发行 B 后 A 返回 `render-context-restore-obsolete`、只清 staged。installer 19-case、worker-task、相邻显示/类型/10k/build/diff PASS，待 blocker-only。
- `R4a-p2a` 第一次 blocker-only 仍 `BLOCK / P0 0 / P1 1`：obsolete attempt 清理正确，但事件 owner 未重启，renderer 永久停在 restoring。最窄修正为事件只调用 `restoreWebGlContextUntilCurrent`，该 owner 对 obsolete 重新发起完整 staged restore；单次 attempt 先退出为 lost。反例升级为两次 attempt、一次成功 draw、最终 ready/lost=false，同时 A 不清 current。
- `R4a-p2a` 第二次 blocker-only 为 `BLOCK / P0 0 / P1 1`：第二 attempt 未继承 takeover B，fixture 又以 stub 冒充成功。现采用 B→C 语义：owner 每轮 obsolete 后取当前 latest 作为 retry source，正式 restore 以其 source/topology 发行新 context generation；第二 attempt 在真实 1k map/FakeGL 上完整执行，断言六族 cache、surface 与 retained owners 全部绑定 C、唯一 draw 和 ready。新 D 仍可让 C obsolete 后继续收敛。
- `R4a-p2a` 最终 blocker-only `ACCEPT / P0 0 / P1 0`：A obsolete 后经微任务捕获 latest B，第二次真实产品 restore 由 B 派生 C；`source/topology` 保持、generation 前进，所有 surface/cache/retained owners 对齐 C，唯一 draw 后 ready，普通 fault 单次退出。独立 worker-task、installer 19-case、typecheck、语法与 diff-check PASS，browser/CDP `0`。现以 R4a Node 聚合和 build 作为阶段最终门。
- R4a Node 聚合与生产 build 已通过：catalog `16 invariants / 17 scenarios / 20 fixed entries`，presentation/theme/registry、GPU/cache、Worker/render/installer/picking/overlay 全组以及 typecheck 均 PASS，build `1398 modules`。browser/CDP `0`；只待同一评审做全阶段 inventory，接受后进入 R4b。
- R4a inventory `BLOCK / P0 0 / P1 2`，未发现产品缺陷：f2 map-file Worker 未被最终聚合直接引用，AGENTS/handoff 的旧状态和 p2 误置 f2 段又使阶段不能可靠闭合。插入纯夹具/文档 `R4a-f5`：聚合新增 `regress:map-file-io-worker`，catalog audit 明确锁住并含删除反例；统一回写 f1～f4、p1/p2/p2a 的最终接受状态，删除误置内容。产品源码冻结；f5 blocker-only 接受后才进入 R4b。
- `R4a-f5` 已完成：阶段 aggregate 新增并真实执行 map-file Worker；catalog audit 对实际 scripts 强制前置，删除反例必败。更新后的完整 R4a 聚合含 map-file plain/压缩/损坏/100k、其余 presentation/cache/picking/overlay 与 typecheck 全 PASS；权威状态已统一，产品 `0`、browser/CDP `0`，待 blocker-only。
- `R4a-f5` 首次 blocker-only `BLOCK / P0 0 / P1 1`：文档 P1 已闭合，仅剩 aggregate parser 会接受 echo/comment token。审计现把命令切成 `&&` 段并要求每段完整匹配直接 `pnpm run <script>`；新增 echo 与 comment 两个破坏性反例。产品及此前完整聚合冻结，只做最窄 blocker-only。
- `R4a-f5` 最终 blocker-only `ACCEPT / P0 0 / P1 0`：真实直接 map-file 前置保留，删除、echo 与 comment 三类绕过均由正式 aggregate validator 拒绝；catalog、语法、diff 独立 PASS，产品/browser 均为 `0`。R4a 最终冻结，进入 R4b。
- 最小验收：相关 Node 门、API schema、renderer/picking static contract、独立评审。

### 350-R4b：export / context restore 完成度复查

- 复查 S-14、S-17：heightmap、PNG crop、当前 canvas/layer/theme 同源；context loss 后同一地图恢复全部 layer 与 picking。
- 新增独立 context restore 夹具前，先冻结 debug hook、断言、恢复和 artifact；不得刷新页面或生成新图。
- 动态插入纯夹具 `R4b-f1`：heightmap / PNG crop 固定为 10k，导出窗口采集并硬拒绝 `>200ms` LongTask，前后 map checksum/revision/history/camera/layers/theme 精确不变，功能首败和 teardown 都写 full/summary artifact；新增独立 context restore browser fixture，先冻结 `debug.simulateContextLoss` 的异步 receipt、同图 binding/owner、全部 layer 与 city picking、唯一恢复 draw、failure-safe artifact。只做语法/静态契约，不运行浏览器；产品 hook 在夹具接受后单列 p1。
- `R4b-f1` 最终接受：AST 只承认 owner try 与 `page.evaluate` 回调的直接语句，`27` 个不可达、未调用、错误变量流和 owner 错绑变异全部被拒绝；共享 artifact helper 的成功/功能失败/teardown/timeout 四态均有 Node 证据。context 同时冻结恢复前全部 owner 非空且等于 before binding、恢复后全部 owner 等于 after binding；browser/CDP `0`。
- 动态插入 `R4b-p1`：实现实验性 `debug.simulateContextLoss`，仅作为冻结浏览器方案的受控桥接。产品必须复用 renderer 真实 `webglcontextlost/restored` 与 `restoreWebGlContextUntilCurrent`，不得直接调用 restore 或刷新页面；公开参数只允许有界 `restoreDelayMs`。调用前校验 surface、六族 cache、picking/label/overlay 精确同源；成功 receipt 返回 before/after binding 和 draw delta，source/topology 不变、generation `+1`、一次 draw、最终 ready；并发/无 map/无扩展/timeout 结构化拒绝。
- `R4b-p1` 已实施待评审：console debug API 与 schema/capability 已登记，renderer 通过真实 `WEBGL_lose_context` 扩展事件触发既有恢复链；确定性 Node 假扩展只控制事件时序，不替代产品 owner、恢复与 receipt 断言。专项覆盖成功、并发、参数、无扩展和混装 owner；完整 R4b Node 聚合、API `329` 项、capability `1229 / 1155 / 74 / 0 / 0`、Worker context、cache、installer、主题、picking、typecheck、`1398 modules` build 与 diff 全绿，browser/CDP `0`。
- `R4b-p1` 首轮评审 `BLOCK / P0 0 / P1 3`，插入最窄产品/夹具阶段 `R4b-p1a`：事件 waiter 增加显式 cancel，lose/restore trigger 同步抛错时移除 listener 与 timeout 并清空 debug promise；构造器正式 lost/restored handler 提取为可复用 renderer 生命周期方法，专项必须安装该正式 handler，扩展仅控制事件；API schema 登记 cache/retained owner mismatch，并补两类同步 fault 与 retained mismatch。窄门通过后只做 blocker-only 复审，不重跑未变化的 export 大门或浏览器。
- `R4b-p1a` blocker-only 最终 `ACCEPT / P0 0 / P1 0`：原三项 blocker 均由产品路径与正式负例闭合，独立 context 专项、语法、typecheck、diff PASS，browser/CDP `0`。R4b 至此接受，下一阶段按固定顺序进入 R5a persistence / restore 兼容复查。
- 最小验收：export Node、PNG options、renderer restore contract、夹具语法和独立评审；浏览器 `0`。

### 350-R5a：persistence / compatibility 完成度复查

- 复查 S-02、S-14、S-15：v1、当前 v3、holey / 高编号对象、storage backend、save receipt、archive export receipt、fallback。
- generation / persistence import / archive export / headless write 四 profile 与 R2a 使用同一 owner vocabulary；archive 必须校验 identity、checksum、bytes receipt 和 source 不变，headless write 必须真实 commit 且 revision 精确 `+1`。
- 输入文件和内存地图保持不变；migration / rescue 只作用于导出副本；保存 bytes / checksum / receipt 同源。
- 最小验收：map-file、whole-map profile、compatibility、storage、save Node 门和独立评审。
- 基线结果：whole-map 四 profile、map-file Worker plain/gzip/browser-envelope/损坏/100k、API data compatibility、v1→v3 migration、cloud storage 与 map-storage 用户文案通过；`map-save-naming` 唯一首败为旧同步 refresh 源码形状。插入纯夹具 `R5a-f1`，只把断言迁移为 `loadMapIntoRuntime` 内 awaited async refresh → cloud preview → filename-template UI 的正式顺序，产品 `0`，接受后返回 R5a 完成度盘点。
- `R5a-f1` 首评 `BLOCK / P0 0 / P1 1`：文本正则可从不可达代码取证。现升级为 Babel AST 的 `FunctionDeclaration → outer TryStatement → three adjacent direct ExpressionStatement`，并增加 if-false、string、unused-function 三个破坏性 mutation；产品文件仍为 `0`，只做 blocker-only 复审。
- `R5a-f1` blocker-only 第二次 `BLOCK / P0 0 / P1 1`：可达性问题已闭合，但调用形状未精确到 optional 类型、参数数量/顺序与 options exact keys。已冻结最窄第三轮方案：refresh 恰好三参且 options 恰好 `restorePanels/operation/isCurrent`；preview 必须完整 optional chain、零参；sync 必须 `(documentRef,state)`；增加非 optional、错序、多参、多 option 四类 mutation。触发“夹具连续两次失败”停止条件，等待用户裁定后才能继续。
- 用户授权第三轮后已按冻结范围实施：三条调用均做 exact AST shape/arity/order，options 恰好三键；新增五个调用形状 mutation，与三类可达性 mutation 合计 `8` 类全部拒绝。最终 blocker-only `ACCEPT / P0 0 / P1 0`，产品 `0`，专项/语法/diff PASS；返回 R5a 产品完成度盘点。
- 完成度盘点确认旧 Node 门只验证 storage envelope / migration，未直接执行真实 LocalStorage / IndexedDB 仲裁，也未把当前档 holey / 高编号 identity array 的“导出副本补洞、源图不变”冻结为完成条件。插入纯夹具 `R5a-f2`：确定性 fake storage 覆盖 local、quota/no-local fallback、savedAt、新旧 raw、direct-binary 与读写故障；真实 1k 图扩展 city/burg `5000`、route `7000`，要求投影 hole 显式 null、roundtrip 保号、源数组与高编号对象引用不变。`regress:persistence-boundary` 已纳入固定入口 16/17、persistence-import/archive-export profile 和 `regress:task-350-r5a` 聚合，catalog 含删除反例；产品 `0`，专项/catalog/语法/diff PASS，待聚合及独立评审。
- `R5a-f2` 首评 `BLOCK / P0 0 / P1 1`，产品问题 `0`：`Array.every` 跳过空槽，且只核对首个 hole，坏实现只补首洞仍可经 JSON roundtrip 假绿。插入 `R5a-f2a`：按索引逐槽要求 own-property，源 hole 对应投影严格为 null；三类 identity array 均用“只补首洞”破坏性反例证明 validator 会拒绝。仅做专项/catalog/语法/diff 与 blocker-only 复审。
- `R5a-f2a` blocker-only 最终 `ACCEPT / P0 0 / P1 0`：逐槽 own-property/null、三类只补首洞 mutation、源数组与高编号对象 before-image 均经独立确认；专项/catalog/语法/diff PASS，browser/CDP `0`。返回 R5a 主阶段 inventory，确认无未覆盖 persistence blocker 后才进入 R5b。
- R5a inventory 首评 `BLOCK / P0 0 / P1 1`，产品与夹具问题均为 `0`：handoff 表头仍停在 f2 待评审，产品文件栏也只写 f1。插入纯文档 `R5a-f3`，仅把表头同步为 f1/f2a 已接受、当前 R5a inventory，并明确 f1/f2/f2a 产品文件均为 `0`；blocker-only 接受后关闭 R5a。
- `R5a-f3` blocker-only 与 R5a 主阶段最终均 `ACCEPT / P0 0 / P1 0`：权威文档状态已统一，四 profile、v1/current/high-id、storage/direct-binary、archive receipt/source immutable、headless exact revision `+1` 均无残余 blocker。固定顺序进入 R5b；browser/CDP `0`。

### 350-R5b：Loading / feedback / error surface 完成度复查

- 复查 S-08、S-09、S-16：成功、no-op、busy、invalid、obsolete、cancel、fault、retry、快速和延迟操作。
- 普通 UI 不泄漏 Worker / session / packet / buffer 等内部术语；每条路径结束 Loading 隐藏且下一操作可用。
- 最小验收：API operation、Loading/feedback Node 门、copy audit、独立评审。
- 廉价基线：API operation、delayed feedback、UI copy matrix、storage copy 通过；global-shell 因仍期待旧“正在装配地图引擎”首败。插入纯夹具 `R5b-f1`，只迁移为正式入口当前“正在展开地图画卷”，产品 `0`。同时真实 Node 复现普通启动错误页原样显示 `Worker session buffer checksum mismatch`，违反技术术语隔离，登记为后续独立产品 `R5b-p1`；f1 接受前不混修。
- `R5b-f1` 首评 `BLOCK / P0 0 / P1 1`，仅根 AGENTS 的当前状态仍停在 R4b；夹具迁移本身忠实，产品问题 `0`。插入纯文档 `R5b-f1a` 同步 R5a 已接受、f1 待 blocker-only 与 p1 已冻结，不改夹具/产品。
- `R5b-f1a / f1` 最终 `ACCEPT / P0 0 / P1 0`。实施独立产品 `R5b-p1`：启动页与 app-status 使用同一普通错误 formatter，通用文案不含 Worker/session/buffer/checksum；原始异常仍进入 health/console，显式 debug formatter 保留详情。global-shell 直接用技术错误验证普通/debug 分层，并锁定 main 不再拼接原始异常；产品边界仅 startup-loading/main。
- `R5b-p1` 首评 `BLOCK / P0 0 / P1 1`，仅根 AGENTS 当前状态仍停在 f1 待复审；产品和夹具无 P1。插入纯文档 `R5b-p1a`，同步为 f1/f1a 已接受、p1 待 blocker-only，不改产品或测试。
- `R5b-p1a / p1` 最终 `ACCEPT / P0 0 / P1 0`。插入纯夹具 `R5b-f2`：operation 覆盖 snapshot/rollback fault 与 late report 后共 12 边界；delayed feedback 使用可控时钟固定 23/24ms、错 ID、unknown token、destroy timer；UI copy 对 startup/storage/regeneration/lazy/transform 181 样本执行 Worker/session/packet/buffer/storage/revision 等 21 禁词。固定入口 18～20 与 R5b aggregate/catalog 均强制对应 Node 门并有删除反例；产品 `0`，完整聚合 PASS，待独立评审。
- `R5b-f2` 首评 `BLOCK / P0 0 / P1 1`，catalog 只锁了三个入口的新增前置子集，删除原有 api-operation/delayed/map-save-naming 仍可接受；其它专项无 P1。插入纯夹具 `R5b-f2a`，把入口 18～20 已声明的完整前置集合纳入 requirements，并为每一项增加删除 mutation；产品 `0`，只做 blocker-only。
- `R5b-f2a / f2` 最终 `ACCEPT / P0 0 / P1 0`：入口 18～20 的 11 项完整前置逐项强制、逐项删除拒绝；catalog/语法/diff PASS，browser/CDP `0`。返回 R5b 主阶段 inventory，确认 S-08/S-09/S-16 无残余 blocker 后才进入 R6a。
- R5b inventory 首评 `BLOCK / P0 0 / P1 1`：高度面板缺少浏览器存储时会把 `LocalStorage` 直接写入普通 notice，curated UI-copy 样本没有执行该路径。插入 `R5b-p2`，统一缺存储/访问拒绝的普通提示，显式 debug 与结构化 diagnostic 保留技术详情；Node 门直接经正式 `createHeightPanel` 保存命令验证两条失败路径。R5b aggregate、固定入口 19/20 与 catalog 删除 mutation 同步，固定前置从 11 增至 13 项；browser/CDP `0`，待独立评审。
- `R5b-p2` 最终 `ACCEPT / P0 0 / P1 0`：正式高度面板动态门确认 missing/getter-denied 普通提示不泄漏，debug/diagnostic 保留原始信息且新增 command seam 没有第二套实现；专项、183 samples UI-copy、catalog、typecheck、语法、diff 均独立 PASS。返回 R5b 最终 inventory，browser/CDP `0`。
- R5b 最终 inventory 第二轮 `BLOCK / P0 0 / P1 1`：高度模板首次写入抛 `QuotaExceededError` 时，`saveTerrainProgram` 已提前发布内存集合，同名重试产生 `-2` 并连同 ghost 一起持久化，失败 receipt 也缺 structured cause。插入 `R5b-p3`，只把保存收敛为 `nextPrograms → persist → publish`，并在持久化边界包装写入异常；动态门要求失败后同名重试保持原 id、最终仅一项、diagnostic 保留 backend/cause。delete/restore/import 无同类内存发布问题，browser/CDP `0`。
- `R5b-p3` 最终 `ACCEPT / P0 0 / P1 0`：失败保存不发布内存状态，document 校验错误不被 storage 包装，真实 quota receipt 保留 cause；同名重试保持原 id 且持久化严格一项，missing/denied 回归闭合。专项、183 samples、typecheck、语法、diff 独立 PASS，browser/CDP `0`。返回 R5b 最终 inventory。
- R5b 主阶段最终 `ACCEPT / P0 0 / P1 0`：operation/delayed/ordinary copy/height template fault 与入口 18～20 前置均无残余 blocker；完整 R5b aggregate 与 diff 独立 PASS，browser/CDP `0`。固定顺序进入 R6a，产品树冻结。

### 350-R6a：浏览器夹具冻结

- 二十个入口逐项声明固定 seed / 文件、setup、目标窗口、断言、cleanup、full / compact artifact 和 `>200ms` policy。
- 夹具只能消费 R1 catalog 和正式 API；不得从产品输出动态生成预期契约。
- 先修夹具并评审，产品树冻结；R6a 接受后产品和夹具不得在同一后续阶段同时修改。
- 最小验收：20 脚本语法、artifact failure self-test、静态契约、build、独立评审；浏览器 `0`。
- 实际为 20 个 catalog 入口、19 个唯一脚本；入口 6/7 共用 worker-session 脚本但必须冻结两套 mode/scale。先运行语法、artifact helper、既有 R4b contract 与 build 基线，再按首败插入纯夹具子阶段；本阶段产品文件保持 `0`。
- 基线首败为共享 artifact self-test 的 renderer 源码断言漂移：旧断言要求 full refresh 先于 hard-cell patch，正式实现已在高度/关闭平滑/零 range 时先 patch，成功后 rebind/draw，失败才 full fallback。插入纯夹具 `R6a-f1`，改为方法切片与当前顺序，并加删除 patch/关闭平滑前置 mutation；browser/CDP `0`。
- `R6a-f1` 首评 `BLOCK / P0 0 / P1 1`：文本 regex 未锁 `if(patch)` 与早返，两个破坏行为均假绿；产品问题 `0`。插入 `R6a-f1a` 改用 Babel AST 固定 direct 条件/声明/成功分支/rebind/draw/return flags/失败 full fallback，并增加 `if(false)`、删除早返 mutation；最窄门 PASS，待 blocker-only，browser/CDP `0`。
- `R6a-f1a` 复审仍 `BLOCK / P0 0 / P1 1`：原两绕过闭合，但 patch/rebind/draw/full fallback 只看 callee，错误实参仍假绿，hard guard 漏 `!map`。插入最后 blocker-only `R6a-f1b` 精确锁定全部实参与完整 guard，并增加 `[]/{draw:true}`、无参 full fallback mutation；最窄门 PASS，待复审，browser/CDP `0`。
- `R6a-f1b / f1a / f1` 最终 `ACCEPT / P0 0 / P1 0`：AST 直达控制流、关键实参和六项 mutation 全闭合；artifact self-test、语法、diff 独立 PASS，产品 `0`、browser/CDP `0`。
- inventory 确认 9 个入口尚未形成 full+compact finally artifact。按独立可验收边界插入 `R6a-f2`（入口 1/11/12/13 transaction/presentation）与 `R6a-f3`（入口 16～20 persistence/feedback），两阶段均只改夹具、保留原硬断言/性能策略；完成后再冻结 catalog 与统一静态 contract，browser/CDP `0`。
- `R6a-f2` 已为四个 transaction/presentation 脚本接入共享 failure-safe artifact：startup、功能失败、限时 teardown、finally persist 与原错误重抛形成同一 owner；full 沿用原 stdout report，compact 冻结旧断言输入。新增 AST contract 锁定 4 脚本 78 个既有断言与 32 类生命周期 mutation；专项/self-test/语法/diff PASS，产品 `0`，待同一只读评审，browser/CDP `0`。
- `R6a-f2` 首评 `BLOCK / P0 0 / P1 3`：两处 Playwright require 仍逃逸 owner，断言仅计数、compact 仅查键。动态插入纯夹具 `R6a-f2a`：startup 全部入 owner；78 个 assert 与显式 if/throw guard、full/compact 构造及依赖使用规范 AST digest；map/overlay/viewport 补齐逐操作与逐样本证据。130 项 mutation 逐断言 noop、compact null/错源、全部 startup 外移及生命周期破坏均拒绝；最窄门 PASS，待 blocker-only，产品 `0`、browser/CDP `0`。
- `R6a-f2a` blocker-only 仍发现 compact producer 链未完全进入 digest：map `verifyRoundTrip` 可伪造 `historyDelta`。最终收口不再枚举部分依赖，而是对四个夹具整棵规范 AST 计算 digest，并补 `historyDelta:999` 精确 mutation；131 项反例全拒绝，待最后 blocker-only，产品 `0`、browser/CDP `0`。
- `R6a-f2a / f2` 最终 `ACCEPT / P0 0 / P1 0`：完整 producer AST、78 个正式断言、131 个生命周期/数据流 mutation 均经独立复核；产品 `0`、browser/CDP `0`。按既定拆分进入 `R6a-f3` persistence/feedback 五脚本。
- `R6a-f3` 最终 `ACCEPT / P0 0 / P1 0`：五个 persistence/feedback 入口的 failure-safe owner、LongTask 原始条目/汇总、`>200ms` 硬门、208 个旧断言及 340 个 mutation 经同一评审独立复跑接受；产品 `0`、browser/CDP `0`。
- 按既定“最后统一冻结 catalog”进入 `R6a-f4`：catalog schema `3` 将 20 个入口状态统一置为 `frozen`；新增 19 个唯一脚本的规范 Program AST digest、逐脚本语法与逐脚本可执行 mutation，catalog audit 硬门 artifact/finally 及非 presentation-zero 的 LongTask。R6a 聚合必须串行执行 catalog、两套 artifact self-test、R4b/R6a 静态契约、fixture freeze、typecheck 与 build；产品 `0`、browser/CDP `0`。
- `R6a-f4` 首评唯一 `P1` 为 aggregate 白名单不封闭：实际八项安全门正确，但 validator 接受额外 browser 段。动态插入纯路由 `R6a-f4a`，将 R6a 聚合分段与八项 requirements 做保序精确相等，并以三类固定 browser entry 尾部追加反例证明 browser0 路由不可扩张；只做 blocker-only，产品/fixture/browser 均为 `0`。
- `R6a-f4a / f4` 最终 `ACCEPT / P0 0 / P1 0`：八项 R6a 聚合成为保序精确白名单，三类 browser entry 追加均被正式 validator 拒绝；catalog、19-script freeze、aggregate/build 与 diff 独立通过。R6a 产品/浏览器运行均为 `0`，夹具树冻结，进入 R6b。

### 350-R6b：分组浏览器验收

- 用户授权已取得。
- 每组先运行最小聚焦 smoke，再按 1～20 顺序运行固定入口；首败即停并持久化证据。
- 一个产品 blocker：插入产品阶段并回到对应 R2～R5 完成度审查；一个夹具 blocker：单独修夹具并复审。
- 同组出现第二个新的基础产品 blocker，停止该组浏览器并整体重审，不继续靠重试逼近。
- 固定入口 1 首败：`features` 的合法 commit 后 render binding 被领域 validator 用提交前 compute revision 误拒绝；artifact 位于 `Z:\tmp\codex\2026-08-21\task-350-r6b\map-transaction-{full,summary}.json`，入口 2～20 未运行。
- 动态插入产品阶段 `R6b-p1`：通用 Worker mutation 对 prepared render 与已签发完整 resource binding 做 exact pre-commit 校验，五组领域协议分别接收 compute / render binding；Node 正例固定 `compute revision N / render revision N+1`，负例固定缺 expected、旧 revision、伪造 preparation id / generation。五组直接协议、完整 worker-task、typecheck、语法与 diff 通过，同一只读评审最终 `ACCEPT / P0 0 / P1 0 / browser 0`；foundation 聚合中的 adoption-owner 旧静态顺序探针单列为既存无关问题，直接 foundation 协议已通过。现生产构建后只复验入口 1。
- R6b-p1 后 `1399 modules` build 通过；入口 1 目标复验越过原 revision 拒绝，首败推进为 features 的 `route / river / tradeFlow:owner-topology-revision`，后续入口继续冻结。插入 `R6b-p2`：同一 live map 的 full-surface 换代可保留未准备且提交前完整同源的 cache 引用，并在安装事务内把 owner/wrapper 重绑到目标 binding；不同 map 对象、提交前混装和 rollback 漂移必须拒绝。最窄 installer 正反例与独立评审接受前不再运行浏览器。
- `R6b-p2` 已实施待评审：六族 cache 的提交前完整性检查、目标 owner/wrapper 重绑与 before-image rollback 均进入正式 installer；只有对象相同的 live map 可走该路径。首轮专项抓到 cache registry 误门控 picking/overlay，最窄拆分后 installer `20 cases`、render preparation、cache binding、panel refresh、完整 worker-task、typecheck、语法、diff 全绿；产品约 `1 / 30` 行、夹具约 `1 / 125` 行，browser 修正后 `0`。
- R6b-p2 首评 `BLOCK / P0 0 / P1 1`：same identity / different map object / same generation 下，未显式 rebind 的旧 wrapper 仍可匹配新 surface。插入 `R6b-p2a`：full-surface 对象替换必须签发不同于 previous surface 的 generation，否则提交前拒绝；新增正式负例并将两项 nested ownership 第二次替换迁移到 generation 2。installer `20 cases`、typecheck、语法、diff PASS，browser0，现只做 blocker-only 复审。
- `R6b-p2a / p2` 最终 `ACCEPT / P0 0 / P1 0 / browser 0`：generation 硬门在任何正式写入前拒绝跨对象旧代，same-object full/in-place 与不同对象新 generation 路径保持；正式反例命中精确错误并冻结 map/六族 registry 不变。installer20、typecheck、语法、diff 独立通过；现 build 后只复验入口 1。
- p2a 后 `1399 modules` build 通过；入口 1 的 features 正向链通过，首败推进为 `history.undo.generate.regenerate.features` 的 `tradeFlow:owner-topology-revision`。根因是 history/edit scheduler 的 full-surface refresh 绕过 Worker installer，只更新 surface 与 picking/overlay，未更新没有 dirty 重建的 tradeFlow cache owner。插入 `R6b-p3`：`refreshCellSurface` 必须在首次 draw 前复用既有全 retained/cache 原子重绑 helper，更新 owner 而不替换物理 cache 引用；新增真实原型 topology 换代正例和退回部分重绑的 AST 反例，独立接受前 browser0。
- `R6b-p3` 已实施待评审：cache binding `17 reference / 24 negative / 7 AST mutation / historySurfaceCacheRebind=true`、installer20、history async、panel refresh、完整 11-kind worker-task、typecheck、语法、diff PASS。后续入口继续冻结。
- R6b-p3 首评 `BLOCK / P0 0 / P1 2 / browser 0`：helper 缺少旧 owner/wrapper/ref preflight，可洗白漂移引用/跨 map owner；AST 递归搜索可接受不可达调用。拆为纯夹具 `R6b-p3a` 与纯产品 `R6b-p3b`，禁止同时移动期望和实现。
- `R6b-p3a` 以 route reference drift、tradeFlow other-map owner 两个动态拒绝固定产品边界；AST 要求主 try block direct guarded call 在 direct draw 前，并加 `if(false)`/unused closure mutation。fixture-only `17/26/9` PASS，正式专项按预期红于产品未拒绝 route 漂移，syntax/diff PASS，产品0/browser0，待独立接受红门。
- p3a 首评 `BLOCK / P0 0 / P1 1`：调用前 direct return 可维持索引顺序而使发布不可达。插入 blocker-only `R6b-p3a1`，拒绝 rebind 前 direct return/throw并新增 early-return mutation；fixture-only `17/27/10` PASS，正式红门不变，产品0/browser0，只做 blocker-only。
- p3a1 复审再次 `BLOCK / P0 0 / P1 1`：direct return 已拒绝，但 `if(true) return` 仍可让调用不可达并假绿。同一夹具阻断连续两次，按根门禁冻结，不进入第三轮；p3b 与浏览器均未启动，等待用户选择完整规范 AST 冻结或接受该静态门窄风险。

### 350-R7：冻结树总串联与最终验收

- 在同一冻结 tree / build 上运行固定 10k、代表性 100k、旧档、故障恢复和 S-17。
- 复核 20 / 20 artifact、性能、截图、错误面、残余风险和分支未合 main。
- 最终只读智能体给出任务级 `ACCEPT / BLOCK`；只有 `ACCEPT` 才可归档第 350 项。

## 6. 失败分类与返工规则

| 分类 | 判定 | 后续 |
| --- | --- | --- |
| 产品 | 违反已冻结 I-01～I-16 或领域契约 | 插入 `*-pN`，只改产品和对应 Node 负例 |
| 夹具 | 违背正式 API / renderer / persistence 契约，或前置未固定、等待/证据错误 | 插入 `*-fN`，产品文件必须为 0 |
| 性能 | 产品阶段越硬线或 50～200ms 需要一次调查 | 单独 profile；不得修改功能预期 |
| 环境 | 端口、bundle 过期、浏览器不可用、artifact 目录失败 | 修环境并证明产品断言未执行，不计产品复验 |
| 未判定 | 证据不足以区分 | 只加最窄诊断；不得同时改产品和期望 |

同一 blocker 重现、同组第二个基础产品 blocker、夹具连续两次失败或需要产品决策时，立即冻结并重新评估剩余阶段顺序。

## 7. Checkpoint 与投入产出

每阶段交接必须记录：

1. 冻结 tree / 分支状态和授权文件；
2. 产品文件 / 行数、工具文件 / 行数、文档文件 / 行数；
3. L0 静态、L1 专项、L2 小数据、L3 100k、L4 最终门的真实执行状态；
4. 首败分类、artifact 路径、未执行项；
5. 独立评审 `ACCEPT / BLOCK` 和下一阶段唯一廉价门。

当前工作树保持未提交 checkpoint；未经用户指示不提交、不推送、不合入 `main`。

## 8. 完成标准

1. R1 catalog 中 `20 / 20` 固定入口、`17 / 17` 场景和 `16 / 16` 不变量均有唯一 owner 与前置门。
2. generation、persistence import、archive export、headless write 四个 profile owner，以及 interactive / headless / worker-only projection binding 均通过真实 Node 事务门。
3. R2～R5 的开发完成度审计及发现的产品修补全部独立接受。
4. R6a 夹具冻结后，产品与夹具不再在同一返工阶段共同移动。
5. R6b 固定入口 `20 / 20` 在真实浏览器退出成功，功能、history、session、Loading、error、GL 和产品 `>200ms` 门成立。
6. R7 在同一冻结 tree 上完成 10k / 100k / 旧档 / 故障 / context restore 总串联。
7. 最终 artifact、截图、残余风险和独立评审结论写入权威文档；分支保持与 `main` 并行。
