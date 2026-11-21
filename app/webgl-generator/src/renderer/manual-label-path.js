// The middle handle lies on the curve. The other two points are offsets
// from it in map coordinates, so translating the label preserves its shape.
export function manualLabelPlacement(item, anchor, path, sx, sy, scale) {
  const start = {x: path.start.x * sx, y: path.start.y * sy};
  const end = {x: path.end.x * sx, y: path.end.y * sy};
  const control = {x: -(start.x + end.x) / 2, y: -(start.y + end.y) / 2};
  const samples = [{...start, distance: 0}];
  for (let i = 1; i <= 48; i++) {
    const t = i / 48, s = 1 - t;
    const x = s * s * start.x + 2 * s * t * control.x + t * t * end.x;
    const y = s * s * start.y + 2 * s * t * control.y + t * t * end.y;
    const last = samples[i - 1];
    samples.push({x, y, distance: last.distance + Math.hypot(x - last.x, y - last.y)});
  }
  const characters = Array.from(item.text);
  const rows = path.breakAt > 0 && path.breakAt < characters.length
    ? [characters.slice(0, path.breakAt), characters.slice(path.breakAt)] : [characters];
  const size = item.resolvedStyle.fontSize * path.fontScale * scale;
  const upright = /\p{Script=Han}/u.test(item.text);
  const widths = rows.map(row => row.map(char => upright ? 1 : /\s/u.test(char) ? 0.42 : /[A-ZMW]/u.test(char) ? 0.72 : 0.57));
  const spans = widths.map(row => row.reduce((sum, w) => sum + w, 0) - ((row[0] || 0) + (row.at(-1) || 0)) / 2);
  const maxSpan = Math.max(...spans, 0.001);
  const length = samples.at(-1).distance;
  const glyphs = [];
  const pad = (item.resolvedStyle.strokeWidth || 0) + (item.resolvedStyle.shadowBlur || 0) * 2;
  let left = 0, right = 0, top = 0, bottom = 0;
  for (const [row, chars] of rows.entries()) {
    let advance = 0, segment = 1;
    for (const [i, character] of chars.entries()) {
      if (i) advance += (widths[row][i - 1] + widths[row][i]) / 2;
      // A single glyph follows the middle handle even on an asymmetric curve.
      const distance = characters.length === 1 ? samples[24].distance
        : length * (0.5 + (advance - spans[row] / 2) / maxSpan);
      while (segment < samples.length - 1 && samples[segment].distance < distance) segment++;
      const a = samples[segment - 1], b = samples[segment];
      const fraction = (distance - a.distance) / (b.distance - a.distance || 1);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const offset = (row - (rows.length - 1) / 2) * size * 1.28;
      const x = a.x + (b.x - a.x) * fraction - Math.sin(angle) * offset;
      const y = a.y + (b.y - a.y) * fraction + Math.cos(angle) * offset;
      const tilt = upright ? 0 : angle;
      const width = size * widths[row][i], height = size * 1.15;
      const hw = (Math.abs(Math.cos(tilt)) * width + Math.abs(Math.sin(tilt)) * height) / 2 + pad;
      const hh = (Math.abs(Math.sin(tilt)) * width + Math.abs(Math.cos(tilt)) * height) / 2 + pad;
      left = Math.min(left, x - hw); right = Math.max(right, x + hw);
      top = Math.min(top, y - hh); bottom = Math.max(bottom, y + hh);
      glyphs.push({character, x, y, angle: tilt * 180 / Math.PI, width, height,
        box: {left: anchor.x + x - hw, right: anchor.x + x + hw, top: anchor.y + y - hh, bottom: anchor.y + y + hh}});
    }
  }
  return {anchor, glyphs, fontSize: size, mapScale: scale, candidateIndex: 0, bend: Math.hypot(control.x, control.y),
    rootSize: {width: 2 * Math.max(-left, right), height: 2 * Math.max(-top, bottom)},
    box: {left: anchor.x + left, right: anchor.x + right, top: anchor.y + top, bottom: anchor.y + bottom},
    cityCollides: false, peerCollides: false, collides: false};
}
