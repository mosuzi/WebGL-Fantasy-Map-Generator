export function readTableScrollTop(container) {
  return tableScroller(container)?.scrollTop || 0;
}

export function restoreTableScrollTop(container, scrollTop) {
  const table = tableScroller(container);
  if (!table) return;
  const nextScrollTop = Math.max(0, scrollTop);
  table.scrollTop = nextScrollTop;
  const view = table.ownerDocument?.defaultView;
  view?.requestAnimationFrame?.(() => {
    table.scrollTop = nextScrollTop;
  });
}

function tableScroller(container) {
  return container?.querySelector(".object-table-el .el-scrollbar__wrap")
    || container?.querySelector(".object-table-wrap .el-scrollbar__wrap")
    || container?.querySelector(".object-table-wrap .el-table__body-wrapper")
    || container?.querySelector(".object-table-wrap");
}
