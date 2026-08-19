# 第 349-10d 阶段：地貌、网络与资源核心切片

## 冻结边界

本阶段只迁移 features、routes、rivers、resource markers 的 Manifest、依赖描述与既有 Worker 结果 pre-commit 契约；业务算法、旧 wire DTO、唯一 canonical owner 和 renderer 实现保持不变。四个 Manifest 仍为 `shadow`，不得把契约迁移误报为领域完全接管。

## 实施结果

- features、routes、rivers 新增领域 Manifest；markers 补齐真实 `regeneration.compute / markers` result owner。routes 另声明既有 `route-path.compute / route-path` owner。
- 四类重生成结果在正式 history commit 前验证 request / output binding、Manifest 精确写集、operation 容器和领域镜像。Feature 覆盖 grid / pack identity、cell 引用、锁对象 / cell / 直接引用；路线覆盖 city / burg / politics / market 与路径邻接；河流覆盖双镜像、parent DAG 与 cell 引用；资源标记覆盖 pack、economy、politics 与 cell 边界。
- 锁定 Feature 的历史港口墓碑在 from-empty 城镇重建前保留，其 counterpart 数值槽不再被活动对象复用；Feature topology 同一 owner 内对直接引用字段做 before-image 恢复，最终锁断言与 Worker pre-commit 双重把关。
- 自然湖泊出口兼容两种既有表示：河流序列由湖格进入陆格，或由与该湖直接相邻的岸上 spill cell 起步。其它邻近但不相接的河流仍拒绝。

## 验收证据

- 新协议正例覆盖四个 Manifest，写路径分别为 features `25`、routes `21`、rivers `31`、markers `28`；拒绝 stale binding、缺写、DataView、policy drift、四域镜像 / identity / 边界 / parent / lock 漂移共 `16` 类负例。
- core registry：`12 domains / 175 descriptors`；dependency registry：`12 domains / 16 systems`。
- 代表性 Node 门：路线 10k / 50k / 100k connectivity 与 quality、锁路线；五种子河网、50k / 100k 锁河、河道控制点；Feature topology / patch / lock；资源经济、v1 migration；完整 world constraint `11 stages / 15 locked kinds`。
- production build：`1387 modules`；`git diff --check` 通过；浏览器执行 `0`，`source/` 改动 `0`。

## 计划外必需项与后续顺序

本阶段内插入了既有测试夹具维护与自然湖泊出口兼容修复，因为它们直接阻断声明在四个 Manifest 中的验收门；没有扩展为新的独立产品能力阶段。依赖顺序复评后仍为 `349-10d → 349-10e → 349-10f → 349-10g → 349-11`。本 checkpoint 仅在同一只读评审智能体 `ACCEPT` 后进入 349-10e。
