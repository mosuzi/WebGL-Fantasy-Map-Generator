export const CITY_LABEL_BASE_OFFSET = 6;
export const CITY_LABEL_ICON_GAP = 4;
export const CITY_ICON_TOP_ANCHOR_RATIO = 0.8;

export function cityLabelAnchorOffset({
  iconVisible,
  iconHeight,
  iconScale
}) {
  if (!iconVisible) return -CITY_LABEL_BASE_OFFSET;
  const height = Math.max(0, Number(iconHeight) || 0);
  const scale = Math.max(0, Number(iconScale) || 0);
  return -(height * scale * CITY_ICON_TOP_ANCHOR_RATIO + CITY_LABEL_ICON_GAP);
}

export function cityLabelIconGap({labelAnchorY, iconAnchorY, iconHeight, iconScale}) {
  const iconTop = iconAnchorY - iconHeight * iconScale * CITY_ICON_TOP_ANCHOR_RATIO;
  return iconTop - labelAnchorY;
}
