# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:53.786Z
模板：`lowIsland`
Seed：`audit-lowIsland-002`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.271 | 0.271 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 32 | 32 | 0 | 0 | pass |
| grid.temperature.min | -21 | -21 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 20.815 | 20.815 | 0 | 0 | pass |
| pack.cells | 20461 | 20461 | 0 | 0 | pass |
| pack.packGridRatio | 0.408 | 0.408 | 0 | 0 | pass |
| pack.avgDegree | 5.99 | 5.99 | 0 | 0 | pass |
| pack.havenCells | 3040 | 3040 | 0 | 0 | pass |
| features.total | 104 | 104 | 0 | 0 | pass |
| features.lakes | 23 | 23 | 0 | 0 | pass |
| rivers.count | 423 | 412 | -11 | 0.026 | pass |
| rivers.cellsWithRiver | 2580 | 2530 | -50 | 0.019 | pass |
| population.positivePopulationCells | 15218 | 15218 | 0 | 0 | pass |
| society.cultures | 8 | 8 | 0 | 0 | pass |
| society.burgs | 868 | 868 | 0 | 0 | pass |
| society.ports | 131 | 105 | -26 | 0.198 | pass |
| society.states | 30 | 30 | 0 | 0 | pass |
| society.religions | 11 | 11 | 0 | 0 | pass |
| society.provinces | 226 | 217 | -9 | 0.04 | pass |
| routes.total | 689 | 817 | 128 | 0.186 | pass |
| routes.roads | 23 | 20 | -3 | 0.13 | pass |
| routes.trails | 529 | 681 | 152 | 0.287 | pass |
| routes.searoutes | 137 | 116 | -21 | 0.153 | pass |
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
