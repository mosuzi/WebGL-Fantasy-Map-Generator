# Source / Candidate 对照差异

生成时间：2026-06-21T01:13:23.956Z
模板：`peninsula`
Seed：`audit-peninsula-002`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.924 | 5.924 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.358 | 0.358 | 0 | 0 | pass |
| grid.height.p50 | 18 | 18 | 0 | 0 | pass |
| grid.height.p95 | 45 | 45 | 0 | 0 | pass |
| grid.temperature.min | -14 | -14 | 0 | 0 | pass |
| grid.temperature.max | 30 | 30 | 0 | 0 | pass |
| grid.precipitation.mean | 18.166 | 18.166 | 0 | 0 | pass |
| pack.cells | 5501 | 5501 | 0 | 0 | pass |
| pack.packGridRatio | 0.55 | 0.55 | 0 | 0 | pass |
| pack.avgDegree | 5.927 | 5.927 | 0 | 0 | pass |
| pack.havenCells | 850 | 850 | 0 | 0 | pass |
| features.total | 26 | 26 | 0 | 0 | pass |
| features.lakes | 6 | 6 | 0 | 0 | pass |
| rivers.count | 224 | 222 | -2 | 0.009 | pass |
| rivers.cellsWithRiver | 953 | 947 | -6 | 0.006 | pass |
| population.positivePopulationCells | 3930 | 3930 | 0 | 0 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 769 | 804 | 35 | 0.046 | pass |
| society.ports | 85 | 73 | -12 | 0.141 | pass |
| society.states | 19 | 19 | 0 | 0 | pass |
| society.religions | 17 | 17 | 0 | 0 | pass |
| society.provinces | 221 | 222 | 1 | 0.005 | pass |
| routes.total | 545 | 614 | 69 | 0.127 | pass |
| routes.roads | 15 | 13 | -2 | 0.133 | pass |
| routes.trails | 448 | 529 | 81 | 0.181 | pass |
| routes.searoutes | 82 | 72 | -10 | 0.122 | pass |
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
