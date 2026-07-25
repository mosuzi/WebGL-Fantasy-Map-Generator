# 第 195 项 Cell 动作重编排矩阵

- 注册画布模式：28 / 28
- 非注册直接操控：19 / 19
- 非注册直接操控宿主实例：89 / 89
- 第 200 项 deferred-owned:195：4 / 4
- 总行数：47
- 排除直接操控：12
- 双向差集、重复 actionId、空目标和空来源合计：0
- 唯一 inspector 签名：`cells.inspectAction(actionId, input, options = {})`

## 第 200 项上游归属

| capabilityId | 输入空间 | 第 195 项阶段 |
|---|---|---|
| `cell.action-inspection` | grid-cell-ref / pack-cell-ref / point / path / range | C |
| `cell.controlled-write` | grid-cell-ref / inspection-token / expected-revision | C → D |
| `cell.read` | grid-cell-ref / pack-cell-ref / world-point / client-point | A |
| `cell.visual-diagnostics` | grid-cell-ref / viewport | B |

## 动作映射

| 来源 | actionId | 输入空间 | inspect | execute | 阶段 / 状态 | 旧兼容 |
|---|---|---|---|---|---|---|
| `height:brush` | `height.applyCells` | grid cell set + changes + range | `cells.inspectAction:height.applyCells` | `edit.height.applyChanges` | C / planned-registry | 沿用旧高度笔刷、语义高度 API 与派生更新契约 |
| `state:brush` | `states.assignCells` | grid cell set + changes | `cells.inspectAction:states.assignCells` | `edit.states.applyChanges` | C / planned-registry | 旧国家归属笔刷与 applyChanges 保持可用 |
| `state:add` | `states.createAtCell` | grid CellRef | `edit.states.inspectCreateAtCell` | `edit.states.createAtCell` | C / planned-registry | edit.states.add(gridCell) 保持等价兼容 |
| `state:delete` | `states.delete` | state ref or picked CellRef | `cells.inspectAction:states.delete` | `edit.states.delete` | C / planned-registry | 复用第 203 项危险动作预检与旧删除入口 |
| `province:brush` | `provinces.assignCells` | grid cell set + changes | `cells.inspectAction:provinces.assignCells` | `edit.provinces.applyChanges` | C / planned-registry | 旧省份归属笔刷与 applyChanges 保持可用 |
| `province:add` | `provinces.createAtCell` | grid CellRef | `edit.provinces.inspectCreateAtCell` | `edit.provinces.createAtCell` | C / planned-registry | edit.provinces.add(gridCell) 保持等价兼容 |
| `province:delete` | `provinces.delete` | province ref or picked CellRef | `cells.inspectAction:provinces.delete` | `edit.provinces.delete` | C / planned-registry | 复用第 203 项危险动作预检与旧删除入口 |
| `city:add` | `cities.createAtCell` | grid CellRef | `edit.cities.inspectCreateAtCell` | `edit.cities.createAtCell` | C / planned-registry | edit.cities.add(gridCell) 保持等价兼容 |
| `city:delete` | `cities.delete` | city ref or picked CellRef | `cells.inspectAction:cities.delete` | `edit.cities.delete` | C / planned-registry | 复用第 203 项危险动作预检与旧删除入口 |
| `city:move` | `cities.move` | city ref + grid or pack CellRef | `edit.cities.inspectMove` | `edit.cities.move` | C / planned-registry | 直接登记既有 inspectMove / move |
| `culture:assign` | `cultures.assignCells` | culture ref + grid cell set | `cells.inspectAction:cultures.assignCells` | `edit.cultures.assignCells` | C / planned-registry | 旧文化归属笔刷保持可用 |
| `religion:assign` | `religions.assignCells` | religion ref + grid cell set | `cells.inspectAction:religions.assignCells` | `edit.religions.assignCells` | C / planned-registry | 旧宗教归属笔刷保持可用 |
| `culture:center` | `cultures.setCenter` | culture ref + pack CellRef | `edit.cultures.inspectExpansion` | `edit.cultures.applyExpansion` | C / planned-registry | 中心输入并入既有扩张预检与提交 |
| `religion:center` | `religions.setCenter` | religion ref + pack CellRef | `edit.religions.inspectExpansion` | `edit.religions.applyExpansion` | C / planned-registry | 中心输入并入既有扩张预检与提交 |
| `biome:assign` | `biomes.assignCells` | biome ref + grid cell set | `cells.inspectAction:biomes.assignCells` | `edit.biomes.assignCells` | C / planned-registry | 旧生物群系归属笔刷保持可用 |
| `biome:suitability` | `biomes.applySuitability` | grid cell set + changes | `edit.biomes.inspectSuitability` | `edit.biomes.applySuitability` | C / planned-registry | 直接登记既有适居度 inspector |
| `economy:market-assign` | `economy.assignMarketCells` | market ref + pack cell set | `edit.economy.inspectAssignment` | `edit.economy.assignCells` | C / planned-registry | 直接登记既有市场归属 inspector |
| `measurement:draw` | `measurements.savePath` | world point path | `cells.inspectAction:measurements.savePath` | `edit.measurements.save` | C / planned-registry | 既有测量草稿、保存和导入格式保持兼容 |
| `marker:add` | `markers.createAtCell` | pack CellRef + marker options | `cells.inspectAction:markers.createAtCell` | `edit.markers.add` | C / planned-registry | 旧标记创建入口保持可用 |
| `marker:move` | `markers.move` | marker ref + pack CellRef | `cells.inspectAction:markers.move` | `edit.markers.move` | C / planned-registry | 旧标记移动入口保持可用 |
| `route:draw` | `routes.createPath` | pack-cell path or endpoint pair | `cells.inspectAction:routes.createPath` | `edit.routes.create` | C / planned-registry | 旧路线创建入口保持可用 |
| `route:edit-waypoint` | `routes.editWaypoint` | route ref + pack CellRef | `edit.routes.inspectEdit` | `edit.routes.update` | C / planned-registry | 直接登记既有路线编辑 inspector |
| `river:add` | `rivers.createAtCell` | source pack CellRef | `cells.inspectAction:rivers.createAtCell` | `edit.rivers.create` | C / planned-registry | 旧河流创建入口保持可用 |
| `lake:excavate` | `lakes.excavateAtCell` | pack CellRef + radius | `cells.inspectAction:lakes.excavateAtCell` | `edit.lakes.create` | C / planned-registry | 旧湖泊开挖入口保持可用 |
| `feature:patch-select` | `features.applyPatch` | pack CellRef + radius + patch mode | `edit.features.inspectPatch` | `edit.features.applyPatch` | C / planned-registry | 直接登记既有 Feature 补丁 inspector |
| `feature:topology-select` | `features.applyTopology` | grid cell set + topology operation | `edit.features.inspectTopology` | `edit.features.applyTopology` | C / planned-registry | 直接登记既有 Feature 拓扑 inspector |
| `zone:add` | `zones.createAtCell` | center pack CellRef + radius | `cells.inspectAction:zones.createAtCell` | `edit.zones.create` | C / planned-registry | 旧地区创建入口保持可用 |
| `note:add` | `notes.createAtCell` | pack CellRef or world point | `cells.inspectAction:notes.createAtCell` | `edit.notes.createStandalone` | C / planned-registry | 旧独立备注创建入口与存档字段保持兼容 |
| `DM-01` | `selection.selectAtPoint` | client or world point | `selection.pick` | `selection.select` | P0 / existing-api | 复用第 200 项 selection，不新增 Cell 写入口 |
| `DM-02` | `camera.panMiddlePointer` | client pointer delta | `excluded:camera-control` | `excluded:camera-control` | excluded / excluded | 相机平移不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-03` | `camera.panRightPointer` | client pointer delta | `excluded:camera-control` | `excluded:camera-control` | excluded / excluded | 相机平移不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-04` | `camera.panTouchPointer` | client pointer delta | `excluded:camera-control` | `excluded:camera-control` | excluded / excluded | 相机平移不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-05` | `camera.zoomAtPoint` | client point + wheel delta | `excluded:camera-control` | `excluded:camera-control` | excluded / excluded | 相机缩放不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-06` | `browser.suppressCanvasContextMenu` | browser contextmenu event | `excluded:browser-shell` | `excluded:browser-shell` | excluded / excluded | 浏览器默认事件抑制不是地图能力；沿用第 200 项排除理由 |
| `DM-07` | `browser.suppressCanvasAuxClick` | browser auxclick event | `excluded:browser-shell` | `excluded:browser-shell` | excluded / excluded | 浏览器默认事件抑制不是地图能力；沿用第 200 项排除理由 |
| `DM-08` | `labels.placeCustom` | world point + label options | `cells.inspectAction:labels.placeCustom` | `edit.labels.addCustom + edit.labels.moveCustom` | C / planned-registry | 旧手工标签创建与拖动交互保持可用 |
| `DM-09` | `labels.moveCustom` | label ref + world point | `cells.inspectAction:labels.moveCustom` | `edit.labels.moveCustom` | C / planned-registry | 直接登记既有 moveCustom |
| `DM-10` | `measurements.movePoint` | measurement ref + point index + world point | `cells.inspectAction:measurements.movePoint` | `edit.measurements.updatePoints` | C / planned-registry | 直接登记既有 updatePoints |
| `DM-11` | `measurements.deletePointByPointer` | measurement ref + point index | `cells.inspectAction:measurements.deletePointByPointer` | `edit.measurements.updatePoints` | C / planned-registry | 指针删除仍委托 updatePoints |
| `DM-12` | `measurements.deletePointByKeyboard` | measurement ref + point index | `cells.inspectAction:measurements.deletePointByKeyboard` | `edit.measurements.updatePoints` | C / planned-registry | 键盘删除仍委托 updatePoints |
| `DM-13` | `measurements.updatePath` | measurement ref + world point path | `cells.inspectAction:measurements.updatePath` | `edit.measurements.updatePoints` | C / planned-registry | 直接登记既有 updatePoints |
| `DM-14` | `ui.dragPanel` | client pointer delta | `excluded:ui-shell` | `excluded:ui-shell` | excluded / excluded | 面板位置不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-15` | `ui.dragActionDock` | client pointer delta | `excluded:ui-shell` | `excluded:ui-shell` | excluded / excluded | 动作坞位置不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-16` | `ui.dragExportOverlay` | client pointer delta | `excluded:ui-shell` | `excluded:ui-shell` | excluded / excluded | 导出浮层位置不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-17` | `ui.dragTreeOverlay` | client pointer delta | `excluded:ui-shell` | `excluded:ui-shell` | excluded / excluded | 树状浮层位置不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-18` | `ui.dragHeightWorkbench` | client pointer delta | `excluded:ui-shell` | `excluded:ui-shell` | excluded / excluded | 高度工作台位置不属于地图数据 API；沿用第 200 项排除理由 |
| `DM-19` | `ui.resizeObjectTableColumn` | client pointer delta + column id | `excluded:ui-shell` | `excluded:ui-shell` | excluded / excluded | 表格列宽不属于地图数据 API；沿用第 200 项排除理由 |

## Revision / Token 冻结契约

- Token 绑定：`mapIdentity`、`mapRevision`、`actionId`、`normalizedInputFingerprint`、`inspectorSchemaVersion`。
- 成功地图写入：mapRevision 恰好递增 1，并使旧 token 失效。
- 拒绝、取消、完整回滚：mapRevision 不变。
- 撤销 / 重做：每次成功撤销或重做均递增 1，并使旧 token 失效。
- 换图：创建新 mapIdentity；无论 revision 数值是否相同，旧 token 均失效。
- 异步提交：提交前复核 mapIdentity 与 mapRevision；陈旧任务不得写图。
