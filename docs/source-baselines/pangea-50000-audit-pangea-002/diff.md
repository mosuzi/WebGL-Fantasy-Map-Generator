# Source / Candidate 对照差异

生成时间：2026-06-21T01:14:41.283Z
模板：`pangea`
Seed：`audit-pangea-002`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.388 | 0.388 | 0 | 0 | pass |
| grid.height.p50 | 15 | 15 | 0 | 0 | pass |
| grid.height.p95 | 57 | 57 | 0 | 0 | pass |
| grid.temperature.min | -24 | -24 | 0 | 0 | pass |
| grid.temperature.max | 20 | 20 | 0 | 0 | pass |
| grid.precipitation.mean | 11.501 | 11.501 | 0 | 0 | pass |
| pack.cells | 27543 | 27543 | 0 | 0 | pass |
| pack.packGridRatio | 0.549 | 0.549 | 0 | 0 | pass |
| pack.avgDegree | 5.981 | 5.981 | 0 | 0 | pass |
| pack.havenCells | 3831 | 3831 | 0 | 0 | pass |
| features.total | 72 | 72 | 0 | 0 | pass |
| features.lakes | 20 | 20 | 0 | 0 | pass |
| rivers.count | 469 | 461 | -8 | 0.017 | pass |
| rivers.cellsWithRiver | 2165 | 2116 | -49 | 0.023 | pass |
| population.positivePopulationCells | 20409 | 20555 | 146 | 0.007 | pass |
| society.cultures | 16 | 16 | 0 | 0 | pass |
| society.burgs | 1139 | 1147 | 8 | 0.007 | pass |
| society.ports | 191 | 194 | 3 | 0.016 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 18 | 18 | 0 | 0 | pass |
| society.provinces | 317 | 311 | -6 | 0.019 | pass |
| routes.total | 864 | 1000 | 136 | 0.157 | pass |
| routes.roads | 7 | 10 | 3 | 0.429 | pass |
| routes.trails | 673 | 778 | 105 | 0.156 | pass |
| routes.searoutes | 184 | 212 | 28 | 0.152 | pass |
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

当前 case 达到阶段 0 对照要求，可推进下一阶段。
