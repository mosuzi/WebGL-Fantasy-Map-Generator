import {inspectRelocatedSettlementPort} from "../generator/settlements.js";
import {objectAffected} from "./edit-command-effects.js";
import {createSetStateCapitalCommand} from "./object-edit-commands.js";
import {CITY_DEVELOPMENT_DESCRIPTIONS} from "../generator/city-development.js";

export const CITY_ATTRIBUTE_OPTIONS = Object.freeze([
  {key: "capital", label: "首都", path: "m3 6 4 4 5-7 5 7 4-4-2 13H5Z"},
  {key: "plaza", label: "贸易中心", path: "M3 10h18M5 10v10h14V10M3 10l2-6h14l2 6M9 20v-6h6v6"},
  {key: "citadel", label: "要塞", path: "M4 21V5h4v4h2V3h4v6h2V5h4v16ZM10 21v-6h4v6"},
  {key: "walls", label: "城墙", path: "M3 20V6h4v4h3V6h4v4h3V6h4v14ZM3 15h18M8 15v5m8-5v5"},
  {key: "port", label: "港口", path: "M12 7v14M8 10h8M3 14v3c0 2 4 4 9 4s9-2 9-4v-3M3 14l3 3m15-3-3 3M15 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0"},
  {key: "temple", label: "神庙", path: "m3 8 9-5 9 5ZM5 10v8m5-8v8m4-8v8m5-8v8M3 21h18M4 18h16"}
]);

export function readCityAttributeActions(map, cityId) {
  const {city, burg} = cityPair(map, cityId);
  if (!city || !burg) return [];
  return CITY_ATTRIBUTE_OPTIONS.map(option => {
    const active = attributeActive(city, burg, option.key);
    const inspection = inspectCityAttribute(map, cityId, option.key, option.key === "capital" || !active);
    return {...option, active, disabled: !inspection.valid || !inspection.changed,
      title: `${inspection.reason || `${active ? "取消" : "设置"}${option.label}`}；${CITY_DEVELOPMENT_DESCRIPTIONS[option.key]}。相关数据重算时生效。`};
  });
}

export function inspectCityAttribute(map, cityId, key, enabled) {
  const {city, burg} = cityPair(map, cityId);
  const reject = reason => ({valid: false, changed: false, reason});
  if (!CITY_ATTRIBUTE_OPTIONS.some(option => option.key === key) || typeof enabled !== "boolean") return reject("不支持的城市属性。");
  if (!city || !burg) return reject("当前城市已不存在。");
  const current = attributeActive(city, burg, key);
  if (key === "capital") {
    const state = map?.politics?.states?.[city.state];
    if (!state || state.removed || !(Number(city.state) > 0) || Number(burg.state) !== Number(city.state)) return reject("城市须属于有效国家才能设为首都。");
    if (!enabled) return reject("请将同一国家的另一座城市设为首都。");
    return {valid: true, changed: Number(state.capital) !== Number(city.burgId), reason: current ? "当前首都；选择同一国家的其他城市可迁都。" : "设为首都，并替换本国原首都。"};
  }
  let value = Number(enabled);
  if (key === "port" && enabled && !current) {
    const placement = inspectRelocatedSettlementPort(map.grid, map.pack, Number(city.packCell ?? burg.cell), {
      wasPort: 1, capital: Boolean(city.capital), burgId: city.burgId, options: map.options || {}
    });
    value = Number(placement.port || 0);
    if (!value) return reject("此处不满足可通航海岸或河道的港口条件。");
  } else if (key === "port" && enabled) value = Number(city.port || burg.port);
  if (key === "port" && !enabled && current && hasSeaRoute(map, city)) return reject("请先调整连接此港口的海路，再取消港口。");
  return {valid: true, changed: current !== enabled || Boolean(burg[key]) !== enabled, reason: "", value};
}

