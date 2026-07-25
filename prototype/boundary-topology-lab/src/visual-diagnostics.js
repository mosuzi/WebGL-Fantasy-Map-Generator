const AREA_KIND_LABELS = Object.freeze({coast: "海岸", state: "国界", province: "省界"});

export function resolveComparisonPresentation(sharedArcCount, comparisonKind = false) {
  if (comparisonKind === "pixel-parity") {
    return Object.freeze({
      kind: "pixel-parity",
      firstMode: "legacy-pixel-seams",
      secondMode: "exact-pixel-parity",
      firstTitle: "正式旧策略：长针 + 浅色带",
      firstNote: "stage-2-1 / 10k 的 #6496/#6617 与 #6377/#6378",
      secondTitle: "正式新策略：边缘覆盖 + 细描边"
    });
  }
  if (comparisonKind === "vertex-collapse") {
    return Object.freeze({
      kind: "vertex-collapse",
      firstMode: "collapsed-grid-surface",
      secondMode: "resolved-grid-surface",
      firstTitle: "正式旧数据：共享边坍缩",
      firstNote: "cell #6255 / #6378 的 v5331、v5519 同为 [397,608]",
      secondTitle: "正式新 writer：精确端点回算"
    });
  }
  if (comparisonKind === "cell-fan") {
    return Object.freeze({
      kind: "cell-fan",
      firstMode: "legacy-cell-fan",
      secondMode: "earcut-cell-surface",
      firstTitle: "正式旧 writer：中心扇形",
      firstNote: "stage-2-1 / 10k 的 cell #1061 与 #8832；红边三角跨出自身边界",
      secondTitle: "正式新 writer：边界 Earcut"
    });
  }
  if (comparisonKind === "band") {
    return Object.freeze({
      kind: "band",
      firstMode: "legacy-band",
      secondMode: "exact-surface",
      firstTitle: "旧策略：四三角过渡带",
      firstNote: "红色三角面与其余三角面的绕向相反",
      secondTitle: "最终策略：XOR 填色 + 共享描边"
    });
  }
  if (comparisonKind) {
    return Object.freeze({
      kind: "surface",
      firstMode: "legacy-surface",
      secondMode: "shared-surface",
      firstTitle: "旧策略：原始填色 + 局部修补",
      firstNote: "红色区域为未覆盖 raw XOR processed",
      secondTitle: "XOR 策略：差区三角面 + 描边"
    });
  }
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
  const surface = result.metrics.surfaceClassification;
  if (surface) {
    diagnostics.push({
      id: "surface:legacy-mismatch",
      source: "surface",
      message: `旧策略留下 ${surface.legacyMismatchSamples} 个错分采样点（${surface.legacyMismatchArea.toFixed(0)} px²），左图红色区域可定位`
    });
    diagnostics.push({
      id: "surface:shared-mismatch",
      source: surface.sharedMismatchSamples ? "acceptance" : "surface-pass",
      message: `XOR 修补后二维分类错分 ${surface.sharedMismatchSamples} 点`
    });
  }
  const band = result.metrics.bandTriangleGeometry;
  if (band) {
    diagnostics.push({
      id: "band:legacy-opposite-winding",
      source: "surface",
      message: `旧 writer 的四个三角面中有 ${band.legacyOppositeWindingCount} 个反向面，左图红色三角扇可定位`
    });
    diagnostics.push({
      id: "band:final-triangles",
      source: band.finalTriangleCount ? "acceptance" : "surface-pass",
      message: `最终精确填色路径提交的冗余过渡带三角面：${band.finalTriangleCount} 个`
    });
  }
  const cellFan = result.metrics.cellFanGeometry;
  if (cellFan) {
    diagnostics.push({
      id: "cell-fan:formal-reproduction",
      source: "surface",
      message: `正式 ${cellFan.source.seed} / ${cellFan.source.cellsTarget} 地图的 ${cellFan.cases.length} 个原始单元在左图复现 ${cellFan.legacyLeakCount} 个越界三角、${cellFan.legacyRasterLeakSamples} 个 0.1 世界单位异侧采样`
    });
    diagnostics.push({
      id: "cell-fan:earcut-contained",
      source: cellFan.finalLeakCount ? "acceptance" : "surface-pass",
      message: `使用真实边界 Earcut 后，越界三角 ${cellFan.finalLeakCount} 个、异侧采样 ${cellFan.finalRasterLeakSamples} 个`
    });
  }
  const vertexCollapse = result.metrics.vertexCollapseGeometry;
  if (vertexCollapse) {
    diagnostics.push({
      id: "vertex-collapse:formal-reproduction",
      source: "surface",
      message: `正式 ${vertexCollapse.source.seed} / ${vertexCollapse.source.cellsTarget} 的旧共享边长度 ${vertexCollapse.storedEdgeLength.toFixed(3)}，左图原样复现单点断面`
    });
    diagnostics.push({
      id: "vertex-collapse:resolved",
      source: vertexCollapse.projectedCssLength >= 0.9 ? "surface-pass" : "acceptance",
      message: `精确端点回算后共享边 ${vertexCollapse.resolvedEdgeLength.toFixed(3)} 世界单位；当前 12x 现场投影 ${vertexCollapse.projectedCssLength.toFixed(2)} CSS px`
    });
  }
  const pixelParity = result.metrics.pixelParityGeometry;
  if (pixelParity) {
    diagnostics.push({
      id: "pixel-parity:lake-needle",
      source: "surface",
      message: `正式湖岸 #${pixelParity.lakeNeedle.landCell}/#${pixelParity.lakeNeedle.waterCell} 的修补面边缘旧侧裸露 ${pixelParity.legacyUncoveredBoundaryEdges} 条，最终以 ${pixelParity.finalBoundaryCoverWorld.toFixed(2)} 世界单位同色覆盖收敛到 ${pixelParity.finalUncoveredBoundaryEdges} 条`
    });
    diagnostics.push({
      id: "pixel-parity:coast-stroke",
      source: pixelParity.finalProjectedStrokeCss <= pixelParity.maximumFinalCssWidth ? "surface-pass" : "acceptance",
      message: `正式海岸 #${pixelParity.coastStroke.landCell}/#${pixelParity.coastStroke.waterCell} 在截图投影下由 ${pixelParity.legacyProjectedStrokeCss.toFixed(2)}px 收敛到 ${pixelParity.finalProjectedStrokeCss.toFixed(2)}px`
    });
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
