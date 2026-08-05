const ROUTE_WORLD_WIDTHS = Object.freeze({
  primary: 0.75,
  secondary: 0.48,
  minor: 0.28
});

export const ROUTE_SELECTION_HALO_CSS_PX = 2.4;

export function createLineWidthProjection({map, camera, canvas} = {}) {
  const scale = positive(camera?.scale, 1);
  const mapWidth = positive(map?.metadata?.graphWidth, 1);
  const mapHeight = positive(map?.metadata?.graphHeight, 1);
  const clientWidth = positive(canvas?.clientWidth, positive(canvas?.width, 1));
  const clientHeight = positive(canvas?.clientHeight, positive(canvas?.height, 1));
  const backingWidth = positive(canvas?.width, clientWidth);
  const backingHeight = positive(canvas?.height, clientHeight);
  const cssPerWorldX = scale * clientWidth / mapWidth;
  const cssPerWorldY = scale * clientHeight / mapHeight;
  const backingPerCssX = backingWidth / clientWidth;
  const backingPerCssY = backingHeight / clientHeight;
  return Object.freeze({
    scale,
    cssPerWorld: Math.sqrt(cssPerWorldX * cssPerWorldY),
    cssPerWorldX,
    cssPerWorldY,
    backingPerCss: Math.sqrt(backingPerCssX * backingPerCssY),
    backingPerCssX,
    backingPerCssY
  });
}

export function projectWorldLineWidth(worldWidth, projection, {haloCssPx = 0} = {}) {
  const normalizedWorldWidth = Math.max(0, finite(worldWidth));
  const baseCssWidth = normalizedWorldWidth * positive(projection?.cssPerWorld, 1);
  const normalizedHalo = Math.max(0, finite(haloCssPx));
  const cssWidth = baseCssWidth + normalizedHalo;
  return Object.freeze({
    scale: positive(projection?.scale, 1),
    worldWidth: normalizedWorldWidth,
    baseCssWidth,
    haloCssPx: normalizedHalo,
    cssWidth,
    backingWidth: cssWidth * positive(projection?.backingPerCss, 1),
    alpha: normalizedHalo > 0 ? 1 : subpixelLineAlpha(baseCssWidth),
    lod: lineWidthLod(baseCssWidth)
  });
}

export function routeWorldWidth(level) {
  return ROUTE_WORLD_WIDTHS[level] || ROUTE_WORLD_WIDTHS.minor;
}

export function riverWorldWidth({flux = 0, pointIndex = 0, widthFactor = 1, sourceWidth = 0.05} = {}) {
  const safeFlux = Math.max(0, finite(flux));
  const safeIndex = Math.max(0, finite(pointIndex));
  const safeFactor = Math.max(0.01, finite(widthFactor) || 1);
  const safeSourceWidth = Math.max(0.001, finite(sourceWidth) || 0.05);
  const lengthProgression = [1, 1, 2, 3, 5, 8, 13, 21, 34];
  const progression = (lengthProgression[Math.min(lengthProgression.length - 1, Math.floor(safeIndex))] || 34) / 200;
  const fluxWidth = Math.min(safeFlux ** 0.7 / 500, 1);
  const lengthWidth = safeIndex / 200 + progression;
  const offset = safeFactor * (lengthWidth + fluxWidth) + safeSourceWidth;
  const channelWidth = (offset / 1.5) ** 1.8 * 6;
  return safeSourceWidth * 1.6 + channelWidth;
}

export function withProjectedLineAlpha(color, alpha) {
  const source = Array.isArray(color) ? color : [0, 0, 0, 1];
  return [source[0] || 0, source[1] || 0, source[2] || 0, (source[3] ?? 1) * clamp01(alpha)];
}

function subpixelLineAlpha(cssWidth) {
  return cssWidth >= 1 ? 1 : Math.sqrt(Math.max(0, cssWidth));
}

function lineWidthLod(cssWidth) {
  if (cssWidth <= 0) return "hidden";
  if (cssWidth < 0.35) return "faint";
  if (cssWidth < 1) return "subpixel";
  return "full";
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}
