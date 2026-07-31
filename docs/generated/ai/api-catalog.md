# AI API 机器目录

> 由 `pnpm run sync:ai-docs` 生成，请勿手工修改。

## 浏览器 API（316）

| 方法 | 稳定性 | 副作用 | 确认 | AI 手册 |
|---|---|---|---|---|
| `info.version` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `info.capabilities` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `info.describe` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `info.mapSummary` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `info.runtimeStats` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `info.healthEvents` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `objects.types` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `objects.get` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `objects.list` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `objects.query` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.get` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.getAtPoint` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.neighbors` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.query` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.locate` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.scan` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.actions` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `cells.inspectAction` | stable | none-or-export-result | 否 | `docs/ai/map-data-model.md` |
| `planner.listRecipes` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `planner.getRecipe` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `analysis.defineRegion` | stable | map-or-persistent-state | 否 | `docs/ai/regional-analysis.md` |
| `analysis.describeRegion` | stable | none-or-export-result | 否 | `docs/ai/regional-analysis.md` |
| `analysis.compareRegions` | stable | map-or-persistent-state | 否 | `docs/ai/regional-analysis.md` |
| `analysis.explainPrecipitation` | stable | map-or-persistent-state | 否 | `docs/ai/regional-analysis.md` |
| `analysis.diagnosePopulation` | stable | map-or-persistent-state | 否 | `docs/ai/regional-analysis.md` |
| `analysis.comparePower` | stable | map-or-persistent-state | 否 | `docs/ai/regional-analysis.md` |
| `analysis.diagnoseTerrain` | stable | map-or-persistent-state | 否 | `docs/ai/regional-analysis.md` |
| `regenerationLocks.list` | stable | none-or-export-result | 否 | `docs/ai/safe-change-boundaries.md` |
| `regenerationLocks.status` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `regenerationLocks.inspect` | stable | none-or-export-result | 否 | `docs/ai/safe-change-boundaries.md` |
| `regenerationLocks.set` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `regenerationLocks.setMany` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `regenerationLocks.clearKind` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `generate.getOptions` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `generate.setOptions` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `generate.newMap` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `generate.rerollSeed` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `generate.regenerate` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `oceanCurrents.rename` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `oceanCurrents.regenerate` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `oceanCurrents.inspectWorldRebuild` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `oceanCurrents.rebuildWorld` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `oceanCurrents.cancelWorldRebuild` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.get` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.resolve` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.select` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.clear` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.locate` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.pick` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.flash` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.highlight` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.clearHighlights` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.startEditing` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.stopEditing` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `selection.toggleEditing` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.get` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.listThemes` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setViewMode` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setVisible` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setTheme` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.exportTheme` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.importTheme` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.createTheme` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.updateTheme` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.deleteTheme` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.fitView` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setShowOceanHeight` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setSmoothCellBorders` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setShowHoverInfo` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `layers.setMaxCityLabels` | stable | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.get` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `units.apply` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setDistanceUnit` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setAreaUnit` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setNumberAbbreviation` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setMapScale` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setPopulationScale` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setMilitaryScale` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `units.setPrecipitationScale` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.get` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.getOptions` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.getTemperature` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.getPrecipitation` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.getLatitude` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.getAtmosphere` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.getBiomes` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.apply` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.setLatitude` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.setLatitudeRange` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.setLongitudeRange` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.setTemperature` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.setPrecipitation` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.setWind` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.inspectDownstreamRebuild` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `climate.applyDownstreamRebuild` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `history.get` | stable | none-or-export-result | 否 | `docs/ai/safe-change-boundaries.md` |
| `history.stats` | stable | none-or-export-result | 否 | `docs/ai/safe-change-boundaries.md` |
| `history.peek` | stable | none-or-export-result | 否 | `docs/ai/safe-change-boundaries.md` |
| `history.undo` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `history.redo` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.notes.createStandalone` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.notes.set` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.notes.delete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.notes.import` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.notes.deleteBatch` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.measurements.save` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.measurements.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.measurements.updatePoints` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.measurements.delete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.measurements.import` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.add` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.inspectCreateAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.createAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.inspectMove` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.move` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.setPopulation` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.inspectOwnerSync` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.syncOwner` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.setVisual` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cities.resetVisual` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.add` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectCreateAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.createAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectEnsureAssignment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.ensureAssignment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectTransfer` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.transfer` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectMerge` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.merge` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectSplit` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.split` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.inspectCapitalReassessment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.reassessCapitals` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.setColor` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.provinces.applyChanges` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.add` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.inspectCreateAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.createAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.inspectMerge` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.merge` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.inspectSplit` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.split` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.inspectTerritoryTransfer` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.transferTerritory` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.setColor` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.setGovernment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.inspectCapitalChange` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.setCapital` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.setGovernmentBatch` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.states.applyChanges` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectChanges` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applyChanges` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectGlobalTransform` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applyGlobalTransform` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectTerrainTemplate` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applyTerrainTemplate` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectTerrainProgram` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applyTerrainProgram` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectRangeTransform` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applyRangeTransform` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectSelectionSmoothing` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applySelectionSmoothing` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectSeafloorReset` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applySeafloorReset` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.rebuildBaseDerived` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.rebuildDownstreamDerived` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.rebuildAllDerived` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.biomes.inspectAssignment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.biomes.assignCells` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.biomes.inspectSuitability` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.biomes.applySuitability` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.population.inspectAdjustment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.population.applyAdjustment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.population.inspectTransfer` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.population.transfer` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.inspectRelation` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.setRelation` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.inspectDeclareWar` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.declareWar` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.inspectPeace` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.makePeace` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.inspectOverlordChange` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.diplomacy.changeOverlord` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.economy.inspectAssignment` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.economy.assignCells` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.economy.rebuild` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.economy.setGoodDisplay` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.economy.setMarketDisplay` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.inspectRatios` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.setRatios` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.inspectStatus` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.setStatus` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.setStatusBatch` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.inspectMoveStation` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.moveStation` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.inspectBase` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.setBase` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.inspectBattle` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.resolveBattle` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.recordBattleEvent` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.importBattleEvents` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.clearBattleEvents` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.military.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.inspectCreate` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.create` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.delete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.setStyle` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.setContext` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.setProperties` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.zones.getEffectsAtCell` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.inspectLifecycle` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.add` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.assignCells` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.inspectExpansion` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.applyExpansion` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.setColor` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.cultures.setParent` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.inspectLifecycle` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.add` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.assignCells` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.inspectExpansion` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.applyExpansion` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.setColor` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.religions.setParent` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.routes.create` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.routes.inspectEdit` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.routes.update` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.routes.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.routes.delete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.routes.setNote` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.inspectCreate` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.create` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.setWidthFactor` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.rivers.setNote` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.inspectCreate` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.create` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.inspectOutlet` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.setOutlet` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.inspectDelete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.delete` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.lakes.rename` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.features.inspectPatch` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.features.applyPatch` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.features.inspectTopology` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.features.applyTopology` | stable | map-or-persistent-state | 是 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.getStyles` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.setStyle` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.resetStyle` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.resetStyles` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.setLayout` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.setPositionLock` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.addCustom` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.delete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.moveCustom` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.renameCustom` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.setNote` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.labels.restore` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.markers.add` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.markers.delete` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.markers.move` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.markers.setNote` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `edit.markers.setVisual` | stable | map-or-persistent-state | 否 | `docs/ai/safe-change-boundaries.md` |
| `data.exportAll` | deprecated | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportMap` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportGEO` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportFeatureGEO` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportCompressedAll` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportPNG` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportHeightmapPNG` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportNotes` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportMeasurements` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.exportImportDiagnostic` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.saveBrowserMap` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `data.restoreBrowserMap` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `data.inspectCollectionImport` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `data.importMap` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `data.importGEO` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `data.importHeightmap` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `namebases.list` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.export` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.import` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.create` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.copyBuiltin` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.update` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.delete` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `namebases.clear` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `namebases.bind` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.renameObjects` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `namebases.inspectBindAndRename` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.bindAndRename` | stable | map-or-persistent-state | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.inspectReplacement` | stable | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `namebases.replace` | stable | map-or-persistent-state | 是 | `docs/ai/runtime-and-loading.md` |
| `debug.enable` | experimental | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `debug.disable` | experimental | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |
| `debug.snapshot` | experimental | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `debug.dumpState` | experimental | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `debug.renderer` | experimental | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `debug.health` | experimental | none-or-export-result | 否 | `docs/ai/runtime-and-loading.md` |
| `debug.profileNextRender` | experimental | runtime-or-ui-state | 否 | `docs/ai/runtime-and-loading.md` |

