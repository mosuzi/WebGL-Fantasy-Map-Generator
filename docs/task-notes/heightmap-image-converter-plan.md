# 高度图图片导入工作台计划

本文记录对照原版 Image Converter 后，WebGL 版高度图导入后续应如何扩展。当前 WebGL 版已经支持本地灰度图导入、黑白反转、拉伸铺满/保持比例裁剪，并会把采样高度图进入完整生成链路。下一步不要把彩色图片识别直接塞进现有灰度函数，而应做一个可预览、可回退、可解释的导入工作台。

## 原版参考

入口：

- `source/Fantasy-Map-Generator/public/modules/ui/heightmap-editor.js`
- `source/Fantasy-Map-Generator/src/controllers/heightmap-selection.ts`
- `source/Fantasy-Map-Generator/public/heightmaps/import-rules.txt`

原版 Image Converter 的关键行为：

- 打开转换器会清空当前高度编辑预览，并要求用户加载图片。
- 图片先绘制到地图尺寸 canvas，再缩放到 `grid.cellsX / grid.cellsY` 的采样 canvas。
- 使用 `RgbQuant` 把图片量化为有限颜色，默认最大颜色数来自 `convertColors`。
- 每种颜色先进入未分配列表，用户可以点击颜色或地图上的对应色块，再点击 0-100 高度色带手动赋值。
- 自动赋值有三类：
  - 按亮度：暗色优先压到水域高度，其他按 Lab 亮度近似高度。
  - 按色相：按 hue 与蓝色附近的距离区分水域和陆地。
  - 按 FMG 色带：与当前生成器高度色带 exact match 或最近 hue 匹配。
- 完成时把已赋值 polygon 的 `data-height` 写回 `grid.cells.h`；未赋值颜色会视为海洋或高度 0。
- 原版这是高度编辑器内部工具，完成后仍需退出高度编辑以重建下游派生。

当前 WebGL 版不应照搬 DOM polygon 预览，也不应只改 grid 高度后留下旧河流、国家和城市；应用导入结果时仍应复用现有完整重生成链路。

## 当前状态

已完成：

- `createGrayscaleHeightmapFromImage()` 读取本地图片，按画布尺寸采样亮度。
- 支持 `stretch / crop` 两种适应方式。
- 支持亮度最小/最大归一化、用户高度区间和反转。
- 导入结果进入 `createSampledHeightmap()`，并触发完整地图重新生成；默认灰度仍走连续灰度采样，彩色映射和手动覆盖会走 `kind = image-palette`。
- 高度编辑面板已提供独立“高度图导入工作台”：选择图片后先显示 canvas 预览、图片尺寸、目标图幅、亮度范围和高度映射，点击“应用到地图”后才触发完整重生成。
- 高度图导入重生成已复用普通生成的 worker 路径，避免把完整派生链路留在主线程同步执行。

缺口：

- 当前预览仍没有直方图、采样格高度色带预览或应用前后对比。
- 色板已经可量化、自动估高、手动覆盖并参与 `image-palette` 最终高度采样。
- 手动覆盖还没有批量选择、未分配颜色策略和 profile 导入导出。
- 未分配颜色目前固定为高度 `0`，还没有用户可配置入口。
- 导入方案已写入完整地图 JSON 的 `map.heightmap.source`，但还没有独立 profile 导入导出。

## 数据契约建议

在 `map.heightmap.source` 中追加：

```js
{
  template: "image-import",
  kind: "image-grayscale" | "image-palette",
  filename: "local.png",
  width: 1024,
  height: 512,
  fitMode: "stretch" | "crop",
  mappingMode: "grayscale" | "luminance" | "hue" | "fmg-scheme" | "manual",
  colorLimit: 64,
  unassignedHeight: 0,
  assignments: [
    {color: "#3f7fb8", height: 12, pixels: 3041},
    {color: "#8f9d53", height: 42, pixels: 920}
  ],
  normalization: "image-min-max" | "palette-assignment"
}
```

运行态可以保留更详细的预览状态，但完整地图数据只保存足够复现导入结果的元数据；原始图片不直接塞进地图 JSON，避免文件膨胀。

## 分阶段实现

### 阶段 1：导入预览面板（已完成第一刀）

目标：

- 新增懒加载浮层“高度图导入工作台”。
- 选择图片后先显示预览，不立即生成新地图。
- 复用现有文件输入、最小/最大高度、反转和适应方式。
- 展示图片尺寸、目标图幅尺寸、亮度范围和预估高度范围。

约束：

- 预览面板不写 `map`。
- 可以先用 canvas thumbnail 和亮度直方图，不做彩色量化。

验收：

- 选择灰度图后能看到预览和统计。
- 点击取消不会改变当前地图 checksum。
- 点击应用后沿用当前灰度导入闭环。

当前落地状态：

- 入口位于高度编辑浮层中的“打开导入工作台”，不再平铺在生成 tab 或高度编辑主体里。
- 工作台是独立可拖动浮层，选择文件后只更新预览和统计，不写 `map`。
- 应用后继续沿用现有灰度导入闭环，`map.heightmap.template = grayscale-import`，并完整重建地图。
- 取消或关闭工作台不会改变当前地图；本阶段暂未实现亮度直方图。

