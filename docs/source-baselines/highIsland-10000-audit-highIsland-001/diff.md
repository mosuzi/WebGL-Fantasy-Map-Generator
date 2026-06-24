# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:13.126Z
模板：`highIsland`
Seed：`audit-highIsland-001`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.922 | 5.922 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.271 | 0.271 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 46 | 46 | 0 | 0 | pass |
| grid.temperature.min | -26 | -26 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 5.624 | 5.624 | 0 | 0 | pass |
| pack.cells | 4306 | 4306 | 0 | 0 | pass |
| pack.packGridRatio | 0.43 | 0.43 | 0 | 0 | pass |
| pack.avgDegree | 5.967 | 5.967 | 0 | 0 | pass |
| pack.havenCells | 723 | 723 | 0 | 0 | pass |
| features.total | 9 | 9 | 0 | 0 | pass |
| features.lakes | 2 | 2 | 0 | 0 | pass |
| rivers.count | 80 | 79 | -1 | 0.013 | pass |
| rivers.cellsWithRiver | 269 | 266 | -3 | 0.011 | pass |
| population.positivePopulationCells | 3050 | 3048 | -2 | 0.001 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 637 | 637 | 0 | 0 | pass |
| society.ports | 111 | 81 | -30 | 0.27 | pass |
| society.states | 28 | 28 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 217 | 212 | -5 | 0.023 | pass |
| routes.total | 462 | 507 | 45 | 0.097 | pass |
| routes.roads | 13 | 22 | 9 | 0.692 | pass |
| routes.trails | 337 | 392 | 55 | 0.163 | pass |
| routes.searoutes | 112 | 93 | -19 | 0.17 | pass |
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

进入阶段 6：pack features 与 haven/harbor 已建立，下一步复刻河流和湖泊水文，生成 pack.cells.fl/r/conf 与 source 同量级河网。