## 无头只读 API（23）

| 方法 | AI 手册 |
|---|---|
| `info.mapSummary` | `docs/ai/runtime-and-loading.md` |
| `info.document` | `docs/ai/runtime-and-loading.md` |
| `objects.types` | `docs/ai/map-data-model.md` |
| `objects.get` | `docs/ai/map-data-model.md` |
| `objects.list` | `docs/ai/map-data-model.md` |
| `objects.query` | `docs/ai/map-data-model.md` |
| `cells.get` | `docs/ai/map-data-model.md` |
| `cells.getAtPoint` | `docs/ai/map-data-model.md` |
| `cells.neighbors` | `docs/ai/map-data-model.md` |
| `cells.query` | `docs/ai/map-data-model.md` |
| `cells.scan` | `docs/ai/map-data-model.md` |
| `climate.get` | `docs/ai/runtime-and-loading.md` |
| `terrain.get` | `docs/ai/map-data-model.md` |
| `population.get` | `docs/ai/map-data-model.md` |
| `planner.listRecipes` | `docs/ai/runtime-and-loading.md` |
| `planner.getRecipe` | `docs/ai/runtime-and-loading.md` |
| `analysis.defineRegion` | `docs/ai/regional-analysis.md` |
| `analysis.describeRegion` | `docs/ai/regional-analysis.md` |
| `analysis.compareRegions` | `docs/ai/regional-analysis.md` |
| `analysis.explainPrecipitation` | `docs/ai/regional-analysis.md` |
| `analysis.diagnosePopulation` | `docs/ai/regional-analysis.md` |
| `analysis.comparePower` | `docs/ai/regional-analysis.md` |
| `analysis.diagnoseTerrain` | `docs/ai/regional-analysis.md` |

