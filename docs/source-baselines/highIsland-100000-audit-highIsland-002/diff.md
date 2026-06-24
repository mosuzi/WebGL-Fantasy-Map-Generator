# Source / Candidate 对照差异

生成时间：2026-06-24T16:39:37.452Z
模板：`highIsland`
Seed：`audit-highIsland-002`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.339 | 0.339 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 60 | 60 | 0 | 0 | pass |
| grid.temperature.min | -25 | -25 | 0 | 0 | pass |
| grid.temperature.max | 24 | 24 | 0 | 0 | pass |
| grid.precipitation.mean | 24.032 | 24.032 | 0 | 0 | pass |
| pack.cells | 44794 | 44794 | 0 | 0 | pass |
| pack.packGridRatio | 0.449 | 0.449 | 0 | 0 | pass |
| pack.avgDegree | 5.991 | 5.991 | 0 | 0 | pass |
| pack.havenCells | 5181 | 5181 | 0 | 0 | pass |
| features.total | 125 | 125 | 0 | 0 | pass |
| features.lakes | 46 | 46 | 0 | 0 | pass |
| rivers.count | 776 | 761 | -15 | 0.019 | pass |
| rivers.cellsWithRiver | 4799 | 4738 | -61 | 0.013 | pass |
| population.positivePopulationCells | 33203 | 33206 | 3 | 0 | pass |
| society.cultures | 9 | 9 | 0 | 0 | pass |
| society.burgs | 1069 | 1069 | 0 | 0 | pass |
| society.ports | 171 | 138 | -33 | 0.193 | pass |
| society.states | 15 | 15 | 0 | 0 | pass |
| society.religions | 13 | 13 | 0 | 0 | pass |
| society.provinces | 416 | 429 | 13 | 0.031 | pass |
| routes.total | 914 | 962 | 48 | 0.053 | pass |
| routes.roads | 13 | 10 | -3 | 0.231 | pass |
| routes.trails | 712 | 799 | 87 | 0.122 | pass |
| routes.searoutes | 189 | 153 | -36 | 0.19 | pass |
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
