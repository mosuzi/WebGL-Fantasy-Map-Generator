# 第 329 项：LongTask 登记例外复核与收敛

本文冻结第 329 项的历史证据、当前风险、实施顺序和停止条件。历史完成记录不因本项重写；本项只回答“当前代码是否仍有必要优化”和“当前机器门是否仍会假绿”。

## 当前审查矩阵

| 来源 | 历史登记 | 当前机器门 | 审查结论 |
|---|---:|---|---|
| 第 322 项 C1 网格细分 | `159 / 112ms`，最多 `2` 条、单条 `≤160ms` | 专门门仍保留相同额度 | 先用当前实现复验；后续 surface 分段、prepared install 和 overlay 改动可能已经间接消除，未复现前不重构 |
| 第 322 项 C2 社会扩张 | 首次文化 `56ms`，最多 `1` 条、`≤60ms` | 当前社会扩张浏览器门已严格要求 LongTask `0` | 视为已由后续实现消除，不再实施产品优化 |
| 第 322 项 C3c 路线 / 城市 | `110 / 113 / 132 / 193ms`，汇总最多 `4` 条、单条 `≤200ms` | 八个 API 窗口仍共用一个额度 | 本项最高优先级；多条、接近 200ms、且 10k 即出现，必须先分入口归因再优化 |
| 第 322 项 D2 主题 / 最大标签 | 主题最多 `3×75ms`，标签最多 `2×60ms` | 阶段额度不允许带入最终 E；后续故障 / 恢复门已严格为零 | 只做当前版本目标复验；不稳定复现时不继续改 DOM 架构 |
| 第 322 项 E 100k routes | reused / 取消后 fresh 各 `1×80ms` | 完整 session 门仍保留两个精确额度 | 已完成 city 状态恢复和 overlay DOM 复用，独立连续两次及最终完整门均为零；优先删除额度，不再改产品 |
| 第 323 项 100k 新图 | 曾有唯一 `61ms` | 工具目前只拒绝 `>200ms`，九个操作可出现任意数量 | 产品最终独立验收为零；需要收紧夹具而不是继续优化产品 |
| 第 324 项地图模板 | 没有最终登记；最终矩阵 LongTask `0` | 三个模板浏览器工具仍接受任意数量 `≤200ms` | 属于遗留假绿风险，应恢复严格零门 |
| 第 328 项 100k 国家重生成 | 偶发单条 `59～69ms` | 只检查每条 `≤200ms`，没有数量门 | 当前无可复现同步热点；先收紧为最多一条、`≤80ms`，稳定复现后才考虑产品修复 |

## 实施顺序

### A. 先修机器门

- 第 323 项按操作名分别归窗；除重新取证的 100k 新图外全部严格为零。若目标复验仍为零，100k 新图也恢复零门。
- 第 324 项三个浏览器工具恢复 LongTask `0`，因为完成时目标门、矩阵和独立终验均已为零。
- 第 328 项只允许 `100k states` 进入候选额度，且固定 `maxCount=1 / maxDuration=80ms / name=self`；小图 fallback、100k provinces 和其它入口为零。
- 每个额度必须在输出中带 operation、startTime、duration 和允许来源；不能只打印聚合数组。

### B. 重点诊断 C3c

只复用现有路线 / 城市 Worker 浏览器工具，不新建全量 trace 夹具：

1. 八个 API 操作分别清理、观察、稳定结算，LongTask 写入对应 operation。
2. 被动记录 history snapshot、Worker run 结束、prepared install 各层、overlay 安装、city instances、route / point / picking buffer 和最终 draw 的绝对区间。
3. checksum、`structuredClone`、`JSON.stringify` 和 GPU readback 必须在产品观察窗关闭后执行。
4. 若热点在城市移动 / 历史恢复且 overlay 结构不变，优先评估现有严格签名 DOM graft；若热点在 point / route / picking 整包重装，优先做受影响对象的局部 GPU / picking patch；若热点在历史快照或同步提交，再针对该段分片。
5. 一次实质优化后只复验同一目标门；没有收益或同一阻断再次出现即冻结，不继续循环补夹具。

### C. 条件复核其它例外

