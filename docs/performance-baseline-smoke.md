# Fantasy Map Generator 性能基线结果

生成时间：2026-05-19T00:24:09.138Z
源码目录：`D:\work\fmg\source\Fantasy-Map-Generator`
测试地址：`http://127.0.0.1:5300`

## 耗时汇总

| 目标 cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 | path | use | 文本节点 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10000 | 7424 | 664.3 | 211.7 | 17776 | 1930 | 2421 | 1840 |

## 图层节点统计

### 10000 目标 cells

| 图层 | 子节点 | path | use | 文本 | circle | line | image |
|---|---:|---:|---:|---:|---:|---:|---:|
| ocean | 7 | 3 | 0 | 0 | 0 | 0 | 0 |
| landmass | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| terrs | 16 | 13 | 0 | 0 | 0 | 0 | 0 |
| lakes | 9 | 0 | 3 | 0 | 0 | 0 | 0 |
| biomes | 19 | 19 | 0 | 0 | 0 | 0 | 0 |
| cells | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| compass | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| rivers | 425 | 425 | 0 | 0 | 0 | 0 | 0 |
| relig | 22 | 22 | 0 | 0 | 0 | 0 | 0 |
| cults | 19 | 19 | 0 | 0 | 0 | 0 | 0 |
| regions | 61 | 59 | 0 | 0 | 0 | 0 | 0 |
| provs | 737 | 469 | 0 | 266 | 0 | 0 | 0 |
| borders | 4 | 2 | 0 | 0 | 0 | 0 | 0 |
| routes | 774 | 771 | 0 | 0 | 0 | 0 | 0 |
| temperature | 26 | 4 | 0 | 21 | 0 | 0 | 0 |
| coastline | 13 | 0 | 11 | 0 | 0 | 0 | 0 |
| ice | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| prec | 4258 | 0 | 0 | 5 | 4252 | 0 | 0 |
| population | 6008 | 0 | 0 | 0 | 0 | 6006 | 0 |
| emblems | 1260 | 0 | 1257 | 0 | 0 | 0 | 0 |
| icons | 1141 | 0 | 1121 | 0 | 0 | 0 | 0 |
| labels | 1087 | 0 | 0 | 1075 | 0 | 0 | 0 |
| armies | 1194 | 0 | 0 | 388 | 0 | 0 | 194 |
| markers | 474 | 79 | 0 | 79 | 79 | 0 | 79 |
| fogging | 2 | 0 | 0 | 0 | 0 | 0 | 0 |

## 单图层绘制耗时

### 10000 目标 cells

| 操作 | ms |
|---|---:|
| drawFeatures | 99.9 |
| drawHeightmap | 58.8 |
| drawBiomes | 76.5 |
| drawCells | 70.8 |
| drawCultures | 94.2 |
| drawReligions | 82.3 |
| drawStates | 88.4 |
| drawProvinces | 83 |
| drawBorders | 128.4 |
| drawRivers | 88.1 |
| drawRoutes | 94 |
| drawTemperature | 98 |
| drawPopulation | 243.3 |
| drawIce | 202 |
| drawPrecipitation | 194.5 |
| drawEmblems | 197.2 |
| drawLabels | 225.4 |
| drawBurgIcons | 191.4 |
| drawMilitary | 250.1 |
| drawMarkers | 128.8 |

