const STATE_MIN_LETTER_SPACING = 2.4;
const PROVINCE_MIN_LETTER_SPACING = 0.7;

export const PROVINCE_COLLISION_OPACITY = 0.76;

export function automaticPoliticalLabelOrder(items = []) {
  const order = {city: 0, custom: 1, state: 2, province: 3};
  return [...items].sort((left, right) => (
    (order[left?.targetKind] ?? 4) - (order[right?.targetKind] ?? 4)
    || Number(right?.priority || 0) - Number(left?.priority || 0)
    || Number(left?.targetId || 0) - Number(right?.targetId || 0)
  ));
}

export function createPoliticalLabelGlyphLayout(text, style, {targetKind = "province", rotation = 0, bend = 0} = {}) {
  const characters = Array.from(String(text || ""));
  if (!characters.length) return {glyphs: [], box: emptyBox(), spacing: 0, bend: 0, rotation: 0};
  const fontSize = positive(style?.fontSize, targetKind === "state" ? 30 : 18);
  const spacing = Math.max(finite(style?.letterSpacing), targetKind === "state" ? STATE_MIN_LETTER_SPACING : PROVINCE_MIN_LETTER_SPACING);
  const advances = characters.map(character => characterAdvance(character, fontSize));
  const totalWidth = advances.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, characters.length - 1);
  const halfSpan = Math.max(fontSize / 2, totalWidth / 2);
  const glyphHeight = fontSize * 1.28 + labelDecorationSize(style);
  const baseRadians = finite(rotation) * Math.PI / 180;
  const cos = Math.cos(baseRadians);
  const sin = Math.sin(baseRadians);
  let cursor = -totalWidth / 2;
  let box = null;
  const glyphs = characters.map((character, index) => {
    const width = advances[index] + labelDecorationSize(style);
    const centerX = cursor + advances[index] / 2;
    const unit = characters.length <= 1 ? 0 : centerX / halfSpan;
    const curveY = characters.length <= 1 ? 0 : finite(bend) * (1 - unit * unit);
    const tangentRadians = characters.length <= 1 ? 0 : Math.atan2(-2 * finite(bend) * unit, halfSpan);
    const x = centerX * cos - curveY * sin;
    const y = centerX * sin + curveY * cos;
    const angle = finite(rotation) + tangentRadians * 180 / Math.PI;
    const bounds = rotatedGlyphBox(x, y, width, glyphHeight, angle);
    box = unionBoxes(box, bounds);
    cursor += advances[index] + spacing;
    return {character, x: round(x), y: round(y), angle: round(angle), width: round(width), height: round(glyphHeight), box: roundBox(bounds)};
  });
  return {
    glyphs,
    box: roundBox(box || emptyBox()),
    spacing: round(spacing),
    bend: round(bend),
    rotation: round(rotation)
  };
}

export function resolvePoliticalLabelPlacement({item, screen, obstacles = [], peers = [], viewport, padding = 0, locked = false, anchorAllowed = null} = {}) {
  const targetKind = item?.targetKind === "state" ? "state" : "province";
  const fontSize = positive(item?.resolvedStyle?.fontSize, targetKind === "state" ? 30 : 18);
  const rotation = finite(item?.rotation);
  const candidates = politicalCandidateSpecs(fontSize, rotation, locked);
  let best = null;

  for (let index = 0; index < candidates.length; index++) {
    const spec = candidates[index];
    const layout = createPoliticalLabelGlyphLayout(item?.text, item?.resolvedStyle, {targetKind, rotation, bend: spec.bend});
    const anchor = {x: finite(screen?.x) + spec.x, y: finite(screen?.y) + spec.y};
    if (!locked && typeof anchorAllowed === "function" && !anchorAllowed(anchor)) continue;
    const glyphs = layout.glyphs.map(glyph => ({...glyph, box: translateBox(glyph.box, anchor.x, anchor.y)}));
    const box = translateBox(layout.box, anchor.x, anchor.y);
    const obstacleOverlap = overlapSummary(glyphs, box, obstacles, padding);
    const peerOverlap = overlapSummary(glyphs, box, peers, padding);
    const overflow = viewportOverflow(box, viewport, 8);
    const score = (obstacleOverlap.count + peerOverlap.count) * 1e7 + (obstacleOverlap.area + peerOverlap.area) * 100 + overflow * 1000 + index;
    const candidate = {
      anchor,
      glyphs,
      box,
      rootSize: symmetricRootSize(layout.box, fontSize),
      bend: layout.bend,
      rotation: layout.rotation,
      spacing: layout.spacing,
      candidateIndex: index,
      cityCollides: obstacleOverlap.count > 0,
      peerCollides: peerOverlap.count > 0,
      collides: obstacleOverlap.count > 0 || peerOverlap.count > 0,
      onScreen: overflow === 0,
      score
    };
    if (!candidate.collides && candidate.onScreen) return candidate;
    if (!best || candidate.score < best.score) best = candidate;
  }

  return best || fallbackPlacement(item, screen, targetKind, rotation);
}

