const ORIENTAL_ROOTS = ["昭宁", "雁川", "栖梧", "青岚", "星渚", "南衡", "白麓", "清河", "苍原", "岚湾", "云麓", "河洛", "北辰", "东衡", "西陵", "海澜", "赤原", "沙洲", "霜庭", "松岳", "月湾", "石原", "晴川", "夜渡", "金台", "雨林", "岭南", "北海", "东渚", "朱明", "玄岭", "素川"];
const EUROPEAN_ROOTS = ["阿尔登", "贝尔蒙", "卡斯蒂", "德里安", "埃诺斯", "弗洛伦", "格拉文", "赫尔维", "伊斯特", "朱利安", "科伦", "洛塔尔", "米雷尔", "诺维斯", "奥斯兰", "普罗文", "奎林", "雷恩", "塞维尔", "泰伦", "乌尔班", "维斯塔", "瓦伦", "克莱蒙", "约维安", "泽菲尔", "布雷萨", "卡尔维", "多伦", "艾维拉", "菲奥伦", "加伦"];
const ENGLISH_ROOTS = ["阿什顿", "贝克斯", "坎特", "达勒姆", "埃弗顿", "费尔福", "格林威", "哈德森", "伊普斯", "肯特", "兰开斯", "莫顿", "诺丁", "牛津", "普雷斯", "昆斯", "雷丁", "斯坦福", "特伦特", "阿普顿", "沃里克", "温彻斯", "约克", "布莱顿", "切斯特", "德文", "埃塞克", "福克斯", "格洛斯", "赫里福", "林肯", "萨默塞"];
const ANTIQUE_ROOTS = ["阿卡迪", "奥勒斯", "卡西安", "德尔菲", "埃庇鲁", "弗拉维", "赫利奥", "伊奥尼", "拉提乌", "马其顿", "尼科波", "奥林匹", "佩拉", "罗迪安", "斯巴达", "忒萨利"];
const HIGH_FANTASY_ROOTS = ["艾瑟兰", "星辉庭", "银月谷", "苍穹塔", "龙歌原", "翡翠境", "晨曦堡", "风语林", "永昼城", "琉璃海", "虹光岭", "云冠国", "霜晶湾", "天琴河", "曜石原", "秘银谷", "凤凰台", "圣树庭"];
const DARK_FANTASY_ROOTS = ["鸦影堡", "灰烬原", "枯骨湾", "暮钟城", "黑棘谷", "血月岭", "雾墓河", "寒鸦庭", "锈冠国", "哀歌港", "断塔原", "幽火泽", "铅云堡", "腐沼城", "夜幕湾", "冥河谷", "铁棺岭", "无星庭"];

const STYLE_CONFIGS = Object.freeze({
  oriental: style("oriental", "东方", ORIENTAL_ROOTS, [], [], [], [], true),
  european: style("european", "欧陆", EUROPEAN_ROOTS, EUROPEAN_ROOTS, ["艾文", "洛恩", "赛尔", "布兰", "维尔", "莱茵", "欧伦", "诺恩", "密尔", "赫伦", "卡恩", "阿斯"], ["堡", "维尔", "尼亚", "港", "城", "郡"], ["省", "郡", "公领", "边区", "总督区"], false),
  english: style("english", "英伦", ENGLISH_ROOTS, ENGLISH_ROOTS, ["埃文", "泰晤", "特伦特", "乌斯", "迪伊", "泰恩", "塞文", "亨伯", "威伊", "默西", "克莱德", "奥斯"], ["顿", "福德", "切斯特", "伯里", "港", "郡"], ["郡", "郡区", "领地", "边区", "辖区"], false),
  antique: style("antique", "古典", ANTIQUE_ROOTS, ANTIQUE_ROOTS, ["阿尔菲", "阿索普", "伊利索", "卡斯托", "拉里萨", "迈安德", "尼罗", "帕德", "斯卡曼", "泰伯"], ["波利斯", "堡", "港", "城", "郡"], ["行省", "总督区", "辖区", "军区"], false),
  highFantasy: style("highFantasy", "高幻想", HIGH_FANTASY_ROOTS, HIGH_FANTASY_ROOTS, ["星歌", "月辉", "银流", "龙息", "晨露", "天镜", "虹泉", "云梦"], ["庭", "塔", "谷", "港", "城"], ["星域", "王领", "辖境", "守望区"], false),
  darkFantasy: style("darkFantasy", "暗黑幻想", DARK_FANTASY_ROOTS, DARK_FANTASY_ROOTS, ["血河", "雾水", "冥流", "哀川", "锈溪", "黑潮", "暮泽", "灰湾"], ["堡", "墓", "谷", "港", "城"], ["领地", "边区", "辖境", "守备区"], false)
});

const SET_STYLE_CYCLES = Object.freeze({
  oriental: Object.freeze(["oriental"]),
  european: Object.freeze(["european"]),
  english: Object.freeze(["english"]),
  antique: Object.freeze(["antique"]),
  highFantasy: Object.freeze(["highFantasy"]),
  darkFantasy: Object.freeze(["darkFantasy"]),
  world: Object.freeze(["oriental", "european", "english", "oriental", "antique", "highFantasy", "darkFantasy", "oriental"]),
  random: Object.freeze(["english", "darkFantasy", "oriental", "european", "highFantasy", "antique"])
});

const STYLE_ALIASES = Object.freeze({
  default: "oriental",
  chinese: "oriental",
  china: "oriental",
  sinitic: "oriental",
  western: "european",
  highfantasy: "highFantasy",
  darkfantasy: "darkFantasy"
});

export const CULTURE_SET_IDS = Object.freeze(Object.keys(SET_STYLE_CYCLES));

export function normalizeCultureSetId(value) {
  const id = String(value || "").trim();
  return Object.hasOwn(SET_STYLE_CYCLES, id) ? id : "world";
}

export function normalizeCultureNameStyle(value) {
  const raw = String(value || "").trim();
  if (!raw) return "oriental";
  const direct = Object.keys(STYLE_CONFIGS).find(id => id.toLowerCase() === raw.toLowerCase());
  if (direct) return direct;
  return STYLE_ALIASES[raw.toLowerCase()] || raw;
}

export function cultureNamingStyleConfig(value) {
  return STYLE_CONFIGS[normalizeCultureNameStyle(value)] || null;
}

export function cultureNamingProfileForSet(culturesSet, index) {
  const setId = normalizeCultureSetId(culturesSet);
  const cycle = SET_STYLE_CYCLES[setId];
  const nameStyle = cycle[Math.abs(Number(index) || 0) % cycle.length];
  const config = STYLE_CONFIGS[nameStyle];
  return Object.freeze({nameStyle, root: config.cultureRoots[Math.abs(Number(index) || 0) % config.cultureRoots.length]});
}

export function isChineseCultureNameStyle(value) {
  return cultureNamingStyleConfig(value)?.chinese ?? !String(value || "").trim();
}

export function listCultureNamingStyleConfigs() {
  return Object.values(STYLE_CONFIGS);
}

function style(id, label, cultureRoots, placeRoots, hydroRoots, placeSuffixes, provinceForms, chinese) {
  return Object.freeze({
    id,
    label,
    chinese,
    cultureRoots: Object.freeze([...cultureRoots]),
    placeRoots: Object.freeze([...placeRoots]),
    hydroRoots: Object.freeze([...hydroRoots]),
    placeSuffixes: Object.freeze([...placeSuffixes]),
    provinceForms: Object.freeze([...provinceForms]),
    stateForms: Object.freeze(chinese ? [] : ["国", "王国", "共和国", "帝国"])
  });
}
