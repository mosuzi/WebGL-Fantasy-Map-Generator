# Source / Candidate 对照差异

生成时间：2026-06-26T14:51:05.849Z
模板：`mediterranean`
Seed：`audit-mediterranean-001`
目标 cells：100000
状态：fail（fail 28，warn 11）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.611 | 0.611 | 0 | 0 | pass |
| grid.height.p50 | 27 | 27 | 0 | 0 | pass |
| grid.height.p95 | 76 | 76 | 0 | 0 | pass |
| grid.temperature.min | -35 | -35 | 0 | 0 | pass |
| grid.temperature.max | 27 | 27 | 0 | 0 | pass |
| grid.precipitation.mean | 9.171 | 9.171 | 0 | 0 | pass |
| pack.cells | 73028 | 73028 | 0 | 0 | pass |
| pack.packGridRatio | 0.731 | 0.731 | 0 | 0 | pass |
| pack.avgDegree | 5.97 | 5.97 | 0 | 0 | pass |
| pack.havenCells | 7148 | 7148 | 0 | 0 | pass |
| features.total | 236 | 236 | 0 | 0 | pass |
| features.lakes | 140 | 140 | 0 | 0 | pass |
| rivers.count | 955 | 912 | -43 | 0.045 | pass |
| rivers.cellsWithRiver | 5711 | 5592 | -119 | 0.021 | pass |
| population.positivePopulationCells | 56846 | 53834 | -3012 | 0.053 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 1825 | 1730 | -95 | 0.052 | pass |
| society.ports | 321 | 234 | -87 | 0.271 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 515 | 463 | -52 | 0.101 | pass |
| routes.total | 1557 | 1481 | -76 | 0.049 | pass |
| routes.roads | 34 | 16 | -18 | 0.529 | pass |
| routes.trails | 1230 | 1232 | 2 | 0.002 | pass |
| routes.searoutes | 293 | 233 | -60 | 0.205 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 737 | 0 | -737 | -1 | pass |
| lateStages.names.burgNames | 1825 | 1730 | -95 | 0.052 | pass |
| lateStages.names.burgCoas | 1825 | 1730 | -95 | 0.052 | pass |
| lateStages.names.stateFullNames | 21 | 21 | 0 | 0 | pass |
| lateStages.names.stateFormNames | 21 | 21 | 0 | 0 | pass |
| lateStages.names.riverNames | 955 | 912 | -43 | 0.045 | pass |
| lateStages.names.lakeNames | 140 | 140 | 0 | 0 | pass |
| lateStages.military.regiments | 409 | 402 | -7 | 0.017 | pass |
| lateStages.military.statesWithMilitary | 21 | 21 | 0 | 0 | pass |
| lateStages.markers.total | 568 | 539 | -29 | 0.051 | pass |
| lateStages.markers.withIcon | 568 | 539 | -29 | 0.051 | pass |
| lateStages.zones.total | 10 | 14 | 4 | 0.4 | pass |
| lateStages.statistics.burgsWithPopulation | 1825 | 1730 | -95 | 0.052 | pass |
| lateStages.statistics.statesWithArea | 21 | 22 | 1 | 0.048 | pass |
| lateStages.statistics.provincesWithPole | 515 | 463 | -52 | 0.101 | pass |
| economy.goods.total | 71 | 0 | -71 | 1 | fail |
| economy.goods.raw | 39 | 0 | -39 | 1 | fail |
| economy.goods.manufactured | 30 | 0 | -30 | 1 | fail |
| economy.goods.hybrid | 2 | 0 | -2 | 1 | fail |
| economy.goods.withBiomeOutput | 16 | 0 | -16 | 1 | fail |
| economy.goods.withDemandCoverage | 58 | 0 | -58 | 1 | fail |
| economy.goods.resourceCells | 12634 | 0 | -12634 | 1 | fail |
| economy.markets.total | 65 | 0 | -65 | 1 | fail |
| economy.markets.cellsAssigned | 65106 | 0 | -65106 | 1 | fail |
| economy.markets.assignedRatio | 0.892 | 0 | -0.892 | 1 | fail |
| economy.markets.burgsWithMarket | 1825 | 0 | -1825 | 1 | fail |
| economy.markets.plazaBurgs | 65 | 0 | -65 | 1 | fail |
| economy.markets.goodsEntries | 4615 | 0 | -4615 | 1 | fail |
| economy.markets.stock.mean | 33.694 | 0 | -33.694 | 1 | warn |
| economy.markets.price.mean | 6.031 | 0 | -6.031 | 1 | warn |
| economy.production.burgsWithProduction | 1825 | 0 | -1825 | 1 | fail |
| economy.production.localRecords | 1208 | 0 | -1208 | 1 | fail |
| economy.production.mfgRecords | 13078 | 0 | -13078 | 1 | fail |
| economy.production.dealRecords | 32791 | 0 | -32791 | 1 | fail |
| economy.production.burgsWithProduct | 1825 | 0 | -1825 | 1 | fail |
| economy.production.product.mean | 36.087 | 0 | -36.087 | 1 | warn |
| economy.production.burgTreasury.mean | 30.641 | 0 | -30.641 | 1 | warn |
| economy.deals.total | 33683 | 0 | -33683 | 1 | fail |
| economy.deals.marketToBurg | 27301 | 0 | -27301 | 1 | fail |
| economy.deals.burgToMarket | 5490 | 0 | -5490 | 1 | fail |
| economy.deals.marketToMarket | 892 | 0 | -892 | 1 | fail |
| economy.deals.tradedGoods | 68 | 0 | -68 | 1 | fail |
| economy.deals.units | 39928 | 0 | -39928 | 1 | warn |
| economy.deals.value | 152165.21 | 0 | -152165.21 | 1 | warn |
| economy.deals.taxTotal | 15061.219 | 0 | -15061.219 | 1 | warn |
| economy.deals.taxedDeals | 6371 | 0 | -6371 | 1 | fail |
| economy.taxes.statesWithRates | 21 | 0 | -21 | 1 | fail |
| economy.taxes.statesWithTreasury | 21 | 0 | -21 | 1 | fail |
| economy.taxes.salesTax.mean | 0.155 | 0 | -0.155 | 1 | warn |
| economy.taxes.pollTax.mean | 0.193 | 0 | -0.193 | 1 | fail |
| economy.taxes.treasuryTotal | 97479.1 | 0 | -97479.1 | 1 | warn |
| economy.taxes.dealTaxTotal | 15061.219 | 0 | -15061.219 | 1 | warn |
| economy.taxes.pollTaxExpected | 82417.882 | 0 | -82417.882 | 1 | warn |

