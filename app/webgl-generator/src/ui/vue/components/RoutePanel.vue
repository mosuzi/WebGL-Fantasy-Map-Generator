<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="route-panel-summary" />

  <div class="route-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选类型 / id / 起点 / 终点" @update:model-value="callbacks.onFilter" />
  </div>
  <UiRegenerationLockActions v-bind="regenerationLocks.actionProps" v-on="regenerationLocks.actionListeners" />
  <UiObjectTable
    v-bind="regenerationLocks.tableProps"
    v-on="regenerationLocks.tableListeners"
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="state.selectedRouteId"
    empty-text="没有匹配的路线"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedRouteIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedRouteIds = $event"
  />

  <UiPanelIoActions
    class-name="route-panel-list-actions"
    label="路线列表操作"
    :actions="routeListActions"
    @action="handleRouteAction"
  />

  <UiStateBanner
    v-if="regenerationStatus !== 'idle'"
    id="route-regeneration-status"
    :data-route-regeneration-state="regenerationStatus"
    :kind="regenerationBannerKind"
    :title="regenerationBannerTitle"
    :message="regenerationMessage"
  />

  <UiDetailGrid class-name="route-panel-details" empty-text="未选中路线" :rows="detailRows" />

  <UiActionDock v-if="selected" host-id="RoutePanel" v-model:active="activeAction" :actions="routeActions">
    <template #edit>
      <div v-if="state.editDraft" class="route-edit-form">
        <UiSelectField
          input-id="route-edit-type"
          label="路线类型"
          :model-value="state.editDraft.type"
          :options="routeTypeOptions"
          @update:model-value="value => callbacks.onEditDraft({type: value})"
        />
        <UiSelectField
          input-id="route-edit-level"
          label="路线等级"
          :model-value="state.editDraft.level"
          :options="routeLevelOptions"
          @update:model-value="value => callbacks.onEditDraft({level: value})"
        />
        <UiSelectField
          input-id="route-edit-from"
          label="起点城市"
          :model-value="state.editDraft.fromId"
          :options="cityEndpointOptions"
          :disabled="state.editDraft.type === 'searoute'"
          @update:model-value="value => callbacks.onEditDraft({fromId: value})"
        />
        <UiSelectField
          input-id="route-edit-to"
          label="终点城市"
          :model-value="state.editDraft.toId"
          :options="cityEndpointOptions"
          :disabled="state.editDraft.type === 'searoute'"
          @update:model-value="value => callbacks.onEditDraft({toId: value})"
        />
        <div class="route-edit-waypoint-actions">
          <UiButton variant="secondary" :active="state.waypointMode" @click="callbacks.onWaypointMode(!state.waypointMode)">
            {{ state.waypointMode ? "取消选择改线点" : "在地图选择改线点" }}
          </UiButton>
          <UiButton v-if="state.editDraft.viaPackCells?.length" variant="secondary" @click="callbacks.onEditDraft({viaPackCells: []})">清除改线点</UiButton>
        </div>
        <UiStateBanner
          :kind="state.editPreview?.valid ? 'preview' : 'error'"
          title="路线修改影响"
          :message="routeEditPreviewMessage"
          :action-label="state.editPreview?.valid && state.editPreview?.changed ? '应用路线修改' : ''"
          secondary-action-label="取消"
          @action="handleRouteEditApply"
          @secondary-action="handleRouteEditCancel"
        />
      </div>
    </template>
    <template #note>
      <UiNoteField
        class-name="route-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiRegenerationLockActions from "./base/UiRegenerationLockActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiStateBanner from "./base/UiStateBanner.vue";
import {formatDistance, formatNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {regenerationFeedbackMessage, regenerationLoadingMessage} from "../../regeneration-user-copy.js";
import {normalizeRouteRegenerationError, normalizeRouteRegenerationResponse, routeTopologySummary} from "../../route-regeneration-state.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {useRegenerationLockSelection} from "../composables/use-regeneration-lock-selection.js";

defineOptions({
  name: "RoutePanel"
});

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  callbacks: {
    type: Object,
    default: () => ({})
  }
});

