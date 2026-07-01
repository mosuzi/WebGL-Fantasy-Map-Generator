export const MAP_DOCUMENT_TYPE = "webgl-generator-map";
export const MAP_DOCUMENT_VERSION = 1;

const TYPED_ARRAYS = Object.freeze({
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array: typeof BigInt64Array === "function" ? BigInt64Array : null,
  BigUint64Array: typeof BigUint64Array === "function" ? BigUint64Array : null
});

export function createMapDocument(map, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  return {
    type: MAP_DOCUMENT_TYPE,
    version: MAP_DOCUMENT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "fmg-webgl-reimplementation",
    metadata: {
      seed: map.metadata?.seed || options.seed,
      checksum: map.metadata?.checksum || null,
      generatorStage: map.metadata?.generatorStage || null
    },
    options: {...options},
    map
  };
}

export function stringifyMapDocument(document) {
  return JSON.stringify(document, typedArrayReplacer);
}

export function parseMapDocument(text) {
  const document = JSON.parse(text, typedArrayReviver);
  if (document?.type !== MAP_DOCUMENT_TYPE) throw new Error("文件不是当前地图保存格式");
  if (document.version !== MAP_DOCUMENT_VERSION) throw new Error(`暂不支持的地图格式版本：${document.version}`);
  if (!document.map || typeof document.map !== "object") throw new Error("地图文件缺少 map 数据");
  return document;
}

export function createMapGeoJson(map) {
  if (!map) throw new Error("当前没有可导出的地图");
  const cells = map.pack?.cells;
  const vertices = map.pack?.vertices?.p;
  if (!cells?.i || !vertices) throw new Error("当前地图缺少 pack cell 地理数据");
  const features = [];
  for (let index = 0; index < cells.i.length; index += 1) {
    const vertexIds = cells.v?.[index];
    if (!Array.isArray(vertexIds) || vertexIds.length < 3) continue;
    const ring = vertexIds.map(vertexId => projectWorldPoint(vertices[vertexId], map)).filter(Boolean);
    if (ring.length < 3) continue;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    const stateId = Number(cells.state?.[index]) || 0;
    const provinceId = Number(cells.province?.[index]) || 0;
    const cultureId = Number(cells.culture?.[index]) || 0;
    const religionId = Number(cells.religion?.[index]) || 0;
    features.push({
      type: "Feature",
      id: Number(cells.i[index]) || index,
      properties: {
        cell: Number(cells.i[index]) || index,
        height: Number(cells.h?.[index]) || 0,
        isWater: (Number(cells.h?.[index]) || 0) < 20,
        feature: Number(cells.f?.[index]) || 0,
        biome: Number(cells.biome?.[index]) || 0,
        state: stateId,
        stateName: map.politics?.states?.[stateId]?.name || "",
        province: provinceId,
        provinceName: map.politics?.provinces?.[provinceId]?.name || "",
        culture: cultureId,
        cultureName: map.society?.cultures?.[cultureId]?.name || "",
        religion: religionId,
        religionName: map.society?.religions?.[religionId]?.name || "",
        population: Number(cells.pop?.[index]) || 0
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      }
    });
  }

  return {
    type: "FeatureCollection",
    name: map.metadata?.seed ? `fmg-${map.metadata.seed}` : "fmg-webgl-map",
    properties: {
      source: "fmg-webgl-reimplementation",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      generatedAt: map.metadata?.generatedAt || "",
      graphWidth: map.metadata?.graphWidth || 0,
      graphHeight: map.metadata?.graphHeight || 0,
      coordinateReference: "approximate-equirectangular"
    },
    features
  };
}

export function createMapFeatureGeoJson(map) {
  if (!map) throw new Error("当前没有可导出的地图");
  const features = [
    ...routeFeatures(map),
    ...riverFeatures(map),
    ...markerFeatures(map),
    ...zoneFeatures(map)
  ];

  return {
    type: "FeatureCollection",
    name: map.metadata?.seed ? `fmg-${map.metadata.seed}-features` : "fmg-webgl-map-features",
    properties: {
      source: "fmg-webgl-reimplementation",
      layerSet: "routes-rivers-markers-zones",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      generatedAt: map.metadata?.generatedAt || "",
      routes: map.settlements?.routes?.length || 0,
      rivers: map.rivers?.rivers?.length || 0,
      markers: map.markers?.markers?.length || 0,
      zones: map.zones?.zones?.length || 0
    },
    features
  };
}

export function downloadJson(documentRef, data, filename, replacer = null) {
  const text = JSON.stringify(data, replacer);
  downloadBlob(documentRef, new Blob([text], {type: "application/json;charset=utf-8"}), filename);
}

export function downloadText(documentRef, text, filename, type = "text/plain;charset=utf-8") {
  downloadBlob(documentRef, new Blob([text], {type}), filename);
}

