import {captureCityScaleVisualSnapshot, refreshCityScaleVisuals, restoreCityScaleVisualSnapshot} from "./city-visuals.js";

const GROUPS = [
  ["state", "politics.states", "pack.states"],
  ["province", "politics.provinces", "pack.provinces"],
  ["culture", "society.cultures", "pack.cultures"],
  ["religion", "society.religions", "pack.religions"]
];
export const CITY_POPULATION_REPLICA_PATHS = ["settlements.cities", "settlements.metadata", "pack.burgs", ...GROUPS.flatMap(([, ...paths]) => paths)];

export function createCityPopulationTransaction(cityId, value, {faultInjector} = {}) {
  const number = value == null || typeof value === "boolean" || String(value).trim() === "" ? NaN : Number(value);
  const population = Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? Number(number.toFixed(9)) : null;
  let before, after;
  function target(map) {
    if (population === null) throw new Error("城市人口必须是非负有限数");
    const city = map?.settlements?.cities?.[cityId];
    const burg = map?.pack?.burgs?.[city?.burgId];
    if (!city || city.removed || !burg?.i || burg.removed) throw new Error("所选城市已不存在或缺少有效人口资料");
    return {city, burg};
  }
  return {
    isNoop({map}) {
      const {city, burg} = target(map);
      return city.population === population && burg.population === population;
    },
    apply({map}) {
      const {city, burg} = target(map);
      if (after) {restore(map, after); return;}
      const paths = [`settlements.cities.${cityId}.population`, `pack.burgs.${city.burgId}.population`, "settlements.metadata"];
      const owners = GROUPS.map(([key]) => owner(map, city, burg, key));
      for (const [index, [, ...roots]] of GROUPS.entries()) {
        for (const root of roots) if (get(map, `${root}.${owners[index]}`)) paths.push(`${root}.${owners[index]}.urban`);
      }
      before = capture(map, paths);
      try {
        city.population = burg.population = population;
        const totals = GROUPS.map(() => 0);
        let totalPopulation = 0, maxPopulation = 0;
        for (const item of map.settlements.cities) {
          const mirror = map.pack.burgs[item?.burgId];
          if (!item || item.removed || !mirror?.i || mirror.removed) continue;
          const amount = Math.max(0, Number(item.population ?? mirror.population) || 0);
          totalPopulation += amount;
          maxPopulation = Math.max(maxPopulation, amount);
          GROUPS.forEach(([key], index) => {if (owner(map, item, mirror, key) === owners[index]) totals[index] += amount;});
        }
        GROUPS.forEach(([, ...roots], index) => {
          for (const root of roots) {
            const group = get(map, `${root}.${owners[index]}`);
            if (group) group.urban = Number(totals[index].toFixed(9));
          }
        });
        map.settlements.metadata ||= {};
        Object.assign(map.settlements.metadata, {totalPopulation: Number(totalPopulation.toFixed(9)), maxPopulation});
        refreshCityScaleVisuals(map);
        faultInjector?.();
        after = capture(map, paths);
      } catch (error) {restore(map, before); throw error;}
    },
    revert({map}) {
      if (!before) throw new Error("缺少可撤销的城市人口快照");
      restore(map, before);
    }
  };
}

function owner(map, city, burg, key) {
  const cell = city.packCell ?? burg.cell;
  const value = Number(city[key] ?? burg[key] ?? map.pack?.cells?.[key]?.[cell] ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}
function get(root, path) {return path.split(".").reduce((value, key) => value?.[key], root);}
function capture(map, paths) {
  return {
    fields: paths.map(path => {
      const keys = path.split("."), key = keys.pop(), parent = get(map, keys.join("."));
      return {path, exists: Object.hasOwn(parent, key), value: structuredClone(parent[key])};
    }),
    visuals: captureCityScaleVisualSnapshot(map)
  };
}
function restore(map, snapshot) {
  for (const {path, exists, value} of snapshot.fields) {
    const keys = path.split("."), key = keys.pop(), parent = get(map, keys.join("."));
    if (exists) parent[key] = structuredClone(value);
    else delete parent[key];
  }
  restoreCityScaleVisualSnapshot(map, snapshot.visuals);
}
