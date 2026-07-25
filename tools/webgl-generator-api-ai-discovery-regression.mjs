#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "vite";

import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";

const rootDir = resolve(new URL("..", import.meta.url).pathname.slice(1));
const server = await createServer({
  configFile: resolve(rootDir, "vite.config.mjs"),
  server: {middlewareMode: true},
  ssr: {noExternal: ["element-plus", /@element-plus/]},
  appType: "custom",
  logLevel: "silent"
});

try {
  const [{createConsoleApi}, appSource, consoleSource] = await Promise.all([
    server.ssrLoadModule("/src/runtime/console-api.js"),
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
  ]);
  let oceanWorldCalls = 0;
  const actions = {
    oceanCurrents: {
      rebuildWorld: options => {
        oceanWorldCalls++;
        return options;
      }
    }
  };
  const state = {map: objectFixture()};
  const api = createConsoleApi({defaultView: {}}, state, actions);
  const capabilities = unwrap(api.info.capabilities());
  const declared = Object.entries(API_METHODS).flatMap(([namespace, methods]) => methods.map(method => `${namespace}.${method}`));

  assert.equal(capabilities.methodMetadataCoverage.complete, true, "声明、元数据与真实 API 三方覆盖不完整");
  assert.equal(capabilities.methodDescriptionCoverage.complete, true, "方法描述五方覆盖不完整");
  assert.deepEqual(capabilities.methodDescriptionCoverage.signatureMismatch, [], "方法 schema 参数顺序与真实绑定签名不一致");
  assert.equal(capabilities.methodDescriptionCoverage.described, declared.length, "方法描述数量与声明不一致");
  assert.deepEqual(capabilities.safety.confirmRequiredMethods, [...CONFIRM_REQUIRED_METHODS], "确认方法清单与契约不一致");

  for (const method of declared) {
    const description = unwrap(api.info.describe(method));
    assert.equal(description.method, method, `${method} 描述返回了错误方法`);
    assert.equal(description.schemaVersion, "1.0.0", `${method} schema 版本错误`);
    assert(description.inputSchema && description.resultSchema, `${method} 缺少输入或结果 schema`);
    assert(description.inputSchema.prefixItems.every(item => item.title && item.title !== "input"), `${method} 存在 generic input 参数`);
    assert(description.inputSchema.prefixItems.every(item => item.type || item.enum || item.const || item.anyOf || item.oneOf), `${method} 存在无界参数 schema`);
    assert(description.businessCodes.includes("ok"), `${method} 缺少稳定成功 code`);
    assert(Array.isArray(description.referenceSpaces), `${method} 缺少引用空间`);
    assert.equal(description.metadata.requiresConfirm, CONFIRM_REQUIRED_METHODS.includes(method), `${method} 确认元数据不一致`);
    assert.equal(typeof description.metadata.undoable, "boolean", `${method} 缺少 undoable`);
    assert.equal(typeof description.metadata.async, "boolean", `${method} 缺少 async`);
  }

  const heightApplyDescription = unwrap(api.info.describe("edit.height.applyGlobalTransform"));
  assert(heightApplyDescription.businessCodes.includes("inspection_required"), "高度应用描述缺少 inspection_required");
  assert(heightApplyDescription.businessCodes.includes("operation_invalid_input"), "方法描述缺少 operation_invalid_input");
  assert(heightApplyDescription.businessCodes.includes("operation_failed"), "方法描述缺少 operation_failed");
  const heightProgramDescription = unwrap(api.info.describe("edit.height.inspectTerrainProgram"));
  const heightProgramSchema = heightProgramDescription.inputSchema.prefixItems[0];
  assert(heightProgramSchema.required.includes("id"), "地形程序 schema 没有声明必需 id");
  assert.equal(heightProgramDescription.examples[0].arguments[0].id, "ai-rugged", "地形程序示例缺少合法 id");
  const labelLayoutDescription = unwrap(api.info.describe("edit.labels.setLayout"));
  const labelTargetSchema = labelLayoutDescription.inputSchema.prefixItems[0];
  assert(labelTargetSchema.anyOf.some(item => item.required?.includes("id")), "标签 schema 缺少 id 兼容引用");
  assert(labelTargetSchema.anyOf.some(item => item.required?.includes("targetKind") && item.required?.includes("targetId")), "标签 schema 缺少 targetKind + targetId 引用");
  assert.equal(labelLayoutDescription.examples[0].arguments[0].targetKind, "state", "标签示例没有使用运行时支持的 targetKind");
  assert.equal(labelLayoutDescription.examples[0].arguments[0].targetId, 1, "标签示例没有使用运行时支持的 targetId");

  const types = unwrap(api.objects.types());
  assert(types.some(item => item.type === "state" && item.fields.includes("emblem")), "国家对象类型缺少纹章摘要");
  assert(types.some(item => item.type === "city" && item.fields.includes("emblem")), "城市对象类型缺少纹章摘要");

  const firstPage = unwrap(api.objects.list("state", {limit: 1, fields: ["name", "emblem"]}));
  assert.equal(firstPage.items.length, 1, "对象分页首批数量错误");
  assert.equal(firstPage.page.hasMore, true, "对象分页没有稳定后续页");
  assert.deepEqual(firstPage.page.fields, ["emblem", "id", "kind", "name"], "对象分页没有回显字段投影");
  const secondPage = unwrap(api.objects.list("state", {limit: 1, fields: ["name", "emblem"], cursor: firstPage.page.nextCursor}));
  assert.notEqual(firstPage.items[0].id, secondPage.items[0].id, "稳定 cursor 重复返回首批对象");
  assert.equal(secondPage.items[0].emblem.available, true, "国家纹章摘要不可发现");

  const defaultRoutes = unwrap(api.objects.list("route", {limit: 10}));
  assert.equal(Object.hasOwn(defaultRoutes.items[0], "points"), false, "默认对象分页泄露路线重字段");
  const routeWithPoints = unwrap(api.objects.list("route", {limit: 10, fields: ["type", "points"]}));
  assert(Array.isArray(routeWithPoints.items[0].points), "显式白名单字段没有返回路线点列");
  assert.equal(JSON.parse(JSON.stringify(routeWithPoints)).items.length, 1, "对象结果不是 JSON 副本");

  const unknownField = api.objects.query({type: "state"}, {fields: ["__private"]});
  assert.equal(unknownField.ok, false, "未知对象字段没有被拒绝");
  assert.equal(unknownField.error.code, "invalid_argument", "未知对象字段业务 code 错误");

  const unsafeOcean = api.oceanCurrents.rebuildWorld({confirm: true, seafloorPlan: {private: true}});
  assert.equal(unsafeOcean.ok, false, "公开洋流重算接受了内部 seafloorPlan");
  assert.equal(unsafeOcean.error.code, "invalid_argument", "公开洋流内部字段拒绝 code 错误");
  assert.equal(oceanWorldCalls, 0, "内部字段拒绝后仍调用 runtime action");
  const safeOcean = api.oceanCurrents.rebuildWorld({confirm: true, seed: "safe"});
  assert.equal(safeOcean.ok, true, "公开洋流重算白名单参数失败");
  assert.equal(oceanWorldCalls, 1, "公开洋流重算没有进入 runtime action");

  for (const path of [
    "runtimeActions.oceanCurrents.rename",
    "runtimeActions.oceanCurrents.regenerate",
    "runtimeActions.oceanCurrents.cancelWorldRebuild",
    "runtimeActions.edit.labels.setLayout",
    "runtimeActions.edit.labels.setPositionLock",
    "runtimeActions.edit.height.inspectGlobalTransform",
    "runtimeActions.edit.height.applyTerrainTemplate",
    "runtimeActions.edit.height.applyTerrainProgram",
    "runtimeActions.edit.height.applyRangeTransform",
    "runtimeActions.edit.height.applySelectionSmoothing",
    "runtimeActions.edit.height.inspectSeafloorReset",
    "runtimeActions.edit.height.applySeafloorReset"
  ]) {
    assert(appSource.includes(path), `UI 没有与公共 API 共用 runtime action：${path}`);
  }
  assert.match(appSource, /const sample = changes\.slice\(0, 12\)/, "高度预检缺少固定轻量样本");
  assert.match(appSource, /normalizeHeightChangePageInteger\(options\.changeLimit, 100, 1, 200\)/, "高度变更明细缺少 200 条硬上限");
  assert.match(appSource, /const planOptions = \{\.\.\.options, _includeAllChanges: true\}/, "高度 apply 没有内部重算完整 plan");
  assert.match(consoleSource, /field\.startsWith\("_"\)/, "公开高度 API 没有拒绝内部字段");

  console.log(JSON.stringify({
    ok: true,
    namespaces: Object.keys(API_METHODS).length,
    methods: declared.length,
    described: capabilities.methodDescriptionCoverage.described,
    objects: {
      types: types.length,
      projectedFields: firstPage.page.fields,
      stableCursor: true,
      heavyFieldsDefaultExcluded: true
    },
    runtimeConvergence: true,
    heightInspect: {sample: 12, detailLimit: 200}
  }, null, 2));
} finally {
  await server.close();
}

