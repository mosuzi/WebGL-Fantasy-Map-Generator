# 第 301 项：100k 高度笔刷停手后完整主线程阻塞与最终绘制修复

## 当前状态

补充验收完成。第 300 项的 `lastCommitPerformance` 只覆盖 `finishHeightStroke` 之后的提交阶段，本项补齐从 pointerdown 到停手后下一帧的完整证据；当前精确 `http://127.0.0.1:5410/?debug=1` 标签页已核对，测试样本已通过撤销恢复，不刷新、不重生成、不覆盖用户地图。默认“陆地 + 保持水陆面”的岸线停手卡顿已完成局部修复；故意跨越海平面的拓扑变化保留为独立边界。301-E 的真实选区高亮、面板状态语义和画笔偏好也已闭合。

## 纠正后的问题现象

- 用户实测连续涂抹过程中基本流畅，但松手后整画布约卡顿 `500～1000ms`。
- 第 300 项记录的 `3～4ms` 只是普通 100k 提交中最后一次 draw 的函数耗时，不能代表浏览器事件处理、末点补刷、GPU / overlay 实际帧和长任务。

## 只读调查证据

- 当前用户精确标签页 `http://127.0.0.1:5410/?debug=1` 的历史健康日志包含成组 `main-thread-long-task`、`render-frame-gap`、`input-delay`；在真实连续长路径样本后再次出现同类事件，停手后的撤销按钮曾因 CDP 输入等待主线程恢复而超时，随后页面恢复并成功撤销，地图没有留下测试样本。
- 隔离生产 Chrome 的 `99846` cells 普通陆地样本中，旧 trace 的 commit 总段约 `13.9～18.6ms`，但首次 pointerdown 另有约 `58ms` 事件与 `56ms` long task；这证明首次输入和末点补刷没有进入第 300 项提交 trace，但普通样本尚未覆盖用户的长卡顿。
- 同一隔离生产页把笔刷中心固定到真实 `shoreVisualPaths` 的可视岸线 cell 后，`292～314` 个受影响 cell 的 `pointerup` 为 `6969～7178ms`，`commitTotal` 为 `6961.1～7172.6ms`；`refreshHeightCells` 为 `6951.7～7161.8ms`，返回 `incremental=false`、`spans=1`、`reason=shore-or-land-water-change`。其内部另记录到 `refreshCellSurface` `449.6～475.0ms`，同时观察到 `6968～7177ms` long task、`6964.6～7176.4ms` frame gap，`pointerup` event duration 为 `6984～7184ms`。这与用户“停手后整画布卡住”完全同类且量级更严重。
- 修复前源码证据：高度笔刷提交命令复用 `HEIGHT_SURFACE_ONLY`，其 `deferTerrainRefresh` 为 `false`；旧版 `refreshHeightCells` 以 `shoreCells.has(gridCell) || storedSide !== currentSide` 判定拓扑重建。命中任一岸线 cell 即同步执行 `rebuildCellVisualMesh`、`rebuildShoreVisualCache` 和整面 `refreshCellSurface`，所以并非只改动被涂抹的 cell。
- 高度路径存在两类首次使用的惰性结构：`height-cell-spatial-index.js` 首次查询会遍历全部 Grid Cell 建立空间桶；`height-edit-commands.js` 的 `getPackCellsForGrid` 首次调用会扫描全部 pack cell 建立 Grid → Pack 映射。二者当前都可能发生在 pointerdown / pointermove / pointerup 末点补刷之外的漏测阶段。
- 当前 pointerup 顺序是：取消待执行 brush RAF → 末点强制补刷 → 建立高度命令并执行 → `refreshHeightCells` → `renderer.draw()` → 高度面板统计 / 预览 / DOM；第 300 项虽然抑制了末点补刷 draw，但仍在提交阶段保留一次最终 draw。

## 301-B 实施结果：同侧岸线改为局部 buffer 刷新

