import {createRandom} from "./random.js";

// 词素策略参考 zoningjs@3.2024.0 的县级以上中文地名韵脚，并保留项目内可 seed 的轻量词池。
const PLACE_STEMS = [
  "青溪",
  "洛川",
  "云阳",
  "石门",
  "清源",
  "苍岭",
  "南浦",
  "白石",
  "衡水",
  "昭阳",
  "岚港",
  "栖梧",
  "河洛",
  "临川",
  "金台",
  "玉溪",
  "松原",
  "白城",
  "青州",
  "澄江",
  "平陵",
  "东渚",
  "西陵",
  "北辰",
  "南衡",
  "海津",
  "云渡",
  "泽阳",
  "松岳",
  "月湾",
  "晴川",
  "雨林",
  "岭南",
  "北海",
  "朱明",
  "素川",
  "长岚",
  "柏原",
  "霜庭",
  "星渚",
  "湖阴",
  "江宁",
  "龙泉",
  "古原",
  "新安",
  "安陵",
  "明溪",
  "清河",
  "铜山",
  "灵丘",
  "云梦",
  "澜沧",
  "赤城",
  "苍梧",
  "衡阳",
  "曲江",
  "镜湖",
  "丹阳",
  "玉门",
  "天水",
  "星台",
  "秋浦",
  "寒山",
  "桂岭",
  "江陵",
  "石泉",
  "青港",
  "白水",
  "川北",
  "河阳",
  "云林",
  "岳阳",
  "澄湖",
  "月溪",
  "岚山",
  "长川",
  "南溪",
  "北岭"
];
const REAL_PREFIXES = ["青", "清", "云", "白", "苍", "南", "北", "东", "西", "长", "安", "昭", "临", "平", "江", "河", "石", "松", "金", "玉"];
const HYDRO_PREFIXES = ["青", "清", "云", "白", "苍", "洛", "澄", "月", "星", "玉", "金", "龙", "灵", "玄", "镜", "寒", "秋", "明", "丹", "素"];
const LIGHT_FANTASY_PREFIXES = ["云", "青", "苍", "玄", "灵", "玉", "星", "月", "霜", "岚", "曜", "澜"];
const HIGH_FANTASY_STEMS = ["太微", "扶摇", "归墟", "烛龙", "昆吾", "瑶光"];
const LAND_SUFFIXES = ["山", "岭", "川", "原", "谷", "陵", "泉", "城", "州", "阳", "阴", "泽"];
const WATER_SUFFIXES = ["溪", "水", "河", "江", "湖", "泽", "湾", "港", "浦", "津", "泊"];
const HIGHLAND_SUFFIXES = ["山", "岭", "岳", "峰", "陵", "关"];
const PORT_SUFFIXES = ["港", "津", "浦", "湾"];
const LAKE_SUFFIXES = ["湖", "泽", "泊", "潭", "海"];
const STATE_FORMS = {
  Naval: ["海国", "诸港", "海邦", "王国"],
  Lake: ["泽国", "湖邦", "王国"],
  Highland: ["山国", "公国", "王国"],
  River: ["河邦", "诸州", "王国"],
  Nomadic: ["汗国", "部盟", "诸帐"],
  Hunting: ["林邦", "诸部", "王国"],
  Generic: ["王国", "公国", "邦联", "共和国", "诸州"]
};
const PROVINCE_FORMS = ["郡", "州", "道", "府", "领", "司"];
const DIRECTION_PREFIXES = ["东", "西", "南", "北", "上", "下", "新", "古"];
const SHIELDS = ["heater", "kite", "round", "horsehead", "banner"];
const CHARGES = ["mount", "river", "star", "gate", "wave", "tree", "tower", "sun", "moon", "bridge"];
const FIELD_TINCTURES = ["#b94b4b", "#3d6f9e", "#4f7f52", "#a47a35", "#6e579b", "#9a9a70", "#3e7b7d", "#704f38"];
const METAL_TINCTURES = ["#f0d889", "#e8e4d6", "#d8b56d", "#f3efe1"];

