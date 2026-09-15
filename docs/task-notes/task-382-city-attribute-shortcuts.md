# 第 382 项城市属性图标快捷操作交接

本文件只记录实施与验证证据，活动状态以 [`../current-plan.md`](../current-plan.md) 为准。

## 任务包

| 字段 | 内容 |
| --- | --- |
| 目标 | 城市管理选中城市后，以图标快捷修改已有城市属性 |
| 阶段 | 用户批准先发布功能基线，再继续性能定位与修复 |
| 冻结点 | `codex/task-382-city-attribute-shortcuts`，初始基线 `63f176c`，首个交付版本 `0.5.96` |
| 唯一写者 | 主线程；调查 / 集成复核均只读且未派生 |
| 产品边界 | `runtime/city-attribute-commands.js`、`runtime/app.js`、`ui/panels/city-panel.js`、`ui/vue/components/CityPanel.vue`、`styles.css` |
| 保持 | 既有字段、首都唯一性、城市与兼容数据同步、海路港口条件、单历史和精确回滚；`source/` 不变 |
| 便宜门 | 属性 Node 专项与 `git diff --check` |
| 停止条件 | 用户新裁定已解除原冻结；重新从具体动作和阶段耗时定位，不以重复全量验证代替调查 |

## 已实现

- 首都、贸易中心、要塞、城墙、港口、神庙六个 `32×32px` 图标；状态点亮、中文 title、aria-label / aria-pressed、键盘激活、选中城市名。
- 贸易中心按推荐项使用已有 `plaza` 商贸设施字段。已异步询问是否改为经济市场中心，尚未收到用户选择；没有更换 `market.centerBurgId`。
- 首都复用既有迁都事务并捕获旧 / 新城市及双侧国家锚点；港口只写有效水体 ID，不迁移坐标，不重新生成设施；连接海路时禁止直接取消港口。
- 新事务只捕获写入字段，旧档缺字段在撤销后仍缺失，失败自回滚；首都 / 港口 OR 兼容单边旧数据，设施显式 `0` 优先。
- 一次性能窄优化：设施不重建点图层或全图标签；首都 / 港口仍保持必要地图角色刷新。

## 验证

- 投入产出：产品 `5` 文件、`+238 / -4` 行；工具 `2` 文件、`+235` 行。六个图标功能完成 `6 / 6`，最终性能门未通过；当前委派等待 `0`，无运行中的委派。
- PASS：`regress:city-attributes`，8 组事务往返、单历史、no-op、故障回滚、设施保存回读、缺字段和单边旧港口海路保护。
- PASS：`typecheck:core`、`regress:state-capital-options`、`regress:object-details-edit`、交互表面 `108 / 88 / 20`、未分类 `0`、版本门、`1411 modules` production build、`git diff --check`。
- 独立复核：发现单边旧港口误判，修复后同一 blocker 复验 ACCEPT；兼容输入经正式保存 / 回读确认拒绝清港，海路不变。
- 真实 production Chrome：3k 目标实际 `3015` 格、100k 目标实际 `99846` 格；六个图标、港口开关及地理拒绝、迁都、撤销 / 重做、键盘空格通过。`690px` 视口按钮组内容 / 滚动宽 `574 / 574`，无溢出。
- 首轮性能：3k 最大 `78ms`；100k 最大 `241ms`、两次超过 `200ms`。窄优化后唯一复验：3k `14` 次 LongTask、最大 `79ms`；100k `15` 次、最大 `210ms`、超限 `1` 次。
- 当前真实阻断：100k `210ms`，性能事件 `mu2vjttr-uxuvkd`、pageTime `62170.2ms`。无应用异常 / WebGL error，但有对应 LongTask 警告；不可声明全门通过。
- 附带旧回归：`regress:city-scale` 在生成城市 `#748` 的 `city != town` 失败。独立 `git archive 63f176c` 基线相同失败，登记到 `FOLLOWUPS.md`，未改生成器或阈值。

## 证据与恢复

- 本地产物根：`Z:/tmp/codex/2026-09-16/task-382-city-shortcuts/`。
- `report.json`、`failure.json`：首轮浏览器原始证据；`recheck/report.json`、`recheck/failure.json`：唯一目标复验。
- `recheck/3000-desktop.png`、`recheck/100000-desktop.png`、`recheck/100000-narrow.png`：真实布局；`build-final.log`：构建。
- `city-scale.log`、`city-scale-baseline.log`：阶段外旧失败与未改基线；`checkpoint.patch` 加 `checkpoint/` 中三个新文件为未提交快照。
- 用户后续明确要求“先提交推送，然后检查这次卡顿的原因并尝试修复”。按此顺序先交付功能基线到主线，再继续当前编号的性能定位；最终独立验收与归档仍待性能工作收口。
