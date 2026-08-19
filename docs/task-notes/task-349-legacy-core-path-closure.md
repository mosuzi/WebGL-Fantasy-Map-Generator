# 第 349-10g 阶段：旧核心路径收口

## 阶段边界

- 目标：只删除同时满足“定义、引用、正式 owner、专项回归”四项证据的冗余路径；零产品引用本身不构成删除依据。
- 非目标：不改变生成算法、wire DTO、公开 API、地图格式、canonical owner、revision / history 语义或领域能力。
- 唯一写者：主线程；只读评审在 checkpoint 后独立给出 `ACCEPT / BLOCK`。
- 浏览器边界：未启动、未操作、未执行浏览器门，`browserRuns = 0`。

## 定义—引用—owner—测试矩阵

| 候选 | 产品引用 | 测试引用 | 正式职责 | 决定 |
| --- | ---: | ---: | --- | --- |
| `adaptLegacyInteractiveRevision` | 16 | 2 | 现行交互 runtime revision 进入核心契约的唯一显式边界 | 保留 |
| `adaptHeadlessDocumentRevision` | 0 | 2 | headless profile 的品牌 revision 边界 | 保留 |
| `adaptPersistedDocumentBinding` | 0 | 4 | persisted document identity 与 runtime identity 隔离 | 保留 |
| `adaptLegacyPresentationBinding` | 0 | 2 | presentation profile 的 identity 负例与兼容边界 | 保留 |
| `adaptLegacyRenderResourceBinding` | 0 | 2 | render resource profile 的 identity 负例与兼容边界 | 保留 |
| `revisionProfile` | 0 | 0 | 只返回已经公开的 `profile` 字段，没有 owner 或协议职责 | 删除 |

四个零产品引用适配器仍是 349-3a 已接受的跨 profile 契约边界。删除它们会让类型与 runtime 负例失去真实适配入口，因此本阶段明确不以覆盖率名义清理。

## owner 与双写结论

- canonical map 仍只有 `state.map`；`MapCoreEngine` 是 getter-only shadow facade，没有 command、replace 或 history 写入口。
- `MapRevisionTracker` 与 `EditHistory` 各只有一个正式实例；map replace、revision advance、history snapshot / restore 均落在既有 owner，没有第二套推进路径。
- notes 是唯一 `active` Manifest；其余 14 个领域 Manifest 保持 `shadow`。shadow runtime 只观察正式事实，不写 canonical map / revision / history。
- 八个正式 Worker pre-commit validator 仍接在各领域提交边界；本阶段没有削弱任何写集、mirror、identity 或 rollback 门。
- 349-10f 已将 map-file 的局部 `mapDocumentMetadata` 合并到整图 receipt helper，本阶段没有发现可继续删除且证据完整的 revision / history / shadow 双写。

## 自动审计与验收证据

新增 `audit:legacy-core-paths`，固定检查：适配器引用矩阵、`revisionProfile` 零残留、唯一 revision / history owner、facade 无写 API、active / shadow Manifest 数量、八个 pre-commit validator 与 map-file receipt 无重复实现。

已通过：

- `audit:legacy-core-paths`：删除项 1，canonical owner 为 `state.map / 1 revision / 1 history`，Manifest 为 `1 active / 14 shadow`，pre-commit validator 为 8；
- core contracts / manifests / facade / dependencies；
- foundation、population、society-politics、settlements-zones-annotations、features-networks-resources、economy-diplomacy-military 六组领域协议；
- notes、whole-map profile、headless write、`typecheck:core` 与 production build（1392 modules）；
- `source/` 改动 0，浏览器执行 0。

`regress:markers-core` 暴露一个起点已存在的夹具断言漂移：349-8 已把 markers Worker / regeneration 能力登记为 `required / required`，而 349-7 夹具仍断言 `not-required / optional`。现行 Manifest 已由 core Manifest 与地理网络资源协议门验证，故不回退产品契约；该计划外但必需的夹具同步独立插入 `349-10g-a`，未完成顺序改为 `349-10g -> 349-10g-a -> 349-11`。
