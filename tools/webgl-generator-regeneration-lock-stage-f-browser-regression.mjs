#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  assertFrozenRiverState,
  prepareRiverRegenerationLocks
} from "../app/webgl-generator/src/generator/river-regeneration-locks.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5533;
const timeoutMs = 600000;
const scaleTargets = parseNumberList(readArgument("scales", "10000,50000,100000"));
const uiCells = Number(readArgument("ui-cells", "10000"));
const scaleSeeds = new Map([
  [50000, "regeneration-lock-stage-f-scale-valid-50000-v9"],
  [100000, "regeneration-lock-stage-f-scale-valid-100000-v3"]
]);
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const riverSeedPreflight = scaleTargets
  .filter(cellsTarget => scaleSeeds.has(cellsTarget))
  .map(cellsTarget => assertScaleRiverSeed(cellsTarget, scaleSeed(cellsTarget)));
for (const preflight of riverSeedPreflight) {
  console.log(`[stage-f] river seed preflight ${JSON.stringify(preflight)}`);
}

const allPanelCases = [
  panel("state", "state-panel", "open-state-panel"),
  panel("province", "province-panel", "open-province-panel"),
  panel("city", "city-panel", "open-city-panel"),
  panel("route", "route-panel", "open-route-panel"),
  panel("river", "river-panel", "open-river-panel"),
  panel("marker", "marker-panel", "open-marker-panel"),
  panel("diplomacy-relation", "diplomacy-panel", "open-diplomacy-panel"),
  panel("religion", "religion-panel", "open-religion-panel"),
  panel("culture", "culture-panel", "open-culture-panel"),
  panel("military", "military-panel", "open-military-panel"),
  panel("zone", "zone-panel", "open-zone-panel"),
  panel("feature", "feature-panel", "open-feature-panel"),
  panel("ocean-current", "ocean-current-panel", "open-ocean-current-panel"),
  panel("economy-market", "economy-panel", "open-economy-panel", "市场"),
  panel("trade-flow", "economy-panel", "open-economy-panel", "交易")
];
const fromKind = readArgument("from-kind", "");
const panelCases = fromKind
  ? allPanelCases.slice(Math.max(0, allPanelCases.findIndex(item => item.kind === fromKind)))
  : allPanelCases;

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    consoleErrors.push(message.text());
    console.error(`[stage-f console] ${message.text()}`);
  });
  page.on("pageerror", error => {
    pageErrors.push(error.message);
    console.error(`[stage-f pageerror] ${error.message}`);
  });
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);

  await generateMap(page, uiCells, `regeneration-lock-stage-f-ui-${uiCells}`);
  const ui = [];
  for (const item of panelCases) {
    console.log(`[stage-f] UI ${item.panelId}/${item.kind}`);
    ui.push(await exercisePanelUi(page, item));
  }

  console.log(`[stage-f] protection ${uiCells}`);
  const protection = await exerciseProtection(page, panelCases, uiCells);
  assert.deepEqual(protection.unlockGaps, [], `解锁后对象未变化：${JSON.stringify(protection.unlockGaps)}`);

  const scales = [];
  for (const cellsTarget of scaleTargets) {
    console.log(`[stage-f] scale ${cellsTarget}`);
    const scale = await exerciseScale(page, cellsTarget);
    scales.push(scale);
    console.log(`[stage-f] scale result ${JSON.stringify(scale)}`);
  }

  const healthPerformanceSignals = consoleErrors.filter(message =>
    /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message)
  );
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  const constraintErrors = scales
    .filter(scale => scale.constraint?.error)
    .map(scale => ({cellsTarget: scale.cellsTarget, ...scale.constraint.error}));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    ok: constraintErrors.length === 0,
    denominator: {panels: new Set(allPanelCases.map(item => item.panelId)).size, kinds: allPanelCases.length},
    ui,
    protection,
    scales,
    riverSeedPreflight,
    constraintErrors,
    healthPerformanceSignals,
    applicationConsoleErrors,
    pageErrors
  }, null, 2));
  assert.deepEqual(constraintErrors, [], `世界约束失败：${JSON.stringify(constraintErrors)}`);
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function exerciseProtection(page, cases, cellsTarget) {
  const results = [];
  for (const {kind} of cases) {
    console.log(`[stage-f] protect/unlock ${kind}`);
    results.push(await page.evaluate(async ({kindValue, cellsTarget: target}) => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      unwrap(await api.generate.newMap({
        confirm: true,
        seed: `regeneration-lock-stage-f-protection-${kindValue}`,
        cellsTarget: target,
        heightmapTemplate: "continents"
      }), `new map ${kindValue}`);
      app.editHistory.clear();
      for (const kind of [
        "state", "province", "city", "route", "river", "marker", "diplomacy-relation",
        "religion", "culture", "military", "zone", "feature", "ocean-current",
        "economy-market", "trade-flow"
      ]) {
        const cleared = api.regenerationLocks.clearKind(kind);
        if (!cleared?.ok) throw new Error(`清理 ${kind} 锁失败`);
      }
      const listed = unwrap(api.objects.list(kindValue, {limit: 200}), `list ${kindValue}`);
      const stableFeature = kindValue === "feature"
        ? (app.map.pack.features || [])
          .filter(feature => feature?.i > 0 && !feature.removed && (
            feature.type === "lake" || (feature.land && feature.type === "island")
          ))
          .sort((left, right) => featureReferenceCount(left.i) - featureReferenceCount(right.i))[0]
        : null;
      const stableDiplomacy = kindValue === "diplomacy-relation" ? reciprocalDiplomacyPair() : null;
      const reference = stableDiplomacy
        ? {kind: kindValue, id: stableDiplomacy}
        : stableFeature
        ? {kind: kindValue, id: stableFeature.i}
        : listed.items.map(item => ({kind: kindValue, id: item.id})).find(item => canExercise(item));
      if (!reference) throw new Error(`${kindValue} 没有可执行的保护样本`);

      unwrap(api.regenerationLocks.set(reference, true), `lock ${kindValue}`);
      app.editHistory.clear();
      const lockedBefore = canonicalSnapshot(reference);
      const lockedPublicBefore = snapshot(reference);
      const lockedResult = await runNarrowAction(reference, 0);
      const lockedAfter = canonicalSnapshot(reference);
      const lockedPublicAfter = snapshot(reference);
      if (lockedAfter !== lockedBefore) {
        throw new Error(`${kindValue} 锁后最窄重生成改写了对象：${JSON.stringify({
          publicTopLevel: topLevelDiff(lockedPublicBefore, lockedPublicAfter),
          canonicalTopLevel: topLevelDiff(lockedBefore, lockedAfter)
        })}`);
      }

      unwrap(api.regenerationLocks.set(reference, false), `unlock ${kindValue}`);
      app.editHistory.clear();
      const unlockedBefore = canonicalSnapshot(reference);
      let unlockedAfter = unlockedBefore;
      let attempts = 0;
      for (; attempts < 6 && unlockedAfter === unlockedBefore; attempts++) {
        await runNarrowAction(reference, attempts + 1);
        unlockedAfter = canonicalSnapshot(reference);
      }
      return {
        kind: kindValue,
        id: reference.id,
        lockedProtected: true,
        lockedExecuted: Boolean(lockedResult?.executed),
        unlockChanged: unlockedAfter !== unlockedBefore,
        unlockAttempts: attempts
      };

      function canExercise(referenceValue) {
        if (["state", "province", "culture", "religion", "feature", "economy-market"].includes(referenceValue.kind)
          && Number(referenceValue.id) === 0) return false;
        if (referenceValue.kind === "marker") {
          const marker = listed.items.find(item => String(item.id) === String(referenceValue.id));
          return marker?.category === "resource";
        }
        if (referenceValue.kind === "religion") {
          const religion = listed.items.find(item => String(item.id) === String(referenceValue.id));
          return religion?.type !== "Folk";
        }
        if (referenceValue.kind !== "economy-market") return true;
        const id = Number(referenceValue.id);
        return app.map.pack.cells.i.some(cell =>
          Number(app.map.pack.cells.market?.[cell]) === id && Number(app.map.pack.cells.h?.[cell]) >= 20
        );
      }

      function featureReferenceCount(id) {
        let count = 0;
        for (const objects of [
          app.map.pack?.burgs,
          app.map.settlements?.cities,
          app.map.pack?.routes,
          app.map.settlements?.routes,
          app.map.markers?.markers,
          app.map.pack?.portDiagnostics?.features
        ]) {
          for (const object of objects || []) {
            if (Number(object?.feature) === Number(id)
              || Number(object?.port) === Number(id)
              || Number(object?.data?.feature) === Number(id)) count++;
          }
        }
        return count;
      }

      function reciprocalDiplomacyPair() {
        const states = (app.map.pack?.states || []).filter(state => state?.i > 0 && !state.removed);
        const inverse = relation => ({Vassal: "Suzerain", Suzerain: "Vassal"})[relation] || relation;
        for (let left = 0; left < states.length; left++) {
          for (let right = left + 1; right < states.length; right++) {
            const leftState = states[left];
            const rightState = states[right];
            const leftRelation = leftState.diplomacy?.[rightState.i];
            const rightRelation = rightState.diplomacy?.[leftState.i];
            if (leftRelation && leftRelation !== "Enemy"
              && inverse(leftRelation) === rightRelation && inverse(rightRelation) === leftRelation) {
              return `${Math.min(leftState.i, rightState.i)}:${Math.max(leftState.i, rightState.i)}`;
            }
          }
        }
        return null;
      }

      function snapshot(referenceValue) {
        const response = api.objects.get(referenceValue);
        if (!response?.ok) return JSON.stringify({missing: true, code: response?.error?.code});
        const value = structuredClone(response.data);
        delete value.regenerationLocked;
        if (referenceValue.kind === "economy-market") {
          const id = Number(referenceValue.id);
          value.ownedCells = app.map.pack.cells.i.filter(cell => Number(app.map.pack.cells.market?.[cell]) === id);
        }
        if (referenceValue.kind === "trade-flow") {
          const deal = (app.map.pack.deals || []).find(item => String(item?.i ?? item?.id) === String(referenceValue.id));
          value.packDeal = structuredClone(deal || null);
        }
        return JSON.stringify(value);
      }

      function canonicalSnapshot(referenceValue) {
        if (referenceValue.kind === "river") return rawEnvelope(referenceValue);
        if (referenceValue.kind === "feature") return featureEnvelope(referenceValue);
        if (referenceValue.kind === "culture" || referenceValue.kind === "religion") {
          return socialEnvelope(referenceValue);
        }
        return snapshot(referenceValue);
      }

      function rawEnvelope(referenceValue) {
        if (referenceValue.kind !== "river") return null;
        const id = Number(referenceValue.id);
        const river = (app.map.rivers?.rivers || []).find(item => Number(item?.i ?? item?.id) === id);
        const cells = (river?.cells || []).filter(cell => cell >= 0);
        return JSON.stringify({
          river: structuredClone(river || null),
          packRiver: structuredClone((app.map.pack?.rivers || []).find(item => Number(item?.i ?? item?.id) === id) || null),
          cells: cells.map(cell => [
            cell,
            Number(app.map.pack.cells.r?.[cell]),
            Number(app.map.pack.cells.fl?.[cell]),
            Number(app.map.pack.cells.conf?.[cell])
          ]),
          notes: structuredClone((app.map.notes?.notes || []).filter(note =>
            note?.kind === "river" && Number(note.objectId) === id
          ))
        });
      }

      function featureEnvelope(referenceValue) {
        const id = Number(referenceValue.id);
        const packCells = memberCells(app.map.pack.cells.f, id);
        const gridIds = [...new Set(packCells
          .map(cell => Number(app.map.grid.cells.f?.[app.map.pack.cells.g?.[cell]]))
          .filter(value => value > 0))];
        if (gridIds.length !== 1) throw new Error(`Feature #${id} 缺少唯一 grid 镜像`);
        const gridId = gridIds[0];
        const gridCells = memberCells(app.map.grid.cells.f, gridId);
        return JSON.stringify({
          packFeature: structuredClone(app.map.pack.features[id]),
          gridFeature: structuredClone(app.map.features.features[gridId]),
          gridId,
          packCells,
          gridCells,
          packAssignments: assignments(app.map.pack.cells, packCells, ["f", "h", "type", "haven", "harbor"]),
          gridAssignments: assignments(app.map.grid.cells, gridCells, ["f", "h"])
        });
      }

      function socialEnvelope(referenceValue) {
        const id = Number(referenceValue.id);
        const plural = referenceValue.kind === "culture" ? "cultures" : "religions";
        const field = referenceValue.kind;
        return JSON.stringify({
          object: structuredClone(app.map.society?.[plural]?.[id] || null),
          packObject: structuredClone(app.map.pack?.[plural]?.[id] || null),
          packCells: memberCells(app.map.pack.cells?.[field], id),
          gridCells: memberCells(app.map.grid.cells?.[field], id)
        });
      }

      function memberCells(values, id) {
        const cells = [];
        for (let cell = 0; cell < (values?.length || 0); cell++) {
          if (Number(values[cell]) === Number(id)) cells.push(cell);
        }
        return cells;
      }

      function assignments(cells, members, fields) {
        return Object.fromEntries(fields.map(field => [field, members.map(cell => cells[field]?.[cell])]));
      }

      function topLevelDiff(beforeJson, afterJson) {
        const before = JSON.parse(beforeJson);
        const after = JSON.parse(afterJson);
        return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
          .filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
          .map(key => ({key, before: before?.[key], after: after?.[key]}));
      }

      async function runNarrowAction(referenceValue, attempt) {
        const kind = referenceValue.kind;
        let response;
        if (kind === "culture") {
          const current = unwrap(api.objects.get(referenceValue), "get culture");
          response = api.edit.cultures.applyExpansion(referenceValue.id, {
            mode: "reexpand",
            expansionism: Math.max(0.1, Number(current.expansionism || 1) + attempt + 0.5),
            includeReligions: true,
            confirm: true
          });
        } else if (kind === "religion") {
          const current = unwrap(api.objects.get(referenceValue), "get religion");
          response = api.edit.religions.applyExpansion(referenceValue.id, {
            mode: "reexpand",
            expansion: current.expansion === "global" ? "culture" : "global",
            expansionism: Math.max(0.1, Number(current.expansionism || 1) + attempt + 0.5),
            confirm: true
          });
        } else if (kind === "ocean-current") {
          response = api.oceanCurrents.regenerate({seed: `stage-f-unlock-${attempt}`});
        } else if (kind === "economy-market") {
          if (!attempt) {
            response = api.edit.economy.rebuild({confirm: true});
          } else {
            const targetId = Number(referenceValue.id);
            const other = (app.map.pack.markets || []).find(item => {
              const id = Number(item?.i ?? item?.id);
              return item && id > 0 && id !== targetId;
            });
            const ownedCell = app.map.pack.cells.i.find(cell =>
              Number(app.map.pack.cells.market?.[cell]) === targetId && Number(app.map.pack.cells.h?.[cell]) >= 20
            );
            if (!other || !Number.isInteger(ownedCell)) throw new Error("市场解锁变化缺少归属样本");
            response = api.edit.economy.assignCells(other.i ?? other.id, [ownedCell], {confirm: true});
          }
        } else if (kind === "trade-flow") {
          response = await api.generate.regenerate("markers", {confirm: true});
        } else {
          const regenerationKind = {
            state: "states",
            province: "provinces",
            city: "cities",
            route: "routes",
            river: "rivers",
            marker: "markers",
            "diplomacy-relation": "diplomacy",
            military: "military",
            zone: "zones",
            feature: "features"
          }[kind];
          response = await api.generate.regenerate(regenerationKind, {confirm: true});
        }
        return unwrap(response, `${kind} narrow action`);
      }

      function unwrap(result, label) {
        if (!result?.ok) {
          throw new Error(`${label} 失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""} ${JSON.stringify(result?.error?.details || {})}`);
        }
        return result.data;
      }
    }, {kindValue: kind, cellsTarget}));
  }
  return {
    cases: results,
    unlockGaps: results.filter(item => !item.unlockChanged).map(item => ({
      kind: item.kind,
      id: item.id,
      attempts: item.unlockAttempts
    }))
  };
}

