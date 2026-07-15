<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="diplomacy-panel-summary" />

  <div class="diplomacy-panel-controls">
    <UiSelectField
      input-id="diplomacy-subject-select"
      class-name="diplomacy-subject-select"
      label="主体"
      :model-value="selectedSubjectId"
      :options="stateOptions"
      @update:model-value="value => callbacks.onSubjectChange(Number(value))"
    />
    <UiFilterInput :model-value="state.filter" placeholder="筛选国家 / id / 关系 / 文化 / 宗教" @update:model-value="callbacks.onFilter" />
  </div>

  <div class="diplomacy-edit-toolbar">
    <UiButton id="diplomacy-show-theme" variant="secondary" @click="callbacks.onShowTheme?.(selectedSubjectId)">外交着色</UiButton>
    <UiButton variant="secondary" @click="callbacks.onRegenerate?.()">重生成外交</UiButton>
  </div>

  <div ref="matrixWrap" class="diplomacy-matrix-wrap">
    <table id="diplomacy-matrix-table" class="diplomacy-matrix-table">
      <thead>
        <tr>
          <th>国家</th>
          <th v-for="stateRow in matrix.states" :key="stateRow.id" :title="stateRow.name">#{{ stateRow.id }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in matrix.rows" :key="row.id">
          <th :title="row.name">{{ row.shortName }}</th>
          <td
            v-for="cell in row.cells"
            :key="`${row.id}:${cell.id}`"
            :class="{selected: sameObjectId(row.id, selectedSubjectId) && sameObjectId(cell.id, state.selectedObjectId), self: cell.self}"
            :style="{backgroundColor: cell.color, color: cell.textColor}"
            :title="cell.title"
            @click="!cell.self && callbacks.onMatrixCell?.(row.id, cell.id)"
          >
            {{ cell.shortLabel }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <UiObjectTable
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="state.selectedObjectId"
    empty-text="没有匹配的外交关系"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedRelationIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedRelationIds = $event"
  />

  <UiPanelIoActions
    class-name="diplomacy-panel-export-actions"
    label="外交列表操作"
    :export-actions="diplomacyExportActions"
    :actions="diplomacyHighlightActions"
    @export="handleDiplomacyExport"
    @action="handleDiplomacyHighlightAction"
  />

  <UiDetailGrid class-name="diplomacy-panel-details" empty-text="未选中外交对象" :rows="detailRows" />

  <section v-if="diplomacyChronicleRows.length" class="diplomacy-history-preview" aria-label="外交历史">
    <div class="diplomacy-history-heading">
      <strong>外交历史</strong>
      <span>{{ relationHistoryLabel }}</span>
    </div>
    <UiSelectField
      input-id="diplomacy-history-filter"
      class-name="diplomacy-history-filter"
      label="范围"
      :model-value="historyFilterMode"
      :options="historyFilterOptions"
      @update:model-value="callbacks.onHistoryScope"
    />
    <ol v-if="relationHistoryPreview.length">
      <li v-for="entry in relationHistoryPreview" :key="`${entry.index}:${entry.type}:${entry.text}`">
        <strong>{{ entry.type }}</strong>
        <span>{{ entry.text }}</span>
      </li>
    </ol>
    <p v-else class="diplomacy-history-empty">当前范围暂无外交历史。</p>
  </section>

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="diplomacyActions">
    <template #openState>
      <div class="diplomacy-open-state-panel">
        <p>{{ selected.name }}</p>
        <UiButton variant="secondary" @click="callbacks.onOpenState?.(selected)">打开国家面板</UiButton>
      </div>
    </template>
    <template #relation>
      <div class="diplomacy-relation-panel">
        <div class="diplomacy-relation-heading">
          <strong>{{ selected.subjectName }}</strong>
          <span>调整对 {{ selected.name }} 的外交关系</span>
        </div>
        <div class="diplomacy-relation-context">
          <span v-for="item in relationContextMetrics" :key="item.label">
            <small>{{ item.label }}</small>
            <b>{{ item.value }}</b>
          </span>
        </div>
        <UiSelectField
          input-id="diplomacy-relation-select"
          class-name="diplomacy-relation-select"
          label="关系"
          :model-value="selected.relation"
          :options="relationOptions"
          @update:model-value="relation => applyRelationChange(relation)"
        />
        <label class="diplomacy-relation-reason">
          <span>说明</span>
          <textarea
            v-model="relationReasonDraft"
            maxlength="80"
            rows="2"
            placeholder="可选，例如边境谈判、贸易让步、宗教摩擦"
          />
        </label>
        <div class="diplomacy-relation-safety" aria-label="关系变更影响">
          <span v-for="item in relationSafetyRows" :key="item.label">
            <small>{{ item.label }}</small>
            <b>{{ item.value }}</b>
          </span>
        </div>
        <p class="diplomacy-relation-note">选择后会立即写入当前关系并进入撤销记录；说明会进入外交历史，不会触发军事行动。</p>
      </div>
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {DIPLOMACY_RELATION_OPTIONS, DIPLOMACY_RELATIONS} from "../../../generator/diplomacy.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId, sameObjectId, toIntegerId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {createSelectionCenterController, selectionCenterAnchor, selectionOrderSignature} from "../../components/selection-scroll.js";

defineOptions({
  name: "DiplomacyPanel"
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
  {key: "relationWeight", label: "关系"},
  {key: "tradeWeight", label: "贸易"},
  {key: "powerScore", label: "国力"},
  {key: "population", label: "人口"},
  {key: "neighborRank", label: "邻接"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "国家"},
  {key: "relationLabel", label: "关系"},
  {key: "tradeLabel", label: "贸易"},
  {key: "powerScore", label: "国力", align: "right", format: value => formatNumber(value)},
  {key: "neighborLabel", label: "邻接"},
  {key: "cultureName", label: "文化"}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const matrixWrap = ref(null);
const relationReasonDraft = ref("");
const relationOptions = DIPLOMACY_RELATION_OPTIONS;
const historyFilterOptions = Object.freeze([
  {value: "selected", label: "当前关系"},
  {value: "subject", label: "主体国家"},
  {value: "all", label: "全部历史"}
]);
const metrics = computed(() => {
  props.state.version;
  return buildDiplomacyMetrics(props.state.map, props.state.selectedStateId);
});
const stateOptions = computed(() => metrics.value.states.map(state => ({value: state.id, label: state.name})));
const selectedSubjectId = computed(() => toIntegerId(props.state.selectedStateId) ?? stateOptions.value[0]?.value ?? null);
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const {selectedRowIds: selectedRelationIds, selectedRows: selectedRelationRows} = useVisibleRowSelection(visibleRows);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const diplomacyExportActions = computed(() => [
  {key: "csv", label: "导出 CSV", disabled: !visibleRows.value.length},
  {key: "json", label: "导出 JSON", disabled: !visibleRows.value.length},
  {key: "selected-csv", label: `导出选中 CSV ${formatNumber(selectedRelationRows.value.length)}`, disabled: !selectedRelationRows.value.length},
  {key: "selected-json", label: `导出选中 JSON ${formatNumber(selectedRelationRows.value.length)}`, disabled: !selectedRelationRows.value.length}
]);
const diplomacyHighlightActions = computed(() => [
  {key: "highlight-selected", label: `高亮关系 ${formatNumber(selectedRelationRows.value.length)}`, icon: "⇄", disabled: !selectedRelationRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount}
]);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedObjectId) || visibleRows.value[0] || null);
const matrix = computed(() => {
  props.state.version;
  return buildDiplomacyMatrix(props.state.map);
});
const matrixSubjectPosition = computed(() => matrix.value.rows.findIndex(row => sameObjectId(row.id, selectedSubjectId.value)));
const matrixSelectionAnchor = computed(() => {
  const orderSignature = selectionOrderSignature(matrix.value.rows.map(row => row.id));
  const subjectAnchor = selectionCenterAnchor(selectedSubjectId.value, matrixSubjectPosition.value, orderSignature);
  if (!subjectAnchor || props.state.selectedObjectId === null || props.state.selectedObjectId === undefined) return subjectAnchor;
  return `${subjectAnchor}:${String(props.state.selectedObjectId)}`;
});
const matrixCenterController = createSelectionCenterController({
  getScroller: () => matrixWrap.value,
  getTarget: () => matrixWrap.value?.querySelector("td.selected")
});
const diplomacyActions = Object.freeze([
  {key: "openState", label: "打开国家", icon: "◎"},
  {key: "relation", label: "调整关系", icon: "⇄"}
]);

watch(matrixSelectionAnchor, () => {
  if (matrixSubjectPosition.value < 0) return;
  nextTick(() => matrixCenterController.request());
}, {flush: "post"});

onMounted(() => {
  if (matrixSubjectPosition.value >= 0) nextTick(() => matrixCenterController.request());
});

onBeforeUnmount(() => matrixCenterController.cancel());

const summaryMetrics = computed(() => [
  {label: "主体", value: metrics.value.subjectName},
  {label: "关系", value: formatNumber(metrics.value.rows.length)},
  {label: "盟友", value: formatNumber(metrics.value.counts.Ally || 0)},
  {label: "宿敌", value: formatNumber(metrics.value.counts.Rival || 0)},
  {label: "战争", value: formatNumber(metrics.value.counts.Enemy || 0)},
  {label: "附庸", value: formatNumber(metrics.value.counts.Vassal || 0)},
  {label: "已选", value: formatNumber(selectedRelationRows.value.length)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "历史", value: formatNumber(metrics.value.history)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "主体国家", value: selected.value.subjectName},
  {label: "对象国家", value: selected.value.name},
  {label: "关系", value: selected.value.relationLabel},
  {label: "文化", value: selected.value.cultureName},
  {label: "宗教", value: selected.value.religionName},
  {label: "邻接", value: selected.value.neighborLabel},
  {label: "贸易方向", value: selected.value.tradeLabel},
  {label: "贸易额", value: formatNumber(selected.value.tradeValue)},
  {label: "贸易量", value: formatNumber(selected.value.tradeUnits)},
  {label: "交易数", value: formatNumber(selected.value.tradeDeals)},
  {label: "净流向", value: selected.value.tradeBalanceLabel},
  {label: "国力", value: formatNumber(selected.value.powerScore)},
  {label: "经济力", value: formatNumber(selected.value.economicPower)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "城镇", value: formatNumber(selected.value.burgs)}
] : []);
const relationContextMetrics = computed(() => selected.value ? [
  {label: "当前关系", value: selected.value.relationLabel},
  {label: "关系倾向", value: relationPolarityLabel(selected.value.relationPolarity)},
  {label: "邻接", value: selected.value.neighborLabel},
  {label: "直接贸易", value: selected.value.tradeLabel},
  {label: "国力", value: formatNumber(selected.value.powerScore)},
  {label: "文化/宗教", value: `${selected.value.cultureName} / ${selected.value.religionName}`}
] : []);
const relationSafetyRows = computed(() => selected.value ? [
  {label: "提交方式", value: "选择即提交，可撤销"},
  {label: "写入范围", value: "外交矩阵 / 历史"},
  {label: "战争选项", value: "只记录外交状态"},
  {label: "说明写入", value: relationReasonDraft.value.trim() || "手动关系编辑"}
] : []);
const diplomacyChronicleRows = computed(() => {
  props.state.version;
  return diplomacyChronicle(props.state.map);
});
const subjectHistoryRows = computed(() => {
  if (!selected.value) return [];
  const subjectAliases = [selected.value.subjectName, selected.value.subjectRawName].filter(Boolean);
  return diplomacyChronicleRows.value.filter(entry => includesAny(entry.text, subjectAliases));
});
const relationHistoryRows = computed(() => {
  if (!selected.value) return [];
  const subjectAliases = [selected.value.subjectName, selected.value.subjectRawName].filter(Boolean);
  const objectAliases = [selected.value.name, selected.value.rawName].filter(Boolean);
  return diplomacyChronicleRows.value.filter(entry => includesAny(entry.text, subjectAliases) && includesAny(entry.text, objectAliases));
});
const filteredHistoryRows = computed(() => {
  if (historyFilterMode.value === "all") return diplomacyChronicleRows.value;
  if (historyFilterMode.value === "subject") return subjectHistoryRows.value;
  return relationHistoryRows.value;
});
const relationHistoryPreview = computed(() => {
  return filteredHistoryRows.value.slice(-4).reverse();
});
const relationHistoryLabel = computed(() => {
  const total = diplomacyChronicleRows.value.length;
  if (historyFilterMode.value === "all") return `全部 ${formatNumber(total)}`;
  if (historyFilterMode.value === "subject") return `主体 ${formatNumber(subjectHistoryRows.value.length)} / 全部 ${formatNumber(total)}`;
  return `当前关系 ${formatNumber(relationHistoryRows.value.length)} / 全部 ${formatNumber(total)}`;
});
const historyFilterMode = computed(() => {
  const mode = props.state.historyScope;
  return mode === "subject" || mode === "all" ? mode : "selected";
});

watch(() => selected.value?.id, () => {
  activeAction.value = null;
  relationReasonDraft.value = "";
});

watch(selectedSubjectId, () => {
  selectedRelationIds.value = [];
});

function applyRelationChange(relation) {
  const row = selected.value;
  if (!row) return;
  props.callbacks.onRelationChange?.(row.subjectId, row.id, relation, relationReasonDraft.value);
}

function buildDiplomacyMetrics(map, selectedStateId) {
  const states = stateRows(map);
  const subject = states.find(state => sameObjectId(state.id, selectedStateId)) || states[0] || null;
  if (!subject) return {states, subjectName: "none", rows: [], counts: {}, history: 0};
  const tradeContext = buildDiplomacyTradeContext(map);

  const rows = states
    .filter(state => state.id !== subject.id)
    .map(state => {
      const stateItem = map?.politics?.states?.[state.id] || map?.pack?.states?.[state.id];
      const relation = normalizeRelation(subject.state.diplomacy?.[state.id]);
      const population = Number(stateItem?.rural || 0) + Number(stateItem?.urban || 0);
      const neighbor = (subject.state.neighbors || []).includes(state.id);
      const trade = tradeContext.get(pairKey(subject.id, state.id)) || emptyTradeSummary();
      const subjectOutValue = trade.outByState.get(subject.id) || 0;
      const subjectInValue = trade.inByState.get(subject.id) || 0;
      const tradeBalance = subjectInValue - subjectOutValue;
      return {
        id: state.id,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectRawName: subject.state?.name || subject.name,
        name: state.name,
        rawName: stateItem?.name || state.name,
        relation,
        relationLabel: relationLabel(relation),
        relationPolarity: Number(DIPLOMACY_RELATIONS[relation]?.polarity || 0),
        relationWeight: relationWeight(relation),
        relationColor: DIPLOMACY_RELATIONS[relation]?.color || "#9ca3a8",
        cultureName: indexedName(map?.society?.cultures, stateItem?.culture),
        religionName: indexedName(map?.society?.religions, stateItem?.religion),
        governmentName: stateItem?.governmentLabel || stateItem?.government?.label || stateItem?.form || "未知政体",
        tradeDeals: trade.deals,
        tradeValue: trade.value,
        tradeUnits: trade.units,
        tradeWeight: trade.value || trade.units,
        tradeSubjectInValue: subjectInValue,
        tradeSubjectOutValue: subjectOutValue,
        tradeBalance,
        tradeLabel: trade.deals ? `${formatNumber(trade.deals)} 笔 / ${formatNumber(trade.units)} 量 / ${formatNumber(trade.value)} 额` : "无直接交易",
        tradeBalanceLabel: trade.deals ? tradeBalanceLabel(tradeBalance) : "无",
        neighborRank: neighbor ? 1 : 0,
        neighborLabel: neighbor ? "邻国" : "远方",
        centerCell: stateItem?.center ?? "none",
        area: Number(stateItem?.area || stateItem?.cells || 0),
        burgs: Number(stateItem?.burgs || 0),
        population,
        economicPower: Number(stateItem?.economicPower || 0),
        powerScore: Number(stateItem?.powerScore || 0)
      };
    });
  const counts = {};
  for (const row of rows) counts[row.relation] = (counts[row.relation] || 0) + 1;

  return {
    states,
    subjectName: subject.name,
    rows,
    counts,
    history: map?.diplomacy?.metadata?.chronicle ?? map?.pack?.states?.[0]?.diplomacy?.length ?? 0
  };
}

function buildDiplomacyMatrix(map) {
  const states = stateRows(map);
  return {
    states,
    rows: states.map(subject => ({
      id: subject.id,
      name: subject.name,
      shortName: shortName(subject.name),
      cells: states.map(object => {
        const self = subject.id === object.id;
        const relation = self ? "Self" : normalizeRelation(subject.state.diplomacy?.[object.id]);
        const label = self ? "本国" : relationLabel(relation);
        return {
          id: object.id,
          relation,
          label,
          shortLabel: self ? "本" : label.slice(0, 2),
          self,
          color: self ? "#ffbf42" : DIPLOMACY_RELATIONS[relation]?.color || "#9ca3a8",
          textColor: relationTextColor(relation),
          title: `${subject.name} -> ${object.name}: ${label}`
        };
      })
    }))
  };
}

function stateRows(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .map(state => ({
      id: state.i ?? state.id,
      name: state.fullName || state.name || `国家 #${state.i ?? state.id}`,
      state
    }));
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.relationLabel.toLowerCase().includes(query)
    || row.relation.toLowerCase().includes(query)
    || row.cultureName.toLowerCase().includes(query)
    || row.religionName.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  return [...rows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function normalizeRelation(relation) {
  return DIPLOMACY_RELATIONS[relation] ? relation : "Unknown";
}

function relationLabel(relation) {
  return DIPLOMACY_RELATIONS[relation]?.label || relation;
}

function relationTextColor(relation) {
  if (relation === "Enemy" || relation === "Rival" || relation === "Suzerain" || relation === "Unknown") return "#f7fbff";
  return "#102026";
}

function relationWeight(relation) {
  const order = {Ally: 1, Friendly: 2, Suzerain: 3, Vassal: 4, Neutral: 5, Suspicion: 6, Rival: 7, Enemy: 8, Unknown: 9};
  return order[relation] || 10;
}

function relationPolarityLabel(value) {
  const number = Number(value || 0);
  if (number > 0) return `友好 +${formatNumber(number)}`;
  if (number < 0) return `敌对 ${formatNumber(number)}`;
  return "中立 0";
}

function includesAny(text, values) {
  return values.some(value => value && text.includes(value));
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id ? `#${id}` : "none");
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function exportCsv(relationRows = metrics.value.rows, {selectedOnly = false} = {}) {
  const map = props.state.map;
  const seed = props.state.map?.metadata?.seed || "map";
  const suffix = selectedOnly ? "-selected" : "";
  downloadText(`fmg-diplomacy-${safeFilePart(seed)}${suffix}.csv`, diplomacyToCsv({seed, map, metrics: metrics.value, matrix: matrix.value, relationRows, selectedOnly}), "text/csv;charset=utf-8");
}

function exportJson(relationRows = metrics.value.rows, {selectedOnly = false} = {}) {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const payload = {
    type: "webgl-generator-diplomacy-summary",
    version: 1,
    exportedAt: new Date().toISOString(),
    seed,
    exportMode: selectedOnly ? "selected-subject-relations" : "current-subject",
    metadata: map?.diplomacy?.metadata || {},
    subject: {
      id: selectedSubjectId.value,
      name: metrics.value.subjectName,
      relations: relationRows.length,
      counts: metrics.value.counts
    },
    states: diplomacyStateExportRows(map, matrix.value.states),
    subjectRelations: relationRows.map(diplomacyRelationExportRow),
    relations: matrix.value.rows.map(row => ({
      id: row.id,
      name: row.name,
      relations: row.cells.filter(cell => !cell.self).map(cell => ({
        state: cell.id,
        relation: cell.relation,
        label: cell.label
      }))
    })),
    chronicle: diplomacyChronicle(map)
  };
  const suffix = selectedOnly ? "-selected" : "";
  downloadText(`fmg-diplomacy-${safeFilePart(seed)}${suffix}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function handleDiplomacyExport(key) {
  if (key === "csv") exportCsv(visibleRows.value);
  if (key === "json") exportJson(visibleRows.value);
  if (key === "selected-csv") exportCsv(selectedRelationRows.value, {selectedOnly: true});
  if (key === "selected-json") exportJson(selectedRelationRows.value, {selectedOnly: true});
}

function handleDiplomacyHighlightAction(key) {
  if (key === "highlight-selected") props.callbacks.onHighlight?.(selectedRelationRows.value);
  if (key === "clear-highlights") props.callbacks.onClearHighlights?.();
}

function diplomacyToCsv({seed, map, metrics, matrix, relationRows = metrics.rows, selectedOnly = false}) {
  const rows = [];
  appendCsvSection(rows, "外交导出摘要", [
    ["字段", "值"],
    ["seed", seed],
    ["导出模式", selectedOnly ? "选中主体关系" : "当前主体关系"],
    ["主体国家", metrics.subjectName],
    ["国家数", matrix.states.length],
    ["主体关系数", relationRows.length],
    ["关系统计", relationCountsText(metrics.counts)],
    ["历史记录", diplomacyChronicle(map).length]
  ]);
  appendCsvSection(rows, "当前主体关系明细", [
    ["主体", "对象ID", "对象国家", "关系", "关系代码", "关系倾向", "邻接", "贸易额", "贸易量", "交易数", "主体流入", "主体流出", "净流向", "文化", "宗教", "政体", "人口", "面积", "国力", "经济力", "城镇"],
    ...relationRows.map(row => [
      metrics.subjectName,
      row.id,
      row.name,
      row.relationLabel,
      row.relation,
      row.relationPolarity,
      row.neighborLabel,
      row.tradeValue,
      row.tradeUnits,
      row.tradeDeals,
      row.tradeSubjectInValue,
      row.tradeSubjectOutValue,
      row.tradeBalance,
      row.cultureName,
      row.religionName,
      row.governmentName,
      row.population,
      row.area,
      row.powerScore,
      row.economicPower,
      row.burgs
    ])
  ]);
  appendCsvSection(rows, "外交关系矩阵", matrixToCsvRows(matrix));
  const chronicle = diplomacyChronicle(map);
  if (chronicle.length) {
    appendCsvSection(rows, "外交历史", [
      ["序号", "类型", "说明"],
      ...chronicle.map((entry, index) => [index + 1, entry.type, entry.text])
    ]);
  }
  return rows.map(values => values.map(csvEscape).join(",")).join("\r\n");
}

function appendCsvSection(rows, title, sectionRows) {
  if (rows.length) rows.push([]);
  rows.push([title]);
  rows.push(...sectionRows);
}

function relationCountsText(counts = {}) {
  return DIPLOMACY_RELATION_OPTIONS
    .map(option => `${option.label}:${counts[option.value] || 0}`)
    .join("；");
}

function diplomacyRelationExportRow(row) {
  return {
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    objectId: row.id,
    objectName: row.name,
    relation: row.relation,
    relationLabel: row.relationLabel,
    relationPolarity: row.relationPolarity,
    neighbor: row.neighborLabel,
    trade: {
      deals: row.tradeDeals,
      value: row.tradeValue,
      units: row.tradeUnits,
      subjectInValue: row.tradeSubjectInValue,
      subjectOutValue: row.tradeSubjectOutValue,
      balance: row.tradeBalance,
      balanceLabel: row.tradeBalanceLabel
    },
    culture: row.cultureName,
    religion: row.religionName,
    government: row.governmentName,
    population: row.population,
    area: row.area,
    powerScore: row.powerScore,
    economicPower: row.economicPower,
    burgs: row.burgs
  };
}

function diplomacyStateExportRows(map, states) {
  return states.map(state => {
    const item = map?.politics?.states?.[state.id] || map?.pack?.states?.[state.id] || {};
    return {
      id: state.id,
      name: state.name,
      rawName: item.name || state.name,
      culture: indexedName(map?.society?.cultures, item.culture),
      religion: indexedName(map?.society?.religions, item.religion),
      government: item.governmentLabel || item.government?.label || item.form || "未知政体",
      population: Number(item.rural || 0) + Number(item.urban || 0),
      area: Number(item.area || item.cells || 0),
      powerScore: Number(item.powerScore || 0),
      economicPower: Number(item.economicPower || 0),
      burgs: Number(item.burgs || 0)
    };
  });
}

function diplomacyChronicle(map) {
  const chronicle = Array.isArray(map?.diplomacy?.chronicle) ? map.diplomacy.chronicle : Array.isArray(map?.pack?.states?.[0]?.diplomacy) ? map.pack.states[0].diplomacy : [];
  return chronicle.map((entry, index) => {
    if (Array.isArray(entry)) return {index: index + 1, type: entry[0] || "外交记录", text: entry[1] || ""};
    return {index: index + 1, type: entry?.type || entry?.title || "外交记录", text: entry?.text || entry?.description || String(entry || "")};
  });
}

function matrixToCsvRows(matrixValue) {
  const header = ["国家", ...matrixValue.states.map(state => `#${state.id} ${state.name}`)];
  const rows = matrixValue.rows.map(row => [row.name, ...row.cells.map(cell => cell.self ? "本国" : `${cell.label}(${cell.relation})`)]);
  return [header, ...rows];
}

function buildDiplomacyTradeContext(map) {
  const context = new Map();
  const pack = map?.pack || {};
  for (const deal of pack.deals || []) {
    const sellerState = tradePartyState(pack, deal.sellerType, deal.seller);
    const buyerState = tradePartyState(pack, deal.buyerType, deal.buyer);
    if (!sellerState || !buyerState || sellerState === buyerState) continue;
    const item = ensureTradeSummary(context, sellerState, buyerState);
    const value = Number(deal.value || 0);
    const units = Number(deal.units || 0);
    item.deals++;
    item.value += value;
    item.units += units;
    item.outByState.set(sellerState, (item.outByState.get(sellerState) || 0) + value);
    item.inByState.set(buyerState, (item.inByState.get(buyerState) || 0) + value);
  }
  for (const item of context.values()) {
    item.value = roundValue(item.value);
    item.units = roundValue(item.units);
    for (const [stateId, value] of item.outByState) item.outByState.set(stateId, roundValue(value));
    for (const [stateId, value] of item.inByState) item.inByState.set(stateId, roundValue(value));
  }
  return context;
}

function ensureTradeSummary(context, leftState, rightState) {
  const key = pairKey(leftState, rightState);
  let item = context.get(key);
  if (!item) {
    item = emptyTradeSummary();
    context.set(key, item);
  }
  return item;
}

function emptyTradeSummary() {
  return {deals: 0, value: 0, units: 0, inByState: new Map(), outByState: new Map()};
}

function tradePartyState(pack, type, id) {
  id = Number(id);
  if (!Number.isInteger(id) || id <= 0) return 0;
  if (type === "burg") return Number(pack.burgs?.[id]?.state || 0);
  if (type === "market") {
    const market = pack.markets?.[id];
    if (market?.state) return Number(market.state || 0);
    return Number(pack.burgs?.[market?.centerBurgId]?.state || 0);
  }
  return 0;
}

function pairKey(left, right) {
  left = Number(left);
  right = Number(right);
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function tradeBalanceLabel(value) {
  const amount = Math.abs(Number(value || 0));
  if (amount < 0.0001) return "均衡";
  return value > 0 ? `净流入 ${formatNumber(amount)}` : `净流出 ${formatNumber(amount)}`;
}

function roundValue(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "map";
}

function shortName(name) {
  const chars = Array.from(name || "");
  return chars.length > 5 ? `${chars.slice(0, 5).join("")}...` : chars.join("");
}
</script>
