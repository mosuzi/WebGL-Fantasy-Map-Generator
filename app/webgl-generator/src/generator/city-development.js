export const CITY_DEVELOPMENT_DESCRIPTIONS = Object.freeze({
  capital: "提高人口潜力、经济与征募权重，并优先连接主干道路",
  plaza: "提高人口潜力与经济产出，增加市场中心和主干道路候选优先级",
  citadel: "小幅提高人口潜力，增加主干道路候选和陆军驻军权重",
  walls: "提高人口潜力、交易产出和陆军驻军权重",
  port: "提高人口潜力与经济产出，参与陆路、合法海路和海军生成",
  temple: "提高人口潜力与经济产出，小幅提高路线候选优先级"
});

export function cityDevelopmentEffects(city = {}, burg = null) {
  const active = key => Number(Boolean(key === "capital" || key === "port" ? city[key] || burg?.[key] : city[key] ?? burg?.[key]));
  const capital = active("capital"), plaza = active("plaza"), citadel = active("citadel");
  const walls = active("walls"), port = active("port"), temple = active("temple");
  return {
    population: (capital ? 1.5 : 1) * (1 + plaza * 0.25 + citadel * 0.05 + walls * 0.1 + port * 0.2 + temple * 0.1),
    economy: 1 + capital * 0.1 + plaza * 0.3 + walls * 0.05 + port * 0.2 + temple * 0.05,
    roadWeight: 1 + plaza + port * 0.35 + citadel * 0.35 + temple * 0.1,
    roadBonus: plaza * 20 + citadel * 10,
    majorRoadCandidate: Boolean(capital || plaza || citadel || port),
    landRecruitment: 1 + citadel * 0.3 + walls * 0.15
  };
}

export function cityRoadPriority(burg) {
  const effects = cityDevelopmentEffects(burg);
  return Math.max(0, Number(burg?.population) || 0) * effects.roadWeight + effects.roadBonus;
}

export function estimateCityPopulationPotential(pack, city, seed = "map") {
  if (!city || city.removed) return 0;
  const burg = pack?.burgs?.[city.burgId] || city;
  const cell = Number(city.packCell ?? burg.cell);
  const rawSuitability = Number(pack?.cells?.s?.[cell]);
  const suitability = Number.isFinite(rawSuitability) ? Math.max(0, rawSuitability) : 5;
  // 固定地理与身份扰动，不读取当前人口，避免重算复利和属性开关重抽随机数。
  let hash = 2166136261;
  for (const character of `${seed}|${burg.i ?? city.burgId ?? city.id}|${cell}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const variation = 0.85 + hash / 4294967295 * 0.3;
  return Math.round(Math.max(0.01, suitability / 5 * variation * cityDevelopmentEffects(city, burg).population) * 1000) / 1000;
}
