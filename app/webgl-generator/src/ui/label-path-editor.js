import {manualLabelPlacement} from "../renderer/manual-label-path.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const names = ["起点", "弯曲", "终点"];

export function bindLabelPathEditor(doc, state, commit) {
  const trigger = doc.getElementById("edit-map-label-path");
  const dialog = doc.createElement("dialog");
  dialog.className = "label-path-editor";
  dialog.setAttribute("aria-label", "标签排布");
  dialog.setAttribute("aria-modal", "true");
  const svgElement = tag => doc.createElementNS(svgNamespace, tag);
  const svg = svgElement("svg");
  const bar = doc.createElement("div");
  bar.className = "label-path-tools";
  const hint = doc.createElement("span");
  hint.setAttribute("role", "status");
  bar.append(hint);
  function button(text, action) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "secondary-action";
    btn.textContent = text;
    btn.addEventListener("click", action);
    bar.append(btn);
    return btn;
  }
  const reset = button("恢复自动", () => save({position: null}));
  const apply = button("应用", () => save(toPatch()));
  const cancel = button("取消", close);
  const line = svgElement("path"), text = svgElement("g");
  line.classList.add("label-path-guide");
  text.dataset.grip = line.dataset.grip = "move";
  const handles = names.map((name, i) => {
    const circle = svgElement("circle");
    circle.setAttribute("r", "6");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("aria-label", name + "，方向键微调");
    circle.dataset.grip = String(i);
    return circle;
  });
  svg.append(line, text, ...handles);
  dialog.append(svg, bar);
  doc.body.append(dialog);
  let item, map, points, initial, fontScale, breakAt, drag;

  function close() {
    if (dialog.open) dialog.close();
    item?.node.classList.remove("label-path-source");
    item = map = drag = null;
  }
  trigger?.addEventListener("click", () => {
    if (!state.map || !state.renderer || dialog.open) return;
    state.canvasToolModes?.reset("label-path-editor");
    map = state.map;
    dialog.showModal();
    draw();
    cancel.focus();
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  doc.defaultView.addEventListener("resize", close);
  function valid() {
    return map === state.map && item?.node.isConnected && item.visible;
  }
  function save(patch) {
    if (!valid()) return close();
    const result = commit({targetKind: item.targetKind, targetId: item.targetId}, patch);
    if (result?.executed || result?.noop) close();
  }
  function world(p) {
    return state.renderer.screenToWorld(p.x, p.y);
  }
  function toPatch() {
    const [a, center, b] = points.map(world);
    return {position: center, path: {start: {x: a.x - center.x, y: a.y - center.y},
      end: {x: b.x - center.x, y: b.y - center.y}, fontScale, breakAt}};
  }
  function hit(x, y) {
    const rect = state.renderer.canvas.getBoundingClientRect();
    const within = box => x - rect.left >= box.left && x - rect.left <= box.right
      && y - rect.top >= box.top && y - rect.top <= box.bottom;
    return state.renderer.labelItems.find(label => label.visible && label.box && within(label.box)
      && (!label.box.parts || label.box.parts.some(within)));
  }
  function select(label) {
    item?.node.classList.remove("label-path-source");
    item = label;
    const r = state.renderer, rect = r.canvas.getBoundingClientRect();
    const style = doc.defaultView.getComputedStyle(item.contentNode);
    const size = parseFloat(style.fontSize);
    text.style.fontFamily = style.fontFamily;
    text.style.fontSize = style.fontSize;
    text.style.fontWeight = style.fontWeight;
    text.style.fontStyle = style.fontStyle;
    text.style.fill = style.color;
    text.replaceChildren(...Array.from(item.text, char => {
      const glyph = svgElement("text");
      glyph.textContent = char;
      return glyph;
    }));
    if (item.manualPath) {
      ({fontScale, breakAt} = item.manualPath);
      points = [item.manualPath.start, {x: 0, y: 0}, item.manualPath.end].map(offset => {
        const p = r.worldToScreen(item.x + offset.x, item.y + offset.y, rect);
        return {x: p.x + rect.left, y: p.y + rect.top};
      });
    } else {
      const layout = item.homelandLayout?.result?.layout;
      const angle = (layout?.rotation ?? item.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const centers = item.glyphNodes.map(node => {
        const b = node.getBoundingClientRect();
        return {x: b.x + b.width / 2, y: b.y + b.height / 2};
      });
      const along = centers.map(p => p.x * cos + p.y * sin);
      const across = centers.map(p => p.y * cos - p.x * sin);
      const b = item.contentNode.getBoundingClientRect();
      const mid = values => (Math.min(...values) + Math.max(...values)) / 2;
      const center = centers.length
        ? {x: mid(along) * cos - mid(across) * sin, y: mid(along) * sin + mid(across) * cos}
        : {x: b.x + b.width / 2, y: b.y + b.height / 2};
      const span = centers.length > 1 ? Math.max(...along) - Math.min(...along) : b.width - size;
      const half = Math.max(centers.length === 1 && item.text !== item.displayText ? size * Array.from(item.text).length / 2 : 10, span / 2);
      points = [-half, 0, half].map(d => ({x: center.x + cos * d, y: center.y + sin * d}));
      breakAt = layout?.lines === 2 && item.displayText === item.text
        ? Math.max(0, across.findIndex(v => Math.abs(v - across[0]) > size / 2)) : 0;
      fontScale = size / (item.resolvedStyle.fontSize * r.camera.scale);
    }
    initial = points.map(p => ({...p}));
    item.node.classList.add("label-path-source");
    draw();
  }
  function draw() {
    svg.classList.toggle("has-label", Boolean(item));
    reset.hidden = apply.hidden = !item;
    hint.textContent = item ? "拖文字移动，拖两端转向，拖中点弯曲" : "点选地图上要调整的文字";
    if (!item) return;
    const [a, m, b] = points;
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const clearance = parseFloat(text.style.fontSize) * (breakAt ? 1.25 : 0.5) + 10;
    const offset = `translate(${(b.y - a.y) / length * clearance} ${(a.x - b.x) / length * clearance})`;
    line.setAttribute("transform", offset);
    const control = {x: 2 * m.x - (a.x + b.x) / 2, y: 2 * m.y - (a.y + b.y) / 2};
    line.setAttribute("d", `M ${a.x},${a.y} Q ${control.x},${control.y} ${b.x},${b.y}`);
    handles.forEach((node, i) => {
      node.setAttribute("transform", offset);
      node.setAttribute("cx", points[i].x);
      node.setAttribute("cy", points[i].y);
    });
    const path = {start: {x: a.x - m.x, y: a.y - m.y}, end: {x: b.x - m.x, y: b.y - m.y}, breakAt, fontScale};
    const layout = manualLabelPlacement(item, m, path, 1, 1, state.renderer.camera.scale);
    layout.glyphs.forEach((g, i) => text.children[i].setAttribute("transform", `translate(${m.x + g.x} ${m.y + g.y}) rotate(${g.angle})`));
    reset.disabled = !item.layout.locked;
    const {graphWidth, graphHeight} = map.metadata;
    const outside = points.map(world).some(p => p.x < 0 || p.x > graphWidth || p.y < 0 || p.y > graphHeight);
    const collapsed = Math.hypot(a.x - b.x, a.y - b.y) < 4;
    if (outside) hint.textContent = "请把三个控制点移到地图范围内";
    else if (collapsed) hint.textContent = "请将起点与终点分开";
    apply.disabled = outside || collapsed || !points.some((p, i) => Math.hypot(p.x - initial[i].x, p.y - initial[i].y) >= 0.5);
  }
  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag) return;
    let grip = event.target.closest("[data-grip]")?.dataset.grip;
    if (!grip) {
      const label = hit(event.clientX, event.clientY);
      if (!label || (item && !apply.disabled && label !== item)) return;
      if (label !== item) select(label);
      grip = "move";
    }
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, grip, x: event.clientX, y: event.clientY, start: points.map(p => ({...p}))};
  });
  function move(event) {
    if (drag?.id !== event.pointerId) return;
    points = drag.start.map((p, i) => drag.grip === "move" || Number(drag.grip) === i
      ? {x: p.x + event.clientX - drag.x, y: p.y + event.clientY - drag.y} : p);
    draw();
  }
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerup", event => { if (drag?.id === event.pointerId) { move(event); drag = null; } });
  function cancelDrag(event) {
    if (drag?.id !== event.pointerId) return;
    points = drag.start;
    drag = null;
    draw();
  }
  svg.addEventListener("pointercancel", cancelDrag);
  svg.addEventListener("lostpointercapture", cancelDrag);
  svg.addEventListener("keydown", event => {
    const i = handles.indexOf(event.target);
    const step = event.shiftKey ? 10 : 1;
    const delta = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]}[event.key];
    if (i < 0 || !delta || !item) return;
    event.preventDefault();
    points[i] = {x: points[i].x + delta[0], y: points[i].y + delta[1]};
    draw();
  });
  return {close};
}
