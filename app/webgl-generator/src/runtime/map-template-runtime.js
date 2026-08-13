import {
  MAP_TEMPLATE_SOURCES,
  getMapTemplateManifest,
  listMapTemplateManifests,
  normalizeMapTemplateRequest
} from "../generator/map-template-catalog.js";
import {loadMapTemplateHistoricalResource} from "../generator/map-template-historical-resource.js";
import {loadMapTemplatePhysicalResource} from "../generator/map-template-physical-resource.js";

export function listPublicMapTemplates() {
  return listMapTemplateManifests().map(buildPublicMapTemplate);
}

export function getPublicMapTemplate(templateId) {
  const manifest = getMapTemplateManifest(templateId);
  if (!manifest) throw new Error(`未知地图模板：${String(templateId || "").trim() || "（空）"}`);
  return buildPublicMapTemplate(manifest);
}

export async function prepareMapTemplateGeneration(input = {}, options = {}) {
  const request = normalizeMapTemplateRequest(input, options.fallbackCells);
  const manifest = getMapTemplateManifest(request.templateId);
  const loadOptions = {
    ...(options.baseUrl ? {baseUrl: options.baseUrl} : {}),
    ...(options.fetch ? {fetch: options.fetch} : {})
  };
  const resource = await loadMapTemplatePhysicalResource(manifest.resourceKeys.physical, loadOptions);
  const historicalResource = manifest.resourceKeys.political
    ? await loadMapTemplateHistoricalResource(manifest.resourceKeys.political, loadOptions)
    : null;
  verifyResourceIdentity(manifest, resource, historicalResource);
  return {
    request,
    template: buildPublicMapTemplate(manifest),
    workerPayload: {manifest, resource, historicalResource}
  };
}

function buildPublicMapTemplate(manifest) {
  return cloneJson({
    ...manifest,
    sources: manifest.sourceIds.map(sourceId => ({id: sourceId, ...MAP_TEMPLATE_SOURCES[sourceId]}))
  });
}

function verifyResourceIdentity(manifest, resource, historicalResource) {
  if (resource?.id !== manifest.resourceKeys.physical || resource?.metadata?.sha256 !== manifest.resourceChecksums.physical) {
    throw new Error(`${manifest.name}的物理资源与目录不一致`);
  }
  if (!manifest.resourceKeys.political) {
    if (historicalResource) throw new Error(`${manifest.name}不应加载历史政治资源`);
    return;
  }
  if (historicalResource?.id !== manifest.resourceKeys.political
    || historicalResource?.metadata?.sha256 !== manifest.resourceChecksums.political) {
    throw new Error(`${manifest.name}的历史政治资源与目录不一致`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
