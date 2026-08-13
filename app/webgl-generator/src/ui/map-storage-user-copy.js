export function browserMapSaveLoadingMessage(stage = "initial") {
  const value = String(stage || "").trim().toLowerCase();
  if (/write|storage|persist/.test(value)) return "正在妥存至浏览器";
  if (/input-stream/.test(value)) return "正在收拢全图资料";
  if (/base64|envelope|package|result-stream|output-stream|complete|success|finish|done/.test(value)) return "正在整理存档内容";
  if (/compress|gzip/.test(value)) return "正在压制存档体积";
  return "正在收拢全图资料";
}
