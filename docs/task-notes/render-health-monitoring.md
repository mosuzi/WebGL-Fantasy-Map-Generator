# 渲染健康监测说明

本文记录 WebGL 地图生成器的本地健康监测机制。它用于在页面加载失败、渲染卡顿或用户操作卡顿后留下可查证的本地证据，不做远端上报。

## 目标

- 页面脚本没有启动时，也能留下 `script-not-started` 记录。
- 应用启动但地图长期未 ready 时，记录 `page-load-timeout`。
- loading 长时间不收起时，记录 `loading-stuck`。
- 浏览器主线程出现长任务时，记录 `main-thread-long-task`。
- `requestAnimationFrame` 帧间隔异常变大时，记录 `render-frame-gap`。
- 用户点击、键盘、输入等事件响应被延迟时，记录 `input-delay` 或 `input-handler-stall`。
- 视图切换、图层切换、适配视图、气候即时重算等业务操作超过阈值时，记录 `operation-stall`。
- 每次生成、导入和 WebGL 装载阶段都会记录 `load-stage`，普通模式下也能回看最后卡在哪一步。

## 存储位置

健康事件只写入浏览器本地：

- `localStorage["webgl-generator-health-events-v1"]`
- `window.__webglGeneratorHealth.getEvents()`
- 开发模式浮层的“健康监测”列表
- 控制台 `[FMG health]` 日志
- 页面事件 `webgl-generator-health-event`

本地记录是环形日志，默认保留最近 `180` 条。它不是用户地图数据的一部分，也不会随地图导出。

## 主要阈值

当前默认阈值：

| 事件 | 阈值 |
|---|---:|
| 主线程长任务 | `200ms` |
| 渲染帧间隔 | `2000ms` |
| 输入派发延迟 | `120ms` |
| 输入处理阻塞 | `250ms` |
| 业务同步操作 | `250ms` |
| loading 未收起 | `12000ms` |
| 首张地图未 ready | `20000ms` |

超过阈值会记为 `warn`；达到阈值 `4` 倍以上会记为 `error`。

## 查询方式

在浏览器控制台中：

```js
window.__webglGeneratorHealth.getEvents()
```

只看最近的警告和错误：

```js
window.__webglGeneratorHealth.getEvents()
  .filter(event => event.severity !== "info")
```

清空本地健康日志：

```js
window.__webglGeneratorHealth.clear()
```

也可以在地址栏临时加参数：

```text
?healthClear=1
```

如果页面脚本没有启动，仍可直接读取：

```js
JSON.parse(localStorage.getItem("webgl-generator-health-events-v1") || "[]")
```

## 事件字段

每条事件包含：

- `type`：事件类型，例如 `render-frame-gap`。
- `severity`：`info / warn / error`。
- `at`：真实时间。
- `pageTimeMs`：页面生命周期内的相对时间。
- `url`：发生事件的页面地址。
- `detail`：事件细节，例如耗时、loading 文案、业务操作名、最后阶段等。

## 设计约束

- 不上报远端，不写入地图保存文件。
- 不依赖开发模式；开发模式只是显示入口。
- 记录必须足够轻，不能为了监测本身制造明显卡顿。
- 长任务、帧间隔和输入延迟是浏览器级信号；业务阶段和操作耗时是应用级信号，两者互补。
- 后续如果要做更强的自动回放或截图，应先保持本地开关，不默认上传或持久化用户敏感操作。

## 画布交互专栏

开发模式浮层新增“画布性能”：显示近 10 秒国家画笔预览次数、P95、最大值和提交最大值，并列出最近 16 条阶段样本。预览拆分采样、写入、绘制；提交显示历史执行、刷新及国家派生统计耗时。只更新有变化的 cell 时也保留逐笔样本，便于比较优化前后。

`window.__webglGeneratorHealth.getCanvasSamples()` 可读取当前页面最近 160 条样本；`getCanvasMonitoringSupport()` 返回浏览器对 Long Tasks、Long Animation Frames、Event Timing 的支持情况。主线程卡住时 JavaScript 不能即时刷新浮层；浏览器性能条目会缓冲，恢复后补采长任务、长帧和输入派发/处理耗时。超过 200ms 的画笔阶段另外写入原有本地健康事件环形日志。监测不上传地图或用户操作内容；现有浏览器 API 足以提供阻塞后的记录，因此本项不安装额外浏览器扩展。

## 当前缺口

- 无法在主线程完全死循环期间实时写入“正在死循环”的最后一刻，只能记录死循环前的最后阶段和浏览器恢复后的长任务/帧间隔。
- `PerformanceObserver longtask` 依赖浏览器支持；不支持时仍有帧间隔和输入延迟作为兜底。
- 当前没有远端聚合，跨浏览器或跨机器排查仍需要用户保留本地页面或复制日志。
