import {cityDevelopmentEffects, estimateCityPopulationPotential} from "../generator/city-development.js";
import {editedBurgOutput, editedMarketBalances, editedPoliticalPower, summarizeMarketBalances} from "../generator/economy.js";
import {editedRecruitmentTargets} from "../generator/military.js";
import {createCityPopulationTransaction} from "./city-population-transaction.js";

// 主命令先写玩家编辑的字段，派生值和它共用一次历史。记录路径，撤销时重新解析当前地图。
export function withCityLocalUpdates(command, cityIds, {followPopulation = true} = {}) {
  let transaction;
  const originalPaths = command.getReplicaPaths?.bind(command);
  const applyBase = command.apply.bind(command);
  const undoBase = command.revert.bind(command);
  command.apply = context => {
    const {map} = context;
    const maximum = map.settlements?.metadata?.maxPopulation;
    const cities = cityIds(map).map(id => map.settlements?.cities?.[id]).filter(city => city && !city.removed);
    const inputs = cities.map(city => ({
      city, population: city.population ?? map.pack.burgs[city.burgId]?.population ?? 0,
      economy: cityDevelopmentEffects(map.pack.burgs[city.burgId] || city).economy,
      potential: estimateCityPopulationPotential(map.pack, city, map.options?.seed)
    }));
    applyBase(context);
    const local = transaction || {population: [], fields: new Map()};
    try {
      if (transaction) {
        for (const update of local.population) update.apply(context);
        restoreFields(map, local.fields, "after");
        return;
      }
      for (const {city, population, potential} of inputs) {
        if (!followPopulation || population !== potential) continue;
        const next = estimateCityPopulationPotential(map.pack, city, map.options?.seed);
        if (next === population) continue;
        const update = createCityPopulationTransaction(city.id, next);
        update.apply(context);
        local.population.push(update);
      }
      if (local.population.length) {
        command.effects.render = "draw";
        command.effects.derived = [...new Set([...command.effects.derived, "point-layers", "labels", "city-role-labels"])];
      }
      command.effects.derived = [...new Set([...command.effects.derived, "city-local-edit",
        ...(maximum !== map.settlements?.metadata?.maxPopulation ? ["population-maximum"] : [])])];
      refreshCityOutputs(map, inputs, local.fields);
      transaction = local;
    } catch (error) {
      restoreFields(map, local.fields, "before");
      for (const update of local.population.slice().reverse()) update.revert(context);
      undoBase(context);
      throw error;
    }
  };
  command.revert = context => {
    restoreFields(context.map, transaction.fields, "before");
    for (const update of transaction.population.slice().reverse()) update.revert(context);
    undoBase(context);
  };
  command.getReplicaPaths = map => {
    if (!transaction) return originalPaths?.(map) || [];
    // 旧卷缺少字段时替换所属行。副本只允许 replace 已存在的路径。
    const derived = [...transaction.fields].map(([path, {before}]) => before.exists ? path : path.slice(0, path.lastIndexOf(".")));
    const paths = new Set([...(originalPaths?.(map) || []), ...derived, ...transaction.population.flatMap(update => update.getReplicaPaths())]);
    return [...paths].filter(path => {
      for (let end = path.indexOf("."); end !== -1; end = path.indexOf(".", end + 1)) if (paths.has(path.slice(0, end))) return false;
      return true;
    });
  };
  return command;
}

