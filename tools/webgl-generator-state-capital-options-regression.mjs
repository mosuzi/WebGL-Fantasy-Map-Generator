#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {buildStateCapitalOptions} from "../app/webgl-generator/src/ui/state-capital-options.js";

const map = {
  settlements: {
    cities: [
      {id: 7, burgId: 42, name: "青川", state: 3, capital: true, population: 20},
      {id: 8, burgId: 43, name: "", state: 3, capital: false, population: 15},
      {id: 9, burgId: 44, state: 3, capital: false, population: 10},
      {id: 10, burgId: 45, name: "别国城", state: 4, capital: true, population: 30}
    ]
  },
  pack: {
    burgs: []
  }
};
map.pack.burgs[43] = {i: 43, name: "临江"};
map.pack.burgs[44] = {i: 44, name: ""};

const options = buildStateCapitalOptions(map, 3);
assert.deepEqual(options, [
  {value: 42, label: "青川"},
  {value: 43, label: "临江"},
  {value: 44, label: "城市 #44"}
]);
assert.notEqual(options[0].value, map.settlements.cities[0].id, "首都候选不得把 city.id 当作命令值");
assert.equal(options.find(option => option.value === 42)?.label, "青川", "当前首都必须按 burgId 命中可读名称");
assert.equal(buildStateCapitalOptions(map, 4)[0]?.label, "别国城", "国家筛选不得遗漏其它合法国家的候选");

const panelSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/StatePanel.vue", import.meta.url), "utf8");
assert.match(panelSource, /const capitalOptions = computed\(\(\) => buildStateCapitalOptions\(props\.state\.map, selected\.value\?\.id\)\);/);
assert.match(panelSource, /capitalDraft\.value = Number\(next\) \|\| capitalOptions\.value\[0\]\?\.value \|\| 0;/);
assert.match(panelSource, /callbacks\.onCapitalChange\(selected\.id, capitalDraft\)/);
assert.match(panelSource, /const splitCapitalOptions = computed\(\(\) => stateCities/, "拆分国家首都候选不得改用 burgId 契约");

console.log(JSON.stringify({
  ok: true,
  candidates: options,
  commandValue: "burgId",
  fallbackOrder: ["city.name", "burg.name", "城市 #burgId"]
}, null, 2));
