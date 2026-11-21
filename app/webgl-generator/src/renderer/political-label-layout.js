import {homelandAnchorBands} from "./homeland-label-scan.js";

const STATE_MIN_LETTER_SPACING = 2.4;
const PROVINCE_MIN_LETTER_SPACING = 0.7;
const NO_BANKS = [];

export const PROVINCE_COLLISION_OPACITY = 0.76;

export function automaticPoliticalLabelOrder(items = []) {
  const order = {city: 0, custom: 1, state: 2, province: 3};
  return [...items].sort((left, right) => (
    (order[left?.targetKind] ?? 4) - (order[right?.targetKind] ?? 4)
    || Number(right?.priority || 0) - Number(left?.priority || 0)
    || Number(left?.targetId || 0) - Number(right?.targetId || 0)
  ));
}

export function createPoliticalLabelGlyphLayout(text, style, {targetKind = "province", rotation = 0, bend = 0, extraSpacing = 0, upright = false} = {}) {
  const characters = Array.from(String(text || ""));
  if (!characters.length) return {glyphs: [], box: emptyBox(), spacing: 0, bend: 0, rotation: 0};
  const fontSize = positive(style?.fontSize, targetKind === "state" ? 30 : 18);
  const spacing = Math.max(finite(style?.letterSpacing), targetKind === "state" ? STATE_MIN_LETTER_SPACING : PROVINCE_MIN_LETTER_SPACING) + extraSpacing;
  const advances = characters.map(character => upright ? fontSize : characterAdvance(character, fontSize));
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
    const curveY = characters.length <= 1 ? 0 : finite(bend) * ((upright ? 0.5 : 1) - unit * unit);
    const tangentRadians = characters.length <= 1 ? 0 : Math.atan2(-2 * finite(bend) * unit, halfSpan);
    const x = centerX * cos - curveY * sin;
    const y = centerX * sin + curveY * cos;
    const angle = upright ? 0 : finite(rotation) + tangentRadians * 180 / Math.PI;
    const bounds = upright ? uprightInkBox(x, y, fontSize, style) : rotatedGlyphBox(x, y, width, glyphHeight, angle);
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

function uprightInkBox(x, y, fontSize, style) {
  const stroke = Math.max(0, finite(style?.strokeWidth));
  const blur = 2 * Math.max(0, finite(style?.shadowBlur));
  const shadowX = finite(style?.shadowOffsetX), shadowY = finite(style?.shadowOffsetY);
  const halfWidth = fontSize * (style?.italic ? 0.67 : 0.5) + stroke;
  const halfHeight = fontSize * 0.64 + stroke;
  return {
    left: x - halfWidth + Math.min(0, shadowX - blur),
    right: x + halfWidth + Math.max(0, shadowX + blur),
    top: y - halfHeight + Math.min(0, shadowY - blur),
    bottom: y + halfHeight + Math.max(0, shadowY + blur)
  };
}

// Lay out the name once at the overview projection. A camera gesture changes
// only the projection of those glyphs, never the chosen site or line breaks.
export function placeHomelandLabel({item, screen, scale, sx, sy, sites, banks = NO_BANKS, outline, fits, obstacles, peers, padding}) {
  const short = item.state?.name?.trim() || item.text;
  const key = [sx, sy, item.x, item.y, item.rotation, item.text, short].join("|");
  let cached = item.homelandLayout;
  if (!cached || cached.key !== key || cached.style !== item.resolvedStyle || cached.outline !== outline || cached.sites !== sites || cached.banks !== banks) {
    const result = fitHomelandName({item, short, sx, sy, sites: sites ?? [item], banks, outline, fits});
    cached = item.homelandLayout = {key, style: item.resolvedStyle, outline, sites, banks, result};
  }
  if (!cached.result) return null;
  const {layout, site, fontSize, candidateIndex} = cached.result;
  const size = fontSize * scale;
  if (size < 6) return null;
  const anchor = {x: screen.x + (site.x - item.x) * sx * scale, y: screen.y + (site.y - item.y) * sy * scale};
  if (cached.projection?.scale !== scale) {
    const box = scaleBox(layout.box, scale);
    const glyphs = layout.glyphs.map(g => ({
      ...g, x: g.x * scale, y: g.y * scale, width: g.width * scale, height: g.height * scale, box: scaleBox(g.box, scale)
    }));
    cached.projection = {scale, box, glyphs, rootSize: symmetricRootSize(box, size)};
  }
  const projected = cached.projection;
  const box = translateBox(projected.box, anchor.x, anchor.y);
  const glyphs = projected.glyphs.map(g => ({...g, box: translateBox(g.box, anchor.x, anchor.y)}));
  const cityCollides = overlapSummary(glyphs, box, obstacles, padding).count > 0;
  const peerCollides = overlapSummary(glyphs, box, peers, padding).count > 0;
  return {...layout, anchor, box, glyphs, fontSize: size, mapScale: scale, candidateIndex, rootSize: projected.rootSize,
    cityCollides, peerCollides, collides: cityCollides || peerCollides};
}

function scaleBox(box, scale) {
  return {left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale};
}

function fitHomelandName({item, short, sx, sy, sites, banks, outline, fits}) {
  const radians = item.rotation * Math.PI / 180;
  const dx = sx * Math.cos(radians), dy = sy * Math.sin(radians);
  const frame = outline?.frame;
  const base = positive(item.resolvedStyle.fontSize, 22);
  const width = frame ? frame.width * sx : Infinity, height = frame ? frame.height * sy : Infinity;
  const size = frame ? base * Math.min(1.15, Math.max(0.55, Math.sqrt(width * height) / 180)) : base;
  const axisScale = Math.hypot(dx, dy);
  const span = frame ? (Math.abs(dx) * width + Math.abs(dy) * height) / axisScale : Infinity;
  let candidateIndex = 0;
  for (const name of new Set([item.text, short])) {
    const rows = splitHomelandName(name, short);
    const upright = /\p{Script=Han}/u.test(name);
    const direction = (upright && Math.abs(dy) > Math.abs(dx) ? dy : dx) < 0 ? -1 : 1;
    const rotation = Math.atan2(direction * dy, direction * dx) * 180 / Math.PI;
    // Compact countries have room across the axis. An elongated country
    // naturally reads as a single line unless that line will crowd its ends.
    const preferRows = rows && Array.from(name).length >= 4 && (Array.from(name).length * size > span * 0.54
      || (frame && Math.max(width, height) < 1.8 * Math.min(width, height)));
    const variants = !rows ? [[name]] : preferRows ? [rows, [name]] : [[name], rows];
    const factors = name === short ? [1, 0.82, 0.66, 0.51, 0.38] : [1, 0.82, 0.66];
    for (const factor of factors) {
      const fontSize = size * factor;
      const margin = Math.max(2, fontSize * 0.12);
      const inside = (layout, site) => fits(emptyBox(), 0, site) && layout.glyphs.every(glyph => fits(glyph.box, margin, site));
      for (const lines of variants) {
        const layout = homelandLineLayout(lines, item.resolvedStyle, fontSize, rotation, upright);
        candidateIndex++;
        const site = sites.find(site => inside(layout, site));
        if (site) return {layout, site, fontSize, candidateIndex};
        if (!frame) continue;
        for (const {left, right, y} of homelandAnchorBands(outline, layout, fontSize, sx, sy)) {
          const inland = {x: Math.max(left, Math.min(right, frame.cx)), y};
          if (inside(layout, inland)) return {layout, site: inland, fontSize, candidateIndex};
          inland.x = (left + right) / 2;
          if (inside(layout, inland)) return {layout, site: inland, fontSize, candidateIndex};
        }
      }
      if (upright && banks.length && name !== short) {
        const bank = bankLabelLayout({name, fontSize, style: item.resolvedStyle, sx, sy, rotation, banks, fits, axisScale, margin});
        if (bank) return {...bank, fontSize};
      }
    }
  }
  return null;
}

function splitHomelandName(name, short) {
  const chars = Array.from(name);
  const han = /\p{Script=Han}/u.test(name);
  if (chars.length < (han ? 3 : 6)) return null;
  const breaks = [];
  for (let i = 1; i < chars.length; i++) {
    const left = chars.slice(0, i).join(""), right = chars.slice(i).join("");
    if (!left.trim() || !right.trim()) continue;
    const wordBreak = /[\s-]$/u.test(left);
    if (!wordBreak && !(han && /\p{Script=Han}/u.test(chars[i - 1]) && /\p{Script=Han}/u.test(chars[i]))) continue;
    const shorter = Math.min(i, chars.length - i);
    const polity = /^(联邦共和国|共和国|联合王国|王国|帝国|部盟|邦联|联邦|公国|汗国)$/.test(right);
    if (han && shorter < 2 && !(left === short && polity)) continue;
    const semantic = wordBreak || left === short || right === short || polity;
    breaks.push({lines: [left, right], score: Math.abs(2 * i - chars.length) + (semantic ? 0 : chars.length)});
  }
  return breaks.sort((a, b) => a.score - b.score)[0]?.lines;
}

function homelandLineLayout(lines, style, fontSize, rotation, upright, extraSpacing = 0) {
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const diagonal = upright ? 1 / Math.max(Math.abs(cos), Math.abs(sin)) : 1;
  const options = {targetKind: "state", upright, rotation, extraSpacing: fontSize * (diagonal - 1) + extraSpacing};
  const glyphs = [];
  let box = null;
  const fittedStyle = homelandStyleAtSize(style, fontSize);
  for (const [row, line] of lines.entries()) {
    const offset = (row - (lines.length - 1) / 2) * fontSize * 1.28 * diagonal;
    const lineLayout = createPoliticalLabelGlyphLayout(line, fittedStyle, options);
    for (const glyph of lineLayout.glyphs) {
      const bounds = translateBox(glyph.box, -sin * offset, cos * offset);
      glyphs.push({...glyph, x: glyph.x - sin * offset, y: glyph.y + cos * offset, box: bounds});
      box = unionBoxes(box, bounds);
    }
  }
  return {glyphs, box, lines: lines.length, bend: 0, rotation, spacing: Math.max(STATE_MIN_LETTER_SPACING, finite(style.letterSpacing)) + options.extraSpacing};
}

function homelandStyleAtSize(style, fontSize) {
  const ratio = fontSize / positive(style.fontSize, 22);
  return {...style, fontSize, strokeWidth: finite(style.strokeWidth) * ratio};
}

function bankLabelLayout({name, fontSize, style, sx, sy, rotation, banks, fits, axisScale, margin}) {
  // Try the smallest tracking first. Any adjacent pair may straddle the water.
  for (const extraEm of [0, 0.125, 0.25, 0.375, 0.5]) {
    const layout = homelandLineLayout([name], style, fontSize, rotation, true, fontSize * extraEm);
    const {glyphs} = layout;
    for (const [bankIndex, bank] of banks.entries()) {
      if (bank.gap * axisScale >= fontSize + layout.spacing) continue;
      for (let i = 1; i < glyphs.length; i++) {
        const a = glyphs[i - 1], b = glyphs[i];
        const site = {x: bank.x - (a.x + b.x) / (2 * sx), y: bank.y - (a.y + b.y) / (2 * sy)};
        if (glyphs.every(glyph => fits(glyph.box, margin, site))) {
          return {layout: {...layout, splitAt: i}, site, candidateIndex: -1 - bankIndex};
        }
      }
    }
  }
  return null;
}

export function resolvePoliticalLabelPlacement({item, screen, obstacles = [], peers = [], viewport, padding = 0, locked = false, anchorAllowed = null, preferredCandidateIndex = null, retainPreferred = false} = {}) {
  const targetKind = item?.targetKind === "state" ? "state" : "province";
  const fontSize = positive(item?.resolvedStyle?.fontSize, targetKind === "state" ? 30 : 18);
  const rotation = finite(item?.rotation);
  const candidates = politicalCandidateSpecs(fontSize, rotation, locked);
  const candidateOrder = preferredCandidateOrder(candidates.length, preferredCandidateIndex);
  let best = null;

  for (const index of candidateOrder) {
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
    if (retainPreferred && index === Number(preferredCandidateIndex)) return candidate;
    if (!candidate.collides && candidate.onScreen) return candidate;
    if (!best || candidate.score < best.score) best = candidate;
  }

  return best || fallbackPlacement(item, screen, targetKind, rotation);
}

export function restorePoliticalLabelPlacementSnapshot(item, screen) {
  const snapshot = item?.politicalPlacementSnapshot;
  const offsetX = Number(item?.politicalOffsetX);
  const offsetY = Number(item?.politicalOffsetY);
  const boxOffset = snapshot?.boxOffset;
  const rootSize = snapshot?.rootSize;
  if (!snapshot
    || !Number.isFinite(offsetX)
    || !Number.isFinite(offsetY)
    || !Number.isInteger(snapshot.candidateIndex)
    || !Number.isFinite(snapshot.bend)
    || !rootSize
    || !Number.isFinite(rootSize.width)
    || !Number.isFinite(rootSize.height)
    || !Array.isArray(snapshot.glyphs)
    || !boxOffset
    || ![boxOffset.left, boxOffset.right, boxOffset.top, boxOffset.bottom].every(Number.isFinite)
    || typeof snapshot.collides !== "boolean"
    || typeof snapshot.cityCollides !== "boolean") return null;
  const anchor = {x: finite(screen?.x) + offsetX, y: finite(screen?.y) + offsetY};
  const dx = anchor.x - (snapshot.anchor?.x ?? anchor.x);
  const dy = anchor.y - (snapshot.anchor?.y ?? anchor.y);
  return {
    anchor,
    fontSize: snapshot.fontSize,
    candidateIndex: snapshot.candidateIndex,
    splitAt: snapshot.splitAt,
    bend: snapshot.bend,
    rootSize: snapshot.rootSize,
    glyphs: dx || dy ? snapshot.glyphs.map(glyph => ({...glyph, box: translateBox(glyph.box, dx, dy)})) : snapshot.glyphs,
    box: {
      left: anchor.x + boxOffset.left,
      right: anchor.x + boxOffset.right,
      top: anchor.y + boxOffset.top,
      bottom: anchor.y + boxOffset.bottom
    },
    collides: snapshot.collides,
    cityCollides: snapshot.cityCollides,
    peerCollides: false
  };
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
      const overlap = obstacle.parts
        ? obstacle.parts.reduce((sum, part) => sum + overlapArea(glyph.box, part, padding), 0)
        : overlapArea(glyph.box, obstacle, padding);
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
  const left = finite(viewport.left);
  const top = finite(viewport.top);
  const right = Number.isFinite(Number(viewport.right)) ? Number(viewport.right) : finite(viewport.width);
  const bottom = Number.isFinite(Number(viewport.bottom)) ? Number(viewport.bottom) : finite(viewport.height);
  return Math.max(0, left + margin - box.left)
    + Math.max(0, top + margin - box.top)
    + Math.max(0, box.right - (right - margin))
    + Math.max(0, box.bottom - (bottom - margin));
}

function preferredCandidateOrder(length, preferredCandidateIndex) {
  const preferred = Number(preferredCandidateIndex);
  const order = Array.from({length}, (_, index) => index);
  if (!Number.isInteger(preferred) || preferred < 0 || preferred >= length) return order;
  return [preferred, ...order.filter(index => index !== preferred)];
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
  const radians = angle * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const boxWidth = width * cos + height * sin;
  const boxHeight = width * sin + height * cos;
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