function refreshCityOutputs(map, inputs, fields) {
  const {pack} = map;
  const locks = map.regenerationLocks?.entries || [];
  const locked = (kind, id) => locks.some(entry => entry.kind === kind && String(entry.id) === String(id));
  const stateIds = new Set(), provinceIds = new Set(), taxes = new Map();
  const marketDeltas = new Map(), dealChanges = [];
  const addTax = (id, delta) => taxes.set(id, (taxes.get(id) || 0) + delta);
  // 两份镜像可能是同一对象。先读取两侧的原值，再写任何一侧。
  const write = (roots, values) => {
    for (const [key, value] of Object.entries(values)) {
      const changes = roots.map(root => ({root, target: at(map, root)})).filter(({target}) => target && !Object.is(target[key], value));
      for (const {root, target} of changes) {
        const path = root + "." + key;
        const before = fields.get(path)?.before || {exists: Object.hasOwn(target, key), value: structuredClone(target[key])};
        fields.set(path, {before, after: {exists: true, value: structuredClone(value)}});
      }
      for (const {target} of changes) target[key] = value;
    }
  };
  for (const {city, population, economy} of inputs) {
    const burg = pack.burgs[city.burgId];
    if (!burg) continue;
    const province = burg.province ?? pack.cells.province?.[burg.cell];
    stateIds.add(burg.state);
    provinceIds.add(province);
    const delta = (burg.population || 0) - population;
    if (delta && burg.market) marketDeltas.set(burg.market, (marketDeltas.get(burg.market) || 0) + delta);
    addTax(burg.state, delta * (pack.states?.[burg.state]?.pollTax || 0));
    if (!Array.isArray(burg.production) || locked("city", city.id) || locked("state", burg.state) || locked("province", province)) continue;
    const development = cityDevelopmentEffects(burg).economy;
    if (!delta && development === economy) continue;
    const output = editedBurgOutput(burg, map.options || {});
    write([`pack.burgs.${burg.i}`, `settlements.cities.${city.id}`], output);
    let saleIndex = 0;
    for (const record of burg.production) {
      if (!Number.isInteger(record.dealId)) continue;
      const id = record.dealId;
      const index = pack.deals?.[id]?.i === id ? id : pack.deals?.findIndex(deal => deal?.i === id);
      const deal = pack.deals?.[index];
      if (!deal) continue;
      const sale = deal.sellerType === "burg" && deal.seller === burg.i && deal.buyerType === "market";
      const purchase = deal.buyerType === "burg" && deal.buyer === burg.i && deal.sellerType === "market";
      if (!sale && !purchase) continue;
      const units = round(development * (sale ? 0.8 + (saleIndex++ % 2) * 0.2 : 1));
      if (locked("trade-flow", id) || locked("economy-market", sale ? deal.buyer : deal.seller) || units === deal.units) continue;
      const sellerState = sale ? burg.state : pack.burgs[pack.markets?.[deal.seller]?.centerBurgId]?.state;
      const tax = id % 5 === 0 ? round(units * deal.price * (pack.states?.[sellerState]?.salesTax || 0.15) * 3) : 0;
      const mirror = map.economy?.deals;
      const mirrorIndex = mirror?.[index]?.i === id ? index : mirror?.findIndex(item => item?.i === id);
      const roots = [`pack.deals.${index}`];
      if (mirrorIndex >= 0) roots.push(`economy.deals.${mirrorIndex}`);
      const previousTax = Number(deal.tax) || 0;
      dealChanges.push({deal, delta: units - deal.units});
      for (const marketId of [burg.market, sale ? deal.buyer : deal.seller]) {
        if (marketId && !marketDeltas.has(marketId)) marketDeltas.set(marketId, 0);
      }
      write(roots, {units, tax});
      addTax(sellerState, tax - previousTax);
    }
  }
  let updatedMarket = false;
  for (const [id, delta] of marketDeltas) {
    const market = pack.markets?.[id];
    if (market?.demandSummary && market.goods && !locked("economy-market", id)) {
      write([`pack.markets.${id}`, `economy.markets.${id}`], editedMarketBalances(pack, market, delta, dealChanges));
      updatedMarket = true;
    }
  }
  if (updatedMarket && map.economy?.metadata) write(["economy.metadata"], summarizeMarketBalances(pack));
  for (const [id, delta] of taxes) {
    const state = pack.states?.[id];
    if (!state?.i || !delta || locked("state", id)) continue;
    stateIds.add(id);
    write([`pack.states.${id}`, `politics.states.${id}`], {treasury: round((state.treasury || 0) + delta)});
  }
  for (const [kind, ids, collection] of [["state", stateIds, "states"], ["province", provinceIds, "provinces"]]) {
    for (const id of ids) {
      const group = pack[collection]?.[id];
      if (!group?.i || group.removed || locked(kind, id)) continue;
      const roots = [`pack.${collection}.${id}`, `politics.${collection}.${id}`];
      write(roots, editedPoliticalPower(pack, kind, group));
      if (kind !== "state") continue;
      const targets = editedRecruitmentTargets(group, pack);
      if (targets) {
        write(roots.map(root => root + ".militaryPolicy"), targets);
        write(roots.map(root => root + ".militaryDiagnostics"), {desiredTroops: targets.desiredTroops,
          finalTroops: targets.finalTroops, economicPower: group.economicPower, militarySupply: group.militarySupply});
      }
    }
  }
}

function round(value) {return Math.round(value * 1000) / 1000;}
function at(map, path) {return path.split(".").reduce((parent, key) => parent?.[key], map);}
function restoreFields(map, fields, side) {
  for (const [path, change] of fields) {
    const cut = path.lastIndexOf(".");
    const target = at(map, path.slice(0, cut)), key = path.slice(cut + 1);
    if (change[side].exists) target[key] = structuredClone(change[side].value);
    else delete target[key];
  }
}