async function exercisePanelUi(page, item) {
  await clearLocks(page, item.kind);
  const panelRoot = await openPanel(page, item);
  const rows = panelRoot.locator(".object-table-row");
  await rows.first().waitFor({state: "visible"});
  assert.ok(await rows.count() >= 2, `${item.panelId}/${item.kind} 缺少两行列表批量样本`);

  const firstLock = rows.first().locator(".object-table-lock-action");
  await firstLock.click();
  await expectLockCount(page, item.kind, 1);
  const pressedLock = panelRoot.locator('.object-table-lock-action[aria-pressed="true"]');
  assert.equal(await pressedLock.count(), 1, `${item.kind} 行锁按钮没有进入按下态`);
  await pressedLock.click();
  await expectLockCount(page, item.kind, 0);

  const toolbar = panelRoot.getByRole("toolbar", {name: "重生成锁定批量操作"});
  await toolbar.getByRole("button", {name: "列表多选", exact: true}).click();
  const rowCheckboxes = panelRoot.locator(".object-table-row-selection-checkbox");
  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();
  await expectSelectionCount(toolbar, 2);
  await toolbar.getByRole("button", {name: "锁定选中", exact: true}).click();
  await expectLockCount(page, item.kind, 2);
  await toolbar.getByRole("button", {name: "解锁选中", exact: true}).click();
  await expectLockCount(page, item.kind, 0);
  await toolbar.getByRole("button", {name: "清空选择", exact: true}).click();
  await toolbar.getByRole("button", {name: "结束列表多选", exact: true}).click();

  const locate = rows.first().getByRole("button", {name: "定位", exact: true});
  if (await locate.count()) await locate.click();
  await toolbar.getByRole("button", {name: "在地图多选", exact: true}).click();
  const point = await findCanvasPickPoint(page, item.kind);
  assert.ok(point, `${item.panelId}/${item.kind} 找不到可点击的真实画布命中样本`);
  await page.mouse.click(point.x, point.y);
  await expectSelectionCount(toolbar, 1);
  await toolbar.getByRole("button", {name: "锁定选中", exact: true}).click();
  await expectLockCount(page, item.kind, 1);
  await toolbar.getByRole("button", {name: "解锁选中", exact: true}).click();
  await expectLockCount(page, item.kind, 0);
  await toolbar.getByRole("button", {name: "清空选择", exact: true}).click();
  const mapButton = toolbar.getByRole("button", {name: "地图多选中", exact: true});
  if (await mapButton.count()) await mapButton.click();

  const report = {
    panelId: item.panelId,
    kind: item.kind,
    rowLock: true,
    listBatch: 2,
    mapBatch: 1,
    canvasPoint: point
  };
  await closePanel(panelRoot);
  return report;
}

