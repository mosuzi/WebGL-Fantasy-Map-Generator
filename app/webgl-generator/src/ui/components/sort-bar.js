export function createSortBar(documentRef, {className, options, activeKey, direction, onSort}) {
  const sort = documentRef.createElement("div");
  sort.className = className;
  for (const [key, label] of options) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = activeKey === key ? "active" : "";
    button.textContent = activeKey === key ? `${label} ${direction === "asc" ? "↑" : "↓"}` : label;
    button.addEventListener("click", () => onSort(key));
    sort.append(button);
  }
  return sort;
}
