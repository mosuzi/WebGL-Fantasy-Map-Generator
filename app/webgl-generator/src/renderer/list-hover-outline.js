import {listHoverGeometry} from "./list-hover-geometry.js";

const DURATION = 1600;
const bands = [[16, 0.04], [13, 0.08], [10, 0.14], [7, 0.24], [4, 0.5], [2, 0.95]];

// This sibling of the map canvas is transient. It participates in neither
// picking nor export; animating it requires no WebGL draw or map update.
export function showListHoverOutline(renderer, object, pointForObject) {
  renderer.listHoverOutline?.remove();
  const map = renderer.map;
  const paths = listHoverGeometry(map, object, pointForObject);
  if (!paths.length) return;
  const canvas = renderer.canvas;
  const doc = canvas.ownerDocument;
  function element(tag, parent, attributes = {}) {
    const node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    parent?.appendChild(node);
    return node;
  }
  const svg = element("svg", null, {class: "list-hover-outline", "aria-hidden": "true"});
  const defs = element("defs", svg);
  const strokes = paths.map((_, i) => element("path", defs, {id: `list-hover-path-${i}`, pathLength: 1}));
  const isArea = paths[0].closed;
  let clip;
  if (isArea) {
    const mask = element("clipPath", defs, {id: "list-hover-interior"});
    clip = element("path", mask, {"clip-rule": "evenodd"});
  }
  const ink = element("g", svg, {fill: "none", stroke: "#962f61", "stroke-linejoin": "round", ...(clip && {"clip-path": "url(#list-hover-interior)"})});
  const traces = strokes.map(path => {
    const trace = element("g", ink, {class: "list-hover-trace", "stroke-dasharray": "1 1"});
    for (const [width, opacity] of bands) {
      element("use", trace, {href: "#" + path.id, "stroke-width": isArea ? width : width * 0.52, "stroke-opacity": opacity});
    }
    return trace;
  });
  let viewport;
  function update() {
    if (renderer.map !== map) return remove();
    const {scale, offsetX, offsetY} = renderer.camera;
    const key = [canvas.clientWidth, canvas.clientHeight, scale, offsetX, offsetY].join("/");
    if (key === viewport) return;
    viewport = key;
    const rect = {width: canvas.clientWidth, height: canvas.clientHeight};
    const project = ([x, y]) => renderer.worldToScreen(x, y, rect);
    const projected = paths.map(({center, points, closed}) => {
      if (center) {
        const {x, y} = project(center);
        return {d: `M${x},${y - 12}a12,12 0 1,1 0,24a12,12 0 1,1 0,-24Z`, length: 24 * Math.PI};
      }
      const screen = points.map(project);
      let length = 0;
      let last = closed ? screen.at(-1) : screen[0];
      const coords = screen.map(p => {
        length += Math.hypot(p.x - last.x, p.y - last.y);
        last = p;
        return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      });
      return {length, d: "M" + coords.join("L") + (closed ? "Z" : "")};
    });
    const total = projected.reduce((sum, path) => sum + path.length, 0) || 1;
    let start = 0;
    projected.forEach(({length, d}, i) => {
      strokes[i].setAttribute("d", d);
      traces[i].style.animationDelay = `${DURATION * start / total}ms`;
      traces[i].style.animationDuration = `${DURATION * length / total}ms`;
      start += length;
    });
    clip?.setAttribute("d", projected.map(path => path.d).join(""));
  }
  function remove() {
    svg.remove();
    if (renderer.listHoverOutline?.remove === remove) renderer.listHoverOutline = null;
  }
  renderer.listHoverOutline = {update, remove};
  update();
  canvas.after(svg);
  return renderer.listHoverOutline;
}