const sortOptions = Object.freeze([
  {key: "length", label: "长度"},
  {key: "segments", label: "段数"},
  {key: "resourceCells", label: "资源"},
  {key: "type", label: "类型"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "typeLabel", label: "类型"},
  {key: "fromName", label: "起点"},
  {key: "toName", label: "终点"},
  {key: "resourceCells", label: "资源", align: "right", format: value => formatNumberValue(value)},
  {key: "length", label: "长度", align: "right", format: value => formatRouteLength(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const routeActions = Object.freeze([
  {key: "edit", resultClass: "open-secondary", label: "编辑路线", icon: "✎"},
  {key: "note", resultClass: "open-secondary", label: "编辑备注", icon: "☰"}
]);
const rows = computed(() => {
  props.state.version;
  return routeRows(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const regenerationLocks = useRegenerationLockSelection({panelId: "route-panel", kind: "route", rows: visibleRows});
const {selectedRowIds: selectedRouteIds} = useVisibleRowSelection(visibleRows);
const selectedRouteRows = regenerationLocks.selectedRows;
const selected = computed(() => findByObjectId(rows.value, props.state.selectedRouteId));
const regenerationPending = ref(false);
const runtimeOperationBusy = ref(false);
const regenerationStatus = ref("idle");
const regenerationMessage = ref("");
let regenerationRequestId = 0;
const regenerationActionBusy = computed(() => regenerationPending.value || runtimeOperationBusy.value);
const regenerationBannerKind = computed(() => regenerationStatus.value === "failure" ? "error" : regenerationStatus.value === "pending" ? "preview" : "success");
const regenerationBannerTitle = computed(() => regenerationStatus.value === "failure" ? "道路重算失败" : regenerationStatus.value === "pending" ? "正在重算道路" : "道路重算完成");
const routeTypeOptions = Object.freeze([
  {value: "road", label: "道路"},
  {value: "trail", label: "小径"},
  {value: "searoute", label: "海路"}
]);
const routeLevelOptions = Object.freeze([
  {value: "primary", label: "主要"},
  {value: "secondary", label: "次要"},
  {value: "minor", label: "支线"},
  {value: "trail", label: "小径"}
]);
const cityEndpointOptions = computed(() => [
  {value: -1, label: "无城市端点"},
  ...(props.state.map?.settlements?.cities || [])
    .filter(city => city && !city.removed && Number.isInteger(city.id))
    .map(city => ({value: city.id, label: `${city.name || `城市 #${city.id}`}（#${city.id}）`}))
]);
const routeEditPreviewMessage = computed(() => {
  const preview = props.state.editPreview;
  if (!preview) return "调整字段或在地图选择一个改线点。";
  if (!preview.valid) return `${preview.code || "invalid"}：${preview.reason || "路线修改无效"}`;
  const waypoint = props.state.editDraft?.viaPackCells?.[0];
  return `${preview.changed ? "可以应用" : "没有变化"}；经过 ${formatNumberValue(preview.cells)} 个区域；${formatRouteLength(preview.distance)}${Number.isInteger(waypoint) ? `；途经位置 #${waypoint}` : ""}`;
});
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const routeListActions = computed(() => [
  {key: "create", label: props.state.createMode ? "取消绘制路线" : "绘制路线", icon: "+", active: props.state.createMode},
  {key: "highlight-selected", label: `高亮选中 ${formatNumberValue(selectedRouteRows.value.length)}`, icon: "◉", disabled: !selectedRouteRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumberValue(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "delete-selected", label: `批量删除选中 ${formatNumberValue(selectedRouteRows.value.length)}`, icon: "删", disabled: !selectedRouteRows.value.length},
  {key: "delete", label: "删除路线", icon: "×", disabled: !selected.value},
  {key: "regenerate", label: "重算道路", icon: "↻", disabled: regenerationActionBusy.value}
]);
const totalLength = computed(() => rows.value.reduce((sum, row) => sum + row.length, 0));

const summaryMetrics = computed(() => [
  {label: "路线", value: formatNumberValue(rows.value.length)},
  {label: "筛选", value: formatNumberValue(visibleRows.value.length)},
  {label: "高亮", value: formatNumberValue(props.state.highlightCount || 0)},
  {label: "总长度", value: formatRouteLength(totalLength.value)},
  {label: "资源路线", value: formatNumberValue(rows.value.filter(row => row.resourceCells > 0).length)},
  {label: "海路", value: formatNumberValue(rows.value.filter(row => row.type === "searoute").length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.typeLabel},
  {label: "等级", value: selected.value.level},
  {label: "起点", value: selected.value.fromName},
  {label: "终点", value: selected.value.toName},
  {label: "长度", value: formatRouteLength(selected.value.length)},
  {label: "段数", value: formatNumberValue(selected.value.segments)},
  {label: "资源区域", value: formatNumberValue(selected.value.resourceCells)},
  {label: "资源种类", value: selected.value.resourceGoodNames || "无"},
  {label: "grid cells", value: formatNumberValue(selected.value.cellCount), debug: true},
  {label: "pack cells", value: formatNumberValue(selected.value.packCellCount), debug: true},
  {label: "feature", value: selected.value.feature, debug: true},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumberValue(selected.value.noteBody.length)}字）` : "无"}
] : []);

watch(() => selected.value?.id, () => {
  activeAction.value = null;
});

watch(activeAction, (next, previous) => {
  if (next === "edit" && selected.value) props.callbacks.onEditStart?.(selected.value.id);
  else if (previous === "edit") props.callbacks.onEditCancel?.();
});

watch(() => props.state.editRequestId, requestId => {
  if (requestId > 0 && selected.value) activeAction.value = "edit";
}, {immediate: true});

onMounted(() => {
  const snapshot = globalThis.window?.__webglGeneratorApp?.runtimeOperationSnapshot;
  runtimeOperationBusy.value = Boolean(snapshot?.busy);
  globalThis.document?.addEventListener("webgl-generator-runtime-operation", handleRuntimeOperationChanged);
});

onBeforeUnmount(() => {
  regenerationRequestId++;
  globalThis.document?.removeEventListener("webgl-generator-runtime-operation", handleRuntimeOperationChanged);
});

function handleRouteEditApply() {
  if (!props.state.editPreview?.valid || !props.state.editPreview?.changed) return;
  const result = props.callbacks.onEditApply?.();
  if (result?.executed) activeAction.value = null;
}

function handleRouteEditCancel() {
  activeAction.value = null;
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function routeRows(map) {
  return (map?.settlements?.routes || []).map(route => {
    const from = map?.settlements?.cities?.[route.from];
    const to = map?.settlements?.cities?.[route.to];
    const note = readObjectNote(map, {kind: "route", id: route.id});
    return {
      id: route.id,
      type: route.type || "route",
      typeLabel: routeTypeLabel(route.type),
      level: route.level || route.type || "none",
      fromId: route.from,
      toId: route.to,
      fromName: from?.name || (route.from >= 0 ? `#${route.from}` : "unknown"),
      toName: to?.name || (route.to >= 0 ? `#${route.to}` : "unknown"),
      length: routeLength(route),
      segments: Math.max(0, (route.points || []).length - 1),
      resourceCells: Number(route.resourceCells || 0),
      markerResourceCells: Number(route.markerResourceCells || 0),
      resourceGoodNames: routeResourceGoodNames(map, route),
      cellCount: route.cells?.length || 0,
      packCellCount: route.packCells?.length || 0,
      feature: route.feature ?? "none",
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || ""
    };
  });
}

function routeResourceGoodNames(map, route) {
  const ids = route.resourceGoodIds || [];
  if (!ids.length) return "";
  return ids
    .map(id => map?.economy?.goods?.[id]?.name || map?.pack?.goods?.[id]?.name || `#${id}`)
    .slice(0, 5)
    .join("、");
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    String(row.id).includes(query)
    || row.typeLabel.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
    || row.fromName.toLowerCase().includes(query)
    || row.toName.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleRouteAction(key) {
  if (key === "create") props.callbacks.onCreateMode?.(!props.state.createMode);
  if (key === "highlight-selected") props.callbacks.onHighlight?.(selectedRouteRows.value);
  if (key === "clear-highlights") props.callbacks.onClearHighlights?.();
  if (key === "regenerate") {
    void handleRouteRegeneration();
    return;
  }
  if (key === "delete-selected") props.callbacks.onDeleteMany?.(selectedRouteRows.value.map(row => row.id));
  if (!selected.value) return;
  if (key === "locate") props.callbacks.onLocate?.(selected.value);
  if (key === "delete") props.callbacks.onDelete?.(selected.value);
}

async function handleRouteRegeneration() {
  if (regenerationActionBusy.value) {
    settleRegenerationFailure({code: "operation_busy", message: "当前还有操作正在进行，请稍后再试。"});
    return;
  }
  const regenerate = props.callbacks.onRegenerateRoutes;
  if (typeof regenerate !== "function") {
    settleRegenerationFailure({code: "operation_failed", message: "道路重算服务尚未就绪。"});
    return;
  }
  const requestId = ++regenerationRequestId;
  const before = routeTopologySummary(props.state.map);
  regenerationPending.value = true;
  regenerationStatus.value = "pending";
  regenerationMessage.value = regenerationLoadingMessage("routes", "initial");
  try {
    const response = normalizeRouteRegenerationResponse(await regenerate());
    if (requestId !== regenerationRequestId) return;
    if (!response.ok) {
      settleRegenerationFailure(response.error, requestId);
      return;
    }
    const after = routeTopologySummary(props.state.map);
    regenerationStatus.value = "success";
    regenerationMessage.value = `${regenerationFeedbackMessage("routes", response, {debug: debugModeEnabled()})}${routeTopologyTransition(before, after)}${response.data?.executed === false ? "" : "；可以撤销。"}`;
  } catch (error) {
    settleRegenerationFailure(error, requestId);
  } finally {
    if (requestId === regenerationRequestId) regenerationPending.value = false;
  }
}

function settleRegenerationFailure(error, requestId = regenerationRequestId) {
  if (requestId !== regenerationRequestId) return;
  regenerationStatus.value = "failure";
  regenerationMessage.value = regenerationFeedbackMessage("routes", {
    ok: false,
    error: normalizeRouteRegenerationError(error)
  }, {debug: debugModeEnabled()});
  regenerationPending.value = false;
}

function handleRuntimeOperationChanged(event) {
  runtimeOperationBusy.value = Boolean(event?.detail?.busy);
}

function routeTopologyTransition(before, after) {
  return `（${formatNumberValue(before.routes)} 条 / ${formatNumberValue(before.segments)} 段 → ${formatNumberValue(after.routes)} 条 / ${formatNumberValue(after.segments)} 段）`;
}

function debugModeEnabled() {
  return Boolean(globalThis.window?.__webglGeneratorDebug?.enabled);
}

function routeLength(route) {
  let length = 0;
  const points = route.points || [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}

function routeTypeLabel(type) {
  if (type === "road") return "道路";
  if (type === "trail") return "小径";
  if (type === "searoute") return "海路";
  return type || "路线";
}

function formatRouteLength(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatNumberValue(value) {
  return formatNumber(value, unitPreferences.value);
}
</script>
