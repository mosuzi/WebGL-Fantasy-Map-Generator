export function createGenerationPanel(documentRef, manager) {
  const panelRecord = manager.registerPanel("generation-panel", {
    title: "控制面板",
    left: 352,
    top: 24,
    width: 420,
    maxWidth: 520
  });

  manager.setContent("generation-panel", renderControlPanel(documentRef));
  installControlTabs(panelRecord.body);

  return {
    open() {
      manager.open("generation-panel");
    },
    body: panelRecord.body
  };
}

function renderControlPanel(documentRef) {
  const tabs = documentRef.createElement("div");
  tabs.className = "control-panel-tabs";
  const panels = documentRef.createElement("div");
  panels.className = "control-panel-tab-panels";
  const definitions = [
    ["generation", "生成", renderGenerationTab(documentRef)],
    ["themes", "专题", renderThemesTab(documentRef)],
    ["layers", "图层", renderLayersTab(documentRef)],
    ["management", "管理", renderManagementTab(documentRef)]
  ];

  for (const [id, label, panel] of definitions) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = id === "generation" ? "active" : "";
    button.dataset.controlTab = id;
    button.textContent = label;
    panel.dataset.controlPanel = id;
    panel.hidden = id !== "generation";
    tabs.append(button);
    panels.append(panel);
  }

  return [tabs, panels];
}

function renderGenerationTab(documentRef) {
  const form = documentRef.createElement("div");
  form.className = "generation-panel-form";
  form.append(
    textField(documentRef, "Seed", "seed-input", "text", {
      value: "stage-2-1",
      autocomplete: "off"
    }),
    numberField(documentRef, "目标 cells", "cells-input", {
      min: 1000,
      max: 100000,
      step: 1000,
      value: 10000
    }),
    numberField(documentRef, "宽度", "width-input", {
      min: 640,
      max: 4096,
      step: 80,
      value: 1440
    }),
    numberField(documentRef, "高度", "height-input", {
      min: 480,
      max: 4096,
      step: 80,
      value: 960
    }),
    terrainField(documentRef),
    autoSeedField(documentRef),
    buttonRow(documentRef)
  );
  return form;
}

function renderThemesTab(documentRef) {
  const panel = documentRef.createElement("div");
  panel.className = "control-panel-section";
  const segmented = documentRef.createElement("div");
  segmented.className = "segmented";
  segmented.setAttribute("role", "group");
  segmented.setAttribute("aria-label", "专题");
  for (const [mode, label] of [
    ["height", "高度"],
    ["temperature", "温度"],
    ["precipitation", "降水"],
    ["biomes", "生物群系"],
    ["cultures", "文化"],
    ["religions", "宗教"],
    ["states", "国家"],
    ["provinces", "省份"],
    ["regions", "区域"],
    ["population", "人口"]
  ]) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.dataset.mode = mode;
    button.textContent = label;
    if (mode === "height") button.className = "active";
    segmented.append(button);
  }
  panel.append(segmented, oceanHeightToggle(documentRef));
  return panel;
}

function renderLayersTab(documentRef) {
  const panel = documentRef.createElement("div");
  panel.className = "control-panel-section";
  const grid = documentRef.createElement("div");
  grid.className = "layer-toggle-grid";
  for (const [layer, label] of [
    ["routes", "道路"],
    ["rivers", "河流"],
    ["cities", "城市"],
    ["labels", "城市标签"],
    ["stateBorders", "国界"],
    ["provinceBorders", "省界"],
    ["coastline", "海岸线"]
  ]) {
    grid.append(layerToggleButton(documentRef, layer, label));
  }
  panel.append(grid, labelLimitSlider(documentRef));
  return panel;
}

function renderManagementTab(documentRef) {
  const panel = documentRef.createElement("div");
  panel.className = "control-panel-section management-panel-actions";
  panel.append(
    actionButton(documentRef, "fit-view", "适配视图"),
    actionButton(documentRef, "open-height-panel", "高度编辑"),
    actionButton(documentRef, "open-state-panel", "国家编辑"),
    actionButton(documentRef, "open-province-panel", "省份管理"),
    actionButton(documentRef, "open-city-panel", "城市管理"),
    actionButton(documentRef, "open-route-panel", "路线管理"),
    actionButton(documentRef, "open-river-panel", "河流管理")
  );
  return panel;
}

