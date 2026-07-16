# 视觉主题与样式预设计划

> 状态校准（2026-07-16）：内置主题、用户主题导入导出、颜色级编辑、跨层 token、PNG 和完整地图持久化均已完成；纹理、字体和高级后处理继续暂缓。

## 背景

当前 WebGL 版主要依赖固定渲染风格、视图色彩模式和少量图层开关。原版 FMG 有完整的样式系统，包含系统预设、自定义预设、纹理、滤镜、字体、线宽、透明度、晕影、比例尺、标签和高度色带等。该系统直接服务 SVG DOM，不能原样搬到 WebGL 版。

原版入口：

- `source/Fantasy-Map-Generator/public/modules/ui/style-presets.js`
- `source/Fantasy-Map-Generator/public/modules/ui/style.js`
- `source/Fantasy-Map-Generator/public/styles/*.json`

## 原版行为摘录

- 系统预设包括 `default`、`ancient`、`gloom`、`pale`、`light`、`watercolor`、`clean`、`atlas`、`darkSeas`、`cyberpunk`、`night`、`monochrome`。
- 预设 JSON 以 SVG selector 为 key，例如 `#map`、`#stateBorders`、`#provinceBorders`、`#landmass`、`#texture`、`#terrs`。
- 预设值是 SVG attribute 或 DOM attribute，例如 `stroke`、`stroke-width`、`opacity`、`filter`、`mask`、`fill`、`scheme`、`terracing`、`data-href`。
- 自定义预设保存在 `localStorage`，key 前缀为 `fmgStyle_`，可保存、下载、上传。
- 高度图色带可用内置 d3 sequential scheme，也可用逗号分隔颜色创建自定义 scheme。
- 改预设后会刷新 SVG 元素、标签、城市图标、比例尺和 filter。

## WebGL 版不能直接照搬的点

- WebGL 主画布没有 `#stateBorders`、`#landmass` 等 SVG selector，渲染参数应进入 renderer style uniforms、buffer 构建参数或 overlay 组件 props。
- SVG `filter / mask / texture image` 在 WebGL 中需要 shader、纹理或后处理支持；第一阶段不应承诺完整复刻。
- 原版预设 JSON 里有大量 SVG DOM 细节，直接支持会锁死新渲染架构。
- 文字、标签、比例尺、HTML 浮层和 WebGL cells 属于不同渲染层，主题需要跨层 token，而不是单一 DOM attribute 表。

## 建议数据契约

新增 `map.visualTheme`，完整地图 JSON 保存当前选择和少量用户覆盖：

```json
{
  "version": 1,
  "preset": "default",
  "overrides": {
    "water": {"fill": "#7db5d8"},
    "land": {"fill": "#dfe8c8"},
    "borders": {"state": "#425066", "province": "#6e7888"},
    "labels": {"primary": "#16212a"},
    "scaleBar": {"foreground": "#ffffff", "background": "rgba(12,18,22,0.74)"}
  }
}
```

内置主题建议放在 `app/webgl-generator/src/renderer/themes.js` 或后续独立 JSON：

- `id / name / description`
- `canvas.background`
- `terrain.heightRamp`
- `water.fill / coast.stroke`
- `political.stateBorder / provinceBorder`
- `routes.road / trail / searoute`
- `labels.primary / halo`
- `overlay.panel / scaleBar / legend`

## 阶段计划

### 阶段 1：只读主题预设

- 先提供 4-6 个轻量主题：默认、古地图、浅色图册、暗海、单色、夜间。
- 控制面板新增“视觉”或“主题”入口，只选择内置主题，不提供细粒度编辑。
- renderer 根据 theme token 设置背景、基础地形色、水色、边界、道路、标签和比例尺配色。
- 主题选择写入用户偏好和完整地图 JSON。

验收：

- 切换主题不改变地图生成数据和 checksum。
- PNG 导出包含当前主题下的画布、比例尺和摘要。
- 主入口资源增量可控；内置主题 token 应是小对象，避免引入大图片纹理。

当前进展：

