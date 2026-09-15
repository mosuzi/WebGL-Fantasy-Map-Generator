# 第 382 项城市属性图标快捷操作交接

本文件只记录实施与验证证据，活动状态以 [`../current-plan.md`](../current-plan.md) 为准。

## 任务包

| 字段 | 内容 |
| --- | --- |
| 目标 | 城市管理选中城市后，以图标快捷修改已有城市属性 |
| 阶段 | 功能基线已发布；性能窄修、目标浏览器门和独立最终验收完成，已归档 |
| 冻结点 | `codex/task-382-city-attribute-shortcuts`，初始基线 `63f176c`，首个交付版本 `0.5.96` |
| 唯一写者 | 主线程；调查 / 集成复核均只读且未派生 |
| 产品边界 | 原功能五文件；性能轮增加 `runtime/edit-refresh-scheduler.js` 与 `renderer/placeholder-renderer.js`，不扩改其他系统 |
| 保持 | 既有字段、首都唯一性、城市与兼容数据同步、海路港口条件、单历史和精确回滚；`source/` 不变 |
| 便宜门 | 属性 Node 专项与 `git diff --check` |
| 停止条件 | 用户新裁定已解除原冻结；重新从具体动作和阶段耗时定位，不以重复全量验证代替调查 |

## 已实现

- 首都、贸易中心、要塞、城墙、港口、神庙六个 `32×32px` 图标；状态点亮、中文 title、aria-label / aria-pressed、键盘激活、选中城市名。
- 贸易中心使用已有 `plaza` 商贸设施字段，不改变经济市场中心 `market.centerBurgId`。
- 首都复用既有迁都事务并捕获旧 / 新城市及双侧国家锚点；港口只写有效水体 ID，不迁移坐标，不重新生成设施；连接海路时禁止直接取消港口。
- 新事务只捕获写入字段，旧档缺字段在撤销后仍缺失，失败自回滚；首都 / 港口 OR 兼容单边旧数据，设施显式 `0` 优先。
- 一次性能窄优化：设施不重建点图层或全图标签；首都 / 港口仍保持必要地图角色刷新。

## 功能基线与首败记录

- 投入产出：产品 `5` 文件、`+238 / -4` 行；工具 `2` 文件、`+235` 行。六个图标功能完成 `6 / 6`，最终性能门未通过；当前委派等待 `0`，无运行中的委派。
- PASS：`regress:city-attributes`，8 组事务往返、单历史、no-op、故障回滚、设施保存回读、缺字段和单边旧港口海路保护。
- PASS：`typecheck:core`、`regress:state-capital-options`、`regress:object-details-edit`、交互表面 `108 / 88 / 20`、未分类 `0`、版本门、`1411 modules` production build、`git diff --check`。
- 独立复核：发现单边旧港口误判，修复后同一 blocker 复验 ACCEPT；兼容输入经正式保存 / 回读确认拒绝清港，海路不变。
- 真实 production Chrome：3k 目标实际 `3015` 格、100k 目标实际 `99846` 格；六个图标、港口开关及地理拒绝、迁都、撤销 / 重做、键盘空格通过。`690px` 视口按钮组内容 / 滚动宽 `574 / 574`，无溢出。
- 首轮性能：3k 最大 `78ms`；100k 最大 `241ms`、两次超过 `200ms`。窄优化后唯一复验：3k `14` 次 LongTask、最大 `79ms`；100k `15` 次、最大 `210ms`、超限 `1` 次。
- 原冻结阻断：100k `210ms`，性能事件 `mu2vjttr-uxuvkd`、pageTime `62170.2ms`。无应用异常 / WebGL error，但有对应 LongTask 警告；当时未声明全门通过。
- 附带旧回归：`regress:city-scale` 在生成城市 `#748` 的 `city != town` 失败。独立 `git archive 63f176c` 基线相同失败，登记到 `FOLLOWUPS.md`，未改生成器或阈值。

## 性能定位与收口（0.5.97）

