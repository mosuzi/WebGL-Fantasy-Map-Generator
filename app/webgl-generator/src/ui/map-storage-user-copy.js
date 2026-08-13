export function browserMapSaveLoadingMessage(stage = "initial") {
  const value = String(stage || "").trim().toLowerCase();
  if (/write|storage|persist/.test(value)) return "正在妥存至浏览器";
  if (/base64|envelope|package|result-stream|output-stream/.test(value)) return "正在整理存档内容";
  if (/compress|gzip/.test(value)) return "正在压制存档体积";
  if (/complete|success|finish|done/.test(value)) return "地图存档已经妥善收好";
  return "正在收拢全图资料";
}
