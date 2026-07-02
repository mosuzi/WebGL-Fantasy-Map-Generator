# FMG WebGL 地图生成器

这是一个面向世界构建者、TRPG 主持人、架空历史作者和地图爱好者的幻想地图生成器实验项目。它参考 [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator) 的生成思想、数据结构和视觉表达，尝试用 WebGL 重新组织一次“山海初开”的过程：让地形、气候、河流、城镇、国家、文化、宗教、贸易和冲突在同一张可编辑的地图上生长出来。

我希望它最终不只是一个“生成一张图”的工具，而更像一张可反复进入的世界草稿。你可以先让程序给出大陆、山脉和诸侯，再沿着河流追踪城市为什么诞生，在资源和道路之间观察贸易如何变形，在文化、宗教和政治边界之间寻找故事的缝隙。地图不是背景板，而是世界设定本身的一部分。

## 为什么做这个项目

Azgaar 的 Fantasy Map Generator 已经证明了程序化幻想地图可以有多迷人：它把地形生成、政治边界、文化圈、河流、道路和标注组织成一个完整的创作系统。本项目从这份启发出发，探索另一个方向：

- 用 WebGL 承担大地图绘制和频繁视图切换，让画布更适合高密度编辑。
- 把地图对象尽量做成可追溯、可编辑、可导出再导入的数据，而不是一次性的渲染结果。
- 对中文世界构建更友好，逐步改善国家、城市、文化和宗教命名的中文语感。
- 为后续的贸易、军事、纹章、主题、测量、导入导出和叙事工具留下空间。

这不是对原项目的替代，而是一次带着敬意的重写和再想象。原项目像一座已经点亮的灯塔，本项目是在它照到的海面上继续试航。

## 现在可以做什么

当前版本已经可以生成并浏览一张 WebGL 幻想地图，支持高度、气候、河流、国家、省份、文化、宗教、城市、道路、资源点、贸易、外交和军事等基础数据。你可以切换不同视图，打开对象面板查看或轻量编辑地图对象，也可以导出图片、完整地图数据和部分 GeoJSON 数据。

项目仍处在活跃开发期：很多能力已经能玩，但还没有到“最终产品”的稳定程度。接下来会继续把编辑面板、导入导出、经济贸易、军事事件、纹章、主题样式和原版功能对齐做得更完整。

## 本地运行

```powershell
pnpm install
pnpm run dev
```

默认开发服务器地址：

```text
http://127.0.0.1:5410
```

需要查看生成耗时、WebGL 统计和内部状态时，可以打开开发模式：

```text
http://127.0.0.1:5410/?debug=1
```

常用检查命令：

```powershell
pnpm run build
pnpm run profile:e2e -- --browser-channel chrome
pnpm run regress:rendering
```

## 仓库结构

- `app/webgl-generator`：新的 WebGL 地图生成器应用。
- `docs`：开发计划、专题设计、性能记录和阶段日志。
- `tools`：本地 profiling、回归和辅助脚本。
- `source/Fantasy-Map-Generator`：原 Fantasy Map Generator 的只读参考源码，用于理解行为、数据和视觉效果。

## 向原作者致敬

本项目基于对 [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator) 的长期学习和致敬。Fantasy Map Generator 由 Max Haniyeu（Azgaar）创作，并由社区持续贡献，它不仅是一个出色的地图工具，也是一套很值得研究的程序化世界生成范式。

本仓库保留 `source/Fantasy-Map-Generator` 作为参考实现。原项目的版权与许可证声明保留在 `source/Fantasy-Map-Generator/LICENSE` 中。

## License

本项目以 MIT License 发布，详见 [LICENSE](./LICENSE)。
