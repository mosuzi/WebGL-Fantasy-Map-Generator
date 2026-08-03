# Codex 接手说明

这个文件是后续 Codex 智能体进入本项目时必须先读的固定入口。用户已经明确要求：除本次单独授权的根目录 `README.en.md` 外，所有文档使用中文描写；代码只添加必要注释；所有计划和开发历史要及时写入文档，方便新智能体复用上下文并追溯决策。

## Goal mode execution policy

- 已批准的编号计划视为封闭范围。
- 每项达到其最小验收条件后，必须立即转向下一项。
- 不影响当前验收的重构、精修和新发现，只记录，不实施。
- 不得自行扩展完成标准。
- 全部必需任务完成后必须停止，不得创造后续工作。
- 遇到范围歧义、需要产品决策或重复失败时，停止并询问用户。

## 项目目标

当前项目在 `source/Fantasy-Map-Generator` 中放置原 Fantasy Map Generator 源码。我们的目标不是修改原项目，而是基于原项目的功能、数据结构和视觉表现，复刻一个功能相似但由 WebGL 实现的独立地图生成器。

核心原则：

- `source/` 是参考实现、行为对照和性能基线来源，不是改造目标。
- 禁止修改 `source/` 原项目代码；只有为了安装依赖和运行参考项目而产生的锁文件例外，例如 `pnpm-lock.yaml`。
- 新增项目代码、工具、原型和文档默认放在当前项目根目录下，不要放进 `source/`。
- 可以阅读、运行、profile 和浏览器观察 `source/`，用来确认原项目行为、数据模型和视觉表现。

## 文档约定

- 所有手写文档必须使用中文；用户本次明确要求的根目录 `README.en.md` 是唯一英文例外。
- 计划、阶段进度、重要决策、风险和执行结果都要及时写入 `docs/`。
- 如果新增脚本会生成 Markdown 报告，生成内容也应为中文。
- 关键文档：
  - `docs/README.md`：docs 目录结构和文档放置规则。
  - `graphics-reimplementation-plan.md`：早期图形化重实现分析，已被新复刻计划取代，仅作参考。
  - `docs/plans/gl-reimplementation-acceptance-plan.md`：独立 WebGL 地图生成器复刻可验收计划。
  - `docs/current-plan.md`：唯一权威任务清单、执行状态和最小验收口径；其它文档不得另建当前待办。
  - `docs/development-log.md`：开发历史与决策记录。
  - `docs/performance/performance-baseline.md`：第 0 里程碑 profiling 工具说明。
  - `docs/milestones/milestone-1-webgl-prototype.md`：第 1 里程碑 WebGL cells 原型说明。
  - `docs/performance/webgl-svg-performance-comparison.md`：WebGL 原型与 SVG 基线性能对照。
  - `docs/audits/source-generation-audit-and-rectification-plan.md`：source 生成算法重新审查和正式应用生成质量整改方案。
  - `docs/task-notes/README.md`：专题计划、评估记录和执行细则索引。
  - `docs/task-notes/editor-and-stat-panel-inventory.md`：正式版编辑器与统计面板清单，记录各领域面板职责、优先级和暂缓范围。
  - `docs/generated/` 下的报告、截图和 baseline 是本地可复现产物，默认不作为接手必读文件。

## 提交约定

- 后续所有 Git 提交记录必须使用中文，包括 commit 标题和正文；除非用户明确要求，否则不要再使用英文提交信息。

## 代码约定

- 写代码时只添加必要注释，注释应解释意图、约束或非显然逻辑。
- 不要为了注释而注释。
- 手动编辑文件使用 `apply_patch`。
- 不要向 `source/` 写入新项目代码，也不要修改原项目源码。
- 运行工具或测试前，先确认是否需要依赖、网络或权限。

## 当前技术路线

总方案改为“参考原项目，独立复刻 WebGL 地图生成器”的路线：

- 独立实现新的生成器应用，主视图使用 `canvas` + WebGL2，优先考虑轻量 WebGL2 封装或后续成熟渲染库。
- 原项目的生成流程、数据字段、图层顺序、编辑交互和导出行为作为参考对象，不直接接入或替换原项目代码。
- 文本、纹章、编辑手柄等复杂能力可以先用新项目自己的 HTML/SVG overlay 过渡，但 overlay 代码仍放在新项目目录。
- PNG/JPEG 导出最终从新应用 canvas 读取；SVG/数据导出在新项目中按能力重新实现，必要时参考原项目格式。

