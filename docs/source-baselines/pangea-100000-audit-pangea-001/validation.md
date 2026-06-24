# Source baseline 验收记录

Seed：`audit-pangea-001`
模板：`pangea`
目标 cells：100000
截图：本地预览图片已移至 `docs/local-preview-images/` 对应路径，默认不纳入版本库
完整 snapshot：已输出

## 结构摘要

| 项 | 数值 |
|---|---:|
| grid cells | 99846 |
| pack cells | 46048 |
| pack/grid | 0.461 |
| grid 平均邻接度 | 5.976 |
| pack 平均邻接度 | 5.986 |
| 陆地比例 | 0.326 |
| 河流 | 718 |
| 城市 | 1059 |
| 港口 | 175 |
| 国家 | 12 |
| 路线 | 873 |

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
