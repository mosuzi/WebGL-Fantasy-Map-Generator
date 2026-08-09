# WebGL cells 历史原型

这是正式独立生成器之前的 WebGL2 快照 demo。它从 `data/sample-map.json` 读取固定地图快照，用于保留 cells 几何、专题色、线层、拾取、HTML/SVG overlay，以及高度、河流和国家轻量编辑交互的早期对照。它不是正式地图应用，也不是用户存档编辑器。

## 运行

```powershell
pnpm run start:prototype
```

打开 `http://127.0.0.1:5400/`。

在线预览：[WebGL cells 历史原型](https://fmg.mosuzi.top/prototype/web-cells/)。

## 可观察的内容

- 顶部专题可切换高度、生物群系、国家、省份、文化、宗教和温度。
- 图层区可显示或隐藏地表、水体、边界、路线、河流、点、标签、纹章等早期渲染层。
- 编辑区只演示高度笔刷、河流轻量操作、国家取样 / 涂抹以及 demo 内的撤销 / 重置；所有结果都留在该页内存。
- 右侧统计、悬停信息和 canvas 交互用于对照当时的 geometry、GPU 上传、图层与 picking 策略。

## 边界与验证

- 固定样本不是当前用户地图；不得用此页导入、保存、覆盖或宣称修改了正式地图。
- 正式应用位于 `app/webgl-generator/`，默认入口为 `http://127.0.0.1:5410/`；正式编辑、存档、导出和公开 API 只能走正式应用链。
- 本原型没有独立功能回归。目录、样本或静态部署入口变动后运行 `pnpm run regress:deployment`；源文件语法检查和正式构建按实际改动范围选择。

完整的四个实验室定位、部署与维护规则见 [`../../docs/architecture/laboratory-prototypes.md`](../../docs/architecture/laboratory-prototypes.md)，AI 操作边界见 [`../../docs/ai/laboratory-prototypes.md`](../../docs/ai/laboratory-prototypes.md)。
