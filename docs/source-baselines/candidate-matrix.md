# Candidate baseline 矩阵回归

生成时间：2026-06-24T16:41:47.034Z
模式：full
样例数：63
状态：pass

## 总览

| case | 模板 | cells | 状态 | fail | warn | grid | pack | 陆地比 S/C | 高度 p50 S/C | 高度 p95 S/C | 温度低值 S/C |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| mediterranean-10000-audit-mediterranean-001 | mediterranean | 10000 | pass | 0 | 0 | 10004 | 7010 | 0.456 / 0.456 | 17 / 17 | 68 / 68 | -25 / -25 |
| mediterranean-10000-audit-mediterranean-002 | mediterranean | 10000 | pass | 0 | 0 | 10004 | 8429 | 0.617 / 0.617 | 26 / 26 | 72 / 72 | -41 / -41 |
| mediterranean-10000-audit-mediterranean-003 | mediterranean | 10000 | pass | 0 | 0 | 10004 | 7831 | 0.566 / 0.566 | 24 / 24 | 66 / 66 | -3 / -3 |
| mediterranean-50000-audit-mediterranean-001 | mediterranean | 50000 | pass | 0 | 0 | 50142 | 35075 | 0.554 / 0.554 | 23 / 23 | 77 / 77 | -39 / -39 |
| mediterranean-50000-audit-mediterranean-002 | mediterranean | 50000 | pass | 0 | 0 | 50142 | 37246 | 0.574 / 0.574 | 25 / 25 | 74 / 74 | -43 / -43 |
| mediterranean-50000-audit-mediterranean-003 | mediterranean | 50000 | pass | 0 | 0 | 50142 | 36414 | 0.573 / 0.573 | 25 / 25 | 80 / 80 | -10 / -10 |
| mediterranean-100000-audit-mediterranean-001 | mediterranean | 100000 | pass | 0 | 0 | 99846 | 73028 | 0.611 / 0.611 | 27 / 27 | 76 / 76 | -35 / -35 |
| mediterranean-100000-audit-mediterranean-002 | mediterranean | 100000 | pass | 0 | 0 | 99846 | 75311 | 0.617 / 0.617 | 27 / 27 | 75 / 75 | -44 / -44 |
| mediterranean-100000-audit-mediterranean-003 | mediterranean | 100000 | pass | 0 | 0 | 99846 | 77843 | 0.652 / 0.652 | 30 / 30 | 81 / 81 | -15 / -15 |
| continents-10000-audit-continents-001 | continents | 10000 | pass | 0 | 0 | 10004 | 5226 | 0.32 / 0.32 | 11 / 11 | 49 / 49 | -9 / -9 |
| continents-10000-audit-continents-002 | continents | 10000 | pass | 0 | 0 | 10004 | 5434 | 0.318 / 0.318 | 12 / 12 | 47 / 47 | -9 / -9 |
| continents-10000-audit-continents-003 | continents | 10000 | pass | 0 | 0 | 10004 | 5649 | 0.328 / 0.328 | 13 / 13 | 41 / 41 | -4 / -4 |
| continents-50000-audit-continents-001 | continents | 50000 | pass | 0 | 0 | 50142 | 24947 | 0.322 / 0.322 | 11 / 11 | 45 / 45 | -17 / -17 |
| continents-50000-audit-continents-002 | continents | 50000 | pass | 0 | 0 | 50142 | 27130 | 0.378 / 0.378 | 14 / 14 | 49 / 49 | -10 / -10 |
| continents-50000-audit-continents-003 | continents | 50000 | pass | 0 | 0 | 50142 | 30006 | 0.4 / 0.4 | 15 / 15 | 50 / 50 | -2 / -2 |
| continents-100000-audit-continents-001 | continents | 100000 | pass | 0 | 0 | 99846 | 50625 | 0.338 / 0.338 | 12 / 12 | 44 / 44 | -15 / -15 |
| continents-100000-audit-continents-002 | continents | 100000 | pass | 0 | 0 | 99846 | 58166 | 0.429 / 0.429 | 16 / 16 | 52 / 52 | -16 / -16 |
| continents-100000-audit-continents-003 | continents | 100000 | pass | 0 | 0 | 99846 | 55115 | 0.382 / 0.382 | 14 / 14 | 51 / 51 | -17 / -17 |
| archipelago-10000-audit-archipelago-001 | archipelago | 10000 | pass | 0 | 0 | 10004 | 3249 | 0.157 / 0.157 | 12 / 12 | 33.85 / 33.85 | -24 / -24 |
| archipelago-10000-audit-archipelago-002 | archipelago | 10000 | pass | 0 | 0 | 10004 | 3999 | 0.188 / 0.188 | 12 / 12 | 33 / 33 | -22 / -22 |
| archipelago-10000-audit-archipelago-003 | archipelago | 10000 | pass | 0 | 0 | 10004 | 4234 | 0.157 / 0.157 | 13 / 13 | 28 / 28 | -7 / -7 |
| archipelago-50000-audit-archipelago-001 | archipelago | 50000 | pass | 0 | 0 | 50142 | 9750 | 0.08 / 0.08 | 12 / 12 | 23 / 23 | -26 / -26 |
| archipelago-50000-audit-archipelago-002 | archipelago | 50000 | pass | 0 | 0 | 50142 | 10674 | 0.087 / 0.087 | 12 / 12 | 22 / 22 | -22 / -22 |
| archipelago-50000-audit-archipelago-003 | archipelago | 50000 | pass | 0 | 0 | 50142 | 13173 | 0.121 / 0.121 | 13 / 13 | 26 / 26 | 1 / 1 |
| archipelago-100000-audit-archipelago-001 | archipelago | 100000 | pass | 0 | 0 | 99846 | 14351 | 0.066 / 0.066 | 12 / 12 | 21 / 21 | -26 / -26 |
| archipelago-100000-audit-archipelago-002 | archipelago | 100000 | pass | 0 | 0 | 99846 | 17509 | 0.076 / 0.076 | 13 / 13 | 22 / 22 | -22 / -22 |
| archipelago-100000-audit-archipelago-003 | archipelago | 100000 | pass | 0 | 0 | 99846 | 20504 | 0.097 / 0.097 | 14 / 14 | 24 / 24 | 3 / 3 |
| highIsland-10000-audit-highIsland-001 | highIsland | 10000 | pass | 0 | 0 | 10004 | 4306 | 0.271 / 0.271 | 11 / 11 | 46 / 46 | -26 / -26 |
| highIsland-10000-audit-highIsland-002 | highIsland | 10000 | pass | 0 | 0 | 10004 | 4772 | 0.315 / 0.315 | 12 / 12 | 52 / 52 | -14 / -14 |
| highIsland-10000-audit-highIsland-003 | highIsland | 10000 | pass | 0 | 0 | 10004 | 4712 | 0.302 / 0.302 | 11 / 11 | 59 / 59 | -19 / -19 |
| highIsland-50000-audit-highIsland-001 | highIsland | 50000 | pass | 0 | 0 | 50142 | 20013 | 0.284 / 0.284 | 9 / 9 | 53 / 53 | -17 / -17 |
| highIsland-50000-audit-highIsland-002 | highIsland | 50000 | pass | 0 | 0 | 50142 | 21587 | 0.315 / 0.315 | 11 / 11 | 64 / 64 | -15 / -15 |
| highIsland-50000-audit-highIsland-003 | highIsland | 50000 | pass | 0 | 0 | 50142 | 19511 | 0.279 / 0.279 | 10 / 10 | 59 / 59 | -31 / -31 |
| highIsland-100000-audit-highIsland-001 | highIsland | 100000 | pass | 0 | 0 | 99846 | 38660 | 0.277 / 0.277 | 11 / 11 | 52 / 52 | -28 / -28 |
| highIsland-100000-audit-highIsland-002 | highIsland | 100000 | pass | 0 | 0 | 99846 | 44794 | 0.339 / 0.339 | 12 / 12 | 60 / 60 | -25 / -25 |
| highIsland-100000-audit-highIsland-003 | highIsland | 100000 | pass | 0 | 0 | 99846 | 42881 | 0.318 / 0.318 | 12 / 12 | 61 / 61 | -25 / -25 |
| lowIsland-10000-audit-lowIsland-001 | lowIsland | 10000 | pass | 0 | 0 | 10004 | 5081 | 0.302 / 0.302 | 13 / 13 | 32 / 32 | -10 / -10 |
| lowIsland-10000-audit-lowIsland-002 | lowIsland | 10000 | pass | 0 | 0 | 10004 | 4436 | 0.3 / 0.3 | 12 / 12 | 36 / 36 | -20 / -20 |
| lowIsland-10000-audit-lowIsland-003 | lowIsland | 10000 | pass | 0 | 0 | 10004 | 4458 | 0.304 / 0.304 | 11 / 11 | 39 / 39 | 2 / 2 |
| lowIsland-50000-audit-lowIsland-001 | lowIsland | 50000 | pass | 0 | 0 | 50142 | 22218 | 0.279 / 0.279 | 11 / 11 | 36 / 36 | -10 / -10 |
| lowIsland-50000-audit-lowIsland-002 | lowIsland | 50000 | pass | 0 | 0 | 50142 | 20461 | 0.271 / 0.271 | 12 / 12 | 32 / 32 | -21 / -21 |
| lowIsland-50000-audit-lowIsland-003 | lowIsland | 50000 | pass | 0 | 0 | 50142 | 18402 | 0.234 / 0.234 | 7 / 7 | 31 / 31 | 2 / 2 |
| lowIsland-100000-audit-lowIsland-001 | lowIsland | 100000 | pass | 0 | 0 | 99846 | 44592 | 0.306 / 0.306 | 14 / 14 | 36 / 36 | -10 / -10 |
| lowIsland-100000-audit-lowIsland-002 | lowIsland | 100000 | pass | 0 | 0 | 99846 | 43376 | 0.278 / 0.278 | 12 / 12 | 31 / 31 | -21 / -21 |
| lowIsland-100000-audit-lowIsland-003 | lowIsland | 100000 | pass | 0 | 0 | 99846 | 41380 | 0.279 / 0.279 | 12 / 12 | 36 / 36 | 3 / 3 |
| peninsula-10000-audit-peninsula-001 | peninsula | 10000 | pass | 0 | 0 | 10004 | 5383 | 0.301 / 0.301 | 18 / 18 | 44 / 44 | -31 / -31 |
| peninsula-10000-audit-peninsula-002 | peninsula | 10000 | pass | 0 | 0 | 10004 | 5501 | 0.358 / 0.358 | 18 / 18 | 45 / 45 | -14 / -14 |
| peninsula-10000-audit-peninsula-003 | peninsula | 10000 | pass | 0 | 0 | 10004 | 6754 | 0.392 / 0.392 | 19 / 19 | 46 / 46 | -20 / -20 |
| peninsula-50000-audit-peninsula-001 | peninsula | 50000 | pass | 0 | 0 | 50142 | 22874 | 0.287 / 0.287 | 18 / 18 | 49 / 49 | -24 / -24 |
| peninsula-50000-audit-peninsula-002 | peninsula | 50000 | pass | 0 | 0 | 50142 | 29471 | 0.426 / 0.426 | 19 / 19 | 59 / 59 | -16 / -16 |
| peninsula-50000-audit-peninsula-003 | peninsula | 50000 | pass | 0 | 0 | 50142 | 20198 | 0.314 / 0.314 | 18 / 18 | 61 / 61 | -20 / -20 |
| peninsula-100000-audit-peninsula-001 | peninsula | 100000 | pass | 0 | 0 | 99846 | 58866 | 0.441 / 0.441 | 19 / 19 | 58 / 58 | -32 / -32 |
| peninsula-100000-audit-peninsula-002 | peninsula | 100000 | pass | 0 | 0 | 99846 | 78307 | 0.58 / 0.58 | 20 / 20 | 67 / 67 | -14 / -14 |
| peninsula-100000-audit-peninsula-003 | peninsula | 100000 | pass | 0 | 0 | 99846 | 76408 | 0.549 / 0.549 | 20 / 20 | 53 / 53 | -20 / -20 |
| pangea-10000-audit-pangea-001 | pangea | 10000 | pass | 0 | 0 | 10004 | 5659 | 0.369 / 0.369 | 13 / 13 | 56 / 56 | -36 / -36 |
| pangea-10000-audit-pangea-002 | pangea | 10000 | pass | 0 | 0 | 10004 | 6689 | 0.447 / 0.447 | 17 / 17 | 64 / 64 | -25 / -25 |
| pangea-10000-audit-pangea-003 | pangea | 10000 | pass | 0 | 0 | 10004 | 6923 | 0.489 / 0.489 | 19 / 19 | 55 / 55 | -35 / -35 |
| pangea-50000-audit-pangea-001 | pangea | 50000 | pass | 0 | 0 | 50142 | 21773 | 0.274 / 0.274 | 10 / 10 | 45 / 45 | -29 / -29 |
| pangea-50000-audit-pangea-002 | pangea | 50000 | pass | 0 | 0 | 50142 | 27543 | 0.388 / 0.388 | 15 / 15 | 57 / 57 | -24 / -24 |
| pangea-50000-audit-pangea-003 | pangea | 50000 | pass | 0 | 0 | 50142 | 21902 | 0.284 / 0.284 | 10 / 10 | 47 / 47 | -30 / -30 |
| pangea-100000-audit-pangea-001 | pangea | 100000 | pass | 0 | 0 | 99846 | 46048 | 0.326 / 0.326 | 12 / 12 | 58 / 58 | -32 / -32 |
| pangea-100000-audit-pangea-002 | pangea | 100000 | pass | 0 | 0 | 99846 | 50600 | 0.349 / 0.349 | 14 / 14 | 51 / 51 | -25 / -25 |
| pangea-100000-audit-pangea-003 | pangea | 100000 | pass | 0 | 0 | 99846 | 53340 | 0.416 / 0.416 | 14 / 14 | 64 / 64 | -29 / -29 |

