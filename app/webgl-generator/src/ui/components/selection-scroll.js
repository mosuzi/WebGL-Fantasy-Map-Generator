const DEFAULT_MAX_ATTEMPTS = 10;
const CENTER_EPSILON = 1;

export function selectionCenterAnchor(primaryId, index, orderSignature = "") {
  if (primaryId === null || primaryId === undefined) return null;
  const normalizedIndex = Number.isInteger(index) ? index : -1;
  return `${String(primaryId)}@${normalizedIndex}|${String(orderSignature)}`;
}

export function selectionOrderSignature(ids) {
  let hash = 2166136261;
  let length = 0;
  for (const id of ids || []) {
    const text = String(id);
    length += 1;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 31;
    hash = Math.imul(hash, 16777619);
  }
  return `${length}:${hash >>> 0}`;
}

export function centeredVerticalScrollTop({
  itemTop,
  itemHeight,
  viewportHeight,
  scrollHeight,
  topInset = 0,
  bottomInset = 0
}) {
  const height = Math.max(0, finiteNumber(viewportHeight));
  const insets = normalizeViewportInsets(height, {topInset, bottomInset});
  const maxScrollTop = Math.max(0, finiteNumber(scrollHeight) - height);
  const target = finiteNumber(itemTop) - insets.topInset - (insets.effectiveHeight - finiteNumber(itemHeight)) / 2;
  return Math.min(maxScrollTop, Math.max(0, target));
}

export function centerVirtualRowVertically(scroller, index, rowHeight, viewportInsets = {}) {
  if (!scroller || !Number.isInteger(index) || index < 0) return false;
  const scrollLeft = scroller.scrollLeft;
  const insets = normalizeViewportInsets(scroller.clientHeight, viewportInsets);
  const nextScrollTop = centeredVerticalScrollTop({
    itemTop: index * finiteNumber(rowHeight),
    itemHeight: rowHeight,
    viewportHeight: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight,
    ...insets
  });
  scroller.scrollTop = nextScrollTop;
  scroller.scrollLeft = scrollLeft;
  return Math.abs(finiteNumber(scroller.scrollTop) - nextScrollTop) <= CENTER_EPSILON;
}

export function centerElementVertically(scroller, element, viewportInsets = {}) {
  if (!scroller || !element?.getBoundingClientRect || !scroller.getBoundingClientRect) return false;
  const scrollLeft = scroller.scrollLeft;
  const currentScrollTop = finiteNumber(scroller.scrollTop);
  const itemRect = element.getBoundingClientRect();
  const viewportRect = scroller.getBoundingClientRect();
  const insets = normalizeViewportInsets(scroller.clientHeight, viewportInsets);
  const nextScrollTop = centeredVerticalScrollTop({
    itemTop: currentScrollTop + finiteNumber(itemRect.top) - finiteNumber(viewportRect.top),
    itemHeight: itemRect.height,
    viewportHeight: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight,
    ...insets
  });
  scroller.scrollTop = nextScrollTop;
  scroller.scrollLeft = scrollLeft;
  return Math.abs(finiteNumber(scroller.scrollTop) - nextScrollTop) <= CENTER_EPSILON;
}

export function stickyTableViewportInsets(scroller, tableHeader) {
  if (!scroller?.getBoundingClientRect || !tableHeader) return {topInset: 0, bottomInset: 0};
  const viewportRect = scroller.getBoundingClientRect();
  const viewportTop = finiteNumber(viewportRect.top);
  const viewportHeight = Math.max(0, finiteNumber(scroller.clientHeight));
  const viewportBottom = viewportTop + viewportHeight;
  const headerCells = typeof tableHeader.querySelectorAll === "function"
    ? Array.from(tableHeader.querySelectorAll("th"))
    : [];
  const measuredElements = headerCells.length ? headerCells : [tableHeader];
  let visibleBottom = viewportTop;
  for (const element of measuredElements) {
    const rect = element?.getBoundingClientRect?.();
    const top = Number(rect?.top);
    const bottom = Number(rect?.bottom);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
    if (bottom <= viewportTop || top >= viewportBottom) continue;
    visibleBottom = Math.max(visibleBottom, Math.min(viewportBottom, bottom));
  }
  return {
    topInset: Math.max(0, visibleBottom - viewportTop),
    bottomInset: 0
  };
}

export function createSelectionCenterController({
  getScroller,
  getTarget,
  getViewportInsets,
  prepareTarget,
  onSettled,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
}) {
  let frame = 0;
  let requestVersion = 0;
  let attempt = 0;

  function request() {
    cancelFrame();
    requestVersion += 1;
    attempt = 0;
    schedule(requestVersion);
  }

  function cancel() {
    requestVersion += 1;
    cancelFrame();
  }

  function schedule(version) {
    const view = getScroller()?.ownerDocument?.defaultView;
    if (!view?.requestAnimationFrame) {
      run(version);
      return;
    }
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      run(version);
    });
  }

  function run(version) {
    if (version !== requestVersion) return;
    const scroller = getScroller();
    if (!scroller) return;
    let target = getTarget?.();
    if (!target) {
      prepareTarget?.(scroller);
      target = getTarget?.();
    }
    const viewportInsets = target ? getViewportInsets?.(scroller, target) : null;
    const settled = target ? centerElementVertically(scroller, target, viewportInsets) : false;
    attempt += 1;
    if (settled) {
      onSettled?.();
      return;
    }
    if (attempt < maxAttempts) schedule(version);
  }

  function cancelFrame() {
    if (!frame) return;
    const view = getScroller()?.ownerDocument?.defaultView;
    view?.cancelAnimationFrame?.(frame);
    frame = 0;
  }

  return {request, cancel};
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeViewportInsets(viewportHeight, viewportInsets = {}) {
  const height = Math.max(0, finiteNumber(viewportHeight));
  const source = typeof viewportInsets === "number" ? {topInset: viewportInsets} : viewportInsets || {};
  const topInset = Math.min(height, Math.max(0, finiteNumber(source.topInset)));
  const bottomInset = Math.min(height - topInset, Math.max(0, finiteNumber(source.bottomInset)));
  return {
    topInset,
    bottomInset,
    effectiveHeight: Math.max(0, height - topInset - bottomInset)
  };
}
