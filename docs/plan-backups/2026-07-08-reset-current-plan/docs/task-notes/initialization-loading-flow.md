# 初始化加载流程规约

本文记录 WebGL 地图生成器从页面启动到地图可交互的理想流程。它用于防止后续改动把生成、渲染、面板刷新和调试信息重新混在一个同步大任务里。

## 问题背景

2026-07-03 用户在自己的 Chrome 中复现：页面会停在“展开乾坤”，拆分阶段后又停在“车马入途”。这说明首屏不是单纯 loading 文案没有收起，而是主线程在某个初始化阶段被长同步任务占满，导致按钮、控制台和浏览器自动化都无法响应。

本次审查确认：

- “展开乾坤”原本包含适配视图、动态道路 mesh、动态河流 mesh、overlay 标签/图标碰撞和面板刷新，职责过重。
- “车马入途”对应道路屏幕 mesh 构建，路线数据本身在默认 10k/100k 情况下并不夸张，但 renderer 之前缺少异常输入预算、虚线切片防护和阶段内让出主线程能力。
- 生成 worker、WebGL 装载、动态 mesh、overlay 和面板刷新必须保持独立阶段，任何一个阶段都不能依赖“最后统一同步做完”。

## 理想阶段

初始化必须按以下顺序执行：

1. `request`
   - 只读取面板参数、更新 seed 和显示 loading。
   - 不做生成、不做渲染、不刷新大型列表。

2. `generate`
   - 优先在 Worker 中生成地图数据。
   - Worker 不可用时允许主线程 fallback，但必须仍通过 `yieldToBrowser()` 给 loading 一帧机会。
   - 输出完整 `map` 对象，不碰 DOM。

3. `object-picking-index`
   - 构建对象拾取索引。
   - 只产出数据结构，不上传 GPU。

4. 静态视觉缓存
   - 包括 `cell-visual-mesh`、`shore-cache`、`state-boundaries`、`province-boundaries`、`political-meshes`。
   - 每个阶段必须单独计时，阶段之间必须让出浏览器。

5. 静态 GPU buffer
   - 包括 `surface-vertices`、`line-vertices`、`point-vertices`、`gpu-upload`。
   - 这些 buffer 只和地图数据、图层开关、专题模式有关，不应该顺带刷新 overlay 或面板。

6. `labels`
   - 只创建 overlay 节点和标签/图标 item。
   - 必须批量挂载 DOM，禁止循环中逐个触发布局。

7. `fit-draw`
   - 只做适配视图和最小可见绘制。
   - 不构建道路/河流屏幕 mesh，不做 overlay 碰撞，不刷新大型列表。

8. `route-screen-mesh`
   - 构建道路屏幕空间 mesh。
   - 必须支持分帧、异常点过滤、路线点数预算、顶点预算和虚线切片预算。
   - 超预算时降级为抽稀/截断，而不是锁死主线程。

9. `river-screen-mesh`
   - 构建河流屏幕空间 mesh。
   - 后续如果河流也出现同类卡顿，应按道路 mesh 的同一规约拆分。

10. `overlay-draw`
    - 刷新标签、城镇剪影、资源标记和军事图标的可见状态。
    - 碰撞检测必须先做图层、缩放、视口和数量上限过滤；禁止全量两两比较。

11. `panel-refresh`
    - 分批刷新用户当前可见的控制面板和浮层面板。
    - 大列表面板只更新必要的 selection / summary，不应在首屏一次性强制挂载所有表格。

12. `complete`
    - 隐藏 loading。
    - 页面进入可交互状态。

## 禁止事项

- 禁止把多个重任务塞回 `fit-draw`。
- 禁止在 loading 阶段执行无预算的 `while`、递归合并、全量碰撞或全量 DOM 挂载。
- 禁止在主线程上处理没有上限的导入地图数据。
- 禁止用干净浏览器验证替代用户 Chrome/profile 验证。
- 禁止只看 Node 生成耗时就判断页面不卡；必须验证浏览器主线程是否能响应。

## 阶段预算

当前建议预算：

- 单个初始化阶段如果超过 `500ms`，应拆分或加入阶段内 yield。
- 动态道路 mesh 每个时间片目标不超过 `10ms`。
- 单条路线渲染点默认不超过 `4096`。
- 全部路线渲染点默认不超过 `90000`。
- 道路 mesh 顶点默认不超过 `900000`。
- 单条虚线路线切片默认不超过 `20000`。

这些数值不是功能上限，而是主线程保护阈值。后续如果需要更高质量，应优先把对应阶段迁到 Worker 或增量 buffer，而不是直接调大预算。

## 调试追踪开关

初始化阶段已经接入开发模式追踪。普通用户路径不会插入额外等待；只有显式打开调试开关时才记录阶段流水。

可用入口：

- `?debug=1`：打开开发模式浮层，并显示“加载追踪”。
- `?loadTrace=1`：只启用加载阶段追踪，不强制打开开发浮层。
- `?debug=1&loadTrace=1&loadStepDelay=200`：在生成/渲染阶段边界临时插入 `200ms` 间隔，用于肉眼观察 loading 文案和浏览器响应。
- `debugLoadDelay`、`loadTraceDelay` 与 `loadStepDelay` 等价，最大会被限制为 `2000ms`，避免误配后长时间卡住。
- 运行时也可以在控制台设置 `window.__webglGeneratorDebug.loadStepDelayMs = 200`，再触发重新生成。

追踪输出位置：

- 开发模式浮层的“加载追踪”列表显示最近阶段。
- 控制台会输出 `[FMG load]` debug 日志。
- 页面会派发 `webgl-generator-load-stage` 事件，事件 `detail` 包含 `phase / id / label / message / at / ms / delayMs`。
- `window.__webglGeneratorDebug.loadTrace` 保留最近若干条阶段事件，便于自动化读取。

注意：额外 `setTimeout` 只加在阶段边界，不加在道路 mesh 内部的分帧切片上。这样可以判断是否卡在 `route-screen-mesh` 本身，而不会因为大量内部 yield 把调试模式拖得过慢。

## 验证要求

每次改初始化加载流程，至少验证：

- 用户 Chrome 中访问 `http://127.0.0.1:5410/`，不是只用干净 headless 浏览器。
- loading 阶段能依次越过 `fit-draw`、`route-screen-mesh`、`river-screen-mesh` 和 `overlay-draw`。
- 完成后 `generation-loading` 收起，画布有非空地图，控制面板展开按钮和测量按钮可点击。
- `renderer.getStats().loadMap.stages` 包含分段耗时。
- `renderer.getStats().routeRenderStats` 未出现非预期的 `pointBudgetExceeded` 或 `vertexBudgetExceeded`；如果出现，应记录触发地图的 seed、cells、路线数量、最长路线和导入来源。

## 后续优化方向

- 把 `river-screen-mesh` 也改为分帧构建。
- 给 `panel-refresh` 增加可见面板优先和分帧刷新。
- 在开发模式面板中显示初始化阶段瀑布图、道路/河流 mesh 预算状态和最近一次卡顿阶段。
- 增加一个自动化加载守卫：如果同一 loading 文案超过固定时长，开发模式输出阶段 id、阶段耗时、当前地图规模和 renderer 预算状态。
