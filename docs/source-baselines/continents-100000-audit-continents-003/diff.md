# Source / Candidate 对照差异

生成时间：2026-06-24T16:38:59.390Z
模板：`continents`
Seed：`audit-continents-003`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.382 | 0.382 | 0 | 0 | pass |
| grid.height.p50 | 14 | 14 | 0 | 0 | pass |
| grid.height.p95 | 51 | 51 | 0 | 0 | pass |
| grid.temperature.min | -17 | -17 | 0 | 0 | pass |
| grid.temperature.max | 30 | 30 | 0 | 0 | pass |
| grid.precipitation.mean | 26.614 | 26.614 | 0 | 0 | pass |
| pack.cells | 55115 | 55115 | 0 | 0 | pass |
| pack.packGridRatio | 0.552 | 0.552 | 0 | 0 | pass |
| pack.avgDegree | 5.994 | 5.994 | 0 | 0 | pass |
| pack.havenCells | 8076 | 8076 | 0 | 0 | pass |
| features.total | 201 | 201 | 0 | 0 | pass |
| features.lakes | 83 | 83 | 0 | 0 | pass |
| rivers.count | 909 | 867 | -42 | 0.046 | pass |
| rivers.cellsWithRiver | 5973 | 5790 | -183 | 0.031 | pass |
| population.positivePopulationCells | 42202 | 42204 | 2 | 0 | pass |
| society.cultures | 20 | 20 | 0 | 0 | pass |
| society.burgs | 1357 | 1357 | 0 | 0 | pass |
| society.ports | 229 | 241 | 12 | 0.052 | pass |
| society.states | 18 | 18 | 0 | 0 | pass |
| society.religions | 30 | 30 | 0 | 0 | pass |
| society.provinces | 487 | 492 | 5 | 0.01 | pass |
| routes.total | 1201 | 1286 | 85 | 0.071 | pass |
| routes.roads | 16 | 13 | -3 | 0.188 | pass |
| routes.trails | 936 | 1001 | 65 | 0.069 | pass |
| routes.searoutes | 249 | 272 | 23 | 0.092 | pass |
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
