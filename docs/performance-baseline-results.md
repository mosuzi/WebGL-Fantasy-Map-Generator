# Fantasy Map Generator 性能基线结果

生成时间：2026-05-19T00:37:18.527Z
源码目录：`D:\work\fmg\source\Fantasy-Map-Generator`
测试地址：`http://127.0.0.1:5300`

## 耗时汇总

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 | path | use | 文本节点 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 | 1318 | 1587 | 1169 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 | 1907 | 2285 | 1797 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 | 2877 | 3340 | 2447 |

## 图层节点统计

### 10000 目标 cells

| 图层 | 子节点 | path | use | 文本 | circle | line | image |
|---|---:|---:|---:|---:|---:|---:|---:|
| ocean | 7 | 3 | 0 | 0 | 0 | 0 | 0 |
| landmass | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| terrs | 17 | 14 | 0 | 0 | 0 | 0 | 0 |
| lakes | 9 | 0 | 3 | 0 | 0 | 0 | 0 |
| biomes | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| cells | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| compass | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| rivers | 245 | 245 | 0 | 0 | 0 | 0 | 0 |
| relig | 32 | 32 | 0 | 0 | 0 | 0 | 0 |
| cults | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| regions | 43 | 41 | 0 | 0 | 0 | 0 | 0 |
| provs | 521 | 329 | 0 | 190 | 0 | 0 | 0 |
| borders | 4 | 2 | 0 | 0 | 0 | 0 | 0 |
| routes | 503 | 500 | 0 | 0 | 0 | 0 | 0 |
| temperature | 22 | 5 | 0 | 16 | 0 | 0 | 0 |
| coastline | 18 | 0 | 16 | 0 | 0 | 0 | 0 |
| ice | 447 | 0 | 0 | 0 | 0 | 0 | 0 |
| prec | 2409 | 0 | 0 | 6 | 2402 | 0 | 0 |
| population | 3636 | 0 | 0 | 0 | 0 | 3634 | 0 |
| emblems | 813 | 0 | 810 | 0 | 0 | 0 | 0 |
| icons | 739 | 0 | 719 | 0 | 0 | 0 | 0 |
| labels | 689 | 0 | 0 | 677 | 0 | 0 | 0 |
| armies | 639 | 0 | 0 | 206 | 0 | 0 | 103 |
| markers | 408 | 68 | 0 | 68 | 68 | 0 | 68 |
| fogging | 2 | 0 | 0 | 0 | 0 | 0 | 0 |

### 50000 目标 cells

| 图层 | 子节点 | path | use | 文本 | circle | line | image |
|---|---:|---:|---:|---:|---:|---:|---:|
| ocean | 7 | 3 | 0 | 0 | 0 | 0 | 0 |
| landmass | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| terrs | 17 | 14 | 0 | 0 | 0 | 0 | 0 |
| lakes | 26 | 0 | 20 | 0 | 0 | 0 | 0 |
| biomes | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| cells | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| compass | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| rivers | 482 | 482 | 0 | 0 | 0 | 0 | 0 |
| relig | 39 | 39 | 0 | 0 | 0 | 0 | 0 |
| cults | 26 | 26 | 0 | 0 | 0 | 0 | 0 |
| regions | 18 | 16 | 0 | 0 | 0 | 0 | 0 |
| provs | 613 | 384 | 0 | 227 | 0 | 0 | 0 |
| borders | 4 | 2 | 0 | 0 | 0 | 0 | 0 |
| routes | 691 | 688 | 0 | 0 | 0 | 0 | 0 |
| temperature | 54 | 5 | 0 | 48 | 0 | 0 | 0 |
| coastline | 25 | 0 | 23 | 0 | 0 | 0 | 0 |
| ice | 2511 | 0 | 0 | 0 | 0 | 0 | 0 |
| prec | 14385 | 0 | 0 | 8 | 14376 | 0 | 0 |
| population | 17095 | 0 | 0 | 0 | 0 | 17093 | 0 |
| emblems | 1138 | 0 | 1135 | 0 | 0 | 0 | 0 |
| icons | 1040 | 0 | 1020 | 0 | 0 | 0 | 0 |
| labels | 986 | 0 | 0 | 974 | 0 | 0 | 0 |
| armies | 1118 | 0 | 0 | 370 | 0 | 0 | 185 |
| markers | 984 | 164 | 0 | 164 | 164 | 0 | 164 |
| fogging | 2 | 0 | 0 | 0 | 0 | 0 | 0 |

