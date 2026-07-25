export const HEIGHT_BRUSH_MIN_SAMPLE_INTERVAL_MS = 160;
export const HEIGHT_BRUSH_MIN_SAMPLE_DISTANCE_PX = 6;

export function acceptHeightBrushSample(stroke, sample, {force = false} = {}) {
  if (!stroke || !Number.isFinite(sample?.clientX) || !Number.isFinite(sample?.clientY)) return false;
  const time = Number.isFinite(sample.timeStamp) ? sample.timeStamp : 0;
  if (!Number.isFinite(stroke.lastAppliedClientX) || !Number.isFinite(stroke.lastAppliedClientY)) {
    recordHeightBrushSample(stroke, sample, time);
    return true;
  }

  const distance = Math.hypot(
    sample.clientX - stroke.lastAppliedClientX,
    sample.clientY - stroke.lastAppliedClientY
  );
  if (distance < HEIGHT_BRUSH_MIN_SAMPLE_DISTANCE_PX) return false;
  if (!force && time - (Number(stroke.lastAppliedAt) || 0) < HEIGHT_BRUSH_MIN_SAMPLE_INTERVAL_MS) return false;

  recordHeightBrushSample(stroke, sample, time);
  return true;
}

function recordHeightBrushSample(stroke, sample, time) {
  stroke.lastAppliedClientX = sample.clientX;
  stroke.lastAppliedClientY = sample.clientY;
  stroke.lastAppliedAt = time;
}
