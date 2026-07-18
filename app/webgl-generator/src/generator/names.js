import {createRandom} from "./random.js";
import {K170_BURG_NAMES} from "./namebase-k170-burgs.js";
import {CHINESE_PROVINCE_NAMES} from "./namebase-chinese-provinces.js";

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
const ANCIENT_STATE_ROOTS = [
  "齐", "晋", "秦", "楚", "鲁", "宋", "卫", "郑", "陈", "蔡", "曹", "燕", "吴", "越", "许", "虢",
  "虞", "邾", "莒", "郯", "薛", "滕", "邢", "滑", "息", "赖", "邓", "随", "唐", "贾", "芮", "梁",
  "黄", "江", "沈", "胡", "顿", "徐", "巴", "蜀", "韩", "赵", "魏", "代", "岐", "雍", "荆", "庸",
  "苴", "濮", "奄", "邶", "鄘", "申", "吕", "焦", "夔", "葛", "任", "宿", "谭", "莱", "牟",
  "费", "缯", "郧", "罗", "绞", "麇", "单", "舒", "曾", "鄫", "鄣", "鄀", "鄂", "轸", "邿",
  "郕", "弦", "遂", "鄅", "鄟", "邳", "祝", "铸", "根牟", "须句", "逼阳", "钟吾",
  "舒庸", "舒蓼", "舒鸠", "舒龙", "舒鲍", "舒龚"
];
const ANCIENT_STATE_COMPOUND_ROOTS = [
  "东晋", "西凉", "南越", "北燕", "后赵", "前秦", "西蜀", "东吴", "南楚", "北齐", "西秦", "后梁",
  "前燕", "南唐", "北汉", "东越", "西戎", "南陈", "北魏", "后蜀"
];
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
const COMMON_LAKE_SUFFIXES = ["湖", "湖", "湖", "湖", "湖", "湖", "湖", "泽", "泊", "潭", "海"];
const CULTURE_STYLE_CONFIG = {
  European: {place: WESTERN_PLACE_STEMS, hydro: WESTERN_HYDRO_STEMS, forms: ["国", "王国", "共和国", "帝国"], suffixes: ["堡", "顿", "维尔", "港", "城", "郡"]},
  Generic: null,
  Highland: {place: [...PLACE_STEMS, ...NORTHERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, "霜", "冰", "洛恩"], forms: ["山国", "王国", "部盟", "帝国"], suffixes: HIGHLAND_SUFFIXES},
  Naval: {place: [...PLACE_STEMS, ...WESTERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, ...WESTERN_HYDRO_STEMS], forms: ["海国", "王国", "共和国", "帝国"], suffixes: PORT_SUFFIXES},
  Lake: {place: [...PLACE_STEMS, ...WESTERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, ...WESTERN_HYDRO_STEMS], forms: ["泽国", "王国", "联邦", "帝国"], suffixes: WATER_SUFFIXES},
  Nomadic: {place: STEPPE_PLACE_STEMS, hydro: ["乌勒", "呼伦", "阿兰", "苍", "金", "青"], forms: ["汗国", "部盟", "王国", "帝国"], suffixes: ["原", "帐", "河", "岭", "城"]},
  Hunting: {place: [...PLACE_STEMS, ...NORTHERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, "森", "鹿", "霜"], forms: ["林国", "部盟", "王国", "帝国"], suffixes: ["林", "谷", "岭", "泉", "城"]},
  River: {place: [...PLACE_STEMS, ...WESTERN_PLACE_STEMS], hydro: [...HYDRO_PREFIXES, ...WESTERN_HYDRO_STEMS], forms: ["河国", "王国", "共和国", "帝国"], suffixes: WATER_SUFFIXES},
  Desert: {place: SOUTHERN_PLACE_STEMS, hydro: ["萨赫", "阿曼", "纳赛", "金", "赤", "白"], forms: ["沙国", "王国", "教国", "帝国"], suffixes: ["城", "绿洲", "港", "河", "原"]}
};
const STATE_FORMS = {
  Naval: ["海国", "王国", "共和国", "帝国"],
  Lake: ["泽国", "王国", "联邦", "帝国"],
  Highland: ["山国", "王国", "部盟", "帝国"],
  River: ["河国", "王国", "共和国", "帝国"],
  Nomadic: ["汗国", "部盟", "诸帐"],
  Hunting: ["林国", "诸部", "林盟"],
  Generic: ["国", "王国", "共和国", "帝国"]
};
const PROVINCE_FORMS = ["郡", "州", "道", "府", "领", "司"];
const DIRECTION_PREFIXES = ["东", "西", "南", "北", "上", "下", "新", "古"];
const STATE_VARIANT_PREFIXES = ["东", "西", "南", "北", "前", "后", "新", "古"];
const CARDINAL_PREFIXES = new Set(["东", "西", "南", "北"]);
const NON_CARDINAL_VARIANT_PREFIXES = ["新", "古", "上", "下"];
const ANCIENT_STATE_CLUSTER_PREFIXES = ["舒"];
const STATE_ROOT_FAMILY_ALIASES = new Map([
  ["曾", "鄫"],
  ["缯", "鄫"],
  ["谭", "郯"]
]);
const SMALL_SETTLEMENT_PREFIXES = ["新", "旧", "上", "下", "东", "西", "南", "北", "小", "前", "后"];
const SMALL_SETTLEMENT_SUFFIXES = ["镇", "集", "寨", "村", "渡", "铺", "驿", "坞", "埠", "圩"];
const SHIELDS = ["heater", "kite", "round", "horsehead", "banner"];
const CHARGES = ["mount", "river", "star", "gate", "wave", "tree", "tower", "sun", "moon", "bridge"];
const FIELD_TINCTURES = ["#b94b4b", "#3d6f9e", "#4f7f52", "#a47a35", "#6e579b", "#9a9a70", "#3e7b7d", "#704f38"];
const METAL_TINCTURES = ["#f0d889", "#e8e4d6", "#d8b56d", "#f3efe1"];
const HYDRO_NAME_SUFFIXES = [...new Set([...WATER_SUFFIXES, ...LAKE_SUFFIXES, "溪", "水", "河", "江", "川"])];
const EMPTY_NAMEBASE_SOURCE = Object.freeze({records: [], chain: null, minLength: 1, maxLength: 8, duplicateChars: "", multiwordRate: 0});
const K170_BURG_NAMEBASE = Object.freeze({source: K170_BURG_NAMES, minLength: 1, maxLength: 6});
const BUILTIN_NAMEBASE_ENTRY_CACHE = new Map();

