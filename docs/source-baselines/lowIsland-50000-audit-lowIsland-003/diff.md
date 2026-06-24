# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:56.351Z
模板：`lowIsland`
Seed：`audit-lowIsland-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.234 | 0.234 | 0 | 0 | pass |
| grid.height.p50 | 7 | 7 | 0 | 0 | pass |
| grid.height.p95 | 31 | 31 | 0 | 0 | pass |
| grid.temperature.min | 2 | 2 | 0 | 0 | pass |
| grid.temperature.max | 32 | 32 | 0 | 0 | pass |
| grid.precipitation.mean | 24.681 | 24.681 | 0 | 0 | pass |
| pack.cells | 18402 | 18402 | 0 | 0 | pass |
| pack.packGridRatio | 0.367 | 0.367 | 0 | 0 | pass |
| pack.avgDegree | 5.99 | 5.99 | 0 | 0 | pass |
| pack.havenCells | 3156 | 3156 | 0 | 0 | pass |
| features.total | 91 | 91 | 0 | 0 | pass |
| features.lakes | 38 | 38 | 0 | 0 | pass |
| rivers.count | 371 | 356 | -15 | 0.04 | pass |
| rivers.cellsWithRiver | 2037 | 1969 | -68 | 0.033 | pass |
| population.positivePopulationCells | 13404 | 13404 | 0 | 0 | pass |
| society.cultures | 10 | 11 | 1 | 0.1 | pass |
| society.burgs | 759 | 759 | 0 | 0 | pass |
| society.ports | 178 | 146 | -32 | 0.18 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 16 | 17 | 1 | 0.063 | pass |
| society.provinces | 278 | 280 | 2 | 0.007 | pass |
| routes.total | 669 | 731 | 62 | 0.093 | pass |
| routes.roads | 14 | 16 | 2 | 0.143 | pass |
| routes.trails | 483 | 562 | 79 | 0.164 | pass |
| routes.searoutes | 172 | 153 | -19 | 0.11 | pass |
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
