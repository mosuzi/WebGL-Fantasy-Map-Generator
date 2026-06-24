# Source / Candidate 对照差异

生成时间：2026-06-21T01:09:24.246Z
模板：`mediterranean`
Seed：`audit-mediterranean-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.923 | 5.923 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.617 | 0.617 | 0 | 0 | pass |
| grid.height.p50 | 26 | 26 | 0 | 0 | pass |
| grid.height.p95 | 72 | 72 | 0 | 0 | pass |
| grid.temperature.min | -41 | -41 | 0 | 0 | pass |
| grid.temperature.max | 17 | 17 | 0 | 0 | pass |
| grid.precipitation.mean | 1.595 | 1.595 | 0 | 0 | pass |
| pack.cells | 8429 | 8429 | 0 | 0 | pass |
| pack.packGridRatio | 0.843 | 0.843 | 0 | 0 | pass |
| pack.avgDegree | 5.912 | 5.912 | 0 | 0 | pass |
| pack.havenCells | 1110 | 1110 | 0 | 0 | pass |
| features.total | 26 | 26 | 0 | 0 | pass |
| features.lakes | 6 | 6 | 0 | 0 | pass |
| rivers.count | 61 | 61 | 0 | 0 | pass |
| rivers.cellsWithRiver | 257 | 257 | 0 | 0 | pass |
| population.positivePopulationCells | 5316 | 5312 | -4 | 0.001 | pass |
| society.cultures | 17 | 17 | 0 | 0 | pass |
| society.burgs | 1076 | 1034 | -42 | 0.039 | pass |
| society.ports | 162 | 135 | -27 | 0.167 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 27 | 27 | 0 | 0 | pass |
| society.provinces | 349 | 328 | -21 | 0.06 | pass |
| routes.total | 723 | 769 | 46 | 0.064 | pass |
| routes.roads | 13 | 14 | 1 | 0.077 | pass |
| routes.trails | 565 | 625 | 60 | 0.106 | pass |
| routes.searoutes | 145 | 130 | -15 | 0.103 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 3 | 0 | -3 | -1 | pass |

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
| 海路中段穿陆 | 3 | 0 | 3 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

进入阶段 6：pack features 与 haven/harbor 已建立，下一步复刻河流和湖泊水文，生成 pack.cells.fl/r/conf 与 source 同量级河网。
