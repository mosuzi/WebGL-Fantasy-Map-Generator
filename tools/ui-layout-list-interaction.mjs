import assert from "node:assert/strict";

export async function inspectListInteraction(page) {
  const table = page.locator('.floating-panel:not(.hidden) .object-table[aria-label*="Ctrl"]').first();
  if (!await table.count()) return null;
  assert.equal(await table.locator('input[type="checkbox"]').count(), 0);
  const rows = table.locator('.object-table-row');
  if (await rows.count() < 2) return null;
  const keys = await rows.evaluateAll(nodes => {
    const start = Math.max(0, Math.floor(nodes.length / 2) - 1);
    return nodes.slice(start, start + 2).map(node => node.dataset.rowKey);
  });
  const rowAt = index => table.locator(`.object-table-row[data-row-key=${JSON.stringify(keys[index])}]`);
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const clickRow = (index, modifiers = []) => rowAt(index).locator('td[data-column-key]').first().click({modifiers});
  const selectedCount = () => table.locator('.object-table-row[aria-selected="true"]').count();
  await clickRow(0);await settle();assert.equal(await selectedCount(), 1, "普通点击单选");
  await clickRow(1, ["Control"]);await settle();assert.equal(await selectedCount(), 2, "Ctrl 追加选择");
  await clickRow(0, ["Control"]);await settle();assert.equal(await selectedCount(), 1, "Ctrl 取消选择");
  assert.equal(await rowAt(0).getAttribute('aria-selected'), "false", "取消选择后移除行高亮");
  await clickRow(0);await settle();assert.equal(await selectedCount(), 1, "普通点击清除其它选择");
  const selectedKeys = () => rows.evaluateAll(nodes => nodes.filter(node => node.getAttribute('aria-selected') === 'true').map(node => node.dataset.rowKey));
  const beforeActions = await selectedKeys();
  const lock = rowAt(1).locator('.object-table-lock-action');
  if (await lock.count()) {
    const pressed = await lock.getAttribute('aria-pressed');
    await lock.click();await settle();
    assert.notEqual(await lock.getAttribute('aria-pressed'), pressed, "锁定动作仍可操作");
    const undo = await page.evaluate(() => window.webglGeneratorApi.history.undo());assert.ok(undo.ok);
    await settle();assert.equal(await lock.getAttribute('aria-pressed'), pressed, "撤销后锁显示恢复");
    const redo = await page.evaluate(() => window.webglGeneratorApi.history.redo());assert.ok(redo.ok);
    await settle();assert.notEqual(await lock.getAttribute('aria-pressed'), pressed, "重做后锁显示同步");
    await lock.click();await settle();assert.equal(await lock.getAttribute('aria-pressed'), pressed, "恢复原锁状态");
  }
  const locate = rowAt(1).locator('.object-table-action-cell button');
  if (await locate.count()) {await locate.click();await settle();}
  assert.deepEqual(await selectedKeys(), beforeActions, "右侧动作不得改动多选集合");
  const geometry = await table.evaluate(async table => {
    const wrap = table.parentElement, max = wrap.scrollWidth - wrap.clientWidth, samples = [];
    for (const left of [0, max / 2, max]) {
      wrap.scrollLeft = left;await new Promise(resolve => requestAnimationFrame(resolve));
      const edge = wrap.getBoundingClientRect().left + wrap.clientLeft + wrap.clientWidth;
      const locate = table.querySelector('.object-table-action-cell')?.getBoundingClientRect();
      const lock = table.querySelector('.object-table-lock-cell')?.getBoundingClientRect();
      const head = table.querySelector('.object-table-lock-column')?.getBoundingClientRect();
      samples.push({edge, locate: locate && {left: locate.left, right: locate.right}, lock: lock && {left: lock.left, right: lock.right}, headRight: head?.right});
    }
    wrap.scrollLeft = 0;return {max, samples};
  });
  for (const sample of geometry.samples) {
    if (sample.locate) assert.ok(Math.abs(sample.locate.right - sample.edge) < 2, "定位列始终固定右侧");
    if (sample.lock) {
      assert.ok(Math.abs(sample.lock.right - (sample.locate?.left ?? sample.edge)) < 2, "锁列贴合定位且不重叠");
      assert.ok(Math.abs(sample.headRight - sample.lock.right) < 2, "锁列表头与表体对齐");
    }
  }
  return {ctrlSelection: true, lock: Boolean(await lock.count()), locate: Boolean(await locate.count()), horizontalScroll: geometry.max, samples: geometry.samples};
}
