// 仅依赖浏览器 DOM，可直接传给 page.evaluate；审计文本几何而非推测 CSS。
export function inspectUiLayout(selector = "body") {
  const issues = [], controls = [], exceptions = [];
  const roots = [...document.querySelectorAll(selector)];
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && !el.closest('[aria-hidden="true"], [hidden]');
  };
  const key = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`;
  const issue = (el, type, detail) => issues.push({type, target: key(el), text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 100), detail});
  const buttons = [...new Set(roots.flatMap(root => [...root.querySelectorAll('button,[role="tab"],[role="menuitem"],.el-segmented__item')]))].filter(visible);
  for (const el of buttons) {
    // 排序标题属于表头排版，拖柄与数字步进属于复合输入，不按操作按钮计。
    if (el.matches('.object-table-sort-button,.object-table-column-resize-handle,.el-slider__button') || el.closest('.el-input-number')) continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el), rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !visible(node.parentElement) || node.parentElement.closest('[aria-hidden="true"],svg,.el-icon')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      rects.push(...[...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0));
    }
    const lines = new Set(rects.map(rect => Math.round(rect.top / 2) * 2)).size;
    const reason = el.getAttribute("data-layout-multiline");
    if (reason) exceptions.push({target: key(el), reason});
    if (el.hasAttribute("data-layout-multiline") && !reason?.trim()) issue(el, "missing-reason", "多行例外必须说明原因");
    if (lines > 1 && !reason) issue(el, "label-wrap", `${lines} 行`);
    const clipped = rects.some(t => t.left < r.left - 2 || t.right > r.right + 2 || t.top < r.top - 2 || t.bottom > r.bottom + 2);
    if (clipped || el.scrollWidth > el.clientWidth + 2) issue(el, "label-clip", "文本越过按钮边界或被裁切");
    if (el.matches('.ui-icon-action,.ui-button') && (r.height < 30 || r.width < 30)) issue(el, "small-target", `${r.width.toFixed(1)} × ${r.height.toFixed(1)}`);
    // 允许滚动列表中的按钮处于滚动区外；禁止静态操作区撑出面板。
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyle(p), pr = p.getBoundingClientRect();
      if (/auto|scroll/.test(style.overflowX) && p.scrollWidth > p.clientWidth + 2) break;
      if (p.matches('.floating-panel,.ui-secondary-action-panel,dialog,.el-dialog')) {
        if (r.left < pr.left - 2 || r.right > pr.right + 2) issue(el, "control-overflow", "按钮超出面板");
        break;
      }
    }
    controls.push({el, rect: r, text: el.textContent.trim(), lines, whiteSpace: s.whiteSpace});
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.el.parentElement !== b.el.parentElement || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
    const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
    if (x > 2 && y > 2) issue(a.el, "control-overlap", `与“${b.text.slice(0, 45)}”重叠 ${x.toFixed(1)} × ${y.toFixed(1)}`);
  }
  for (const root of roots) for (const body of root.querySelectorAll('.floating-panel-body,.ui-secondary-action-body')) {
    if (visible(body) && body.scrollWidth > body.clientWidth + 2) issue(body, "panel-overflow", `${body.scrollWidth - body.clientWidth}px`);
  }
  return {checked: controls.length, menuItems: controls.filter(c => c.el.matches('[role="menuitem"]')).length, issues, exceptions};
}
