import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";

// Use the same saved map and viewport for both builds. Centre each homeland
// before measuring it, so countries outside the camera aren't counted as hidden.
export async function auditCountryLabels(page, path) {
  const scales = process.env.FMG_COUNTRY_SCALES?.split(",").map(Number) ?? [0.5, 0.75, 1, 1.35, 1.65, 2.25, 3.2, 4.5];
  assert.ok(scales.length && scales.every(s => Number.isFinite(s) && s >= 0.5));
  const screenshots = JSON.parse(process.env.FMG_COUNTRY_SHOTS || "{}");
  const roster = await page.evaluate(() => {
    const {map, renderer} = window.__webglGeneratorApp;
    return map.politics.states.filter(s => s && !s.removed && (s.i || s.id)).map(s => {
      const item = renderer.labelItems.find(i => i.targetKind === "state" && i.targetId === (s.i || s.id));
      return {id: s.i || s.id, name: s.fullName || s.name, short: s.name, x: item?.x, y: item?.y,
        cells: item?.componentCells.length ?? 0, locked: item?.layout?.locked ?? false};
    });
  });
  const rows = [];
  const start = await page.evaluate(() => performance.now());
  for (const scale of scales) {
    for (const state of roster) {
      if (state.x == null) {
        rows.push({id: state.id, scale, mode: "无标签"});
        continue;
      }
      await page.evaluate(({state, scale}) => {
        const r = window.__webglGeneratorApp.renderer;
        r.locateBounds({minX: state.x, maxX: state.x, minY: state.y, maxY: state.y}, {minScale: scale, maxScale: scale});
      }, {state, scale});
      await page.waitForFunction(() => {
        const r = window.__webglGeneratorApp.renderer;
        return !r.viewportInteractionKind && !r.overlayInteractionSuspended && r.camera.offsetX === r.overlayCommittedCamera.offsetX;
      });
      const row = await page.evaluate(id => {
        const {renderer: r, map} = window.__webglGeneratorApp;
        const item = r.labelItems.find(i => i.targetKind === "state" && i.targetId === id);
        const rect = r.canvas.getBoundingClientRect(), scale = r.camera.scale;
        const glyphs = item.visible ? item.glyphNodes.map(node => {
          const box = node.getBoundingClientRect();
          const center = r.screenToWorld(box.x + box.width / 2, box.y + box.height / 2);
          const a = r.screenToWorld(box.left - 1, box.top - 1);
          const b = r.screenToWorld(box.right + 1, box.bottom + 1);
          return [center.x, center.y, node.textContent, a.x, a.y, b.x, b.y];
        }) : [];
        const text = glyphs.map(g => g[2]).join("");
        const obstacles = r.labelItems.filter(i => i.visible && i.box && i.targetKind !== "province" && i.targetKind !== "state")
          .map(i => [i.box.left - rect.width / 2, i.box.top - rect.height / 2, i.box.right - rect.width / 2, i.box.bottom - rect.height / 2]);
        return {id, scale, mode: item.visible ? text === item.text ? "全称" : "简称" : "隐藏",
          text, glyphs, size: item.visible ? parseFloat(getComputedStyle(item.contentNode).fontSize) : 0,
          style: item.resolvedStyle, minScale: item.minScale, sx: rect.width * scale / map.metadata.graphWidth,
          sy: rect.height * scale / map.metadata.graphHeight, obstacles};
      }, state.id);
      rows.push(row);
      const screenshot = screenshots[state.name + "@" + scale];
      if (screenshot) await page.screenshot({path: screenshot, clip: {x: 425, y: 270, width: 590, height: 360}, animations: "disabled"});
    }
    console.log(`已核对 ${scale} 倍的 ${roster.length} 个国家`);
  }
  const health = await page.evaluate(s => ({gl: window.__webglGeneratorApp.renderer.gl.getError(),
    longTasks: window.__task419LongTasks.filter(t => t.start >= s)}), start);
  await writeFile(path, JSON.stringify({roster, scales, rows, health}));
  assert.equal(rows.length, roster.length * scales.length);
  assert.equal(health.gl, 0);
  assert.ok(health.longTasks.every(t => t.duration <= 200), JSON.stringify(health.longTasks));
  return {countries: roster.length, scales, measurements: rows.length, path};
}