export function downloadCanvasPng(documentRef, canvas, filename, options = {}) {
  return new Promise((resolve, reject) => {
    if (!canvas?.toBlob) {
      reject(new Error("当前浏览器不支持 canvas 图片导出"));
      return;
    }
    const exportCanvas = options.includeMapOverlays ? composeMapExportCanvas(documentRef, canvas) : canvas;
    exportCanvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("图片导出失败"));
        return;
      }
      downloadBlob(documentRef, blob, filename);
      resolve();
    }, "image/png");
  });
}

export function mapFileBaseName(map) {
  const seed = sanitizeFilename(map?.metadata?.seed || "map");
  const checksum = sanitizeFilename(map?.metadata?.checksum || "");
  return checksum ? `fmg-${seed}-${checksum}` : `fmg-${seed}`;
}

function typedArrayReplacer(_key, value) {
  if (!ArrayBuffer.isView(value) || value instanceof DataView) return value;
  return {
    __webglGeneratorTypedArray: value.constructor.name,
    data: Array.from(value)
  };
}

function typedArrayReviver(_key, value) {
  const type = value?.__webglGeneratorTypedArray;
  if (!type) return value;
  const Constructor = TYPED_ARRAYS[type];
  if (typeof Constructor !== "function") throw new Error(`无法读取 typed array：${type}`);
  return new Constructor(value.data || []);
}

function projectWorldPoint(point, map) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const x = Number(point[0]);
  const y = Number(point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const width = Math.max(1, Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1);
  const height = Math.max(1, Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1);
  const coordinates = map.mapCoordinates || {};
  const lonW = Number.isFinite(Number(coordinates.lonW)) ? Number(coordinates.lonW) : 0;
  const lonE = Number.isFinite(Number(coordinates.lonE)) ? Number(coordinates.lonE) : width;
  const latN = Number.isFinite(Number(coordinates.latN)) ? Number(coordinates.latN) : 0;
  const latS = Number.isFinite(Number(coordinates.latS)) ? Number(coordinates.latS) : height;
  const lon = lonW + (x / width) * (lonE - lonW);
  const lat = latN + (y / height) * (latS - latN);
  return [roundCoordinate(lon), roundCoordinate(lat)];
}

function routeFeatures(map) {
  return (map.settlements?.routes || []).map(route => {
    const coordinates = lineCoordinates(route.points, map);
    if (coordinates.length < 2) return null;
    return {
      type: "Feature",
      id: `route-${route.id}`,
      properties: {
        layer: "route",
        id: route.id,
        type: route.type,
        level: route.level,
        state: route.state || 0,
        province: route.province || 0,
        from: route.from ?? -1,
        to: route.to ?? -1,
        cells: route.cells?.length || 0,
        distance: roundCoordinate(worldLineLength(route.points))
      },
      geometry: {
        type: "LineString",
        coordinates
      }
    };
  }).filter(Boolean);
}

function riverFeatures(map) {
  return (map.rivers?.rivers || []).map(river => {
    const coordinates = lineCoordinates(river.points, map);
    if (coordinates.length < 2) return null;
    return {
      type: "Feature",
      id: `river-${river.id}`,
      properties: {
        layer: "river",
        id: river.id,
        name: river.name || "",
        type: river.type || "",
        source: river.source ?? -1,
        mouth: river.mouth ?? -1,
        parent: river.parent || 0,
        basin: river.basin || river.id,
        flux: river.flux || river.discharge || 0,
        length: river.length || roundCoordinate(worldLineLength(river.points)),
        width: river.width || 0,
        widthFactor: river.widthFactor || 1
      },
      geometry: {
        type: "LineString",
        coordinates
      }
    };
  }).filter(Boolean);
}

function markerFeatures(map) {
  return (map.markers?.markers || []).map(marker => {
    const coordinate = projectWorldPoint([marker.x, marker.y], map);
    if (!coordinate) return null;
    return {
      type: "Feature",
      id: `marker-${marker.id}`,
      properties: {
        layer: "marker",
        id: marker.id,
        name: marker.name || marker.label || "",
        type: marker.type || "",
        label: marker.label || "",
        category: marker.category || "",
        categoryLabel: marker.categoryLabel || "",
        resourceKey: marker.resourceKey || "",
        resourceLabel: marker.resourceLabel || "",
        economicValue: marker.economicValue || 0,
        state: marker.data?.state || 0,
        province: marker.data?.province || 0,
        cell: marker.cell ?? -1,
        packCell: marker.packCell ?? -1
      },
      geometry: {
        type: "Point",
        coordinates: coordinate
      }
    };
  }).filter(Boolean);
}

function zoneFeatures(map) {
  return (map.zones?.zones || []).map(zone => {
    const polygons = (zone.cells || []).map(cell => packCellPolygon(map, cell)).filter(Boolean);
    if (!polygons.length) return null;
    return {
      type: "Feature",
      id: `zone-${zone.i ?? zone.id}`,
      properties: {
        layer: "zone",
        id: zone.i ?? zone.id,
        name: zone.name || "",
        type: zone.type || "",
        hidden: Boolean(zone.hidden),
        cells: zone.cells?.length || 0,
        color: zone.color || ""
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: polygons
      }
    };
  }).filter(Boolean);
}