- 按用户“先提交推送”要求，`9c62b25 / 0.5.96` 已推送任务分支并快进推送 `main`，随后继续本编号。诊断开启可选计时和 CPU profile，只用于归因，不冒充性能 PASS。
- 首都 / 港口完整标签刷新 `143～189ms`，其中 build `86～117ms`、update `57～74ms`；点层最多 `2.4ms`、面板最多 `0.4ms`。现保留无关行政标签、资源与军事节点，重新计算城市排名、LOD、样式和图标，迁都只额外重算所属国家领土锚点，资源绑定和历史范围保持。
- 诊断末尾 `301ms` 明确来自缩至 `690px` 的 ResizeObserver；其 `draw 270.6ms` 中道路约 `166ms`、河流约 `80ms`，标签仅 `17.3ms`。道路最终合并三个大数组是最大单段，改为一次分配并按偏移 `.set()`，保持三组顺序与 drawRanges。原 `210ms` 没有阶段时间标记，不倒推为同源；带 profile 的 `301ms` 不作为优化前基线。
- 编辑窗口也有后台图编码采样，但不属于上述 resize 同步慢调用栈，本轮不扩改复制协议。
- 投影等价：真实 DOM 下 `6` 组通过，覆盖迁都 / 撤销状态 / 重做状态、港口开关、手工位置 / 优先级、隐藏、`8` 个城市标签上限和跨海国家锚点；无关节点保持。道路新旧 renderer 在 `1440 / 690px` 下分别 `157212 / 156672` 个浮点值逐值一致，范围与统计一致。
- 最终无 profile production Chrome：3k 实际 `3015` 格，LongTask `1` 次、最大 `111ms`；100k 实际 `99846` 格，`15` 次、最大 `92ms`，相对上轮 `210ms` 下降 `56.2%`，两档 `>200ms = 0`。100k 时长为 `88 / 73 / 75 / 68 / 67 / 68 / 70 / 70 / 68 / 80 / 68 / 66 / 66 / 77 / 92ms`。六图标、单历史、撤销 / 重做、无效港口、键盘、窄窗口 resize 与截图均包含在验收窗口，console warning / error、health error、WebGL error 均为 `0`。
- `690px` 按钮组宽 / 滚动宽 `574 / 574`，六按钮均 `32×32px`；最终截图已目视检查。低于 `200ms` 的余留 LongTask 按一次定位、实质优化和目标复验规则记录后收口。
- 本轮 PASS：属性事务、刷新路径、类型检查、`1411 modules` 构建；独立代码与等价证据复核 ACCEPT。附带 `regress:route-style` 在实际绘制断言通过后因第 `101` 行旧拾取源码正则失败，未改 `63f176c` 基线同败，已单列 `FOLLOWUPS.md`，不宣称该旧套件通过。
- 本轮投入：产品 `3` 文件、`+54 / -10` 行；工具 `1` 文件、`+122 / -6` 行，另有 Z 盘一次性新旧道路比较脚本。功能 `6 / 6`、性能目标门完成，未扩大到后台图复制或其它旧问题。
- 独立最终验收：复核者读取无 profile 最终报告、日志与 `100000-narrow.png` 后返回 ACCEPT，可归档；无遗留阻断，委派等待 `0`。

## 证据与恢复

- 本地产物根：`Z:/tmp/codex/2026-09-16/task-382-city-shortcuts/`。
- `report.json`、`failure.json`：首轮浏览器原始证据；`recheck/report.json`、`recheck/failure.json`：唯一目标复验。
- `recheck/3000-desktop.png`、`recheck/100000-desktop.png`、`recheck/100000-narrow.png`：真实布局；`build-final.log`：构建。
- `city-scale.log`、`city-scale-baseline.log`：阶段外旧失败与未改基线；`checkpoint.patch` 加 `checkpoint/` 中三个新文件为未提交快照。
- `diagnosis/100000-stages.json`、`diagnosis/100000.cpuprofile`：动作、刷新阶段与 resize 调用栈；`parity/projection-parity.json`：六组投影等价。
- `route-buffer-parity.json`：新旧道路字节等价；`fixed/report.json`、`fixed/100000-narrow.png`、`fix-browser.log`：最终真实页面与性能；`fix-build.log`、`fix-city-attributes.log`、`fix-refresh-path.log`、`fix-typecheck.log`：目标检查。
