# 第 349-11 阶段：最终非浏览器验收

## 边界与结论

本轮只执行经静态防误触审计登记的 Node、TypeScript 与 production build 门。没有启动或操作浏览器，没有运行名称或命令体含浏览器 / 驱动 / Chrome-CDP / Vite dev-preview 入口的脚本，没有进行视觉、截图或 UI 通过声明。

`audit:task-349-final-gates` 固定 27 个 package gate、36 个 Node 入口；终验前后各执行一次均通过，`browserRuns = 0`。27 个 gate 全部通过，未发现需插入的新阶段。

## 最终门矩阵

| 分类 | gate | 结果摘要 |
| --- | --- | --- |
| 静态与 identity | `audit:canonical-map-fields`、`audit:legacy-core-paths`、`regress:registry-document-identity` | `66 fields / 29 sections`；唯一 `state.map / revision / history` owner；`1 active / 14 shadow`；五个既有存档字段与 document identity 通过 |
| 核心契约 | core contracts / manifests / facade / dependencies | `15 domains / 216 descriptors / 19 derived systems / 35 manifest negative cases`；borrow、rollback terminal、projection bypass 与跨 profile identity 通过 |
| 低风险切片 | notes、markers、marker resource economy | notes `13 commits / revision 13`；markers `8` 个 presentation / point / picking / DTO / export 同源；资源经济 fault rollback 通过 |
| 领域协议 | population、foundation、society-politics、settlements-zones-annotations、features-networks-resources、economy-diplomacy-military | 正式 binding / write set / mirror / lock / reference / rollback 负例全部通过；population 为 `145` 个写路径 |
| 真实 Worker | economy、military-policy、通用 Worker task | economy 与 military-policy 10k / 100k parity、undo/redo、锁、取消、fault、stale、输入 buffer 完整；通用 task 的 11 个 regeneration result kind parity 通过 |
| 整图与存档 | whole-map profile、map-file IO Worker、headless read/write、migration、API data compatibility | `4 owners / 15 negatives`；plain/gzip/webfmg-v3 与轻量 100k；v1→v2、future reject、失败保留原输入、headless revision/幂等/全事务回滚通过 |
| 工具链 | `typecheck:core`、`build:app`、diff check | `tsc --noEmit` 约 `1077.6ms`；Vite `1392 modules / 1.64s`；差异格式通过 |

本轮完整工具墙钟约 4 分钟。Node 数据只用于协议与相对性能证据，不把它解释成浏览器产品交互时间；记录到的 100k 代表值为 economy Worker `2602.4ms`、military-policy Worker `1239.5ms`、世界重建 `3596.5ms`、grid topology prepare `3639.51ms`。

## 完成标准对照

- core owner、revision、commit、dependency、Worker、render layer 均有静态或 runtime validator 门；
- notes、markers、population 与后续全部领域切片覆盖事务 / persistence、renderer / picking 与 Worker 协议；
- capability-aware Manifest 不为缺失能力伪造入口，notes 是唯一完整接管后标记 `active` 的领域；
- presentation-only 的零 core operation 已由 markers 与 dependency/facade Node 门证明；真实浏览器的 `map input = 0 / render.prepare = 0` 保留到未执行方案；
- business commit、projection settle / degraded / retry、history 与 rollback 的非浏览器路径通过；
- v1、当前格式、plain/gzip/webfmg-v3、headless、API 数据兼容通过；
- 10k / 100k 视觉、picking、PNG、Worker restart、context restore 与错误面已形成独立方案，但状态明确为“未验证”。

## 分支与变更审计

- 工作分支保持 `codex/map-core-engine-architecture-plan`，未合入或推送 `main`；
- `source/` 改动为 `0`；
- 未建立第二 canonical owner，旧 JS / TS 共存边界保持；
- 浏览器验收方案见 [第 349 项浏览器验收方案](./task-349-browser-acceptance-plan.md)，当前只通过方案完整性与可执行性评估。
