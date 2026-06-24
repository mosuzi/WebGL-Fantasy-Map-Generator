# Source / Candidate 对照差异

生成时间：2026-06-21T01:13:22.816Z
模板：`peninsula`
Seed：`audit-peninsula-001`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.922 | 5.922 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.301 | 0.301 | 0 | 0 | pass |
| grid.height.p50 | 18 | 18 | 0 | 0 | pass |
| grid.height.p95 | 44 | 44 | 0 | 0 | pass |
| grid.temperature.min | -31 | -31 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 6.12 | 6.12 | 0 | 0 | pass |
| pack.cells | 5383 | 5383 | 0 | 0 | pass |
| pack.packGridRatio | 0.538 | 0.538 | 0 | 0 | pass |
| pack.avgDegree | 5.929 | 5.929 | 0 | 0 | pass |
| pack.havenCells | 1057 | 1057 | 0 | 0 | pass |
| features.total | 37 | 37 | 0 | 0 | pass |
| features.lakes | 12 | 12 | 0 | 0 | pass |
| rivers.count | 114 | 112 | -2 | 0.018 | pass |
| rivers.cellsWithRiver | 426 | 414 | -12 | 0.028 | pass |
| population.positivePopulationCells | 3390 | 3390 | 0 | 0 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 694 | 694 | 0 | 0 | pass |
| society.ports | 118 | 77 | -41 | 0.347 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 159 | 156 | -3 | 0.019 | pass |
| routes.total | 534 | 567 | 33 | 0.062 | pass |
| routes.roads | 12 | 11 | -1 | 0.083 | pass |
| routes.trails | 411 | 477 | 66 | 0.161 | pass |
| routes.searoutes | 111 | 79 | -32 | 0.288 | pass |
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
