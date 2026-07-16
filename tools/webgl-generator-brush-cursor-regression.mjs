#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  BRUSH_RADIUS_ID,
  normalizeBrushRadius,
  projectWorldRadiusToScreen,
  readBrushRadiusContract
} from "../app/webgl-generator/src/runtime/brush-radius-contract.js";
import {createHeightCursorRadiusSelection} from "../app/webgl-generator/src/runtime/height-cell-selection.js";
import {createBrushCursorPreview, resolveBrushCursor} from "../app/webgl-generator/src/ui/brush-cursor-preview.js";

const EXPECTED_CONTRACTS = Object.freeze({
  height: [28, 6, 96, 2],
  "height-selection": [48, 8, 160, 4],
  state: [28, 4, 120, 2],
  province: [28, 4, 120, 2],
  culture: [28, 4, 120, 2],
  religion: [28, 4, 120, 2],
  biome: [28, 4, 120, 2],
  "economy-market": [18, 2, 120, 2]
});

function testContractsAndNormalization() {
  for (const [id, expected] of Object.entries(EXPECTED_CONTRACTS)) {
    const contract = readBrushRadiusContract(id);
    assert.deepEqual([contract.defaultValue, contract.min, contract.max, contract.step], expected, `${id} 半径契约漂移`);
    assert.equal(normalizeBrushRadius(id, "bad"), contract.defaultValue, `${id} 非数值未回落默认值`);
    assert.equal(normalizeBrushRadius(id, -Infinity), contract.defaultValue, `${id} 非有限值未回落默认值`);
    assert.equal(normalizeBrushRadius(id, contract.min - 100), contract.min, `${id} 下界未归一`);
    assert.equal(normalizeBrushRadius(id, contract.max + 100), contract.max, `${id} 上界未归一`);
  }
}

function testProjection() {
  const center = {x: 37, y: 23};
  const radius = 18;
  for (const scale of [1, 2, 4]) {
    const projection = projectWorldRadiusToScreen(center, radius, point => ({x: point.x * scale + 13, y: point.y * scale - 7}));
    assert.ok(Math.abs(projection.radiusX - radius * scale) <= 2, `${scale} 倍横向投影误差超过 2px`);
    assert.ok(Math.abs(projection.radiusY - radius * scale) <= 2, `${scale} 倍纵向投影误差超过 2px`);
    assert.deepEqual(projection.center, {x: center.x * scale + 13, y: center.y * scale - 7}, `${scale} 倍中心投影偏移`);
  }
  const anisotropic = projectWorldRadiusToScreen(center, radius, point => ({x: point.x * 3, y: point.y * 2}));
  assert.notEqual(anisotropic.radiusX, anisotropic.radiusY, "投影错误地强制成屏幕圆形");
}