async function exerciseScale(page, cellsTarget) {
  await generateMap(page, cellsTarget, scaleSeed(cellsTarget));
  const listPanel = await openPanel(page, panel("city", "city-panel", "open-city-panel"));
  const toolbar = listPanel.getByRole("toolbar", {name: "重生成锁定批量操作"});
  const wrap = listPanel.locator(".object-table-wrap");
  const headerCheckbox = listPanel.getByRole("checkbox", {name: "选择当前列表", exact: true});
  const selectStarted = Date.now();
  await headerCheckbox.click();
  const selectedCount = await readSelectionCount(toolbar);
  const listSelectionMs = Date.now() - selectStarted;
  const domRows = await listPanel.locator(".object-table-row").count();
  const spacerRows = await listPanel.locator(".object-table-spacer-row").count();
  assert.ok(selectedCount > 120, `${cellsTarget} cells 城市表未进入高基数样本：${selectedCount}`);
  assert.ok(domRows < selectedCount, `${cellsTarget} cells 城市表没有缩小 DOM 窗口：${domRows}/${selectedCount}`);
  assert.ok(spacerRows > 0, `${cellsTarget} cells 城市表没有虚拟占位行`);
  await toolbar.getByRole("button", {name: "清空选择", exact: true}).click();

  await toolbar.getByRole("button", {name: "列表多选", exact: true}).click();
  await listPanel.locator(".object-table-row").first().click();
  await wrap.evaluate(node => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);
  await listPanel.locator(".object-table-row").last().click({modifiers: ["Shift"]});
  const shiftCount = await readSelectionCount(toolbar);
  assert.ok(shiftCount > domRows, `${cellsTarget} cells Shift 没有跨越虚拟窗口：${shiftCount}/${domRows}`);
  await toolbar.getByRole("button", {name: "清空选择", exact: true}).click();
  await toolbar.getByRole("button", {name: "结束列表多选", exact: true}).click();
  await closePanel(listPanel);

  const statePanel = await openPanel(page, panel("state", "state-panel", "open-state-panel"));
  const stateToolbar = statePanel.getByRole("toolbar", {name: "重生成锁定批量操作"});
  await statePanel.locator(".object-table-row").first().getByRole("button", {name: "定位", exact: true}).click();
  await stateToolbar.getByRole("button", {name: "在地图多选", exact: true}).click();
  const mapStarted = Date.now();
  const point = await findCanvasPickPoint(page, "state");
  assert.ok(point, `${cellsTarget} cells 地图多选找不到国家样本`);
  await page.mouse.click(point.x, point.y);
  await expectSelectionCount(stateToolbar, 1);
  const mapSelectionMs = Date.now() - mapStarted;
  await stateToolbar.getByRole("button", {name: "清空选择", exact: true}).click();
  const activeMapButton = stateToolbar.getByRole("button", {name: "地图多选中", exact: true});
  if (await activeMapButton.count()) await activeMapButton.click();
  await closePanel(statePanel);

  const constraint = await page.evaluate(async target => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const kinds = [
      "state", "province", "city", "route", "river", "marker", "diplomacy-relation",
      "religion", "culture", "military", "zone", "feature", "ocean-current",
      "economy-market", "trade-flow"
    ];
    const references = representativeReferences();
    const riverPreflight = assertCompleteLakeInletBindings();
    const presentKinds = new Set(references.map(reference => reference.kind));
    const missingKinds = kinds.filter(kind => !presentKinds.has(kind));
    if (missingKinds.length) throw new Error(`${target} cells 缺少世界约束样本：${missingKinds.join(",")}`);
    unwrap(api.regenerationLocks.setMany(references, true), "lock representative world");
    window.__webglGeneratorApp.editHistory.clear();
    const before = references.map(snapshot);
    const zoneTraceBefore = {
      lockStore: (app.map.regenerationLocks?.entries || [])
        .filter(entry => entry?.kind === "zone")
        .map(entry => String(entry.id)),
      capturedLockedZoneIds: (app.map.regenerationLocks?.entries || [])
        .filter(entry => entry?.kind === "zone")
        .map(entry => (app.map.zones?.zones || [])
          .find(zone => String(zone?.id ?? zone?.i) === String(entry.id)))
        .filter(Boolean)
        .map(zone => String(zone?.id ?? zone?.i)),
      mapZoneIds: (app.map.zones?.zones || []).map(zone => String(zone?.id ?? zone?.i)),
      packZoneIds: (app.map.pack?.zones || []).map(zone => String(zone?.id ?? zone?.i))
    };
    const zoneAssignments = [];
    const restoreMapZoneTrace = traceProperty(
      app.map,
      "zones",
      "map.zones",
      value => (value?.zones || []).map(zone => String(zone?.id ?? zone?.i)),
      zoneAssignments
    );
    const tracedPack = app.map.pack;
    const restorePackZoneTrace = traceProperty(
      tracedPack,
      "zones",
      "pack.zones",
      value => (value || []).map(zone => String(zone?.id ?? zone?.i)),
      zoneAssignments
    );
    const started = performance.now();
    let rebuildResult;
    try {
      rebuildResult = await api.oceanCurrents.rebuildWorld({
        confirm: true,
        seed: `stage-f-world-${target}`
      });
    } finally {
      restoreMapZoneTrace();
      restorePackZoneTrace();
    }
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    if (!rebuildResult?.ok) {
      for (const kind of kinds) unwrap(api.regenerationLocks.clearKind(kind), `clear ${kind}`);
      return {
        elapsedMs,
        locks: references.length,
        steps: 0,
        riverPreflight,
        zoneTraceBefore,
        zoneAssignments,
        error: structuredClone(rebuildResult?.error || {code: "unknown", message: "世界约束调用失败"})
      };
    }
    const rebuilt = rebuildResult.data;
    const after = references.map(snapshot);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      const changed = references.filter((_, index) => after[index] !== before[index]);
      throw new Error(`${target} cells 世界约束改写锁对象：${JSON.stringify(changed)}`);
    }
    for (const kind of kinds) unwrap(api.regenerationLocks.clearKind(kind), `clear ${kind}`);
    return {
      elapsedMs,
      locks: references.length,
      steps: rebuilt.steps?.length || 0,
      riverPreflight,
      zoneTraceBefore,
      zoneAssignments
    };

    function snapshot(reference) {
      const {kind, id} = reference;
      if (kind === "diplomacy-relation") {
        const [left, right] = String(id).split(":").map(Number);
        return JSON.stringify({
          left: app.map.pack.states[left]?.diplomacy?.[right],
          right: app.map.pack.states[right]?.diplomacy?.[left],
          politicsLeft: app.map.politics.states[left]?.diplomacy?.[right],
          politicsRight: app.map.politics.states[right]?.diplomacy?.[left]
        });
      }
      if (kind === "military") {
        const [stateId, regimentId] = String(id).split(":").map(Number);
        return JSON.stringify({
          pack: clone((app.map.pack.states[stateId]?.military || []).find(item => Number(item.i) === regimentId)),
          politics: clone((app.map.politics.states[stateId]?.military || []).find(item => Number(item.i) === regimentId))
        });
      }
      if (kind === "economy-market") {
        return JSON.stringify({
          pack: clone(find(app.map.pack.markets, id)),
          economy: clone(find(app.map.economy.markets, id)),
          cells: memberCells(app.map.pack.cells.market, id)
        });
      }
      if (kind === "trade-flow") {
        return JSON.stringify({
          pack: clone(find(app.map.pack.deals, id)),
          economy: clone(find(app.map.economy.deals, id))
        });
      }
      if (kind === "state") return JSON.stringify({politics: clone(find(app.map.politics.states, id)), pack: clone(find(app.map.pack.states, id))});
      if (kind === "province") return JSON.stringify({politics: clone(find(app.map.politics.provinces, id)), pack: clone(find(app.map.pack.provinces, id))});
      if (kind === "culture") return JSON.stringify({society: clone(find(app.map.society.cultures, id)), pack: clone(find(app.map.pack.cultures, id))});
      if (kind === "religion") return JSON.stringify({society: clone(find(app.map.society.religions, id)), pack: clone(find(app.map.pack.religions, id))});
      if (kind === "marker") return JSON.stringify({marker: clone(find(app.map.markers.markers, id)), pack: clone(find(app.map.pack.markers, id))});
      if (kind === "zone") return JSON.stringify({zone: clone(find(app.map.zones.zones, id)), pack: clone(find(app.map.pack.zones, id))});
      const rows = {
        city: app.map.settlements?.cities,
        route: app.map.settlements?.routes,
        river: app.map.rivers?.rivers,
        feature: app.map.pack?.features,
        "ocean-current": app.map.oceanCurrents?.currents
      }[kind];
      return JSON.stringify(clone(find(rows, id)));
    }
    function representativeReferences() {
      const states = active(app.map.pack?.states, true);
      const river = lakeBoundRiver() || active(app.map.rivers?.rivers)[0];
      const religion = active(app.map.society?.religions, true).find(item => {
        const center = Number(item.center);
        return Number.isInteger(center)
          && center >= 0
          && center < (app.map.pack?.cells?.i?.length || 0)
          && Number(app.map.pack.cells.h?.[center]) >= 20
          && Number(app.map.pack.cells.religion?.[center]) === Number(item.i ?? item.id);
      });
      const references = [
        ...refs("state", app.map.politics?.states, true),
        ...refs("province", app.map.politics?.provinces, true),
        ...refs("city", app.map.settlements?.cities),
        ...refs("route", app.map.settlements?.routes),
        ...(river ? [{kind: "river", id: river.id ?? river.i}] : []),
        ...refs("marker", app.map.markers?.markers),
        ...(religion ? [{kind: "religion", id: religion.id ?? religion.i}] : []),
        ...refs("culture", app.map.society?.cultures, true),
        ...refs("zone", app.map.zones?.zones),
        ...refs("feature", app.map.pack?.features),
        ...refs("ocean-current", app.map.oceanCurrents?.currents),
        ...refs("economy-market", app.map.pack?.markets, true),
        ...refs("trade-flow", app.map.pack?.deals)
      ];
      for (const state of states) {
        for (const regiment of state.military || []) {
          references.push({kind: "military", id: `${state.i}:${regiment.i}`});
        }
      }
      const diplomacyPair = reciprocalDiplomacyPair(states);
      if (diplomacyPair) references.push({kind: "diplomacy-relation", id: diplomacyPair});
      return [...new Set(references.map(reference => reference.kind))]
        .map(kind => references.find(reference => reference.kind === kind))
        .filter(Boolean);
    }
    function lakeBoundRiver() {
      const rivers = active(app.map.rivers?.rivers);
      for (const lake of (app.map.pack?.features || []).filter(feature => feature?.type === "lake")) {
        const lakeId = Number(lake.i ?? lake.id);
        for (const inletId of lake.inlets || []) {
          const river = rivers.find(item => Number(item.id ?? item.i) === Number(inletId));
          if (river?.outletKind === "lake" && Number(river.outletFeatureId) === lakeId) return river;
        }
      }
      return null;
    }
    function assertCompleteLakeInletBindings() {
      const rivers = active(app.map.rivers?.rivers);
      const byId = new Map(rivers.map(river => [Number(river.id ?? river.i), river]));
      const lakes = (app.map.pack?.features || []).filter(feature => feature?.type === "lake");
      let inlets = 0;
      for (const lake of lakes) {
        const lakeId = Number(lake.i ?? lake.id);
        for (const inletId of lake.inlets || []) {
          inlets++;
          const river = byId.get(Number(inletId));
          if (!river || river.outletKind !== "lake" || Number(river.outletFeatureId) !== lakeId) {
            throw new Error(`${target} cells 前置水文无效：湖泊 #${lakeId} 入流 #${inletId}`);
          }
        }
      }
      return {lakes: lakes.length, rivers: rivers.length, inlets};
    }
    function reciprocalDiplomacyPair(states) {
      const inverse = relation => ({Vassal: "Suzerain", Suzerain: "Vassal"})[relation] || relation;
      for (let left = 0; left < states.length; left++) {
        for (let right = left + 1; right < states.length; right++) {
          const leftState = states[left];
          const rightState = states[right];
          const leftRelation = leftState.diplomacy?.[rightState.i];
          const rightRelation = rightState.diplomacy?.[leftState.i];
          if (leftRelation && leftRelation !== "Enemy"
            && inverse(leftRelation) === rightRelation && inverse(rightRelation) === leftRelation) {
            return pairKey(leftState.i, rightState.i);
          }
        }
      }
      return null;
    }
    function refs(kind, rows, positive = false) {
      return active(rows, positive).map(object => ({kind, id: object.id ?? object.i}));
    }
    function active(rows, positive = false) {
      return (rows || []).filter(object =>
        object && !object.removed && (!positive || Number(object.i ?? object.id) > 0)
      );
    }
    function find(rows, id) {
      return (rows || []).find(object => String(object?.id ?? object?.i) === String(id));
    }
    function memberCells(values, id) {
      const cells = [];
      for (let cell = 0; cell < (values?.length || 0); cell++) {
        if (String(values[cell]) === String(id)) cells.push(cell);
      }
      return cells;
    }
    function pairKey(left, right) {
      return Number(left) < Number(right) ? `${left}:${right}` : `${right}:${left}`;
    }
    function clone(value) {
      return value === undefined ? null : structuredClone(value);
    }
    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
      return result.data;
    }
    function traceProperty(target, key, label, ids, trace) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      let current = target[key];
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: () => current,
        set: value => {
          trace.push({
            target: label,
            before: ids(current),
            after: ids(value),
            stack: String(new Error().stack || "").split("\n").slice(2, 6)
          });
          current = value;
        }
      });
      return () => {
        if (descriptor) Object.defineProperty(target, key, {...descriptor, value: current});
        else {
          delete target[key];
          target[key] = current;
        }
      };
    }
  }, cellsTarget);

  return {
    cellsTarget,
    selectedCount,
    domRows,
    spacerRows,
    shiftCount,
    listSelectionMs,
    mapSelectionMs,
    constraint
  };
}

