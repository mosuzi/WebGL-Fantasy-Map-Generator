# Source / Candidate 对照差异

生成时间：2026-06-21T01:15:06.094Z
模板：`pangea`
Seed：`audit-pangea-002`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.349 | 0.349 | 0 | 0 | pass |
| grid.height.p50 | 14 | 14 | 0 | 0 | pass |
| grid.height.p95 | 51 | 51 | 0 | 0 | pass |
| grid.temperature.min | -25 | -25 | 0 | 0 | pass |
| grid.temperature.max | 20 | 20 | 0 | 0 | pass |
| grid.precipitation.mean | 13.727 | 13.727 | 0 | 0 | pass |
| pack.cells | 50600 | 50600 | 0 | 0 | pass |
| pack.packGridRatio | 0.507 | 0.507 | 0 | 0 | pass |
| pack.avgDegree | 5.987 | 5.987 | 0 | 0 | pass |
| pack.havenCells | 7138 | 7138 | 0 | 0 | pass |
| features.total | 191 | 191 | 0 | 0 | pass |
| features.lakes | 71 | 71 | 0 | 0 | pass |
| rivers.count | 632 | 601 | -31 | 0.049 | pass |
| rivers.cellsWithRiver | 3259 | 3120 | -139 | 0.043 | pass |
| population.positivePopulationCells | 37435 | 37519 | 84 | 0.002 | pass |
| society.cultures | 16 | 16 | 0 | 0 | pass |
| society.burgs | 1203 | 1206 | 3 | 0.002 | pass |
| society.ports | 237 | 221 | -16 | 0.068 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 18 | 18 | 0 | 0 | pass |
| society.provinces | 385 | 394 | 9 | 0.023 | pass |
| routes.total | 1052 | 1124 | 72 | 0.068 | pass |
| routes.roads | 18 | 6 | -12 | 0.667 | pass |
| routes.trails | 771 | 872 | 101 | 0.131 | pass |
| routes.searoutes | 263 | 246 | -17 | 0.065 | pass |
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
