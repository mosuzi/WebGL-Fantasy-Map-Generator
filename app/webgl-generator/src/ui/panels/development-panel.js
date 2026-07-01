export function createDevelopmentPanel(documentRef, manager) {
  const control = documentRef.getElementById("open-development-panel");
  const record = manager.registerPanel("development-panel", {
    title: "开发模式",
    left: 24,
    top: 72,
    width: 420,
    maxWidth: 560,
    onClose: () => {
      if (!enabled) return;
      collapsed = true;
      showControl(true);
    }
  });

  const body = createDevelopmentPanelBody(documentRef, {
    onCollapse: () => collapse()
  });
  record.body.replaceChildren(body);

  let enabled = false;
  let collapsed = false;

  control?.addEventListener("click", () => {
    if (!enabled) setEnabled(true, {open: true});
    else if (collapsed || record.panel.classList.contains("hidden")) open();
    else collapse();
  });

  const api = {
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      setEnabled(Boolean(value), {open: Boolean(value)});
    },
    open: () => {
      setEnabled(true, {open: true});
    },
    close: () => {
      setEnabled(false);
    },
    collapse,
    toggle: () => {
      if (!enabled || collapsed || record.panel.classList.contains("hidden")) {
        setEnabled(true, {open: true});
      } else {
        collapse();
      }
    },
    get collapsed() {
      return collapsed;
    },
    panel: record.panel
  };

  documentRef.defaultView.__webglGeneratorDebug = api;
  if (new URLSearchParams(documentRef.defaultView.location.search).get("debug") === "1") setEnabled(true, {open: true});
  else showControl(false);

  return api;

  function setEnabled(value, options = {}) {
    enabled = Boolean(value);
    collapsed = !enabled || collapsed;
    showControl(enabled);
    if (!enabled) {
      manager.close("development-panel");
      return;
    }
    if (options.open) open();
  }

  function open() {
    if (!enabled) enabled = true;
    collapsed = false;
    showControl(true);
    manager.open("development-panel");
    control?.classList.add("active");
    control?.setAttribute("aria-pressed", "true");
  }

  function collapse() {
    if (!enabled) return;
    collapsed = true;
    manager.close("development-panel");
    showControl(true);
    control?.classList.remove("active");
    control?.setAttribute("aria-pressed", "false");
  }

  function showControl(visible) {
    if (!control) return;
    control.hidden = !visible;
    control.textContent = collapsed ? "开发模式" : "调试信息";
    control.setAttribute("aria-pressed", !record.panel.classList.contains("hidden") ? "true" : "false");
  }
}

function createDevelopmentPanelBody(documentRef, callbacks) {
  const root = documentRef.createElement("div");
  root.className = "development-panel-content";
  root.append(
    developmentToolbar(documentRef, callbacks),
    developmentSection(documentRef, "状态", [paragraph(documentRef, "app-status", "初始化中")]),
    developmentSection(documentRef, "运行时", [definitionList(documentRef, "runtime-stats")]),
    developmentSection(documentRef, "选择", [definitionList(documentRef, "pick-stats")]),
    developmentSection(documentRef, "边界", [boundaryList(documentRef)])
  );
  return root;
}

function developmentToolbar(documentRef, callbacks) {
  const toolbar = documentRef.createElement("div");
  toolbar.className = "development-panel-toolbar";
  const note = documentRef.createElement("span");
  note.textContent = "仅显示调试、性能和内部状态";
  const collapse = documentRef.createElement("button");
  collapse.type = "button";
  collapse.className = "secondary-action";
  collapse.textContent = "收起";
  collapse.addEventListener("click", callbacks.onCollapse);
  toolbar.append(note, collapse);
  return toolbar;
}

function developmentSection(documentRef, titleText, children) {
  const section = documentRef.createElement("section");
  section.className = "development-panel-section";
  const title = documentRef.createElement("h3");
  title.textContent = titleText;
  section.append(title, ...children);
  return section;
}

function paragraph(documentRef, id, text) {
  const item = documentRef.createElement("p");
  item.id = id;
  item.textContent = text;
  return item;
}

function definitionList(documentRef, id) {
  const list = documentRef.createElement("dl");
  list.id = id;
  list.className = "stats-list";
  return list;
}

function boundaryList(documentRef) {
  const list = definitionList(documentRef, "development-boundary-stats");
  list.append(
    statRow(documentRef, "正式应用", "app/webgl-generator"),
    statRow(documentRef, "快照 demo", "prototype/webgl-cells"),
    statRow(documentRef, "source", "只读参考")
  );
  return list;
}

function statRow(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("dt");
  const detail = documentRef.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  row.append(term, detail);
  return row;
}
