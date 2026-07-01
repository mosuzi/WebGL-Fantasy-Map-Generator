# 用户外壳、开发模式、导入导出和命名策略计划

## 背景

用户提出一组面向“可真正给用户使用”的外壳能力：

- 地图图层增加比例尺，直观展示当前地图比例。
- 不适合普通用户看的生成耗时、WebGL buffer、checksum、候选命中数等信息全部收敛进“开发模式”。
- 开发模式默认关闭，仅在 URL 带 `?debug=1` 或运行时响应式对象开启时显示；开发信息面板应是可拖动、可收起的浮动面板。
- 当前画布应尽量全屏展示，不再被常驻侧栏占据视野。
- 后续组件库优先考虑 Element Plus，但必须控制 tree shaking 和产物体积。
- 增加人类可读 README 和控制面板“简介”tab。
- 规划并逐步实现本地文件导出/导入、图片导出、完整地图数据导出、标准地理数据导出、灰度高度图导入。
- 改进中文国家命名，减少“东/西/北清河”这类相邻同根名，参考春秋诸侯国和古代单字国名策略。

## 调研结论

### Element Plus

- Element Plus 中文文档完整，官方安装页说明其支持最近两个版本浏览器，不支持 IE，符合当前“现代 PC 浏览器为主”的响应式目标。
- 官方快速开始页提供完整引入、自动按需导入和手动导入三种方式；自动按需导入推荐 `unplugin-vue-components` 和 `unplugin-auto-import`，手动导入可利用 ESM tree shaking，但样式需要 `unplugin-element-plus`。
- 本项目短期不应做一次性全量替换。建议先引入构建侧按需能力，然后从表单、按钮、tabs、select、slider、table、tree、dialog/popover 等最容易复用的基础组件开始迁移，并在每一批迁移后记录 bundle 体积变化。

当前状态：

- 已安装 Element Plus 与按需导入相关依赖。
- Vite 当前只启用 `unplugin-vue-components` + `ElementPlusResolver({importStyle: "css"})`，避免全局注册和整包样式。
- 已迁移 `UiButton` 作为样板，保持旧业务 API 不变。
- 已迁移第二批基础组件：`UiFilterInput -> ElInput`、`UiTextEditField -> ElInput`、`UiNumberField -> ElInputNumber`、`UiSortBar -> UiButton/ElButton`。
- 已迁移第三批基础组件：`UiSelectField -> ElSelect/ElOption`，保留隐藏原生 select 桥以兼容旧 runtime 读写 DOM id。
- 已迁移第四批基础组件：`UiTabs -> ElTabs/ElTabPane`，控制面板仍复用原 `activeTab` 切换逻辑。
- 已迁移第五批基础组件：`UiSliderField -> ElSlider`，保留隐藏原生 range 桥以兼容旧 runtime 读写 DOM id。
- 已迁移第六批基础组件：`UiSwitchField -> ElSwitch`，保留隐藏原生 checkbox 桥，按钮式图层开关继续支持整行点击。
- 当前第八批迁移后构建产物约 `986.31KB JS / 304.22KB gzip`、`155.39KB CSS / 23.02KB gzip`；相比第七批约增加 `+14.57KB JS gzip`、`+1.20KB CSS gzip`，后续继续迁移必须继续记录体积，并优先考虑面板级懒加载或拆包。
- 最新组合烟测已覆盖按钮、下拉、tabs、slider、switch、颜色盘和 segmented 的同页连续操作；`UiSegmented -> ElSegmented` 已保留 `[data-mode]` 桥。下一阶段应先处理懒加载/拆包方案，再考虑 `ElTable / ElTree / ElDialog`。

后续拆包守则：

- 表格、树、弹窗和大型编辑器不要直接静态引入到首屏控制面板；优先在对应浮层面板第一次打开时动态加载。颜色选择器已静态进入共享二级改色面板，当前 gzip 增量可接受，后续若颜色编辑扩展为复杂调色板再拆包。
- 继续避免 `app.use(ElementPlus)` 和整包 CSS；每批迁移后记录 `JS / CSS` 原始体积和 gzip 体积。
- 旧 runtime 仍通过 DOM id 读取的控件必须保留隐藏原生 input/select/checkbox 桥，直到相关读取链正式迁入 Vue state。
- 如果单批迁移让 JS gzip 增量超过 `20KB`，先停下来评估是否需要拆包或替代实现，再继续迁移。
- `UiObjectTable` 是下一个用户感知最强的候选，但不能直接静态替换为 `ElTable`；先用 `NotesPanel` 或 `NamebasePanel` 这类低风险浮层验证动态 import，再批量迁移对象面板，最后替换表格内核。
- `UiTreeDisplayPanel` 当前是可拖动浮层 + SVG 连线的图形总览，直接换成 `ElTree` 可能降低树状总览的视觉表达；应排在表格拆包之后再评估。
- 备注总览、名称库总览、路线、河流、标签和外交管理已经完成面板级动态 import：对应 SFC 均在首次打开时才加载，主入口 gzip 明显下降；但 `use-unit-preferences`、`UiSelectField`、`UiSliderField` 等共享 chunk 仍被首屏 preload，后续拆更多面板时要继续观察共享依赖是否能进一步切分。

