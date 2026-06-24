# Source baseline 验收记录

Seed：`audit-archipelago-001`
模板：`archipelago`
目标 cells：10000
截图：未输出，可用 `--screenshot true` 生成本地预览
完整 snapshot：未输出，本次仅输出 summary/trace

## 结构摘要

| 项 | 数值 |
|---|---:|
| grid cells | 10004 |
| pack cells | 3249 |
| pack/grid | 0.325 |
| grid 平均邻接度 | 5.922 |
| pack 平均邻接度 | 5.946 |
| 陆地比例 | 0.157 |
| 河流 | 172 |
| 城市 | 355 |
| 港口 | 57 |
| 国家 | 21 |
| 路线 | 272 |

## 关键检查

| 检查 | 数值 |
|---|---:|
| gridCellIndexCountOk | true |
| gridNeighborInvalidRefs | 0 |
| gridVertexInvalidRefs | 0 |
| packCellIndexCountOk | true |
| packGridRefsInvalid | 0 |
| packNeighborInvalidRefs | 0 |
| packVertexInvalidRefs | 0 |
| havenInvalidCount | 0 |
| harborMismatchCount | 0 |
| routeLinkAsymmetry | 0 |
| landRouteWaterCells | 0 |
| seaRouteLandCells | 0 |

## 下一步

阶段 0 后续需要把本工具扩展为矩阵批量运行，并生成 `candidate-summary.json` 与 `diff.json`。
