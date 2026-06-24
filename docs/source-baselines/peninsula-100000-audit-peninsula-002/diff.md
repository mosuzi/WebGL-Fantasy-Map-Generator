# Source / Candidate 对照差异

生成时间：2026-06-21T01:14:11.417Z
模板：`peninsula`
Seed：`audit-peninsula-002`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.58 | 0.58 | 0 | 0 | pass |
| grid.height.p50 | 20 | 20 | 0 | 0 | pass |
| grid.height.p95 | 67 | 67 | 0 | 0 | pass |
| grid.temperature.min | -14 | -14 | 0 | 0 | pass |
| grid.temperature.max | 30 | 30 | 0 | 0 | pass |
| grid.precipitation.mean | 20.871 | 20.871 | 0 | 0 | pass |
| pack.cells | 78307 | 78307 | 0 | 0 | pass |
| pack.packGridRatio | 0.784 | 0.784 | 0 | 0 | pass |
| pack.avgDegree | 5.983 | 5.983 | 0 | 0 | pass |
| pack.havenCells | 11812 | 11812 | 0 | 0 | pass |
| features.total | 501 | 501 | 0 | 0 | pass |
| features.lakes | 365 | 365 | 0 | 0 | pass |
| rivers.count | 1254 | 1068 | -186 | 0.148 | pass |
| rivers.cellsWithRiver | 7380 | 6501 | -879 | 0.119 | pass |
| population.positivePopulationCells | 58261 | 58282 | 21 | 0 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 1868 | 1869 | 1 | 0.001 | pass |
| society.ports | 404 | 395 | -9 | 0.022 | pass |
| society.states | 19 | 19 | 0 | 0 | pass |
| society.religions | 17 | 17 | 0 | 0 | pass |
| society.provinces | 616 | 626 | 10 | 0.016 | pass |
| routes.total | 1623 | 1701 | 78 | 0.048 | pass |
| routes.roads | 19 | 10 | -9 | 0.474 | pass |
| routes.trails | 1253 | 1357 | 104 | 0.083 | pass |
| routes.searoutes | 351 | 334 | -17 | 0.048 | pass |
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
