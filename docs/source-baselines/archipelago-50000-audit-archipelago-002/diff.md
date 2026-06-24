# Source / Candidate 对照差异

生成时间：2026-06-21T01:11:47.804Z
模板：`archipelago`
Seed：`audit-archipelago-002`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.087 | 0.087 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 22 | 22 | 0 | 0 | pass |
| grid.temperature.min | -22 | -22 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 14.108 | 14.108 | 0 | 0 | pass |
| pack.cells | 10674 | 10674 | 0 | 0 | pass |
| pack.packGridRatio | 0.213 | 0.213 | 0 | 0 | pass |
| pack.avgDegree | 5.98 | 5.98 | 0 | 0 | pass |
| pack.havenCells | 2523 | 2523 | 0 | 0 | pass |
| features.total | 84 | 84 | 0 | 0 | pass |
| features.lakes | 9 | 9 | 0 | 0 | pass |
| rivers.count | 211 | 209 | -2 | 0.009 | pass |
| rivers.cellsWithRiver | 704 | 698 | -6 | 0.009 | pass |
| population.positivePopulationCells | 5582 | 5582 | 0 | 0 | pass |
| society.cultures | 15 | 15 | 0 | 0 | pass |
| society.burgs | 324 | 324 | 0 | 0 | pass |
| society.ports | 85 | 74 | -11 | 0.129 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 24 | 24 | 0 | 0 | pass |
| society.provinces | 130 | 123 | -7 | 0.054 | pass |
| routes.total | 287 | 312 | 25 | 0.087 | pass |
| routes.roads | 5 | 7 | 2 | 0.4 | pass |
| routes.trails | 197 | 223 | 26 | 0.132 | pass |
| routes.searoutes | 85 | 82 | -3 | 0.035 | pass |
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
