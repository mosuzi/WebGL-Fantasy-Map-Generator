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

  <section v-if="relationHistoryPreview.length" class="diplomacy-history-preview" aria-label="外交历史">
    <div class="diplomacy-history-heading">
      <strong>外交历史</strong>
      <span>{{ relationHistoryLabel }}</span>
    </div>
    <ol>
      <li v-for="entry in relationHistoryPreview" :key="`${entry.index}:${entry.type}:${entry.text}`">
        <strong>{{ entry.type }}</strong>
        <span>{{ entry.text }}</span>
      </li>
    </ol>
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
          @update:model-value="relation => callbacks.onRelationChange(selected.subjectId, selected.id, relation)"
        />
        <p class="diplomacy-relation-note">选择后会立即写入当前关系并进入撤销记录，不会触发军事行动。</p>
      </div>
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
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
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
  {key: "openState", label: "打开国家", icon: "◎"},
  {key: "relation", label: "调整关系", icon: "⇄"}
]);

const summaryMetrics = computed(() => [
  {label: "主体", value: metrics.value.subjectName},
  {label: "关系", value: formatNumber(metrics.value.rows.length)},
  {label: "盟友", value: formatNumber(metrics.value.counts.Ally || 0)},
  {label: "宿敌", value: formatNumber(metrics.value.counts.Rival || 0)},
  {label: "战争", value: formatNumber(metrics.value.counts.Enemy || 0)},
  {label: "附庸", value: formatNumber(metrics.value.counts.Vassal || 0)},
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
const diplomacyChronicleRows = computed(() => {
  props.state.version;
  return diplomacyChronicle(props.state.map);
});
const relationHistoryRows = computed(() => {
  if (!selected.value) return [];
  const subjectAliases = [selected.value.subjectName, selected.value.subjectRawName].filter(Boolean);
  const objectAliases = [selected.value.name, selected.value.rawName].filter(Boolean);
  return diplomacyChronicleRows.value.filter(entry => includesAny(entry.text, subjectAliases) && includesAny(entry.text, objectAliases));
});
const relationHistoryPreview = computed(() => {
  const source = relationHistoryRows.value.length ? relationHistoryRows.value : diplomacyChronicleRows.value;
  return source.slice(-4).reverse();
});
const relationHistoryLabel = computed(() => {
  const total = diplomacyChronicleRows.value.length;
  if (relationHistoryRows.value.length) return `相关 ${formatNumber(relationHistoryRows.value.length)} / 全部 ${formatNumber(total)}`;
  return `最近 ${formatNumber(Math.min(4, total))} / 全部 ${formatNumber(total)}`;
});

watch(() => selected.value?.id, () => {
  activeAction.value = null;
});

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

function exportCsv() {
  const map = props.state.map;
  const seed = props.state.map?.metadata?.seed || "map";
  downloadText(`fmg-diplomacy-${safeFilePart(seed)}.csv`, diplomacyToCsv({seed, map, metrics: metrics.value, matrix: matrix.value}), "text/csv;charset=utf-8");
}

function exportJson() {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const payload = {
    type: "webgl-generator-diplomacy-summary",
    version: 1,
    exportedAt: new Date().toISOString(),
    seed,
    metadata: map?.diplomacy?.metadata || {},
    subject: {
      id: selectedSubjectId.value,
      name: metrics.value.subjectName,
      relations: metrics.value.rows.length,
      counts: metrics.value.counts
    },
    states: diplomacyStateExportRows(map, matrix.value.states),
    subjectRelations: metrics.value.rows.map(diplomacyRelationExportRow),
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
  downloadText(`fmg-diplomacy-${safeFilePart(seed)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function diplomacyToCsv({seed, map, metrics, matrix}) {
  const rows = [];
  appendCsvSection(rows, "外交导出摘要", [
    ["字段", "值"],
    ["seed", seed],
    ["主体国家", metrics.subjectName],
    ["国家数", matrix.states.length],
    ["主体关系数", metrics.rows.length],
    ["关系统计", relationCountsText(metrics.counts)],
    ["历史记录", diplomacyChronicle(map).length]
  ]);
  appendCsvSection(rows, "当前主体关系明细", [
    ["主体", "对象ID", "对象国家", "关系", "关系代码", "关系倾向", "邻接", "贸易额", "贸易量", "交易数", "主体流入", "主体流出", "净流向", "文化", "宗教", "政体", "人口", "面积", "国力", "经济力", "城镇"],
    ...metrics.rows.map(row => [
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
