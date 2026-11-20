import {readFile, writeFile} from "node:fs/promises";
import {createServer} from "vite";

// Offline audit. Enumerate translations and directions rather than using the
// renderer's shortlist. Every positive result is an exact, reproducible fit.
const [archive, measurement, output] = process.argv.slice(2);
const fixedPositions = process.argv.includes("--fixed-positions");
const data = JSON.parse(await readFile(measurement));
const vite = await createServer({configFile: false, root: "app/webgl-generator", server: {middlewareMode: true, hmr: false}, logLevel: "error"});
try {
  const load = path => vite.ssrLoadModule("/src/" + path + ".js");
  const {parseMapDocumentFile} = await load("runtime/map-file-io");
  const {resolveStateLabelPlacement} = await load("renderer/state-label-territory");
  const {homelandOutline, homelandContainsBox} = await load("renderer/state-label-footprint");
  const {createPoliticalLabelGlyphLayout} = await load("renderer/political-label-layout");
  const bytes = await readFile(archive);
  const {map} = await parseMapDocumentFile({defaultView: globalThis}, {arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
  const results = [];
  for (const state of data.roster) {
    const model = map.politics.states.find(s => s && (s.i || s.id) === state.id);
    const place = resolveStateLabelPlacement(map, model);
    const outline = homelandOutline(map, place?.componentCellSet);
    const cells = place?.componentCells ?? [];
    const points = cells.map(i => map.pack.cells.p[i]);
    const weight = cells.reduce((sum, i) => sum + map.pack.cells.area[i], 0);
    const mean = [0, 1].map(axis => cells.reduce((sum, i) => sum + map.pack.cells.p[i][axis] * map.pack.cells.area[i], 0) / weight);
    const bounds = [0, 1].map(axis => [Math.min(...points.map(p => p[axis])), Math.max(...points.map(p => p[axis]))]);
    const bias = (x, y) => Math.hypot(...[x, y].map((v, k) => (v - mean[k]) / Math.max(1, bounds[k][1] - bounds[k][0])));
    const samples = data.rows.filter(r => r.id === state.id);
    const reference = samples.find(r => r.scale === 1 && r.glyphs?.length) || samples.find(r => r.glyphs?.length);
    for (const row of samples) {
      const {scale, sx, sy, style} = row;
      const result = {id: state.id, name: state.name, scale, mode: row.mode, size: row.size};
      results.push(result);
      for (const g of row.glyphs ?? []) {
        if (g.length > 3 && !state.locked && !homelandContainsBox(outline, ...g.slice(3))) {
          throw Error(`${state.name} ${scale} 倍的实际字框越界：${g[2]}`);
        }
      }
      if (fixedPositions) {
        if (scale >= 2.8 && row.glyphs?.length) throw Error(`${state.name} 近景仍显示国名`);
        if (!reference || !row.glyphs?.length || state.locked) continue;
        if (row.text !== reference.text) throw Error(`${state.name} 缩放改变了名称`);
        result.maxErrorPx = Math.max(...row.glyphs.map(([x, y], i) => Math.hypot(
          (x - reference.glyphs[i][0]) * sx, (y - reference.glyphs[i][1]) * sy
        )));
        if (result.maxErrorPx > 0.5) throw Error(`${state.name} 缩放后偏移 ${result.maxErrorPx}px`);
        continue;
      }
      if (!cells.length || row.mode === "无标签" || scale >= 3.95 || state.locked || scale < row.minScale) {
        result.reason = !cells.length ? "无本土" : scale >= 3.95 ? "近景图层淡出" : "存档显示设置";
        continue;
      }
      const boxesAt = (layout, x, y, size) => {
        const m = Math.max(2, size * 0.12);
        return layout.glyphs.every(({box: b}) => homelandContainsBox(outline, x + (b.left - m) / sx, y + (b.top - m) / sy,
          x + (b.right + m) / sx, y + (b.bottom + m) / sy));
      };
      const centered = row.glyphs.length && [0, 1].map(k => row.glyphs.reduce((n, g) => n + g[k], 0) / row.glyphs.length);
      const oldBias = centered ? bias(...centered) : null;
      result.bias = oldBias;
      // Mark a one-sided layout only if the displacement is material and a
      // same-size, more central label can clear the visible city obstacles.
      const offCenter = oldBias >= 0.18;
      if (row.mode === "全称" && !offCenter) continue;
      const minimum = Math.min(style.fontSize * Math.min(1, Math.sqrt(scale)), Math.max(11, style.fontSize * 0.48));
      const step = Math.max(2, 3.5 / sx);
      const anchors = [...points];
      for (let y = bounds[1][0]; y <= bounds[1][1]; y += step) {
        for (let x = bounds[0][0]; x <= bounds[0][1]; x += step) anchors.push([x, y]);
      }
      const candidates = anchors.map(([x,y]) => ({x, y, bias: bias(x, y)}))
        .sort((a,b) => a.bias - b.bias);
      const screenAngle = Math.atan2(sy * Math.sin(place.rotation * Math.PI / 180), sx * Math.cos(place.rotation * Math.PI / 180)) * 180 / Math.PI;
      const options = [...new Set([screenAngle, 0, screenAngle - 20, screenAngle + 20, 90, 45, -45,
        -37, -23, -11, 13, 27, 39, 57, 73, 105, 121])];
      const padding = oldBias >= 0.24 ? 1 : scale < 0.85 ? 14 : scale < 1.6 ? 9 : 5;
      const fitsCities = (layout, x, y) => layout.glyphs.every(({box: b}) => !row.obstacles.some(([l,t,r,d]) =>
        b.right + (x-state.x)*sx + padding > l && b.left + (x-state.x)*sx - padding < r &&
        b.bottom + (y-state.y)*sy + padding > t && b.top + (y-state.y)*sy - padding < d));
      for (const name of new Set([state.name, ...(row.mode === "隐藏" || (row.mode === "简称" && offCenter) ? [state.short] : [])])) {
        const checkSide = row.text === name;
        const sizes = checkSide && oldBias >= 0.23
          ? [...new Set([row.size, Math.max(minimum, row.size * 0.85)])] : [checkSide ? row.size : minimum];
        let witness = null;
        for (const size of sizes) {
          const maxBias = size < row.size && checkSide ? Math.min(0.12, oldBias - 0.13) : oldBias - 0.09;
          const count = Array.from(name).length;
          const shapes = count === 1 ? [[1, 0, 0]] : [[1, 0, 0], [style.letterSpacing, 0, 0], [1, -0.65, 0],
            [1, 0.65, 0], [style.letterSpacing, 0, 1.5], [1, 0, 2.4], [size * 0.4, -0.9, 0], [size * 0.4, 0.9, 0]];
          for (const degrees of count === 1 ? [0] : options) {
            const rotation = degrees < -45 ? degrees + 180 : degrees > 135 ? degrees - 180 : degrees;
            for (const [spacing, bend, gap] of shapes) {
              const layout = createPoliticalLabelGlyphLayout(name, {...style, fontSize: size}, {
                upright: true, targetKind: "state", rotation, extraSpacing: spacing - Math.max(2.4, style.letterSpacing),
                bend: bend * size, splitAt: Math.ceil(count / 2), extraGap: gap * size
              });
              const dx = layout.glyphs.reduce((sum, g) => sum + g.x, 0) / count / sx;
              const dy = layout.glyphs.reduce((sum, g) => sum + g.y, 0) / count / sy;
              const site = candidates.find(({x, y}) => (!checkSide || bias(x + dx, y + dy) <= maxBias)
                && boxesAt(layout, x, y, size) && (!checkSide || fitsCities(layout, x, y)));
              if (site) {
                witness = {name, size, rotation, spacing, bend, gap, ...site, bias: bias(site.x + dx, site.y + dy)};
                break;
              }
            }
            if (witness) break;
          }
          if (witness) break;
        }
        if (witness) {result.witness = witness; break;}
      }
    }
  }
  await writeFile(output, JSON.stringify(results));
  for (const scale of data.scales) {
    console.log(scale, results.filter(r => r.scale === scale && r.witness).map(r => r.name + "(" + r.mode + ")").join(" "));
  }
  if (process.argv.includes("--verify") && results.some(r => r.witness)) {
    throw Error("仍有可改善的排字，见逐国报告");
  }
} finally {
  await vite.close();
}
