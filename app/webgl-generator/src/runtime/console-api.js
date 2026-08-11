import {readControlPreferences, updateControlPreferences} from "../ui/panel.js";
import {DEFAULT_MAX_CITY_LABELS} from "./display-defaults.js";
import {areaUnitForDistanceUnit, formatArea as formatDisplayArea, formatDistance as formatDisplayDistance, normalizeUnitPreferences, precipitationUnitsToMillimeters} from "../ui/display-units.js";
import {createCanvasPngBlob, createCompressedMapDocumentBlob, createHeightmapPngBlob, createMapDocument, createMapFeatureGeoJson, createMapGeoJson, downloadCanvasPng, downloadCompressedMapDocument, downloadHeightmapPng, downloadText, mapFileBaseName, stringifyMapDocument} from "./map-file-io.js";
import {createMapArchiveFilename} from "./map-filename.js";
import {apiCall} from "./api-result.js";
import {NAMEBASE_BINDING_TARGETS, createLegacyNamebaseText, createNamebaseDocument, getNamebaseBindingStatus, getNamebaseSummariesForMap} from "../generator/namebase-store.js";
import {listBiomeDescriptors} from "../generator/biome-registry.js";
import {measurementArea, measurementDisplayPoints, measurementDistance} from "./measurement-objects.js";
import {MEASUREMENT_ROUTE_FIT_ROADS, normalizeMeasurementRouteFit} from "./measurement-route-fit.js";
import {OBJECT_KIND_LABEL} from "./object-kinds.js";
import {resolveObject} from "./object-resolver.js";
import {buildHistoryPeek} from "./history-peek.js";
import {withRiverWaypointPreviewSuppressed} from "./river-waypoint-session.js";
import {buildApiMethodCoverage} from "./api-capability-coverage.js";
import {API_METHODS, API_STABILITY, API_VERSION, CONFIRM_REQUIRED_METHODS, buildApiContract, buildApiVersionContract, groupQualifiedMethodNames} from "./api-contract.js";
import {buildApiDescriptionCoverage, buildApiMethodDescriptionRegistry, describeApiMethod} from "./api-schema-registry.js";
import {getObjectSnapshot, listObjectSnapshots, listObjectTypes, queryObjectSnapshots} from "./object-query-api.js";
import {getCellAtPoint, getCellNeighbors, getCellSnapshot, queryCells, scanCells} from "./cell-query-api.js";
import {inspectCellAction, listCellActions} from "./cell-action-inspector-registry.js";
import {getGridStructureSnapshot, getGridStructureSummary} from "./grid-topology-api.js";
import {getPlannerRecipe, listPlannerRecipes} from "./planner-recipe-registry.js";
import {buildMapSummary as buildSharedMapSummary} from "./read-only-map-core.js";
import {compareAnalysisRegions, compareRegionPower, defineAnalysisRegion, describeAnalysisRegion, diagnoseRegionPopulation, diagnoseRegionTerrain, explainRegionPrecipitation} from "./map-analysis-api.js";

export function installConsoleApi(documentRef, state, options = {}) {
  const view = documentRef.defaultView || window;
  const api = createConsoleApi(documentRef, state, options.actions || {});
  view.webglGeneratorApi = api;
  if (!view.api) view.api = api;
  return api;
}

