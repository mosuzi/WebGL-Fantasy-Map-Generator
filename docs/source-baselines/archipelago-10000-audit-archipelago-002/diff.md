# Source / Candidate 对照差异

生成时间：2026-06-21T01:11:43.601Z
模板：`archipelago`
Seed：`audit-archipelago-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.924 | 5.924 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.188 | 0.188 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 33 | 33 | 0 | 0 | pass |
| grid.temperature.min | -22 | -22 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 10.044 | 10.044 | 0 | 0 | pass |
| pack.cells | 3999 | 3999 | 0 | 0 | pass |
| pack.packGridRatio | 0.4 | 0.4 | 0 | 0 | pass |
| pack.avgDegree | 5.955 | 5.955 | 0 | 0 | pass |
| pack.havenCells | 868 | 868 | 0 | 0 | pass |
| features.total | 20 | 20 | 0 | 0 | pass |
| features.lakes | 0 | 0 | 0 | 0 | pass |
| rivers.count | 170 | 170 | 0 | 0 | pass |
| rivers.cellsWithRiver | 558 | 558 | 0 | 0 | pass |
| population.positivePopulationCells | 2273 | 2273 | 0 | 0 | pass |
| society.cultures | 15 | 15 | 0 | 0 | pass |
| society.burgs | 464 | 471 | 7 | 0.015 | pass |
| society.ports | 69 | 69 | 0 | 0 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 24 | 24 | 0 | 0 | pass |
| society.provinces | 133 | 132 | -1 | 0.008 | pass |
| routes.total | 361 | 393 | 32 | 0.089 | pass |
| routes.roads | 9 | 9 | 0 | 0 | pass |
| routes.trails | 275 | 304 | 29 | 0.105 | pass |
| routes.searoutes | 77 | 80 | 3 | 0.039 | pass |
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
