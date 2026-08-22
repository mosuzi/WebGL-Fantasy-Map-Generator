import {reactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius, readBrushRadiusContract} from "../../runtime/brush-radius-contract.js";
import {
  createHeightTerrainTemplateDocument,
  clearHeightTerrainTemplateRecycleRecord,
  HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS,
  HEIGHT_TERRAIN_TEMPLATE_RECYCLE_STORAGE_KEY,
  HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY,
  loadHeightTerrainTemplateRecycleRecord,
  loadHeightTerrainTemplateDocument,
  normalizeHeightTerrainTemplateProgram,
  parseHeightTerrainTemplateDocument,
  saveHeightTerrainTemplateRecycleRecord,
  stringifyHeightTerrainTemplateDocument
} from "../../runtime/height-terrain-template-programs.js";

const HEIGHT_RADIUS = readBrushRadiusContract(BRUSH_RADIUS_ID.HEIGHT);
const HEIGHT_SELECTION_RADIUS = readBrushRadiusContract(BRUSH_RADIUS_ID.HEIGHT_SELECTION);
export const HEIGHT_EDITOR_PREFERENCES_STORAGE_KEY = "webgl-generator-height-editor-preferences-v1";
export const HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE = "当前无法保存用户模板，请检查浏览器设置后重试。";
export const HEIGHT_TERRAIN_PROGRAM_STORAGE_ERROR_CODE = "height_terrain_program_storage_unavailable";

