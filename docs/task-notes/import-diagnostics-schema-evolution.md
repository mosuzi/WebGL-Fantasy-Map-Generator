# 统一导入诊断与 schema 演进

本文档记录权威任务第 42 项的封闭契约。目标是让普通 GEO、FMG Cells GEO 和高度图共用可导出的中文诊断，同时把完整地图版本迁移从固定分支收束为显式逐版本 registry。

## 统一诊断外壳

诊断文档类型继续使用 `webgl-generator-map-import-diagnostic`，版本提升为 2。公共字段包括：

- `import.kind / label / status`：区分 `geojson`、`fmg-cells-geojson`、`heightmap` 与既有完整地图诊断，并记录成功或失败。
- `source / occurredAt / file`：只保存来源、时间、文件名、字节数、MIME 和推断格式。
- `summary`：普通 GEO 保存 Feature 数、几何类型计数、有效坐标对数与 bbox；Cells GEO 额外保存字段有效行、陆地 / 水域计数；高度图保存宽高、模式、fit、映射与 invert。
- `error`：失败时统一返回中文可操作的 `code / stage / suggestion`；成功时为 `null`。

诊断不会保存文件正文、GeoJSON properties、坐标数组或图片像素。JSON 语法错误只写通用中文消息，避免浏览器原始解析消息夹带正文片段；其它错误消息限制长度并移除换行。

UI 与 `api.data.importGEO / importHeightmap` 共用诊断记录。成功结果直接携带 `diagnostic`；失败将分类信息附加到 operation error，API 可读取 `code / stage / suggestion`，最近一次成功或失败诊断均可由 `api.data.exportImportDiagnostic()` 导出。

## 分类型门禁

- 普通 GEO：要求标准非空 `FeatureCollection`，统计几何类型并验证至少存在有限坐标；无法转换的几何进入 `invalid-geometry / validate-geometry`。
- FMG Cells GEO：以足量 Polygon 和 Cells 字段提示识别；至少 75% 且不少于 100 行同时具备 `id / height / biome / neighbors`，否则进入 `invalid-cells-fields / validate-fields`。
- 高度图：缺文件或不支持格式进入 `invalid-image-file / validate-image`，解码或像素读取失败进入 `image-decode-failed / decode-image`，生成 / 加载异常进入 `heightmap-runtime-error / import-runtime`。

导入解析和验证发生在命令写入之前；GEO 编辑命令失败沿统一执行器回滚，高度图替换继续由 map replace transaction 回滚。失败不会改写当前地图。

## schema 迁移 registry

`migrateMapDocument()` 继续支持 v1→v2 并验证当前 v2 schema。底层新增可注入的迁移 registry：

- 每个 migrator 只负责 `vN -> vN+1`，重复源版本注册直接拒绝。
- 每一步必须明确产出下一版本，跳版或漏改版本直接失败。
- 调用方可指定目标版本和最终 validator；缺少中间 migrator 时明确报错。
- 高于目标版本的未知未来文档继续拒绝，不猜测降级。

## 验收证据

- `regress:map-import-diagnostics` 覆盖三类成功、坏 JSON、空文档、Cells 字段错误、几何错误、图片解码错误、runtime error 结构、隐私哨兵和 API operation 分类透传。
- `regress:map-migration` 覆盖既有 v1→v2、当前 v2 幂等、模拟 v1→v2→v3 链、重复注册、缺失迁移器和未知未来版本拒绝。
- `regress:api-operation / api-data-compatibility / exports`、生产构建与差异检查继续守住失败回滚和既有导入导出兼容。
- 本项按快速迭代约定只执行代码回归，不单独启动浏览器。
