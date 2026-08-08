const EPSILON = 1e-7;

export function auditRiverNetwork(snapshot, options = {}) {
  const settings = {
    attachTolerance: 12,
    minLength: 24,
    minWidth: 0.035,
    intersectionTolerance: 3,
    ...options
  };
  const rivers = Array.isArray(snapshot?.rivers) ? snapshot.rivers.filter(Boolean) : [];
  const byId = new Map(rivers.map(river => [Number(river.id), river]));
  const issues = [];
  const diagnostics = [];
  const add = (issue, collection = issues) => collection.push({
    evidence: snapshot?.evidence || "fixture",
    severity: "warn",
    ...issue,
    riverIds: [...new Set((issue.riverIds || []).map(Number))].sort((a, b) => a - b),
    cells: [...new Set((issue.cells || []).filter(Number.isInteger))],
    points: (issue.points || []).map(point => point.map(value => Number(value.toFixed(3))))
  });
  const getPoints = river => Array.isArray(river.points) ? river.points.filter(isPoint) : [];

  for (const river of rivers) {
    const points = getPoints(river);
    const length = polylineLength(points);
    if (points.length < 3 || length < settings.minLength || Number(river.width || 0) < settings.minWidth) {
      add({
        id: "thin-fragment",
        message: "河流折线过短、过细或点数不足，可能形成离散视觉碎片。",
        metrics: {pointCount: points.length, length: round(length), width: Number(river.width || 0)},
        riverIds: [river.id],
        cells: river.cells,
        points: points.slice(0, 2)
      });
    }
    const repeatedCells = repeatedIntegers(river.cells);
    if (repeatedCells.length) add({
      id: "path-cell-repeat",
      message: "同一河流路径重复经过 cell，疑似局部环路或回退错误。",
      riverIds: [river.id],
      cells: repeatedCells,
      points,
      metrics: {repeatedCellCount: repeatedCells.length}
    });
    const outletKind = String(river.outletKind || "");
    if (outletKind.includes("lake")) add({
      id: "lake-routing-review",
      severity: "info",
      message: "检测到湖泊入流 / 溢流语义，保留给湖泊路由专题复核。",
      riverIds: [river.id],
      cells: river.cells,
      points: points.slice(-2),
      metrics: {outletKind, lakeId: river.lakeId ?? null}
    }, diagnostics);
    if (outletKind === "ocean" || outletKind === "border") add({
      id: "border-mouth-review",
      severity: "info",
      message: "检测到边界或入海出口，保留末端坐标和出口类型证据。",
      riverIds: [river.id],
      cells: river.cells,
      points: points.slice(-2),
      metrics: {outletKind, mouth: river.mouth || points.at(-1) || null}
    }, diagnostics);
  }

  for (const river of rivers) {
    const parentId = Number(river.parent || 0);
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) {
      add({id: "missing-parent", message: "河流声明的父河流不存在。", riverIds: [river.id], cells: river.cells});
      continue;
    }
    const childEnd = getPoints(river).at(-1);
    const parentPoints = getPoints(parent);
    const attachment = childEnd && parentPoints.length ? closestPointOnPolyline(childEnd, parentPoints) : null;
    if (attachment && attachment.distance > settings.attachTolerance) add({
      id: "tributary-unattached",
      message: "支流末端没有落在声明的干流附近。",
      riverIds: [river.id, parent.id],
      cells: [...(river.cells || []), ...(parent.cells || [])],
      points: childEnd && attachment.point ? [childEnd, attachment.point] : [],
      metrics: {distance: round(attachment.distance), tolerance: settings.attachTolerance}
    });
    if (Number(river.discharge || 0) > Number(parent.discharge || 0) + EPSILON) add({
      id: "tributary-discharge-over-parent",
      message: "支流 discharge 超过接收干流，违反当前网络守恒假设。",
      riverIds: [river.id, parent.id],
      metrics: {child: Number(river.discharge || 0), parent: Number(parent.discharge || 0)}
    });
    if (Number(river.width || 0) > Number(parent.width || 0) + EPSILON) add({
      id: "tributary-width-over-parent",
      message: "支流显示宽度超过接收干流，可能导致河网视觉倒置。",
      riverIds: [river.id, parent.id],
      metrics: {child: Number(river.width || 0), parent: Number(parent.width || 0)}
    });
  }

  for (const cycle of findParentCycles(rivers)) add({
    id: "parent-cycle",
    message: "父子关系图包含环路，河网没有唯一的下游方向。",
    riverIds: cycle,
    metrics: {cycleLength: cycle.length}
  });

  let segmentCount = 0;
  let crossingCount = 0;
  let validConfluenceCount = 0;
  for (let leftIndex = 0; leftIndex < rivers.length; leftIndex += 1) {
    const leftPoints = getPoints(rivers[leftIndex]);
    for (let rightIndex = leftIndex + 1; rightIndex < rivers.length; rightIndex += 1) {
      const rightPoints = getPoints(rivers[rightIndex]);
      const intersections = polylineIntersections(leftPoints, rightPoints);
      if (!intersections.length) continue;
      const left = rivers[leftIndex];
      const right = rivers[rightIndex];
      const related = Number(left.parent || 0) === Number(right.id) || Number(right.parent || 0) === Number(left.id);
      const child = Number(left.parent || 0) === Number(right.id) ? left : Number(right.parent || 0) === Number(left.id) ? right : null;
      const childEnd = child ? getPoints(child).at(-1) : null;
      const attached = childEnd && intersections.some(point => distance(childEnd, point) <= settings.intersectionTolerance);
      if (related && attached) {
        validConfluenceCount += intersections.length;
        add({id: "valid-confluence", severity: "info", message: "父子河流在折线交点处汇合。", riverIds: [left.id, right.id], cells: [...(left.cells || []), ...(right.cells || [])], points: intersections, metrics: {intersectionCount: intersections.length}}, diagnostics);
      } else {
        crossingCount += intersections.length;
        add({id: "non-confluence-crossing", message: "河流折线相交，但没有可证明的父子汇流关系。", riverIds: [left.id, right.id], cells: [...(left.cells || []), ...(right.cells || [])], points: intersections, metrics: {intersectionCount: intersections.length}});
      }
    }
  }
  segmentCount = rivers.reduce((total, river) => total + Math.max(0, getPoints(river).length - 1), 0);

  const allFindings = [...issues, ...diagnostics];
  const byIssue = Object.fromEntries([...groupById(allFindings)].map(([id, values]) => [id, values]));
  return {
    ok: issues.every(issue => issue.severity === "info"),
    issues: allFindings,
    errors: issues.filter(issue => issue.severity !== "info"),
    diagnostics,
    byIssue,
    metrics: {
      rivers: rivers.length,
      segments: segmentCount,
      crossings: crossingCount,
      validConfluences: validConfluenceCount,
      issueCount: allFindings.length,
      errorCount: issues.filter(issue => issue.severity !== "info").length,
      settings
    }
  };
}