async function openPanel(page, item) {
  const generationPanel = page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
  if (!await generationPanel.count()) {
    await page.locator("#open-generation-panel").click({force: true});
    await generationPanel.waitFor({state: "visible"});
  }
  const managementTab = generationPanel.getByRole("tab", {name: "管理", exact: true});
  await managementTab.click();
  await generationPanel.locator(`#${item.buttonId}`).click();
  const panelRoot = page.locator(`.floating-panel[data-panel-id="${item.panelId}"]:not(.hidden)`);
  await panelRoot.waitFor({state: "visible"});
  if (item.tab) {
    await panelRoot.getByRole("group", {name: "经济范围", exact: true})
      .locator(".ui-segmented-el")
      .getByText(item.tab, {exact: true})
      .click();
  }
  const lockToolbar = panelRoot.getByRole("toolbar", {name: "重生成锁定批量操作"});
  try {
    await lockToolbar.waitFor({state: "visible", timeout: 10000});
  } catch {
    throw new Error(`${item.panelId}/${item.kind} 未渲染锁定批量工具栏：${(await panelRoot.innerText()).slice(0, 500)}`);
  }
  return panelRoot;
}

async function closePanel(panelRoot) {
  const close = panelRoot.locator(".floating-panel-close");
  if (await close.count()) await close.click();
}

