import {reactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius, readBrushRadiusContract} from "../../runtime/brush-radius-contract.js";
import {
  createHeightTerrainTemplateDocument,
  HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS,
  HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY,
  loadHeightTerrainTemplateDocument,
  normalizeHeightTerrainTemplateProgram,
  parseHeightTerrainTemplateDocument,
  saveHeightTerrainTemplateDocument,
  stringifyHeightTerrainTemplateDocument
} from "../../runtime/height-terrain-template-programs.js";

const HEIGHT_RADIUS = readBrushRadiusContract(BRUSH_RADIUS_ID.HEIGHT);
const HEIGHT_SELECTION_RADIUS = readBrushRadiusContract(BRUSH_RADIUS_ID.HEIGHT_SELECTION);

export function createHeightPanel(documentRef, manager, callbacks = {}) {
  const loadedPrograms = loadUserTerrainPrograms(documentRef);
  const panelState = reactive({
    active: false,
    action: "raise",
    scope: "land",
    preserveSurface: true,
    radius: HEIGHT_RADIUS.defaultValue,
    strength: 4,
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
    terrainProgramNotice: loadedPrograms.notice,
    terrainSelectionSource: "height-band",
    terrainSelectionRadius: HEIGHT_SELECTION_RADIUS.defaultValue,
    terrainSelectionTolerance: 6,
    terrainSelection: null,
    terrainSelectionSaved: null,
    terrainSelectionFeather: 0,
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
    onBrushRadiusChange: () => callbacks.onBrushRadiusChange?.(),
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
    onRegenerateDownstream: () => callbacks.onRegenerateDownstream?.()
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
      loading: "正在加载高度编辑...",
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
      userTerrainPrograms = [...userTerrainPrograms, template];
      persistUserTerrainPrograms(documentRef, userTerrainPrograms);
      panelState.terrainProgramId = template.id;
      panelState.terrainProgramDraftSteps = [];
      panelState.terrainProgramNotice = `已保存用户模板“${template.name}”。`;
      refreshTerrainProgramOptions();
      clearTerrainProgramPreview();
      return {ok: true, template};
    } catch (error) {
      panelState.terrainProgramNotice = error.message;
      return {ok: false, error: error.message};
    }
  }

  function deleteSelectedTerrainProgram() {
    const selected = userTerrainPrograms.find(template => template.id === panelState.terrainProgramId);
    if (!selected) {
      panelState.terrainProgramNotice = "内置模板不能删除。";
      return false;
    }
    try {
      const nextPrograms = userTerrainPrograms.filter(template => template.id !== selected.id);
      persistUserTerrainPrograms(documentRef, nextPrograms);
      userTerrainPrograms = nextPrograms;
      panelState.terrainProgramId = HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS[0].id;
      panelState.terrainProgramNotice = `已删除用户模板“${selected.name}”。`;
      refreshTerrainProgramOptions();
      clearTerrainProgramPreview();
      return true;
    } catch (error) {
      panelState.terrainProgramNotice = error.message;
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
      panelState.terrainProgramNotice = error.message;
      return {ok: false, error: error.message};
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
      panelState.terrainProgramNotice = error.message;
      return {ok: false, error: error.message};
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
        scope: panelState.scope,
        preserveSurface: panelState.preserveSurface,
        radius: normalizeBrushRadius(BRUSH_RADIUS_ID.HEIGHT, panelState.radius),
        strength: panelState.strength,
        fillTolerance: panelState.fillTolerance,
        lineWidth: panelState.lineWidth,
        linePower: panelState.linePower,
        falloff: panelState.falloff
      };
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
    if (!storage) return {templates: [], notice: ""};
    const document = loadHeightTerrainTemplateDocument(storage, HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY);
    if (!document.templates.length) return {templates: [], notice: ""};
    return {templates: document.templates, notice: `已恢复 ${document.templates.length} 个用户模板。`};
  } catch (error) {
    return {templates: [], notice: `用户模板未恢复：${error.message}`};
  }
}

function persistUserTerrainPrograms(documentRef, templates) {
  const storage = documentRef.defaultView?.localStorage;
  if (!storage) throw new Error("当前浏览器不支持 LocalStorage，无法保存用户模板。");
  saveHeightTerrainTemplateDocument(storage, templates, HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY);
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