## 无头写入 API（6）

| 方法 | 副作用 | 必需授权字段 | AI 手册 |
|---|---|---|---|
| `edit.population.inspectAdjustment` | none | 无 | `docs/ai/safe-change-boundaries.md` |
| `edit.population.applyAdjustment` | map-document-copy | documentId / expectedRevision / inspectionToken / requestId | `docs/ai/safe-change-boundaries.md` |
| `edit.height.inspectSelectionSmoothing` | none | 无 | `docs/ai/safe-change-boundaries.md` |
| `edit.height.applySelectionSmoothing` | map-document-copy | documentId / expectedRevision / inspectionToken / requestId | `docs/ai/safe-change-boundaries.md` |
| `edit.objects.inspectRename` | none | 无 | `docs/ai/safe-change-boundaries.md` |
| `edit.objects.applyRename` | map-document-copy | documentId / expectedRevision / inspectionToken / requestId | `docs/ai/safe-change-boundaries.md` |

## Planner 配方（10）

- `scenario.colonize-region`：殖民或开拓区域（5 步）
- `scenario.invasion-and-annexation`：入侵、占领与吞并国家（5 步）
- `scenario.administrative-reform`：行政区划改革（5 步）
- `scenario.population-resettlement`：人口迁徙与新城建设（5 步）
- `scenario.cultural-assimilation`：文化或宗教传播与同化（3 步）
- `scenario.infrastructure-development`：区域基础设施与经济开发（4 步）
- `scenario.coastline-engineering`：海岸、海峡与湖海工程（4 步）
- `scenario.climate-disaster`：气候灾变及世界响应（4 步）
- `scenario.state-reformation`：国家改制与迁都（4 步）
- `scenario.publish-map`：检查、整理并发布地图（4 步）
