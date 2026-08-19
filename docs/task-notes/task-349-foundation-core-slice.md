# 第 349-10a 阶段：基础域核心协议切片

## 目标与边界

本阶段把 terrain / grid / height-derived / climate / ocean / topology 的现有正式入口接入第 349 项已经冻结的 Manifest、Worker binding / result / patch 和 renderer source 契约。它不改生成算法，不接管 `state.map`，不迁移 society / politics / settlements / routes / economy / military，也不执行浏览器验收。

## 交付

- 新增 shadow `foundationManifest`，登记高度拓扑、气候和洋流图层三套派生系统，以及高度派生、气候下游、洋流世界和网格拓扑四个既有 Worker task。
- 新增 TypeScript legacy adapter：把现有 `mapIdentity / mapRevision / topologyRevision / generationToken / lockFingerprint / operationId` 显式适配为核心 pre-commit compute binding；旧 wire DTO 保持不变。
- 四个正式 Worker 结果在 canonical commit 前统一校验 task、result kind、request / result binding、patch 写集或 replacement map 结构；noop、patch / replacement 混装、未知路径、路径覆盖和 stale renderer source 均拒绝。
- renderer preparation、render cache、picking DTO 和 surface resource owner 的 binding 补齐 `topologyRevision`。同地图、同 map revision 但 topology revision 不同的结果不再复用旧 topology cache。
- 旧 v1 地图缺少 `heightmap / climate / oceanCurrents` 时只在兼容审计中给出保守默认；正式 replacement 结果仍要求完整基础 section，不把旧档默认伪装成新的完整 Worker 结果。

## Manifest 语义

`FOUNDATION_DOCUMENT_WRITE_SET` 是两个现有整图 replacement task 以及两个跨域派生 patch 的保守事务包络，不表示 foundation 成为这些 section 的第二 canonical owner。唯一 owner 仍是现有 `state.map`；Manifest 保持 `shadow`，只做提交前协议与依赖审计。逐域迁移到 `349-10b`～`349-10e` 后再把宽包络收窄到各领域的精确 write set，最终由 `349-10g` 审计残余宽路径。

高度拓扑 descriptor 已把 `pack` 根级读取收窄为 topology 所需的 cell 高度、feature、顶点、邻接和 feature 对象路径；但既有 markers resource-economy descriptor 仍声明宽 `pack` 派生写入，因此人口链的保守依赖计划仍可能包含基础拓扑重建。该安全冗余不改变产品结果，精确收窄随对应领域阶段处理，不在本阶段越界改写已接受领域。

## 非浏览器验收

- `pnpm run typecheck:core`
- `pnpm run regress:core-manifests`：`4` domains、`67` descriptors、`31` negative cases。
- `pnpm run regress:core-dependencies`：foundation 三套派生系统进入注册表；grid 写入显式规划 full rebuild。
- `pnpm run regress:foundation-core-protocol`：四 Worker 正负协议、旧数据默认、高度派生、气候 history / full-map roundtrip、洋流 JSON / gzip / browser-storage 数据往返、10k→100k grid prepare、renderer topology cache 与 surface owner 全部通过。
- `pnpm run regress:height-brush`：高度编辑 history / undo / redo 和选区语义通过。
- `pnpm run regress:grid-topology-refinement`：`10004 → 100000`，陆水连通分量 `6 / 4` 保持，迁移后 invalid `0`。
- `pnpm run build`：production build 通过，`1377` modules。
- `source/` 改动 `0`；浏览器启动、操作和验收均为 `0`。

## 首轮评审与最窄修复

同一只读评审智能体对 `7669915 / 0.5.26` 给出 `BLOCK`：

1. `MapRevisionTracker.getSnapshot()` 仍只有旧兼容字段，正式 Worker binding factory 没有 topology revision；合成测试没有走真实 owner。
2. replacement 只要求五个基础 section，残缺整图仍可能进入 `createMapReplacementCommand` 并删除其它 canonical section。

