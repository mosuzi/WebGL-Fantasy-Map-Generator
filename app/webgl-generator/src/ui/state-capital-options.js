export function buildStateCapitalOptions(map, stateId) {
  return (map?.settlements?.cities || [])
    .filter(city => city?.burgId && Number(city.state) === Number(stateId))
    .sort((a, b) => Number(b.capital) - Number(a.capital) || Number(b.population) - Number(a.population) || Number(a.id) - Number(b.id))
    .map(city => {
      const burgId = Number(city.burgId);
      const burg = map?.pack?.burgs?.[burgId] || (map?.pack?.burgs || []).find(item => Number(item?.i ?? item?.id) === burgId);
      return {
        value: burgId,
        label: readableCityName(city, burg, burgId)
      };
    });
}

function readableCityName(city, burg, burgId) {
  return normalizeName(city?.name) || normalizeName(burg?.name) || `城市 #${burgId}`;
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim() : "";
}
