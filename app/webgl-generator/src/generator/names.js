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
  "北岭",
  "临安",
  "永宁",
  "广陵",
  "武陵",
  "建宁",
  "宣城",
  "宜春",
  "长乐",
  "临海",
  "会稽",
  "余杭",
  "上虞",
  "句容",
  "曲沃",
  "平阳",
  "安平",
  "新丰",
  "武昌",
  "汉阳",
  "江夏",
  "巴陵",
  "零陵",
  "武安",
  "安邑",
  "晋阳",
  "平遥",
  "太原",
  "阳曲",
  "汾阳",
  "蒲津",
  "蓝田",
  "咸宁",
  "扶风",
  "武功",
  "金城",
  "临洮",
  "张掖",
  "酒泉",
  "敦煌",
  "姑臧",
  "番禺",
  "南海",
  "合浦",
  "苍梧",
  "桂阳",
  "始安",
  "建安",
  "邵陵",
  "庐陵",
  "豫章",
  "浔阳",
  "彭泽",
  "会昌",
  "临江",
  "广信",
  "建昌",
  "信安",
  "永嘉",
  "处州",
  "括苍",
  "缙云",
  "青田",
  "瑞安",
  "乐清",
  "东阳",
  "兰溪",
  "义乌",
  "浦阳",
  "海盐",
  "嘉禾",
  "吴兴",
  "毗陵",
  "京口",
  "丹徒",
  "江都",
  "海陵",
  "盱眙",
  "广德",
  "宣州",
  "歙州",
  "休宁",
  "黟县",
  "桐庐",
  "富春",
  "新昌",
  "剡溪",
  "余姚",
  "慈溪",
  "奉化",
  "定海",
  "象山",
  "临汾",
  "河东",
  "闻喜",
  "绛州",
  "曲阳",
  "常山",
  "真定",
  "邺城",
  "邯郸",
  "巨鹿",
  "清苑",
  "涿鹿",
  "范阳",
  "渔阳",
  "密云",
  "蓟州",
  "辽阳",
  "扶余",
  "玄菟",
  "乐浪",
  "龙城",
  "朔方",
  "云中",
  "五原",
  "雁门",
  "代郡",
  "马邑",
  "定襄",
  "上郡",
  "延安",
  "绥德",
  "榆林",
  "麟州",
  "银州",
  "怀远",
  "灵武",
  "西平",
  "湟中",
  "西宁",
  "河湟",
  "洮阳",
  "成纪",
  "天祝",
  "会宁"
];
const CHINESE_FIRST_CHARS = [
  "安", "永", "长", "临", "广", "清", "青", "云", "明", "昭", "建", "宣", "宁", "平", "武", "定",
  "宜", "嘉", "瑞", "景", "德", "兴", "昌", "丰", "新", "庆", "怀", "归", "望", "会", "开", "承",
  "金", "玉", "石", "铜", "银", "丹", "赤", "白", "苍", "玄", "素", "朱", "蓝", "翠", "松", "柏",
  "桂", "兰", "梅", "桑", "梧", "柳", "桃", "榆", "槐", "竹", "莲", "荆", "衡", "岳", "岱", "嵩",
  "岚", "岭", "峄", "崇", "峻", "灵", "龙", "凤", "麟", "雁", "鹤", "鹿", "星", "月", "晴", "雨",
  "霁", "霜", "寒", "春", "秋", "夏", "海", "江", "河", "湖", "泽", "溪", "浦", "津", "渡", "渚",
  "洛", "汾", "沅", "湘", "汉", "淮", "越", "吴", "楚", "秦", "晋", "燕", "赵", "梁", "蜀", "巴",
  "南", "北", "东", "西", "中", "上"
];
const CHINESE_SECOND_CHARS = [
  "安", "宁", "平", "阳", "阴", "陵", "丘", "原", "川", "州", "城", "都", "京", "郡", "府", "邑",
  "丰", "昌", "兴", "盛", "和", "嘉", "祥", "瑞", "德", "义", "信", "仁", "礼", "乐", "康", "泰",
  "源", "泉", "溪", "水", "江", "河", "湖", "泽", "浦", "津", "港", "湾", "渡", "渚", "沂", "汀",
  "山", "岭", "岳", "峰", "岑", "谷", "关", "隘", "台", "庭", "台", "楼", "亭", "门", "桥", "驿",
  "林", "森", "野", "田", "畴", "苑", "园", "坞", "寨", "集", "镇", "里", "坊", "墟", "圩", "埠",
  "云", "岚", "霞", "霄", "星", "月", "晖", "光", "明", "景", "春", "秋", "寒", "霜", "雨", "风",
  "玉", "金", "石", "铜", "丹", "朱", "玄", "青", "白", "苍", "松", "柏", "桂", "梧", "兰", "竹",
  "龙", "凤", "麟", "雁", "鹤", "鹿", "鱼", "梁", "津", "海"
];
const CHINESE_PORT_STEMS = [
  "南浦", "海津", "青港", "云渡", "月湾", "江浦", "临津", "松港", "白湾", "澄浦", "玉津", "东港",
  "西浦", "北津", "长湾", "清港", "安浦", "明津", "瑞港", "嘉湾", "临浦", "广津", "海门", "江都",
  "定海", "合浦", "海陵", "象山", "乐清", "瑞安", "番禺", "南海"
];
const REAL_PREFIXES = ["青", "清", "云", "白", "苍", "南", "北", "东", "西", "长", "安", "昭", "临", "平", "江", "河", "石", "松", "金", "玉"];
const HYDRO_PREFIXES = ["青", "清", "云", "白", "苍", "洛", "澄", "月", "星", "玉", "金", "龙", "灵", "玄", "镜", "寒", "秋", "明", "丹", "素"];
const LIGHT_FANTASY_PREFIXES = ["云", "青", "苍", "玄", "灵", "玉", "星", "月", "霜", "岚", "曜", "澜"];
const HIGH_FANTASY_STEMS = ["太微", "扶摇", "归墟", "烛龙", "昆吾", "瑶光"];
const WESTERN_PLACE_STEMS = [
  "阿尔文",
  "布伦",
  "卡斯特",
  "维斯特",
  "洛林",
  "赛伦",
  "格兰",
  "赫尔",
  "艾登",
  "诺维",
  "泰伦",
  "沃伦",
  "雷恩",
  "奥斯",
  "米兰",
  "兰德",
  "贝尔",
  "弗洛",
  "克莱",
  "温德"
];
const WESTERN_HYDRO_STEMS = ["艾文", "洛恩", "赛尔", "布兰", "维尔", "莱茵", "欧伦", "诺恩", "密尔", "赫伦", "卡恩", "阿斯"];
const NORTHERN_PLACE_STEMS = ["诺德", "斯卡尔", "弗罗斯", "乌尔夫", "霍尔姆", "冰湾", "霜谷", "洛克", "奥恩", "布约恩"];
const STEPPE_PLACE_STEMS = ["阿兰", "钦察", "乌勒", "巴彦", "呼伦", "塔尔", "阿尔泰", "斡尔", "苍帐", "金帐"];
const SOUTHERN_PLACE_STEMS = ["萨赫", "阿曼", "苏莱", "巴拉", "纳赛", "泽菲", "玛拉", "沙姆", "迦南", "金棕"];
const LAND_SUFFIXES = ["山", "岭", "川", "原", "谷", "陵", "泉", "城", "州", "阳", "阴", "泽"];
const WATER_SUFFIXES = ["溪", "水", "河", "江", "湖", "泽", "湾", "港", "浦", "津", "泊"];
const HIGHLAND_SUFFIXES = ["山", "岭", "岳", "峰", "陵", "关"];
const PORT_SUFFIXES = ["港", "津", "浦", "湾"];
const LAKE_SUFFIXES = ["湖", "泽", "泊", "潭", "海"];
const CULTURE_STYLE_CONFIG = {
  European: {place: WESTERN_PLACE_STEMS, hydro: WESTERN_HYDRO_STEMS, forms: ["国", "王朝", "诸州", "盟邦"], suffixes: ["堡", "顿", "维尔", "港", "城", "郡"]},
  Generic: null,
  Highland: {place: [...PLACE_STEMS, ...NORTHERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, "霜", "冰", "洛恩"], forms: ["山国", "山府", "岭盟"], suffixes: HIGHLAND_SUFFIXES},
  Naval: {place: [...PLACE_STEMS, ...WESTERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, ...WESTERN_HYDRO_STEMS], forms: ["海国", "诸港", "海盟", "水府"], suffixes: PORT_SUFFIXES},
  Lake: {place: [...PLACE_STEMS, ...WESTERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, ...WESTERN_HYDRO_STEMS], forms: ["泽国", "湖州", "水府"], suffixes: WATER_SUFFIXES},
  Nomadic: {place: STEPPE_PLACE_STEMS, hydro: ["乌勒", "呼伦", "阿兰", "苍", "金", "青"], forms: ["汗国", "部盟", "诸帐"], suffixes: ["原", "帐", "河", "岭", "城"]},
  Hunting: {place: [...PLACE_STEMS, ...NORTHERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, "森", "鹿", "霜"], forms: ["林国", "诸部", "林盟"], suffixes: ["林", "谷", "岭", "泉", "城"]},
  River: {place: [...PLACE_STEMS, ...WESTERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, ...WESTERN_HYDRO_STEMS], forms: ["河国", "河府", "诸州"], suffixes: WATER_SUFFIXES},
  Desert: {place: SOUTHERN_PLACE_STEMS, hydro: ["萨赫", "阿曼", "纳赛", "金", "赤", "白"], forms: ["沙国", "诸城", "绿洲盟"], suffixes: ["城", "绿洲", "港", "河", "原"]}
};
const STATE_FORMS = {
  Naval: ["海国", "诸港", "海盟", "水府"],
  Lake: ["泽国", "湖州", "水府"],
  Highland: ["山国", "山府", "岭盟"],
  River: ["河国", "河府", "诸州"],
  Nomadic: ["汗国", "部盟", "诸帐"],
  Hunting: ["林国", "诸部", "林盟"],
  Generic: ["国", "邦", "王朝", "盟", "诸州"]
};
const PROVINCE_FORMS = ["郡", "州", "道", "府", "领", "司"];
const DIRECTION_PREFIXES = ["东", "西", "南", "北", "上", "下", "新", "古"];
const SMALL_SETTLEMENT_PREFIXES = ["新", "旧", "上", "下", "东", "西", "南", "北", "小", "前", "后"];
const SMALL_SETTLEMENT_SUFFIXES = ["镇", "集", "寨", "村", "渡", "铺", "驿", "坞", "埠", "圩"];
const SHIELDS = ["heater", "kite", "round", "horsehead", "banner"];
const CHARGES = ["mount", "river", "star", "gate", "wave", "tree", "tower", "sun", "moon", "bridge"];
const FIELD_TINCTURES = ["#b94b4b", "#3d6f9e", "#4f7f52", "#a47a35", "#6e579b", "#9a9a70", "#3e7b7d", "#704f38"];
const METAL_TINCTURES = ["#f0d889", "#e8e4d6", "#d8b56d", "#f3efe1"];