const BUILTIN_NAMEBASE_SOURCES = {
  "ancient-state-roots": ANCIENT_STATE_ROOTS,
  "ancient-state-compounds": ANCIENT_STATE_COMPOUND_ROOTS,
  "state-forms-generic": STATE_FORMS.Generic,
  "state-forms-naval": STATE_FORMS.Naval,
  "state-forms-lake": STATE_FORMS.Lake,
  "state-forms-highland": STATE_FORMS.Highland,
  "state-forms-river": STATE_FORMS.River,
  "state-forms-nomadic": STATE_FORMS.Nomadic,
  "state-forms-hunting": STATE_FORMS.Hunting,
  "state-forms-desert": STATE_FORMS.Desert,
  "place-stems": PLACE_STEMS,
  "province-stems": CHINESE_PROVINCE_NAMES,
  "k170-burg-names": K170_BURG_NAMEBASE,
  "chinese-first-chars": CHINESE_FIRST_CHARS,
  "chinese-second-chars": CHINESE_SECOND_CHARS,
  "port-stems": CHINESE_PORT_STEMS,
  "hydro-prefixes": HYDRO_PREFIXES,
  "light-fantasy-prefixes": LIGHT_FANTASY_PREFIXES,
  "high-fantasy-stems": HIGH_FANTASY_STEMS,
  "land-suffixes": LAND_SUFFIXES,
  "water-suffixes": WATER_SUFFIXES,
  "highland-suffixes": HIGHLAND_SUFFIXES,
  "port-suffixes": PORT_SUFFIXES,
  "lake-suffixes": LAKE_SUFFIXES,
  "small-settlement-prefixes": SMALL_SETTLEMENT_PREFIXES,
  "western-place-stems": WESTERN_PLACE_STEMS,
  "western-hydro-stems": WESTERN_HYDRO_STEMS,
  "northern-place-stems": NORTHERN_PLACE_STEMS,
  "steppe-place-stems": STEPPE_PLACE_STEMS,
  "southern-place-stems": SOUTHERN_PLACE_STEMS
};

for (const [style, config] of Object.entries(CULTURE_STYLE_CONFIG)) {
  if (!config) continue;
  BUILTIN_NAMEBASE_SOURCES[`culture-${style.toLowerCase()}-place`] = config.place || [];
  BUILTIN_NAMEBASE_SOURCES[`culture-${style.toLowerCase()}-hydro`] = config.hydro || [];
}

