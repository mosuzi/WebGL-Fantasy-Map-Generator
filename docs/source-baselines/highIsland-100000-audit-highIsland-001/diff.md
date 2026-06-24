# Source / Candidate 对照差异

生成时间：2026-06-21T01:12:22.671Z
模板：`highIsland`
Seed：`audit-highIsland-001`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.277 | 0.277 | 0 | 0 | pass |
| grid.height.p50 | 11 | 11 | 0 | 0 | pass |
| grid.height.p95 | 52 | 52 | 0 | 0 | pass |
| grid.temperature.min | -28 | -28 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 7.644 | 7.644 | 0 | 0 | pass |
| pack.cells | 38660 | 38660 | 0 | 0 | pass |
| pack.packGridRatio | 0.387 | 0.387 | 0 | 0 | pass |
| pack.avgDegree | 5.993 | 5.993 | 0 | 0 | pass |
| pack.havenCells | 4979 | 4979 | 0 | 0 | pass |
| features.total | 87 | 87 | 0 | 0 | pass |
| features.lakes | 26 | 26 | 0 | 0 | pass |
| rivers.count | 297 | 289 | -8 | 0.027 | pass |
| rivers.cellsWithRiver | 1245 | 1204 | -41 | 0.033 | pass |
| population.positivePopulationCells | 29304 | 29457 | 153 | 0.005 | pass |
| society.cultures | 11 | 11 | 0 | 0 | pass |
| society.burgs | 958 | 963 | 5 | 0.005 | pass |
| society.ports | 195 | 180 | -15 | 0.077 | pass |
| society.states | 28 | 28 | 0 | 0 | pass |
| society.religions | 19 | 19 | 0 | 0 | pass |
| society.provinces | 339 | 347 | 8 | 0.024 | pass |
| routes.total | 840 | 892 | 52 | 0.062 | pass |
| routes.roads | 19 | 18 | -1 | 0.053 | pass |
| routes.trails | 609 | 680 | 71 | 0.117 | pass |
| routes.searoutes | 212 | 194 | -18 | 0.085 | pass |
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
