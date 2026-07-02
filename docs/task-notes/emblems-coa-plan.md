# 纹章与 Coat of Arms 计划

## 背景

当前 WebGL 版有国家、省份、城市颜色和 marker 图标，但没有原版 FMG 的纹章生成、显示、编辑、图库和导出链路。纹章系统牵涉国家、省份、城市三层对象、文化盾形、继承生成、SVG 渲染、上传下载和外部 Armoria 编辑器，属于远期复杂系统。

原版入口：

- `source/Fantasy-Map-Generator/src/generators/emblems/*`
- `source/Fantasy-Map-Generator/src/renderers/emblems`
- `source/Fantasy-Map-Generator/src/renderers/draw-emblems.ts`
- `source/Fantasy-Map-Generator/public/modules/ui/emblems-editor.js`

## 原版行为摘录

- `COA.generate(parent, kinship, dominion, type)` 会根据父纹章、亲缘度、统治关系和对象类型生成新纹章。
- 纹章数据包含底色 `t1`、盾形 `shield`、分割 `division`、普通图形 `ordinaries`、图记 `charges` 和 `custom` 标记。
- 国家、省份和城市都有自己的 `coa`，省份/城市可以从上级纹章派生。
- 文化编辑器可以影响文化的默认盾形。
- `draw-emblems.ts` 会为 state / province / burg 三层生成 `<use>`，并按各层 font-size / data-size 控制显示尺寸。
- 纹章编辑器支持切换对象、改盾形、改尺寸、移动位置、重新生成、上传图片/SVG、下载 SVG/PNG/JPG、下载图库、定位所属区域和打开 Armoria。
- 导出 SVG 时会把当前显示的 emblem defs 一起复制到导出结果中。

## WebGL 版建议边界

第一阶段不要直接移植完整 COA 生成器和编辑器。理由：

- 原版纹章渲染依赖 SVG symbol 和 defs；WebGL 版需要决定是用 SVG overlay、离屏 raster cache，还是 WebGL texture atlas。
- 完整生成器的 charge / division / ordinary 数据量较大，不应进入首屏主包。
- 上传图片/SVG 和外部 Armoria 集成都有安全、大小和持久化问题，应后置。

## 阶段计划

### 阶段 1：数据占位与只读显示

- 在 `map.visuals` 或对象自身保留 `coa` 字段契约，但默认不生成复杂纹章。
- 国家/省份/城市详情面板显示“纹章：未启用 / 已有自定义纹章”摘要。
- 完整地图 JSON 保留已有 `coa` 字段，避免未来导入时丢数据。

验收：

- 无纹章时不增加首屏资源。
- 导入含 `coa` 字段的地图不会丢失字段，即使暂不渲染。

### 阶段 2：轻量纹章图层

- 新增“纹章”图层，先只支持简单 SVG overlay：国家、省份、城市三类可分层显示。
- 对已有 `coa` 数据渲染简化盾牌，无法解析的 custom 纹章显示占位图标。
- 纹章点击能选中对应国家、省份或城市。

验收：

- 纹章图层默认关闭，开启时按需加载渲染模块。
- 图标点击区域完整，不只响应可见像素。

### 阶段 3：生成器按需移植

- 把原版 `generators/emblems` 中的数据表和生成器拆成懒加载 chunk。
- 先支持国家纹章生成，再支持省份/城市从父纹章派生。
- 生成结果写入对象 `coa`，并进入 EditHistory。

验收：

- 重新生成单个纹章不改变其他对象。
- 完整地图导出再导入后，纹章数据和显示一致。

### 阶段 4：纹章编辑与导出

- 面板支持改盾形、尺寸、位置、重新生成、下载单个 SVG/PNG。
- 上传自定义 SVG/图片和 Armoria 集成后置，需要先限制文件大小和安全清洗。
- PNG 导出可选择是否合成纹章图层。

验收：

- 编辑器关闭/取消不会留下临时 defs 或贴图。
- 自定义纹章不会进入首屏资源，也不会破坏完整地图 JSON 体积控制。

## 暂缓项

- 完整 Armoria 外部编辑集成。
- 批量图库下载。
- 所有 heraldry 细节和原版 SVG 100% 视觉一致。
- 把纹章纳入外交、军事旗帜和城市图标体系。先把独立纹章链路做稳。