export function createChineseNameGenerator(seed = "map", context = {}) {
  const used = new Map();
  reserveGeneratedNames(used, "province", context?.provinceNames);
  const namebaseSources = resolveNamebaseSources(context?.namebases || context);

  return {
    makePlaceName(options = {}) {
      const rng = rngFor(seed, "place", options);
      const boundPlaceSource = namebaseSources.sourceFor("place", options);
      const makeCandidate = () => {
        const style = choosePlaceStyle(rng, options);
        const transliterationStyle = getTransliterationStyle(options);
        const cultureStyle = getCultureStyle(options);
        const suffixes = getPlaceSuffixes(options, cultureStyle);
        let name;

        if (boundPlaceSource.records.length) name = makeBoundPlaceName(rng, boundPlaceSource, options, suffixes);
        else if (transliterationStyle?.place) name = combineStemAndSuffix(pick(rng, transliterationStyle.place), pick(rng, suffixes));
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
      const boundHydroSource = namebaseSources.sourceFor("hydro", options);
      const hydro = cultureStyle?.hydro || HYDRO_PREFIXES;
      const prefix = boundHydroSource.records.length
        ? generateNamebaseCandidate(rng, boundHydroSource, {maxLength: 5})
        : cultureStyle?.hydro && hasExplicitCultureStyle(options) ? pick(rng, hydro) : rng.next() < 0.82 ? pick(rng, hydro) : pick(rng, LIGHT_FANTASY_PREFIXES);
      return makeUnique(used, "river", makeHydroName(prefix, rng, ["溪", "水", "河", "江", "川"]), rng);
    },

    makeLakeName(options = {}) {
      const rng = rngFor(seed, "lake", options);
      const cultureStyle = getCultureStyle(options);
      const boundHydroSource = namebaseSources.sourceFor("hydro", options);
      const hydro = cultureStyle?.hydro || HYDRO_PREFIXES;
      const prefix = boundHydroSource.records.length
        ? generateNamebaseCandidate(rng, boundHydroSource, {maxLength: 5})
        : cultureStyle?.hydro && hasExplicitCultureStyle(options) ? pick(rng, hydro) : rng.next() < 0.78 ? pick(rng, hydro) : pick(rng, LIGHT_FANTASY_PREFIXES);
      const suffixes = options.preferCommonSuffix ? COMMON_LAKE_SUFFIXES : LAKE_SUFFIXES;
      return makeUnique(used, "lake", makeHydroName(prefix, rng, suffixes), rng);
    },

    makeStateRoot(options = {}) {
      const rng = rngFor(seed, "state-root", options);
      const boundStateRootSource = namebaseSources.sourceFor("stateRoot", options);
      const capitalRoot = normalizeNameRoot(options.capitalName);
      const cultureRoot = cleanStateRootCandidate(options.cultureRoot);
      const allowCapitalName = Boolean(options.allowCapitalName);
      const generate = () => boundStateRootSource.records.length
        ? makeBoundStateRootCandidateAvoiding(rng, boundStateRootSource, allowCapitalName ? "" : capitalRoot)
        : makeStateRootCandidateAvoiding(rng, options, allowCapitalName ? "" : capitalRoot);
      if (!boundStateRootSource.records.length && cultureRoot && rng.next() < 0.24 && claimStateRoot(used, cultureRoot)) return cultureRoot;
      const initialName = allowCapitalName && capitalRoot && rng.next() < 0.28 ? capitalRoot : generate();
      return makeUniqueStateGenerated(used, initialName, rng, generate, 96);
    },

    makeStateFormName(options = {}) {
      const rng = rngFor(seed, "state-form", options);
      const forms = options.ancientRoot ? STATE_FORMS.Generic : getCultureStyle(options)?.forms || STATE_FORMS[options.type] || STATE_FORMS.Generic;
      const tier = Math.max(0, Math.min(forms.length - 1, Math.floor(options.tier || 0)));
      return rng.next() < 0.72 ? forms[tier] || forms[0] : pick(rng, forms);
    },

    makeProvinceName(options = {}) {
      const rng = rngFor(seed, "province", options);
      const boundPlaceSource = namebaseSources.sourceFor("place", options);
      const makePrimaryCandidate = () => this.makePlaceName({...options, type: "province"});
      const makeCollisionCandidate = () => shouldUseChineseProvinceFallback(options, boundPlaceSource)
        ? pick(rng, CHINESE_PROVINCE_NAMES)
        : makePrimaryCandidate();
      const baseRoot = trimStateForm(options.baseName);
      const initialRoot = baseRoot && rng.next() < 0.55 ? baseRoot : makePrimaryCandidate();
      const root = makeUniqueGenerated(used, "province", initialRoot, rng, makeCollisionCandidate, 128);
      const formName = PROVINCE_FORMS[(options.id || 0) % PROVINCE_FORMS.length];
      return {
        name: root,
        formName,
        fullName: `${root}${formName}`
      };
    },

    makeCultureName(options = {}) {
      const rng = rngFor(seed, "culture", options);
      const boundSource = namebaseSources.sourceFor("culture", options);
      const root = boundSource.records.length
        ? generateNamebaseCandidate(rng, boundSource, {maxLength: 6})
        : this.makePlaceName({...options, type: "culture"});
      if (!root) return `新文化${options.id || ""}`;
      return root.endsWith("文化") ? root : `${root}文化`;
    },

    makeReligionName(options = {}) {
      const rng = rngFor(seed, "religion", options);
      const boundSource = namebaseSources.sourceFor("religion", options);
      const root = boundSource.records.length
        ? generateNamebaseCandidate(rng, boundSource, {maxLength: 6})
        : this.makePlaceName({...options, type: "religion"});
      if (!root) return `新宗教${options.id || ""}`;
      if (/(?:教|信仰|圣会|正道)$/u.test(root)) return root;
      return `${root}${options.form || "教"}`;
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
    },

    getNamebaseUsage() {
      return namebaseSources.usage;
    }
  };
}

export function getStateFullName(name, formName) {
  if (!formName) return name;
  if (!name) return formName;
  if (name.endsWith(formName)) return name;
  return `${name}${formName}`;
}

export function getBuiltinNamebaseSummaries({includeSource = false} = {}) {
  const baseRows = [
    analyzeNamebase("ancient-state-roots", "春秋古国根名", "state-root", "国家根名", ANCIENT_STATE_ROOTS, "国家短根名，参与 state-family 去重", {includeSource}),
    analyzeNamebase("ancient-state-compounds", "古国复合根名", "state-root", "国家根名", ANCIENT_STATE_COMPOUND_ROOTS, "低概率补充，用于东晋、南越一类国名", {includeSource}),
    analyzeNamebase("state-forms-generic", "通用国家形制", "state-form", "国家形制", STATE_FORMS.Generic, "古国根名优先使用这组形制", {includeSource}),
    analyzeNamebase("state-forms-naval", "海洋国家形制", "state-form", "国家形制", STATE_FORMS.Naval, "非古国根名的海洋文化国家形制", {includeSource}),
    analyzeNamebase("state-forms-lake", "湖泽国家形制", "state-form", "国家形制", STATE_FORMS.Lake, "非古国根名的湖泽文化国家形制", {includeSource}),
    analyzeNamebase("state-forms-highland", "山地国家形制", "state-form", "国家形制", STATE_FORMS.Highland, "非古国根名的山地文化国家形制", {includeSource}),
    analyzeNamebase("state-forms-river", "河流国家形制", "state-form", "国家形制", STATE_FORMS.River, "非古国根名的河流文化国家形制", {includeSource}),
    analyzeNamebase("state-forms-nomadic", "游牧国家形制", "state-form", "国家形制", STATE_FORMS.Nomadic, "游牧文化国家形制", {includeSource}),
    analyzeNamebase("state-forms-hunting", "林猎国家形制", "state-form", "国家形制", STATE_FORMS.Hunting, "林猎文化国家形制", {includeSource}),
    analyzeNamebase("province-forms", "省份形制", "province-form", "政区形制", PROVINCE_FORMS, "省份、州郡和地方行政名称后缀", {includeSource}),
    analyzeNamebase("place-stems", "中文地名词干", "place", "城镇地名", PLACE_STEMS, "主要城镇、地域和标签命名来源", {includeSource}),
    analyzeNamebase("province-stems", "中文省份备用根名", "province", "政区名称", CHINESE_PROVINCE_NAMES, "省份根名去重失败时使用的确定性中文备用库", {includeSource}),
    analyzeNamebase("k170-burg-names", "K170 原版城镇名", "place", "城镇地名", K170_BURG_NAMES, "从用户原版 FMG Burgs CSV 提取的城镇名备选库，保留重复样本权重", {includeSource, options: K170_BURG_NAMEBASE}),
    analyzeNamebase("chinese-first-chars", "中文首字词素", "place-part", "城镇地名", CHINESE_FIRST_CHARS, "二字地名组合首字池", {includeSource}),
    analyzeNamebase("chinese-second-chars", "中文尾字词素", "place-part", "城镇地名", CHINESE_SECOND_CHARS, "二字地名组合尾字池", {includeSource}),
    analyzeNamebase("port-stems", "港口地名", "place", "城镇地名", CHINESE_PORT_STEMS, "港镇和近海城市优先词池", {includeSource}),
    analyzeNamebase("hydro-prefixes", "中文水文词根", "hydro", "水文名称", HYDRO_PREFIXES, "河流、湖泊名称前缀", {includeSource}),
    analyzeNamebase("light-fantasy-prefixes", "轻幻想词根", "place-part", "幻想名称", LIGHT_FANTASY_PREFIXES, "少量混入城镇、水文和国家兜底命名", {includeSource}),
    analyzeNamebase("high-fantasy-stems", "高幻想词干", "place", "幻想名称", HIGH_FANTASY_STEMS, "极低概率特殊名称", {includeSource}),
    analyzeNamebase("land-suffixes", "陆地后缀", "suffix", "地貌后缀", LAND_SUFFIXES, "普通地名后缀", {includeSource}),
    analyzeNamebase("water-suffixes", "水文后缀", "suffix", "地貌后缀", WATER_SUFFIXES, "水域、河湖和临水地名后缀", {includeSource}),
    analyzeNamebase("highland-suffixes", "山地后缀", "suffix", "地貌后缀", HIGHLAND_SUFFIXES, "山地文化和高地地名后缀", {includeSource}),
    analyzeNamebase("port-suffixes", "港口后缀", "suffix", "地貌后缀", PORT_SUFFIXES, "港镇地名后缀", {includeSource}),
    analyzeNamebase("lake-suffixes", "湖泊后缀", "suffix", "地貌后缀", LAKE_SUFFIXES, "湖泊名称后缀", {includeSource}),
    analyzeNamebase("small-settlement-prefixes", "小聚落前缀", "place-part", "聚落细分", SMALL_SETTLEMENT_PREFIXES, "小镇、村寨和渡口名称前缀", {includeSource}),
    analyzeNamebase("small-settlement-suffixes", "小聚落后缀", "suffix", "聚落细分", SMALL_SETTLEMENT_SUFFIXES, "小镇、村寨和渡口名称后缀", {includeSource}),
    analyzeNamebase("western-place-stems", "西式地名词干", "place", "文化风格", WESTERN_PLACE_STEMS, "音译或欧洲风文化地名", {includeSource}),
    analyzeNamebase("western-hydro-stems", "西式水文词干", "hydro", "文化风格", WESTERN_HYDRO_STEMS, "音译或欧洲风水文名称", {includeSource}),
    analyzeNamebase("northern-place-stems", "北境地名词干", "place", "文化风格", NORTHERN_PLACE_STEMS, "北境、山地、寒冷文化地名", {includeSource}),
    analyzeNamebase("steppe-place-stems", "草原地名词干", "place", "文化风格", STEPPE_PLACE_STEMS, "游牧文化地名", {includeSource}),
    analyzeNamebase("southern-place-stems", "南方沙漠词干", "place", "文化风格", SOUTHERN_PLACE_STEMS, "沙漠、热带和南方文化地名", {includeSource})
  ];

  const cultureRows = Object.entries(CULTURE_STYLE_CONFIG)
    .filter(([, config]) => config)
    .flatMap(([style, config]) => [
      analyzeNamebase(`culture-${style.toLowerCase()}-place`, `${cultureStyleLabel(style)}地名`, "place", "文化风格", config.place || [], `${cultureStyleLabel(style)}文化 place 词池`, {includeSource}),
      analyzeNamebase(`culture-${style.toLowerCase()}-hydro`, `${cultureStyleLabel(style)}水文`, "hydro", "文化风格", config.hydro || [], `${cultureStyleLabel(style)}文化 hydro 词池`, {includeSource}),
      analyzeNamebase(`culture-${style.toLowerCase()}-forms`, `${cultureStyleLabel(style)}形制`, "state-form", "文化风格", config.forms || [], `${cultureStyleLabel(style)}文化国家形制`, {includeSource}),
      analyzeNamebase(`culture-${style.toLowerCase()}-suffixes`, `${cultureStyleLabel(style)}后缀`, "suffix", "文化风格", config.suffixes || [], `${cultureStyleLabel(style)}文化地名后缀`, {includeSource})
    ]);

  return [...baseRows, ...cultureRows].map((row, index) => ({...row, index}));
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

function resolveNamebaseSources(namebases) {
  const bindings = namebases?.bindings && typeof namebases.bindings === "object" ? namebases.bindings : {};
  const globalBindings = bindings.global && typeof bindings.global === "object" ? bindings.global : {};
  const cultureBindings = bindings.cultures && typeof bindings.cultures === "object" ? bindings.cultures : {};
  const rows = new Map();
  for (const base of namebases?.bases || []) {
    const id = String(base?.id || "").trim();
    if (!id) continue;
    const source = createNamebaseSourceEntry(base);
    if (source.records.length) rows.set(id, source);
  }
  const stateRootId = String(globalBindings.stateRoot || "").trim();
  const placeId = String(globalBindings.place || "").trim();
  const hydroId = String(globalBindings.hydro || "").trim();
  const hasSource = id => rows.has(id) || Object.hasOwn(BUILTIN_NAMEBASE_SOURCES, id);
  const resolveSource = id => rows.get(id) || getBuiltinNamebaseSourceEntry(id);
  const sourceFor = (target, options = {}) => {
    const cultureId = String(options.culture ?? options.cultureId ?? "").trim();
    const culture = cultureId && cultureBindings[cultureId] && typeof cultureBindings[cultureId] === "object" ? cultureBindings[cultureId] : null;
    const cultureValue = String(culture?.[target] || "").trim();
    if (cultureValue) return resolveSource(cultureValue);
    const globalValue = String(globalBindings[target] || "").trim();
    return globalValue ? resolveSource(globalValue) : EMPTY_NAMEBASE_SOURCE;
  };
  const availableSources = {has: hasSource};
  return {
    sourceFor,
    usage: {
      stateRoot: hasSource(stateRootId) ? stateRootId : "",
      place: hasSource(placeId) ? placeId : "",
      hydro: hasSource(hydroId) ? hydroId : "",
      cultures: getValidCultureNamebaseUsage(cultureBindings, availableSources)
    }
  };
}

function getBuiltinNamebaseSourceEntry(id) {
  if (!Object.hasOwn(BUILTIN_NAMEBASE_SOURCES, id)) return EMPTY_NAMEBASE_SOURCE;
  if (!BUILTIN_NAMEBASE_ENTRY_CACHE.has(id)) {
    BUILTIN_NAMEBASE_ENTRY_CACHE.set(id, createNamebaseSourceEntry(BUILTIN_NAMEBASE_SOURCES[id]));
  }
  return BUILTIN_NAMEBASE_ENTRY_CACHE.get(id);
}

function getValidCultureNamebaseUsage(cultureBindings, rows) {
  const result = {};
  for (const [cultureId, bindings] of Object.entries(cultureBindings || {})) {
    if (!bindings || typeof bindings !== "object") continue;
    const stateRoot = String(bindings.stateRoot || "").trim();
    const place = String(bindings.place || "").trim();
    const hydro = String(bindings.hydro || "").trim();
    result[String(cultureId)] = {
      stateRoot: rows.has(stateRoot) ? stateRoot : "",
      place: rows.has(place) ? place : "",
      hydro: rows.has(hydro) ? hydro : ""
    };
  }
  return result;
}

export function parseNamebaseWeightedSamples(source, {dedupe = true} = {}) {
  const values = Array.isArray(source) ? source : String(source || "").split(/[,，\n\r]+/u);
  const records = [];
  for (const value of values) {
    const record = parseNamebaseWeightedSample(value);
    if (!record.value) continue;
    records.push(record);
  }
  if (!dedupe) return records;

  const merged = new Map();
  for (const record of records) {
    const existing = merged.get(record.value);
    if (existing) existing.weight += record.weight;
    else merged.set(record.value, {...record});
  }
  return [...merged.values()].map(record => ({
    ...record,
    weight: clampNamebaseWeight(record.weight)
  }));
}

export function formatNamebaseWeightedSample(record) {
  const value = String(record?.value || "").trim().replace(/\s+/gu, "");
  if (!value) return "";
  const weight = clampNamebaseWeight(record?.weight ?? 1);
  return weight === 1 ? value : `${value}|${formatNamebaseWeight(weight)}`;
}

function parseNamebaseWeightedSample(value) {
  const raw = String(value || "").trim();
  if (!raw) return {value: "", weight: 1};
  const match = raw.match(/^(.+?)(?:\s*(?:\||\*|×|x)\s*(\d+(?:\.\d+)?))$/u);
  const name = (match ? match[1] : raw).trim().replace(/\s+/gu, "");
  const weight = match ? clampNamebaseWeight(Number(match[2])) : 1;
  return {value: name, weight};
}

function clampNamebaseWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0.1, Math.min(20, Math.round(number * 10) / 10));
}