### 阶段 2：轻量色板量化

目标：

- 对采样后的图片做轻量颜色聚类，得到至多 `16 / 32 / 64 / 128` 个色块。
- 每个色块展示颜色、像素数、当前高度或未分配状态。
- 点击色块可以高亮预览中对应区域。

实现建议：

- 先不要引入重库；可用 5-bit 或 6-bit RGB 直方图分桶，按像素数取前 N 色，再用最近色归并。
- 若效果不足，再评估轻量 quantizer 动态导入，避免抬高首屏包。

验收：

- 彩色高度图能生成稳定色板。
- 色板数量可调，重新量化不会写地图。

当前落地状态：

- 工作台新增 `16 / 32 / 64 / 128` 色板上限选择。
- 预览 canvas 会基于当前缩略采样图做 5-bit RGB 直方图分桶，按像素数生成轻量量化色板。
- 色板展示颜色、像素占比和按当前高度区间估算的高度值。
- 点击色块只高亮预览中的对应采样区域，不写 `map`，不触发重新生成。
- “应用到地图”仍沿用现有灰度导入闭环；彩色色板暂不参与最终高度采样。

### 阶段 3：自动高度映射

目标：

- 提供四种映射模式：
  - 灰度：沿用当前亮度归一化。
  - 亮度：参考原版 Lab L 逻辑，暗色进入水域区间，其余近似映射到 0-100。
  - 色相：参考原版 hue 与蓝色附近距离，把蓝色系倾向水域，绿黄棕倾向陆地。
  - FMG 色带：按当前高度色带或 WebGL 版高度色带寻找最近色。
- 用户可调整未分配颜色高度，默认 `0`。

约束：

- 自动映射必须生成可查看、可手动修改的 assignments，而不是黑箱直接应用。
- 高度值仍限制在 `0-100`，海平面语义保持 `<20` 为水域。

验收：

- 同一张图片在同一模式下映射结果稳定。
- 自动映射后色板全部进入已分配或明确未分配。

当前落地状态：

- 工作台新增“映射模式”，支持 `灰度 / 亮度 / 色相 / FMG 色带 / 手动`。
- 色板高度不再只用灰度估算，会按当前映射模式计算 `autoHeight`，并继续受最低/最高高度区间约束。
- 色相模式会把蓝色系压向水域，绿黄棕等陆地色推向低地、丘陵和山地；FMG 色带模式按 WebGL 版高度色带最近色匹配。
- 手动模式下未覆盖色块默认为 `0`，用于显式暴露未分配颜色。
- 当映射模式不是默认灰度，或存在任一手动覆盖时，`应用到地图` 会消费这些 assignment 并生成 `image-palette` sampled heightmap。

### 阶段 4：手动修正与应用

目标：

- 允许用户选中色块并设置高度。
- 支持批量把选中色块设为水域、低地、丘陵、山地或峰值。
- 点击应用后生成 `kind = image-palette` 的 sampled heightmap，并完整重建 feature、climate、biome、pack、river、politics 和 settlements。

验收：

- 手动改色块高度后预览同步变化。
- 应用后 `map.heightmap.source.assignments` 保留色块、高度和像素数。
- 导出完整地图 JSON 再导入，能保留导入元数据。

当前落地状态：

- 选中色块后会出现“色块高度”赋值面板，可用滑条精确设置 `0-100` 高度。
- 支持把当前色块一键设为 `水域 / 低地 / 丘陵 / 山地 / 峰值`，也可恢复自动高度。
- 手动覆盖会立即刷新色板显示和预览高亮；点击应用后会进入 `map.heightmap.source.assignments`，记录色块、自动高度、最终高度、像素数和是否手动。
- `createPaletteHeightmapFromImage()` 会在完整图幅 canvas 上重新量化前 N 个色块，使用工作台传入的手动覆盖，未进入前 N 的颜色按未分配高度 `0` 处理。
- `image-palette` 和默认灰度导入都会把采样高度缓存为可结构化克隆的 `Uint8Array`，导入重生成通过 `generation-worker` 恢复 sampled heightmap，避免在主线程同步跑完整生成链。

### 阶段 5：预设与复用

目标：

- 支持把一套 assignments 导出为 `.heightmap-import-profile.json`。
- 支持把 profile 应用到同类色带图片。
- 可选支持原版 FMG colored heightmap 导出图的专用识别。

暂缓：

- 3D 地形预览。
- OBJ / height texture 导出。
- 自动识别真实 DEM 或地理投影。
- 把原始图片嵌入地图文件。

## 验证矩阵

最小验证：

- 灰度低对比图：预览、应用、反转和 crop 均正常。
- 原版 colored heightmap 风格图片：FMG 色带模式能把海洋、低地、山地分开。
- 普通彩色地形图：色相模式至少能粗分水域和陆地。
- 手动修正：修改一个色块高度后应用，采样点高度确实变化。
- 取消预览：checksum 不变。
- 完整导出导入：`map.heightmap.source` 元数据保留。

性能守门：

- 预览量化在现代 PC 浏览器中应低于 `100ms` 级别；大图先缩放到目标采样 canvas 后再统计。
- 色板和预览面板必须懒加载，不进入首屏主入口。
