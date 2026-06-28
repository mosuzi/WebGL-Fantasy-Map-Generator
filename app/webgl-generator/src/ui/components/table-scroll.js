export function readTableScrollTop(container) {
  return container?.querySelector(".object-table-wrap")?.scrollTop || 0;
}

export function restoreTableScrollTop(container, scrollTop) {
  const table = container?.querySelector(".object-table-wrap");
  if (!table) return;
  const nextScrollTop = Math.max(0, scrollTop);
  table.scrollTop = nextScrollTop;
  const view = table.ownerDocument?.defaultView;
  view?.requestAnimationFrame?.(() => {
    table.scrollTop = nextScrollTop;
  });
}
