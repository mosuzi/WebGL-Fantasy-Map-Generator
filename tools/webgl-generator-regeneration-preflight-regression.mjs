import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
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

  const output = await runRegenerationWorkerTask({map, kind}, {checkpoint() {}, report() {}});
  assert.equal(output.result.executed, true, `${kind} 仍被可修复的旧省会状态拒绝`);
  assert.equal(output.result.rejection, undefined, `${kind} 仍返回 regeneration_preflight_rejected`);
  assertProvinceCapitalMirrors(map, kind);
  results.push({kind, provinces: activeProvinces(map).length, status: output.result.status});
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
