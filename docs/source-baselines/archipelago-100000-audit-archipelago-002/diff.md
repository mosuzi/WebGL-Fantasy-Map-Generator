# Source / Candidate 对照差异

生成时间：2026-06-21T01:11:54.691Z
模板：`archipelago`
Seed：`audit-archipelago-002`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.076 | 0.076 | 0 | 0 | pass |
| grid.height.p50 | 13 | 13 | 0 | 0 | pass |
| grid.height.p95 | 22 | 22 | 0 | 0 | pass |
| grid.temperature.min | -22 | -22 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 18.413 | 18.413 | 0 | 0 | pass |
| pack.cells | 17509 | 17509 | 0 | 0 | pass |
| pack.packGridRatio | 0.175 | 0.175 | 0 | 0 | pass |
| pack.avgDegree | 5.991 | 5.991 | 0 | 0 | pass |
| pack.havenCells | 3854 | 3854 | 0 | 0 | pass |
| features.total | 148 | 148 | 0 | 0 | pass |
| features.lakes | 12 | 12 | 0 | 0 | pass |
| rivers.count | 307 | 304 | -3 | 0.01 | pass |
| rivers.cellsWithRiver | 1251 | 1243 | -8 | 0.006 | pass |
| population.positivePopulationCells | 9558 | 9557 | -1 | 0 | pass |
| society.cultures | 15 | 15 | 0 | 0 | pass |
| society.burgs | 320 | 320 | 0 | 0 | pass |
| society.ports | 106 | 95 | -11 | 0.104 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 24 | 24 | 0 | 0 | pass |
| society.provinces | 146 | 146 | 0 | 0 | pass |
| routes.total | 317 | 354 | 37 | 0.117 | pass |
| routes.roads | 8 | 9 | 1 | 0.125 | pass |
| routes.trails | 197 | 241 | 44 | 0.223 | pass |
| routes.searoutes | 112 | 104 | -8 | 0.071 | pass |
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
