# AI 接手入口

本文是默认 AI 会话处理 FMG 地图时的固定入口。先判断运行环境，再读取需要的领域手册；不要直接猜测内部 `map` 字段，也不要把开发模式 UI 当作 API 权限开关。

## 最短接手顺序

1. 读取本页与 [`runtime-and-loading.md`](./runtime-and-loading.md)，选择浏览器 API 或无头 API。
2. 读取 [`map-data-model.md`](./map-data-model.md)，确认 Grid / Pack、单位、派生关系与旧图迁移。
3. 只读分析先用 [`regional-analysis.md`](./regional-analysis.md)；写入前必须再读 [`safe-change-boundaries.md`](./safe-change-boundaries.md)。
4. 查方法时优先读取生成目录 `docs/generated/ai/manifest.json`、`api-catalog.json` 和 `domain-capability-map.json`，不要靠记忆拼方法名。
5. 处理复杂区域问题时按 `regional-analysis.md` 的通用闭环输出事实、口径、证据 cell、保持约束、目标区间和仍需预检的写动作；不要假设仓库外私人存档中的名称、位置或对象 id。

## 运行时选择

| 目标 | 入口 | 能力边界 |
|---|---|---|
| 当前已打开地图、UI、下载、相机或编辑事务 | `window.webglGeneratorApi` | 316 个公开方法；包含只读、UI 状态和写事务 |
| 本地存档的批量 / 自动只读分析 | `createHeadlessMapApi` 或 `tools/webgl-generator-headless-api.mjs` | 无浏览器；文件、对象、Cell、气候、地形、人口、planner、区域分析；严格不写 |
| 本地存档的受控写入 | `createHeadlessWriteSession` 或 `tools/webgl-generator-headless-write.mjs` | 无浏览器；首批只支持人口调整、高度选区平滑和对象重命名；默认输出新文件 |
| 当前标签页但调用者不在页面上下文 | `tools/webgl-generator-ai-bridge-server.mjs` + 页面 AI 调试区 | 回环连接、默认只读；写权限与高风险确认都在页面可见控制 |

浏览器 API 在开发模式关闭时仍存在，方法本身也不会因开发模式改变返回信息。开发模式只改变 UI 是否显示入口和调试面板。`debug.*` 是独立实验命名空间，不是普通 API 的“详细模式”。

## 输出纪律

- 分清事实、推断、建议和未验证假设。
- 所有区域统计写明空间（当前统一为 Pack cells）、样本数、单位 / 原始尺度、均值与分位数。
- 引用具体对象和证据 cell；修改建议必须列出“必须保持”的疆域、地形、锁定对象和派生系统。
- 无头只读分析不能声称修改地图；需要写入时必须显式切换到无头写会话、完成 inspect/apply 并重读输出文件。
- 浏览器写入只调用公开 inspector / execute 配对，遵守确认、revision、history、回滚和 regeneration lock。

## 领域路由

- 存档与运行环境：[`runtime-and-loading.md`](./runtime-and-loading.md)
- 数据解释与聚合：[`map-data-model.md`](./map-data-model.md)、[`regional-analysis.md`](./regional-analysis.md)
- 写入安全：[`safe-change-boundaries.md`](./safe-change-boundaries.md)
