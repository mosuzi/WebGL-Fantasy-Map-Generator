import assert from "node:assert/strict";

// 只判定组件定义的身份字段；不删除用户名称、备注中的数字或 # 文本。
export async function assertPlayerListIdentifiers(page) {
  const violations = await page.evaluate(() => {
    if (window.__webglGeneratorDebug.enabled) return ["验收必须处于普通模式"];
    const roots = [...document.querySelectorAll('.floating-panel:not(.hidden),dialog[open]')];
    return roots.flatMap(root => [...root.querySelectorAll('th,[data-debug-id],.map-search-results small,select option')]
      .filter(el => !el.closest('details:not([open])'))
      .filter(el => el.hasAttribute('data-debug-id') || /(^id$|Id$|_id$)/.test(el.dataset.columnKey || "")
        || /^(?:ID|编号|对象ID|国家ID)$/.test(el.textContent.trim())
        || (el.matches('.map-search-results small,select option') && /[·（]\s*#\d+/.test(el.textContent)))
      .map(el => el.textContent.trim()));
  });
  assert.deepEqual(violations, [], "普通模式列表出现技术 ID");
}

export async function inspectListDebugToggle(page) {
  const snapshot = () => page.evaluate(() => [...document.querySelectorAll('.floating-panel:not(.hidden) .object-table')].map(table => ({
    keys: [...table.querySelectorAll('thead th[data-column-key]')].map(el => el.dataset.columnKey),
    headers: table.querySelectorAll('thead th').length,
    rows: [...table.querySelectorAll('.object-table-row')].map(row => ({selected: row.getAttribute('aria-selected'),
      keys: [...row.querySelectorAll('td[data-column-key]')].map(el => el.dataset.columnKey),
      cells: row.cells.length,
      text: [...row.querySelectorAll('td[data-column-key]:not([data-column-key="id"])')].map(el => el.textContent)
    })),
    spans: [...table.querySelectorAll('.object-table-spacer-row td')].map(el => el.colSpan)
  })));
  const before = await snapshot();
  if (!before.length) return null;
  const panelIds = await page.evaluate(() => [...document.querySelectorAll('.floating-panel:not(.hidden)')].map(panel => panel.dataset.panelId));
  assert.ok(panelIds.every(Boolean), "原面板必须具有注册标识");
  const restorePanels = () => page.evaluate(ids => {
    for (const id of ids) window.__webglGeneratorApp.panelManager.open(id);
  }, panelIds);
  const history = await page.evaluate(() => JSON.stringify(window.__webglGeneratorApp.editHistory.getStats()));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {window.__webglGeneratorDebug.enabled = true;window.__webglGeneratorDebug.collapse();});
  await restorePanels();
  await settle();
  const debug = await snapshot();
  assert.equal(debug.length, before.length, "模式切换后必须检查原列表");
  let restored = 0;
  for (let i = 0; i < debug.length; i++) {
    const table = debug[i];
    if (table.keys.includes("id")) restored++;
    assert.ok(table.rows.every(row => row.cells === table.headers && JSON.stringify(row.keys) === JSON.stringify(table.keys)), "debug 表头与表体列必须一致");
    assert.ok(table.spans.every(span => span === table.headers), "debug 虚拟行跨度必须匹配");
    assert.deepEqual(table.rows.map(row => row.selected), before[i].rows.map(row => row.selected), "debug 切换不得改变选中态");
  }
  await page.evaluate(() => {window.__webglGeneratorDebug.enabled = false;});
  await restorePanels();
  await settle();
  const after = await snapshot();
  assert.deepEqual(after, before, "关闭 debug 后列表内容、顺序、选择和虚拟行必须精确恢复");
  assert.ok(after.every(table => table.rows.every(row => row.cells === table.headers) && table.spans.every(span => span === table.headers)), "普通模式表格列数必须匹配");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__webglGeneratorApp.editHistory.getStats())), history, "显示开关不得写入历史");
  return {tables: before.length, restored, virtual: before.some(table => table.spans.length > 0)};
}
