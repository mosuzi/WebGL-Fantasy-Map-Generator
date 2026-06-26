import {clamp} from "./utils.js";

const DEFAULT_STATUS = "未编辑";
const RIVER_PICK_SCREEN_RADIUS = 16;

export class DemoEditorController {
  constructor({renderer, overlays, elements, onChange}) {
    this.renderer = renderer;
    this.overlays = overlays;
    this.elements = elements;
    this.onChange = onChange;
    this.tool = "view";
    this.heightAction = "raise";
    this.stateAction = "sample";
    this.selectedStateId = 0;
    this.selectedRiverId = null;
    this.history = [];
    this.activeOperation = null;
    this.status = DEFAULT_STATUS;
    this.bindControls();
  }

  loadSnapshot(snapshot) {
    this.originalSnapshot = structuredClone(snapshot);
    this.selectedStateId = firstAliveStateId(snapshot);
    this.syncStateColorInput();
    this.renderStatus("编辑器已就绪");
  }

  handlePointerDown(event) {
    if (this.tool === "view") return false;
    event.preventDefault();
    this.renderer.canvas.setPointerCapture(event.pointerId);

    if (this.tool === "height") {
      this.activeOperation = {type: "height", grid: new Map(), pack: new Map()};
      this.applyHeightBrush(event);
      return true;
    }

    if (this.tool === "river") {
      const picked = this.pickRiver(event);
      if (!picked) {
        this.renderStatus("未命中河流");
        return true;
      }
      this.selectedRiverId = picked.river.i;
      const before = cloneRiver(picked.river);

      if (this.elements.riverAction.value === "width") {
        const amount = Number(this.elements.riverWidth.value || 0);
        picked.river.widthFactor = round(clamp(Number(picked.river.widthFactor || 1) + amount, 0.15, 3));
        this.history.push({type: "river", riverId: picked.river.i, before});
        this.renderer.rebuildBuffers();
        this.renderStatus(`河流 ${picked.river.i} 宽度 ${picked.river.widthFactor}`);
        this.notifyChanged();
        return true;
      }

      picked.river.__editorUsePoints = true;
      this.activeOperation = {
        type: "river-point",
        riverId: picked.river.i,
        pointIndex: picked.pointIndex,
        before
      };
      this.moveRiverPoint(event);
      return true;
    }

    if (this.tool === "state") {
      this.applyStateEdit(event);
      return true;
    }

    return false;
  }

  handlePointerMove(event) {
    if (!this.activeOperation) return false;
    event.preventDefault();
    if (this.activeOperation.type === "height") this.applyHeightBrush(event);
    if (this.activeOperation.type === "river-point") this.moveRiverPoint(event);
    return true;
  }

  handlePointerUp(event) {
    if (!this.activeOperation) return false;
    event.preventDefault();
    this.renderer.canvas.releasePointerCapture(event.pointerId);

    if (this.activeOperation.type === "height") {
      const action = {
        type: "height",
        grid: Array.from(this.activeOperation.grid.entries()),
        pack: Array.from(this.activeOperation.pack.entries())
      };
      if (action.grid.length || action.pack.length) this.history.push(action);
    }

    if (this.activeOperation.type === "river-point") {
      this.history.push({
        type: "river",
        riverId: this.activeOperation.riverId,
        before: this.activeOperation.before
      });
    }

    this.activeOperation = null;
    this.notifyChanged();
    return true;
  }

  bindControls() {
    for (const button of this.elements.toolButtons) {
      button.addEventListener("click", () => this.setTool(button.dataset.editorTool));
    }
    for (const button of this.elements.heightButtons) {
      button.addEventListener("click", () => {
        this.heightAction = button.dataset.heightAction;
        this.syncButtonGroup(this.elements.heightButtons, "heightAction", this.heightAction);
      });
    }
    for (const button of this.elements.stateButtons) {
      button.addEventListener("click", () => {
        this.stateAction = button.dataset.stateAction;
        this.syncButtonGroup(this.elements.stateButtons, "stateAction", this.stateAction);
      });
    }
    this.elements.stateColor.addEventListener("input", () => this.applyStateColor());
    this.elements.undo.addEventListener("click", () => this.undo());
    this.elements.reset.addEventListener("click", () => this.reset());
  }