function formatNamebaseWeight(value) {
  return String(clampNamebaseWeight(value)).replace(/\.0$/u, "");
}

export function createNamebaseSourceEntry(source) {
  const sourceValues = namebaseSourceValues(source);
  const records = parseNamebaseWeightedSamples(sourceValues);
  const fallback = sampleLengthFallback(records);
  const options = normalizeNamebaseGenerationOptions(source, fallback);
  return {
    records,
    chain: calculateNamebaseChain(records),
    minLength: options.minLength,
    maxLength: options.maxLength,
    duplicateChars: options.duplicateChars,
    multiwordRate: options.multiwordRate
  };
}

export function normalizeNamebaseGenerationOptions(options = {}, fallback = {}) {
  const source = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  const fallbackMin = Number.isFinite(fallback.minLength) ? fallback.minLength : 1;
  const fallbackMax = Number.isFinite(fallback.maxLength) ? fallback.maxLength : Math.max(fallbackMin, 8);
  const minLength = clampInteger(source.minLength ?? source.min ?? fallbackMin, 1, 12);
  const maxLength = clampInteger(source.maxLength ?? source.max ?? fallbackMax, minLength, 12);
  return {
    minLength,
    maxLength,
    duplicateChars: normalizeDuplicateChars(source.duplicateChars ?? source.d ?? ""),
    multiwordRate: normalizeMultiwordRate(source.legacyMultiwordRate ?? source.multiwordRate ?? source.m ?? fallback.multiwordRate ?? 0)
  };
}

