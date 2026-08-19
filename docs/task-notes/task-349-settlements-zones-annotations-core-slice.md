# 第 349-10c 阶段：城镇、地区、标签与测量核心切片

## 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | `349-10c`；登记 settlements / zones / labels / measurements 的真实领域边界，并让 cities / zones Worker 结果在 canonical commit 前统一验真 |
| 当前阶段 | 四领域 shadow Manifest、共享 Worker result validator、dependency projection 与无浏览器专项 |
| 冻结点 | `codex/map-core-engine-architecture-plan / 0.5.34` blocker-only 复审候选 |
| 允许文件 | 四领域目录、正式 Worker commit 接线、Manifest / dependency / 专项工具、v1 夹具与本阶段文档 |
| 禁止文件 | `source/`、routes / rivers / features 正式迁移、economy / military 正式迁移、浏览器验收、`main` |
| 必须保持 | 唯一 `state.map`、city↔burg / route 双表示、zone↔pack 镜像、旧图迁移、锁、单条 history、view-only 不推进 revision |
| 最小验收 | core typecheck、Manifest、dependency、2k 真实 cities / zones Worker、history、旧 v1、领域 Node 专项、production build |
| 首个廉价门 | `pnpm run regress:settlements-zones-annotations-core-protocol` |
| 停止条件 | pre-commit 无法证明身份 / 镜像；必须提前迁移 routes / economy；同一夹具阻断连续复现 |

## 实施结果

- 四份 Manifest 登记 `57` 个新 descriptor；总注册表为 `9 domains / 135 descriptors`。settlements / zones 通过不同 descriptor id 共享 `regeneration.compute`，分别唯一拥有 `cities / zones` result kind；labels / measurements 明确不伪造 Worker 或独立重生成能力。
- 正式 `generate.regenerate(cities|zones)` 在 canonical commit 前统一验证 request / output / prepared renderer binding、精确 policy、实际 patch、普通对象 / TypedArray 容器、city↔burg 双向唯一身份、settlements route↔pack route 几何镜像、politics↔pack 行政镜像以及 zone 槽位 / pack 镜像。正式入口把 before-image `sourceMap` 传入 validator，不以结果自身证明拓扑边界。
- 首轮评审指出三个 P1：行政首府引用未闭合、`grid.cells.burg / pack.cells.burg` 未消费、zone cell 未按源 pack 拒绝越界。`0.5.34` 复用 society-politics 的行政引用校验，允许 cities from-empty 合法产生“无反向 claim 的零首府”，但仍拒绝 dangling、保留反向 claim 的清零和重复 claim；同时校验两套 cell 镜像的长度、边界、唯一性、正反向引用，并按源 `pack.cells.i` 约束 zone cells。
- `zones` 的真实 patch 会删除旧 `metadata.derivedStale`，且不写 `zones.metadata.stale`。validator 因此区分 Manifest 允许写集与一次成功结果的必须写集，只允许该精确删除，不泛化放宽其他路径。
- dependency registry 新增城镇点层、地区区域、标签布局和测量 overlay 四个 projection；政治写入会继续传播至 settlement / label，地区写入传播至 label，测量写入只失效 measurement overlay。
- 纯 Node 专项覆盖真实 2k cities / zones Worker、city / route / zone identity 负例、stale binding、删除 / DataView / Map、行政 dangling / 清零 / 重复 claim、grid / pack cell 镜像、zone cell 越界、policy drift、真实 patch commit / undo / redo，以及标签备注、测量保存 / 导入 / undo / redo。旧 v1 夹具补齐当前安全迁移要求的最小 grid / pack / settlement 身份结构。

## 门禁与发现

- 已通过：`typecheck:core`、`regress:core-manifests`、`regress:core-dependencies`、新领域协议门、`regress:society-politics-core-protocol`、`regress:map-migration`、城市移动 / 路线身份 / 锁 / 港口拓扑、地区重生成 / context / wilderness / warzone、标签 style / layout / collision / icon clearance / state territory、测量 curve / highlight，以及 production build `1382 modules`。
- 既有夹具校准：harbor 已为 `0/1` 有效标记，不再要求 `>1`；主动地区重生成已按第 345 项从空结果重建；旧源码正则改认已接受的 `repairProtectedDerived: true` 与共享 PNG 语义标签契约；生成种子不再强制每张 archipelago 都出现跨海国家，跨海语义继续由确定性手工夹具覆盖。
- 浏览器边界：误调用命名不显式的 `regress:measurement` 后确认其会启动 Playwright，随即终止且不计验收；未读取或声明浏览器结果，后续从 Manifest 门移除该脚本，改用纯 Node 证据。连同 349-7 的一次误触，最终方案文档必须列出“执行前静态识别浏览器脚本”的防误触门。
- 延后：完整 world constraint 的锁定 Feature 港口引用 `382 → 366` 仍由既定 `349-10d` 首门处理；本阶段没有迁移 routes / features owner。
- 未完成顺序复评：`349-10d → 349-10e → 349-10f → 349-10g → 349-11` 不变。
- 当前状态：首轮评审为 `BLOCK`；三个 P1 已形成 `0.5.34` blocker-only 修正候选，待同一只读评审智能体复审。未获 `ACCEPT` 不进入 349-10d。
