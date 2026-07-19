const BIOME_ROWS = [
  {id: 0, name: "Marine", displayName: "海洋", description: "以盐水水体为主的水生生态系统，不计陆地适居度。", color: [0.27, 0.43, 0.67, 1], habitability: 0},
  {id: 1, name: "Hot desert", displayName: "热带荒漠", description: "高温少雨、蒸发强烈，植被稀疏且以耐旱物种为主。", color: [0.98, 0.91, 0.62, 1], habitability: 4},
  {id: 2, name: "Cold desert", displayName: "寒冷荒漠", description: "低温干旱、降水稀少，地表常见裸岩、砾漠或稀疏灌丛。", color: [0.71, 0.72, 0.53, 1], habitability: 10},
  {id: 3, name: "Savanna", displayName: "稀树草原", description: "热带干湿季分明，以草本植被为主并散生耐旱乔木。", color: [0.82, 0.82, 0.51, 1], habitability: 22},
  {id: 4, name: "Grassland", displayName: "草原", description: "降水不足以形成连续森林，以禾草和草本群落占优势。", color: [0.78, 0.84, 0.56, 1], habitability: 30},
  {id: 5, name: "Tropical seasonal forest", displayName: "热带季雨林", description: "终年温暖但干湿季显著，乔木会随旱季出现季节性落叶。", color: [0.71, 0.85, 0.36, 1], habitability: 50},
  {id: 6, name: "Temperate deciduous forest", displayName: "温带落叶阔叶林", description: "温带湿润地区的落叶阔叶森林，四季变化明显且土壤较肥沃。", color: [0.16, 0.74, 0.34, 1], habitability: 100},
  {id: 7, name: "Tropical rainforest", displayName: "热带雨林", description: "全年高温多雨、林冠多层，生物多样性和生产力都很高。", color: [0.49, 0.8, 0.21, 1], habitability: 80},
  {id: 8, name: "Temperate rainforest", displayName: "温带雨林", description: "温和湿润且降水丰沛，形成高大、浓密并富含苔藓的森林。", color: [0.25, 0.61, 0.26, 1], habitability: 90},
  {id: 9, name: "Taiga", displayName: "北方针叶林", description: "亚寒带漫长寒冬地区的针叶林，树种较单一且生长季短。", color: [0.29, 0.42, 0.2, 1], habitability: 12},
  {id: 10, name: "Tundra", displayName: "苔原", description: "高纬或高海拔的无林寒冷地带，以苔藓、地衣和低矮灌丛为主。", color: [0.59, 0.47, 0.29, 1], habitability: 4},
  {id: 11, name: "Glacier", displayName: "冰川", description: "多年积雪压实形成的持久冰体，几乎不具备常规陆地适居条件。", color: [0.84, 0.91, 0.92, 1], habitability: 0},
  {id: 12, name: "Wetland", displayName: "湿地", description: "地表长期或季节性积水，土壤水分饱和并发育水生、湿生植被。", color: [0.04, 0.57, 0.19, 1], habitability: 12}
];

export const BIOMES = Object.freeze(BIOME_ROWS.map(row => Object.freeze({...row, color: Object.freeze([...row.color])})));

const BIOME_BY_ID = new Map(BIOMES.map(biome => [biome.id, biome]));
const BIOME_BY_CANONICAL_NAME = new Map(BIOMES.map(biome => [biome.name.toLocaleLowerCase("en-US"), biome]));

export function resolveBiomeDescriptor(biomeOrId, sourceBiomes = null) {
  const source = biomeOrId && typeof biomeOrId === "object"
    ? biomeOrId
    : findSourceBiome(sourceBiomes, biomeOrId);
  const requestedId = Number(source?.id ?? biomeOrId);
  const id = Number.isInteger(requestedId) && requestedId >= 0 ? requestedId : -1;
  const canonicalName = String(source?.canonicalName || source?.name || "").trim();
  const registered = BIOME_BY_ID.get(id) || BIOME_BY_CANONICAL_NAME.get(canonicalName.toLocaleLowerCase("en-US")) || null;
  const fallbackId = id >= 0 ? ` #${id}` : "";
  return Object.freeze({
    id,
    name: registered?.displayName || String(source?.displayName || source?.name || `未知生物群系${fallbackId}`),
    canonicalName: registered?.name || canonicalName || `unknown${fallbackId}`,
    description: registered?.description || String(source?.description || `尚未登记该生物群系${fallbackId}的生态说明。`),
    color: source?.color || registered?.color || Object.freeze([0.5, 0.5, 0.5, 1]),
    habitability: Number(source?.habitability ?? registered?.habitability) || 0,
    registered: Boolean(registered)
  });
}

export function listBiomeDescriptors(sourceBiomes = null) {
  const source = Array.isArray(sourceBiomes) && sourceBiomes.length ? sourceBiomes : BIOMES;
  return source.map(biome => resolveBiomeDescriptor(biome, source));
}

function findSourceBiome(sourceBiomes, biomeId) {
  if (!Array.isArray(sourceBiomes)) return null;
  const id = Number(biomeId);
  return sourceBiomes.find(biome => Number(biome?.id) === id) || sourceBiomes[id] || null;
}