async function findCanvasPickPoint(page, kind) {
  return page.evaluate(kindValue => {
    const app = window.__webglGeneratorApp;
    const canvas = document.getElementById("map-canvas");
    const rect = canvas?.getBoundingClientRect();
    const context = app?.canvasToolModes?.getActive?.()?.context || {};
    if (!app?.renderer?.pickClientPoint || !rect) return null;
    const directKinds = pick => [
      pick?.object,
      pick?.cityObject,
      pick?.route,
      pick?.river,
      pick?.marker,
      pick?.military,
      pick?.tradeFlow,
      pick?.diplomacyRelation,
      pick?.politicalObject
    ].filter(Boolean).map(item => item.kind);
    const matches = pick => {
      if (!pick) return false;
      if (directKinds(pick).includes(kindValue)) return true;
      const cell = Number(pick.packCell);
      if (kindValue === "diplomacy-relation") {
        const stateId = Number(pick.politicalObject?.kind === "state"
          ? pick.politicalObject.id
          : app.map?.pack?.cells?.state?.[cell]);
        return stateId > 0 && stateId !== Number(context.subjectId);
      }
      if (Number.isInteger(cell) && cell >= 0) {
        const field = {
          state: "state",
          province: "province",
          culture: "culture",
          religion: "religion",
          feature: "f",
          "economy-market": "market"
        }[kindValue];
        if (field && Number(app.map?.pack?.cells?.[field]?.[cell]) > 0) return true;
        if (kindValue === "zone" && (app.map?.zones?.zones || []).some(zone => zone?.cells?.includes(cell))) return true;
      }
      return false;
    };
    const visibleCanvas = (x, y) => document.elementFromPoint(x, y) === canvas;
    const test = (x, y) => visibleCanvas(x, y) && matches(app.renderer.pickClientPoint(x, y))
      ? {x: Math.round(x), y: Math.round(y)}
      : null;
    if (kindValue === "ocean-current" && typeof app.renderer.worldToScreen === "function") {
      for (const current of app.map?.oceanCurrents?.currents || []) {
        for (const segment of current?.path?.segments || []) {
          for (const t of [0.2, 0.4, 0.5, 0.6, 0.8]) {
            const inverse = 1 - t;
            const x = inverse ** 3 * segment.start[0]
              + 3 * inverse ** 2 * t * segment.control1[0]
              + 3 * inverse * t ** 2 * segment.control2[0]
              + t ** 3 * segment.end[0];
            const y = inverse ** 3 * segment.start[1]
              + 3 * inverse ** 2 * t * segment.control1[1]
              + 3 * inverse * t ** 2 * segment.control2[1]
              + t ** 3 * segment.end[1];
            const screen = app.renderer.worldToScreen(x, y, rect);
            if (screen && visibleCanvas(screen.x, screen.y)) {
              return {x: Math.round(screen.x), y: Math.round(screen.y)};
            }
          }
        }
      }
    }
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    for (let radius = 0; radius <= 120; radius += 4) {
      for (let offset = -radius; offset <= radius; offset += 4) {
        const candidates = [
          [centerX + offset, centerY - radius],
          [centerX + offset, centerY + radius],
          [centerX - radius, centerY + offset],
          [centerX + radius, centerY + offset]
        ];
        for (const [x, y] of candidates) {
          const found = test(x, y);
          if (found) return found;
        }
      }
    }
    for (let y = rect.top + 6; y < rect.bottom - 6; y += 10) {
      for (let x = rect.left + 6; x < rect.right - 6; x += 10) {
        const found = test(x, y);
        if (found) return found;
      }
    }
    return null;
  }, kind);
}

