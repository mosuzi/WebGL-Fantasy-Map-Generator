# Source / Candidate 对照差异

生成时间：2026-06-21T01:13:38.990Z
模板：`peninsula`
Seed：`audit-peninsula-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.314 | 0.314 | 0 | 0 | pass |
| grid.height.p50 | 18 | 18 | 0 | 0 | pass |
| grid.height.p95 | 61 | 61 | 0 | 0 | pass |
| grid.temperature.min | -20 | -20 | 0 | 0 | pass |
| grid.temperature.max | 24 | 24 | 0 | 0 | pass |
| grid.precipitation.mean | 1.897 | 1.897 | 0 | 0 | pass |
| pack.cells | 20198 | 20198 | 0 | 0 | pass |
| pack.packGridRatio | 0.403 | 0.403 | 0 | 0 | pass |
| pack.avgDegree | 5.963 | 5.963 | 0 | 0 | pass |
| pack.havenCells | 1896 | 1896 | 0 | 0 | pass |
| features.total | 93 | 93 | 0 | 0 | pass |
| features.lakes | 27 | 27 | 0 | 0 | pass |
| rivers.count | 48 | 45 | -3 | 0.063 | pass |
| rivers.cellsWithRiver | 131 | 123 | -8 | 0.061 | pass |
| population.positivePopulationCells | 13125 | 13244 | 119 | 0.009 | pass |
| society.cultures | 7 | 7 | 0 | 0 | pass |
| society.burgs | 733 | 750 | 17 | 0.023 | pass |
| society.ports | 137 | 122 | -15 | 0.109 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 202 | 183 | -19 | 0.094 | pass |
| routes.total | 534 | 614 | 80 | 0.15 | pass |
| routes.roads | 15 | 12 | -3 | 0.2 | pass |
| routes.trails | 388 | 498 | 110 | 0.284 | pass |
| routes.searoutes | 131 | 104 | -27 | 0.206 | pass |
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
