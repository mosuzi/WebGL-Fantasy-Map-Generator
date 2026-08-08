# 第 302 项：城镇手动移位完整闭环

## 当前状态

已完成。第 302 项确认并验收既有城镇移动实现，补齐真实系统 Chrome 回归入口和统一画布工具管理器的静态契约；未接管或刷新用户当前 Chrome 标签页，未修改 `source/`。

## 目标

允许用户在当前地图中直接选中并拖动城镇到合法目标位置，先得到可见预览，再确认或取消；确认后以一条可撤销事务完成城镇 / burg 的位置迁移，并同步所有受影响引用。

## 现有基础与证据

- 正式应用已有 `city:move`、`createMoveCityCommand`、`inspectCityMove` 和 `bindCityRelocationDrag`，但当前登记不把这些入口等同于完整验收。
- `docs/task-notes/city-relocation-product-rules.md` 已冻结普通城镇归属跟随、港口失效、首都不得跨国、省会不得跨省、市场中心和路线局部重寻规则；第 302 项以该文档为规则基线。
- 城市同时存在 `settlements.cities`、`pack.burgs`、`grid.cells.burg`、`pack.cells.burg` 和国家 / 省份 / 市场 / 路线镜像，单改坐标会留下引用不一致。

## 改动边界

- 覆盖普通城镇、港城、首都、省会和市场中心的地图拖动、目标预览、合法性提示、确认 / 取消、picking、标签、统计、导出和历史。
- 成功移动保持 city ID、burg ID、名称、人口和允许保留的身份；按目标 cell 重算归属、港口和位置派生字段；关联陆路局部重寻，失效海路在预检中明确显示。
- 预览不修改地图和历史；确认只产生一条命令；任何目标校验、港口解析、路线重寻或写入失败都整单回滚。

## 依赖与排除

- 依赖第 73 项城市移动规则、第 217～218 项城市规模 / 行政角色规则、既有路线编辑和旧数据迁移链。
- 不实现国家合并 / 拆分、自动迁都、自动重选省会、全局路网重生成或新的港口生成算法；`source/` 不改。

## 最小验收

- 在隔离系统 Chrome 中对 10k / 100k 地图分别拖动普通城镇、港城以及行政角色城镇；合法目标先预览，取消后地图数据、checksum、历史和视觉完全恢复，确认后只新增一条历史。
- 水域、已有城镇、跨国首都、跨省省会、港口失效和路线无法局部重寻等反例返回结构化原因，不留下半移动；成功后 city / burg 双镜像、占位、归属、路线、标签、picking、PNG 和完整导出一致。
- 撤销 / 重做、旧 JSON / gzip / 浏览器存档往返、生产构建、console、page、health、WebGL 和窄视口真实操作通过。

## 影响与回滚

- 影响地图数据及既有城市编辑 API / UI 事务语义；不新增必填 schema 字段，旧存档继续可加载，若需要新增诊断字段必须保持可选。
- 通过移动前后完整快照和既有 `EditHistory` 回滚；预览取消、校验失败或派生刷新失败均不写图、不写历史。

## 完成记录

- 只读审计确认 `inspectCityMove` 已覆盖陆地 / 占位、国家 / 省份边界、普通城镇、港城、首都、省会、市场中心、陆路局部重寻和失效海路明示删除；`createMoveCityCommand` 使用受影响城市、burg、cell、政治、市场和路线的有界快照，写入或派生刷新失败时整单恢复。
- 既有核心回归的静态契约曾要求 Escape 直接调用 `CITY_MOVE` 取消，但当前统一画布工具管理器已按活动模式通用取消；回归已改为锁定通用 Escape 入口并额外确认 `CITY_MOVE` 注册，不改变运行时语义。
- 新增 `pnpm run regress:city-relocation-browser`，使用隔离系统 Chrome 和独立 Vite 页面，以真实鼠标指针完成面板入口、城市拖动、落点预览、Escape 取消、重新进入、提交、Ctrl+Z / Ctrl+Y；不使用用户当前标签页，不生成替代用户地图。

## 验收证据

- 隔离 Chrome 10k 实际为 `10004` grid / `5968` pack，选取港城 #20；有效预览迁移至 grid `4496` / pack `2209`，显示港口失效和两条海路删除警告。取消后城市位置、占位、checksum、revision 和历史不变；确认只新增一条历史，picking、selection、撤销和重做通过。
- 隔离 Chrome 100k 实际为 `99846` grid / `63405` pack，选取城镇 #21；有效预览迁移至 grid `39815` / pack `25764`。取消、单事务提交、selection、picking、撤销和重做均通过。
- `pnpm run regress:city-relocation`、`pnpm run regress:city-relocation-browser`、`pnpm run regress:api-roundtrip`、`pnpm run regress:exports`、`pnpm run regress:png-options` 和 `pnpm run regress:api-data-compatibility` 通过；旧 JSON / gzip / browser storage 兼容、完整地图导出、PNG / 高度图及 WebGL error `0` 由相应回归覆盖。普通 application console error 和 page error 为 `0`，`source/` 未改。
- Chrome 回归仍观测到 100k 负载下约 `0.93s` 的 `input-delay`，以及生成 / 重载阶段约 `2.45s`、`4.50s` 的长任务；这些是大地图性能证据，未改变本项的事务正确性验收，后续按性能专题记录，不在第302扩大修改。

## 回滚说明

- 生产代码无需因本项回滚；若只回退本项增补，可删除 `regress:city-relocation-browser` 脚本、撤销旧静态断言更新和本文件的完成证据，不触碰地图数据、存档或 `city:move` 事务实现。