## 不变量

| 检查 | source | candidate | 上限 | 状态 |
|---|---:|---:|---:|---|
| grid 邻接引用 | 0 | 0 | 0 | pass |
| grid 顶点引用 | 0 | 0 | 0 | pass |
| pack grid 引用 | 0 | 0 | 0 | pass |
| pack 邻接引用 | 0 | 0 | 0 | pass |
| pack 顶点引用 | 0 | 0 | 0 | pass |
| 城市落水 | undefined | 0 | 0 | pass |
| 陆路穿水 | 0 | 0 | 0 | pass |
| 海路中段穿陆 | 737 | 0 | 737 | pass |
| marker cell 引用 | 0 | 0 | 0 | pass |
| zone cell 引用 | 0 | 0 | 0 | pass |
| military cell 引用 | 0 | 0 | 0 | pass |
| good cell 引用 | 0 | 0 | 0 | pass |
| recipe good 引用 | 0 | 0 | 0 | pass |
| market center burg 引用 | 0 | 0 | 0 | pass |
| cell market 引用 | 0 | 0 | 0 | pass |
| burg market 引用 | 0 | 0 | 0 | pass |
| production good 引用 | 0 | 0 | 0 | pass |
| production deal 引用 | 0 | 0 | 0 | pass |
| deal party 引用 | 0 | 0 | 0 | pass |
| deal good 引用 | 0 | 0 | 0 | pass |
| deal index | 0 | 0 | 0 | pass |
| deal amount | 0 | 0 | 0 | pass |
| treasury mismatch | 0 | 0 | 0 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |
| candidate 经济链路 | false | fail | candidate 经济链路为 0，尚未输出 goods/markets/production/deals/taxes |

## 缺失 pack 字段

- `pack.goods`
- `pack.markets`
- `pack.deals`
- `pack.cells.good`
- `pack.cells.market`

## 下一步建议

进入阶段 19：当前 source schema 已纳入 goods/markets/production/deals/taxes，candidate 经济链路仍为空。下一刀先实现经济链路数据产物：goods catalogue、market territories、production records、deal log 和 state treasury，不做市场 UI、图表、贸易动画或编辑器。
