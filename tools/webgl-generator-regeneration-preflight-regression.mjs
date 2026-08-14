import assert from "node:assert/strict";
import {inspectRegenerationWorkerPreflight} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const province = {i: 1, state: 1, burg: 9, center: 0, gridCenter: 0};
const map = {
  politics: {states: [null, {i: 1, capital: 0}], provinces: [null, {...province}]},
  pack: {
    states: [null, {i: 1, capital: 0}],
    provinces: [null, {...province}],
    burgs: [],
    cells: {g: new Uint32Array([0]), state: new Uint16Array([1]), province: new Uint16Array([1]), h: new Uint8Array([50]), s: new Float32Array([1]), pop: new Float32Array([1])}
  },
  settlements: {cities: []},
  regenerationLocks: {version: 1, entries: []}
};

for (const [kind, scope] of [["provinces", {kind: "all"}], ["cities", {kind: "province", id: 1}]]) {
  const result = inspectRegenerationWorkerPreflight(map, kind, scope);
  assert.equal(result.executed, false, `${kind} 预检拒绝必须是未执行`);
  assert.equal(result.rejection.code, "regeneration_preflight_rejected", `${kind} 预检稳定码错误`);
  assert.equal(result.rejection.stage, "preflight", `${kind} 预检阶段错误`);
  assert.deepEqual(result.rejection.details.rejected, [{provinceId: 1, code: "current-capital-inconsistent", summary: "省份 #1 的 province.burg 找不到对应城市，拒绝静默覆盖。"}]);
}

assert.equal(inspectRegenerationWorkerPreflight(map, "routes", {kind: "all"}), null, "非省份/城镇不得进入省会预检");
console.log(JSON.stringify({ok: true, code: "current-capital-inconsistent", kinds: ["provinces", "cities"]}));