  setTool(tool) {
    this.tool = tool || "view";
    this.activeOperation = null;
    this.syncButtonGroup(this.elements.toolButtons, "editorTool", this.tool);
    this.elements.heightPanel.hidden = this.tool !== "height";
    this.elements.riverPanel.hidden = this.tool !== "river";
    this.elements.statePanel.hidden = this.tool !== "state";
    this.renderer.canvas.classList.toggle("editing", this.tool !== "view");
    if (this.tool === "height") this.renderer.setMode("height");
    if (this.tool === "state") this.renderer.setMode("states");
    this.renderStatus(`${getToolLabel(this.tool)} 已启用`);
    this.notifyChanged();
  }

  applyHeightBrush(event) {
    const snapshot = this.renderer.snapshot;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    const radius = Number(this.elements.heightRadius.value || 16);
    const strength = Number(this.elements.heightStrength.value || 2);
    const delta = this.heightAction === "lower" ? -strength : strength;
    const radiusSq = radius * radius;
    const affected = [];

    for (let gridId = 0; gridId < snapshot.grid.cells.p.length; gridId++) {
      const cellPoint = snapshot.grid.cells.p[gridId];
      if (!cellPoint) continue;
      const dx = cellPoint[0] - point.x;
      const dy = cellPoint[1] - point.y;
      if (dx * dx + dy * dy > radiusSq) continue;

      affected.push(gridId);
    }

    if (this.heightAction === "smooth" && affected.length) {
      const average = affected.reduce((sum, gridId) => sum + (snapshot.grid.cells.h[gridId] || 0), 0) / affected.length;
      for (const gridId of affected) this.setGridHeight(snapshot, gridId, (snapshot.grid.cells.h[gridId] || 0) * 0.6 + average * 0.4);
    } else {
      for (const gridId of affected) this.setGridHeight(snapshot, gridId, (snapshot.grid.cells.h[gridId] || 0) + delta);
    }

    if (affected.length) {
      this.renderer.refreshTheme();
      this.renderStatus(`高度笔刷 ${affected.length} cells`);
    }
  }

  setGridHeight(snapshot, gridId, value) {
    if (!this.activeOperation?.grid.has(gridId)) this.activeOperation?.grid.set(gridId, snapshot.grid.cells.h[gridId]);
    const next = Math.round(clamp(value, 0, 100));
    snapshot.grid.cells.h[gridId] = next;

    const packId = getPackCellForGrid(snapshot, gridId);
    if (packId !== undefined && snapshot.cells?.h) {
      if (!this.activeOperation?.pack.has(packId)) this.activeOperation?.pack.set(packId, snapshot.cells.h[packId]);
      snapshot.cells.h[packId] = next;
    }
  }

  pickRiver(event) {
    const snapshot = this.renderer.snapshot;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    const maxDistance = RIVER_PICK_SCREEN_RADIUS / Math.max(this.renderer.camera.scale, 0.001);
    let best = null;

    for (const river of snapshot.rivers || []) {
      const points = getEditableRiverPoints(river);
      if (points.length < 2) continue;
      for (let index = 0; index < points.length - 1; index++) {
        const distance = distanceToSegment(point, points[index], points[index + 1]);
        if (distance > maxDistance || (best && distance >= best.distance)) continue;
        const pointIndex = distanceToPoint(point, points[index]) < distanceToPoint(point, points[index + 1]) ? index : index + 1;
        best = {river, distance, pointIndex};
      }
    }

    return best;
  }

  moveRiverPoint(event) {
    const snapshot = this.renderer.snapshot;
    const river = (snapshot.rivers || []).find(item => item?.i === this.activeOperation.riverId);
    if (!river) return;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    const current = river.points[this.activeOperation.pointIndex] || [point.x, point.y, 0];
    river.points[this.activeOperation.pointIndex] = [round(point.x), round(point.y), current[2] || 0];
    river.__editorUsePoints = true;
    this.renderer.rebuildBuffers();
    this.renderStatus(`河流 ${river.i} 节点 ${this.activeOperation.pointIndex}`);
  }

  applyStateEdit(event) {
    const cell = this.renderer.pick(event.clientX, event.clientY);
    if (!cell) {
      this.renderStatus("未命中国家 cell");
      return;
    }

    if (this.stateAction === "sample") {
      this.selectedStateId = cell.stateId || 0;
      this.syncStateColorInput();
      this.renderStatus(`选中国家 ${this.getSelectedStateName()}`);
      this.notifyChanged();
      return;
    }

    const snapshot = this.renderer.snapshot;
    const before = snapshot.cells.state[cell.id] || 0;
    if (before === this.selectedStateId) {
      this.renderStatus(`cell ${cell.id} 已属于 ${this.getSelectedStateName()}`);
      return;
    }

    snapshot.cells.state[cell.id] = this.selectedStateId;
    this.history.push({type: "state-cell", cellId: cell.id, before});
    this.renderer.rebuildBuffers();
    this.renderStatus(`cell ${cell.id} 改为 ${this.getSelectedStateName()}`);
    this.notifyChanged();
  }

