#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";

import {readPanelListPreferences, updatePanelListPreferences} from "../app/webgl-generator/src/ui/panel-list-preferences.js";

const [statePanelSource, governmentPanelSource, auditSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/panels/state-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/government-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/task-notes/object-table-column-width-audit-2026-07-24.md", import.meta.url), "utf8")
]);

assert.match(statePanelSource, /capitalName:\s*80,/, "国家编辑列表首都列默认宽度不是 80px");
assert.match(governmentPanelSource, /"states\.capitalName":\s*80/, "政体管理国家列表首都列默认宽度不是 80px");
const componentDirectory = new URL("../app/webgl-generator/src/ui/vue/components/", import.meta.url);
const componentFiles = (await readdir(componentDirectory)).filter(file => file.endsWith(".vue"));
let tableHosts = 0;
let tableInstances = 0;
for (const file of componentFiles) {
  const source = await readFile(new URL(file, componentDirectory), "utf8");
  const count = (source.match(/<UiObjectTable\b/g) || []).length;
  if (!count) continue;
  tableHosts++;
  tableInstances += count;
}
assert.equal(tableHosts, 24, "UiObjectTable 宿主分母发生变化，需要重新审计");
assert.equal(tableInstances, 27, "UiObjectTable 实例分母发生变化，需要重新审计");
assert.match(auditSource, /24 个 Vue 宿主中的 27 张 `UiObjectTable` 实例/, "列宽审计没有冻结全部表格分母");

const stateDefaults = {
  filter: "",
  columnWidths: {id: 56, name: 120, capitalName: 80},
  columnWidthVersion: 2,
  columnWidthMigrations: {
    capitalName: {from: 112, to: 80}
  },
  sortKey: "id",
  sortDir: "asc"
};
const documentRef = createDocumentRef();
documentRef.defaultView.localStorage.setItem(
  "webgl-generator-panel-list:state-panel",
  JSON.stringify({
    filter: "旧图",
    columnWidths: {id: 56, name: 177, capitalName: 112},
    sortKey: "name",
    sortDir: "desc"
  })
);

const migrated = readPanelListPreferences(documentRef, "state-panel", stateDefaults);
assert.equal(migrated.columnWidths.capitalName, 80, "旧默认首都列没有迁移到 80px");
assert.equal(migrated.columnWidths.name, 177, "迁移错误覆盖了用户自定义名称列");
assert.equal(migrated.columnWidthVersion, 2, "迁移结果没有升级列宽版本");
assert.equal(migrated.filter, "旧图", "迁移错误覆盖了其它列表偏好");

const customized = updatePanelListPreferences(documentRef, "state-panel", {
  columnWidths: {...migrated.columnWidths, capitalName: 112}
}, stateDefaults);
assert.equal(customized.columnWidths.capitalName, 112, "迁移后用户不能主动把首都列调回 112px");
assert.equal(customized.columnWidthVersion, 2, "用户调整后没有持久化当前列宽版本");

const reread = readPanelListPreferences(documentRef, "state-panel", stateDefaults);
assert.equal(reread.columnWidths.capitalName, 112, "已完成迁移的用户宽度被重复覆盖");

const customLegacyDocument = createDocumentRef();
customLegacyDocument.defaultView.localStorage.setItem(
  "webgl-generator-panel-list:state-panel",
  JSON.stringify({
    columnWidths: {id: 56, name: 120, capitalName: 148},
    sortKey: "id",
    sortDir: "asc"
  })
);
const preserved = readPanelListPreferences(customLegacyDocument, "state-panel", stateDefaults);
assert.equal(preserved.columnWidths.capitalName, 148, "旧版本中的非默认自定义首都列宽没有保留");

const governmentDefaults = {
  filter: "",
  familyFilter: "all",
  columnWidths: {"states.name": 132, "states.capitalName": 80},
  columnWidthVersion: 2,
  columnWidthMigrations: {
    "states.capitalName": {from: 112, to: 80}
  },
  sortKey: "count",
  sortDir: "desc"
};
const governmentDocument = createDocumentRef();
governmentDocument.defaultView.localStorage.setItem(
  "webgl-generator-panel-list:government-panel",
  JSON.stringify({
    familyFilter: "autocracy",
    columnWidths: {"states.name": 164, "states.capitalName": 112},
    sortKey: "count",
    sortDir: "desc"
  })
);
const migratedGovernment = readPanelListPreferences(governmentDocument, "government-panel", governmentDefaults);
assert.equal(migratedGovernment.columnWidths["states.capitalName"], 80, "政体管理旧默认首都列没有迁移");
assert.equal(migratedGovernment.columnWidths["states.name"], 164, "政体管理迁移覆盖了用户自定义国家列");
assert.equal(migratedGovernment.familyFilter, "autocracy", "政体管理迁移覆盖了家族筛选");

console.log(JSON.stringify({
  ok: true,
  tableHosts,
  auditedTables: tableInstances,
  oldCapitalWidth: 112,
  newCapitalWidth: 80,
  migratedCapitalWidth: migrated.columnWidths.capitalName,
  preservedCustomWidth: preserved.columnWidths.capitalName,
  postMigrationCustomWidth: reread.columnWidths.capitalName
}, null, 2));

function createDocumentRef() {
  const values = new Map();
  return {
    defaultView: {
      localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
      }
    }
  };
}
