import {cultureNamingStyleConfig, isChineseCultureNameStyle} from "./culture-naming-styles.js";

export const CHINESE_PROVINCE_FORMS = Object.freeze(["州", "郡", "府", "道", "路", "军", "镇", "司"]);
export const STEPPE_PROVINCE_FORMS = Object.freeze(["盟", "旗", "部", "万户"]);
export const HUNTING_PROVINCE_FORMS = Object.freeze(["部落", "猎围", "林寨", "山场"]);
export const HIGHLAND_PROVINCE_FORMS = Object.freeze(["峒", "寨", "关", "土司"]);
export const RIVER_PROVINCE_FORMS = Object.freeze(["川", "津", "浦", "漕司"]);
export const LAKE_PROVINCE_FORMS = Object.freeze(["泽", "泊", "汊", "湖府"]);
export const NAVAL_PROVINCE_FORMS = Object.freeze(["港", "岛", "海府", "舶司"]);

export const CULTURE_TYPE_PROVINCE_FORMS = Object.freeze({
  Hunting: HUNTING_PROVINCE_FORMS,
  Highland: HIGHLAND_PROVINCE_FORMS,
  River: RIVER_PROVINCE_FORMS,
  Lake: LAKE_PROVINCE_FORMS,
  Naval: NAVAL_PROVINCE_FORMS,
  Nomadic: STEPPE_PROVINCE_FORMS
});

const LEGACY_PROVINCE_FORMS = Object.freeze(["郡", "州", "道", "府", "领", "司"]);
const CULTURE_TYPE_PROVINCE_FORMS_BY_KEY = Object.freeze(
  Object.fromEntries(Object.entries(CULTURE_TYPE_PROVINCE_FORMS).map(([type, forms]) => [type.toLowerCase(), forms]))
);
const KNOWN_CULTURE_TYPE_KEYS = new Set(["generic", ...Object.keys(CULTURE_TYPE_PROVINCE_FORMS_BY_KEY)]);
const EMPTY_PROVINCE_FORMS = Object.freeze([]);

export function isChineseProvinceNamingStyle({state = null, culture = null, nameStyle = ""} = {}) {
  const style = nameStyle || state?.nameStyle || culture?.nameStyle || "oriental";
  return isChineseCultureNameStyle(style);
}

export function isSteppeProvinceNamingStyle({state = null, culture = null, cultureType = ""} = {}) {
  return provinceCultureType({state, culture, cultureType}) === "nomadic";
}

export function provinceFormsForCultureType({state = null, culture = null, cultureType = ""} = {}) {
  return CULTURE_TYPE_PROVINCE_FORMS_BY_KEY[provinceCultureType({state, culture, cultureType})] || EMPTY_PROVINCE_FORMS;
}

export function provinceFormForState(state, cultures = [], options = {}) {
  const stateId = politicalId(state);
  const culture = options.culture || cultures?.[Number(state?.culture) || 0] || null;
  const style = options.nameStyle || state?.nameStyle || culture?.nameStyle || "oriental";
  let forms = cultureNamingStyleConfig(style)?.provinceForms || [];
  if (isChineseProvinceNamingStyle({state, culture, nameStyle: style})) forms = CHINESE_PROVINCE_FORMS;
  const cultureTypeForms = provinceFormsForCultureType({state, culture, cultureType: options.cultureType});
  if (cultureTypeForms.length) forms = cultureTypeForms;
  if (!forms.length) return normalizeForm(options.fallbackForm) || null;
  const index = Math.abs((stateId > 0 ? stateId - 1 : stateId) % forms.length);
  return forms[index];
}

export function legacyProvinceForm(provinceId) {
  const id = Number(provinceId) || 0;
  return LEGACY_PROVINCE_FORMS[Math.abs(id % LEGACY_PROVINCE_FORMS.length)];
}

export function backfillProvinceNames(map) {
  const collections = uniqueProvinceCollections(map);
  let changed = 0;

  for (const provinces of collections) {
    for (let index = 0; index < provinces.length; index++) {
      const province = provinces[index];
      if (!province || province.removed) continue;
      const next = backfillProvinceRecord(province, map);
      if (!next) continue;
      provinces[index] = {...province, ...next};
      changed++;
    }
  }
  return {changed, collections: collections.length};
}

function backfillProvinceRecord(province, map) {
  const name = String(province?.name || "").trim();
  if (!name) return null;
  const existingForm = normalizeForm(province.formName);
  const existingFullName = String(province.fullName || "").trim();
  if (existingForm && existingFullName && existingFullName !== name) return null;

  const state = stateById(map, province.state);
  const cultures = map?.society?.cultures || map?.pack?.cultures || [];
  const derivedForm = suffixFromFullName(name, existingFullName);
  const formName = existingForm
    || derivedForm
    || provinceFormForState(state, cultures, {fallbackForm: legacyProvinceForm(politicalId(province))})
    || legacyProvinceForm(politicalId(province));
  const fullName = existingFullName && existingFullName !== name ? existingFullName : `${name}${formName}`;
  if (formName === existingForm && fullName === existingFullName) return null;
  return {formName, fullName};
}

function uniqueProvinceCollections(map) {
  const collections = [map?.politics?.provinces, map?.pack?.provinces].filter(Array.isArray);
  return collections.filter((collection, index) => collections.indexOf(collection) === index);
}

function stateById(map, stateId) {
  const id = Number(stateId) || 0;
  return map?.politics?.states?.[id] || map?.pack?.states?.[id] || null;
}

function suffixFromFullName(name, fullName) {
  if (!fullName || fullName === name || !fullName.startsWith(name)) return "";
  return normalizeForm(fullName.slice(name.length));
}

function normalizeForm(value) {
  return String(value || "").trim();
}

function provinceCultureType({state, culture, cultureType}) {
  for (const candidate of [cultureType, culture?.type, state?.type]) {
    const type = String(candidate || "").trim().toLowerCase();
    if (KNOWN_CULTURE_TYPE_KEYS.has(type)) return type;
  }
  return "";
}

function politicalId(item) {
  const id = Number(item?.i ?? item?.id ?? item);
  return Number.isInteger(id) && id >= 0 ? id : 0;
}