function installControlTabs(root) {
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-control-tab]");
    if (!button || !root.contains(button)) return;
    const target = button.dataset.controlTab;
    for (const item of root.querySelectorAll("[data-control-tab]")) {
      item.classList.toggle("active", item === button);
    }
    for (const panel of root.querySelectorAll("[data-control-panel]")) {
      panel.hidden = panel.dataset.controlPanel !== target;
    }
  });
}

function textField(documentRef, label, id, type, attributes = {}) {
  const field = documentRef.createElement("label");
  field.className = "generation-field-row";
  const text = documentRef.createElement("span");
  text.textContent = label;
  const input = documentRef.createElement("input");
  input.id = id;
  input.type = type;
  for (const [key, value] of Object.entries(attributes)) {
    input.setAttribute(key, String(value));
  }
  field.append(text, input);
  return field;
}

function numberField(documentRef, label, id, attributes) {
  return textField(documentRef, label, id, "number", attributes);
}

function terrainField(documentRef) {
  const field = documentRef.createElement("label");
  field.className = "generation-field-row";
  const text = documentRef.createElement("span");
  text.textContent = "地形";
  const select = documentRef.createElement("select");
  select.id = "heightmap-template";
  for (const option of [
    ["continents", "大陆"],
    ["mediterranean", "地中海"],
    ["highIsland", "高山岛屿"],
    ["lowIsland", "平原岛屿"],
    ["peninsula", "一侧大陆"],
    ["pangea", "盘古大陆"],
    ["archipelago", "群岛"]
  ]) {
    const item = documentRef.createElement("option");
    item.value = option[0];
    item.textContent = option[1];
    item.selected = option[0] === "continents";
    select.append(item);
  }
  field.append(text, select);
  return field;
}

function autoSeedField(documentRef) {
  return checkRow(documentRef, "生成时自动随机 seed", {id: "auto-random-seed"});
}

function buttonRow(documentRef) {
  const row = documentRef.createElement("div");
  row.className = "generation-button-row";
  const generate = documentRef.createElement("button");
  generate.id = "generate-map";
  generate.className = "primary-action";
  generate.type = "button";
  generate.textContent = "生成 grid 地图";
  const randomSeed = documentRef.createElement("button");
  randomSeed.id = "random-seed";
  randomSeed.className = "secondary-action";
  randomSeed.type = "button";
  randomSeed.textContent = "换 seed";
  row.append(generate, randomSeed);
  return row;
}

function oceanHeightToggle(documentRef) {
  return checkRow(documentRef, "高度专题显示海底", {id: "show-ocean-height"});
}

function checkRow(documentRef, label, options = {}) {
  const row = documentRef.createElement("label");
  row.className = "generation-check-row";
  const input = documentRef.createElement("input");
  input.type = "checkbox";
  if (options.id) input.id = options.id;
  if (options.checked) input.checked = true;
  for (const [key, value] of Object.entries(options.dataset || {})) {
    input.dataset[key] = value;
  }
  const text = documentRef.createElement("span");
  text.textContent = label;
  row.append(input, text);
  return row;
}

function actionButton(documentRef, id, label) {
  const button = documentRef.createElement("button");
  button.id = id;
  button.className = "secondary-action";
  button.type = "button";
  button.textContent = label;
  return button;
}

function layerToggleButton(documentRef, layer, label) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "layer-toggle-button active";
  button.dataset.layer = layer;
  button.setAttribute("aria-pressed", "true");
  const indicator = documentRef.createElement("span");
  indicator.className = "layer-toggle-indicator";
  const text = documentRef.createElement("span");
  text.textContent = label;
  button.append(indicator, text);
  return button;
}

function labelLimitSlider(documentRef) {
  const field = documentRef.createElement("label");
  field.className = "label-limit-field";
  const header = documentRef.createElement("span");
  header.textContent = "城市标签上限";
  const input = documentRef.createElement("input");
  input.id = "max-city-labels";
  input.type = "range";
  input.min = "8";
  input.max = "5000";
  input.step = "1";
  input.value = "5000";
  const value = documentRef.createElement("output");
  value.id = "max-city-labels-value";
  value.htmlFor = "max-city-labels";
  value.textContent = input.value;
  field.append(header, input, value);
  return field;
}
