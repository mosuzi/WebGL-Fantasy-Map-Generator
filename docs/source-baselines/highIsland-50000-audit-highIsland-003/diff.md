# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:13.949Z
模板：`highIsland`
Seed：`audit-highIsland-003`
目标 cells：50000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 50142 | 50142 | 0 | 0 | pass |
| grid.avgDegree | 5.965 | 5.965 | 0 | 0 | pass |
| grid.boundaryPoints | 458 | 458 | 0 | 0 | pass |
| grid.landRatio | 0.279 | 0.279 | 0 | 0 | pass |
| grid.height.p50 | 10 | 10 | 0 | 0 | pass |
| grid.height.p95 | 59 | 59 | 0 | 0 | pass |
| grid.temperature.min | -31 | -31 | 0 | 0 | pass |
| grid.temperature.max | 21 | 21 | 0 | 0 | pass |
| grid.precipitation.mean | 10.29 | 10.29 | 0 | 0 | pass |
| pack.cells | 19511 | 19511 | 0 | 0 | pass |
| pack.packGridRatio | 0.389 | 0.389 | 0 | 0 | pass |
| pack.avgDegree | 5.99 | 5.99 | 0 | 0 | pass |
| pack.havenCells | 2633 | 2633 | 0 | 0 | pass |
| features.total | 38 | 38 | 0 | 0 | pass |
| features.lakes | 12 | 12 | 0 | 0 | pass |
| rivers.count | 303 | 296 | -7 | 0.023 | pass |
| rivers.cellsWithRiver | 1318 | 1285 | -33 | 0.025 | pass |
| population.positivePopulationCells | 14513 | 14524 | 11 | 0.001 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 814 | 815 | 1 | 0.001 | pass |
| society.ports | 144 | 138 | -6 | 0.042 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 21 | 21 | 0 | 0 | pass |
| society.provinces | 241 | 237 | -4 | 0.017 | pass |
| routes.total | 649 | 733 | 84 | 0.129 | pass |
| routes.roads | 12 | 10 | -2 | 0.167 | pass |
| routes.trails | 492 | 582 | 90 | 0.183 | pass |
| routes.searoutes | 145 | 141 | -4 | 0.028 | pass |
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
