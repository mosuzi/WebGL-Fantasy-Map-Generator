import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {inspectProvincialCapitalReassessment} from "../app/webgl-generator/src/generator/provincial-capitals.js";
import {runRegenerationWorkerTask} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const results = [];
for (const kind of ["provinces", "cities"]) {
  const map = generatePlaceholderMap({
    seed: `regeneration-priority-${kind}`,
    cellsTarget: 3000,
    heightmapTemplate: "continents"
  });
  const active = activeProvinces(map);
  assert(active.length > 0, `${kind} 固定样本没有活动省份`);
  for (const province of active) {
    const invalidBurg = 1000000 + Number(province.i);
    province.burg = invalidBurg;
    map.pack.provinces[province.i].burg = invalidBurg;
  }
  map.pack.provinces[active[0].i].center = 1000000 + Number(active[0].i);
  const orphanProvinceId = kind === "cities" ? orphanProvince(map, active.at(-1)) : null;
  if (orphanProvinceId) {
    const strict = inspectProvincialCapitalReassessment(map, {provinceId: orphanProvinceId});
    assert.equal(strict.allowed, false, "手工省会重评不应静默接纳无候选省份");
    assert.ok(strict.rejected.length > 0, "手工省会重评没有报告无候选省份");
  }

  const output = await runRegenerationWorkerTask({map, kind}, {checkpoint() {}, report() {}});
  assert.equal(output.result.executed, true, `${kind} 仍被可修复的旧省会状态拒绝`);
  assert.equal(output.result.rejection, undefined, `${kind} 仍返回 regeneration_preflight_rejected`);
  assertProvinceCapitalMirrors(map, kind);
  if (orphanProvinceId) {
    assert.equal(map.politics.provinces[orphanProvinceId].burg, 0, "城镇重生成没有清空无候选省份的悬空省会");
    assert.equal(map.pack.provinces[orphanProvinceId].burg, 0, "城镇重生成没有同步 pack 省会清理");
  }
  results.push({kind, provinces: activeProvinces(map).length, orphanProvinceId, status: output.result.status});
}

console.log(JSON.stringify({ok: true, repaired: results}));

function activeProvinces(map) {
  return (map.politics?.provinces || []).filter(province => province?.i && !province.removed);
}

function assertProvinceCapitalMirrors(map, kind) {
  const failures = [];
  for (const province of activeProvinces(map)) {
    const packProvince = map.pack?.provinces?.[province.i];
    const capitals = (map.settlements?.cities || [])
      .filter(city => city && !city.removed && Number(city.province) === Number(province.i) && city.provincial);
    const capital = capitals[0];
    const burg = capital ? map.pack?.burgs?.[capital.burgId] : null;
    const hasTerritory = Array.from(map.pack?.cells?.province || []).some(id => Number(id) === Number(province.i));
    if (!hasTerritory) {
      if (!packProvince || capitals.length !== 0 || Number(province.burg || 0) !== 0 || Number(packProvince.burg || 0) !== 0) {
        failures.push({provinceId: province.i, capitals: capitals.length, hasTerritory});
      }
      continue;
    }
    if (!packProvince || capitals.length !== 1 || !capital || !burg
      || Number(province.burg) !== Number(capital.burgId)
      || Number(packProvince.burg) !== Number(capital.burgId)
      || Number(province.center) !== Number(capital.packCell)
      || Number(packProvince.center) !== Number(capital.packCell)
      || Number(province.gridCenter) !== Number(capital.cell)
      || Number(packProvince.gridCenter) !== Number(capital.cell)
      || burg.provincial !== true) {
      failures.push({provinceId: province.i, capitals: capitals.length});
    }
  }
  assert.deepEqual(failures, [], `${kind} 重生成后省会镜像仍不一致`);
}

function orphanProvince(map, province) {
  const provinceId = Number(province.i);
  for (const cell of map.pack.cells.i || []) {
    if (Number(map.pack.cells.province[cell]) === provinceId) map.pack.cells.province[cell] = 0;
  }
  for (const city of map.settlements.cities || []) {
    if (!city || city.removed || Number(city.province) !== provinceId) continue;
    city.province = 0;
    city.provincial = false;
    const burg = map.pack.burgs?.[city.burgId];
    if (burg) {
      burg.province = 0;
      burg.provincial = false;
    }
  }
  const invalidBurg = 2000000 + provinceId;
  province.burg = invalidBurg;
  map.pack.provinces[provinceId].burg = invalidBurg;
  return provinceId;
}
