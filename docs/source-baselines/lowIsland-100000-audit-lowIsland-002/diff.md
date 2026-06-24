# Source / Candidate 对照差异

生成时间：2026-06-24T16:40:08.683Z
模板：`lowIsland`
Seed：`audit-lowIsland-002`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.278 | 0.278 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 31 | 31 | 0 | 0 | pass |
| grid.temperature.min | -21 | -21 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 24.145 | 24.145 | 0 | 0 | pass |
| pack.cells | 43376 | 43376 | 0 | 0 | pass |
| pack.packGridRatio | 0.434 | 0.434 | 0 | 0 | pass |
| pack.avgDegree | 5.993 | 5.993 | 0 | 0 | pass |
| pack.havenCells | 7324 | 7324 | 0 | 0 | pass |
| features.total | 213 | 213 | 0 | 0 | pass |
| features.lakes | 85 | 85 | 0 | 0 | pass |
| rivers.count | 686 | 645 | -41 | 0.06 | pass |
| rivers.cellsWithRiver | 4190 | 4026 | -164 | 0.039 | pass |
| population.positivePopulationCells | 31371 | 31371 | 0 | 0 | pass |
| society.cultures | 8 | 8 | 0 | 0 | pass |
| society.burgs | 1026 | 1026 | 0 | 0 | pass |
| society.ports | 169 | 174 | 5 | 0.03 | pass |
| society.states | 30 | 30 | 0 | 0 | pass |
| society.religions | 11 | 11 | 0 | 0 | pass |
| society.provinces | 281 | 277 | -4 | 0.014 | pass |
| routes.total | 895 | 994 | 99 | 0.111 | pass |
| routes.roads | 22 | 21 | -1 | 0.045 | pass |
| routes.trails | 704 | 790 | 86 | 0.122 | pass |
| routes.searoutes | 169 | 183 | 14 | 0.083 | pass |
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
