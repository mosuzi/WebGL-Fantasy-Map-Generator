# Source / Candidate 对照差异

生成时间：2026-06-21T01:10:06.823Z
模板：`mediterranean`
Seed：`audit-mediterranean-001`
目标 cells：100000
状态：pass（fail 0，warn 0）

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
| rivers.count | 956 | 912 | -44 | 0.046 | pass |
| rivers.cellsWithRiver | 5708 | 5592 | -116 | 0.02 | pass |
| population.positivePopulationCells | 53650 | 53834 | 184 | 0.003 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 1724 | 1729 | 5 | 0.003 | pass |
| society.ports | 230 | 261 | 31 | 0.135 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 477 | 476 | -1 | 0.002 | pass |
| routes.total | 1331 | 1489 | 158 | 0.119 | pass |
| routes.roads | 19 | 17 | -2 | 0.105 | pass |
| routes.trails | 1098 | 1203 | 105 | 0.096 | pass |
| routes.searoutes | 214 | 269 | 55 | 0.257 | pass |
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
