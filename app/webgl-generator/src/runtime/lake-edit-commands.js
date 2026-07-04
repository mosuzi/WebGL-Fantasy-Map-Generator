import {OBJECT_KIND} from "./object-kinds.js";
import {createChineseNameGenerator} from "../generator/names.js";

const LAKE_NAME_BATCH_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "object-panels"])
});

export function createRenameLakesFromNamebaseCommand(lakeIds, {label = "按名称库重命名湖泊"} = {}) {
  const targets = uniqueLakeIds(lakeIds);
  let changes = null;

  return {
    label: `${label} ${targets.length} 个`,
    effects: {
      ...LAKE_NAME_BATCH_EFFECTS,
      affected: targets.map(id => ({kind: OBJECT_KIND.LAKE, id}))
    },
    apply(context) {
      changes ??= buildLakeRenameChanges(context.map, targets);
      if (!changes.length) throw new Error("没有可重命名的湖泊");
      for (const change of changes) writeLakeName(context.map, change.id, change.afterName);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的湖泊名称快照");
      for (const change of changes) writeLakeName(context.map, change.id, change.beforeName);
    },
    isNoop(context) {
      return !targets.length || !buildLakeRenameChanges(context.map, targets).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: targets.length};
    }
  };
}

function buildLakeRenameChanges(map, lakeIds) {
  const lakes = map?.pack?.features || [];
  if (!lakes.length) return [];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|explicit-lake-rename|${map.metadata?.checksum || ""}`, {namebases: map.namebases});
  const changes = [];
  for (const id of lakeIds) {
    const lake = findLake(map, id);
    if (!lake) continue;
    const afterName = generator.makeLakeName(lakeNameOptions(map, lake));
    const beforeName = lake.name || "";
    if (!afterName || afterName === beforeName) continue;
    changes.push({id, beforeName, afterName});
  }
  return changes;
}

function lakeNameOptions(map, lake) {
  const firstCell = Number.isInteger(lake.firstCell) ? lake.firstCell : 0;
  const cultureId = Number.isInteger(firstCell) ? map?.pack?.cells?.culture?.[firstCell] || 0 : 0;
  const culture = map?.pack?.cultures?.[cultureId] || map?.society?.cultures?.[cultureId];
  return {
    id: lake.i ?? lake.id,
    cell: firstCell,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    type: lake.group || "lake",
    major: (Number(lake.cells) || 0) >= 10
  };
}

function findLake(map, lakeId) {
  const id = Number(lakeId);
  return (map?.pack?.features || []).find(feature => feature?.type === "lake" && Number(feature.i ?? feature.id) === id) || null;
}

function writeLakeName(map, lakeId, name) {
  const lake = findLake(map, lakeId);
  if (!lake) throw new Error(`找不到湖泊 #${lakeId}`);
  lake.name = name;
}

function uniqueLakeIds(lakeIds) {
  return [...new Set((lakeIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
}
