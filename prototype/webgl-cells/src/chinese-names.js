const STATE_ROOTS = [
  "云梁",
  "昭宁",
  "青岚",
  "河洛",
  "玄苍",
  "景衡",
  "雁川",
  "栖梧",
  "临海",
  "越山",
  "怀陵",
  "星渚"
];

const CITY_NAMES = [
  "临安",
  "建康",
  "广陵",
  "云中",
  "清河",
  "洛川",
  "江陵",
  "雁门",
  "白沙",
  "永宁",
  "长亭",
  "兰台",
  "寒山",
  "望津",
  "青溪",
  "栖霞",
  "南浦",
  "北辰",
  "秋水",
  "怀远"
];

const PORT_SUFFIXES = ["津", "港", "浦", "湾"];
const CAPITAL_SUFFIXES = ["京", "都", "府"];

export function getDemoDisplayName(item, kind) {
  if (!item) return "";
  if (kind === "state" && usesChineseStateName(item.i)) return `${pick(STATE_ROOTS, item.i)}国`;
  if (kind === "burg" && usesChineseStateName(item.state)) return getChineseBurgName(item);
  return item.name || "";
}

export function getDemoNameStyle(item, kind) {
  if (kind === "state" && usesChineseStateName(item?.i)) return "zh";
  if (kind === "burg" && usesChineseStateName(item?.state)) return "zh";
  return "source";
}

export function getChineseNameStats(snapshot) {
  const states = (snapshot.labels?.states || []).filter(item => usesChineseStateName(item.i)).length;
  const burgs = (snapshot.labels?.burgs || []).filter(item => usesChineseStateName(item.state)).length;
  return {states, burgs};
}

function getChineseBurgName(item) {
  const stateRoot = pick(STATE_ROOTS, item.state);
  if (item.capital) return `${stateRoot}${pick(CAPITAL_SUFFIXES, item.i + item.state * 3)}`;
  if (item.port) return `${stateRoot}${pick(PORT_SUFFIXES, item.i + item.state * 5)}`;
  return pick(CITY_NAMES, item.i + item.state * 7);
}

function usesChineseStateName(stateId) {
  return Boolean(stateId) && (stateId % 5 === 1 || stateId % 7 === 0);
}

function pick(values, seed) {
  return values[Math.abs(seed) % values.length];
}
