# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:02.730Z
模板：`archipelago`
Seed：`audit-archipelago-001`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.08 | 0.08 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 23 | 23 | 0 | 0 | pass |
| grid.temperature.min | -26 | -26 | 0 | 0 | pass |
| grid.temperature.max | 25 | 25 | 0 | 0 | pass |
| grid.precipitation.mean | 18.309 | 18.309 | 0 | 0 | pass |
| pack.cells | 9750 | 9750 | 0 | 0 | pass |
| pack.packGridRatio | 0.194 | 0.194 | 0 | 0 | pass |
| pack.avgDegree | 5.984 | 5.984 | 0 | 0 | pass |
| pack.havenCells | 2308 | 2308 | 0 | 0 | pass |
| features.total | 80 | 80 | 0 | 0 | pass |
| features.lakes | 10 | 10 | 0 | 0 | pass |
| rivers.count | 263 | 257 | -6 | 0.023 | pass |
| rivers.cellsWithRiver | 894 | 878 | -16 | 0.018 | pass |
| population.positivePopulationCells | 5102 | 5098 | -4 | 0.001 | pass |
| society.cultures | 7 | 7 | 0 | 0 | pass |
| society.burgs | 297 | 300 | 3 | 0.01 | pass |
| society.ports | 89 | 75 | -14 | 0.157 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 11 | 11 | 0 | 0 | pass |
| society.provinces | 128 | 129 | 1 | 0.008 | pass |
| routes.total | 296 | 321 | 25 | 0.084 | pass |
| routes.roads | 5 | 10 | 5 | 1 | pass |
| routes.trails | 188 | 217 | 29 | 0.154 | pass |
| routes.searoutes | 103 | 94 | -9 | 0.087 | pass |
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