function packCellPolygon(map, cell) {
  const vertexIds = map.pack?.cells?.v?.[cell];
  const vertices = map.pack?.vertices?.p;
  if (!Array.isArray(vertexIds) || vertexIds.length < 3 || !vertices) return null;
  const ring = vertexIds.map(vertexId => projectWorldPoint(vertices[vertexId], map)).filter(Boolean);
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return [ring];
}

function lineCoordinates(points, map) {
  return (points || []).map(point => projectWorldPoint(point, map)).filter(Boolean);
}

function worldLineLength(points) {
  let length = 0;
  for (let index = 1; index < (points || []).length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    length += Math.hypot(Number(b[0]) - Number(a[0]), Number(b[1]) - Number(a[1]));
  }
  return length;
}

function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6;
}

function downloadBlob(documentRef, blob, filename) {
  const view = documentRef.defaultView || window;
  const url = view.URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  documentRef.body.append(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
}

function composeMapExportCanvas(documentRef, canvas) {
  const output = documentRef.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) return canvas;
  context.drawImage(canvas, 0, 0, output.width, output.height);

  const canvasRect = canvas.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height) return output;
  const scale = {
    x: output.width / canvasRect.width,
    y: output.height / canvasRect.height
  };

  drawMapBadge(documentRef, context, canvasRect, scale);
  drawMapScaleBar(documentRef, context, canvasRect, scale);
  return output;
}

function drawMapBadge(documentRef, context, canvasRect, scale) {
  const badge = documentRef.getElementById("map-badge");
  if (!isVisibleElement(badge)) return;
  const box = elementBox(badge, canvasRect, scale);
  if (!box) return;
  drawPanel(context, box, 6 * scale.x, "rgba(12, 18, 22, 0.8)", "rgba(208, 221, 225, 0.24)");
  drawText(context, badge.textContent.trim(), box.x + 10 * scale.x, box.y + box.height / 2, {
    color: "#d7e1e5",
    fontSize: 12 * scale.y,
    baseline: "middle",
    maxWidth: box.width - 20 * scale.x
  });
}

function drawMapScaleBar(documentRef, context, canvasRect, scale) {
  const scaleBar = documentRef.getElementById("map-scale-bar");
  const line = scaleBar?.querySelector(".map-scale-line");
  const label = scaleBar?.querySelector(".map-scale-label");
  if (!isVisibleElement(scaleBar) || !isVisibleElement(line) || !label?.textContent.trim()) return;

  const box = elementBox(scaleBar, canvasRect, scale);
  const lineBox = elementBox(line, canvasRect, scale);
  const labelBox = elementBox(label, canvasRect, scale);
  if (!box || !lineBox || !labelBox) return;

  drawPanel(context, box, 8 * scale.x, "rgba(12, 18, 22, 0.74)", "rgba(208, 221, 225, 0.24)");
  const lineWidth = Math.max(1, 2 * Math.min(scale.x, scale.y));
  const bottom = lineBox.y + lineBox.height - lineWidth / 2;
  const top = lineBox.y + lineWidth / 2;
  const left = lineBox.x + lineWidth / 2;
  const right = lineBox.x + lineBox.width - lineWidth / 2;
  context.save();
  context.strokeStyle = "#edf4f6";
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, bottom);
  context.lineTo(right, bottom);
  context.lineTo(right, top);
  context.stroke();
  context.restore();

  drawText(context, label.textContent.trim(), labelBox.x, labelBox.y + labelBox.height / 2, {
    color: "rgba(242, 248, 249, 0.94)",
    fontSize: 11 * scale.y,
    fontWeight: 700,
    baseline: "middle",
    maxWidth: box.width - 20 * scale.x
  });
}

function isVisibleElement(element) {
  if (!element || element.hidden) return false;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function elementBox(element, canvasRect, scale) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - canvasRect.left) * scale.x,
    y: (rect.top - canvasRect.top) * scale.y,
    width: rect.width * scale.x,
    height: rect.height * scale.y
  };
}

function drawPanel(context, box, radius, fillStyle, strokeStyle) {
  context.save();
  context.fillStyle = fillStyle;
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1;
  roundedRectPath(context, box.x, box.y, box.width, box.height, radius);
  context.fill();
  context.stroke();
  context.restore();
}

function drawText(context, text, x, y, options) {
  if (!text) return;
  context.save();
  context.fillStyle = options.color;
  context.font = `${options.fontWeight || 400} ${Math.max(8, options.fontSize)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = options.baseline || "alphabetic";
  context.fillText(text, x, y, options.maxWidth);
  context.restore();
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function sanitizeFilename(value) {
  return String(value || "map").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "map";
}
