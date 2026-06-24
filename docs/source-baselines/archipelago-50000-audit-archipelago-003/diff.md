# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:05.330Z
模板：`archipelago`
Seed：`audit-archipelago-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.121 | 0.121 | 0 | 0 | pass |
| grid.height.p50 | 13 | 13 | 0 | 0 | pass |
| grid.height.p95 | 26 | 26 | 0 | 0 | pass |
| grid.temperature.min | 1 | 1 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 20.26 | 20.26 | 0 | 0 | pass |
| pack.cells | 13173 | 13173 | 0 | 0 | pass |
| pack.packGridRatio | 0.263 | 0.263 | 0 | 0 | pass |
| pack.avgDegree | 5.983 | 5.983 | 0 | 0 | pass |
| pack.havenCells | 2930 | 2930 | 0 | 0 | pass |
| features.total | 80 | 80 | 0 | 0 | pass |
| features.lakes | 9 | 9 | 0 | 0 | pass |
| rivers.count | 375 | 371 | -4 | 0.011 | pass |
| rivers.cellsWithRiver | 1399 | 1384 | -15 | 0.011 | pass |
| population.positivePopulationCells | 7519 | 7517 | -2 | 0 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 436 | 436 | 0 | 0 | pass |
| society.ports | 115 | 97 | -18 | 0.157 | pass |
| society.states | 22 | 22 | 0 | 0 | pass |
| society.religions | 16 | 16 | 0 | 0 | pass |
| society.provinces | 137 | 129 | -8 | 0.058 | pass |
| routes.total | 390 | 440 | 50 | 0.128 | pass |
| routes.roads | 9 | 11 | 2 | 0.222 | pass |
| routes.trails | 256 | 317 | 61 | 0.238 | pass |
| routes.searoutes | 125 | 112 | -13 | 0.104 | pass |
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
