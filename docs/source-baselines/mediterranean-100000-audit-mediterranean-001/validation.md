# Source baseline 验收记录

Seed：`audit-mediterranean-001`
模板：`mediterranean`
目标 cells：100000
截图：未输出，可用 `--screenshot true` 生成本地预览
完整 snapshot：未输出，本次仅输出 summary/trace

## 结构摘要

| 项 | 数值 |
|---|---:|
| grid cells | 99846 |
| pack cells | 73028 |
| pack/grid | 0.731 |
| grid 平均邻接度 | 5.976 |
| pack 平均邻接度 | 5.97 |
| 陆地比例 | 0.611 |
| 河流 | 955 |
| 城市 | 1825 |
| 港口 | 321 |
| 国家 | 21 |
| 路线 | 1557 |
| 货物 | 71 |
| 市场 | 65 |
| 交易 | 33683 |
| 国库总额 | 97479.1 |

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
| seaRouteLandCells | 737 |

## 下一步

阶段 0 后续需要把本工具扩展为矩阵批量运行，并生成 `candidate-summary.json` 与 `diff.json`。