## 当前状态

2026-08-03 权威任务第 263～264 项已完成。用户提供的 `1280×1280` A 方案原图已逐字节保存为正式母版，SHA-256 固定为 `50c20b1e8d908b0a45e91988e5421a0792d9f4570db7a504de91205851ab771d`；SVG 内嵌母版并逐字节核对，六档 PNG 只做等比缩放，manifest 使用 `any` 避免蒙版裁切。画布图标注册表固定城镇 `9 + 3`、Marker / 资源点 `58`、军事 `10`，共 `80` 个稳定图形键；自动 Marker 按 type 显示而不写 `type:*`，旧手工 symbol、城市剪影和军事别名兼容。首轮独立复核 `BLOCK` 的面板旧 symbol、角色组合、六文化与军事正式样式已限修，终验 `ACCEPT`；真实 `10004` grid cells 地图、DOM / PNG 同源、拾取、三档 Chrome 与生产构建通过。`source/` 零改动，未提交或推送，当前没有活动权威任务。

2026-08-03 权威任务第 262 项已完成。Dropbox 与 Google Drive 默认把短期 access token、到期时间和 provider / origin / 配置 / scope 指纹保存在当前标签页 `sessionStorage`，刷新时只恢复未过期且指纹一致的连接；过期、401、配置变化、损坏记录和主动断开会清理。Google 不再强制重复 `prompt: "consent"`。两 provider 协议、旧浏览器存储、生产构建与系统 Chrome 刷新 / 断开反例通过；首轮独立复核阻断的 Google 旧目录请求竞态已用连接代次与请求身份门禁修复，最终审计再阻断的延迟 `401` 误清新会话已用请求 token + 连接代次快照修复，复验为 `ACCEPT`。本项没有增加开关、refresh token、LocalStorage / IndexedDB、跨标签页共享、后台同步或新的云盘权限，未访问真实云盘、提交或推送；当前没有活动权威任务。

2026-08-02 权威任务第 255 项已完成。`origin/codex-smooth-boundaries` 通过双父提交 `a5832dc` 合入当前 `main`；共享拓扑海岸 / 湖岸平滑、局部回退和硬边恢复通过 20 夹具、10k / 50k pure / formal、生产构建及 Chrome 六态验收。canonical 地图数据、checksum、存档、API、编辑和 picking 不变，国家 / 省份边界继续使用硬边；本项未推送，当前没有活动权威任务。

2026-08-02 权威任务第 254 项已完成。悬停信息卡右上角新增信息圆按钮，悬停或键盘聚焦后显示从权威注册表派生的 `22` 项全局动作、`23` 组全局按键和 `2` 项场景动作；稳定 DOM、弹层滚动、高度画笔 pick 保留与 `1440 / 390 / 320px` 均通过独立 Chrome 验收。本项不改变快捷键执行、地图数据、历史或存档，未提交或推送，当前没有活动权威任务。

2026-08-02 权威任务第 253 项已完成。“全部地区”不再伪装成独立 `zones` 图层，而是五个既有地区状态的三态批量控制；半选可一键全开，全开可一键全关，四个细分开关和底层兼容字段保留。系统 Chrome `1440 / 390 / 320px` 与同源临时 `5411` 页通过，原用户页为保护未保存地图未强制刷新；服务保持运行，本项未提交或推送，当前没有活动权威任务。

2026-08-02 权威任务第 252 项已完成。云端存储说明、配置、连接和边界卡片统一为现有暗色主题，代码标签、链接、文件项和状态文字保持清晰层级；系统 Chrome `1440 / 390 / 320px` 无横向溢出或应用错误。provider、OAuth、配置与上传下载语义未改，`5411` 服务保持运行，本项未提交或推送，当前没有活动权威任务。

2026-08-02 权威任务第 248～251 项已完成并通过系统 Chrome `1440 / 390 / 320px` 验收。地区管理批量按钮相邻间距统一为 `8px`；地区重生成同步刷新覆盖与标签，旧自动编号名在显式重生成时迁移，列表名称置于编号之前；地区图层恢复“全部地区、事件地区、自然地区、自动无人区、地区名称”五个入口。`5411` 服务保持运行，本批未提交或推送，当前没有活动权威任务。

