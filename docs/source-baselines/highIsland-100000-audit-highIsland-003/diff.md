# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:45.211Z
模板：`highIsland`
Seed：`audit-highIsland-003`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.318 | 0.318 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 61 | 61 | 0 | 0 | pass |
| grid.temperature.min | -25 | -25 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 9.951 | 9.951 | 0 | 0 | pass |
| pack.cells | 42881 | 42881 | 0 | 0 | pass |
| pack.packGridRatio | 0.429 | 0.429 | 0 | 0 | pass |
| pack.avgDegree | 5.994 | 5.994 | 0 | 0 | pass |
| pack.havenCells | 5149 | 5149 | 0 | 0 | pass |
| features.total | 125 | 125 | 0 | 0 | pass |
| features.lakes | 46 | 46 | 0 | 0 | pass |
| rivers.count | 507 | 489 | -18 | 0.036 | pass |
| rivers.cellsWithRiver | 2669 | 2578 | -91 | 0.034 | pass |
| population.positivePopulationCells | 31657 | 31701 | 44 | 0.001 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 1020 | 1021 | 1 | 0.001 | pass |
| society.ports | 169 | 151 | -18 | 0.107 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 21 | 21 | 0 | 0 | pass |
| society.provinces | 339 | 339 | 0 | 0 | pass |
| routes.total | 810 | 937 | 127 | 0.157 | pass |
| routes.roads | 13 | 12 | -1 | 0.077 | pass |
| routes.trails | 625 | 757 | 132 | 0.211 | pass |
| routes.searoutes | 172 | 168 | -4 | 0.023 | pass |
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
