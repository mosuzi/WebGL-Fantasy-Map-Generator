# Source / Candidate 对照差异

生成时间：2026-06-21T01:14:35.910Z
模板：`pangea`
Seed：`audit-pangea-001`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.274 | 0.274 | 0 | 0 | pass |
| grid.height.p50 | 10 | 10 | 0 | 0 | pass |
| grid.height.p95 | 45 | 45 | 0 | 0 | pass |
| grid.temperature.min | -29 | -29 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 15.425 | 15.425 | 0 | 0 | pass |
| pack.cells | 21773 | 21773 | 0 | 0 | pass |
| pack.packGridRatio | 0.434 | 0.434 | 0 | 0 | pass |
| pack.avgDegree | 5.978 | 5.978 | 0 | 0 | pass |
| pack.havenCells | 3497 | 3497 | 0 | 0 | pass |
| features.total | 87 | 87 | 0 | 0 | pass |
| features.lakes | 13 | 13 | 0 | 0 | pass |
| rivers.count | 446 | 438 | -8 | 0.018 | pass |
| rivers.cellsWithRiver | 2281 | 2249 | -32 | 0.014 | pass |
| population.positivePopulationCells | 15373 | 15374 | 1 | 0 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 859 | 859 | 0 | 0 | pass |
| society.ports | 158 | 124 | -34 | 0.215 | pass |
| society.states | 12 | 12 | 0 | 0 | pass |
| society.religions | 20 | 20 | 0 | 0 | pass |
| society.provinces | 303 | 300 | -3 | 0.01 | pass |
| routes.total | 694 | 736 | 42 | 0.061 | pass |
| routes.roads | 6 | 4 | -2 | 0.333 | pass |
| routes.trails | 519 | 604 | 85 | 0.164 | pass |
| routes.searoutes | 169 | 128 | -41 | 0.243 | pass |
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