- 新增四组岸线 surface correction / cover 的 cell → GPU span 索引，复用正式 `buildShoreSurfaceDrawPacket` 的命令顺序；同水陆侧变化只通过 `bufferSubData` 更新受影响颜色，不再因“命中了岸线 cell”而重建全图 cell mesh 和岸线缓存。
- 完整拓扑重建条件已收紧为 `storedSide !== currentSide`。因此默认高度面板的陆地笔刷在岸线附近仍保持水陆侧时走增量路径，视觉数据、历史事务和派生 stale 语义不变。
- 隔离生产 Chrome 的真实 100k 岸线样本触碰 `58` 个 cells，停手墙钟约 `43.4ms`、提交约 `10.4ms`；正式 10k / 100k 回归均断言岸线样本为 `incremental=true` 且停手小于 `500ms`，console、page、health、WebGL 均为 `0`，撤销 / 重做通过。

## 301-A：完整生命周期 telemetry

- 记录 pointerdown、每个实际 brush RAF、末点补刷、空间索引 / Grid→Pack 首次构建、历史命令、局部 buffer、draw、overlay、面板 DOM、pointerup 后长任务、输入延迟、帧间隙、heap 和恢复时间。
- 以真实指针事件和隔离系统 Chrome 对照 10k / 100k；自动化拖动传输耗时与页面主线程耗时分开，不把 CDP 发送成本当成产品卡顿。

## 301-B：岸线笔刷的局部颜色刷新

- 证据：当前真实岸线样本的 `6.95～7.16s` 明确来自 `shore-or-land-water-change` 分支；普通样本的最终 draw 仅为毫秒级。岸线 cell 在水陆侧未改变时，几何和 shore 路径不变，只需更新对应 surface / correction / cover buffer 的颜色。
- 边界：新增岸线 cell→GPU buffer span 索引；同侧高度变化走局部 `bufferSubData`，只有水陆侧发生变化或索引不完整时才保留完整拓扑重建。跨海平面不得静默跳过安全刷新。

## 301-C：跨水陆拓扑变化的局部刷新（已完成）

- 目标：在不使用陈旧岸线几何的前提下，把跨水陆变化限制到变更 cell 的邻接闭包、受影响的 source path 和 surface 变化区域。
- 实施：`cell-visual-layer` 新增局部 mesh 刷新，重建变更 cell 及其入 / 出邻接影响 cell，并重新核对当前岸线边集合；`shore-layer` 重新生成当前 source edge 分组，仅对 source key 变化的路径执行拓扑快照，未变化路径复用既有最终几何。局部安全边界、保护对象和 side sample 不足或重建数量超过上限时返回空结果，由 renderer 回退完整重建。
- surface 边界：稳定的 cell 三角 span 使用局部 `bufferSubData`；拓扑导致 span 长度改变时，将受影响 cell 写入独立 `surfacePatchBuffer` 叠加绘制，同时复用已有 correction / cover buffer 的颜色更新，下一次完整 surface 刷新回收旧 correction 几何。局部路径与完整路径的职责边界可观测，不能以旧几何静默完成。
- 验证：隔离生产 Chrome 的 100k 跨水陆样本核心 `refreshHeightCells` 约 `144ms`，pointerup 墙钟约 `192ms`；局部与完整重绘的 path key、path geometry、cell mesh、shore edge 和最终 `readPixels` 均一致（像素差 `0`）。正式 10k / 100k 回归的 console、page、health、WebGL 错误为 `0`，撤销 / 重做通过。
- 兼容性与回滚：不改变地图数据、height / grid schema、存档、公开 API、历史事务或 `source/`；只回退 301-C 的局部拓扑和 surface patch 路径即可恢复 301-B 的完整拓扑安全回退。

## 301-E：高度编辑作用范围高亮与拾取（补充验收完成）

