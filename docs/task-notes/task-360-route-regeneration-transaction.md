# 第 360 项：道路专用重生成入口事务闭环

## 任务契约

- 唯一完成输入仍为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 用户入口固定为“路线管理 → 重算道路”。中央控制面板只能验证共享 command 一致性，不能替代专用面板。
- 主线程唯一写者；任务分支计划为 `codex/task-360-route-regeneration-transaction`，必须从第 359 项已合入并推送的最新 `main` 创建。
- 本项只负责路线专用入口及由其真实首败证明的最窄道路核心问题，不扩散到其它对象面板。

## 已知基线与根因边界

同存档中央入口约 `2.98s` 完成 `442 → 273`。路线专用面板的 `handleRouteAction("regenerate")` 只调用 `onRegenerateRoutes`，不等待或返回 Promise；按钮没有 busy / disabled，面板也没有结果和错误状态。实测点击后数百毫秒内 UI 仍显示 `442` 且按钮可点击，约四秒后才变为 `273`。

这已经证明 UI 事务不闭环，但不能据此断言用户现场只有 UI 问题。360-A 必须保留专用入口返回包、runtime operation、console rejection、公开错误码、内部码链和路线 before-image；若核心确实拒绝，再按该精确码进入 360-C。

## 阶段矩阵

| 阶段 | 单一目标 | 首个廉价门 | 冻结门 |
| --- | --- | --- | --- |
| 360-A | 在真实存档专用面板复现单击、快速双击、成功或失败的完整时间线 | RoutePanel / panel callback 静态审计 | 正式页面取得 command 返回、busy、route digest、history、错误码与截图 |
| 360-B | 建立可等待的单一 command 与面板 pending / success / failure 状态 | Vue 组件和 runtime user-copy 专项 | 按钮执行中禁用；单击只产生一个 operation；成功 / 失败均明确结束 |
| 360-C | 仅当 360-A 证明核心失败时修复首个道路领域根因 | 对应错误码的最窄 Node 回归 | 锁快照、约束、owner、revision 和失败回滚全部保持 |
| 360-D | 专用 / 中央入口、撤销和调试故障集成终验 | typecheck、scoped diff | 同存档两入口结构化结果一致，撤销精确，build 和错误面通过 |

## 设计约束

- `onRegenerateRoutes` 必须返回 runtime Promise；RoutePanel 必须等待其终态，不能 fire-and-forget。
- pending 由共享 runtime operation 与面板本地 request identity 共同约束，防止初始同步延迟留下重复点击窗口。
- 成功反馈至少包含是否执行、前后路线摘要和可撤销结果；失败反馈保留结构化 error，普通模式只映射友好文案，调试模式显示公开码和内部码链。
- 中央入口与专用入口不得各自复制一套重生成逻辑；它们只能调用同一个 command adapter。
- 不把 `operation_busy` 当作道路生成失败；重复点击必须在 UI 层被拒绝且不创建第二个 command。

## 最终验收

1. 专用面板单击后同一事件循环内进入 busy，按钮禁用；快速双击只记录一次 command / history delta。
2. 真实存档成功后路线 salt 或完整拓扑摘要改变，锁定路线和锁定城市 before-image 精确保持；不能只以条数不同判断成功。
3. 一次撤销精确恢复 `442 routes / 7976 segments` 及原路线摘要；重做恢复新摘要。
4. 中央入口执行同一流程时返回相同结构化字段和错误语义。
5. 注入一例道路失败：普通模式只有友好说明，`?debug=1` 同时显示公开错误码和内部码链；无未处理 Promise rejection。
6. 目标操作窗口无新增 health、console 或 WebGL error；随机地图不作为完成证据。