export function createChineseNameGenerator(seed = "map") {
  const used = new Map();

  return {
    makePlaceName(options = {}) {
      const rng = rngFor(seed, "place", options);
      const makeCandidate = () => {
        const style = choosePlaceStyle(rng, options);
        const transliterationStyle = getTransliterationStyle(options);
        const cultureStyle = getCultureStyle(options);
        const suffixes = getPlaceSuffixes(options, cultureStyle);
        let name;

        if (transliterationStyle?.place) name = combineStemAndSuffix(pick(rng, transliterationStyle.place), pick(rng, suffixes));
        else if (style === "real") name = makeChinesePlaceName(rng, options, suffixes);
        else if (style === "light") name = makeChineseLightPlaceName(rng, options, suffixes);
        else name = pick(rng, HIGH_FANTASY_STEMS);

        if (options.port && transliterationStyle?.place && !PORT_SUFFIXES.some(suffix => name.endsWith(suffix))) name = trimGeographicSuffix(name) + pick(rng, PORT_SUFFIXES);
        return name;
      };

      const attempts = getSettlementScale(options) === "large" ? 48 : 20;
      return makeUniqueGenerated(used, "place", makeCandidate(), rng, makeCandidate, attempts);
    },

    makeRiverName(options = {}) {
      const rng = rngFor(seed, "river", options);
      const cultureStyle = getCultureStyle(options);
      const hydro = cultureStyle?.hydro || HYDRO_PREFIXES;
      const prefix = cultureStyle?.hydro && hasExplicitCultureStyle(options) ? pick(rng, hydro) : rng.next() < 0.82 ? pick(rng, hydro) : pick(rng, LIGHT_FANTASY_PREFIXES);
      return makeUnique(used, "river", `${prefix}${pick(rng, ["溪", "水", "河", "江", "川"])}`, rng);
    },

    makeLakeName(options = {}) {
      const rng = rngFor(seed, "lake", options);
      const cultureStyle = getCultureStyle(options);
      const hydro = cultureStyle?.hydro || HYDRO_PREFIXES;
      const prefix = cultureStyle?.hydro && hasExplicitCultureStyle(options) ? pick(rng, hydro) : rng.next() < 0.78 ? pick(rng, hydro) : pick(rng, LIGHT_FANTASY_PREFIXES);
      return makeUnique(used, "lake", `${prefix}${pick(rng, LAKE_SUFFIXES)}`, rng);
    },

    makeStateRoot(options = {}) {
      const rng = rngFor(seed, "state-root", options);
      const capitalRoot = normalizeNameRoot(options.capitalName);
      const allowCapitalName = Boolean(options.allowCapitalName);
      const generate = () => makeStateRootCandidateAvoiding(rng, options, allowCapitalName ? "" : capitalRoot);
      const initialName = allowCapitalName && capitalRoot && rng.next() < 0.28 ? capitalRoot : generate();
      return makeUniqueGenerated(used, "state", initialName, rng, generate, 32);
    },

    makeStateFormName(options = {}) {
      const rng = rngFor(seed, "state-form", options);
      const forms = getCultureStyle(options)?.forms || STATE_FORMS[options.type] || STATE_FORMS.Generic;
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

function makeChinesePlaceName(rng, options, suffixes) {
  const scale = getSettlementScale(options);
  if (options.port) return makeChinesePortName(rng, scale, suffixes);

  const twoCharRate = scale === "large" ? 0.985 : scale === "medium" ? 0.88 : 0.72;
  const roll = rng.next();
  if (roll < twoCharRate) return makeChineseTwoCharName(rng);

  const base = makeChineseTwoCharName(rng);
  if (scale === "large" || roll < twoCharRate + 0.23) return `${base}${pickSmallSettlementSuffix(rng, suffixes)}`;

  const prefix = pick(rng, SMALL_SETTLEMENT_PREFIXES);
  return rng.next() < 0.55 ? `${prefix}${base}` : `${prefix}${base}${pick(rng, SMALL_SETTLEMENT_SUFFIXES)}`;
}

function makeChineseLightPlaceName(rng, options, suffixes) {
  const scale = getSettlementScale(options);
  if (scale === "large" || rng.next() < 0.78) return `${pick(rng, LIGHT_FANTASY_PREFIXES)}${pick(rng, CHINESE_SECOND_CHARS)}`;
  return `${pick(rng, LIGHT_FANTASY_PREFIXES)}${pickSmallSettlementSuffix(rng, suffixes)}`;
}

function makeChinesePortName(rng, scale, suffixes) {
  if (scale === "large" || rng.next() < 0.82) return pick(rng, CHINESE_PORT_STEMS);
  return `${makeChineseTwoCharName(rng)}${pick(rng, suffixes)}`;
}

function makeChineseTwoCharName(rng) {
  if (rng.next() < 0.46) return pick(rng, PLACE_STEMS);

  const first = pick(rng, CHINESE_FIRST_CHARS);
  let second = pick(rng, CHINESE_SECOND_CHARS);
  if (first === second) second = pick(rng, CHINESE_SECOND_CHARS);
  return `${first}${second}`;
}

function makeStateRootCandidate(rng, options = {}) {
  const transliterationStyle = getTransliterationStyle(options);
  if (transliterationStyle?.place) return pick(rng, transliterationStyle.place);

  const cultureStyle = getCultureStyle(options);
  if (cultureStyle?.place && hasExplicitCultureStyle(options) && rng.next() < 0.82) return pick(rng, cultureStyle.place);

  const roll = rng.next();
  if (roll < 0.62) return makeChineseTwoCharName(rng);
  if (roll < 0.84) return pick(rng, PLACE_STEMS);
  if (roll < 0.96) return `${pick(rng, LIGHT_FANTASY_PREFIXES)}${pick(rng, CHINESE_SECOND_CHARS)}`;
  return pick(rng, HIGH_FANTASY_STEMS);
}

function makeStateRootCandidateAvoiding(rng, options = {}, avoidedRoot = "") {
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = cleanStateRootCandidate(makeStateRootCandidate(rng, options));
    if (candidate && !hasSameNameRoot(candidate, avoidedRoot)) return candidate;
  }

  return makeChineseTwoCharName(rng);
}

function getSettlementScale(options = {}) {
  if (options.capital || options.provincial || options.major || options.group === "capital" || options.group === "city" || (options.population || 0) >= 5) return "large";
  if (options.group === "town" || (options.population || 0) >= 1) return "medium";
  return "small";
}

function pickSmallSettlementSuffix(rng, suffixes) {
  const localSuffixes = suffixes?.length ? suffixes : LAND_SUFFIXES;
  return rng.next() < 0.62 ? pick(rng, SMALL_SETTLEMENT_SUFFIXES) : pick(rng, localSuffixes);
}

function getPlaceSuffixes(options, cultureStyle = null) {
  if (options.port) return PORT_SUFFIXES;
  if (cultureStyle?.suffixes) return cultureStyle.suffixes;
  if (options.type === "river") return WATER_SUFFIXES;
  if (options.type === "lake") return LAKE_SUFFIXES;
  if (options.type === "Highland" || options.highland) return HIGHLAND_SUFFIXES;
  if (options.type === "Naval" || options.type === "Lake") return WATER_SUFFIXES;
  return LAND_SUFFIXES;
}

function rngFor(seed, scope, options) {
  return createRandom([seed, scope, options.id ?? "", options.cell ?? "", options.culture ?? "", options.cultureType ?? "", options.state ?? "", options.type ?? ""].join(":"));
}

function getCultureStyle(options = {}) {
  const style = cultureStyleFor(options.cultureType) || cultureStyleFor(options.nameStyle);
  if (style) return style;
  return cultureStyleFor(options.type);
}

function getTransliterationStyle(options = {}) {
  const explicit = options.nameStyle || options.cultureNameStyle;
  return transliterationStyleFor(explicit);
}

function hasExplicitCultureStyle(options = {}) {
  return Boolean(options.cultureType || options.nameStyle);
}

function transliterationStyleFor(type) {
  if (!type) return null;
  if (/europe|western|english|西方|音译/i.test(type)) return CULTURE_STYLE_CONFIG.European;
  return null;
}

function cultureStyleFor(type) {
  if (!type) return null;
  if (CULTURE_STYLE_CONFIG[type]) return CULTURE_STYLE_CONFIG[type];
  if (/europe|western|english|西方/i.test(type)) return CULTURE_STYLE_CONFIG.European;
  if (/nomad|游牧/i.test(type)) return CULTURE_STYLE_CONFIG.Nomadic;
  if (/desert|沙漠/i.test(type)) return CULTURE_STYLE_CONFIG.Desert;
  return null;
}

function makeUnique(used, scope, name, rng) {
  const key = `${scope}:${name}`;
  const count = used.get(key) || 0;
  used.set(key, count + 1);
  if (!count) return name;
  if (count <= DIRECTION_PREFIXES.length) return `${DIRECTION_PREFIXES[count - 1]}${name}`;
  return `${name}${toChineseOrdinal(count + 1)}`;
}

function makeUniqueGenerated(used, scope, initialName, rng, generate, attempts) {
  let name = initialName;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    const key = `${scope}:${name}`;
    if (!used.has(key)) {
      used.set(key, 1);
      return name;
    }
    name = generate();
  }
  return makeUnique(used, scope, initialName, rng);
}

function trimGeographicSuffix(name) {
  return String(name || "").replace(/(城|镇|港|津|浦|湾|县|市|区|州|郡|府|道|领|司)$/u, "");
}

function hasGeographicSuffix(name) {
  return /(城|镇|港|津|浦|湾|县|市|区|州|郡|府|道|领|司)$/u.test(String(name || ""));
}

function trimPoliticalForm(name) {
  return String(name || "").replace(/(王国|公国|海国|山国|泽国|汗国|邦联|共和国|诸州|诸港|诸帐|部盟|邦|国)$/u, "");
}

function combineStemAndSuffix(stem, suffix) {
  if (!suffix || stem.endsWith(suffix)) return stem;
  return `${stem}${suffix}`;
}

function trimStateForm(name) {
  return trimGeographicSuffix(trimPoliticalForm(name));
}

function cleanStateRootCandidate(name) {
  const rawRoot = trimPoliticalForm(name).replace(/\s+/g, "");
  const trimmedRoot = trimStateForm(name).replace(/\s+/g, "");
  if (Array.from(trimmedRoot).length >= 2) return trimmedRoot;
  if (Array.from(rawRoot).length >= 2 && !hasGeographicSuffix(rawRoot)) return rawRoot;
  return "";
}

function normalizeNameRoot(name) {
  return trimStateForm(name).replace(/\s+/g, "");
}

function hasSameNameRoot(left, right) {
  const leftRoot = normalizeNameRoot(left);
  const rightRoot = normalizeNameRoot(right);
  return Boolean(leftRoot && rightRoot && leftRoot === rightRoot);
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
