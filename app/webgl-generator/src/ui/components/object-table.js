export function createObjectTable(documentRef, options) {
  const wrapper = documentRef.createElement("div");
  wrapper.className = "object-table-wrap";

  const table = documentRef.createElement("table");
  table.className = "object-table";
  const thead = documentRef.createElement("thead");
  const headRow = documentRef.createElement("tr");
  for (const column of options.columns) {
    const th = documentRef.createElement("th");
    th.textContent = column.label;
    if (column.align) th.dataset.align = column.align;
    headRow.append(th);
  }
  const actionHead = documentRef.createElement("th");
  actionHead.textContent = "";
  headRow.append(actionHead);
  thead.append(headRow);

  const tbody = documentRef.createElement("tbody");
  if (!options.rows.length) {
    const emptyRow = documentRef.createElement("tr");
    const emptyCell = documentRef.createElement("td");
    emptyCell.colSpan = options.columns.length + 1;
    emptyCell.className = "object-table-empty";
    emptyCell.textContent = options.emptyText || "无数据";
    emptyRow.append(emptyCell);
    tbody.append(emptyRow);
  } else {
    for (const row of options.rows) {
      const tr = documentRef.createElement("tr");
      const rowId = options.getRowId(row);
      tr.className = rowId === options.selectedId ? "selected" : "";
      tr.addEventListener("click", () => options.onSelect?.(row));
      tr.addEventListener("dblclick", () => options.onLocate?.(row));
      for (const column of options.columns) {
        const td = documentRef.createElement("td");
        if (column.align) td.dataset.align = column.align;
        td.textContent = String(column.format ? column.format(row[column.key], row) : row[column.key]);
        tr.append(td);
      }
      const action = documentRef.createElement("td");
      action.dataset.align = "right";
      const locate = documentRef.createElement("button");
      locate.type = "button";
      locate.className = "table-icon-action";
      locate.textContent = "定位";
      locate.addEventListener("click", event => {
        event.stopPropagation();
        options.onLocate?.(row);
      });
      action.append(locate);
      tr.append(action);
      tbody.append(tr);
    }
  }

  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}
