export const CHINESE_PROVINCE_FORMS = Object.freeze(["州", "郡", "府", "道", "路", "军", "镇", "司"]);

const LEGACY_PROVINCE_FORMS = Object.freeze(["郡", "州", "道", "府", "领", "司"]);
const CHINESE_STYLE_PATTERN = /(?:oriental|chinese|china|sinitic|汉|华夏|中华|中国|东方)/iu;
const FOREIGN_STYLE_PATTERN = /(?:europe|western|english|nord|nomad|steppe|desert|southern|foreign|西方|英式|欧式|游牧|草原|沙漠|音译)/iu;

export function isChineseProvinceNamingStyle({state = null, culture = null, nameStyle = ""} = {}) {
  const style = [nameStyle, state?.nameStyle, culture?.nameStyle].filter(Boolean).join(" ");
  if (CHINESE_STYLE_PATTERN.test(style)) return true;
  if (FOREIGN_STYLE_PATTERN.test(style)) return false;
  return true;
}

export function provinceFormForState(state, cultures = [], options = {}) {
  const stateId = politicalId(state);
  const culture = options.culture || cultures?.[Number(state?.culture) || 0] || null;
  if (!isChineseProvinceNamingStyle({state, culture, nameStyle: options.nameStyle})) {
    return normalizeForm(options.fallbackForm) || null;
  }
  const index = Math.abs((stateId > 0 ? stateId - 1 : stateId) % CHINESE_PROVINCE_FORMS.length);
  return CHINESE_PROVINCE_FORMS[index];
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

function politicalId(item) {
  const id = Number(item?.i ?? item?.id ?? item);
  return Number.isInteger(id) && id >= 0 ? id : 0;
}
