export function listMapCultures(map) {
  return (map?.society?.cultures || map?.pack?.cultures || []).filter(culture => {
    const id = culture?.i ?? culture?.id;
    return culture && !culture.removed && Number.isInteger(id) && id > 0;
  });
}

export function projectCultureDirectory(map, previous = []) {
  const cultures = listMapCultures(map);
  const same = cultures.length === previous.length && cultures.every((culture, index) =>
    previous[index].id === (culture.i ?? culture.id) && previous[index].name === cultureName(culture));
  if (same) return previous;
  return cultures.map(culture => ({id: culture.i ?? culture.id, name: cultureName(culture)}));
}

function cultureName(culture) {
  return culture.name || culture.root || "未命名文化";
}
