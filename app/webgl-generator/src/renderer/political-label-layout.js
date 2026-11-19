const STATE_MIN_LETTER_SPACING = 2.4;
const PROVINCE_MIN_LETTER_SPACING = 0.7;
const BANK_INSETS = [0.25, 0.8, 1.35, 1.9];
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

export function createPoliticalLabelGlyphLayout(text, style, {targetKind = "province", rotation = 0, bend = 0, extraSpacing = 0, upright = false, splitAt = 0, extraGap = 0} = {}) {
  const characters = Array.from(String(text || ""));
  if (!characters.length) return {glyphs: [], box: emptyBox(), spacing: 0, bend: 0, rotation: 0};
  const fontSize = positive(style?.fontSize, targetKind === "state" ? 30 : 18);
  const spacing = Math.max(finite(style?.letterSpacing), targetKind === "state" ? STATE_MIN_LETTER_SPACING : PROVINCE_MIN_LETTER_SPACING) + extraSpacing;
  const advances = characters.map(character => upright ? fontSize : characterAdvance(character, fontSize));
  const totalWidth = advances.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, characters.length - 1) + extraGap;
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
    if (index + 1 === splitAt) cursor += extraGap;
    return {character, x: round(x), y: round(y), angle: round(angle), width: round(width), height: round(glyphHeight), box: roundBox(bounds)};
  });
  return {
    glyphs,
    box: roundBox(box || emptyBox()),
    spacing: round(spacing),
    splitAt,
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

// Cache geometric fits across pans. Visible city obstacles are tested afresh.
export function placeHomelandLabel({item, screen, scale, sx, sy, fits, sites, banks = NO_BANKS, obstacles, peers, padding}) {
  const anchors = sites ?? [item];
  if (!anchors.length && !banks.length) return null;
  const baseSize = positive(item.resolvedStyle.fontSize, 30);
  const short = item.state?.name?.trim() || item.text;
  const names = item.text === short ? [item.text] : [item.text, short];
  const size = baseSize * Math.min(1, Math.max(0.5, Math.sqrt(scale)));
  const sizes = [size];
  const floor = Math.min(size, Math.max(11, baseSize * 0.48));
  while (sizes.at(-1) > floor) sizes.push(Math.max(floor, sizes.at(-1) * 0.84));
  const radians = item.rotation * Math.PI / 180;
  const dx = sx * Math.cos(radians), dy = sy * Math.sin(radians);
  // A principal axis has no reading direction. Read mostly vertical names
  // top to bottom, and mostly horizontal names left to right on screen.
  const direction = (Math.abs(dy) > Math.abs(dx) ? dy : dx) < 0 ? -1 : 1;
  const rotation = Math.atan2(direction * dy, direction * dx) * 180 / Math.PI;
  const key = [sx, sy, item.x, item.y, item.rotation, item.text, short, scale].join("|");
  const cached = item.homelandCandidates;
  if (cached?.key !== key || cached.style !== item.resolvedStyle || cached.sites !== sites || cached.banks !== banks) {
    item.homelandCandidates = {key, style: item.resolvedStyle, sites, banks, layouts: new Map(), bankLayouts: new Map()};
  }
  let index = 0;
  let fallback = null;
  const snugSpacing = 1 - Math.max(STATE_MIN_LETTER_SPACING, finite(item.resolvedStyle.letterSpacing));
  for (const name of names) {
    for (const fontSize of sizes) {
      let overlapping = null;
      const consider = (layout, site, candidateIndex) => {
        const anchor = {x: screen.x + (site.x - item.x) * sx, y: screen.y + (site.y - item.y) * sy};
        const box = translateBox(layout.box, anchor.x, anchor.y);
        const glyphs = layout.glyphs.map(glyph => ({...glyph, box: translateBox(glyph.box, anchor.x, anchor.y)}));
        const city = overlapSummary(glyphs, box, obstacles, padding);
        const peer = overlapSummary(glyphs, box, peers, padding);
        const candidate = {
          ...layout, anchor, box, glyphs, fontSize, candidateIndex, rootSize: symmetricRootSize(layout.box, fontSize),
          cityCollides: city.count > 0, peerCollides: peer.count > 0, collides: city.count + peer.count > 0
        };
        if (!candidate.collides) return candidate;
        const cost = peer.area * 10 + city.area;
        if (!overlapping || (candidate.peerCollides !== overlapping.peerCollides ? !candidate.peerCollides : cost < overlapping.cost)) {
          overlapping = {...candidate, cost};
        }
        return null;
      };
      if (banks.length && Array.from(name).length >= 2) {
        const cache = item.homelandCandidates.bankLayouts;
        if (!cache.has(index)) cache.set(index, bankLabelLayouts({name, short, fontSize, item, sx, sy, rotation, banks, fits, axisScale: Math.hypot(dx, dy)}));
        for (const {layout, site, bankIndex} of cache.get(index)) {
          const result = consider(layout, site, -(1 + index * banks.length * BANK_INSETS.length ** 2 + bankIndex));
          if (result) return result;
        }
      }
      for (const [extraSpacing, curve] of [[0, 0], [snugSpacing, 0], [0.22 * fontSize, 0], [0.5 * fontSize, 0], [0.85 * fontSize, 0],
        [0, -0.7], [0, 0.7], [0.35 * fontSize, -1.15], [0.35 * fontSize, 1.15]]) {
        const shapeIndex = index++;
        const layouts = item.homelandCandidates.layouts;
        if (!layouts.has(shapeIndex)) {
          const layout = createPoliticalLabelGlyphLayout(name, {...item.resolvedStyle, fontSize}, {
            targetKind: "state", upright: true, rotation, bend: curve * fontSize, extraSpacing
          });
          layouts.set(shapeIndex, {layout, valid: []});
        }
        const {layout, valid} = layouts.get(shapeIndex);
        for (const [siteIndex, site] of anchors.entries()) {
          valid[siteIndex] ??= layout.glyphs.every(glyph => fits(glyph.box, Math.max(2, fontSize * 0.12), site));
          if (!valid[siteIndex]) continue;
          const result = consider(layout, site, shapeIndex * anchors.length + siteIndex);
          if (result) return result;
        }
      }
      if (overlapping && (!fallback || (fallback.peerCollides && !overlapping.peerCollides))) fallback = overlapping;
    }
  }
  return fallback;
}

function bankLabelLayouts({name, short, fontSize, item, sx, sy, rotation, banks, fits, axisScale}) {
  const count = Array.from(name).length;
  const stemLength = Array.from(short).length;
  let splitAt = Math.ceil(count / 2);
  if (name !== short && name.startsWith(short)) splitAt = stemLength;
  else if (name !== short && name.endsWith(short)) splitAt = count - stemLength;
  const spacing = Math.max(STATE_MIN_LETTER_SPACING, finite(item.resolvedStyle.letterSpacing));
  const radians = rotation * Math.PI / 180;
  // Centre the word break over the channel, even if the two groups differ in length.
  const groupOffset = (count / 2 - splitAt) * (fontSize + spacing);
  const maxGap = (Math.min(splitAt, count - splitAt) === 1 ? 2 : 4) * fontSize;
  const valid = [];
  for (const [i, bank] of banks.entries()) {
    for (const [j, leftInset] of BANK_INSETS.entries()) {
      for (const [k, rightInset] of BANK_INSETS.entries()) {
        const gap = bank.gap * axisScale + (leftInset + rightInset) * fontSize;
        if (gap > maxGap) break;
        const shift = groupOffset + (rightInset - leftInset) * fontSize / 2;
        const site = {x: bank.x + shift * Math.cos(radians) / sx, y: bank.y + shift * Math.sin(radians) / sy};
        const layout = createPoliticalLabelGlyphLayout(name, {...item.resolvedStyle, fontSize}, {
          targetKind: "state", upright: true, rotation, splitAt, extraGap: Math.max(0, gap - spacing)
        });
        if (layout.glyphs.every(glyph => fits(glyph.box, Math.max(2, fontSize * 0.12), site))) {
          valid.push({layout, site, bankIndex: (i * BANK_INSETS.length + j) * BANK_INSETS.length + k});
        }
      }
    }
  }
  return valid;
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