参考：

- https://cn.element-plus.org/zh-CN/guide/installation
- https://cn.element-plus.org/zh-CN/guide/quickstart

### 春秋国名启发

- 春秋诸侯国存在大量简洁、辨识度高的单字国名，例如齐、晋、秦、楚、鲁、宋、卫、郑、陈、蔡、曹、滕、薛、邾、莒、郯、许、虞、虢、芮等。
- 周代诸侯国列表同时展示了重要诸侯国、小国和戎狄部族国名；这些名称的共同特点是短、古雅、根名差异强，和当前双字地名式国家根名不同。
- 生成策略不应简单复制历史国名，而应使用“古国字库 + 少量方位词 + 地理/文化后缀”的组合，形成类似“齐 / 东晋 / 南越 / 芮国 / 郯侯国”的短名体系。

参考：

- https://zh.wikipedia.org/wiki/周代諸侯國列表
- https://zh.wikipedia.org/wiki/十二诸侯年表

## 用户可见信息与开发信息清单

### 应保留为用户地图信息

- 地图画布、WebGL surface、路线、河流、城市、资源点、marker、标签、国界、省界、水陆线。
- 地图悬停信息卡：当前对象、cell、海拔、水域、国家/省份、文化/宗教、城市/路线等压缩摘要。
- 用户可理解的地图图例：温度、降水、外交图例；新增比例尺也属于地图信息。
- 加载状态气泡：生成中、正在生成地图数据、正在整理 WebGL 图层、正在刷新面板。
- 控制面板入口、生成/视图/单位/图层/管理/简介 tab。
- 对象管理和编辑浮动面板。

### 应收敛进开发模式

- `runtime-stats` 中的生成阶段、生成耗时、WebGL 加载、grid/pack cell 数、Voronoi 顶点、三角形、buffer 构建/上传/绘制耗时、WebGL error。
- `runtime-stats` 中的 checksum、随机预览、source/snapshot 依赖、生成日志、派生过期、对象索引、候选数量、动态 mesh 缓存、相机 offset/scale。
- `pick-stats` 中的命中距离、候选数、grid/pack id 等调试型选择信息。
- 政治视觉 mesh debug、renderer stats、profiling timing 和各类 stage timing。
- 管理区重新生成后的详细调试提示。普通用户只需要动作是否完成和必要约束，不需要内部 salt、耗时和派生链路。

### 边界信息

- 地图尺寸、比例尺、当前 seed、地形模板既可用于用户，也可用于开发。普通模式只展示“地图尺寸/比例尺/seed”这类高层信息；完整 timing 和 checksum 进开发模式。
- 当前视图、图层开关状态属于用户控制信息；完整 `layerVisibility` 字符串和 renderer 内部模式进开发模式。

## 阶段拆分

### 阶段 A：用户外壳与开发模式

目标：

- 移除常驻侧栏占位，让 `.map-stage` 默认全屏。
- 保留一个轻量地图工具入口，包括“控制面板”和可选“开发模式”按钮。
- 新增开发模式运行时对象，例如 `window.__webglGeneratorDebug`，提供响应式开关、打开/关闭/折叠方法。
- URL `?debug=1` 自动打开开发模式。
- 把原侧栏 `app-status / runtime-stats / pick-stats / 边界` 迁入可拖动、可收起的开发模式浮动面板。
- 调试面板关闭时，普通页面不展示生成耗时、checksum、WebGL stats 等开发信息。

验收：

- 普通 URL 打开后没有左侧常驻侧栏，画布占满主区域。
- `?debug=1` 打开后出现开发模式浮动面板，面板内可看到运行时统计和选择统计。
- 开发模式面板可拖动，可收起为小按钮，再次点击可展开。

### 阶段 B：比例尺图层

目标：

- 在图层 tab 增加“比例尺”开关，默认开启。
- 地图左下角增加视觉比例尺，按当前相机缩放和单位配置显示合适的实际距离。
- 比例尺不属于开发模式，普通用户可见。

