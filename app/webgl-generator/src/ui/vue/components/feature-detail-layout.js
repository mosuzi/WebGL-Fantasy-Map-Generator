const FEATURE_DETAIL_DEFINITIONS = Object.freeze([
  {key: "id", group: "identity", label: "ID", format: feature => `#${feature.id}`},
  {key: "type", group: "identity", label: "类型", format: feature => feature.typeLabel},
  {key: "group", group: "identity", label: "分组", format: feature => feature.groupLabel},
  {key: "land", group: "identity", label: "陆地", format: feature => feature.land ? "是" : "否"},
  {key: "border", group: "identity", label: "边界", format: feature => feature.border ? "是" : "否"},
  {key: "cells", group: "identity", label: "采样格", field: "cells"},
  {key: "area", group: "coast", label: "面积", field: "area", valueType: "area", wide: true},
  {key: "shoreline", group: "coast", label: "岸线采样格", field: "shorelineCells"},
  {key: "haven", group: "hydrology", label: "港湾采样格", field: "havenCells"},
  {key: "harbor", group: "hydrology", label: "泊位强度", field: "harborScore"},
  {key: "height", group: "hydrology", label: "高度 / 水位", field: "height"},
  {key: "flux", group: "hydrology", label: "补给", field: "flux"},
  {key: "evaporation", group: "hydrology", label: "蒸发", field: "evaporation"},
  {key: "first-cell", group: "debug", label: "first cell", field: "firstCell", debug: true}
]);

export function buildFeatureDetailRows(feature, {formatNumber = String, formatArea = String} = {}) {
  if (!feature) return [];
  return FEATURE_DETAIL_DEFINITIONS.map(definition => ({
    key: definition.key,
    group: definition.group,
    label: definition.label,
    value: definition.format
      ? definition.format(feature)
      : definition.valueType === "area"
        ? formatArea(feature[definition.field])
        : formatNumber(feature[definition.field]),
    wide: definition.wide === true,
    debug: definition.debug === true
  }));
}
