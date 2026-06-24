# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:01.566Z
模板：`archipelago`
Seed：`audit-archipelago-003`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.923 | 5.923 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.157 | 0.157 | 0 | 0 | pass |
| grid.height.p50 | 13 | 13 | 0 | 0 | pass |
| grid.height.p95 | 28 | 28 | 0 | 0 | pass |
| grid.temperature.min | -7 | -7 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 12.769 | 12.769 | 0 | 0 | pass |
| pack.cells | 4234 | 4234 | 0 | 0 | pass |
| pack.packGridRatio | 0.423 | 0.423 | 0 | 0 | pass |
| pack.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| pack.havenCells | 1053 | 1053 | 0 | 0 | pass |
| features.total | 36 | 36 | 0 | 0 | pass |
| features.lakes | 3 | 3 | 0 | 0 | pass |
| rivers.count | 169 | 167 | -2 | 0.012 | pass |
| rivers.cellsWithRiver | 471 | 462 | -9 | 0.019 | pass |
| population.positivePopulationCells | 2139 | 2139 | 0 | 0 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 450 | 439 | -11 | 0.024 | pass |
| society.ports | 95 | 79 | -16 | 0.168 | pass |
| society.states | 22 | 22 | 0 | 0 | pass |
| society.religions | 16 | 16 | 0 | 0 | pass |
| society.provinces | 117 | 109 | -8 | 0.068 | pass |
| routes.total | 381 | 376 | -5 | 0.013 | pass |
| routes.roads | 11 | 15 | 4 | 0.364 | pass |
| routes.trails | 265 | 273 | 8 | 0.03 | pass |
| routes.searoutes | 105 | 88 | -17 | 0.162 | pass |
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
