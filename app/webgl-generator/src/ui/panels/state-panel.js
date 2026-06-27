export function createStatePanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    active: false,
    map: null,
    targetStateId: null,
    sourceStateId: null,
    radius: 28,
    lastAffected: 0,
    history: null
  };

  manager.registerPanel("state-panel", {
    title: "国家编辑",
    left: 400,
    top: 128,
    width: 380,
    maxWidth: 440,
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
      render();
    }
  });

  function render() {
    manager.setContent("state-panel", renderStatePanel(documentRef, panelState, {
      onActiveChange: active => {
        panelState.active = active;
        callbacks.onActiveChange?.(active);
        render();
      },
      onTargetStateId: stateId => {
        panelState.targetStateId = stateId;
        render();
      },
      onRadius: radius => {
        panelState.radius = radius;
        render();
      },
      onColorChange: color => callbacks.onColorChange?.(panelState.targetStateId, color),
      onCapitalChange: burgId => callbacks.onCapitalChange?.(panelState.targetStateId, burgId),
      onSampleSelection: () => callbacks.onSampleSelection?.(),
      onSampleHover: () => callbacks.onSampleHover?.(),
      onUndo: () => callbacks.onUndo?.(),
      onRedo: () => callbacks.onRedo?.()
    }));
  }

  return {
    open(map, history) {
      panelState.map = map;
      panelState.history = history;
      if (panelState.targetStateId === null) panelState.targetStateId = firstStateId(map);
      render();
      manager.open("state-panel");
    },
    update({map = panelState.map, sourceStateId = panelState.sourceStateId, lastAffected = panelState.lastAffected, history = panelState.history} = {}) {
      panelState.map = map;
      panelState.sourceStateId = sourceStateId;
      panelState.lastAffected = lastAffected;
      panelState.history = history;
      if (!stateExists(map, panelState.targetStateId)) panelState.targetStateId = firstStateId(map);
      render();
    },
    getBrush() {
      return {
        active: panelState.active,
        targetStateId: panelState.targetStateId,
        radius: panelState.radius
      };
    },
    setTargetStateId(stateId) {
      panelState.targetStateId = stateExists(panelState.map, stateId) ? stateId : panelState.targetStateId;
      render();
    },
    setActive(active) {
      panelState.active = active;
      render();
    }
  };
}

function renderStatePanel(documentRef, state, callbacks) {
  const summary = documentRef.createElement("div");
  summary.className = "state-panel-summary";
  summary.append(
    metric(documentRef, "状态", state.active ? "编辑中" : "未启用"),
    metric(documentRef, "目标国家", formatStateName(state.map, state.targetStateId)),
    metric(documentRef, "来源国家", formatStateName(state.map, state.sourceStateId)),
    metric(documentRef, "影响", state.lastAffected),
    metric(documentRef, "历史", state.history ? `undo ${state.history.undo} / redo ${state.history.redo}` : "none")
  );

  const active = documentRef.createElement("button");
  active.type = "button";
  active.className = state.active ? "primary-action" : "secondary-action";
  active.textContent = state.active ? "停止国家编辑" : "启用国家编辑";
  active.addEventListener("click", () => callbacks.onActiveChange(!state.active));

  const target = targetSelector(documentRef, state, callbacks);
  const color = colorField(documentRef, state, callbacks);
  const capital = capitalField(documentRef, state, callbacks);
  const sampleActions = documentRef.createElement("div");
  sampleActions.className = "state-sample-actions";
  const sampleSelection = documentRef.createElement("button");
  sampleSelection.type = "button";
  sampleSelection.className = "secondary-action";
  sampleSelection.textContent = "取选中";
  sampleSelection.addEventListener("click", callbacks.onSampleSelection);
  const sampleHover = documentRef.createElement("button");
  sampleHover.type = "button";
  sampleHover.className = "secondary-action";
  sampleHover.textContent = "取悬停";
  sampleHover.addEventListener("click", callbacks.onSampleHover);
  sampleActions.append(sampleSelection, sampleHover);

  const radius = rangeField(documentRef, "半径", state.radius, 4, 120, 2, value => callbacks.onRadius(value));

  const historyActions = documentRef.createElement("div");
  historyActions.className = "state-history-actions";
  const undo = documentRef.createElement("button");
  undo.type = "button";
  undo.className = "secondary-action";
  undo.textContent = "撤销上次";
  undo.addEventListener("click", callbacks.onUndo);
  const redo = documentRef.createElement("button");
  redo.type = "button";
  redo.className = "secondary-action";
  redo.textContent = "重做上次";
  redo.addEventListener("click", callbacks.onRedo);
  historyActions.append(undo, redo);

  return [summary, active, target, color, capital, sampleActions, radius, historyActions];
}

