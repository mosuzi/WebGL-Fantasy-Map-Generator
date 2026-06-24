# Source baseline 验收记录

Seed：`audit-mediterranean-003`
模板：`mediterranean`
目标 cells：10000
截图：本地预览图片已移至 `docs/local-preview-images/` 对应路径，默认不纳入版本库
完整 snapshot：已输出

## 结构摘要

| 项 | 数值 |
|---|---:|
| grid cells | 10004 |
| pack cells | 7831 |
| pack/grid | 0.783 |
| grid 平均邻接度 | 5.921 |
| pack 平均邻接度 | 5.902 |
| 陆地比例 | 0.566 |
| 河流 | 301 |
| 城市 | 1114 |
| 港口 | 162 |
| 国家 | 17 |
| 路线 | 822 |

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