export function createChineseNameGenerator(seed = "map") {
  const used = new Map();

  return {
    makePlaceName(options = {}) {
      const rng = rngFor(seed, "place", options);
      const style = choosePlaceStyle(rng, options);
      const suffixes = getPlaceSuffixes(options);
      let name;

      if (style === "real") name = rng.next() < 0.72 ? pick(rng, PLACE_STEMS) : `${pick(rng, REAL_PREFIXES)}${pick(rng, suffixes)}`;
      else if (style === "light") name = `${pick(rng, LIGHT_FANTASY_PREFIXES)}${pick(rng, suffixes)}`;
      else name = pick(rng, HIGH_FANTASY_STEMS);

      if (options.port && !PORT_SUFFIXES.some(suffix => name.endsWith(suffix))) name = trimGeographicSuffix(name) + pick(rng, PORT_SUFFIXES);
      return makeUnique(used, "place", name, rng);
    },

    makeRiverName(options = {}) {
      const rng = rngFor(seed, "river", options);
      const prefix = rng.next() < 0.82 ? pick(rng, HYDRO_PREFIXES) : pick(rng, LIGHT_FANTASY_PREFIXES);
      return makeUnique(used, "river", `${prefix}${pick(rng, ["溪", "水", "河", "江", "川"])}`, rng);
    },

    makeLakeName(options = {}) {
      const rng = rngFor(seed, "lake", options);
      const prefix = rng.next() < 0.78 ? pick(rng, HYDRO_PREFIXES) : pick(rng, LIGHT_FANTASY_PREFIXES);
      return makeUnique(used, "lake", `${prefix}${pick(rng, LAKE_SUFFIXES)}`, rng);
    },

    makeStateRoot(options = {}) {
      const rng = rngFor(seed, "state-root", options);
      const base = options.capitalName ? trimGeographicSuffix(options.capitalName) : "";
      const name = base && rng.next() < 0.58 ? base : this.makePlaceName({...options, type: "state", capital: true});
      return makeUnique(used, "state", trimStateForm(name), rng);
    },

    makeStateFormName(options = {}) {
      const rng = rngFor(seed, "state-form", options);
      const forms = STATE_FORMS[options.type] || STATE_FORMS.Generic;
      const tier = Math.max(0, Math.min(forms.length - 1, Math.floor(options.tier || 0)));
      return rng.next() < 0.72 ? forms[tier] || forms[0] : pick(rng, forms);
    },

    makeProvinceName(options = {}) {
      const rng = rngFor(seed, "province", options);
      const root = options.baseName && rng.next() < 0.55 ? trimStateForm(options.baseName) : this.makePlaceName({...options, type: "province"});
      const formName = PROVINCE_FORMS[(options.id || 0) % PROVINCE_FORMS.length];
      return {
        name: root,
        formName,
        fullName: `${root}${formName}`
      };
    },

    makeEmblem(options = {}) {
      const rng = rngFor(seed, "emblem", options);
      const field = FIELD_TINCTURES[Math.floor(rng.next() * FIELD_TINCTURES.length)];
      const chargeColor = METAL_TINCTURES[Math.floor(rng.next() * METAL_TINCTURES.length)];
      const charge = options.type === "Naval" ? "wave" : options.type === "River" ? "river" : options.type === "Highland" ? "mount" : pick(rng, CHARGES);
      return {
        size: options.kind === "state" ? 1.25 : options.capital ? 1.1 : 0.8,
        x: options.x === undefined ? null : round(options.x, 2),
        y: options.y === undefined ? null : round(options.y, 2),
        shield: pick(rng, SHIELDS),
        tinctures: {field, charge: chargeColor},
        charges: [{charge, tincture: chargeColor}]
      };
    }
  };
}

export function getStateFullName(name, formName) {
  if (!formName) return name;
  if (!name) return formName;
  if (name.endsWith(formName)) return name;
  return `${name}${formName}`;
}

function choosePlaceStyle(rng, options) {
  const special = options.capital || options.sacred || options.major || options.type === "lake" || options.type === "marker";
  const highRate = special ? 0.035 : 0.006;
  const lightRate = special ? 0.22 : options.port ? 0.14 : 0.09;
  const roll = rng.next();
  if (roll < highRate) return "high";
  if (roll < highRate + lightRate) return "light";
  return "real";
}

function getPlaceSuffixes(options) {
  if (options.port) return PORT_SUFFIXES;
  if (options.type === "river") return WATER_SUFFIXES;
  if (options.type === "lake") return LAKE_SUFFIXES;
  if (options.type === "Highland" || options.highland) return HIGHLAND_SUFFIXES;
  if (options.type === "Naval" || options.type === "Lake") return WATER_SUFFIXES;
  return LAND_SUFFIXES;
}

function rngFor(seed, scope, options) {
  return createRandom([seed, scope, options.id ?? "", options.cell ?? "", options.culture ?? "", options.state ?? "", options.type ?? ""].join(":"));
}

function makeUnique(used, scope, name, rng) {
  const key = `${scope}:${name}`;
  const count = used.get(key) || 0;
  used.set(key, count + 1);
  if (!count) return name;
  if (count <= DIRECTION_PREFIXES.length) return `${DIRECTION_PREFIXES[count - 1]}${name}`;
  return `${name}${toChineseOrdinal(count + 1)}`;
}

function trimGeographicSuffix(name) {
  return name.replace(/(城|镇|港|津|浦|湾|县|市|区|州|郡|府|道|领|司)$/u, "");
}

function trimStateForm(name) {
  return trimGeographicSuffix(name).replace(/(王国|公国|海国|山国|泽国|汗国|邦联|共和国|诸州|诸港|诸帐|部盟|邦|国)$/u, "");
}

function toChineseOrdinal(value) {
  const numerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (value <= 10) return numerals[value];
  return String(value);
}

function pick(rng, values) {
  return values[Math.floor(rng.next() * values.length)];
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
