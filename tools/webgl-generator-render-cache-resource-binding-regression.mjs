import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {parse} from "@babel/parser";

import {createRenderResourceBinding} from "../app/webgl-generator/src/renderer/render-resource-binding.js";
import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";

const fixtureOnly = process.argv.includes("--fixture-only");
const REFRESH_CELL_SURFACE_AST_DIGEST = "18e9a2e22eb98306224be692d92d2aea187cedfae5d254057f4e25a127cb06da";

const {
  RENDER_CACHE_RESOURCE_FAMILIES,
  adoptRenderCacheResourceBinding,
  assertRenderCacheResourceBindings,
  invalidateRenderCacheResourceBindings,
  renderCacheResourceBindingMismatch
} = await import("../app/webgl-generator/src/renderer/render-cache-resource-binding.js");

const families = ["line", "point", "route", "river", "tradeFlow", "selection"];
assert.deepEqual([...RENDER_CACHE_RESOURCE_FAMILIES], families, "正式绘制 cache family 不得缺项或静默扩张");
const familyReferenceFields = Object.freeze({
  line: Object.freeze(["lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "lineVertices", "shoreLineVertices", "oceanCurrentVertices"]),
  point: Object.freeze(["pointBuffer", "pointDrawRanges"]),
  route: Object.freeze(["routeBuffer", "routeDrawRanges", "routeBufferCamera"]),
  river: Object.freeze(["riverBuffer", "riverBufferCamera"]),
  tradeFlow: Object.freeze(["tradeFlowBuffer", "tradeFlowPickItems"]),
  selection: Object.freeze(["selectionBuffer", "selectionDrawRanges"])
});

const binding = createRenderResourceBinding(
  {mapIdentity: "render-cache-map", mapRevision: 4, topologyRevision: 2},
  {renderPreparationId: "render-cache:4", renderGeneration: 3}
);
const renderer = {
  surfaceResourceOwner: binding,
  renderCacheResourceOwners: Object.create(null),
  renderCacheResourceBindings: Object.create(null),
  lineBuffer: {id: "line"}, shoreLineBuffer: {id: "shore"}, oceanCurrentBuffer: {id: "ocean"},
  lineVertices: new Float32Array([1]), shoreLineVertices: new Float32Array([2]), oceanCurrentVertices: new Float32Array([3]),
  pointBuffer: {id: "point"}, pointDrawRanges: [{layer: "cities", first: 0, count: 1}],
  routeBuffer: {id: "route"}, routeDrawRanges: {roads: [{first: 0, count: 1}]}, routeBufferCamera: {scale: 1, offsetX: 0, offsetY: 0},
  riverBuffer: {id: "river"}, riverBufferCamera: {scale: 1, offsetX: 0, offsetY: 0},
  tradeFlowBuffer: {id: "trade"}, tradeFlowPickItems: [{dealId: 1}],
  selectionBuffer: {id: "selection"}, selectionDrawRanges: {primary: [{first: 0, count: 1}]}
};

for (const family of families) adoptRenderCacheResourceBinding(renderer, family, binding);
assert.equal(assertRenderCacheResourceBindings(renderer), true);
for (const family of families) {
  assert.deepEqual(renderer.renderCacheResourceOwners[family], binding, `${family} 必须保存完整 resource binding owner`);
  assert.equal(renderer.renderCacheResourceBindings[family].owner, renderer.renderCacheResourceOwners[family]);
  assert.deepEqual(
    Object.keys(renderer.renderCacheResourceBindings[family]).sort(),
    ["owner", ...familyReferenceFields[family]].sort(),
    `${family} wrapper 字段必须与冻结引用矩阵完全一致`
  );
  assert.equal(renderCacheResourceBindingMismatch(renderer, family), "");
}

renderer.surfaceResourceOwner = createRenderResourceBinding(
  {mapIdentity: "render-cache-map", mapRevision: 5, topologyRevision: 2},
  {renderPreparationId: "surface-only:5", renderGeneration: 3}
);
assert.equal(assertRenderCacheResourceBindings(renderer), true, "source revision 可与 surface 不同，但 owner 必须保留真实来源 revision");

renderer.surfaceResourceOwner = createRenderResourceBinding(
  {mapIdentity: "render-cache-map", mapRevision: 5, topologyRevision: 2},
  {renderPreparationId: "context-restored:5", renderGeneration: 4}
);
assert.equal(renderCacheResourceBindingMismatch(renderer, "route"), "owner-render-generation");
assert.throws(
  () => assertRenderCacheResourceBindings(renderer),
  error => error?.code === "render-cache-resource-owner-mismatch" && error?.mismatches?.includes("route:owner-render-generation")
);

renderer.surfaceResourceOwner = binding;

const historyBinding = createRenderResourceBinding(
  {mapIdentity: "render-cache-map", mapRevision: 5, topologyRevision: 3},
  {renderPreparationId: "history-surface:5", renderGeneration: 3}
);
const createHistoryRenderer = () => {
  const candidate = {
    ...renderer,
    surfaceResourceOwner: historyBinding,
    activeRenderResourceBinding: historyBinding,
    renderGeneration: historyBinding.renderGeneration,
    nextRenderGeneration: historyBinding.renderGeneration,
    objectPickingIndex: {id: "history-picking"},
    objectPickingResourceOwner: binding,
    objectPickingResourceBinding: null,
    labelItems: [],
    cityIconItems: [],
    cityIconItemsById: new Map(),
    markerIconItems: [],
    militaryIconItems: [],
    labelLayoutResourceOwner: binding,
    labelLayoutResourceBinding: null,
    overlayResourceOwner: binding,
    overlayResourceBinding: null,
    retainedResourcePublishSuspended: 1,
    retainedResourceState: "suspended",
    lastRetainedResourceOwnerError: null
  };
  candidate.renderCacheResourceOwners = Object.freeze({});
  candidate.renderCacheResourceBindings = Object.freeze({});
  for (const family of families) adoptRenderCacheResourceBinding(candidate, family, binding);
  return candidate;
};
const historyRenderer = createHistoryRenderer();
const historyReferences = Object.fromEntries(Object.values(familyReferenceFields).flat().map(field => [field, historyRenderer[field]]));
PlaceholderMapRenderer.prototype.rebindEditedRendererResources.call(historyRenderer, historyBinding, binding);
assert.equal(assertRenderCacheResourceBindings(historyRenderer), true, "full surface history refresh 必须同步换代六族 cache owner");
for (const family of families) assert.deepEqual(historyRenderer.renderCacheResourceOwners[family], historyBinding);
for (const [field, value] of Object.entries(historyReferences)) assert.equal(historyRenderer[field], value, `${field} 物理引用不得因 owner 换代而替换`);

if (!fixtureOnly) {
  const driftedRouteReferenceRenderer = createHistoryRenderer();
  driftedRouteReferenceRenderer.routeBufferCamera = {...driftedRouteReferenceRenderer.routeBufferCamera, scale: 2};
  assert.throws(
    () => PlaceholderMapRenderer.prototype.rebindEditedRendererResources.call(driftedRouteReferenceRenderer, historyBinding, binding),
    error => error?.code === "render-edited-resource-preflight-mismatch"
      && error?.mismatches?.includes("route:routeBufferCamera-reference"),
    "full surface history rebind 不得把已漂移的 route cache 引用洗白"
  );

  const otherMapOwner = createRenderResourceBinding(
    {mapIdentity: "other-render-cache-map", mapRevision: 4, topologyRevision: 2},
    {renderPreparationId: "other-map:4", renderGeneration: 3}
  );
  const otherMapTradeFlowRenderer = createHistoryRenderer();
  otherMapTradeFlowRenderer.renderCacheResourceOwners = Object.freeze({
    ...otherMapTradeFlowRenderer.renderCacheResourceOwners,
    tradeFlow: otherMapOwner
  });
  otherMapTradeFlowRenderer.renderCacheResourceBindings = Object.freeze({
    ...otherMapTradeFlowRenderer.renderCacheResourceBindings,
    tradeFlow: Object.freeze({...otherMapTradeFlowRenderer.renderCacheResourceBindings.tradeFlow, owner: otherMapOwner})
  });
  assert.throws(
    () => PlaceholderMapRenderer.prototype.rebindEditedRendererResources.call(otherMapTradeFlowRenderer, historyBinding, binding),
    error => error?.code === "render-edited-resource-preflight-mismatch"
      && error?.mismatches?.includes("tradeFlow:owner-map-identity"),
    "full surface history rebind 不得把跨 map cache owner 洗白"
  );

  const crossMapSurfaceRenderer = createHistoryRenderer();
  crossMapSurfaceRenderer.map = {metadata: {mapIdentity: "render-cache-map"}};
  crossMapSurfaceRenderer.surfaceVertices = new Float32Array([1, 2, 3]);
  crossMapSurfaceRenderer.cellVisualCorrectionGeometry = new Uint32Array([4]);
  crossMapSurfaceRenderer.surfaceCellRanges = new Map([[0, {start: 0, end: 3}]]);
  crossMapSurfaceRenderer.surfaceBaseBufferSet = {id: "surface-set"};
  crossMapSurfaceRenderer.cellVisualCorrectionBufferSet = {id: "correction-set"};
  crossMapSurfaceRenderer.surfaceResourceBinding = {id: "surface-wrapper"};
  crossMapSurfaceRenderer.beginPerformanceEvent = () => ({id: "surface-preflight"});
  crossMapSurfaceRenderer.failPerformanceEvent = () => {};
  let crossMapUploadCalls = 0;
  crossMapSurfaceRenderer.recordBufferUpload = () => { crossMapUploadCalls++; };
  const crossMapBefore = Object.freeze({
    surfaceVertices: crossMapSurfaceRenderer.surfaceVertices,
    correction: crossMapSurfaceRenderer.cellVisualCorrectionGeometry,
    ranges: crossMapSurfaceRenderer.surfaceCellRanges,
    surfaceSet: crossMapSurfaceRenderer.surfaceBaseBufferSet,
    correctionSet: crossMapSurfaceRenderer.cellVisualCorrectionBufferSet,
    surfaceOwner: crossMapSurfaceRenderer.surfaceResourceOwner,
    activeOwner: crossMapSurfaceRenderer.activeRenderResourceBinding,
    surfaceWrapper: crossMapSurfaceRenderer.surfaceResourceBinding,
    cacheOwners: crossMapSurfaceRenderer.renderCacheResourceOwners,
    cacheWrappers: crossMapSurfaceRenderer.renderCacheResourceBindings
  });
  assert.throws(
    () => PlaceholderMapRenderer.prototype.refreshCellSurface.call(crossMapSurfaceRenderer, {binding: otherMapOwner}),
    error => error?.code === "render-edited-resource-preflight-mismatch"
      && error?.mismatches?.includes("previous:owner-map-identity"),
    "跨 map surface refresh 必须在写入前被 strict preflight 拒绝"
  );
  assert.equal(crossMapUploadCalls, 0, "跨 map preflight 失败前不得上传 GPU buffer");
  assert.equal(crossMapSurfaceRenderer.surfaceVertices, crossMapBefore.surfaceVertices);
  assert.equal(crossMapSurfaceRenderer.cellVisualCorrectionGeometry, crossMapBefore.correction);
  assert.equal(crossMapSurfaceRenderer.surfaceCellRanges, crossMapBefore.ranges);
  assert.equal(crossMapSurfaceRenderer.surfaceBaseBufferSet, crossMapBefore.surfaceSet);
  assert.equal(crossMapSurfaceRenderer.cellVisualCorrectionBufferSet, crossMapBefore.correctionSet);
  assert.equal(crossMapSurfaceRenderer.surfaceResourceOwner, crossMapBefore.surfaceOwner);
  assert.equal(crossMapSurfaceRenderer.activeRenderResourceBinding, crossMapBefore.activeOwner);
  assert.equal(crossMapSurfaceRenderer.surfaceResourceBinding, crossMapBefore.surfaceWrapper);
  assert.equal(crossMapSurfaceRenderer.renderCacheResourceOwners, crossMapBefore.cacheOwners);
  assert.equal(crossMapSurfaceRenderer.renderCacheResourceBindings, crossMapBefore.cacheWrappers);
}

let referenceCases = 0;
for (const [family, fields] of Object.entries(familyReferenceFields)) {
  for (const field of fields) {
    const original = renderer[field];
    renderer[field] = {replacedReference: field};
    assert.equal(renderCacheResourceBindingMismatch(renderer, family), `${field}-reference`, `${family}.${field} 未被 owner wrapper 冻结`);
    renderer[field] = original;
    assert.equal(renderCacheResourceBindingMismatch(renderer, family), "", `${family}.${field} 恢复后仍不一致`);
    referenceCases++;
  }
}
assert.equal(referenceCases, 17, "正式绘制 cache 引用字段矩阵发生未登记漂移");

renderer.surfaceResourceOwner = {...binding, mapIdentity: "other-map"};
assert.equal(renderCacheResourceBindingMismatch(renderer, "line"), "owner-map-identity");
renderer.surfaceResourceOwner = {...binding, topologyRevision: 9};
assert.equal(renderCacheResourceBindingMismatch(renderer, "point"), "owner-topology-revision");
renderer.surfaceResourceOwner = binding;

invalidateRenderCacheResourceBindings(renderer);
assert.equal(renderCacheResourceBindingMismatch(renderer, "selection"), "owner-missing");
assert.throws(() => adoptRenderCacheResourceBinding(renderer, "route", {
  mapIdentity: "render-cache-map", mapRevision: 4, topologyRevision: 2
}), /renderPreparationId|renderGeneration/u, "incomplete binding 不得被补零接纳");

const rendererSource = readFileSync(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const installerSource = readFileSync(new URL("../app/webgl-generator/src/renderer/prepared-render-installer.js", import.meta.url), "utf8");
validateIntegrationSources(rendererSource, installerSource);

const drawTokenOnlySource = rendererSource.replace(
  "    assertRenderCacheResourceBindings(this);",
  '    void "assertRenderCacheResourceBindings(this)"; // assertRenderCacheResourceBindings(this);'
);
assert.notEqual(drawTokenOnlySource, rendererSource, "draw AST 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(drawTokenOnlySource, installerSource),
  /draw 必须在正式执行块直接检查 cache owner/u,
  "注释或字符串不得冒充 draw 的 executable owner 检查"
);

const unreachableDrawSource = rendererSource.replace(
  "    assertRenderCacheResourceBindings(this);",
  "    if (false) assertRenderCacheResourceBindings(this);"
);
assert.notEqual(unreachableDrawSource, rendererSource, "draw 不可达分支反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(unreachableDrawSource, installerSource),
  /draw 必须在正式执行块直接检查 cache owner/u,
  "不可达分支不得冒充 draw 的 owner 检查"
);

const asyncGateTokenOnlySource = rendererSource.replaceAll(
  "!isCurrentRendererRenderCacheBinding(this, resourceBinding)",
  "false /* isCurrentRendererRenderCacheBinding(this, resourceBinding) */"
);
assert.notEqual(asyncGateTokenOnlySource, rendererSource, "async current gate AST 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(asyncGateTokenOnlySource, installerSource),
  /必须以 current resource binding 失败条件拒绝发布/u,
  "注释不得冒充 route/river async executable current gate"
);

const inertAsyncGateSource = rendererSource.replaceAll(
  "!isCurrentRendererRenderCacheBinding(this, resourceBinding)",
  "(isCurrentRendererRenderCacheBinding(this, resourceBinding), false)"
);
assert.notEqual(inertAsyncGateSource, rendererSource, "async inert current gate 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(inertAsyncGateSource, installerSource),
  /必须以 current resource binding 失败条件拒绝发布/u,
  "调用结果未参与阻断时不得冒充 async current gate"
);

const nestedUploaderSource = rendererSource.replace(
  '      adoptRenderCacheResourceBinding(this, "selection", currentRendererRenderCacheBinding(this, binding));',
  '      () => adoptRenderCacheResourceBinding(this, "selection", currentRendererRenderCacheBinding(this, binding));'
);
assert.notEqual(nestedUploaderSource, rendererSource, "uploader 未调用箭头函数反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(nestedUploaderSource, installerSource),
  /updateSelectionBuffer 必须在正式执行块直接发布 selection owner/u,
  "未调用的嵌套函数不得冒充 uploader owner 发布"
);

const installerTokenOnlySource = installerSource.replaceAll(
  "createRenderCacheResourceBindingEntries(renderer, family, options.binding)",
  "[] /* createRenderCacheResourceBindingEntries(renderer, family, options.binding) */"
);
assert.notEqual(installerTokenOnlySource, installerSource, "prepared install AST 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(rendererSource, installerTokenOnlySource),
  /prepared commit 必须执行 cache owner 事务写入/u,
  "注释不得冒充 prepared commit 的 executable owner 写入"
);

const surfaceRebindStatementPattern = /      this\.rebindEditedRendererResources\(renderResourceBindingFromOwner\(surfaceOwner\), previousSurfaceBinding\);/u;
const surfacePreflightStatement = "      assertEditedRendererResourcePreflight(this, surfaceBinding, previousSurfaceBinding);";
const missingSurfacePreflightSource = rendererSource.replace(surfacePreflightStatement, "      void surfaceBinding;");
assert.notEqual(missingSurfacePreflightSource, rendererSource, "surface preflight 删除反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(missingSurfacePreflightSource, installerSource),
  /首次 surface 状态写入前执行 strict preflight/u,
  "删除 surface preflight 后契约仍通过"
);

const lateSurfacePreflightSource = rendererSource
  .replace(`${surfacePreflightStatement}\n`, "")
  .replace(
    "      this.surfaceVertices = vertices;",
    `      this.surfaceVertices = vertices;\n${surfacePreflightStatement}`
  );
assert.notEqual(lateSurfacePreflightSource, rendererSource, "surface preflight 后移反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(lateSurfacePreflightSource, installerSource),
  /首次 surface 状态写入前执行 strict preflight/u,
  "surface preflight 移到首次写入后仍被接受"
);

const surfaceRetainedOnlySource = rendererSource.replace(
  surfaceRebindStatementPattern,
  "      adoptRendererRetainedResourceBindings(this, renderResourceBindingFromOwner(surfaceOwner));"
);
assert.notEqual(surfaceRetainedOnlySource, rendererSource, "surface history rebind AST 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(surfaceRetainedOnlySource, installerSource),
  /refreshCellSurface 必须在首次 draw 前同步隐式\/显式 retained owner/u,
  "只重绑 picking/overlay 不得冒充 full surface cache 发布"
);

const unreachableSurfaceRebindSource = rendererSource.replace(
  surfaceRebindStatementPattern,
  "      if (false) this.rebindEditedRendererResources(renderResourceBindingFromOwner(surfaceOwner), previousSurfaceBinding);"
);
assert.notEqual(unreachableSurfaceRebindSource, rendererSource, "surface history rebind 不可达分支反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(unreachableSurfaceRebindSource, installerSource),
  /refreshCellSurface 必须在首次 draw 前同步隐式\/显式 retained owner/u,
  "不可达分支不得冒充 full surface cache 发布"
);

const nestedSurfaceRebindSource = rendererSource.replace(
  surfaceRebindStatementPattern,
  "      (() => this.rebindEditedRendererResources(renderResourceBindingFromOwner(surfaceOwner), previousSurfaceBinding));"
);
assert.notEqual(nestedSurfaceRebindSource, rendererSource, "surface history rebind 未调用闭包反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(nestedSurfaceRebindSource, installerSource),
  /refreshCellSurface 必须在首次 draw 前同步隐式\/显式 retained owner/u,
  "未调用闭包不得冒充 full surface cache 发布"
);

const earlyReturnSurfaceRebindSource = rendererSource.replace(
  surfaceRebindStatementPattern,
  match => `      return;\n${match}`
);
assert.notEqual(earlyReturnSurfaceRebindSource, rendererSource, "surface history rebind 提前 return 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(earlyReturnSurfaceRebindSource, installerSource),
  /refreshCellSurface 必须在首次 draw 前同步隐式\/显式 retained owner/u,
  "提前 return 后的调用不得冒充可达 full surface cache 发布"
);

const conditionalReturnSurfaceRebindSource = rendererSource.replace(
  surfaceRebindStatementPattern,
  match => `      if (true) return;\n${match}`
);
assert.notEqual(conditionalReturnSurfaceRebindSource, rendererSource, "surface history rebind 条件提前 return 反例没有改到正式调用");
assert.throws(
  () => validateIntegrationSources(conditionalReturnSurfaceRebindSource, installerSource),
  /refreshCellSurface 完整规范 AST 漂移/u,
  "条件提前 return 后的调用不得冒充可达 full surface cache 发布"
);

console.log(JSON.stringify({ok: true, families, referenceCases, negativeCases: referenceCases + 12, astMutationCases: 13, historySurfaceCacheRebind: true, historySurfacePreflight: true, browser: 0}));

function validateIntegrationSources(rendererText, installerText) {
  const rendererAst = parse(rendererText, {sourceType: "module"});
  const installerAst = parse(installerText, {sourceType: "module"});
  const rendererClass = findNode(rendererAst, node => node.type === "ClassDeclaration" && node.id?.name === "PlaceholderMapRenderer");
  invariant(rendererClass, "PlaceholderMapRenderer class 缺失");

  const drawMethod = classMethod(rendererClass, "draw");
  invariant(drawMethod, "draw method 缺失");
  const drawTryBlock = drawMethod.body.body
    .filter(node => node.type === "TryStatement")
    .map(node => node.block)
    .find(block => block.body.some(statement => isExactCallStatement(statement, "assertRenderCacheResourceBindings", ["this"])));
  invariant(drawTryBlock, "draw 必须在正式执行块直接检查 cache owner");

  const refreshCellSurface = classMethod(rendererClass, "refreshCellSurface");
  invariant(refreshCellSurface, "refreshCellSurface method 缺失");
  invariant(refreshCellSurface.body.body.some(isPreviousSurfaceBindingDeclaration),
    "refreshCellSurface 必须在 surface 重建前冻结 previous binding");
const surfaceTryBlock = refreshCellSurface.body.body.find(statement => statement.type === "TryStatement")?.block;
  invariant(surfaceTryBlock, "refreshCellSurface try block 缺失");
  const surfacePreflightIndex = surfaceTryBlock.body.findIndex(isSurfacePreflightStatement);
  const firstSurfaceWriteIndex = surfaceTryBlock.body.findIndex(isSurfaceStateWriteStatement);
  invariant(surfacePreflightIndex >= 0 && firstSurfaceWriteIndex > surfacePreflightIndex,
    "refreshCellSurface 必须在首次 surface 状态写入前执行 strict preflight");
  const surfaceRebindIndex = surfaceTryBlock.body.findIndex(isSurfaceOwnerRebindStatement);
  const surfaceDrawIndex = surfaceTryBlock.body.findIndex(statement => isExactGuardedCallStatement(statement, "draw", "this.draw", []));
  const surfaceRebindReachable = surfaceRebindIndex >= 0
    && !surfaceTryBlock.body.slice(0, surfaceRebindIndex).some(isDirectAbruptCompletion);
  invariant(surfaceRebindReachable && surfaceDrawIndex > surfaceRebindIndex,
    "refreshCellSurface 必须在首次 draw 前同步隐式/显式 retained owner");
  const refreshCellSurfaceDigest = astDigest(refreshCellSurface);
  invariant(refreshCellSurfaceDigest === REFRESH_CELL_SURFACE_AST_DIGEST,
    `refreshCellSurface 完整规范 AST 漂移：${refreshCellSurfaceDigest}`);

  for (const [methodName, family, containerKind, bindingName] of [
    ["refreshLineLayers", "line", "try", null],
    ["refreshPointLayers", "point", "try", null],
    ["updateRouteBuffer", "route", "try", null],
    ["updateRouteBufferAsync", "route", "try", "resourceBinding"],
    ["updateRiverBuffer", "river", "try", null],
    ["updateRiverBufferAsync", "river", "try", "resourceBinding"],
    ["updateTradeFlowBuffer", "tradeFlow", "body", null],
    ["updateSelectionBuffer", "selection", "try", null]
  ]) {
    const method = classMethod(rendererClass, methodName);
    invariant(method, `${methodName} method 缺失`);
    const container = containerKind === "try"
      ? method.body.body.find(node => node.type === "TryStatement")?.block
      : method.body;
    invariant(container, `${methodName} ${containerKind} block 缺失`);
    invariant(
      container.body.some(statement => isExactAdoptStatement(statement, family, bindingName)),
      `${methodName} 必须在正式执行块直接发布 ${family} owner`
    );
  }

  for (const [methodName, family] of [["updateRouteBufferAsync", "route"], ["updateRiverBufferAsync", "river"]]) {
    const method = classMethod(rendererClass, methodName);
    const tryBlock = method.body.body.find(node => node.type === "TryStatement")?.block;
    invariant(tryBlock, `${methodName} try block 缺失`);
    const rejectionIndex = tryBlock.body.findIndex(statement => isCurrentBindingRejection(statement));
    const publicationIndex = tryBlock.body.findIndex(statement => isExactAdoptStatement(statement, family, "resourceBinding"));
    invariant(rejectionIndex >= 0, `${methodName} 必须以 current resource binding 失败条件拒绝发布`);
    invariant(publicationIndex > rejectionIndex, `${methodName} 必须在 current resource binding 拒绝分支后发布 owner`);
  }

  const transactionFactory = findNode(installerAst, node => node.type === "FunctionDeclaration" && node.id?.name === "createPreparedInstallTransaction");
  invariant(transactionFactory, "createPreparedInstallTransaction function 缺失");
  const commit = findNode(transactionFactory.body, node => node.type === "FunctionDeclaration" && node.id?.name === "commit");
  invariant(commit, "prepared install commit function 缺失");
  invariant(exactCalls(commit, "createRenderCacheResourceBindingEntries", []).length > 0, "prepared commit 必须执行 cache owner 事务写入");
}

function classMethod(classNode, name) {
  return classNode.body.body.find(node => (node.type === "ClassMethod" || node.type === "ClassPrivateMethod") && node.key?.name === name);
}

function hasExactCall(root, calleeName, expectedArguments) {
  return exactCalls(root, calleeName, expectedArguments).length > 0;
}

function isExactCallStatement(statement, calleeName, expectedArguments) {
  return statement?.type === "ExpressionStatement" && callMatches(statement.expression, calleeName, expectedArguments);
}

function isExactGuardedCallStatement(statement, guardName, calleeName, expectedArguments) {
  if (statement?.type !== "IfStatement" || statement.test?.type !== "Identifier" || statement.test.name !== guardName || statement.alternate) return false;
  const consequent = statement.consequent?.type === "BlockStatement"
    ? statement.consequent.body
    : [statement.consequent];
  return consequent.length === 1 && isExactCallStatement(consequent[0], calleeName, expectedArguments);
}

function isPreviousSurfaceBindingDeclaration(statement) {
  if (statement?.type !== "VariableDeclaration" || statement.declarations?.length !== 1) return false;
  const declaration = statement.declarations[0];
  return declaration.id?.type === "Identifier"
    && declaration.id.name === "previousSurfaceBinding"
    && declaration.init?.type === "ConditionalExpression"
    && calleePath(declaration.init.test) === "this.surfaceResourceOwner"
    && callMatches(declaration.init.consequent, "renderResourceBindingFromOwner", ["this.surfaceResourceOwner"])
    && declaration.init.alternate?.type === "NullLiteral";
}

function isSurfaceOwnerRebindStatement(statement) {
  if (statement?.type !== "ExpressionStatement") return false;
  const call = statement.expression;
  if (call?.type !== "CallExpression" || calleePath(call.callee) !== "this.rebindEditedRendererResources") return false;
  return callMatches(call.arguments[0], "renderResourceBindingFromOwner", ["surfaceOwner"])
    && call.arguments[1]?.type === "Identifier"
    && call.arguments[1].name === "previousSurfaceBinding";
}

function isSurfacePreflightStatement(statement) {
  return isExactCallStatement(statement, "assertEditedRendererResourcePreflight", ["this", "surfaceBinding", "previousSurfaceBinding"]);
}

function isSurfaceStateWriteStatement(statement) {
  if (statement?.type !== "ExpressionStatement" || statement.expression?.type !== "AssignmentExpression") return false;
  const target = calleePath(statement.expression.left);
  return target === "this.surfaceVertices"
    || target === "this.cellVisualCorrectionGeometry"
    || target === "this.surfaceCellRanges"
    || target === "this.surfaceResourceOwner"
    || target === "this.activeRenderResourceBinding";
}

function isDirectAbruptCompletion(statement) {
  return statement?.type === "ReturnStatement" || statement?.type === "ThrowStatement";
}

function isExactAdoptStatement(statement, family, bindingName) {
  if (!isExactCallStatement(statement, "adoptRenderCacheResourceBinding", ["this", family])) return false;
  if (!bindingName) return true;
  const bindingArgument = statement.expression.arguments[2];
  return bindingArgument?.type === "Identifier" && bindingArgument.name === bindingName;
}

function isCurrentBindingRejection(statement) {
  if (statement?.type !== "IfStatement") return false;
  const rejectsCurrentMismatch = flattenLogicalOr(statement.test).some(term => (
    term?.type === "UnaryExpression"
      && term.operator === "!"
      && callMatches(term.argument, "isCurrentRendererRenderCacheBinding", ["this"])
      && term.argument.arguments[1]?.type === "Identifier"
      && term.argument.arguments[1].name === "resourceBinding"
  ));
  if (!rejectsCurrentMismatch) return false;
  const consequentStatements = statement.consequent?.type === "BlockStatement"
    ? statement.consequent.body
    : [statement.consequent];
  return consequentStatements.some(node => node?.type === "ReturnStatement" && node.argument?.type === "BooleanLiteral" && node.argument.value === false);
}

function flattenLogicalOr(expression) {
  if (expression?.type === "LogicalExpression" && expression.operator === "||") {
    return [...flattenLogicalOr(expression.left), ...flattenLogicalOr(expression.right)];
  }
  return [expression];
}

function callMatches(node, calleeName, expectedArguments) {
  if (node?.type !== "CallExpression" || calleePath(node.callee) !== calleeName) return false;
  return expectedArguments.every((expected, index) => argumentMatches(node.arguments[index], expected));
}

function calleePath(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && !node.computed) {
    const owner = calleePath(node.object);
    const property = node.property?.type === "Identifier" ? node.property.name : "";
    return owner && property ? `${owner}.${property}` : "";
  }
  if (node?.type === "ThisExpression") return "this";
  return "";
}

function exactCalls(root, calleeName, expectedArguments) {
  const calls = [];
  visit(root, node => {
    if (callMatches(node, calleeName, expectedArguments)) calls.push(node);
  });
  return calls;
}

function argumentMatches(argument, expected) {
  if (expected === "this") return argument?.type === "ThisExpression";
  if (expected.startsWith("this.")) return calleePath(argument) === expected;
  if (argument?.type === "Identifier") return argument.name === expected;
  return argument?.type === "StringLiteral" && argument.value === expected;
}

function findNode(root, predicate) {
  let found = null;
  visit(root, node => {
    if (!found && predicate(node)) found = node;
  });
  return found;
}

function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (typeof value.type === "string") callback(value);
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "leadingComments", "innerComments", "trailingComments", "comments", "tokens"].includes(key)) continue;
    if (child && typeof child === "object") visit(child, callback);
  }
}

function astDigest(node) {
  return createHash("sha256").update(JSON.stringify(stripAstMetadata(node))).digest("hex");
}

function stripAstMetadata(value) {
  if (Array.isArray(value)) return value.map(stripAstMetadata);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "extra", "comments", "tokens", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    result[key] = stripAstMetadata(child);
  }
  return result;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