export function createHeightPanel(documentRef, manager, callbacks = {}) {
  const loadedPrograms = loadUserTerrainPrograms(documentRef);
  const savedPreferences = loadHeightEditorPreferences(documentRef);
  const panelState = reactive({
    active: false,
    action: "raise",
    affectSeafloor: false,
    scope: "land",
    preserveSurface: true,
    radius: savedPreferences.radius,
    strength: 6,
    levelPerturbation: 0,
    selectionSmoothness: 0,
    fillTolerance: 6,
    lineWidth: 12,
    linePower: 12,
    transformLower: 20,
    transformUpper: 100,
    transformOperator: "multiply",
    transformOperand: 0.9,
    transformPreview: null,
    globalToolPreview: null,
    terrainTemplateId: "plateau",
    terrainTemplateIntensity: 0.7,
    terrainTemplateTargetHeight: 68,
    terrainTemplateTerraceStep: 10,
    terrainTemplateAmplitude: 12,
    terrainTemplatePreview: null,
    terrainProgramId: HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS[0].id,
    terrainProgramOptions: [],
    terrainProgramPreview: null,
    seafloorResetPreview: null,
    terrainProgramDraftName: "我的地形模板",
    terrainProgramDraftSteps: [],
    terrainProgramCanDelete: false,
    terrainProgramCanRestore: Boolean(loadedPrograms.recycle),
    terrainProgramNotice: loadedPrograms.notice,
    terrainSelectionSource: "height-band",
    terrainSelectionRadius: HEIGHT_SELECTION_RADIUS.defaultValue,
    terrainSelectionTolerance: 6,
    terrainSelection: null,
    terrainSelectionSaved: null,
    terrainSelectionFeather: 0,
    terrainSelectionPaintState: null,
    useTerrainSelection: false,
    falloff: true,
    lastAffected: 0,
    lastHeight: "none",
    lastDelta: "none",
    lastNotice: "",
    fillPreview: null,
    graphWidth: 1440,
    graphHeight: 960,
    currentHeightStats: null,
    currentHeightPreview: null,
    derivedStaleSystems: [],
    history: null
  });
  const panelCallbacks = {
    onBrushRadiusChange: radius => callbacks.onBrushRadiusChange?.(radius),
    onActiveChange: active => callbacks.onActiveChange?.(active),
    onActionChange: action => callbacks.onActionChange?.(action),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.(),
    onGlobalToolPreview: action => callbacks.onGlobalToolPreview?.(action),
    onGlobalToolApply: () => callbacks.onGlobalToolApply?.(),
    onPreviewCancel: () => callbacks.onPreviewCancel?.(),
    onTerrainTemplatePreview: () => callbacks.onTerrainTemplatePreview?.(),
    onTerrainTemplateApply: () => callbacks.onTerrainTemplateApply?.(),
    onTerrainTemplateChange: () => callbacks.onTerrainTemplateChange?.(),
    onTerrainProgramPreview: () => callbacks.onTerrainProgramPreview?.(),
    onTerrainProgramApply: () => callbacks.onTerrainProgramApply?.(),
    onTerrainProgramChange: id => selectTerrainProgram(id),
    onTerrainProgramStepAdd: () => addTerrainProgramStep(),
    onTerrainProgramStepRemove: index => removeTerrainProgramStep(index),
    onTerrainProgramDraftClear: () => clearTerrainProgramDraft(),
    onTerrainProgramSave: name => saveTerrainProgram(name),
    onTerrainProgramDelete: () => deleteSelectedTerrainProgram(),
    onTerrainProgramRestore: () => restoreLastDeletedTerrainProgram(),
    onTerrainProgramExport: () => exportUserTerrainPrograms(),
    onTerrainProgramImport: text => importUserTerrainPrograms(text),
    onConditionalTransformPreview: () => callbacks.onConditionalTransformPreview?.(),
    onConditionalTransformApply: () => callbacks.onConditionalTransformApply?.(),
    onConditionalTransformChange: () => callbacks.onConditionalTransformChange?.(),
    onTerrainSelectionLock: request => callbacks.onTerrainSelectionLock?.(request),
    onTerrainSelectionClear: () => callbacks.onTerrainSelectionClear?.(),
    onTerrainSelectionSave: () => callbacks.onTerrainSelectionSave?.(),
    onTerrainSelectionRestore: () => callbacks.onTerrainSelectionRestore?.(),
    onTerrainSelectionSavedClear: () => callbacks.onTerrainSelectionSavedClear?.(),
    onTerrainSelectionTransform: operation => callbacks.onTerrainSelectionTransform?.(operation),
    onTerrainSelectionFeatherChange: value => callbacks.onTerrainSelectionFeatherChange?.(value),
    onTerrainSelectionCancel: () => callbacks.onTerrainSelectionCancel?.(),
    onTerrainSelectionUseChange: value => callbacks.onTerrainSelectionUseChange?.(value),
    onTerrainSelectionSmooth: () => callbacks.onTerrainSelectionSmooth?.(panelState.selectionSmoothness),
    onSeafloorResetPreview: () => callbacks.onSeafloorResetPreview?.(),
    onSeafloorResetApply: () => callbacks.onSeafloorResetApply?.(),
    onRegenerateRivers: () => callbacks.onRegenerateRivers?.(),
    onRegenerateBase: () => callbacks.onRegenerateBase?.(),
    onRegenerateDownstream: () => callbacks.onRegenerateDownstream?.(),
    onRegenerateAll: () => callbacks.onRegenerateAll?.()
  };

  const record = manager.registerPanel("height-panel", {
    title: "高度编辑",
    left: 360,
    top: 110,
    width: 360,
    maxWidth: 420,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-height-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/HeightPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "高度编辑将在首次打开时加载。",
      loading: "正在打开高度编辑，请稍候片刻。",
      failure: "高度编辑加载失败，请检查开发模式日志。"
    }
  );
  const getConditionalTransform = () => ({
    scope: panelState.scope,
    lower: panelState.transformLower,
    upper: panelState.transformUpper,
    operator: panelState.transformOperator,
    operand: panelState.transformOperand
  });
  const getTerrainSelectionRequest = operation => ({
    operation,
    source: panelState.terrainSelectionSource,
    scope: panelState.scope,
    lower: panelState.transformLower,
    upper: panelState.transformUpper,
    radius: normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT_SELECTION, panelState.terrainSelectionRadius),
    tolerance: panelState.terrainSelectionTolerance
  });
  let userTerrainPrograms = loadedPrograms.templates;
  let recycledTerrainProgram = loadedPrograms.recycle;
  refreshTerrainProgramOptions();

  function allTerrainPrograms() {
    return [...HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS, ...userTerrainPrograms];
  }

  function refreshTerrainProgramOptions() {
    panelState.terrainProgramOptions = allTerrainPrograms().map(template => ({
      value: template.id,
      label: template.user ? `用户：${template.name}` : template.name
    }));
    if (!allTerrainPrograms().some(template => template.id === panelState.terrainProgramId)) {
      panelState.terrainProgramId = HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS[0].id;
    }
    panelState.terrainProgramCanDelete = userTerrainPrograms.some(template => template.id === panelState.terrainProgramId);
  }

  function selectedTerrainProgram() {
    return allTerrainPrograms().find(template => template.id === panelState.terrainProgramId) || HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS[0];
  }

  function clearTerrainProgramPreview() {
    const hadPreview = Boolean(panelState.terrainProgramPreview);
    panelState.terrainProgramPreview = null;
    if (hadPreview) callbacks.onTerrainTemplateChange?.();
  }

  function selectTerrainProgram(id) {
    if (!allTerrainPrograms().some(template => template.id === id)) return false;
    panelState.terrainProgramId = id;
    panelState.terrainProgramCanDelete = userTerrainPrograms.some(template => template.id === id);
    clearTerrainProgramPreview();
    return true;
  }

  function currentSingleTemplateStep() {
    const step = {
      operation: panelState.terrainTemplateId,
      intensity: panelState.terrainTemplateIntensity
    };
    if (step.operation === "plateau" || step.operation === "basin") step.targetHeight = panelState.terrainTemplateTargetHeight;
    if (step.operation === "terraces") step.terraceStep = panelState.terrainTemplateTerraceStep;
    if (step.operation === "rugged") step.amplitude = panelState.terrainTemplateAmplitude;
    return step;
  }

  function addTerrainProgramStep() {
    if (panelState.terrainProgramDraftSteps.length >= 12) {
      panelState.terrainProgramNotice = "一个用户模板最多包含 12 个步骤。";
      return false;
    }
    panelState.terrainProgramDraftSteps.push(currentSingleTemplateStep());
    panelState.terrainProgramNotice = `已加入第 ${panelState.terrainProgramDraftSteps.length} 步。`;
    return true;
  }

  function removeTerrainProgramStep(index) {
    const numeric = Math.trunc(Number(index));
    if (numeric < 0 || numeric >= panelState.terrainProgramDraftSteps.length) return false;
    panelState.terrainProgramDraftSteps.splice(numeric, 1);
    panelState.terrainProgramNotice = "已移除模板步骤。";
    return true;
  }

  function clearTerrainProgramDraft() {
    panelState.terrainProgramDraftSteps = [];
    panelState.terrainProgramNotice = "已清空待保存步骤。";
    return true;
  }

  function saveTerrainProgram(name) {
    try {
      const baseId = userTemplateId(name);
      const existingIds = new Set(allTerrainPrograms().map(template => template.id));
      let id = baseId;
      let suffix = 2;
      while (existingIds.has(id)) id = `${baseId}-${suffix++}`;
      const template = normalizeHeightTerrainTemplateProgram({
        id,
        name,
        description: "由高度面板多步骤编排保存。",
        steps: panelState.terrainProgramDraftSteps
      }, {user: true});
      const nextPrograms = [...userTerrainPrograms, template];
      persistUserTerrainPrograms(documentRef, nextPrograms);
      userTerrainPrograms = nextPrograms;
      panelState.terrainProgramId = template.id;
      panelState.terrainProgramDraftSteps = [];
      panelState.terrainProgramNotice = `已保存用户模板“${template.name}”。`;
      refreshTerrainProgramOptions();
      clearTerrainProgramPreview();
      return {ok: true, template};
    } catch (error) {
      const message = heightTerrainProgramFailureMessage(error);
      panelState.terrainProgramNotice = message;
      return {ok: false, error: message, diagnostic: error?.diagnostic || null};
    }
  }

  function deleteSelectedTerrainProgram() {
    const selected = userTerrainPrograms.find(template => template.id === panelState.terrainProgramId);
    if (!selected) {
      panelState.terrainProgramNotice = "内置模板不能删除。";
      return false;
    }
    const view = documentRef.defaultView;
    if (typeof view?.confirm === "function" && !view.confirm(`确定删除用户模板“${selected.name}”？删除后可从本面板恢复上次删除。`)) {
      panelState.terrainProgramNotice = `已取消删除用户模板“${selected.name}”。`;
      return false;
    }
    try {
      const nextPrograms = userTerrainPrograms.filter(template => template.id !== selected.id);
      const storage = terrainProgramStorage(documentRef);
      const previousRecycle = storage.getItem(HEIGHT_TERRAIN_TEMPLATE_RECYCLE_STORAGE_KEY);
      try {
        recycledTerrainProgram = saveHeightTerrainTemplateRecycleRecord(storage, selected);
        persistUserTerrainPrograms(documentRef, nextPrograms);
      } catch (error) {
        if (previousRecycle === null) storage.removeItem(HEIGHT_TERRAIN_TEMPLATE_RECYCLE_STORAGE_KEY);
        else storage.setItem(HEIGHT_TERRAIN_TEMPLATE_RECYCLE_STORAGE_KEY, previousRecycle);
        throw error;
      }
      userTerrainPrograms = nextPrograms;
      panelState.terrainProgramId = HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS[0].id;
      panelState.terrainProgramCanRestore = true;
      panelState.terrainProgramNotice = `已删除用户模板“${selected.name}”，可恢复上次删除。`;
      refreshTerrainProgramOptions();
      clearTerrainProgramPreview();
      return true;
    } catch (error) {
      panelState.terrainProgramNotice = heightTerrainProgramFailureMessage(error);
      return false;
    }
  }

  function restoreLastDeletedTerrainProgram() {
    let storage = null;
    let previousTemplates = null;
    let previousRecycle = null;
    try {
      storage = terrainProgramStorage(documentRef);
      previousTemplates = storage.getItem(HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY);
      previousRecycle = storage.getItem(HEIGHT_TERRAIN_TEMPLATE_RECYCLE_STORAGE_KEY);
      const recycle = loadHeightTerrainTemplateRecycleRecord(storage);
      if (!recycle?.template) {
        recycledTerrainProgram = null;
        panelState.terrainProgramCanRestore = false;
        panelState.terrainProgramNotice = "没有可恢复的用户模板。";
        return false;
      }
      const merged = new Map(userTerrainPrograms.map(template => [template.id, template]));
      merged.set(recycle.template.id, recycle.template);
      const nextPrograms = createHeightTerrainTemplateDocument([...merged.values()]).templates;
      persistUserTerrainPrograms(documentRef, nextPrograms);
      clearHeightTerrainTemplateRecycleRecord(storage);
      userTerrainPrograms = nextPrograms;
      recycledTerrainProgram = null;
      panelState.terrainProgramId = recycle.template.id;
      panelState.terrainProgramCanRestore = false;
      panelState.terrainProgramNotice = `已恢复用户模板“${recycle.template.name}”。`;
      refreshTerrainProgramOptions();
      clearTerrainProgramPreview();
      return true;
    } catch (error) {
      if (storage) {
        restoreStorageValue(storage, HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY, previousTemplates);
        restoreStorageValue(storage, HEIGHT_TERRAIN_TEMPLATE_RECYCLE_STORAGE_KEY, previousRecycle);
      }
      panelState.terrainProgramNotice = heightTerrainProgramFailureMessage(error);
      return false;
    }
  }

  function exportUserTerrainPrograms() {
    try {
      return {
        ok: true,
        filename: "height-terrain-templates.json",
        text: stringifyHeightTerrainTemplateDocument(userTerrainPrograms)
      };
    } catch (error) {
      const message = heightTerrainProgramFailureMessage(error);
      panelState.terrainProgramNotice = message;
      return {ok: false, error: message};
    }
  }

  function importUserTerrainPrograms(text) {
    try {
      const document = parseHeightTerrainTemplateDocument(text);
      const merged = new Map(userTerrainPrograms.map(template => [template.id, template]));
      for (const template of document.templates) merged.set(template.id, template);
      const nextPrograms = createHeightTerrainTemplateDocument([...merged.values()]).templates;
      persistUserTerrainPrograms(documentRef, nextPrograms);
      userTerrainPrograms = nextPrograms;
      if (document.templates[0]) panelState.terrainProgramId = document.templates[0].id;
      panelState.terrainProgramNotice = `已导入 ${document.templates.length} 个用户模板。`;
      refreshTerrainProgramOptions();
      clearTerrainProgramPreview();
      return {ok: true, count: document.templates.length};
    } catch (error) {
      const message = heightTerrainProgramFailureMessage(error);
      panelState.terrainProgramNotice = message;
      return {ok: false, error: message};
    }
  }

  return {
    open(history) {
      panelState.history = history;
      manager.open("height-panel");
      lazyPanel.load();
    },
    update({
      lastAffected = panelState.lastAffected,
      lastHeight = panelState.lastHeight,
      lastDelta = panelState.lastDelta,
      lastNotice = panelState.lastNotice,
      fillPreview = panelState.fillPreview,
      transformPreview = panelState.transformPreview,
      globalToolPreview = panelState.globalToolPreview,
      terrainTemplatePreview = panelState.terrainTemplatePreview,
      terrainProgramPreview = panelState.terrainProgramPreview,
      seafloorResetPreview = panelState.seafloorResetPreview,
      terrainSelection = panelState.terrainSelection,
      terrainSelectionSaved = panelState.terrainSelectionSaved,
      terrainSelectionFeather = panelState.terrainSelectionFeather,
      terrainSelectionPaintState = panelState.terrainSelectionPaintState,
      useTerrainSelection = panelState.useTerrainSelection,
      graphWidth = panelState.graphWidth,
      graphHeight = panelState.graphHeight,
      currentHeightStats = panelState.currentHeightStats,
      currentHeightPreview = panelState.currentHeightPreview,
      derivedStaleSystems = panelState.derivedStaleSystems,
      history = panelState.history
    } = {}) {
      panelState.lastAffected = lastAffected;
      panelState.lastHeight = lastHeight;
      panelState.lastDelta = lastDelta;
      panelState.lastNotice = lastNotice;
      panelState.fillPreview = fillPreview ? {...fillPreview} : null;
      panelState.transformPreview = cloneTransformPreview(transformPreview);
      panelState.globalToolPreview = cloneTransformPreview(globalToolPreview);
      panelState.terrainTemplatePreview = cloneTransformPreview(terrainTemplatePreview);
      panelState.terrainProgramPreview = cloneTransformPreview(terrainProgramPreview);
      panelState.seafloorResetPreview = cloneTransformPreview(seafloorResetPreview);
      panelState.terrainSelection = cloneTerrainSelection(terrainSelection);
      panelState.terrainSelectionSaved = cloneTerrainSelection(terrainSelectionSaved);
      panelState.terrainSelectionFeather = Math.max(0, Math.min(8, Math.trunc(Number(terrainSelectionFeather) || 0)));
      panelState.terrainSelectionPaintState = terrainSelectionPaintState === "painting" ? "painting" : terrainSelectionPaintState === "pending" ? "pending" : null;
      panelState.useTerrainSelection = Boolean(useTerrainSelection && terrainSelection?.valid);
      panelState.graphWidth = graphWidth;
      panelState.graphHeight = graphHeight;
      panelState.currentHeightStats = currentHeightStats;
      panelState.currentHeightPreview = currentHeightPreview;
      panelState.derivedStaleSystems = Array.isArray(derivedStaleSystems) ? [...derivedStaleSystems] : [];
      panelState.history = history;
    },
    getBrush() {
      return {
        active: panelState.active,
        action: panelState.action,
        affectSeafloor: panelState.affectSeafloor,
        scope: panelState.scope,
        preserveSurface: panelState.preserveSurface,
        radius: normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, panelState.radius),
        strength: panelState.action === "level" ? panelState.levelPerturbation : panelState.strength,
        fillTolerance: panelState.fillTolerance,
        lineWidth: panelState.lineWidth,
        linePower: panelState.linePower,
        falloff: panelState.falloff
      };
    },
    persistBrushRadius(radius = panelState.radius) {
      const normalized = normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, radius);
      panelState.radius = normalized;
      return saveHeightEditorPreferences(documentRef, {radius: normalized});
    },
    getConditionalTransform() {
      return getConditionalTransform();
    },
    getConditionalTransformSnapshot() {
      return {
        ...getConditionalTransform(),
        preview: cloneTransformPreview(panelState.transformPreview)
      };
    },
    getGlobalToolPreview() {
      return cloneTransformPreview(panelState.globalToolPreview);
    },
    getTerrainTemplate() {
      return {
        templateId: panelState.terrainTemplateId,
        intensity: panelState.terrainTemplateIntensity,
        targetHeight: panelState.terrainTemplateTargetHeight,
        terraceStep: panelState.terrainTemplateTerraceStep,
        amplitude: panelState.terrainTemplateAmplitude
      };
    },
    getTerrainTemplatePreview() {
      return cloneTransformPreview(panelState.terrainTemplatePreview);
    },
    getTerrainProgram() {
      return structuredClone(selectedTerrainProgram());
    },
    addTerrainProgramStep,
    saveTerrainProgram,
    getTerrainProgramNotice() {
      return panelState.terrainProgramNotice;
    },
    getTerrainProgramPreview() {
      return cloneTransformPreview(panelState.terrainProgramPreview);
    },
    getSeafloorResetPreview() {
      return cloneTransformPreview(panelState.seafloorResetPreview);
    },
    getTerrainTemplateSnapshot() {
      return {
        templateId: panelState.terrainTemplateId,
        intensity: panelState.terrainTemplateIntensity,
        targetHeight: panelState.terrainTemplateTargetHeight,
        terraceStep: panelState.terrainTemplateTerraceStep,
        amplitude: panelState.terrainTemplateAmplitude,
        preview: cloneTransformPreview(panelState.terrainTemplatePreview)
      };
    },
    getTerrainSelectionSnapshot() {
      return {
        source: panelState.terrainSelectionSource,
        radius: normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT_SELECTION, panelState.terrainSelectionRadius),
        tolerance: panelState.terrainSelectionTolerance,
        selection: cloneTerrainSelection(panelState.terrainSelection),
        savedSelection: cloneTerrainSelection(panelState.terrainSelectionSaved),
        featherRings: panelState.terrainSelectionFeather,
        useForTools: Boolean(panelState.useTerrainSelection && panelState.terrainSelection?.valid)
      };
    },
    getTerrainSelectionRequest(operation = "replace") {
      return getTerrainSelectionRequest(operation);
    },
    updateFillPreview(fillPreview) {
      panelState.fillPreview = fillPreview ? {...fillPreview} : null;
    },
    updateConditionalTransformPreview(transformPreview) {
      panelState.transformPreview = cloneTransformPreview(transformPreview);
    },
    updateGlobalToolPreview(globalToolPreview) {
      panelState.globalToolPreview = cloneTransformPreview(globalToolPreview);
    },
    updateTerrainTemplatePreview(terrainTemplatePreview) {
      panelState.terrainTemplatePreview = cloneTransformPreview(terrainTemplatePreview);
    },
    updateTerrainProgramPreview(terrainProgramPreview) {
      panelState.terrainProgramPreview = cloneTransformPreview(terrainProgramPreview);
    },
    updateSeafloorResetPreview(seafloorResetPreview) {
      panelState.seafloorResetPreview = cloneTransformPreview(seafloorResetPreview);
    },
    updateTerrainSelection(terrainSelection, useForTools = panelState.useTerrainSelection) {
      panelState.terrainSelection = cloneTerrainSelection(terrainSelection);
      panelState.useTerrainSelection = Boolean(useForTools && terrainSelection?.valid);
    },
    updateTerrainSelectionSaved(terrainSelectionSaved) {
      panelState.terrainSelectionSaved = cloneTerrainSelection(terrainSelectionSaved);
    },
    updateTerrainSelectionFeather(terrainSelectionFeather) {
      panelState.terrainSelectionFeather = Math.max(0, Math.min(8, Math.trunc(Number(terrainSelectionFeather) || 0)));
    },
    setActive(active) {
      panelState.active = active;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function loadUserTerrainPrograms(documentRef) {
  try {
    const storage = documentRef.defaultView?.localStorage;
    if (!storage) return {templates: [], recycle: null, notice: ""};
    const document = loadHeightTerrainTemplateDocument(storage, HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY);
    let recycle = null;
    let recycleNotice = "";
    try {
      recycle = loadHeightTerrainTemplateRecycleRecord(storage);
    } catch (error) {
      recycleNotice = `；上次删除记录未恢复：${heightTerrainProgramFailureMessage(error)}`;
    }
    if (!document.templates.length) {
      return {
        templates: [],
        recycle,
        notice: recycle ? "可恢复上次删除的用户模板。" : recycleNotice.replace(/^；/, "")
      };
    }
    return {
      templates: document.templates,
      recycle,
      notice: `已恢复 ${document.templates.length} 个用户模板${recycle ? "，并可恢复上次删除" : ""}${recycleNotice}。`
    };
  } catch (error) {
    return {templates: [], recycle: null, notice: `用户模板未恢复：${heightTerrainProgramFailureMessage(error)}`};
  }
}

function loadHeightEditorPreferences(documentRef) {
  const defaultRadius = HEIGHT_RADIUS.defaultValue;
  try {
    const storage = documentRef.defaultView?.localStorage;
    const raw = storage?.getItem(HEIGHT_EDITOR_PREFERENCES_STORAGE_KEY);
    if (!raw) return {radius: defaultRadius};
    const parsed = JSON.parse(raw);
    return {radius: normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, parsed?.radius)};
  } catch {
    return {radius: defaultRadius};
  }
}

