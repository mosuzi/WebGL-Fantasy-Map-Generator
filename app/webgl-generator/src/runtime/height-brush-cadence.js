// 以世界坐标的半径控制笔印间距，在同一动画帧收到多个拐点时也沿原轨迹补齐。
export function sampleHeightBrushSegment(stroke, point, radius, final = false) {
  const previous = stroke.lastBrushPoint;
  if (!previous) {
    stroke.lastBrushPoint = point;
    return [point];
  }

  const dx = point.x - previous.x;
  const dy = point.y - previous.y;
  const distance = Math.hypot(dx, dy);
  const spacing = radius / 2;
  if (!(spacing > 0) || distance === 0) return [];
  const count = Math.floor(distance / spacing);
  const samples = [];
  for (let index = 1; index <= count; index++) {
    const portion = index * spacing / distance;
    samples.push({x: previous.x + dx * portion, y: previous.y + dy * portion});
  }
  if (final && distance - count * spacing > 1e-6) samples.push(point);
  if (samples.length) stroke.lastBrushPoint = samples[samples.length - 1];
  return samples;
}