`0.5.27` 修复保持公开旧 revision snapshot 形状不变，新增内部 `getCoreSnapshot()`；迁移期 topology revision 随 canonical revision 保守单调推进，换图归零，事务快照 / rollback 同步恢复。四个基础入口共用的真实 binding factory 和 renderer request 直接读取该内部 vector。正式 replacement 现在从唯一 canonical field registry 解析全部非 optional 顶层 section，要求每个 section 为当前对象 / 数组形态，并额外核对 pack cells、社会 / 行政镜像、城镇 / 路线、Feature / 河流、锁、notes / measurements / labels 关键集合。

专项改为由真实 `MapRevisionTracker` 产生 binding，覆盖 topology 推进与 rollback；使用正规化完整地图验证 ocean / grid replacement，通过删除 politics 和破坏 notes 结构验证 pre-commit 拒绝，canonical、history 与 revision 均保持不变。

## 第二轮评审与最窄修复

同一只读评审智能体对 `88ecc40 / 0.5.27` 再次给出 `BLOCK`：正式 canonical commit 后的 renderer binding 仍由调用点手工只计算 `mapRevision + 1`，与实际同时推进 topology 的 owner 当场错位；replacement 虽要求顶层 section 齐全，却仍会接受 `economy: {}`、`oceanCurrents: {}` 等顶层存在但域内容被清空的结果。

`0.5.28` 新增正式 post-commit binding helper：它只接受唯一 revision owner 的真实 core snapshot，并要求同一 map identity 下 map / topology revision 各恰好推进一次。通用 Worker map mutation 在 history commit 后立刻生成该 binding，renderer install、两次 commit assertion、UI settle 共同使用；grid fingerprint 不再提前猜测 revision，而在真实 commit 后按同一 binding 建立。专项以真实 `EditHistory + MapRevisionTracker` 覆盖 commit → renderer install → settle，并拒绝只推进单轴 revision。

完整 replacement 校验改为逐域结构锚点：除 registry 全部必需顶层 section 外，继续验证 grid / pack 容器、基础与行政集合、economy / diplomacy / military / markers / zones、notes / measurements / labels / visual theme、summary mirror 等当前正式数组、记录、数值和字符串形状。ocean task 的空 `oceanCurrents`、grid task 的空 `grid`，以及两类 task 的空 `economy` 均在 pre-commit 拒绝，canonical、history 与 revision 不变。

## 已记录的阶段外首败

既有 `regress:ocean-current-world` 在完整世界夹具中稳定拒绝两个省份一致性问题：省份 `110` 没有合法省会候选，省份 `118` 当前省会不一致。隔离复现结果相同；另一个世界约束 bundle 缺少“锁国无省会省份”样本。按仓库停止规则没有继续补夹具或重复全门，也没有把这些门写成通过。

这两项都属于紧邻的 society / politics 与 pack mirror 领域，不阻断 349-10a 对基础协议、现有洋流算法和事务前置校验的验收。`349-10b` 的首门调整为先建立上述行政引用的可重复最小样本并确认是产品一致性、夹具陈旧还是既有约束误判，再迁移 society / politics；在归因完成前不得放宽行政门。

## 阶段交接

| 字段 | 内容 |
| --- | --- |
| 状态 | `ACCEPT`；同一评审智能体确认第二轮两项 P1 闭合，无新增 P0 / P1 |
| 冻结点 | 首轮 `7669915 / 0.5.26`；第一轮修复 `88ecc40 / 0.5.27`；第二轮修复候选 `0.5.28` |
| 产品改动 | `8` 个文件，约 `+327 / -7` 行 |
| 工具改动 | `5` 个文件，约 `+156 / -12` 行 |
| 配置 / 文档 | `package.json` 新增专项门并递增版本；本记录及权威状态同步 |
| 首败 | ocean world 的两项既有行政一致性拒绝，转入 349-10b 首门，不声称通过 |
| 下一步 | 进入 349-10b；首门为行政引用最小复现与归因 |
