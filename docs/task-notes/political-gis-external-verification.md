# 政治面外部 GIS 与 100k 浏览器验证

本文档记录权威任务第 43 项的固定验收。代表样本为 `seed = political-gis-browser-100k`、`cellsTarget = 100000`、`continents`，实际生成 `99846` 个 grid cells 和 `69624` 个 pack cells。

## 浏览器导出

`regress:political-gis-browser` 在系统 Chrome 中生成固定地图，分别调用与 UI 共路径的 `api.data.exportFeatureGEO()` 下载普通与 dissolve 政治面。两次均选择国家、省份、地区三层并关闭其它要素层。

| 模式 | 文件大小 | API 导出调用 | 最大 longtask | 下载后双 RAF 恢复 | 图层数 |
|---|---:|---:|---:|---:|---:|
| 普通 | 14,865,030 bytes | 513ms | 515ms | 9.7ms | 国家 20 / 省份 586 / 地区 5 |
| dissolve | 1,669,558 bytes | 440.6ms | 443ms | 10.7ms | 国家 20 / 省份 586 / 地区 5 |

两次下载事件、文件落盘、JSON 解析、611 个 feature bbox、MultiPolygon、对象 id、`numericId`、`dissolved` 和地区 `attacker / defender` 字段均通过；导出后 API 保持响应，console error 和 page error 均为 0。health 如实保留 100 条最近事件，其中导出对应 longtask 为 warn，不把同步序列化阻塞伪装成无卡顿。

本地可复现产物和报告位于：

- `docs/generated/gis/political-100k/political-100k-raw.geojson`
- `docs/generated/gis/political-100k/political-100k-dissolved.geojson`
- `docs/generated/reports/political-gis-browser-regression-results.json`
- `docs/generated/reports/political-gis-browser-regression-results.md`

## QGIS 3.44.12 LTR

本机原先没有 QGIS。验收使用 QGIS 官方 `3.44.12-Solothurn` MSI 的管理提取目录，没有注册系统安装；实际组件为 QGIS 3.44.12、GDAL/OGR 3.13.1、PROJ 9.8.1 和 GEOS 3.14.1。

首次读取发现政治三层的数值 `properties.id` 会被 GDAL 选作 FID，国家、省份和地区从 1 重新编号会触发重复 FID 自动改号警告。实现已修正为全局唯一字符串 `id = state-1 / province-1 / zone-1`，同时新增数值 `numericId` 保留原领域 id。

修正后 `regress:political-gis-qgis` 通过 QGIS `native:savefeatures` 实际读入普通与 dissolve GeoJSON 并各自转存 GeoPackage：两者均为 611 个 Multi Polygon，读取 / 转存告警为 0；字段表包含字符串 `id`、整数 `numericId`、`layer`、`attacker`、`defender` 和 `dissolved`。报告位于 `docs/generated/reports/political-gis-qgis-regression-results.json`。

运行时需传入 QGIS 入口，例如：

```powershell
pnpm run regress:political-gis-qgis -- --qgis-process "<QGIS bin>\qgis_process-qgis-ltr.bat"
```

## geojson.io

将修正后的 dissolve 产物实际粘贴到 `https://geojson.io/` 的 JSON 编辑器后，网站成功解析并启用 Export；地图与要素编辑器识别 MultiPolygon，页面可见 `FeatureCollection`、`id = state-1`、`numericId = 1`、`layer = state` 与 `dissolved = true`。该验证使用 1.67MB 的代表性 dissolve 文件；普通 14.87MB 文件的同构 schema 已由浏览器文件解析和 QGIS 实际读取覆盖。

## 结论

国家、省份、地区三层在普通与 dissolve 输出中数量一致；bbox、dissolved 和地区参与方字段保留。QGIS 的重复 FID 兼容问题已修复，修正后 QGIS 与 geojson.io 均可读取代表性产物。本项只记录实测同步导出长任务，不在封闭范围内改造成 worker 导出；若后续要消除 600～800ms 主线程阻塞，应进入新的性能任务。
