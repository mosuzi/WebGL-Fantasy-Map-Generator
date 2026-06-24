# Source / Candidate 对照差异

生成时间：2026-06-24T16:37:17.820Z
模板：`mediterranean`
Seed：`audit-mediterranean-003`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.921 | 5.921 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.566 | 0.566 | 0 | 0 | pass |
| grid.height.p50 | 24 | 24 | 0 | 0 | pass |
| grid.height.p95 | 66 | 66 | 0 | 0 | pass |
| grid.temperature.min | -3 | -3 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 9.231 | 9.231 | 0 | 0 | pass |
| pack.cells | 7831 | 7831 | 0 | 0 | pass |
| pack.packGridRatio | 0.783 | 0.783 | 0 | 0 | pass |
| pack.avgDegree | 5.902 | 5.902 | 0 | 0 | pass |
| pack.havenCells | 1153 | 1153 | 0 | 0 | pass |
| features.total | 26 | 26 | 0 | 0 | pass |
| features.lakes | 7 | 7 | 0 | 0 | pass |
| rivers.count | 301 | 299 | -2 | 0.007 | pass |
| rivers.cellsWithRiver | 1259 | 1254 | -5 | 0.004 | pass |
| population.positivePopulationCells | 5666 | 5634 | -32 | 0.006 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 1114 | 987 | -127 | 0.114 | pass |
| society.ports | 162 | 113 | -49 | 0.302 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 16 | 16 | 0 | 0 | pass |
| society.provinces | 342 | 247 | -95 | 0.278 | pass |
| routes.total | 822 | 725 | -97 | 0.118 | pass |
| routes.roads | 24 | 11 | -13 | 0.542 | pass |
| routes.trails | 651 | 606 | -45 | 0.069 | pass |
| routes.searoutes | 147 | 108 | -39 | 0.265 | pass |
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

当前 case 达到阶段 0 对照要求，可推进下一阶段。
