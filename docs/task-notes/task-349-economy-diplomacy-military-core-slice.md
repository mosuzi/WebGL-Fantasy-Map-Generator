# 第 349-10e 阶段：经济、外交与军事核心切片

## 冻结边界

本阶段只迁移 economy、diplomacy、military 的 shadow Manifest、依赖描述与四类既有 Worker 结果的主线程 pre-commit 契约：`economy.compute / economy`、`regeneration.compute / diplomacy`、`regeneration.compute / military`、`military-policy.compute / military-policy`。不接管唯一 canonical owner，不改变 Worker wire DTO，不提前收口 generation、import、adoption、export 或 headless profile。

## 实施结果

- 三域新增 capability-aware Manifest；core registry 增至 `15 domains / 216 descriptors`，dependency registry 增至 `15 domains / 19 systems`。
- 正式应用在 history command 建立前验证 operation binding、prepared render binding、Manifest 写集、operation 容器、canonical / pack / politics 镜像和跨域引用。完整 diplomacy / military 重生成使用精确写集；economy 与 military-policy 保持既有细粒度 patch，但每条实际路径必须落在 Manifest 声明根内。
- economy 校验 goods / markets / deals、cell / city / state / province 引用和 pack 镜像；diplomacy 校验双向关系、chronicle 与 politics / pack 镜像；military 校验 state / regiment、pack 镜像、事件归档、sequence 和 policy 局部写入。
- 军事主动重生成恢复此前丢失的战报归档语义：旧事件标记为 `military-regeneration` 归档，保留 event sequence / archive generation，并与 pack mirror 同源；失败和 `after-events` fault 仍完整回滚。
- 外交锁快照只把 `Warzone` 计为战争派生，带 attacker / defender 的 `Invasion` 不再使和平关系误报冲突；真正战争区域仍受原锁门约束。

## 验收证据

- 新协议覆盖 4 个 Worker result owner，写集为 economy `14` 个根、diplomacy `17`、military `12`、military-policy `4` 个根；三轮评审修正后拒绝 stale binding、必需根删除、结果形状 / 日志前缀、path escape、DataView、经济整集合 / 整对象 / 未声明字段、外交 Warzone cell / 国家对 / 第三国 cell / metadata、军事事件 before-image / generation、military-policy 跨国家 / 战报 / 请求外战役战线 / 汇总漂移等 `38` 类反例。
- economy 与 military-policy 的 10k / 100k Worker 专项通过；100k 分别约 `2710.9ms / 6563 patch paths` 与 `1333.1ms / 5 changed paths`，输入 buffer 保持完整。军事比例调整明确冻结非目标国家，正式 patch 仅含请求国家的四类字段与全局军事镜像；全局军事根保持战报、未知根字段和非可变 metadata 不变，不涉及目标国家的战役 / 战线必须与来源逐项相同，兵力 / 舰队 / 状态等 metadata 从提交后军团重算。
- diplomacy rules、diplomacy lock `210` 对全锁无操作、military regeneration / lock、warzone consistency、economy display / trade、core Manifest / dependency、`typecheck:core` 与 production build `1391 modules` 通过。
- 战线渲染旧夹具使用的种子已不再生成战争；改用仍确定生成两条极近战线的固定种子后，既有 synthetic / real-sample 断言通过，产品逻辑未改。
- `git diff --check` 通过；浏览器执行 `0`，`source/` 改动 `0`。

## 计划外必需项与后续顺序

军事事件归档缺失、外交锁对 `Invasion` 的误判和战线固定样本漂移都直接阻断本阶段已声明的历史、跨域引用或专项门，因此在 349-10e 内作最窄修正，不另立产品阶段。它们不改变后续依赖，未完成顺序仍为 `349-10f → 349-10g → 349-11`。

`0.5.41` 首轮评审为 `BLOCK`，确认五项 P1：精确写集可伪造删除、economy identity / reference 未闭合、military-policy 可跨请求国家写入、外交 Warzone 引用未校验、军事归档未绑定 before-image 和 generation。`0.5.42` 逐项闭合后，复审继续确认四类 P1：精确结果根缺少来源前缀与形状约束、economy 整集合 / 整对象路径绕过字段白名单、military-policy 全局军事根可改请求外事件、合法敌对国家对的 Warzone 仍可引用第三国 cell 且 metadata 可漂移。`0.5.43` 闭合前三类，但 blocker-only 复审确认结构合法的请求外 campaign / front 内容和可变 metadata 汇总仍可漂移；`0.5.44` 冻结不涉及目标国家的战役 / 战线，并从提交后 states 重算 `statesWithMilitary / regiments / troops / navalRegiments / statuses` 与战役 / 战线计数，`buildMs` 只接受有限非负数，负例扩至 `38` 类。同一评审智能体对 `9bfe682 / 0.5.44` 给出 `ACCEPT`，349-10e 完成并进入 349-10f。
