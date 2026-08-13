import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {normalizeOptions} from "../app/webgl-generator/src/generator/options.js";
import {runGenerationWorkerTask} from "../app/webgl-generator/src/runtime/generation-worker-task.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  getPublicMapTemplate,
  listPublicMapTemplates,
  prepareMapTemplateGeneration
} from "../app/webgl-generator/src/runtime/map-template-runtime.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const resourceRoot = join(root, "app", "webgl-generator", "public", "assets", "map-templates");
const requests = [];
const fetchResource = async url => {
  const name = String(url).split("/").pop();
  requests.push(name);
  try {
    const data = await readFile(join(resourceRoot, name));
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(data.toString("utf8")),
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    };
  } catch {
    return {ok: false, status: 404};
  }
};

const catalog = listPublicMapTemplates();
assert.equal(catalog.length, 16);
assert.equal(requests.length, 0, "枚举模板不应加载二进制资源");
assert.deepEqual(catalog.map(item => item.order), Array.from({length: 16}, (_, index) => index));
for (const template of catalog) {
  assert.match(template.resourceChecksums.physical, /^[0-9a-f]{64}$/u);
  assert.ok(template.sources.every(source => source.url && source.license));
}
const publicChina = getPublicMapTemplate("china");
publicChina.bounds.west = 0;
assert.equal(getPublicMapTemplate("china").bounds.west, 72, "公开详情不得暴露目录可变引用");
assert.throws(() => getPublicMapTemplate("missing"), /未知地图模板/u);

const china = await prepareMapTemplateGeneration({templateId: "china", cellsTarget: 999, seed: "task324-runtime"}, {
  baseUrl: "/task324-runtime-assets",
  fetch: fetchResource
});
assert.equal(china.request.cellsTarget, 999);
assert.equal(china.workerPayload.manifest.id, "china");
assert.equal(china.workerPayload.resource.id, "world-physical-2026-v1");
assert.equal(china.workerPayload.historicalResource, null);
assert.deepEqual(requests, ["world-physical-2026-v1.json", "world-physical-2026-v1.bin"]);
await prepareMapTemplateGeneration({templateId: "world", cellsTarget: 1}, {
  baseUrl: "/task324-runtime-assets",
  fetch: fetchResource
});
assert.equal(requests.length, 2, "共享物理资源应复用已校验缓存");

const roman = await prepareMapTemplateGeneration({templateId: "roman-empire-117", cellsTarget: 1000}, {
  baseUrl: "/task324-runtime-assets",
  fetch: fetchResource
});
assert.equal(roman.workerPayload.historicalResource.id, "roman-empire-117-political-v1");
assert.equal(requests.length, 4, "历史模板只应额外加载自身政治资源");

const options = normalizeOptions({
  seed: china.request.seed,
  cellsTarget: china.request.cellsTarget,
  graphWidth: 640,
  graphHeight: 480,
  mapName: china.template.name
});
const generated = await runGenerationWorkerTask({options, mapTemplate: china.workerPayload});
assert.equal(generated.map.metadata.mapTemplate.id, "china");
assert.equal(generated.map.metadata.mapTemplate.requestedCells, 999);
assert.equal(generated.map.metadata.mapTemplate.actualCells, generated.map.grid.points.length);
assert.equal(generated.map.heightmap.source.kind, "map-template");
for (const field of ["templateHydrology", "templateRegion", "templatePolitical"]) {
  assert.equal(generated.map.grid.cells[field].length, generated.map.grid.points.length);
}

const restored = parseMapDocument(stringifyMapDocument(createMapDocument(generated.map, generated.map.options))).map;
assert.deepEqual(restored.metadata.mapTemplate, generated.map.metadata.mapTemplate);
for (const field of ["templateHydrology", "templateRegion", "templatePolitical"]) {
  assert.equal(restored.grid.cells[field].constructor, Uint8Array);
  assert.deepEqual(restored.grid.cells[field], generated.map.grid.cells[field]);
}

const ordinary = await runGenerationWorkerTask({options: normalizeOptions({...options, seed: "task324-ordinary"})});
assert.equal(ordinary.map.metadata.mapTemplate, null);
assert.notEqual(ordinary.map.heightmap.source?.kind, "map-template");

for (const method of ["listMapTemplates", "getMapTemplate", "createFromTemplate"]) {
  assert(API_METHODS.generate.includes(method), `公开 generate 目录缺少 ${method}`);
}
assert(CONFIRM_REQUIRED_METHODS.includes("generate.createFromTemplate"));
assert(!CONFIRM_REQUIRED_METHODS.includes("generate.listMapTemplates"));
assert(!CONFIRM_REQUIRED_METHODS.includes("generate.getMapTemplate"));

console.log(JSON.stringify({
  ok: true,
  templates: catalog.length,
  resourceRequests: requests,
  generatedCells: generated.map.grid.points.length,
  templateChecksum: generated.map.metadata.mapTemplate.sourceChecksum,
  ordinaryTemplate: ordinary.map.metadata.mapTemplate
}));
