#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {describeObjectDetailsActions, OBJECT_DETAILS_EDIT_MODE} from "../app/webgl-generator/src/runtime/object-details-actions.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {createAddRiverVisualWaypointCommand, inspectRiverVisualWaypoint} from "../app/webgl-generator/src/runtime/river-edit-commands.js";

const policyCases = [
  [{kind: OBJECT_KIND.CITY}, OBJECT_DETAILS_EDIT_MODE.INLINE_NAME, true],
  [{kind: OBJECT_KIND.LABEL, targetKind: LABEL_TARGET_KIND.CITY}, OBJECT_DETAILS_EDIT_MODE.INLINE_NAME, true],
  [{kind: OBJECT_KIND.LABEL, targetKind: "custom"}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.MARKER}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.NOTE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.ROUTE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.TRADE_FLOW}, null, true],
  [{kind: OBJECT_KIND.ECONOMY_MARKET}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, false],
  [{kind: OBJECT_KIND.RIVER}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.LAKE}, OBJECT_DETAILS_EDIT_MODE.INLINE_NAME, true],
  [{kind: OBJECT_KIND.FEATURE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, false],
  [{kind: OBJECT_KIND.OCEAN_CURRENT}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.MEASUREMENT}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.MILITARY}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.DIPLOMACY_RELATION}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.STATE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.PROVINCE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.CULTURE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.RELIGION}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true],
  [{kind: OBJECT_KIND.REGION}, null, true],
  [{kind: OBJECT_KIND.ZONE}, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, true]
];

assert.deepEqual(new Set(policyCases.map(([object]) => object.kind)), new Set(Object.values(OBJECT_KIND)), "对象详情能力表必须覆盖全部对象种类");

for (const [object, editMode, canLocate] of policyCases) {
  const policy = describeObjectDetailsActions(object);
  assert.equal(policy.edit?.mode || null, editMode, `${object.kind} 编辑能力不符合显式策略`);
  assert.equal(policy.canLocate, canLocate, `${object.kind} 定位能力不符合显式策略`);
}

const map = createRiverFixture();
const river = map.rivers.rivers[0];
const hydrologyBefore = hydrologySnapshot(river);
const pointsBefore = structuredClone(river.points);
const lengthBefore = river.length;
const preview = inspectRiverVisualWaypoint(map, river.id, 2);
assert.equal(preview.valid, true);
assert.equal(preview.changed, true);
assert.equal(preview.points.length, pointsBefore.length + 1);

const history = new EditHistory();
history.execute(createAddRiverVisualWaypointCommand(river.id, 2), {map});
assert.equal(history.getStats().undo, 1, "添加河道控制点必须形成一条历史");
assert.equal(river.points.length, pointsBefore.length + 1);
assert.notEqual(river.length, lengthBefore);
assert.deepEqual(hydrologySnapshot(river), hydrologyBefore, "视觉控制点不得修改河网 cell、父子关系、流域或流量");

const pointsAfter = structuredClone(river.points);
history.undo({map});
assert.deepEqual(river.points, pointsBefore, "撤销必须恢复原成品折线");
assert.equal(river.length, lengthBefore, "撤销必须恢复原显示长度");
assert.deepEqual(hydrologySnapshot(river), hydrologyBefore);
history.redo({map});
assert.deepEqual(river.points, pointsAfter, "重做必须恢复同一河道控制点");
assert.deepEqual(hydrologySnapshot(river), hydrologyBefore);

const duplicate = inspectRiverVisualWaypoint(map, river.id, 0);
assert.equal(duplicate.valid, true, "河流视觉控制点允许落在已有河道点位置");

const appSource = readSource("../app/webgl-generator/src/runtime/app.js");
const detailsSource = readSource("../app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue");
const detailsWrapperSource = readSource("../app/webgl-generator/src/ui/panels/object-details-panel.js");
const stylesSource = readSource("../app/webgl-generator/src/styles.css");
const routePanelSource = readSource("../app/webgl-generator/src/ui/panels/route-panel.js");
const riverPanelSource = readSource("../app/webgl-generator/src/ui/vue/components/RiverPanel.vue");
assert.match(appSource, /openObjectEditorFromDetails[\s\S]*OBJECT_KIND\.ROUTE[\s\S]*startEditing/, "道路详情未直接进入真实路线编辑草稿");
assert.match(appSource, /OBJECT_KIND\.RIVER[\s\S]*panels\.river[\s\S]*RIVER_EDIT_WAYPOINT/, "河流详情未接入河流面板与画布控制点模式");
assert.match(routePanelSource, /startEditing\(routeId\)[\s\S]*editRequestId\+\+/, "路线面板缺少外部启动编辑请求");
assert.match(riverPanelSource, /调整河道折线|退出河道折线调整/, "河流面板缺少明确的路径编辑动作");
assert.doesNotMatch(riverPanelSource, /进入河流编辑/, "河流面板不得保留没有实际动作的伪编辑入口");
assert.match(detailsSource, /v-if="editAction"/, "对象详情编辑按钮必须受显式能力策略控制");
assert.doesNotMatch(detailsSource, /function canEditObject/, "对象详情不得恢复默认全部可编辑策略");
assert.match(detailsSource, /v-if="isCity"[\s\S]*打开城市管理/, "城市对象详情缺少打开城市管理入口");
assert.match(detailsSource, /object-details-actions-city/, "城市对象详情缺少专属两行动作布局标记");
assert.match(detailsWrapperSource, /onOpenCityPanel: \(\) => callbacks\.onOpenCityPanel\?\.\(panelState\.object\)/, "对象详情包装层没有传递当前城市");
assert.match(appSource, /onOpenCityPanel: \(\) => \{[\s\S]*kind: OBJECT_KIND\.CITY[\s\S]*setSelectedCityId\(object\.id\)[\s\S]*panels\.city\.open/, "城市对象详情没有复用选中感知的城市管理打开链");
assert.match(stylesSource, /\.object-details-actions-city\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, "城市对象详情四个动作没有固定为两列两行");

console.log(JSON.stringify({
  ok: true,
  policies: policyCases.length,
  hiddenEdits: [OBJECT_KIND.REGION, OBJECT_KIND.TRADE_FLOW],
  river: {id: river.id, beforePoints: pointsBefore.length, afterPoints: pointsAfter.length},
  hydrologyPreserved: true,
  history: history.getStats()
}, null, 2));

function createRiverFixture() {
  const targetRiver = {
    id: 7,
    name: "测试河",
    points: [[0, 0, 10], [10, 10, 30]],
    cells: [0, 1],
    parent: 3,
    basin: 2,
    flux: 30,
    discharge: 30,
    length: Math.hypot(10, 10)
  };
  return {
    metadata: {graphWidth: 100, graphHeight: 100},
    pack: {cells: {p: [[0, 0], [10, 10], [5, 2]]}, rivers: [targetRiver]},
    rivers: {rivers: [targetRiver]}
  };
}

function hydrologySnapshot(river) {
  return structuredClone({cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge});
}

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}