function targetSelector(documentRef, state, callbacks) {
  const field = documentRef.createElement("label");
  field.className = "state-select-field";
  const text = documentRef.createElement("span");
  text.textContent = "目标";
  const select = documentRef.createElement("select");
  for (const item of stateRows(state.map)) {
    const option = documentRef.createElement("option");
    option.value = String(item.id);
    option.textContent = item.name;
    option.selected = item.id === state.targetStateId;
    select.append(option);
  }
  select.addEventListener("change", () => callbacks.onTargetStateId(Number(select.value)));
  field.append(text, select);
  return field;
}

function colorField(documentRef, state, callbacks) {
  const target = state.map?.politics?.states?.[state.targetStateId];
  const field = documentRef.createElement("label");
  field.className = "state-color-field";
  const text = documentRef.createElement("span");
  text.textContent = "颜色";
  const input = documentRef.createElement("input");
  input.type = "color";
  input.value = normalizeHexColor(target?.color) || fallbackStateColor(state.targetStateId);
  const value = documentRef.createElement("strong");
  value.textContent = input.value;
  input.addEventListener("input", () => {
    value.textContent = input.value;
  });
  input.addEventListener("change", () => callbacks.onColorChange(input.value));
  field.append(text, input, value);
  return field;
}

function capitalField(documentRef, state, callbacks) {
  const target = state.map?.politics?.states?.[state.targetStateId];
  const cities = stateCities(state.map, state.targetStateId);
  const field = documentRef.createElement("div");
  field.className = "state-capital-field";
  const label = documentRef.createElement("label");
  const text = documentRef.createElement("span");
  text.textContent = "首都";
  const select = documentRef.createElement("select");
  select.disabled = !cities.length;
  for (const city of cities) {
    const option = documentRef.createElement("option");
    option.value = String(city.burgId);
    option.textContent = city.name;
    option.selected = city.burgId === target?.capital;
    select.append(option);
  }
  label.append(text, select);

  const apply = documentRef.createElement("button");
  apply.type = "button";
  apply.className = "secondary-action";
  apply.textContent = "设为首都";
  apply.disabled = !cities.length;
  apply.addEventListener("click", () => callbacks.onCapitalChange(Number(select.value)));
  field.append(label, apply);
  return field;
}

function rangeField(documentRef, label, value, min, max, step, onInput) {
  const field = documentRef.createElement("label");
  field.className = "state-range-field";
  const text = documentRef.createElement("span");
  text.textContent = label;
  const input = documentRef.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const output = documentRef.createElement("strong");
  output.textContent = String(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    output.textContent = String(next);
    onInput(next);
  });
  field.append(text, input, output);
  return field;
}

function metric(documentRef, label, value) {
  const item = documentRef.createElement("div");
  const term = documentRef.createElement("span");
  const desc = documentRef.createElement("strong");
  term.textContent = label;
  desc.textContent = String(value);
  item.append(term, desc);
  return item;
}

function stateRows(map) {
  return (map?.politics?.states || []).filter(state => state?.i || state?.id).map(state => ({
    id: state.id ?? state.i,
    name: state.fullName || state.name || `国家 #${state.id ?? state.i}`
  }));
}

function stateCities(map, stateId) {
  return (map?.settlements?.cities || [])
    .filter(city => city?.burgId && city.state === stateId)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population || a.id - b.id);
}

function firstStateId(map) {
  return stateRows(map)[0]?.id ?? null;
}

function stateExists(map, stateId) {
  if (stateId === null || stateId === undefined) return false;
  return Boolean(map?.politics?.states?.[stateId]);
}

function formatStateName(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  if (!state) return "none";
  return state.fullName || state.name || `#${stateId}`;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackStateColor(stateId) {
  const hue = ((Number(stateId) || 0) * 0.61803398875 + 0.12) % 1;
  const [r, g, b] = hslToRgb(hue, 0.42, 0.56);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function toHex(channel) {
  return Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0");
}
