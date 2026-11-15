# WebGL cells 历史原型

这是正式独立生成器之前的 WebGL2 快照 demo。它从 `data/sample-map.json` 读取固定地图快照，用于保留 cells 几何、专题色、线层、拾取、HTML/SVG overlay，以及高度、河流和国家轻量编辑交互的早期对照。它不是正式地图应用，也不是用户存档编辑器。

## 运行

```powershell
pnpm run start:prototype
```

打开 `http://127.0.0.1:5400/`。

在线预览：[WebGL cells 历史原型](https://fmg.mosuzi.top/prototype/web-cells/)。

同目录的 [WebGPU / WebGL2 地图场景对照](./webgpu.html) 可在本地 `http://127.0.0.1:5400/webgpu.html` 打开；部署后位于 `/prototype/webgl-cells/webgpu.html`。它读取相同的固定快照，在 Worker 中准备共享绘制包。默认复合场景同时显示国家色面、湖与海岸、平滑行政边界、路线、河流、城市图标、标记和避让后的标签；可单独开关国界晕染，也可切到仅格网控制组。两后端共用几何、颜色、层序、相机、画布尺寸和效果参数。页面按场景测量 60 帧，并单列共享的一次性准备 / 上传、CPU 提交、完成等待、晕染回读和标签更新；仅格网控制组比较逐帧绘制。浏览器不支持 WebGPU 时明确显示原因，WebGL2 仍可查看。

## 可观察的内容

- 顶部专题可切换高度、生物群系、国家、省份、文化、宗教和温度。
- 图层区可显示或隐藏地表、水体、边界、路线、河流、点、标签、纹章等早期渲染层。
- 编辑区只演示高度笔刷、河流轻量操作、国家取样 / 涂抹以及 demo 内的撤销 / 重置；所有结果都留在该页内存。
- 右侧统计、悬停信息和 canvas 交互用于对照当时的 geometry、GPU 上传、图层与 picking 策略。

## 边界与验证

- 固定样本不是当前用户地图；不得用此页导入、保存、覆盖或宣称修改了正式地图。
- 对照页的复合场景是对正式国家视图**工作类别**的模拟，不是正式 renderer 的逐像素复刻；快照缺正式 canonical grid 的部分邻接、行政归属及岸线修正资料，平滑和晕染使用确定性的共享实验实现。它不含正式画笔事务。GPU 完成等待包含浏览器调度，绘制流程墙钟不含浏览器最终的屏幕绘制与合成；单次机器结果不能直接推断正式编辑器整体性能。
- 正式应用位于 `app/webgl-generator/`，默认入口为 `http://127.0.0.1:5410/`；正式编辑、存档、导出和公开 API 只能走正式应用链。
- 原历史页没有独立功能回归；对照页先运行 `pnpm run regress:webgpu-complex-scene` 检查固定快照与图层，再运行 `pnpm run build:app` 和 `pnpm run regress:webgpu-cells-browser` 检查双后端、近景平滑与晕染、控制组、降级和窄屏。目录、样本或静态部署入口变动后运行 `pnpm run regress:deployment`。

完整的四个实验室定位、部署与维护规则见 [`../../docs/architecture/laboratory-prototypes.md`](../../docs/architecture/laboratory-prototypes.md)，AI 操作边界见 [`../../docs/ai/laboratory-prototypes.md`](../../docs/ai/laboratory-prototypes.md)。
