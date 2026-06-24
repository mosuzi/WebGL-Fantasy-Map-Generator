# Source / Candidate 对照差异

生成时间：2026-06-21T01:10:47.996Z
模板：`continents`
Seed：`audit-continents-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.923 | 5.923 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.318 | 0.318 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 47 | 47 | 0 | 0 | pass |
| grid.temperature.min | -9 | -9 | 0 | 0 | pass |
| grid.temperature.max | 29 | 29 | 0 | 0 | pass |
| grid.precipitation.mean | 15.81 | 15.81 | 0 | 0 | pass |
| pack.cells | 5434 | 5434 | 0 | 0 | pass |
| pack.packGridRatio | 0.543 | 0.543 | 0 | 0 | pass |
| pack.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| pack.havenCells | 1058 | 1058 | 0 | 0 | pass |
| features.total | 17 | 17 | 0 | 0 | pass |
| features.lakes | 6 | 6 | 0 | 0 | pass |
| rivers.count | 238 | 236 | -2 | 0.008 | pass |
| rivers.cellsWithRiver | 926 | 921 | -5 | 0.005 | pass |
| population.positivePopulationCells | 3684 | 3684 | 0 | 0 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 754 | 757 | 3 | 0.004 | pass |
| society.ports | 110 | 100 | -10 | 0.091 | pass |
| society.states | 20 | 20 | 0 | 0 | pass |
| society.religions | 17 | 17 | 0 | 0 | pass |
| society.provinces | 226 | 210 | -16 | 0.071 | pass |
| routes.total | 557 | 617 | 60 | 0.108 | pass |
| routes.roads | 15 | 13 | -2 | 0.133 | pass |
| routes.trails | 440 | 499 | 59 | 0.134 | pass |
| routes.searoutes | 102 | 105 | 3 | 0.029 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 2 | 0 | -2 | -1 | pass |

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
| 海路中段穿陆 | 2 | 0 | 2 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

当前 case 达到阶段 0 对照要求，可推进下一阶段。
