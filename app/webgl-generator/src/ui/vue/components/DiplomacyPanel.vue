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
    <UiButton id="diplomacy-export-csv" variant="secondary" @click="exportCsv">导出 CSV</UiButton>
    <UiButton id="diplomacy-export-json" variant="secondary" @click="exportJson">导出 JSON</UiButton>
    <UiButton variant="secondary" @click="callbacks.onRegenerate?.()">重生成外交</UiButton>
  </div>

  <div class="diplomacy-matrix-wrap">
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

  <UiSortBar class-name="diplomacy-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedObjectId"
    empty-text="没有匹配的外交关系"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="diplomacy-panel-details" empty-text="未选中外交对象" :rows="detailRows" />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="diplomacyActions">
    <template #relation>
      <UiSelectField
        input-id="diplomacy-relation-select"
        class-name="diplomacy-relation-select"
        label="关系"
        :model-value="selected.relation"
        :options="relationOptions"
        @update:model-value="relation => callbacks.onRelationChange(selected.subjectId, selected.id, relation)"
      />
    </template>
  </UiActionDock>

  <UiHistoryActions class-name="diplomacy-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {DIPLOMACY_RELATION_OPTIONS, DIPLOMACY_RELATIONS} from "../../../generator/diplomacy.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatArea, formatPopulation} from "../../display-units.js";
import {findByObjectId, sameObjectId, toIntegerId} from "../../object-id.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

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
  {key: "powerScore", label: "国力"},
  {key: "population", label: "人口"},
  {key: "neighborRank", label: "邻接"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "国家"},
  {key: "relationLabel", label: "关系"},
  {key: "powerScore", label: "国力", align: "right", format: value => formatNumber(value)},
  {key: "neighborLabel", label: "邻接"},
  {key: "cultureName", label: "文化"}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const relationOptions = DIPLOMACY_RELATION_OPTIONS;
const metrics = computed(() => {
  props.state.version;
  return buildDiplomacyMetrics(props.state.map, props.state.selectedStateId);
});
const stateOptions = computed(() => metrics.value.states.map(state => ({value: state.id, label: state.name})));
const selectedSubjectId = computed(() => toIntegerId(props.state.selectedStateId) ?? stateOptions.value[0]?.value ?? null);
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedObjectId) || visibleRows.value[0] || null);
const matrix = computed(() => {
  props.state.version;
  return buildDiplomacyMatrix(props.state.map);
});
const diplomacyActions = Object.freeze([
  {key: "relation", label: "调整关系", icon: "⇄"}
]);

const summaryMetrics = computed(() => [
  {label: "主体", value: metrics.value.subjectName},
  {label: "关系", value: metrics.value.rows.length},
  {label: "盟友", value: metrics.value.counts.Ally || 0},
  {label: "宿敌", value: metrics.value.counts.Rival || 0},
  {label: "战争", value: metrics.value.counts.Enemy || 0},
  {label: "附庸", value: metrics.value.counts.Vassal || 0},
  {label: "历史", value: metrics.value.history}
]);

const detailRows = computed(() => selected.value ? [
  {label: "主体国家", value: selected.value.subjectName},
  {label: "对象国家", value: selected.value.name},
  {label: "关系", value: selected.value.relationLabel},
  {label: "文化", value: selected.value.cultureName},
  {label: "宗教", value: selected.value.religionName},
  {label: "邻接", value: selected.value.neighborLabel},
  {label: "国力", value: formatNumber(selected.value.powerScore)},
  {label: "经济力", value: formatNumber(selected.value.economicPower)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "城镇", value: selected.value.burgs}
] : []);

watch(() => selected.value?.id, () => {
  activeAction.value = null;
});

function buildDiplomacyMetrics(map, selectedStateId) {
  const states = stateRows(map);
  const subject = states.find(state => sameObjectId(state.id, selectedStateId)) || states[0] || null;
  if (!subject) return {states, subjectName: "none", rows: [], counts: {}, history: 0};

  const rows = states
    .filter(state => state.id !== subject.id)
    .map(state => {
      const stateItem = map?.politics?.states?.[state.id] || map?.pack?.states?.[state.id];
      const relation = normalizeRelation(subject.state.diplomacy?.[state.id]);
      const population = Number(stateItem?.rural || 0) + Number(stateItem?.urban || 0);
      const neighbor = (subject.state.neighbors || []).includes(state.id);
      return {
        id: state.id,
        subjectId: subject.id,
        subjectName: subject.name,
        name: state.name,
        rawName: stateItem?.name || state.name,
        relation,
        relationLabel: relationLabel(relation),
        relationWeight: relationWeight(relation),
        relationColor: DIPLOMACY_RELATIONS[relation]?.color || "#9ca3a8",
        cultureName: indexedName(map?.society?.cultures, stateItem?.culture),
        religionName: indexedName(map?.society?.religions, stateItem?.religion),
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
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
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

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id ? `#${id}` : "none");
}

function formatNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function exportCsv() {
  const seed = props.state.map?.metadata?.seed || "map";
  downloadText(`fmg-diplomacy-${safeFilePart(seed)}.csv`, matrixToCsv(matrix.value), "text/csv;charset=utf-8");
}

function exportJson() {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const payload = {
    seed,
    metadata: map?.diplomacy?.metadata || {},
    states: matrix.value.states.map(state => ({id: state.id, name: state.name})),
    relations: matrix.value.rows.map(row => ({
      id: row.id,
      name: row.name,
      relations: row.cells.filter(cell => !cell.self).map(cell => ({
        state: cell.id,
        relation: cell.relation,
        label: cell.label
      }))
    }))
  };
  downloadText(`fmg-diplomacy-${safeFilePart(seed)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function matrixToCsv(matrixValue) {
  const header = ["国家", ...matrixValue.states.map(state => `#${state.id} ${state.name}`)];
  const rows = matrixValue.rows.map(row => [row.name, ...row.cells.map(cell => cell.label)]);
  return [header, ...rows].map(values => values.map(csvEscape).join(",")).join("\r\n");
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
