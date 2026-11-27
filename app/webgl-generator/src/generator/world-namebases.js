// 每个词素按「当地拼写、中文写法」成对记录，同一组合的两种写法保持相同顺序。
// 词素用于组合架空地名。空格、变音符号及各语言的书写顺序属于名称本身。
const styles = [
  {
    id: "english", name: "西式·英格兰", join: "",
    first: [["Ash", "阿什"], ["Alder", "奥尔德"], ["Aven", "埃文"], ["Bram", "布拉姆"], ["Fern", "芬"], ["Hare", "黑尔"], ["Lark", "拉克"], ["Oak", "奥克"], ["Raven", "雷文"], ["West", "韦斯特"], ["Whit", "惠特"], ["Wych", "威奇"]],
    last: [["ford", "福德"], ["bridge", "布里奇"], ["brook", "布鲁克"], ["bury", "伯里"], ["combe", "库姆"], ["dale", "代尔"], ["field", "菲尔德"], ["hurst", "赫斯特"], ["mere", "米尔"], ["wick", "威克"]]
  },
  {
    id: "german", name: "西式·德意志", join: "",
    first: [["Adler", "阿德勒"], ["Birken", "比尔肯"], ["Eichen", "艾兴"], ["Falken", "法尔肯"], ["Felsen", "费尔森"], ["Hirsch", "希尔施"], ["Linden", "林登"], ["Raben", "拉本"], ["Rosen", "罗森"], ["Sonnen", "松嫩"], ["Tannen", "坦嫩"], ["Wolf", "沃尔夫"]],
    last: [["bach", "巴赫"], ["berg", "贝格"], ["brunn", "布伦"], ["burg", "堡"], ["dorf", "多夫"], ["feld", "费尔德"], ["hain", "海因"], ["heim", "海姆"], ["stein", "施泰因"], ["tal", "塔尔"]]
  },
  {
    id: "norwegian", name: "北欧·挪威", join: "",
    first: [["Bjørk", "比约克"], ["Eik", "艾克"], ["Furu", "富鲁"], ["Gran", "格兰"], ["Haug", "豪格"], ["Lind", "林德"], ["Nord", "努尔"], ["Sand", "桑德"], ["Sol", "索尔"], ["Stein", "斯泰因"], ["Sør", "瑟尔"], ["Vest", "韦斯特"]],
    last: [["dal", "达尔"], ["fjord", "菲尤尔"], ["heim", "海姆"], ["holm", "霍尔姆"], ["lund", "伦德"], ["nes", "内斯"], ["stad", "斯塔德"], ["strand", "斯特兰德"], ["vik", "维克"]]
  },
  {
    id: "russian", name: "斯拉夫·俄罗斯", join: " ",
    first: [["Белая", "别拉亚"], ["Верхняя", "韦尔赫尼亚亚"], ["Дальняя", "达利尼亚亚"], ["Зелёная", "泽廖纳亚"], ["Красная", "克拉斯纳亚"], ["Лесная", "列斯纳亚"], ["Новая", "诺瓦亚"], ["Светлая", "斯韦特拉亚"], ["Старая", "斯塔拉亚"], ["Тихая", "季哈亚"]],
    last: [["Балка", "巴尔卡"], ["Гора", "戈拉"], ["Долина", "多利纳"], ["Поляна", "波利亚纳"], ["Речка", "列奇卡"], ["Роща", "罗夏"], ["Слобода", "斯洛博达"], ["Станица", "斯塔尼察"]]
  },
  {
    id: "polish", name: "斯拉夫·波兰", join: " ",
    first: [["Biała", "比亚瓦"], ["Cicha", "齐哈"], ["Czarna", "恰尔纳"], ["Dębowa", "登博瓦"], ["Górna", "古尔纳"], ["Leśna", "莱希纳"], ["Mała", "马瓦"], ["Nowa", "诺瓦"], ["Stara", "斯塔拉"], ["Zielona", "杰洛纳"]],
    last: [["Dolina", "多利纳"], ["Góra", "古拉"], ["Kępa", "肯帕"], ["Łąka", "翁卡"], ["Osada", "奥萨达"], ["Polana", "波拉纳"], ["Wieś", "维希"], ["Wola", "沃拉"]]
  },
  {
    id: "arabic", name: "阿拉伯", join: " ", reverseChinese: true,
    first: [["عين", "泉"], ["باب", "门"], ["برج", "塔"], ["تل", "丘"], ["جبل", "山"], ["دار", "庄"], ["رأس", "角"], ["قصر", "堡"], ["مرج", "原"], ["وادي", "谷"]],
    last: [["الأرز", "阿尔兹"], ["الزيتون", "宰通"], ["السدر", "锡德尔"], ["الصفصاف", "萨夫萨夫"], ["الغزال", "加扎勒"], ["القمر", "盖迈尔"], ["اللوز", "劳兹"], ["النخيل", "纳希勒"], ["النور", "努尔"], ["الورد", "瓦尔德"]]
  },
  {
    id: "quechua", name: "美洲原住民·克丘亚", join: " ",
    first: [["Ch’aki", "查基"], ["Hatun", "哈通"], ["Killa", "基利亚"], ["Misk’i", "米斯基"], ["Muyu", "穆尤"], ["Puka", "普卡"], ["Quri", "库里"], ["Sumaq", "苏马克"], ["Uchuy", "乌丘伊"], ["Yana", "亚纳"], ["Yuraq", "尤拉克"]],
    last: [["Kancha", "坎查"], ["Llaqta", "利亚克塔"], ["Mayu", "马尤"], ["Pampa", "潘帕"], ["Pata", "帕塔"], ["Pukyu", "普基尤"], ["Qucha", "库查"], ["Urqu", "乌尔库"], ["Wayqu", "瓦伊库"]]
  },
  {
    id: "guarani", name: "美洲原住民·瓜拉尼", join: " ",
    first: [["Ita", "伊塔"], ["Ka’aguy", "卡阿圭"], ["Ñu", "纽"], ["Tape", "塔佩"], ["Y", "伊"], ["Ykua", "伊夸"], ["Yvy", "伊维"], ["Yvyty", "伊维蒂"]],
    last: [["Guasu", "瓜苏"], ["Hovy", "霍维"], ["Karape", "卡拉佩"], ["Michĩ", "米希"], ["Morotĩ", "莫罗廷"], ["Porã", "波朗"], ["Potĩ", "波廷"], ["Puku", "普库"], ["Pytã", "皮唐"]]
  },
  {
    id: "swahili", name: "非洲·斯瓦希里", join: " ", reverseChinese: true,
    first: [["Bonde la", "谷"], ["Kilima cha", "丘"], ["Kisiwa cha", "岛"], ["Kijiji cha", "村"], ["Mlima wa", "山"], ["Msitu wa", "林"], ["Mto wa", "河"], ["Mwambao wa", "岸"], ["Pwani ya", "海滨"]],
    last: [["Miamba", "米安巴"], ["Mibuyu", "米布尤"], ["Michikichi", "米奇基奇"], ["Mikoko", "米科科"], ["Minazi", "米纳齐"], ["Mitende", "米滕德"], ["Mivule", "米武莱"], ["Mianzi", "米安齐"], ["Nyota", "尼约塔"]]
  },
  {
    id: "hausa", name: "非洲·豪萨", join: " ", reverseChinese: true,
    first: [["Dajin", "林"], ["Dutsen", "山"], ["Filin", "原"], ["Garin", "镇"], ["Ƙofar", "门"], ["Rafin", "溪"], ["Tudun", "丘"]],
    last: [["Dabino", "达比诺"], ["Gawo", "加沃"], ["Kuka", "库卡"], ["Rimi", "里米"], ["Tsamiya", "察米亚"], ["Zaitun", "宰通"], ["Zogale", "佐加莱"]]
  },
  {
    id: "japanese", name: "日式", join: "",
    first: [["青葉", "青叶"], ["朝日", "朝日"], ["稲", "稻"], ["梅", "梅"], ["桜", "樱"], ["白鳥", "白鸟"], ["杉", "杉"], ["月見", "月见"], ["椿", "椿"], ["藤", "藤"], ["若松", "若松"], ["夕凪", "夕凪"]],
    last: [["岡", "冈"], ["川", "川"], ["ヶ丘", "丘"], ["坂", "坂"], ["崎", "崎"], ["沢", "泽"], ["島", "岛"], ["台", "台"], ["野", "野"], ["原", "原"]]
  },
  {
    id: "korean", name: "韩式", join: "",
    first: [["금", "金"], ["남", "南"], ["동", "东"], ["백", "白"], ["벽", "碧"], ["서", "西"], ["송", "松"], ["신", "新"], ["옥", "玉"], ["용", "龙"], ["은", "银"], ["청", "青"]],
    last: [["강", "江"], ["계", "溪"], ["곡", "谷"], ["담", "潭"], ["산", "山"], ["성", "城"], ["원", "原"], ["천", "川"], ["평", "平"], ["포", "浦"]]
  },
  {
    id: "thai", name: "东南亚·泰语", join: "", reverseChinese: true,
    first: [["เกาะ", "岛"], ["เขา", "山"], ["ดอน", "岗"], ["ทุ่ง", "原"], ["บ้าน", "村"], ["ป่า", "林"], ["วัง", "潭"], ["หนอง", "泽"], ["ห้วย", "溪"]],
    last: [["แก้ว", "盖奥"], ["ขาม", "堪"], ["จันทร์", "占"], ["แดง", "登"], ["ทอง", "通"], ["บัว", "博瓦"], ["ไผ่", "派"], ["ม่วง", "芒"], ["ยาง", "央"], ["สัก", "萨"]]
  },
  {
    id: "vietnamese", name: "东南亚·越南", join: " ",
    first: [["An", "安"], ["Bình", "平"], ["Đông", "东"], ["Gia", "嘉"], ["Hải", "海"], ["Kim", "金"], ["Long", "隆"], ["Minh", "明"], ["Phú", "富"], ["Tân", "新"], ["Thanh", "清"], ["Vĩnh", "永"]],
    last: [["Châu", "州"], ["Hà", "河"], ["Hòa", "和"], ["Khánh", "庆"], ["Lâm", "林"], ["Lộc", "禄"], ["Mỹ", "美"], ["Phong", "丰"], ["Sơn", "山"], ["Thủy", "水"]]
  },
  {
    id: "malay", name: "东南亚·马来", join: " ", reverseChinese: true,
    first: [["Bukit", "山"], ["Kampung", "村"], ["Kuala", "河口"], ["Lembah", "谷"], ["Padang", "原"], ["Pulau", "岛"], ["Sungai", "河"], ["Tanjung", "岬"], ["Teluk", "湾"]],
    last: [["Ara", "阿拉"], ["Bayu", "巴尤"], ["Buluh", "布卢"], ["Jati", "贾蒂"], ["Meranti", "默兰蒂"], ["Nibung", "尼邦"], ["Pandan", "班丹"], ["Pinang", "槟榔"], ["Rumbia", "伦比亚"], ["Sena", "瑟纳"]]
  }
];

export const WORLD_NAMEBASES = new Map();
for (const style of styles) {
  const chinese = [];
  const native = [];
  for (const [first, firstZh] of style.first) {
    for (const [last, lastZh] of style.last) {
      chinese.push(style.reverseChinese ? lastZh + firstZh : firstZh + lastZh);
      native.push(first + style.join + last);
    }
  }
  for (const [writing, label, source] of [["zh", "中文", chinese], ["native", "当地拼写", native]]) {
    const id = `world-${style.id}-${writing}`;
    WORLD_NAMEBASES.set(id, {id, name: `${style.name}（${label}）`, builtin: true, native: writing === "native", source});
  }
}
