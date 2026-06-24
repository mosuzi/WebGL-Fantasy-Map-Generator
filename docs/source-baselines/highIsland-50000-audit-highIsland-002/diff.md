# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:10.233Z
模板：`highIsland`
Seed：`audit-highIsland-002`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.315 | 0.315 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 64 | 64 | 0 | 0 | pass |
| grid.temperature.min | -15 | -15 | 0 | 0 | pass |
| grid.temperature.max | 29 | 29 | 0 | 0 | pass |
| grid.precipitation.mean | 20.503 | 20.503 | 0 | 0 | pass |
| pack.cells | 21587 | 21587 | 0 | 0 | pass |
| pack.packGridRatio | 0.431 | 0.431 | 0 | 0 | pass |
| pack.avgDegree | 5.989 | 5.989 | 0 | 0 | pass |
| pack.havenCells | 2689 | 2689 | 0 | 0 | pass |
| features.total | 53 | 53 | 0 | 0 | pass |
| features.lakes | 16 | 16 | 0 | 0 | pass |
| rivers.count | 417 | 410 | -7 | 0.017 | pass |
| rivers.cellsWithRiver | 2411 | 2391 | -20 | 0.008 | pass |
| population.positivePopulationCells | 15893 | 15900 | 7 | 0 | pass |
| society.cultures | 9 | 9 | 0 | 0 | pass |
| society.burgs | 890 | 883 | -7 | 0.008 | pass |
| society.ports | 163 | 126 | -37 | 0.227 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 329 | 318 | -11 | 0.033 | pass |
| routes.total | 740 | 804 | 64 | 0.086 | pass |
| routes.roads | 9 | 10 | 1 | 0.111 | pass |
| routes.trails | 558 | 661 | 103 | 0.185 | pass |
| routes.searoutes | 173 | 133 | -40 | 0.231 | pass |
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
