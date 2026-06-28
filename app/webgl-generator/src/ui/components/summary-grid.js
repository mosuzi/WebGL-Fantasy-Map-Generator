export function createSummaryGrid(documentRef, {className, items}) {
  const summary = documentRef.createElement("div");
  summary.className = className;
  for (const item of items) {
    const node = documentRef.createElement("div");
    const term = documentRef.createElement("span");
    const desc = documentRef.createElement("strong");
    term.textContent = item.label;
    desc.textContent = String(item.value);
    node.append(term, desc);
    summary.append(node);
  }
  return summary;
}
