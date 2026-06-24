# Source / Candidate 对照差异

生成时间：2026-06-24T16:41:21.305Z
模板：`pangea`
Seed：`audit-pangea-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.284 | 0.284 | 0 | 0 | pass |
| grid.height.p50 | 10 | 10 | 0 | 0 | pass |
| grid.height.p95 | 47 | 47 | 0 | 0 | pass |
| grid.temperature.min | -30 | -30 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 15.086 | 15.086 | 0 | 0 | pass |
| pack.cells | 21902 | 21902 | 0 | 0 | pass |
| pack.packGridRatio | 0.437 | 0.437 | 0 | 0 | pass |
| pack.avgDegree | 5.978 | 5.978 | 0 | 0 | pass |
| pack.havenCells | 3405 | 3405 | 0 | 0 | pass |
| features.total | 63 | 63 | 0 | 0 | pass |
| features.lakes | 16 | 16 | 0 | 0 | pass |
| rivers.count | 398 | 392 | -6 | 0.015 | pass |
| rivers.cellsWithRiver | 1942 | 1921 | -21 | 0.011 | pass |
| population.positivePopulationCells | 13771 | 13782 | 11 | 0.001 | pass |
| society.cultures | 9 | 9 | 0 | 0 | pass |
| society.burgs | 771 | 772 | 1 | 0.001 | pass |
| society.ports | 114 | 106 | -8 | 0.07 | pass |
| society.states | 13 | 13 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 249 | 224 | -25 | 0.1 | pass |
| routes.total | 640 | 671 | 31 | 0.048 | pass |
| routes.roads | 10 | 10 | 0 | 0 | pass |
| routes.trails | 521 | 551 | 30 | 0.058 | pass |
| routes.searoutes | 109 | 110 | 1 | 0.009 | pass |
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