export function createConsoleApi(documentRef, state, actions = {}) {
  const methodMetadata = buildApiContract(API_METHODS, buildMethodMetadata()).methodMetadata;
  let methodDescriptions = null;
  const api = {
    version: API_VERSION,
    stability: API_STABILITY,
    info: Object.freeze({
      version: () => apiCall(() => buildApiVersion()),
      capabilities: () => apiCall(() => buildCapabilities(api)),
      describe: method => apiCall(() => describeApiMethod(methodDescriptions, method)),
      mapSummary: () => apiCall(() => buildMapSummary(state)),
      runtimeStats: () => apiCall(() => buildRuntimeStats(state, documentRef)),
      healthEvents: (options = {}) => apiCall(() => buildHealthEventsSnapshot(state, options))
    }),
    objects: Object.freeze({
      types: () => apiCall(() => listObjectTypes()),
      get: reference => apiCall(() => getObjectSnapshot(state.map, reference)),
      list: (type, options = {}) => apiCall(() => listObjectSnapshots(state.map, type, options)),
      query: (query = {}, options = {}) => apiCall(() => queryObjectSnapshots(state.map, query, options))
    }),
    cells: Object.freeze({
      get: (reference, options = {}) => apiCall(
        () => getCellSnapshot(state.map, reference, options),
        cellReadonlyApiMetadata(state, "cells.get")
      ),
      getAtPoint: (point, options = {}) => apiCall(() => getCellAtPoint(state.map, point, options, {
        screenToWorld: (x, y) => state.renderer?.screenToWorld?.(x, y)
      }), cellReadonlyApiMetadata(state, "cells.getAtPoint")),
      neighbors: (reference, options = {}) => apiCall(
        () => getCellNeighbors(state.map, reference, options),
        cellReadonlyApiMetadata(state, "cells.neighbors")
      ),
      query: (query = {}) => apiCall(
        () => queryCells(state.map, query, state.mapRevision),
        cellReadonlyApiMetadata(state, "cells.query")
      ),
      locate: (reference, options = {}) => apiCall(
        () => locateCellViaApi(state, actions, reference, options),
        cellReadonlyApiMetadata(state, "cells.locate")
      ),
      scan: (query = {}) => apiCall(
        () => scanCells(state.map, query, state.mapRevision, {
          viewportBounds: state.renderer?.getViewportWorldBounds?.(),
          signal: query?.signal
        }),
        cellReadonlyApiMetadata(state, "cells.scan")
      ),
      actions: () => apiCall(() => listCellActions(), cellReadonlyApiMetadata(state, "cells.actions")),
      inspectAction: (actionId, actionInput, options = {}) => apiCall(
        () => inspectCellAction(state.map, state.mapRevision, actionId, actionInput, options, {
          delegate: (action, normalizedInput, inspectOptions) => delegateCellActionInspection(actions, action, normalizedInput, inspectOptions)
        }),
        cellReadonlyApiMetadata(state, "cells.inspectAction")
      )
    }),
    grid: Object.freeze({
      summary: () => apiCall(() => getGridStructureSummary(state.map, state.mapRevision)),
      snapshot: () => apiCall(() => getGridStructureSnapshot(state.map, state.mapRevision)),
      inspectWrite: document => apiCall(() => requireApiAction(actions.grid?.inspectWrite, "grid.inspectWrite")(document)),
      applyWrite: (document, options = {}) => apiCall(() => requireApiAction(actions.grid?.applyWrite, "grid.applyWrite")(document, options)),
      inspectRefinement: (options = {}) => apiCall(() => requireApiAction(actions.grid?.inspectRefinement, "grid.inspectRefinement")(options)),
      refine: (options = {}) => apiCall(() => requireApiAction(actions.grid?.refine, "grid.refine")(options))
    }),
    planner: Object.freeze({
      listRecipes: () => apiCall(() => listPlannerRecipes()),
      getRecipe: recipeId => apiCall(() => getPlannerRecipe(recipeId))
    }),
    analysis: Object.freeze({
      defineRegion: specification => apiCall(() => defineAnalysisRegion(state.map, specification)),
      describeRegion: (specification, options = {}) => apiCall(() => describeAnalysisRegion(state.map, specification, options)),
      compareRegions: (left, right, options = {}) => apiCall(() => compareAnalysisRegions(state.map, left, right, options)),
      explainPrecipitation: (specification, options = {}) => apiCall(() => explainRegionPrecipitation(state.map, specification, options)),
      diagnosePopulation: (specification, options = {}) => apiCall(() => diagnoseRegionPopulation(state.map, specification, options)),
      comparePower: (left, right, options = {}) => apiCall(() => compareRegionPower(state.map, left, right, options)),
      diagnoseTerrain: (specification, options = {}) => apiCall(() => diagnoseRegionTerrain(state.map, specification, options))
    }),
    regenerationLocks: Object.freeze({
      list: (options = {}) => apiCall(() => requireApiAction(actions.regenerationLocks?.list, "regenerationLocks.list")(options)),
      status: reference => apiCall(() => requireApiAction(actions.regenerationLocks?.status, "regenerationLocks.status")(reference)),
      inspect: (references, locked) => apiCall(() => requireApiAction(actions.regenerationLocks?.inspect, "regenerationLocks.inspect")(references, locked)),
      set: (reference, locked, options = {}) => apiCall(() => requireApiAction(actions.regenerationLocks?.set, "regenerationLocks.set")(reference, locked, options)),
      setMany: (references, locked, options = {}) => apiCall(() => requireApiAction(actions.regenerationLocks?.setMany, "regenerationLocks.setMany")(references, locked, options)),
      clearKind: (kind, options = {}) => apiCall(() => requireApiAction(actions.regenerationLocks?.clearKind, "regenerationLocks.clearKind")(kind, options))
    }),
    generate: Object.freeze({
      getOptions: () => apiCall(() => requireApiAction(actions.generate?.getOptions, "generate.getOptions")()),
      setOptions: (patch = {}) => apiCall(() => requireApiAction(actions.generate?.setOptions, "generate.setOptions")(patch)),
      newMap: (options = {}) => apiCall(() => requireApiAction(actions.generate?.newMap, "generate.newMap")(options)),
      rerollSeed: (options = {}) => apiCall(() => requireApiAction(actions.generate?.rerollSeed, "generate.rerollSeed")(options)),
      regenerate: (kind, options = {}) => apiCall(() => requireApiAction(actions.generate?.regenerate, "generate.regenerate")(kind, options))
    }),
    oceanCurrents: Object.freeze({
      rename: (currentId, name) => apiCall(() => requireApiAction(actions.oceanCurrents?.rename, "oceanCurrents.rename")(currentId, name)),
      regenerate: (options = {}) => apiCall(() => requireApiAction(actions.oceanCurrents?.regenerate, "oceanCurrents.regenerate")(normalizePublicOptions(options, ["seed"], "洋流重生成"))),
      inspectWorldRebuild: (options = {}) => apiCall(() => requireApiAction(actions.oceanCurrents?.inspectWorldRebuild, "oceanCurrents.inspectWorldRebuild")(normalizePublicOptions(options, ["seed"], "洋流世界重算预检"))),
      rebuildWorld: (options = {}) => apiCall(() => requireApiAction(actions.oceanCurrents?.rebuildWorld, "oceanCurrents.rebuildWorld")(normalizePublicOptions(options, ["confirm", "seed"], "洋流世界重算"))),
      cancelWorldRebuild: () => apiCall(() => requireApiAction(actions.oceanCurrents?.cancelWorldRebuild, "oceanCurrents.cancelWorldRebuild")())
    }),
    selection: Object.freeze({
      get: () => apiCall(() => buildSelectionSnapshot(state)),
      resolve: object => apiCall(() => requireApiAction(actions.selection?.resolve, "selection.resolve")(object)),
      select: object => apiCall(() => requireApiAction(actions.selection?.select, "selection.select")(object)),
      clear: () => apiCall(() => requireApiAction(actions.selection?.clear, "selection.clear")()),
      locate: (object, options = {}) => apiCall(() => requireApiAction(actions.selection?.locate, "selection.locate")(object, options)),
      pick: (clientX, clientY) => apiCall(() => requireApiAction(actions.selection?.pick, "selection.pick")(clientX, clientY)),
      flash: object => apiCall(() => requireApiAction(actions.selection?.flash, "selection.flash")(object)),
      highlight: (objects, options = {}) => apiCall(() => requireApiAction(actions.selection?.highlight, "selection.highlight")(objects, options)),
      clearHighlights: () => apiCall(() => requireApiAction(actions.selection?.clearHighlights, "selection.clearHighlights")()),
      startEditing: (object, options = {}) => apiCall(() => requireApiAction(actions.selection?.startEditing, "selection.startEditing")(object, options)),
      stopEditing: (options = {}) => apiCall(() => requireApiAction(actions.selection?.stopEditing, "selection.stopEditing")(options)),
      toggleEditing: (object, options = {}) => apiCall(() => requireApiAction(actions.selection?.toggleEditing, "selection.toggleEditing")(object, options))
    }),
    layers: Object.freeze({
      get: () => apiCall(() => buildLayerSnapshot(state, documentRef)),
      listThemes: () => apiCall(() => requireApiAction(actions.layers?.listThemes, "layers.listThemes")()),
      setViewMode: mode => apiCall(() => requireApiAction(actions.layers?.setViewMode, "layers.setViewMode")(mode)),
      setVisible: (layer, visible) => apiCall(() => requireApiAction(actions.layers?.setVisible, "layers.setVisible")(layer, visible)),
      setTheme: themeId => apiCall(() => requireApiAction(actions.layers?.setTheme, "layers.setTheme")(themeId)),
      exportTheme: (themeId, options = {}) => apiCall(() => requireApiAction(actions.layers?.exportTheme, "layers.exportTheme")(themeId, options)),
      importTheme: (document, options = {}) => apiCall(() => requireApiAction(actions.layers?.importTheme, "layers.importTheme")(document, options)),
      createTheme: (options = {}) => apiCall(() => requireApiAction(actions.layers?.createTheme, "layers.createTheme")(options)),
      updateTheme: (themeId, colors = {}) => apiCall(() => requireApiAction(actions.layers?.updateTheme, "layers.updateTheme")(themeId, colors)),
      deleteTheme: themeId => apiCall(() => requireApiAction(actions.layers?.deleteTheme, "layers.deleteTheme")(themeId)),
      fitView: () => apiCall(() => requireApiAction(actions.layers?.fitView, "layers.fitView")()),
      setShowOceanHeight: visible => apiCall(() => requireApiAction(actions.layers?.setShowOceanHeight, "layers.setShowOceanHeight")(visible)),
      setSmoothCellBorders: enabled => apiCall(() => requireApiAction(actions.layers?.setSmoothCellBorders, "layers.setSmoothCellBorders")(enabled)),
      setShowHoverInfo: visible => apiCall(() => requireApiAction(actions.layers?.setShowHoverInfo, "layers.setShowHoverInfo")(visible)),
      setMaxCityLabels: limit => apiCall(() => requireApiAction(actions.layers?.setMaxCityLabels, "layers.setMaxCityLabels")(limit))
    }),
    units: Object.freeze({
      get: () => apiCall(() => buildUnitSnapshot(state, documentRef)),
      apply: (preferences = {}) => apiCall(() => applyUnitPreferences(state, documentRef, preferences)),
      setDistanceUnit: unit => apiCall(() => applyUnitPreferences(state, documentRef, {distanceUnit: unit})),
      setAreaUnit: unit => apiCall(() => setAreaUnitPreference(state, documentRef, unit)),
      setNumberAbbreviation: mode => apiCall(() => applyUnitPreferences(state, documentRef, {numberAbbreviation: mode})),
      setMapScale: kmPerCm => apiCall(() => applyUnitPreferences(state, documentRef, {mapScaleKmPerCm: kmPerCm})),
      setPopulationScale: scale => apiCall(() => applyUnitPreferences(state, documentRef, {populationScale: scale})),
      setMilitaryScale: scale => apiCall(() => applyUnitPreferences(state, documentRef, {militaryScale: scale})),
      setPrecipitationScale: scale => apiCall(() => applyUnitPreferences(state, documentRef, {precipitationScale: scale}))
    }),
    climate: Object.freeze({
      get: section => apiCall(() => buildClimateSnapshot(state, section)),
      getOptions: () => apiCall(() => buildClimateOptionsSnapshot(state)),
      getTemperature: () => apiCall(() => buildClimateTemperatureSnapshot(state)),
      getPrecipitation: () => apiCall(() => buildClimatePrecipitationSnapshot(state)),
      getLatitude: () => apiCall(() => buildClimateLatitudeSnapshot(state)),
      getAtmosphere: () => apiCall(() => buildClimateAtmosphereSnapshot(state)),
      getBiomes: () => apiCall(() => buildClimateBiomeSnapshot(state)),
      apply: (patch = {}, options = {}) => apiCall(() => requireApiAction(actions.climate?.apply, "climate.apply")(patch, options)),
      setLatitude: (value, options = {}) => apiCall(() => requireApiAction(actions.climate?.setLatitude, "climate.setLatitude")(value, options)),
      setLatitudeRange: (percent, options = {}) => apiCall(() => requireApiAction(actions.climate?.setLatitudeRange, "climate.setLatitudeRange")(percent, options)),
      setLongitudeRange: (percent, options = {}) => apiCall(() => requireApiAction(actions.climate?.setLongitudeRange, "climate.setLongitudeRange")(percent, options)),
      setTemperature: (patch, options = {}) => apiCall(() => requireApiAction(actions.climate?.setTemperature, "climate.setTemperature")(patch, options)),
      setPrecipitation: (scale, options = {}) => apiCall(() => requireApiAction(actions.climate?.setPrecipitation, "climate.setPrecipitation")(scale, options)),
      setWind: (index, direction, options = {}) => apiCall(() => requireApiAction(actions.climate?.setWind, "climate.setWind")(index, direction, options)),
      inspectDownstreamRebuild: (options = {}) => apiCall(() => requireApiAction(actions.climate?.inspectDownstreamRebuild, "climate.inspectDownstreamRebuild")(options)),
      applyDownstreamRebuild: (options = {}) => apiCall(() => requireApiAction(actions.climate?.applyDownstreamRebuild, "climate.applyDownstreamRebuild")(options))
    }),
    history: Object.freeze({
      get: (options = {}) => apiCall(() => buildHistoryStats(state, actions, options)),
      stats: (options = {}) => apiCall(() => buildHistoryStats(state, actions, options)),
      peek: (options = {}) => apiCall(() => buildHistoryPeek(state, options)),
      undo: () => apiCall(() => requireApiAction(actions.history?.undo, "history.undo")()),
      redo: () => apiCall(() => requireApiAction(actions.history?.redo, "history.redo")())
    }),
    edit: Object.freeze({
      notes: Object.freeze({
        createStandalone: (options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.createStandalone, "edit.notes.createStandalone")(options)),
        set: (object, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.set, "edit.notes.set")(object, body, options)),
        delete: (noteId, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.delete, "edit.notes.delete")(noteId, options)),
        import: (document, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.import, "edit.notes.import")(document, options)),
        deleteBatch: (noteIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.deleteBatch, "edit.notes.deleteBatch")(noteIds, options))
      }),
      measurements: Object.freeze({
        save: (points, options = {}) => apiCall(() => requireApiAction(actions.edit?.measurements?.save, "edit.measurements.save")(points, options)),
        rename: (measurementId, name) => apiCall(() => requireApiAction(actions.edit?.measurements?.rename, "edit.measurements.rename")(measurementId, name)),
        updatePoints: (measurementId, points, options = {}) => apiCall(() => requireApiAction(actions.edit?.measurements?.updatePoints, "edit.measurements.updatePoints")(measurementId, points, options)),
        delete: measurementId => apiCall(() => requireApiAction(actions.edit?.measurements?.delete, "edit.measurements.delete")(measurementId)),
        import: (measurements, options = {}) => apiCall(() => requireApiAction(actions.edit?.measurements?.import, "edit.measurements.import")(measurements, options))
      }),
      cities: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.cities?.add, "edit.cities.add")(gridCell)),
        inspectCreateAtCell: request => apiCall(() => requireApiAction(actions.edit?.cities?.inspectCreateAtCell, "edit.cities.inspectCreateAtCell")(request)),
        createAtCell: request => apiCall(() => requireApiAction(actions.edit?.cities?.createAtCell, "edit.cities.createAtCell")(request)),
        inspectDelete: cityId => apiCall(() => requireApiAction(actions.edit?.cities?.inspectDelete, "edit.cities.inspectDelete")(cityId)),
        delete: (cityId, options = {}) => apiCall(() => requireApiAction(actions.edit?.cities?.delete, "edit.cities.delete")(cityId, options)),
        inspectMove: (cityId, target) => apiCall(() => requireApiAction(actions.edit?.cities?.inspectMove, "edit.cities.inspectMove")(cityId, target)),
        move: (cityId, target) => apiCall(() => requireApiAction(actions.edit?.cities?.move, "edit.cities.move")(cityId, target)),
        rename: (cityId, name) => apiCall(() => requireApiAction(actions.edit?.cities?.rename, "edit.cities.rename")(cityId, name)),
        setPopulation: (cityId, population) => apiCall(() => requireApiAction(actions.edit?.cities?.setPopulation, "edit.cities.setPopulation")(cityId, population)),
        inspectOwnerSync: cityId => apiCall(() => requireApiAction(actions.edit?.cities?.inspectOwnerSync, "edit.cities.inspectOwnerSync")(cityId)),
        syncOwner: (cityId, options = {}) => apiCall(() => requireApiAction(actions.edit?.cities?.syncOwner, "edit.cities.syncOwner")(cityId, options)),
        setVisual: (cityId, patch) => apiCall(() => requireApiAction(actions.edit?.cities?.setVisual, "edit.cities.setVisual")(cityId, patch)),
        resetVisual: cityId => apiCall(() => requireApiAction(actions.edit?.cities?.resetVisual, "edit.cities.resetVisual")(cityId))
      }),
      provinces: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.provinces?.add, "edit.provinces.add")(gridCell)),
        inspectCreateAtCell: request => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectCreateAtCell, "edit.provinces.inspectCreateAtCell")(request)),
        createAtCell: request => apiCall(() => requireApiAction(actions.edit?.provinces?.createAtCell, "edit.provinces.createAtCell")(request)),
        inspectDelete: provinceId => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectDelete, "edit.provinces.inspectDelete")(provinceId)),
        delete: (provinceId, options = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.delete, "edit.provinces.delete")(provinceId, options)),
        inspectEnsureAssignment: request => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectEnsureAssignment, "edit.provinces.inspectEnsureAssignment")(request)),
        ensureAssignment: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.ensureAssignment, "edit.provinces.ensureAssignment")(request, options)),
        inspectTransfer: request => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectTransfer, "edit.provinces.inspectTransfer")(request)),
        transfer: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.transfer, "edit.provinces.transfer")(request, options)),
        inspectMerge: request => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectMerge, "edit.provinces.inspectMerge")(request)),
        merge: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.merge, "edit.provinces.merge")(request, options)),
        inspectSplit: request => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectSplit, "edit.provinces.inspectSplit")(request)),
        split: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.split, "edit.provinces.split")(request, options)),
        inspectCapitalReassessment: (request = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.inspectCapitalReassessment, "edit.provinces.inspectCapitalReassessment")(request)),
        reassessCapitals: (request = {}, options = {}) => apiCall(() => requireApiAction(actions.edit?.provinces?.reassessCapitals, "edit.provinces.reassessCapitals")(request, options)),
        rename: (provinceId, name) => apiCall(() => requireApiAction(actions.edit?.provinces?.rename, "edit.provinces.rename")(provinceId, name)),
        setColor: (provinceId, color) => apiCall(() => requireApiAction(actions.edit?.provinces?.setColor, "edit.provinces.setColor")(provinceId, color)),
        applyChanges: changes => apiCall(() => requireApiAction(actions.edit?.provinces?.applyChanges, "edit.provinces.applyChanges")(changes))
      }),
      states: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.states?.add, "edit.states.add")(gridCell)),
        inspectCreateAtCell: request => apiCall(() => requireApiAction(actions.edit?.states?.inspectCreateAtCell, "edit.states.inspectCreateAtCell")(request)),
        createAtCell: request => apiCall(() => requireApiAction(actions.edit?.states?.createAtCell, "edit.states.createAtCell")(request)),
        inspectDelete: stateId => apiCall(() => requireApiAction(actions.edit?.states?.inspectDelete, "edit.states.inspectDelete")(stateId)),
        delete: (stateId, options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.delete, "edit.states.delete")(stateId, options)),
        inspectMerge: (options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.inspectMerge, "edit.states.inspectMerge")(options)),
        merge: (options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.merge, "edit.states.merge")(options)),
        inspectSplit: (options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.inspectSplit, "edit.states.inspectSplit")(options)),
        split: (options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.split, "edit.states.split")(options)),
        inspectTerritoryTransfer: request => apiCall(() => requireApiAction(actions.edit?.states?.inspectTerritoryTransfer, "edit.states.inspectTerritoryTransfer")(request)),
        transferTerritory: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.transferTerritory, "edit.states.transferTerritory")(request, options)),
        rename: (stateId, name) => apiCall(() => requireApiAction(actions.edit?.states?.rename, "edit.states.rename")(stateId, name)),
        setColor: (stateId, color) => apiCall(() => requireApiAction(actions.edit?.states?.setColor, "edit.states.setColor")(stateId, color)),
        setGovernment: (stateId, governmentKey, options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.setGovernment, "edit.states.setGovernment")(stateId, governmentKey, options)),
        inspectCapitalChange: (stateId, cityId) => apiCall(() => requireApiAction(actions.edit?.states?.inspectCapitalChange, "edit.states.inspectCapitalChange")(stateId, cityId)),
        setCapital: (stateId, cityId, options = {}) => apiCall(() => requireApiAction(actions.edit?.states?.setCapital, "edit.states.setCapital")(stateId, cityId, options)),
        setGovernmentBatch: (stateIds, governmentKey) => apiCall(() => requireApiAction(actions.edit?.states?.setGovernmentBatch, "edit.states.setGovernmentBatch")(stateIds, governmentKey)),
        applyChanges: changes => apiCall(() => requireApiAction(actions.edit?.states?.applyChanges, "edit.states.applyChanges")(changes))
      }),
      height: Object.freeze({
        inspectChanges: changes => apiCall(() => requireApiAction(actions.edit?.height?.inspectChanges, "edit.height.inspectChanges")(changes)),
        applyChanges: (changes, options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applyChanges, "edit.height.applyChanges")(changes, options)),
        inspectGlobalTransform: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.inspectGlobalTransform, "edit.height.inspectGlobalTransform")(normalizePublicHeightSemanticOptions(options))),
        applyGlobalTransform: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applyGlobalTransform, "edit.height.applyGlobalTransform")(normalizePublicHeightSemanticOptions(options))),
        inspectTerrainTemplate: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.inspectTerrainTemplate, "edit.height.inspectTerrainTemplate")(normalizePublicHeightSemanticOptions(options))),
        applyTerrainTemplate: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applyTerrainTemplate, "edit.height.applyTerrainTemplate")(normalizePublicHeightSemanticOptions(options))),
        inspectTerrainProgram: (program, options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.inspectTerrainProgram, "edit.height.inspectTerrainProgram")(program, normalizePublicHeightSemanticOptions(options))),
        applyTerrainProgram: (program, options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applyTerrainProgram, "edit.height.applyTerrainProgram")(program, normalizePublicHeightSemanticOptions(options))),
        inspectRangeTransform: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.inspectRangeTransform, "edit.height.inspectRangeTransform")(normalizePublicHeightSemanticOptions(options))),
        applyRangeTransform: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applyRangeTransform, "edit.height.applyRangeTransform")(normalizePublicHeightSemanticOptions(options))),
        inspectSelectionSmoothing: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.inspectSelectionSmoothing, "edit.height.inspectSelectionSmoothing")(normalizePublicHeightSemanticOptions(options))),
        applySelectionSmoothing: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applySelectionSmoothing, "edit.height.applySelectionSmoothing")(normalizePublicHeightSemanticOptions(options))),
        inspectSeafloorReset: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.inspectSeafloorReset, "edit.height.inspectSeafloorReset")(normalizePublicOptions(options, ["seed"], "海底重设预检"))),
        applySeafloorReset: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.applySeafloorReset, "edit.height.applySeafloorReset")(normalizePublicOptions(options, ["inspectionToken", "confirm", "seed", "worldSeed"], "海底重设"))),
        rebuildBaseDerived: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.rebuildBaseDerived, "edit.height.rebuildBaseDerived")(options)),
        rebuildDownstreamDerived: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.rebuildDownstreamDerived, "edit.height.rebuildDownstreamDerived")(options)),
        rebuildAllDerived: (options = {}) => apiCall(() => requireApiAction(actions.edit?.height?.rebuildAllDerived, "edit.height.rebuildAllDerived")(options))
      }),
      biomes: Object.freeze({
        inspectAssignment: (biomeId, gridCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.biomes?.inspectAssignment, "edit.biomes.inspectAssignment")(biomeId, gridCellIds, options)),
        assignCells: (biomeId, gridCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.biomes?.assignCells, "edit.biomes.assignCells")(biomeId, gridCellIds, options)),
        inspectSuitability: (gridCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.biomes?.inspectSuitability, "edit.biomes.inspectSuitability")(gridCellIds, options)),
        applySuitability: (gridCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.biomes?.applySuitability, "edit.biomes.applySuitability")(gridCellIds, options))
      }),
      population: Object.freeze({
        inspectAdjustment: (target, options = {}) => apiCall(() => requireApiAction(actions.edit?.population?.inspectAdjustment, "edit.population.inspectAdjustment")(target, options)),
        applyAdjustment: (target, options = {}) => apiCall(() => requireApiAction(actions.edit?.population?.applyAdjustment, "edit.population.applyAdjustment")(target, options)),
        inspectTransfer: (source, target, options = {}) => apiCall(() => requireApiAction(actions.edit?.population?.inspectTransfer, "edit.population.inspectTransfer")(source, target, options)),
        transfer: (source, target, options = {}) => apiCall(() => requireApiAction(actions.edit?.population?.transfer, "edit.population.transfer")(source, target, options))
      }),
      economy: Object.freeze({
        inspectAssignment: (marketId, packCellIds) => apiCall(() => requireApiAction(actions.edit?.economy?.inspectAssignment, "edit.economy.inspectAssignment")(marketId, packCellIds)),
        assignCells: (marketId, packCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.economy?.assignCells, "edit.economy.assignCells")(marketId, packCellIds, options)),
        rebuild: (options = {}) => apiCall(() => requireApiAction(actions.edit?.economy?.rebuild, "edit.economy.rebuild")(options)),
        setGoodDisplay: (goodId, patch = {}) => apiCall(() => requireApiAction(actions.edit?.economy?.setGoodDisplay, "edit.economy.setGoodDisplay")(goodId, patch)),
        setMarketDisplay: (marketId, patch = {}) => apiCall(() => requireApiAction(actions.edit?.economy?.setMarketDisplay, "edit.economy.setMarketDisplay")(marketId, patch))
      }),
      diplomacy: Object.freeze({
        inspectRelation: (subjectId, objectId, relation, options = {}) => apiCall(() => requireApiAction(actions.edit?.diplomacy?.inspectRelation, "edit.diplomacy.inspectRelation")(subjectId, objectId, relation, options)),
        setRelation: (subjectId, objectId, relation, options = {}) => apiCall(() => requireApiAction(actions.edit?.diplomacy?.setRelation, "edit.diplomacy.setRelation")(subjectId, objectId, relation, options)),
        inspectDeclareWar: request => apiCall(() => requireApiAction(actions.edit?.diplomacy?.inspectDeclareWar, "edit.diplomacy.inspectDeclareWar")(request)),
        declareWar: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.diplomacy?.declareWar, "edit.diplomacy.declareWar")(request, options)),
        inspectPeace: request => apiCall(() => requireApiAction(actions.edit?.diplomacy?.inspectPeace, "edit.diplomacy.inspectPeace")(request)),
        makePeace: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.diplomacy?.makePeace, "edit.diplomacy.makePeace")(request, options)),
        inspectOverlordChange: request => apiCall(() => requireApiAction(actions.edit?.diplomacy?.inspectOverlordChange, "edit.diplomacy.inspectOverlordChange")(request)),
        changeOverlord: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.diplomacy?.changeOverlord, "edit.diplomacy.changeOverlord")(request, options))
      }),
      military: Object.freeze({
        inspectRatios: (stateId, ratios) => apiCall(() => requireApiAction(actions.edit?.military?.inspectRatios, "edit.military.inspectRatios")(stateId, ratios)),
        setRatios: (stateId, ratios, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.setRatios, "edit.military.setRatios")(stateId, ratios, options)),
        inspectStatus: (targets, status) => apiCall(() => requireApiAction(actions.edit?.military?.inspectStatus, "edit.military.inspectStatus")(targets, status)),
        setStatus: (target, status, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.setStatus, "edit.military.setStatus")(target, status, options)),
        setStatusBatch: (targets, status, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.setStatusBatch, "edit.military.setStatusBatch")(targets, status, options)),
        inspectMoveStation: (target, destination) => apiCall(() => requireApiAction(actions.edit?.military?.inspectMoveStation, "edit.military.inspectMoveStation")(target, destination)),
        moveStation: (target, destination, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.moveStation, "edit.military.moveStation")(target, destination, options)),
        inspectBase: target => apiCall(() => requireApiAction(actions.edit?.military?.inspectBase, "edit.military.inspectBase")(target)),
        setBase: (target, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.setBase, "edit.military.setBase")(target, options)),
        inspectBattle: request => apiCall(() => requireApiAction(actions.edit?.military?.inspectBattle, "edit.military.inspectBattle")(request)),
        resolveBattle: (request, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.resolveBattle, "edit.military.resolveBattle")(request, options)),
        recordBattleEvent: (target, event = {}) => apiCall(() => requireApiAction(actions.edit?.military?.recordBattleEvent, "edit.military.recordBattleEvent")(target, event)),
        importBattleEvents: (document, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.importBattleEvents, "edit.military.importBattleEvents")(document, options)),
        clearBattleEvents: (target, options = {}) => apiCall(() => requireApiAction(actions.edit?.military?.clearBattleEvents, "edit.military.clearBattleEvents")(target, options)),
        rename: (target, name) => apiCall(() => requireApiAction(actions.edit?.military?.rename, "edit.military.rename")(target, name))
      }),
      zones: Object.freeze({
        inspectCreate: (options = {}) => apiCall(() => requireApiAction(actions.edit?.zones?.inspectCreate, "edit.zones.inspectCreate")(options)),
        create: (options = {}) => apiCall(() => requireApiAction(actions.edit?.zones?.create, "edit.zones.create")(options)),
        inspectDelete: zoneId => apiCall(() => requireApiAction(actions.edit?.zones?.inspectDelete, "edit.zones.inspectDelete")(zoneId)),
        delete: (zoneId, options = {}) => apiCall(() => requireApiAction(actions.edit?.zones?.delete, "edit.zones.delete")(zoneId, options)),
        setStyle: (zoneId, patch) => apiCall(() => requireApiAction(actions.edit?.zones?.setStyle, "edit.zones.setStyle")(zoneId, patch)),
        setContext: (zoneId, context) => apiCall(() => requireApiAction(actions.edit?.zones?.setContext, "edit.zones.setContext")(zoneId, context)),
        setProperties: (zoneId, patch) => apiCall(() => requireApiAction(actions.edit?.zones?.setProperties, "edit.zones.setProperties")(zoneId, patch)),
        getEffectsAtCell: packCell => apiCall(() => requireApiAction(actions.edit?.zones?.getEffectsAtCell, "edit.zones.getEffectsAtCell")(packCell))
      }),
      cultures: Object.freeze({
        inspectLifecycle: (operation, request = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.inspectLifecycle, "edit.cultures.inspectLifecycle")(operation, request)),
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.add, "edit.cultures.add")(options)),
        assignCells: (cultureId, gridCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.assignCells, "edit.cultures.assignCells")(cultureId, gridCellIds, options)),
        inspectExpansion: (cultureId, options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.inspectExpansion, "edit.cultures.inspectExpansion")(cultureId, options)),
        applyExpansion: (cultureId, options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.applyExpansion, "edit.cultures.applyExpansion")(cultureId, options)),
        delete: (cultureId, options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.delete, "edit.cultures.delete")(cultureId, options)),
        rename: (cultureId, name) => apiCall(() => requireApiAction(actions.edit?.cultures?.rename, "edit.cultures.rename")(cultureId, name)),
        setColor: (cultureId, color) => apiCall(() => requireApiAction(actions.edit?.cultures?.setColor, "edit.cultures.setColor")(cultureId, color)),
        setParent: (cultureId, parentId, options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.setParent, "edit.cultures.setParent")(cultureId, parentId, options))
      }),
      religions: Object.freeze({
        inspectLifecycle: (operation, request = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.inspectLifecycle, "edit.religions.inspectLifecycle")(operation, request)),
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.add, "edit.religions.add")(options)),
        assignCells: (religionId, gridCellIds, options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.assignCells, "edit.religions.assignCells")(religionId, gridCellIds, options)),
        inspectExpansion: (religionId, options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.inspectExpansion, "edit.religions.inspectExpansion")(religionId, options)),
        applyExpansion: (religionId, options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.applyExpansion, "edit.religions.applyExpansion")(religionId, options)),
        delete: (religionId, options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.delete, "edit.religions.delete")(religionId, options)),
        rename: (religionId, name) => apiCall(() => requireApiAction(actions.edit?.religions?.rename, "edit.religions.rename")(religionId, name)),
        setColor: (religionId, color) => apiCall(() => requireApiAction(actions.edit?.religions?.setColor, "edit.religions.setColor")(religionId, color)),
        setParent: (religionId, parentId, options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.setParent, "edit.religions.setParent")(religionId, parentId, options))
      }),
      routes: Object.freeze({
        create: (options = {}) => apiCall(() => requireApiAction(actions.edit?.routes?.create, "edit.routes.create")(options)),
        inspectEdit: (routeId, patch = {}) => apiCall(() => requireApiAction(actions.edit?.routes?.inspectEdit, "edit.routes.inspectEdit")(routeId, patch)),
        update: (routeId, patch = {}) => apiCall(() => requireApiAction(actions.edit?.routes?.update, "edit.routes.update")(routeId, patch)),
        inspectDelete: routeId => apiCall(() => requireApiAction(actions.edit?.routes?.inspectDelete, "edit.routes.inspectDelete")(routeId)),
        delete: (routeId, options = {}) => apiCall(() => requireApiAction(actions.edit?.routes?.delete, "edit.routes.delete")(routeId, options)),
        setNote: (routeId, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.routes?.setNote, "edit.routes.setNote")(routeId, body, options))
      }),
      rivers: Object.freeze({
        inspectCreate: (options = {}) => apiCall(() => requireApiAction(actions.edit?.rivers?.inspectCreate, "edit.rivers.inspectCreate")(options)),
        create: (options = {}) => apiCall(() => requireApiAction(actions.edit?.rivers?.create, "edit.rivers.create")(options)),
        inspectDelete: riverId => apiCall(() => requireApiAction(actions.edit?.rivers?.inspectDelete, "edit.rivers.inspectDelete")(riverId)),
        delete: (riverId, options = {}) => apiCall(() => requireApiAction(actions.edit?.rivers?.delete, "edit.rivers.delete")(riverId, options)),
        rename: (riverId, name) => apiCall(() => requireApiAction(actions.edit?.rivers?.rename, "edit.rivers.rename")(riverId, name)),
        setWidthFactor: (riverId, widthFactor) => apiCall(() => requireApiAction(actions.edit?.rivers?.setWidthFactor, "edit.rivers.setWidthFactor")(riverId, widthFactor)),
        setNote: (riverId, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.rivers?.setNote, "edit.rivers.setNote")(riverId, body, options))
      }),
      lakes: Object.freeze({
        inspectCreate: (options = {}) => apiCall(() => requireApiAction(actions.edit?.lakes?.inspectCreate, "edit.lakes.inspectCreate")(options)),
        create: (options = {}) => apiCall(() => requireApiAction(actions.edit?.lakes?.create, "edit.lakes.create")(options)),
        inspectOutlet: (lakeId, outletRiverId) => apiCall(() => requireApiAction(actions.edit?.lakes?.inspectOutlet, "edit.lakes.inspectOutlet")(lakeId, outletRiverId)),
        setOutlet: (lakeId, outletRiverId) => apiCall(() => requireApiAction(actions.edit?.lakes?.setOutlet, "edit.lakes.setOutlet")(lakeId, outletRiverId)),
        inspectDelete: lakeId => apiCall(() => requireApiAction(actions.edit?.lakes?.inspectDelete, "edit.lakes.inspectDelete")(lakeId)),
        delete: (lakeId, options = {}) => apiCall(() => requireApiAction(actions.edit?.lakes?.delete, "edit.lakes.delete")(lakeId, options)),
        rename: (lakeId, name) => apiCall(() => requireApiAction(actions.edit?.lakes?.rename, "edit.lakes.rename")(lakeId, name))
      }),
      features: Object.freeze({
        inspectPatch: (options = {}) => apiCall(() => requireApiAction(actions.edit?.features?.inspectPatch, "edit.features.inspectPatch")(options)),
        applyPatch: (options = {}) => apiCall(() => requireApiAction(actions.edit?.features?.applyPatch, "edit.features.applyPatch")(options)),
        inspectTopology: (options = {}) => apiCall(() => requireApiAction(actions.edit?.features?.inspectTopology, "edit.features.inspectTopology")(options)),
        applyTopology: (options = {}) => apiCall(() => requireApiAction(actions.edit?.features?.applyTopology, "edit.features.applyTopology")(options))
      }),
      labels: Object.freeze({
        getStyles: () => apiCall(() => requireApiAction(actions.edit?.labels?.getStyles, "edit.labels.getStyles")()),
        setStyle: (styleType, patch) => apiCall(() => requireApiAction(actions.edit?.labels?.setStyle, "edit.labels.setStyle")(styleType, patch)),
        resetStyle: styleType => apiCall(() => requireApiAction(actions.edit?.labels?.resetStyle, "edit.labels.resetStyle")(styleType)),
        resetStyles: () => apiCall(() => requireApiAction(actions.edit?.labels?.resetStyles, "edit.labels.resetStyles")()),
        setLayout: (label, patch) => apiCall(() => requireApiAction(actions.edit?.labels?.setLayout, "edit.labels.setLayout")(label, patch)),
        setPositionLock: (label, locked, options = {}) => apiCall(() => requireApiAction(actions.edit?.labels?.setPositionLock, "edit.labels.setPositionLock")(label, locked, options)),
        addCustom: (options = {}) => apiCall(() => requireApiAction(actions.edit?.labels?.addCustom, "edit.labels.addCustom")(options)),
        delete: label => apiCall(() => requireApiAction(actions.edit?.labels?.delete, "edit.labels.delete")(label)),
        moveCustom: (labelId, point) => apiCall(() => requireApiAction(actions.edit?.labels?.moveCustom, "edit.labels.moveCustom")(labelId, point)),
        renameCustom: (labelId, text) => apiCall(() => requireApiAction(actions.edit?.labels?.renameCustom, "edit.labels.renameCustom")(labelId, text)),
        setNote: (label, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.labels?.setNote, "edit.labels.setNote")(label, body, options)),
        restore: label => apiCall(() => requireApiAction(actions.edit?.labels?.restore, "edit.labels.restore")(label))
      }),
      markers: Object.freeze({
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.markers?.add, "edit.markers.add")(options)),
        delete: markerId => apiCall(() => requireApiAction(actions.edit?.markers?.delete, "edit.markers.delete")(markerId)),
        move: (markerId, packCell) => apiCall(() => requireApiAction(actions.edit?.markers?.move, "edit.markers.move")(markerId, packCell)),
        setNote: (markerId, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.markers?.setNote, "edit.markers.setNote")(markerId, body, options)),
        setVisual: (markerId, patch) => apiCall(() => requireApiAction(actions.edit?.markers?.setVisual, "edit.markers.setVisual")(markerId, patch))
      })
    }),
    data: Object.freeze({
      exportAll: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportAll, "data.exportAll")(options)),
      exportMap: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportMap, "data.exportMap")(options)),
      exportGEO: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportGEO, "data.exportGEO")(options)),
      exportFeatureGEO: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportFeatureGEO, "data.exportFeatureGEO")(options)),
      exportCompressedAll: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportCompressedAll, "data.exportCompressedAll")(options)),
      exportPNG: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportPNG, "data.exportPNG")(options)),
      exportHeightmapPNG: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportHeightmapPNG, "data.exportHeightmapPNG")(options)),
      exportNotes: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportNotes, "data.exportNotes")(options)),
      exportMeasurements: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportMeasurements, "data.exportMeasurements")(options)),
      exportImportDiagnostic: (options = {}) => apiCall(() => requireApiAction(actions.data?.exportImportDiagnostic, "data.exportImportDiagnostic")(options)),
      saveBrowserMap: (options = {}) => apiCall(() => requireApiAction(actions.data?.saveBrowserMap, "data.saveBrowserMap")(options)),
      restoreBrowserMap: (options = {}) => apiCall(() => requireApiAction(actions.data?.restoreBrowserMap, "data.restoreBrowserMap")(options)),
      inspectCollectionImport: (kind, document, options = {}) => apiCall(() => requireApiAction(actions.data?.inspectCollectionImport, "data.inspectCollectionImport")(kind, document, options)),
      importMap: (document, options = {}) => apiCall(() => requireApiAction(actions.data?.importMap, "data.importMap")(document, options)),
      importGEO: (document, options = {}) => apiCall(() => requireApiAction(actions.data?.importGEO, "data.importGEO")(document, options)),
      importHeightmap: (payload, options = {}) => apiCall(() => requireApiAction(actions.data?.importHeightmap, "data.importHeightmap")(payload, options))
    }),
    namebases: Object.freeze({
      list: (options = {}) => apiCall(() => listNamebases(state, options)),
      export: (options = {}) => apiCall(() => requireApiAction(actions.namebases?.export, "namebases.export")(options)),
      import: (document, options = {}) => apiCall(() => requireApiAction(actions.namebases?.import, "namebases.import")(document, options)),
      create: (payload = {}) => apiCall(() => requireApiAction(actions.namebases?.create, "namebases.create")(payload)),
      copyBuiltin: (baseId, options = {}) => apiCall(() => requireApiAction(actions.namebases?.copyBuiltin, "namebases.copyBuiltin")(baseId, options)),
      update: (baseId, patch = {}) => apiCall(() => requireApiAction(actions.namebases?.update, "namebases.update")(baseId, patch)),
      delete: (baseId, options = {}) => apiCall(() => requireApiAction(actions.namebases?.delete, "namebases.delete")(baseId, options)),
      clear: (options = {}) => apiCall(() => requireApiAction(actions.namebases?.clear, "namebases.clear")(options)),
      bind: (scope, target, baseId, options = {}) => apiCall(() => requireApiAction(actions.namebases?.bind, "namebases.bind")(scope, target, baseId, options)),
      renameObjects: (kind, ids, options = {}) => apiCall(() => requireApiAction(actions.namebases?.renameObjects, "namebases.renameObjects")(kind, ids, options)),
      inspectBindAndRename: request => apiCall(() => requireApiAction(actions.namebases?.inspectBindAndRename, "namebases.inspectBindAndRename")(request)),
      bindAndRename: (request, options = {}) => apiCall(() => requireApiAction(actions.namebases?.bindAndRename, "namebases.bindAndRename")(request, options)),
      inspectReplacement: request => apiCall(() => requireApiAction(actions.namebases?.inspectReplacement, "namebases.inspectReplacement")(request)),
      replace: (request, options = {}) => apiCall(() => requireApiAction(actions.namebases?.replace, "namebases.replace")(request, options))
    }),
    debug: Object.freeze({
      enable: () => apiCall(() => setDebugMode(state, true)),
      disable: () => apiCall(() => setDebugMode(state, false)),
      snapshot: (options = {}) => apiCall(() => buildDebugSnapshot(state, documentRef, options)),
      dumpState: (options = {}) => apiCall(() => buildDebugStateDump(state, documentRef, options, api)),
      renderer: () => apiCall(() => buildDebugRendererSnapshot(state)),
      health: (options = {}) => apiCall(() => buildDebugHealthSnapshot(state, options)),
      profileNextRender: (options = {}) => apiCall(() => profileDebugNextRender(state, options))
    })
  };
  methodDescriptions = buildApiMethodDescriptionRegistry(API_METHODS, methodMetadata, api);
  return Object.freeze(api);
}

