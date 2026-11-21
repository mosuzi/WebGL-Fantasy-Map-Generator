import {inspectRelocatedSettlementPort} from "../generator/settlements.js";
import {objectAffected} from "./edit-command-effects.js";
import {withCityLocalUpdates} from "./city-local-updates.js";
import {createSetStateCapitalCommand} from "./object-edit-commands.js";
import {CITY_DEVELOPMENT_DESCRIPTIONS} from "../generator/city-development.js";

export const CITY_ATTRIBUTE_OPTIONS = Object.freeze([
  {key: "capital", label: "首都", path: "m12 1 3.3 6.8 7.5 1.1-5.4 5.3 1.3 7.5-6.7-3.6-6.7 3.6 1.3-7.5-5.4-5.3 7.5-1.1Z"},
  {key: "plaza", label: "贸易中心", path: "M4 3h16l3 6v2a3 3 0 0 1-5 2 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-5-2V9ZM3 15h3v4h7v-4h5v6H3Zm16 0h2v6h-2Z"},
  {key: "citadel", label: "要塞", path: "M4 2h4v4h2V2h4v4h2V2h4v7l-3 3 1 6H6l1-6-3-3ZM4 19h16v3H4Z"},
  {key: "walls", label: "城墙", path: "M1 5h3v3h2V5h3v7h6V5h3v3h2V5h3v16h-9v-4a2 2 0 0 0-4 0v4H1Zm3 6v3h2v-3Zm14 0v3h2v-3Z"},
  {key: "port", label: "港口", path: "M12 1a4 4 0 0 1 1.5 7.7V10H17v2.5h-3.5v6.6a8 8 0 0 0 5.2-3.4L17 15l5-3-.2 6-1.2-.8a11 11 0 0 1-8.6 5.1 11 11 0 0 1-8.6-5.1l-1.2.8L2 12l5 3-1.7.7a8 8 0 0 0 5.2 3.4v-6.6H7V10h3.5V8.7A4 4 0 0 1 12 1Zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"},
  {key: "temple", label: "神庙", path: "m12 1 11 6v2H1V7Zm-9 9h4v8H3Zm7 0h4v8h-4Zm7 0h4v8h-4ZM1 19h22v3H1Z"}
]);

export function readCityAttributeActions(map, cityId) {
  const {city, burg} = cityPair(map, cityId);
  if (!city || !burg) return [];
  return CITY_ATTRIBUTE_OPTIONS.map(option => {
    const active = attributeActive(city, burg, option.key);
    const inspection = inspectCityAttribute(map, cityId, option.key, option.key === "capital" || !active);
    return {...option, active, disabled: !inspection.valid || !inspection.changed,
      title: `${inspection.reason || `${active ? "取消" : "设置"}${option.label}`}；${CITY_DEVELOPMENT_DESCRIPTIONS[option.key]}。`};
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
  return withCityLocalUpdates({
    label: `${enabled ? "设置" : "取消"}${label} #${cityId}`,
    getReplicaPaths() {
      const roots = {cities: "settlements.cities", burgs: "pack.burgs", states: "politics.states", packStates: "pack.states"};
      return (before || []).flatMap(target => {
        const path = target.collection === "metadata" ? "settlements.metadata" : roots[target.collection] + "." + target.id;
        return target.values.map(({field, present}) => present ? path + "." + field : path);
      });
    },
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
        capitalCommand = createSetStateCapitalCommand(Number(city.state), Number(city.burgId), {updateCityOutputs: false});
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
  }, map => {
    const city = map.settlements?.cities?.[cityId];
    const previous = key === "capital" && map.pack?.burgs?.[map.politics?.states?.[city?.state]?.capital]?.cityId;
    return key === "capital" && Number.isInteger(previous) && previous !== cityId ? [previous, cityId] : [cityId];
  });
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
