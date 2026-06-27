import {clamp} from "./utils.js";

const DEFAULT_STATUS = "未编辑";
const RIVER_PICK_SCREEN_RADIUS = 16;
const RIVER_HIGHLIGHT_CLASS = "river-highlight-path";

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
    this.highlightRiverId = null;
    this.riverHighlight = createRiverHighlightLayer(this.overlays.container);
    this.lastStateSourceId = null;
    this.lastStatePaintCount = 0;
    this.history = [];
    this.activeOperation = null;
    this.status = DEFAULT_STATUS;
    this.bindControls();
    this.renderer.addViewListener(() => this.syncRiverHighlight());
  }

  loadSnapshot(snapshot) {
    this.originalSnapshot = structuredClone(snapshot);
    this.selectedStateId = firstAliveStateId(snapshot);
    this.selectedRiverId = null;
    this.highlightRiverId = null;
    this.syncStateColorInput();
    this.renderRiverPanel();
    this.syncRiverHighlight();
    this.renderStatus("编辑器已就绪");
  }

  handlePointerDown(event) {
    if (this.tool === "view") {
      const picked = this.pickRiver(event);
      if (!picked) return false;
      event.preventDefault();
      this.renderer.canvas.setPointerCapture(event.pointerId);
      this.setTool("river");
      this.selectRiver(picked.river, {highlight: true, message: `选中 ${formatRiverName(picked.river)}`});
      this.activeOperation = {type: "select"};
      return true;
    }

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
      this.selectRiver(picked.river, {highlight: true, message: `选中 ${formatRiverName(picked.river)}`});
      const before = cloneRiver(picked.river);

      if (this.elements.riverAction.value === "width") {
        const amount = Number(this.elements.riverWidth.value || 0);
        picked.river.widthFactor = round(clamp(Number(picked.river.widthFactor || 1) + amount, 0.15, 3));
        this.history.push({type: "river", riverId: getRiverId(picked.river), before});
        this.renderer.rebuildBuffers();
        this.renderRiverPanel();
        this.renderStatus(`${formatRiverName(picked.river)} 宽度 ${picked.river.widthFactor}`);
        this.notifyChanged();
        return true;
      }

      picked.river.__editorUsePoints = true;
      this.activeOperation = {
        type: "river-point",
        riverId: getRiverId(picked.river),
        pointIndex: picked.pointIndex,
        before
      };
      this.moveRiverPoint(event);
      return true;
    }

    if (this.tool === "state") {
      if (this.stateAction === "sample") {
        this.sampleState(event);
        return true;
      }

      this.activeOperation = {
        type: "state",
        cells: new Map(),
        touched: new Set(),
        lastPoint: null,
        changed: 0
      };
      this.lastStatePaintCount = 0;
      this.applyStateBrush(event);
      return true;
    }

    return false;
  }

  handlePointerMove(event) {
    if (!this.activeOperation) return false;
    event.preventDefault();
    if (this.activeOperation.type === "height") this.applyHeightBrush(event);
    if (this.activeOperation.type === "river-point") this.moveRiverPoint(event);
    if (this.activeOperation.type === "state") this.applyStateBrush(event);
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
      this.renderRiverPanel();
      this.syncRiverHighlight();
    }

    if (this.activeOperation.type === "state") {
      const action = {
        type: "state-cells",
        cells: Array.from(this.activeOperation.cells.entries())
      };
      if (action.cells.length) {
        this.history.push(action);
        this.renderer.rebuildBuffers();
        this.renderStatus(`涂抹完成 ${action.cells.length} cells`);
      }
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
    this.elements.riverFilter?.addEventListener("input", () => this.renderRiverPanel());
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
    if (this.tool === "river") this.renderRiverPanel();
    this.renderStatus(`${getToolLabel(this.tool)} 已启用`);
    this.notifyChanged();
  }

  applyHeightBrush(event) {
    const snapshot = this.renderer.snapshot;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    const radius = Number(this.elements.heightRadius.value || 16);
    const strength = Number(this.elements.heightStrength.value || 2);
    const delta = this.heightAction === "lower" ? -strength : strength;
    const useFalloff = Boolean(this.elements.heightFalloff?.checked);
    const radiusSq = radius * radius;
    const affected = [];

    for (let gridId = 0; gridId < snapshot.grid.cells.p.length; gridId++) {
      const cellPoint = snapshot.grid.cells.p[gridId];
      if (!cellPoint) continue;
      const dx = cellPoint[0] - point.x;
      const dy = cellPoint[1] - point.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusSq) continue;

      const factor = useFalloff && this.heightAction !== "smooth" ? getBrushFalloff(Math.sqrt(distanceSq), radius) : 1;
      affected.push({gridId, factor});
    }

    if (this.heightAction === "smooth" && affected.length) {
      const average = affected.reduce((sum, item) => sum + (snapshot.grid.cells.h[item.gridId] || 0), 0) / affected.length;
      for (const {gridId} of affected) this.setGridHeight(snapshot, gridId, (snapshot.grid.cells.h[gridId] || 0) * 0.6 + average * 0.4);
    } else {
      for (const {gridId, factor} of affected) this.setGridHeight(snapshot, gridId, (snapshot.grid.cells.h[gridId] || 0) + delta * factor);
    }

    if (affected.length) {
      this.renderer.refreshTheme();
      this.renderStatus(`高度笔刷 ${affected.length} cells${useFalloff && this.heightAction !== "smooth" ? "，中心衰减" : ""}`);
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
    const river = (snapshot.rivers || []).find(item => getRiverId(item) === this.activeOperation.riverId);
    if (!river) return;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    const current = river.points[this.activeOperation.pointIndex] || [point.x, point.y, 0];
    river.points[this.activeOperation.pointIndex] = [round(point.x), round(point.y), current[2] || 0];
    river.__editorUsePoints = true;
    this.renderer.rebuildBuffers();
    this.renderRiverPanel();
    this.syncRiverHighlight();
    this.renderStatus(`${formatRiverName(river)} 节点 ${this.activeOperation.pointIndex}`);
  }

  selectRiver(river, {locate = false, highlight = true, message} = {}) {
    const riverId = getRiverId(river);
    if (riverId === null) return;
    this.selectedRiverId = riverId;
    if (locate) this.focusRiver(river);
    if (highlight) {
      this.highlightRiverId = riverId;
      this.restartRiverHighlight();
    }
    this.renderRiverPanel();
    this.renderStatus(message || `选中 ${formatRiverName(river)}`);
    this.notifyChanged();
  }

  focusRiver(river) {
    const points = getEditableRiverPoints(river);
    if (points.length < 2) return;
    const bounds = getPointBounds(points);
    if (!bounds) return;

    const width = Math.max(24, bounds.maxX - bounds.minX);
    const height = Math.max(24, bounds.maxY - bounds.minY);
    const scale = clamp(Math.min(this.renderer.canvas.width / (width * 2.8), this.renderer.canvas.height / (height * 2.8)), 0.35, 10);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    this.renderer.setCamera({
      scale,
      x: this.renderer.canvas.width / 2 - centerX * scale,
      y: this.renderer.canvas.height / 2 - centerY * scale
    });
  }

  restartRiverHighlight() {
    this.syncRiverHighlight();
    const path = this.riverHighlight.path;
    path.classList.remove("flash");
    path.getBoundingClientRect();
    path.classList.add("flash");
  }

  syncRiverHighlight() {
    const river = this.getSelectedRiver();
    const points = river ? getEditableRiverPoints(river) : [];
    if (!river || points.length < 2) {
      this.riverHighlight.svg.hidden = true;
      this.riverHighlight.path.setAttribute("d", "");
      return;
    }

    const rect = this.renderer.canvas.getBoundingClientRect();
    const scaleX = rect.width / Math.max(1, this.renderer.canvas.width);
    const scaleY = rect.height / Math.max(1, this.renderer.canvas.height);
    this.riverHighlight.svg.setAttribute("viewBox", `0 0 ${round(rect.width)} ${round(rect.height)}`);
    this.riverHighlight.svg.hidden = false;
    this.riverHighlight.path.setAttribute(
      "d",
      points.map((point, index) => {
        const x = point[0] * this.renderer.camera.scale * scaleX + this.renderer.camera.x * scaleX;
        const y = point[1] * this.renderer.camera.scale * scaleY + this.renderer.camera.y * scaleY;
        return `${index ? "L" : "M"} ${round(x)} ${round(y)}`;
      }).join(" ")
    );
  }

  getSelectedRiver() {
    if (this.selectedRiverId === null) return null;
    return (this.renderer.snapshot?.rivers || []).find(river => getRiverId(river) === this.selectedRiverId) || null;
  }

  renderRiverPanel() {
    if (!this.elements.riverList || !this.elements.riverSummary || !this.renderer.snapshot) return;
    const rivers = (this.renderer.snapshot.rivers || []).filter(Boolean);
    const query = (this.elements.riverFilter?.value || "").trim().toLowerCase();
    const metrics = rivers.map(river => ({river, ...getRiverMetrics(river)}));
    const filtered = metrics.filter(item => riverMatchesQuery(item.river, query));
    const selected = this.getSelectedRiver();
    const selectedMetrics = selected ? getRiverMetrics(selected) : null;

    this.elements.riverSummary.replaceChildren(
      compactMetric("河流", String(rivers.length)),
      compactMetric("总长度", formatNumber(metrics.reduce((sum, item) => sum + item.length, 0))),
      compactMetric("最大流量", formatNumber(Math.max(0, ...metrics.map(item => item.flux)))),
      compactMetric("当前", selected ? `${formatRiverName(selected)} / ${formatNumber(selectedMetrics.length)} / ${formatNumber(selectedMetrics.flux)}` : "未选中")
    );

    this.elements.riverList.replaceChildren(
      ...filtered
        .sort((a, b) => a.id - b.id)
        .map(item => this.createRiverRow(item))
    );
  }

  createRiverRow(item) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "river-row";
    row.classList.toggle("active", item.id === this.selectedRiverId);
    row.dataset.riverId = String(item.id);

    const title = document.createElement("span");
    title.className = "river-row-title";
    title.textContent = formatRiverName(item.river);

    const stats = document.createElement("span");
    stats.className = "river-row-stats";
    stats.textContent = `长 ${formatNumber(item.length)} · 流 ${formatNumber(item.flux)}`;

    const locate = document.createElement("span");
    locate.className = "river-row-locate";
    locate.textContent = "定位";

    row.append(title, stats, locate);
    row.addEventListener("click", () => this.selectRiver(item.river, {locate: true, highlight: true, message: `定位 ${formatRiverName(item.river)}`}));
    return row;
  }

  sampleState(event) {
    const cell = this.renderer.pick(event.clientX, event.clientY);
    if (!cell) {
      this.renderStatus("未命中国家 cell");
      return;
    }

    this.selectedStateId = cell.stateId || 0;
    this.lastStateSourceId = this.selectedStateId;
    this.lastStatePaintCount = 0;
    this.syncStateColorInput();
    this.renderStatus(`取样 ${this.formatStateName(this.selectedStateId)}`);
    this.notifyChanged();
  }

  applyStateBrush(event) {
    const snapshot = this.renderer.snapshot;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    const radius = Number(this.elements.stateRadius.value || 10);
    const samplePoints = getStrokeSamplePoints(this.activeOperation.lastPoint, point, Math.max(2, radius * 0.45));
    let changed = 0;

    for (const samplePoint of samplePoints) changed += this.paintStateAtPoint(snapshot, samplePoint, radius);
    this.activeOperation.lastPoint = point;

    if (!changed) {
      this.renderStatus(`涂抹目标 ${this.formatStateName(this.selectedStateId)}`);
      return;
    }

    this.activeOperation.changed += changed;
    this.lastStatePaintCount = this.activeOperation.changed;
    this.renderer.refreshTheme();
    this.renderStatus(`涂抹 ${changed} cells，目标 ${this.formatStateName(this.selectedStateId)}`);
    this.notifyChanged();
  }

  paintStateAtPoint(snapshot, point, radius) {
    const radiusSq = radius * radius;
    let changed = 0;

    for (let cellId = 0; cellId < snapshot.cells.p.length; cellId++) {
      if ((snapshot.cells.h[cellId] ?? 0) < 20) continue;
      const cellPoint = snapshot.cells.p[cellId];
      if (!cellPoint) continue;
      const dx = cellPoint[0] - point.x;
      const dy = cellPoint[1] - point.y;
      if (dx * dx + dy * dy > radiusSq) continue;
      if (this.activeOperation.touched.has(cellId)) continue;

      const before = snapshot.cells.state[cellId] || 0;
      this.activeOperation.touched.add(cellId);
      this.lastStateSourceId = before;
      if (before === this.selectedStateId) continue;

      if (!this.activeOperation.cells.has(cellId)) this.activeOperation.cells.set(cellId, before);
      snapshot.cells.state[cellId] = this.selectedStateId;
      changed++;
    }

    return changed;
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
      const index = (snapshot.rivers || []).findIndex(river => getRiverId(river) === action.riverId);
      if (index >= 0) snapshot.rivers[index] = action.before;
      this.renderer.rebuildBuffers();
      this.renderRiverPanel();
      this.syncRiverHighlight();
    }

    if (action.type === "state-cells") {
      for (const [cellId, stateId] of action.cells) snapshot.cells.state[cellId] = stateId;
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
    this.selectedRiverId = null;
    this.highlightRiverId = null;
    this.renderer.loadSnapshot(snapshot);
    this.overlays.loadSnapshot(snapshot);
    this.loadSnapshot(snapshot);
    this.syncRiverHighlight();
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
    return this.formatStateName(this.selectedStateId);
  }

  formatStateName(stateId) {
    const state = this.renderer.snapshot?.states?.[stateId];
    return state ? `${state.name} (${state.i}) ${state.color || ""}`.trim() : "无";
  }

  renderStatus(message) {
    this.status = message;
    const selectedRiver = this.selectedRiverId === null ? "无" : String(this.selectedRiverId);
    const river = this.getSelectedRiver();
    const riverMetrics = river ? getRiverMetrics(river) : null;
    this.elements.status.replaceChildren(
      statusRow("工具", getToolLabel(this.tool)),
      statusRow("状态", message),
      statusRow("目标国家", this.getSelectedStateName()),
      statusRow("来源国家", this.lastStateSourceId === null ? "无" : this.formatStateName(this.lastStateSourceId)),
      statusRow("本次涂抹", String(this.lastStatePaintCount)),
      statusRow("河流", selectedRiver),
      statusRow("河流长度", riverMetrics ? formatNumber(riverMetrics.length) : "无"),
      statusRow("河流流量", riverMetrics ? formatNumber(riverMetrics.flux) : "无"),
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

function getRiverId(river) {
  if (!river) return null;
  return river.i ?? river.id ?? null;
}

function formatRiverName(river) {
  const id = getRiverId(river);
  return river?.name ? `${river.name} (${id})` : `河流 ${id}`;
}

function getRiverMetrics(river) {
  const points = getEditableRiverPoints(river);
  return {
    id: getRiverId(river) ?? 0,
    length: Number(river.length) || getPolylineLength(points),
    flux: Number(river.discharge ?? river.flux ?? river.width ?? 0) || 0,
    segments: Math.max(0, points.length - 1)
  };
}

function riverMatchesQuery(river, query) {
  if (!query) return true;
  const id = String(getRiverId(river) ?? "");
  const name = String(river?.name || "").toLowerCase();
  return id.includes(query) || name.includes(query);
}

function getPolylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index++) length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  return length;
}

function getPointBounds(points) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return {minX, minY, maxX, maxY};
}

function createRiverHighlightLayer(container) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.classList.add("river-highlight-overlay");
  path.classList.add(RIVER_HIGHLIGHT_CLASS);
  svg.hidden = true;
  svg.append(path);
  container.append(svg);
  return {svg, path};
}

function compactMetric(label, value) {
  const item = document.createElement("span");
  const key = document.createElement("b");
  const text = document.createElement("span");
  key.textContent = label;
  text.textContent = value;
  item.append(key, text);
  return item;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1}).format(value);
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

function getBrushFalloff(distance, radius) {
  const t = clamp(1 - distance / Math.max(radius, 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function getStrokeSamplePoints(previous, current, step) {
  if (!previous) return [current];
  const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
  const count = Math.min(24, Math.max(1, Math.ceil(distance / Math.max(step, 1))));
  const points = [];
  for (let index = 1; index <= count; index++) {
    const amount = index / count;
    points.push({
      x: previous.x + (current.x - previous.x) * amount,
      y: previous.y + (current.y - previous.y) * amount
    });
  }
  return points;
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