验收：

- 缩放地图时比例尺数值和线段长度更新。
- 关闭图层“比例尺”后比例尺隐藏，刷新后偏好保留。

### 阶段 C：README 与简介 tab

目标：

- 新增人类可读 README，说明本项目是基于 Azgaar/Fantasy-Map-Generator 思路和数据结构参考实现的 WebGL 地图生成器。
- README 说明当前已完成：WebGL2 canvas、生成器、地形/气候/河流/文化/宗教/国家/省份/城市/道路/资源点/外交/经济/军事/zone、Vue 浮动面板、编辑和重生成第一刀等。
- README 说明计划：Element Plus 迁移、开发模式完善、导入导出、灰度高度图导入、地理数据导出、更多 source 语义对齐、导出 SVG/数据兼容等。
- 控制面板新增“简介”tab，包含项目简介和仓库链接，后续导入/导出按钮可放入该 tab。

验收：

- README 可独立被人读懂项目定位、运行方式、当前能力和未来计划。
- 控制面板打开后存在“简介”tab，包含仓库链接。

### 阶段 D：导出导入方案与第一刀

目标：

- 先定义 `webgl-generator-map` 完整数据文件格式，包含版本、导出时间、options、map 全量数据和必要 metadata。
- 第一刀本地导出支持：
  - PNG 图片导出：从 canvas 读取，并逐步合成用户可见的地图 overlay。
  - 完整地图 JSON 导出：可重新导入复原当前地图对象。
  - GeoJSON 导出：先输出陆地 grid cell polygon 或 pack cell polygon 的 FeatureCollection，属性包含 height、state、province、culture、religion、biome。
- 第一刀导入支持：
  - 从本地 JSON 文件导入完整地图数据。
  - 导入后刷新 renderer、面板、统计、对象索引。

风险：

- 当前地图对象包含 typed arrays，直接 `JSON.stringify` 会退化为对象或丢失类型。需要做显式序列化/反序列化。
- 完整复原必须覆盖 renderer、selection、edit history、Vue store 偏好、对象索引和派生缓存。
- GeoJSON 会很大，100k grid cell 直接导出可能产生超大文件；第一刀可限制为当前数据规模或提示。

状态：

- 已实现 `webgl-generator-map v1` 完整 JSON 导出/导入，typed arrays 会显式保存并恢复。
- 已实现 PNG 导出第一刀，并补充地图尺寸摘要和比例尺 overlay 合成；完整图例、标签和浮动面板暂不合成。
- 已实现 pack cell GeoJSON 第一刀，默认图可输出 `5950` 个 Polygon。
- 已实现要素 GeoJSON 第一刀，单独输出路线 `LineString`、河流 `LineString`、marker `Point` 和区域 `MultiPolygon`，与 pack cell Polygon 导出分离。
- 已验证导出旧图、生成新图、再导入旧图后 checksum 和 typed array 构造器恢复。

### 阶段 E：灰度高度图导入

目标：

- 支持用户选择本地灰度图。
- 读取像素亮度并映射到 grid cell 高度。第一刀使用灰度归一化：自动读取图片亮度最小/最大值，把黑白或低对比图片都压到用户指定高度区间。
- 提供高度映射区间，例如最低亮度对应最低高度、最高亮度对应峰值高度；第一刀不做原版 Image Converter 的彩色高度方案识别。
- 提供黑白反转开关，方便用户把低亮度区域映射为高地或把高亮度区域映射为低地。
- 应用后把图片采样作为“自定义高度模板”进入正式生成链路，完整重算 feature、climate、biome、pack、river、politics/settlements 等派生数据，避免只改高度造成水陆、城市、河流和国家不一致。

风险：

- 如果只改 grid 高度而不重建 pack/feature，会出现水陆、城市、河流和国家不一致。
- 完整派生重算接近“从高度图生成新地图”，应单独做一步，避免和普通高度编辑器混淆。
- 图片导入后 seed、地图尺寸、cells、气候和继承配置仍来自当前控制面板；如果图片长宽比与地图画布不同，默认拉伸铺满，也可选择保持比例居中裁剪，后续再考虑留白、手动裁剪框和预览策略。

验收：

- 生成 tab 的地形配置附近可以选择本地图片，并调整最低/最高高度。
- 可以选择图片适应方式：默认拉伸铺满，或保持比例居中裁剪。
- 导入后生成一张新的完整地图，`map.heightmap.template` 标记为灰度导入，地形、feature、河流、国家和城市等派生信息随新高度重算。
- 低对比灰度图也能自动拉伸到指定高度区间；导入失败时在文件操作状态中给出可读错误。
- 开启反转黑白后，亮度到高度的映射方向反向，元数据记录 `invert: true`。