function buildCapabilities(api) {
  const methods = API_METHODS;
  const apiContract = buildApiContract(methods, buildMethodMetadata());
  const methodMetadata = apiContract.methodMetadata;
  const methodDescriptions = buildApiMethodDescriptionRegistry(methods, methodMetadata, api);
  return {
    apiVersion: API_VERSION,
    stability: API_STABILITY,
    contract: apiContract.contract,
    capabilityGroups: apiContract.capabilityGroups,
    compatibility: apiContract.compatibility,
    stabilitySummary: apiContract.stabilitySummary,
    namespaces: Object.keys(methods),
    methods,
    methodMetadata,
    methodMetadataCoverage: buildApiMethodCoverage(methods, methodMetadata, api),
    methodDescriptionSchemaVersion: methodDescriptions["info.version"]?.schemaVersion,
    methodDescriptionCoverage: buildApiDescriptionCoverage(methods, methodMetadata, methodDescriptions, api),
    safety: {
      confirmationOption: "confirm: true",
      confirmRequiredMethods: [...CONFIRM_REQUIRED_METHODS],
      confirmRequired: groupQualifiedMethodNames(CONFIRM_REQUIRED_METHODS)
    },
    sideEffects: {
      info: "readonly",
      objects: "readonly-object-discovery",
      cells: "readonly-grid-and-pack-cell-discovery",
      grid: "controlled-grid-structure-snapshot-validation-and-transaction",
      planner: "readonly-planner-recipes",
      analysis: "readonly-regional-analysis",
      regenerationLocks: "persistent-regeneration-protection",
      generate: "map-regeneration",
      oceanCurrents: "ocean-current-edit-and-world-rebuild",
      selection: "selection-camera-highlights-and-editing-state",
      layers: "display-preference-camera-and-theme-registry",
      units: "display-preference",
      climate: "readonly-and-climate-update",
      history: "edit-history-read-and-undo-redo",
      edit: "edit-command",
      data: "readonly-download-and-map-import",
      namebases: "readonly-download-and-edit-command",
      debug: "diagnostics-and-debug-ui"
    }
  };
}

