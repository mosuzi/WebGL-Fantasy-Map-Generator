const GOOD_COLORS = Object.freeze([
  "#d7a84f", "#6aa56a", "#4f9cc9", "#c94c4c", "#8a6a4f", "#7f6cc7", "#c86e9f", "#8aa6b0"
]);

const MARKET_COLORS = Object.freeze([
  "#4f9cc9", "#c94c4c", "#6aa56a", "#d7a84f", "#7f6cc7", "#c86e9f", "#5f8f8a", "#a87852"
]);

const GOOD_ICONS = Object.freeze(["●", "◆", "▲", "■", "✦", "⬟", "✿", "◈"]);

export function defaultGoodDisplayProperties(good = {}) {
  const id = normalizeId(good.i ?? good.id);
  return {
    visible: good.visible !== false,
    color: GOOD_COLORS[(id - 1) % GOOD_COLORS.length],
    icon: GOOD_ICONS[(id - 1) % GOOD_ICONS.length],
    label: normalizedText(good.name, 48) || `商品 #${id}`
  };
}

export function defaultMarketDisplayProperties(market = {}) {
  const id = normalizeId(market.i ?? market.id);
  return {
    name: normalizedText(market.name, 64) || `市场 #${id}`,
    color: MARKET_COLORS[(id - 1) % MARKET_COLORS.length]
  };
}

export function normalizeGoodDisplayProperties(good = {}) {
  const defaults = defaultGoodDisplayProperties(good);
  return {
    visible: good.visible === undefined ? defaults.visible : Boolean(good.visible),
    color: normalizeHexColor(good.color) || defaults.color,
    icon: normalizedText(good.icon, 8) || defaults.icon,
    label: normalizedText(good.label, 48) || defaults.label
  };
}

export function normalizeMarketDisplayProperties(market = {}) {
  const defaults = defaultMarketDisplayProperties(market);
  return {
    name: normalizedText(market.name, 64) || defaults.name,
    color: normalizeHexColor(market.color) || defaults.color
  };
}

export function normalizeGoodDisplayPatch(good, patch = {}) {
  const current = normalizeGoodDisplayProperties(good);
  return {
    visible: patch.visible === undefined ? current.visible : Boolean(patch.visible),
    color: patch.color === undefined ? current.color : requiredHexColor(patch.color, "商品颜色"),
    icon: patch.icon === undefined ? current.icon : requiredText(patch.icon, 8, "商品图标"),
    label: patch.label === undefined ? current.label : requiredText(patch.label, 48, "商品标签")
  };
}

export function normalizeMarketDisplayPatch(market, patch = {}) {
  const current = normalizeMarketDisplayProperties(market);
  return {
    name: patch.name === undefined ? current.name : requiredText(patch.name, 64, "市场名称"),
    color: patch.color === undefined ? current.color : requiredHexColor(patch.color, "市场颜色")
  };
}

export function normalizeEconomyDisplayMap(map) {
  if (!map || typeof map !== "object") return map;
  const packGoods = normalizeCollection(map.pack?.goods, normalizeGoodRecord);
  const packMarkets = normalizeCollection(map.pack?.markets, normalizeMarketRecord);
  const pack = map.pack ? {...map.pack, goods: packGoods, markets: packMarkets} : map.pack;
  const economy = map.economy ? {
    ...map.economy,
    goods: map.economy.goods === map.pack?.goods ? packGoods : normalizeCollection(map.economy.goods, normalizeGoodRecord),
    markets: map.economy.markets === map.pack?.markets ? packMarkets : normalizeCollection(map.economy.markets, normalizeMarketRecord)
  } : map.economy;
  return {...map, pack, economy};
}

export function backfillEconomyDisplayProperties(map) {
  if (!map || typeof map !== "object") return map;
  for (const collection of [map.pack?.goods, map.economy?.goods]) {
    for (const good of collection || []) if (good && typeof good === "object") Object.assign(good, normalizeGoodDisplayProperties(good));
  }
  for (const collection of [map.pack?.markets, map.economy?.markets]) {
    for (const market of collection || []) if (market && typeof market === "object") Object.assign(market, normalizeMarketDisplayProperties(market));
  }
  return map;
}

export function goodDisplayName(good = {}) {
  const display = normalizeGoodDisplayProperties(good);
  return `${display.icon} ${display.label}`.trim();
}

function normalizeGoodRecord(good) {
  return {...good, ...normalizeGoodDisplayProperties(good)};
}

function normalizeMarketRecord(market) {
  return {...market, ...normalizeMarketDisplayProperties(market)};
}

function normalizeCollection(collection, normalizer) {
  if (!Array.isArray(collection)) return collection;
  return collection.map(item => item && typeof item === "object" ? normalizer(item) : item);
}

function requiredText(value, maxLength, label) {
  const normalized = normalizedText(value, maxLength);
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function requiredHexColor(value, label) {
  const normalized = normalizeHexColor(value);
  if (!normalized) throw new Error(`${label}必须是 #RRGGBB 或 #RGB`);
  return normalized;
}

function normalizedText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeHexColor(value) {
  const source = String(value ?? "").trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(source);
  if (short) return `#${short[1].split("").map(character => character + character).join("")}`.toLowerCase();
  const full = /^#?([0-9a-f]{6})$/i.exec(source);
  return full ? `#${full[1].toLowerCase()}` : "";
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 1;
}