- 根因：高度选区的权威状态保存在 `heightEdit.terrainSelection`，但部分画布工具退出路径会清空 renderer 共享的高度选区 GPU 缓冲；重新进入高度编辑时若只切换主题，就会出现状态仍在、画面高亮消失的分离状态。
- 实施：进入 `height:brush` 时完成缓存预热和主题切换后，读取当前 `terrainSelection.cellIds` 及羽化权重，恢复 renderer 高度选区缓冲并补一帧视觉绘制；同时主动调度 brush cursor，保证鼠标重新回到画布后当前 scope / 半径立即可见。没有选区时保持原有空状态。普通悬停、cell picking 和选择事务继续复用原链路。
- 实施：debug 动作 / 作用范围按钮补齐 `.active` 与 `aria-pressed`；Element Plus 图标按钮、普通高度动作 / 作用范围分段按钮均增加选中且禁用的独立视觉样式，禁用透明度不再遮掉当前选择。全局画笔大小使用 `webgl-generator-height-editor-preferences-v1` 保存并按高度画笔契约归一化，默认值仍为 `28`。
- 证据：专项回归在真实生产 Chrome 10k / 100k 页面中点击动作、作用范围和“覆盖锁定”，真实形成 `3327 / 39862` 个选区 cells；随后故意清空 renderer 选区缓冲，再通过真实“停止 → 启用”模式入口断言两档恢复原高亮数量。两档动作 / 作用范围 `aria-pressed="true"`、画笔值 `42`、光标半径 `42` 保持，关闭 / 重开面板和页面刷新后的半径仍为 `42`；地图 checksum、撤销 / 重做、console、page、health、WebGL 门禁通过。
- 兼容性与回滚：不改变地图数据、height / grid schema、存档、公开 API、历史事务或 `source/`；只回退模式进入时的视觉状态恢复 helper 与专项断言即可恢复原显示链路。

### 301-E 补充验收条件

- 高度面板的动作、作用范围、平滑 / 选择、全局工具和其它带当前状态的按钮，在启用高度编辑、关闭再打开面板、退出再进入 `height:brush` 后必须保持正确选中态。验收先分别检查运行时选项、DOM 的 `.active` / `aria-pressed`，再检查视觉像素；若按钮同时不可用，必须使用独立的“选中且禁用”样式，不得用普通 disabled 透明度覆盖当前选择，也不得让用户误以为没有选中。
- 高度画笔大小必须成为全局用户偏好，而不是每次高度面板初始化时回到默认值 `28`。首次没有偏好时默认 `28`；用户修改后关闭 / 重开面板、退出 / 重新进入高度编辑和刷新页面都保持同一合法值。偏好写入现有用户偏好存储，不进入地图 schema、地图 JSON、gzip 存档或历史命令。
- 最小回归：10k / 100k、普通高度编辑和 debug 高度编辑各覆盖一次；固定选择一个非默认动作、作用范围和画笔大小，执行启用 → 关闭 → 重开 → 刷新 → 再启用链路，断言按钮语义、视觉状态、画笔半径和光标半径一致，地图 checksum、历史、console、page、health、WebGL 不产生非预期变化。
- 当前不实施：不把按钮状态混入地图存档，不用“全部按钮都保持可用”掩盖状态问题，不仅调整 disabled 颜色而跳过运行时状态 / DOM / 视觉三层核对。

## 301-D：高度编辑首次索引预热（已完成）

- 目标：把高度空间桶和 Grid→Pack 映射的首次全图扫描从 pointerdown / pointerup 移到进入 `height:brush` 模式的受控阶段，避免首次笔刷把索引构建伪装成停手卡顿。
- 实施：`height-cell-spatial-index` 暴露受控预热并返回 ready、cellCount、bucketCount、耗时；高度命令模块复用同一 `ensurePackCellsByGrid` 建立并缓存 `__heightEditorPackCellsByGrid`，返回 ready、gridCount、packCellCount、耗时。高度工具模式进入时同步执行一次并记录到 `heightEdit.lastCacheWarmup`，缓存仍为运行时非存档字段。
- 证据：隔离生产 Chrome 的 10k 预热总耗时约 `5.1ms`，100k 实际 `99846` cells 预热总耗时约 `14.5ms`（空间索引 `9.5ms`、Grid→Pack `4.9ms`）；随后正式 10k / 100k 高度笔刷、跨水陆局部拓扑、撤销 / 重做回归通过。
- 兼容性与回滚：不改变地图数据、schema、存档、公开 API、历史事务、索引查询结果或 `source/`；只回退进入高度模式时的预热调用和两个诊断返回值即可恢复原惰性建立。

## 最小验收与回滚

- 10k / 100k 相同真实指针操作：停手完整耗时 p50 / p95 / 最大值、`500ms+` 长任务数量、最大输入延迟、最大帧间隙、draw / overlay / surface 次数、heap、checksum、地图数据、撤销 / 重做、console、page、health、WebGL 和真实视觉。
- 回滚只撤销第 301 项新增 telemetry / 调度优化；保留第 300 项提交，不触碰用户当前地图、第 284 项存档兼容和 `source/`。
