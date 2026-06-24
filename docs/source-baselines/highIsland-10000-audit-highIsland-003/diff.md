# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:14.819Z
模板：`highIsland`
Seed：`audit-highIsland-003`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.922 | 5.922 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.302 | 0.302 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 59 | 59 | 0 | 0 | pass |
| grid.temperature.min | -19 | -19 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 6.226 | 6.226 | 0 | 0 | pass |
| pack.cells | 4712 | 4712 | 0 | 0 | pass |
| pack.packGridRatio | 0.471 | 0.471 | 0 | 0 | pass |
| pack.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| pack.havenCells | 790 | 790 | 0 | 0 | pass |
| features.total | 10 | 10 | 0 | 0 | pass |
| features.lakes | 2 | 2 | 0 | 0 | pass |
| rivers.count | 139 | 138 | -1 | 0.007 | pass |
| rivers.cellsWithRiver | 476 | 473 | -3 | 0.006 | pass |
| population.positivePopulationCells | 3303 | 3303 | 0 | 0 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 654 | 667 | 13 | 0.02 | pass |
| society.ports | 111 | 69 | -42 | 0.378 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 21 | 21 | 0 | 0 | pass |
| society.provinces | 153 | 152 | -1 | 0.007 | pass |
| routes.total | 482 | 527 | 45 | 0.093 | pass |
| routes.roads | 11 | 12 | 1 | 0.091 | pass |
| routes.trails | 361 | 439 | 78 | 0.216 | pass |
| routes.searoutes | 110 | 76 | -34 | 0.309 | pass |
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
