export function auditCanvasTextSources({indexSource, rendererSource, stylesSource, registry}) {
  const registeredIds = new Set((registry || []).map(entry => entry.id));
  const fixed = auditMapStageText(indexSource, registeredIds);
  const dynamic = auditRendererText(rendererSource, registeredIds);
  const cssContractViolations = fixed.unregisteredTextNodes
    .filter(item => item.classes.some(className => cssHasClassSelector(stylesSource, className)));
  return {
    fixedTextNodes: fixed.textNodes,
    declaredFixedIds: fixed.declaredIds,
    unregisteredFixedTextNodes: fixed.unregisteredTextNodes,
    unknownFixedIds: fixed.unknownIds,
    dynamicHelperCalls: dynamic.helperCalls,
    directDynamicTextWrites: dynamic.directWrites,
    unknownDynamicIds: dynamic.unknownIds,
    cssContractViolations,
    violationCount: fixed.unregisteredTextNodes.length
      + fixed.unknownIds.length
      + dynamic.directWrites.length
      + dynamic.unknownIds.length
  };
}

function auditMapStageText(source, registeredIds) {
  const fragment = extractMapStage(String(source || ""));
  const stack = [];
  const textNodes = [];
  const declaredIds = [];
  const unregisteredTextNodes = [];
  const unknownIds = [];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  for (const tokenMatch of fragment.matchAll(tokenPattern)) {
    const token = tokenMatch[0];
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const tag = token.match(/^<([\w:-]+)/)?.[1]?.toLowerCase() || "";
      const attributes = parseAttributes(token);
      const id = attributes["data-canvas-text-id"] || "";
      if (id) {
        declaredIds.push(id);
        if (!registeredIds.has(id)) unknownIds.push({id, tag, excerpt: token.slice(0, 160)});
      }
      if (!isVoidTag(tag) && !token.endsWith("/>")) stack.push({tag, attributes});
      continue;
    }
    const text = decodeText(token).trim();
    if (!text || stack.some(item => ["script", "style", "title"].includes(item.tag))) continue;
    const nearest = stack.at(-1) || {tag: "", attributes: {}};
    const record = {
      text,
      tag: nearest.tag,
      id: nearest.attributes.id || "",
      classes: String(nearest.attributes.class || "").split(/\s+/).filter(Boolean),
      canvasTextId: nearest.attributes["data-canvas-text-id"] || ""
    };
    textNodes.push(record);
    if (!record.canvasTextId || !registeredIds.has(record.canvasTextId)) unregisteredTextNodes.push(record);
  }
  return {textNodes, declaredIds: unique(declaredIds), unregisteredTextNodes, unknownIds};
}

function auditRendererText(source, registeredIds) {
  const renderer = String(source || "");
  const directWrites = [];
  for (const pattern of [
    /\.[\s]*(?:textContent|innerText)\s*=/g,
    /\.insertAdjacentText\s*\(/g,
    /\.createTextNode\s*\(/g
  ]) {
    for (const match of renderer.matchAll(pattern)) directWrites.push(sourceLocation(renderer, match.index, match[0]));
  }
  const helperCalls = [];
  const unknownIds = [];
  const helperPattern = /(?:setDynamicCanvasTextContent|markDynamicCanvasTextNode)\s*\([^,]+,\s*("[^"]+"|'[^']+'|styleType)\s*[,)]/g;
  for (const match of renderer.matchAll(helperPattern)) {
    const expression = match[1];
    const id = expression === "styleType" ? "<semantic-style-type>" : expression.slice(1, -1);
    const call = {...sourceLocation(renderer, match.index, match[0]), id};
    helperCalls.push(call);
    if (id !== "<semantic-style-type>" && !registeredIds.has(id)) unknownIds.push(call);
  }
  return {directWrites, helperCalls, unknownIds};
}

function extractMapStage(source) {
  const startMatch = source.match(/<section\b[^>]*class="[^"]*\bmap-stage\b[^"]*"[^>]*>/i);
  if (!startMatch || startMatch.index === undefined) throw new Error("未找到 map-stage 固定 DOM");
  const start = startMatch.index;
  const tagPattern = /<\/?section\b[^>]*>/gi;
  tagPattern.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(source))) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return source.slice(start, match.index + match[0].length);
  }
  throw new Error("map-stage 固定 DOM 未闭合");
}

function parseAttributes(tagSource) {
  const attributes = {};
  for (const match of tagSource.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (name.startsWith("<")) continue;
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function decodeText(value) {
  return value.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function cssHasClassSelector(source, className) {
  if (!className) return false;
  return new RegExp(`\\.${escapeRegExp(className)}(?:[^\\w-]|$)`).test(source);
}

function sourceLocation(source, index, excerpt) {
  return {
    line: source.slice(0, index).split("\n").length,
    excerpt: excerpt.slice(0, 160)
  };
}

function isVoidTag(tag) {
  return new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]).has(tag);
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
