# Source / Candidate 对照差异

生成时间：2026-06-24T16:41:08.108Z
模板：`pangea`
Seed：`audit-pangea-001`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.924 | 5.924 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.369 | 0.369 | 0 | 0 | pass |
| grid.height.p50 | 13 | 13 | 0 | 0 | pass |
| grid.height.p95 | 56 | 56 | 0 | 0 | pass |
| grid.temperature.min | -36 | -36 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 10.652 | 10.652 | 0 | 0 | pass |
| pack.cells | 5659 | 5659 | 0 | 0 | pass |
| pack.packGridRatio | 0.566 | 0.566 | 0 | 0 | pass |
| pack.avgDegree | 5.954 | 5.954 | 0 | 0 | pass |
| pack.havenCells | 922 | 922 | 0 | 0 | pass |
| features.total | 18 | 18 | 0 | 0 | pass |
| features.lakes | 5 | 5 | 0 | 0 | pass |
| rivers.count | 217 | 214 | -3 | 0.014 | pass |
| rivers.cellsWithRiver | 814 | 803 | -11 | 0.014 | pass |
| population.positivePopulationCells | 3979 | 3979 | 0 | 0 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 775 | 808 | 33 | 0.043 | pass |
| society.ports | 130 | 100 | -30 | 0.231 | pass |
| society.states | 12 | 12 | 0 | 0 | pass |
| society.religions | 20 | 20 | 0 | 0 | pass |
| society.provinces | 221 | 210 | -11 | 0.05 | pass |
| routes.total | 596 | 627 | 31 | 0.052 | pass |
| routes.roads | 8 | 8 | 0 | 0 | pass |
| routes.trails | 450 | 516 | 66 | 0.147 | pass |
| routes.searoutes | 138 | 103 | -35 | 0.254 | pass |
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
