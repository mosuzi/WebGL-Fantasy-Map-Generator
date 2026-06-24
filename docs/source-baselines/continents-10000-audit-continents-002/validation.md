# Source baseline 验收记录

Seed：`audit-continents-002`
模板：`continents`
目标 cells：10000
截图：本地预览图片已移至 `docs/local-preview-images/` 对应路径，默认不纳入版本库
完整 snapshot：未输出，本次仅输出 summary/trace/screenshot

## 结构摘要

| 项 | 数值 |
|---|---:|
| grid cells | 10004 |
| pack cells | 5434 |
| pack/grid | 0.543 |
| grid 平均邻接度 | 5.923 |
| pack 平均邻接度 | 5.965 |
| 陆地比例 | 0.318 |
| 河流 | 238 |
| 城市 | 754 |
| 港口 | 110 |
| 国家 | 20 |
| 路线 | 557 |

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
| seaRouteLandCells | 2 |

## 下一步

阶段 0 后续需要把本工具扩展为矩阵批量运行，并生成 `candidate-summary.json` 与 `diff.json`。