2026-08-03 权威任务第 261 项已完成。Google Drive 新存档默认保存到可配置的 `/webFMG`；Cloud Provider Config 新增 `providers.googleDrive.folderPath`、`FMG_GOOGLE_FOLDER_PATH` 与旧 `VITE_FMG_GOOGLE_FOLDER_PATH` 兼容入口，支持多级路径与显式 `/` 根目录。目录只在新建存档时按需创建，列表保留本应用旧根目录地图，覆盖不静默迁移；配置、mock 协议、生产构建与系统 Chrome 回归通过，未扩大 `drive.file`、读取任意用户文件、启动真实 OAuth、提交或推送。当前没有活动权威任务。

2026-08-03 权威任务第 260 项已完成。中文正式项目名统一为“WebGL 幻想地图生成器”，加载画卷等紧凑界面使用“幻想地图生成器”，manifest 短名为“幻想地图”；英文名继续使用“WebGL Fantasy Map Generator”。README、页面标题、加载画卷、manifest、SVG 图标标题、概念稿、部署说明和品牌门禁均已同步，旧中文品牌词搜索为 `0`；Chrome 三档视口和生产构建通过。保留“架空历史创作”等普通语义，未改包名、域名、代码命名空间或原项目名称。

2026-08-03 权威任务第 259 项已完成。Dropbox 官方与本地 Redirect URI 统一为 `/oauth/dropbox/callback`；独立轻量页不加载地图应用，只把授权码、state 或错误送回 opener 并自动关闭。opener 统一执行 origin / popup source / state / 十分钟期限 / 并发门禁和 PKCE 换令牌；旧整页 popup 也不再跨窗口传 token。开发与生产 Chrome 专项、旧回调、过期和并发反例、构建及两轮独立复核通过。Google Drive 已由用户确认正常且语义未改；本项未访问云盘、提交或推送。

2026-08-03 权威任务第 258 项已完成。应用图标已补齐 `64 / 256px`；用户明确提供的三项浏览器公开 OAuth identifier 已写入正式 Cloud Provider Config，无环境覆盖时官方构建自动保留。私人部署可用统一 JSON、新逐项变量、旧 `VITE_FMG_*` 或构建后替换覆盖，不需改源码；`.env.example` 保持空模板。仅 `localhost:5410` 使用本地 Dropbox 回调，其他位置保持正式回调；构建和运行时均拒绝 `GOCSPX-` Client secret，provider state 不回显 identifier。静态、构建与系统 Chrome 官方 / 空 / 私人覆盖三态均通过；本项未推送或触发线上 OAuth。

2026-08-02 权威任务第 257 项已完成。正式应用使用原创无文字“地图圆盘 + 朱红方印”图标，SVG 主稿及第 258 项扩充后的 `32 / 64 / 180 / 192 / 256 / 512px` PNG 位于 `app/webgl-generator/public/`；favicon、Apple Touch Icon、Web App Manifest 和主题色均已接入，生成与静态 / Chrome 验收脚本已固定资源和入口契约。不得回退空 `data:,` favicon、复制原作图标或把 FMG 字母缩写写入图标。

2026-08-02 权威任务第 245～247 项已完成并通过两轮阻断限修、第三轮独立复核与系统 Chrome 验收。地图语义标签固定为国家、省份、首都、城市、手工、地区六类，地区样式可独立编辑；画布文字机器目录为语义标签 `6`、成品注记 `3`、HUD `8`、诊断 `1`、未渲染名称 `3`。源码门禁会识别未标记固定文字、绕过 helper 的 renderer 动态文字和对应未登记 CSS；军事数字、图例和比例尺继续使用独立样式来源，HUD / 诊断与河流 / 道路 / marker 名称不得冒充标签覆盖。

2026-08-02 权威任务第 256 项已完成，后由第 260 项更新中文名称。根 README 的中文项目名现统一为“WebGL 幻想地图生成器”，英文为“WebGL Fantasy Map Generator”；不得再以“FMG WebGL 地图生成器 / FMG WebGL Map Generator”作为项目名称，原 Fantasy Map Generator 的正式名称仅在参考与致谢语境中保留。

