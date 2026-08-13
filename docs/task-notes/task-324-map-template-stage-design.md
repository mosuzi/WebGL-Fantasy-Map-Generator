# 第 324 项地图模板分阶段设计

## 冻结目标

第 324 项新增 16 个真实地理与历史场景模板。模板是可审计、离线、确定性映射到目标网格的 canonical 数据，不是现有程序化高度模板的别名；创建完成后得到普通可编辑地图，仅在 metadata 保留来源证据。

## 数据源与口径

- 物理底图统一从 Natural Earth `5.1.2` 的海岸、湖泊、河流矢量与 GEBCO `2026` 高程格网生成。Natural Earth 与 GEBCO 均声明为 Public Domain；正式资源只提交经过确定性裁剪、投影、量化和校验的离线派生产物。
- 罗马帝国固定公元 `117` 年图拉真时期最大疆域，历史边界口径使用 Wikimedia Commons 的 `RomanEmpire 117.svg` Public Domain 文件。
- 神圣罗马帝国固定 `1789` 年，历史边界口径使用 Wikimedia Commons 的 `Map of Holy Roman Empire 1789.svg` CC0 文件。
- 历史资源只在离线构建时读取来源；应用运行时不得联网。每个产物记录来源 URL、许可、版本、处理参数和 SHA-256。

来源页面：

- <https://www.naturalearthdata.com/about/terms-of-use/>
- <https://www.gebco.net/data-products/gridded-bathymetry-data>
- <https://commons.wikimedia.org/wiki/File:RomanEmpire_117.svg>
- <https://commons.wikimedia.org/wiki/File:Map_of_Holy_Roman_Empire_1789.svg>

## 内部阶段

### A：目录与来源契约

- 冻结 16 个稳定 ID、中文名、顺序、范围、投影、推荐规模、必需图层、关键锚点、历史年代和来源。
- 纯 Node 门覆盖目录唯一性、许可、边界、锚点和第 323 项规模归一化。
- 非目标：不下载资源、不接 UI / API、不生成或替换地图。

### B：离线资源与确定性映射

- 新增可复现资源构建器，输出共享世界物理基线、区域裁剪索引、锚点掩膜及两套历史政治数据。
- Worker 内把模板投影到目标 grid，生成海陆、高程、水文和区域掩膜；同模板版本、seed、salt、cell 数得到同一语义 checksum。
- 低规模允许明确的示意降级；10k / 100k 必须保留条目规定的关键区域、岛屿和连续性。

### C：历史政治与普通地图语义

- 两个历史模板应用固定年代的人文预设；其它模板只提供物理底图并沿现有生成器派生人文数据。
- 创建后解除模板持续绑定，普通编辑、重生成、存档、导出和撤销替换继续使用现有地图契约。

### D：UI、公开 API 与兼容

- 生成 Tab 新增独立地图模板入口；公开 API 提供枚举、详情和创建，不与 `heightmapTemplate` 混用。
- metadata 只保存模板 ID、版本、来源 checksum、请求 / 实际 cells；旧图和未选模板生成保持原行为。

### E：真实验收

- 16 项完成默认规模生成、结构审计和固定视口截图；纯数据覆盖 `1 / 10000 / 100000`。
- 浏览器覆盖世界、中国、东亚、澳洲组合、神圣罗马帝国和罗马帝国的 10k / 100k，以及存档、PNG / GeoJSON、picking、回滚、延迟加载和错误面。

## 当前阶段边界

阶段 A～D 已建立 checkpoint。生成 Tab、三项公开 API、按需资源装载、替换失败原子回滚、普通地图与模板地图存档往返已经通过真实浏览器入口；普通 `heightmapTemplate` 入口未改义，模板创建成功后只在 metadata 保留来源证据。当前唯一写者仍为主线程，阶段 E 只负责 16 项默认规模结构 / 截图和冻结的 10k / 100k 浏览器矩阵，不再扩张产品范围。
