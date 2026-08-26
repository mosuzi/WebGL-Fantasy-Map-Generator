# 第 360 项：道路专用重生成入口事务闭环

## 任务契约

- 唯一完成输入仍为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 用户入口固定为“路线管理 → 重算道路”。中央控制面板只能验证共享 command 一致性，不能替代专用面板。
- 主线程唯一写者；任务分支为 `codex/task-360-route-regeneration-transaction`，按用户要求从第 359 项完成提交顺序创建，只推送自身，不合入 `main`。
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

## 完成记录（2026-08-27）

### 真实首败与修复边界

- `v0.5.68` production preview 的指定存档上，专用按钮单击后 `273 / 352 / 822ms` 三个观测点均保持 enabled、没有结果区，路线仍为 `442 / 7976`；约 `2423ms` 后才无提示地变为 `273 / 3645` 并新增一条历史。这证明真实首败是 RoutePanel 丢弃 Promise，不是道路生成器拒绝。
- `RoutePanel` 现在用本地 request identity 在同一事件循环立即进入 pending，并订阅共享 `webgl-generator-runtime-operation` busy。按钮在本地请求或任一前台地图事务期间禁用；快速双击只能启动一次 command。
- 专用面板把 runtime 原始结果与公共 API 结构化结果归一到同一 `{ok,data/error}` 语义；成功横幅显示前后路线 / 段数和可撤销提示，失败横幅复用统一重生成文案。普通模式只显示友好错误；调试模式保留公开码和被包装前的内部码链。
- 指定存档的道路核心两次均成功，因此 360-C 按冻结规则不触碰路线生成算法、锁契约、owner、revision 或提交校验。

### 指定存档浏览器验收

- 唯一输入仍为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`。最终 `v0.5.69` 专用入口双击后立即得到 `pending / button disabled`，约 `3s` 后显示“已完成 / 道路重算完成”，结果 `442 routes / 7976 segments → 273 / 3645`，history 仅为 `undo 1 / redo 0`。
- 中央入口在重新导入的同一原档上得到相同扰动 `#2`、相同 `442 / 7976 → 273 / 3645`、相同一条 history，墙钟约 `2682ms`；两入口没有各自复制道路命令。
- 通过正式 UI 主动锁定路线 `#0` 及其端点城市 `#7 丰柏 / #18 霜寒` 后，专用入口双击只让 history 从 `undo 3` 变为 `undo 4`，结果 `442 / 7976 → 83 / 1230`。路线 `#0` 仍为 `丰柏 → 霜寒 / primary / 65 资源区域 / 1,388.1 千米`；城市 `#7` 与 `#18` 的角色、国家、省份、资源和人口 before-image 逐字段不变。
- 一次撤销恢复 `442 / 7976` 和 `undo 3 / redo 1`，重做恢复 `83 / 1230`；两次状态均 `WebGL error 0`。目标页面 console error / warn 为 `0`，操作窗口没有新增 health error。

### 故障语义与门禁

- 路线响应归一专项注入 `operation_failed ← worker_regeneration_refresh_fault`：普通文案只有“重新生成失败，当前地图未应用本次更改。”，调试文案精确包含 `错误码：operation_failed；内部码：worker_regeneration_refresh_fault`。RoutePanel 动态路径直接调用同一 `regenerationFeedbackMessage`，未另建错误码映射。
- route edit / pending、regeneration user copy、route + city lock、typecheck、`1405 modules` production build 与差异门通过。完成版本 `0.5.69`；分支只推送，不合入 `main`，第 361 项从本完成提交继续创建。