2026-08-02 权威任务第 242～244 项已完成并通过二轮独立复核与系统 Chrome 验收。地区管理和云端存储组件随入口构建加载、面板继续延迟挂载；共享懒加载恢复不得自动刷新未保存地图。地区重新生成已在控制面板和地区面板公开，继续复用现有 `zones` API、地图快照事务、锁定保护与生成器。

2026-08-02 权威任务第 236～241 项已完成并通过三轮独立复核与系统浏览器验收。图层只合并首层 UI 入口，不合并底层状态键；网格单元无偏好时默认关闭；自动无人区改用周边地理语义名称；纹章入口已隐藏但兼容链保留；共享下拉箭头间距已收紧。Dropbox / Google Drive 云存储通过统一 provider registry 接入，公开 client identifier 由 `VITE_FMG_*` 环境变量配置，不复用原作硬编码 app key；第 241 项当时令牌仅存内存，后由第 262 项调整为当前标签页 `sessionStorage` 中的短期会话。fixture / mock 与未配置状态已验收，没有项目方 OAuth 配置时不得声称真实账号联调完成。

2026-08-02 第 229～235 项已完成。第 235 项明确当前应用代码 100% 由 Codex + GPT 实现，文档同样由 Codex + GPT 编写；未来继续保持完全由 Codex + GPT 完成是内部开发约束，README 只陈述当前事实，不重复解释 `100%` 的含义，也不强调未来承诺。第 234 项已清理中英文 README 的翻译腔与模板化表达，两版继续只简述 API 与自动化入口，把精确能力、安全边界和使用步骤交给仓库内 Wiki 源稿与 AI 手册。

2026-08-01 第 229～232 项已完成，当前没有活动权威任务。第 232 项只公开匿名化问题模式和通用行动闭环；真实存档、阶段指标、对象 / cell id 和截图只写 Git 忽略的 `private-cases/`，不得提交仓库。

2026-07-31 用户新增权威任务第 227～228 项。第 227 项懒加载、默认只读、可刷新重连的当前标签页 AI 受控桥与第 228 项带事务回滚、幂等和安全输出的无头写入 API 均已完成并通过真实浏览器验收；两项保持并行适配器关系，不得开放远程监听、任意 JavaScript、裸 map 写入或绕过现有领域规则。

2026-07-31 新增权威任务第 223～226 项。第 223 项共享 API 核心与无浏览器只读运行时、第 224 项区域聚合分析、第 225 项 AI 文档系统均已完成；第 226 项的 15 个 Wiki 中文源页面、覆盖矩阵和同步门禁已完成，但 GitHub 私有仓库 Wiki 受当前套餐限制，远端 `.wiki.git` 尚未创建，等待用户选择公开仓库或升级套餐。当前不得越界实现受控标签页桥、无头写入、远程 HTTP 或三个标准问题的自动写算法。

正式应用已经跨过早期占位原型阶段。权威任务第 28～52、54～225、227～264 项已完成，第 53 项按用户决定移除；第 226 项本地完成但远端发布受 GitHub 私有仓库套餐阻塞，当前没有活动权威任务。第 227 项新增当前标签页受控桥并把区域分析同步到浏览器 API；第 228 项新增无 DOM 的安全写会话和 `6` 个无头写方法；第 232 项新增三类匿名化复杂区域干预模式与通用行动闭环。当前公开 API 为 `17` 个命名空间、`316` 个方法和 `179` 个编辑方法，稳定等级为 `308 / 7 / 1`，逐方法描述为 `316 / 316`，对象查询覆盖 `20` 类。完整能力矩阵为 `1196` 行、`covered 1122 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵为 `79` 个动作、`69` 个完整事务与 `10` 个玩法配方，`316` 个公开方法全部完成分类，结构缺口为 `0`。第 205 项锁仓分母继续保持 `14 / 15 / 22`、双向差集 `0`；第 218 项另覆盖城市 / burg / 省份范围锁、路线锁、手工行政标识与共享 grid 冲突的原子保护。正式加载页继续使用旧纸自卷画轴和指定 PNG 印面；独立 prototype 继续作为视觉基线。批准范围统一查看 `docs/current-plan.md` 的“权威任务清单”；README、专题文档中的“下一步”只作候选或历史语义，不能覆盖权威清单。

第 216 项代码、机器门禁、独立复核与第 211～216 项统一 Chrome 验收均已完成；复核提出的 `safeTop` 生命周期、异步内容重排、低位入口空白误算、共存布局、精确锚点与离屏锚点均已限修。普通 / 150% 字体六档矩阵 document 溢出为 `0`，管理主面板和二级弹框均在安全区内且正文可滚到底，焦点视觉一致，application console、page 与 WebGL error 为 `0`。

第 217～218 项代码、专项、兼容矩阵、生产构建、两组独立复核与系统 Chrome 验收均已完成。省会重评在新图道路 / 标签 / 经济派生前自动运行，旧图只允许“预览 → 指纹确认”的显式单事务；`#150 / #284` 固定反例选择 `#284`，`10k / 50k / 100k` 与共享 grid 冲突样本通过，真实 Chrome 全量预览为变更 `0`、不变 `229`，主面板完整位于视口安全区且 application console error 为 `0`。