function testResolverAllowlist() {
  let modeId = "height:brush";
  const brushes = {
    height: {active: true, action: "raise", radius: 28},
    state: {active: true, radius: 28},
    province: {active: true, radius: 28},
    culture: {active: true, radius: 28},
    religion: {active: true, radius: 28},
    biome: {active: true, radius: 28},
    economy: {active: true, radius: 18}
  };
  const state = {
    canvasToolModes: {getActive: () => modeId ? {id: modeId} : null},
    heightEdit: {terrainSelectionBox: null, terrainSelectionPoint: null, terrainSelectionPaint: null, terrainSelectionPaintPending: null},
    panels: {
      height: {getBrush: () => brushes.height},
      state: {getBrush: () => brushes.state},
      province: {getBrush: () => brushes.province},
      culture: {getBrush: () => brushes.culture},
      religion: {getBrush: () => brushes.religion},
      biome: {getBrush: () => brushes.biome},
      economy: {getMarketBrush: () => brushes.economy}
    }
  };
  for (const action of ["raise", "lower", "smooth", "flatten", "disrupt"]) {
    brushes.height.action = action;
    assert.equal(resolveBrushCursor(state)?.id, BRUSH_RADIUS_ID.HEIGHT, `高度 ${action} 未显示半径`);
  }
  for (const action of ["fill", "line"]) {
    brushes.height.action = action;
    assert.equal(resolveBrushCursor(state), null, `高度 ${action} 不应显示共享画笔光标`);
  }
  brushes.height.action = "raise";
  state.heightEdit.terrainSelectionBox = {request: {source: "rectangle"}, start: null};
  assert.equal(resolveBrushCursor(state), null, "矩形选区等待首个角点时不应显示普通高度画笔光标");
  state.heightEdit.terrainSelectionBox.start = {point: {x: 10, y: 20}};
  assert.equal(resolveBrushCursor(state), null, "矩形选区已有起点时不应显示普通高度画笔光标");
  state.heightEdit.terrainSelectionBox = null;
  state.heightEdit.terrainSelectionPoint = {request: {source: "connected-height"}};
  assert.equal(resolveBrushCursor(state), null, "连通等高单点选区等待时不应显示普通高度画笔光标");
  state.heightEdit.terrainSelectionPoint = null;
  assert.equal(resolveBrushCursor(state)?.id, BRUSH_RADIUS_ID.HEIGHT, "无选区等待态的普通抬升没有恢复高度画笔光标");
  state.heightEdit.terrainSelectionPaintPending = {request: {radius: 80}};
  state.heightEdit.terrainSelectionBox = {request: {source: "rectangle"}, start: null};
  assert.deepEqual(resolveBrushCursor(state), {id: BRUSH_RADIUS_ID.HEIGHT_SELECTION, radius: 80}, "待落笔高度选区没有优先使用 request.radius");
  state.heightEdit.terrainSelectionPaintPending = null;
  state.heightEdit.terrainSelectionPaint = {request: {radius: 76}};
  assert.deepEqual(resolveBrushCursor(state), {id: BRUSH_RADIUS_ID.HEIGHT_SELECTION, radius: 76}, "活动高度选区没有优先使用 request.radius");
  state.heightEdit.terrainSelectionBox = null;
  state.heightEdit.terrainSelectionPaint = null;

  const allowed = [
    ["state:brush", BRUSH_RADIUS_ID.STATE],
    ["province:brush", BRUSH_RADIUS_ID.PROVINCE],
    ["culture:assign", BRUSH_RADIUS_ID.CULTURE],
    ["religion:assign", BRUSH_RADIUS_ID.RELIGION],
    ["biome:assign", BRUSH_RADIUS_ID.BIOME],
    ["economy:market-assign", BRUSH_RADIUS_ID.ECONOMY_MARKET]
  ];
  for (const [mode, radiusId] of allowed) {
    modeId = mode;
    assert.equal(resolveBrushCursor(state)?.id, radiusId, `${mode} 未进入光标白名单`);
  }
  for (const mode of ["state:add", "state:delete", "province:add", "city:add", "measurement:draw", "route:draw", "river:add", "lake:excavate", "zone:add", "note:add"]) {
    modeId = mode;
    assert.equal(resolveBrushCursor(state), null, `${mode} 不应显示共享画笔光标`);
  }
}

function testExactHeightPaintCenter() {
  const map = {
    grid: {
      points: [[0, 0], [5, 0], [10, 0]],
      cells: {h: Uint8Array.from([30, 30, 30]), p: Uint32Array.from([0, 1, 2])}
    }
  };
  const selection = createHeightCursorRadiusSelection(map, 1, {scope: "land", radius: 8, centerPoint: {x: 0, y: 0}});
  assert.deepEqual([...selection.cellIds], [0, 1], "高度选区盖章仍以命中 cell 中心而非精确鼠标世界点计算");
}

function testCandidateMonotonicity() {
  const points = [];
  for (let y = -180; y <= 180; y += 4) for (let x = -180; x <= 180; x += 4) points.push({x, y});
  for (const id of Object.keys(EXPECTED_CONTRACTS)) {
    const contract = readBrushRadiusContract(id);
    const radii = [contract.min, (contract.min + contract.max) / 2, contract.max];
    const candidates = radii.map(radius => points.filter(point => point.x * point.x + point.y * point.y <= radius * radius));
    assert.ok(candidates[0].length <= candidates[1].length && candidates[1].length <= candidates[2].length, `${id} 最小/中间/最大候选数不单调`);
    candidates.forEach((items, index) => {
      assert.ok(items.every(point => Math.hypot(point.x, point.y) <= radii[index] + Number.EPSILON), `${id} 候选中心越出光标圆`);
    });
  }
}