## 语义指标

| case | 河流 S/C | 人口 cell S/C | 城市 S/C | 港口 S/C | 国家 S/C | 宗教 S/C | 省份 S/C | 路线 S/C | 陆路穿水 | 海路中段穿陆 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mediterranean-10000-audit-mediterranean-001 | 172 / 172 | 4541 / 4539 | 929 / 924 | 149 / 155 | 21 / 21 | 19 / 19 | 226 / 190 | 693 / 711 | 0 | 0 |
| mediterranean-10000-audit-mediterranean-002 | 61 / 61 | 5316 / 5312 | 1076 / 1055 | 162 / 144 | 15 / 15 | 27 / 27 | 349 / 317 | 723 / 787 | 0 | 0 |
| mediterranean-10000-audit-mediterranean-003 | 301 / 299 | 5666 / 5634 | 1114 / 987 | 162 / 113 | 17 / 17 | 16 / 16 | 342 / 247 | 822 / 725 | 0 | 0 |
| mediterranean-50000-audit-mediterranean-001 | 532 / 519 | 24046 / 24131 | 1344 / 1350 | 175 / 185 | 21 / 21 | 19 / 19 | 356 / 346 | 996 / 1055 | 0 | 0 |
| mediterranean-50000-audit-mediterranean-002 | 147 / 132 | 23474 / 23463 | 1294 / 1307 | 253 / 228 | 15 / 15 | 27 / 27 | 472 / 465 | 1008 / 1137 | 0 | 0 |
| mediterranean-50000-audit-mediterranean-003 | 640 / 628 | 26250 / 26153 | 1462 / 1457 | 217 / 193 | 17 / 17 | 16 / 16 | 502 / 499 | 1141 / 1233 | 0 | 0 |
| mediterranean-100000-audit-mediterranean-001 | 956 / 912 | 53650 / 53834 | 1724 / 1730 | 230 / 234 | 21 / 21 | 19 / 19 | 477 / 463 | 1331 / 1481 | 0 | 0 |
| mediterranean-100000-audit-mediterranean-002 | 369 / 312 | 51067 / 51031 | 1609 / 1613 | 293 / 264 | 15 / 15 | 27 / 27 | 619 / 611 | 1223 / 1321 | 0 | 0 |
| mediterranean-100000-audit-mediterranean-003 | 1246 / 1157 | 57714 / 57528 | 1849 / 1843 | 317 / 266 | 17 / 17 | 16 / 16 | 669 / 605 | 1460 / 1552 | 0 | 0 |
| continents-10000-audit-continents-001 | 205 / 205 | 3627 / 3627 | 746 / 746 | 85 / 75 | 21 / 21 | 19 / 19 | 180 / 171 | 554 / 611 | 0 | 0 |
| continents-10000-audit-continents-002 | 238 / 236 | 3684 / 3684 | 754 / 757 | 110 / 113 | 20 / 20 | 17 / 17 | 226 / 212 | 557 / 617 | 0 | 0 |
| continents-10000-audit-continents-003 | 243 / 240 | 3863 / 3863 | 790 / 790 | 119 / 112 | 18 / 18 | 30 / 30 | 231 / 236 | 639 / 656 | 0 | 0 |
| continents-50000-audit-continents-001 | 578 / 566 | 18105 / 18105 | 1018 / 1018 | 146 / 129 | 21 / 21 | 15 / 19 | 268 / 269 | 842 / 885 | 0 | 0 |
| continents-50000-audit-continents-002 | 568 / 563 | 20554 / 20552 | 1152 / 1152 | 197 / 180 | 20 / 20 | 17 / 17 | 369 / 367 | 994 / 1056 | 0 | 0 |
| continents-50000-audit-continents-003 | 626 / 610 | 22481 / 22470 | 1256 / 1255 | 268 / 224 | 18 / 18 | 30 / 30 | 406 / 404 | 1111 / 1130 | 0 | 0 |
| continents-100000-audit-continents-001 | 851 / 822 | 37350 / 37365 | 1206 / 1207 | 187 / 178 | 21 / 21 | 19 / 19 | 350 / 348 | 1041 / 1094 | 0 | 0 |
| continents-100000-audit-continents-002 | 879 / 850 | 45285 / 45309 | 1457 / 1458 | 260 / 236 | 20 / 20 | 17 / 17 | 494 / 491 | 1252 / 1304 | 0 | 0 |
| continents-100000-audit-continents-003 | 909 / 867 | 42202 / 42204 | 1357 / 1357 | 229 / 241 | 18 / 18 | 30 / 30 | 487 / 492 | 1201 / 1286 | 0 | 0 |
| archipelago-10000-audit-archipelago-001 | 172 / 171 | 1925 / 1926 | 355 / 405 | 57 / 64 | 21 / 21 | 11 / 11 | 131 / 120 | 272 / 342 | 0 | 0 |
| archipelago-10000-audit-archipelago-002 | 170 / 170 | 2273 / 2273 | 464 / 471 | 69 / 64 | 17 / 17 | 24 / 24 | 133 / 133 | 361 / 365 | 0 | 0 |
| archipelago-10000-audit-archipelago-003 | 169 / 167 | 2139 / 2139 | 450 / 439 | 95 / 79 | 22 / 22 | 16 / 16 | 117 / 109 | 381 / 376 | 0 | 0 |
| archipelago-50000-audit-archipelago-001 | 263 / 257 | 5102 / 5098 | 297 / 300 | 89 / 75 | 21 / 21 | 11 / 11 | 128 / 129 | 296 / 321 | 0 | 0 |
| archipelago-50000-audit-archipelago-002 | 211 / 209 | 5582 / 5582 | 324 / 324 | 85 / 72 | 17 / 17 | 24 / 24 | 130 / 124 | 287 / 317 | 0 | 0 |
| archipelago-50000-audit-archipelago-003 | 375 / 371 | 7519 / 7517 | 436 / 436 | 115 / 97 | 22 / 22 | 16 / 16 | 137 / 129 | 390 / 440 | 0 | 0 |
| archipelago-100000-audit-archipelago-001 | 238 / 238 | 7786 / 7786 | 265 / 268 | 79 / 68 | 21 / 21 | 11 / 11 | 128 / 130 | 266 / 276 | 0 | 0 |
| archipelago-100000-audit-archipelago-002 | 307 / 304 | 9558 / 9557 | 320 / 320 | 106 / 76 | 17 / 17 | 24 / 24 | 146 / 146 | 317 / 337 | 0 | 0 |
| archipelago-100000-audit-archipelago-003 | 453 / 451 | 12019 / 12018 | 403 / 403 | 124 / 102 | 22 / 22 | 16 / 16 | 144 / 152 | 406 / 444 | 0 | 0 |
| highIsland-10000-audit-highIsland-001 | 80 / 79 | 3050 / 3048 | 637 / 637 | 111 / 81 | 28 / 28 | 19 / 19 | 217 / 212 | 462 / 507 | 0 | 0 |
| highIsland-10000-audit-highIsland-002 | 182 / 179 | 3482 / 3482 | 690 / 710 | 89 / 81 | 15 / 15 | 13 / 13 | 218 / 209 | 533 / 567 | 0 | 0 |
| highIsland-10000-audit-highIsland-003 | 139 / 138 | 3303 / 3303 | 654 / 667 | 111 / 69 | 15 / 15 | 21 / 21 | 153 / 152 | 482 / 527 | 0 | 0 |
| highIsland-50000-audit-highIsland-001 | 155 / 148 | 15407 / 15453 | 876 / 879 | 162 / 159 | 28 / 28 | 19 / 19 | 299 / 281 | 701 / 791 | 0 | 0 |
| highIsland-50000-audit-highIsland-002 | 417 / 410 | 15893 / 15900 | 890 / 890 | 163 / 141 | 15 / 15 | 13 / 13 | 329 / 324 | 740 / 824 | 0 | 0 |
| highIsland-50000-audit-highIsland-003 | 303 / 296 | 14513 / 14524 | 814 / 815 | 144 / 123 | 15 / 15 | 21 / 21 | 241 / 231 | 649 / 735 | 0 | 0 |
| highIsland-100000-audit-highIsland-001 | 297 / 289 | 29304 / 29457 | 958 / 963 | 195 / 187 | 28 / 28 | 19 / 19 | 339 / 344 | 840 / 883 | 0 | 0 |
| highIsland-100000-audit-highIsland-002 | 776 / 761 | 33203 / 33206 | 1069 / 1069 | 171 / 138 | 15 / 15 | 13 / 13 | 416 / 429 | 914 / 962 | 0 | 0 |
| highIsland-100000-audit-highIsland-003 | 507 / 489 | 31657 / 31701 | 1020 / 1021 | 169 / 151 | 15 / 15 | 21 / 21 | 339 / 339 | 810 / 937 | 0 | 0 |
| lowIsland-10000-audit-lowIsland-001 | 156 / 148 | 3546 / 3546 | 716 / 737 | 103 / 100 | 28 / 28 | 27 / 27 | 228 / 229 | 555 / 625 | 0 | 0 |
| lowIsland-10000-audit-lowIsland-002 | 186 / 184 | 3348 / 3348 | 699 / 694 | 89 / 75 | 30 / 30 | 11 / 11 | 157 / 154 | 508 / 538 | 0 | 0 |
| lowIsland-10000-audit-lowIsland-003 | 172 / 172 | 3370 / 3370 | 693 / 695 | 75 / 59 | 21 / 21 | 17 / 17 | 232 / 228 | 501 / 540 | 0 | 0 |
| lowIsland-50000-audit-lowIsland-001 | 374 / 358 | 15988 / 15988 | 908 / 908 | 152 / 125 | 28 / 28 | 27 / 27 | 305 / 307 | 765 / 806 | 0 | 0 |
| lowIsland-50000-audit-lowIsland-002 | 423 / 412 | 15218 / 15218 | 868 / 868 | 131 / 99 | 30 / 30 | 11 / 11 | 226 / 218 | 689 / 756 | 0 | 0 |
| lowIsland-50000-audit-lowIsland-003 | 371 / 356 | 13404 / 13404 | 759 / 759 | 178 / 146 | 21 / 21 | 16 / 17 | 278 / 280 | 669 / 731 | 0 | 0 |
| lowIsland-100000-audit-lowIsland-001 | 530 / 487 | 33702 / 33717 | 1098 / 1098 | 198 / 194 | 28 / 28 | 27 / 27 | 379 / 380 | 914 / 1019 | 0 | 0 |
| lowIsland-100000-audit-lowIsland-002 | 686 / 645 | 31371 / 31371 | 1026 / 1026 | 169 / 174 | 30 / 30 | 11 / 11 | 281 / 277 | 895 / 994 | 0 | 0 |
| lowIsland-100000-audit-lowIsland-003 | 585 / 555 | 30703 / 30651 | 995 / 994 | 236 / 177 | 21 / 21 | 17 / 17 | 379 / 378 | 917 / 916 | 0 | 0 |
| peninsula-10000-audit-peninsula-001 | 114 / 112 | 3390 / 3390 | 694 / 694 | 118 / 101 | 17 / 17 | 13 / 13 | 159 / 158 | 534 / 549 | 0 | 0 |
| peninsula-10000-audit-peninsula-002 | 224 / 222 | 3930 / 3930 | 769 / 805 | 85 / 83 | 19 / 19 | 17 / 17 | 221 / 221 | 545 / 595 | 0 | 0 |
| peninsula-10000-audit-peninsula-003 | 9 / 9 | 4197 / 4211 | 821 / 831 | 174 / 149 | 21 / 21 | 13 / 13 | 183 / 187 | 605 / 665 | 0 | 0 |
| peninsula-50000-audit-peninsula-001 | 361 / 344 | 15315 / 15330 | 860 / 861 | 192 / 159 | 17 / 17 | 13 / 13 | 251 / 247 | 774 / 809 | 0 | 0 |
| peninsula-50000-audit-peninsula-002 | 492 / 462 | 21864 / 21894 | 1223 / 1225 | 262 / 185 | 19 / 19 | 17 / 17 | 394 / 386 | 1004 / 1036 | 0 | 0 |
| peninsula-50000-audit-peninsula-003 | 48 / 45 | 13125 / 13244 | 733 / 750 | 137 / 117 | 21 / 21 | 13 / 13 | 202 / 190 | 534 / 670 | 0 | 0 |
| peninsula-100000-audit-peninsula-001 | 558 / 462 | 45172 / 45177 | 1451 / 1451 | 238 / 199 | 17 / 17 | 12 / 13 | 425 / 428 | 1175 / 1210 | 0 | 0 |
| peninsula-100000-audit-peninsula-002 | 1254 / 1068 | 58261 / 58282 | 1868 / 1869 | 404 / 365 | 19 / 19 | 17 / 17 | 616 / 606 | 1623 / 1685 | 0 | 0 |
| peninsula-100000-audit-peninsula-003 | 94 / 77 | 55050 / 55494 | 1768 / 1782 | 411 / 348 | 21 / 21 | 13 / 13 | 475 / 481 | 1374 / 1595 | 0 | 0 |
| pangea-10000-audit-pangea-001 | 217 / 214 | 3979 / 3979 | 775 / 808 | 130 / 100 | 12 / 12 | 20 / 20 | 221 / 210 | 596 / 627 | 0 | 0 |
| pangea-10000-audit-pangea-002 | 192 / 191 | 4821 / 4832 | 978 / 960 | 124 / 124 | 15 / 15 | 18 / 18 | 233 / 215 | 724 / 777 | 0 | 0 |
| pangea-10000-audit-pangea-003 | 197 / 195 | 4811 / 4810 | 966 / 975 | 119 / 84 | 13 / 13 | 19 / 19 | 228 / 223 | 709 / 710 | 0 | 0 |
| pangea-50000-audit-pangea-001 | 446 / 438 | 15373 / 15374 | 859 / 859 | 158 / 137 | 12 / 12 | 20 / 20 | 303 / 294 | 694 / 751 | 0 | 0 |
| pangea-50000-audit-pangea-002 | 469 / 461 | 20409 / 20555 | 1139 / 1147 | 191 / 162 | 15 / 15 | 18 / 18 | 317 / 311 | 864 / 947 | 0 | 0 |
| pangea-50000-audit-pangea-003 | 398 / 392 | 13771 / 13782 | 771 / 772 | 114 / 106 | 13 / 13 | 19 / 19 | 249 / 224 | 640 / 671 | 0 | 0 |
| pangea-100000-audit-pangea-001 | 718 / 704 | 32978 / 32988 | 1059 / 1059 | 175 / 162 | 12 / 12 | 20 / 20 | 430 / 430 | 873 / 996 | 0 | 0 |
| pangea-100000-audit-pangea-002 | 632 / 601 | 37435 / 37519 | 1203 / 1206 | 237 / 194 | 15 / 15 | 18 / 18 | 385 / 389 | 1052 / 1085 | 0 | 0 |
| pangea-100000-audit-pangea-003 | 534 / 499 | 36647 / 36718 | 1176 / 1178 | 149 / 146 | 13 / 13 | 19 / 19 | 413 / 388 | 892 / 1030 | 0 | 0 |

