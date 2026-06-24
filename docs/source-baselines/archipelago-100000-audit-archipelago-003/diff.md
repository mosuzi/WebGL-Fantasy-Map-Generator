# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:12.106Z
模板：`archipelago`
Seed：`audit-archipelago-003`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.097 | 0.097 | 0 | 0 | pass |
| grid.height.p50 | 14 | 14 | 0 | 0 | pass |
| grid.height.p95 | 24 | 24 | 0 | 0 | pass |
| grid.temperature.min | 3 | 3 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 23.08 | 23.08 | 0 | 0 | pass |
| pack.cells | 20504 | 20504 | 0 | 0 | pass |
| pack.packGridRatio | 0.205 | 0.205 | 0 | 0 | pass |
| pack.avgDegree | 5.989 | 5.989 | 0 | 0 | pass |
| pack.havenCells | 4385 | 4385 | 0 | 0 | pass |
| features.total | 143 | 143 | 0 | 0 | pass |
| features.lakes | 16 | 16 | 0 | 0 | pass |
| rivers.count | 453 | 451 | -2 | 0.004 | pass |
| rivers.cellsWithRiver | 1944 | 1939 | -5 | 0.003 | pass |
| population.positivePopulationCells | 12019 | 12018 | -1 | 0 | pass |
| society.cultures | 14 | 14 | 0 | 0 | pass |
| society.burgs | 403 | 403 | 0 | 0 | pass |
| society.ports | 124 | 102 | -22 | 0.177 | pass |
| society.states | 22 | 22 | 0 | 0 | pass |
| society.religions | 16 | 16 | 0 | 0 | pass |
| society.provinces | 144 | 152 | 8 | 0.056 | pass |
| routes.total | 406 | 444 | 38 | 0.094 | pass |
| routes.roads | 10 | 8 | -2 | 0.2 | pass |
| routes.trails | 261 | 312 | 51 | 0.195 | pass |
| routes.searoutes | 135 | 124 | -11 | 0.081 | pass |
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
