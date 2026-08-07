# 第 301 项：100k 高度笔刷停手后完整主线程阻塞与最终绘制修复

## 当前状态

进行中。第 300 项的 `lastCommitPerformance` 只覆盖 `finishHeightStroke` 之后的提交阶段，本项补齐从 pointerdown 到停手后下一帧的完整证据；当前精确 `http://127.0.0.1:5410/?debug=1` 标签页已核对，测试样本已通过撤销恢复，不刷新、不重生成、不覆盖用户地图。默认“陆地 + 保持水陆面”的岸线停手卡顿已完成局部修复；故意跨越海平面的拓扑变化保留为独立边界。

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

## 301-E：高度编辑作用范围高亮与拾取（待后续实施）

- 新发现：开启高度编辑后，当前作用范围高亮会被取消；用户看不到高度编辑的作用范围，且范围内 cell 无法按预期选中或反馈。
- 边界：只修复高度编辑模式与作用范围 overlay / picking 的生命周期、显隐和优先级；保留普通悬停、cell picking、高度笔刷预览、选择事务及地图数据语义，不在本子任务中修改高度算法或存档。
- 最小验收：进入和退出高度编辑、切换作用范围、移动光标、点击范围内 / 外 cell、取消笔刷后，高亮均与当前 scope 和半径一致；10k / 100k、桌面 / 窄视口、console / page / health / WebGL 错误为 0。

## 最小验收与回滚

- 10k / 100k 相同真实指针操作：停手完整耗时 p50 / p95 / 最大值、`500ms+` 长任务数量、最大输入延迟、最大帧间隙、draw / overlay / surface 次数、heap、checksum、地图数据、撤销 / 重做、console、page、health、WebGL 和真实视觉。
- 回滚只撤销第 301 项新增 telemetry / 调度优化；保留第 300 项提交，不触碰用户当前地图、第 284 项存档兼容和 `source/`。
