# Source / Candidate 对照差异

生成时间：2026-06-24T16:41:06.959Z
模板：`peninsula`
Seed：`audit-peninsula-003`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.549 | 0.549 | 0 | 0 | pass |
| grid.height.p50 | 20 | 20 | 0 | 0 | pass |
| grid.height.p95 | 53 | 53 | 0 | 0 | pass |
| grid.temperature.min | -20 | -20 | 0 | 0 | pass |
| grid.temperature.max | 24 | 24 | 0 | 0 | pass |
| grid.precipitation.mean | 1.812 | 1.812 | 0 | 0 | pass |
| pack.cells | 76408 | 76408 | 0 | 0 | pass |
| pack.packGridRatio | 0.765 | 0.765 | 0 | 0 | pass |
| pack.avgDegree | 5.983 | 5.983 | 0 | 0 | pass |
| pack.havenCells | 11766 | 11766 | 0 | 0 | pass |
| features.total | 500 | 500 | 0 | 0 | pass |
| features.lakes | 352 | 352 | 0 | 0 | pass |
| rivers.count | 94 | 77 | -17 | 0.181 | pass |
| rivers.cellsWithRiver | 287 | 227 | -60 | 0.209 | pass |
| population.positivePopulationCells | 55050 | 55494 | 444 | 0.008 | pass |
| society.cultures | 7 | 7 | 0 | 0 | pass |
| society.burgs | 1768 | 1782 | 14 | 0.008 | pass |
| society.ports | 411 | 348 | -63 | 0.153 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 475 | 481 | 6 | 0.013 | pass |
| routes.total | 1374 | 1595 | 221 | 0.161 | pass |
| routes.roads | 14 | 12 | -2 | 0.143 | pass |
| routes.trails | 959 | 1247 | 288 | 0.3 | pass |
| routes.searoutes | 401 | 336 | -65 | 0.162 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 2 | 0 | -2 | -1 | pass |

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
| 海路中段穿陆 | 2 | 0 | 2 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

进入阶段 6：pack features 与 haven/harbor 已建立，下一步复刻河流和湖泊水文，生成 pack.cells.fl/r/conf 与 source 同量级河网。
