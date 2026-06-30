export function createRenderContext(map, {camera = null, canvas = null} = {}) {
  return {map, camera, canvas};
}

export function worldToNdcPoint(context, point) {
  const {map} = context;
  const x = (point[0] / map.metadata.graphWidth) * 2 - 1;
  const y = 1 - (point[1] / map.metadata.graphHeight) * 2;
  return [x, y];
}

export function worldToScreenPixel(context, point) {
  const {camera, canvas} = context;
  if (!camera || !canvas) throw new Error("worldToScreenPixel 需要 camera 和 canvas");
  const [x, y] = worldToNdcPoint(context, point);
  const clipX = x * camera.scale + camera.offsetX;
  const clipY = y * camera.scale + camera.offsetY;
  return {
    x: ((clipX + 1) / 2) * canvas.width,
    y: ((1 - clipY) / 2) * canvas.height
  };
}

export function screenPixelToClip(context, point) {
  const {canvas} = context;
  if (!canvas) throw new Error("screenPixelToClip 需要 canvas");
  return [(point.x / canvas.width) * 2 - 1, 1 - (point.y / canvas.height) * 2];
}
