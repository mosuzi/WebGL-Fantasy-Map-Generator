# Source baseline 验收记录

Seed：`audit-highIsland-002`
模板：`highIsland`
目标 cells：50000
截图：本地预览图片已移至 `docs/local-preview-images/` 对应路径，默认不纳入版本库
完整 snapshot：未输出，本次仅输出 summary/trace/screenshot

## 结构摘要

| 项 | 数值 |
|---|---:|
| grid cells | 50142 |
| pack cells | 21587 |
| pack/grid | 0.431 |
| grid 平均邻接度 | 5.964 |
| pack 平均邻接度 | 5.989 |
| 陆地比例 | 0.315 |
| 河流 | 417 |
| 城市 | 890 |
| 港口 | 163 |
| 国家 | 15 |
| 路线 | 740 |

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
