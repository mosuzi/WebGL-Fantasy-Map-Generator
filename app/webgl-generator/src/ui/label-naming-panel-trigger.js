export function bindLabelNamingPanelTrigger(documentRef, handler) {
  const listener = event => {
    const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
    const trigger = target?.closest?.("#open-label-naming-panel");
    if (!trigger || (typeof documentRef.contains === "function" && !documentRef.contains(trigger))) return;
    handler?.({currentTarget: trigger, target: event.target, originalEvent: event});
  };
  documentRef.addEventListener("click", listener);
  return () => documentRef.removeEventListener("click", listener);
}