export function calculateNamebaseChain(records) {
  const starts = [];
  const startsByLength = new Map();
  const lengths = [];
  const transitions = new Map();
  const normalizedRecords = Array.isArray(records) ? records : parseNamebaseWeightedSamples(records);
  for (const record of normalizedRecords) {
    const chars = Array.from(record.value || "").filter(char => !/\s/u.test(char));
    if (!chars.length) continue;
    const length = Math.max(1, Math.min(chars.length, 8));
    const repeats = namebaseWeightRepeats(record.weight);
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      starts.push(chars[0]);
      lengths.push(length);
      if (!startsByLength.has(length)) startsByLength.set(length, []);
      startsByLength.get(length).push(chars[0]);
      for (let index = 0; index < chars.length - 1; index += 1) {
        const current = chars[index];
        const next = chars[index + 1];
        if (!transitions.has(current)) transitions.set(current, []);
        transitions.get(current).push(next);
      }
    }
  }
  return {
    starts,
    startsByLength,
    lengths,
    transitions,
    diversity: calculateNamebaseChainDiversity(transitions)
  };
}

export function generateNamebaseMarkovName(chain, rng, {minLength = 1, maxLength = 8, duplicateChars = ""} = {}) {
  if (!chain?.starts?.length) return "";
  const min = Math.max(1, Math.min(Number(minLength) || 1, Number(maxLength) || 8));
  const max = Math.max(min, Math.min(Number(maxLength) || 8, 12));
  const candidateLengths = chain.lengths.filter(length => length >= min && length <= max);
  const targetLength = Math.max(min, Math.min(max, pickNamebaseWeightedValue(rng, candidateLengths.length ? candidateLengths : chain.lengths) || min));
  const starts = chain.startsByLength.get(targetLength) || chain.starts;
  const chars = [pickNamebaseWeightedValue(rng, starts)];
  while (chars.length < targetLength) {
    const nextValues = chain.transitions.get(chars[chars.length - 1]) || chain.starts;
    chars.push(pickNamebaseWeightedValue(rng, nextValues));
  }
  return normalizeNamebaseCandidate(chars.join(""), {minLength: min, maxLength: max, duplicateChars});
}

