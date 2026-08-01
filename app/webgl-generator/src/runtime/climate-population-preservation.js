export function captureClimatePopulation(map) {
  return {
    pack: cloneNumericField(map?.pack?.cells?.pop),
    grid: cloneNumericField(map?.grid?.cells?.pop)
  };
}

export function restoreClimatePopulation(map, snapshot) {
  if (!snapshot) return false;
  restoreNumericField(map?.pack?.cells, "pop", snapshot.pack);
  restoreNumericField(map?.grid?.cells, "pop", snapshot.grid);
  return true;
}

function cloneNumericField(value) {
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (Array.isArray(value)) return [...value];
  return value;
}

function restoreNumericField(owner, key, value) {
  if (!owner) return;
  if (value === undefined) delete owner[key];
  else owner[key] = cloneNumericField(value);
}