function unwrap(result) {
  assert.equal(result?.ok, true, result?.error?.message || "API 调用失败");
  return result.data;
}

function objectFixture() {
  const emblem = {
    shield: "heater",
    tinctures: {field: "#223344", charge: "#eeeeee"},
    charges: [{charge: "lion", tincture: "#eeeeee"}],
    size: 1,
    x: 10,
    y: 20
  };
  return {
    metadata: {seed: "api-ai-discovery"},
    politics: {
      states: [
        {id: 0, i: 0, name: "中立"},
        {id: 1, i: 1, name: "甲", fullName: "甲国", capital: 1, culture: 0, religion: 0, center: 1, coa: emblem}
      ],
      provinces: [],
      regions: []
    },
    society: {cultures: [], religions: []},
    settlements: {
      cities: [null, {id: 1, name: "甲城", state: 1, province: 0, population: 10, coa: emblem}],
      routes: [{id: 1, type: "road", from: 1, to: 1, points: [[0, 0], [1, 1]], name: "甲路"}]
    },
    pack: {burgs: [null, {name: "甲城"}], features: [], deals: []},
    rivers: {rivers: []},
    markers: {markers: []},
    measurements: {items: []},
    zones: {zones: []},
    notes: {notes: []},
    labels: {custom: []}
  };
}
