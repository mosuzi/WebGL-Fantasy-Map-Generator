import fs from "node:fs";
import {performance} from "node:perf_hooks";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  buildSeafloorResetPlan,
  createResetSeafloorCommand,
  inspectSeafloorReset,
  seafloorResetPreviewChanges
} from "../app/webgl-generator/src/runtime/seafloor-reset.js";

const map = createMap(48, 32);
const beforeGrid = Uint8Array.from(map.grid.cells.h);
const beforePack = Uint8Array.from(map.pack.cells.h);
const beforeFeatures = structuredClone(map.features);
const beforeFeatureIds = [...map.grid.cells.f];
const beforeMask = Array.from(map.grid.cells.h, height => height >= 20);
const beforeLake = map.grid.cells.h[map.__testLakeCell];

const first = buildSeafloorResetPlan(map, {seed: "seafloor-regression"});
const repeated = buildSeafloorResetPlan(map, {seed: "seafloor-regression"});
const different = buildSeafloorResetPlan(map, {seed: "seafloor-regression-next"});
const inspection = inspectSeafloorReset(map, {seed: "seafloor-regression"});

assert(first.resultChecksum === repeated.resultChecksum, "相同 seed 的海底结果不确定");
assert(first.resultChecksum !== different.resultChecksum, "不同 seed 没有改变海盆形态");
assert(inspection.valid && inspection.resultChecksum === first.resultChecksum, "预检与正式方案不一致");
assert(first.stats.shelfCells > 0 && first.stats.slopeCells > 0 && first.stats.basinCells > 0, `大陆架 / 陆坡 / 海盆层次缺失：${JSON.stringify(first.stats)}`);
assert(first.stats.ridgeCells > 0 && first.stats.trenchCells > 0, `洋中脊 / 海沟层次缺失：${JSON.stringify(first.stats)}`);
assert(first.stats.minHeight >= 0 && first.stats.maxHeight <= 19, `开放海洋高度越界：${first.stats.minHeight}..${first.stats.maxHeight}`);
assert(seafloorResetPreviewChanges(first).length === first.stats.changedCells, "预览变化数量与方案不一致");

const history = new EditHistory();
history.execute(createResetSeafloorCommand(first), {map});
assert(history.getStats().undo === 1 && history.getStats().lastDomain === "height", "重设海底没有形成单条高度历史");
assert(JSON.stringify(map.features) === JSON.stringify(beforeFeatures), "重设海底修改了 Feature 记录");
assert(JSON.stringify(map.grid.cells.f) === JSON.stringify(beforeFeatureIds), "重设海底修改了 Feature 归属");
assert(Array.from(map.grid.cells.h, height => height >= 20).every((land, cell) => land === beforeMask[cell]), "重设海底改变了陆海掩码");
assert(map.grid.cells.h[map.__testLakeCell] === beforeLake, "重设海底修改了湖泊高度");
assert(map.grid.cells.h.every((height, cell) => beforeMask[cell] ? height === beforeGrid[cell] : true), "重设海底修改了陆地高度");
assert(map.pack.cells.h.every((height, cell) => height === map.grid.cells.h[map.pack.cells.g[cell]]), "重设后 grid / pack 高度镜像不一致");
assert(map.metadata.derivedStale.systems.includes("climate") && !map.metadata.derivedStale.systems.includes("features"), "重设海底的派生标记不正确");

history.undo({map});
assert(equalTyped(map.grid.cells.h, beforeGrid) && equalTyped(map.pack.cells.h, beforePack), "撤销没有恢复 grid / pack 海洋高度");
assert(!map.metadata.derivedStale, "撤销没有恢复原派生状态");
history.redo({map});
assert(history.getStats().redo === 0 && map.pack.cells.h.every((height, cell) => height === map.grid.cells.h[map.pack.cells.g[cell]]), "重做没有恢复海底方案");

const generatedMap = generatePlaceholderMap({seed: "seafloor-real-map", cellsTarget: 5000});
const generatedBefore = Uint8Array.from(generatedMap.grid.cells.h);
const generatedFeatureIds = [...generatedMap.grid.cells.f];
const generatedFeatures = structuredClone(generatedMap.features);
const generatedPlan = buildSeafloorResetPlan(generatedMap, {seed: "seafloor-real-reset"});
new EditHistory().execute(createResetSeafloorCommand(generatedPlan), {map: generatedMap});
assert(generatedMap.grid.cells.f.every((featureId, cell) => featureId === generatedFeatureIds[cell]), "真实生成图的 Feature 归属发生变化");
assert(JSON.stringify(generatedMap.features) === JSON.stringify(generatedFeatures), "真实生成图的 Feature / 岸线快照发生变化");
assert(generatedMap.grid.cells.h.every((height, cell) => generatedFeatures.features[generatedFeatureIds[cell]]?.type === "ocean" ? height < 20 : height === generatedBefore[cell]), "真实生成图修改了湖泊或陆地");
assert(generatedMap.pack.cells.h.every((height, packCell) => {
  const gridCell = generatedMap.pack.cells.g[packCell];
  return generatedFeatures.features[generatedFeatureIds[gridCell]]?.type === "ocean" ? height === generatedMap.grid.cells.h[gridCell] : true;
}), "真实生成图的开放海洋 grid / pack 镜像不一致");