function pickNamebaseValue(rng, source) {
  const records = Array.isArray(source) ? source : source?.records || [];
  if (!records.length) return "";
  const totalWeight = records.reduce((sum, item) => sum + Math.max(0.1, Number(item?.weight ?? 1) || 1), 0);
  let roll = namebaseRandom(rng) * totalWeight;
  for (const item of records) {
    roll -= Math.max(0.1, Number(item?.weight ?? 1) || 1);
    if (roll <= 0) return item?.value || item || "";
  }
  return records[0]?.value || records[0] || "";
}

export function generateNamebaseCandidate(rng, source, options = {}) {
  const settings = namebaseCandidateSettings(source, options);
  if (!(settings.multiwordRate > 0) || namebaseRandom(rng) >= settings.multiwordRate) {
    return generateSingleNamebaseCandidate(rng, source, settings);
  }
  const first = generateSingleNamebaseCandidate(rng, source, settings);
  const second = generateSingleNamebaseCandidate(rng, source, settings);
  return first && second ? `${first} ${second}` : first || second;
}

function generateSingleNamebaseCandidate(rng, source, settings) {
  const records = Array.isArray(source) ? source : source?.records || [];
  if (!records.length) return "";
  const chain = Array.isArray(source) ? calculateNamebaseChain(records) : source?.chain;
  const canUseMarkov = records.length >= 3 && chain?.diversity >= 1.25;
  const maxAttempts = canUseMarkov ? 12 : 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (canUseMarkov && namebaseRandom(rng) < 0.72) {
      const generated = generateNamebaseMarkovName(chain, rng, settings);
      if (generated) return generated;
    }
    const picked = normalizeNamebaseCandidate(pickNamebaseValue(rng, source), settings);
    if (picked) return picked;
  }
  return normalizeNamebaseCandidate(records[0]?.value || "", settings);
}

function calculateNamebaseChainDiversity(transitions) {
  const counts = [...transitions.values()].map(values => new Set(values).size);
  if (!counts.length) return 0;
  return Math.round((counts.reduce((sum, count) => sum + count, 0) / counts.length) * 100) / 100;
}

function namebaseWeightRepeats(weight) {
  return Math.max(1, Math.min(40, Math.round((Number(weight) || 1) * 3)));
}

function pickNamebaseWeightedValue(rng, values) {
  if (!values.length) return "";
  return values[Math.floor(namebaseRandom(rng) * values.length)] || values[0] || "";
}

function namebaseRandom(rng) {
  return typeof rng === "function" ? rng() : rng.next();
}

function makeBoundPlaceName(rng, source, options, suffixes) {
  let name = generateNamebaseCandidate(rng, source, {maxLength: getSettlementScale(options) === "small" ? 5 : 6});
  if (options.port && !PORT_SUFFIXES.some(suffix => name.endsWith(suffix))) name = trimGeographicSuffix(name) + pick(rng, PORT_SUFFIXES);
  if (!name && suffixes?.length) name = `${makeChineseTwoCharName(rng)}${pick(rng, suffixes)}`;
  return name || makeChineseTwoCharName(rng);
}

function makeHydroName(prefix, rng, suffixes) {
  const normalized = String(prefix || "").trim().replace(/\s+/gu, " ");
  if (!normalized) return `${pick(rng, HYDRO_PREFIXES)}${pick(rng, suffixes)}`;
  if (HYDRO_NAME_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return normalized;
  return `${normalized}${pick(rng, suffixes)}`;
}

function makeBoundStateRootCandidateAvoiding(rng, source, avoidedRoot = "") {
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = cleanStateRootCandidate(generateNamebaseCandidate(rng, source, {maxLength: 4}));
    if (candidate && !hasSameNameRoot(candidate, avoidedRoot)) return candidate;
  }
  return makeStateRootCandidateAvoiding(rng, {}, avoidedRoot);
}

function namebaseSourceValues(source) {
  if (source && typeof source === "object" && !Array.isArray(source) && Object.prototype.hasOwnProperty.call(source, "source")) {
    return source.source;
  }
  return source;
}

function sampleLengthFallback(records) {
  const lengths = records.map(record => Array.from(record.value || "").length).filter(Boolean);
  return {
    minLength: lengths.length ? Math.min(...lengths) : 1,
    maxLength: lengths.length ? Math.max(...lengths) : 8
  };
}

function namebaseCandidateSettings(source, options = {}) {
  const fallback = Array.isArray(source)
    ? sampleLengthFallback(source)
    : {minLength: source?.minLength, maxLength: source?.maxLength};
  const sourceOptions = Array.isArray(source) ? {} : source || {};
  const normalized = normalizeNamebaseGenerationOptions(sourceOptions, fallback);
  const optionMax = Number.isFinite(Number(options.maxLength)) ? Math.max(1, Math.floor(Number(options.maxLength))) : normalized.maxLength;
  const maxLength = Math.max(normalized.minLength, Math.min(normalized.maxLength, optionMax, 12));
  const minLength = Math.max(1, Math.min(normalized.minLength, maxLength));
  return {
    minLength,
    maxLength,
    duplicateChars: options.duplicateChars ?? normalized.duplicateChars,
    multiwordRate: normalizeMultiwordRate(options.multiwordRate ?? options.legacyMultiwordRate ?? options.m ?? normalized.multiwordRate)
  };
}