function fallbackPlacement(item, screen, targetKind, rotation) {
  const layout = createPoliticalLabelGlyphLayout(item?.text, item?.resolvedStyle, {targetKind, rotation, bend: 0});
  const anchor = {x: finite(screen?.x), y: finite(screen?.y)};
  const glyphs = layout.glyphs.map(glyph => ({...glyph, box: translateBox(glyph.box, anchor.x, anchor.y)}));
  return {
    anchor,
    glyphs,
    box: translateBox(layout.box, anchor.x, anchor.y),
    rootSize: symmetricRootSize(layout.box, positive(item?.resolvedStyle?.fontSize, targetKind === "state" ? 30 : 18)),
    bend: 0,
    rotation,
    spacing: layout.spacing,
    candidateIndex: 0,
    cityCollides: false,
    peerCollides: false,
    collides: false,
    onScreen: true,
    score: Infinity
  };
}

function politicalCandidateSpecs(fontSize, rotation, locked) {
  if (locked) return [{x: 0, y: 0, bend: 0}];
  const radians = rotation * Math.PI / 180;
  const tangent = {x: Math.cos(radians), y: Math.sin(radians)};
  const normal = {x: -tangent.y, y: tangent.x};
  const curve = Math.min(18, Math.max(7, fontSize * 0.58));
  const near = fontSize * 1.2;
  const far = fontSize * 2.15;
  const along = fontSize * 1.45;
  return [
    candidateOffset(tangent, normal, 0, 0, 0),
    candidateOffset(tangent, normal, 0, 0, -curve),
    candidateOffset(tangent, normal, 0, 0, curve),
    candidateOffset(tangent, normal, 0, -near, 0),
    candidateOffset(tangent, normal, 0, near, 0),
    candidateOffset(tangent, normal, 0, -near, -curve),
    candidateOffset(tangent, normal, 0, near, curve),
    candidateOffset(tangent, normal, -along, 0, 0),
    candidateOffset(tangent, normal, along, 0, 0),
    candidateOffset(tangent, normal, 0, -far, 0),
    candidateOffset(tangent, normal, 0, far, 0),
    candidateOffset(tangent, normal, 0, -far, curve),
    candidateOffset(tangent, normal, 0, far, -curve)
  ];
}

function candidateOffset(tangent, normal, along, across, bend) {
  return {
    x: tangent.x * along + normal.x * across,
    y: tangent.y * along + normal.y * across,
    bend
  };
}

function overlapSummary(glyphs, candidateBox, boxes, padding) {
  let count = 0;
  let area = 0;
  const start = Math.max(0, boxes.length - 900);
  for (let index = start; index < boxes.length; index++) {
    const obstacle = boxes[index];
    if (!boxesOverlap(candidateBox, obstacle, padding)) continue;
    for (const glyph of glyphs) {
      const overlap = overlapArea(glyph.box, obstacle, padding);
      if (overlap <= 0) continue;
      count++;
      area += overlap;
      break;
    }
  }
  return {count, area};
}

function viewportOverflow(box, viewport, margin) {
  if (!viewport) return 0;
  return Math.max(0, margin - box.left)
    + Math.max(0, margin - box.top)
    + Math.max(0, box.right - (viewport.width - margin))
    + Math.max(0, box.bottom - (viewport.height - margin));
}

function symmetricRootSize(box, fontSize) {
  return {
    width: round(Math.max(fontSize, Math.max(Math.abs(box.left), Math.abs(box.right)) * 2)),
    height: round(Math.max(fontSize, Math.max(Math.abs(box.top), Math.abs(box.bottom)) * 2))
  };
}

function characterAdvance(character, fontSize) {
  if (/\s/u.test(character)) return fontSize * 0.42;
  if (/[\u2E80-\u9FFF]/u.test(character)) return fontSize * 0.96;
  if (/[A-ZMW]/.test(character)) return fontSize * 0.72;
  return fontSize * 0.57;
}

function labelDecorationSize(style) {
  return Math.max(0, finite(style?.strokeWidth)) * 2
    + Math.abs(finite(style?.shadowOffsetX))
    + Math.abs(finite(style?.shadowOffsetY))
    + Math.max(0, finite(style?.shadowBlur));
}

function rotatedGlyphBox(x, y, width, height, angle) {
  const radians = Math.abs(angle) * Math.PI / 180;
  const boxWidth = width * Math.cos(radians) + height * Math.sin(radians);
  const boxHeight = width * Math.sin(radians) + height * Math.cos(radians);
  return {left: x - boxWidth / 2, right: x + boxWidth / 2, top: y - boxHeight / 2, bottom: y + boxHeight / 2};
}

function unionBoxes(left, right) {
  if (!left) return {...right};
  return {
    left: Math.min(left.left, right.left),
    right: Math.max(left.right, right.right),
    top: Math.min(left.top, right.top),
    bottom: Math.max(left.bottom, right.bottom)
  };
}

function translateBox(box, x, y) {
  return {left: box.left + x, right: box.right + x, top: box.top + y, bottom: box.bottom + y};
}

function boxesOverlap(a, b, padding) {
  return a.left - padding < b.right && a.right + padding > b.left && a.top - padding < b.bottom && a.bottom + padding > b.top;
}

function overlapArea(a, b, padding) {
  const width = Math.min(a.right + padding, b.right) - Math.max(a.left - padding, b.left);
  const height = Math.min(a.bottom + padding, b.bottom) - Math.max(a.top - padding, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function emptyBox() {
  return {left: 0, right: 0, top: 0, bottom: 0};
}

function roundBox(box) {
  return {left: round(box.left), right: round(box.right), top: round(box.top), bottom: round(box.bottom)};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(finite(value) * 1000) / 1000;
}
