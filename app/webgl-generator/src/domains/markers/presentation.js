export function markerPresentationRecords(map) {
  const source = map?.markers?.markers || [];
  const records = [];
  for (let index = 0; index < source.length; index++) if (source[index]) records.push(source[index]);
  return records;
}

export function markerPresentationCount(map) {
  return markerPresentationRecords(map).length;
}
