export function createObjectDetailsPanel(documentRef, manager, callbacks = {}) {
  let currentObject = null;
  let currentEditingObject = null;
  let suppressNextViewOpenFor = null;

  manager.registerPanel("object-details", {
    title: "对象详情",
    left: 24,
    top: 24,
    width: 320,
    onClose: () => {
      const closedObject = currentObject;
      const wasEditing = currentEditingObject;
      currentEditingObject = null;
      if (!wasEditing) return;
      suppressNextViewOpenFor = closedObject;
      callbacks.onCancelEdit?.();
    }
  });

  return {
    show(selection, editingObject = null) {
      if (!selection?.object) {
        currentObject = null;
        currentEditingObject = null;
        suppressNextViewOpenFor = null;
        manager.close("object-details");
        return;
      }
      if (selection.object.kind === "state" || selection.object.kind === "river" || selection.object.kind === "city") {
        currentObject = null;
        currentEditingObject = null;
        suppressNextViewOpenFor = null;
        manager.close("object-details");
        return;
      }
      currentObject = selection.object;
      currentEditingObject = editingObject;
      manager.setContent("object-details", renderDetails(documentRef, selection.object, editingObject, {
        onEdit: () => callbacks.onEdit?.(selection.object),
        onCancelEdit: () => callbacks.onCancelEdit?.(),
        onLocate: () => callbacks.onLocate?.(selection.object),
        onRename: name => callbacks.onRename?.(selection.object, name)
      }));
      if (!editingObject && isSameObject(selection.object, suppressNextViewOpenFor)) {
        suppressNextViewOpenFor = null;
        return;
      }
      suppressNextViewOpenFor = null;
      manager.open("object-details");
    },
    clear() {
      manager.close("object-details");
    }
  };
}

function renderDetails(documentRef, object, editingObject, callbacks) {
  const title = documentRef.createElement("div");
  title.className = "object-details-title";
  title.textContent = formatObjectTitle(object);
  const editing = isSameObject(object, editingObject);

  const rows = documentRef.createElement("dl");
  rows.className = "object-details-list";
  for (const [label, value] of [...detailRows(object), ["状态", editing ? "编辑" : "查看"]]) {
    const row = documentRef.createElement("div");
    const term = documentRef.createElement("dt");
    const desc = documentRef.createElement("dd");
    term.textContent = label;
    desc.textContent = String(value);
    row.append(term, desc);
    rows.append(row);
  }

  const actions = documentRef.createElement("div");
  actions.className = "object-details-actions";
  const locate = documentRef.createElement("button");
  locate.type = "button";
  locate.className = "secondary-action";
  locate.textContent = "定位";
  locate.addEventListener("click", callbacks.onLocate);
  const edit = documentRef.createElement("button");
  edit.type = "button";
  edit.className = "secondary-action";
  edit.textContent = editing ? "退出编辑" : "编辑";
  edit.addEventListener("click", editing ? callbacks.onCancelEdit : callbacks.onEdit);
  actions.append(locate, edit);
  const content = [title, rows];
  if (editing && canRenameObject(object)) content.push(nameEditor(documentRef, object, callbacks));
  content.push(actions);
  return content;
}

function isSameObject(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function formatObjectTitle(object) {
  if (object.kind === "city") return `城市 ${object.name}`;
  if (object.kind === "label") return `标签 ${object.text}`;
  if (object.kind === "marker") return `标记 ${object.name}`;
  if (object.kind === "route") return `路线 ${object.from} -> ${object.to}`;
  if (object.kind === "river") return `河流 ${object.name || `#${object.id}`}`;
  if (object.kind === "province") return `省份 ${object.name}`;
  if (object.kind === "region") return `区域 ${object.name}`;
  return "未知对象";
}

function detailRows(object) {
  if (object.kind === "city") {
    return [
      ["类型", object.type],
      ["人口", object.population],
      ["国家", object.state],
      ["省份", object.province],
      ["对象 id", object.id]
    ];
  }
  if (object.kind === "route") {
    return [
      ["类型", object.type],
      ["等级", object.level],
      ["起点", object.from],
      ["终点", object.to],
      ["命中距离", formatDistance(object.distance)],
      ["对象 id", object.id]
    ];
  }
  if (object.kind === "marker") {
    return [
      ["类型", object.type],
      ["cell", object.cell],
      ["数据", formatMarkerData(object.data)],
      ["对象 id", object.id]
    ];
  }
  if (object.kind === "label") {
    return [
      ["文本", object.text],
      ["目标类型", object.targetKind],
      ["目标名称", object.targetName],
      ["显示序位", object.rank],
      ["对象 id", object.id]
    ];
  }
  if (object.kind === "river") {
    return [
      ["名称", object.name || `#${object.id}`],
      ["类型", object.type],
      ["流量", object.flux],
      ["长度", object.length],
      ["命中距离", formatDistance(object.distance)],
      ["对象 id", object.id]
    ];
  }
  if (object.kind === "province") {
    return [
      ["所属国家", object.state],
      ["国家 id", object.stateId],
      ["中心 cell", object.centerCell],
      ["对象 id", object.id]
    ];
  }
  if (object.kind === "region") {
    return [
      ["类型", "region"],
      ["对象 id", object.id]
    ];
  }
  return [["类型", object.kind || "unknown"]];
}

function canRenameObject(object) {
  return object.kind === "city" || (object.kind === "label" && object.targetKind === "city");
}

function nameEditor(documentRef, object, callbacks) {
  const editor = documentRef.createElement("form");
  editor.className = "object-name-editor";
  const label = documentRef.createElement("label");
  const text = documentRef.createElement("span");
  text.textContent = "名称";
  const input = documentRef.createElement("input");
  input.type = "text";
  input.maxLength = 48;
  input.value = object.name || object.text || object.targetName || "";
  label.append(text, input);

  const apply = documentRef.createElement("button");
  apply.type = "submit";
  apply.className = "secondary-action";
  apply.textContent = "应用名称";
  editor.addEventListener("submit", event => {
    event.preventDefault();
    callbacks.onRename(input.value);
  });

  editor.append(label, apply);
  return editor;
}

function formatMarkerData(data = {}) {
  return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(" / ") || "none";
}

function formatDistance(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}
