import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {
  decideSelectionPanelRoute,
  SELECTION_PANEL_BINDINGS,
  SELECTION_PANEL_ROUTE
} from "../app/webgl-generator/src/runtime/selection-panel-policy.js";

const mappedKinds = Object.values(OBJECT_KIND).filter(kind => kind !== OBJECT_KIND.REGION);
assert.deepEqual(Object.keys(SELECTION_PANEL_BINDINGS).sort(), mappedKinds.sort(), "除区域外的对象类型都必须声明领域面板绑定");

for (const kind of mappedKinds) {
  const binding = SELECTION_PANEL_BINDINGS[kind];
  assert.equal(
    decideSelectionPanelRoute({binding, panelOpen: false}),
    SELECTION_PANEL_ROUTE.OBJECT_DETAILS,
    `${kind} 的领域面板关闭时必须落到对象详情`
  );
  assert.equal(
    decideSelectionPanelRoute({binding, panelOpen: true}),
    SELECTION_PANEL_ROUTE.UPDATE_OPEN_PANEL,
    `${kind} 的领域面板已打开时必须只更新现有面板`
  );
  assert.equal(
    decideSelectionPanelRoute({binding, sourcePanelId: binding.panelId, panelOpen: true}),
    SELECTION_PANEL_ROUTE.SOURCE_PANEL,
    `${kind} 从自身面板选择时不得重复更新或打开`
  );
}

assert.equal(
  decideSelectionPanelRoute({binding: SELECTION_PANEL_BINDINGS[OBJECT_KIND.STATE], sourcePanelId: "government-panel"}),
  SELECTION_PANEL_ROUTE.SOURCE_PANEL,
  "政体面板是国家选择的等价来源面板"
);
assert.equal(
  decideSelectionPanelRoute({binding: SELECTION_PANEL_BINDINGS[OBJECT_KIND.STATE], sourcePanelId: "notes-panel"}),
  SELECTION_PANEL_ROUTE.OBJECT_DETAILS,
  "非领域来源面板不能绕过对象详情兜底"
);
assert.equal(decideSelectionPanelRoute(), SELECTION_PANEL_ROUTE.OBJECT_DETAILS, "没有领域面板的区域对象必须使用对象详情");

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const objectDetailsSource = await readFile(new URL("../app/webgl-generator/src/ui/panels/object-details-panel.js", import.meta.url), "utf8");
const handlerSource = sourceBetween(appSource, "const SELECTION_PANEL_HANDLERS", "function openSelectionAwarePanelForState");

assert.doesNotMatch(handlerSource, /\.open\s*\(/, "selection handler 不得打开领域面板");
assert.doesNotMatch(handlerSource, /updateOrOpenSelectionPanel|updateExistingSelectionPanel/, "旧的分类型打开策略必须移除");
assert.match(handlerSource, /decideSelectionPanelRoute\(/, "所有领域选择必须经过统一纯策略");
assert.match(handlerSource, /route === SELECTION_PANEL_ROUTE\.OBJECT_DETAILS\) return false/, "关闭面板必须交给对象详情兜底");
assert.match(handlerSource, /route === SELECTION_PANEL_ROUTE\.SOURCE_PANEL\) return true/, "来源面板必须避免重复刷新");
assert.match(appSource, /selectionStore\.setSelection\(\{object\}, \{sourcePanelId: panelId\}\)/, "列表选择必须保留 sourcePanelId");
assert.match(appSource, /sourcePanelId = panelId[\s\S]*?if \(sourcePanelId\) selectFromPanel\(sourcePanelId, object\)/, "定位必须保留来源面板语义");
assert.match(appSource, /object\.kind === OBJECT_KIND\.STATE && shouldSwitchDiplomacySubjectForSelection\(state\)/, "外交着色主题下的国家主体切换例外必须保留");
assert.match(handlerSource, /context\.suppressNextRiverPanelOpen[\s\S]*?context\.clearRiverSuppressor\(\)/, "河流面板主动关闭抑制必须保留");
assert.doesNotMatch(objectDetailsSource, /selection\.object\.kind === "state"|selection\.object\.kind === "river"|selection\.object\.kind === "city"/, "对象详情不得拒绝国家、河流或城市兜底");

console.log(JSON.stringify({
  policy: "只更新已打开领域面板，关闭时显示对象详情",
  mappedKinds: mappedKinds.length,
  objectDetailsOnlyKinds: [OBJECT_KIND.REGION],
  sourcePanelException: true,
  diplomacyThemeException: true,
  riverCloseSuppressor: true
}, null, 2));

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