### 100000 目标 cells

| 图层 | 子节点 | path | use | 文本 | circle | line | image |
|---|---:|---:|---:|---:|---:|---:|---:|
| ocean | 7 | 3 | 0 | 0 | 0 | 0 | 0 |
| landmass | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| terrs | 9 | 6 | 0 | 0 | 0 | 0 | 0 |
| lakes | 63 | 0 | 57 | 0 | 0 | 0 | 0 |
| biomes | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| cells | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| compass | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| rivers | 551 | 551 | 0 | 0 | 0 | 0 | 0 |
| relig | 25 | 25 | 0 | 0 | 0 | 0 | 0 |
| cults | 19 | 19 | 0 | 0 | 0 | 0 | 0 |
| regions | 36 | 34 | 0 | 0 | 0 | 0 | 0 |
| provs | 1258 | 808 | 0 | 448 | 0 | 0 | 0 |
| borders | 4 | 2 | 0 | 0 | 0 | 0 | 0 |
| routes | 942 | 939 | 0 | 0 | 0 | 0 | 0 |
| temperature | 37 | 5 | 0 | 31 | 0 | 0 | 0 |
| coastline | 87 | 0 | 85 | 0 | 0 | 0 | 0 |
| prec | 30698 | 0 | 0 | 5 | 30692 | 0 | 0 |
| population | 36175 | 0 | 0 | 0 | 0 | 36173 | 0 |
| emblems | 1597 | 0 | 1594 | 0 | 0 | 0 | 0 |
| icons | 1339 | 0 | 1319 | 0 | 0 | 0 | 0 |
| labels | 1202 | 0 | 0 | 1190 | 0 | 0 | 0 |
| armies | 1397 | 0 | 0 | 460 | 0 | 0 | 230 |
| markers | 1842 | 307 | 0 | 307 | 307 | 0 | 307 |
| fogging | 2 | 0 | 0 | 0 | 0 | 0 | 0 |

## 单图层绘制耗时

### 10000 目标 cells

| 操作 | ms |
|---|---:|
| drawFeatures | 196 |
| drawHeightmap | 45.1 |
| drawBiomes | 19 |
| drawCells | 59.2 |
| drawCultures | 39.4 |
| drawReligions | 47.1 |
| drawStates | 46.9 |
| drawProvinces | 52.8 |
| drawBorders | 82.3 |
| drawRivers | 53.8 |
| drawRoutes | 69.8 |
| drawTemperature | 53.2 |
| drawPopulation | 208.7 |
| drawIce | 201.8 |
| drawPrecipitation | 123.4 |
| drawEmblems | 114 |
| drawLabels | 145.7 |
| drawBurgIcons | 133.7 |
| drawMilitary | 89.4 |
| drawMarkers | 212.4 |

### 50000 目标 cells

| 操作 | ms |
|---|---:|
| drawFeatures | 123.5 |
| drawHeightmap | 76.7 |
| drawBiomes | 99.7 |
| drawCells | 100 |
| drawCultures | 111.7 |
| drawReligions | 123.5 |
| drawStates | 127.9 |
| drawProvinces | 78 |
| drawBorders | 105.9 |
| drawRivers | 106 |
| drawRoutes | 88.4 |
| drawTemperature | 99.8 |
| drawPopulation | 330.6 |
| drawIce | 325.5 |
| drawPrecipitation | 408.7 |
| drawEmblems | 348.4 |
| drawLabels | 361.2 |
| drawBurgIcons | 371.8 |
| drawMilitary | 163.1 |
| drawMarkers | 335.2 |

### 100000 目标 cells

| 操作 | ms |
|---|---:|
| drawFeatures | 111.6 |
| drawHeightmap | 94.1 |
| drawBiomes | 94 |
| drawCells | 94.2 |
| drawCultures | 287.9 |
| drawReligions | 200.3 |
| drawStates | 235.2 |
| drawProvinces | 217.6 |
| drawBorders | 247.8 |
| drawRivers | 265.7 |
| drawRoutes | 246.1 |
| drawTemperature | 258 |
| drawPopulation | 580.8 |
| drawIce | 690.8 |
| drawPrecipitation | 660.7 |
| drawEmblems | 739.8 |
| drawLabels | 266.2 |
| drawBurgIcons | 532.6 |
| drawMilitary | 337.4 |
| drawMarkers | 317.2 |