export function buildMethodMetadata() {
  return {
    info: {
      version: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      capabilities: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      describe: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      mapSummary: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      runtimeStats: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      healthEvents: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false}
    },
    objects: {
      types: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      list: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      query: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false}
    },
    cells: {
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getAtPoint: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      neighbors: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      query: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      locate: {stable: "draft", mutates: "camera-and-diagnostic-display", undoable: false, async: false, requiresConfirm: false},
      scan: {stable: "draft", mutates: "none", undoable: false, async: true, requiresConfirm: false}
      ,
      actions: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      inspectAction: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false}
    },
    grid: {
      summary: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      snapshot: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      inspectWrite: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      applyWrite: {stable: "draft", mutates: "grid-topology-and-derived-map", undoable: true, async: true, requiresConfirm: true},
      inspectRefinement: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      refine: {stable: "draft", mutates: "grid-topology-and-derived-map", undoable: true, async: true, requiresConfirm: true}
    },
    planner: {
      listRecipes: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getRecipe: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false}
    },
    analysis: {
      defineRegion: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      describeRegion: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      compareRegions: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      explainPrecipitation: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      diagnosePopulation: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      comparePower: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      diagnoseTerrain: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false}
    },
    regenerationLocks: {
      list: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      status: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      inspect: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      set: {stable: "draft", mutates: "regeneration-locks", undoable: true, async: false, requiresConfirm: false},
      setMany: {stable: "draft", mutates: "regeneration-locks", undoable: true, async: false, requiresConfirm: false},
      clearKind: {stable: "draft", mutates: "regeneration-locks", undoable: true, async: false, requiresConfirm: false}
    },
    oceanCurrents: {
      rename: {stable: "draft", mutates: "ocean-currents", undoable: true, async: false, requiresConfirm: false},
      regenerate: {stable: "draft", mutates: "ocean-currents", undoable: true, async: false, requiresConfirm: false},
      inspectWorldRebuild: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      rebuildWorld: {stable: "draft", mutates: "map-derived-data", undoable: true, async: true, requiresConfirm: true},
      cancelWorldRebuild: {stable: "draft", mutates: "runtime-operation", undoable: false, async: false, requiresConfirm: false}
    },
    layers: {
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      listThemes: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      setViewMode: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setVisible: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setTheme: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      exportTheme: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      importTheme: {stable: "draft", mutates: "visual-theme-registry-and-display", undoable: true, async: false, requiresConfirm: false},
      createTheme: {stable: "draft", mutates: "visual-theme-registry-and-display", undoable: true, async: false, requiresConfirm: false},
      updateTheme: {stable: "draft", mutates: "visual-theme-registry-and-display", undoable: true, async: false, requiresConfirm: false},
      deleteTheme: {stable: "draft", mutates: "visual-theme-registry-and-display", undoable: true, async: false, requiresConfirm: false},
      fitView: {stable: "draft", mutates: "camera-state", undoable: false, async: false, requiresConfirm: false},
      setShowOceanHeight: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setSmoothCellBorders: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setShowHoverInfo: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setMaxCityLabels: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false}
    },
    units: {
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      apply: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setDistanceUnit: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setAreaUnit: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setNumberAbbreviation: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setMapScale: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setPopulationScale: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setMilitaryScale: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false},
      setPrecipitationScale: {stable: "draft", mutates: "display-preference", undoable: false, async: false, requiresConfirm: false}
    },
    climate: {
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getOptions: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getTemperature: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getPrecipitation: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getLatitude: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getAtmosphere: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      getBiomes: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      apply: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      setLatitude: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      setLatitudeRange: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      setLongitudeRange: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      setTemperature: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      setPrecipitation: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      setWind: {stable: "draft", mutates: "climate-state-and-derived-stale", undoable: false, async: false, requiresConfirm: false},
      inspectDownstreamRebuild: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      applyDownstreamRebuild: {stable: "draft", mutates: "map-derived-data", undoable: true, async: true, requiresConfirm: true}
    },
    history: {
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      stats: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      peek: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      undo: {stable: "draft", mutates: "map-and-edit-history-state", undoable: false, async: false, requiresConfirm: false},
      redo: {stable: "draft", mutates: "map-and-edit-history-state", undoable: false, async: false, requiresConfirm: false}
    },
    selection: {
      get: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      resolve: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      select: {stable: "draft", mutates: "selection-state", undoable: false, async: false, requiresConfirm: false},
      clear: {stable: "draft", mutates: "selection-state", undoable: false, async: false, requiresConfirm: false},
      locate: {stable: "draft", mutates: "camera-and-selection-state", undoable: false, async: false, requiresConfirm: false},
      pick: {stable: "draft", mutates: "pick-panel-state", undoable: false, async: false, requiresConfirm: false},
      flash: {stable: "draft", mutates: "selection-flash-state", undoable: false, async: false, requiresConfirm: false},
      highlight: {stable: "draft", mutates: "persistent-highlight-state", undoable: false, async: false, requiresConfirm: false},
      clearHighlights: {stable: "draft", mutates: "persistent-highlight-state", undoable: false, async: false, requiresConfirm: false},
      startEditing: {stable: "draft", mutates: "editing-state", undoable: false, async: false, requiresConfirm: false},
      stopEditing: {stable: "draft", mutates: "editing-state", undoable: false, async: false, requiresConfirm: false},
      toggleEditing: {stable: "draft", mutates: "editing-state", undoable: false, async: false, requiresConfirm: false}
    },
    generate: {
      getOptions: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      setOptions: {stable: "draft", mutates: "generation-options", undoable: false, async: false, requiresConfirm: false},
      regenerate: {stable: "draft", mutates: "map-derived-data", undoable: true, async: true, requiresConfirm: true},
      newMap: {stable: "draft", mutates: "replace-map", undoable: false, async: true, requiresConfirm: true},
      rerollSeed: {stable: "draft", mutates: "replace-map", undoable: false, async: true, requiresConfirm: true}
    },
    edit: {
      "notes.createStandalone": {stable: "draft", mutates: "notes", undoable: true, async: false, requiresConfirm: false},
      "notes.set": {stable: "draft", mutates: "notes", undoable: true, async: false, requiresConfirm: false},
      "notes.delete": {stable: "draft", mutates: "notes", undoable: true, async: false, requiresConfirm: false},
      "notes.import": {stable: "draft", mutates: "notes", undoable: true, async: false, requiresConfirm: false},
      "notes.deleteBatch": {stable: "draft", mutates: "notes", undoable: true, async: false, requiresConfirm: true},
      "measurements.save": {stable: "draft", mutates: "measurements", undoable: true, async: false, requiresConfirm: false},
      "measurements.rename": {stable: "draft", mutates: "measurements", undoable: true, async: false, requiresConfirm: false},
      "measurements.updatePoints": {stable: "draft", mutates: "measurements", undoable: true, async: false, requiresConfirm: false},
      "measurements.delete": {stable: "draft", mutates: "measurements", undoable: true, async: false, requiresConfirm: false},
      "measurements.import": {stable: "draft", mutates: "measurements", undoable: true, async: false, requiresConfirm: false},
      "cities.add": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "cities.inspectCreateAtCell": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cities.createAtCell": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "cities.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cities.delete": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: true},
      "cities.inspectMove": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cities.move": {stable: "draft", mutates: "settlements-routes", undoable: true, async: false, requiresConfirm: false},
      "cities.rename": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "cities.setPopulation": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "cities.inspectOwnerSync": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cities.syncOwner": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "cities.setVisual": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "cities.resetVisual": {stable: "draft", mutates: "settlements", undoable: true, async: false, requiresConfirm: false},
      "provinces.add": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "provinces.inspectCreateAtCell": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.createAtCell": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "provinces.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.delete": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: true},
      "provinces.inspectEnsureAssignment": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.ensureAssignment": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: false},
      "provinces.inspectTransfer": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.transfer": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: true},
      "provinces.inspectMerge": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.merge": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: true},
      "provinces.inspectSplit": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.split": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: true},
      "provinces.inspectCapitalReassessment": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "provinces.reassessCapitals": {stable: "draft", mutates: "provincial-capitals-and-route-priority", undoable: true, async: false, requiresConfirm: true},
      "provinces.rename": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "provinces.setColor": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "provinces.applyChanges": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.add": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.inspectCreateAtCell": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "states.createAtCell": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "states.delete": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: true},
      "states.inspectMerge": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "states.merge": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: true},
      "states.inspectSplit": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "states.split": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: true},
      "states.inspectTerritoryTransfer": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "states.transferTerritory": {stable: "draft", mutates: "political-topology", undoable: true, async: false, requiresConfirm: true},
      "states.rename": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.setColor": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.setGovernment": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.inspectCapitalChange": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "states.setCapital": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.setGovernmentBatch": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "states.applyChanges": {stable: "draft", mutates: "political-entities", undoable: true, async: false, requiresConfirm: false},
      "height.inspectChanges": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applyChanges": {stable: "draft", mutates: "height", undoable: true, async: false, requiresConfirm: false},
      "height.inspectGlobalTransform": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applyGlobalTransform": {stable: "draft", mutates: "height", undoable: true, async: false, requiresConfirm: false},
      "height.inspectTerrainTemplate": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applyTerrainTemplate": {stable: "draft", mutates: "height", undoable: true, async: false, requiresConfirm: false},
      "height.inspectTerrainProgram": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applyTerrainProgram": {stable: "draft", mutates: "height", undoable: true, async: false, requiresConfirm: false},
      "height.inspectRangeTransform": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applyRangeTransform": {stable: "draft", mutates: "height", undoable: true, async: false, requiresConfirm: false},
      "height.inspectSelectionSmoothing": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applySelectionSmoothing": {stable: "draft", mutates: "height", undoable: true, async: false, requiresConfirm: false},
      "height.inspectSeafloorReset": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "height.applySeafloorReset": {stable: "draft", mutates: "height-and-map-derived-data", undoable: true, async: true, requiresConfirm: true},
      "height.rebuildBaseDerived": {stable: "draft", mutates: "map-derived-data", undoable: true, async: false, requiresConfirm: true},
      "height.rebuildDownstreamDerived": {stable: "draft", mutates: "map-derived-data", undoable: true, async: false, requiresConfirm: true},
      "height.rebuildAllDerived": {stable: "draft", mutates: "map-derived-data", undoable: true, async: false, requiresConfirm: true},
      "biomes.inspectAssignment": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "biomes.assignCells": {stable: "draft", mutates: "biomes-and-suitability", undoable: true, async: false, requiresConfirm: false},
      "biomes.inspectSuitability": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "biomes.applySuitability": {stable: "draft", mutates: "suitability-and-population", undoable: true, async: false, requiresConfirm: false},
      "population.inspectAdjustment": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "population.applyAdjustment": {stable: "draft", mutates: "population-and-economy-demand", undoable: true, async: false, requiresConfirm: false},
      "population.inspectTransfer": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "population.transfer": {stable: "draft", mutates: "population-and-economy-demand", undoable: true, async: false, requiresConfirm: true},
      "economy.inspectAssignment": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "economy.assignCells": {stable: "draft", mutates: "economy", undoable: true, async: false, requiresConfirm: true},
      "economy.rebuild": {stable: "draft", mutates: "economy", undoable: true, async: false, requiresConfirm: true},
      "economy.setGoodDisplay": {stable: "draft", mutates: "economy-display", undoable: true, async: false, requiresConfirm: false},
      "economy.setMarketDisplay": {stable: "draft", mutates: "economy-display", undoable: true, async: false, requiresConfirm: false},
      "diplomacy.inspectRelation": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "diplomacy.setRelation": {stable: "draft", mutates: "diplomacy", undoable: true, async: false, requiresConfirm: false, conditionalConfirm: "inspector.requiresConfirm"},
      "diplomacy.inspectDeclareWar": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "diplomacy.declareWar": {stable: "draft", mutates: "diplomacy-and-war-context", undoable: true, async: false, requiresConfirm: true},
      "diplomacy.inspectPeace": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "diplomacy.makePeace": {stable: "draft", mutates: "diplomacy-and-war-context", undoable: true, async: false, requiresConfirm: true},
      "diplomacy.inspectOverlordChange": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "diplomacy.changeOverlord": {stable: "draft", mutates: "diplomacy-and-war-context", undoable: true, async: false, requiresConfirm: true},
      "military.inspectRatios": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "military.setRatios": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.inspectStatus": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "military.setStatus": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.setStatusBatch": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.inspectMoveStation": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "military.moveStation": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.inspectBase": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "military.setBase": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.inspectBattle": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "military.resolveBattle": {stable: "draft", mutates: "military-and-battle-events", undoable: true, async: false, requiresConfirm: true},
      "military.recordBattleEvent": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.importBattleEvents": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "military.clearBattleEvents": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: true},
      "military.rename": {stable: "draft", mutates: "military", undoable: true, async: false, requiresConfirm: false},
      "zones.inspectCreate": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "zones.create": {stable: "draft", mutates: "zones", undoable: true, async: false, requiresConfirm: false},
      "zones.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "zones.delete": {stable: "draft", mutates: "zones", undoable: true, async: false, requiresConfirm: false},
      "zones.setStyle": {stable: "draft", mutates: "zones", undoable: true, async: false, requiresConfirm: false},
      "zones.setContext": {stable: "draft", mutates: "zones", undoable: true, async: false, requiresConfirm: false},
      "zones.setProperties": {stable: "draft", mutates: "zones", undoable: true, async: false, requiresConfirm: false},
      "zones.getEffectsAtCell": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cultures.inspectLifecycle": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cultures.add": {stable: "draft", mutates: "cultures", undoable: true, async: false, requiresConfirm: false},
      "cultures.assignCells": {stable: "draft", mutates: "cultures", undoable: true, async: false, requiresConfirm: false},
      "cultures.inspectExpansion": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "cultures.applyExpansion": {stable: "draft", mutates: "cultures-and-derived-stale", undoable: true, async: false, requiresConfirm: false, conditionalConfirm: "mode=reexpand"},
      "cultures.delete": {stable: "draft", mutates: "cultures", undoable: true, async: false, requiresConfirm: true},
      "cultures.rename": {stable: "draft", mutates: "cultures", undoable: true, async: false, requiresConfirm: false},
      "cultures.setColor": {stable: "draft", mutates: "cultures", undoable: true, async: false, requiresConfirm: false},
      "cultures.setParent": {stable: "draft", mutates: "cultures", undoable: true, async: false, requiresConfirm: false},
      "religions.inspectLifecycle": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "religions.add": {stable: "draft", mutates: "religions", undoable: true, async: false, requiresConfirm: false},
      "religions.assignCells": {stable: "draft", mutates: "religions", undoable: true, async: false, requiresConfirm: false},
      "religions.inspectExpansion": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "religions.applyExpansion": {stable: "draft", mutates: "religions-and-derived-stale", undoable: true, async: false, requiresConfirm: false, conditionalConfirm: "mode=reexpand"},
      "religions.delete": {stable: "draft", mutates: "religions", undoable: true, async: false, requiresConfirm: true},
      "religions.rename": {stable: "draft", mutates: "religions", undoable: true, async: false, requiresConfirm: false},
      "religions.setColor": {stable: "draft", mutates: "religions", undoable: true, async: false, requiresConfirm: false},
      "religions.setParent": {stable: "draft", mutates: "religions", undoable: true, async: false, requiresConfirm: false},
      "routes.create": {stable: "draft", mutates: "routes", undoable: true, async: false, requiresConfirm: false},
      "routes.inspectEdit": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "routes.update": {stable: "draft", mutates: "routes", undoable: true, async: false, requiresConfirm: false},
      "routes.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "routes.delete": {stable: "draft", mutates: "routes", undoable: true, async: false, requiresConfirm: false, conditionalConfirm: "deleteImpact.requiresConfirm"},
      "routes.setNote": {stable: "draft", mutates: "routes", undoable: true, async: false, requiresConfirm: false},
      "rivers.inspectCreate": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "rivers.create": {stable: "draft", mutates: "rivers", undoable: true, async: false, requiresConfirm: false},
      "rivers.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "rivers.delete": {stable: "draft", mutates: "rivers", undoable: true, async: false, requiresConfirm: true},
      "rivers.rename": {stable: "draft", mutates: "rivers", undoable: true, async: false, requiresConfirm: false},
      "rivers.setWidthFactor": {stable: "draft", mutates: "rivers", undoable: true, async: false, requiresConfirm: false},
      "rivers.setNote": {stable: "draft", mutates: "rivers", undoable: true, async: false, requiresConfirm: false},
      "lakes.inspectCreate": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "lakes.create": {stable: "draft", mutates: "lakes", undoable: true, async: false, requiresConfirm: false},
      "lakes.inspectOutlet": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "lakes.setOutlet": {stable: "draft", mutates: "features-and-hydrology", undoable: true, async: false, requiresConfirm: false},
      "lakes.inspectDelete": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "lakes.delete": {stable: "draft", mutates: "lakes", undoable: true, async: false, requiresConfirm: true},
      "lakes.rename": {stable: "draft", mutates: "lakes", undoable: true, async: false, requiresConfirm: false},
      "features.inspectPatch": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "features.applyPatch": {stable: "draft", mutates: "features-and-hydrology", undoable: true, async: false, requiresConfirm: false},
      "features.inspectTopology": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "features.applyTopology": {stable: "draft", mutates: "features-topology-and-height", undoable: true, async: false, requiresConfirm: true},
      "labels.getStyles": {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      "labels.setStyle": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.resetStyle": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.resetStyles": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.setLayout": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.setPositionLock": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.addCustom": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.delete": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.moveCustom": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.renameCustom": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.setNote": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "labels.restore": {stable: "draft", mutates: "labels", undoable: true, async: false, requiresConfirm: false},
      "markers.add": {stable: "draft", mutates: "markers", undoable: true, async: false, requiresConfirm: false},
      "markers.delete": {stable: "draft", mutates: "markers", undoable: true, async: false, requiresConfirm: false},
      "markers.move": {stable: "draft", mutates: "markers", undoable: true, async: false, requiresConfirm: false},
      "markers.setNote": {stable: "draft", mutates: "markers", undoable: true, async: false, requiresConfirm: false},
      "markers.setVisual": {stable: "draft", mutates: "markers", undoable: true, async: false, requiresConfirm: false}
    },
    data: {
      exportAll: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      exportMap: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      exportGEO: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      exportFeatureGEO: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      exportCompressedAll: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: true, requiresConfirm: false},
      exportPNG: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: true, requiresConfirm: false},
      exportHeightmapPNG: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: true, requiresConfirm: false},
      exportNotes: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      exportMeasurements: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      exportImportDiagnostic: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      saveBrowserMap: {stable: "draft", mutates: "browser-storage", undoable: false, async: true, requiresConfirm: false},
      restoreBrowserMap: {stable: "draft", mutates: "replace-map", undoable: false, async: true, requiresConfirm: true},
      inspectCollectionImport: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      importMap: {stable: "draft", mutates: "replace-map", undoable: false, async: true, requiresConfirm: true},
      importGEO: {stable: "draft", mutates: "map-or-measurements", undoable: true, async: true, requiresConfirm: true},
      importHeightmap: {stable: "draft", mutates: "replace-map", undoable: false, async: true, requiresConfirm: true}
    },
    namebases: {
      list: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      export: {stable: "draft", mutates: "download-or-export-result", undoable: false, async: false, requiresConfirm: false},
      import: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: false},
      create: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: false},
      copyBuiltin: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: false},
      update: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: false},
      delete: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: true},
      clear: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: true},
      bind: {stable: "draft", mutates: "namebases", undoable: true, async: false, requiresConfirm: false},
      renameObjects: {stable: "draft", mutates: "object-names", undoable: true, async: false, requiresConfirm: true},
      inspectBindAndRename: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      bindAndRename: {stable: "draft", mutates: "namebases-and-object-names", undoable: true, async: false, requiresConfirm: false},
      inspectReplacement: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      replace: {stable: "draft", mutates: "namebases-and-bindings", undoable: true, async: false, requiresConfirm: true}
    },
    debug: {
      enable: {stable: "draft", mutates: "debug-ui-state", undoable: false, async: false, requiresConfirm: false},
      disable: {stable: "draft", mutates: "debug-ui-state", undoable: false, async: false, requiresConfirm: false},
      snapshot: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      dumpState: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      renderer: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      health: {stable: "draft", mutates: "none", undoable: false, async: false, requiresConfirm: false},
      profileNextRender: {stable: "draft", mutates: "renderer-diagnostics", undoable: false, async: false, requiresConfirm: false}
    }
  };
}

