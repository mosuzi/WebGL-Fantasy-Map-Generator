# 第 358 项：真实存档三项失效复盘与修复

## 失效事实

- 第 353、356 项已经冻结代表存档为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，身份为 `100000 grid / 43419 pack / checksum 28eede3c`，路线基线为 `442`。
- 第 356 项要求不得用新地图或替代标签页冒充用户原图；第 357 项最终浏览器却使用本地随机 10k 地图，路线为 `296 → 300`，首帧证据也来自该随机图。
- 生产 `https://fmg.mosuzi.top/` 当前版本已核对为 `v0.5.66`，现场日志仍含 `operation-failed`、`operation-stall`、`input-handler-stall` 与 `main-thread-long-task`。因此第 357 项最终浏览器完成声明无效，不能以未部署解释。

## 冻结契约

| 项目 | 冻结内容 |
| --- | --- |
| 最终目标 | 只用文档指定真实存档复现并修复加载慢、道路重生成失败和首帧边界先虚后实 |
| 最小验收 | 同一存档身份不变；道路成功并可撤销；加载取得分段改善；首个正式帧即为最终边界；错误与 Loading 清零 |
| 非目标 | 不改 `source/`、schema、公开 API、数量算法、主题；不关闭柔化或放宽 owner / revision / 锁 / 回滚门 |
| 唯一写者 | 主线程 |
| 临时产物 | `Z:\tmp\codex\2026-08-26\task-358-real-archive-regression` |

## 阶段

| 阶段 | 目标 | 首个廉价门 | 接受门 |
| --- | --- | --- | --- |
| 358-A | 真实存档与生产现场复现 | 文件摘要、版本、导入身份 | 三项各有首败错误码 / 分段 / 帧证据 |
| 358-B | 道路窄修 | 路线专项 | 真实存档 `442 → 新结果 → 撤销 442`，锁 before-image 不变 |
| 358-C | 加载与首帧窄修 | 传输 / prepared installer 专项 | 同存档加载分段改善且首帧等于稳定帧 |
| 358-D | 集成终验 | typecheck + scoped diff | 本地正式页面同存档三项、build、错误面和最终状态通过 |

## 当前状态

- 358-A～358-D 均已完成，唯一正式浏览器验收对象始终为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`。
- 文件大小 `9,642,587 bytes`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`；正式导入后为 `100000 grid / 43419 pack / 1251 cities / 442 routes / 7976 route segments`。运行时摘要校验为 `2d56dc51`；旧专题记录的 `28eede3c` 属不同摘要口径，因此最终以文件哈希和对象计数锁定身份。

## 根因与修复

### 加载

- 导入 Worker 已经持有解析后的正式文档，却又执行一次 `encode → decode → main-thread projection`；现改为只编码一次生成 adoption handoff，并直接投影已解析文档，消除重复解码。
- 首次导入把编辑期完整 cell visual 三角缓存、两套岸线 resident 顶点同时交接给主线程。现首屏只交接边界中心 / edge curve 和当前岸线顶点；完整 cell visual mesh 在第一次真正需要 surface 重建时再惰性补齐，平滑 / 硬边界另一套 resident cache 也在用户切换时惰性建立。
- 同一真实存档正式 Worker 传输由 `123,573,771` 降至 `71,422,775 bytes`（`-42.2%`）；正式页面导入墙钟由 `21,757ms` 降至最终复验 `16,805ms`（`-22.76%`）。目标导入窗口没有新增 `>200ms` 产品 LongTask，WebGL error 为 `0`。

### 重生成竞态与错误码

- 加载期间控制面板仍允许发起重生成，用户操作会和 adoption transaction 争用，最终只得到笼统失败。运行时现广播统一 busy 状态；中央十一类重生成按钮和道路、河流、国家、外交、军事、地区、资源点、洋流等专用入口都经同一 UI 门禁调用，busy 时不再启动第二个事务，并保留结构化 `operation_busy`。
- 加载开始 `1,527ms` 时把目标切到路线，正式按钮保持 disabled；加载完成后自动恢复。真实存档路线正式重生成 `442 → 273`，按钮执行中 disabled，端到端 `3,039ms`，撤销恢复 `442 / 7,976`，历史为 `undo 0 / redo 1`，WebGL error `0`。
- 第 355 项的调试文案契约保持：调试模式显示公开码和可用的内部码链，普通模式不泄漏内部标识；`regress:regeneration-user-copy` 继续通过并确认 `debugDiagnosticsPreserved=true`。

### 首次边界

- 原来的 edge fade 被硬编码为永远绘制，和“平滑边界”混在同一观感中，首次用户无法控制。现增加独立“地图边缘渐隐”偏好，首次默认关闭、持久化保存，只做线视图刷新，不改变平滑边界或地图数据。
- 全新 origin 首次启动即显示 `地图边缘渐隐 / 关闭`；导入真实存档后保持关闭和平滑边界。首个正式帧与 `1,200ms` 后稳定帧均为 `74,054 bytes` 且逐字节相同。右缘采样关闭为 `2,468 bytes`，开启为 `2,635 bytes`，再次关闭恢复 `2,468 bytes` 且逐字节等于原关闭画面。

## 最终门禁

- 专项：map file Worker、render preparation、prepared installer、重生成用户文案全部 PASS。
- 静态与构建：`pnpm run typecheck:core`、`pnpm run build:app`（`1404 modules`）和 `git diff --check` PASS。
- 浏览器终态：真实存档 `100000 / 43419 / 1251 / 442 / 7976`；平滑边界开启、地图边缘渐隐关闭、Loading 清空、WebGL error `0`。随机地图未用于完成证据。
- 产品文件 `11` 个、产品净变更约 `250` 行；工具文件 `0`，未启用委派。完成版本 `0.5.67`。
