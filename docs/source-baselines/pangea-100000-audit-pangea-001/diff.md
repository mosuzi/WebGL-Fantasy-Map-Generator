# Source / Candidate 对照差异

生成时间：2026-06-24T16:41:28.006Z
模板：`pangea`
Seed：`audit-pangea-001`
目标 cells：100000
状态：pass（fail 0，warn 0）

## 关键指标

| 指标 | source | candidate | delta | ratio | 状态 |
|---|---:|---:|---:|---:|---|
| grid.cells | 99846 | 99846 | 0 | 0 | pass |
| grid.avgDegree | 5.976 | 5.976 | 0 | 0 | pass |
| grid.boundaryPoints | 648 | 648 | 0 | 0 | pass |
| grid.landRatio | 0.326 | 0.326 | 0 | 0 | pass |
| grid.height.p50 | 12 | 12 | 0 | 0 | pass |
| grid.height.p95 | 58 | 58 | 0 | 0 | pass |
| grid.temperature.min | -32 | -32 | 0 | 0 | pass |
| grid.temperature.max | 19 | 19 | 0 | 0 | pass |
| grid.precipitation.mean | 18.391 | 18.391 | 0 | 0 | pass |
| pack.cells | 46048 | 46048 | 0 | 0 | pass |
| pack.packGridRatio | 0.461 | 0.461 | 0 | 0 | pass |
| pack.avgDegree | 5.986 | 5.986 | 0 | 0 | pass |
| pack.havenCells | 6060 | 6060 | 0 | 0 | pass |
| features.total | 123 | 123 | 0 | 0 | pass |
| features.lakes | 34 | 34 | 0 | 0 | pass |
| rivers.count | 718 | 704 | -14 | 0.019 | pass |
| rivers.cellsWithRiver | 4052 | 4011 | -41 | 0.01 | pass |
| population.positivePopulationCells | 32978 | 32988 | 10 | 0 | pass |
| society.cultures | 10 | 10 | 0 | 0 | pass |
| society.burgs | 1059 | 1059 | 0 | 0 | pass |
| society.ports | 175 | 162 | -13 | 0.074 | pass |
| society.states | 12 | 12 | 0 | 0 | pass |
| society.religions | 20 | 20 | 0 | 0 | pass |
| society.provinces | 430 | 430 | 0 | 0 | pass |
| routes.total | 873 | 996 | 123 | 0.141 | pass |
| routes.roads | 9 | 9 | 0 | 0 | pass |
| routes.trails | 681 | 801 | 120 | 0.176 | pass |
| routes.searoutes | 183 | 186 | 3 | 0.016 | pass |
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
