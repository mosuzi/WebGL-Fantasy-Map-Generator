# Source / Candidate 对照差异

生成时间：2026-06-21T01:11:05.465Z
模板：`continents`
Seed：`audit-continents-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.4 | 0.4 | 0 | 0 | pass |
| grid.height.p50 | 15 | 15 | 0 | 0 | pass |
| grid.height.p95 | 50 | 50 | 0 | 0 | pass |
| grid.temperature.min | -2 | -2 | 0 | 0 | pass |
| grid.temperature.max | 30 | 30 | 0 | 0 | pass |
| grid.precipitation.mean | 20.972 | 20.972 | 0 | 0 | pass |
| pack.cells | 30006 | 30006 | 0 | 0 | pass |
| pack.packGridRatio | 0.598 | 0.598 | 0 | 0 | pass |
| pack.avgDegree | 5.988 | 5.988 | 0 | 0 | pass |
| pack.havenCells | 4793 | 4793 | 0 | 0 | pass |
| features.total | 92 | 92 | 0 | 0 | pass |
| features.lakes | 49 | 49 | 0 | 0 | pass |
| rivers.count | 626 | 610 | -16 | 0.026 | pass |
| rivers.cellsWithRiver | 3612 | 3543 | -69 | 0.019 | pass |
| population.positivePopulationCells | 22481 | 22470 | -11 | 0 | pass |
| society.cultures | 20 | 20 | 0 | 0 | pass |
| society.burgs | 1256 | 1255 | -1 | 0.001 | pass |
| society.ports | 268 | 271 | 3 | 0.011 | pass |
| society.states | 18 | 18 | 0 | 0 | pass |
| society.religions | 30 | 30 | 0 | 0 | pass |
| society.provinces | 406 | 410 | 4 | 0.01 | pass |
| routes.total | 1111 | 1201 | 90 | 0.081 | pass |
| routes.roads | 17 | 18 | 1 | 0.059 | pass |
| routes.trails | 822 | 896 | 74 | 0.09 | pass |
| routes.searoutes | 272 | 287 | 15 | 0.055 | pass |
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
