# FMG WebGL 地图生成器

这是一个参考 [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator) 的生成流程、数据结构和视觉表现，重新实现的独立 WebGL 地图生成器。

本仓库中的 `source/Fantasy-Map-Generator` 仅作为只读参考实现和行为对照；新的应用代码位于 `app/webgl-generator`，渲染核心使用 WebGL2 canvas，编辑面板使用 Vue SFC 和普通 DOM 浮动面板。

## 当前已实现

- WebGL2 地图主画布，支持缩放、拖拽、对象悬停和对象选择。
- 独立生成链路：grid / pack、地形、水陆 feature、气候、河流、生物群系、文化、宗教、国家、省份、区域、城镇、道路、资源点、经济、外交、军事和 zone。
- 多视图着色：高度、温度、降水、生物群系、文化、宗教、外交、国家、省份、区域和人口。
- 用户图层控制：道路、河流、城市、资源点、标记、标签、国家名称、国界、省界、水陆线和比例尺。
- 地图信息叠层：悬停信息、温度/降水/外交图例、比例尺、生成加载提示和地图尺寸摘要。
- Vue 浮动面板：控制面板、高度编辑、国家编辑、省份管理、城市管理、文化管理、宗教管理、外交管理、路线管理、河流管理、资源标记和标签管理。
- 局部编辑与撤销/重做：高度、国家归属、省份归属、对象命名、颜色、首都、城市人口、城市/marker 视觉、标签和外交关系等。
- 管理 tab 中的受约束重新生成：国家、省份、城镇、道路、河流、资源点和外交。
- 本地文件能力第一刀：导出 PNG 图片、导出完整地图 JSON、导出 pack cell GeoJSON，并可从完整地图 JSON 重新导入复原当前地图。
- 开发模式：通过 `?debug=1` 或 `window.__webglGeneratorDebug.enabled = true` 打开，用于查看生成耗时、WebGL 统计、picking 统计和内部状态。

## 计划实现

- 组件库迁移：优先评估 Element Plus，采用按需导入和分批迁移，避免全量引入导致产物过大。
- 文件能力完善：图片导出合成 DOM 标签与图例、完整地图数据压缩、GeoJSON 范围/分层导出、导入格式兼容和错误诊断。
- 灰度高度图导入：读取本地灰度图，映射为高度，并逐步接入地形、河流、气候和语义系统重算。
- 更完整的导出格式：GeoJSON、后续可能的 SVG / 数据格式兼容。
- 更细的 source 语义对齐：贸易、军事、zone、marker 和命名系统继续向原项目行为靠拢。
- 中文命名优化：增加春秋古国风短名和单字国名策略，减少相邻国家同根名加方位词的重复感。

## 本地运行

```powershell
pnpm install
pnpm run dev
```

默认开发服务器地址：

```text
http://127.0.0.1:5410
```

打开开发模式：

```text
http://127.0.0.1:5410/?debug=1
```

或在浏览器控制台中执行：

```js
window.__webglGeneratorDebug.enabled = true;
```

## 常用命令

```powershell
pnpm run build
pnpm run profile:e2e -- --browser-channel chrome
pnpm run regress:rendering
```

## 项目约束

- 不修改 `source/` 原项目源码；它只作为参考实现、性能基线和行为对照。
- 新项目代码、文档和工具放在仓库根目录、`app/`、`docs/` 或 `tools/` 下。
- 当前页面主要面向现代 PC 浏览器；平板尽量不破版，短期不为手机窄屏牺牲桌面信息密度。
- UI 面板长期使用普通 HTML/DOM 浮动面板，不使用 canvas 绘制面板。