  applyStateColor() {
    const snapshot = this.renderer.snapshot;
    const state = snapshot.states?.[this.selectedStateId];
    if (!state) return;
    const before = state.color;
    const next = this.elements.stateColor.value;
    if (before === next) return;
    state.color = next;
    this.history.push({type: "state-color", stateId: state.i, before});
    this.renderer.refreshTheme();
    this.overlays.loadSnapshot(snapshot);
    this.renderStatus(`${state.name} 颜色 ${next}`);
    this.notifyChanged();
  }

  undo() {
    const action = this.history.pop();
    if (!action) {
      this.renderStatus("没有可撤销操作");
      return;
    }
    const snapshot = this.renderer.snapshot;

    if (action.type === "height") {
      for (const [gridId, height] of action.grid) snapshot.grid.cells.h[gridId] = height;
      for (const [packId, height] of action.pack) snapshot.cells.h[packId] = height;
      this.renderer.refreshTheme();
    }

    if (action.type === "river") {
      const index = (snapshot.rivers || []).findIndex(river => river?.i === action.riverId);
      if (index >= 0) snapshot.rivers[index] = action.before;
      this.renderer.rebuildBuffers();
    }

    if (action.type === "state-cell") {
      snapshot.cells.state[action.cellId] = action.before;
      this.renderer.rebuildBuffers();
    }

    if (action.type === "state-color") {
      const state = snapshot.states?.[action.stateId];
      if (state) state.color = action.before;
      this.syncStateColorInput();
      this.renderer.refreshTheme();
      this.overlays.loadSnapshot(snapshot);
    }

    this.renderStatus("已撤销一步");
    this.notifyChanged();
  }

  reset() {
    if (!this.originalSnapshot) return;
    const snapshot = structuredClone(this.originalSnapshot);
    this.history = [];
    this.activeOperation = null;
    this.renderer.loadSnapshot(snapshot);
    this.overlays.loadSnapshot(snapshot);
    this.loadSnapshot(snapshot);
    this.renderStatus("已重置 demo 快照");
    this.notifyChanged();
  }

  syncButtonGroup(buttons, key, activeValue) {
    for (const button of buttons) button.classList.toggle("active", button.dataset[key] === activeValue);
  }

  syncStateColorInput() {
    const state = this.renderer.snapshot?.states?.[this.selectedStateId];
    if (state?.color) this.elements.stateColor.value = state.color;
  }

  getSelectedStateName() {
    const state = this.renderer.snapshot?.states?.[this.selectedStateId];
    return state ? `${state.name} (${state.i})` : "无";
  }

  renderStatus(message) {
    this.status = message;
    const selectedRiver = this.selectedRiverId === null ? "无" : String(this.selectedRiverId);
    this.elements.status.replaceChildren(
      statusRow("工具", getToolLabel(this.tool)),
      statusRow("状态", message),
      statusRow("国家", this.getSelectedStateName()),
      statusRow("河流", selectedRiver),
      statusRow("撤销步数", String(this.history.length))
    );
  }

  notifyChanged() {
    this.onChange?.();
  }
}

function getPackCellForGrid(snapshot, gridId) {
  if (!snapshot.__editorGridToPack) {
    snapshot.__editorGridToPack = [];
    for (let packId = 0; packId < (snapshot.cells?.g || []).length; packId++) {
      const mappedGrid = snapshot.cells.g[packId];
      if (mappedGrid !== undefined && snapshot.__editorGridToPack[mappedGrid] === undefined) snapshot.__editorGridToPack[mappedGrid] = packId;
    }
  }
  return snapshot.__editorGridToPack[gridId];
}

function getEditableRiverPoints(river) {
  return (river.points || []).filter(isPoint);
}

function cloneRiver(river) {
  return structuredClone(river);
}

function distanceToPoint(point, target) {
  return Math.hypot(point.x - target[0], point.y - target[1]);
}

function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return distanceToPoint(point, a);
  const t = clamp(((point.x - a[0]) * dx + (point.y - a[1]) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (a[0] + dx * t), point.y - (a[1] + dy * t));
}

function firstAliveStateId(snapshot) {
  return (snapshot.states || []).find(state => state?.i && !state.removed)?.i || 0;
}

function getToolLabel(tool) {
  if (tool === "height") return "高度";
  if (tool === "river") return "河流";
  if (tool === "state") return "国家";
  return "浏览";
}

function statusRow(label, value) {
  const row = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function isPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