async function testOverlayLifecycleAndIntegration() {
  const documentRef = new FakeDocument();
  const canvas = new FakeElement("canvas");
  canvas.getBoundingClientRect = () => ({left: 10, top: 20, width: 800, height: 600});
  let scale = 1;
  let modeId = "height:brush";
  const state = {
    map: {id: "map"},
    selection: {kind: "state", id: 1},
    editHistory: {undo: 2, redo: 0},
    canvasToolModes: {getActive: () => ({id: modeId})},
    heightEdit: {terrainSelectionPaint: null, terrainSelectionPaintPending: null},
    panels: {height: {getBrush: () => ({active: true, action: "raise", radius: 28})}},
    renderer: {
      screenToWorld: (clientX, clientY) => ({x: (clientX - 10) / scale, y: (clientY - 20) / scale}),
      worldToScreen: (x, y) => ({x: x * scale, y: y * scale})
    }
  };
  const before = JSON.stringify({map: state.map, selection: state.selection, editHistory: state.editHistory});
  const preview = createBrushCursorPreview(canvas, state, documentRef);
  canvas.dispatch("pointerenter", {clientX: 110, clientY: 120});
  assert.equal(preview.svg.hidden, false, "pointerenter 未显示光标");
  assert.equal(preview.svg.getAttribute("pointer-events"), "none", "SVG overlay 会接收事件");
  assert.equal(preview.ellipse.getAttribute("pointer-events"), "none", "ellipse 会接收事件");
  assert.equal(preview.svg.listenerCount(), 0, "SVG overlay 注册了事件监听");
  assert.equal(preview.ellipse.listenerCount(), 0, "ellipse 注册了事件监听");
  assert.equal(JSON.stringify({map: state.map, selection: state.selection, editHistory: state.editHistory}), before, "纯悬停修改了地图、选中态或历史");

  const radiusAtOne = Number(preview.ellipse.getAttribute("rx"));
  scale = 2;
  preview.refresh();
  assert.ok(Math.abs(Number(preview.ellipse.getAttribute("rx")) - radiusAtOne * 2) <= 2, "相机缩放后未原位重投影");
  state.panels.height.getBrush = () => ({active: true, action: "raise", radius: 40});
  documentRef.dispatch("input", {});
  assert.ok(Number(preview.ellipse.getAttribute("rx")) > radiusAtOne * 2, "滑杆变化后未原位重投影");

  modeId = "measurement:draw";
  documentRef.dispatch("click", {});
  assert.equal(preview.svg.hidden, true, "切换到排除模式后未隐藏");
  modeId = "height:brush";
  canvas.dispatch("pointermove", {clientX: 130, clientY: 140});
  canvas.dispatch("pointerleave", {});
  assert.equal(preview.svg.hidden, true, "pointerleave 未清理光标");
  preview.clear();
  preview.clear();
  assert.equal(preview.destroy(), true, "首次销毁未执行");
  assert.equal(preview.destroy(), false, "重复销毁不幂等");

  const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
  const previewBind = appSource.indexOf("state.brushCursorPreview = createBrushCursorPreview");
  const heightBind = appSource.indexOf("bindHeightEditing(canvas, state, documentRef)");
  assert.ok(previewBind >= 0 && previewBind < heightBind, "光标监听没有先于会 stopImmediatePropagation 的编辑监听注册");
  assert.match(appSource, /state\.brushCursorPreview\?\.clear\(\);\s*hooks\.onExit/, "画布模式退出未统一清理光标");
  assert.match(appSource, /state\.brushCursorPreview\?\.reset\(\);/, "地图替换未清理光标位置");
}

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

class FakeElement extends FakeTarget {
  constructor(name) {
    super();
    this.name = name;
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.classList = {add: value => this.attributes.set("class", value)};
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(child) {
    this.children.push(child);
    child.parent = this;
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
}

class FakeDocument extends FakeTarget {
  constructor() {
    super();
    this.body = new FakeElement("body");
    this.defaultView = {requestAnimationFrame: callback => callback()};
  }

  createElementNS(_namespace, name) {
    return new FakeElement(name);
  }
}

testContractsAndNormalization();
testProjection();
testResolverAllowlist();
testExactHeightPaintCenter();
testCandidateMonotonicity();
await testOverlayLifecycleAndIntegration();

console.log("画笔光标回归通过：8 类半径契约、白名单、精确中心、1/2/4 倍投影、无事件 overlay 与生命周期清理均符合要求。");