- C1 先原样复跑。只有 `159 / 112ms` 同类信号仍出现时，才用地图提交、GPU set 交换、overlay 和历史快照四个边界做一次窄诊断。
- D2 分别运行主题和最大标签目标入口；若为零则删除阶段额度。若复现，优先检查根级主题变量、可见标签差集和 live DOM 批量提交，不重新生成完整标签结构。
- C2 不再跑昂贵诊断；保留当前严格零门。
- 100k routes 复用已存在的窄入口确认当前为零后移除 `80ms` 额度；不得重新扩写此前已经完成的多轮诊断。
- 第 328 项只有同一固定 100k states 连续稳定复现后才开启窄诊断；未锁定同步段时不做政治生成器或 renderer 改造。

## 2026-08-13 实施结果

- 机器门已收敛：第 324 项三个模板入口恢复严格零；第 323 项仅 `generate-capped` 可保留 `1×self≤80ms`，其余八项为零；第 328 项仅 `fallback-provinces` 与 `100k states` 各自允许 `1×self≤80ms`，其它入口为零。C1 网格细分当前产品窗实测 LongTask `[]`，旧 `2×160ms` 额度已删除；100k routes 当前同页两次 reused 均为零，正式门的 reused / 取消后 fresh 两个旧额度及通用预算分支已删除。
- C3c 已按八个入口分窗。首次严格门得到 `route-inspect 109ms / route-update 130ms / city-inspect 106ms / city-move 192ms`，全部从 `workerTaskCoordinator.run` 返回后开始；输入分片最大 `47.2ms`。根因是主线程同步重算 `fingerprintRoutePathSource`。正式实现新增同算法异步指纹并在路线 / 城市结果校验中按浏览器让步，Node 锁定同步 / 异步 checksum 相同和陈旧拒绝不变。
- 实质优化后的唯一目标复验中，路线预检 / 更新 / 撤销 / 重做、城市预检 / 撤销 / 重做均为零，只剩 `city-move 80ms self`。该信号位于 Worker 返回后的 prepared 城市画面提交窗；依据用户“调查、实质优化一次后，200ms 内仍未消除可精确登记”的规则，最终仅保留 `city-move 1×self≤100ms`，不得扩到其它七项。
- D2 committed-display 当前复验 LongTask `[]`，主题与最大标签不再保留阶段额度。第 324 项主浏览器入口严格零通过。第 323 项当前唯一 `generate-capped 51ms` 与历史 61ms 同源，因此保留上述精确额度。第 328 项首个 fallback 为 74ms；它由夹具主动 `forceFallback` 进入低频主线程兼容路径，故不扩政治生成器，只保留上述单入口额度。

证据路径：`work/task329-c3c-diagnostic/`、`work/task329-c3c-after-async-fingerprint/`、`work/task329-c1-current/`、`work/task329-100k-routes-current/`、`work/task329-d2-committed-display-current/`、`work/task329-task323-strict/`、`work/task329-task324-strict-primary/`、`work/task329-task328-exact-budget/`。

独立集成复核发现并关闭了最后一个隐藏的 100k fresh routes `2×75ms` 宽门，复查结论为 `ACCEPT`。独立最终观察使亲跑 C3c、第 323 项和第 328 项真实浏览器门：城市移动 `89ms`、100k 截断新图 `52ms`、小图省份 fallback `74ms`、100k 国家重生成 `65ms` 均落在上述精确额度内，其余对应入口 LongTask 为 `0`；功能、回滚、GPU / picking、Loading 与错误面通过，最终结论为 `ACCEPT`。

## 验收与停止条件

- 最终不存在“任意数量且每条 `≤200ms`”的门，也不存在八个操作共享一个总额度的门。
- 已消除的历史信号从当前工具移除，但归档记录保持原样。
- 仍保留的例外满足用户统一规则：一次调查、一次实质优化、一次目标复验，且精确到入口、数量、时长与来源。
- 浏览器首次失败即停；每个入口最多一次最窄诊断和一次目标复验。夹具连续两次失败或同一阻断重现时请求裁定。
- 不降低数据、历史、取消、迟到、故障回滚、GPU / picking、Loading、错误面或真实 10k / 100k 验收标准。