function requireApiAction(action, name) {
  if (typeof action !== "function") throw new Error(`API action 未安装：${name}`);
  return action;
}

function normalizePublicOptions(value, allowedFields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(`${label}参数必须是对象`);
    error.code = "invalid_argument";
    throw error;
  }
  const unknown = Object.keys(value).filter(field => !allowedFields.includes(field));
  if (unknown.length) {
    const error = new Error(`${label}包含未公开字段：${unknown.join(", ")}`);
    error.code = "invalid_argument";
    throw error;
  }
  return {...value};
}

function normalizePublicHeightSemanticOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("高度语义工具参数必须是对象");
    error.code = "invalid_argument";
    throw error;
  }
  const privateFields = Object.keys(value).filter(field => field.startsWith("_") || ["changes", "faultAt", "seafloorPlan"].includes(field));
  if (privateFields.length) {
    const error = new Error(`高度语义工具包含未公开字段：${privateFields.join(", ")}`);
    error.code = "invalid_argument";
    throw error;
  }
  assertSerializableInput(value);
  return {...value};
}

function assertSerializableInput(value, path = "options") {
  if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) return;
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || value instanceof Map || value instanceof Set || ArrayBuffer.isView(value)) {
    const error = new Error(`${path} 必须是 JSON 可序列化值`);
    error.code = "invalid_argument";
    throw error;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSerializableInput(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertSerializableInput(item, `${path}.${key}`);
  }
}

function buildHistoryStats(state, actions = {}, options = {}) {
  return actions.history?.get?.(options) || state?.editHistory?.getStats?.(options) || null;
}

function buildApiVersion() {
  return buildApiVersionContract();
}

function cellReadonlyApiMetadata(state, action) {
  return {
    action,
    readonly: true,
    ...(state.mapRevision?.getSnapshot?.() || {mapIdentity: null, mapRevision: 0})
  };
}

