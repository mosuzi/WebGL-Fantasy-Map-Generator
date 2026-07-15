# API 数据兼容与往返矩阵

## 目的与边界

本文档冻结权威任务第 32 项的数据范围。目标是让当前已经存在的持久化入口都可通过公共 action / API 调用，并用固定旧样本和当前样本证明完整地图迁移、导出、再导入不会丢失关键数据。

本项只复用已有完整地图诊断，并保证 API 错误包含 `code / stage / suggestion`。普通 GEO、FMG Cells GEO 和高度图的分类型中文诊断、隐私摘要及未来 schema 链式注册仍属于权威任务第 42 项，不在本项提前实现。

## 持久化入口矩阵

| 数据入口 | 当前核心路径 | 第 32 项 API 结论 | 兼容 / 失败约束 |
|---|---|---|---|
| 完整地图 JSON / gzip | `parseMapDocumentPayload -> migrateMapDocument -> loadMapIntoRuntime` | 保留 `data.importMap` | v1 必须迁移到 v2；坏输入保留当前地图和最近诊断 |
| 完整地图 JSON / gzip 导出 | `createMapDocument -> stringifyMapDocument / gzip` | 保留 `data.exportMap / exportCompressedAll` | 导出不得原地改写运行时 map；再导入等价 |
| 浏览器存档保存 / 恢复 | `createMapDocument / stringifyMapDocument` 与存档 envelope | 新增 `data.saveBrowserMap / restoreBrowserMap` | 兼容旧的裸 JSON LocalStorage 和当前 envelope；显式恢复必须确认 |
| 高度图图片 | `create*HeightmapFromImage -> generateMapOffMainThread -> loadMapIntoRuntime` | 新增 `data.importHeightmap` | 生成当前 schema 地图；替换失败恢复旧 map / 历史 / renderer |
| 最近一次完整地图导入诊断 | `createMapImportDiagnostic / stringifyMapImportDiagnostic` | 新增 `data.exportImportDiagnostic` | 无诊断时返回 noop；API 失败后诊断不得被事务回滚抹除 |
| 普通 GEO / FMG Cells GEO | `parseGeoJsonMeasurements` 或 `createImportFmgCellsHeightCommand` | 保留 `data.importGEO` | 继续走可撤销命令；详细分类型诊断留给第 42 项 |
| 名称库文档 | `parseNamebaseDocument` 与名称库命令 | 保留 `namebases.import / export` | 继续由既有名称库文档回归证明 |
| 备注 / 测量记录导出 | 现有序列化 helper | 保留 `data.exportNotes / exportMeasurements` | 只读，不改变地图或历史 |

## 最小验收证据

- 固定 `tools/fixtures/webgl-map-v1-minimal.json`：v1 导入、迁移为 v2、导出、再次导入后，typed array、备注、测量、隐藏标签、视觉主题和 seed 等价。
- 固定当前 v2 文档：导出、再次导入后 schema、typed array 和关键摘要等价，且导出不原地补写运行时对象。
- 浏览器存档：旧裸 JSON 与当前 envelope 都解码到同一地图文档；未知 envelope 版本 / 编码返回稳定错误。
- 坏输入：解析失败不提交替换事务；操作错误包含 `code / stage / suggestion`，最近一次完整地图导入诊断可以由 API 导出。
- 静态门禁：控制面板的高度图、浏览器保存和诊断导出入口与控制台 API 共用 `runtimeActions.data`，不再保留第二套业务写入。
