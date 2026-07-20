# FMG WebGL 地图生成器

这是一个面向世界构建者、TRPG 主持人、架空历史作者和地图爱好者的幻想地图生成器。项目参考 [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator) 的生成思想，以独立的 WebGL 应用重新实现地形、气候、水文、聚落、政治与人文世界生成，并让这些结果可以继续编辑、保存和导出。

## 项目状态

正式应用已经跨过原型阶段，生成、WebGL 渲染、对象编辑、导入导出、公开 API 和自动化验收均已形成完整骨架。项目仍在活跃开发中，尚未作为稳定成品发布。

当前施工顺序和验收口径以[权威任务清单](./docs/current-plan.md#权威任务清单)为准；历史实现与验证证据见[开发日志](./docs/development-log.md)，尚未批准的问题和想法收录在 [FOLLOWUPS.md](./FOLLOWUPS.md)。

## 主要能力

- 生成地形、气候、海岸、水文、洋流、生物群系、聚落、国家、省份、文化、宗教、经济、贸易、外交与静态军事数据。
- 通过 WebGL 绘制地图，并切换高度、气候、政治、人文、经济等专题视图和图层。
- 使用浮动面板选择、定位、创建、修改或删除地图对象，常用编辑支持撤销与重做。
- 导入高度图和完整地图，导出 PNG、JSON、gzip 与 GeoJSON，并兼容旧版地图数据。
- 通过公开 API、快捷键、健康监测和回归脚本支持自动化操作与验证。

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

## 项目说明

项目作者为 mosuzi，代码与文档由 Codex + GPT 协助生成。`source/Fantasy-Map-Generator` 仅作为参考实现和行为对照，不是本应用的改造目标。

感谢 Max Haniyeu（Azgaar）及社区维护的 [Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator)。原项目版权与许可证以其仓库声明为准。

## License

本项目以 MIT License 发布，详见 [LICENSE](./LICENSE)。
