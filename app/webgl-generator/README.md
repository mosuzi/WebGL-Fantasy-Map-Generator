# 独立 WebGL 地图生成器应用

`app/webgl-generator/` 是正式 WebGL 地图生成器应用目录，与 `prototype/webgl-cells/` 的早期快照 demo 分开维护。这里已经不是占位地图阶段；截至 2026-07-16，上一波功能与审计任务已经收口，当前只剩省份笔刷、独立备注 selection、道路 / 河流尺度宽度和编辑面板手动位置优先四项窄范围维护，详细状态只在[权威任务清单](../../docs/current-plan.md#权威任务清单)维护。

## 目录职责

- `index.html`：正式应用页面入口。
- `src/main.js`：浏览器启动入口，只负责装配运行时。
- `src/generator/`：独立生成内核，负责 grid、heightmap、feature、气候、水文、社会、政治、聚落、经济、外交、军事和地区等数据。
- `src/renderer/`：WebGL2 地图渲染、动态线层、picking、selection/highlight 与 HTML/SVG overlay 投影。
- `src/runtime/`：应用状态、公开 API、生成/导入事务、编辑命令、历史、选择、画布模式和导出流水线。
- `src/ui/`：Vue SFC、Pinia 状态桥接、浮动面板和用户操作绑定。

## 当前能力摘要

- 可复现 seed/options 生成链路已经覆盖地形、气候、河流、文化、宗教、国家、省份、城市、路线、资源、经济、外交、静态军事和地区。
- 地图对象使用统一 selection、定位、高亮、对象详情和领域面板；编辑进入 `EditHistory`，并通过 effects 驱动定向派生刷新。
- 高度、国家、省份、文化、宗教及各类创建工具共用统一画布模式管理器，支持互斥、取消、完成、地图替换和未提交预览回滚。
- `window.webglGeneratorApi` 当前覆盖 11 个命名空间、186 个公开方法和 90 个编辑方法；API 与 UI 尽量共用 runtime action 和数据契约。
- 完整地图 JSON/gzip、浏览器存档、GEO、高度图、名称库、备注和测量具备兼容/诊断入口；旧数据变化必须补 migration/backfill。
- PNG 支持倍率、四种裁剪模式和七类 overlay 白名单；pack 与分层 GeoJSON 支持全图、当前视口和世界坐标 bbox，政治面支持 dissolve，并有 Chrome、QGIS 与 geojson.io 验收证据。

以上只是不带执行状态的概览。已完成项、待执行项和验收命令以[权威任务清单](../../docs/current-plan.md#权威任务清单)及[开发日志](../../docs/development-log.md)为准。

## 启动与构建

在仓库根目录执行：

```powershell
Set-Location D:\work\fmg
pnpm install
pnpm run dev
```

默认开发地址：

```text
http://127.0.0.1:5410
```

生产构建：

```powershell
pnpm run build:app
```

常用回归脚本由根目录 `package.json` 统一声明。执行当前任务时，只运行权威清单验收所要求的专项回归和构建；浏览器验收仅在对应任务明确要求时执行。

## 技术与边界

- 当前正式应用使用 Vite、Vue SFC、Pinia 和 WebGL2。
- `source/Fantasy-Map-Generator/` 只用于行为、数据和视觉对照，禁止修改其业务源码。
- `prototype/webgl-cells/` 保留早期性能与视觉对照，不作为正式应用运行时依赖。
- 文本、标签、图例、比例尺、测量和部分图标可以使用 HTML/SVG overlay，但必须由正式 renderer/runtime 管理生命周期。
- 任何保存格式、字段或数据结构变更都要覆盖旧缓存地图、完整地图导入和旧导出文件。
- 新发现但不影响当前验收的事项写入 [`../../FOLLOWUPS.md`](../../FOLLOWUPS.md)，不得顺手扩展当前任务。

浮动面板长期约束见[浮动面板架构](../../docs/architecture/floating-panel-architecture.md)和[Vue 浮动面板模式](../../docs/architecture/vue-floating-panel-pattern.md)。
