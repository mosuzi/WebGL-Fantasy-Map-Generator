export function createDetailGrid(documentRef, {className, rows, emptyText = "未选中对象"}) {
  const details = documentRef.createElement("div");
  details.className = className;
  if (!rows?.length) {
    details.textContent = emptyText;
    return details;
  }
  for (const row of rows) {
    details.append(isNode(row) ? row : detailLine(documentRef, row.label, row.value));
  }
  return details;
}

export function detailLine(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("span");
  const desc = documentRef.createElement("strong");
  term.textContent = label;
  desc.textContent = String(value);
  row.append(term, desc);
  return row;
}

function isNode(value) {
  return Boolean(value && typeof value === "object" && "nodeType" in value);
}
