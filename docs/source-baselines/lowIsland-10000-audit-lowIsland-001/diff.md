# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:44.478Z
模板：`lowIsland`
Seed：`audit-lowIsland-001`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.921 | 5.921 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.302 | 0.302 | 0 | 0 | pass |
| grid.height.p50 | 13 | 13 | 0 | 0 | pass |
| grid.height.p95 | 32 | 32 | 0 | 0 | pass |
| grid.temperature.min | -10 | -10 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 9.804 | 9.804 | 0 | 0 | pass |
| pack.cells | 5081 | 5081 | 0 | 0 | pass |
| pack.packGridRatio | 0.508 | 0.508 | 0 | 0 | pass |
| pack.avgDegree | 5.967 | 5.967 | 0 | 0 | pass |
| pack.havenCells | 995 | 995 | 0 | 0 | pass |
| features.total | 25 | 25 | 0 | 0 | pass |
| features.lakes | 11 | 11 | 0 | 0 | pass |
| rivers.count | 156 | 148 | -8 | 0.051 | pass |
| rivers.cellsWithRiver | 627 | 585 | -42 | 0.067 | pass |
| population.positivePopulationCells | 3546 | 3546 | 0 | 0 | pass |
| society.cultures | 17 | 17 | 0 | 0 | pass |
| society.burgs | 716 | 735 | 19 | 0.027 | pass |
| society.ports | 103 | 97 | -6 | 0.058 | pass |
| society.states | 28 | 28 | 0 | 0 | pass |
| society.religions | 27 | 27 | 0 | 0 | pass |
| society.provinces | 228 | 228 | 0 | 0 | pass |
| routes.total | 555 | 605 | 50 | 0.09 | pass |
| routes.roads | 22 | 21 | -1 | 0.045 | pass |
| routes.trails | 425 | 483 | 58 | 0.136 | pass |
| routes.searoutes | 108 | 101 | -7 | 0.065 | pass |
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
