# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:50.531Z
模板：`lowIsland`
Seed：`audit-lowIsland-001`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.964 | 5.964 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.279 | 0.279 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 36 | 36 | 0 | 0 | pass |
| grid.temperature.min | -10 | -10 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 15.364 | 15.364 | 0 | 0 | pass |
| pack.cells | 22218 | 22218 | 0 | 0 | pass |
| pack.packGridRatio | 0.443 | 0.443 | 0 | 0 | pass |
| pack.avgDegree | 5.991 | 5.991 | 0 | 0 | pass |
| pack.havenCells | 3682 | 3682 | 0 | 0 | pass |
| features.total | 116 | 116 | 0 | 0 | pass |
| features.lakes | 33 | 33 | 0 | 0 | pass |
| rivers.count | 374 | 358 | -16 | 0.043 | pass |
| rivers.cellsWithRiver | 2096 | 2052 | -44 | 0.021 | pass |
| population.positivePopulationCells | 15988 | 15988 | 0 | 0 | pass |
| society.cultures | 17 | 17 | 0 | 0 | pass |
| society.burgs | 908 | 908 | 0 | 0 | pass |
| society.ports | 152 | 138 | -14 | 0.092 | pass |
| society.states | 28 | 28 | 0 | 0 | pass |
| society.religions | 27 | 27 | 0 | 0 | pass |
| society.provinces | 305 | 302 | -3 | 0.01 | pass |
| routes.total | 765 | 829 | 64 | 0.084 | pass |
| routes.roads | 25 | 17 | -8 | 0.32 | pass |
| routes.trails | 569 | 657 | 88 | 0.155 | pass |
| routes.searoutes | 171 | 155 | -16 | 0.094 | pass |
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