function normalizeNamebaseCandidate(value, {minLength = 1, maxLength = 8, duplicateChars = ""} = {}) {
  const chars = Array.from(String(value || "").replace(/\s+/gu, "")).slice(0, maxLength);
  if (chars.length < minLength) return "";
  if (hasDisallowedAdjacentRepeat(chars, duplicateChars)) return "";
  return chars.join("");
}

function hasDisallowedAdjacentRepeat(chars, duplicateChars = "") {
  const allowed = new Set(Array.from(String(duplicateChars || "")));
  for (let index = 1; index < chars.length; index += 1) {
    if (chars[index] === chars[index - 1] && !allowed.has(chars[index])) return true;
  }
  return false;
}

function normalizeDuplicateChars(value) {
  return [...new Set(Array.from(String(value || "").replace(/\s+/gu, "")))].slice(0, 24).join("");
}

function normalizeMultiwordRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, Math.round(number * 1000) / 1000));
}

function clampInteger(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function makeStateRootCandidate(rng, options = {}) {
  const transliterationStyle = getTransliterationStyle(options);
  if (transliterationStyle?.place) return pick(rng, transliterationStyle.place);

  const cultureStyle = getCultureStyle(options);
  if (cultureStyle?.place && hasExplicitCultureStyle(options) && rng.next() < 0.12) return pick(rng, cultureStyle.place);

  const roll = rng.next();
  if (roll < 0.74) return pick(rng, ANCIENT_STATE_ROOTS);
  if (roll < 0.88) return pick(rng, ANCIENT_STATE_COMPOUND_ROOTS);
  if (roll < 0.95) return makeChineseTwoCharName(rng);
  if (roll < 0.985) return pick(rng, PLACE_STEMS);
  if (roll < 0.997) return `${pick(rng, LIGHT_FANTASY_PREFIXES)}${pick(rng, CHINESE_SECOND_CHARS)}`;
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

function shouldUseChineseProvinceFallback(options = {}, boundPlaceSource = EMPTY_NAMEBASE_SOURCE) {
  if (boundPlaceSource.records.length) return false;
  const style = String(options.cultureType || options.nameStyle || options.cultureNameStyle || "");
  return !/(?:europe|western|english|西方|音译|nomad|steppe|游牧|草原|desert|southern|沙漠)/iu.test(style);
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
  if (count <= DIRECTION_PREFIXES.length) return `${pickDirectionPrefix(name, count - 1)}${name}`;
  return `${name}${toChineseOrdinal(count + 1)}`;
}

function reserveGeneratedNames(used, scope, names) {
  if (!Array.isArray(names)) return;
  for (const value of names) {
    const name = String(value || "").trim();
    if (name) used.set(`${scope}:${name}`, 1);
  }
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

function makeUniqueStateGenerated(used, initialName, rng, generate, attempts) {
  let name = initialName;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    const candidate = cleanStateRootCandidate(name);
    if (candidate && claimStateRoot(used, candidate)) return candidate;
    name = generate();
  }
  return makeStateVariant(used, initialName, rng);
}

function claimStateRoot(used, name, {allowFamilyVariant = false} = {}) {
  const root = cleanStateRootCandidate(name);
  if (!root) return false;
  const exactKey = `state:${root}`;
  const familyKey = `state-family:${stateRootFamily(root)}`;
  if (used.has(exactKey)) return false;
  if (!allowFamilyVariant && used.has(familyKey)) return false;
  used.set(exactKey, 1);
  used.set(familyKey, (used.get(familyKey) || 0) + 1);
  return true;
}

function makeStateVariant(used, initialName, rng) {
  const root = cleanStateRootCandidate(initialName) || pick(rng, ANCIENT_STATE_ROOTS);
  for (const prefix of STATE_VARIANT_PREFIXES) {
    const candidate = root.startsWith(prefix) ? root : `${prefix}${root}`;
    if (claimStateRoot(used, candidate, {allowFamilyVariant: true})) return candidate;
  }

  for (let ordinal = 2; ordinal < 20; ordinal += 1) {
    const candidate = `${root}${toChineseOrdinal(ordinal)}`;
    if (claimStateRoot(used, candidate, {allowFamilyVariant: true})) return candidate;
  }

  return `${root}${Math.floor(rng.next() * 1000)}`;
}

function trimGeographicSuffix(name) {
  return String(name || "").replace(/(城|镇|港|津|浦|湾|县|市|区|州|郡|府|道|领|司)$/u, "");
}

function hasGeographicSuffix(name) {
  return /(城|镇|港|津|浦|湾|县|市|区|州|郡|府|道|领|司)$/u.test(String(name || ""));
}

function trimPoliticalForm(name) {
  return String(name || "").replace(/(联邦共和国|共和国|王国|帝国|公国|侯国|伯国|海国|山国|泽国|河国|沙国|林国|教国|汗国|邦联|联邦|诸州|诸港|诸帐|诸部|部盟|林盟|海邦|湖邦|山邦|河邦|自由邦|邦|王朝|朝|国)$/u, "");
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
  if (isAncientStateRoot(trimmedRoot)) return trimmedRoot;
  if (isAncientStateRoot(rawRoot)) return rawRoot;
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

function isAncientStateRoot(name) {
  return ANCIENT_STATE_ROOTS.includes(name) || ANCIENT_STATE_COMPOUND_ROOTS.includes(name);
}

export function isAncientStateNameRoot(name) {
  return isAncientStateRoot(cleanStateRootCandidate(name));
}

export function summarizeNamebaseSource(source, {includeSource = false} = {}) {
  const sourceValues = Array.isArray(source?.source)
    ? source.source
    : String(source?.source || "").split(/[,，\n\r]+/u);
  const summary = analyzeNamebase(
    source?.id || "namebase",
    source?.name || "名称库",
    source?.kind || "generic",
    source?.category || "用户名称库",
    sourceValues,
    source?.note || "",
    {includeSource, options: source}
  );
  if (source?.builtin !== undefined) summary.builtin = Boolean(source.builtin);
  if (source?.origin) summary.origin = source.origin;
  if (source?.importedAt) summary.importedAt = source.importedAt;
  return summary;
}

function analyzeNamebase(id, name, kind, category, values, note = "", {includeSource = false, options = null} = {}) {
  const records = parseNamebaseWeightedSamples(values, {dedupe: false});
  const normalizedValues = records.map(record => record.value);
  const counts = new Map();
  for (const value of normalizedValues) counts.set(value, (counts.get(value) || 0) + 1);
  const uniqueValues = [...counts.keys()];
  const duplicateValues = [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  const lengths = uniqueValues.map(value => Array.from(value).length);
  const sampleMinLength = lengths.length ? Math.min(...lengths) : 0;
  const sampleMaxLength = lengths.length ? Math.max(...lengths) : 0;
  const sampleMeanLength = roundNamebaseMetric(lengths.length ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length : 0);
  const sampleMedianLength = roundNamebaseMetric(medianNamebaseMetric(lengths));
  const generationOptions = normalizeNamebaseGenerationOptions(options || {}, {
    minLength: sampleMinLength || 1,
    maxLength: sampleMaxLength || 8
  });
  const lengthOutlierNames = uniqueValues.filter(value => {
    const length = Array.from(value).length;
    return length < generationOptions.minLength || length > generationOptions.maxLength;
  });
  const disallowedRepeatNames = uniqueValues.filter(value => hasDisallowedAdjacentRepeat(Array.from(value), generationOptions.duplicateChars));
  const doubledChars = collectNamebaseDoubledChars(uniqueValues);
  const unusualChars = collectNamebaseUnusualChars(uniqueValues);
  const weightedSamples = Math.round(records.reduce((sum, record) => sum + record.weight, 0) * 10) / 10;
  const weightedNameSamples = records.filter(record => record.weight !== 1).length;
  const maxSampleWeight = records.length ? Math.max(...records.map(record => record.weight)) : 0;
  const chainDiversity = calculateNamebaseChain(records).diversity;
  const summary = {
    id,
    name,
    kind,
    category,
    samples: normalizedValues.length,
    weightedSamples,
    weightedNameSamples,
    maxSampleWeight,
    chainDiversity,
    uniqueSamples: uniqueValues.length,
    duplicateSamples: normalizedValues.length - uniqueValues.length,
    duplicateNames: duplicateValues.slice(0, 12),
    minLength: generationOptions.minLength,
    maxLength: generationOptions.maxLength,
    sampleMinLength,
    sampleMaxLength,
    sampleMeanLength,
    sampleMedianLength,
    lengthOutlierSamples: lengthOutlierNames.length,
    lengthOutlierNames: lengthOutlierNames.slice(0, 12),
    disallowedRepeatSamples: disallowedRepeatNames.length,
    disallowedRepeatNames: disallowedRepeatNames.slice(0, 12),
    doubledChars: doubledChars.slice(0, 12),
    unusualChars: unusualChars.slice(0, 12),
    duplicateChars: generationOptions.duplicateChars,
    multiwordRate: generationOptions.multiwordRate,
    legacyMultiwordRate: generationOptions.multiwordRate,
    examples: uniqueValues.slice(0, 16),
    note
  };
  if (includeSource) summary.source = records.map(formatNamebaseWeightedSample).filter(Boolean);
  return summary;
}

function roundNamebaseMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}

function medianNamebaseMetric(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function collectNamebaseDoubledChars(values) {
  const chars = new Set();
  for (const value of values) {
    const nameChars = Array.from(value);
    for (let index = 1; index < nameChars.length; index += 1) {
      if (nameChars[index] === nameChars[index - 1]) chars.add(nameChars[index]);
    }
  }
  return [...chars];
}

function collectNamebaseUnusualChars(values) {
  const chars = new Set();
  for (const value of values) {
    for (const char of Array.from(value)) {
      if (!/[\p{Letter}\p{Number}]/u.test(char)) chars.add(char);
    }
  }
  return [...chars];
}

function cultureStyleLabel(style) {
  return {
    European: "西式",
    Highland: "山地",
    Naval: "海洋",
    Lake: "湖泽",
    Nomadic: "游牧",
    Hunting: "林猎",
    River: "河流",
    Desert: "沙漠"
  }[style] || style;
}

function stateRootFamily(name) {
  const chars = Array.from(normalizeNameRoot(name));
  if (chars.length <= 1) {
    const root = chars.join("");
    return STATE_ROOT_FAMILY_ALIASES.get(root) || root;
  }
  const first = chars[0];
  const root = STATE_VARIANT_PREFIXES.includes(first) ? chars.slice(1).join("") : chars.join("");
  const canonicalRoot = STATE_ROOT_FAMILY_ALIASES.get(root) || root;
  const rootChars = Array.from(canonicalRoot);
  if (rootChars.length > 1 && ANCIENT_STATE_CLUSTER_PREFIXES.includes(rootChars[0])) return rootChars[0];
  return canonicalRoot;
}

function toChineseOrdinal(value) {
  const numerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (value <= 10) return numerals[value];
  return String(value);
}

function pickDirectionPrefix(name, startIndex) {
  const rawName = String(name || "");
  if (CARDINAL_PREFIXES.has(Array.from(rawName)[0])) {
    for (const prefix of NON_CARDINAL_VARIANT_PREFIXES) if (!rawName.startsWith(prefix)) return prefix;
  }

  for (let offset = 0; offset < DIRECTION_PREFIXES.length; offset++) {
    const prefix = DIRECTION_PREFIXES[(startIndex + offset) % DIRECTION_PREFIXES.length];
    if (!rawName.startsWith(prefix)) return prefix;
  }
  return DIRECTION_PREFIXES[startIndex % DIRECTION_PREFIXES.length];
}

function pick(rng, values) {
  return values[Math.floor(rng.next() * values.length)];
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
