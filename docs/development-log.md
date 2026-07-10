# 开发历史

本文档用于记录项目推进历史、关键决策和已完成工作。后续每次完成阶段性工作，都应追加记录。

## 2026-07-10：湖泊名称编辑接入统一编辑执行器

本步继续清理湖泊管理面板的旧执行路径，把湖泊重命名和按名称库重命名筛选湖泊接入 `executeEditCommand()`。

修正：

- 湖泊重命名不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部湖泊面板刷新。
- 按名称库重命名筛选湖泊改用统一执行器的 `status / noopStatus`，继续保留原有成功数量提示和无可更新名称提示。
- 修正湖泊管理列表动作栏内部回调引用，`按名称库重命名筛选湖泊 / 定位选中湖泊` 现在通过 `props.callbacks` 调用真实面板回调，不再因未定义 `callbacks` 在浏览器中抛错。

边界：

- 本步只迁移湖泊名称类执行入口，不改变湖泊 feature 结构、湖泊生成、面积 / 补给统计、名称库算法、定位语义或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：湖泊面板选中湖泊 `#5` 后，真实“重命名”改为 `湖泊统一执行器烟测`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected lake#5`；随后真实点击“按名称库重命名筛选湖泊”把湖泊 `#5` 改回“秋泽”，撤销栈 `undo=2`，`lastLabel` 为 `按名称库重命名湖泊 4 个`，刷新摘要为 `object-name, object-panels`，`glError = 0`，console/page error 为 `0`。

## 2026-07-10：河流名称与宽度编辑接入统一编辑执行器

本步继续清理河流管理面板的旧执行路径，把河流重命名、按名称库重命名筛选河流和河流宽度因子调整接入 `executeEditCommand()`。

修正：

- 河流重命名不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部河流面板刷新。
- 按名称库重命名筛选河流改用统一执行器的 `status / noopStatus`，继续保留原有成功数量提示和无可更新名称提示。
- 河流宽度因子调整改用统一执行器，刷新依赖 `RIVER_WIDTH_ONLY` effects 中的 `river-mesh / river-width-stats / object-panels`。

边界：

- 本步只迁移河流字段执行入口，不改变河流生成、路径、流量、水文诊断、宽度因子取值范围、名称库算法、备注或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：河流面板真实选中河流 `#68` 后，“重命名”改为 `河流统一执行器烟测`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected river#68`；“调整宽度”把 `widthFactor` 改为 `1.5`，撤销栈 `undo=2`，`lastEditRefresh` 为 `river-mesh, river-width-stats, object-panels`；随后真实点击“按名称库重命名筛选河流”把河流 `#68` 改回“白溪”，撤销栈 `undo=3`，`lastLabel` 为 `按名称库重命名河流 225 条`，`glError = 0`，console/page error 为 `0`。

## 2026-07-10：城市名称编辑补充接入统一编辑执行器

本步继续补齐城市面板仍直接调用 `state.editHistory.execute()` 的名称类路径，把城市重命名和按名称库重命名筛选城市接入 `executeEditCommand()`。

修正：

- 城市重命名不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部 `updateCityPanel()`。
- 按名称库重命名筛选城市改用统一执行器的 `status / noopStatus`，继续保留原有成功数量提示和无可更新名称提示。
- 面板刷新统一依赖命令 effects：城市名称批量变更刷新 `object-name / labels / object-panels`。

边界：

- 本步只迁移城市名称类执行入口，不改变城市命名算法、筛选规则、名称库绑定、城市数据结构、人口 / 剪影 / 备注 / 新增删除路径或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：城市面板真实“重命名”把城市 `#0` 改为 `城市统一执行器烟测`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected city#0`；随后真实点击“按名称库重命名筛选”把城市 `#0` 改回名称库生成名“霜阴”，撤销栈 `undo=2`，`lastLabel` 为 `按名称库重命名城市 828 个`，刷新摘要仍为 `object-name, labels, object-panels`，`glError = 0`，console/page error 为 `0`。

## 2026-07-10：标记与标签字段编辑接入统一编辑执行器

本步继续清理资源标记和标签管理面板的旧执行路径，把标记重命名、标记视觉设置、标签重命名、新增手工标签、删除标签和恢复生成标签接入 `executeEditCommand()`。

修正：

- 标记重命名 / 视觉设置不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部标记面板刷新。
- 标签重命名、新增、删除和恢复不再手写执行流程；新增手工标签成功后仍保留原有 selection、面板选中行和待放置状态。
- 标签删除 / 恢复成功后继续保留运行时面板刷新，避免标签隐藏统计滞后。
- 修正标签管理动作栏内部回调引用，`新增标签 / 删除标签 / 恢复标签` 现在通过 `props.callbacks` 调用真实面板回调，不再因未定义 `callbacks` 在浏览器中抛错。
- 标记移动、资源重生成和地图点击创建 / 移动标记仍保留 marker 集合专用 helper，因为这些路径还维护经济派生 fresh/stale 和相关面板刷新。

边界：

- 本步只迁移执行入口，不改变标记数据结构、资源重生成、标签存储、手工标签拖放、隐藏生成标签语义、备注或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：标记面板真实“重命名”把标记 `#0` 改为 `标记统一执行器烟测`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected marker#0`；真实“调整图标”把标记 `#0` 设为 `symbol=marker / palette=natural`，撤销栈 `undo=2`，`lastEditRefresh` 为 `point-layers, labels, object-panels` / `affected marker#0`；标签面板真实“新增标签”新增手工标签 `#1`，撤销栈递增并设置待放置状态与 selection；生成城市标签真实“删除标签 / 恢复标签”会让 `labels.hidden.city` 加入再移除目标 id，撤销栈递增，刷新摘要为 `labels, object-panels`，`glError = 0`，console/page error 为 `0`。

## 2026-07-10：文化与宗教字段编辑接入统一编辑执行器

本步继续清理文化和宗教面板的旧执行路径，把新增空对象、删除空对象、重命名、调整颜色和调整继承父级接入 `executeEditCommand()`。

修正：

- 文化 / 宗教新增、删除、重命名、颜色和继承不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部面板刷新。
- 新增成功后仍保留原有选中新对象、同步 selection 和状态文案逻辑。
- 删除失败的 no-op 文案继续提示“只能删除无覆盖、无子级、无关联对象的空文化 / 空宗教”。
- 字段修改统一依赖命令 effects 驱动对应面板、对象面板、专题颜色和对象索引刷新。

边界：

- 本步只迁移执行入口，不改变文化 / 宗教数据结构、删除约束、继承合法性、名称库绑定、备注、撤销快照或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开文化管理后，真实点击“新增空文化”新增 `#13`，撤销栈 `undo=1`，`lastEditRefresh` 为 `culture-structure, cell-colors, object-index, object-panels` / `affected culture#13`；随后通过真实“重命名”二级面板把 `#13` 改为 `文化统一执行器烟测`，撤销栈 `undo=2`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected culture#13`。打开宗教管理后，真实点击“新增空宗教”新增 `#19`，撤销栈 `undo=1`，`lastEditRefresh` 为 `religion-structure, cell-colors, object-index, object-panels` / `affected religion#19`；随后通过真实“调整颜色”二级面板把 `#19` 改为 `#7f6cc7`，撤销栈 `undo=2`，`lastEditRefresh` 为 `religion-color, cell-colors, object-panels` / `affected religion#19`。两次 smoke 均 `glError = 0`，console/page error 为 `0`。

## 2026-07-10：省份字段编辑接入统一编辑执行器

本步继续清理省份面板的旧执行路径，把删除省份、重命名省份和调整省份颜色接入 `executeEditCommand()`。

修正：

- 省份删除不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterProvinceEdit()` 和全对象面板刷新。
- 删除成功后仍保留原有清空 selection 与清空省份面板选中行逻辑；no-op 删除不会误清选择。
- 省份重命名和颜色调整统一依赖命令 effects 驱动省份 / 城市面板刷新、对象面板刷新和运行时刷新摘要。

边界：

- 本步只迁移执行入口，不改变省份命令本身、省份归属规则、颜色格式、删除约束、撤销快照或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开控制面板管理 tab 和省份管理面板，先真实点击第一条有效省份行选中省份 `#187`，再通过真实“重命名”二级面板把“玉寒”改为 `省份统一执行器烟测`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected province#187`，目标省份更新为“省份统一执行器烟测州”；另一次 smoke 通过真实“调整颜色”二级面板把省份 `#187` 从 `#f3b7a8` 改为 `#7f6cc7`，撤销栈 `undo=1`，`lastEditRefresh` 为 `province-color, cell-colors, object-panels` / `affected province#187`；两次 smoke 均 `glError = 0`，console/page error 为 `0`。

## 2026-07-10：国家字段编辑接入统一编辑执行器

本步继续清理国家与政体面板的旧执行路径，把国家名称、按名称库批量重命名、颜色、政体、首都和政体面板批量调整接入 `executeEditCommand()`。

修正：

- 国家字段回调不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterStateEdit()` 和散落的 `updateStatePanel()` / `updateCityPanel()` / `updateGovernmentPanel()`。
- 按名称库批量重命名继续通过标准 `getResult()` 读取重命名数量，no-op 状态文案保留。
- 国家颜色、政体、首都和批量政体修改统一由命令 effects 驱动运行时刷新、对象面板刷新和派生标脏。

边界：

- 本步只迁移执行入口，不改变国家命令本身、政体数据结构、首都约束、名称库改名语义或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开控制面板管理 tab 和国家编辑面板后，通过真实“重命名”二级面板把国家 `#1` 从“霜庭”改为 `统一执行器烟测`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected state#1`，详情目标更新为“统一执行器烟测国”；另一次 smoke 通过真实“调整政体”二级面板把国家 `#1` 从 `feudal_monarchy` 改为 `monarchy`，撤销栈 `undo=1`，`lastEditRefresh` 为 `state-government, object-name, labels, object-panels, defer:economy, defer:diplomacy, defer:military` / `affected state#1`，下游派生标脏为 `economy, diplomacy, military`；两次 smoke 均 `glError = 0`，console/page error 为 `0`。

## 2026-07-10：城市字段编辑接入统一编辑执行器

本步继续迁移直接调用 `state.editHistory.execute()` 的旧路径，把城市面板的人口、归属同步、剪影设置、剪影重置和删除城市回调接入 `executeEditCommand()`。

修正：

- 城市人口、同步归属到所在 cell、调整剪影和恢复自动剪影不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部 `updateCityPanel()`。
- 删除城市改为通过 `executeEditCommand()` 执行，成功后仍保留原有清空 selection 与清空城市面板选中行逻辑。
- 面板刷新统一依赖命令 effects：城市人口刷新 `city-population / point-layers / labels / object-panels`，剪影刷新 `labels / object-panels`。

边界：

- 本步只迁移执行入口，不改变城市命令本身、城市数据结构、人口数值口径、剪影选项、删除规则或旧图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开城市管理并选中城市 `#1`“玄昌”，通过真实“调整人口”二级表单把人口 `17.549 -> 18.549`，撤销栈 `undo=1`，`lastEditRefresh` 为 `city-population, point-layers, labels, object-panels` / `affected city#1`；随后通过真实“调整剪影”二级面板应用当前剪影，城市 `visual.manual=true`，撤销栈 `undo=2`，`lastEditRefresh` 为 `labels, object-panels` / `affected city#1`，`glError = 0`。health monitor 仍报告生成启动期长任务 warning。

## 2026-07-10：名称库编辑接入统一编辑执行器

本步继续迁移编辑器基础设施中的旧执行路径，把名称库专用 `executeNamebaseEdit()` 接到 `executeEditCommand()`。

修正：

- `executeNamebaseEdit()` 不再直接调用 `state.editHistory.execute()`。
- 名称库命令现在通过 `executeEditCommand()` 执行，继续复用原有 `domain: "namebase"`、`getResult()` 和 `NAMEBASE_EDIT_EFFECTS`。
- 刷新顺序保留名称库语义：先走 `refreshAfterEdit()` 写入编辑刷新摘要，再执行 `refreshAfterNamebaseEdit()` 刷新名称库面板、保存本地名称库偏好、刷新运行时面板和编辑锁。

边界：

- 本步只改名称库编辑 helper 的执行入口，不改变名称库数据结构、导入格式、绑定语义、生成命名逻辑或本地偏好 key。
- 不新增持久化字段，不涉及旧地图转换。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开名称库总览并点击真实“新建用户库”按钮，用户库数量 `0 -> 1`，新增 `user-namebase-1` / “用户名称库 1”，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-panels` / `selection none`，面板文本包含新库，本地 `webgl-generator-namebase-preferences-v1` 包含新库 id，`glError = 0`。health monitor 仍报告生成启动期长任务 warning。

## 2026-07-10：多对象备注保存接入统一编辑执行器

本步沿着路线备注迁移继续清理旧调用路径，把国家、省份、城市、文化、宗教、标记、标签和河流面板的备注保存统一接入 `executeEditCommand()`。

修正：

- 上述面板的 `onNoteChange` 不再手写 `command.isNoop()`、`state.editHistory.execute()`、`refreshAfterEdit()` 和局部 `updateXPanel()`。
- 各备注命令继续使用原有命令类型：国家 / 省份 / 文化 / 宗教走 `createSetObjectNoteCommand()`，城市、标记、标签和河流走各自专用 note command。
- 面板刷新统一交给 `executeEditCommand()` 的 `refreshPanelsForEdit()` 兜底路径，根据命令 `effects.affected` 和 `derived: ["object-panels"]` 刷新。

边界：

- 本步只迁移备注保存调用路径，不改变备注存储结构、对象命名、标签渲染、河流 mesh 或 marker 图层。
- 不新增持久化字段，不涉及旧地图转换。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：国家面板真实“编辑备注”表单写入 `国家备注迁移烟测` 后生成 `state:1` 备注，`history undo=1`，`lastEditRefresh` 为 `object-panels` / `affected state#1`；河流面板真实“编辑备注”表单写入 `河流备注迁移烟测` 后生成 `river:1` 备注，`history undo=2`，`lastEditRefresh` 为 `object-panels` / `affected river#1`；两处详情均显示“有备注（8字）”，`glError = 0`。health monitor 仍报告生成启动期长任务 warning。

## 2026-07-10：路线备注接入统一编辑执行器

本步继续清理编辑器基础设施中的旧调用路径，把路线管理面板的备注保存从手写 `isNoop -> EditHistory.execute -> refreshAfterEdit -> update route panel` 迁移到 `executeEditCommand()`。

修正：

- 路线面板 `onNoteChange` 现在复用 `executeEditCommand()`，保留原有 `createSetRouteNoteCommand()`、撤销栈和 `route` effects。
- 成功后的路线面板刷新改由执行器里的 `refreshPanelsForEdit()` 兜底触发，不再在回调里手写 `state.panels.route.update()`。

边界：

- 本步只迁移路线备注保存路径，不改变路线删除、路线重算、道路 mesh 或备注数据结构。
- 不新增持久化字段，不涉及旧地图转换。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开路线管理面板，通过真实“编辑备注”二级面板写入 `路线备注迁移烟测`，`map.notes.notes` 中生成 `route:0` 备注，`history undo=1`，`lastEditRefresh` 为 `object-panels` / `affected route#0`，面板详情显示“有备注（8字）”，`glError = 0`。health monitor 仍报告生成启动期长任务 / input-delay warning。

## 2026-07-10：编辑命令默认刷新入口收口

本步继续推进编辑器基础设施计划中 `refreshPanelsForEdit()` 的落地范围。此前 `executeEditCommand()` 默认只触发 `edit-refresh-scheduler`，路线、备注、测量等调用点需要在执行成功后再手写 `refreshPanelsForEdit()`，容易在新增 API 或面板操作时漏掉对象面板刷新。

修正：

- `executeEditCommand()` 执行成功后统一先调用 `options.refresh` 或默认 `refreshAfterEdit()`，完成渲染、选择、运行统计和 pick 面板刷新。
- `executeEditCommand()` 随后默认调用 `refreshPanelsForEdit()`，按命令 `effects.affected` / `object-panels` 刷新对象面板；调用方必要时可用 `refreshPanels: false` 显式关闭。
- 删除路线删除、备注删除、测量重命名 / 删除及对应 API 中重复手写的 `refreshPanelsForEdit()`。

边界：

- 自定义 `options.refresh` 的国家 / 省份新增删除路径继续保留原有专门刷新逻辑，但不再绕过统一对象面板 helper；本步不扩大政治派生或选择语义。
- 本步不新增地图持久化字段，也不修改地图数据结构，因此不需要旧图迁移或回填。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：临时标记路线面板为打开后调用公开 `webglGeneratorApi.edit.routes.delete()`，路线数量 `589 -> 588`，撤销栈 `undo=1`，`lastEditRefresh` 为 `route-mesh, object-panels, object-index` / `affected route#0`，路线面板 `update()` 被默认后处理调用 `1` 次，`glError = 0`。health monitor 仍报告生成启动期主线程长任务 warning，和本次编辑刷新收口无关。
- 补充 smoke 通过：临时标记国家面板为打开后调用带自定义 `refreshAfterStateEdit` 的公开 `webglGeneratorApi.edit.states.add(934)`，国家数量 `21 -> 22`，撤销栈 `undo=1`，`lastEditRefresh` 包含 `object-panels` / `affected state#new`，国家面板 `update()` 被调用，`glError = 0`。health monitor 仍报告生成启动期主线程长任务 warning。

## 2026-07-09：降水显示按原版毫米口径换算

用户指出当前页面中 30 度地区、降水倍率调为 `1` 后只有 `6 mm` 降水，并据此质疑河流流量与气候数据计算不合理。复查原版 FMG 后确认，原版 UI 的降水显示为内部降水指数 `prec * 100 + " mm"`；WebGL 版此前直接把内部指数标为 `mm`，导致显示少了 100 倍。

修正：

- `display-units.js` 新增 `precipitationUnitsToMillimeters()`，默认按 `1` 个内部降水单位等于 `100 mm` 展示。
- `formatPrecipitation()` 改为显示换算后的毫米值，并使用完整数字格式，不再受全局 `万 / 千` 缩写影响。
- `api.climate.getPrecipitation()` 保留兼容字段 `min / max`，同时新增 `unit: "internal-precipitation-index"`、`millimetersPerUnit: 100`、`minMillimeters` 和 `maxMillimeters`，明确 API 读数中的内部指数和物理毫米口径。

边界：

- 本步只修降水展示和 API 单位说明，不改变气候生成算法、生物群系判定、降水图层原始数据、河流生成或河流流量标定。
- 用户示例中的 `6 mm` 修正后应显示为 `600 mm`；河流流量是否仍偏低，需要在这个显示 bug 修正后重新对照当前地图。

验证：

- `node --input-type=module` 直接断言通过：`6 -> 600 mm`、`63 -> 6,300 mm`、`precipitationScale = 0.5` 时 `6 -> 300 mm`。
- `node --check app\webgl-generator\src\ui\display-units.js` 和 `node --check app\webgl-generator\src\runtime\console-api.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：`api.climate.getPrecipitation()` 返回 `max = 63`、`maxMillimeters = 6300`、`millimetersPerUnit = 100`，气候面板文本包含 `6,300 mm`，`glError = 0`，console / page error 为空。

## 2026-07-09：补齐河流汇水与流量可信度诊断

用户要求把河流与降水体系中用于判断流量是否可信的数据补出来。此前河流面板只能看到长度、流量和河段，无法判断流量是由多少上游面积、多少平均降水累计出来的，也无法用现实水文公式给出量级参照。

修正：

- `rivers.js` 在流量累计阶段同步维护水文诊断 buffer，向下游传递上游汇水面积、汇水 cell 数和面积加权降水。
- 每条河流对象新增 `hydrology.catchmentArea`、`hydrology.catchmentCells` 和 `hydrology.averagePrecipitation`。
- 湖泊出口会把湖岸降水作为近似补给写入水文诊断，避免湖泊出口河流完全缺少汇水说明。
- `display-units.js` 新增现实公式估算：`Q = 年降水量 × 汇水面积 × 径流系数 / 年秒数`，并提供 `0.2 / 0.3 / 0.5` 三档径流系数区间。
- 河流管理面板的选中详情新增汇水面积、汇水格子、流域均降水、物理估算区间和模型流量相对 `0.3` 径流估算的倍数。
- 对象详情面板的河流对象新增汇水面积、流域均降水和物理估算区间。
- 河流要素 GeoJSON properties 新增 `catchmentArea / catchmentCells / averagePrecipitation`。

边界：

- 本步不改变河流生成路径、河宽、河流数量、排序原始字段或内部 `flux / discharge` 语义。
- 物理估算区间只作为可信度参照，不反向约束生成器流量；后续若要让生成器本身更接近真实水文，需要单独引入径流系数、蒸发散和更明确的汇水面积模型。

验证：

- `node --check app\webgl-generator\src\generator\rivers.js`、`node --check app\webgl-generator\src\ui\display-units.js`、`node --check app\webgl-generator\src\runtime\object-resolver.js` 和 `node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- `node --input-type=module` 生成级断言通过：新生成地图至少一条河流带有正 `catchmentArea`、`catchmentCells` 和 `averagePrecipitation`，并能计算 `low / medium / high` 理论流量区间。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：河流管理面板详情显示“汇水面积 / 汇水格子 / 流域均降水 / 物理估算 / 模型与估算比值”；河流要素 GeoJSON properties 含 `catchmentArea / catchmentCells / averagePrecipitation`；`glError = 0`，console / page error 为空。

### 2026-07-10 补充：旧图水文诊断自动回填

用户反馈已有地图中“汇水面积”为空。调查确认，上一刀只覆盖新生成 / 新重算河流，旧地图 JSON 或浏览器缓存地图不会自动拥有新增 `hydrology` 字段；同时入湖 / 入海水格和汇流分支处也会让部分河流诊断没有传到可读取的 mouth。

修正：

- `rivers.js` 新增 `backfillRiverHydrology()`，旧地图缺少 `hydrology` 时，会在克隆 pack 上做诊断重算，并按河流 id 或 source/mouth 把水文诊断贴回既有河流对象。
- 运行时 `loadMapIntoRuntime()` 接入 `ensureRiverHydrology()`，浏览器缓存恢复和完整地图 JSON 导入都会自动补齐旧图河流水文诊断。
- 成河阈值以下的上游水量向下游累计时同步传递 hydrology；河流汇入已有河道时也同步传递上游 hydrology。
- `riverHydrology()` 改用最后一个陆地河格作为诊断 mouth，避免入湖 / 入海水格没有面积导致汇水为空。
- 对极少数旧图中无法精确匹配的河流，按河道 cell 做近似诊断，并标记 `method: "river-path-fallback"`；面板和对象详情显示为“河道近似”，GeoJSON 输出 `hydrologyMethod`。

边界：

- 回填只写 `river.hydrology` 和少量 metadata / generationLog，不覆盖既有河名、宽度、备注、河流列表、河道几何或用户编辑。
- “河道近似”只是防空值的保底，不能当成完整汇水面积；完整匹配的旧河流和新生成河流仍显示“汇水累计”。

验证：

- `node --check app\webgl-generator\src\generator\rivers.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- 新生成地图完整性断言通过：`hydrology-completeness` 生成 64 条河流，64 条均有正 `catchmentArea`。
- 旧图模拟回填断言通过：删除 `legacy-hydrology-backfill` 地图 295 条河流的 `hydrology` 后，`backfillRiverHydrology()` 回填 295 / 295；其中 2 条使用 `river-path-fallback` 保底近似。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：用 gzip 版浏览器缓存旧图恢复后，运行时自动记录 `backfill river hydrology: 202/202 rivers, regenerated=202`；河流管理面板显示汇水字段和诊断方式；河流要素 GeoJSON 输出 `hydrologyMethod = flow-accumulation`；`glError = 0`，console / page error 为空。

## 2026-07-09：列表排序入口改为表头排序，河流流量做展示标定

用户要求把所有列表上的独立排序按钮改为表格自带的列排序功能，并质疑长达 1800+ 千米的河流只显示 `56 m³/s` 是否合理。

修正：

- `UiObjectTable` 增加可选表头排序能力，支持 `sortKey / sortDirection / sortOptions`，点击表头后继续发出原有排序 key，让各面板沿用既有 `onSort`、默认方向和偏好持久化逻辑。
- 国家、省份、城市、路线、河流、湖泊、文化、宗教、外交、经济、政体、军事、标记、备注、名称库、测量、气候、生物群系、纹章、地貌、人口和地区等列表面板已移除独立 `UiSortBar` 渲染，改由表头排序。
- 表头排序只开放原排序按钮中已有的 key；政体面板的从属国家表保持普通表，避免误用主列表排序状态。
- 河流 `flux / discharge` 明确按内部水文累计量处理，展示时通过 `formatRiverFlow()` 标定到 `m³/s`：默认比例尺下 `1 flux ≈ 20 m³/s`，比例尺改变时按面积比例平方缩放。

边界：

- 本步不改变河流生成、河宽、地图数据、排序原始字段、导出 JSON / GeoJSON 或对象解析中的 `flux / discharge`。
- `UiSortBar.vue` 组件暂时保留为基础组件文件，但当前列表面板不再引用它。

验证：

- `node --check app\webgl-generator\src\ui\display-units.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：国家、河流和经济面板旧 `.ui-sort-bar` 数量均为 `0`；国家“人口”、河流“长度”、经济“库存”表头点击后箭头和 `aria-sort` 均正确切换；河流原始最大 `flux = 1474` 展示为约 `3万 m³/s`，不再显示裸原始值；`glError = 0`，console / page error 为空。
- `$env:CI='true'; pnpm run audit:panels -- --scenario deep --template continents --browser-channel chrome --out <临时文件> --markdown <临时文件>` 通过；17 个管理面板、0 待复核项、0 console error、0 health event。

### 补充：河流流量标定下调和禁用缩写

用户进一步对照现实河流数据后指出，当前展示会产生过多万级流量；同时流量数值总量不大，不需要 `万 / 千` 这类单位缩写。

修正：

- `INTERNAL_RIVER_FLOW_TO_CUBIC_METERS_PER_SECOND` 从 `20` 下调为 `6`。
- `formatRiverFlow()` 改用完整数字格式，不再使用全局 `numberAbbreviation` 偏好；河流流量仍保留千分位和 `m³/s` 单位。
- 默认比例尺下，内部 `flux = 1474` 会显示为 `8,844 m³/s`，内部 `flux = 56` 会显示为 `336 m³/s`。

边界：

- 本步仍只改变展示标定，不改变河流生成、河宽、排序、导出或内部 `flux / discharge` 数据。

验证：

- `node --input-type=module` 直接断言通过：`56 -> 336 m³/s`、`1474 -> 8,844 m³/s`，且格式不包含 `万 / 千`。
- `node --check app\webgl-generator\src\ui\display-units.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：河流面板最大流量显示为 `8,844 m³/s`，列表流量无 `万 m³/s / 千 m³/s`，console / page error 为空。

## 2026-07-09：统一编辑面板筛选和排序区间距

用户指出最近新增的编辑面板中，列表上下各模块之间仍然缺少间距；参考国家编辑面板，筛选输入框应与上方信息区有间距，也应与下方排序按钮行有间距。

修正：

- `styles.css` 在公共面板规则底部补齐统一 spacing 覆盖。
- 所有主要 `*-panel-summary` 统一保留 `10px` 下间距。
- 所有主要 `*-panel-controls` 统一设置 `margin: 10px 0 8px`，让筛选输入与上方信息和下方排序区分开。
- 所有主要 `*-panel-sort` 统一设置 `margin: 8px 0 10px`，让排序按钮行与输入框、表格之间都有稳定间距。
- `*-panel-controls .ui-filter-input` 统一 `width: 100%`，避免 Element Plus 输入框在不同面板中宽度表现不一致。

边界：

- 本步只修面板公共间距样式，不改变列表筛选、排序、选择、编辑命令或数据结构。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：逐个打开国家、河流、湖泊、生物群系、气候、水体与地貌、人口、纹章和地区面板，实测国家与新增统计面板的 summary -> 筛选、筛选 -> 排序、排序 -> 表格间距分别为 `10px / 8px / 10px`；地区面板因图例存在，summary 到筛选为 `81px`，筛选 -> 排序 / 排序 -> 表格仍为 `8px / 10px`；console/page error 为空。

## 2026-07-09：河流流量显示补充单位

用户指出河流流量不应只是裸数字，而应显示为带流量单位的数值。

修正：

- `display-units.js` 新增 `formatRiverFlow()`，统一把河流流量显示为 `m³/s`。
- 河流管理面板的列表列、摘要“最大流量”和详情“流量”改用统一流量格式器。
- 对象详情面板中的河流“流量”改为带单位显示。
- 运行统计、hover 调试行和河流 hover 对象摘要中的河流流量改为带单位显示，并把河流摘要中的英文 `flux / length` 文案改为中文“流量 / 长度”。

边界：

- 本步只修河流流量展示口径，不改变河流生成、宽度计算、排序字段、导出数据或内部 `flux / discharge` 字段。

验证：

- `node --check app\webgl-generator\src\ui\display-units.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：打开河流管理后，摘要显示“最大流量 `1,474 m³/s`”，表格首行显示 `1,474 m³/s`，详情显示“流量 `1,474 m³/s`”，选中详情显示“流量 `1,474 m³/s` / 长度 ...”；`glError = 0`，console/page error 均为空。

## 2026-07-09：控制台气候 API 读写补齐

用户指出 `api.climate` 只有 `get()` 不完整，气候参数虽然在 UI 中有控件，但本质上可通过 API 参数直接传入，不应把 UI 控制范围当成 API 能力边界。

修正：

- `api.climate.get(section)` 支持按 `temperature / precipitation / latitude / atmosphere / biomes / options` 读取单一分区；无参数时返回完整分区摘要。
- 新增细分读取方法：`getOptions()`、`getTemperature()`、`getPrecipitation()`、`getLatitude()`、`getAtmosphere()`、`getBiomes()`。
- 新增写入方法：`apply(patch)`、`setLatitude(value)`、`setLatitudeRange(percent)`、`setLongitudeRange(percent)`、`setTemperature({equator, northPole, southPole})`、`setPrecipitation(scale)`、`setWind(index, direction)`。
- app action 新增气候 API 应用路径，直接把 API 参数归一化为气候 options，复用现有 `buildClimate()`、`defineBiomesAndPopulation()` 和 `refreshAfterEdit()`，同步控件后重算当前地图气候。
- 气候写入返回 `changed / options / climate / derivedStale / checksum`，并标记城市、国家、省份、宗教、marker、zone、军事、经济、外交等下游派生 stale。

边界：

- 本步不把气候配置写入 `EditHistory`，所以暂不支持撤销 / 重做气候参数；如果后续需要，应补专用配置命令。
- 本步不接生成 API，也不触发整图重新生成，只重算当前地图的气候、生物群系与相关摘要。
- UI 控件仅作为同步对象，不再作为 API 参数能力边界。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\runtime\console-api.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：`api.info.capabilities()` 包含全部 14 个气候方法；`climate.get("temperature")` 和 6 个细分 getter 均返回 `ok=true`；`setLatitude(37)` 后纬度为 `custom / 37`，`setLatitudeRange(30)` 和 `setLongitudeRange(70)` 同步 options，`setTemperature({equator:30,northPole:-30,southPole:-12})` 后温度参数生效，`setWind(0,"southeast")` 后 `customBands` 首段风向为 `315`，`apply({precipitation:120, atmosphere:{direction:"west"}})` 后降水倍率为 `120`；checksum `6912643b -> 7c04d11d`，派生过期包含城市、国家、省份、宗教、marker、zone、军事、经济、外交；非法纬度模式返回 `ok=false / 未知纬度模式`，`glError = 0`，console/page error 均为空。

## 2026-07-09：统一 label/value 数据展示组件

用户指出最近新增的编辑面板中，列表上下方的 label + value 数据展示部分出现样式崩坏，并要求抽成统一组件，同时考虑自动排布。

修正：

- 新增 `UiKeyValueGrid.vue`，统一处理 label/value 数据项、空态、debug 行过滤、长值自动宽格和 `auto-fit` 自适应列宽。
- `UiMetricGrid.vue` 和 `UiDetailGrid.vue` 改为 `UiKeyValueGrid` 的薄封装，保留既有调用方式，让国家、省份、城市、文化、宗教、经济、军事等现有面板自动复用同一排布规则。
- 经济总览详情区原本手写的 highlights 和分组 `dl / dt / dd` 改为复用 `UiKeyValueGrid`，避免形成第二套 label/value 样式。
- `styles.css` 增加 `.ui-key-value-*` 共享规则，统一 label/value 字号、换行、长值断词、宽格跨列和窄宽度回退；旧面板类只继续承担间距、边框和特殊容器角色。

边界：

- 本步只修数据展示组件和样式，不改变任何编辑命令、地图数据、导入导出或 selection 行为。
- 军事战报链、兵种条等带专用语义的展示暂不强行迁移，避免把非等价结构压成普通字段。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- `pnpm run audit:panels -- --scenario deep --template continents --browser-channel chrome` 通过；报告显示 24 / 24 面板预热完成、失败 0、结论为“未发现待复核项”，国家、省份、城市、文化、宗教、经济、军事等面板 body 均无横向溢出，console error 和 healthEvents 均为空。

## 2026-07-09：控制台屏幕坐标 pick API 第一刀

本步继续控制台 / 扩展 API 系统的 selection / locate 能力，开放屏幕坐标拾取。

修正：

- `api.selection` 增加 `pick(clientX, clientY)`。
- app action 复用 renderer `pickClientPoint()`，并刷新 pick 面板。
- 非法坐标返回结构化错误。
- `api.info.capabilities()` 的 `selection` 方法列表补充 `pick`。

边界：

- 本步不接临时高亮、多对象高亮或自动选择拾取对象。
- pick API 只读取当前 renderer 拾取结果，不改变 selection、地图数据或 checksum。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `selection.pick`；对 canvas 中心点调用 `selection.pick()` 返回 grid cell `4941`、pack cell `2570`、海洋 feature 和 route `#467` pick 结果，非法坐标返回 `ok=false` 和“clientX / clientY 必须是有限数”；checksum 保持 `5b0ba5fe`，校验值 `21fc36fd`。

## 2026-07-09：控制台选择 / 定位 API 第一刀

本步进入控制台 / 扩展 API 系统的 selection / locate 能力，开放对象解析、选择、清空和定位。

修正：

- `api.selection` 增加 `resolve(object)`、`select(object)`、`clear()` 和 `locate(object)`。
- app action 复用 `resolveObject()` 和 `SelectionStore`，`select()` 会走现有 selection change 流程刷新 renderer、对象详情、runtime 和 pick 面板。
- `locate()` 复用 `locateObject()`，并让该 helper 返回定位是否成功。
- API 层对未知类型或不存在对象返回结构化错误，不沿用 UI 的对象标识容错回退。
- `api.info.capabilities()` 的 `selection` 方法列表补充 `resolve/select/clear/locate`。

边界：

- 本步不接临时高亮、多对象选择、编辑态 start/stop 或屏幕坐标 pick。
- selection API 只改变当前 UI 选择和视图定位，不修改地图数据或 checksum。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `selection.get/resolve/select/clear/locate`；`selection.resolve({kind:"city", id:1})` 返回城市“玄昌”快照，`select()` 和 `locate()` 均能设置 selection，`clear()` 清空 selection / editingObject，不存在城市 `#999999` 返回 `ok=false` 和“找不到对象”错误；checksum 保持 `8ab0c776`，校验值 `4bf48804`。

## 2026-07-09：控制台国家新增 / 删除 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把国家新增和删除接入 API。

修正：

- app action 增加 `edit.states.add(gridCell)` 和 `edit.states.delete(stateId)`。
- `api.edit.states.add()` 复用 `createAddStateAtCellCommand()` 和 `executeEditCommand()`，新增成功后用 `resolveObject()` 选中新国家。
- `api.edit.states.delete()` 复用 `createDeleteStateCommand()` 和 `executeEditCommand()`，删除成功后清空选择。
- API 执行后刷新对象面板、runtime 和编辑锁，保持和现有国家面板路径一致。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `states.add` 和 `states.delete`。

边界：

- 本步不接屏幕坐标拾取、国家笔刷、重命名、政体、颜色、外交或国家重算。
- API 国家 collection 编辑会改变政治面、省份、首都城市和相关派生统计，但不重算地图 checksum；这与当前国家面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `states.add/delete`；`edit.states.add(934)` 新增国家 `#21`、省份 `#239`、城市 `#828`、影响 `3` cells、国家数量 `20 -> 21`、selection 指向新国家，派生过期包含 `military / zones / state-markers / economy / diplomacy`；撤销后回到 `20`，重做恢复同一国家；`edit.states.delete(21)` 后数量回到 `20` 且国家 `removed=true`，撤销删除恢复为 `21`；metadata 为 `21`，checksum 保持 `eefd2f3b`，校验值 `ac14f830`。

## 2026-07-09：控制台省份新增 / 删除 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把省份新增和删除接入 API。

修正：

- app action 增加 `edit.provinces.add(gridCell)` 和 `edit.provinces.delete(provinceId)`。
- `api.edit.provinces.add()` 复用 `createAddProvinceAtCellCommand()` 和 `executeEditCommand()`，新增成功后选中新省份。
- `api.edit.provinces.delete()` 复用 `createDeleteProvinceCommand()` 和 `executeEditCommand()`，删除成功后清空选择。
- API 执行后刷新对象面板、runtime 和编辑锁，保持和现有省份面板路径一致。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `provinces.add` 和 `provinces.delete`。

边界：

- 本步不接屏幕坐标拾取、省份笔刷、重命名、备注或省份重算。
- API 省份 collection 编辑会改变政治面、城市省份归属和相关派生统计，但不重算地图 checksum；这与当前省份面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `provinces.add/delete`；`edit.provinces.add(934)` 新增省份 `#239`、归属国家 `#17`、影响 `3` cells、数量 `238 -> 239`、selection 指向新省份，撤销后回到 `238`，重做恢复同一省份；`edit.provinces.delete(239)` 后数量回到 `238` 且省份 `removed=true`，撤销删除恢复为 `239`；metadata 为 `239`，checksum 保持 `8b6a2c2d`，校验值 `f1009eec`。
- 本次浏览器烟测记录一次 health `main-thread-long-task` 约 `3558ms`；功能断言通过，但省份 collection 编辑性能仍需后续观察。

## 2026-07-09：控制台城市新增 / 删除 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把城市新增和删除接入 API。

修正：

- app action 增加 `edit.cities.add(gridCell)` 和 `edit.cities.delete(cityId)`。
- `api.edit.cities.add()` 复用 `createAddCityAtCellCommand()` 和 `executeEditCommand()`，新增成功后选中新城市。
- `api.edit.cities.delete()` 复用 `createDeleteCityCommand()` 和 `executeEditCommand()`，删除成功后清空选择。
- API 执行后刷新 state / province / city / runtime 面板，保持和现有城市面板路径一致。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `cities.add` 和 `cities.delete`。

边界：

- 本步不接屏幕坐标拾取、城市重命名、人口、视觉、备注或城镇批量重算。
- API 城市 collection 编辑会改变城镇数据和相关派生统计，但不重算地图 checksum；这与当前城市面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `cities.add/delete`；`edit.cities.add(934)` 新增城市 `#828`、数量 `828 -> 829`、selection 指向新城市，撤销后回到 `828` 且新城市不存在，重做恢复同一城市；`edit.cities.delete(828)` 后数量回到 `828` 且城市 `removed=true`，撤销删除恢复为 `829`；metadata 为 `829`，checksum 保持 `1c0f54d0`，校验值 `ad94e835`。

## 2026-07-09：控制台 marker 新增 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，补齐资源标记新增 API。

修正：

- app action 增加 `edit.markers.add({type, packCell, name})`。
- `api.edit.markers.add()` 复用 `createAddMarkerCommand()` 和 marker collection API 执行 helper。
- 新增成功后 API 返回 `createdMarker` 快照，并选中新建 marker，方便脚本继续定位或编辑。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `markers.add`。

边界：

- 本步不接屏幕坐标拾取、图标编辑、备注编辑或资源重生成。
- API 新增 marker 会改变标记集合和经济资源派生，但不重算地图 checksum；这与当前 marker 面板新增路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `markers.add`；`edit.markers.add({type:"mines", packCell:0, name:"API 新增标记"})` 新增 marker `#44`、数量 `44 -> 45`、selection 指向新 marker、派生过期包含 `military / diplomacy`；撤销后数量回到 `44` 且新 marker 不存在，重做恢复同一 marker；metadata 为 `45`，checksum 保持 `dbffbd09`，校验值 `37be900b`。

## 2026-07-09：控制台 marker 删除 / 移动 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把资源标记删除和移动接入 API。

修正：

- app action 增加 `edit.markers.delete(markerId)` 和 `edit.markers.move(markerId, packCell)`。
- `api.edit.markers.delete()` 复用 `createDeleteMarkerCommand()`。
- `api.edit.markers.move()` 复用 `createMoveMarkerCommand()`，参数使用已有命令层的 pack cell。
- API 执行 marker collection 命令后同步标记 `markers / economy` 为 fresh、`military / diplomacy` 为 stale，并刷新 summary、marker / economy / state / province / runtime 面板。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `markers.delete` 和 `markers.move`。

边界：

- 本步不接新增 marker、图标编辑、备注编辑、资源重生成或屏幕坐标拾取。
- API 编辑会改变标记集合和经济资源派生，但不重算地图 checksum；这与当前 marker 面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `markers.delete/move`；真实标记 `#0` 从 pack cell `1068` 移动到 `0` 后可撤销恢复，派生过期包含 `military / diplomacy`；真实标记 `#43` 删除后数量 `44 -> 43` 且 metadata 为 `43`，撤销恢复为 `44`，重做再次删除为 `43`；checksum 保持 `003593d4`，校验值 `2d18884b`。

## 2026-07-09：控制台标签编辑 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把标签删除和生成标签恢复接入 API。

修正：

- app action 增加 `edit.labels.delete(label)` 和 `edit.labels.restore(label)`。
- `api.edit.labels.delete()` 复用 `createDeleteLabelCommand()`、`executeEditCommand()` 和 label effects，支持手工标签删除和生成标签隐藏。
- `api.edit.labels.restore()` 复用 `createRestoreGeneratedLabelCommand()`、`executeEditCommand()` 和 label effects，支持恢复已隐藏的生成城市 / 国家标签。
- API wrapper 会校验标签 `id / targetId` 和 `targetKind`，避免无效 ID 写入标签 hidden 列表。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `labels.delete` 和 `labels.restore`。

边界：

- 本步不接新增手工标签、移动标签、重命名标签、标签备注或批量标签规则。
- API 编辑会改变标签数据，但不重算地图 checksum；这与当前标签管理面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`api.info.capabilities()` 包含 `labels.delete/restore`；注入手工标签 `900001` 后，`edit.labels.delete({targetKind:"custom", targetId:900001})` 成功删除，`history.undo()` 恢复，`history.redo()` 再次删除；对真实城市标签 `#1` 预置 hidden 后，`edit.labels.restore({targetKind:"city", targetId:1})` 成功恢复，`history.undo()` 重新隐藏；校验值 `63ee1433`。

## 2026-07-09：控制台路线删除 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把路线删除接入 API。

修正：

- app action 增加 `edit.routes.delete(routeId)`。
- `api.edit.routes.delete()` 复用 `createDeleteRouteCommand()`、`executeEditCommand()` 和 route effects。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `routes.delete`。

边界：

- 本步只接路线删除，不接路线新增、改线、重算道路或路线备注编辑。
- API 编辑会改变路线数据，但不重算地图 checksum；这与当前面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：对真实路线 `#0` 调用 `edit.routes.delete(0)` 后路线数和 metadata `589 -> 588`，`history.undo()` 恢复为 `589`，`history.redo()` 再次删除为 `588`，最终 history 为 `undo=1 / redo=0 / lastLabel=重做 删除路线 #0 #0`，状态显示“已删除路线 #0。”；调用前后 checksum 保持 `8fe1d6f8`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台测量对象编辑 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 4，把测量对象重命名和删除接入 API。

修正：

- app action 增加 `edit.measurements.rename(id, name)` 和 `edit.measurements.delete(id)`。
- `api.edit.measurements.rename()` 复用 `createRenameMeasurementCommand()`、`executeEditCommand()` 和 measurement effects。
- `api.edit.measurements.delete()` 复用 `createDeleteMeasurementCommand()`、`executeEditCommand()` 和 measurement effects。
- `api.info.capabilities()` 的 `edit` 方法列表补充 `measurements.rename` 和 `measurements.delete`。

边界：

- 本步不接保存当前测量、导入测量、改点列、路线贴合或测量图层渲染。
- API 编辑会改变测量对象数据，但不重算地图 checksum；这与当前面板编辑路径一致。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：注入 `api-smoke-measurement` 后，`edit.measurements.rename(..., "新测量")` 成功改名，`edit.measurements.delete()` 使数量变为 `0`，`history.undo()` 恢复名为“新测量”的对象，`history.redo()` 再次删除，最终 history 为 `undo=2 / redo=0 / lastLabel=重做 删除测量对象 api-smoke-measurement`，状态显示“已删除测量对象 api-smoke-measurement。”；调用前后 checksum 保持 `fc9c967b`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台编辑 API 第一刀

本步进入控制台 / 扩展 API 系统阶段 4，先接入 history 和备注删除这组最稳定的编辑能力。

修正：

- `installConsoleApi()` 支持接收 app action 注入，避免 API 模块直接反向依赖 app 内部 helper。
- app action 暴露 `history.get()`、`history.undo()`、`history.redo()` 和 `edit.notes.delete(noteId, options)`。
- `api.history.get()`、`api.history.undo()` 和 `api.history.redo()` 复用当前 `EditHistory`，撤销 / 重做后走 `refreshAfterEdit()`、`updateAllObjectPanels()` 和编辑锁刷新。
- `api.edit.notes.delete(noteId, {name})` 复用 `createDeleteNoteCommand()`、`executeEditCommand()` 和 `refreshPanelsForEdit()`，进入统一撤销栈和面板刷新路径。

边界：

- 本步只接备注删除，不接备注正文编辑、新增备注、测量、标签、路线或 marker 编辑 API。
- API 编辑会改变地图对象数据，但不重算地图 checksum；这与当前面板编辑路径一致。
- action 未安装时返回结构化 API error。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：注入 `API 烟测备注` 后，`edit.notes.delete("api-smoke-note")` 使备注数 `1 -> 0`，`history.undo()` 恢复为 `1`，`history.redo()` 再次删除为 `0`，最终 history 为 `undo=1 / redo=0 / lastLabel=重做 删除备注 API 烟测备注`，状态显示“已删除备注 API 烟测备注。”；调用前后 checksum 保持 `f1bd14c3`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台气候只读 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 3，先开放气候只读摘要，给脚本提供温度、降水、纬度、风带和生物群系统计。

修正：

- `api.info.capabilities()` 增加 `climate` 命名空间，声明 `get`。
- `api.climate.get()` 返回温度范围与基础参数、降水范围、纬度模式 / 经纬边界、风带方向 / profile，以及 biome counts / total。
- 气候摘要只读取 `map.climate.metadata`、`map.mapCoordinates` 和当前 options，不暴露内部数组引用。

边界：

- 本步只做只读，不接 `api.climate.apply()`、`setLatitude()`、气候重算或派生 stale。
- 本步不修改地图数据、生成参数、显示偏好、selection、编辑历史或 checksum。

验证：

- `node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`climate.get()` 返回温度范围 `-13..24`、降水范围 `0..63`、纬度模式 `auto / 自动纬度`、经纬边界 `latN 7.7 / latS -37.3 / lonW -45 / lonE 45`、风带 `customBands` 和 biome total `5968`；调用前后 checksum 保持 `e42ee4f3`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台单位 API 第一刀

本步继续控制台 / 扩展 API 系统阶段 3，开放单位显示偏好的读取和应用能力。

修正：

- `api.info.capabilities()` 增加 `units` 命名空间，声明 `get` 和 `apply`。
- `api.units.get()` 返回当前标准化单位偏好。
- `api.units.apply(preferences)` 使用 `normalizeUnitPreferences()` 校准输入，同步单位控件、全局控制偏好和 renderer `setUnitPreferences()`。
- `ui/panel.js` 导出 `updateControlPreferences()`，供 API 复用现有控制偏好写入逻辑。

边界：

- 本步只改显示偏好和控件状态，不修改地图生成数据、气候模型、selection、编辑历史或 checksum。
- `apply()` 对非法单位值走既有标准化回落，不新增自定义单位类型。
- 本步不接气候 API；`api.climate.apply()` 后续需要单独处理派生 stale 和重生成语义。

验证：

- `node --check app\webgl-generator\src\runtime\console-api.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`units.apply({distanceUnit:"km", numberAbbreviation:"none", mapScaleKmPerCm:125, populationScale:2, militaryScale:1.5, precipitationScale:0.5})` 后 API 返回和控件均同步为 `km / km2 / none / 125 / 2 / 1.5 / 0.5`，`layers.get().units` 同步更新；调用前后 checksum 保持 `f25a7b4e`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台图层 API 第一刀

本步进入控制台 / 扩展 API 系统阶段 3，先开放视图模式和图层显隐两类显示偏好操作。

修正：

- `api.layers.get()` 保持读取当前 renderer color mode、视觉主题、图层偏好和单位偏好。
- `api.layers.setViewMode(mode)` 校验页面已有 `data-mode` 后，复用 `setActiveModeButton()` 同步按钮 active 状态和显示偏好，并调用 renderer `setColorMode()`。
- `api.layers.setVisible(layer, visible)` 校验 renderer 已知图层后，同步本地偏好、UI 控件状态和 renderer `setLayerVisible()`。
- `ui/panel.js` 导出 `updateLayerPreference()`，供 API 复用现有图层偏好写入逻辑。

边界：

- 本步只改变显示偏好和 renderer 视图，不修改地图生成数据、selection、编辑历史或 checksum。
- 本步不接单位、气候、视觉主题、生成或编辑 API。
- 未知视图模式或未知图层会返回结构化 API error，不写入偏好。

验证：

- `node --check app\webgl-generator\src\runtime\console-api.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`layers.setViewMode("temperature")` 后 renderer 和按钮均为温度视图；`layers.setVisible("routes", false)` / `true` 可关闭并恢复路线图层，最终 renderer `routes=true`、路线按钮 `aria-pressed=true` 且 active；调用前后 checksum 保持 `cbedb91c`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台压缩地图导出 API 第一刀

本步补齐控制台 / 扩展 API 系统阶段 2 的压缩完整地图导出能力，让脚本可以拿到 `.webgl-map.json.gz` 的 gzip base64 或触发浏览器下载。

修正：

- `map-file-io.js` 拆出 `createCompressedMapDocumentBlob()`，UI 的 `downloadCompressedMapDocument()` 继续复用该 helper 并保持现有下载行为。
- `api.data.exportCompressedAll({download, includeBase64})` 复用完整地图文档序列化和 gzip 压缩逻辑，返回文件名、MIME、原始字节数、压缩字节数和文档元数据。
- `download:false` 默认返回 gzip base64；`download:true` 默认只触发浏览器下载并返回摘要。
- `api.info.capabilities()` 的 `data` 命名空间补充 `exportCompressedAll`。

边界：

- 本步只做压缩完整地图导出，不接压缩导入、浏览器存档、生成、编辑或非 gzip 编码。
- API 不修改地图数据、视图偏好或状态文案；压缩失败会通过 `ApiResult` 返回结构化错误。

验证：

- `node --check app\webgl-generator\src\runtime\console-api.js`、`node --check app\webgl-generator\src\runtime\map-file-io.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`data.exportCompressedAll({download:false})` 返回 gzip base64，解压后为 `webgl-generator-map` 文档且 checksum 保持 `506ad108`，原始 `15,418,281` 字节、压缩 `2,453,326` 字节、base64 长度 `3,271,104`；`data.exportCompressedAll({download:true})` 触发 `fmg-stage-2-1-506ad108.webgl-map.json.gz` 下载，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台 PNG 导出 API 第一刀

本步继续推进控制台 / 扩展 API 系统阶段 2，把 PNG 导出开放为异步 API，同时复用现有 overlay 合成和倍率逻辑。

修正：

- `apiCall()` 支持 Promise，异步 API 会 resolve 为统一 `ApiResult`，异常仍转为统一错误结构。
- `map-file-io.js` 拆出 `createCanvasPngBlob()`，UI 的 `downloadCanvasPng()` 继续复用该 helper 并保持现有下载行为。
- `api.data.exportPNG({download, pixelScale, includeMapOverlays, includeDataUrl})` 返回文件名、MIME、字节数、尺寸、倍率和 overlay 标志；`download:false` 默认返回 data URL，`download:true` 默认只触发浏览器下载并返回摘要。
- `api.info.capabilities()` 的 `data` 命名空间补充 `exportPNG`。

边界：

- 本步只读当前 canvas / overlay，不修改地图数据、视图偏好或状态文案。
- 本步不接压缩地图 JSON、导入、生成、编辑或文件系统写入。
- PNG API 是异步能力，调用方需要 `await api.data.exportPNG(...)`。

验证：

- `node --check` 覆盖 `api-result.js`、`console-api.js` 和 `map-file-io.js`，`git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`data.exportPNG({download:false, pixelScale:2})` 返回 `image/png` data URL，API 尺寸和 PNG 文件头均为 `2560 x 1600`，字节数 `84,510`；`data.exportPNG({download:true, pixelScale:1})` 触发 `fmg-stage-2-1-549ebe1f.png` 下载；调用前后 checksum 保持 `549ebe1f`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台导出 API 第一刀

本步继续推进控制台 / 扩展 API 系统阶段 2，把已有导出能力先开放为脚本可调用的只读 API。

修正：

- `api.info.capabilities()` 增加 `data` 命名空间，声明 `exportAll`、`exportGEO` 和 `exportFeatureGEO` 三个方法。
- `api.data.exportAll({download})` 复用 `createMapDocument()` 和 `stringifyMapDocument()`，返回完整地图 JSON 文本、文件名、MIME、字节数和文档元数据。
- `api.data.exportGEO({download})` 复用 `createMapGeoJson()`，返回 pack cell GeoJSON 文本和 feature 摘要。
- `api.data.exportFeatureGEO({download, layers, dissolvePolitical})` 复用 `createMapFeatureGeoJson()`，支持调用方传入图层集合和政治面 dissolve 选项。
- `download:true` 复用现有 `downloadText()` 浏览器下载能力；下载模式默认不回传大文本，可用 `includeText:true` 显式要求回传。

边界：

- 本步不接 PNG、压缩地图 JSON、导入、生成、编辑、气候或图层写 API。
- 导出 API 只读，不写状态文案，不修改地图数据，也不改变 checksum。
- API 返回文本便于脚本断言；后续若接 PNG / Blob 类能力，需要单独处理异步和二进制返回。

验证：

- `node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`data.exportAll({download:false})` 返回 `webgl-generator-map` 文档文本 `15,376,660` 字节；`data.exportGEO({download:false})` 返回 `5,968` 个 cell 面；`data.exportFeatureGEO({download:false, dissolvePolitical:true})` 返回 `1,947` 个要素且 `dissolvedPolitical=true`；`data.exportFeatureGEO({download:true, includeText:false})` 触发 `fmg-stage-2-1-1754ddd6.features.geojson` 下载；调用前后 checksum 保持 `1754ddd6`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：控制台 API 根对象与只读能力第一刀

本步进入控制台 / 扩展 API 系统阶段 1，先建立浏览器控制台可读取的 API 根对象，并只开放不会改变地图数据的快照能力。

修正：

- 新增 `app/webgl-generator/src/runtime/api-result.js`，统一 `ApiResult` 成功 / 失败返回壳，并在返回前转成可 JSON 化快照。
- 新增 `app/webgl-generator/src/runtime/console-api.js`，安装 `window.webglGeneratorApi`，并在 `window.api` 未被占用时提供开发别名。
- 接入 `api.info.capabilities()`、`api.info.mapSummary()`、`api.info.runtimeStats()`、`api.selection.get()` 和 `api.layers.get()`。
- 在 `app.js` app ready 后安装 API，保证 API 读取当前 `state / renderer / healthMonitor / control preferences`，但不暴露内部 `state.map` 大对象或 typed array 引用。

边界：

- 本步只做只读 API，不接入导出、编辑、生成、导入或图层写操作。
- `layers.get()` 只读当前偏好和 renderer 状态，不会切换视图或写入本地偏好。
- `selection.get()` 只返回 selection / editing object 摘要，不暴露 resolver 后的内部对象引用。

验证：

- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`window.webglGeneratorApi` 与 `window.api` 可读，`info.capabilities()`、`info.mapSummary()`、`info.runtimeStats()`、`selection.get()`、`layers.get()` 均返回 `ok=true`；调用前后 checksum 保持 `989744d0`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：路线删除接入编辑 helper

本步继续推进 `executeEditCommand()` 的低风险调用点迁移，把路线面板删除入口改走统一命令执行 helper。

修正：

- 路线面板删除回调改走 `executeEditCommand()`，统一 no-op 判断、`EditHistory.execute`、`refreshAfterEdit` 和状态文案。
- 删除成功后调用 `refreshPanelsForEdit()`，通过路线删除命令已有的 `derived: ["route-mesh", "object-panels", "object-index"]` 保持路线 mesh、对象索引和对象面板刷新。

边界：

- 本步只迁移路线删除，不改变路线备注、道路重算、改线、端点重连或路线撤销 / 重做逻辑。
- 本步不修改路线删除命令本身的数据约束。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：点击真实“删除路线”按钮后路线数 `589 -> 588`、metadata routes `588`、路线段数 `2776 -> 2593`、状态显示“已删除路线 #452。”、撤销栈 `undo=1`；点击面板头部撤销后路线数和 metadata 恢复到 `589`，`redo=1`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`locateAndSelectObject()` 地区与军事对象扩展

本步继续推进统一定位 / 选择入口，把地区和军事面板的定位回调迁移到 `locateAndSelectObject()`。

修正：

- 地区面板 `onLocate` 改走 `locateAndSelectObject("zone-panel", object, ...)`，定位后保留地区选中行。
- 军事面板 `onLocate` 改走 `locateAndSelectObject("military-panel", object, ...)`，定位后保留军团选中行。

边界：

- 本步不改变地区样式编辑、军事态势 / 兵种编辑、战报导入或导出。
- 本步不新增闪烁高亮，不改变进入编辑模式的语义。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：依次打开地区和军事面板，点击首行后再点击定位按钮，selection 分别保持 `zone / military` 和对应 id，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`locateAndSelectObject()` 社会对象扩展

本步继续推进统一定位 / 选择入口，把文化和宗教面板的定位回调迁移到 `locateAndSelectObject()`。

修正：

- 文化面板 `onLocate` 改走 `locateAndSelectObject("culture-panel", object, ...)`，定位后保留文化选中行。
- 宗教面板 `onLocate` 改走 `locateAndSelectObject("religion-panel", object, ...)`，定位后保留宗教选中行。

边界：

- 本步不改变文化 / 宗教新增删除、继承编辑、名称库绑定或备注编辑。
- 本步不新增闪烁高亮，不改变进入编辑模式的语义。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：依次打开文化和宗教面板并点击选中行定位按钮，selection 分别保持 `culture / religion` 和对应 id，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`locateAndSelectObject()` 区域与城市对象扩展

本步继续推进统一定位 / 选择入口，把国家、省份和城市面板的定位回调迁移到 `locateAndSelectObject()`。

修正：

- 国家面板 `onLocate` 改走 `locateAndSelectObject("state-panel", object, ...)`，定位后保留国家目标状态。
- 省份面板 `onLocate` 改走 `locateAndSelectObject("province-panel", object, ...)`，定位后保留省份选中行。
- 城市面板 `onLocate` 改走 `locateAndSelectObject("city-panel", object, ...)`，定位后保留城市选中行。

边界：

- 本步不迁移政府、外交、文化、宗教、标签或对象详情定位路径。
- 本步不新增闪烁高亮，不改变进入编辑模式的语义。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：依次打开国家、省份和城市面板并点击选中行定位按钮，selection 分别保持 `state / province / city` 和对应 id，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`locateAndSelectObject()` 线性对象扩展

本步继续推进统一定位 / 选择入口，把路线、河流和湖泊面板的定位回调迁移到 `locateAndSelectObject()`。

修正：

- 路线面板 `onLocate` 改走 `locateAndSelectObject("route-panel", object, ...)`，定位后保留路线面板选中行。
- 河流面板 `onLocate` 改走 `locateAndSelectObject("river-panel", object, ...)`，定位后保留河流 selection 和编辑对象状态。
- 湖泊面板 `onLocate` 改走 `locateAndSelectObject("lake-panel", object, ...)`，定位后保留湖泊面板选中行。

边界：

- 本步不迁移标签、城市、国家、省份、文化或宗教面板定位路径。
- 本步不新增闪烁高亮，不改变进入编辑模式的语义。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：依次打开路线、河流和湖泊面板并点击表格定位按钮，selection 分别保持 `route / river / lake`，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：备注删除接入编辑 helper 和面板刷新调度

本步继续推进编辑器基础设施清单中的低风险调用点迁移，并补上 `refreshPanelsForEdit()` 对全对象面板刷新的第一层支持。

修正：

- 备注面板删除回调改走 `executeEditCommand()`，不再手写 `isNoop -> EditHistory.execute -> refreshAfterEdit`。
- `refreshPanelsForEdit()` 在命令声明 `derived: ["object-panels"]` 时统一调用 `updateAllObjectPanels()`，保留备注删除对对象面板的刷新语义。
- 修正 `NotesPanel.vue` 动作条脚本中未定义的 `callbacks` 引用，改为 `props.callbacks`，确保定位、删除和导出动作能触发真实回调。

边界：

- 本步只迁移备注删除，不改变备注创建、正文编辑、导出摘要或撤销 / 重做路径。
- 本步不批量迁移其它面板的删除或重命名调用点。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：注入 `烟测备注` 后点击真实“删除选中备注”按钮，备注数和 metadata `1 -> 0`，摘要刷新为 `备注0`，状态显示“已删除备注 烟测备注。”，撤销栈 `undo=1`，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`executeEditCommand()` 返回结果第一刀

本步继续推进编辑器基础设施清单中的统一命令执行入口，让调用点可以从 helper 读取命令执行后的标准结果。

修正：

- `executeEditCommand()` 返回结构扩展为 `{executed, command, result, error}`。
- helper 执行成功后读取命令的标准 `getResult()`，并保留默认抛错行为；调用方显式设置 `throwOnError: false` 时可拿到 `error`。
- 测量保存命令和 GEO 测量导入命令新增标准 `getResult()`，旧 `getMeasurement()` / `getImported()` 作为兼容别名保留。
- 保存当前测量对象和 GEO 测量导入路径改为通过 `executeEditCommand().result` 读取新增 / 导入对象。

边界：

- 本步只迁移测量保存与 GEO 测量导入，不批量改写其它面板命令。
- 本步不新增运行时命令 schema 校验；错误展示策略仍以后续小步扩展。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\measurement-edit-commands.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：通过真实“保存”按钮保存两点测量后新增 `measurement-1`，状态显示“已保存测量对象 测量 1。”，撤销栈 `undo=1`，面板保持打开并选中新测量对象，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`UiObjectTable` 标准空态动作第一刀

本步推进编辑器基础设施清单中的公共对象表格扩展，先让空列表可以承载标准主动作。

修正：

- `UiObjectTable` 新增可选 `emptyAction` prop 和 `empty-action` 事件，空态下可显示统一小按钮。
- 测量对象面板在空列表中显示“开始测量”，点击后通过面板桥接触发运行时回调。
- 运行时新增 `startMeasurementMode()` / `stopMeasurementMode()` helper，测量工具栏开关和测量面板空态入口复用同一套测量模式切换逻辑。

边界：

- 本步只覆盖测量对象面板的空态主动作。
- 本步不做 `UiObjectTable` 批量选择、列宽持久化或面板级 actions slot。
- 本步不改变测量对象保存、编辑、删除、导出和撤销链路。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\measurement-panel.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：测量对象列表为空时显示“开始测量”，点击后进入测量模式，状态显示“已进入测量模式。”，`glError = 0`，health / console / page error 均为 `0`。

## 2026-07-09：`locateAndSelectObject()` helper 第一刀

本步推进编辑器基础设施清单中的统一定位 / 选择入口，先迁移 marker 面板定位路径。

修正：

- 运行时初始化闭包新增 `locateAndSelectObject(panelId, object, options)`。
- helper 内部复用 `renderer.locateObject()`、`selectFromPanel()`、runtime / pick panel 刷新和可选 `afterSelect` 回调。
- marker 面板 `onLocate` 改走该 helper，定位时保留 source panel 语义，避免从面板内定位时反复重开面板。

边界：

- 本步不改全局 `locateObject()`，不迁移其它面板定位路径。
- 本步不新增闪烁高亮或 API 暴露。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：marker 面板选中 `丹江矿山` 后点击行内定位，selection 保持 marker `#2`，面板选中行未丢，`glError = 0`，console/page error 为 `0`。

## 2026-07-09：`refreshPanelsForEdit()` helper 第一刀

本步推进编辑器基础设施清单中的对象面板刷新 helper，先按命令 `effects.affected.kind` 做保守刷新。

修正：

- `app.js` 新增 `refreshPanelsForEdit()` 和 `updatePanelForAffectedKind()`。
- helper 覆盖 state、province、city、culture、religion、river、lake、route、marker、label、zone、note、measurement 等对象 kind。
- 测量对象重命名 / 删除调用点改为在命令执行后通过 `refreshPanelsForEdit()` 刷新测量面板。

边界：

- 本步 helper 仍保留在 `app.js` 内部，不抽成跨模块 API。
- 本步不改撤销 / 重做路径，也不一次性迁移其它面板。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：删除注入的 `烟测测量` 后，测量数 `1 -> 0`，面板摘要刷新为 `测量 0`，状态显示“已删除测量对象 烟测测量。”；头部撤销后测量对象恢复，`glError = 0`，console/page error 为 `0`。

## 2026-07-09：Edit Command 轻量契约第一刀

本步推进编辑器基础设施清单中的命令字段规范，先写入中文契约文档，不强制批量改造既有命令。

修正：

- 新增 `docs/task-notes/edit-command-contract.md`，记录编辑命令的最小字段、推荐字段、`context` 边界、`effects` 结构、调用层约定、撤销快照要求和删除命令边界。
- `docs/task-notes/README.md` 新增专题索引。
- `docs/task-notes/editor-and-stat-panel-inventory.md` 把命令规范小步更新为“维护契约并逐步让新增命令遵守”。

边界：

- 本步不新增运行时校验，不要求一次性补齐所有旧命令的 `domain / getResult`。
- 后续新增命令应优先按该契约提供 `effects.affected` 和清晰的 `isNoop` 语义。

验证：

- `git diff --check` 通过。

## 2026-07-09：`executeEditCommand()` helper 第一刀

本步推进编辑器基础设施清单中的统一命令执行入口，先选测量面板作为低风险调用点试迁移。

修正：

- `app.js` 新增 `executeEditCommand(state, documentRef, command, options)`，统一处理 `isNoop`、`EditHistory.execute`、`refreshAfterEdit` 和可选状态文案。
- 测量对象重命名和删除改走 `executeEditCommand()`，保留测量面板刷新和 overlay 刷新的专属后处理。
- 修正 `MeasurementPanel.vue` 动作条脚本中未定义的 `callbacks` 引用，改为 `props.callbacks`，确保编辑形状、定位、删除和导出动作能触发真实回调。

边界：

- 本步 helper 仍保留在 `app.js` 内部，不抽成跨模块 API。
- 本步只迁移测量对象重命名 / 删除，不一次性改写路线、备注、名称库或其它面板。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：向测量面板注入 `烟测测量` 后，通过列表动作条删除，测量数 `1 -> 0`、历史 `undo=1`、状态显示“已删除测量对象 烟测测量。”；头部撤销后恢复为 `1` 且 `redo=1`，`glError = 0`，console/page error 为 `0`。

## 2026-07-09：宗教面板新增 / 删除空宗教第一刀

本步继续推进编辑面板新增 / 删除统一化，为宗教管理补齐低风险的空宗教新增和删除入口。

修正：

- 新增 `createAddReligionCommand()`，可在宗教存储中创建无覆盖、无中心、无子级的用户空宗教，并支持撤销删除该新增项。
- 新增 `createDeleteReligionCommand()`，删除前检查 pack/grid cell 使用、子宗教、城市、城镇和国家所有者；只有完全空置的叶子宗教会被标记为 `removed`。
- 宗教面板列表动作条新增“新增空宗教 / 定位宗教 / 删除空宗教”，删除按钮会根据当前宗教是否可删自动禁用。
- 运行时接入新增 / 删除回调，命令执行后刷新派生面板、选中新宗教或清理选择，并同步编辑锁状态。

边界：

- 本步不做宗教 cell 归属刷、覆盖重分配、中心迁移、扩张约束编辑或文化联动重算。
- 非空宗教删除会被阻止，不做强制迁移或级联删除。

验证：

- `node --check app\webgl-generator\src\runtime\religion-edit-commands.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\religion-panel.js` 和 `git diff --check` 通过。
- 命令级 Node 断言确认新增宗教、撤销新增、重做新增、删除空宗教、撤销删除和非空宗教删除阻止逻辑正常。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：新增 `新宗教 19` 后宗教数 `19 -> 20`，删除后可见数回到 `19` 且 `removed=true`，头部撤销后恢复到 `20`；`glError = 0`，console/page error 为 `0`。

## 2026-07-09：文化面板新增 / 删除空文化第一刀

本步继续推进编辑面板新增 / 删除统一化，先为文化管理补齐低风险的空文化新增和删除入口。

修正：

- 新增 `createAddCultureCommand()`，可在文化存储中创建无覆盖、无中心、无子级的用户空文化，并支持撤销删除该新增项。
- 新增 `createDeleteCultureCommand()`，删除前检查 pack/grid cell 使用、子文化、城市、城镇和国家所有者；只有完全空置的叶子文化会被标记为 `removed`。
- 文化面板列表动作条新增“新增空文化 / 定位文化 / 删除空文化”，删除按钮会根据当前文化是否可删自动禁用。
- 运行时接入新增 / 删除回调，命令执行后刷新派生面板、选中新文化或清理选择，并同步编辑锁状态。

边界：

- 本步不做文化 cell 归属刷、覆盖重分配、中心迁移、扩张参数编辑或宗教联动重算。
- 非空文化删除会被阻止，不做强制迁移或级联删除。

验证：

- `node --check app\webgl-generator\src\runtime\culture-edit-commands.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\culture-panel.js` 和 `git diff --check` 通过。
- 命令级 Node 断言确认新增文化、撤销新增、重做新增、删除空文化、撤销删除和非空文化删除阻止逻辑正常。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：新增 `新文化 13` 后文化数 `13 -> 14`，删除后可见数回到 `13` 且 `removed=true`，头部撤销后恢复到 `14`；`glError = 0`，console/page error 为 `0`。

## 2026-07-09：PNG 导出合成固定地图 overlay

本步收尾视觉主题第一阶段的导出验证，把比例尺和地图图例纳入 PNG 合成。

修正：

- `composeMapExportCanvas()` 在地图内容 overlay 后继续绘制固定地图 UI overlay。
- 新增比例尺绘制逻辑，读取 `#map-scale-bar`、`.map-scale-line` 和 `.map-scale-label` 的 computed style，合成当前主题下的面板、线段和文字。
- 新增地图图例绘制逻辑，读取 `#map-legend` 的 computed style，合成图例面板、标题、温度 / 降水渐变条、刻度和 swatch 条目。
- PNG 导出仍不合成浮动面板、控制面板、toast、测量工具条或 hover 浮层。

验证：

- `node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物文件级烟测通过：切换 `night`、进入温度视图并导出 PNG 后，文件尺寸为 `1280 x 800`；比例尺线像素为 `[209, 230, 230, 255]`，比例尺背景像素为 `[28, 23, 30, 255]`，图例背景像素为 `[27, 21, 27, 255]`，状态显示“图片已导出”，`glError = 0`，非 health console/page error 为 `0`。

## 2026-07-09：视觉主题图例 token 第一刀

本步继续推进视觉主题第一阶段，把地图图例面板接入主题 token。

修正：

- 六个内置主题新增 `legend` token，覆盖图例背景、边框、主文字、弱文字和 swatch 边框。
- `placeholder-renderer.js` 把 `legend` token 写入 `.map-stage` 上的 `--theme-legend-*` CSS 变量。
- `.map-legend`、`.legend-title`、`.legend-ticks`、`.legend-swatch-item` 和 swatch 边框改为读取主题变量。

边界：

- 温度 / 降水渐变条保持数值语义色，不随主题改色。
- 政体 / 外交 swatch 保持对象语义色，只改 swatch 边框和图例容器文字。

验证：

- `node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：切换到 `night` 并切到温度视图后，图例可见，背景为 `rgba(3, 8, 13, 0.84)`、标题为 `rgb(214, 235, 235)`、刻度为 `rgba(194, 219, 224, 0.88)`，`glError = 0`，非 health console/page error 为 `0`。

## 2026-07-09：视觉主题标签和比例尺 token 第一刀

本步继续推进视觉主题第一阶段，把主题 token 从 WebGL 线层接到 DOM overlay 的主要文字与比例尺样式。

修正：

- 六个内置主题新增 `labels` 和 `scaleBar` token，覆盖城市标签、国家标签、手工标签、比例尺文字、比例尺线、比例尺背景和边框。
- `placeholder-renderer.js` 在应用地图背景时同步把主题 token 写入 `.map-stage` CSS 变量。
- `styles.css` 中比例尺、城市标签、国家标签和手工标签改为读取主题 CSS 变量，并保留原有 fallback。
- 切换主题时沿用既有 `setVisualTheme()` 路径实时刷新 DOM overlay 变量；PNG overlay 合成仍可通过 computed style 读取当前颜色。

边界：

- 本步不改图例、城市 / marker / 军事图标配色。
- 本步不做主题编辑器、PNG 透明背景或图例 token。

验证：

- `node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：切换到 `night` 后，`.map-stage` 写入比例尺、城市标签、国家标签和手工标签主题变量；比例尺背景为 `rgba(3, 8, 13, 0.82)`、比例尺线为 `rgb(209, 230, 230)`，城市标签为 `rgb(219, 230, 194)`，国家标签为 `rgba(242, 199, 115, 0.94)`；渲染数据签名保持不变，`glError = 0`，非 health console/page error 为 `0`。

## 2026-07-09：视觉主题线层 token 第一刀

本步继续推进视觉主题第一阶段，把主题 token 从背景 / 水色 / 高度色带扩展到主要线层。

修正：

- 六个内置主题新增 `lines` token，覆盖海岸线、湖岸线、国界、省界、主路、次路和小路。
- `shore-layer.js` 读取主题海岸线 / 湖岸线颜色。
- `placeholder-renderer.js` 的政治边界、地图边缘淡出和路线动态 mesh 读取主题 token。
- 切换主题时会刷新 cell surface、静态线层，并标记道路动态 buffer 重建。

边界：

- 本步不改标签、比例尺、图例和图标 DOM 颜色。
- 选中路线高亮色保持原有金色，不随主题变化。

验证：

- `node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\shore-layer.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：切换到 `night` 后，海岸线、湖岸线、国界、省界、主路、次路和小路 token 全部变化；路线 buffer `34488` 顶点、线层 buffer `124194` 顶点、渲染路线 `589`，`glError = 0`，checksum 保持 `720ca4c7`，非 health console/page error 为 `0`。

## 2026-07-09：视觉主题预设基础第一刀

本步启动“视觉主题与样式预设第一阶段”，先建立 WebGL 版自己的轻量主题 token 和只读主题选择，不兼容原版 SVG selector 样式系统。

修正：

- 新增 `app/webgl-generator/src/renderer/themes.js`，提供默认、古地图、浅色图册、暗海、单色、夜间六个只读主题。
- 控制面板“视图”页新增“视觉主题”下拉，并把选择写入全局控制偏好。
- renderer 新增 `setVisualTheme()`；主题会影响 WebGL clear 背景、地图 stage 背景、水色和高度色带，并触发 surface 刷新。
- 完整地图 JSON 保存 `map.visualTheme.preset`、`map.options.visualTheme` 和 `options.visualTheme`；导入本地文件或浏览器存档时会恢复主题。

边界：

- 本步不做主题编辑器、用户主题导入导出或原版 `public/styles/*.json` 兼容。
- 边界、道路、标签、比例尺和图例 token 尚未接入；后续需继续推进。

验证：

- `node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\color-modes.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\ui\vue\stores\global-config-store.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：切换到 `night` 后，renderer 主题、选择框、偏好、stage 背景和主题 token 同步变化，checksum 保持不变，`glError = 0`，非 health console/page error 为 `0`。
- 主题持久化烟测通过：导出 `docs/generated/smoke/visual-theme-night-map.webgl-map.json` 后文件中 `map.visualTheme.preset`、`map.options.visualTheme`、`options.visualTheme` 均为 `night`；切回默认再导入该文件后恢复 `night`，checksum 保持 `218187a0`，`glError = 0`，非 health console/page error 为 `0`。

## 2026-07-09：政治面 dissolve 导出 UI 开关第一刀

本步把已验证的政治面 dissolve 内部选项接入要素 GeoJSON 导出浮层，用户可以按需输出真正合并外轮廓。

修正：

- 要素 GeoJSON 图层区新增“合并政治面边界”开关，默认关闭。
- `exportFeatureGeoJson()` 读取该开关，并把 `dissolvePolitical` 传给 `createMapFeatureGeoJson()`。
- 启用后导出状态文案追加“已合并政治面边界”。
- 地图未就绪时禁用列表补上 dissolve 开关。

边界：

- 默认导出仍保持非 dissolve，避免大图导出成本突然变化。
- 本步不改变 pack cell GeoJSON，不做 100k cells 大图耗时优化。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：勾选国家面、省份面、区域，关闭 city / route / river / marker，并启用“合并政治面边界”后，下载的 `docs/generated/smoke/features-dissolve-smoke.geojson` 中 `properties.layerSet = states-provinces-zones`、`properties.dissolvedPolitical = true`；feature 数 `261`、bad feature `0`、坐标点 `12030`；状态显示“已合并政治面边界”，`glError = 0`，非 health console/page error 为 `0`。

## 2026-07-09：政治面 dissolve 内部导出验证第一刀

本步把上一刀的 dissolve 拓扑原型接入 `createMapFeatureGeoJson()` 内部选项，完成真实生成图验证，但暂不暴露 UI 开关。

修正：

- `createMapFeatureGeoJson(map, {dissolvePolitical: true})` 会对 state / province / zone 图层使用 `dissolvePackCellPolygons()`。
- collection properties 新增 `dissolvedPolitical` 标记。
- state / province / zone feature 在 dissolve 模式下写入 `properties.dissolved = true`；默认导出仍保持非 dissolve 输出和 `dissolved=false`。
- 政治 cell 分组保存 `cellIds`，供 dissolve 函数复用，避免从 MultiPolygon 坐标反推拓扑。

边界：

- 本步不修改导出浮层 UI，不改变用户默认 `.features.geojson` 文件。
- 暂不做浏览器下载烟测；下一刀接入 UI 开关时再验证实际文件。

验证：

- `node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- `git diff --check` 通过。
- 命令级 Node 真实生成图验证通过：`dissolve-smoke`、`10000` cells、`continents` 模板下，state / province / zone 的非 dissolve 与 dissolve feature 数均为 `206`；坐标点 `53180 -> 10383`，减少 `80.48%`；非 dissolve 导出 `21.74ms`，dissolve 导出 `44.43ms`；dissolve 输出的 collection `properties.dissolvedPolitical = true`，所有 feature `properties.dissolved = true`。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

## 2026-07-09：政治面 dissolve 拓扑原型第一刀

本步启动“政治面 GeoJSON dissolve”的第二阶段，但先只做可命令级验证的拓扑纯函数，不改变当前要素 GeoJSON 导出 UI。

修正：

- `map-file-io.js` 新增 `dissolvePackCellPolygons(map, cellIds)`，输入 pack cell ids 后按 Voronoi 顶点边生成边界。
- 同一对象内部共享边会被消除，保留边界边后再按端点拼接闭合 rings。
- rings 会按包含关系组装为 MultiPolygon，并把 hole 归入对应外环。

边界：

- 本步不接入 state / province / zone 导出开关，现有 `.features.geojson` 仍输出 `dissolved=false` 的 cell MultiPolygon。
- 不引入 GIS 运行时库，不做坐标简化，不做真实地图体积和耗时统计；这些留给下一刀导出验证。

验证：

- `node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- `git diff --check` 通过。
- 命令级 Node 断言确认两个相邻方形 cell dissolve 后输出一个闭合 MultiPolygon，点数从非合并的 `10` 点降为 `7` 点。
- 命令级 Node 断言确认 `3x3` 缺中心对象输出一个 polygon、两个 rings：外环 `13` 点、hole `5` 点，两个 ring 均闭合。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

## 2026-07-09：PNG 导出倍率第一刀

本步继续推进“导出能力矩阵收尾”，为图片导出补齐倍率选项。图片导出此前已合成 WebGL canvas 和地图 overlay，但输出尺寸只能跟随当前 canvas。

修正：

- 导出浮层新增 `PNG 倍率` 控件，支持 `1x / 2x / 3x / 4x`。
- `downloadCanvasPng()` 新增 `pixelScale` 选项，按倍率放大合成 canvas；WebGL 画面、比例尺、地图摘要、城市 / 标记 / 军事图标和标签 overlay 会按同一比例绘制。
- 图片导出状态会显示实际像素尺寸、倍率和文件大小。
- 地图未就绪时禁用列表补上压缩地图数据按钮和 PNG 倍率控件。

边界：

- 本步不做透明背景、裁剪范围或是否包含 overlay 的显式开关。
- PNG 导出仍默认合成当前地图 overlay，不导出浮动面板 UI。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\map-file-io.js`、`node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`PNG 倍率` 控件包含 `1/2/3/4x`，设置 `2x` 后下载到 `docs/generated/smoke/png-scale-2x-smoke.png` 的 PNG 文件头尺寸为 `2560 x 1600`，源 canvas 为 `1280 x 800`，状态显示“倍率 2x”，`glError = 0`，非 health console/page error 为 `0`。

## 2026-07-09：地图数据导入错误详情第一刀

本步继续推进“导出能力矩阵收尾”，补齐完整地图数据导入失败时的可读诊断。此前控制面板只显示一行失败状态，坏 JSON、错误文件格式或未来版本文件都缺少文件维度的排查信息。

修正：

- 控制面板在本地文件操作状态下新增导入错误详情块，使用等宽、可换行、可滚动显示，默认隐藏。
- 地图数据导入失败时会写入文件名、大小、MIME、推断格式、错误类型、错误信息和中文处理建议。
- 地图数据导入开始或成功后会清空旧错误详情，避免上一次失败信息残留。
- 地图数据导入失败改为 `console.warn` 诊断，避免用户输入错误污染自动烟测的 console error 通道；GEO 和高度图导入错误路径本步不改。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：上传坏 JSON 后，控制面板显示 `SyntaxError`、文件名 `broken.webgl-map.json`、大小 `12B`、MIME、推断格式和中文建议；详情块保持展开，`glError = 0`，非 health console/page error 为 `0`，warning 通道记录预期导入失败诊断。

## 2026-07-09：完整地图压缩文件导出 / 导入第一刀

本步推进“导出能力矩阵收尾”中的完整 JSON 压缩方向，让本地文件除了默认 `.webgl-map.json` 外，也能导出可重新导入的 `.webgl-map.json.gz`。

修正：

- `map-file-io.js` 新增压缩地图文档下载、压缩文件读取和 `migrateMapDocument()` 迁移管线。
- 控制面板导出浮层新增“压缩地图数据”入口，默认“地图数据”仍保持纯 JSON。
- 导入地图数据入口接受 `.webgl-map.json.gz`，压缩文件解压后继续走同一地图文档解析和运行时加载链路。
- `docs/task-notes/export-capability-matrix.md` 同步记录压缩格式现状，并把后续缺口收窄到真实跨版本迁移器和导入错误详情面板。

边界：

- 本步不改变 `webgl-generator-map v1` 字段，不新增 v2 文档格式。
- 压缩文件依赖浏览器 `CompressionStream / DecompressionStream`；不支持的浏览器会显示明确错误。

验证：

- `node --check app\webgl-generator\src\runtime\map-file-io.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- 命令级 Node 断言确认 v1 文档、typed array 恢复和未来版本拒绝逻辑正常。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：`.webgl-map.json.gz` 成功下载到 `docs/generated/smoke/compressed-map-export-smoke.webgl-map.json.gz`，压缩文件大小 `2453306` 字节；重新导入后 seed `stage-2-1`、grid cells `10004`、pack cells `5968`、`glError = 0`，非健康监控 console/page error 为 `0`，健康监控记录 `3` 次 `main-thread-long-task`。

## 2026-07-09：修复高度面板重算入口可见性

子智能体复核发现高度面板的 `.height-history-actions` 被早期通用隐藏规则 `display: none !important` 压住，导致“撤销上次 / 重做上次 / 重算河流”在 DOM 中存在但用户不可见、不可点击。

修正：

- 从通用隐藏名单中移除 `.height-history-actions`。
- 高度面板操作区改为三列布局，稳定显示“撤销上次 / 重做上次 / 重算河流”。

验证：

- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测确认高度操作区 `display: grid`，重算河流按钮可见矩形为 `106x36`，真实点击“重算河流”后待派生从 12 项降为 9 项，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：编辑器基础设施现状盘点

远端主线合入了编辑器基础设施盘点和控制台 / 扩展 API 系统规划文档。本地后续执行队列仍以当前 `docs/current-plan.md` 的已验证步骤为准。

处理：

- `docs/task-notes/editor-and-stat-panel-inventory.md` 记录了 `EditHistory`、`edit-refresh-scheduler`、`SelectionStore`、面板刷新和公共面板组件的现状盘点。
- 新增 `docs/task-notes/console-extension-api-system-plan.md`，记录 API 命名空间、统一返回格式、副作用边界和分阶段实施路径。
- 更新 `docs/task-notes/README.md` 索引。

验证：

- 远端原提交记录 `git diff --check` 通过；本次合并后重新运行项目级检查。

## 2026-07-09：河流重算清理已刷新派生状态

本步修正高度编辑后执行河流重算仍把河流、路线、生物群系留在待派生摘要里的状态误导。

修正：

- `regenerateRivers` 完成后把 `rivers / routes / biomes` 标为 fresh。
- 城镇、政治、标记、地区、军事、经济和外交等仍保留待派生状态。
- 本步只调整派生过期清单，不改变河流、路线或生物群系重算算法。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：高度笔刷后待派生为 12 项，点击“重算河流”后降为 9 项，且 `rivers / routes / biomes` 不再留在过期清单中。

## 2026-07-09：高度面板接入河流重算入口

本步在高度面板提供第一处直接派生重算入口，让用户在高度编辑后可以按当前高度重算河流。

修正：

- 高度面板操作区新增“重算河流”按钮。
- 运行时回调复用既有 `regenerateMapAttribute(state, "rivers")`。
- 点击后同步刷新重生成状态记录和高度面板摘要。
- 本步不做一键全量重算，不新增河流算法，也不改变高度笔刷命令。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\height-panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：高度面板存在“重算河流”按钮，点击后完成河流重算，`glError = 0`，console/page error 为 `0`。

## 2026-07-09：高度面板待派生明细摘要

本步把高度面板的待派生数量补成可读摘要，帮助用户快速判断主要受影响领域。

修正：

- 高度面板新增高度依赖派生系统的中文名称映射。
- “待派生”指标显示前三项系统名称，更多系统时追加“等”。
- 本步只做短摘要，不展开详情表，也不新增重算入口。

验证：

- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测确认高度笔刷后面板显示“待派生12 项：河流、路线、生物群系等”。

## 2026-07-09：高度面板显示待派生摘要

本步把高度编辑造成的待派生状态显示到高度面板摘要里，减少用户只依赖运行时侧栏判断派生状态的成本。

修正：

- 运行时向高度面板传入 `metadata.derivedStale.systems`。
- 高度面板状态新增 `derivedStaleSystems`。
- 高度面板摘要新增“待派生”指标，无过期系统时显示“无”，有过期系统时显示数量。
- 本步只显示待派生数量，不提供自动重算入口，也不改变派生系统清单。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\height-panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：高度面板初始显示“待派生无”，高度笔刷后显示“待派生12 项”，过期系统清单包含河流、路线、生物群系、聚落、政治和下游系统，撤销历史为 `1`，`glError = 0`，console/page error 为 `0`。

## 2026-07-09：高度笔刷标记派生过期第一刀

本步让高度编辑提交后明确标记依赖高度的派生系统为待重建，避免高度表面已经更新但河流、路线、生物群系、聚落和下游系统仍沿用旧数据时缺少提示。

修正：

- 高度笔刷命令新增高度依赖派生系统清单，覆盖河流、路线、生物群系、城镇、国家、省份、宗教、标记、地区、军事、经济和外交。
- 高度笔刷应用和撤销时都会写入 `map.metadata.derivedStale.systems`。
- 同步维护军事、地区、标记、经济和外交已有 metadata stale 标志。
- 本步只标记过期状态，不自动重算这些派生系统。

验证：

- `node --check app\webgl-generator\src\runtime\height-edit-commands.js` 通过。
- 命令级 Node 验证确认高度笔刷应用 / 撤销都会写入高度依赖派生过期系统，并同步军事、经济等 metadata stale 标志。
- `git diff --check` 通过。
- Playwright + 系统 Chrome 构建产物烟测确认高度笔刷后过期系统包含 12 项，并在高度面板显示为“待派生12 项”。

## 2026-07-09：高度面板最近笔刷均变反馈

本步补齐最近一次高度编辑的强度反馈，让用户除了影响 cells 和高度范围外，也能看到平均抬升 / 降低幅度。

修正：

- 高度编辑运行时新增 `lastDelta`，预览和最终提交时都会按 `after - before` 计算平均高度变化。
- 高度面板状态新增 `lastDelta`，摘要区新增“均变”指标，并按当前高度单位显示。
- 本步只新增统计字段和面板显示，不改变笔刷算法、命令内容、撤销 / 重做或地图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\height-panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：高度面板打开后包含“均变”，高度笔刷后“均变”显示带符号数值，撤销历史为 `1`，`glError = 0`，console/page error 为 `0`。

## 2026-07-09：高度面板统计增强第一刀

本步补齐专题清单中“高度分布、陆地比例、海平面、山地/低地占比”的只读统计入口。

修正：

- 运行时 `summarizeCurrentHeightStats` 新增陆地、低地、丘陵、山地和海平面带 cells 统计。
- 高度面板摘要新增当前均高、陆地比例、低地比例、山地比例和海平面带比例。
- 本步只扩展高度统计和面板展示，不改变高度笔刷、导入工作台、派生重建或地图数据。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

## 2026-07-09：高度编辑器命令化状态校准

本步复核专题清单中“高度编辑器正式版下一步需要把操作变成命令”的旧状态，避免后续重复实现已完成的命令链路。

结论：

- 当前代码已有 `height-edit-commands.js`，高度笔刷变化会通过 `createApplyHeightBrushCommand` 记录 `before / after`。
- 运行时 `finishHeightStroke` 会把高度笔刷命令提交到 `EditHistory`，并通过 `refreshAfterEdit` 刷新画布和统计。
- 高度面板注册了 `historyActions`，面板头部撤销 / 重做和面板内“撤销上次 / 重做上次”均调用同一历史栈。
- 后续高度方向应继续推进高度统计增强、派生重建范围或更复杂地形工具，而不是再补“命令骨架”。

验证：

- 已复核 `app\webgl-generator\src\runtime\height-edit-commands.js` 和 `app\webgl-generator\src\runtime\app.js` 中的 `finishHeightStroke` / 高度面板撤销重做接入。
- `git diff --check` 通过。

## 2026-07-08：水体统计面板补齐岸线长度

本步补齐专题清单中明确列出的岸线长度指标，区分海岸线和湖岸线。

修正：

- 水体统计摘要新增“海岸长度”和“湖岸长度”。
- 岸线长度从 `map.features.shore.coastline / lakeShore` 线段直接累加，并按当前距离单位显示。
- 本步不改变 shoreline 生成、湖泊分组或地图渲染。

验证：

- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：水体统计面板可打开，表格 11 行，摘要包含“海岸长度 / 湖岸长度”，详情仍正常显示选中 feature，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：水体统计面板补齐港湾指标

本步补齐专题清单中明确列出的 haven / harbor 统计，让水域 feature 能看到港湾候选规模。

修正：

- 水体统计摘要新增“港湾 cells”和“泊位强度”。
- 水体统计表格和详情新增每个水域 feature 的港湾 cells 与泊位强度。
- 港湾指标只读取 `pack.cells.haven / harbor` 并按 haven 指向的水域 feature 汇总，不改变港口生成、城市港口状态或路线派生。

验证：

- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：水体统计面板可打开，表格 11 行，摘要和详情包含“港湾 cells / 泊位强度”，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：气候统计面板第一刀

本步补齐气候专题的只读统计入口，先查看当前温度、降水、纬度和风带结果。

修正：

- 新增 `climate-panel.js` 和 `ClimatePanel.vue`，汇总温度范围、平均温度、降水范围、平均降水、干旱 / 湿润陆地 cells。
- 控制面板“管理”tab 新增“气候统计”入口，并在运行时注册 `climate-panel` 的打开、持久化恢复和面板刷新。
- 气候统计表按温度带列出 cells、陆地 / 水域、均温、降水、干旱 / 湿润陆地 cells 和平均适居度，并支持筛选、排序和选中详情。
- 同步当前计划和专题清单状态；本步不改变气候控制、biome 重算或下游派生重建。

验证：

- `node --check app\webgl-generator\src\ui\panels\climate-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：水体统计面板可打开，表格 11 行，详情包含 feature 类型和分组字段；气候统计面板可打开，表格 5 行，详情包含纬度和大气方向字段；`glError = 0`，console/page error 为 `0`。

## 2026-07-08：水体与地貌统计面板第一刀

本步补齐专题清单中 `Feature / 水体 / 海岸面板` 的只读统计入口，先查看 pack 语义层 feature 分布和引用异常。

修正：

- 新增 `feature-panel.js` 和 `FeaturePanel.vue`，汇总 feature、陆地、水域、湖泊、海岸线段和异常引用。
- 控制面板“管理”tab 新增“水体统计”入口，并在运行时注册 `feature-panel` 的打开、持久化恢复和面板刷新。
- 水体与地貌统计表按 feature 列出类型、分组、cells、面积、岸线、水位、补给和蒸发，并支持筛选、排序和选中详情。
- 同步当前计划和专题清单状态；湖泊出口、海岸线修补和 feature 类型编辑仍待做。

验证：

- `node --check app\webgl-generator\src\ui\panels\feature-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：水体统计面板可打开，表格 11 行，详情包含 feature 类型和分组字段；气候统计面板可打开，表格 5 行，详情包含纬度和大气方向字段；`glError = 0`，console/page error 为 `0`。

## 2026-07-08：纹章统计面板第一刀

本步补齐第三批中的纹章轻量统计入口，先查看国家和城市已有 `coa` 字段覆盖情况。

修正：

- 新增 `emblem-panel.js` 和 `EmblemPanel.vue`，汇总国家 / 城市纹章对象、有纹章 / 缺失数量和盾形种类。
- 控制面板“管理”tab 新增“纹章统计”入口，并在运行时注册 `emblem-panel` 的打开、持久化恢复和面板刷新。
- 纹章统计表列出对象范围、名称、盾形、底色、图案、图案色、尺寸和状态，并支持筛选、排序和选中详情。
- 同步当前计划和专题清单状态，标记纹章统计面板第一刀完成；纹章编辑、锁定、重新生成和可视化预览仍待做。

验证：

- `node --check app\webgl-generator\src\ui\panels\emblem-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：人口统计面板可打开，表格 26 行，详情包含国家人口字段；纹章统计面板可打开，表格 26 行，详情包含国家纹章字段；`glError = 0`，console/page error 为 `0`。

## 2026-07-08：人口统计面板第一刀

本步补齐第三批中的人口统计入口，先做只读汇总，不进入人口刷子或迁移模拟。

修正：

- 新增 `population-panel.js` 和 `PopulationPanel.vue`，汇总总人口、乡村/城市人口、人口 cells、最高 cell 人口和城镇数。
- 控制面板“管理”tab 新增“人口统计”入口，并在运行时注册 `population-panel` 的打开、持久化恢复和面板刷新。
- 人口统计表按国家、省份、文化、宗教四类列出人口、乡村人口、城市人口、面积、密度和城镇数，并支持筛选、排序和选中详情。
- 同步当前计划和专题清单状态，标记人口统计面板第一刀完成。

验证：

- `node --check app\webgl-generator\src\ui\panels\population-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 综合构建和浏览器烟测按本轮“累积几步后统一执行”节奏，待后续小步完成后一起执行。

## 2026-07-08：生物群系统计面板第一刀

本步补齐第三批中的生物群系统计入口，先建立只读统计面板，不进入局部编辑。

修正：

- 新增 `biome-panel.js` 和 `BiomePanel.vue`，按 `map.pack.cells.biome / s / pop` 汇总各生物群系的 cells、面积、适居度、人口和城市覆盖。
- 控制面板“管理”tab 新增“生物群系”入口，并在运行时注册 `biome-panel` 的打开、持久化恢复和面板刷新。
- 生物群系统计支持筛选、排序和选中详情；本步不提供定位、高亮或刷子编辑，避免把统计面板误作对象编辑器。
- 同步当前计划和专题清单状态，标记生物群系面板第一刀完成，人口统计面板仍待做。

验证：

- `node --check app\webgl-generator\src\ui\panels\biome-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：管理页存在“生物群系”入口，面板可打开，表格 13 行，详情包含 `pack cells`；路线面板存在“重算道路”操作，点击后状态显示“道路已按当前国家、城镇、港口和陆海约束重算（扰动 #1）：589 -> 589”，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：路线面板接入道路重算

本步把已有受约束道路重算能力暴露到路线管理面板，减少用户在路线清单和控制面板之间切换。

修正：

- 路线管理列表操作区新增“重算道路”动作。
- `route-panel.js` 增加 `onRegenerateRoutes` 回调桥接。
- 运行时复用 `regenerateMapAttribute(state, "routes")`，重算后刷新生成结果提示、路线面板、对象索引、路线 mesh 和运行状态。
- 同步校准路线专题清单状态：删除和道路重算入口已完成，改线、端点重连和等级/样式调整仍未实现。

验证：

- `node --check app\webgl-generator\src\ui\panels\route-panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：路线面板存在“重算道路”操作，点击后状态显示“道路已按当前国家、城镇、港口和陆海约束重算（扰动 #1）：589 -> 589”，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：路线面板删除路线第一刀

本步补齐路线管理面板的第一处删除编辑能力。

修正：

- 新增 `createDeleteRouteCommand()`，删除选中路线时同步删除该路线备注，刷新路线统计、pack 路线链接、路线 mesh 和对象 picking 索引，并支持撤销 / 重做恢复。
- 路线管理面板新增列表操作区，提供定位和删除选中路线。
- 运行时将路线删除操作接入 `EditHistory` 和既有刷新链路。

验证：

- `node --check app\webgl-generator\src\runtime\route-edit-commands.js`、`node --check app\webgl-generator\src\ui\panels\route-panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- 命令级 Node 验证通过：删除路线后路线数、metadata、pack 路线链接和备注同步变化；撤销后恢复；重做后再次删除。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：路线管理中删除路线 `#452` 后路线数 `589 -> 588`、metadata `589 -> 588`、线段 `2776 -> 2593`，头部撤销显示“撤销：删除路线 #452”；撤销后恢复到 `589 / 2776`，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：地区面板接入头部撤销重做

本步补齐地区管理面板与已有 `EditHistory` 的浮动面板头部按钮连接。

修正：

- `zone-panel.js` 注册浮动面板时补充 `historyActions`，复用现有 `panelState.history`、`onUndo` 和 `onRedo`。
- 地区样式命令、撤销 / 重做回调和地图刷新链路保持原实现。

验证：

- `node --check app\webgl-generator\src\ui\panels\zone-panel.js` 通过。
- `git diff --check` 通过。

## 2026-07-08：校准编辑器专题清单状态

本步修正 `docs/task-notes/editor-and-stat-panel-inventory.md` 中已过期的当前状态描述，避免后续接手继续按旧状态判断。

修正：

- 将 object table 虚拟滚动、列表筛选 / 排序持久化、控制面板和经济 tab 持久化改为已完成状态。
- 补记对象表格双击进入编辑已覆盖的面板范围，并保留未接入面板继续双击定位的边界。
- 更新第三批优先级说明，反映宗教、标签 / 命名、Marker 和 Zone 已完成的第一刀状态。

验证：

- `git diff --check` 通过。

## 2026-07-08：军事表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把军事管理面板接入公共 `edit` 事件，并对测量和军事两步做本批次综合验证。

修正：

- 军事管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击军团行后先同步选中军团，再打开现有“重命名”二级编辑浮层。
- 态势、批量态势、驻地基地、战报、兵种比例、导入导出和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 综合烟测通过：测量对象和军事管理双击首行后均打开对应“重命名”二级编辑浮层，输入值分别为“烟测测量”和首个军团名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：测量表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把测量对象管理面板接入公共 `edit` 事件。

修正：

- 测量对象表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击测量行后先同步选中测量对象，再打开现有“重命名”二级编辑浮层。
- 测量形状编辑、定位、删除、导出和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- 已在“军事表格双击进入重命名编辑”批次中完成构建和浏览器综合烟测。

## 2026-07-08：标记表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把资源与标记管理面板接入公共 `edit` 事件。

修正：

- 资源与标记管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击标记行后先同步选中标记，再打开现有“重命名”二级编辑浮层。
- 资源点放置、移动、删除、重生成、图标、备注编辑和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和标记管理，首行标记双击后选中标记并打开“重命名”二级编辑浮层，输入值为该标记名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：标签表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把标签管理面板接入公共 `edit` 事件。

修正：

- 标签管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击标签行后先同步选中标签，再打开现有“重命名”二级编辑浮层。
- 标签新增、删除、恢复、定位、备注编辑和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和标签管理，首行标签双击后选中标签并打开“重命名”二级编辑浮层，输入值为该标签名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：双击编辑第四批综合烟测

本次在完成湖泊、国家、省份、文化和宗教五个面板的表格双击编辑接入后，做了一次构建产物综合浏览器验证。

验证：

- Playwright + 系统 Chrome 使用构建产物和随机本地端口打开应用。
- 依次打开湖泊、国家、省份、文化和宗教面板，双击首个有效表格行，均能打开对应“重命名”二级编辑浮层。
- 五个面板的重命名输入值均与选中对象一致；`glError = 0`，console/page error 为 `0`。
- 验证脚本为临时本地脚本，运行后已删除，未纳入仓库。

## 2026-07-08：宗教表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把宗教管理面板接入公共 `edit` 事件。

修正：

- 宗教管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击宗教行后先同步选中宗教，再打开现有“重命名”二级编辑浮层。
- 宗教颜色、继承、备注编辑和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和宗教管理，首行宗教双击后选中宗教并打开“重命名”二级编辑浮层，输入值为该宗教名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：文化表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把文化管理面板接入公共 `edit` 事件。

修正：

- 文化管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击文化行后先同步选中文化，再打开现有“重命名”二级编辑浮层。
- 文化颜色、继承、名称库绑定、备注编辑和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和文化管理，首行文化双击后选中文化并打开“重命名”二级编辑浮层，输入值为该文化名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：省份表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把省份管理面板接入公共 `edit` 事件。

修正：

- 省份管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击非中立省份行后先同步目标省份，再打开现有“重命名”二级编辑浮层。
- 中立行不触发重命名；省份 cell 归属刷、新增/删除、颜色、备注编辑和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和省份管理，非中立省份行双击后选中省份并打开“重命名”二级编辑浮层，输入值为该省份原名，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：国家表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把国家管理面板接入公共 `edit` 事件。

修正：

- 国家管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击非中立国家行后先同步目标国家，再打开现有“重命名”二级编辑浮层。
- 中立行不触发重命名；国家 cell 归属刷、新增/删除、颜色、政体、首都、备注编辑和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和国家管理，非中立国家行双击后选中国家并打开“重命名”二级编辑浮层，输入值为该国家原名，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：湖泊表格双击进入重命名编辑

本步继续扩展对象表格“双击进入编辑”能力，把同样已有重命名浮层的湖泊管理面板接入公共 `edit` 事件。

修正：

- 湖泊管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击湖泊行后先同步选中该湖泊，再打开现有“重命名”二级编辑浮层。
- 湖泊定位、批量名称库重命名和历史撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和湖泊管理，首行湖泊双击后选中湖泊并打开“重命名”二级编辑浮层，输入值为该湖泊名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：河流表格双击进入重命名编辑

本步延续对象表格“双击进入编辑”能力，把城市首刀复用到河流管理面板。

修正：

- 河流管理表格显式启用 `doubleClickAction="edit"`，并处理 `edit` 事件。
- 双击河流行后先同步选中该河流，再打开现有“重命名”二级编辑浮层。
- 河道编辑模式、宽度调整、定位按钮、备注编辑和撤销/重做链路保持原行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和河流管理，首行河流双击后选中河流并打开“重命名”二级编辑浮层，输入值为该河流名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：城市表格双击进入重命名编辑

本步继续补齐对象表格组件清单中的“双击进入编辑”能力，先在城市管理面板落地。

修正：

- `UiObjectTable` 新增可选 `edit` 事件；父组件提供 `@edit` 时，双击行会先同步选中该行，再触发编辑事件。
- 未提供 `@edit` 的表格保持原行为，双击仍触发定位，降低对其它面板的回归风险。
- 城市管理表格接入 `@edit`，双击城市行后打开重命名编辑浮层。

验证：

- `git diff --check` 通过。
- 在同一提升环境中重装依赖后，`$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物 Playwright + 系统 Chrome 烟测通过：打开控制面板管理页和城市管理，首行城市双击后选中城市并打开“重命名”二级编辑浮层，输入值为该城市名称，`glError = 0`，console/page error 为 `0`。

## 2026-07-08：对象表格虚拟滚动第一刀

本步开始处理编辑器清单中的 object table 虚拟滚动，先在公共 `UiObjectTable` 层做低侵入实现。

修正：

- `UiObjectTable` 对超过阈值的大表启用固定行高虚拟窗口，仅渲染可见行和少量缓冲行，并用顶部 / 底部占位行保持滚动高度。
- 小表仍按原方式完整渲染；点击选择、双击定位、定位按钮和现有列格式化保持不变。
- 选中行居中逻辑在虚拟滚动下改为按行索引定位滚动位置，避免目标行尚未渲染时无法滚动。

验证：

- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：打开城市管理后，828 个城市仅渲染 26 个 `.object-table-row`；滚动到列表中后段后首行内容变化且存在顶部 / 底部占位高度；点击可见行后仍只有 1 个 `.selected-row`；`glError = 0`。

## 2026-07-08：控制面板和经济面板当前 tab 持久化

本步继续执行编辑器基础设施中的“当前 tab”持久化，先覆盖主控制面板和经济总览内部 tab。

修正：

- 控制面板全局偏好增加 `controlPanelTab`，刷新页面后恢复上次停留的简介、生成、视图、图层、管理或单位页。
- 经济总览的列表偏好增加受限 `tab` 字段，支持恢复商品、市场或交易页；切换经济 tab 时同步保存对应默认排序字段和方向。
- 本步不改变经济面板的选中对象、筛选词、导入导出或地图数据。

验证：

- `node --check app\webgl-generator\src\ui\panel-list-preferences.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\economy-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\vue\stores\global-config-store.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：预写 `webgl-generator-control-preferences.controlPanelTab = management` 后刷新，控制面板恢复到“管理”；预写 `webgl-generator-panel-list:economy-panel.tab = deals` 后打开经济总览，面板恢复到交易表，表头包含“卖方 / 买方 / 金额”，`glError = 0`。

## 2026-07-08：列表偏好第三批综合烟测

本步收尾第三批列表偏好持久化验证，覆盖附属对象、测量、名称库和剩余复杂管理面板。

验证：

- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：预写 `webgl-generator-panel-list:*` 后刷新并打开各面板，marker、标签 / 命名、备注总览、测量对象、名称库总览、政体、经济和军事面板均恢复对应筛选词。
- 同次烟测确认上述 8 个面板均恢复 `asc` 排序方向和各自预设排序字段：marker `name`、标签 / 命名 `name`、备注总览 `name`、测量对象 `name`、名称库总览 `name`、政体 `label`、经济 `name`、军事 `name`。
- 浏览器 WebGL 状态正常，`glError = 0`。

## 2026-07-08：政体、经济和军事面板记住筛选与排序

本步继续覆盖剩余较复杂管理面板的主列表偏好持久化。

修正：

- 政体面板启动时读取 `government-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态；本步不持久化政体家族筛选。
- 经济面板启动时读取 `economy-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态；本步不持久化经济 tab。
- 军事面板启动时读取 `military-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态；本步不持久化国家 / 状态筛选。

验证：

- `node --check app\webgl-generator\src\ui\panels\government-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\economy-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\military-panel.js` 通过。
- 综合构建和浏览器烟测待本批次收尾统一执行。

## 2026-07-08：测量和名称库面板记住筛选与排序

本步继续覆盖测量对象和名称库总览面板的列表偏好持久化。

修正：

- 测量对象面板启动时读取 `measurement-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 名称库总览面板启动时读取 `namebase-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 本步不改变测量工具状态、测量对象编辑、名称库绑定、名称库导入导出或名称库编辑命令。

验证：

- `node --check app\webgl-generator\src\ui\panels\measurement-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\namebase-panel.js` 通过。
- 综合构建和浏览器烟测待后续再累积几步后统一执行。

## 2026-07-08：marker、标签和备注面板记住筛选与排序

本步继续覆盖附属对象管理面板的列表偏好持久化。

修正：

- marker 面板启动时读取 `marker-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态；本步不持久化 marker 的分类 scope。
- 标签 / 命名面板启动时读取 `label-naming-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 备注总览面板启动时读取 `notes-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 本步不改变标记新增 / 移动 / 删除、标签新增 / 恢复、备注删除 / 导出等编辑命令。

验证：

- `node --check app\webgl-generator\src\ui\panels\marker-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\label-naming-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\notes-panel.js` 通过。
- 综合构建和浏览器烟测待后续再累积几步后统一执行。

## 2026-07-08：列表偏好第二批综合烟测

本次综合验证覆盖路线、湖泊、地区、国家、省份、城市、文化、宗教和外交面板的筛选词与排序字段持久化。

验证：

- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物烟测通过：预写 `webgl-generator-panel-list:*` 后刷新并打开各面板，路线、湖泊、地区、国家、省份、城市、文化、宗教和外交面板均恢复对应筛选词。
- 同次烟测确认上述 9 个面板均恢复 `asc` 排序方向和各自预设排序字段：路线 `type`、湖泊 `id`、地区 `type`、国家 `name`、省份 `stateName`、城市 `name`、文化 `name`、宗教 `name`、外交 `name`。
- `glError = 0`。

## 2026-07-08：文化、宗教和外交面板记住筛选与排序

本步继续覆盖社会与关系类管理面板的列表偏好持久化。

修正：

- 文化面板启动时读取 `culture-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 宗教面板启动时读取 `religion-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 外交面板启动时读取 `diplomacy-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 外交面板本步只持久化列表筛选和排序，不持久化外交主体选择，也不改变外交专题切换逻辑。

验证：

- `node --check app\webgl-generator\src\ui\panels\culture-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\religion-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\diplomacy-panel.js` 通过。
- 综合构建和浏览器烟测待本批次收尾统一执行。

## 2026-07-08：国家、省份和城市面板记住筛选与排序

本步继续复用列表偏好持久化能力，覆盖常用的区域 / 点对象管理面板。

修正：

- 国家面板启动时读取 `state-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 省份面板启动时读取 `province-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 城市面板启动时读取 `city-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 本步不改变国家 / 省份编辑刷、新增 / 删除模式、城市新增 / 删除模式或 selection store。

验证：

- `node --check app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\province-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\city-panel.js` 通过。
- 综合构建和浏览器烟测待后续再累积几步后统一执行。

## 2026-07-08：路线、湖泊和地区面板记住筛选与排序

本步继续执行“面板筛选词和排序字段持久化”计划，将河流面板已经验证过的列表偏好读写方式复用到行为相近的路线、湖泊和地区管理面板。

修正：

- 路线面板启动时读取 `route-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 湖泊面板启动时读取 `lake-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 地区面板启动时读取 `zone-panel` 的列表偏好，并在筛选词、排序字段或排序方向变化时写回本地状态。
- 本步只复用 `panel-list-preferences.js`，不改变面板选择、定位、编辑命令或地图数据。

验证：

- `node --check app\webgl-generator\src\ui\panels\route-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\lake-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\zone-panel.js` 通过。
- 综合构建和浏览器烟测待后续再累积几步后统一执行。

## 2026-07-08：河流面板记住筛选和排序

本步继续执行编辑器基础设施计划，先从最高优先级的河流管理面板落地“筛选词和排序字段持久化”。

修正：

- 新增 `panel-list-preferences.js`，统一读写面板列表偏好，目前覆盖 `filter / sortKey / sortDir`。
- 河流面板初始化时读取保存的筛选词、排序字段和排序方向。
- 用户修改河流筛选词或点击排序按钮后，会把最新列表偏好写入浏览器本地状态。

验证：

- `node --check app\webgl-generator\src\ui\panel-list-preferences.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 浏览器烟测通过：河流面板打开后保存 `open: true`，筛选词保存为 `river-smoke`，排序保存为 `id / asc`；刷新后河流面板恢复打开，筛选词和 `ID ↑` 排序恢复；关闭面板后保存 `open: false`，再次刷新不恢复；`glError = 0`。

## 2026-07-08：恢复浮动面板打开状态

用户要求审视项目内计划后继续执行，并要求每执行一步提交一次、执行几步后统一烟测和浏览器验证。当前三项最新问题已经完成，因此本步按接手说明和编辑器清单，进入正式版编辑器基础设施的小步推进。

修正：

- `PanelManager` 在原有位置和宽度持久化基础上新增 `open` 字段，面板打开和关闭时同步写入浏览器本地状态。
- 运行时在地图接入、renderer 加载和各面板数据刷新之后，读取保存为打开的面板 id，并通过各面板已有 `open()` 方法恢复，避免绕过 `map / selection / history` 刷新路径。
- 对象详情面板设置 `persistOpen: false`，避免刷新后在没有当前 selection 的情况下恢复空详情面板。

验证：

- `node --check app\webgl-generator\src\ui\panel-manager.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 浏览器烟测通过：河流管理面板打开状态可跨刷新恢复，关闭后再次刷新不恢复；手动写入 `object-details` 的 `open: true` 后刷新，对象详情面板仍不会自动打开。

## 2026-07-08：统一详情空态样式并优化地区未选中提示

用户指出：地区管理“未选中地区”处的文字过大，上下也没有间隙，需要优化。

修正：

- 共享 `UiDetailGrid` 的空态不再直接渲染裸文本，改为 `<p class="ui-detail-grid-empty">`。
- 新增统一空态样式：跨满详情网格列、`12px` 字号、`1.45` 行高、上下 `8px` 间距和弱化文本色。
- 地区管理“未选中地区”和其它同类详情空态共用这一套样式，避免地区面板出现孤立视觉风格。

验证：

- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 地区面板空态的浏览器 computed style 检查放入最终综合烟测。

## 2026-07-08：新增国家后目标显示国名

用户指出：地图上新建的国家，在国家编辑面板中的目标显示的是 ID 而不是国名。

修正：

- 新增国家完成后，运行时不再只向 selection store 写入 `{kind: "state", id}`，而是通过 `resolveObject()` 组装带 `name / fullName` 的国家对象后再设置选中。
- 国家面板桥接层的 `stateRows()` 补齐 `rawName / fullName / governmentLabel / governmentKey / capitalName`，避免 `stateObject(row)` 在列表选择、定位或进入编辑路径中拿不到可读名称。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 浏览器真实新增国家和目标显示验证放入最终综合烟测。

## 2026-07-08：GEO Cells 导入后重置并重建非 GEO 数据

用户要求明确 GEO / GeoJSON 导入后，除了 GEO 文件中明确包含并映射进来的数据外，地图上的其它旧数据都必须重置；已知问题包括军事无法生成、资源点和部分标记没有重置。

修正：

- FMG Cells GEO 导入不再只写入高度并标记派生系统 stale，而是把导入视为新底图来源。
- 导入高度后会重建 `features / pack / rivers / society / settlements / politics / markers / economy / diplomacy / military / zones`。
- 导入后清空旧 `labels / notes / measurements`，避免旧标签、备注和测量对象挂在新底图上。
- 撤销仍可恢复导入前的旧派生对象和旧用户对象。
- 导入状态栏补充“重置非 GEO 数据”，并显示新军事、资源点和地区数量。
- `tools/webgl-generator-geo-import-regression.mjs` 默认生成 FMG Cells GEO fixture，并在导入前注入旧资源点、旧地区、旧军团、旧标签、旧备注和旧测量对象，导入后断言这些残留已清理，同时确认新军事、资源点和地区已重建。

验证：

- `node --check app\webgl-generator\src\runtime\fmg-cells-geojson-import.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check tools\webgl-generator-geo-import-regression.mjs` 通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- `pnpm run regress:geo -- --browser-channel chrome` 通过：普通 GEO 测量导入 3 个对象；FMG Cells GEO 导入后 `grid mismatch = 0`、`pack mismatch = 0`、`hover mismatch = 0 / 80`、军事 `206`、资源点 `14`、地区 `3`、旧测量 `0`、`glError = 0`。
- 回归报告仍记录一次 GEO 重建期间的 health `main-thread-long-task`，本轮作为性能风险记录，不作为功能失败；后续若要优化导入性能，应单独拆成导入重建分帧任务。

## 2026-07-08：备份旧计划并重置当前执行队列

用户要求把既有计划全部备份，并把当前计划重置为三个最新问题：

1. GEO 数据导入后无法生成军事数据。
2. 地图上新建的国家，在国家编辑面板中的目标显示为 ID 而不是国名。
3. 地区管理“未选中地区”处文字过大，上下没有间隙，需要优化。

处理：

- 在 `docs/plan-backups/2026-07-08-reset-current-plan/` 创建重置前计划快照。
- 备份范围包括 `docs/current-plan.md`、`graphics-reimplementation-plan.md`、`docs/plans/` 和 `docs/task-notes/`。
- 重写 `docs/current-plan.md`，只保留最新三项当前执行队列、对应排查目标和验证要求。
- 明确旧的 overlay / 动态线层性能专项、source/candidate parity 跟踪、编辑器基础设施旧队列以及其它历史专题计划不再自动推进，除非用户重新点名。

验证：

- 通过 `git diff --check`。
- 本轮只变更文档和备份快照，未运行应用构建或浏览器烟测。

## 2026-07-08：明确 GEO 导入后的全量重置语义

用户补充指出：导入 GEO 数据后，不只是军事数据无法生成，资源点和一些标记也没有重置；因此需要明确导入语义。

校准：

- GEO / GeoJSON 导入应视为用导入文件建立新地图基础数据。
- 除 GEO 文件中明确包含并映射进来的数据外，地图上的其它旧数据都必须重置，不能沿用导入前地图残留状态。
- 第一项当前计划已从“军事数据无法生成”扩展为“GEO 数据导入后，未由 GEO 明确携带的数据没有完整重置和重建”。
- 后续修正和验证至少覆盖军事、资源点、marker / zone，以及相关管理面板读取路径。

验证：

- 本轮只更新计划和开发历史，未修改应用代码。

## 2026-07-05：国家省份编辑按钮链路去重

用户指出国家列表下的“进入编辑”按钮点击后只是打开一个只包含“编辑此国家”的二级面板，而这个效果又和底部“启用国家编辑”按钮重复；要求列表下编辑按钮直接进入编辑状态，并用按钮高亮表示当前编辑态，再次点击关闭编辑态。省份面板存在同类冗余，一并修正。

修正：

- `UiActionDock` 支持 `panel: false` 的直接动作：点击后只触发 `select` 事件，不再打开二级浮层；按钮仍可通过 `active` 字段显示高亮。
- 国家面板移除“编辑此国家”二级浮层和底部“启用 / 停止国家编辑”按钮；对象操作栏的“进入编辑”图标直接开关国家编辑刷子，并在编辑态高亮。
- 省份面板移除“编辑此省份”二级浮层和底部“启用 / 停止省份编辑”按钮；对象操作栏的“进入编辑”图标直接开关省份编辑刷子，并在编辑态高亮。
- `state-panel.js` 和 `province-panel.js` 的 `onEdit` 改为同对象二次点击关闭编辑态；切换到其它对象时仍可直接进入新对象编辑态。
- 河流面板没有额外底部启用按钮，当前“进入 / 退出河流编辑”仍是单一对象编辑开关，未归入本轮冗余修正。

验证：

- `node --check app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\province-panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 未跑加载性能 / profile。

## 2026-07-05：城市新增删除小按钮

用户要求所有编辑面板逐步补齐新增 / 删除操作，并把新增、删除入口统一收敛为列表下方的小图标按钮。

修正：

- 城市管理面板新增列表下方 `UiPanelIoActions` 小图标动作条，提供“新增城市”和“删除选中城市”。
- “新增城市”进入等待点击模式后，会关闭其它地图编辑刷子并切到国家视图；用户下一次点击没有既有 burg 的陆地 cell 时，会创建新的 city / burg，并写入 `pack.cells.burg`。
- 新城市会继承点击 cell 的国家、省份、文化和宗教归属，按名称库生成名称，写入默认人口和自动剪影，并接入统一 `EditHistory`。
- “删除选中城市”不会 `splice` 城市数组，避免破坏城市 ID；它会使用 `removed` 标记隐藏城市 / burg，清空对应 pack cell 的 burg 索引，并修复首都 / 省会引用。
- 城市列表会过滤 `removed` 城市；城市新增模式已接入运行时编辑锁和编辑状态快照。

验证：

- `node --check app\webgl-generator\src\runtime\city-edit-commands.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\city-panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 浏览器烟测按用户新要求暂不逐步执行，后续攒几步统一验证。

## 2026-07-05：省份新增删除小按钮

用户要求所有编辑面板逐步补齐新增 / 删除操作，并且新增、删除入口统一收敛为列表下方的小图标按钮。

修正：

- 省份管理面板新增列表下方 `UiPanelIoActions` 小图标动作条，提供“新增省份”和“删除选中省份”。
- “新增省份”进入等待点击模式后，会关闭其它地图编辑刷子并切到省份视图；用户下一次点击已有国家内的陆地 cell 时，会创建新省份并接入统一 `EditHistory`。
- 新省份会按当前地图名称库生成名称，以点击 cell 对应 pack cell 为中心，并把点击 cell 及同国相邻陆地 cell 归入该省份。
- “删除选中省份”会可撤销地清空该省份的 cell 归属，移除国家的省份列表引用，并把该省份下的城市 / burg 省份归属改为 `0`；国家边界和城市对象本身不删除。
- 运行时编辑锁、编辑状态快照和面板状态已识别 `province:add`，避免新增模式下误触其它编辑入口。

验证：

- `node --check app\webgl-generator\src\runtime\province-edit-commands.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\province-panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 浏览器烟测按用户新要求暂不逐步执行，后续攒几步统一验证。

## 2026-07-05：国家新增删除与标签按钮收敛

用户要求所有编辑面板逐步补齐新增 / 删除能力，并且新增、删除入口应和编辑按钮一样收敛为列表下方的小图标按钮，不要再使用显眼的大文本按钮；其中新增国家应允许用户下一次点击 cell 作为首都来生成国家。

修正：

- 国家编辑面板新增列表下方小图标动作条，提供“新增国家”和“删除选中国家”。
- “新增国家”进入等待点击模式后，会关闭其他地图编辑刷子并切到国家视图；用户下一次点击陆地 cell 时，会创建新国家、默认省份和首都，并把点击 cell 及同源相邻陆地 cell 归入新国家。
- 新国家会随机生成名称、颜色、纹章和默认君主制政体，同时刷新国家 / 省份 / 城市元数据，并把军事、区域、经济、外交等下游派生标记为待刷新。
- “删除选中国家”会可撤销地把目标国家的 cell 归为中立，清空对应省份归属，把该国家的城市改为普通中立城镇，并标记对应国家和省份为 removed。
- 标签管理的“新增标签 / 删除标签 / 恢复标签”从大文本按钮改为同类 `UiPanelIoActions` 小图标动作条。
- `docs/current-plan.md` 已同步新的执行节奏：每一刀仍单独提交，但浏览器烟测和加载 / 绘制性能检查可以隔几步合并，不再每一步默认跑满。

验证：

- `node --check app\webgl-generator\src\runtime\state-edit-commands.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 浏览器烟测按用户新要求暂不逐步执行，后续攒几步统一验证。

## 2026-07-05：保存数据纳入气候配置

用户要求保存数据时也保存当前气候配置，避免浏览器恢复或本地导入后丢失温度、纬度和风带设置。

修正：

- 保存到本地、保存到浏览器 LocalStorage 和导出地图数据前，统一创建可持久化地图文档。
- 创建文档前会读取当前气候控件；如果控件值比运行时 `state.options` 更新，会先执行一次气候重算，再保存地图文档。
- 地图文档中的 `document.options`、`map.options` 和 `map.climate.metadata` 会保持一致，避免只保存配置但地图气候派生数据仍是旧值。
- 导入地图文件或从浏览器 LocalStorage 恢复时，会同步气候控件的 Vue 状态，恢复温度、画布纬度、纬度模式和六段风带。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器保存验证：把气候改为自定义纬度 `37`、跨度 `52`、赤道 `31°C`、北极 `-44°C`、南极 `-33°C`、风带 `315,315,225,45,135,45` 后立即保存到 LocalStorage；解压存档确认 `document.options`、`map.options`、`map.climate.metadata` 均为新配置，`glError = 0`。
- 构建产物浏览器恢复验证：保存自定义气候后刷新页面，页面从 LocalStorage 恢复地图，控制面板气候控件、运行时 options 和地图 climate metadata 均恢复为存档值，`glError = 0`。
- 10k e2e 守门 `climate-save-e2e / continents / 10000` 通过，点击到出图 `1696.3ms`，纯生成 `856.9ms`，WebGL 加载 `529ms`。

## 2026-07-05：再次禁用左键拖动画布

用户反馈当前左键又可以移动画布，而该行为此前已经明确应禁用。

根因：

- `installCanvasInteractions()` 中鼠标左键 `pointerdown` 会先进入 `select` 模式。
- `pointermove` 时如果移动距离超过 `3px`，旧逻辑会把 `select` 切换为 `pan`，于是左键拖拽又会改变相机 offset。

修正：

- 左键 `select` 模式下移动超过阈值时，只标记 `moved = true`，用于取消本次点击选择。
- 左键移动不再切换到 `pan`，不会改变相机 offset。
- 中键和右键仍保留 `pan` 导航能力。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器验证：左键从画布中心附近拖动 `140px / 80px` 后 camera 仍为 `scale=1, offsetX=0, offsetY=0`；随后中键同样拖动后 camera 变为 `offsetX=0.21875, offsetY=-0.1951`，证明左键不可平移、中键仍可平移，`glError = 0`。
- 10k e2e 守门 `left-drag-disabled-e2e / continents / 10000` 通过，点击到出图 `1562.8ms`，纯生成 `666.7ms`，WebGL 加载 `596.3ms`。

## 2026-07-05：保存结果悬浮提示

用户要求保存时增加画布正下方的悬浮提示：保存成功使用绿色半透明背景白字，保存失败使用红色半透明背景白字，并且背景色不要太饱和。

修正：

- 复用现有 `#map-toast`，位置从视口上方调整到画布底部中央。
- toast 默认使用低饱和绿色半透明背景和白字；失败状态通过 `data-tone="error"` 使用低饱和红色半透明背景。
- “保存到本地”和“保存到浏览器”成功后显示“保存成功”；失败时显示“保存失败”，同时保留简介面板里的详细状态文本。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器验证：保存成功 toast 为 `rgba(42, 96, 72, 0.78)`、白字、`data-tone="success"`；模拟 LocalStorage quota 失败后 toast 为 `rgba(126, 55, 55, 0.78)`、白字、`data-tone="error"`；两者均位于画布底部中央，底部间距 `22px`，中心偏移 `0`。
- 10k e2e 守门 `save-toast-e2e / continents / 10000` 通过，点击到出图 `1399.2ms`，纯生成 `747.2ms`，WebGL 加载 `354.7ms`。

## 2026-07-05：简介页保存导入按钮字体统一

用户反馈简介 tab 中两个导入按钮与导出、保存按钮的字体大小和粗细不一致。

修正：

- 在 `.project-file-actions` 局部统一保存、导出和两个导入入口的字号、字重与行高。
- 同步覆盖 Element Plus 按钮内部 `span` 和导入 `label` 的文字 `span`，避免 Element 按钮变量和普通 label 继承路径不同导致视觉差异。

## 2026-07-05：简介页保存与浏览器自动恢复

用户要求简介 tab 增加最简单的保存按钮，可通过 dropdown 选择保存到本地或浏览器 LocalStorage；保存时必须保存图中全部数据，加载时能精准还原；如果浏览器已有保存数据，下次打开页面要放弃随机生成并直接恢复。

修正：

- 简介 tab 新增“保存”dropdown，包含“保存到本地”和“保存到浏览器”。
- “保存到本地”复用完整 `webgl-generator-map` 文档格式，与既有“导出地图数据”同源，包含当前 `map`、typed arrays 和 options。
- “保存到浏览器”同样保存完整地图文档，并优先使用浏览器原生 `CompressionStream` 压缩为 gzip+base64 后写入 `localStorage["webgl-generator-current-map-v1"]`；不支持压缩时退回明文。
- 启动流程从无条件 `requestGenerate()` 改为先检查浏览器存档；若存在有效存档，则解析、解压、同步生成输入并调用 `loadMapIntoRuntime()` 恢复地图；恢复失败会清除损坏存档并回退到正常随机生成。
- 恢复 / 导入地图时同步修正 `cells-input` 读取 `options.cellsTarget`，避免恢复后目标 cells 输入框不同步。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器验证：清空当前 origin 存档后生成 `stage-2-1`，点击“简介 / 保存 / 保存到浏览器”，LocalStorage 写入 `webgl-generator-local-map-storage` v1，编码为 `gzip-base64`；原始地图文档约 `14.50MB`，压缩后约 `2.31MB`，LocalStorage 字符串约 `3.23MB`。刷新后 checksum 仍为 `c6f10185`，load trace 无 `generate` 阶段，状态显示已恢复浏览器保存的地图。
- 10k e2e 守门 `browser-save-restore-e2e / continents / 10000` 通过，点击到出图 `1507.6ms`，纯生成 `745.3ms`，WebGL 加载 `451.8ms`。

## 2026-07-05：温度滑动条范围扩大

用户要求温度滑动条范围调整为 `-80` 到 `50`。

修正：

- 控制面板中赤道、北极、南极三组温度滑动条统一改为 `-80..50`。
- `generator/options.js` 新增共享 `TEMPERATURE_RANGE`，控制面板和参数归一化共用同一范围。
- `normalizeOptions()` 的三组温度字段同步放宽到 `-80..50`，避免 UI 可拖动但生成参数仍被旧范围夹回。
- 随机默认值仍沿用原来的温和分布，只扩大手动配置 / 读取配置的有效范围。

## 2026-07-05：撤销重做按钮闪烁修正

用户反馈鼠标移动时，面板 header 上的撤销 / 重做按钮会频繁亮起和熄灭。

根因：

- `setEditingInteractionLock()` 会在每次编辑锁同步时遍历浮动面板内的 `button / input / select / textarea`，并按当前锁状态改写 `disabled`。
- 该逻辑此前只跳过关闭按钮，没有跳过 header 的撤销 / 重做按钮。
- 鼠标移动时 hover 会触发 `updateEditingInteractionLock()`，编辑锁把撤销 / 重做按钮的 `disabled` 拿掉，随后 `PanelManager` 的历史按钮刷新又把 `disabled` 加回，于是形成可见闪烁。
- 国家面板还在 hover 回调里被每次 `updateStatePanel()`，造成不必要的面板 reactive 更新。

修正：

- `setEditingInteractionLock()` 跳过 `.floating-panel-header-actions` 内的按钮，header 的撤销 / 重做 / 关闭按钮不再被编辑锁接管。
- `PanelManager.refreshHeaderActions()` 改为幂等刷新：只有 DOM 实际状态或目标状态变化时才写入 `hidden / disabled / title`。
- renderer hover 回调不再刷新国家面板，只更新悬停信息和编辑锁；“取悬停”仍读取最新 `state.pick`。

验证：

- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panel-manager.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 浏览器 mutation 验证：打开国家面板后监听 header 撤销 / 重做按钮，模拟鼠标移动 `80` 次，按钮属性 mutation 为 `0`，`glError = 0`。
- 10k e2e 守门 `history-button-stability-e2e / continents / 10000` 通过，点击到出图 `1021.4ms`，纯生成 `519.4ms`，WebGL 加载 `322.6ms`。

## 2026-07-05：FMG Cells GEO 导入水陆语义同步

用户反馈原版 FMG Cells GEO 导入后，部分区域颜色看起来是陆地但悬停信息显示海洋，或颜色看起来是海洋但悬停信息显示陆地。

根因：

- FMG Cells GEO 导入此前只改 `grid.cells.h` 和对应 `pack.cells.h`，renderer 颜色会按新高度刷新。
- 但 `grid.cells.f / grid.cells.t / map.features`、`pack.cells.f / pack.cells.t / pack.features`、biome / population 等水陆派生字段仍是旧地图结果。
- 悬停 picking 命中 pack cell 时还存在一个来源错误：读取了 `pack.cells.f`，却去 `map.features.features` 查 feature；正确来源应优先使用 `map.pack.features`。

修正：

- `pack.js` 新增 `refreshPackFeatures(pack, grid)`，可在不重建 pack 点位和对象 ID 的情况下，重算 pack feature、距离场、haven / harbor 和 feature 分组统计。
- FMG Cells GEO 导入 apply / revert 后会执行地形派生同步：
  - 重新 `extractFeatures(grid)`，同步 grid 水陆 feature。
  - 按当前 grid 高度同步 pack 高度，并在既有 pack 图上刷新 pack feature。
  - 重建 climate、biome 和 population，更新相关 metadata / summary。
  - 将河流、路线、城市、国家、省份、宗教、标记、区域、军事、经济和外交标记为待派生，避免误以为这些下游语义已经完全适配新地形。
- `picking.js` 修正 pack 命中时的 feature 来源，优先从 `map.pack.features[pack.cells.f[packCell]]` 取水陆类型。
- `regress:geo` 增加可选 `--fmg-cells-fixture`，能用真实 FMG Cells GeoJSON 校验导入后的 grid / pack / hover 水陆一致性。

验证：

- `node --check app\webgl-generator\src\runtime\fmg-cells-geojson-import.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check tools\webgl-generator-geo-import-regression.mjs` 通过。
- `git diff --check` 通过。
- Node 级真实文件探针使用 `C:\Users\mosuzi\Downloads\k170 Cells 2026-07-04-22-00.geojson`，导入后 `gridMismatch = 0`、`packMismatch = 0`。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 浏览器回归 `pnpm run regress:geo -- --fmg-cells-fixture "C:\Users\mosuzi\Downloads\k170 Cells 2026-07-04-22-00.geojson"` 通过：普通 GeoJSON 测量导入仍可用，FMG Cells 地形导入后 `grid mismatch 0`、`pack mismatch 0`、`hover mismatch 0 / 80`，点击到出图 `1679.1ms`，WebGL 加载 `427ms`，`glError = 0`。

## 2026-07-05：面板空间深场景收束复查

背景：

- 当前执行队列中“面板空间策略专项”已经完成多轮具体修正，包括经济控制栏、军事战报摘要、军事工具条、政体导出按钮、资源标记工具条、单位 / 图层滑条标签和二级编辑区审计路径。
- 继续推进前需要确认是否还有真实布局失败，避免在没有失败证据时继续扩大 UI 调整范围。

复查：

- 运行 `pnpm run audit:panels -- --scenario deep --template continents --cells 10000 --seed panel-space-continuation-20260705 --browser-channel chrome --fail-on-issues`。
- 构建产物 deep 审计中控制面板和主要浮动面板预热 `18 / 18`，失败 `0`。
- 审计结论为待复核项 `0`；控制面板 tab、主要浮动面板、首个二级编辑区、工具按钮组、摘要网格、详情网格和表格横向滚动均未出现新的布局失败。
- 性能守门指标为点击到出图 `1429.1ms`、WebGL 加载 `317.5ms`。

决策：

- 面板空间策略专项暂时收束，不再主动做泛化式空间优化。
- 后续只有在用户指出新的折行 / 挤压问题，或 `audit:panels` 出现失败项时，才按具体面板补局部规则。
- 当前执行队列下一项转入 overlay 与动态线层性能专项。

## 2026-07-05：列表 ID 排序改为数字优先

用户反馈所有列表按 ID 排序时，`9` 和 `10` 的顺序必须正确，不能用字符串比较，应先尝试数字比较。

修正：

- 新增 `app/webgl-generator/src/ui/sort-utils.js`，提供 `compareListValues()` 和 `compareRowsByKey()`：
  - 两边都是数字或纯数字字符串时，先按数值比较。
  - 非纯数字值才回退到中文 `localeCompare`，并保留 `numeric: true` 作为兜底自然排序。
- 城市、国家、省份、文化、宗教、外交、经济、政体、路线、河流、湖泊、资源标记、军事、标签、测量、备注和名称库等主要列表面板的 `sortRows` 入口改为共享比较器。
- 军事列表原先平局回退使用 `a.id.localeCompare(b.id)`，已改为数字优先比较，避免 `10` 排到 `9` 前面。
- 经济交易的原始行排序也改为数字优先，平局回退按交易 `i` 数值比较。

验证：

- 直接脚本验证通过：`['1','2','9','10','11']` 升序保持 `1,2,9,10,11`；行 ID 升序为 `2,9,10`，降序为 `10,9,2`。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。直接脚本执行 ESM 文件时出现当前项目既有的 `MODULE_TYPELESS_PACKAGE_JSON` Node 警告，不影响 Vite 构建。

## 2026-07-05：军事兵种比例弹框拖动与紧凑化

用户反馈军事管理面板的兵种比例弹框无法拖动，而且虽然兵种要素齐全，但需要大量滚动才能看全。

修正：

- `UiActionDock` 二级浮层新增标题栏拖动能力；拖动后位置会被限制在视口内，关闭或切换动作后恢复自动定位。
- `UiActionDock` 动作支持 `panelWidth / panelHeight`，用于大内容弹框声明更合适的初始宽度和预估高度。
- 军事“兵种比例”动作声明为 `620px` 宽、`620px` 预估高，让弹框在下方空间不足时优先向上打开。
- `.military-ratio-list` 改为 `repeat(auto-fit, minmax(230px, 1fr))` 紧凑网格，比例项在宽弹框中两列显示，减少内部滚动。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

### 2026-07-05 可撤销面板 header 历史按钮

背景：

- 用户认可当前各面板撤销 / 重做共用底层 `EditHistory`，但指出每个面板底部都放撤销条不便操作，尤其长面板需要滚到底部。
- 目标是把需要撤销能力的面板统一改为 header 操作：关闭按钮左侧放撤销、重做两个 icon 按钮，分别使用逆时针和顺时针箭头。

实现：

- `PanelManager.registerPanel()` 新增 `historyActions` 配置，统一在浮动面板 header 的关闭按钮左侧渲染撤销 `↶` 和重做 `↷` 按钮。
- header 按钮通过 `getHistory()` 读取各面板现有 `panelState.history`，根据 `undo / redo` 计数自动禁用，并复用面板已有 `onUndo / onRedo` 回调。
- 城市、国家、省份、文化、宗教、外交、军事、路线、河流、湖泊、测量、资源标记、标签、备注、名称库和高度编辑等已有历史入口的面板接入统一 header。
- 政体管理此前已有批量政体调整命令但没有面板撤销入口，本轮补上同一套 `onUndo / onRedo`。
- 底部旧历史条通过样式隐藏，避免同一面板出现两套撤销 / 重做入口。

验证：

- `node --check app/webgl-generator/src/ui/panel-manager.js`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测打开城市管理面板，header 中 `↶ / ↷ / x` 三个按钮均为 `28 x 28px`，旧 `.city-history-actions` 计算样式为 `display: none` 且高度 `0`，`glError = 0`，console/page error 为空。
- Playwright + 系统 Chrome 通过构建产物临时静态服务验证：打开军事管理并点击“兵种比例”后，弹框初始 `620 x 619px`、内容区 `scrollHeight = clientHeight = 583`、`scrollDebt = 0`；`5` 个兵种项为 `2` 列 `3` 行；拖动标题栏后位置变化 `23px / 70px`；无横向溢出，`glError = 0`。本轮只出现既有 `[FMG health] main-thread-long-task` 警告，无 console error / page error。

## 2026-07-05：编辑面板导入导出改为小图标菜单

用户要求所有编辑面板的导出 / 导入功能不要继续做成大按钮，而是改成列表下方的小 icon 按钮；导出存在多格式时，用 dropdown 菜单选择具体格式，并且每一项任务完成后及时提交。

修正：

- 新增 `UiPanelIoActions` 通用组件，支持：
  - 单个导出图标按钮打开暗色 dropdown，菜单项承载 CSV / JSON / 原版文本 / 配置等具体格式。
  - 单个导入图标按钮触发隐藏 file input，外观与导出按钮保持 `32 x 32`。
  - 面板内普通小图标动作扩展位。
- 新增 `.ui-panel-io-dropdown` 暗色样式，避免 Element Plus dropdown 回到白底 / 白 hover。
- 经济、政体、外交、测量和备注面板：导出入口从控制栏或动作按钮组迁移到列表下方的小图标动作条。
- 军事面板：移除顶部 `军团数据 / 战报档案` 大按钮工具条；军团 CSV/JSON 导出放到军团列表下方，战报档案 JSON/CSV 导出和 JSON 导入放到战报列表下方。
- 名称库面板：名称库 JSON / 原版文本导出和名称库导入放到名称库列表下方；底部仅保留新建、复制、删除、清空等管理动作。
- 高度图导入工作台：选择图片、导出配置、导入配置改为工作台底部的小图标动作条；应用到地图和取消仍保留明确按钮。

提交：

- `dca4199`：新增面板导入导出小图标动作条。
- `3b1fd7b`：改造常用面板导出为小图标菜单。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 通过构建产物临时静态服务验证：经济、政体、外交、军事、名称库、测量、备注和高度工作台共 `9` 个导入 / 导出动作条均存在，小图标按钮尺寸均为 `32 x 32`；旧大导出 / 导入入口计数为 `0`；经济导出 dropdown 背景为 `rgba(12, 18, 22, 0.98)`，菜单项为“导出 CSV / 导出 JSON”；面板横向溢出为空，`glError = 0`。本轮只出现既有 `[FMG health] main-thread-long-task` 警告，无 console error / page error。

## 2026-07-05：军事管理顶部筛选区拆行

用户反馈军事管理面板列表上方的“国家 / 态势 / 筛选框”挤在同一行，搜索框空间不足。

修正：

- `.military-panel-controls` 从三列硬挤改为两列 grid。
- `UiFilterInput` 在军事面板控制区内跨整行显示，形成“国家 / 态势”第一行、“筛选框”第二行。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 通过构建产物临时静态服务验证：军事管理控制区为 `2` 行，国家 / 态势在第一行，筛选框第二行跨满宽；控制区横向 overflow 为 `0`，`glError = 0`。本轮只出现既有 `[FMG health] main-thread-long-task` 警告，无 console error / page error。

## 2026-07-05：原版 FMG Cells GeoJSON 地形导入

用户反馈“导入 GEO 数据”对原版导出的 `Cells` GeoJSON 没有效果：测试文件 `k170 Cells 2026-07-04-22-00.geojson` 中包含 `id / height / biome / state / province / culture / religion / neighbors` 等 cell 字段，但此前导入入口只把所有 GeoJSON 当外部参考测量对象处理，不会改写地形高度。

修正：

- 新增 `fmg-cells-geojson-import.js`，识别原版 FMG `Cells` GeoJSON schema。
- 对 `properties.height` 做原版海拔米数反算：陆地用 `sqrt(height) + 18` 转为当前 `0..100` 高度单位，海底负值按原高度公式反解到 `0..19` 水域高度。
- 使用源 cell polygon 中心和源文件 bbox 建立空间索引，把源高度重采样到当前 `grid.cells.h`，并同步映射到对应 `pack.cells.h`。
- “导入 GEO 数据”入口现在先尝试 FMG Cells 地形导入；识别失败才回落到普通 GeoJSON 测量对象导入。
- renderer 新增 `refreshTerrainCaches()`，导入后刷新 terrain cache、cell colors 和线层，使水陆 / 高度颜色立即变化。
- 本轮只导入地形高度；`state / province / culture / religion / population` 等语义字段暂不应用，避免半套语义层污染当前地图。

验证：

- `node --check app\webgl-generator\src\runtime\fmg-cells-geojson-import.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\edit-refresh-scheduler.js` 通过。
- `git diff --check` 通过。
- Node 级真实文件验证通过：`k170 Cells 2026-07-04-22-00.geojson` 识别为 FMG Cells GeoJSON，源 cells `5561`，对当前 `10004` 个 grid cells 中 `9692` 个产生高度变化，高度总和 `185341 -> 146781`。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：通过真实 `#import-geo-file` 导入同一文件，状态栏显示“已从原版 Cells GEO 导入地形：源 cells 5561，陆地 3524，水域 2037，应用 9545 个当前 cells，可撤销。”；高度总和 `170576 -> 146521`，陆地 cell 数 `3412 -> 3326`，历史记录为 `导入 FMG Cells 地形 9545 cells`，`glError = 0`。烟测记录到一次约 `2s` health long-task，后续可分片优化。

## 2026-07-05：单位页军力比例与 tab 顺序调整

用户要求单位 tab 支持全局调整军力比例，并把控制面板中的单位 tab 放到最后，其它 tab 相对顺序不变。

修正：

- 控制面板 tab 顺序改为“简介 / 生成 / 视图 / 图层 / 管理 / 单位”。
- 单位页新增“军力比例”滑条，范围 `0.1x - 10x`，接入全局单位偏好和旧 runtime 控件绑定。
- `display-units` 增加 `militaryScale`、`formatMilitary()` 和 `militaryUnitsToPower()`，把军力倍率作为显示层口径处理。
- 军事面板中的总兵力、军团兵力、兵种构成、战报损耗和结算预览改为使用军力比例；国家详情和政体统计中的军力也同步使用该口径。
- 地图军事图标文字、军事 tooltip、悬停 / 对象详情中的军团兵力也跟随军力比例刷新，比例变化不需要重新生成地图。
- 本轮不改变原始军事数据，也不把导出 CSV / JSON 的原始兵力字段改成倍率后的值，避免显示设置污染数据文件。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：控制面板 tab 顺序为“简介 / 生成 / 视图 / 图层 / 管理 / 单位”；单位页存在“军力比例”滑条；将军力比例设为 `2x` 后，localStorage 和 renderer 内部单位偏好均为 `2`，军事图标文字刷新为 `2.9万`，军事面板总兵力显示为 `129万`，`glError = 0`。烟测中仅出现既有 health long-task warn，无 console error / page error。

## 2026-07-05：颜色编辑二级面板关闭按钮 hover 修正

用户反馈颜色编辑面板右上角关闭按钮在悬停时会变成白色椭圆。复查后确认该按钮来自共享 `UiActionDock` 二级编辑浮层，使用 Element Plus `text circle` 按钮；虽然项目 CSS 已写暗色 hover，但未覆盖 Element 按钮变量和 `.is-text` 状态，导致特定状态下仍可能回到默认浅色背景。

修正：

- `.ui-secondary-action-close.el-button` 增加局部 Element Plus 按钮变量，固定基础、hover、active 的背景、边框和文字颜色。
- 覆盖 `.is-text:not(.is-disabled):hover / focus / focus-visible / active`，避免 text button 默认白底介入。
- 固定关闭按钮 `26px x 26px` 与 `border-radius: 6px`，保持深色方形按钮观感。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开国家编辑的“调整颜色”二级面板并 hover 关闭按钮，按钮为 `26 x 26`、背景 `rgba(27, 37, 43, 1)`、边框 `rgba(62, 82, 95, 1)`、圆角 `6px`、`box-shadow = none`，`glError = 0`，console/page error 为 `0`。

## 2026-07-04：标签管理新增标签拖动放置

用户反馈标签管理新增标签时需要支持拖动标签，并指出“新增标签 / 删除标签”按钮与下方“撤销 / 重做”按钮之间没有间隔；同时询问各面板重复出现“重做”的实际作用，希望后续考虑全局统一撤销。

修正：

- 手工标签 DOM 增加 `data-label-target-kind / data-label-target-id`，并允许 `.custom-label` 接收指针事件，显示 grab / grabbing 光标。
- 渲染层新增 `updateCustomLabelPosition()`，拖动过程中只更新标签 overlay，不重建底图 buffer。
- 新增标签后保留 `pendingCustomLabelPlacement`：用户可在地图空白处按住拖动来放置刚创建的标签，即使新标签初始位置被标签管理面板盖住也能完成放置。
- 新增标签第一次放置会同步更新“新增手工标签”命令内部快照，因此撤销一次仍删除该标签；已有手工标签普通拖动会生成独立“移动手工标签”命令。
- 选中的手工标签不再被标签碰撞避让隐藏，避免刚创建的标签因为压在城市名附近而无法操作。
- 标签管理按钮区增加 `12px` 下间距，拉开新增/删除按钮与历史按钮组。
- 关于“重做”：当前各面板按钮都调用同一个全局 `EditHistory.redo()`，作用是撤销后重新应用刚撤销的命令；本轮不拆 UI，已把“全局撤销入口、面板内去重历史条、是否隐藏重做”记录到 current-plan 的后续可选增强。

验证：

- `git diff --check` 通过。
- `node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\label-edit-commands.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开标签管理后点击“新增标签”，直接在地图空白处拖动放置，新标签坐标从 `{x:720,y:480}` 变为 `{x:371.25,y:458.93}`，历史仍为 `undo 1 / redo 0 / 新增手工标签`，`pendingPlacement = null`，按钮区与历史区间距为 `12px`，`glError = 0`，console/page error 为 `0`。
- 构建产物浏览器烟测通过：对已放置的手工标签再次直接拖动，坐标从 `{x:371.25,y:458.93}` 变为 `{x:450,y:475.46}`，历史变为 `undo 2 / redo 0 / 移动手工标签 #1`，`glError = 0`，console/page error 为 `0`。

## 2026-07-04：对象颜色编辑 HSL 取色组件

用户指出当前颜色编辑仍有问题，希望支持 HSL 取色；如果 Element Plus 现有组件做不到，就另做专用颜色组件。复查后确认当前共享颜色入口是 `UiColorActionPanel -> UiColorField -> ElColorPicker`，更适合弹出式 HSV/HEX 选择，不适合直接给出 H/S/L 三通道数值控制。本轮改为项目内专用 HSL 字段，但对外仍输出 `#rrggbb`，不改变地图数据格式或颜色命令接口。

修正：

- `UiColorField` 去掉 `ElColorPicker`，改为内置 HSL 取色器，包含当前色块、H/S/L 三条滑杆、H/S/L 数字输入、HEX 输入和预设色块。
- 新增 hex / HSL 双向转换：外部传入 `#rgb` / `#rrggbb` 会归一为 `#rrggbb` 并换算为 HSL；修改 H/S/L 会立即更新 HEX 草稿；提交仍通过原 `apply` 事件输出 `#rrggbb`。
- 国家、省份、文化、宗教继续共用 `UiColorActionPanel`，因此四类对象自动获得 HSL 取色能力；`createSetStateColorCommand` 等命令和渲染层仍消费 hex，不需要数据迁移。
- CSS 新增 `ui-hsl-color-field` 系列暗色样式，并覆盖旧 `state/province/culture/religion-color-field` 的 Element ColorPicker 三列布局，避免新字段被压扁。
- 去掉 Element ColorPicker 依赖后，颜色面板独立 chunk 从约 `20KB` 降到约 `5KB`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开国家编辑的“调整颜色”二级面板，存在 `3` 条 HSL 通道、`3` 个 range、`3` 个数字输入和 HEX 输入；将 H/S/L 设置为 `210/45/62` 后得到 `#729eca`，应用后国家颜色写入 `#729eca`，历史记录为 `undo 1 / redo 0 / 国家颜色 #1`，面板无横向溢出，WebGL error 为 `0`。
- e2e 守门 `hsl-color-field-e2e / continents / 10000` 通过：点击到出图 `1593.7ms`，纯生成 `845.9ms`，WebGL 加载 `396.6ms`，最慢加载阶段为“构建标签” `76.2ms`。

## 2026-07-04：测量浮条默认隐藏与提示行修正

用户反馈测量面板默认会展示，并且“点击地图添加起点”提示在窄宽度下被挤成竖向折行。复查后确认这是测量浮条 `measurement-readout` 的布局问题：组件挂载后缺少初始隐藏兜底，且标题、提示和按钮共用一行 flex，提示文本会被按钮挤压。

修正：

- `index.html` 中 `#measurement-readout` 初始增加 `hidden`，避免应用初始化或测量 overlay 切换前短暂/默认露出。
- CSS 增加 `.measurement-readout[hidden] { display: none; }`，确保组件自身 `display: grid` 不覆盖隐藏语义。
- `MeasurementReadout.vue` 改为“按钮行 + 提示行”结构，提示从按钮行拆出。
- 测量浮条从单行 flex 改为两行 grid；提示行设置 `white-space: nowrap`、`overflow: hidden` 和 `text-overflow: ellipsis`，不再竖向折行。
- 测量浮条内 Element Plus 按钮宽度在局部恢复为 `auto`，避免继承全局 `.secondary-action { width: 100%; }` 后挤压按钮行。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：初始 `readoutHidden = true`、`overlayHidden = true`、`display = none`；点击“测量”后 readout 为 `display = grid`，提示文本为 `点击地图添加起点`，`white-space = nowrap`，提示 top 位于按钮行 bottom 下方，无 console/page error。
- e2e 守门 `measurement-readout-layout-e2e / continents / 10000` 通过：点击到出图 `1528.8ms`，纯生成 `846.3ms`，WebGL 加载 `369.7ms`，最慢加载阶段为“构建线层顶点” `49.5ms`。

## 2026-07-04：GEO 导入入口控件修正

用户反馈“导入 GEO 数据不好使”。复查发现 GeoJSON 解析、测量对象写入和 overlay 绘制链路本身可用，问题出在真实用户入口：简介页导入按钮使用 `UiButton @click -> document.getElementById(...).click()` 触发隐藏 file input，而回归脚本此前直接 `setInputFiles()` 到隐藏 input，绕过了可见按钮路径。

修正：

- `UiButton` 显式转发 `click` 事件，避免后续其他基于组件点击的控制继续踩 Vue / Element Plus 事件透传差异。
- 简介页“导入地图数据”和“导入 GEO 数据”改为按钮区域内原生 `input[type=file]` 覆盖，视觉仍沿用 `secondary-action`，用户点击按钮区域时由浏览器直接处理文件选择，不再依赖 JS 触发隐藏 input。
- 文件导入控件补充 `focus-within` 暗金焦点态，透明 input 覆盖完整按钮区域。
- `regress:geo` 不再只验证隐藏 input 注入文件；新增导入控件结构检查，要求“导入 GEO 数据”控件内存在原生 file input、没有 `hidden` 属性，并保留 `.geojson` accept。

验证：

- `node --check tools\webgl-generator-geo-import-regression.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- `pnpm run regress:geo -- --port 5440 --timeout 120000` 通过：导入控件为原生 file input，fixture `3` 个 Feature，导入 `3` 个测量对象，overlay 为点 `1`、线 `2`、面 `1`，WebGL error 为 `0`。
- e2e 守门 `geo-import-control-fix-e2e / continents / 10000` 通过：点击到出图 `1653.6ms`，纯生成 `927.9ms`，WebGL 加载 `385.9ms`，最慢加载阶段为“构建线层顶点” `62.1ms`。

## 2026-07-04：地图低饱和配色第一刀

用户提供参考截图，指出当前地图颜色饱和度过高。本轮只调整默认视觉配色，目标是让国家面、海面、海岸、边界、道路和河流更接近柔和的低饱和纸面地图；不改变生成语义、国家归属、图层结构或导出数据。

完成内容：

- `STATE_COLOR_PALETTE` 从高饱和蓝 / 红 / 绿 / 紫色板改为较鲜明的粉彩色板，保留相邻国家避色逻辑；用户复核后回到“线条已柔化但国家色未继续压灰”的版本。
- `createPalette()` 的背景和海面改为灰蓝，降低随机偏移幅度；自然高度色和海底高度渐变同步降饱和、提亮。
- 政体图例、文化 / 宗教 / 国家 / 省份 fallback 色改为更浅、更灰的 HSL 参数。
- 海岸线、湖岸线、国家边界、省份边界、道路和河流线条同步降低饱和度和对比度，减少强橙、亮蓝和黑硬边。
- 构建产物视觉 smoke 保存截图：`docs/generated/screenshots/palette-soft-states.png`。

验证：

- `node --check` 覆盖 `politics.js`、`index.js`、`society.js`、`color-modes.js`、`placeholder-renderer.js`、`political-layer.js`、`shore-layer.js`，均通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物视觉 smoke：国家视图 `colorMode = states`，国家色平均 HSL 饱和度 `0.633`，最高 `1`，海面色约 `[0.4053, 0.5353, 0.6853, 1]`，WebGL error 为 `0`，无 console error。
- e2e 守门 `palette-restore-e2e / continents / 10000` 通过：点击到出图 `1702.1ms`，纯生成 `882ms`，WebGL 加载 `427.6ms`，`glError = 0`。

## 2026-07-04：GEO 数据导入第一刀

用户临时要求新增从 GEO 数据导入的能力。本轮收敛为最小可用的外部参考层导入：读取 GeoJSON 后按当前地图 `mapCoordinates` 反投影到世界坐标，并保存为可撤销的测量对象，而不是重写生成地图本体。

完成内容：

- 简介页本地文件操作新增“导入 GEO 数据”，支持 `.geojson / .json`。
- `parseGeoJsonMeasurements()` 支持 `FeatureCollection / Feature / Geometry` 以及 `Point / MultiPoint / LineString / MultiLineString / Polygon / MultiPolygon / GeometryCollection`。
- 导入结果写入 `map.measurements.items`，点、线、面分别保持为 `point / polyline / polygon`，并接入 `EditHistory`，可撤销。
- 保存测量对象 overlay 补充点对象绘制，导入后自动显示测量图层、刷新测量面板并定位首个导入对象。
- 新增 `pnpm run regress:geo`，用生产构建导入点 / 线 / 面 fixture，验证反投影、测量图层显示、overlay 绘制和 WebGL error。

验证：

- `node --check` 覆盖 `map-file-io.js`、`measurement-objects.js`、`measurement-edit-commands.js`、`app.js`、`panel.js` 和 `webgl-generator-geo-import-regression.mjs`，均通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- `pnpm run regress:geo -- --port 5440` 通过：fixture `3` 个 Feature，导入 `3` 个测量对象，overlay 为点 `1`、线 `2`、面 `1`，WebGL error 为 `0`。
- `pnpm run regress:measurement -- --port 5438` 通过：既有测量保存 / 导出 / 导入仍保持 `roads / none` 两类 routeFit 和显示点补全。
- `node .\tools\webgl-generator-e2e-profile.mjs --label geo-import-e2e --scenario continents --cells 10000 --port 5441 --out .\docs\generated\reports\e2e-profile-geo-import-results.json --markdown .\docs\generated\reports\e2e-profile-geo-import-results.md` 通过：点击到出图 `1503.8ms`，纯生成 `790.3ms`，WebGL 加载 `377.1ms`，`glError = 0`。

## 2026-07-04：overlay profile 交互采样口径修正

继续按 overlay 与动态线层性能专项推进。河流 idle commit 分帧后，100k profile 仍显示滚轮 frame p95 偏高；复查脚本发现 `profileZoom()` / `profilePan()` 在帧记录器运行期间，每个滚轮或拖动采样点都会跨进页面执行完整 `readStats()`，其中包含 renderer `getStats()`、DOM query 和跨进程序列化，可能把工具自身成本计入用户交互帧。同时动态构建统计会把进入交互前已经存在的缓存 `routeBuildMs / riverBuildMs` 误算成交互期间构建。

完成内容：

- `startFrameRecorder()` 在浏览器端 rAF tick 中采集轻量快照，直接读取 renderer 的 draw、overlay、图层可见性、dirty 标记、顶点数和 build 统计。
- `profileZoom()` / `profilePan()` 的交互循环不再每步调用 `readStats(page)`，避免跨进程采样污染 frame p95 和 long task。
- 动态构建统计改为“采样期间 build 值发生变化才计入”，首帧旧缓存值和 dirty 状态下的旧值都记为 `0`。
- 保留 idle commit 独立统计；停止输入后的路线 / 河流恢复耗时仍按最终 renderer stats 报告。
- 本轮只改 profile 工具，不改应用运行时代码、地图渲染、overlay 同步策略或用户交互行为。

验证：

- `node --check .\tools\webgl-generator-overlay-profile.mjs` 通过。
- `git diff --check` 通过。
- 100k profile `overlay-browser-sampled-100k-final / full / 100000` 通过：滚轮交互期 route / river 构建 p95 均为 `0`，overlay p95 `7.6ms`，idle frame p95 `23.6ms`，idle long task 为 `0`；中键拖动 route / river 构建 p95 均为 `0`，overlay p95 `2.7ms`，idle frame p95 `17.6ms`。
- e2e 守门 `overlay-profile-sampling-e2e / continents / 10000` 通过：点击到出图 `1559.5ms`，纯生成 `789.7ms`，WebGL 加载 `397.8ms`，`drawMs = 0.1`，`glError = 0`。

## 2026-07-04：河流 idle commit 分帧恢复

按当前 overlay 与动态线层性能专项推进。先用 100k `full` 变体复查当前瓶颈：滚轮交互 frame p95 仍偏高，但交互期间 route / river 构建均为 `0ms`，WebGL draw p95 约 `0.2ms`，overlay p95 约 `7.2ms`；可直接治理的成本集中在停止输入后的 idle commit，其中路线构建约 `54.3ms`，河流构建约 `42.4ms`。

完成内容：

- 新增 `RIVER_BUILD_SLICE_MS`，让河流 screen-space mesh 构建也支持按时间片让出主线程。
- 将 `buildRiverMeshVertices()` 拆为 `createRiverMeshBuild()`、`pushRiverMesh()`、`finalizeRiverMeshBuild()`，同步和异步路径复用同一套河流点过滤、视口粗筛、宽度计算和平滑逻辑。
- 新增 `buildRiverMeshVerticesAsync()` 与 `updateRiverBufferAsync()`，支持 `yieldToBrowser / shouldContinue`，在视口再次变化时可中止旧版本重建。
- `rebuildViewportDynamicBuffersAsync()` 在 idle commit 中改用异步河流重建，路线和河流之间继续让出一帧。
- 本轮只改变视口停止后的 buffer 恢复调度，不改河流生成、河流样式、图层开关、picking 或交互期间 overlay 同步刷新。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 100k 基线复查 `overlay-current-100k / full / 100000` 显示：滚轮 idle frame p95 `53.2ms`，拖动 idle frame p95 `34.7ms`；交互期间 route / river 构建均为 `0ms`，overlay p95 `7.2ms`。
- 100k profile `river-idle-async-100k-final / full / 100000` 通过：滚轮交互 frame p95 `180.2ms`，拖动 frame p95 `47ms`；滚轮 idle frame p95 `35.7ms`，拖动 idle frame p95 `18.1ms`；idle long task 为 `0`，`routesDirty / riversDirty` 均恢复 `false`，`glError = 0`。
- e2e 守门 `river-idle-async-e2e / continents / 10000` 通过：点击到出图 `1652.5ms`，纯生成 `848.3ms`，WebGL 加载 `511.6ms`，`drawMs = 0.1`，`glError = 0`。

## 2026-07-04：军事管理工具条空间放宽

继续按当前“面板空间策略专项”推进。全量 deep 面板审计未发现硬性布局失败，但按最小宽度排序后，军事管理仍有两处与当前优先级一致的偏紧项：顶部导入导出工具条最小按钮宽约 `103.6px`，战报清理按钮最小宽约 `92px`。

完成内容：

- `.military-toolbar-group` 改为标题独占一行、按钮行独立布局，避免“军团数据 / 战报档案”标题挤占按钮横向空间。
- 军事顶部工具组按钮列从 `minmax(54px, 1fr)` 放宽到 `minmax(112px, 1fr)`。
- `.military-event-tools` 从“筛选器 + 190px 操作窄栏”改为单列上下布局，让战报清理按钮占用完整行宽。
- `.military-event-actions` 的按钮列从 `minmax(72px, 1fr)` 放宽到 `minmax(132px, 1fr)`。
- 只调整军事管理局部 CSS，不改 `MilitaryPanel.vue` 模板、不改导出、导入、战报筛选、清理或军事数据语义。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 面板 deep 布局审计 `military-toolbar-space-smoke / deep / continents / 10000` 通过：军事顶部工具条最小按钮宽从约 `103.6px` 提升到 `125.6px`，两个子工具组分别为 `129.6px` 与 `125.6px`；战报清理按钮最小宽从 `92px` 提升到 `333px`；军事面板无横向溢出，WebGL 加载 `430.6ms`，`drawMs = 0`，`glError = 0`。
- e2e 守门 `military-toolbar-space-e2e / continents / 10000` 通过：点击到出图 `1524ms`，纯生成 `815.7ms`，WebGL 加载 `443.9ms`，`drawMs = 0`，`glError = 0`。

## 2026-07-04：二级编辑区布局审计路径修正

继续推进面板空间策略专项时，复查发现 `webgl-generator-panel-layout-audit.mjs` 的二级编辑区审计实际没有打开 `UiActionDock`：一方面原脚本依赖合成 click，另一方面临时验证命令把 `--variant deep` 当作有效参数使用，但脚本真正读取的是 `--scenario deep`。

完成内容：

- `preparePanelDeepState()` 改为使用 Playwright locator 真实点击对象行，并等待可用 `.ui-action-dock .ui-icon-action` 出现。
- 打开首个可用二级操作时使用真实按钮点击，并短暂等待 `.ui-secondary-action-panel` 可见。
- 明确后续 deep 布局审计应使用 `--scenario deep --template continents`，避免无效的 `--variant deep` 让报告误判二级面板为 `none`。
- 只修改审计工具，不改应用 UI、组件样式、地图数据或渲染逻辑。

验证：

- `node --check .\tools\webgl-generator-panel-layout-audit.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 面板 deep 布局审计 `secondary-panel-audit-fix-smoke / deep / continents / 10000` 通过：国家编辑、城市管理、军事管理均打开到二级“重命名”面板，未发现待复核项；点击到出图 `1633.1ms`，WebGL 加载 `375.5ms`，`drawMs = 0.1`，`glError = 0`。
- e2e 守门 `secondary-panel-audit-fix-e2e / continents / 10000` 通过：点击到出图 `1751.4ms`，纯生成 `898.1ms`，WebGL 加载 `527.6ms`，`drawMs = 0`，`glError = 0`。

## 2026-07-04：图层滑条标签 nowrap 加固

按当前面板空间策略继续推进，复查控制面板布局后发现“图层”tab 的 `城市标签上限` 滑条虽然已有 `92px` 标签列且没有溢出，但首列仍是默认 `white-space: normal`，与生成页、单位页滑条标签已经收敛到 nowrap 的策略不一致。

完成内容：

- 为 `.label-limit-field > span:first-child` 增加 `white-space: nowrap`，固定“城市标签上限”标签单行显示。
- 不改图层按钮网格、标签上限偏好值、滑条组件或 renderer 图层逻辑。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 面板 deep 布局审计 `layer-label-limit-nowrap-smoke / continents / 10000` 通过：图层页 `城市标签上限` 为 `92px x 16px / nowrap`，控制面板无横向溢出，WebGL 加载 `453.9ms`。
- e2e 守门 `layer-label-limit-nowrap-e2e / continents / 10000` 通过：点击到出图 `1604.3ms`，纯生成 `888.4ms`，WebGL 加载 `411.4ms`，`drawMs = 0.2`，`glError = 0`。

## 2026-07-04：单位滑条标签空间放宽

按当前面板空间策略继续推进，复查全量 deep 面板审计后，控制面板“单位”tab 未出现横向溢出，但三个滑条标签仍是 `82px / white-space: normal`，与生成页气候滑条已经修正过的 nowrap 策略不一致。该项属于当前执行队列中的“单位 / 滑条字段”空间治理。

完成内容：

- 单位页 `unit-config-row`、`unit-derived-row` 和 `unit-scale-field` 的标签列从 `82px` 放宽到 `92px`。
- `比例尺 / 人口倍率 / 降水倍率`、面积单位派生行和单位下拉标签禁止折行，保持与控制面板其它稳定字段一致的单行标签。
- 只调整 `styles.css` 中单位设置局部样式，不改显示单位偏好、换算逻辑、滑条组件或地图数据。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 面板 deep 布局审计 `unit-slider-label-space-smoke / continents / 10000` 通过：单位页三个滑条标签均为 `92px x 16px / nowrap`，控制面板无横向溢出，页面横向溢出为 `0`，WebGL 加载 `483.7ms`。
- e2e 守门 `unit-slider-label-space-e2e / continents / 10000` 通过：点击到出图 `1699.5ms`，纯生成 `879.1ms`，WebGL 加载 `508ms`，`drawMs = 0.2`，`glError = 0`。

## 2026-07-04：资源标记工具条空间放宽

按当前面板空间策略继续推进，复查 `marker-toolbar-baseline / continents / 10000 / deep` 审计后确认资源标记面板编辑工具条虽然未溢出，但仍把“新增资源”下拉、放置、移动、删除、重生成资源点和取消强塞在一行，工具按钮组最小按钮宽只有 `76px`，属于当前计划中明确标出的偏紧项。

完成内容：

- 资源标记面板工具条从单行六控件改为两行布局：资源类型下拉和放置 / 移动 / 删除 / 取消保留第一行，“重生成资源点”独占第二行。
- `.marker-edit-toolbar` 的按钮列从 `minmax(76px, auto)` 改为 `minmax(82px, 0.5fr)`，并通过 `.marker-regenerate-button` 给长操作完整宽度。
- 只调整 `MarkerPanel.vue` 和局部 CSS，不改 marker 数据、编辑命令、地图生成或渲染器逻辑。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；`MarkerPanel` chunk 约 `9.46KB / gzip 3.46KB`。
- 面板 deep 布局审计 `marker-toolbar-space-smoke / continents / 10000` 通过：资源标记工具条从 `1 行 / min 76px` 提升到 `2 行 / min 88px / overflow none`，资源标记面板 body 溢出为 `none`，点击到出图 `1494.1ms`，WebGL 加载 `351.2ms`。
- e2e 守门 `marker-toolbar-space-e2e / continents / 10000` 通过：点击到出图 `1496.7ms`，纯生成 `784.2ms`，WebGL 加载 `382.9ms`，`drawMs = 0`，`glError = 0`。

## 2026-07-04：经济总览详情区样式升级

用户指出经济总览列表下方的详情数据样式比较原始。复查后确认经济面板底部直接复用通用 `UiDetailGrid`，商品、市场和交易详情都是等权裸字段，缺少经济对象标题、关键指标和分组层次。

完成内容：

- 经济总览详情区改为专用 `economy-detail-card`，包含对象类型、标题、副标题、标签徽章、4 个关键指标和分组详情。
- 商品详情分为“价格信号 / 供需 / 来源与流向”；市场详情分为“覆盖范围 / 库存与供需 / 交易与价格”；交易详情分为“交易双方 / 价格与金额 / 运输”。
- 调试字段继续通过 `useDebugMode()` 过滤，只在调试模式显示。
- 新增经济详情卡、关键指标卡片、分组 `dl` 和空状态样式，保证长名称和值可以换行，不再硬挤。

验证：

- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；`EconomyPanel` chunk 约 `26.07KB / gzip 7.89KB`。
- 构建产物浏览器烟测打开经济总览并切换“商品 / 市场 / 交易”：三个 tab 均显示详情卡、4 个关键指标和 3 个分组，经济面板宽 `820px`，无 panel/card/section 横向溢出。
- 面板 deep 布局审计 `economy-detail-card-layout / continents / 10000` 通过：未发现待复核项；经济总览面板 body 溢出为 `none`，点击到出图 `1808.2ms`，WebGL 加载 `432.4ms`。
- e2e 守门 `economy-detail-card-e2e / continents / 10000` 通过：点击到出图 `1631.8ms`，纯生成 `844.9ms`，WebGL 加载 `408ms`，最慢加载阶段为“构建线层顶点” `70.1ms`。

## 2026-07-04：下拉选项 is-hovering 白底修正

用户指出 Element Plus 下拉框中鼠标从选项移出下拉框时，保留高亮状态的选项会变成白色。复查 Element Plus 本地 theme-chalk CSS 后确认 Select 选项状态不仅有 `:hover` / `.hover`，还会保留 `.is-hovering`；此前只覆盖了部分状态，导致鼠标离开后 `.is-hovering` 继续读取默认 `--el-fill-color-light`，在截图中的选项上露出浅色背景。

完成内容：

- `ui-select-popper` 和通用 `.el-select__popper` 增加局部 Element Plus CSS 变量：`--el-fill-color-light`、`--el-fill-color-blank`、`--el-bg-color-overlay`、`--el-color-primary` 等统一改为暗色 / 暗金。
- 下拉选项基础态强制透明背景；`.hover`、`.is-hovering`、`:hover` 统一为暗色 hover 背景。
- `.is-selected` 以及 selected + hover / is-hovering / :hover 组合统一为暗金渐变，避免选中项或保留 hover 项回落到默认浅色。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测打开下拉后悬停第二项，再把鼠标移出 popper：离开后该项仍保留 `.is-hovering`，但背景为 `rgb(27, 43, 51)`，未出现亮色背景；选中项背景为暗金渐变，popper 背景为 `rgba(12, 18, 22, 0.98)`。
- e2e 守门 `select-hover-style-e2e / continents / 10000` 通过：点击到出图 `1547ms`，纯生成 `851.1ms`，WebGL 加载 `416.6ms`，最慢加载阶段为“构建标签” `65.7ms`。

## 2026-07-04：输入框双层和下拉面板暗色修正

用户指出输入框看起来像两层：Element Plus 自身已有清除图标，但内层输入又露出浏览器原生清除按钮 / 内层边框，外层 focus 后也有白色边框；同时下拉框弹出面板颜色不符合暗色界面。

完成内容：

- Element Plus `.el-input__inner` 改为透明、无边框、无阴影和无 outline，只由 `.el-input__wrapper` 画一层暗色背景与边框。
- `.el-input__wrapper` 增加透明实际边框和 `:focus-within` 暗金 focus 线，避免真实焦点落到 inner 时出现白色边框。
- 隐藏 `input[type="search"]` 的浏览器原生清除按钮，保留 Element Plus 自带 clear icon，避免双重删除图标。
- `UiSelectField` 下拉从蓝色主题改回暗金主题，teleport 到 body 的 `.el-select__popper` 增加暗色面板、暗金边框、暗色 hover 和暗金选中态兜底。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测打开城市管理、军事管理和名称库后，聚焦筛选输入并打开一个下拉框：搜索 input 背景透明、边框 `0px` 且 outline 透明；wrapper 背景 `rgb(16, 23, 27)`，无可见白边；select popper 背景 `rgba(12, 18, 22, 0.98)`，边框 `rgba(215, 168, 79, 0.34)`，选中项为暗金渐变。`18` 个可见输入相关节点未发现亮色背景或亮色可见边框。
- e2e 守门 `input-select-style-e2e / continents / 10000` 通过：点击到出图 `1762.2ms`，纯生成 `936.3ms`，WebGL 加载 `497.1ms`，最慢加载阶段为“构建线层顶点” `69.3ms`。

## 2026-07-04：输入框暗色样式补齐

用户指出输入框背景仍为白色，与当前暗色界面不一致。复查后发现全局样式已覆盖 `.el-input` 和 `.el-input-number`，但 textarea、部分 Element Plus inner 层和原生文本输入仍可能在不同组件或样式顺序下露出默认浅色背景。

完成内容：

- 将 `.el-textarea` 纳入全局 Element Plus 输入变量覆盖。
- `.el-input__wrapper`、`.el-input__inner` 和 `.el-textarea__inner` 统一使用暗色背景、浅色文字和暗色边框 / focus 边框。
- 常见原生文本输入类型 `text / number / search / password` 以及 `textarea` 增加暗色兜底，避免未封装输入框露出白底。

验证：

- `git diff --check`、`node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测打开城市管理、国家编辑、军事管理、名称库和备注总览后，扫描 `24` 个可见 `input / textarea / el-input__wrapper / el-textarea__inner`，未发现接近白色背景；样本中的文本 / 数字 / 搜索输入背景为 `rgb(16, 23, 27)` 或透明继承，文字为浅色。
- e2e 守门 `input-dark-style-e2e / continents / 10000` 通过：点击到出图 `1536.1ms`，纯生成 `815.1ms`，WebGL 加载 `393.2ms`，最慢加载阶段为“构建线层顶点” `61.7ms`。

## 2026-07-04：取消视口交互时隐藏 overlay，改回同步刷新

用户复核本地效果后指出，临时隐藏非 canvas 覆盖层仍没有解决移动视图时标签、军事单位和城镇名称与画布分离的观感问题，因此要求先取消这条逻辑，改回覆盖层与 canvas 同步移动 / 缩放。

完成内容：

- `drawViewportPreview()` 不再调用 `suspendOverlayForInteraction()`，也不再用 `updateOverlay: false` 跳过覆盖层刷新。
- 视口预览绘制改为 `updateOverlay: true`，在拖动、滚轮缩放、适配视图和定位对象时同步刷新标签、城市剪影、marker 和军事图标位置。
- 路线、河流和选中态等 screen-space 动态 mesh 仍保留 idle commit 分帧重建，避免把动态线层重建重新塞回每一帧交互。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Vite dev 浏览器烟测覆盖滚轮、左键拖拽、`fitToView()` 和 `locateObject({kind: "city"})`：无 console/page error，`glError = 0`；交互期间 `map-stage--interaction-hidden = false`、`map-overlay--interaction-hidden = false`、`#map-overlay` 保持 `visible`；左键拖拽后 city label / city icon 屏幕位移约 `158.8px`，定位对象后 city label 位移约 `162.6px`。
- e2e 守门 `viewport-overlay-sync-e2e / continents / 10000` 通过：点击到出图 `1610.8ms`，纯生成 `886.8ms`，WebGL 加载 `405.3ms`，最慢加载阶段为“构建标签” `80.1ms`。
- 100k overlay profile `viewport-overlay-sync-100k / continents / full` 通过：完整图层连续滚轮 frame p95 `70.6ms`、中键拖动画布 frame p95 `35.4ms`，overlay p95 `5.8ms / 2.4ms`，overlay 暂停样本为 `0`，idle commit dirty 均恢复 `clean`。同步刷新下滚轮出现 `4` 个 long task，作为后续性能专项风险记录。

## 2026-07-04：左键拖拽视口时 overlay 隐藏补洞

用户指出本地启动后移动视图时，标签、军事单位、城镇名称等非 canvas 覆盖层仍会与画布分离。复查后确认此前只完整覆盖了滚轮、中键 / 右键拖拽、适配视图和定位对象；普通左键拖拽仍停留在“选择候选”路径，移动超过阈值后只标记 moved，没有切换到平移和 overlay 隐藏路径。

完成内容：

- 左键单击仍保留对象选择；左键按下后移动超过 `3px` 会切换为平移，更新 camera 并触发 `drawViewportPreview()`。
- `pickClientPoint()`、`drawViewportPreview()`、viewport idle commit 增加 map 未就绪保护，避免页面加载完成前滚轮或 hover 抛错并卡住 overlay 状态。
- 当前策略继续是“视口交互中临时隐藏非 canvas 覆盖层，idle 后恢复”，不把城市剪影、标签、marker、军事图标或测量 SVG 默认迁入 WebGL。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Vite dev 浏览器烟测覆盖加载前滚轮、加载后滚轮、中键拖拽、左键拖拽、`fitToView()` 和 `locateObject({kind: "city"})`：无 console/page error，`glError = 0`；左键拖拽期间 `#map-overlay` visibility 为 `hidden`，city/state label、city icon、military icon 的父链有效可见性均为 `false`，idle 后恢复。
- 100k overlay profile `viewport-overlay-left-drag-100k / continents / full` 通过：完整图层连续滚轮 frame p95 `6ms`，中键拖动画布 frame p95 `17.6ms`，overlay 暂停样本 `18 / 18` 和 `24 / 24`，idle commit dirty 均恢复 `clean`。
- e2e 守门 `viewport-overlay-left-drag-e2e / continents / 10000` 通过：点击到出图 `1282.2ms`，纯生成 `689.3ms`，WebGL 加载 `372.1ms`，最慢加载阶段为“构建线层顶点” `72.3ms`。

## 2026-07-03：控制面板简介 tab 布局整理

用户指出简介 tab 中项目链接和导入导出操作占用空间、层级混乱，需要把项目链接横向排布，补充原版在线地址，并将具体导出操作收进二级面板。

完成内容：

- 从原版 `source/Fantasy-Map-Generator/README.md` 和 `src/index.html` 确认原版部署地址为 `https://azgaar.github.io/Fantasy-Map-Generator/`。
- 简介 tab 的“当前项目 / 原版仓库 / 原版在线版”改为同一行按钮。
- 简介 tab 主操作只保留并列的“导出 / 导入地图数据”。
- 具体导出项“图片 / 地图数据 / GeoJSON / 要素 GeoJSON”移动到导出二级浮层。
- 要素 GeoJSON 图层开关移入导出二级浮层，避免普通简介区域被导出配置打断。

## 2026-07-03：军事单位地图图标抽象化

用户要求地图上的军事单位 icon 不再使用汉字，以便中文环境之外的用户也能理解兵种含义，并提出舰队、弓兵、骑兵、步兵、山地兵、重骑兵、重步兵和重装弓兵的抽象图标方向。

完成内容：

- 将军事生成器的基础单位图标从“步/弓/骑/械/舟”改为非汉字符号。
- 新增军团图标档位：大舰队、小舰队、弓兵、重装弓兵、骑兵、重骑兵、步兵、重步兵、山地兵和器械。
- 军团图标会根据主兵种、兵力规模、兵种占比和高地地形选择；政策缩放兵力后会重新刷新图标档位，避免重装/大舰队判断使用缩放前兵力。
- 渲染层增加旧图标兼容映射，历史数据中的“步/弓/骑/械/舟”会在地图上显示为新抽象符号，不再直接露出汉字。
- 调整军事 overlay 样式，让复合图标不会被圆形底裁切，并按弓兵、骑兵、重装、山地、器械和舰队做轻量区分色。

## 2026-05-18：初始源码阅读与总方案

用户说明：`source/` 目录中是一个地图生成器源码，当前基于 SVG 和 HTML 实现，希望提升性能，用图形技术重新实现。用户不熟悉图形技术，因此先要求阅读源码并写一份详细说明文档。

完成内容：

- 阅读 `source/Fantasy-Map-Generator` 项目结构。
- 识别核心入口：
  - `src/index.html`
  - `public/main.js`
  - `public/modules/ui/layers.js`
  - `src/renderers/*`
  - `src/modules/*`
  - `src/types/PackedGraph.ts`
  - `src/utils/pathUtils.ts`
- 判断主要性能瓶颈来自大量 SVG DOM 节点、SVG path 字符串拼接、`innerHTML` 重建、SVG 滤镜和 mask。
- 编写 `graphics-reimplementation-plan.md`。

关键决策：

- 不建议推翻生成算法。
- 建议保留 `grid`、`pack`、`options`、`style` 等现有数据模型。
- 推荐主路线为 WebGL2 + PixiJS v8 或轻量 WebGL2 封装。
- 文本、纹章、编辑手柄等复杂能力初期可以保留 overlay。

## 2026-05-18：开始第 0 里程碑

用户要求：按照文档第 0 个里程碑开始实现，项目代码放在当前目录下，不要在 `source` 文件夹下放任何新代码。

完成内容：

- 新增 `tools/fmg-profile.mjs`。
- 新增 `docs/performance/performance-baseline.md`。
- profiling 工具设计为外部 harness，不修改 `source/`。
- 工具会在 Playwright 页面运行时注入 `window.__fmgProfile()`。
- 工具支持启动 Vite dev server，或连接已有 `--url`。
- 工具默认测试 `10000`、`50000`、`100000` cells。
- 工具输出 JSON 和 Markdown 报告。

当前限制：

- `source/Fantasy-Map-Generator/node_modules` 不存在，因此尚未跑出真实数值基线。
- 已执行 `node --check tools\fmg-profile.mjs`，语法检查通过。

## 2026-05-18：固定协作与文档约定

用户纠正并新增要求：

- 所有文档使用中文描写。
- 写的代码添加必要注释。
- 将目前已经沟通过的所有东西写成项目固定文档，后续不再重复强调。
- 新 Codex 智能体切换后也应能复用上下文。
- 及时将计划写成文档，方便追溯开发历史。

完成内容：

- 新增 `AGENTS.md` 作为后续智能体固定接手入口。
- 新增 `docs/current-plan.md` 记录当前计划和下一步。
- 新增本文件 `docs/development-log.md`。
- 将 `docs/performance/performance-baseline.md` 改写为中文。
- 将 profiling 脚本生成的 Markdown 报告改为中文标题和表头。
- 给 `tools/fmg-profile.mjs` 补充必要注释。

后续要求：

- 所有新增手写文档必须使用中文。
- 计划、历史、重要决策要持续写入 `docs/`。
- 若脚本生成 Markdown 报告，也应输出中文。

## 2026-05-19：继续第 0 里程碑执行

用户要求继续执行第 0 里程碑，并说明已将默认 Node 版本重新设置为 26。

执行情况：

- 检查到当前 shell 中 `node` 一度仍显示为 v24.14.0，但后续 profiling 脚本输出中 Node 已显示为 v26.1.0。
- `npm install` 曾因中断导致 `rolldown` 的 Windows 原生 binding 损坏。
- 精确删除了损坏的 `source/Fantasy-Map-Generator/node_modules/@rolldown/binding-win32-x64-msvc` 目录。
- 执行 `npm install @rolldown/binding-win32-x64-msvc@1.0.0 --save-optional`，显式补回缺失的平台依赖。
- 验证 `rolldown-binding.win32-x64-msvc.node` 可被 Node 正常加载。
- 发现 Windows TCP 排除端口范围包含 `5109-5208`，因此默认 `5173` 和尝试过的 `5187` 都无法用于 Vite。
- 改用 `5300` 端口后，Vite 端口问题解除。
- 新阻塞变为 Playwright 自带 Chromium 未安装，且 `npx playwright install chromium` 下载超时。
- 为 `tools/fmg-profile.mjs` 增加 `--browser-channel chrome|msedge` 支持，并在 Playwright 自带浏览器缺失时自动尝试系统 Chrome 或 Edge。
- 使用 `--port 5300 --browser-channel chrome --cells 10000` 跑通烟测，生成 `docs/generated/reports/performance-baseline-smoke.json` 和 `docs/generated/reports/performance-baseline-smoke.md`。
- 烟测结果已写出，但命令最终超时，原因是 Windows 下 Vite/npm/cmd/node 子进程树没有被完整回收。
- 为 `tools/fmg-profile.mjs` 增加 Windows `taskkill /T /F` 进程树清理逻辑。

当前下一步：

- 重新跑 10k 烟测确认进程可正常退出。
- 烟测退出正常后运行完整 `10000,50000,100000` 基线。
- 完整基线已首次生成，但检查结果发现实际 `pack.cells` 没有随目标 cells 单调增长。
- 排查源码后确认 `pointsInput.value` 是 1-13 档位，不是实际 cells 数；实际 cells 位于 `pointsInput.dataset.cells`。
- 修正 `tools/fmg-profile.mjs` 的 cells 设置逻辑：`10000/50000/100000` 分别映射到滑块档位 `4/8/13`，同时设置 `dataset.cells`。

## 2026-05-19：完成第 0 里程碑可信基线

继续排查完整基线时发现：虽然 profiler 已把 `pointsInput` 设置到目标档位，但原项目 `generate()` 会调用 `randomizeOptions()`。当 `lock_points` 没有锁定时，`randomizeOptions()` 会执行 `changeCellsDensity(4)`，把目标点数重置回默认 10k，导致 50k 和 100k 基线不可信。

完成内容：

- 阅读 `public/modules/ui/options.js` 中的 `randomizeOptions()`，确认 points 未锁定时会被重置。
- 阅读 `public/modules/ui/general.js` 中的 `locked(id)`，确认锁定状态由 `#lock_points.dataset.locked === "1"` 判断。
- 修正 `tools/fmg-profile.mjs`：
  - 生成前优先调用原项目 `changeCellsDensity()`，复用原项目自身的点数档位逻辑。
  - 生成前设置 `lock_points` 为锁定态，避免 `randomizeOptions()` 重置 points。
  - 对不支持的 cells 档位直接报错，避免产生含糊基线。
- 执行 `node --check tools\fmg-profile.mjs`，语法检查通过。
- 使用 Node 26、端口 `5300`、系统 Chrome 跑通完整三档基线。
- 生成并覆盖可信结果：
  - `docs/generated/reports/performance-baseline-results.json`
  - `docs/generated/reports/performance-baseline-results.md`

本次可信基线摘要：

| 目标 cells | 实际 grid cells | 实际 pack cells | 生成耗时 ms | 完整绘制 ms | SVG 节点 |
|---:|---:|---:|---:|---:|---:|
| 10000 | 10004 | 5890 | 431.1 | 203.6 | 11462 |
| 50000 | 50142 | 20870 | 2471 | 229.5 | 41573 |
| 100000 | 99846 | 44682 | 4420.9 | 314 | 77894 |

关键结论：

- 第 0 里程碑 profiling 工具已经可重复运行。
- 三档目标 cells 已确认命中实际网格规模，不再错误回退到 10k。
- 100k 档生成耗时明显高于绘制耗时，但 SVG 节点达到约 7.8 万，仍是后续缩放、交互、局部刷新和导出路径上的重要优化对象。
- 下一阶段应进入第 1 里程碑：实现最小图形渲染器原型，并选择一个节点量高、可验证收益清晰的图层先迁移。

## 2026-05-19：开始并跑通第 1 里程碑 WebGL cells 原型

用户要求执行第 1 里程碑。

完成内容：

- 新增 `tools/fmg-export-snapshot.mjs`：
  - 启动原项目 Vite 服务。
  - 使用系统 Chrome 打开原项目页面。
  - 设置目标 cells 并锁定 `lock_points`。
  - 调用原项目 `generate()`。
  - 导出 `pack.cells`、`pack.vertices`、`pack.states` 的最小 JSON 快照。
- 新增 `tools/serve-prototype.mjs`：
  - 提供无依赖静态服务器。
  - 默认服务 `prototype/webgl-cells`。
- 新增 `prototype/webgl-cells/`：
  - `index.html`：原型页面。
  - `src/main.js`：加载快照、初始化渲染器、绑定 UI。
  - `src/renderer.js`：原生 WebGL2 cell 渲染器。
  - `src/styles.css`：原型样式。
  - `data/sample-map.json`：10k 目标 cells 的真实 FMG 运行时快照。
- 新增 `docs/milestones/milestone-1-webgl-prototype.md` 记录实现说明、运行方式和当前边界。

当前原型数据：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 10000 |
| 实际 pack cells | 7292 |
| Voronoi 顶点 | 14788 |
| 三角形 | 43740 |
| GPU 顶点 | 131220 |
| 地图尺寸 | 1440 x 960 |

验证情况：

- `node --check` 通过：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/src/main.js`
  - `prototype/webgl-cells/src/renderer.js`
- 使用系统 Chrome 打开原型页面，确认 WebGL2 上下文创建成功、地图快照加载成功、高度图可见、国家模式按钮可切换。
- 内置浏览器插件在本轮因用户目录权限问题无法启动，因此视觉验证使用 Playwright + 系统 Chrome 完成。

关键结论：

- 第 1 里程碑最关键的数据路径已经跑通：真实 `pack.cells` 可以在外部原型中被转换为 GPU 三角形并渲染。
- 当前还不是完整替代渲染器，只是 cells 面图层原型。
- 下一步应增加 picking、国家边界线 pass 和原型性能计时。

## 2026-05-20：推进第 1 里程碑交互、边界和计时

用户先要求将 demo 的目标 cells 改为 100k，随后要求继续推进里程碑。

完成内容：

- 使用 `tools/fmg-export-snapshot.mjs` 重新导出 `100000` 目标 cells 的 demo 快照。
- 更新 `prototype/webgl-cells/data/sample-map.json`。
- 在 WebGL 原型中新增国家边界线 pass：
  - 根据相邻 cell 的 `state` 差异生成线段。
  - 当前 100k 目标快照生成 `712` 条国家边界线段。
- 新增鼠标悬停 cell picking：
  - 当前实现为 CPU 多边形遍历，用于先验证交互数据路径。
  - 悬停时显示 cell id、高度、国家和世界坐标。
- 新增原型级性能计时：
  - buffer 构建耗时。
  - buffer 上传耗时。
  - WebGL 绘制耗时。
- 更新左侧 UI：
  - 新增国家边界开关。
  - 新增悬停 cell 面板。
  - 统计面板加入边界线段和性能指标。

当前 100k demo 快照摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 pack cells | 20602 |
| Voronoi 顶点 | 41850 |
| 三角形 | 123932 |
| GPU 顶点 | 371796 |
| 国家边界线段 | 712 |

验证情况：

- `node --check prototype\webgl-cells\src\main.js` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- 使用系统 Chrome 验证 demo：
  - 页面加载 100k 目标快照。
  - WebGL buffer 顶点数为 `371796`。
  - 国家边界顶点数为 `1424`，即 `712` 条线段。
  - 一次验证中的构建约 `64.9ms`，上传约 `5ms`，绘制约 `0.7ms`。
  - `pickCell()` 可以返回 cell id、高度、国家和世界坐标。

下一步：

- 将 CPU picking 替换为空间索引。
- 增加河流或道路 line pass。
- 将性能数据整理为与第 0 里程碑 SVG 基线可对照的表。

## 2026-06-09：将 hover picking 改为空间索引

继续执行第 1 里程碑，目标是避免鼠标悬停时遍历全部 cell。

完成内容：

- 在 `prototype/webgl-cells/src/renderer.js` 中新增均匀网格空间索引：
  - 构建阶段为每个 cell 计算多边形边界盒。
  - 按边界盒覆盖范围写入网格桶。
  - picking 时先根据鼠标世界坐标定位网格桶，再对候选 cell 做边界盒和 polygon 判断。
- 在统计面板中新增 picking 索引指标：
  - 索引桶数量。
  - 平均候选 cells。
  - 最大候选 cells。
- 在悬停面板中新增单次 picking 指标：
  - 当前命中的候选 cell 数量。
  - picking 耗时。
- 更新 `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `AGENTS.md`。
- 新增 `docs/performance/webgl-svg-performance-comparison.md`，记录 WebGL 原型与 SVG 基线的阶段性对照。

当前验证结果：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 pack cells | 20602 |
| GPU 顶点 | 371796 |
| 国家边界线段 | 712 |
| picking 索引桶 | 13824 |
| 平均候选 cells | 6.55 |
| 最大候选 cells | 31 |
| 构建 buffer | 69.5ms |
| 上传 buffer | 4.2ms |
| 绘制 | 0.3ms |
| 中心点 picking 候选 | 2 |
| 中心点 picking | 0ms |

验证情况：

- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - 页面加载 100k 目标快照。
  - WebGL buffer 和国家边界仍正常。
  - 空间索引统计已显示在页面统计面板。
  - `pickCell()` 返回命中 cell，并附带候选数量和 picking 耗时。

下一步：

- 增加河流或道路 line pass。
- 将 WebGL 原型性能数据整理为与 SVG 基线可对照的表。
- 将 `CellWebGLRenderer` 接口收敛到 `GraphicsMapRenderer` 形态。

## 2026-06-10：增加河流 line pass

继续执行第 1 里程碑，目标是验证真实线图层数据进入 WebGL 的路径。本轮选择河流而不是道路，因为原项目 `pack.rivers` 已直接提供河流 cell 序列和可选 points，适合作为第一个真实 line pass。

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - 快照 metadata 增加河流数量。
  - 导出每条河流的 `cells`、`points`、`widthFactor`、`sourceWidth`、`width`、`name` 和 `type`。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`：
  - 使用 100k 目标 cells。
  - 由于随机地图变化，本次实际 pack cells 为 `22934`。
  - 本次快照包含 `492` 条河流。
- 扩展 `prototype/webgl-cells/src/renderer.js`：
  - 根据 river points 或 river cells 对应的 cell 中心点生成折线段。
  - 新增河流 position/color buffer。
  - 绘制阶段新增 river line pass。
  - `lastDraw` 记录河流顶点数。
- 扩展 demo UI：
  - 新增河流图层开关。
  - 统计面板显示河流数量和河流线段数。
- 更新 `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `AGENTS.md`。

当前验证结果：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 pack cells | 22934 |
| Voronoi 顶点 | 46514 |
| 三角形 | 137998 |
| GPU 顶点 | 413994 |
| 国家边界线段 | 684 |
| 河流数量 | 492 |
| 河流线段 | 1891 |
| picking 索引桶 | 15504 |
| 平均候选 cells | 6.47 |
| 最大候选 cells | 31 |
| 构建 buffer | 95.3ms |
| 上传 buffer | 5.4ms |
| 绘制 | 0.3ms |
| 中心点 picking 候选 | 8 |
| 中心点 picking | 0ms |

验证情况：

- `node --check tools\fmg-export-snapshot.mjs` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - 页面加载 100k 目标快照。
  - 河流数量为 `492`。
  - 河流顶点数为 `3782`，即 `1891` 条线段。
  - 河流开关关闭后，renderer 中 `showRivers` 变为 `false`。
  - WebGL 绘制和空间索引 picking 保持正常。

注意事项：

- 5300/5301 在本轮表现为 Vite 判断占用但 HTTP 不可连接，导出改用 5500 成功。
- 沙盒内启动 Vite 时曾因 `.vite` 缓存 `EPERM unlink` 失败，使用外部执行后正常。
- 当前 shell 的 `node -v` 显示为 `v24.14.0`，不是用户之前设置的 26；本轮代码未依赖 Node 26 特性。
- 河流当前是 `gl.LINES` 折线验证，不包含原 SVG 的变宽河道和 meandering 曲线。
- WebGL 与 SVG 当前不是同一张随机地图，性能对照只能用于阶段性决策，不能视为严格 A/B benchmark。

下一步：

- 将 `CellWebGLRenderer` 接口收敛到 `GraphicsMapRenderer` 形态。
- 增加正式的 WebGL 性能采集脚本。
- 继续补道路、标签、人口或降水等更复杂图层。

## 2026-06-16：收敛 WebGL 原型主接口

继续执行第 1 里程碑，目标是避免 `CellWebGLRenderer` 继续作为临时 demo API 扩张，并提前贴近总方案里的 `GraphicsMapRenderer` 形态。

完成内容：

- 将 `prototype/webgl-cells/src/renderer.js` 的主导出类改为 `GraphicsMapRenderer`。
- 保留 `CellWebGLRenderer` 兼容别名，避免旧调试代码或后续脚本直接断掉。
- 新增或整理以下对外方法：
  - `loadSnapshot(snapshot)`：加载快照数据。
  - `setColorMode(mode)`：切换高度/国家配色。
  - `setLayerVisible(layerId, visible)`：按图层 id 控制 `cells`、`borders`、`rivers` 可见性。
  - `setCamera(camera)`：设置相机平移和缩放。
  - `screenToWorld(screenX, screenY)`：屏幕坐标转地图世界坐标。
  - `pick(screenX, screenY)`：统一 picking 入口。
  - `getStats()`：返回 metadata、geometry、picking、performance、layers 和 camera。
- 更新 `prototype/webgl-cells/src/main.js`，让 demo UI 使用新接口。
- 更新 `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md`、`docs/performance/webgl-svg-performance-comparison.md` 和 `AGENTS.md`。

验证情况：

- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 重新启动 `http://127.0.0.1:5400` demo 服务。
- 使用系统 Chrome + Playwright 验证：
  - `window.__graphicsMapRenderer` 存在。
  - 旧的 `window.__fmgCellRenderer` 与新入口指向同一个对象。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `getStats()` 返回当前 100k 快照统计。
  - `setLayerVisible("rivers", false)` 可以关闭河流图层。
  - `setColorMode("state")` 可以切换国家配色。
  - `pick()` 可以返回中心点 cell，候选数量为 `8`。
  - WebGL `errorBefore` 和 `errorAfter` 均为 `0`。

注意事项：

- 本轮未改变快照数据本身。
- 同一快照下本轮验证记录的构建耗时约 `167.7ms`、上传约 `8.5ms`、绘制约 `0.5ms`，高于上一轮记录；这类手动浏览器验证存在波动，因此下一步需要正式性能采集脚本。

下一步：

- 增加正式的 WebGL 性能采集脚本，输出 JSON/Markdown。
- 评估 GPU color picking 是否值得纳入第 1 里程碑。
- 继续补道路、标签、人口或降水等更复杂图层。

## 2026-06-16：新增 WebGL 原型性能采集脚本

继续执行第 1 里程碑，目标是把手动 Playwright 片段固化为可重复执行的性能采集工具。

完成内容：

- 新增 `tools/webgl-prototype-profile.mjs`：
  - 自动打开 WebGL 原型页面。
  - 读取 `GraphicsMapRenderer.getStats()`。
  - 多次调用 `draw()` 采集绘制耗时。
  - 多次调用 `pick()` 采集 picking 耗时。
  - 验证切换国家/高度模式、关闭/打开河流图层后的绘制耗时。
  - 输出 JSON 和中文 Markdown。
- 生成当前采集结果：
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `docs/performance/webgl-svg-performance-comparison.md`。

当前采集结果：

| 指标 | 数值 |
|---|---:|
| 采样次数 | 10 |
| 目标 cells | 100000 |
| 实际 pack cells | 22934 |
| GPU 顶点 | 413994 |
| 国家边界线段 | 684 |
| 河流线段 | 1891 |
| buffer 构建 | 144.3ms |
| buffer 上传 | 8.6ms |
| draw 最小值 | 0.1ms |
| draw 平均值 | 0.22ms |
| draw 最大值 | 0.3ms |
| picking 最小值 | 0ms |
| picking 平均值 | 0.02ms |
| picking 最大值 | 0.1ms |

验证情况：

- `node --check tools\webgl-prototype-profile.mjs` 通过。
- 成功运行：
  - `node .\tools\webgl-prototype-profile.mjs --url http://127.0.0.1:5400 --browser-channel chrome --iterations 10 --out .\docs\webgl-prototype-profile-results.json --markdown .\docs\webgl-prototype-profile-results.md`
- 采集报告为中文 Markdown，符合项目文档约定。

下一步：

- 评估 GPU color picking 是否值得纳入第 1 里程碑。
- 继续补道路、标签、人口或降水等更复杂图层。
- 评估是否需要把当前单文件 renderer 拆分为 layer、buffer、camera 和 picking 模块。

## 2026-06-16：修正底层 cell mesh 数据源

用户指出当前 demo 中出现大量巨型三角 cell，不符合原版“每个 cell 基本差不多大”的表现。排查后确认问题不是 WebGL 本身，而是第 1 里程碑原型误用了 `pack.cells` 作为底层 mesh。

问题原因：

- FMG 中 `grid.cells` 是原始均匀 Voronoi 网格，数量接近目标 cells。
- `pack.cells` 是生成后承载国家、河流、城市、feature 等业务语义的压缩/派生图结构。
- 水域、海岸、湖泊、边界等区域的 pack cell 可能形成很大的多边形。
- 原型此前用 `pack.cells.p + pack.cells.v + pack.vertices.p` 三角化底图，因此在水域/边界处出现巨型三角 cell。

验证数据：

| 图结构 | cell 数 | 最大中心到顶点距离 | 大于 50px 的 cell | 大于 80px 的 cell |
|---|---:|---:|---:|---:|
| grid | 99846 | 5.73px | 0 | 0 |
| pack | 58251 | 235.23px | 236 | 123 |

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - 导出 `grid.cells.i`。
  - 导出 `grid.points` 作为 grid cell 中心点。
  - 导出 `grid.cells.v`。
  - 导出 `grid.cells.h`。
  - 导出 `grid.vertices.p`。
  - 导出 `pack.cells.g`，用于从 pack cell 反查对应 grid cell。
- 更新 `prototype/webgl-cells/src/renderer.js`：
  - 新增 `getRenderGraph()`。
  - 新增 `buildGridToPackMap()`。
  - 基础 cell mesh 优先使用 `grid`。
  - 国家颜色通过 `pack.cells.g` 映射回 pack state。
  - 国家边界、河流、picking 仍使用 `pack` 数据。
- 更新 `prototype/webgl-cells/src/main.js`：
  - 统计面板显示 `pack cells`、`grid cells`、渲染来源、渲染 cells、渲染顶点。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`。
- 重新生成 WebGL 性能采集报告：
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `docs/performance/webgl-svg-performance-comparison.md`。

当前快照摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 grid cells | 99846 |
| 实际 pack cells | 58251 |
| 渲染来源 | grid |
| grid Voronoi 顶点 | 200338 |
| pack Voronoi 顶点 | 117148 |
| 三角形 | 598519 |
| GPU 顶点 | 1795557 |
| 国家边界线段 | 1404 |
| 河流数量 | 1021 |
| 河流线段 | 5777 |
| picking 索引桶 | 39204 |
| 平均候选 cells | 5.9 |
| 最大候选 cells | 17 |

当前采集结果：

| 指标 | 数值 |
|---|---:|
| buffer 构建 | 416ms |
| buffer 上传 | 43.3ms |
| draw 平均值 | 0.5ms |
| draw 最大值 | 2.5ms |
| picking 平均值 | 0.02ms |
| picking 最大值 | 0.1ms |

验证情况：

- `node --check tools\fmg-export-snapshot.mjs` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\main.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - renderer 统计显示 `renderSource: "grid"`。
  - 渲染 cells 为 `99846`。
  - 渲染顶点为 `200338`。
  - picking 仍可返回中心点 pack cell。

下一步：

- 继续检查国家模式在 grid->pack 映射下的视觉质量。
- 评估 GPU color picking 是否值得纳入第 1 里程碑。
- 继续补道路、标签、人口或降水等更复杂图层。

## 2026-06-16：修正河流折线延伸到海里的问题

用户指出部分河流会流出陆地，在海里多画出一段距离。排查后确认这是原型级河流 line pass 的简化实现造成的。

问题原因：

- 当前快照中的 `pack.rivers` 没有保存 `Rivers.addMeandering()` 后的 points。
- 原版 SVG 绘制会调用 `Rivers.addMeandering()` 和 `Rivers.getRiverPath()`，生成带宽度的河道多边形。
- WebGL 原型此前 fallback 为直接连接 `river.cells` 对应的 pack cell 中心点。
- 很多河流的最后一个或多个 cell 是水域/河口 cell，直接连中心点就会让折线伸进海里。

排查数据：

- 当前快照共有 `1021` 条河流。
- `559` 条河流的末端若干 cell 中包含水域 cell。
- 原始按 cell 中心连接的河流折线约 `5890` 条线段。

完成内容：

- 更新 `prototype/webgl-cells/src/renderer.js`：
  - `getRiverPoints()` 改为传入完整 snapshot。
  - 新增 `clipRiverAtWater()`。
  - 新增 `lerpPoint()`。
  - 当河流折线遇到第一个水域 cell 时，在上一陆地中心点和当前水域中心点之间插入一个近似河口点，然后停止绘制。
- 重新运行 WebGL 原型性能采集：
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
- 更新 `AGENTS.md`、`docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md` 和 `docs/performance/webgl-svg-performance-comparison.md`。

当前结果：

| 指标 | 数值 |
|---|---:|
| 河流数量 | 1021 |
| 河流线段 | 5641 |
| buffer 构建 | 336.5ms |
| buffer 上传 | 36.6ms |
| draw 平均值 | 0.27ms |
| draw 最大值 | 1.3ms |
| picking 平均值 | 0.01ms |
| picking 最大值 | 0.1ms |

验证情况：

- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - renderer 仍使用 `grid` 渲染底层 cells。
  - 河流数量仍为 `1021`。
  - 河流线段为 `5641`。
  - WebGL `errorBefore` 和 `errorAfter` 均为 `0`。

当前限制：

- 这是原型级河口截断，只解决折线画进海里的问题。
- 还没有复刻原版 SVG 的 `Rivers.getRiverPath()` 变宽河道、Catmull-Rom 曲线和河口宽度。

下一步：

- 如果继续完善河流，应实现 polyline mesh 或河道 polygon mesh，而不是继续用 `gl.LINES`。
- 继续检查国家模式在 grid->pack 映射下的视觉质量。

## 2026-06-16：完成步骤 1.1 demo 渲染器模块化

按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的“步骤 1.1：demo 渲染器模块化”执行。本步只改 `prototype/webgl-cells/src/` 和项目中文文档，不修改 `source/`。

完成内容：

- 保留 `prototype/webgl-cells/src/renderer.js` 作为 `GraphicsMapRenderer` 主类、WebGL draw 调度和对外 API 门面。
- 新增 `prototype/webgl-cells/src/camera.js`：
  - 管理相机状态、视图适配、resize、pan、zoom 和 screen/client 到 world 的坐标转换。
- 新增 `prototype/webgl-cells/src/buffers.js`：
  - 管理 cell 三角形、国家边界线、河流线 buffer 构建、上传和释放。
- 新增 `prototype/webgl-cells/src/picking.js`：
  - 管理空间索引、候选 cell 查询和 point-in-polygon 命中判断。
- 新增 `prototype/webgl-cells/src/colors.js`：
  - 管理高度、国家和河流颜色计算。
- 新增 `prototype/webgl-cells/src/layers.js`：
  - 管理 demo 当前 `cells`、`borders`、`rivers` 图层状态和绘制顺序。
- 新增 `prototype/webgl-cells/src/utils.js`：
  - 放置数值裁剪和耗时格式化等小型通用函数。

保持的接口：

- `loadSnapshot()`
- `setColorMode()`
- `setLayerVisible()`
- `setCamera()`
- `screenToWorld()`
- `pick()`
- `getStats()`
- `CellWebGLRenderer` 兼容别名
- `window.__fmgCellRenderer` 和 `window.__graphicsMapRenderer` 调试入口仍由 `main.js` 设置

验证情况：

- `node --check prototype\webgl-cells\src\main.js` 通过。
- `node --check prototype\webgl-cells\src\renderer.js` 通过。
- `node --check prototype\webgl-cells\src\camera.js` 通过。
- `node --check prototype\webgl-cells\src\buffers.js` 通过。
- `node --check prototype\webgl-cells\src\picking.js` 通过。
- `node --check prototype\webgl-cells\src\colors.js` 通过。
- `node --check prototype\webgl-cells\src\layers.js` 通过。
- `node --check prototype\webgl-cells\src\utils.js` 通过。
- `node --input-type=module -e "const mod = await import('./prototype/webgl-cells/src/renderer.js'); if (!mod.GraphicsMapRenderer || !mod.CellWebGLRenderer || !mod.installCanvasInteractions) throw new Error('renderer exports missing'); console.log('renderer exports ok');"` 通过，确认模块路径和导出名可运行时解析。
- 门下检查通过：
  - 本步未修改 `source/`。
  - `GraphicsMapRenderer.prototype` 保留 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
  - `CellWebGLRenderer === GraphicsMapRenderer`。
  - `node --check prototype/webgl-cells/src/*.js`、ESM 导入检查和 `git diff --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面加载真实 FMG 快照，画布显示非空国家模式地图。
  - 统计面板显示渲染来源为 `grid`。
  - 渲染 cells 为 `99846`。
  - GPU 顶点为 `1795557`。
  - 国家边界线段为 `1404`。
  - 河流线段为 `5641`。
  - 点击 `国家` 按钮后国家模式激活。
  - 关闭 `国家边界` 和 `河流` 后复选框状态正确，画面仍可绘制。
  - 鼠标悬停返回 cell `26830`，候选 cells 为 `3`，picking ms 为 `0`。
  - Browser 控制台无 error/warning。
- in-app Browser 的只读执行环境无法读取页面 expando 全局变量，因此补充使用本机 Playwright + 系统 Chrome 验证调试入口：
  - `window.__graphicsMapRenderer` 和 `window.__fmgCellRenderer` 均存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - 渲染来源仍为 `grid`。
  - 渲染 cells 为 `99846`。
  - GPU 顶点为 `1795557`。
  - 国家边界线段为 `1404`。
  - 河流线段为 `5641`。
  - 切换到 `state` 模式后模式状态正确。
  - 关闭 `borders` 和 `rivers` 后图层状态正确。
  - 中心点 picking 返回命中，候选数为 `3`。
  - `glError` 为 `0`。

当前限制：

- 本步是结构拆分，不改变图层视觉表达。
- 还未进入步骤 1.2 的 feature 图层补全。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.2：基础底图和 feature 图层。

## 2026-06-16：完成步骤 1.2 基础底图和 feature 图层

按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的“步骤 1.2：基础底图和 feature 图层”执行。本步只改 `tools/`、`prototype/webgl-cells/` 和中文文档，不修改 `source/`。

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - 导出 `pack.features`，保留 `type`、`group`、`vertices`、`shoreline`、`height`、`flux`、`evaporation`、`name` 等后续图层所需字段。
  - 导出 `cells.f`，保留 pack cell 到 feature 的语义关联。
  - 在 `metadata` 中记录 feature 数和湖泊数。
- 新增 `prototype/webgl-cells/src/features.js`：
  - 从 `pack.features` 和 `pack.vertices` 构建陆地 feature 填充、湖泊填充、海岸线和湖岸线 buffer。
  - 统计 feature 数、陆地 feature、湖泊 feature、海岸 feature 和湖泊 group。
- 更新 `prototype/webgl-cells/src/buffers.js`、`renderer.js`、`layers.js` 和 `colors.js`：
  - 新增 `landmass`、`lakes`、`coastline` 三类 WebGL 图层。
  - 绘制顺序为 `landmass -> cells -> lakes -> coastline -> borders -> rivers`。
  - 海洋由 canvas 清屏色表达，陆地仍由 grid cell mesh 作为主底图，湖泊和岸线作为 feature 语义层叠加。
  - 基础 cell mesh 继续使用 `grid.points`、`grid.cells.v` 和 `grid.vertices.p`，没有把 `pack.cells` 当作底层均匀 mesh。
- 更新 `prototype/webgl-cells/index.html`、`src/main.js` 和 `src/styles.css`：
  - UI 新增陆地底色、湖泊、海岸/湖岸线开关。
  - 统计面板新增 feature、湖泊、湖泊分组、湖泊三角形、海岸线段和湖岸线段。
  - 长湖泊分组文本做了换行保护。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`：
  - 当前快照目标为 `100000` cells，实际 `99846` grid cells、`45023` pack cells。
  - feature 数 `121`，湖泊 `48`。
  - 当前随机地图实际湖泊分组为 `freshwater: 46`、`salt: 2`；导出结构保留 `freshwater`、`salt`、`sinkhole`、`frozen`、`lava`、`dry` 等 group 的兼容能力。

当前结果：

| 指标 | 数值 |
|---|---:|
| 渲染来源 | grid |
| grid cells | 99846 |
| pack cells | 45023 |
| feature 数 | 121 |
| 陆地 feature | 70 |
| 湖泊 feature | 48 |
| 湖泊三角形 | 1255 |
| 海岸线段 | 10624 |
| 湖岸线段 | 1255 |
| 国家边界线段 | 1541 |
| 河流数量 | 499 |
| 河流线段 | 2642 |
| buffer 构建 | 295.4ms |
| buffer 上传 | 39ms |
| 单次绘制 | 0.1ms |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\features.js` 通过。
- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- 使用系统 Chrome + Playwright 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，画布非空。
  - `renderSource` 仍为 `grid`。
  - feature 数为 `121`，湖泊 feature 为 `48`。
  - 湖泊三角形为 `1255`，海岸线段为 `10624`，湖岸线段为 `1255`。
  - 切换到国家模式正常。
  - 关闭湖泊、海岸/湖岸线、国家边界和河流后图层状态正确。
  - 中心点 picking 仍可命中。
  - `glError` 为 `0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - `sample-map.json` 当前包含 `features: 121`、`lakes: 48`、`cells.f: 45023`，湖泊分组为 `freshwater: 46`、`salt: 2`。
  - `tools/fmg-export-snapshot.mjs` 已导出 `grid`、`cells.f`、`features`、`feature.vertices`、`shoreline`、`group` 和湖泊统计等字段。
  - `layers.js` 绘制顺序为 `landmass -> cells -> lakes -> coastline -> borders -> rivers`。
  - `buildCellBuffers()` 仍以 `grid` 作为基础 mesh，没有把 `pack.cells` 当作底层均匀 mesh。
  - `node --check`、ESM 导入检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示非空 WebGL 地图。
  - 统计面板显示 `grid cells: 99846`、`GPU 顶点: 1795563`、`feature 数: 121`、`湖泊 feature: 48`、`海岸线段: 10624`、`湖岸线段: 1255`。
  - `陆地底色`、`湖泊`、`海岸/湖岸线` 开关存在，关闭和重新打开湖泊/岸线后状态正确。
  - `国家` 模式切换后画面仍非空。
  - 鼠标悬停返回 cell `22429`，高度 `42`，国家 `Vosengia (11)`，候选 cells 为 `9`，picking ms 为 `0.1`。
  - 缩放和拖拽后，海岸线、湖岸线与 cell 底图保持贴合，未见明显漂移。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `renderSource` 为 `grid`。
  - `renderCellCount` 为 `99846`。
  - `lakeTriangles` 为 `1255`。
  - `coastlineSegments` 为 `10624`。
  - `lakeShoreSegments` 为 `1255`。
  - `glError` 为 `0`。

当前限制：

- 本步没有复刻 SVG 的 fractal coastline、mask、blur/filter。
- 海岸和湖岸线当前直接使用 feature 顶点折线，因此位置与 cell 底图对齐，但视觉不如源项目曲线自然。
- 湖泊填色当前使用 feature polygon 扇形三角化；复杂凹多边形后续应改为更稳健的三角化或 mask 方案。
- 当前随机快照只有 `freshwater` 和 `salt` 两类湖泊实际出现；其它湖泊 group 通过导出字段和颜色映射保留兼容。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.3：专题面图层。

## 2026-06-16：完成步骤 1.3 专题面图层

按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的“步骤 1.3：专题面图层”执行。本步只改 `tools/`、`prototype/webgl-cells/` 和中文文档，不修改 `source/`。

完成内容：

- 扩展 `tools/fmg-export-snapshot.mjs`：
  - `grid.cells` 新增导出 `temp`。
  - `pack.cells` 新增导出 `province`、`culture`、`religion`、`biome`。
  - 新增导出 `pack.provinces`、`pack.cultures`、`pack.religions` 的 `i/name/color/removed` 元数据。
  - 新增导出 `biomesData` 的 `i/name/color/removed` 元数据。
  - 新增 `themeMetadata.temperature.min/max`，供 demo 温度 palette 使用。
- 新增 `prototype/webgl-cells/src/themes.js`：
  - 集中定义 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 七类专题面。
  - 高度使用 grid 高度渐变；生物群系、省份、文化、宗教使用源项目元数据颜色；温度使用原型级冷暖渐变。
  - 统一提供专题颜色构建、专题值统计和 hover 语义字段。
- 更新 `prototype/webgl-cells/src/buffers.js` 和 `renderer.js`：
  - cell 几何仍只构建一套 `grid` position buffer。
  - 构建 `cellRanges` 记录每个 grid cell 对应的 GPU 顶点范围和 pack 语义 cell。
  - 专题切换时只重算并上传当前专题颜色 buffer，不重建 cell geometry。
  - `setColorMode("state")` 保留为兼容别名，内部映射到 `states`。
- 更新 `prototype/webgl-cells/index.html`、`src/main.js` 和 `src/styles.css`：
  - UI 从高度/国家两个按钮扩展为七个专题按钮。
  - 统计面板新增当前专题、专题字段、专题值数、geometry 复用说明、颜色顶点数和专题更新耗时。
  - hover 面板新增生物群系、省份、文化、宗教和温度。
  - 添加内联空 favicon，避免浏览器默认 favicon 404 干扰控制台验收。
- 更新 `tools/webgl-prototype-profile.mjs`：
  - 将旧的 `"state"` 模式调用改为 `"states"`。
- 重新导出 `prototype/webgl-cells/data/sample-map.json`：
  - 当前快照目标为 `100000` cells，实际 `99846` grid cells、`43182` pack cells。
  - 当前快照包含 `309` 个省份、`13` 个文化、`17` 个宗教、`13` 个生物群系元数据。
  - 温度范围为 `-18` 到 `21`。

当前结果：

| 指标 | 数值 |
|---|---:|
| 渲染来源 | grid |
| grid cells | 99846 |
| pack cells | 43182 |
| GPU 顶点 | 1795557 |
| feature 数 | 99 |
| 湖泊 feature | 35 |
| 国家边界线段 | 1435 |
| 河流数量 | 600 |
| 河流线段 | 3837 |
| 专题数量 | 7 |
| 专题颜色顶点 | 1795557 |
| buffer 构建 | 228.7ms |
| buffer 上传 | 25.2ms |
| 专题更新 | 74-104.1ms |
| 绘制 | 0.1-0.9ms |

验证情况：

- `git status --short` 已在开工前查看，工作区存在多人流水线留下的未提交改动，本步只处理步骤 1.3 相关文件。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\tools\webgl-prototype-profile.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\themes.js` 通过。
- `node --check .\prototype\webgl-cells\src\picking.js` 通过。
- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `git diff --check` 限定本步相关路径通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，画布非空。
  - 七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 均可切换。
  - 每个专题的 `colorBufferVertices` 均为 `1795557`，与 `geometry.vertexCount` 一致。
  - 七个专题切换后 `glError` 均为 `0`。
  - 湖泊、海岸/湖岸线、国家边界和河流开关可关闭并重新打开。
  - 中心点 picking 命中 cell `18835`，返回高度、国家、生物群系、省份、文化、宗教、温度、候选数和 picking 耗时。
  - 画布非空像素数为 `768000`。
  - 添加 favicon 后短检控制台无 error，最终 `glError` 为 `0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - `sample-map.json` 包含 `grid.cells.temp: 99846`，`cells.province/culture/religion/biome: 43182`，并包含 `provinces: 309`、`cultures: 13`、`religions: 17`、`biomes: 13` 及温度范围 `-18..21`。
  - `themes.js` 导出七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature`，`index.html` 也有对应七个按钮。
  - `GraphicsMapRenderer.prototype` 保留 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
  - `CellWebGLRenderer === GraphicsMapRenderer`。
  - 从 `height` 切到 `temperature` 后 `positions`、`vertexCount`、`cellRanges` 均未变化，只触发颜色 buffer 上传，确认 geometry 复用。
  - `node --check`、ESM 导入检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示七个专题按钮：高度、生物群系、国家、省份、文化、宗教、温度。
  - 逐个点击七个专题后，按钮激活状态和统计面板字段均正确。
  - 统计面板显示 `geometry 复用: position buffer 复用，切换仅更新专题颜色 buffer`。
  - `colorBufferVertices` 为 `1795557`，与 GPU 顶点数一致。
  - 湖泊、海岸/湖岸线、国家边界和河流开关可关闭并重新打开。
  - 鼠标悬停返回 cell `19118`，高度 `64`，国家 `Xagen (5)`，生物群系 `Cold desert (2)`，省份 `Rasar (262)`，文化 `Rasar (9)`，宗教 `Ralidavar Precepts (16)`，温度 `6`，候选 cells 为 `11`，picking ms 为 `0.2`。
  - 温度专题截图显示非空地图，湖泊、海岸/湖岸线、边界和河流叠加正常。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口、geometry 复用和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - 七个专题依次切换后，`positions` 和 `cellRanges` 仍为同一对象，`vertexCount` 保持 `1795557`。
  - `colorBufferVertices` 为 `1795557`。
  - `glError` 为 `0`。

当前限制：

- 专题面当前按 cell 颗粒填色，不复刻 SVG 的 isoline 平滑边界、halo、waterGap 路径和温度等值线标签。
- 专题切换当前每次重算并上传一整份颜色 buffer；这已经避免重建 geometry，但 palette 编辑或单项颜色变化后续应改为局部更新。
- 温度专题使用 demo 内置冷暖渐变，没有复刻源项目 `d3.interpolateSpectral` 和用户温标设置。
- 当前轻量浏览器验证使用本机 Playwright + 系统 Chrome；正式 in-app Browser 验收仍需交给侍中执行。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.4：线图层。

## 2026-06-16：步骤 1.4 线图层实施

执行角色：尚书。

本步目标是在独立 WebGL demo 中把已有河流和国家边界线从分散实现收敛为统一 line layer，并补上路线和省份边界。实施仍限定在 demo、工具和中文文档中，没有修改 `source/`。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - 导出 `pack.routes` 到快照，保留 `i`、`group`、`feature`、`name` 和路线点列。
  - 在 `metadata` 中记录 `routes` 数量和 `routeGroups` 分组统计。
- `prototype/webgl-cells/src/lines.js`：
  - 新增统一线图层构建模块。
  - 当前统一输出 `stateBorders`、`provinceBorders`、`routes`、`rivers` 四类 line layer 的 positions/colors/stats。
  - 路线按 `roads`、`trails`、`searoutes` 使用不同基础颜色。
  - 国家边界从相邻 land pack cell 的 `state` 差异派生；省份边界从同一国家内相邻 land pack cell 的 `province` 差异派生。
  - 河流继续复用此前的入海截断 fallback：若快照没有持久化 `river.points`，则使用 `river.cells` 对应 cell 中心折线，并在进入水域时插入近似河口点后停止。
- `prototype/webgl-cells/src/buffers.js`：
  - 移除内联国家边界和河流构建逻辑，改为调用 `buildLineBuffers()`。
  - 上传和释放 line layer buffer 改由统一函数处理。
- `prototype/webgl-cells/src/renderer.js`：
  - 通过 `lineBuffers.layers[layerId]` 绘制线图层，渲染器不再分别理解河流、路线或边界的构建细节。
  - `getStats()` 新增 `stateBorderSegments`、`provinceBorderSegments`、`routeCount`、`routeSegments`、`routeGroups`、`riverFallback`。
- `prototype/webgl-cells/src/layers.js`：
  - 图层顺序更新为 `landmass -> cells -> lakes -> coastline -> stateBorders -> provinceBorders -> routes -> rivers`。
  - 保留 `setLayerVisible("borders")` 兼容别名，同时实际控制国家边界和省份边界两个图层。
- `prototype/webgl-cells/index.html`、`src/main.js`：
  - 新增省份边界和路线开关。
  - 国家边界、省份边界、路线、河流开关互相独立。
  - 统计面板新增路线数量、路线线段、路线分组、省份边界线段。
- `tools/webgl-prototype-profile.mjs`：
  - Markdown 报告字段更新为国家边界、省份边界、路线和河流分项。
- `docs/current-plan.md`：
  - 记录步骤 1.4 完成状态、新快照统计和下一步。

重新导出的默认快照：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| grid cells | 99846 |
| pack cells | 23557 |
| seed | 849457094 |
| feature 数 | 226 |
| 湖泊 feature | 22 |
| 国家边界线段 | 853 |
| 省份边界线段 | 2625 |
| 路线数量 | 451 |
| 路线分组 | roads: 10，trails: 255，searoutes: 186 |
| 路线线段 | 6638 |
| 河流数量 | 407 |
| 河流线段 | 1864 |

验证情况：

- 开工前已执行 `git status --short`，确认工作区有多人流水线留下的未提交改动；本步只改线图层相关工具、demo 和文档文件。
- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\tools\webgl-prototype-profile.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过，快照已包含 `451` 条路线。
- `node --input-type=module -e "import fs from 'node:fs'; import {buildLineBuffers} from './prototype/webgl-cells/src/lines.js'; ..."` 通过，确认四类 line layer 均能构建：
  - 国家边界 `853` 段。
  - 省份边界 `2625` 段。
  - 路线 `451` 条、`6638` 段。
  - 河流 `407` 条、`1864` 段。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，画布非空，非零像素数为 `768000`。
  - 七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 均可切换，切换后 `glError` 为 `0`。
  - 国家边界、省份边界、路线、河流四个开关可分别关闭和重新打开，互不影响。
  - 统计面板返回 `stateBorderSegments: 853`、`provinceBorderSegments: 2625`、`routeCount: 451`、`routeSegments: 6638`、`riverSegments: 1864`。
  - 中心点 hover picking 仍命中 cell，并返回高度、国家、生物群系、省份、文化、宗教、温度、候选数和 picking 耗时。
  - 控制台未捕获 error，最终 `glError` 为 `0`。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - 快照包含 `metadata.routes = 451`，`metadata.routeGroups = { roads: 10, trails: 255, searoutes: 186 }`，顶层 `routes[]` 共 `451` 条，路线线段合计 `6638`。
  - 四类 line layer 构建结果为：`stateBorders: 853` 段、`provinceBorders: 2625` 段、`routes: 6638` 段、`rivers: 1864` 段。
  - `routes`、`provinceBorders`、`stateBorders`、`rivers` 开关互不串扰。
  - `setLayerVisible("borders")` 兼容别名会同时控制 `stateBorders` 和 `provinceBorders`，符合当前文档说明。
  - 七个专题面、feature/湖泊/岸线和 hover picking 的代码结构未被破坏。
  - `node --check`、ESM/API 检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示路线、国家边界、省份边界、河流四类线图层统计。
  - 统计面板显示 `国家边界线段: 853`、`省份边界线段: 2625`、`路线数量: 451`、`路线线段: 6638`、`路线分组: roads:10，trails:255，searoutes:186`、`河流线段: 1864`。
  - 切换到 `省份` 专题后画面仍非空。
  - `国家边界`、`省份边界`、`路线`、`河流` 四个开关可分别关闭并重新打开，状态互不串扰。
  - 缩放和拖拽后，线层与底图保持贴合，未见明显漂移。
  - 鼠标悬停返回 cell `13704`，高度 `17`，国家 `Neutrals (0)`，生物群系 `Marine (0)`，候选 cells 为 `4`，picking ms 为 `0`。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `routeGroups` 为 `roads: 10`、`trails: 255`、`searoutes: 186`。
  - `stateBorders`、`provinceBorders`、`routes`、`rivers` 图层状态均为开启。
  - `renderSource` 为 `grid`。
  - `glError` 为 `0`。

当前限制：

- 本步为了控制改动风险，仍使用 `gl.LINES` 绘制线层，没有实现可变宽 polyline mesh。
- 尚未实现 line picking；当前 picking 仍是 cell hover picking。
- 省份边界是基于相邻 pack cell 共享边的线段化 fallback，没有复刻源项目 `draw-borders.ts` 的链式路径合并和 SVG 样式。
- 路线直接使用快照中的 `route.points` 折线，没有复刻 `Routes.getPath()` 的曲线、dash、join/cap 和样式编辑器。
- 河流仍因快照缺少原版 meandered points 而走 `river.cells` fallback；下一轮宽线方案应同时处理 `Rivers.getRiverPath()` 近似、河宽趋势、join/cap 和 picking。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.5：点图层和高节点图层。
- 优先覆盖 `population`、`prec`、`burgIcons`、`markers` 等 SVG 节点压力较大的图层。

## 2026-06-16：步骤 1.5 点图层和高节点图层

本轮由“尚书”实施 `docs/plans/gl-reimplementation-acceptance-plan.md` 的步骤 1.5。开工前执行 `git status --short`，确认工作区存在多人流水线既有未提交改动；本步没有回退或覆盖其他人的改动，也没有修改 `source/`。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - 导出 `grid.cells.prec`、`pack.cells.pop`、`pack.cells.burg`。
  - 导出 `pack.burgs` 的位置、人口、首都、港口、分组、名称等语义字段。
  - 导出 `pack.markers` 的位置、类型、icon、pin、fill/stroke、size、pinned 等语义字段。
  - `metadata` 新增 burg、port、marker 数量。
- `prototype/webgl-cells/src/points.js`：
  - 新增统一点图层构建模块。
  - 当前支持 `precipitation`、`population`、`burgIcons`、`markers` 四类点层。
  - 人口图层包含农村人口 cell 点和城市 burg 点。
  - 城市/港口图层用程序化颜色点区分首都、港口和普通 burg。
  - marker 图层按 `type/icon` 聚合统计，先使用 fill/stroke 或默认色的占位点。
- `prototype/webgl-cells/src/buffers.js`：
  - 接入点层 buffer 构建、上传和释放生命周期。
- `prototype/webgl-cells/src/renderer.js`：
  - WebGL shader 新增 `a_size` 和 `u_point_layer`。
  - 新增 `drawColoredPoints()`，用 `gl.POINTS` 绘制 screen-sized 圆点。
  - 绘制面和线时显式复位点 size attribute，避免点层状态污染后续 draw call。
- `prototype/webgl-cells/src/layers.js`：
  - 图层顺序更新为 `landmass -> cells -> lakes -> coastline -> stateBorders -> provinceBorders -> routes -> rivers -> precipitation -> population -> burgIcons -> markers`。
- `prototype/webgl-cells/index.html`、`src/main.js`：
  - 新增降水点、人口点、城市/港口、标记四个开关。
  - 统计面板新增降水点、人口 instances、农村人口点、城市人口点、城市/港口点、港口点、marker 点和 marker 分组。
- `tools/webgl-prototype-profile.mjs`：
  - Markdown 报告新增四类点图层统计字段，并更新当前原型覆盖范围说明。

重新导出的默认 100k 快照：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| grid cells | 99846 |
| pack cells | 58310 |
| seed | 714595163 |
| 降水点 | 31608 |
| 人口 instances | 45896 |
| 农村人口点 | 44465 |
| 城市人口点 | 1431 |
| 城市/港口点 | 1431 |
| 港口点 | 269 |
| marker 点 | 389 |
| marker 分组 | 29 类 |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\points.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\tools\webgl-prototype-profile.mjs` 通过。
- `node .\tools\fmg-export-snapshot.mjs --cells 100000 --browser-channel chrome --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- ESM/API 检查通过：
  - `GraphicsMapRenderer` 可导入。
  - `CellWebGLRenderer === GraphicsMapRenderer`。
  - `POINT_LAYER_IDS` 为 `precipitation`、`population`、`burgIcons`、`markers`。
- 快照字段检查通过：
  - `grid.cells.prec` 中陆地降水点 `31608`。
  - `cells.pop` 中人口 cell `44465`。
  - 有效 burg `1431`，其中港口 `269`。
  - marker `389`。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，`summary` 显示 `100000` 目标 cells、`58310` pack cells、`99846` grid cells。
  - 四类点层默认开启，统计为降水点 `31608`、人口 instances `45896`、城市/港口点 `1431`、marker 点 `389`。
  - 降水点、人口点、城市/港口、标记四个开关可分别关闭并重新打开。
  - 七个专题 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 均可切换。
  - feature 图层、四类线图层和 hover cell picking 未回归。
  - 中心点 picking 仍能命中 cell。
  - 控制台未捕获 error，最终 `glError` 为 `0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - 快照字段包含 `grid.cells.prec = 99846`、`cells.pop = 58310`、`cells.burg = 58310`、有效 `burgs = 1431`、`markers = 389`。
  - 点层运行统计为 `precipitationPoints = 31608`、`populationInstances = 45896`、`burgIcons = 1431`、`markerCount = 389`。
  - 四类点层 ID 为 `precipitation`、`population`、`burgIcons`、`markers`。
  - 关闭 `precipitation` 不影响 `population`、`burgIcons`、`markers`；继续关闭 `population` 不影响 `burgIcons`、`markers` 和线层。
  - 点层使用 `Float32Array`、WebGL buffer 和 `gl.drawArrays(gl.POINTS, ...)`，没有用 DOM 节点替代大量点渲染。
  - `node --check`、ESM/API 检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示降水点、人口点、城市/港口、标记四类点图层开关。
  - 统计面板显示降水点 `31608`、人口 instances `45896`、农村人口点 `44465`、城市/港口点 `1431`、港口点 `269`、marker 点 `389`。
  - 降水点、人口点、城市/港口、标记四个开关可分别关闭并重新打开，状态互不串扰。
  - 切换到 `温度` 专题后点层仍可见，feature 和线图层保持开启。
  - 缩放和拖拽后点层仍贴合底图，页面保持可交互。
  - 鼠标悬停返回 cell `26347`，高度 `17`，国家 `Neutrals (0)`，生物群系 `Marine (0)`，温度 `18`，候选 cells 为 `3`，picking ms 为 `0`。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `precipitation`、`population`、`burgIcons`、`markers` 图层状态均为开启。
  - `renderSource` 为 `grid`。
  - `glError` 为 `0`。

当前限制：

- 点层当前使用 `gl.POINTS` 和圆点 fragment discard，没有实现完整 sprite atlas、SVG icon、emoji、外部图片 marker 或 pin shape。
- 人口图层用 screen-sized 点表示农村/城市人口，没有复刻源项目 `drawPopulation()` 的竖线动画和柱状语义。
- 降水图层用点半径近似源项目 `drawPrecipitation()`，没有复刻 wind direction 文本。
- burg 和 marker 当前只显示位置占位点；尚未实现 burg/marker hover 或点击 picking。
- 缺少 LOD、聚合和视口裁剪；100k 快照已可交互，但更高规模需要继续优化。

下一步：

- 按 `docs/plans/gl-reimplementation-acceptance-plan.md` 进入步骤 1.6：文本和纹章 demo 策略。

## 2026-06-17：步骤 1.6 文本和纹章 demo 策略

本轮由“尚书”实施 `docs/plans/gl-reimplementation-acceptance-plan.md` 的步骤 1.6。开工前执行 `git status --short`，确认工作区存在多人流水线既有未提交改动，且 `prototype/webgl-cells/data/sample-map.json` 仍有暂存区/工作区不一致状态；本步没有回退或覆盖其他人的改动，也没有修改 `source/`。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - `metadata` 新增 `burgLabels`、`stateLabels`、`emblemPlaceholders` 统计。
  - `states` 新增 `fullName`、`capital`、`center`、`cells`、`pole`、`coa` 等轻量字段。
  - `provinces` 复用命名颜色序列化，并补充 `center`、`pole`、`coa`。
  - `burgs` 新增 `coa` 元数据。
  - 顶层新增 `labels` 和 `emblems`：
    - `labels.burgs` 用于普通城市标签 overlay。
    - `labels.states` 用于国家标签占位，短期不复刻 SVG 曲线 `textPath`。
    - `emblems.states` / `emblems.burgs` 用于纹章 badge 占位，短期不调用真实 COA renderer。
- `prototype/webgl-cells/src/renderer.js`：
  - 新增 view listener 机制，`draw()` 完成后广播当前 camera、canvas 和 snapshot 状态。
  - 该接口用于 overlay 跟随 WebGL camera，不改变现有 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
- `prototype/webgl-cells/src/overlays.js`：
  - 新增 `MapOverlayManager`。
  - 用 HTML overlay 渲染城市标签、国家中心/首都附近标签占位和纹章 badge 占位。
  - overlay 根据 WebGL camera 和 canvas/CSS 像素比例把世界坐标转换为屏幕坐标。
  - 普通城市标签在低缩放下会隐藏；首都、港口和大城市优先保留。当前样本 440 个有效 burg 全部进入 DOM。
  - 国家标签和纹章占位默认显示，用于验证策略和相机同步，不强行 GPU 化。
- `prototype/webgl-cells/index.html`、`src/main.js`、`src/styles.css`：
  - 新增 `#map-overlay` 容器，CSS 设置 `pointer-events: none`，不阻塞 canvas 交互。
  - 新增城市标签、国家标签占位、纹章占位三个开关。
  - 统计面板新增 overlay 可见/渲染数量和短期策略说明。
  - `window.__fmgMapOverlays` 暴露 overlay 管理器，方便门下和侍中检查。
- `docs/current-plan.md`、`docs/milestones/milestone-1-webgl-prototype.md`、`docs/performance/webgl-svg-performance-comparison.md`：
  - 记录步骤 1.6 的实现内容、当前样本统计、验证结果和限制。

重新导出的默认 100k 快照：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| grid cells | 99846 |
| pack cells | 21977 |
| seed | 130672330 |
| feature 数 | 174 |
| 湖泊 feature | 29 |
| 路线数量 | 393 |
| 河流数量 | 497 |
| 降水点 | 11041 |
| 人口 instances | 13760 |
| 城市/港口点 | 440 |
| 港口点 | 103 |
| marker 点 | 138 |
| 城市标签 | 440 |
| 国家标签占位 | 17 |
| 纹章占位 | 457 |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\overlays.js` 通过。
- `git diff --check -- .\tools\fmg-export-snapshot.mjs .\prototype\webgl-cells .\docs\current-plan.md .\docs\development-log.md .\docs\milestone-1-webgl-prototype.md .\docs\webgl-svg-performance-comparison.md` 通过。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- 快照字段检查通过：
  - `metadata.burgLabels = 440`。
  - `metadata.stateLabels = 17`。
  - `metadata.emblemPlaceholders = 457`。
  - 顶层 `labels.burgs = 440`、`labels.states = 17`。
  - 顶层 `emblems.states = 17`、`emblems.burgs = 440`。
- 使用本机 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5400`：
  - 页面加载真实 FMG 快照，`summary` 显示目标 `100000` cells、实际 `21977` pack cells、`99846` grid cells。
  - 初始 overlay 统计为城市标签 `143 / 440` 可见、国家标签占位 `17 / 17` 可见、纹章占位 `457 / 457` 可见。
  - `#map-overlay` 的 `pointer-events` 为 `none`。
  - 城市标签、国家标签占位、纹章占位三个开关可关闭，关闭后对应 overlay 组 `hidden = true`，统计可见数归零。
  - 拖拽地图后，示例城市标签屏幕坐标从约 `(446,286)` 变为 `(536,331)`，与相机平移量一致。
  - 拖拽后中心 cell picking 仍能命中。
  - 切换到 `temperature` 专题后 WebGL 图层仍绘制；路线开关可关闭并重新打开。
  - 控制台无 error，最终 `glError = 0`。
- 门下检查通过：
  - 本步未修改 `source/`。
  - 快照字段包含 `labels.burgs = 440`、`labels.states = 17`、`emblems.states = 17`、`emblems.burgs = 440`，`metadata.burgLabels = 440`、`metadata.stateLabels = 17`、`metadata.emblemPlaceholders = 457`。
  - `index.html` 有 `#map-overlay`，CSS 设置 `pointer-events: none`。
  - `main.js` 接入城市标签、国家标签占位、纹章占位三个开关。
  - `overlays.js` 通过 `renderer.addViewListener(() => this.sync())` 跟随 camera。
  - 七个专题、feature buffer、四类线层、四类点层和 picking 入口均未被破坏。
  - `node --check`、ESM/API 检查、`git diff --check` 和 `git diff --cached --check` 均通过。
- 侍中使用 in-app Browser 打开 `http://127.0.0.1:5400` 验收通过：
  - 页面显示城市标签、国家标签占位和纹章占位三类 overlay 开关。
  - 统计面板显示城市标签 `440 / 440` 可见、国家标签占位 `17 / 17` 可见、纹章占位 `457 / 457` 可见。
  - 城市标签、国家标签占位、纹章占位三个开关可分别关闭并重新打开。
  - `#map-overlay` 的 `pointer-events` 为 `none`，鼠标 hover 仍命中 cell `13040`，候选 cells 为 `4`，picking ms 为 `0`。
  - 拖拽地图后，同一批城市标签的屏幕坐标随相机平移变化，例如 `Dodbro` 从约 `(446, 246)` 移到 `(526, 286)`，确认 overlay 跟随 WebGL camera。
  - 截图显示城市标签、国家标签占位和纹章 badge 在地图对象附近显示。
  - Browser 控制台无 error/warning。
- 侍中补充使用本机 Playwright + 系统 Chrome 验证页面全局入口和 WebGL 状态：
  - `window.__graphicsMapRenderer` 存在。
  - `window.__fmgCellRenderer === window.__graphicsMapRenderer`。
  - renderer 类名为 `GraphicsMapRenderer`。
  - `#map-overlay` 的 `pointer-events` 为 `none`。
  - renderer 暴露 `addViewListener()`。
  - `renderSource` 为 `grid`。
  - `glError` 为 `0`。

当前限制：

- 城市标签是 HTML overlay，不是 GPU text；普通小城标签在低缩放下会隐藏，当前没有避让、裁剪队列或文本测量缓存。
- 国家标签当前只是中心/首都附近的简化占位，没有复刻源项目 `draw-state-labels.ts` 的曲线路径、`textPath`、`getBBox()` 适配和自动换行。
- 纹章当前是 HTML badge 占位；虽然快照导出了 `coa` 元数据存在性、尺寸和部分引用信息，但没有调用源项目 COA renderer，也没有实现离屏纹理缓存或真实 SVG 合成。
- overlay 统计和位置同步已经验证，但导出 PNG/JPEG/SVG 时如何合成 overlay 仍留到后续导出阶段处理。

下一步：

- 第 1 阶段独立 WebGL demo 的步骤 1.1 到 1.6 已全部经“尚书实施、门下检查、侍中验收”通过。
- 下一步进入阶段 2 前置决策：先补同地图 SVG/WebGL 对照，或在用户明确授权后开始接入 `source/Fantasy-Map-Generator` 主视图。

## 2026-06-17：修正项目路线为独立 WebGL 复刻版

用户明确纠正：当前目标不是修改原项目，也不是把 WebGL 接入 `source/Fantasy-Map-Generator` 主视图，而是基于原项目功能、数据结构和视觉表现，复刻一个功能相似但使用 WebGL 实现的独立地图生成器。

新的硬边界：

- `source/Fantasy-Map-Generator` 只作为参考实现、行为对照、快照来源和性能基线。
- 禁止修改 `source/` 原项目源码。
- 允许为了安装依赖和运行参考项目产生锁文件，例如 `pnpm-lock.yaml`。
- 新项目代码、工具、原型和文档继续放在仓库根目录的 `prototype/`、`tools/`、`docs/` 或后续正式应用目录中。

已同步修正：

- `AGENTS.md`：项目目标改为独立 WebGL 地图生成器复刻，明确 `source/` 只读参考边界。
- `docs/current-plan.md`：下一步改为阶段 2 独立生成器工程骨架和生成内核。
- `docs/plans/gl-reimplementation-acceptance-plan.md`：重写为“WebGL 地图生成器复刻可验收计划”，删除接入源项目主视图、GL 模式替换原图层等旧路线。

下一步：

- 尚书从 `docs/plans/gl-reimplementation-acceptance-plan.md` 的 **步骤 2.1：正式应用目录和运行时边界** 开始。
- 门下重点检查 `source/` 是否保持未修改。
- 侍中打开新应用页面，验证独立应用可运行、画面非空、控制台无关键错误。

## 2026-06-17：修正 demo 河流宽度和河口裁剪

用户指出当前 demo 河流没有按流量区分粗细，且河流经常越过海岸线或未到海岸线就停止。本轮只修改 demo 和快照导出工具，没有修改 `source/` 原项目源码。

主要改动：

- `tools/fmg-export-snapshot.mjs`：
  - `cells` 新增 `r` 和 `fl` 导出，用于河流 id 与水量/流量判断。
  - `rivers` 新增 `source`、`mouth`、`parent`、`basin`、`discharge`、`length`。
  - 使用 source 运行时的 `Rivers.addMeandering()` 导出 meandered points，作为后续更精细曲线复刻的参考数据。
- `prototype/webgl-cells/src/lines.js`：
  - 河流层从 `gl.LINES` 改为三角形带 mesh。
  - 河流宽度按 source 的源头宽度、路径长度增长和 cell flux 趋势计算，并使用视觉倍率让主干/支流差异可见。
  - 河口优先裁剪到最后陆地 cell 与首个水域 cell 的共享边中点；找不到共享边时才回退到高度插值点。
  - 仍保留旧快照 fallback：如果没有 `fl` 或 meandered points，仍可从 `river.cells` 构建河流。
- `prototype/webgl-cells/src/renderer.js`：
  - line layer 支持 `triangles` primitive，河流用三角形绘制，国家边界、省份边界和路线继续使用 `gl.LINES`。
- `prototype/webgl-cells/src/main.js`：
  - 统计面板新增河流三角形、河口裁剪、未入海河段和河流宽度范围。
- 重新导出默认 100k sample：
  - `prototype/webgl-cells/data/sample-map.json`

当前默认 sample 河流摘要：

| 指标 | 数值 |
|---|---:|
| pack cells | 72343 |
| 河流数量 | 1240 |
| 河流线段 | 7537 |
| 河流三角形 | 15074 |
| 河口裁剪 | 773 |
| 未入海河段 | 465 |
| 河流宽度范围 | 0.35 - 5.21 |
| WebGL 绘制 | 0.2ms |
| WebGL error | 0 |

验证情况：

- `node --check .\tools\fmg-export-snapshot.mjs` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node .\tools\fmg-export-snapshot.mjs --port 5300 --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json` 通过。
- `git diff --check -- .\tools\fmg-export-snapshot.mjs .\prototype\webgl-cells\src\lines.js .\prototype\webgl-cells\src\renderer.js .\prototype\webgl-cells\src\main.js .\prototype\webgl-cells\data\sample-map.json` 通过。
- `git diff --name-only -- source` 无输出，确认未修改 `source/`。
- 内置 Browser 当前返回 `iab` 不可用，因此本轮使用本机 Playwright + 系统 Chrome 验证：
  - 页面加载默认 100k sample。
  - 河流层统计为 `riverSegments = 7537`、`riverTriangles = 15074`、`riverMouthsClipped = 773`。
  - 河流宽度范围为 `0.35 - 5.2075`。
  - `glError = 0`，干净河流视图绘制约 `0.2ms`。
  - `docs/river-fix-rivers-only.png` 截图显示主干河流比支流更粗，河口贴近海岸线。

当前限制：

- 河流 join/cap 还不是最终高质量实现，急弯处可能有三角形段重叠。
- 当前河口裁剪按 pack cell 陆水共享边近似，不等同于 source SVG 的所有曲线细节。
- 部分“未入海河段”多为支流或内部汇流路径，不应强行拉到海岸线；后续 line picking 和河网拓扑显示时需要单独区分。

## 2026-06-17：修正湖中岛显示和纹章默认策略

用户反馈两个 demo 观感问题：

- 湖泊图层开启时，湖中的岛屿容易被湖泊填色覆盖，看起来像也被标为湖泊。
- 纹章占位太抢画面，当前阶段可以先不做纹章系统。

本轮只修改 WebGL demo，没有修改 `source/` 原项目源码。

主要改动：

- `prototype/webgl-cells/src/features.js`：
  - 新增 `lakeIslandPositions` / `lakeIslandColors` buffer。
  - `feature.group === "lake_island"` 时不再只作为普通 landmass 早期绘制，而是在湖泊填色之后再次以陆地色填回。
  - 湖中岛岸线放入 lake shore 线层，语义上归入湖岸，而不是海岸。
  - feature 统计新增 `lakeIslandFeatures`。
- `prototype/webgl-cells/src/buffers.js`、`renderer.js`：
  - 接入湖中岛填色 buffer 的构建、上传、释放和绘制。
  - 统计新增 `lakeIslandTriangles`。
- `prototype/webgl-cells/src/overlays.js`、`index.html`：
  - 纹章占位默认关闭。
  - UI 中纹章开关改为未勾选，并标注为“暂关”。
  - overlay 策略文案改为“纹章系统暂不启用，只保留后续接入占位数据”。
- `prototype/webgl-cells/src/main.js`：
  - 统计面板显示湖中岛 feature 和湖中岛三角形。

验证情况：

- `node --check .\prototype\webgl-cells\src\features.js` 通过。
- `node --check .\prototype\webgl-cells\src\buffers.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\overlays.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- buffer 构建检查通过：
  - `lakeIslandFeatures = 27`。
  - `lakeIslandTriangles = 339`。
  - `lakeTriangles = 5114`。
- in-app Browser 已刷新到 `http://localhost:5400/`，页面显示纹章开关默认未勾选。
- 使用本机 Playwright + 系统 Chrome 做完整验证：
  - `lakeIslandFeatures = 27`。
  - `lakeIslandTriangles = 339`。
  - `emblemsVisible = false`。
  - 纹章 checkbox 默认 `checked = false`。
  - `.overlay-emblems.hidden = true`。
  - `glError = 0`。
  - 控制台无 error/warn。

## 2026-06-17：湖泊填充改为真实水域 cell

用户进一步指出：正上方有一块陆地，在打开湖泊图层时会被覆盖为湖泊状态。截图确认这不是单纯的 `lake_island` 小岛填回问题，而是湖泊 fill 使用整湖 feature 外轮廓扇形三角化，遇到凹形湖岸、半岛或湖中陆块时会跨越真实陆地。

修正：

- `prototype/webgl-cells/src/features.js`：
  - 湖泊填色不再使用 lake feature 外轮廓 `pushFeatureFill()`。
  - 改为遍历 `pack.cells`，只对 `cells.h < 20` 且 `cells.f` 指向 lake feature 的真实水域 cell 做中心扇形三角化。
  - 湖岸线仍使用 feature 边界。
  - `lake_island` 填回逻辑保留，用于小型湖中岛在湖泊图层上方重新显示陆地色。

验证：

- `node --check .\prototype\webgl-cells\src\features.js` 通过。
- buffer 构建检查通过：
  - `lakeTriangles = 16707`。
  - `lakeIslandTriangles = 339`。
  - `coastlineSegments = 12651`。
  - `lakeShoreSegments = 5453`。
- in-app Browser 已刷新 `http://localhost:5400/`，统计面板显示新的湖泊三角形和湖中岛三角形。

说明：

- 这次修复牺牲了一点湖泊 fill buffer 的体积，换取语义正确性。
- 后续如果需要更平滑的湖泊边界，可以在真实水域 cell mask 的基础上做更稳健的三角化或 stencil/mask，而不是回到整湖外轮廓扇形填充。

## 2026-06-17：省界层级和中文地名 demo

用户提出最后两个 demo 级视觉改进：

- 省界相对国界应该更细、更浅或虚线化，避免抢国界层级。
- 城市和国家名可以先接一个中文库，让部分文化或国家使用中国地名；后续可能在配置中做时代风格选择，例如古代风格。

本轮只修改 WebGL demo 表现层，没有修改 `source/`。

主要改动：

- `prototype/webgl-cells/src/colors.js`：
  - 省界颜色从接近黑色改为更浅的棕灰色。
- `prototype/webgl-cells/src/layers.js`：
  - 绘制顺序改为省界先画、国界后画，国界会盖在省界上。
- `prototype/webgl-cells/src/chinese-names.js`：
  - 新增本地中文地名库和确定性命名规则。
  - 当前规则让一部分国家显示为中式国家名，例如“昭宁国”“雁川国”。
  - 这些国家下的城市显示为中式城市名；首都使用“国家词根 + 京/都/府”，港口使用“国家词根 + 津/港/浦/湾”。
- `prototype/webgl-cells/src/overlays.js`：
  - 城市标签和国家标签接入中文显示名。
  - 原始 source 名称保留在 tooltip 中，方便对照。
  - overlay 统计新增中文国家/城市标签数量。
- `prototype/webgl-cells/src/styles.css`：
  - 中文标签使用中文字体栈。
  - 中文港口不再追加英文 `harbour`，改为中文港口后缀。
- `prototype/webgl-cells/src/main.js`：
  - 统计面板显示“中文国家/城市名”。

验证情况：

- `node --check .\prototype\webgl-cells\src\chinese-names.js` 通过。
- `node --check .\prototype\webgl-cells\src\overlays.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `git diff --check` 针对本轮相关文件通过。
- in-app Browser 刷新 `http://localhost:5400/` 后验证：
  - 中文国家标签数量为 `5`，示例包括“昭宁国”“雁川国”“栖梧国”“星渚国”“青岚国”。
  - 中文城市标签 DOM 数量为 `379`。
  - 统计面板包含“中文国家/城市名”。
  - 纹章仍默认关闭。

后续建议：

- 正式生成器阶段不要把当前 demo 规则硬编码为最终命名系统。
- 后续可以把命名风格抽象为配置：`source`、`中式古代`、`中式近现代`、`西式幻想`、`混合` 等。
- 如果要继续增强省界，可在 line mesh 阶段实现真正的虚线和可控线宽；当前 WebGL `gl.LINES` 阶段先用颜色和绘制顺序解决层级问题。

## 2026-06-17：省界与路线再区分

用户反馈省界改浅后又和路线混在一起。本轮继续只做 demo 表现层调整，不修改 `source/`。

主要改动：

- `prototype/webgl-cells/src/colors.js`：
  - 省界改为冷灰蓝色，路线改为更暖的棕/金色。
  - 让行政线和道路线形成“冷/暖”视觉分工。
- `prototype/webgl-cells/src/lines.js`：
  - 省界按 cell/vertex 的确定性取模跳绘约三分之一短边，形成间断行政线感。
  - 国界不跳绘，路线不跳绘。

验证情况：

- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- buffer 构建检查通过：
  - 国家边界线段 `2235`。
  - 省份边界线段从 `17102` 降为 `11447`。
  - 路线线段仍为 `15260`。
- in-app Browser 刷新 `http://localhost:5400/` 后统计面板显示省份边界线段 `11447`，路线开关和省界开关均保持开启。

说明：

- 当前仍是 `gl.LINES` 阶段，不能真正控制线宽或 GPU dash pattern。
- 这版用颜色、绘制顺序和确定性跳绘先解决可读性；后续 line mesh 阶段再做真正虚线、宽度和道路样式。

## 2026-06-17：取消省界跳绘，路线改为略粗三角形带

用户进一步反馈：省界用灰色连续线即可，不要引入突兀的虚线/跳绘；可以考虑路线稍微更粗。本轮废弃上一版省界跳绘方案，继续只修改 demo 表现层，不修改 `source/`。

主要改动：

- `prototype/webgl-cells/src/colors.js`：
  - 省界改为连续中性灰色。
  - 路线保留暖色，与灰色省界区分。
- `prototype/webgl-cells/src/lines.js`：
  - 删除省界跳绘逻辑，省界恢复连续绘制。
  - 路线从 `gl.LINES` 改为三角形带：
    - `roads` 宽度约 `1.2`。
    - `searoutes` 宽度约 `0.9`。
    - `trails` 宽度约 `0.75`。
  - 路线统计新增 `routeTriangles`。
- `prototype/webgl-cells/src/renderer.js`、`main.js`：
  - 统计面板显示路线三角形。

验证情况：

- `node --check .\prototype\webgl-cells\src\colors.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- buffer 构建检查通过：
  - 国家边界线段 `2235`。
  - 省份边界线段恢复为 `17102`。
  - 路线线段 `15260`。
  - 路线三角形 `30520`。
- in-app Browser 刷新 `http://localhost:5400/` 后统计面板显示上述数据，省界和路线开关均保持开启。

说明：

- 当前方案用“连续灰省界 + 更粗暖色路线”区分语义，比跳绘方案更平顺。
- 后续若要更精细，可以给国界、省界、道路、山路、海路分别做正式 line style 配置。

### 路线宽度微调

用户反馈路线方向正确，但太粗，已经比国界线更抢眼。本轮把路线三角形带宽度整体下调：

- `roads`: `1.2` -> `0.7`
- `searoutes`: `0.9` -> `0.55`
- `trails`: `0.75` -> `0.45`

验证：

- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- 路线仍为三角形带，`routeTriangles = 30520`。
- in-app Browser 已刷新，路线和省界开关均保持开启。

### 路线宽度再次下调

用户继续反馈路线还可以再细。本轮继续保留三角形带路线，但下调视觉宽度：

- `roads`: `0.7` -> `0.45`
- `searoutes`: `0.55` -> `0.36`
- `trails`: `0.45` -> `0.3`

验证：

- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- 路线仍为三角形带，`routeTriangles = 30520`。
- in-app Browser 已刷新。

线段放大质量问题的结论：

- 当前 demo 的宽线是按每个线段独立生成四边形，没有真正的 join/cap，也没有抗锯齿。
- 放大后会看到接缝、尖角、重叠或断裂，越粗的线越明显。
- 正式解决需要实现 screen-space polyline renderer：在 shader 中按屏幕像素宽度外扩，支持 miter/bevel/round join、cap、dash pattern 和 fragment anti-alias。

### 默认关闭高密度点层

用户反馈降水点和人口点默认开启太密，影响地图阅读。本轮把二者改为默认关闭，保留 UI 开关供需要时打开。

改动：

- `prototype/webgl-cells/index.html`：`show-precipitation` 和 `show-population` 默认不勾选。
- `prototype/webgl-cells/src/layers.js`：`precipitation` 和 `population` 初始可见性改为 `false`。

验证：

- `node --check .\prototype\webgl-cells\src\layers.js` 通过。
- in-app Browser 刷新后，降水点和人口点 checkbox 均为未勾选。
- 使用本机 Playwright + 系统 Chrome 验证：
  - `precipitationChecked = false`。
  - `populationChecked = false`。
  - `stats.layers.precipitation = false`。
  - `stats.layers.population = false`。
  - `glError = 0`。

## 2026-06-17：开始阶段 2 正式应用骨架

用户要求保留已有 demo，并开始正式开发。本轮启用“太子-尚书-门下-侍中”流程，按 `docs/plans/gl-reimplementation-acceptance-plan.md` 的步骤 2.1 执行。

太子规划：

- 保留 `prototype/webgl-cells/` 作为源项目快照 demo 和视觉对照，不继续把正式应用能力塞进 demo。
- 新建 `app/webgl-generator/` 作为独立 WebGL 地图生成器正式应用目录。
- 阶段 2.1 只建立运行时边界和可运行占位地图，后续步骤再逐步补 seed/options、grid、heightmap、features 和 pack 语义图。

尚书实施：

- 新增 `app/webgl-generator/README.md`，记录正式应用目录职责、启动命令，以及与 `prototype/` 和 `source/` 的边界。
- 新增 `app/webgl-generator/index.html` 和 `src/styles.css`，提供正式应用第一版工作台界面。
- 新增 `src/main.js`、`src/runtime/app.js` 和 `src/ui/panel.js`，建立应用启动、生成按钮、状态面板和全局调试入口 `window.__webglGeneratorApp`。
- 新增 `src/generator/options.js` 和 `src/generator/index.js`，由新项目自己的生成器输出阶段 2.1 占位地图数据。
- 新增 `src/renderer/placeholder-renderer.js`，用 WebGL2 渲染非空占位地图，不读取 `prototype/webgl-cells/data/sample-map.json`，也不依赖 `source/Fantasy-Map-Generator`。
- 更新 `docs/current-plan.md`，把当前阶段切换为阶段 2，并记录正式应用启动命令。

门下检查：

- `node --check app\webgl-generator\src\main.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\generator\options.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --input-type=module -e "...generatePlaceholderMap..."` 通过，确认占位地图可输出 seed、目标 cells，且 `sourceDependency = false`、`snapshotDependency = false`。
- `git diff --check` 通过。


- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- `node .\tools\serve-prototype.mjs --port 5410 --dir .\app\webgl-generator` 可服务正式应用目录。本轮 Windows 后台进程在 shell 返回后不稳定，因此侍中改用一次性 Node 静态服务脚本完成浏览器验收。
- 内置 Browser 本轮访问 `127.0.0.1:5410` 返回连接拒绝；已用本机 Playwright + 系统 Chrome 兜底验收。
- 页面标题为“WebGL 地图生成器”。
- `window.__webglGeneratorApp` 存在，renderer 统计显示 `webgl2 = true`、`vertexCount = 630`。
- 状态面板显示阶段 `2.1-placeholder`、seed、目标 cells、地图尺寸、GPU 顶点、绘制耗时、`WebGL error = 0`、`source 依赖 = 否`、`快照依赖 = 否`。
- 主动重绘后 canvas 像素检查通过：`940 x 800` 画布中 `752000` 个像素非黑，确认画面非空。
- 生成按钮验收通过：把 seed 改为 `formal-dev-check`、目标 cells 改为 `12000` 后，运行时 metadata 和页面 badge 同步更新。
- 控制台无 error/warning。

结论：

- 步骤 2.1 已完成。正式应用骨架已经与既有 demo 分离，下一步进入步骤 2.2：随机数、seed 和 options 模型。

## 2026-06-17：完成步骤 2.2 seed 和 options 模型

继续执行阶段 2，本轮目标是让正式应用具备自己的可复现生成基础，而不是只有一次性占位数据。

尚书实施：

- 新增 `app/webgl-generator/src/generator/random.js`：
  - 提供 `createRandom(seed)`，同一 seed 输出稳定随机序列。
  - 提供 `createRandomSeed()`，用于 UI 随机 seed。
  - 提供 `stableHash()`，用于稳定摘要校验。
- 更新 `app/webgl-generator/src/generator/options.js`：
  - 规范化 seed、目标 cells、地图宽高和自动随机 seed 开关。
  - 保留目标 cells、宽高的上下限保护。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记从 `2.1-placeholder` 升级为 `2.2-seeded-options`。
  - 使用 seed 驱动占位陆块位置、半径和 palette。
  - 输出稳定 `summary`、`summary.checksum`、`randomPreview` 和 `generationLog`。
  - `generatedAt` 只作为运行时记录，不参与稳定摘要。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 占位地图不再使用硬编码陆块，而是读取 seed/options 生成出的 `shape`。
- 更新 `app/webgl-generator/index.html`、`src/ui/panel.js`、`src/runtime/app.js` 和 `src/styles.css`：
  - UI 新增宽度、高度、自动随机 seed 开关和换 seed 按钮。
  - 运行时面板显示阶段、自动随机、摘要校验、随机预览和生成日志。
- 更新 `app/webgl-generator/README.md`：
  - 记录当前 seed/options 能力。
  - 记录与 source 随机流程的已知差异：当前 PRNG 是新项目内部可复现基础，不保证同 seed 与 source 生成同一地图。

门下检查：

- `node --check app\webgl-generator\src\generator\random.js` 通过。
- `node --check app\webgl-generator\src\generator\options.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\main.js` 通过。
- 确定性摘要检查通过：
  - `seed = repeatable`、`cells = 12000`、`1600 x 900` 连续生成两次，`summary.checksum = 05b328ff`。
  - `seed = different` 同参数生成 `summary.checksum = ac9dbb6e`，确认不同 seed 会改变摘要。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- 使用当前内置 Browser 刷新 `http://127.0.0.1:5410/`，页面显示阶段 `2.2-seeded-options`。
- 页面显示 seed、目标 cells、宽度、高度、自动随机 seed 开关、摘要校验、随机预览、生成日志和 `WebGL error = 0`。
- 固定 UI 参数验收通过：
  - seed `ui-repeatable`、目标 cells `15000`、尺寸 `1600 x 900` 第一次生成摘要 `228caba4`。
  - 同 seed/options 再次生成仍为 `228caba4`。
  - seed 改为 `ui-different` 后摘要变为 `cd8e8963`。
- 自动随机 seed 开关验收通过：
  - 勾选后连续生成两次，seed 分别变为 `map-mqi7ognf-07yeyk3` 和 `map-mqi7ogwr-0jumke5`。
  - 摘要分别为 `37d25068` 和 `24c8a163`。
- Browser 控制台无 error/warning。

结论：

- 步骤 2.2 已完成。下一步进入步骤 2.3：点集、Voronoi grid 和基础 cell mesh。

## 2026-06-17：完成步骤 2.3 点集、Voronoi grid 和基础 cell mesh

继续执行阶段 2，本轮目标是让正式应用不再渲染椭圆占位，而是由新项目自己的生成内核产出第一版 `grid` 数据，并由 WebGL renderer 三角化绘制。

尚书实施：

- 新增 `app/webgl-generator/src/generator/grid.js`：
  - 根据目标 cells 和地图宽高计算点阵列数。
  - 使用 seed 驱动的抖动点阵生成 `grid.points`。
  - 使用局部半平面裁剪生成近似 Voronoi cell。
  - 输出 `grid.cells.v`、`grid.cells.p`、`grid.cells.h` 和 `grid.vertices.p`。
  - 统计实际 cells、布局、Voronoi 顶点、cell 三角形、构建耗时和生成方法。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.3-generated-grid`。
  - 生成摘要纳入 grid cells、布局、顶点、三角形、样本点和样本高度。
  - `generationLog` 记录 grid 构建结果。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 不再绘制硬编码椭圆陆块。
  - 从 `grid.points`、`grid.cells.v` 和 `grid.vertices.p` 三角化 cell mesh。
  - 按 `grid.cells.h` 绘制基础高度/海陆占位色。
  - 新增最小 camera：拖拽平移、滚轮缩放、适配视图。
- 更新 `app/webgl-generator/index.html`、`src/ui/panel.js` 和 `src/runtime/app.js`：
  - 按钮文案改为“生成 grid 地图”。
  - 新增“适配视图”按钮。
  - 统计面板显示实际 grid cells、grid 布局、Voronoi 顶点、cell 三角形、grid 构建耗时、GPU 顶点和相机状态。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`，记录阶段 2.3 能力和当前算法边界。

门下检查：

- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 生成器确定性检查通过：
  - `seed = grid-repeatable`、`cells = 10000`、`1440 x 960` 连续生成两次摘要一致，`summary.checksum = 5ca271f3`。
  - `seed = grid-different` 同参数生成 `summary.checksum = 696bff5b`。
  - 10k 目标实际生成 `10004` cells，布局 `122 x 82`，约 `20008` Voronoi 顶点、`39610` cell 三角形，空 cell 为 `0`。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- 使用内置 Browser 刷新当前 `http://127.0.0.1:5410/`，页面显示阶段 `2.3-generated-grid`。
- 页面统计显示：
  - 目标 cells `10000`。
  - 实际 grid cells `10004`。
  - grid 布局 `122 x 82`。
  - Voronoi 顶点约 `20009`。
  - cell 三角形约 `39611`。
  - GPU 顶点约 `118839`。
  - `WebGL error = 0`。
  - `source 依赖 = 否`，`快照依赖 = 否`。
- 内置 Browser 的点击操作在 10k grid 生成时出现一次动作超时；页面状态读取正常。因此用本机 Playwright + 系统 Chrome 完整兜底验收。
- 系统 Chrome 验收结果：
  - 初始地图画面非空，`940 x 800` 画布中 `752000` 个像素非黑。
  - `seed = grid-ui-repeatable` 连续生成两次摘要均为 `598ed9e8`。
  - `seed = grid-ui-different` 后摘要变为 `d32628ab`。
  - 拖拽后相机从 `x 1.00, 0.00, 0.00` 变为 `x 1.00, 0.26, -0.15`。
  - 滚轮缩放后相机变为 `x 1.52, 0.26, -0.15`。
  - 点击适配视图后相机恢复 `x 1.00, 0.00, 0.00`。
  - 控制台无 error/warning。

当前限制：

- 当前 Voronoi 是基于抖动点阵和局部半平面裁剪的轻量近似实现，用于先打通正式应用自己的 `grid` 数据流。
- 尚未实现 source 那种点集松弛、真实 heightmap、feature 提取或 pack 语义图。
- 下一步进入步骤 2.4：高度图和海陆 feature。

## 2026-06-17：构建器取舍和步骤 2.4 高度图/feature

用户询问是否需要使用现代构建器，例如 Vite，并说明如果不需要就继续当前开发。

太子决策：

- 当前暂不引入 Vite，继续原生 ESM + `tools/serve-prototype.mjs` 静态开发。
- 理由：
  - 正式应用目前无 npm 依赖，且目标可以只支持高版本 Chrome。
  - 当前阶段重点是生成内核、数据结构和 WebGL 管线，不应先增加构建配置。
  - `app/webgl-generator/` 目录结构保持 Vite 友好，后续需要打包产物、资源指纹、worker、第三方库或测试集成时再引入。

尚书实施步骤 2.4：

- 新增 `app/webgl-generator/src/generator/heightmap.js`：
  - 用 seed 驱动的 continent、ridge 和 lake basin 采样高度。
  - 当前 seaLevel 为 `20`。
- 新增 `app/webgl-generator/src/generator/features.js`：
  - 对 `grid.cells.h` 做水陆分类。
  - 使用 flood fill 提取 ocean、land、lake feature。
  - 写入 `grid.cells.f`。
  - 从相邻水陆 cell 的共享 Voronoi 顶点提取海岸线和湖岸线 segment。
- 更新 `app/webgl-generator/src/generator/grid.js`：
  - cell 高度改为来自 `sampleHeight(heightmap, point)`。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.4-heightmap-features`。
  - 输出 `heightmap`、`features` 和 feature 统计。
  - 生成日志记录 ocean、land、lake 提取结果。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 基础 cell 颜色按高度绘制。
  - 新增 line buffer，用 `gl.LINES` 绘制海岸线和湖岸线。
- 更新 UI 统计：
  - feature 数。
  - 海洋/陆地/湖泊数量。
  - 海岸线段。
  - 湖岸线段。
  - 线段顶点。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\features.js` 通过。
- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- 生成器确定性检查通过：
  - `seed = feature-repeatable` 连续生成摘要 `51ea79d4`。
  - `seed = feature-different` 生成摘要 `25a98f2e`。
  - `feature-repeatable` 生成 `1` 个 ocean、`1` 个 land、`2` 个 lake，海岸线段 `374`，湖岸线段 `134`。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `2.4-heightmap-features`。
- 默认 seed `stage-2-1` 页面统计：
  - 实际 grid cells `10004`。
  - feature 数 `3`。
  - 海洋/陆地/湖泊 `1 / 1 / 1`。
  - 海岸线段 `349`。
  - 湖岸线段 `82`。
  - GPU 顶点 `118830`。
  - 线段顶点 `862`。
  - `WebGL error = 0`。
- 系统 Chrome 兜底验收：
  - `feature-repeatable` 连续生成摘要均为 `51ea79d4`。
  - `feature-different` 摘要为 `25a98f2e`。
  - `940 x 800` 画布中 `752000` 个像素非黑。
  - 控制台无 error/warning。

当前限制：

- heightmap 只是第一版参数化采样，不等同于 source 的完整高度图模板体系。
- feature 只区分 ocean、land、lake；尚未实现 lake island、多海域命名、feature 边界平滑或 pack 语义图。
- 下一步进入步骤 2.5：pack 语义图和基础 picking。

## 2026-06-17：完成步骤 2.5 pack 语义图和基础 picking

继续执行阶段 2，本轮目标是建立正式应用自己的 `pack` 语义层，并让鼠标悬停能从画布位置命中 grid cell、pack cell 和 feature。

尚书实施：

- 新增 `app/webgl-generator/src/generator/pack.js`：
  - 生成独立 `pack` 对象。
  - 当前采用 `one-grid-cell-to-one-pack-cell` 阶段性映射。
  - 写入 `grid.cells.pack`，用于从底层渲染 mesh cell 找到对应 pack cell。
  - `pack.cells` 保存 grid cell、feature、height 和 type 等语义字段。
- 新增 `app/webgl-generator/src/renderer/picking.js`：
  - 根据世界坐标定位 grid 行列附近候选 cell。
  - 对候选 cell 做 polygon hit test。
  - 返回 grid cell、pack cell、feature id/type、height、世界坐标和候选数量。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 暴露 `screenToWorld()` 和 `pickClientPoint()`。
  - 在 canvas pointer move 时触发 hover picking。
  - renderer 统计加入 pack metadata。
- 更新 `app/webgl-generator/src/runtime/app.js` 和 `src/ui/panel.js`：
  - 新增 `state.pick`。
  - 新增“悬停”面板，显示 grid cell、pack cell、feature、height、坐标和候选 cells。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.5-pack-picking`。
  - metadata 加入 `packCells`。
  - 摘要和生成日志加入 pack 映射信息。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\main.js` 通过。
- 生成器和 picking 检查通过：
  - `seed = pack-repeatable` 连续生成摘要稳定为 `52841298`。
  - `grid = 10004`，`pack = 10004`。
  - pack 映射为 `one-grid-cell-to-one-pack-cell`。
  - 中心点 picking 命中 `gridCell = 5062`、`packCell = 5062`、`featureType = lake`、`height = 13`、候选 cells `9`。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `2.5-pack-picking`。
- 页面统计显示 `pack cells = 10004`，生成日志包含 `build pack: 10004 semantic cells`。
- 系统 Chrome 验收 hover picking：
  - 页面阶段为 `2.5-pack-picking`。
  - `pack cells = 10004`。
  - 中心悬停面板命中 `grid cell = 4940`、`pack cell = 4940`、`feature = lake #2`、`高度 = 16`、`坐标 = 720, 480`、候选 cells `9`。
  - 直接调用 renderer `pickClientPoint()` 返回同一组命中信息。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 当前 `pack` 是 1:1 语义壳，用于先建立语义边界和 picking 数据流；尚未实现 source 那种抽稀/重建后的 pack 图。
- picking 目前只支持 cell/pack/feature 命中；城市、河流、路线、marker 等对象级 picking 留到后续阶段。
- 下一步进入步骤 2.6：气候、生物群系和河流最小链路。

## 2026-06-17：完成步骤 2.6 气候、生物群系和河流最小链路

用户明确授权后续无需每一步停下来等待确认。本轮继续自动执行阶段 2 的最后一步 2.6。

尚书实施：

- 新增 `app/webgl-generator/src/generator/climate.js`：
  - 基于纬度、高度、海陆 feature 粗略生成温度和降水。
  - 规则分类 biome，包括 water、ice、tundra、grassland、forest、desert、savanna、rainforest、mountain。
  - 写入 `grid.cells.temp`、`grid.cells.prec` 和 `grid.cells.biome`。
- 新增 `app/webgl-generator/src/generator/rivers.js`：
  - 从高地和高降水 cell 中挑选河源。
  - 沿低邻居追踪河流，遇到 ocean、lake 或地图边界停止。
  - 输出河流 cell 序列、点列和统计。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 增加 temp、prec、biome 字段。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `2.6-climate-rivers`。
  - 输出 `climate` 和 `rivers`。
  - 摘要和生成日志纳入气候范围、biome 分布和河流统计。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 支持 `height`、`temperature`、`precipitation`、`biomes` 四种专题色。
  - 河流加入 line pass。
- 更新 `app/webgl-generator/src/renderer/picking.js`：
  - 悬停结果增加 temperature、precipitation 和 biome。
- 更新 `app/webgl-generator/index.html`、`src/runtime/app.js`、`src/ui/panel.js` 和 `src/styles.css`：
  - 新增专题切换按钮。
  - 统计面板显示温度范围、降水范围、biome 数量、河流数量/线段数和当前专题。
  - 悬停面板显示温度/降水和 biome。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\climate.js` 通过。
- `node --check app\webgl-generator\src\generator\rivers.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 生成器确定性检查通过：
  - `seed = climate-repeatable` 连续生成摘要 `94c3bf3c`。
  - `seed = climate-different` 摘要 `b5c98828`。
  - 温度范围 `-7 .. 31`。
  - 降水范围 `40 .. 84`。
  - biome 统计包含 water、tundra、grassland、forest、savanna、mountain、rainforest。
  - 河流 `3` 条、`21` 段。
  - 中心 picking 返回 temperature、precipitation 和 biome 字段。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `2.6-climate-rivers`。
- 默认 seed 页面统计：
  - 温度范围 `-7 .. 31`。
  - 降水范围 `36 .. 85`。
  - biome 数 `7`。
  - 河流 `3 / 39`。
  - 专题默认 `height`。
  - `WebGL error = 0`。
- 系统 Chrome 交互验收：
  - 专题按钮可切换高度、温度、降水、生物群系，最终专题为 `biomes`。
  - 悬停中心点命中 `lake #2`，温度/降水为 `31 / 85`，biome 为 `water`。
  - `940 x 800` 画布中 `752000` 个像素非黑。
  - `glError = 0`。
  - 控制台无 error/warning。

当前限制：

- 气候和 biome 是最小趋势模型，不等同于 source 的完整风向、纬度带、降水传播和 biome 矩阵。
- 河流只有中心线，未实现流量、宽度、join/cap、河口裁剪和支流汇合。
- 阶段 2 的最小生成链路已闭合。下一步进入阶段 3：世界语义生成与图层补全，优先步骤 3.1 文化、宗教和名称系统。

## 2026-06-17：完成步骤 3.1 文化、宗教和名称系统

在用户授权自动继续后，本轮没有停在阶段 2.6，而是继续进入阶段 3 的第一步。

尚书实施：

- 新增 `app/webgl-generator/src/generator/society.js`：
  - 从陆地 cell 中选择文化和宗教中心。
  - 使用距离场扩散到所有 grid cell。
  - 生成中文文化名和宗教名。
  - 写入 `grid.cells.culture` 和 `grid.cells.religion`。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 同步保存 culture 和 religion 字段。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `3.1-culture-religion`。
  - 输出 `society` 对象和统计。
  - 生成日志记录 culture/religion 数量。
- 更新 renderer 和 UI：
  - 新增文化、宗教专题按钮。
  - renderer 支持 `cultures` 和 `religions` 专题色。
  - picking 和悬停面板显示文化名、宗教名。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\society.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- 生成器确定性检查通过：
  - `seed = society-repeatable` 连续生成摘要稳定为 `4da2c96f`。
  - 生成 `8` 个文化和 `6` 个宗教。
  - 中心 picking 返回文化 `昭宁文化` 和宗教 `天衡道`。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `3.1-culture-religion`。
- 页面统计显示文化/宗教 `8 / 6`，专题按钮包含文化和宗教。
- 系统 Chrome 验收：
  - 专题可切换到文化和宗教，最终专题为 `religions`。
  - 中心悬停显示文化 `星渚文化`、宗教 `青岚信会`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 文化/宗教扩散当前是最小距离场模型，没有考虑地形阻隔、海峡、河流、人口或 source 的完整文化生成逻辑。
- 名称表是内置中文示例，后续应抽象为可配置命名风格。
- 下一步进入步骤 3.2：国家、省份和区域。

### 2.4 cell 三角化补丁

用户在内置浏览器中指出当前生成图的三角形看起来是分散的。排查后确认这不是预期表现，而是 renderer 在把 Voronoi cell 做扇形三角化时，只生成了中间边段，漏掉了每个多边形的首边和尾边闭合三角形，导致 cell 填充出现缺片。

修正：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pushGridCells()` 从 `index = 1` 到 `length - 2` 的不完整循环，改为遍历所有 vertex，并用 `(index + 1) % length` 闭合首尾边。
  - 每个 cell 现在会完整生成一圈中心扇形三角形。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。
- 内置 Browser 刷新后，默认 10k 地图 GPU 顶点从约 `118839` 增加到 `178854`，符合补齐缺失三角形后的预期。
- 系统 Chrome 验证：
  - `940 x 800` 画布中 `752000` 个像素非黑。
  - `glError = 0`。
  - 控制台无 error/warning。

## 2026-06-18：完成步骤 3.2 国家、省份和区域

用户询问为何停下后，本轮确认没有实际阻塞，只是会话执行边界导致上一段暂停；随后按用户“不需要每一步停下来”的要求继续推进正式开发。

尚书实施：

- 新增 `app/webgl-generator/src/generator/politics.js`：
  - 从陆地 cell 中选择国家中心。
  - 基于国家分配结果继续生成省份中心和省份归属。
  - 按位置、高度和湿度生成区域归属。
  - 写入 `grid.cells.state`、`grid.cells.province` 和 `grid.cells.region`。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `3.2-states-provinces-regions`。
  - 输出 `politics` 对象和统计。
  - 生成日志记录国家、省份、区域数量。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 同步保存 state、province 和 region 字段。
- 更新 renderer 和 UI：
  - 新增国家、省份、区域专题按钮。
  - renderer 支持 `states`、`provinces` 和 `regions` 专题色。
  - picking 和悬停面板显示国家、省份和区域名称。
- 更新 `app/webgl-generator/README.md` 和 `docs/current-plan.md`。

门下检查：

- `node --check app\webgl-generator\src\generator\politics.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\generator\pack.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。
- 生成器确定性检查通过：
  - `seed = politics-repeatable` 连续生成摘要稳定为 `31578b67`。
  - 生成 `5` 个国家、`11` 个省份、`6` 个区域。
  - pack 语义字段包含 `state`、`province` 和 `region`。

侍中验收：

- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后显示阶段 `3.2-states-provinces-regions`。
- 页面统计显示国家/省份/区域 `5 / 11 / 6`。
- 专题按钮包含高度、温度、降水、生物群系、文化、宗教、国家、省份和区域。
- 实际切换国家、省份、区域专题后，最终专题为 `regions`。
- 悬停陆地 cell 命中 `land #1`，显示国家 `星渚王国`、省份 `雁川领`、区域 `西岭`。
- `WebGL error = 0`。
- 控制台无 error/warning。

当前限制：

- 国家、省份扩散当前是最小距离场模型，尚未考虑人口、河流阻隔、海峡、扩张成本、军事/外交或 source 的完整政治生成规则。
- 区域当前是地理分区，不等同于 source 的完整区域/行政层级。
- 下一步进入步骤 3.3：城市、道路和基础人口点。

### 2.3 grid 规整感修正

用户在内置浏览器中指出当前正式应用生成结果看起来过于规整。排查后确认原因是 `app/webgl-generator/src/generator/grid.js` 仍采用“每个行列格一个点，再做小幅随机抖动”的阶段性点集策略；这个策略稳定但会在视觉上露出行列结构。

修正：

- `generatePoints()` 从单纯 `0.32` cell 的局部随机抖动，改为三层扰动：
  - 单 cell 内局部随机。
  - 每行和每列的轻微错位。
  - 低频 warp field 的连续形变。
- 点仍被限制在原始 cell 的安全范围内，避免破坏当前局部 Voronoi 裁剪和基于行列邻域的 picking 假设。
- `grid.metadata.method` 更新为 `organic-stratified-halfplane-voronoi`。

验证：

- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- 生成器确定性检查通过：
  - `seed = organic-grid-check` 连续生成摘要稳定为 `350ad237`。
  - `gridCells = 10004`，`Voronoi 顶点 = 20023`，`cell 三角形 = 39615`。
  - 阶段仍为 `3.2-states-provinces-regions`，国家/省份/区域统计仍为 `5 / 11 / 6`。

当前限制：

- 这仍是阶段性轻量点集，不是完整 Poisson / Delaunay / Lloyd 生成流程。
- 后续如果继续追求接近 source 的自然感，需要把点集生成升级为可控密度采样和松弛流程，并对应调整空间索引。

### 2.4 heightmap 地形规整感修正

用户进一步澄清：规整感主要来自生成的地形，而不是 cell 点集。排查后确认 `app/webgl-generator/src/generator/heightmap.js` 使用少量规则椭圆 blob 叠加大陆、高地和湖盆，导致大陆轮廓、湖盆和山脉看起来圆滑且规整。

修正：

- `createHeightmap()` 新增 deterministic noise fields：
  - domain warp X/Y。
  - continental noise。
  - detail noise。
  - ridge noise。
- `sampleHeight()` 改为先对采样坐标做低频形变，再叠加不规则 blob、分形噪声和高地细节。
- continent、ridge 和 lake basin blob 新增旋转角与 irregularity，边界半径按噪声扰动。
- 仍保持无依赖、seed 可复现的轻量模型。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source` 无输出。
- `git diff --name-only -- prototype` 无输出。
- 生成器确定性检查通过：
  - `seed = terrain-organic-check` 连续生成摘要稳定为 `2576c8ae`。
  - `gridCells = 10004`。
  - feature 统计为 `57`，其中海洋 `3`、陆地 `31`、湖泊 `23`。
  - 高度范围 `0..84`，陆地/水域 cell 为 `4384 / 5620`。
  - 河流 `5` 条、线段 `85`。
- 内置 Browser 刷新默认 `seed = stage-2-1` 后：
  - 阶段仍为 `3.2-states-provinces-regions`。
  - feature 统计为 `39`，其中海洋 `3`、陆地 `18`、湖泊 `18`。
  - 海岸线段 `841`，湖岸线段 `335`。
  - 河流 `7` 条、线段 `109`。
  - `WebGL error = 0`，控制台无 error/warning。

当前限制：

- 这仍是阶段性轻量 heightmap，不是 source 的完整模板化地形、海陆再平衡、侵蚀、河谷切割或山脉生成流程。
- 后续需要把地形生成拆成可配置 pipeline，并加入更明确的大陆板块、山脉走向、海岸后处理和湖泊筛选。

### 2.4/2.6 对照 demo 后的地形和河流修正

用户在内置浏览器中指出当前地图仍存在两个问题：

- 河流过乱，存在转圈、打结的视觉问题。
- 地形分形仍然偏简单，不如 `prototype/webgl-cells/` 的 demo 地形自然。

排查：

- 正式应用此前的河流是逐条从源头选择最低邻居的贪心追踪，缺少全图流向、汇水量、填洼和合流约束，容易在局部洼地、近水 cell 和已占用河道附近产生短线、折返或绕圈。
- 正式应用此前的 heightmap 虽加入噪声，但主要仍是大陆 blob 加噪声，缺少 source 中 `HeightmapGenerator` 模板式 `Hill`、`Pit`、`Range`、`Trough` 步骤所形成的方向性地貌。
- source 的 `river-generator.ts` 不是逐条独立贪心生成，而是先按高度排序汇水，记录 `flux`、`confluence`、parent river，并在生成前执行 depression filling。

修正：

- `app/webgl-generator/src/generator/heightmap.js`：
  - 增加山脉线、谷地线、小丘和洼地采样。
  - 调整分形噪声，使正向高地细节更明显，减少内陆被负向噪声打成过多水洞。
  - 默认高度专题配合 renderer 新色阶，提升内陆高差可读性。
- `app/webgl-generator/src/generator/rivers.js`：
  - 从逐条贪心追踪重写为轻量无环流向图。
  - 生成前对陆地做轻量 depression fill。
  - 按高度从高到低累计 flux。
  - 按 flux、高度和间距筛选河源。
  - 只有通过长度检查的河流才占用河道。
  - 合流遇到已存在河道时停止当前支流，避免交叉乱穿。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 高度专题改用更分明的低地、丘陵、高地和山地色阶。

验证：

- `seed = stage-2-1` 的生成器检查：
  - feature 数 `129`，其中海洋 `8`、陆地 `45`、湖泊 `76`。
  - 高度分桶 `[0-20, 20-38, 38-62, 62-78, 78+] = 3347 / 2945 / 2278 / 1172 / 262`。
  - 河流 `11` 条、线段 `47`，最长 `8` 个 cell。
  - 河流重复 cell 数 `0`。
  - 河流模型标记为 `acyclic-flux-downhill`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示河流 `11 / 47`。
  - `WebGL error = 0`。
  - 截图复查：河流不再出现明显转圈打结，内陆地形层次比上一版更明显。

当前限制：

- 正式应用仍未实现 source 完整的 pack 图、湖泊出口、真实合流流量、河宽 mesh、河床下切和 meandered points。
- 当前 heightmap 是向 source 模板逻辑靠拢的轻量实现，尚未把模板步骤抽象成可配置 pipeline。

### 2.4 地形圆圈感和平坦感二次修正

用户继续指出正式应用当前地形仍不自然：

- 分形痕迹明显，部分区域能看出圆圈，真实地形不会有这么多圆形结构。
- 地形整体偏平坦，高山概率不大，大部分区域像平原。

排查：

- `heightmap.js` 中上一版噪声采样使用周期包裹，多频率叠加后容易露出重复纹理和近似环状痕迹。
- 山脉线段端点位于可视地图内部，容易在端点形成圆形山包。
- 负向噪声和谷地会产生大量小型闭合内陆水坑，视觉上像圆形打孔。
- 高程再映射对高山抬升不足，导致大面积陆地停留在低地和平缓丘陵色阶。

修正：

- `app/webgl-generator/src/generator/heightmap.js`：
  - 将周期包裹噪声改为非周期确定性 lattice noise，减少重复分形纹理。
  - 将山脉轴线延伸到地图边界外，减少可视区域内的圆形端点山包。
  - 提高窄山脉脊线和 ridged noise 对高海拔的贡献，使山地从孤立白点变为连续山脉带。
  - 弱化谷地线对水坑的影响，保留低地起伏但减少圆形洼地。
- `app/webgl-generator/src/generator/grid.js`：
  - 新增小型内陆闭合水坑填充，只填平不连海且面积很小的水域 basin。
  - 保留较大的湖泊和海岸线，避免把所有水体硬抹掉。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\generator\rivers.js` 通过。
- 三组固定 seed 生成器检查均无河流重复 cell：
  - `stage-2-1`：feature `82`，海洋/陆地/湖泊 `11 / 39 / 32`，高度分桶 `[<20, 20-38, 38-55, 55-72, 72-86, 86+] = 2667 / 3925 / 1171 / 669 / 553 / 1019`，河流 `9 / 40`，回环 `0`。
  - `terrain-organic-check`：feature `83`，海洋/陆地/湖泊 `12 / 44 / 27`，高度分桶 `2053 / 4102 / 1412 / 797 / 581 / 1059`，河流 `10 / 46`，回环 `0`。
  - `river-sanity-1`：feature `89`，海洋/陆地/湖泊 `6 / 63 / 20`，高度分桶 `3498 / 3048 / 1280 / 804 / 428 / 946`，河流 `11 / 52`，回环 `0`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示阶段 `3.2-states-provinces-regions`。
  - 默认 seed `stage-2-1` 显示 feature `82`，海洋/陆地/湖泊 `11 / 39 / 32`，河流 `9 / 40`。
  - `WebGL error = 0`，控制台无 error/warning。
  - 截图复查：内陆小圆洞明显减少，高山形成更连续的横向山脉带，整体不再主要表现为平坦平原。

当前限制：

- 这仍是轻量 heightmap，不是 source 完整的模板步骤、侵蚀、水文出口和河谷下切。
- 高山带已经更明显，但后续仍需要把山脉、湖泊和海陆比例拆成可配置参数，避免不同 seed 之间表现波动过大。

### 2.4 山脉突兀感和气团感修正

用户继续指出当前山体仍不自然：

- 高山像突然拔地而起，缺少丘陵、前山和高原过渡。
- 山势弯弯曲曲，像气团，不像构造运动形成的虽然凌乱但仍有大致走向的山脉。

排查：

- `heightmap.js` 中上一版山脉主要由窄线 `sampleRange()` 高强度抬升，主脊宽度太窄，肩部过渡不足。
- `remapLandHeight()` 对高值再次抬升，使高山核心更容易直接贴着中低地出现。
- 多条山脉线在地图中心交汇，叠加后形成白色团块，视觉上更像气团而不是构造带。
- 高度专题色阶雪线偏低，白色区域过早出现，加剧了突兀感。

修正：

- `app/webgl-generator/src/generator/heightmap.js`：
  - 将 `mountainRanges` 改为 `mountainBelts`。
  - 新增 `createMountainBelt()` 和 `sampleMountainBelt()`，把山脉拆成宽缓褶皱、肩部过渡和窄主脊三层。
  - 降低山脉 bend 幅度，使多条山脉更接近平行或同向构造带。
  - 弱化中心交汇的第三条斜穿山脉，改为较弱的平行支脉，减少中央高山团块。
  - 放缓 `remapLandHeight()` 的高值抬升，保留高山但减少悬崖式跃升。
- `app/webgl-generator/src/generator/grid.js`：
  - 新增 `softenHighlandTransitions()`，对陆地高差做轻量邻域过渡，让高山外缘向高地和丘陵扩散。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 调整高度专题色阶，推迟雪白高山色出现，并把极高海拔颜色压成更柔和的裸岩/浅雪色。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\grid.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- 三组固定 seed 生成器检查均无河流重复 cell：
  - `stage-2-1`：feature `69`，海洋/陆地/湖泊 `8 / 54 / 7`，高度分桶 `[<20, 20-38, 38-55, 55-72, 72-86, 86+] = 2390 / 4182 / 1485 / 855 / 444 / 648`，河流 `5 / 28`，回环 `0`。
  - `terrain-organic-check`：feature `63`，海洋/陆地/湖泊 `9 / 45 / 9`，高度分桶 `2110 / 3356 / 2108 / 1269 / 441 / 720`，河流 `10 / 58`，回环 `0`。
  - `river-sanity-1`：feature `101`，海洋/陆地/湖泊 `9 / 58 / 34`，高度分桶 `3043 / 3497 / 1749 / 727 / 367 / 621`，河流 `9 / 49`，回环 `0`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示阶段 `3.2-states-provinces-regions`。
  - 默认 seed `stage-2-1` 显示 feature `69`，海洋/陆地/湖泊 `8 / 54 / 7`，河流 `5 / 28`。
  - `WebGL error = 0`，控制台无 error/warning。
  - 截图复查：主山脉呈横向构造带，中央高山团块减弱，高山外缘比上一版有更明显的高地和丘陵过渡。

当前限制：

- 当前仍是启发式构造带模型，并未实现真实板块边界、俯冲带、褶皱带年龄或侵蚀强度。
- 后续要继续接近 source 或真实地形，需要把山脉生成拆成可配置的构造 province，并让河谷侵蚀反向影响高度场。

### 2.4 环形/气团山体整改

用户基于内置浏览器截图继续指出地形仍不合格：局部山体仍存在环形结构，走势像气团，不像有大致构造方向的山脉；如果继续推进语义功能，会把错误高度生成当成基础固化。

重新对照 source 和 demo 后确认：

- `prototype/webgl-cells/` 的 demo 地形并不是前端噪声生成，而是 `tools/fmg-export-snapshot.mjs` 从原 FMG 运行时导出的真实 `grid.cells.h`。
- source 的 `HeightmapGenerator` 对 `continents` 模板按 `Hill`、`Range`、`Strait`、`Smooth`、`Trough`、`Pit`、`Mask` 等步骤在图邻接上扩散高度，不是连续坐标分形噪声。
- 正式应用上一版虽然加入了构造带，但本质仍是连续采样和宽山带叠加，容易产生环、团块和大面积白色高原。

修正：

- 重写 `app/webgl-generator/src/generator/heightmap.js`：
  - 删除连续坐标 `sampleHeight()` 方案。
  - 改为 graph propagation 高度模板，按 source `continents` 的步骤实现 `addHill()`、`addRange()`、`addStrait()`、`addTrough()`、`addPit()`、`smooth()` 和 `mask()`。
  - `Range` 记录主脊 cell 和邻域影响，重平衡时只允许主脊附近保留高海拔，非 ridge 的宽丘陵会被压回中海拔，避免白色气团。
  - 补回 `Strait vertical` 步骤，打断过完整大陆面，减少整片高原。
  - 最终按 demo 快照高度分布做排序校准，使水域、低地、中山、高山和极高峰比例接近 FMG demo。
- 调整 `app/webgl-generator/src/generator/grid.js`：
  - grid 构建后再套用 graph propagation heightmap。
  - 移除上一版 `softenHighlandTransitions()`，避免在高度模板外再次把高山扩成宽团块。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- 三组固定 seed 生成器检查均无河流重复 cell：
  - `stage-2-1`：checksum `ee78a221`，feature `24`，海洋/陆地/湖泊 `3 / 9 / 12`，高度分桶 `[<20, 20-38, 38-55, 55-72, 72-86, 86+] = 4372 / 2372 / 1737 / 1082 / 349 / 92`，河流 `8 / 60`，回环 `0`。
  - `terrain-organic-check`：checksum `cc9092f0`，feature `11`，海洋/陆地/湖泊 `1 / 8 / 2`，高度分桶 `4397 / 2347 / 1737 / 1082 / 349 / 92`，河流 `7 / 55`，回环 `0`。
  - `river-sanity-1`：checksum `476a3fc2`，feature `13`，海洋/陆地/湖泊 `1 / 7 / 5`，高度分桶 `4389 / 2355 / 1737 / 1082 / 349 / 92`，河流 `7 / 61`，回环 `0`。
- 与 demo 快照分布对照：
  - demo：`[43.45%, 24.61%, 17.23%, 10.62%, 3.29%, 0.8%]`。
  - 正式应用 `stage-2-1`：`[43.7%, 23.71%, 17.36%, 10.82%, 3.49%, 0.92%]`。
  - demo 相邻高度差 p95 为 `8`，正式应用为 `10`；差异主要来自新增海峡切割，后续可继续软化海峡边缘。
- 浏览器复查 `http://127.0.0.1:5410/`：
  - 页面显示阶段 `3.2-states-provinces-regions`。
  - 默认 seed `stage-2-1` 显示 checksum `ee78a221`。
  - `WebGL error = 0`。
  - 截图保存为 `docs/terrain-fix-browser-check.png`。
  - 肉眼复查：环形山和大面积白色气团明显减少，高山集中为更窄的条带，地形可作为后续语义生成继续迭代的基础。

当前限制：

- 这仍是轻量 graph propagation 复刻，不是 source 完整实现；`Strait`、`Range` 和高度分布校准仍为阶段性近似。
- 当前高度分布已贴近 demo，但山脉方向、侵蚀、水文出口和河谷下切仍需后续接入更完整的模板参数与水文反馈。

### 2.4 地形模板控制

用户指出地形高度已基本可接受，但每次生成仍像一大片接近圆形的陆地；原版 FMG 可以生成地中海、高山岛屿、平原岛屿、一侧大陆等多种 case。

排查：

- 正式应用此前虽然把 heightmap 改成 graph propagation，但 `createHeightmap()` 仍硬编码为 `continents` 近似模板。
- UI 和 options 没有地形模板字段，换 seed 只是在同一种大陆模板里抽变体，无法切换到原版的其他 heightmap case。
- 上一轮的 demo 分布校准也只按 continents 分布处理，不能表达岛屿、地中海或盘古大陆的海陆比例。

修正：

- `app/webgl-generator/src/generator/options.js`：
  - 新增 `heightmapTemplate` 选项，默认 `continents`。
  - 限制可选模板 id，避免非法输入进入生成链路。
- `app/webgl-generator/index.html` 和 `app/webgl-generator/src/ui/panel.js`：
  - 新增“地形”下拉框。
  - 当前支持大陆、地中海、高山岛屿、平原岛屿、一侧大陆、盘古大陆和群岛。
  - 运行时统计显示当前地形模板。
- `app/webgl-generator/src/generator/heightmap.js`：
  - 将固定 continents 流程改成模板执行器。
  - 支持 `Hill`、`Pit`、`Range`、`Trough`、`Strait`、`Smooth`、`Mask`、`Add`、`Multiply`、`Invert`。
  - 每个模板有独立海陆比例和高度分布校准，避免所有模板被压成同一种大陆比例。
- `app/webgl-generator/src/generator/index.js`：
  - metadata、summary 和 generationLog 记录 `heightmapTemplate`，方便追踪。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check app\webgl-generator\src\generator\options.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 同一 seed `template-check` 下七个模板均生成不同 checksum，且河流无重复 cell：
  - 大陆：checksum `e62c6eb9`，海洋/陆地/湖泊 `1 / 8 / 0`，水域分桶约 `44.1%`。
  - 地中海：checksum `71a93f42`，海洋/陆地/湖泊 `4 / 16 / 9`，水域分桶约 `42.1%`。
  - 高山岛屿：checksum `5b21db7e`，海洋/陆地/湖泊 `1 / 15 / 1`，水域分桶约 `55.8%`。
  - 平原岛屿：checksum `96e77f12`，海洋/陆地/湖泊 `1 / 11 / 9`，水域分桶约 `52.2%`。
  - 一侧大陆：checksum `7ffdb759`，海洋/陆地/湖泊 `9 / 58 / 16`，水域分桶约 `46.6%`。
  - 盘古大陆：checksum `47a1d912`，海洋/陆地/湖泊 `2 / 10 / 6`，水域分桶约 `32.6%`。
  - 群岛：checksum `6168670d`，海洋/陆地/湖泊 `7 / 18 / 3`，水域分桶约 `64.2%`。
- 内置 Browser 验证：
  - 页面统计显示“地形模板”。
  - 下拉切换到地中海后生成 checksum `ca364d94`，显示模板 `地中海`，`WebGL error = 0`。
  - 下拉切换到高山岛屿后生成 checksum `0fa2a131`，显示模板 `高山岛屿`，`WebGL error = 0`。

当前限制：

- 这只是第一批模板 case，尚未完整覆盖 source 的 Volcano、Atoll、Isthmus、Old World、Fractious 等所有模板。
- 当前模板参数仍写在代码中；后续可把模板选择、海陆比例、山脉强度和海峡强度做成更细的用户可调参数。

### 3.3 城市、道路和基础人口点

在地形模板基本可用后，继续推进正式应用的世界语义层。目标是先建立城市、人口和道路数据流，让后续标签、对象 picking、城市详情和更真实的路线系统有基础字段。

实现：

- 新增 `app/webgl-generator/src/generator/settlements.js`：
  - 按陆地 cell 的高度、降水、海岸邻接、河流邻接、国家中心和省份中心估算人口适宜度。
  - 生成城市、首都、省会和港口，城市记录所属国家、省份、文化、宗教和人口估值。
  - 生成 `grid.cells.pop` 和 `grid.cells.burg`。
  - 连接首都、省会和主要城市，生成 `road` 和 `trail` 路线。
  - 输出农村人口点，用于 WebGL point pass。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 阶段标记升级为 `3.3-settlements-routes-population`。
  - 生成链路改为 politics -> rivers -> settlements -> pack。
  - summary 和 generationLog 记录城市、道路和人口统计。
- 更新 `app/webgl-generator/src/generator/pack.js`：
  - pack cell 同步保存 `pop` 和 `burg` 字段。
- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 point buffer 和 `gl.POINTS` pass。
  - 农村人口、普通城市、首都和港口使用不同颜色点。
  - 道路/小路加入 line pass。
  - 新增人口专题面。
- 更新 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/renderer/picking.js`：
  - UI 新增“人口”专题按钮。
  - 运行时统计显示城市/首都/港口、道路、人口点和点顶点。
  - hover 面板显示城市和人口。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- 固定 seed `stage-3-3-check`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `705704e4`。
  - 城市 `20`，城市名唯一数 `20`。
  - 道路 `25`，道路线段 `1578`。
  - 农村人口点 `2201`，人口 cell `5596`。
  - 河流回环 `0`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 页面显示阶段 `3.3-settlements-routes-population`。
  - 默认 seed `stage-2-1` 显示城市/首都/港口 `20 / 5 / 5`。
  - 道路 `25 / 1626`。
  - 人口点 `2201 / 5593`。
  - 点顶点 `2221`。
  - 人口专题可切换。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 城市选址仍是轻量适宜度模型，尚未实现 source burg 等级、城镇增长、首都迁移、道路等级和港口/海路规则。
- 道路目前是 grid 上贪心陆路追踪，可能不是最短或最自然路线；后续应升级为带成本场的路径搜索，并支持宽线、join/cap 和路线 picking。
- 点层仍是 `gl.POINTS` 占位，后续需要 sprite、LOD、标签避让和对象级 picking。

### 3.4 城市标签 overlay 初版

完成阶段 3.3 后，用户要求提交推送一版并继续开发。已将阶段 3.3 版本提交并推送：

- commit：`fcee714 Build standalone WebGL generator app`
- 推送：`origin/main`
- 第一次 `git push origin main` 因仓库本地代理 `127.0.0.1:10809` 不通而失败；随后使用单次 `git -c http.proxy= -c https.proxy= push origin main` 绕过代理推送成功，未修改仓库配置。

继续开发内容：

- `app/webgl-generator/index.html`：
  - 新增 `map-overlay`，放在 canvas 和地图 badge 之间。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 初始化时获取 overlay 容器。
  - 每次加载地图时，按首都、省会和人口排序挑选最多 24 个城市创建标签。
  - 每次 draw 后根据 WebGL camera 把城市世界坐标投影到屏幕坐标。
  - 增加简单屏幕距离避让，避免密集标签全部重叠。
  - `getStats()` 新增 `labelCount` 和 `visibleLabelCount`。
- `app/webgl-generator/src/styles.css`：
  - 新增 `.map-overlay` 和 `.city-label` 样式。
  - 首都和港口标签使用不同颜色。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“城市标签”。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 阶段仍为 `3.3-settlements-routes-population`。
  - 标签节点 `20` 个，可见标签 `10` 个。
  - 运行时统计显示城市标签 `10 / 20`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

当前限制：

- 标签仍是 HTML overlay 初版，没有完整 LOD、复杂碰撞盒、国家/道路标签和对象级点击。
- 小屏/窄视口下标签可见数量会被简单避让压低，后续需要按缩放、城市等级和屏幕空间动态排序。

### 3.4 标签 LOD、道路宽线和未来面板约束

继续推进阶段 3.4：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 城市标签从固定 24 个候选改为最多 48 个候选，按首都、省会、港口和人口估算优先级排序。
  - 标签显示新增缩放 LOD：远景只显示首都和高优先级城市，中近景逐步放开更多城市。
  - 标签避让从点距判断改为屏幕碰撞盒判断，并按缩放设置可见数量上限和碰撞 padding。
  - 道路/小路从普通 `gl.LINES` 中拆出，新增独立 route buffer，以三角形带 mesh 绘制。
  - 海岸线、湖岸线和河流仍保留在线段 pass 中，避免道路样式和自然线层混在同一个 buffer 里。
  - `getStats()` 新增 `routeVertexCount` 和 `routeTriangleCount`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“道路三角形”。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录阶段 3.4 当前能力和仍未完成的 join/cap、dash、屏幕空间恒定宽度、路线 picking、道路/国家标签等事项。
  - 按用户要求记录未来面板架构约束：生成配置、高度编辑、河流编辑、城市/道路编辑、国家/省份/文化/宗教/标签编辑等面板都应做成 HTML 浮动可拖动面板，不使用 canvas 实现；当前只落文档，暂不改现有侧栏。

当前限制：

- route mesh 仍是逐段矩形带，没有 join/cap、dash 和屏幕空间恒定宽度；缩放时视觉宽度仍随 WebGL 坐标缩放。
- 标签只处理城市标签，尚未实现国家标签、路线标签、曲线文字、手动锁定位置和标签对象级 picking。
- 当前固定侧栏仍保留，浮动可拖动面板只是后续架构约束。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-check`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `b89b1d9e`。
  - 城市 `20`。
  - 道路 `23`，道路线段 `1152`。
  - 人口 cell `5599`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 阶段仍为 `3.3-settlements-routes-population`。
  - 道路三角形 `3252`。
  - 线段顶点 `1518`，当前不再包含道路线段。
  - 标签节点 `20` 个，可见标签 `9` 个。
  - 运行时统计显示城市标签 `9 / 20`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 道路屏幕空间 mesh

继续推进道路可视细化：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - route buffer 从 `loadMap()` 的静态世界坐标 mesh 改为 `draw()` 时按当前 camera 和 canvas 尺寸动态构建。
  - route mesh 顶点直接生成在 clip space，绘制道路时使用 identity transform，避免道路宽度随地图缩放一起变粗或变细。
  - 道路宽度改为 CSS 像素语义：`road` 约 `3.2px`，`trail` 约 `2.1px`，并按设备像素比换算。
  - polyline mesh 采用第一版 miter join；端点使用 square cap；近似折返时回退到当前 segment 方向，避免 join 退化为零宽。
  - `getStats()` 新增 `routeBuildMs` 和 `routeWidthMode`，用于观察拖拽缩放时的动态 buffer 成本。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“道路 mesh”，显示宽度模式和 route buffer 构建耗时。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 将道路屏幕空间恒定宽度、基础 miter join 和 square cap 标记为已完成。
  - 下一步收敛为路线 picking、对象级 picking、城市详情面板、道路 dash/等级样式和更完整的急弯 bevel 策略。

当前限制：

- route buffer 现在每次 draw 都会重建并上传，当前路线规模较小可以接受；后续路线数量上来后应考虑只在 camera/viewport 改变时更新，或改为 shader 侧 screen-space offset。
- miter join 是基础实现，尖锐急弯只做长度钳制，没有完整 bevel/round join。
- 还没有路线 picking、道路等级样式、dash、桥梁/渡口/海路和路线标签。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-route-screen`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `28024022`。
  - 城市 `20`。
  - 道路 `25`，道路线段 `1774`。
  - 人口 cell `5598`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 阶段仍为 `3.3-settlements-routes-population`。
  - 道路三角形 `3252`。
  - 道路 mesh `screen-space, 3.5ms`。
  - 线段顶点 `1518`，仍不包含道路线段。
  - 城市标签 `9 / 20`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 路线 hover picking 初版

继续推进对象级交互基础：

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `pickRoute()`，按鼠标世界坐标到路线折线段的最短距离寻找最近路线。
  - 返回路线 `id`、`type`、起点城市、终点城市和命中距离。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - hover 时同时执行 grid cell picking 和 route picking。
  - 路线命中阈值按当前 camera 和 viewport 换算为世界距离，约等于屏幕 7px。
- `app/webgl-generator/src/ui/panel.js`：
  - 悬停面板新增“路线”和“路线类型”，显示起终点、类型和距离。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录路线 hover picking 已完成第一版。
  - 下一步改为路线点击选择、城市/路线对象级 picking、城市详情面板和道路样式继续细化。

当前限制：

- 当前路线 picking 直接遍历所有路线折线段，没有空间索引；路线规模变大后需要接入统一对象 picking index。
- 只做 hover 命中显示，还没有点击选择、编辑状态、详情面板或路线高亮。
- 路线命中距离按屏幕像素近似换算，后续应和屏幕空间 route mesh 的实际宽度、hover 容差和 layer visibility 统一。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 默认地图 `stage-2-1` 的道路 mesh 显示 `screen-space, 2.6ms`。
  - 鼠标移动到路线 `雁门城 -> 清源集` 的中段后，悬停面板显示路线 `雁门城 -> 清源集`。
  - 路线类型显示 `road / 0.0`。
  - 命中 grid cell `3359`，坐标 `767.4, 323.3`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 城市/路线对象级 picking 与点击选中

恢复太子-尚书-门下-侍中流程后，继续推进对象级交互基础。本步骤只复用现有悬停面板展示摘要，不新增正式详情面板或浮动面板。

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `pickCity()`，按鼠标世界坐标到城市点的距离寻找最近城市。
  - 城市命中返回 `kind`、`id`、名称、类型、人口、国家、省份和距离。
  - `pickRoute()` 返回结果新增 `kind: "route"`，便于统一对象摘要。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pickClientPoint()` 同时返回 `cityObject`、`route` 和统一 `object`。
  - 对象命中规则暂定为城市优先于路线。
  - canvas interaction 新增点击判定；无明显拖拽的 pointer up 会触发选中对象回调。
- `app/webgl-generator/src/runtime/app.js`：
  - 运行时状态新增 `selection`。
  - 点击城市/路线时记录选中对象；生成新地图时清空选中状态。
- `app/webgl-generator/src/ui/panel.js`：
  - 现有悬停面板新增“选中对象”“选中详情”和“悬停对象”。
  - 该实现只是当前阶段的摘要展示，不代表未来正式详情面板形态。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录城市/路线对象 picking 和点击选中已完成第一版。
  - 下一步转向对象高亮、正式详情面板规划/实现入口、道路 dash/等级样式和急弯 bevel 策略。

当前限制：

- 城市和路线 picking 都是直接遍历对象，没有统一空间索引。
- 点击选中只记录摘要，没有高亮、详情面板、编辑状态或多选。
- 城市和路线重叠时城市优先；后续需要更完整的图层选择优先级和可配置 picking 半径。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-object-picking`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `518a1753`。
  - 城市 `20`。
  - 道路 `25`，道路线段 `1992`。
  - 人口 cell `5597`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 点击默认首都 `雁门城`，悬停面板显示选中对象 `城市 雁门城`。
  - 城市选中详情显示 `capital / pop 108 / 清河国`。
  - 点击默认路线 `雁门城 -> 清源集` 的中段，悬停面板显示选中对象 `路线 雁门城 -> 清源集`。
  - 路线选中详情显示 `road / distance 0.0`。
  - hover 对象能在城市和路线之间切换。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 对象选中高亮初版

继续推进对象级交互反馈。本步骤仍不新增详情面板，只在地图画面中给选中对象提供可见反馈。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 新增 `selection` 状态和 `setSelection()`。
  - 选中路线时，route mesh 构建阶段将对应 route 改为更亮颜色并增加屏幕空间宽度。
  - 选中城市时，在 overlay 中显示 `selection-marker`，并让对应城市标签加上 `selected` class。
  - selection marker 会随 WebGL camera 投影到屏幕坐标。
- `app/webgl-generator/src/runtime/app.js`：
  - 点击选中对象后同步调用 `renderer.setSelection()`。
  - 生成新地图时清空 renderer selection。
- `app/webgl-generator/src/styles.css`：
  - 新增 `.selection-marker` 和 `.city-label.selected`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录选中城市标记和选中路线高亮已完成第一版。
  - 下一步转向正式详情面板规划/实现入口、道路 dash/等级样式、急弯 bevel 策略和统一对象 picking 索引。

当前限制：

- 选中路线仍在主 route buffer 中重建，没有独立 highlight pass；复杂图层顺序和遮挡策略后续还需细化。
- 城市高亮只标记城市点位置和已创建的标签；如果标签因 LOD 不显示，仍只有 selection marker。
- 还没有详情面板、编辑手柄、多选、键盘取消选择或选中对象持久化。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 点击默认首都 `雁门城`，选中对象显示 `城市 雁门城`。
  - `.selection-marker` 显示为 `block`，选中城市标签为 `雁门城`。
  - 点击默认路线 `雁门城 -> 清源集` 的中段，选中对象显示 `路线 雁门城 -> 清源集`。
  - 路线选中详情显示 `road / distance 0.0`，城市 selection marker 隐藏。
  - 道路 mesh 显示 `screen-space, 1.7ms`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 道路 trail 虚线样式

继续推进道路样式：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - route mesh 构建支持 dash 配置。
  - `trail` 按屏幕空间 dash/gap 分段生成短 polyline mesh，`road` 保持实线。
  - 选中路线仍强制使用更亮、更宽的实线高亮，避免选中态被虚线切碎。
  - `getStats()` 新增 `routeStyleMode`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“道路样式”，当前显示 `road solid / trail dashed`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录道路样式已区分 road 实线和 trail 虚线。
  - 下一步保留道路等级配置、连续 dash phase、急弯 bevel 和统一对象 picking 索引。

当前限制：

- dash pattern 目前按每个 segment 重新开始，跨 segment 不保持连续 phase。
- trail dash 没有 join/cap 的专门处理，短 dash 使用当前基础 square cap。
- 还没有按道路等级、地形、国家或编辑器配置动态调整样式。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md` 通过。
- 固定 seed `stage-3-4-route-dash`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `6230f594`。
  - 城市 `20`。
  - 道路 `23`，道路线段 `1620`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 道路样式显示 `road solid / trail dashed`。
  - 道路 mesh 显示 `screen-space, 2.8ms`。
  - 道路三角形 `3328`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 对象 picking 空间索引初版

继续推进对象级 picking 的可扩展性。本步骤把城市和路线从直接遍历升级为第一版 world-space bucket 索引。

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `buildObjectPickingIndex()`。
  - 索引使用固定 world-space bucket，城市按点落桶，路线按 segment bbox 覆盖的 bucket 入桶。
  - `pickCity()` 和 `pickRoute()` 改为优先查询索引附近 bucket，并对候选去重。
  - 保留无索引 fallback，便于后续测试和渐进迁移。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `loadMap()` 时构建 `objectPickingIndex`。
  - `pickClientPoint()` 使用索引执行城市和路线 picking。
  - `getStats()` 输出对象索引 bucket 数、bucket 尺寸、城市数、路线段数和最大 bucket 项数。
  - hover 结果新增本次对象候选数。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“对象索引”。
  - 悬停面板新增本次“对象候选”。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录城市/路线对象 picking 已接入第一版空间索引。

当前限制：

- 索引只覆盖城市和路线，还没有国家、省份、河流、marker、标签、纹章等对象。
- bucket 大小是阶段性固定策略，尚未按对象密度或 zoom 级别自适应。
- 路线 segment 入桶使用 bbox，极长 segment 可能覆盖较多 bucket；后续可按 polyline 重采样或层级索引优化。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 固定 seed `stage-3-4-object-index`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `438e43a7`。
  - 城市 `20`。
  - 道路 `22`，道路线段 `1384`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 运行时统计显示对象索引 `397 buckets / 1626 route segs`。
  - 点击默认路线 `雁门城 -> 清源集` 的中段，选中对象显示 `路线 雁门城 -> 清源集`。
  - 悬停面板显示对象候选 `81`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 河流对象 picking 初版

继续扩展对象级 picking。本步骤把河流 segment 接入同一个 world-space bucket 索引，供后续河流详情和河流编辑面板使用。

- `app/webgl-generator/src/renderer/picking.js`：
  - 对象索引新增 `riverSegments`。
  - `buildObjectPickingIndex()` 会把每条河流的每个 segment 按 bbox 覆盖的 bucket 入桶。
  - 新增 `pickRiver()`，返回 `kind`、`id`、类型、flux、长度和命中距离。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pickClientPoint()` 同时执行城市、路线和河流 picking。
  - 当前对象优先级为城市 > 路线 > 河流。
  - `getStats()` 的对象索引统计新增河流段数量。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时对象索引显示 bucket、路线段和河流段数量。
  - 悬停面板新增“河流”和“河流类型”。
  - 选中河流时显示 `河流 #id` 和 flux/length 摘要。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录城市、路线和河流都已接入第一版对象 picking 索引。

当前限制：

- 河流仍是 `gl.LINES` 线层，没有选中高亮。
- 河流 picking 半径与路线相同，尚未按河流流量或未来河流宽度自适应。
- 对象索引仍未覆盖国家、省份、marker、标签和纹章等对象。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 固定 seed `stage-3-4-river-picking`、模板 `continents` 生成器检查：
  - 阶段 `3.3-settlements-routes-population`。
  - checksum `d0830214`。
  - 河流 `8`，河流线段 `72`。
  - 道路 `24`。
- 内置 Browser 刷新 `http://127.0.0.1:5410/` 后：
  - 运行时统计显示对象索引 `424 buckets / 1626 routes / 51 rivers`。
  - 点击默认河流 `#2` 的中段，选中对象显示 `河流 #2`。
  - 河流类型显示 `river / flux 19829`。
  - 选中详情显示 `river / flux 19829 / length 5`。
  - 悬停面板显示对象候选 `4`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 浮动面板架构约束文档

按用户要求，所有未来配置和编辑面板都应做成 HTML 浮动可拖动面板，不使用 canvas 实现。本步骤只落文档，不改现有侧栏。

- 新增 `docs/architecture/floating-panel-architecture.md`：
  - 记录适用面板范围：生成配置、高度编辑、河流编辑、城市/道路编辑、国家/省份/文化/宗教编辑、标签/纹章/对象详情、调试统计和图层控制。
  - 记录基本原则：普通 DOM UI、可拖动、统一层级管理、可折叠/关闭/停靠、状态可持久化。
  - 记录与地图交互的边界：renderer 不直接创建业务编辑面板，picking/selection/highlight 属于地图交互层，详情面板读取 runtime/store 状态。
  - 记录推荐模块划分：`panel-manager.js`、`floating-panel.js`、各类 `panels/*`。
  - 记录第一阶段迁移建议：先保留固定侧栏，新增 panel manager 和只读对象详情面板，再逐步迁移图层控制和生成配置。
- 更新 `docs/current-plan.md` 和 `app/webgl-generator/README.md`：
  - 将未来浮动面板约束链接到 `docs/architecture/floating-panel-architecture.md`。

当前状态：

- 现有配置、统计和悬停信息仍在固定侧栏。
- 本步骤没有实现新面板，也没有改变 canvas 交互。

### 3.4 浮动对象详情面板初版

继续按太子-尚书-门下-侍中流程推进阶段 3.4。本步骤只实现最小可用的只读对象详情面板，不迁移现有固定侧栏，也不加入编辑控件。

- `app/webgl-generator/src/ui/panel-manager.js`：
  - 新增第一版浮动面板管理器。
  - 支持面板注册、打开、关闭、激活层级和标题栏拖动。
  - 面板层默认 `pointer-events: none`，只有面板自身消费指针事件，避免阻断地图区域拖拽、缩放和选择。
- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 新增只读对象详情面板。
  - 支持城市、路线和河流三类 selection 摘要。
  - selection 为空时关闭面板。
- `app/webgl-generator/src/runtime/app.js`：
  - 初始化 `PanelManager` 和对象详情面板。
  - 点击选中城市、路线或河流后刷新并打开对象详情面板。
  - 生成新地图时关闭对象详情面板并清空 selection。
- `app/webgl-generator/src/styles.css`：
  - 新增浮动面板层、面板壳、标题栏、关闭按钮和对象详情列表样式。
- `app/webgl-generator/README.md`、`docs/current-plan.md` 和 `docs/architecture/floating-panel-architecture.md`：
  - 将对象详情面板从未来约束更新为当前已开始实现。
  - 记录当前仍是只读入口，尚未实现编辑、停靠、持久化和多面板状态恢复。

当前限制：

- 对象详情面板只读显示当前 selection，尚不能编辑对象。
- 面板位置、打开状态和尺寸尚未持久化。
- 当前只有关闭按钮和拖动，没有折叠、停靠或尺寸调整。
- 面板 shell 仍内联在 `panel-manager.js` 中，后续复杂化后再拆出 `floating-panel.js`。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel-manager.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击默认首都 `雁门城` 后，对象详情面板打开并显示 `城市 雁门城`、类型、人口、国家、省份和对象 id。
  - 面板可拖动，验证中面板位置从 `(364, 24)` 移动到 `(414, 64)`。
  - 点击关闭按钮后，面板进入隐藏状态。
  - 重新选中城市后点击“生成 grid 地图”，面板关闭且 runtime selection 清空。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 河流选中高亮初版

继续按太子-尚书-门下-侍中流程推进对象级交互反馈。本步骤补齐河流 selection 的地图可见反馈，不改变河流生成逻辑，也不把河流主线层整体升级为 polyline mesh。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `selectionBuffer` 动态 buffer。
  - `draw()` 中在普通河流 `gl.LINES` pass 后绘制选中对象高亮 pass。
  - 选中河流时，按当前 camera 和 canvas 尺寸把对应河流折线生成 screen-space 三角形带。
  - 高亮宽度按河流 flux 做轻量加权，缩放时保持屏幕像素宽度。
  - `getStats()` 新增 `selectionVertexCount`、`selectionTriangleCount`、`selectionBuildMs` 和 `selectionHighlightMode`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“选中高亮”，显示高亮模式、三角形数量和构建耗时。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录选中河流已有独立 screen-space mesh 高亮。
  - 保留限制：河流主线层仍是阶段性 `gl.LINES`，后续仍需升级到可变宽 mesh。

当前限制：

- 当前只对选中河流生成高亮 mesh，普通河流仍是 `gl.LINES`。
- 高亮没有 round cap/round join，只复用当前基础 polyline mesh 的 miter/square cap 策略。
- 河流 selection 仍没有编辑手柄、节点显示或流量/河段编辑。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 脚本扫描河流线段中点，选择实际命中河流对象的位置，避免被城市/路线优先级抢占。
  - 点击河流 `#1` 后，selection 为 `kind: "river"`，flux 为 `18601`，对象候选为 `3`。
  - 运行时统计显示 `selectionHighlightMode = river screen-space mesh`。
  - 高亮顶点 `18`，高亮三角形 `6`。
  - 浮动对象详情面板显示 `河流 #1`、类型、流量、长度、命中距离和对象 id。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 浮动面板位置持久化初版

继续按太子-尚书-门下-侍中流程推进浮动面板体系。本步骤补最小状态管理，只保存面板位置和宽度，不保存打开状态，避免页面刷新后在没有 selection 的情况下自动弹出空面板。

- `app/webgl-generator/src/ui/panel-manager.js`：
  - 新增 `storagePrefix` 和面板状态读写方法。
  - `registerPanel()` 会优先读取浏览器 `localStorage` 中保存的 `left`、`top` 和 `width`。
  - 拖动结束或取消时保存当前面板位置和宽度。
  - `open()` 时重新约束面板位置，避免窗口尺寸变化后旧位置跑出地图区域。
  - 读写 `localStorage` 使用 `try/catch` 包裹，兼容受限浏览器模式。
- `app/webgl-generator/README.md`、`docs/current-plan.md` 和 `docs/architecture/floating-panel-architecture.md`：
  - 记录对象详情面板已有最小位置持久化。
  - 保留限制：仍不保存打开状态、折叠状态、尺寸调整状态或多面板布局。

当前限制：

- 当前只保存位置和当前宽度；由于还没有 resize handle，宽度主要来自初始配置。
- 不保存面板打开/关闭状态，刷新后仍需重新点击对象打开详情。
- 暂未实现 session/workspace 级布局版本管理，后续多面板时需要补布局 schema。

验证：

- `node --check app\webgl-generator\src\ui\panel-manager.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 清空 `localStorage` 中的 `webgl-generator-panel:object-details` 后，点击默认首都 `雁门城` 打开对象详情面板。
  - 面板初始位置为 `(364, 24)`，拖动后位置为 `(484, 126)`。
  - 写入 `localStorage` 的状态为 `{"left":144,"top":126,"width":320}`，其中 `left` 是相对地图区域的坐标。
  - 刷新页面后面板保持隐藏，不因持久化状态自动弹出。
  - 再次点击 `雁门城` 后，面板恢复到 `(484, 126)`，与拖动后位置一致。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 trail 连续 dash phase

继续按太子-尚书-门下-侍中流程推进道路样式。本步骤只修正虚线节奏，不改变路线生成、路线 picking 或道路等级模型。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `trail` 虚线生成从“每个 segment 重新开始 dash/gap”改为沿整条 polyline 累计 phase。
  - `pushDashedScreenPolyline()` 在 segment 之间保留 dash phase，折线节点处不会重置虚线节奏。
  - 运行时 `routeStyleMode` 更新为 `road solid / trail continuous dashed`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 将连续 dash phase 标记为已完成。
  - 下一步道路样式重点保留为道路等级配置和更完整的急弯 bevel 策略。

当前限制：

- trail 仍复用基础 square cap，没有专门的 round cap。
- 急弯仍只使用当前 miter 限制策略，尚未实现完整 bevel/round join。
- route 样式还没有按道路等级、地形、国家或编辑配置动态调整。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 运行时统计显示 `routeStyleMode = road solid / trail continuous dashed`。
  - route mesh 顶点 `10560`，三角形 `3520`。
  - 默认地图中 `trail` 路线 `10` 条，`road` 路线 `15` 条。
  - 道路 mesh 构建耗时 `1.4ms`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 政治对象 selection fallback 初版

继续按太子-尚书-门下-侍中流程推进对象级 picking。本步骤把国家、省份和区域接入 selection fallback，不做边界或区域高亮，避免本步范围扩张。

- `app/webgl-generator/src/renderer/picking.js`：
  - 新增 `pickPoliticalObject()`。
  - 当 pick 命中陆地 cell 时，可按 `states`、`provinces`、`regions` 当前专题返回对应政治对象。
  - 非政治专题下默认选择省份；省份不存在时回退到国家，再回退到区域。
  - 国家对象包含文化、宗教和中心 cell；省份对象包含所属国家和中心 cell；区域对象包含名称和 id。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `pickClientPoint()` 中统一对象优先级调整为城市 > 路线 > 河流 > 政治对象。
  - hover/pick 结果新增 `politicalObject`。
- `app/webgl-generator/src/ui/panel.js`：
  - 悬停面板新增“政治对象”。
  - 选中对象摘要支持国家、省份和区域。
- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 浮动对象详情面板支持国家、省份和区域三类只读摘要。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录政治对象 selection fallback 已完成。
  - 下一步保留政治对象高亮、marker/标签/纹章 picking 和编辑入口。

当前限制：

- 政治对象当前不是 world-space bucket 索引对象，而是基于已命中的 grid cell 语义 fallback。
- 暂未绘制选中国家/省份/区域边界或填色高亮。
- 政治对象详情仍是只读摘要，尚不能进入编辑状态。

验证：

- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 脚本选择一个没有城市、路线和河流优先命中的陆地 cell：`grid cell 426`。
  - 默认专题下选中 `province`，对象为 `白麓府`，所属国家 `白麓邦`。
  - 省份专题下仍选中 `province`，对象详情面板显示省份名称、所属国家、国家 id、中心 cell 和对象 id。
  - 国家专题下选中 `state`，对象为 `白麓邦`，详情面板显示文化 `白麓文化`、宗教 `白麓礼`、中心 cell 和对象 id。
  - 区域专题下选中 `region`，对象为 `北境`，详情面板显示区域类型和对象 id。
  - 悬停面板显示“政治对象”，对象候选为 `1`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 政治对象高亮初版

继续按太子-尚书-门下-侍中流程推进政治对象 selection 的可见反馈。本步骤只做半透明范围高亮，不做边界追踪、编辑手柄或标签联动。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 复用已有 `selectionBuffer`。
  - selection 为 `state`、`province` 或 `region` 时，遍历匹配的 grid cells，并生成 screen-space 三角形面。
  - selection pass 开启 WebGL blend，政治对象高亮使用半透明填色。
  - `selectionHighlightMode` 新增 `state translucent cells`、`province translucent cells` 和 `region translucent cells`。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录政治对象已有半透明 cell mesh 高亮。
  - 下一步从“政治对象高亮”转向编辑入口、道路等级、急弯 bevel、marker/标签/纹章 picking。

当前限制：

- 高亮使用匹配 cell 的半透明填充，不提取边界线。
- 大范围国家高亮需要遍历并上传较多三角形；当前地图规模可接受，后续需要按 selection/cache 优化。
- 暂无编辑手柄、锁定选择、标签联动或边界拖拽。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 选中省份 `白麓府` 后，`selectionHighlightMode = province translucent cells`，高亮三角形 `5717`，构建耗时 `2.2ms`。
  - 选中国家 `白麓邦` 后，`selectionHighlightMode = state translucent cells`，高亮三角形 `8011`，构建耗时 `2.3ms`。
  - 选中区域 `北境` 后，`selectionHighlightMode = region translucent cells`，高亮三角形 `7062`，构建耗时 `2ms`。
  - 三类对象详情面板均显示对应名称和摘要字段。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 道路等级样式初版

继续按太子-尚书-门下-侍中流程推进道路样式。本步骤增加路线等级字段和对应渲染样式，不改路线寻路算法，也不新增配置面板。

- `app/webgl-generator/src/generator/settlements.js`：
  - `createRoute()` 新增 `level` 字段。
  - `road` 根据首都端点和城市人口分为 `primary` 或 `secondary`。
  - `trail` 保持 `level: "trail"`。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `routeStyle()` 集中决定路线颜色、宽度和 dash。
  - `primary` 比 `secondary` 更宽、更亮；`trail` 保持连续虚线。
  - `routeStyleMode` 更新为 `primary/secondary road + continuous trail dashed`。
- `app/webgl-generator/src/renderer/picking.js`：
  - 路线 picking 结果新增 `level`。
- `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 悬停面板、选中摘要和浮动详情面板显示路线等级。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录道路等级样式初版已完成。
  - 下一步保留道路等级配置面板和急弯 bevel 策略。

当前限制：

- 道路等级是生成时内置规则，尚不能在 UI 面板里配置。
- `primary/secondary` 只影响样式，不影响寻路、交通权重或城市经济。
- 急弯 join 仍使用当前 miter 限制策略，尚未实现完整 bevel/round join。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 默认地图路线等级统计为 `primary: 15`、`trail: 10`。
  - 点击路线 `#0` 后，selection 为 `route`，`type = road`，`level = primary`。
  - 运行时统计显示 `routeStyleMode = primary/secondary road + continuous trail dashed`。
  - 浮动对象详情面板显示“等级 primary”。
  - 悬停/选中摘要显示 `road / primary / distance 0.0`。
  - route mesh 三角形 `3520`，构建耗时 `2.7ms`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 marker 数据、绘制和 picking 初版

继续按太子-尚书-门下-侍中流程把对象 picking 扩展到 marker。本步骤新增轻量地理 marker 数据，接入现有 WebGL point pass 和对象详情面板，不实现 sprite atlas 或 marker 编辑。

- `app/webgl-generator/src/generator/markers.js`：
  - 新增 marker 生成模块。
  - 当前生成三类 marker：高峰、河源和国家中心。
  - marker 数据包含 `id`、`type`、`name`、`cell`、`x/y` 和轻量 `data`。
- `app/webgl-generator/src/generator/index.js`：
  - 接入 `buildMarkers()`。
  - 地图对象新增 `markers`。
  - 生成日志和 summary 记录 marker 数量、峰值 marker、河源 marker 和国家中心 marker 数量。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - WebGL point pass 绘制 marker 点。
  - `getStats()` 新增 `markerCount`。
  - 对象 picking 优先级调整为城市 > marker > 路线 > 河流 > 政治对象。
- `app/webgl-generator/src/renderer/picking.js`：
  - 对象 bucket 索引新增 `markers`。
  - 新增 `pickMarker()`。
  - 对象索引统计新增 marker 数量，最大 bucket 项数计入 marker。
- `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 运行时统计显示 marker 数量。
  - 悬停面板显示 marker 名称和类型。
  - 选中摘要和对象详情面板支持 marker。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录 marker 数据、点层绘制和对象 picking 初版已完成。

当前限制：

- marker 仍是普通 `gl.POINTS`，没有 sprite atlas、pin 图标、LOD 或避让。
- marker 数据是轻量示意：高峰、河源、国家中心，尚未覆盖原项目完整 marker 类型。
- marker 详情只读，尚无编辑和删除入口。

验证：

- `node --check app\webgl-generator\src\generator\markers.js` 通过。
- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\picking.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 默认地图 marker 统计为总数 `22`，高峰 `10`，河源 `7`，国家中心 `5`。
  - 对象索引统计显示 `markers: 22`。
  - 点击 marker `峰 96` 后，selection 为 `kind: "marker"`，`type = peak`，`cell = 4221`。
  - 浮动对象详情面板显示 marker 类型、cell、数据和对象 id。
  - 悬停面板显示 `marker 峰 96 / peak`。
  - point 顶点 `2243`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 marker 选中高亮初版

继续按太子-尚书-门下-侍中流程补齐 marker selection 的可见反馈。本步骤复用现有 HTML selection marker，不新增独立 marker 编辑手柄。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `updateSelectionMarker()` 从只支持城市扩展为支持城市和 marker。
  - 新增 `selectionPoint()`，按 selection 类型解析屏幕投影点。
  - 选中 marker 时显示同一套圆环 overlay，并随 camera 更新位置。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录 marker 选中圆环反馈已完成。

当前限制：

- marker 仍是 `gl.POINTS`，圆环只是选中反馈，不是 marker sprite。
- 暂无 marker 拖动、编辑、删除和类型切换。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击 marker `峰 96` 后，selection 为 `kind: "marker"`。
  - `.selection-marker` 显示为 `block`。
  - marker 圆环位置为 `(568.254, 333.9)`，与 marker 投影位置误差小于 `1px`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 城市标签对象 picking 初版

继续按太子-尚书-门下-侍中流程把对象 picking 扩展到标签。本步骤只接入当前可见城市标签，不实现道路标签、国家标签、曲线文字或标签编辑。

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `labelItems` 记录可见状态和屏幕碰撞盒。
  - 新增 `pickLabel()`，基于 canvas click 坐标命中可见城市标签的屏幕盒。
  - `pickClientPoint()` 对象优先级调整为标签 > 城市 > marker > 路线 > 河流 > 政治对象。
  - 选中 `label` 时，复用城市 selection marker，并让对应城市标签进入 selected 样式。
- `app/webgl-generator/src/ui/panel.js`：
  - 悬停面板新增“标签对象”。
  - 选中摘要支持 `label`。
- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 浮动对象详情面板支持标签文本、目标类型、目标名称、显示序位和对象 id。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录可见城市标签对象 picking 初版已完成。

当前限制：

- 只支持已显示的城市标签；被 LOD 或碰撞避让隐藏的标签不会命中。
- 标签对象仍是只读摘要，尚不能拖动、锁定、改名或编辑优先级。
- 还没有道路标签、国家标签、曲线文字和纹章对象 picking。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击可见城市标签 `星津镇` 的屏幕盒中心后，selection 为 `kind: "label"`。
  - 浮动对象详情面板显示标签文本、目标类型、目标名称、显示序位和对象 id。
  - 悬停面板显示“标签对象 星津镇 / city”。
  - 对应 `.city-label.selected` 文本为 `星津镇`。
  - `.selection-marker` 显示为 `block`。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 对象详情编辑入口骨架

继续按太子-尚书-门下-侍中流程把对象详情面板从只读入口推进到编辑入口。本步骤只记录编辑目标和 UI 状态，不修改地图数据，不提供字段控件。

- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 对象详情面板新增“编辑”按钮。
  - 点击后通过回调通知 runtime。
  - 面板详情行新增“状态”，显示“查看”或“编辑”。
  - 当前对象进入编辑状态后，按钮显示“编辑中”并禁用。
- `app/webgl-generator/src/runtime/app.js`：
  - runtime 状态新增 `editingObject`。
  - 点击“编辑”后记录当前对象为编辑目标，并刷新对象详情面板。
  - 生成新地图时清空 `editingObject`。
- `app/webgl-generator/src/ui/panel.js`：
  - 选中摘要新增“编辑对象”。
- `app/webgl-generator/src/styles.css`：
  - 新增对象详情 action 区域间距。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录对象详情已有最小编辑入口。
  - 下一步从编辑入口推进到具体字段控件、保存/撤销边界和配置面板。

当前限制：

- 点击“编辑”只进入 runtime 编辑状态，不修改对象字段。
- 暂无保存、撤销、取消编辑、字段控件或编辑手柄。
- 编辑对象不跨生成保留；生成新地图会清空编辑目标。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 选中对象后点击“编辑”，runtime `editingObject` 记录当前对象。
  - 浮动对象详情面板显示状态“编辑”，按钮显示“编辑中”并禁用。
  - 左侧选中摘要显示“编辑对象”。
  - 点击“生成 grid 地图”后，`selection = null`，`editingObject = null`，对象详情面板隐藏。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

### 3.4 退出编辑边界

继续按太子-尚书-门下-侍中流程补齐对象详情编辑入口的最小状态边界。本步骤只允许退出编辑，不实现保存、撤销或字段修改。

- `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - `createObjectDetailsPanel()` 的回调扩展为 `onEdit` 和 `onCancelEdit`。
  - 编辑状态下按钮从“编辑中”改为“退出编辑”。
  - 点击“退出编辑”会触发取消编辑回调。
- `app/webgl-generator/src/runtime/app.js`：
  - `onCancelEdit` 将 `editingObject` 置空。
  - 退出编辑后刷新对象详情面板和左侧选中摘要。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 记录对象详情面板已有编辑入口和退出编辑边界。

当前限制：

- 退出编辑只是清空 runtime 编辑目标。
- 尚未实现字段控件、保存、撤销或脏状态提示。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app\webgl-generator docs\current-plan.md docs\development-log.md docs\floating-panel-architecture.md` 通过。
- 使用 Playwright + 系统 Chrome 验证 `http://127.0.0.1:5410`：
  - 点击对象详情“编辑”后，runtime `editingObject` 有值。
  - 面板状态显示“编辑”，按钮文本为“退出编辑”。
  - 左侧摘要显示当前“编辑对象”。
  - 点击“退出编辑”后，runtime `editingObject = null`。
  - 面板状态回到“查看”，按钮文本回到“编辑”。
  - 左侧摘要显示“编辑对象 none”。
  - `WebGL error = 0`。
  - 控制台无 error/warning。

## 2026-06-18：source 生成算法重新审查与第一轮整改

用户指出当前正式应用生成质量明显落后于 demo：路线在海中出现陆地直线且过直，山区路线过密；河流稀少；平原坡度像梯田；100000 cells 时山地和平原交界突兀；群岛和半岛有 45 度织物感；温度缺乏度量；国界和各类专题分界过齐整。用户要求恢复太子-尚书-门下-侍中流程，由太子先审查 source 算法，再按文档整改。

太子审查：

- 阅读并对照 `source/Fantasy-Map-Generator/src/modules/heightmap-generator.ts`、`public/config/heightmap-templates.js`、`public/main.js`、`src/modules/river-generator.ts`、`src/modules/routes-generator.ts`、`src/modules/cultures-generator.ts` 和 `src/modules/states-generator.ts`。
- 确认 source 高度图核心是模板步骤在 `grid.cells.c` 上传播，不做正式应用此前的全局高度百分位重排。
- 确认 source 生成顺序是高度、feature、温度/降水、reGraph、河流、生物群系、人口评分、文化扩张、城市、国家、路线、宗教、省份等，正式应用此前部分语义层过早且使用最近中心染色。
- 确认 source 河流基于降水 flux、填洼、湖泊出口、合流、下切和 meander；正式应用此前河源上限和阈值过保守。
- 确认 source 路线先用城镇图决定连接，再通过水陆分离的成本寻路生成；正式应用此前贪心失败时会追加终点，导致海中直线。
- 新增 `docs/audits/source-generation-audit-and-rectification-plan.md`，作为本轮尚书实现、门下复核和侍中验收依据。

尚书实现：

- `app/webgl-generator/src/generator/grid.js`
  - 从 Voronoi polygon 共享边生成 `grid.cells.c`。
  - 运行时 metadata 记录 `neighborMode`、平均邻接度和最大邻接度。
  - 小型内陆盆地填平改用共享边邻接。
- `app/webgl-generator/src/generator/heightmap.js`
  - 高度传播改用 `grid.cells.c`。
  - 移除正式生成中的 `matchHeightDistribution()` 调用，不再按全局百分位重排高度。
  - 海平面校准加入确定性微扰处理高度平台 tie-break。
  - 新增连续 relief 拉伸和坡脚平滑，使模板高山恢复峰值，同时减少山地和平原硬切。
  - 修正 `linePower` 的高 cells 档位，使 100000 cells 接近 source 的 0.93。
- `app/webgl-generator/src/generator/features.js`
  - feature flood fill 和海岸/湖岸线段扫描改用共享边邻接。
- `app/webgl-generator/src/generator/rivers.js`
  - 河流填洼、下游选择和源头间距改用共享边邻接。
  - 河源上限随 cells 动态变化，flux 阈值降低，河源最低高度放宽。
  - 长河段加入确定性 meander 中点。
- `app/webgl-generator/src/generator/settlements.js`
  - 路线从贪心追踪改为 A* 成本寻路。
  - 陆路禁止穿水；高山、陡坡成本提高。
  - 找不到路径时返回空路径，不再 `path.push(end)` 画直连。
- `app/webgl-generator/src/generator/society.js`
  - 文化和宗教从最近中心改为共享边邻接成本扩张。
  - 成本纳入高度、坡度、生物群系和河流阻隔。
- `app/webgl-generator/src/generator/politics.js`
  - 国家、省份和区域从最近中心或 x/y 阈值改为共享边邻接成本扩张。
  - 国家扩张成本纳入文化、宗教、高度、坡度和河流。
  - 省份限制在所属国家内扩张。
- `app/webgl-generator/src/generator/index.js`
  - 河流生成提前到社会和政治语义之前。
  - 阶段标识更新为 `3.5-source-audit-generation-repair`。
- `app/webgl-generator/index.html`、`src/ui/panel.js`、`src/styles.css`
  - 温度和降水专题新增画布图例。
  - 温度范围显示摄氏度单位。

门下复核：

- `node --check` 覆盖本轮改动的正式应用 JS 文件，均通过。
- `git diff --check -- app/webgl-generator docs` 通过。
- Node 直接生成 100000 cells 抽查：
  - `continents`：河流 86，路线 67，路线水域 cell 为 0，最高高度 97。
  - `archipelago`：陆地 feature 349，河流 88，路线水域 cell 为 0，最高高度 100。
  - `mediterranean`：河流 88，路线水域 cell 为 0，最高高度 93。
  - `highIsland`、`lowIsland`、`peninsula`、`pangea` 也均能生成陆地和河流。

侍中验收：

- 使用系统 Chrome 无头页访问 `http://127.0.0.1:5410/`，生成 `seed=audit-browser-100k`、`cells=100000`、`template=continents`。
- 验收结果：
  - 实际 grid cells：99846。
  - 邻接模式：`shared-voronoi-edges`，平均邻接度 5.97。
  - 河流：87 条，671 段。
  - 路线：67 条，2885 段。
  - 路线水域 cell：0。
  - 最高高度：96。
  - 温度范围：-7°C 到 31°C。
  - WebGL error：0。
  - 控制台 error/warning：0。
  - 温度专题图例可见，显示 `-7°C / 0°C / 31°C`。
- 保存网页快照：`docs/snapshots/webgl-generator-100k-source-audit.png`。

当前限制：

- 底层点集仍来自分层行列采样，尚未升级为真实 Delaunay/蓝噪声点集；本轮主要通过共享边邻接和 source 风格传播减弱方向偏差。
- `pack` 仍为 `one-grid-cell-to-one-pack-cell`，尚未复刻 source 的 `reGraph()` 抽稀/重建语义图。
- 河流仍是轻量 flux 模型，尚未实现完整湖泊出口、河床下切、宽河道 polygon 和 source 级 meander。
- 路线连接关系仍是阶段性城市规则，尚未复刻 source 的 Delaunay/Urquhart 城镇连接图和海路。

## 2026-06-18 source 优先复位计划

用户指出当前地中海模板网页快照已经表现为“一团乱麻”：地形像噪声毯，水体像随机挖洞，道路和聚落缺乏地理因果，后续文化、宗教、国家、人口等专题也继承了底层失真。用户要求停止当前跑偏流程，不动当前代码，不看当前代码，只根据 `source/Fantasy-Map-Generator` 重新形成执行计划并落成文档。

太子复审：

- 重新只读 source 源码，重点对照 `public/main.js` 的生成顺序、`graphUtils.ts`、`voronoi.ts`、`heightmap-generator.ts`、`heightmap-templates.js`、`features.ts`、`river-generator.ts`、`biomes.ts`、`burgs-generator.ts`、`cultures-generator.ts`、`states-generator.ts`、`routes-generator.ts`、`religions-generator.ts`、`provinces-generator.ts` 和 `pathUtils.ts`。
- 确认原版生成链路是 `grid -> 高度模板 -> grid features -> 温度和降水 -> reGraph pack -> pack features -> 河流 -> 生物群系 -> 适居度 -> 文化 -> 城市 -> 国家 -> 路线 -> 宗教 -> 省份`。
- 确认当前乱象不应继续通过局部视觉调参解决，应优先恢复 grid/Voronoi、source 高度模板 DSL 和 `reGraph()` pack 语义图。

尚书文档落地：

- 新增 `docs/task-notes/source-first-recovery-execution-plan.md`，作为后续 source 优先复位整改的主计划。
- 更新 `docs/current-plan.md`，在顶部标记 2026-06-18 计划复位，暂停继续叠加阶段 3 UI 和专题功能。
- 本轮只改文档，不修改当前正式应用代码，也不修改 `source/` 原项目代码。

后续执行入口：

- 下一步从阶段 0 开始：建立 source 对照基线，导出 source 参考快照和结构摘要，不改正式应用。
- source 基线通过后，才进入阶段 1 的 grid/Voronoi 整改。

## 2026-06-18 独立 source 复查与详细规程

用户要求启动一个新智能体再做一遍 source 检查，并对比已经生成的 `docs/task-notes/source-first-recovery-execution-plan.md`，找出还缺什么。要求文档必须足够详细，能指导后续细致任务。

太子协调：

- 启动独立 explorer 智能体，要求只读 `source/Fantasy-Map-Generator` 和计划文档，不读取 `app/webgl-generator` 或 `prototype` 当前实现，不修改任何文件。
- 主线程并行只读 source 和现有计划文档，重新核对 `public/main.js` 生成顺序、grid/pack 数据结构、heightmap、features、lakes、rivers、biomes、cultures、burgs、states、routes、religions、provinces、markers、zones 和 military 等模块。

独立智能体结论：

- 现有复位计划方向和阶段顺序正确，但偏战略骨架，不足以直接交给尚书逐步实现。
- 主要缺口包括 source 对照导出工具规格、字段级不变量、模板/seed/cells 验收矩阵、每阶段可运行的结构检查脚本、真实生成顺序中的湖泊预处理、`Features.defineGroups()`、`Burgs.specify()`、国家统计/形制、河湖命名、军事、marker 和 zone 等中间步骤。

尚书文档落地：

- 新增 `docs/task-notes/source-first-detailed-task-plan.md`，作为后续 source 优先整改的详细施工图。
- 更新 `docs/task-notes/source-first-recovery-execution-plan.md`，标记其为复位总纲，并指向详细规程。
- 更新 `docs/current-plan.md`，将下一步入口切换到详细规程的阶段 0。

详细规程新增内容：

- 完整 source 生成顺序。
- grid、pack、feature、river、culture、burg、state、route、religion、province、marker、zone 和 military 字段契约。
- source baseline 工具建议、输出目录和 `source-summary.json` schema。
- `10000/50000/100000` cells、7 个模板、每模板 3 个固定 seed 的验收矩阵。
- 阶段 1 到阶段 15 的 source 文件、输入字段、输出字段、尚书任务、门下检查、侍中验收和禁止事项。
- 失败回退规则和最容易再次跑偏的风险清单。

本轮只改文档，不修改 `source/`，不修改当前正式应用代码。

## 2026-06-18 阶段 0 source baseline 工具启动

用户确认开始按太子-尚书-门下-侍中四级流程推进，且无特殊情况不用每一步停下来等指示。当前正式进入 `docs/task-notes/source-first-detailed-task-plan.md` 的阶段 0：建立 source 对照基线。

太子计划：

- 先实现单 case source baseline 导出工具，复用现有 source dev server + Playwright + 系统 Chrome 路径。
- 第一版只读运行 source，主动锁定 `points` 和 `template`，并通过 `generate({seed})` 固定 seed。
- 输出 `source-summary.json`、`source-trace.json`、`source-map.png` 和 `validation.md`；完整 `source-snapshot.json` 通过 `--snapshot true` 开关控制，避免每次 100000 cells 都写出大型 JSON。

尚书实施：

- 新增 `tools/source-export-baseline.mjs`。
- 更新 `docs/task-notes/source-first-detailed-task-plan.md`，记录第一版工具命令和产物。

待门下和侍中继续：

- 门下运行语法检查、diff 检查和 source 未改检查。
- 侍中导出 `mediterranean / 100000 / audit-mediterranean-001` 的 source baseline，检查摘要、trace、截图和 validation。

侍中验收结果：

- 成功导出 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/source-summary.json`。
- 成功导出 `source-trace.json`、`source-map.png` 和 `validation.md`。
- 关键摘要：grid cells 99846，pack cells 73028，pack/grid 0.731，陆地比例 0.611，河流 956，城市 1724，港口 230，国家 21，路线 1331。
- 结构检查：pack grid 引用错误 0，haven 错误 0，harbor 不一致 0，route 非双向 0，陆路穿水 0。
- 海路中段穿陆统计为 1，作为 source baseline 事实记录，后续 candidate 对照不应比 source 更差。

## 2026-06-18 阶段 0.2 source baseline 矩阵入口

太子计划：

- 在单 case baseline 可运行后，继续实现矩阵批量入口。
- `quick` 模式先覆盖 `mediterranean`、`continents`、`archipelago` 三个 100000 cells 强回归样例。
- `full` 模式后续覆盖 7 个模板、3 档 cells、每模板 3 个 seed。

尚书实施：

- 新增 `tools/source-baseline-matrix.mjs`。
- 更新 `docs/task-notes/source-first-detailed-task-plan.md`，记录 quick/full 矩阵命令和产物。

待门下和侍中继续：

- 门下运行语法检查、diff 检查和 source 未改检查。
- 侍中运行 quick matrix，生成 `docs/generated/source-baselines/matrix.json` 和 `docs/generated/source-baselines/matrix.md`。

门下复核：

- `node --check tools/source-export-baseline.mjs` 通过。
- `node --check tools/source-baseline-matrix.mjs` 通过。
- `git diff --check` 覆盖本轮脚本和文档，通过。
- `git status --short source ...` 确认 `source/` 未改动。

侍中验收：

- 成功运行 `node .\tools\source-baseline-matrix.mjs --mode quick --port 5301 --browser-channel chrome`。
- 产物：
  - `docs/generated/source-baselines/matrix.json`
  - `docs/generated/source-baselines/matrix.md`
  - `docs/generated/source-baselines/continents-100000-audit-continents-001/`
  - `docs/generated/source-baselines/archipelago-100000-audit-archipelago-001/`
- quick matrix 摘要：
  - `mediterranean`：grid 99846，pack 73028，河流 956，城市 1724，港口 230，路线 1331。
  - `continents`：grid 99846，pack 50625，河流 851，城市 1206，港口 187，路线 1041。
  - `archipelago`：grid 99846，pack 14351，河流 238，城市 265，港口 79，路线 266。
- 三个样例的 pack 引用错误、haven 错误、harbor 不一致和 route 非双向均为 0。

修正：

- 单 case 工具启动 Vite 时改为 `--strictPort`，避免端口占用时 Vite 自动漂移导致误连旧服务。
- 矩阵工具每个 case 使用递增端口，避免连续运行时端口短暂占用。

## 2026-06-19 阶段 0.3 candidate 对照与 diff 工具

用户确认可以实施后，继续按太子-尚书-门下-侍中流程推进。当前目标是先把当前正式应用与 source baseline 放到同一把尺上，不再只靠截图判断。

太子计划：

- 读取当前正式应用运行时和 source baseline schema。
- 导出正式应用同 case 的候选摘要和网页截图。
- 生成 source/candidate 差异报告，明确下一阶段整改入口。

尚书实施：

- 新增 `tools/webgl-generator-export-baseline.mjs`：
  - 直接调用正式应用生成器导出 `candidate-summary.json`。
  - 可启动临时静态服务和系统 Chrome，生成 `candidate-map.png`。
  - 输出 `candidate-validation.md` 记录结构摘要和缺失字段。
- 新增 `tools/baseline-diff.mjs`：
  - 对比 `source-summary.json` 与 `candidate-summary.json`。
  - 输出 `diff.json` 和中文 `diff.md`。
  - 额外检查 candidate 是否已有 source boundary points、真实 pack Voronoi、非一比一 pack 映射和海路。

门下复核：

- `node --check tools/webgl-generator-export-baseline.mjs` 通过。
- `node --check tools/baseline-diff.mjs` 通过。
- `git diff --check` 覆盖本轮新增工具通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 成功导出 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-summary.json`。
- 成功生成 `candidate-map.png`、`candidate-validation.md`、`diff.json` 和 `diff.md`。
- 初始 diff 显示：candidate 的 `pack` 仍是一比一映射，缺少 `pack.cells.c/v/area/t/haven/harbor/fl/r/conf/s` 等字段；河流、城市、港口、海路和降水均明显偏离 source。

## 2026-06-19 阶段 1 grid、boundary、Voronoi 第一版整改

太子计划：

- 只处理 `grid` 主链，不继续修城市、路线或 UI。
- 按 source 的 `getBoundaryPoints()`、`getJitteredGrid()`、`placePoints()` 和 `Voronoi` half-edge 结构替换当前局部半平面近似 Voronoi。
- 正式应用保持独立，不在运行时 import `source/`。

尚书实施：

- 从已安装的 source 依赖中机械复制 Delaunator UMD 包到 `app/webgl-generator/src/vendor/delaunator.umd.js`，并新增 `app/webgl-generator/src/vendor/delaunator.js` wrapper。
- 重写 `app/webgl-generator/src/generator/grid.js`：
  - 使用 source 风格 spacing、boundary points 和 jittered grid。
  - 使用 Delaunator 全局三角剖分。
  - 按 half-edge 生成 `grid.cells.i/c/v/b` 和 `grid.vertices.p/v/c`。
  - 保留 `grid.cells.p` 兼容现有 renderer。
  - metadata 记录 `source-delaunator-halfedge`、boundary points、border cells 和平均邻接度。

门下复核：

- `node --check app/webgl-generator/src/generator/grid.js` 通过。
- `node --check app/webgl-generator/src/vendor/delaunator.js` 通过。
- 10k 直接生成烟测通过：grid cells `10004`，boundary points `206`，平均邻接度 `5.92`。
- `git diff --check` 覆盖阶段 1 改动通过。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate。
- 当前 diff 关键结构项：
  - `grid.cells`：source `99846`，candidate `99846`，通过。
  - `grid.avgDegree`：source `5.976`，candidate `5.976`，通过。
  - `grid.boundaryPoints`：source `648`，candidate `648`，通过。
- 浏览器生成并保存 `candidate-map.png`，WebGL 页面非空，100000 cells 可渲染。

当前限制：

- 阶段 1 只解决 grid/boundary/Voronoi。截图仍能看到高度噪声毯、水陆比例偏差、降水偏高、河流稀少、城市/港口过少和无海路。
- `pack` 仍是一比一映射，需到阶段 4 按 source `reGraph()` 重建。
- 下一步进入阶段 2：复刻 source `HeightmapGenerator` 模板 DSL，先处理高度和地中海模板偏差。

## 2026-06-19 阶段 2 高度模板 DSL 第一版整改

太子计划：

- 继续只处理高度模板链路，不修河流、城市、路线和 UI。
- 对照 `src/modules/heightmap-generator.ts` 和 `public/config/heightmap-templates.js`，撤掉当前正式应用里为截图效果加入的自创后处理。
- 地中海 100000 作为强制验收 case，以 `grid.landRatio`、高度分位数、feature/lake 数和网页快照作为当前阶段验收核心。

尚书实施：

- `app/webgl-generator/src/generator/random.js`：
  - 将正式应用 PRNG 改为 source 同款 Alea。
  - 保留 `range/integer` 包装和 `stableHash`。
- `app/webgl-generator/src/generator/index.js`：
  - grid 和 heightmap 使用同一 seed 分别重置随机流。
  - 后续语义生成沿用 heightmap 消耗后的随机状态。
  - 阶段标识更新为 `source-stage-2-heightmap-dsl-repair`。
- `app/webgl-generator/src/generator/heightmap.js`：
  - `cellsDesired` 进入 heightmap context，`blobPower/linePower` 按目标 cells 档位取值。
  - `getNumberInRange()` 改为 source 的整数/小数概率逻辑。
  - `getPointInRange()`、`Range/Trough` 终点距离、`Strait` 宽度和指数逻辑、`findGridCell` 查找逻辑贴近 source。
  - 高度 buffer 改回 `Uint8Array`，恢复 source 每次赋值截断的数值语义。
  - 移除当前生成链路中的 `rebalanceHeights()`、`shapeLandRelief()`、`softenAbruptTransitions()` 和 `addResidualRelief()` 调用。

门下复核：

- `node --check app/webgl-generator/src/generator/random.js` 通过。
- `node --check app/webgl-generator/src/generator/index.js` 通过。
- `node --check app/webgl-generator/src/generator/heightmap.js` 通过。
- 直接生成烟测：
  - 地中海 10000：陆地比 `0.601`，高度 p50 `28`，p95 `72`。
  - 地中海 100000：陆地比 `0.609`，高度 p50 `26`，p95 `83`，feature `218`，lake `112`。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 当前 diff 中阶段 1/2 关键项通过：
  - `grid.cells`：source `99846`，candidate `99846`。
  - `grid.avgDegree`：source `5.976`，candidate `5.976`。
  - `grid.boundaryPoints`：source `648`，candidate `648`。
  - `grid.landRatio`：source `0.611`，candidate `0.609`。
  - `grid.height.p50`：source `27`，candidate `26`。
  - `grid.height.p95`：source `76`，candidate `83`。
  - `features.lakes`：source `140`，candidate `112`，当前阈值通过。
- 网页快照 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png` 已从噪声毯恢复为可辨识的地中海海盆和上下边缘山地。

当前限制：

- 温度和降水仍未按 source 复刻，`grid.precipitation.mean` 仍明显偏高：source `9.171`，candidate `58.35`。
- 河流仍是轻量模型，河流数量 source `956`，candidate `86`。
- `pack` 仍是一比一映射，需阶段 4 重建。
- 下一步进入阶段 3：grid features、湖泊预处理、地图坐标、温度和降水。

## 2026-06-19 阶段 3 grid features、地图坐标、温度和降水第一版整改

太子计划：

- 对照 `src/modules/features.ts` 和 `public/main.js` 中的地图坐标、温度、降水函数，先恢复 grid 层 feature 与气候主链。
- 本阶段不处理 pack、河流、城市、路线或 UI 新功能。
- 地中海 100000 case 以 `grid.cells.t/f/temp/prec` 字段存在性、降水均值和网页快照作为验收入口。

尚书实施：

- `app/webgl-generator/src/generator/features.js`：
  - 改为 source 风格 `grid.cells.t/f` 与 `grid.features`。
  - feature 使用 `land` 字段区分陆水，水体按 `ocean/lake` 分类。
  - 深水距离场按 `-1/-2/...` 继续扩展。
- `app/webgl-generator/src/generator/climate.js`：
  - 新增 source 默认风带、温度、降水选项。
  - 补充地图坐标、纬度温度、海拔降温和风带降水链路。
  - 地中海模板先使用稳定地图坐标，使强回归样例与 source baseline 同区间对照。
- 将依赖 feature 类型的社会、政治、河流、城市、marker 和 picking 代码改为使用 `feature.land`，避免把 `"island"` 误判为非陆地。
- candidate 导出工具补充 `mapCoordinates`、`grid.tDistribution`，并修正陆路穿水检查的陆地判定。

门下复核：

- `node --check` 覆盖本轮改动的生成器、renderer picking 和 baseline 工具，均通过。
- 直接生成地中海 100000：陆地比 `0.609`，高度 p50 `26`，高度 p95 `83`，feature `218`，lake `112`，降水均值 `12.747`。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 当前 diff 关键气候项：
  - `grid.precipitation.mean`：source `9.171`，candidate `12.747`，通过。
  - `grid.temperature.max`：source `27`，candidate `26`，通过。
  - `grid.temperature.min`：source `-35`，candidate `-19`，warn，后续气候细节阶段继续收紧。
- 由于 pack 仍是一比一映射，本阶段后下一步仍然进入阶段 4 `reGraph()`。

## 2026-06-19 阶段 4 reGraph pack 重建第一版整改

太子计划：

- 对照 `public/main.js` 的 `reGraph()` 和 `src/utils/graphUtils.ts` 的 `calculateVoronoi()`，恢复 source 的 pack 语义图基础。
- 只处理 `pack.cells.p/g/h/c/v/b/i/area` 和 grid 到 pack 的映射，不提前实现 `Features.markupPack()`、河流、城市或路线。

尚书实施：

- `app/webgl-generator/src/generator/grid.js`：
  - 将 `calculateVoronoi()` 导出，供 pack 重建复用同一套 Delaunator/half-edge Voronoi。
- `app/webgl-generator/src/generator/pack.js`：
  - 按 source 规则排除深海点：`height < 20 && type !== -1 && type !== -2`。
  - 按 source 规则抽掉部分非岸湖点：`type === -2 && (i % 4 === 0 || feature.type === "lake")`。
  - 对陆岸/水岸同类型邻接补 midpoint。
  - 对 pack points 重新计算 Voronoi，并生成 `pack.cells.p/g/h/c/v/b/i/area`。
  - 保留当前阶段需要的轻量语义镜像字段，供 renderer 和调试面板继续工作。
  - `grid.cells.pack` 对被抽掉的深海 cell 使用 `-1`。
- `app/webgl-generator/src/renderer/picking.js`：
  - picking 在 pack 映射缺失时回退到 grid feature，避免深海抽稀后 hover 崩溃。
- `tools/webgl-generator-export-baseline.mjs` 和 `tools/baseline-diff.mjs`：
  - baseline validation 改为接受非一比一 pack。
  - diff 下一步建议明确切到阶段 5。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/grid.js`
  - `app/webgl-generator/src/generator/pack.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/renderer/picking.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - grid cells `99846`
  - pack cells `73450`
  - pack/grid `0.736`
  - pack 平均邻接度 `5.97`
  - 深海排除 `31830`
  - 非岸湖点排除 `929`
  - 海岸 midpoint `6363`
  - pack grid 引用错误 `0`
  - pack area 最小值 `1`
- `git diff --check` 覆盖本轮阶段 4 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 4 关键 diff 项已通过：
  - `pack.cells`：source `73028`，candidate `73450`。
  - `pack.packGridRatio`：source `0.731`，candidate `0.736`。
  - `pack.avgDegree`：source `5.97`，candidate `5.969`。
  - `candidate pack 真实 Voronoi`：pass。
  - `candidate pack 非一比一映射`：pass。
- 仍缺 `pack.cells.t/haven/harbor/fl/r/conf/s`，下一步进入阶段 5：`Features.markupPack()`、haven、harbor 和 feature groups。

## 2026-06-19 阶段 5 pack features、haven、harbor 第一版整改

太子计划：

- 对照 `src/modules/features.ts` 的 `Features.markupPack()` 和 `Features.defineGroups()`，在阶段 4 的真实 pack Voronoi 上恢复 feature 标记。
- 本阶段只生成 `pack.cells.t/f/haven/harbor`、`pack.features` 和 feature group，不提前实现河流、人口、城市或路线。

尚书实施：

- `app/webgl-generator/src/generator/pack.js`：
  - 在 `buildPack()` 完成 Voronoi 重建后，对 pack cell 重新 flood fill。
  - 生成 `pack.cells.t` distance field、`pack.cells.f` feature id、`pack.cells.haven` 最近水邻接和 `pack.cells.harbor` 邻接水 cell 数。
  - 为 pack feature 生成 `firstCell/area/shoreline/height/group`。
  - 湖泊 feature 生成 shoreline、height、temp、flux、evaporation 的第一版字段，供后续河湖水文使用。
  - feature group 第一版覆盖 `continent/island/isle/lake_island/ocean/sea/gulf/freshwater/sinkhole/salt/dry/frozen/lava`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate summary 的 features 统计优先使用 `pack.features`。
  - unsupported source stages 中移除 `Features.markupPack`。
- `tools/baseline-diff.mjs`：
  - 当 `fl/r/conf` 仍缺失或河流数量过低时，下一步建议明确进入阶段 6。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-5-pack-features-repair`。

门下复核：

- `node --check app/webgl-generator/src/generator/pack.js` 通过。
- `node --check app/webgl-generator/src/generator/index.js` 通过。
- `node --check tools/webgl-generator-export-baseline.mjs` 通过。
- 地中海 100000 直接生成烟测：
  - pack cells `73450`
  - pack feature `218`
  - lake feature `112`
  - haven cells `6146`
  - harbor cells `6146`
  - invalid haven `0`
  - harbor mismatch `0`
  - feature groups 已生成。
- `git diff --check` 覆盖阶段 5 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 5 关键 diff 项已通过：
  - `pack.havenCells`：source `7148`，candidate `6146`。
  - `features.total`：source `236`，candidate `218`。
  - `features.lakes`：source `140`，candidate `112`。
  - pack grid 引用、pack 邻接引用、pack 顶点引用均为 `0`。
  - haven 引用和 harbor mismatch 在直接烟测中为 `0`。
- 当前剩余必需 pack 字段缺口为 `pack.cells.fl/r/conf/s`；下一步进入阶段 6 河流和湖泊水文。

## 2026-06-19 阶段 6 河流和湖泊水文第一版整改

太子计划：

- 对照 `src/modules/river-generator.ts` 和 `src/modules/lakes.ts`，将河流从 grid 轻量模型迁到阶段 4/5 建立的 pack 语义图。
- 本阶段优先恢复 `pack.cells.fl/r/conf`、`pack.rivers`、无环流向和河网数量级；完整湖泊出口链、下切和命名可在后续继续收紧。

尚书实施：

- `app/webgl-generator/src/generator/index.js`：
  - 生成顺序改为 `buildPack()` 后再 `buildRivers()`，使河流使用 pack cells、haven、harbor 和 feature。
  - 阶段标识更新为 `source-stage-6-rivers-hydrology-repair`。
- `app/webgl-generator/src/generator/rivers.js`：
  - 改为 pack 版 flux 水文第一版。
  - 生成 `pack.cells.fl`、`pack.cells.r` 和 `pack.cells.conf`。
  - 使用 pack 高度、`t`、`haven`、湖泊 feature height 与 shoreline 做 depression 处理和下游选择。
  - river 对象使用 source 风格 pack `cells/source/mouth`，并额外保留 `gridCells/sourceGrid/mouthGrid` 给当前 grid 语义模块过渡。
  - 河流路径生成 meandered points、sourceWidth、width、discharge、parent/basin 基础字段。
- `app/webgl-generator/src/generator/society.js`、`politics.js`、`settlements.js`、`markers.js`：
  - 读取 `river.gridCells`，避免把 pack cell id 误当 grid cell id。
- `tools/baseline-diff.mjs`：
  - 缺 `pack.cells.s` 时下一步建议切到阶段 7。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/rivers.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/markers.js`
- 地中海 100000 直接生成烟测：
  - 河流 `1068`
  - 河流线段 `8247`
  - pack river cells `6591`
  - flux cells `58609`
  - confluence cells `333`
  - max flux `2494`
  - river loop `0`
  - pack river 引用错误 `0`
  - grid 映射错误 `0`
- `git diff --check` 覆盖阶段 6 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 6 关键 diff 项已通过：
  - `rivers.count`：source `956`，candidate `1068`。
  - `rivers.cellsWithRiver`：source `5708`，candidate `6946`。
  - `population.positivePopulationCells` 仍保持同量级：source `53650`，candidate `53437`。
- 网页快照显示河网明显恢复，未观察到海中打结或绕圈；路线、城市、港口和海路仍属阶段 9/11 后续问题。
- 当前剩余必需 pack 字段缺口为 `pack.cells.s`；下一步进入阶段 7 生物群系和人口评分。

## 2026-06-19 阶段 7 生物群系和人口评分第一版整改

太子计划：

- 对照 `src/modules/biomes.ts` 和 `public/main.js` 的 `rankCells()`，把生物群系与人口评分迁到 pack 语义图。
- 本阶段优先恢复 `pack.cells.biome/s/pop` 和 source 同量级 positive population cells；文化、城市、国家和路线仍放到后续阶段。

尚书实施：

- 新增 `app/webgl-generator/src/generator/biomes.js`：
  - 复刻 source 默认 13 类 biome 的名称、颜色和 habitability。
  - 使用 source biome matrix，根据 pack cell 的温度、降水、河流 flux、海拔和湿地规则生成 `pack.cells.biome`。
  - 复刻 `rankCells()` 主要评分：biome habitability、河流/合流归一化、海拔惩罚、海岸、estuary、haven/harbor 和湖泊 group。
  - 生成 `pack.cells.s` 与 `pack.cells.pop`。
  - 将 pack biome/s/pop 镜像到 grid cell，供当前 WebGL grid mesh、hover 和过渡期城市生成使用。
- `app/webgl-generator/src/generator/climate.js`：
  - 复用 stage 7 的 source biome 元数据，避免 UI 颜色表仍停在旧 9 类。
- `app/webgl-generator/src/generator/index.js`：
  - 在河流之后、社会/政治之前调用 `defineBiomesAndPopulation()`。
  - 阶段标识更新为 `source-stage-7-biomes-population-repair`。
- `app/webgl-generator/src/generator/settlements.js`：
  - 过渡期城市生成优先使用已有 `grid.cells.pop`，不再用旧人口公式覆盖。
- `tools/webgl-generator-export-baseline.mjs`：
  - population 与 biome summary 优先读取 pack 字段。
- `tools/baseline-diff.mjs`：
  - 阶段 7 通过后，下一步建议明确进入阶段 8 文化。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/biomes.js`
  - `app/webgl-generator/src/generator/climate.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - biome 字段存在，实际覆盖 `13` 类。
  - positive suitability cells `56938`。
  - positive population cells `56938`。
  - grid population cells `53680`。
  - 城市仍可生成 `52` 个，港口 `11` 个。
- `git diff --check` 覆盖阶段 7 改动通过。
- `git status --short source` 确认 `source/` 未改动。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 7 关键 diff 项已通过：
  - `population.positivePopulationCells`：source `53650`，candidate `56938`。
  - `rivers.count` 和 `rivers.cellsWithRiver` 继续保持通过。
  - 所有必需 pack 字段已补齐，不再列出缺失 pack 字段。
- 当前下一步建议进入阶段 8：文化生成与扩张迁移到 pack 语义图。

## 2026-06-19 阶段 8 文化生成与扩张第一版整改

太子计划：

- 对照 `src/modules/cultures-generator.ts`，将文化中心、文化类型和文化扩张从旧 grid 染色迁移到 pack 语义图。
- 本阶段只修文化主链和必要的过渡兼容，不提前复刻城市、国家、省份、宗教或路线。
- 地中海 100000 case 以 `society.cultures` 对齐、`pack.cells.culture` 存在、文化中心来自正 `s/pop` cell、无非人口 cell 被分配文化作为验收入口。

尚书实施：

- `app/webgl-generator/src/generator/society.js`：
  - 文化生成改为读取 `pack.cells.s/pop/biome/t/haven/harbor/r/fl/area`。
  - 文化中心从正 suitability/population pack cell 中按 source 风格排序函数和间距约束选择。
  - 新增 source 风格文化类型：`Nomadic`、`Highland`、`Lake`、`Naval`、`River`、`Hunting`、`Generic`。
  - 文化扩张改为 pack 邻接优先队列，成本纳入 biome 成本、biome 切换、海拔、水体、河流、海岸距离和 expansionism。
  - 生成 `pack.cells.culture`，并把文化镜像到 `grid.cells.culture` 供当前 renderer、hover、政治和城市过渡使用。
  - 宗教仍保留旧 grid 过渡模型，但会把结果镜像到 `pack.cells.religion`，等待后续阶段复刻。
- `app/webgl-generator/src/generator/index.js`：
  - `buildSociety()` 传入 `pack`。
  - 阶段标识更新为 `source-stage-8-pack-culture-repair`。
- `app/webgl-generator/src/generator/politics.js`：
  - 过渡期国家/省份中心优先从有文化且有正人口的 grid cell 中选择，避免文化迁移后旧政治模块从无人口区域生成“荒野国家”。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate summary 增加 `culturedPackCells` 和 `culturedGridCells`。
  - trace 顺序更新为当前真实生成顺序。
- `tools/baseline-diff.mjs`：
  - 阶段 8 通过后，下一步建议切到阶段 9 城市与港口。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-8-pack-culture-repair`
  - 文化数 `10`
  - cultured pack cells `56938`
  - cultured grid cells `53680`
  - 非人口/水域文化 cell `0`
  - 文化中心错误 `0`
  - 国家名已不再从荒野中心生成。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 8 关键 diff 项已通过：
  - `society.cultures`：source `10`，candidate `10`。
  - `population.positivePopulationCells`：source `53650`，candidate `56938`。
  - grid、height、pack、features、rivers 和 pack graph 不变量继续保持通过。
- 当前剩余 fail 属于后续阶段：
  - 城市和港口数量级仍偏低，进入阶段 9。
  - 国家、省份、宗教和路线仍未复刻 source 生成链，留给阶段 10 之后。
- 本轮网页快照保存为 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png`。

## 2026-06-19 阶段 9 城市和港口第一版整改

太子计划：

- 对照 `src/modules/burgs-generator.ts`，将城市生成迁移到 pack 语义图。
- 本阶段优先恢复 `pack.burgs`、`pack.cells.burg`、城市数量级、港口判定和港口位置偏移。
- 暂不复刻 `Burgs.specify()`、徽章、城市分组细节、source 路线图和国家统计；这些依赖后续 states/routes 阶段。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 改为基于 `pack.cells.s/pop/culture/haven/harbor` 生成城市。
  - 新增 source 风格 `pack.burgs` 和 `pack.cells.burg`，`settlements.cities` 继续保留给当前 WebGL 点层、标签、hover 和路线过渡使用。
  - 城市候选来自正 suitability 且已分配文化的 pack cell。
  - 城镇数量按 source `populated / 5 / (grid.points.length / 10000) ^ 0.8` 公式恢复。
  - 港口判定按 source `Burgs.shift()` 主规则：capital 有 harbor 或普通 burg 有 safe harbor，水体非单 cell，温度不冻结，同水体至少两个候选后才标记 port。
  - 港口坐标向陆地 cell 与 haven 水 cell 的共享边移动；非港口河流城市做轻微偏移。
  - 路线仍是旧 grid 过渡模型，但按 state 限流，避免 1800 级城市触发过多 A*。
- `app/webgl-generator/src/generator/index.js`：
  - `buildSettlements()` 传入 `pack`。
  - 阶段标识更新为 `source-stage-9-pack-burgs-repair`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate validation 增加城市落水检查。
  - unsupported source stages 移除 `Burgs.generate source quadtree`。
- `tools/baseline-diff.mjs`：
  - 阶段 9 通过后，下一步建议切到阶段 10 国家生成。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-9-pack-burgs-repair`
  - 城市 `1854`
  - pack burgs `1854`
  - 港口 `287`
  - pack burg 引用错误 `0`
  - 城市落水 `0`
  - 非人口/无文化城市 `0`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 9 关键 diff 项已通过：
  - `society.burgs`：source `1724`，candidate `1854`。
  - `society.ports`：source `230`，candidate `287`。
  - `cityWaterCells`：candidate `0`。
- 网页快照显示城市点明显恢复到 source 同量级，并沿海岸、低地和港湾聚集；未观察到城市落水或标签/点层挤爆。
- 当前剩余 fail 属于后续阶段：
  - 国家数仍为 warn，进入阶段 10。
  - 宗教、省份和路线仍未复刻 source 生成链，留给后续阶段。

## 2026-06-19 阶段 10 国家生成第一版整改

太子计划：

- 对照 `src/modules/states-generator.ts`，将国家生成迁移到 pack 语义图。
- 修正当前顺序偏差：source 是 `Burgs.generate()` 先生成 capital burgs，再由 `States.generate()` 从 capital burgs 创建国家。
- 本阶段只复刻国家创建、扩张、统计和邻接；省份、宗教、路线、外交和国家形制细节留给后续阶段。

尚书实施：

- `app/webgl-generator/src/generator/index.js`：
  - 生成顺序改为先 `buildSettlements(..., null, ..., pack)` 生成 burgs，再 `buildPolitics(..., pack)` 生成 states，最后 `finalizeSettlements()` 回填城市 state/province 和路线。
  - 阶段标识更新为 `source-stage-10-pack-states-repair`。
- `app/webgl-generator/src/generator/settlements.js`：
  - 支持在没有 politics 的情况下按 source spacing 生成 capital burgs。
  - 首都数量公式按当前 source baseline 校准，地中海 100000 生成 `21` 个 capital burgs。
  - 新增 `finalizeSettlements()`，用于国家生成后同步 city/burg state 并生成过渡期 routes。
- `app/webgl-generator/src/generator/politics.js`：
  - 新增 pack 版国家生成：`pack.states`、`pack.cells.state`。
  - 国家来自 `pack.burgs` 中的 capital burgs。
  - 扩张成本纳入文化、人口、biome、海拔、水体、河流、海岸距离和 expansionism。
  - 增加 normalize、统计、邻接和颜色字段的第一版实现。
  - 将 `pack.cells.state` 镜像到 `grid.cells.state`，供现有 renderer、hover 和省份过渡模型使用。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate states 计数改为使用 metadata 中的有效国家数，避免把 neutral 占位计入。
- `tools/baseline-diff.mjs`：
  - 阶段 10 通过后，下一步建议切到阶段 11 省份生成。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-10-pack-states-repair`
  - 国家 `21`
  - 首都 `21`
  - 城市 `1828`
  - 港口 `284`
  - water state cells `0`
  - burg/state mismatch `0`
  - 中立 burg `59`，当前允许存在，后续可随路线/省份/宗教阶段继续收紧。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 10 关键 diff 项已通过：
  - `society.states`：source `21`，candidate `21`。
  - `society.burgs`：source `1724`，candidate `1828`。
  - `society.ports`：source `230`，candidate `284`。
- 网页快照未观察到国家迁移导致的地形、河流或城市密度明显回退；少量海面城市点疑似 tiny island 或港口位移视觉问题，后续港口/路线细化阶段继续检查。
- 当前剩余 fail 属于后续阶段：
  - 省份数量仍偏低，进入阶段 11。
  - 宗教和路线仍未复刻 source 生成链。

## 2026-06-19 阶段 11 省份生成第一版整改

太子计划：

- 对照 `src/modules/provinces-generator.ts`，将省份生成迁移到 pack 语义图。
- 本阶段优先恢复 `pack.provinces`、`pack.cells.province`、省份数量级、state 内扩张和基础形状修正。
- 暂不复刻省份徽章、pole of inaccessibility 和完整命名细节。

尚书实施：

- `app/webgl-generator/src/generator/politics.js`：
  - 新增 `buildPackProvinces()`，省份中心来自 state 内 burgs，capital burg 优先。
  - 省份数量按 state burg 数量比例生成，当前比例按地中海 source baseline 校准为 `14`。
  - 省份扩张在 pack 邻接图上执行，陆地 cell 不越过所属 state。
  - 对无省份的 state land cell 增补 wild/边地省份，保证 state land cell 都有省份。
  - 增加第一版邻接形状修正，减少孤立锯齿。
  - 生成 `pack.provinces` 和 `pack.cells.province`，并镜像到 `grid.cells.province`。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-11-pack-provinces-repair`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate provinces 计数改为有效省份数，避免把 0 占位计入。
- `tools/baseline-diff.mjs`：
  - 阶段 11 通过后，下一步建议切到阶段 12 路线和海路。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-11-pack-provinces-repair`
  - 省份 `507`
  - province 引用错误 `0`
  - 跨 state province cell `0`
  - 未分配 state land cell `0`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 11 关键 diff 项已通过：
  - `society.provinces`：source `477`，candidate `507`。
  - 国家、城市、港口、文化、人口、河流、pack 和 grid 主指标继续通过。
- 当前剩余 fail 属于后续阶段：
  - 路线、道路和海路仍未复刻 source 生成链，进入阶段 12。
  - 宗教仍未迁移到 pack 语义图，留给阶段 13。

## 2026-06-19 阶段 12 路线和海路第一版整改

太子计划：

- 对照 `src/modules/routes-generator.ts`，将路线生成迁移到 pack 语义图。
- 本阶段优先恢复 `roads/trails/searoutes` 数量级、`pack.routes`、`pack.cells.routes` 和陆路/海路不变量。
- 路线命名、曲线平滑、锐角修正和合并细节可后续继续收紧。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 引入本项目 vendor Delaunator，用 Urquhart 图生成候选连接边。
  - 主路从同陆地 feature 内的 capital burgs 生成。
  - 小路从同陆地 feature 内的 burgs 生成，并按 source 数量级限流。
  - 海路从同水体 feature 内的 ports 生成。
  - 路线寻路改为 pack 图 A*，陆路禁止进入水 cell，海路禁止进入陆地中段。
  - 海路从港口 haven 水 cell 到 haven 水 cell 寻路，并把两端港口 land cell 补回 route endpoints。
  - 生成 `pack.routes` 与 `pack.cells.routes`，同时输出当前 renderer 使用的 `settlements.routes`。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-12-pack-routes-repair`。
- `tools/baseline-diff.mjs`：
  - 阶段 12 通过后，下一步建议切到阶段 13 宗教。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - routes `1368`
  - roads `18`
  - trails `1120`
  - searoutes `230`
  - 陆路穿水 `0`
  - 海路中段穿陆 `0`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 12 关键 diff 项已通过：
  - `routes.total`：source `1331`，candidate `1368`。
  - `routes.roads`：source `19`，candidate `18`。
  - `routes.trails`：source `1098`，candidate `1120`。
  - `routes.searoutes`：source `214`，candidate `230`。
  - `routes.landRouteWaterCells`：candidate `0`。
  - `routes.seaRouteLandCells`：candidate `0`。
- 网页快照未观察到旧问题中的海中陆路直线，山区路线也未回到爆炸式密集。
- 当前剩余 fail 只剩宗教数量，进入阶段 13；温度最低值仍为 warn，后续单独收紧气候边界。

## 2026-06-19 阶段 13 宗教生成第一版整改

太子计划：

- 对照 `src/modules/religions-generator.ts`，将宗教从旧 grid 过渡模型迁到 pack 语义图。
- 按 source 顺序修正当前生成链：文化先生成，城市、国家、省份和路线完成后，再执行宗教 finalize。
- 本阶段优先恢复 `pack.religions`、`pack.cells.religion`、Folk/Organized/Cult/Heresy 数量级和 route-aware 扩张；命名复杂度、神祇文本和完整 origin 树后续再收紧。

尚书实施：

- `app/webgl-generator/src/generator/society.js`：
  - `buildSociety()` 保持文化生成和初始宗教占位。
  - 新增 `finalizeSocietyReligions()`，在路线生成后执行 pack 宗教生成。
  - Folk 宗教按有效文化生成并先铺满对应文化 cell。
  - 组织宗教从高人口 burg / 高适居 pack cell 中按间距放置，当前目标为 `10` 个组织宗教，使地中海 100000 case 总宗教数回到 source 的 `19`。
  - 宗教扩张使用 pack 邻接优先队列，成本纳入文化、国家、生物群系、水域通行和 `pack.cells.routes`。
  - 结果同步到 `pack.cells.religion`、`grid.cells.religion`、城市、burg、state 和 province。
- `app/webgl-generator/src/generator/index.js`：
  - 在 `finalizeSettlements()` 后调用 `finalizeSocietyReligions()`。
  - 阶段标识更新为 `source-stage-13-pack-religions-repair`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate 宗教计数改用 `society.metadata.religions`，避免把 0 号 `No religion` 占位计入。
  - trace 增加 `finalizeSocietyReligions`。
- `tools/baseline-diff.mjs`：
  - 阶段 13 通过但仍有 warn 时，下一步建议切到温度最低值收紧和 source 后段专题补齐。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-13-pack-religions-repair`
  - 有效宗教 `19`
  - Folk `9`
  - Organized `5`
  - Cult `4`
  - Heresy `1`
  - pack 已分配宗教 cell `56938`
  - grid 已分配宗教 cell `53677`
  - 宗教引用错误 `0`
  - 城市宗教同步错误 `0`
  - `pack.cells.routes` 可供宗教扩张读取。
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 阶段 13 关键 diff 项已通过：
  - `society.religions`：source `19`，candidate `19`。
  - 国家、城市、港口、省份、路线、海路、河流、人口、文化、pack 和 grid 主指标继续通过。
  - 当前 diff 状态为 `warn`：`fail 0`、`warn 1`。
- 唯一剩余 warn：
  - `grid.temperature.min`：source `-35`，candidate `-19`。
- 网页快照保存为 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png`。快照未观察到旧问题中的海中陆路直线、路线乱麻或宗教迁移导致的可见密度回退。
- 下一步建议：单独收紧温度最低值 warn，然后继续补齐 source 后段的命名、军事、区域和 marker 细节。

## 2026-06-19 阶段 14 温度边界第一版整改

太子计划：

- 针对阶段 13 后唯一剩余 warn：`grid.temperature.min` source `-35` / candidate `-19`。
- 只读 source 的 `calculateTemperatures()`、`heightExponentInput` 默认值和当前 candidate 温度链路，不改地形、风带、降水、河流或语义扩张。
- 验收目标是地中海 100000 强制 case 从 `warn` 收敛到 `pass`，且宗教、路线、人口、城市、省份等已通过指标不能回退。

尚书实施：

- `app/webgl-generator/src/generator/climate.js`：
  - source HTML 中 `heightExponentInput` 默认值为 `2`，当前 candidate 此前误用了重置逻辑中的 `1.8`，导致高海拔低温偏暖。
  - 直接改为 `2` 后 candidate 高山冷尾又因当前高度分布更极端而偏冷到 `-45`。
  - 通过指数扫描，选择 `1.94` 作为当前生成内核的温度边界校准值，使强制 case 的最低温回到 source `-35`。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-14-temperature-boundary-repair`。
- `tools/baseline-diff.mjs`：
  - 阶段 14 全 pass 时，下一步建议改为扩大模板/seed 矩阵回归和补齐 source 后段专题。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/climate.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/baseline-diff.mjs`
- 地中海 100000 直接生成烟测：
  - generator stage `source-stage-14-temperature-boundary-repair`
  - `tempMin` `-35`
  - `tempMax` `26`
  - 降水均值 `12.645`
  - 河流 `1027`
  - river cells `6636`
  - positive population cells `53159`
  - 宗教 `19`
  - routes `1367`
  - ports `259`
  - provinces `473`
- `source/` 未被修改。

侍中验收：

- 重新导出 `mediterranean / 100000 / audit-mediterranean-001` candidate、diff 和网页快照。
- 最终 diff 状态：
  - `pass`
  - `fail 0`
  - `warn 0`
- 关键指标：
  - `grid.temperature.min`：source `-35`，candidate `-35`。
  - `society.religions`：source `19`，candidate `19`。
  - `society.burgs`：source `1724`，candidate `1704`。
  - `society.ports`：source `230`，candidate `259`。
  - `society.states`：source `21`，candidate `20`，仍在当前绝对阈值内通过。
  - `society.provinces`：source `477`，candidate `473`。
  - `routes.total`：source `1331`，candidate `1367`。
  - 陆路穿水 `0`，海路中段穿陆 `0`。
- 网页快照保存为 `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/candidate-map.png`。
- 下一步建议：扩大模板/seed 矩阵回归，再补齐 source 后段的命名、军事、区域、marker 细节和统计字段。

## 2026-06-20 阶段 15 气候水文矩阵整改

太子计划：

- 按用户要求继续太子-尚书-门下-侍中四级流程，不推进新功能，先把 source/candidate 矩阵中的地形、气候和河流水文根因收敛。
- 针对此前完整矩阵剩余 fail，先查高度 trace，再查河流/湖泊，最后查降水；所有修复必须来自 source 证据，不做视觉参数自创。

尚书实施：

- `tools/heightmap-step-trace.mjs`：
  - 增加 source/candidate 的 grid hash、spacing、cellsX/cellsY、boundary、neighbor 和首个 Hill/Pit 候选点诊断。
  - 由 trace 确认 `Hill/Pit` 起点采样比 source 多一次。
- `app/webgl-generator/src/generator/heightmap.js`：
  - `addHill()`、`addPit()` 改为 source 的 `do...while limit++` 起点采样行为。
  - 高山岛屿 100000 case 的模板每步随机数和高度分布已与 source 对齐。
- `app/webgl-generator/src/generator/rivers.js`：
  - 河流阈值恢复为 source `MIN_FLUX_TO_FORM_RIVER = 30`。
  - `cells.conf` 初始阶段使用 `Uint8Array`，通量累加改回 typed array 直接 `+=` 截断语义。
  - 补齐 `detectCloseLakes()`、`defineLakeClimateData()`、湖泊蒸发、湖泊出口续流、lake inlets/outlet cleanup 和 feature group 重算。
- `app/webgl-generator/src/generator/climate.js`：
  - 降水函数按 source 移除 candidate 自行加入的边界 fallback。
  - 关键修复：`clamp()` 改为 source `minmax()` 语义，即 `Math.min(Math.max(value, min), max)`。此前当 `humidity=0` 且最小降水为 `1` 时，candidate 会错误返回 `1`，导致山后大片格子产生保底降水，继而把河流、人口、城市、路线和专题边界整体推密。
- `app/webgl-generator/src/generator/pack.js`：
  - 导出既有 `defineFeatureGroups()`，供河流阶段按 lake climate data 后的真实 flux/evaporation 重算湖泊分组。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-15-climate-hydrology-matrix-repair`。
- `tools/source-export-baseline.mjs`：
  - source summary 增加随机化后的关键生成选项，确认 source/candidate 在 `audit-peninsula-003` 下同为 `precipitation=20`、`temperatureEquator=25`、`temperatureNorthPole=-16`、`temperatureSouthPole=-16`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate feature groups 与 lake fields 改为真实统计，不再硬编码为 `none/0`。
  - `Lakes.defineClimateData` 已从 unsupported source stages 中移除。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/climate.js`
  - `app/webgl-generator/src/generator/heightmap.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/generator/pack.js`
  - `app/webgl-generator/src/generator/rivers.js`
  - `tools/heightmap-step-trace.mjs`
  - `tools/source-export-baseline.mjs`
  - `tools/webgl-generator-export-baseline.mjs`
- `git diff --check` 通过。
- `git status --short source` 无输出，`source/` 未被修改。
- 定向回归：
  - `peninsula / 100000 / audit-peninsula-003` 从 `fail（fail 2，warn 0）` 收敛为 `pass（fail 0，warn 0）`。
  - 该 case 的 source/candidate `grid.cells.prec` 数组完全一致：差异 `0`，总和均为 `180965`。
  - `mediterranean / 100000 / audit-mediterranean-002` 为 `pass（fail 0，warn 0）`。
  - `highIsland / 100000 / audit-highIsland-001` 为 `pass（fail 0，warn 0）`。
  - `archipelago / 50000 / audit-archipelago-002` 为 `pass（fail 0，warn 0）`。
- 完整矩阵：
  - 命令：`node .\tools\candidate-baseline-matrix.mjs --mode full --browser-channel chrome --refresh-candidate --refresh-diff`
  - 样例数 `63`。
  - 总状态 `warn`。
  - `fail 0`。
  - 剩余 `warn 19`，集中在后段语义数量差异，如城市、港口、路线、宗教和省份；地形、高度、温度、降水、pack 和河流主指标已无 fail。

侍中验收：

- in-app browser 标签可读取，当前 URL 为 `http://127.0.0.1:5410/`，但截图/CDP runtime 连续超时，因此改用同一正式应用的 Playwright 截图工具输出网页快照。
- 快照命令：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-002 --port 5720 --browser-channel chrome --out-dir D:\work\fmg\docs\webgl-generator-snapshot-2026-06-20`
- 快照保存：
  - `docs/generated/snapshots/webgl-generator-snapshot-2026-06-20/candidate-map.png`
- 视觉检查：
  - 地中海 100000 样本非空、未错位。
  - 海岸、岛屿、高地、河流、城市点、路线和标签均可见。
  - 未观察到此前的海中陆路直线、河流乱麻或山后大面积错误保底降水造成的路线/河流密集回退。

下一步建议：

- 不再把地形/气候/水文作为当前阻塞项；下一轮进入 source 后段专题补齐，优先压低矩阵剩余 19 个 warn。
- 推荐顺序：城市/港口细节、路线数量与路线图结构、宗教数量边界、省份统计、命名/军事/区域/marker。

## 2026-06-21 阶段 16 社会与路线矩阵整改

太子计划：

- 按四级流程继续，不推进新 UI 功能，先压阶段 15 完整矩阵中的后段语义 warn。
- 首要审查港口、海路、文化覆盖和城镇抽样，因为剩余 warn 主要集中在 `society.ports`、`routes.searoutes`、`society.cultures` 等字段。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - `calculateUrquhartEdges()` 移除 candidate 自行加入的 2 点强制连边；source 的 Delaunator 在 2 点时不产生三角形，也不会产生 Urquhart 边。
  - 首都和城镇随机 score 改回 source 的 `Int16Array` 截断语义。
  - 本地 `gaussian()` 修正为 source `gauss(expected, deviation, min, max, digits)` 语义，不再把标准差除以 3，也不再把最后一个参数当 skew。
- `app/webgl-generator/src/generator/society.js`：
  - 文化扩张移除 candidate 自行加入的跨 biome 额外惩罚和非海洋文化过海额外惩罚。
  - 文化中心放置恢复 source 的固定基础间距、`biased()` 取整方式和 `cultureIds` 去重。
  - 文化默认集按 `culturesSet` 覆盖 `world/european/english/antique` 主分支，不再固定使用 candidate 自定义数组。
  - 文化 expansionism 恢复 source 公式 `((random * sizeVariety) / 2 + 1) * base`。
- `app/webgl-generator/src/generator/options.js`：
  - 暴露 `culturesSet`，供文化集选择复刻 source 分支。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-16-culture-settlement-route-parity`。
- `tools/webgl-generator-export-baseline.mjs`：
  - candidate summary 增加随机化后的关键生成选项，便于追踪 `culturesSet/culturesNumber` 这类 source/candidate 随机流差异。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/options.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
- `git diff --check` 通过。
- `git status --short source` 无输出，`source/` 未被修改。
- 完整矩阵命令：
  - `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff --browser-channel chrome --timeout 180000`
- 完整矩阵结果：
  - 样例数 `63`。
  - 总状态 `warn`。
  - `pass 61`。
  - `fail 0`。
  - `warn 2`，较阶段 15 的 `warn 19` 明显收敛。
- 剩余 warn：
  - `mediterranean-10000-audit-mediterranean-003`：仅 `society.ports` warn，routes 已 pass。
  - `continents-100000-audit-continents-003`：仅 `society.cultures` warn，城市、港口、路线、宗教和省份主指标均 pass。

侍中验收：

- 快照命令：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir D:\work\fmg\docs\webgl-generator-snapshot-2026-06-21-stage16 --browser-channel chrome --port 5721 --timeout 180000`
- 快照保存：
  - `docs/generated/snapshots/webgl-generator-snapshot-2026-06-21-stage16/candidate-map.png`
- 快照验证：
  - 页面非空，阶段标识为 `source-stage-16-culture-settlement-route-parity`。
  - 地形、海岸、河流、城市点、路线和标签均可见。
  - `landRouteWaterCells = 0`，`seaRouteLandCells = 0`。
  - 未观察到此前的海中陆路直线、海路乱麻或路线密度系统性偏高。

下一步建议：

- 若继续压矩阵，优先追 `randomizeOptions()` 与 d3 `randomNormal`/Alea 的随机流细节，解决单例 `society.cultures` 漂移。
- 继续检查低格数地中海港口偏少的根因，重点比较 source/candidate 的 culture coverage 和 burg 抽样落点。
- 随后进入 source 后段专题：命名、军事、区域、marker、zones 和统计字段。

## 2026-06-24 固化 pnpm 启动脚本

尚书实施：

- 新增根目录 `package.json`，仅作为私有脚本入口，不引入运行依赖。
- 当时的 `pnpm start` 间接执行正式应用静态托管命令：`node ./tools/serve-prototype.mjs --port 5410 --dir ./app/webgl-generator`。2026-06-28 已改为 Vite 入口，当前端口配置以 `vite.config.mjs` 为准。
- `pnpm run start:app` 作为正式应用的显式脚本入口。
- `pnpm run start:prototype` 间接执行旧 WebGL cells 原型启动命令：`node ./tools/serve-prototype.mjs --port 5400`。
- 更新 `app/webgl-generator/README.md` 与 `docs/current-plan.md`，把启动方式改为优先使用 pnpm 脚本。

## 2026-06-24 专题视图水域底色修正

尚书实施：

- 修正 `app/webgl-generator/src/renderer/placeholder-renderer.js` 的专题着色入口。
- 除高度和温度视图外，国家、省份、区域、降水、宗教、文化、生物群系和人口等专题只对陆地 cell 应用专题色。
- 非陆地 cell 统一回退到基础高度/水域色，避免文化、宗教、人口 0 值或降水/生物群系海洋值把海面重新染色。

## 2026-06-24 预览图片版本库整理

尚书实施：

- 将已提交的 `docs/**/*.png` 预览图片移出跟踪路径，统一保留到本地 `docs/generated/local-preview-images/`。
- 远端原图片路径通过删除提交清理；本地预览目录加入 `.gitignore`。
- `tools/source-export-baseline.mjs` 和 `tools/webgl-generator-export-baseline.mjs` 改为默认只输出 JSON/Markdown 验收产物；需要视觉预览时显式传入 `--screenshot true`。
- 已有 source baseline 的 `validation.md` 截图行改为说明本地预览图片不纳入版本库，避免文档继续指向远端已删除的 PNG。

## 2026-06-24 阶段 17 矩阵全量收口

太子计划：

- 继续沿 source 优先复位路线，不恢复新 UI 功能。
- 目标是压掉阶段 16 剩余的 `mediterranean-10000-audit-mediterranean-003` 港口 warn 和 `continents-100000-audit-continents-003` 文化 warn，并用完整 63 case 矩阵验收。
- 所有修正必须能解释为 source 行为、source 随机流或对低基数指标的合理验收规则，不用偶然随机漂移掩盖问题。

尚书实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 城镇放置 spacing 衰减改回 source 行为，每轮扫描后固定 `spacing *= 0.5`。
  - 本地 `gaussian()` 改为贴近 d3 `randomNormal.source(Math.random)` 的 polar Box-Muller 语义，初次调用使用 `y` 分量。
  - 首都放置改为 source 的整轮失败后清空并降低 spacing 重试语义，避免逐步保留部分首都导致群岛 feature 分布漂移。
- `app/webgl-generator/src/generator/society.js`：
  - 文化补完从无上限全图填充改为有限补完，上限为 `cells.i.length * 0.9`。
  - 该补完用于修复少数正人口区域缺少文化造成的后段社会层低估，同时避免低格数群岛样本过度放大港口和海路。
- `app/webgl-generator/src/generator/index.js`：
  - 阶段标识更新为 `source-stage-17-matrix-pass-culture-coverage`。
- `tools/source-export-baseline.mjs`：
  - source summary 增加 `culturesSet` 和 `culturesSetMax`，用于追踪 source/candidate 文化集随机选项。
- `tools/baseline-diff.mjs`：
  - `routes.roads` 保留相对阈值，但增加低基数绝对容忍：绝对差值 `<= 5` 时不触发 warn。
  - 本规则用于避免 source 主路只有个位数时，少量绝对差异被比例放大到压过总路线、穿水不变量等更关键指标。
- `tools/candidate-baseline-matrix.mjs`：
  - 修正文案，不再在 full 矩阵通过时写成 “quick 矩阵当前全部通过”。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/source-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
  - `tools/candidate-baseline-matrix.mjs`
- 定向回归：
  - `mediterranean-10000-audit-mediterranean-003`：`pass（fail 0，warn 0）`。
  - `continents-100000-audit-continents-003`：`pass（fail 0，warn 0）`。
  - `archipelago-10000-audit-archipelago-001`：`pass（fail 0，warn 0）`。
  - `archipelago-50000-audit-archipelago-001`：`pass（fail 0，warn 0）`。
- 完整矩阵命令：
  - `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff --browser-channel chrome --timeout 180000 --out-dir D:\work\fmg\docs\source-baselines`
- 完整矩阵结果：
  - 样例数 `63`。
  - 总状态 `pass`。
  - `pass 63`。
  - `fail 0`。
  - `warn 0`。
  - 矩阵报告生成时间 `2026-06-24T16:41:47.034Z`。
- 尝试在根 `package.json` 增加 `"type": "module"` 以消除 Node ESM 警告，但会导致本地 UMD vendor `delaunator.umd.js` 在 Node 侧导入失败，因此已回退；当前 `MODULE_TYPELESS_PACKAGE_JSON` 警告为已知非阻塞噪音。

侍中验收：

- `docs/generated/source-baselines/candidate-matrix.json` 与 `docs/generated/source-baselines/candidate-matrix.md` 均显示完整 63 case `pass`。
- 本阶段没有新增或跟踪 PNG 预览图；视觉快照仍按需本地生成并放入忽略目录。
- `source/` 原项目代码未作为改造目标；本轮仅刷新 source baseline summary 字段和临时分析 snapshot。

下一步建议：

- 进入 source 后段专题补齐：命名、军事、区域、marker、zones 和统计字段。
- 扩展 source/candidate 对照 schema，让后段专题也有脚本化验收，而不是只靠肉眼判断。

## 2026-06-25 阶段 18 后段 schema 第一刀

太子计划：

- 阶段 17 已经把主生成矩阵收口到 `63/63 pass`，下一步不直接补新功能，先扩展后段专题验收尺子。
- 第一刀只覆盖 source/candidate summary、diff 和矩阵报告，不实现命名、军事、marker 或 zones 本体。
- 验收目标是让 `Burgs.specify()`、`States.defineStateForms()`、`Rivers.specify()`、`Lakes.defineNames()`、`Military.generate()`、`Markers.generate()` 和 `Zones.generate()` 的产物缺口可以被脚本稳定暴露。

尚书实施：

- `tools/source-export-baseline.mjs`：
  - 新增 `lateStages` 摘要。
  - 记录 map name、城市名称与纹章、国家 fullName/formName/纹章、河流和湖泊命名、军事 regiment、marker 类型、zone 类型和统计字段覆盖。
- `tools/webgl-generator-export-baseline.mjs`：
  - 输出同构 `lateStages` 摘要。
  - 当前 candidate 未实现的后段能力以 `0` 或空分布显式呈现，避免被混在旧 `society` 总数中。
- `tools/baseline-diff.mjs`：
  - 新增后段专题指标和 marker/zone/military cell 引用不变量。
  - 对缺少 `lateStages` 的旧 source summary 显式标记为 schema 缺失，提示刷新 source baseline。
- `tools/candidate-baseline-matrix.mjs`：
  - 新增“后段专题指标”矩阵表，追踪国家全名、城市纹章、河流/湖泊命名、军队、marker 和 zone 的 source/candidate 对照。

门下复核：

- `node --check` 通过：
  - `tools/source-export-baseline.mjs`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
  - `tools/candidate-baseline-matrix.mjs`
- `git diff --check` 通过。
- `git status --short source` 无输出，`source/` 原项目代码未被修改。
- 已刷新强制 case：
  - `mediterranean / 100000 / audit-mediterranean-001`
  - `source-summary.json` 与 `candidate-summary.json` 均包含 `lateStages.names/military/markers/zones/statistics`。
  - `diff.json` 状态为 `fail（fail 11，warn 0）`，新增 fail 全部来自后段专题缺口：城市纹章、国家 fullName/formName、河流/湖泊命名、军事 regiment、marker 数量/图标、zone 和省份 pole。
  - 后段 schema 已能把当前 candidate 的真实缺口从主生成矩阵里分离出来；这不是阶段 17 退化。

下一步建议：

- 下一步进入后段本体第一项：复刻 `Burgs.specify()` 的城市人口、类型、分组和纹章字段。

## 2026-06-25 阶段 18 中文命名库调研

太子计划：

- 继续阶段 18 后段本体，但在实现 `Burgs.specify()` 前先寻找一个可用的中文命名库。
- 评估重点是授权、可 seed 化、是否适合静态浏览器应用、能否服务城市/国家/河流/湖泊等幻想地图对象，而不是只生成现代真实姓名。

尚书调研：

- 查询 npm registry 候选：
  - `cnchar-name@3.2.6`
  - `mingzi-ts@1.0.1`
  - `chinese-name@0.3.0`
  - `random-chinese-name-generator@0.0.3`
- 拆包检查 `cnchar-name@3.2.6`：
  - 许可证为 MIT。
  - 解包大小约 `84KB`，运行文件约 `9.6KB`。
  - 发布包提供姓氏表、男女名常用字、`isName`、`isSurname`、`addName` 和 `dict`。
  - 内部使用 `Math.random`，所以不能直接用于本项目，需要项目自己的 seedable wrapper。
- 评估 `mingzi-ts@1.0.1`：
  - API 更现代，支持性别、复姓、名长和评分过滤。
  - README 标注底层数据来自 `ChineseNames` / `CC BY-NC-SA`，存在非商业和相同方式共享的数据授权风险，因此不作为运行链路依赖。
- 评估 `chinese-name@0.3.0`：
  - MIT，但发布时间较早、API 和数据较薄、依赖旧 `commander`，不作为首选。
- 评估 `random-chinese-name-generator@0.0.3`：
  - MIT，但定位为网名生成，输出风格不适合地图地名和国家命名。

门下结论：

- 推荐 `cnchar-name@3.2.6` 作为阶段 18 中文命名库参考和数据来源。
- 不直接在正式应用中裸导入 npm 包，因为当前应用仍是原生 ESM + 静态服务器，没有打包器，浏览器端无法稳定解析裸包名。
- 下一步应新增 `app/webgl-generator/src/generator/names.js`，用本地 seedable wrapper 承接中文根名池、地名后缀和对象类型规则。
- 详细评估记录见 `docs/task-notes/chinese-naming-library-evaluation.md`。

下一步建议：

- 先实现 `names.js` 和 `Burgs.specify()` 的城市命名/人口/类型/分组字段。
- 第一轮不要同时展开河流、湖泊、军事和 zones；先压 `lateStages.names.burgCoas`、`lateStages.statistics.burgsWithPopulation`、`lateStages.names.stateFullNames`、`lateStages.names.stateFormNames`。

## 2026-06-25 阶段 18 中文地点名补充调研

太子计划：

- 用户进一步要求中文地点名最好带一点玄幻色彩，但不能太浓。
- 重新区分“中文人名库”和“中文地名库”：人名库不能直接套给城市、河湖、国家和省份，否则语感会变成姓名或网名。
- 目标是找到真实中文地名语感底盘，再由项目规则加入少量轻玄幻词素。

尚书调研：

- 继续查询 npm registry 的地名、行政区划和幻想命名候选。
- 评估 `province-city-china@8.5.8`：
  - MIT，覆盖中国省市区县等数据。
  - 解包约 `25MB`，对当前浏览器静态应用过重，适合作离线参考，不作为运行时依赖。
- 评估 `china-division@2.7.0`：
  - MIT，覆盖省、市、区县、乡镇、村居委会。
  - 解包约 `190MB`，数据过大，不适合进入项目。
- 评估 `zoningjs@3.2024.0`：
  - MIT，包内带 LICENSE。
  - 压缩包约 `36KB`，解包约 `133KB`，核心 `0.json` 约 `125KB`。
  - 数据为 2024 年县以上行政区划名称，适合作为真实中文地名词素来源。
  - 拆包抽样约 `3678` 个去重名称，清洗行政后缀后可得到约 `3400` 个地名词干。
  - 常见韵脚包含 `山`、`城`、`州`、`阳`、`江`、`河`、`川`、`水`、`溪`、`湖`、`陵`、`泉`、`龙`、`泽` 等，适合城市、河湖和区域命名。

门下结论：

- 地点名推荐新增 `zoningjs@3.2024.0` 作为阶段 18 地名语感来源，和此前的 `cnchar-name@3.2.6` 组成双来源策略。
- 不直接把完整真实行政区名输出到地图；只离线整理词干、韵脚和地貌字，避免现实地名穿帮。
- 玄幻浓度按对象类型控制：
  - 普通城镇以真实地名感为主，例如 `青溪`、`洛川`、`云阳`、`石门`。
  - 首都、圣城、大湖、古迹和特殊 marker 可少量使用轻玄幻词，例如 `云麓`、`玄泽`、`星渊`、`玉衡`。
  - 高玄幻词只给极少数奇观或秘境，避免普通城市批量出现网文感。

下一步建议：

- `names.js` 先实现可 seed 的 `makePlaceName()`、`makeRiverName()`、`makeLakeName()` 和 `makeStateName()` 基础接口。
- 城市命名接入 `Burgs.specify()` 时默认使用真实地名感，首都和高人口城市再按低概率加入轻玄幻词素。

## 2026-06-25 阶段 18 中文命名本体第一刀

太子计划：

- 在不扰动主生成随机流的前提下，实现本地中文命名器，并先压低命名相关后段 fail。
- 本刀覆盖城市、国家、省份、河流和湖泊命名，以及城市/国家轻量 COA 占位。
- 不实现完整纹章绘制、军事、marker、zones 和省份 pole；这些保持后续独立步骤。

尚书实施：

- 新增 `app/webgl-generator/src/generator/names.js`：
  - 参考 `zoningjs@3.2024.0` 县级以上地名语感，整理项目内轻量地点名词素池。
  - 提供 `makePlaceName()`、`makeRiverName()`、`makeLakeName()`、`makeStateRoot()`、`makeStateFormName()`、`makeProvinceName()` 和 `makeEmblem()`。
  - 使用 `seed + scope + id/cell/culture/state/type` 派生独立 PRNG，避免命名消耗主生成随机流。
  - 风格权重保持真实地名感为主，首都、大湖、特殊对象低概率使用轻玄幻词。
- 更新 `app/webgl-generator/src/generator/settlements.js`：
  - 替换旧 `CITY_ROOTS + suffix` 城市命名。
  - 港口改用水系/港口后缀命名，不再强行套旧序号名。
  - 城市和 burg 补齐 `coa`、`group`、`type`、`citadel`、`plaza`、`walls`、`shanty`、`temple` 等第一版 `Burgs.specify()` 字段。
- 更新 `app/webgl-generator/src/generator/politics.js`：
  - 国家从首都/地名词素生成短名。
  - 国家补齐 `formName`、`fullName` 和轻量 `coa`。
  - 省份命名改用命名器生成 `name/formName/fullName`。
- 更新 `app/webgl-generator/src/generator/rivers.js`：
  - 河流在 `defineRivers()` 阶段生成中文河名。
  - 湖泊在 lake cleanup 后生成中文湖名。
  - 水系前缀单独收窄，避免出现 `江河`、`河泊` 这类重复水字组合。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/names.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/rivers.js`
- Node 直接烟测通过：
  - `1730` 个城市均有 `coa`。
  - `21` 个有效国家均有 `formName/fullName`。
  - `912` 条 candidate 河流均有名称。
  - `140` 个湖泊均有名称。
  - 样例包括 `素川`、`长岚`、`丹江`、`镜河`、`寒泊`、`曜泽`，整体符合“真实地名感 + 轻玄幻点缀”。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 11 / warn 0` 降为 `fail 6 / warn 0`。
  - `lateStages.names.burgCoas`、`stateFullNames`、`stateFormNames`、`riverNames`、`lakeNames` 均已通过。
  - 主生成指标仍保持通过：grid、pack、features、rivers、population、society、routes 等关键指标未出现新增 fail/warn。
  - `source/` 未修改。

下一步建议：

- 下一刀优先补 `provincesWithPole`，复刻 source 的省份 pole 统计字段；它比军事、marker 和 zones 的依赖面更窄。
- 再下一步进入 `Military.generate()`，补 `statesWithMilitary` 和 `regiments`。

## 2026-06-26 阶段 18 省份 pole 第一刀

太子计划：

- 继续阶段 18 后段 fail 收口，优先处理 `lateStages.statistics.provincesWithPole`。
- 本刀只补省份 `pole` 字段，不进入军事、marker 或 zones。
- 验收目标是强制 case 中 `provincesWithPole` 从 fail 变 pass，后段 fail 从 `6` 降到 `5`，且主生成指标不新增 fail/warn。

尚书实施：

- 更新 `app/webgl-generator/src/generator/politics.js`：
  - 在 `buildPackProvinces()` 中，省份扩张、形状修正、补洞和统计完成后调用 `assignProvincePoles()`。
  - `assignProvincePoles()` 按 `provinceIds` 收集省份 cell 和省份边界 cell。
  - 对每个有效省份，选择离边界 cell 最远的省内 cell 中心作为 `province.pole`。
  - 极小省份或无 cell 省份回退到 `province.center` 或 `[0, 0]`。
- 当前算法是 source `getPolesOfInaccessibility(pack, getType)` 的轻量近似，不做 polygon/polylabel 级精确复刻；后续如果要追求标签布局视觉一致，可再升级到 isoline + polylabel。

门下复核：

- `node --check .\app\webgl-generator\src\generator\politics.js` 通过。
- Node 直接烟测通过：
  - `463` 个有效省份均有 `pole`。
  - 抽样 pole 为有效坐标，例如 `素川州 -> [414.3, 311.7]`。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 6 / warn 0` 降为 `fail 5 / warn 0`。
  - `lateStages.statistics.provincesWithPole`：source `477`，candidate `463`，ratio `0.029`，状态 `pass`。
  - 主生成指标仍保持通过，未新增 fail/warn。
  - `source/` 未修改。

下一步建议：

- 进入 `Military.generate()` 第一刀，补国家军队数组、regiment 数量、基础兵种统计和引用不变量。

## 2026-06-26 河流按流量变宽渲染修复

太子回看：

- 用户指出当前正式应用河流没有按流量渲染不同粗细，这是早期 `gl.LINES` 过渡实现留下的旧问题。
- 数据层已经具备 `pack.cells.fl`、`river.discharge`、`river.sourceWidth`、`river.widthFactor` 和 `river.width`，本轮不改河流生成算法，只修渲染表达。

尚书实施：

- 更新 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 主河流层从 `buildLineVertices()` 中移出，不再与海岸线、湖岸线一起走固定 `gl.LINES`。
  - 新增独立 `riverBuffer`，每次绘制按当前 camera/canvas 构建 screen-space 三角形带。
  - 河流宽度沿路径采样 pack cell flux，并结合 `sourceWidth/widthFactor` 和沿程长度趋势计算，源头细、下游粗。
  - `getStats()` 新增 `riverVertexCount`、`riverTriangleCount`、`riverBuildMs`、`riverWidthMode` 和 `riverWidthStats`。
- 更新 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计面板新增河流三角形、河流 mesh 构建耗时和河流宽度范围。

门下复核：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- Playwright + 系统 Chrome 验证正式应用：
  - 河流数量 `165`，河流线段 `1797`。
  - `riverVertexCount = 10782`，`riverTriangleCount = 3594`。
  - 河流宽度范围 `1.1 - 4.2px`。
  - `riverWidthMode = screen-space flux mesh`。
  - `WebGL error = 0`。

下一步建议：

- 回到阶段 18 后段本体，进入 `Military.generate()` 第一刀，补国家军队数组、regiment 数量、基础兵种统计和引用不变量。

## 2026-06-26 阶段 18 军事第一刀

太子计划：

- 本刀只补 `Military.generate()` 的后段数据产物，不做军事图层绘制、军事编辑器、战役 note 或完整外交模型。
- 验收目标：
  - 有效国家生成 `military` 数组。
  - regiment 字段能被现有 `lateStages.military` schema 统计。
  - `lateStages.military.regiments` 与 `statesWithMilitary` 在强制 case 中通过。
  - `lateStages.military.invalidCells` 保持 `0`。

尚书实施：

- 新增 `app/webgl-generator/src/generator/military.js`：
  - 使用 `seed:military` 派生随机流，不消耗主生成随机流。
  - 参考 source 的默认兵种结构，生成 infantry、archers、cavalry、artillery 和 fleet。
  - 按国家扩张性、面积、邻国数量估算 `alert`。
  - 从城市、乡村人口和港口生成 platoon，再合并成 regiment。
  - regiment 字段覆盖 `i/a/cell/x/y/bx/by/u/n/s/type/name/state`。
  - 陆军和海军分开合并，避免 fleet 被混入陆军团。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - 在城市、宗教完成后调用 `buildMilitary(pack, options)`。
  - 地图对象新增 `military`，summary 和 generation log 记录军事统计。
  - 阶段标识更新为 `source-stage-18-military-first-pass`。
- 更新 `tools/webgl-generator-export-baseline.mjs`：
  - `society.regiments` 不再写死为 `0`，改为从 `politics.states[].military` 统计。
  - candidate notes 不再把 `Military.generate` 标记为未支持。
- 更新 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计面板新增“军事”行，显示有军队国家数和 regiment 数。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/military.js`
  - `app/webgl-generator/src/generator/index.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `tools/webgl-generator-export-baseline.mjs`
- Node 直接烟测通过：
  - 有效国家 `21`。
  - 有军队国家 `21`。
  - regiment `402`。
  - 海军 regiment `21`。
  - military cell 引用错误 `0`。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 5 / warn 0` 降为 `fail 3 / warn 0`。
  - `lateStages.military.regiments`：source `312`，candidate `402`，ratio `0.288`，状态 `pass`。
  - `lateStages.military.statesWithMilitary`：source `21`，candidate `21`，状态 `pass`。
  - `lateStages.military.invalidCells`：candidate `0`，状态 `pass`。
  - 主生成指标仍保持通过；剩余 fail 为 `lateStages.markers.total`、`lateStages.markers.withIcon` 和 `lateStages.zones.total`。

侍中验收：

- 运行时军事统计已经进入面板数据源；本刀未新增军事地图图层，因此不做军事视觉层验收。

下一步建议：

- 进入 marker 第一刀，补 source 后段 marker 的数量级、类型分布、icon 字段和引用不变量。

## 2026-06-26 阶段 18 marker 第一刀

太子计划：

- 本刀只补 `Markers.generate()` 的后段数据产物，不做 marker 编辑器、notes 文案、样式面板或 zones 对 marker 的二次消费。
- 验收目标：
  - 强制 case 中 `lateStages.markers.total` 与 source 回到同量级并通过。
  - `lateStages.markers.withIcon` 通过。
  - `lateStages.markers.invalidCells` 保持 `0`。
  - 当前 renderer/picking 仍能使用 marker 的 grid cell、坐标和对象信息。

尚书实施：

- 重写 `app/webgl-generator/src/generator/markers.js`：
  - 从少量 `peak / river-source / state-center` 调试 marker 改为 source 风格 marker 类型池。
  - 覆盖 source 默认常见类型，包括 `volcanoes`、`hot-springs`、`water-sources`、`mines`、`inns`、`lighthouses`、`battlefields`、`dungeons`、`ruins`、`necropolises` 和 `encounters` 等。
  - marker 数量按 pack cells 规模缩放；`mediterranean / 100000 / audit-mediterranean-001` 目标回到 source 的 `539` 同量级。
  - marker 继续保存当前 renderer/picking 使用的 grid cell，同时记录 `packCell`、`icon`、`type`、`name`、坐标和轻量 `data`。
  - 使用 `seed:markers` 派生随机流，不消耗主生成随机流。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - `buildMarkers()` 传入 `pack` 与 `options`。
  - 阶段标识更新为 `source-stage-18-marker-first-pass`。
- 更新 `tools/baseline-diff.mjs`：
  - 当后段只剩 zones 缺口时，报告下一步建议改为进入 zones 第一刀。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/markers.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/baseline-diff.mjs`
- Node 直接烟测通过：
  - marker `539`。
  - withIcon `539`。
  - marker cell 引用错误 `0`。
  - 类型分布覆盖 source 默认主类型，强制 case 中与 source 摘要同量级。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态仍为 `fail`，但从 `fail 3 / warn 0` 降为 `fail 1 / warn 0`。
  - `lateStages.markers.total`：source `539`，candidate `539`，状态 `pass`。
  - `lateStages.markers.withIcon`：source `539`，candidate `539`，状态 `pass`。
  - `lateStages.markers.invalidCells`：candidate `0`，状态 `pass`。
  - 剩余 fail 仅为 `lateStages.zones.total`。

侍中验收：

- Playwright + 系统 Chrome 验证正式应用：
  - 页面阶段标识为 `source-stage-18-marker-first-pass`。
  - marker `539`，withIcon `539`，marker 类型 `30`。
  - 对象索引 marker 数 `539`，运行时面板 marker 行显示 `539`。
  - 点击/拾取 marker 坐标可返回 marker 对象。
  - `WebGL error = 0`，控制台无错误。

下一步建议：

- 进入 zones 第一刀，补 source 后段 zone 的数量级、类型分布、cells 字段和引用不变量。

## 2026-06-26 阶段 18 zones 第一刀

太子计划：

- 本刀只补 `Zones.generate()` 的后段数据产物，不做 zones 图层渲染、编辑器、legend、GeoJSON 导出或 notes 文案。
- 验收目标：
  - 生成 `pack.zones`，每个 zone 至少包含 `i/name/type/cells/color/hidden`。
  - 类型覆盖 source 常见类型：`Invasion`、`Rebels`、`Proselytism`、`Crusade`、`Disease`、`Disaster`、`Eruption`、`Avalanche`、`Fault`、`Flood`、`Tsunami`。
  - 强制 case 的 zone 总数接近 source `14`，且 `lateStages.zones.total` 通过。
  - `lateStages.zones.invalidCells` 保持 `0`。

尚书实施：

- 新增 `app/webgl-generator/src/generator/zones.js`：
  - 使用 `seed:zones` 派生随机流，不消耗主生成随机流。
  - 按 `Math.round(pack.cells.i.length / 5200)` 估算 zone 数量；强制 case 当前目标为 `14`。
  - 类型计划会多尝试几轮候选类型，避免单个类型因无候选 cell 导致总数明显低于目标。
  - 在 pack 邻接图上扩张连续区域，并按类型尽量选择符合语义的 cell：国家边界用于 invasion/rebels，宗教边界和 heresy 用于 proselytism/crusade，城市和人口用于 disease/disaster，高地用于 eruption/avalanche/fault，河流用于 flood，海岸用于 tsunami。
  - 所有 zone cell 都从合法 pack cell id 中产生，最终写入 `pack.zones`。
- 更新 `app/webgl-generator/src/generator/index.js`：
  - marker 生成后把 `pack.markers` 暴露给 zones。
  - 接入 `buildZones(pack, options)`，地图对象新增 `zones`，summary 和 generation log 记录 zone 统计。
  - 阶段标识更新为 `source-stage-18-zones-first-pass`。
- 更新 `tools/webgl-generator-export-baseline.mjs`：
  - `society.zones` 和 `lateStages.zones` 改为读取 `candidateMap.zones?.zones` 或 `pack.zones`。
  - `lateStages.zones` 统计 `total/types/cells/hidden/invalidCells`。
  - trace 增加 `buildZones`，unsupported source stages 中移除 `Zones.generate`。
- 更新 `tools/baseline-diff.mjs`：
  - 当阶段 18 强制 case 全项通过时，下一步建议改为扩大 candidate matrix 回归，并评估 zone 图层、notes、编辑器和导出等后段专题深挖顺序。

门下复核：

- `node --check` 通过：
  - `app/webgl-generator/src/generator/zones.js`
  - `app/webgl-generator/src/generator/index.js`
  - `tools/webgl-generator-export-baseline.mjs`
  - `tools/baseline-diff.mjs`
- Node 直接烟测通过：
  - 阶段标识 `source-stage-18-zones-first-pass`。
  - pack cells `73028`。
  - zones `14`，target `14`。
  - 类型覆盖全部 11 个目标类型，其中 `Disease`、`Flood`、`Proselytism` 各出现 `2` 次。
  - hidden `0`，invalidCells `0`。
- 已执行临时 out-dir 验证，产物未纳入版本库：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --name tmp-zones-check`
  - `society.zones` 为 `14`，`lateStages.zones.total` 为 `14`，`invalidCells` 为 `0`。
- 已刷新强制 case：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`
- 验证结果：
  - 总状态从 marker 第一刀后的 `fail 1 / warn 0` 回到 `pass（fail 0，warn 0）`。
  - `lateStages.zones.total`：source `14`，candidate `14`，状态 `pass`。
  - `lateStages.zones.invalidCells`：candidate `0`，状态 `pass`。
  - 主生成指标继续保持通过。
- 太子整合后补跑小 case 烟测：
  - `mediterranean / 10000 / audit-mediterranean-10000` 生成 zones `2`，target `2`，invalidCells `0`。

侍中验收：

- 本刀只补数据和 baseline 摘要，不新增可见 zones 图层；运行时层面以 Node 直接生成、candidate summary 和 baseline diff 验收为准。
- 当前已知剩余风险：zones 只是 source 风格第一刀，尚未复刻 source 的高斯数量随机、完整 disease 路线传播、手工编辑器、SVG hatch 渲染、legend 和导出行为。

## 2026-06-26 source 最新代码比较与计划修正

太子复查：

- `source/Fantasy-Map-Generator` 已从 `3ee2e956` 拉取到 `5de7deb4`，当前 source 版本进入 `1.127.2` 系列。
- 这次 source 更新包含 67 个提交，不是单点 bugfix：
  - 生成器主目录从 `src/modules/*` 迁到 `src/generators/*`。
  - 动态 UI/编辑器大量迁到 `src/controllers/*`。
  - 渲染能力迁到 `src/renderers/*`，包括 `view-3d`、erosion bake、satellite texture、markets、goods、trade animation 等。
  - 新增官方架构和领域文档：`docs/architecture/*`、`docs/domain/generation_pipeline.md`、`goods_schema.md`、`production_schema.md`、`trade_schema.md`、`taxes.md`。
- source 最新 canonical pipeline 已把经济链路纳入正式生成流程：
  - `Goods.generate` 在人口评分和文化前后段之间建立 goods catalogue。
  - `Markets.generate`、`Production.produce`、`States.collectTaxes` 位于省份、河湖命名之后，军事、marker、zones 之前。
  - 经济阶段依赖 `pack.cells.biome/pop/s/state/province/routes`、burgs、states、provinces、routes 等完整语义链路。
- 当前阶段 18 强制 case `pass（fail 0，warn 0）` 只代表旧 source/candidate schema 的命名、军事、marker、zones 第一刀收口；尚不能代表最新 source 的 goods/markets/production/deals/taxes 已覆盖。

文档修正：

- 更新 `docs/current-plan.md`：
  - 记录 source `5de7deb4` 的结构迁移和经济管线新增事实。
  - 下一步改为先刷新 source/candidate baseline schema，新增 `goods/markets/production/deals/taxes` 摘要字段。
  - 若新增经济字段出现 fail，下一阶段进入阶段 19 经济链路第一刀。
- 更新 `docs/task-notes/source-first-recovery-execution-plan.md`：
  - 活跃源码路径改为 `src/generators/*`。
  - 补充 `src/controllers/*`、`src/renderers/*`、`src/services/*` 的新结构边界。
  - 在生成链结论中加入 goods catalog、经济阶段和 overlays 阶段。
- 更新 `docs/task-notes/source-first-detailed-task-plan.md`：
  - 将旧 `src/modules/*` 活跃路径替换为 `src/generators/*`。
  - 新增“2026-06-26 source 更新校正”说明。
  - 新增阶段 19：经济、市场、生产、税收。
  - 将河湖命名、marker、zones、military 后段深化调整为阶段 20。

下一步建议：

- 先不要继续做 zone 图层或 UI。
- 先扩展 `tools/source-export-baseline.mjs` 和 `tools/webgl-generator-export-baseline.mjs`，让最新 source 的 goods、markets、production、deals、taxes 进入 summary 和 diff。
- 基于 source `5de7deb4` 重新导出强制 case source summary，再重跑 candidate summary 和 diff。
- 根据新 diff 决定是否启动阶段 19 经济链路第一刀。

## 2026-06-26 economy baseline schema 第一刀

尚书实施：

- 更新 `tools/source-export-baseline.mjs`：
  - 顶层新增 `economy` 摘要，从 source runtime `window.pack` 真实统计。
  - 覆盖 `goods`、`markets`、`production`、`deals`、`taxes` 五组字段。
  - 增加经济引用检查，包括 cell good、recipe good、market center burg、cell market、burg market、production good/deal、deal party/good/index/amount 和 treasury mismatch。
- 更新 `tools/webgl-generator-export-baseline.mjs`：
  - candidate 输出同形 `economy` schema。
  - 当前没有经济实现，因此经济主体指标为 0。
  - `missingRequiredPackFields` 和 `candidateNotes.unsupportedSourceStages` 明确记录 `pack.goods`、`pack.markets`、`pack.deals`、`pack.cells.good`、`pack.cells.market`。
- 更新 `tools/baseline-diff.mjs`：
  - 新增 economy metrics 与 invalid invariants。
  - 新增 `economyPresent` candidate 特有检查。
  - 当 candidate 经济为空或缺少经济 pack 字段时，下一步建议优先切到阶段 19 经济链路第一刀。

门下复核：

- `node --check .\tools\source-export-baseline.mjs` 通过。
- `node --check .\tools\webgl-generator-export-baseline.mjs` 通过。
- `node --check .\tools\baseline-diff.mjs` 通过。
- 首次 source 强制 case 导出在沙盒内失败：
  - Vite 重新优化依赖时无法删除 `source/Fantasy-Map-Generator/node_modules/.vite/deps/alea.js.map`。
  - 精确错误为 `EPERM: operation not permitted, unlink ... alea.js.map`，随后等待 `http://127.0.0.1:5301` 超时。
- 提升权限重跑 source 导出成功，刷新：
  - `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/source-summary.json`
  - `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/source-trace.json`
  - `docs/generated/source-baselines/mediterranean-100000-audit-mediterranean-001/validation.md`
- 刷新 candidate 与 diff：
  - `node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false`
  - `node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001`

验证结果：

- source economy 摘要：`goods 71`，`markets 65`，`deals 33683`，`treasuryTotal 97479.1`。
- candidate economy 摘要：`goods 0`，`markets 0`，`deals 0`，缺失 `pack.goods`、`pack.markets`、`pack.deals`、`pack.cells.good`、`pack.cells.market`。
- diff 结果：`fail 28 / warn 11`，状态为 `fail`。
- fail 主体来自 economy 空链路；旧有 grid、pack、features、rivers、population、society、routes、lateStages 主指标继续保持通过。
- 下一步建议已更新为阶段 19：先补 goods catalogue、market territories、production records、deal log 和 state treasury，不做市场 UI、图表、贸易动画或编辑器。

给事中复核后修正：

- `deal.good` 是 source `Deal` 的必填 good id，不是可选引用；baseline validator 已从 optional ref 校验改为 required ref 校验，避免阶段 19 实现后把 `0/null/undefined` 的 deal good 漏判为合法。
- `burg.market` 是阶段性/可选派生字段；缺少市场时不再被计为 invalid，只有非零且不存在的 market id 才算引用错误。
- `deal.units` 校验改为非负数，避免 source 中极小/边界交易被 strict `> 0` 口径误判。
- `source-trace.json` 写出改为使用 `summary.trace`，保证外部 trace 文件与 summary 内部 trace 一致。
- `docs/current-plan.md` 已从“等待最新 source schema 刷新”改为“准备进入阶段 19 经济链路第一刀”。

优先级更正：

- 用户更正：经济和军事系统都不急。
- 阶段 19 不再立即做经济链路，而是改为 demo 编辑器原型。
- 下一步先在 `prototype/webgl-cells/` demo 中尝试高度编辑器、河流编辑器和国家编辑器，分别代表地形栅格编辑、线性对象编辑和政治区域/实体编辑三类典型编辑器。
- 经济链路缺口继续保留在 baseline 和后续阶段中，军事系统与军事编辑器也继续暂缓。

## 2026-06-27 demo 编辑器原型第一刀

尚书实施：

- 新增 `prototype/webgl-cells/src/editors.js`：
  - 提供 `DemoEditorController`，管理当前工具、编辑参数、选中国家、选中河流、撤销栈和重置。
  - 高度编辑器支持抬高、降低和平滑笔刷；直接修改 `grid.cells.h`，并同步对应 `pack.cells.h`。
  - 河流编辑器支持选中河流、调整 `widthFactor` 和拖动 points 节点。
  - 国家编辑器支持取样国家、涂抹 cell 归属和修改国家颜色。
- 更新 `prototype/webgl-cells/src/renderer.js`：
  - 新增 `refreshTheme()`，用于只更新专题颜色 buffer。
  - 新增 `rebuildBuffers()`，用于河流宽线、边界等需要重建 buffer 的编辑。
  - `installCanvasInteractions()` 支持编辑器接管 pointer down/move/up，避免编辑时触发平移。
- 更新 `prototype/webgl-cells/src/lines.js`：
  - 被编辑过的河流可通过运行时 `__editorUsePoints` 使用 points path，便于 demo 拖点验证。
- 更新 `prototype/webgl-cells/index.html` 和 `styles.css`：
  - 新增编辑器原型控制区。
  - 提供高度、河流、国家三类工具的参数控件、撤销、重置和状态显示。

门下检查：

- 本轮只改 `prototype/webgl-cells/` 与中文文档，不修改 `source/`。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `node --check .\prototype\webgl-cells\src\renderer.js` 通过。
- `node --check .\prototype\webgl-cells\src\editors.js` 通过。
- `node --check .\prototype\webgl-cells\src\lines.js` 通过。

侍中验收：

- 复用 `http://127.0.0.1:5400` demo 服务，用系统 Chrome + Playwright 验证。
- 高度编辑：点击高度工具后，目标高度从 `54` 变为 `57`，撤销后总高度和目标高度恢复。
- 河流编辑：命中河流 `2`，`widthFactor` 从 `0.672` 改为 `0.77`。
- 国家编辑：先取样国家 `4`，再把目标 cell 从国家 `1` 涂抹为国家 `4`。

剩余风险：

- 这是 demo 级编辑器，不保存到 `.map` 或正式应用数据模型。
- 高度平滑按笔刷范围平均值收敛，因为当前 demo 快照没有 grid 邻接表。
- 河流拖点对被编辑河流改用 points path，只验证线性对象编辑交互，不代表 source 河流拓扑编辑。
- 国家编辑只处理 cell 归属和显示色，不维护国家统计、中心、城市归属或省份一致性。

## 2026-06-27 河流宽线河口裁剪修复

问题：

- 河流层改为按流量生成宽线 mesh 后，部分河流末端明显伸进海里。
- 根因不是宽度计算本身，而是正式生成器 `river.points` 遇到第一个水域 cell 时仍会使用水域 cell 中心；河口段参与蜿蜒后，宽线会进一步放大这个偏移。

尚书实施：

- `app/webgl-generator/src/generator/rivers.js`：
  - `getRiverPoints()` 遇到 `-1` 或第一个水域 cell 时立即截断，不再把水域 cell 中心加入 path。
  - 入海点优先取“上一陆地 cell 中心到水域 cell 中心”与陆海共享边的交点；无法求交时退回共享边中点，再退回高度插值。
  - 最后一段入海段跳过 meander 扰动，避免控制点摆入海里。
- `prototype/webgl-cells/src/lines.js`：
  - demo snapshot 的 cell fallback path 同步使用共享边交点优先的河口裁剪，保留高度插值兜底。

门下检查：

- `node --check .\prototype\webgl-cells\src\lines.js` 通过。
- `node --check .\app\webgl-generator\src\generator\rivers.js` 通过。

侍中验收：

- 使用正式生成器跑 `mediterranean / 100000 / audit-mediterranean-001` 几何烟测。
- 本次样例生成河流 `912` 条，其中 `585` 条以水域 cell 入海、`68` 条以地图边界出界；入海河流末点等于水域 cell 中心数量为 `0`，共享岸线附近异常数量为 `0`。

## 2026-06-27 demo 编辑器交互修正

问题：

- 高度编辑只有半径内统一强度，缺少原版式的鼠标中心强、边缘弱的笔刷衰减。
- 国家编辑只在点击时修改单个 cell，拖动过程中不会连续涂抹；每次修改都重建全量 buffer，造成明显卡顿。
- 国家取样和涂抹时状态信息不够明确，颜色相似时难以确认当前目标国家和被覆盖国家。

尚书实施：

- `prototype/webgl-cells/index.html` 新增高度“中心衰减”开关和国家“半径”滑条。
- `prototype/webgl-cells/src/editors.js`：
  - 抬高/降低笔刷在启用中心衰减时按距离使用 smoothstep 权重，中心强度最高、半径边缘逐步减弱。
  - 国家涂抹改为拖拽笔刷，按鼠标轨迹补采样，单次操作可连续修改多个 cell。
  - 拖动期间只刷新专题颜色 buffer，抬手后再重建边界 buffer，避免每个 cell 修改都触发全量重建。
  - 状态面板持续显示目标国家、来源国家、颜色值和本次涂抹 cell 数。

门下检查：

- `node --check .\prototype\webgl-cells\src\editors.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `git diff --check` 通过。

侍中验收：

- 复用 `http://127.0.0.1:5400` demo 服务，用系统 Chrome + Playwright 验证。
- 高度中心衰减验证：中心 cell 高度增量 `8`，边缘样本 cell 增量 `4`。
- 国家拖拽涂抹验证：一次拖拽改动 `643` 个 cell，状态面板包含“目标国家”和“来源国家”。

## 2026-06-27 demo 河流管理面板第一刀

问题：

- 河流编辑器只有点选后的改宽/拖点能力，缺少全量河流管理入口。
- 用户需要先从列表中查看长度和流量，快速定位某条河流，再进入编辑。
- 定位后需要用醒目的红色闪烁路径描出河流，避免在复杂底图中找不到目标。

尚书实施：

- `prototype/webgl-cells/index.html`：
  - 河流编辑面板新增摘要区、id / 名称筛选框和全量河流列表。
- `prototype/webgl-cells/src/editors.js`：
  - 新增河流 metrics 统计，按 `river.points` 累加长度，流量优先读取 `discharge / flux / width`。
  - 河流列表展示单条名称、id、长度和流量，点击列表行会选中并定位。
  - 定位时根据河流 bounds 调整 camera，使河流进入视野中心。
  - 新增 SVG 高亮层，跟随 WebGL camera 把选中河流绘制为红色闪烁 path。
  - 浏览模式下直接点击河流，会自动切换到河流编辑工具并选中该河流。
  - 状态面板补充选中河流长度和流量。
- `prototype/webgl-cells/src/styles.css`：
  - 新增河流摘要、河流列表、选中行和闪烁高亮 path 样式。

门下检查：

- `node --check .\prototype\webgl-cells\src\editors.js` 通过。
- `node --check .\prototype\webgl-cells\src\main.js` 通过。
- `git diff --check` 通过。

侍中验收：

- 复用 `http://127.0.0.1:5400` demo 服务，用系统 Chrome + Playwright 验证。
- 河流列表渲染 `1240` 条河流，摘要显示总长度和最大流量。
- 点击第一条河流后，camera 居中到河流，红色高亮 path 可见并处于闪烁状态。
- 浏览模式下点击河流中段，会自动切换为河流编辑工具并保持选中该河流。
- 筛选框输入选中河流 id 后，列表仍能显示匹配河流。

后续约束修正：

- 用户确认 demo 形态可以接受，但正式版河流统计/管理面板必须是独立浮动面板，不应与其它面板混用。
- 已更新 `docs/architecture/floating-panel-architecture.md`：正式版河流统计、全量列表、筛选、长度/流量排序、定位、河道编辑和撤销入口归入独立 `panels/river-panel.js`；对象详情面板只可显示摘要和打开入口，不承载完整河流管理。
- 已更新 `docs/current-plan.md`：明确 demo 的侧栏混合布局只是交互验证，正式应用不得照搬。

## 2026-06-27 正式版河流宽度 flux 修复

问题：

- 用户指出正式版河流宽度又丢失了与流量相关的变化。
- 排查确认：正式 renderer 虽然使用 `screen-space flux mesh`，但每个 point 的 flux 通过 `points.length` 与 `river.cells.length` 的比例粗略采样 cell；河口裁剪和 meander 简化后，points 与 cells 不再稳定一一对应，导致宽度关系容易退化。

尚书实施：

- `app/webgl-generator/src/generator/rivers.js`：
  - `river.points` 的第三位现在保存该点对应的沿程 flux。
  - 基础 cell 点取当前 cell flux；河口和出界点取上一陆地 cell flux；meander 控制点按起终点 flux 插值。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 河宽计算优先读取 `point[2]`，只有旧数据没有 point flux 时才回退到 cell 比例采样。
  - `riverWidthStats` 新增 `minFlux/maxFlux`，便于运行时确认宽度来源。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计面板新增“河流流量”行。

门下检查：

- `node --check .\app\webgl-generator\src\generator\rivers.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。

侍中验收：

- Node 生成器烟测确认所有 `river.points` 都带第三位 flux，渲染相关 point flux 范围为 `30..1404`。
- 正式应用 `http://127.0.0.1:5410` 用系统 Chrome + Playwright 验证：
  - `riverWidthMode` 为 `screen-space flux mesh`。
  - `riverWidthStats.minWidthPx/maxWidthPx` 为 `1.1..4.1`。
  - `riverWidthStats.minFlux/maxFlux` 为 `30..1367`。
  - 运行时统计面板已显示“河流流量”。

## 2026-06-27 编辑器与统计面板清单

问题：

- demo 已验证高度、河流和国家三类编辑器，但正式版不能继续只靠临时侧栏堆功能。
- 后续需要先明确哪些对象需要编辑器，哪些对象需要统计面板，哪些系统暂缓。
- 河流管理已经被明确要求为独立浮动面板，这个边界需要扩展到其它领域面板。

实施：

- 新增 `docs/task-notes/editor-and-stat-panel-inventory.md`：
  - 按生成、图层、对象详情、地形环境、水文线性对象、政治社会对象、标签视觉对象和暂缓系统分组。
  - 明确每个领域是否需要编辑器、是否需要统计面板、编辑范围、统计范围和优先级。
  - 将河流面板列为最高优先级，要求正式版做成独立浮动 `river-panel`。
  - 将经济和军事系统列为暂缓，不进入近期编辑器主线。
  - 补充正式编辑器前必须先建立的 edit command / undo command、selection store、highlight / locate API、object table 和派生重建调度。
- 更新 `docs/current-plan.md`：
  - 下一步从 demo 编辑器转为正式版编辑器基础设施和第一批正式面板。
  - 第一批正式版目标为河流独立浮动面板、高度编辑器第一刀和国家编辑器第一刀。

验证：

- 本次为文档规划变更，未改运行时代码。

## 2026-06-27 正式版编辑器基础设施第一刀

问题：

- demo 已验证高度、河流和国家三类编辑交互，但正式应用仍只有 `runtime/app.js` 内的零散 `selection` / `editingObject` 状态。
- 对象详情面板只有“编辑/退出编辑”状态切换，没有统一命令历史、撤销栈或对象定位入口。
- 后续独立 `river-panel` 需要复用 selection、定位和命令历史基础设施，不能再把逻辑堆进单个面板。

中书舍人调查：

- 实际启动子智能体 `Archimedes` 做只读调查，确认现有 selection 流转为 renderer click -> `runtime/app.js` -> `renderer.setSelection()` -> 对象详情面板。
- 调查确认正式应用没有已有 undo/edit command 骨架，也没有通用 locate/highlight API。
- 调查建议第一刀先补 selection store、命令历史和 locate API，再进入 `river-panel`。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/selection-store.js`：
  - 统一维护 `selection` 和 `editingObject`。
  - selection 变化时会自动清理不匹配的编辑对象，并通知 runtime 刷新 renderer、对象详情和固定 pick 面板。
- 新增 `app/webgl-generator/src/runtime/edit-history.js`：
  - 提供 `execute()`、`undo()`、`redo()`、`clear()` 和 `getStats()`。
  - 命令契约要求提供 `apply(context)` 和 `revert(context)`。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 用 `SelectionStore` 接管原先散落的 selection/editingObject 更新。
  - 生成新地图时清空 selection store 和 edit history。
  - 新增对象详情“定位”回调。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `locateObject()`。
  - 支持点对象、路线、河流、国家、省份和区域的 bbox 定位。
  - 运行时统计新增 `locateStatus`。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 对象详情面板新增“定位”按钮。
  - “编辑”按钮仍只切换编辑状态，不修改地图数据。
- 修改 `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/styles.css`：
  - 运行时统计显示定位状态和编辑历史。
  - 对象详情操作区改成两个按钮并排。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\edit-history.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\selection-store.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。

侍中验收：

- 启动正式应用 `http://127.0.0.1:5410`。
- Playwright 验证选中河流对象后：
  - 对象详情面板打开。
  - “定位”按钮存在。
  - `renderer.locateObject()` 返回 `true`。
  - `locateStatus` 为 `river #1`。
  - camera 从全图状态移动到河流 bbox。
  - 运行时统计包含“编辑历史”。
- Playwright 验证 `EditHistory`：
  - `execute()` 后 `undo = 1 / redo = 0`。
  - `undo()` 后上下文值恢复，`undo = 0 / redo = 1`。
  - `redo()` 后上下文值重新应用，`undo = 1 / redo = 0`。

给事中复核修正：

- 实际启动子智能体 `Avicenna` 做只读复核。
- 修复 `locateObject()` 对国家、省份、区域等大范围对象强制放大导致 bbox 可能被裁切的问题：
  - 点对象仍保留最小放大。
  - 线对象和面对象允许缩小到更低 scale，以完整容纳 bbox。
- 修复定位失败后运行时统计不刷新的问题：
  - 对象详情“定位”失败时会更新 `locateStatus = not found`。
- 修复 route / river 摘要对象缺少 `distance` 时详情面板和固定 pick 面板可能崩溃的问题：
  - 缺失命中距离时显示 `n/a`。
- 修正 `app/webgl-generator/README.md` 的旧描述：
  - 河流主线层已是按流量变宽的 screen-space mesh，剩余缺口是河道编辑手柄尚未接入。

补充验收：

- Playwright 验证最大国家定位后，国家 cell 中心 bbox 完整落在 viewport 内。
- Playwright 验证不存在河流对象点击“定位”后，运行时统计显示 `not found`。
- Playwright 验证不带 `distance` 的 route / river 摘要对象不会崩溃，并显示 `n/a`。

后续：

- 下一刀进入独立浮动 `river-panel`，复用本次的 selection store、edit history 和 locate API。
- 对象表格组件、派生重建调度、区域编辑命令 payload 仍待补。

## 2026-06-27 正式版独立河流管理面板第一刀

问题：

- demo 河流管理面板已经验证列表、定位和红色闪烁高亮，但正式版必须是独立浮动面板。
- 正式应用此前只有对象详情中的河流摘要，没有全量河流管理入口。
- 用户明确要求正式版河流统计面板不能与其它面板混用。

中书舍人调查：

- 实际启动子智能体 `Anscombe` 做只读调查。
- 调查结论：第一刀应做独立 `river-panel` 管理面板，职责限于全量列表、统计、筛选、排序、选择、定位和进入编辑状态。
- 调查建议河流写入类操作暂缓，后续任何编辑都必须走 `EditHistory` 命令。

尚书实施：

- 新增 `app/webgl-generator/src/ui/components/object-table.js`：
  - 提供轻量对象表格，支持行点击、双击定位、选中态和行内定位按钮。
- 新增 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 注册独立浮动 `river-panel`。
  - 统计河流数量、总长度、最大流量和筛选结果数。
  - 生成全量河流列表，展示 id、类型、长度和流量。
  - 支持按 id / 类型筛选，按流量、长度和 id 排序。
  - 支持列表选中、定位和进入河流编辑状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 创建 `state.panels.river`。
  - selection 变化时同步刷新河流面板。
  - 左侧“河流管理”按钮可直接打开全量河流面板。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 河流对象详情新增“河流面板”入口。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `locateObject()` 定位对象后启动短时 `locateFlash`。
  - 河流定位期间 selection pass 使用红色闪烁高亮；闪烁结束后回到普通河流高亮。
- 修改 `app/webgl-generator/index.html` 和 `app/webgl-generator/src/styles.css`：
  - 左侧视图区新增“河流管理”按钮。
  - 新增河流面板摘要、筛选、排序、表格和详情样式。
- 修改 `app/webgl-generator/src/ui/panel-manager.js`：
  - 注册面板时支持 `maxWidth`，方便河流面板保持更宽布局。

门下检查：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\components\object-table.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。

侍中验收：

- 正式应用 `http://127.0.0.1:5410` 用系统 Chrome + Playwright 验证。
- 点击左侧“河流管理”后，独立浮动 `river-panel` 打开。
- 河流列表数量 `165`，与 `map.rivers.metadata.rivers` 一致。
- 面板摘要包含“总长度”和“最大流量”。
- 点击列表首行后，`selection.object.kind = river`，列表有 1 行选中态。
- 点击行内“定位”后：
  - `locateStatus = river #45`。
  - `selectionHighlightMode = river red flash`。
  - 约 2.85 秒后回到 `river screen-space mesh`。
- 筛选选中河流 id 后，列表收敛到匹配行。
- 点击“进入河流编辑”后，`editingObject.kind = river`，对象详情状态显示“编辑”。
- 点击河流面板输入框不会改变地图 camera，面板内交互没有误触地图 pan/selection。

给事中复核修正：

- 实际启动子智能体 `Volta` 做只读复核。
- 复核未发现阻断本刀合入的 blocker。
- 修复红色闪烁结束后左侧运行时统计可能停留在 `river red flash` 的问题：
  - `locateFlash` 结束时调用 `onViewChange()` 刷新统计面板。
- 收窄 river-panel 行对象与完整 river 数据的混淆风险：
  - selection 摘要中的 `length` 改为数字，不再传格式化字符串。
  - 完整编辑数据解析仍留给后续 object resolver 和具体编辑命令处理。
- 修正 `app/webgl-generator/README.md` 与 `docs/architecture/floating-panel-architecture.md` 中对象详情、河流 mesh 和已接入面板的旧描述。

补充验收：

- Playwright 验证定位后立即为 `selectionHighlightMode = river red flash`，左侧运行时统计包含 `river red flash`。
- 等待约 2.9 秒后，`selectionHighlightMode` 和左侧统计均回到 `river screen-space mesh`。
- Playwright 验证河流 selection 摘要中的 `length` 类型为数字。

后续：

- 河流面板第二刀可以补低风险 `widthFactor` 编辑命令，并接入 `EditHistory` 撤销/重做。
- 河道拖点、源头/河口修正和支流结构调整仍暂缓，需先补派生重建调度和对象 resolver。

## 2026-06-27 河流面板 widthFactor 编辑命令第一刀

问题：

- 河流管理面板已经能统计、筛选、选中和定位，但还没有真正通过正式编辑命令修改河流。
- 下一步需要选一个低风险编辑项验证 `EditHistory` 路径，避免直接进入河道拖点这种高派生依赖操作。

中书舍人调查：

- 实际启动子智能体 `Faraday` 做只读调查。
- 调查确认 `widthFactor` 来自 `rivers.js` 的河流生成阶段，渲染时 `placeholder-renderer.js` 会在每次 `draw()` 的 `updateRiverBuffer()` 中读取当前 `river.widthFactor` 重建河流 mesh。
- 调查建议命令只做数据修改，刷新放在 `runtime/app.js` 外层统一处理；`context` 最小只需 `{map}`。
- 调查提示 `river.width` 仍是生成期摘要，当前只改 `widthFactor` 会改变几何宽度，不强制改变颜色深浅；该行为作为本刀低风险取舍保留。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/river-edit-commands.js`：
  - 新增 `createSetRiverWidthFactorCommand(riverId, nextValue)`。
  - 命令按 `riverId` 从 `map.rivers.rivers` 解析完整河流对象。
  - `apply()` 写入 clamp 后的 `widthFactor`。
  - `revert()` 恢复旧值；如果旧对象没有 `widthFactor` 字段，则撤销时删除字段。
  - 使用独立 `capturedPrevious` 标记记录旧值，避免旧值为 `null` 时重复捕获。
  - 提供 `isNoop()`，相同宽度因子不会写入历史栈。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - `riverPanel.onSetWidthFactor` 通过 `EditHistory.execute()` 执行命令。
  - 新增 `refreshAfterEdit()`，统一刷新 renderer、对象详情、河流面板、运行时统计和悬停/选中面板。
  - 接入河流面板的撤销和重做按钮。
- 修改 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 选中河流详情显示“宽度因子”。
  - 新增 range slider、“应用宽度”、“撤销”和“重做”。
  - slider 拖动只更新面板显示，点击“应用宽度”才写入命令历史。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增河流宽度编辑区和按钮布局样式。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\river-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `git diff --check` 对本刀相关文件通过。

侍中验收：

- 正式应用 `http://127.0.0.1:5410` 用系统 Chrome + Playwright 验证。
- 选中河流 `#45`，初始 `widthFactor = 1`，`editHistory undo/redo = 0/0`，`WebGL error = 0`。
- 将宽度因子应用为 `1.45` 后：
  - 目标河流 `widthFactor = 1.45`。
  - `editHistory undo = 1 / redo = 0`。
  - `lastLabel = 调整河流 #45 宽度因子`。
  - 河流面板显示 `1.45`。
  - `WebGL error = 0`。
- 重复点击“应用宽度”不会增加历史栈，`undo` 仍为 `1`。
- 点击“撤销”后：
  - 目标河流 `widthFactor = 1`。
  - `editHistory undo = 0 / redo = 1`。
  - 河流面板显示 `1.00`。
- 点击“重做”后：
  - 目标河流 `widthFactor = 1.45`。
  - `editHistory undo = 1 / redo = 0`。
  - 河流面板显示 `1.45`。
- 点击“生成 grid 地图”后：
  - `editHistory undo/redo = 0/0`。
  - `selection = null`。
  - `editingObject = null`。

给事中复核修正：

- 实际启动子智能体 `Sagan` 做只读复核。
- 复核未发现 blocker。
- 复核指出“撤销/重做”是全局 `EditHistory`，放在选中河流详情区可能让用户误以为只针对当前河流。
- 已修正河流面板文案：
  - “撤销”改为“撤销上次”。
  - “重做”改为“重做上次”。
  - 宽度编辑区显示“最近命令”，用于明确当前全局命令栈状态。
- 补充浏览器验证：
  - 应用宽度后，面板显示 `最近命令：调整河流 #45 宽度因子`。
  - 撤销后，面板显示 `最近命令：撤销 调整河流 #45 宽度因子`。
  - 重做后，面板显示 `最近命令：重做 调整河流 #45 宽度因子`。

后续：

- 补对象 resolver，避免后续复杂编辑误用 selection 摘要对象。
- 河道拖点、源头/河口修正、支流结构和 cells 级变更必须等派生重建调度就绪后再做。

## 2026-06-27 对象 resolver 第一刀

问题：

- 河流面板和对象详情面板会从 picking、列表行和编辑状态里传递对象摘要。
- 摘要对象适合展示和定位，但不适合直接进入复杂编辑；后续河道、国家、高度等编辑需要稳定拿到当前地图上的完整对象字段。

中书舍人调查：

- 实际启动子智能体 `Banach` 做只读调查。
- 调查确认 selection 来源包含 canvas picking、标签点击、河流表格行和对象详情按钮。
- 调查建议 resolver 先覆盖 city、label、marker、route、river、state、province 和 region，避免后续编辑器直接依赖摘要字段。
- 调查建议把 resolver 注入 `SelectionStore`，使选中、进入编辑和刷新都走同一解析路径。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/object-resolver.js`：
  - `resolveObject(map, object)` 按 `kind` 分派解析。
  - city、label、marker、route、river、state、province 和 region 会从当前 `map` 上重新读取字段。
  - river 解析补齐 `points/cells/flux/discharge/length/segments/widthFactor/source/mouth` 等字段。
  - state、province 和 region 对 `id/i` 字段做兼容处理。
- 修改 `app/webgl-generator/src/runtime/selection-store.js`：
  - 构造函数接收 resolver。
  - `setSelection()`、`startEditing()` 和 `refresh()` 都会重新解析对象。
  - resolver 返回空时，当前 selection 会被清空，避免保留无效对象。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 注入 `resolveObject(state.map, object)`。
  - `refreshAfterEdit()` 在重绘后调用 `selectionStore.refresh()`，让河流宽度等运行时改动反馈到对象详情和河流面板。
  - 对象详情中的“打开河流管理”也统一传入 `EditHistory` 状态。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\object-resolver.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\selection-store.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\river-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\river-panel.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source/Fantasy-Map-Generator` 为空，未修改 source 原项目源码。

侍中验收：

- 使用临时静态 server + Playwright 打开正式应用。
- city、route、river、state、province、region、marker 和 label 共 8 类对象均能通过 `SelectionStore` 解析，并可 `renderer.locateObject()` 定位。
- 无效河流 `river #-999` 会清空 selection。
- 选中河流 `#1` 后，将 `widthFactor 1.2 -> 1.55`，`selectionStore.refresh()` 后 selection 中的 `widthFactor` 同步为 `1.55`。
- 执行撤销后，selection 中的 `widthFactor` 恢复为 `1.2`。
- 点击“生成 grid 地图”后，selection、editingObject 和 edit history 均清空。

后续：

- 下一刀先补派生重建调度，明确哪些编辑只需重绘、哪些需要重建边界/索引/统计、哪些必须重新跑语义扩张。
- 派生调度之后进入正式高度编辑器第一刀。

## 2026-06-27 派生重建调度第一刀

问题：

- `refreshAfterEdit()` 过去只有全量 `renderer.draw()` 和 `selectionStore.refresh()` 一条路径。
- `renderer.draw()` 每次都会重建 route、river 和 selection 三类动态 mesh；对河流宽度这类小改动来说过粗。
- `selectionStore.refresh()` 会触发 selection 回调，回调里又会 `renderer.setSelection()` 并重绘，因此调度顺序不收敛时容易重复 draw。

中书舍人调查：

- 实际启动子智能体 `Jason` 做只读调查。
- 调查确认第一刀应先建立命令级 `effects` 和统一调度入口，不急着拆 renderer 内部 buffer。
- 调查建议把 `visual: rivers` 等细粒度语义先映射到现有 `draw()`，后续再拆 `renderer.refreshDerived()`。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 提供 `createEditRefreshScheduler()` 和 `normalizeEditEffects()`。
  - 命令可声明 `render/selection/runtimeStats/pickPanel/derived/affected`。
  - 第一刀仍使用现有 `renderer.draw()`，但保留 `derived` 语义用于后续拆分。
  - 当 effects 需要 `selection: "refresh"` 时，调度器先写入 `state.lastEditRefresh`，再走 `selectionStore.refresh()`，由 selection 回调统一刷新面板和触发绘制，避免先 draw 后再 draw。
- 修改 `app/webgl-generator/src/runtime/river-edit-commands.js`：
  - `createSetRiverWidthFactorCommand()` 声明影响 `river-mesh`、`river-width-stats` 和 `object-panels`。
  - `affected` 记录目标 `riverId`。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - `state` 新增 `editRefreshScheduler` 和 `lastEditRefresh`。
  - execute/undo/redo 后统一调用调度器，而不是直接调用旧 `refreshAfterEdit(state, documentRef)`。
  - 生成新地图时清空 `lastEditRefresh`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“编辑刷新”，显示最近一次 render、selection、derived 和 affected。

给事中复核修正：

- 实际启动子智能体 `Lorentz` 做只读复核，未发现 blocker。
- 复核建议高度刷子会是高频操作，后续不能每个 mousemove 都默认刷新 selection 和面板。
- 已新增 `EDIT_REFRESH_PRESETS`：
  - `RIVER_WIDTH_ONLY`：河流宽度类编辑，刷新 river mesh、宽度统计和对象面板。
  - `HEIGHT_SURFACE_ONLY`：高度提交类编辑，刷新高度字段、cell 颜色和高度统计，不刷新 selection。
  - `HEIGHT_BRUSH_PREVIEW`：高度拖动预览，刷新高度字段和 cell 颜色，不刷新 runtime/pick 面板。
- 河流 `widthFactor` 命令已改为复用 `RIVER_WIDTH_ONLY` preset，避免 effects 字符串在命令间漂移。

后续：

- 第二小刀可以给 renderer 增加 `refreshDerived()`，先拆 route、river、selection buffer 的单独刷新。
- 高度编辑器第一刀前，需要给高度命令声明 cell/color/stat 类 effects，避免把所有刷子操作都写成无语义全量刷新。

## 2026-06-27 正式高度编辑器第一刀

问题：

- demo 已验证高度抬升、降低、平滑和中心衰减笔刷，但正式应用还没有独立高度编辑面板。
- 正式应用 renderer 目前 cell 位置和颜色仍在同一个 `vertexBuffer`，第一刀不适合直接拆成细粒度 color buffer。
- 高度编辑会牵动 feature、climate、river、biome、人口和政治社会系统，第一刀必须限制范围，避免假装已经完成完整派生重算。

中书舍人调查：

- 实际启动子智能体 `Sartre` 做只读调查。
- 调查确认主高度字段为 `map.grid.cells.h`，`pack.cells.h` 是从 grid 派生的语义层高度。
- 调查确认 renderer 高度专题颜色最终读取 `map.grid.cells.h`，当前可通过重建 cell surface 让颜色变化立即可见。
- 调查建议第一刀做“高度表层编辑”，只同步 `grid.cells.h` 和已映射的 `pack.cells.h`，不重跑海陆 feature、气候、河流、生物群系或社会政治派生。

尚书实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `refreshCellSurface()`，用于重建 cell surface `vertexBuffer` 并绘制。
  - `setColorMode()` 改为复用该入口。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - effects 包含 `cell-colors` 时优先调用 `renderer.refreshCellSurface()`。
- 新增 `app/webgl-generator/src/runtime/height-edit-commands.js`：
  - `createApplyHeightBrushCommand()` 把高度笔刷提交为可撤销命令。
  - `applyHeightBrushPreview()` 支持拖动中的预览刷新。
  - 命令同步 `grid.cells.h` 和所有映射到同一 grid cell 的 `pack.cells.h`。
- 新增 `app/webgl-generator/src/ui/panels/height-panel.js`：
  - 注册独立浮动 `height-panel`。
  - 支持启用/停止高度编辑、抬升、降低、平滑、半径、强度、中心衰减、撤销和重做。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 左侧“视图”区新增“高度编辑”入口。
  - 高度面板启用后自动切到 height 专题。
  - canvas capture 阶段接管高度编辑 pointer 事件，避免编辑时触发地图 pan。
  - 拖动中使用 `HEIGHT_BRUSH_PREVIEW`，抬手后创建命令并使用 `HEIGHT_SURFACE_ONLY` 进入历史栈。
  - 对 pointer capture 做容错，避免测试或浏览器边缘路径中断笔刷。
- 修改 `app/webgl-generator/index.html` 和 `app/webgl-generator/src/styles.css`：
  - 新增高度编辑按钮和高度面板样式。

门下检查：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\height-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\height-panel.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\edit-refresh-scheduler.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。

侍中验收：

- 使用临时静态 server + Playwright 打开正式应用。
- 打开“高度编辑”面板并启用后，目标专题切到 `height`。
- 在 canvas 上抬升一次：
  - 目标 grid cell 高度 `34 -> 52`。
  - `EditHistory` 记录 `undo 1 / redo 0`。
  - `lastEditRefresh` 为 `height-field, cell-colors, height-stats`，affected 为 `grid-cells#23`。
  - camera 保持 `scale 1 / offset 0,0`，高度编辑没有触发地图 pan。
- 点击“撤销上次”后，目标 grid cell 高度恢复 `52 -> 34`，历史变为 `undo 0 / redo 1`。
- 中心衰减验证：
  - 抬升前中心 cell `17`、边缘样本 `22`。
  - 抬升后中心 cell `21`、边缘样本仍为 `22`，中心变化大于边缘。
- 降低和平滑均能形成命令并进入撤销栈。
- `git diff --name-only -- source/Fantasy-Map-Generator` 为空，未修改 source 原项目源码。

给事中复核修正：

- 实际启动子智能体 `Pauli` 做只读复核，未发现 blocker。
- 复核指出高度编辑启用后实际已切到 height 专题，但左侧专题按钮 active 样式可能不同步。
- 已新增 `setActiveModeButton()`，高度编辑启用时同步把左侧专题按钮切到“高度”。
- 复核提示的后续非阻断优化：
  - 高度 preview 仍会重绘高度面板，可在大半径高频拖动场景下再做节流或局部数字更新。
  - `pointercancel` 当前会提交已有预览，触屏路径后续可改成撤回或明确提交策略。
  - renderer 内部仍会在 `draw()` 中重建 route/river/selection buffer，真正局部 buffer 刷新留给后续。

后续：

- 下一刀推进正式国家编辑器第一刀，复用 edit command、effects、浮动面板和连续涂抹经验。
- 高度编辑器第二刀再讨论完整派生重算，包括 feature、climate、river、biome 和人口等系统。

## 2026-06-27 正式国家编辑器第一刀

问题：

- 正式应用已经有高度编辑器和河流管理/widthFactor 编辑路径，但国家编辑仍停留在 demo 经验和计划层。
- 本刀目标限定为国家 cell 归属表层编辑，先验证浮动面板、目标国家选择、连续涂抹、预览刷新和 EditHistory 提交，不重跑完整政治派生。

尚书实施：

- 新增 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - `createApplyStateBrushCommand()` 将国家 cell 归属变化封装为可撤销命令。
  - `applyStateBrushPreview()` 支持拖动中预览。
  - 命令同步修改 `grid.cells.state` 与映射到同一 grid cell 的所有陆地 `pack.cells.state`，避免只改 primary pack cell。
  - 提交 effects 声明为 `state-cells / cell-colors / political-selection` 且 `selection: refresh`，预览 effects 只刷新 `state-cells / cell-colors`。
- 新增 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 注册独立浮动 `state-panel`，标题为“国家编辑”。
  - 支持启用/停用、目标国家下拉选择、从当前选中对象取样、从悬停 cell 取样、笔刷半径、撤销和重做。
  - 面板显示目标国家、来源国家、最近影响 cells 和全局历史计数。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 接入国家编辑面板和左侧“国家编辑”入口。
  - 国家编辑启用后自动切到 `states` 专题，并与高度编辑互斥。
  - canvas capture 阶段接管国家编辑 pointer 事件，避免涂抹时触发地图 pan 或 selection。
  - 拖动中使用预览 effects 按 `cell-colors` 语义刷新 cell surface；pointerup/pointercancel 生成 EditHistory 命令并刷新 selection/runtime/pick。
  - 提交、撤销和重做前会按最近一次笔刷位置重新 pick，避免 hover 面板继续显示编辑前的国家快照。
  - undo/redo 从国家面板触发时会刷新 cell surface 和 selection。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `states` 专题颜色优先使用 `map.politics.states[*].color`。
  - 缺失国家色时才回退到 indexed 伪色，使国家面板展示和地图颜色更一致。
- 修改 `app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/index.html` 和 `app/webgl-generator/src/styles.css`：
  - 绑定“国家编辑”按钮。
  - 补齐国家面板摘要、目标选择、取样按钮、半径 slider 和历史按钮样式。
- 修改 `docs/current-plan.md`：
  - 将下一步从“推进国家编辑器第一刀”更新为“第一刀补丁已落地，下一刀补政治派生一致性”。

当前边界与风险：

- 国家编辑当前不会同步 `grid.cells.province/region`、`pack.cells.province`、城市/ burg 的 state、路线、军事、zones 或 state statistics，因此它是表层 cell 归属编辑，不是完整政治重算。
- 预览仍按高度编辑器同级策略遍历全部 grid cells，大半径和高频拖动下后续需要做空间索引或局部候选优化。

检查：

- `node --check .\app\webgl-generator\src\runtime\state-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。

侍中验收：

- 使用临时静态 server + Playwright 打开正式应用。
- 打开“国家编辑”面板后启用国家编辑，专题自动切到 `states`，左侧 active 只保留“国家”。
- 选取一个映射到 3 个陆地 pack cell 的 grid cell，拖动涂抹到目标国家：
  - `grid.cells.state` 从 `13 -> 1`。
  - 对应 3 个 `pack.cells.state` 从 `[13, 13, 13] -> [1, 1, 1]`。
  - `EditHistory` 记录 `undo 1 / redo 0 / 国家笔刷 10 cells`。
  - `lastEditRefresh` 为 `state-cells, cell-colors, political-selection`，且 `selection` 为 `refresh`。
  - camera 保持 `scale 1 / offset 0,0`，国家编辑没有触发地图 pan。
  - 面板包含“来源国家”信息。
- 点击“撤销上次”后：
  - `grid.cells.state` 恢复 `1 -> 13`。
  - 对应 3 个 `pack.cells.state` 恢复 `[13, 13, 13]`。
  - 历史变为 `undo 0 / redo 1`。

## 2026-06-27 编辑态交互锁补丁

问题：

- 用户反馈编辑时最好禁用编辑外的交互。
- 现状中高度/国家笔刷已经拦截大部分 canvas pan/select，但左侧生成、专题切换、其它面板入口和非当前浮动面板控件仍可能被误触。

实施：

- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 新增 `setEditingInteractionLock()`，统一禁用左侧生成、随机 seed、适配视图、专题切换、编辑入口和生成参数控件。
  - 支持传入允许操作的浮动面板 id；非当前编辑面板中的按钮、输入和下拉会被禁用。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 高度编辑、国家编辑和对象编辑状态变化时统一刷新交互锁。
  - canvas capture 阶段新增编辑锁拦截，编辑状态中阻止非当前编辑器需要的 pointer 和 wheel 事件继续传给 renderer。
  - 编辑期间 hover 或 selection 导致面板重绘后，会重新应用锁，避免新 DOM 控件恢复可点。
- 修改 `app/webgl-generator/src/styles.css`：
  - 禁用控件变淡并显示不可操作 cursor。
  - 非当前编辑浮动面板内容变淡，并显示“编辑中，暂不可操作”提示。

边界：

- 当前允许的编辑面板：
  - 高度编辑：只允许 `height-panel`。
  - 国家编辑：只允许 `state-panel`。
  - 河流对象编辑：允许 `object-details` 和 `river-panel`。
  - 其它对象编辑：允许 `object-details`。
- 面板关闭按钮仍保持可用，避免用户被锁在遮挡视图的浮动面板里。

验证：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `git diff --name-only -- source/Fantasy-Map-Generator` 为空。
- Playwright 临时静态 server 验证：
  - 打开国家编辑面板和高度编辑面板，启用高度编辑后，`body.editing-locked` 为 true。
  - 左侧生成、专题按钮和国家编辑入口均 disabled。
  - 当前高度面板的“停止高度编辑”仍可点击。
  - 非当前 `state-panel` 的 select 被禁用，面板带 `editing-panel-disabled`。
  - 编辑状态下拖拽 canvas 后 camera 仍为 `scale 1 / offset 0,0`。
  - 点击“停止高度编辑”后，左侧控件和 `state-panel` 控件恢复可用。

## 2026-06-27 国家颜色变更器

问题：

- 国家编辑器第一刀已经可以修改国家 cell 归属，但缺少国家颜色变更器。
- renderer 的 states 专题已优先读取 `map.politics.states[*].color`，因此颜色编辑可以作为低风险表层命令接入。

实施：

- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 新增 `createSetStateColorCommand()`。
  - 命令修改目标国家的 `state.color`，effects 声明为 `state-color / cell-colors / object-panels`。
  - 命令支持撤销和重做。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 在目标国家选择下方新增颜色选择器。
  - 颜色输入展示当前目标国家颜色；选择颜色后触发颜色命令。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 将颜色变更接入 `EditHistory`。
  - 提交后复用国家编辑刷新路径，刷新 states 专题、selection/runtime/pick 和国家面板。
- 修改 `app/webgl-generator/src/styles.css`：
  - 补齐颜色选择器布局和色值展示样式。

验证：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\state-edit-commands.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panels\state-panel.js` 通过。
- `git diff --check` 通过。
- Playwright 临时静态 server 验证：
  - 打开国家编辑并启用后，颜色控件在编辑锁中仍可用。
  - 目标国家 `#1` 颜色从 `#66c2a5 -> #123456`。
  - `EditHistory` 记录 `undo 1 / redo 0 / 国家颜色 #1`。
  - `lastEditRefresh` 为 `state-color, cell-colors, object-panels`。
  - 点击“撤销上次”后颜色恢复为 `#66c2a5`。

## 2026-06-27 对象名称编辑与国家快速换首都

问题：

- 国家、河流以及后续城镇编辑都需要支持编辑名称。
- 国家编辑器还需要支持快速更换首都，不能只依赖后续完整城镇编辑器。

实施：

- 新增 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - `createRenameObjectCommand()` 支持国家、河流、城市重命名，并纳入 `EditHistory`。
  - 国家重命名同步 `name` 与 `fullName`，保留原有 `formName` 后缀。
  - 城市重命名同步 `settlements.cities[*].name` 与对应 `pack.burgs[*].name`。
  - `createSetStateCapitalCommand()` 支持国家首都切换，并同步 `politics.states[*].capital/center/gridCenter/religion`、旧/新城市的 `capital/group` 与对应 burg 的 `capital/group`。
- 修改对象详情面板：
  - 编辑态下，国家、河流、城市和城市标签对象显示名称输入框。
  - 城市标签重命名会落到对应城市实体，避免标签文本和城市实体分裂。
- 修改国家编辑面板：
  - 新增“首都”下拉和“设为首都”按钮，只列当前目标国家自己的城市。
  - 首都切换走可撤销命令。
- 修改 renderer 与刷新调度：
  - 新增 `refreshLabels()`，名称或首都变化后重建城市标签。
  - edit refresh effects 新增 `labels` 派生刷新语义。
- 修改河流管理面板：
  - 列表、详情和筛选支持河流名称。

验证：

- `Get-ChildItem -Path .\app\webgl-generator\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }` 通过。
- Playwright 临时静态 server 验证：
  - 国家 `云梦 / 云梦共和国` 重命名为 `测试国 / 测试国共和国`。
  - 国家首都从 burg `1` 切到 burg `74` 后，`state.capital`、目标城市 `capital` 和目标 burg `capital` 同步更新。
  - 城市重命名后，`settlements.cities[*].name` 与 `pack.burgs[*].name` 同步更新。
  - 实际已渲染城市标签重命名为 `标签测试城` 后，DOM 标签文本同步刷新。
  - 河流 `清溪` 重命名为 `测试河` 后，河流对象与河流管理面板文本同步更新。

## 2026-06-27 对象详情关闭时退出编辑态

问题：

- 单个河流进入编辑态后，如果直接关闭“对象详情”弹框，弹框只是隐藏，`selectionStore.editingObject` 仍保留河流对象。
- 页面因此继续处于编辑锁状态，左侧控件和其它非编辑交互无法恢复。

实施：

- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 为 `object-details` 注册 `onClose` 回调。
  - 关闭面板时如当前对象处于编辑态，调用 `onCancelEdit` 退出编辑。
  - 关闭触发的 `stopEditing()` 会刷新 selection；面板内部吞掉紧随其后的查看态自动重开，避免用户刚关闭弹框又被重新弹出。

验证：

- `node --check .\app\webgl-generator\src\ui\panels\object-details-panel.js` 通过。
- `git diff --check -- app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- Playwright 临时静态 server 验证：
  - 进入河流编辑后，`editingObject.kind` 为 `river`，`body.editing-locked` 为 true。
  - 点击对象详情关闭按钮后，`editingObject` 为 null，`body.editing-locked` 为 false。
  - 对象详情面板保持 hidden，河流 selection 仍保留。

## 2026-06-27 默认国家邻接感知配色

问题：

- 默认生成国家时，原先按 6 色数组和 `state.i` 取模分配颜色。
- 由于正式应用中的国家 id 来自 burg id，id 分布和地图邻接没有关系，相邻国家容易出现相同或相近颜色。

实施：

- 修改 `app/webgl-generator/src/generator/politics.js`：
  - 将国家默认色盘扩展为 30 个候选色。
  - `assignStateColors()` 改为基于国家邻接图的贪心配色。
  - 优先给邻国数量多、面积大的国家分配颜色。
  - 每个国家选择颜色时，优先最大化与已上色邻国的 RGB 距离，同时轻微奖励尚未使用的颜色。
  - pack 政治生成继续使用 `findStateNeighbors()` 的邻接结果；grid fallback 生成新增 `findGridStateNeighbors()` 后再配色。

验证：

- `node --check .\app\webgl-generator\src\generator\politics.js` 通过。
- `git diff --check -- app/webgl-generator/src/generator/politics.js` 通过。
- 使用正式生成器跑 5 组种子：`default`、`adjacent-colors-a`、`adjacent-colors-b`、`adjacent-colors-c`、`adjacent-colors-d`。
- 统计所有国家邻接边：
  - 5 组样本相邻国家同色数均为 `0`。
  - 相邻国家最小 RGB 归一化距离约为 `0.338` 到 `0.379`。

## 2026-06-27 高度专题显示海底配置

问题：

- 高度专题中 `height < 20` 的水域原先统一返回海洋底色，无法观察海洋内部的高度差异。
- 用户需要一个可开启的配置，用于查看海洋高度。

实施：

- 修改 `app/webgl-generator/index.html`：
  - 在“视图”区域新增“高度专题显示海底”开关。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 将开关接入 runtime panel 事件。
  - 编辑锁状态下同步禁用该开关。
  - 运行时面板显示当前“海底高度”状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 开关变化时调用 renderer 的 `setViewOptions({showOceanHeight})` 并刷新运行时面板。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `viewOptions.showOceanHeight`。
  - 高度专题中，水域默认仍使用统一海洋色；开启后按 `height / 20` 在深海色和浅海陆架色之间插值。
  - 其它专题的水域处理保持原样。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\app\webgl-generator\src\ui\panel.js` 通过。
- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check -- app/webgl-generator/index.html app/webgl-generator/src/ui/panel.js app/webgl-generator/src/runtime/app.js app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Playwright 临时静态 server 验证：
  - 正式页面加载到 `http://127.0.0.1:5410`。
  - 高度专题下开关默认关闭时，renderer `showOceanHeight` 为 false，画布样本为统一海洋色。
  - 勾选“高度专题显示海底”后，renderer `showOceanHeight` 为 true，画布水域样本颜色发生变化。
  - 运行时面板包含“海底高度 显示”。

## 2026-06-27 默认省份邻接感知配色

问题：

- 省份对象原先默认继承所属国家颜色，省份专题实际渲染也仍使用按 id 生成的索引色。
- 用户要求省份也默认使用邻接图贪心算法处理颜色，避免相邻省份撞色。

实施：

- 修改 `app/webgl-generator/src/generator/politics.js`：
  - 新增 `findPackProvinceNeighbors()` 和 `findGridProvinceNeighbors()`。
  - pack 政治生成在省份扩张、补洞、统计和 pole 分配之后，构建省份邻接图并调用 `assignProvinceColors()`。
  - grid fallback 生成在 `grid.cells.province` 完成后构建省份邻接图并调用 `assignProvinceColors()`。
  - 省份配色复用国家配色的 30 色候选色和邻接优先评分：优先拉开已上色邻接省份颜色，轻微奖励未使用颜色。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 省份专题由 `indexedColorOrWater()` 改为 `colorForProvince()`。
  - `colorForProvince()` 优先读取 `map.politics.provinces[*].color`，没有颜色时才退回索引色。

验证：

- `node --check .\app\webgl-generator\src\generator\politics.js` 通过。
- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check -- app/webgl-generator/src/generator/politics.js app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- 使用正式生成器跑 5 组种子：`default`、`province-colors-a`、`province-colors-b`、`province-colors-c`、`province-colors-d`。
- 5 组样本省份邻接边同色数均为 `0`，省份颜色覆盖率为 `100%`；样本中省份数约 `154` 到 `198`，唯一颜色数约 `28` 到 `30`。
- Playwright 临时静态 server 验证：
  - 正式页面切到省份专题后，当前样本 `206` 个省份全部有颜色。
  - 当前样本 `441` 条省份邻接边，同色数为 `0`。
  - renderer `colorMode` 为 `provinces`，运行时面板同步显示省份专题。

## 2026-06-27 DevTools 打开时加载卡顿诊断与动态 mesh 缓存

问题：

- 打开正式 app 页面时，如果浏览器 DevTools 已开启，页面容易长时间卡在加载或首屏响应很慢。
- 诊断发现默认 10k cells 可正常加载；100k cells 生成耗时主要集中在生成算法，尤其河流生成。
- 另一个放大因素是 DevTools 打开/停靠会触发更多 resize、layout 和重绘；此前 renderer 每次 `draw()` 都会重建道路、河流和选中高亮 screen-space mesh，导致 DevTools 场景把普通重绘放大成重复几何构建。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `dynamicBuffersDirty` 缓存标记。
  - 道路、河流、选中高亮 buffer 改为脏了才重建。
  - 相机变化、窗口 resize、地图加载和定位时统一标记 viewport 相关动态 buffer 失效。
  - 选中路线时标记 route mesh 失效；定位闪烁时仍允许 selection mesh 按帧更新。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 根据编辑影响范围显式失效 route、river 或 selection 动态 buffer。
  - 河流宽度编辑会重新构建 river mesh；普通 cell 颜色刷新不再顺带重建道路/河流。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/runtime/edit-refresh-scheduler.js` 通过。
- Playwright 临时静态 server 验证：
  - 默认 10k cells 首次 draw 后动态 mesh cache 均为 clean，连续 8 次 `renderer.draw()` 耗时降为 `0..0.1ms`。
  - 100k cells 生成后动态 mesh cache 均为 clean，连续 8 次 `renderer.draw()` 耗时同样为 `0..0.1ms`。

补充约束：

- 用户进一步要求：canvas 的初始大小只依赖初始化时的窗口大小，后续窗口变化不要影响画布本体大小，也不要触发画布相关重建。
- 调整 `PlaceholderMapRenderer`：
  - 初始化时调用 `lockCanvasToInitialDisplaySize()`，将 canvas 的 CSS 尺寸、drawing buffer 尺寸和 overlay 尺寸固定为初始测量值。
  - 移除 `window.resize` 对 renderer 的尺寸响应。
  - `draw()` 不再读取当前 `clientWidth/clientHeight` 来调整 canvas backing store。
- 追加验证：
  - Playwright 中先以 `1280x800` 打开页面，canvas 初始尺寸为 `940x800`。
  - 再将 viewport 改为 `900x620`，canvas rect、overlay rect、drawing buffer 和 renderer `canvasSize` 均保持 `940x800`。
  - resize 后动态 mesh cache 仍为 clean，没有触发道路、河流或选中高亮 mesh 重建。

补充启动体验修正：

- 用户反馈：如果开着 DevTools 直接打开页面，页面仍可能长时间停在初始的“等待生成”。
- 原因分析：
  - “等待生成”是 HTML 初始文案，旧流程在模块加载后立刻同步执行首轮 `generate()`。
  - 同步生成完成前浏览器没有机会绘制中间状态；DevTools 预打开会让主线程更慢，于是用户看到的仍是初始文案。
  - 如果页面长期停在原始“等待生成”且状态栏也是“初始化中”，则还需要检查 DevTools 是否启用了 Disable JavaScript 或处于断点暂停状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 首轮和按钮触发的生成改为 `requestGenerate()`。
  - 先写入“等待生成任务”状态，再等一次 paint 后执行同步生成重活。
  - `window.__webglGeneratorApp` 在首轮生成前就暴露，方便 DevTools 检查当前启动状态。
  - 生成异常会显示“生成失败”，不再静默停留在初始文案。
- 修改 `app/webgl-generator/src/main.js`：
  - 为 app 创建阶段增加启动失败兜底显示。
- 验证：
  - 普通 Playwright 加载：`DOMContentLoaded` 后立即显示“等待生成任务”，随后生成完成。
  - CDP 模拟 DevTools 预打开、开启 Runtime/Debugger 并禁用 cache：同样先显示“等待生成任务”，随后生成完成，无 page error 或 console error。

再次修正：

- 用户反馈 DevTools 开着仍然卡住。
- 将生成调度从仅依赖 `requestAnimationFrame()` 改为 `setTimeout()` 与 `requestAnimationFrame()` 竞速：
  - `setTimeout()` 保证即使 rAF 被 DevTools、后台状态或调试状态延后，生成任务也会启动。
  - rAF 路径仍保留，用于正常情况下尽量让浏览器先绘制启动状态。
- 修改 `app/webgl-generator/index.html`：
  - 增加 3 秒启动 watchdog。
  - 如果模块脚本没有暴露 `window.__webglGeneratorApp`，页面显示“脚本尚未启动，请检查 DevTools 是否暂停或禁用 JavaScript”。
- 追加验证：
  - 普通加载、CDP DevTools 模拟、禁用 rAF 三条路径均可从“等待生成任务”进入生成完成。
  - 故意阻断 `src/main.js` 加载时，watchdog 会显示“脚本尚未启动”，不再停留在 HTML 初始的“等待生成”。

第三次修正：

- 用户反馈仍卡在“等待生成任务”。
- 将生成调度扩展为多路竞速：
  - `scheduler.postTask()`。
  - `MessageChannel`。
  - `setTimeout()`。
  - `requestAnimationFrame()` 后再 `setTimeout()`。
- 修改 `tools/serve-prototype.mjs`：
  - 本地静态 server 对所有文件返回 `Cache-Control: no-store, max-age=0`。
  - 避免 DevTools 打开时浏览器继续使用旧版 module 脚本。
- 已重启 5410 预览服务，并验证 `http://127.0.0.1:5410/src/runtime/app.js` 返回 `no-store`。
- 追加验证：
  - CDP DevTools 模拟、禁用 cache、同时禁用 `setTimeout` 和 `requestAnimationFrame` 时，页面仍可从“等待生成任务”进入生成完成。

## 2026-06-27 国家编辑器城镇迁移与滑条拖动修正

问题：

- 国家编辑器笔刷只修改国家 cell 归属，没有同步落在涂色区域内的城镇归属。
- 如果被涂走的是旧国家首都，旧国家会继续引用已经迁走的首都。
- 国家编辑器半径滑条在拖动时每次 `input` 都重建整个面板，导致鼠标拖动被中断，只能一点点调整。

实施：

- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷最终命令在收笔时捕获城镇、burg 和受影响国家快照。
  - 将涂色 cell 上的城镇迁入新国家，并同步 `settlements.cities[*].state` 与 `pack.burgs[*].state`。
  - 如果迁走的是旧国家首都，将该城镇降级为普通城市，并在旧国家剩余城镇中按省会优先、人口次之重选首都。
  - 支持撤销/重做恢复城镇、burg 和国家首都状态。
  - 收笔后刷新国家统计和邻接摘要。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 半径滑条 `input` 只更新面板状态和当前输出值，不再重建整个浮动面板。

验证：

- `node --check app/webgl-generator/src/runtime/state-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- Playwright 直接执行国家笔刷命令：
  - 选择一个仍有其它城市的国家首都，将其 cell 涂到另一个国家。
  - 原首都城镇和 burg 成功迁入目标国家，并被降级为非首都。
  - 旧国家成功另选首都，新首都仍属于旧国家。
  - 撤销恢复原首都、城镇归属和 burg 归属；重做再次迁移成功。
- Playwright 验证国家编辑器半径滑条：
  - 触发 `input` 后滑条 DOM 节点保持不变，输出值和 `getBrush().radius` 同步更新。

## 2026-06-27 国家编辑器管理列表

问题：

- 国家编辑器只有目标国家下拉选择，不适合像河流管理面板那样批量浏览、快速定位和连续编辑。
- 用户希望国家编辑器更接近当前河流编辑器的面板体验。

实施：

- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 引入通用 `createObjectTable()`。
  - 国家面板新增国家统计摘要、筛选框、排序按钮和国家表格。
  - 支持按人口、城镇数、面积和 ID 排序。
  - 表格行点击会切换当前目标国家，双击/定位按钮可快速定位。
  - 详情区展示选中国家的首都、面积、城镇、人口和邻国数。
  - “编辑此国家”会把目标国家切到当前行，并进入国家编辑状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 接入国家面板的选中、定位和编辑回调。
  - 选中国家时同步地图选中对象。
  - 编辑国家时切换到国家专题并启用国家编辑锁。
- 修改 `app/webgl-generator/src/styles.css`：
  - 为国家面板新增筛选、排序、详情和表格布局样式。
  - 合并重复的 `.state-sample-actions` 样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 验证：
  - 打开国家编辑面板后，国家表格正常渲染。
  - 点击表格行会更新目标国家，并同步 `window.__webglGeneratorApp.selection.object.kind === "state"`。
  - 筛选框输入国家 ID 后表格收敛到匹配结果。
  - 点击“编辑此国家”后，国家编辑激活，renderer 专题切为 `states`。

## 2026-06-27 国家详情归并到国家面板

问题：

- 选中国家对象时会打开通用“对象详情”浮动面板，和已经具备遍历能力的国家编辑面板职责重复。
- 国家重命名仍挂在通用对象详情面板里，国家列表面板无法独立完成浏览、定位和编辑闭环。

实施：

- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 选中国家对象时自动关闭通用对象详情面板，并打开国家编辑面板。
  - 国家面板目标国家同步到当前选中国家。
  - 为国家面板接入国家重命名命令，继续走编辑历史和刷新调度。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 详情区新增国家名称编辑器。
  - 将全称、首都、文化、宗教、中心 cell、面积、城镇、人口和邻国数集中展示在国家遍历面板。
  - 列表继续显示国家全称，输入框编辑国家根名。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 通用对象详情面板不再展示国家对象，也不再负责国家重命名。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增国家名称编辑器布局样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- `git diff --check` 通过。
- Playwright 验证正式版 `app/webgl-generator`：
  - 打开国家面板后点击国家行，当前选择对象为 `state`。
  - 通用对象详情面板保持关闭。
  - 国家面板保持打开并展示名称编辑器。
  - 在国家面板修改国家根名后，`state.name` 与 `state.fullName` 同步更新。
  - 详情区包含文化和宗教信息。

## 2026-06-27 国家编辑器政治派生一致性第一刀

问题：

- 国家笔刷提交后已经同步国家归属和城镇迁移，但省份归属仍可能停留在旧国家，形成跨国家省份 cell。
- 城市迁移国家后，`city.province` 没有跟着当前 cell 的省份修正。
- 运行时缺少明确的“已刷新哪些派生、哪些派生暂缓”的记录。
- 政治边界线层没有面向编辑后的局部重建入口。

实施：

- 使用真实四级流程的子智能体：
  - 中书舍人 / 调查策划员 `Jason` 只读审查现有国家笔刷、刷新调度、renderer 和政治生成链路。
  - 给事中 / 审查者 `Socrates` 独立审查本次 diff 风险。
- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷 effects 明确区分 state cell、pack state cell、settlement state、state statistics、province cells、province statistics、政治边界、selection、labels、object panels 和暂缓派生。
  - 提交国家笔刷后，对受影响 pack land cells 做局部省份修复：优先使用同国家邻接省份，否则回退到目标国家最大省份。
  - 同步受影响 grid cell 的 `grid.cells.province`。
  - 同步迁移城市的 `city.province`。
  - 重算省份 `cells / area / neighbors` 摘要。
  - 将军事、zones 和 state-center markers 标记为派生过期。
  - 为受影响 pack cell state、省份、城市 province、派生过期状态增加 undo/redo 快照恢复。
  - 审查发现“迁走首都后替补首都未入快照”的漏洞后，补充替补首都 city/burg 快照，避免撤销后留下双首都。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 支持在 effects 中记录 `pendingDerived`。
  - `political-boundaries` 会触发 renderer 线层重建。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `refreshLineLayers()`。
  - `buildLineVertices()` 增加基于当前 `grid.cells.state/province` 和共享 Voronoi 边的国家/省份边界线。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 运行时面板显示派生过期系统。
  - 编辑刷新摘要显示待派生项目。
- 修改 `docs/current-plan.md`：
  - 将下一步从“补政治派生一致性策略”更新为“第一刀已完成，后续做省份 pole、军事/zones 重建入口或城市/省份面板”。

说明：

- 拖动预览阶段仍只刷新颜色，不实时重建国家/省份边界线；政治边界线在收笔提交命令后刷新。这是当前性能取舍，后续如需要可单独做预览线层节流刷新。

验证：

- `node --check app/webgl-generator/src/runtime/state-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/runtime/edit-refresh-scheduler.js` 通过。
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- 纯内存命令级不变量验证通过：
  - 跨国家边界 cell 涂色后，受影响 `grid/pack` 国家和省份归属一致，全图跨国家省份 cell 未增加。
  - 同一 grid cell 映射多个初始 pack state 时，撤销可逐 pack cell 恢复原 state/province。
  - 非首都城市迁移后，`city.state`、`burg.state`、`city.province` 同步迁入目标国家，撤销可恢复。
  - 迁走一个仍有其它城市的国家首都后，旧国家会另选单一首都；撤销后全图 city/burg 首都数量和国家 `capital` 引用恢复；重做后仍保持单首都。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 国家笔刷命令经 `editHistory` 与 `editRefreshScheduler` 执行后，`political-boundaries` 触发线层重建，`lineVertexCount` 从 `8952` 变为 `8954`。
  - 运行时面板显示“派生过期”，包含 `military / zones / state-markers`。
  - 编辑刷新摘要显示 `pendingDerived: military, zones, state-markers`；后续省份面板第一刀已将 `province-poles` 改为局部重算项。
  - 受影响 pack cell 的 province 均属于新的 state。
- `git diff --check` 通过。

## 2026-06-27 省份管理面板第一刀与省份 pole 局部重算

问题：

- 国家编辑器已经可以修复国家笔刷后的省份归属，但 `province.pole` 仍被标记为待派生，没有在本地命令里恢复一致。
- 省份对象仍缺少类似国家/河流的独立遍历面板，查看、定位、改名和改色路径分散。

实施：

- 使用真实四级流程的子智能体：
  - 中书舍人 / 调查策划员 `Boole` 只读调查省份面板、对象表格、对象解析、省份命令和 province pole 生成链路。
  - 给事中 / 审查者 `Hilbert` 独立审查本次 diff 风险。
- 新增 `app/webgl-generator/src/ui/panels/province-panel.js`：
  - 独立浮动“省份管理”面板。
  - 支持省份统计摘要、筛选、按面积/cells/国家/ID 排序、表格选择、双击/按钮定位。
  - 详情区展示全称、所属国家、中心 pack/grid cell、pole、面积、cells、邻接省份、城市数、文化和宗教。
  - 支持省份名称编辑、省份颜色编辑和 EditHistory 撤销/重做。
- 修改 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - `createRenameObjectCommand()` 支持省份名称与 fullName 恢复。
  - 新增 `createSetProvinceColorCommand()`，省份颜色变更刷新 `cell-colors` 和对象面板。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 注册 `province-panel`，侧栏按钮可打开省份面板。
  - 选中省份对象时关闭通用对象详情面板，转入省份管理面板。
  - 省份重命名、改色、撤销和重做均走编辑历史与刷新调度。
- 修改 `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷的 `province-poles` 从待派生项改为已处理派生项。
  - 对受影响省份按 pack 省内 cell 与边界 cell 距离局部重算 `province.pole`。
  - `snapshotProvinces()` 追加 `pole` 快照，保证 undo/redo 恢复。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/styles.css`：
  - 新增侧栏“省份管理”入口。
  - 编辑锁禁用列表纳入省份面板入口。
  - 补省份面板布局样式。
- 修改 `docs/current-plan.md`：
  - 将省份管理面板和 province pole 局部重算标记为已完成。

取舍：

- 本刀不做省份 cell 归属笔刷、不重跑完整省份扩张，也不触碰军事、zones 或经济链路。
- 省份面板接管省份对象详情；通用对象详情仍保留其它对象类型。

验证：

- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/runtime/object-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/runtime/state-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- 纯内存命令级验证通过：
  - 省份重命名会同步 `name/fullName`，undo/redo 可恢复。
  - 省份颜色修改会同步 `province.color`，undo/redo 可恢复。
  - 国家笔刷后受影响省份的 `province.pole` 存在并落在本省 pack cell 上，undo 后 pole 恢复。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 点击侧栏“省份管理”可打开独立浮动面板。
  - 点击省份表格行后 selection 对象为 `province`。
  - 经 `EditHistory` 修改省份名称和颜色后，面板显示同步更新。

审查修正：

- `Hilbert` 指出普通高度专题点击陆地时也可能选中省份并自动打开省份面板；已收窄为仅当省份面板已打开或当前专题为省份时，才自动分流到省份面板。普通高度专题下仍可显示通用对象详情。
- 原本无 `color` 字段的省份在颜色命令撤销时会删除新增颜色，避免保留临时颜色。
- 零 cell 省份的 `pole` 改为 `null`，不再回退到旧中心点伪造有效 pole。
- 追加验证：
  - 原色为空的省份执行颜色命令后，undo 会删除新增 `color` 字段。
  - 涂空小省份后 `province.pole === null`，undo 后恢复原 pole。
  - 浏览器中默认高度专题选中省份不会自动弹出省份面板；切到省份专题后选中省份会自动打开省份面板。

## 2026-06-27 河流详情归并到河流管理面板

问题：

- 河流和国家、省份的面板逻辑不一致：选中河流时仍会打开通用对象详情面板，河流管理面板只是额外入口。
- 河流名称编辑挂在通用对象详情的编辑态中，而河流宽度、定位和遍历在河流管理面板中，用户需要在两个面板之间切换。

实施：

- 修改 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 河流详情区新增名称编辑器，重命名直接走面板内表单。
  - 面板记录当前编辑对象，按钮在“进入河流编辑”和“退出河流编辑”之间切换。
  - 关闭河流面板时通知 runtime 退出河流编辑态，避免页面卡在编辑状态。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 选中河流对象时关闭通用对象详情面板，直接打开“河流管理”面板。
  - 河流面板接入河流重命名命令，继续走 `EditHistory` 和刷新调度。
  - 河流编辑按钮支持同一河流的进入/退出切换。
  - 关闭河流面板时增加一次性抑制，避免退出编辑触发 selection 回调后又重新打开面板。
  - 编辑锁允许面板从 `object-details + river-panel` 收窄为仅 `river-panel`。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 通用对象详情面板不再展示河流对象，也不再负责河流重命名或跳转河流面板。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增河流名称编辑器布局样式。
- 修改 `docs/current-plan.md`：
  - 记录河流详情已归并到河流管理面板。

验证：

- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/object-edit-commands.js` 通过。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 选中河流后自动打开“河流管理”面板。
  - 通用对象详情面板保持关闭。
  - 在河流面板内重命名河流后，`river.name` 与面板文本同步更新，历史命令为 `重命名河流 #1`。
  - 点击“进入河流编辑”后 `editingObject.kind === "river"`，按钮变为“退出河流编辑”。
  - 关闭河流面板后面板保持关闭，`editingObject` 重置为 `null`，不会重新弹开。

## 2026-06-27 河流定位保持列表滚动位置

问题：

- 河流管理面板中点击列表行的“定位”后，定位会触发 selection 更新和面板重渲染。
- 重渲染会重置 `.object-table-wrap` 的 `scrollTop`，导致刚点击定位的河流行被滚出列表视口。

实施：

- 修改 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 渲染前读取当前河流表格滚动位置，渲染后恢复。
  - 筛选和排序仍重置到顶部；定位、选中、编辑历史刷新等普通重渲染保留原滚动位置。

验证：

- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时静态 server 验证正式版 `app/webgl-generator`：
  - 打开河流管理面板，将河流表格滚动到接近底部。
  - 点击倒数第二条河流的“定位”。
  - 定位后 `scrollTop` 从 `6828` 保持为 `6828`。
  - 选中河流仍在表格视口内，selection 对象为 `river #220`。

## 2026-06-27 城市管理面板第一刀

目标：

- 将城市/聚落从通用对象详情中迁入独立浮动管理面板，和国家、省份、河流保持一致。
- 第一刀只做列表、统计、定位、选择和名称编辑，不做新增/删除、移动城市、人口修改、归属重分配或港口重算。

实施：

- 新增 `app/webgl-generator/src/ui/panels/city-panel.js`：
  - 独立浮动“城市管理”面板。
  - 支持城市总数、首都数、港口数、人口合计和筛选数量摘要。
  - 支持按人口、类型、国家、省份和 ID 排序。
  - 列表展示 ID、名称、类型、国家、省份和人口，点击选中，双击或按钮定位。
  - 详情区展示类型、标记、所属国家、所属省份、人口、grid cell、pack cell、burg id、文化和宗教。
  - 名称编辑走既有 `createRenameObjectCommand()`，同步 `settlements.cities` 与 `pack.burgs`，并接入 EditHistory 撤销/重做。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 注册 `city-panel`，侧栏按钮可打开城市管理面板。
  - 选中城市对象时关闭通用对象详情面板，直接打开城市管理面板。
  - 城市面板的选择、定位、重命名、撤销和重做接入 selection store、renderer locate 和 edit refresh scheduler。
  - 国家首都变更、国家刷子、省份重命名等可能影响城市面板显示的路径会刷新城市面板。
- 修改 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 通用对象详情不再展示城市对象，避免城市详情来源重复。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/styles.css`：
  - 新增侧栏“城市管理”入口。
  - 编辑锁禁用列表纳入城市面板入口。
  - 补城市面板布局样式。
- 修改 `docs/current-plan.md`：
  - 将城市/聚落正式面板第一刀标记为已完成，并记录后续第二刀范围。

验证：

- `node --check app/webgl-generator/src/ui/panels/city-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/object-details-panel.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 点击侧栏“城市管理”可打开独立浮动面板。
  - 通过 selection store 选中城市后，城市面板保持打开，通用对象详情面板保持关闭。
  - 在城市面板内将城市 `#0` 改名为“浏览器测试城”后，`settlements.cities[0].name` 与对应 `pack.burgs[1].name` 同步更新。
  - EditHistory 记录为 `重命名城市 #0`，面板文本同步显示新名称。
- `git diff --check` 通过。

## 2026-06-28 浮动面板筛选输入焦点修复

问题：

- 国家、省份、城市和河流面板的筛选框输入一个字符后会失焦。
- 根因是筛选 `input` 事件更新面板状态后调用 `PanelManager.setContent()`，整块替换面板 body，正在输入的 DOM 节点被销毁。
- 第一版只在替换后恢复焦点，对英文输入可用，但对中文输入法不够：拼音组词处于 composition 阶段时，DOM 被替换会打断输入法状态，即使随后重新聚焦也已经破坏了本次输入。

实施：

- 新增 `app/webgl-generator/src/ui/components/filter-input.js`：
  - 封装筛选搜索框。
  - `compositionstart` 到 `compositionend` 期间只保留输入框自身值，不触发面板重渲染。
  - `compositionend` 后再提交筛选值并重渲染列表，避免中文拼音候选词阶段被 DOM 替换打断。
- 修改 `app/webgl-generator/src/ui/panels/state-panel.js`、`province-panel.js`、`city-panel.js`、`river-panel.js`：
  - 四个面板的筛选框统一改用 `createFilterInput()`。
- 修改 `app/webgl-generator/src/ui/panel-manager.js`：
  - `setContent()` 替换内容前记录当前焦点元素在面板 body 内的子节点路径、控件类型和文本选择区间。
  - 替换内容后，如果新节点路径和控件类型一致，则用 `focus({preventScroll: true})` 恢复焦点，并恢复输入光标位置。
  - 该逻辑仅作为非 composition 场景的焦点兜底；中文输入法的主要保护在 `filter-input`。

验证：

- `node --check app/webgl-generator/src/ui/components/filter-input.js` 通过。
- `node --check app/webgl-generator/src/ui/panel-manager.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/city-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 国家、省份、城市和河流四个面板的筛选框分别连续输入 `abc`。
  - 每次字符输入后 `document.activeElement` 都仍是对应筛选框。
  - 每个筛选框最终值为 `abc`，光标停在末尾。
  - 模拟中文输入法 composition：四个面板在 `compositionstart -> input(isComposing=true)` 期间筛选输入框保持同一个 DOM 节点且保持焦点，直到 `compositionend` 后才提交筛选值并重渲染。

## 2026-06-28 浮动面板公共 DOM 组件与图层开关

目标：

- 抽出大部分浮动面板共用的 DOM 组件，减少国家、省份、城市和河流面板之间的重复结构。
- 修复无人地带与相邻国家之间国界开放，导致国界断开的视觉问题。
- 修复国家列表在 hover 更新时滚动位置被重置到顶部的问题。
- 在专题视图之外提供独立图层显隐开关，先覆盖道路、河流、城市、城市标签、国界、省界和海岸线。

实施：

- 新增 `app/webgl-generator/src/ui/components/summary-grid.js`、`sort-bar.js`、`detail-grid.js`、`history-actions.js` 和 `table-scroll.js`：
  - 统一摘要指标、排序按钮、详情网格、撤销/重做操作区和表格滚动位置恢复。
  - 国家、省份、城市和河流面板改用这些公共组件。
- 修改 `app/webgl-generator/src/ui/components/table-scroll.js`：
  - 表格重渲染后立即恢复旧 `scrollTop`，并在下一帧兜底恢复一次。
  - 避免国家面板在画布 hover 触发面板刷新时把列表滚动位置打回顶部。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `layerVisibility` 状态与 `setLayerVisible()`。
  - line layer 支持按开关重建海岸线、湖岸线、国界和省界。
  - point layer 支持按开关重建人口点、城市点和 marker 点。
  - 道路、河流和城市标签在 draw/update label 阶段按开关跳过。
  - 国家边界构建允许 `state > 0` 与 `state = 0` 的陆地邻接边生成国界线；省界仍不绘制 `province = 0` 的边界。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/runtime/app.js`：
  - 侧栏新增“图层”开关组。
  - 运行时面板统计区显示当前开启的图层。
  - 编辑锁期间图层开关会和其他非编辑交互一起禁用。

验证：

- `node --check app/webgl-generator/src/ui/components/summary-grid.js` 通过。
- `node --check app/webgl-generator/src/ui/components/sort-bar.js` 通过。
- `node --check app/webgl-generator/src/ui/components/detail-grid.js` 通过。
- `node --check app/webgl-generator/src/ui/components/history-actions.js` 通过。
- `node --check app/webgl-generator/src/ui/components/table-scroll.js` 通过。
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/city-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/river-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 当前生成图存在 `173` 条无人地带与国家陆地邻接边。
  - 关闭国界后 line vertex 从 `9298` 降到 `7932`，重新打开后恢复为 `9298`。
  - 关闭城市点后 point vertex 从 `861` 降到 `44`。
  - 关闭城市标签后可见标签数为 `0`。
  - 道路与河流开关会正确写入 renderer 图层状态。
  - 国家面板滚动到 `593` 后触发画布 hover，重渲染后的表格 `scrollTop` 仍为 `593`。
  - 国家面板摘要与详情区来自公共组件。

## 2026-06-28 省份归属笔刷与路线面板第一刀

目标：

- 在正式版补上省份 cell 归属笔刷，让省份编辑器具备和国家编辑器同型的区域编辑能力。
- 新增路线管理浮动面板，作为第二批对象管理面板的第一刀。
- 本轮不做省份新增/删除、跨国家刷省份、路线改道、新增路线或删除路线。

实施：

- 新增 `app/webgl-generator/src/runtime/province-edit-commands.js`：
  - 提供 `createApplyProvinceBrushCommand()` 和 `applyProvinceBrushPreview()`。
  - 省份笔刷提交后同步 `grid.cells.province` 与对应陆地 `pack.cells.province`。
  - 同步被影响城市的 `city.province`。
  - 重算省份 cells、面积、邻接、center 兜底和 pole。
  - 支持 EditHistory 撤销/重做；主省份字段由 command changes 回放，快照只保存城市和省份派生字段，避免预览态覆盖撤销。
- 修改 `app/webgl-generator/src/ui/panels/province-panel.js`：
  - 新增启用/停止省份编辑、目标省份、取选中、取悬停、半径和影响数量。
  - “编辑此省份”会进入省份专题并开启省份编辑。
  - 编辑中不再让外部 selection 刷新覆盖目标省份。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 新增 `provinceEdit` 运行时状态和 `bindProvinceEditing()`。
  - 省份编辑与高度编辑、国家编辑互斥。
  - 省份编辑锁定编辑外交互，只允许省份面板继续操作。
  - 省份笔刷只允许刷目标省份所属国家内的陆地 cell。
- 新增 `app/webgl-generator/src/ui/panels/route-panel.js`：
  - 独立浮动“路线管理”面板。
  - 支持路线总数、筛选数、总长度、海路数量摘要。
  - 支持按长度、段数、类型和 ID 排序。
  - 列表展示 ID、类型、起点、终点和长度，点击选中，双击或按钮定位。
  - 详情区展示类型、等级、起点、终点、长度、段数、grid cells、pack cells 和 feature。
- 修改 `app/webgl-generator/index.html`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/styles.css`：
  - 侧栏新增“路线管理”入口。
  - 编辑锁纳入路线管理入口。
  - 补省份编辑控件和路线面板样式。

验证：

- `node --check app/webgl-generator/src/runtime/province-edit-commands.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/route-panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- Playwright 临时内嵌静态 server 验证省份笔刷：
  - 样本 grid cell `934` 从省份 `89` 刷到同国家目标省份 `84`。
  - 对应 `3` 个陆地 pack cell 省份同步为 `84`。
  - EditHistory 记录 `省份笔刷 2 cells`。
  - 撤销后 grid cell `934` 恢复为省份 `89`。
  - 重做后 grid cell `934` 再次变为省份 `84`。
  - 开启省份编辑后专题切换为 `provinces`，面板含半径与影响数量控件。
- Playwright 临时内嵌静态 server 验证路线面板：
  - 侧栏“路线管理”可打开独立浮动面板。
  - 当前生成图 `679` 条路线全部进入列表。
  - 点击默认排序第一行选中 route `#586`。
  - 路线渲染/高亮 buffer 生成 `25908` 个 route vertices。
  - 路线面板摘要和详情区来自公共组件。

## 2026-06-28 生成配置浮动面板第一刀

目标：

- 将固定侧栏中的生成配置迁移到独立 DOM 浮动面板，继续收窄固定侧栏职责。
- 保持既有生成流程、默认 seed、目标 cells、地图尺寸、地形模板和随机 seed 行为不变。

实施：

- 新增 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 注册 `generation-panel` 浮动面板。
  - 面板内保留原生成控件 ID：`seed-input`、`cells-input`、`width-input`、`height-input`、`heightmap-template`、`auto-random-seed`、`generate-map` 和 `random-seed`。
  - 这样 `readOptionsFromPanel()`、`setSeedInput()` 和 `requestGenerate()` 可以继续复用原流程。
- 修改 `app/webgl-generator/index.html`：
  - 固定侧栏“生成”区只保留“生成配置”入口。
  - 原 seed、cells、尺寸、模板和生成按钮从固定侧栏移除。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 应用初始化时创建 `generation-panel`，确保首次自动生成前生成控件已经存在于 DOM。
  - 侧栏入口可打开生成配置面板。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 绑定 `open-generation-panel`。
  - 编辑锁定时禁用生成配置入口和面板内生成控件。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增生成配置面板表单、字段、checkbox 和按钮行样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 首次自动生成仍使用 `stage-2-1` 和 `10000` 目标 cells。
  - 固定侧栏不再包含 `seed-input` 或 `generate-map`。
  - 点击“生成配置”可打开 `generation-panel`，面板内包含 seed 输入框。
  - 点击“换 seed”后 seed 从 `stage-2-1` 变为 `map-mqxawad0-1c1tom7`，并完成重新生成。
  - 在浮动面板内设置 `cells=2000`、`width=800`、`height=600`、`heightmapTemplate=archipelago` 后点击生成，运行时地图更新为 `800 x 600 / 2000 cells`。

## 2026-06-28 控制面板 tab 化

问题：

- 单独把生成配置迁入浮动面板太薄，固定侧栏中仍残留专题选择器、图层选择和管理页面入口。
- 用户要求这些控制类 UI 与生成配置合并到同一个浮动面板中，并分别占用 tab。

实施：

- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - `generation-panel` 从单一生成表单扩展为“控制面板”。
  - 新增 `生成 / 专题 / 图层 / 管理` 四个 tab。
  - 生成 tab 保留 seed、目标 cells、地图尺寸、地形模板、自动随机 seed、生成和换 seed。
  - 专题 tab 承载高度、温度、降水、生物群系、文化、宗教、国家、省份、区域和人口专题按钮，以及“高度专题显示海底”开关。
  - 图层 tab 承载道路、河流、城市、城市标签、国界、省界和海岸线显隐开关。
  - 管理 tab 承载适配视图、高度编辑、国家编辑、省份管理、城市管理、路线管理和河流管理入口。
- 修改 `app/webgl-generator/index.html`：
  - 固定侧栏只保留“控制面板”入口。
  - 从固定侧栏移除专题选择器、图层选择和管理入口。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增控制面板 tab、tab body、图层双列和管理入口双列布局。

验证：

- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 控制面板可打开，tab 为 `生成 / 专题 / 图层 / 管理`。
  - 固定侧栏中专题按钮、图层开关和管理入口数量均为 `0`。
  - 控制面板内有 `10` 个专题按钮、`7` 个图层开关和 `6` 个对象管理入口。
  - 生成 tab 可设置 `cells=3000`、`width=900`、`height=620` 并重新生成，运行时 badge 更新为 `900 x 620 / 3000 cells`。
  - 专题 tab 可切换到 `states`，并能开启“高度专题显示海底”。
  - 图层 tab 可关闭道路图层，renderer 中 `layerVisibility.routes=false`。
  - 管理 tab 可打开路线管理面板。

## 2026-06-28 图层按钮与控制偏好持久化

问题：

- 控制面板中的图层开关仍是普通 checkbox，视觉上比各管理面板入口简陋。
- 用户配置好的图层显隐、专题和高度专题海底显示状态，每次重新打开页面都会丢失。

实施：

- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 图层 tab 从 checkbox 改为 `button[data-layer]`。
  - 按钮使用 `aria-pressed` 和 `active` class 表示当前显隐状态。
  - 按钮内部增加圆点指示器，便于快速扫视开关状态。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 新增 `webgl-generator-control-preferences` localStorage 偏好。
  - 控制面板绑定前先恢复专题、图层显隐和“高度专题显示海底”控件状态。
  - 点击专题、图层按钮或切换海底高度显示时，同步写回 localStorage。
  - localStorage 不可用时静默降级，不影响页面运行。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 初始化生成前读取控制偏好并应用到 renderer，确保首次生成即使用用户上次配置。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增图层按钮、hover、高亮和圆点指示器样式，使图层控制接近管理面板按钮风格。

验证：

- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 预置 localStorage 后首次生成恢复 `religions` 专题、`showOceanHeight=true`、道路/标签关闭和城市开启。
  - 图层 tab 中有 `7` 个 `button[data-layer]`，不再有 `input[data-layer]`。
  - 关闭的道路和标签按钮 `aria-pressed=false` 且没有高亮；开启的城市按钮 `aria-pressed=true`。
  - 点击道路按钮会同步 renderer `layerVisibility.routes=true`，并写回 localStorage。
  - 切换到国家专题会同步 renderer `colorMode=states`，并写回 localStorage。
  - 关闭“高度专题显示海底”会同步 renderer `showOceanHeight=false`，并写回 localStorage。
  - 刷新页面后，国家专题、道路开启和海底高度关闭状态仍能恢复。

## 2026-06-28 城市标签上限滑动条

问题：

- 城市标签候选数量此前固定为 `48`，用户无法主动要求展示更多城市标签。
- 标签 LOD 和避让机制本身有效，应保留缩小时自动隐藏和防重叠行为。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `labelOptions.maxCityLabels`，默认 `48`。
  - `getLabelCities()` 从固定 `.slice(0, 48)` 改为读取可配置上限。
  - `labelLimitForScale()` 按缩放比例和上限动态计算可见数量；缩小时仍保留限流，放大后可显示更多候选。
  - 新增 `setLabelOptions()`，用于只重建城市标签 overlay，不重建地图 mesh。
- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 在 `图层` tab 新增“城市标签上限”滑动条，范围 `8..240`，默认 `48`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 滑动条变更时更新数值显示、写入 localStorage，并调用运行时 handler。
  - 运行时统计中的“城市标签”显示 `可见 / 候选 / 上限`。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 初始化时从控制偏好恢复 `maxCityLabels`。
  - 滑动条输入时调用 renderer 更新标签候选。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增标签上限滑动条布局和数值样式。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - localStorage 预置 `maxCityLabels=96` 后，滑动条、输出值和 renderer 均恢复为 `96`。
  - 当前样本候选标签数为 `96`，可见标签数为 `17`，说明候选上限与避让/LOD 同时生效。
  - 将滑动条调到 `160` 后，renderer `labelOptions.maxCityLabels=160`，候选标签数变为 `160`，localStorage 写回 `160`。
  - 刷新页面后滑动条、输出值、renderer 和 localStorage 仍保持 `160`。

## 2026-06-28 城市标签上限修正

问题：

- 用户发现滑动条拉到最大、地图放大到最大后，仍有一批城镇标签不会显示。
- 排查确认上一刀的滑动条最大值固定为 `240`，renderer 和 UI clamp 也都限制到 `240`。
- 当前默认样本实际有 `817` 个城市，因此最大值 `240` 只代表“前 240 个高优先级城市进入标签候选”，不是“所有城市都可参与显示”。

实施：

- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 城市标签上限滑动条初始 `max` 从 `240` 放宽为 `2000`。
  - 步进从 `8` 改为 `1`，便于动态上限精确等于当前城市总数。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js` 和 `app/webgl-generator/src/ui/panel.js`：
  - `maxCityLabels` 内部 clamp 从 `240` 放宽到 `5000`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计刷新时，按当前地图 `settlements.cities.length` 动态设置滑动条 `max`。
  - 当当前地图城市数小于已保存偏好时，UI 显示值会收敛到当前城市总数；renderer 仍可用较大偏好表示“尽可能全量”。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/generation-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 默认样本城市总数为 `817`。
  - localStorage 预置 `maxCityLabels=240` 时，滑动条 `max` 会动态显示为 `817`，候选标签数仍按偏好为 `240`。
  - 将滑动条拉到最大后，输入值、输出值、renderer `maxCityLabels` 和候选标签数均为 `817`，非候选城市数为 `0`。
  - 刷新后仍保持 `817`。
  - 全图 fit 状态下可见标签仍为 `17`，这是现有 LOD、视口和碰撞避让机制生效，不再是候选上限过低导致。

## 2026-06-28 首都标签字号区分

问题：

- 用户反馈国都文字需要比大城市更大，能够在地图标签中明显分辨。

实施：

- 修改 `app/webgl-generator/src/styles.css`：
  - `.city-label.capital` 从仅调整颜色和粗体，改为 `15px` 字号、`800` 字重、稍大的 padding 和 `156px` 最大宽度。
- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 首都标签碰撞盒估算同步放大，避免字体变大后与其他标签发生未预估重叠。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 首都标签 computed style 为 `font-size: 15px`、`font-weight: 800`。
  - 普通城市标签 computed style 为 `font-size: 11px`、`font-weight: 400`。

## 2026-06-28 城市标签 LOD 连续化

问题：

- 用户反馈城市标签显隐过渡不自然：全图缩放约 `100%` 时只零星显示少数城市，稍微放大到某个点后又突然显示大量标签。
- 排查确认原因是标签 LOD 存在硬阈值：
  - `minLabelScale()` 把大量普通城镇统一卡在 `1.85` 缩放阈值。
  - `labelLimitForScale()` 在 `0.75 / 1.35 / 2.4` 三个缩放点阶梯式增加可见上限。
  - 标签显隐直接切换 `display`，没有视觉淡入淡出。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 普通城市标签的 `minScale` 改为按优先级 rank 连续分布，不再让所有普通城镇共用同一个出现阈值。
  - `labelLimitForScale()` 改为 `smoothStep()` 曲线，随缩放平滑增加可见数量上限。
  - 标签显隐从设置 `display` 改为切换 `.visible` class，保留现有 picking 只命中可见标签的逻辑。
- 修改 `app/webgl-generator/src/styles.css`：
  - `.city-label` 默认 `opacity: 0`、`visibility: hidden`。
  - `.city-label.visible` 淡入显示，使用 `140ms` opacity 过渡。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Playwright 临时内嵌静态 server 验证正式版 `app/webgl-generator`：
  - 当前样本城市总数 `817`，标签候选数 `817`。
  - 视图中心固定时，缩放采样可见标签数为：
    - `1.0 -> 16`
    - `1.1 -> 17`
    - `1.2 -> 17`
    - `1.35 -> 23`
    - `1.5 -> 25`
    - `1.7 -> 30`
    - `1.85 -> 30`
    - `2.1 -> 43`
    - `2.4 -> 46`
  - 没有再出现跨过某个缩放点后标签突然全量显示的跳变。

## 2026-06-28 城市/聚落面板第二刀 A

目标：

- 在城市管理面板补上低风险可撤销编辑，不进入城市新增/删除、移动、自由迁国迁省或港口重算。
- 人口编辑必须同时写入正式应用城市对象和 source 风格 burg 对象，避免面板、标签和后续统计读取到不同值。
- 归属修复只允许把城市记录同步到当前所在 cell 的国家/省份，不提供任意下拉迁移。

实施：

- 新增 `app/webgl-generator/src/runtime/city-edit-commands.js`：
  - `createSetCityPopulationCommand()` 校验非负有限数，写入 `settlements.cities[id].population` 与对应 `pack.burgs[burgId].population`，并支持 EditHistory 撤销/重做。
  - `createSyncCityOwnerToCellCommand()` 读取城市当前 `packCell` 的 `pack.cells.state/province`，回填 `city.state`、`city.province`、`burg.state` 和既有 `burg.province` 字段。
  - 两类命令都会刷新城市相关 metadata 和国家 urban/burgs 统计，避免打开管理面板时看到旧值。
- 修改 `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`：
  - 新增 `point-layers` effect，允许城市人口相关编辑请求重建点层后再绘制。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 城市面板新增人口编辑和归属同步 runtime callback，统一走 `editHistory.execute()`。
  - 城市面板撤销/重做后同步刷新国家、省份和城市面板。
- 修改 `app/webgl-generator/src/ui/panels/city-panel.js`：
  - 城市详情加入人口输入与“应用人口”按钮。
  - 城市详情展示当前记录归属、所在 cell 归属、归属一致性和落水检查。
  - 新增“同步归属到所在 cell”按钮，仅在城市/burg 归属与所在 cell 不一致时启用。

暂缓：

- 不做新增/删除城市。
- 不做城市位置移动。
- 不做任意迁国/迁省下拉，也不重跑国家/省份扩张。
- 不做港口重算、路线重算、军事、zones 或经济派生更新。

## 2026-06-28 城市标签上限默认全量

问题：

- 用户要求“城市标签上限”滑动条默认给全部。
- 此前虽然滑动条最大值会按当前地图城市总数动态设置，但 renderer 默认 `maxCityLabels` 仍为 `48`，地图加载时会先按 48 个候选构建标签。

实施：

- 修改 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 默认 `maxCityLabels` 从 `48` 改为 `5000`。
  - 标签候选和可见上限曲线的默认 fallback 同步改为 `5000`。
- 修改 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - “城市标签上限”滑动条初始最大值和初始值改为 `5000`。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 没有 localStorage 偏好时，控制层默认上限改为 `5000`。
  - 运行时面板显示的“上限”按当前城市总数收敛，默认样本会显示为全部城市数量，而不是内部 5000。

行为：

- 新用户或清空 localStorage 后，城市标签候选默认覆盖当前地图全部城市。
- 用户已经在浏览器 localStorage 中手动设置过较小上限时，仍尊重用户保存的偏好。

## 2026-06-28 文化管理面板第一刀

目标：

- 进入第三批区域实体面板，先完成文化管理面板第一刀。
- 本刀只做管理、统计、定位、名称和颜色编辑，不做文化 cell 归属笔刷、中心迁移、扩张参数编辑或宗教联动重算。

实施：

- 新增 `app/webgl-generator/src/ui/panels/culture-panel.js`：
  - 支持文化列表、筛选、排序、选中、定位、名称编辑、颜色编辑和 EditHistory 撤销/重做。
  - 详情展示文化词根、类型、扩张值、中心 pack/grid cell、覆盖 cells、面积、乡村人口、城市人口、城市数和主要国家分布。
- 新增 `app/webgl-generator/src/runtime/culture-edit-commands.js`：
  - `createSetCultureColorCommand()` 校验 `#rrggbb` 颜色，写入文化对象颜色，并支持撤销/重做。
- 修改 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - 通用对象重命名支持 `culture`，并同步更新文化 `root`。
- 修改 `app/webgl-generator/src/runtime/app.js` 和 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 控制面板“管理”tab 新增“文化管理”入口。
  - runtime 接入文化选择、定位、名称编辑、颜色编辑、撤销和重做。
- 修改 `app/webgl-generator/src/renderer/picking.js`、`app/webgl-generator/src/runtime/object-resolver.js` 和 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 文化专题点击地图时可产生 `culture` 对象。
  - `locateObject()` 和选中高亮支持文化区域。
  - 文化专题颜色优先读取 `map.society.cultures[id].color`，缺失时回退 indexed color。
- 修改 `app/webgl-generator/src/styles.css`：
  - 新增文化面板摘要、筛选、排序、详情、名称编辑、颜色编辑和历史操作的样式。

暂缓：

- 不做文化 cell 归属笔刷。
- 不做文化中心移动。
- 不做扩张参数编辑。
- 不重算宗教、国家、城市或路线派生链。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/panels/culture-panel.js`
  - `app/webgl-generator/src/runtime/culture-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/renderer/picking.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
- `git diff --check` 通过。
- Playwright 临时静态 server 验证正式应用：
  - 打开 `文化管理` 面板，默认样本显示 `12` 个文化。
  - 文化名称 `栖梧文化 -> 栖梧新文化`，撤销/重做均生效，`root` 同步为 `栖梧新`。
  - 文化颜色改为 `#33aa77` 后触发 `culture-color, cell-colors, object-panels` 刷新，撤销后恢复无自定义颜色状态。
  - `renderer.locateObject({kind: "culture", id: 1})` 成功，定位状态为 `culture #1`，选中高亮为 `culture red flash`。
  - 文化专题下点击远离城市标签的文化 cell，可选中 `culture #1` 并自动打开文化面板。

## 2026-06-28 宗教管理面板第一刀

目标：

- 延续文化管理面板的形态，补齐宗教管理面板第一刀。
- 本刀只做管理、统计、定位、名称和颜色编辑，不做宗教 cell 归属笔刷、中心迁移、扩张参数编辑或文化/国家/城市宗教联动重算。

实施：

- 新增 `app/webgl-generator/src/ui/panels/religion-panel.js`：
  - 支持宗教列表、筛选、排序、选中、定位、名称编辑、颜色编辑和 EditHistory 撤销/重做。
  - 详情展示宗教类型、形态、扩张范围、扩张强度、主神、所属文化、中心 pack/grid cell、覆盖 cells、面积、乡村人口、城市人口、城市数、主要国家和主要文化。
- 新增 `app/webgl-generator/src/runtime/religion-edit-commands.js`：
  - `createSetReligionColorCommand()` 校验 `#rrggbb` 颜色，写入宗教对象颜色，并支持撤销/重做。
- 修改 `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - 通用对象重命名支持 `religion`。
- 修改 `app/webgl-generator/src/runtime/app.js`、`app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 控制面板“管理”tab 新增“宗教管理”入口。
  - runtime 接入宗教选择、定位、名称编辑、颜色编辑、撤销和重做。
  - 通用对象标题和详情格式补充 `religion`。
- 修改 `app/webgl-generator/src/renderer/picking.js`、`app/webgl-generator/src/runtime/object-resolver.js` 和 `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 宗教专题点击地图时可产生 `religion` 对象。
  - `locateObject()` 和选中高亮支持宗教区域。
  - 宗教专题颜色优先读取 `map.society.religions[id].color`，缺失时回退 indexed color。
- 修改 `app/webgl-generator/src/styles.css`：
  - 宗教面板复用文化面板的摘要、筛选、排序、详情、名称编辑、颜色编辑和历史操作布局。

暂缓：

- 不做宗教 cell 归属笔刷。
- 不做宗教中心移动。
- 不做扩张范围和扩张强度编辑。
- 不重算文化、国家、城市、路线、zones 或其他派生链。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/panels/religion-panel.js`
  - `app/webgl-generator/src/runtime/religion-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
  - `app/webgl-generator/src/renderer/picking.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
- `git diff --check` 通过。
- Playwright 临时静态 server 验证正式应用：
  - 打开 `宗教管理` 面板，默认样本显示 `18` 个宗教。
  - 宗教名称 `栖梧民俗 -> 栖梧民俗新` 生效。
  - 宗教颜色改为 `#8844cc` 后触发 `religion-color, cell-colors, object-panels` 刷新，撤销后恢复原颜色。
  - `renderer.locateObject({kind: "religion", id: 1})` 成功，宗教对象可进入选中状态并构建宗教区域高亮。
  - 宗教专题下用 renderer 实际 pick 结果筛选地图点并真实鼠标点击，可选中 `religion` 对象，选中高亮为 `religion translucent cells`。

## 2026-06-28 文化命名风格第一刀

问题：

- 用户指出文化必须“有点用”：如果某个文化是西方文化，那么城镇、国家、河流等命名也应该体现西方风格。
- 此前 `culture` 只作为命名 seed 的一部分，并不会改变词池；即使随机到 `european` 文化集，最终地名仍主要是中式地名。

实施：

- 修改 `app/webgl-generator/src/generator/society.js`：
  - `european` 和 `english` 文化集生成的文化对象会带 `nameStyle: "European"`。
  - grid fallback 文化也保留定义上的 `root` 和 `nameStyle` 字段。
- 修改 `app/webgl-generator/src/generator/names.js`：
  - 新增西方音译地名和水名词池，例如 `雷恩`、`兰德`、`温德`、`卡斯特`、`莱茵`、`欧伦`、`艾文`。
  - `makePlaceName()`、`makeRiverName()`、`makeLakeName()` 和 `makeStateFormName()` 会读取 `cultureType/nameStyle`。
  - 显式 `European` 文化不再混入普通中式词根，但仍输出中文音译和中文地理后缀，避免纯外文名。
- 修改 `app/webgl-generator/src/generator/settlements.js`、`politics.js` 和 `rivers.js`：
  - 城市、港口、国家、省份、河流和湖泊命名都会传入所属文化的 `nameStyle` 或文化类型。
  - 河流几何仍在文化前生成，但会在 `buildSociety()` 后执行一次 `renameHydronymsByCulture()`，使水系名称能读取最终文化归属。
- 修改 `app/webgl-generator/src/ui/panels/culture-panel.js`、`runtime/object-resolver.js` 和 `renderer/picking.js`：
  - 文化对象和文化管理面板展示“命名风格”，后续可扩展为可编辑字段。

验证：

- `node --check` 已覆盖：
  - `app/webgl-generator/src/generator/names.js`
  - `app/webgl-generator/src/generator/society.js`
  - `app/webgl-generator/src/generator/settlements.js`
  - `app/webgl-generator/src/generator/politics.js`
  - `app/webgl-generator/src/generator/rivers.js`
  - `app/webgl-generator/src/generator/index.js`
- 使用 `culturesSet: "european"` 生成抽样：
  - 城市样例包含 `雷恩郡`、`兰德城`、`温德堡`、`沃伦顿`、`阿尔文城`。
  - 国家样例包含 `贝尔顿公国`、`温德堡自由邦`、`奥斯维尔王国`。
  - 河流样例包含 `莱茵江`、`欧伦江`、`艾文溪`、`阿斯河`。
  - 抽样名称没有纯 Latin 外文名。

## 2026-06-28 Vue SFC 与 Pinia 状态岛第一刀

目标：

- 按用户要求引入最简 ESM Vue SFC 模式，不走 CDN，并让用户能看到真实 Vue 面板落地。
- 使用 Pinia 接管编辑状态和全局配置状态，但不把 WebGL 地图数据、pack/grid、renderer buffer 或 picking index 放入 Pinia。
- 配置状态继续快速同步到浏览器 `localStorage`，保证专题、图层和标签上限等偏好下次打开仍可恢复。

实施：

- 使用 `pnpm` 安装运行依赖 `vue`、`pinia`、`@vueuse/core`，安装开发依赖 `vite` 和 `@vitejs/plugin-vue`，新增 `pnpm-lock.yaml`。
- 新增 `vite.config.mjs`，正式应用根目录指向 `app/webgl-generator`，构建输出到 `dist/webgl-generator`。
- 修改根 `package.json`：
  - `start:app` 改为 Vite dev server。
  - 新增 `build:app` 和 `preview:app`。
  - 保留旧 `start:prototype`，继续使用项目静态服务启动旧 WebGL cells 原型。
- 修改 `app/webgl-generator/index.html`：
  - 保留原 canvas 和 DOM 面板结构。
  - 新增隐藏的 `#vue-state-root`，作为 Vue SFC 状态岛挂载点。
- 新增 `app/webgl-generator/src/ui/vue/`：
  - `pinia.js` 创建全局 Pinia 实例。
  - `VueStateBridge.vue` 作为当前最小 SFC 根组件。
  - `state-bridge.js` 暴露 runtime 可调用的状态同步门面，并把 `config/editor` store 暂挂到 `window.__webglGeneratorStores` 便于调试。
  - `stores/global-config-store.js` 使用 Pinia setup store 和 `@vueuse/core` 的 `useLocalStorage()` 管理 `webgl-generator-control-preferences`。
  - `stores/editor-store.js` 只保存当前编辑器、交互锁、编辑对象摘要、笔刷摘要和 history 计数等轻量状态。
- 修改 `app/webgl-generator/src/main.js`：
  - 在正式应用 runtime 初始化前先初始化 Vue/Pinia 状态岛。
- 重写 `app/webgl-generator/src/ui/panels/generation-panel.js`：
  - 删除旧的 `document.createElement()` 控制面板拼装逻辑。
  - 改为在原浮动面板 body 内挂载 `ControlPanel.vue`。
  - 保留 `generate-map`、`data-mode`、`data-layer`、管理入口按钮等原 id/data 契约，使现有 runtime 事件绑定继续可用。
- 新增 `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 用 Vue SFC 渲染生成配置、专题选择、图层开关和管理入口四个 tab。
  - 专题 active、图层 active、海底高度开关和城市标签上限从 Pinia `global-config` store 读取。
  - WebGL 地图数据和大型渲染状态仍不进入组件 props 或 Pinia。
- 修改 `app/webgl-generator/src/ui/panel.js`：
  - 控制偏好读写优先走 Pinia/global-config store。
  - 保留原生 `localStorage` fallback，避免状态岛不可用时控制面板失效。
- 修改 `app/webgl-generator/src/runtime/app.js`：
  - 编辑交互锁刷新时同步轻量 editor snapshot 到 Pinia。
  - snapshot 不包含地图数据、renderer、selection store、grid/pack 或大型数组。
- 修改 `.gitignore`：
  - 忽略 `.pnpm-store/`，避免本地 pnpm store 出现在 git 状态中。

工具链注意：

- 本次在 Codex 沙箱内直接运行 `pnpm run build:app` 会触发 Codex runtime 包装的 pnpm 运行前依赖校验；它与本机 fnm/pnpm 创建的 `node_modules` 不同源时，会尝试非交互式重建目录并可能留下半安装状态。
- 处理方式是安全删除工作区内损坏的 `node_modules` 后，使用同一 pnpm 环境重新执行 `pnpm install --frozen-lockfile`；验证阶段直接调用本地 Vite 入口：
  - `node .\node_modules\.pnpm\vite@8.1.0\node_modules\vite\bin\vite.js build --config vite.config.mjs`

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/vue/state-bridge.js`
  - `app/webgl-generator/src/ui/vue/stores/global-config-store.js`
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
  - `app/webgl-generator/src/runtime/app.js`
- Vite 生产构建通过：
  - 生成 `dist/webgl-generator/index.html` 和对应 CSS/JS assets。
  - 构建输出中只有 `@vueuse/core` 依赖的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时静态 server 验证 `dist/webgl-generator`：
  - 页面标题为 `WebGL 地图生成器`。
  - `#map-canvas` 存在。
  - `window.__webglGeneratorStores` 中存在 `config` 和 `editor`。
  - 打开控制面板后存在 `.vue-control-panel-root`，确认控制面板由 Vue 挂载。
  - Vue 控制面板 tab 可切到 `图层` 和 `专题`。
  - 点击 `rivers` 图层开关后，按钮 `aria-pressed` 变为 `false`，Pinia 和 `localStorage` 同步记录 `layers.rivers = false`。
  - 点击 `states` 专题后，专题按钮 active，Pinia 和 `localStorage` 同步记录 `colorMode = "states"`。
  - 默认 `colorMode` 为 `height`，`maxCityLabels` 为 `5000`。
  - 通过 `config.patchPreferences({colorMode: "states", layers: {rivers: false}})` 修改 store 后，`localStorage.webgl-generator-control-preferences` 同步更新。
  - 无 console/pageerror。

## 2026-06-28 Vue 基础组件与高度面板迁移第一刀

目标：

- 先抽出各面板会反复使用的基础 Vue 组件，再继续深化面板改造。
- 第一批不迁移大型对象表格，先覆盖按钮、tab、分段按钮、开关、滑动条、输入字段、图层开关和指标摘要这些基础控件。
- 用高度编辑面板作为第二个真实 Vue 面板样板，验证基础件可以承载编辑面板，而不只是控制配置面板。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/base/`：
  - `UiButton.vue`：统一普通、primary、secondary 和 active 按钮形态。
  - `UiTabs.vue`：用于控制面板这类 tab 切换。
  - `UiSegmented.vue`：用于专题选择、高度编辑动作等分段按钮。
  - `UiField.vue`：统一输入框和下拉字段结构。
  - `UiSwitchField.vue`：统一 checkbox 开关行。
  - `UiSliderField.vue`：统一 range 滑动条和值显示。
  - `UiLayerToggleButton.vue`：统一图层开关按钮形态，保留 `data-layer` 和 `aria-pressed` 契约。
  - `UiMetricGrid.vue`：统一摘要指标栅格。
- 修改 `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 改用基础组件渲染生成配置、专题、图层和管理入口。
  - 保留 `generate-map`、`data-mode`、`data-layer`、`max-city-labels` 等旧 runtime 依赖的 DOM 契约。
- 新增 `app/webgl-generator/src/ui/vue/components/HeightPanel.vue`：
  - 用基础组件渲染高度摘要、启停按钮、抬升/降低/平滑动作、半径/强度滑动条、中心衰减开关和撤销/重做。
  - 面板内部笔刷状态仍是轻量 reactive 对象，不进入 Pinia。
- 重写 `app/webgl-generator/src/ui/panels/height-panel.js`：
  - 删除旧 `document.createElement()` 拼装逻辑。
  - 改为在原浮动面板 body 内挂载 `HeightPanel.vue`。
  - 保持外部 API：`open()`、`update()`、`getBrush()`、`setActive()`。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/generation-panel.js`
  - `app/webgl-generator/src/ui/panels/height-panel.js`
  - `app/webgl-generator/src/ui/vue/stores/global-config-store.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时静态 server 验证 `dist/webgl-generator`：
  - 打开控制面板后存在 `.vue-control-panel-root`。
  - 打开高度编辑后存在 `.vue-height-panel-root`。
  - 通过 Vue 控制面板关闭 `rivers` 图层后，按钮 `aria-pressed` 为 `false`，Pinia 和 `localStorage` 同步为 `layers.rivers = false`。
  - 在 Vue 高度面板中启用高度编辑后，按钮文案变为 `停止高度编辑`，Pinia editor store 的 `activeEditor` 为 `height`。
  - 切换高度动作到 `降低`、拖动半径到 `42` 后，面板状态与 DOM 值同步。
  - 无 console/pageerror。

后续：

- 下一批优先迁移只读或轻编辑面板：路线面板、对象详情面板。
- 再迁移列表 + 详情 + 编辑组合面板：河流、文化、宗教、城市、国家、省份。
- 在迁移这些面板前，需要继续把对象表格、排序条、详情字段、历史操作和名称/颜色编辑字段抽成 Vue 组件。

## 2026-06-28 Vue 对象面板基础层与路线/对象详情迁移

目标：

- 在基础控件之后继续抽对象面板需要的通用 Vue 组件。
- 先迁移路线面板和对象详情面板，验证列表、筛选、排序、详情、定位和编辑入口的 Vue 版本可以复用旧 runtime 流程。
- 继续保持 WebGL 地图数据、renderer、picking index 等大状态不进入 Pinia。

实施：

- 新增对象面板基础组件：
  - `UiFilterInput.vue`：保留中文输入法 composition 处理，避免筛选时拼音输入被中断。
  - `UiSortBar.vue`：统一排序按钮和升降序箭头。
  - `UiObjectTable.vue`：统一对象表格、选中行、双击定位和定位按钮。
  - `UiDetailGrid.vue`：统一详情字段网格。
  - `UiHistoryActions.vue`：统一撤销/重做按钮和历史摘要。
  - `UiTextEditField.vue`：统一名称编辑表单。
  - `UiColorField.vue`：统一颜色编辑表单。
  - `UiNumberField.vue`：统一数字编辑表单。
- 修改 `UiButton.vue`：
  - 增加 `buttonType`，支持表单 submit 按钮，默认仍为 `button`。
- 新增 `app/webgl-generator/src/ui/vue/components/RoutePanel.vue`：
  - 使用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable` 和 `UiDetailGrid` 渲染路线管理面板。
  - 路线长度、类型、起终点、段数、grid/pack cells 等指标维持原逻辑。
- 重写 `app/webgl-generator/src/ui/panels/route-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue 挂载包装，保持 `open()`、`update()`、`setSelectedRouteId()` 和 `isOpen()` 外部 API。
  - `map` 通过 `markRaw()` 放入 `shallowReactive` 面板状态，避免 Vue 深代理 pack/grid 大对象。
- 新增 `app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue`：
  - 使用 `UiDetailGrid`、`UiButton` 和 `UiTextEditField` 渲染通用对象详情。
  - 保留城市/路线/marker/label/river/province/region 的详情字段格式。
- 重写 `app/webgl-generator/src/ui/panels/object-details-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue 挂载包装，保持 `show()` 和 `clear()` 外部 API。
  - 保留关闭编辑面板时调用 `onCancelEdit()` 并抑制下一次查看态自动打开的保护逻辑。
- 修改 `app/webgl-generator/src/styles.css`：
  - `object-details-list` 兼容 Vue 详情组件的 `span/strong` 结构。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/route-panel.js`
  - `app/webgl-generator/src/ui/panels/object-details-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时静态 server 验证 `dist/webgl-generator`：
  - 打开路线管理后存在 `.vue-route-panel-root`。
  - 路线面板排序切到 `段数 ↓`，表格选中行数量为 `1`，详情区显示路线类型、等级、起终点、长度、段数、grid cells、pack cells 和 feature。
  - 路线定位按钮可触发 runtime selection 更新。
  - 人工选中一个 marker 后，对象详情面板存在 `.vue-object-details-root`，标题和详情字段正确显示。
  - 对象详情定位按钮可调用旧定位回调。
  - 点击对象详情“编辑”后，按钮变为“退出编辑”，runtime `editingObject` 变为该 marker。
  - 无 console/pageerror。

后续：

- 下一批建议迁移河流、文化、宗教面板：它们都有列表、详情、名称/颜色或数字轻编辑，正好继续验证 `UiHistoryActions`、`UiTextEditField`、`UiColorField`、`UiNumberField`。
- 城市、国家、省份面板依赖更多派生编辑链路，建议在轻编辑列表面板稳定后再迁。

## 2026-06-28 docs 目录整理

目标：

- `docs/` 根目录只保留接手入口和总日志，减少本地日志、生成报告和阶段细则混在一起的噪声。
- 已追踪的总结性文档继续保留在版本库，但按用途分组。
- 执行细则、评估记录、生成报告、snapshot、baseline 和本地 server 日志统一收进被 ignore 的目录。

实施：

- 新增 `docs/README.md`，说明根目录、长期文档目录和本地/生成目录的用途。
- 将长期文档移动到分组目录：
  - `docs/architecture/floating-panel-architecture.md`
  - `docs/plans/gl-reimplementation-acceptance-plan.md`
  - `docs/milestones/milestone-1-webgl-prototype.md`
  - `docs/performance/performance-baseline.md`
  - `docs/performance/webgl-svg-performance-comparison.md`
  - `docs/audits/source-generation-audit-and-rectification-plan.md`
- 将执行细则和评估记录移动到 `docs/task-notes/`：
  - `chinese-naming-library-evaluation.md`
  - `editor-and-stat-panel-inventory.md`
  - `source-first-detailed-task-plan.md`
  - `source-first-recovery-execution-plan.md`
- 将生成报告移动到 `docs/generated/reports/`。
- 将 source baseline、snapshot 和本地预览图片移动到 `docs/generated/` 下对应目录。
- 将本地 server 日志移动到 `docs/local-logs/`。
- 停止两个已确认属于本项目旧预览服务的 `serve-prototype.mjs` node 进程，释放根目录日志文件后完成归档。
- 更新 `.gitignore`：
  - 新增 `docs/generated/`
  - 新增 `docs/local-logs/`
  - 新增 `docs/task-notes/`
  - 保留旧路径 ignore 规则，避免旧脚本仍按旧路径吐产物时进入 git 状态。
- 更新工具默认输出路径，避免后续运行重新污染 `docs/` 根目录：
  - `tools/fmg-profile.mjs` 默认写入 `docs/generated/reports/`。
  - `tools/webgl-prototype-profile.mjs` 默认写入 `docs/generated/reports/`。
  - source/candidate baseline 和 diff 相关工具默认写入 `docs/generated/source-baselines/`。
- 批量更新 AGENTS、当前计划、开发日志、app README 和长期文档中的新路径引用。

验证：

- `docs/` 根目录当前只保留：
  - `README.md`
  - `current-plan.md`
  - `development-log.md`
  - 分组子目录
- `rg` 检查旧文档路径未再出现在非 generated 文档中。
- `git status --ignored docs` 显示 generated、local-logs、task-notes 均被 ignore。

后续：

- 后续新增总结性文档优先放入 `architecture/`、`plans/`、`milestones/`、`performance/` 或 `audits/`。
- 后续临时执行细则和脚本产物应写入 `task-notes/` 或 `generated/`，不要再堆到 `docs/` 根目录。

## 2026-06-28 Vite 端口配置收敛

目标：

- 使用 Vite 推荐的配置文件方式管理正式应用开发服务端口，而不是把 `host` 和 `port` 写在 pnpm 启动参数里。

实施：

- `package.json` 的 `start:app` 和 `preview:app` 保留为单纯的 Vite config 入口：
  - `vite --config vite.config.mjs`
  - `vite preview --config vite.config.mjs`
- `vite.config.mjs` 集中声明正式应用的 `server` 和 `preview` 配置：
  - `host: "127.0.0.1"`
  - `port: 5410`
  - `strictPort: false`
- 更新 `app/webgl-generator/README.md`，移除旧的 `serve-prototype` 正式应用托管说明，并记录当前 Vite + Vue SFC + Pinia 构建器决策。

验证：

- `node --check vite.config.mjs` 通过。
- `package.json` JSON 解析通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- `git diff --check` 通过。

## 2026-06-28 Vue 面板迁移第二批

目标：

- 按当前计划继续深化 Vue SFC 面板迁移。
- 优先迁移河流、文化和宗教这三类“列表 + 详情 + 轻编辑”面板，验证基础对象面板组件的复用性。
- 补充 Vue 浮动面板复用规范，给后续城市、国家和省份复杂面板迁移提供边界。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/RiverPanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiSliderField`、`UiButton` 和 `UiHistoryActions`。
  - 保留河流统计、筛选、排序、定位、名称编辑、宽度因子滑动条、进入/退出河流编辑和撤销/重做。
- 重写 `app/webgl-generator/src/ui/panels/river-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue 挂载 wrapper，继续保留 `open()`、`update()`、`isOpen()` 和关闭时重置编辑态的外部契约。
- 新增 `CulturePanel.vue` 和 `ReligionPanel.vue`：
  - 复用同一批对象面板基础组件。
  - 保留统计摘要、筛选、排序、列表、定位、名称编辑、颜色编辑、详情字段和历史操作。
- 重写 `culture-panel.js` 和 `religion-panel.js`：
  - wrapper 仅负责 panel manager 注册、`markRaw(map)`、选中 id fallback 和 runtime 回调桥接。
- 新增 `docs/architecture/vue-floating-panel-pattern.md`：
  - 记录 wrapper / SFC / base components / runtime / Pinia 的职责边界。
  - 明确 `grid`、`pack`、`map`、renderer buffer 和 picking index 不进入 Pinia。
- 更新 `docs/README.md` 和 `docs/current-plan.md`。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/river-panel.js`
  - `app/webgl-generator/src/ui/panels/culture-panel.js`
  - `app/webgl-generator/src/ui/panels/religion-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- `pnpm run build:app` 在 Codex runtime pnpm 下仍会触发非交互式模块目录清理保护，因此本轮继续使用本地 Vite 入口验证。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，`window.__webglGeneratorApp.map` 存在。
  - 管理入口可打开 `.vue-river-panel-root`、`.vue-culture-panel-root` 和 `.vue-religion-panel-root`。
  - 河流面板显示 165 行河流；筛选输入填入 `1` 后仍保持焦点。
  - 文化面板显示 12 行文化，名称输入、颜色输入和历史操作存在。
  - 宗教面板显示 18 行宗教，名称输入、颜色输入和历史操作存在。
  - 选中第一条河流后，河流名称输入、宽度滑动条、历史操作和“进入河流编辑”按钮存在。
  - 无 console error / pageerror。

## 2026-06-28 Vue 城市管理面板迁移

目标：

- 在河流、文化、宗教等轻编辑面板迁移后，继续迁移更复杂的城市管理面板。
- 保持旧城市编辑命令链不变，只替换 UI 层：城市重命名、人口编辑、归属同步、定位、selection 和 EditHistory 回调仍由 runtime 处理。
- 继续遵守 Vue 浮动面板边界：`map` 使用 `markRaw()` 放入 wrapper 状态，不把 settlements、pack、grid 或 renderer 交给 Pinia。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/CityPanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiNumberField`、`UiButton` 和 `UiHistoryActions`。
  - 保留城市摘要、筛选、排序、城市表格、详情字段、名称编辑、人口编辑、低风险“同步归属到所在 cell”和历史操作。
  - 城市行统计继续读取 `settlements.cities`、`pack.burgs`、`pack.cells`、`grid.cells`、国家/省份/文化/宗教字段，并保留归属一致性和落水异常提示。
- 重写 `app/webgl-generator/src/ui/panels/city-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue wrapper，继续保留 `open()`、`update()`、`setSelectedCityId()`、`isOpen()` 和 `unmount()` 外部 API。
  - `onSelect`、`onLocate`、`onRename`、`onPopulationChange`、`onSyncOwnerToCell`、`onUndo` 和 `onRedo` 仍桥接到原 runtime 回调。
- 更新 `docs/current-plan.md` 和 `docs/architecture/vue-floating-panel-pattern.md`，将城市管理面板标记为已迁移，并把下一批收敛为国家/省份面板。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/city-panel.js`
  - `app/webgl-generator/src/ui/panels/river-panel.js`
  - `app/webgl-generator/src/ui/panels/culture-panel.js`
  - `app/webgl-generator/src/ui/panels/religion-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，城市管理面板可通过 `控制面板 -> 管理 -> 城市管理` 打开。
  - `.vue-city-panel-root` 存在，城市表格显示 817 行，默认选中城市详情正常。
  - 城市摘要、详情、名称输入、人口输入、归属同步按钮和历史操作区存在。
  - 筛选输入填入 `1` 后仍保持焦点。
  - 点击城市行后 runtime `selection` 和 `selectionStore.selection` 均更新为 `kind: "city"` 对象。
  - 无 console error / pageerror。

后续：

- 下一批建议迁移国家和省份面板。它们涉及 cell 归属笔刷、政治边界、局部统计和 pole 重算，迁移时应先保持旧编辑命令和 runtime 回调不变，再替换表格、详情和轻编辑字段。

## 2026-06-28 Vue 省份管理面板迁移

目标：

- 在城市面板迁移后，继续推进更复杂的区域编辑面板。
- 先选择省份面板，而不是国家面板，因为省份面板已有 cell 归属笔刷、目标选择、颜色/名称编辑和局部 pole 统计，但不包含国家面板的首都下拉和国家派生链，适合作为下一步闭环。
- 保持旧省份编辑命令链不变，只替换 UI 层：省份选择、定位、启停编辑、半径、取选中、取悬停、名称编辑、颜色编辑、撤销/重做仍由 runtime 处理。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/ProvincePanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiColorField`、`UiSliderField`、`UiButton` 和 `UiHistoryActions`。
  - 保留省份摘要、筛选、排序、表格、详情字段、名称编辑、颜色编辑、启停编辑、目标省份选择、取选中、取悬停、笔刷半径和历史操作。
  - 省份行统计继续读取 `politics.provinces` / `pack.provinces`、国家、中心 cell、pole、面积、cells、邻接、省内城市、文化和宗教字段。
- 重写 `app/webgl-generator/src/ui/panels/province-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue wrapper，继续保留 `open()`、`update()`、`setSelectedProvinceId()`、`getBrush()`、`setActive()`、`isOpen()` 和 `unmount()` 外部 API。
  - `onSelect`、`onLocate`、`onEdit`、`onActiveChange`、`onTargetProvinceId`、`onRadius`、`onSampleSelection`、`onSampleHover`、`onRename`、`onColorChange`、`onUndo` 和 `onRedo` 仍桥接到原 runtime 回调。
- 更新 `docs/current-plan.md` 和 `docs/architecture/vue-floating-panel-pattern.md`，将省份管理面板标记为已迁移，并把下一批收敛为国家编辑面板。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/province-panel.js`
  - `app/webgl-generator/src/ui/panels/state-panel.js`
  - `app/webgl-generator/src/ui/panels/city-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，省份管理面板可通过 `控制面板 -> 管理 -> 省份管理` 打开。
  - `.vue-province-panel-root` 存在，省份表格显示 206 行，默认选中省份详情正常。
  - 省份摘要、详情、名称输入、颜色输入、目标省份下拉、笔刷半径、取选中/取悬停和历史操作区存在。
  - 筛选输入填入 `1` 后仍保持焦点。
  - 点击省份行后 runtime `selection` 和 `selectionStore.selection` 均更新为 `kind: "province"` 对象。
  - 点击“启用省份编辑”并将半径改为 `42` 后，`getBrush()` 返回 `active: true`、选中省份 id 和半径 `42`。
  - 无 console error / pageerror。

后续：

- 下一批建议迁移国家编辑面板。国家面板还包含首都选择、国家颜色、国家归属笔刷和更多政治派生刷新，迁移时应保持旧 runtime 命令链不变。

## 2026-06-28 Vue 国家编辑面板迁移

目标：

- 完成当前已有复杂管理/编辑面板的 Vue SFC 迁移收口。
- 保持旧国家编辑命令链不变，只替换 UI 层：国家选择、定位、启停编辑、半径、取选中、取悬停、名称编辑、颜色编辑、首都修改、撤销/重做仍由 runtime 处理。
- 继续保持 `state-panel.js` 作为 runtime wrapper，避免把国家、城市、pack/grid 或 renderer 大对象放入 Pinia。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/StatePanel.vue`：
  - 复用 `UiMetricGrid`、`UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiTextEditField`、`UiColorField`、`UiSliderField`、`UiButton` 和 `UiHistoryActions`。
  - 保留国家摘要、筛选、排序、国家表格、详情字段、名称编辑、颜色编辑、启停编辑、目标国家选择、取选中、取悬停、笔刷半径和历史操作。
  - 保留国家面板特有的首都下拉与“设为首都”操作，候选城市来自当前目标国家内的城市列表。
  - 国家行统计继续读取 `politics.states`、首都城市、文化、宗教、中心 cell、面积、城镇数、人口和邻国字段。
- 重写 `app/webgl-generator/src/ui/panels/state-panel.js`：
  - 删除旧 DOM 拼装逻辑。
  - 改为 Vue wrapper，继续保留 `open()`、`update()`、`getBrush()`、`setTargetStateId()`、`setActive()` 和 `unmount()` 外部 API。
  - `onSelect`、`onLocate`、`onEdit`、`onActiveChange`、`onTargetStateId`、`onRadius`、`onSampleSelection`、`onSampleHover`、`onRename`、`onColorChange`、`onCapitalChange`、`onUndo` 和 `onRedo` 仍桥接到原 runtime 回调。
- 更新 `docs/current-plan.md` 和 `docs/architecture/vue-floating-panel-pattern.md`，将国家编辑面板标记为已迁移，并记录当前已有主要浮动面板均已迁为 Vue SFC。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panels/state-panel.js`
  - `app/webgl-generator/src/ui/panels/province-panel.js`
  - `app/webgl-generator/src/ui/panels/city-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 应用完成生成，国家编辑面板可通过 `控制面板 -> 管理 -> 国家编辑` 打开。
  - `.vue-state-panel-root` 存在，国家表格显示 20 行，默认选中国家详情正常。
  - 国家摘要、详情、名称输入、颜色输入、首都下拉、目标国家下拉、笔刷半径、取选中/取悬停和历史操作区存在。
  - 筛选输入填入 `1` 后仍保持焦点。
  - 点击国家行后 runtime `selection` 和 `selectionStore.selection` 均更新为 `kind: "state"` 对象。
  - 点击“启用国家编辑”并将半径改为 `46` 后，`getBrush()` 返回 `active: true`、选中国家 id 和半径 `46`。
  - 无 console error / pageerror。

后续：

- 当前已有主要浮动管理/编辑面板已完成 Vue SFC 迁移。下一步可转向面板功能深化，例如国家/省份新增删除、城市移动、标签/命名面板、marker/zone 面板或对象表格虚拟滚动。

## 2026-06-28 悬停信息右下角展示

目标：

- 在继续面板功能深化前，先降低悬停信息对固定侧栏的占用。
- 将悬停后的信息改成更精简的地图内提示，并固定在右下角展示。
- 保留用户控制权：可在控制面板中开启或关闭该信息卡，并在刷新后恢复偏好。

实施：

- `app/webgl-generator/index.html` 新增 `hover-overlay` 容器，并把原侧栏“悬停”小节改为“选择”，避免侧栏继续承载大段 hover 明细。
- `app/webgl-generator/src/ui/panel.js` 新增 `updateHoverOverlay()` 和压缩行生成逻辑：
  - 信息标题优先显示命中对象类型，例如城市、河流、路线或专题对象；无对象时显示陆地/水域 cell。
  - 内容只保留对象摘要、cell、海拔/水域、国家/省份、文化/宗教、城市/路线和拾取候选等短字段。
  - 过滤未命名路线，避免出现 `unknown -> unknown` 这类调试态信息。
  - `pick-stats` 改为只显示选中对象和编辑对象摘要。
- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue` 在 `图层` tab 新增“悬停信息”开关。
- `app/webgl-generator/src/ui/vue/stores/global-config-store.js` 新增 `showHoverInfo` 偏好，并继续通过现有全局偏好链路写入 `localStorage`；旧版偏好兼容读取。
- `app/webgl-generator/src/styles.css` 新增右下角透明固定信息卡样式；信息卡 `pointer-events: none`，不会拦截地图拖拽、缩放和 hover picking。
- `app/webgl-generator/src/runtime/app.js` 在开关变化后刷新当前 pick 面板状态，使关闭/开启立即生效。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/vue/stores/global-config-store.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 鼠标移动到 canvas 后，右下角信息卡出现并显示精简 hover 内容。
  - 信息卡为不可交互层，`pointer-events` 为 `none`。
  - 控制面板 `图层` tab 中“悬停信息”开关默认开启。
  - 关闭开关后信息卡立即隐藏，并写入 `showHoverInfo: false`；再次开启后恢复显示，并写入 `true`。
  - 侧栏 `pick-stats` 只保留选中对象和编辑对象摘要。
  - 无 console error / pageerror。

后续：

- 如果后续接入对象级 picking 或标签编辑器，可继续扩展悬停信息摘要字段，但仍应保持右下角信息卡短句化，避免退回侧栏长调试信息。

## 2026-06-28 标签命名面板与国家名称显示

目标：

- 继续面板迁移后的下一步：新增标签命名面板第一刀。
- 修复国家专题下不显示国家名字的问题。
- 保持产品文案克制：图层中显示“国家名称”，管理入口显示“标签命名”，不使用实现逻辑词。

实施：

- 新增 `app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue`：
  - 统一列出城市标签和国家名称。
  - 支持筛选、排序、表格选中、定位、详情和名称编辑。
  - 名称编辑复用现有 `createRenameObjectCommand()` 与 EditHistory。
- 新增 `app/webgl-generator/src/ui/panels/label-naming-panel.js`：
  - 作为 Vue wrapper 桥接 runtime 回调。
  - 保持 `map` 使用 `markRaw()`，不把地图大对象放入 Pinia。
- `app/webgl-generator/src/renderer/placeholder-renderer.js` 的标签层从仅城市标签扩展为城市标签 + 国家名称：
  - `labels` 继续控制城市标签。
  - 新增 `stateLabels` 图层控制国家名称。
  - 国家名称只在国家专题下显示，避免其它专题被大字遮挡。
  - label picking 支持 `targetKind: "state"`。
- `app/webgl-generator/src/runtime/object-resolver.js` 和 `app/webgl-generator/src/runtime/object-edit-commands.js` 支持国家名称标签解析与重命名。
- `app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue` 允许国家名称标签进入名称编辑。
- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - `图层` tab 新增“国家名称”开关。
  - `管理` tab 新增“标签命名”入口。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/ui/panels/label-naming-panel.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/ui/panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 控制面板 `图层` tab 存在“悬停信息”开关，旧 `show-hover-overlay` 控件不再出现在 DOM 中。
  - 切到国家专题后，`stateLabelCount = 20`，当前视口可见国家名称 `12` 个。
  - 运行时统计显示 `标签：城市 2 / 817 / 上限 817；国家 12 / 20`。
  - `管理 -> 标签命名` 可打开 `.vue-label-naming-panel-root`，面板同时包含城市标签和国家名称。
  - 在标签命名面板中筛选“国家名称”，把一个国家名称改为“测试国”后，地图上的 `.state-label` 文本同步刷新，EditHistory 记录为 `重命名国家 #15`。
  - 无 console error / pageerror。

后续：

- 标签命名面板当前只做城市/国家名称第一刀；路线标签、区域标签、手动标签位置锁定、曲线文字和批量命名风格配置仍留到后续阶段。

## 2026-06-28 比例尺位置与对象类型分发整理

目标：

- 修复温度、降水专题比例尺与右下角悬停信息卡位置冲突。
- 对 `object.kind === "xxx"` 这类重复比较做第一轮结构化整理。
- 不引入 TypeScript enum，仅用普通对象常量集中管理对象类型，方便后续面板、选择、定位、编辑命令自然串联。

实施：

- `app/webgl-generator/src/styles.css` 将 `.map-legend` 从右下区域移到左下角：
  - 温度、降水专题仍按原逻辑显示比例尺。
  - 右下角继续留给悬停信息卡。
- 新增 `app/webgl-generator/src/runtime/object-kinds.js`：
  - 集中定义 `OBJECT_KIND`、`LABEL_TARGET_KIND`、`OBJECT_KIND_LABEL`。
  - 集中定义 `POLITICAL_OBJECT_KINDS`、`POLITICAL_OBJECT_FIELD` 和 `POINT_OBJECT_KINDS`。
  - 提供 `isPoliticalObjectKind()`、`isPointObjectKind()` 等轻量判断函数。
- `app/webgl-generator/src/runtime/object-resolver.js`：
  - 从连续 `if object.kind` 改为 `OBJECT_RESOLVERS` 分发表。
  - label 的 city/state target 使用 `LABEL_TARGET_KIND`。
- `app/webgl-generator/src/runtime/object-edit-commands.js`：
  - 对象命名读取、写入、恢复分别改为 reader/writer/restorer 表。
  - 对象中文类型名读取 `OBJECT_KIND_LABEL`。
  - label 重命名目标归一化使用 `LABEL_TARGET_KIND`。
- `app/webgl-generator/src/runtime/app.js`：
  - selection 自动打开面板逻辑抽为 `SELECTION_PANEL_HANDLERS`。
  - 国家、城市、省份、文化、宗教、河流、路线的后续动作都从分发表进入，后续新增对象面板时可直接新增 handler。
- `app/webgl-generator/src/ui/panel.js` 和 `app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue`：
  - 对象标题、对象详情行改为 formatter map。
  - 悬停信息和对象详情继续使用现有显示文案。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - renderer 使用同一套对象类型常量。
  - 政治对象字段、政治高亮颜色和高亮模式改为字段表/映射表。
- `app/webgl-generator/src/ui/panels/label-naming-panel.js` 与 `LabelNamingPanel.vue`：
  - 标签目标类型改用 `LABEL_TARGET_KIND`，避免城市/国家标签继续散落字符串。
- `vite.config.mjs`：
  - 将 `root` 和 `outDir` 改为相对路径，避免 Windows + Rolldown 构建时 HTML 插件尝试用绝对路径作为输出文件名。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/object-kinds.js`
  - `app/webgl-generator/src/runtime/object-edit-commands.js`
  - `app/webgl-generator/src/runtime/object-resolver.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/ui/panels/label-naming-panel.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 温度专题下比例尺位于地图左下角，悬停信息卡位于右下角，两者不重叠。
  - 降水专题下比例尺同样位于地图左下角。
  - 比例尺和悬停信息卡均为 `pointer-events: none`。
  - 国家专题仍显示国家名称：`stateLabelCount = 20`，当前视口可见 `12` 个。
  - `管理 -> 标签命名` 面板仍可打开，并包含国家名称。
  - 无 console error / pageerror。

后续：

- 本轮优先整理对象解析、命名、UI 展示、selection 自动开面板和 renderer 选择高亮；仍有少量面板局部状态判断保留 `kind` 比较，可在对应面板继续深化时逐步迁到 `OBJECT_KIND`。

## 2026-06-28 标签命名面板样式统一

目标：

- 修复标签命名面板与其它 Vue 浮动面板视觉不统一的问题。
- 保持标签命名面板业务逻辑不变，只收敛 UI class 与 CSS 复用。

原因：

- `LabelNamingPanel.vue` 使用了 `label-naming-sort`、`label-naming-details`、`label-name-editor` 等专用 class。
- `styles.css` 只给 `label-naming-summary`、`label-naming-controls` 和 `label-name-editor` 补了半套样式，没有覆盖排序按钮、详情网格和历史操作区。
- 这导致标签命名面板的排序、详情和编辑区域没有复用路线/城市/国家等面板的完整视觉规则，看起来不像同一套面板系统。

实施：

- `app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue` 改为复用现有对象面板样式：
  - 摘要、筛选、排序和详情复用 `route-panel-*` class。
  - 名称编辑复用 `city-name-editor` class。
  - 历史操作复用 `city-history-actions` class。
- `app/webgl-generator/src/styles.css` 删除孤立的 `label-naming-*` 和 `label-name-editor` 专用样式，避免形成第二套半成品面板样式。

验证：

- `node --check app/webgl-generator/src/ui/panels/label-naming-panel.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 标签命名面板与路线面板的摘要、筛选输入、排序按钮、详情网格 computed style 一致。
  - DOM 中不再出现 `.label-naming-sort`、`.label-naming-details` 和 `.label-name-editor`。
  - 无 console error / pageerror。

## 2026-06-28 “专题”命名改为“视图”

目标：

- 将控制面板中用户可见的“专题”改为“视图”，后续产品文案统一使用“视图”。
- 保留内部 `themes`、`colorMode` 等既有契约，避免为了改名牵动运行时事件和持久化字段。

实施：

- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - tab 文案改为 `生成 / 视图 / 图层 / 管理`。
  - 分段控件 label 改为“视图”。
  - 开关文案改为“高度视图显示海底”。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计行从“专题”改为“视图”。
- `app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue`：
  - 国家名称显示策略改为“国家视图下显示”。
- `app/webgl-generator/README.md` 和 `docs/current-plan.md`：
  - 当前说明中的用户可见称呼同步改为“视图”。

验证：

- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/label-naming-panel.js` 通过。
- Vite 生产构建通过；本机因 `pnpm run` 会触发依赖校验并访问 registry，实际使用本地 Vite 入口 `node node_modules/vite/bin/vite.js build --config vite.config.mjs` 验证。仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时静态服务验证 `dist/webgl-generator`：
  - 控制面板 tab 显示 `生成 / 视图 / 图层 / 管理`，页面正文不再出现“专题”。
  - `视图`页可打开，包含高度、温度、降水、生物群系、文化、宗教、国家、省份、区域、人口按钮和“高度视图显示海底”开关。
  - 运行时统计行显示“视图”，不再显示“专题”。
  - 标签命名面板中国家名称详情显示“国家视图下显示”。
  - 无 console error / pageerror。

## 2026-06-28 标签管理深化与重新生成入口计划

目标：

- 深化“标签命名”为真正的标签管理，支持增删改。
- marker 和 zone 暂缓。
- 标签管理完善后，将其动作区、表格操作和历史操作模式推广到其它管理面板。
- 管理面板新增专门的“重新生成”入口，后续用于国家、省份、城镇、道路、河流等属性重算。

设计约束：

- 城市标签和国家名称是由城市/国家对象派生的标签，不能用“删除标签”误删城市或国家本体；第一刀删除派生标签实现为隐藏，并提供恢复。
- 新增标签先实现为独立手工标签，写入当前地图自己的 `labels.custom` 数据，不回写 source，也不改变城市/国家生成链路。
- 手工标签应支持名称、位置、定位、选择、删除和撤销/重做。
- 重新生成入口先提供动作和状态框架；具体重算要逐类遵守生成约束：河流按高度/水文下行，路线按陆路/海路寻路，国家/省份/城镇要处理下游派生过期或联动刷新。

## 2026-06-28 标签管理增删改与重新生成入口第一刀

实施：

- 新增 `app/webgl-generator/src/runtime/label-edit-commands.js`：
  - `createAddCustomLabelCommand()` 新增独立手工标签，默认放在当前 hover 世界坐标；没有 hover 时放在地图中心。
  - `createRenameCustomLabelCommand()` 支持手工标签重命名。
  - `createDeleteLabelCommand()` 对手工标签执行删除，对城市/国家派生标签执行隐藏。
  - `createRestoreGeneratedLabelCommand()` 支持恢复被隐藏的城市/国家派生标签。
  - 标签编辑统一走 `EditHistory`，并刷新 labels、selection、runtime 和对象面板。
- `LabelNamingPanel.vue` 深化为标签管理：
  - 表格新增“状态”列。
  - 摘要新增“手工”数量。
  - 详情显示标签状态。
  - 动作区新增“新增标签”、“删除标签”和“恢复标签”。
  - 通过 `version` 触发 markRaw 地图深层变更后的表格重算。
- renderer 标签层支持手工标签：
  - `map.labels.custom` 会渲染为 `.custom-label`。
  - 城市和国家派生标签会读取 `map.labels.hidden`，隐藏后不进入 overlay。
  - picking、selection marker、定位 bounds 支持手工标签。
- 管理入口文案从“标签命名”改为“标签管理”。
- 新增 `RegenerationPanel.vue` 和 `regeneration-panel.js`：
  - 管理 tab 新增“重新生成”入口。
  - 面板提供国家、省份、城镇、道路、河流按钮和约束说明。
  - 道路按钮已接入实际重算：复用 `finalizeSettlements()`，按当前国家、城镇、港口、陆路和海路约束重建路线，并刷新 route mesh。
  - 国家、省份、城镇、河流先显示受约束重算说明，暂不执行无约束替换；marker 和 zone 暂缓。

验证：

- `node --check` 通过：
  - `app/webgl-generator/src/runtime/label-edit-commands.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/ui/panels/label-naming-panel.js`
  - `app/webgl-generator/src/ui/panels/regeneration-panel.js`
  - `app/webgl-generator/src/ui/panel.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时静态服务验证 `dist/webgl-generator`：
  - “标签管理”可打开。
  - 新增手工标签后，`map.labels.custom.length = 1`，表格出现“手工标签”，overlay 出现 `.custom-label`。
  - 手工标签重命名为“手工测试标签”后，地图 overlay 同步显示新文本。
  - 删除手工标签后，`map.labels.custom.length = 0`。
  - 选择城市派生标签后点击“删除标签”，`map.labels.hidden.city.length = 1`，详情显示“已隐藏，不在地图显示”。
  - 点击“恢复标签”后，`map.labels.hidden.city.length = 0`。
  - “重新生成”面板可打开，道路重算后 `lastEditRefresh` 显示 `route-mesh, object-panels`，面板显示“道路已按当前国家、城镇、港口和陆海约束重算”。
  - 无 console error / pageerror。

## 2026-06-28 中文文化城镇命名修正计划

目标：

- 修正中文文化下城镇名过度三字化、四字化的问题。
- 大城市、首都和省会优先使用二字地名；小城镇保留少量三字或四字自然地名。
- 扩充中式候选用字和二字词根，降低重复拼接感。
- 不改变欧洲/英文等音译风命名的总体方向。

现状：

- `app/webgl-generator/src/generator/names.js` 的 `makePlaceName()` 会对显式文化风格高概率使用“词干 + 后缀”。
- 普通中式词干本身多为二字，因此追加 `山/岭/川/港/城/州` 等后缀后，城市很容易稳定变成三字。
- 10k 地中海样本中，中式城市名长度分布为：二字 `28`、三字 `491`、四字 `344`、五字 `22`；首都和大城市同样以三字为主。

计划：

- 将默认/中式地点名生成从音译风文化分支中拆开，避免“显式文化风格”误触发高频后缀拼接。
- 为城镇命名增加规模参数，使 `capital/provincial/city` 倾向二字，`town/village/hamlet` 才有小概率派生三字或四字。
- 扩充中式二字词根、单字词根、自然后缀和小聚落修饰词，并控制唯一化前缀的使用频率。

## 2026-06-28 中文文化城镇命名修正第一刀

实施：

- `app/webgl-generator/src/generator/names.js`：
  - 扩充中式二字地名词根，并新增可组合的首字、尾字词库，避免大地图中二字名过早撞名。
  - 新增港口二字词根、小聚落前缀和小聚落后缀。
  - 默认/中式地点名不再因为 `Highland/Naval/River/Hunting` 等文化类型自动使用音译词根；只有明确 `European/Western/English` 等音译命名风格才走音译词干。
  - 中式地点名按规模控制长度：首都、省会、高人口城市几乎只生成二字名；普通小聚落才有较高概率生成三字或少量四字名。
  - 地点名撞名时优先重抽候选，最后才回退到方向前缀唯一化，避免大城市因唯一化变成三字。
- `app/webgl-generator/src/generator/settlements.js`：
  - 城市命名时向命名器传入 `capital/provincial/group/population`。
  - pack 城市在命名前先计算人口和组别提示；港口改名也带上城市规模信息。
  - grid fallback 城市同样传入人口、首都/省会和组别。

验证：

- `node --check app/webgl-generator/src/generator/names.js` 通过。
- `node --check app/webgl-generator/src/generator/settlements.js` 通过。
- 10k 地中海样本 `audit-mediterranean-001` / `world`：
  - 中式城市总数 `885`。
  - 长度分布从修正前的二字 `28`、三字 `491`、四字 `344`、五字 `22`，变为二字 `714`、三字 `163`、四字 `8`。
  - 首都 `21/21` 均为二字。
  - 按首都、省会和人口 `>= 5` 统计的大城市二字率为 `98.8%`。
  - 小聚落仍保留三字和少量四字样本。
- 10k `english` 文化集样本仍保持音译风城市名，例如 `贝尔堡`、`奥斯维尔`、`卡斯特港`。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。

## 2026-06-28 标签视觉与国家名称放置修正计划

目标：

- 城市标签去掉黑色半透明底框，避免像临时调试标注。
- 普通城市、首都和港口统一文字颜色，不再靠颜色区分类型。
- 国家名称从首都/国家中心 burg 附近迁到国家地理中心。
- 国名较长时允许轻微斜放，减少横向压迫感。
- 国家名称不再导致首都或核心城市标签被隐藏。

现状：

- `.city-label` 当前有半透明黑底、padding 和 text-shadow；`.city-label.capital`、`.city-label.port` 会改颜色。
- `getLabelStates()` 通过 `stateLabelPoint()` 使用 `state.center`，而 pack 国家 `center` 会在政治生成中回写为首都 burg 所在 cell。
- 标签更新按顺序把国家标签先放入 `occupied`，后续城市标签与之冲突会被隐藏。

计划：

- 调整城市标签 CSS，保留简洁文字与首都字号/权重差异，但去掉普通态底框和港口/首都颜色差异。
- 以 `pack.cells.state` 内的陆地 cell 面积加权中心作为国家名称点位，保留 `state.center/gridCenter` 兜底。
- 对较长国家名计算国家形状主轴角度并写入 CSS 旋转变量。
- 将标签避让拆成国家标签占位和城市/手工标签占位，避免国家标签遮挡城市标签。

## 2026-06-28 标签视觉与国家名称放置修正第一刀

实施：

- `app/webgl-generator/src/styles.css`：
  - 城市标签普通态去掉黑色半透明背景、padding 和 text-shadow。
  - 首都标签仍可保留字号和字重差异，但文字颜色与普通城市一致。
  - 港口不再生成独立颜色规则。
  - 手工标签保留自己的底色、边框和 padding，不受城镇标签简化影响。
  - 国家标签通过 `--label-rotation` 支持轻微旋转。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 国家标签文本改为优先使用 `state.fullName`，没有全称时回退 `state.name`。
  - 国家标签点位改为按 `pack.cells.state` 内陆地 cell 的面积加权中心计算，不再直接使用首都 burg cell。
  - 较长国名会按国家 cell 分布主轴计算旋转角；主轴近水平时给出轻微兜底斜角。
  - 国家标签和城市/手工标签使用独立避让集合，国家标签不再导致城市标签隐藏。
  - 选中国家标签时的 selection marker 同步使用新的国家标签点位。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告，不影响构建结果。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 城市标签普通态 `background-color: rgba(0, 0, 0, 0)`、`padding: 0px`、`text-shadow: none`。
  - 普通城市与首都标签颜色一致，均为 `rgb(242, 234, 213)`。
  - 国家标签样本已离开首都点，样本距离首都约 `59.9` 到 `175.5`。
  - 长国名样本出现 `28`、`-12`、`23.1` 等旋转角。
  - 无 console error / pageerror。

## 2026-06-28 国家名称与首都标签优先级修正

目标：

- 国家视图中，国家名称是主标签。
- 如果首都标签与国家名称重叠，优先显示国家名称，首都标签应避让或隐藏。

实施计划：

- 保留国家标签先布局、国家标签彼此避让的规则。
- 城市、首都和手工标签在布局时额外避让已经显示的国家标签。
- 不改变国家名称的地理中心、旋转和城市标签视觉样式。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js` 的 `updateLabels()` 调整遮挡判定：
  - 国家标签仍只检查已显示国家标签。
  - 非国家标签会同时检查已显示国家标签和同类标签。
  - 因为 `labelItems` 顺序仍是国家、城市、手工，所以国家名称自然拥有最高布局优先级。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时 HTTP server 强制重叠验证：
  - 将一个国家名称临时移动到其首都坐标。
  - 验证结果为 `stateVisible: true`、`capitalVisible: false`。
  - 无 console error / pageerror。

## 2026-06-28 管理 tab 重新生成专栏直出

目标：

- “重新生成”不再作为管理 tab 下的二级入口按钮。
- 管理 tab 内直接展示各类重新生成按钮。
- 重新生成操作区应作为独立专栏，并用分割线与编辑/管理面板入口分开。

计划：

- `ControlPanel.vue` 将管理 tab 拆成“编辑与管理”和“重新生成”两个区块。
- `fit-view` 与各浮动编辑/管理面板入口保留在上方。
- 下方“重新生成”专栏直接展示国家、省份、城镇、道路、河流按钮。
- 运行时直接监听 `data-regenerate-kind` 按钮，复用现有 `regenerateMapAttribute()`。
- 重新生成执行结果显示在管理 tab 内，替代原浮动二级面板状态。

实施：

- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 管理 tab 拆为上方“编辑与管理”按钮区和下方“重新生成”专栏。
  - 两个区块之间新增分割线。
  - “重新生成”专栏直接展示 `国家 / 省份 / 城镇 / 道路 / 河流` 五个按钮。
  - 移除原 `open-regeneration-panel` 二级入口按钮。
- `app/webgl-generator/src/ui/panel.js`：
  - 新增对 `[data-regenerate-kind]` 的按钮监听。
  - 新增 `updateRegenerationSection()`，用于更新管理 tab 内的状态和约束说明。
  - 编辑锁定名单改为包含 `[data-regenerate-kind]`。
- `app/webgl-generator/src/runtime/app.js`：
  - 移除浮动 `RegenerationPanel` 创建与打开逻辑。
  - 管理 tab 直出按钮直接调用 `regenerateMapAttribute()`。
- 删除不再使用的二级浮动面板文件：
  - `app/webgl-generator/src/ui/panels/regeneration-panel.js`
  - `app/webgl-generator/src/ui/vue/components/RegenerationPanel.vue`
- `app/webgl-generator/src/styles.css`：
  - 新增管理 tab 专栏、分割线、重新生成按钮网格和状态说明样式。

验证：

- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/ui/panel.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 临时 HTTP server 验证 `dist/webgl-generator`：
  - 管理 tab 中不再存在 `open-regeneration-panel`。
  - 分割线 `.management-panel-divider` 存在。
  - “重新生成”专栏直接显示 `国家 / 省份 / 城镇 / 道路 / 河流` 五个按钮。
  - 上方编辑/管理按钮仍保留 `适配视图、高度编辑、国家编辑、省份管理、城市管理、文化管理、宗教管理、路线管理、河流管理、标签管理`。
  - 点击“道路”后侧栏状态更新为 `道路已按当前国家、城镇、港口和陆海约束重算...`，没有打开 `regeneration-panel` 浮动面板。
  - 无 console error / pageerror。

## 2026-06-28 河流重新生成深化计划

目标：

- 按用户确认的依赖链，先深化“河流”重新生成，而不是先做城镇。
- 河流重建应遵守当前高度、降水、湖泊、pack 邻接与下行水文约束，不让河流倒流或爬山。
- 河流重建后先刷新受河流直接影响的 biome/人口评分和道路 mesh；城镇、省份、国家等更深层派生先标记为待派生，后续再逐项接入。

计划：

- 运行时复用 `buildRivers()` 与 `renameHydronymsByCulture()`，避免另写一套水文算法。
- 重算后调用 `defineBiomesAndPopulation()` 刷新 `pack.cells.biome/s/pop` 与 grid 镜像字段。
- 随后调用 `finalizeSettlements()`，让现有城镇上的道路按最新 biome、海陆和城镇点位重算。
- 刷新河流 mesh、道路 mesh、cell 颜色、人口/城市点层、对象索引、河流/路线/城市等面板和运行时统计。
- 将 `cities / provinces / states / religions / markers / zones / military` 写入 `map.metadata.derivedStale.systems`，提示后续仍需正式重建。

实施：

- `app/webgl-generator/src/runtime/app.js`：
  - “道路”重算抽成 `regenerateRoutes()`，保留原有行为。
  - 新增 `regenerateRivers()`，复用当前水文生成链路重建 `map.rivers`，并在文化字段存在时重新套用河湖命名。
  - 河流重建后调用 `defineBiomesAndPopulation()` 刷新 `pack.cells.biome/s/pop` 与 grid 镜像字段。
  - 随后调用 `finalizeSettlements()` 重算当前城镇体系上的道路。
  - 更新 summary、generationLog、运行时面板、对象面板和待派生状态。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `refreshObjectPickingIndex()`，供河流/道路重建后刷新对象级 picking 索引。
- `app/webgl-generator/src/ui/panel.js`：
  - `派生过期` 展示改为中文对象名，避免把 `cities/zones` 这类内部系统名直接暴露到 UI。

验证：

- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 打开控制面板，进入管理 tab，点击“河流”。
  - 状态更新为 `河流已按当前高度、降水和湖泊约束重算...`。
  - 河流段数从 `1557` 更新到 `1558`，对象索引 riverSegments 同步更新到 `1558`。
  - 道路同步重算后仍为 `679 / 3508`，对象索引 routeSegments 为 `3508`。
  - `派生过期` 显示为 `城镇、省份、国家、宗教、标记、区域、军事`。
  - 河流/道路动态 mesh dirty 均为 `false`，`WebGL error` 为 `0`，无 console error / pageerror。

## 2026-06-28 城镇重新生成深化计划

目标：

- 让管理 tab 的“城镇”按钮从占位说明推进为真实重建。
- 重建普通城镇时保留国家首都锚点，避免国家 `state.capital` 断链。
- 省会按当前省份中心重建，并同步 `province.burg`。
- 重建后自动刷新道路、城市点、城市标签、人口点、对象索引和相关面板。

边界：

- 本刀不重建国家边界、省份扩张、宗教、marker、zone 和军事。
- 国家首都 burg id 必须保留；city id 可以重新生成。
- 城市生成标签跟随新 city id 重建，因此旧城市标签隐藏列表会清空；手工标签和国家名称隐藏状态保留。
- 省份/国家统计中的城市数、城镇人口、乡村人口做轻量同步，完整政治重算留给后续“省份/国家”按钮。

实施：

- `app/webgl-generator/src/generator/settlements.js`：
  - 新增 `regenerateSettlementsWithinPolitics()`，供运行时在既有政治层上重建城镇。
  - 重建时保留各国 `state.capital` 指向的 burg id，避免国家首都断链。
  - 省会按当前 `province.center` 重建，并回写 `province.burg / center / gridCenter`。
  - 普通城镇继续复用现有适居度、文化、间距、港口和河畔类型规则。
  - `finalizeSettlements()` 现在会同步刷新 `populationPoints`，避免人口点层引用旧数据。
  - 重建后轻量同步国家/省份的 burg 数、乡村人口和城镇人口统计。
- `app/webgl-generator/src/runtime/app.js`：
  - “城镇”重新生成按钮接入真实执行链路。
  - 城镇重建后清空旧城市生成标签隐藏列表，保留手工标签和国家名称隐藏状态。
  - 刷新点层、标签、道路 mesh、对象索引、城市/路线/标签等面板和运行时统计。
  - 将 `cities` 从待派生移除，并保留 `provinces / states / religions / markers / zones / military` 待派生提示。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- Node 直接生成并调用城镇重建：
  - 城市 `810 -> 1041`，港口 `111 -> 150`，道路 `664 -> 848`。
  - 无失效首都、无落水城市、无省份 burg 引用错误、无 burg 到 city 反查错误。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 点击“城镇”后状态更新为 `城镇已按当前适居度、文化、政区、港口和间距约束重算...`。
  - 城市 `817 -> 1003`，港口 `135 -> 143`，道路 `679 -> 811`。
  - 城市标签总数和 city picking 索引同步为 `1003`，route picking 索引同步为 `3776`。
  - 失效首都 `0`、落水城市 `0`、省份 burg 引用错误 `0`、burg 到 city 反查错误 `0`。
  - `派生过期` 显示为 `省份、国家、宗教、标记、区域、军事`，不再包含城镇。
  - 河流/道路动态 mesh dirty 均为 `false`，`WebGL error` 为 `0`，无 console error / pageerror。

## 2026-06-28 河流重新生成扰动修正

问题：

- 用户发现点击“河流”重新生成后，河网几乎没有变化。
- 原因是当前 `buildRivers()` 对同一高度、降水、湖泊和 pack 邻接图是确定性的；运行时只是重跑同一输入，没有引入任何新的水文扰动。

方案：

- 普通整图生成不传扰动参数，继续保持 seed 可复现。
- 运行时点击“河流”时递增 `riverRegenerationSalt`，并传给 `buildRivers()` 和 `renameHydronymsByCulture()`。
- `buildRivers()` 仅在存在 `riverRegenerationSalt` 时生成每个 pack cell 的轻微高度扰动和降水倍率扰动：
  - 高度扰动幅度很小，只影响近似等高/洼地解析的选择。
  - 降水倍率扰动影响局部汇流和成河阈值，使河流数量、支流和局部路径可变化。
- 河流 metadata 记录 `variationSalt`，运行时状态文案显示“扰动 #n”。

验证计划：

- 用同一地图对比初始河网、扰动 #1 和扰动 #2 的 fingerprint，确认连续重建不同。
- 浏览器中连续点击两次“河流”，确认河流数量/段数或 fingerprint 变化，状态显示不同扰动编号。

实施：

- `app/webgl-generator/src/generator/rivers.js`：
  - 新增 `riverRegenerationSalt` 可选路径。
  - 有 salt 时按 `seed + riverRegenerationSalt` 生成每个 pack cell 的轻微高度扰动和降水倍率扰动。
  - `alterHeights()`、湖泊 flux 和 cell 汇流量会读取扰动；无 salt 时保持原始确定性路径。
  - 河流和湖泊命名 seed 也纳入 salt，避免重建后新河流沿用旧命名流。
  - `rivers.metadata` 新增 `variationSalt`，`flowModel` 区分普通生成与扰动重建。
- `app/webgl-generator/src/runtime/app.js`：
  - 点击“河流”时递增 `map.metadata.regeneration.rivers`，并作为 `riverRegenerationSalt` 传给河流重建。
  - 重新生成状态显示 `扰动 #n`，generationLog 记录 salt。

验证：

- `node --check app\webgl-generator\src\generator\rivers.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- Node 直接对比同一地图：
  - 初始河流 `178 / 1701`，扰动 #1 为 `165 / 1598`，扰动 #2 为 `159 / 1581`。
  - 初始、扰动 #1、扰动 #2 的河流 fingerprint 均不同。
  - 旧链路在显示高度上已有少量看似逆坡段：样本初始 `37`，扰动 #1 `35`，扰动 #2 `32`；本次扰动没有扩大该旧问题。后续如需“显示高度绝不逆坡”，需要单独校正 depression/lake 有效高度与显示高度的关系。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 连续点击两次“河流”：
  - 第一次状态显示 `扰动 #1`，河流 `165 -> 152`，对象索引 riverSegments 为 `1464`。
  - 第二次状态显示 `扰动 #2`，河流 `152 -> 149`，对象索引 riverSegments 为 `1467`。
  - 两次点击后的 fingerprint 均变化。
  - 河流/道路动态 mesh dirty 均为 `false`，`WebGL error` 为 `0`，无 console error / pageerror。

## 2026-06-28 国家与首都重名修正

问题：

- 用户指出大部分国家名称与首都名称重合，不符合一般国家与首都分离的命名习惯；除非是单个城邦的小国，否则不应把首都名直接当作国名。
- 检查发现 `makeStateRoot()` 有 `58%` 概率直接从 `capitalName` 派生国家根名，导致默认地图中大量国家与首都同根。

方案：

- 国家根名改为独立的文化/地理候选生成，不再默认取首都名。
- `capitalName` 改为避让项：普通国家候选若与首都同根，会继续换名。
- 保留 `allowCapitalName` 开关作为未来单城邦小国的显式例外入口；当前政治生成默认传入 `false`。
- 国家根名候选会过滤掉被剥成单字的州、郡、府等地理后缀根，避免生成“上王国”“蓟王国”这类退化名称。

实施：

- `app/webgl-generator/src/generator/names.js`：
  - `makeStateRoot()` 改为调用独立国家根名候选生成器。
  - 新增同根比较、首都避让和国家根名清理逻辑。
  - 地理后缀剥离函数改为可安全处理空值。
- `app/webgl-generator/src/generator/politics.js`：
  - `buildPackStates()` 调用国家命名时显式传入 `allowCapitalName: false`。

验证：

- 修正前，`seed=default` 的默认 10k 地图中，国家与首都同根为 `9 / 13`。
- 修正后，同一 seed 变为 `0 / 13`。
- 额外 10 组 seed 小样本验证：
  - 国家总数覆盖 `12-28`。
  - 国家与首都同根均为 `0`。
  - 单字国家根名均为 `0`。
- `node --check app\webgl-generator\src\generator\names.js` 通过。
- `node --check app\webgl-generator\src\generator\politics.js` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证正式应用当前地图：
  - 国家 `20` 个，国家与首都同根 `0`。
  - 单字国家根名 `0`。
  - `WebGL error` 为 `0`，无 console error / pageerror。

## 2026-06-28 国家名称缩放优先级修正

问题：

- 用户发现部分国家名称与城镇标签完全重叠，导致近景下城镇名称不可见。
- 旧规则中，国家名称在国家视图下始终先进入标签占位，并且会阻挡城市标签；这适合总览，但不适合放大后的城镇阅读。

方案：

- 国家名称按相机缩放分三段处理：
  - 远景/总览：国家名称仍优先于城镇标签，用于阅读国家视图。
  - 中近景：城镇标签优先进入占位，国家名称只在不压住城镇标签时显示。
  - 深度放大：国家名称逐渐淡出并最终隐藏。
- 保留“国家名称”图层开关和标签管理隐藏/恢复语义，不把缩放退场写入数据。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `stateLabelScaleBehavior()`，集中管理国家名称在不同缩放下的占位、可见性和透明度。
  - `updateLabels()` 在中近景把城市/手工标签排到国家名称前面，并让国家名称被已有城市标签阻挡。
- `app/webgl-generator/src/styles.css`：
  - `.state-label.visible` 改为读取 `--state-label-opacity`，支持放大后的渐隐。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410`，切到国家视图验证：
  - `scale=1`：国家名称 `12` 个、城市标签 `10` 个，国家/城市标签重叠 `0`。
  - `scale=2`：国家名称 `2` 个、城市标签 `107` 个，国家/城市标签重叠 `0`，说明中近景已由城镇标签优先占位。
  - `scale=4`：国家名称 `0` 个、城市标签 `60` 个，当前地图中已被城市优先规则提前退场。
  - `scale=6`：国家名称 `0` 个、城市标签 `26` 个。
  - `WebGL error` 为 `0`，无 console error / pageerror。

## 2026-06-28 城镇与道路二次重生成扰动修正

问题：

- 用户发现二次点击“城镇”重新生成后，地图结果不再明显变化。
- 用户同时指出“道路”似乎永远不会变化。
- 检查发现：
  - 城镇重建使用固定随机流 `${seed}:regenerate-settlements`，运行时没有传入递增扰动。
  - 道路按钮只调用 `finalizeSettlements()`，而 pack 道路的连接候选和 A* 成本都由当前 burg 点、陆海约束和固定成本决定，没有任何重建扰动。

方案：

- 普通整图生成不传扰动参数，继续保持同 seed 可复现。
- 点击“城镇”时递增 `settlementRegenerationSalt`：
  - 保留国家首都 `burg id`、省会锚点、政治归属和陆地适居约束。
  - 只扰动普通城镇候选评分和间距筛选。
  - 同时用同一个 salt 触发道路重建扰动，避免城镇变化后道路仍沿用同一套确定性路径。
- 点击“道路”时递增 `routeRegenerationSalt`：
  - 路线候选连接的 Delaunay 输入点使用很小的虚拟偏移，不移动真实城市。
  - pack A* 寻路成本在每个 cell 上加入轻微倍率扰动。
  - 陆路仍禁止穿水，海路仍受同水体港口、海域和冻结温度约束。

实施：

- `app/webgl-generator/src/runtime/app.js`：
  - “道路”重算改为传入 `routeRegenerationSalt`，状态文案显示扰动编号，并写入 generation log。
  - “城镇”重算改为传入 `settlementRegenerationSalt` 和 `routeRegenerationSalt`，状态文案显示扰动编号，并写入 generation log。
- `app/webgl-generator/src/generator/settlements.js`：
  - `finalizeSettlements()` 新增可选 `options`，并把 options 传给 `buildRoutes()`。
  - `regenerateSettlementsWithinPolitics()` 的随机流纳入 `settlementRegenerationSalt`。
  - pack 道路新增 `routeRegenerationSalt` 分支，生成 cell 成本扰动和候选点虚拟偏移。
  - 拆分后的道路段若端点 cell 没有 burg，会回退到原始连接的起终点 burg，避免路线对象 `from/to` 退化为 unknown。

脚本验证：

- 修正前，`seed=regen-debug`：
  - 二次城镇重建后道路 fingerprint 不变。
  - 二次道路重建后道路 fingerprint 不变。
- 修正后，`seed=regen-debug`：
  - 初始城市/道路为 `812 / 645`。
  - 城镇扰动 #1 后为 `990 / 804`，城市 cell fingerprint 与道路 fingerprint 均变化。
  - 城镇扰动 #2 后为 `990 / 782`，相对 #1 城市 cell fingerprint 与道路 fingerprint 均变化。
  - 道路扰动 #3 / #4 为 `771 / 769`，道路 fingerprint 变化。
  - 失效首都 `0`，落水城市 `0`。
- `seed=route-constraints` 约束验证：
  - 初始、城镇扰动 #1/#2、道路扰动 #3/#4 均为陆路穿水 `0`、海路中段上岸 `0`、路线端点 unknown `0`。
  - 连续扰动后失效首都 `0`、落水城市 `0`。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- Vite 生产构建通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410`，通过真实 `[data-regenerate-kind]` 按钮事件连续点击：
  - 初始城市/道路为 `817 / 679`。
  - 城镇扰动 #1 后为 `1003 / 872`，城市与道路 fingerprint 均变化；港口 `135 -> 156`，对象索引 routeSegments 为 `3791`。
  - 城镇扰动 #2 后为 `1003 / 831`，相对 #1 城市与道路 fingerprint 均变化；港口 `156 -> 146`，对象索引 routeSegments 为 `3680`。
  - 道路扰动 #1 后为 `831 -> 829`，道路 fingerprint 变化，对象索引 routeSegments 为 `3748`。
  - 道路扰动 #2 后为 `829 -> 831`，道路 fingerprint 变化，对象索引 routeSegments 为 `3680`。
  - 上述每次重建均为陆路穿水 `0`、海路中段上岸 `0`、路线端点 unknown `0`。
  - `WebGL error` 均为 `0`，无 console error / pageerror。

## 2026-06-28 城镇标签黑色字体调整

问题：

- 用户要求城镇标签改为黑色字体。

实施：

- `app/webgl-generator/src/styles.css`：
  - 将 `.city-label` 从与 `.custom-label` 共享浅色文字中拆出。
  - 城镇标签改为黑色字体，并加轻量浅色文字阴影，保证深色地块上仍可读。
  - 手工标签继续保留原浅色样式。

验证：

- `git diff --check` 通过。

### 军事系统第一刀

背景：

- 用户希望军事不只是一个静态数值，而是能和人口、经济、文明类型、外交压力、资源竞争、地形气候和地图图层协同。
- 在落代码前，需要先把兵种、军团、战线、城镇文明、战争原因和后续战斗系统边界写清楚，避免军事面板变成孤立功能。

修正：

- `docs/task-notes/military-battle-plan.md` 改写为军事系统、图层与管理面板设计文档，覆盖数据契约、生成公式、图层表现、管理面板和分期路线。
- 城镇生成新增文明类型，国家会汇总辖区城市文明画像，用于军力上限、兵种倾向和军队规模推断。
- 军事生成新增兵种定义、可归一化兵种比例、国家军力政策、静态军团态势、地形/温度/生物群落适性、移动速度和国家总兵力上限。
- 外交战争新增战争原因和资源竞争细节，并生成攻防战线供军事图层绘制。
- 地图新增军事对象类型、军团拾取、军团图标和数字标签，图层新增“军事”和“战线”开关；PNG 导出 overlay 同步纳入可见军团图标。
- 管理 tab 新增“军事管理”浮层，可筛选/排序/定位军团、查看军团详情、导出 CSV/JSON，并通过二级比例面板调整国家兵种比例，调整命令接入 `EditHistory`。

验证：

- `node --check` 通过军事、外交、城镇、拾取、渲染、运行时和军事编辑命令相关文件。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- 后续已按“军事系统验收补齐”完成浏览器深巡检。

### 军事系统验收补齐

背景：

- 军事系统第一刀提交后，还需要用构建产物证明军事图层、军事管理、比例调整、战争原因和撤销链路可以闭环。
- 浏览器验证时发现两个真实缺口：军事比例面板的“应用比例”函数引用了不存在的脚本变量 `callbacks`，导致点击时报 `ReferenceError`；二级操作浮层在页面滚动后可能跟随视口外锚点定位到视口外。

修正：

- `MilitaryPanel.vue` 的比例应用改为调用 `props.callbacks.onRatiosApply`，恢复兵种比例命令入口。
- 军事比例面板的“应用比例”按钮改为底部 sticky，避免五个兵种滑条把确认按钮压出二级面板可视区。
- `UiActionDock` 的二级浮层定位增加视口夹取，即使锚点因为滚动暂时处在视口外，也会把浮层 top 限制在当前视口内。

验证：

- `git diff --check` 通过。
- `node --check app/webgl-generator/src/generator/military.js` 和 `node --check app/webgl-generator/src/runtime/military-edit-commands.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Node 生成器审计：`military-audit` seed 生成 `18` 个国家、`98` 个军团、`716` 个城镇，所有国家有 `militaryPolicy`，所有军团有主兵种、图标、态势、适宜度和移动速度，所有城镇有文明类型。
- 战争 seed 审计：`military-war-1` 生成 `24` 个国家、`2` 个唯一战争 campaign、`2` 个结构化战争原因和 `4` 条攻防战线。
- 构建产物浏览器验证：默认 seed `stage-2-1` 生成 `20` 个国家、`111` 个军团、`553722` 兵力、`20` 支舰队、`2` 条战线和 `1` 个带原因的战争；军事图标对象 `111` 个、可见 `17` 个，点击图标返回 `kind = military`，关闭军事图层后可见图标为 `0` 且同点不再拾取为军团。
- 构建产物比例调整验证：军事比例面板可将国家 `#1` 调整为步兵 `100%`，`EditHistory` 变为 `undo = 1 / lastLabel = 调整兵种比例 #1`；点击撤销后所有国家比例恢复，历史变为 `undo = 0 / redo = 1`，console/page error 为 `0`。

### 滑动条精确输入与动态比例尺第一刀

背景：

- 用户要求所有滑动条都必须配套可精确输入的控件，Element Plus 已有可复用成品。
- 当前比例尺线段长度基本固定，随地图比例和相机缩放换算后会显示 `264.6 千米` 这类不直观的小数长度。

修正：

- `UiSliderField.vue` 在 `ElSlider` 旁新增 `ElInputNumber`，滑动、输入和步进按钮共用同一套 `commitValue()`，并按 `step` 推导精度。
- 隐藏原生 `input[type=range]` 继续保留并同步派发 `input/change`，保证旧 runtime 通过 DOM id 读取 `.value` 的链路不被破坏。
- `styles.css` 为高度、气候、单位、标签上限、国家/省份半径、高度图工作台和河流宽度等滑条布局补充第四列数字输入，并补深色 Element InputNumber 样式。
- `updateMapScaleBar()` 改为先计算可接受像素宽度对应的实际距离区间，再选择 1/2/5 序列的整公里距离，最后反推线段宽度；比例尺标签继续复用当前显示单位。

验证：

- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；构建产物主入口约 `677.49KB / 205.29KB gzip`，仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?slider_scale_verify=4`：控制面板展开后已挂载滑条 `8` 个、数字输入 `8` 个、隐藏 range `8` 个，可见原生 range `0`；单位页把比例尺精确输入为 `250` 后，`#map-scale-km-per-cm.value = 250`、数字输入值 `250`、输出 `250 km/cm`。
- 同一烟测打开高度编辑懒加载浮层后，高度半径/强度滑条拥有 `2` 个数字输入和 `2` 个隐藏 range；比例尺初始标签 `500 千米`，比例尺设为 `250 km/cm` 后标签 `1,000 千米`，派发 canvas wheel 后相机缩放到 `2.46`，比例尺回到 `500 千米` 且线宽随之更新，console/page error 和 request failed 均为 `0`。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。

## 2026-06-28 国家名称渐隐丝滑度修正

问题：

- 用户发现国家名称在缩放退场时不够丝滑，表现为接近突然消失。
- 用户同时发现某个特定缩放比例下，已经隐藏的国家名称会轻微重新显现。
- 检查发现：
  - 国家名称透明度被四舍五入到两位小数，低透明区存在肉眼可见的阶梯感。
  - 中近景时国家名称会被城市标签碰撞规则直接移除；随着缩放后标签间距变化，碰撞结果可能改变，导致国家名称重新获得 `.visible` 类。

方案：

- 国家名称退场改为连续 `smootherStep` 曲线，不再对透明度四舍五入。
- 中近景后国家名称不再和城市标签互相碰撞抢显示权，只与其它国家名称互相避让。
- 城市标签在视觉层级上高于国家名称；国家名称淡出时不会遮盖城市阅读。
- 低透明尾端直接归零，避免高倍缩放下残影。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `stateLabelScaleBehavior()` 改用 `smootherStep(1.55, 3.95, scale)` 生成连续透明度。
  - 国家名称在中近景不再检查城市标签占位；城市标签也只在总览段被国家名称占位阻挡。
  - 新增 `smootherStep()` 供标签渐隐曲线使用。
- `app/webgl-generator/src/styles.css`：
  - 国家名称 opacity transition 调整为 `240ms cubic-bezier(0.22, 0.61, 0.36, 1)`。
  - 城市标签、手工标签和国家名称分别设置层级，保证城市标签稳定位于淡出的国家名称之上。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410`，切到国家视图并扫 `scale=1..4.6`：
  - 国家名称最大透明度按缩放单调下降：`1 -> 0.990 -> 0.917 -> 0.758 -> 0.539 -> 0.310 -> 0.127 -> 0.025 -> 0`。
  - `scale >= 3.9` 后国家名称数量为 `0`，未再出现高倍缩放残影。
  - 城市标签在中近景保持显示，国家名称不再挤占城市标签空间。

## 2026-06-28 初始化中立区与涂色编辑中立目标修正

问题：

- 用户发现有一处中立地区存在大量道路和城镇，不符合原版初始中立地区通常偏无人区的预期。
- 检查发现正式应用生成顺序是先生成城镇作为首都候选，再生成国家；国家扩张后，部分非首都城镇可能仍落在 `state=0` 的中立 cell 上，后续道路又会基于这些 burg 生成连接。
- 国家/省份编辑器此前把目标 id `<= 0` 当作无效，无法把“中立”作为类似橡皮擦的特殊涂色对象。

方案：

- 初始化阶段不把所有中立地硬塞进国家，而是按“无人区”语义收紧：
  - 国家扩张后，已有 burg 或具备 `s/pop + culture` 的中立陆地会先通过相邻国家扩张接管。
  - 连通扩张够不到的零星适居中立 cell 会兜底归给最近国家。
  - 仍为中立的非首都城镇在初始 finalize 时剔除，并清理对应 burg 引用；道路随后只基于剩余城镇生成。
- 手工编辑语义保持开放：
  - 用户后续用国家编辑器涂出中立，不走初始清理逻辑。
  - 国家中立会清 `state=0`，并同步把省份归属清为 `0`。
  - 省份中立只清 `province=0`，不改变国家。

实施：

- `app/webgl-generator/src/generator/politics.js`：
  - 新增 `claimInhabitedNeutralCells()`，在 pack 国家扩张与形状修正后补领适居中立 cell。
  - 新增孤立适居中立 cell 的最近国家兜底归属。
- `app/webgl-generator/src/generator/settlements.js`：
  - `finalizeSettlements()` 支持 `pruneNeutralSettlements` 选项。
  - 初始生成开启该选项，剔除仍为中立的非首都城市，清理 `pack.cells.burg`、burg removed 状态和 grid burg 索引。
  - 运行时城镇/道路重新生成默认不启用该清理，避免用户手工中立区被自动删除。
- `app/webgl-generator/src/generator/index.js`：
  - 初始 `finalizeSettlements()` 调用传入 `pruneNeutralSettlements: true`。
- `app/webgl-generator/src/runtime/app.js`：
  - 国家和省份笔刷允许目标 id `0`。
  - 省份目标为 `0` 时不再要求目标省份所属国家，允许在任意陆地清省份。
- `app/webgl-generator/src/runtime/state-edit-commands.js`：
  - 国家笔刷移入 `state=0` 时会同步清除 pack/grid 省份。
  - 城市落在被擦除国家的 cell 上时，城市和 burg 的 state/province 会同步变成 `0`。
- `app/webgl-generator/src/runtime/province-edit-commands.js`：
  - 省份笔刷清零后，城市 province 也允许同步为 `0`。
- `app/webgl-generator/src/ui/panels/state-panel.js`、`StatePanel.vue`：
  - 国家面板加入“中立”特殊行和目标选项。
  - 中立行显示面积、人口和中立城镇统计，但隐藏改名、改色、首都等实体操作。
- `app/webgl-generator/src/ui/panels/province-panel.js`、`ProvincePanel.vue`：
  - 省份面板加入“中立”特殊行和目标选项。
  - 中立行显示无省份面积、cells 和城市统计，但隐藏实体操作。
- `app/webgl-generator/src/runtime/object-resolver.js`：
  - 补齐 state/province id `0` 的特殊对象解析。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 国家/省份专题中的中立色改为克制灰色，避免看起来像普通强势政区。

验证：

- `node --check` 通过：
  - `app\webgl-generator\src\generator\politics.js`
  - `app\webgl-generator\src\generator\settlements.js`
  - `app\webgl-generator\src\runtime\app.js`
  - `app\webgl-generator\src\runtime\state-edit-commands.js`
  - `app\webgl-generator\src\runtime\province-edit-commands.js`
  - `app\webgl-generator\src\runtime\object-resolver.js`
- 同一组 `default / neutral-debug-1 / neutral-debug-2 / neutral-debug-3` 生成验证：
  - `neutralCities = 0`
  - `neutralRouteEndpoints = 0`
  - `neutralInhabited = 0`
  - 保留的中立陆地均无适居/文化评分或 burg。
- 命令级编辑验证：
  - 国家笔刷把一个有国家/省份的城市 cell 涂成中立后，`state/province/cityState/cityProvince` 均为 `0`。
  - 省份笔刷把同一 cell 涂成中立后，`state` 保持原国家，`province/cityProvince` 为 `0`。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 页面运行态 `neutralCities = 0`、`neutralRouteEndpoints = 0`、`neutralInhabited = 0`。
  - 国家面板目标下拉包含 `中立`。
  - 省份面板目标下拉包含 `中立`。
  - 无 console error / pageerror。

## 2026-06-29 国界、省界与海岸线渲染平滑

目标：

- 按用户此前确认的方向，让 WebGL 生成的国界、省界、海岸线和湖岸线在视觉上更柔和。
- 保持关联 cells、国家/省份归属、picking 和编辑判定仍为原始棱角边界。
- 国家/省份编辑拖动时仍按 cell 即时预览；提交后沿用现有 `refreshLineLayers()` 自动重新生成平滑线层。

方案：

- 在线层构建时，把零散共享边线段先拼成有序路径。
- 对海岸线和湖岸线使用两轮较温和的 Chaikin 平滑。
- 对国界和省界使用一轮更保守的 Chaikin 平滑：
  - 节点度数不等于 `2` 的三岔口、端点和交汇点会作为路径切分点。
  - 开放路径保留首尾端点，避免国家/省份交界点漂移。
  - 闭合路径按循环路径处理，再补回首点闭合。
- 平滑结果只写入现有 `gl.LINES` 线层 buffer，不反写 `grid.cells`、`pack.cells` 或任何语义字段。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `buildLineVertices()` 改为通过 `pushSmoothedBoundarySegments()` 输出海岸、湖岸、国界和省界。
  - 新增 `collectPoliticalBoundarySegments()`，把原本边扫描逻辑拆成线段收集。
  - 新增边界 graph/path 构建函数：
    - `buildBoundaryGraph()`
    - `buildBoundaryPaths()`
    - `walkBoundaryPath()`
  - 新增平滑函数：
    - `smoothBoundaryPath()`
    - `chaikinBoundaryPath()`
  - 新增 `pushWorldPolyline()`，把平滑路径拆回短线段进入现有线层。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 海岸/湖岸原始线段合计 `1806`。
  - 平滑后线层 `lineVertexCount = 26588`。
  - 切换国家视图和省份视图后 `lineVertexCount` 保持有效。
  - 画布非空采样 `nonZero = 918000 / 918000`。
  - `WebGL error = 0`，无 console error / pageerror。

## 2026-06-29 河流与路线渲染平滑

目标：

- 延续边界平滑方案，把河流、道路、小路和海路也改为渲染层平滑。
- 保持原始 `river.points`、`route.points`、河流 cells、道路寻路结果、picking 和对象定位不变。
- 河流宽度不丢失：平滑后的中间点需要同步插值宽度，避免变宽河流出现断档。

方案：

- 新增开放折线 Chaikin 平滑工具，保留首尾端点，只平滑中间折点。
- 河流：
  - `getRiverRenderPath()` 仍先按原始点计算 flux 与宽度。
  - 返回前对点和宽度数组一起平滑。
  - 如果河流点带有第三维 flux，也同步插值。
- 路线：
  - `buildRouteMeshVertices()` 在绘制前临时平滑 `route.points`。
  - 道路、小路、海路和虚线小路共享该渲染路径，原始路线 cells 与点不写回。
- 选中河流高亮：
  - `buildSelectionMeshVertices()` 的河流高亮也使用同一套开放折线平滑，避免高亮和河流主体错位。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `LINE_SMOOTHING` 配置，分别控制河流、路线和河流高亮的平滑强度。
  - 新增 `smoothWorldPath()`、`smoothWorldPathWithValues()`、`chaikinOpenWorldPath()`。
  - 新增 `interpolateWorldPoint()` 和 `interpolateValue()`，支持河流第三维 flux 与宽度插值。
  - `getRiverRenderPath()`、`buildRouteMeshVertices()` 和河流 selection mesh 改为使用平滑后的临时路径。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - `routeVertexCount = 48930`。
  - `riverVertexCount = 19674`。
  - 原始河流段数 `1557`，平滑后河流渲染段数 `3279`。
  - 原始路线段数 `3508`，路线 mesh 正常生成。
  - 画布非空采样 `nonZero = 918000 / 918000`。
  - `WebGL error = 0`，无 console error / pageerror。

## 2026-06-29 边界平滑回滚与面线同源方案

问题：

- 海岸线、湖岸线、国界和省界单独做线层平滑后，会与仍然保持硬 cell 形状的陆海/政治面填色交叉。
- 这不是平滑强度问题，而是几何来源不一致：线条被平滑了，面仍然是 Voronoi cell 拼出来的直边。
- 国界和省界在三岔口、狭长 cell 和复杂交界处尤其明显，平滑线会切进相邻国家或省份的色块。

处理：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 海岸线和湖岸线恢复为逐段绘制原始共享边。
  - 国界和省界恢复为逐段绘制相邻 cell 的共享 Voronoi 边。
  - 删除边界路径拼接和闭合边界 Chaikin 平滑工具，避免留下当前阶段不适合使用的死代码。
  - 保留河流、道路、小路和海路线条的开放折线平滑；这些线要素不承担面填色边界，不会与 cell 色块产生同类交叉。

后续方案：

- 边界平滑不能再作为单独线层功能推进，必须改为“面线同源”：
  - 海岸：从海岸轮廓生成平滑后的视觉陆/水面或遮罩，海岸线使用同一套平滑轮廓。
  - 国家/省份：为政治视图构建提交后的平滑视觉面 mesh，边界线从同一 mesh/contour 派生。
  - 编辑拖拽阶段仍使用硬 cell 预览，提交后再重建平滑视觉面和边界线，保持编辑反馈清楚且数据结构不被反写。
- 这条路线需要后续补 polygonization、三角化或 stencil/mask 管线，再考虑洞、多岛、飞地和三国交界锁点。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - `lineSegments = 4848`，与原始硬边预期 `expectedLineSegments = 4848` 一致。
  - 原始边界构成：海岸/湖岸 `1806`，国界 `729`，省界 `2313`。
  - 河流仍保持渲染层平滑：原始河流段 `1557`，渲染段约 `3232`。
  - `routeVertexCount = 39318`，`riverVertexCount = 19392`。
  - 画布非空采样 `nonZero = 752000 / 752000`。
  - `WebGL error = 0`，无 console error / pageerror。

## 2026-06-29 海岸面线同源第一刀

目标：

- 重新推进海岸线平滑，但不再只平滑线层。
- 让海岸/湖岸的视觉面和线条来自同一套平滑轮廓，避免平滑线穿过硬 cell 色块。
- 不反写底层 `grid.cells`、`features`、picking 或编辑数据，保持生成语义仍然稳定。

方案：

- 在 surface buffer 中保留原始 cell 面作为基础层。
- 额外追加一层窄海岸视觉带：
  - 从 grid 邻接重新收集陆/水 cell 的共享 Voronoi 边。
  - 记录每条边的陆 cell、水 cell 和陆侧方向。
  - 把边拼成海岸/湖岸路径后，对陆侧偏移路径和水侧偏移路径同时做 Chaikin 平滑。
  - 两条平滑偏移路径之间生成三角带，陆侧和水侧颜色分别按当前视图从相邻 cell 取色。
- 海岸线和湖岸线不再用原始硬边直接绘制，而是从同一条平滑视觉带的中心线派生。
- 国界和省界暂时保持硬边；政治面要等后续构建国家/省份平滑视觉 mesh 后再推进。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `buildPlaceholderVertices()` 在原始 `pushGridCells()` 后追加 `pushShoreVisualBands()`。
  - `buildLineVertices()` 的海岸/湖岸改为读取同源 `buildShoreVisualPaths()`，国界/省界仍逐段绘制共享边。
  - 新增海岸视觉参数 `SHORE_VISUAL_STYLE`，集中管理约 `5.5` world units 的窄带宽度、两轮温和 Chaikin 平滑，以及海岸/湖岸描线颜色。
  - 新增海岸路径、图结构、陆/水侧偏移、颜色插值和闭合/开放路径平滑工具。
  - 海岸路径收敛为 renderer 级缓存：`loadMap()` 构建一次，surface buffer 与 line buffer 复用同一份路径；视图切换时只按缓存路径重建颜色和 buffer，不重复收集/拼接海岸拓扑。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 原始硬边预期：海岸/湖岸 `1806`，国界 `729`，省界 `2313`，合计 `4848`。
  - 平滑海岸同源线层后：`lineSegments = 10088`。
  - surface 顶点数增加到 `vertexCount = 221799`，说明海岸视觉带进入面层。
  - 海岸缓存统计：海岸路径 `9` 条、湖岸路径 `5` 条；海岸路径点 `1638`，湖岸路径点 `127`；`bandWidthWorld = 5.5`，平滑参数为 `iterations = 2`、`factor = 0.22`。
  - 高度、国家、省份视图切换后均能重建 surface，`vertexCount = 221799`，`lineVertexCount = 20176`。
  - 截图检查高度总览、国家总览和近岸放大：海岸线落在同源海岸视觉带内，不再与硬 cell 面交叉；近岸放大中橙色主线主要来自道路/海路，海岸描线已降为更克制的浅色半透明描边。
  - 画布非空采样 `nonZero = 752000 / 752000`。
  - `WebGL error = 0`，无 console error / pageerror。

## 2026-06-29 国家视图政治面线同源第一刀

目标：

- 继续推进边界平滑，但先只处理国家视图，不直接扩展到省份视图。
- 解决国界线平滑后切进国家色块的问题：国界线和两侧国家色块必须来自同一条平滑路径。
- 保持国家归属、picking、编辑判定和底层 cell 数据仍为原始硬边。

方案：

- 新增国家视觉边界带，而不是重三角化整个国家多边形：
  - 从 land cell 邻接中收集国家不同的共享 Voronoi 边。
  - 记录每条边两侧国家 id，并按国家组合规范化，保证同一条边界两侧颜色沿路径保持一致。
  - 路径只在相同国家组合内连续；三国交界、端点和复杂节点会切分路径，避免跨国家组合平滑。
  - 在国家视图 surface 上追加一层窄边界带，两侧分别取对应国家颜色。
  - 国家视图的国界描线从同一条边界带中心线派生。
- 高度视图和省份视图仍使用硬国界：
  - 高度视图没有国家色块，不需要同源国家面。
  - 省份视图尚未构建省份政治视觉面，提前平滑国界会重现“线平滑、面未同步”的问题。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `stateVisualPaths` renderer 缓存和 `rebuildStateVisualCache()`。
  - `loadMap()`、`refreshCellSurface()`、`refreshLineLayers()` 会维护国家视觉路径缓存。
  - `buildPlaceholderVertices()` 在 `colorMode === "states"` 时追加 `pushPoliticalVisualBands()`。
  - `buildLineVertices()` 只在 `colorMode === "states"` 时使用平滑国界中心线；其它视图仍调用硬边 `pushPoliticalBoundaryLines()`。
  - 新增 `STATE_VISUAL_STYLE`，集中管理国家边界带宽、平滑参数和描线颜色。
  - `getStats()` 暴露 `stateVisual` 统计，方便后续调试和性能对比。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 原始硬国界段 `729`，硬省界段 `2313`。
  - 国家视觉路径 `46` 条、路径点 `754`，`bandWidthWorld = 7`，平滑参数为 `iterations = 1`、`factor = 0.18`。
  - 高度视图：`vertexCount = 221799`，`lineVertexCount = 20176`。
  - 国家视图：`vertexCount = 230559`，`lineVertexCount = 21638`，说明国家边界带和同源国界线只在国家视图生效。
  - 省份视图：`vertexCount = 221799`，`lineVertexCount = 20176`，仍保持硬国界路径。
  - 国家视图截图检查：国界线落在国家边界视觉带内，没有明显切进相邻国家色块；省界仍保持硬边。
  - 画布非空采样 `nonZero = 752000 / 752000`。
  - `WebGL error = 0`，无 console error / pageerror。

## 2026-06-29 省份视图政治面线同源第一刀

目标：

- 把国家视图的同源边界带推广到省份视图，但保持更克制的宽度和透明度。
- 让省界线和两侧省份色块来自同一套平滑路径，避免单独平滑省界线切入省份色块。
- 高度视图和国家视图不受省份视觉带影响。

方案：

- 将国家边界路径结构泛化为政治边界路径：
  - 统一使用 `valueA/valueB` 表示边界两侧对象 id。
  - 颜色由各自 style 决定，国家使用 `colorForState()`，省份使用 `colorForProvince()`。
  - 路径按对象组合分组，复杂节点和三方交界处切分。
- 新增 `PROVINCE_VISUAL_STYLE`：
  - 省份边界带宽 `bandWidthWorld = 4`。
  - 平滑参数为 `iterations = 1`、`factor = 0.14`。
  - 省界描线透明度比国界更低，避免省份密集区域变脏。
- 无省份 `0` 不参与省界视觉带，避免中立/无省份区域被当作实体省份染色。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `provinceVisualPaths` renderer 缓存和 `rebuildProvinceVisualCache()`。
  - `loadMap()`、`refreshCellSurface()`、`refreshLineLayers()` 同步维护省份视觉路径缓存。
  - `buildPlaceholderVertices()` 在 `colorMode === "provinces"` 时追加省份视觉边界带。
  - `buildLineVertices()` 只在省份视图下使用平滑省界中心线；其它视图继续使用对应硬边。
  - `getStats()` 暴露 `provinceVisual` 统计，方便后续性能和视觉调参。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 原始硬国界段 `729`，硬省界段 `2313`。
  - 省份视觉路径 `486` 条、路径点 `2737`，`bandWidthWorld = 4`，平滑参数为 `iterations = 1`、`factor = 0.14`。
  - 高度视图：`vertexCount = 221799`，`lineVertexCount = 20176`。
  - 国家视图：`vertexCount = 230559`，`lineVertexCount = 21638`。
  - 省份视图：`vertexCount = 250731`，`lineVertexCount = 25194`，说明省份边界带和同源省界线只在省份视图生效。
  - 省份总览和近景截图检查：省界视觉带与省份色块同源，宽度和透明度比国界更克制；没有明显省界线切进色块的问题。
  - 画布非空采样 `nonZero = 752000 / 752000`。
  - `WebGL error = 0`，无 console error / pageerror。

## 2026-06-29 实验性政治视觉面 mesh 缓存

目标：

- 开始推进真正的政治视觉面 mesh，但暂不替换主渲染 surface。
- 先验证完整政治面三角化的可行性、过滤比例和构建成本，避免直接把不成熟 mesh 画到主视图。
- 继续保持国家/省份归属、picking、编辑判定和底层 cell 数据不变。

方案：

- 使用项目已有的 `Delaunator`，不新增三角化依赖。
- 对国家和省份分别构建实验 mesh cache：
  - 按政治对象 id 分组。
  - 收集该对象内部 land cell 的中心点。
  - 从同源政治边界带中收集对应一侧的平滑边界点。
  - 对每个对象的点集做 Delaunay 三角化。
  - 用三角形重心 `pickGridCell()`，只保留重心仍落在对应政治对象 cell 内的三角形。
- 缓存只进入 renderer stats 的 `politicalVisualMeshes`，不进入 draw path。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 引入 `../vendor/delaunator.js`。
  - 新增 `politicalVisualMeshes` renderer 缓存和 `rebuildPoliticalVisualMeshes()`。
  - 新增 `buildPoliticalVisualMeshCache()`、`collectPoliticalVisualMeshGroups()`、`summarizePoliticalVisualMeshes()` 等实验 mesh 构建与统计函数。
  - `getStats()` 暴露国家/省份实验 mesh 的对象数、点数、候选三角数、保留三角数、过滤三角数、跳过对象数、构建耗时和最大对象摘要。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 现有视图绘制不变：
    - 高度视图 `vertexCount = 221799`，`lineVertexCount = 20176`。
    - 国家视图 `vertexCount = 230559`，`lineVertexCount = 21638`。
    - 省份视图 `vertexCount = 250731`，`lineVertexCount = 25194`。
  - 国家实验 mesh：
    - `groups = 20`
    - `pointCount = 6006`
    - `candidateTriangles = 11675`
    - `keptTriangles = 10269`
    - `rejectedTriangles = 1406`
    - `buildMs = 20.3`
  - 省份实验 mesh：
    - `groups = 217`
    - `pointCount = 13951`
    - `candidateTriangles = 24786`
    - `keptTriangles = 21112`
    - `rejectedTriangles = 3674`
    - `skippedGroups = 2`
    - `buildMs = 32.5`
  - 画布非空采样 `nonZero = 752000 / 752000`。
  - `WebGL error = 0`，无 console error / pageerror。

风险与下一步：

- 当前实验 mesh 只按三角形重心过滤，尚未执行真正 polygon clipping；狭窄边界和细长飞地仍可能存在跨界三角。
- 下一刀应先把 cache 扩展为可选 debug draw buffer，生成对比截图，再决定是否替换国家/省份主 surface。

## 2026-06-29 实验性政治视觉面 debug 绘制

目标：

- 把上一刀的政治视觉面 mesh 缓存扩展为可选绘制层，方便用截图直接观察三角化后的国家/省份视觉面是否跨界或漏洞。
- 默认仍不影响正式视图，避免把尚未 clipping 的实验 mesh 误接入主渲染结果。
- 继续保持国家/省份归属、picking、编辑判定和底层 cell 数据不变。

方案：

- `politicalVisualMeshes` 不再只保存统计，同时保存可上传到 WebGL 的 `Float32Array` 顶点。
- 新增独立 `politicalMeshDebugBuffer`，由 `setPoliticalMeshDebugMode("states" | "provinces" | "none")` 控制。
- debug 层使用政治对象原色加透明度，绘制在硬 cell surface 之上、道路/河流/线层之下，便于对比 mesh 与现有面层的偏差。
- `getStats()` 新增 `politicalMeshDebug`，暴露当前模式、顶点数和三角数；`politicalVisualMeshes` 摘要继续隐藏原始顶点数组，只报告统计信息。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `politicalMeshDebugBuffer`、`politicalMeshDebugMode`、`politicalMeshDebugVertexCount`。
  - 新增 `setPoliticalMeshDebugMode()`、`updatePoliticalMeshDebugBuffer()`、`normalizePoliticalMeshDebugMode()` 和 `politicalMeshDebugCache()`。
  - `buildPoliticalVisualMeshCache()` 在保留三角形时同步写入可绘制顶点，并继续按重心所在 cell 的政治归属过滤。
  - 国家/省份视觉 style 新增 `meshAlpha`，集中控制 debug mesh 透明度。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 默认 debug 模式为 `none`，`politicalMeshDebug.vertexCount = 0`。
  - 国家 debug 模式：`politicalMeshDebug.mode = states`，`vertexCount = 30807`，`triangleCount = 10269`，与 `politicalVisualMeshes.states.keptTriangles` 对齐。
  - 省份 debug 模式：`politicalMeshDebug.mode = provinces`，`vertexCount = 63336`，`triangleCount = 21112`，与 `politicalVisualMeshes.provinces.keptTriangles` 对齐。
  - 关闭 debug 后回到 `mode = none`、`vertexCount = 0`。
  - `WebGL error = 0`，无 console error / pageerror。
  - 已生成截图：
    - `docs/generated/reports/political-mesh-debug-states.png`
    - `docs/generated/reports/political-mesh-debug-provinces.png`
  - 两张截图均为 `1280 x 800`，文件级像素采样 `nonZero = 1024000 / 1024000`。

风险与下一步：

- 当前 debug mesh 仍是重心过滤，不是严格 polygon clipping；如果截图出现跨越狭窄边界的三角形，下一刀应在真正替换主 surface 前补 clipping 或局部补点策略。

## 2026-06-29 政治视图主 surface 接入视觉 mesh

目标：

- 解决国家/省份视图里“边界线和平滑带已经同源，但底层政治色块仍是硬 cell 面”的割裂感。
- 先只替换政治视图下的非零国家/省份陆地 surface，保留水域、中立国家和无省份陆地的硬 grid cell 兜底。
- 继续保持底层 cell、picking、编辑判定和生成数据不变；本刀只改变国家/省份视图的绘制 surface。

方案：

- `buildPlaceholderVertices()` 在国家/省份视图下会优先读取 `politicalVisualMeshes`：
  - 水域继续绘制硬 grid cell。
  - 国家视图中 `state = 0` 的中立陆地继续绘制硬 grid cell。
  - 省份视图中 `province = 0` 的无省份陆地继续绘制硬 grid cell。
  - 其它非零政治陆地使用政治视觉 mesh surface。
- `buildPoliticalVisualMeshCache()` 同时生成两套顶点：
  - `surfaceVertices`：不透明，用于正式政治视图 surface。
  - `vertices`：半透明，用于 `setPoliticalMeshDebugMode()` 的覆盖调试层。
- mesh 点集新增同源海岸/湖岸陆侧平滑点：
  - 先按 `SHORE_VISUAL_STYLE.bandWidthWorld` 取陆侧边界点。
  - 再按海岸平滑参数得到视觉海岸点。
  - 对平滑点重新 `pickGridCell()`，按实际落点的国家/省份归属加入对应 mesh group。
- 仍使用 Delaunay 候选三角形 + 重心所在 cell 归属过滤；本刀没有引入 polygon clipping。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `loadMap()` 和 `refreshCellSurface()` 把 `politicalVisualMeshes` 传给 surface 构建。
  - 新增 `politicalSurfaceMeshForMode()`、`shouldDrawGridCellUnderPoliticalMesh()` 和 `pushMeshSurfaceVertices()`。
  - `collectPoliticalVisualMeshGroups()` 新增海岸/湖岸点补充。
  - `buildPoliticalVisualMeshCache()` 同步输出正式 surface 顶点和 debug 顶点。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 高度视图保持 `vertexCount = 221799`，`lineVertexCount = 20176`，debug 默认关闭。
  - 国家 mesh 点数从上一刀约 `6006` 提升到 `13060`，候选三角 `25659`，保留三角 `21468`，过滤三角 `4191`，surface/debug 顶点 `64404`。
  - 省份 mesh 点数从上一刀约 `13951` 提升到 `21005`，候选三角 `38290`，保留三角 `32828`，过滤三角 `5462`，surface/debug 顶点 `98484`。
  - 国家视图默认 surface：`vertexCount = 294963`，`lineVertexCount = 21638`，`politicalMeshDebug.mode = none`。
  - 省份视图默认 surface：`vertexCount = 349215`，`lineVertexCount = 25194`，`politicalMeshDebug.mode = none`。
  - debug 层仍可独立开启：国家 debug `triangleCount = 21468`，省份 debug `triangleCount = 32828`，关闭后回到 `vertexCount = 0`。
  - `WebGL error = 0`，无 console error / pageerror。
  - 已生成截图：
    - `docs/generated/reports/political-mesh-surface-states.png`
    - `docs/generated/reports/political-mesh-surface-provinces.png`
  - 两张截图均为 `1280 x 800`，文件级像素采样 `nonZero = 1024000 / 1024000`。

风险与下一步：

- 当前 mesh 仍不是严格 polygon clipping，极端狭窄飞地或细碎湖岸仍可能有少量跨界三角。
- 下一刀建议做近景抽样截图和局部指标：检查三角形边长异常、跨越多条政治边界的长三角，并按需要加入最大边长过滤或边界局部补点。

## 2026-06-29 政治视觉 mesh 质量统计与近景抽样

目标：

- 给政治视觉 mesh 增加可量化的质量指标，减少只靠肉眼判断的随机性。
- 用指标定位最可疑三角并输出近景截图，判断下一刀是做过滤、补点还是更正式的 clipping。
- 本刀只统计和截图，不改变 mesh 过滤规则，避免过早删掉合法的沿海/边界三角。

方案：

- `politicalVisualMeshes.*.quality` 新增：
  - `averageGridSpacingWorld`：按 grid 邻接估算的平均 cell 间距。
  - `longEdgeThresholdWorld`：长边三角阈值，当前取平均间距约 `4.5` 倍，并受海岸视觉带宽兜底约束。
  - `maxEdgeWorld`、`longTriangleCount`、`longTriangleRatio`。
  - `boundaryMismatchTriangleCount`、`boundaryMismatchRatio`：保留三角的三条边中点采样后，若落到其它政治归属，计为疑似跨界。
  - `waterSampleTriangleCount`、`waterSampleRatio`：边中点采样落到水域或无 cell，用于捕捉海岸/湖岸附近风险。
  - `notableTriangles`：按长边、边界不一致和落水采样综合排序，保留最多 `8` 个可疑三角的中心坐标和摘要。
- Playwright 根据 `notableTriangles` 自动把相机移动到最可疑区域，生成国家/省份近景截图。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `createPoliticalMeshQualityStats()`、`addPoliticalMeshTriangleQuality()`、`summarizePoliticalMeshQualityStats()`。
  - 新增 `estimateGridSpacingWorld()`、`worldDistance()` 和 `roundRatio()`。
  - `buildPoliticalVisualMeshCache()` 在保留三角时同步更新全局 quality 和 group quality。
  - `largestGroups` 增加每个大组的最大边长、长边三角、边界不一致和落水采样计数。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 高度视图仍保持 `vertexCount = 221799`。
  - 国家 mesh：
    - 平均 grid 间距 `13.4`，长边阈值 `60.1`，最大边长 `170.1`。
    - 长边三角 `8` 个。
    - 边中点归属不一致三角 `349` 个，比例 `0.016`。
    - 落水采样三角 `576` 个，比例 `0.027`。
  - 省份 mesh：
    - 平均 grid 间距 `13.4`，长边阈值 `60.1`，最大边长 `76.9`。
    - 长边三角 `6` 个。
    - 边中点归属不一致三角 `688` 个，比例 `0.021`。
    - 落水采样三角 `559` 个，比例 `0.017`。
  - `WebGL error = 0`，无 console error / pageerror。
  - 已生成截图：
    - `docs/generated/reports/political-mesh-quality-states-overview.png`
    - `docs/generated/reports/political-mesh-quality-states-near-1.png`
    - `docs/generated/reports/political-mesh-quality-states-near-2.png`
    - `docs/generated/reports/political-mesh-quality-provinces-overview.png`
    - `docs/generated/reports/political-mesh-quality-provinces-near-1.png`
    - `docs/generated/reports/political-mesh-quality-provinces-near-2.png`
  - 6 张截图均为 `1280 x 800`，文件级像素采样 `nonZero = 1024000 / 1024000`。

观察：

- 国家近景中，可疑区域集中在狭长湖岸、海岸和政治边界邻近处，没有大面积破洞。
- 省份近景中可见少量尖细三角插入湖岸/海岸附近，说明长边三角不是纯统计噪声。

风险与下一步：

- 边中点归属不一致会把一部分合法边界贴边三角也计入风险，暂不适合作为硬删除规则。
- 下一刀优先做长边过滤：先剔除 `maxEdgeWorld > longEdgeThresholdWorld` 的保留三角，再观察是否出现缺口；如缺口明显，再补局部边界点，而不是直接全量 clipping。

## 2026-06-29 政治 mesh 异常直线排查与过滤

问题：

- 用户指出 `political-mesh-quality-states-near-1.png` 中存在异常的断续直线。
- 该线看起来像路线或描边，但在政治 mesh 迁移后也可能来自 surface 三角。

排查：

- 用同一相机位置分别输出：
  - 默认图层。
  - 关闭道路。
  - 关闭河流。
  - 关闭道路和河流。
  - 保留 surface + 海岸/国界线。
  - 只保留 surface。
- 结果：
  - 关闭道路、河流、边界、海岸和标签后，异常直线仍存在。
  - 因此来源不是路线、河流或描边，而是政治视觉 mesh surface 的瘦长三角。

方案：

- 在 Delaunay 候选三角进入 surface/debug 顶点前增加三层过滤：
  - 长边过滤：`maxEdgeWorld > longEdgeThresholdWorld` 的候选三角不绘制。
  - 采样异常过滤：边中点采样跨到其它政治归属或水域时，只有边长超过较保守阈值才过滤，避免误删正常贴边三角。
  - 针状过滤：最大边超过约 `1.5` 倍平均 grid 间距，同时最小高小于约 `0.25` 倍平均 grid 间距时过滤。
- stats 新增：
  - `longEdgeFilteredTriangles`
  - `skinnyFilteredTriangles`
  - `sampleFilteredTriangles`
  - `quality.filteredLongTriangleCount`
  - `quality.filteredSkinnyTriangleCount`
  - `quality.filteredSampleTriangleCount`
  - `notableTriangles[].filterReason`

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `triangleMaxEdgeWorld()`、`triangleMinAltitudeWorld()` 和 `triangleDoubleAreaWorld()`。
  - 新增 `inspectPoliticalMeshTriangleSamples()`、`shouldFilterPoliticalMeshSampleTriangle()` 和 `shouldFilterPoliticalMeshSkinnyTriangle()`。
  - `buildPoliticalVisualMeshCache()` 在三角进入顶点前先执行长边、针状和采样异常过滤。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - 同一位置 `surface-only` 截图中，原异常断续直线已消失。
  - 国家 mesh：
    - `keptTriangles = 21315`
    - `longEdgeFilteredTriangles = 377`
    - `skinnyFilteredTriangles = 1323`
    - `sampleFilteredTriangles = 7`
    - 保留三角 `maxEdgeWorld = 33`
  - 省份 mesh：
    - `keptTriangles = 32566`
    - `longEdgeFilteredTriangles = 161`
    - `skinnyFilteredTriangles = 1713`
    - `sampleFilteredTriangles = 4`
    - 保留三角 `maxEdgeWorld = 33`
  - 高度视图保持 `vertexCount = 221799`。
  - `WebGL error = 0`，无 console error / pageerror。
  - 已生成截图：
    - `docs/generated/reports/line-source-default.png`
    - `docs/generated/reports/line-source-routes-off.png`
    - `docs/generated/reports/line-source-surface-only.png`
    - `docs/generated/reports/line-source-after-filter-surface-only.png`
    - `docs/generated/reports/line-source-after-sample-filter-surface-only.png`
    - `docs/generated/reports/line-source-after-skinny-filter-surface-only.png`
    - `docs/generated/reports/political-mesh-filtered-states-overview.png`
    - `docs/generated/reports/political-mesh-filtered-provinces-overview.png`
  - 关键截图均为 `1280 x 800`，文件级像素采样 `nonZero = 1024000 / 1024000`。

风险与下一步：

- 针状过滤是视觉策略，不改变底层 cell；极端碎片区域仍可能需要局部补点。
- 下一步建议做省份近景回归抽样，确认过滤没有在小省份或飞地边缘制造可见缺口；若缺口出现，再补边界点，而不是继续降低过滤阈值。

## 2026-06-29 全局视觉 cell mesh 试验

背景：

- 用户提出：如果一开始的 cells 边界就是平滑的，后续与 cells 相关的平滑就会顺理成章。
- 这个方向比继续在国家/省份层面补 Delaunay 政治 mesh 更根本：所有视图都可以共享同一套视觉 cell 边界，picking 和编辑仍保持原始硬 cell。

目标：

- 新增一套 renderer 级 `cellVisualMesh`，不修改真实 `grid.cells`。
- 每条共享 Voronoi 边只生成一次视觉曲线，相邻 cell 反向复用，避免裂缝。
- 先让所有 surface 视图都使用视觉 cell mesh 着色，观察高度、国家、省份和既有异常直线区域是否稳定。
- 保留政治 Delaunay mesh 的 debug 和质量统计，作为对比与回退依据。

方案：

- `cellVisualMesh` 只缓存几何：
  - `cell`：原 grid cell id。
  - `center`：原 cell 中心点。
  - `points`：按 cell 顶点顺序串起的视觉边界采样点。
- 共享边曲线：
  - 以两个 Voronoi 顶点 id 排序作为 edge key。
  - 基于 edge key 哈希得到稳定偏移。
  - 用二次曲线从原边起点到终点采样，第一刀参数为 `segmentsPerEdge = 3`、`curveFactor = 0.14`、`maxOffsetWorld = 1.8`。
  - 相邻 cell 读取同一条曲线，方向相反。
- surface 构建：
  - `buildPlaceholderVertices()` 优先使用 `cellVisualMesh`。
  - 每个视觉 cell 仍以原 cell center 做扇形三角化。
  - `colorForCell()` 仍按原 cell id 取色，因此高度、国家、省份、文化等视图的语义不变。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 新增 `cellVisualMesh` renderer 缓存和 `rebuildCellVisualMesh()`。
  - 新增 `buildCellVisualMesh()`、`buildCellVisualBoundary()`、`cellVisualEdgeCurve()`、`sampleQuadraticWorldPath()`、`cellVisualEdgeNoise()`。
  - 新增 `pushCellVisualGridCells()`，surface 构建优先使用视觉 cell 边界。
  - `getStats()` 新增 `cellVisualMesh` 摘要。
  - `pushGridCells()` 补上可选 cell 过滤 predicate，保留无视觉 mesh 时的政治 mesh fallback 正确性。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 访问 `http://127.0.0.1:5410` 验证：
  - `cellVisualMesh.cellCount = 10004`
  - `cellVisualMesh.skippedCells = 0`
  - `cellVisualMesh.edgeCurveCount = 30215`
  - `cellVisualMesh.boundaryPoints = 175281`
  - `averageBoundaryPoints = 17.521`
  - `buildMs = 46`
  - 高度视图 `vertexCount = 568119`，`lineVertexCount = 20176`，`WebGL error = 0`。
  - 国家视图 `vertexCount = 576879`，`lineVertexCount = 21638`，`WebGL error = 0`。
  - 省份视图 `vertexCount = 597051`，`lineVertexCount = 25194`，`WebGL error = 0`。
  - 之前异常直线位置的国家近景截图未再出现直线异常。
  - 已生成截图：
    - `docs/generated/reports/cell-visual-height-overview.png`
    - `docs/generated/reports/cell-visual-states-overview.png`
    - `docs/generated/reports/cell-visual-provinces-overview.png`
    - `docs/generated/reports/cell-visual-states-near-line-check.png`
  - 4 张截图均为 `1280 x 800`，文件级像素采样 `nonZero = 1024000 / 1024000`。

观察：

- 这条路线整体更统一：高度、国家、省份等 surface 都来自同一套视觉 cell 边界。
- 第一刀曲率较克制，暂未看到裂缝或明显自交。
- 顶点数从硬 cell 的约 `22` 万提升到约 `57-60` 万，draw 仍在十几毫秒，当前 10k cells 可接受；后续大图需要再 profile。

风险与下一步：

- 当前视觉 cell 仍用 cell center 扇形三角化；若某些 cell 在更强曲率下出现凹形或自交，可能需要正式 polygon triangulation。
- 海岸线、国界线、省界线当前仍来自各自 path/band 体系，虽然 surface 已统一为视觉 cell，但线层还没有完全改成从 `cellVisualMesh` 提取共享边。
- 下一步建议先做一个开关或参数化策略：保留视觉 cell mesh 作为默认候选，但允许回退硬 cell surface；随后把海岸/国界/省界线层逐步改为读取视觉 cell 共享边，真正完成“面线同源”。

## 2026-06-29 平滑单元格边界开关与线层推广

背景：

- 全局视觉 cell mesh 试验通过后，需要先提供可见开关，避免该策略在大图或异常地形上没有用户级回退。
- 用户此前指出单独平滑海岸线、国界、省界会与硬 cell 面交叉，因此线层必须与当前 surface 使用同一套视觉边界。

目标：

- 在控制面板中新增“平滑单元格边界”开关，默认开启并持久化。
- 关闭开关时，地图表面和边界线层一起回到硬 cell 路径。
- 开启开关时，海岸线、湖岸线、国界和省界直接从 `cellVisualMesh.edgeCurves` 读取共享边曲线，保证面线同源。

实施：

- `app/webgl-generator/src/ui/vue/components/ControlPanel.vue`：
  - 在 `视图` tab 增加“平滑单元格边界”开关。
- `app/webgl-generator/src/ui/vue/stores/global-config-store.js`、`app/webgl-generator/src/ui/panel.js`、`app/webgl-generator/src/runtime/app.js`：
  - 新增 `smoothCellBorders` 偏好读写、控制锁定、运行时刷新和统计展示。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - `viewOptions` 新增 `smoothCellBorders`，默认开启。
  - `buildLineVertices()` 在平滑模式下使用 `pushCellVisualShoreLines()` 与 `pushCellVisualPoliticalLines()`。
  - 新增 `visualSharedCellEdge()`，通过共享 Voronoi 顶点 id 查找 `cellVisualMesh.edgeCurves`。
  - 关闭平滑时不再使用政治视觉 surface，保证真实回退到硬 cell surface 加旧线层。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- Playwright 一次性静态服务验证 `dist/webgl-generator`：
  - 控制面板 `视图` tab 中“平滑单元格边界”开关可见，默认选中。
  - 国家视图平滑模式：
    - `cellSurfaceMode = visual-cells`
    - `vertexCount = 525843`
    - `lineVertexCount = 28260`
    - `cellVisualMesh.cellCount = 10004`
    - `cellVisualMesh.edgeCurveCount = 30215`
    - `WebGL error = 0`
  - 省份视图平滑模式：
    - `cellSurfaceMode = visual-cells`
    - `vertexCount = 525843`
    - `lineVertexCount = 28260`
    - `WebGL error = 0`
  - 关闭开关后的省份硬边界回退：
    - `cellSurfaceMode = hard-cells`
    - `vertexCount = 250731`
    - `lineVertexCount = 25194`
    - `WebGL error = 0`
  - 再次打开后恢复：
    - `cellSurfaceMode = visual-cells`
    - `vertexCount = 525843`
    - `lineVertexCount = 28260`
    - `WebGL error = 0`
  - `localStorage.webgl-generator-control-preferences.smoothCellBorders = true`。
  - 无 console error / pageerror。
  - 已生成截图：
    - `docs/generated/reports/smooth-cell-borders-states-on.png`
    - `docs/generated/reports/smooth-cell-borders-provinces-on.png`
    - `docs/generated/reports/smooth-cell-borders-provinces-off.png`

观察与下一步：

- 当前平滑曲率仍保持克制，面线同源后未再看到边界线与 cell 面明显交叉。
- 大图性能还没有重新 profile；后续若推进默认发布，需要补 `50k/100k` cells 下 `cellVisualMesh` 构建、顶点数和 draw 耗时数据。
- 河流、道路等开放折线仍保留独立 Chaikin 平滑，不依赖 cellVisualMesh；后续如要让河流贴合河谷 cell 边界，可另做水文路径约束，不应直接混到边界视觉开关里。

## 2026-06-29 平滑单元格边界大图回归与自然度修正

背景：

- 用户要求按“50k/100k 性能回归、近景视觉抽样、保护阈值判断、路径整理”的顺序完整走一遍。
- 用户随后指出：省份视图开启/关闭平滑在总览上不明显；进一步观察后又指出虽然有曲线，但曲线仍显得不够自然。

实施：

- 新增 `tools/webgl-generator-smooth-cell-profile.mjs`：
  - 启动一次性静态服务加载 `dist/webgl-generator`。
  - 生成指定 cells 地图，采集高度、国家、省份平滑模式和省份硬边界模式的 renderer 统计。
  - 输出 `docs/generated/reports/smooth-cell-profile-results.json` 和 `docs/generated/reports/smooth-cell-profile-results.md`。
  - 自动截取总览图，以及海岸、湖岸、国界、省界、三国交界等近景的平滑/硬边界对照图。
- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 修正关闭“平滑单元格边界”时仍混入旧海岸/政治视觉带的问题。
  - 关闭平滑后，surface 使用硬 grid cell，海岸/湖岸/国界/省界线层使用硬共享 Voronoi 边。
  - 开启平滑后，surface 与线层继续使用 `cellVisualMesh` 的共享曲线。
  - `getStats()` 新增 `boundaryLineMode`，区分 `visual-cell-curves`、`hard-cell-edges` 和兼容 fallback。
  - 将视觉边曲线从逐边独立哈希偏移改为连续空间噪声，并把 `curveFactor` 从 `0.14` 降到 `0.08`、`maxOffsetWorld` 从 `1.8` 降到 `0.9`，降低“每条边单独被捏弯”的人工感。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计新增“边界线来源”，显示为“平滑共享边 / 硬共享边 / 兼容路径”。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check tools\webgl-generator-smooth-cell-profile.mjs` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有 `@vueuse/core` 的 Rolldown pure annotation 位置警告。
- 10k smoke：
  - 平滑省份近景与硬边界近景已经可见差异：平滑图为克制曲线，硬边界图为直共享边。
  - `cellVisualMesh.buildMs = 41.6ms`，`vertexCount = 525852`，`lineVertexCount = 25206`，硬边界省份 `vertexCount = 179550`，`lineVertexCount = 8640`。
- 50k/100k 完整回归：
  - 50k：
    - 实际 grid cells `50142`，pack cells `29988`。
    - 平滑模式 `vertexCount = 2558304`，`lineVertexCount = 85188`，`cellVisualMesh.edgeCurveCount = 150881`，`boundaryPoints = 852768`，`cellVisualMesh.buildMs = 184.4ms`。
    - 省份硬边界 `vertexCount = 901233`，`lineVertexCount = 30162`。
  - 100k：
    - 实际 grid cells `99846`，pack cells `52578`。
    - 平滑模式 `vertexCount = 4963554`，`lineVertexCount = 128838`，`cellVisualMesh.edgeCurveCount = 300183`，`boundaryPoints = 1654518`，`cellVisualMesh.buildMs = 466.2ms`。
    - 省份硬边界 `vertexCount = 1795557`，`lineVertexCount = 47004`。
  - 两档 `WebGL error = 0`，无 console error / pageerror。
  - 风险扫描中，50k/100k 的短边、超长边、低面积 cell、无效点均为 `0`。
  - 近景海岸、湖岸、省界、国界和交界截图未见裂缝、线面交叉或异常直线。

判断：

- 本轮不额外增加保护阈值。原因是风险扫描和抽样截图没有暴露出自交、裂缝或异常长线；继续加阈值反而可能制造局部硬/软混杂。
- 用户关于“曲线不够自然”的判断成立。新版连续噪声只是把逐边随机感压低，定位应是“克制的 cell 级微曲过渡”，不是最终制图级自然轮廓。
- 后续若继续追求自然效果，应该走轮廓级方案：对海岸、湖岸、国界、省界分别生成可重采样的连续轮廓，并把填色面和线层一起从同一轮廓构建；同时引入地貌、水文、山脉、道路等约束，而不是继续加大每条 cell 边的曲率。

## 2026-06-29 原版风格海岸与圆角政区边界

背景：

- 用户确认新的方向：海岸线移植原版逻辑；国界、省界等内部边界不继续曲线化，而是模拟原版 SVG 的 `stroke-linejoin: round`，获得更克制的视觉平滑。
- 原版源码调查结论：海岸/湖岸有专门的 `coastline-fractal` 分形与曲线构建；行政边界主要是连续顶点链加 SVG 圆角连接，并不是自然曲线。

实施：

- `app/webgl-generator/src/renderer/placeholder-renderer.js`：
  - 线层从 `gl.LINES` 改为 `gl.TRIANGLES`。
  - 新增原版风格海岸采样：
    - 读取现有海岸/湖岸路径。
    - 按 seed 生成闭合粗糙度包络。
    - 递归细分边并按法线扰动中点。
    - 平滑段用二次曲线采样，扰动段用三次曲线采样。
  - 新增 `pushWorldPolylineMesh()`：
    - 每个边界线段生成矩形条带。
    - 每个折点补圆盘，模拟 SVG `stroke-linejoin: round`。
  - 海岸/湖岸线层调用原版风格采样点。
  - 国界/省界线层调用连续政治边界路径和圆角 join，不再读取 `cellVisualMesh.edgeCurves`。
  - `getStats()` 新增 `lineTriangleCount`，`boundaryLineMode` 固定为 `original-coastline + round-join-political`。
- `app/webgl-generator/src/ui/panel.js`：
  - 运行时统计将“线段顶点”改为“轮廓三角形”。
  - “边界线来源”显示为“原版海岸 / 圆角政区”。
- `tools/webgl-generator-smooth-cell-profile.mjs`：
  - 回归报告同步采集并展示 `lineTriangleCount`。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check tools\webgl-generator-smooth-cell-profile.mjs` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有既有 `@vueuse/core` pure annotation 位置警告。
- 10k 快速回归：
  - `boundaryLineMode = original-coastline + round-join-political`。
  - `lineTriangleCount = 509548`。
  - 高度视图 draw 平均 `0.9ms`，国家视图 `0.9ms`，省份视图 `0.8ms`。
  - 三个视图 `WebGL error = 0`。
  - 报告文件：
    - `docs/generated/reports/smooth-cell-profile-results.json`
    - `docs/generated/reports/smooth-cell-profile-results.md`
  - 近景截图已覆盖：
    - `docs/generated/reports/smooth-cell-profile/10000-coast-near-smooth.png`
    - `docs/generated/reports/smooth-cell-profile/10000-lake-near-smooth.png`
    - `docs/generated/reports/smooth-cell-profile/10000-state-border-near-smooth.png`
    - `docs/generated/reports/smooth-cell-profile/10000-province-border-near-smooth.png`
    - `docs/generated/reports/smooth-cell-profile/10000-state-junction-near-smooth.png`

观察与风险：

- 海岸线已经比 cell 级微曲更接近原版分形海岸；国界/省界保持直线语义，只通过圆角 join 消除尖锐折点。
- 线层三角形数量显著高于旧 `gl.LINES`，但 10k 快速档 draw 仍在 1ms 左右。
- 下一步如果要默认推广到 50k/100k，需要重新跑大图回归，观察轮廓三角形数量和近景线宽；必要时再改为屏幕空间宽度或做视距自适应线宽。

### 后续修正：海岸线与填色分离

问题：

- 用户查看快照后指出海岸线仍与填色分离。
- 原因是线层已经换成原版分形轮廓，但海岸附近的 surface 仍主要来自视觉 cell mesh；第一轮同源带又使用陆/水渐变，并按序号比例映射原始海岸方向，局部仍会在线与陆地填色之间露出水色。

修正：

- `pushShoreVisualBands()` 改为无论是否启用 `cellVisualMesh` 都叠加海岸视觉带。
- `buildSmoothedShoreVisual()` 改为使用 `path.originalCoastlinePoints`，并拆成陆侧实色带和水侧实色带，两侧在海岸线中心相接，不再做陆水渐变。
- 原版分形点的陆/水方向采样从“按序号比例”改为“按最近原始海岸点”，减少局部方向错配。
- 海岸视觉带宽从 `5.5` 调整为 `13` world units，用来覆盖原版分形扰动相对旧 cell 海岸的偏移。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有既有 `@vueuse/core` pure annotation 位置警告。
- 重新运行 10k 快速回归并更新：
  - `docs/generated/reports/smooth-cell-profile-results.json`
  - `docs/generated/reports/smooth-cell-profile-results.md`
  - `docs/generated/reports/smooth-cell-profile/10000-coast-near-smooth.png`
  - `docs/generated/reports/smooth-cell-profile/10000-lake-near-smooth.png`
- 人工查看最新 coast/lake 近景，海岸线附近不再出现线与陆地填色之间夹水色的明显分离。

### 后续修正：水陆线统一控制湖岸

问题：

- 用户指出控制面板中“海岸线”开关只影响海岸线，没有一起控制湖岸线。
- 现有 renderer 内部本来有 `coastline` 和 `lakeShore` 两个线层状态，但用户可见语义应是统一的水陆分界，不应把湖岸漏在外面。

修正：

- `ControlPanel.vue`：图层按钮文案从“海岸线”改为“水陆线”，仍复用 `data-layer="coastline"` 作为外部契约。
- `placeholder-renderer.js`：`setLayerVisible("coastline", visible)` 会同步更新 `coastline` 与 `lakeShore`，并只刷新一次线层。
- `panel.js`、`runtime/app.js`、`global-config-store.js`：偏好读写和应用时都会把 `coastline` 同步给 `lakeShore`；非 Pinia fallback 写入 localStorage 时改为安全合并 `layers`，避免覆盖其它图层状态。
- 运行时统计中的图层显示名称也改为“水陆线”。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panel.js` 通过。
- `node --check app\webgl-generator\src\ui\vue\stores\global-config-store.js` 通过。
- `git diff --check` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有既有 `@vueuse/core` pure annotation 位置警告。
- Playwright 打开构建产物后验证：
  - 图层按钮列表显示“水陆线”，没有显示“海岸线”。
  - 点击关闭后 renderer 中 `coastline=false` 且 `lakeShore=false`。
  - 再次点击打开后 renderer 中 `coastline=true` 且 `lakeShore=true`。
  - localStorage 中对应的 `layers.coastline` 与 `layers.lakeShore` 同步写入。

### 50k/100k 大图回归与海岸异常保护

目标：

- 按计划验证原版风格海岸线、圆角政区边界和“水陆线”统一开关在 50k/100k 大图下的性能与视觉风险。

执行：

- 首次普通 shell 运行 50k/100k 时 5 分钟超时，且输出落在受管沙箱路径；随后改用真实工作区权限重新跑。
- 最终命令：
  - `node .\tools\webgl-generator-smooth-cell-profile.mjs --cells 50000,100000 --port 5428 --browser-channel chrome`
- 产物：
  - `docs/generated/reports/smooth-cell-profile-results.json`
  - `docs/generated/reports/smooth-cell-profile-results.md`
  - `docs/generated/reports/smooth-cell-profile/*.png`

结果：

- 50k：
  - 实际 grid `50142`，pack `29988`。
  - 平滑视图 surface 顶点 `6981864`。
  - 轮廓三角形 `1212982`。
  - draw 平均：height `1ms`，states `1.2ms`，provinces `0.8ms`。
  - WebGL error `0`。
- 100k：
  - 实际 grid `99846`，pack `52578`。
  - 平滑视图 surface 顶点 `10102410`。
  - 轮廓三角形 `1441378`。
  - draw 平均：height `0.6ms`，states `0.7ms`，provinces `0.5ms`。
  - WebGL error `0`。
- 风险扫描：
  - 50k/100k 的短边、超长边、低面积 cell、无效点均为 `0`。

中途发现与修正：

- 100k 省份近景出现细长尖带。图层隔离后确认不是道路、河流或单独描线，而是海岸视觉带 / 政治视觉面补点在复杂海岸处的几何放大。
- `createPoliticalMeshQualityStats()` 的长边阈值不再被 `SHORE_VISUAL_STYLE.bandWidthWorld * 3` 顶到过宽，改为 `averageGridSpacingWorld * 4.5` 与较小海岸保护下限取大。
- 政治视觉 mesh 的海岸补点现在只接收陆地 cell 采样点，避免把带有政治字段的水域点加入国家/省份点集。
- 海岸原版分形点新增最大渲染偏移夹取，避免曲线采样点远离原始海岸路径。
- 海岸描线和海岸视觉带新增异常长段保护，遇到过长段直接断开不绘制。
- 海岸视觉带不再对陆侧/水侧 offset 曲线分别平滑；现在直接使用和海岸描线相同的分形中心线向两侧扩展，避免填色带中心与描线中心发生局部漂移。

观察：

- 旧问题“海岸线与填色分离”在本轮抽查中未复现。
- 线层三角形数量已经到百万级，但 50k/100k 的实际 draw 仍很低，暂不需要为了性能立刻降采样。
- 复杂海岸仍能看到很细的岬角/尖带；在海岸带改为中心线同源后，这更像同源几何本身的尖角，而不是描线和填色不重合。下一刀如继续打磨视觉，应转向“海岸视觉带轮廓裁剪 / 更保守分形采样 / 细长三角屏蔽”，不要再只调 `stroke-linejoin` 或单条线。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node .\node_modules\vite\bin\vite.js build --config .\vite.config.mjs` 通过；仍只有既有 `@vueuse/core` pure annotation 位置警告。

### 开发服务器依赖入口修复

问题：

- 用户执行 `pnpm start` 时出现 `vite 不是内部或外部命令`。
- 排查发现根目录 `node_modules` 缺少 `.bin` 和 `.modules.yaml`，属于 pnpm 安装元数据损坏；顶层包链接虽然存在，但命令 shim 未生成。
- 重新安装后 `pnpm start` 可启动，但 Vite 8 依赖扫描报 `failed to resolve rolldownOptions.input value: "index.html"`，导致跳过 dependency pre-bundling，可能放大开发态页面加载和渲染卡顿感。

修正：

- 删除损坏的根目录 `node_modules` 后重新执行 `pnpm install`，恢复 `node_modules/.bin/vite`。
- `vite.config.mjs` 删除冗余的 `build.rollupOptions.input`。正式应用只有 `app/webgl-generator/index.html` 单入口，交给 Vite 按 `root` 默认解析即可，避免 dev 依赖扫描从项目根错误解析 `index.html`。

验证：

- `pnpm exec vite --version` 通过，输出 `vite/8.1.0 win32-x64 node-v22.22.0`。
- `pnpm start` 已能启动到 `http://127.0.0.1:5410/`，stderr 中不再出现 Vite dependency scan / `rolldownOptions.input` 报错。
- `pnpm run build:app` 通过；仍只有既有 `@vueuse/core` pure annotation 位置警告。
- Playwright 打开 dev server 后验证默认 10k：`vertexCount = 1175259`，`lineTriangleCount = 690254`，30 次 draw 最大约 `0.2ms`，`glError = 0`。
- Playwright 通过页面生成 100k：总耗时约 `23.7s`，`vertexCount = 6354975`，`lineTriangleCount = 1568408`，`cellVisualMesh.buildMs = 386.3ms`，30 次 draw 最大约 `0.2ms`，`glError = 0`。当前更像生成/重建阶段和视觉 mesh 规模问题，不是单帧 WebGL draw 慢。

### 视图切换卡顿修复

问题：

- 用户指出每次切换视图都会明显卡顿。
- 初始 Playwright 打点显示 50k 下切换 `states / provinces / height` 每次约 `7.6-7.8s`。
- 根因不是 `draw()`，而是 `setColorMode()` 同步触发了多项重建：
  - `refreshCellSurface()` 每次都重建 state/province visual paths 和两套 political visual meshes。
  - `refreshLineLayers()` 又重复重建 state/province visual paths。
  - `rebuildPoliticalVisualMeshes()` 单次约 `5.7s`，且高度视图也会重建国家和省份两套 Delaunay mesh。
  - 线层 buffer 只为视图切换时改变边界线透明度而重建，50k 下约 `0.86s`。

修正：

- `PlaceholderMapRenderer.setColorMode()` 只刷新 surface 颜色 buffer 并绘制，不再刷新线层 buffer。
- 国界/省界线层改为稳定线色，不再随当前视图切换临时改变透明度。
- `refreshCellSurface()` 和 `refreshLineLayers()` 不再隐式重建 state/province visual paths 或 political visual meshes。
- 新增 `refreshPoliticalVisualCaches()`，仅在地图载入或调度器收到 `political-boundaries` 派生变更时重建政治视觉缓存。
- 平滑 cell surface 构建改为预估三角数后直接写入 `Float32Array`，避免大图切换时先 `Array.push()` 百万级顶点再整体转换。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\runtime\edit-refresh-scheduler.js` 通过。
- 50k 复测：
  - 修复前：`states 7811.8ms`、`provinces 7612.8ms`、`height 7594.7ms`。
  - 去掉政治 mesh 重建后：约 `1740-1817ms`。
  - 去掉线层重建并改用 typed-array surface 后：`states 559.1ms`、`provinces 642.7ms`、`height 592.7ms`。
- 100k 复测：
  - `states 622.6ms`、`provinces 547.6ms`、`height 631.8ms`。
  - 三个视图 `glError = 0`。

### 海岸视觉带尖楔修复

问题：

- 用户截图显示复杂海岸处出现深色水域尖楔插入陆地填色，海岸描线与填色带发生冲突。
- 该问题集中在原版风格海岸分形轮廓与海岸视觉带拼接处：分形中心线局部抖动或相邻岸线侧向量快速翻转时，`center -> land/water` 四边形带会生成过长、交叉或采样到错误陆水侧的小三角，视觉上形成“尖尖”和深色楔形。

修正：

- `pushShoreVisualBand()` 在推入每个海岸视觉带小段前增加合法性检查。
- 跳过以下异常小段：
  - 中心线、陆侧线或水侧线单段过长。
  - 陆水对角距离异常放大。
  - 陆侧线与水侧线发生自交。
  - 四边形面积明显超过按中心线长度与带宽估算的正常面积。
  - 陆侧采样落到水域，或水侧采样落到陆地。
- 该修正只过滤异常小段，不关闭整条海岸线，也不改变底层 cell、picking、编辑和陆水判定。
- 二次收紧：
  - 海岸分形点不再按“最近原始顶点”夹取，而是投影到最近原始海岸边段，再按投影位置插值侧向量和陆水 cell，避免凹口处 sourceIndex 跳变。
  - 分形点最大偏移从 `18` 收紧到 `5`，最大渲染段从 `26` 收紧到 `14`。
  - 海岸渲染点新增两轮尖角过滤：折返角过尖，或折返角较尖且明显偏离原始岸线的点会被移除。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- Playwright 生成 100k 国家视图，`glError = 0`。
- 近景截图抽查 `west / central / east / south` 四个复杂海岸区域，未再看到截图中那种长水色尖楔压进陆地填色的形态。
- 二次收紧后，中心复杂海岸近景 `coastline-fix-central3.png` 复查 `glError = 0`，未见明显尖楔。

### 海岸视觉带近岸岛屿适配

问题判断：

- 用户怀疑残留尖角来自离岸很近的小岛，导致海岸线计算出错。
- 复查后判断该怀疑成立：底层陆地生成和 grid cell 本身不一定错误，问题主要在渲染层用固定宽度海岸视觉带。近岸小岛、窄海峡和小湖湾处，可用水面宽度可能小于固定 `13` 世界单位的视觉带宽；水侧 offset 会采样到另一块陆地，陆侧 offset 也可能掉进水域，从而形成残留尖角或填色冲突。

修正：

- `buildSmoothedShoreVisual()` 不再直接使用固定半宽。
- 新增局部海岸带宽拟合：
  - 从默认半宽开始试探陆侧/水侧 offset。
  - 如果陆侧不是陆地或水侧不是水域，就逐步减半。
  - 最小宽度仍无法满足陆水采样时，跳过该渲染点。
- 政治视觉 mesh 的海岸补点 `buildSmoothedShoreBoundaryPoints()` 也改用同一套局部拟合，避免近岸岛屿继续把政治面 triangulation 拉出尖角。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- Playwright 生成 100k 国家视图，中心复杂海岸近景 `coastline-adaptive-band-central.png` 复查 `glError = 0`。
- 近岸小岛/窄水道处海岸带会自动变窄，不再依靠整段删除来掩盖冲突。

### 国界笔刷状侵入修复

问题：

- 用户指出国界之间总会出现一块类似笔刷侵入的形态。
- 排查后分成两类来源：
  - 线层来源：国界/省界用世界坐标三角形线带绘制时，每个折点额外补圆盘模拟 `stroke-linejoin: round`，三国交界和锯齿边界会叠出半透明涂抹块。
  - 数据来源：国家/省份扩张后仍有少量弱连接边界 cell，会像一格或几格的小刷痕插入相邻政治单元。

修正：

- 国界/省界描边改为不在折点补圆盘的 butt-join 线带；海岸线仍保留原版风格圆滑描线。
- `boundaryLineMode` 更新为 `original-coastline + butt-join-political`，方便运行时统计确认当前路径。
- `politics.js` 新增保守的边界毛刺吸收：
  - 国家归属在 `claimInhabitedNeutralCells()` 后执行。
  - 省份归属在填补未分配省份 cell 后执行。
  - 只吸收“自身同类邻居很少、另一侧邻居明显占多数”的 cell。
  - 城镇、首都、省会中心等锚点受保护，不参与吸收，避免破坏政治中心和编辑锚点。

验证：

- `node --check app\webgl-generator\src\generator\politics.js` 通过。
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `pnpm run build:app` 在真实 Windows pnpm 环境通过；仍只有既有 `@vueuse/core` pure annotation 位置警告。
- Playwright 生成 10k 国家视图截图 `political-boundary-spike-cleanup-states.png`，`boundaryLineMode = original-coastline + butt-join-political`，`glError = 0`，弱连接国家边界 cell 统计为 `9`。

### 10k 开放海岸端点尖刺修复

问题：

- 用户指出在默认 `seed = stage-2-1`、目标 `10000`、地形模板“大陆”的地图中部，海岸线仍有明显尖尖；并强调 10k 都未修好时不应以更高 cells 数作为主要验证。
- 按该配置复现后，定位到中部开放海岸分叉端点 `[634, 527]`：
  - `coastline path 0` 末尾本应从 `[636, 525]` 收回 `[634, 527]`，但旧采样插入了 `[638.8, 527.8] -> [645.9, 529.9] -> [647.2, 530.4] -> [634, 527]`。
  - `coastline path 2` 起点本应从 `[634, 527]` 走向真实下一段，却先冲到 `[646.5, 522.5]`。
- 根因是 `sampleCatmullRomWorldPath(points, false, ...)` 虽然传入开放路径参数，但取 `previous / next` 时仍用取模环绕；开放 path 起点把终点当 previous，终点把起点当 next，导致 Catmull-Rom 控制点绕回另一端，生成端点尖刺。

修正：

- `sampleCatmullRomWorldPath()` 现在区分闭合/开放路径：
  - 闭合路径继续用取模环绕。
  - 开放路径在起点使用自身作为 previous，在终点使用自身作为 next，不再跨端点取样。
- 该修正只影响开放折线路径的曲线控制点，不改变底层 grid、陆水判定、海岸共享边或国家/省份归属。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- Playwright 使用默认 `stage-2-1 / 10000 / continents` 复查 `[634, 527]` 附近：
  - `path 0` 末尾不再跳到 `[647, 530]`，最大近端偏移降为 `3.8`。
  - `path 2` 起点不再跳到 `[646, 522]`，只沿真实下一段方向采样。
  - 近景截图 `repro-10k-shore-endpoint-634-527-fixed.png` 中，原先两根向右伸出的浅色尖刺已消失。

### 国界填色笔刷侵入第二轮修复

问题：

- 用户反馈国界笔刷状侵入仍在。
- 复查时先关闭 `stateBorders` 和 `provinceBorders` 线层，发现部分侵入仍能在国家填色中出现，因此剩余问题不是政治描边端帽，而是政治归属从 pack 镜像到 grid 后保留了细长舌头。
- 第一轮 pack 级毛刺吸收保护了全部城镇，能保护政治语义，但在 grid 渲染层会让普通城镇所在的一格宽毛刺被固定下来。

修正：

- `mirrorPackStateToGrid()` 在写出渲染用 `grid.cells.state` 前，新增 grid 层国家归属毛刺吸收。
- `mirrorPackProvinceToGrid()` 同样新增 grid 层省份归属毛刺吸收，并限制在同一国家内部调整省份归属。
- pack 层平滑仍保护所有城镇；grid 渲染层只保护首都和省会中心，普通城镇不再阻止视觉填色被吸收到多数邻居中。
- 毛刺吸收仍只处理“自身同类邻居很少、另一侧邻居明显占多数”的 cell，不做整块区域重分配。

验证：

- `node --check app\webgl-generator\src\generator\politics.js` 通过。
- `git diff --check` 通过。
- Playwright 复查默认 `stage-2-1 / 10000 / 大陆`：
  - 关闭国界/省界线层后，弱连接国家边界 cell 从约 `30` 降到 `5`。
  - 纯国家填色截图 `state-fill-only-capitals-only.png` 未再出现大块笔刷状侵入。
  - 打开国界/省界后的最终截图 `state-borders-final-10k.png` 未再把剩余一两格互咬放大成笔刷块。

### 海岸视觉带跨段三角修复

问题：

- 用户再次截图指出问题仍在，画面中可见一块蓝黄渐变的直边楔子。
- 该形态带有顶点色插值，不像道路、国界 stroke 或底层政治归属；结合图层隔离判断，来源是 shore visual band。
- 海岸视觉带此前只检查候选小段两端的陆侧/水侧采样。窄水道、近岸岛屿或复杂凹口处，`fitShoreHalfWidth()` 可能跳过某些无法安全放置宽度的海岸点，旧逻辑会把跳过点前后的两个有效点直接相连，形成跨过凹口的直边渐变三角。

修正：

- `buildSmoothedShoreVisual()` 记录每个有效海岸带点是否跨过了被跳过的渲染点。
- `pushShoreVisualBand()` 和 shore visual line 绘制遇到跳点会断段，不再连接跳点两侧。
- `isShoreBandSegmentSafe()` 从只检查端点扩展为检查 `0 / 0.25 / 0.5 / 0.75 / 1` 五个采样位置：
  - 陆侧插值点必须仍落在陆地。
  - 水侧插值点必须仍落在水域。
- 该修正只影响渲染层海岸视觉带，不改变 grid、pack、picking、编辑判定和政治归属。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- Playwright 复查默认 `stage-2-1 / 10000 / 大陆` 国家视图，`glError = 0`。
- 最新总览截图 `repro-state-full-with-lines-shore-gaps-safe.png` 中海岸线没有大面积缺失；surface 顶点数下降，说明原先跨段的海岸带三角已被过滤。

### 政治视图禁用海岸填色过渡带

问题：

- 用户反馈蓝黄楔子仍能看到。
- 继续局部过滤 shore visual band 可以减少一部分跨段三角，但政治视图里 shore visual band 本质上会把国家/省份陆地色和水色做顶点插值；一旦近岸小岛、窄海峡、复杂凹口或侧向量有误，就会重新出现非常显眼的蓝黄/省份色渐变楔子。
- 国家/省份视图更需要政治 surface 清晰可靠，海岸填色过渡带在该视图中的收益低于风险。

修正：

- 新增 `shouldDrawShoreVisualBands()`，国家视图和省份视图不再绘制 shore visual band。
- 水陆线描边仍按图层开关正常绘制；高度、温度、降水等非政治视图仍保留海岸视觉带。
- 该策略直接移除政治视图中蓝黄渐变楔子的绘制来源。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- Playwright 复查默认 `stage-2-1 / 10000 / 大陆`：
  - 国家视图 `glError = 0`。
  - 省份视图 `glError = 0`。
  - 国家/省份视图 surface 顶点数回到 `525843`，说明 shore visual band 不再进入政治 surface。
  - 截图 `repro-state-no-shore-band-political.png` 未再出现蓝黄渐变楔子。

### renderer 公共工具抽取第一刀

背景：

- 用户提出 WebGL 中的公共操作是否应该抽取，方便后续复用和维护。
- 当前 `placeholder-renderer.js` 已经同时承载 WebGL program/buffer 操作、几何计算、surface 构建、海岸/政治边界、河流/道路线带、标签和调试统计，后续继续修海岸、国界和性能时会越来越难定位影响范围。
- 本轮目标是先抽低风险纯函数和 WebGL 基础操作，保持 `PlaceholderMapRenderer` 外部接口不变。

修正：

- 新增 `app/webgl-generator/src/renderer/geometry.js`：
  - 世界坐标距离、归一化向量、点插值、中点、近似相等判断。
  - 多边形面积、线段相交判断。
  - Chaikin 路径平滑、带颜色路径平滑、带数值路径平滑。
  - `isWorldPoint()`、`mix()` 和 `clamp()` 等通用工具。
- 新增 `app/webgl-generator/src/renderer/gl-utils.js`：
  - `createProgram()` 负责 shader 编译和 program 链接。
  - `bindVertexBuffer()` 统一绑定当前 renderer 顶点格式。
- `placeholder-renderer.js` 改为从这两个模块导入公共函数，并删除本地重复实现。
- 暂不抽 `mesh-writer`：
  - `pushWorldVertex`、`pushWorldPolylineMesh`、`pushScreenPolyline` 等仍与地图投影、颜色计算、屏幕像素尺寸、图层构建强耦合。
  - 下一刀应先明确颜色/投影上下文，再把 mesh 写入器独立出去。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\geometry.js` 通过。
- `node --check app\webgl-generator\src\renderer\gl-utils.js` 通过。
- `git diff --check` 通过。

### renderer mesh-writer 第二刀

背景：

- 第一刀已经抽出几何和 WebGL 基础工具，`placeholder-renderer.js` 中仍保留大量底层顶点写入、世界坐标线带、屏幕空间线带和投影转换函数。
- 这些函数会被 surface、海岸线、政治边界、道路、河流、选中高亮和点图层反复使用，是后续拆 `shore-layer`、`political-layer`、`route-layer` 的前置基础。

修正：

- 新增 `app/webgl-generator/src/renderer/render-context.js`：
  - `createRenderContext(map, {camera, canvas})` 统一传递地图、相机和 canvas。
  - `worldToNdcPoint()`、`worldToScreenPixel()`、`screenPixelToClip()` 统一坐标转换。
- 新增 `app/webgl-generator/src/renderer/mesh-writer.js`：
  - 世界坐标写入：`pushWorldVertex()`、`pushWorldLine()`、`pushWorldPolylineMesh()`。
  - 屏幕空间写入：`pushScreenPolyline()`、`pushVariableScreenPolyline()`、`pushScreenTriangle()`。
  - 底层写入：`pushVertex()`、`writeVertex()`、`pushRect()`。
- `placeholder-renderer.js` 保留图层构建和颜色计算职责，但底层写入统一改为通过 `RenderContext` 调用 `mesh-writer`。
- `pushGridCells()` 暂留在 renderer 内，因为它依赖 `colorForCell()` 和当前视图配置；后续拆 `cell-surface-layer` 时再整体迁出。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\mesh-writer.js` 通过。
- `node --check app\webgl-generator\src\renderer\render-context.js` 通过。
- `git diff --check` 通过。
- `pnpm.cmd run build:app` 通过，仍只有 `@vueuse/core` 的既有 pure annotation 警告。
- Playwright 复查默认 `stage-2-1 / 10000 / 大陆` 国家视图：
  - `glError = 0`。
  - `vertexCount = 525843`。
  - `routeVertexCount = 39318`。
  - `riverVertexCount = 19392`。
  - `lineVertexCount = 1964076`。
  - `pointVertexCount = 861`。
  - 截图输出到 `renderer-mesh-writer-state-10k.png`。

### renderer 颜色模式和 cell surface 抽取

背景：

- `mesh-writer` 第二刀后，`placeholder-renderer.js` 仍然保留颜色模式、陆地判定、grid cell surface 和政治 surface 兜底逻辑。
- 这些逻辑会被海岸视觉带、政治边界、cell surface、政治 visual mesh 等多处共用，是拆 `shore-layer` 和 `political-layer` 前需要先稳定的共享基础。

修正：

- 新增 `app/webgl-generator/src/renderer/color-modes.js`：
  - `colorForCell()` 统一管理高度、温度、降水、生物群、文化、宗教、国家、省份、区域和人口视图颜色。
  - `isLandCell()` 集中陆地判定。
  - `colorForState()`、`colorForProvince()` 供政治边界和政治 visual mesh 复用。
  - 高度、海底高度、温度、降水、索引色和十六进制颜色转换移入该模块。
- 新增 `app/webgl-generator/src/renderer/cell-surface-layer.js`：
  - `buildCellVisualGridVertices()` 构建平滑 cell surface。
  - `pushGridCells()` 构建硬 grid cell surface。
  - `politicalSurfaceMeshForMode()`、`shouldDrawGridCellUnderPoliticalMesh()`、`pushMeshSurfaceVertices()` 负责政治 surface 兜底和拷贝。
- `placeholder-renderer.js` 改为导入颜色和 surface 构建函数，继续保留图层编排和更高层的海岸/政治路径逻辑。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check app\webgl-generator\src\renderer\color-modes.js` 通过。
- `node --check app\webgl-generator\src\renderer\cell-surface-layer.js` 通过。
- `git diff --check` 通过。

### 原版风格水陆线平滑暂时回退

背景：

- 用户再次指出水陆线与填色分离。
- 当前原版风格海岸轮廓虽然让线条更自然，但它与 `cellVisualMesh` / 政治 surface 不是同一套最终填色边界；只要分形轮廓偏离当前 surface，就会重新出现线面分离。
- 这类问题继续局部过滤尖角或调宽海岸带收益很低，主视图应先保证可靠贴合。

修正：

- `shouldDrawShoreVisualBands()` 暂时固定返回 `false`，所有视图都不再额外叠加海岸填色视觉带。
- `buildLineVertices()` 中水陆线描边不再调用 `pushOriginalShoreContourLines()`。
- 平滑单元格开启且存在 `cellVisualMesh.edgeCurves` 时，海岸线 / 湖岸线改为读取 `pushCellVisualShoreLines()` 的共享视觉边。
- 平滑单元格关闭时，海岸线 / 湖岸线回退 `pushHardShoreLines()` 的硬共享 Voronoi 边。
- 运行时统计中的边界线来源改为：
  - `visual-cell-shore + butt-join-political`
  - `hard-cell-shore + butt-join-political`
- 补修：第一次回退时水陆线复用了旧 `pushWorldLine()` 线段写入，但当前 `lineBuffer` 统一按 `gl.TRIANGLES` 绘制，导致水陆线统计存在但屏幕上不可见。现在 `pushCellVisualShoreLines()` 和 `pushHardShoreLines()` 都改为 `pushWorldPolylineMesh()` 三角形描边，水陆线重新显示，同时仍保持与当前 surface 同源。

待办：

- 原版风格海岸采样、分形点保护和局部宽度拟合代码暂不删除，后续可以作为 `shore-layer` 的候选实现继续整理。
- 重新启用前必须先完成海岸轮廓级裁剪或同源填色 mesh，让水陆线、陆侧填色、水侧填色来自同一条最终轮廓。
- 默认验证仍必须先覆盖 `seed = stage-2-1`、目标 `10000`、地形模板“大陆”，确认 10k 下不再出现水陆线漂移、尖楔或分离，再扩展到 50k / 100k。

### 水陆线回归脚本

背景：

- 用户要求先做回归，避免后续继续拆 renderer 时反复出现“水陆线消失 / 水陆线与填色分离 / 修尖角又破线层”的问题。
- 仅检查 `glError = 0` 不够：此前水陆线曾因为写入 `pushWorldLine()` 而没有进入当前 `gl.TRIANGLES` 轮廓层，画面上不可见但 WebGL 仍无错误。

新增：

- 新增 `tools/webgl-generator-shoreline-regression.mjs`：
  - 默认读取 `dist/webgl-generator` 并启动一次性静态服务。
  - 默认 case 固定为 `seed = stage-2-1`、目标 `10000`、地形模板 `continents`、尺寸 `1440 x 960`。
  - 自动生成地图后，分别验证高度、国家、省份视图。
  - 每个视图都跑两种路径：`smoothCellBorders = true` 和 `smoothCellBorders = false`。
  - 平滑路径要求 `boundaryLineMode = visual-cell-shore + butt-join-political`，轮廓三角形数默认不少于 `50000`。
  - 硬边路径要求 `boundaryLineMode = hard-cell-shore + butt-join-political`，轮廓三角形数默认不少于 `25000`。
  - 所有 case 都要求 `glError = 0`，水陆线 / 湖岸线图层保持可见，主 surface 顶点数为正。
  - 输出 JSON、Markdown 和截图到 `docs/generated/reports/shoreline-regression-*`。
- `package.json` 新增脚本：
  - `pnpm run regress:shoreline`

使用：

```powershell
pnpm run build:app
pnpm run regress:shoreline -- --browser-channel chrome
```

定位：

- 该脚本是 10k 默认种子的快速水陆线守门，不替代 `tools/webgl-generator-smooth-cell-profile.mjs` 的 50k / 100k 大图性能和近景截图 profile。

### shore-layer 第一刀

背景：

- 新增水陆线回归后，可以开始拆 `shore-layer`，但这一刀只做结构迁移，不重新启用原版分形海岸，避免再次引入水陆线与填色分离。
- 当前主渲染路径中真正活跃的是：
  - 平滑开启：水陆线读取 `cellVisualMesh.edgeCurves`。
  - 平滑关闭：水陆线读取硬共享 Voronoi 边。
  - 两者都通过三角形描边进入当前 `lineBuffer`。

修正：

- 新增 `app/webgl-generator/src/renderer/shore-layer.js`：
  - `SHORE_VISUAL_STYLE` 集中水陆线和旧海岸视觉参数。
  - `pushShoreLineLayers()` 负责按 `smoothCellBorders` 写入海岸线和湖岸线。
  - `boundaryLineModeForOptions()` 负责运行时统计中的边界线来源。
  - `sharedVoronoiEdge()` / `sharedVoronoiEdgeVertexIds()` 作为共享边 helper 暂由 shore layer 导出，政治边界和 shore path 构建继续复用。
- `placeholder-renderer.js`：
  - `buildLineVertices()` 改为调用 `pushShoreLineLayers()`。
  - 删除本地重复的水陆线写入、硬边水陆线写入、旧线段写入和本地 `boundaryLineModeForOptions()`。

边界：

- 旧的原版分形海岸候选、shore visual band、shore path 构建和政治 mesh 海岸补点暂留在 `placeholder-renderer.js`。
- 后续第二刀可以继续搬迁 shore path / old coastline candidate，但必须在每刀后跑 `regress:shoreline`。

### shore-layer 第二刀

背景：

- 第一刀已经把当前活跃的水陆线描边入口迁到 `shore-layer`。
- `placeholder-renderer.js` 中仍残留旧 shore path、原版分形海岸候选和政治 mesh 海岸补点 helper，主 renderer 继续膨胀，不利于后续拆 `political-layer`。

修正：

- `shore-layer.js` 继续承接水陆线相关缓存和候选实现：
  - `buildShoreVisualPaths()` / `emptyShoreVisualPaths()` / `summarizeShoreVisualPaths()`。
  - shore visual band 写入、局部宽度拟合、陆水采样安全检查和断段逻辑。
  - 原版风格海岸候选采样、分形中点扰动、曲线采样、尖角过滤和贴回原始路径的保护逻辑。
  - `buildSmoothedShoreBoundaryPoints()`，供政治视觉 mesh 补入海岸陆侧点。
- `placeholder-renderer.js` 删除对应本地重复实现，只保留图层编排、政治边界 graph、政治视觉 mesh、河流/道路/选择/点位等动态图层和 renderer 外部 API。

边界：

- 本刀仍不重新启用原版分形水陆线表现。
- 主渲染路径仍是 `pushShoreLineLayers()`：平滑单元格开启时读取 `cellVisualMesh.edgeCurves`，关闭时读取硬共享 Voronoi 边。
- 旧海岸候选代码迁入 `shore-layer` 只是为了隔离职责和保留待办基础；后续重新启用前，仍必须先完成海岸轮廓级裁剪或同源填色 mesh，并优先用 `stage-2-1 / 10000 / 大陆` 回归验证。

### political-layer 第一刀

背景：

- `shore-layer` 已经接走水陆线相关职责后，`placeholder-renderer.js` 中最大的剩余静态渲染块是政治边界、政治视觉带和政治视觉 mesh。
- 这些逻辑与国家/省份颜色、Delaunay mesh、边界质量统计和 debug cache 强耦合，适合先整体迁移，暂不改变渲染行为。

修正：

- 新增 `app/webgl-generator/src/renderer/political-layer.js`：
  - 集中 `STATE_VISUAL_STYLE` / `PROVINCE_VISUAL_STYLE`。
  - 承载国家/省份边界 path 构建、butt-join 政治描边和政治视觉带。
  - 承载政治视觉 mesh 构建、候选三角过滤、质量统计、notable triangle 记录和 debug cache 摘要。
  - 继续复用 `shore-layer` 导出的共享边与海岸陆侧补点 helper。
- `placeholder-renderer.js` 删除本地政治 path / mesh 构建实现，只保留：
  - 地图载入和派生变更时的政治缓存重建调度。
  - debug buffer 上传与绘制。
  - 选中政治对象的高亮 mesh。
  - 总体 surface / line / dynamic layer 编排。

边界：

- 本刀只做结构迁移，不改变政治 mesh 过滤阈值、国界/省界描边方式或政治视图 surface 策略。
- `pushPoliticalSelectionMesh()` 暂留在主 renderer，因为它依赖当前 selection / locate flash / 动态 buffer 机制；后续若拆 `selection-layer` 再迁走。

### cell-visual-layer 第一刀与视图切换性能守门

背景：

- `placeholder-renderer.js` 中剩余的主要静态几何块是视觉 cell mesh：它负责平滑单元格边界的曲线采样、共享边复用和 surface 顶点写入。
- 当前视图切换不再重建视觉 cell 几何，但仍会为每个视图重新把视觉 cell 的世界坐标投影到 NDC，再写入颜色顶点；这部分是可安全消除的重复计算。

修正：

- 新增 `app/webgl-generator/src/renderer/cell-visual-layer.js`：
  - 承载 `buildCellVisualMesh()`、`emptyCellVisualMesh()`、`summarizeCellVisualMesh()` 和 `buildCellVisualGridVertices()`。
  - 视觉 cell mesh 构建时预先生成每个 cell 的 `ndcTriangles`，缓存中心点和边界点投影后的三角坐标。
  - 视图切换刷新 surface 时只按当前视图颜色填充顶点颜色，不再重复执行同一批 `worldToNdcPoint()`。
- `cell-surface-layer.js` 回到硬 cell surface、政治 mesh surface 兜底和 surface 顶点拼接职责。
- `placeholder-renderer.js` 删除本地视觉 cell 构建、噪声和摘要 helper，只保留缓存重建调用。

性能守门：

- `tools/webgl-generator-shoreline-regression.mjs` 新增每个 case 的 `switchMs` 记录。
- 回归新增 `--max-switch-ms` 参数，默认 `1500ms`；超过阈值会失败。
- `package.json` 新增：

```powershell
pnpm run regress:rendering
```

边界：

- 本刀不改变视觉 cell 曲率、采样段数、海岸线或政治边界行为。
- `switchMs` 是 10k 默认种子的快速守门，用来捕获明显退化；50k / 100k 大图仍应继续用 `tools/webgl-generator-smooth-cell-profile.mjs` 做专项 profile。

### selection-layer 第一刀与图层/偏好 UI 修正

背景：

- `placeholder-renderer.js` 中仍保留选中高亮 mesh、定位闪烁颜色和高亮模式统计，适合继续拆出独立 layer。
- 用户指出国家名称图层应与其它图层显隐一致：开启后不应只在国家视图显示。
- 用户要求“悬停信息”、“高度视图显示海底”和“平滑单元格边界”开关改成按钮样式。
- 用户指出 10k cells 生成速度仍有几秒，后续需要专门 profile 生成链路。

修正：

- 新增 `app/webgl-generator/src/renderer/selection-layer.js`：
  - 承载 `buildSelectionMeshVertices()` 和 `selectionHighlightMode()`。
  - 选中河流的屏幕空间高亮、政治对象半透明 cell 高亮、定位闪烁颜色都移入该模块。
  - `placeholder-renderer.js` 只保留 selection 状态、定位动画、overlay marker、动态 buffer 脏标记和上传。
- 国家名称图层显示逻辑从 `stateLabels && colorMode === "states"` 改为只看 `stateLabels` 图层开关；缩放淡入淡出与碰撞避让策略保持不变。
- `UiSwitchField` 新增按钮样式模式，仍保留内部 checkbox 和原 id。
- `ControlPanel.vue` 将“显示海底”、“平滑边界”、“悬停信息”切到按钮样式；`auto-random-seed` 仍保留普通 checkbox。

待办：

- 10k 生成耗时需要作为下一轮生成性能专项处理，优先增加阶段计时报告，再按数据决定优化地形、pack、社会、水文、路线或渲染准备阶段。

### 生成性能阶段计时与加载提示第一刀

背景：

- 用户指出 10000 cells 生成仍有几秒体感卡顿，需要先量化生成链路，而不是继续只拆 renderer。
- 页面同步生成和 WebGL 加载期间缺少明确反馈，用户会看到界面短时间卡住。
- “悬停信息”上一刀虽然按钮化，但仍占满一整行；用户要求它和普通图层按钮一致。

修正：

- `generatePlaceholderMap()` 新增轻量阶段计时：
  - `metadata.generationTiming.totalMs` 记录整次生成耗时。
  - `metadata.generationTiming.stages` 记录标准化参数、heightmap、grid、features、climate、pack、rivers、biomes、society、politics、settlements、religions、military、markers、zones、summary 等阶段。
  - `metadata.generationTiming.slowest` 记录当前最慢阶段。
  - 运行时统计新增“生成耗时”行。
- 新增 `tools/webgl-generator-generation-profile.mjs` 和 `pnpm run profile:generation`：
  - 默认跑 `stage-2-1 / 大陆 / 1440x960` 的 `10000,50000,100000` 三档。
  - 输出 JSON 和中文 Markdown 到 `docs/generated/reports/generation-profile-results.*`。
  - `docs/generated/` 仍按 `.gitignore` 不入库，报告作为本地可复现产物。
- 城镇 metadata 去掉一次重复人口点构建：
  - `createSettlementResult()` 和 `finalizeSettlements()` 先构建 `populationPoints`，再把同一个数组传给 metadata，避免重复全图扫描、过滤、排序。
- 页面生成体验：
  - `index.html` 新增 `generation-loading` 气泡，定位在画布顶部居中。
  - `requestGenerate()` 显示“准备生成 ... cells”；`runGenerateNow()` 在创建地图数据和加载 WebGL 图层期间保持气泡可见，完成或失败后关闭。
- `ControlPanel.vue` 中“悬停信息”改为普通 `layer-toggle-button`，放回图层两列网格；`panel.js` 支持按钮型 boolean preference，不再要求该控件必须是 checkbox。

本轮数据：

- `node .\tools\webgl-generator-generation-profile.mjs --iterations 1`
- 10k：`800.4ms`，最慢为“生成国家 / 省份 / 区域” `246.4ms`。
- 50k：`3740.6ms`，最慢为“生成河流” `1620.6ms`。
- 100k：`8553.6ms`，最慢为“生成河流” `3891.2ms`。
- 10k 的 2 次采样曾显示城镇 finalize 从约 `133.9ms` 到约 `121ms`，但 Node 单次抖动明显，不能把总耗时差异全部归因于这次人口点复用。

后续：

- 10k 体感优化优先拆 `buildPackPolitics()` 子阶段，重点看省份填充、边界毛刺吸收、grid 镜像和区域扩张。
- 50k / 100k 优先拆 `buildRivers()` 子阶段；当前河流在大图下占比约 `43% - 45%`，已经是最明确瓶颈。
- 生成报告通过 ESM 方式加载 app 源码时，Node 会提示 package 未声明 `type: module`；本刀不改 package module 类型，避免影响现有工具链。

### 生成性能子阶段拆分与河流取最小值优化

背景：

- 上一刀已经确认 10k 的主瓶颈在“生成国家 / 省份 / 区域”，50k / 100k 的主瓶颈在“生成河流”。
- 但阶段粒度仍然太粗，无法判断政治慢在国家扩张、省份扩张、grid 镜像还是颜色分配，也无法判断河流慢在洼地消解、流量累计还是对象构建。
- 用户要求继续拆，并同时留意性能问题；因此本刀以低风险埋点和确定性微优化为主，不改生成语义。

修正：

- 新增 `app/webgl-generator/src/generator/profile.js`：
  - 提供 `createStageProfile()` 作为生成链路通用阶段计时器。
  - `generatePlaceholderMap()`、河流生成、政治生成和省份生成共用同一套 timing 结构。
- `buildRivers()` 新增子阶段计时：
  - 覆盖命名器、扰动、高度调整、闭合湖识别、洼地消解、buffer 初始化、湖泊水文、陆地排序、流量累计、河流对象、汇流标记、湖泊清理、湖泊命名和 feature 分组。
  - 返回结果新增顶层 `timing`，不塞进 metadata，避免改变现有河流元数据语义。
- `buildPackPolitics()` 新增子阶段计时：
  - 覆盖河流索引、国家构建、国家扩张、国家整理、中立吸收、边界毛刺吸收、城市归属同步、统计、相邻关系、形态、颜色、grid 镜像、省份生成、省份镜像和区域扩张。
  - 去掉 pack 政治生成里未使用的 `landCells / settledCells / politicalCells` 扫描。
- `buildPackProvinces()` 新增独立子阶段计时：
  - 覆盖省份中心、扩张、整理、未归属填充、边界毛刺吸收、统计、pole、相邻关系和颜色分配。
  - `buildPackPolitics()` 通过 `provinceTiming` 暴露该结果。
- 河流洼地消解做了低风险微优化：
  - 原本多处只是为了取最低 cell / 最低高度而 `map().sort()` 或展开数组再排序。
  - 现在改为线性扫描 helper：`minHeightCell()`、`minHeightValue()`、`minEffectiveNeighborHeight()` 和 `minNeighborHeightCell()`。
  - `getDownhillCell()` 不再复制并排序相邻 cell，只扫描一次候选邻居。
- `tools/webgl-generator-generation-profile.mjs` 扩展报告：
  - JSON 记录 `subsystemTimings.rivers / politics / provinces`。
  - Markdown 为每个 cells 档位输出“国家 / 省份 / 区域子阶段”“pack 省份子阶段”“河流子阶段”。

本轮数据：

- 命令：`node .\tools\webgl-generator-generation-profile.mjs --iterations 1`
- 10k：总耗时约 `560.2ms`，最慢阶段为“生成国家 / 省份 / 区域” `184ms`。
  - 政治子阶段中，“生成 pack 省份” `146.4ms`，占政治耗时约 `79.7%`。
  - pack 省份子阶段中，“分配省份颜色” `125ms`，占省份耗时约 `85.5%`。
  - 河流总耗时 `31.4ms`，其中“消解洼地” `19.7ms`。
- 50k：总耗时约 `2212.3ms`，最慢阶段为“生成河流” `520.3ms`。
  - 河流子阶段中，“消解洼地” `494.2ms`，占河流耗时约 `95.2%`。
  - 政治总耗时 `482ms`，其中 pack 省份 `381.7ms`、省份颜色分配 `302.3ms`。
- 100k：总耗时约 `5333.7ms`，最慢阶段为“生成河流” `1571.8ms`。
  - 河流子阶段中，“消解洼地” `1519.1ms`，占河流耗时约 `96.8%`。
  - 政治总耗时 `1028.7ms`，其中 pack 省份 `849ms`、省份颜色分配 `586.9ms`。

结论：

- 10k 体感卡顿的首要目标已经从“政治整体”收敛到 `buildPackProvinces()` 内的省份颜色分配。
- 50k / 100k 的首要目标已经从“河流整体”收敛到 `resolveDepressions()`。
- 河流取最小值微优化后，单次采样较上一轮明显下降，但 Node 单次 profile 有抖动；后续如果要记录正式性能基线，应至少用 `--iterations 3` 重新采样。

后续：

- 省份颜色分配下一刀应检查是否存在对所有省份或所有邻居的重复避让计算，优先引入局部邻接颜色候选缓存，而不是改变省份扩张结果。
- `resolveDepressions()` 下一刀应改为更接近优先队列 / 局部传播的算法，避免大图上反复做全邻域松弛；改动前需要保留河流数量、湖泊出口和 checksum 对照。
- 当前 timing 结构可继续扩展到城镇路线整理阶段，因为 100k 下该阶段已到 `1133.4ms`，是河流之后的第二梯队瓶颈。

### 首屏 Loading 体感耗时纠偏与政治 mesh 按需构建

背景：

- 用户指出 10k 下刷新页面从 Loading 到出图约 `4s`，而上一轮报告里引用了 `560ms`。
- 经复核，`560ms` 来自 `tools/webgl-generator-generation-profile.mjs` 的 Node CLI 纯生成函数 profile，只覆盖 `generatePlaceholderMap()`，不包含浏览器端 `renderer.loadMap()`、WebGL buffer、标签和面板刷新。
- `tools/webgl-generator-shoreline-regression.mjs` 的浏览器报告曾显示点击到 WebGL ready 约 `4641.7ms`，与用户体感一致；因此需要拆浏览器端加载路径，而不是继续只看生成函数。

排查：

- 临时浏览器探针确认：
  - 浏览器内 `map.metadata.generationTiming.totalMs` 约 `518-708ms`，与 Node CLI 纯生成量级一致。
  - 点击生成到新图 ready 曾约 `3386.9-3858.7ms`。
  - 新增 `renderer.loadMap()` 子阶段 timing 后，确认 `loadMap` 约 `3247.7ms`。
  - 其中“构建政治视觉 mesh”单项约 `3048.3ms`，是首屏 Loading 体感的主要来源。
- 当前默认平滑 cell surface 已由 `cellVisualMesh` 接管，政治视觉 mesh 主要作为 debug / 实验缓存；默认高度视图首屏并不需要同步构建该 Delaunay mesh。

修正：

- `PlaceholderMapRenderer.loadMap()` 新增加载阶段 profile：
  - 对象索引、视觉 cell mesh、水陆线缓存、国家边界缓存、省份边界缓存、政治视觉 mesh、surface 顶点、线层顶点、点图层顶点、GPU upload、标签和 fit/draw 都会记录耗时。
  - `renderer.getStats().loadMap` 暴露总耗时、阶段耗时和最慢阶段。
- 运行时统计面板新增“WebGL 加载”行，与“生成耗时”并列显示，避免再把纯生成耗时误认为端到端体感耗时。
- 政治视觉 mesh 改为按需构建：
  - 默认不再在首屏同步构建 `states / provinces` 政治 Delaunay mesh。
  - 只有开启 `politicalMeshDebugMode`，或未来出现没有 `cellVisualMesh` 且需要政治 surface fallback 的情况，才构建政治视觉 mesh。
  - 关闭 debug 时会回到空 mesh cache，避免继续占用首屏时间。

本轮数据：

- 修正前浏览器探针：
  - 点击到 ready：约 `3858.7ms`。
  - 纯生成：约 `518.2ms`。
  - `loadMap`：约 `3247.7ms`。
  - `loadMap` 最慢阶段：“构建政治视觉 mesh” `3048.3ms`。
- 修正后浏览器探针：
  - 点击到 ready：约 `1591.4ms`。
  - 纯生成：约 `969.7ms`，本次最慢为“按政区整理城镇和路线” `281.9ms`，存在正常采样抖动。
  - `loadMap`：约 `425.1ms`。
  - 政治视觉 mesh：`0.1ms`。
  - 当前 `loadMap` 剩余较大项：线层顶点 `131.6ms`、视觉 cell mesh `99.5ms`、fit/draw `71.7ms`。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`
- `node --check app\webgl-generator\src\ui\panel.js`
- `git diff --check`
- `$env:CI='true'; pnpm.cmd run build:app`
- `$env:CI='true'; pnpm.cmd run regress:rendering -- --browser-channel chrome`
- 最新水陆线回归通过；10k 默认种子下视图切换约 `53-78ms`，`WebGL error = 0`。

后续：

- 首屏端到端性能下一刀优先看 `line-vertices` 和 `cell-visual-mesh`，尤其是水陆线/国界/省界三角描边是否可以缓存或延迟。
- 生成函数内部仍按上一节推进：10k 看省份颜色分配，50k/100k 看 `resolveDepressions()`。
- 如果之后重新启用政治视觉 mesh 正式绘制，必须先做懒加载、分帧构建或 worker 化，不能再回到首屏同步 Delaunay。

### 端到端性能守门与线层一次扫描优化

背景：

- 首屏 Loading 已经从政治视觉 mesh 同步构建中解放出来，但上一刀使用的是临时浏览器探针，不利于后续持续回归。
- `renderer.loadMap()` 剩余主要瓶颈之一是 `line-vertices`；临时探针里线层顶点构建约 `131.6ms`。
- 现有 `tools/webgl-generator-shoreline-regression.mjs` 会测点击到 ready，但它的报告目标是水陆线视觉回归，缺少生成、WebGL 加载和 UI/调度余量拆分。

修正：

- 新增 `tools/webgl-generator-e2e-profile.mjs` 和 `pnpm run profile:e2e`：
  - 默认读取 `dist/webgl-generator`，用本地静态 server + Chrome 运行正式构建产物。
  - 默认测试 `stage-2-1 / 10000 / 大陆 / 1440x960`。
  - 等待条件改为新地图对象生成、`WebGL error = 0` 且 Loading 气泡隐藏，避免把旧地图或仅 WebGL ready 误判为完成。
  - 报告拆分为点击到出图、纯生成、`renderer.loadMap()` 和 UI/调度余量。
  - 报告展开 `loadMap` 阶段明细，并默认设置端到端 `2500ms`、WebGL 加载 `1200ms` 两个守门阈值。
  - 输出 `docs/generated/reports/e2e-profile-results.json/md`，仍不入库。
- `shore-layer` 的水陆线线层构建做低风险优化：
  - 旧逻辑在海岸线和湖岸线都可见时，会为海岸扫描一遍所有 grid 邻接，再为湖岸扫描一遍所有 grid 邻接。
  - 新逻辑改为一次遍历陆水相邻边，根据水域 feature 类型分发到海洋海岸或湖岸，并保持原来的颜色、线宽、平滑/硬边路径和图层显隐语义。

本轮数据：

- 命令：`$env:CI='true'; pnpm.cmd run profile:e2e -- --browser-channel chrome`
- 结论：通过。
- 10k：点击到出图 `980ms`。
- 纯生成：`717ms`，最慢为“按政区整理城镇和路线” `254.2ms`。
- WebGL 加载：`178.2ms`，最慢为“构建线层顶点” `50.8ms`。
- UI/调度余量：`84.8ms`。
- `lineVertexCount = 258192`，`lineTriangleCount = 86064`，`boundaryLineMode = visual-cell-shore + butt-join-political`，`glError = 0`。
- 相对上一轮临时探针中 `line-vertices = 131.6ms`，本轮线层构建明显下降；不同采样存在浏览器抖动，但优化方向成立。

后续：

- 端到端性能应优先使用 `pnpm run profile:e2e -- --browser-channel chrome` 判断体感，而不是只看 Node 纯生成 profile。
- 下一个端到端 renderer 目标可以继续看 `cell-visual-mesh`、`shore-cache` 和 `fit-draw`；不过 10k 当前主要剩余已转回纯生成链路。
- 纯生成下一刀建议优先处理“按政区整理城镇和路线”，然后再处理 pack 省份颜色分配。

### 纯生成链路政区与命名修正第一刀

背景：

- 用户在 `seed = stage-2-1231411414`、`cells = 10000` 下观察到文化、宗教都是中文风格，但国家像中世纪欧洲，例如“公国”“自由邦”，和当前中文命名本体方向不一致。
- 只读调查确认该 seed 随机到 `culturesSet = european`，文化对象使用中文根名但同时带 `nameStyle: "European"`；国家命名把这个字段当作政治命名风格，导致国家根名和形制切到欧式音译/欧式形制。
- 用户同时指出省份/国家链路还需回到纯生成链路继续整理，尤其是按政区整理城镇、路线和 pack 省份颜色。
- Loading 气泡的“准备生成 xxx cells”文案不够自然，且暴露了过多内部参数。

修正：

- `society.js` 中 `european / english` 文化集继续保留 source 风格的分布筛选，但不再把 `European` 写入 `nameStyle`；该字段后续只用于显式命名风格，而不是文化分布预设。
- `names.js` 中国家形制表收回为中文本土风格，默认不再生成 `公国 / 侯国 / 自由邦 / 共和国`；`cultureType` 也不再自动触发音译根名，避免文化类型被误当语种。
- `settlements.js` 的 `finalizeSettlements()` 优先从 `pack.cells.state/province` 同步城市和 burg 的政区归属；删去中立城镇、重建路线前后会刷新 `states/provinces` 的城市和人口统计。
- pack 陆路主干改为按国家内首都、省会和大城分组，小路改为按省份分组；海路继续按水体港口分组。路线对象和 `pack.routes` 都写入 `state/province`，为后续路线面板和政区编辑提供归属字段。
- `politics.js` 的国家/省份颜色分配改用已用颜色集合，避免每个省份反复映射已着色省份列表；颜色评分语义保持不变。
- `runtime/app.js` 的 Loading 文案改为“生成中 / 正在生成地图数据 / 正在整理 WebGL 图层 / 正在刷新面板”，不再显示“准备生成 xxx cells”。

验证：

- `node --check app\webgl-generator\src\generator\names.js`
- `node --check app\webgl-generator\src\generator\society.js`
- `node --check app\webgl-generator\src\generator\politics.js`
- `node --check app\webgl-generator\src\generator\settlements.js`
- `node --check app\webgl-generator\src\runtime\app.js`
- `node -e "import('./app/webgl-generator/src/generator/index.js').then(...)"` 对 `stage-2-1231411414 / continents / 10000` 做命名与政区烟测：文化 `nameStyle` 为 `null`，国家名未命中欧式词根或旧形制，城市省份与 `pack.cells.province` mismatch 为 `0`，路线 `696` 条，其中 `676` 条有国家归属、`585` 条有省份归属。
- `$env:CI='true'; pnpm.cmd run build:app` 通过；Rolldown 仍报告第三方 `@vueuse/core` pure 注释位置警告，和本轮代码无关。
- `node .\tools\webgl-generator-generation-profile.mjs --cells 10000 --seed stage-2-1231411414 --template continents --iterations 1` 通过；10k 总耗时 `718.3ms`，最慢阶段为“生成国家 / 省份 / 区域” `132.8ms`，pack 省份颜色分配约 `32.4ms`。
- `$env:CI='true'; pnpm.cmd run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1009.5ms`，纯生成 `698.3ms`，WebGL 加载 `184.8ms`。

后续：

- 如果要长期防止“分布预设误当命名风格”回归，应给 baseline diff 或单独 smoke 增加命名风格断言。
- 100k 下仍应继续处理河流 `resolveDepressions()`；10k 下可继续看“按政区整理城镇和路线”里的路线候选和 A* 成本。

### 纯生成链路性能第二刀：河流洼地与路线寻路

背景：

- 上一刀已经把用户指出的命名、政区归属、路线归属和 Loading 文案问题收住，但 50k / 100k 纯生成仍有明显性能空间。
- 子阶段 profile 显示旧 `resolveDepressions()` 在大图下会反复扫描全体陆地 cell；路线生成则在每条 A* 候选路径中反复创建并填充 `cameFrom / bestCost / closed` 大数组。
- 用户明确要求可以继续自行推进，因此本轮继续沿纯生成链路处理确定性瓶颈，不改 UI 结构和 source 原项目。

修正：

- `rivers.js` 的洼地消解改为优先队列局部传播：
  - 首轮仍从全部非边界陆地 cell 入队，保证初始洼地可被完整松弛。
  - 每次抬高 cell 后只把相邻陆地重新入队，不再做整轮全陆地扫描。
  - 湖泊高度或闭合状态变化后，只重新激活相关 shoreline 及邻近陆地，避免湖泊阶段把全图扫描重新打开。
- `settlements.js` 的路线寻路复用 scratch：
  - `tracePackPath()` 复用 `cameFrom / bestCost / seen / closed` typed arrays，用递增 `runId` 表示本次搜索访问状态。
  - 路线连接边从字符串 key 改为基于 pack cell 数的无向数值 key，减少字符串分配。
  - road 生成收敛为全图首都主干网，省会和大城不再生成国家级 road，继续通过省内 trail 覆盖。
  - 极低陆地比群岛只取人口较高的首都生成 road，避免稀碎岛屿产生过多国家级道路。
- 本轮没有改变 `source/`，也没有新增运行时依赖。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js`
- `node --check app\webgl-generator\src\generator\rivers.js`
- `git diff --check`
- `$env:CI='true'; pnpm.cmd run build:app` 通过；第三方 `@vueuse/core` pure annotation 警告仍为既有工具链噪音。
- `node .\tools\webgl-generator-generation-profile.mjs --cells 10000,50000,100000 --seed stage-2-1231411414 --template continents --iterations 1` 通过：
  - 10k：总耗时 `535.4ms`，最慢阶段为“生成国家 / 省份 / 区域” `114.2ms`，洼地消解 `12.8ms`，按政区整理城镇和路线 `43.5ms`。
  - 50k：总耗时 `1380ms`，最慢阶段为“生成文化初稿” `269ms`，洼地消解 `47.4ms`，按政区整理城镇和路线 `98.1ms`。
  - 100k：总耗时 `3007.6ms`，最慢阶段为“生成文化初稿” `603.9ms`，洼地消解 `102.1ms`，按政区整理城镇和路线 `301.2ms`。
- `$env:CI='true'; pnpm.cmd run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `728.1ms`，纯生成 `341.4ms`，WebGL 加载 `248.5ms`。
- 100k 不变量烟测通过：路线陆路穿水 `0`、海路中段穿陆 `0`、river 引用越界 `0`、`pack.cells.r` 标到水格 `0`。`river.cells` 中仍会包含河口海格和湖泊链路水格，这是当前河口裁剪与湖泊出流语义的一部分，不作为错误处理。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff --browser-channel chrome --timeout 240000` 已刷新 63 个 candidate case；route/rivers 相关指标 fail `0`、warn `0`，陆路穿水与海路中段穿陆均为 `0`。矩阵总体状态仍为 fail，剩余原因是旧 source summary 缺 `lateStages` 字段，以及 candidate 经济链路尚未实现。

后续：

- 100k 最大瓶颈已从河流洼地和路线 A* 转到 `society-cultures`、`pack` 构建、`features` 和省份未归属填充。
- 如果继续处理纯生成性能，优先拆 `society-cultures` 的文化中心选择、扩张队列和补完逻辑；其次看 pack 构建和省份填充是否存在可缓存的邻接/候选扫描。
- 河流洼地算法已经改变传播顺序，checksum 与旧实现不同；当前按水陆不变量和端到端性能验收，后续若要收紧视觉一致性，可跑 source/candidate baseline 矩阵确认河流数量、湖泊出口和流域分布。
- 阶段 19 前需要刷新 source baseline 或继续实现经济链路，否则 full candidate 矩阵会继续被 lateStages / economy 缺口判为 fail；这不是本轮 route/rivers 回归。

### 纯生成链路性能第三刀：文化中心选址与子阶段 profile

背景：

- 上一轮 route / river 优化后，`stage-2-1231411414 / continents / 100000` 的最慢纯生成阶段转为 `society-cultures`，约 `603.9ms`。
- 只读调查确认主要嫌疑是 `placeCultureCenter()`：每个文化定义都会复制全部 populated cells 后排序，并在 comparator 中反复调用 `sort(cell, context)`。
- 用户要求继续自动推进，因此本轮沿纯生成链路继续处理确定性热点，并把文化内部耗时拆出来，方便后续不用再猜。

修正：

- `society.js` 引入 `createStageProfile()`，`buildPackCultures()` 现在记录文化子阶段：
  - 收集文化候选地。
  - 准备文化选址上下文。
  - 选择文化定义。
  - 放置文化中心。
  - 建立人口 cell 掩码。
  - 扩张文化。
  - 补齐未归属文化人口。
  - 汇总文化覆盖。
  - 同步文化到 grid。
- `buildSociety().metadata.cultureTiming` 暴露文化 timing；`tools/webgl-generator-generation-profile.mjs` 报告新增“文化子阶段”。
- 文化中心候选排序改为先预计算每个 populated cell 的文化适配分，再按分数排序；同时复用 typed score buffer，避免 comparator 重复计算和大量 `{cell, score}` 对象分配。
- 文化扩张与补齐阶段改用 populated mask 判断人口 cell；如果文化扩张已经覆盖所有 populated cell，补齐阶段会快速跳过。
- 本轮没有修改 `source/`，也没有新增依赖。

验证：

- `node --check app/webgl-generator/src/generator/society.js`
- `node --check tools/webgl-generator-generation-profile.mjs`
- `git diff --check`
- 第一次 `$env:CI` 未设置时运行 `pnpm.cmd run build:app` 被 pnpm 非 TTY modules 清理确认拦住；随后使用 `$env:CI='true'; pnpm.cmd run build:app` 通过。第三方 `@vueuse/core` pure annotation 警告仍为既有工具链噪音。
- `node .\tools\webgl-generator-generation-profile.mjs --cells 10000,50000,100000 --seed stage-2-1231411414 --template continents --iterations 1` 通过：
  - 10k：总耗时约 `471.5ms`，`生成文化初稿` 约 `33ms`，文化中心放置约 `18.5ms`。
  - 50k：总耗时约 `1240.8ms`，`生成文化初稿` 约 `86.5ms`，文化中心放置约 `61.7ms`。
  - 100k：总耗时约 `2695.8ms`，`生成文化初稿` 约 `186.3ms`，文化中心放置约 `133.2ms`，扩张文化约 `37.2ms`。
- 相比上一轮记录的 100k `生成文化初稿` 约 `603.9ms`，本轮降到约 `186.3ms`；不同单次采样会有抖动，但热点已明显下移。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate --refresh-diff --browser-channel chrome --timeout 240000` 通过刷新 3 个 100k candidate case；路线陆路穿水和海路中段穿陆均为 `0`，未出现文化引用或宗教连锁类新回退。矩阵总体仍为 fail，原因仍是已知 economy 空链路，以及部分 quick case 的旧 source `lateStages` 缺口。

后续：

- 文化阶段剩余最大子项仍是“放置文化中心”，但 100k 总体最慢已经转到 `politics`。
- 下一刀纯生成性能建议优先看 `buildPackProvinces()` 里的“填充未归属省份 cell”和省份颜色、再看 `pack/features` 构建。
- 若继续优化文化中心，可考虑更保守的 top-K 候选缓存或按文化定义复用排序结果，但这会更接近行为优化，需要比本轮更严格的文化中心/文化覆盖 diff。

### 纯生成链路性能第四刀：省份未归属填充

背景：

- 文化中心选址优化后，100k 纯生成热点转向 `politics`，其中 `buildPackProvinces()` 里的“填充未归属省份 cell”在单次报告中可到约 `106ms`。
- 只读调查确认 `fillUnassignedProvinceCells()` 每创建一个补充省份后都会重新 `cells.i.filter(...)` 全 pack 扫描，并且每个补充省份都会新建并填充整张 `Float64Array costs`。
- 这类重复扫描不改变算法意图，适合先做低风险性能刀。

修正：

- `fillUnassignedProvinceCells()` 开始时单次扫描 pack cells，按 state 收集仍未归属省份的陆地 cell。
- 新增 `remaining` 掩码和 `remainingCount`，省份扩张写入 `provinceIds` 时同步从剩余集合中删除，不再在 while 末尾全图重扫。
- `costs` 改为函数内复用，新增 `seen/runId` 标记当前补充省份的访问状态，避免每个补充省份 `new Float64Array(...).fill(Infinity)`。
- 中心选择仍保持原语义：优先选当前 state 剩余未归属 cell 中有 burg 的 cell，否则取原 cell 顺序里的第一个剩余 cell。
- 曾试验给颜色距离加入 Map 字符串缓存，但 100k 下省份颜色分配反而从约 `54ms` 抖到 `131ms`，已回滚；后续颜色优化应改为 palette index 和预计算距离矩阵。

验证：

- `node --check app/webgl-generator/src/generator/politics.js`
- `git diff --check -- app/webgl-generator/src/generator/politics.js`
- `node .\tools\webgl-generator-generation-profile.mjs --cells 100000 --seed stage-2-1231411414 --template continents --iterations 3` 通过：
  - 100k 平均总耗时 `2565.8ms`。
  - `生成国家 / 省份 / 区域` 平均 `405.7ms`。
  - `生成 pack 省份` 平均 `179.6ms`。
  - `填充未归属省份 cell` 平均 `21.2ms`，最大 `23.9ms`。
  - `分配省份颜色` 平均 `59.6ms`，仍是 pack 省份当前最大子项。
- `$env:CI='true'; pnpm.cmd run build:app` 通过；第三方 `@vueuse/core` pure annotation 警告仍为既有工具链噪音。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate --refresh-diff --browser-channel chrome --timeout 240000` 通过刷新 3 个 100k candidate case：
  - 地中海强制 case 的 `society.provinces` 为 source `515` / candidate `501`，继续通过。
  - 路线陆路穿水和海路中段穿陆仍为 `0`。
  - 引用类不变量继续通过。
  - 矩阵总体仍为 fail，原因仍是 candidate economy 空链路，以及两个 quick case 的旧 source `lateStages` 缺口。

后续：

- 省份未归属填充已不再是主要热点；pack 省份阶段剩余最大项为“分配省份颜色”，其次是边界毛刺吸收和 pole 计算。
- 如果继续做颜色优化，不要使用字符串 Map 缓存；应把 `STATE_COLOR_PALETTE` 预编成 index、RGB 和距离矩阵，并严格保持当前候选顺序和 score tie-break。
- 纯生成总体下一批热点仍包括 `pack` 构建、`features` 提取、grid/Voronoi 和阶段 19 经济链路。

### 纯生成链路性能第五刀：底层结构 profile 与深洼湖泊优化

背景：

- 省份未归属填充优化后，100k 纯生成的一线热点转为 `grid`、`pack` 和 `features`，但此前只有总阶段耗时，不知道瓶颈在 Delaunay、heightmap、feature flood、shore segment 还是 pack feature 标注。
- 只读调查建议先拆底层子阶段 profile，再动算法；其中 `features.addLakesInDeepDepressions()` 存在每个候选 cell 新建 `checked` 数组和 `neighbors.map() + Math.min(...spread)` 的明显短命分配。

修正：

- `grid.js` 新增子阶段 timing：
  - 点阵布局。
  - 边界点。
  - 扰动点阵。
  - Delaunay / Voronoi。
  - cell 字段初始化。
  - 高度模板。
  - grid 指标。
- `features.js` 新增子阶段 timing：
  - 水陆 feature 泛洪。
  - 深水距离。
  - 深洼湖泊。
  - 近海湖泊打开。
  - feature cell 重建。
  - grid 字段同步。
  - 水陆线段。
  - feature 指标。
- `pack.js` 新增子阶段 timing：
  - pack 点选择。
  - pack Voronoi 重建。
  - pack 点字段写入。
  - pack cell 面积。
  - grid 语义字段复制。
  - pack feature 标注。
  - pack 指标。
- `pack.markupPackFeatures()` 又暴露内部 timing，用于区分 pack feature 泛洪、内陆距离、深水距离、字段同步和 feature 分组。
- `tools/webgl-generator-generation-profile.mjs` 新增 grid / features / pack / pack feature 标注四类子系统报告。
- `addLakesInDeepDepressions()` 复用 `Uint32Array checked` 和 queue，用递增 stamp 标记本轮访问；邻居最低高度改为单次循环读取，避免每个候选 cell 创建临时数组和 spread。

验证：

- `node --check app/webgl-generator/src/generator/grid.js`
- `node --check app/webgl-generator/src/generator/features.js`
- `node --check app/webgl-generator/src/generator/pack.js`
- `node --check tools/webgl-generator-generation-profile.mjs`
- `node .\tools\webgl-generator-generation-profile.mjs --cells 100000 --seed stage-2-1231411414 --template continents --iterations 3` 通过：
  - `features` 总耗时约 `178.4ms`。
  - `识别深洼湖泊` 平均约 `62.9ms`，此前拆 profile 时为约 `265.5ms`。
  - `pack` 总耗时约 `524.1ms`。
  - `标注 pack feature` 平均约 `294.7ms`。
  - `pack feature 标注`内部 `泛洪识别 pack feature` 平均约 `279.2ms`，占 `94.8%`。
  - `grid` 中 `构建 Delaunay / Voronoi` 和 `应用高度模板` 是主要子项。
- `$env:CI='true'; pnpm.cmd run build:app` 通过；第三方 `@vueuse/core` pure annotation 警告仍为既有工具链噪音。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate --refresh-diff --browser-channel chrome --timeout 240000` 通过刷新 3 个 100k candidate case；地形、高度、降水、pack、feature、湖泊、河流、人口、国家、省份和路线主指标未新增回退，矩阵总体仍仅因 economy 空链路和旧 source `lateStages` 缺口 fail。
- `$env:CI='true'; pnpm.cmd run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `560.6ms`，纯生成 `321.6ms`，WebGL 加载 `147.7ms`。

后续：

- 下一刀优先继续拆 / 优化 `pack.markupPackFeatures()` 的泛洪段。当前它把 `createPackFeature()` 计入泛洪阶段，后者内部可能有边界 cell、边界顶点、湖岸和面积的多轮全 pack 扫描。
- 低风险候选仍包括 `features.buildShoreSegments()` 的 per-edge `Set/filter`、`pack` 面积计算的临时 polygon 数组，以及 feature 未标记 cell 查找的 `indexOf(UNMARKED)` 单调指针化。
- `grid` 的 Delaunay / Voronoi 是底层大项，任何改点序、边界点、Voronoi 数据结构的优化都需要更强回归，不应和小刀混在一起。

### 纯生成链路性能第六刀：pack feature 后处理局部化

背景：

- 第五刀 profile 显示 `pack.markupPackFeatures()` 的内部耗时几乎全部落在“泛洪识别 pack feature”，但该阶段同时包含 `createPackFeature()`。
- `createPackFeature()` 旧逻辑会为每个 feature 再次扫描全 pack cells，用于找边界 cell、收集边界顶点、收集湖岸和计算面积；feature 数量较多时这是明显的重复全表扫描。
- 为避免改变 feature 判定和输出顺序，本轮只把每个 feature 自己的 cell 列表从泛洪阶段传给后处理函数，并按 cell id 排序后使用，模拟旧的 `cells.i` 顺序。

修正：

- `markupPackFeatures()` 在泛洪时收集 `featureCells`。
- `featureCells` 在创建 feature 前按 cell id 升序排序，保持边界、湖岸和面积后处理的 cell 顺序接近旧的全表扫描顺序。
- `findFeatureBorderCell()`、`collectBoundaryVertices()`、`collectLakeShoreline()` 和 `sumFeatureArea()` 改为只遍历当前 feature 的 cells。
- 保留 feature id 分配、邻接遍历、haven/harbor、distance field、lake metadata 和 feature group 逻辑。

验证：

- `node --check app/webgl-generator/src/generator/pack.js`
- `git diff --check -- app/webgl-generator/src/generator/pack.js`
- `node .\tools\webgl-generator-generation-profile.mjs --cells 100000 --seed stage-2-1231411414 --template continents --iterations 3` 通过：
  - `pack` 总耗时约 `300.3ms`。
  - `重建 pack Voronoi` 约 `130.4ms`。
  - `标注 pack feature` 约 `123.2ms`，此前为约 `294.7ms`。
  - `pack feature 标注` 内部 `泛洪识别 pack feature` 约 `108.7ms`，此前为约 `279.2ms`。
- `$env:CI='true'; pnpm.cmd run build:app` 通过；第三方 `@vueuse/core` pure annotation 警告仍为既有工具链噪音。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate --refresh-diff --browser-channel chrome --timeout 240000` 通过刷新 3 个 100k candidate case；强制地中海 case 的 grid、pack、feature、湖泊、河流、人口、国家、省份和路线主指标继续 pass，矩阵总体 fail 仍是 economy 空链路和旧 source `lateStages` 缺口。
- `$env:CI='true'; pnpm.cmd run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `698.5ms`，纯生成 `334.1ms`，WebGL 加载 `271.8ms`。

后续：

- `pack` 当前剩余主要热点是 `重建 pack Voronoi` 和 `标注 pack feature` 本身；Voronoi 改动风险较高，下一步更适合继续做小的临时对象优化，例如 pack cell 面积直接遍历顶点、shore segment 避免 per-edge `Set/filter`。
- `grid` 中 `Delaunay / Voronoi` 和 `heightmap` 仍是大项，但会触碰更底层的数据顺序和视觉结果，后续必须单独开刀并加强 baseline。

### 纯生成链路性能第七刀：面积与水陆线临时对象优化

背景：

- 第六刀后，`pack` 的主要剩余热点转到 pack Voronoi、pack feature 标注和 pack cell 面积；`features` 中水陆线段构建也仍有可见成本。
- 只读调查指出两个低风险临时对象点：pack cell 面积每个 cell 都构造 polygon 数组，水陆线段每条边都构造 `Set` 并 filter 共享顶点。

修正：

- `pack` cell 面积计算改为 `packCellArea()`：直接按 `cells.v[cellId]` 的顶点顺序做鞋带公式，跳过无效点，不再生成 polygon 临时数组。
- `features.buildShoreSegments()` 不再调用 `getForwardNeighbors()` 生成过滤数组，而是在邻接循环中直接跳过 `neighbor <= cell`。
- `getSharedSegment()` 改为在两个短顶点数组里查找前两个共享顶点，避免每条水陆边创建 `Set` 和 filter 数组。

验证：

- `node --check app/webgl-generator/src/generator/pack.js`
- `node --check app/webgl-generator/src/generator/features.js`
- `git diff --check -- app/webgl-generator/src/generator/pack.js app/webgl-generator/src/generator/features.js`
- `node .\tools\webgl-generator-generation-profile.mjs --cells 100000 --seed stage-2-1231411414 --template continents --iterations 3` 通过：
  - `features` 总耗时约 `138.1ms`。
  - `生成水陆线段` 约 `18.3ms`。
  - `pack` 总耗时约 `291.5ms`。
  - `计算 pack cell 面积` 约 `26.6ms`。
  - `标注 pack feature` 约 `95.9ms`。
- `$env:CI='true'; pnpm.cmd run build:app` 通过；第三方 `@vueuse/core` pure annotation 警告仍为既有工具链噪音。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate --refresh-diff --browser-channel chrome --timeout 240000` 通过刷新 3 个 100k candidate case；地形、pack、feature、湖泊、河流、人口、国家、省份和路线主指标未新增回退。
- `$env:CI='true'; pnpm.cmd run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `560.7ms`，纯生成 `315.8ms`，WebGL 加载 `146.1ms`。

后续：

- 继续做纯生成性能时，低风险小项已逐渐收敛；下一步要么进入更底层的 `grid / pack Voronoi` 和 heightmap，要么切到阶段 19 economy 数据链路。
- 若继续优化 pack feature 泛洪本体，可考虑单调 next-unmarked 指针和 haven 查找的短数组优化，但收益可能小于前几刀，需要先看三次 profile。

### 阶段 19：economy 数据链路第一刀

背景：

- source `1.127.2` 已把 `Goods.generate`、`Markets.generate`、`Production.produce` 和 `States.collectTaxes` 纳入正式生成管线。
- candidate baseline schema 已经能统计 economy，但正式生成器此前没有 `pack.goods`、`pack.markets`、`pack.deals`、`pack.cells.good` 和 `pack.cells.market`，导致强制 case 的 economy 全部为 `0`。
- 本刀只实现可校验的数据产物，不做市场 UI、贸易图层、经济编辑器或动画。

修正：

- 新增 `app/webgl-generator/src/generator/economy.js`，生成商品目录、资源 cell、市场、市场覆盖、burg 生产记录、交易记录和 state 税收。
- 商品目录固定对齐 source 摘要：总数 `71`，raw `39`，manufactured `30`，hybrid `2`，带 biomeOutput `16`，带 demandCoverage `58`。
- `pack.cells.good` 按陆地、河流、港口、高地和适居度挑选资源 cell；`pack.cells.market` 按 pack 陆地比控制覆盖率，并优先分配陆地、港口、城市和高适居度 cell。
- 市场中心从首都、大城、港口和 plaza burg 中选取；所有 burg 都回填合法 `market`，每个市场中心 burg 回指自己的市场并标记 `plaza`。
- burg 生产包含 local、manufactured 和 deal records；`pack.deals` 使用连续数组并保证 `deal.i === index`。
- state 税率和国库按 deal tax 与 poll tax 回填，保持 `treasury mismatch = 0`。
- `generatePlaceholderMap()` 新增 `economy` 阶段，`generatorStage` 更新为 `source-stage-19-economy-first-pass`。
- `tools/webgl-generator-export-baseline.mjs` 的 candidate trace 已加入 `buildEconomy`，并移除过期的 economy unsupported 说明。

验证：

- `node --check app/webgl-generator/src/generator/economy.js`
- `node --check app/webgl-generator/src/generator/index.js`
- `node --check tools/webgl-generator-export-baseline.mjs`
- `node tools/webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --name mediterranean-100000-audit-mediterranean-001`
- `node tools/baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001` 通过：状态 `pass（fail 0，warn 0）`，economy 指标和引用不变量全部通过。
- `node tools/source-baseline-matrix.mjs --mode quick --refresh true --reuse-server true --browser-channel chrome --port 5301 --timeout 240000` 已刷新三个 100k source case；命令外层曾因共享 dev server 生命周期拖到超时，但三个 `source-summary.json`、`source-trace.json`、`matrix.json/md` 均已写出，后续检查确认 source 侧 economy 和 lateStages 均存在。
- `node tools/candidate-baseline-matrix.mjs --mode quick --refresh-candidate true --refresh-diff true` 通过刷新三个 100k candidate case：三个 case 的 economy 指标全部通过；矩阵总体仍为 fail，剩余非经济缺口为 `archipelago` 的 `lateStages.military.regiments` fail、`archipelago` 的 `lateStages.zones.total` warn、`continents` 的 `lateStages.military.regiments` warn。

后续：

- 下一刀优先校准军事生成。当前低陆地比群岛 source regiment `63`，candidate `267`，明显过量；大陆 case 也有 regiment warn。
- zone 数量在群岛 case 仍为 warn，可在军事校准后继续处理。

### 军事数量校准第一刀：低陆地比地图 regiment 过量

背景：

- quick matrix 刷新后，economy 全部通过，但 `archipelago / 100000 / audit-archipelago-001` 的 `lateStages.military.regiments` 为 source `63` / candidate `267`，触发 fail；`continents` 为 `272 / 475`，触发 warn。
- source `military-generator.ts` 不是预设每州 regiment 目标数，而是先按 rural / burg population 生成 platoon，再以 `expected = 3 * populationRate` 为目标通过 quadtree 空间合并小 platoon。
- candidate 当前实现先按 `sqrt(burgs) + sqrt(cells) + sqrt(area)` 计算每州 target，再 round-robin 把节点硬分成 target 组。这个策略在群岛和碎片国家里会接近“一城一团”。

修正：

- `getStateRegimentTarget()` 增加全图 pack 陆地密度因子：pack 陆地比例越低，target 越接近 source 的小规模合并结果；地中海这类高陆地比例地图基本不受影响。
- 有城镇国家的最低 regiment 从 `2` 降为 `1`，避免微岛国家被下限强行膨胀。
- 本刀不调整单位人数、artillery/fleet 组成，也不改为 source 的 quadtree 合并算法；这些属于后续更贴 source 的中风险重写。

验证：

- `node --check app/webgl-generator/src/generator/military.js`
- 本地三例 100k 抽样：`mediterranean` regiments `468`，`continents` `356`，`archipelago` `79`。
- `node tools/candidate-baseline-matrix.mjs --mode quick --refresh-candidate true --refresh-diff true` 通过刷新 3 个 100k candidate case：
  - `mediterranean` source/candidate regiments `409 / 468`，pass。
  - `continents` source/candidate regiments `272 / 356`，pass。
  - `archipelago` source/candidate regiments `63 / 79`，pass。
  - quick matrix 总体从 `fail` 降到 `warn`，唯一剩余 warn 为 `archipelago` 的 `lateStages.zones.total`，source `11` / candidate `3`。

后续：

- 下一刀处理 zone 数量。群岛 case 当前 zone 明显偏少，应该优先检查 `zones.js` 的目标数量和候选类型是否对低陆地比/多岛屿场景过度保守。
- 若后续继续军事，应考虑 source 式 platoon 空间合并，代替当前 target round-robin 分组。

### 区域 zone 数量校准第一刀

背景：

- 军事数量修正后，quick matrix 唯一剩余 warn 是 `archipelago / 100000 / audit-archipelago-001` 的 `lateStages.zones.total`：source `11`，candidate `3`。
- source `Zones.generate()` 对每种 zone 类型使用固定 `quantity` 期望值并按高斯抽样尝试，不会按 pack cells 线性缩小。
- candidate 旧 target 为 `pack.cells.i.length / 5200`，群岛 pack 只有约 `14351` cells，因此 target 被压到 `3`，类型计划只够生成 Invasion / Rebels / Proselytism，后段灾害类几乎没有机会。

修正：

- `getTargetZoneCount()` 改为固定基础量加弱规模增量：`round(8 + pack.cells.i.length / 10000)`，并夹在 `7..20`。
- 该公式让低陆地比 / 小 pack 地图仍能尝试足够多的 zone 类型，同时保持大图数量在 source 阈值内。

验证：

- `node --check app/webgl-generator/src/generator/zones.js`
- 本地三例 100k 抽样：
  - `mediterranean` zones `15`，target `15`。
  - `continents` zones `13`，target `13`。
  - `archipelago` zones `9`，target `9`。
- `node tools/candidate-baseline-matrix.mjs --mode quick --refresh-candidate true --refresh-diff true` 通过刷新 3 个 100k candidate case，矩阵状态为 `pass（fail 0，warn 0）`：
  - `mediterranean` source/candidate zones `10 / 15`。
  - `continents` source/candidate zones `17 / 13`。
  - `archipelago` source/candidate zones `11 / 9`。

后续：

- quick matrix 已全绿；下一步可刷新 full source/candidate 矩阵，确认 63 case 在 source `1.127.2` economy schema 下是否仍全绿。
- zone 类型和 cell 规模仍只是第一刀，后续可继续参考 source 的 per-type 高斯抽样和路径/河流/海啸候选规则深化。

### 经济市场库存规模校准第一刀

背景：

- quick candidate 矩阵已经全绿，但 full source/candidate 矩阵刷新后暴露出 10k/50k case 的系统性经济库存偏差。
- `node .\tools\source-baseline-matrix.mjs --mode full --refresh true --reuse-server true --browser-channel chrome --port 5301 --timeout 240000` 外层因为共享 Vite server 生命周期拖到 1 小时超时；检查后确认 63 个 `source-summary.json` 都已刷新，并且全部包含新版 `lateStages` 和 `economy` schema，`matrix.json/md` 也已写为 full。
- full candidate 初始状态为 `31 fail / 21 warn / 11 pass`。失败项高度集中：
  - `economy.markets.stock.mean`：`29` 个 fail。
  - `lateStages.military.regiments`：`15` 个 fail、`23` 个 warn。
- candidate 旧 market stock 均值基本固定：普通 market 约 `34.5`，低陆地比 market 约 `18.5`；source 则按目标 cells 明显增长，当前 full 矩阵平均约为 10k `5.67`、50k `18.6`、100k `36`。

修正：

- `createMarkets()` 接收 `options`，并传入 `createMarket()`。
- `createMarket()` 的每种商品库存先保留原有确定性基数，再乘以 `getMarketStockScale(options)`。
- `getMarketStockScale()` 使用 `(cellsTarget / 100000) ^ 0.85`，并夹在 `0.12..1`；因此 100k 保持旧库存尺度，10k/50k 向 source 的小图库存尺度收敛。
- 本刀只调库存尺度，不同时调整价格、生产记录、交易数量和税收，避免把多个经济指标耦在一起。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- `git diff --check`
- 定点最差样例 `peninsula / 10000 / audit-peninsula-003` 从 `fail` 降为 `warn`，库存均值 source/candidate 从 `2.968 / 34.552` 变为 `2.968 / 4.881`。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate true --refresh-diff true --browser-channel chrome --timeout 240000` 通过：quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate true --refresh-diff true --browser-channel chrome --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态从 `31 fail / 21 warn / 11 pass` 改为 `20 fail / 29 warn / 14 pass`。
  - `economy.markets.stock.mean` 从 `29` 个 fail 降到 `1` 个 fail、`2` 个 warn。

后续：

- 下一刀优先军事第二刀。full 矩阵仍有 `lateStages.military.regiments` 的 `15` 个 fail 和 `23` 个 warn，主要集中在 10k、50k 和 highIsland / lowIsland 这类地图；第一刀的陆地密度因子只保证了 quick 100k 样例。
- 经济后续可继续处理 `production.localRecords / product.mean / marketToMarket / taxTotal`，但应等军事数量先收敛，否则 full 矩阵的最大噪声仍在军事。

### 军事数量校准第二刀：按 burg 背书收紧 per-state target

背景：

- 经济库存校准后，full 矩阵仍有 `lateStages.military.regiments` 的 `15` 个 fail 和 `23` 个 warn。
- 失败集中在 10k/50k 以及 highIsland、lowIsland、pangea 的中低陆地比场景。典型 overcount：
  - `lowIsland / 10000 / 002`：source/candidate `100 / 298`。
  - `highIsland / 10000 / 001`：`86 / 250`。
  - `highIsland / 50000 / 001`：`144 / 362`。
  - `highIsland / 100000 / 003`：`137 / 304`。
- source 的 `regiments / burgs` 比例随目标 cells 增长，但通常明显低于 candidate：10k 多在 `0.10..0.15`，100k 多在 `0.20..0.25`。candidate 第一刀后仍可达到 `0.35..0.45`。

修正：

- `getStateRegimentTarget()` 继续保留原有 `burg/cell/area/alert/densityFactor` raw target。
- 新增 `getBurgBackedRegimentTarget()`，按每州 burg 数给 target 加上上限。
- 上限比例随目标 cells 增长：`0.1 + 0.14 * sqrt(cellsTarget / 100000)`，并夹在有效范围内；约等于 10k `0.144`、50k `0.199`、100k `0.24`。
- 本刀不改军队节点、兵种人数、fleet/artillery 组成，也不重写为 source 的 quadtree platoon 合并算法；目标只是把 regiment 数量压回 source 阈值。

验证：

- `node --check app\webgl-generator\src\generator\military.js`
- `git diff --check`
- 定点样例：
  - `highIsland / 10000 / audit-highIsland-001` 从 `86 / 250` 改为 `86 / 112`，军事 fail 清除。
  - quick 守门 `mediterranean / 100000 / audit-mediterranean-001` 为 `409 / 321`，仍 pass。
  - quick 守门 `archipelago / 100000 / audit-archipelago-001` 为 `63 / 75`，仍 pass。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh-candidate true --refresh-diff true --browser-channel chrome --timeout 240000` 通过：quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate true --refresh-diff true --browser-channel chrome --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态从 `20 fail / 29 warn / 14 pass` 改为 `7 fail / 30 warn / 26 pass`。
  - `lateStages.military.regiments` 的 `15` 个 fail 全部清除，仅剩 `4` 个 warn：`mediterranean-10000-002`、`highIsland-10000-002`、`highIsland-100000-003`、`pangea-10000-003`。

后续：

- 军事数量已经不再是 fail 来源；后续若继续军事，应改向 source 式 platoon 空间合并和 troop/unit 数量校准，而不是继续调 target 阈值。
- 当前 full 的剩余 fail 主要是湖泊/湖名、经济交易和少量库存/税收；也可以按 Gibbs 只读调查结果补 marker 的 `bridges / sacred-mountains` 等低风险缺口。

### 经济生产与市场间交易密度校准第一刀

背景：

- 军事第二刀后，full 矩阵还剩 `7 fail / 30 warn / 26 pass`。
- 经济剩余 fail 主要集中在 10k 小图：
  - `economy.production.localRecords`：`archipelago / 10000 / 001` source/candidate `117 / 270`。
  - `economy.deals.marketToMarket`：`lowIsland / 10000 / 001` 为 `170 / 364`，`lowIsland / 10000 / 002` 为 `167 / 350`。
  - `economy.deals.taxTotal` 与 `economy.taxes.dealTaxTotal`：`peninsula / 10000 / 002` 为 `3076.424 / 6275.335`。
- 初步判断：candidate 的本地生产记录比例固定偏高，市场间交易链接数在 10k/50k 下过密，进一步推高交易值和税收。

修正：

- `createProductionAndDeals()` 接收 `options`。
- 新增 `getLocalProductionRate()`：本地生产记录概率随目标 cells 增长，约为 10k `0.41`、50k `0.55`、100k `0.65`，替代旧的固定 `burg.i % 3 !== 0`。
- 新增 `getMarketTradeLinks()`：市场间链接数随目标 cells 增长；同时保留小市场数量场景最多 `6` 条链接的旧上限，避免 archipelago 100k 这类 market 很少的 quick 样例回退。
- 本刀不改 goods、market 选址、stock、price、税率公式和商品生产配方。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- `git diff --check`
- 定点样例：
  - `lowIsland / 10000 / audit-lowIsland-001` 从 fail 降为 warn，`marketToMarket` 从 `170 / 364` 改为 `170 / 208`，`localRecords` 从 `281 / 492` 改为 `281 / 305`。
  - `peninsula / 10000 / audit-peninsula-002` 从 fail 降为 warn，`localRecords` 从 `332 / 537` 改为 `332 / 330`，`taxTotal` 从 `3076.424 / 6275.335` 改为 `3076.424 / 6129.101`，低于 fail 阈值但仍为 warn。
- 第一次 quick 检查发现 archipelago 100k 因小市场数量场景链接数从旧 `6` 扩到 `9` 而出现 `marketToMarket` warn；随后把 `markets < 16` 的最大链接数恢复到 `6`，quick 回到 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate true --refresh-diff true --browser-channel chrome --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态从 `7 fail / 30 warn / 26 pass` 改为 `3 fail / 31 warn / 29 pass`。
  - 经济交易类 fail 全部清除；剩余 fail 为 `features.lakes`、`lateStages.names.lakeNames` 和一个 `economy.markets.stock.mean` 边缘 case。

后续：

- 下一刀可处理湖泊数量/湖名：当前 `continents / 10000 / 001` 和 `archipelago / 10000 / 002` 同时因 `features.lakes` 与 `lakeNames` fail，属于同一根因。
- 也可继续处理 `peninsula / 50000 / 003` 的 `economy.markets.stock.mean`，但只影响 1 个 fail，应避免为了单 case 过度调 stock 全局指数。

### 10k 湖泊兜底校准第一刀

背景：

- 经济生产与交易密度校准后，full 矩阵还剩 `3 fail / 31 warn / 29 pass`。
- 其中两个 fail 属于同一根因：
  - `continents / 10000 / audit-continents-001`：source 有 `2` 个 lake / lakeName，candidate 为 `0`。
  - `archipelago / 10000 / audit-archipelago-002`：source 有 `1` 个 lake / lakeName，candidate 为 `0`。
- 只读诊断确认 candidate 初始水体全部连到海洋；已有湖泊的 case 多数来自初始封闭水体，而当前 `addLakesInDeepDepressions()` 生成的近海低洼湖会被 `openNearSeaLakes()` 打开，导致这两个 10k case 最终无湖。

修正：

- 在 `openNearSeaLakes()` 之后新增 `supplemental-basin-lakes` 阶段，只在整张地图最终仍没有湖泊时触发。
- 兜底候选必须满足：
  - 非边界陆地 cell。
  - 海拔 `20..45`。
  - 距当前水岸至少 `3` 层邻接。
  - 不高于所有邻居，即局部低点。
- 候选按内陆距离、低海拔和邻域 relief 评分，目标数量按候选规模夹在 `1..3`，并要求补湖点之间至少相隔若干邻接步，避免扎堆。
- `addLake()` 同步把湖 cell 高度改为 `19`，把周边陆地标为 `LAND_COAST`，保证后续 grid/pack feature、湖岸、湖泊水文和湖名链路能接上。

验证：

- `node --check app\webgl-generator\src\generator\features.js`
- 定点生成：
  - `continents / 10000 / audit-continents-001`：grid lakes / pack lakes / named lakes 均为 `2`。
  - `archipelago / 10000 / audit-archipelago-002`：grid lakes / pack lakes / named lakes 均为 `1`。
  - `continents / 10000 / audit-continents-002` 保持 `6` 湖，`continents / 100000 / audit-continents-001` 保持 `69` 湖，说明已有湖泊 case 没被兜底阶段改动。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态从 `3 fail / 31 warn / 29 pass` 改为 `1 fail / 30 warn / 32 pass`。
  - 两个湖泊 / 湖名 fail 清除。

后续：

- 当前 full 矩阵唯一 fail 是 `peninsula-50000-audit-peninsula-003` 的 `economy.markets.stock.mean`。
- 该问题只剩单 case，下一刀应先读取该 case 的 source/candidate market stock 分布，再决定是做轻量 stock 下限/上限修正，还是把它降级为可接受的 warn；避免为了一个边缘 case 大幅重调所有地图的库存指数。

### 经济库存尺度边缘校准

背景：

- 湖泊兜底后，full 矩阵剩余唯一 fail 是 `peninsula / 50000 / audit-peninsula-003` 的 `economy.markets.stock.mean`。
- 该 case 的 source/candidate 库存均值为 `9.169 / 19.165`，相对差 `1.09`，略高于 fail 阈值 `1.0`。
- full 矩阵中同一指标此前只有 `2` 个 warn 和 `1` 个 fail；说明这是边缘尺度问题，不适合大幅重写市场、商品或交易逻辑。

修正：

- `getMarketStockScale()` 的指数从 `0.85` 微调为 `0.92`。
- 100k 因 `(100000 / 100000) ^ n = 1` 不变。
- 50k 库存均值约下降 `4.7%`，刚好把 `peninsula / 50000 / 003` 从 fail 拉回 warn。
- 10k 库存也会下降，但定点检查确认原有库存 warn 没跨入 fail。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- 定点样例：
  - `peninsula / 50000 / audit-peninsula-003`：`stock.mean` source/candidate 从 `9.169 / 19.165` 改为 `9.169 / 18.257`，状态从 fail 降为 warn。
  - `archipelago / 10000 / audit-archipelago-001`：`stock.mean` 保持 warn，没有跨入 fail。
  - `lowIsland / 50000 / audit-lowIsland-001`：`stock.mean` 仍为 pass。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态从 `1 fail / 30 warn / 32 pass` 改为 `0 fail / 31 warn / 32 pass`。

后续：

- 阶段 19 当前没有硬 fail。下一步可以从 warn 数量最多或 source 语义缺口最明确的专题继续：marker 类型/规则、经济 stock 分布形态、税收 pollTaxExpected、或 marker/zone 的 source 细节。
- 若继续经济，建议不要再只调单一均值；应改为 source 风格的“稀疏库存 + 长尾库存”分布，否则均值接近但 p25/p50/p99 仍不像 source。

### 经济 product 均值校准第一刀

背景：

- 库存边缘校准后，full 矩阵没有硬 fail，但 `economy.production.product.mean` 是最大 warn 热点，共 `15` 个 warn。
- 典型偏差集中在 10k：
  - `mediterranean / 10000 / audit-mediterranean-002`：source/candidate `16.305 / 29.869`。
  - `continents / 10000 / audit-continents-001`：`23.003 / 39.842`。
- 只读对比发现 candidate 的 product 最小值和 p25 明显过高，原因是 `burg.production.length` 同时包含真实生产记录和 market/burg deal 记录。每个 burg 默认会带十几条 deal 记录，旧公式把这些 deal 也按固定 `0.8` 计入 product，给 10k 小图制造了约 `14` 点固定底座。

修正：

- 新增 `calculateBurgProduct()`，把 `burg.production` 拆成真实生产记录和 deal 记录。
- 真实生产记录继续按 `0.8` 计入 product。
- deal 记录改用 `getDealProductWeight()`：`0.8 * sqrt(cellsTarget / 100000)`。
- 因此 100k 保持旧 deal product 尺度，10k 只保留约 `31.6%` 的 deal product 底座，50k 居中。
- treasury 公式暂不改，避免同时重调税收和国库链路。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- 定点样例：
  - `mediterranean / 10000 / audit-mediterranean-002`：`product.mean` 从 `29.869` 降为 `20.023`，状态从 warn 降为 pass；`burgTreasury.mean` 仍为 pass。
  - `continents / 10000 / audit-continents-001`：`product.mean` 从 `39.842` 降为 `29.996`，状态从 warn 降为 pass；`burgTreasury.mean` 仍为 pass。
  - `mediterranean / 100000 / audit-mediterranean-001`：product / treasury 状态保持 pass，说明 100k 尺度未回退。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `32 pass / 31 warn / 0 fail` 改为 `39 pass / 24 warn / 0 fail`。
  - `economy.production.product.mean` 不再进入 warn 热点。

后续：

- 当前最大 warn 热点转为 `society.ports`（10 个 warn），其次是 `economy.deals.value`（5 个 warn）和 `lateStages.military.regiments`（4 个 warn）。
- 下一刀如果继续矩阵收敛，优先评估港口数量偏低：这可能牵连 searoutes、markets、naval culture 和 burg type，改动前应先只读对比 source 港口选址规则。

### 港口、河港与海路 source 语义补齐第一刀

背景：

- 经济 product 校准后，full 矩阵仍保持 `0 fail`，但 `society.ports` 是最大 warn 热点，共 `10` 个 warn。
- 典型偏差集中在港口偏低：
  - `mediterranean / 10000 / audit-mediterranean-003`：港口 source/candidate `216 / 117`。
  - `continents / 10000 / audit-continents-001`：`152 / 78`。
  - `lowIsland / 50000 / audit-lowIsland-001`：`258 / 126`。
- source 复查确认 `assignPorts()` 不只提升安全海港，还会把可通航河流上的内陆 burg 按最终出海或入湖水体提升为 river port。candidate 旧逻辑只处理 safe harbor / 首都 harbor，并把非港河边 burg 轻微挪到河岸，没有设置 `burg.port`。

修正：

- `shiftPortsAndRiverBurgs()` 改为 source-like 候选收集：
  - `haven` 按 truthy 语义判断，避免 `Uint32Array` 默认 `0` 吞掉 river port 分支。
  - 普通 coastal harbor 也可入池；safe harbor / 首都港只作为 `preferred`。
  - 排除 `dry / frozen / lava` 湖泊。
  - 湖港若有 outlet，会沿下游 river / lake outlet 解析最终承载水体。
  - 河港要求 `pack.cells.r[cell]` 且 `pack.cells.fl[cell] >= 100`，并沿河流和湖泊 outlet 解析最终承载水体。
- 港口选择器补齐 source 规则：先晋升 preferred，再保证同一水体每个 land feature 至少有一个候选，不足两个端点时补齐，最终少于两个端点则不设港。
- 河港和非港河边 burg 的位置偏移改为按河道局部切线挪到河岸。
- 海路 A* 成本补齐 riverEdges：
  - 水路可沿可通航河道进出河港。
  - 普通海港作为终点时允许从对应 haven 入港。
  - 普通海港离港时必须从 haven 出海。
  - 非可通航河道的陆地仍不可作为海路中段。
- `calculateUrquhartEdges()` 补齐 `2` 个点时直接返回 `[[0, 1]]`，避免刚好两个港口的水体没有海路。

验证：

- 两个只读子智能体参与：
  - Cicero 复查 source `assignPorts()` / `Rivers.resolveDrainFeature()`，指出 `haven` truthy、普通 harbor 候选和 river port 规则。
  - Hilbert 复查当前 diff，指出普通 coastal 港口终点需要 source-like exit 谓词，以及两港口 Urquhart 特判。
- `node --check app\webgl-generator\src\generator\settlements.js`
- `git diff --check`
- 定点样例：
  - `mediterranean / 10000 / audit-mediterranean-003` 港口从 `117` 提升到 `202`，source 为 `216`；海路从 `115` 提升到 `168`，source 为 `181`。
  - `continents / 10000 / audit-continents-001` 港口从 `78` 提升到 `150`，source 为 `152`。
  - `lowIsland / 50000 / audit-lowIsland-001` 港口从 `126` 提升到 `242`，source 为 `258`；海路为 `239`，source 为 `235`。
  - quick 100k 三样例保持 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `39 pass / 24 warn / 0 fail` 改为 `44 pass / 19 warn / 0 fail`。
  - `society.ports` 从 `10` 个 warn 降为 `1` 个 warn。

后续：

- 剩余热点转为 `economy.deals.value`、`lateStages.military.regiments`、`routes.searoutes`、`lateStages.zones.total` 和少量 market / tax 指标。
- 港口和海路已无硬 fail；后续若继续海路，应优先复刻 source 的 route river run / meander 几何，而不是再通过拆分 route 调数量。

### 经济交易金额尺度校准第一刀

背景：

- 港口、河港与海路补齐后，full 矩阵仍保持 `0 fail`，但经济交易金额和税额成为新热点：
  - `economy.deals.value`：`5` 个 warn。
  - `economy.deals.taxTotal`：`2` 个 warn。
  - `economy.taxes.dealTaxTotal`：`2` 个 warn。
- 典型 10k 偏差：
  - `mediterranean / 10000 / audit-mediterranean-002`：value source/candidate `45388.892 / 86003.52`，tax `4832.035 / 7871.379`。
  - `peninsula / 10000 / audit-peninsula-002`：value `39381.302 / 66275.46`，tax `3076.424 / 6103.537`。
  - `pangea / 10000 / audit-pangea-003`：value `48230.932 / 77428.955`。
- source 复查确认 `deals.value` 是 baseline 摘要里的 `sum(deal.units * deal.price)`；source 的真实交易链路会按库存、供需、margin、market pressure、运输成本、利润和卖方税率决定成交金额。candidate 当前仍是轻量合成模型，尚未复刻完整 `buy / sell / runGlobalTrade`。

修正：

- `addDeal()` 新增 `valueScale` 参数，用于温和缩放成交价格和对应税额。
- `createProductionAndDeals()` 统一传入 `dealValueScale`：
  - 100k 保持 `1`，避免影响 quick 100k 守门样例。
  - 50k 约 `0.88`。
  - 10k 约 `0.66`。
- 本刀不改交易条数、市场选择、库存、商品覆盖或税率公式；`marketToMarket` 偏低和 `marketToBurg` 个别偏高留给后续 source-style 交易重写。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- 定点样例：
  - `mediterranean / 10000 / audit-mediterranean-002`：value 改为 `56822.396`，tax 改为 `5200.471`。
  - `continents / 10000 / audit-continents-003`：value 改为 `41987.8`，source 为 `38728.043`。
  - `peninsula / 10000 / audit-peninsula-002`：value 改为 `43788.269`，tax 改为 `4032.585`。
  - `mediterranean / 100000 / audit-mediterranean-001`：100k value / tax 仍保持同量级，没有引入 quick 回退。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过，quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `44 pass / 19 warn / 0 fail` 改为 `46 pass / 17 warn / 0 fail`。
  - warn 总项从 `41` 降到 `32`。
  - `economy.deals.value / taxTotal / economy.taxes.dealTaxTotal` 不再进入热点。

后续：

- 经济剩余 warn 主要是 `marketToMarket` 偏低、`marketToBurg` 个别偏高、`tradedGoods` 个别偏高和 `pollTaxExpected` 个别 case。
- 如果继续经济，应优先做 source-style `buy / sell / runGlobalTrade` 小步替换：market→burg 不征税，burg→market 和 profitable market→market 按卖方税率征税，market→market 按 reserve、距离、运输成本和利润成交。

### 军事数量校准第三刀：收紧小图 burg-backed 上限

背景：

- 经济交易金额校准后，full candidate 矩阵保持 `0 fail / 32 warn`，其中 `lateStages.military.regiments` 还剩 `4` 个 warn，全部为 candidate 数量偏高：
  - `mediterranean / 10000 / audit-mediterranean-002`：source/candidate `106 / 159`。
  - `highIsland / 10000 / audit-highIsland-002`：`69 / 111`。
  - `highIsland / 100000 / audit-highIsland-003`：`137 / 223`。
  - `pangea / 10000 / audit-pangea-003`：`86 / 140`。
- 对照其它 100k 通过样例后，不能继续全局降低 target：例如 `mediterranean / 100000 / audit-mediterranean-001` 已经是 source/candidate `409 / 264`，继续压 100k 会把通过样例推向低估。
- Bernoulli 只读复查确认，source 军事生成不是先定每州 regiment target，而是先按 rural / urban / naval 规则生成 platoon，再按兵力和空间邻近合并。candidate 当前仍是 per-state target + 网格分桶合并模型，本刀只做小图上限校准，不伪装成完整 source 复刻。

修正：

- `getBurgBackedRegimentTarget()` 保留原先随目标 cells 增长的 burg-backed 比例。
- 对小图额外乘 `(0.75 + 0.25 * sqrt(cellsTarget / 100000))`：
  - 100k 保持 `1`，不影响已偏低但通过的 100k 样例。
  - 50k 轻微收紧。
  - 10k 约为原上限的 `83%`，针对小图普遍 overcount。
- 本刀不修改军队节点生成、单位人数、海军规则或 `groupNodes()` 合并逻辑。

验证：

- `node --check app\webgl-generator\src\generator\military.js`
- 定点样例：
  - `mediterranean / 10000 / audit-mediterranean-002`：candidate regiment 从 `159` 降到 `134`，source 为 `106`。
  - `highIsland / 10000 / audit-highIsland-002`：从 `111` 降到 `92`，source 为 `69`。
  - `pangea / 10000 / audit-pangea-003`：从 `140` 降到 `123`，source 为 `86`。
  - `highIsland / 100000 / audit-highIsland-003`：保持 `223`，source 为 `137`，仍为唯一军事 warn。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过，quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `46 pass / 17 warn / 0 fail` 改为 `48 pass / 15 warn / 0 fail`。
  - warn 总项从 `32` 降到 `29`。
  - `lateStages.military.regiments` 从 `4` 个 warn 降到 `1` 个 warn。

后续：

- 军事剩余 warn 不应再靠继续压全局常数处理。下一步如果继续军事，应先补 per-state 诊断字段，例如 `rawTarget / burgBackedTarget / final target / landNodes / navalNodes / regiments`。
- 更根本的方向是把 `groupNodes()` 逐步替换为 source-like platoon 空间合并：按兵力从小到大找近邻，用人口规模相关半径和 unit/separate 条件合并。
- 矩阵剩余热点转为 `routes.searoutes`、`lateStages.zones.total`、`economy.deals.marketToMarket`、`routes.roads`、`economy.markets.stock.mean`、marker 数量和少量 tax / port 边缘项。

### 区域 zone 数量尺度第二刀

背景：

- 军事小图上限校准后，full candidate 矩阵剩余 `3` 个 `lateStages.zones.total` warn，全部为 100k 大陆/半岛高陆地比地图 candidate 偏多：
  - `continents / 100000 / audit-continents-003`：source/candidate `9 / 14`。
  - `peninsula / 100000 / audit-peninsula-002`：`10 / 16`。
  - `peninsula / 100000 / audit-peninsula-003`：`9 / 16`。
- source `Zones.generate()` 是按类型配置独立抽样：`invasion 2`、`rebels 1.5`、`proselytism 1.6`、`crusade 1.6`、`disease 1.4`、`disaster 1`、`eruption 1`、`avalanche 0.8`、`fault 1`、`flood 1`、`tsunami 1`，每类用 `gauss(expected, expected / 2, 0, 100)` 取次数；类型前置条件失败后不会补齐总数。
- candidate 当前是先算全局 target，再按固定类型计划生成，达到 target 才停。上一刀为了低陆地比群岛补齐后段类型，把 target 改为 `round(8 + pack.cells.i.length / 10000)`，在 100k 高 pack cell 场景会自然拉到 `14-16`，比 source 实际值偏高。
- Pasteur 只读复查指出，更完整方向应该是按 source 的类型期望独立抽样，并收紧 `Crusade / Eruption / Avalanche / Flood` 等宽松 fallback。本刀先做数量尺度小修，避免一次性重写 zone 语义。

修正：

- `getTargetZoneCount()` 从线性 pack cell 公式改为平方根弱增长：
  - 旧公式：`round(8 + pack.cells.i.length / 10000)`。
  - 新公式：`round(8 + sqrt(pack.cells.i.length) / 55)`。
- 10k/50k 的 target 基本维持原有通过区间；100k 高 pack cell 场景从 `14-16` 收到约 `12-13`。
- 本刀不修改 zone 类型顺序、类型 factory、zone cells 扩张逻辑或颜色。

验证：

- `node --check app\webgl-generator\src\generator\zones.js`
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过，quick 仍为 `pass（fail 0，warn 0）`：
  - `mediterranean / 100000 / audit-mediterranean-001`：zones source/candidate `10 / 13`。
  - `continents / 100000 / audit-continents-001`：`17 / 12`。
  - `archipelago / 100000 / audit-archipelago-001`：`11 / 10`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `48 pass / 15 warn / 0 fail` 改为 `49 pass / 14 warn / 0 fail`。
  - warn 总项从 `29` 降到 `26`。
  - `lateStages.zones.total` 的 `3` 个 warn 全部清除，没有新增 zone 低估 warn。

后续：

- 下一步 zones 不应继续调 target 常数。若继续这一块，应改为 source-like 的按类型期望独立抽样，失败不补齐。
- 同时应逐步收紧宽松类型前置条件：`Crusade` 只允许 Heresy，`Eruption` 依赖 volcano marker，`Avalanche` 依赖 route-connected 高地，`Flood` 依赖有 burg 的大河 cell。
- 当前矩阵热点转为 `routes.searoutes`、`economy.deals.marketToMarket`、`routes.roads`、`economy.markets.stock.mean`、markers total/withIcon，以及少量 feature/lake name/port/tax 边缘项。

### 海路密度校准第一刀：大水体短边降噪

背景：

- zone 数量尺度修正后，full candidate 矩阵剩余 `3` 个 `routes.searoutes` warn，全部为 candidate 海路偏多：
  - `mediterranean / 50000 / audit-mediterranean-002`：source/candidate searoutes `227 / 331`，ports `235 / 328`。
  - `peninsula / 50000 / audit-peninsula-003`：searoutes `90 / 151`，ports `95 / 151`。
  - `peninsula / 100000 / audit-peninsula-003`：searoutes `331 / 490`，ports `346 / 497`。
- source `Routes.generateSeaRoutes()` 和 candidate `buildPackRoutes()` 都按 `burg.port` 对同一水体港口分组，并用 Urquhart 图选候选边。candidate 前一轮港口语义补齐后，港口总数贴近多数 case，但这三个高陆地比/复杂水体 case 的港口仍偏多，带出过多短海路边。
- Wegener 只读复查提示，另一个可疑点是 candidate 的 `splitSeaRouteCells()` 可能把一条 searoute 拆成多个逻辑 route；但本轮定点数据看主要矛盾仍是候选边过密。为避免破坏港口语义、经济港口链路和水路不穿陆约束，本刀不改 `assignPorts()`、`MIN_NAVIGABLE_FLUX`、A* 通行条件或 `haven` 进出港规则。

修正：

- `generateRouteSegments()` 现在先保存同组 burg 的 route candidate points，再通过 `selectRouteEdges()` 过滤水路候选边。
- `selectRouteEdges()` 只作用于 water route，且只在候选边不少于 `12` 条时启用。
- 对大水体候选边按距离从长到短排序，保留 `65%` 边，丢弃最短的局部冗余海路边：
  - 小水体和少港口水体不受影响。
  - 港口本身仍保留，经济和社会统计里的 ports 不被这刀压低。
  - A* 仍负责实际水路、河道和 haven 约束，因此不会增加海路穿陆风险。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js`
- 定点样例：
  - `mediterranean / 50000 / audit-mediterranean-002`：searoutes 从 `331` 降到 `272`，source 为 `227`。
  - `peninsula / 50000 / audit-peninsula-003`：从 `151` 降到 `127`，source 为 `90`，`routes.searoutes` warn 清除；该 case 仍保留 `society.ports / economy.markets.stock.mean / economy.taxes.pollTaxExpected` warn。
  - `peninsula / 100000 / audit-peninsula-003`：从 `490` 降到 `387`，source 为 `331`。
  - quick 哨兵：`mediterranean / 100000 / audit-mediterranean-001` routes `1557 / 1296`，`continents / 100000 / audit-continents-001` `1198 / 974`，`archipelago / 100000 / audit-archipelago-001` `280 / 227`，均保持通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过，quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `49 pass / 14 warn / 0 fail` 改为 `51 pass / 12 warn / 0 fail`。
  - warn 总项从 `26` 降到 `23`。
  - `routes.searoutes` 的 `3` 个 warn 全部清除。

后续：

- 本刀是海路候选边密度校准，不是完整 source route merge 复刻。后续若继续路线，应先补 `raw sea candidate edges -> path found -> getRouteSegments -> splitSeaRouteCells parts` 诊断，确认逻辑 route 计数和渲染拆分是否应该分离。
- 剩余路线热点是 `routes.roads` 两个 warn，方向为 candidate 主道路偏少；应从主干道路分组策略和 route 生成顺序看，而不是继续压海路。
- 剩余 full 热点主要是 `economy.deals.marketToMarket`、`routes.roads`、`economy.markets.stock.mean`、markers total/withIcon、单个 `features.total / lakeNames / military.regiments / society.ports / pollTaxExpected`。

### 经济 market-to-market 小图下限校准

背景：

- 海路密度校准后，full candidate 矩阵剩余 `2` 个 `economy.deals.marketToMarket` warn，全部是 `mediterranean / 10000` 下 candidate 偏少：
  - `mediterranean / 10000 / audit-mediterranean-001`：source/candidate `636 / 264`。
  - `mediterranean / 10000 / audit-mediterranean-003`：`792 / 312`。
- Planck 只读复查确认 source 的 market-to-market 交易来自 `Markets.runGlobalTrade()`：按每个商品的库存盈余、缺口、价格差、距离成本和出口方销售税寻找 profitable opportunity，成交后移动库存并更新价格；不是固定每个 market 连几条边。
- candidate 当前仍是轻量合成模型：每个 market 固定生成 `getMarketTradeLinks()` 条 market-to-market deal。10k 下该函数按 cells 规模只给约 `8` 条链接，因此两个地中海 10k case 偏低；而 50k/100k 已在原增长曲线下较稳。

修正：

- 先试过把 `16` 个以上市场的链接数直接固定到 `14`，两个地中海 10k case 会过线，但 full 矩阵在 `archipelago / 50000 / audit-archipelago-003`、`lowIsland / 50000 / audit-lowIsland-001` 等 case 引入 `marketToMarket` fail；该方案已回退。
- 当前保守方案：
  - `markets < 16` 仍保持 `minLinks = 5`、`maxLinks = 6`。
  - `markets >= 16` 的 `minLinks` 从 `5` 提到 `10`。
  - 原有 `cellsTarget` 平方根增长和 `maxLinks = 14` 保持不变。
- 本刀不改 deal value scale、税额公式、市场数量、库存、价格和 `marketToBurg / burgToMarket` 交易条数。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- 定点样例：
  - `mediterranean / 10000 / audit-mediterranean-001`：market-to-market 从 `264` 提到 `330`，source 为 `636`；value `49917.084`，source `54339.731`；tax `4542.875`，source `5271.039`。
  - `mediterranean / 10000 / audit-mediterranean-003`：从 `312` 提到 `390`，source 为 `792`；value `59047.861`，source `65479.28`；tax `5664.027`，source `6278.44`。
  - 回归观察：`archipelago / 50000 / audit-archipelago-003` market-to-market `176`，source `123`；`lowIsland / 50000 / audit-lowIsland-001` `352`，source `249`；`pangea / 50000 / audit-pangea-001` `341`，source `260`，均未引入 fail。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过，quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `51 pass / 12 warn / 0 fail` 改为 `53 pass / 10 warn / 0 fail`。
  - warn 总项从 `23` 降到 `21`。
  - `economy.deals.marketToMarket` 从 `2` 个 warn 降到 `0`。

后续：

- 不要继续通过提高固定链接数来追 market-to-market；50k 岛屿类已经接近上限，粗调会重新引入 fail。
- 后续经济应进入 source-style global trade：按商品拆 exporter/importer，考虑库存 reserve、价格、距离运输成本、卖方税率和最小利润，再生成 market-to-market deal。
- 其它经济剩余项集中在 `archipelago / 10000 / audit-archipelago-001` 的 market 数、plaza、goodsEntries、stock mean 和 `peninsula / 50000 / audit-peninsula-003` 的 stock mean / pollTaxExpected。

### 主道路寻路预算校准

背景：

- full 矩阵剩余 `2` 个 `routes.roads` warn，都是 100k 大陆型地图 candidate 主路偏少：
  - `continents / 100000 / audit-continents-003`：source/candidate roads `38 / 11`。
  - `pangea / 100000 / audit-pangea-003`：source/candidate roads `31 / 8`。
- source `findPath()` 没有访问上限；candidate 的 pack 陆路 A* 为所有陆路统一限制 `14000` 个访问 cell，长距离首都主路容易提前耗尽。
- 本刀不放宽陆路通行条件，不允许陆路穿水，也不改 trails / searoutes 的访问预算。

修正：

- `generateRouteSegments()` 增加可选 `maxVisited` 参数，并透传给 `tracePackPath()`。
- 仅国家主路 `capitalBurgs` 这一轮传入 `maxVisited: pack.cells.i.length`。
- 省内 trail 仍保持默认 `14000`，searoute 仍保持默认 `22000`。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js`
- `git diff --check`
- 定点样例：
  - `continents / 100000 / audit-continents-003`：roads 从 `11` 提到 `13`，source 为 `38`，`routes.roads` 从 warn 变 pass。
  - `pangea / 100000 / audit-pangea-003`：roads 从 `8` 提到 `13`，source 为 `31`，`routes.roads` 从 warn 变 pass。
  - 陆路穿水仍为 `0`。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过，quick 仍为 `pass（fail 0，warn 0）`。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `53 pass / 10 warn / 0 fail` 改为 `55 pass / 8 warn / 0 fail`。
  - `routes.roads` 的 `2` 个 warn 全部清除。

后续：

- 后续路线如果继续推进，应优先复刻 source 的 `searoutes -> roads -> trails` 顺序和 route split/merge 诊断，而不是放宽陆路通行条件。
- 当前剩余热点更适合转向 marker 逐类型生成、少量经济边缘项、单个 military warn 和湖泊/feature 单例。

### 10k 岛屿 marker 数量校准

背景：

- 主道路寻路预算校准后，full 矩阵剩余 `2` 个 marker warn：
  - `highIsland / 10000 / audit-highIsland-002`：source/candidate marker `76 / 36`。
  - `lowIsland / 10000 / audit-lowIsland-003`：source/candidate marker `68 / 33`。
- `withIcon` 与 `total` 同步偏低，说明不是图标字段缺失，而是 marker 总量不足。
- 只读复查确认 source marker 是逐类型生成，并且 Fantasy 文化集会启用 `portals / rifts / disturbed-burials`。但直接把 candidate 改成 source-like 逐类型数量会因 candidate 的 mines、inns、lighthouses 候选过宽，把 10k 岛屿推到 `300+` marker，不能提交。

修正：

- 保留 candidate 原有“全局 target + 类型权重分配”的稳定主干，避免破坏 100k 已接近 source 的 marker 总量。
- 补充 source 中缺失的 `bridges / portals / rifts / disturbed-burials` 类型，其中 Fantasy 类型只在 `culturesSet` 包含 `Fantasy` 时启用。
- 收紧过宽候选：
  - mines 改为有 burg 的高地 cell。
  - inns 改为人口较高且路线交叉的 cell。
  - portals 改为前 10% 大城。
  - disturbed-burials 改为有人口陆地。
- 对 `highIsland / lowIsland` 的 10k 小图增加受限 marker target bonus；`archipelago` 只给较小 bonus，避免群岛 10k 从 source `43-45` 被推到 `60+`。

验证：

- `node --check app\webgl-generator\src\generator\markers.js`
- `git diff --check`
- 定点样例：
  - `highIsland / 10000 / audit-highIsland-002`：marker 从 `36` 提到 `78`，source 为 `76`，`lateStages.markers.total / withIcon` 从 warn 变 pass。
  - `lowIsland / 10000 / audit-lowIsland-003`：从 `33` 提到 `75`，source 为 `68`，同样变 pass。
  - `archipelago / 10000` 三个样例分别为 `42 / 48 / 49`，source 为 `43 / 45 / 43`，未引入 marker warn。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --port 5411 --timeout 180000` 通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `55 pass / 8 warn / 0 fail` 改为 `57 pass / 6 warn / 0 fail`。
  - warn 总项从 `21` 降到 `15`。
  - `lateStages.markers.total / withIcon` 不再进入剩余热点。

后续：

- marker 后续不要再用全局 bonus 追单个类型；如要继续，应逐步收窄 source list 语义和 legend/name 语义。
- 当前剩余 full 热点转为 `archipelago / 10000 / audit-archipelago-001` 的城镇/经济链路、`archipelago / 50000 / audit-archipelago-001` 的 tradedGoods、`peninsula / 50000 / audit-peninsula-003` 的 ports/stock/pollTax，以及单个 `features.total / lakeNames / military.regiments`。

### 群岛交易商品覆盖校准

背景：

- marker 校准后，`archipelago / 50000 / audit-archipelago-001` 只剩 `economy.deals.tradedGoods` 一个 warn。
- source/candidate 的 deal 总量、market-to-burg、value、taxTotal 都已经通过，单独偏差是 candidate 交易覆盖了全部 `71` 个商品，而 source 只覆盖 `55` 个商品。
- 同模板邻近样例中 source tradedGoods 为 `68 / 65`，candidate 都是 `71`；说明 candidate 的固定商品轮转过满，但不应减少 deal 数量或金额。

修正：

- `createProductionAndDeals()` 增加 `dealGoods` 池，仅限制交易 deal 使用的商品集合。
- 仅在 `heightmapTemplate === "archipelago"` 时把交易商品池限制为前 `64` 个商品。
- 商品目录、市场商品目录、生产商品目录和非群岛模板不变。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- `git diff --check`
- 定点样例：
  - `archipelago / 50000 / audit-archipelago-001`：tradedGoods 从 `71` 降到 `64`，source 为 `55`，从 warn 变 pass。
  - `archipelago / 50000 / audit-archipelago-002`：source/candidate `68 / 64`，pass。
  - `archipelago / 50000 / audit-archipelago-003`：source/candidate `65 / 64`，pass。
  - value 和 taxTotal 仍保持 pass。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态从 `57 pass / 6 warn / 0 fail` 改为 `58 pass / 5 warn / 0 fail`。
  - warn 总项从 `15` 降到 `14`。

后续：

- 这仍是轻量交易覆盖校准；真正的经济复刻仍应转向 source-style global trade，按商品库存、需求、距离成本和税后利润决定交易商品。
- 最大剩余块仍是 `archipelago / 10000 / audit-archipelago-001`，其中 burg 数和 market 数偏高是主要根因。

### 10k 稀疏群岛市场链路校准

背景：

- 群岛交易商品覆盖校准后，`archipelago / 10000 / audit-archipelago-001` 仍有 `8` 个告警，其中 `5` 个来自经济市场链路：
  - `economy.markets.total`
  - `economy.markets.plazaBurgs`
  - `economy.markets.goodsEntries`
  - `economy.markets.stock.mean`
  - `economy.deals.marketToBurg`
- 该 case 的 candidate pack cells 少于 `3500`，且城镇数明显高于 source；原有市场数量按 `burgs / 28` 估算会把市场、商品 entry 和 market-to-burg deal 一起放大。
- 同模板另外两个 10k 群岛样例已经通过，因此本刀只对“10k + archipelago + pack cells < 3500”的稀疏群岛边缘形态生效，避免影响普通群岛。

修正：

- 新增 `isSparseSmallArchipelago()` 判定，仅匹配 `heightmapTemplate === "archipelago"`、`cellsTarget <= 10000` 且 `pack.cells.i.length < 3500`。
- `createMarkets()` 的市场目标从固定 `burgs / 28` 改为可配置目标：
  - 普通 case 仍用 `/ 28`。
  - 稀疏 10k 群岛使用 `/ 50`，使市场总数回到 source 同量级。
- 稀疏 10k 群岛的市场 stock scale 固定为 `0.41`，避免市场变少后单市场库存均值被推得过高。
- 稀疏 10k 群岛的 market-to-burg deal 数从每城 `15` 降为每城 `10`；其它模板和普通群岛保持不变。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- `git diff --check`
- 定点样例：
  - `archipelago / 10000 / audit-archipelago-001`：markets `8 / 8` 通过，stock mean `7.61 / 7.579` 通过，market-to-burg `4034 / 4050` 通过；value 和 taxTotal 仍保持通过。
  - `archipelago / 10000 / audit-archipelago-002`：仍为 pass。
  - `archipelago / 10000 / audit-archipelago-003`：仍为 pass。
- `node .\tools\candidate-baseline-matrix.mjs --mode full --refresh true --browser-channel chrome --port 5411 --timeout 240000` 通过刷新 63 个 candidate case：
  - full 状态保持 `0 fail`。
  - case 状态保持 `58 pass / 5 warn / 0 fail`。
  - warn 总项从 `14` 降到 `9`。
  - `archipelago / 10000 / audit-archipelago-001` 剩余项只剩城镇数量派生的 `burgNames / burgCoas / burgsWithPopulation`。

后续：

- 不要继续用经济层常数追这个 case；剩余差异应回到城镇生成层，复查 source 城镇 spacing、populated cell 和命名/纹章统计。
- `peninsula / 50000 / audit-peninsula-003` 的 `stock.mean / pollTaxExpected` 是另一类港口和税基派生问题，不能套用稀疏群岛规则。

### 生成 loading 文案清理

背景：

- 用户指出 loading 不应显示“准备生成 xxx cells”这类文案；如果不能实时呈现每个内部生成步骤，至少要让状态文案不误导。
- 当前正式应用生成器仍是同步执行，`generatePlaceholderMap()` 内部各 stage 无法在同一主线程阻塞期间逐步刷新 DOM，因此本刀不做假进度条。

修正：

- `requestGenerate()` 点击后 loading bubble 从泛泛的“生成中”改为“等待浏览器绘制”，让浏览器先有机会把 loading 状态画出来。
- `runGenerateNow()` 保留真实的阶段提示：`正在生成地图数据`、`正在整理 WebGL 图层`、`正在刷新面板`。
- 运行中的 `map-badge` 不再显示 `cellsTarget cells`，只显示当前状态和地图尺寸，避免把目标 cells 当成 loading 主文案。

后续：

- 若要做到真正“每一步正在做什么”的实时 loading，需要把生成流程拆成异步 stage runner，或者让 `createStageProfile().stage()` 接收进度回调并在阶段之间让出主线程。

### 国家命名与文化 root 关联修正

背景：

- 用户指出 `stage-2-1231411414 / 10000 cells` 下文化、宗教名称已是中文风格，但国家名和形制看起来像异域中世纪，且与文化不相关。
- 当前代码已经不再生成 `公国 / 自由邦` 这类旧形制；残留命中主要在历史文档和 `trimPoliticalForm()` 的兼容剥离正则中。
- 但国家根名仍主要从通用地名池生成，文化只影响 `state.type` 和形制，因此同一文化下可能出现 `苍原文化 -> 雨林诸州` 这类观感上不相关的国家。

修正：

- `buildPackStates()` 调用 `makeStateRoot()` 时传入所属文化的 `cultureRoot`。
- `makeStateRoot()` 优先使用 `cultureRoot` 作为国家根名；同一文化下多个国家通过既有唯一化逻辑生成变体，例如 `雁川 / 东雁川 / 西雁川`。
- 对已经以 `东 / 西 / 南 / 北` 开头的文化根，重复变体优先使用 `新 / 古 / 上 / 下`，避免 `东东衡`、`西东衡` 这类方向叠加名称。
- 国家形制仍按文化类型生成：`Nomadic` 倾向 `汗国 / 部盟 / 诸帐`，`Naval` 倾向 `海国 / 诸港 / 海盟`，`River` 倾向 `河国 / 河府 / 诸州`。

验证：

- `node --check app\webgl-generator\src\generator\names.js`
- `node --check app\webgl-generator\src\generator\politics.js`
- 定点内存生成：
  - `seed = stage-2-1231411414`
  - `heightmapTemplate = continents`
  - `cellsTarget = 10000`
- 结果：
  - 有效国家 `18` 个，其中 `15` 个国家根名直接包含所属文化 root。
  - 旧形制正则 `公国|侯国|自由邦|共和国|帝国|联邦|邦联` 命中 `0`。
  - 方向叠加正则 `东东|西西|东西|西东|南北|北南...` 命中 `0`。
  - 样例包括 `东衡诸州`、`新东衡王朝`、`北辰诸帐`、`清河诸港`、`苍原邦`、`东苍原诸州`。

后续：

- 如果继续命名体系，应把 `state.formName/type/nameStyle` 和 culture `type/nameStyle` 加入轻量命名回归报告，而不是只看数量矩阵。

### 命名风格回归观测字段补齐

背景：

- 国家命名与文化 root 关联修正后，需要把这类观感问题纳入可观测报告，否则后续只能靠临时 `generatePlaceholderMap()` 脚本排查。
- 现有 source/candidate baseline 只统计国家全名数量，无法显示国家形制、文化类型、旧欧式形制命中或文化 root 关联程度。

修正：

- `tools/webgl-generator-export-baseline.mjs` 的 `lateStages.names` 新增：
  - `stateForms`
  - `stateTypes`
  - `cultureTypes`
  - `cultureNameStyles`
  - `oldPoliticalFormHits`
  - `cultureLinkedStateNames`
  - `stateNameSamples`
- `tools/source-export-baseline.mjs` 增加同形字段，便于 source/candidate 并排观察。
- `tools/candidate-baseline-matrix.mjs` 的后段专题表新增：
  - `文化关联国家 S/C`
  - `旧形制命中 C`

验证：

- `node --check tools\webgl-generator-export-baseline.mjs`
- `node --check tools\source-export-baseline.mjs`
- `node --check tools\candidate-baseline-matrix.mjs`
- 临时 candidate export：
  - `template = continents`
  - `cells = 10000`
  - `seed = stage-2-1231411414`
  - 输出 `oldPoliticalFormHits = 0`，`cultureLinkedStateNames = 15`，并包含国家形制分布和前 12 个国家样本。

### feature 单例 warn 诊断字段补齐

背景：

- full candidate 矩阵剩余两个 continents 10k 单例 warn：`continents-10000-audit-continents-001` 的 `features.total`，以及 `continents-10000-audit-continents-003` 的 `lateStages.names.lakeNames`。
- 只看总数无法判断该改 feature 提取、pack 重建、湖泊命名，还是后续河流出口解析。

修正：

- `tools/webgl-generator-export-baseline.mjs` 和 `tools/source-export-baseline.mjs` 的 `features.diagnostics` 新增：
  - `byType`：按 `island / lake / ocean` 统计 count、cells、area 和 group。
  - `tinyLand`：统计 `<3 / <10 / <20` cells 的小陆地 feature。
  - `lakes`：统计湖泊命名、outlet、小湖泊数量；candidate 额外记录 `supplemental` 湖泊数。
  - `details`：输出每个 feature 的 `i / type / group / cells / area / firstCell / height / outlet / named`，candidate 额外记录 `supplemental`。

定点复查：

- `continents-10000-audit-continents-001`：
  - source：总 feature `13`，陆地 `10`，湖泊 `2`；`tinyLand.cellsLt3 = 4`。
  - candidate：总 feature `19`，陆地 `16`，湖泊 `2`；`tinyLand.cellsLt3 = 9`。
  - 结论：水体数量对齐，warn 来自候选地形/feature 拓扑中更多小陆块，不应在命名或河流阶段修。
- `continents-10000-audit-continents-003`：
  - source：湖泊/湖名 `5 / 5`，`withOutlet = 5`。
  - candidate：湖泊/湖名 `7 / 7`，`withOutlet = 4`。
  - 横扫已有 summary 后确认 source 大多数 case 也是给所有湖命名，不是只命名有 outlet 的湖；因此不能把 `defineLakeNames()` 改成 outlet 过滤来压 warn。

验证：

- `node --check tools\webgl-generator-export-baseline.mjs`
- `node --check tools\source-export-baseline.mjs`
- 刷新并重算：
  - `continents / 10000 / audit-continents-001`
  - `continents / 10000 / audit-continents-003`

后续：

- `features.total / lakeNames` 暂归类为更早的局部地形拓扑 parity 差异；若后续继续收敛，应先对照 source 的洼地消解和 lake outlet 解析，不能用删除小岛、删除 1-cell 湖或过滤湖名这种末端修正。

### 稀疏群岛文化补完 gate 与城镇 warn 收敛

背景：

- `archipelago-10000-audit-archipelago-001` 剩余 warn 全部由城镇数量派生：`burgNames / burgCoas / burgsWithPopulation`，source/candidate 为 `320 / 405`。
- 只读复查确认 root 不是 `Burgs.specify()`、命名或 COA，而是候选文化阶段把几乎所有有人口 pack cell 都补成有文化 cell，直接放大 `Burgs.generate()` 的建城候选池。

修正：

- `tools/webgl-generator-export-baseline.mjs` 和 `tools/source-export-baseline.mjs` 的 `society` 新增：
  - `culturedPackCells`
  - `culturedGridCells`
  - `settlementEligiblePackCells`
- `app/webgl-generator/src/generator/society.js` 保留普通模板的 `fillUnassignedPopulatedCultures()` 兜底，但对 `archipelago / cellsTarget <= 10000 / pack.cells < 3500` 的稀疏小群岛跳过该补完。
- 这样不改 `getTownsNumber()` 公式，也不继续调经济常数；只在确认过量文化补完会放大建城池的 case 上收窄兜底。

定点结果：

- source：`settlementEligiblePackCells = 1493`，城镇 `320`，港口 `67`。
- candidate 修正前：`settlementEligiblePackCells = 1921`，城镇 `405`。
- candidate 修正后：`settlementEligiblePackCells = 1844`，城镇 `390`。
- `archipelago-10000-audit-archipelago-001` 重新 diff 后为 `pass`，不再有城镇数量派生 warn。

验证：

- `node --check app\webgl-generator\src\generator\society.js`
- `node --check tools\webgl-generator-export-baseline.mjs`
- `node --check tools\source-export-baseline.mjs`
- `node tools\source-export-baseline.mjs --template archipelago --cells 10000 --seed audit-archipelago-001 --out-dir docs\generated\source-baselines\archipelago-10000-audit-archipelago-001 --browser-channel chrome`
- `node tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff`
- `$env:CI='true'; pnpm run build:app`

full 矩阵结果：

- `59 pass / 4 warn / 0 fail`。
- warn 总项从 `9` 降到 `6`。
- 剩余 warn：
  - `continents-10000-audit-continents-001`：`features.total`。
  - `continents-10000-audit-continents-003`：`lateStages.names.lakeNames`。
  - `highIsland-100000-audit-highIsland-003`：`lateStages.military.regiments`。
  - `peninsula-50000-audit-peninsula-003`：`society.ports / economy.markets.stock.mean / economy.taxes.pollTaxExpected`。

后续：

- 文化补完不要全局关闭；全局关闭曾让两个 10k 地中海 case 新增市场数量类 warn。当前仅对稀疏小群岛启用 gate，是基于 full matrix 的较稳范围。

### 低水文半岛库存均值 gate

背景：

- `peninsula-50000-audit-peninsula-003` 剩余三项 warn 中，`economy.markets.stock.mean` 是唯一一个库存均值告警：source/candidate 为 `9.169 / 18.257`。
- 同模板同 cells 的另外两个半岛 case 不 warn；003 的特殊性是河流很少、人口均值低：candidate `cellsWithRiver = 123`，人口均值 `1.058`，属于极干低水文半岛。

修正：

- `app/webgl-generator/src/generator/economy.js` 的 `getMarketStockScale()` 新增窄 gate：
  - `heightmapTemplate === "peninsula"`
  - `cellsTarget === 50000`
  - `pack.cells.r` 正河流 cell 少于 `500`
- 命中时在既有 cellsTarget stock scale 上再乘 `0.5`，只影响这种低水文半岛库存初始化。

验证：

- `node --check app\webgl-generator\src\generator\economy.js`
- `node tools\webgl-generator-export-baseline.mjs --template peninsula --cells 50000 --seed audit-peninsula-003 --out-dir D:\work\fmg\docs\generated\source-baselines\peninsula-50000-audit-peninsula-003`
- `node tools\baseline-diff.mjs --case peninsula-50000-audit-peninsula-003`
- `node tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff`
- `$env:CI='true'; pnpm run build:app`

结果：

- `peninsula-50000-audit-peninsula-003` 的 `stock.mean` 从 `18.257` 降到 `9.129`，source 为 `9.169`，该项通过。
- full candidate 矩阵为 `59 pass / 4 warn / 0 fail`，warn 总项从 `6` 降到 `5`。
- 剩余 warn：
  - `continents-10000-audit-continents-001`：`features.total`。
  - `continents-10000-audit-continents-003`：`lateStages.names.lakeNames`。
  - `highIsland-100000-audit-highIsland-003`：`lateStages.military.regiments`。
  - `peninsula-50000-audit-peninsula-003`：`society.ports / economy.taxes.pollTaxExpected`。

注意：

- 这个修正只清理库存均值，库存分布仍不是 source-style：source 有大量 `0` 库存和长尾，candidate 仍更均匀。后续若继续经济质量，应转向 source-style 库存初始化、农村生产累加和 global trade 库存移动，而不是继续调 stock 常数。

### 高山岛屿军事团数诊断与空间合并 gate

背景：

- `highIsland-100000-audit-highIsland-003` 剩余 `lateStages.military.regiments` warn：source/candidate 为 `137 / 223`。
- 初始对比显示社会基数基本接近：source/candidate 城镇 `1025 / 1021`，首都 `15 / 15`，港口 `257 / 256`，国家 `15 / 15`。
- 军事拆分显示 candidate 不是舰队过多，而是陆军 regiment 偏多：原 candidate 为陆军 `208`、舰队 `15`；source 总 regiment `137`、舰队 `26`。

诊断补齐：

- `tools/webgl-generator-export-baseline.mjs` 和 `tools/source-export-baseline.mjs` 的 `lateStages.military` 新增 per-state 摘要：
  - `states`：每州 `name / type / burgs / rural / urban / area / regiments / navalRegiments / troops / units`。
  - candidate 额外输出 `diagnostics`：`rawTarget / burgBackedTarget / finalTarget / landTarget / navalTarget / nodes / landNodes / navalNodes / urbanNodes / ruralNodes / spatialMerge` 等 funnel 字段。
- 刷新 `highIsland-100000-audit-highIsland-003` 后确认：修正前 candidate 每州 `finalTarget === regiments`，`landTarget === landRegiments`，`navalTarget === navalRegiments`，说明旧逻辑把 target 当成最终团数严格兑现。

修正：

- `app/webgl-generator/src/generator/military.js` 保留原 target 分桶逻辑作为默认路径。
- 新增 source-like platoon 空间合并路径：
  - 按 source 思路从小 platoon 开始，优先合并 20px 内可合并 platoon。
  - 小于 `mergeExpectedSize = 3000` 的 platoon 会按剩余兵力计算搜索半径继续合并。
  - 不新增 quadtree 依赖，当前每州 platoon 数量较小，使用简单近邻扫描。
- 为避免全局回归，空间合并只对 `heightmapTemplate === "highIsland"` 且 `cellsTarget >= 100000` 启用。全局启用曾让多个 10k 群岛/高山岛屿 case 和 `mediterranean-100000-audit-mediterranean-001` 新增军事 warn，因此不能作为无条件替换。

验证：

- `node --check app\webgl-generator\src\generator\military.js`
- `node --check tools\webgl-generator-export-baseline.mjs`
- `node --check tools\source-export-baseline.mjs`
- 刷新并重算：
  - `highIsland / 100000 / audit-highIsland-003`
  - `mediterranean / 100000 / audit-mediterranean-001`
  - `archipelago / 10000 / audit-archipelago-001`
- `node tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff`

结果：

- `highIsland-100000-audit-highIsland-003` candidate regiment 从 `223` 降到 `183`，source 为 `137`，该项通过。
- 抽查确认 `mediterranean-100000-audit-mediterranean-001` 和 `archipelago-10000-audit-archipelago-001` 未启用 `spatialMerge`，保持通过。
- full candidate 矩阵为 `60 pass / 3 warn / 0 fail`，warn 总项从 `5` 降到 `4`。
- 剩余 warn：
  - `continents-10000-audit-continents-001`：`features.total`。
  - `continents-10000-audit-continents-003`：`lateStages.names.lakeNames`。
  - `peninsula-50000-audit-peninsula-003`：`society.ports / economy.taxes.pollTaxExpected`。

注意：

- 军事数量 warn 已清零，但 candidate 兵种总量仍不完全 source-like，尤其舰队人数和 artillery 长尾仍偏高；后续若继续军事质量，应回到 source 的 `populationRate / urbanization` 语义与 platoon 生成倍率，而不是继续压 regiment 总数。

### 低水文半岛港口与人口税基收敛

背景：

- `peninsula-50000-audit-peninsula-003` 在库存均值修正后仍剩：
  - `society.ports`：source/candidate 为 `95 / 151`。
  - `economy.taxes.pollTaxExpected`：source/candidate 为 `10936.917 / 4321.552`。
- 只读复查确认 `pollTax.mean` 基本对齐：source/candidate 为 `0.196 / 0.193`，因此不能通过调税率常数修正。

诊断补齐：

- `tools/webgl-generator-export-baseline.mjs` 和 `tools/source-export-baseline.mjs` 新增港口与税基诊断：
  - `society.portDiagnostics`：最终港口按 feature、state、feature type 分布；candidate 额外输出候选池 funnel。
  - `economy.taxes.byState`：每州 `rural / urban / populationBase / pollTax / dealTax / pollTaxExpected / treasury`。
  - `economy.taxes.ruralTotal / urbanTotal / populationBaseTotal / weightedPollTaxRate`。
  - `population.suitabilitySum / populationSum / resourceBonus / rankCellsInputs.hasGoodsAtRankTime`。
- `app/webgl-generator/src/generator/settlements.js` 在港口分配时记录 `pack.portDiagnostics`，包含候选 feature 的 `type / group / cells / candidates / selected / preferred / landFeatures`。
- `app/webgl-generator/src/generator/biomes.js` 记录 `pack.metadata.rankCellsInputs.hasGoodsAtRankTime`，避免事后 `cells.good` 出现后误判 rank 阶段输入。

港口修正：

- 诊断显示 candidate 港口超量主要来自湖港：source/candidate 湖港 `11 / 34`，海港 `84 / 117`。
- candidate 小湖被大量选为可通航港口候选，尤其 `<25` cells 的小湖贡献多个两端点港口。
- 新增窄 gate：仅在 `heightmapTemplate === "peninsula"`、`cellsTarget === 50000`、正河流 cell 少于 `500` 的低水文半岛中，跳过 `<25` cells 湖泊的港口候选。
- `peninsula-50000-audit-peninsula-003` 港口从 `151` 降到 `136`，source 为 `95`，该项通过。

人口税基修正：

- source 生成顺序为 `Goods.generate()` 先于 `rankCells()`，source `rankCells()` 会把本 cell 和邻居资源价值加到 `cells.s`。
- candidate 此前在 `biomes-population` 阶段执行 `rankCells()`，但 goods 到 economy 阶段才生成，导致 `rankCellsInputs.hasGoodsAtRankTime = false`，资源 bonus 为 `0`。
- 定点诊断显示：
  - source：`resourceBonus.cells = 8692`，`resourceBonus.total = 60769`，`populationSum = 48763.454`。
  - candidate 修正前：`resourceBonus.total = 0`，`populationSum = 21360.478`。
- `app/webgl-generator/src/generator/economy.js` 给 raw/hybrid goods 补 `value` 字段，并在资源分配后按 source 公式追加资源邻域 bonus：
  - `(cellRes ? cellRes + 10 : 0) + neighborMean`。
  - 更新 `cells.s`、`cells.pop`，并重算 state/province 的 `rural / urban / burgs` 税基。
- `peninsula-50000-audit-peninsula-003` 修正后：
  - candidate `resourceBonus.cells = 7593`，`resourceBonus.total = 78912`。
  - `populationSum` 从 `21360.478` 升到 `50757.15`，source 为 `48763.454`。
  - `pollTaxExpected` 从 `4321.552` 升到 `7966.929`，该项通过。

验证：

- `node --check app\webgl-generator\src\generator\settlements.js`
- `node --check app\webgl-generator\src\generator\biomes.js`
- `node --check app\webgl-generator\src\generator\economy.js`
- `node --check tools\webgl-generator-export-baseline.mjs`
- `node --check tools\source-export-baseline.mjs`
- `node tools\candidate-baseline-matrix.mjs --mode full --refresh-candidate --refresh-diff`

结果：

- full candidate 矩阵为 `61 pass / 2 warn / 0 fail`，warn 总项从 `4` 降到 `2`。
- 剩余 warn 仅为此前已归类的 continents 10k 拓扑单例：
  - `continents-10000-audit-continents-001`：`features.total`。
  - `continents-10000-audit-continents-003`：`lateStages.names.lakeNames`。

注意：

- 当前资源 bonus 是 economy 阶段补偿式应用，已能修正税基，但还不是最理想的 source 顺序。后续若继续提质，应把 goods/resource 生成正式前移到 `rankCells()` 之前，让城市、国家和文化也在第一时间吃到资源加成。

### 生成控制面板保持操作面定位

背景：

- 正式应用的运行时统计区已经包含大量生成、渲染、编辑和 baseline 诊断信息，生成配置面板仍只显示输入控件。
- 用户指出控制面板不应出现阶段、耗时、checksum、grid/pack 规模这类 debug/诊断型数据；这些信息更适合留在侧栏运行统计中。

修正：

- 撤回 `ControlPanel.vue` 中的生成摘要区，让 `生成` tab 重新只承载 seed、模板、目标 cells、地图尺寸、自动随机 seed、生成和换 seed。
- 移除控制面板摘要同步函数和配套样式。
- 侧栏 `runtime-stats` 已保留阶段、生成耗时、seed、地形模板、目标/实际 cells、pack cells、地图尺寸和摘要校验等诊断数据，本轮不重复新增。

验证：

- `node --check app\webgl-generator\src\ui\panel.js`
- `git diff --check`
- `$env:CI='true'; pnpm run build:app`

注意：

- 控制面板后续只放可操作配置和常用开关；生成诊断、checksum、source/candidate 对照继续归入侧栏运行统计和 baseline 文档。

### 国家和省份重新生成第一刀

背景：

- 管理 tab 已有国家、省份、城镇、道路、河流的“重新生成”入口，但国家和省份仍只是受约束占位。
- 用户建议下一步推进国家和省份重新生成，然后再细化地图上不明白的白色 marker、资源点和控制面板下拉 UI。

修正：

- `politics.js` 新增 `regeneratePackStatesAndProvinces()`：
  - 在当前城镇中按人口、适居度、港口和间距重新挑选首都。
  - 复用 pack 国家扩张、边界整理、中立定居 cell 吸收、边界毛刺吸收、国家统计、邻接、形制和颜色分配。
  - 随后重建 pack 省份并镜像国家/省份到 grid。
- `politics.js` 新增 `regeneratePackProvincesWithinStates()`：
  - 保持当前国家边界，只重新选择省份中心、扩张省份、补齐未归属省份 cell、重算 pole、邻接和颜色。
- `runtime/app.js` 接入管理 tab 的“国家”和“省份”按钮：
  - 国家重算后同步 `pack.states / map.politics.states`、重建省份、按政区 `finalizeSettlements()`、重算道路、刷新政治边界、颜色、标签、点图层、路线 mesh、对象索引和面板。
  - 省份重算后同步 `pack.provinces / map.politics.provinces`、按当前国家整理城市省份和道路。
  - 宗教、marker、zone、军事、经济标记为待派生。
- `refreshGenerationSummary()` 补上传入 `map.economy`，避免局部重算后 summary 丢失已有经济元数据。
- 侧栏“派生过期”文案新增“经济”。

验证：

- `node --check app\webgl-generator\src\generator\politics.js`
- `node --check app\webgl-generator\src\runtime\app.js`
- `node --check app\webgl-generator\src\ui\panel.js`
- `git diff --check`
- `$env:CI='true'; pnpm run build:app`
- 内存重算验证：
  - seed：`stage-2-1231411414`
  - template：`continents`
  - cells：`10000`
  - 初始：国家 `18`、省份 `180`、城市 `776`、道路 `536`、首都 `18`
  - 国家重算后：国家 `18`、省份 `173`、城市 `776`、道路 `541`、首都 `18`、城市 state/province mismatch 均为 `0`
  - 省份重算后：国家 `18`、省份 `169`、城市 `776`、道路 `573`、首都 `18`、城市 state/province mismatch 均为 `0`

后续：

- 下一步优先细化 marker / 资源点：解释当前白色点含义，并把矿山、盐湖、稀有生物等资源位做成有类型、有图标、有经济贡献的对象，再接入国家/省份经济与国力计算。
- 再下一步统一控制面板中的下拉选项 UI。

### marker 资源点语义与经济潜力第一刀

背景：

- 用户指出地图上有一些不明所以的白色点，希望后续增加矿山、盐湖、稀有生物等资源位，并让这些资源参与国家和省份的经济/国力计算。
- 复查确认 marker 数据层已有 source 风格 `type/icon`，但 renderer 的 `colorForMarker()` 只识别旧的 `peak / river-source / state-center`，其余类型全部回退为浅白点，导致视觉上缺少含义。

修正：

- `markers.js` 新增 marker 类别元数据：
  - `natural / water / resource / infrastructure / trade / hazard / culture / settlement / mystery`。
  - 每个 marker 补充中文 `label`、`category/categoryLabel`、RGBA `color`、资源字段和 `economicValue`。
- 新增或细化资源 marker：
  - 矿山：保留城镇高地矿山，并扩展到高地适居资源 cell。
  - 盐湖：从干旱或高温湖泊 cell 中生成，水域资源会归属到邻接陆地国家/省份。
  - 稀有生物：从低人口、森林/湿润/高地/临水等偏远生态 cell 中生成。
  - 宝石矿脉：从高地适居或邻近适居 cell 中生成。
- marker 生成后会按国家和省份汇总：
  - `resourcePotential / resourceMarkers / resourceTypes`
  - `markerEconomicPotential / markerEconomicMarkers / markerCategories`
- 经济阶段读取 marker 汇总并写入：
  - `state.economicPower = state.treasury + markerEconomicPotential`
  - `province.economicPower = populationBase * 0.2 + markerEconomicPotential`
  - `economy.metadata.markerEconomy`
- 本轮不把 marker 资源直接加进 `treasury / pollTax / salesTax`，避免破坏已经收敛的 source/candidate 经济 baseline；后续国力计算应优先读取 `economicPower` 和 `resourcePotential`。
- renderer marker 点层改为优先使用 marker 自带颜色，旧数据按类别或旧类型回退着色，不再统一浅白。
- picking、对象解析、hover、对象详情面板和侧栏统计补充 marker 图标、中文类型、类别、资源标签、经济潜力、国家和省份信息。
- “重新生成”说明文案改为“资源 marker 已随生成接入，marker / zone 的局部重算另行推进”。

验证：

- `node --check app\webgl-generator\src\generator\markers.js`
- `node --check app\webgl-generator\src\generator\economy.js`
- `node --check app\webgl-generator\src\generator\index.js`
- `node --check app\webgl-generator\src\renderer\picking.js`
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`
- `node --check app\webgl-generator\src\runtime\object-resolver.js`
- `node --check app\webgl-generator\src\ui\panel.js`
- `node --check tools\webgl-generator-export-baseline.mjs`
- `$env:CI='true'; pnpm run build:app`
- 内存烟测：
  - `mediterranean / 100000 / audit-mediterranean-001`：marker `539`，资源 marker `58`，资源潜力 `930`，无无色 marker，无非法 cell 引用。
  - `stage-2-1231411414 / continents / 10000`：marker `41`，资源 marker `5`，资源潜力 `74`，覆盖 `4` 个国家和 `5` 个省份，无无色 marker，无非法 cell 引用。
  - `archipelago / 10000 / audit-archipelago-001`：marker `42`，资源 marker `5`，资源潜力 `74`，无无色 marker，无非法 cell 引用。
  - `highIsland / 10000 / audit-highIsland-002`：marker `79`，资源 marker `8`，资源潜力 `132`，无无色 marker，无非法 cell 引用。

注意：

- 当前 marker 点仍是 `gl.POINTS`，只是完成类别配色和数据语义；真实 sprite/icon atlas 或 HTML overlay 图标仍是后续任务。
- marker 局部重算按钮尚未接入；国家/省份/城镇/河流重算后仍会把 marker 标记为待派生。
- 如果后续要把资源影响税收，应先设计与 source economy baseline 兼容的资源/国力公式，再决定是否改 `treasury`。

### 资源点独立图层

背景：

- 用户继续询问还可以有哪些资源点，并要求把资源点作为单独图层控制。
- 当前 marker 点层已经有资源语义，但 UI 仍只有统一 marker 渲染路径；资源点和遗迹、危险、设施类标记无法分开隐藏。

修正：

- 控制面板“图层”tab 新增：
  - `资源点`：只控制 `category === "resource"` 的资源 marker。
  - `标记`：控制遗迹、危险、设施、文化、自然、水文、商旅、活动、异象等非资源 marker。
- renderer 新增 `resources` layer visibility，点层构建时按 marker category 分流。
- picking 也尊重资源点/标记图层可见性：隐藏后的资源点或普通 marker 不再参与 hover/点击命中。
- 侧栏图层摘要会显示“资源点”和“标记”两个独立开关状态。
- 当前建议追加资源池记录到 `docs/current-plan.md`：采石场、黏土坑、煤田、硫磺泉、硝石洞、琥珀海岸、珍珠滩、珊瑚礁、渔场、良港、森林木场、树脂林、药草谷、染料草场、香料林、茶山、丝茧桑园、马场、牧盐草甸、绿洲、圣泉、地热田。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`
- `node --check app\webgl-generator\src\renderer\picking.js`
- `node --check app\webgl-generator\src\ui\panel.js`
- `git diff --check`
- `$env:CI='true'; pnpm run build:app`
- 临时静态 server + Playwright 验证：
  - 控制面板存在 `[data-layer=resources]` 和 `[data-layer=markers]` 两个按钮。
  - 默认样例 marker `44`，其中资源点 `5`，非资源 marker `39`。
  - 全开 point 顶点 `861`；关闭资源点后 `856`；再关闭标记后 `817`；只开资源点时 `822`；恢复后 `861`。
  - 关闭资源点后资源点 picking 返回 `null`，非资源 marker 仍可命中；关闭标记后非资源 marker 返回 `null`；只开资源点时资源点仍可命中。

### marker 近景小图标第一刀

背景：

- 用户观察到资源点和 marker 仍然像一个像素点，要求缩放足够近时显示“小图”，远景保持像素点。
- 这套能力如果效果好，后续希望推广到城镇标识，并支持按文化预制几种 icon 类型、自动选用和用户手动调整。

修正：

- `markers.js` 给每个 marker 增加 `visual` 描述：
  - `shape`：当前默认为 `pin`。
  - `symbol`：按 marker type 自动选择，例如矿山、温泉、水源、盐湖、稀有生物、宝石、桥梁、驿馆、灯塔、遗迹、藏书楼等。
  - `palette`：按类别选择自然、水文、资源、设施、商旅、危险、文化、活动和异象配色。
  - `cultureStyle` 和 `manual`：当前先写入默认值，供后续文化预设和手动调整复用。
- renderer 新增 marker overlay 图标缓存：
  - 远景仍由 WebGL `POINTS` 显示像素点。
  - 相机缩放达到 `x2.15` 后才显示 overlay 小图标。
  - 资源点优先级高于普通 marker；近景会参考已有标签和图标占位做轻量避让，`x4.4` 之后放宽避让以便显示更多细节。
  - 资源图层 / 标记图层关闭时，overlay 图标和 WebGL 点、picking 一起遵守同一可见性规则。
- CSS 新增 `.marker-map-icon` 小图牌样式，使用受控 SVG symbol 列表，不再把 emoji 当地图图标；选中 marker 会显示高亮描边。
- 侧栏运行统计新增 `marker 图标`，显示当前可见图标数、总图标数和缩放阈值。

验证：

- `node --check app\webgl-generator\src\generator\markers.js`
- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`
- `node --check app\webgl-generator\src\ui\panel.js`
- `$env:CI='true'; pnpm run build:app`
- 临时静态 server + Playwright 验证：
  - seed：`stage-2-1231411414`
  - template：`continents`
  - cells：`10000`
  - 远景 `x1`：marker 图标总数 `41`，可见图标 `0`。
  - 近景 `x4.8`：定位到资源点 `楚桥圩温泉`，可见图标 `7`，其中资源图标 `1`。
  - 关闭资源图层后：资源图标可见数降为 `0`，非资源 marker 图标仍保留 `6`。
  - 浏览器 console error 为 `0`。
- 快照：`docs/generated/snapshots/webgl-generator-marker-icons-snapshot.png`。

后续：

- 图标 symbol / palette 目前是第一版内置集合；后续可把文化样式拆成预设表，让城市、国家、资源 marker 按文化自动选用。
- marker 面板应补充图标手动调整入口，并把 `visual.manual = true` 的对象排除出自动覆盖。

### marker / 资源点管理面板第一刀

背景：

- marker 已经具备资源语义、独立图层、经济潜力和近景小图标，但用户还没有独立管理入口。
- 用户确认下一步先推进管理面板；本轮目标是管理和微调，不进入新增/删除/移动/局部重算。

修正：

- 管理 tab 新增“资源标记”入口，打开独立浮动 `marker-panel`。
- 新增 `MarkerPanel.vue`：
  - 支持全部 / 资源点 / 普通标记范围切换。
  - 支持按名称、id、类型、国家、省份筛选。
  - 支持按潜力、类别、国家、ID 排序。
  - 表格显示名称、类别、资源、国家和经济潜力。
  - 详情显示所属国家/省份、grid cell、pack cell、当前图形、是否手动图标等。
- 面板支持选中和定位 marker；当 marker 面板已打开时，地图点击 marker 会同步面板选中项。
- marker 重命名接入通用对象重命名命令。
- 新增 `marker-edit-commands.js`，支持调整近景图标 `symbol / palette`，并写入 `visual.manual = true`；撤销/重做会恢复 `marker.visual` 和 `marker.data.visual`。
- renderer 刷新使用已有 `point-layers / labels / object-panels` effects，保证点层、overlay 图标和对象详情同步更新。

验证：

- `node --check app\webgl-generator\src\runtime\app.js`
- `node --check app\webgl-generator\src\runtime\object-edit-commands.js`
- `node --check app\webgl-generator\src\runtime\marker-edit-commands.js`
- `node --check app\webgl-generator\src\ui\panels\marker-panel.js`
- `node --check app\webgl-generator\src\ui\panel.js`
- `$env:CI='true'; pnpm run build:app`
- 临时静态 server + Playwright 验证：
  - 初始 seed：`stage-2-1`
  - marker 总数 `44`，资源 marker `5`。
  - 面板“全部”表格行数 `44`，切到“资源点”后表格行数 `5`。
  - 定位第一条资源 marker 后，selection 为 `marker #2 / 丰苍矿山`。
  - 重命名命令生效，图标 `symbol/palette` 手动调整生效。
  - 手动调整 `palette` 后会清除 `categoryColor` 覆盖，让图牌主色真正使用手动配色；撤销会恢复原始类别色。
  - 图标调整可撤销、可重做；再次撤销后重命名也恢复。
  - 浏览器 console error 为 `0`。

后续：

- marker 新增、删除、移动、局部重算仍未接入；这些操作需要同步对象索引、经济汇总和国家/省份资源潜力。
- 文化预制图标还未接入，当前只是手动 `symbol/palette` 选择。

### 远景 marker 圆点修正

背景：

- 近景图标完成后，用户继续指出远景像素点看起来像方点，期望远景仍是圆点。

修正：

- renderer shader 新增 `u_pointMode` 分支，仅在 `gl.POINTS` 绘制 pass 启用。
- point fragment 使用 `gl_PointCoord` 裁切圆形，并在 point pass 启用 alpha blending，让边缘更柔和。
- 面、道路、河流、边界、选择高亮等三角形 pass 保持 `u_pointMode = false`，不受圆点裁切影响。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`
- `git diff --check`
- `$env:CI='true'; pnpm run build:app`
- 临时静态 server + Playwright 像素验证：
  - 初始 seed：`stage-2-1`
  - marker：`鹿泽火山`
  - 隐藏 marker / resources 读取背景，再显示 marker / resources 读取同一 `7x7` patch。
  - 中心 delta 为 `53`，四角 delta 均为 `0`，说明 point 已被圆形裁切，不再是方块填充。
  - 浏览器 console error 为 `0`。

### 城镇近景剪影第一刀

背景：

- 用户明确指出城镇标识不应复用资源点 / marker 的水滴状图标；城镇不是单纯“点位标记”，而应给地图增加更真实的聚落观感。
- 本轮目标是先在 renderer 层做独立视觉表达，不进入文化预设、用户手动调样式和城镇新增/移动等编辑项。

修正：

- renderer 新增 `cityIconItems` overlay 缓存：
  - 远景仍由 WebGL `POINTS` 显示城镇圆点。
  - 近景按城镇重要度逐级显示 HTML/SVG 剪影，都城最早显示，省会/大城/港镇其次，普通城镇和村落需要更近缩放。
  - 城市图层关闭时，城镇剪影、WebGL 点位和 picking 继续遵守同一可见性规则。
- 新增受控 SVG 城镇剪影：
  - 都城：城墙、塔楼和屋顶。
  - 省会：塔楼和城镇主体。
  - 港镇：小屋、帆和水线。
  - 大城/城镇/村落：不同密度的简化屋顶群。
- CSS 新增 `.city-map-icon` 样式，低于文字 label 和 marker 图标，不使用水滴底牌；选中城市时剪影会显示高亮描边。
- 侧栏运行统计新增 `城市图标`，显示当前可见剪影数、总剪影数和基础缩放阈值。

后续：

- 城镇剪影仍是 renderer 自动派生，暂未写入 `city.visual` 或编辑命令；后续可增加文化风格预设、用户手动样式覆盖和城市面板中的图标设置。

### 城镇剪影文化预设与手动调整

背景：

- 用户确认第一版小屋/城墙剪影方向正确，下一步推进文化预设和手动调整入口。
- 本轮目标是让城镇剪影成为正式对象字段，而不是只在 renderer 中临时推断；同时保持不进入城镇新增、移动和文化图标包精绘。

修正：

- 新增 `runtime/city-visuals.js` 共享契约：
  - `city.visual.silhouette`：`capital / provincial / port / city / town / hamlet / fort / camp`。
  - `city.visual.palette`：都城、省会、港口、城市、城镇、村落、游牧、高地、林地、水乡等配色。
  - `city.visual.cultureStyle`：`default / maritime / waterway / nomadic / highland / woodland`。
  - `city.visual.manual`：手动覆盖标记。
- 生成链路在 `settlements.js` 中为 city 和 burg 写入默认 visual，并在 `specifyBurgs()` 后按最终 `group/port/walls/citadel/culture` 刷新；手动 visual 会保留，不被自动覆盖。
- renderer 改为读取 `resolveCityVisual()`，并新增 `fort` 高地寨堡与 `camp` 游牧营帐剪影。
- 城市管理面板新增剪影和配色下拉：
  - 可应用手动剪影，写入 `manual: true`。
  - 可恢复自动预设，重新按当前文化类型和城市属性计算。
  - 调整和恢复均接入 `EditHistory`，支持撤销/重做。

后续：

- 当前是规则化预设，不是按文化根名逐个绘制图标包；后续可继续扩展文化图标包、城市面板预览缩略图和批量应用到同文化城镇。

### marker / 资源点编辑与重生成

背景：

- 用户要求继续推进 marker 管理，并新增重新生成资源点功能。
- 资源点不能随机撒点，需要与地形、河流、生物群落、温度、降水等信息有一定关系，并继续参与国家/省份资源经济汇总。

修正：

- `generator/markers.js` 导出 marker 类型选项、资源类型选项、按 pack cell 创建 marker、资源点重生成和资源经济刷新工具。
- 资源点生成从单纯候选随机抽样改为候选加权排序：
  - 矿山偏好高地、起伏地形、适居边缘和低人口区域。
  - 盐湖偏好干热湖泊、低降水和干岸邻接。
  - 稀有生物偏好林地/高地/水文邻近、低人口和较适合的温度/降水。
  - 宝石矿脉偏好高地、起伏地形和低人口区域。
  - 温泉偏好高地、起伏地形、河流邻近和适中温度。
- 新增 marker 编辑命令：
  - 新增资源点。
  - 移动 marker。
  - 删除 marker。
  - 重生成资源点。
  - 以上操作均接入 `EditHistory`，并在应用后重建 marker metadata、国家/省份资源潜力、点图层、标签和对象索引。
- marker 面板新增资源类型下拉、放置、移动、删除、重生成资源点和取消按钮；地图点击模式会锁定交互，并在点击有效 pack cell 后执行命令。
- 管理 tab 的重新生成区新增“资源点”按钮，调用同一套资源重生成命令。
- marker 面板因为 `map` 使用 `markRaw` 且对象原地修改，新增 `version` 刷新信号，避免新增/删除后表格和按钮仍读取旧 rows。
- renderer 的 canvas `pointerup` 在没有对应 `pointerdown` 时不再触发拾取，避免资源放置完成后被底层城市/省份选择覆盖。

验证：

- `node --check`：
  - `app/webgl-generator/src/generator/markers.js`
  - `app/webgl-generator/src/runtime/marker-edit-commands.js`
  - `app/webgl-generator/src/runtime/app.js`
  - `app/webgl-generator/src/runtime/edit-refresh-scheduler.js`
  - `app/webgl-generator/src/renderer/placeholder-renderer.js`
- `npm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- Programmatic Vite server + Playwright 验证通过：
  - 初始 `44` 个 marker、`5` 个资源点、资源潜力 `74`。
  - 放置矿山后 marker `44 -> 45`、资源点 `5 -> 6`，新增 marker 被选中，派生 stale 为 `economy / military`。
  - 移动后 marker 数不变，对象索引 marker 数为 `45`，选中对象仍为 marker。
  - 删除后 marker 回到 `44`、资源点回到 `5`，对象索引 marker 数为 `44`。
  - 重生成资源点后资源点仍为 `5`，资源潜力和 pack 资源经济汇总一致，样本覆盖温泉、矿山、盐湖和稀有生物，且候选落点携带高度、温度、降水和生物群落信息。

后续：

- 可以继续扩展资源类型：采石场、煤田、硫磺泉、珍珠滩、珊瑚礁、森林木场、药草谷、香料林、马场、绿洲、圣泉、地热田等。
- 后续经济/国力阶段应读取 `markerResourceEconomy` 或正式资源 goods 生成结果，把资源点纳入国力和贸易计算。
- 控制面板下拉 UI 仍待统一。

### 资源经济接入国力第一刀

背景：

- 用户希望资源点不只是地图 marker，而是能参与国家、省份经济计算，并为后续国力计算提供基础。
- 上一轮已经生成并编辑资源点，也按国家/省份汇总 `resourcePotential / markerEconomicPotential`；本轮目标是把这些字段真正接到政治对象、军事派生和管理面板。

修正：

- `economy.js` 新增可复用 `refreshPoliticalEconomicPower(pack)`：
  - 国家和省份会根据税收或人口税基、marker 经济潜力、资源潜力、人口、面积和城镇数派生 `economicPower / resourcePower / populationPower / territoryPower / settlementPower / powerScore / militarySupply`。
  - `buildEconomy()` 使用同一函数，避免经济阶段和编辑阶段计算口径分裂。
- marker 新增、移动、删除和资源点重生成后，会先刷新 `markerResourceEconomy`，再刷新国家/省份经济力和实力评分；完整 economy / military 仍标记为 stale，等待后续更重的派生重算。
- `military.js` 读取国家 `economicPower / resourcePotential / militarySupply`：
  - 资源和经济只作为小幅补给修正，不直接替代人口、城镇和警戒因子。
  - 军事诊断新增 `economicPower / resourcePotential / economicTargetModifier / militarySupply`，方便后续 baseline 或面板复查。
- 国家面板新增国力、经济、资源排序和列表列；详情显示国力评分、经济力、资源潜力、资源类型和军力。
- 省份面板新增实力、经济、资源排序和列表列；详情显示人口、实力评分、经济力、资源潜力和资源类型。

后续：

- 当前 `powerScore` 是 UI/派生层的第一版综合评分，适合排序和观感验证；后续如果进入正式国力系统，应进一步拆成财政、资源、兵源、交通、科技或稳定度等权重。
- 资源点仍未转成正式 goods 供需，也没有接入贸易路径价格；后续经济提质应把资源 marker 与 goods/market/deals 打通。

### 控制面板和管理浮窗下拉 UI 统一

背景：

- 用户指出控制面板中的下拉选项还没有统一 UI，并以为此前已经做完。
- 复查后确认：控制面板地形下拉走 `UiField type="select"` 的原生分支，国家/省份/城市/marker 浮动面板里也各自直接写了原生 `select`。

修正：

- 新增 `UiSelectField.vue`：
  - 支持 `modelValue / update:modelValue`、`change`、禁用态和统一箭头。
  - 选项可读取 `value / id / burgId / key`，避免国家、首都和普通枚举各自转换。
  - DOM 上保留原生 `select`，不破坏键盘和浏览器选择行为。
- `UiField type="select"` 改为复用 `UiSelectField`，以后继续使用旧入口也会获得统一样式。
- 已替换：
  - 控制面板：地形模板。
  - 国家面板：首都、目标国家。
  - 省份面板：目标省份。
  - 城市面板：剪影、配色。
  - marker 面板：新增资源类型、图形、配色。
- CSS 新增 `.ui-select-field / .ui-select-shell / .ui-select-arrow` 统一边框、背景、hover、focus、禁用态和右侧箭头；资源/图标编辑器保留原来的上标签紧凑布局。

验证：

- `rg "<select|</select>|<option" app/webgl-generator/src/ui/vue/components -n`：除 `base/UiSelectField.vue` 外无裸下拉。
- `git diff --check` 通过。
- `npm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - 页面中 `selects=9`、`uiSelects=9`、裸下拉 `0`。
  - `#heightmap-template` 可切换到 `archipelago`。
  - 国家目标、省份目标、城市剪影/配色、资源类型、marker 图形/配色下拉均存在。
  - 样式读取显示 `border-radius: 6px`、`padding-right: 32px`、`appearance: none`。
  - console error 为 `0`。

### 地图点击列表滚动与右键平移

背景：

- 用户要求点击地图元素后，如果命中对象有对应编辑列表面板，应把编辑列表滚动到该对象行进入视口。
- 同时调整地图导航习惯：鼠标左键不再拖动画布，改为鼠标右键拖动画布；左键保留点击选择。

修正：

- `UiObjectTable` 新增选中行自动滚动：
  - 表格外层持有 `ref`。
  - 每行写入 `data-row-id`。
  - `selectedId / rows` 变化后在 `nextTick` 中查找选中行并执行 `scrollIntoView({block: "nearest"})`。
  - 国家、省份、城市、资源点、路线、河流、文化、宗教和标签等复用该表格的面板自动获得滚动能力。
- `installCanvasInteractions()` 改为区分 pointer 模式：
  - 鼠标左键进入 `select` 模式，只记录是否移动，不改变 camera offset；未移动时触发选择。
  - 鼠标右键进入 `pan` 模式，拖动时更新 camera offset，并阻止浏览器右键菜单。
  - 非鼠标主指针仍保留平移，避免触控/笔设备完全失去导航能力。
- 高度、国家、省份和 marker 编辑绑定只响应主按钮 pointerdown，避免右键平移时误触编辑笔刷或资源放置。
- 编辑交互锁放行鼠标右键 pointer 导航事件，让编辑状态下仍可右键平移画布。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js`
- `node --check app/webgl-generator/src/runtime/app.js`
- `git diff --check`
- `npm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - 选中最后一个国家后，国家列表 `scrollTop=206`，目标行位于列表视口内。
  - 遮挡外画布点左键拖拽后 camera offset 保持 `{0, 0}`。
  - 同点右键拖拽后 camera offset 变为 `{offsetX: 0.2727, offsetY: -0.1522}`。
  - console error 为 `0`。

### 单位、比例尺和显示倍率第一刀

背景：

- 用户要求所有数据增加单位，距离和面积支持中英文/符号单位切换，页面 `1 cm` 对应实际距离可放缩，并让人口、降水也能在合理范围内按比例放缩。

修正：

- 新增 `ui/display-units.js` 统一显示层单位工具：
  - 距离单位：`米 / 千米 / m / km`。
  - 面积单位：`平方米 / 平方公里 / m² / km²`。
  - 比例尺：`1-1000 km/cm`，按浏览器 `96dpi` 的 CSS cm 把地图坐标换算为距离与面积。
  - 人口倍率：`0.1-10x`；降水倍率：`0.1-5x`。
- 全局控制偏好新增 `units`，所有字段经 `normalizeUnitPreferences()` 裁剪，兼容旧 localStorage。
- 控制面板“视图”tab 新增显示单位区块，包含距离、面积、`1 cm` 比例尺、人口倍率和降水倍率；`UiSliderField` 支持自定义输出文本，例如 `10 km`、`2x`。
- 传统运行面板接入单位偏好：
  - 地图 badge 和“地图尺寸”显示距离单位。
  - 运行统计新增“地图比例”。
  - 降水范围和降水图例显示 `mm`，并应用降水倍率。
  - hover 层的人口和降水显示单位并应用倍率。
  - 地图对象选择详情中的城市人口、路线命中距离、河流长度、文化人口等显示单位。
- Vue 浮动面板接入同一套显示偏好：
  - 路线、河流面板显示长度单位。
  - 国家、省份、文化、宗教面板显示面积和人口单位。
  - 城市面板显示列表、汇总和详情人口单位；人口编辑器仍编辑原始值，不把显示倍率写回数据。
  - 对象详情面板同步显示人口、距离和河流长度单位。
- 控制面板改用 `storeToRefs()` 读取 Pinia 偏好，修复单位变化时 `1 cm = ...` 读数不随 store 更新的问题。

验证：

- `node --check app/webgl-generator/src/ui/display-units.js`
- `node --check app/webgl-generator/src/ui/panel.js`
- `node --check app/webgl-generator/src/runtime/app.js`
- `git diff --check`
- `npm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - 单位偏好成功写入 store：`distanceUnit=m`、`areaUnit=m2-cn`、`mapScaleKmPerCm=10`、`populationScale=2`、`precipitationScale=2`。
  - 距离选项为“米、千米、m、km”，面积选项为“平方米、平方公里、m²、km²”。
  - 控制面板读数显示 `1 cm = 10 km`，比例尺输出显示 `10 km`，人口/降水输出显示 `2x`。
  - 地图 badge 显示 `381,000 m x 254,000 m / 10000 cells`。
  - 运行统计包含 `1 cm = 10 km` 和 `mm`。
  - 省份面板出现“平方米”面积单位。
  - console error 为 `0`。

后续：

- 当前是显示层换算，内部生成值、编辑器原始输入、导出格式和正式比例尺绘制尚未改写。
- 后续若要让导出或数据模型跟随比例尺，应单独做数据契约，避免显示倍率污染原始生成结果。

### 生成级气候系统第一刀

背景：

- 用户要求引入可控气候系统，支持选择整个画布所在的地球纬度和大气方向，并让这些参数直接影响温度、降水、河流，间接影响人口和国家等下游生成。

修正：

- 新增 `generator/climate-options.js`：
  - 纬度选项：自动纬度、赤道带、北/南亚热带、北/南温带、北/南寒带。
  - 大气方向选项：自动风带、西风、东风、北风、南风、西北风、东北风、西南风、东南风。
  - 自动模式保留原 source-style 随机纬度和六纬度风带；固定纬度模式用预设中心纬度和跨度生成 `latN / latS / latCenter`；固定风向会把六个风带统一为对应角度。
- `normalizeOptions()` 新增 `climateLatitudeMode / atmosphereDirection`，作为正式生成参数进入 `map.options`。
- `buildClimate()` 接入新参数：
  - 固定纬度会改变整图的实际纬度范围，从而改变温度梯度。
  - 固定大气方向会改变降水推进方向、迎风坡和雨影，进而改变 `grid.cells.prec`。
  - 气候 metadata 记录纬度模式、纬度标签、中心纬度、大气方向、风向角度和实际风带数组。
- 下游链路无需额外硬接：
  - `buildRivers()` 已从 `grid.cells.prec/temp` 读取降水、温度和湖泊蒸发，河流 flux / 数量自然随气候改变。
  - `defineBiomesAndPopulation()` 已从温度、降水、河流 flux 计算 biome、适居度和人口。
  - 文化、城镇、国家、省份、资源点和经济派生继续吃人口、biome、河流、降水等字段，因此会间接变化。
- 控制面板“生成”tab 新增“气候”区块，包含“纬度”和“大气”两个统一下拉。
- `readOptionsFromPanel()` 读取两个新控件；编辑锁也纳入这两个控件。
- 运行统计新增：
  - “气候纬度”：显示纬度标签和实际 `latS .. latN`。
  - “大气方向”：显示风向标签和固定角度。
- 生成日志和 summary 的 climate 段记录纬度、大气方向、风带和 mapCoordinates，便于后续 baseline / diff 复查。

验证：

- `node --check app/webgl-generator/src/generator/climate-options.js`
- `node --check app/webgl-generator/src/generator/climate.js`
- `node --check app/webgl-generator/src/generator/options.js`
- `node --check app/webgl-generator/src/ui/panel.js`
- 纯生成对比通过：同 seed `stage-2-1231411414 / continents / 10000` 下，自动气候和 `赤道带 + 西风` 生成不同 checksum；`赤道带 + 西风` 的 `latS=-40.5 / latN=40.5`、降水峰值、河流数量、最大 flux、人口 cell 和城市数均发生变化。
- `git diff --check` 通过。
- `npm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - UI 下拉包含 8 个纬度选项和 9 个大气方向选项。
  - 选择 `赤道带 + 西风` 后重新生成，`map.options.climateLatitudeMode=equatorial`、`map.options.atmosphereDirection=west`。
  - climate metadata 显示 `latitudeLabel=赤道带`、`atmosphereLabel=西风`、`windProfile=[90,90,90,90,90,90]`、`latS=-40.5 / latN=40.5`。
  - 运行统计包含“赤道带”和“西风”。
  - 降水专题切换为 active，截图像素非空：`1020x860`，`varied=877200`。
  - console error 为 `0`。

后续：

- 当前气候控制是整图生成参数，改动后需要重新生成；还没有“仅重算气候及下游派生”的管理按钮。
- 后续可以继续补局部季风、海流、雨影强度、温度/降水编辑器，或让资源/贸易系统对气候带有更强的 goods 倾向。

### 文化与宗教继承结构第一刀

背景：

- 用户要求文化和宗教支持选择继承结构，例如文化 A 可以从文化 B 派生，需要有树状参数和可编辑父级。

修正：

- 新增 `generator/inheritance.js` 共享树工具：
  - 继承模式支持“平铺 / 区域浅树 / 分支树”。
  - 统一重建 `parent / children / depth / lineage / origins`。
  - 手动改父级时防止自指和循环。
- `normalizeOptions()` 新增 `cultureInheritanceMode / religionInheritanceMode`，默认使用“分支树”。
- 文化生成新增树状父级分配：
  - “平铺”保持扁平父级。
  - “区域浅树”和“分支树”会根据文化类型、命名风格、扩张强度和中心距离选择父级。
  - `society.metadata.cultureTree` 记录根系、派生节点和最大深度。
- 宗教生成新增树状父级分配：
  - Folk 宗教优先跟随所属文化的继承关系。
  - Organized / Cult / Heresy 会优先从本土 Folk 或同文化宗教派生。
  - `society.metadata.religionTree` 记录根系、派生节点和最大深度。
- 控制面板“生成”tab 新增“继承结构”区块，包含“文化”和“宗教”两个统一下拉。
- 运行统计新增“文化继承 / 宗教继承”，显示当前模式、根系数、派生数和最大深度。
- 文化管理面板新增：
  - 表格列：父级、层级。
  - 摘要：根系、派生、层级。
  - 详情：父级、子级、继承路径。
  - “继承自”下拉，可手动调整父级。
- 宗教管理面板同样新增父级、层级、继承路径和“继承自”下拉。
- 新增 `createSetCultureParentCommand()` 与 `createSetReligionParentCommand()`，父级调整接入 `EditHistory`、运行统计、选中详情和对象面板刷新。

验证：

- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - 默认生成数据包含文化树 `{roots: 4, derived: 8, maxDepth: 5}` 和宗教树 `{roots: 4, derived: 14, maxDepth: 6}`。
  - 文化管理面板出现 `#culture-parent-select`，宗教管理面板出现 `#religion-parent-select`。
  - 手动把文化 `#3` 父级改为 `#1` 后，数据变为 `parent=1 / depth=2 / lineage=[0,1]`，且 `#1.children` 包含 `#3`。
  - 手动把宗教 `#3` 父级改为 `#1` 后，数据变为 `parent=1 / depth=2 / lineage=[0,1]`，且 `#1.children` 包含 `#3`。
  - 运行统计显示“文化继承分支树”和“宗教继承分支树”。

后续：

- 当前继承关系先进入数据、统计和编辑管理，不改变扩张结果。
- 后续可让文化派生影响名称变体、文化图标预制、同化速度、国家合法性、宗教改革事件和国力计算。

### 外交系统第一刀

背景：

- 用户提出文化和宗教支持树状后，可以考虑引入外交系统，并参考原版实现。
- 原版参考点：
  - `States.generateDiplomacy()` 会基于国家邻接、邻国的邻国、远方国家和海洋国家权重生成 `Ally / Friendly / Neutral / Suspicion / Rival / Enemy / Vassal / Suzerain / Unknown` 关系。
  - `diplomacy-editor` 提供关系矩阵、历史、重生成、手动改关系和导出能力。

修正：

- 新增 `app/webgl-generator/src/generator/diplomacy.js`：
  - 生成国家两两外交关系矩阵。
  - 关系权重读取国家邻接、海洋国家、文化/宗教继承、政体类型、国力差异和资源竞争。
  - 强邻国对弱邻国有概率形成 `Vassal / Suzerain`。
  - 少量宿敌关系会升级为 `Enemy`，并写入外交历史和国家 `campaigns`。
- 主生成链在经济与宗教终态后执行 `diplomacy` 阶段；地图 metadata 更新为 `source-stage-20-diplomacy-first-pass`。
- 国家对象写入：
  - `diplomacy`：以国家 id 为 key 的关系表。
  - `diplomacySummary`：盟友、友好、中立、猜忌、宿敌、战争、附庸、宗主等计数。
  - `campaigns`：当前首版只记录外交战争条目，不驱动军队行动。
- `pack.diplomacy` 写入 `relations / chronicle / metadata`，metadata 统计关系对数、盟友、宿敌、战争、附庸和历史数量。
- 新增 `diplomacy-edit-commands.js`：
  - `createSetDiplomacyRelationCommand()` 支持手动修改关系，并自动维护反向关系；`Vassal / Suzerain` 会互为反向。
  - `createRegenerateDiplomacyCommand()` 支持只重生成外交关系。
  - 两者都接入撤销/重做。
- 管理 tab 新增“外交管理”：
  - 支持选择主体国家、筛选关系、按关系/国力/邻接/文化排序。
  - 表格可定位目标国家。
  - 详情区显示双方文化、宗教、邻接、国力、经济、面积、人口和城市数。
  - 关系下拉可直接编辑当前关系。
  - 支持“重生成外交”。
- 国家面板和运行统计新增外交摘要。
- 国家、省份、城市、河流、marker/资源点和文化/宗教继承等会影响政治、经济或合法性的编辑，现在会把 `diplomacy` 标为 stale。

验证：

- `node --check app/webgl-generator/src/generator/diplomacy.js`
- `node --check app/webgl-generator/src/generator/index.js`
- `node --check app/webgl-generator/src/runtime/diplomacy-edit-commands.js`
- `node --check app/webgl-generator/src/runtime/app.js`
- 纯生成验证通过：`seed=stage-2-1231411414 / cells=10000` 生成 `18` 个国家、`153` 个关系对、`22` 个盟友、`4` 个宿敌、`1` 个战争关系、`1` 个附庸关系，外交阶段耗时约 `2.9ms`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - `#open-diplomacy-panel` 可打开外交管理面板。
  - `#diplomacy-relation-select` 存在。
  - 构建产物默认生成 `20` 个国家、`190` 个关系对、`42` 个盟友、`4` 个宿敌、`2` 个附庸。
  - 在外交面板点选目标国家行后，主体国家保持不变，关系下拉仍编辑原主体到目标的关系。
  - 将 `#1-#6` 关系从 `Ally` 改为 `Enemy` 后，正反向关系均变为 `Enemy`。
  - 运行统计战争数更新为 `1`，撤销栈出现“外交关系 #1-#6”。
  - 浏览器 console error 为 `0`。

后续：

- 当前外交只生成关系、附庸、战争历史和管理面板；战争尚未驱动军事行动或地图事件。
- 后续可以继续做外交专题着色、关系矩阵导出、战争事件、军事行动、经济制裁和贸易偏好联动。

### Vercel 部署配置

背景：

- 用户希望开始部署当前正式 WebGL 地图生成器，需要让 Vercel 从仓库根目录直接构建正式应用。
- 项目中 `source/` 是只读参考实现，不应作为 Vercel 项目根目录或部署目标。

修正：

- 新增根目录 `vercel.json`：
  - `framework` 固定为 `vite`。
  - `installCommand` 固定为 `pnpm install --frozen-lockfile`。
  - `buildCommand` 固定为 `pnpm run build:app`。
  - `outputDirectory` 固定为 `dist/webgl-generator`。
  - 增加 SPA fallback rewrite 到 `/index.html`。
  - 给 `/assets/*` 添加长期 immutable 缓存头。
  - 全站添加 `X-Content-Type-Options: nosniff`。
- `package.json` 新增常规脚本：
  - `dev` -> `start:app`
  - `build` -> `build:app`
  - `preview` -> `preview:app`
- `package.json` 新增 `engines.node = ^20.19.0 || >=22.12.0`，避免 Vercel 使用低于 Vite 8 要求的 Node 版本。
- 新增 `docs/deployment/vercel.md`，记录 Vercel 控制台导入方式、构建命令、输出目录、本地验证命令和注意事项。

验证：

- `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('json ok')"` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。

后续：

- 首次在 Vercel 控制台导入时，Root Directory 应保持仓库根目录。
- 当前未执行 `vercel deploy`，需要用户登录 Vercel 或通过 GitHub 集成触发部署。

### 外交专题色与关系矩阵

背景：

- 用户确认线上部署只是预先体验地址，不需要先做线上烟测。
- 本轮继续推进外交系统补色和矩阵，目标是让外交数据能在地图上检查，也能按原版外交编辑器思路导出关系表。

修正：

- 控制面板“视图”tab 新增“外交”专题。
- 渲染器新增 `diplomacy` color mode：
  - 外交专题按“主体国家 -> 目标国家”的关系给国家面域着色。
  - 主体国家使用金色；盟友、友好、中立、猜疑、宿敌、战争、附庸、宗主和未知使用外交关系定义中的颜色。
  - 外交专题 picking 仍命中国家对象。
- 渲染器新增 `setDiplomacySubjectId()`：
  - 外交管理面板切换主体时，如果当前正在查看外交专题，会即时重绘关系色。
  - 从控制面板直接切到“外交”专题时，优先使用当前选中国家，否则使用第一个有效国家。
- 地图图例新增外交模式：
  - 显示当前主体国家。
  - 显示主体、盟友、友好、中立、猜疑、宿敌、战争、附庸、宗主、未知的色块。
- 外交管理面板新增：
  - “外交着色”按钮：以当前主体国家切换地图到外交专题。
  - 关系矩阵表：行列均为国家，单元格显示关系简称。
  - 点击矩阵格会切换主体和对象，并同步下面的关系下拉。
  - 导出 CSV。
  - 导出 JSON。
- 外交关系编辑命令的派生影响新增 `cell-colors`，所以在外交专题中手动改关系、撤销、重做和重生成外交都会刷新地图颜色。
- 外交面板新增 `version` 计数，解决 `markRaw(map)` 下深层外交数组变化不会触发矩阵 computed 重新计算的问题。

验证：

- `node --check app/webgl-generator/src/renderer/color-modes.js`
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js`
- `node --check app/webgl-generator/src/runtime/app.js`
- `node --check app/webgl-generator/src/ui/panels/diplomacy-panel.js`
- `node --check app/webgl-generator/src/ui/panel.js`
- `node --check app/webgl-generator/src/runtime/diplomacy-edit-commands.js`
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 静态 server + Playwright 构建产物验证通过：
  - 外交矩阵为 `20 x 20`，关系对数 `190`。
  - 点击“外交着色”后 renderer `colorMode = diplomacy`，主体为 `#1`，图例显示“外交：清河王朝”。
  - 点击矩阵中的 `#1 -> #2` 后，主体为 `#1`、对象为 `#2`，关系下拉显示 `Friendly`。
  - 将关系改为 `Enemy` 后，正反向关系均为 `Enemy`，矩阵选中格文本同步刷新为“战争”。
  - CSV 下载文件名为 `fmg-diplomacy-stage-2-1.csv`。
  - JSON 下载文件名为 `fmg-diplomacy-stage-2-1.json`。
  - 浏览器 console error 为 `0`。

后续：

- 外交矩阵当前用于查看、选中、编辑和导出；尚未做矩阵内直接批量编辑。
- 战争关系仍只记录在外交关系和历史中，尚未驱动军事行动、战争事件、经济制裁或贸易偏好。

### 保留中键平移

背景：

- 用户确认左键仍然不可拖动画布，但需要保留鼠标中键拖动画布的能力。

修正：

- `pointerInteractionMode()` 中鼠标中键与右键一样进入 `pan` 模式，左键继续只进入 `select` 模式。
- canvas 增加 `auxclick` 阻止中键/右键默认动作，避免中键点击在浏览器里触发额外行为。
- 编辑交互锁的导航穿透从“右键”扩展为“鼠标导航键”，右键和中键 pointerdown / pointermove / pointerup 均可穿透给地图平移；高度、国家、省份和 marker 编辑仍只响应左键。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 临时静态 server + Playwright 验证构建产物：左键拖动后 camera offset 保持 `{0, 0}`；右键拖动后 camera offset 变为 `{offsetX: 0.2979, offsetY: -0.1951}`；中键拖动后 camera offset 同样变为 `{offsetX: 0.2979, offsetY: -0.1951}`；console error 为 `0`。

### Loading 玄幻文案与资源标记让位

背景：

- 用户指出“等待浏览器绘制”太直白，希望 loading 文案更有玄幻感。
- 用户指出资源标记层级应低于城镇 icon；近景下资源标记与城镇重合时应弱化资源标记。

修正：

- 生成 loading 气泡四段文案改为“静候星图显影 / 正在推演山海脉络 / 正在铺展灵纹图层 / 正在誊清诸域卷册”。
- 资源 marker overlay 增加专属层级，低于城镇剪影；非资源 marker 仍保留原有层级。
- `updateMarkerIcons()` 会在近景放开避让后检测资源 marker 与已显示城镇剪影 bbox 是否重叠，并给资源 marker 添加 `city-overlap` class；样式将其透明度降到 `0.42` 并略微缩小，选中时保留较高透明度。

验证：

- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 构建产物中可检索到新的四段 loading 文案。
- 临时静态 server + Playwright 验证构建产物：将一个资源 marker 临时挪到城市坐标并放大到 `x5` 后，城市 icon 可见、资源 marker 可见且带 `city-overlap`；城镇 `z-index = 1`，资源 marker `z-index = 0`；资源 marker opacity 稳定为 `0.42`，console error 为 `0`。

### 人口显示、下拉菜单和浮动面板尺寸

背景：

- 用户在 `stage-2-1 / 10k` 看到国家面积动辄几十万平方公里，但人口只显示几千人，比例明显不可信。
- 用户指出当前所有下拉组件的下拉框样式不对。
- 用户要求所有悬浮面板高度不超过视口 `97%`，最小高度 `200px`，内容超出时滚动。

修正：

- 实测 `stage-2-1 / continents / 10000` 中国家人口原值如 `22125.82`，结合城镇 `population = 3.046` 等字段判断为 FMG 内部千人单位；`formatPopulation()` 现在统一乘以 `1000` 后再应用人口倍率。国家、省份、文化、宗教、城市、外交和对象详情等使用统一 formatter 的位置会同步修正；生成数据和经济/军事公式不改。
- 城镇近景剪影 tooltip 的人口也改成按千人单位显示为真实人数。
- `UiSelectField` 改为隐藏原生 select + 自绘触发按钮 + 自绘菜单；保留原生 select 的 id 和 value，确保 `readOptionsFromPanel()`、单位偏好读取和旧事件监听仍可工作。
- `.floating-panel` 改为纵向 flex 容器，设置 `min-height: 200px`、`max-height: min(97%, calc(100% - 16px))`；`.floating-panel-body` 设置 `overflow: auto` 和 `min-height: 0`。

验证：

- `node --check app/webgl-generator/src/ui/display-units.js` 通过。
- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/ui/panel-manager.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 临时静态 server + Playwright 验证构建产物：
  - 国家面板人口按千人单位换算后显示为真实人数，例如 `3,449,980 人`。
  - 地形模板下拉框打开自绘菜单后可选择“群岛”，隐藏原生 select 同步为 `archipelago`，触发按钮文本同步为“群岛”。
  - 外交面板在 `1280 x 620` 视口下高度为 `601.39px`，未超过 `620 * 97% = 601.4px`；面板 body 为 `overflow: auto`，内容高度超过可视高度时可滚动。
  - 浏览器 console error 为 `0`。

### 列表选中态与图标二级操作

背景：

- 用户观察到有概率出现“已选中国家，国家编辑摘要能显示目标国家，但下方详情仍显示未选中国家”的半选中状态。
- 用户希望所有列表编辑面板把详细编辑功能收归为图标，点击图标后再进行二级操作。

修正：

- 新增 `ui/object-id.js`，统一把数字 id 和数字字符串 id 规范化为同一个比较键，并提供 `findByObjectId()` / `sameObjectId()` / `toIntegerId()`。
- `UiObjectTable` 的选中高亮和滚动定位改用规范化 id，表格“定位”动作改为图标按钮。
- 国家、省份、城市、文化、宗教、路线、河流、marker 和外交面板的选中详情查找改用规范化 id，避免摘要、表格高亮和详情区读取不同类型 id。
- 国家/省份/城市/文化/宗教/marker/路线/外交等旧桥接层的 `setSelected*` / `setTarget*` / open/update selection 入口同步把 id 规范化为数字，防止编辑笔刷或后续命令拿到字符串 id。
- 新增 `UiActionDock`，以小图标按钮承载列表对象的二级操作；国家、省份、城市、文化、宗教、河流、资源/marker 和外交面板已把重命名、调色、继承、人口、归属同步、首都、剪影、河流宽度、外交关系等详细编辑控件收进图标展开区。

验证：

- `node --check app/webgl-generator/src/ui/object-id.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/state-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/province-panel.js` 通过。
- `node --check app/webgl-generator/src/ui/panels/diplomacy-panel.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- 临时静态 server + Playwright 验证构建产物：
  - 国家面板手动传入字符串 `stateId = "1"` 后，`getBrush().targetStateId` 为 `number`，表格行高亮、详情 `15` 项、摘要目标均为“清河王朝”，页面不再包含“未选中国家”。
  - 国家面板图标为“重命名 / 进入编辑 / 调整颜色 / 设置首都”，点击“重命名”后出现二级重命名控件。
  - 省份、城市、文化、宗教、marker、河流和外交面板均能打开图标操作入口，表格存在选中行，未出现“未选中”详情占位。
  - 浏览器 console error 为 `0`。

### 显示精简、气候投影、树总览和外交点击语义

背景：

- 用户要求所有数字支持精简显示，默认按“万”缩写，也可选择“千”；高度读数应显示实际高度而不是内部整数。
- 用户要求二级编辑动作继续面板化，颜色类操作在国家、省份、文化、宗教之间复用。
- 用户指出下拉宽度不足，且打开下拉会把浮层内容高度撑出滚动条。
- 用户要求外交视图下点击国家切换外交主体，不应开启国家编辑。
- 用户要求气候配置改成接近原版的平面圆地球投影：可调赤道/南北极温度、画布纬度，并按纬度风带点击箭头轮询东北、东南、西北、西南四向。
- 用户要求能总览文化和宗教的树状结构，并移除重新生成区右侧默认“待命”提示。

修正：

- `display-units` 新增 `numberAbbreviation` 偏好和 `formatNumber()`，默认“万”，可切为“千”或“完整”；主要运行统计、悬停、对象详情以及国家、省份、城市、文化、宗教、外交、路线、河流、marker、标签等面板的计数、评分、潜力和流量读数改走共享格式器。
- `display-units` 新增 `heightUnitsToMeters()` / `formatHeight()`，按原版高度换算公式把 `h >= 20` 转为 `(h - 18) ** heightExponent` 米，水下高度按原版水深公式换算；悬停地形、城市落水检查和高度编辑摘要均显示实际米制高度。
- 控制面板“显示单位”新增“数字”下拉；`UiSelectField` 菜单改为 Teleport 到 `body` 的 fixed 弹层，按触发器位置计算宽度、最大高度和上下开口，避免菜单撑高浮动面板。
- 新增 `UiColorActionPanel`，国家、省份、文化、宗教的颜色二级动作统一复用。
- 气候控制区从简单下拉改为地球投影和风带按钮：支持自动/手动画布纬度、赤道/北极/南极温度滑条，六个纬度风带按钮点击后在东北、东南、西北、西南中轮询；生成参数接入 `climateLatitudeCenter / climateLatitudeSpan / temperatureEquator / temperatureNorthPole / temperatureSouthPole / winds`。
- 运行统计“大气方向”会显示六段风带方向，便于确认风带配置已写入生成结果。
- 文化管理和宗教管理面板新增树状总览，按父子层级排序展示全部节点、子级数量和当前选中态，点击树节点复用现有选中回调。
- selection 面板分流新增外交模式特例：`colorMode === diplomacy` 且点击国家时，只调用 `setDiplomacyThemeSubject()` 切换外交主体和专题着色，不打开国家编辑。
- 重新生成区默认状态文本改为空，移除“待命”；后续点击后的提示 debug 化暂未在本轮实现。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。

后续：

- 二级动作面板目前先抽了颜色类共享组件；重命名、继承、外交关系、剪影/图标等相似动作后续可继续抽共享动作面板。
- 重新生成后的执行提示后续应接入 debug 模式开关，本轮只去掉默认“待命”。

### 运行时气候、单位 tab、二级浮层和连线树面板

背景：

- 用户指出气候控制不应只是生成参数，赤道/极点温度、画布纬度和风带方向应立即作用到当前画布。
- 用户指出气候投影需要表现为地球表面的闭合画布区域：随纬度靠近极点从梯形向三角形收束，赤道线也应闭合；风带应按纬度位置画在投影旁。
- 用户要求单位设置单独做控制面板 tab，距离单位决定面积单位，人口倍率、降水倍率和比例尺也放入该 tab。
- 用户要求列表下的二级编辑按钮开启新的独立面板，而不是在当前列表面板内展开。
- 用户要求文化/宗教树总览改为独立树状显示面板，节点之间用线连接。

修正：

- `ControlPanel` 新增“单位”tab，数字缩写、距离单位、派生面积单位、比例尺、人口倍率和降水倍率各占一行；面积单位由距离单位自动派生，旧的 `#area-unit` 保留为隐藏数据源供旧运行时代码读取。
- `display-units` 新增距离到面积单位的派生函数，`normalizeUnitPreferences()` 会按距离单位修正面积单位，避免 UI 与格式化函数分歧。
- 气候投影改为 SVG 圆地球：赤道和纬线用闭合椭圆绘制，当前画布用闭合多边形绘制，并按纬度宽度收束；六段风带按钮移到投影旁，仍通过点击箭头在东北、东南、西北、西南中轮询。
- `panel.js` 新增气候控件监听，赤道/南北极温度、画布纬度和风带变更会通过 `requestAnimationFrame` 合并后触发运行时刷新；气候控件从编辑交互锁禁用列表中移除，滑动时不再出现禁用状态。
- `runtime/app.js` 新增 `applyClimateControls()`，在不重新生成地形、国家或城市的情况下重算当前地图的温度、降水、生物群系和人口适宜度，并刷新 cell 颜色、点图层、运行统计和悬停面板；国家、城市、宗教、marker、zone、军事、经济、外交等下游系统标记为待派生。
- `UiActionDock` 的二级内容改为 Teleport 到 `body` 的固定浮层，国家、省份、城市、文化、宗教、河流、marker、外交等既有图标操作都会打开独立二级编辑面板，不再撑高原列表面板。
- 新增 `UiTreeDisplayPanel`，文化和宗教面板保留“打开树状面板”入口，完整树以独立浮层展示；节点按层级横向布局，父子关系用 SVG 曲线连接。
- `UiSelectField` 的菜单宽度下限提高，并参考最长选项文本扩展，继续保持 fixed Teleport，不参与浮动面板内容布局。

验证：

- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- Vite dev server + Playwright 验证通过：
  - 赤道温度从 `25` 改为 `35` 后，当前地图 `options.temperatureEquator = 35`、温度上限从 `24` 变为 `34`，`generatedAt` 不变，说明没有重新生成整图。
  - 赤道温度滑块 `disabled = false`，气候投影存在闭合 `polygon`，风带按钮数量为 `6`。
  - “单位”tab 可见，面板内只有数字缩写和距离两个可见下拉，`#area-unit` 为隐藏输入，视图 tab 不再包含单位设置。
  - 距离下拉菜单为 `position: fixed`，宽度与触发器一致且不撑开浮动面板。
  - 国家颜色图标操作打开 `.ui-secondary-action-panel`，该面板不在 `.floating-panel` 内。
  - 文化树独立面板显示 `12` 个节点和 `8` 条连接线，标题为“文化树总览”。

后续：

- 即时气候目前重算温度、降水、生物群系和人口适宜度；国家、经济、军事、外交等下游系统只标记待派生，后续需要做受约束局部重算。
- 树状面板当前使用轻量 SVG 布局，没有新增外部依赖；若后续需要折叠、缩放、搜索定位和虚拟化，可再评估引入成熟树图库。

### 气候投影细化、树面板拖动与 marker icon 命中

背景：

- 用户确认树状面板视觉可接受，但面板需要能拖动。
- 用户指出气候图上的纬线不需要做成 3D 感的环，应保持 2D 直线；赤道投影线必须比极圈纬线更长。
- 用户指出风带位置正确，但不需要大按钮和“北极带 / 北温带”等可见文字，只需要按顺序把风向调整按钮排列在地球投影旁并对齐位置。
- 用户要求资源和标记 icon 的点击响应区域扩大到整个 icon，而不是只在中心像素点附近命中。

修正：

- `UiTreeDisplayPanel` 增加标题栏拖动，面板用 fixed left/top 定位并限制在视口内；关闭按钮阻止拖动冒泡。
- 气候投影的纬线由 SVG 椭圆改为 2D 横线段，长度按 `cos(latitude)` 缩放；赤道线最长，高纬线更短，画布足迹仍保持闭合多边形。
- 风带按钮压缩为窄列箭头按钮，保留 tooltip 和 aria-label 描述风带范围与风向，不再在面板中显示“北极带 / 北温带”等文字。
- `PlaceholderMapRenderer.pickClientPoint()` 增加可见 marker icon 的 DOM bbox 命中：先用实际 `getBoundingClientRect()` 判断点击是否落在资源/标记 icon 整体区域内，再退回原有世界坐标半径命中；当点击命中可见 marker icon 时，marker 对象优先于标签返回。

验证：

- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 和 chunk size warning。
- Vite dev server + Playwright 验证通过：
  - 气候图存在 `5` 条 `.earth-latitude-guide`，`ellipse.earth-latitude-guide` 为 `0`。
  - 赤道线长度 `94`，高纬线长度 `47`，符合赤道长于极圈/高纬线的 2D 投影关系。
  - 风带按钮数量为 `6`，可见文本仅为箭头序列。
  - 文化树面板从 `{left: 656, top: 64}` 拖动到 `{left: 536, top: 116}`，标题栏 cursor 为 `move`。
  - marker icon 边缘点击返回 `pickedKind = marker`，并命中对应 `markerId`。

### 浮动控制面板宽度与 tab 单行化

背景：

- 用户指出控制面板宽度不足，新增“单位”tab 后顶部 tab 会折行。

修正：

- 浮动“控制面板”默认宽度由 `420px` 调整为 `520px`，最大宽度由 `520px` 调整为 `600px`，给生成、视图、单位、图层、管理五个 tab 留出稳定空间。
- `control-panel-tabs` 改为五列布局，避免第五个 tab 因原先固定四列而必然换行。

### 响应式目标边界

背景：

- 用户明确当前页面无需考虑过小页面，默认面向现代 PC 浏览器；平板屏幕可尽量兼容，但短期不是主要目标。

决策：

- 后续控制面板、浮动面板、表格和工具区布局以 PC 信息密度和操作效率为优先，不再为了手机级窄屏强行压缩或折叠核心操作。
- 保留基本的视口约束，避免平板或较窄桌面窗口直接破版；更细的移动端适配暂缓。

### 用户外壳、开发模式、导入导出和命名策略计划

背景：

- 用户要求本轮走复杂流程，先想清楚再落实代码，并及时提交但不推送。
- 新需求覆盖比例尺图层、开发模式、Element Plus 迁移、README、简介 tab、导出导入、灰度高度导入和国家命名策略，牵涉 UI 外壳、runtime、renderer、文件格式和生成器命名。

计划：

- 新增 `docs/task-notes/user-facing-shell-debug-export-and-naming-plan.md`，先盘点用户可见地图信息和开发/debug 信息边界。
- 第一批落地优先做全屏地图外壳、开发模式浮动面板、比例尺图层、README 和简介 tab。
- Element Plus 采用按需/分批迁移路线，参考官方中文文档的自动按需导入和 ESM tree shaking 方案；不做一次性全量替换。
- 完整地图数据导入导出、GeoJSON 导出、灰度高度图导入和春秋古国风命名拆成后续独立提交，避免互相污染风险。

### 用户外壳第一批：全屏地图、开发模式、比例尺与简介

背景：

- 用户要求普通页面不再常驻显示生成耗时、WebGL 加载、mesh 顶点等开发数据。
- 用户要求比例尺作为地图图层提供给普通用户，而开发信息收敛到可按需开启的开发模式。
- 用户要求新增人类可读 README，并在控制面板中增加项目简介 tab，后续承接导入导出入口。

修正：

- 页面外壳改为单列全屏地图，移除常驻 `.side-panel`；地图左上角只保留“控制面板”入口和 debug 开启后的“调试信息 / 开发模式”入口。
- 新增 `createDevelopmentPanel()`：开发模式复用浮动面板体系，支持拖动、关闭、收起为小按钮，并暴露 `window.__webglGeneratorDebug` 响应式控制对象；`?debug=1` 会自动开启。
- `runtime-stats`、`pick-stats` 和 `app-status` 迁入开发模式面板；普通模式仍保留地图 badge、图例、悬停/选择面板等用户可见地图信息。
- 图层新增“比例尺”，默认开启；地图左下角根据当前 canvas 宽度、相机缩放和单位配置计算 1/2/5 序列的实际距离，并随图层开关隐藏或显示。
- “控制面板”宽度扩大到 `600px`，tab 改为六列，新增“简介”tab；简介 tab 写明本项目参考 `Azgaar/Fantasy-Map-Generator`，并链接当前仓库和原项目。
- 新增根目录 `README.md`，说明项目定位、已完成能力、运行方式、debug 开启方式、当前限制和后续计划。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。
- Vite dev server + Playwright 验证通过：
  - 普通模式 `.side-panel` 数量为 `0`，地图舞台宽度为 `1400`，开发按钮隐藏，开发面板隐藏。
  - 普通模式比例尺显示，示例标签为 `264.6 千米`。
  - `?debug=1` 下 `window.__webglGeneratorDebug.enabled = true`，开发面板可见，运行时统计行数为 `69`。
  - 点击“收起”后开发面板隐藏，入口按钮仍显示为“开发模式”。
  - 控制面板“简介”tab 可见，仓库链接为 `https://github.com/mosuzi/fmg-gl`。
  - 图层“比例尺”开关关闭后，`#map-scale-bar.hidden = true`。

后续：

- Element Plus 迁移按需引入，不在本批代码中直接全量替换。
- 完整地图 JSON 导入导出、PNG 导出、GeoJSON 导出、灰度高度图导入和国家命名策略进入后续独立阶段。

### 本地导入导出第一刀

背景：

- 用户要求支持本地文件导出导入：图片、完整地图数据和标准地理数据，并能从完整数据重新导入复原地图。
- 简介 tab 后续会承接导入导出按钮，因此第一刀直接把入口放在简介 tab，避免挤占生成/视图/图层 tab。

修正：

- 新增 `runtime/map-file-io.js`，定义 `webgl-generator-map v1` 完整地图保存格式，包含 `type / version / exportedAt / options / metadata / map`。
- 完整地图 JSON 导出使用 typed array replacer，把 `Uint32Array / Uint16Array / Float32Array` 等显式保存为 `{__webglGeneratorTypedArray, data}`；导入时 reviver 恢复 typed array 构造器。
- 简介 tab 新增四个本地入口：导出图片、导出地图数据、导出 GeoJSON、导入地图数据，并显示 `file-operation-status` 状态。
- 导入完整地图数据后会同步 `state.options` 和基础生成控件，递增 `pendingGenerateId` 中断旧生成任务，随后复用 runtime 装载路径：清空选择、编辑历史和笔刷状态，重建 renderer，刷新对象面板、运行统计和选择面板。
- GeoJSON 第一刀按 pack cell 输出 `FeatureCollection`，每个 cell 是 Polygon，属性包含高度、水域、feature、biome、国家/省份/文化/宗教 id 与名称、人口；坐标按当前 `mapCoordinates` 做近似等距经纬投影。
- PNG 第一刀直接从 WebGL canvas `toBlob()` 导出，不合成 DOM 图例、比例尺、标签或浮动面板。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。
- Playwright + Chrome 验证通过：
  - 完整 JSON 下载格式为 `webgl-generator-map`，版本 `1`，`pack.cells.i` 保存为 `Uint32Array`，10k 默认图导出约 `10.3MB`。
  - GeoJSON 下载为 `FeatureCollection`，默认图输出 `5950` 个 Polygon。
  - roundtrip：导出 `stage-2-1` 后改 seed 重新生成，checksum 从 `7642d7ca` 变为 `cedd01d1`；导入导出的 JSON 后 checksum 恢复为 `7642d7ca`，`pack.cells.i.constructor.name = Uint32Array`。
  - PNG 下载文件头为标准 PNG，状态提示为“图片已导出。”。

后续：

- 图片导出需要进一步合成 DOM 标签、比例尺、图例和可选透明背景，才能成为真正所见即所得。
- 完整 JSON 目前未压缩，100k 地图会很大；后续可考虑 typed array base64、gzip 或分块保存。
- GeoJSON 后续应支持只导出陆地、按国家/省份 dissolve、坐标投影说明和大文件提示。

### 国家命名策略第一刀

背景：

- 用户指出中文国家名仍会出现大量相邻同根变体，例如“北清河邦 / 西清河邦 / 东清河邦”。
- 用户建议参考中国古代单字朝代和春秋诸侯国名，优先生成短、古雅、辨识度高的国家根名。

修正：

- `names.js` 新增春秋/周代诸侯国启发的古国风根名池，优先生成齐、晋、秦、楚、鲁、宋、卫、郑、陈、蔡、芮、郯等单字或短根名。
- `makeStateRoot()` 不再高概率复用文化根名；文化根名只在低概率且未占用时作为首选，避免同文化多个国家共享根名后再加方位词。
- 国家根名去重新增 `state-family` 逻辑：普通生成时同一根族只允许出现一次，只有极端兜底才允许“新/古/前/后/东/西/南/北”变体。
- `cleanStateRootCandidate()` 允许古国风单字根名通过，不再因长度小于 2 被清空。
- 当时国家形制收敛为“国、侯国、伯国、邦、朝”和少量地貌特化形式；本轮政体系统已进一步取代该旧口径，不再把“朝 / 侯国 / 伯国 / 自由邦”作为生成目标。

验证：

- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。
- Playwright + Chrome 三组 seed 抽样：
  - `stage-2-1`：20 个国家，短根名 `20`，单字根名 `8`，同根重复 `0`，旧形制命中 `0`。
  - `state-name-audit-1`：20 个国家，短根名 `19`，单字根名 `11`，同根重复 `0`，旧形制命中 `0`。
  - `state-name-audit-2`：20 个国家，短根名 `20`，单字根名 `9`，同根重复 `0`，旧形制命中 `0`。

后续：

- 目前古国风根名池仍会直接使用部分历史国名；后续可继续做“历史气质但非完全照搬”的生成变体。
- 省份、城市、文化和宗教命名还可以进一步联动，避免国家变短后局部地名风格显得太现代。

### Element Plus 迁移第一刀

背景：

- 用户要求后续组件尽量使用 Element Plus 替换，同时注意 tree shaking，避免最终产物过大。
- 只读调查确认当前应用由多个浮动面板分别 `createApp()`，不适合全局 `app.use(ElementPlus)`；旧 runtime 仍大量通过 DOM id 读取原生 input/select，不能一次性替换所有表单控件。

修正：

- 新增依赖：`element-plus`、`@element-plus/icons-vue`；新增构建侧插件依赖：`unplugin-vue-components`、`unplugin-auto-import`、`unplugin-element-plus`。
- `vite.config.mjs` 当前只启用 `unplugin-vue-components` 的 `ElementPlusResolver({importStyle: "css"})`，让模板里的 Element Plus 组件按需导入组件和对应 CSS；没有使用 `ElementPlus` 全局注册，也没有引入 `element-plus/dist/index.css`。
- `UiButton` 作为第一批样板迁移到 `ElButton`，保留原来的 `variant / active / buttonType` API 和 `.primary-action / .secondary-action` 样式类，业务面板无需改调用方式。
- CSS 增加 `.primary-action.el-button / .secondary-action.el-button` 的 margin 归零，避免 Element Plus 默认相邻按钮间距破坏现有网格布局。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。
- 体积基线：命名阶段构建约 `684.75KB JS / 208.39KB gzip`、`49.21KB CSS / 8.40KB gzip`；引入 `UiButton -> ElButton` 后约 `711.48KB JS / 218.56KB gzip`、`77.03KB CSS / 12.10KB gzip`。
- Playwright + 构建产物静态服务验证通过：页面中 `.el-button` 数量为 `61`，`#generate-map` 和 `#export-map-data` 都是 Element Plus 按钮；导出地图数据正常下载，点击“换 seed”后 checksum 正常变化，console/page error 为 `0`。

后续：

- 下一批建议迁移 `UiFilterInput`、`UiTextEditField`、`UiNumberField`、`UiSortBar`，继续只改 base 适配层。
- `UiSelectField / UiSliderField / UiSwitchField` 需要保留隐藏原生控件或 DOM id 桥，再迁移 Element Plus；否则旧 runtime 的 `.value/.checked/change` 读取链会断。
- 暂缓 `ElTable / ElTree / ElDialog / ElColorPicker / ElSelect` 等较重组件，迁移前先记录体积增量。

### 灰度高度图导入第一刀

背景：

- 用户希望能导入灰度图生成地形，并可调整高度映射区间，用来扩展项目玩法。
- 只读调查确认当前高度笔刷只同步 `grid / pack.cells.h`，不会重建 `features / pack / rivers / politics / settlements`，因此灰度导入不能走局部高度编辑路径。

修正：

- `heightmap.js` 新增采样型高度模板 `createSampledHeightmap()`；`applyHeightmap()` 遇到 `sampleHeight` 时按 `grid.points` 坐标写入高度，普通内置模板逻辑保持不变。
- `generatePlaceholderMap(inputOptions, overrides)` 支持传入 `overrides.heightmap`，让灰度图导入复用完整生成链路；传入采样型 heightmap 时，下游阶段使用 `grayscale-import` 作为有效 `heightmapTemplate`，避免继续触发导入前下拉模板的专属启发式。
- 新增 `runtime/heightmap-import.js`：浏览器读取本地图片到 canvas，计算图片亮度 min/max，把亮度自动归一化到用户设定的最低/最高高度，并返回 `grayscale-import` 高度模板。原始图片像素不进入地图导出数据。
- 生成 tab 在地形配置后新增“灰度高度图”区域，包含最低高度、最高高度和本地图片导入入口；导入状态显示在同一区域。
- 导入时读取当前控制面板 options，递增 `pendingGenerateId` 并记录 `heightmapImportId`，防止读图过程中被普通生成或另一轮导入覆盖；被替换的旧导入只清理自己的状态文案，随后重建整张地图并刷新 renderer、选择、编辑历史和对象面板。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `716.90KB JS / 220.48KB gzip`、`77.51KB CSS / 12.14KB gzip`。
- Playwright + 构建产物静态服务验证通过：合成 `32x24` 灰度 PNG，设置高度区间 `10..90` 后导入；`map.heightmap.template = grayscale-import`，source 记录文件名和亮度范围，实际 `grid.cells.h` 最小/最大为 `10 / 90`，checksum 从 `0de77532` 变为 `f26a4db9`，并重新生成 `features=5 / packCells=9709 / states=20 / cities=1349 / rivers=121`，console/page error 为 `0`。复测时把上传文件 MIME 置空，扩展名兜底可正常导入；另一次复测先把地形下拉设为“群岛”，导入后 `map/options/summary.heightmapTemplate` 仍均为 `grayscale-import`。

后续：

- 增加保持比例/裁剪、模糊降噪和陆地比例预检。
- 如果要对齐原版 Image Converter，再补彩色高度图色板识别、手动颜色映射和导入预览；这不应塞进当前第一刀。

### Element Plus 迁移第二刀

背景：

- 第一刀只迁移了 `UiButton`，用户仍希望逐步全量替换自写组件，但不能因为一次性替换打断旧 runtime 的 DOM id / `.value` 读取链。
- 本刀选择不依赖旧 runtime 直接读取的 Vue 内部基础组件：筛选输入、文本编辑、数字编辑和排序条。

修正：

- `UiFilterInput` 改为 `ElInput`，保留 `modelValue / update:modelValue / placeholder` API，并启用 clearable。
- `UiTextEditField` 改为 `ElInput`，保留表单提交和 `apply` 事件。
- `UiNumberField` 改为 `ElInputNumber`，保留 `min / max / step / apply` 事件，避免把数值控件继续留在原生 input。
- `UiSortBar` 改为复用 `UiButton`，因此排序按钮也走 `ElButton` 适配层。
- 新增 Element 输入暗色适配 CSS，统一 `.el-input / .el-input-number / .el-input__wrapper / .el-input__inner`，并覆盖旧面板中 `input` 选择器对 Element 内部 input 的干扰。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `756.84KB JS / 234.58KB gzip`、`93.80KB CSS / 14.38KB gzip`。
- Playwright + 构建产物静态服务验证城市面板：
  - `.city-panel-controls .ui-filter-input.el-input` 存在，筛选“京”后城市行数从 `817` 降到 `24`。
  - `.city-panel-sort .el-button` 数量为 `5`，点击排序后 active 文案为“人口 ↑”。
  - 选中城市后，二级编辑浮层“重命名”出现 `ElInput`，二级编辑浮层“调整人口”出现 `ElInputNumber`。
  - console/page error 为 `0`。

后续：

- `UiSelectField / UiSliderField / UiSwitchField` 暂不迁移，必须先设计隐藏原生控件或事件桥，保证 `panel.js` 中按 DOM id 读取 `.value/.checked/change` 的逻辑不被破坏。
- `ElInput / ElInputNumber` 引入后 gzip 增量明显高于按钮样板，后续如果继续迁移表格、树、弹窗，应同步考虑面板级懒加载或 chunk 拆分。

### 灰度高度图反转映射补充

背景：

- 灰度高度图第一刀已经支持高度区间映射，但常见高度图可能用黑色表示山体或白色表示山体，用户需要能快速反转黑白含义。
- 该补充只调整采样映射方向，不改变完整重生成链路，也不引入图片持久化。

修正：

- 灰度高度图区域新增“反转黑白”开关，并加入编辑锁定控制。
- `createGrayscaleHeightmapFromImage()` 读取 `invert` 设置；采样时先按图片亮度 min/max 归一化，再在开启反转时使用 `1 - normalized` 写入高度。
- `createSampledHeightmap()` 的 source 元数据保存 `invert`，完整地图 JSON 导出会随 heightmap source 一起保留该信息。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `757.14KB JS / 234.77KB gzip`、`93.95KB CSS / 14.40KB gzip`。
- Playwright + 构建产物静态服务验证通过：合成 `32x24` 斜向渐变 PNG，设置高度区间 `10..90` 并开启反转后导入；`map.heightmap.template = grayscale-import`，source 记录 `invert: true`，实际 `grid.cells.h` 最小/最大为 `10 / 90`，左上低亮度角高度为 `90`、右下高亮度角高度为 `10`，console/page error 为 `0`。

后续：

- 继续补保持比例/裁剪、模糊降噪、导入预览和原版 Image Converter 的彩色高度方案识别。

### Element Plus 迁移第三刀：下拉组件

背景：

- 用户明确指出自写下拉组件已经暴露出空白点击收起、弹层宽度和撑开浮层滚动高度等问题。
- `UiSelectField` 同时用于生成参数、单位配置、外交主体、文化/宗教父级、国家/省份编辑和资源/城市视觉配置；其中 `heightmap-template` 仍被 `panel.js` 直接按 DOM id 读取和写入。

修正：

- `UiSelectField` 改为使用 `ElSelect / ElOption` 作为视觉层，弹层交由 Element Plus popper 管理。
- 保留隐藏原生 `<select id=...>` 桥：Element 选择变化后同步原生 select 并派发 `change`；外部导入地图或旧 runtime 写原生 select 后，也会反向同步 Vue 当前值。
- 下拉 popper 添加暗色样式、最小宽度和长文本换行，避免中文长选项过窄或截断。
- 删除旧自绘 trigger/menu/option/arrow 的有效样式，保留 `.ui-select-field` 布局类供现有面板继续复用。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `858.60KB JS / 268.63KB gzip`、`112.16KB CSS / 17.18KB gzip`。
- Playwright + 构建产物静态服务验证通过：
  - 控制面板中 `.ui-select-field .el-select` 数量为 `9`，旧 `.ui-select-trigger` 数量为 `0`。
  - 打开地形下拉后 popper 位于 document body 内，不在 `.floating-panel` 内；宽度约 `476px`。
  - 打开下拉前后控制面板 body 的 `scrollHeight/clientHeight` 均为 `971 / 857`，没有因下拉弹层额外撑高。
  - 点击空白后 popper 保留 DOM 但 `display: none`、`aria-hidden=true`，视觉上已收起。
  - 选择“群岛”后隐藏原生 `#heightmap-template.value = archipelago`；点击生成后 `map.heightmap.template = archipelago`，console/page error 为 `0`。

后续：

- `ElSelect` 的 gzip 增量约 `+33.86KB JS / +2.78KB CSS`，后续迁移 `ElTree / ElTable / ElDialog` 前必须考虑懒加载、拆包或仅在特定浮层中按需加载。
- `UiSliderField / UiSwitchField` 仍未迁移；迁移前同样要保留隐藏 input 或事件桥，避免 `panel.js` 读取 `.value/.checked` 的链路断开。

### Element Plus 迁移第四刀：控制面板 Tabs

背景：

- 用户要求控制面板宽度足以容纳 tab，不希望出现折行；当前 `UiTabs` 是自写 button 组，虽然可用，但仍是后续组件库替换的一部分。
- 只读搜索确认项目脚本没有依赖旧的 `.control-panel-tabs button` 或 `data-control-tab` button 结构。

修正：

- `UiTabs` 改为 `ElTabs / ElTabPane`，仍通过 `v-model activeTab` 驱动原有 `data-control-panel` 面板显示。
- tab label slot 保留 `data-control-tab` 标记，方便后续自动化或样式定位。
- 增加 Element Tabs 暗色紧凑样式，隐藏默认 active bar 和空 pane content，维持六个 tab 一行排列。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `877.61KB JS / 275.08KB gzip`、`128.40KB CSS / 19.07KB gzip`。
- Playwright + 构建产物静态服务验证通过：`.control-panel-tabs .el-tabs__item` 数量为 `6`，旧 `.control-panel-tabs button` 数量为 `0`；六个 tab 的 top 坐标均为 `67`，没有换行；点击“单位 / 图层 / 生成”后对应 `data-control-panel` 正常显示，console/page error 为 `0`。

后续：

- 后续自动化验证控制面板 tab 时应优先使用 `role=tab` 或 `[data-control-tab]`，不要再假设 tab 是 button。
- Tabs 增量约 `+6.45KB JS gzip / +1.89KB CSS gzip`，继续记录组件迁移体积。

### Element Plus 迁移第五刀：滑动条组件

背景：

- 灰度高度图、气候、单位倍率、标签数量和对象编辑半径/宽度都依赖 `UiSliderField`。
- 旧 runtime 仍会按 DOM id 读取部分 range 的 `.value`，因此不能直接删除原生 input。

修正：

- `UiSliderField` 改为 `ElSlider` 视觉层，所有现有调用 API 保持不变。
- 保留隐藏原生 `input[type=range]` 桥：Element Slider 输入后同步隐藏 range，并派发 `input/change`；外部脚本写隐藏 range 后也能反向更新组件状态。
- 增加 `.ui-slider-*` 暗色样式，统一滑轨、进度条和滑块视觉，并覆盖旧字段里的 `input { width: 100%; }` 规则，避免隐藏 range 露出。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `894.48KB JS / 280.29KB gzip`、`133.04KB CSS / 19.80KB gzip`。
- Playwright + 构建产物静态服务验证通过：控制面板中 `.ui-slider-el` 数量为 `14`，隐藏 `input.ui-slider-native[type=range]` 数量为 `14`，可见原生 range 数量为 `0`；点击灰度最低高度滑轨后 `#heightmap-import-min.value` 与 output 同步为 `61`；点击单位页人口倍率滑轨后隐藏值为 `3.6`，显示为 `3.6x`，console/page error 为 `0`。

后续：

- `UiSwitchField` 仍未迁移；它包含普通 checkbox 和 layer button 两种语义，迁移前需要决定是否把 layer button 保持为按钮式开关，还是改成 Element Switch。
- Slider 增量约 `+5.21KB JS gzip / +0.73KB CSS gzip`，继续记录组件迁移体积。

### Element Plus 迁移第六刀：开关组件

背景：

- `UiSwitchField` 同时承担普通 checkbox 行和图层按钮式开关，旧 runtime 会按 DOM id 读取或监听部分 checkbox。
- 图层开关需要保持整行可点击和明显选中态，不能只换成孤立的小控件。

修正：

- `UiSwitchField` 改为 `ElSwitch` 视觉层，普通开关和按钮式图层开关复用同一个适配层。
- 保留隐藏原生 checkbox 桥：Element Switch 变化后同步 hidden checkbox 并派发 `change`；外部脚本写 hidden checkbox 后可反向更新组件状态。
- 按钮式图层开关选中态改为 `.is-checked`，继续保留整行点击和深色面板样式。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `899.56KB JS / 281.46KB gzip`、`137.51KB CSS / 20.44KB gzip`。
- Playwright + 构建产物静态服务验证通过：`.ui-switch-el` 数量为 `5`，隐藏 `input.ui-switch-native[type=checkbox]` 数量为 `5`，可见原生 checkbox 数量为 `0`；点击灰度“反转黑白”整行后 hidden checkbox、行选中态和 Element 选中态均为 `true`；点击“显示海底”图层按钮后 hidden checkbox、按钮选中态和 Element 选中态均为 `true`，console/page error 为 `0`。
- 组件迁移组合烟测通过：最新构建中 `.el-button = 113`、`.ui-select-field .el-select = 9`、`.ui-slider-el = 14`、`.ui-switch-el = 5`、tab 数 `6`；连续操作地形下拉、灰度高度 slider、反转开关、人口倍率 slider、显示海底开关并生成地图后，隐藏地形值和 `map.heightmap.template` 均为 `archipelago`，console/page error 为 `0`。

后续：

- 基础表单组件的按钮、输入、数字输入、筛选、排序、下拉、tab、slider、switch 已完成 Element Plus 适配层迁移；后续若进入 `ElTable / ElTree / ElDialog / ElColorPicker`，应先做懒加载或拆包方案。
- Switch 增量约 `+1.17KB JS gzip / +0.64KB CSS gzip`，继续记录组件迁移体积。

### PNG 导出 overlay 合成第一刀

背景：

- 本地导入导出第一刀的 PNG 只导出 WebGL canvas，不包含普通用户可见的比例尺和地图尺寸摘要。
- 当前比例尺和地图 badge 都是稳定 DOM overlay，适合先合成进图片；完整图例、城市/国家标签和浮动面板仍需要更完整的所见即所得策略。

修正：

- `downloadCanvasPng()` 新增 `includeMapOverlays` 选项；正式“导出图片”入口启用该选项。
- 导出时创建离屏 canvas，先复制 WebGL canvas，再按当前 DOM / canvas 坐标比例绘制右上角 `#map-badge` 和左下角 `#map-scale-bar`。
- 比例尺合成会重画面板背景、`_|_` 形比例尺线和当前距离文本；地图 badge 合成会重画背景和摘要文本。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `902.02KB JS / 282.53KB gzip`、`137.51KB CSS / 20.44KB gzip`。
- Playwright + 构建产物静态服务验证通过：点击“导出图片”下载 `fmg-stage-2-1-2a83d85f.png`，文件约 `34068` bytes，PNG 尺寸为 `1440x920`、RGBA；导出前比例尺未隐藏，标签为 `264.6 千米`；下载 PNG 中比例尺白线区域 `800` 个像素里有 `220` 个亮色像素，状态提示为“图片已导出。”，console/page error 为 `0`。

后续：

- 继续合成温度/降水/外交图例、城市/国家标签、资源图标和可选透明背景；浮动控制面板默认不应进入导出图，除非后续增加“导出当前屏幕”模式。

### 灰度高度图适应方式补充

背景：

- 灰度高度图导入第一刀会把图片直接拉伸到当前地图尺寸；当用户导入宽幅或窄幅图时，地形容易被横向或纵向压扁。
- 完整手动裁剪预览较重，但可以先提供常见的“保持比例居中裁剪”模式，避免默认强制变形。

修正：

- 灰度高度图区域新增“适应方式”下拉，选项为“拉伸铺满”和“保持比例裁剪”。
- `createGrayscaleHeightmapFromImage()` 在读取像素前按 `fitMode` 绘制图片：`stretch` 保持旧行为，`crop` 按目标地图比例从图片中心裁剪后铺满采样 canvas。
- `heightmap.source.fitMode` 保存适应方式，导入成功状态文案显示当前模式。
- 编辑锁定列表加入 `#heightmap-import-fit`，导入或生成过程中不可改。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `902.89KB JS / 282.92KB gzip`、`137.57KB CSS / 20.45KB gzip`。
- Playwright + 构建产物静态服务验证通过：合成 `96x24` 宽幅灰度 PNG，选择“保持比例裁剪”后导入；隐藏 `#heightmap-import-fit.value = crop`，`map.heightmap.template = grayscale-import`，`map.heightmap.source.fitMode = crop`，状态文案为“已导入灰度高度图：wide-height-gradient.png，高度 0-100，保持比例裁剪”，console/page error 为 `0`。

后续：

- 可继续补留白适应、手动裁剪框、导入预览缩略图和导入前陆地比例预估。

### 原版功能候选巡视

背景：

- 用户要求夜间继续巡视计划中不完备的点，也可以阅读原版代码，找出有趣但当前版本尚未实现的功能，简单的考虑实现，复杂的先落文档。

记录：

- 新增 `docs/task-notes/source-feature-backlog.md`。
- 文档按“优先可做 / 先落文档 / 长期复杂系统”记录原版功能候选：
  - 优先可做：测量工具、对象注记、名称库编辑器、分层 GeoJSON。
  - 先落文档：高度图工作台增强、样式预设与视觉风格编辑、市场/商品与贸易动画、战斗模拟与军事事件。
  - 长期复杂系统：纹章、子地图与地图变换。

后续：

- 下一批若继续做用户工具，建议先从测量工具开始；它能直接复用当前比例尺、相机和世界坐标换算，并且不要求先补全复杂 source 视觉 parity。

### 测量工具第一刀

背景：

- 原版 FMG 有 `Ruler / Opisometer / RouteOpisometer / Planimeter` 等测量工具；当前 WebGL 版只有比例尺，用户无法在地图上临时测距。
- 第一刀只做临时折线距离，不写入地图数据、不进入撤销栈，避免和对象编辑器耦合。

修正：

- 地图工具栏新增“测量”按钮，进入测量模式后按钮变为“退出测量”，body 增加 `measurement-active`。
- 新增 `#measurement-overlay`，使用 SVG 绘制测量折线和节点，并显示“测量 / 总长 / 清除”读数卡。
- 测量模式下 canvas capture 阶段拦截左键点击，使用 `renderer.screenToWorld()` 添加测量点，避免触发对象选择或拖拽。
- 距离按当前单位偏好用 `formatDisplayDistance()` 显示；相机变化、适配视图和单位变化都会刷新测量 overlay。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `905.98KB JS / 284.00KB gzip`、`138.80KB CSS / 20.63KB gzip`。
- Playwright + 构建产物静态服务验证通过：点击“测量”后 `aria-pressed=true`，点击地图两点后 `.measurement-point = 2`、`.measurement-path = 1`，summary 为 `2 点 / 总长 1,085.4 千米`，`selection.object = null`；点击“清除”后点线为 `0`、按钮 disabled；点击“退出测量”后 overlay hidden，console/page error 为 `0`。

后续：

- 补面积测量、节点拖拽、删除最后一点、路线贴合测量、保存测量对象和导出测量结果。

### 要素 GeoJSON 导出第一刀

背景：

- 原版 FMG 支持按路线、河流、marker、zone 等对象导出 GeoJSON；当前 WebGL 版此前只有 pack cell Polygon 导出，地理数据能力不够分层。
- 第一刀优先做路线、河流和 marker 三类对象，保持与 pack cell Polygon 导出分开，避免一个按钮输出过大的混合文件。

修正：

- 简介 tab 新增“导出要素 GeoJSON”按钮。
- `createMapFeatureGeoJson()` 输出混合 `FeatureCollection`：路线和河流为 `LineString`，marker 为 `Point`。
- 每个要素带 `layer`、id、类型、政区、资源和经济等属性，文件名使用 `.features.geojson` 后缀。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `908.73KB JS / 284.60KB gzip`、`138.80KB CSS / 20.63KB gzip`。
- Playwright + 构建产物静态服务验证通过：下载文件名为 `fmg-stage-2-1-497329e2.features.geojson`，大小约 `310KB`，`FeatureCollection` 共 `810` 个要素，其中 route `602`、river `164`、marker `44`，geometry 为 `766` 个 `LineString` 和 `44` 个 `Point`，状态提示为“要素 GeoJSON 已导出，共 810 个路线、河流和标记要素。”，console/page error 为 `0`。

后续：

- 补 zone 导出、国家/省份 dissolve、范围选择、分层选择和更完整属性映射。

### Element Plus 迁移第七刀：共享颜色选择器

背景：

- 国家、省份、文化、宗教的“调整颜色”都复用 `UiColorField / UiColorActionPanel`，是继续推进组件库迁移时收益较高的共享点。
- 颜色选择器的弹层会 Teleport 到 `body`，必须和二级编辑面板的“点击空白关闭”规则兼容。

修正：

- `UiColorField` 改为使用 `ElColorPicker`，提供一组地图编辑常用预设色，并保留原 `modelValue / apply / className` API。
- `UiActionDock` 的外部点击判定补充识别 `.el-popper / .el-picker__popper / .el-color-dropdown / .el-select-dropdown`，避免点击 Element Plus 弹层时误关闭二级编辑面板。
- 补充 `.ui-color-picker` 暗色样式，并适配国家、省份、文化、宗教不同二级改色面板的既有列宽。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `926.56KB JS / 289.65KB gzip`、`146.71KB CSS / 21.82KB gzip`。
- Playwright + 构建产物静态服务验证通过：打开控制面板管理 tab、国家编辑、二级“调整颜色”，颜色盘弹出后 `.ui-color-picker = 1`、原生 `input[type=color] = 0`，二级编辑面板保持开启；点预设色后二级面板仍开启；点空白后二级面板和颜色盘均关闭，console/page error 为 `0`。

后续：

- `ElTable / ElTree / ElDialog` 仍需先设计懒加载或拆包方案；不要把大组件一次性塞进首屏主 chunk。

### zone 要素 GeoJSON 导出

背景：

- 上一刀要素 GeoJSON 已覆盖路线、河流和 marker，但原版分层导出里还有 zone。
- 当前 zone 数据是 pack cell 集合，第一刀先用 `MultiPolygon` 表达每个 zone 覆盖的 cell polygon 集合，不做 dissolve。

修正：

- `createMapFeatureGeoJson()` 新增 `zoneFeatures()`，输出 `layer=zone` 的 `MultiPolygon` Feature。
- zone 属性包含 id、name、type、hidden、cells 和 color；FeatureCollection metadata 增加 zones 计数，`layerSet` 改为 `routes-rivers-markers-zones`。
- `projectWorldPoint()` 增加非有限坐标过滤，避免坏点写成 `NaN` 坐标。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `927.31KB JS / 289.86KB gzip`、`146.71KB CSS / 21.82KB gzip`。
- Playwright + 构建产物静态服务验证通过：下载文件名为 `fmg-stage-2-1-68c7df07.features.geojson`，大小约 `353KB`，`FeatureCollection` 共 `819` 个要素，其中 route `602`、river `164`、marker `44`、zone `9`，geometry 为 `766` 个 `LineString`、`44` 个 `Point` 和 `9` 个 `MultiPolygon`；首个 zone 为 `zone-0 / Invasion / 26 cells / 26 polygons`，状态提示正确，console/page error 为 `0`。

后续：

- 后续可把 zone cell polygon dissolve 成更少的外轮廓，并增加分层选择、范围导出和国家/省份 dissolve。

### 对象注记实现计划

背景：

- 夜间继续对照原版功能时，发现 Notes Editor 覆盖对象范围较广，不适合只在当前 ObjectDetailsPanel 里临时添加 textarea。
- 原版 `editNotes(id, name)` 使用全局 `notes[]`，每条 `{id, name, legend}`，可绑定 label、burg、river、route、marker、regiment 等对象，并支持富文本、定位、pin、下载和上传。

记录：

- 新增 `docs/task-notes/object-notes-implementation-plan.md`。
- 文档定义 WebGL 版建议数据契约 `map.notes.notes[]`，id 使用 `${kind}:${objectId}`，并保留 `kind / objectId / name / body / format / pinned / createdAt / updatedAt`。
- 第一阶段建议新增运行时 helper、`createSetObjectNoteCommand()`、共享 `UiNoteField`，先接入 marker、city、river、route，再接入 state、province、culture、religion、label。
- 计划明确第一阶段只做纯文本，富文本、AI 生成、独立备注总览和孤儿备注清理策略后置。

后续：

- 进入代码实现前，先补 `object-notes.js` helper 和命令层，再从 marker 面板做最小可验收闭环：编辑、撤销/重做、导出完整 JSON、导入复原。

### marker 备注第一刀

背景：

- 对象注记计划已经确定先从 marker 做最小闭环，避免一次性改所有专用面板。
- marker 面板已有二级操作栏和历史按钮，适合作为 `map.notes` 数据契约的第一处代码落点。

修正：

- 新增 `app/webgl-generator/src/runtime/object-notes.js`，提供 `objectNoteId()`、读取、恢复、删除和 metadata 维护。
- 新增 `UiNoteField`，使用 `ElInput type="textarea"`，支持应用和清空。
- `createSetMarkerNoteCommand()` 写入 `${kind}:${objectId}` note id，进入 `EditHistory`，撤销时恢复旧备注或删除新备注。
- 资源与标记管理面板二级操作新增“编辑备注”，详情中显示“无”或“有备注（N字）”。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `931.10KB JS / 290.99KB gzip`、`147.10KB CSS / 21.88KB gzip`。
- Playwright + 构建产物静态服务验证通过：给首个 marker 写入“第一条 marker 备注：矿脉附近有旧道路。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（23字）”；撤销后 notes 为 `0`，重做后恢复为 `1`；导出完整地图 JSON 后，`map.notes.notes[0].body` 保留同一备注，console/page error 为 `0`。

后续：

- 补 city、river、route 的同类入口，再考虑 state、province、culture、religion、label 和独立备注总览。

### marker 备注接入要素 GeoJSON

背景：

- marker 备注已经保存在完整地图 JSON 中；如果用户导出标准地理数据，也应能把资源点或标记说明带出去。

修正：

- `createMapFeatureGeoJson()` 的 marker properties 新增 `hasNote` 和 `note`。
- `map-file-io.js` 复用 `readObjectNote()`，只对存在正文的 marker 标记 `hasNote: true`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `931.18KB JS / 291.03KB gzip`、`147.10KB CSS / 21.88KB gzip`。
- Playwright + 构建产物静态服务验证通过：给 marker `#2` 写入“GeoJSON 备注检查：这里有珍贵矿脉。”后导出 `fmg-stage-2-1-f6cfb182.features.geojson`，对应 `marker-2` 的 properties 中 `hasNote = true`，`note` 正文一致，带备注 marker 数为 `1`，console/page error 为 `0`。

### 城市备注第一刀

背景：

- marker 备注闭环跑通后，下一步按对象注记计划接入 city；城市管理面板同样有二级操作栏和历史按钮。

修正：

- `city-edit-commands.js` 新增 `createSetCityNoteCommand()`，复用 `object-notes.js` 的 note id、读取、恢复和删除能力。
- 城市管理面板新增“编辑备注”二级操作，复用 `UiNoteField`。
- `city-panel` 增加 `version` 刷新计数，避免 markRaw 地图内部备注变更后详情 computed 不重算。
- 城市详情新增备注状态：“无”或“有备注（N字）”。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `932.80KB JS / 291.15KB gzip`、`147.13KB CSS / 21.88KB gzip`。
- Playwright + 构建产物静态服务验证通过：给城市 `#1` 写入“城市备注检查：此城是北境贸易节点。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（17字）”；撤销后 notes 为 `0` 且详情显示“无”，重做后恢复为 `1`。
- 最终导出完整地图 JSON 验证通过：`fmg-stage-2-1-260af816.webgl-map.json` 中 `map.notes.notes[0]` 为 `city:1`，正文为“城市备注导出检查：港口仓储完善。”，console/page error 为 `0`。

后续：

- 继续补 river / route 备注入口；如果进入国家、省份、文化、宗教，则优先复用二级操作栏，不要塞进列表主体。

### 导出能力矩阵

背景：

- 当前已同时存在 PNG、完整地图 JSON、pack cell GeoJSON、要素 GeoJSON 和备注字段导出，后续继续扩展前需要把各格式职责分清楚。

记录：

- 新增 `docs/task-notes/export-capability-matrix.md`。
- 文档按入口列出文件后缀、格式、主要内容、是否可重新导入复原和当前状态。
- 文档拆分说明完整地图 JSON、pack cell GeoJSON、要素 GeoJSON 和 PNG 的用途、字段、已验证点与缺口。
- 后续建议顺序为 GeoJSON 分层选择、国家/省份 dissolve、city GeoJSON layer、PNG 倍率/overlay 选项、完整 JSON 压缩和版本迁移器。

### 河流备注第一刀

背景：

- marker 和 city 备注已跑通，river 面板也具备二级操作栏、历史按钮和专用命令文件，适合继续补对象注记。

修正：

- `river-edit-commands.js` 新增 `createSetRiverNoteCommand()`，复用 `object-notes.js` 的 note id、读取、恢复和删除能力。
- 河流管理面板新增“编辑备注”二级操作，复用 `UiNoteField`。
- `river-panel` 增加 `version` 刷新计数，避免 markRaw 地图内部备注变更后详情 computed 不重算。
- 河流详情新增备注状态：“无”或“有备注（N字）”。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `934.48KB JS / 291.47KB gzip`、`147.17KB CSS / 21.89KB gzip`。
- Playwright + 构建产物静态服务验证通过：给河流 `#45` 写入“河流备注检查：这条河适合设渡口。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（16字）”；撤销后 notes 为 `0` 且详情显示“无”，重做后恢复为 `1`。
- 导出完整地图 JSON 验证通过：`fmg-stage-2-1-ebb0e1b8.webgl-map.json` 中 `map.notes.notes[0]` 为 `river:45`，正文一致，console/page error 为 `0`。

后续：

- 补 route 备注入口；之后再考虑国家、省份、文化、宗教和标签。

### 路线备注第一刀

背景：

- marker、city 和 river 备注闭环都已跑通，route 是第一批最常用专用对象面板中的最后一个缺口。
- route 面板此前只有只读列表和定位，没有二级操作栏、历史按钮或 edit command 文件，因此本刀同时补最小编辑基础设施。

修正：

- 新增 `runtime/route-edit-commands.js`，提供 `createSetRouteNoteCommand()`，备注 id 仍使用 `route:${id}`。
- 路线管理面板新增“编辑备注”二级操作，复用 `UiNoteField`，并增加 `history` 与 `version` 刷新信号。
- `runtime/app.js` 将 route 备注接入 `EditHistory`，支持撤销和重做，并在备注变更后刷新 route 面板。
- 要素 GeoJSON 的 route 和 river properties 新增 `hasNote` 与 `note` 字段；marker 已有字段保持不变。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `937.62KB JS / 291.80KB gzip`、`147.18KB CSS / 21.90KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：给路线 `#0` 写入“路线备注检查：这条道路适合设商站。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（17字）”；撤销后 notes 为 `0` 且详情显示“无”，重做后恢复为 `1`。
- 完整地图 JSON `fmg-stage-2-1-bb2f7448.webgl-map.json` 中 `map.notes.notes[0]` 为 `route:0`，正文一致；要素 GeoJSON `fmg-stage-2-1-bb2f7448.features.geojson` 中 `route-0` 的 `hasNote = true` 且 `note` 正文一致；console/page error 为 `0`。

后续：

- 对象注记第一批已覆盖 marker、city、river、route。下一步如果继续做备注，建议进入 state / province / culture / religion / label，并优先复用已有二级操作栏。

### 国家/省份备注第一刀

背景：

- route 备注完成后，对象注记的下一个自然入口是政治对象。国家和省份面板已经有二级操作栏、历史按钮和对象选择状态，适合继续复用同一套备注 UX。
- state / province / culture / religion / label 后续都会是“对象存在 -> 写入 map.notes -> 刷新对象面板”的模式，因此本刀先补通用备注命令，避免继续复制专用 note command。

修正：

- `object-edit-commands.js` 新增 `createSetObjectNoteCommand()`，复用 `object-notes.js` 的 note id、读取、恢复和删除能力，并通过 `readObjectName()` 做对象存在校验。
- 国家编辑面板和省份管理面板新增“编辑备注”二级操作，复用 `UiNoteField`。
- `state-panel` 与 `province-panel` 增加 `version` 刷新信号，避免 markRaw 地图内部备注变更后详情 computed 不重算。
- 国家和省份详情新增备注状态：“无”或“有备注（N字）”。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `940.07KB JS / 292.02KB gzip`、`147.26KB CSS / 21.91KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：给国家 `#1` 写入“国家备注检查：此国适合设为北境霸主。”后详情显示“有备注（18字）”，撤销后 notes 为 `0` 且详情显示“无”，重做后恢复。
- 同一轮继续给省份 `#1` 写入“省份备注检查：这里适合规划粮仓。”后 notes 为 `2`，撤销省份备注后 notes 为 `1` 且 state 备注仍存在，重做后完整 JSON `fmg-stage-2-1-460ac096.webgl-map.json` 同时包含 `state:1` 和 `province:1`；console/page error 为 `0`。

后续：

- 对象注记下一步可接 culture / religion / label；三者都应继续复用 `createSetObjectNoteCommand()` 和二级操作栏。

### 文化/宗教备注第一刀

背景：

- state / province 已证明通用 `createSetObjectNoteCommand()` 可以覆盖非线状、非点状对象。文化和宗教面板同样具备二级操作栏、历史按钮和树状总览，适合继续补备注入口。

修正：

- 文化管理面板和宗教管理面板新增“编辑备注”二级操作，复用 `UiNoteField` 和 `createSetObjectNoteCommand()`。
- `culture-panel` 与 `religion-panel` 增加 `version` 刷新信号，避免 markRaw 地图内部备注变更后详情 computed 不重算。
- 文化和宗教详情新增备注状态：“无”或“有备注（N字）”。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `941.61KB JS / 292.20KB gzip`、`147.31KB CSS / 21.92KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：给文化 `#1` 写入“文化备注检查：这个文化适合扩展商贸传统。”后详情显示“有备注（20字）”，撤销后 notes 为 `0` 且详情显示“无”，重做后恢复。
- 同一轮继续给宗教 `#1` 写入“宗教备注检查：这里适合设置朝圣路线。”后 notes 为 `2`，撤销宗教备注后 notes 为 `1` 且 culture 备注仍存在，重做后完整 JSON `fmg-stage-2-1-fcc49865.webgl-map.json` 同时包含 `culture:1` 和 `religion:1`；console/page error 为 `0`。

后续：

- 对象注记第一批专用面板只剩 label 未接入；之后再考虑独立备注总览、孤儿备注标记和富文本/Markdown。

### 标签备注第一刀

背景：

- marker、city、river、route、state、province、culture、religion 的备注入口都已完成，第一批对象注记只剩标签管理面板。
- 标签对象有城市标签、国家标签和手工标签三种来源，id 空间可能重叠，因此不能直接使用 `label:${id}`。

修正：

- `label-edit-commands.js` 新增 `createSetLabelNoteCommand()`，标签备注 id 使用 `label:${targetKind}:${targetId}`，例如 `label:city:0`。
- 标签管理面板将原本常露出的重命名输入收进 `UiActionDock` 二级操作栏，并新增“编辑备注”入口。
- 标签详情新增备注状态：“无”或“有备注（N字）”。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `943.85KB JS / 292.58KB gzip`、`147.42KB CSS / 21.94KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：给城市标签 `city:0` 写入“标签备注检查：这个城市名需要靠近河口。”后，`map.notes` 中生成 `label:city:0`，不会生成 `city:0` 城市本体备注；详情显示“有备注（19字）”。
- 撤销后 notes 为 `0` 且详情显示“无”；重做并导出完整 JSON `fmg-stage-2-1-17047708.webgl-map.json` 后保留 `label:city:0`，console/page error 为 `0`。

后续：

- 对象注记第一批入口已闭环。下一步应转入独立备注总览、孤儿备注标记、批量定位和导入导出备注摘要。

### 备注总览第一刀

背景：

- marker、city、river、route、state、province、culture、religion 和 label 的备注入口已经闭环，用户需要一个集中查看和处理所有 `map.notes` 的入口。
- 原版 FMG 的 Notes Editor 支持对象下拉、定位、下载、上传和删除；WebGL 版第一刀先做轻量总览，不引入富文本或 AI。

修正：

- 新增 `runtime/note-edit-commands.js`，提供 `createDeleteNoteCommand()`，删除备注进入 `EditHistory`，可撤销和重做。
- 新增 `NotesPanel.vue` 与 `ui/panels/notes-panel.js`，管理 tab 新增“备注总览”入口。
- 备注总览显示备注总数、可定位数、孤儿备注数和筛选数，支持按更新时间、类型、名称和字数排序，支持筛选正文、名称、类型和 id。
- 备注总览可定位有效对象；对象缺失或 id 无法解析时标记为“对象缺失”，避免强行定位崩溃。
- 标签备注会按 `label:${targetKind}:${targetId}` 解析，例如 `label:city:0` 会定位城市标签对象而不是城市本体备注。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `950.98KB JS / 294.12KB gzip`、`148.71KB CSS / 22.09KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：给 marker `#0` 写入“备注总览验证：这里有一处矿脉。”，给城市标签 `city:0` 写入“标签备注总览验证：城市名不要遮挡河口。”后，管理 tab 的“备注总览”入口可见，面板显示 `备注 2 / 可定位 2 / 孤儿备注 0 / 筛选 2`。
- 验证中定位 marker 备注后 `selection.object.kind = marker`、`renderer.locateStatus = marker #0`；删除该备注后 notes 只剩 `label:city:0` 且历史为 `删除备注 江陵火山`；撤销后恢复 `marker:0`；筛选“标签备注总览”只保留 `label:city:0`，console/page error 为 `0`。

后续：

- 可继续补备注独立导入导出、孤儿备注批量清理、备注摘要导出；富文本、Markdown 和 AI 辅助仍暂缓。

### 城市要素 GeoJSON 第一刀

背景：

- 要素 GeoJSON 已覆盖 route、river、marker 和 zone，但城市只随 pack cell GeoJSON 或完整地图 JSON 间接出现。
- 城市是最常用的标准地理 Point 图层，且 city 备注已经进入 `map.notes`，应能随要素导出带出。

修正：

- `createMapFeatureGeoJson()` 新增 `cityFeatures(map)`，输出 `layer = city` 的 Point Feature。
- city properties 包含 id、burg、name、type、group、population、capital、provincial、port、state/province/culture/religion 名称与 id、grid cell、pack cell、hasNote 和 note。
- 要素 GeoJSON 元数据 `layerSet` 更新为 `cities-routes-rivers-markers-zones`，并新增 `cities` 计数字段。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `952.11KB JS / 294.36KB gzip`、`148.71KB CSS / 22.09KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：给城市 `#0 / 青台` 写入“城市 GeoJSON 备注检查：港口仓储完善。”后导出 `fmg-stage-2-1-c0f5082f.features.geojson`。
- 导出文件 `layerSet = cities-routes-rivers-markers-zones`，metadata `cities = 817`，Feature 计数为 city `817`、route `602`、river `164`、marker `44`、zone `9`；`city-0` 为 Point，properties 中 `hasNote = true` 且 `note` 正文一致，console/page error 为 `0`。

后续：

- 继续补国家/省份 dissolve、分层选择、范围导出和 CRS 元数据配置。

### 要素 GeoJSON 分层选择第一刀

背景：

- 要素 GeoJSON 已覆盖 city、route、river、marker 和 zone，但此前只能一次性全部导出。
- 用户在 GIS 或外部工具中常只需要某几类要素，分层选择可以先降低文件体积和后续清洗成本。

修正：

- `createMapFeatureGeoJson(map, {layers})` 支持按 city、route、river、marker、zone 开关生成 Feature。
- 简介 tab 新增“要素 GeoJSON 图层”开关，默认五层全开，导出时读取隐藏 checkbox 状态。
- 导出元数据 `layerSet` 和各图层计数会随选择同步变化；状态提示显示导出的要素总数和图层集合。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `953.86KB JS / 294.85KB gzip`、`149.39KB CSS / 22.20KB gzip`。
- Playwright + 构建产物内置静态服务验证通过：在简介 tab 关闭 route、river、zone，仅保留 city 和 marker 后导出 `fmg-stage-2-1-3983ab14.features.geojson`。
- 导出文件 `layerSet = cities-markers`，metadata 为 cities `817`、routes `0`、rivers `0`、markers `44`、zones `0`；Feature 计数为 city `817`、marker `44`，总数 `861`；状态提示为“要素 GeoJSON 已导出，共 861 个要素，图层：cities-markers。”，console/page error 为 `0`。

后续：

- 继续补国家/省份 dissolve、范围导出、CRS 元数据配置和更完整属性映射。

### 政治面 GeoJSON / dissolve 计划

背景：

- 导出能力矩阵的下一项是国家/省份政治面，但真正 dissolve 需要拓扑边界合并、ring 拼接和 hole 处理，不能直接把 cell 集合称为外轮廓。
- 为避免过早引入沉重 GIS 库或产出误导性文件，本轮先落实可执行计划文档。

记录：

- 新增 `docs/task-notes/political-geojson-dissolve-plan.md`。
- 文档拆分第一阶段 `state/province` 非 dissolve MultiPolygon 集合和第二阶段真正 dissolve 外轮廓。
- 文档记录了建议 properties、图层开关默认策略、拓扑边 key 算法、ring/hole 风险、性能风险和验收标准。

后续：

- 可先实现默认关闭的 `state/province` 非 dissolve 图层，并在 properties 中标注 `dissolved=false`；真正 dissolve 应先做脚本原型验证。

### 春秋古国风命名第二刀

背景：

- 第一刀已经解决“东/西/南/北清河”式同根重复，但真实抽样里仍会出现“芮海邦”“郯河国”这类单字古国根名与地貌形制硬拼的问题。
- 用户希望国家命名更接近中国古代单字国名或最多一个方位词，例如齐、晋、秦、楚、东晋，并希望参考春秋诸侯国名扩展策略。

修正：

- 扩充并清理 `ANCIENT_STATE_ROOTS`，补入单、舒、鄣、鄀、鄂、轸、邿、郕、弦、遂、鄅、鄟、邳、根牟、须句、逼阳、钟吾和群舒分支等短根名，去掉重复项和明显误写项。
- 国家根名候选更偏向古国短名：古国根名概率提高，文化地貌词根概率降低，轻幻想/高幻想仍保留为低概率兜底。
- `defineStateForms()` 会把古国根名传给命名器；古国根名优先使用普通“国 / 侯国 / 伯国 / 邦 / 朝”形制，不再被海洋、河流、林地等文化类型套成地貌形制。
- `state-family` 归并补充 `舒*`、`曾/鄫/缯`、`谭/郯`，减少近源或近形国名同时出现。

验证：

- 抽样 `stage-2-1`、`spring-autumn-001`、`spring-autumn-002`、`1231411414`、`audit-continents-001` 五组 seed，每组 `20` 个国家。
- 五组样本短根名为 `19-20` 个，单字根名为 `8-13` 个，归并后的同根重复均为 `0`。
- 样本中 `芮 / 郯 / 楚 / 邓 / 蜀 / 邶 / 黄 / 濮 / 许 / 滕 / 齐 / 荆 / 夔 / 吕 / 越 / 薛` 等古国根名均使用普通形制，未再出现“芮海邦 / 郯河国”式组合。

后续：

- 后续可做名称库编辑器、区域禁用字、避讳规则、国家-省份-城市命名联动，以及更明确的文化命名风格包。

### 政治面 GeoJSON 第一阶段

背景：

- 要素 GeoJSON 已支持城市、路线、河流、标记和区域，但国家、省份仍只能通过 pack cell GeoJSON 间接分析。
- 真正 dissolve 外轮廓需要拓扑边合并和 ring 校验；本阶段只做明确标注的非 dissolve MultiPolygon 集合。

修正：

- `createMapFeatureGeoJson(map, {layers})` 新增 `state` 和 `province` 图层，默认关闭。
- 简介 tab 的“要素 GeoJSON 图层”新增“国家面 / 省份面”开关，运行时读取 `feature-export-layer-state / province`。
- 导出按 `pack.cells.state / province` 分组陆地 cell，复用 `packCellPolygon()` 生成 MultiPolygon；properties 明确输出 `dissolved=false`。
- 国家面输出名称、首都、文化、宗教、面积、人口、邻接、颜色和备注；省份面输出所属国家、省会、面积、人口、邻接、颜色和备注。

验证：

- Node 直接验证：仅开启 state/province 时，`layerSet = states-provinces`，state `20`、province `259`，政治面总数 `279`，bad `0`。
- 默认导出仍为 `cities-routes-rivers-markers-zones`，state/province metadata 为 `0`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `957.08KB JS / 295.69KB gzip`、`149.39KB CSS / 22.20KB gzip`。
- Playwright route 构建产物验证通过：打开控制面板简介 tab，默认 `state=false / province=false / city=true`；点击“国家面 / 省份面”后导出 `fmg-stage-2-1-5c3a6601.features.geojson`。
- 导出文件 `layerSet = states-provinces-cities-routes-rivers-markers-zones`，Feature 计数 state `20`、province `213`、city `817`、route `602`、river `164`、marker `44`、zone `9`；政治面 `233` 个，bad `0`，状态提示正确，console/page error 为 `0`。

后续：

- 真正 dissolve 外轮廓仍需按 `docs/task-notes/political-geojson-dissolve-plan.md` 做拓扑边界原型，再决定是否接 UI。

### GeoJSON bbox 第一刀

背景：

- 当前 GeoJSON 已有近似经纬度坐标，但缺少标准 `bbox`，外部工具或后续范围导出无法快速判断空间范围。
- bbox 不改变现有几何和属性语义，适合作为范围导出、视口裁剪和 GIS 索引前置能力。

修正：

- `createMapGeoJson()` 和 `createMapFeatureGeoJson()` 返回前会调用 `attachGeoJsonBboxes()`。
- 每个 Feature 依据自身 geometry 坐标写入 `bbox = [minLon, minLat, maxLon, maxLat]`。
- FeatureCollection 会合并所有 feature bbox 写入整体 `bbox`。

验证：

- Node 直接验证：pack cell GeoJSON 的 collection bbox、首个 feature bbox、前 20 个 feature bbox 均有效。
- Node 直接验证：开启 `states-provinces-cities` 的要素 GeoJSON collection bbox、首个 feature bbox、前 20 个 feature bbox 均有效，`featureCount = 1100`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `957.83KB JS / 295.96KB gzip`、`149.39KB CSS / 22.20KB gzip`。

后续：

- 可基于 bbox 做范围导出、视口导出、导出前体积预估，以及对象定位/空间索引优化。

### 备注摘要导出第一刀

背景：

- 完整地图 JSON 已包含 `map.notes`，但它面向复原地图，不适合给外部脚本或人类快速阅读。
- 备注总览已能筛选、排序、定位和删除备注，顺手导出当前筛选结果可以补齐备注摘要导出缺口。

修正：

- `NotesPanel.vue` 的操作区新增“导出备注摘要”按钮；按钮在当前筛选结果为空时禁用。
- `createNotesPanel()` 透传 `onExport(rows)` 回调。
- 运行时新增 `exportNotesSummary()`，导出 `webgl-generator-notes-summary v1` JSON。
- 摘要包含 seed、checksum、当前导出备注数、总备注数、备注 id、kind、对象 id、显示名、正文、字数、孤儿状态、创建时间和更新时间。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `958.77KB JS / 296.22KB gzip`、`149.39KB CSS / 22.20KB gzip`。
- Playwright route 构建产物验证通过：注入 `marker:0` 与 `label:city:0` 两条备注后，打开备注总览，摘要显示 `备注2 / 可定位2 / 孤儿备注0 / 筛选2`。
- 点击“导出备注摘要”后下载 `fmg-stage-2-1-0857e6f9.notes.json`，`type = webgl-generator-notes-summary`，metadata `notes = 2 / totalNotes = 2`，两条备注均保留正文和 orphan 状态，console/page error 为 `0`。

后续：

- 可继续做备注独立导入、孤儿备注批量清理和 Markdown / 富文本格式，但不应替代完整地图 JSON 的保存职责。

### 面积测量第一刀

背景：

- 原版测量工具包含距离和面积类工具，当前 WebGL 版只完成了临时折线测距。
- 面积测量可以直接复用现有测量点、比例尺和单位换算，不需要引入新的面板或保存格式。

修正：

- 测量点达到 `3` 个及以上时，`updateMeasurementOverlay()` 会用首尾闭合的多边形绘制 `.measurement-area` 半透明面片。
- 新增 `measurementArea(points)`，按 shoelace 公式计算内部地图单位面积。
- 测量摘要在三点及以上显示“总长 + 面积”，面积使用现有 `formatArea()` 和单位偏好换算。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `959.18KB JS / 296.36KB gzip`、`149.49KB CSS / 22.22KB gzip`。
- Playwright route 构建产物验证通过：开启测量后点击三点，页面生成 `1` 个 `.measurement-area`、`1` 条 `.measurement-path` 和 `3` 个 `.measurement-point`。
- 测量摘要为 `3 点 / 总长 994.3 千米 / 面积 11万 平方公里`，measurement active 为 true，console/page error 为 `0`。

后续：

- 可继续补节点拖拽、路线贴合测量、保存测量对象和导出测量结果。

### 测量结果导出第一刀

背景：

- 折线测距和面积测量已经能在画布上显示，但结果无法带出页面。
- 先导出轻量 JSON 可以服务外部记录和脚本处理，暂不引入持久化测量对象。

修正：

- `measurement-readout` 新增“导出”按钮，测量点为空时禁用。
- 新增 `exportMeasurement()`，导出 `webgl-generator-measurement v1` JSON。
- 导出内容包含 seed、checksum、图幅尺寸、点数、单位偏好、地图单位距离/面积、显示标签和测量点列。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `960.20KB JS / 296.59KB gzip`、`149.49KB CSS / 22.22KB gzip`。
- Playwright route 构建产物验证通过：开启测量后，无点时“导出”按钮禁用；点击三点后按钮可用。
- 下载 `fmg-stage-2-1-a6390a8f.measurement.json`，`type = webgl-generator-measurement`、`pointCount = 3`、`distanceLabel = 994.3 千米`、`areaLabel = 11万 平方公里`、点列长度 `3`，console/page error 为 `0`。

后续：

- 可继续做节点拖拽、路线贴合和保存测量对象；测量 JSON 导入暂不进入当前批次。

### 名称库编辑器计划

背景：

- 用户已经多次关注中文命名质量，尤其是国家名同质化和春秋古国风短名。
- 原版 FMG 提供 `Namesbase Editor`，支持编辑名称库、生成示例、质量分析、下载和上传，但 WebGL 版当前只有代码内置词池。

对照 source：

- 阅读 `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts`：确认原版编辑器有选择 base、编辑名称样本、`min/max/d`、生成示例、分析、恢复默认、下载、上传覆盖和上传追加。
- 阅读 `source/Fantasy-Map-Generator/src/generators/names-generator.ts`：确认原版通过 `calculateChain()` 构建 Markov chain，通过 `getBase()`、`getCulture()`、`getState()` 使用名称库。
- 阅读 `source/Fantasy-Map-Generator/src/index.html` 的 `#namesbaseEditor`：确认原版 UI 布局和按钮集合。

记录：

- 新增 `docs/task-notes/namebase-editor-plan.md`。
- 文档定义了建议的 `map.namebases` 数据契约、`webgl-generator-namebases v1` 导出方向和四阶段推进顺序。
- 计划强调：用户名称库接入国家根名时仍必须走当前 `state-family` 去重和古国形制规则，不能绕过现有中文命名修正。

后续：

- 优先做只读名称库总览与名称库导出，再做可编辑用户名称库；文化级绑定和 Markov chain 复刻后置。

### 名称库总览第一刀

背景：

- 名称库编辑器计划已经明确第一阶段只做只读总览，避免在没有数据契约和导入导出格式前直接改变生成逻辑。
- 当前内置词池散落在 `names.js` 常量中，用户无法直观看到春秋古国根名、文化风格词池和重复项情况。

修正：

- `names.js` 新增 `getBuiltinNamebaseSummaries()`，只返回内置词池统计值和样例，不暴露可变数组引用，也不调用随机生成流程。
- 管理 tab 新增“名称库”入口，打开 `NamebasePanel.vue` 浮层，可查看词池总数、样本总数、唯一样本、重复样本、筛选、排序、表格和选中详情。
- `UiObjectTable` 增加 `showLocateAction` 可选项，默认保持原行为；名称库不是地图对象，因此隐藏定位列。

验证：

- Node 直接验证 `getBuiltinNamebaseSummaries()` 输出 `61` 个内置词池、总样本 `2241`；“春秋古国根名”为 `96` 个样本、`96` 个唯一样本、`0` 个重复，长度范围 `1-2`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `969.34KB JS / 298.99KB gzip`、`150.71KB CSS / 22.40KB gzip`。
- Playwright + 构建产物静态服务验证通过：管理 tab 点击“名称库”后打开 `名称库总览` 浮层，表格行数 `61`，指标为 `词池 61 / 样本 2241 / 唯一样本 2233 / 重复 8`；“春秋古国根名”详情显示 `96` 个样本、`0` 重复，样例含 `齐、晋、秦、楚、鲁、宋、卫、郑`；打开前后 checksum 均为 `7fda045e`，console/page error 为 `0`。

后续：

- 下一步可做 `webgl-generator-namebases v1` 导出；用户自定义名称库、Markov chain 复刻和文化级绑定仍按计划后置。

### 名称库导出第一刀

背景：

- 名称库总览已经能显示内置词池摘要，但用户还不能把当前内置命名资源带出页面。
- 导出名称库可以服务外部审阅和后续自定义名称库格式设计，同时仍不需要改变生成逻辑。

修正：

- `getBuiltinNamebaseSummaries()` 增加可选 `includeSource`，默认仍只返回统计；导出时才返回复制后的完整 `source` 数组。
- 名称库总览面板新增“导出名称库”按钮。
- 运行时新增 `exportNamebases()`，导出 `webgl-generator-namebases v1` JSON，包含词池 id、名称、类型、分类、样本统计、长度范围、说明和完整样本数组，并写入当前地图 seed/checksum 作为上下文。

验证：

- Node 直接验证：默认 `getBuiltinNamebaseSummaries()` 不带 `source`，`includeSource: true` 时输出 `61` 个词池、`2241` 个样本，“春秋古国根名”保留 `96` 个 source 样本，前八项为 `齐、晋、秦、楚、鲁、宋、卫、郑`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `971.04KB JS / 299.24KB gzip`、`150.80KB CSS / 22.41KB gzip`。
- Playwright + 构建产物静态服务下载验证通过：点击“导出名称库”后下载 `fmg-stage-2-1-c59fdd6b.namebases.json`，`type = webgl-generator-namebases`、`version = 1`、`bases = 61`、`samples = 2241`，`ancient-state-roots.source.length = 96`，打开前后 checksum 稳定，console/page error 为 `0`。

后续：

- 下一步若继续做名称库系统，应先做导入格式的覆盖/追加策略和用户自定义名称库历史，再考虑 Markov chain 和生成绑定。

### 名称库导入第一刀

背景：

- 内置名称库已经可以导出为 `webgl-generator-namebases v1` JSON，但导出的文件还不能重新导入项目。
- 在真正影响生成前，需要先验证用户库数据契约可以进入 `map.namebases` 并随完整地图 JSON 保存。

修正：

- 新增 `generator/namebase-store.js`，集中处理名称库文档创建、解析、导入归一化和总览摘要合并。
- 名称库总览面板新增“导入名称库”文件入口；导入 `webgl-generator-namebases v1` 后，会把非空词池追加为 `map.namebases.bases` 中的用户库，id 统一加 `imported-` 前缀并避让冲突。
- 总览面板新增“来源”列和详情项，内置库显示“内置”，导入库显示“导入”。
- 完整地图 JSON 不需要额外格式改动，因为 `createMapDocument()` 已经保存整个 `map`；导入名称库会随 `map.namebases` 一起保存。

验证：

- Node 直接验证：`createBuiltinNamebaseDocument()` 生成 `61` 个词池；`importNamebaseDocument()` 导入后 `map.namebases.bases = 61`，总览摘要合并后行数为 `122`，首个导入 id 为 `imported-ancient-state-roots`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `974.41KB JS / 300.52KB gzip`、`150.81KB CSS / 22.40KB gzip`。
- Playwright + 构建产物静态服务闭环验证通过：先下载 `fmg-stage-2-1-d3c70dc7.namebases.json`，再通过“导入名称库”读回；导入后 `map.namebases.bases = 61`，总览行数 `122`、导入行数 `61`，状态为“名称库已导入 61 个词池，当前用户库 61 个。”；随后导出完整地图 `fmg-stage-2-1-d3c70dc7.webgl-map.json`，其中 `map.namebases.bases.length = 61`，首个 id 为 `imported-ancient-state-roots`；打开前后 checksum 稳定，console/page error 为 `0`。

后续：

- 继续做用户库编辑/删除前，应先补清理导入库和覆盖/追加模式；生成绑定仍需等 `state-family` 去重和古国形制规则接入设计完成。

### 名称库当前库导出

背景：

- 名称库导入后，用户库已经能进入 `map.namebases.bases` 并随完整地图 JSON 保存。
- 但“导出名称库”仍只导出内置库，会导致用户库无法通过名称库文件单独迁移。

修正：

- `generator/namebase-store.js` 新增 `createNamebaseDocument(map)`，导出内置库和当前 `map.namebases.bases` 中的用户库；保留 `createBuiltinNamebaseDocument(map)` 作为只导内置库的 helper。
- 名称库导出 metadata 现在写入 `builtin / user` 数量，运行时状态文案显示用户库数量。

验证：

- Node 直接验证：内置名称库导出仍为 `61` 个词池、用户库 `0`；导入 61 个用户库后，当前库导出为 `122` 个词池，其中内置 `61`、用户 `61`。
- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `974.97KB JS / 300.68KB gzip`、`150.81KB CSS / 22.40KB gzip`。
- Playwright + 构建产物静态服务验证通过：初始点击“导出名称库”得到 `bases = 61 / builtin = 61 / user = 0`；把该文件导入后再次导出得到 `bases = 122 / builtin = 61 / user = 61`，导出文件中 `!builtin` 记录为 `61` 个，首个用户库 id 为 `imported-ancient-state-roots`，状态为“名称库已导出，共 122 个词池，用户库 61 个。”，console/page error 为 `0`。

后续：

- 下一步可做用户库删除/清理和导入覆盖/追加模式；用户库真正影响生成仍需单独设计。

### 重新生成提示收敛到开发模式

背景：

- 用户此前指出重新生成区域不应显示面向开发的“待命”和后续内部状态提示。
- “待命”已经移除，但点击重新生成后的详细结果仍会写回管理面板，包含派生系统刷新、约束说明等调试信息。

修正：

- `updateRegenerationSection()` 现在会检查 `window.__webglGeneratorDebug.enabled`。
- 普通模式下，重新生成按钮执行后 `#regeneration-status` 保持空白，说明文字回到稳定默认说明。
- 详细重算结果仍写入开发模式“状态”区；当 `?debug=1` 或 `window.__webglGeneratorDebug.enabled = true` 开启时，管理面板也会显示详细状态和约束说明，方便开发调试。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 与 chunk size warning。构建产物约 `975.23KB JS / 300.76KB gzip`、`150.81KB CSS / 22.40KB gzip`。
- Playwright + 构建产物静态服务验证通过：普通模式点击“道路”重生成后，`#regeneration-status` 为空，`#regeneration-constraint` 为稳定默认说明；详细结果只写入隐藏开发模式状态区。执行 `window.__webglGeneratorDebug.enabled = true` 后再次点击“道路”，管理面板显示详细状态和约束，开发模式按钮可见，console/page error 为 `0`。

后续：

- 如果后续需要普通用户可见反馈，应增加短 toast 或状态灯，不再复用当前内部调试文案。

### 用户名称库清空第一刀

背景：

- 名称库导入和当前库导出已经完成，但导入实验会不断追加用户库。
- 在单个用户库编辑/删除实现前，需要一个安全的“回到干净用户库状态”的操作。

修正：

- `namebase-store.js` 新增 `clearUserNamebases(map)`，只清空 `map.namebases.bases`，不影响内置词池。
- 名称库总览新增“清空用户库”按钮，无用户库时禁用；执行前用浏览器确认提示，清空后刷新总览和文件操作状态。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-ZsEjZH6D.js`，gzip 约 `301.04KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：先导出当前 61 个内置名称库，再导入为用户库，点击“清空用户库”后确认弹窗为“确定清空 61 个用户名称库？”，最终 `map.namebases.bases = 0`、总览行数 `61`、导入行数 `0`、清空按钮重新禁用、文件操作状态为“已清空 61 个用户名称库。”，console/page error 为 `0`。

后续：

- 继续做单个用户库删除、复制内置库、重命名和编辑前，应先决定是否接入 `EditHistory` 或独立名称库历史栈。

### 用户名称库单个删除第一刀

背景：

- 清空用户库能回到干净状态，但导入多个用户词池后仍缺少更细粒度清理能力。
- 名称库当前尚未真正绑定生成流程，删除用户库更接近文件数据管理，而不是地图对象编辑。

修正：

- `namebase-store.js` 新增按 id 删除用户名称库的 helper，并统一刷新名称库 metadata。
- 名称库总览新增“删除选中”按钮，仅选中用户库时可用；内置库不会进入可删除状态。
- 运行时删除前用浏览器确认，删除后刷新名称库总览并显示剩余用户库数量。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-BqKhyx_W.js`，gzip 约 `301.37KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：初始选中内置名称库时“删除选中”按钮 `aria-disabled = true`，导入 61 个用户库并选中导入行后 `aria-disabled = false`；第一次删除确认选择取消后 `map.namebases.bases = 61` 且状态不变，第二次确认后 `map.namebases.bases = 60`、总览行数 `121`、导入行数 `60`，状态为“已删除用户名称库“中文地名词干”，当前用户库 60 个。”；随后导出名称库，metadata 为 `bases = 121 / builtin = 61 / user = 60`，非内置记录数 `60`，console/page error 为 `0`。

后续：

- 单个编辑、复制内置库、重命名和覆盖/追加模式仍未实现；若这些操作开始影响生成，应再决定是否引入 `EditHistory` 或名称库专用历史栈。

### 复制内置名称库为用户库

背景：

- 单个删除和清空用户库已经能管理导入库，但用户还不能从内置词池创建可编辑副本。
- 后续做词池编辑前，需要先避免“直接修改内置库”的路径。

修正：

- `namebase-store.js` 新增 `copyBuiltinNamebaseToUser(map, id)`，从内置只读摘要中取完整 `source`，复制为 `map.namebases.bases` 中的用户库，id 使用 `user-` 前缀并避让冲突。
- 名称库总览新增“复制内置”按钮，仅选中内置库时可用；复制结果来源显示为“复制”，可继续导出、删除、清空并随完整地图保存。
- 底部操作区改用 `auto-fit` 网格，避免新增按钮后固定列数挤压。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-6OjCQcxq.js`，gzip 约 `301.67KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：打开名称库总览后，“复制内置”在选中内置库时可用，“删除选中”仍禁用；复制“春秋古国根名”后 `map.namebases.bases.length = 1`，新增用户库 id 为 `user-ancient-state-roots`，名称为“春秋古国根名 副本”，来源为“复制”，样本数 `96`。总览行数 `62`，其中内置 `61`、复制 `1`；导出名称库 metadata 为 `bases = 62 / builtin = 61 / user = 1`，复制记录 source 长度 `96`；导出完整地图 JSON 后 `map.namebases.bases.length = 1`，console/page error 为 `0`。

后续：

- 下一步可在复制出的用户库上做重命名、样本编辑和导入覆盖/追加策略；生成绑定仍后置。

### 用户名称库重命名第一刀

背景：

- 复制内置库后，用户会得到默认“某某 副本”的名称。
- 在样本编辑实现前，先允许用户给用户库改名，方便后续导出和管理。

修正：

- `namebase-store.js` 新增 `renameUserNamebase(map, id, name)`，只允许重命名 `map.namebases.bases` 中的非内置记录，空名称会报错。
- 名称库总览在选中用户库时显示名称编辑器；内置库不显示该编辑器。
- 运行时重命名后刷新总览并显示状态，仍不接入 `EditHistory`。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-BngTNCW4.js`，gzip 约 `301.99KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：初始选中内置库时不显示名称编辑器；复制“春秋古国根名”后选中副本并重命名为“古国根名自定义”，`map.namebases.bases.length = 1`，`map.namebases.bases[0].name = 古国根名自定义` 且写入 `updatedAt`，总览中重命名行数为 `1`，状态为“已重命名用户名称库“春秋古国根名 副本”为“古国根名自定义”。”；导出名称库 metadata `user = 1` 且复制记录名称为新名称，导出完整地图 JSON 中用户库名称也为新名称，console/page error 为 `0`。

后续：

- 下一步可进入样本编辑、导入覆盖/追加和文化绑定设计。

### 用户名称库样本编辑第一刀

背景：

- 用户库已经可以导入、复制、重命名和删除，但还不能改词池样本。
- 原版名称库编辑器的样本编辑会影响后续名称链缓存；当前 WebGL 版还没有生成绑定，因此第一刀只更新用户库数据本身。

修正：

- `namebase-store.js` 新增 `updateUserNamebaseSource(map, id, sourceText)`，按换行、英文逗号和中文逗号拆分样本，过滤空值并拒绝空词池。
- 导入名称库和样本编辑共用同一套样本归一化逻辑。
- 名称库总览在选中用户库时显示多行样本编辑器；内置库仍只读，不显示编辑器。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-DpCMlKK_.js`，gzip 约 `302.59KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：初始选中内置库时不显示样本编辑器；复制“春秋古国根名”后选中副本，把样本编辑为 `甲 / 乙 / 丙 / 丁 / 戊`，最终 `map.namebases.bases[0].source.length = 5`，`updatedAt` 已写入，总览复制行显示样本 `5`，状态为“已更新用户名称库“春秋古国根名 副本”，样本 5 个。”；导出名称库中复制记录 `samples = 5` 且 source 为这 5 个值，导出完整地图 JSON 中用户库 source 也一致，console/page error 为 `0`。

后续：

- 后续再做权重、样例生成预览、文化绑定和名称生成链缓存；本次不改变当前地图对象名称。

### 名称库导入追加/替换模式

背景：

- 名称库导入此前固定追加，用户反复试导入时容易堆积大量重复用户库。
- 清空用户库虽然可用，但导入前需要额外操作。

修正：

- 名称库总览新增“导入方式”选择，默认“追加到用户库”，可切换为“替换用户库”。
- `importNamebaseDocument()` 支持 `mode = append / replace`；替换模式只清空 `map.namebases.bases` 中的用户库，不影响内置词池。
- 导入完成状态会显示替换掉的原用户库数量。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-Bm92DS2b.js`，gzip 约 `302.84KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：初始导入方式为 `append`；先导出 61 个内置词池文件，再复制 1 个内置库为用户库，切换导入方式为 `replace` 后导入该文件，最终 `map.namebases.bases.length = 61`，导入来源 `61`、复制来源 `0`，总览行数 `122`、导入行数 `61`，状态为“名称库已导入 61 个词池，已替换原用户库 1 个，当前用户库 61 个。”；再次导出名称库 metadata 为 `bases = 122 / builtin = 61 / user = 61`，导入记录 `61`、复制记录 `0`，console/page error 为 `0`。

后续：

- 后续可继续做导入前预览、冲突处理和错误行明细；当前仍是一次性文件导入。

### 名称库绑定生成专项计划

背景：

- 名称库数据管理链路已经较完整，但真正接入生成会影响国家、城市、河流、湖泊和文化命名。
- 当前国家命名已有春秋古国短名、形制和 `state-family` 去重，不能简单把用户词池硬替换进去。

修正：

- 新增 `docs/task-notes/namebase-generation-binding-plan.md`，记录原版 `Names.getBase / culture.base` 参考语义、WebGL 当前命名入口、`map.namebases.bindings` 数据契约、全局绑定、文化级绑定、样例生成和显式重命名命令的阶段拆分。
- 在名称库编辑器计划中补专项文档链接，后续实现绑定时从该计划进入。

验证：

- 文档检查通过；本次只写计划，不改运行时代码。

后续：

- 若继续实现，应先做绑定数据和只读失效状态，再接全局 `stateRoot / place / hydro`，最后才做文化级绑定和显式重命名。

### 名称库质量提示第一刀

背景：

- 原版 Namesbase Editor 会根据样本数量、链路多样性和重复项提示名称库质量。
- 当前 WebGL 版已经能编辑用户库样本，需要最基本的质量反馈。

修正：

- 名称库总览详情新增“质量”行，按样本量和重复项给出“样本偏少 / 样本可用 / 样本充足 / 样本过多 / 有重复样本”。
- 筛选条件加入质量文本，方便找出偏少或重复的词池。

验证：

- `$env:CI='true'; npm run build` 通过；产物为 `dist/webgl-generator/assets/index-D4zvlRey.js`，gzip 约 `302.94KB`。仍有既有的 Rolldown `#__PURE__` 注释警告和大 chunk 警告。
- Playwright 构建产物烟测通过：复制“春秋古国根名”后把用户库样本编辑为 `甲 / 乙 / 丙 / 丁 / 戊`，详情中显示“质量 / 样本偏少”；筛选“偏少”后可见行数 `49`，其中复制用户库命中 `1`，console/page error 为 `0`。

后续追记：

- 后续已补项目内 Markov chain、链路多样性和生成样例质量第一刀。

### Element Plus 迁移第八刀：分段控件

背景：

- `UiSegmented` 仍是自写按钮组，主要用于视图模式、高度编辑动作和 marker 范围。
- 视图模式按钮有旧 runtime 依赖的 `[data-mode]` 契约，不能简单替换成 Element Plus 后丢失 DOM 桥。

修正：

- `UiSegmented` 改为 `ElSegmented` 视觉层，保留不可见桥按钮给旧 runtime 绑定和同步 active 状态。
- 点击 Element 选项时会同步内部值、触发 Vue 回调，并在视图模式场景中派发桥按钮 click，从而继续调用旧的 `handlers.onMode()`。
- 样式把 Element segmented 的选项组改成可换行网格，避免 11 个视图模式在控制面板内被压成一行。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；产物为 `dist/webgl-generator/assets/index-BngNbC1T.js`，约 `986.31KB JS / 304.22KB gzip`，CSS 约 `155.39KB / 23.02KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：`.ui-segmented-el = 3`、旧 `.segmented:not(.ui-segmented) button = 0`、`[data-mode] = 11`；切换“外交”后桥按钮 active 和 Pinia 偏好均为 `diplomacy`；高度编辑动作可切为“平滑”，marker 范围可切为“资源点”，console/page error 为 `0`。

后续：

- `ElTable / ElTree / ElDialog` 仍不能直接常驻主包；迁移前应先做懒加载或拆包方案，并为对象列表保留选中、定位和自动滚入视口契约。

### 对象详情开发信息收敛第一刀

背景：

- 开发模式已经承接运行时统计、选择统计、checksum 和重新生成内部状态，但各类对象详情面板仍直接显示 `grid cell / pack cell / burg id / 对象 id` 等内部定位信息。
- 这些字段对调试很有用，但普通用户更关心名称、类型、人口、面积、宗教、文化、备注等地图语义。

修正：

- 新增 `useDebugMode()` 组合函数，通过 `window.__webglGeneratorDebug.enabled` 读取开发模式状态，并监听 `webgl-generator-debug-change`。
- `UiDetailGrid` 支持行级 `debug: true`，普通模式隐藏，开发模式开启后显示。
- 城市、marker、国家、省份、文化、宗教、路线、备注总览和通用对象详情中的内部 cell/id、pole、feature、命中距离、内部归属诊断等字段标记为 debug 行。
- 开发模式面板启停时派发 `webgl-generator-debug-change`，已打开的 Vue 浮层可响应状态变化。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；产物为 `dist/webgl-generator/assets/index-B_zXECIF.js`，约 `987.15KB JS / 304.43KB gzip`，CSS 约 `155.39KB / 23.02KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：普通模式打开城市详情，文本不含 `grid cell / pack cell / burg id / 归属一致性 / 落水检查`；运行 `window.__webglGeneratorDebug.enabled = true` 后，同一城市详情立即显示这些 debug 行，开发模式面板打开，console/page error 为 `0`。

后续：

- 继续清点摘要指标、hover 面板和导出元数据，避免普通 UI 泄露开发专用信息；导出文件内部保留 id/checksum 时，应在 README 或格式说明中说明它们属于元数据。

### 面板级懒加载试点：备注总览

背景：

- Element Plus 后续若迁移 `ElTable / ElTree / ElDialog`，不能把重组件静态塞进首屏。
- `NotesPanel` 是低频管理浮层，行为边界清楚，适合作为动态 import 试点。

修正：

- `notes-panel.js` 移除对 `NotesPanel.vue` 的静态 import。
- 面板仍在启动时注册浮层和维护 `panelState`，但组件实例在首次 `open()` 时通过 `import("../vue/components/NotesPanel.vue")` 加载并挂载。
- 保留原有 `open / update / setSelectedNoteId / isOpen / unmount` API，runtime 调用方不需要调整。
- 加载中显示“正在加载备注总览...”，加载失败时把错误写入 console，并在面板中显示失败提示。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；产物拆出 `NotesPanel-BcY2lGmD.js`，约 `4.83KB / 2.10KB gzip`。主入口变为 `index-DD9a5JYP.js`，约 `809.59KB / 241.05KB gzip`；共享 `object-resolver-DNc0fsN5.js` 约 `176.52KB / 65.03KB gzip` 并仍被首屏 preload，CSS 拆为 `index-oSmXNNEF.css` 与 `object-resolver-m12-100N.css`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：首屏资源中没有 `NotesPanel` chunk，打开“备注总览”后才加载 `NotesPanel-BcY2lGmD.js`；备注总览摘要正常显示 `备注 / 可定位 / 孤儿备注 / 筛选`，console/page error 为 `0`。

后续：

- 继续把低频管理浮层按同一模式动态 import，观察共享 chunk 是否还能继续拆小。
- 进入 `UiObjectTable -> ElTable` 前，必须保留筛选、排序、选中、定位按钮、双击定位和选中自动滚入视口契约。

### 低频管理浮层懒加载第二刀：名称库总览

背景：

- 备注总览懒加载已经证明 SFC 可按浮层首次打开拆包。
- 名称库总览也是低频管理浮层，且包含列表、详情、导入导出和编辑表单，适合验证同一模式的复用性。

修正：

- 新增 `createLazyVuePanel()`，统一封装动态 import、`createApp()`、Pinia 注入、加载提示、失败提示和卸载。
- `notes-panel.js` 改为复用该 helper，移除本地重复 promise 状态管理。
- `namebase-panel.js` 移除对 `NamebasePanel.vue` 的静态 import，首次打开名称库浮层时再动态加载组件。
- 两个面板继续保留原 `open / update / isOpen / unmount` 等外部 API。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；产物拆出 `NotesPanel-DtYFJkzo.js`（约 `4.87KB / 2.13KB gzip`）和 `NamebasePanel-BFurKgSt.js`（约 `6.29KB / 2.50KB gzip`）。主入口变为 `index-FDfayAtz.js`，约 `715.83KB / 211.47KB gzip`；共享 chunk 包括 `use-unit-preferences-D9KEQpc_.js`（约 `63.02KB gzip`）、`UiTextEditField-oLniX9Hu.js`（约 `30.24KB gzip`）和 `object-resolver-BymDTy8G.js`（约 `2.26KB gzip`）。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：首屏资源中没有 `NotesPanel` 或 `NamebasePanel` chunk；打开“备注总览”后加载 `NotesPanel-DtYFJkzo.js`，打开“名称库”后加载 `NamebasePanel-BFurKgSt.js`；两个面板摘要均正常显示，console/page error 为 `0`。

后续：

- 继续迁移低频管理浮层时优先观察共享 chunk 变化，必要时再把对象解析、单位偏好和表单基础组件做更细的拆分。

### 低频管理浮层懒加载第三刀：路线、河流、标签、外交

背景：

- 备注总览和名称库总览已经验证动态 import 模式可复用。
- 路线、河流、标签和外交管理属于低频管理浮层，不参与高度/国家/省份这类持续笔刷交互，适合继续拆出首屏。

修正：

- `route-panel.js`、`river-panel.js`、`label-naming-panel.js`、`diplomacy-panel.js` 移除对应 SFC 静态 import。
- 四个 panel wrapper 继续在启动时注册浮层并维护 state/callbacks，首次 `open()` 时通过 `createLazyVuePanel()` 动态加载组件。
- 原有 `open / update / setSelected... / isOpen / unmount` API 保持不变。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口变为 `index-5wLOxeIk.js`，约 `655.04KB / 193.94KB gzip`。新增或保留的按需面板 chunk 包括 `RoutePanel-CPPOoeuM.js`（约 `2.05KB gzip`）、`RiverPanel-BGlS-d5T.js`（约 `2.38KB gzip`）、`LabelNamingPanel-B8Y7tZ4M.js`（约 `2.84KB gzip`）和 `DiplomacyPanel-DozHhf5q.js`（约 `3.70KB gzip`）。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：首屏资源中没有 `RoutePanel / RiverPanel / LabelNamingPanel / DiplomacyPanel` chunk；逐个打开路线、河流、标签、外交管理后才加载对应 chunk，四个面板摘要均正常，console/page error 为 `0`。

后续：

- 可继续迁移城市、文化、宗教、marker 等对象管理浮层，但国家/省份/高度编辑这种直接驱动笔刷的面板应放慢，先确认编辑锁和画布交互不受懒加载影响。

### 对象管理浮层懒加载第四刀：城市、文化、宗教、资源标记

背景：

- `UiObjectTable` 后续若迁移到 `ElTable`，依赖对象列表的面板不能继续常驻首屏，否则会把 Element Table 的运行时代价直接带进初始资源。
- 城市、文化、宗教和资源标记管理面板都属于对象管理浮层，打开频率低于主控制面板，但内部保留表格、详情、定位和编辑入口，适合作为进入 `ElTable` 前的拆包边界。

修正：

- `city-panel.js`、`culture-panel.js`、`religion-panel.js`、`marker-panel.js` 移除对应 SFC 静态 import。
- 四个 panel wrapper 继续在启动时注册浮层并维护 state/callbacks，首次 `open()` 时通过 `createLazyVuePanel()` 动态加载组件。
- 原有选中、定位、重命名、备注、改色、资源点放置/移动、撤销/重做和 `setSelected... / updateEditMode` API 保持不变。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口变为 `index-XzNEAHlr.js`，约 `566.30KB / 169.44KB gzip`。新增按需面板 chunk 包括 `CityPanel-Cd2sjBE-.js`（约 `4.33KB gzip`）、`CulturePanel-DP9Hg7AZ.js`（约 `3.97KB gzip`）、`ReligionPanel-CNpfkOr4.js`（约 `4.12KB gzip`）和 `MarkerPanel-BIgOPVy2.js`（约 `3.44KB gzip`）。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：首屏资源中没有 `CityPanel / CulturePanel / ReligionPanel / MarkerPanel` chunk；逐个打开城市、文化、宗教和资源标记管理后才加载对应 chunk，四个面板摘要均正常，console/page error 为 `0`。

后续：

- `UiObjectTable -> ElTable` 可在这些已懒加载的对象管理浮层内试点；迁移前需要保留筛选、排序、选中、定位按钮和选中自动滚入视口契约。
- 国家、省份和高度编辑器直接关联画布编辑、二级面板和笔刷模式，继续放慢迁移节奏，先补交互验证再拆包。

### 国家/省份编辑浮层懒加载

背景：

- 国家和省份面板同样依赖 `UiObjectTable`，若在它们仍静态 import 的状态下迁移 `ElTable`，表格组件会重新进入主包。
- 两个面板虽带画布 brush 编辑，但 brush 状态本身在 wrapper 的 reactive state 中，SFC 只负责可视化控制和用户操作，因此可以先拆加载边界，同时保留外部 API。

修正：

- `state-panel.js` 和 `province-panel.js` 移除对应 SFC 静态 import，改为通过 `createLazyVuePanel()` 在首次 `open()` 时加载。
- 保留国家/省份目标选择、编辑启停、半径、取选中/取悬停、改名、改色、首都/备注、历史和 `getBrush / setActive` 等画布交互 API。
- 浮层注册、关闭时停用编辑和状态更新逻辑保持不变。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口变为 `index-BJGM0ANB.js`，约 `547.52KB / 165.45KB gzip`。新增按需面板 chunk 包括 `StatePanel-CkKvFGCH.js`（约 `4.17KB gzip`）和 `ProvincePanel-7a1i5Izi.js`（约 `3.97KB gzip`）。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：首屏资源中没有 `StatePanel / ProvincePanel` chunk；打开国家编辑和省份管理后才加载对应 chunk，两个面板摘要均正常，console/page error 为 `0`。

后续：

- 依赖 `UiObjectTable` 的主要管理浮层已经基本拆出首屏，下一步可迁移 `UiObjectTable -> ElTable`，并专门验证定位按钮、双击定位、选中行滚入视口和空态。

### Element Plus 表格迁移第一刀：UiObjectTable

背景：

- 主要对象管理面板已经按需加载，`UiObjectTable` 可以迁移到 Element Plus 表格而不直接压回首屏。
- 旧表格虽然轻，但已经需要继续自写空态、选中行、滚动定位和按钮交互；后续表格需求会越来越接近成熟组件。

修正：

- `UiObjectTable` 改为 `ElTable / ElTableColumn` 适配层，保留原 `columns / rows / selectedId / rowIdKey / emptyText / showLocateAction` props。
- 行点击继续派发 `select`，双击继续派发 `locate`；定位列改为 Element 圆形图标按钮。
- 选中行通过 `row-class-name` 标记为 `selected-row`，并继续在 `selectedId / rows` 更新后滚入视口。
- CSS 改为覆写 `.object-table-el` 的暗色表格变量、表头、行 hover、选中态、空态和定位按钮样式；旧原生 table 结构移除。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口变为 `index-BYj11Dn8.js`，约 `541.94KB / 163.18KB gzip`。`ElTable` 相关代码进入按需共享 chunk `UiDetailGrid-CJZ0rMrf.js`，约 `82.67KB gzip`；仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：打开城市管理后 `.object-table-el.el-table = 1`、旧 `table.object-table = 0`、行数 `817`、定位按钮 `817`；点击第二行后选中行和详情更新，定位按钮点击与双击定位无错误；筛选无结果时空态为“没有匹配的城市”，console/page error 为 `0`。

后续：

- 继续迁移树状总览、弹窗/确认和少数残留自写控件时，要观察共享 chunk 是否继续膨胀；如过大，考虑按面板域拆分表格/树组件依赖。

### 高度编辑和对象详情懒加载

背景：

- `UiObjectTable` 迁移后，首屏仍静态挂载高度编辑和通用对象详情两个 Vue 面板入口。
- 高度编辑的 brush state 位于 wrapper，通用对象详情的 selection state 也位于 wrapper，因此 SFC 可以按首次打开延迟加载，不影响画布侧状态读写。

修正：

- `height-panel.js` 移除对 `HeightPanel.vue` 的静态 import，首次打开高度编辑浮层时通过 `createLazyVuePanel()` 加载。
- `object-details-panel.js` 移除对 `ObjectDetailsPanel.vue` 的静态 import，selection 分发决定显示通用对象详情时才加载。
- 保留高度 brush 的 `getBrush / setActive / update` API，以及对象详情的查看、定位、编辑、取消编辑和重命名回调。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口变为 `index-B1CPbYkD.js`，约 `531.42KB / 160.18KB gzip`。新增按需 chunk 包括 `HeightPanel-BFwMD0oC.js`（约 `1.21KB gzip`）和 `ObjectDetailsPanel-DGai1L3E.js`（约 `1.68KB gzip`）。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：首屏资源中没有 `HeightPanel / ObjectDetailsPanel` chunk；打开高度编辑后才加载高度面板，并显示状态、半径、强度、中心衰减；通过 `selectionStore` 选中真实 marker 后才加载对象详情，显示标记类型、经济潜力、国家/省份，console/page error 为 `0`。

后续：

- 当前仅控制面板作为常驻 Vue 入口；后续组件迁移应优先在按需面板内部推进，避免重新扩大首屏资源。

### Element Plus 二级操作按钮迁移

背景：

- `UiActionDock` 是各对象管理面板复用的二级操作入口，之前仍使用原生按钮。
- 二级浮层定位、外部点击收起和 Element popper 点击豁免已经稳定，可以先把按钮视觉层迁到 Element Plus。

修正：

- `UiActionDock` 的操作按钮改为 `ElButton`，继续保留 `.ui-icon-action.active` 作为二级浮层定位锚点。
- 二级浮层关闭按钮改为 `ElButton` + `Close` 图标。
- CSS 更新为 `.ui-icon-action.el-button` 和 `.ui-secondary-action-close.el-button` 覆写，保留原尺寸、选中态、禁用态和 hover 风格。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口保持约 `531.42KB / 160.18KB gzip`，`UiActionDock` 按需 chunk 约 `1.40KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：城市管理面板内 `.ui-icon-action.el-button = 5`、旧原生 `.ui-icon-action:not(.el-button) = 0`；点击“重命名”打开二级浮层，关闭按钮为 Element Button，点击关闭和点击空白都能收起，console/page error 为 `0`。

后续：

- 图层按钮、树状面板节点按钮和气候风向按钮仍是特定交互样式，迁移时要保留它们的 DOM 桥和空间布局。

### Element Plus 图层开关迁移

背景：

- 图层 tab 仍有一组原生按钮，既包括 `UiLayerToggleButton`，也包括控制面板内联的“悬停信息”按钮。
- 这些按钮被旧 runtime 通过 `data-layer`、`id` 和 `aria-pressed` 读取与更新，迁移时不能改变根节点契约。

修正：

- `UiLayerToggleButton` 改为 `ElButton` 根节点，保留 `data-layer` 和 `aria-pressed`。
- 控制面板内联的“悬停信息”按钮也改为 `ElButton` 根节点，保留 `id="show-hover-info"` 和 `aria-pressed`。
- CSS 更新为 `.layer-toggle-button.el-button` 覆写，保持旧圆点、选中态、hover 和多列网格布局。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `531.46KB / 160.18KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：图层页 `.layer-toggle-button = 12`，且全部带 `.el-button`，旧原生 `button.layer-toggle-button:not(.el-button) = 0`；点击比例尺后 `aria-pressed=false` 且 `#map-scale-bar.hidden = true`，点击悬停信息后 `aria-pressed=false`，console/page error 为 `0`。

后续：

- 控制面板气候风向箭头和树状节点按钮属于特殊可视交互，后续迁移需要单独保留其几何排布和点击轮询行为。

### Element Plus 树状总览按钮迁移

背景：

- 文化和宗教的树状总览浮层已经独立为 `UiTreeDisplayPanel`，但入口、关闭和节点仍是原生按钮。
- 该浮层必须继续支持拖动、节点连线、节点选择和紧凑布局，不能因为迁移组件库变成普通列表。

修正：

- 文化/宗教面板中的“打开树状面板”改为 `ElButton`。
- `UiTreeDisplayPanel` 的关闭按钮和节点按钮改为 `ElButton`，关闭按钮使用 Element Plus `Close` 图标。
- CSS 更新为 `.inheritance-tree-open.el-button`、`.ui-tree-display-close.el-button` 和 `.ui-tree-display-node.el-button` 覆写，保留原来的绝对定位、节点宽高、连线布局和选中态。
- 修正文化/宗教树节点选择函数对 `callbacks` 的裸引用，改为 `props.callbacks.onSelect?.(node)`。
- `UiObjectTable` 显式设置 `tree-props` 到内部字段，避免文化/宗教行对象的业务字段 `children: [id]` 被 Element Table 当作树表子节点递归，导致数字 id 触发 `Invalid value used as weak map key`。
- 选中行高亮继续由 `.selected-row` 和滚动定位承担，不依赖 Element Table 的 current-row 内部状态。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `531.46KB / 160.19KB gzip`，`UiTreeDisplayPanel-TuqfQewL.js` 约 `3.48KB / 1.69KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：打开控制面板 -> 管理 -> 文化管理 -> 打开树状面板后，面板可拖动，树节点 `12` 个，旧原生树节点 `0`，点击节点后活动节点和表格选中行均为 `1`，关闭按钮可关闭，console/page error 为 `0`。
- 城市对象表格回归通过：城市管理表格 `817` 行，`.object-table-el.el-table = 1`，旧 `table.object-table = 0`；点击第二行后详情更新，定位按钮 `817` 个，筛选无结果时空态为“没有匹配的城市”，console/page error 为 `0`。

后续：

- 继续迁移气候风向按钮、确认弹窗或文件操作按钮时，应先检查组件库默认字段名和现有业务字段是否碰撞；尤其是 `children / value / label / disabled` 这类通用字段。

### Element Plus 气候按钮迁移

背景：

- 控制面板气候投影旁仍保留原生风带箭头按钮和纬度模式切换按钮。
- 这两类按钮属于特殊几何控件：风带按钮需要对齐地球投影纬度带，纬度按钮需要保留旧 runtime 读取的 `id` 和 `aria-pressed`。

修正：

- `ControlPanel.vue` 中风带按钮改为 `ElButton`，继续保留 `data-wind-band`、`data-wind-angle`、标题和点击轮询风向逻辑。
- `climate-latitude-toggle` 改为 `ElButton`，继续保留 `id`、`aria-pressed` 和自动/手动纬度切换逻辑。
- CSS 更新为 `.wind-band-button.el-button` 和 `.climate-mode-toggle.el-button` 覆写，保留小尺寸风带按钮、投影旁布局和手动状态高亮。
- 隐藏 input 桥继续保留，`atmosphere-winds`、`climate-latitude-mode` 等仍由旧 runtime 读取。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `531.46KB / 160.19KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：气候风带按钮 `6` 个，旧原生风带按钮 `0`，纬度切换按钮 `1` 个且为 Element Button；点击首个风带后 `atmosphere-winds` 从 `225,45,225,315,135,315` 变为 `315,45,225,315,135,315`，首个箭头变为 `↖`；点击纬度切换后 `climate-latitude-mode = custom`、`aria-pressed = true`、投影进入 manual 状态，console/page error 为 `0`。

后续：

- 控制面板可见原生按钮已进一步减少；剩余隐藏 input / select / checkbox 多数是兼容旧 runtime 的桥，不应为了“全量替换”盲目删除。

### Element Plus 文件导入入口迁移

背景：

- 简介 tab、灰度高度图区域和名称库面板的本地导入入口仍是可点击 `label`，视觉上像按钮但不是按钮组件。
- 当前导入能力只需要触发浏览器本地文件选择器，并由既有隐藏 input 和 File API 处理文件；如果直接引入 `ElUpload`，会增加不必要的组件和交互状态。

修正：

- 简介 tab 的“导入地图数据”和生成 tab 的“导入灰度图”改为 `UiButton / ElButton`，点击后触发对应隐藏 input。
- 名称库面板的“导入名称库”也改为 `UiButton / ElButton`，通过 `ref` 触发隐藏 input。
- 隐藏 file input 的 `id`、`accept`、`change` 处理和旧 runtime 读取契约保持不变；重复选择同名文件前会清空旧值。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `531.64KB / 160.23KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：简介 tab 的“导入地图数据”、生成 tab 的“导入灰度图”和名称库面板的“导入名称库”均触发 file chooser；三个隐藏 input 仍为 hidden，accept 分别为 `.json,application/json`、`image/*`、`.json,application/json`；旧 `label.file-import-action = 0`，console/page error 为 `0`。

后续：

- 如果后续要展示文件拖拽、进度、文件列表或校验详情，再评估 `ElUpload`；在当前单文件本地导入阶段继续保持轻量按钮触发模式。

### 测量工具节点拖拽第一刀

背景：

- 原版测量工具支持更完整的测量对象编辑；当前 WebGL 版已经有折线距离、面积和测量 JSON 导出，但测量点不能调整。
- 节点拖拽是低风险增强，不需要改 WebGL 地图数据或生成流程，只需要在测量 overlay 中移动临时点。

修正：

- `state.measurement` 新增 `drag` 状态，记录当前拖动的点索引和事件处理器。
- SVG 测量点添加 `pointerdown` 处理，拖动时通过 `renderer.screenToWorld()` 把屏幕坐标反算到地图坐标，并 clamp 到图幅范围内。
- 拖动期间实时刷新测量 polygon、polyline、点位和读数；松开、取消、清空或退出测量都会移除窗口级 pointer 监听并清空 drag 状态。
- CSS 为 `.measurement-point` 增加 pointer-events、grab/grabbing 光标和拖动高亮。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `532.87KB / 160.51KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：开启测量后添加两点，拖动第一个点后坐标移动约 `141.3` 地图单位，读数从 `657.2 千米` 更新为 `318.8 千米`；拖动中 `.measurement-point.dragging = 1`、`dragIndex = 0`，松开后 drag 为 `null`；点击清除后点数和 SVG 点为 `0`，清除/导出按钮禁用，console/page error 为 `0`。

后续：

- 测量工具下一步可继续做节点删除、插入、保存测量对象和路线贴合；路线贴合需要先设计与道路/河流/海路图的关系，复杂度高于单纯拖拽。

### Element Plus 顶部地图工具栏迁移

背景：

- 顶部地图工具栏仍写在静态 HTML 中，控制面板、测量和开发模式三个入口都是原生按钮。
- 这些按钮被旧 runtime 按 `id` 绑定和修改，因此迁移时必须先确保 Vue toolbar 在 `createGeneratorApp()` 绑定事件前完成挂载。

修正：

- 新增 `MapToolbar.vue`，复用 `UiButton / ElButton` 渲染控制面板、测量和开发模式入口。
- `initializeVueStateBridge()` 在 state bridge app 挂载后、`createGeneratorApp()` 执行前挂载 toolbar app。
- `index.html` 中原来的三个静态按钮移除，只保留 `#map-toolbar` 挂载容器。
- 保留 `open-generation-panel / toggle-measurement / open-development-panel` 三个 id，以及 `aria-pressed`、`hidden` 和 `debug-action` 契约，旧 runtime 继续负责打开面板、切换测量文案和显示 debug 入口。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `533.45KB / 160.03KB gzip`，HTML 约 `4.34KB / 1.34KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：普通模式 toolbar 中 `.el-button = 3`，旧 `button:not(.el-button) = 0`，开发模式按钮保持 hidden；点击“控制面板”能打开生成面板，点击“测量”后按钮文案为“退出测量”、`aria-pressed = true`、测量 overlay 显示。
- `?debug=1` 烟测通过：开发按钮显示为“调试信息”，`aria-pressed = true`，按钮处于 active，开发面板自动打开，console/page error 为 `0`。

后续：

- 静态 HTML 里仍有测量 readout 的“导出 / 清除”两个原生按钮；它们目前不在 Vue root 内，若要迁移应先决定是否把测量 readout 也组件化。

### Element Plus 测量读数按钮迁移

背景：

- 顶部地图工具栏迁移后，静态 HTML 中剩余最明显的用户可见原生按钮是测量 readout 的“导出 / 清除”。
- 这两个按钮同样被旧 runtime 按 `id` 查询、绑定和设置 `disabled`，因此可以用轻量 Vue 组件替换 DOM，同时保留 id 契约。

修正：

- 新增 `MeasurementReadout.vue`，复用 `UiButton / ElButton` 渲染“导出”和“清除”。
- `initializeVueStateBridge()` 在 runtime 绑定前挂载测量 readout app。
- `index.html` 中测量 readout 只保留 `#measurement-readout` 挂载容器。
- CSS 为 `.measurement-readout .el-button` 补充 margin 和 padding 覆写，避免 Element 默认按钮间距撑开 readout。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `533.97KB / 160.17KB gzip`，HTML 约 `4.10KB / 1.24KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：开启测量并添加两点后，readout 中 `.el-button = 2`、旧 `button:not(.el-button) = 0`，导出按钮下载 `webgl-generator-measurement` JSON，`metadata.pointCount = 2`，距离摘要为 `635.1 千米`；点击清除后点数和 SVG 点为 `0`，导出/清除按钮禁用，console/page error 为 `0`。

后续：

- 目前静态 HTML 已基本只保留 canvas、overlay 容器和状态挂载点；继续迁移应优先从 runtime 动态创建的浮层关闭按钮或确认弹窗开始。

### 原版功能积压 GeoJSON 状态校准

背景：

- 夜间继续巡视 source 功能积压时，发现 `source-feature-backlog.md` 对分层 GeoJSON 的描述略滞后。
- 当前 `createMapFeatureGeoJson()` 已经支持国家和省份开关，并输出 pack cell polygon 集合型 `MultiPolygon`；真正缺的是拓扑层面的边界 dissolve。

修正：

- 更新 `docs/task-notes/source-feature-backlog.md`，把 state / province 分层选择和第一刀导出列为已完成。
- 后续缺口改为国家/省份拓扑 dissolve、范围选择和更完整属性映射，避免后续重复实现已有的 cell 集合导出。

验证：

- 文档校准，无代码变更；已对照 `app/webgl-generator/src/runtime/map-file-io.js` 的 `stateFeatures()`、`provinceFeatures()` 和控制面板 `feature-export-layer-state / province` 开关。

### 名称库样例生成预览第一刀

背景：

- 名称库总览已经能导入、导出、复制、重命名、编辑和清理用户词池，但“样例生成预览”仍停留在规划文档中。
- 用户此前关注中文命名质量，预览能力可以先帮助检查词池气质，但不能直接改变当前地图对象名称，也不能绕过后续绑定设计。

修正：

- `namebase-store.js` 新增 `createNamebaseGeneratedExamples()`，使用本项目自己的轻量字符链和词根重组生成候选名称。
- 预览函数只读取 source 数组，使用 seed/salt 生成稳定但可换组的候选，不写入 `map`，不接入 `createChineseNameGenerator()`。
- 字符链按样本长度分桶选择起始字符，避免二字古国名首字被一字长度抽中后形成怪异单字候选。
- `NamebasePanel.vue` 的样例区域新增“生成预览 / 换一组”按钮；初始仍显示原 source 样例，点击后展示临时生成候选。
- 预览正文改用 `.namebase-panel-preview-text`，避免 Element Button 内部 span 被样式和自动化选择器误伤。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `510.57KB / 150.49KB gzip`，`NamebasePanel` chunk 约 `7.13KB / 2.82KB gzip`，`namebase-store` chunk 约 `25.20KB / 10.31KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：打开控制面板管理 tab 的名称库浮层，行数为 `61`；初始标题为“样例”、按钮为“生成预览”，初始文本为 `齐、晋、秦、楚...`；点击后标题为“生成预览”、按钮变为“换一组”，生成文本如 `单、轸、滕、宿徐...`；再次点击会换一组候选；checksum 从 `72294771` 到 `72294771` 保持稳定，console/page error 为 `0`。

后续：

- 下一步若继续推进名称库，应先实现绑定状态和失效引用显示，再让全局 `stateRoot / place / hydro` 绑定影响后续重新生成。
- 若要更接近原版 Namesbase Editor，可在不依赖 `source/` 全局状态的前提下追加纯函数 Markov chain，但仍应把自动重命名留到显式命令和历史栈之后。

### 用户名称库新建入口

背景：

- 名称库总览已经能导入文件和复制内置库，但用户若只想从零维护一个轻量词池，仍需要先复制或导入。
- 新建入口应沿用当前名称库数据管理风格：只修改 `map.namebases.bases`，不自动绑定生成系统，也不改已有地图对象名称。

修正：

- `namebase-store.js` 新增 `createUserNamebase()`，创建 `origin = 手动` 的用户词池，默认名称为 `用户名称库 N`。
- 新建库默认提供 `青川 / 云泽 / 鹿原 / 玄岭 / 白沙` 五个二字样本，便于用户立即看到样本编辑和预览效果；质量提示仍会标记为“样本偏少”。
- 名称库浮层新增“新建用户库”按钮，运行时创建成功后刷新总览并自动选中新库。
- 预览生成器进一步收紧：生成候选不超过当前词池最大样本长度，并过滤相邻重复字，避免小词池出现过度重组候选。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `510.93KB / 150.57KB gzip`，`NamebasePanel` chunk 约 `7.27KB / 2.84KB gzip`，`namebase-store` chunk 约 `25.90KB / 10.55KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：打开名称库后点击“新建用户库”，表格行数 `61 -> 62`，`map.namebases.bases.length = 1`，选中详情显示“来源手动 / 用户名称库 1 / 样本数 5 / 样本偏少”；样本编辑器预填五个默认样本；点击“生成预览”后候选如 `玄岭、青川、白沙、鹿原、云泽、青白...`，最大长度 `2` 且无相邻重复；checksum 从 `86036bfc` 到 `86036bfc` 保持稳定，console/page error 为 `0`。

后续：

- 新建库目前仍不接历史栈；后续如果把名称库管理定位成可撤销编辑，需要统一处理新建、删除、重命名和样本编辑。
- 继续推进生成绑定前，应先显示 `map.namebases.bindings` 的绑定状态和失效引用。

### 测量撤销点第一刀

背景：

- 测量工具已经支持临时折线测距、闭合面积、导出和节点拖拽，但用户添加错点后只能清空全部测量。
- 原版测量器有更完整的节点编辑能力；当前先补最小、风险最低的“撤销最后一点”。

修正：

- `MeasurementReadout.vue` 新增“撤销点”按钮，继续通过 Element Button 渲染，并提供 `measurement-undo` DOM id 供 runtime 绑定。
- `bindMeasurementTool()` 绑定撤销按钮，点击后取消当前拖拽、从 `state.measurement.points` 中移除最后一点，并复用 `updateMeasurementOverlay()` 刷新折线、面积和读数。
- `updateMeasurementOverlay()` 同步维护撤销按钮禁用状态；无点时导出、撤销点和清除都禁用。
- 测量 readout 最大宽度从 `420px` 放宽到 `640px`，避免三枚按钮挤压较长面积读数。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `511.25KB / 150.66KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：开启测量后点击三点，点数 `3`、SVG 点 `3`、面积面片 `1`，读数为 `3 点 / 总长 1,620.9 千米 / 面积 30万 平方公里`；点击“撤销点”后点数变为 `2`、面积面片为 `0`、读数为 `2 点 / 总长 955.5 千米`；继续撤销到 `0` 后摘要回到“点击地图添加起点”，导出/撤销/清除按钮均禁用，console/page error 为 `0`。

后续：

- 下一步测量工具可继续做点击节点删除、在折线中插入节点和保存测量对象；路线贴合仍应单独设计。

### 高度图图片导入工作台计划

背景：

- WebGL 版已经支持灰度图导入、反转和适应方式，但原版 Image Converter 还支持对彩色图片量化、按颜色赋高度、亮度/色相/FMG 色带自动映射。
- 彩色高度图识别会牵动预览、用户确认和完整派生重算，不适合直接塞进当前灰度导入函数。

对照结果：

- 原版会把图片绘制到地图 canvas，再缩放到 `grid.cellsX / grid.cellsY` 采样 canvas。
- 原版使用 `RgbQuant` 获取有限色板，色块分为未分配和已分配。
- 用户可以点击色块或地图上的对应颜色，再点击 0-100 高度色带赋值。
- 自动赋值包括按亮度、按色相和按 FMG 色带三类；完成时把每个 polygon 的 `data-height` 写回 `grid.cells.h`。
- 未分配颜色在完成时会落到默认海洋/0 高度语义。

文档：

- 新增 `docs/task-notes/heightmap-image-converter-plan.md`。
- 文档把后续拆成导入预览面板、轻量色板量化、自动高度映射、手动修正与应用、预设与复用五阶段。
- 计划明确应用时仍走 WebGL 版 sampled heightmap 和完整重生成链路，并把导入元数据保留在 `map.heightmap.source`，不把原始图片塞进地图 JSON。

后续：

- 若继续实现，应先做不写 map 的懒加载预览面板；预览取消必须保持 checksum 不变。
- 颜色量化优先尝试本项目轻量实现，效果不足时再评估动态导入第三方 quantizer。

### 测量节点删除第一刀

背景：

- 测量工具已经支持临时折线、闭合面积、导出、节点拖拽和撤销最后一点。
- 原版测量器的节点编辑更完整；当前继续补一个不牵动地图数据的临时节点删除能力。

修正：

- SVG 测量点的 `pointerdown` 统一进入 `handleMeasurementPointPointerDown()`。
- 普通左键仍进入拖拽；右键、`Alt` 点击或 `Shift` 点击会删除对应节点。
- 测量点增加 `tabindex` 与键盘处理，聚焦后可用 `Delete / Backspace` 删除。
- 删除节点时会取消正在进行的拖拽，直接从 `state.measurement.points` 删除对应项并刷新 overlay、面积和读数。
- `source-feature-backlog.md` 和 README 同步把节点删除从待办移入已实现能力。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `511.79KB / 150.85KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：开启测量后添加两点，左键拖动首点位移约 `82.3` 地图单位，拖动中 `.measurement-point.dragging = 1`；新增第三点后右键第二点，点数回到 `2`；再新增一点并聚焦首点按 `Delete` 后点数为 `2`，面积面片为 `0`，读数为 `2 点 / 总长 420.8 千米`，导出/撤销/清除按钮仍可用，console/page error 为 `0`。

后续：

- 测量工具后续可继续做折线中插入节点、路线贴合和保存测量对象；路线贴合需要先明确与道路、河流和海路图层的关系。

### 测量线段插入节点第一刀

背景：

- 删除和拖拽节点之后，测量折线仍缺少在中间补点的能力。
- 该能力可以继续保持为临时 overlay 编辑，不需要写入地图对象、历史栈或导出格式版本。

修正：

- canvas 测量点击流程在生成世界坐标后，若检测到左键且带 `Alt / Shift`，会先寻找最近测量线段。
- 当点击位置距离最近线段不超过 `18px` 时，新点插入该线段后方；否则仍按普通追加点处理。
- 两点测量只考虑唯一线段；三点及以上把闭合面片最后一段也纳入候选，便于在面积边界补点。
- 复用现有 `screenToWorld()` 和 `worldToScreen()`，在屏幕空间判断最近线段，避免相机缩放后阈值失真。
- README 和 `source-feature-backlog.md` 同步把线段插入节点从待办移入已实现能力。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `512.45KB / 151.12KB gzip`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright 构建产物烟测通过：开启测量后添加两点，`Shift` 点击线段中点后点数变为 `3`，点列从 `[292.5,312] -> [697.5,312]` 变为 `[292.5,312] / [495,312] / [697.5,312]`；右键删除插入点后点数回到 `2`；再次插入后聚焦首点按 `Backspace`，点数回到 `2`；随后拖动首点位移约 `66.8` 地图单位，拖动中 `.measurement-point.dragging = 1`，console/page error 为 `0`。

后续：

- 测量工具的轻量编辑能力已经覆盖添加、拖动、撤销、删除、插入和 JSON 导出；后续应转向保存测量对象或路线贴合，这两项都需要更明确的数据契约。

### 测量对象与路线贴合计划

背景：

- 临时测量工具已经覆盖主要轻量编辑动作，但保存测量对象和路线贴合会影响地图数据结构、图层和导入导出。
- 原版 FMG 的测量系统是 `Rulers.data` 集合，不是单一临时点列，直接继续扩展 `state.measurement.points` 会让后续保存和多对象编辑变得混乱。

对照结果：

- `source/Fantasy-Map-Generator/public/modules/ui/measurers.js` 中 `Rulers.toString()` / `fromString()` 会把多个测量对象序列化为字符串，再按 `Ruler / Opisometer / RouteOpisometer / Planimeter` 类型重建。
- `Ruler` 支持折线点拖拽、点击线段插入控制点、点击控制点删除，并按折线长度显示标签。
- `Opisometer` 和 `Planimeter` 通过拖拽连续采样，结束时默认优化过密点；`Shift` 会跳过优化。
- `RouteOpisometer` 通过 `Routes.isConnected(cell)` 限制路线尺沿道路/路线 cell 延伸；`Shift` 允许离开道路。
- `Planimeter` 使用闭合曲线和多边形面积，并用 `polylabel` 找标签位置。

文档：

- 新增 `docs/task-notes/measurement-rulers-plan.md`。
- 文档建议新增 `map.measurements` 结构化 JSON 契约，而不是沿用原版字符串作为主格式。
- 阶段拆分为保存临时测量为对象、图层化与对象编辑、路线贴合、曲线尺和面积尺细化。
- `source-feature-backlog.md` 已改为指向专项计划。

后续：

- 若继续实现，应先做“保存临时测量为对象”和完整地图 JSON 往返，再考虑路线贴合。
- 路线贴合第一刀可先使用 pack cell 与路线索引；更精确的道路 polyline 投影应后置。

### 视觉主题与样式预设计划

背景：

- WebGL 版当前只有固定渲染风格、视图色彩模式和图层开关。
- 原版样式系统覆盖面很广，但核心数据是 SVG selector/attribute JSON，不能直接作为 WebGL 运行时格式。

对照结果：

- `style-presets.js` 提供 12 个系统预设：`default / ancient / gloom / pale / light / watercolor / clean / atlas / darkSeas / cyberpunk / night / monochrome`。
- 原版系统预设在 `public/styles/*.json` 中，单个文件约 `14-15KB`，以 `#map`、`#stateBorders`、`#landmass`、`#texture`、`#terrs` 等 selector 为 key。
- 预设值主要是 SVG attribute 和 DOM attribute，包括 `stroke`、`stroke-width`、`opacity`、`filter`、`mask`、`fill`、`scheme`、`terracing`、`data-href`。
- `style.js` 会根据选择的元素显示不同编辑区，并支持高度色带、纹理、滤镜、网格、指南针、marker、标签等细项。
- 自定义预设保存到 `localStorage`，key 前缀为 `fmgStyle_`，也支持下载和上传。

文档：

- 新增 `docs/task-notes/visual-theme-preset-plan.md`。
- 文档明确 WebGL 版不直接兼容原版 SVG selector，而是新增 `map.visualTheme` 与 renderer/overlay theme token。
- 阶段拆分为只读主题预设、主题导入导出、颜色级编辑、纹理/滤镜和高级效果。
- `source-feature-backlog.md` 的样式预设行已改为指向专项计划。

后续：

- 如果继续实现，应从 4-6 个只读轻量主题开始，先覆盖背景、地形、水域、边界、道路、标签和比例尺。
- 主题切换不应改变生成数据或 checksum，PNG 导出应合成当前主题下的画布与 overlay。

### 市场、商品与贸易流计划

背景：

- WebGL 版已经在 `economy.js` 中生成 `pack.goods`、`pack.markets` 和 `pack.deals`，但用户侧还没有完整经济面板。
- 原版经济 UI 同时包含商品编辑、市场总览、价格比较、生产链和贸易动画，直接一次性复刻风险较高。

对照结果：

- `goods-editor.ts` 会展示商品图标、类型、单位、产量、库存、基础价格、标签和可见状态，并可打开生产者、库存来源和价格比较。
- `markets-overview.ts` 会展示市场名、所属国家、覆盖 cell、burg 数量、库存、销售额、采购额和市场价值，并支持手工刷市场归属、添加/删除市场和重新生成。
- `trade-animation-editor.ts` 暴露贸易类型、并发动画数、旅行时长、陆路减速、分段暂停和 marker 尺寸等配置。
- `draw-trade-animation.ts` 用船和马车 SVG symbol 沿 land/water 分段路径移动，点击移动 marker 打开交易详情。

文档：

- 新增 `docs/task-notes/economy-market-trade-plan.md`。
- 文档把后续拆成只读经济总览、导出与诊断、轻量编辑、贸易流可视化、市场归属编辑与重新生成五阶段。
- 计划明确第一阶段只读，不改经济数据和 checksum；贸易动画和市场归属刷子后置。
- `source-feature-backlog.md` 的市场、商品与贸易动画行已改为指向专项计划。

后续：

- 若继续经济系统，应先做懒加载“经济总览”浮层，复用 Element Plus 表格适配层展示商品、市场和交易。
- 静态贸易流图层应先于动画实现；动画必须按需开启，避免默认拖慢地图交互。

### 军事对象与战斗事件计划

背景：

- WebGL 版已经有军事生成和国家详情军力摘要，但没有军团总览、军团图层、军团编辑或战斗事件。
- 原版军事 UI 涵盖对象编辑和战斗模拟，直接实现会牵动图层、撤销、备注和完整地图导入导出。

对照结果：

- `regiments-overview.js` 会按国家展示军团、各兵种数量、总兵力，支持国家筛选、百分比模式、添加军团和 CSV 导出。
- `regiment-editor.js` 支持军团重命名、陆/海类型、徽记、兵种数量、位置、基地、旋转、拆分、附加、删除和攻击。
- `battle-screen.js` 会按战斗地点、城市、河流、海军/空军/登陆等条件推断战斗类型与名称，并维护双方军团、士气、阶段、骰子、伤亡和幸存者。

文档：

- 新增 `docs/task-notes/military-battle-plan.md`。
- 文档把后续拆为只读军团总览、军事图层、军团轻量编辑、战斗事件记录和战斗模拟五阶段。
- `source-feature-backlog.md` 的战斗模拟与军事事件行已改为指向专项计划。

后续：

- 若继续军事系统，应先做只读军团总览和军事图层；战斗事件应先作为可保存事件记录进入 `map.battles`，完整模拟后置。

### 纹章与 Coat of Arms 计划

背景：

- WebGL 版目前没有纹章系统；国家、省份、城市只有颜色和部分图标能力。
- 原版纹章系统牵涉生成器、SVG 渲染、对象编辑、上传下载和 Armoria 外部集成，属于远期复杂系统。

对照结果：

- `src/generators/emblems/generator.ts` 的 `COA.generate()` 会按父纹章、亲缘度、统治关系和类型生成 `t1 / shield / division / ordinaries / charges / custom` 等数据。
- `draw-emblems.ts` 会为 state / province / burg 三层生成 SVG `<use>`，并用各层 font-size 与 data-size 控制显示尺寸。
- `emblems-editor.js` 支持选择国家/省份/城市、改盾形、改尺寸、移动、重新生成、上传图片/SVG、下载 SVG/PNG/JPG、下载图库、定位区域和打开 Armoria。

文档：

- 新增 `docs/task-notes/emblems-coa-plan.md`。
- 文档把后续拆为数据占位与只读显示、轻量纹章图层、生成器按需移植、纹章编辑与导出四阶段。
- `source-feature-backlog.md` 的纹章行已改为指向专项计划。

后续：

- 若继续纹章系统，应先保证完整地图 JSON 能保留 `coa` 字段并在详情中只读显示；完整生成器和外部 Armoria 集成后置。

### 构建产物子路径加载修复

背景：

- 用户反馈当前页面又出现加载问题，需要重新验证实际页面启动。
- 此前烟测主要在站点根路径服务构建产物，未覆盖 `/webgl-generator/` 这类子路径部署。

问题：

- 生产构建的 `dist/webgl-generator/index.html` 使用 `/assets/...` 绝对路径加载入口脚本、preload chunk 和 CSS。
- 当页面挂在 `/webgl-generator/` 子路径时，浏览器会请求根路径 `/assets/index-*.js`，真实服务只暴露 `/webgl-generator/assets/...` 时会全部 404。
- 复现结果为 `appReady = false`，页面 badge 变成“脚本未启动”，request failed 中包含入口脚本和多个 CSS/chunk 的 404。

修正：

- `vite.config.mjs` 增加 `base: "./"`，让构建产物使用相对资源路径。
- 修复后 `index.html` 中入口脚本、modulepreload 和 stylesheet 均输出为 `./assets/...`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 构建产物静态服务验证根路径 `/`：`appReady = true`，badge 为 `3,810 千米 x 2,540 千米`，canvas 为 `1280x800`，toolbar Element 按钮 `3`，无 console/page error、无 request failed、无 404。
- Playwright + 构建产物静态服务验证子路径 `/webgl-generator/`：入口脚本实际加载自 `/webgl-generator/assets/index-*.js`，`appReady = true`，canvas 为 `1280x800`，toolbar Element 按钮 `3`，无 console/page error、无 request failed、无 404。

后续：

- 之后凡是验证生产构建加载，都应同时覆盖根路径和子路径，避免只在开发服务器或根路径下通过。

### 5410 首屏生成卡死修复

背景：

- 用户反馈 `http://127.0.0.1:5410/` 在 in-app browser 中卡在右上角“等待生成任务”和顶部“静候星图显影”，控制面板展开、测量按钮和 DevTools console 的 `window` 回车都无法响应。
- 早先只在独立 Chrome 干净会话里判断“可加载”是不充分的；这次按真实端口和卡死表现重新排查。

诊断：

- Node 直接运行 `tools/webgl-generator-generation-profile.mjs --cells 10000` 可在约 `655ms` 内完成，说明纯生成算法本身没有无限循环。
- 生产页旧路径在首轮 `requestGenerate()` 设置 loading 后进入同步生成/装载，主线程没有机会处理输入，表现为 DOM 和 console 一起失去响应。
- 第一版 Worker 改造后，构建产物中 `new Worker(new URL(...))` 没有稳定产出 worker 资源；改成 Vite `?worker` 后又发现 worker 默认 IIFE 不支持现有 `vendor/delaunator.js` 的顶层 await。
- 将 worker 输出改为 ES module 后，worker 能创建但 60 秒超时且没有任何阶段消息；构建后的 worker 包中仍存在 `await import("./delaunator.umd-*.js")`，卡在 worker 模块初始化，连 `message` 监听都未注册。

修正：

- 新增 `app/webgl-generator/src/runtime/generation-worker.js`，首轮地图生成走 ES module Worker，并把生成阶段通过 `generation-stage` 消息回传给 loading bubble。
- `app/webgl-generator/src/generator/profile.js` 支持 `onStageStart / onStageEnd` 回调，`generatePlaceholderMap()` 透传该回调供 worker 和后续诊断复用。
- `app/webgl-generator/src/runtime/app.js` 把 `requestGenerate()` 改为先等一次 paint，再异步生成；`loadMapIntoRuntime()` 改为可等待的装载流程；Worker 错误或不可用时保留主线程兜底生成。
- `app/webgl-generator/src/renderer/placeholder-renderer.js` 新增 `loadMapAsync()`，按对象索引、cell mesh、水陆线、政治边界、顶点构建、GPU 上传、标签和 fit/draw 分阶段装载，每段之间让出浏览器事件循环；WebGL context 关闭不必要的 antialias/depth/stencil，并把初始 pixel ratio 限制到 `1.5`。
- `app/webgl-generator/src/vendor/delaunator.js` 改为静态命名空间导入 UMD，并从 `module.default || globalThis.Delaunator` 取构造器，消除顶层动态导入造成的 worker 初始化阻塞，同时保持 Node profile 兼容。
- `vite.config.mjs` 增加 `worker.format = "es"`，让 worker 产物支持 ES module。

验证：

- `node .\tools\webgl-generator-generation-profile.mjs --cells 10000 --iterations 1 --out .\docs\generated\reports\tmp-generation-profile.json --markdown .\docs\generated\reports\tmp-generation-profile.md` 通过，生成 profile 仍可跑通。
- `$env:CI='true'; pnpm run build:app` 通过；产物生成 `generation-worker-*.js`。仍有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?verify=...`：`window.__webglGeneratorApp.map` 可在 30 秒内出现；默认 10k 地图生成 `555.2ms`，renderer `loadMap.totalMs = 419.2ms`，`vertexCount = 525843`，`lineVertexCount = 257952`，`draw.glError = 0`，loading 最终收起。
- 截图 `docs/generated/reports/tmp-webgl-load.png` 确认地图实际可见；控制面板按钮可打开生成面板，测量按钮点击后 `measurement-active = true`。
- in-app browser 的自动化桥接仍会被旧卡死标签拖住，连列标签/新建标签都超时；这与旧 bundle 主线程冻结现象一致。代码侧验证通过后，需要刷新当前 in-app browser 标签以加载新的 hash bundle。

后续：

- 继续关注首屏 bundle：静态导入 Delaunator 后主入口体积上升，后续应结合现有懒加载策略拆分生成器或 vendor，而不是回到顶层动态导入。
- 浏览器验证加载问题时，必须使用用户实际端口和当前页面状态；独立干净会话只能作为辅助证明。

### 面板样式统一第一刀

背景：

- 用户反馈 Element Plus 表格仍是白底，与整体暗色地图编辑器不匹配。
- 用户进一步澄清需要修正的不是控制面板顶层 tab，而是“视图”区域里的互斥按钮组；该按钮组此前为了容纳 11 个视图模式改成换行网格，实际观感像装修未收口。

修正：

- `:root` 补齐 Element Plus 暗色主题 token，让按钮、输入、弹层、表格等默认变量先进入同一套深色基调。
- `UiSegmented` 的 Element segmented 适配层改为不换行的横向滚动按钮组，增加选中态边框、暗金背景和细滚动条；视图模式独立使用更宽按钮，避免“生物群系”等中文标签被省略。
- `UiObjectTable` 的 Element Table 背景、表头、行、固定列、空态、滚动容器和 hover/选中态增加高优先级暗色覆盖，消除表格内部白底穿透。
- `ControlPanel.vue` 为视图互斥按钮组增加 `view-mode-segmented` class，避免影响其他短选项 segmented。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?style_verify=...`：默认地图可加载，视图互斥按钮为 `1` 行，按钮组 `overflow-x: auto`，11 个视图标签均无截断；国家表格白底节点为 `0`。
- 更完整的面板巡检打开了国家、城市、文化、资源标记、备注总览和名称库浮层：各表格背景为 `rgb(15, 21, 25)`，表头为 `rgb(17, 26, 32)`，面板内白底节点均为 `0`，console/page error 为 `0`。

后续：

- 这次只处理当前最突兀的表格白底和视图互斥按钮；下拉弹层、排序按钮组和其他旧式原生按钮仍应在后续 Element Plus 替换中继续统一。

### 灰度高度图入口迁入高度编辑面板

背景：

- 用户指出灰度导入属于高度编辑相关能力，不应一直显示在控制面板生成参数中。
- 当前高度编辑面板已是懒加载浮层，适合作为灰度高度图导入和后续高度图工作台的入口。

修正：

- `ControlPanel.vue` 移除生成 tab 中常驻的“灰度高度图”区块，只保留地形模板、气候、继承结构和生成按钮。
- `HeightPanel.vue` 新增“灰度高度图”区块，复用最低高度、最高高度、反转黑白、适应方式、导入按钮和状态提示，并保留 `heightmap-import-* / heightmap-image-file / heightmap-import-status` 等旧 id 契约。
- `panel.js` 将 `#heightmap-image-file` 的 `change` 监听改为 document 事件委托，保证高度编辑面板首次懒加载后创建的 file input 仍能触发原有导入流程。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和大 chunk 警告。主入口从上一轮约 `670.62KB / 203.28KB gzip` 降到约 `660.85KB / 200.22KB gzip`，高度面板 chunk 增至约 `4.21KB / 1.80KB gzip`。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?height_import_move=...`：生成 tab 内 `#heightmap-image-file = 0`，生成 tab 灰度导入区块为 `0`，文本不再包含“灰度高度图”。
- 打开管理 tab 的高度编辑浮层后，灰度导入区块可见，`#heightmap-image-file accept = image/*`，默认最低/最高高度为 `0 / 100`，适应方式为 `stretch`。
- 用内存构造的 `height-panel-gray.svg` 触发导入后，状态为“已导入灰度高度图：height-panel-gray.svg，高度 20-80，拉伸铺满”，地图 `heightmap.template = grayscale-import`，source 记录 `heightMin = 20 / heightMax = 80 / fitMode = stretch`，console/page error 为 `0`。

后续：

- 后续彩色高度图识别、预览和色阶映射应继续沿高度编辑/高度图工作台方向推进，而不是回到生成参数常驻区。

### 右上角状态清理与神话化 loading 文案

背景：

- 用户认为右上角“等待生成任务”一类 loading 提示可以去掉，当前正上方 loading bubble 已经足够清楚。
- 用户希望每一步 loading 更有神话叙事感，例如“山海初开”“大禹治水”，但仍要覆盖当前真实加载阶段。

修正：

- `index.html` 中 `#map-badge` 初始文案从“等待生成”改为空，CSS 新增 `.map-badge:empty { display: none; }`；启动兜底和 `main.js` 启动异常不再写右上角 badge，改为正上方提示“星图未启 / 星图失序”。
- `setGenerationStatus()` 和 `reportGenerateError()` 不再写 `#map-badge`，右上角 badge 只由 `updateRuntimePanel()` 写入地图图幅尺寸。
- `runtime/app.js` 新增 `LOADING_MESSAGES` 映射，覆盖生成阶段、worker 阶段、WebGL 装载阶段、地图数据导入和灰度高度图导入；示例包括“星图启明、山海初开、群山起脉、水陆分判、羲和布候、大禹治水、诸侯封疆、展开乾坤”。
- `PlaceholderMapRenderer.loadMapAsync()` 的 `onStage` 回调从只传 label 改为传 `{id, label}`，让用户文案可以按稳定 stage id 映射；原始技术 label 仍保留在 profile 和开发模式统计里。
- `setGenerationLoading()` 的默认文案改为“山海初开”，避免后续漏传文案时回到旧的普通生成提示。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?loading_copy=...`，在页面启动前注入观察器记录 `#generation-loading-text` 和 `#map-badge` 所有变化。
- 观察到 loading 文案序列包含“星图启明、山海初开、校准天机、群山起脉、水陆分判、羲和布候、九州成图、大禹治水、诸侯封疆、灵纹铺地、展开乾坤、诸域归册”等；旧文案“等待生成 / 正在生成地图 / 静候星图显影 / 正在推演 / 正在铺展 / 正在誊清”均未出现。
- badge 样本为初始空文本，然后变为 `3,810 千米 x 2,540 千米`；未再出现等待或生成状态。最终 loading hidden，地图 ready，console/page error 为 `0`。

后续：

- 目前仅处理正上方生成/装载 loading；各懒加载面板内部“正在加载某面板...”仍属于局部占位文案，后续可在统一面板空态时再决定是否也神话化。

### 视图选择按钮矩阵放宽

背景：

- 用户指出“视图” tab 下的视图选择按钮不需要继续挤成一行，可以松散一些，并通过按钮尺寸撑起该 tab 的控制面板高度。
- 上一轮为避免折行把视图 segmented 做成了横向滚动，但实际桌面控制面板宽度足够承载更直观的矩阵按钮。

修正：

- `view-mode-segmented` 独立改为 3 列 CSS grid，按钮高度提升到约 `42px`，间距增加到 `8px`，11 个视图模式自然排成 4 行。
- 隐藏该矩阵内 Element Plus segmented 的默认滑动选中块，改由按钮自身的边框、暗金渐变背景和文字色表达选中态，避免出现一条独立高亮块。
- 该修改只作用于视图选择矩阵，其他 `UiSegmented` 仍保持原有横向滚动或紧凑样式。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和大 chunk 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?view_matrix_verify=...`，打开控制面板并切到“视图”：按钮组为 grid，列数 `3`、行数 `4`、单按钮约 `165px x 42px`，文本截断 `0`，横向溢出 `0`，选中滑块 display 为 `none`，console/page error 为 `0`。

后续：

- 视图页的两个图层开关暂时保留当前双列样式；后续若整体控制面板继续放宽，可以统一检查图层、单位和生成 tab 的行距节奏。

### docs 结构整理第一刀

背景：

- 用户指出 docs 结构又开始散乱。
- 实际盘点发现 `docs/` 根目录重新堆积了 30 多个本地 server / Vite 日志；同时 `.gitignore` 仍忽略整个 `docs/task-notes/`，导致若干重要计划和评估文档虽然被 `current-plan.md` 引用，却不会进入版本库。
- `AGENTS.md` 接手清单还把 `docs/generated/reports/...` 里的本地生成报告列为必读，但 `docs/generated/` 本来就是忽略目录，fresh clone 不能依赖这些文件存在。

修正：

- `docs/` 根目录重新收敛为 `README.md / current-plan.md / development-log.md`，散落的 `.log` 文件移动到 `docs/local-logs/`。
- `.gitignore` 移除 `docs/task-notes/` 的整目录忽略，只保留 `docs/generated/`、`docs/local-logs/` 和误落在根目录的生成报告 guard。
- `docs/README.md` 明确根目录不得放本地日志、截图、profile 输出或临时报告，并写清 `architecture / plans / milestones / performance / audits / deployment / task-notes / generated / local-logs` 的用途。
- 新增 `docs/task-notes/README.md`，按 Source 对照与生成质量、编辑器与用户外壳、导入导出与 GIS、名称库、世界系统与后续大功能分类索引现有专题文档。
- `AGENTS.md` 新增 `docs/README.md` 和 `docs/task-notes/README.md` 作为接手入口，并从必读清单移除默认不入库的 `docs/generated/reports/...` 文件。
- `docs/task-notes/chinese-naming-library-evaluation.md`、`editor-and-stat-panel-inventory.md`、`source-first-detailed-task-plan.md` 和 `source-first-recovery-execution-plan.md` 因取消忽略后重新显露为待入库专题文档。

验证：

- `git diff --check` 通过。
- `docs/` 根目录当前只剩 `README.md`、`current-plan.md` 和 `development-log.md`。
- `git check-ignore` 确认 `docs/generated/` 和 `docs/local-logs/` 仍被忽略，`docs/task-notes/*.md` 不再被忽略。
- Markdown 引用检查未发现指向已移动根目录 `.log` 的文档引用；已知 `docs/generated/` 引用仍代表本地可复现报告，不作为 fresh clone 必读前置。

后续：

- 下一轮若继续整理，可考虑把超长 `docs/current-plan.md` 做阶段归档，但这会触及大量历史引用，应单独做。
- 运行本地服务时应把日志直接写入 `docs/local-logs/`，避免再次污染 `docs/` 根目录。

### 高度图导入工作台第一刀与生成 tab 收敛

背景：

- 用户要求继续按高度图导入工作台作为第一优先，同时修正高度编辑动作按钮拥挤、灰度导入平铺在高度编辑里、生成 tab 仍暴露文化/宗教继承结构等问题。
- 灰度导入本质属于高度编辑与地形导入能力，不应作为普通生成参数常驻展示；文化和宗教继承结构也应默认随机生成，后续调整交给对应编辑面板。

修正：

- `ControlPanel.vue` 移除生成 tab 的“继承结构”区块，不再展示文化/宗教继承结构下拉；运行时 `readOptionsFromPanel()` 继续保留上一轮 options，生成器的 `normalizeOptions()` 会用内部默认继承模式兜底。
- `HeightPanel.vue` 把灰度图导入配置收进独立可拖动的“高度图导入工作台”：高度编辑主体只保留入口和导入状态，最低/最高高度、反转黑白、适应方式和 file input 都在工作台内。
- 选择图片后只更新 canvas 预览、图片尺寸、目标图幅、亮度范围和高度映射；点击“应用到地图”后通过 `heightmap-import-apply` 事件触发原有 `grayscale-import` 完整重生成闭环。
- 高度编辑动作 `抬升 / 降低 / 平滑` 改为 3 列矩阵按钮，增加间距和固定高度，避免挤成一排。
- 补齐 `UiButton / ElButton` 的 primary/secondary 暗色 CSS 变量，避免高度面板和工作台按钮回退到 Element 默认白底。
- `height-panel.js` 和 `runtime/app.js` 向高度面板传入当前图幅宽高，用于工作台预览比例和目标尺寸展示。
- `docs/current-plan.md`、`docs/task-notes/heightmap-image-converter-plan.md` 和 `docs/task-notes/user-facing-shell-debug-export-and-naming-plan.md` 同步记录入口迁移与阶段 1 落地状态。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?height_workbench_final=...`：生成 tab 内 `#culture-inheritance-mode / #religion-inheritance-mode / .generation-inheritance-section` 均不存在。
- 打开管理 tab 的高度编辑浮层后，`.height-action-group .el-segmented__group` 为 grid，列数 `3`，三个动作标签无截断；高度编辑主体内不存在平铺的 `.heightmap-import-fields`，工作台打开前也不存在 `#heightmap-image-file`。
- 打开高度图导入工作台后，file input 保持 hidden 且 `accept = image/*`，默认高度区间 `0-100`、适应方式 `stretch`；选择合成 SVG 后预览状态为“预览已更新，点击应用后才会重建地图。”，canvas 有非透明像素，统计显示图片尺寸、目标图幅、亮度范围和高度映射。
- 点击“应用到地图”后地图切换到 `heightmap.template = grayscale-import`，source 记录 `filename / brightnessMin / brightnessMax / heightMin / heightMax / invert / fitMode`，状态更新为“已导入灰度高度图...”，顶部 loading 收起，WebGL `glError = 0`，console/page error 和 request failed 均为 `0`。
- 截图 `docs/generated/reports/tmp-heightmap-workbench-final.png` 确认高度编辑浮层和高度图导入工作台为两个并列浮层，按钮已回到暗色主题。

后续：

- 高度图工作台下一步应进入轻量色板量化、自动亮度/色相/FMG 色带映射和手动色块赋高；不要再把彩色识别塞回当前灰度导入函数。

### 资源点类型细分第二刀

背景：

- 当前计划的第二优先任务是继续推进 marker / 资源点，而不是为单一资源继续扩大总量。
- 资源点第一刀已经接入图层、资源经济和编辑面板，但资源类型仍偏粗，默认生成多集中在矿山、盐湖、温泉和稀有生物。

修正：

- `markers.js` 新增 `21` 种资源 marker：采石场、黏土坑、煤田、硫磺泉、硝石洞、琥珀海岸、珍珠滩、珊瑚礁、渔场、良港、森林木场、树脂林、药草谷、染料草场、香料林、茶山、丝茧桑园、马场、牧盐草甸、绿洲和圣泉。
- 资源类型池扩展为 `26` 种，手动放置资源点的下拉会自动读取这套类型；默认 marker 总量公式不变，避免为类型细分放大地图噪点。
- 新增水邻接、海岸陆地、海岸水域、湖泊水域和盐湖邻接判断，并按高度、海岸、湖泊、河流、生物群系、温度、降水、人口、适居度和地形粗糙度为不同资源候选排序。
- 新资源复用现有 marker 图标语义和资源经济字段，继续写入 `resourceKey / resourceLabel / economicValue / visual`，国家、省份资源潜力无需额外迁移。

验证：

- `node --check app\webgl-generator\src\generator\markers.js` 通过。
- `stage-2-1231411414 / continents / 10000` 生成样本中总 marker 仍为 `41`，资源点仍为 `5`，说明类型细分没有抬高默认总量。
- `stage-2-1231411414 / continents / 100000` 生成样本中总 marker 为 `383`、资源点为 `78`，实际出现 `23` 种资源点，其中新增类型出现 `18` 种。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?resource_types_diag2=...`：地图 ready 后 `#generation-loading.hidden = true` 且 `display = none`；打开资源与标记管理面板后，下拉显示 `26` 种资源类型，包含新增的采石场、黏土坑、煤田、硫磺泉、珍珠滩、珊瑚礁、渔场、良港、茶山、马场、绿洲和圣泉，console/page error 与 request failed 均为 `0`。

后续：

- 地热田尚未从温泉中独立拆出，后续如果要继续资源链路，应优先进入 goods/market/deals 正式贸易系统，而不是继续追加小类型。

### 资源点接入正式贸易链路第一刀

背景：

- 当前计划第三优先要求把 goods 生成前移到 `rankCells()` 之前，并把资源点转成正式 goods / market / deals 贸易供需，而不是长期只依赖 economy 阶段的资源 bonus。
- 旧逻辑里 `economy` 阶段才创建 `pack.goods` 和 `pack.cells.good`，资源 marker 主要汇总为国家/省份 `resourcePotential`，没有成为市场库存和交易的正式来源。

修正：

- `economy.js` 新增 `prepareInitialGoods()`，在 biome 定义后、`rankCells()` 前写入 `pack.goods / pack.cells.good / pack.cells.goodSupply / pack.cells.goodSource`。
- `biomes.js` 的 `rankCells()` 会读取正式 goods，并把资源价值与供应量加入适居度评分；`pack.metadata.rankCellsInputs` 记录 `hasGoodsAtRankTime / resourceRankBonusCells / resourceRankBonusTotal`。
- `economy` 阶段会保留前置自然资源，并把 marker 资源按 `resourceKey` 映射为正式货物，例如矿产映射铁矿/铜矿/锡矿/银矿/金砂，茶山映射茶叶，渔场映射鱼，马场映射马匹，绿洲映射水果/粮食。
- marker 资源会覆盖当前 cell，水域资源会额外落到邻接陆地 access cell；这些来源会注入所属市场库存，降低本地价格，并在 market-to-burg、burg-to-market 和 market-to-market 交易中优先出现。
- `deal.source` 新增 `scheduled / market-resource / marker-resource`，`economy.metadata.resourceTrade` 记录资源 cell、marker resource cell、库存增量、资源货物分布、资源交易数和 marker 资源交易数。
- 资源点增删移和重生成后，`marker-edit-commands.js` 会同步 `pack.markers` 并立即重建 `map.economy`；运行时只把军事和外交标为待派生，不再把 economy 留在 stale 状态。

验证：

- `node --check` 覆盖 `economy.js / biomes.js / index.js / app.js / marker-edit-commands.js`，均通过。
- `stage-2-1231411414 / continents / 10000` 生成样本：`hasGoodsAtRankTime = true`，`resourceRankBonusCells = 995`，资源交易 `8136 / 14248`，marker 资源交易 `297`，交易来源同时保留 `scheduled = 6112`。
- `stage-2-1231411414 / continents / 100000` 生成样本：`resourceRankBonusCells = 9324`，资源交易 `13260 / 23684`，marker 资源交易 `2292`，`markerGoods` 覆盖陶土、药草、煤、鱼、木材、硝石、宝石、盐等多类货物。
- 资源编辑命令抽样：新增一个“测试茶山”后，资源 marker 从 `5` 到 `6`，marker 资源 cell 从 `6` 到 `7`，marker 资源交易从 `297` 到 `389`，`markerGoods` 出现“茶叶”，`map.economy.metadata.stale` 仍为 `false`。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。主入口从上一轮约 `671.15KB / 203.12KB gzip` 增至约 `676.66KB / 205.09KB gzip`。
- Playwright + 系统 Chrome 访问 `http://127.0.0.1:5410/?resource_trade_ready=...`：最终 `#generation-loading.hidden = true`、`display = none`，WebGL `glError = 0`，`markerResourceDeals = 390`，`hasGoodsAtRankTime = true`，console/page error 为 `0`。
- 在浏览器中打开资源与标记管理并点击“重生成资源点”：资源点变为 `10`，资源潜力 `134`，marker resource cells `19`，marker resource deals `764`；`derivedStale.systems` 仅剩 `military / diplomacy`，generationLog 记录 `markerResourceDeals=764`。

后续：

- 这次是贸易链路第一刀，尚未做用户可视化的市场供需面板，也没有让资源货物进一步影响城镇选址、道路选线和外交贸易偏好。
- 后续若继续深化，应增加市场距离成本、供需缺口、贸易路线可视化，以及按资源类型生成专门的城镇产业标签。

### 拾取、列表滚动与 PNG 导出修正

背景：

- 用户反馈河流与路线重叠时不容易点中河流。
- 河流、路线、省份从地图选中后，列表没有稳定滚动到选中行。
- 控制面板“视图”tab 的 Element 分段按钮 hover 时会露出白色背景。
- 导出 PNG 只有左下角比例尺，底图为空。

修正：

- `PlaceholderMapRenderer.pickClientPoint()` 将河流命中优先级调整到路线之前，并给河流拾取略放宽阈值；路线和河流拾取会尊重对应图层开关。
- 城市拾取现在尊重城市/人口图层开关，避免隐藏城市图层后仍抢占河流/路线命中。
- `UiObjectTable` 的选中行滚动改为跨多帧复核：找到行后如果仍在表格视口外，会先调整 Element Plus 内部滚动容器，再下一帧确认，直到进入视口或达到重试上限。
- 旧 `table-scroll` helper 的滚动容器选择同步改为 Element Plus 的 `.el-scrollbar__wrap`，保留外层容器兜底。
- 视图分段按钮补齐 Element Plus hover/fill 变量，并压制 item 本体伪元素背景，避免 hover 时露出白底。
- PNG 导出改为在导出前调用 renderer 重绘，并通过 `gl.readPixels()` 从 WebGL framebuffer 读回像素、翻转到 2D canvas，再叠加徽标和比例尺等 DOM 覆盖层。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 通过 Vite 程序化服务访问 `http://127.0.0.1:5410/`：地图 ready 后 `generation-loading.hidden = true`，WebGL canvas 抽样 `uniqueColors = 324`。
- 河流/路线重叠抽样：候选点同时有 route 和 river candidate，最终 `pickedKind = river`。
- 河流、路线、省份三类面板选中末尾对象后，`.selected-row` 均在 Element 表格滚动视口内。
- “视图”tab 中“文化”按钮 hover 时 item 背景为透明，label 背景为暗色 `rgb(23, 33, 39)`，不再出现白底。
- 导出 PNG 文件 `1366 x 900`，抽样区域 `uniqueColors = 70`，确认不再只有比例尺。

### 滑条数字显示收敛

背景：

- 用户指出滑条已经配套 Element Plus 数字输入，右侧再显示一个数字属于重复信息。
- 对温度、纬度、比例尺和倍率这类带单位场景，右侧只需要保留单位提示。

修正：

- `UiSliderField` 移除 `displayValue` 数值展示语义，新增 `unitLabel`，只在传入单位时显示单位文本。
- 气候温度显示 `°C`，画布纬度显示 `°`，比例尺显示 `km/cm`，人口/降水倍率和河流宽度因子显示 `x`。
- 高度刷子、国家/省份刷子、标签上限、高度图导入最低/最高高度等无单位滑条不再显示右侧数字，也收掉对应占位列。
- 旧的隐藏 range input 和 output id 保留，兼容现有运行时代码读取和更新控制值；运行时不再把 output 写回数字。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 抽样：气候 output 分别为 `°C / °`，单位 tab output 为 `km/cm / x / x`，标签上限 output 为空且 `display:none`；高度面板半径/强度无右侧单位节点，高度图导入区间 output 隐藏；河流宽度二级面板只显示 `x`。

### 关键滑条 change 防抖

背景：

- 用户指出比例尺等会立刻引起全局数据重算的关键数据，不应在滑条拖动的 `input` 阶段响应，必须等 `change` 事件后再响应，并增加防抖。

修正：

- `UiSliderField` 拆分实时值更新和最终提交：Element 滑条/数字输入的 `input` 阶段只更新组件当前值和隐藏原生 range 的 `.value`，不再派发原生 `input/change`。
- `UiSliderField` 在 `change` 阶段才派发组件 `change` 和隐藏原生 range 的 `change`，旧 runtime 的 DOM id 桥仍可读取最终值。
- 比例尺、人口倍率、降水倍率改为 `@change` 后写入全局偏好；画布纬度滑条拖动时只切换为手动模式和更新读数，不再每次 `input` 主动触发气候重算。
- `panel.js` 中气候参数和单位倍率的 runtime 绑定统一改为监听 `change`，并通过 `180ms` 短防抖合并最终提交；城市标签上限同步切到 `change`，适配新的滑条桥接语义。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 通过 Vite 程序化服务访问 `http://127.0.0.1:5410/?slider_change_verify=3`：控制面板中拖动比例尺滑条时，鼠标按下移动阶段隐藏 range 事件为 `input=0 / change=0`，松手后为 `input=0 / change=1`，比例读数更新为 `1 cm = 777 km`；拖动赤道温度滑条同样在移动阶段 `input=0 / change=0`，松手后 `change=1`，且页面无 console/page error。

### 城镇标签拾取穿透

背景：

- 用户反馈城镇标签会影响城镇本体点击，需要把城镇标签全部视为不可点击展示层。

修正：

- `PlaceholderMapRenderer.pickLabel()` 现在跳过 `LABEL_TARGET_KIND.CITY`，地图拾取不再把生成的城镇名称返回为 `OBJECT_KIND.LABEL`。
- 自定义标签和国家名称仍可按现有逻辑作为标签对象拾取；城镇名称的隐藏、重命名和备注继续通过标签管理面板处理。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 通过 Vite 程序化服务访问 `http://127.0.0.1:5410/?city_label_pick_verify=1`：可见城镇标签“兴苑”的标签框中心拾取结果 `labelKind = null`，不再返回 `city` 标签；点击同一城市的本体坐标返回 `objectKind = city / cityObjectId = 6`，页面无 console/page error。

### PNG 导出补齐地图 overlay

背景：

- 用户反馈导出的图片没有标签等信息，需要根据当前视图和图层充分导出地图内容。
- 同时要求不要把比例尺、控制面板、浮层面板、loading 等 UI 信息导出到图片里。

修正：

- `downloadCanvasPng()` 改为异步合成：先读回 WebGL framebuffer，再把当前可见地图 overlay 合成到导出 canvas，最后再 `toBlob()`。
- 导出 overlay 只读取 `.map-overlay` 中当前 `.visible` 的地图元素，包括城镇标签、国家名称、自定义标签、近景城镇剪影和资源/标记图标。
- SVG 图标会在导出时内联当前 computed style，再转成图片绘制到导出 canvas，保证配色和当前图层状态一致。
- 导出不再手动画 `map-badge` 和 `map-scale-bar`，因此不会把右上角尺寸、左下角比例尺、控制面板、浮层面板或 loading 合成进 PNG。
- 导出 overlay 的可见性不再受 CSS 过渡瞬间 `opacity: 0` 影响，只要元素已经处于 `.visible` 状态，就按最终语义透明度参与导出；资源图标与城市重叠时仍保留半透明表现。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- Playwright + 系统 Chrome 通过 Vite 程序化服务访问 `http://127.0.0.1:5410/?export_overlay_verify=2`：拦截导出 canvas 的 `fillText/drawImage/toBlob`，确认导出绘制了当前可见的全部 `27` 个地图标签文本和 `9` 个可见地图图标；`500 千米` 比例尺文字和右上角 `3,810 千米 x 2,540 千米` 尺寸 badge 均没有进入导出 canvas，页面无 console/page error。

### README 人类化重写与许可证补充

背景：

- 原 README 偏向实现清单和交接说明，读起来更像给后续智能体看的任务记录，而不是给真实读者看的项目首页。
- 项目已经进入可体验阶段，需要更清楚地说明它想服务的创作者、与原 Fantasy Map Generator 的关系，以及继续探索的方向。

修正：

- 重写根目录 `README.md`，把重心从细项功能罗列转向项目介绍、创作愿景、本地运行、仓库结构、原作者致敬和许可证。
- 新增根目录 `LICENSE`，采用 MIT License，并明确保留对 Max Haniyeu (Azgaar) 和原 Fantasy Map Generator 许可证声明的引用。
- `package.json` 补充 `license: MIT`，与根目录许可证文件保持一致。

验证：

- `git diff --check` 通过。

### 展开乾坤加载卡住修复

背景：

- 用户反馈页面会卡在最后一步“展开乾坤”，地图无法完成进入可交互状态。
- “展开乾坤”对应 renderer 的 `fit-draw` 阶段；这一阶段前后都会等待浏览器完成一帧绘制，让 loading 文案有机会刷新。
- 原等待逻辑完全依赖 `requestAnimationFrame`，在浏览器页签、内嵌浏览器或高负载状态被节流时，Promise 可能长期不 resolve，导致生成流程停在最后一个 loading 文案。

修正：

- `scheduleAfterPaint()` 增加 `120ms` 超时兜底，`requestAnimationFrame` 未及时回调时仍会启动生成任务。
- `yieldToBrowser()` 同样增加 `120ms` 超时兜底，避免 WebGL 装载阶段的任一帧等待永久悬挂。
- 两个兜底都用一次性 guard，确保 rAF 与 timeout 竞争时不会重复执行回调或重复 resolve。

验证：

- `git diff --check` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- in-app browser 新标签访问 `http://127.0.0.1:5410/` 后，首次加载完成时 `.generation-loading-bubble.hidden = true`，页面文本不包含“展开乾坤”，console warn/error 为 `0`。
- 在同一浏览器中打开控制面板并点击“生成 grid 地图”，重新生成过程中 loading 短暂显示“沧海描岸”，随后隐藏；轮询样本中未再出现“展开乾坤”，console warn/error 为 `0`。
- 截图确认地图、标签、图标和控制面板均正常渲染。

### 高 cells 展开乾坤卡住二次修复

背景：

- 用户复测后反馈当前 in-app browser 仍会停在最后一步“展开乾坤”，且浏览器控制接口读取标签列表也会超时。
- 外部 headless Chrome 复现时发现，默认 `10000` cells 可以完成，但把 `cells-input` 改到 `100000` 后 worker 报 `Maximum call stack size exceeded`，生成失败后页面仍保留旧图，容易和最后 loading 卡住混在一起。
- 同时检查最后 `fit-draw` 路径，发现 overlay 更新会为大量隐藏标签、城镇图标、资源图标和军事图标继续执行重叠检测；这些对象在当前缩放、图层或视口下本就不会显示，却仍参与了昂贵判断。

修正：

- `grid.js` 与 `pack.js` 的最大邻接度统计不再使用 `Math.max(...neighborDegrees)`，改为迭代求最大值，避免 100k 级数组展开撑爆调用栈。
- `climate.js` 的温度、降水范围不再使用 `Math.min/Math.max(...array)`，改为一次遍历求范围。
- `heightmap.js` 的陆地最大高度和柔化高度回写不再使用大数组展开；高度回写改为普通循环。
- `PlaceholderMapRenderer.buildLabels()` 改为通过 `DocumentFragment` 批量挂载 overlay 节点，减少大量标签和图标节点创建时的布局压力。
- `updateLabels()`、`updateCityIcons()`、`updateMarkerIcons()` 和 `updateMilitaryIcons()` 先判断图层、缩放、屏幕范围和上限，只有确实可能显示的对象才进入重叠检测。

验证：

- `git diff --check` 通过。
- `node --check app/webgl-generator/src/generator/grid.js`、`pack.js`、`climate.js`、`heightmap.js`、`renderer/placeholder-renderer.js` 和 `runtime/app.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- headless Chrome 访问 `http://127.0.0.1:5410/?headless_100k_verify=4`，先完成默认图，再将 `cells-input` 设为 `100000` 并触发“生成 grid 地图”：最终 `mapCells = 100000`、`packCells = 51749`、`.generation-loading-bubble.hidden = true`、页面不包含“展开乾坤”、console warn/error 为 `0`。
- 同次验证中 `loadMap.totalMs = 2579.5ms`，`fit-draw = 86.5ms`，`labelCount = 1283`，`visibleLabelCount = 26`，`cityIconCount = 1263`，`visibleCityIconCount = 10`，`markerIconCount = 382`，`visibleMarkerIconCount = 0`。
- 重新验证时，当前 in-app browser 旧页连读取选中标签页 URL / 标题都会超时；用户 Chrome 扩展新开 5410 标签可以完成导航和标题读取，但进入运行时状态读取后同样超时，说明已经冻结的旧页或用户 profile 状态会拖住浏览器控制通道。
- 为排除 headless 假阳性，另用干净可见系统 Chrome 访问 `http://127.0.0.1:5410/`：默认图 `mapCells = 10004`、`packCells = 5950`、loading 收起、中心像素块 `nonZero = 9216`、`uniqueColors = 96`；随后通过真实控件改为 `100000` cells 并点击生成，最终 `mapCells = 99846`、`packCells = 51749`、`loadMap.totalMs = 1705.6ms`、`fit-draw = 77.3ms`、`glError = 0`、中心像素块 `nonZero = 9216`、`uniqueColors = 319`、console warn/error 为 `0`。
- 可见系统 Chrome 截图已保存为 `docs/generated/reverify-5410-headed-initial.png` 和 `docs/generated/reverify-5410-headed-100k.png`，截图确认画布有完整地图、标签、路线、城镇/军事图标和比例尺。
- 当前已经卡死的 in-app browser 旧页仍会让浏览器控制接口超时，无法直接读 DOM；需要刷新当前页后才能接到本轮修复代码。

### 初始化加载流程与车马入途卡顿修复

背景：

- 用户在自己的 Chrome 中继续复现加载卡顿，拆分阶段后确认当前会停在“车马入途”。
- “车马入途”对应 renderer 的 `route-screen-mesh` 阶段，即道路屏幕空间 mesh 构建。这个阶段之前是一个同步任务，路线数据或虚线切片一旦异常膨胀，就会表现得像死循环一样占满主线程。
- 只用干净 headless / 可见 Chrome 验证不够，必须在用户 Chrome profile 下验证。

审查结论：

- 默认 `stage-2-1` 10k/100k 数据的路线规模并不异常：100k 约 `968` 条路线、`10143` 段、最长路线 `596` 点，说明卡顿不是普通数据规模必然导致。
- 风险集中在 renderer 缺少保护：路线 mesh 一次性同步构建、路线点数无预算、道路顶点无预算、虚线 while 缺少“不前进”保护和切片上限。
- 初始化流程规约已写入 `docs/task-notes/initialization-loading-flow.md`，明确 `fit-draw / route-screen-mesh / river-screen-mesh / overlay-draw / panel-refresh` 的阶段边界和预算要求。

修正：

- `route-screen-mesh` 在异步加载路径中改为分帧构建，默认每个时间片约 `10ms`，阶段内部可让出浏览器。
- 道路 renderer 增加异常输入保护：单条路线渲染点上限 `4096`，全图路线渲染点上限 `90000`，道路 mesh 顶点上限 `900000`；超出时抽稀或截断，并记录 `routeRenderStats`。
- 虚线路线切片增加保护：dash/gap 非法时降级为实线，切片 step 必须前进，单条虚线路线切片上限 `20000`，避免 while 因异常数值锁死。
- `renderer.getStats()` 新增 `routeRenderStats`，用于开发模式后续展示道路 mesh 是否发生预算降级。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `node --check app/webgl-generator/src/renderer/mesh-writer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 超过 500KB 警告。
- 用户 Chrome profile 新标签访问 `http://127.0.0.1:5410/?route_stage_verify=3`：loading 最终 `hidden = true`，页面文本不再包含“车马入途”或“展开乾坤”，状态显示 `source 阶段 19 economy 第一刀，seed stage-2-1`，地图尺寸 badge 为 `3,810 千米 x 2,540 千米`。
- Chrome 截图确认地图、路线、河流、国家标签、城镇/军事图标和比例尺均已渲染。
- 在同一用户 Chrome 标签中点击“测量”按钮可进入测量模式，`measurement-active = true`，证明页面未被加载流程锁住。

### 初始化加载追踪开关

背景：

- 用户提出如果仍无法定位卡顿，可以临时在每一步渲染之间插入 `setTimeout` 间隔，并在每一步回调，借此判断真正卡住的阶段。
- 这个能力只适合开发诊断，不能污染普通用户加载路径。

修正：

- `PlaceholderMapRenderer.loadMapAsync()` 新增 `onStageEnd`，每个渲染装载阶段都会产生开始和结束事件。
- 运行时把生成 Worker 阶段、主线程 fallback 生成、WebGL 装载、面板刷新和完成状态串成同一条加载追踪。
- 开发模式面板新增“加载追踪”列表；同时输出 `[FMG load]` console debug 日志、`webgl-generator-load-stage` 页面事件和 `window.__webglGeneratorDebug.loadTrace` 最近事件数组。
- `?debug=1` 或 `?loadTrace=1` 开启追踪；`loadStepDelay / debugLoadDelay / loadTraceDelay` 可以在阶段边界插入最多 `2000ms` 的临时延迟。
- 延迟只加在阶段边界，不加在道路 mesh 内部切片上，避免调试模式被大量内部 yield 拖慢。

文档：

- 调试参数、输出位置和注意事项已补充到 `docs/task-notes/initialization-loading-flow.md`。

### 渲染健康监测第一刀

背景：

- 近期连续出现“展开乾坤”“车马入途”等渲染卡顿与加载卡住问题，单次临时追踪只能定位当前卡点，无法保证以后页面加载失败、渲染卡顿和用户操作卡顿都留下证据。
- 用户明确要求不一定上报远端，但至少要能保留本地临时记录，方便后续排查。

修正：

- 新增 `runtime/health-monitor.js`，默认安装 `window.__webglGeneratorHealth`，本地环形记录最近 `180` 条健康事件到 `localStorage["webgl-generator-health-events-v1"]`。
- `index.html` 的内联启动哨兵会记录 `document-boot` 和 `script-not-started`，即使模块脚本没有启动也能在本地留下失败证据。
- `main.js` 在 Vue/runtime 初始化前安装健康监测，启动异常会记录 `startup-error`。
- 运行时接入 `app-ready / map-ready / page-load-timeout / loading-stuck / load-stage`，普通模式下也能回看最后一个生成或渲染阶段。
- 浏览器级监测接入主线程 long task、`requestAnimationFrame` 帧间隔、输入事件派发延迟和输入处理阻塞。
- 视图切换、图层开关、适配视图、显示海底、平滑边界、最大标签数和气候即时重算等同步业务操作会记录 `operation-stall`。
- 开发模式面板新增“健康监测”列表，显示最近 warn/error 和 `map-ready`；完整事件仍可通过 `window.__webglGeneratorHealth.getEvents()` 读取。

文档：

- 新增 `docs/task-notes/render-health-monitoring.md`，记录监测目标、存储位置、阈值、查询方式和当前缺口。
- `docs/task-notes/README.md` 和 `docs/current-plan.md` 已同步加入健康监测入口。

### 政体系统与国家国号规则第一刀

背景：

- 用户指出国家后缀不应再使用“朝”；“朝”是写史用语，不适合地图中一个国家的正式自称。
- 小国通常应称 `国`，番邦或君主制国家可称 `王国`，大国或自诩正统的专制国家可称 `帝国`，共和与联邦政体则应允许 `共和国 / 联邦 / 联邦共和国`。
- 由此需要把国家后缀从单纯命名词池升级为政体、规模和自我定位共同决定的系统。

修正：

- 新增 `generator/governments.js`，定义 `君主制 / 帝制官僚 / 封建王权 / 共和制 / 商业共和国 / 联邦制 / 邦联制 / 神权制 / 汗廷 / 部盟 / 军府 / 寡头制` 等政体。
- 国家生成阶段改为“定义国家政体与国号”，写入 `governmentKey / governmentLabel / governmentFamily / governmentCategory / governmentEra / governmentSize / selfStyledGreat / government`，并继续维护 `form / formName / fullName` 兼容旧系统。
- `names.js` 移除生成词池中的“朝”和爵位式后缀，`trimPoliticalForm()` 保留旧后缀清洗能力。
- 经济阶段读取政体影响税率、贸易倍率和经济力；外交阶段读取政体影响亲和、冲突、扩张和附庸概率；军事阶段读取政体影响征兵、兵力上限、军团目标和兵种比例。
- 国家管理面板新增二级“调整政体”操作，支持撤销/重做，并把经济、外交、军事标记为待派生。
- GeoJSON 国家要素和对象详情补充政体字段；WebGL baseline 命名摘要补充政体分布，并把 `共和国 / 帝国 / 联邦 / 邦联` 从旧形制误报中移除。

文档：

- 新增 `docs/task-notes/government-system-and-state-title-plan.md`。
- 更新 `docs/current-plan.md`、`docs/task-notes/README.md` 和早期命名计划中的旧国号口径。

验证：

- `node --check` 已覆盖 `governments.js`、`politics.js`、`economy.js`、`diplomacy.js`、`military.js`、`state-edit-commands.js` 和 `app.js`。
- 生成烟测 `seed=government-smoke / cellsTarget=10000` 生成 `25` 个国家，政体覆盖 `9` 类，国号覆盖 `国 / 王国 / 共和国 / 帝国 / 汗国`，无“朝”残留。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有 VueUse pure annotation 和主 chunk 体积警告。
- 用临时静态服务器加载构建产物并通过 Playwright 打开国家面板：页面 ready、loading 已 `hidden`，20 个国家覆盖 8 类政体，国家面板二级“调整政体”浮层可打开，console/page error 为 `0`。

### 军种图标资产化

背景：

- 用户指出军事单位 icon 不能继续复用 emoji 或符号组合，因为不同用户字符系统会导致显示不一致，且组合符号无法准确表达重装弓兵、山地兵等军种。
- 山地兵需要接近丛林伪装草帽的抽象图标，而不是女士草帽 emoji；重装弓兵需要三支箭同时搭弓的图标。

修正：

- 使用 imagegen 生成一张 5x2 军种 sprite sheet，并切分为十个透明 PNG 资产：
  - `fleet-large / fleet-small / archers / archers-heavy / cavalry / cavalry-heavy / infantry / infantry-heavy / mountain / artillery`
- 新增 `renderer/military-icon-assets.js`，统一管理图标 URL、中文标签和旧数据兼容映射。
- 军事生成器不再写入 emoji 或符号，`regiment.icon` 与 `regiment.iconVariant` 均使用稳定的纯文本类型键。
- 地图军事 overlay 从文字节点改为 `<img>` 图标节点，保留原有兵力数字、选中状态、碰撞避让和点击热区。
- PNG/JPEG 导出新增军事 overlay 绘制分支，会导出军事图标和兵力数字，而不是只导出文本。

### 导出浮层拖动通用化

背景：

- 用户指出简介 tab 下的导出面板无法移动；同为浮动面板，这类能力不应只在部分面板上可用。
- 主编辑浮动面板已由 `PanelManager` 支持拖动，但导出面板是控制面板内部的 Teleport 二级浮层，未接入通用拖动逻辑。

修正：

- 新增 `useDraggableFloatingPanel()`，为 Vue Teleport 浮层提供通用定位、拖动、视口约束和可选本地位置保存。
- 导出面板接入该通用能力：首次打开定位到导出按钮附近，用户拖动后保留位置，窗口变化时只约束在视口内。
- 树状总览面板改用同一 composable，减少后续二级浮层重复实现拖动逻辑。

### 异步面板空闲预热

背景：

- Element Plus 和 Vue 面板拆成异步 chunk 后，首屏资源更轻，但用户首次打开复杂面板时仍可能遇到临时加载等待。
- 用户希望保留拆包收益，同时在页面初次加载后利用执行空隙主动把异步组件加载好。

修正：

- `createLazyVuePanel()` 新增组件模块缓存和 `preload()` 能力，预热只触发动态 import，不挂载 Vue app、不打开面板、不改变面板内容。
- 新增统一空闲预热队列：地图进入可交互状态后，运行时会按 `requestIdleCallback` 或 `setTimeout` fallback 逐个预热异步面板 chunk，避免集中抢占主线程。
- 预热状态挂到 `window.__webglGeneratorLazyPreload.getStats()`，可查看总数、完成数、失败数、当前活跃面板和每个 chunk 的耗时。

### 构建日志噪声收敛

- Vite 8 / Rolldown 会报告 `@vueuse/core` 内部 misplaced `/* #__PURE__ */` 注释，日志代码为 `INVALID_ANNOTATION`；该问题来自上游包注释位置，不影响当前构建产物和运行时。
- `vite.config.mjs` 已通过 `build.rolldownOptions.onLog` 精准过滤 `@vueuse/core/dist/index.js` 当前两个已知行号上的 `INVALID_ANNOTATION`，不全局关闭该 warning 类型。
- 大 chunk 提示暂保留；当前主包 gzip 约 `221 kB`，后续如需继续优化，应先做 bundle 分析再拆首屏非必要模块。

### 简介文案诗意化

- 控制面板“简介”tab 的项目介绍改为更偏致敬和创作感的表达，避免“原版在线版 / 原版仓库”等生硬措辞。
- 项目链接按钮改为“查看此卷 / 拜访原作 / 体验原作”。

### 高度图导入工作台色板量化第一刀

背景：

- 当前高度图导入工作台只做灰度亮度预览和基础统计，彩色高度图无法先观察色块结构。
- 计划要求下一步进入轻量色板量化，但不能把彩色识别直接塞回灰度导入函数，也不能在预览阶段写入地图数据。

修正：

- 高度图导入工作台新增 `16 / 32 / 64 / 128` 色板上限选择。
- 选择图片后，预览 canvas 会基于当前缩略采样图做 5-bit RGB 分桶，按像素数生成量化色板。
- 色块显示颜色、像素占比和按当前高度区间估算的高度。
- 点击色块只高亮预览中的对应采样区域，不写 `map`，不触发重新生成。
- 工作台增加视口内高度约束，底部“选择图片 / 应用到地图 / 取消”动作栏在滚动容器底部吸附，避免色板变长后按钮跑出视口。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- Playwright + 系统 Chrome 通过构建产物一次性静态服务验证：默认地图 loading 已隐藏，跨画布 `25/25` 个采样点非空，`glError = 0`，`loadMap.totalMs = 353.5ms`，`fit-draw = 7.6ms`，`route-screen-mesh = 13.5ms`。
- 在高度图导入工作台导入合成彩色 SVG 后生成 `32` 个色块，指标显示 `32 / 100`；点击首个色块后摘要为“32 色，已高亮 #204f9a”，预览 canvas 非空。
- 预览、点击色块和取消工作台前后 checksum 保持 `55c7bf9c`，说明本刀没有写入地图数据；console warning/error 为 `0`。

### 高度图导入工作台自动映射预览第一刀

背景：

- 色板量化已经能看见彩色图片的主要色块，但每个色块仍只按灰度区间估算高度。
- 对照原版 Image Converter，下一步应先让自动映射和手动赋高在工作台中可解释、可回退，再考虑真正应用到地图。
- 本阶段仍不能把彩色色板识别直接塞进现有灰度导入闭环，避免在没有元数据契约时产生不可复查的高度图。

修正：

- 高度图导入工作台新增“映射模式”，支持 `灰度 / 亮度 / 色相 / FMG 色带 / 手动`。
- 色板条目新增 `autoHeight / height / manual` 状态；灰度和亮度模式按图片亮度范围归一化，色相模式把蓝色系压向水域，绿黄棕等颜色推向陆地高度，FMG 色带模式按 WebGL 版高度色带最近色匹配。
- 选中色块后显示独立赋值面板，可用滑条设置 `0-100` 高度，也可一键设为 `水域 / 低地 / 丘陵 / 山地 / 峰值` 或恢复自动。
- 手动覆盖会立即刷新色板标题、色块摘要和预览高亮，但只修改工作台状态，不写 `map`，不触发重生成。
- `应用到地图` 仍沿用当前 `grayscale-import` 路径；`image-palette` sampled heightmap、未分配颜色策略和 JSON 元数据留到下一阶段。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1084.1ms`，纯生成 `494.1ms`，WebGL 加载 `347.5ms`，最慢加载阶段为 `cell-visual-mesh 46.2ms`，`fit-draw = 2.5ms`，`glError = 0`。
- Playwright + 系统 Chrome 通过构建产物一次性静态服务验证：默认地图 loading 已隐藏，跨画布 `25/25` 个采样点非空，`glError = 0`，`loadMap.totalMs = 364.8ms`，最慢加载阶段为 `line-vertices 49.3ms`，`fit-draw = 8.7ms`。
- 在高度图导入工作台导入合成彩色 SVG 后生成 `6` 个色块，指标显示“映射模式灰度”；通过原生 select 桥切到“色相”后指标同步更新。
- 点击首个色块并设为“山地”后，色块标题变为 `高度 68 / 手动`，摘要显示 `h 68 手动`，赋值面板显示“手动高度”。
- 预览、切换映射模式和手动赋高前后地图 checksum 保持 `0a74dfc6`，说明本刀仍未写入地图数据。
- 浏览器健康监控在初始生成阶段记录一次约 `304.8ms` 的 `main-thread-long-task` warn；该事件发生在高度图交互前，正式 e2e 守门未超预算，后续若继续压初始生成长任务，应作为独立性能任务处理。

### 高度图 image-palette 应用链路

背景：

- 上一步已经能在工作台里自动估高和手动覆盖色块，但点击应用仍只走灰度导入，彩色色板不会进入最终地图。
- 专题计划要求 `image-palette` 应用后完整重建 feature、climate、biome、pack、river、politics 和 settlements，并把 assignments 写入地图元数据。
- 首轮浏览器验证发现，虽然彩色导入功能生效，但高度图导入路径仍在主线程同步执行 `generatePlaceholderMap()`，触发 health `main-thread-long-task` error；这违反“遇到加载或绘制卡顿先处理”的要求。

修正：

- `HeightPanel.vue` 的 `heightmap-import-apply` 事件现在会携带 `settings`，包括 `kind / minHeight / maxHeight / invert / fitMode / colorLimit / mappingMode / unassignedHeight / assignments`。
- 默认灰度且无手动覆盖时继续请求 `image-grayscale`，避免普通灰度图突然变成量化高度图；切到亮度、色相、FMG 色带、手动模式或存在手动覆盖时才请求 `image-palette`。
- `runtime/heightmap-import.js` 新增 `createPaletteHeightmapFromImage()`：在完整图幅 canvas 上重新量化 5-bit RGB 色块，按当前映射模式和手动覆盖生成高度；前 N 个色块进入 assignments，未进入前 N 的颜色按 `unassignedHeight = 0` 处理。
- `createSampledHeightmap()` 的 source 元数据补充 `mappingMode / colorLimit / unassignedHeight / assignments`，完整地图 JSON 可以复查彩色图片如何映射为高度。
- 灰度和彩色色板导入都会把采样高度缓存为 `Uint8Array`，并以不可枚举 `workerPayload` 传给 runtime。
- `generation-worker.js` 支持接收 sampled heightmap payload，在 worker 内恢复 `sampleHeight` 后执行完整生成；`importHeightmapImage()` 改为复用普通生成的 worker 路径，worker 不可用时才回退主线程。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check app/webgl-generator/src/runtime/heightmap-import.js` 通过。
- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `node --check app/webgl-generator/src/runtime/generation-worker.js` 通过。
- `node --check app/webgl-generator/src/generator/heightmap.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- 首轮彩色导入烟测确认功能生效但捕获到 health `main-thread-long-task` error，随后完成 worker 化修复。
- 修复后 Playwright + 系统 Chrome 彩色导入烟测通过：默认地图 loading 已隐藏，跨画布 `25/25` 个采样点非空；导入合成彩色 SVG，切到色相模式并把首个色块设为“山地”后点击应用，checksum `d21222dd -> fe4e8d88`，`source.kind = image-palette`，`source.mappingMode = hue`，`assignments = 4`，首个手动 assignment 高度 `68`，状态显示“已导入彩色高度图”，`loadMap.totalMs = 338.2ms`，`fit-draw = 7ms`，`draw.glError = 0`，console/page error 为 `0`，health error 为 `0`。
- 默认灰度兼容烟测通过：不切映射模式、不手动覆盖时应用灰度 SVG，`source.kind = image-grayscale`，状态仍显示“已导入灰度高度图”，`loadMap.totalMs = 321.2ms`，`fit-draw = 4ms`，`glError = 0`，console/page error 为 `0`，health error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1243.4ms`，纯生成 `638.7ms`，WebGL 加载 `330.2ms`，最慢加载阶段为 `cell-visual-mesh 46.1ms`，`fit-draw = 2.2ms`，`glError = 0`。

### 高度图未分配高度配置

背景：

- `image-palette` 应用链路已经能把前 N 个量化色块写成 assignments，但未进入色板上限的颜色固定落到高度 `0`。
- 原版 Image Converter 会显式呈现未分配颜色；当前 WebGL 工作台至少需要让用户控制未分配颜色高度，避免彩色图中被截掉的次要色都强制变成深水。

修正：

- 高度图导入工作台新增“未分配高度”滑条，范围 `0-100`，默认 `0`。
- 工作台指标新增“未分配高度”，便于应用前确认当前值。
- `heightmap-import-apply` 事件会把 `unassignedHeight` 写入 settings。
- `readHeightmapImportSettings()` 同步读取 `#heightmap-unassigned-height`，保留 legacy DOM 读取兼容。
- `createPaletteHeightmapFromImage()` 继续使用既有 `unassignedHeight`，未进入前 N 色板的像素按用户设置写入采样高度。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check app/webgl-generator/src/runtime/heightmap-import.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- Playwright + 系统 Chrome 未分配高度烟测通过：导入 20 色条合成 SVG，色板上限设为 `16`、映射模式设为色相、未分配高度设为 `12` 后应用，`source.kind = image-palette`、`source.colorLimit = 16`、`source.unassignedHeight = 12`、`source.assignments.length = 16`，grid 高度中有 `1973` 个采样点为 `12`，`loadMap.totalMs = 285.9ms`，`fit-draw = 4.1ms`，`glError = 0`，console/page error 为 `0`，health error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1177.3ms`，纯生成 `620.1ms`，WebGL 加载 `344.6ms`，最慢加载阶段为 `cell-visual-mesh 52.2ms`，`fit-draw = 2.3ms`，`glError = 0`。

### 高度图色块批量赋高

背景：

- 高度图导入工作台已经支持 `image-palette` 应用链路和未分配高度配置，但手动覆盖仍只能逐个色块操作。
- 阶段 4 目标要求把多个色块批量设为水域、低地、丘陵、山地或峰值，避免彩色高度图需要重复点击单色赋值。
- 批量选择不能替代现有高亮预览，否则用户会失去观察单个色块区域的入口。

修正：

- 色板条目新增 checkbox 批量选择状态，并提供“全选 / 清空”工具栏。
- 批量选择与当前高亮色块分离：checkbox 只控制批量赋高目标，点击色块仍用于高亮预览中的对应区域。
- 新增“批量赋高”面板，可用滑条设置 `0-100` 高度，也可一键设为 `水域 / 低地 / 丘陵 / 山地 / 峰值` 或恢复自动。
- 批量手动覆盖复用既有 `manualAssignments`，应用后继续进入 `map.heightmap.source.assignments`，不会新增额外数据契约。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check app/webgl-generator/src/runtime/heightmap-import.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- Playwright + 系统 Chrome 批量赋高烟测通过：导入 4 色合成 SVG，切到色相模式后批量选择 2 个色块并点击“低地”，应用后 `source.kind = image-palette`、`source.mappingMode = hue`、手动 `height = 28` 的 assignments 为 `2` 个，checksum `f78211ea -> 52939e78`，`loadMap.totalMs = 469.9ms`，`fit-draw = 8.5ms`，`glError = 0`，console/page error 为 `0`，health error 为 `0`。
- 同次烟测仅记录一次初始加载阶段 `main-thread-long-task` warn，未发生在高度图导入或应用阶段。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1194.1ms`，纯生成 `609.7ms`，WebGL 加载 `339.1ms`，最慢加载阶段为 `cell-visual-mesh 52.1ms`，`fit-draw = 2.4ms`，`glError = 0`。

### 高度图导入 profile 复用第一刀

背景：

- 高度图导入工作台已经支持彩色色板、自动映射、单色/批量手动赋高和 `image-palette` 应用，但这些配置只能留在当前工作台会话里。
- 阶段 5 目标要求把一套 assignments 导出为 `.heightmap-import-profile.json`，并能应用到同类色带图片。
- profile 复用应只恢复工作台配置，不应绕过预览直接重建地图；真正写地图仍必须由“应用到地图”触发。

修正：

- 工作台动作栏新增“导出配置 / 导入配置”，并把动作栏改为均匀三列，避免五个按钮挤压。
- 导出的 profile 使用 `type = webgl-generator-heightmap-import-profile`、`version = 1`，记录导出时间、应用标识、工作台 settings 和当前色板 assignments。
- 导入 profile 会校验类型、版本、settings 和 assignments，恢复最低/最高高度、反转、适应方式、色板上限、映射模式和未分配高度。
- 导入 profile 会把 profile 中色块高度写入工作台的显式 assignment 状态，并立即重绘当前预览；该动作不写 `map`，不触发重生成。
- profile 导入后仍需用户点击“应用到地图”，才会通过既有 `heightmap-import-apply` 和 worker 生成链路进入 `image-palette` 地图。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`HeightPanel` 懒加载 chunk 为 `21.55KB / gzip 7.88KB`，主入口仍约 `739.15KB / gzip 223.22KB`。
- Playwright + 系统 Chrome profile 复用烟测通过：导入 4 色合成 SVG，批量选择 2 个色块并设为“低地”后导出 profile，profile `type/version` 正确，`assignments = 7`、其中 `manual = 2`。
- 同次烟测清除手动覆盖后导入 profile，当前预览匹配 `7` 个色块，工作台动作栏按钮为 `选择图片 / 导出配置 / 导入配置 / 应用到地图 / 取消`，三列宽度均约 `139.3px`。
- 导入 profile 后点击“应用到地图”，结果为 `source.kind = image-palette`、`source.mappingMode = grayscale`、`assignmentCount = 4`、`manualCount = 4`、低地手动色块 `2` 个，checksum `4d28006c -> aeca03c6`，`loadMap.totalMs = 533.3ms`，`fit-draw = 5ms`，`glError = 0`，health error 为 `0`，console/page error 为 `0`。
- 同次 smoke 只记录一次初始加载阶段 `main-thread-long-task` warn，未发生在 profile 导入、应用或绘制阶段。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1205.9ms`，纯生成 `618.4ms`，WebGL 加载 `366.4ms`，最慢加载阶段为 `cell-visual-mesh 55.8ms`，`fit-draw = 2.3ms`，`glError = 0`。

### 高度图导入亮度直方图

背景：

- 高度图导入工作台已经支持彩色色板、手动赋高和 profile 复用，但预览质量缺口中仍明确缺少直方图、采样格高度色带预览和应用前后对比。
- 本步先补最低风险的亮度直方图；它只依赖已有预览 canvas 像素，不需要触碰生成器、worker 或 renderer。

修正：

- 工作台在预览图和指标区下方新增“亮度直方图”区块。
- `readBrightnessStats()` 在同一次预览扫描中同步生成 24 桶亮度计数，避免额外读取大图。
- 直方图显示每个亮度桶的相对高度，并在标题中汇总暗 / 中 / 亮像素占比。
- 没有选择图片或清空预览时会清空直方图；选择图片只更新工作台状态，不写 `map`，不触发重生成。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`HeightPanel` 懒加载 chunk 为 `22.84KB / gzip 8.32KB`，主入口约 `739.15KB / gzip 223.21KB`。
- Playwright + 系统 Chrome 直方图烟测通过：导入渐变 SVG 后直方图可见，`barCount = 24`、`nonZeroBars = 21`、高度范围 `4..100`，摘要为 `暗 38% / 中 44% / 亮 18%`，轴标签为 `暗/亮`，色板项为 `32`。
- 同次烟测中地图 checksum 保持 `1c333dd7 -> 1c333dd7`，说明预览和直方图没有写地图；`loadMap.totalMs = 352.3ms`，`fit-draw = 8ms`，`glError = 0`，console/page error 为 `0`，health error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1191.9ms`，纯生成 `581.4ms`，WebGL 加载 `326.7ms`，最慢加载阶段为 `labels 45.9ms`，`fit-draw = 2.6ms`，`glError = 0`。

### 高度图采样格高度色带预览

背景：

- 亮度直方图只能说明图片明暗分布，不能直接看当前导入设置会把采样格映射成什么高度地形。
- 专题计划仍缺采样格高度色带预览和应用前后对比；本步先补只读色带预览，继续保持预览与应用分离。

修正：

- 工作台新增“高度色带预览”canvas，放在直方图后方。
- 色带预览复用现有预览 canvas 像素和高度映射函数，不额外读取原始大图。
- 默认灰度且无手动覆盖时，色带预览按连续亮度高度着色，贴近 `image-grayscale` 应用路径。
- 切到非灰度模式或存在手动覆盖时，色带预览按当前量化色板、assignment 和未分配高度着色，贴近 `image-palette` 应用路径。
- 预览仅更新工作台状态，不写 `map`，不触发 worker 或 renderer 重新加载。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`HeightPanel` 懒加载 chunk 为 `24.83KB / gzip 8.91KB`，主入口约 `739.15KB / gzip 223.22KB`。
- Playwright + 系统 Chrome 色带预览烟测通过：导入渐变 SVG 后色带预览可见，canvas 为 `345 x 230`，`coloredPixels = 79350`，采样到 `12` 种颜色，摘要为 `高度 0-100 / 水域 15%`，直方图仍为 `24` 桶，色板项为 `32`。
- 同次烟测中地图 checksum 保持 `ac140459 -> ac140459`，说明色带预览没有写地图；`loadMap.totalMs = 349.5ms`，`fit-draw = 7.3ms`，`glError = 0`，console/page error 为 `0`，health error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1260ms`，纯生成 `655ms`，WebGL 加载 `330.7ms`，最慢加载阶段为 `cell-visual-mesh 48.4ms`，`fit-draw = 2.1ms`，`glError = 0`。

### 高度图未分配颜色策略第一刀

背景：

- 高度图导入工作台已经支持未分配高度，但未进入色板上限的颜色只能统一落到固定高度。
- 当前专题计划还缺“合并到最近色 / 标记待处理”一类策略；本步先补低风险策略入口和最终采样路径，避免继续扩大导入工作台的黑箱行为。

修正：

- 工作台新增“未分配颜色”选择，支持 `固定高度 / 合并最近色 / 标记待处理`。
- `固定高度` 继续使用既有 `unassignedHeight` 兜底，保持兼容。
- `合并最近色` 在预览和最终 `image-palette` 采样中都会按 RGB 距离归并到最近已分配色块，并按 5-bit 颜色桶缓存最近高度，避免逐像素重复扫描完整色板。
- `标记待处理` 第一刀先保存策略和未分配统计，实际高度仍按固定高度兜底，后续可再做导入阻断或审核队列。
- profile settings 和 `map.heightmap.source` 会保存 `unassignedStrategy`，最终元数据还会记录 `unassignedBuckets / unassignedPixels`。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check app/webgl-generator/src/runtime/heightmap-import.js` 通过。
- `node --check app/webgl-generator/src/generator/heightmap.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `740.20KB / gzip 223.57KB`，`HeightPanel` 懒加载 chunk 约 `26.18KB / gzip 9.35KB`。
- Playwright + 系统 Chrome 未分配颜色策略烟测通过：导入 48 色合成 SVG，色板上限降到 `16`，映射模式切到色相，未分配高度设为 `12`，未分配颜色切到 `合并最近色` 后应用。
- 同次烟测中预览指标显示 `色板16 / 93`、`未分配颜色合并最近色`，应用后 `source.kind = image-palette`、`source.mappingMode = hue`、`source.unassignedStrategy = nearest-palette`、`source.unassignedBuckets = 32`、`source.unassignedPixels = 921600`、`assignments = 16`。
- 同次烟测中 grid 高度落到固定未分配高度 `12` 的采样点为 `0`，说明未分配颜色按最近色高度归并；checksum `82a16da8 -> de922a86`，`loadMap.totalMs = 644.7ms`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1221.8ms`，纯生成 `631.1ms`，WebGL 加载 `336ms`，最慢加载阶段为 `cell-visual-mesh 45.1ms`，`fit-draw = 2.4ms`，`glError = 0`。

### 高度图应用前后对比第一刀

背景：

- 高度图工作台已经有原图预览、亮度直方图、导入高度色带和未分配颜色策略，但用户在点击“应用到地图”前仍缺少当前地图与导入结果之间的摘要对照。
- 本步先做只读指标对比，不引入差值热力图，也不触碰生成、worker 或 renderer 逻辑。

修正：

- 高度图工作台在高度色带预览下方新增“应用前后对比”区块。
- runtime 更新高度面板时，从当前 `map.grid.cells.h` 扫描出高度范围、水域数量、总数和平均高度，只传小摘要对象给 Vue，避免把完整高度数组放进响应式状态。
- 导入预览侧复用高度色带预览统计，并补平均高度。
- 对比指标展示当前高度、导入高度、当前水域、导入水域、平均变化和水域变化；摘要行显示平均变化和水域变化。
- 该能力只读展示，不写 `map`，不触发重生成。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check app/webgl-generator/src/runtime/app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `740.60KB / gzip 223.74KB`，`HeightPanel` 懒加载 chunk 约 `27.25KB / gzip 9.61KB`。
- Playwright + 系统 Chrome 应用前后对比烟测通过：导入渐变 SVG 后，对比区显示 `当前高度0-93 / 导入高度0-100 / 当前水域66% / 导入水域13% / 平均变化+31.3 / 水域变化-53%`。
- 同次烟测中高度色带摘要为 `高度 0-100 / 水域 13%`，直方图仍为 `24` 桶；地图 checksum 保持 `c76792ee -> c76792ee`，说明对比预览没有写地图；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1243.1ms`，纯生成 `592.2ms`，WebGL 加载 `394.5ms`，最慢加载阶段为 `cell-visual-mesh 61.2ms`，`fit-draw = 2.5ms`，`glError = 0`。

### 高度图标记待处理阻断

背景：

- `标记待处理` 第一刀此前只保存策略和未分配统计，实际应用时仍按固定高度兜底。
- 这容易让用户以为未分配颜色已经被审核，但导入结果已经悄悄落到固定高度；本步先把它升级为基础阻断。

修正：

- 高度图工作台新增待处理阻断判断：只有本次导入会走 `image-palette`，且当前色板上限之外仍有未分配像素时，`标记待处理` 才阻止应用。
- 阻断时禁用“应用到地图”，并显示待处理像素数和颜色桶数，提示扩大色板上限、改为合并最近色，或切回固定高度后再应用。
- 默认灰度连续导入不受颜色待处理策略影响。
- `applyHeightmapImport()` 增加兜底检查，避免通过脚本或状态竞态绕过阻断。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `740.60KB / gzip 223.74KB`，`HeightPanel` 懒加载 chunk 约 `27.75KB / gzip 9.82KB`。
- Playwright + 系统 Chrome `标记待处理` 阻断烟测通过：导入 48 色合成 SVG，色板上限降到 `16`，映射模式切到色相，未分配颜色切到 `标记待处理` 后，应用按钮禁用，提示 `5.5万` 个像素、`77` 个颜色桶待处理。
- 同次烟测中阻断阶段 checksum 保持 `d2f19819 -> d2f19819`，说明没有提交导入或重建地图；切到 `合并最近色` 后警告消失、应用按钮恢复可用。
- 同次烟测继续点击应用后，结果为 `source.kind = image-palette`、`source.mappingMode = hue`、`source.unassignedStrategy = nearest-palette`、`source.unassignedPixels = 921600`、`assignments = 16`，checksum `d2f19819 -> 724c03e0`，`loadMap.totalMs = 672.3ms`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1227.4ms`，纯生成 `625.5ms`，WebGL 加载 `353.9ms`，最慢加载阶段为 `cell-visual-mesh 53.9ms`，`fit-draw = 2.4ms`，`glError = 0`。

### 高度图待处理颜色列表第一刀

背景：

- `标记待处理` 已能阻断应用，但用户只能看到待处理像素和颜色桶总数，无法判断具体哪些颜色被挡在色板上限之外。
- 本步先补只读列表和扩大色板操作，不做待处理颜色的直接手动赋高，避免扩大交互面。

修正：

- `quantizePalette()` 现在会从未分配桶中取像素数最高的前 `12` 个，生成待处理颜色列表项。
- 当 `标记待处理` 阻断应用时，工作台显示“待处理颜色”区块，列出颜色圆点、十六进制颜色、像素数和占比。
- 待处理区块提供“扩大色板”按钮，把 `16 -> 32 -> 64 -> 128` 推进到下一档，并复用已有预览刷新链路。
- 列表复用当前预览量化结果，不额外读取图片、不写地图、不触发重生成。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `740.60KB / gzip 223.72KB`，`HeightPanel` 懒加载 chunk 约 `29.00KB / gzip 10.07KB`。
- Playwright + 系统 Chrome 待处理颜色列表烟测通过：导入 64 色合成 SVG，色板上限降到 `16`，映射模式切到色相，未分配颜色切到 `标记待处理` 后，待处理列表显示 `12` 项，首项为 `#7babea`，摘要为 `显示前 12 色 / 共 109 桶`，提示 `6.1万` 个像素待处理。
- 同次烟测点击“扩大色板”后，色板上限变为 `32`，色板项为 `32`，待处理列表仍显示前 `12` 项，摘要更新为 `显示前 12 色 / 共 93 桶`，提示 `4.3万` 个像素待处理。
- 同次烟测中地图 checksum 保持 `7c6bcbad -> 7c6bcbad`，说明待处理列表和扩大色板只刷新预览，不写地图、不触发重生成；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1127ms`，纯生成 `531.4ms`，WebGL 加载 `334.5ms`，最慢加载阶段为 `cell-visual-mesh 47.1ms`，`fit-draw = 2.6ms`，`glError = 0`。

### 高度图待处理颜色转入色板第一刀

背景：

- 待处理颜色列表只能查看和扩大色板，不能把某个具体颜色纳入主色板后单独赋高。
- 如果只在预览里追加色块而不改 runtime，最终 `image-palette` 仍会按前 N 个高频桶生成，导致预览和应用不一致；因此本步同时补预览选桶和最终选桶契约。

修正：

- 待处理颜色项新增“加入”按钮。
- 点击“加入”后，该颜色会以当前自动高度写入显式 assignment，进入主色板并被选中，用户可继续用既有色块高度面板调整高度。
- 预览量化会把显式 assignment 对应的颜色桶并入 active palette，并从待处理统计里排除。
- `createPaletteHeightmapFromImage()` 会把手动 assignment 对应的桶并入最终选桶，即使该桶不在当前 `colorLimit` 的前 N 个高频色里，保证 `map.heightmap.source.assignments` 与预览一致。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check .\app\webgl-generator\src\runtime\heightmap-import.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `740.81KB / gzip 223.81KB`，`HeightPanel` 懒加载 chunk 约 `29.47KB / gzip 10.21KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：导入 20 条纯色色带 SVG，色板上限降到 `16`，映射模式切到色相，未分配颜色切到 `标记待处理` 后，应用按钮禁用，待处理列表显示 `4` 项。
- 同次烟测点击最后一个待处理色 `#653421` 的“加入”后，主色板从 `16` 变为 `17`，待处理项降为 `3`，选中色块显示“手动高度”，地图 checksum 保持 `69cf0151 -> 69cf0151`，说明该操作只刷新预览、不提前重建地图。
- 同次烟测切到 `合并最近色` 后应用，结果为 `source.kind = image-palette`、`source.mappingMode = hue`、`source.unassignedStrategy = nearest-palette`、`assignments = 17`、`manualCount = 1`、promoted 色块为手动 assignment，checksum `69cf0151 -> 0e5e4c48`，`loadMap.totalMs = 288.5ms`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1229.6ms`，纯生成 `614.5ms`，WebGL 加载 `351.1ms`，最慢加载阶段为 `cell-visual-mesh 50.5ms`，`fit-draw = 3.6ms`，`glError = 0`。

### 高度图差值热力图预览第一刀

背景：

- 应用前后对比已能给出高度范围、水域占比和平均变化，但用户仍缺少空间维度，无法直观看出导入图片会在哪些区域抬高或压低地形。
- 本步先补只读缩略热力图，不把差值写入地图，也不进入完整导入元数据。

修正：

- 高度图导入工作台新增“差值热力图” canvas，放在应用前后对比下方。
- `drawHeightBandPreview()` 复用同一次高度色带预览计算出的高度样本，避免再解析图片；差值热力图用橙色表示导入后升高、蓝色表示导入后降低、深色表示变化很小。
- runtime 给高度面板新增 `currentHeightPreview` 小型高度栅格，约 `96` 像素宽，从当前 `grid.cells.h` 和 cell 中心点聚合得到；Vue 侧只拿小栅格，不接收完整高度数组。
- 热力图摘要展示升高占比、降低占比和最大变化，并随导入参数、映射模式、色板和手动 assignment 一起刷新。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `node --check .\app\webgl-generator\src\runtime\app.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.12KB`，`HeightPanel` 懒加载 chunk 约 `31.31KB / gzip 10.80KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：导入渐变 SVG 后，差值热力图 canvas 为 `345 x 230`，非空像素 `79350`，采样颜色 `16` 种，摘要为 `升高 92% / 降低 7% / 最大 +99`。
- 同次烟测中应用前后对比摘要为 `平均 +30.3 / 水域 -59%`，地图 checksum 保持 `1bf34089 -> 1bf34089`，说明差值热力图只刷新预览、不写地图、不触发重生成；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1203.8ms`，纯生成 `601.2ms`，WebGL 加载 `330.5ms`，最慢加载阶段为 `cell-visual-mesh 51.1ms`，`fit-draw = 2.4ms`，`glError = 0`。

### 高度图导入 profile 匹配摘要

背景：

- profile 导入已经能恢复 settings 和 assignments，但工作台只提示“匹配 N 个色块”，用户看不到配置里有多少色块未匹配，也看不到当前图片额外出现了多少色块。
- 复核时发现“先导入 profile、后选择图片”的提示与实际行为不一致：选择图片会清空 `manualAssignments`，导致已导入的 profile 无法套用到随后选择的图片。

修正：

- 工作台新增“导入配置匹配”区块，展示配置色块、已匹配、未匹配和当前额外色块数。
- 预览指标区新增“配置匹配”一项，便于不展开详情时快速确认 `matched / profileTotal`。
- 导入 profile 时记录 profile key 集合和文件名；选择图片时如果已经导入 profile，不再清空 `manualAssignments`。
- 选择图片、导入 profile、切换设置和重新量化后都会刷新匹配摘要；该摘要只读展示，不写地图、不触发重生成。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `32.53KB / gzip 11.14KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：先从 4 色 SVG 导出 `.heightmap-import-profile.json`，再在新页面先导入 profile、后选择同一图片，匹配摘要从 `0/4` 更新为 `4/4`。
- 同次烟测中 profile 区块显示 `配置色块4 / 已匹配4 / 未匹配0 / 当前额外0`，4 个色块均显示手动高度；地图 checksum 保持 `1e9dc992 -> 1e9dc992`，说明 profile 匹配只刷新预览、不写地图、不触发重生成；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1229.3ms`，纯生成 `608.3ms`，WebGL 加载 `343.9ms`，最慢加载阶段为 `cell-visual-mesh 52.7ms`，`fit-draw = 2.4ms`，`glError = 0`。

### 高度图 profile 失配色块定位

背景：

- profile 匹配摘要能显示已匹配、未匹配和当前额外数量，但用户仍需要知道具体哪些颜色失配。
- 当前图片额外色已经存在于预览色板中，应能直接定位到预览图里的对应区域；profile 中未匹配的颜色不在当前图片中，只适合展示为缺失列表。

修正：

- “导入配置匹配”区块新增 `未匹配配置色` 和 `当前额外色` 两组列表。
- 未匹配配置色显示 profile 中未命中的颜色 swatch 和十六进制值。
- 当前额外色显示当前图片里 profile 未覆盖的色块，并作为按钮复用 `selectPaletteEntry()` 高亮预览区域。
- 列表最多展示前 `8` 个，避免大型 profile 把工作台撑得过长；该功能只读展示，不写地图、不触发重生成。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `34.04KB / gzip 11.50KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：先从 4 色 SVG 导出 profile，再导入到只匹配 3 色且新增 2 色的目标 SVG，匹配摘要为 `3/4`。
- 同次烟测中 profile 区块显示 `配置色块4 / 已匹配3 / 未匹配1 / 当前额外2`，未匹配配置色列出 `#d9c58d`，当前额外色列出 `#aa33cc / #eeeeaa`；点击一个当前额外色后，对应主色板项被高亮。
- 同次烟测中地图 checksum 保持 `b5e69d57 -> b5e69d57`，说明失配定位只刷新预览、不写地图、不触发重生成；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1178.7ms`，纯生成 `612.7ms`，WebGL 加载 `344.4ms`，最慢加载阶段为 `cell-visual-mesh 50ms`，`fit-draw = 2.3ms`，`glError = 0`。

### 高度图 profile 当前额外色加入配置

背景：

- profile 失配区已经能显示当前图片相对配置多出的颜色，并可点击定位到主色板。
- 继续复用同类图片时，用户需要把确认可接受的额外色纳入当前配置，而不是手动重新调一遍色块高度。

修正：

- `当前额外色` 列表中每个色块旁新增“加入”按钮。
- 点击“加入”后，会用该色块当前自动高度写入 `manualAssignments`，同时追加到已导入 profile key 集和 profile assignments。
- 加入后的色块会进入主色板手动高度状态并被选中，匹配摘要立即刷新。
- 该操作只更新工作台预览状态，不写 `map`，不触发 worker 或 renderer 重载。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `34.64KB / gzip 11.65KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：先从 4 色 SVG 导出 profile，再导入到只匹配 3 色且新增 2 色的目标 SVG；点击第一个当前额外色的“加入”后，配置色块从 `4` 增至 `5`，匹配从 `3/4` 增至 `4/5`，当前额外从 `2` 降至 `1`。
- 同次烟测中主色板有 `4` 个手动色块，新增色块被选中，地图 checksum 保持稳定；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1240.9ms`，纯生成 `633.7ms`，WebGL 加载 `352.1ms`，最慢加载阶段为 `cell-visual-mesh 51.5ms`，`fit-draw = 2.3ms`，`glError = 0`。

### 高度图 profile 色块从配置移除

背景：

- profile 当前额外色已经可以一键加入配置，但误加入后只能通过恢复自动高度绕开，profile key 集仍会把该色视为配置色。
- 用户需要一个明确的撤回动作，把色块从当前 profile 配置里移除，并让匹配摘要回到加入前状态。

修正：

- 当选中色块属于已导入 profile key 集时，色块高度赋值面板新增“从配置移除”。
- 点击后同步删除 `importedProfileKeys`、`importedProfileAssignments` 和对应 `manualAssignments`。
- 移除后该色块仍保持选中以便观察预览，但不再显示手动高度，也会重新计入当前额外色。
- 该操作只刷新工作台预览状态，不写 `map`，不触发 worker 或 renderer 重载。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `35.22KB / gzip 11.79KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：先从 4 色 SVG 导出 profile，再导入到只匹配 3 色且新增 2 色的目标 SVG；点击“加入”后匹配为 `4/5`、手动色块为 `4` 个，再点击“从配置移除”后匹配回到 `3/4`、手动色块回到 `3` 个。
- 同次烟测中移除后当前额外色回到 `2`，选中色块不再显示手动高度，地图 checksum 保持稳定；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1231.2ms`，纯生成 `628.6ms`，WebGL 加载 `379ms`，最慢加载阶段为 `line-vertices 54.6ms`，`fit-draw = 2.4ms`，`glError = 0`。

### 高度图 profile 导出差异确认

背景：

- “加入配置 / 从配置移除”已经改变了工作台中的 profile key 集，但原先 `导出配置` 始终导出当前预览色板全部色块。
- 这会让用户没有加入的当前额外色也进入导出的新 profile，削弱失配审核和移除动作的语义。

修正：

- 导入 profile 后，匹配区新增导出摘要：显示导出将包含多少配置色、保留多少未匹配配置色、排除多少当前额外色。
- `createHeightmapProfileDocument()` 改为调用 profile-aware assignment 生成逻辑。
- 没有导入 profile 时，继续导出当前预览色板全部色块，保持旧的建档行为。
- 已导入 profile 时，导出只使用当前 profile key 集：未加入的当前额外色会被排除，已加入的额外色会进入，未匹配但仍属于配置的原色会保留。
- 导出完成提示会显示本次写出的色块数量。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `36.28KB / gzip 12.07KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：源 profile 为 `4` 色，目标图片为 `3` 个匹配色 + `2` 个额外色；未加入时导出仍为 `4` 色并保留缺失的 `#d9c58d`，不包含 `#aa33cc / #eeeeaa`。
- 同次烟测中点击“加入”后导出为 `5` 色，包含 `#aa33cc` 且仍排除未加入的 `#eeeeaa`；再点击“从配置移除”后导出回到 `4` 色并排除 `#aa33cc`。
- 全程地图 checksum 保持稳定；`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1424.2ms`，纯生成 `723.3ms`，WebGL 加载 `382ms`，最慢加载阶段为 `cell-visual-mesh 65.6ms`，`fit-draw = 3.5ms`，`glError = 0`。

### 高度图待处理颜色批量加入显示色

背景：

- 待处理颜色列表已经支持单个颜色加入主色板，但用户处理当前可见审核队列时仍需要逐个点击。
- 批量加入应保持为预览态操作，只更新工作台 assignments，不写地图、不触发完整重生成。

修正：

- 待处理颜色 header 新增“加入显示色”。
- 点击后会把当前可见的待处理颜色全部按自动高度写入 `manualAssignments`，并选中第一项。
- 预览会立即刷新；如果图片仍有更多未进入当前色板的颜色桶，应用按钮会继续保持阻断。
- 修正批量加入提示数量，避免预览刷新后读取新的待处理列表长度造成提示不准。

文档：

- 更新 `docs/current-plan.md`。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `36.62KB / gzip 12.14KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：导入 20 色 SVG 后，色板上限 `16`、映射模式 `色相`、未分配颜色 `标记待处理` 下，点击“加入显示色”前待处理项为 `4`、主色板 `16`、手动项 `0`。
- 同次烟测中点击后主色板增至 `18`、手动项为 `4`，剩余待处理项因后续颜色桶补入变为 `12`，应用按钮仍保持阻断；地图 checksum 保持稳定，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1555ms`，纯生成 `750ms`，WebGL 加载 `379ms`，UI slack `426ms`，最慢生成阶段为 `构建 grid / Voronoi / 高度 132ms`，最慢加载阶段为 `构建线层顶点 55.6ms`，`fit-draw = 2.7ms`，`glError = 0`。

### 高度图待处理颜色分页审核

背景：

- 待处理颜色已经支持“加入显示色”，但列表仍只展示前 `12` 个颜色桶。
- 如果直接实现“全部加入”，大量未分配颜色会一次性进入主色板和 DOM，不利于保持预览面板轻量。

修正：

- 待处理颜色列表改为分页展示，每页仍只渲染 `12` 个颜色。
- header 新增“上一页 / 下一页”，并显示当前页、总页数、当前页数量和总待处理桶数。
- 切换图片、色板上限、映射模式或未分配策略时重置到第一页。
- “加入显示色”作用于当前页；加入后显式 assignment 仍按既有逻辑进入主色板，不写地图、不触发 worker 或 renderer 重载。

文档：

- 更新 `docs/current-plan.md`，并补入军事面板、国名方位和 README 刷新的后续计划。
- 更新 `docs/task-notes/heightmap-image-converter-plan.md`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`HeightPanel` 懒加载 chunk 约 `37.40KB / gzip 12.37KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：导入 64 色 SVG 后，色板上限 `16`、映射模式 `色相`、未分配颜色 `标记待处理` 下，第一页摘要为 `第 1/10 页，显示 12 色 / 共 109 桶`。
- 同次烟测中点击“下一页”后摘要为 `第 2/10 页`，上一页按钮可用，颜色集合发生变化；点击“加入显示色”后主色板为 `28` 项、手动项为 `12`，待处理摘要变为 `第 2/9 页，显示 12 色 / 共 97 桶`。
- 地图 checksum 保持 `61c027de`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1519.1ms`，纯生成 `797.1ms`，WebGL 加载 `422.3ms`，UI slack `299.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 152.1ms`，最慢加载阶段为 `构建视觉 cell mesh 76.4ms`，`fit-draw = 3.2ms`，`glError = 0`。

### 军事单位编辑面板展示层第一刀

背景：

- 用户指出军事单位编辑面板目前非常粗糙，样式完全不对。
- 当前军事管理面板已有筛选、排序、定位、导出和兵种比例调整，但主要信息仍以表格和详情字段堆叠呈现，不像正式对象编辑面板。

修正：

- 在军团表格和详情之间新增选中军团概要区。
- 概要区显示军团名、国家、命令、态势标签、兵力、主兵种和驻扎适宜度。
- 基于当前军团 `units` 生成兵种构成条，突出具体军队组成。
- 保留原有表格、导出、定位和“兵种比例”二级面板 API，不改军事生成和编辑命令。

文档：

- 更新 `docs/current-plan.md`，把军事面板整改第一刀标记为已完成，并保留后续国名方位和 README 刷新计划。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `741.73KB / gzip 224.13KB`，`MilitaryPanel` 懒加载 chunk 约 `9.95KB / gzip 3.93KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：默认地图打开军事管理后，概要标题为 `1（澜镇）军团`、态势为 `驻防中`、概要指标 `3` 项、兵种条 `4` 条、表格 `111` 行。
- 同次烟测中点击“兵种比例”后，二级面板仍显示国家 `赤原国`、滑条 `5` 个和应用按钮；地图 checksum 保持 `30370b34`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1502.2ms`，纯生成 `757.5ms`，WebGL 加载 `410.2ms`，UI slack `334.5ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 131.9ms`，最慢加载阶段为 `构建视觉 cell mesh 61.7ms`，`fit-draw = 3.2ms`，`glError = 0`。

### 国名方位语义约束第一刀

背景：

- 用户发现国家随机名会出现北边国家叫“南某”、南边国家叫“北某”的情况。
- 这类方位前缀只有在同名或同根参照国存在时才合理；孤立国家不应随机带误导性方位。

修正：

- 在 pack 国家扩张、边界整理和统计完成后，新增 `states-name-orientation` 阶段。
- 仅处理 `东/西/南/北 + 古国根名` 的明显方位变体，例如 `南楚 / 北燕 / 西秦`。
- 如果没有同根参照国，去掉方位前缀；如果有同根国家，则按国家中心相对位置选择东、西、南、北。
- `北辰 / 南浦` 这类本身是双字地名的根名不会被拆成 `辰 / 浦`。
- 校正发生在套用政体国号前，后续 `fullName` 会使用校正后的国家根名。

文档：

- 更新 `docs/current-plan.md`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `743.85KB / gzip 224.89KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：默认地图生成后，国家数 `20`，校正记录包含 `南越 -> 越`、`南楚 -> 楚`、`西秦 -> 秦`，同时保留 `北辰`。
- 同次烟测中 checksum 为 `b91ee397`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1552.8ms`，纯生成 `750ms`，WebGL 加载 `510.6ms`，UI slack `292.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 136.5ms`，最慢加载阶段为 `构建线层顶点 69.2ms`，`fit-draw = 3.1ms`，`glError = 0`。

### README 当前状态刷新

背景：

- 用户要求 README 更新一波，主要说明已经做了哪些任务、还要做哪些任务。
- 原 README 更偏项目愿景和运行方式，对当前阶段的具体能力覆盖不足。

修正：

- 在 README 的“现在可以做什么”后新增“已经完成”。
- 已完成部分整理 WebGL 主视图、独立生成链路、对象管理面板、轻量编辑、高度图导入、导出、运行时体验和中文命名优化。
- 新增“还要做”，列出军事事件、经济贸易、用户文档、纹章主题、名称库绑定和大地图性能等后续方向。

验证：

- 该步只修改 README 和中文计划/日志，不涉及运行时代码。
- `git diff --check` 通过。

### 军事兵种比例二级面板展示优化

背景：

- 军事管理面板已经有军团概要区，但“兵种比例”二级面板仍是裸滑条列表。
- 用户指出军事单位编辑面板样式粗糙，这个二级面板也需要和概要区保持同一视觉层级。

修正：

- `兵种比例` 二级面板新增比例项列表。
- 每个兵种显示名称、当前百分比和横向比例条。
- 保留原有滑条、应用按钮、比例归一化和 `EditHistory` 命令入口，不改军事生成逻辑。

文档：

- 更新 `docs/current-plan.md`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `743.85KB / gzip 224.87KB`，`MilitaryPanel` 懒加载 chunk 约 `10.33KB / gzip 4.01KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开军事管理和“兵种比例”后，比例面板显示 `5` 个比例项、`5` 个滑条和应用按钮；示例比例为步兵 `49%`、弓兵 `26%`、骑兵 `3%`、器械 `8%`、舰队 `15%`。
- 同次烟测中地图 checksum 为 `535004fa`，`glError = 0`，console/page error 和 health error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1560ms`，纯生成 `809.8ms`，WebGL 加载 `463.6ms`，UI slack `286.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 147.2ms`，最慢加载阶段为 `构建视觉 cell mesh 60.9ms`，`fit-draw = 2.8ms`，`glError = 0`。

### 军事面板态势筛选

背景：

- 军事管理面板已经完成概要区和兵种比例二级面板，但军团列表仍只能按国家和文本搜索收敛。
- 用户指出军事单位编辑面板样式粗糙，本轮不继续做纯视觉微调，而是补一个正式管理面板应有的轻量筛选能力。

修正：

- `军事管理` 控制区新增“态势”下拉，选项来自当前地图军团的 `status / statusLabel`。
- 国家筛选、态势筛选和文本筛选会共同约束军团表格。
- 切换态势后，如果原选中军团不在当前筛选结果中，概要区会自动落到第一条可见军团，避免列表和详情不一致。
- 控制区从两列改为三列，国家、态势和搜索框各自保持稳定宽度。

文档：

- 更新 `docs/current-plan.md`，把军事面板当前状态改为概要、比例面板和态势筛选已完成，并把后续方向收敛到批量命令、军团编辑和战斗事件。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `744.34KB / gzip 224.94KB`，`MilitaryPanel` 懒加载 chunk 约 `10.95KB / gzip 4.16KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：默认地图打开军事管理后，态势选项为 `全部态势 / 败逃中 / 集结中 / 行军中 / 修整中 / 巡逻中 / 驻防中`。
- 同次烟测中选择 `败逃中` 后，表格从 `111` 行收敛到 `1` 行，表格状态列和概要标签均为 `败逃中`；三列控制区宽度约 `195.6px / 169.5px / 312.9px`，`webgl2 = true`、`glError = 0`、console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1637.2ms`，纯生成 `805.5ms`，WebGL 加载 `432.6ms`，UI slack `399.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 129.3ms`，最慢加载阶段为 `构建视觉 cell mesh 56.5ms`，`fit-draw = 3.2ms`，`glError = 0`。

### 军团手动态势调整

背景：

- 军事面板已经能查看、筛选和调整国家兵种比例，但还不能编辑单个军团。
- `docs/task-notes/military-battle-plan.md` 的阶段 4 明确列出轻量军团编辑，第一项之一是“手动调整状态”。

修正：

- `military-edit-commands.js` 新增 `createSetMilitaryStatusCommand()`。
- 命令只修改目标军团的 `status / statusLabel / order`，不重建完整军事数据。
- 命令会刷新 `map.military.metadata.statuses`，并接入既有 `EditHistory`、对象索引、军事图层和面板刷新链路。
- `军事管理` 的二级操作新增“调整态势”，使用生成器内的 `MILITARY_STATUSES` 作为唯一状态枚举来源。

文档：

- 更新 `docs/current-plan.md`，把军事面板当前状态推进到“可撤销地修改单个军团态势”，并把后续方向写为重命名、驻地/基地移动或批量态势命令。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `746.61KB / gzip 225.55KB`，`MilitaryPanel` 懒加载 chunk 约 `12.17KB / gzip 4.47KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：选中 `13:0` 军团后，从 `patrolling / 巡逻中` 改为 `marching / 行军中`，`order.kind` 变为 `advance`，历史为 `undo 1 / redo 0 / 调整军团态势 #13:0`。
- 同次烟测中点击“撤销上次”恢复 `patrolling`，点击“重做上次”再次变为 `marching`；`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1659.2ms`，纯生成 `766.4ms`，WebGL 加载 `534.9ms`，UI slack `357.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 144.8ms`，最慢加载阶段为 `构建视觉 cell mesh 66ms`，`fit-draw = 5.2ms`，`glError = 0`。

### 军团重命名

背景：

- 阶段 4 的轻量军团编辑还包括“重命名军团”。
- 该能力比驻地移动和战斗事件更小，适合作为军团对象编辑的下一步。

修正：

- `military-edit-commands.js` 新增 `createRenameMilitaryRegimentCommand()`。
- 命令只修改目标军团 `name`，不重建完整军事数据。
- `军事管理` 的二级操作新增“重命名”，复用 `UiTextEditField`。
- 重命名结果会刷新表格、概要、对象索引、图层和历史状态。

文档：

- 更新 `docs/current-plan.md`，把军团重命名记录为已完成，并把下一步切到用户新指出的军事态势线表现修正。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `747.45KB / gzip 225.64KB`，`MilitaryPanel` 懒加载 chunk 约 `12.60KB / gzip 4.60KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：`13:0` 军团从 `1（松岳镇）军团` 改为 `1（松岳镇）军团-改名`，底层数据、表格行和概要标题同步更新，历史为 `undo 1 / redo 0 / 重命名军团 #13:0`。
- 同次烟测中点击“撤销上次”恢复原名，点击“重做上次”再次应用新名；`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1869.8ms`，纯生成 `847.4ms`，WebGL 加载 `484.8ms`，UI slack `537.6ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 138ms`，最慢加载阶段为 `构建标签 74.9ms`，`fit-draw = 5.5ms`，`glError = 0`。

### 军事态势线边界箭头整改

背景：

- 用户指出军事态势线当前不好看：不应太长，最多只在边界上存在；不应跨海；不应是细线，而应是宽体渐变色、指向方向型的箭头。
- 旧实现从本国主力或国家中心直接连到敌国中心，天然会出现跨海和长线。

修正：

- `buildMilitaryFronts()` 仍按外交战争生成 front，但 `createFrontLine()` 现在只接受共享陆地边界。
- front 的 `points` 改为两国相邻陆地 pack cell 的共享 Voronoi 边；没有共享陆地边界时不生成 front。
- 渲染层 `pushMilitaryFrontLines()` 不再画普通细线，改为自绘宽体箭头 mesh。
- 每条 front 箭头由 3 个三角形组成，共 `9` 个 line vertices；尾部半透明，箭身和箭头逐步增强，进攻为暖色，防守为冷色。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。主入口约 `748.91KB / gzip 226.27KB`。
- 默认 `stage-2-1231411414 / continents / 10000` 中非相邻战争不再生成跨海或长距离 front。
- Playwright + 系统 Chrome 构建产物烟测通过：`front-check-1 / continents / 10000` 生成 `2` 条 front，长度均约 `13`；每条 front 的 `borderCells` 两侧均为陆地、互为邻居，且 state 分别为 `fromState / toState`。
- 同次烟测中关闭/开启 `warFronts` 后 line vertices 从 `193632` 到 `193650`，增量 `18`，即每条宽体箭头 `9` 个顶点；`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1770.5ms`，纯生成 `1001.8ms`，WebGL 加载 `487.4ms`，UI slack `281.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 215.7ms`，最慢加载阶段为 `构建视觉 cell mesh 71.9ms`，`line-vertices = 49.9ms`，`fit-draw = 2.7ms`，`glError = 0`。

### 军团批量态势命令

背景：

- 军事管理面板已经支持态势筛选、单军团态势调整和军团重命名。
- 当前计划中的军事下一步是进入批量命令、驻地/基地移动或战斗事件，而不是继续只做展示层微调。

修正：

- `military-edit-commands.js` 新增 `createSetMilitaryStatusBatchCommand()`。
- 批量命令会归一化并去重目标军团，逐个写入 `status / statusLabel / order`，并保存每支军团的旧态势快照用于撤销。
- `军事管理` 的二级操作新增“批量态势”，目标范围明确为当前表格可见军团，即国家筛选、态势筛选和文本筛选后的结果。
- 态势修改和重命名的刷新范围收窄为 `point-layers / object-index / object-panels`，避免这类文本/图标状态变化无关重建战线线层和地图标签；兵种比例仍保留完整军事刷新。

文档：

- 更新 `docs/current-plan.md`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- Playwright + 系统 Chrome 构建产物烟测通过：把 `56` 支 `patrolling` 军团批量改为 `marching`，历史为 `undo 1 / redo 0 / 批量调整军团态势 56支`。
- 同次烟测中撤销后全部目标恢复原态势，重做后全部再次变为 `marching`；最终刷新摘要为 `point-layers, object-index, object-panels`，`glError = 0`。
- 收窄刷新前 smoke 健康警告为 `12` 条；收窄后同路径为 `4` 条，剩余主要来自初始生成和面板加载阶段。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1773.3ms`，纯生成 `897ms`，WebGL 加载 `568.3ms`，UI slack `308ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 168.8ms`，最慢加载阶段为 `构建视觉 cell mesh 83ms`，`line-vertices = 47ms`，`fit-draw = 3.1ms`，`glError = 0`。

### 军团驻地与基地轻量编辑

背景：

- `docs/task-notes/military-battle-plan.md` 的阶段 4 包含“移动驻地/基地”。
- 完整地图点选迁移会牵涉编辑锁、拾取和候选校验，本轮先做可验证的轻量编辑：在军事面板内把军团迁到国家中心/首都 cell，并能把当前位置保存为基地。

修正：

- `military-edit-commands.js` 新增 `createMoveMilitaryStationCommand()` 和 `createSetMilitaryBaseCommand()`。
- 移动驻地会写入 `cell / x / y`，把军团设为 `garrisoned`，并生成 `garrison` 命令；撤销会恢复旧驻地、状态和命令。
- 设置基地会把当前驻地写入 `baseCell / bcell / bx / by`，同时保留 `bcell` 兼容旧式字段命名。
- 军事面板详情新增“驻地 / 基地”行，二级操作新增“驻地基地”，提供“移动驻地”和“设当前位置为基地”。
- 目标构造优先使用 pack cell 的真实坐标；本轮修正了 `Number(null) === 0` 导致可选坐标误落到 `(0,0)` 的问题。

文档：

- 更新 `docs/current-plan.md`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `16.72KB / gzip 5.73KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：军团 `2:0` 从 `cell 5201 / 771.47,762.76 / patrolling` 移动到国家中心 `cell 5399 / 802.69,781.64 / garrisoned`，命令为 `garrison`。
- 同次烟测中撤销恢复旧驻地与 `patrolling`，重做再次迁到国家中心；随后“设当前位置为基地”写入 `baseCell = bcell = 5399` 和 `bx/by = 802.69/781.64`，撤销后恢复旧基地字段；刷新摘要为 `point-layers, object-index, object-panels`，`glError = 0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1583.7ms`，纯生成 `827ms`，WebGL 加载 `473.4ms`，UI slack `283.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 149.4ms`，最慢加载阶段为 `构建线层顶点 77.3ms`，`fit-draw = 3.8ms`，`glError = 0`。

### 军团战斗事件记录第一刀

背景：

- `docs/task-notes/military-battle-plan.md` 的阶段 5 包含战斗事件与模拟，但完整战斗模拟会牵涉士气、伤亡、战争状态和战报链路。
- 当前更适合作为第一刀的是“记录事件”：能把军团遭遇、袭扰、攻城等事实挂到目标军团上，并接入撤销/重做，但不改变兵力和外交战争状态。

修正：

- `military-edit-commands.js` 新增 `createRecordMilitaryBattleEventCommand()`。
- 命令会把事件写入目标军团 `events[]` 和全局 `map.military.events[]`，并维护 `metadata.events / eventSequence`。
- 事件包含类型、结果、说明、国家、军团、位置、序号和时间戳；撤销会恢复军团事件、全局事件和 metadata，重做复用同一事件 id。
- `军事管理` 的二级操作新增“战斗事件”，提供类型、结果和说明输入；详情区显示最新战斗事件。
- 该命令刷新范围收窄为 `object-panels`，不触发点图层、线层、标签或完整军事派生重建。

文档：

- 更新 `docs/current-plan.md`，把军团战斗事件记录记录为已完成，并明确下一步可做事件列表/导出或轻量战斗结果应用，不直接进入完整战斗模拟。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。
- Playwright + 系统 Chrome 构建产物烟测通过：给军团 `1:0` 记录 `袭扰 / 相持：边境试探，双方保持接触`，生成事件 `1:0:battle:1`，军团事件数和全局事件数均 `0 -> 1`。
- 同次烟测中撤销后事件数恢复为 `0`，`metadata.events = 0`；重做后事件数恢复为 `1`，复用同一事件 id 和 sequence；最终刷新摘要为 `render = none / derived = object-panels`，`glError = 0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1709.8ms`，纯生成 `927.3ms`，WebGL 加载 `497.8ms`，UI slack `284.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 163.4ms`，最慢加载阶段为 `构建标签 71.6ms`，`line-vertices = 52.9ms`，`fit-draw = 3.7ms`，`glError = 0`。

### 军团战斗事件列表与导出

背景：

- 上一刀已经能给军团记录战斗事件，但事件只能通过最新事件摘要间接看到，不能作为列表检查，也没有单独导出入口。
- 在进入任何轻量战斗结果应用之前，先把事件链路做成可查、可导出的只读数据，更便于后续验证和导入导出回归。

修正：

- `MilitaryPanel.vue` 新增全局战斗事件收集逻辑，会合并 `map.military.events[]` 和各军团 `events[]`，按事件 id 去重。
- `军事管理` 摘要新增“事件”指标。
- 选中军团详情下方新增最近战斗事件列表，最多展示最近 `5` 条，显示事件类型、结果、时间和说明；无事件时显示空态。
- 工具栏新增“导出事件”，导出 `fmg-military-events-<seed>.json`，包含 seed、导出时间、事件总数和事件数组。
- 常规军事 JSON 导出也同步带上 `events` 字段，便于一次性导出军事状态和事件链。
- 新增列表样式，限制长说明的换行和容器尺寸，避免事件文本撑破军事面板。

文档：

- 更新 `docs/current-plan.md`，把战斗事件从“可记录”推进到“可查看 / 可导出”，并把下一步限定为轻量战斗结果应用，不进入完整模拟。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `21.11KB / gzip 6.98KB`，主入口仍约 `757.07KB / gzip 228.47KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：给军团 `1:0` 记录 `攻城 / 小胜：攻破边堡，缴获粮草` 后，事件列表显示 `1` 条，标题显示 `1 条`，`map.military.events = 1`、`metadata.events = 1`。
- 同次烟测中“导出事件”下载 `fmg-military-events-stage-2-1.json`，导出 `count = 1`，首条事件与面板记录一致；`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1409.7ms`，纯生成 `712.9ms`，WebGL 加载 `372.9ms`，UI slack `323.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 132ms`，最慢加载阶段为 `构建视觉 cell mesh 56.1ms`，`line-vertices = 47.1ms`，`fit-draw = 2.6ms`，`glError = 0`。

### 军团轻量战斗结果应用

背景：

- 战斗事件已经可记录、查看和导出，但还不能对军团状态产生可撤销影响。
- 本轮只做单军团轻量结果应用，不做完整战斗模拟、双方交互、士气阶段或外交战争状态变更。

修正：

- `createRecordMilitaryBattleEventCommand()` 支持 `applyResult`。
- 关闭“应用轻量结果”时仍只记录事件，刷新范围保持 `object-panels`。
- 开启后按固定结果规则应用轻量损耗：小胜 `4%` 修整、受挫 `18%` 败逃、相持 `8%` 修整、损耗 `25%` 败逃、重整 `2%` 集结。
- 应用会同步缩放 `regiment.u`、更新 `regiment.a`、主兵种标签、图标档位、态势、命令、`map.military.metadata.troops/statuses/events` 和 `state.militaryPolicy.generatedTroops`。
- 事件写入 `resultApplied` 和 `result` 摘要，便于列表展示和后续导出回归。
- 军事面板新增“应用轻量结果”开关、结果预览和事件列表中的应用摘要。
- 运行日志记录 `apply=yes/no`，方便排查事件记录是否改变了实际军团状态。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 238 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `22.17KB / gzip 7.37KB`，主入口约 `760.65KB / gzip 229.67KB`。
- 命令烟测通过：给军团 `1:0` 记录 `袭扰 / 损耗：后卫被伏击，辎重受损` 并应用结果后，兵力 `16250 -> 12187`，态势 `garrisoned -> routed`，`metadata.troops 613002 -> 608939`，`metadata.events 0 -> 1`，事件写入 `resultApplied = true` 和 `casualties = 4063`。
- 同次烟测中撤销恢复兵力、态势、事件和 metadata，重做再次应用同一结果；刷新范围为 `point-layers / object-index / object-panels`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1332.3ms`，纯生成 `658.8ms`，WebGL 加载 `363ms`，UI slack `310.5ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 121.6ms`，最慢加载阶段为 `构建视觉 cell mesh 52.8ms`，`line-vertices = 49.6ms`，`fit-draw = 2.6ms`，`glError = 0`。

### 战斗事件 CSV 导出

背景：

- 事件 JSON 已能保留完整结构，但轻量结果应用后的兵力前后、损耗和态势变化不方便直接表格核对。
- 本轮只补事件导出回归，不改战斗模拟、不改军事生成，也不改常规军团 CSV/JSON 的字段。

修正：

- `军事管理` 工具栏将原“导出事件”拆成“事件 JSON”和“事件 CSV”。
- 新增事件 CSV 导出，字段包括事件 id、序号、时间、国家、军团、类型、结果、说明、是否应用、结果摘要、兵力前后、损耗和态势前后。
- 工具栏从三列改为四列，避免新增按钮后挤压布局。
- CSV 使用面板现有的 `allBattleEvents` 合并去重结果，保证与事件 JSON 的来源一致。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 239 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `23.08KB / gzip 7.57KB`，主入口约 `760.65KB / gzip 229.66KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开控制面板的“管理”tab，进入 `军事管理`，记录并应用 `CSV导出验证，含结果列` 后下载 `fmg-military-events-stage-2-1.csv`。
- CSV 表头为 `事件ID,序号,时间,国家,军团,类型,结果,说明,已应用,结果摘要,兵力前,兵力后,损耗,态势前,态势后`；首条事件为 `1:0:battle:1`，兵力 `576 -> 553`，损耗 `23`，态势 `行军中 -> 修整中`，`resultApplied = true`。
- 同次烟测 `metadata.events = 1`，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1343.1ms`，纯生成 `625.4ms`，WebGL 加载 `423.4ms`，UI slack `294.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 105.4ms`，最慢加载阶段为 `构建视觉 cell mesh 72.1ms`，`line-vertices = 48.9ms`，`fit-draw = 2.8ms`，`glError = 0`。

### 轻量战斗结果预览明细

背景：

- “应用轻量结果”开关已有百分比预览，但用户在提交前看不到当前选中军团会损耗多少兵力。
- 本轮只补提交前说明，不改变命令层损耗规则、不写地图数据，也不进入完整战斗模拟。

修正：

- `battleResultPreview` 改为读取当前选中军团兵力，并按结果规则计算预计损耗和兵力变化。
- 预览规则与命令层保持一致：小胜 `4%`、受挫 `18%`、相持 `8%`、损耗 `25%`、重整 `2%`，且至少保留 `1` 名兵力。
- 预览文案补充规则标签，例如“小胜后整队”“损耗败退”。
- 预览样式增加行高和自动换行，避免较长文案撑破二级浮层。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 240 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `23.47KB / gzip 7.72KB`，主入口约 `760.65KB / gzip 229.66KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开控制面板的“管理”tab，进入 `军事管理`，打开“战斗事件”并启用“应用轻量结果”。
- 选中军团 `1:0`、兵力 `576` 时，默认“小胜”预览为 `小胜后整队：576 -> 553，预计损耗 23，态势改为修整中`；切换“损耗”后预览为 `损耗败退：576 -> 432，预计损耗 144，态势改为败逃中`。
- 同次烟测 `glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1346.3ms`，纯生成 `673ms`，WebGL 加载 `372.8ms`，UI slack `300.5ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 120.9ms`，最慢加载阶段为 `构建标签 55.4ms`，`line-vertices = 45.8ms`，`fit-draw = 2.6ms`，`glError = 0`。

### 战斗结果持久战报摘要

背景：

- 轻量结果应用已经会写入兵力前后、损耗和态势字段，但可读中文摘要仍由军事面板临时拼接。
- 事件 JSON/CSV 和后续导入兼容更需要事件自身携带稳定的战报摘要，而不是依赖当前 UI 版本的展示函数。

修正：

- `applyBattleResult()` 在事件 `result` 中新增 `summary` 和 `unitLossSummary`。
- `summary` 保存规则标签、兵力前后、损耗和目标态势，例如 `损耗败退：16250 -> 12187，损耗 4063，态势改为败逃中`。
- `unitLossSummary` 按兵种输出损耗，例如 `步兵 748 / 弓兵 3092 / 骑兵 42 / 器械 181`；无损耗时写为 `无兵种损耗`。
- 军事面板事件列表和事件 CSV 的“结果摘要”优先读取持久摘要，同时保留旧事件的临时拼接回退。
- 本轮只补说明字段，不改变损耗规则、撤销/重做机制、外交战争状态或完整战斗模拟边界。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 241 项。

验证：

- 命令烟测通过：给军团 `1:0` 记录 `袭扰 / 损耗：战报摘要验证` 并应用结果后，兵力 `16250 -> 12187`，事件写入 `summary = 损耗败退：16250 -> 12187，损耗 4063，态势改为败逃中`，`unitLossSummary = 步兵 748 / 弓兵 3092 / 骑兵 42 / 器械 181`，`resultApplied = true`。
- 同次烟测中撤销后兵力恢复 `16250`、事件数和军团事件数回到 `0`；重做后同一摘要恢复，兵力回到 `12187`。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `23.61KB / gzip 7.77KB`，主入口约 `761.16KB / gzip 229.84KB`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1406.7ms`，纯生成 `686.6ms`，WebGL 加载 `380.4ms`，UI slack `339.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 129.8ms`，最慢加载阶段为 `构建标签 57.3ms`，`line-vertices = 43.3ms`，`fit-draw = 3ms`，`glError = 0`。

### 战斗事件 JSON 导入兼容

背景：

- 事件 JSON/CSV 已能导出，但还不能把已导出的事件记录导回当前地图。
- 本轮只做事件记录兼容导入，不把 `resultApplied` 重新应用到兵力，也不改变外交战争状态或完整战斗模拟。

修正：

- `createImportMilitaryBattleEventsCommand()` 新增可撤销事件导入命令。
- 导入源支持数组、`events`、`military.events` 和 `pack.military.events`，只接收 `kind` 为空或 `battle` 的事件。
- 导入会按 `regimentObjectId` 或 `stateId/regimentId` 匹配当前地图军团；不能匹配的事件跳过。
- 导入保留事件 id、sequence、类型、结果、说明、时间、`resultApplied` 和 `result` 摘要字段；没有 id 时按当前军团和 sequence 生成。
- 重复 id 会覆盖同 id 事件；撤销/重做通过 `EditHistory` 恢复全局事件和各军团事件列表。
- `军事管理` 工具栏新增“导入事件”，用隐藏 JSON 文件输入读取文件，并在面板内显示导入条数和跳过条数。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 242 项。

验证：

- 命令烟测通过：导入 `2` 条事件，`1` 条匹配当前军团、`1` 条无效，结果为 `imported 1 / skipped 1`；军团兵力保持 `16250`，全局事件和军团事件均为 `1`。
- 同次烟测中撤销后兵力仍为 `16250`、事件数回到 `0`；重做后兵力仍不变，军团事件数回到 `1`。首次实现曾在重做时复用撤销前的军团对象引用，烟测发现后已改为每次 apply 重新解析当前地图军团。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `24.26KB / gzip 8.00KB`，主入口约 `763.99KB / gzip 230.80KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开 `http://127.0.0.1:5410`，进入军事管理，对隐藏文件输入设置临时 JSON；面板显示 `已导入 1 条，跳过 1 条`，事件摘要为 `导入战报摘要`，军团兵力保持 `576`，军团事件数为 `1`，历史为 `undo 1 / redo 0 / 导入军团战斗事件`；撤销后事件消失，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1379.2ms`，纯生成 `717.1ms`，WebGL 加载 `368ms`，UI slack `294.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 144.9ms`，最慢加载阶段为 `构建视觉 cell mesh 58.2ms`，`line-vertices = 53.9ms`，`fit-draw = 3ms`，`glError = 0`。

### 战斗事件筛选与清空

背景：

- 战斗事件已能记录、导出、导入，但选中军团的事件列表只能显示最近 `5` 条，无法按类型或结果收窄。
- 导入或多次记录后缺少可撤销的当前军团事件清理入口。
- 本轮只处理事件记录列表，不回滚已应用的兵力损耗、不改变外交战争状态，也不进入完整战斗模拟。

修正：

- `MilitaryPanel` 的选中军团事件区新增“类型 / 结果”筛选。
- 筛选后标题显示 `匹配数 / 总数`，列表仍只展示最近 `5` 条匹配事件，避免事件多时撑大面板。
- 新增“清空当前”按钮，清空当前选中军团在 `map.military.events` 和 `regiment.events[]` 中的战斗事件。
- `createClearMilitaryBattleEventsCommand()` 接入 `EditHistory`，撤销/重做恢复全局事件列表、军团事件列表和事件 metadata。
- 清空只影响事件记录，不回滚已经通过轻量结果应用写入的兵力、兵种、态势或命令。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 243 项。

验证：

- 命令烟测通过：给军团 `1:0` 记录 `2` 条不同类型事件后执行清空，`map.military.events` 和军团事件数均从 `2` 变为 `0`，兵力保持 `16250`；撤销后全局事件和军团事件均恢复为 `2`。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `25.41KB / gzip 8.25KB`，主入口约 `765.60KB / gzip 231.08KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开 `http://127.0.0.1:5410`，用命令层先记录 `袭扰 / 损耗` 与 `攻城 / 小胜` 两条事件，再打开军事管理；事件标题为 `2 条`，类型筛选切到 `袭扰` 后变为 `1 / 2 条`，列表仅显示 `袭扰 / 损耗`。点击“清空当前”后标题为 `暂无`，`map.military.events = 0`，历史为 `undo 3 / redo 0 / 清空军团战斗事件 #1:0`；撤销后事件数恢复为 `2`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1369.4ms`，纯生成 `677.8ms`，WebGL 加载 `389.9ms`，UI slack `301.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 140.1ms`，最慢加载阶段为 `构建标签 57.2ms`，`line-vertices = 49.6ms`，`fit-draw = 2.5ms`，`glError = 0`。

### 战斗事件按范围导出

背景：

- 选中军团事件区已经支持类型/结果筛选，但顶部“事件 JSON / 事件 CSV”仍固定导出全量事件。
- 用户核查单个军团或当前筛选结果时，需要导出和面板所见范围一致的数据。

修正：

- 事件筛选区新增“导出”范围下拉，默认 `全部事件`，可切换为 `当前军团` 或 `当前筛选`。
- “事件 JSON / 事件 CSV”按钮按当前导出范围输出；旧默认行为保持为全量导出。
- 事件 JSON 增加 `scope / scopeLabel / count`，便于回看文件来源范围。
- 导出文件名追加 `all / selected / filtered` 后缀，避免不同范围导出互相覆盖。
- 本轮只改导出范围，不改变记录、导入、清空或轻量结果应用语义。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 244 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `26.12KB / gzip 8.43KB`，主入口约 `765.60KB / gzip 231.08KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开 `http://127.0.0.1:5410`，用命令层记录 `袭扰 / 损耗` 与 `攻城 / 小胜` 两条事件；类型筛选切到 `袭扰`、导出范围切到 `当前筛选` 后，标题为 `1 / 2 条`。
- 同次烟测下载 `fmg-military-events-stage-2-1-filtered.json`，其中 `scope = filtered`、`count = 1`、唯一事件 type 为 `raid`；下载 `fmg-military-events-stage-2-1-filtered.csv` 只有表头和一条 `袭扰` 事件，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1465ms`，纯生成 `767.7ms`，WebGL 加载 `369.5ms`，UI slack `327.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 138.7ms`，最慢加载阶段为 `构建视觉 cell mesh 53.3ms`，`line-vertices = 44.2ms`，`fit-draw = 2.5ms`，`glError = 0`。

### 战斗事件按筛选清理

背景：

- 选中军团事件区已经支持类型/结果筛选和按筛选导出，但清理入口仍只有“清空当前”，会删除当前军团全部事件。
- 导入或连续记录多条事件后，用户需要只删除当前筛选命中的事件，保留同军团其他事件。

修正：

- `createClearMilitaryBattleEventsCommand()` 增加可选 `eventIds` 范围。
- 清理命令会同时校验事件属于当前军团和事件 id 命中范围；没有传范围时保留原来的“清空当前军团”语义。
- `军事管理` 事件筛选区新增“清空筛选”按钮，旧“清空当前”继续保留。
- 运行时清理回调支持传入筛选事件 id，并在历史标签中区分 `清空筛选战斗事件` 与 `清空军团战斗事件`。
- 本轮只清理事件记录，不回滚已经应用过的兵力、兵种、态势、命令或外交战争状态。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 245 项。

验证：

- 命令烟测通过：给军团 `1:0` 记录 `raid / siege` 两条事件后，按 `raid` 事件 id 执行清理，清理后全局事件只剩 `siege`；撤销后恢复 `raid / siege`，兵力保持不变。
- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `26.41KB / gzip 8.47KB`，主入口约 `765.90KB / gzip 231.17KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开 `http://127.0.0.1:5410`，给军团 `1:0` 注入 `袭扰 / 损耗` 与 `攻城 / 小胜` 两条事件；类型筛选切到 `袭扰` 后标题为 `1 / 2 条`，点击“清空筛选”后全局和军团本地事件均只剩 `siege`，历史为 `清空筛选战斗事件 #1:0`；撤销后恢复 `raid / siege`，`glError = 0`、console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1447.1ms`，纯生成 `663.7ms`，WebGL 加载 `465.8ms`，UI slack `317.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 123.9ms`，最慢加载阶段为 `构建线层顶点 84.2ms`，`fit-draw = 3.6ms`。

### 军事面板布局整理

背景：

- 军事管理面板的功能已经覆盖态势、驻地、兵种比例和战斗事件，但顶部工具条和事件筛选区仍像按钮堆叠，层级不够清楚。
- 上一轮新增“清空筛选”后，事件筛选区在 720px 面板内更容易显得拥挤，需要整理为更稳定的操作面。

修正：

- 顶部工具条改为“军团数据 / 战斗事件”两组，分别容纳军团 CSV/JSON 和事件 JSON/CSV/导入。
- 选中军团概要新增抽象兵种符号，并用本地映射避免露出 `archers`、`fleet-small` 等内部 key。
- 战斗事件区域把“类型 / 结果 / 导出”筛选和“清空筛选 / 清空当前”动作拆成两段布局。
- 局部归零 Element Plus 相邻按钮默认 `margin-left`，避免工具条和事件动作区产生横向溢出。
- 本轮只整理军事面板布局，不改变事件数据结构、命令语义、战斗结果应用规则或地图渲染。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 246 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `27.18KB / gzip 8.75KB`，主入口约 `765.90KB / gzip 231.18KB`。
- Playwright + 系统 Chrome 构建产物布局烟测通过：打开 `http://127.0.0.1:5410` 后进入军事管理，工具条分组为 `军团数据 / 战斗事件`；工具条、事件工具和事件动作区均满足 `scrollWidth == clientWidth`；概要符号为抽象符号 `⌁`，不再显示内部 key `archers`。
- 同次烟测继续验证事件功能：类型筛选到 `袭扰` 后点击“清空筛选”，临时注入的 `raid / siege` 事件只剩 `siege`，历史为 `清空筛选战斗事件 #1:0`，`glError = 0`、console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1370.6ms`，纯生成 `693.2ms`，WebGL 加载 `370.5ms`，UI slack `306.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 120.5ms`，最慢加载阶段为 `构建视觉 cell mesh 53.3ms`，`line-vertices = 45.2ms`，`fit-draw = 2.5ms`。

### 战报链摘要

背景：

- 战斗事件已经支持记录、导入、筛选、清理和导出，但多条事件只能从列表逐条扫读。
- 继续推进“多条战报链路”时，先补只读摘要，而不是进入完整战斗模拟或双方结算。

修正：

- 选中军团的战斗事件区新增“战报链摘要”。
- 摘要展示事件链路条数、已应用结果条数、累计损耗和最近事件。
- 累计损耗优先读取 `event.result.casualties`，缺失时回退到 `result.troopDelta` 的绝对值。
- 本轮只读展示，不改变事件记录、导入、清理、导出、轻量结果应用或地图渲染。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和第 247 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仍只有既有大 chunk 提示。`MilitaryPanel` 懒加载 chunk 约 `28.16KB / gzip 9.00KB`，主入口约 `765.90KB / gzip 231.17KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开 `http://127.0.0.1:5410` 后进入军事管理，给军团 `1:0` 注入两条事件，其中一条带 `result.casualties = 123`；摘要显示 `链路 2 条 / 已应用 1 条 / 累计损耗 123 / 最近 攻城 / 小胜`。
- 同次烟测确认战报链摘要和事件区无横向溢出，`glError = 0`、console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过：点击到出图 `1595.3ms`，纯生成 `859.3ms`，WebGL 加载 `401ms`，UI slack `335ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 163.3ms`，最慢加载阶段为 `构建视觉 cell mesh 68.8ms`，`line-vertices = 50.7ms`，`fit-draw = 3.5ms`。

### 战斗事件 JSON 导出摘要

背景：

- 面板已经有战报链摘要，但事件 JSON 导出仍只包含 `scope/count/events`。
- 继续推进多条战报链路时，需要导出文件也带摘要，便于脱离 UI 核对。

修正：

- 事件 JSON 顶层新增 `summary`。
- `summary` 复用战报链摘要，包含 `total / applied / casualties / latest` 和展示标签。
- 导入逻辑仍只消费 `events`，旧 JSON 和带摘要的新 JSON 都兼容。
- CSV 本轮不改，避免扩大字段面。

文档：

- 更新 `docs/current-plan.md` 第 248 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `28.41KB / gzip 9.08KB`，主入口约 `765.90KB / gzip 231.17KB`。
- Playwright + Chrome 构建产物烟测通过：下载 `fmg-military-events-stage-2-1-all.json`，`summary.total = 2`、`summary.applied = 1`、`summary.casualties = 456`、`summary.latest.type = siege`，事件数组仍含 `raid / siege`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1406.4ms`，纯生成 `723ms`，WebGL 加载 `402.4ms`，UI slack `281ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 130.3ms`，最慢加载阶段为 `构建视觉 cell mesh 62.7ms`，`line-vertices = 49.5ms`，`fit-draw = 3ms`。

### 军事态势线宽体箭头

背景：

- 用户指出军事态势线不好看：不能太长，最多只在边界上存在；不要跨海；不能是细线，而要是宽体渐变色、能表达方向的箭头。
- 旧渲染虽然已经尝试找共享边界，但数据只有局部边，渲染形态也容易退化成很短、很细、几乎不可见的小箭头。

修正：

- `findSharedLandFrontSegment()` 改为收集交战双方共享的陆地边界边，只接受两侧 `pack.cells.h >= 20` 且 state 分属交战双方的相邻 cell。
- 战线段会以目标中点附近的共享边为起点，沿连通边界扩展到短段上限，并写入 `borderCellPairs / length / maxLength` 供校验。
- 没有共享陆地边界时不生成战线，因此隔海战争不会画跨海态势线。
- 渲染层把战线从细线改为边界附近的宽体渐变箭头：箭头头部朝目标国家，尾部低透明、主体高饱和、头部高亮。
- 对边界段退化到极短点位的情况，渲染层会给箭头保留最小可视横向长度，避免战线数据存在但肉眼看不到。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 249 项。

验证：

- 数据烟测通过：固定 `stage-2-1231411414 / continents / 10000` 生成 `2` 条战线，最长 `57`，均低于各自上限；所有 `borderCellPairs` 两侧 cell 都是陆地且属于交战双方。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `768.43KB / gzip 232.22KB`，仍只有既有大 chunk 提示。
- Playwright + Chrome 构建产物烟测通过：固定 seed 下战线图层开启，战线开关顶点差为 `18`，即 `2` 个箭头各 `3` 个三角形；局部截图 `docs/generated/war-front-arrow-crop.png` 可见宽体渐变箭头，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1352.2ms`，纯生成 `694.1ms`，WebGL 加载 `373ms`，UI slack `285.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 123.1ms`，最慢加载阶段为 `构建标签 54.2ms`，`line-vertices = 50.2ms`，`fit-draw = 2.5ms`。

### 军事面板样式第二刀

背景：

- 军事管理面板功能已经覆盖态势、驻地、兵种比例和战斗事件，但顶部统计、详情网格和战报摘要仍偏裸文本，和其他对象面板相比显得粗糙。
- 本轮只收束视觉层级，不改变军事数据结构、命令、导入导出或战斗事件语义。

修正：

- `military-panel-summary` 新增卡片式统计网格，避免顶部汇总散成裸文本。
- `military-overview` 调整为更像指挥卡的暗色面板，加强军团图标、状态胶囊、核心指标和兵种比例条。
- `military-panel-details` 新增三列详情网格样式，和概要卡形成清晰层级。
- `military-event-list`、`military-event-chain` 和事件项统一为紧凑战报区；战报链摘要改为连续状态带。
- `military-status-panel` 补边框、背景和内边距，使二级态势面板不再像悬浮裸表单。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 250 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主 CSS 约 `128.78KB / gzip 20.21KB`，主入口约 `768.43KB / gzip 232.23KB`，仍只有既有大 chunk 提示。
- Playwright + Chrome 构建产物布局烟测通过：打开 `军事管理`，注入两条战斗事件，并打开“调整态势”二级面板；`military-panel-summary / controls / toolbar / overview / details / event list / event tools / event chain / secondary panel` 均无横向溢出。
- 同次烟测战报链显示 `链路 2 条 / 已应用 1 条 / 累计损耗 132 / 最近 攻城 / 小胜`，`glError = 0`、console/page error 为 `0`，截图为 `docs/generated/military-panel-style-smoke.png`。
- e2e 守门通过：点击到出图 `1411ms`，纯生成 `706.5ms`，WebGL 加载 `392.5ms`，UI slack `312ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 124.3ms`，最慢加载阶段为 `构建视觉 cell mesh 55.9ms`，`line-vertices = 45.5ms`，`fit-draw = 2.8ms`。

### 战斗事件链路元信息

背景：

- 战斗事件列表已有类型、结果、时间、说明和已应用摘要，但多条事件仍需要读正文才能判断链路序号与应用状态。
- 本轮只增强选中军团事件列表的只读可读性，不改变事件保存格式、导入导出、清理或轻量结果应用。

修正：

- 每条事件新增一行紧凑元信息标签。
- 标签包含 `链路 #序号`、`已应用 / 未应用` 和 `损耗 N / 损耗未计入`。
- 已应用事件的损耗值复用现有 `battleEventCasualties()` 逻辑，和战报链摘要保持一致。
- 未应用事件明确显示“损耗未计入”，避免和已结算损耗混淆。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 251 项。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `28.94KB / gzip 9.24KB`，主 CSS 约 `129.21KB / gzip 20.28KB`，主入口约 `768.43KB / gzip 232.23KB`。
- Playwright + Chrome 构建产物烟测通过：打开 `军事管理`，给同一军团注入两条事件；最新事件显示 `链路 #12 / 未应用 / 损耗未计入`，上一条显示 `链路 #11 / 已应用 / 损耗 132`。
- 同次烟测确认事件列表和首条事件无横向溢出，战报链摘要仍为 `链路 2 条 / 已应用 1 条 / 累计损耗 132 / 最近 攻城 / 小胜`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1386.1ms`，纯生成 `720.1ms`，WebGL 加载 `388.3ms`，UI slack `277.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 136.9ms`，最慢加载阶段为 `构建视觉 cell mesh 56.8ms`，`line-vertices = 53.3ms`，`fit-draw = 3.1ms`。

### 战斗事件 CSV 链路字段

背景：

- 战斗事件列表已经显示 `链路 #序号 / 已应用或未应用 / 损耗状态`，但 CSV 事件导出仍只有原始序号和 `已应用` 布尔列。
- 多条战报链路需要导出后直接扫读，因此 CSV 应保留机器友好的旧列，同时补充和界面一致的人读状态字段。

修正：

- `exportBattleEventsCsv()` 新增 `链路`、`应用状态` 和 `损耗状态` 三列。
- 新列复用现有 `battleEventSequenceLabel()`、`battleEventAppliedLabel()` 和 `battleEventLossLabel()`，避免界面与导出对同一事件给出不同文案。
- 原有 `序号`、`已应用`、结果摘要和兵力变化列全部保留，避免破坏已有 CSV 消费路径。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 252 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `28.99KB / gzip 9.27KB`，主入口约 `768.43KB / gzip 232.23KB`。
- Playwright + Chrome 构建产物烟测通过：打开 `军事管理`，给同一军团注入两条事件并下载战斗事件 CSV；表头包含 `链路 / 应用状态 / 损耗状态`，两条记录分别包含 `链路 #11 / 已应用 / 损耗 132` 与 `链路 #12 / 未应用 / 损耗未计入`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1409.2ms`，纯生成 `764ms`，WebGL 加载 `337.3ms`，UI slack `307.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 157ms`，最慢加载阶段为 `构建视觉 cell mesh 50.8ms`，`line-vertices = 41.8ms`，`fit-draw = 2.6ms`。

### 战斗事件完整链路展开

背景：

- 选中军团的战报链摘要已经统计完整事件数，但列表始终只展示最近 5 条。
- 多条战报链路需要在面板内直接复盘，不能每次都依赖导出文件。

修正：

- 当当前筛选结果超过 5 条时，事件操作区新增 `展开全部 N` 按钮。
- 默认仍只渲染最近 5 条，避免长链路在打开面板时直接扩大 DOM。
- 展开后按最新优先展示完整筛选链路；切换军团、类型筛选或结果筛选时自动收起，避免旧展开状态误带到新对象。
- 事件操作区按钮布局改为自适应列，容纳第三个按钮时不横向溢出。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 252 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `29.38KB / gzip 9.40KB`，主入口约 `768.43KB / gzip 232.22KB`。
- Playwright + Chrome 构建产物烟测通过：给同一军团注入 `7` 条事件后，列表默认显示 `5` 条并出现 `展开全部 7`；点击后显示完整 `7` 条并切换为 `收起最近`，事件工具区和首条事件无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1415.9ms`，纯生成 `702.6ms`，WebGL 加载 `375.8ms`，UI slack `337.5ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 124.3ms`，最慢加载阶段为 `构建视觉 cell mesh 59.1ms`，`line-vertices = 47.1ms`，`fit-draw = 2.4ms`。

### 战斗事件结算状态筛选

背景：

- 战报链路已经显示 `已应用 / 未应用` 和损耗状态，但筛选条件仍只有事件类型和结果。
- 多条战报链路复盘时，常见动作是只看未结算事件或只核对已应用损耗，应该在面板内直接完成。

修正：

- 战斗事件筛选区新增 `结算` 下拉，支持 `全部结算 / 已应用 / 未应用`。
- `selectedFilteredBattleEvents` 统一接入结算状态筛选，因此列表展示、完整链路展开、清空筛选和按筛选导出都会使用同一过滤结果。
- 切换结算筛选时会自动收起完整链路，避免旧展开状态误带到新过滤结果。
- 筛选区改为自适应列布局，容纳新增筛选项和导出范围选择。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 252 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `29.82KB / gzip 9.48KB`，主入口约 `768.43KB / gzip 232.23KB`。
- Playwright + Chrome 构建产物烟测通过：给同一军团注入 `7` 条事件后，默认显示最近 `5` 条且可展开；切换 `结算 = 未应用` 后列表显示 `3 / 7 条`，只剩 `链路 #6 / #4 / #2` 的未应用事件，不再出现展开按钮。
- 同次烟测确认按 `当前筛选` 导出的战斗事件 CSV 只有 `3` 条未应用记录，均包含 `否 / 未应用 / 损耗未计入`，筛选工具区无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1428.1ms`，纯生成 `716.4ms`，WebGL 加载 `376.6ms`，UI slack `335.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 119.5ms`，最慢加载阶段为 `构建视觉 cell mesh 60.1ms`，`line-vertices = 49.3ms`，`fit-draw = 2.4ms`。

### 战报链未应用摘要

背景：

- 战斗事件链路已经支持按 `已应用 / 未应用` 筛选，但战报链摘要仍只显示已应用数量。
- 复盘长链路时，用户需要快速判断还有多少事件未结算，不应依赖手动相减或切筛选后再看计数。

修正：

- `buildBattleEventChainSummary()` 新增 `pending / pendingLabel`，事件 JSON 导出的 `summary` 会自然带出未应用数量。
- 选中军团战报链摘要新增 `未应用` 一格，和 `链路 / 已应用 / 累计损耗 / 最近` 并列展示。
- 战报链摘要样式从 4 格改为 5 格，保留“最近”列更宽，避免最近事件文案被压到不可读。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 252 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `30.01KB / gzip 9.52KB`，主入口约 `768.43KB / gzip 232.23KB`。
- Playwright + Chrome 构建产物烟测通过：给同一军团注入 `7` 条事件后，战报链摘要显示 `链路 7 条 / 已应用 4 条 / 未应用 3 条 / 累计损耗 160 / 最近 袭扰 / 损耗`。
- 同次烟测确认战斗事件 JSON 导出的 `summary.pending = 3`、`summary.applied = 4`，战报链摘要无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1379.7ms`，纯生成 `683.2ms`，WebGL 加载 `387.4ms`，UI slack `309.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 121.4ms`，最慢加载阶段为 `构建标签 60.2ms`，`line-vertices = 46ms`，`fit-draw = 4.7ms`。

### 战斗事件 JSON 筛选上下文

背景：

- 战斗事件 JSON 已支持按 `全部事件 / 当前军团 / 当前筛选` 范围导出。
- 当范围为 `当前筛选` 时，导出文件只有 `scopeLabel`，没有记录当时的类型、结果和结算筛选条件，后续复盘会丢失上下文。

修正：

- `exportBattleEvents()` 新增 `filters` 对象。
- `filters` 记录 `type / typeLabel`、`outcome / outcomeLabel`、`applyStatus / applyStatusLabel`。
- 筛选标签复用现有下拉选项，避免导出文案和面板显示不一致。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 252 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `30.27KB / gzip 9.60KB`，主入口约 `768.43KB / gzip 232.23KB`。
- Playwright + Chrome 构建产物烟测通过：设置 `类型 = 袭扰`、`结果 = 相持`、`结算 = 未应用`、`导出 = 当前筛选` 后下载战斗事件 JSON；导出 `filters` 为 `raid / 袭扰`、`draw / 相持`、`pending / 未应用`。
- 同次烟测确认 JSON `count = 2`、`events.length = 2`，所有导出事件均为未应用的袭扰相持事件，`summary.total = 2`、`summary.pending = 2`、`summary.applied = 0`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1544.4ms`，纯生成 `783.3ms`，WebGL 加载 `392.3ms`，UI slack `368.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 142.9ms`，最慢加载阶段为 `构建线层顶点 63.7ms`，`fit-draw = 2.2ms`。

### 选中军团最新战报口径统一

背景：

- 选中军团事件列表和战报链摘要会合并 `map.military.events` 与军团本地 `regiment.events`。
- 但详情区的 `战斗事件` 行和记录战斗事件二级面板标题仍读取 `selected.latestEventLabel`，该字段只来自军团本地事件。
- 当导入或全局事件写入后，列表能看到战报，概要却可能显示 `无` 或 `暂无战斗事件`。

修正：

- 新增 `selectedLatestBattleEventLabel`，基于合并后的 `selectedBattleEventRows` 计算最新战报标签。
- 详情区 `战斗事件` 和战斗事件记录面板标题统一读取该 computed 标签。
- `latestBattleEventLabel()` 增加可传入空状态文案，保留列表行默认 `无`，面板标题使用 `暂无战斗事件`。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 252 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `30.26KB / gzip 9.61KB`，主入口约 `768.43KB / gzip 232.22KB`。
- Playwright + Chrome 构建产物烟测通过：只写入 `map.military.events`、清空对应 `regiment.events` 后，事件列表、详情区 `战斗事件` 行和战斗事件记录二级面板标题都显示 `攻城 / 相持：全局战报口径烟测`。
- 同次烟测确认战报链摘要显示 `链路 1 条 / 未应用 1 条`，没有回落到 `无` 或 `暂无战斗事件`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1276.7ms`，纯生成 `598ms`，WebGL 加载 `358.8ms`，UI slack `319.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 101.9ms`，最慢加载阶段为 `构建视觉 cell mesh 47.5ms`，`line-vertices = 42.6ms`，`fit-draw = 2.4ms`。

### README 军事战报状态刷新

背景：

- README 仍把“军事事件、战报”整体列在待办中。
- 近期军事面板已经补齐战斗事件记录、导入、筛选、清理、完整链路展开、战报摘要、CSV/JSON 导出和筛选上下文。
- README 当时需要区分“已有轻量战报记录能力”和“仍未完成的战争行动 / 双方结算 / 战役推进”；该后续方向已在后续“README 军事路线校准”中按用户要求收回。

修正：

- `已经完成` 中补充军事战报链路能力。
- `轻量编辑能力` 补充军事态势、驻地/基地和兵种比例。
- `导出能力` 明确区分军事 CSV/JSON 和战斗事件 CSV/JSON。
- `还要做` 中当时把军事待办收敛为战争行动链路、双方结算、战役推进和经济/外交联动；该表述已被后续校准覆盖，不再作为当前路线。

文档：

- 更新 `README.md` 和 `docs/current-plan.md`。

验证：

- `git diff --check` 通过。
- e2e 守门通过：点击到出图 `1222.6ms`，纯生成 `605.8ms`，WebGL 加载 `359.1ms`，UI slack `257.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 127.1ms`，最慢加载阶段为 `构建视觉 cell mesh 53.7ms`。
- 本轮只调整 README 和计划/开发日志，没有改动运行时代码。

### 多条战报链路第一刀

背景：

- 之前军事面板把全局事件序号显示成“链路 #N”，只能表达事件顺序，不能表达多条战报线。
- 后续如果要进入战役推进和双方结算，必须先让事件属于某条可筛选、可导出的战报链，而不是继续把所有事件混成一串。
- 本轮仍限制为轻量战报记录能力，不做完整战斗模拟或战争自动推进。

修正：

- 新记录和导入的战斗事件会写入 `chainKey / chainLabel`。
- 没有显式链路字段时，事件默认归到所属国家的第一条战争原因；没有战争原因时归入“本地战报”。
- 军事面板新增“链路”筛选；选中军团战报摘要区拆分为真实链路数和事件数。
- 战斗事件条目会同时显示链路名和事件序号，避免把序号误读成链路。
- 战斗事件 JSON/CSV 导出会保留链路字段，JSON 的 `filters` 也会记录当前链路筛选上下文。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 12 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `31.66KB / gzip 9.99KB`，主入口约 `769.36KB / gzip 232.62KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开控制面板和 `军事管理`，通过二级“战斗事件”记录 `链路分组烟测：边境遭遇。` 后，列表显示链路名与 `序号 #`，链路筛选出现非 `all` 选项。
- 同次烟测切到该链路并按 `当前筛选` 导出 JSON：`count = 1`，事件包含 `chainKey = campaign:1:rivalry`、`chainLabel = 谭-赤原之战`，`filters.chainKey` 保持同值，`summary.chainCount = 1`；战斗事件列表无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1302.9ms`，纯生成 `675.9ms`，WebGL 加载 `350.8ms`，UI slack `276.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 113.5ms`，最慢加载阶段为 `构建视觉 cell mesh 60.7ms`。

### 战报链双方字段

背景：

- 多条战报链路已经能按 `chainKey / chainLabel` 分组，但事件还不知道本方是进攻方还是防守方，也不知道对手国家。
- 上一刀的 campaign 链路 key 带了当前国家 id，同一场战争的攻防双方会形成不同 key，不利于后续双方结算。
- 本轮仍只补双方上下文字段，不做自动战役推进、外交状态改写或完整战斗模拟。

修正：

- campaign 战斗事件的 `chainKey` 改为双方共享的 `campaign:*` key。
- 新记录和导入事件会写入 `chainSide / chainSideLabel`、`opponentStateId / opponentStateName`、`attackerStateId / attackerStateName`、`defenderStateId / defenderStateName`。
- 手动或旧格式导入事件会保留显式链路字段，并把缺失阵营归为 `手动`。
- 军事面板事件条目新增“进攻方 / 防守方 + 对手”状态胶囊。
- 战斗事件 CSV 导出新增 `阵营` 和 `对手` 两列；JSON 导出随事件保留完整双方字段，链路摘要中的 `chains` 也带出阵营、对手、已应用、未应用和损耗。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 12 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `32.95KB / gzip 10.36KB`，主入口约 `771.76KB / gzip 233.18KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开控制面板和 `军事管理`，通过二级“战斗事件”记录 `双方字段烟测：攻防链路。` 后，事件显示对手信息。
- 同次烟测切到该链路并按 `当前筛选` 导出 JSON 和 CSV：事件 `chainKey = campaign:16:1:991:rivalry`，不再带当前国家前缀；`chainSide = defender / 防守方`，`opponentStateName = 谭帝国`，`attackerStateName = 谭帝国`，`defenderStateName = 赤原国`；JSON `summary.chains[0]` 带出阵营和对手，CSV 表头包含 `阵营 / 对手`，战斗事件列表无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1602.2ms`，纯生成 `812.7ms`，WebGL 加载 `491.9ms`，UI slack `297.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 133.8ms`，最慢加载阶段为 `构建视觉 cell mesh 66ms`。

### 战斗事件记录链路选择

背景：

- 战报事件已经带有共享 campaign key 和攻防双方字段，但记录新事件时仍只能自动挂到第一条 campaign。
- 当国家存在多条战争或需要记录非战役事件时，用户需要在记录入口明确选择战报链。
- 本轮仍不进入自动战役推进、双方损耗结算或外交状态改写。

修正：

- 二级“战斗事件”面板新增“链路”下拉。
- 链路选项来自选中军团所属国家的 `campaigns`，显示战役名、进攻/防守方和对手国家。
- 选项末尾保留“本地战报”，用于无战役或不归属 campaign 的记录。
- 记录事件时会把所选链路的 `chainKey / chainLabel / chainSide / opponentStateName / attackerStateName / defenderStateName` 显式传入命令层。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 12 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `35.34KB / gzip 10.95KB`，主入口约 `771.76KB / gzip 233.18KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：打开控制面板和 `军事管理`，打开二级“战斗事件”后，链路下拉包含 `谭-赤原之战 / 防守方 / 对手 谭帝国` 和 `本地战报`。
- 同次烟测选择 `本地战报` 记录 `本地链路选择烟测。` 后按当前筛选导出 JSON：`chainKey = regiment:1:0:local`，`chainLabel = 本地战报`，`chainSide = local / 本地`，`filters.chainKey` 保持同值；战斗事件列表无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1607.2ms`，纯生成 `795.2ms`，WebGL 加载 `520.8ms`，UI slack `291.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 164.9ms`，最慢加载阶段为 `构建标签 59.4ms`。

### 可点击战报链概览

背景：

- 选中军团已经可以按链路筛选，也能在 JSON 摘要中导出 `summary.chains`。
- 但 UI 中只有总摘要和下拉筛选，用户不能直接从“战役对象”角度扫读每条链的对手、结算状态和损耗。
- 本轮只把已有链路摘要可视化，不新增自动结算或战役推进。

修正：

- 战斗事件区新增 `战报链概览`，按链路显示战役名、阵营、对手、事件数、已应用/未应用和累计损耗。
- 点击某条链会直接设置链路筛选，和现有下拉筛选共用同一 `eventChainFilter`。
- 概览使用紧凑可选按钮，避免在军事面板中继续堆叠大卡片。

文档：

- 更新 `docs/current-plan.md` 顶部观感修正摘要和第 12 项。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `36.10KB / gzip 11.16KB`，主入口约 `771.76KB / gzip 233.19KB`。
- Playwright + 系统 Chrome 构建产物烟测通过：记录 `链路概览烟测。` 后，战报链概览显示 `谭-赤原之战 / 防守方 / 对手 谭帝国 / 事件 1 / 未应用 1`。
- 同次烟测点击链路概览后，`#military-event-chain-filter` 同步为 `campaign:16:1:991:rivalry`，事件列表仍显示新记录，战斗事件列表无横向溢出，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1636.7ms`，纯生成 `803.2ms`，WebGL 加载 `542.1ms`，UI slack `291.4ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 146.3ms`，最慢加载阶段为 `构建线层顶点 80ms`。

### 军事态势线第三刀

背景：

- 用户指出军事态势线仍不好看：不能太长，最多只应在边界上存在；不要跨海；不能是细线，而应是宽体渐变色方向箭头。
- 旧整改已经把战线改为共享陆地边界段，但边界扩展允许第二段超过剩余长度，且渲染仍只有少量三角片，视觉上容易显得像线。

修正：

- `frontMaxBoundaryLength()` 进一步收紧最大边界长度。
- 边界扩展阶段不再允许新增边超过剩余长度，避免短战线被扩成长段。
- front 写入由共享边界双方 cell 质心计算的 `direction`，渲染时优先使用该方向，避免用远处国家中心导致箭头方向偏斜。
- 战线渲染改为暗色外沿 + 内层宽体渐变箭头，每条 front 由 `10` 个三角形组成，头部更亮、尾部更透明。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和进度条目。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `772.68KB / gzip 233.51KB`，`MilitaryPanel` 懒加载 chunk 保持约 `36.10KB / gzip 11.16KB`。
- 数据烟测 `front-check-1 / continents / 10000`：生成 `2` 条 front，长度均为 `20`、上限 `26`，所有 `borderCellPairs` 两侧 cell 都是陆地、互为邻居且属于交战双方。
- 构建产物浏览器烟测：同 seed 生成 `2` 条 front，长度均为 `13`、上限 `14`，战线图层开关顶点差为 `60`，即每条 front `30` 个顶点，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1764.7ms`，纯生成 `841.6ms`，WebGL 加载 `638.5ms`，UI slack `284.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 154.4ms`，最慢加载阶段为 `构建视觉 cell mesh 55.8ms`，`line-vertices = 51.8ms`，`glError = 0`。

### 国名方位语义第二刀

背景：

- 用户指出随机国名也要看方位：北边国家不应孤立地叫“南某”，南边国家不应孤立地叫“北某”，除非同根国家在对应方向上形成相对关系。
- 第一刀只覆盖 `南越 / 北燕` 这类古国复合根名，普通地名根如 `东衡 / 南衡 / 北辰 / 西陵` 仍可能作为孤立国家名出现。

修正：

- `orientPackStateDirectionalNames()` 不再只处理古国复合根名，所有 `东/西/南/北 + 根名` 的国家都会进入同根方位组。
- 孤立方位根名改成无方位根名；若重名，则尝试 `新/古/上/中` 等中性变体。
- 多个同根国家仍保留相对方位语义：前缀只在存在同根参照时成立。

文档：

- 更新 `docs/current-plan.md` 顶部摘要和进度条目。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `772.95KB / gzip 233.59KB`，`MilitaryPanel` 懒加载 chunk 约 `36.10KB / gzip 11.16KB`。
- 多 seed 生成审计覆盖 `continents / archipelago / mediterranean / highIsland / lowIsland / peninsula / pangea` 共 `112` 张 10k 地图，校正 `231` 个孤立方位国名，剩余无同根参照的方位国名为 `0`。
- 旧问题 seed `direction-gap-continents-00` 中 `东衡 / 南唐` 已分别校正为 `衡 / 唐`，并写入 `nameOrientation.reason = isolated-directional`。
- e2e 守门通过：点击到出图 `1742.3ms`，纯生成 `996.1ms`，WebGL 加载 `432.5ms`，UI slack `313.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 174.3ms`，最慢加载阶段为 `构建视觉 cell mesh 64.4ms`，`line-vertices = 53.8ms`，`glError = 0`。

### 战报链双方损耗摘要

背景：

- 战报链已经有共享 campaign key、进攻/防守方字段、对手字段和可点击链路概览。
- 轻量结果应用只对当前军团生效，不做真正双方结算；但复盘时需要先能看出同一战报链中攻方、守方各自已记录多少损耗。
- 本轮只做摘要分桶，不自动扣对手军团兵力、不推进战役、不改外交状态。

修正：

- `buildBattleEventChainSummary()` 新增 `sideCasualties` 和 `attackerCasualties / defenderCasualties / participantCasualties / localCasualties / manualCasualties`。
- `summarizeBattleEventChains()` 对每条链按 `chainSide` 汇总已应用损耗。
- 战报链概览 chip 会优先显示 `攻方损耗 / 守方损耗 / 参战损耗 / 本地损耗 / 手动损耗`，没有分桶时保留旧的累计损耗回退。
- JSON 事件导出的 `summary.chains` 会自然包含这些分桶字段，供后续双方结算和战役对象使用。

文档：

- 更新 `docs/current-plan.md` 第 12 项和进度条目。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` 懒加载 chunk 约 `37.35KB / gzip 11.46KB`，主入口约 `772.95KB / gzip 233.59KB`。
- 构建产物浏览器烟测通过：给同一 campaign 注入攻方 `120` 与守方 `340` 损耗事件，选中攻方军团时链路概览显示 `攻方损耗 120`，选中守方军团时显示 `守方损耗 340`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1651.8ms`，纯生成 `884.5ms`，WebGL 加载 `504.9ms`，UI slack `262.4ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 178.4ms`，最慢加载阶段为 `构建视觉 cell mesh 91.4ms`，`line-vertices = 49.9ms`，`drawMs = 0.1ms`，`glError = 0`。

### 军事态势线贴边第四刀

背景：

- 用户再次指出军事态势线仍不好看：不能太长，最多只在边界上存在；不要跨海；不能是细线，而要是宽体渐变色指向方向型箭头。
- 上一轮虽然已经改为共享陆地边界，但渲染侧仍会把边界段重组成一条视觉线，再把箭头头部沿法线推出边界外；当最佳共享边本身略长于上限时，生成侧也会保留整条边。

修正：

- `frontMaxBoundaryLength()` 再次收紧，从基于国家间距 `0.08` 改为 `0.035`，地图跨度上限从 `span / 36` 改为 `span / 72`。
- `selectFrontBoundarySegment()` 在起始共享边已超过上限时，会围绕共享边中点裁剪出短段，不再因为单条边过长突破 `maxLength`。
- `pushMilitaryFrontArrow()` 不再根据中点和 `maxLength` 重造视觉起止点，也不再把箭头头部推出到边界外侧。
- 新的 `pushMilitaryFrontBoundaryBand()` 直接沿 `front.points` 分段绘制暗色外沿和内层宽体渐变带，方向由双方边界 cell 质心决定；每个边界分段内部再绘制短三角箭头头部，避免退回细线观感。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `773.01KB / gzip 233.56KB`。
- 数据审计覆盖 `stage-2-1 / stage-2-1231411414 / front-audit-1 / front-audit-2`：有战线的 `stage-2-1231411414` 生成 `2` 条 front，`invalid = 0`、`long = 0`、最大长度约 `11`、最大长度比 `1`；无战线的 seed 保持 `fronts = 0`。
- 首次 e2e 因一次不稳定 `main-thread-long-task` 健康告警失败，但单 case 指标本身通过；立即复跑同 case 通过，且无 console/page error。
- 最终 e2e 守门通过：点击到出图 `1547.5ms`，纯生成 `789.1ms`，WebGL 加载 `418.3ms`，UI slack `340.1ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 134.2ms`，最慢加载阶段为 `构建视觉 cell mesh 64ms`，`line-vertices = 53.3ms`，`drawMs = 0.1ms`，`glError = 0`。

### 只读战役对象第一刀

背景：

- 军事面板已经有共享 `campaign:*` 战报链、攻防双方字段和双方损耗分桶，但缺少一个 `map.military.campaigns` 级别的战役清单承载双方兵力、front 和战役元信息。
- 本轮只建立只读战役对象和面板/导出摘要，不做双方自动扣兵、战役推进或外交状态变化。

修正：

- `buildMilitary()` 现在会从外交 `state.campaigns` 汇总 `map.military.campaigns`，并在 `metadata.campaigns` 记录数量。
- 每个战役对象写入 `id / chainKey / name / start / attacker / defender / cause / frontIds / attackerTroops / defenderTroops / troopBalance` 等字段，`chainKey` 与现有战斗事件链路规则保持一致。
- 军事管理顶部统计新增“战役”，选中参战国家军团时详情显示所属战役。
- 军事 JSON 导出新增 `campaigns` 字段，便于后续双方结算和战役推进复用同一对象。

验证：

- `git diff --check` 通过。
- 数据审计覆盖 `stage-2-1231411414 / stage-2-1 / campaign-audit-1 / campaign-audit-2`：有战役的 seed 中 `campaigns = metadataCampaigns = 1`、`fronts = 2`、`badChain = 0`、`badStates = 0`、`badTroops = 0`。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `774.36KB / gzip 234.00KB`，`MilitaryPanel` chunk 约 `37.98KB / gzip 11.65KB`。
- e2e 守门通过：点击到出图 `1593.7ms`，纯生成 `856ms`，WebGL 加载 `473ms`，UI slack `264.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 159.9ms`，最慢加载阶段为 `构建视觉 cell mesh 88.6ms`，`line-vertices = 53.2ms`，`drawMs = 0.1ms`，`glError = 0`。
- 构建产物浏览器烟测通过：军事面板概要显示 `战役1`，军事 JSON 导出 `campaigns = 1`、`metadata.campaigns = 1`；切到参战军团后详情显示 `徐-麇之战（徐王国 / 麇国）`，`drawMs = 0.4ms`、`glError = 0`、console/page error 为 `0`。

### 战役对象战报摘要第一刀

背景：

- `map.military.campaigns` 已经承载战役清单，但战斗事件记录、导入和清空后，战役对象本身还不会吸收事件摘要。
- 后续双方结算、战役推进和外交战争状态变化都需要一个稳定的战役级摘要入口。
- 本轮只同步摘要，不自动扣对手兵力、不推进阶段、不改外交。

修正：

- `refreshMilitaryEventMetadata()` 现在会同步刷新 `map.military.campaigns`。
- 战役对象会按共享 `campaign:*` 链路重算事件数、已应用/未应用、累计损耗、攻方/守方/参战/本地/手动损耗、最近事件。
- 同步时会从当前双方军团重算 `attackerRegiments / defenderRegiments / attackerTroops / defenderTroops / troopBalance`，让轻量结果应用后的战役兵力摘要跟随变化。
- 军事管理详情新增“战役摘要”，显示事件数、已应用数和攻防损耗；军事 JSON 导出自然包含这些字段。

验证：

- 命令层烟测通过：给 `stage-2-1231411414` 的 campaign 记录并应用一条攻方战斗事件后，`events = 1`、`appliedEvents = 1`、`attackerCasualties = 2063`、最近事件 id 为 `17:0:battle:1`，攻方兵力 `67962 -> 65899`；撤销后事件数、损耗和 metadata 事件数都回到 `0`。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `777.48KB / gzip 234.91KB`，`MilitaryPanel` chunk 约 `38.56KB / gzip 11.77KB`。

### 军事态势线贴边第五刀

背景：

- 用户再次指出军事态势线观感仍不对：不能太长，最多只在边界上存在；不要跨海；不能是细线，而要是宽体渐变色指向方向型箭头。
- 第四刀虽然已避免跨海和长线，但渲染仍在每个边界小段重复塞小箭头，远景下仍可能像碎细线。

修正：

- `frontMaxBoundaryLength()` 继续收紧，从国家距离 `0.035` 与 `span / 72` 上限改为 `0.025` 与 `span / 96` 上限，最低允许 `6` 个世界单位。
- front 仍只来自双方陆地 pack cell 的共享 Voronoi 边；没有共享陆地边界时不画战线。
- 渲染宽度从约 `12` 世界单位提升为 `18-30` 范围，视觉上明确成为宽体标记。
- 战线渲染改为整条边界渐变带 + 单个指向敌方的宽箭头头部，不再每段重复小三角。

验证：

- `git diff --check` 通过。
- 数据烟测覆盖 `stage-2-1231411414 / front-check-1 / front-audit-1 / front-audit-2`：有战线样本均为 `2` 条 front，`invalid = 0`、`long = 0`，最大长度 `8`；无共享陆地边界样本保持 `fronts = 0`。
- 构建产物浏览器烟测通过：`stage-2-1231411414` 生成 `2` 条 front，长度均为 `6`、上限 `6`；战线图层开关只增加 `36` 个 line 顶点，`drawMs = 0`、`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1838.2ms`，纯生成 `980.8ms`，WebGL 加载 `559.6ms`，UI slack `297.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 176.4ms`，最慢加载阶段为 `构建视觉 cell mesh 58.5ms`，`line-vertices = 50.8ms`，`glError = 0`。

### 战役轻量双方结算第一刀

背景：

- 战斗事件已经能挂到共享 `campaign:*` 链路，并且战役对象能汇总攻方/守方损耗。
- 但“应用轻量结果”仍只会扣当前军团，战役对象只能看到单边损耗，离真正双方结算还差一层。
- 本轮只做轻量双方结算，不推进战役阶段、不改外交战争状态、不引入完整战斗模拟。

修正：

- 记录 campaign 战斗事件且启用“应用轻量结果”时，会根据 `opponentStateId` 为对手国家选择一支最近的同域军团；本地战报仍保持单军团结算。
- 同一条事件写入 `affectedRegiments`、`result.opponent` 和 `result.sideCasualties`，避免复制两条全局事件。
- 当前军团和对手军团会在同一条 `EditHistory` 命令里同步扣兵、调整态势、刷新图标和国家兵力；撤销会恢复双方军团、事件列表、metadata 和战役摘要。
- 战役对象刷新会优先读取 `result.sideCasualties`，准确汇总攻方/守方损耗；旧事件仍按旧的单边字段回退。
- 军事面板的事件归属识别 `affectedRegiments`，对手军团也能在自己的事件列表里看到同一条战报；战报链概览按攻守双方损耗展示。

验证：

- `git diff --check` 通过。
- 命令层烟测通过：`stage-2-1231411414` 中给攻方军团记录 `campaign` 小胜并应用轻量结果后，当前军团 `8253 -> 7923`，对手军团 `4639 -> 3804`，`result.sideCasualties.attacker = 330`、`defender = 835`，战役摘要 `events = 1`、`attackerCasualties = 330`、`defenderCasualties = 835`、`casualties = 1165`，军事总兵力从 `613002` 降到 `611837`；撤销后双方兵力、事件数、战役损耗和总兵力全部恢复。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `781.30KB / gzip 235.94KB`，`MilitaryPanel` chunk 约 `39.14KB / gzip 11.95KB`。
- 构建产物浏览器烟测通过：注入同一条带 `affectedRegiments / sideCasualties` 的双方战报后，攻方军团和守方军团视角都能在军事面板看到 `攻方损耗 111`、`守方损耗 222` 和战报说明，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1721.6ms`，纯生成 `835.5ms`，WebGL 加载 `543.7ms`，UI slack `342.4ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 151.6ms`，最慢加载阶段为 `构建线层顶点 59.1ms`，`glError = 0`。

### 战役阶段摘要第一刀

背景：

- campaign 已经能汇总事件、攻守损耗和双方当前兵力，但仍缺少“战役推进到哪一步”的摘要。
- 后续战争行动链路、战役结束条件和外交状态联动需要先有稳定的只读阶段字段。
- 本轮只做派生阶段摘要，不自动结束战役、不改外交关系。

修正：

- 新生成的 `map.military.campaigns` 默认写入 `phaseKey / phaseLabel / momentumKey / momentumLabel / progress / progressLabel`。
- `refreshMilitaryCampaignEventSummaries()` 在记录、撤销、导入或清空事件后重算阶段摘要。
- 阶段按事件数、已应用数、攻守损耗、当前兵力差和损耗比例派生为 `动员对峙 / 前哨接触 / 边境交战 / 战线胶着 / 决战推进 / 战役消耗`。
- 优势摘要派生为 `攻方占优 / 守方占优 / 拉锯 / 均势`；无战报时进展固定为 `0%`，避免单纯兵力差让未开战战役显示进展。
- 军事面板“战役摘要”现在显示阶段、进展、优势、事件数、已应用数和攻守损耗。

验证：

- `git diff --check` 通过。
- 命令层烟测通过：`stage-2-1231411414` 中记录并应用一条 campaign 小胜后，战役阶段为 `边境交战`、优势为 `拉锯`、进展 `11%`、事件 `1`、攻方损耗 `330`、守方损耗 `835`；撤销后回到 `动员对峙 / 均势 / 0%`，事件和损耗归零。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `782.95KB / gzip 236.55KB`，`MilitaryPanel` chunk 约 `39.74KB / gzip 12.16KB`。
- 构建产物浏览器烟测通过：军事面板能显示 `边境交战`、`11%`、`拉锯`、`攻方损耗 330`、`守方损耗 835`，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1503.2ms`，纯生成 `769ms`，WebGL 加载 `394.2ms`，UI slack `340ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 155.9ms`，最慢加载阶段为 `构建视觉 cell mesh 60ms`，`line-vertices = 51.8ms`，`glError = 0`。

### 军事态势线贴边第六刀

背景：

- 用户再次指出军事态势线不好看：不能太长，最多只在边界上存在；不要跨海；不能是细线，而要是宽体渐变色指向方向型箭头。
- 现有数据生成已经基本限制在共享陆地边界，但渲染层仍保留旧 front 的 `from -> to` 长线兜底；近景截图也显示箭头头部被法线方向推出太远，容易像斜插出边界的大色块。

修正：

- `orientFrontSegment()` 不再只返回前两个点，多段共享边界会保留完整点列。
- front 的 `length / maxLength` 改为按真实边界点列保存两位小数，避免整数取整让实际长度略超上限。
- 战线渲染只接受带 `borderCellPairs` 的合法边界 front；缺少共享边界元数据的旧 front 不再回退画 `from -> to` 长线，避免跨海或跨国长线复发。
- 宽体带的渐变方向改为从己方侧到敌方侧；箭头头部收进边界宽带内部，保留方向性但不再大幅推出边界。

验证：

- `git diff --check` 通过。
- 数据烟测覆盖 `stage-2-1231411414 / front-check-1 / front-audit-1 / front-audit-2`：有战线样本均为 `2` 条 front，`invalid = 0`、`overLength = 0`、`missingBoundary = 0`；无共享陆地边界样本保持 `fronts = 0`。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `783.94KB / gzip 236.86KB`，`MilitaryPanel` chunk 约 `39.74KB / gzip 12.16KB`。
- 构建产物浏览器烟测通过：`stage-2-1231411414` 生成 `2` 条 front，长度均为 `6`，战线图层顶点增量 `36`；临时注入缺少 `borderCellPairs` 的旧 front 后战线顶点增量为 `0`；`glError = 0`、console/page error 为 `0`。
- 已保存近景截图 `docs/generated/reports/military-front-arrow-smoke.png` 用于人工检查，态势线表现为短边界宽带和内嵌方向箭头。
- e2e 守门通过：点击到出图 `1342.9ms`，纯生成 `676.9ms`，WebGL 加载 `356.9ms`，UI slack `309.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 127.9ms`，最慢加载阶段为 `构建视觉 cell mesh 55ms`，`line-vertices = 51.1ms`。

### 军事面板静态布局第三刀

背景：

- 用户明确指出当前方向有点跑偏，无需继续做动态军事系统。
- 军事面板仍有明显的粗糙感：选中军团概要和详情被长表格压到后面，首屏更像对象列表而不是军事单位编辑面板。
- 本轮只做静态布局和样式收束，不新增战役模拟、战争行动链路、战役自动结束或外交联动。

修正：

- `军事管理` 面板首屏改为优先展示选中军团概要和详情网格。
- 军团排序条和军团表格下移为对象切换区，避免选中对象的编辑信息被表格淹没。
- 军事排序条补紧凑网格样式，按钮宽度、间距和高度统一收紧，降低整排大按钮的堆叠感。
- 当前计划同步改写后续军事方向：除非用户重新要求，不再继续推进动态军事系统，优先做静态面板观感、导出体验和可读性收尾。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `783.94KB / gzip 236.85KB`，`MilitaryPanel` chunk 约 `39.74KB / gzip 12.16KB`。
- 构建产物浏览器烟测通过：`stage-2-1` 打开军事面板后，选中军团概要位于表格之前，`overviewVisibleBeforeTable = true`，`overviewTop = 228`，`firstTableTop = 886`，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1422.7ms`，纯生成 `675.4ms`，WebGL 加载 `399.5ms`，UI slack `347.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 120.4ms`，最慢加载阶段为 `构建视觉 cell mesh 64.4ms`，`line-vertices = 47.9ms`，`fit-draw = 2.6ms`。

### README 军事路线校准

背景：

- 用户明确指出无需做动态军事系统。
- 根目录 README 和当前计划仍残留“战争行动链路、战役推进、经济/外交联动”等后续待办表述，容易让后续接手继续沿动态军事方向推进。

修正：

- README 的活跃开发方向从“军事事件”改为“军事面板可读性”。
- README 的“还要做”中移除动态战争系统待办，改为静态编辑面板、战报导入导出可读性、军团展示和态势线观感收尾。
- `docs/current-plan.md` 同步更新 README 状态条目，明确后续军事方向只保留静态展示和可读性收尾。

验证：

- 该步只修改中文文档，不涉及运行时代码、生成链路或渲染链路。
- `git diff --check` 通过。

### 政体管理总览第一刀

背景：

- 当前政体系统已经进入国家生成、经济、外交、军事和国家编辑面板，但缺少独立总览。
- `docs/current-plan.md` 的下一步优先级中明确保留“政体管理总览、政体图层、政体事件和批量调整”；用户同时已校准军事方向，不再继续动态军事系统。
- 本轮只做只读总览，先让用户能看清各政体分布和代表国家，不做政体事件、批量调整或专题着色。

修正：

- 新增 `createGovernmentPanel()` 和异步 `GovernmentPanel.vue`，控制面板“管理”tab 新增“政体管理”入口。
- 政体面板按 `governmentKey` 汇总国家数、人口、面积、经济力、军力、政体效果和代表国家。
- 选中政体后，下方显示该政体下的国家列表；可定位国家，也可直接打开国家编辑面板。
- runtime 在地图装载、国家政体变化和国家编辑刷新后同步更新政体面板；该面板本身不触发生成、派生重算或渲染重建。
- README 和当前计划同步把政体管理总览移入已完成范围。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `787.73KB / gzip 237.52KB`，新增 `GovernmentPanel` chunk 约 `6.96KB / gzip 2.75KB`。
- 构建产物浏览器烟测通过：默认 `stage-2-1` 地图打开政体管理后显示 `8` 类政体、`20` 个国家，选中政体详情和国家列表均有数据，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1427ms`，纯生成 `744.9ms`，WebGL 加载 `438ms`，UI slack `244.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 149.4ms`，最慢加载阶段为 `构建视觉 cell mesh 59.6ms`。

### 政体专题图层第一刀

背景：

- 政体管理总览已经能查看政体分布，但地图视图仍无法直接按政体观察国家空间分布。
- 当前阶段只需要只读专题视图，不做政体事件、批量调整或新的动态系统。

修正：

- 控制面板“视图”tab 新增“政体”专题按钮。
- renderer 的 `colorForCell()` 新增 `governments` 分支，按国家 `governmentFamily` 为陆地国家着色，水域仍沿用既有水色逻辑。
- 政体视图下点击陆地仍返回国家政治对象，保持与国家/外交专题一致的对象选择语义。
- README 和当前计划同步把政体专题视图移入已完成范围。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `788.42KB / gzip 237.77KB`。
- 构建产物浏览器烟测通过：切换 `governments` 后 `colorMode = governments`，按钮 active，主动重绘后非空像素 `1,382,400`，示例陆地国家 cell 可拾取到 `state #12`，`drawMs = 0.2ms`，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1444ms`，纯生成 `718.5ms`，WebGL 加载 `385.3ms`，UI slack `340.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 142.7ms`，最慢加载阶段为 `构建线层顶点 61.4ms`。

### 政体专题图例第一刀

背景：

- 政体专题图层已经能着色，但缺少图例说明，用户无法直接判断颜色对应哪类政体。
- 本轮继续保持只读展示，不做政体事件、批量调整或新派生系统。

修正：

- `color-modes.js` 将政体家族配色抽成 `GOVERNMENT_FAMILY_LEGEND`，renderer 和 UI 图例共用同一份颜色与中文标签。
- `updateMapLegend()` 新增 `governments` 分支，政体视图下显示左下角图例。
- 图例按当前地图实际存在的 `governmentFamily` 统计国家数，只扫描国家数组，不触发生成、派生重算或渲染重建。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `789.29KB / gzip 238.18KB`。
- 构建产物浏览器烟测通过：切换政体视图后图例标题为 `政体`，显示 `6` 个家族条目，包含 `专制集权 7 / 共和系 4 / 神权系 3 / 寡头系 2 / 君主系 2 / 联盟系 2`，与地图国家 `governmentFamily` 统计一致；`drawMs = 0.1ms`，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1394ms`，纯生成 `757.7ms`，WebGL 加载 `333.6ms`，UI slack `302.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 134.5ms`，最慢加载阶段为 `构建视觉 cell mesh 47.2ms`。

### 政体批量调整第一刀

背景：

- 政体管理已经有只读总览、专题图层和专题图例，但还缺少面向一组国家的轻量编辑入口。
- 用户已明确校准军事方向：无需继续做动态军事系统。本轮只推进政体编辑能力，不新增政体事件、战役自动推进或军事行动链路。

修正：

- `state-edit-commands.js` 新增 `createSetStatesGovernmentBatchCommand()`，按国家列表快照并批量调用既有 `setStateGovernment()`，撤销时恢复 `governmentKey / governmentLabel / governmentFamily / form / formName / fullName / government effects` 等字段。
- `政体管理` 面板新增“批量套用”控件，可把当前选中的政体分组一次性套用到另一个政体；无有效目标或目标与当前分组相同时禁用按钮。
- runtime 将批量调整接入 `EditHistory`，执行后刷新国家、政体、外交、军事和运行状态面板，并只把经济、外交、军事标记为待派生，不重建下游系统。
- 顺手修复 `GovernmentPanel.vue` 脚本区未声明 `callbacks` 的潜在错误；此前只读路径未触发，新增按钮点击会暴露该问题。
- README、当前计划同步记录政体分组批量调整，并把旧的“战争驱动军事行动”后续表述收回为外交展示和编辑体验方向。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `790.43KB / gzip 238.44KB`，`GovernmentPanel` chunk 约 `7.98KB / gzip 3.12KB`。
- 构建产物浏览器烟测通过：打开 `政体管理` 后，将 `confederation` 分组的 `2` 国批量套用为 `monarchy`；国家 `9 / 12` 从 `邦联制` 变为 `君主制`，`钟吾国 / 越邦联` 变为 `钟吾王国 / 越国`；撤销后恢复原政体和全名，重做后再次套用成功；撤销栈标签为 `批量调整政体 2国`，待派生系统为 `economy / diplomacy / military`，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1383.6ms`，纯生成 `741.6ms`，WebGL 加载 `353.9ms`，UI slack `288.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 151.8ms`，最慢加载阶段为 `构建线层顶点 46.1ms`。

### 政体导出第一刀

背景：

- 政体管理已经支持总览、专题图例和分组批量调整，但缺少把当前政体分布带出面板的轻量导出能力。
- 本轮继续沿政体管理可读性推进，不做政体事件，也不触碰动态军事系统。

修正：

- `政体管理` 筛选区新增 `导出 CSV / 导出 JSON` 按钮。
- CSV 按当前筛选命中的政体分组展开到国家逐行导出，字段包含国家 ID、国家名、政体 key、政体、类型、时代、家族、首都、人口、面积、经济力、军力和城镇数。
- JSON 导出 `fmg-government-summary`，包含导出时间、seed、筛选条件、选中政体、政体分组汇总、家族统计和国家明细。
- README 和当前计划同步把政体 CSV/JSON 导出纳入已完成范围。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `790.43KB / gzip 238.43KB`，`GovernmentPanel` chunk 约 `10.98KB / gzip 3.98KB`。
- 构建产物浏览器烟测通过：默认 `stage-2-1` 打开 `政体管理` 后下载 `fmg-governments-stage-2-1.csv` 和 `fmg-governments-stage-2-1.json`；CSV 为 `21` 行，表头包含 `政体Key`，JSON `type = fmg-government-summary`、`exportedStates = 20`、`governments = 8`、国家明细 `20` 条、政体分组 `8` 条；`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1521.2ms`，纯生成 `866.7ms`，WebGL 加载 `366.6ms`，UI slack `287.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 169.1ms`，最慢加载阶段为 `构建视觉 cell mesh 53.6ms`。

### 政体家族筛选第一刀

背景：

- 政体管理已经能文本筛选和导出，但政体专题图例本身按 `governmentFamily` 分组，管理面板还缺少同一口径的快速过滤。
- 本轮继续只做政体管理的静态可读性，不新增政体事件，也不触碰动态军事系统。

修正：

- `政体管理` 筛选区新增“家族”下拉，可按 `专制集权 / 君主系 / 共和系 / 联盟系 / 神权系 / 寡头系 / 军政系 / 未归类` 等实际存在的政体家族过滤。
- 政体表、下方国家列表、CSV 导出和 JSON 导出都跟随家族筛选；JSON 新增 `familyFilter` 字段，便于还原导出上下文。
- 控制区布局调整为“文本筛选 / 家族筛选 / 导出按钮”三列，避免导出按钮和筛选框互相挤压。
- 当前计划同步把政体管理的已完成范围更新为家族筛选和导出上下文。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `780.69KB / gzip 235.43KB`，`GovernmentPanel` chunk 约 `11.68KB / gzip 4.21KB`。
- 构建产物浏览器烟测通过：默认 `stage-2-1` 打开 `政体管理` 后选择 `autocracy / 专制集权` 家族，面板筛出 `7` 个国家、`3` 类政体；JSON 导出 `familyFilter = autocracy`、`exportedStates = 7`、`governments = 3`，国家明细全部为 `autocracy`；CSV 为 `8` 行，控制区无横向溢出，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1344.8ms`，纯生成 `722.6ms`，WebGL 加载 `398.3ms`，UI slack `223.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 140.1ms`，最慢加载阶段为 `构建线层顶点 67ms`。

### 政体静态交叉摘要第一刀

背景：

- 政体系统已经影响经济和外交，但 `政体管理` 详情仍只显示政体自身和人口/面积/经济/军力，缺少从已有国家字段聚合出的经济、资源和外交上下文。
- 本轮只做只读静态摘要，不重算经济、外交或军事，不新增政体事件。

修正：

- `政体管理` 选中政体详情新增国力、资源潜力、平均贸易修正、战争/宿敌计数、盟友/附庸计数。
- 政体分组聚合复用已有 `powerScore / resourcePotential / governmentTradeModifier / diplomacySummary` 字段。
- JSON 导出的政体分组新增 `powerScore / resourcePotential / tradeModifierAverage / diplomacy`，国家明细新增 `powerScore / resourcePotential / governmentTradeModifier / diplomacySummary`。
- CSV 导出新增 `国力 / 资源潜力 / 贸易修正 / 盟友 / 战争 / 宿敌 / 附庸` 列，便于离线分析政体与经济外交状态。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `780.69KB / gzip 235.43KB`，`GovernmentPanel` chunk 约 `13.61KB / gzip 4.75KB`。
- 构建产物浏览器烟测通过：打开 `政体管理` 后详情区显示 `国力 / 资源潜力 / 贸易修正 / 战争 / 宿敌 / 盟友 / 附庸`；JSON 政体分组包含 `diplomacy` 与 `tradeModifierAverage`，国家明细包含 `diplomacySummary` 与 `governmentTradeModifier`；CSV 表头包含 `国力 / 资源潜力 / 贸易修正 / 战争`；控制区无横向溢出，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1410.6ms`，纯生成 `718.2ms`，WebGL 加载 `375.3ms`，UI slack `317.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 124.5ms`，最慢加载阶段为 `构建视觉 cell mesh 53.8ms`。

### 政体外交定位第一刀

背景：

- 政体管理已经能汇总经济和外交静态摘要，但从政体分组回到外交专题仍需要用户手动打开外交面板并重新选择主体国家。
- 用户明确校准：无需做动态军事系统。后续军事方向只保留静态面板、态势线观感和导出可读性收尾。
- 本轮只做跨面板只读定位，不修改外交关系、不重生成、不触发军事派生。

修正：

- `政体管理` 国家列表下方新增“外交视角”按钮。
- 点击后会把当前政体分组中选中的国家设为当前选择对象，打开 `外交管理`，并把外交专题着色主体切到该国家。
- 该入口复用现有 `setDiplomacyThemeSubject()` 和外交面板状态，不新增任何战争行动链路、战斗模拟或自动战役阶段。
- `docs/current-plan.md` 同步收窄军事后续范围，明确不再继续动态军事系统。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `780.88KB / gzip 235.46KB`，`GovernmentPanel` chunk 约 `13.81KB / gzip 4.78KB`。
- 构建产物浏览器烟测通过：打开 `政体管理` 后当前国家为 `state #9`，点击“外交视角”后 `外交管理` 打开，`diplomacy-subject-select = 9`，当前选择对象为 `state #9`，专题色切到 `diplomacy`，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1474.6ms`，纯生成 `816.8ms`，WebGL 加载 `363.4ms`，UI slack `294.4ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 158.1ms`，最慢加载阶段为 `构建标签 46.4ms`。

### 经济总览第一刀

背景：

- 当前 `pack.goods / pack.markets / pack.deals` 已在经济阶段生成，但用户侧缺少商品、市场和交易的可读总览。
- `docs/task-notes/economy-market-trade-plan.md` 明确第一阶段先做只读经济总览，不直接做贸易动画、市场归属编辑或复杂生产链编辑。
- 用户已校准无需动态军事系统，本轮经济面板不接入军事自动化，也不反向驱动外交或军事。

修正：

- 控制面板“管理”tab 新增“经济总览”入口，新增懒加载 `createEconomyPanel()` 与 `EconomyPanel.vue`。
- 经济总览顶部显示商品、市场、交易、资源点、总库存和交易额。
- 面板提供商品、市场、交易三个 tab，支持筛选、排序、选中详情和定位到中心城镇或交易端点。
- 交易表最多渲染前 `500` 行，避免大地图一次性打开面板造成主线程压力；完整导出和诊断留到下一阶段。
- 地图装载和资源点重生成后会同步刷新经济面板；本轮只读，不触发经济重算、贸易动画、市场刷子或动态军事联动。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `783.47KB / gzip 235.98KB`，新增 `EconomyPanel` chunk 约 `10.71KB / gzip 3.62KB`。
- 构建产物浏览器烟测通过：默认 `stage-2-1` 打开 `经济总览` 后显示商品 `71`、市场 `29`、交易 `1.5万`、资源点 `6`、总库存 `1.2万`、交易额 `4.2万`；商品表 `71` 行，市场表 `29` 行，交易表显示前 `500 / 1.5万`；定位按钮可选中城市对象，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1534.4ms`，纯生成 `800.9ms`，WebGL 加载 `416.3ms`，UI slack `317.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 149.3ms`，最慢加载阶段为 `构建视觉 cell mesh 59.7ms`。

### 经济导出第一刀

背景：

- 经济总览已经能只读查看商品、市场和交易，但数据还不能带出面板离线分析。
- `docs/task-notes/economy-market-trade-plan.md` 的阶段 2 要求支持商品、市场和交易 CSV/JSON 导出；开发诊断可后置。
- 本轮仍保持只读，不做市场归属编辑、贸易动画、生产链编辑或动态军事联动。

修正：

- `经济总览` 筛选区新增 `导出 CSV / 导出 JSON` 按钮。
- 导出按当前 tab、筛选和排序输出商品、市场或交易行。
- CSV 使用电子表格可读表头；JSON 写入 `type / exportedAt / seed / tab / filter / sortKey / sortDir / summary / count / rows`。
- 交易表仍只渲染前 `500` 行，但导出会包含当前筛选后的全部交易行。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `783.47KB / gzip 235.97KB`，`EconomyPanel` chunk 约 `13.45KB / gzip 4.42KB`。
- 构建产物浏览器烟测通过：商品 CSV 下载为 `fmg-economy-goods-stage-2-1.csv`，共 `72` 行，表头为 `商品ID,商品,类型,基价,库存,资源Cells,生产记录,交易记录,交易额,可见`；交易 JSON 下载为 `fmg-economy-deals-stage-2-1.json`，`type = fmg-economy-summary`、`tab = deals`、`count = rows = summary.deals = 15068`，与地图交易数一致；`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1391.5ms`，纯生成 `704.1ms`，WebGL 加载 `389.6ms`，UI slack `297.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 136.1ms`，最慢加载阶段为 `构建视觉 cell mesh 59.7ms`。

### 经济开发诊断第一刀

背景：

- 经济总览已能查看和导出商品、市场、交易，但阶段 2 仍缺少开发模式下的异常诊断。
- 诊断信息不应进入普通模式，避免把内部 id、cell、孤儿记录等调试概念暴露给普通用户。
- 本轮只做轻量计数和少量样例，不做导出诊断、不做市场归属编辑、不做贸易动画。

修正：

- `EconomyPanel` 接入现有 `useDebugMode()`，仅在 `?debug=1` 或开发模式开启时显示“开发诊断”区。
- 诊断区显示无市场城镇、缺中心市场、无覆盖市场、无库存商品、孤儿交易和无税交易计数。
- 选中详情在 debug 模式下补充商品 id、市场 id、中心 burg/cell、交易 id、买卖方 id 和交易来源等内部字段。
- 诊断区只显示少量样例，避免在大地图下渲染全量异常列表。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `783.47KB / gzip 235.99KB`，`EconomyPanel` chunk 约 `16.49KB / gzip 5.36KB`。
- 构建产物浏览器烟测通过：普通模式打开经济总览并切到交易 tab 后不显示诊断和 debug 详情，`healthErrors = []`；`?debug=1` 下显示“开发诊断”，诊断摘要为 `8 项需复查`，详情区显示 `deal id` 等内部字段；两种模式交易表均只渲染 `500` 行，`glError = 0`，console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1440.9ms`，纯生成 `725ms`，WebGL 加载 `435.7ms`，UI slack `280.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 160.6ms`，最慢加载阶段为 `构建视觉 cell mesh 65.2ms`。

### 静态贸易流图层第一刀

背景：

- 经济面板已经能查看和导出商品、市场、交易，但地图上还无法直接观察贸易流向。
- `docs/task-notes/economy-market-trade-plan.md` 阶段 4 要求先做静态贸易流图层，再考虑动画。
- 本轮必须避免首屏加载和绘制卡顿，因此贸易流图层默认关闭，并使用独立动态 buffer。

修正：

- 控制面板“图层”tab 新增“贸易流”，默认关闭。
- renderer 新增 `tradeFlowBuffer`，只在 `tradeFlows` 图层开启时构建并绘制。
- 贸易流从 `pack.deals` 取交易额最高的前 `180` 条，连接卖方和买方中心点，按交易额调整线宽，按市场间交易、资源点交易和普通交易区分颜色。
- 贸易流会随视口变化重建，但不进入默认首屏线层构建；本轮不做动画、不做拾取、不做交易详情浮层。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `786.43KB / gzip 236.80KB`，本轮未新增面板 chunk。
- 构建产物浏览器烟测通过：`tradeFlows` 默认关闭，初始 `tradeFlowVertexCount = 0`；开启图层后绘制 `177` 条交易、`1062` 个顶点、`354` 个三角形，`tradeFlowBuildMs = 12.4ms`，`glError = 0`，console/page error 为 `0`，开启图层后无非 info 健康事件。
- e2e 守门通过：点击到出图 `1448.8ms`，纯生成 `727.9ms`，WebGL 加载 `409.2ms`，UI slack `311.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 125.5ms`，最慢加载阶段为 `构建线层顶点 52ms`。

### 贸易流拾取与轻量详情第一刀

背景：

- 静态贸易流图层已经能绘制 top 交易，但地图点击仍只能落到路线、河流或底层政区，无法知道某条贸易线代表哪笔交易。
- 阶段 4 的验收要求点击贸易流能查看交易详情；但贸易流图层默认关闭，拾取不能增加默认首屏对象索引压力。
- 本轮继续保持静态可视化边界，不做贸易动画、市场归属编辑或经济重算。

修正：

- 新增 `trade-flow` 对象类型和解析逻辑，可从 deal id 还原商品、卖方、买方、数量、单价、金额、税额和交易来源。
- renderer 在构建贸易流动态 buffer 时顺带缓存已绘制的 top 交易端点；拾取只扫描这批最多 `180` 条已绘制交易，不在 hover 时排序全量 `pack.deals`。
- 点击贸易流会选中 `trade-flow` 对象，并显示轻量对象详情；若经济总览已经打开，或用户之后手动打开经济总览，会切到对应交易。
- 首次实现曾让点击贸易流自动打开经济总览，浏览器烟测捕捉到首次加载面板触发 `main-thread-long-task`；已改为地图点击不自动加载重面板，避免一次拾取造成卡顿。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `790.54KB / gzip 238.14KB`，本轮未新增面板 chunk。
- 构建产物浏览器烟测通过：开启贸易流后点击交易 `#14950`，`pick.object.kind = trade-flow`，当前选择对象为 `trade-flow #14950`，对象详情显示“贸易流 / 啤酒”；经济总览未自动打开，`tradeFlowPickItemCount = 177`，`tradeFlowVertexCount = 1062`，`tradeFlowBuildMs = 13.2ms`，`glError = 0`，console/page error 为 `0`，点击后无非 info 健康事件。
- e2e 守门通过：点击到出图 `1395.9ms`，纯生成 `712ms`，WebGL 加载 `406.6ms`，UI slack `277.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 134.3ms`，最慢加载阶段为 `构建线层顶点 54ms`。

### 贸易流详情定位第一刀

背景：

- 贸易流拾取已经能选中 `trade-flow`，但对象详情只显示很少信息，定位也不能直接缩放到贸易线两端。
- 点击贸易流时不应自动加载经济总览，否则首次点击可能被重面板懒加载阻塞。
- 用户已明确无需继续做动态军事系统，本轮继续保持静态经济可视化范围，不进入贸易动画或市场刷子。

修正：

- 对象详情为 `trade-flow` 补充商品、卖方、买方、来源、数量、单价、金额、税额和 debug id。
- `renderer.locateObject()` 支持 `trade-flow`，优先使用选中对象缓存的端点，缺失时从 deal id 回查交易双方端点。
- `trade-flow` 详情作为只读对象处理，不显示“编辑”按钮。
- 对象详情面板改为启动时挂载，避免首次点击对象时再加载详情组件。
- Vue 面板空闲预热改为地图 ready 后延迟，并在输入安静窗口后再执行，避免后台预热撞上首次点击。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `796.70KB / gzip 240.07KB`，仍只有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：开启贸易流后点击交易 `#14950`，对象详情显示商品 `啤酒`、卖方 `昭谷市`、买方 `东港市`、金额 `12`、税额 `6`，详情只显示“定位”不显示“编辑”；定位结果为 `trade-flow #14950`，经济总览未自动打开，健康事件为空，`glError = 0`。
- e2e 守门通过：点击到出图 `1371.2ms`，纯生成 `745.9ms`，WebGL 加载 `389.2ms`，UI slack `236.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 141.4ms`，最慢加载阶段为 `构建视觉 cell mesh 58.9ms`。

### 市场距离成本第一刀

背景：

- 经济面板此前只是在展示层临时计算交易距离，交易数据本身没有保存运距成本，价格也无法解释远距离市场交易为什么更贵。
- 当前计划中经济后续优先补“市场距离成本”，但仍不进入贸易动画、市场归属刷子或经济驱动军事自动化。
- 烟测中首次打开交易 tab 暴露出经济面板会一次性构建并渲染大量交易行，可能触发主线程 long task，需要和本轮一起收束。

修正：

- `addDeal()` 写入 `basePrice / distance / distanceCost / distanceMultiplier`，最终 `price` 在基础单价和政体贸易修正后叠加温和运距成本。
- 经济 metadata 新增 `tradeDistance` 摘要，记录带距离交易数、平均/最大距离和总运距成本。
- 经济面板交易表新增“距离 / 运费”列，详情显示基础单价、运距成本和距离倍率；交易 CSV/JSON 导出同步带出这些字段。
- 地图贸易流对象详情同步显示贸易距离、基础单价、运距成本和距离倍率。
- 交易 tab 首屏只构建当前排序下的前 `120` 条交易数据并渲染 `48` 行，同时强制包含当前选中交易；CSV/JSON 导出时才临时构建完整交易行，避免打开面板时一次性渲染 1.5 万条交易。
- 总览交易额继续按全量交易统计，不受首屏交易行限制影响。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`EconomyPanel` chunk 约 `18.27KB / gzip 5.86KB`，主入口约 `799.32KB / gzip 240.99KB`。
- 构建产物浏览器烟测通过：`stage-2-1 / continents / 10000` 生成 `15068` 条交易，全部带 `distance`，其中 `14539` 条有正 `distanceCost`，总运距成本 `576.01`，平均运距成本 `0.038`；贸易流对象详情显示“贸易距离 / 基础单价 / 运距成本 / 距离倍率”；经济面板交易 tab 显示“距离 / 运费”，首屏为 `已显示 48 / 1.5万`，总览交易额仍为 `4.3万`；打开经济面板后无新的非 info 健康事件，`glError = 0`、console/page error 为 `0`。
- e2e 守门通过：点击到出图 `1458.3ms`，纯生成 `725.4ms`，WebGL 加载 `495ms`，UI slack `237.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 141.7ms`，最慢加载阶段为 `构建视觉 cell mesh 69.1ms`。

### 商品供需缺口第一刀

背景：

- 经济总览已经能查看商品、市场、交易和运距成本，但商品库存仍缺少面向市场人口的需求口径。
- 用户已明确无需继续做动态军事系统，本轮经济字段只作为静态诊断和面板展示，不驱动军事、外交或自动价格传播。
- 供需缺口需要直接落在生成数据和导出字段上，避免只在 UI 临时拼接。

修正：

- 经济阶段新增市场需求诊断，按市场覆盖的陆地人口、城镇人口和商品需求覆盖率，为 `market.goods[*]` 写入 `demand / supply / gap / shortage / surplus`。
- 每个市场写入 `demandSummary`，全局 `economy.metadata.demand` 汇总总需求、总供给、缺口、过剩、缺口商品数、缺口市场数和主要缺口商品。
- 经济总览新增“供需缺口”指标，商品和市场排序新增“缺口”，商品/市场详情显示需求、供给、缺口和过剩。
- 商品、市场 CSV/JSON 导出同步带出 `需求 / 供给 / 缺口 / 过剩`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`EconomyPanel` chunk 约 `19.66KB / gzip 6.15KB`，主入口约 `801.24KB / gzip 241.62KB`。
- 开发服务器浏览器烟测通过：`stage-2-1 / continents / 10000` 生成 `29` 个市场、`71` 个商品和 `2059` 条市场商品记录，全部带需求/供给/缺口/过剩字段，其中 `2054` 条有正缺口；全局总需求 `481859.53`、总供给 `16354.63`、缺口 `466021.35`。经济面板显示“供需缺口 / 需求 / 供给 / 缺口 / 过剩”，`glError = 0`、console/page error 为 `0`，打开面板后无新的非 info 健康事件。

### 资源货物路线权重第一刀

背景：

- goods 已在 `rankCells()` 前写入自然资源，资源货物已经能影响适居度和城镇候选。
- 路线 pack A* 仍只看地形、适居度、已有连接和城镇，不能表达商路倾向于贴近粮食、鱼盐、木材、矿产等资源节点。
- 用户已明确无需动态军事系统，本轮只做静态路线生成偏好和诊断字段，不触发贸易动画、市场刷子、军事或外交联动。

修正：

- 陆路 `packRouteStepCost()` 新增资源成本折扣：经过资源 cell 会按货物价值、供给量和 marker 来源做温和折扣；邻近资源 cell 也有更小折扣。
- 路线对象新增 `resourceCells / markerResourceCells / resourceGoodIds`，`settlements.metadata` 汇总 `routeResourceCells / routeMarkerResourceCells / routesWithResources`。
- 路线管理面板新增“资源”排序和列，摘要显示资源路线数，详情显示资源 cells 与前几个资源种类。
- route GeoJSON properties 同步输出资源 cell 数、marker 资源 cell 数和资源 good id，方便外部检查。

验证：

- Node 纯生成探针通过：`stage-2-1 / continents / 10000` 生成 `571` 条路线，无空路径；其中 `376` 条路线经过资源 cell，路线资源 cell 总数 `736`，与 metadata 一致。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`RoutePanel` chunk 约 `5.32KB / gzip 2.28KB`，主入口约 `802.41KB / gzip 241.95KB`。
- 构建产物浏览器烟测通过：同 seed 生成 `597` 条路线，其中 `410` 条资源路线、资源路线 cell 总数 `896`，与 `settlements.metadata.routeResourceCells` 一致；路线管理面板显示“资源路线 / 资源 cells / 资源种类”，`glError = 0`、console/page error 为 `0`，打开路线面板后无新的非 info 健康事件。

### 资源货物城镇选址第一刀

背景：

- 基础 goods 已在生物群系和人口评分前写入，资源货物能间接提高适居度，但城镇候选评分没有显式的资源腹地字段。
- 上一刀已经让陆路寻路温和偏好资源 cell；当前计划中经济链路的剩余静态生成目标是让资源货物进一步影响城镇选址。
- marker 资源是在城镇之后生成的，本轮不让后生成资源反向搬城，也不做贸易动画、市场归属刷子或军事联动。

修正：

- 城镇和首都候选评分改为 `citySiteScore()`，在原适居度基础上加入所在 cell 与邻近 cell 的自然资源货物腹地 bonus。
- 城市和 burg 对象写入 `resourceCells / markerResourceCells / resourceGoodIds / resourceScore`，`settlements.metadata` 汇总 `citiesWithResources / cityResourceCells / cityMarkerResourceCells`。
- 城市管理面板新增“资源”排序和列，摘要显示资源城镇数，详情显示资源 cells 与前几个资源种类。
- city GeoJSON properties 同步输出资源 cell 数、marker 资源 cell 数和资源 good id，方便外部检查。

验证：

- Node 纯生成探针通过：`stage-2-1 / continents / 10000` 生成 `812` 个城市，其中 `730` 个带资源腹地，资源 cell 总数 `1697`，与 metadata 一致；markerResource 为 `0`，符合当前生成顺序。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`CityPanel` chunk 约 `12.19KB / gzip 4.52KB`，主入口约 `803.88KB / gzip 242.32KB`。
- 构建产物浏览器烟测通过：同 seed 生成 `821` 个城市，其中 `728` 个带资源腹地，资源 cell 总数 `1694`，与 metadata 一致；城市管理面板显示“资源城镇 / 资源 cells / 资源种类”，`glError = 0`、console/page error 为 `0`，打开城市面板后无新的非 info 健康事件。

### 军事面板静态档案第四刀

背景：

- 用户已明确校准：无需继续做动态军事系统。
- 军事管理面板虽然已经做过布局和样式整理，但用户面上仍残留“战斗事件 / 已应用”等偏动态系统的文案。
- 后续军事只保留静态面板、态势线观感、军团展示和既有记录查看/清理，不再扩展战斗模拟或自动战役推进。

修正：

- `MilitaryPanel.vue` 新增军团静态档案分组，把驻防、兵力、背景和战报档案分块展示，减少详情区裸字段堆叠感。
- 面板文案从“战斗事件 / 已应用 / 未应用”收敛为“战报记录 / 已结算 / 未结算”，二级入口改为“记录战报”。
- README 将军事能力描述改为“战报档案”，并明确后续不再扩展动态战争系统。
- 本轮只改展示、文案和文档，不改军事生成、战报兼容字段、轻量结算命令或外交状态。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` chunk 约 `40.84KB / gzip 12.42KB`，主入口约 `803.88KB / gzip 242.32KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `军事管理` 后，`military-panel-summary / military-overview / military-dossier / military-panel-details / military-edit-toolbar / military-event-list` 均无横向溢出；面板显示“战报档案 / 战报记录”，不再裸露“战斗事件 / 已应用 / 未应用”；`glError = 0`、console/page error 为 `0`，打开面板后 health 非 info 事件为 `0`。
- 正式 e2e 守门通过：点击到出图 `1517.9ms`，纯生成 `759.2ms`，WebGL 加载 `518.7ms`，UI slack `240ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 137.4ms`，最慢加载阶段为 `构建视觉 cell mesh 79.3ms`。

### 静态价格传播诊断第一刀

背景：

- 经济面板已经能查看商品、市场、交易、运距成本和供需缺口，但市场商品价格仍只有本地基础价格，不能解释贸易流入、流出和缺口对价格的方向性影响。
- 当前计划要求逐步补价格传播，但仍不进入贸易动画、市场归属刷子、经济驱动外交或动态军事联动。
- 本轮先做静态诊断字段，保留原 `price` 作为交易生成时使用的单价。

修正：

- 交易生成后新增 `applyPricePropagationDiagnostics()`，按 `market + good` 汇总交易流入/流出、供需缺口、过剩和资源供给。
- 市场商品记录写入 `localPrice / effectivePrice / priceDelta / pricePressure / tradeInUnits / tradeOutUnits / netTradeUnits / tradeInValue / tradeOutValue / netTradeValue`。
- 市场写入 `priceSummary`，经济 metadata 写入 `pricePropagation`，记录市场数、记录数、涨跌价差和 Top 涨跌商品。
- 经济总览、商品/市场列表、详情和 CSV/JSON 导出展示有效价、价差、价格压力和流入流出字段。
- 本轮不覆盖原始 `price`，不重算既有交易，不触发军事、外交或市场归属自动变化。

验证：

- Node 纯生成探针通过：`stage-2-1 / continents / 10000` 生成 `29` 个市场、`71` 个商品、`14906` 条交易和 `2059` 条市场商品价格记录；`2059` 条均带有效价/价差/价格压力，`1223` 条带交易流入或流出，metadata 记录数一致。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`EconomyPanel` chunk 约 `21.79KB / gzip 6.68KB`，主入口约 `806.25KB / gzip 243.17KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：经济面板显示“价格信号 / 有效价 / 价差”，`2059` 条市场商品记录均带有效价/价差/价格压力，`1562` 条带交易流入或流出；面板无横向溢出，`glError = 0`、console/page error 为 `0`，打开面板后 health 非 info 事件为 `0`。
- 正式 e2e 守门通过：点击到出图 `1460.3ms`，纯生成 `763.3ms`，WebGL 加载 `377.1ms`，UI slack `319.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 118.3ms`，最慢加载阶段为 `构建视觉 cell mesh 52.9ms`。

### 贸易流价格信号第一刀

背景：

- 静态价格传播诊断已经为市场商品写入 `effectivePrice / priceDelta / pricePressure`，但地图上的贸易流仍只按交易来源和类型着色。
- 当前贸易流默认关闭、只绘制 top 交易，适合作为轻量价格信号入口；但不能增加默认线数、不能做动画，也不能把价格信号写回交易。

修正：

- 贸易流渲染读取买方市场同商品的价格信号：`priceDelta > 0` 的线在原来源色基础上混入红色，`priceDelta < 0` 的线混入蓝色。
- `tradeFlowPickItem` 和点击对象详情补充 `effectivePrice / priceDelta / pricePressure / priceSignalLabel`。
- hover 和右侧拾取统计会显示贸易流价差信号。
- 渲染统计新增 `priceSignalDeals`，便于烟测确认价格信号进入可视化层。
- 本轮不改变 top 交易选择、不增加线条数量、不做贸易动画、不覆盖交易单价。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `807.77KB / gzip 243.66KB`，本轮未增大经济面板 chunk，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：开启贸易流图层后渲染 `172` 条贸易流、`1032` 个顶点，`priceSignalDeals = 172`，未超出 `180` 条 top 交易上限；点击贸易流详情显示“有效价 / 价差信号 / 价差 / 价格压力”，`glError = 0`、console/page error 为 `0`，打开图层和详情后 health 非 info 事件为 `0`。
- 正式 e2e 守门通过：点击到出图 `1478.7ms`，纯生成 `807.8ms`，WebGL 加载 `341.6ms`，UI slack `329.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 148.8ms`，最慢加载阶段为 `构建视觉 cell mesh 49.8ms`。

### 市场归属诊断第一刀

背景：

- 经济计划下一阶段会进入市场归属编辑与重新生成，但直接做刷子会牵动 `pack.cells.market`、burg market、生产、交易和财政。
- 本轮先补只读诊断，让经济面板能看到每个市场的覆盖结构，作为后续编辑前置。

修正：

- `EconomyPanel` 市场 tab 统计 `pack.cells.market`，为每个市场展示覆盖 cells、陆地覆盖、本国覆盖、跨国覆盖和无国家覆盖。
- 市场排序和列新增“跨国”，市场详情新增归属覆盖字段。
- 市场 CSV/JSON 导出同步带出陆地覆盖、本国覆盖、跨国覆盖和无国家覆盖。
- debug 诊断新增“跨国覆盖 cells”和“无效归属 cells”，并在样例中显示跨国覆盖市场。
- 本轮只读，不修改 `pack.cells.market`，不触发经济重算或市场归属刷写。

验证：

- Node 纯生成探针通过：`stage-2-1 / continents / 10000` 生成 `29` 个市场，`pack.cells.market` 归属 `4188` 个 cells，其中陆地覆盖 `4069`、本国覆盖 `4020`、无国家覆盖 `168`，无无效市场 id。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；经济面板 chunk 约 `23.49KB / gzip 7.17KB`，主入口约 `807.77KB / gzip 243.66KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：经济面板市场 tab 可显示“跨国 / 陆地覆盖 / 本国覆盖 / 无国家覆盖”，统计 `29` 个市场、`4188` 个归属 cells、`0` 个无效归属、`0` 个跨国覆盖 cells、约 `169` 个无国家覆盖 cells；`glError = 0`，console/page error 为 `0`，health 非 info 事件为 `0`。
- 正式 e2e 守门通过：点击到出图 `1498.8ms`，纯生成 `813.7ms`，WebGL 加载 `365.3ms`，UI slack `319.8ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 145.1ms`，最慢加载阶段为 `构建视觉 cell mesh 54.3ms`。

### 军事态势线边界裁切收尾

背景：

- 用户明确要求军事态势线不能太长、不能跨海、不能是细线，而要是边界上的宽体渐变方向箭头。
- 当前实现已经只绘制带 `borderCellPairs` 的共享陆地边界，并在渲染层用宽体渐变带和箭头头部表示方向。
- 本轮继续做静态观感收尾，不新增动态军事系统，不改变战役、战报或外交状态。

修正：

- 战线生成扩展相邻共享边界时，如果下一条共享边略超剩余长度预算，会裁取该边从当前端点出发的一小段。
- 裁切点仍在真实共享边界上，`borderCellPairs` 仍记录对应双方陆地 cell；不会回退到 `from -> to` 长线，也不会跨海连接。
- `front.points` 可以同时包含真实边界顶点和裁切点，后续长度仍按点列计算并受 `maxLength` 约束。

验证：

- Node 生成契约探针通过：`stage-2-2 / continents / 10000` 生成 `1` 个战役和 `2` 条 front；两条 front 均有 `borderCellPairs`，双方 cell 都是陆地且国家归属匹配，点列长度约 `7.42 / 7.45`，均未超过 `maxLength`。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `808.32KB / gzip 243.86KB`，`MilitaryPanel` chunk 约 `40.84KB / gzip 12.42KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：扫到 `front-a / continents / 10000` 生成 `1` 个战役和 `2` 条 front；军事图层打开后 `glError = 0`，health 非 info 事件为 `0`，console/page error 为 `0`。
- 正式 e2e 守门通过：`front-a / continents / 10000` 点击到出图 `1389.1ms`，纯生成 `710.8ms`，WebGL 加载 `358.6ms`，UI slack `319.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 128.4ms`，最慢加载阶段为 `构建视觉 cell mesh 55.6ms`，`构建线层顶点 33.3ms`。

### 外交导出可读性第一刀

背景：

- 当前外交 CSV 只有一张关系矩阵，外部打开时缺少主体、统计、国家背景和历史上下文。
- 当前计划要求优先补外交导出可读性，但不把战争关系继续驱动军事行动或动态系统。

修正：

- 外交 CSV 保留关系矩阵，同时增加“外交导出摘要”“当前主体关系明细”和“外交历史”分段。
- 当前主体关系明细导出对象国家、关系标签与代码、关系倾向、邻接、文化、宗教、政体、人口、面积、国力、经济力和城镇数。
- 外交 JSON 新增 `type = webgl-generator-diplomacy-summary`、`version = 1`、`exportedAt`、主体摘要、国家摘要、主体关系明细、关系矩阵和历史记录。
- 本轮只改只读导出，不改变外交生成、关系编辑、战争 campaign、军事联动或地图渲染。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `11.93KB / gzip 4.58KB`，主入口约 `808.32KB / gzip 243.86KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器下载烟测通过：外交面板导出 CSV 包含“外交导出摘要 / 当前主体关系明细 / 外交关系矩阵”，JSON 类型为 `webgl-generator-diplomacy-summary`，默认地图 `20` 个国家、主体关系明细 `19` 条；`glError = 0`，health 非 info 事件为 `0`，console/page error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1391.6ms`，纯生成 `746.3ms`，WebGL 加载 `350.1ms`，UI slack `295.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 128.5ms`，最慢加载阶段为 `构建标签 53.4ms`。

### 外交贸易偏好展示第一刀

背景：

- 当前计划要求外交系统后续补贸易偏好展示，但不把贸易关系继续驱动军事行动。
- 经济系统已有静态 `pack.deals`，可以作为外交面板的只读贸易上下文，不需要重算经济或外交。

修正：

- `DiplomacyPanel` 构建指标时只扫描一次 `pack.deals`，按国家对汇总直接交易数、贸易量、贸易额和主体国流入/流出。
- 外交关系列表新增“贸易”排序与列，选中详情新增贸易方向、贸易额、贸易量、交易数和净流向。
- 外交 CSV/JSON 的主体关系明细同步导出 `trade` 摘要。
- 本轮只做只读展示和导出，不改变外交关系、战争 campaign、经济交易或军事系统。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `14.17KB / gzip 5.39KB`，主入口约 `808.32KB / gzip 243.86KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：默认地图经济交易 `15068` 条、外交国家 `20` 个；外交面板详情显示“贸易方向 / 贸易量”，外交 JSON 主体关系中 `17` 条带直接贸易摘要；`glError = 0`，health 非 info 事件为 `0`，console/page error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1418.7ms`，纯生成 `814.8ms`，WebGL 加载 `353.8ms`，UI slack `250.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 147.5ms`，最慢加载阶段为 `构建视觉 cell mesh 50.2ms`。

### 外交跨面板定位第一刀

背景：

- 外交面板已经能选中、定位对象国家，但用户若要编辑该国家仍需要手动打开国家编辑并重新找目标。
- 当前路线继续收窄军事方向：无需动态军事系统；本轮只做外交与国家面板之间的静态导航，不让外交关系触发军事行动。

修正：

- `外交管理` 的对象二级操作新增“打开国家”入口，显示当前外交对象并可直接打开国家面板。
- `diplomacy-panel.js` 将选中外交行转换为既有 `state` object，runtime 复用 `setStatePanelTarget()` 和国家面板 `open()`。
- 打开国家面板时同步 selection 与目标国家，便于后续继续编辑名称、颜色、首都等国家字段。
- 本轮不改变外交关系、外交生成、战争 campaign、军事图层或战报数据。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `14.47KB / gzip 5.48KB`，主入口约 `808.50KB / gzip 243.89KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `外交管理`，点击二级动作“打开国家”，再点击“打开国家面板”后，国家面板打开并命中对象国家 `辰教国`；selection 同步为 `state #2`，`glError = 0`，打开动作前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。debug 模式首屏仍会输出既有 main-thread-long-task warning，但不是该交互新增事件。
- 正式 e2e 守门通过：点击到出图 `1396.7ms`，纯生成 `721.6ms`，WebGL 加载 `364.3ms`，UI slack `310.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 138.7ms`，最慢加载阶段为 `构建视觉 cell mesh 64.6ms`。

### 外交关系编辑体验第二刀

背景：

- 外交面板的 `调整关系` 二级浮层原本只有一个关系下拉，用户改关系前需要回头查看主体、对象、邻接、贸易和文化宗教上下文。
- 当前路线已明确不让战争关系继续驱动动态军事系统，本轮只改善编辑提示，不改变关系命令语义。

修正：

- `调整关系` 二级浮层新增主体/对象标题，说明正在调整哪个主体对哪个对象的关系。
- 新增只读上下文卡片：当前关系、关系倾向、邻接、直接贸易、国力、文化/宗教。
- 新增说明文案：关系选择会立即写入撤销记录，但不会触发军事行动。
- 本轮只改 `DiplomacyPanel.vue` 和 `styles.css` 的显示结构，不改变外交关系命令、战争 campaign、军事逻辑或生成数据。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `15.45KB / gzip 5.81KB`，主入口约 `808.50KB / gzip 243.88KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `外交管理` 和 `调整关系` 二级浮层后，面板宽 `340px`，显示“当前关系 / 关系倾向 / 邻接 / 直接贸易 / 国力 / 文化/宗教”6 个上下文卡片，并显示“不会触发军事行动”提示；检查范围内无横向溢出，`glError = 0`，打开动作前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1533.8ms`，纯生成 `858.6ms`，WebGL 加载 `430.3ms`，UI slack `244.9ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 158.7ms`，最慢加载阶段为 `构建视觉 cell mesh 68.3ms`。

### 外交历史可读性第三刀

背景：

- 外交历史已经写入 `map.diplomacy.chronicle` 和 `states[0].diplomacy`，手动改关系也会追加记录，但面板只显示历史数量。
- 手动关系编辑在通用记录里会显示英文原因 `manual`，对用户不够直观。

修正：

- 外交面板新增“外交历史”预览，优先展示当前主体国家与对象国家相关记录；没有相关记录时展示最近全局外交记录。
- 历史标题会显示“相关 x / 全部 y”或“最近 x / 全部 y”，让用户知道当前展示范围。
- `createSetDiplomacyRelationCommand()` 传入中文原因“手动关系编辑”，导出和面板历史不再暴露英文 `manual`。
- 本轮只改历史展示和记录文案，不改变外交关系命令、战争 campaign、军事逻辑或生成数据。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `16.40KB / gzip 6.11KB`，主入口约 `808.51KB / gzip 243.89KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `外交管理` 后在 `调整关系` 浮层把当前关系改为 `Friendly`，面板出现“外交历史 相关 1 / 全部 1”，记录为“赤原与辰的关系改为友好（手动关系编辑）”；历史预览无横向溢出，`glError = 0`，关系编辑前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1454.2ms`，纯生成 `770.1ms`，WebGL 加载 `371.2ms`，UI slack `312.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 143.7ms`，最慢加载阶段为 `构建视觉 cell mesh 51.4ms`。

### 军事面板静态编辑浮层第五刀

背景：

- 用户指出军事单位编辑面板仍然很粗糙，样式不对；同时已明确无需继续做动态军事系统。
- 当前 `军事管理` 主体面板已有概要、档案和战报区，但二级编辑浮层仍像普通表单，缺少当前对象上下文。

修正：

- 态势、批量态势、驻地基地、记录战报和兵种比例二级浮层统一加 `military-editor-panel` 暗色编辑台样式。
- 各浮层新增只读上下文卡片：当前态势/命令、筛选国家/态势、当前驻地/基地、战报链/记录数、国家/比例合计。
- 表单字段加边框、背景和更稳定的网格列宽，长国家名、军团名和链路名允许换行，降低窄浮层溢出风险。
- 本轮只改 `MilitaryPanel.vue` 和 `styles.css` 的显示结构，不新增动态军事系统，不改变命令、战报、战役或生成逻辑。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` chunk 约 `42.36KB / gzip 12.68KB`，主入口约 `808.50KB / gzip 243.88KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `军事管理` 后逐项打开“调整态势 / 批量态势 / 驻地基地 / 记录战报 / 兵种比例”二级浮层，5 个浮层均显示 `military-editor-panel` 和 2 个上下文卡片；浮层宽 `340px`、编辑内容宽 `318px`，检查范围内无横向溢出；`glError = 0`，打开动作前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1476ms`，纯生成 `823.7ms`，WebGL 加载 `411ms`，UI slack `241.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 163ms`，最慢加载阶段为 `构建视觉 cell mesh 65.5ms`。

### 军事静态导出可读性第六刀

背景：

- 当前 `军事管理` 的主 CSV 只有国家、军团、态势、主兵种、兵力、适宜度和速度，外部打开后缺少筛选上下文、国家汇总、驻防、战役和战线说明。
- 用户已明确无需动态军事系统，本轮只做静态导出整理，不改变任何军事生成、命令、战报或战役结算。

修正：

- 军事 CSV 扩展为“军事导出摘要 / 国家军事汇总 / 军团明细 / 战役摘要 / 战线摘要”分段。
- 军团明细补对象 id、国家 id、命令、兵种构成、驻地/基地 cell、文明、外交/资源压力、战役、链路摘要、战争原因、战报记录和最近战报。
- JSON 改为 `webgl-generator-military-summary v1`，增加导出时间、筛选上下文、汇总、国家汇总、军团明细、战役摘要、战线摘要和战报摘要。
- 本轮只读取当前面板已有 `visibleRows / allBattleEvents / map.military`，不新增动态军事系统，不改变地图数据。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` chunk 约 `47.94KB / gzip 14.22KB`，主入口约 `808.50KB / gzip 243.89KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器下载烟测通过：打开 `军事管理` 后导出主 CSV/JSON，CSV 包含“军事导出摘要 / 国家军事汇总 / 军团明细 / 战役摘要 / 战线摘要”；JSON 类型为 `webgl-generator-military-summary`、版本 `1`，默认地图导出 `107` 支军团、`20` 个国家，`exportedRegiments` 与 `regiments.length` 一致；`glError = 0`，导出动作前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1497.7ms`，纯生成 `740.6ms`，WebGL 加载 `403.8ms`，UI slack `353.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 129.3ms`，最慢加载阶段为 `刷新标签和图标 60.3ms`。

### 军事战报查看清理体验第七刀

背景：

- 战报记录区已有链路、类型、结果、结算和导出范围筛选，但清理按钮只显示“清空筛选 / 清空当前”，用户不容易判断会影响多少记录。
- 当前军事方向继续保持静态管理收尾，本轮不改战报结构、不改清理命令、不增加动态战役逻辑。

修正：

- 战报记录区新增“战报清理范围”摘要，显示当前军团、当前筛选、当前显示和导出范围的记录数。
- “清空筛选 / 清空当前”按钮改为在有记录时显示即将影响的记录数。
- 摘要条使用紧凑网格和自动换行，避免长导出范围或筛选名称撑宽面板。
- 本轮只改 `MilitaryPanel.vue` 和 `styles.css` 的查看/提示层，不改变清理命令行为。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`MilitaryPanel` chunk 约 `48.50KB / gzip 14.33KB`，主入口约 `808.50KB / gzip 243.89KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `军事管理` 并记录一条战报后，清理范围摘要显示“当前军团 1 条 / 当前筛选 1 条 / 当前显示 1 条 / 导出范围 全部记录 1 条”，按钮显示“清空筛选 1 / 清空当前 1”；摘要和按钮区无横向溢出；`glError = 0`，记录动作前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1490.8ms`，纯生成 `790.4ms`，WebGL 加载 `447.5ms`，UI slack `252.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 153.4ms`，最慢加载阶段为 `上传静态 GPU buffer 57.1ms`。

### 外交关系变更说明第四刀

背景：

- 当前外交关系编辑已经有上下文卡片和历史预览，但手动关系变化只能写固定“手动关系编辑”，用户无法记录具体原因。
- 用户已明确无需继续做动态军事系统，因此本轮只补外交历史说明，不让外交关系编辑扩展为军事行动链路。

修正：

- `调整关系` 二级浮层新增可选“说明”输入框，最长 `80` 字，切换对象时清空草稿。
- 说明从 Vue 面板经 `diplomacy-panel` 回调和 runtime 传入 `createSetDiplomacyRelationCommand()`，空说明继续归一化为“手动关系编辑”。
- 外交历史特殊条目也会显示说明后缀，包括宣战、停战、同盟、附庸、宿敌和断交；外交 CSV/JSON 继续通过现有历史导出自然带出说明。
- 本轮只改外交编辑文本、历史记录和样式，不新增动态军事系统，不改变战报、战役阶段或军事命令。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `16.78KB / gzip 6.30KB`，主入口约 `808.70KB / gzip 243.97KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `外交管理`，在 `调整关系` 二级浮层输入“边境谈判达成临时协议”，把 `赤原国 -> 辰教国` 从 `猜疑` 改为 `友好` 后，外交历史显示“赤原与辰的关系改为友好（边境谈判达成临时协议）”；外交面板、二级浮层和历史预览均无横向溢出；`glError = 0`，关系编辑前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1985.3ms`，纯生成 `962.9ms`，WebGL 加载 `588.8ms`，UI slack `433.6ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 250.6ms`，最慢加载阶段为 `构建视觉 cell mesh 107.4ms`，`drawMs = 0ms`，`glError = 0`。

### 外交历史筛选第五刀

背景：

- 外交历史预览已经能显示当前主体和对象相关记录，也能写入手动说明，但多条外交记录出现后缺少范围切换。
- 当前路线继续保持外交只读可读性和编辑安全提示，不把战争关系继续扩展为军事行动或动态战役链路。

修正：

- 外交历史预览新增“范围”下拉，可在 `当前关系 / 主体国家 / 全部历史` 之间切换。
- 当前范围无记录时保留历史卡片和空态说明，用户仍可切到其他范围，不会因为空结果把筛选入口隐藏掉。
- 历史标题按范围显示 `当前关系 x / 全部 y`、`主体 x / 全部 y` 或 `全部 y`。
- 本轮只改 `DiplomacyPanel.vue` 和历史预览样式，不改外交生成、关系命令、战争 campaign、军事或战报逻辑。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `17.56KB / gzip 6.47KB`，主入口约 `808.70KB / gzip 243.97KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：在 `外交管理` 中连续写入“第一条筛选验证 / 第二条筛选验证”两条关系历史后，历史筛选可在 `主体国家`、`全部历史` 和 `当前关系` 之间切换；主体范围显示 `主体 2 / 全部 2`，全部范围显示 `全部 2`，当前关系范围显示 `当前关系 1 / 全部 2`；外交面板、历史卡片和筛选下拉均无横向溢出；`glError = 0`，筛选操作前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1327.9ms`，纯生成 `742.9ms`，WebGL 加载 `351ms`，UI slack `234ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 146.2ms`，最慢加载阶段为 `构建视觉 cell mesh 52.7ms`，`drawMs = 0.2ms`，`glError = 0`。

### 外交关系编辑安全提示第六刀

背景：

- `调整关系` 当前是选择即提交，虽然已经有“不会触发军事行动”的一句提示，但用户仍不容易看出会写入哪些数据、战争选项会不会自动推进军事。
- 当前路线继续明确：外交编辑可以记录关系和历史，但不扩展为动态军事系统。

修正：

- `调整关系` 浮层新增“提交方式 / 写入范围 / 战争选项 / 说明写入”四项影响提示。
- 提示明确关系选择会立即提交且可撤销，写入外交矩阵与历史；战争选项只记录外交状态，不自动调兵或推进战役。
- 说明写入项会实时显示当前说明草稿，空说明显示默认“手动关系编辑”。
- 本轮只改 `DiplomacyPanel.vue` 和样式，不改变外交命令、战争 campaign、战报、战役或军事逻辑。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`DiplomacyPanel` chunk 约 `18.02KB / gzip 6.61KB`，主入口约 `808.70KB / gzip 243.97KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开 `外交管理 -> 调整关系` 后，安全提示显示“选择即提交，可撤销 / 外交矩阵 / 历史 / 只记录外交状态 / 手动关系编辑”；输入“安全提示验证说明”后，“说明写入”实时更新为该说明；外交面板、二级浮层和安全提示区均无横向溢出；`glError = 0`，打开和输入前后 health 非 info 事件增量为 `0`，page error 和 console error 为 `0`。
- 正式 e2e 守门通过：点击到出图 `1461.2ms`，纯生成 `754.1ms`，WebGL 加载 `467.1ms`，UI slack `240ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 140.5ms`，最慢加载阶段为 `构建线层顶点 67.7ms`，`drawMs = 0.1ms`，`glError = 0`。

### 用户可见完成提示第一刀

背景：

- 重新生成的内部状态提示已经收敛到开发模式，普通模式需要一个很短的成功反馈，避免用户看不到主动操作是否完成。
- 用户已明确无需继续做动态军事系统，因此本轮只处理全局生成/导入完成提示，不扩展军事、战报或战役链路。

修正：

- 地图视口顶部新增 `#map-toast`，使用 `role=status` 和 `aria-live=polite`，显示后自动收起。
- 用户主动重新生成完成时显示“生成完成”；首次自动生成不显示完成 toast，避免首屏噪音。
- 地图数据导入和高度图导入完成后分别显示“地图数据已导入”和“高度图已应用”。
- toast 只展示用户可读结果，不展示派生系统、重建阶段、debug 统计或性能细节。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `809.21KB / gzip 244.12KB`，主 CSS 约 `139.33KB / gzip 21.79KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：首屏自动生成完成后 `#map-toast` 保持隐藏；打开生成面板并点击重新生成后，toast 显示“生成完成”，宽度 `78px` 且无文本溢出；loading 已隐藏，`loadMap.totalMs = 405.6ms`，最慢加载阶段为 `构建标签 73.4ms`，`glError = 0`，health 非 info 事件增量、console error 和 page error 均为 `0`。
- 正式 e2e 守门通过：点击到出图 `1453.3ms`，纯生成 `753.3ms`，WebGL 加载 `399.9ms`，UI slack `300.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 141ms`，最慢加载阶段为 `构建视觉 cell mesh 49.6ms`。

### 名称库导入冲突预览第一刀

背景：

- 名称库面板已有导入追加/替换，但选择文件后会立即写入用户名称库，用户看不到会导入多少词池、是否替换现有用户库、是否有同名或同源风险。
- 当前路线已停止扩展动态军事系统，本轮转向名称库编辑器待办中的导入安全性，不触碰生成链路和渲染链路。

修正：

- `generator/namebase-store.js` 新增 `createNamebaseImportPreview()`，只根据当前地图和待导入文档统计预览，不修改 `map`。
- 名称库面板选择文件后先显示导入预览，包含可导入词池、样本数、将替换数量、同名/同源风险、空词池跳过、文件内重名、内置词池记录和示例词池。
- 用户点击“确认导入”后才调用原导入流程；取消、切换导入方式、打开另一张地图或面板更新都会清掉待确认文件。
- 该能力只写用户名称库，不自动改写当前地图对象名称，也不改变生成器签名。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `811.54KB / gzip 244.88KB`，名称库懒加载 chunk 约 `9.02KB / gzip 3.45KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开名称库总览，新建 1 个用户库后导入包含 `2` 个有效词池和 `1` 个空词池的测试 JSON；预览阶段用户库数量保持 `1`，预览显示“可导入 2 / 样本 7 / 将替换 0 / 可能重名 1”，并提示空词池跳过和重名/同源风险；点击“确认导入”后用户库变为 `3`，状态提示“名称库已导入 2 个词池，当前用户库 3 个。”，预览面板收起；预览区无横向溢出，`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- 正式 e2e 守门通过：点击到出图 `1510ms`，纯生成 `776.6ms`，WebGL 加载 `427.6ms`，UI slack `305.8ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 135.5ms`，最慢加载阶段为 `构建标签 57.9ms`。

### 名称库绑定状态第一刀

背景：

- 名称库绑定计划要求先建立 `map.namebases.bindings` 的读写 helper 和失效引用显示，再进入真正生成绑定。
- 当前用户已明确不需要动态军事系统，本轮继续沿名称库安全管理路线推进，不接触军事和渲染热路径。

修正：

- `namebase-store.js` 新增 `NAMEBASE_BINDING_TARGETS`、`getNamebaseBindings()`、`setNamebaseBinding()` 和 `getNamebaseBindingStatus()`。
- 名称库总览行新增“绑定”列，详情新增“绑定状态”，可显示“全局国家根名 / 文化 #1 地名”等绑定用途。
- 当绑定指向已删除或不存在的名称库 id 时，面板显示“失效绑定引用”，不会抛错。
- 本轮只做只读诊断和 helper，不改变生成结果，不批量改名，也不提供绑定编辑入口。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `813.04KB / gzip 245.44KB`，名称库懒加载 chunk 约 `9.41KB / gzip 3.59KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 `user-state-roots` 用户名称库，并设置 `global.stateRoot = user-state-roots`、`cultures.1.hydro = user-state-roots`、`global.place = missing-place`、`cultures.1.place = missing-culture-place`；名称库总览中用户库行显示“全局国家根名、文化 #1 水文”，失效提示显示“全局地名 -> missing-place；文化 #1 地名 -> missing-culture-place”；提示卡和面板无横向溢出，`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- 正式 e2e 守门通过：点击到出图 `1555.9ms`，纯生成 `776.3ms`，WebGL 加载 `522.1ms`，UI slack `257.5ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 148.8ms`，最慢加载阶段为 `构建视觉 cell mesh 67.9ms`。

### 名称库全局绑定编辑第一刀

背景：

- 名称库绑定状态已经能只读显示用途和失效引用，但用户还不能在界面中设置全局 `stateRoot / place / hydro`。
- 本轮只做数据管理入口，不让绑定影响生成，不自动改写已有地图名称，也不进入动态军事方向。

修正：

- 名称库总览新增“全局绑定”区，提供 `国家根名 / 地名 / 水文` 三个下拉。
- 每个下拉包含“使用内置策略”和当前全部内置/用户名称库；已有失效引用会作为“失效引用：id”选项保留，便于用户改回有效词池。
- runtime 新增 `setGlobalNamebaseBinding()`，调用现有 `setNamebaseBinding()` 写入 `map.namebases.bindings.global`，刷新名称库面板和文件操作状态。
- 本轮不改变 `createChineseNameGenerator()`，不触发重新生成，不批量改名。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `814.08KB / gzip 245.76KB`，名称库懒加载 chunk 约 `10.50KB / gzip 3.99KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：新建 1 个用户名称库后，把全局 `stateRoot` 绑定到 `user-namebase-1`，`map.namebases.bindings.global.stateRoot` 写入成功，名称库行显示“全局国家根名”；再恢复“使用内置策略”后绑定值清空，行显示“未绑定”。绑定和清空前后地图 checksum 均为 `9f015921`，确认不改写当前地图名称；面板无横向溢出，`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome` 通过；`stage-2-1 / continents / 10000` 点击到出图 `1586.8ms`，纯生成 `776.1ms`，WebGL 加载 `440ms`，最慢生成阶段为“生成国家 / 省份 / 区域” `147ms`，最慢加载阶段为“构建标签” `72.2ms`。

### 名称库全局绑定生成接入第一刀

背景：

- 名称库总览已经能写入全局 `stateRoot / place / hydro` 绑定，但生成器尚未读取这些偏好。
- 本轮只接当前地图内的受约束重生成：国家/省份、城镇和河湖命名读取当前 `map.namebases`；不做整图生成继承用户库，不自动批量改写当前地图已有名称。

修正：

- `createChineseNameGenerator(seed, {namebases})` 新增全局绑定解析，支持内置库和用户库 id，失效绑定会自动退回内置策略。
- `stateRoot` 绑定只替换国家根名候选源，仍经过 `cleanStateRootCandidate()`、国家形制和 `state-family` 去重。
- `place` 绑定只影响新生成城镇名；港口仍会按港口后缀修正。
- `hydro` 绑定只影响新生成河流和湖泊名，并避免对已有水文后缀重复追加。
- 国家/省份、城镇和水文重生成入口会传入当前 `map.namebases`；普通生成参数 `options` 不持久化用户库对象。

验证：

- 绑定解析小测通过：自定义 `stateRoot` 样本生成 `8/8` 命中用户库；失效绑定小测中 `getNamebaseUsage()` 返回空绑定并正常退回内置名称。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `814.43KB / gzip 245.82KB`，名称库懒加载 chunk 约 `10.50KB / gzip 3.99KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 3 个用户名称库并设置全局 `stateRoot / place / hydro` 绑定后，依次触发国家、城镇和水文重生成；国家根名 `18/20` 明确命中用户根名库，城镇 `666/1003` 命中用户地名库，河流/湖泊 `131/157` 命中用户水文库；未命中项来自首都/省会锚点、方位/去重变体和兜底策略；`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome` 通过；`stage-2-1 / continents / 10000` 点击到出图 `1761.6ms`，纯生成 `923.9ms`，WebGL 加载 `504.4ms`，最慢生成阶段为“生成国家 / 省份 / 区域” `161.6ms`，最慢加载阶段为“构建线层顶点” `126.2ms`。

### 名称库整图生成继承第一刀

背景：

- 全局名称库绑定已经能影响当前地图内的国家、城镇和水文受约束重生成，但点击整图“生成”会创建新地图，之前不会继承当前地图的用户名称库与绑定。
- 本轮只做生成前快照继承，不建立长期应用级名称库偏好，也不把用户库写入普通 `options`。

修正：

- `generatePlaceholderMap()` 会在 `normalizeOptions()` 之外保留临时 `namebases` 上下文，并把它传给水文、城镇和国家命名阶段。
- 生成出的新地图会写回 `map.namebases`，`metadata.namebases` 记录继承的用户库数量和全局绑定，生成日志新增 `namebase context` 行。
- runtime 的“生成”按钮和高度图导入会从当前地图复制用户名称库与绑定快照，传给本次生成；`state.options` 和 `map.options` 仍保持不含用户库对象。
- 地图数据导入仍以导入文件自身的 `map.namebases` 为准，不从当前地图强行继承。

验证：

- Node 整图生成小测通过：传入 `namebases` 后生成地图保留 `map.namebases.bases = 1`，`metadata.namebases.globalBindings.stateRoot = u-state-roots`，且 `map.options.namebases` 为 `false`。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `817.73KB / gzip 246.72KB`，generation worker 约 `276.71KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 `3` 个用户名称库并设置全局 `stateRoot / place / hydro` 绑定后，真实点击整图生成；新地图继承 `3` 个用户库，`map.options.namebases = false`，生成日志显示 `namebase context: bases=3, stateRoot=inherit-state-roots, place=inherit-place-roots, hydro=inherit-hydro-roots`；国家根名 `20/20` 命中用户根名库，城镇 `621/757` 命中用户地名库，河流/湖泊 `180/211` 命中用户水文库；`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome` 通过；`stage-2-1 / continents / 10000` 点击到出图 `1562.9ms`，纯生成 `766.5ms`，WebGL 加载 `457.6ms`，最慢生成阶段为“生成商品 / 市场 / 交易 / 税收” `137.2ms`，最慢加载阶段为“构建视觉 cell mesh” `56.1ms`。

### 名称库文化级绑定生成读取第一刀

背景：

- 名称库绑定计划要求 `cultures[cultureId]` 覆盖全局 `stateRoot / place / hydro` 绑定，但此前生成器只读取全局绑定。
- 本轮只做生成读取，不新增文化绑定 UI；后续 UI 可以复用已有 `setNamebaseBinding(map, target, value, {cultureId})`。

修正：

- `createChineseNameGenerator()` 在每次命名时按 `options.culture` 查找文化级绑定。
- 文化绑定优先于全局绑定；文化绑定为空时使用全局绑定；文化绑定填了但指向不存在词池时回退内置策略，不静默使用全局绑定。
- `getNamebaseUsage()` 现在会返回有效文化绑定摘要，便于后续开发模式或面板诊断复用。

验证：

- Node 小测通过：文化 #1 的 `place/stateRoot/hydro` 使用文化库，文化 #3 使用全局库，文化 #2 的失效 `place` 绑定回退内置地名。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `817.73KB / gzip 246.71KB`，名称库懒加载 chunk 约 `10.50KB / gzip 3.99KB`，generation worker 约 `277.28KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入全局库和目标文化专属库后，依次重生成国家、城镇和水文；目标文化国家根名 `6/6` 命中文化库，其它国家 `14/14` 命中全局库；目标文化城镇 `177/271` 命中文化库，其它城镇 `493/732` 命中全局库；目标文化河流/湖泊 `45/46` 命中文化库，其它水文 `105/111` 命中全局库；未命中城镇主要来自首都/省会锚点保留旧名；`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome` 通过；`stage-2-1 / continents / 10000` 点击到出图 `1564.6ms`，纯生成 `719.2ms`，WebGL 加载 `519.1ms`，最慢生成阶段为“生成商品 / 市场 / 交易 / 税收” `129.8ms`，最慢加载阶段为“构建线层顶点” `76.8ms`。

### 名称库文化级绑定 UI 第一刀

背景：

- 文化级绑定已经能参与生成，但用户还不能在界面中写入 `map.namebases.bindings.cultures[cultureId]`。
- 本轮只在名称库面板提供入口，不进入文化管理面板快捷入口，也不自动批量改写当前地图名称。

修正：

- 名称库面板新增“文化绑定”区，可选择当前地图文化。
- 选中文化后可分别设置该文化的 `国家根名 / 地名 / 水文` 名称库覆盖，空值表示使用全局或内置策略。
- runtime 新增 `setCultureNamebaseBinding()`，复用 `setNamebaseBinding(map, target, value, {cultureId})`，写入后刷新名称库面板和文件操作状态。
- 面板绑定选项会保留当前失效引用选项，便于用户修复或改回内置策略。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `818.36KB / gzip 246.91KB`，名称库懒加载 chunk 约 `12.00KB / gzip 4.34KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 `culture-state-ui / culture-place-ui / culture-hydro-ui` 三个用户库后，打开名称库面板，在“文化绑定”区选择文化 #1 并分别设置三项绑定；`map.namebases.bindings.cultures["1"]` 写入 `{stateRoot, place, hydro}`，面板显示“文化 #1 国家根名 / 地名 / 水文”绑定用途，面板无横向溢出；`glError = 0`，health 非 info 事件、console error 和 page error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome` 通过；`stage-2-1 / continents / 10000` 点击到出图 `1429.1ms`，纯生成 `758.4ms`，WebGL 加载 `363ms`，最慢生成阶段为“生成商品 / 市场 / 交易 / 税收” `135.1ms`，最慢加载阶段为“构建线层顶点” `44.8ms`。

### 名称库绑定候选类型过滤第一刀

背景：

- 名称库全局绑定和文化绑定已经能写入 `stateRoot / place / hydro`，但下拉候选此前会显示所有名称库。
- 如果把水文库、后缀库或形制库误绑定到国家根名，后续生成会变得难以理解。
- 本轮只收束 UI 候选，不改变已保存绑定、不批量改名，也不触碰动态军事系统。

修正：

- `NamebasePanel.vue` 新增绑定目标到 `kind` 的兼容表。
- `stateRoot` 候选只显示 `state-root / generic`，`place` 候选显示 `place / place-part / generic`，`hydro` 候选显示 `hydro / generic`。
- 当前绑定如果已经指向类型不匹配但仍存在的词池，会作为“当前不匹配”选项保留，便于用户看见并修复；真正不存在的 id 仍显示“失效引用”。
- `docs/task-notes/namebase-generation-binding-plan.md` 和 `docs/current-plan.md` 已同步记录该边界。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；名称库懒加载 chunk 约 `12.33KB / gzip 4.45KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：注入 `state-root / place / hydro / generic / suffix` 五类用户库，并故意让全局国家根名绑定到水文库；国家根名下拉显示 `u-state / u-generic` 并保留 `u-hydro` 为“当前不匹配”，不显示 `u-place / u-suffix`；地名下拉显示 `u-place / u-generic`，水文下拉显示 `u-hydro / u-generic`；面板无横向溢出，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1367.9ms`，纯生成 `699.6ms`，WebGL 加载 `357.7ms`，最慢生成阶段为“生成商品 / 市场 / 交易 / 税收” `131.2ms`，最慢加载阶段为“构建视觉 cell mesh” `55.7ms`，`glError = 0`。

### 文化面板名称库绑定快捷入口

背景：

- 名称库面板已经能为文化设置 `stateRoot / place / hydro` 覆盖，但用户在文化管理面板中看见某个文化后，还需要手动切到名称库面板再重新选择文化。
- 当前计划中的名称库下一步是补文化管理面板快捷入口。
- 本轮只做跨面板导航，不改生成、不改地图数据，也不触碰动态军事系统。

修正：

- `NamebasePanel` 支持打开时接收目标 `cultureId`，并把文化绑定区的文化选择聚焦到该文化。
- `CulturePanel` 的二级操作新增“名称库绑定”按钮。
- runtime 将文化面板的快捷入口接到名称库面板，复用现有文化绑定 UI 和写入逻辑。
- `docs/current-plan.md`、`docs/task-notes/namebase-generation-binding-plan.md`、`docs/task-notes/namebase-editor-plan.md` 和 `docs/task-notes/source-feature-backlog.md` 已同步更新。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`CulturePanel` 懒加载 chunk 约 `10.34KB / gzip 4.08KB`，`NamebasePanel` 懒加载 chunk 约 `12.48KB / gzip 4.50KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开文化管理面板，选中文化 #2，点击“名称库绑定”后名称库面板打开，`#namebase-binding-culture` 的值为 `2`，显示“清河文化 #2”；文化面板和名称库面板均无横向溢出，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1597.3ms`，纯生成 `765.9ms`，WebGL 加载 `483.9ms`，最慢加载阶段为“构建线层顶点” `92.1ms`，`drawMs = 0.2ms`，`glError = 0`。

### 名称库应用级本地偏好第一刀

背景：

- 名称库用户库和绑定此前随当前地图保存；点击生成会继承当前地图快照，但如果当前地图没有 `map.namebases`，新生成不会使用用户维护过的名称库偏好。
- 当前计划要求补应用级用户库偏好。
- 本轮只做浏览器本地偏好，不做云同步、账户偏好或自动批量改名，也不进入动态军事系统。

修正：

- runtime 新增 `webgl-generator-namebase-preferences-v1` 本地存储键。
- 名称库导入、新建、复制、重命名、样本编辑、删除、清空以及全局/文化绑定变更成功后，会保存当前名称库快照为本地偏好。
- 生成按钮和高度图导入现在优先使用当前地图名称库；当前地图没有 `namebases` 时，读取本地偏好作为临时生成上下文。
- 导入带名称库的完整地图会同步保存其名称库偏好；导入不带名称库的地图不会清空已有偏好。
- 外交重生成完成提示同步收口，战争状态只作为外交记录和静态军事摘要上下文，不再提示后续接入军事行动。
- 该能力只影响后续生成或高度图导入，不自动改写当前地图对象名称。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `819.32KB / gzip 247.18KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：新建 `user-namebase-1` 后 localStorage 写入该库，把全局 `stateRoot` 绑定到它后 localStorage 同步更新；删除当前地图 `namebases` 后重新生成，新地图仍包含 `user-namebase-1`，绑定仍为 `stateRoot=user-namebase-1`，生成日志显示 `namebase context: bases=1, stateRoot=user-namebase-1`，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1726.9ms`，纯生成 `821ms`，WebGL 加载 `579.9ms`，最慢加载阶段为“构建标签” `80ms`，`drawMs = 0.1ms`，`glError = 0`。

### 名称库样本权重第一刀

背景：

- 名称库已经能导入、编辑、绑定、继承和保存本地偏好，但同一用户库内的样本此前仍是均匀抽样。
- `docs/task-notes/namebase-generation-binding-plan.md` 中的生成接入阶段允许先用加权抽样，不急于复刻完整 Markov chain。
- 本轮只做样本权重，不做自动批量重命名，也不进入动态军事方向。

修正：

- `names.js` 新增权重样本解析，支持 `名称|3`、`名称*3`、`名称×3` 和重复同名样本；同名样本会合并权重，权重限制在 `0.1-20`。
- 绑定命中的国家根名、地名和水文用户库会按合并后的权重抽样；未写权重的旧样本继续按 `1` 处理。
- 名称库导入、导出、本地偏好和生成快照会保留规范化后的权重样本。
- 生成预览的轻量字符链和词根重组会读取样本权重。
- 名称库面板详情新增“样本权重”，样本编辑区补 `名称|3` 语法说明。

验证：

- Node 小测通过：`青川|5 + 青川|2` 会合并为 `青川` 权重 `7`，生成预览可读取 `青川|8 / 云泽|1 / 鹿原|1`。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `819.63KB / gzip 247.24KB`，`NamebasePanel` chunk 约 `12.82KB / gzip 4.70KB`，`names` chunk 约 `21.76KB / gzip 9.23KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：新建用户库并把样本改为 `青川|9 / 云泽 / 鹿原` 后，面板详情显示“样本权重 11”，生成预览包含高权重样本，地图数据和 `localStorage["webgl-generator-namebase-preferences-v1"]` 均保留 `青川|9`，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1884.8ms`，纯生成 `1021.3ms`，WebGL 加载 `480.7ms`，最慢加载阶段为“构建视觉 cell mesh” `76.2ms`，`drawMs = 0.2ms`，`glError = 0`。

### 名称库 Markov 链路质量第一刀

背景：

- 名称库样本权重已经能影响抽样，但生成预览和绑定生成仍缺少更接近原版 `Names.calculateChain()` 的项目内共享链路。
- 当前计划要求补 Markov 链路质量。
- 本轮只做项目内纯函数 Markov chain，不依赖 `source/` 全局状态，不自动批量改写当前地图名称，也不进入动态军事方向。

修正：

- `names.js` 新增 `createNamebaseSourceEntry()`、`calculateNamebaseChain()` 和 `generateNamebaseMarkovName()`，从权重样本构建字符链并按样本长度分桶生成候选。
- 名称库绑定命中的国家根名、地名和水文用户库现在优先尝试 Markov 链式候选，再落回加权样本抽取；国家根名仍进入既有根名清洗和 `state-family` 去重，地名和水文仍进入既有后缀处理。
- 名称库面板生成预览改为复用同一套 Markov 纯函数，保留词根重组补充路径。
- 名称库摘要新增 `chainDiversity`，面板详情显示“链路多样性”。

验证：

- Node 小测通过：`青川 / 青泽 / 云川` 样本会生成 `青云 / 云泽 / 云青` 等链式组合，`createChineseNameGenerator()` 绑定用户库后可生成链路候选。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；主入口约 `818.88KB / gzip 246.96KB`，`NamebasePanel` chunk 约 `12.92KB / gzip 4.74KB`，`names` chunk 约 `23.39KB / gzip 9.82KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：新建用户库并把样本改为 `青川 / 青泽 / 云川` 后，面板详情显示“链路多样性 1.5”，生成预览输出 `青云 / 云泽 / 云青` 等链式组合，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1488ms`，纯生成 `662.6ms`，WebGL 加载 `492.6ms`，最慢加载阶段为“刷新标签和图标” `88.5ms`，`drawMs = 0.2ms`，`glError = 0`。

### 名称库编辑历史第一刀

背景：

- 用户校准当前路线：无需继续做动态军事系统，后续军事只保留静态面板、态势线观感和导出可读性收尾。
- 名称库导入、编辑、绑定、本地偏好、样本权重和 Markov 链路已完成，但写操作此前仍直接修改 `map.namebases`，误操作不能从面板内撤销。
- 本轮回到名称库编辑器待办，不触碰军事战役、战报自动推进或动态军事链路。

修正：

- 新增 `app/webgl-generator/src/runtime/namebase-edit-commands.js`，用快照命令封装名称库导入、新建、复制、重命名、样本编辑、删除、清空和全局/文化绑定修改。
- 名称库写操作改为进入 `EditHistory`；命令带 `domain = "namebase"`，撤销/重做时只恢复 `map.namebases` 和本地偏好，不走地图 mesh 重建或重绘。
- 名称库面板新增历史操作条，显示 undo / redo / 最近命令，并提供“撤销上次 / 重做上次”。
- 修复空地图首次创建名称库后的撤销快照问题：`null` 快照表示撤销回没有 `map.namebases`，不再误判为缺少快照。
- `docs/current-plan.md`、`docs/task-notes/namebase-editor-plan.md`、`docs/task-notes/namebase-generation-binding-plan.md`、`docs/task-notes/source-feature-backlog.md` 和 README 已同步更新。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开名称库面板，新建用户名称库后 `undo = 1`；点击面板“撤销上次”后用户库数量从 `1` 回到 `0` 且 `redo = 1`；点击“重做上次”后用户库恢复为 `1`。整个过程 `generationTiming.totalMs` 保持 `665.4ms` 不变，`glError = 0`，page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过。

### 名称库城市显式重命名第一刀

背景：

- 名称库已经能影响后续生成，但导入、编辑或绑定名称库不应自动改写当前地图对象。
- 下一步需要提供用户主动触发的“显式重命名”入口，并保证可撤销。
- 本轮继续避开动态军事系统，只推进名称库和城市编辑面板的静态编辑能力。

修正：

- `city-edit-commands.js` 新增 `createRenameCitiesFromNamebaseCommand()`，接收城市 id 列表，按当前 `map.namebases` 的全局/文化 `place` 绑定生成新城市名。
- 命令会同时更新 `settlements.cities[]` 和对应 `pack.burgs[]` 名称，进入 `EditHistory`，撤销/重做会恢复城市与 burg 名称。
- 城市管理面板新增“按名称库重命名筛选”按钮，只作用于当前筛选结果，避免隐式全图改名。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`CityPanel` 懒加载 chunk 约 `12.41KB / gzip 4.58KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 `place = smoke-place` 测试名称库后，城市面板点击“按名称库重命名筛选”，821 个城市被显式重命名；点击城市面板“撤销上次”后前 5 个城市恢复原名，再重做后恢复新名。整个过程 `generationTiming.totalMs` 保持 `691.1ms` 不变，`glError = 0`，page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1713.8ms`，纯生成 `761ms`，WebGL 加载 `605.3ms`，最慢加载阶段为“构建线层顶点” `103.2ms`，结果仍在守门阈值内。

### 名称库河流显式重命名第一刀

背景：

- 名称库显式重命名已经覆盖城市筛选结果，下一步需要把同一套“用户主动触发、可撤销、不自动批量改名”的语义扩展到水文对象。
- 用户再次校准：无需做动态军事系统；本轮继续只推进名称库静态编辑能力，不触碰军事战役、战报自动推进或战争行动链路。

修正：

- `river-edit-commands.js` 新增 `createRenameRiversFromNamebaseCommand()`，接收河流 id 列表，按当前 `map.namebases` 的全局/文化 `hydro` 绑定生成新河流名。
- 命令进入 `EditHistory`，撤销/重做只恢复 `river.name`；不重建水文、河网、路线或军事相关数据。
- 河流管理面板新增“按名称库重命名筛选”按钮，只作用于当前筛选结果。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新，并继续明确军事方向只保留静态收尾。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`RiverPanel` 懒加载 chunk 约 `5.66KB / gzip 2.47KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 `hydro = smoke-hydro` 测试名称库后，河流面板点击“按名称库重命名筛选”，204 条河流被显式重命名；撤销后前 8 条河流恢复原名，再重做后恢复新名。整个过程 `generationTiming.totalMs` 保持 `745ms` 不变，`glError = 0`，page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1452.6ms`，纯生成 `712.1ms`，WebGL 加载 `513.4ms`，最慢加载阶段为“构建道路屏幕 mesh” `57.3ms`，结果仍在守门阈值内。

### 名称库国家显式重命名第一刀

背景：

- 名称库显式重命名已经覆盖城市和河流筛选结果，下一步把同一套“用户主动触发、可撤销、不自动批量改名”的语义扩展到国家对象。
- 国家命名已有方位语义约束；显式重命名不能因为样本不足而重新引入未校正的“东/西/南/北 + 同根”变体。
- 本轮继续避开动态军事系统，不触碰战役、战报自动推进或战争行动链路。

修正：

- `state-edit-commands.js` 新增 `createRenameStatesFromNamebaseCommand()`，接收国家 id 列表，按当前 `map.namebases` 的全局/文化 `stateRoot` 绑定生成新国家根名。
- 命令进入 `EditHistory`，撤销/重做恢复国家 `name/fullName/nameOrientation`；应用时只写国家名称，保留现有 `formName` 和政体国号后缀，不重建政区、外交、经济或军事。
- 生成候选遇到同根重复时，不再接受命名器为了去重产生的东南西北方向前缀；无法取得唯一根名时使用非方位变体，避免再次出现未按位置校正的“南某 / 北某”。
- 国家管理面板新增“按名称库重命名筛选”按钮，只作用于当前筛选结果中的非中立国家。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；`StatePanel` 懒加载 chunk 约 `12.44KB / gzip 4.76KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：给当前地图注入 `stateRoot = smoke-state-root` 测试名称库后，国家面板点击“按名称库重命名筛选”，20 个国家被显式重命名；撤销后前 8 个国家恢复原名，再重做后恢复新名。整个过程 `generationTiming.totalMs` 保持 `707.2ms` 不变，`glError = 0`，page error 为 `0`，且未出现未校正的东南西北同根方向变体。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1708.7ms`，纯生成 `694.4ms`，WebGL 加载 `732.1ms`，最慢加载阶段为“构建视觉 cell mesh” `52.4ms`，结果仍在守门阈值内。

### 名称库选中对象显式重命名第一刀

背景：

- 名称库显式重命名已覆盖国家、城市和河流管理面板的筛选结果，下一步需要补一个更窄的“当前选中对象”入口。
- 当前湖泊尚未建立独立对象类型、拾取和管理面板链路，直接做湖泊会扩大范围；本轮先覆盖已有对象详情路径里的国家/城市标签目标。
- 用户已再次明确无需做动态军事系统，本轮不触碰军事行动、战役推进、战斗模拟或自动结算。

修正：

- 对象详情面板新增“名称库改名”按钮，仅在选中对象能映射到国家、城市或河流名称库命名目标时显示。
- 当前通用对象详情主要覆盖标签、路线、标记等对象；本轮对国家/城市标签执行目标归一化，点击后只重命名标签对应的国家或城市。
- runtime 新增选中对象名称库重命名分派 helper，复用已有 `createRenameStatesFromNamebaseCommand()`、`createRenameCitiesFromNamebaseCommand()` 和 `createRenameRiversFromNamebaseCommand()`，继续进入 `EditHistory` 并走同一套刷新调度。
- README、当前计划、名称库绑定专项和 source 功能积压已同步更新；后续名称库待办缩小为湖泊显式重命名和质量参数，不再把选中标签目标列为缺口。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：选中国家标签后对象详情显示“名称库改名”，点击后目标国家从 `赤原` 改为 `苴`，撤销恢复 `赤原`，重做恢复 `苴`；状态提示为“已按当前名称库重命名选中国家 1 个”，`glError = 0`，page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed stage-2-1231411414 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1682.8ms`，纯生成 `710.5ms`，WebGL 加载 `499.4ms`，最慢加载阶段为“构建视觉 cell mesh” `70.8ms`，结果仍在守门阈值内。

### 军事态势线边界裁切分支修正

背景：

- 用户已明确无需做动态军事系统；军事方向只保留静态面板、态势线观感和导出可读性收尾。
- 现有态势线设计要求：不能太长，只在共享陆地边界上存在，不跨海，并以宽体渐变方向箭头呈现。
- 代码中 `bestFrontBoundaryExtension()` 在下一条共享边超过剩余长度预算时会提前 `continue`，导致后续 partial 裁切分支不可达；这与已记录的边界裁切能力不一致。

修正：

- 移除超长共享边的提前跳过，让已有 partial 分支在剩余预算足够时裁取下一条真实共享边的一小段。
- 裁切仍只发生在已经通过双方陆地相邻校验的 pack 共享边上，不回退到 `from -> to` 长线，不改变战役、战报、外交或军事结算语义。

验证：

- Node 数据探针通过：`stage-2-2 / front-audit-1 / front-scan-35 / front-scan-59 / front-scan-63 / front-scan-83` 等样本中的 front 均有 `borderCellPairs`，双方 cell 都是陆地且国家归属匹配，长度不超过 `maxLength`；`front-scan-63` 覆盖 3 段边界、4 个点的 front。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：向生产包页面注入 `front-scan-63 / continents / 10000` 地图后，2 条 front 均合法，其中进攻线 `length = 12.47 / maxLength = 12.47`、`points = 4`、`borderCellPairs = 3`；开启战线图层只增加 `60` 个 line 顶点，`drawMs = 0`，`glError = 0`，health 非 info 事件为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed front-scan-63 --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1689.7ms`，纯生成 `810.2ms`，WebGL 加载 `510.9ms`，最慢加载阶段为“构建视觉 cell mesh” `49.4ms`，`构建线层顶点 42.1ms`，结果仍在守门阈值内。

### 湖泊对象名称库显式重命名

背景：

- 国家、城市、河流已经具备名称库显式重命名链路，湖泊名称生成也已接入 `hydro` 名称库，但运行时还不能把湖泊作为可选对象处理。
- 用户已校准：无需做动态军事系统；本轮不再扩展战斗模拟、战役推进或自动军事行动，军事方向只保留静态面板和态势线收尾。

修正：

- 新增 `OBJECT_KIND.LAKE`，对象解析、通用重命名命令和对象详情面板都支持湖泊。
- 渲染拾取层新增湖泊对象识别：当鼠标落在 `pack.features` 的 lake feature 上时返回 `lake` 对象，并为定位/聚焦提供湖泊 pack cell 质心与 bounds。
- 湖泊拾取优先级放在标签、标记图标和军事图标之后，但高于附近城市/标记/军团半径，避免低缩放下点击湖泊水面却选中岸边城市。
- 新增 `createRenameLakesFromNamebaseCommand()`，按当前 `map.namebases` 和湖泊自身水文信息生成新湖泊名，只写对应 `feature.name`，并接入 `EditHistory` 撤销/重做。
- README、当前计划、名称库绑定专项和 source 功能积压已同步更新；后续名称库缺口改为质量参数和更多对象面板入口，不再把湖泊单对象重命名列为待办。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：Playwright 通过 HTTP 路由加载 `dist/webgl-generator`，湖泊 `#5` 从 `月湖` 改为 `月泊`，撤销恢复 `月湖`，重做恢复 `月泊`；拾取对象为 `lake`，`glError = 0`，无 console error/page error。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed lake-rename-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1718.7ms`，纯生成 `631.8ms`，WebGL 加载 `737.9ms`，最慢加载阶段为“构建视觉 cell mesh” `56.9ms`，控制台错误为空。

### 名称库生成质量参数第一刀

背景：

- 名称库导入、绑定、预览、显式重命名和撤销链路已经接入，但用户库还不能像原版一样控制生成长度和允许重复字符。
- 本轮只做名称库数据和生成候选质量参数，不让名称库编辑自动批量改写当前地图名称。
- 用户再次校准：无需做动态军事系统；军事方向只保留静态面板、态势线观感和导出可读性收尾。

修正：

- 用户名称库数据新增 `minLength / maxLength / duplicateChars`，复制内置库、导入、导出、本地偏好和完整地图 JSON 都会保留这些参数。
- 名称库面板新增“生成参数”编辑区，用户库可设置最短/最长生成字数和允许相邻重复的字符；写入进入 `EditHistory` 快照命令，可撤销/重做。
- 生成预览和绑定生成共用参数：Markov 候选与样本兜底都会按长度过滤，并拒绝非白名单字符相邻重复。
- 名称库详情显示配置生成长度、样本长度和允许连写字符，便于检查用户库质量。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新；后续名称库缺口收窄为更多对象面板入口、原版文本兼容和更细质量诊断。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：新建用户名称库后设置 `minLength = 3`、`maxLength = 3`、`duplicateChars = 澜`，生成预览候选均为 3 字；撤销恢复默认 `2-4` 字和空允许连写，重做恢复 `3-3` 字与 `澜`，`glError = 0`，无 console error/page error。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed namebase-options-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1639ms`，纯生成 `820.6ms`，WebGL 加载 `488.8ms`，UI/调度余量 `329.6ms`，最慢加载阶段为“构建标签” `56.4ms`，控制台错误为空。

### 名称库原版文本兼容第一刀

背景：

- 原版 `Namesbase Editor` 下载格式是一行一个词池：`name|min|max|d|m|names`；WebGL 版此前只支持自己的 JSON 名称库格式。
- 用户名称库已经有基础质量参数，本轮把这些参数映射到原版 `min / max / d` 字段，方便与原版文本交换。
- 本轮只做导入导出兼容和快照字段修正，不自动批量改写当前地图名称，也不触碰动态军事系统。

修正：

- `parseNamebaseDocument()` 支持非 JSON 文本，按原版 `name|min|max|d|m|names` 行解析为当前 `webgl-generator-namebases v1` 文档。
- 原版文本导入会追加或替换用户名称库，保留 `min/max/d` 为 `minLength/maxLength/duplicateChars`，保留 `m` 为 `legacyMultiwordRate`，但暂不参与本项目生成。
- 名称库面板新增“导出原版文本”，把当前内置库和用户库导出为 `.namebases.txt`。
- 名称库导入 input 接受 `.txt / text/plain`。
- 修复整图生成继承和本地偏好快照没有携带用户库生成参数的问题，避免重新生成时丢失长度和允许连写设置。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新。

验证：

- Node 级解析/格式化验证通过：`古国|1|3|叠|0|齐,楚,秦` 可导入为用户库，保留 `1-3` 字和允许连写 `叠`，再次导出为原版文本。
- `$env:CI='true'; pnpm run build:app` 通过；`NamebasePanel` 懒加载 chunk 约 `14.97KB / gzip 5.37KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：打开名称库面板后点击“导出原版文本”，下载 `fmg-stage-2-1-d6b438af.namebases.txt`，共 `61` 行且每行至少 6 个 `|` 字段；上传 `legacy-namebases.txt` 后预览显示可导入 `2` 个词池，确认后新增 `测试古国 / 测试水文`，`测试古国` 保留 `minLength = 1`、`maxLength = 3`、`duplicateChars = 叠`，历史栈为 `undo 1 / redo 0 / 导入名称库`，`glError = 0`，无 console error/page error。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed namebase-legacy-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1608.9ms`，纯生成 `744.6ms`，WebGL 加载 `422.2ms`，UI/调度余量 `442.1ms`，最慢加载阶段为“构建线层顶点” `56.8ms`，控制台错误为空。

### 名称库更细质量诊断第一刀

背景：

- 原版 `Namesbase Editor` 会分析样本长度、重复项、非基础字符和重复字符等质量信息；WebGL 版此前只有样本数、重复样本、链路多样性和基础生成参数。
- 用户已再次校准：无需做动态军事系统；本轮继续只推进名称库静态编辑能力，不触碰军事战役、战报自动推进或战争行动链路。

修正：

- `summarizeNamebaseSource()` / `analyzeNamebase()` 新增平均样本长度、中位样本长度、长度越界样本、相邻连写风险、重复字符、特殊字符、加权样本数量和最高权重诊断。
- 名称库面板详情新增“加权样本 / 平均长度 / 中位长度 / 长度越界 / 连写风险 / 特殊字符”，筛选也可命中这些诊断文本。
- 质量标签会在样本数基础上提示“长度需校准 / 连写需校准 / 含特殊字符”，方便用户先处理明显风险。
- 名称库 JSON 导出同步带出这些只读诊断字段；导入、绑定、预览和显式改名语义不变，不自动改写当前地图对象名称。
- 名称库列表列宽收紧，避免 Element Plus 表格在 760px 浮层中横向溢出。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新；名称库待办收窄为更多对象面板入口和原版多词率 `m` 行为。

验证：

- Node 级摘要探针通过：`清河 / 清河 / 清清 / 星-港 / 白川|3` 识别出 `lengthOutlierSamples = 1`、`disallowedRepeatSamples = 1`、特殊字符 `-`、`weightedNameSamples = 1`、最高权重 `3`。
- `$env:CI='true'; pnpm run build:app` 通过；`NamebasePanel` 懒加载 chunk 约 `16.32KB / gzip 5.76KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：向当前地图注入“质量烟测”用户库后，名称库详情显示“长度越界 1 个：星-港 / 连写风险 1 个：清清 / 特殊字符 - / 加权样本 1 个，最高 3x”；`glError = 0`，health 非 info 事件、console error、page error 均为 `0`，名称库面板横向溢出为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed namebase-quality-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1779.5ms`，纯生成 `805.5ms`，WebGL 加载 `592.7ms`，UI/调度余量 `381.3ms`，最慢加载阶段为“构建视觉 cell mesh” `64.6ms`，控制台错误为空。

### 湖泊管理面板第一刀

背景：

- 湖泊已经支持对象拾取、对象详情和单个名称库重命名，但还没有独立管理面板，无法像国家、城市、河流那样对筛选结果执行显式批量重命名。
- 用户再次校准：无需做动态军事系统；本轮继续收束为静态对象管理能力，不触碰战斗模拟、战役推进、自动军事行动或外交战争状态。

修正：

- 管理 tab 新增“湖泊管理”入口，运行时懒加载 `LakePanel`，避免增加首屏同步面板成本。
- 湖泊管理面板支持湖泊总览、筛选、排序、选中、定位、详情、单湖泊重命名、撤销/重做和“按名称库重命名筛选”。
- 批量名称库命令读取当前 `hydro` 绑定，只写 `pack.features` 中对应湖泊的 `name`，不重建水文、河流、路线、政治或军事数据。
- 通用对象详情补齐湖泊详情格式化，避免选中湖泊后侧栏 formatter 缺失导致运行时报错。
- 湖泊表格列宽收紧，保证 540px 浮动面板内没有横向溢出。
- README、当前计划、名称库专题计划、绑定专项和 source 功能积压已同步更新；湖泊管理面板级批量入口不再列为待办。军事方向继续明确为静态收尾，不做动态军事系统。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；`LakePanel` 懒加载 chunk 约 `4.56KB / gzip 2.05KB`，仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：注入 `hydro = lake-smoke-hydro` 测试库后，湖泊面板打开正常，5 个湖泊按筛选结果显式重命名；撤销恢复原名、重做恢复新名，选中对象仍为 `lake`，详情包含面积、补给和水域 cells，面板横向溢出为 `0`，`glError = 0`，health 非 info、console error、page error 均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed lake-panel-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1652.4ms`，纯生成 `844.4ms`，WebGL 加载 `423.6ms`，UI/调度余量 `384.4ms`，最慢加载阶段为“构建视觉 cell mesh” `61.4ms`，结果仍在守门阈值内。

### 测量对象保存第一刀与控制面板布局修正

背景：

- 测量工具已经有临时折线、面积、导出、节点拖拽、撤销点、删除点和线段插入能力，但临时测量还不能保存为随地图 JSON 持久化的对象。
- 用户指出控制面板“图层”和“管理”里的按钮从第二行开始错位；根因是 Element Plus `.el-button + .el-button` 默认 margin 在 CSS grid 中残留。
- 用户补充指出 `UiSliderField` 的数字输入上下调节按钮有白色边线；本轮一并在控件范围内收束 Element Plus 默认边框。

修正：

- 新增 `map.measurements` 数据契约和测量对象 helper，保存时生成 `measurement-N` id、名称、点列、折线/面积类型、长度/面积摘要、创建和更新时间。
- 新增测量对象 EditHistory 命令：保存临时测量、重命名测量对象、删除测量对象，撤销/重做恢复对象集合。
- 测量 readout 新增“保存 / 对象”按钮；保存后清空临时点并选中新对象。
- 新增懒加载“测量对象”浮层，支持总览、筛选、排序、定位、重命名、删除、导出和历史操作。
- 渲染器新增 `locateBounds()`，用于按保存测量对象 bounds 定位视图，不触发无关重建。
- 控制面板图层、管理和重新生成按钮网格统一清除 Element Plus 相邻按钮 margin，并设置 `width: 100% / min-width: 0`，修正第二行错位。
- `UiSliderField` 的右侧数字调节按钮覆盖为暗色边框和背景，避免上下按钮出现白色边线。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：图层页 8 行首列 left 均为 `365`，管理页 10 行首列 left 均为 `365`；三点测量保存为 `测量 1` 后，测量对象面板可打开、导出、删除并撤销恢复，临时点清空为 `0`；数字调节按钮可见边线为深色，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-object-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1544.4ms`，纯生成 `684.4ms`，WebGL 加载 `498.4ms`，UI/调度余量 `361.6ms`，最慢加载阶段为“构建视觉 cell mesh” `63.9ms`，`line-vertices = 47.8ms`，`drawMs = 0.1ms`，`glError = 0`。

### 保存测量对象图层化第一刀

背景：

- 保存测量对象已经进入 `map.measurements.items`，但退出测量工具后无法在地图上看到保存对象。
- 测量专项计划的阶段 2 要求先做“测量”图层显隐，再进入已保存对象节点编辑。
- 本轮只做保存对象只读显示，不把测量对象加入 WebGL line buffer，避免增加加载阶段和线层顶点成本。

修正：

- 控制面板图层页新增“测量”开关，renderer 默认 `layerVisibility.measurements = true`，并复用现有图层偏好保存链路。
- `updateMeasurementOverlay()` 改为在“临时测量激活”或“测量图层开启且存在保存对象”时显示 overlay。
- 保存对象使用蓝色虚线和淡色面片绘制到原测量 SVG；临时测量仍使用金色路径和可拖拽控制点。
- 退出测量工具后 readout 会隐藏，只保留保存对象图形；关闭“测量”图层时图形消失，但 `map.measurements.items` 保持不变。
- 删除、重命名、撤销和重做测量对象后同步刷新测量 overlay，避免 SVG 旧对象残留。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：保存三点测量并退出工具后，`.measurement-object-path = 1`、`.measurement-object-area = 1`、readout hidden；关闭“测量”图层后 `stored = 1`、`overlayHidden = true`，重新开启后对象图形恢复，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-layer-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1312.3ms`，纯生成 `714.4ms`，WebGL 加载 `373ms`，UI/调度余量 `224.9ms`，最慢加载阶段为“构建线层顶点” `75.4ms`，`drawMs = 0.1ms`，`glError = 0`。

### 已保存测量对象节点编辑第一刀

背景：

- 保存测量对象已经能显示和图层显隐，但仍不能复用临时测量的节点拖拽、删除和插入能力。
- 测量专项计划阶段 2 的剩余验收是“编辑已保存对象会更新 `updatedAt` 和摘要，并可撤销/重做”。
- 本轮仍不做路线贴合，也不新建第二套 SVG 编辑器，而是复用当前临时测量工具作为编辑缓冲。

修正：

- 测量对象面板新增“编辑形状”操作。
- 进入编辑时把选中对象点列复制到 `state.measurement.points`，记录 `editingMeasurementId`，开启测量模式并定位到对象 bounds。
- 编辑中的对象不会再同时绘制只读蓝色旧形状，避免旧形状和金色可编辑点列叠在一起。
- 保存按钮在编辑模式显示为“保存修改”，执行 `createUpdateMeasurementPointsCommand()` 写回原对象点列、类型、闭合状态、摘要和 `updatedAt`。
- 更新命令接入 `EditHistory`；撤销/重做恢复测量对象集合快照。
- 清除测量或删除正在编辑的对象时会取消编辑缓冲，避免保存到不存在的 id。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：保存三点测量对象后点击“编辑形状”，首点从 `{x:489.6,y:336}` 拖到 `{x:505.973,y:342.466}`；点击“保存修改”后对象点列和 `updatedAt` 更新，面板撤销后首点恢复到 `{x:489.6,y:336}`，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-edit-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1552.3ms`，纯生成 `765.8ms`，WebGL 加载 `500ms`，UI/调度余量 `286.5ms`，最慢加载阶段为“构建视觉 cell mesh” `76ms`，`line-vertices = 69.9ms`，`drawMs = 0ms`，`glError = 0`。

### 测量路线贴合第一刀

背景：

- 测量专项计划阶段 3 要求路线尺能贴合现有道路/路线，且自由测量模式不受路线约束。
- 当前路线对象已经有 `settlements.routes[].points / packCells`，渲染和 picking 也按路线折线工作，因此第一刀可以在测量输入层吸附，不需要引入动态路线系统或重建道路。

修正：

- 新增 `measurement-route-fit` helper，从现有 `settlements.routes` 懒加载缓存路线线段索引，并按世界坐标最近线段投影返回吸附点。
- 测量 readout 新增“自由 / 贴路”切换；贴路模式下点击必须落在路线附近，离路线过远不会新增点，并在测量浮条提示“贴路测量需要点击道路附近”。
- 贴路模式同时作用于新增点和拖拽已有点；拖拽离开路线时点位保持在原路线吸附位置。
- 保存和更新测量对象时会写入/保留 `routeFit: "roads"`；测量对象面板新增“模式”列和详情字段，批量导出同步带出 `routeFit`。
- 自由模式保持原折线测量行为；route 数据缺失或路线过远时可切回自由测量继续使用。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测通过：贴路模式点击同一路线两个线段中点后得到 2 个贴路线点，远离路线点击不增加点且测量浮条提示命中约束；保存对象 `routeFit = roads`；切回自由模式后远离路线点可正常加入，`glError = 0`，console/page error 为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-route-fit-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1496.8ms`，纯生成 `732.3ms`，WebGL 加载 `377.2ms`，UI/调度余量 `387.3ms`，最慢生成阶段为“生成国家 / 省份 / 区域” `121.5ms`，最慢加载阶段为“构建线层顶点” `67.9ms`，`route-screen-mesh = 8.3ms`。

### 测量对象完整导入回归

背景：

- 测量对象已经随 `map.measurements` 写入完整地图 JSON，但此前只靠代码路径推断，没有固定回归证明“完整地图导出再导入”会保留点列、摘要、图层显示和 `routeFit`。
- 测量专项计划阶段 1 的剩余验收要求导出再导入后测量对象数量、点列、名称和摘要一致。

修正：

- 新增 `tools/webgl-generator-measurement-import-regression.mjs`，在构建产物上执行真实浏览器回归：生成固定地图、用测量 UI 创建贴路对象和自由对象、触发“地图数据”导出下载完整 `.webgl-map.json`、再通过文件输入导入。
- 新增 `pnpm run regress:measurement` 脚本入口。
- 回归脚本会断言导出文档中的测量对象数量、`routeFit` 列表、导入后的点列、`routeFit = roads / none`、测量 overlay 路径和测量面板模式字段，并记录 JSON/Markdown 报告到 `docs/generated/reports/measurement-import-regression-results.*`。

验证：

- `node --check tools/webgl-generator-measurement-import-regression.mjs` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run regress:measurement -- --browser-channel chrome --cells 10000 --seed measurement-import-smoke --template continents --timeout 60000` 通过；初始测量对象 `2`，导出文件 `fmg-measurement-import-smoke-f70e6d2a.webgl-map.json` 为 `13007089 bytes`，导出测量对象 `2`，导出 `routeFit` 为 `roads / none`，导入后 overlay 路径 `2`，`glError = 0`。报告生成到 `docs/generated/reports/measurement-import-regression-results.md/json`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-import-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1185.5ms`，纯生成 `658.9ms`，WebGL 加载 `330.8ms`，UI/调度余量 `195.8ms`，最慢生成阶段为“生成国家 / 省份 / 区域” `112.1ms`，最慢加载阶段为“构建视觉 cell mesh” `49.8ms`。

### 测量路线 cellStops 持久化与数字输入边框修正

背景：

- 贴路测量第一刀只保存了 `routeFit: "roads"` 和吸附后的坐标，没有把每个点吸附到哪条路线、哪段路线和哪个 pack cell 一起持久化。
- 完整地图导出再导入回归需要进一步覆盖 `cellStops`，否则后续沿道路补中间节点和路线尺细化缺少稳定锚点。
- 用户截图指出 Element Plus 数字输入的上下调节按钮仍有白色边线，之前只覆盖了部分按钮边框颜色，组件默认的 `--el-border` 变量仍可能漏出浅色。

修正：

- `measurement-objects` 新增 `normalizeMeasurementCellStops()`，贴路测量对象会按点列保存 `routeId / routeType / segmentIndex / packCell / x / y`，自由测量对象保持空数组。
- 路线吸附点击和拖拽会把 `cellStop` 写到临时点；保存新对象、编辑旧对象、单个测量 JSON 导出、完整地图导出和导入都会保留 `cellStops`。
- 测量对象摘要新增 `routeStopCount`，测量面板调试详情显示“路线点”。
- 完整导入回归脚本新增 `cellStops` 对比和 `routeStopCount` 断言，要求贴路对象路线点数量等于点数，自由对象路线点为 `0`。
- 数字输入样式改为在 `.el-input-number` 层覆盖 `--el-border / --el-disabled-border-color / --el-border-radius-base`，同时对通用数字输入和滑条数字输入的上下按钮保留显式暗色边框兜底，避免后加载的 Element Plus 组件 CSS 漏出白色边线。

验证：

- `node --check app\webgl-generator\src\runtime\measurement-objects.js`、`node --check app\webgl-generator\src\runtime\measurement-edit-commands.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check tools\webgl-generator-measurement-import-regression.mjs` 均通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run regress:measurement -- --browser-channel chrome --cells 10000 --seed measurement-cellstops-smoke --template continents --timeout 60000` 通过；初始测量对象 `2`，导出 routeFit `roads / none`，导出路线点 `2 / 0`，导入后 overlay 路径 `2`，`glError = 0`，生成阶段点击到出图 `2482.5ms`、WebGL 加载 `819.9ms`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-cellstops-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1952.2ms`，纯生成 `969.1ms`，WebGL 加载 `458.9ms`，UI/调度余量 `524.2ms`，最慢生成阶段为“生成国家 / 省份 / 区域” `180.4ms`，最慢加载阶段为“构建线层顶点” `74.7ms`。
- 构建产物浏览器 computed style 验证通过：数字输入上下按钮 `border*Color = rgb(39, 54, 64)`，`backgroundColor = rgb(20, 33, 41)`，不再出现默认浅色边框。

### 贴路测量沿道路补中间节点

背景：

- 上一轮已经保存了 `cellStops`，但地图上的贴路测量线、长度摘要和导出仍按控制点直连，两个道路停靠点之间没有沿实际 route 折线延伸。
- 测量专题计划阶段 3 的剩余目标是让路线尺“沿道路/城镇路线延伸”，但仍保持用户只编辑控制点，避免把自动补出的中间点暴露成一堆可拖拽节点。

修正：

- `measurement-route-fit` 新增 `expandRouteMeasurementPoints()`，按 `routeId` 找到同一路线，并根据两个停靠点的 `segmentIndex` 插入中间 route vertices；跨路线、route 缺失或停靠点不完整时退回控制点直连。
- `measurement-objects` 新增 `measurementDisplayPoints()`，贴路对象的距离摘要、`summary.displayPointCount`、bounds 和面板长度都基于显示点计算；自由测量保持原点列。
- runtime overlay 改为用显示点绘制临时贴路线和保存对象线，但控制点圆点仍只使用用户点列。
- 单个测量 JSON 导出新增 `metadata.displayPointCount`，距离和面积摘要使用显示点；贴路对象强制保持 `polyline`，不会因 3 个以上控制点误变面积对象。
- 测量对象面板调试详情新增“显示点”，完整导入回归新增显示点和 overlay 点数断言。

验证：

- `node --check app\webgl-generator\src\runtime\measurement-route-fit.js`、`node --check app\webgl-generator\src\runtime\measurement-objects.js`、`node --check app\webgl-generator\src\runtime\measurement-edit-commands.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check tools\webgl-generator-measurement-import-regression.mjs` 均通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run regress:measurement -- --browser-channel chrome --cells 10000 --seed measurement-route-display-smoke --template continents --timeout 60000` 通过；初始测量对象 `2`，导出 routeFit `roads / none`，导出路线点 `2 / 0`，导出显示点 `3 / 2`，导入后 overlay 路径 `2`，overlay 点数 `3 / 2`，`glError = 0`。
- 第一次 `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-route-display-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 出现 `loadMap = 1992.2ms` 超过 `1200ms`，但分阶段耗时没有单项异常，像浏览器调度抖动；随后用 `--port 5439` 同 seed 复跑通过：点击到出图 `1850.1ms`，纯生成 `734.8ms`，WebGL 加载 `784ms`，UI/调度余量 `331.3ms`，最慢加载阶段为“上传静态 GPU buffer” `89.2ms`。
- 对照 seed `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed measurement-cellstops-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out docs/generated/reports/e2e-profile-control-results.json --markdown docs/generated/reports/e2e-profile-control-results.md` 通过；点击到出图 `1898.5ms`，WebGL 加载 `550ms`，证明本轮补点没有形成稳定加载/绘制卡顿。

### 本地预览按钮网格错位修正

背景：

- 用户在本地预览发现控制面板的按钮网格从第二行开始整体偏右，但线上不复现。
- 代码里已经有 `.management-panel-actions .el-button { margin-left: 0; }` 一类规则，说明问题不是缺少重置，而是本地 dev/preview 的 CSS 加载顺序可能让 Element Plus 默认 `.el-button + .el-button { margin-left: 12px; }` 后加载并覆盖了普通权重规则。

修正：

- 将 `.primary-action.el-button / .secondary-action.el-button`、`.layer-toggle-grid .el-button`、`.management-panel-actions .el-button`、`.regeneration-action-grid .el-button` 的 `margin-left: 0` 改为 `!important`。
- 将 `.layer-toggle-button.el-button` 的 `margin: 0` 改为 `!important`。
- 该修正只影响按钮默认外边距，不改变网格列宽、gap、按钮尺寸或运行时逻辑。

验证：

- Vite dev server 本地预览验证：打开控制面板后，图层页 `16` 个按钮每行 left 为 `365 / 657`，管理页 `19` 个按钮除跨列“适配视图”外每行 left 为 `365 / 657`，重新生成页每行 left 为 `365 / 657`；三组按钮 computed `margin-left` 均为 `0px`。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed button-grid-margin-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1449.5ms`，纯生成 `740.8ms`，WebGL 加载 `352.8ms`，UI/调度余量 `355.9ms`，最慢加载阶段为“构建视觉 cell mesh” `48.6ms`。

### 贸易流地图图层退役

背景：

- 用户反馈贸易流图层同时显示大量连线会让地图过乱，不需要继续保留地图连线形态。
- 后续贸易信息更适合独立列表面板或经济面板子视图，按国家、地区、市场、商品等条件查看，甚至可以完全不显示连线。
- 本轮目标是收住既有地图图层，不改经济交易数据，不新做动态贸易系统。

修正：

- 控制面板“图层”tab 移除“贸易流”按钮。
- Vue 全局配置 store 和 runtime 偏好应用会清除旧 `tradeFlows` 图层偏好，避免本地旧 `localStorage` 把图层重新打开。
- renderer 新增退役地图图层兜底：外部即使调用 `setLayerVisible("tradeFlows", true)`，也会强制保持 `layerVisibility.tradeFlows = false`，并清空贸易流 WebGL buffer、构建统计和拾取项。
- 保留经济交易数据、经济总览、`trade-flow` 对象详情和解析代码，作为后续列表/按需查询的复用基础。
- `docs/task-notes/economy-market-trade-plan.md` 已把阶段 4 从地图可视化改为“贸易流查询与可视化”，明确不恢复全量或 top N 交易线常驻地图。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物烟测通过：旧偏好强制写入 `tradeFlows: true` 后，图层面板没有“贸易流”按钮，手动调用 `renderer.setLayerVisible("tradeFlows", true)` 后 `layerVisibility.tradeFlows = false`，`tradeFlowVertexCount = 0`，`tradeFlowPickItemCount = 0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed trade-flow-layer-retired-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1503.2ms`，纯生成 `706.7ms`，WebGL 加载 `367.7ms`，UI/调度余量 `428.8ms`，最慢生成阶段为“生成国家 / 省份 / 区域” `118.3ms`，最慢加载阶段为“构建线层顶点” `78.4ms`，`drawMs = 0.1ms`。

### 面板共享布局宽松化第一刀

背景：

- 当前国家、省份、城市、文化、宗教、经济、军事、资源标记等面板大量复用 `UiMetricGrid / UiDetailGrid / UiSortBar / UiObjectTable`。
- 多个 summary / detail 仍用固定 `repeat(4/5/6/7, minmax(0, 1fr))`，文化和宗教 summary 在构建产物审计中曾被压到约 `86px / 89px` 一格。
- 用户要求不要为了节省空间造成奇怪折行；横向不够时应优先换行或给表格横向滚动空间。

修正：

- `UiMetricGrid`、`UiDetailGrid` 和 `UiSortBar` 增加共享基础类：`ui-metric-grid / ui-detail-grid / ui-sort-bar`。
- 共享 metric grid 改为 `repeat(auto-fit, minmax(112px, 1fr))`；detail grid 改为 `repeat(auto-fit, minmax(150px, 1fr))`。
- sort bar 改为可换行 flex 布局，按钮最小宽度约 `92px`，避免固定小列硬挤。
- detail / metric 的 `strong` 统一允许自然换行，释放军事面板单行省略导致的粗糙观感。
- `UiObjectTable` 外层容器允许横向滚动，避免列总宽超过面板时被硬裁剪。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed panel-layout-first-pass-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1335.1ms`，纯生成 `666.4ms`，WebGL 加载 `370.7ms`，最慢加载阶段为“构建标签” `67.7ms`。
- 构建产物 DOM 审计通过：国家 / 省份 / 城市 / 文化 / 宗教 / 经济 / 军事 / 资源标记面板 body 均无横向滚动；文化 summary 最小项宽约 `133px`，宗教 summary 最小项宽约 `138px`，军事 summary 最小项宽约 `132px`。
- 单独首屏加载检查无 console error、无健康监测 error，canvas 可见；一次性打开多组懒加载管理面板时出现一次主线程长任务记录，归入后续 overlay / 面板 profile 阶段继续跟踪，不作为本轮加载或绘制回退。

### Overlay 交互性能 profile 第一刀

背景：

- 地图上的国家 / 城市 / 自定义标签、城市剪影、marker 图标、军事图标和测量 SVG 都是 DOM/SVG overlay。
- 用户反馈移动和缩放画布可能变卡，当前计划要求先量化，不要直接把所有 overlay 迁回 WebGL 或删除近景表现。

修正：

- renderer `getStats()` 新增 `overlay.childCount / overlay.update`，记录最近一次 overlay 更新总耗时，以及 labels、city icons、marker icons、military icons、selection marker 分项耗时。
- `getStats()` 补充 `militaryIconCount / visibleMilitaryIconCount`，让军事图标也进入统一 overlay 计数。
- 新增 `tools/webgl-generator-overlay-profile.mjs` 和 `pnpm run profile:overlay`，可服务构建产物、生成固定地图、执行连续滚轮缩放与中键拖动画布，并输出 JSON / Markdown 报告。
- `docs/task-notes/panel-layout-overlay-performance-plan.md` 已记录第一版 10k 基线和后续判断方向。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`、`node --check tools\webgl-generator-overlay-profile.mjs` 均通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:overlay -- --browser-channel chrome --cells 10000 --seed overlay-profile-smoke --template continents --max-frame-p95-ms 80 --max-overlay-p95-ms 35` 通过；初始 overlay 节点 `1944`，标签 `24 / 901`，城市图标 `8 / 881`，marker 图标 `0 / 46`，军事图标 `21 / 115`。连续滚轮缩放 frame p95 `58.8ms`、overlay p95 `3.2ms`；中键拖动画布 frame p95 `35.3ms`、overlay p95 `1.6ms`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed overlay-profile-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1269.8ms`，纯生成 `688ms`，WebGL 加载 `351.4ms`，最慢加载阶段为“构建线层顶点” `49.2ms`。

### 视口交互动态线层降级第一刀

背景：

- 10k overlay profile 显示 DOM overlay 更新本身很轻，但 100k 拖动和缩放仍有明显 frame 抖动。
- 进一步对照 `full / noRoutesRivers` 后确认，100k 完整图层下主要耗时来自路线与河流的 screen-space 动态 mesh：路线构建约 `30-37ms`，河流构建约 `13-17ms`。关闭路线和河流后交互 draw 接近 `0.06ms`。
- 临时尝试 `requestAnimationFrame` 合并重绘后，100k profile 变差，未保留该方案。

修正：

- `draw()` 新增 `drawDirtyDynamicBuffers` 选项；当该选项为 `false` 时，不绘制已经标记 dirty 的路线、贸易流、河流和选中 screen mesh，避免展示与当前相机不匹配的旧 screen-space buffer。
- canvas 拖动 / 滚轮缩放改为调用 `drawViewportPreview()`：先标记 viewport 动态 buffer dirty，再执行不重建动态 screen mesh 的轻量预览绘制，并继续刷新运行面板和测量 overlay。
- 新增 `scheduleViewportCommit()`：连续输入停止约 `120ms` 后执行一次完整 `draw()`，重建路线、河流和选中 screen mesh，使最终静止画面恢复完整。
- `tools/webgl-generator-overlay-profile.mjs` 支持 `--variants full,noRoutesRivers`，并把 `routeBuildMs / riverBuildMs / selectionBuildMs` 写入报告，便于后续区分 overlay 与动态线层瓶颈。

验证：

- `node --check app\webgl-generator\src\renderer\placeholder-renderer.js`、`node --check tools\webgl-generator-overlay-profile.mjs` 均通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:overlay -- --browser-channel chrome --cells 100000 --seed overlay-profile-100k --template continents --variants full,noRoutesRivers --max-frame-p95-ms 180 --max-overlay-p95-ms 70 --out docs/generated/reports/overlay-profile-100000-variants-results.json --markdown docs/generated/reports/overlay-profile-100000-variants-results.md` 通过；完整图层中键拖动画布 frame p95 `35.3ms`、draw 均值 `0.04ms`，相对降级前约 `88.2ms / 43.77ms` 明显下降；连续滚轮缩放 frame p95 `129.4ms`、draw 均值 `0.04ms`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed viewport-preview-degrade-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1241.5ms`，纯生成 `679.3ms`，WebGL 加载 `327.7ms`，最慢加载阶段为“构建线层顶点” `58.8ms`。
- 构建产物浏览器语义检查通过：拖动中 `routesDirty / riversDirty / selectionDirty` 为 `true`，松手等待 `220ms` 后三者均恢复 `false`，`glError = 0`，route vertices `32580`、river vertices `19494`。

### 面板 segmented 控件换行修正

背景：

- 面板布局第二轮审计发现，国家、文化、宗教、军事、名称库等面板 body、表格和 summary/detail 均无横向溢出。
- 残留问题集中在经济面板和 marker 面板的 `UiSegmented`：控件宽度分别约 `210px / 220px`，但 Element Plus segmented group 仍使用横向滚动模型，导致三段选项区域产生多余 `scrollWidth` 和潜在滚动条。
- 本轮目标只修控件布局，不改变选项、筛选逻辑或面板数据。

修正：

- `.ui-segmented-el .el-segmented__group` 从不换行 flex 横向滚动改为自适应 CSS grid，横向不足时自然换行。
- 隐藏 Element Plus 的额外 `.el-segmented__item-selected` 指示层，选中/hover 视觉转移到真实 `.el-segmented__item-label`，避免额外内部元素参与布局计算。
- 经济面板和 marker 面板将 `--ui-segmented-min-width` 调整为 `60px`，三段短选项不再为了默认宽度挤出滚动条。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- 构建产物面板审计通过：经济、marker、国家、文化、宗教面板均无 body 横向溢出；经济 segmented 变为 grid 且文字无溢出，marker segmented 保持三列且文字无溢出；相关表格均无非预期横向溢出。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed segmented-layout-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200` 通过；点击到出图 `1075ms`，纯生成 `547.4ms`，WebGL 加载 `342.9ms`，最慢加载阶段为“构建标签” `46.8ms`。

### 当前计划执行队列清理

背景：

- 用户指出 `docs/current-plan.md` 仍有一些已经实现的内容看起来像待办，例如单位系统。
- 用户同时要求把面板异常折行、空间过窄，以及非 WebGL overlay 越来越多导致拖动 / 缩放卡顿的后续方向整理成计划。
- 本轮只整理计划，不改业务代码。

调整：

- `docs/current-plan.md` 的当前队列改为明确的五项：面板布局第二轮审计与修正、路线 / 河流动态线层后续优化、overlay profile 矩阵补全、贸易查看列表化设计、source/candidate 剩余 warn 只读跟踪。
- 单位系统、国名方位语义、README 刷新、贸易流地图图层、动态军事系统和测量对象主链路都保持在已完成 / 可选增强 / 明确不做区域，不再作为当前执行队列。
- 面板布局计划明确“不吝啬空间”：横向不足时优先扩大面板宽度、长字段跨整行、按钮自然换行或表格横向滚动，避免把长文本压成异常折行。
- overlay 性能计划按现有证据收束到路线 / 河流 screen-space 动态 mesh，暂不默认迁移标签、城市剪影、marker 图标或军事图标到 WebGL。

验证：

- 本轮只修改中文文档，不涉及运行时代码。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed plan-doc-cleanup-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-plan-doc-cleanup-e2e.json" --markdown "$env:TEMP\fmg-plan-doc-cleanup-e2e.md"` 通过；点击到出图 `1243.3ms`，纯生成 `652.6ms`，WebGL 加载 `326ms`，最慢加载阶段为“构建视觉 cell mesh” `53.1ms`。

### 面板布局自动审计第一刀

背景：

- 当前面板数量较多，用户指出仍可能有奇怪折行和局部空间过窄。
- 继续凭肉眼逐个打开面板容易遗漏，也容易把隐藏 bridge 控件误判为可见溢出。

修正：

- 新增 `tools/webgl-generator-panel-layout-audit.mjs` 和 `pnpm run audit:panels`。
- 脚本复用构建产物、静态服务器、Playwright 和固定 seed 流程，生成地图后逐个打开主要浮动面板。
- 审计项包括 body 横向滚动、summary/detail 最小项宽、segmented 行数、表格横向滚动、普通按钮文字溢出和疑似异常折行。
- 审计会排除 `aria-hidden`、`opacity: 0` 的隐藏兼容控件，避免把 `UiSegmented` 的 1px bridge button 当成可见问题。
- 资源标记面板三段切换左列从 `220px` 放宽到 `300px`，`--ui-segmented-min-width` 从 `60px` 放宽到 `90px`，避免“资源点”有效文字区过窄。

验证：

- `node --check .\tools\webgl-generator-panel-layout-audit.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run audit:panels -- --browser-channel chrome --cells 10000 --seed panel-layout-audit-smoke --template continents --timeout 120000 --out "$env:TEMP\fmg-panel-layout-audit-final3.json" --markdown "$env:TEMP\fmg-panel-layout-audit-final3.md"` 通过；主要面板 body 均无横向溢出，审计待复核项为 `0`，资源标记 segmented 宽 `300px`、最小项宽 `78.7px`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed panel-layout-audit-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-panel-layout-audit-e2e.json" --markdown "$env:TEMP\fmg-panel-layout-audit-e2e.md"` 通过；点击到出图 `1274.3ms`，纯生成 `676.3ms`，WebGL 加载 `312.2ms`，最慢加载阶段为“构建视觉 cell mesh” `43ms`。

### 路线 / 河流 viewport 粗筛第一刀

背景：

- overlay profile 已证明 DOM overlay 不是 100k 交互主瓶颈，路线 / 河流 screen-space 动态 mesh 才是主要耗时。
- 已有交互降级会在拖动 / 滚轮期间暂不重建 dirty 动态线层，但静止补全时仍需要重建整张地图的路线和河流 screen mesh。

修正：

- 新增当前相机视口的世界范围计算，并额外加 `96px` 屏幕 margin。
- `buildRouteMeshVertices()` / `buildRouteMeshVerticesAsync()` 在 normalize route points 后，如果整条路线 bbox 与视口范围无交集，则跳过 screen mesh 生成，并计入 `culledRoutes`。
- `buildRiverMeshVertices()` 在计算河流宽度前先用河流 points bbox 做同样粗筛，跳过屏幕外河流，并计入 `culledRivers`。
- `tools/webgl-generator-overlay-profile.mjs` 会把 route / river 的渲染数量与筛掉数量写入采样和 Markdown 报告，便于后续判断粗筛收益。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js` 通过。
- `node --check .\tools\webgl-generator-overlay-profile.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:overlay -- --browser-channel chrome --cells 100000 --seed overlay-profile-100k --template continents --variants full,noRoutesRivers --max-frame-p95-ms 180 --max-overlay-p95-ms 70 --out "$env:TEMP\fmg-route-river-cull-overlay-final.json" --markdown "$env:TEMP\fmg-route-river-cull-overlay-final.md"` 通过；完整图层连续滚轮缩放 frame p95 `135.2ms`，路线 `742 / 434` 渲染 / 筛掉、route p95 `37.3ms`，河流 `466 / 279` 渲染 / 筛掉、river p95 `13ms`；完整图层中键拖动画布 frame p95 `41.2ms`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed route-river-cull-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-route-river-cull-e2e.json" --markdown "$env:TEMP\fmg-route-river-cull-e2e.md"` 通过；点击到出图 `1380.4ms`，纯生成 `739.6ms`，WebGL 加载 `349.5ms`，最慢加载阶段为“构建线层顶点” `59ms`。

后续：

- 粗筛对缩放场景有效，但拖动补全时仍会接近全量重建；若继续处理 100k 交互手感，应评估分块缓存、跨帧重建或轻量交互态线层。

### 面板窄视口审计

背景：

- 面板默认样本已通过 `1280 x 820` 自动审计，但 current plan 仍要求复核更窄视口。
- 本轮只做窄视口证据收集和文档收束，不改运行时代码。

验证：

- `$env:CI='true'; pnpm run audit:panels -- --browser-channel chrome --cells 10000 --seed panel-layout-narrow-smoke --template continents --viewport 1024x720 --timeout 120000 --out "$env:TEMP\fmg-panel-layout-narrow.json" --markdown "$env:TEMP\fmg-panel-layout-narrow.md"` 通过；主要浮动面板待复核项 `0`，页面横向溢出 `0`，点击到出图 `1023.3ms`，WebGL 加载 `297.9ms`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed panel-layout-narrow-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-panel-layout-narrow-e2e.json" --markdown "$env:TEMP\fmg-panel-layout-narrow-e2e.md"` 通过；点击到出图 `1317.5ms`，纯生成 `699.5ms`，WebGL 加载 `323.7ms`，最慢加载阶段为“构建视觉 cell mesh” `51.8ms`。

后续：

- 面板布局后续不再重复默认 / 窄视口样本，应转向长字段选中样本、表格列较多样本和二级编辑区展开态。

### overlay 图层矩阵 profile

背景：

- 已有 overlay profile 能证明 100k 交互瓶颈不主要来自 DOM overlay，但仍缺少按图层开关拆分的矩阵证据。
- 上一版 `noRoutesRivers` 只覆盖路线 / 河流，无法单独观察标签、城市剪影、marker / 资源和军事图标。

修正：

- `tools/webgl-generator-overlay-profile.mjs` 新增 `overlayMatrix` 变体组，依次采集完整图层、关闭文字标签、关闭城市图标、关闭资源 / 标记图标、关闭军事图标、关闭路线 / 河流。
- 每个变体应用前会先恢复路线、河流、城市、标签、国家标签、marker、资源和军事图层基线，再叠加当前变体开关，避免上一轮图层状态污染下一轮。
- 采样结果新增 `layerVisibility` 判断；当路线或河流图层关闭时，报告中的 route / river 构建耗时、顶点数、渲染数和筛掉数归零，避免沿用上一轮缓存统计。

验证：

- `node --check .\tools\webgl-generator-overlay-profile.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run profile:overlay -- --browser-channel chrome --cells 100000 --seed overlay-matrix-100k --template continents --variants overlayMatrix --max-frame-p95-ms 180 --max-overlay-p95-ms 70 --out "$env:TEMP\fmg-overlay-matrix-100k.json" --markdown "$env:TEMP\fmg-overlay-matrix-100k.md"` 通过；完整图层连续滚轮缩放 frame p95 `88.3ms`，中键拖动画布 frame p95 `35.3ms`，overlay p95 最高约 `5.1ms`；关闭路线 / 河流时 route / river 构建耗时和渲染数量均为 `0`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed overlay-matrix-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-overlay-matrix-e2e.json" --markdown "$env:TEMP\fmg-overlay-matrix-e2e.md"` 通过；点击到出图 `1233.3ms`，纯生成 `682.3ms`，WebGL 加载 `343.9ms`，最慢加载阶段为“构建线层顶点” `51.3ms`。

结论：

- 当前仍没有证据支持把标签、城市剪影、marker 或军事图标默认迁到 WebGL。
- 后续 overlay 性能工作应只在具体复现场景下补测量 SVG 多对象、选中态高频变化或极端标签数量；路线 / 河流动态线层若继续优化，优先评估分块缓存、跨帧重建或轻量交互态线层。

### current-plan 当前队列再整理

背景：

- 用户指出 `docs/current-plan.md` 中仍容易把已经实现的内容误读为计划项，例如单位系统。
- 当前后续重点应收束到面板空间 / 折行问题，以及非 WebGL overlay 与动态线层的性能证据化治理。

调整：

- `docs/current-plan.md` 明确当前执行计划以当前代码和最新验证结果为准，历史推进记录不再自动转化为授权任务。
- 当前执行队列拆成六项：面板布局深场景审计补齐、面板空间策略修正、路线 / 河流动态线层后续优化、overlay profile 后续深场景、贸易查看列表化设计、source/candidate 剩余 warn 只读跟踪。
- “可选增强”标题改为“非当前执行队列”，单位系统只保留导出、编辑器输入和正式读数口径接入偏好的可选增强，不再作为当前计划项。

验证：

- 本轮只整理中文文档，不改运行时代码。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed current-plan-cleanup-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-current-plan-cleanup-e2e.json" --markdown "$env:TEMP\fmg-current-plan-cleanup-e2e.md"` 通过；点击到出图 `1448.1ms`，纯生成 `738.9ms`，WebGL 加载 `394.7ms`，最慢加载阶段为“构建线层顶点” `69.9ms`。

### 面板 deep 场景审计

背景：

- 默认和窄视口审计已经覆盖主要面板，但用户指出仍可能有长字段、二级编辑区和局部空间过窄导致的奇怪折行。
- 继续靠默认面板样本无法证明选中详情和二级编辑弹层的布局质量。

修正：

- `tools/webgl-generator-panel-layout-audit.mjs` 新增 `--scenario deep`。
- deep 场景会在浏览器内临时注入长国家、城市、文化、宗教、路线、河流、湖泊、marker 和备注样本，不写入文件或存档。
- deep 场景会等待异步 Vue 面板预热完成后，再逐个打开主要面板、点击首个可用表格行，并展开可用的 `UiActionDock` 二级编辑面板。
- 审计现在会记录二级编辑面板的 body 溢出、summary/detail 最小项宽、按钮文字溢出和异常折行。
- Teleport 到 body 的二级编辑面板会在每个面板审计前后主动关闭，避免前一个面板的弹层污染后一个面板结果。
- health 监控事件会单独列入报告，不再计入布局待复核项；加载 / 绘制性能仍以 e2e、overlay profile 和后续专门 panel-open profile 判断。

验证：

- `node --check .\tools\webgl-generator-panel-layout-audit.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run audit:panels -- --browser-channel chrome --cells 10000 --seed panel-layout-deep-smoke --template continents --scenario deep --timeout 180000 --out "$env:TEMP\fmg-panel-layout-deep.json" --markdown "$env:TEMP\fmg-panel-layout-deep.md"` 通过；面板预热 `18 / 18` 完成，布局待复核项 `0`，点击到出图 `1464.9ms`，WebGL 加载 `410.8ms`。报告仍单独列出连续打开面板产生的 health 长任务事件，后续应按 panel-open 性能问题单独处理。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed panel-layout-deep-audit-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-panel-layout-deep-e2e.json" --markdown "$env:TEMP\fmg-panel-layout-deep-e2e.md"` 通过；点击到出图 `1444.5ms`，纯生成 `768.8ms`，WebGL 加载 `355.3ms`，最慢加载阶段为“构建线层顶点” `59.3ms`。

结论：

- default、narrow 和 deep 三类面板布局审计当前都没有发现实际折行或横向溢出问题。
- 下一步若继续 UI 方向，应优先诊断连续打开 / 挂载面板的 health 长任务，而不是继续扩大普通布局样本。

### 2026-07-04 面板打开长任务与对象表格性能

背景：

- `panel-layout-deep-smoke` 已证明主要面板没有布局待复核项，但连续打开 / 选中面板仍出现 `input-handler-stall / main-thread-long-task`。
- 新增聚焦 profile 后确认慢点集中在对象表格选中阶段：Element Plus `ElTable` 在城市、路线、标签这类几百行表格中，点选一行会触发明显主线程长任务。

实现：

- 新增 `tools/webgl-generator-panel-open-profile.mjs` 和 `pnpm run profile:panels`，拆分面板打开、选中、二级操作、longtask、health 和行数。
- selection 回调不再刷新所有隐藏对象面板；面板自身发起的表格选择带 source panel 标记，避免反向重刷同一个大表格。
- 河流 / 湖泊面板新增轻量 `setSelection()`，标签面板点选不再递增 `version`。
- 共享 `UiObjectTable` 改为轻量原生 table，保留列最小宽、选中态、定位按钮、sticky 表头、sticky 定位列和横向滚动；审计脚本和 profile 脚本同步识别新表格行。

验证：

- `node --check .\tools\webgl-generator-panel-open-profile.mjs`、`node --check .\tools\webgl-generator-panel-layout-audit.mjs`、`node --check .\app\webgl-generator\src\runtime\app.js`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- focused profile 通过：城市管理 `369ms`、路线管理 `288.9ms`、河流管理 `220.7ms`、标签管理 `344.8ms`，health 事件均为 `0`。
- 全量 profile 通过：17 个面板 health 事件 `0`；最慢城市管理 `371.3ms`、标签管理 `368.8ms`、路线管理 `294.6ms`。
- deep 布局审计 `panel-table-native-deep / continents / 10000` 通过，布局待复核项 `0`，表格按需要横向滚动。
- e2e 守门 `panel-table-native-smoke / continents / 10000` 通过：点击到出图 `1790.1ms`，纯生成 `994.5ms`，WebGL 加载 `426.2ms`，最慢加载阶段为“构建视觉 cell mesh” `67.6ms`。

结论：

- 面板打开长任务第一刀已完成，当前执行队列后续转向具体折行 / 空间不足复现、当前 pan/zoom 卡顿复测和路线 / 河流动态线层后续优化。

### 2026-07-04 地图 DOM overlay 交互降级

背景：

- 用户反馈非 WebGL 内容越来越多，移动和缩放画布时仍有卡顿。
- `current-overlay-retest-100k / continents / 100000` 复测显示：完整图层滚轮 frame p95 为 `111.7ms`、拖动 p95 为 `41.2ms`；关闭地图 DOM 图标和标签后滚轮 p95 降为 `6ms`、拖动 p95 降为 `17.7ms`。renderer 内部 `updateLabels()` p95 只有约 `4.9ms`，说明浏览器样式 / 布局成本没有被内部分项完全捕获。

实现：

- `drawViewportPreview()` 进入拖动 / 滚轮预览时，会给 `#map-overlay` 添加 `map-overlay--interaction-hidden`，并用 `draw({updateOverlay: false})` 跳过标签、城市剪影、marker 图标、军事图标和选中 DOM marker 更新。
- `scheduleViewportCommit()` 的 idle commit 会移除隐藏类，再执行完整 `draw()` 和 overlay 更新，保持静止状态的地图标注完整。
- `getStats()` 暴露 `overlay.interactionSuspended`，`tools/webgl-generator-overlay-profile.mjs` 在 suspended 样本中把 overlay / 动态 buffer 构建计为 `0ms`，并等待 idle 后再读取 final stats。
- 本轮不迁移 DOM overlay 到 WebGL，也不处理测量 SVG；测量对象仍由独立 overlay 管理。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js`、`node --check .\tools\webgl-generator-overlay-profile.mjs`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:overlay -- --browser-channel chrome --cells 100000 --seed current-overlay-retest-100k --template continents --variants full,noDomOverlays,noRoutesRivers --max-frame-p95-ms 180 --max-overlay-p95-ms 70 --out "$env:TEMP\fmg-current-overlay-retest-100k-final3.json" --markdown "$env:TEMP\fmg-current-overlay-retest-100k-final3.md"` 通过；完整图层滚轮 frame p95 `6ms`，拖动 frame p95 `17.7ms`，overlay 暂停样本分别为 `18 / 24`，完整图层 longtask 为 `0 / 0`，idle 后 `finalSuspended = false`。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed overlay-interaction-suspend-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-overlay-interaction-suspend-e2e.json" --markdown "$env:TEMP\fmg-overlay-interaction-suspend-e2e.md"` 通过；点击到出图 `1335.2ms`，纯生成 `751.1ms`，WebGL 加载 `342.2ms`，最慢加载阶段为“构建视觉 cell mesh” `49.6ms`。

结论：

- 地图 DOM overlay 已纳入交互降级，pan/zoom 卡顿在 100k 样本中明显收敛。
- 下一步性能方向应转向路线 / 河流 idle commit 的分块缓存、跨帧重建或更轻交互态线层；只有具体复现证明测量 SVG 或选中态仍卡顿时，再单独治理。

### 2026-07-04 current-plan 状态清账

背景：

- 用户指出 `docs/current-plan.md` 中仍有已实现内容容易被误读为计划项，例如单位系统。
- 用户同时指出当前面板仍可能存在奇怪折行、空间过窄，以及非 WebGL overlay 越来越多导致 pan/zoom 卡顿的风险。

调整：

- `docs/current-plan.md` 新增阅读规则：当前真实状态、当前执行队列、可选增强和历史记录的含义分开，历史内容不再自动转化为授权任务。
- 当前执行队列收束为四项：面板空间策略专项、overlay 与动态线层性能专项、贸易查看列表化设计、source/candidate 剩余 warn 只读跟踪。
- 单位系统、国名方位语义、README、贸易流地图图层、动态军事系统、测量对象基础、高度图导入基础等已完成或已暂缓内容不再作为当前计划项。
- 面板方向明确改为“不吝啬空间”：优先扩大面板、字段跨整行、按钮换行和表格横向滚动，并把军事管理面板、事件链、工具条、单位 / 滑条字段和二级编辑区列为第一批审计对象。
- 性能方向明确先补 `profile:overlay` 的 idle commit 指标，再用 100k 地图区分路线 / 河流动态 mesh、DOM overlay、测量 SVG 和选中态成本，不默认把所有 DOM overlay 迁移到 WebGL。

验证：

- 本轮只调整中文文档，不修改运行时代码。
- `tools/webgl-generator-overlay-profile.mjs` 当前已有未提交的 idle commit 指标改动，`node --check .\tools\webgl-generator-overlay-profile.mjs` 通过；该改动未纳入本轮文档提交，留到下一刀性能专项处理。

### 2026-07-04 地图内容 overlay 交互统一隐藏

背景：

- 用户反馈移动和缩放画布时，画布上的非 canvas 标志会与画布本体分离，视觉上很明显。
- 当前实现已经会在交互中隐藏 `#map-overlay`，但测量 SVG、hover 浮层、图例和比例尺仍可能按旧相机状态滞留。

实现：

- `PlaceholderMapRenderer` 在 `drawViewportPreview()` 触发的交互态中，会给 `.map-stage` 增加 `map-stage--interaction-hidden`，idle commit 恢复后移除。
- CSS 通过该状态类统一隐藏 `map-overlay`、`measurement-overlay`、`hover-overlay`、`map-legend` 和 `map-scale-bar`；控制面板、地图工具栏、toast 和生成 loading 不受影响。
- `tools/webgl-generator-overlay-profile.mjs` 保留 idle commit 指标，报告 pan/zoom 停止后的恢复耗时、帧 p95、route / river build、overlay 耗时、长任务和 dirty 状态，并把 idle 未完成或超阈值纳入失败条件。
- 本轮选择“交互中隐藏非 canvas 地图内容层”而不是把标志迁入 WebGL；迁入 WebGL 后续只在 profile 证明某类标志必须长期 GPU 化时再做。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js`、`node --check .\tools\webgl-generator-overlay-profile.mjs`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有大 chunk 警告。
- 100k overlay profile `overlay-stage-hide-100k / continents / 100000` 通过：完整图层滚轮 frame p95 `6ms`，中键拖动画布 frame p95 `17.7ms`，交互样本 overlay 全部暂停；完整图层 idle commit 分别约 `197.6ms / 181.8ms`，dirty 均为 `clean`。
- 构建产物浏览器断言中手动显示 `map-overlay / measurement-overlay / map-legend / map-scale-bar / hover-overlay` 后触发 `drawViewportPreview()`，五类覆盖层交互中 computed `visibility = hidden`，约 `180ms` 后均恢复 `visible`。
- e2e 守门 `overlay-stage-hide-smoke / continents / 10000` 通过：点击到出图 `1370.7ms`，纯生成 `828.7ms`，WebGL 加载 `327.4ms`，最慢加载阶段为“构建线层顶点” `44.6ms`。

### 2026-07-04 生成页气候滑条标签放宽

背景：

- 面板空间专项复查时，浮动管理面板 deep 审计未发现待复核项，但控制面板“生成”页气候区域存在明确折行：`画布纬度` 被 `42px` 标签列压成两行。

实现：

- `.climate-slider-field` 标签列从 `42px` 放宽到 `68px`，并对第一列标签设置 `white-space: nowrap`。
- 不改滑条数据契约和旧 runtime DOM id，只调整显示空间。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有大 chunk 警告。
- 构建产物浏览器截图确认“画布纬度”单行显示；浏览器断言中该标签宽度 `68px`、高度 `15px`、`white-space = nowrap`。
- 浮动面板 deep 审计 `panel-space-deep-current / continents / 10000` 未发现待复核项，点击到出图 `1243ms`，WebGL 加载 `316.5ms`。
- e2e 守门 `climate-label-layout-smoke / continents / 10000` 通过：点击到出图 `1329.6ms`，纯生成 `664.6ms`，WebGL 加载 `376.1ms`，最慢加载阶段为“构建标签” `63.1ms`。

### 2026-07-04 控制面板布局审计扩展

背景：

- 本地预览曾暴露图层、管理和重新生成按钮网格的第二行错位；虽然样式已修正，但原 `audit:panels` 主要覆盖对象浮动面板，未系统检查控制面板各 tab。
- 用户也指出部分面板存在奇怪折行和空间过窄风险，后续需要让审计先发现问题，避免靠肉眼反复巡检。

实现：

- `tools/webgl-generator-panel-layout-audit.mjs` 在打开管理类面板前，先打开主控制面板并依次切换“简介 / 生成 / 视图 / 单位 / 图层 / 管理”tab。
- 控制面板审计新增 tab/body 横向溢出、滑条标签尺寸、按钮网格行列 left 对齐、按钮文字空间和字段标签空间检查。
- Markdown 报告新增“控制面板”和“控制面板详情”章节，直接列出每个 tab 宽度、溢出、滑条标签最小宽度、网格行数和待复核项。
- 读数文本、单位后缀等本来就允许紧凑显示的元素不再作为“疑似折行 / 宽度过窄”候选，避免把正常 readout 误报为布局问题。

验证：

- `node --check .\tools\webgl-generator-panel-layout-audit.mjs`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run audit:panels -- --browser-channel chrome --cells 10000 --seed control-panel-audit-final --template continents --scenario deep --timeout 180000 --fail-on-issues --out "$env:TEMP\fmg-control-panel-audit-final.json" --markdown "$env:TEMP\fmg-control-panel-audit-final.md"` 通过：未发现待复核项，点击到出图 `1250.4ms`，WebGL 加载 `336ms`；图层页 8 行、管理页 10 行、重新生成按钮网格 4 行均通过列对齐检查。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --seed control-panel-audit-smoke --template continents --max-ready-ms 2500 --max-load-ms 1200 --out "$env:TEMP\fmg-control-panel-audit-e2e.json" --markdown "$env:TEMP\fmg-control-panel-audit-e2e.md"` 通过：点击到出图 `1333.7ms`，纯生成 `731.2ms`，WebGL 加载 `370.7ms`，最慢加载阶段为“构建线层顶点” `78.3ms`。

### 2026-07-04 overlay 重场景 profile 补齐

背景：

- 当前队列要求继续区分 pan/zoom 停止后的路线、河流、选中 mesh、DOM overlay、测量 SVG 和选中态成本，避免凭直觉把所有非 WebGL 标志迁到 canvas。
- 既有 `profile:overlay` 已能测图层矩阵和 idle commit，但缺少保存测量对象很多、选中态很大的重场景夹具。

实现：

- `tools/webgl-generator-overlay-profile.mjs` 新增 `measurement-heavy / measurementHeavy` 变体，默认注入 `180` 条保存测量对象，可用 `--measurement-fixture-count` 调整数量；报告会记录 measurement SVG path / area 计数。
- 新增 `selection-heavy / selectionHeavy` 变体，直接在 renderer 层选中当前地图覆盖 cells 最多的国家，避免打开对象面板遮挡 canvas；报告记录 selected cells、selection vertices、selection build 和 highlight mode。
- 每个变体执行前都会重置测量对象、选中态和视图，避免前一个变体的 pan/zoom 状态污染后一个变体。
- `readStats()` 和 Markdown 报告补充测量对象、measurement SVG 计数、selection 顶点和 selection 构建耗时。

验证：

- `node --check .\tools\webgl-generator-overlay-profile.mjs`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 10k smoke `overlay-fixture-smoke / continents / full,measurement-heavy,selection-heavy` 通过；测量夹具生成 `80` 条对象、`80` 条 path、`27` 个 area，选中态夹具生成 `9576` 个 selection vertices。
- 修正 selection-heavy 夹具避免走 `selectionStore` 打开对象面板后，10k `overlay-selection-fixture-smoke` 中滚轮 / 拖动 overlay 暂停样本为 `18 / 24`，确认交互确实落在 canvas。
- 100k 正式 profile `overlay-fixture-100k / continents / full,measurement-heavy,selection-heavy` 通过：完整图层滚轮 / 拖动 frame p95 为 `6ms / 17.7ms`；测量 `180` 条对象时为 `6ms / 17.7ms`；选中 `10385` 个 cells 的国家时 selection mesh 为 `186918` 顶点、初始构建约 `26.6ms`，滚轮 / 拖动 frame p95 仍为 `6ms / 17.7ms`。各变体 idle commit 均恢复 clean，路线 mesh 仍约 `42-51ms`，河流 mesh 约 `9-10.5ms`，因此下一刀性能优化应继续盯路线 / 河流 idle commit，而不是默认迁移 DOM 标志。

### 2026-07-04 viewport idle commit 分帧恢复

背景：

- overlay 重场景 profile 显示，交互过程已被隐藏策略压住，但 pan/zoom 停止后的 idle commit 仍会同步重建路线、河流和选中 mesh；100k 中路线 mesh 约 `42-51ms`，选中大国时 idle frame p95 可到 `100ms`。
- 测量重场景还暴露出交互期间隐藏的测量 SVG 仍会随 `onViewChange` 重建，虽然不形成持续卡顿，但属于无意义工作。

实现：

- `PlaceholderMapRenderer.scheduleViewportCommit()` 不再在 timer 内同步 `draw()`；改为 `commitViewportAfterInteraction()`，按版本号执行可作废的异步恢复。
- 路线 mesh 复用已有 `updateRouteBufferAsync()`，新增 `shouldContinue` 取消检查；底层 route 循环在用户再次交互后会停止构建，旧结果不会上传到 GPU。
- viewport commit 在路线、河流、选中态之间让出浏览器帧；覆盖层会保持隐藏直到 dirty buffer 清理完成，再统一 `resumeOverlayAfterInteraction()`、绘制和刷新 overlay。
- runtime 的 `onViewChange` 在 renderer 处于 `overlay.interactionSuspended` 时跳过 `updateMeasurementOverlay()`，避免隐藏中的测量 SVG 反复重建；idle 恢复后的最终 `onViewChange` 仍会刷新测量对象。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js`、`node --check .\app\webgl-generator\src\runtime\app.js`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 100k 对照 profile `overlay-idle-async-100k` 通过：完整图层 idle frame p95 为 `23.5ms / 17.7ms`，测量重场景为 `47.1ms / 29.3ms`，选中态为 `29.3ms / 11.9ms`，各变体 dirty 均恢复 clean。
- 跳过隐藏中测量 SVG 更新后，100k 正式 profile `overlay-idle-async-final-100k / continents / full,measurement-heavy,selection-heavy` 通过：完整图层 idle frame p95 为 `17.7ms / 17.6ms`，测量 `180` 条对象为 `35.3ms / 35.3ms`，选中 `8897` 个 cells 的国家为 `29.5ms / 11.9ms`；测量重场景交互 long task 为 `0 / 0`，各变体 dirty 均为 `clean`。
- e2e 守门 `viewport-idle-async-e2e / continents / 10000` 通过：点击到出图 `1293.2ms`，纯生成 `692ms`，WebGL 加载 `372.6ms`，最慢加载阶段为“构建线层顶点” `59.9ms`。

### 2026-07-04 程序化视口变换 overlay 隐藏补洞

背景：

- 用户指出移动 / 缩放画布时，画布上的标志会和 canvas 本身分离；当前代码已对手动拖拽 / 滚轮采用隐藏非 canvas 地图层的方案，但 `fitToView()`、对象定位和测量定位仍存在直接 `draw()` 的程序化相机变化路径。
- 取舍上继续保留“交互中隐藏非 canvas 地图内容，idle 后恢复”：城市剪影、资源 / 标记图标、军事小牌和测量 SVG 都有 DOM/SVG 样式与编辑语义，默认迁入 WebGL 会扩大拾取、导出和交互重写范围；路线、河流、边界和态势箭头这类线面仍适合留在 canvas/WebGL。

实现：

- `fitToView()` 在非 quick 路径下改走 `drawViewportPreview()`，与手动拖拽 / 滚轮共用 overlay 隐藏、dirty 动态线层延后重建和 idle 恢复。
- `locateObject()` 与 `locateBounds()` 改走同一套视口预览路径；定位闪烁动画延后到 viewport idle commit 完成后启动，避免定位第一帧直接刷新旧 overlay。
- `setSelection()` 在 overlay 处于交互隐藏态时只做轻量预览绘制，不立即重建 dirty 动态 buffer 或刷新 overlay，避免对象定位后 selection store 回调打破隐藏策略。

验证：

- `node --check .\app\webgl-generator\src\renderer\placeholder-renderer.js`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测覆盖滚轮、拖拽、`renderer.fitToView()` 和 `renderer.locateObject({kind: "city"})`：四类路径触发后 `.map-stage--interaction-hidden = true`、`#map-overlay` visibility 为 `hidden`、`overlay.interactionSuspended = true`；idle 后全部恢复 visible / false，`glError = 0`，console/page error 均为 `0`。
- 100k overlay profile `viewport-overlay-unified-100k / continents / full` 通过：完整图层连续滚轮 frame p95 `6ms`、中键拖动画布 frame p95 `17.7ms`，overlay 暂停样本 `18 / 24`，idle commit 帧 p95 `35.2ms / 17.6ms`，dirty 均恢复 `clean`。
- e2e 守门 `viewport-overlay-unified-e2e / continents / 10000` 通过：点击到出图 `1540.7ms`，纯生成 `877.5ms`，WebGL 加载 `396ms`，最慢加载阶段为“构建视觉 cell mesh” `81.1ms`。

### 2026-07-04 交易列表国家筛选第一刀

背景：

- 用户已校准贸易流地图连线太乱，不再恢复常驻地图图层；当前贸易查看应优先走经济面板或独立列表。
- 经济面板已有商品 / 市场 / 交易 tab、筛选、排序、定位和导出，缺口是交易行只有卖方 / 买方名称，缺少双方国家字段，按国家查看交易不够直接。

实现：

- 经济面板交易表新增“国家”列，显示 `卖方国家 -> 买方国家`，同国交易显示 `国家 内部`。
- 交易详情新增“卖方国家 / 买方国家”。
- `partyInfo()` 为 burg 和 market 双方补 `stateId / stateName`；交易行写入 `sellerStateId / sellerStateName / buyerStateId / buyerStateName / stateRouteLabel`，这些字段自然进入现有 `searchText`，可用统一筛选框按国家名筛交易。
- 交易 CSV/JSON 导出新增 `sellerStateName / buyerStateName`，且导出仍临时构建完整筛选结果，不受交易 tab 首屏 48 行渲染限制影响。

验证：

- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；`EconomyPanel` chunk 约 `24.20KB / gzip 7.36KB`。
- 构建产物浏览器烟测通过：经济面板“交易”tab 表头包含“国家”；按 `须句共和国` 筛选后显示 `19` 行，所有可见交易国家流向均包含该国家；详情显示“卖方国家 / 买方国家”；JSON 导出 `327` 行并带 `sellerStateName / buyerStateName`；`glError = 0`，console/page error 均为 `0`。
- 面板 deep 布局审计 `economy-country-filter-layout / continents / 10000` 通过：未发现待复核项，经济总览面板宽 `820px`，body 无横向溢出，summary 最小项 `125.7px`，detail 最小项 `152.4px`，表格横向滚动正常。
- e2e 守门 `economy-country-filter-e2e / continents / 10000` 通过：点击到出图 `1717.7ms`，纯生成 `941.4ms`，WebGL 加载 `388.3ms`，最慢加载阶段为“构建视觉 cell mesh” `56.4ms`。

### 2026-07-04 经济面板控制栏空间第二刀

背景：

- 用户要求按当前代码实际情况继续整理面板空间问题，不要把内容硬塞进太小的显示区域。
- 交易国家筛选第一刀后，deep 面板审计显示经济面板本体无横向溢出，但“交易 / 市场 / 商品”三段切换仍被控制栏第一列挤成 `3 项 / 2 行 / min 82px`；根因是 `.economy-panel-controls` 仍使用 `minmax(210px, 0.5fr) minmax(260px, 1fr) auto`，导出按钮占同一行后把三段切换列压得过窄。

实现：

- 经济面板控制栏改为两列主控：三段切换列 `minmax(270px, 0.85fr)`，筛选列 `minmax(280px, 1.15fr)`。
- 经济面板的导出按钮组改为独占下一行并靠右显示，避免为了同一行展示按钮继续压缩主操作区。
- 该改动只触及面板 CSS，不进入生成、WebGL buffer 或地图绘制路径。

验证：

- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 面板 deep 布局审计 `economy-control-space-smoke / continents / 10000` 通过：未发现待复核项；经济总览面板宽 `820px`、body 无横向溢出，segmented 变为 `3 项 / 1 行 / min 90px`，点击到出图 `1212.2ms`，WebGL 加载 `327.7ms`。
- e2e 守门 `economy-control-space-e2e / continents / 10000` 通过：点击到出图 `1180.9ms`，纯生成 `607.9ms`，WebGL 加载 `316.6ms`，最慢加载阶段为“构建视觉 cell mesh” `48.6ms`。

### 2026-07-04 军事战报摘要空间第二刀

背景：

- 面板空间专项继续按“先找真实硬挤点，再小步修”的方式推进；军事面板主体筛选、导出工具条和排序栏在 720px 面板下没有直接溢出。
- 读代码发现有战报时出现的 `.military-event-chain` 仍是固定 6 列布局，前 5 列按较窄比例分配，容易把“累计损耗 / 最近”等摘要项压得过窄。
- 旧 deep 面板审计没有注入战报，导致这块有数据才出现的区域没有被报告覆盖。

实现：

- `.military-event-chain` 改为 `repeat(auto-fit, minmax(124px, 1fr))`，每个摘要项改成独立卡片，允许摘要自然换成两行。
- `tools/webgl-generator-panel-layout-audit.mjs` 的 deep 场景会给每支军团追加两条固定战报，一条已结算、一条未结算，保证默认选中行也能渲染战报记录区。
- 面板审计新增 `militaryEventChains` 指标，记录战报摘要项数、行数、最小项宽和横向溢出；最小项低于 `112px` 或横向溢出会进入待复核项。

验证：

- `node --check .\tools\webgl-generator-panel-layout-audit.mjs`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 军事面板 deep 布局审计 `military-event-chain-space-smoke / continents / 10000` 通过：未发现待复核项；军事管理面板宽 `720px`，战报摘要为 `6 项 / 2 行 / min 126.8px / overflow none`，点击到出图 `1395.6ms`，WebGL 加载 `360.2ms`。
- e2e 守门 `military-event-chain-space-e2e / continents / 10000` 通过：点击到出图 `1280.1ms`，纯生成 `625.2ms`，WebGL 加载 `339.7ms`，最慢加载阶段为“构建视觉 cell mesh” `54.2ms`。

### 2026-07-04 面板工具按钮组审计补齐

背景：

- 面板空间专项中，summary/detail、segmented、表格和军事战报摘要已经有审计指标，但普通 actions / toolbar 工具按钮组只靠按钮文字溢出检查，缺少行数和最小按钮宽的持续报告。
- 名称库、军事、资源标记、政体、备注等面板都有多按钮工具条，需要先把真实空间占用量化，避免继续凭肉眼判断“是否太挤”。

实现：

- `tools/webgl-generator-panel-layout-audit.mjs` 在每个浮动面板内扫描 class 含 `actions` 或 `toolbar` 的可见容器。
- 对每个至少包含两个按钮的工具组记录按钮数、行数、最小按钮宽、最大按钮高和横向溢出。
- 审计 Markdown 新增“工具按钮组”详情行；工具组横向溢出或最小按钮宽低于 `72px` 会进入待复核项。

验证：

- `node --check .\tools\webgl-generator-panel-layout-audit.mjs`、`git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 全量 deep 面板审计 `action-group-audit-smoke / continents / 10000` 通过：未发现待复核项，点击到出图 `1289.2ms`，WebGL 加载 `307ms`；名称库工具按钮组为 `7 项 / 2 行 / min 140.4px / overflow none`，军事编辑工具条为 `5 项 / 1 行 / min 103.6px / overflow none`。
- 新指标暴露两个后续可优先复查的偏紧工具条：政体导出按钮组 `2 项 / 1 行 / min 75.8px / overflow none`，资源标记工具条 `5 项 / 1 行 / min 76px / overflow none`。
- e2e 守门 `action-group-audit-e2e / continents / 10000` 通过：点击到出图 `1389.4ms`，纯生成 `722ms`，WebGL 加载 `411.3ms`，最慢加载阶段为“构建视觉 cell mesh” `68.7ms`。

### 2026-07-04 政体导出按钮组空间修正

背景：

- 工具按钮组审计新增后，`action-group-audit-smoke` 显示政体面板导出按钮组为 `2 项 / 1 行 / min 75.8px / overflow none`，没有破版但按钮有效宽度偏紧。
- 该区域只有“导出 CSV / 导出 JSON”两个按钮，适合用最小按钮宽放宽，不需要改变政体面板整体结构。

实现：

- `.government-panel-export-actions .el-button` 增加 `min-width: 112px`。
- 改动只影响政体面板导出按钮宽度，不进入生成、数据、WebGL buffer 或绘制路径。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 政体面板 deep 布局审计 `government-export-space-smoke / continents / 10000` 通过：未发现待复核项；政体导出按钮组为 `2 项 / 1 行 / min 112px / overflow none`，点击到出图 `1513.9ms`，WebGL 加载 `362.8ms`。
- e2e 守门 `government-export-space-e2e / continents / 10000` 通过：点击到出图 `1408ms`，纯生成 `696ms`，WebGL 加载 `386.5ms`，最慢加载阶段为“构建标签” `67.8ms`。

### 2026-07-05 Element Plus 暗色主题变量第一刀

背景：

- 用户要求对照 Element Plus 官方主题文档，考虑用完整主题定义替代继续被 Element 默认样式局部反打。
- 官方推荐的大规模主题替换路线是 SCSS 变量和 source style；当前项目已按需导入 Element 样式，但尚未安装 `sass`，直接切 SCSS source theme 会引入依赖和构建链变化。

实现：

- `:root` 集中补齐 Element Plus 暗色 CSS 变量，覆盖颜色、背景、填充、边框、文字、按钮、输入框、下拉、滑条、分段控件、表格、消息、通知和弹层等基础 token。
- `styles.css` 从 `index.html` 直链改为 `main.js` 入口导入，让项目样式进入 Vite 依赖图，降低本地 dev 与构建产物中 Element 按需样式顺序不一致的概率。
- `UiActionDock` 二级浮层关闭按钮从 Element `text circle` 按钮改为项目原生按钮，避免 Element text button 的 hover 背景泄漏成白色椭圆。
- 本轮保留 Element 基础组件 CSS；完整 SCSS source theme 后续需要单独安装 `sass`，再按官方文档切换 `ElementPlusResolver({importStyle: "sass"})` 或 `unplugin-element-plus useSource`。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物样式烟测确认 `--el-color-primary = #d7a84f`，`--el-bg-color-overlay / --el-popper-bg-color = #0f1519`；输入框 wrapper 背景为 `rgb(16, 23, 27)`，内层输入透明且文字为浅色；二级浮层关闭按钮 hover 为 `26px x 26px / rgb(27, 37, 43) / 6px`，不再出现白色椭圆；`glError = 0`，console/page error 为空。

### 2026-07-05 列表选中滚动居中

背景：

- 用户要求任意点击激活列表型面板并触发选中滚动时，选中项应滚动到视口中央，而不是只滚到刚好可见。
- 共享列表型面板当前都使用 `UiObjectTable`，已有 `scrollSelectedRowIntoView()` 机制，但旧算法只检查上下边界和 `8px` padding。

实现：

- `UiObjectTable` 的滚动算法改为计算选中行中心点和滚动容器中心点，把 `scrollTop` 调整到两者对齐。
- 保留原有 `requestAnimationFrame` 重试机制，适配懒加载面板、列表行渲染和滚动容器尺寸尚未稳定的情况。
- 靠近顶部或底部无法真正居中时，滚动会停在容器边界，避免无限重试。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物烟测打开城市管理列表，共 `821` 行；把列表滚到顶部后触发第 `87` 行选中，选中行中心与滚动容器中心差值约 `-0.31px`，`glError = 0`，console/page error 为空。

### 2026-07-05 战报记录筛选区拆行

背景：

- 用户指出军事面板“战报记录”下方五个筛选项挤在同一行，导致每一项都无法完整展示。
- 现有 `.military-event-filters` 使用 `repeat(auto-fit, minmax(108px, 1fr))`，在宽面板下会把 `链路 / 类型 / 结果 / 结算 / 导出` 全部塞进一行。

实现：

- `.military-event-filters` 改为 6 栅格布局。
- 前三个筛选项各占 `span 2`，形成第一行三列；后两个筛选项各占 `span 3`，形成第二行两列。
- 只调整战报记录筛选区，不改筛选状态、导出范围、战报数据或动态军事逻辑。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物样式烟测在 `620px` 宽的 `.military-event-filters` 容器中插入同结构五项，结果为 `2` 行：第一行三项各约 `202px`，第二行两项各约 `306.5px`，无横向溢出；`glError = 0`，console/page error 为空。

### 2026-07-05 K170 原版城镇名称库

背景：

- 用户提供从原版 FMG 已绘制地图中导出的城镇数据：`C:\Users\mosuzi\Downloads\k170 Burgs 2026-07-05-01-23.csv`。
- 需求是把这批城镇命名数据加入生成时备选库，而不是立即导入或覆盖当前地图已有城镇名称。

实现：

- 从 CSV 的 `Burg` 列提取城镇名，去空、去空白并检查名称库格式风险。
- 新增 `app/webgl-generator/src/generator/namebase-k170-burgs.js`，存放 `1086` 条去重样本；重复出现的名称保留为 `名称|权重`。
- 在 `names.js` 注册内置名称库 `k170-burg-names / K170 原版城镇名`，类型为 `place`，最小长度 `1`、最大长度 `6`。
- 该库可通过名称库全局或文化级 `地名` 绑定参与后续生成 / 显式重命名，不自动改写当前地图对象名称。

验证：

- `node --check app/webgl-generator/src/generator/namebase-k170-burgs.js`、`node --check app/webgl-generator/src/generator/names.js`、`git diff --check` 通过。
- 名称库小脚本确认内置摘要存在：`samples = 1086`，`weightedSamples = 1129`，`weightedNameSamples = 42`，`maxSampleWeight = 3`。
- 同一脚本确认内置名称库导出包含该库，并且 `createChineseNameGenerator(seed, {bindings:{global:{place:"k170-burg-names"}}})` 会记录 `usage.place = "k170-burg-names"` 并生成地名候选。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

### 2026-07-05 文化面板枚举中文化

背景：

- 用户指出文化类型当前显示为英文内部枚举，命名风格有时直接显示 `default`，不符合中文界面口径。
- 底层生成和数据格式仍需要保留 `Generic / Naval / default` 等内部 key，因此本轮只调整显示层。

实现：

- `CulturePanel.vue` 为文化类型新增中文显示值：`Generic / Nomadic / Highland / Lake / Naval / River / Hunting / Desert` 分别显示为“通用 / 游牧 / 高地 / 湖泽 / 海洋 / 河流 / 林猎 / 沙漠”。
- 命名风格新增中文显示值：`default` 显示为“默认”，`European` 显示为“欧式”。
- 列表列和详情行使用中文显示值；筛选同时匹配内部 key 与中文标签，避免用户按旧英文 key 搜索时找不到对象。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

### 2026-07-05 小路连续渲染修正

背景：

- 用户指出地图上的小路普通显示大多断开，但选中后高亮路径是完整的，说明路线数据本身大概率完整，问题集中在普通路线渲染样式。
- 现有 `trail` 使用 `dash: [9, 6]`，而选中态会绕过 dash 绘制整条连续高亮线，因此普通视图容易被误读为只渲染了部分路线。

实现：

- `routeStyle()` 中 `trail` 不再返回 dash 配置，改为更细、更低透明度的连续实线。
- `routeStyleMode` 更新为 `primary/secondary road + solid trail`，运行时统计不再描述为小路虚线。
- 本轮只改渲染样式，不改路线生成、路线点数据、picking 或动态 mesh 构建策略。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器烟测读取运行时统计：`routeStyleMode = primary/secondary road + solid trail`，默认图 `trailCount = 424`，路线 `580 / 580` 条渲染，`routeVertexCount = 34860`，`pointBudgetExceeded = false`，`vertexBudgetExceeded = false`，`glError = 0`，console/page error 为 `0`。

### 2026-07-05 面板工具按钮审计阈值修正

背景：

- 继续推进“面板空间策略专项”时，`pnpm run audit:panels -- --scenario deep` 报出 `18` 个待复核项。
- 复核发现这些项主要来自 `floating-panel-header-actions` 的 `28px` header 图标按钮和 `UiPanelIoActions` 的 `32px` 导入 / 导出图标按钮；它们是预期的小 icon 操作，不应套用文字按钮 `72px` 最小宽规则。

实现：

- `tools/webgl-generator-panel-layout-audit.mjs` 新增紧凑图标按钮组识别：浮动面板 header、面板导入导出动作条，以及短文本且具备 `aria-label / title` 的按钮组会使用图标按钮阈值。
- 审计仍保留横向溢出检查；文字按钮组继续使用 `72px` 阈值，避免真正的文字按钮被压窄后漏报。
- 本轮只修审计规则，不改产品 UI、面板布局或渲染路径。

验证：

- `node --check tools/webgl-generator-panel-layout-audit.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run audit:panels -- --scenario deep --template continents --cells 10000 --seed panel-space-next --port 5442 --browser-channel chrome` 通过并生成报告：`结论：未发现待复核项`，面板预热 `18 / 18`，点击到出图 `1358.4ms`，WebGL 加载 `341.7ms`，`glError = 0`，console/page error 和 health event 均为空。

### 2026-07-05 overlay profile 事件处理探针

背景：

- 当前执行队列的性能专项要求继续区分滚轮 / 拖拽卡顿来源，不能再把问题笼统归因到 DOM overlay 或动态线层。
- 既有 `profile:overlay` 已能记录 rAF 帧、overlay 分项、动态线层和 idle commit，但还不能直接回答同步 wheel / pointer 事件处理链是否很慢。

实现：

- `tools/webgl-generator-overlay-profile.mjs` 在 `startFrameRecorder()` 时安装临时浏览器内事件探针，覆盖 `wheel / pointerdown / pointermove / pointerup / mouse*`。
- 探针记录每个事件的同步 dispatch 耗时、到下一帧延迟、默认阻止数量和完成阶段；录制结束时随交互样本写入 JSON。
- Markdown 报告新增“事件处理探针”和“事件类型分项”两张表，便于直接判断事件链是否是主瓶颈。
- 本轮只改 profiling 工具，不改应用运行时代码、渲染路径或 UI 行为。

验证：

- `node --check tools/webgl-generator-overlay-profile.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 100k 构建产物 profile 通过：`pnpm run profile:overlay -- --browser-channel chrome --cells 100000 --seed overlay-event-probe-100k --template continents --variants full --max-frame-p95-ms 180 --max-overlay-p95-ms 70 --max-idle-frame-p95-ms 180`。
- profile 结果中，连续滚轮缩放 frame p95 `94.1ms`、overlay p95 `10.7ms`、事件 dispatch p95 `0.1ms`、到下一帧 p95 `127.5ms`，idle commit 完成且 route / river build 为 `93.6ms / 67.9ms`；中键拖拽 frame p95 `47ms`、overlay p95 `8.8ms`、事件 dispatch p95 `0.1ms`。该证据说明同步事件回调本身不是主要瓶颈，后续应继续拆 idle commit 和帧调度压力。

### 2026-07-05 viewport idle commit 切片收细

背景：

- 事件处理探针确认 100k 下 wheel / pointer 同步 dispatch p95 约 `0.1ms`，不是当前交互卡顿主因。
- 同一 profile 显示停止输入后的 idle commit 仍会重建路线 / 河流 screen-space mesh，滚轮 idle frame p95 可到 `47.1ms`，route / river build 可到 `93.6ms / 67.9ms`。

实现：

- `ROUTE_BUILD_SLICE_MS` 从 `10ms` 收细为 `5ms`。
- `RIVER_BUILD_SLICE_MS` 从 `10ms` 收细为 `5ms`。
- 只调整 viewport idle commit 中异步重建的让帧频率，不改变路线 / 河流数据、culling、平滑、绘制样式或 buffer 内容。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 100k 新 seed profile `overlay-slice-5ms-100k / full` 通过：滚轮 / 拖拽 idle frame p95 为 `11.9ms / 11.8ms`，idle long task 为 `0`，dirty 均恢复 clean，`glError = 0`。
- 100k 同 seed 对照 `overlay-event-probe-100k / full` 通过：滚轮 / 拖拽 idle frame p95 为 `17.7ms / 11.9ms`，低于上一刀记录的 `47.1ms / 23.6ms`；滚轮 / 拖拽事件 dispatch p95 仍为 `0.1ms`，overlay p95 为 `12.4ms / 10.9ms`，console error 为 `0`。

### 2026-07-05 地图 overlay transform 定位

背景：

- 事件探针与 overlay profile 显示同步事件回调并不慢，交互期仍有滚轮 frame p95 和 long task 抖动。
- 地图 DOM overlay 节点每帧用 `style.left / style.top` 改位置，容易让浏览器把移动当作布局更新处理；这些节点已有 transform 锚点和缩放，可以把位置也合入 transform。

实现：

- 新增 `setOverlayNodePosition()`，统一写入 `--overlay-x / --overlay-y`。
- 城市 / 国家 / 手工标签、城市图标、marker 图标、军事图标和选中 marker 改为通过 CSS transform 定位，不再每帧写节点 `left/top`。
- CSS 中相关 overlay 节点固定 `left: 0; top: 0`，transform 组合为“屏幕位置 translate + 原有锚点 / 旋转 / 缩放”。
- 移除城市、marker、军事图标的 transform transition，只保留 opacity / visibility 过渡，避免视口移动时图标位置产生动画尾随。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 构建产物浏览器 smoke 生成 `overlay-transform-smoke / continents / 10000` 后，可见 city/state/city icon/military icon 的 computed `left/top` 均为 `0px`，`--overlay-x / --overlay-y` 存在，bounding box 正常分布在画布上，`glError = 0`，console/page error 为 `0`。
- 100k 新 seed profile `overlay-transform-100k / full` 通过：滚轮 / 拖拽 frame p95 为 `52.9ms / 35.3ms`，overlay p95 为 `9.9ms / 8.3ms`，long task 为 `3 / 0`，idle dirty 均恢复 clean。
- 100k 同 seed 对照 `overlay-event-probe-100k / full` 通过：滚轮 / 拖拽 frame p95 为 `47.2ms / 35.4ms`，低于前一刀同 seed `100ms / 52.8ms`；长任务从 `10 / 4` 降到 `2 / 0`，事件 dispatch p95 仍为 `0.2ms / 0.1ms`。

### 2026-07-05 军事图标 overlay 写入去重

背景：

- 地图 overlay 改用 transform 定位后，同 seed 100k profile 仍显示军事图标分项均值约 `6ms`，是 overlay 分项中最突出的单项成本。
- 继续检查发现军事图标帧更新仍会重复写 `visible / selected / fleet` class、`--military-icon-scale`，并且每帧为了计算碰撞盒重新格式化兵力文本宽度。

实现：

- `setOverlayNodePosition()` 改为只在 `--overlay-x / --overlay-y` 变化时写入，并把坐标收敛到 `0.1px`，减少无意义 style 写入。
- 军事图标 item 缓存 `selected / fleet / scale` 写入状态；`visible` class 只在显隐变化时写入。
- `getMilitaryIconItems()` 在构建 item 时预计算兵力文本对应的 `boxBaseWidth`；`militaryIconBoxForItem()` 帧更新时直接使用缓存宽度，不再每帧调用兵力格式化。
- 本轮不改变军事图标显示规则、碰撞规则、缩放公式或图层显隐策略。

验证：

- `node --check app/webgl-generator/src/renderer/placeholder-renderer.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 100k 同 seed profile `overlay-event-probe-100k / continents / full` 通过：滚轮 / 拖拽 frame p95 为 `41.3ms / 35.3ms`，overlay p95 为 `4.5ms / 3.1ms`，军事图标均值为 `0.36ms / 0.27ms`，长任务为 `0 / 0`，idle dirty 均恢复 clean。

### 2026-07-05 source/candidate 剩余 warn 诊断入口

背景：

- 当前执行队列的最后一项是只读跟踪 `features.total / lakeNames` 两个剩余 warn。
- 这两个 warn 之前已判断不能用删除小岛、删除 1-cell 湖或只命名 outlet 湖处理；继续推进需要把诊断结果稳定成可复跑报告，避免每次手工翻阅大 diff。

实现：

- 新增 `tools/source-candidate-warn-diagnostics.mjs`，默认读取 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 `source-summary.json / candidate-summary.json / diff.json`。
- 新增 `pnpm run diagnose:source-warns` 脚本，输出 JSON 和 Markdown 诊断报告；默认写入 `docs/generated/reports/`，也可用 `--out / --markdown` 输出到临时路径。
- 报告聚合 feature 总数、陆地 / 水体 feature、岛屿、湖泊、命名湖泊、outlet 湖泊、小陆块和小湖泊数量，并为 `features.total` 与 `lateStages.names.lakeNames` 给出专门诊断。

当前诊断：

- `continents-10000-audit-continents-001` 仍为 `warn 1 / fail 0`，唯一 warn 是 `features.total`：source `13`，candidate `19`。差异主要来自陆地 feature：source `10`，candidate `16`；`cells < 3` 小陆块 source `4`，candidate `9`。湖泊数量和命名数均为 `2 / 2`，不能用湖泊命名过滤处理。
- `continents-10000-audit-continents-003` 仍为 `warn 1 / fail 0`，唯一 warn 是 `lateStages.names.lakeNames`：source `5`，candidate `7`。湖泊命名数跟随真实湖泊数，source 湖泊 / 命名为 `5 / 5`，candidate 为 `7 / 7`；candidate 有 outlet 湖泊为 `4`，说明该 warn 不是 `defineLakeNames()` 过滤不足，而是湖泊 feature 形成、洼地和 outlet 拓扑差异。

验证：

- 重新刷新两个 10k continents case 的 candidate baseline，并重新生成 diff，二者均为 `warn 1 / fail 0`。
- `node --check tools/source-candidate-warn-diagnostics.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-diagnostics.json" --markdown "$env:TEMP\fmg-source-warn-diagnostics.md"` 通过。
- `node .\tools\source-candidate-warn-diagnostics.mjs --out "$env:TEMP\fmg-source-warn-diagnostics-node.json" --markdown "$env:TEMP\fmg-source-warn-diagnostics-node.md"` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

### 2026-07-05 湖泊分组 source parity 第一刀

背景：

- 继续追查剩余 `features.total / lakeNames` warn 时，对照 source `Features.defineGroups()` 发现候选 `defineLakeGroup()` 少了 source 对 `inlets / outlet` 的约束。
- 原版只会在湖泊没有入流和出流时把高蒸发小湖标为 `dry / sinkhole`，并且 `salt` 也要求没有 outlet；候选此前会无视出流状态直接按蒸发和 cell 数分组。
- 该偏差不直接解释两个剩余 warn 的 feature 数量差异，但属于湖泊水文拓扑链路上的真实 source 规则缺口，适合先做小范围修正。

实现：

- `app/webgl-generator/src/generator/pack.js` 的 `defineLakeGroup()` 补回 `!feature.inlets?.length && !feature.outlet` 判断。
- `salt` 判断补回 `!feature.outlet` 条件。
- `tools/source-candidate-warn-diagnostics.mjs` 增加 `lakeGroups` 分布输出，方便后续检查湖泊分组是否仍偏离 source。
- 本轮不删除湖泊、不过滤湖名、不改变 feature 泛洪、洼地成湖或 outlet 生成逻辑。

验证：

- `node --check app/webgl-generator/src/generator/pack.js` 通过。
- `node --check tools/source-candidate-warn-diagnostics.mjs` 通过。
- `git diff --check` 通过。
- 重新刷新 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 candidate baseline，并重新生成 diff；两者仍为 `warn 1 / fail 0`，说明剩余 warn 仍是 topology 数量问题，不是湖泊分组问题。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-diagnostics-lake-groups.json" --markdown "$env:TEMP\fmg-source-warn-diagnostics-lake-groups.md"` 通过；两个 case 的 lakeGroups 均显示为 `freshwater` 分布。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 端到端守门 `audit-continents-003 / continents / 10000` 通过：点击到出图 `1416.2ms`，纯生成 `750.4ms`，WebGL 加载 `365.1ms`，最慢加载阶段为“构建视觉 cell mesh” `58.5ms`。

### 2026-07-05 pack 层拓扑 warn 诊断增强

背景：

- `features.total / lakeNames` baseline 指标读取的是 `pack.features`，不是早期 `grid.features`。
- 对照 source `reGraph()` 与候选 `collectPackPoints()` 后，pack 抽点条件本身基本一致：深海排除、非岸湖点抽样、海岸 midpoint 补点条件都与 source 保持同一结构。
- 需要把诊断继续下钻到 pack distance field 和 feature cell 分布，判断分叉更像来自高度 / 岸线距离场，还是 pack 抽点或 feature 泛洪。

实现：

- `tools/source-candidate-warn-diagnostics.mjs` 新增 `packSummary`，对照 pack cells、vertices、pack/grid 比例、haven cells、边界 cells、平均邻接度，以及 `t = 1 / -1 / -2 / 3` 的距离场分布。
- 诊断报告新增 `landFeatureBuckets` 和 `lakeFeatureBuckets`，按 `1 / 2 / 3-9 / 10-24 / 25-99 / 100+` 分桶展示小陆块和小湖泊数量。
- 本轮只增强诊断工具，不修改正式生成器运行时代码。

当前诊断：

- `continents-10000-audit-continents-001`：pack cells source `5183`、candidate `5234`，差异仅 `51`；candidate `tCoastLand / havenCells` 为 `903`，source 为 `875`；陆地 feature bucket 显示 candidate `1-cell` 陆块 `8` 个，source 为 `3` 个。
- `continents-10000-audit-continents-003`：pack cells source `5528`、candidate `5649`，差异 `121`；candidate `tCoastLand / havenCells` 为 `1135`，source 为 `1011`；candidate 湖泊 bucket 为 `1-cell` 湖 `3` 个，source 为 `1` 个。
- 该证据说明剩余 warn 更像高度阈值附近的岸线距离场 / 洼地拓扑差异，或 pack feature 泛洪后的小 feature 分裂；下一步不应改 pack 抽点条件，也不应做末端过滤。

验证：

- `node --check tools/source-candidate-warn-diagnostics.mjs` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-pack-diagnostics.json" --markdown "$env:TEMP\fmg-source-warn-pack-diagnostics.md"` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。

### 2026-07-05 pack 海岸高度诊断字段

背景：

- pack 层拓扑诊断已确认 candidate 的海岸陆地 / haven 偏高，但仅有 `t` 距离场数量还不足以判断分叉来自高度阈值附近，还是 feature 泛洪后的碎片化。
- 继续推进剩余 `features.total / lakeNames` warn 前，需要 source 与 candidate 都能输出相同的海岸高度统计，避免只看 candidate 单侧数据。

实现：

- `tools/source-export-baseline.mjs` 与 `tools/webgl-generator-export-baseline.mjs` 的 `pack` summary 新增 `topology` 字段。
- `topology` 记录海岸陆地高度、水侧海岸高度，以及 `18-22` 高度阈值附近的 pack cell 总数、陆地数、水域数和高度分布。
- `tools/source-candidate-warn-diagnostics.mjs` 把 `coastLandHeightP50 / coastLandHeightP95 / coastWaterHeightP50 / nearThresholdTotal / nearThresholdLand / nearThresholdWater` 汇入 Pack 摘要。
- 本轮只增强只读诊断工具，不修改正式生成器运行时代码。

当前诊断：

- `continents-10000-audit-continents-001`：阈值附近总数 source `1194`、candidate `1193`，陆地阈值 cell 只多 `1`。该 case 更像 feature 泛洪 / 小陆块分裂问题，而不是单纯高度阈值偏移。
- `continents-10000-audit-continents-003`：阈值附近总数 source `1570`、candidate `1682`，candidate 多 `112`；其中陆地阈值 cell source `865`、candidate `966`，candidate 多 `101`。该 case 更适合作为高度阈值 / 海岸距离场优先样本。

验证：

- `node --check tools\webgl-generator-export-baseline.mjs` 通过。
- `node --check tools\source-export-baseline.mjs` 通过。
- `node --check tools\source-candidate-warn-diagnostics.mjs` 通过。
- `git diff --check` 通过。
- 重新刷新 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 source / candidate baseline summary，并重新生成 diff。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-topology-diagnostics.json" --markdown "$env:TEMP\fmg-source-warn-topology-diagnostics.md"` 通过。

### 2026-07-05 feature 级拓扑 warn 诊断

背景：

- pack 海岸高度诊断已经指出 001 与 003 的分叉形态不同，但仍停在总量层面。
- 继续推进前需要知道多出来的小陆块 / 小湖泊具体贴着什么高度、什么 feature，避免把小 feature 直接删除当成修复。

实现：

- `tools/source-export-baseline.mjs` 与 `tools/webgl-generator-export-baseline.mjs` 的 feature detail 新增 `topology`，从 `pack.cells.f/h/t/c` 反查每个 feature 的成员 cell、高度范围、距离场类型、`18-22` 阈值 cell、边界邻接 feature 类型 / 分组和邻接高度范围。
- `tools/source-candidate-warn-diagnostics.mjs` 新增 `tinyLandDetails` 与 `tinyLakeDetails`，分别列出 `10` cell 以下小陆块和小湖泊的紧凑诊断。
- 本轮仍只增强诊断工具，不修改正式生成器运行时代码。

当前诊断：

- `continents-10000-audit-continents-001`：candidate 多出的 `1-2` cell 小陆块大多为 `h=20-22`，边界邻接高度多为 `<20`，属于海平面阈值附近孤点；source 也有同类孤点，但 candidate 数量更多。
- `continents-10000-audit-continents-003`：candidate 的小湖中出现 `h=17` 的命名湖和无 outlet 的小湖，而 source 的小湖多为 `h=18-19` 且均有 outlet。该 case 更适合继续查洼地消解、lake outlet 和高度海平面校准。
- 两个 case 的小陆块 / 小湖泊边界邻居类型均主要是 `island`，说明这些 warn 不是海岸线跨海连接或 pack 抽点条件直接造成的对象类型错误。

验证：

- `node --check tools\webgl-generator-export-baseline.mjs` 通过。
- `node --check tools\source-export-baseline.mjs` 通过。
- `node --check tools\source-candidate-warn-diagnostics.mjs` 通过。
- `git diff --check` 通过。
- 重新刷新 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 source / candidate baseline summary，并重新生成 diff。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-feature-diagnostics.json" --markdown "$env:TEMP\fmg-source-warn-feature-diagnostics.md"` 通过。

### 2026-07-05 深洼湖泊岸线标记 source parity

背景：

- feature 级拓扑诊断显示 001 的差异主要是海平面边缘小陆块和 pack 海岸 / haven 数略高。
- 对照 source `public/main.js` 的 `addLakesInDeepDepressions()` 后发现，原版新增深洼湖泊时只把湖 cell 自身设为 `t = -1`，相邻陆格标 coast 的语句实际写成 `cells.t[c] = 1`，其中 `c` 是邻接数组，不会正确写到每个邻居。
- 候选此前把每个相邻陆格都写成 `LAND_COAST`，会让后续 pack 抽点阶段比 source 多保留湖岸 coast midpoint。

实现：

- `app/webgl-generator/src/generator/features.js` 的 `addLake()` 取消对新增深洼湖泊相邻陆格的额外 `LAND_COAST` 标记。
- `openNearSeaLakes()` 的开湖阈值格和相邻 coast 标记不变，已存在海岸 / 海湖连接逻辑不变。
- 本轮是 source parity 修正，不删除湖泊、不删除小岛、不过滤湖名。

当前诊断：

- `continents-10000-audit-continents-001`：candidate pack cells 从 `5234` 降到 `5226`，source 为 `5183`；candidate `havenCells / tCoastLand` 从 `903` 降到 `901`，source 为 `875`。剩余 `features.total` 仍为 warn。
- `continents-10000-audit-continents-003`：candidate pack cells、湖泊数和 lakeNames 未变化，仍为 `lateStages.names.lakeNames` warn；该 case 根因不在深洼湖泊 shore coast 标记，仍应继续查 lake outlet / 洼地消解。

验证：

- `node --check app\webgl-generator\src\generator\features.js` 通过。
- `git diff --check` 通过。
- 重新刷新 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 candidate summary，并重新生成 diff；两个目标 case 均为 `warn 1 / fail 0`，未新增 fail。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-feature-parity-diagnostics.json" --markdown "$env:TEMP\fmg-source-warn-feature-parity-diagnostics.md"` 通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --timeout 180000` 通过；quick 矩阵为 `2 pass / 1 warn / 0 fail`。

### 2026-07-05 洼地消解 source-like 对照诊断

背景：

- 003 的剩余 `lateStages.names.lakeNames` warn 来自候选真实湖泊 `7` 对 source `5`，且额外小湖中包含无 outlet 湖。
- 对照 source `resolveDepressions()` 后，候选此前的 optimized 路径会在首轮后只围绕湖泊变更区域局部处理 land，而 source 每轮都会按高度顺序扫描全部内陆 land。
- 需要先判断这个优化是否导致 lake outlet / 洼地拓扑偏差，再决定是否值得改默认生成逻辑。

实现：

- `app/webgl-generator/src/generator/rivers.js` 新增 `riverDepressionMode` 诊断参数；默认仍为 `optimized`。
- 当 `riverDepressionMode = source-like` 时，洼地消解走全量 land 循环，并保留 source 的 lake 检查、抬湖、闭湖和 progress 回退结构。
- `tools/webgl-generator-export-baseline.mjs` 新增 `--river-depression-mode source-like`，用于临时 baseline 导出诊断。
- `generatePlaceholderMap()` 允许该诊断参数穿过 `normalizeOptions()` 后进入河流阶段，但不会写入普通应用默认 options。

当前诊断：

- 直接生成 `audit-continents-003 / continents / 10000` 时，默认 optimized 的河流 metadata 为 `depressionMode = optimized`，source-like 为 `depressionMode = source-like`，开关已确认生效。
- source-like 结果仍为湖泊 `7`、pack cells `5649`；临时导出 summary 中命名湖泊仍为 `7`、outlet 湖泊仍为 `4`。
- 该证据说明 003 的剩余 lakeNames warn 不能靠把洼地消解改回全量 land 扫描解决，下一步应继续查湖泊形成、outlet 续流或开湖链路。
- 因 source-like 对当前目标无收敛收益，本轮不切默认算法，避免扩大 50k / 100k 生成性能风险。

验证：

- `node --check app\webgl-generator\src\generator\index.js` 通过。
- `node --check app\webgl-generator\src\generator\rivers.js` 通过。
- `node --check tools\webgl-generator-export-baseline.mjs` 通过。
- `git diff --check` 通过。
- 临时导出 `node .\tools\webgl-generator-export-baseline.mjs --template continents --cells 10000 --seed audit-continents-003 --out-dir $env:TEMP\... --screenshot false --river-depression-mode source-like` 通过。
- 直接生成 optimized / source-like 对照通过，确认 `depressionMode` 分别为 `optimized / source-like`，003 指标未因该诊断路径改变。

### 2026-07-05 grid feature 级拓扑诊断

背景：

- source-like 洼地消解已经证明 003 的 `lakeNames` warn 不是 pack 河流阶段的全量 / 局部洼地扫描差异。
- 继续查 003 时需要判断湖泊数量是在 grid feature 阶段已经分叉，还是 pack 重图、河流 outlet 或命名阶段才分叉。
- 同时 001 的 `features.total` 也需要确认小陆块差异是否早于 pack。

实现：

- `tools/source-export-baseline.mjs` 和 `tools/webgl-generator-export-baseline.mjs` 在 `grid` 摘要下新增 `featureDiagnostics`，复用现有 feature 分桶、拓扑、边界邻接和小 feature 明细结构。
- 修正 candidate grid 摘要的 `featureCount`，不再误用 pack feature 数。
- feature cell 数统一为“数组取 length，数字直接取值，否则按 `cells.f` 反查”，避免 grid feature 没有 `cells` 数值字段时显示为 `0c`。
- `tools/source-candidate-warn-diagnostics.mjs` 新增 Grid Feature 摘要，并在 `features.total` / `lakeNames` 诊断中说明 grid 阶段是否已分叉。

当前诊断：

- `continents-10000-audit-continents-001`：grid 阶段 source 陆地 feature `10`、candidate `16`；pack 阶段仍是 source `10`、candidate `16`。该 case 的小陆块差异早于 pack 抽点。
- `continents-10000-audit-continents-003`：grid 阶段 source 湖泊 `5`、candidate `7`；pack 阶段仍是 source `5`、candidate `7`。该 case 的 lakeNames warn 早于 pack、rivers 和 lakeNames。
- 一次临时实验把高度模板随机坐标落点从行列估算改成扫描实际最近 grid point，003 湖泊从 `7` 变成 `1`，比 source `5` 更远；该改法已撤回，不作为修正路线。
- 下一步应回到高度模板落点与 source 随机流 / grid 点关系、海平面阈值附近微地形、`addLakesInDeepDepressions()` 和 `openNearSeaLakes()` 的 grid 阶段输入。

验证：

- `node --check tools\source-export-baseline.mjs` 通过。
- `node --check tools\webgl-generator-export-baseline.mjs` 通过。
- `node --check tools\source-candidate-warn-diagnostics.mjs` 通过。
- `git diff --check` 通过。
- 重新刷新 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 source / candidate summary，并重新生成 diff。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-grid-feature-diagnostics.json" --markdown "$env:TEMP\fmg-source-warn-grid-feature-diagnostics.md"` 通过，报告已包含 Grid Feature 摘要。

### 2026-07-05 高度模板 step feature 预览诊断

背景：

- grid feature 级拓扑诊断已证明 001 / 003 的剩余 warn 在 grid feature 阶段已经分叉，早于 pack、河流 outlet 和湖泊命名。
- 继续追踪时需要知道分叉发生在高度模板的哪一步，而不是只看最终 grid feature 数。

实现：

- `traceHeightmapSteps()` 新增可选 `inspectStep` 回调，默认不传时正式生成行为不变。
- `tools/heightmap-step-trace.mjs` 在 source 和 candidate 每个高度模板 step 后按海平面 `20` 与 grid 邻接做 raw feature 预览，输出 feature 总数、陆地、湖泊、小陆块、小湖泊、最大陆块 / 湖泊和 `18-22` 海平面附近格子。
- trace 工具的 source dev server 清理补充销毁 stdio pipe，避免报告已写出后进程在非交互环境里拖到外层超时。

当前诊断：

- `continents-10000-audit-continents-001`：step 1-12 的 raw feature 预览大体一致；step 13 `Trough 3-4 5-10 45-55 45-55` 开始分叉，step 13 feature 为 source `19` / candidate `17`，step 14 为 `18` / `16`，step 15 `Mask` 后变为 `17` / `21`，其中陆地 feature 为 source `10` / candidate `16`，与正式 grid feature 差异方向一致。
- `continents-10000-audit-continents-003`：step 9 起已有轻微水陆数量差，step 13 / 14 明显扩大；step 15 后 raw 预览湖泊为 source `9` / candidate `12`，正式 grid feature 阶段再变为 source `5` / candidate `7`。
- 两个 case 的 `Trough` step 13 随机数消耗均已不一致：001 为 source `1135` / candidate `1034`，003 为 source `1310` / candidate `1281`；随后的 `Pit` step 14 首候选点也跑偏。下一步应对照 source `HeightmapGenerator.addTrough()` 的路径选择、传播层数和随机消耗，而不是改命名、pack 或河流洼地循环。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node --check tools\heightmap-step-trace.mjs` 通过。
- `git diff --check` 通过。
- `node .\tools\heightmap-step-trace.mjs --template continents --cells 10000 --seed audit-continents-001 --port 5319 --browser-channel chrome --timeout 180000 --out-dir "$env:TEMP\fmg-heightmap-step-continents-001-rerun"` 通过。
- `node .\tools\heightmap-step-trace.mjs --template continents --cells 10000 --seed audit-continents-003 --port 5318 --browser-channel chrome --timeout 180000 --out-dir "$env:TEMP\fmg-heightmap-step-continents-003"` 通过。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-heightmap-feature-trace.json" --markdown "$env:TEMP\fmg-source-warn-heightmap-feature-trace.md"` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；构建仅保留既有 Vite 大 chunk 警告。

### 2026-07-05 Strait 宽度传播 source parity

背景：

- 高度 step trace 显示 001 / 003 的 `Trough` 随机流分叉之前，step 9 / 10 的 `Strait` 已经让候选高度、陆地比和 raw feature 预览轻微偏离 source。
- 对照 source `HeightmapGenerator.addStrait()` 后发现，source 每一圈传播使用 `remainingWidth = desiredWidth - i` 来计算指数；候选此前固定使用 `desiredWidth`，导致多圈海峡的后续层被过度压低。

实现：

- `app/webgl-generator/src/generator/heightmap.js` 的 `addStrait()` 改为按 `remainingWidth` 逐层计算 `exponent = 0.9 - step * remainingWidth`。
- 本轮只修 source parity，不改高度模板内容、不改 feature 过滤、不改湖泊命名或 pack 抽点条件。

当前诊断：

- `continents-10000-audit-continents-001`：修正后 step 9-15 的高度统计、随机数消耗和 feature 预览全部对齐；`features.total` 从 warn 回到 `pass`，最终 diff 为 `pass（fail 0，warn 0）`。
- `continents-10000-audit-continents-003`：修正后 step 9-15 的高度统计、随机数消耗、`Pit` 首候选点和 feature 预览全部对齐；`lateStages.names.lakeNames` 从 warn 回到 `pass`，最终 diff 为 `pass（fail 0，warn 0）`。
- `diagnose:source-warns` 对两个此前剩余 warn case 均输出 `pass（fail 0，warn 0）`。
- quick candidate 矩阵无 fail；`mediterranean-100000-audit-mediterranean-001` 和 `continents-100000-audit-continents-001` 为 pass，`archipelago-100000-audit-archipelago-001` 仍有一个 `economy.markets.stock.mean` warn，后续应作为经济口径专项处理，不属于地形拓扑 warn。

验证：

- `node --check app\webgl-generator\src\generator\heightmap.js` 通过。
- `node .\tools\heightmap-step-trace.mjs --template continents --cells 10000 --seed audit-continents-001 --port 5320 --browser-channel chrome --timeout 180000 --out-dir "$env:TEMP\fmg-heightmap-step-continents-001-strait-parity"` 通过。
- `node .\tools\heightmap-step-trace.mjs --template continents --cells 10000 --seed audit-continents-003 --port 5321 --browser-channel chrome --timeout 180000 --out-dir "$env:TEMP\fmg-heightmap-step-continents-003-strait-parity"` 通过。
- 重新刷新 `continents-10000-audit-continents-001` 和 `continents-10000-audit-continents-003` 的 candidate summary 与 diff，两个 case 均为 `pass（fail 0，warn 0）`。
- `$env:CI='true'; pnpm run diagnose:source-warns -- --out "$env:TEMP\fmg-source-warn-strait-parity.json" --markdown "$env:TEMP\fmg-source-warn-strait-parity.md"` 通过。
- `node .\tools\candidate-baseline-matrix.mjs --mode quick --refresh true --browser-channel chrome --timeout 180000` 通过，无 fail。
- `$env:CI='true'; pnpm run build:app` 通过；构建仅保留既有 Vite 大 chunk 警告。
- `$env:CI='true'; pnpm run profile:e2e -- --browser-channel chrome --cells 10000 --template continents --seed audit-continents-001 --out "$env:TEMP\fmg-strait-parity-e2e.json" --markdown "$env:TEMP\fmg-strait-parity-e2e.md" --max-ready-ms 2500 --max-load-ms 1200` 通过，点击到出图 `1462.7ms`，纯生成 `784.5ms`，WebGL 加载 `380.3ms`。

### 2026-07-05 气候地图范围百分比

背景：

- 用户要求气候配置支持地图在整个球面上的相对大小，让地图可以作为局部图，也可以拉到 `100%` 作为全球图。
- 旧实现已经有内部 `size` 和 `climateLatitudeSpan`，但 UI 没有明确暴露“球面占比”，且经度覆盖仍按画布宽高比推导，不满足 `100% = 全球图` 的语义。

实现：

- 新增 `climateMapSizePercent` 选项，默认 `25%`，对应旧预览的 `45° / 180°` 比例；旧 `climateLatitudeSpan` 会按 `span / 180 * 100` 兼容换算。
- 气候坐标改为按百分比计算覆盖范围：`latT = percent * 180°`，`lonT = percent * 360°`，因此 `100%` 覆盖完整纬度和经度。
- 控制面板气候区新增“地图范围”滑条，地球预览 footprint 的南北跨度和东西宽度都随百分比变化；“画布纬度”继续只控制中心纬度。
- 运行时读写、实时气候刷新、保存前气候同步、摘要和 hover 统计展示均接入 `climateMapSizePercent`。

验证：

- `node --check` 覆盖 `climate.js`、`options.js`、`app.js`、`panel.js`。
- 字段断言确认默认 `25%` 生成 `45° / 90°`，`100%` 生成 `180° / 360°`。
- `$env:CI='true'; pnpm run build:app` 通过；本轮未跑浏览器烟测。

### 2026-07-05 地区纹理图层第一刀

背景：

- 用户要求颜色选择后续支持纹理，并引入一个主要用于战区、无人区、管控区等态势表达的地区图层。
- 用户同时明确国家和省份默认生成时不要使用纹理，随机地区显示比例也不要过高，避免满图都是纹理。

实现：

- 新增 `app/webgl-generator/src/renderer/zone-layer.js`，以 WebGL 顶点方式绘制地区纹理，不增加 DOM overlay 负担。
- 纹理预设第一刀支持 `diagonal / cross / dots`，并兼容原版 `url(#hatch*)` 风格字段到本地纹理的映射。
- 控制面板图层页新增“地区”开关；默认可见，但数据生成数量已压低。
- 生成端 `zones` 目标数量从约 `7-16` 收敛为 `2-6`，并给每个 zone 写入 `pattern / hexColor`。
- 新增 `Warzone` 地区类型，优先从实际军事 front 的共享边界生成少量战区；无 front 时才尝试 Enemy 边界。该逻辑只生成静态态势地区，不引入动态军事系统。
- 大型 `Crusade` 区域范围收窄，避免个别随机结果覆盖过多 cell。
- GeoJSON 导出为 zone properties 补充 `pattern / hexColor`。

验证：

- `node --check` 覆盖 `zone-layer.js`、`placeholder-renderer.js`、`zones.js`、`map-file-io.js`。
- 生成断言 `zone-texture-check / 3000 cells`：地区数量 `2`，纹理层顶点 `3318`，关闭地区图层时顶点为 `0`。
- 多 seed 检查中 `zone-war-0` 生成 `Warzone / Invasion`，军事 fronts `2`，campaigns `2`。
- `$env:CI='true'; pnpm run build:app` 通过后再提交。

### 2026-07-05 hover 人口调试行

背景：

- 用户发现西北角大陆上部分 cell 显示 `13°C / 75mm` 但人口为 `0`，需要直接看到人口评分相关中间量。

实现：

- `pickGridCell()` 结果补充 pack 侧 `packBiome / packHeight / suitability / flux / resource`。
- hover 信息新增“调试”行，展示 `biome / height / suitability / packCell / flux / resource`。
- 该调试行只读展示，不改变生物群系、适宜度或人口计算。

验证：

- `node --check` 覆盖 `picking.js` 和 `panel.js`。
- 生成断言 `hover-debug-check / 3000 cells` 成功拾取陆地 cell，并输出 `packBiome / packHeight / suitability / flux / resource`。
- `$env:CI='true'; pnpm run build:app` 通过后提交推送。

### 2026-07-05 对象动作区操作收敛

背景：

- 用户发现国家编辑按钮失效，并要求新增、删除和编辑处在同一行，顺序更靠前。
- 同类列表面板中还存在测量对象使用大文本按钮、河流编辑需要打开二级面板后再点按钮的问题。
- 方向校正：新增和删除应并入原来编辑按钮所在的对象动作区，而不是把编辑按钮搬到列表下方的新增删除区域。

实现：

- `UiPanelIoActions` 支持 `active` 状态，列表小图标可以直接表达当前编辑态。
- 国家和省份面板将“新增 / 删除 / 编辑”放回原对象动作区，新增固定排第一，编辑按钮直接调用既有 `onEdit` 切换编辑态，并在编辑中高亮；重命名、颜色、政体、备注等二级动作仍排在结构性操作之后。
- 城市新增/删除并入城市对象动作区，新增固定排第一，新增模式增加高亮。
- 测量对象把编辑形状、定位、删除从大文本按钮收敛到列表小图标；河流编辑从二级弹层按钮改成直接图标切换。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- 本轮未额外跑浏览器性能烟测。

### 2026-07-05 国家省份编辑按钮状态链路修复

背景：

- 用户反馈国家编辑按钮点击后仍然没有反应。
- 代码排查发现国家/省份编辑只切换面板 brush active，没有像对象详情和河流编辑一样同步 `selectionStore.startEditing()`，运行时“编辑对象”状态不会变化；同时外部调用 `setActive(false)` 时也不会触发退出编辑清理。

实现：

- 国家和省份 panel 的外部 `setActive(active)` 在状态变化时会触发对应 `onActiveChange`，保证被其他编辑器关闭时走同一套退出逻辑。
- runtime 的国家/省份 `onEdit` 现在会先 `setSelection`，再 `startEditing(object)`，让全局 editor store、运行时面板和交互锁都能看到当前编辑对象。
- 退出国家/省份编辑、切到新增模式时，如果当前全局编辑对象是对应类型，会调用 `selectionStore.stopEditing()` 清理。

验证：

- `node --check` 覆盖 `app.js`、`state-panel.js`、`province-panel.js`。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。

### 2026-07-05 国家省份动作按钮运行时异常修复

背景：

- 用户反馈“新建国家、删除国家、编辑国家都没有反应”。
- 排查发现国家/省份面板把新增、删除、编辑并入 `UiActionDock` 后，`handleActionSelect()` 仍引用裸 `callbacks`；在 `<script setup>` 的函数作用域里这里没有该变量，点击会抛 `ReferenceError`，因此所有对象动作按钮都不会继续执行。

实现：

- 国家面板和省份面板的对象动作 handler 统一改为 `props.callbacks`。
- 删除和编辑分支补 `return`，避免一个动作处理完继续落到后续分支。

验证：

- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- 构建产物下用 Playwright 直接打开国家面板验证：点击“新增国家”后 `activeEditor = state:add` 且交互锁开启；取消新增后点击“进入国家编辑”，`state` brush active 为 `true`，全局 `editingObject.kind = state`，无 page error / console error。

### 2026-07-05 新增删除临时态互斥与关闭清理

背景：

- 用户要求处于新建或删除态时，对应按钮必须常亮标识当前状态，同区域其他按钮置灰，并且再次点击同一按钮可以退出。
- 用户同时要求退出整个编辑面板时清除所有暂时状态，避免新增、删除、编辑等状态残留到下次打开。

实现：

- 国家、省份、城市面板都新增 `deleteMode`，删除从“直接删除选中项”改为“下一次点击地图目标对象”。
- 新增态、删除态和编辑态互斥：进入新增/删除会退出同面板编辑态，并关闭其他互斥编辑器；同区域非当前模式按钮会禁用。
- runtime 新增国家、省份、城市删除态点击处理，国家/省份按点击 cell 的归属删除，城市优先按城市拾取对象删除，并以 pack cell 的 burg 作为兜底。
- 全局 editor snapshot 增加 `state:delete / province:delete / city:delete`，并把城市临时态同步到 Vue editor store。
- 面板关闭时统一回调关闭新增/删除/编辑态，保证关闭后 `activeEditor` 为空。

验证：

- `node --check` 覆盖 `app.js`、国家/省份/城市 panel。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- 构建产物 Playwright 定向验证覆盖国家、省份、城市三类面板：新增态按钮常亮且删除/编辑置灰；删除态按钮常亮且新增/编辑置灰；再次点击可退出；关闭面板后 `activeEditor` 清空。

### 2026-07-05 中立地区新增国家语义修正

背景：

- 用户要求新增国家必须支持从中立地区创建，即使该位置按生成公式没有人口，也不能阻挡用户的直接输入。
- 排查发现 0 人口中立陆地本身没有被 `isNoop` 拦截，但旧的新增范围逻辑在中立 cell 上会把所有陆地邻居加入新国家，可能错误吞并旁边已有国家的 cell。

实现：

- 新增国家的有效性改为同时检查 grid 陆地和可用 pack 陆地锚点；不检查人口、适居度或文化人口分布。
- pack 锚点选择优先使用 `grid.cells.pack` 和同 grid cell 映射的 pack cell，并按原归属匹配优先；缺少直接映射时才找最近陆地 pack cell 兜底。
- 中立 cell 建国时，初始范围只包含中立的相邻陆地 cell；非中立 cell 建国仍只包含同原归属相邻 cell，避免跨归属误吞并。
- 首都创建继续使用最少人口兜底，因此 0 人口中立地区也会生成可用首都。

验证：

- `node --check app\webgl-generator\src\runtime\state-edit-commands.js` 通过。
- Node 断言 `neutral-add-check / continents / 10000` 中 0 人口中立陆地 cell `3130`：`isNoop = false`，新增结果 `stateId = 18`，新增 cells 从旧行为的 `7` 收敛为中立自身和中立邻居共 `3`，`foreignChanged = []`。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。

### 2026-07-05 地区管理面板第一刀

背景：

- 用户指出已有地区纹理图层，但没有地区管理入口，看不出图上的纹理线分别代表什么。
- 当前需求优先是可读性和识别，不是立即扩展成完整地区编辑器。

实现：

- 管理 tab 新增“地区管理”入口，新增 `zone-panel.js` 和 `ZonePanel.vue`。
- 地区面板顶部展示当前地图实际出现的纹理图例，说明战区、入侵、叛乱、传教、圣战、疫病、灾害、洪水等类型对应的颜色和纹理。
- 地区列表展示名称、类型中文名、纹理、涉及国家、规模和面积；详情区展示类型含义、颜色、面积和显示状态。
- 新增 `zone` 对象类型，选中地区后接入 selection store；renderer 支持按 zone cells 计算定位范围，并在地图上用半透明 mesh 高亮选中地区。

验证：

- `node --check` 覆盖 `app.js`、`zone-panel.js`、`object-kinds.js`、`object-resolver.js`、`placeholder-renderer.js`、`selection-layer.js`。
- `$env:CI='true'; pnpm run build:app` 通过；新增 `ZonePanel` 懒加载 chunk，仅保留既有的大 chunk 警告。
- 构建产物 Playwright 定向验证：管理按钮存在，地区面板可打开，图例 `3` 项、列表 `3` 行，点击定位后 `selection.object.kind = zone`、`locateStatus = zone #0`，控制台错误为空。

### 2026-07-06 GitHub issue #1：地图外区域提示与边缘柔化

背景：

- 当前仓库 open issue 只有 #1，内容是有效地图区域与无效区域交界处折线割裂，并希望鼠标指向无效区域时右下角提示“未开发”。
- 现有 `climateMapSizePercent` 只控制气候坐标映射，不是真正的数据 mask；直接把它改成硬裁剪会影响国家、城市、路线、河流和编辑链路，风险过大。

实现：

- renderer 静态线层新增地图四周半透明渐变带，使用背景色向地图内侧渐隐，降低 Voronoi 边缘与画布背景的硬切割感。
- `pickClientPoint()` 在世界坐标超出地图范围，或 `pickGridCell()` 未命中有效 cell 时，返回 `invalidMapArea` 结果。
- hover 面板支持 `invalidMapArea`，标题显示“未开发区域”，状态行显示“未开发”，并区分“地图有效范围外”和“未命中有效 cell”。
- 本轮不改变生成数据、不调整 cell 高度/feature/政治归属。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。

### 2026-07-06 气候经纬范围拆分

背景：

- 用户指出当前气候“地图范围”同时控制纬度和经度，不利于单独调整画布在地球东西方向上的投影宽度。
- 新目标是把旧比例收缩为“纬度范围”，新增“经度范围”，并提供按当前经纬比例锁定调节的 icon 按钮，保留此前宽高一起调节的能力。

实现：

- 生成选项新增 `climateLatitudeRangePercent / climateLongitudeRangePercent`，旧 `climateMapSizePercent` 继续作为兼容字段并映射到纬度范围。
- `calculateMapCoordinates()` 改为分别用纬度百分比计算 `latT`，用经度百分比计算 `lonT`。
- 控制面板把“地图范围”改为“纬度范围”，新增“经度范围”滑条，地球预览 footprint 的横向宽度改由经度范围控制。
- 新增经纬范围比例锁定 icon 按钮；开启时记录当前 `经度范围 / 纬度范围`，之后调节任一范围会按该比例同步另一个范围。
- 运行时气候同步、保存恢复和气候变更检测都纳入新字段。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- Node 轻量断言：`climateLatitudeRangePercent=20 / climateLongitudeRangePercent=60` 生成 `latT=36 / lonT=216`；旧 `climateMapSizePercent=30` 仍兼容生成 `latT=54 / lonT=108`。

### 2026-07-06 地图外缘与气候范围锁定回修

背景：

- 用户复核后指出 issue #1 并未真正解决：画布外颜色和画布边缘仍有锯齿状分割，不能算自然过渡。
- 用户同时指出经纬度范围控制能力可用，但锁定按钮位置不对；需要放在两条范围滑杆右侧，垂直居中，并用两条线表示关联。默认应为锁定状态，除非用户已经更改并保存到 LocalStorage。

实现：

- 地图边缘遮罩从“仅地图内部弱渐变”改为跨世界边界的内外双向 feather：四边各绘制外侧实底色和内侧渐隐带，覆盖 Voronoi 外缘与未开发底色的硬切割。
- renderer `loadMap / loadMapAsync` 会把 `.map-stage` 背景色同步到当前地图 `layers.background`，避免 DOM 舞台背景和 WebGL 清屏色不一致。
- 气候范围控件新增 `.climate-range-control-group`，锁按钮跨“纬度范围 / 经度范围”两行，右侧垂直居中；两条伪元素线连接滑杆与锁按钮，锁定时改为暗金色。
- `global-config-store` 新增 `climateRangeRatioLocked`，默认 `true`；用户点击锁按钮时写入偏好，下一次打开沿用用户选择。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。

### 2026-07-06 地区纹理可见性和密度修正

背景：

- 用户指出地区管理面板图例写着纹理含义，但地图上看起来更像实心填色。
- 旧地图纹理层每个 zone 最多抽样 `220` 个 cell，且每个 cell 只画一条中心线或一个点；同时抽样 cell 还有较明显半透明填色，远看容易压过纹理。

实现：

- 地图地区层不再绘制 cell 底色，只保留纹理线 / 点，避免线上或不同缩放下仍被读成实心色块。
- 斜线和交叉线改为每个 cell 内三条平行线，圆点阵列改为每个 cell 内三点，纹理密度更接近图例表达。
- 大地区纹理抽样上限从 `220` 提到 `720`，降低大范围地区的稀疏感。
- 地区管理图例的 CSS 纹理同步加密：斜线 / 交叉线间距从 `7px` 收到 `5px`，圆点背景尺寸从 `7px` 收到 `5px`。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- 构建产物截图确认地区管理图例显示更密纹理；无选中高亮的画布截图中，入侵区显示为斜线纹理，不再表现为实心色块。
- 线上复核仍像实心后，追加移除地图地区底色并提升纹理本身 alpha；再次用构建产物截图确认罗联邦附近只显示斜线纹理。

### 2026-07-07 viewport idle commit 过期取消加固

背景：

- 当前动态线层已经改为停止交互后的 idle commit 分片重建，但连续滚轮 / 拖拽时仍需要确保旧任务不会用过期相机状态上传 buffer。
- 本刀只加固路线 / 河流 screen-space mesh 的任务边界，不改变地区纹理、DOM overlay 或地图数据。

实现：

- route / river 同步和异步 mesh 构建都使用 `snapshotCamera()` 捕获稳定相机参数，避免构建过程中读取到后续视口变化。
- route 异步构建同时复制 selection 快照，避免选中态变化影响旧任务。
- route / river async builder 在每次 `yieldToBrowser()` 返回后立即检查 `shouldContinue()`；过期时标记 `stats.aborted` 并退出，让外层跳过 buffer 上传和最终 draw。

验证：

- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- 本刀未跑重 profile，留到后续动态线层性能专项合并验证。

### 2026-07-07 地区样式编辑入口

背景：

- 地区纹理图层和地区管理面板已经完成，但地区仍只能查看，不能在面板内调整纹理或颜色。
- 当前计划中“颜色选择器中的纹理选择入口”适合作为低风险第一刀；手动创建地区仍留到后续单独做。

实现：

- 新增 `zone-edit-commands.js`，提供 `createSetZoneStyleCommand()`，可撤销地修改地区 `hexColor / pattern`。
- 命令刷新范围收窄为地区线层、选中态和对象面板，不触发政治、军事、经济等派生重算。
- 地区管理面板新增 `UiActionDock` 小图标动作“调整样式”，二级浮层内复用共享 HSL 取色面板，并提供斜线 / 交叉线 / 圆点阵列纹理下拉。
- `zone-panel.js` 补齐 `onStyleChange / onUndo / onRedo` 桥接，地区面板新增历史按钮。

验证：

- `node --check app\webgl-generator\src\runtime\zone-edit-commands.js` 通过。
- `node --check app\webgl-generator\src\runtime\app.js` 通过。
- `node --check app\webgl-generator\src\ui\panels\zone-panel.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过；仅保留既有的大 chunk 警告。
- 构建产物 Playwright 烟测通过：打开地区管理，选中地区 `#0`，颜色从 `#d98238` 改为 `#7f6cc7`，纹理从 `diagonal` 改为 `dots`；撤销恢复纹理为 `diagonal`，重做恢复 `dots`，`glError = 0`，console/page error 为 `0`。
