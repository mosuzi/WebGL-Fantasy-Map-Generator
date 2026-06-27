export function createHeightPanel(documentRef, manager, callbacks = {}) {
  const panelState = {
    active: false,
    action: "raise",
    radius: 28,
    strength: 4,
    falloff: true,
    lastAffected: 0,
    lastHeight: "none",
    history: null
  };

  manager.registerPanel("height-panel", {
    title: "高度编辑",
    left: 360,
    top: 110,
    width: 360,
    maxWidth: 420,
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
      render();
    }
  });

  function render() {
    manager.setContent("height-panel", renderHeightPanel(documentRef, panelState, {
      onActiveChange: active => {
        panelState.active = active;
        callbacks.onActiveChange?.(active);
        render();
      },
      onAction: action => {
        panelState.action = action;
        render();
      },
      onRadius: radius => {
        panelState.radius = radius;
        render();
      },
      onStrength: strength => {
        panelState.strength = strength;
        render();
      },
      onFalloff: falloff => {
        panelState.falloff = falloff;
        render();
      },
      onUndo: () => callbacks.onUndo?.(),
      onRedo: () => callbacks.onRedo?.()
    }));
  }

  return {
    open(history) {
      panelState.history = history;
      render();
      manager.open("height-panel");
    },
    update({lastAffected = panelState.lastAffected, lastHeight = panelState.lastHeight, history = panelState.history} = {}) {
      panelState.lastAffected = lastAffected;
      panelState.lastHeight = lastHeight;
      panelState.history = history;
      render();
    },
    getBrush() {
      return {
        active: panelState.active,
        action: panelState.action,
        radius: panelState.radius,
        strength: panelState.strength,
        falloff: panelState.falloff
      };
    },
    setActive(active) {
      panelState.active = active;
      render();
    }
  };
}

function renderHeightPanel(documentRef, state, callbacks) {
  const summary = documentRef.createElement("div");
  summary.className = "height-panel-summary";
  summary.append(
    metric(documentRef, "状态", state.active ? "编辑中" : "未启用"),
    metric(documentRef, "影响", state.lastAffected),
    metric(documentRef, "高度", state.lastHeight),
    metric(documentRef, "历史", state.history ? `undo ${state.history.undo} / redo ${state.history.redo}` : "none")
  );

  const active = documentRef.createElement("button");
  active.type = "button";
  active.className = state.active ? "primary-action" : "secondary-action";
  active.textContent = state.active ? "停止高度编辑" : "启用高度编辑";
  active.addEventListener("click", () => callbacks.onActiveChange(!state.active));

  const actions = documentRef.createElement("div");
  actions.className = "height-action-group";
  for (const [action, label] of [["raise", "抬升"], ["lower", "降低"], ["smooth", "平滑"]]) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = state.action === action ? "active" : "";
    button.textContent = label;
    button.addEventListener("click", () => callbacks.onAction(action));
    actions.append(button);
  }

  const radius = rangeField(documentRef, "半径", state.radius, 6, 96, 2, value => callbacks.onRadius(value));
  const strength = rangeField(documentRef, "强度", state.strength, 1, 18, 1, value => callbacks.onStrength(value));

  const falloff = documentRef.createElement("label");
  falloff.className = "height-check-row";
  const checkbox = documentRef.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.falloff;
  checkbox.addEventListener("change", () => callbacks.onFalloff(checkbox.checked));
  const falloffText = documentRef.createElement("span");
  falloffText.textContent = "中心衰减";
  falloff.append(checkbox, falloffText);

  const historyActions = documentRef.createElement("div");
  historyActions.className = "height-history-actions";
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

  return [summary, active, actions, radius, strength, falloff, historyActions];
}

function rangeField(documentRef, label, value, min, max, step, onInput) {
  const field = documentRef.createElement("label");
  field.className = "height-range-field";
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
