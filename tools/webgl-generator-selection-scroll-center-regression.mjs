import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  centerElementVertically,
  centeredVerticalScrollTop,
  centerVirtualRowVertically,
  createSelectionCenterController,
  selectionCenterAnchor,
  selectionOrderSignature,
  stickyTableViewportInsets
} from "../app/webgl-generator/src/ui/components/selection-scroll.js";

const middleScrollTop = centeredVerticalScrollTop({itemTop: 420, itemHeight: 32, viewportHeight: 300, scrollHeight: 1200});
const firstScrollTop = centeredVerticalScrollTop({itemTop: 0, itemHeight: 32, viewportHeight: 300, scrollHeight: 1200});
const lastScrollTop = centeredVerticalScrollTop({itemTop: 1168, itemHeight: 32, viewportHeight: 300, scrollHeight: 1200});
assert.equal(middleScrollTop, 286);
assert.equal(firstScrollTop, 0);
assert.equal(lastScrollTop, 900);
assert.equal(Math.abs(420 + 32 / 2 - (middleScrollTop + 300 / 2)), 0);
assertFullyVisible({itemTop: 0, itemHeight: 32, scrollTop: firstScrollTop, viewportHeight: 300});
assertFullyVisible({itemTop: 1168, itemHeight: 32, scrollTop: lastScrollTop, viewportHeight: 300});

const stickyHeaderInsets = {topInset: 30, bottomInset: 0};
const insetMiddleScrollTop = centeredVerticalScrollTop({
  itemTop: 420,
  itemHeight: 32,
  viewportHeight: 300,
  scrollHeight: 1200,
  ...stickyHeaderInsets
});
const insetFirstScrollTop = centeredVerticalScrollTop({
  itemTop: 30,
  itemHeight: 32,
  viewportHeight: 300,
  scrollHeight: 1230,
  ...stickyHeaderInsets
});
const insetLastScrollTop = centeredVerticalScrollTop({
  itemTop: 1198,
  itemHeight: 32,
  viewportHeight: 300,
  scrollHeight: 1230,
  ...stickyHeaderInsets
});
assert.equal(insetMiddleScrollTop, 271);
assert.equal(insetFirstScrollTop, 0);
assert.equal(insetLastScrollTop, 930);
assert.equal(Math.abs(420 + 32 / 2 - (insetMiddleScrollTop + 30 + (300 - 30) / 2)), 0);
assertFullyVisible({itemTop: 30, itemHeight: 32, scrollTop: insetFirstScrollTop, viewportHeight: 300, ...stickyHeaderInsets});
assertFullyVisible({itemTop: 1198, itemHeight: 32, scrollTop: insetLastScrollTop, viewportHeight: 300, ...stickyHeaderInsets});

const view = createAnimationFrameView();
const scroller = {
  scrollTop: 100,
  scrollLeft: 73,
  clientHeight: 200,
  scrollHeight: 1000,
  ownerDocument: {defaultView: view},
  getBoundingClientRect: () => ({top: 10, height: 200})
};
const target = {getBoundingClientRect: () => ({top: 370, height: 40})};
assert.equal(centerElementVertically(scroller, target), true);
assert.equal(scroller.scrollTop, 380);
assert.equal(scroller.scrollLeft, 73);

scroller.scrollTop = 100;
assert.equal(centerElementVertically(scroller, target, stickyHeaderInsets), true);
assert.equal(scroller.scrollTop, 365);
assert.equal(scroller.scrollLeft, 73);

scroller.scrollTop = 0;
scroller.scrollLeft = 91;
scroller.clientHeight = 300;
scroller.scrollHeight = 3200;
assert.equal(centerVirtualRowVertically(scroller, 20, 32), true);
assert.equal(scroller.scrollTop, 506);
assert.equal(scroller.scrollLeft, 91);

scroller.scrollTop = 0;
assert.equal(centerVirtualRowVertically(scroller, 20, 32, stickyHeaderInsets), true);
assert.equal(scroller.scrollTop, 491);
assert.equal(scroller.scrollLeft, 91);

const geometryScroller = {
  clientHeight: 200,
  getBoundingClientRect: () => ({top: 100, bottom: 300, height: 200})
};
assert.deepEqual(stickyTableViewportInsets(geometryScroller, tableHeaderWithRects([
  {top: 100, bottom: 128},
  {top: 100, bottom: 130}
])), {topInset: 30, bottomInset: 0});
assert.deepEqual(stickyTableViewportInsets(geometryScroller, tableHeaderWithRects([
  {top: 85, bottom: 115}
])), {topInset: 15, bottomInset: 0});
assert.deepEqual(stickyTableViewportInsets(geometryScroller, tableHeaderWithRects([
  {top: 60, bottom: 90}
])), {topInset: 0, bottomInset: 0});
assert.deepEqual(stickyTableViewportInsets(geometryScroller, tableHeaderWithRects([
  {top: 310, bottom: 340}
])), {topInset: 0, bottomInset: 0});