const largeMap = createMap(320, 320, {islandRadius: 58, lake: false});
const startedAt = performance.now();
const largePlan = buildSeafloorResetPlan(largeMap, {seed: "seafloor-100k"});
const durationMs = performance.now() - startedAt;
assert(largeMap.grid.cells.h.length >= 100000, "100k fixture 规模不足");
assert(largePlan.stats.byteLength <= 1_300_000, `100k 紧凑历史超预算：${largePlan.stats.byteLength}`);
assert(durationMs < 2500, `100k 海底方案生成过慢：${durationMs.toFixed(1)}ms`);

const panelSource = fs.readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8");
const bridgeSource = fs.readFileSync(new URL("../app/webgl-generator/src/ui/panels/height-panel.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
assert(panelSource.includes("重设海底") && panelSource.includes("预览新海底") && panelSource.includes("应用重设"), "玩家高度面板缺少重设海底入口");
assert(bridgeSource.includes("onSeafloorResetPreview") && bridgeSource.includes("getSeafloorResetPreview"), "高度面板桥接缺少海底预览状态");
assert(appSource.includes("plan.resultChecksum !== reserved.resultChecksum"), "应用前没有复核预览结果");
assert(appSource.includes("createResetSeafloorCommand(plan)"), "海底方案没有通过专用命令提交");

console.log(JSON.stringify({
  ok: true,
  cells: first.stats.oceanCells,
  layers: {
    shelf: first.stats.shelfCells,
    slope: first.stats.slopeCells,
    basin: first.stats.basinCells,
    ridge: first.stats.ridgeCells,
    trench: first.stats.trenchCells
  },
  checksum: first.resultChecksum,
  generated: {gridCells: generatedMap.grid.cells.h.length, oceanCells: generatedPlan.stats.oceanCells, checksum: generatedPlan.resultChecksum},
  history: history.getStats(),
  large: {
    cells: largeMap.grid.cells.h.length,
    oceanCells: largePlan.stats.oceanCells,
    bytes: largePlan.stats.byteLength,
    durationMs: Math.round(durationMs * 10) / 10
  }
}, null, 2));

function createMap(width, height, {islandRadius = Math.min(width, height) * 0.23, lake = true} = {}) {
  const count = width * height;
  const points = new Array(count);
  const neighbors = new Array(count);
  const heights = new Uint8Array(count);
  const featureIds = new Uint16Array(count);
  const borders = new Uint8Array(count);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const lakeCell = Math.floor(centerY) * width + Math.floor(centerX);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      points[cell] = [x, y];
      neighbors[cell] = [x > 0 ? cell - 1 : null, x + 1 < width ? cell + 1 : null, y > 0 ? cell - width : null, y + 1 < height ? cell + width : null].filter(Number.isInteger);
      borders[cell] = x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0;
      const dx = (x - centerX) / 1.35;
      const dy = y - centerY;
      const land = Math.hypot(dx, dy) <= islandRadius;
      heights[cell] = land ? 38 + ((x + y) % 24) : (x * 7 + y * 11) % 20;
      featureIds[cell] = land ? 2 : 1;
    }
  }
  if (lake) {
    heights[lakeCell] = 8;
    featureIds[lakeCell] = 3;
  }
  const map = {
    metadata: {seed: "seafloor-fixture"},
    options: {seed: "seafloor-fixture"},
    grid: {
      points,
      cells: {
        i: Uint32Array.from({length: count}, (_, cell) => cell),
        p: Uint32Array.from({length: count}, (_, cell) => cell),
        c: neighbors,
        b: borders,
        h: heights,
        f: Array.from(featureIds)
      }
    },
    features: {
      features: [null, {id: 1, i: 1, type: "ocean", group: "ocean", land: false}, {id: 2, i: 2, type: "island", group: "island", land: true}, {id: 3, i: 3, type: "lake", group: "freshwater", land: false}],
      shore: {coastline: [[[1, 1], [2, 2]]], lakeShore: [[[3, 3], [4, 4]]]}
    },
    pack: {
      cells: {
        g: Uint32Array.from({length: count}, (_, cell) => cell),
        h: Uint8Array.from(heights),
        f: Array.from(featureIds)
      }
    }
  };
  Object.defineProperty(map, "__testLakeCell", {value: lakeCell, enumerable: false});
  return map;
}

function equalTyped(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
