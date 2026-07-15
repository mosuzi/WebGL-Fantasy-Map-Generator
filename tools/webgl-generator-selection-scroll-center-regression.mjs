import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  centerElementVertically,
  centeredVerticalScrollTop,
  centerVirtualRowVertically,
  createSelectionCenterController,
  selectionCenterAnchor,
  selectionOrderSignature
} from "../app/webgl-generator/src/ui/components/selection-scroll.js";

assert.equal(centeredVerticalScrollTop({itemTop: 420, itemHeight: 32, viewportHeight: 300, scrollHeight: 1200}), 286);
assert.equal(centeredVerticalScrollTop({itemTop: 0, itemHeight: 32, viewportHeight: 300, scrollHeight: 1200}), 0);
assert.equal(centeredVerticalScrollTop({itemTop: 1168, itemHeight: 32, viewportHeight: 300, scrollHeight: 1200}), 900);

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

scroller.scrollTop = 0;
scroller.scrollLeft = 91;
scroller.clientHeight = 300;
scroller.scrollHeight = 3200;
assert.equal(centerVirtualRowVertically(scroller, 20, 32), true);
assert.equal(scroller.scrollTop, 506);
assert.equal(scroller.scrollLeft, 91);

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
const controller = createSelectionCenterController({
  getScroller: () => scroller,
  getTarget: () => retryTarget,
  onSettled: () => settled++
});
controller.request();
view.flushOne();
assert.equal(settled, 0);
retryTarget = {getBoundingClientRect: () => ({top: 434, height: 32})};
view.flushOne();
assert.equal(settled, 1);
controller.cancel();

const objectTableSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue", import.meta.url), "utf8");
const treeSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue", import.meta.url), "utf8");
const diplomacySource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/DiplomacyPanel.vue", import.meta.url), "utf8");

assert.match(objectTableSource, /watch\(\s*selectedScrollAnchor,/);
assert.match(objectTableSource, /prepareTarget: scroller =>/);
assert.match(objectTableSource, /centerVirtualRowVertically\(scroller, selectedRowPosition\.value/);
assert.doesNotMatch(objectTableSource, /\[props\.selectedId, props\.rows/);
assert.doesNotMatch(objectTableSource.match(/const selectedScrollAnchor[\s\S]*?\);/)?.[0] || "", /selectedRowIds/);
assert.match(treeSource, /ref="viewport" class="ui-tree-display-viewport"/);
assert.match(treeSource, /createSelectionCenterController/);
assert.match(diplomacySource, /ref="matrixWrap" class="diplomacy-matrix-wrap"/);
assert.match(diplomacySource, /createSelectionCenterController/);

console.log("列表选中项纵向居中回归通过");

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
    }
  };
}
