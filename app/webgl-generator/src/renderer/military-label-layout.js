export const MILITARY_CITY_LABEL_AVOID_SCALE = 1.25;

export function resolveMilitaryLabelPlacement({
  screen,
  width,
  height,
  cityLabelBoxes = [],
  viewport,
  padding = 4,
  item = null
}) {
  const baseBox = militaryLabelBox(screen, width, height, item);
  const collisions = cityLabelBoxes.filter(box => boxesOverlap(baseBox, box, padding));
  if (!collisions.length) return {screen, box: baseBox, avoided: false, blocked: false};

  const candidates = collisions.flatMap(box => [
    {x: screen.x, y: box.bottom + padding + height * 0.55},
    {x: box.right + padding + width / 2, y: screen.y},
    {x: box.left - padding - width / 2, y: screen.y},
    {x: screen.x, y: box.top - padding - height * 0.45}
  ]);
  for (const candidate of candidates) {
    const box = militaryLabelBox(candidate, width, height, item);
    if (!boxWithinViewport(box, viewport, 4)) continue;
    if (cityLabelBoxes.some(cityBox => boxesOverlap(box, cityBox, padding))) continue;
    return {screen: candidate, box, avoided: true, blocked: false};
  }
  return {screen, box: baseBox, avoided: false, blocked: true};
}

export function militaryLabelBox(screen, width, height, item = null) {
  return {
    left: screen.x - width / 2,
    right: screen.x + width / 2,
    top: screen.y - height * 0.55,
    bottom: screen.y + height * 0.45,
    item
  };
}

function boxesOverlap(left, right, padding) {
  return left.left - padding < right.right && left.right + padding > right.left && left.top - padding < right.bottom && left.bottom + padding > right.top;
}

function boxWithinViewport(box, viewport, margin) {
  if (!viewport) return true;
  return box.left >= margin && box.top >= margin && box.right <= viewport.width - margin && box.bottom <= viewport.height - margin;
}
