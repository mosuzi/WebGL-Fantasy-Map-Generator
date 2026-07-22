const AREA_KIND_LABELS = Object.freeze({coast: "海岸", state: "国界", province: "省界"});

export function resolveComparisonPresentation(sharedArcCount) {
  if (sharedArcCount > 0) {
    return Object.freeze({
      kind: "shared",
      firstMode: "independent",
      secondMode: "shared",
      firstTitle: "逐区域独立处理",
      firstNote: "边界两侧分别运算",
      secondTitle: "共享弧线处理"
    });
  }
  return Object.freeze({
    kind: "shape",
    firstMode: "raw",
    secondMode: "processed",
    firstTitle: "原始轮廓",
    firstNote: "变换前基线",
    secondTitle: "处理后轮廓"
  });
}

export function collectAreaP95Diagnostics(metrics) {
  return collectShapeDiagnostics(metrics).filter(item => item.metric === "area-p95");
}

export function collectShapeDiagnostics(metrics) {
  return (metrics.shapeDiagnostics || []).filter(item => item.exceeded && item.policy === "notice").map(item => ({
    ...item,
    source: "shape",
    message: shapeDiagnosticMessage(item)
  }));
}

export function mergeVisualDiagnostics(result) {
  const diagnostics = result.issues.map((message, index) => ({
    id: acceptanceIssueId(message, index),
    source: "acceptance",
    message: localizeAreaIssue(message)
  }));
  const ids = new Set(diagnostics.map(item => item.id));
  for (const observation of collectShapeDiagnostics(result.metrics)) {
    if (ids.has(observation.id)) continue;
    diagnostics.push(observation);
    ids.add(observation.id);
  }
  return diagnostics;
}

export function maximumDeviationZoomViewBox(maximum) {
  const first = maximum?.first?.point;
  const second = maximum?.second?.point;
  if (!Array.isArray(first) || first.length < 2 || !Array.isArray(second) || second.length < 2) return null;
  const [firstX, firstY] = first;
  const [secondX, secondY] = second;
  if (![firstX, firstY, secondX, secondY].every(Number.isFinite)) return null;
  const midpoint = [(firstX + secondX) / 2, (firstY + secondY) / 2];
  const measuredDistance = Math.hypot(firstX - secondX, firstY - secondY);
  const distance = Number.isFinite(maximum.distance) ? Math.max(maximum.distance, measuredDistance) : measuredDistance;
  const span = Math.max(10, distance * 5);
  const width = span * 1.35;
  const height = span;
  const minX = midpoint[0] - width / 2;
  const minY = midpoint[1] - height / 2;
  return {
    distance,
    minX,
    minY,
    width,
    height,
    viewBox: `${minX} ${minY} ${width} ${height}`
  };
}

function acceptanceIssueId(message, index) {
  const match = /^(coast|state|province) 面积 P95/.exec(message);
  return match ? `area-p95:${match[1]}` : `acceptance:${index}:${message}`;
}

function shapeDiagnosticMessage(diagnostic) {
  const label = AREA_KIND_LABELS[diagnostic.kind] || diagnostic.kind;
  if (diagnostic.metric === "hausdorff") {
    return `${label}${diagnostic.regionId ? ` ${diagnostic.regionId}` : ""} 双向 Hausdorff ${diagnostic.value.toFixed(3)} 超过参考值 ${diagnostic.limit}（仅提示，不影响验收）`;
  }
  return `${label}面积 P95 ${diagnostic.value.toFixed(3)}% 超过参考值 ${diagnostic.limit}%（仅提示，不影响验收）`;
}

function localizeAreaIssue(message) {
  return message.replace(/^(coast|state|province) 面积 P95/, (_, kind) => `${AREA_KIND_LABELS[kind]}面积 P95`);
}
