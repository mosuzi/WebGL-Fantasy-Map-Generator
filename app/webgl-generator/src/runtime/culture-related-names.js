import {objectCultureId, namedObjects} from "./namebase-rule-transactions.js";
import {CULTURE_NAME_TYPES} from "./culture-name-types.js";

const NAME_STORAGE = {
  culture: {tables: ["society.cultures", "pack.cultures"], fields: ["name", "root"]},
  state: {tables: ["politics.states", "pack.states"], fields: ["name", "fullName"]},
  province: {tables: ["politics.provinces", "pack.provinces"], fields: ["name", "fullName"]},
  city: {tables: ["settlements.cities", "pack.burgs"], fields: ["name"]},
  river: {tables: ["rivers.rivers", "pack.rivers"], fields: ["name"]},
  lake: {tables: ["pack.features", "features.features", "grid.features"], fields: ["name"]},
  religion: {tables: ["society.religions", "pack.religions"], fields: ["name"]}
};

export async function prepareCultureNameChanges(map, {cultureIds, type}, {createCommand, drawSeed, yieldToMain, assertCurrent}) {
  const types = type === "all" ? CULTURE_NAME_TYPES : CULTURE_NAME_TYPES.filter(item => item.key === type);
  if (!types.length) throw new Error("请选择命名类型");
  const cultures = new Set(namedObjects(map, "culture").map(objectId).filter(id => id > 0));
  const selection = new Set(cultureIds);
  if ([...selection].some(id => !cultures.has(id))) throw new Error("所选文化已不存在");
  const scope = selection.size ? selection : cultures;
  const locked = new Set((map.regenerationLocks?.entries || []).map(({kind, id}) => `${kind}:${id}`));
  const shadow = {...map};
  const copies = new WeakMap();
  const writes = [];
  const affected = [];
  const targetsByType = new Map();
  let skipped = 0;
  let deadline = performance.now() + 6;
  function checkpoint() {
    if (performance.now() < deadline) return null;
    return yieldToMain().then(() => {
      assertCurrent();
      deadline = performance.now() + 6;
    });
  }
  for (const {key} of types) {
    const {tables, fields} = NAME_STORAGE[key];
    const objects = namedObjects(map, key);
    const targets = new Set();
    const originalNames = new Map();
    const burgIds = new Set();
    for (const object of objects) {
      const id = objectId(object);
      if (!Number.isInteger(id) || id < 0 || !scope.has(objectCultureId(map, key, object, id))) continue;
      if (locked.has(`${key}:${id}`)) skipped++;
      else {
        targets.add(id);
        originalNames.set(id, object);
        if (key === "city") burgIds.add(Number(object.burgId));
      }
    }
    if (!targets.size) continue;
    const isTarget = (row, table) => {
      if (!row || key === "lake" && row.type !== "lake") return false;
      if (table === "burgs") return burgIds.has(objectId(row)) || targets.has(Number(row.cityId ?? -1));
      return targets.has(objectId(row));
    };
    for (const path of tables) {
      const [section, table] = path.split(".");
      copyNameTable(map, shadow, section, table, copies, isTarget);
      await checkpoint();
    }
    const command = createCommand(key, [...targets], {drawSeed, allowEmpty: true});
    await command.prepare({map: shadow}, checkpoint);
    command.apply({map: shadow});
    const primary = namedObjects(shadow, key);
    const newNames = new Map(primary.filter(row => targets.has(objectId(row))).map(row => [objectId(row), row]));
    const changedIds = [...targets].filter(id => {
      const before = originalNames.get(id);
      const after = newNames.get(id);
      return after && fields.some(field => !Object.is(before?.[field], after[field]));
    });
    const changed = new Set(changedIds);
    const changedBurgs = new Map(primary.filter(row => changed.has(objectId(row))).map(row => [Number(row.burgId), objectId(row)]));
    for (const path of tables) {
      const [section, table] = path.split(".");
      const seen = new Set();
      for (const [index, row] of (map[section]?.[table] || []).entries()) {
        if (!row || key === "lake" && row.type !== "lake") continue;
        const id = table === "burgs" ? changedBurgs.get(objectId(row)) ?? Number(row.cityId ?? -1) : objectId(row);
        if (!changed.has(id) || seen.has(id)) continue;
        seen.add(id);
        for (const field of fields) {
          const after = newNames.get(id)[field];
          if (Object.is(row[field], after)) continue;
          writes.push({path: `${path}.${index}.${field}`, section, table, index, field, after, before: row[field], hadField: Object.hasOwn(row, field)});
        }
      }
      await checkpoint();
    }
    for (const id of changed) affected.push({kind: key, id});
    targetsByType.set(key, changedIds);
  }
  assertCurrent();
  const cityIds = targetsByType.get("city");
  const provinceIds = targetsByType.get("province") || [];
  const labels = Boolean(cityIds?.length || provinceIds.length || targetsByType.get("state")?.length);
  const forwardFields = writes.map(({path, after}) => ({path, mode: "field", value: after}));
  const reverseFields = writes.map(({path, before, hadField}) => hadField
    ? {path, mode: "field", value: before}
    : {path, mode: "delete"});
  return {
    label: "按文化重新生成命名",
    domain: "culture-related-names",
    effects: {
      render: "none", selection: "none", runtimeStats: false, pickPanel: true,
      derived: labels ? ["object-name", "labels"] : ["object-name"],
      scopedNameLabels: labels,
      deferLabels: labels ? "after-paint" : false,
      brushCityIds: cityIds,
      brushProvinceIds: provinceIds,
      affected
    },
    isNoop: () => !writes.length,
    getPreparedReplicaFieldWrites: action => action === "undo" || action === "rollback" ? reverseFields : forwardFields,
    getResult: () => ({renamed: affected.length, skipped}),
    apply: ({map: target}) => installNames(target, writes, true),
    revert: ({map: target}) => installNames(target, writes, false)
  };
}

function objectId(row) {
  return Number(row.id ?? row.i);
}

function copyNameTable(map, shadow, section, table, copies, isTarget) {
  const rows = map[section]?.[table];
  if (!Array.isArray(rows)) return;
  if (shadow[section] === map[section]) shadow[section] = {...map[section]};
  if (!copies.has(rows)) copies.set(rows, rows.map(row => isTarget(row, table) ? {...row} : row));
  shadow[section][table] = copies.get(rows);
}

function installNames(map, writes, forward) {
  const rows = writes.map(change => map[change.section]?.[change.table]?.[change.index]);
  if (rows.some(row => !row)) throw new Error("命名对象已不存在");
  writes.forEach(({field, after, before, hadField}, index) => {
    if (forward) rows[index][field] = after;
    else if (hadField) rows[index][field] = before;
    else delete rows[index][field];
  });
}
