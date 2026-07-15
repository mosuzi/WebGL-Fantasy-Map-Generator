# PNG 裁剪与 overlay 导出契约

本文记录权威任务第 44 项的稳定参数、默认兼容边界与验收证据。

## 裁剪契约

`api.data.exportPNG(options)` 与导出面板共用 `map-file-io.js` 的规范化和合成流水线。`options.crop` 支持：

- `viewport`：导出当前画布视口；这是默认值。
- `map`：临时适配地图全幅后导出，完成或失败后恢复用户相机。
- `pixel`：使用相对当前 CSS 画布的 `{x, y, width, height}` 像素矩形。
- `world`：使用地图世界坐标的 `{x, y, width, height}` 矩形；导出视角会按矩形中心和长宽比临时适配。

像素与世界坐标矩形必须包含四个有限数值，宽高必须大于零，且整体位于画布或地图范围内。空矩形、越界矩形、无效画布和缺少可用 renderer 的世界坐标请求都会明确拒绝，不会静默裁剪或留下改变后的相机。

返回结果中的 `crop` 同时包含规范化模式、请求边界和最终 backing-store `pixelRect`；PNG 文件 IHDR 尺寸必须等于 API 返回的 `width / height`。

## overlay 白名单

`options.overlays` 只识别以下稳定键：

- `labels`：国家、城市和自定义标签。
- `cityIcons`：城市图标。
- `markers`：资源与通用标记。
- `military`：军事图标。
- `measurements`：保存或正在编辑的测量线、面和点。
- `legend`：地图图例。
- `scaleBar`：地图比例尺。

`includeMapOverlays: false` 是总开关，会强制关闭全部白名单类别。未提供细分选项时保持旧行为：标签、城市图标、标记、军事、图例和比例尺开启；测量关闭，因为旧 PNG 流水线没有合成测量 SVG。未知键会被忽略，不会扩展 DOM 查询范围。

## UI 与 API

导出面板提供当前视口、地图全幅、像素矩形和世界坐标矩形四种模式，以及矩形坐标输入和七类 overlay 开关。UI 只负责读取控件并组装同一 API 参数，不维护第二套裁剪或合成逻辑。

世界坐标导出会临时更新 renderer camera、同步重建动态线层和 DOM overlay、读取 WebGL 像素，再在 `finally` 中恢复原相机与画面。像素裁剪按 CSS 画布到 backing store 的比例换算源矩形，随后再应用 `1x～4x` 输出倍率。

## 验收证据

- `pnpm run regress:png-options`：覆盖默认兼容、倍率夹取、四种裁剪模式、空范围 / 越界拒绝、世界相机计算、透明边界、overlay 白名单和源像素到输出像素的精确合成断言。
- `pnpm run regress:png-crop-browser -- --browser-channel chrome`：系统 Chrome 生成 3015 / 1753 个 grid / pack cells 的固定地图并完成真实下载。默认 PNG 为 `1440×900`；`320×180` 像素矩形按 2x 导出为 `640×360`；世界坐标边界原样返回，导出后相机恢复为 `1 / 0 / 0`。
- 同尺寸 `640×420` 文件中，无 overlay 为 `45,630 bytes`，仅标签为 `61,122 bytes`，仅测量为 `49,311 bytes`；文件均通过 PNG 签名和 IHDR 校验。越界请求返回“PNG 像素裁剪矩形超出有效范围”，console / page error 均为 0。
- `pnpm run build:app` 与 `git diff --check` 通过。