function saveHeightEditorPreferences(documentRef, patch) {
  try {
    const storage = documentRef.defaultView?.localStorage;
    if (!storage) return false;
    const current = loadHeightEditorPreferences(documentRef);
    storage.setItem(HEIGHT_EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify({
      radius: normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, patch?.radius ?? current.radius)
    }));
    return true;
  } catch {
    return false;
  }
}

function persistUserTerrainPrograms(documentRef, templates) {
  const storage = terrainProgramStorage(documentRef);
  const serialized = JSON.stringify(createHeightTerrainTemplateDocument(templates));
  try {
    storage.setItem(HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY, serialized);
  } catch (cause) {
    throw createTerrainProgramStorageError(cause);
  }
}

function terrainProgramStorage(documentRef) {
  try {
    const storage = documentRef.defaultView?.localStorage;
    if (storage) return storage;
  } catch (cause) {
    throw createTerrainProgramStorageError(cause);
  }
  throw createTerrainProgramStorageError();
}

function createTerrainProgramStorageError(cause) {
  const error = new Error(HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE, cause ? {cause} : undefined);
  error.code = HEIGHT_TERRAIN_PROGRAM_STORAGE_ERROR_CODE;
  error.diagnostic = Object.freeze({
    backend: "localStorage",
    causeName: String(cause?.name || ""),
    causeMessage: String(cause?.message || "")
  });
  return error;
}