第 219 项代码、专项、API / 矩阵、生产构建与系统 Chrome 验收均已完成。高度灰度图固定读取基础 `grid.cells.h` 与 Grid Voronoi 几何，按完整世界尺寸把高度 `0～100` 线性映射为灰度 `0～255`，复用普通 PNG 的 `1x～4x` 倍率，不读取相机、主题、图层或 overlay。UI `2x` 实际下载与 API `1x` data URL 均通过，全部 `3015` 个测试 Grid Cells 被绘制，地图 checksum、历史和相机不变，application console、page、health 与 WebGL error 为 `0`。

第 220～222 项代码、专项、旧数据兼容、API / 矩阵、生产构建、独立复核与系统 Chrome 验收均已完成。事件地区统一保存并显示结构化参与方；地区现有九类内置自然类型、完全自定义类型、底区 / 覆盖区和四项中性基础影响；自动无人区按中立低人口陆地的共享边连通分量生成独立对象、名称与标签。地区标签改名、撤销 / 重做、选择、定位和独立显隐闭环，自动无人区与地区名称分开关均不修改地图数据；清空 health 后 application console、page、active health 与 WebGL error 为 `0`。

2026-07-30 发布前按用户要求由全新智能体再次验收。首轮动态复现发现区域人口增减 / 转移有 `6` 个城市规模差异、国家合并有 `28` 个差异，并补出新建国家改变 P90 后既有城市未刷新的写入面；现已集中到共享规模 / 自动视觉刷新及字段存在性快照，角色字段不再覆盖人口规模。原样复跑差异均为 `0`，新建国家、手工视觉、撤销 / 重做、故障回滚、旧图缺字段、生产构建、完整能力矩阵和复合语义均通过，两路终轮复核为 `ACCEPT`。系统 Chrome 5410 的既有旧图预览为变更 `214`、拒绝 `21`，有拒绝项时确认禁用，取消后清空，application console、page 与 WebGL error 为 `0`。

2026-07-30 用户截图纠正了 debug 工具栏验收口径，并进一步明确四个文字入口都不得内部折行：整条 `.map-toolbar-actions` 必须单排，“控制面板 / 适配视图 / 测量 / 开发模式”也必须各自完整单行。当前四项均按内容宽度分配，`294px` 以下仅按视口比例收紧字号、间距与内边距，不使用负字距、隐藏、裁剪或横向滚动；系统 Chrome 在 `480 / 390 / 320px` 普通与 150% 页面缩放六档中测得五个控件 top 差均为 `0px`、工具栏与 document 横向溢出均为 `0`。控制面板顶部七个 Tab 继续固定在正文滚动区之外，管理正文可滚到底且 Tab 位移为 `0px`，工具栏收展、开发入口和错误面均正常；最终独立验收为 `ACCEPT`。

以下内容是仍有参考价值的早期里程碑记录，不代表当前待办：

- 阅读 `source/Fantasy-Map-Generator` 核心结构。
- 编写图形化重实现总方案：`graphics-reimplementation-plan.md`。
- 完成第 0 里程碑外部性能基线工具：`tools/fmg-profile.mjs`。
- 编写第 0 里程碑说明：`docs/performance/performance-baseline.md`。
- 跑出可信 `10000/50000/100000` 三档性能基线：
  - `docs/generated/reports/performance-baseline-results.json`
  - `docs/generated/reports/performance-baseline-results.md`