async function generateMap(page, cellsTarget, seed) {
  await page.evaluate(async ({cellsTarget: target, seed: value}) => {
    const result = await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: value,
      cellsTarget: target,
      heightmapTemplate: "continents"
    });
    if (!result?.ok) throw new Error(`生成 ${target} cells 失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
    window.__webglGeneratorApp.editHistory.clear();
  }, {cellsTarget, seed});
}

function scaleSeed(cellsTarget) {
  return scaleSeeds.get(Number(cellsTarget)) || `regeneration-lock-stage-f-scale-valid-${cellsTarget}`;
}

function assertScaleRiverSeed(cellsTarget, seed) {
  const map = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  const rivers = (map.rivers?.rivers || []).filter(Boolean);
  let representative = null;
  for (const lake of (map.pack?.features || []).filter(feature => feature?.type === "lake")) {
    const lakeId = Number(lake.i ?? lake.id);
    for (const inletId of lake.inlets || []) {
      const river = rivers.find(item => Number(item.id ?? item.i) === Number(inletId));
      if (river?.outletKind === "lake" && Number(river.outletFeatureId) === lakeId) {
        representative = river;
        break;
      }
    }
    if (representative) break;
  }
  representative ||= rivers[0];
  assert(representative, `${cellsTarget} cells 固定 seed 缺少河流锁定样本`);
  const context = prepareRiverRegenerationLocks(map.pack, [structuredClone(representative)]);
  assertFrozenRiverState(map.pack, map.rivers.rivers, context);
  return {
    cellsTarget,
    seed,
    river: representative.id ?? representative.i,
    lakes: map.pack.features.filter(feature => feature?.type === "lake").length,
    rivers: rivers.length
  };
}

async function clearLocks(page, kind) {
  await page.evaluate(kindValue => {
    const result = window.webglGeneratorApi.regenerationLocks.clearKind(kindValue);
    if (!result?.ok) throw new Error(`清理 ${kindValue} 锁失败：${result?.error?.code || "unknown"}`);
    window.__webglGeneratorApp.editHistory.clear();
  }, kind);
}

async function expectLockCount(page, kind, expected) {
  await page.waitForFunction(({kind: kindValue, expected: count}) => {
    const result = window.webglGeneratorApi.regenerationLocks.list({kind: kindValue});
    return result?.ok && result.data.count === count;
  }, {kind, expected});
}

async function expectSelectionCount(toolbar, expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await readSelectionCount(toolbar) === expected) return;
    await toolbar.page().waitForTimeout(50);
  }
  assert.equal(await readSelectionCount(toolbar), expected, "重生成锁临时选择数量错误");
}

async function readSelectionCount(toolbar) {
  const text = await toolbar.locator(".regeneration-lock-selection-count").innerText();
  return Number(text.match(/\d+/)?.[0] || 0);
}

function panel(kind, panelId, buttonId, tab = null) {
  return {kind, panelId, buttonId, tab};
}

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function parseNumberList(value) {
  return String(value).split(",").map(Number).filter(Number.isFinite);
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"Content-Type": contentType(target), "Cache-Control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(pathname) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(pathname)] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
