# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:00.783Z
模板：`highIsland`
Seed：`audit-highIsland-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.923 | 5.923 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.315 | 0.315 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 52 | 52 | 0 | 0 | pass |
| grid.temperature.min | -14 | -14 | 0 | 0 | pass |
| grid.temperature.max | 29 | 29 | 0 | 0 | pass |
| grid.precipitation.mean | 15.221 | 15.221 | 0 | 0 | pass |
| pack.cells | 4772 | 4772 | 0 | 0 | pass |
| pack.packGridRatio | 0.477 | 0.477 | 0 | 0 | pass |
| pack.avgDegree | 5.963 | 5.963 | 0 | 0 | pass |
| pack.havenCells | 769 | 769 | 0 | 0 | pass |
| features.total | 13 | 13 | 0 | 0 | pass |
| features.lakes | 6 | 6 | 0 | 0 | pass |
| rivers.count | 182 | 179 | -3 | 0.016 | pass |
| rivers.cellsWithRiver | 860 | 840 | -20 | 0.023 | pass |
| population.positivePopulationCells | 3482 | 3482 | 0 | 0 | pass |
| society.cultures | 9 | 9 | 0 | 0 | pass |
| society.burgs | 690 | 694 | 4 | 0.006 | pass |
| society.ports | 89 | 72 | -17 | 0.191 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 218 | 201 | -17 | 0.078 | pass |
| routes.total | 533 | 553 | 20 | 0.038 | pass |
| routes.roads | 11 | 11 | 0 | 0 | pass |
| routes.trails | 435 | 472 | 37 | 0.085 | pass |
| routes.searoutes | 87 | 70 | -17 | 0.195 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 3 | 0 | -3 | -1 | pass |

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
| 海路中段穿陆 | 3 | 0 | 3 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

当前 case 达到阶段 0 对照要求，可推进下一阶段。