function locateCellViaApi(state, actions, reference, options = {}) {
  const cell = getCellSnapshot(state.map, reference, {
    includeGeometry: false,
    includeNeighbors: false,
    includeDiagnostics: false
  });
  const normalized = normalizeCellLocateOptions(options);
  if (normalized.openLayer) requireApiAction(actions.layers?.setVisible, "layers.setVisible")("gridCells", true);
  if (typeof state.renderer?.locateCell !== "function") {
    const error = new Error("当前 renderer 不支持 Cell 定位");
    error.code = "api_error";
    throw error;
  }
  return state.renderer.locateCell(cell.ref, {...normalized, openLayer: false});
}

function delegateCellActionInspection(actions, action, input, options) {
  const target = action.inspectTarget;
  if (target.startsWith("cells.inspectAction:")) return null;
  if (target === "edit.states.inspectCreateAtCell") return requireApiAction(actions.edit?.states?.inspectCreateAtCell, target)(input);
  if (target === "edit.provinces.inspectCreateAtCell") return requireApiAction(actions.edit?.provinces?.inspectCreateAtCell, target)(input);
  if (target === "edit.cities.inspectCreateAtCell") return requireApiAction(actions.edit?.cities?.inspectCreateAtCell, target)(input);
  if (target === "edit.cities.inspectMove") {
    return requireApiAction(actions.edit?.cities?.inspectMove, target)(
      input.cityId ?? input.city?.id,
      input.target ?? input.cell
    );
  }
  if (target === "edit.cultures.inspectExpansion") {
    return requireApiAction(actions.edit?.cultures?.inspectExpansion, target)(
      input.cultureId ?? input.culture?.id,
      input.options ?? input
    );
  }
  if (target === "edit.religions.inspectExpansion") {
    return requireApiAction(actions.edit?.religions?.inspectExpansion, target)(
      input.religionId ?? input.religion?.id,
      input.options ?? input
    );
  }
  if (target === "edit.biomes.inspectSuitability") {
    return requireApiAction(actions.edit?.biomes?.inspectSuitability, target)(
      input.gridCellIds ?? input.cells ?? [],
      input.options ?? options
    );
  }
  if (target === "edit.economy.inspectAssignment") {
    return requireApiAction(actions.edit?.economy?.inspectAssignment, target)(
      input.marketId ?? input.market?.id,
      input.packCellIds ?? input.cells ?? []
    );
  }
  if (target === "edit.routes.inspectEdit") {
    return requireApiAction(actions.edit?.routes?.inspectEdit, target)(
      input.routeId ?? input.route?.id,
      input.patch ?? input
    );
  }
  if (target === "edit.features.inspectPatch") {
    return requireApiAction(actions.edit?.features?.inspectPatch, target)(input);
  }
  if (target === "edit.features.inspectTopology") {
    return requireApiAction(actions.edit?.features?.inspectTopology, target)(input);
  }
  const error = new Error(`Cell action registry 的 inspector target 无运行时委托：${target}`);
  error.code = "action-not-inspectable";
  throw error;
}

function normalizeCellLocateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    const error = new Error("Cell 定位选项必须是对象");
    error.code = "invalid_argument";
    throw error;
  }
  const allowed = new Set(["fit", "flash", "openLayer"]);
  const unknown = Object.keys(options).filter(key => !allowed.has(key));
  if (unknown.length) {
    const error = new Error(`Cell 定位选项包含未知字段：${unknown.join("、")}`);
    error.code = "invalid_argument";
    throw error;
  }
  for (const key of allowed) {
    if (options[key] !== undefined && typeof options[key] !== "boolean") {
      const error = new Error(`${key} 必须是布尔值`);
      error.code = "invalid_argument";
      throw error;
    }
  }
  return {
    fit: options.fit !== false,
    flash: options.flash !== false,
    openLayer: options.openLayer === true
  };
}

function buildMapSummary(state) {
  return buildSharedMapSummary(state?.map, {
    revision: state?.mapRevision?.getSnapshot?.() || {},
    seed: state?.options?.seed,
    visualTheme: state?.options?.visualTheme
  });
}

function buildRuntimeStats(state, documentRef) {
  const rendererStats = state?.renderer?.getStats?.() || null;
  const history = state?.editHistory?.getStats?.() || null;
  const health = buildHealthEventsSnapshot(state, {limit: 20}).events;
  const loading = documentRef.getElementById("generation-loading");
  return {
    renderer: rendererStats,
    editHistory: history,
    lastEditRefresh: state?.lastEditRefresh || null,
    selection: buildSelectionSnapshot(state),
    health: {
      events: health.length,
      latest: health.slice(-5)
    },
    operation: state?.runtimeOperation?.getSnapshot?.() || state?.runtimeOperationSnapshot || null,
    loading: {
      visible: Boolean(loading && !loading.hidden),
      text: documentRef.getElementById("generation-loading-text")?.textContent?.trim() || ""
    }
  };
}

function buildDebugSnapshot(state, documentRef, options = {}) {
  const health = buildDebugHealthSnapshot(state, {limit: options.limit ?? 20, severity: options.severity});
  const renderer = buildDebugRendererSummary(state);
  const loading = buildLoadingSnapshot(documentRef);
  return {
    api: buildApiVersion(),
    location: buildDocumentLocationSnapshot(documentRef),
    app: {
      ready: Boolean(state),
      mapReady: Boolean(state?.map),
      rendererReady: Boolean(state?.renderer),
      loading,
      debug: buildDebugModeSnapshot(state, documentRef)
    },
    map: buildMapSummary(state),
    layers: buildLayerSnapshot(state, documentRef),
    units: buildUnitSnapshot(state, documentRef),
    selection: buildSelectionSnapshot(state),
    history: state?.editHistory?.getStats?.() || null,
    renderer,
    health
  };
}

function setDebugMode(state, enabled) {
  const debugPanel = state?.panels?.development;
  if (!debugPanel) throw new Error("开发模式面板未初始化");
  if (enabled) debugPanel.open?.();
  else debugPanel.close?.();
  return buildDebugModeSnapshot(state, debugPanel.panel?.ownerDocument || null);
}

function buildDebugModeSnapshot(state, documentRef) {
  const debugPanel = state?.panels?.development || documentRef?.defaultView?.__webglGeneratorDebug || null;
  const panel = debugPanel?.panel || null;
  return {
    available: Boolean(debugPanel),
    enabled: Boolean(debugPanel?.enabled),
    collapsed: Boolean(debugPanel?.collapsed),
    panelVisible: Boolean(panel && !panel.classList.contains("hidden")),
    loadTraceEvents: Array.isArray(debugPanel?.loadTrace) ? debugPanel.loadTrace.length : 0,
    healthEvents: Array.isArray(debugPanel?.healthEvents) ? debugPanel.healthEvents.length : 0
  };
}

function buildDebugStateDump(state, documentRef, options = {}, api = null) {
  const includeCapabilities = options.includeCapabilities !== false;
  const includeRendererStats = Boolean(options.includeRendererStats || options.fullRenderer || options.renderer === "full");
  return {
    dumpVersion: 1,
    api: buildApiVersion(),
    included: {
      capabilities: includeCapabilities,
      rendererStats: includeRendererStats
    },
    snapshot: buildDebugSnapshot(state, documentRef, options),
    capabilities: includeCapabilities ? buildCapabilities(api) : null,
    renderer: includeRendererStats ? buildDebugRendererSnapshot(state) : null
  };
}

function buildDebugRendererSnapshot(state) {
  const stats = state?.renderer?.getStats?.() || null;
  if (!stats) return {ready: false};
  return {
    ready: true,
    stats
  };
}

function buildDebugRendererSummary(state) {
  const stats = state?.renderer?.getStats?.() || null;
  if (!stats) return {ready: false};
  return {
    ready: true,
    webgl2: Boolean(stats.webgl2),
    colorMode: stats.colorMode || "",
    visualTheme: stats.viewOptions?.visualTheme?.id || "",
    vertexCount: numberOrZero(stats.vertexCount),
    lineVertexCount: numberOrZero(stats.lineVertexCount),
    pointVertexCount: numberOrZero(stats.pointVertexCount),
    routeVertexCount: numberOrZero(stats.routeVertexCount),
    riverVertexCount: numberOrZero(stats.riverVertexCount),
    camera: {...(stats.camera || {})},
    canvasSize: {...(stats.canvasSize || {})},
    draw: {...(stats.draw || {})},
    loadMap: stats.loadMap || null,
    dynamicMeshCache: {...(stats.dynamicMeshCache || {})}
  };
}

function buildDebugHealthSnapshot(state, options = {}) {
  const monitor = state?.healthMonitor || null;
  return {
    ...buildHealthEventsSnapshot(state, options),
    storageKey: monitor?.storageKey || "",
    thresholds: monitor?.thresholds || {},
    currentOperation: monitor?.currentOperation || null
  };
}

function profileDebugNextRender(state, options = {}) {
  const renderer = state?.renderer;
  if (typeof renderer?.draw !== "function") throw new Error("当前 renderer 不支持渲染 profiling");
  const beforeStats = renderer.getStats?.() || {};
  const renderOptions = normalizeDebugRenderOptions(options);
  const startedAt = currentApiTime();
  renderer.draw(renderOptions);
  const totalMs = roundApiExport(currentApiTime() - startedAt);
  const afterStats = renderer.getStats?.() || {};
  return {
    profiled: true,
    totalMs,
    options: renderOptions,
    before: {
      draw: {...(beforeStats.draw || {})},
      dynamicMeshCache: {...(beforeStats.dynamicMeshCache || {})}
    },
    after: {
      draw: {...(afterStats.draw || {})},
      dynamicMeshCache: {...(afterStats.dynamicMeshCache || {})},
      selectionHighlightMode: afterStats.selectionHighlightMode || ""
    }
  };
}

function normalizeDebugRenderOptions(options = {}) {
  const normalized = {};
  for (const key of ["updateDynamicBuffers", "updateOverlay", "drawDirtyDynamicBuffers"]) {
    if (options[key] !== undefined) normalized[key] = Boolean(options[key]);
  }
  return normalized;
}

function currentApiTime() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

function buildDocumentLocationSnapshot(documentRef) {
  const view = documentRef.defaultView || window;
  return {
    href: view.location?.href || "",
    path: view.location?.pathname || "",
    search: view.location?.search || "",
    visibilityState: documentRef.visibilityState || "unknown",
    userAgent: view.navigator?.userAgent || ""
  };
}

function buildLoadingSnapshot(documentRef) {
  const loading = documentRef.getElementById("generation-loading");
  return {
    visible: Boolean(loading && !loading.hidden),
    text: documentRef.getElementById("generation-loading-text")?.textContent?.trim() || ""
  };
}

function buildHealthEventsSnapshot(state, options = {}) {
  const limit = normalizeHealthEventLimit(options.limit);
  const severity = normalizeHealthEventSeverity(options.severity ?? options.level);
  const rawEvents = state?.healthMonitor?.getEvents?.(limit) || [];
  const events = severity ? rawEvents.filter(event => event?.severity === severity || event?.level === severity) : rawEvents;
  const counts = events.reduce((summary, event) => {
    const key = event?.severity || event?.level || "unknown";
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
  return {
    events,
    total: events.length,
    counts,
    limit,
    severity: severity || "all"
  };
}

function normalizeHealthEventLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 20;
  return Math.max(1, Math.min(180, Math.round(number)));
}

function normalizeHealthEventSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  if (!severity || severity === "all" || severity === "*") return "";
  if (["info", "warn", "warning", "error"].includes(severity)) return severity === "warning" ? "warn" : severity;
  throw new Error(`未知 health event 级别：${value}`);
}

function buildSelectionSnapshot(state) {
  const snapshot = state?.selectionStore?.getSnapshot?.() || {
    selection: state?.selection || null,
    editingObject: state?.editingObject || null
  };
  return {
    selection: summarizeSelection(snapshot.selection),
    editingObject: summarizeObject(snapshot.editingObject),
    highlights: (state?.renderer?.getStats?.()?.objectHighlights || []).map(item => ({...item}))
  };
}

function buildLayerSnapshot(state, documentRef) {
  const preferences = readControlPreferences(documentRef);
  const rendererStats = state?.renderer?.getStats?.() || {};
  const layers = {...(rendererStats.layerVisibility || {}), ...(preferences.layers || {})};
  if (Object.prototype.hasOwnProperty.call(layers, "coastline")) layers.lakeShore = layers.coastline;
  if (Object.prototype.hasOwnProperty.call(layers, "tradeFlows")) layers.tradeFlows = false;
  return {
    colorMode: preferences.colorMode || rendererStats.colorMode || "height",
    visualTheme: preferences.visualTheme || rendererStats.viewOptions?.visualTheme?.id || rendererStats.visualTheme || state?.options?.visualTheme || "default",
    layers,
    diagnostics: {
      gridCells: {...(rendererStats.diagnostics?.gridCells || {})}
    },
    display: {
      showOceanHeight: Boolean(preferences.showOceanHeight),
      smoothCellBorders: Boolean(preferences.smoothCellBorders),
      showHoverInfo: Boolean(preferences.showHoverInfo),
      maxCityLabels: Number(preferences.maxCityLabels) || DEFAULT_MAX_CITY_LABELS
    },
    units: {...(preferences.units || {})}
  };
}

function buildUnitSnapshot(state, documentRef) {
  const preferences = readControlPreferences(documentRef);
  const units = normalizeUnitPreferences(preferences.units);
  return {
    units,
    rendererApplied: Boolean(state?.renderer)
  };
}

function applyUnitPreferences(state, documentRef, preferences = {}) {
  if (!preferences || typeof preferences !== "object") throw new Error("单位偏好必须是对象");
  const current = buildUnitSnapshot(state, documentRef).units;
  const units = normalizeUnitPreferences({...current, ...preferences});
  updateUnitControls(documentRef, units);
  updateControlPreferences(documentRef, {units});
  state?.renderer?.setUnitPreferences?.(units);
  return buildUnitSnapshot(state, documentRef);
}

function setAreaUnitPreference(state, documentRef, unit) {
  const requested = String(unit || "").trim();
  if (!requested) throw new Error("缺少面积单位");
  const current = buildUnitSnapshot(state, documentRef).units;
  const expected = areaUnitForDistanceUnit(current.distanceUnit, current.areaUnit, current);
  if (requested !== expected) {
    throw new Error(`面积单位 ${requested} 与当前距离单位 ${current.distanceUnit} 不匹配，应为 ${expected}`);
  }
  return applyUnitPreferences(state, documentRef, {areaUnit: requested});
}