状态：

- 已实现灰度高度图导入第一刀，入口位于生成 tab 的地形配置后方。
- 生成器新增采样型 heightmap 覆盖入口，灰度图会作为 `grayscale-import` 高度模板进入完整生成链路，下游阶段也使用该模板标记，避免沿用导入前下拉模板的专属分支。
- 图片读取使用浏览器 canvas 解码，按 `grid.points` 坐标采样亮度，并把图片亮度 min/max 自动拉伸到用户设置的最低/最高高度。
- 已补充黑白反转开关，导入元数据会保存 `invert`；已验证合成 `32x24` 灰度 PNG 导入后高度范围为 `10..90`，`features / pack / states / cities / rivers` 均重新生成，开启反转后低亮度角高度为 `90`、高亮度角高度为 `10`。
- 已补充适应方式下拉，导入元数据会保存 `fitMode`；已验证 `96x24` 宽幅灰度 PNG 选择“保持比例裁剪”后导入，`map.heightmap.source.fitMode = crop`。

### 阶段 F：国家命名优化

目标：

- 新增古国风国家根名字库，优先生成单字或短双字古雅根名，减少双字地名重复。
- 同一地图内禁止对同一根名反复追加东西南北；方位变体最多出现一次或极少数。
- 参考春秋/周代诸侯国的命名气质，不直接照搬全部历史组合。
- 国家形制从“国/邦/王朝/盟/诸州”收敛为更中国古代风格的“国、侯国、伯国、邦、朝”等，并按国家规模选择。

验收：

- 烟测中不再频繁出现“北清河邦 / 西清河邦 / 东清河邦”相邻堆叠。
- `politics.metadata.stateNames` 中单字或短名比例提高，重复根名减少。

状态：

- 已实现古国风单字/短根名优先策略，文化根名复用概率降低。
- 已实现国家根族去重，普通生成不再用同根方位词堆叠。
- 已将国家形制收敛到“国、侯国、伯国、邦、朝”和少量地貌特化形式。
- 三组 seed 抽样中短根名 `19-20 / 20`，单字根名 `8-11 / 20`，同根重复 `0`。

## 提交策略

- 文档计划先单独提交。
- 阶段 A/B/C 已作为第一批代码实现：外壳、开发模式、比例尺、README、简介 tab。
- 阶段 D 已作为第二批代码实现：PNG、完整地图 JSON、pack cell GeoJSON、路线/河流/marker/zone 要素 GeoJSON 和完整 JSON 导入；PNG 后续已补地图摘要与比例尺合成。
- 阶段 F 已作为第三批代码实现：春秋古国风国家根名、根族去重和形制收敛。
- Element Plus 已作为第四批代码接入按需导入与 `UiButton` 样板迁移。
- 阶段 E 已作为第五批代码实现：灰度高度图导入、采样型高度模板、完整重生成链路和黑白反转映射。
- Element Plus 第三批已迁移 `UiSelectField`，解决下拉视觉层和空白点击收起问题，同时保留原生 select 桥。
- Element Plus 第四批已迁移 `UiTabs`，控制面板 tab 不再折行，后续注意自动化脚本应使用 `role=tab` 或 `data-control-tab`。
- Element Plus 第五批已迁移 `UiSliderField`，所有滑动条使用 Element Slider 视觉层，同时保留隐藏 range 桥。
- Element Plus 第六批已迁移 `UiSwitchField`，普通开关和图层按钮式开关使用 Element Switch 视觉层，同时保留隐藏 checkbox 桥。
- Element Plus 第七批已迁移 `UiColorField`，共享二级改色面板使用 Element ColorPicker，并补充二级面板对 Element teleported popper 的点击豁免。
- Element Plus 第八批已迁移 `UiObjectTable`，对象列表使用 Element Table 视觉层，同时保留行选择、双击定位、定位按钮、空态和选中行滚入视口契约。
- Element Plus 组件迁移前置拆包已继续推进：备注、名称库、路线、河流、标签、外交、城市、文化、宗教、资源标记、国家和省份管理浮层均已改为首次打开时动态加载；表格迁移后继续观察共享 chunk 体积，后续树状总览或弹窗迁移也应优先保持按需加载。
- 每次提交前至少运行 `git diff --check` 和 `pnpm run build`；涉及浏览器交互时使用 Playwright 验证。
- 本轮只提交，不推送。