export function snapshotGeneratedMap(map) {
  const sourceRivers = Array.isArray(map?.rivers?.rivers) ? map.rivers.rivers : Array.isArray(map?.rivers) ? map.rivers : [];
  return {
    evidence: "generated",
    metadata: {
      seed: map?.metadata?.seed || map?.options?.seed || "",
      cellsTarget: map?.metadata?.cellsTarget || map?.options?.cellsTarget || 0,
      gridCells: map?.metadata?.gridCells || map?.grid?.metadata?.actualCells || 0,
      checksum: map?.metadata?.checksum || map?.summary?.checksum || ""
    },
    rivers: sourceRivers.map(river => ({
      id: river.id,
      parent: river.parent || 0,
      discharge: river.discharge || 0,
      flux: river.flux || 0,
      width: river.width || 0,
      length: river.length || 0,
      cells: Array.isArray(river.cells) ? [...river.cells] : [],
      points: Array.isArray(river.points) ? river.points.map(point => point.slice(0, 2)) : [],
      outletKind: river.outletKind || "",
      mouth: Array.isArray(river.mouth) ? river.mouth.slice(0, 2) : river.mouth || null,
      lakeId: river.lakeId ?? null
    }))
  };
}

function isPoint(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1], points[index]);
  return length;
}

function closestPointOnPolyline(point, points) {
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = closestPointOnSegment(point, points[index - 1], points[index]);
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best;
}

function closestPointOnSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0;
  const projected = [start[0] + ratio * dx, start[1] + ratio * dy];
  return {point: projected, distance: distance(point, projected)};
}

function repeatedIntegers(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (!Number.isInteger(value)) continue;
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function findParentCycles(rivers) {
  const byId = new Map(rivers.map(river => [Number(river.id), river]));
  const cycles = [];
  const visited = new Set();
  for (const river of rivers) {
    const path = [];
    const indexById = new Map();
    let current = Number(river.id);
    while (current && byId.has(current)) {
      if (indexById.has(current)) {
        cycles.push(path.slice(indexById.get(current)));
        break;
      }
      if (visited.has(current)) break;
      indexById.set(current, path.length);
      path.push(current);
      current = Number(byId.get(current).parent || 0);
    }
    path.forEach(id => visited.add(id));
  }
  return cycles;
}

function polylineIntersections(left, right) {
  const intersections = [];
  for (let leftIndex = 1; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex < right.length; rightIndex += 1) {
      const intersection = segmentIntersection(left[leftIndex - 1], left[leftIndex], right[rightIndex - 1], right[rightIndex]);
      if (intersection && !intersections.some(point => distance(point, intersection) < 0.01)) intersections.push(intersection);
    }
  }
  return intersections;
}

function segmentIntersection(a, b, c, d) {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denominator) < EPSILON) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function groupById(values) {
  const groups = new Map();
  for (const value of values) {
    if (!groups.has(value.id)) groups.set(value.id, []);
    groups.get(value.id).push(value);
  }
  return groups;
}

function round(value) {
  return Number(value.toFixed(3));
}
