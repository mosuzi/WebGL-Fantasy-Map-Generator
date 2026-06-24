# Source / Candidate 对照差异

生成时间：2026-06-24T16:37:14.897Z
模板：`mediterranean`
Seed：`audit-mediterranean-001`
目标 cells：10000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 10004 | 10004 | 0 | 0 | pass |
| grid.avgDegree | 5.922 | 5.922 | 0 | 0 | pass |
| grid.boundaryPoints | 206 | 206 | 0 | 0 | pass |
| grid.landRatio | 0.456 | 0.456 | 0 | 0 | pass |
| grid.height.p50 | 17 | 17 | 0 | 0 | pass |
| grid.height.p95 | 68 | 68 | 0 | 0 | pass |
| grid.temperature.min | -25 | -25 | 0 | 0 | pass |
| grid.temperature.max | 27 | 27 | 0 | 0 | pass |
| grid.precipitation.mean | 5.931 | 5.931 | 0 | 0 | pass |
| pack.cells | 7010 | 7010 | 0 | 0 | pass |
| pack.packGridRatio | 0.701 | 0.701 | 0 | 0 | pass |
| pack.avgDegree | 5.903 | 5.903 | 0 | 0 | pass |
| pack.havenCells | 1289 | 1289 | 0 | 0 | pass |
| features.total | 26 | 26 | 0 | 0 | pass |
| features.lakes | 5 | 5 | 0 | 0 | pass |
| rivers.count | 172 | 172 | 0 | 0 | pass |
| rivers.cellsWithRiver | 627 | 627 | 0 | 0 | pass |
| population.positivePopulationCells | 4541 | 4539 | -2 | 0 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 929 | 924 | -5 | 0.005 | pass |
| society.ports | 149 | 155 | 6 | 0.04 | pass |
| society.states | 21 | 21 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 226 | 190 | -36 | 0.159 | pass |
| routes.total | 693 | 711 | 18 | 0.026 | pass |
| routes.roads | 14 | 12 | -2 | 0.143 | pass |
| routes.trails | 543 | 544 | 1 | 0.002 | pass |
| routes.searoutes | 136 | 155 | 19 | 0.14 | pass |
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
