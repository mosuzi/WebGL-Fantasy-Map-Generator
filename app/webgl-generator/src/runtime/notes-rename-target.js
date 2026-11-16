import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";

const OBJECT_NAME_KINDS = new Set([
  OBJECT_KIND.STATE, OBJECT_KIND.PROVINCE, OBJECT_KIND.CITY,
  OBJECT_KIND.CULTURE, OBJECT_KIND.RELIGION, OBJECT_KIND.RIVER,
  OBJECT_KIND.LAKE, OBJECT_KIND.MARKER, OBJECT_KIND.NOTE
]);

export function noteRenameTargetKind(object) {
  if (!object) return null;
  if (object.kind === OBJECT_KIND.LABEL) {
    if (object.targetKind === LABEL_TARGET_KIND.CUSTOM) return "custom-label";
    if (object.targetKind === LABEL_TARGET_KIND.ZONE) return "zone";
    if ([LABEL_TARGET_KIND.STATE, LABEL_TARGET_KIND.PROVINCE, LABEL_TARGET_KIND.CITY].includes(object.targetKind)) return "object";
    return null;
  }
  if (OBJECT_NAME_KINDS.has(object.kind)) return "object";
  if (object.kind === OBJECT_KIND.ZONE) return "zone";
  if (object.kind === OBJECT_KIND.MILITARY) return "military";
  if (object.kind === OBJECT_KIND.MEASUREMENT) return "measurement";
  if (object.kind === OBJECT_KIND.OCEAN_CURRENT) return "ocean-current";
  return null;
}
