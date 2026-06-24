# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:47.366Z
模板：`lowIsland`
Seed：`audit-lowIsland-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.925 | 5.925 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.3 | 0.3 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 36 | 36 | 0 | 0 | pass |
| grid.temperature.min | -20 | -20 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 14.083 | 14.083 | 0 | 0 | pass |
| pack.cells | 4436 | 4436 | 0 | 0 | pass |
| pack.packGridRatio | 0.443 | 0.443 | 0 | 0 | pass |
| pack.avgDegree | 5.97 | 5.97 | 0 | 0 | pass |
| pack.havenCells | 687 | 687 | 0 | 0 | pass |
| features.total | 11 | 11 | 0 | 0 | pass |
| features.lakes | 5 | 5 | 0 | 0 | pass |
| rivers.count | 186 | 184 | -2 | 0.011 | pass |
| rivers.cellsWithRiver | 866 | 853 | -13 | 0.015 | pass |
| population.positivePopulationCells | 3348 | 3348 | 0 | 0 | pass |
| society.cultures | 8 | 8 | 0 | 0 | pass |
| society.burgs | 699 | 694 | -5 | 0.007 | pass |
| society.ports | 89 | 75 | -14 | 0.157 | pass |
| society.states | 30 | 30 | 0 | 0 | pass |
| society.religions | 11 | 11 | 0 | 0 | pass |
| society.provinces | 157 | 154 | -3 | 0.019 | pass |
| routes.total | 508 | 538 | 30 | 0.059 | pass |
| routes.roads | 22 | 23 | 1 | 0.045 | pass |
| routes.trails | 406 | 439 | 33 | 0.081 | pass |
| routes.searoutes | 80 | 76 | -4 | 0.05 | pass |
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
