// Statistics and stale capital pointers are not evidence of ownership. An old
// map can have grid land without a matching packed cell (and vice versa).
export function findLandlessStates(map, candidates) {
  const records = map.politics?.states;
  const ids = new Set();
  for (const id of candidates ?? records?.keys() ?? []) {
    if (Number.isInteger(id) && id > 0 && records?.[id] && !records[id].removed) ids.add(id);
  }
  for (const cells of [map.grid?.cells, map.pack?.cells]) {
    if (!ids.size || !cells?.h?.length || cells.state?.length !== cells.h.length) return new Set();
    for (let i = 0; i < cells.h.length && ids.size; i++) {
      if (cells.h[i] >= 20) ids.delete(cells.state[i]);
    }
  }
  return ids;
}

// Replace only changed records. A stroke can put the exact originals back,
// including distinct pack mirrors and fields that were absent before editing.
export function retireLandlessStates(map, ids, journal = []) {
  if (!ids.size) return;
  const replace = (table, key, value) => {
    journal.push({table, key, before: table[key]});
    table[key] = value;
  };
  for (const states of new Set([map.politics?.states, map.pack?.states])) {
    if (!states) continue;
    for (const id of ids) {
      const s = states[id];
      if (s && !s.removed) replace(states, id, {...s, removed: true, capital: 0, capitalName: "", center: 0, gridCenter: 0,
        cells: 0, area: 0, burgs: 0, urban: 0, rural: 0, neighbors: [], provinces: []});
    }
    for (const s of states) {
      if (s && !s.removed && s.neighbors?.some(id => ids.has(id))) {
        replace(states, s.i ?? s.id, {...s, neighbors: s.neighbors.filter(id => !ids.has(id))});
      }
    }
  }
  for (const provinces of new Set([map.politics?.provinces, map.pack?.provinces])) {
    for (const p of provinces || []) {
      if (p && !p.removed && ids.has(p.state)) replace(provinces, p.i ?? p.id, {...p, removed: true, burg: 0});
    }
  }
  for (const [table, isCity] of [[map.settlements?.cities, true], [map.pack?.burgs, false]]) {
    for (const record of table || []) {
      if (!record || record.removed || !ids.has(record.state)) continue;
      const packCell = isCity ? record.packCell : record.cell;
      const hasPackCell = Number.isInteger(packCell) && packCell >= 0 && packCell < map.pack.cells.h.length;
      const cells = hasPackCell ? map.pack.cells : map.grid.cells;
      const cell = hasPackCell ? packCell : isCity ? record.cell : map.settlements?.cities?.[record.cityId]?.cell;
      const state = cells.h[cell] >= 20 ? cells.state[cell] || 0 : 0;
      const provinceId = cells.province?.[cell] || 0;
      const province = map.politics.provinces?.[provinceId];
      const burgId = isCity ? record.burgId : record.i ?? record.id;
      const capital = Boolean(state && burgId && map.politics.states[state]?.capital === burgId);
      const activeProvince = province && !province.removed && province.state === state;
      replace(table, isCity ? record.id : burgId, {...record, state, province: activeProvince ? provinceId : 0,
        capital: isCity ? capital : Number(capital), ...(isCity ? {provincial: Boolean(activeProvince && province.burg === burgId)} : {})});
    }
  }
  if (map.politics.metadata) {
    const active = list => (list || []).filter(s => s && !s.removed && (s.i ?? s.id) > 0);
    const states = active(map.politics.states), provinces = active(map.politics.provinces);
    replace(map.politics, "metadata", {...map.politics.metadata, states: states.length, stateNames: states.map(s => s.fullName || s.name),
      provinces: provinces.length, provinceNames: provinces.map(p => p.fullName || p.name)});
  }
  if (map.settlements?.metadata) replace(map.settlements, "metadata", {...map.settlements.metadata,
    capitals: (map.settlements.cities || []).filter(c => c?.capital && !c.removed).length});
}

export function migrateLandlessStates(map) {
  const ids = findLandlessStates(map);
  if (!ids.size) return map;
  const politics = {...map.politics, states: map.politics.states.slice(), provinces: map.politics.provinces?.slice()};
  const pack = {...map.pack, burgs: map.pack.burgs?.slice()};
  for (const key of ["states", "provinces"]) {
    pack[key] = map.pack[key] === map.politics[key] ? politics[key] : map.pack[key]?.slice();
  }
  const result = {...map, politics, pack, ...(map.settlements ? {settlements: {...map.settlements, cities: map.settlements.cities?.slice()}} : {})};
  retireLandlessStates(result, ids);
  return result;
}
