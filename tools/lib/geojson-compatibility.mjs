const EPSILON = 1e-9;

export function validatePoliticalDissolveGeoJson(collection, options = {}) {
  requireValue(collection?.type === "FeatureCollection", "根对象必须是 FeatureCollection");
  requireValue(Array.isArray(collection.features), "FeatureCollection.features 必须是数组");
  requireValue(collection.properties?.dissolvedPolitical === true, "FeatureCollection 必须标记 dissolvedPolitical=true");
  requireValue(collection.properties?.coordinateReference === "approximate-equirectangular", "FeatureCollection 必须声明近似等距圆柱坐标参考");
  validateBbox(collection.bbox, "FeatureCollection.bbox");

  const summary = {features: 0, polygons: 0, rings: 0, holes: 0, points: 0};
  const collectionPositions = [];
  for (let featureIndex = 0; featureIndex < collection.features.length; featureIndex += 1) {
    const feature = collection.features[featureIndex];
    const featurePath = `features[${featureIndex}]`;
    requireValue(feature?.type === "Feature", `${featurePath}.type 必须是 Feature`);
    requireValue(["state", "province", "zone"].includes(feature.properties?.layer), `${featurePath} 必须是政治面图层`);
    requireValue(feature.properties?.dissolved === true, `${featurePath} 必须标记 dissolved=true`);
    requireValue(feature.geometry?.type === "MultiPolygon", `${featurePath}.geometry 必须是 MultiPolygon`);
    requireValue(Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 0, `${featurePath}.coordinates 不得为空`);
    validateBbox(feature.bbox, `${featurePath}.bbox`);

    const featurePositions = [];
    const polygons = [];
    for (let polygonIndex = 0; polygonIndex < feature.geometry.coordinates.length; polygonIndex += 1) {
      const polygon = feature.geometry.coordinates[polygonIndex];
      const polygonPath = `${featurePath}.coordinates[${polygonIndex}]`;
      requireValue(Array.isArray(polygon) && polygon.length > 0, `${polygonPath} 必须至少包含一个 outer ring`);
      const outer = polygon[0];
      validateRing(outer, `${polygonPath}[0]`, true, options);
      summary.polygons += 1;
      summary.rings += 1;
      summary.points += outer.length;
      featurePositions.push(...outer);

      for (let ringIndex = 1; ringIndex < polygon.length; ringIndex += 1) {
        const hole = polygon[ringIndex];
        const ringPath = `${polygonPath}[${ringIndex}]`;
        validateRing(hole, ringPath, false, options);
        requireValue(pointInRing(hole[0], outer), `${ringPath} 必须位于所属 outer ring 内`);
        requireValue(!ringsIntersect(hole, outer), `${ringPath} 不得与 outer ring 相交`);
        for (let previousIndex = 1; previousIndex < ringIndex; previousIndex += 1) {
          const previousHole = polygon[previousIndex];
          requireValue(!ringsIntersect(hole, previousHole), `${ringPath} 不得与其它 hole 相交`);
          requireValue(!pointInRing(hole[0], previousHole) && !pointInRing(previousHole[0], hole), `${ringPath} 不得与其它 hole 嵌套`);
        }
        summary.rings += 1;
        summary.holes += 1;
        summary.points += hole.length;
        featurePositions.push(...hole);
      }
      for (let previousIndex = 0; previousIndex < polygons.length; previousIndex += 1) {
        requireValue(!polygonsOverlap(polygon, polygons[previousIndex]), `${polygonPath} 不得与同一 MultiPolygon 的其它 polygon 重叠`);
      }
      polygons.push(polygon);
    }

    assertBboxMatchesPositions(feature.bbox, featurePositions, `${featurePath}.bbox`);
    collectionPositions.push(...featurePositions);
    summary.features += 1;
  }

  requireValue(summary.features > 0, "政治面 FeatureCollection 不得为空");
  assertBboxMatchesPositions(collection.bbox, collectionPositions, "FeatureCollection.bbox");
  return summary;
}

function validateRing(ring, path, expectCounterClockwise, options) {
  requireValue(Array.isArray(ring) && ring.length >= 4, `${path} 至少需要 4 个坐标`);
  for (let index = 0; index < ring.length; index += 1) {
    const position = ring[index];
    requireValue(Array.isArray(position) && position.length >= 2, `${path}[${index}] 必须是坐标数组`);
    requireValue(Number.isFinite(position[0]) && Number.isFinite(position[1]), `${path}[${index}] 必须使用有限数值`);
    if (index > 0 && index < ring.length - 1) {
      requireValue(!samePosition(position, ring[index - 1]), `${path} 不得包含连续重复坐标`);
    }
  }
  requireValue(samePosition(ring[0], ring[ring.length - 1]), `${path} 必须闭合`);
  const area = signedArea(ring);
  requireValue(Math.abs(area) > EPSILON, `${path} 面积必须大于 0`);
  requireValue(expectCounterClockwise ? area > 0 : area < 0, `${path} 必须按 ${expectCounterClockwise ? "outer 逆时针" : "hole 顺时针"}方向输出`);
  if (options.checkSelfIntersections !== false) requireValue(!ringSelfIntersects(ring), `${path} 不得自交`);
}

function validateBbox(bbox, path) {
  requireValue(Array.isArray(bbox) && bbox.length === 4, `${path} 必须是 4 项数组`);
  requireValue(bbox.every(Number.isFinite), `${path} 必须使用有限数值`);
  requireValue(bbox[0] <= bbox[2] && bbox[1] <= bbox[3], `${path} 最小值不得大于最大值`);
}