- 开始并跑通第 1 里程碑最小 WebGL cells 原型：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/`
  - `docs/milestones/milestone-1-webgl-prototype.md`
- 整理第 1 里程碑 WebGL 原型与第 0 里程碑 SVG 基线对照：
  - `docs/performance/webgl-svg-performance-comparison.md`
- 将 WebGL 原型主接口收敛为 `GraphicsMapRenderer`：
  - `prototype/webgl-cells/src/renderer.js`
  - 保留 `CellWebGLRenderer` 兼容别名。
- 新增正式 WebGL 原型性能采集脚本：
  - `tools/webgl-prototype-profile.mjs`
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 修正底层 mesh 数据源：
  - 基础 cell mesh 使用 `grid.points`、`grid.cells.v`、`grid.vertices.p`。
  - `pack.cells` 只用于国家、边界、河流、picking 等业务语义。
  - 不要再把 `pack.cells` 当作均匀底层网格，否则水域/边界 pack cell 会出现巨型多边形。
- 修正原型级河流折线河口处理：
  - 当前没有复刻原版 `Rivers.getRiverPath()` 的变宽河道。
  - fallback 河流折线遇到第一个水域 cell 会插入近似河口点并停止，避免河流画到海里。
- 正式应用已完成第一轮 source 生成算法整改：
  - `grid.cells.c` 改为共享边邻接，并用于高度、feature、河流、路线和语义扩张。
  - 高度末端不再使用全局百分位重排，改为海平面校准、连续 relief 拉伸和坡脚平滑。
  - 路线改为 A* 成本寻路，失败时不再画直连。
  - 河流改为动态河源上限和更低 flux 阈值。
  - 文化、宗教、国家、省份和区域改为邻接成本扩张。
- 更新当前计划和开发历史：
  - `docs/current-plan.md`
  - `docs/development-log.md`

第 0 里程碑可信基线摘要：

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 |
|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 |

注意事项：

- Windows 端口 `5109-5208` 在当前机器上被 TCP 排除，Vite profiling 使用 `5300`。
- Playwright 自带 Chromium 下载曾超时，当前可用 `--browser-channel chrome` 复用系统 Chrome。
- 原项目 `generate()` 会在 points 未锁定时把点数重置为默认 10k；profiling 工具已经在生成前设置点数并锁定 `lock_points`。

第 1 里程碑历史原型摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 grid cells | 99846 |
| 实际 pack cells | 58251 |
| 渲染来源 | grid |
| grid Voronoi 顶点 | 200338 |
| pack Voronoi 顶点 | 117148 |
| 三角形 | 598519 |
| GPU 顶点 | 1795557 |
| 国家边界线段 | 1404 |
| 河流数量 | 1021 |
| 河流线段 | 5641 |
| picking 索引桶 | 39204 |
| 平均候选 cells | 5.9 |
| 最大候选 cells | 17 |

第 1 里程碑历史 WebGL 性能采集摘要：

| 指标 | 数值 |
|---|---:|
| buffer 构建 | 336.5ms |
| buffer 上传 | 36.6ms |
| draw 平均值 | 0.27ms |
| draw 最大值 | 1.3ms |
| picking 平均值 | 0.01ms |
| picking 最大值 | 0.1ms |

运行原型：

```powershell
node .\tools\serve-prototype.mjs --port 5400
```

然后访问 `http://127.0.0.1:5400`。

## 接手建议

新智能体接手时，按顺序阅读：

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/current-plan.md`
4. `docs/development-log.md`
5. `graphics-reimplementation-plan.md`
6. `docs/performance/performance-baseline.md`
7. `docs/milestones/milestone-1-webgl-prototype.md`
8. `docs/performance/webgl-svg-performance-comparison.md`
9. `docs/audits/source-generation-audit-and-rectification-plan.md`
10. `docs/task-notes/README.md`
11. `docs/task-notes/editor-and-stat-panel-inventory.md`

然后只按 `docs/current-plan.md` 的活动权威任务继续。第 248～264 项已完成，当前没有活动权威任务；不得从历史里程碑、README、FOLLOWUPS、矩阵缺口或专题文档的“下一步”自行创造实施任务。规则事务继续遵守既有分层：`cells.inspectAction` 只负责空间 / 原子输入预检，领域 `inspect + execute` 才负责单事务游戏规则，AI planner 只编排多个已授权规则事务。第 195 项继续复用第 200 项现有 `info.describe`、schema registry 与 `objects.*`；独立 prototype 继续作为视觉基线。
