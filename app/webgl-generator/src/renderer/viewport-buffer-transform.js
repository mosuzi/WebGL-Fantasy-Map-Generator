export function snapshotViewportCamera(camera) {
  return Object.freeze({
    scale: positive(camera?.scale, 1),
    offsetX: finite(camera?.offsetX),
    offsetY: finite(camera?.offsetY)
  });
}

export function viewportBufferTransform(bufferCamera, currentCamera) {
  const source = snapshotViewportCamera(bufferCamera);
  const target = snapshotViewportCamera(currentCamera);
  const scale = target.scale / source.scale;
  return Object.freeze({
    scale,
    offsetX: target.offsetX - source.offsetX * scale,
    offsetY: target.offsetY - source.offsetY * scale
  });
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
