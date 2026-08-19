# 第 349-7 阶段：markers presentation / layer / picking 垂直切片

## 范围

本阶段只收敛 marker 的只读 presentation source、panel query、point layer、picking identity 与 Feature GeoJSON 导出。marker command / history、资源经济、资源重生成和外层 Worker 编排保持既有实现，因此 `markersManifest.status` 继续为 `shadow`，不得把投影切片完成误报为整域 active。

## 同源契约

`markerPresentationRecords(map)` 是 marker 投影的共享枚举入口，保持 canonical 顺序并跳过空槽。以下消费者统一使用它：

- WebGL point layer 与 DOM marker icon；
- direct object picking index 与无索引 pick；
- picking DTO 的 canonical id 回绑；
- Feature GeoJSON marker features 与 marker count；
- TypeScript `createMarkersPresentationRuntime` 的 detached `list / get`，以及 marker panel。

TypeScript runtime 只通过 getter-only `MapCoreEngine.readCanonical` 读取唯一 `state.map`，不缓存 canonical 引用、不产生 operation / commit，也不推进 map revision。面板保留 map 仅用于国家 / 省份 / note 等关联解析，marker rows 本身来自 detached snapshot。

## 验收

- `regress:markers-core`：固定 1k 的 marker 为 `8`，point draw、direct picking、DTO picking 与 Feature GeoJSON 均为同一 `8` 个 id；query snapshot 冻结且 core operations / commits 为 `0`。
- `typecheck:core`、core Manifest、marker panel icon、selection marker policy、10k render preparation 与辅助对象创建通过。
- production build 通过，`1370 modules`；版本 `0.5.19`。
- `regress:api-exports` 实际包含浏览器运行，误触发后因既有 operation-stall 首败停止；不纳入验收、不复跑。有效浏览器验收为 `0`。

## 延后

- marker command / history 与 notes / economy 跨域 write-set：后续领域迁移阶段。
- marker 资源重生成 binding / lock / replacement：与统一 regeneration / dependency 阶段一起处理。
- 真实视觉、缩放、遮挡、icon 与点击命中验收：仅在 `349-11` 形成方案，本任务不执行。