- 已新增 `renderer/themes.js`，提供默认、古地图、浅色图册、暗海、单色、夜间六个只读主题。
- 控制面板“视图”页新增“视觉主题”下拉，主题选择写入全局偏好。
- renderer 已接入主题背景、水色和高度色带；切换主题只刷新渲染 surface，不改变生成数据和 checksum。
- renderer 已接入海岸线、湖岸线、国界、省界和三档道路颜色 token；切换主题会刷新线层和道路动态 buffer。
- DOM overlay 已接入城市标签、国家标签、手工标签和比例尺 token；renderer 会把主题颜色写入 `.map-stage` CSS 变量，样式和 PNG overlay 合成继续读取 computed style。
- 地图图例已接入背景、边框、标题、刻度、条目文字和 swatch 边框 token；温度 / 降水渐变条与政体 / 外交 swatch 仍保持语义色。
- PNG 导出已合成可见比例尺和地图图例，导出时读取当前 computed style，因此主题下的固定地图 UI 颜色会进入图片文件。
- 六个内置主题已补入 `effects.canvasFilter`，切换主题时通过 `#map-canvas` 的 CSS filter 作用于整张 WebGL 地图，让国家色块、地形、水域和线层都进入主题整体色调；PNG 导出会在绘制 overlay 前把同一滤镜应用到导出画布。
- 完整地图 JSON 会保存 `map.visualTheme.preset`、`map.options.visualTheme` 和 `options.visualTheme`；重新导入后会恢复主题选择。
- 构建产物浏览器烟测确认切换 `night` 后 stage 背景、renderer token、线层 token、标签 / 比例尺 token、图例 token 和偏好同步变化，导出 / 导入地图 JSON 后仍恢复 `night`，渲染数据签名不变，`glError = 0`；PNG 文件级烟测确认夜间主题下比例尺线与图例背景已写入导出图片。

阶段状态：第一阶段只读预设及跨层 token 已完成；阶段 2、3 也已按下述封闭范围完成。纹理、字体和高级后处理仍留在阶段 4，不作为当前待办。

### 阶段 2：主题导入导出

- 支持导出当前主题 JSON。
- 支持导入轻量 WebGL 主题 JSON，导入后作为用户主题加入列表。
- 导入校验只接受白名单字段和 token；未知字段、未知 token、非法版本、非法 id 或非 `#rrggbb` 颜色会拒绝整份文档，不改变当前主题。

验收：

- 导入无效 JSON 不影响当前主题。
- 用户主题随完整地图 JSON 保存，并可在重新导入地图后恢复。

完成记录：

- 新增版本 1 的 `webgl-generator-visual-theme` 文档，固定 `id / label / base / colors` 契约和八个可编辑颜色 token；内置主题导出时会生成新的用户主题文档。
- 用户主题 registry、控制面板和 `layers.listThemes / exportTheme / importTheme / createTheme / updateTheme / deleteTheme` 共用同一校验与运行时动作，并使用独立 LocalStorage 键保存用户主题。
- 完整地图 `visualTheme` 存储升级为版本 2，保存用户主题文档；旧版本 1 和缺少 `userThemes` 的早期版本 2 会补为空列表，非法用户主题拒绝导入。

### 阶段 3：颜色级编辑

- 在主题面板中提供少量可编辑 swatch：陆地、水域、国界、省界、道路、主要标签、比例尺。
- 复用现有共享颜色二级面板，避免为每个图层另写编辑器。
- 编辑进入 EditHistory 或主题专用历史栈。

验收：

- 修改颜色后无需重新生成地图，只触发 renderer 重绘或 overlay 更新。
- 撤销/重做能恢复主题 token。

完成记录：

- 控制面板复用 `UiColorActionPanel` 编辑陆地、水域、国界、省界、道路、主要标签、比例尺前景和比例尺背景；用户主题的创建、导入、颜色修改和删除均进入统一 `EditHistory`。
- 主题 token 同时驱动 renderer 地表与线层、DOM 标签 / 图例 / 比例尺，以及 PNG 的主题滤镜与 overlay 合成；同一用户主题修改时支持强制刷新，无需重新生成地图。
- `regress:visual-themes` 覆盖坏 JSON、未知字段 / token、非法颜色、历史撤销 / 重做、完整地图往返、旧数据迁移、存储恢复和跨层 token；PNG、地图迁移、API 契约和生产构建门禁同步通过。
- Chrome 文件页抽查确认用户主题可创建、将陆地改为 `#123456`、切换内置 / 用户主题并在高度视图看到实际地表颜色变化；刷新后 registry 保留，删除测试主题后再次刷新只剩六个内置主题。页面无本项错误，只有既有 React DevTools 扩展来源的 long-task 告警。

### 阶段 4：纹理、滤镜和高级效果

- 评估是否需要 WebGL 后处理或低分辨率纹理 overlay。
- 若实现纹理，应以可选、懒加载资源形式进入，不放进首屏主包。
- SVG filter 只作为视觉参考，不作为兼容目标。

## 暂缓项

- 完整兼容原版 `public/styles/*.json`。后续可做一次性转换工具，但不要作为运行时主格式。
- 复杂字体系统和所有标签组样式编辑。当前标签系统还在演进，先做全局 token。
- 大图纹理默认加载。页面加载性能优先于纸张纹理拟真。
