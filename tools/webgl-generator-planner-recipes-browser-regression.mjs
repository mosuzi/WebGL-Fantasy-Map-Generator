#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5554;
const timeoutMs = 300000;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const summaries = unwrap(api.planner.listRecipes(), "planner.listRecipes");
    if (summaries.length !== 10) throw new Error(`配方数量不是 10：${summaries.length}`);
    const recipes = summaries.map(summary => unwrap(api.planner.getRecipe(summary.recipeId), `planner.getRecipe.${summary.recipeId}`));
    const steps = recipes.flatMap(recipe => recipe.steps);
    if (steps.length !== 43) throw new Error(`步骤数量不是 43：${steps.length}`);
    const methods = [...new Set(steps.flatMap(step => [
      ...(step.facts || []),
      ...(step.inspection?.methods || []),
      ...(step.executeMethods || []),
      ...(step.compensation?.method ? [step.compensation.method] : []),
      ...(step.compensation?.methods || [])
    ]))].sort();
    for (const method of methods) unwrap(api.info.describe(method), `info.describe.${method}`);
    const ledger = [];
    const colonization = await verifyColonization();
    const war = await verifyWar();
    const administration = await verifyAdministration();
    const publication = await verifyPublication();
    await nextTwoFrames();
    const health = unwrap(api.info.healthEvents({severity: "error", limit: 200}), "info.healthEvents");
    const renderer = app.renderer?.getStats?.() || {};
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      discovery: {recipes: recipes.length, steps: steps.length, methods: methods.length},
      chains: {colonization, war, administration, publication},
      ledger,
      health,
      healthErrors: health.total,
      glError: renderer.draw?.glError ?? gl?.getError?.() ?? 0
    };

    async function verifyColonization() {
      await generateFreshMap("planner-colonization-browser");
      const setup = findCedeSetup("ensure");
      const cede = await commitRule({
        recipe: "scenario.colonize-region",
        step: "transfer-territory",
        inspection: setup.inspection,
        execute: options => api.edit.states.transferTerritory(setup.inspection.normalizedInput, options),
        success: () => Number(app.map.grid.cells.state?.[setup.gridCell]) === setup.targetStateId
      });

      const ensureInspection = findEnsureAfterCede(setup);
      const ensure = await commitRule({
        recipe: "scenario.colonize-region",
        step: "ensure-province-assignment",
        inspection: ensureInspection,
        execute: options => api.edit.provinces.ensureAssignment(ensureInspection.normalizedInput, options),
        success: () => Number(app.map.grid.cells.province?.[setup.gridCell]) === Number(ensureInspection.normalizedInput.provinceId)
      });

      const cityInspection = unwrap(api.edit.cities.inspectCreateAtCell({
        cell: {space: "grid", id: setup.gridCell}
      }), "edit.cities.inspectCreateAtCell");
      assertInspection(cityInspection, "colonization.found-city", false);
      const city = await commitCellCreate({
        recipe: "scenario.colonize-region",
        step: "found-city",
        inspection: cityInspection,
        execute: request => api.edit.cities.createAtCell(request)
      });

      const routeEnd = findLandNeighbor(setup.packCell, setup.targetStateId);
      const spatial = unwrap(api.cells.inspectAction("routes.createPath", {
        path: [
          {space: "pack", id: setup.packCell},
          {space: "pack", id: routeEnd}
        ]
      }), "cells.inspectAction.routes.createPath");
      if (!spatial.allowed) throw new Error(`殖民路线空间预检失败：${spatial.code}`);
      const route = await commitPlainEdit({
        recipe: "scenario.colonize-region",
        step: "create-route",
        inspectionToken: spatial.inspectionToken,
        execute: () => api.edit.routes.create({
          startPackCell: setup.packCell,
          endPackCell: routeEnd,
          type: "road",
          label: "AI 配方殖民路线"
        }),
        success: result => Number.isInteger(result.result?.routeId)
      });

      const market = findMarketAssignment(setup.packCell);
      const marketResult = await commitPlainEdit({
        recipe: "scenario.colonize-region",
        step: "assign-market-region",
        inspectionToken: null,
        execute: () => api.edit.economy.assignCells(market.marketId, [setup.packCell], {confirm: true}),
        success: () => Number(app.map.pack.cells.market?.[setup.packCell]) === market.marketId
      });
      return {stateId: setup.targetStateId, gridCell: setup.gridCell, packCell: setup.packCell, cede, ensure, city, route, market: marketResult};
    }

    async function verifyWar() {
      await generateFreshMap("planner-war-browser");
      const setup = findBattleSetup();
      const declaration = await commitRule({
        recipe: "scenario.invasion-and-annexation",
        step: "declare-war",
        inspection: setup.declaration,
        execute: options => api.edit.diplomacy.declareWar(setup.declaration.normalizedInput, options),
        success: () => relation(setup.attacker.stateId, setup.defender.stateId) === "Enemy"
      });
      const attackerMove = await moveRegiment(setup.attacker, setup.attackerCell, "move-station-attacker");
      const defenderMove = await moveRegiment(setup.defender, setup.defenderCell, "move-station-defender");
      const territoryBeforeBattle = territoryDigest();
      const battleRequest = {
        attacker: setup.attacker,
        defender: setup.defender,
        outcome: "victory",
        type: "skirmish",
        description: "AI 配方系统 Chrome 战斗"
      };
      const battleInspection = unwrap(api.edit.military.inspectBattle(battleRequest), "edit.military.inspectBattle");
      const battle = await commitRule({
        recipe: "scenario.invasion-and-annexation",
        step: "resolve-battle",
        inspection: battleInspection,
        execute: options => api.edit.military.resolveBattle(battleInspection.normalizedInput, options),
        success: result => Boolean(result.result?.eventId) && territoryDigest() === territoryBeforeBattle
      });
      if (territoryDigest() !== territoryBeforeBattle) throw new Error("战斗结算意外改变领土");

      const conquest = findConquestInspection(setup.attacker.stateId, setup.defender.stateId);
      const transfer = await commitRule({
        recipe: "scenario.invasion-and-annexation",
        step: "transfer-territory",
        inspection: conquest.inspection,
        execute: options => api.edit.states.transferTerritory(conquest.inspection.normalizedInput, options),
        success: () => Number(app.map.grid.cells.state?.[conquest.gridCell]) === setup.attacker.stateId
      });
      if (territoryDigest() === territoryBeforeBattle) throw new Error("领土转移步骤没有改变领土");

      const peaceInspection = unwrap(api.edit.diplomacy.inspectPeace({
        leftStateId: setup.attacker.stateId,
        rightStateId: setup.defender.stateId,
        relation: "Neutral",
        terms: {
          note: "AI 配方系统 Chrome 议和",
          reparations: {
            fromStateId: setup.defender.stateId,
            toStateId: setup.attacker.stateId,
            amount: 1,
            unit: "金币",
            note: "验收仅记录"
          }
        }
      }), "edit.diplomacy.inspectPeace");
      const peace = await commitRule({
        recipe: "scenario.invasion-and-annexation",
        step: "make-peace",
        inspection: peaceInspection,
        execute: options => api.edit.diplomacy.makePeace(peaceInspection.normalizedInput, options),
        success: () => relation(setup.attacker.stateId, setup.defender.stateId) === "Neutral"
      });
      return {attacker: setup.attacker, defender: setup.defender, declaration, attackerMove, defenderMove, battle, transfer, peace};
    }

    async function verifyAdministration() {
      await generateFreshMap("planner-administration-browser");
      const transferInspection = findProvinceTransferInspection();
      const staleMerge = findMergeInspection();
      const beforeTransferMap = transactionSnapshot().map;
      const transfer = await commitRule({
        recipe: "scenario.administrative-reform",
        step: "transfer-province",
        inspection: transferInspection,
        execute: options => api.edit.provinces.transfer(transferInspection.normalizedInput, options),
        success: () => Number(activeProvince(transferInspection.normalizedInput.provinceId)?.state) === transferInspection.normalizedInput.targetStateId
      });
      const committedMap = transactionSnapshot().map;
      if (committedMap === beforeTransferMap) throw new Error("行政改革整省转移没有提交地图变化");
      const rejected = await api.edit.provinces.merge(staleMerge.normalizedInput, executionOptions(staleMerge, true));
      if (rejected?.ok !== false || rejected?.error?.code !== "inspection-stale") {
        throw new Error(`行政改革旧 token 未稳定拒绝：${JSON.stringify(rejected)}`);
      }
      if (transactionSnapshot().map !== committedMap) throw new Error("中途业务拒绝撤回了已提交的整省转移");
      ledger.push({
        recipe: "scenario.administrative-reform",
        step: "merge-provinces-stale-rejection",
        beforeRevision: app.mapRevision.getSnapshot(),
        afterRevision: app.mapRevision.getSnapshot(),
        inspectionToken: staleMerge.inspectionToken,
        authorized: true,
        result: "inspection-stale",
        historyDelta: 0,
        successFacts: ["前序 transfer-province 保留", "地图与历史未被拒绝调用改写"]
      });

      const mergeInspection = findMergeInspection();
      const merge = await commitRule({
        recipe: "scenario.administrative-reform",
        step: "merge-provinces",
        inspection: mergeInspection,
        execute: options => api.edit.provinces.merge(mergeInspection.normalizedInput, options),
        success: () => mergeInspection.normalizedInput.provinceIds
          .filter(id => id !== mergeInspection.normalizedInput.targetProvinceId)
          .every(id => !activeProvince(id))
      });
      return {transfer, staleRejection: rejected.error.code, priorCommitPreserved: true, merge};
    }

    async function verifyPublication() {
      await generateFreshMap("planner-publication-browser");
      const recipe = "scenario.publish-map";
      const before = transactionSnapshot();
      const summary = unwrap(api.info.mapSummary(), "info.mapSummary");
      const runtime = unwrap(api.info.runtimeStats(), "info.runtimeStats");
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 200}), "info.healthEvents");
      if (health.total !== 0) throw new Error(`发布前 health error：${JSON.stringify(health)}`);
      addFactLedger(recipe, "health-check", before.revision, "health=0；summary/runtime 可读");

      const originalLayers = unwrap(api.layers.get(), "layers.get");
      const themes = unwrap(api.layers.listThemes(), "layers.listThemes");
      const themeRows = Array.isArray(themes) ? themes : themes.themes || themes.items || [];
      const originalTheme = originalLayers.themeId || originalLayers.theme || originalLayers.visualTheme || themes.current;
      const selectedTheme = themeRows.find(theme => (theme.id || theme.value) !== originalTheme);
      const selectedThemeId = selectedTheme?.id || selectedTheme?.value || themeRows[0]?.id || themeRows[0]?.value;
      if (!selectedThemeId) throw new Error(`发布链没有可用主题：${JSON.stringify(themes)}`);
      unwrap(api.layers.setViewMode("states"), "layers.setViewMode");
      const visibilityEntry = Object.entries(originalLayers.visibility || originalLayers.visible || originalLayers.layers || {})
        .find(([, value]) => typeof value === "boolean");
      if (visibilityEntry) unwrap(api.layers.setVisible(visibilityEntry[0], !visibilityEntry[1]), "layers.setVisible");
      unwrap(api.layers.setTheme(selectedThemeId), "layers.setTheme");
      assertDisplayOnly(before, "发布显示设置");
      addFactLedger(recipe, "layers-and-themes", before.revision, `主题 ${selectedThemeId} 已应用`);

      const exportedMap = unwrap(api.data.exportMap({download: false, includeText: true}), "data.exportMap");
      const exportedPng = unwrap(await api.data.exportPNG({download: false, includeDataUrl: true}), "data.exportPNG");
      if (!exportedMap || !(exportedMap.text?.length || exportedMap.data?.length || JSON.stringify(exportedMap).length > 100)) {
        throw new Error("地图数据导出为空");
      }
      if (!(exportedPng.dataUrl?.length > 100) || !(exportedPng.width > 0) || !(exportedPng.height > 0)) {
        throw new Error(`PNG 导出为空：${JSON.stringify(exportedPng)}`);
      }
      assertDisplayOnly(before, "发布导出");
      addFactLedger(recipe, "data-export", before.revision, `map+PNG ${exportedPng.width}x${exportedPng.height}`);

      unwrap(api.info.capabilities(), "info.capabilities");
      const docs = unwrap(api.planner.listRecipes(), "planner.listRecipes.publish");
      for (const item of docs) unwrap(api.planner.getRecipe(item.recipeId), `planner.getRecipe.publish.${item.recipeId}`);
      for (const method of methods) unwrap(api.info.describe(method), `info.describe.publish.${method}`);
      addFactLedger(recipe, "gameplay-documentation", before.revision, "10 配方、43 步、全部方法说明可读");

      if (visibilityEntry) unwrap(api.layers.setVisible(visibilityEntry[0], visibilityEntry[1]), "layers.restoreVisible");
      if (originalLayers.viewMode || originalLayers.colorMode) {
        unwrap(api.layers.setViewMode(originalLayers.viewMode || originalLayers.colorMode), "layers.restoreViewMode");
      }
      if (originalTheme) unwrap(api.layers.setTheme(originalTheme), "layers.restoreTheme");
      assertDisplayOnly(before, "发布显示恢复");
      const restoredLayers = unwrap(api.layers.get(), "layers.get.restored");
      if (restoredLayers.colorMode !== originalLayers.colorMode
        || restoredLayers.visualTheme !== originalLayers.visualTheme
        || (visibilityEntry && restoredLayers.layers?.[visibilityEntry[0]] !== visibilityEntry[1])) {
        throw new Error(`发布显示偏好没有完整恢复：${JSON.stringify({originalLayers, restoredLayers, visibilityEntry})}`);
      }
      return {
        summary: Boolean(summary),
        runtime: Boolean(runtime),
        themes: themeRows.length,
        selectedTheme: selectedThemeId,
        mapExported: true,
        png: {width: exportedPng.width, height: exportedPng.height},
        displayRestored: true
      };
    }

    async function generateFreshMap(seed) {
      unwrap(await api.generate.newMap({
        confirm: true,
        seed,
        cellsTarget: 8000,
        heightmapTemplate: "continents"
      }), `generate.newMap.${seed}`);
      app.editHistory.clear();
      await nextTwoFrames();
      clearHealth();
    }

    async function commitRule({recipe, step, inspection, execute, success}) {
      assertInspection(inspection, `${recipe}.${step}`, true);
      const before = transactionSnapshot();
      const result = unwrap(await execute(executionOptions(inspection, true)), `${recipe}.${step}`);
      if (result.executed !== true) throw new Error(`${recipe}.${step} 没有执行`);
      const after = transactionSnapshot();
      assertSingleCommit(before, after, `${recipe}.${step}`);
      if (success && !success(result)) throw new Error(`${recipe}.${step} 成功事实不成立`);
      const item = {
        recipe,
        step,
        beforeRevision: before.revision,
        afterRevision: after.revision,
        inspectionToken: inspection.inspectionToken,
        authorized: inspection.requiresConfirm ? "confirm:true" : "public-policy",
        result: result.code || "executed",
        historyDelta: after.history.undo - before.history.undo,
        successFacts: [inspection.summary, "提交后 revision 与领域事实已重读"]
      };
      ledger.push(item);
      return item;
    }

    async function commitCellCreate({recipe, step, inspection, execute}) {
      const before = transactionSnapshot();
      const result = unwrap(await execute({
        cell: inspection.cell.ref,
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      }), `${recipe}.${step}`);
      if (result.executed !== true) throw new Error(`${recipe}.${step} 没有执行`);
      const after = transactionSnapshot();
      assertSingleCommit(before, after, `${recipe}.${step}`);
      const item = {
        recipe,
        step,
        beforeRevision: before.revision,
        afterRevision: after.revision,
        inspectionToken: inspection.inspectionToken,
        authorized: "public-policy",
        result: result.code,
        historyDelta: 1,
        successFacts: [`创建对象 ${JSON.stringify(result.created)}`]
      };
      ledger.push(item);
      return item;
    }

    async function commitPlainEdit({recipe, step, inspectionToken, execute, success}) {
      const before = transactionSnapshot();
      const result = unwrap(await execute(), `${recipe}.${step}`);
      if (result.executed !== true || (success && !success(result))) throw new Error(`${recipe}.${step} 没有形成预期结果`);
      const after = transactionSnapshot();
      assertSingleCommit(before, after, `${recipe}.${step}`);
      const item = {
        recipe,
        step,
        beforeRevision: before.revision,
        afterRevision: after.revision,
        inspectionToken,
        authorized: "public-policy",
        result: "executed",
        historyDelta: 1,
        successFacts: ["空间预检通过", "编辑结果与 revision 已重读"]
      };
      ledger.push(item);
      return item;
    }

    async function moveRegiment(target, cell, step) {
      const inspection = unwrap(api.edit.military.inspectMoveStation(target, {packCell: cell}), `inspect.${step}`);
      if (!inspection.allowed && inspection.code === "station-unchanged") {
        const item = {
          recipe: "scenario.invasion-and-annexation",
          step,
          beforeRevision: app.mapRevision.getSnapshot(),
          afterRevision: app.mapRevision.getSnapshot(),
          inspectionToken: inspection.inspectionToken,
          authorized: "public-policy",
          result: "station-unchanged",
          historyDelta: 0,
          successFacts: [`军团已位于 pack cell #${cell}`]
        };
        ledger.push(item);
        return item;
      }
      return commitRule({
        recipe: "scenario.invasion-and-annexation",
        step,
        inspection,
        execute: options => api.edit.military.moveStation(target, {packCell: cell}, options),
        success: () => Number(regimentFor(target)?.cell) === cell
      });
    }

    function findCedeSetup(provinceMode) {
      const cells = app.map.pack.cells;
      const cityCells = new Set((app.map.settlements?.cities || []).filter(Boolean).map(city => Number(city.packCell ?? city.cell)));
      const rejected = {};
      for (const packCell of cells.i || []) {
        if (Number(cells.h?.[packCell]) < 20 || cityCells.has(packCell)) continue;
        const sourceStateId = Number(cells.state?.[packCell]);
        const gridCell = Number(cells.g?.[packCell]);
        if (!(sourceStateId > 0) || !(gridCell >= 0) || ownedPackCells(sourceStateId) < 2) continue;
        for (const neighbor of cells.c?.[packCell] || []) {
          if (Number(cells.h?.[neighbor]) < 20) continue;
          const targetStateId = Number(cells.state?.[neighbor]);
          if (!(targetStateId > 0) || targetStateId === sourceStateId) continue;
          const request = {
            mode: "cede",
            sourceStateId,
            targetStateId,
            gridCellIds: [gridCell],
            province: {mode: provinceMode, anchorGridCell: gridCell}
          };
          const inspection = unwrap(api.edit.states.inspectTerritoryTransfer(request), "inspect cede candidate");
          if (inspection.allowed) return {inspection, packCell, gridCell, sourceStateId, targetStateId};
          rejected[inspection.code] = (rejected[inspection.code] || 0) + 1;
        }
      }
      throw new Error(`BLOCK：殖民链无法构造 cede 样本：${JSON.stringify(rejected)}`);
    }

    function findEnsureAfterCede(setup) {
      const currentProvinceId = Number(app.map.grid.cells.province?.[setup.gridCell]);
      for (const province of app.map.politics?.provinces || []) {
        const provinceId = Number(province?.i ?? province?.id);
        if (!province || province.removed || !(provinceId > 0) || provinceId === currentProvinceId || Number(province.state) !== setup.targetStateId) continue;
        const inspection = unwrap(api.edit.provinces.inspectEnsureAssignment({
          stateId: setup.targetStateId,
          gridCellIds: [setup.gridCell],
          mode: "existing",
          provinceId
        }), "inspect ensure after cede");
        if (inspection.allowed) return inspection;
      }
      throw new Error(`BLOCK：殖民链 cede 后找不到可执行的 ensureAssignment，state=${setup.targetStateId} currentProvince=${currentProvinceId}`);
    }

    function findLandNeighbor(packCell, stateId) {
      for (const neighbor of app.map.pack.cells.c?.[packCell] || []) {
        if (Number(app.map.pack.cells.h?.[neighbor]) >= 20 && Number(app.map.pack.cells.state?.[neighbor]) === stateId) return neighbor;
      }
      throw new Error(`BLOCK：殖民链 pack cell #${packCell} 没有目标国陆地邻接`);
    }

    function findMarketAssignment(packCell) {
      const current = Number(app.map.pack.cells.market?.[packCell]);
      const markets = app.map.economy?.markets || app.map.pack?.markets || [];
      const rejected = {};
      for (const market of markets) {
        const marketId = Number(market?.i ?? market?.id);
        if (!market || market.removed || !(marketId > 0) || marketId === current) continue;
        const inspection = unwrap(api.edit.economy.inspectAssignment(marketId, [packCell]), "inspect market candidate");
        if (inspection.valid) return {marketId, inspection};
        const code = inspection.waterCells ? "water" : inspection.invalidMarketCells ? "invalid-market" : "unchanged";
        rejected[code] = (rejected[code] || 0) + 1;
      }
      throw new Error(`BLOCK：殖民链找不到市场归属样本：${JSON.stringify({current, rejected})}`);
    }

    function findBattleSetup() {
      const cells = app.map.pack.cells;
      const rejected = {};
      for (const cell of cells.i || []) {
        if (Number(cells.h?.[cell]) < 20) continue;
        const attackerStateId = Number(cells.state?.[cell]);
        if (!(attackerStateId > 0)) continue;
        for (const neighbor of cells.c?.[cell] || []) {
          if (Number(cells.h?.[neighbor]) < 20) continue;
          const defenderStateId = Number(cells.state?.[neighbor]);
          if (!(defenderStateId > 0) || defenderStateId === attackerStateId) continue;
          const attacker = firstPositiveRegiment(attackerStateId);
          const defender = firstPositiveRegiment(defenderStateId);
          if (!attacker || !defender) continue;
          const declaration = unwrap(api.edit.diplomacy.inspectDeclareWar({
            attackerStateId,
            defenderStateId,
            reason: "AI 配方系统 Chrome 入侵"
          }), "inspect declare-war candidate");
          if (declaration.allowed) return {attacker, defender, attackerCell: cell, defenderCell: neighbor, declaration};
          rejected[declaration.code] = (rejected[declaration.code] || 0) + 1;
        }
      }
      throw new Error(`BLOCK：战争链找不到合法公开样本：${JSON.stringify(rejected)}`);
    }

    function findConquestInspection(attackerStateId, defenderStateId) {
      const rejected = {};
      for (const cell of app.map.pack.cells.i || []) {
        if (Number(app.map.pack.cells.h?.[cell]) < 20 || Number(app.map.pack.cells.state?.[cell]) !== defenderStateId) continue;
        if (!(app.map.pack.cells.c?.[cell] || []).some(neighbor => Number(app.map.pack.cells.state?.[neighbor]) === attackerStateId)) continue;
        const gridCell = Number(app.map.pack.cells.g?.[cell]);
        const inspection = unwrap(api.edit.states.inspectTerritoryTransfer({
          mode: "conquer",
          sourceStateId: defenderStateId,
          targetStateId: attackerStateId,
          gridCellIds: [gridCell],
          province: {mode: "auto"}
        }), "inspect conquest candidate");
        if (inspection.allowed) return {inspection, gridCell};
        rejected[inspection.code] = (rejected[inspection.code] || 0) + 1;
      }
      throw new Error(`BLOCK：战争链找不到征服领土样本：${JSON.stringify(rejected)}`);
    }

    function findProvinceTransferInspection() {
      const rejected = {};
      for (const province of app.map.politics?.provinces || []) {
        if (!province || province.removed) continue;
        const provinceId = Number(province.i ?? province.id);
        const sourceStateId = Number(province.state);
        const cells = (app.map.pack.cells.i || []).filter(cell => Number(app.map.pack.cells.province?.[cell]) === provinceId);
        for (const cell of cells) {
          for (const neighbor of app.map.pack.cells.c?.[cell] || []) {
            const targetStateId = Number(app.map.pack.cells.state?.[neighbor]);
            if (!(targetStateId > 0) || targetStateId === sourceStateId) continue;
            const inspection = unwrap(api.edit.provinces.inspectTransfer({provinceId, targetStateId}), "inspect province transfer candidate");
            if (inspection.allowed) return inspection;
            rejected[inspection.code] = (rejected[inspection.code] || 0) + 1;
          }
        }
      }
      throw new Error(`BLOCK：行政改革找不到整省转移样本：${JSON.stringify(rejected)}`);
    }

    function findMergeInspection() {
      const seen = new Set();
      const rejected = {};
      for (const cell of app.map.pack.cells.i || []) {
        if (Number(app.map.pack.cells.h?.[cell]) < 20) continue;
        const left = Number(app.map.pack.cells.province?.[cell]);
        const stateId = Number(app.map.pack.cells.state?.[cell]);
        if (!(left > 0) || !(stateId > 0)) continue;
        for (const neighbor of app.map.pack.cells.c?.[cell] || []) {
          if (Number(app.map.pack.cells.state?.[neighbor]) !== stateId) continue;
          const right = Number(app.map.pack.cells.province?.[neighbor]);
          if (!(right > 0) || right === left) continue;
          const provinceIds = [left, right].sort((a, b) => a - b);
          const key = provinceIds.join(":");
          if (seen.has(key)) continue;
          seen.add(key);
          for (const targetProvinceId of provinceIds) {
            const inspection = unwrap(api.edit.provinces.inspectMerge({provinceIds, targetProvinceId}), "inspect merge candidate");
            if (inspection.allowed) return inspection;
            rejected[inspection.code] = (rejected[inspection.code] || 0) + 1;
          }
        }
      }
      throw new Error(`BLOCK：行政改革找不到省份合并样本：${JSON.stringify(rejected)}`);
    }

    function firstPositiveRegiment(stateId) {
      const regiment = (app.map.pack?.states?.[stateId]?.military || []).find(item =>
        item && !Boolean(item.n || item.type === "fleet")
        && Number(item.a || Object.values(item.u || {}).reduce((sum, value) => sum + Number(value || 0), 0)) > 0
      );
      if (!regiment) return null;
      const regimentId = Number(regiment.i);
      return {id: regiment.id || `${stateId}:${regimentId}`, stateId, regimentId};
    }

    function regimentFor(target) {
      return (app.map.pack?.states?.[target.stateId]?.military || []).find(item =>
        Number(item?.i) === target.regimentId || String(item?.id || "") === target.id
      );
    }

    function relation(left, right) {
      return String(app.map.pack?.states?.[left]?.diplomacy?.[right] || "");
    }

    function activeProvince(id) {
      const province = app.map.politics?.provinces?.find(item => Number(item?.i ?? item?.id) === Number(id));
      return province && !province.removed ? province : null;
    }

    function ownedPackCells(stateId) {
      return (app.map.pack.cells.i || []).filter(cell =>
        Number(app.map.pack.cells.h?.[cell]) >= 20 && Number(app.map.pack.cells.state?.[cell]) === stateId
      ).length;
    }

    function territoryDigest() {
      return JSON.stringify({
        grid: Array.from(app.map.grid.cells.state || []),
        pack: Array.from(app.map.pack.cells.state || [])
      });
    }

    function transactionSnapshot() {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        revision: app.mapRevision.getSnapshot()
      };
    }

    function assertSingleCommit(before, after, label) {
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0) {
        throw new Error(`${label} 未形成单条历史：${JSON.stringify({before: before.history, after: after.history})}`);
      }
      if (after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} revision 未单步递增`);
      }
      if (after.map === before.map) throw new Error(`${label} 没有形成地图变化`);
    }

    function assertInspection(inspection, label, expectRuleToken) {
      if (!inspection?.allowed || inspection.code !== "ok") {
        throw new Error(`${label} 预检未通过：${JSON.stringify(inspection)}`);
      }
      const token = String(inspection.inspectionToken || "");
      if (!token || (expectRuleToken && !token.startsWith("rulei1."))) {
        throw new Error(`${label} inspection token 不符合契约：${token}`);
      }
      if (!inspection.expectedRevision
        || inspection.expectedRevision.mapRevision !== app.mapRevision.getSnapshot().mapRevision) {
        throw new Error(`${label} expectedRevision 与当前地图不一致`);
      }
    }

    function executionOptions(inspection, confirm) {
      return {
        ...(confirm ? {confirm: true} : {}),
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      };
    }

    function addFactLedger(recipe, step, revision, fact) {
      ledger.push({
        recipe,
        step,
        beforeRevision: revision,
        afterRevision: app.mapRevision.getSnapshot(),
        inspectionToken: null,
        authorized: "read-or-display-policy",
        result: "ok",
        historyDelta: 0,
        successFacts: [fact]
      });
    }

    function assertDisplayOnly(before, label) {
      const after = transactionSnapshot();
      if (after.revision.mapIdentity !== before.revision.mapIdentity
        || after.revision.mapRevision !== before.revision.mapRevision
        || JSON.stringify(after.history) !== JSON.stringify(before.history)) {
        throw new Error(`${label} 意外改变地图 identity、历史或 revision`);
      }
    }

    function nextTwoFrames() {
      return new Promise(resolveFrames => requestAnimationFrame(() => requestAnimationFrame(resolveFrames)));
    }

    function clearHealth() {
      app.healthMonitor?.clear?.();
      app.panels?.development?.clearHealthEvents?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) {
        throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""}`);
      }
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message =>
    /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message)
  );
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.equal(report.healthErrors, 0, `配方验收出现 health error：${JSON.stringify(report.health)}`);
  assert.equal(report.glError, 0, "配方验收出现 WebGL error");
  assert.deepEqual(applicationConsoleErrors, [], `配方验收出现应用 console error：${applicationConsoleErrors.join("；")}`);
  assert.deepEqual(pageErrors, [], `配方验收出现 page error：${pageErrors.join("；")}`);
  console.log(JSON.stringify({ok: true, ...report, healthPerformanceSignals, applicationConsoleErrors, pageErrors}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
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
