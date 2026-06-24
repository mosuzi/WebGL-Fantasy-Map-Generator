# Source / Candidate 对照差异

生成时间：2026-06-24T16:40:26.418Z
模板：`peninsula`
Seed：`audit-peninsula-002`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.426 | 0.426 | 0 | 0 | pass |
| grid.height.p50 | 19 | 19 | 0 | 0 | pass |
| grid.height.p95 | 59 | 59 | 0 | 0 | pass |
| grid.temperature.min | -16 | -16 | 0 | 0 | pass |
| grid.temperature.max | 30 | 30 | 0 | 0 | pass |
| grid.precipitation.mean | 22.897 | 22.897 | 0 | 0 | pass |
| pack.cells | 29471 | 29471 | 0 | 0 | pass |
| pack.packGridRatio | 0.588 | 0.588 | 0 | 0 | pass |
| pack.avgDegree | 5.971 | 5.971 | 0 | 0 | pass |
| pack.havenCells | 3565 | 3565 | 0 | 0 | pass |
| features.total | 184 | 184 | 0 | 0 | pass |
| features.lakes | 66 | 66 | 0 | 0 | pass |
| rivers.count | 492 | 462 | -30 | 0.061 | pass |
| rivers.cellsWithRiver | 3141 | 3001 | -140 | 0.045 | pass |
| population.positivePopulationCells | 21864 | 21894 | 30 | 0.001 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 1223 | 1225 | 2 | 0.002 | pass |
| society.ports | 262 | 185 | -77 | 0.294 | pass |
| society.states | 19 | 19 | 0 | 0 | pass |
| society.religions | 17 | 17 | 0 | 0 | pass |
| society.provinces | 394 | 386 | -8 | 0.02 | pass |
| routes.total | 1004 | 1036 | 32 | 0.032 | pass |
| routes.roads | 15 | 12 | -3 | 0.2 | pass |
| routes.trails | 754 | 861 | 107 | 0.142 | pass |
| routes.searoutes | 235 | 163 | -72 | 0.306 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 4 | 0 | -4 | -1 | pass |

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
| 海路中段穿陆 | 4 | 0 | 4 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

当前 case 达到阶段 0 对照要求，可推进下一阶段。