export function createSetCityAttributeCommand(cityId, key, enabled, {faultInjector = null} = {}) {
  const label = CITY_ATTRIBUTE_OPTIONS.find(option => option.key === key)?.label || "城市属性";
  const changesMapRole = key === "capital" || key === "port";
  let before = null;
  let after = null;
  return {
    label: `${enabled ? "设置" : "取消"}${label} #${cityId}`,
    domain: "city",
    effects: {render: changesMapRole ? "draw" : "none", selection: "refresh", runtimeStats: true, pickPanel: true,
      derived: ["object-panels", ...(changesMapRole ? ["point-layers", "labels", "city-role-labels"] : []), ...(key === "capital" ? ["state-capital"] : [])],
      affected: objectAffected("city", cityId)},
    isNoop({map}) {
      const inspection = inspectCityAttribute(map, cityId, key, enabled);
      if (!inspection.valid) throw new Error(inspection.reason);
      return !inspection.changed;
    },
    apply({map}) {
      if (after) return restoreFields(map, after);
      const inspection = inspectCityAttribute(map, cityId, key, enabled);
      if (!inspection.valid) throw new Error(inspection.reason);
      const {city, burg} = cityPair(map, cityId);
      const targets = [{collection: "cities", id: city.id, fields: [key]}, {collection: "burgs", id: city.burgId, fields: [key]}];
      let capitalCommand = null;
      if (key === "capital") {
        const state = map.politics.states[city.state];
        const previousCity = map.settlements.cities.find(item => item && Number(item.burgId) === Number(state.capital));
        for (const target of targets) target.fields.push("group", ...(target.collection === "cities" ? ["provincial"] : ["state"]));
        if (previousCity) targets.push({collection: "cities", id: previousCity.id, fields: ["capital", "group", "provincial"]}, {collection: "burgs", id: previousCity.burgId, fields: ["capital", "group", "state"]});
        for (const collection of ["states", "packStates"]) targets.push({collection, id: city.state, fields: ["capital", "center", "gridCenter", "religion"]});
        capitalCommand = createSetStateCapitalCommand(Number(city.state), Number(city.burgId));
        this.effects.affected = [...objectAffected("state", city.state), ...objectAffected("city", city.id), ...(previousCity ? objectAffected("city", previousCity.id) : [])];
      }
      if (map.settlements.metadata && changesMapRole) targets.push({collection: "metadata", fields: [key === "capital" ? "capitals" : "ports"]});
      before = captureFields(map, targets);
      try {
        if (capitalCommand) {
          capitalCommand.apply({map});
          const state = map.politics.states[city.state];
          const mirror = map.pack.states?.[city.state];
          if (mirror && mirror !== state) for (const field of ["capital", "center", "gridCenter", "religion"]) mirror[field] = state[field];
        } else {
          city[key] = inspection.value;
          burg[key] = inspection.value;
        }
        if (map.settlements.metadata && (key === "port" || key === "capital")) {
          map.settlements.metadata[key === "port" ? "ports" : "capitals"] = map.settlements.cities.filter(item => item && !item.removed && item[key]).length;
        }
        faultInjector?.();
        after = captureFields(map, targets);
      } catch (error) {
        restoreFields(map, before);
        throw error;
      }
    },
    revert({map}) {
      if (!before) throw new Error("缺少可撤销的城市属性记录。");
      restoreFields(map, before);
    }
  };
}

function cityPair(map, cityId) {
  const city = Number.isInteger(Number(cityId)) && cityId !== null ? map?.settlements?.cities?.[Number(cityId)] : null;
  const burg = map?.pack?.burgs?.[city?.burgId];
  return {city: city?.removed ? null : city, burg: burg?.removed ? null : burg};
}

function attributeActive(city, burg, key) {
  // 旧档允许首都、港口只在一侧保留；设施的显式关闭仍以城市值为准。
  return Boolean(key === "port" || key === "capital" ? city[key] || burg[key] : city[key] ?? burg[key]);
}

function hasSeaRoute(map, city) {
  return [map.settlements?.routes, map.pack?.routes].some(routes => routes?.some(route => route && !route.removed && route.type === "searoute" && (
    Number(route.from) === Number(city.id) || Number(route.to) === Number(city.id)
    || Number(route.packCells?.[0]) === Number(city.packCell) || Number(route.packCells?.at(-1)) === Number(city.packCell)
  )));
}

function targetObject(map, target) {
  if (target.collection === "metadata") return map.settlements?.metadata;
  if (target.collection === "cities") return map.settlements?.cities?.[target.id];
  if (target.collection === "states") return map.politics?.states?.[target.id];
  if (target.collection === "packStates") return map.pack?.states?.[target.id];
  return map.pack?.burgs?.[target.id];
}

function captureFields(map, targets) {
  return targets.filter(target => targetObject(map, target)).map(target => ({...target,
    values: target.fields.map(field => ({field, present: Object.hasOwn(targetObject(map, target), field), value: targetObject(map, target)[field]}))}));
}

function restoreFields(map, snapshot) {
  for (const target of snapshot) {
    const object = targetObject(map, target);
    for (const {field, present, value} of target.values) {
      if (present) object[field] = value;
      else delete object[field];
    }
  }
}