## 问题清单

- mediterranean-10000-audit-mediterranean-001：fail 0（无），warn 0（无）。
- mediterranean-10000-audit-mediterranean-002：fail 0（无），warn 0（无）。
- mediterranean-10000-audit-mediterranean-003：fail 0（无），warn 0（无）。
- mediterranean-50000-audit-mediterranean-001：fail 0（无），warn 0（无）。
- mediterranean-50000-audit-mediterranean-002：fail 0（无），warn 0（无）。
- mediterranean-50000-audit-mediterranean-003：fail 0（无），warn 0（无）。
- mediterranean-100000-audit-mediterranean-001：fail 0（无），warn 0（无）。
- mediterranean-100000-audit-mediterranean-002：fail 0（无），warn 0（无）。
- mediterranean-100000-audit-mediterranean-003：fail 0（无），warn 0（无）。
- continents-10000-audit-continents-001：fail 0（无），warn 0（无）。
- continents-10000-audit-continents-002：fail 0（无），warn 0（无）。
- continents-10000-audit-continents-003：fail 0（无），warn 0（无）。
- continents-50000-audit-continents-001：fail 0（无），warn 0（无）。
- continents-50000-audit-continents-002：fail 0（无），warn 0（无）。
- continents-50000-audit-continents-003：fail 0（无），warn 0（无）。
- continents-100000-audit-continents-001：fail 0（无），warn 0（无）。
- continents-100000-audit-continents-002：fail 0（无），warn 0（无）。
- continents-100000-audit-continents-003：fail 0（无），warn 0（无）。
- archipelago-10000-audit-archipelago-001：fail 0（无），warn 0（无）。
- archipelago-10000-audit-archipelago-002：fail 0（无），warn 0（无）。
- archipelago-10000-audit-archipelago-003：fail 0（无），warn 0（无）。
- archipelago-50000-audit-archipelago-001：fail 0（无），warn 0（无）。
- archipelago-50000-audit-archipelago-002：fail 0（无），warn 0（无）。
- archipelago-50000-audit-archipelago-003：fail 0（无），warn 0（无）。
- archipelago-100000-audit-archipelago-001：fail 0（无），warn 0（无）。
- archipelago-100000-audit-archipelago-002：fail 0（无），warn 0（无）。
- archipelago-100000-audit-archipelago-003：fail 0（无），warn 0（无）。
- highIsland-10000-audit-highIsland-001：fail 0（无），warn 0（无）。
- highIsland-10000-audit-highIsland-002：fail 0（无），warn 0（无）。
- highIsland-10000-audit-highIsland-003：fail 0（无），warn 0（无）。
- highIsland-50000-audit-highIsland-001：fail 0（无），warn 0（无）。
- highIsland-50000-audit-highIsland-002：fail 0（无），warn 0（无）。
- highIsland-50000-audit-highIsland-003：fail 0（无），warn 0（无）。
- highIsland-100000-audit-highIsland-001：fail 0（无），warn 0（无）。
- highIsland-100000-audit-highIsland-002：fail 0（无），warn 0（无）。
- highIsland-100000-audit-highIsland-003：fail 0（无），warn 0（无）。
- lowIsland-10000-audit-lowIsland-001：fail 0（无），warn 0（无）。
- lowIsland-10000-audit-lowIsland-002：fail 0（无），warn 0（无）。
- lowIsland-10000-audit-lowIsland-003：fail 0（无），warn 0（无）。
- lowIsland-50000-audit-lowIsland-001：fail 0（无），warn 0（无）。
- lowIsland-50000-audit-lowIsland-002：fail 0（无），warn 0（无）。
- lowIsland-50000-audit-lowIsland-003：fail 0（无），warn 0（无）。
- lowIsland-100000-audit-lowIsland-001：fail 0（无），warn 0（无）。
- lowIsland-100000-audit-lowIsland-002：fail 0（无），warn 0（无）。
- lowIsland-100000-audit-lowIsland-003：fail 0（无），warn 0（无）。
- peninsula-10000-audit-peninsula-001：fail 0（无），warn 0（无）。
- peninsula-10000-audit-peninsula-002：fail 0（无），warn 0（无）。
- peninsula-10000-audit-peninsula-003：fail 0（无），warn 0（无）。
- peninsula-50000-audit-peninsula-001：fail 0（无），warn 0（无）。
- peninsula-50000-audit-peninsula-002：fail 0（无），warn 0（无）。
- peninsula-50000-audit-peninsula-003：fail 0（无），warn 0（无）。
- peninsula-100000-audit-peninsula-001：fail 0（无），warn 0（无）。
- peninsula-100000-audit-peninsula-002：fail 0（无），warn 0（无）。
- peninsula-100000-audit-peninsula-003：fail 0（无），warn 0（无）。
- pangea-10000-audit-pangea-001：fail 0（无），warn 0（无）。
- pangea-10000-audit-pangea-002：fail 0（无），warn 0（无）。
- pangea-10000-audit-pangea-003：fail 0（无），warn 0（无）。
- pangea-50000-audit-pangea-001：fail 0（无），warn 0（无）。
- pangea-50000-audit-pangea-002：fail 0（无），warn 0（无）。
- pangea-50000-audit-pangea-003：fail 0（无），warn 0（无）。
- pangea-100000-audit-pangea-001：fail 0（无），warn 0（无）。
- pangea-100000-audit-pangea-002：fail 0（无），warn 0（无）。
- pangea-100000-audit-pangea-003：fail 0（无），warn 0（无）。

## 下一步建议

当前矩阵全部通过。下一步可刷新 source full 矩阵，或进入 source 后段命名、军事、区域、marker 细节补齐。
