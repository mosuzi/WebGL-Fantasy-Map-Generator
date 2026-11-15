# 第 412 项：画布现行实测与 WebGPU Cell 对照

## 测量范围

2026-11-15，在 Windows Chrome 157、当前源码 `0.5.132` 的正式构建上运行现行国家画笔、视口线层和国界专项；另用 `prototype/webgl-cells/data/sample-map.json` 的匿名固定快照运行 WebGL2 / WebGPU 对照页。专项浏览器为独立测试实例，不能代表用户正在打开的地图。用户原 Chrome 标签页已按精确身份核对，存在未保存修改；本次只读其健康日志并恢复控制面板原页，未刷新或涂抹该地图。

| 入口 | 数据与口径 | 结果 |
|---|---|---|
| 国家画笔 | 正式构建，10k / 100k 固定生成图；画笔真实 pointer 手势、异步提交与撤销 | 提交 `37.1 / 91.4ms`；预览最大 `23.7 / 36.8ms`；撤销墙钟 `31.5 / 74.7ms`；交互卡顿告警和 WebGL 错误均为 `0` |
| 连续缩放 / 平移 | 正式构建 `10,004` 格默认生成图，10 次滚轮、12 次中键平移；`renderer.draw` CPU 提交计时 | 缩放 p95 `0.2ms`、平移 p95 `0.2ms`；两段 LongTask 各 `0`，道路、河流缓存最后收敛；页面错误 `0`。这是 10k 视口结果，不代表 100k |
| 国界晕染 | 正式构建 100k 固定生成图；一次关闭 / 开启对比，1024×678 合成目标、2638 条边界段 | 关闭时 draw `0.1ms`，开启后 draw `0.5ms`，其中合成器 `0.5ms`；目标阶段 LongTask `0`，像素往返与 WebGL 错误门通过。这是单次 CPU 观测，未测 GPU 完成或高分位 |
| 用户当前地图 | 已接管的原 Chrome 标签页，只读浏览器健康日志 | 本次控制面板页切换附近出现 3 条 `input-handler-stall`；监控阈值为 250ms，但日志接口未暴露具体耗时 / 堆栈，不能定位到某个函数，也不能用固定夹具的通过覆盖该现场 |

旧 `profile:canvas-state` 总览脚本未列为通过：它同步检查 `layers.setViewMode` 的返回值，而现行显示操作已异步，100k 运行在首个色彩切换处失败。先用单动作 trace 归因，确认是夹具接口漂移，停止继续重跑整套 transitions；本项采用上表仍有效的现行专项。

## 同输入图形 API 对照

新页面位于 `prototype/webgl-cells/webgpu.html`，复用既有快照的 `99,846` 个 grid cells 与 `1,795,563` 个三角形顶点。两后端使用同一 `Float32Array` 位置和专题颜色、相同 681×495 像素画布、相同相机路径，只画 cell 色面。Chrome headless、DPR 1 的 60 帧国家专题测量：

| 指标 | WebGL2 | WebGPU |
|---|---:|---:|
| CPU 命令编码 / 提交 p50 | 约 `0.0ms` | 约 `0.1ms` |
| CPU 命令编码 / 提交 p95 | 约 `0.1ms` | 约 `0.2ms` |
| 动画帧间隔 p95 | `6ms` | `6ms` |

高度与国家专题的两张浏览器截图平均 RGB 通道差分别为 `4.09` 与 `2.72`，说明画面近似一致，未用逐像素相等掩盖光栅化差异。高度、国家、滚轮缩放、适配视图、60 帧测量、无 WebGPU 降级、390px 窄屏与浏览器错误门均通过；主测试要求真实启用 WebGPU，降级测试另核对 WebGL2 地图可见。WebGPU 不可用时仍显示 WebGL2 地图；正式应用没有接入这个试验后端。

这些数字只测 JS 发出绘制命令的时间和浏览器动画帧节奏。WebGPU 的 `queue.submit()` 与 WebGL2 的 `drawArrays()` 都不能单独代表 GPU 完成时间；两个后端与正式渲染器的图层也不同，不能由此声称全图性能改善。浏览器内初版把快照 JSON 解析和历史原型的全层数据构建放在主线程，观测到 `228 / 619ms` 两条 LongTask。对照页现在用 Worker 完成同一固定快照的解析、全层数据构建和国家颜色预建，再向主线程移交两后端共享的 cell 数据；最终版本一次后台采样各阶段分别为 `290.4 / 414.8 / 91.1ms`，合计约 `796.3ms`，主线程 LongTask 为 `2` 条、`77 / 51ms`、超过 `200ms` 为 `0`。这两条残余任务记录在 demo 首次加载和双后端准备的完整窗口内，尚未从窗口内进一步精确到函数。后台准备耗时并未被 WebGPU 消除，且不能把全层构建时间归为仅 cell 几何。对照页专项把主线程 `>200ms` 写成硬断言。

## 架构判断

目前证据不支持为了 cell 色面绘制而直接替换正式 WebGL2。正式国家画笔提交仍有针对 pack cells 的汇总扫描；国界晕染在每次开启的 draw 中执行 WebGL canvas → 2D canvas 的拷贝、模糊、边界 mask 与纹理回传。这些是值得在用户当前地图上分段跟踪的具体链路；本次 100k 单次晕染样本没有显示它已构成卡顿主因。浏览器现场的 3 条输入告警需要能取得具体持续时间、LongTask / Long Animation Frame 与相应操作阶段后再归因。WebGPU 的 compute 能力可作为未来候选，但本 demo 只验证图形绘制入口，不为正式迁移提供收益证明。

## 复验

```powershell
pnpm run build:app
pnpm run regress:state-brush-performance-browser -- --summary
pnpm run regress:viewport-line-preview-browser
node --no-warnings tools/webgl-generator-state-color-border-browser-regression.mjs --100k
pnpm run regress:webgpu-cells-browser
```

浏览器截图和原始 JSON 位于本地 `work/task412-webgpu/`；该目录不入库。页面和脚本可按上述命令重建证据。
