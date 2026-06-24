# Source / Candidate 对照差异

生成时间：2026-06-24T16:37:35.132Z
模板：`mediterranean`
Seed：`audit-mediterranean-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.573 | 0.573 | 0 | 0 | pass |
| grid.height.p50 | 25 | 25 | 0 | 0 | pass |
| grid.height.p95 | 80 | 80 | 0 | 0 | pass |
| grid.temperature.min | -10 | -10 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 13.663 | 13.663 | 0 | 0 | pass |
| pack.cells | 36414 | 36414 | 0 | 0 | pass |
| pack.packGridRatio | 0.726 | 0.726 | 0 | 0 | pass |
| pack.avgDegree | 5.96 | 5.96 | 0 | 0 | pass |
| pack.havenCells | 4012 | 4012 | 0 | 0 | pass |
| features.total | 82 | 82 | 0 | 0 | pass |
| features.lakes | 38 | 38 | 0 | 0 | pass |
| rivers.count | 640 | 628 | -12 | 0.019 | pass |
| rivers.cellsWithRiver | 3617 | 3570 | -47 | 0.013 | pass |
| population.positivePopulationCells | 26250 | 26153 | -97 | 0.004 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 1462 | 1457 | -5 | 0.003 | pass |
| society.ports | 217 | 193 | -24 | 0.111 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 16 | 16 | 0 | 0 | pass |
| society.provinces | 502 | 499 | -3 | 0.006 | pass |
| routes.total | 1141 | 1233 | 92 | 0.081 | pass |
| routes.roads | 20 | 10 | -10 | 0.5 | pass |
| routes.trails | 923 | 1027 | 104 | 0.113 | pass |
| routes.searoutes | 198 | 196 | -2 | 0.01 | pass |
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
