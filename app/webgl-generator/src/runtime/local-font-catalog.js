import {normalizeLocalFontFamilyName} from "./label-style-registry.js";

export function createLocalFontFamilyOptions(fonts) {
  const families = new Map();
  for (const font of Array.from(fonts || [])) {
    const family = normalizeLocalFontFamilyName(font?.family || font?.postscriptName);
    if (!family) continue;
    const fullName = normalizeLocalFontFamilyName(font?.fullName);
    const postscriptName = normalizeLocalFontFamilyName(font?.postscriptName);
    const displayName = fullName || family || postscriptName;
    const candidate = {
      family,
      displayName,
      id: postscriptName || family,
      score: localFontDisplayScore(font, fullName, family)
    };
    const key = family.toLocaleLowerCase("en-US");
    const current = families.get(key);
    if (!current || candidate.score > current.score || (candidate.score === current.score && compareLocalFontOption(candidate, current) < 0)) {
      families.set(key, candidate);
    }
  }
  return [...families.values()]
    .sort(compareLocalFontOption)
    .map(({score: _score, ...option}) => Object.freeze(option));
}

function localFontDisplayScore(font, fullName, family) {
  const style = normalizeLocalFontFamilyName(font?.style).toLocaleLowerCase("en-US");
  const regularStyle = !style || /^(regular|normal|roman|常规|标准)$/u.test(style);
  let score = fullName ? 10 : 0;
  if (fullName && fullName !== family) score += 4;
  if (regularStyle) score += 3;
  return score;
}

function compareLocalFontOption(left, right) {
  return left.displayName.localeCompare(right.displayName, "zh-CN")
    || left.family.localeCompare(right.family, "en-US")
    || left.id.localeCompare(right.id, "en-US");
}