const originalOrder = selectionOrderSignature(["city:1", "city:17", "city:99"]);
const refreshedOrder = selectionOrderSignature(["city:1", "city:17", "city:99"]);
const sortedOrder = selectionOrderSignature(["city:99", "city:17", "city:1"]);
assert.equal(selectionCenterAnchor("city:17", 1, originalOrder), selectionCenterAnchor("city:17", 1, refreshedOrder));
assert.notEqual(selectionCenterAnchor("city:17", 1, originalOrder), selectionCenterAnchor("city:17", 1, sortedOrder));
assert.notEqual(selectionCenterAnchor("city:17", 8), selectionCenterAnchor("city:17", 21));
assert.notEqual(selectionCenterAnchor("city:17", 8), selectionCenterAnchor("city:18", 8));
assert.equal(selectionCenterAnchor(null, 8), null);

let retryTarget = null;
let settled = 0;
let viewportInsetCalls = 0;
const controller = createSelectionCenterController({
  getScroller: () => scroller,
  getTarget: () => retryTarget,
  getViewportInsets: (actualScroller, actualTarget) => {
    viewportInsetCalls++;
    assert.equal(actualScroller, scroller);
    assert.equal(actualTarget, retryTarget);
    return stickyHeaderInsets;
  },
  onSettled: () => settled++
});
controller.request();
view.flushOne();
assert.equal(settled, 0);
retryTarget = {getBoundingClientRect: () => ({top: 434, height: 32})};
view.flushOne();
assert.equal(settled, 1);
assert.equal(viewportInsetCalls, 1);
assert.equal(scroller.scrollTop, 766);
assert.equal(scroller.scrollLeft, 91);
controller.cancel();

const missingView = createAnimationFrameView();
const missingScroller = {...scroller, ownerDocument: {defaultView: missingView}};
let missingTargetLookups = 0;
const missingTargetController = createSelectionCenterController({
  getScroller: () => missingScroller,
  getTarget: () => {
    missingTargetLookups++;
    return null;
  }
});
missingTargetController.request();
for (let attempt = 0; attempt < 9; attempt++) missingView.flushOne();
assert.equal(missingView.pendingCount(), 1);
missingView.flushOne();
assert.equal(missingTargetLookups, 20);
assert.equal(missingView.pendingCount(), 0);
missingTargetController.cancel();

const objectTableSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue", import.meta.url), "utf8");
const treeSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue", import.meta.url), "utf8");
const diplomacySource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/DiplomacyPanel.vue", import.meta.url), "utf8");

assert.match(objectTableSource, /watch\(\s*selectedScrollAnchor,/);
assert.match(objectTableSource, /prepareTarget: scroller =>/);
assert.match(objectTableSource, /getViewportInsets: scroller => tableViewportInsets\(scroller\)/);
assert.match(objectTableSource, /centerVirtualRowVertically\(scroller, selectedRowPosition\.value, VIRTUAL_ROW_HEIGHT, tableViewportInsets\(scroller\)\)/);
assert.match(objectTableSource, /function tableViewportInsets\(scroller\)/);
assert.match(objectTableSource, /stickyTableViewportInsets\(scroller, scroller\?\.querySelector\?\.\("thead"\)\)/);
assert.doesNotMatch(objectTableSource, /\[props\.selectedId, props\.rows/);
assert.doesNotMatch(objectTableSource.match(/const selectedScrollAnchor[\s\S]*?\);/)?.[0] || "", /selectedRowIds/);
assert.match(treeSource, /ref="viewport" class="ui-tree-display-viewport"/);
assert.match(treeSource, /createSelectionCenterController/);
assert.doesNotMatch(treeSource, /stickyTableViewportInsets/);
assert.match(diplomacySource, /ref="matrixWrap" class="diplomacy-matrix-wrap"/);
assert.match(diplomacySource, /createSelectionCenterController/);
assert.match(diplomacySource, /getViewportInsets: scroller => stickyTableViewportInsets\(scroller, scroller\?\.querySelector\?\.\("thead"\)\)/);

console.log("列表选中项纵向居中回归通过");

function assertFullyVisible({itemTop, itemHeight, scrollTop, viewportHeight, topInset = 0, bottomInset = 0}) {
  const visibleTop = itemTop - scrollTop;
  assert.ok(visibleTop >= topInset, "目标顶部应在有效视口内");
  assert.ok(visibleTop + itemHeight <= viewportHeight - bottomInset, "目标底部应在有效视口内");
}

function tableHeaderWithRects(rects) {
  return {
    querySelectorAll: () => rects.map(rect => ({getBoundingClientRect: () => rect}))
  };
}

function createAnimationFrameView() {
  const callbacks = [];
  return {
    requestAnimationFrame(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancelAnimationFrame() {},
    flushOne() {
      const callback = callbacks.shift();
      assert.ok(callback, "应存在待执行的动画帧");
      callback();
    },
    pendingCount() {
      return callbacks.length;
    }
  };
}
