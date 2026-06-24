# Source / Candidate 对照差异

生成时间：2026-06-21T01:14:31.158Z
模板：`pangea`
Seed：`audit-pangea-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.923 | 5.923 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.447 | 0.447 | 0 | 0 | pass |
| grid.height.p50 | 17 | 17 | 0 | 0 | pass |
| grid.height.p95 | 64 | 64 | 0 | 0 | pass |
| grid.temperature.min | -25 | -25 | 0 | 0 | pass |
| grid.temperature.max | 20 | 20 | 0 | 0 | pass |
| grid.precipitation.mean | 7.757 | 7.757 | 0 | 0 | pass |
| pack.cells | 6689 | 6689 | 0 | 0 | pass |
| pack.packGridRatio | 0.669 | 0.669 | 0 | 0 | pass |
| pack.avgDegree | 5.949 | 5.949 | 0 | 0 | pass |
| pack.havenCells | 1047 | 1047 | 0 | 0 | pass |
| features.total | 17 | 17 | 0 | 0 | pass |
| features.lakes | 2 | 2 | 0 | 0 | pass |
| rivers.count | 192 | 191 | -1 | 0.005 | pass |
| rivers.cellsWithRiver | 691 | 676 | -15 | 0.022 | pass |
| population.positivePopulationCells | 4821 | 4832 | 11 | 0.002 | pass |
| society.cultures | 16 | 16 | 0 | 0 | pass |
| society.burgs | 978 | 902 | -76 | 0.078 | pass |
| society.ports | 124 | 121 | -3 | 0.024 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 18 | 18 | 0 | 0 | pass |
| society.provinces | 233 | 207 | -26 | 0.112 | pass |
| routes.total | 724 | 722 | -2 | 0.003 | pass |
| routes.roads | 14 | 14 | 0 | 0 | pass |
| routes.trails | 577 | 574 | -3 | 0.005 | pass |
| routes.searoutes | 133 | 134 | 1 | 0.008 | pass |
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