export function heightTerrainProgramFailureMessage(error, {debug = false} = {}) {
  const raw = String(error?.message || error || "").trim();
  if (debug) return raw || HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE;
  const technical = `${String(error?.name || "")} ${String(error?.code || "")} ${raw}`;
  if (error?.code === HEIGHT_TERRAIN_PROGRAM_STORAGE_ERROR_CODE
    || /localstorage|indexeddb|\bstorage\b|quotaexceedederror|securityerror/iu.test(technical)) {
    return HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE;
  }
  return raw || "用户模板操作失败，请检查输入后重试。";
}

function restoreStorageValue(storage, key, value) {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

function userTemplateId(name) {
  const slug = String(name || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `user-${slug || "terrain-template"}`;
}

function cloneTransformPreview(preview) {
  if (!preview) return null;
  return {
    ...preview,
    rendererPreview: preview.rendererPreview ? {...preview.rendererPreview} : null
  };
}

function cloneTerrainSelection(selection) {
  if (!selection) return null;
  return {
    ...selection,
    heightRange: Array.isArray(selection.heightRange) ? [...selection.heightRange] : null,
    bounds: selection.bounds ? {...selection.bounds} : null,
    feather: selection.feather ? {...selection.feather, weightRange: Array.isArray(selection.feather.weightRange) ? [...selection.feather.weightRange] : null} : null,
    rendererSelection: selection.rendererSelection ? {...selection.rendererSelection} : null
  };
}