function assertBboxMatchesPositions(bbox, positions, path) {
  requireValue(positions.length > 0, `${path} 没有可计算的坐标`);
  const expected = [Infinity, Infinity, -Infinity, -Infinity];
  for (const position of positions) {
    expected[0] = Math.min(expected[0], position[0]);
    expected[1] = Math.min(expected[1], position[1]);
    expected[2] = Math.max(expected[2], position[0]);
    expected[3] = Math.max(expected[3], position[1]);
  }
  requireValue(expected.every((value, index) => Math.abs(value - bbox[index]) <= EPSILON), `${path} 必须精确包围全部坐标`);
}

function ringSelfIntersects(ring) {
  const segmentCount = ring.length - 1;
  for (let left = 0; left < segmentCount; left += 1) {
    for (let right = left + 1; right < segmentCount; right += 1) {
      if (right === left + 1 || (left === 0 && right === segmentCount - 1)) continue;
      if (segmentsIntersect(ring[left], ring[left + 1], ring[right], ring[right + 1])) return true;
    }
  }
  return false;
}

function ringsIntersect(leftRing, rightRing) {
  for (let left = 0; left < leftRing.length - 1; left += 1) {
    for (let right = 0; right < rightRing.length - 1; right += 1) {
      if (segmentsIntersect(leftRing[left], leftRing[left + 1], rightRing[right], rightRing[right + 1])) return true;
    }
  }
  return false;
}

function polygonsOverlap(leftPolygon, rightPolygon) {
  if (ringsEquivalent(leftPolygon[0], rightPolygon[0])) return true;
  for (const leftRing of leftPolygon) {
    for (const rightRing of rightPolygon) {
      if (ringsProperlyIntersect(leftRing, rightRing) || ringsShareOverlappingInterior(leftRing, rightRing)) return true;
    }
  }
  return ringHasPointInPolygonInterior(leftPolygon[0], rightPolygon)
    || ringHasPointInPolygonInterior(rightPolygon[0], leftPolygon);
}

function ringsShareOverlappingInterior(leftRing, rightRing) {
  for (let left = 0; left < leftRing.length - 1; left += 1) {
    const a = leftRing[left];
    const b = leftRing[left + 1];
    for (let right = 0; right < rightRing.length - 1; right += 1) {
      const c = rightRing[right];
      const d = rightRing[right + 1];
      if (Math.abs(cross(a, b, c)) > EPSILON || Math.abs(cross(a, b, d)) > EPSILON) continue;
      const leftX = b[0] - a[0];
      const leftY = b[1] - a[1];
      const rightX = d[0] - c[0];
      const rightY = d[1] - c[1];
      if (leftX * rightX + leftY * rightY <= EPSILON) continue;
      const useX = Math.abs(leftX) >= Math.abs(leftY);
      const leftStart = useX ? a[0] : a[1];
      const leftEnd = useX ? b[0] : b[1];
      const rightStart = useX ? c[0] : c[1];
      const rightEnd = useX ? d[0] : d[1];
      const overlap = Math.min(Math.max(leftStart, leftEnd), Math.max(rightStart, rightEnd))
        - Math.max(Math.min(leftStart, leftEnd), Math.min(rightStart, rightEnd));
      if (overlap > EPSILON) return true;
    }
  }
  return false;
}

function ringsProperlyIntersect(leftRing, rightRing) {
  for (let left = 0; left < leftRing.length - 1; left += 1) {
    for (let right = 0; right < rightRing.length - 1; right += 1) {
      const a = leftRing[left];
      const b = leftRing[left + 1];
      const c = rightRing[right];
      const d = rightRing[right + 1];
      if (oppositeSigns(cross(a, b, c), cross(a, b, d)) && oppositeSigns(cross(c, d, a), cross(c, d, b))) return true;
    }
  }
  return false;
}

function ringHasPointInPolygonInterior(ring, polygon) {
  return ring.slice(0, -1).some(point => pointInPolygonInterior(point, polygon));
}

function pointInPolygonInterior(point, polygon) {
  if (polygon.some(ring => pointOnRing(point, ring))) return false;
  return pointInRing(point, polygon[0]) && !polygon.slice(1).some(hole => pointInRing(point, hole));
}

function pointOnRing(point, ring) {
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (Math.abs(cross(ring[index], ring[index + 1], point)) <= EPSILON && pointOnSegment(point, ring[index], ring[index + 1])) return true;
  }
  return false;
}

function ringsEquivalent(leftRing, rightRing) {
  if (leftRing.length !== rightRing.length) return false;
  return leftRing.slice(0, -1).every(left => rightRing.slice(0, -1).some(right => samePosition(left, right)));
}

function segmentsIntersect(a, b, c, d) {
  if (Math.max(a[0], b[0]) + EPSILON < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) + EPSILON < Math.min(a[0], b[0])) return false;
  if (Math.max(a[1], b[1]) + EPSILON < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) + EPSILON < Math.min(a[1], b[1])) return false;
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (oppositeSigns(abC, abD) && oppositeSigns(cdA, cdB)) return true;
  return Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b)
    || Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b)
    || Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d)
    || Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const before = ring[previous];
    if ((current[1] > point[1]) !== (before[1] > point[1])
      && point[0] < ((before[0] - current[0]) * (point[1] - current[1])) / (before[1] - current[1]) + current[0]) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point, start, end) {
  return point[0] >= Math.min(start[0], end[0]) - EPSILON
    && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON
    && point[1] <= Math.max(start[1], end[1]) + EPSILON;
}

function oppositeSigns(left, right) {
  return left > EPSILON && right < -EPSILON || left < -EPSILON && right > EPSILON;
}

function cross(a, b, point) {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function samePosition(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`GeoJSON 兼容性校验失败：${message}`);
}
