# Source / Candidate 对照差异

生成时间：2026-06-21T01:09:40.648Z
模板：`mediterranean`
Seed：`audit-mediterranean-002`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.574 | 0.574 | 0 | 0 | pass |
| grid.height.p50 | 25 | 25 | 0 | 0 | pass |
| grid.height.p95 | 74 | 74 | 0 | 0 | pass |
| grid.temperature.min | -43 | -43 | 0 | 0 | pass |
| grid.temperature.max | 17 | 17 | 0 | 0 | pass |
| grid.precipitation.mean | 2.026 | 2.026 | 0 | 0 | pass |
| pack.cells | 37246 | 37246 | 0 | 0 | pass |
| pack.packGridRatio | 0.743 | 0.743 | 0 | 0 | pass |
| pack.avgDegree | 5.956 | 5.956 | 0 | 0 | pass |
| pack.havenCells | 4378 | 4378 | 0 | 0 | pass |
| features.total | 107 | 107 | 0 | 0 | pass |
| features.lakes | 50 | 50 | 0 | 0 | pass |
| rivers.count | 147 | 132 | -15 | 0.102 | pass |
| rivers.cellsWithRiver | 803 | 750 | -53 | 0.066 | pass |
| population.positivePopulationCells | 23474 | 23463 | -11 | 0 | pass |
| society.cultures | 17 | 17 | 0 | 0 | pass |
| society.burgs | 1294 | 1307 | 13 | 0.01 | pass |
| society.ports | 253 | 225 | -28 | 0.111 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 27 | 27 | 0 | 0 | pass |
| society.provinces | 472 | 472 | 0 | 0 | pass |
| routes.total | 1008 | 1081 | 73 | 0.072 | pass |
| routes.roads | 19 | 12 | -7 | 0.368 | pass |
| routes.trails | 753 | 836 | 83 | 0.11 | pass |
| routes.searoutes | 236 | 233 | -3 | 0.013 | pass |
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
