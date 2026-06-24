# Source / Candidate 对照差异

生成时间：2026-06-21T01:13:21.927Z
模板：`lowIsland`
Seed：`audit-lowIsland-003`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.279 | 0.279 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 36 | 36 | 0 | 0 | pass |
| grid.temperature.min | 3 | 3 | 0 | 0 | pass |
| grid.temperature.max | 32 | 32 | 0 | 0 | pass |
| grid.precipitation.mean | 25.602 | 25.602 | 0 | 0 | pass |
| pack.cells | 41380 | 41380 | 0 | 0 | pass |
| pack.packGridRatio | 0.414 | 0.414 | 0 | 0 | pass |
| pack.avgDegree | 5.995 | 5.995 | 0 | 0 | pass |
| pack.havenCells | 6023 | 6023 | 0 | 0 | pass |
| features.total | 225 | 225 | 0 | 0 | pass |
| features.lakes | 70 | 70 | 0 | 0 | pass |
| rivers.count | 585 | 555 | -30 | 0.051 | pass |
| rivers.cellsWithRiver | 3792 | 3667 | -125 | 0.033 | pass |
| population.positivePopulationCells | 30703 | 30651 | -52 | 0.002 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 995 | 994 | -1 | 0.001 | pass |
| society.ports | 236 | 182 | -54 | 0.229 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 17 | 17 | 0 | 0 | pass |
| society.provinces | 379 | 377 | -2 | 0.005 | pass |
| routes.total | 917 | 950 | 33 | 0.036 | pass |
| routes.roads | 19 | 16 | -3 | 0.158 | pass |
| routes.trails | 651 | 732 | 81 | 0.124 | pass |
| routes.searoutes | 247 | 202 | -45 | 0.182 | pass |
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
