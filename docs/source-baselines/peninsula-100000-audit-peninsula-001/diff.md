# Source / Candidate 对照差异

生成时间：2026-06-24T16:40:39.546Z
模板：`peninsula`
Seed：`audit-peninsula-001`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.441 | 0.441 | 0 | 0 | pass |
| grid.height.p50 | 19 | 19 | 0 | 0 | pass |
| grid.height.p95 | 58 | 58 | 0 | 0 | pass |
| grid.temperature.min | -32 | -32 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 8.465 | 8.465 | 0 | 0 | pass |
| pack.cells | 58866 | 58866 | 0 | 0 | pass |
| pack.packGridRatio | 0.59 | 0.59 | 0 | 0 | pass |
| pack.avgDegree | 5.979 | 5.979 | 0 | 0 | pass |
| pack.havenCells | 8455 | 8455 | 0 | 0 | pass |
| features.total | 371 | 371 | 0 | 0 | pass |
| features.lakes | 241 | 241 | 0 | 0 | pass |
| rivers.count | 558 | 462 | -96 | 0.172 | pass |
| rivers.cellsWithRiver | 3310 | 2918 | -392 | 0.118 | pass |
| population.positivePopulationCells | 45172 | 45177 | 5 | 0 | pass |
| society.cultures | 10 | 11 | 1 | 0.1 | pass |
| society.burgs | 1451 | 1451 | 0 | 0 | pass |
| society.ports | 238 | 199 | -39 | 0.164 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 12 | 13 | 1 | 0.083 | pass |
| society.provinces | 425 | 428 | 3 | 0.007 | pass |
| routes.total | 1175 | 1210 | 35 | 0.03 | pass |
| routes.roads | 12 | 11 | -1 | 0.083 | pass |
| routes.trails | 979 | 1044 | 65 | 0.066 | pass |
| routes.searoutes | 184 | 155 | -29 | 0.158 | pass |
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
