# 重生成锁定覆盖矩阵

> 本报告由 `tools/webgl-generator-regeneration-lock-coverage-matrix.mjs` 从当前对象类型与公开 API 目录生成。阶段 A 只完成分类闭包；生成保护分别在阶段 C～E 实现。

## 分母

- 列表页：14
- 可锁定行类型：15
- 重生成入口：22
- 双向差集：0

## 列表页与行类型

- `StatePanel.vue`：`state`
- `ProvincePanel.vue`：`province`
- `CityPanel.vue`：`city`
- `RoutePanel.vue`：`route`
- `RiverPanel.vue`：`river`
- `MarkerPanel.vue`：`marker`
- `DiplomacyPanel.vue`：`diplomacy-relation`
- `ReligionPanel.vue`：`religion`
- `CulturePanel.vue`：`culture`
- `MilitaryPanel.vue`：`military`
- `ZonePanel.vue`：`zone`
- `FeaturePanel.vue`：`feature`
- `OceanCurrentPanel.vue`：`ocean-current`
- `EconomyPanel.vue`：`economy-market`、`trade-flow`

## 重生成入口分类

- `generate.regenerate:features`：feature（阶段 D）
- `generate.regenerate:routes`：route（阶段 C）
- `generate.regenerate:rivers`：river、route（阶段 C）
- `generate.regenerate:cities`：city、route（阶段 C）
- `generate.regenerate:states`：city、province、route、state（阶段 D）
- `generate.regenerate:provinces`：city、province、route（阶段 D）
- `generate.regenerate:markers`：marker（阶段 C）
- `generate.regenerate:diplomacy`：diplomacy-relation（阶段 E）
- `generate.regenerate:religions`：religion（阶段 D）
- `generate.regenerate:military`：military（阶段 E）
- `generate.regenerate:zones`：zone（阶段 C）
- `oceanCurrents.regenerate`：ocean-current（阶段 C）
- `oceanCurrents.rebuildWorld`：city、culture、diplomacy-relation、economy-market、feature、marker、military、ocean-current、province、religion、river、route、state、trade-flow、zone（阶段 E）
- `climate.applyDownstreamRebuild`：diplomacy-relation、economy-market、marker、military、religion、river、route、trade-flow、zone（阶段 E）
- `edit.height.applySeafloorReset`：city、culture、diplomacy-relation、economy-market、feature、marker、military、ocean-current、province、religion、river、route、state、trade-flow、zone（阶段 E）
- `edit.height.rebuildBaseDerived`：city、feature、ocean-current、province、river、route、state（阶段 E）
- `edit.height.rebuildDownstreamDerived`：diplomacy-relation、economy-market、marker、military、religion、trade-flow、zone（阶段 E）
- `edit.height.rebuildAllDerived`：city、culture、diplomacy-relation、economy-market、feature、marker、military、ocean-current、province、religion、river、route、state、trade-flow、zone（阶段 E）
- `edit.cultures.applyExpansion:reexpand`：culture（阶段 D）
- `edit.religions.applyExpansion:reexpand`：religion（阶段 D）
- `edit.economy.assignCells`：economy-market、trade-flow（阶段 E）
- `edit.economy.rebuild`：economy-market、trade-flow（阶段 E）