function buildClimateSnapshot(state, section) {
  if (section !== undefined && section !== null && section !== "") return buildClimateSectionSnapshot(state, section);
  return {
    options: buildClimateOptionsSnapshot(state),
    temperature: buildClimateTemperatureSnapshot(state),
    precipitation: buildClimatePrecipitationSnapshot(state),
    latitude: buildClimateLatitudeSnapshot(state),
    atmosphere: buildClimateAtmosphereSnapshot(state),
    biomes: buildClimateBiomeSnapshot(state)
  };
}

function buildClimateSectionSnapshot(state, section) {
  const key = String(section || "").trim().toLowerCase();
  const builders = {
    options: buildClimateOptionsSnapshot,
    option: buildClimateOptionsSnapshot,
    temperature: buildClimateTemperatureSnapshot,
    temp: buildClimateTemperatureSnapshot,
    precipitation: buildClimatePrecipitationSnapshot,
    precip: buildClimatePrecipitationSnapshot,
    latitude: buildClimateLatitudeSnapshot,
    lat: buildClimateLatitudeSnapshot,
    atmosphere: buildClimateAtmosphereSnapshot,
    wind: buildClimateAtmosphereSnapshot,
    winds: buildClimateAtmosphereSnapshot,
    biomes: buildClimateBiomeSnapshot,
    biome: buildClimateBiomeSnapshot
  };
  const builder = builders[key];
  if (!builder) throw new Error(`未知气候快照分区：${section}`);
  return builder(state);
}

function buildClimateContext(state) {
  const map = assertApiMap(state);
  const climate = map.climate || {};
  const metadata = climate.metadata || {};
  const coordinates = map.mapCoordinates || climate.mapCoordinates || {};
  const options = {...(state.options || {}), ...(map.options || {})};
  return {map, climate, metadata, coordinates, options};
}

function buildClimateOptionsSnapshot(state) {
  const {options} = buildClimateContext(state);
  return {
    climateLatitudeMode: options.climateLatitudeMode || "",
    climateLatitudeCenter: numberOrNull(options.climateLatitudeCenter),
    climateLatitudeSpan: numberOrNull(options.climateLatitudeSpan),
    climateMapSizePercent: numberOrNull(options.climateMapSizePercent),
    climateLatitudeRangePercent: numberOrNull(options.climateLatitudeRangePercent),
    climateLongitudeRangePercent: numberOrNull(options.climateLongitudeRangePercent),
    atmosphereDirection: options.atmosphereDirection || "",
    winds: Array.isArray(options.winds) ? [...options.winds] : [],
    temperatureEquator: numberOrNull(options.temperatureEquator),
    temperatureNorthPole: numberOrNull(options.temperatureNorthPole),
    temperatureSouthPole: numberOrNull(options.temperatureSouthPole),
    precipitation: numberOrNull(options.precipitation)
  };
}

function buildClimateTemperatureSnapshot(state) {
  const {metadata, options} = buildClimateContext(state);
  return {
    min: numberOrNull(metadata.temperatureMin),
    max: numberOrNull(metadata.temperatureMax),
    equator: numberOrNull(options.temperatureEquator),
    northPole: numberOrNull(options.temperatureNorthPole),
    southPole: numberOrNull(options.temperatureSouthPole)
  };
}

function buildClimatePrecipitationSnapshot(state) {
  const {metadata, options} = buildClimateContext(state);
  const min = numberOrNull(metadata.precipitationMin);
  const max = numberOrNull(metadata.precipitationMax);
  return {
    min,
    max,
    unit: "internal-precipitation-index",
    millimetersPerUnit: 100,
    minMillimeters: min === null ? null : precipitationUnitsToMillimeters(min),
    maxMillimeters: max === null ? null : precipitationUnitsToMillimeters(max),
    scale: numberOrNull(options.precipitation)
  };
}

function buildClimateLatitudeSnapshot(state) {
  const {metadata, coordinates} = buildClimateContext(state);
  return {
    mode: metadata.latitudeMode || coordinates.latitudeMode || "",
    label: metadata.latitudeLabel || coordinates.latitudeLabel || "",
    center: numberOrNull(metadata.latitudeCenter ?? coordinates.latCenter),
    mapSizePercent: numberOrNull(metadata.mapSizePercent ?? coordinates.mapSizePercent),
    latitudeRangePercent: numberOrNull(metadata.latitudeRangePercent ?? coordinates.latitudeRangePercent),
    longitudeRangePercent: numberOrNull(metadata.longitudeRangePercent ?? coordinates.longitudeRangePercent),
    latN: numberOrNull(coordinates.latN),
    latS: numberOrNull(coordinates.latS),
    lonW: numberOrNull(coordinates.lonW),
    lonE: numberOrNull(coordinates.lonE)
  };
}

function buildClimateAtmosphereSnapshot(state) {
  const {metadata, coordinates, options} = buildClimateContext(state);
  return {
    direction: metadata.atmosphereDirection || options.atmosphereDirection || "",
    label: metadata.atmosphereLabel || coordinates.atmosphereLabel || "",
    windAngle: numberOrNull(metadata.windAngle),
    windProfile: Array.isArray(metadata.windProfile) ? [...metadata.windProfile] : []
  };
}

function buildClimateBiomeSnapshot(state) {
  const {climate, metadata} = buildClimateContext(state);
  const counts = {...(metadata.biomeCounts || {})};
  const entries = listBiomeDescriptors(climate.biomes).map(biome => ({
    id: biome.id,
    name: biome.name,
    canonicalName: biome.canonicalName,
    description: biome.description,
    count: Number(counts[biome.id] ?? counts[biome.canonicalName]) || 0
  }));
  return {
    counts,
    entries,
    total: Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0)
  };
}

function listNamebases(state, options = {}) {
  const map = state?.map || null;
  const includeSource = options.includeSource === true;
  const summaries = getNamebaseSummariesForMap(map, {includeSource}).map(row => summarizeNamebaseApiRow(row, includeSource));
  const bindingStatus = getNamebaseBindingStatus(map);
  return {
    ready: Boolean(map),
    metadata: {
      version: numberOrNull(map?.namebases?.version) ?? 1,
      ...(map?.namebases?.metadata && typeof map.namebases.metadata === "object" ? {...map.namebases.metadata} : {}),
      builtinBases: summaries.filter(row => row.builtin).length,
      userBases: summaries.filter(row => !row.builtin).length,
      totalBases: summaries.length,
      totalSamples: summaries.reduce((sum, row) => sum + row.samples, 0)
    },
    bindingTargets: NAMEBASE_BINDING_TARGETS.map(target => ({...target})),
    bindings: cloneNamebaseBindings(bindingStatus.bindings),
    bindingUsage: cloneNamebaseUsage(bindingStatus.usageById),
    invalidBindings: bindingStatus.invalid.map(entry => ({...entry})),
    invalidBindingCount: bindingStatus.invalidCount,
    usedBindingCount: bindingStatus.used,
    bases: summaries
  };
}

function summarizeNamebaseApiRow(row, includeSource) {
  const summary = {
    index: numberOrZero(row.index),
    id: String(row.id || ""),
    name: String(row.name || row.id || ""),
    kind: String(row.kind || ""),
    category: String(row.category || ""),
    builtin: row.builtin === true,
    origin: String(row.origin || ""),
    samples: numberOrZero(row.samples),
    weightedSamples: numberOrZero(row.weightedSamples),
    weightedNameSamples: numberOrZero(row.weightedNameSamples),
    maxSampleWeight: numberOrZero(row.maxSampleWeight),
    chainDiversity: numberOrZero(row.chainDiversity),
    uniqueSamples: numberOrZero(row.uniqueSamples),
    duplicateSamples: numberOrZero(row.duplicateSamples),
    duplicateNames: cloneStringArray(row.duplicateNames),
    minLength: numberOrZero(row.minLength),
    maxLength: numberOrZero(row.maxLength),
    sampleMinLength: numberOrZero(row.sampleMinLength),
    sampleMaxLength: numberOrZero(row.sampleMaxLength),
    sampleMeanLength: numberOrZero(row.sampleMeanLength),
    sampleMedianLength: numberOrZero(row.sampleMedianLength),
    lengthOutlierSamples: numberOrZero(row.lengthOutlierSamples),
    lengthOutlierNames: cloneStringArray(row.lengthOutlierNames),
    disallowedRepeatSamples: numberOrZero(row.disallowedRepeatSamples),
    disallowedRepeatNames: cloneStringArray(row.disallowedRepeatNames),
    doubledChars: cloneStringArray(row.doubledChars),
    unusualChars: cloneStringArray(row.unusualChars),
    duplicateChars: String(row.duplicateChars || ""),
    examples: cloneStringArray(row.examples),
    note: String(row.note || ""),
    importedAt: String(row.importedAt || ""),
    bindingUsageCount: numberOrZero(row.bindingUsageCount),
    bindingUsageLabel: String(row.bindingUsageLabel || "")
  };
  if (includeSource) summary.source = cloneStringArray(row.source);
  return summary;
}

function cloneNamebaseBindings(bindings) {
  const source = bindings && typeof bindings === "object" ? bindings : {};
  const cultures = source.cultures && typeof source.cultures === "object" ? source.cultures : {};
  return {
    global: {...(source.global || {})},
    cultures: Object.fromEntries(Object.entries(cultures).map(([cultureId, cultureBindings]) => [
      String(cultureId),
      {...(cultureBindings || {})}
    ]))
  };
}

function cloneNamebaseUsage(usageById) {
  return Object.fromEntries(Object.entries(usageById || {}).map(([id, entries]) => [
    String(id),
    Array.isArray(entries) ? entries.map(entry => ({...entry})) : []
  ]));
}

export function exportNamebasesData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const format = normalizeNamebaseExportFormat(options.format);
  const baseIds = normalizeNamebaseApiBaseIds(options.baseIds ?? options.ids);
  const exportOptions = {
    includeUser: options.includeUser !== false,
    baseIds
  };
  if (format === "legacy") return exportLegacyNamebasesData(map, documentRef, options, exportOptions, baseIds);
  return exportJsonNamebasesData(map, documentRef, options, exportOptions, baseIds);
}

function exportJsonNamebasesData(map, documentRef, options, exportOptions, baseIds) {
  const document = createNamebaseDocument(map, exportOptions);
  const text = JSON.stringify(document, null, options.pretty === false ? 0 : 2);
  const filename = `${mapFileBaseName(map)}${baseIds ? ".namebases-selected.json" : ".namebases.json"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    format: "json",
    text,
    bytes: text.length,
    metadata: {
      type: document.type,
      version: document.version,
      exportMode: document.exportMode,
      seed: document.metadata.seed || "",
      checksum: document.metadata.checksum || "",
      bases: numberOrZero(document.metadata.bases),
      samples: numberOrZero(document.metadata.samples),
      builtin: numberOrZero(document.metadata.builtin),
      user: numberOrZero(document.metadata.user)
    }
  });
}

function exportLegacyNamebasesData(map, documentRef, options, exportOptions, baseIds) {
  const text = createLegacyNamebaseText(map, exportOptions);
  const lines = text ? text.split(/\r?\n/g).filter(Boolean).length : 0;
  const filename = `${mapFileBaseName(map)}${baseIds ? ".namebases-selected.txt" : ".namebases.txt"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "text/plain;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "text/plain;charset=utf-8",
    format: "legacy",
    text,
    bytes: text.length,
    metadata: {
      exportMode: baseIds ? "selected-namebases" : "all-namebases",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      bases: lines
    }
  });
}

function normalizeNamebaseExportFormat(format) {
  const value = String(format || "json").trim().toLowerCase();
  if (["legacy", "txt", "text", "fmg"].includes(value)) return "legacy";
  return "json";
}

function normalizeNamebaseApiBaseIds(baseIds) {
  if (!Array.isArray(baseIds)) return null;
  return baseIds.map(id => String(id || "").trim()).filter(Boolean);
}

export function exportAllMapData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const document = createMapDocument(map, {
    ...(state.options || {}),
    visualTheme: currentVisualThemeId(state, documentRef),
    display: {units}
  });
  const text = stringifyMapDocument(document);
  const filename = `${mapFileBaseName(map)}.webgl-map.json`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {
      type: document.type,
      version: document.version,
      seed: document.metadata.seed || "",
      checksum: document.metadata.checksum || ""
    }
  });
}

export function exportPackGeoJson(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const rangeOptions = resolveGeoJsonRangeOptions(state, options.range);
  const geoJson = createMapGeoJson(map, rangeOptions);
  const text = JSON.stringify(geoJson);
  const filename = `${mapFileBaseName(map)}.geojson`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/geo+json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/geo+json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {
      type: geoJson.type,
      name: geoJson.name || "",
      seed: geoJson.properties?.seed || "",
      checksum: geoJson.properties?.checksum || "",
      features: geoJson.features?.length || 0,
      coordinateReference: geoJson.properties?.coordinateReference || "",
      worldBounds: geoJson.properties?.worldBounds || null,
      coordinateBounds: geoJson.properties?.coordinateBounds || null,
      exportRange: geoJson.properties?.exportRange || null
    }
  });
}

export async function exportCompressedAllMapData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const document = createMapDocument(map, {
    ...(state.options || {}),
    visualTheme: currentVisualThemeId(state, documentRef),
    display: {units}
  });
  const filename = createMapArchiveFilename(map, {
    template: options.filenameTemplate === undefined ? "{name}.{ext}" : options.filenameTemplate
  });
  const metadata = {
    type: document.type,
    version: document.version,
    name: document.metadata.name || "",
    seed: document.metadata.seed || "",
    checksum: document.metadata.checksum || ""
  };
  if (options.download === true) {
    const result = await downloadCompressedMapDocument(documentRef, document, filename);
    return {
      filename,
      mimeType: "application/gzip",
      originalBytes: result.originalBytes,
      compressedBytes: result.compressedBytes,
      metadata
    };
  }

  const result = await createCompressedMapDocumentBlob(documentRef, document);
  const data = {
    filename,
    mimeType: "application/gzip",
    originalBytes: result.originalBytes,
    compressedBytes: result.compressedBytes,
    metadata
  };
  if (options.includeBlob === true) data.blob = result.blob;
  if (options.includeBase64 !== false) data.base64 = await blobToBase64(documentRef, result.blob);
  return data;
}

