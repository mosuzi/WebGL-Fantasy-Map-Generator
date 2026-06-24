# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:48.348Z
模板：`lowIsland`
Seed：`audit-lowIsland-003`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.924 | 5.924 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.304 | 0.304 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 39 | 39 | 0 | 0 | pass |
| grid.temperature.min | 2 | 2 | 0 | 0 | pass |
| grid.temperature.max | 32 | 32 | 0 | 0 | pass |
| grid.precipitation.mean | 15.081 | 15.081 | 0 | 0 | pass |
| pack.cells | 4458 | 4458 | 0 | 0 | pass |
| pack.packGridRatio | 0.446 | 0.446 | 0 | 0 | pass |
| pack.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| pack.havenCells | 671 | 671 | 0 | 0 | pass |
| features.total | 10 | 10 | 0 | 0 | pass |
| features.lakes | 1 | 1 | 0 | 0 | pass |
| rivers.count | 172 | 172 | 0 | 0 | pass |
| rivers.cellsWithRiver | 847 | 847 | 0 | 0 | pass |
| population.positivePopulationCells | 3370 | 3370 | 0 | 0 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 693 | 695 | 2 | 0.003 | pass |
| society.ports | 75 | 59 | -16 | 0.213 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 17 | 17 | 0 | 0 | pass |
| society.provinces | 232 | 228 | -4 | 0.017 | pass |
| routes.total | 501 | 540 | 39 | 0.078 | pass |
| routes.roads | 18 | 14 | -4 | 0.222 | pass |
| routes.trails | 415 | 466 | 51 | 0.123 | pass |
| routes.searoutes | 68 | 60 | -8 | 0.118 | pass |
| routes.landRouteWaterCells | 0 | 0 | 0 | 0 | pass |
| routes.seaRouteLandCells | 2 | 0 | -2 | -1 | pass |

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
| 海路中段穿陆 | 2 | 0 | 2 | pass |

## Candidate 特有检查

| 检查 | candidate | 状态 | 说明 |
|---|---:|---|---|
| candidate source boundary points | true | pass | candidate 已输出 boundary points |
| candidate pack 真实 Voronoi | true | pass | candidate pack 已有独立 Voronoi 字段 |
| candidate pack 非一比一映射 | false | pass | candidate pack 不再是一比一映射 |
| candidate 海路 | true | pass | candidate 已生成海路 |

## 下一步建议

当前 case 达到阶段 0 对照要求，可推进下一阶段。
