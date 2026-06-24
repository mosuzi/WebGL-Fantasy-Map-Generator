# Source / Candidate 对照差异

生成时间：2026-06-21T01:13:29.073Z
模板：`peninsula`
Seed：`audit-peninsula-001`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.287 | 0.287 | 0 | 0 | pass |
| grid.height.p50 | 18 | 18 | 0 | 0 | pass |
| grid.height.p95 | 49 | 49 | 0 | 0 | pass |
| grid.temperature.min | -24 | -24 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 9.128 | 9.128 | 0 | 0 | pass |
| pack.cells | 22874 | 22874 | 0 | 0 | pass |
| pack.packGridRatio | 0.456 | 0.456 | 0 | 0 | pass |
| pack.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| pack.havenCells | 3709 | 3709 | 0 | 0 | pass |
| features.total | 129 | 129 | 0 | 0 | pass |
| features.lakes | 38 | 38 | 0 | 0 | pass |
| rivers.count | 361 | 344 | -17 | 0.047 | pass |
| rivers.cellsWithRiver | 1577 | 1508 | -69 | 0.044 | pass |
| population.positivePopulationCells | 15315 | 15330 | 15 | 0.001 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 860 | 861 | 1 | 0.001 | pass |
| society.ports | 192 | 157 | -35 | 0.182 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 251 | 254 | 3 | 0.012 | pass |
| routes.total | 774 | 792 | 18 | 0.023 | pass |
| routes.roads | 8 | 10 | 2 | 0.25 | pass |
| routes.trails | 572 | 613 | 41 | 0.072 | pass |
| routes.searoutes | 194 | 169 | -25 | 0.129 | pass |
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
