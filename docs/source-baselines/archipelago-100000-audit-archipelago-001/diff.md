# Source / Candidate 对照差异

生成时间：2026-06-21T01:11:51.800Z
模板：`archipelago`
Seed：`audit-archipelago-001`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.066 | 0.066 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 21 | 21 | 0 | 0 | pass |
| grid.temperature.min | -26 | -26 | 0 | 0 | pass |
| grid.temperature.max | 25 | 25 | 0 | 0 | pass |
| grid.precipitation.mean | 22.142 | 22.142 | 0 | 0 | pass |
| pack.cells | 14351 | 14351 | 0 | 0 | pass |
| pack.packGridRatio | 0.144 | 0.144 | 0 | 0 | pass |
| pack.avgDegree | 5.987 | 5.987 | 0 | 0 | pass |
| pack.havenCells | 3158 | 3158 | 0 | 0 | pass |
| features.total | 96 | 96 | 0 | 0 | pass |
| features.lakes | 7 | 7 | 0 | 0 | pass |
| rivers.count | 238 | 238 | 0 | 0 | pass |
| rivers.cellsWithRiver | 1057 | 1057 | 0 | 0 | pass |
| population.positivePopulationCells | 7786 | 7786 | 0 | 0 | pass |
| society.cultures | 7 | 7 | 0 | 0 | pass |
| society.burgs | 265 | 268 | 3 | 0.011 | pass |
| society.ports | 79 | 61 | -18 | 0.228 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 11 | 11 | 0 | 0 | pass |
| society.provinces | 128 | 133 | 5 | 0.039 | pass |
| routes.total | 266 | 276 | 10 | 0.038 | pass |
| routes.roads | 7 | 6 | -1 | 0.143 | pass |
| routes.trails | 178 | 199 | 21 | 0.118 | pass |
| routes.searoutes | 81 | 71 | -10 | 0.123 | pass |
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