export function exportFeatureGeoJsonData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const layers = options.layers && typeof options.layers === "object" ? {...options.layers} : readFeatureGeoJsonLayerOptions(documentRef);
  const dissolvePolitical = typeof options.dissolvePolitical === "boolean" ? options.dissolvePolitical : readFeatureGeoJsonDissolveOption(documentRef);
  const rangeOptions = resolveGeoJsonRangeOptions(state, options.range);
  const geoJson = createMapFeatureGeoJson(map, {layers, dissolvePolitical, ...rangeOptions});
  const text = JSON.stringify(geoJson);
  const filename = `${mapFileBaseName(map)}.features.geojson`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/geo+json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/geo+json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {
      type: geoJson.type,
      name: geoJson.name || "",
      seed: geoJson.properties?.seed || "",
      checksum: geoJson.properties?.checksum || "",
      features: geoJson.features?.length || 0,
      layerSet: geoJson.properties?.layerSet || "",
      dissolvedPolitical: Boolean(geoJson.properties?.dissolvedPolitical),
      worldBounds: geoJson.properties?.worldBounds || null,
      coordinateBounds: geoJson.properties?.coordinateBounds || null,
      exportRange: geoJson.properties?.exportRange || null
    }
  });
}

function resolveGeoJsonRangeOptions(state, range) {
  const normalizedRange = range == null ? {mode: "full"} : range;
  if (String(normalizedRange?.mode || "full").toLowerCase() !== "viewport") return {range: normalizedRange};
  const renderer = state?.renderer;
  const canvas = renderer?.canvas;
  if (typeof renderer?.screenToWorld !== "function" || typeof canvas?.getBoundingClientRect !== "function") {
    throw new Error("当前 renderer 无法解析 GeoJSON 视口范围");
  }
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) throw new Error("当前地图视口为空，无法按视口导出 GeoJSON");
  const topLeft = renderer.screenToWorld(rect.left, rect.top);
  const bottomRight = renderer.screenToWorld(rect.left + rect.width, rect.top + rect.height);
  return {
    range: normalizedRange,
    viewportBbox: [
      Math.min(topLeft.x, bottomRight.x),
      Math.min(topLeft.y, bottomRight.y),
      Math.max(topLeft.x, bottomRight.x),
      Math.max(topLeft.y, bottomRight.y)
    ]
  };
}

export function exportNotesData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const ids = normalizeApiIdFilter(options.noteIds ?? options.ids);
  const notes = buildApiNoteRows(map, ids);
  const payload = {
    type: "webgl-generator-notes-summary",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      notes: notes.length,
      totalNotes: map.notes?.metadata?.notes || map.notes?.notes?.length || 0,
      exportMode: ids ? "selected-notes" : "all-notes"
    },
    notes
  };
  const text = JSON.stringify(payload, null, options.pretty === false ? 0 : 2);
  const filename = `${mapFileBaseName(map)}${ids ? ".notes-selected.json" : ".notes.json"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {...payload.metadata, type: payload.type, version: payload.version}
  });
}

export function exportMeasurementsData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const ids = normalizeApiIdFilter(options.measurementIds ?? options.ids);
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const measurements = buildApiMeasurementRows(map, units, ids);
  const payload = {
    type: "webgl-generator-measurements",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      measurements: measurements.length,
      totalMeasurements: map.measurements?.metadata?.measurements || map.measurements?.items?.length || 0,
      exportMode: ids ? "selected-measurements" : "all-measurements"
    },
    units: {
      distanceUnit: units.distanceUnit,
      areaUnit: units.areaUnit,
      mapScaleKmPerCm: units.mapScaleKmPerCm,
      customUnits: units.customUnits
    },
    measurements
  };
  const text = JSON.stringify(payload, null, options.pretty === false ? 0 : 2);
  const filename = `${mapFileBaseName(map)}${ids ? ".measurements-selected.json" : ".measurements.json"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {...payload.metadata, type: payload.type, version: payload.version}
  });
}

export async function exportPngData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const canvas = documentRef.getElementById("map-canvas");
  const filename = `${mapFileBaseName(map)}.png`;
  const pixelScale = normalizePngApiScale(options.pixelScale ?? options.scale ?? readPngExportScale(documentRef));
  const includeMapOverlays = options.includeMapOverlays ?? (documentRef.getElementById("export-png-overlays")?.checked !== false);
  const transparentBackground = options.transparentBackground ?? (documentRef.getElementById("export-png-transparent")?.checked === true);
  const crop = options.crop ?? readPngExportCrop(documentRef);
  const overlays = options.overlays ?? readPngExportOverlays(documentRef);
  const pngOptions = {includeMapOverlays, transparentBackground, pixelScale, crop, overlays, renderer: state.renderer};
  return withRiverWaypointPreviewSuppressed(state.renderer, async () => {
    if (options.download === true) {
      const result = await downloadCanvasPng(documentRef, canvas, filename, pngOptions);
      return {
        filename,
        mimeType: "image/png",
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        pixelScale: result.pixelScale,
        includeMapOverlays: result.includeMapOverlays,
        transparentBackground: result.transparentBackground,
        crop: result.crop,
        overlays: result.overlays
      };
    }

    const result = await createCanvasPngBlob(documentRef, canvas, pngOptions);
    const data = {
      filename,
      mimeType: "image/png",
      bytes: result.blob.size,
      width: result.width,
      height: result.height,
      pixelScale: result.pixelScale,
      includeMapOverlays: result.includeMapOverlays,
      transparentBackground: result.transparentBackground,
      crop: result.crop,
      overlays: result.overlays
    };
    if (options.includeDataUrl !== false) data.dataUrl = await blobToDataUrl(documentRef, result.blob);
    return data;
  });
}

export async function exportHeightmapPngData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const filename = `${mapFileBaseName(map)}.heightmap.png`;
  const pixelScale = normalizePngApiScale(options.pixelScale ?? options.scale ?? readPngExportScale(documentRef));
  const pngOptions = {pixelScale};
  if (options.download === true) {
    const result = await downloadHeightmapPng(documentRef, map, filename, pngOptions);
    return {
      filename,
      mimeType: "image/png",
      ...result
    };
  }

  const result = await createHeightmapPngBlob(documentRef, map, pngOptions);
  const data = {
    filename,
    mimeType: "image/png",
    bytes: result.blob.size,
    width: result.width,
    height: result.height,
    pixelScale: result.pixelScale,
    cellCount: result.cellCount,
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    encoding: result.encoding
  };
  if (options.includeDataUrl !== false) data.dataUrl = await blobToDataUrl(documentRef, result.blob);
  return data;
}

function readPngExportCrop(documentRef) {
  const mode = documentRef.getElementById("export-png-crop-mode")?.value || "viewport";
  if (mode === "viewport" || mode === "map") return {mode};
  return {
    mode,
    rect: {
      x: Number(documentRef.getElementById("export-png-crop-x")?.value),
      y: Number(documentRef.getElementById("export-png-crop-y")?.value),
      width: Number(documentRef.getElementById("export-png-crop-width")?.value),
      height: Number(documentRef.getElementById("export-png-crop-height")?.value)
    }
  };
}

function readPngExportOverlays(documentRef) {
  const checked = id => documentRef.getElementById(id)?.checked !== false;
  return {
    labels: checked("export-png-overlay-labels"),
    cityIcons: checked("export-png-overlay-city-icons"),
    markers: checked("export-png-overlay-markers"),
    military: checked("export-png-overlay-military"),
    measurements: checked("export-png-overlay-measurements"),
    legend: checked("export-png-overlay-legend"),
    scaleBar: checked("export-png-overlay-scale-bar")
  };
}

function buildApiNoteRows(map, ids = null) {
  const idSet = ids ? new Set(ids) : null;
  return (map.notes?.notes || [])
    .filter(note => note?.id && (!idSet || idSet.has(String(note.id))))
    .map(note => {
      const object = objectFromNote(note);
      const resolved = object ? resolveObject(map, object) : null;
      const body = String(note.body || "");
      return {
        id: String(note.id),
        kind: note.kind || object?.kind || "",
        kindLabel: OBJECT_KIND_LABEL[note.kind] || note.kind || "备注",
        objectId: note.objectId ?? object?.id ?? "",
        name: note.name || resolved?.name || resolved?.fullName || resolved?.targetName || resolved?.text || note.id,
        body,
        bodyLength: body.length,
        format: note.format || "plain",
        pinned: Boolean(note.pinned),
        orphan: Boolean(!object || !resolved),
        standalone: Boolean(note.standalone),
        packCell: note.standalone ? Number(note.packCell) : null,
        x: note.standalone ? Number(note.x) : null,
        y: note.standalone ? Number(note.y) : null,
        createdAt: note.createdAt || "",
        updatedAt: note.updatedAt || note.createdAt || ""
      };
    });
}

function objectFromNote(note) {
  const kind = String(note.kind || "").trim();
  if (!kind) return null;
  if (kind === "label") return labelObjectFromNote(note);
  const id = parseApiObjectId(note.objectId ?? suffixAfterKind(note.id, kind));
  if (id === null || id === "") return null;
  return {kind, id};
}

function labelObjectFromNote(note) {
  const objectId = String(note.objectId || suffixAfterKind(note.id, "label") || "");
  const [targetKind, rawTargetId] = objectId.split(":");
  if (!targetKind || rawTargetId === undefined) return null;
  const targetId = parseApiObjectId(rawTargetId);
  if (targetId === null || targetId === "") return null;
  return {
    kind: "label",
    id: targetId,
    targetKind,
    targetId,
    targetName: note.name || ""
  };
}

function buildApiMeasurementRows(map, units, ids = null) {
  const idSet = ids ? new Set(ids) : null;
  return (map.measurements?.items || [])
    .filter(item => item?.id && (!idSet || idSet.has(String(item.id))))
    .map(item => {
      const points = Array.isArray(item.points) ? item.points : [];
      const routeFit = normalizeMeasurementRouteFit(item.routeFit);
      const displayPoints = measurementDisplayPoints(item, map);
      const distance = Number(item.summary?.distanceMapUnits) || measurementDistance(displayPoints);
      const area = Number(item.summary?.areaMapUnits) || (routeFit !== MEASUREMENT_ROUTE_FIT_ROADS && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0);
      const cellStops = Array.isArray(item.cellStops) ? item.cellStops : [];
      return {
        id: String(item.id),
        name: item.name || item.id,
        type: item.type || (item.closed ? "polygon" : "polyline"),
        routeFit,
        pointCount: points.length,
        displayPointCount: displayPoints.length,
        routeStopCount: cellStops.filter(Boolean).length,
        distanceMapUnits: roundApiExport(distance),
        distanceLabel: formatDisplayDistance(distance, units),
        areaMapUnits: roundApiExport(area),
        areaLabel: area ? formatDisplayArea(area, units) : "",
        cellStops,
        points: points.map((point, index) => ({
          index,
          x: roundApiExport(point.x),
          y: roundApiExport(point.y)
        })),
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || item.createdAt || ""
      };
    });
}

function normalizeApiIdFilter(ids) {
  if (!Array.isArray(ids)) return null;
  const normalized = ids.map(id => String(id ?? "").trim()).filter(Boolean);
  return normalized.length ? normalized : null;
}

function suffixAfterKind(id, kind) {
  const prefix = `${kind}:`;
  return String(id || "").startsWith(prefix) ? String(id).slice(prefix.length) : "";
}

function parseApiObjectId(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  return /^\d+$/.test(text) ? Number(text) : text;
}

function roundApiExport(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function assertApiMap(state) {
  if (!state?.map) throw new Error("当前没有可导出的地图");
  return state.map;
}

function withOptionalText(options, payload) {
  const result = {...payload, effects: [options.download === true ? "download" : "serialize"]};
  if (options.includeText === false || options.download === true && options.includeText !== true) {
    const {text: _text, ...summary} = result;
    return summary;
  }
  return result;
}

function currentVisualThemeId(state, documentRef) {
  const preferences = readControlPreferences(documentRef);
  return preferences.visualTheme || state?.map?.visualTheme?.preset || state?.options?.visualTheme || "default";
}

function updateUnitControls(documentRef, units) {
  const normalized = normalizeUnitPreferences(units);
  setControlValue(documentRef, "distance-unit", normalized.distanceUnit);
  setControlValue(documentRef, "area-unit", normalized.areaUnit);
  setControlValue(documentRef, "number-abbreviation", normalized.numberAbbreviation);
  setControlValue(documentRef, "map-scale-km-per-cm", normalized.mapScaleKmPerCm);
  setControlValue(documentRef, "population-scale", normalized.populationScale);
  setControlValue(documentRef, "military-scale", normalized.militaryScale);
  setControlValue(documentRef, "precipitation-scale", normalized.precipitationScale);
}

function setControlValue(documentRef, id, value) {
  const control = documentRef.getElementById(id);
  if (control) control.value = String(value);
}

function readFeatureGeoJsonLayerOptions(documentRef) {
  return {
    state: documentRef.getElementById("feature-export-layer-state")?.checked === true,
    province: documentRef.getElementById("feature-export-layer-province")?.checked === true,
    city: documentRef.getElementById("feature-export-layer-city")?.checked !== false,
    route: documentRef.getElementById("feature-export-layer-route")?.checked !== false,
    river: documentRef.getElementById("feature-export-layer-river")?.checked !== false,
    marker: documentRef.getElementById("feature-export-layer-marker")?.checked !== false,
    zone: documentRef.getElementById("feature-export-layer-zone")?.checked !== false
  };
}

function readFeatureGeoJsonDissolveOption(documentRef) {
  return documentRef.getElementById("feature-export-dissolve-political")?.checked === true;
}

function readPngExportScale(documentRef) {
  const value = Number(documentRef.getElementById("export-png-scale")?.value);
  return Number.isFinite(value) ? value : 1;
}

function normalizePngApiScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(4, Math.round(number)));
}

function blobToDataUrl(documentRef, blob) {
  const view = documentRef.defaultView || window;
  return new Promise((resolve, reject) => {
    const reader = new view.FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), {once: true});
    reader.addEventListener("error", () => reject(reader.error || new Error("PNG data URL 读取失败")), {once: true});
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(documentRef, blob) {
  const view = documentRef.defaultView || window;
  if (typeof view.FileReader === "function") {
    const dataUrl = await blobToDataUrl(documentRef, blob);
    const separator = dataUrl.indexOf(",");
    return separator < 0 ? dataUrl : dataUrl.slice(separator + 1);
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return view.btoa(binary);
}

function summarizeSelection(selection) {
  if (!selection) return null;
  return {
    object: summarizeObject(selection.object),
    cell: numberOrNull(selection.cell),
    x: numberOrNull(selection.x),
    y: numberOrNull(selection.y)
  };
}

function summarizeObject(object) {
  if (!object) return null;
  return {
    kind: object.kind || "",
    id: object.id ?? object.i ?? null,
    name: object.name || object.fullName || object.label || ""
  };
}

function countPoliticalItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(item => item && !item.removed && numberOrZero(item.i ?? item.id) > 0).length;
}

function countArrayItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(Boolean).length;
}

function cloneStringArray(values) {
  return Array.isArray(values) ? values.map(value => String(value || "")) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
