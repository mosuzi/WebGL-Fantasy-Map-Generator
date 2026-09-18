export const PNG_MAX_EDGE = 8192;
export const PNG_MAX_PIXELS = 16 * 1024 * 1024;
export function pngOutputSize(width, height, ratio) {
  width = Number(width);
  if (!Number.isInteger(width) || width < 1 || !Number.isFinite(ratio) || ratio <= 0) throw new Error("PNG 宽度须为正整数，裁剪范围须有效。");
  const expected = Math.max(1, Math.round(width / ratio));
  if (height != null && Number(height) !== expected) throw new Error(`PNG 高度须保持当前范围比例，应为 ${expected} 像素。`);
  assertPngBudget(width, expected);
  return {width, height: expected};
}
export function assertPngBudget(width, height, gpuLimit = PNG_MAX_EDGE) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= Math.min(PNG_MAX_EDGE, gpuLimit)) || width * height > PNG_MAX_PIXELS) throw new Error("PNG 超出导出预算：单边最多 8192 像素、总计最多 1600 万像素，请缩小输出或裁剪范围。");
}
