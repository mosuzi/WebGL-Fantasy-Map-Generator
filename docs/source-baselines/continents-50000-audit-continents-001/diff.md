# Source / Candidate 对照差异

生成时间：2026-06-21T01:10:53.751Z
模板：`continents`
Seed：`audit-continents-001`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.322 | 0.322 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 45 | 45 | 0 | 0 | pass |
| grid.temperature.min | -17 | -17 | 0 | 0 | pass |
| grid.temperature.max | 22 | 22 | 0 | 0 | pass |
| grid.precipitation.mean | 19.016 | 19.016 | 0 | 0 | pass |
| pack.cells | 24947 | 24947 | 0 | 0 | pass |
| pack.packGridRatio | 0.498 | 0.498 | 0 | 0 | pass |
| pack.avgDegree | 5.99 | 5.99 | 0 | 0 | pass |
| pack.havenCells | 4024 | 4024 | 0 | 0 | pass |
| features.total | 90 | 90 | 0 | 0 | pass |
| features.lakes | 26 | 26 | 0 | 0 | pass |
| rivers.count | 578 | 566 | -12 | 0.021 | pass |
| rivers.cellsWithRiver | 3118 | 3083 | -35 | 0.011 | pass |
| population.positivePopulationCells | 18105 | 18105 | 0 | 0 | pass |
| society.cultures | 10 | 14 | 4 | 0.4 | pass |
| society.burgs | 1018 | 1018 | 0 | 0 | pass |
| society.ports | 146 | 127 | -19 | 0.13 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 15 | 19 | 4 | 0.267 | pass |
| society.provinces | 268 | 282 | 14 | 0.052 | pass |
| routes.total | 842 | 905 | 63 | 0.075 | pass |
| routes.roads | 17 | 13 | -4 | 0.235 | pass |
| routes.trails | 660 | 745 | 85 | 0.129 | pass |
| routes.searoutes | 165 | 147 | -18 | 0.109 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 0 | 0 | 0 | 0 | pass |

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
| 海路中段穿陆 | 0 | 0 | 0 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

当前 case 达到阶段 0 对照要求，可推进下一阶段。
