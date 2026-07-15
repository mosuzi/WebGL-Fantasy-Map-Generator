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

export function centeredVerticalScrollTop({itemTop, itemHeight, viewportHeight, scrollHeight}) {
  const maxScrollTop = Math.max(0, finiteNumber(scrollHeight) - finiteNumber(viewportHeight));
  const target = finiteNumber(itemTop) - (finiteNumber(viewportHeight) - finiteNumber(itemHeight)) / 2;
  return Math.min(maxScrollTop, Math.max(0, target));
}

export function centerVirtualRowVertically(scroller, index, rowHeight) {
  if (!scroller || !Number.isInteger(index) || index < 0) return false;
  const scrollLeft = scroller.scrollLeft;
  const nextScrollTop = centeredVerticalScrollTop({
    itemTop: index * finiteNumber(rowHeight),
    itemHeight: rowHeight,
    viewportHeight: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight
  });
  scroller.scrollTop = nextScrollTop;
  scroller.scrollLeft = scrollLeft;
  return Math.abs(finiteNumber(scroller.scrollTop) - nextScrollTop) <= CENTER_EPSILON;
}

export function centerElementVertically(scroller, element) {
  if (!scroller || !element?.getBoundingClientRect || !scroller.getBoundingClientRect) return false;
  const scrollLeft = scroller.scrollLeft;
  const currentScrollTop = finiteNumber(scroller.scrollTop);
  const itemRect = element.getBoundingClientRect();
  const viewportRect = scroller.getBoundingClientRect();
  const nextScrollTop = centeredVerticalScrollTop({
    itemTop: currentScrollTop + finiteNumber(itemRect.top) - finiteNumber(viewportRect.top),
    itemHeight: itemRect.height,
    viewportHeight: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight
  });
  scroller.scrollTop = nextScrollTop;
  scroller.scrollLeft = scrollLeft;
  return Math.abs(finiteNumber(scroller.scrollTop) - nextScrollTop) <= CENTER_EPSILON;
}

export function createSelectionCenterController({
  getScroller,
  getTarget,
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
    const settled = target ? centerElementVertically(scroller, target) : false;
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
