# 第 349-9 阶段：依赖计划与投影恢复

## 冻结范围

本阶段只为已登记的 notes、markers、population 三域建立 dependency registry / planner，并补齐现有 `MapRuntimeCoordinator` 的 retry / resync 执行边界。不迁移第四个领域，不改变业务算法，不建立第二 canonical owner，也不把 shadow 领域虚报为 active。

## Manifest 依赖声明

每个 `derivedSystems` descriptor 现在必须声明：

- `reads / writes / invalidatedBy / invalidates`；
- `scope = affected-objects | affected-cells | full-map`；
- `rebuild = worker | main-thread | gpu-patch`；
- `reuseAcrossPresentation` 与非空 `verify`；
- `invalidatedBy` 必须由 `reads` 覆盖，所有 canonical 路径继续通过 field registry 审计。

当前真实分类为：notes object panels 使用 affected objects / main thread；marker point layer 使用 affected objects / GPU patch；marker resource economy 显式 full map / main thread；population downstream 显式 full map / Worker。宽依赖会传播到下游并保持 full rebuild，不冒充局部化。

## Dependency plan

- canonical write set 先与 Manifest command / Worker / regeneration / derived write 声明核对，再沿 `invalidatedBy → writes` 传播。
- 已知且没有派生消费者的写入为 `exact`；具备所需 affected objects / cells 的局部系统为 `local`。
- presentation changes 只产生 `renderer / ui` projection，不产生 canonical write、revision 或 rebuild，并列出可跨 presentation 复用的系统。
- 未声明写路径、缺少局部 affected scope、未知 invalidation projection 或任一 `full-map` 系统都显式输出 `full-rebuild` 及原因，并保守要求四类 projection。
- registry 冻结自有 descriptor snapshot；调用方后续修改 Manifest 对象不会改变已注册计划。

## 正式接线与恢复

- active notes runtime 不再硬编码 `projections: [persistence, ui]` 或 `invalidated: [object-panels]`，改由同一 dependency plan 提供；commit 的 `rebuilt` 仍只记录已完成事实，不把计划中的 UI rebuild 提前记为完成。
- coordinator `recover` 只接受 degraded projection，显式进入 retrying / resyncing；成功转 ready，失败带原因回到 degraded。已发布 canonical revision / history 不回滚，并拒绝并发或非法状态恢复。
- markers / population Manifest 进入统一规划测试，但业务提交路由仍保持各阶段既有边界。

## 验收

- `regress:core-dependencies`：三域、四个 derived system；覆盖 `local / full-rebuild / presentation-only / exact`，下游传播、缺 scope、未知写路径、缺 projection target、重复领域、非法 read/invalidation、非法 projection 与注册后篡改。
- `regress:core-manifests`：三域 `45` descriptor、`30` 类负例；新增 dependency descriptor 缺字段和 undeclared invalidation read 拒绝。
- `regress:core-facade`：projection retry / resync 成功、失败回到 degraded、最终恢复 ready；失败时 revision / history 不变。
- `regress:notes-core`：`13` 次 commit / revision，notes local plan 仍为 persistence / UI，旧数据与 post-commit UI degraded 行为保持。
- `typecheck:core`、markers core、population core protocol 与 production build `1375 modules` 通过；浏览器执行为 `0`。
