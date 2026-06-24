# Source / Candidate 对照差异

生成时间：2026-06-24T16:38:18.114Z
模板：`continents`
Seed：`audit-continents-001`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.924 | 5.924 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.32 | 0.32 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 49 | 49 | 0 | 0 | pass |
| grid.temperature.min | -9 | -9 | 0 | 0 | pass |
| grid.temperature.max | 22 | 22 | 0 | 0 | pass |
| grid.precipitation.mean | 13.384 | 13.384 | 0 | 0 | pass |
| pack.cells | 5226 | 5226 | 0 | 0 | pass |
| pack.packGridRatio | 0.522 | 0.522 | 0 | 0 | pass |
| pack.avgDegree | 5.967 | 5.967 | 0 | 0 | pass |
| pack.havenCells | 890 | 890 | 0 | 0 | pass |
| features.total | 17 | 17 | 0 | 0 | pass |
| features.lakes | 0 | 0 | 0 | 0 | pass |
| rivers.count | 205 | 205 | 0 | 0 | pass |
| rivers.cellsWithRiver | 899 | 899 | 0 | 0 | pass |
| population.positivePopulationCells | 3627 | 3627 | 0 | 0 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 746 | 746 | 0 | 0 | pass |
| society.ports | 85 | 75 | -10 | 0.118 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 180 | 171 | -9 | 0.05 | pass |
| routes.total | 554 | 611 | 57 | 0.103 | pass |
| routes.roads | 15 | 18 | 3 | 0.2 | pass |
| routes.trails | 452 | 510 | 58 | 0.128 | pass |
| routes.searoutes | 87 | 83 | -4 | 0.046 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 1 | 0 | -1 | -1 | pass |

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
| 海路中段穿陆 | 1 | 0 | 1 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

当前 case 达到阶段 0 对照要求，可推进下一阶段。
