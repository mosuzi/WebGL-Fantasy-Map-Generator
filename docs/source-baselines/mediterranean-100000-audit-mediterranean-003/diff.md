# Source / Candidate 对照差异

生成时间：2026-06-21T01:10:45.353Z
模板：`mediterranean`
Seed：`audit-mediterranean-003`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.652 | 0.652 | 0 | 0 | pass |
| grid.height.p50 | 30 | 30 | 0 | 0 | pass |
| grid.height.p95 | 81 | 81 | 0 | 0 | pass |
| grid.temperature.min | -15 | -15 | 0 | 0 | pass |
| grid.temperature.max | 34 | 34 | 0 | 0 | pass |
| grid.precipitation.mean | 14.496 | 14.496 | 0 | 0 | pass |
| pack.cells | 77843 | 77843 | 0 | 0 | pass |
| pack.packGridRatio | 0.78 | 0.78 | 0 | 0 | pass |
| pack.avgDegree | 5.97 | 5.97 | 0 | 0 | pass |
| pack.havenCells | 7682 | 7682 | 0 | 0 | pass |
| features.total | 262 | 262 | 0 | 0 | pass |
| features.lakes | 166 | 166 | 0 | 0 | pass |
| rivers.count | 1246 | 1157 | -89 | 0.071 | pass |
| rivers.cellsWithRiver | 7888 | 7591 | -297 | 0.038 | pass |
| population.positivePopulationCells | 57714 | 57528 | -186 | 0.003 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 1849 | 1843 | -6 | 0.003 | pass |
| society.ports | 317 | 256 | -61 | 0.192 | pass |
| society.states | 17 | 17 | 0 | 0 | pass |
| society.religions | 16 | 16 | 0 | 0 | pass |
| society.provinces | 669 | 616 | -53 | 0.079 | pass |
| routes.total | 1460 | 1492 | 32 | 0.022 | pass |
| routes.roads | 12 | 12 | 0 | 0 | pass |
| routes.trails | 1133 | 1234 | 101 | 0.089 | pass |
| routes.searoutes | 315 | 246 | -69 | 0.219 | pass |
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
