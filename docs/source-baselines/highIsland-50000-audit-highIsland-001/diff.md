# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:17.725Z
模板：`highIsland`
Seed：`audit-highIsland-001`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.284 | 0.284 | 0 | 0 | pass |
| grid.height.p50 | 9 | 9 | 0 | 0 | pass |
| grid.height.p95 | 53 | 53 | 0 | 0 | pass |
| grid.temperature.min | -17 | -17 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 7.418 | 7.418 | 0 | 0 | pass |
| pack.cells | 20013 | 20013 | 0 | 0 | pass |
| pack.packGridRatio | 0.399 | 0.399 | 0 | 0 | pass |
| pack.avgDegree | 5.99 | 5.99 | 0 | 0 | pass |
| pack.havenCells | 2888 | 2888 | 0 | 0 | pass |
| features.total | 55 | 55 | 0 | 0 | pass |
| features.lakes | 23 | 23 | 0 | 0 | pass |
| rivers.count | 155 | 148 | -7 | 0.045 | pass |
| rivers.cellsWithRiver | 611 | 579 | -32 | 0.052 | pass |
| population.positivePopulationCells | 15407 | 15453 | 46 | 0.003 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 876 | 879 | 3 | 0.003 | pass |
| society.ports | 162 | 159 | -3 | 0.019 | pass |
| society.states | 28 | 28 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 299 | 281 | -18 | 0.06 | pass |
| routes.total | 701 | 791 | 90 | 0.128 | pass |
| routes.roads | 22 | 19 | -3 | 0.136 | pass |
| routes.trails | 514 | 595 | 81 | 0.158 | pass |
| routes.searoutes | 165 | 177 | 12 | 0.073 | pass |
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
