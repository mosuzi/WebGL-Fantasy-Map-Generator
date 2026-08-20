# 第 350 项：MapCoreEngine / TypeScript CDP 全量浏览器验收

## 目标与边界

在 `codex/map-core-engine-architecture-plan` 的冻结提交上执行第 349 项已评估、未执行的浏览器方案，验证核心提交、Worker、投影、渲染、拾取、导出、旧档与故障恢复在真实 Chromium / CDP 中成立。任务只做验收和阻断当前验收的最窄修复；不合入 `main`，不扩大 MapCoreEngine / TypeScript 架构范围，不操作用户已有地图标签页。

详细断言继续以 [`task-349-browser-acceptance-plan.md`](./task-349-browser-acceptance-plan.md) 为准；本文件只冻结实际执行顺序，防止无证据地反复启动浏览器。

## 环境与证据

- 唯一写者：主线程；产品源码在首败前保持冻结。
- 隔离页面：由仓库既有 browser regression 启动固定端口 Chromium；综合终验使用单独固定 10k / 100k 页面，不接管用户标签页。
- 运行信息：记录 branch、commit、`package.json` version、Chromium / GPU、viewport、seed、cells、document / runtime identity、revision 与 build id。
- 详细日志、trace、截图和 JSON 放在 `Z:\tmp\codex\2026-08-20\task-350-map-core-cdp`；仓库只保留总结性文档，现有夹具明确写入 `docs/generated/` 的产物保持本地忽略。
- 浏览器入口必须真实启动 Chromium 或建立 CDP session；未执行的断言、启动失败、超时和环境失败不得记为通过。

## 分阶段执行

| 阶段 | 做什么 | 最小验收与停止条件 |
| --- | --- | --- |
| 350-0 环境冻结 | 静态核对 20 个既有入口及导入链；运行 `typecheck:core`、task-349 final-gate audit 和 production build；确认 CDP 可建立、WebGL2 可用 | commit / build / browser 信息写入 artifact；任一静态门失败即停 |
| 350-0a 冷启动 binding 修复 | 修复无既有地图时 generation / import adoption 请求无法建立合法 foundation binding；补正式入口静态回归并复验干净 10k Chromium | `regress:foundation-core-protocol` 与 `regress:map-transaction-browser` 通过；不放宽 binding validator，不改变已有地图任务语义 |
| 350-1 10k 核心事务 | 运行 map transaction、普通 Worker regeneration、population、society、economy 五个 10k 浏览器门 | 成功操作只产生一次 commit/history；拒绝完全回滚；错误、残留 Loading、pending session、WebGL error 均为 0 |
| 350-2 100k 与 session | 运行 10k / 100k Worker session、grid topology、direct-domain locks、compound locks | binding / ACK / invalidate / owner 同源；100k 不丢 identity、history 或 render；产品 `>200ms` LongTask 为硬阻断 |
| 350-3 渲染、拾取、导出 | 运行 city picking、overlay pan、viewport line preview、heightmap export、PNG crop；直接 CDP 验证普通视图切换和 WebGL context loss / restore | presentation-only 不推进 map revision/history；恢复后 framebuffer、overlay、picking 同源，GL / page / console error 为 0 |
| 350-4 兼容、反馈与终验 | 运行 storage compatibility、storage fallback、save feedback、Loading single-source、delayed feedback；最后在冻结 commit 上串联固定 10k 与代表性 100k | v1 / 当前存档、保存 receipt、恢复与反馈通过；形成总 JSON、截图索引和最终 ACCEPT / BLOCK 结论 |

## 固定的 20 个自动化入口

1. `regress:map-transaction-browser`
2. `regress:worker-regeneration-browser`
3. `regress:population-worker-browser`
4. `regress:social-expansion-worker-browser`
5. `regress:economy-worker-browser`
6. `regress:worker-session-browser`
7. `regress:worker-session-100k-browser`
8. `regress:grid-topology-browser`
9. `regress:regeneration-lock-direct-domains-browser`
10. `regress:regeneration-lock-compound-browser`
11. `regress:city-picking-browser`
12. `regress:overlay-pan-stability-browser`
13. `regress:viewport-line-preview-browser`
14. `regress:heightmap-export-browser`
15. `regress:png-crop-browser`
16. `regress:browser-storage-compatibility`
17. `regress:browser-storage-fallback`
18. `regress:browser-save-feedback`
19. `regress:loading-single-source-browser`
20. `regress:delayed-operation-feedback-browser`

## 防空转规则

1. 每组只先跑一个最便宜 smoke；通过后才扩展该组。
2. 昂贵门首败即停，保存原始输出；只允许一次最窄诊断和一次目标复验。
3. 同一夹具连续两次失败、同一 blocker 重现、出现产品决策或 `>200ms` 未归因 LongTask 时冻结任务，不循环跑全门。
4. 若发现计划外但必须修复的问题，先把独立修复阶段插入本表并重排未完成阶段，再修改产品源码。
5. 每个阶段结束记录真实命令、耗时、关键标量、artifact 路径及 `ACCEPT / BLOCK`；没有新增产品或测试代码时明确记为 `0`。

## 执行记录

- `350-0` 静态入口 `20 / 20` 存在，`typecheck:core`、27 门防误触审计和 production build 通过；首次直接页面与干净 `regress:map-transaction-browser` 均在 `generate.newMap` 被 `foundation.binding` 拒绝，证明是产品冷启动阻断而非持久浏览器缓存。
- 已按规则插入 `350-0a`。根因是第 349 项把通用 regeneration binding 收紧为严格 foundation factory 后，初次 generation / import 在 `MapRevisionTracker.mapIdentity === null` 时没有使用其已存在的 `generated:* / imported:*` 临时 owner identity。
- 首次修正只给请求建立临时 identity，目标复验仍在 Worker 返回后的 current-binding 检查命中同一错误。二次只读定位确认协调器复核没有沿用候选 adoption identity；最窄补齐只允许冷启动 `generated:<正整数> / imported:<正整数>`，已有地图仍以 revision owner 为准。
- 第二次补齐后目标门第三次仍命中同一错误，证明错误还存在于 `loadMapIntoRuntime` 中 state map 已替换、revision owner 尚未 `replaceMap()` 的接纳中间窗口。按停止条件，`350-0a` 判定 `BLOCK`，后续 19 个浏览器门未执行；两次未通过的产品 / 测试改动已全部撤回，产品树恢复 `c358ae1` 冻结内容。
- 后续若继续，必须先为 map replacement 建立显式 pending adoption binding owner，覆盖 generation / import 的 request、Worker current check、preload / refresh 与最终 commit / invalidate 全生命周期；不得再向通用 binding factory 追加散落 fallback。完成该设计冻结后只复验 foundation 专项与 `regress:map-transaction-browser`。

## 完成标准

- 20 / 20 固定浏览器入口在同一冻结产品提交上真实通过。
- 直接 CDP 终验覆盖固定 10k、代表性 100k、普通视图切换、context restore、旧档 / 保存恢复和错误面清零。
- 所有阻断完成一次窄归因；未执行项不以计划或旧结果代替。
- 浏览器结论、残余风险和 artifact 索引写入本文件；完成后第 350 项归档，但分支仍不得合入 `main`。
