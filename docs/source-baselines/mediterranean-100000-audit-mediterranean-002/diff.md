# Source / Candidate 对照差异

生成时间：2026-06-24T16:38:02.587Z
模板：`mediterranean`
Seed：`audit-mediterranean-002`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.617 | 0.617 | 0 | 0 | pass |
| grid.height.p50 | 27 | 27 | 0 | 0 | pass |
| grid.height.p95 | 75 | 75 | 0 | 0 | pass |
| grid.temperature.min | -44 | -44 | 0 | 0 | pass |
| grid.temperature.max | 17 | 17 | 0 | 0 | pass |
| grid.precipitation.mean | 3.529 | 3.529 | 0 | 0 | pass |
| pack.cells | 75311 | 75311 | 0 | 0 | pass |
| pack.packGridRatio | 0.754 | 0.754 | 0 | 0 | pass |
| pack.avgDegree | 5.972 | 5.972 | 0 | 0 | pass |
| pack.havenCells | 8123 | 8123 | 0 | 0 | pass |
| features.total | 262 | 262 | 0 | 0 | pass |
| features.lakes | 153 | 153 | 0 | 0 | pass |
| rivers.count | 369 | 312 | -57 | 0.154 | pass |
| rivers.cellsWithRiver | 1885 | 1744 | -141 | 0.075 | pass |
| population.positivePopulationCells | 51067 | 51031 | -36 | 0.001 | pass |
| society.cultures | 17 | 17 | 0 | 0 | pass |
| society.burgs | 1609 | 1613 | 4 | 0.002 | pass |
| society.ports | 293 | 264 | -29 | 0.099 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 27 | 27 | 0 | 0 | pass |
| society.provinces | 619 | 611 | -8 | 0.013 | pass |
| routes.total | 1223 | 1321 | 98 | 0.08 | pass |
| routes.roads | 13 | 9 | -4 | 0.308 | pass |
| routes.trails | 944 | 1075 | 131 | 0.139 | pass |
| routes.searoutes | 266 | 237 | -29 | 0.109 | pass |
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
