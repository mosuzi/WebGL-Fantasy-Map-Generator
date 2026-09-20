// ID 是对象身份而非普通列表字段；显式 debug 元数据也遵循同一显示边界。
export function visibleListFields(fields, debugEnabled) {
  return debugEnabled ? fields : fields.filter(field => !field.debug && !/(^id$|Id$|_id$)/.test(field.key || ""));
}
