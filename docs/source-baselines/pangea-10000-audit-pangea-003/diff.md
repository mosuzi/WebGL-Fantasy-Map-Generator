# Source / Candidate 对照差异

生成时间：2026-06-24T16:41:10.198Z
模板：`pangea`
Seed：`audit-pangea-003`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.924 | 5.924 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.489 | 0.489 | 0 | 0 | pass |
| grid.height.p50 | 19 | 19 | 0 | 0 | pass |
| grid.height.p95 | 55 | 55 | 0 | 0 | pass |
| grid.temperature.min | -35 | -35 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 8.019 | 8.019 | 0 | 0 | pass |
| pack.cells | 6923 | 6923 | 0 | 0 | pass |
| pack.packGridRatio | 0.692 | 0.692 | 0 | 0 | pass |
| pack.avgDegree | 5.948 | 5.948 | 0 | 0 | pass |
| pack.havenCells | 1017 | 1017 | 0 | 0 | pass |
| features.total | 14 | 14 | 0 | 0 | pass |
| features.lakes | 4 | 4 | 0 | 0 | pass |
| rivers.count | 197 | 195 | -2 | 0.01 | pass |
| rivers.cellsWithRiver | 901 | 880 | -21 | 0.023 | pass |
| population.positivePopulationCells | 4811 | 4810 | -1 | 0 | pass |
| society.cultures | 9 | 9 | 0 | 0 | pass |
| society.burgs | 966 | 975 | 9 | 0.009 | pass |
| society.ports | 119 | 84 | -35 | 0.294 | pass |
| society.states | 13 | 13 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 228 | 223 | -5 | 0.022 | pass |
| routes.total | 709 | 710 | 1 | 0.001 | pass |
| routes.roads | 11 | 11 | 0 | 0 | pass |
| routes.trails | 605 | 623 | 18 | 0.03 | pass |
| routes.searoutes | 93 | 76 | -17 | 0.183 | pass |
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
